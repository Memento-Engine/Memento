import { Annotation } from "@langchain/langgraph";
import { PlannerPlan } from "./planner/planner.schema";

/**
 * Agent execution state representing the complete workflow state.
 * Immutable updates recommended for replay and debugging.
 */
export const AgentState = Annotation.Root({
  // Request context
  goal: Annotation<string>(),
  requestId: Annotation<string>(),

  // Planning phase
  plan: Annotation<PlannerPlan | undefined>(),
  plannerErrors: Annotation<string | undefined>(),
  planAttempts: Annotation<number>(),

  // Execution phase
  currentStep: Annotation<number>(),
  stepResults: Annotation<Record<string, any> | undefined>(),
  stepErrors: Annotation<Record<string, string> | undefined>(),

  // Replanning phase
  replanAttempts: Annotation<number>(),
  lastFailedStepId: Annotation<string | undefined>(),
  failureReason: Annotation<string | undefined>(),
  previousPlan: Annotation<PlannerPlan | undefined>(),
  shouldReplan: Annotation<boolean>(),

  // Result handling
  noResultsFound: Annotation<boolean>(), // True when max replan attempts reached with no data
  hasSearchResults: Annotation<boolean>(), // True if any search returned data

  // Timing and metrics
  startTime: Annotation<number>(),
  endTime: Annotation<number | undefined>(),

  // Final result
  finalResult: Annotation<string | undefined>(),
});

export type AgentStateType = typeof AgentState.State;