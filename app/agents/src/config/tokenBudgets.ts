/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOKEN BUDGET CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Centralized token budget constants for the agent pipeline.
 * All values are easily modifiable. The architecture guarantees that worst-case
 * usage never exceeds ~16,400 tokens per LLM call (~13.7% of 120K context).
 * 
 * Estimation: 1 token ≈ 4 characters (approximate)
 */

// ── Chat Context Manager ─────────────────────────────────
export const CHAT_CONTEXT_BUDGETS = {
  /** Max tokens for compressed summary of older history */
  summaryMaxTokens: 300,
  /** Max tokens per recent exchange (user + assistant pair) */
  pairMaxTokens: 600,
  /** Number of recent pairs to keep in window (excludes summary) */
  recentPairsCount: 2,
  /** Total chat context ceiling: summary + 2 pairs = 300 + 600 + 600 */
  totalMaxTokens: 1500,
  /** Threshold to trigger summarization (when raw pairs exceed this) */
  summarizationTriggerTokens: 1200,
} as const;

// ── Classifier + Rewriter ────────────────────────────────
export const CLASSIFIER_BUDGETS = {
  /** System prompt tokens */
  systemTokens: 100,
  /** Chat context (from Chat Context Manager) */
  chatContextMaxTokens: 1500,
  /** Current user query */
  queryMaxTokens: 100,
  /** Total input ceiling */
  totalInputMaxTokens: 1700,
  /** Output tokens */
  outputMaxTokens: 110,
} as const;

// ── Planner ──────────────────────────────────────────────
export const PLANNER_BUDGETS = {
  /** System prompt */
  systemTokens: 100,
  /** Rewritten query */
  queryMaxTokens: 100,
  /** Skill references (summaries only) */
  skillRefsMaxTokens: 100,
  /** Tool references */
  toolRefsMaxTokens: 50,
  /** Total input ceiling */
  totalInputMaxTokens: 350,
  /** Output tokens */
  outputMaxTokens: 200,
} as const;

// ── Step ReAct Loop ──────────────────────────────────────
export const REACT_BUDGETS = {
  // ── Fixed section (same every turn) ────────────────────
  fixed: {
    stepGoalTokens: 50,
    toolRefsTokens: 50,
    skillRefsTokens: 100,
    totalFixedTokens: 200,
  },
  
  // ── Evidence per chunk ─────────────────────────────────
  evidence: {
    /** Tokens per evidence item: { chunk_id, what_it_is_about } */
    perItemTokens: 50,
    /** Max evidence items in standard mode */
    maxItemsStandard: 20,
    /** Max evidence items in accurate mode */
    maxItemsAccurate: 40,
  },
  
  // ── Dependency context (D) ─────────────────────────────
  dependency: {
    /** Summary tokens per dependent step */
    summaryTokens: 200,
    /** Total D budget for standard mode */
    totalDStandard: 1200,  // 200 + 50*20
    /** Total D budget for accurate mode */
    totalDAccurate: 2200,  // 200 + 50*40
  },
  
  // ── Observation history ────────────────────────────────
  observation: {
    /** Search result tokens per record (preview) */
    searchPreviewTokens: 100,
    /** ReadMore result tokens per record (full, before shrink) */
    readMoreFullTokens: 600,
    /** ReadMore shrunk tokens per record (in history) */
    readMoreShrunkTokens: 100,
    /** Max search results per call - standard */
    searchResultsStandard: 10,
    /** Max search results per call - accurate */
    searchResultsAccurate: 20,
    /** Max readMore chunks per call - standard */
    readMoreChunksStandard: 3,
    /** Max readMore chunks per call - accurate */
    readMoreChunksAccurate: 6,
  },

  // ── Text content preview length ────────────────────────
  preview: {
    /** Characters for text_content preview in search results */
    previewChars: 150,
    /** Characters for shrunk readMore in history */
    shrunkPreviewChars: 100,
  },
  
  // ── Node 1 (Decision) worst case ───────────────────────
  node1: {
    /** Standard mode: 200 + 1200 + 3000 */
    totalMaxStandard: 4400,
    /** Accurate mode: 200 + 2200 + 14000 */
    totalMaxAccurate: 16400,
  },
  
  // ── Node 2 (Param Gen) ─────────────────────────────────
  node2: {
    fullSkillTokens: 300,
    fullToolTokens: 40,
    node1OutputTokens: 20,
    totalInputTokens: 360,
    outputTokens: 75,
  },
} as const;

// ── Final LLM ────────────────────────────────────────────
export const FINAL_LLM_BUDGETS = {
  /** System prompt */
  systemTokens: 100,
  /** Chat context */
  chatContextMaxTokens: 1500,
  /** Current query */
  queryTokens: 100,
  /** Step outputs (4 steps × D) */
  stepOutputsStandard: 4800,  // 4 × 1200
  stepOutputsAccurate: 8800,  // 4 × 2200
  /** Total input ceiling */
  totalInputStandard: 6500,
  totalInputAccurate: 10500,
  /** Output tokens */
  outputMaxTokens: 500,
} as const;

// ── Search Mode Presets ──────────────────────────────────
export const SEARCH_MODE_CONFIG = {
  search: {
    maxPlanSteps: 4,
    maxReactTurns: 4,
    maxReadMoreChunks: 3,
    maxSearchCalls: 3,
    maxSearchResults: 10,
    maxEvidenceItems: 20,
  },
  accurateSearch: {
    maxPlanSteps: 4,
    maxReactTurns: 8,
    maxReadMoreChunks: 6,
    maxSearchCalls: 7,
    maxSearchResults: 20,
    maxEvidenceItems: 40,
  },
} as const;

export type SearchModeKey = keyof typeof SEARCH_MODE_CONFIG;

// ── Utilities ────────────────────────────────────────────

/**
 * Approximate token count from text (chars / 4).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token budget.
 * Cuts at word boundary when possible.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  
  // Cut at word boundary if reasonable
  if (lastSpace > maxChars * 0.6) {
    return truncated.slice(0, lastSpace) + "...";
  }
  return truncated + "...";
}

/**
 * Truncate array of messages to fit within total token budget.
 * Drops oldest messages first (preserves most recent).
 */
export function truncateMessagesToFit<T extends { content: string }>(
  messages: T[],
  maxTotalTokens: number,
): T[] {
  let totalTokens = 0;
  const result: T[] = [];
  
  // Work backwards from most recent
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content);
    if (totalTokens + msgTokens > maxTotalTokens) {
      break;
    }
    totalTokens += msgTokens;
    result.unshift(messages[i]);
  }
  
  return result;
}
