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
import { buildPlannerContext, getDatabaseSchemaContext } from "./skillContext";
import { SEARCH_MODE_PRESETS, SearchMode } from "../types/stepResult";

/*
============================================================
PLANNER NODE (v2)
============================================================

Produces a Plan (intent DAG) with knowledge of available skills
and tools. The planner can recommend which skill/tool to use
for each search step.

Steps contain: id, kind, intent, dependsOn, stepGoal, 
               suggestedSkill (optional), suggestedTool (optional)

Retries on validation errors up to maxPlanRetries.
============================================================
*/

// Cache for skill/tool context to avoid reloading
let cachedPlannerContext: {
  skillsContext: string;
  toolsContext: string;
  schemaContext: string;
} | null = null;

/**
 * Load and cache the planner context (skills, tools, schema).
 */
async function getPlannerContext() {
  if (!cachedPlannerContext) {
    const [context, schemaContext] = await Promise.all([
      buildPlannerContext(),
      getDatabaseSchemaContext(),
    ]);

    cachedPlannerContext = {
      skillsContext: context.skillsContext,
      toolsContext: context.toolsContext,
      schemaContext,
    };
  }
  return cachedPlannerContext;
}

/**
 * Clear the cached context (useful for testing or hot reload).
 */
export function clearPlannerContextCache(): void {
  cachedPlannerContext = null;
}

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

      emitStepEvent(state.requestId, {
        stepId: "plan_0",
        stepType: "planning",
        actionType: "planning",
        title: "Understanding your question...",
        status: "running",
      });

      try {
        const config = await getConfig();
        const maxAttempts = Math.max(1, config.agent.maxPlanRetries ?? 2);

        // Load skills and tools context
        const plannerContext = await getPlannerContext();
        const currentDate = new Date().toISOString().split("T")[0];
        const modeConfig = SEARCH_MODE_PRESETS[(state.searchMode ?? "search") as SearchMode];

        let lastError = "";
        let lastRawError: unknown;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const prompt = await plannerPromptV2.invoke({
              goal: state.rewrittenQuery ?? state.goal,
              previousErrors: lastError,
              availableSkills: plannerContext.skillsContext,
              availableTools: plannerContext.toolsContext,
              schemaContext: plannerContext.schemaContext,
              currentDate,
              maxSteps: String(modeConfig.maxPlanSteps),
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
              authHeaders: state.authHeaders,
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
                emitStepEvent(state.requestId, {
                  stepId: "plan_0",
                  stepType: "planning",
                  actionType: "planning",
                  title: "Refining search strategy...",
                  status: "running",
                });
              }
              continue;
            }
            const plan: Plan = validation.data;
            logger.info("Plan", { plan });
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


        emitStepEvent(state.requestId, {
          stepId: "plan_0",
          stepType: "planning",
          actionType: "planning",
          title: "Having trouble understanding the request",
          status: "failed",
        });

        return {
          ...state,
          planAttempts: (state.planAttempts ?? 0) + 1,
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      }
    },
  );
}
