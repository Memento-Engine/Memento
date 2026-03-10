"use client";

import { getBaseUrl } from "@/api/base";
import {
  MementoUIMessage,
  sourceSchema,
  sourcesPayloadSchema,
  thinkingSchema,
  ThinkingStep,
} from "@/components/types";
import { AssistantStatus, ChatContext, TRANSITIONS } from "@/contexts/chatContext";
import useSystemHealth from "@/hooks/useSystemHealth";
import { notify } from "@/lib/notify";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ChatProviderProps {
  children: React.ReactNode;
}

export default function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<MementoUIMessage[]>([]);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>("Idle");
  const [stepUpdates, setStepUpdates] = useState<ThinkingStep[]>([]);
  const activeRequestRef = useRef<AbortController | null>(null);

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

  function createMessageId(): string {
    return typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const isGenerating =
    assistantStatus === "LocalPending" ||
    assistantStatus === "Thinking" ||
    assistantStatus === "Streaming";

  const stopMessage = (): void => {
    if (!activeRequestRef.current) return;
    activeRequestRef.current.abort();
    activeRequestRef.current = null;
    setAssistantStatus("Idle");
    notify.info("Generation stopped");
  };

  const rewrite = async (messageId: string): Promise<void> => {
    const assistantIndex = messages.findIndex(
      (message) => message.id === messageId && message.role === "assistant"
    );

    if (assistantIndex < 0) {
      notify.warning("Could not regenerate this message");
      return;
    }

    const userBeforeAssistant = [...messages]
      .slice(0, assistantIndex)
      .reverse()
      .find((message) => message.role === "user");

    const userPrompt =
      userBeforeAssistant?.parts
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n")
        .trim() ?? "";

    if (!userPrompt) {
      notify.warning("No user prompt found for regeneration");
      return;
    }

    await sendMessage(userPrompt, messageId, true);
  };

  function normalizeSource(data: any) {
    const rawChunkId = data.chunkId ?? data.chunk_id ?? data.sourceId ?? data.source_id;
    const chunkId = String(rawChunkId ?? "").startsWith("chunk_")
      ? String(rawChunkId)
      : `chunk_${String(rawChunkId ?? "")}`;

    return {
      chunkId,
      appName: data.appName ?? data.app_name ?? "",
      windowTitle: data.windowTitle ?? data.window_title ?? data.window_name ?? "",
      capturedAt: data.capturedAt ?? data.captured_at ?? "",
      browserUrl: data.browserUrl ?? data.browser_url ?? data.url ?? "",
      textContent: data.textContent ?? data.text_content ?? "",
      textJson: data.textJson ?? data.text_json ?? undefined,
      imagePath: data.imagePath ?? data.image_path ?? "",
      frameId: data.frameId ?? data.frame_id,
      windowX: data.windowX ?? data.window_x,
      windowY: data.windowY ?? data.window_y,
      windowWidth: data.windowWidth ?? data.window_width,
      windowHeight: data.windowHeight ?? data.window_height,
    };
  }

  function getNormalizedSources(rawSources: any[]) {
    return rawSources.map((rawSource) => normalizeSource(rawSource));
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

      case "sources": {
        const normalized = {
          includeImages: !!event.data?.includeImages,
          sources: getNormalizedSources(event.data?.sources ?? []),
        };

        const parsedSources = sourcesPayloadSchema.safeParse(normalized);
        if (!parsedSources.success) {
          console.warn("Failed to parse sources payload", parsedSources.error);
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
                      type: "data-sources",
                      data: parsedSources.data,
                    },
                  ],
                },
              ];
            }

            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            const existingIndex = updatedParts.findIndex(
              (part: any) => part.type === "data-sources"
            );

            if (existingIndex >= 0) {
              updatedParts[existingIndex] = {
                type: "data-sources",
                data: parsedSources.data,
              };
            } else {
              updatedParts.push({
                type: "data-sources",
                data: parsedSources.data,
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

  const sendMessage = async (
    message: string,
    rewriteTargetId?: string,
    isRewrite: boolean = false
  ): Promise<void> => {
    if (!isRunning) {
      notify.error(
        "Memento is offline. Please start the memento by clicking on floating widget or from settings."
      );
      return;
    }

    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
      activeRequestRef.current = null;
    }

    const abortController = new AbortController();
    activeRequestRef.current = abortController;

    router.push("/chat/123");

    console.log("Message from chat input", message);

    transitionStatus("LocalPending");
    setStepUpdates([]); // Reset step updates for new message

    try {
      const currentChat: MementoUIMessage = {
        id: createMessageId(),
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

      if (isRewrite && rewriteTargetId) {
        setMessages((prev) => {
          const targetIndex = prev.findIndex((item) => item.id === rewriteTargetId);
          if (targetIndex < 0) return prev;
          return prev.slice(0, targetIndex);
        });
      } else {
        setMessages((prev) => [...prev, currentChat]);
      }

      const res = await fetch(`${BASE_URL}/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
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
          activeRequestRef.current = null;
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Split by newlines to get individual JSON objects
        const lines = buffer.split("\n");

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || "";
        let isError: boolean = false;

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
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Streaming aborted by user");
        return;
      }

      console.error("Error while sending message:", err);
      transitionStatus("Error");
    } finally {
      if (activeRequestRef.current === abortController) {
        activeRequestRef.current = null;
      }
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
        rewrite,
        stopMessage,
        isGenerating,
        assistantStatus,
        makeTransition: transitionStatus,
        stepUpdates,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
