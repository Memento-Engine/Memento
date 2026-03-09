import { ChatOpenAI } from "@langchain/openai";
import { PlannerPlan, PlannerStep, PlannerPlanSchema } from "./planner.schema";
import { RunnableConfig } from "@langchain/core/runnables";
import { replanPrompt } from "../prompts/replanPrompt";
import { AgentStateType } from "../agentState";
import { validatePlan } from "./planner.validator";
import { getLLM } from "./planner.node";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler, withRetry } from "../utils/parser";
import { PlannerError, ErrorCode } from "../types/errors";
import { runWithSpan } from "../telemetry/tracing";

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
function replaceStepInPlan(
  plan: PlannerPlan,
  stepId: string,
  newStep: PlannerStep,
): PlannerPlan {
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
  config?: RunnableConfig,
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

  const llm = await getLLM();
  const appConfig = await getConfig();

  // Safety check: prevent infinite replanning loops
  const maxReplanAttempts = appConfig.agent.maxReplanAttempts ?? 3;
  const currentReplanAttempts = (state.replanAttempts ?? 0);

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
    throw new PlannerError("Replanner called without plan or failed step ID", {
      hasPlan: !!state.plan,
      hasFailedStepId: !!state.lastFailedStepId,
    });
  }

  const failedStep = findStepById(state.plan, state.lastFailedStepId);
  if (!failedStep) {
    throw new PlannerError(
      `Failed step ${state.lastFailedStepId} not found in plan`,
      { stepId: state.lastFailedStepId },
    );
  }

  try {
    // Get the execution result for the failed step
    const failedStepResult = state.stepResults?.[state.lastFailedStepId];

    logger.info("Analyzing failure context", {
      stepId: state.lastFailedStepId,
      stepKind: failedStep.kind,
      resultLength: Array.isArray(failedStepResult)
        ? failedStepResult.length
        : failedStepResult ? "non-array" : "empty",
    });

    // Attempt to generate revised plan with retries
    const revisedPlan = await withRetry(
      async () => {
        const prompt = await replanPrompt.invoke({
          goal: state.goal,
          previousPlan: JSON.stringify(state.plan, null, 2),
          failedStep: JSON.stringify(failedStep, null, 2),
          executionResult: JSON.stringify(failedStepResult ?? "empty", null, 2),
          failureReason: state.failureReason ?? "Unknown",
        });

        const response = await runWithSpan(
          "agent.node.replanner.llm",
          {
            request_id: state.requestId,
            node: "replanner",
            replan_attempts: currentReplanAttempts + 1,
          },
          async () => llm.invoke(prompt),
        );
        const parsedContent = await SafeJsonParser.parseContent(response.content);

        logger.info("Replanner LLM response parsed", {
          stepCount: parsedContent?.steps?.length ?? 0,
        });

        const rawPlan = parsedContent as PlannerPlan;

        // Validate revised plan structure
        const validation = validatePlan(rawPlan);

        if (!validation.valid) {
          logger.warn("Revised plan validation failed", {
            error: validation.error,
            attempt: currentReplanAttempts + 1,
          });

          throw new PlannerError(
            `Revised plan validation failed: ${validation.error}`,
            { validation: validation.error },
          );
        }

        return validation.data;
      },
      {
        maxAttempts: appConfig.agent.maxPlanRetries,
        initialDelayMs: 100,
        maxDelayMs: 1000,
      },
    );

    logger.info("Revised plan created successfully", {
      stepCount: revisedPlan.steps.length,
      stepIds: revisedPlan.steps.map((s) => s.id),
    });

    // Determine where to resume execution
    // Find the index of the failed step in the new plan
    const revisedFailedStepIndex = revisedPlan.steps.findIndex(
      (s) => s.id === state.lastFailedStepId,
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
      // Reset execution to the failed step index to retry with the new plan
      currentStep: Math.max(0, revisedFailedStepIndex),
      // Clear the failure reason now that we've replanned
      lastFailedStepId: undefined,
      failureReason: undefined,
      plannerErrors: "",
    };
  } catch (error) {
    const agentError = ErrorHandler.toAgentError(
      error,
      ErrorCode.PLANNER_FAILED,
      {
        goal: state.goal,
        failedStepId: state.lastFailedStepId,
        replanAttempts: currentReplanAttempts + 1,
      },
    );

    logger.error("Replanner node failed", error, {
      error: agentError.code,
      message: agentError.message,
      replanAttempts: currentReplanAttempts + 1,
    });

    throw agentError;
  }
    },
  );
}
