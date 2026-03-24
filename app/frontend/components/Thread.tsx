"use client";
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
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
  const latestUserMessageRef = useRef<HTMLDivElement | null>(null);
  const topPinFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);


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
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const shouldPinLatestUserMessage =
    isGenerating && latestUserMessage !== undefined;

  const pinLatestUserMessageToTop = useCallback(() => {
    const scrollElement = conversationRef.current?.scrollRef.current;
    const contentElement = conversationRef.current?.contentRef.current;
    const anchorElement = latestUserMessageRef.current;

    if (!scrollElement || !contentElement || !anchorElement) {
      return false;
    }

    const scrollRect = scrollElement.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();
    const topPadding = Number.parseFloat(
      window.getComputedStyle(contentElement).paddingTop || "0",
    );
    const targetTop =
      scrollElement.scrollTop + (anchorRect.top - scrollRect.top) - topPadding;

    scrollElement.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: "auto",
    });

    return true;
  }, []);

  useLayoutEffect(() => {
    if (topPinFrameRef.current !== null) {
      window.cancelAnimationFrame(topPinFrameRef.current);
      topPinFrameRef.current = null;
    }

    if (!shouldPinLatestUserMessage) {
      return;
    }

    if (!pinLatestUserMessageToTop()) {
      return;
    }

    topPinFrameRef.current = window.requestAnimationFrame(() => {
      topPinFrameRef.current = null;
      pinLatestUserMessageToTop();
    });
  }, [latestUserMessage, pinLatestUserMessageToTop, shouldPinLatestUserMessage]);

  useEffect(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    if (!shouldPinLatestUserMessage) {
      return;
    }

    const contentElement = conversationRef.current?.contentRef.current;

    if (!contentElement) {
      return;
    }

    resizeObserverRef.current = new ResizeObserver(() => {
      if (topPinFrameRef.current !== null) {
        window.cancelAnimationFrame(topPinFrameRef.current);
      }

      topPinFrameRef.current = window.requestAnimationFrame(() => {
        topPinFrameRef.current = null;
        pinLatestUserMessageToTop();
      });
    });

    resizeObserverRef.current.observe(contentElement);

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [pinLatestUserMessageToTop, shouldPinLatestUserMessage]);

  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();

      if (topPinFrameRef.current !== null) {
        window.cancelAnimationFrame(topPinFrameRef.current);
      }
    },
    [],
  );

  return (
    <div className="flex flex-col w-full h-full pt-4 bg-base overflow-hidden">
      <Conversation className="flex-1" contextRef={conversationRef}>
        <ConversationContent className="mx-auto w-full md:w-4/5 xl:w-4/6 px-4 py-6">
          {messages.map((m, index) => (
            <div
              key={m.id}
              className="flex flex-col gap-4"
              ref={
                m.id === latestUserMessage?.id
                  ? latestUserMessageRef
                  : null
              }
            >
              <MessageItem
                onEdit={handleEdit}
                onRegenerate={handleRegenerate}
                onFollowupClick={(query) => handleSend(query, "search")}
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
