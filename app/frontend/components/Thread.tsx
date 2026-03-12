"use client";
import React, { useCallback } from "react";
import ChatInput from "./ChatInput";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";
import MessageItem from "./MessageItem";
import useChatContext from "@/hooks/useChatContext";
import ThinkingBubble from "./ThinkingBubble";

function Thread(): React.ReactElement {
  const { messages, sendMessage, rewrite, stopMessage, isGenerating, assistantStatus } = useChatContext();

  const handleSend = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      await sendMessage(query);
    },
    [sendMessage]
  );

  // Show loading bubble when last message is from user and we're waiting for assistant
  // Don't show if we're already streaming text (assistantStatus === "Streaming")
  const lastMessage = messages[messages.length - 1];
  const showPendingBubble =
    lastMessage?.role === "user" &&
    (assistantStatus === "LocalPending" || assistantStatus === "Thinking");

  return (
    <div className="flex flex-col w-full h-full pt-4 bg-base overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full md:w-4/5 xl:w-4/6 px-4 py-6">
          {messages.map((m, index) => (
            <div key={m.id} className="flex flex-col gap-4">
              <MessageItem
                onEdit={() => console.log("editing")}
                onRegenerate={(messageId) => rewrite(messageId)}
                message={m}
                isFirstMessage={index === 0}
                isLastMessage={index === messages.length - 1}
                status={isGenerating ? "streaming" : "submitted"}
              />
            </div>
          ))}

          {/* Show pending bubble when waiting for assistant response */}
          {showPendingBubble && (
            <div className="flex flex-col gap-4">
              <ThinkingBubble />
            </div>
          )}
        </ConversationContent>

        <ConversationScrollButton />
      </Conversation>

      <div className="p-4 bg-background">
        <div className="mx-auto w-full md:w-4/5 xl:w-4/6">
          <ChatInput
            isGenerating={isGenerating}
            onStop={stopMessage}
            handleSend={handleSend}
          />
        </div>
      </div>
    </div>
  );
}

export default React.memo(Thread);
