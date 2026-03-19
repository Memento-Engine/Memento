import { z } from "zod";

// ── Step Output Contract ─────────────────────────────────
// Every step in the plan produces this structure.
// Direct dependencies get the full object.
// Transitive ancestors get a one-line brief via buildStepBrief().

export const SearchPerformedSchema = z.object({
  type: z.string(),
  query: z.string(),
  resultCount: z.number(),
});

export const StepResultSchema = z.object({
  stepId: z.string(),
  goal: z.string(),
  status: z.enum(["complete", "partial", "empty"]),
  summary: z.string(),
  evidenceChunkIds: z.array(z.number()),
  evidence: z.array(z.any()).optional().nullable(),
  gaps: z.array(z.string()),
  searchesPerformed: z.array(SearchPerformedSchema),
  chunksRead: z.array(z.number()),
  confidence: z.enum(["high", "medium", "low"]),

});

export type StepResult = z.infer<typeof StepResultSchema>;
export type SearchPerformed = z.infer<typeof SearchPerformedSchema>;

/**
 * Build a one-line brief from a step result.
 * Used for non-direct dependency context (transitive ancestors).
 */
export function buildStepBrief(result: StepResult): string {
  const gapStr = result.gaps.length > 0 ? result.gaps.join(", ") : "none";
  return `Step ${result.stepId} [${result.status}]: ${result.summary} | Evidence: ${result.evidenceChunkIds.length} chunks | Gaps: ${gapStr}`;
}

// ── Search Mode ──────────────────────────────────────────

export type SearchMode = "search" | "accurateSearch";

export interface SearchModeConfig {
  maxPlanSteps: number;
  maxReactTurns: number;
  maxReadMoreChunks: number;
  maxSearchCalls: number;
}

export const SEARCH_MODE_PRESETS: Record<SearchMode, SearchModeConfig> = {
  search: {
    maxPlanSteps: 3,
    maxReactTurns: 4,
    maxReadMoreChunks: 5,
    maxSearchCalls: 3,
  },
  accurateSearch: {
    maxPlanSteps: 6,
    maxReactTurns: 8,
    maxReadMoreChunks: 10,
    maxSearchCalls: 7,
  },
};
