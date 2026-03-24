import { useRef, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";
import { isDesktopProductionMode } from "../lib/runtimeMode";
import { MementoUIMessage, SearchMode, ThinkingStep } from "@/components/types";
import {
  AssistantStatus,
  SearchQueryData,
  SourceReviewData,
} from "@/contexts/chatContext";
import {
  parseStreamEvent,
  ThinkingEvent,
  ErrorEvent,
  TextEvent,
  CompleteEvent,
  SourcesEvent,
} from "@/lib/streamSchemas";
import {
  appendThinkingStep,
  appendTextChunk,
  appendErrorMessage,
  updateSources,
  updateFollowups,
  ensureAssistantMessage,
} from "@/lib/messageUtils";
import { getAgentBaseUrl } from "@/api/base";
import { getAuthHeaders } from "@/api/auth";

interface StreamHandlerCallbacks {
  setMessages: React.Dispatch<React.SetStateAction<MementoUIMessage[]>>;
  setStepUpdates: React.Dispatch<React.SetStateAction<ThinkingStep[]>>;
  transitionStatus: (nextState: AssistantStatus) => boolean;
  setSearchQueries: React.Dispatch<React.SetStateAction<SearchQueryData[]>>;
  setSourceReview: React.Dispatch<
    React.SetStateAction<SourceReviewData | null>
  >;
}

interface UseStreamingResult {
  activeRequestRef: React.RefObject<AbortController | null>;
  streamMessage: (
    goal: string,
    signal: AbortSignal,
    searchMode?: SearchMode,
    sessionId?: string,
  ) => Promise<void>;
  abort: () => void;
}

export function useStreaming(
  callbacks: StreamHandlerCallbacks,
): UseStreamingResult {
  const activeRequestRef = useRef<AbortController | null>(null);
  const {
    setMessages,
    setStepUpdates,
    transitionStatus,
  } = callbacks;

  // Event Handlers
  const handleThinkingEvent = useCallback(
    (event: ThinkingEvent) => {
      transitionStatus("Thinking");
      const thinkingStep = event.data;

      setStepUpdates((prev) => [...prev, thinkingStep]);
      setMessages((prev) => {
        try {
          return appendThinkingStep(prev, thinkingStep);
        } catch (error) {
          console.error("Error updating messages with thinking data:", error);
          return prev;
        }
      });
    },
    [setMessages, setStepUpdates, transitionStatus],
  );

  const handleErrorEvent = useCallback(
    (event: ErrorEvent) => {
      const { message, isSystemError = true, rateLimit } = event.data;

      let errorMessage = message;
      if (!navigator.onLine) {
        errorMessage = "Connection failed";
      } else if (!errorMessage) {
        errorMessage = "Something went wrong, try again.";
      }

      // Handle rate limit errors with user-friendly message
      if (rateLimit) {
        const { tier, type, retryAfterMs } = rateLimit;
        if (type === "daily_tokens") {
          errorMessage = "You've reached your daily usage limit. Please try again tomorrow.";
        } else if (type === "requests_per_minute") {
          const retrySeconds = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60;
          errorMessage = `Too many requests. Please wait ${retrySeconds} seconds and try again.`;
        } else if (type === "no_credits") {
          errorMessage = "No premium credits available. Consider upgrading your plan.";
        }
        console.warn("Rate limit error:", { tier, type, retryAfterMs });
      }

      if (isSystemError) {
        console.error("System error received:", errorMessage);
        transitionStatus("Error");
      } else {
        console.log("No results detected:", errorMessage);
        transitionStatus("Finished");
      }

      setMessages((prev) => {
        try {
          return appendErrorMessage(prev, errorMessage);
        } catch (error) {
          console.error("Error updating messages with error:", error);
          return prev;
        }
      });
    },
    [setMessages, transitionStatus],
  );

  const handleTextEvent = useCallback(
    (event: TextEvent) => {
      transitionStatus("Streaming");
      const { chunk } = event.data;

      if (!chunk) {
        return;
      }

      setMessages((prev) => {
        try {
          return appendTextChunk(prev, chunk);
        } catch (error) {
          console.error("Error updating messages with text chunk:", error);
          return prev;
        }
      });
    },
    [setMessages, transitionStatus],
  );

  const handleCompleteEvent = useCallback(
    (event: CompleteEvent) => {
      const { success = true, message, metadata, followups } = event.data;

      console.log(`✅ Execution complete - success: ${success}`);

      if (success) {
        if (metadata?.noResultsFound) {
          transitionStatus("NoResults");
        } else {
          transitionStatus("Finished");
        }

        // Only add message if we don't already have content
        if (message) {
          setMessages((prev) => {
            try {
              return ensureAssistantMessage(prev, message);
            } catch (error) {
              console.error("Error handling completion message:", error);
              return prev;
            }
          });
        }

        if (Array.isArray(followups) && followups.length > 0) {
          setMessages((prev) => {
            try {
              return updateFollowups(prev, followups);
            } catch (error) {
              console.error("Error handling completion followups:", error);
              return prev;
            }
          });
        }
      } else {
        transitionStatus("Error");
        setMessages((prev) => {
          try {
            return ensureAssistantMessage(
              prev,
              "An error occurred while processing your request. Please try again.",
            );
          } catch (error) {
            console.error("Error handling completion error:", error);
            return prev;
          }
        });
      }
    },
    [setMessages, transitionStatus],
  );

  const handleSourcesEvent = useCallback(
    (event: SourcesEvent) => {
      const sourcesPayload = event.data;

      setMessages((prev) => {
        try {
          return updateSources(prev, sourcesPayload);
        } catch (error) {
          console.error("Error updating messages with sources:", error);
          return prev;
        }
      });
    },
    [setMessages],
  );

  // Main event dispatcher
  const handleStreamEvent = useCallback(
    (rawEvent: unknown): boolean => {
      console.log("Received raw event:", rawEvent);
      const event = parseStreamEvent(rawEvent);

      if (!event) {
        console.warn("Skipping unparseable event");
        return false;
      }

      console.log(`[Stream Event] Type: '${event.type}'`, event.data);

      switch (event.type) {
        case "thinking":
          handleThinkingEvent(event);
          break;
        case "error":
          handleErrorEvent(event);
          return true; // Signal to stop processing
        case "text":
          handleTextEvent(event);
          break;
        case "complete":
          handleCompleteEvent(event);
          break;
        case "sources":
          handleSourcesEvent(event);
          break;
        default:
          console.error("Invalid Event Type:", event);
      }

      return false;
    },
    [
      handleThinkingEvent,
      handleErrorEvent,
      handleTextEvent,
      handleCompleteEvent,
      handleSourcesEvent,
    ],
  );

  // Process incoming stream
  const processStream = useCallback(
    async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let eventCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`Stream ended. Total events received: ${eventCount}`);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const rawEvent = JSON.parse(line);
            eventCount++;
            console.log(
              `[Event #${eventCount}] Received: type=${rawEvent.type}`,
            );

            const shouldStop = handleStreamEvent(rawEvent);
            if (shouldStop) {
              console.warn("Stopping stream processing due to error event");
              return;
            }
          } catch (e) {
            console.warn("Failed to parse streaming event:", line, e);
            if (isDesktopProductionMode()) {
              Sentry.withScope((scope) => {
                scope.setTag("environment", "frontend");
                scope.setTag("service", "ui");
                scope.setTag("area", "streaming");
                scope.setExtra("rawLine", line);
                Sentry.captureException(e);
              });
            }
          }
        }
      }
    },
    [handleStreamEvent],
  );

  // Main streaming function
  const streamMessage = useCallback(
    async (goal: string, signal: AbortSignal, searchMode: SearchMode = "search", sessionId?: string) => {
      // Get auth headers from OS keyring (async)
      const headers = await getAuthHeaders();

      // Anonymous users can use the API without auth headers
      // The backend will handle rate limiting by IP address
      // Only authenticated users need Authorization header

      // Get the agent server URL dynamically from port file
      const baseUrl = await getAgentBaseUrl();
      console.log("Base uRL", baseUrl);
      
      const res = await fetch(`${baseUrl}/agent`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({ goal, mode: searchMode, sessionId }),
      });

      if (!res.ok) {
        // Handle 401 specifically - try to get more specific error message
        if (res.status === 401) {
          try {
            const errorBody = await res.json();
            const message = errorBody?.error?.message || errorBody?.message || "AUTH_TOKEN_EXPIRED";
            throw new Error(message);
          } catch {
            throw new Error("AUTH_TOKEN_EXPIRED");
          }
        }
        if (isDesktopProductionMode()) {
          Sentry.withScope((scope) => {
            scope.setTag("environment", "frontend");
            scope.setTag("service", "ui");
            scope.setTag("area", "streaming");
            scope.setExtra("status", res.status);
            scope.setExtra("statusText", res.statusText);
            Sentry.captureMessage("Agent stream request failed", "error");
          });
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      console.log("Streaming response received from backend");
      await processStream(res.body.getReader());
    },
    [processStream],
  );

  const abort = useCallback(() => {
    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
      activeRequestRef.current = null;
    }
  }, []);

  return {
    activeRequestRef,
    streamMessage,
    abort,
  };
}
