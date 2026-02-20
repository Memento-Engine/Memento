import { extractFilesFromPrompt, FileMetadata } from "@/lib/fileMetadata";
import type { UIMessage, ChatStatus } from "ai";
import { Paperclip } from "lucide-react";
import React, { useCallback, useMemo, useState } from "react";
import { RenderMarkdown } from "./RenderMarkdown";
import { CopyButton } from "./CopyButton";
import { EditMessageDialog } from "./EditMessageDialog";
import useReferenceContext from "@/hooks/useReferenceContext";
import { ReferenceMeta } from "@/contexts/referenceContext";
import { Card } from "./ui/card";
import { AspectRatio } from "./ui/aspect-ratio";

export type MessageItemProps = {
  message: UIMessage;
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
import { convertFileSrc } from "@tauri-apps/api/core";
import { Thinking } from "./Thinking";

export default function MessageItem({
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
  const isStreaming = isLastMessage && status === CHAT_STATUS.STREAMING;

  const { setReferenceMeta } = useReferenceContext();

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

    
  // const url = convertFileSrc(
  //   "C:/Users/pavan/Pictures/Screenshots/testOne.png"
  // );

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
              onMemoryClick={(id: string) => {
                if (Array.isArray(message.metadata)) {
                  const meta: ReferenceMeta = message.metadata.find(
                    (m) => m.chunk_id == id,
                  );
                  setReferenceMeta(meta);
                }
              }}
              content={part.text}
              isStreaming={isStreaming && isLastPart}
              messageId={message.id}
            />
        )}
      </div>
    );
  };

  return (
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
    </div>
  );
}
