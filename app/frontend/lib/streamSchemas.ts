import { z } from "zod";
import { thinkingSchema, sourcesPayloadSchema } from "@/components/types";

// Re-export for convenience
export { thinkingSchema, sourcesPayloadSchema };

// Base event schema
export const streamEventBaseSchema = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
});

// Error event schema
export const errorEventDataSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  isSystemError: z.boolean().optional().default(true),
  timestamp: z.string().optional(),
});

export const errorEventSchema = z.object({
  type: z.literal("error"),
  data: errorEventDataSchema,
  timestamp: z.string().optional(),
});

// Text chunk event schema
export const textChunkDataSchema = z.object({
  chunk: z.string(),
  timestamp: z.string().optional(),
});

export const textEventSchema = z.object({
  type: z.literal("text"),
  data: textChunkDataSchema,
  timestamp: z.string().optional(),
});

// Completion event schema
export const completionMetadataSchema = z.object({
  requestId: z.string().optional(),
  duration: z.number().optional(),
  noResultsFound: z.boolean().optional(),
  timestamp: z.string().optional(),
});

export const completionEventDataSchema = z.object({
  success: z.boolean().optional().default(true),
  error: z.boolean().optional(),
  timestamp: z.string().optional(),
  status: z.enum(["running", "completed", "failed", "final"]).optional(),
  stepId: z.string().optional(),
  stepType: z.enum(["planning", "searching", "reasoning", "completion"]).optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  metadata: completionMetadataSchema.optional(),
});

export const completeEventSchema = z.object({
  type: z.literal("complete"),
  data: completionEventDataSchema,
  timestamp: z.string().optional(),
});

// Thinking event schema
export const thinkingEventSchema = z.object({
  type: z.literal("thinking"),
  data: thinkingSchema,
  timestamp: z.string().optional(),
});

// Sources event schema
export const sourcesEventSchema = z.object({
  type: z.literal("sources"),
  data: sourcesPayloadSchema,
  timestamp: z.string().optional(),
});

// Union of all event schemas (discriminated union)
export const agentStreamEventSchema = z.discriminatedUnion("type", [
  thinkingEventSchema,
  errorEventSchema,
  textEventSchema,
  completeEventSchema,
  sourcesEventSchema,
]);

// Type exports
export type ErrorEventData = z.infer<typeof errorEventDataSchema>;
export type TextChunkData = z.infer<typeof textChunkDataSchema>;
export type CompletionEventData = z.infer<typeof completionEventDataSchema>;
export type ThinkingEventData = z.infer<typeof thinkingSchema>;
export type SourcesEventData = z.infer<typeof sourcesPayloadSchema>;

export type ThinkingEvent = z.infer<typeof thinkingEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type TextEvent = z.infer<typeof textEventSchema>;
export type CompleteEvent = z.infer<typeof completeEventSchema>;
export type SourcesEvent = z.infer<typeof sourcesEventSchema>;
export type AgentStreamEvent = z.infer<typeof agentStreamEventSchema>;

// Parse and validate an event, returning a typed result
export function parseStreamEvent(rawEvent: unknown): AgentStreamEvent | null {
  const result = agentStreamEventSchema.safeParse(rawEvent);
  if (!result.success) {
    console.warn("Failed to parse stream event:", result.error.issues);
    return null;
  }
  return result.data;
}
