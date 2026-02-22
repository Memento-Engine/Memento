"use client";

import {
  chatRequest,
  MementoUIMessage,
  thinkingSchema,
} from "@/components/types";
import { ChatContext } from "@/contexts/chatContext";
import { useEffect, useState } from "react";

interface ChatProviderProps {
  children: React.ReactNode;
}

export default function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<MementoUIMessage[]>([]);

  const BASE_URL = "http://localhost:9090/api/v1";

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

  async function handleSseEvent(eventChunk: string) {
    console.log("HANDLE EVENT AT:", Date.now());
    const parsedEvent = parseSSEEvent(eventChunk);
    if (!parsedEvent) return;

    const { eventType, data } = parsedEvent;

    // Fallback in case eventType is undefined or empty
    const type = (eventType || "message").trim();
    console.log(`[SSE] Type: '${type}', Data:`, data);

    switch (type) {
      case "thinking": {
        const parsedThinking = thinkingSchema.safeParse(data);

        if (!parsedThinking.success) {
          console.log(
            "Failed to parse the thinking schema",
            parsedThinking.error,
          );
          return;
        }

        // This is a single object, e.g., { title: "...", status: "running", ... }
        const thinkingSteps = parsedThinking.data;

        console.log("Thinking Steps from Case Thinking", thinkingSteps);

        setMessages((prev) => {
          try {
            const lastMessage = prev[prev.length - 1];

            // 1. If no assistant message exists → create a new one
            if (!lastMessage || lastMessage.role !== "assistant") {
              const safeId =
                typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : Date.now().toString() +
                    Math.random().toString(36).substring(2);

              return [
                ...prev,
                {
                  id: safeId,
                  role: "assistant",
                  parts: [
                    {
                      type: "data-thinking",
                      data: thinkingSteps, // Pass the object directly, NOT an array
                    },
                  ],
                },
              ];
            }

            // 2. Update existing assistant message
            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            // If the last part exists but isn't 'data-thinking', add it as a new part
            updatedParts.push({
              type: "data-thinking",
              data: thinkingSteps, // Pass the object directly
            });

            updatedMessage.parts = updatedParts;
            updatedMessages[updatedMessages.length - 1] = updatedMessage;

            console.log("UpdatedMessages", updatedMessages);

            return updatedMessages;
          } catch (error) {
            console.error("Error inside state updater:", error);
            return prev;
          }
        });

        break;
      }
      case "citation":
        break;

      case "token": {
        const token: string = data?.text ?? "";

        setMessages((prev) => {
          try {
            const lastMessage = prev[prev.length - 1];

            // 1. If no assistant message, create a brand new one
            if (!lastMessage || lastMessage.role !== "assistant") {
              // SAFE ID GENERATION FALLBACK
              const safeId =
                typeof crypto.randomUUID === "function"
                  ? crypto.randomUUID()
                  : Date.now().toString() +
                    Math.random().toString(36).substring(2);

              return [
                ...prev,
                {
                  id: safeId,
                  role: "assistant",
                  parts: [{ type: "text", text: token }],
                },
              ];
            }

            // 2. If we are appending, clone and update
            const updatedMessages = [...prev];
            const updatedMessage = { ...lastMessage };
            const updatedParts = [...updatedMessage.parts];

            const lastPart = updatedParts[updatedParts.length - 1];

            if (lastPart && lastPart.type === "text") {
              updatedParts[updatedParts.length - 1] = {
                ...lastPart,
                text: lastPart.text + token,
              };
            } else {
              updatedParts.push({ type: "text", text: token });
            }

            updatedMessage.parts = updatedParts;
            updatedMessages[updatedMessages.length - 1] = updatedMessage;

            return updatedMessages;
          } catch (error) {
            console.error("Error inside state updater:", error);
            return prev; // Return previous state to avoid UI crashes
          }
        });
        break;
      }

      case "done":
        console.log("Stream Done");
        break;

      default:
        console.warn(`Unhandled SSE Event Type: '${type}'`);
        break;
    }
  }

  const sendMessage = async (message: string): Promise<void> => {
    console.log("Message from chat input", message);
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
      const chatRequest: chatRequest = {
        chat_history: [...filtered_messages, currentChat],
        message_id: "123",
      };

      setMessages((prev) => [...prev, currentChat]);

      const res = await fetch(`${BASE_URL}/search_stream_handler`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chatRequest),
      });

      if (!res.body) throw new Error("No response body");

      console.log("Response body", res.body);

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split(/\r?\n\r?\n/);

        buffer = events.pop() || "";

        for (const event of events) {
          await handleSseEvent(event);
        }
      }
    } catch (err: unknown) {
      console.log("err while sending the message: ", err);
    }
  };

  useEffect((): void => {
    console.log("Messages in providerse", messages);
  }, [messages]);

  return (
    <ChatContext.Provider
      value={{
        sendMessage,
        chatId: "",
        isMessagesLoaded: false,
        messages,
        rewrite: () => {},
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
