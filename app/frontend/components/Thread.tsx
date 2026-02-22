"use client";
import React, { useEffect } from "react";
import { Bot } from "lucide-react";
import ChatInput from "./ChatInput";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";
import MessageItem from "./MessageItem";
import useChatContext from "@/hooks/useChatContext";
import { StepThinking } from "./StepThinking";

export default function Thread(): React.ReactElement {
  const { messages, sendMessage } = useChatContext();

  const handleSend = async (query: string) => {
    if (!query.trim()) return;
    console.log("got query fromhandle send", query);
    await sendMessage(query);
  };

  useEffect((): void => {
    console.log("Messages : ", messages);
  }, [messages]);

  return (
    <div className="flex flex-col w-full h-screen bg-base overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full md:w-4/5 xl:w-4/6 px-4 py-6">
          {messages.map((m, index) => (
            <div className="flex flex-col gap-4">
              {m.role === "assistant" &&
                (() => {
                  const steps = m.parts
                    .filter((p) => p.type === "data-thinking")
                    .map((p) => p.data);

                  return <StepThinking
                   steps={steps} />;
                })()}

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
              handleSend(q);
            }}
          />
        </div>
      </div>
    </div>
  );
}
