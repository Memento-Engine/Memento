import { Annotation } from "@langchain/langgraph";
import { PlannerPlan } from "./planner/planner.schema";

export const AgentState = Annotation.Root({
  goal: Annotation<string>(),

  plan: Annotation<PlannerPlan | undefined>(),

  plannerErrors : Annotation<string | undefined>(),

  currentStep: Annotation<number | undefined>(),

  stepResults: Annotation<Record<string, any> | undefined>(),
});

export type AgentStateType = typeof AgentState.State;