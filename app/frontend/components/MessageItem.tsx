"use client";

import type { ChatStatus } from "ai";
import {
  RefreshCwIcon,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import React, { useCallback, useState } from "react";
import { RenderMarkdown } from "./RenderMarkdown";
import { CopyButton } from "./CopyButton";
import { EditMessageDialog } from "./EditMessageDialog";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { MementoUIMessage, SourceRecord } from "./types";
import { StepThinking } from "./StepThinking";
import useChatContext from "@/hooks/useChatContext";
import ThinkingBubble from "./ThinkingBubble";
import ImageSearchGrid from "./ImageSearchGrid";
import useReferenceContext from "@/hooks/useReferenceContext";
import { notify } from "@/lib/notify";
import SourcesButton from "./SourcesButton";

export type MessageItemProps = {
  message: MementoUIMessage;
  isFirstMessage: boolean;
  isLastMessage: boolean;
  status: ChatStatus;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newText: string) => void;
};

const CONTENT_TYPE = {
  TEXT: "text",
} as const;

function MessageItem({
  message,
  isFirstMessage,
  isLastMessage,
  status,
  onRegenerate,
  onEdit,
}: MessageItemProps): React.ReactElement {
  const { assistantStatus } = useChatContext();
  const { setReferenceMeta, setSourceList } = useReferenceContext();
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);

  // Only show as "streaming" when actually receiving text (not during thinking)
  const isStreaming = isLastMessage && assistantStatus === "Streaming";

  // Show message controls when not in any active state
  const showControls =
    !isLastMessage ||
    (assistantStatus !== "LocalPending" &&
      assistantStatus !== "Thinking" &&
      assistantStatus !== "Streaming");

  // Extract sources from message parts
  const sourceMap = new Map<string, SourceRecord>();
  let includeImages = false;
  for (const part of message.parts) {
    if (part.type === "data-sources") {
      includeImages = !!part.data?.includeImages;
      const sources = part.data?.sources ?? [];
      for (const source of sources) {
        if (!sourceMap.has(source.chunkId)) {
          sourceMap.set(source.chunkId, source);
        }
      }
    }
  }
  const sourceList = Array.from(sourceMap.values());

  // Get full text content for copy button
  const getFullTextContent = useCallback(() => {
    return message.parts
      .filter(
        (part): part is { type: "text"; text: string } =>
          part.type === CONTENT_TYPE.TEXT,
      )
      .map((part) => part.text)
      .join("\n");
  }, [message.parts]);

  const handleEdit = useCallback(
    (newText: string) => {
      onEdit?.(message.id, newText);
    },
    [onEdit, message.id],
  );

  const handleShare = useCallback(async () => {
    const text = getFullTextContent();
    if (!text.trim()) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Memento Response",
          text,
        });
        return;
      }

      await navigator.clipboard.writeText(text);
      notify.success("Message copied to clipboard");
    } catch {
      notify.error("Unable to share message");
    }
  }, [getFullTextContent]);

  const renderTextPart = (
    part: { type: "text"; text: string },
    partIndex: number
  ) => {
    if (!part.text || part.text.trim() === "") {
      return null;
    }
    const isLastPart = partIndex === message.parts.length - 1;

    return (
      <div key={`${message.id}-${partIndex}`} className="w-full">
        {message.role === "user" ? (
          <div className="flex justify-end w-full h-full text-start wrap-break-word whitespace-normal">
            <div className="bg-secondary relative text-foreground p-2 rounded-md inline-block max-w-[80%]">
              <div className="select-text text-sm whitespace-pre-wrap">
                {part.text}
              </div>
            </div>
          </div>
        ) : (
          <RenderMarkdown
            sourceMap={sourceMap}
            content={part.text}
            isStreaming={isStreaming && isLastPart}
            messageId={message.id}
            onMemoryClick={(chunkId) => {
              const source = sourceMap.get(chunkId);
              if (!source) return;

              setSourceList(sourceList);
              setReferenceMeta({
                app_name: source.appName,
                browser_url: source.browserUrl,
                captured_at: source.capturedAt,
                chunk_id: source.chunkId,
                image_path: source.imagePath,
                text_content:
                  source.normalizedTextLayout?.normalized_text ??
                  source.textContent,
                text_json: source.textJson ?? undefined,
                normalized_text_layout:
                  source.normalizedTextLayout ?? undefined,
                window_height: source.windowHeight ?? 0,
                window_title: source.windowTitle,
                window_width: source.windowWidth ?? 0,
                window_x: source.windowX ?? 0,
                window_y: source.windowY ?? 0,
              });
            }}
          />
        )}
      </div>
    );
  };

  const renderStepThinking = (): React.ReactElement => {
    // Only render thinking steps for assistant messages
    if (message.role !== "assistant" || !isLastMessage) {
      return <></>;
    }

    const steps = message.parts
      .filter((p) => p.type === "data-thinking")
      .map((p) => p.data);

    // Show StepThinking if we have steps
    if (steps.length > 0) {
      return <StepThinking steps={steps} />;
    }

    // Show loading bubble ONLY during LocalPending/Thinking (before text starts)
    if (assistantStatus === "LocalPending" || assistantStatus === "Thinking") {
      return <ThinkingBubble />;
    }

    return <></>;
  };

  const renderAssistantDraft = () => {
    if (!isLastMessage) return null;

    if (assistantStatus === "Error") {
      return (
        <div className="flex items-center gap-2 mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <div className="flex-1">
            <p className="text-sm text-destructive font-medium">
              Something went wrong
            </p>
            <p className="text-xs text-destructive/70 mt-1">
              An error occurred while processing your request. Please try again.
            </p>
          </div>
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRegenerate(message.id)}
              className="shrink-0"
            >
              Retry
            </Button>
          )}
        </div>
      );
    }

    return null;
  };

  const renderImageGrid = (): React.ReactElement => {
    if (
      message.role === "assistant" &&
      includeImages &&
      sourceList.length > 0
    ) {
      return (
        <ImageSearchGrid
          sources={sourceList}
          onSelect={(source) => {
            setSourceList(sourceList);
            setReferenceMeta({
              app_name: source.appName,
              browser_url: source.browserUrl,
              captured_at: source.capturedAt,
              chunk_id: source.chunkId,
              image_path: source.imagePath,
              text_content:
                source.normalizedTextLayout?.normalized_text ??
                source.textContent,
              text_json: source.textJson ?? undefined,
              normalized_text_layout: source.normalizedTextLayout ?? undefined,
              window_height: source.windowHeight ?? 0,
              window_title: source.windowTitle,
              window_width: source.windowWidth ?? 0,
              window_x: source.windowX ?? 0,
              window_y: source.windowY ?? 0,
            });
          }}
        />
      );
    }
    return <></>;
  };

  return (
    <>
      {renderStepThinking()}
      {renderImageGrid()}
      <div className="w-full mb-4">
        {message.parts.map((part, i) => {
          if (part.type === CONTENT_TYPE.TEXT) {
            return renderTextPart(part as { type: "text"; text: string }, i);
          }
          return null;
        })}

        {/* Message actions for user messages */}
        {message.role === "user" && showControls && (
          <div className="flex items-center justify-end gap-1 text-muted-foreground text-xs mt-4">
            <CopyButton text={getFullTextContent()} />
            {onEdit && status !== "streaming" && (
              <EditMessageDialog
                message={getFullTextContent()}
                onSave={handleEdit}
              />
            )}
          </div>
        )}

        {/* Message actions for assistant messages */}
        {message.role === "assistant" && showControls && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs mt-2">
            <div className="flex items-center gap-1">
              <CopyButton text={getFullTextContent()} />

              {onRegenerate && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onRegenerate(message.id)}
                  title="Regenerate response"
                >
                  <RefreshCwIcon size={16} />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setFeedback(feedback === "like" ? null : "like")}
                title="Like"
                className={cn(feedback === "like" && "text-primary")}
              >
                <ThumbsUp size={16} />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  setFeedback(feedback === "dislike" ? null : "dislike")
                }
                title="Dislike"
                className={cn(feedback === "dislike" && "text-primary")}
              >
                <ThumbsDown size={16} />
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleShare}
                title="Share"
              >
                <Share2 size={16} />
              </Button>
            </div>

            <SourcesButton
              sourceList={sourceList}
              setReferenceMeta={setReferenceMeta}
              setSourceList={(sources) =>
                setSourceList(sources as SourceRecord[])
              }
            />
          </div>
        )}
      </div>
      {renderAssistantDraft()}
    </>
  );
}

export default React.memo(MessageItem, (prevProps, nextProps) => {
  // Always re-render if this is the last message (could be streaming)
  if (nextProps.isLastMessage) {
    return false;
  }

  return (
    prevProps.message === nextProps.message &&
    prevProps.isFirstMessage === nextProps.isFirstMessage &&
    prevProps.isLastMessage === nextProps.isLastMessage &&
    prevProps.status === nextProps.status
  );
});
