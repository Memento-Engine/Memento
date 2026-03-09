import { PlannerPlan } from "./planner.schema";
import { RunnableConfig } from "@langchain/core/runnables";
import { plannerPrompt } from "../prompts/plannerPrompt";
import { AgentStateType } from "../agentState";
import { validatePlan } from "./planner.validator";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler } from "../utils/parser";
import { PlannerError, ErrorCode } from "../types/errors";
import { emitError, emitStepEvent } from "../utils/eventQueue";
import { ExecutionPlan, RouterPlannerOutputSchema } from "../types/llmPlan";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

/**
 * Propagate filters from parent steps to dependent steps.
 * Ensures consistent filtering across related queries.
 */
function propagateFilters(plan: PlannerPlan): void {
  for (const step of plan.steps) {
    if (step.kind !== "search") continue;

    for (const dep of step.dependsOn) {
      const parent = plan.steps.find((s) => s.id === dep);
      if (parent?.kind === "search" && parent?.databaseQuery?.filter?.app_name) {
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
  config?: RunnableConfig
): Promise<AgentStateType> {
  const logger = await createContextLogger(state.requestId, {
    node: "planner",
    goal: state.goal,
  });

  logger.info("Planner node started");

  return runWithSpan(
    "agent.node.planner",
    {
      request_id: state.requestId,
      node: "planner",
      goal_length: state.goal.length,
    },
    async () => {
      try {
        let executionPlan: ExecutionPlan | undefined;
        let routeMeta:
          | {
              intent: string;
              needsClarification: boolean;
              clarificationQuestion?: string;
            }
          | undefined;

        const prompt = await plannerPrompt.invoke({
          goal: state.goal,
          previousErrors: "",
        });

        emitStepEvent(
          "plan_0",
          "planning",
          "Search your memories...",
          "running",
          state.requestId,
          {
            description: "Creating an execution plan from your query",
            query: state.goal,
          }
        );

        logger.debug("Invoking planner LLM");

        const llmInvocation = await invokeRoleLlm({
          role: "planner",
          prompt,
          requestId: state.requestId,
          spanName: "agent.node.planner.llm",
          spanAttributes: {
            node: "planner",
            retry_attempt: (state.planAttempts ?? 0) + 1,
          },
        });


        const parsedContent = await SafeJsonParser.parseContent(llmInvocation.response.content);

        const combinedOutput = RouterPlannerOutputSchema.parse(parsedContent);
        const rawPlan = combinedOutput.plannerPlan as PlannerPlan;
        executionPlan = combinedOutput.executionPlan;
        routeMeta = {
          intent: combinedOutput.executionPlan.retrieval_depth,
          needsClarification: combinedOutput.needsClarification,
          clarificationQuestion: combinedOutput.clarificationQuestion,
        };

        const validation = validatePlan(rawPlan);
        if (!validation.valid) {
          throw new PlannerError(`Plan validation failed: ${validation.error}`, {
            validation: validation.error,
          });
        }

        const plan = validation.data;

        propagateFilters(plan);

        logger.info("Plan created successfully", {
          stepCount: plan.steps.length,
          stepIds: plan.steps.map((s) => s.id),
        });

        emitStepEvent(
          "plan_0",
          "planning",
          "Search your memories...",
          "completed",
          state.requestId,
          {
            description: routeMeta?.needsClarification
              ? (routeMeta.clarificationQuestion ?? `Created plan with ${plan.steps.length} steps`)
              : `Created plan with ${plan.steps.length} steps`,
            query: state.goal,
            queries: executionPlan?.personal_search_queries ?? [],
          }
        );

        return {
          ...state,
          plan,
          executionPlan,
          needsClarification: routeMeta?.needsClarification,
          clarificationQuestion: routeMeta?.clarificationQuestion,
          currentStep: 0,
          planAttempts: (state.planAttempts ?? 0) + 1,
          llmCalls: (state.llmCalls ?? 0) + 1,
          plannerErrors: "",
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(error, ErrorCode.PLANNER_FAILED, {
          goal: state.goal,
        });

        logger.error("Planner node failed", error, {
          error: agentError.code,
          message: agentError.message,
        });

        emitError("Failed to answer the query", agentError.code, state.requestId, true);

        throw agentError;
      }
    }
  );
}
