"use client";

import { getBaseUrl } from "@/api/base";
import {
  chatRequest,
  Citation,
  citationsSchema,
  MementoUIMessage,
  thinkingSchema,
  ThinkingStep,
} from "@/components/types";
import { AssistantStatus, ChatContext, TRANSITIONS } from "@/contexts/chatContext";
import useSystemHealth from "@/hooks/useSystemHealth";
import { notify } from "@/lib/notify";
import { Beaker } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

interface ChatProviderProps {
  children: React.ReactNode;
}

export default function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<MementoUIMessage[]>([]);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>("Idle");
  const [stepUpdates, setStepUpdates] = useState<ThinkingStep[]>([]);

  const { isRunning } = useSystemHealth();
  const router = useRouter();

  const transitionStatus = (nextState: AssistantStatus): boolean => {
    const allowedNextStates = TRANSITIONS[assistantStatus];

    if (allowedNextStates.includes(nextState)) {
      if (nextState === "Finished" || nextState === "NoResults" || nextState === "Error") {
        setAssistantStatus("Idle");
      } else {
        setAssistantStatus(nextState);
      }
      return true;
    }

    console.warn(`Blocked transition from ${assistantStatus} to ${nextState}`);
    return false;
  };

  const BASE_URL = "http://localhost:4173/api/v1";

  function parseSSEEvent(raw: string) {
    const lines = raw.split("\n");

    let eventType = "";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data += line.slice(5).trim();
      }
    }

    if (!data) return null;

    try {
      return {
        eventType,
        data: JSON.parse(data),
      };
    } catch {
      return null;
    }
  }

  function normalizeCitation(data: any): Citation {
    return {
      sourceId: data.source_id,
      appName: data.app_name,
      windowName: data.window_name,
      capturedAt: data.captured_at,
      url: data.url,

      bbox: {
        x: data.bbox.x,
        y: data.bbox.y,
        width: data.bbox.width,
        height: data.bbox.height,
        textStart: data.bbox.text_start,
        textEnds: data.bbox.text_ends,
      },

      imagePath: data.image_path,
    };
  }

  function getNormalizedCitations(rawCitations: any[]): Citation[] {
    let cleanedCitations: Citation[] = [];
    for (let rawCitation of rawCitations) {
      cleanedCitations.push(normalizeCitation(rawCitation));
    }

    return cleanedCitations;
  }

  async function handleStreamingEvent(event: any) {
    const eventType = event.type;

    console.log(`[Stream Event] Type: '${eventType}', Data:`, event.data);

    switch (eventType) {
      case "thinking": {
        // Step progress/thinking update
        transitionStatus("Thinking");

        const thinkingData = event.data;

        // Validate the thinking data against schema
        const parsedThinking = thinkingSchema.safeParse(thinkingData);

        if (!parsedThinking.success) {
          console.warn(" Failed to parse thinking schema");
          console.warn("  | Validation Errors:", parsedThinking.error.issues);
          console.warn("  | Received data:", JSON.stringify(thinkingData, null, 2));
          return;
        }

        console.log("Thinking event validated successfully");
        console.log(
          "  | Step:",
          thinkingData.stepId,
          "Type:",
          thinkingData.stepType,
          "Status:",
          thinkingData.status
        );
        console.log("  | Results:", thinkingData.resultCount ?? 0);

        const thinkingStep = parsedThinking.data;

        // Add to step updates
        setStepUpdates((prev) => [...prev, thinkingStep]);

        // Also add to messages as thinking data
        setMessages((prev) => {
          try {
            const lastMessage = prev[prev.length - 1];

            // 1. If no assistant message exists → create a new one
            if (!lastMessage || lastMessage.role !== "assistant") {
              const safeId =
                typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : Date.now().toString() + Math.random().toString(36).substring(2);

              return [
                ...prev,
                {
                  id: safeId,
                  role: "assistant",
                  parts: [
                    {
                      type: "data-thinking",
                      data: thinkingStep,
                    },
                  ],
                },
              ];
            }

            // 2. Update existing assistant message
            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            updatedParts.push({
              type: "data-thinking",
              data: thinkingStep,
            });

            updatedMessage.parts = updatedParts;
            updatedMessages[updatedMessages.length - 1] = updatedMessage;

            return updatedMessages;
          } catch (error) {
            console.error("Error updating messages with thinking data:", error);
            return prev;
          }
        });

        break;
      }

      case "error": {
        // Error event - check if it's a system error or just "no results"
        const errorData = event.data;
        const isSystemError = errorData.isSystemError ?? true;

        if (isSystemError) {
          // Real system error
          console.error("System error received:", errorData.message);
          transitionStatus("Error");
        } else {
          // Not a system error - treat as normal "no results found" case
          console.log("No results detected:", errorData.message);
          transitionStatus("Finished");
        }

        // Add error message to messages if desired
        setMessages((prev) => {
          try {
            const lastMessage = prev[prev.length - 1];

            if (!lastMessage || lastMessage.role !== "assistant") {
              const safeId =
                typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : Date.now().toString() + Math.random().toString(36).substring(2);

              return [
                ...prev,
                {
                  id: safeId,
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: errorData.message,
                    },
                  ],
                },
              ];
            }

            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            const lastPart = updatedParts[updatedParts.length - 1];

            if (lastPart && lastPart.type === "text") {
              updatedParts[updatedParts.length - 1] = {
                ...lastPart,
                text: lastPart.text + "\n" + errorData.message,
              };
            } else {
              updatedParts.push({ type: "text", text: errorData.message });
            }

            updatedMessage.parts = updatedParts;
            updatedMessages[updatedMessages.length - 1] = updatedMessage;

            return updatedMessages;
          } catch (error) {
            console.error("Error updating messages with error:", error);
            return prev;
          }
        });

        break;
      }

      case "text": {
        // Text streaming event - contains chunk of final response
        const textData = event.data;
        const chunk = textData.chunk;

        if (!chunk) {
          console.warn("Received empty text chunk");
          return;
        }

        console.log(`✅ Text chunk received: ${chunk.length} chars`);
        setMessages((prev) => {
          try {
            const lastMessage = prev[prev.length - 1];

            // If no assistant message exists, create one
            if (!lastMessage || lastMessage.role !== "assistant") {
              const safeId =
                typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : Date.now().toString() + Math.random().toString(36).substring(2);

              return [
                ...prev,
                {
                  id: safeId,
                  role: "assistant",
                  parts: [
                    {
                      type: "text",
                      text: chunk,
                    },
                  ],
                },
              ];
            }

            // Append to existing assistant message
            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            const lastPart = updatedParts[updatedParts.length - 1];

            if (lastPart && lastPart.type === "text") {
              // Append to existing text part
              updatedParts[updatedParts.length - 1] = {
                ...lastPart,
                text: lastPart.text + chunk,
              };
            } else {
              // Add new text part
              updatedParts.push({ type: "text", text: chunk });
            }

            updatedMessage.parts = updatedParts;
            updatedMessages[updatedMessages.length - 1] = updatedMessage;

            return updatedMessages;
          } catch (error) {
            console.error("Error updating messages with text chunk:", error);
            return prev;
          }
        });

        break;
      }

      case "complete": {
        // Completion event - marks end of execution
        // Note: Final text has already been streamed via "text" events
        const completeData = event.data;

        console.log(`✅ Execution complete - success: ${completeData.success}`);

        if (completeData.success) {
          // Successful execution
          if (completeData.metadata?.noResultsFound) {
            // Transition to NoResults state (not an error)
            transitionStatus("NoResults");
          } else {
            transitionStatus("Finished");
          }
        } else {
          // Failed execution
          transitionStatus("Error");

          // Only add error message if no text was already streamed
          setMessages((prev) => {
            try {
              const lastMessage = prev[prev.length - 1];

              if (
                !lastMessage ||
                lastMessage.role !== "assistant" ||
                lastMessage.parts.length === 0
              ) {
                // Only add if no message exists
                const safeId =
                  typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : Date.now().toString() + Math.random().toString(36).substring(2);

                return [
                  ...prev,
                  {
                    id: safeId,
                    role: "assistant",
                    parts: [
                      {
                        type: "text",
                        text: "An error occurred while processing your request. Please try again.",
                      },
                    ],
                  },
                ];
              }

              return prev;
            } catch (error) {
              console.error("Error handling completion error:", error);
              return prev;
            }
          });
        }

        break;
      }

      // Legacy event types (kept for backward compatibility)
      case "citations": {
        const parsedCitations = citationsSchema.safeParse(getNormalizedCitations(event.data));

        if (!parsedCitations.success) {
          console.log("Failed to parse the Citations schema", parsedCitations.error);
          return;
        }

        setMessages((prev) => {
          try {
            const lastMessage = prev[prev.length - 1];

            if (!lastMessage || lastMessage.role !== "assistant") {
              const safeId =
                typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : Date.now().toString() + Math.random().toString(36).substring(2);

              return [
                ...prev,
                {
                  id: safeId,
                  role: "assistant",
                  parts: [
                    {
                      type: "data-citations",
                      data: parsedCitations.data,
                    },
                  ],
                },
              ];
            }

            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            const lastPart = updatedParts[updatedParts.length - 1];

            if (lastPart && lastPart.type === "data-citations") {
              updatedParts[updatedParts.length - 1] = {
                ...lastPart,
                data: parsedCitations.data,
              };
            } else {
              updatedParts.push({
                type: "data-citations",
                data: parsedCitations.data,
              });
            }

            updatedMessage.parts = updatedParts;
            updatedMessages[updatedMessages.length - 1] = updatedMessage;

            return updatedMessages;
          } catch (error) {
            console.error("Error inside state updater:", error);
            return prev;
          }
        });
        break;
      }

      default:
        console.warn(`Unhandled event type: '${eventType}'`);
        break;
    }
  }

  const sendMessage = async (message: string): Promise<void> => {
    if (!isRunning) {
      notify.error(
        "Memento is offline. Please start the memento by clicking on floating widget or from settings."
      );
      return;
    }

    router.push("/chat/123");

    console.log("Message from chat input", message);

    transitionStatus("LocalPending");
    setStepUpdates([]); // Reset step updates for new message

    try {
      const currentChat: MementoUIMessage = {
        id: "12",
        parts: [
          {
            type: "text",
            text: message,
          },
        ],
        role: "user",
      };

      const filtered_messages = messages.map((m) => ({
        ...m,
        parts: m.parts.filter((p) => p.type === "text"),
      }));

      setMessages((prev) => [...prev, currentChat]);

      const res = await fetch(`${BASE_URL}/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ goal: message }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      if (!res.body) throw new Error("No response body");

      console.log("Streaming response received from backend");

      const reader = res.body.getReader();
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

        // Split by newlines to get individual JSON objects
        const lines = buffer.split("\n");

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || "";
        let isError : boolean = false;

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);
            eventCount++;
            console.log(
              ` [Event #${eventCount}] Received: type=${event.type}, Keys:`,
              Object.keys(event)
            );
            if (event.data) {
              console.log(`Data Keys:`, Object.keys(event.data));
              if (event.data.stepId) console.log(`   stepId: ${event.data.stepId}`);
            }

            if (event.type === "error") {
              isError = true;
              console.error("Error event received from backend:", event.data?.message);
              notify.error(`Error: ${event.data?.message || "An error occurred"}`);
              break;
            }


            await handleStreamingEvent(event);
          } catch (e) {
            console.warn("Failed to parse streaming event:", line, e);
          }
        }

        if (isError) {
          console.warn("Stopping stream processing due to error event");
          break;
        }

      }
    } catch (err: unknown) {
      console.error("Error while sending message:", err);
      transitionStatus("Error");
    }
  };

  useEffect((): void => {
    console.log("Assistant status changed to:", assistantStatus);
  }, [assistantStatus]);

  return (
    <ChatContext.Provider
      value={{
        sendMessage,
        chatId: "",
        isMessagesLoaded: false,
        messages,
        rewrite: () => {},
        assistantStatus,
        makeTransition: transitionStatus,
        stepUpdates,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
