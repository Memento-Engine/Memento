import { StateGraph, START } from "@langchain/langgraph";
import { AgentState } from "./agentState";
import { plannerNode } from "./planner/planner.node";
import { executorNode } from "./executor/executor.node";

const workflow = new StateGraph(AgentState);

const graphBuilder = workflow
  .addNode("planner", plannerNode)
//   .addNode("executor", executorNode);

graphBuilder.addEdge(START, "planner");

// graphBuilder.addEdge("planner", "executor");

export const graph = graphBuilder.compile();
