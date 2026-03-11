import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./agentState";
import { routerNode } from "./router/router.node";
import { plannerNodeV2 } from "./planner/planner.nodeV2";
import { executorNodeV2 } from "./executor/executor.nodeV2";
import { reactExecutorNode } from "./executor/react.node";
import { finalAnswerNodeV2 } from "./finalLlm/finalAnswer.nodeV2";
import { getLogger } from "./utils/logger";
import { getConfig } from "./config/config";
import { runWithSpan } from "./telemetry/tracing";
import { emitCompletion } from "./utils/eventQueue";
import type { Plan } from "./planner/plan.schema";

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
  const config = await getConfig();
  
  switch (state.route) {
    case "conversation":
      return "conversationExit";
    case "needs_clarification":
      return "clarificationExit";
    case "simple_search":
    case "plan":
    default:
      // Use ReAct executor or legacy planner based on config
      if (config.agent.useReActExecutor) {
        return "reactExecutor";
      }
      return state.route === "simple_search" ? "simpleSearchPlan" : "planner";
  }
}

/**
 * After the planner node: go to executor or retry planning.
 */
async function afterPlanner(state: AgentStateType): Promise<string> {
  const config = await getConfig();
  const maxAttempts = config.agent.maxPlanRetries ?? 3;

  if (state.shouldReplan && (state.planAttempts ?? 0) < maxAttempts) {
    return "planner"; // retry planning
  }

  if (!state.plan) {
    // Planning failed completely — go to final answer with no results
    return "finalAnswer";
  }

  return "executor";
}

/**
 * After the executor node: replan or go to final answer.
 */
async function afterExecutor(state: AgentStateType): Promise<string> {
  const config = await getConfig();
  const maxReplan = config.agent.maxReplanAttempts ?? 3;

  if (state.shouldReplan && (state.replanAttempts ?? 0) < maxReplan) {
    return "planner"; // replan from scratch
  }

  return "finalAnswer";
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

/**
 * Simple search plan: synthesises a minimal 1-step plan
 * so the executor has something to work with when the
 * planner is skipped.
 */
function simpleSearchPlan(state: AgentStateType): AgentStateType {
  const plan: Plan = {
    goal: state.goal,
    steps: [
      {
        id: "step1",
        kind: "search",
        intent: state.goal,
        dependsOn: [],
        expectedOutput: {
          type: "table",
          variableName: "search_results",
          description: `Search results for: ${state.goal}`,
        },
      },
      {
        id: "step2",
        kind: "final",
        intent: `Answer the user's question based on the search results: ${state.goal}`,
        dependsOn: ["step1"],
        expectedOutput: {
          type: "value",
          variableName: "final_answer",
          description: "The final answer to the user's query",
        },
      },
    ],
  };

  return {
    ...state,
    plan,
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
          .addNode("router", routerNode)
          .addNode("planner", plannerNodeV2)
          .addNode("executor", executorNodeV2)
          .addNode("reactExecutor", reactExecutorNode)
          .addNode("finalAnswer", finalAnswerNodeV2)
          .addNode("conversationExit", conversationExit)
          .addNode("clarificationExit", clarificationExit)
          .addNode("simpleSearchPlan", simpleSearchPlan);

        // Edges
        graphBuilder.addEdge(START, "router");

        graphBuilder.addConditionalEdges("router", afterRouter, {
          conversationExit: "conversationExit",
          clarificationExit: "clarificationExit",
          simpleSearchPlan: "simpleSearchPlan",
          planner: "planner",
          reactExecutor: "reactExecutor",
        });

        graphBuilder.addEdge("simpleSearchPlan", "executor");
        
        // ReAct executor goes directly to final answer
        graphBuilder.addEdge("reactExecutor", "finalAnswer");

        graphBuilder.addConditionalEdges("planner", afterPlanner, {
          planner: "planner",
          executor: "executor",
          finalAnswer: "finalAnswer",
        });

        graphBuilder.addConditionalEdges("executor", afterExecutor, {
          planner: "planner",
          finalAnswer: "finalAnswer",
        });

        // Terminal edges
        graphBuilder.addEdge("conversationExit", END);
        graphBuilder.addEdge("clarificationExit", END);
        graphBuilder.addEdge("finalAnswer", END);

        logger.info(
          "Agent workflow graph v2 built successfully",
        );

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
