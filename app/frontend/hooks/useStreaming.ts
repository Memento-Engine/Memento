import { useRef, useCallback } from "react";
import { MementoUIMessage, ThinkingStep } from "@/components/types";
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
  ensureAssistantMessage,
} from "@/lib/messageUtils";

const BASE_URL = "http://localhost:4173/api/v1";

// Helper to get auth headers from cookies and localStorage
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Get access token from cookie
  if (typeof document !== "undefined") {
    const cookies = document.cookie.split(";");
    const accessTokenCookie = cookies.find((c) =>
      c.trim().startsWith("accessToken=")
    );
    if (accessTokenCookie) {
      const accessToken = accessTokenCookie.split("=")[1]?.trim();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
    }
  }

  // Get device ID from localStorage
  if (typeof localStorage !== "undefined") {
    const deviceId = localStorage.getItem("deviceId");
    if (deviceId) {
      headers["X-Device-ID"] = deviceId;
    }
  }

  return headers;
}

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
  streamMessage: (goal: string, signal: AbortSignal) => Promise<void>;
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
      const { message, isSystemError = true } = event.data;

      let errorMessage = message;
      if (!navigator.onLine) {
        errorMessage = "Connection failed";
      } else if (!errorMessage) {
        errorMessage = "Something went wrong, try again.";
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
        console.warn("Received empty text chunk");
        return;
      }

      console.log(`✅ Text chunk received: ${chunk.length} chars`);

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
      const { success = true, message, metadata } = event.data;

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
          }
        }
      }
    },
    [handleStreamEvent],
  );

  // Main streaming function
  const streamMessage = useCallback(
    async (goal: string, signal: AbortSignal) => {
      const headers = getAuthHeaders();
      
      // Validate required auth headers
      if (!headers["X-Device-ID"]) {
        throw new Error("DEVICE_NOT_REGISTERED");
      }
      if (!headers["Authorization"]) {
        throw new Error("AUTH_TOKEN_MISSING");
      }
      
      const res = await fetch(`${BASE_URL}/agent`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({ goal }),
      });

      if (!res.ok) {
        // Handle 401 specifically - may need to re-authenticate
        if (res.status === 401) {
          throw new Error("AUTH_TOKEN_EXPIRED");
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
