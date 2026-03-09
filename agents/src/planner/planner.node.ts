import { PlannerPlan } from "./planner.schema";
import { RunnableConfig } from "@langchain/core/runnables";
import { plannerPrompt } from "../prompts/plannerPrompt";
import { AgentStateType } from "../agentState";
import { validatePlan } from "./planner.validator";
import { getConfig } from "../config/config";
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
        const appConfig = await getConfig();
        const maxPlannerAttempts = Math.max(1, appConfig.agent.maxPlanRetries ?? 2);

        let plannerAttemptErrors = "";
        let lastPlannerError: unknown = undefined;

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

        for (let attempt = 0; attempt < maxPlannerAttempts; attempt++) {
          try {
            const prompt = await plannerPrompt.invoke({
              goal: state.goal,
              previousErrors: plannerAttemptErrors,
            });

            logger.debug("Invoking planner LLM", {
              attempt: attempt + 1,
              maxPlannerAttempts,
            });

            const llmInvocation = await invokeRoleLlm({
              role: "planner",
              prompt,
              requestId: state.requestId,
              spanName: "agent.node.planner.llm",
              spanAttributes: {
                node: "planner",
                retry_attempt: (state.planAttempts ?? 0) + attempt + 1,
              },
            });

            const parsedContent = await SafeJsonParser.parseContent(llmInvocation.response.content);
            const combinedOutput = RouterPlannerOutputSchema.parse(parsedContent);
            const rawPlan = combinedOutput.plannerPlan as PlannerPlan;
            const executionPlan: ExecutionPlan = combinedOutput.executionPlan;

            const routeMeta = {
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
              attempt: attempt + 1,
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
              planAttempts: (state.planAttempts ?? 0) + attempt + 1,
              llmCalls: (state.llmCalls ?? 0) + attempt + 1,
              plannerErrors: "",
            };
          } catch (attemptError) {
            lastPlannerError = attemptError;
            plannerAttemptErrors = ErrorHandler.getSafeMessage(attemptError);

            const isLastAttempt = attempt === maxPlannerAttempts - 1;
            if (!isLastAttempt) {
              emitStepEvent(
                "plan_0",
                "planning",
                "Refining plan...",
                "running",
                state.requestId,
                {
                  description: `Planner attempt ${attempt + 1} failed. Retrying...`,
                  message: plannerAttemptErrors,
                  query: state.goal,
                }
              );
            }
          }
        }

        throw lastPlannerError ?? new PlannerError("Planner retries exhausted", {
          maxPlannerAttempts,
        });
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(error, ErrorCode.PLANNER_FAILED, {
          goal: state.goal,
        });

        emitStepEvent(
          "plan_0",
          "planning",
          "Planning failed",
          "failed",
          state.requestId,
          {
            description: agentError.message,
            query: state.goal,
          }
        );

        logger.error("Planner node failed", error, {
          error: agentError.code,
          message: agentError.message,
        });

        return {
          ...state,
          shouldReplan: true,
          plannerErrors: agentError.message,
          failureReason: `Planner failed: ${agentError.message}`,
          planAttempts: (state.planAttempts ?? 0) + 1,
        };
      }
    }
  );
}
