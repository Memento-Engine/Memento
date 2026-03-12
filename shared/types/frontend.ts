import { z } from "zod";

export const StepSearchResultsSchema = z.object({
  app_name: z.string(),
  window_name: z.string(),
  image_path: z.string(),
  captured_at: z.string(),
});

export const thinkingSchema = z.object({
  stepId: z.string(),
  stepType: z.enum(["planning", "searching", "reasoning", "completion"]),
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
  chunkId: z.string().min(1),
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
