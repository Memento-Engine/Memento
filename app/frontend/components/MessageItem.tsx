"use client";

import { extractFilesFromPrompt, FileMetadata } from "@/lib/fileMetadata";
import type { ChatStatus } from "ai";
import { Loader2, Paperclip, RefreshCwIcon } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { RenderMarkdown } from "./RenderMarkdown";
import { CopyButton } from "./CopyButton";
import { EditMessageDialog } from "./EditMessageDialog";

export type MessageItemProps = {
  message: MementoUIMessage;
  isFirstMessage: boolean;
  isLastMessage: boolean;
  status: ChatStatus;
  reasoningContainerRef?: React.RefObject<HTMLDivElement | null>;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newText: string) => void;
  onDelete?: (messageId: string) => void;
  assistant?: { avatar?: React.ReactNode; name?: string };
  showAssistant?: boolean;
};

const CONTENT_TYPE = {
  TEXT: "text",
  FILE: "file",
  REASONING: "reasoning",
} as const;

const CHAT_STATUS = {
  STREAMING: "streaming",
  SUBMITTED: "submitted",
} as const;
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Citation, MementoUIMessage } from "./types";
import { mockSteps, StepThinking } from "./StepThinking";
import useChatContext from "@/hooks/useChatContext";
import MementoBreathing from "./MementoBreathing";
import ThinkingBubble from "./ThinkingBubble";
import ImageSearchGrid from "./ImageSearchGrid";

function MessageItem({
  message,
  isFirstMessage,
  isLastMessage,
  status,
  reasoningContainerRef,
  onRegenerate,
  onEdit,
  onDelete,
  assistant,
  showAssistant,
}: MessageItemProps): React.ReactElement {
  const { assistantStatus } = useChatContext();
  const isStreaming: boolean =
    isLastMessage &&
    (assistantStatus == "LocalPending" ||
      assistantStatus == "Thinking" ||
      assistantStatus == "Streaming");

  const citationMap = new Map<number, Citation>();
  for (const part of message.parts) {
    console.log("Part in all ", part);
    if (part.type === "data-citations") {
      const citations = part.data;
      for (let citation of citations) {
        if (!citationMap.has(citation.sourceId)) {
          citationMap.set(citation.sourceId, citation);
        }
      }
    }
  }

  console.log("Citation Map", citationMap);

  // Extract file metadata from message text (for user messages with attachments)
  const attachedFiles = useMemo(() => {
    if (message.role !== "user") return [];

    const textParts = message.parts.filter(
      (part): part is { type: "text"; text: string } =>
        part.type === CONTENT_TYPE.TEXT,
    );

    if (textParts.length === 0) return [];

    const { files } = extractFilesFromPrompt(textParts[0].text);
    return files;
  }, [message.parts, message.role]);

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

  const renderTextPart = (
    part: { type: "text"; text: string },
    partIndex: number,
  ) => {
    console.log("error", part.text, part.type);
    if (!part.text || part.text.trim() === "") {
      return null;
    }
    const isLastPart = partIndex === message.parts.length - 1;

    // For user messages, extract and clean the text from file metadata
    const displayText =
      message.role === "user"
        ? extractFilesFromPrompt(part.text).cleanPrompt
        : part.text;

    if (
      !displayText.trim() &&
      message.role === "user" &&
      attachedFiles.length === 0
    ) {
      return null;
    }

    return (
      <div key={`${message.id}-${partIndex}`} className="w-full">
        {message.role === "user" ? (
          <div className="flex justify-end w-full h-full text-start wrap-break-word whitespace-normal">
            <div className="bg-secondary relative text-foreground p-2 rounded-md inline-block max-w-[80%]">
              {/* Show attached files if any */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {attachedFiles.map((file: FileMetadata, idx: number) => (
                    <div
                      key={`file-${idx}-${file.id}`}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-secondary border text-xs"
                    >
                      <Paperclip size={14} className="text-muted-foreground" />
                      <span className="font-medium">{file.name}</span>
                      {file.injectionMode && (
                        <span className="text-muted-foreground">
                          ({file.injectionMode})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {displayText && (
                <div className="select-text text-sm whitespace-pre-wrap">
                  {displayText}
                </div>
              )}
            </div>
          </div>
        ) : (
          <RenderMarkdown
            citationMap={citationMap}
            content={part.text}
            isStreaming={isStreaming && isLastPart}
            messageId={message.id}
          />
        )}
      </div>
    );
  };

  const renderStepThinking = (): React.ReactElement => {
    if (message.role === "assistant" && isLastMessage) {
      const steps = message.parts
        .filter((p) => p.type === "data-thinking")
        .map((p) => p.data);



      return <StepThinking steps={steps} />;
    }
    return <></>;
  };

  const renderAssistantDraft = () => {
    if (isLastMessage) {
      switch (assistantStatus) {
        case "LocalPending":
          return <ThinkingBubble />;

        case "Error":
          // Only show error UI for actual system errors, not for "no results found"
          return (
            <div className="flex items-center gap-2 mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <div className="flex-1">
                <p className="text-sm text-destructive font-medium">
                  Something went wrong
                </p>
                <p className="text-xs text-destructive/70 mt-1">
                  An error occurred while processing your request. Please check your connection and try again.
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

        case "NoResults":
          // "No results found" is not an error - it's a normal response
          // The message content will contain the explanation from the LLM
          return null;

        default:
          return null;
      }
    }
    return null;
  };

  const renderImageGrid = (): React.ReactElement => {
    if (message.role === "assistant") {
      return <ImageSearchGrid />;
    }
    return <></>;
  };

  return (
    <>
      {renderStepThinking()}
      {/* {renderImageGrid()} */}
      <div className="w-full mb-4">
        {message.parts.map((part, i) => {
          switch (part.type) {
            case CONTENT_TYPE.TEXT: {
              return renderTextPart(part as { type: "text"; text: string }, i);
            }
            default: {
              return <></>;
            }
          }
        })}

        {/* Message actions for user messages */}
        {message.role === "user" && (
          <div className="flex items-center justify-end gap-1 text-muted-foreground text-xs mt-4">
            <CopyButton text={getFullTextContent()} />

            {onEdit && status !== CHAT_STATUS.STREAMING && (
              <EditMessageDialog
                message={getFullTextContent()}
                // imageUrls={imageUrls.length > 0 ? imageUrls : undefined}
                onSave={handleEdit}
              />
            )}

            {/* {onDelete && status !== CHAT_STATUS.STREAMING && (
            <DeleteMessageDialog onDelete={handleDelete} />
          )} */}
          </div>
        )}

        {/* Message actions for assistant messages (non-tool) */}
        {message.role === "assistant" && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs mt-2">
            <div
              className={cn("flex items-center gap-1", isStreaming && "hidden")}
            >
              <CopyButton text={getFullTextContent()} />

              {!isStreaming && isLastMessage && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  // onClick={handleRegenerate}
                  title="Regenerate response"
                >
                  <RefreshCwIcon size={16} />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      {renderAssistantDraft()}
    </>
  );
}

export default React.memo(MessageItem, (prevProps, nextProps) => {
  // Always re-render if streaming and this is the last message
  if (nextProps.isLastMessage) {
    return false;
  }

  return (
    prevProps.message === nextProps.message &&
    prevProps.isFirstMessage === nextProps.isFirstMessage &&
    prevProps.isLastMessage === nextProps.isLastMessage &&
    prevProps.status === nextProps.status &&
    prevProps.showAssistant === nextProps.showAssistant
  );
});
