import { ThinkingStep } from "./frontend.ts";

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
