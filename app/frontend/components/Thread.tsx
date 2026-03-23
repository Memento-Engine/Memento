"use client";
import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import type { StickToBottomContext } from "use-stick-to-bottom";
import ChatInput from "./ChatInput";
import type { SearchMode } from "./types";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";
import MessageItem from "./MessageItem";
import useChatContext from "@/hooks/useChatContext";
import ThinkingBubble from "./ThinkingBubble";

function Thread(): React.ReactElement {
  const {
    messages,
    sendMessage,
    rewrite,
    stopMessage,
    isGenerating,
    assistantStatus,
  } = useChatContext();
  const conversationRef = useRef<StickToBottomContext | null>(null);
  const lastSubmittedMessageRef = useRef<HTMLDivElement | null>(null);
  const lastAnchoredUserMessageIdRef = useRef<string | null>(null);


  const handleSend = useCallback(
    async (query: string, searchMode: SearchMode) => {
      if (!query.trim()) return;
      await sendMessage(query, undefined, false, searchMode);
    },
    [sendMessage],
  );

  // Stable callback for regenerate to avoid re-renders
  const handleRegenerate = useCallback(
    (messageId: string) => rewrite(messageId),
    [rewrite],
  );

  // Stable no-op for edit since it's not implemented
  const handleEdit = useCallback(() => {}, []);

  // Show loading bubble when last message is from user and we're waiting for assistant
  // Don't show if we're already streaming text (assistantStatus === "Streaming")
  const lastMessage = messages[messages.length - 1];
  const showPendingBubble =
    lastMessage?.role === "user" && assistantStatus === "LocalPending";

  useLayoutEffect(() => {
    if (lastMessage?.role !== "user") {
      return;
    }

    if (lastAnchoredUserMessageIdRef.current === lastMessage.id) {
      return;
    }

    const scrollElement = conversationRef.current?.scrollRef.current;
    const contentElement = conversationRef.current?.contentRef.current;
    const anchorElement = lastSubmittedMessageRef.current;

    if (!scrollElement || !contentElement || !anchorElement) {
      return;
    }

    const scrollRect = scrollElement.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();
    const topPadding = Number.parseFloat(
      window.getComputedStyle(contentElement).paddingTop || "0",
    );

    scrollElement.scrollTo({
      top:
        scrollElement.scrollTop +
        (anchorRect.top - scrollRect.top) -
        topPadding,
      behavior: "auto",
    });

    lastAnchoredUserMessageIdRef.current = lastMessage.id;
  }, [lastMessage]);

  return (
    <div className="flex flex-col w-full h-full pt-4 bg-base overflow-hidden">
      <Conversation className="flex-1" contextRef={conversationRef}>
        <ConversationContent className="mx-auto w-full md:w-4/5 xl:w-4/6 px-4 py-6">
          {messages.map((m, index) => (
            <div
              key={m.id}
              className="flex flex-col gap-4"
              ref={
                m.id === lastMessage?.id && m.role === "user"
                  ? lastSubmittedMessageRef
                  : null
              }
            >
              <MessageItem
                onEdit={handleEdit}
                onRegenerate={handleRegenerate}
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
