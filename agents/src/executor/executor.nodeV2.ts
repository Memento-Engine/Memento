import { AgentStateType } from "../agentState";
import { Plan, PlanStep, StepOutput } from "../planner/plan.schema";
import { buildSchedule } from "../scheduler/scheduler";
import { buildSearchQuery, DependencyData } from "./queryBuilder";
import { extractStepOutput } from "./extractor";
import { ResolvedQuery } from "./query.schema";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { ErrorHandler, withTimeout } from "../utils/parser";
import { getToolRegistry } from "../tools/registry";
import {
  ExecutorError,
  ToolError,
  ErrorCode,
  AgentError,
} from "../types/errors";
import { ToolContext } from "../types/tools";
import { emitStepEvent, emitError } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";
import { SafeJsonParser } from "../utils/parser";
import { extractorPromptV2 } from "../prompts/extractorPromptV2";
import { reactExecutorNode } from "./react.node";

/*
============================================================
EXECUTOR NODE (v2)
============================================================

Orchestrates step execution using the task scheduler.
Per-level: runs independent steps in parallel (with concurrency cap).
Per search step:
  1. Build concrete DB query (LLM + Zod validation)
  2. Run search tool
  3. If empty → retry with relaxed query (model fallback)
  4. Extract expected output
  5. Store in global state

Per reason step:
  1. Gather dependency data
  2. LLM reasoning call
  3. Validate output shape
  4. Store in global state
============================================================
*/

// ── Helpers ──────────────────────────────────────────────

/**
 * Get or generate a default expectedOutput for a step.
 * If step has no expectedOutput, derive sensible defaults based on step kind.
 */
function getExpectedOutput(step: PlanStep): StepOutput {
  if (step.expectedOutput) {
    return step.expectedOutput;
  }

  // Generate default based on step kind
  switch (step.kind) {
    case "search":
      return {
        type: "table",
        variableName: `${step.id}_results`,
        description: step.stepGoal || step.intent,
      };
    case "reason":
      return {
        type: "object",
        variableName: `${step.id}_analysis`,
        description: step.stepGoal || step.intent,
      };
    case "final":
      return {
        type: "value",
        variableName: "final_answer",
        description: step.stepGoal || step.intent,
      };
    default: {
      // Fallback for any future step types
      const s = step as PlanStep;
      return {
        type: "table",
        variableName: `${s.id}_output`,
        description: s.intent,
      };
    }
  }
}

function isEmptyResult(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === "object")
    return Object.keys(result as object).length === 0;
  if (typeof result === "string") return result.trim().length === 0;
  return false;
}

type ThinkingSearchRow = {
  app_name: string;
  window_name: string;
  image_path: string;
  captured_at: string;
};

function toThinkingSearchResults(rows: unknown[]): ThinkingSearchRow[] {
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row: any) => ({
      app_name: String(row.app_name ?? ""),
      window_name: String(row.window_name ?? row.window_title ?? ""),
      image_path: String(row.image_path ?? ""),
      captured_at: String(row.captured_at ?? ""),
    }));
}

function gatherDependencies(
  step: PlanStep,
  plan: Plan,
  stepResults: Record<string, unknown>,
): DependencyData[] {
  return step.dependsOn.map((depId) => {
    const depStep = plan.steps.find((s) => s.id === depId);
    if (!depStep) {
      throw new ExecutorError(`Dependency "${depId}" not found in plan`, {
        stepId: step.id,
      });
    }
    const expectedOutput = getExpectedOutput(depStep);
    return {
      stepId: depId,
      variableName: expectedOutput.variableName,
      data: stepResults[depId],
    };
  });
}

// ── Search Step Execution ────────────────────────────────

async function executeSearchStep(
  step: PlanStep & { kind: "search" },
  plan: Plan,
  stepResults: Record<string, unknown>,
  state: AgentStateType,
  logger: any,
): Promise<{ result: unknown; llmCallsUsed: number }> {
  const config = await getConfig();
  const toolRegistry = await getToolRegistry();
  const searchTool = toolRegistry.getOrThrow("search");

  const deps = gatherDependencies(step, plan, stepResults);

  // 1. Build concrete query
  const { query, llmCallsUsed: builderCalls } = await buildSearchQuery(
    step,
    deps,
    step.stepGoal ?? step.intent,
    state.requestId,
  );

  query.includeTextLayout = false; // default off, can be toggled

  logger.info("Query built", {
    stepId: step.id,
    semanticQuery: query.semanticQuery,
    builderCalls,
  });

  // 2. Execute search tool
  const toolContext: ToolContext = {
    requestId: state.requestId,
    stepId: step.id,
    attemptNumber: 1,
    timeout: config.agent.stepTimeoutMs,
  };

  let toolResult = await withTimeout(
    searchTool.execute(query as any, toolContext),
    config.agent.stepTimeoutMs,
    `Search tool timeout (${config.agent.stepTimeoutMs}ms)`,
  );

  let dbResults = toolResult.success ? (toolResult.data ?? []) : [];

  // 3. Retry with relaxed query if empty
  if (
    toolResult.success &&
    Array.isArray(dbResults) &&
    dbResults.length === 0
  ) {
    logger.warn("Search returned empty — retrying with relaxed query", {
      stepId: step.id,
    });

    const relaxedQuery: ResolvedQuery = {
      ...query,
      filter: undefined, // Remove all filters
      keywords: [],
      limit: Math.min(query.limit * 2, 40),
    };

    const retryResult = await withTimeout(
      searchTool.execute(relaxedQuery as any, {
        ...toolContext,
        attemptNumber: 2,
      }),
      config.agent.stepTimeoutMs,
      `Search tool retry timeout`,
    );

    if (
      retryResult.success &&
      Array.isArray(retryResult.data) &&
      retryResult.data.length > 0
    ) {
      dbResults = retryResult.data;
      logger.info("Relaxed retry succeeded", {
        stepId: step.id,
        rowCount: dbResults.length,
      });
    }
  }

  if (!toolResult.success && dbResults.length === 0) {
    console.log("Search tool failed custom", toolResult.error);
    throw new ToolError(`Search tool failed: ${toolResult.error}`, {
      stepId: step.id,
      tool: "search",
    });
  }

  logger.info("Search complete", {
    stepId: step.id,
    rowCount: dbResults.length,
  });

  // 4. Extract expected output
  const { data: extracted, llmCallsUsed: extractorCalls } =
    await extractStepOutput(step, dbResults, deps, state.requestId);

  return {
    result: extracted,
    llmCallsUsed: builderCalls + extractorCalls,
  };
}

// ── Reason Step Execution ────────────────────────────────

async function executeReasonStep(
  step: PlanStep & { kind: "reason" },
  plan: Plan,
  stepResults: Record<string, unknown>,
  state: AgentStateType,
  logger: any,
): Promise<{ result: unknown; llmCallsUsed: number }> {
  return runWithSpan(
    "agent.executor.reason_step",
    {
      request_id: state.requestId,
      step_id: step.id,
    },
    async () => {
      const deps = gatherDependencies(step, plan, stepResults);
      const expectedOutput = getExpectedOutput(step);

      const depContext =
        deps.length > 0
          ? deps
              .map(
                (d) =>
                  `- ${d.variableName} (from ${d.stepId}): ${JSON.stringify(d.data, null, 2)}`,
              )
              .join("\n")
          : "(none)";

      const prompt = await extractorPromptV2.invoke({
        intent: step.intent,
        searchResults: "(this is a reasoning step — no search results)",
        dependencyData: depContext,
        outputType: expectedOutput.type,
        variableName: expectedOutput.variableName,
        outputDescription: expectedOutput.description,
      });

      const llmResult = await invokeRoleLlm({
        role: "executor",
        prompt,
        requestId: state.requestId,
        spanName: "agent.executor.reason_step.llm",
        spanAttributes: { step_id: step.id },
      });

      const parsed = await SafeJsonParser.parseContent(
        llmResult.response.content,
      );

      logger.info("Reasoning step complete", {
        stepId: step.id,
        outputType: expectedOutput.type,
      });

      return { result: parsed, llmCallsUsed: 1 };
    },
  );
}

// ── Main Executor Node ───────────────────────────────────

export async function executorNodeV2(
  state: AgentStateType,
): Promise<AgentStateType> {
  return runWithSpan(
    "agent.node.executor",
    {
      request_id: state.requestId,
      node: "executor",
    },
    async () => {
      const logger = await createContextLogger(state.requestId, {
        node: "executor",
      });

      const startMs = Date.now();
      logger.info("Executor node started");

      const plan = state.plan as Plan | undefined;

      if (!plan?.steps?.length) {
        throw new ExecutorError("Plan has no steps", {
          plan: plan ? "empty" : "undefined",
        });
      }

      const config = await getConfig();
      const stepResults: Record<string, unknown> = {
        ...(state.stepResults ?? {}),
      };
      const stepErrors: Record<string, string> = {
        ...(state.stepErrors ?? {}),
      };
      let llmCalls = state.llmCalls ?? 0;
      const maxLlmCalls = config.agent.maxLlmCalls;
      const maxRuntimeMs = config.agent.maxRuntimeMs;
      const maxConcurrency = 3; // Cap parallel execution

      // Build schedule
      const schedule = buildSchedule(plan);

      logger.info("Execution schedule built", {
        levels: schedule.levels.length,
        totalSteps: schedule.totalSteps,
      });

      try {
        for (let levelIdx = 0; levelIdx < schedule.levels.length; levelIdx++) {
          const level = schedule.levels[levelIdx];

          // Budget checks
          if (Date.now() - startMs > maxRuntimeMs) {
            logger.warn("Runtime budget exceeded — returning partial results", {
              maxRuntimeMs,
              elapsedMs: Date.now() - startMs,
            });
            // break;
          }

          if (llmCalls >= maxLlmCalls) {
            logger.warn(
              "LLM call budget exceeded — returning partial results",
              {
                maxLlmCalls,
                llmCalls,
              },
            );
            // break;
          }

          // Skip the "final" step — that's handled by finalAnswerNode
          const executableSteps = level.filter((s) => s.kind !== "final");

          if (executableSteps.length === 0) continue;

          logger.info("Executing level", {
            level: levelIdx,
            stepCount: executableSteps.length,
            stepIds: executableSteps.map((s) => s.id),
          });

          // Run steps in this level concurrently (with cap)
          const batches: PlanStep[][] = [];
          for (let i = 0; i < executableSteps.length; i += maxConcurrency) {
            batches.push(executableSteps.slice(i, i + maxConcurrency));
          }

          for (const batch of batches) {
            const promises = batch.map(async (step) => {
              // Verify dependencies are resolved
              for (const dep of step.dependsOn) {
                if (!(dep in stepResults)) {
                  throw new ExecutorError(
                    `Step "${step.id}" dependency not resolved: "${dep}"`,
                    {
                      stepId: step.id,
                      missingDependency: dep,
                    },
                  );
                }
              }

            

              try {
                const stepResult = await reactExecutorNode(state, step);

                logger.info("Got Result from Execution Node", {
                  stepGoal: step.stepGoal,
                  resultSummary: stepResult.stepResults?.react_summary,
                });

                // Store chunks and data - final LLM will synthesize answer
                stepResults[step.id] = stepResult.stepResults ?? null;
                llmCalls += stepResult.llmCalls ?? 0;

                return { stepId: step.id, success: true as const };
              } catch (error) {
                const errMsg = ErrorHandler.getSafeMessage(error);
                stepErrors[step.id] = errMsg;

                logger.error("Step failed", error, {
                  stepId: step.id,
                });

                // Emit step failure event with clear message
                emitStepEvent(state.requestId, {
                  stepType: step.kind === "search" ? "searching" : "reasoning",
                  stepId: step.id,
                  title: "I'm having trouble with this step. I'll keep trying.",
                  status: "failed",
                });

                return {
                  stepId: step.id,
                  success: false as const,
                  error: errMsg,
                };
              }
            });

            const results = await Promise.allSettled(promises);

            // Check if any critical step failed (one with dependents)
            for (const settled of results) {
              if (settled.status === "rejected") {
                const failMsg =
                  settled.reason instanceof Error
                    ? settled.reason.message
                    : String(settled.reason);
                logger.error("Step promise rejected", undefined, {
                  error: failMsg,
                });
                // Emit error for rejected promises
                emitError(
                  failMsg,
                  ErrorCode.EXECUTOR_FAILED,
                  state.requestId,
                  true,
                );
              } else if (!settled.value.success) {
                const failedId = settled.value.stepId;
                const hasDependents = plan.steps.some((s) =>
                  s.dependsOn.includes(failedId),
                );

                if (hasDependents) {
                  logger.warn("Critical step failed — triggering replan", {
                    stepId: failedId,
                  });

                  // Emit error event for critical failures
                  emitError(
                    `Step "${failedId}" failed: ${settled.value.error}`,
                    ErrorCode.EXECUTOR_FAILED,
                    state.requestId,
                    false, // Not a system error - could be retried
                  );

                  return {
                    ...state,
                    stepResults,
                    stepErrors:
                      Object.keys(stepErrors).length > 0
                        ? stepErrors
                        : undefined,
                    shouldReplan: true,
                    lastFailedStepId: failedId,
                    failureReason: `Step "${failedId}" failed: ${settled.value.error}`,
                    llmCalls,
                  };
                }
              }
            }
          }
        }

        // Check if any search returned data
        const hasAnyResults = Object.values(stepResults).some(
          (r) => r && (!Array.isArray(r) || r.length > 0),
        );

        const durationMs = Date.now() - startMs;
        logger.info("Executor completed", {
          durationMs,
          completedSteps: Object.keys(stepResults).length,
          totalSteps: plan.steps.length,
          llmCalls,
        });

        return {
          ...state,
          stepResults: stepResults as Record<string, any>,
          stepErrors:
            Object.keys(stepErrors).length > 0 ? stepErrors : undefined,
          currentStep: plan.steps.length,
          hasSearchResults: hasAnyResults,
          llmCalls,
        };
      } catch (error) {
        if (error instanceof ToolError) {
          logger.error("Tool error during execution", error);
          throw error; // rethrow known tool errors for specific handling
        }

        const agentError = ErrorHandler.toAgentError(
          error,
          ErrorCode.EXECUTOR_FAILED,
          {
            completedSteps: Object.keys(stepResults).length,
            totalSteps: plan.steps.length,
          },
        );

        logger.error("Executor node failed", agentError);
        throw agentError;
      }
    },
  );
}
