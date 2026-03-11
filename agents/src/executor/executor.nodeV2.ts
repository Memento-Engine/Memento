import { AgentStateType } from "../agentState";
import { Plan, PlanStep } from "../planner/plan.schema";
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
    return {
      stepId: depId,
      variableName: depStep.expectedOutput.variableName,
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
    state.goal,
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
      limit: Math.min(query.limit * 2, 100),
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
        outputType: step.expectedOutput.type,
        variableName: step.expectedOutput.variableName,
        outputDescription: step.expectedOutput.description,
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
        outputType: step.expectedOutput.type,
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
            break;
          }

          if (llmCalls >= maxLlmCalls) {
            logger.warn(
              "LLM call budget exceeded — returning partial results",
              {
                maxLlmCalls,
                llmCalls,
              },
            );
            break;
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

              emitStepEvent(
                step.id,
                step.kind === "search" ? "searching" : "reasoning",
                step.kind === "search"
                  ? "Searching your memories"
                  : "Evaluating information",
                "running",
                state.requestId,
                { description: step.intent },
              );

              try {
                let stepResult: { result: unknown; llmCallsUsed: number };

                if (step.kind === "search") {
                  stepResult = await executeSearchStep(
                    step as PlanStep & { kind: "search" },
                    plan,
                    stepResults,
                    state,
                    logger,
                  );
                } else {
                  // reason step
                  stepResult = await executeReasonStep(
                    step as PlanStep & { kind: "reason" },
                    plan,
                    stepResults,
                    state,
                    logger,
                  );
                }

                stepResults[step.id] = stepResult.result;
                llmCalls += stepResult.llmCallsUsed;

                const resultEmpty = isEmptyResult(stepResult.result);

                if (step.kind === "search") {
                  const rows = Array.isArray(stepResult.result)
                    ? stepResult.result
                    : [];
                  const thinkingResults = toThinkingSearchResults(rows);
                  emitStepEvent(
                    step.id,
                    "searching",
                    resultEmpty
                      ? "No results found"
                      : `Found ${thinkingResults.length} results`,
                    "completed",
                    state.requestId,
                    {
                      description: resultEmpty
                        ? "No matching records"
                        : `Found ${thinkingResults.length} relevant result(s)`,
                      results: thinkingResults,
                      resultCount: thinkingResults.length,
                    },
                  );
                } else {
                  emitStepEvent(
                    step.id,
                    "reasoning",
                    "Evaluation complete",
                    "completed",
                    state.requestId,
                    { description: "Verified relevant details" },
                  );
                }

                logger.info("Step completed", {
                  stepId: step.id,
                  kind: step.kind,
                  isEmpty: resultEmpty,
                  llmCallsUsed: stepResult.llmCallsUsed,
                });

                return { stepId: step.id, success: true as const };
              } catch (error) {
                const errMsg = ErrorHandler.getSafeMessage(error);
                stepErrors[step.id] = errMsg;

                logger.error("Step failed", error, {
                  stepId: step.id,
                });

                emitStepEvent(
                  step.id,
                  step.kind === "search" ? "searching" : "reasoning",
                  "Trying again",
                  "failed",
                  state.requestId,
                  { description: "Checking additional sources" },
                );

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
              } else if (!settled.value.success) {
                const failedId = settled.value.stepId;
                const hasDependents = plan.steps.some((s) =>
                  s.dependsOn.includes(failedId),
                );

                if (hasDependents) {
                  logger.warn("Critical step failed — triggering replan", {
                    stepId: failedId,
                  });

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
