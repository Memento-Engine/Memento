import { Annotation } from "@langchain/langgraph";
import { Plan } from "./planner/plan.schema";
import { Route } from "./router/router.node";

/**
 * Agent execution state representing the complete workflow state.
 * Immutable updates recommended for replay and debugging.
 */
export const AgentState = Annotation.Root({
  // ── Request context ──────────────────────────────────
  goal: Annotation<string>(),
  requestId: Annotation<string>(),

  // ── Router outputs ───────────────────────────────────
  route: Annotation<Route | undefined>(),
  clarificationQuestion: Annotation<string | undefined>(),
  conversationResponse: Annotation<string | undefined>(),
  routerConfidence: Annotation<number | undefined>(),

  // ── Planning phase ───────────────────────────────────
  plan: Annotation<Plan | undefined>(),
  plannerErrors: Annotation<string | undefined>(),
  planAttempts: Annotation<number>(),

  // ── Execution phase ──────────────────────────────────
  currentStep: Annotation<number>(),
  stepResults: Annotation<Record<string, any> | undefined>(),
  stepErrors: Annotation<Record<string, string> | undefined>(),

  // ── Replanning phase ─────────────────────────────────
  replanAttempts: Annotation<number>(),
  lastFailedStepId: Annotation<string | undefined>(),
  failureReason: Annotation<string | undefined>(),
  previousPlan: Annotation<Plan | undefined>(),
  shouldReplan: Annotation<boolean>(),

  // ── Result handling ──────────────────────────────────
  noResultsFound: Annotation<boolean>(),
  hasSearchResults: Annotation<boolean>(),

  // ── Timing and metrics ───────────────────────────────
  startTime: Annotation<number>(),
  endTime: Annotation<number | undefined>(),
  llmCalls: Annotation<number>(),

  // ── Final result ─────────────────────────────────────
  finalResult: Annotation<string | undefined>(),
  retrievedSources: Annotation<any[] | undefined>(),
});

export type AgentStateType = typeof AgentState.State;