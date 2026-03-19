import { AgentStateType } from "../agentState";
import { Plan, PlanStep } from "../planner/plan.schema";
import { buildSchedule } from "../scheduler/scheduler";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { ErrorHandler } from "../utils/parser";
import { ExecutorError, ToolError, ErrorCode } from "../types/errors";
import { emitStepEvent, emitError } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { captureAgentException } from "../telemetry/sentry";
import { reactExecutorNode } from "./react.node";
import { StepResult, buildStepBrief } from "../types/stepResult";

/**
 * Build dependency context for a step using DAG-scoped rules:
 * - Direct dependencies: full StepResult
 * - Transitive ancestors: one-line brief
 */
function buildDepContext(
  step: PlanStep,
  allSteps: PlanStep[],
  stepResults: Record<string, StepResult>,
): Record<string, unknown> {
  const directDeps = new Set(step.dependsOn);
  const context: Record<string, unknown> = {};

  // Collect all transitive ancestors
  const transitive = new Set<string>();
  const queue = [...step.dependsOn];
  while (queue.length > 0) {
    const depId = queue.shift()!;
    const depStep = allSteps.find(s => s.id === depId);
    if (depStep) {
      for (const ancestorId of depStep.dependsOn) {
        if (!transitive.has(ancestorId) && !directDeps.has(ancestorId)) {
          transitive.add(ancestorId);
          queue.push(ancestorId);
        }
      }
    }
  }

  // Direct deps get full result
  for (const depId of directDeps) {
    const result = stepResults[depId];
    if (result) {
      context[depId] = result;
    }
  }

  // Transitive ancestors get one-line brief
  for (const ancestorId of transitive) {
    const result = stepResults[ancestorId];
    if (result) {
      context[ancestorId] = buildStepBrief(result);
    }
  }

  return context;
}

export async function executorNodeV2(
  state: AgentStateType,
): Promise<AgentStateType> {
  return runWithSpan(
    "agent.node.executor",
    { request_id: state.requestId, node: "executor" },
    async () => {
      const logger = await createContextLogger(state.requestId, { node: "executor" });
      const startMs = Date.now();
      logger.info("Executor node started");

      const plan = state.plan as Plan | undefined;
      if (!plan?.steps?.length) {
        throw new ExecutorError("Plan has no steps", { plan: plan ? "empty" : "undefined" });
      }

      const config = await getConfig();
      const stepResults: Record<string, StepResult> = { ...(state.stepResults ?? {}) };
      let llmCalls = state.llmCalls ?? 0;
      const maxLlmCalls = config.agent.maxLlmCalls;
      const maxRuntimeMs = config.agent.maxRuntimeMs;
      const maxConcurrency = 3;

      const schedule = buildSchedule(plan);

      logger.info("Execution schedule built", {
        levels: schedule.levels.length,
        totalSteps: schedule.totalSteps,
      });

      try {
        for (let levelIdx = 0; levelIdx < schedule.levels.length; levelIdx++) {
          const level = schedule.levels[levelIdx];

          if (Date.now() - startMs > maxRuntimeMs) {
            logger.warn("Runtime budget exceeded", { maxRuntimeMs, elapsedMs: Date.now() - startMs });
          }
          if (llmCalls >= maxLlmCalls) {
            logger.warn("LLM call budget exceeded", { maxLlmCalls, llmCalls });
          }

          const executableSteps = level.filter(s => s.kind !== "final");
          if (executableSteps.length === 0) continue;


          // Run steps in batches with concurrency cap
          const batches: PlanStep[][] = [];
          for (let i = 0; i < executableSteps.length; i += maxConcurrency) {
            batches.push(executableSteps.slice(i, i + maxConcurrency));
          }

          for (const batch of batches) {
            const promises = batch.map(async (step) => {
              // Verify dependencies resolved
              for (const dep of step.dependsOn) {
                if (!(dep in stepResults)) {
                  throw new ExecutorError(
                    `Step "${step.id}" dependency not resolved: "${dep}"`,
                    { stepId: step.id, missingDependency: dep },
                  );
                }
              }

              // DAG-scoped context
              const depContext = buildDepContext(step, plan.steps, stepResults);

              try {
                const { stepResult, llmCalls: stepLlmCalls } = await reactExecutorNode(
                  state,
                  step,
                  depContext,
                  stepResults,
                );

                logger.info("Step completed", {
                  stepId: step.id,
                  status: stepResult.status,
                  evidenceCount: stepResult.evidenceChunkIds.length,
                  confidence: stepResult.confidence,
                });

                stepResults[step.id] = stepResult;
                llmCalls += stepLlmCalls;

                return { stepId: step.id, success: true as const };
              } catch (error) {
                const errMsg = ErrorHandler.getSafeMessage(error);

                captureAgentException(error, {
                  message: "Agent step execution failed",
                  level: "error",
                  tags: { area: "executor", stepId: step.id, stepKind: step.kind },
                  extra: { stepGoal: step.stepGoal, requestId: state.requestId },
                });

                logger.error("Step failed", error, { stepId: step.id });

                emitStepEvent(state.requestId, {
                  stepType: step.kind === "search" ? "searching" : "reasoning",
                  stepId: step.id,
                  title: "Step encountered an issue",
                  status: "failed",
                });

                return { stepId: step.id, success: false as const, error: errMsg };
              }
            });

            const results = await Promise.allSettled(promises);

            for (const settled of results) {
              if (settled.status === "rejected") {
                const failMsg = settled.reason instanceof Error
                  ? settled.reason.message
                  : String(settled.reason);
                logger.error("Step promise rejected", undefined, { error: failMsg });
                emitError(failMsg, ErrorCode.EXECUTOR_FAILED, state.requestId, true);
              } else if (!settled.value.success) {
                const failedId = settled.value.stepId;
                const hasDependents = plan.steps.some(s => s.dependsOn.includes(failedId));

                if (hasDependents) {
                  logger.warn("Critical step failed", { stepId: failedId });
                  emitError(
                    `Step "${failedId}" failed: ${settled.value.error}`,
                    ErrorCode.EXECUTOR_FAILED,
                    state.requestId,
                    false,
                  );
                  // Continue with partial results rather than blocking
                }
              }
            }
          }
        }

        const durationMs = Date.now() - startMs;
        logger.info("Executor completed", {
          durationMs,
          completedSteps: Object.keys(stepResults).length,
          totalSteps: plan.steps.length,
          llmCalls,
        });

        return {
          ...state,
          stepResults,
          llmCalls,
        };
      } catch (error) {
        if (error instanceof ToolError) {
          captureAgentException(error, {
            message: "Tool error during executor run",
            level: "error",
            tags: { area: "executor", type: "tool" },
          });
          logger.error("Tool error during execution", error);
          throw error;
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
          tags: { area: "executor", type: "unhandled" },
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
