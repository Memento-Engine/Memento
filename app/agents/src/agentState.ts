import { Annotation } from "@langchain/langgraph";
import { Plan } from "./planner/plan.schema";
import { AuthHeaders } from "./llm/routing";
import { StepResult, SearchMode } from "./types/stepResult";

/**
 * Agent execution state.
 * Tracks the full workflow from query to final answer.
 */
export const AgentState = Annotation.Root({
  // ── Request context ──────────────────────────────────
  goal: Annotation<string>(),
  requestId: Annotation<string>(),
  authHeaders: Annotation<AuthHeaders | undefined>(),

  // ── Search mode ──────────────────────────────────────
  searchMode: Annotation<SearchMode>({
    value: (_: SearchMode, next: SearchMode) => next,
    default: () => "search" as SearchMode,
  }),

  // ── Chat history (for clarifier) ─────────────────────
  chatHistory: Annotation<Array<{ role: string; content: string }>>({
    value: (_: Array<{ role: string; content: string }>, next: Array<{ role: string; content: string }>) => next,
    default: () => [],
  }),

  // ── Clarify + Rewrite outputs ────────────────────────
  isClarificationNeeded: Annotation<boolean>(),
  clarificationQuestion: Annotation<string | undefined>(),
  rewrittenQuery: Annotation<string>(),

  // ── Intent Router outputs ────────────────────────────
  isConversation: Annotation<boolean>({
    value: (_: boolean, next: boolean) => next,
    default: () => false,
  }),
  isNeedPlanning: Annotation<boolean>({
    value: (_: boolean, next: boolean) => next,
    default: () => false,
  }),
  conversationResponse: Annotation<string | undefined>(),

  // ── Planning phase ───────────────────────────────────
  plan: Annotation<Plan | undefined>(),
  planAttempts: Annotation<number>(),

  // ── Execution phase ──────────────────────────────────
  stepResults: Annotation<Record<string, StepResult>>({
    value: (prev: Record<string, StepResult>, next: Record<string, StepResult>) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // ── Timing and metrics ───────────────────────────────
  startTime: Annotation<number>(),
  endTime: Annotation<number | undefined>(),
  llmCalls: Annotation<number>(),

  // ── Final result ─────────────────────────────────────
  finalResult: Annotation<string | undefined>(),
});

export type AgentStateType = typeof AgentState.State;
