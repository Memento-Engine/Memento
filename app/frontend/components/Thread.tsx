"use client";
import React, { useCallback } from "react";
import { Bot } from "lucide-react";
import ChatInput from "./ChatInput";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";
import MessageItem from "./MessageItem";
import useChatContext from "@/hooks/useChatContext";

function Thread(): React.ReactElement {
  const { messages, sendMessage } = useChatContext();

  const handleSend = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      await sendMessage(query);
    },
    [sendMessage],
  );

  return (
    <div className="flex flex-col w-full h-full pt-4  bg-base overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full md:w-4/5 xl:w-4/6 px-4 py-6">
          {messages.map((m, index) => (
            <div key={m.id} className="flex flex-col gap-4">
              <MessageItem
                onEdit={() => console.log("editing")}
                message={m}
                isFirstMessage={index === 0}
                isLastMessage={index === messages.length - 1}
                status="streaming"
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
              handleSend(q);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default React.memo(Thread);
