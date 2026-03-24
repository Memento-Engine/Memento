import { z } from "zod";
import { SEARCH_MODE_CONFIG } from "../config/tokenBudgets";

// ── Evidence Item Contract ───────────────────────────────
// Each evidence chunk is stored as { chunk_id, whatItIsAbout }
// ~50 tokens per item, auto-generated from metadata

export const EvidenceItemSchema = z.object({
  /** Chunk ID for citation [[chunk_N]] (positive = memory, negative = web) */
  chunk_id: z.number(),
  /** Brief description: app + window + preview (~50 tokens) */
  whatItIsAbout: z.string(),
  /** Source type: memory (screen capture) or web (external search) */
  source_type: z.enum(["memory", "web"]).default("memory"),
  /** URL for web sources */
  url: z.string().optional(),
  /** Display title for web sources */
  title: z.string().optional(),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * Generate evidence description from chunk metadata.
 * Format: "app: title - preview" truncated to ~50 tokens (~200 chars)
 */
export function buildEvidenceDescription(chunk: {
  app_name?: string;
  window_name?: string;
  window_title?: string;
  text_content?: string;
  browser_url?: string;
}): string {
  const app = chunk.app_name || "Unknown";
  const title = chunk.window_name || chunk.window_title || "";
  const preview = (chunk.text_content || "").slice(0, 100);
  
  let desc = app;
  if (title) desc += `: ${title.slice(0, 60)}`;
  if (preview) desc += ` - ${preview}`;
  
  // Truncate to ~200 chars (~50 tokens)
  return desc.length > 200 ? desc.slice(0, 197) + "..." : desc;
}

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
  summary: z.string().describe('One-line summary of what you concluded from this step (max ~300 tokens)'),
  /** Chunk IDs for evidence (used for [[chunk_N]] citations) */
  evidenceChunkIds: z.array(z.number()),
  /** Evidence items with descriptions (~50 tokens each) */
  evidence: z.array(EvidenceItemSchema).optional().nullable(),
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
  maxSearchResults: number;
  maxEvidenceItems: number;
}

// Re-export from centralized config
export const SEARCH_MODE_PRESETS: Record<SearchMode, SearchModeConfig> = SEARCH_MODE_CONFIG;
