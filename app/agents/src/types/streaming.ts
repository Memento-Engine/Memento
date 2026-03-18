/**
 * Streaming event types for agent execution.
 * Inlined from shared types to avoid cross-project imports.
 */

import { z } from "zod";

// ThinkingStep schema and type
export const StepSearchResultsSchema = z.object({
  chunk_id: z.number(),
  app_name: z.string(),
  window_name: z.string(),
  captured_at: z.string(),
  browser_url: z.string().optional(),
  image_path: z.string().optional(),
  text_content: z.string().optional(),
  text_json: z.string().optional(),
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
export type StepSearchResult = z.infer<typeof StepSearchResultsSchema>;

// Stream event types
export type StreamEventType =
  | "step"
  | "thinking"
  | "error"
  | "complete"
  | "text"
  | "sources";

export interface StreamEventBase<TType extends StreamEventType, TData> {
  type: TType;
  data: TData;
  timestamp: string;
}

export type StreamStepType =
  | "planning"
  | "searching"
  | "reasoning"
  | "completion";

export type StreamStepStatus = "running" | "completed" | "failed" | "final";

export type ThinkingEvent = StreamEventBase<"thinking", ThinkingStep>;

export type ErrorEventData = {
  message: string;
  code: string;
  isSystemError?: boolean;
  timestamp?: string;
};

export type ErrorEvent = StreamEventBase<"error", ErrorEventData>;

export type TextChunkEvent = StreamEventBase<
  "text",
  { chunk: string; timestamp?: string }
>;

export type CompletionEventData = {
  success?: boolean;
  error?: boolean;
  timestamp?: string;
  status?: StreamStepStatus;
  stepId?: string;
  stepType?: StreamStepType;
  title?: string;
  message?: string;
  metadata?: {
    requestId?: string;
    duration?: number;
    noResultsFound?: boolean;
    timestamp?: string;
  };
};

export type CompletionEvent = StreamEventBase<"complete", CompletionEventData>;

export interface SourceRecordPayload {
  chunkId: number;
  appName?: string;
  windowTitle?: string;
  capturedAt?: string;
  browserUrl?: string;
  textContent?: string;
  textJson?: string | null;
  normalizedTextLayout?: unknown;
  imagePath?: string;
  frameId?: number;
  windowX?: number;
  windowY?: number;
  windowWidth?: number;
  windowHeight?: number;
}

export interface SourcesPayload {
  includeImages: boolean;
  sources: SourceRecordPayload[];
}

export type SourcesEvent = StreamEventBase<"sources", SourcesPayload>;

export type AgentStreamEvent =
  | ThinkingEvent
  | ErrorEvent
  | CompletionEvent
  | TextChunkEvent
  | SourcesEvent;
