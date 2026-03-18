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
        title: "Figuring out how to answer your question...",
        status: "running",
        message: "I'm analyzing your request to determine the best way to find the information you need.",
      });

      try {
        const config = await getConfig();
        const maxAttempts = Math.max(1, config.agent.maxPlanRetries ?? 2);

        // Load skills and tools context
        const plannerContext = await getPlannerContext();
        const currentDate = new Date().toISOString().split("T")[0];

        let lastError = "";
        let lastRawError: unknown;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // @ts-expect-error - LangChain ChatPromptTemplate.invoke() type inference issue
            const prompt = await plannerPromptV2.invoke({
              goal: state.rewrittenQuery ?? state.goal,
              previousErrors: lastError,
              availableSkills: plannerContext.skillsContext,
              availableTools: plannerContext.toolsContext,
              schemaContext: plannerContext.schemaContext,
              currentDate,
            });

            logger.debug("Invoking planner LLM", {
              attempt: attempt + 1,
              maxAttempts,
              hasSkillsContext: !!plannerContext.skillsContext,
              hasToolsContext: !!plannerContext.toolsContext,
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
                  title: "Refining my approach...",
                  status: "running",
                  message: "I'm adjusting my strategy to better find the answer.",
                });
              }
              continue;
            }

            const plan: Plan = validation.data;

            logger.info("Plan", { plan });

            const durationMs = Date.now() - startMs;

            logger.info("Plan created successfully", {
              attempt: attempt + 1,
              stepCount: plan.steps.length,
              stepIds: plan.steps.map((s) => s.id),
              stepKinds: plan.steps.map((s) => s.kind),
              durationMs,
            });

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

        emitStepEvent(state.requestId, {
          stepId: "plan_0",
          stepType: "planning",
          title: "Couldn't find a starting point",
          status: "failed",
          message: "I'm having trouble understanding how to begin. I'll try a different approach.",
        });

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
