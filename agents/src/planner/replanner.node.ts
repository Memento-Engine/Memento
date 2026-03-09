import { PlannerPlan, PlannerStep, PlannerPlanSchema } from "./planner.schema";
import { RunnableConfig } from "@langchain/core/runnables";
import { replanPrompt } from "../prompts/replanPrompt";
import { plannerPrompt } from "../prompts/plannerPrompt";
import { AgentStateType } from "../agentState";
import { validatePlan } from "./planner.validator";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler } from "../utils/parser";
import { PlannerError, ErrorCode } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

/**
 * Find a step by ID in a plan.
 */
function findStepById(plan: PlannerPlan, stepId: string): PlannerStep | undefined {
  return plan.steps.find((s) => s.id === stepId);
}

/**
 * Replace a step in a plan by ID.
 * Returns a new plan with the step replaced.
 */
function replaceStepInPlan(plan: PlannerPlan, stepId: string, newStep: PlannerStep): PlannerPlan {
  return {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? newStep : s)),
  };
}

/**
 * Find all steps that depend on a given step.
 */
function findDependentSteps(plan: PlannerPlan, stepId: string): PlannerStep[] {
  return plan.steps.filter((s) => s.dependsOn.includes(stepId));
}

/**
 * Replanner node: Revises the plan when a step fails.
 * Attempts to recover by modifying only the failing step and dependent steps.
 */
export async function replannerNode(
  state: AgentStateType,
  config?: RunnableConfig
): Promise<AgentStateType> {
  return runWithSpan(
    "agent.node.replanner",
    {
      request_id: state.requestId,
      node: "replanner",
      replan_attempts: state.replanAttempts ?? 0,
    },
    async () => {
      const logger = await createContextLogger(state.requestId, {
        node: "replanner",
        goal: state.goal,
        failedStepId: state.lastFailedStepId,
      });

      logger.info("Replanner node started", {
        replanAttempts: state.replanAttempts ?? 0,
        failedStepId: state.lastFailedStepId,
      });

      const appConfig = await getConfig();

      // Safety check: prevent infinite replanning loops
      const maxReplanAttempts = appConfig.agent.maxReplanAttempts ?? 3;
      const currentReplanAttempts = state.replanAttempts ?? 0;

      if (currentReplanAttempts >= maxReplanAttempts) {
        logger.warn("Maximum replanning attempts reached", {
          currentAttempts: currentReplanAttempts,
          maxAttempts: maxReplanAttempts,
        });

        // Return state indicating we should proceed to final answer with best effort results
        return {
          ...state,
          shouldReplan: false,
          replanAttempts: currentReplanAttempts,
          plannerErrors: `Max replan attempts (${maxReplanAttempts}) reached. Proceeding with best available results.`,
        };
      }

      if (!state.plan || !state.lastFailedStepId) {
        logger.warn("Replanner entered planner-recovery mode", {
          hasPlan: !!state.plan,
          hasFailedStepId: !!state.lastFailedStepId,
          plannerErrors: state.plannerErrors,
        });

        try {
          const prompt = await plannerPrompt.invoke({
            goal: state.goal,
            previousErrors: state.plannerErrors ?? state.failureReason ?? "",
          });

          const llmInvocation = await invokeRoleLlm({
            role: "planner",
            prompt,
            requestId: state.requestId,
            spanName: "agent.node.replanner.recover_planner",
            spanAttributes: {
              node: "replanner",
              mode: "planner_recovery",
              replan_attempts: currentReplanAttempts + 1,
            },
          });

          const parsedContent = await SafeJsonParser.parseContent(llmInvocation.response.content);
          const parsed = parsedContent as any;
          const rawPlan = (parsed?.plannerPlan ?? parsed) as PlannerPlan;
          const executionPlan = parsed?.executionPlan;
          const needsClarification = parsed?.needsClarification;
          const clarificationQuestion = parsed?.clarificationQuestion;

          const validation = validatePlan(rawPlan);
          if (!validation.valid) {
            throw new PlannerError(`Planner recovery validation failed: ${validation.error}`, {
              validation: validation.error,
            });
          }

          const recoveredPlan = validation.data;

          logger.info("Planner recovery succeeded", {
            stepCount: recoveredPlan.steps.length,
            stepIds: recoveredPlan.steps.map((s) => s.id),
          });

          return {
            ...state,
            previousPlan: state.plan,
            plan: recoveredPlan,
            executionPlan,
            needsClarification,
            clarificationQuestion,
            shouldReplan: false,
            replanAttempts: currentReplanAttempts + 1,
            llmCalls: (state.llmCalls ?? 0) + 1,
            currentStep: 0,
            lastFailedStepId: undefined,
            failureReason: undefined,
            plannerErrors: "",
          };
        } catch (recoveryError) {
          const plannerRecoveryError = ErrorHandler.toAgentError(
            recoveryError,
            ErrorCode.PLANNER_FAILED,
            {
              goal: state.goal,
              mode: "planner_recovery",
              replanAttempts: currentReplanAttempts + 1,
            }
          );

          logger.error("Planner recovery failed in replanner", recoveryError, {
            error: plannerRecoveryError.code,
            message: plannerRecoveryError.message,
          });

          throw plannerRecoveryError;
        }
      }

      const failedStep = findStepById(state.plan, state.lastFailedStepId);
      if (!failedStep) {
        throw new PlannerError(`Failed step ${state.lastFailedStepId} not found in plan`, {
          stepId: state.lastFailedStepId,
        });
      }

      try {
        // Get the execution result for the failed step
        const failedStepResult = state.stepResults?.[state.lastFailedStepId];

        logger.info("Analyzing failure context", {
          stepId: state.lastFailedStepId,
          stepKind: failedStep.kind,
          resultLength: Array.isArray(failedStepResult)
            ? failedStepResult.length
            : failedStepResult
              ? "non-array"
              : "empty",
        });

        const prompt = await replanPrompt.invoke({
          goal: state.goal,
          previousPlan: JSON.stringify(state.plan, null, 2),
          failedStep: JSON.stringify(failedStep, null, 2),
          executionResult: JSON.stringify(failedStepResult ?? "empty", null, 2),
          failureReason: state.failureReason ?? "Unknown",
        });

        const llmInvocation = await invokeRoleLlm({
          role: "planner",
          prompt,
          requestId: state.requestId,
          spanName: "agent.node.replanner.llm",
          spanAttributes: {
            node: "replanner",
            replan_attempts: currentReplanAttempts + 1,
          },
        });

        const parsedContent = await SafeJsonParser.parseContent(llmInvocation.response.content);

        logger.info("Replanner LLM response parsed", {
          stepCount: parsedContent?.steps?.length ?? 0,
        });

        const rawPlan = parsedContent as PlannerPlan;

        const validation = validatePlan(rawPlan);

        if (!validation.valid) {
          logger.warn("Revised plan validation failed", {
            error: validation.error,
            attempt: currentReplanAttempts + 1,
          });

          throw new PlannerError(`Revised plan validation failed: ${validation.error}`, {
            validation: validation.error,
          });
        }

        const revisedPlan = validation.data;

        logger.info("Revised plan created successfully", {
          stepCount: revisedPlan.steps.length,
          stepIds: revisedPlan.steps.map((s) => s.id),
        });

        // Determine where to resume execution
        // Find the index of the failed step in the new plan
        const revisedFailedStepIndex = revisedPlan.steps.findIndex(
          (s) => s.id === state.lastFailedStepId
        );

        if (revisedFailedStepIndex === -1) {
          logger.warn("Failed step not found in revised plan - starting from beginning");
        }

        return {
          ...state,
          previousPlan: state.plan,
          plan: revisedPlan,
          shouldReplan: false,
          replanAttempts: currentReplanAttempts + 1,
          llmCalls: (state.llmCalls ?? 0) + 1,
          // Reset execution to the failed step index to retry with the new plan
          currentStep: Math.max(0, revisedFailedStepIndex),
          // Clear the failure reason now that we've replanned
          lastFailedStepId: undefined,
          failureReason: undefined,
          plannerErrors: "",
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(error, ErrorCode.PLANNER_FAILED, {
          goal: state.goal,
          failedStepId: state.lastFailedStepId,
          replanAttempts: currentReplanAttempts + 1,
        });

        logger.error("Replanner node failed", error, {
          error: agentError.code,
          message: agentError.message,
          replanAttempts: currentReplanAttempts + 1,
        });

        throw agentError;
      }
    }
  );
}
