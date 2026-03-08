/**
 * Event emission system for streaming agent execution events.
 * Uses a global Map to collect events during execution, keyed by requestId.
 * This approach works better with LangGraph which may run nodes in different contexts.
 */

import { AsyncLocalStorage } from "async_hooks";

interface QueuedEvent {
  type: "step" | "thinking" | "error" | "complete";
  data: any;
  timestamp: string;
}

type StreamCallback = (event: QueuedEvent) => void;

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
        console.error("Error in stream writer callback:", error);
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

// Global map to track event queues by request ID
// This replaces the AsyncLocalStorage approach which doesn't work well with LangGraph
const globalEventQueues = new Map<string, EventQueue>();

/**
 * Initialize event queue for a request context.
 * Must be called at the start of request handling.
 * @param requestId Unique request identifier
 * @param streamWriter Optional callback for real-time event streaming
 * @returns The event queue for this request
 */
export function initializeEventQueue(requestId: string, streamWriter?: StreamCallback): EventQueue {
  console.log(`🟢 Initializing event queue for request: ${requestId}`);
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
  console.log(`🗑️ Cleaning up event queue for request: ${requestId}`);
  globalEventQueues.delete(requestId);
}

// AsyncLocalStorage to maintain event queue per request context (legacy, kept for compatibility)
const eventQueueStorage = new AsyncLocalStorage<EventQueue>();

/**
 * Initialize event queue for a request context (legacy).
 * Must be called at the start of request handling.
 * @param callback Function to run within the queue context
 * @returns Result of callback
 */
export function withEventQueue<T>(callback: () => T | Promise<T>): T | Promise<T> {
  console.log("🟢 Initializing event queue context");
  const queue = new EventQueue();
  const result = eventQueueStorage.run(queue, () => {
    console.log("🟡 Inside event queue context, running callback");
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
export function emitStepEvent(
  stepId: string,
  stepType: "planning" | "searching" | "reasoning" | "completion",
  title: string,
  status: "running" | "completed" | "failed" | "final",
  requestId: string,
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
): void {
  // Try to get queue from global map first (preferred for LangGraph compatibility)
  let queue = getEventQueue(requestId);

  // Fall back to AsyncLocalStorage if global map doesn't have it
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    console.warn("❌ Event queue not initialized - event not emitted");
    console.warn(`   Step: ${stepId}, Type: ${stepType}, Title: ${title}, RequestId: ${requestId}`);
    return;
  }

  const event = {
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

  queue.add(event);
  console.log(`✅ Event emitted to queue [${requestId}]: stepId=${stepId}, type=${stepType}, status=${status}, resultCount=${details?.resultCount}`);
}

/**
 * Emit a completion event.
 * @param content Final response content
 * @param requestId Request identifier
 * @param stepId Optional step ID for linking
 */
export function emitCompletion(content: string, requestId: string, stepId: string = "final"): void {
  let queue = getEventQueue(requestId);
  if (!queue) {
    queue = eventQueueStorage.getStore();
  }

  if (!queue) {
    console.warn("❌ Event queue not initialized - completion not emitted");
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
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
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
    console.warn("❌ Event queue not initialized - error not emitted");
    return;
  }

  queue.add({
    type: "error",
    data: {
      message,
      code,
      isSystemError,
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
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
      console.log(`📊 Legacy queue drained: ${events.length} events`);
      return events;
    }
    console.warn("❌ No event queue found in map or AsyncLocalStorage when draining");
    return [];
  }

  const events = queue.drain();
  console.log(`📊 Queue drained: ${events.length} events`);
  events.forEach((ev, i) => {
    console.log(`   [${i}] type=${ev.type}, stepId=${(ev.data as any).stepId}`);
  });
  return events;
}
