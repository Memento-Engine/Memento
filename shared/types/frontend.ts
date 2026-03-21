import { z } from "zod";

// Source type to distinguish where results came from
export const SourceTypeEnum = z.enum(["memory", "web"]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const StepSearchResultsSchema = z.object({
  chunk_id: z.number(),
  app_name: z.string(),
  window_name: z.string(),
  captured_at: z.string(),
  browser_url: z.string().optional(),
  image_path : z.string().optional(),
  text_content: z.string().optional(),
  text_json: z.string().optional(),
  // Source type: "memory" for captured screen history, "web" for external web search
  // Optional for backwards compatibility - defaults to "memory" at runtime
  sourceType: SourceTypeEnum.optional(),
  // Web-specific fields
  url: z.string().optional(),
  title: z.string().optional(),
  snippet: z.string().optional(),
  publishedAt: z.string().optional(),
});

// Available action types for UI display
export const ActionTypeEnum = z.enum([
  "planning",     // Agent is creating a plan
  "sql",          // Running SQL/FTS query
  "semantic",     // Vector semantic search
  "hybrid",       // Combined FTS + semantic
  "webSearch",    // External web search
  "readMore",     // Reading full content of chunks
  "thinking",     // Agent is analyzing/reasoning
  "summarizing",  // Generating final answer
]);

export type ActionType = z.infer<typeof ActionTypeEnum>;

export const SearchModeEnum = z.enum(["search", "accurateSearch"]);

export type SearchMode = z.infer<typeof SearchModeEnum>;

export const messageSearchModeSchema = z.object({
  mode: SearchModeEnum,
  label: z.string(),
});

export type MessageSearchMode = z.infer<typeof messageSearchModeSchema>;

export const thinkingSchema = z.object({
  stepId: z.string(),
  stepType: z.enum(["planning", "searching", "reasoning", "completion"]),
  actionType: ActionTypeEnum.optional(), // Specific action being performed
  status: z.enum(["running", "completed", "failed", "final"]),
  title: z.string(),
  description: z.string().optional(),
  query: z.string().optional(),
  results: z.array(StepSearchResultsSchema).optional().nullable(),
  resultCount: z.number().optional(),
  message: z.string().optional().nullable(),
  reasoning: z.string().optional(),
  queries: z.array(z.string()).nullable().optional(),
  duration: z.number().optional(),
  timestamp: z.string().optional(),
});

export type ThinkingStep = z.infer<typeof thinkingSchema>;
export type StepSearchResult = z.infer<typeof StepSearchResultsSchema>;

export const normalizedOcrTokenSchema = z.object({
  text: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  index: z.number(),
});

export const normalizedOcrLayoutSchema = z.object({
  version: z.literal(1),
  normalized_text: z.string(),
  tokens: z.array(normalizedOcrTokenSchema),
});

export const sourceSchema = z.object({
  chunkId: z.number(),
  appName: z.string().default(""),
  windowTitle: z.string().default(""),
  capturedAt: z.string().default(""),
  browserUrl: z.string().default(""),
  textContent: z.string().default(""),
  textJson: z.string().optional().nullable(),
  normalizedTextLayout: normalizedOcrLayoutSchema.optional().nullable(),
  imagePath: z.string().default(""),
  frameId: z.number().optional(),
  windowX: z.number().optional(),
  windowY: z.number().optional(),
  windowWidth: z.number().optional(),
  windowHeight: z.number().optional(),
});

export const sourcesPayloadSchema = z.object({
  includeImages: z.boolean().default(false),
  sources: z.array(sourceSchema),
});

export type SourceRecord = z.infer<typeof sourceSchema>;
export type SourcesPayload = z.infer<typeof sourcesPayloadSchema>;








// ----------------- Front End Api ---------------------------
