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

  // ── Chat history (raw input) ──────────────────────────
  chatHistory: Annotation<Array<{ role: string; content: string }>>({
    value: (_: Array<{ role: string; content: string }>, next: Array<{ role: string; content: string }>) => next,
    default: () => [],
  }),

  // ── Chat Context Manager outputs ─────────────────────
  /** Bounded chat context (summary + recent pairs, ≤1500 tokens) */
  chatContext: Annotation<string>({
    value: (_: string, next: string) => next,
    default: () => "",
  }),
  /** Token count of chat context */
  chatContextTokens: Annotation<number>({
    value: (_: number, next: number) => next,
    default: () => 0,
  }),

  // ── Classifier + Router outputs ──────────────────────
  isClarificationNeeded: Annotation<boolean>(),
  clarificationQuestion: Annotation<string | undefined>(),
  rewrittenQuery: Annotation<string>(),
  /** Routing decision: chat (answer from context), search, or mixed */
  route: Annotation<"chat" | "search" | "mixed">({
    value: (_: "chat" | "search" | "mixed", next: "chat" | "search" | "mixed") => next,
    default: () => "search" as const,
  }),

  // ── Backwards compat (derived from route) ────────────
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
