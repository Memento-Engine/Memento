import { z } from "zod";
import { AgentStateType } from "../agentState";
import { createContextLogger } from "../utils/logger";
import { routerPrompt } from "../prompts/routerPrompt";
import { SafeJsonParser, ErrorHandler } from "../utils/parser";
import { ErrorCode } from "../types/errors";
import { emitStepEvent } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

/*
============================================================
CLARIFIER + INTENT ROUTER NODE
============================================================

Fast, cheap model that does two things in one call:
1. Checks if the query is ambiguous → asks user for clarification
2. Routes the query to the correct downstream node:
   - conversation  → conversationNode (direct reply)
   - simple_search → executor (skip planner, single search)
   - plan          → plannerNode (multi-step decomposition)
============================================================
*/

const RouterOutputSchema = z.object({
  route: z.enum(["conversation", "simple_search", "plan"]),
  clarificationQuestion: z.string().optional(),
  conversationResponse: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
});

export type RouterOutput = z.infer<typeof RouterOutputSchema>;
export type Route = RouterOutput["route"];

export async function routerNode(
  state: AgentStateType,
): Promise<AgentStateType> {
  const logger = await createContextLogger(state.requestId, {
    node: "router",
    goal: state.goal,
  });

  return runWithSpan(
    "agent.node.router",
    {
      request_id: state.requestId,
      node: "router",
      goal_length: state.goal.length,
    },
    async () => {
      const startMs = Date.now();

      logger.info("Router node started");

      try {
        const prompt = await routerPrompt.invoke({ goal: state.goal });

        const llmResult = await invokeRoleLlm({
          role: "router",
          prompt,
          requestId: state.requestId,
          spanName: "agent.node.router.llm",
          spanAttributes: { node: "router" },
        });

        const parsed = await SafeJsonParser.parseAndValidate(
          llmResult.response.content,
          RouterOutputSchema,
        );

        const durationMs = Date.now() - startMs;

        logger.info("Router classified query", {
          route: parsed.route,
          confidence: parsed.confidence,
          durationMs,
        });

        return {
          ...state,
          route: parsed.route,
          clarificationQuestion: parsed.clarificationQuestion,
          conversationResponse: parsed.conversationResponse,
          routerConfidence: parsed.confidence,
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(
          error,
          ErrorCode.INTERNAL_ERROR,
          { node: "router", goal: state.goal },
        );

        logger.error("Router node failed — defaulting to plan route", error);

        // Safe fallback: treat as a planning query
        return {
          ...state,
          route: "plan" as const,
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      }
    },
  );
}
