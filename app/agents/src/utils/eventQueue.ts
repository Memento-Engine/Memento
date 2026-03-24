/**
 * Event emission system for streaming agent execution events.
 * Uses a global Map to collect events during execution, keyed by requestId.
 * This approach works better with LangGraph which may run nodes in different contexts.
 */

import { AsyncLocalStorage } from "async_hooks";
import { getLogger, logger } from "./logger";
import { formatLocalTimestamp } from "./time";
import type {
  AgentStreamEvent,
  SourcesEvent,
  SourcesPayload,
  StreamStepStatus,
  StreamStepType,
  ThinkingStep,
} from "../types/streaming";

type QueuedEvent = AgentStreamEvent;

type StreamCallback = (event: QueuedEvent) => void;

function logQueue(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  metadata?: Record<string, unknown>,
): void {
  void getLogger()
    .then((logger) => {
      if (level === "debug") {
        metadata ? logger.debug(metadata, message) : logger.debug(message);
        return;
      }
      if (level === "info") {
        metadata ? logger.info(metadata, message) : logger.info(message);
        return;
      }
      if (level === "warn") {
        metadata ? logger.warn(metadata, message) : logger.warn(message);
        return;
      }
      metadata ? logger.error(metadata, message) : logger.error(message);
    })
    .catch(() => {});
}

class EventQueue {
  private events: QueuedEvent[] = [];
  private streamWriter: StreamCallback | null = null;

  /**
   * Set a callback function to stream events immediately as they're added.
   * @param writer Callback that receives events in real-time
   */
  setStreamWriter(writer: StreamCallback): void {
    this.streamWriter = writer;
  }

  add(event: QueuedEvent): void {
    this.events.push(event);

    // If stream writer is configured, emit event immediately
    if (this.streamWriter) {
      try {
        this.streamWriter(event);
      } catch (error) {
        logQueue("error", "Error in stream writer callback", {
          error: String(error),
        });
      }
    }
  }

  getAll(): QueuedEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }

  drain(): QueuedEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }
}

type StepTimingState = {
  startedAtMs: number;
};

// Global map to track event queues by request ID
// This replaces the AsyncLocalStorage approach which doesn't work well with LangGraph
const globalEventQueues = new Map<string, EventQueue>();
const globalStepTimings = new Map<string, Map<string, StepTimingState>>();

function getStepTimingMap(requestId: string): Map<string, StepTimingState> {
  let timings = globalStepTimings.get(requestId);
  if (!timings) {
    timings = new Map<string, StepTimingState>();
    globalStepTimings.set(requestId, timings);
  }
  return timings;
}

/**
 * Initialize event queue for a request context.
 * Must be called at the start of request handling.
 * @param requestId Unique request identifier
 * @param streamWriter Optional callback for real-time event streaming
 * @returns The event queue for this request
 */
export function initializeEventQueue(
  requestId: string,
  streamWriter?: StreamCallback,
): EventQueue {
  logQueue("debug", "Initializing event queue", { requestId });
  const queue = new EventQueue();
  if (streamWriter) {
    queue.setStreamWriter(streamWriter);
  }
  globalEventQueues.set(requestId, queue);
  return queue;
}

/**
 * Get the event queue for a specific request.
 * @param requestId Unique request identifier
 * @returns The event queue or undefined if not initialized
 */
export function getEventQueue(requestId: string): EventQueue | undefined {
  return globalEventQueues.get(requestId);
}

/**
 * Clean up event queue for a request.
 * Should be called after the request is complete.
 * @param requestId Unique request identifier
 */
export function cleanupEventQueue(requestId: string): void {
  logQueue("debug", "Cleaning up event queue", { requestId });
  globalEventQueues.delete(requestId);
  globalStepTimings.delete(requestId);
}

// AsyncLocalStorage to maintain event queue per request context (legacy, kept for compatibility)
const eventQueueStorage = new AsyncLocalStorage<EventQueue>();

/**
 * Initialize event queue for a request context (legacy).
 * Must be called at the start of request handling.
 * @param callback Function to run within the queue context
 * @returns Result of callback
 */
export function withEventQueue<T>(
  callback: () => T | Promise<T>,
): T | Promise<T> {
  logQueue("debug", "Initializing legacy event queue context");
  const queue = new EventQueue();
  const result = eventQueueStorage.run(queue, () => {
    logQueue("debug", "Inside legacy event queue context");
    return callback();
  });
  return result;
}

/**
 * Emit a step event to the context-local queue.
 * Events are collected during execution and streamed back.
 * @param stepId Unique step identifier
 * @param stepType Type of step
 * @param title Human-readable title
 * @param status Current status
 * @param requestId Request identifier to route event to correct queue
 * @param details Additional details
 */
export function emitStepEvent(requestId: string, data: ThinkingStep): void {
  // Try to get queue from global map first (preferred for LangGraph compatibility)
  let queue = getEventQueue(requestId);

  // Fall back to AsyncLocalStorage if global map doesn't have it
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    logQueue("warn", "Event queue not initialized - event not emitted", {
      requestId,
    });
    return;
  }

  const emittedAt = new Date();
  const emittedTimestamp = formatLocalTimestamp(emittedAt);
  const timings = getStepTimingMap(requestId);
  const timingKey = `${data.stepType}:${data.stepId}`;
  const existingTiming = timings.get(timingKey);

  if (!existingTiming) {
    timings.set(timingKey, { startedAtMs: emittedAt.getTime() });
  }

  const startedAtMs = existingTiming?.startedAtMs ?? emittedAt.getTime();
  const computedDuration = Math.max(0, emittedAt.getTime() - startedAtMs);

  if (data.status === "completed" || data.status === "failed" || data.status === "final") {
    timings.delete(timingKey);
  }

  const enrichedData: ThinkingStep = {
    ...data,
    timestamp: data.timestamp ?? emittedTimestamp,
    duration: data.duration ?? computedDuration,
  };

  const event: QueuedEvent = {
    type: "thinking",
    data: enrichedData,
    timestamp: emittedTimestamp,
  };

  queue.add(event);
  logQueue("debug", "Event emitted to queue", {
    requestId,
  });
}

export function emitSources(requestId: string, data: SourcesPayload): void {
  // Try to get queue from global map first (preferred for LangGraph compatibility)
  let queue = getEventQueue(requestId);

  // Fall back to AsyncLocalStorage if global map doesn't have it
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    logQueue("warn", "Event queue not initialized - event not emitted", {
      requestId,
    });
    return;
  }

  console.log(JSON.stringify(data, null, 2), "Source Payload in emitSources");

  const event: QueuedEvent = {
    type: "sources",
    data,
    timestamp: formatLocalTimestamp(),
  };

  queue.add(event);
  logQueue("debug", "Event emitted to queue", {
    requestId,
    eventType: "sources",
    sourceCount: data.sources.length,
  });
}

/**
 * Emit a completion event.
 * @param content Final response content
 * @param requestId Request identifier
 * @param stepId Optional step ID for linking
 */
export function emitCompletion(
  content: string,
  requestId: string,
  stepId: string = "final",
  followups?: string[],
): void {
  let queue = getEventQueue(requestId);
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    logQueue("warn", "Event queue not initialized - completion not emitted", {
      requestId,
      stepId,
    });
    return;
  }

  queue.add({
    type: "complete",
    data: {
      stepId,
      stepType: "completion",
      title: "Final Response",
      status: "final",
      message: content,
      followups,
      timestamp: formatLocalTimestamp(),
    },
    timestamp: formatLocalTimestamp(),
  });
}

/**
 * Emit a text chunk event for streaming final answer.
 * @param chunk Text chunk to emit
 * @param requestId Request identifier
 */
export function emitTextChunk(chunk: string, requestId: string): void {
  let queue = getEventQueue(requestId);
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    logQueue("warn", "Event queue not initialized - text chunk not emitted", {
      requestId,
    });
    return;
  }

  queue.add({
    type: "text" as any,
    data: {
      chunk,
      timestamp: formatLocalTimestamp(),
    },
    timestamp: formatLocalTimestamp(),
  });
}

/**
 * Emit an error event.
 * @param message Error message
 * @param code Error code
 * @param requestId Request identifier
 * @param isSystemError True if this is a system error
 */
export function emitError(
  message: string,
  code: string,
  requestId: string,
  isSystemError: boolean = true,
): void {
  let queue = getEventQueue(requestId);
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    logQueue("warn", "Event queue not initialized - error not emitted", {
      requestId,
      code,
    });
    return;
  }

  queue.add({
    type: "error",
    data: {
      message,
      code,
      isSystemError,
      timestamp: formatLocalTimestamp(),
    },
    timestamp: formatLocalTimestamp(),
  });
}

/**
 * Get all queued events without clearing the queue.
 * @param requestId Request identifier
 * @returns Array of queued events
 */
export function getQueuedEvents(requestId: string): QueuedEvent[] {
  const queue = getEventQueue(requestId);
  if (!queue) {
    const legacyQueue = eventQueueStorage.getStore();
    if (legacyQueue) {
      return legacyQueue.getAll();
    }
    return [];
  }
  return queue.getAll();
}

/**
 * Drain all queued events (get and clear).
 * @param requestId Request identifier
 * @returns Array of events that were queued
 */
export function drainQueuedEvents(requestId: string): QueuedEvent[] {
  const queue = getEventQueue(requestId);

  if (!queue) {
    // Fall back to AsyncLocalStorage for legacy code
    const legacyQueue = eventQueueStorage.getStore();
    if (legacyQueue) {
      const events = legacyQueue.drain();
      logQueue("debug", "Legacy queue drained", {
        events: events.length,
        requestId,
      });
      return events;
    }
    logQueue(
      "warn",
      "No event queue found in map or AsyncLocalStorage when draining",
      {
        requestId,
      },
    );
    return [];
  }

  const events = queue.drain();
  logQueue("debug", "Queue drained", { events: events.length, requestId });
  return events;
}
