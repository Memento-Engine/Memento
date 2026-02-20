"use client";
import React, { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";

import ChatInput from "./ChatInput";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";
import MessageItem from "./MessageItem";
import { UIMessage } from "ai";
import { invoke } from "@tauri-apps/api/core";

import { listen } from "@tauri-apps/api/event";
import { MementoUIMessage } from "./types";
import { conversation } from "@/mock";
import { Thinking } from "./Thinking";
import ImageSearchGrid from "./ImageSearchGrid";

export default function Thread(): React.ReactElement {
  const [messages, setMessages] = useState<MementoUIMessage[]>([]);

  const currentTextRef = useRef<string>("");

  useEffect(() => {
    const unlistenPromise = listen("model-token", (event) => {
      const token = event.payload as string;

      currentTextRef.current += token;

      setMessages((prev) => {
        const last = prev[prev.length - 1];

        return [
          ...prev.slice(0, -1),
          {
            ...last,
            parts: [{ type: "text", text: currentTextRef.current }],
          },
        ];
      });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleSend = async (query: string) => {
    if (!query.trim()) return;
  };

  return (
    // 1. CONTAINER: Use h-screen to fill the Tauri window.
    // Remove 'items-center' so the chat can stretch full width.
    <div className="flex flex-col w-full h-screen bg-background overflow-hidden">
      {/* 2. CHAT AREA: Conversation should be the direct flex child. 
          It handles the scrolling internally. */}
      <Conversation className="flex-1">
        {/* 3. CONTENT WIDTH: Control the "reading width" here with mx-auto */}
        <ConversationContent className="mx-auto w-full md:w-4/5 xl:w-4/6 px-4 py-6">
          {conversation.map((m, index) => (
            <div className="flex flex-col gap-4">

              {m.role == "assistant" && (
                <>
                  <Thinking parts={m.parts} />
                  <ImageSearchGrid />
                </>
              )}

              <MessageItem
                key={m.id}
                onEdit={(): void => console.log("editing")}
                message={m}
                isFirstMessage={index === 0}
                isLastMessage={index === messages.length - 1}
                status={"streaming"} // Pass real status if you have it
                showAssistant={m.role === "assistant"}
                assistant={{
                  name: "Gemini",
                  avatar: <Bot className="size-4" />,
                }}
              />
            </div>
          ))}
        </ConversationContent>

        {/* Don't forget the scroll button! */}
        <ConversationScrollButton />
      </Conversation>

      {/* 4. INPUT AREA: Kept separate at the bottom. 
          Added a matching wrapper so the input aligns with the messages. */}
      <div className="p-4 bg-background">
        <div className="mx-auto w-full md:w-4/5 xl:w-4/6">
          <ChatInput
            handleSend={(q) => {
              console.log("got the query", q);
              handleSend(q);
            }}
          />
        </div>
      </div>
    </div>
  );
}
