import { ChatOpenAI } from "@langchain/openai";
import { PlannerPlan, PlannerPlanSchema } from "./planner.schema";
import { RunnableConfig } from "@langchain/core/runnables";
import { plannerPrompt } from "../prompts/plannerPrompt";
import { AgentStateType } from "../agentState";
import { validatePlan } from "./planner.validator";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler, withRetry } from "../utils/parser";
import { PlannerError, ErrorCode } from "../types/errors";
import { emitStepEvent } from "../utils/eventQueue";
import util from "util";

let llmInstance: ChatOpenAI | null = null;

/**
 * Initialize the LLM with configuration.
 * Uses singleton pattern to avoid multiple instances.
 */
function initializeLLM(): ChatOpenAI {
  if (llmInstance) {
    return llmInstance;
  }

  const config = getConfig();

  llmInstance = new ChatOpenAI({
    model: config.llm.model,
    temperature: config.llm.temperature,
    apiKey: config.llm.apiKey,
    configuration: {
      baseURL: config.llm.baseUrl,
    },
    timeout: config.llm.timeout,
  });

  return llmInstance;
}

/**
 * Get the LLM instance.
 */
export function getLLM(): ChatOpenAI {
  if (!llmInstance) {
    initializeLLM();
  }
  return llmInstance!;
}

/**
 * Propagate filters from parent steps to dependent steps.
 * Ensures consistent filtering across related queries.
 */
function propagateFilters(plan: PlannerPlan): void {
  for (const step of plan.steps) {
    if (step.kind !== "search") continue;

    for (const dep of step.dependsOn) {
      const parent = plan.steps.find((s) => s.id === dep);
      if (
        parent?.kind === "search" &&
        parent?.databaseQuery?.filter?.app_name
      ) {
        step.databaseQuery.filter = {
          ...parent.databaseQuery.filter,
          ...step.databaseQuery.filter,
        };
      }
    }
  }
}

/**
 * Planner node: Creates execution plan from user goal.
 * Retries on validation errors to refine the plan.
 */
export async function plannerNode(
  state: AgentStateType,
  config?: RunnableConfig,
): Promise<AgentStateType> {
  const logger = createContextLogger(state.requestId, {
    node: "planner",
    goal: state.goal,
  });

  logger.info("Planner node started");

  const llm = getLLM();
  const appConfig = getConfig();

  try {
    let lastValidationError = "";
    
    // Attempt to generate and validate plan with retries
    const plan = await withRetry(
      async () => {
        // Build error message for LLM to learn from previous failures
        const errorContext = lastValidationError 
          ? `PREVIOUS ATTEMPT FAILED:\n\nValidation Error:\n${lastValidationError}\n\nFix the JSON to resolve these errors. Pay special attention to:\n- Filter fields MUST be arrays: "app_name": ["value1", "value2"]\n- limit MUST be between 1-100\n`
          : "";

        const prompt = await plannerPrompt.invoke({
          goal: state.goal,
          previousErrors: errorContext,
        });

        const response = await llm.invoke(prompt);
        const parsedContent = SafeJsonParser.parseContent(response.content);

        logger.info("Planner LLM response parsed", {
          parsedContent
        });
 
        const rawPlan = parsedContent as PlannerPlan;

        // Validate plan structure
        const validation = validatePlan(rawPlan);

        if (!validation.valid) {
          // Store error for next retry attempt
          lastValidationError = validation.error;
          
          logger.warn("Plan validation failed - will retry", {
            error: validation.error,
            attempt: (state.planAttempts ?? 0) + 1,
          });

          throw new PlannerError(
            `Plan validation failed: ${validation.error}`,
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

    propagateFilters(plan);

    logger.info("Plan created successfully", {
      stepCount: plan.steps.length,
      stepIds: plan.steps.map((s) => s.id),
    });

    // Emit planning step event
    emitStepEvent(
      "plan_0",
      "planning",
      "Create Execution Plan",
      "completed",
      state.requestId,
      {
        description: `Created plan with ${plan.steps.length} steps`,
        query: state.goal,
        queries: plan.steps.map((s) => s.query),
      },
    );

    return {
      ...state,
      plan,
      currentStep: 0,
      planAttempts: (state.planAttempts ?? 0) + 1,
      plannerErrors: "",
    };
  } catch (error) {
    const agentError = ErrorHandler.toAgentError(
      error,
      ErrorCode.PLANNER_FAILED,
      { goal: state.goal },
    );

    logger.error("Planner node failed", String(error), {
      error: agentError.code,
      message: agentError.message,
    });

    throw agentError;
  }
}
