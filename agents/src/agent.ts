import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./agentState";
import { plannerNode } from "./planner/planner.node";
import { replannerNode } from "./planner/replanner.node";
import { executorNode } from "./executor/executor.node";
import { finalAnswerNode } from "./finalLlm/finalAnswer.node";
import { getLogger } from "./utils/logger";
import { getConfig } from "./config/config";
import { runWithSpan } from "./telemetry/tracing";

/**
 * Route function to determine if replanning is needed.
 * Returns "replanner" if shouldReplan is true AND we haven't exceeded max attempts,
 * otherwise "finalAnswer" to generate a response (with or without results).
 */
async function shouldReplanRoute(state: typeof AgentState.State): Promise<string> {
  const config = await getConfig();
  const maxReplanAttempts = config.agent.maxReplanAttempts ?? 3;
  const currentReplanAttempts = state.replanAttempts ?? 0;

  // If shouldReplan is true AND we haven't maxed out attempts, go to replanner
  if (state.shouldReplan && currentReplanAttempts < maxReplanAttempts) {
    return "replanner";
  }

  // Otherwise, move to final answer (even with no results)
  // Mark that we've reached max attempts if shouldReplan was true
  if (state.shouldReplan && currentReplanAttempts >= maxReplanAttempts) {
    // This will be handled in finalAnswer node
    state.noResultsFound = true;
  }

  return "finalAnswer";
}

/**
 * Build and compile the agent workflow graph.
 * Workflow: Planner → Executor → [Replanner → Executor (loop) or FinalAnswer] → END
 */
async function buildAgentGraph() {
  return runWithSpan(
    "agent.graph.build",
    {
      workflow: "planner-executor-replanner-finalAnswer",
    },
    async () => {
  const logger = await getLogger();
  
  try {
    const workflow = new StateGraph(AgentState);

    const graphBuilder = workflow
      .addNode("planner", plannerNode)
      .addNode("executor", executorNode)
      .addNode("replanner", replannerNode)
      .addNode("finalAnswer", finalAnswerNode);

    // Define edges
    graphBuilder.addEdge(START, "planner");
    graphBuilder.addEdge("planner", "executor");

    // Conditional edge from executor: replan or finalize
    graphBuilder.addConditionalEdges(
      "executor",
      shouldReplanRoute,
      {
        replanner: "replanner",
        finalAnswer: "finalAnswer",
      },
    );

    // Replanner loops back to executor for retry
    graphBuilder.addEdge("replanner", "executor");

    // Final answer goes to end
    graphBuilder.addEdge("finalAnswer", END);

    logger.info("Agent workflow graph built successfully with replanning support");

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

