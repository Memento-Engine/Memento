import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./agentState";
import { plannerNodeV2 } from "./planner/planner.nodeV2";
import { executorNodeV2 } from "./executor/executor.nodeV2";
import { finalAnswerNodeV2 } from "./finalLlm/finalAnswer.nodeV2";
import { getLogger } from "./utils/logger";
import { runWithSpan } from "./telemetry/tracing";
import { emitCompletion } from "./utils/eventQueue";
import type { Plan } from "./planner/plan.schema";
import { clarifyAndRewrittenNode } from "./clarifyAndRewrittenNode";
import { intentRouterNode } from "./intentRouterNode";

// ── Routing functions ─────────────────────────────────────

async function afterClarificationAndRewrite(
  state: AgentStateType,
): Promise<string> {
  if (state.isClarificationNeeded) {
    return "clarificationExit";
  }
  return "intentRouter";
}

async function afterRouter(state: AgentStateType): Promise<string> {
  if (state.isConversation) {
    return "conversationExit";
  }
  if (state.isNeedPlanning) {
    return "planner";
  }
  // Simple search — synthesize a 1-step plan and execute
  return "simpleSearchPlan";
}

// ── Terminal / helper nodes ─────────────────────────────

function conversationExit(state: AgentStateType): AgentStateType {
  const reply =
    state.conversationResponse ??
    "I'm a memory search assistant. Ask me about something you've seen on your screen.";
  emitCompletion(reply, state.requestId);
  return { ...state, finalResult: reply, endTime: Date.now() };
}

function clarificationExit(state: AgentStateType): AgentStateType {
  const question =
    state.clarificationQuestion ??
    "Could you provide more details about what you're looking for?";
  emitCompletion(question, state.requestId);
  return { ...state, finalResult: question, endTime: Date.now() };
}

function simpleSearchPlan(state: AgentStateType): AgentStateType {
  const plan: Plan = {
    goal: state.goal,
    steps: [
      {
        id: "step1",
        kind: "search",
        stepGoal: `Find relevant information for: ${state.rewrittenQuery ?? state.goal}`,
        intent: state.rewrittenQuery ?? state.goal,
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
        stepGoal: "Synthesize final answer",
        intent: `Answer: ${state.goal}`,
        dependsOn: ["step1"],
        expectedOutput: {
          type: "value",
          variableName: "final_answer",
          description: "Final answer",
        },
      },
    ],
  };
  return { ...state, plan };
}

// ── Build graph ──────────────────────────────────────────

async function buildAgentGraph() {
  return runWithSpan(
    "agent.graph.build",
    { workflow: "clarify-router-planner-executor-finalAnswer" },
    async () => {
      const logger = await getLogger();

      try {
        const workflow = new StateGraph(AgentState);

        const graphBuilder = workflow
          .addNode("clarifyAndRewritten", clarifyAndRewrittenNode)
          .addNode("intentRouter", intentRouterNode)
          .addNode("clarificationExit", clarificationExit)
          .addNode("conversationExit", conversationExit)
          .addNode("simpleSearchPlan", simpleSearchPlan)
          .addNode("planner", plannerNodeV2)
          .addNode("executor", executorNodeV2)
          .addNode("finalAnswer", finalAnswerNodeV2);

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
          simpleSearchPlan: "simpleSearchPlan",
        });

        graphBuilder.addEdge("conversationExit", END);
        graphBuilder.addEdge("clarificationExit", END);
        graphBuilder.addEdge("simpleSearchPlan", "executor");
        graphBuilder.addEdge("planner", "executor");
        graphBuilder.addEdge("executor", "finalAnswer");
        graphBuilder.addEdge("finalAnswer", END);

        logger.info("Agent graph built successfully");
        return graphBuilder.compile();
      } catch (error) {
        logger.error("Failed to build agent graph");
        throw error;
      }
    },
  );
}

export const graph = buildAgentGraph();
