import { AgentStateType } from "../agentState";
import { Plan, PlanStep,  } from "../planner/plan.schema";
import { buildSchedule } from "../scheduler/scheduler";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { ErrorHandler, withTimeout } from "../utils/parser";
import {
  ExecutorError,
  ToolError,
  ErrorCode,
} from "../types/errors";
import { emitStepEvent, emitError } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { captureAgentException } from "../telemetry/sentry";

import { reactExecutorNode } from "./react.node";
import { 
  getProvenanceRegistry,
  ProvenanceSummary,
  formatSummariesForContext,
} from "../provenance";

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

              // Build depContext from provenance summaries (not raw data!)
              const depContext: Record<string, any> = {};
              const registry = getProvenanceRegistry(state.requestId);
              
              for (const depId of step.dependsOn) {
                const depResult = stepResults[depId] as Record<string, any> | undefined;
                if (depResult && typeof depResult === 'object') {
                  // Get compressed summary from step result
                  const summary = depResult.compressed_summary as ProvenanceSummary | undefined;
                  
                  if (summary) {
                    // Pass compressed summary, not raw data
                    const chunkIds = depResult.chunk_ids as string[] | undefined;
                    depContext[depId] = {
                      provenance_id: depResult.provenance_id,
                      summary: summary.summary,
                      record_count: summary.record_count,
                      by_app: summary.by_app,
                      time_range: summary.time_range,
                      topics: summary.topics,
                      // Flag that raw data is available if needed
                      chunk_ids_available: chunkIds && chunkIds.length > 0,
                    };
                  } else {
                    // Fallback for backward compatibility
                    depContext[depId] = depResult.react_summary ?? depResult;
                  }
                }
              }

              try {
                const stepResult = await reactExecutorNode(state, step, depContext);

                logger.info("Got Result from Execution Node", {
                  stepGoal: step.stepGoal,
                  provenanceId: stepResult.stepResults?.provenance_id,
                  recordCount: stepResult.stepResults?.compressed_summary?.record_count,
                });

                // Store compressed results - final LLM will synthesize answer
                stepResults[step.id] = stepResult.stepResults ?? null;
                llmCalls += stepResult.llmCalls ?? 0;

                return { stepId: step.id, success: true as const };
              } catch (error) {
                const errMsg = ErrorHandler.getSafeMessage(error);
                stepErrors[step.id] = errMsg;

                captureAgentException(error, {
                  message: "Agent step execution failed",
                  level: "error",
                  tags: {
                    area: "executor",
                    stepId: step.id,
                    stepKind: step.kind,
                  },
                  extra: {
                    stepGoal: step.stepGoal,
                    requestId: state.requestId,
                  },
                });

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
          captureAgentException(error, {
            message: "Tool error during executor run",
            level: "error",
            tags: {
              area: "executor",
              type: "tool",
            },
          });
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

        captureAgentException(error, {
          message: "Executor node failed",
          level: "fatal",
          tags: {
            area: "executor",
            type: "unhandled",
          },
          extra: {
            completedSteps: Object.keys(stepResults).length,
            totalSteps: plan.steps.length,
            requestId: state.requestId,
          },
        });

        logger.error("Executor node failed", agentError);
        throw agentError;
      }
    },
  );
}
