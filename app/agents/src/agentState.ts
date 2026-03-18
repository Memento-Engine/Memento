import { Annotation } from "@langchain/langgraph";
import { Plan } from "./planner/plan.schema";
import { Route } from "./router/router.node";
import { RetrievedSource } from "./types/agent";
import { AuthHeaders } from "./llm/routing";

/**
 * Agent execution state representing the complete workflow state.
 * Immutable updates recommended for replay and debugging.
 */
export const AgentState = Annotation.Root({
  // -- Core identifiers ─────────────────────────────────────
  isClarificationNeeded: Annotation<boolean>(),
  clarificationQuestion: Annotation<string | undefined>(),
  rewrittenQuery: Annotation<string>(),

  // Intent Router
  isConversation: Annotation<boolean>({
    value: (_: boolean, next: boolean) => next,
    default: () => false,
  }),

  isNeedPlanning: Annotation<boolean>({
    value: (_: boolean, next: boolean) => next,
    default: () => false,
  }),
  conversationResponse: Annotation<string | undefined>(),


  // ── Request context ──────────────────────────────────
  goal: Annotation<string>(),
  requestId: Annotation<string>(),

  // ── Auth context for credit tracking ─────────────────
  authHeaders: Annotation<AuthHeaders | undefined>(),

  // ── Router outputs ───────────────────────────────────
  route: Annotation<Route | undefined>(),
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
  retrievedSources: Annotation<RetrievedSource[] | undefined>(),
});

export type AgentStateType = typeof AgentState.State;
