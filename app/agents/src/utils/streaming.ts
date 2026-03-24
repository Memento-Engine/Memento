/**
 * Streaming utilities for emitting real-time events to the client.
 * Events are sent as SSE (Server-Sent Events) or JSON streaming responses.
 */

import type {
  AgentStreamEvent,
  CompletionEvent,
  ErrorEvent,
  StreamStepStatus,
  StreamStepType,
  ThinkingEvent,
} from "../types/streaming";

export type StreamingEvent = AgentStreamEvent;

/**
 * Convert an event to SSE format for streaming responses.
 * @param event The event to stream
 * @returns SSE-formatted string
 */
export function formatStreamingEvent(event: StreamingEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Create a step thinking event for streaming to client.
 * @param stepId Unique identifier for the step
 * @param stepType Type of step (planning, searching, reasoning, completion)
 * @param title Human-readable title
 * @param status Current status (running, completed, failed, final)
 * @param details Additional step details
 * @returns StreamingEvent formatted for JSON streaming
 */
export function createStepEvent(
  stepId: string,
  stepType: StreamStepType,
  title: string,
  status: StreamStepStatus,
  details?: {
    description?: string;
    query?: string;
    results?: any[];
    resultCount?: number;
    message?: string;
    reasoning?: string;
    queries?: string[];
    duration?: number;
  },
): ThinkingEvent {
  const event: ThinkingEvent = {
    type: "thinking",
    data: {
      stepId,
      stepType,
      title,
      status,
      description: details?.description,
      query: details?.query,
      results: details?.results,
      resultCount: details?.resultCount,
      message: details?.message,
      reasoning: details?.reasoning,
      queries: details?.queries,
      duration: details?.duration,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };

  return event;
}

/**
 * Create a completion event for the final result.
 * @param content The final response content
 * @param stepId Optional step ID for linking
 * @returns StreamingEvent
 */
export function createCompletionEvent(
  content: string,
  stepId: string = "final",
  followups?: string[],
): CompletionEvent {
  const event: CompletionEvent = {
    type: "complete",
    data: {
      stepId,
      stepType: "completion",
      title: "Final Response",
      status: "final",
      message: content,
      followups,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };

  return event;
}

/**
 * Create an error event for streaming to client.
 * @param message Error message
 * @param code Error code
 * @param isSystemError True if this is a system error (not a "no results" scenario)
 * @returns StreamingEvent
 */
export function createErrorEvent(
  message: string,
  code: string,
  isSystemError: boolean = true,
): ErrorEvent {
  const event: ErrorEvent = {
    type: "error",
    data: {
      message,
      code,
      isSystemError,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };

  return event;
}
