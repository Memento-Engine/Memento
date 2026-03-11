import { Plan } from "./plan.schema";
import { AgentStateType } from "../agentState";
import { validatePlan } from "./plan.validator";
import { plannerPromptV2 } from "../prompts/plannerPromptV2";
import { getConfig } from "../config/config";
import { createContextLogger } from "../utils/logger";
import { SafeJsonParser, ErrorHandler } from "../utils/parser";
import { PlannerError, ErrorCode } from "../types/errors";
import { emitStepEvent } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

/*
============================================================
PLANNER NODE (v2)
============================================================

Produces a Plan (intent DAG) with NO database queries.
Steps contain:  id, kind, intent, dependsOn, expectedOutput, searchHints
Retries on validation errors up to maxPlanRetries.
============================================================
*/

export async function plannerNodeV2(
  state: AgentStateType,
): Promise<AgentStateType> {
  const logger = await createContextLogger(state.requestId, {
    node: "planner",
    goal: state.goal,
  });

  return runWithSpan(
    "agent.node.planner",
    {
      request_id: state.requestId,
      node: "planner",
      goal_length: state.goal.length,
    },
    async () => {
      const startMs = Date.now();
      logger.info("Planner node started");

      emitStepEvent(
        "plan_0",
        "planning",
        "Planning your answer",
        "running",
        state.requestId,
        { description: "Breaking the problem into steps", query: state.goal },
      );

      try {
        const config = await getConfig();
        const maxAttempts = Math.max(1, config.agent.maxPlanRetries ?? 3);

        let lastError = "";
        let lastRawError: unknown;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const prompt = await plannerPromptV2.invoke({
              goal: state.goal,
              previousErrors: lastError,
            });

            logger.debug("Invoking planner LLM", {
              attempt: attempt + 1,
              maxAttempts,
            });

            const llmResult = await invokeRoleLlm({
              role: "planner",
              prompt,
              requestId: state.requestId,
              spanName: "agent.node.planner.llm",
              spanAttributes: {
                node: "planner",
                attempt: attempt + 1,
              },
            });

            const parsed = await SafeJsonParser.parseContent(
              llmResult.response.content,
            );

            // ── Validate ─────────────────────────────
            const validation = validatePlan(parsed);

            if (!validation.valid) {
              lastError = validation.error;
              logger.warn("Plan validation failed — retrying", {
                attempt: attempt + 1,
                error: validation.error,
              });

              if (attempt < maxAttempts - 1) {
                emitStepEvent(
                  "plan_0",
                  "planning",
                  "Refining strategy",
                  "running",
                  state.requestId,
                  { description: "Adjusting the approach" },
                );
              }
              continue;
            }

            const plan: Plan = validation.data;
            const durationMs = Date.now() - startMs;

            logger.info("Plan created successfully", {
              attempt: attempt + 1,
              stepCount: plan.steps.length,
              stepIds: plan.steps.map((s) => s.id),
              durationMs,
            });

            emitStepEvent(
              "plan_0",
              "planning",
              "Strategy ready",
              "completed",
              state.requestId,
              {
                description: `Decided what information to gather`,
                query: state.goal,
                duration: durationMs,
              },
            );

            return {
              ...state,
              plan,
              planAttempts: (state.planAttempts ?? 0) + attempt + 1,
              llmCalls: (state.llmCalls ?? 0) + attempt + 1,
              plannerErrors: "",
            };
          } catch (attemptError) {
            lastRawError = attemptError;
            lastError = ErrorHandler.getSafeMessage(attemptError);

            logger.warn("Planner attempt failed", {
              attempt: attempt + 1,
              error: lastError,
            });
          }
        }

        // All attempts exhausted
        throw (
          lastRawError ??
          new PlannerError("All planner attempts failed", {
            lastError,
          })
        );
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(
          error,
          ErrorCode.PLANNER_FAILED,
          { goal: state.goal },
        );

        logger.error("Planner node failed", error);

        emitStepEvent(
          "plan_0",
          "planning",
          "Trying another approach",
          "failed",
          state.requestId,
          { description: "Adjusting strategy" },
        );

        return {
          ...state,
          shouldReplan: true,
          plannerErrors: agentError.message,
          failureReason: `Planner failed: ${agentError.message}`,
          planAttempts: (state.planAttempts ?? 0) + 1,
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      }
    },
  );
}
