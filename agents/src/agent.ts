import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./agentState";
import { plannerNodeV2 } from "./planner/planner.nodeV2";
import { executorNodeV2 } from "./executor/executor.nodeV2";
import { finalAnswerNodeV2 } from "./finalLlm/finalAnswer.nodeV2";
import { getLogger } from "./utils/logger";
import { runWithSpan } from "./telemetry/tracing";
import { emitCompletion } from "./utils/eventQueue";
import { clarifyAndRewrittenNode } from "./clarifyAndRewrittenNode";
import { intentRouterNode } from "./intentRouterNode";

/*
============================================================
AGENT GRAPH (v2)
============================================================

  START
    │
    ▼
  router ─────┬── conversation ──► END
              │── needs_clarification ──► END
              │── simple_search/plan ─┬── (useReAct) ──► reactExecutor ──► finalAnswer ──► END
                                      └── (legacy) ──► planner ──► executor ──► finalAnswer ──► END
============================================================
*/

// ── Routing functions ─────────────────────────────────────

/**
 * After the router node: decide which branch to take.
 */
async function afterRouter(state: AgentStateType): Promise<string> {
  if (state.isConversation) {
    return "conversationExit";
  }
  return "planner";
}

async function afterClarificationAndRewrite(
  state: AgentStateType,
): Promise<string> {
  if (state.isClarificationNeeded) {
    return "clarificationExit";
  }

  return "intentRouter";
}

// ── Terminal exit nodes ──────────────────────────────────

/**
 * Conversation exit: router already generated a direct reply.
 * Emit as completion and terminate.
 */
function conversationExit(state: AgentStateType): AgentStateType {
  const reply =
    state.conversationResponse ??
    "I'm a memory search assistant. Ask me about something you've seen on your screen.";
  emitCompletion(reply, state.requestId);
  return {
    ...state,
    finalResult: reply,
    endTime: Date.now(),
  };
}

/**
 * Clarification exit: router determined ambiguity.
 * Emit the clarification question and terminate.
 */
function clarificationExit(state: AgentStateType): AgentStateType {
  const question =
    state.clarificationQuestion ??
    "Could you provide more details about what you're looking for?";
  emitCompletion(question, state.requestId);
  return {
    ...state,
    finalResult: question,
    endTime: Date.now(),
  };
}

// ── Build graph ──────────────────────────────────────────

async function buildAgentGraph() {
  return runWithSpan(
    "agent.graph.build",
    { workflow: "router-planner-executor-finalAnswer" },
    async () => {
      const logger = await getLogger();

      try {
        const workflow = new StateGraph(AgentState);

        // Add nodes
        const graphBuilder = workflow
          .addNode("clarifyAndRewritten", clarifyAndRewrittenNode)
          .addNode("intentRouter", intentRouterNode)
          .addNode("clarificationExit", clarificationExit)
          .addNode("conversationExit", conversationExit)
          .addNode("planner", plannerNodeV2)
          .addNode("executor", executorNodeV2)
          .addNode("finalAnswer", finalAnswerNodeV2);

        // Edges
        graphBuilder.addEdge(START, "clarifyAndRewritten");

        graphBuilder.addConditionalEdges(
          "clarifyAndRewritten",
          afterClarificationAndRewrite,
          {
            clarificationExit: "clarificationExit",
            intentRouter: "intentRouter",
          },
        );

        graphBuilder.addConditionalEdges("intentRouter", afterRouter, {
          conversationExit: "conversationExit",
          planner: "planner",
        });

        graphBuilder.addEdge("conversationExit", END);
        graphBuilder.addEdge("clarificationExit", END);
        graphBuilder.addEdge("planner", "executor");
        graphBuilder.addEdge("executor", "finalAnswer");

        graphBuilder.addEdge("finalAnswer", END);

        logger.info("Agent workflow graph v2 built successfully");

        return graphBuilder.compile();
      } catch (error) {
        logger.error("Failed to build agent workflow graph");
        throw error;
      }
    },
  );
}

// Build and export the compiled graph
export const graph = buildAgentGraph();
