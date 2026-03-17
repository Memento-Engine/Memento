import {
  ArrowUp,
  Plus,
  Square,
} from "lucide-react";
import { AutosizeTextarea } from "./ChatHome"; // Ensure this path is correct
import { Button } from "./ui/button";
import React, { useState } from "react";
import { cn } from "@/lib/utils";

export interface ChatInputProps {
  handleSend: (query: string) => void;
  isGenerating?: boolean;
  onStop?: () => void;
}

function ChatInput({
  handleSend,
  isGenerating = false,
  onStop,
}: ChatInputProps): React.ReactElement {
  const [query, setQuery] = useState<string>("");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="w-full p-2">
        <AutosizeTextarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask followup..."
          className={cn("max-h-60 px-3 py-2 text-base")}
          onKeyDown={(e) => {
            if (isGenerating) {
              return;
            }

            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();

              const message = query; // snapshot

              handleSend(message);
              setQuery("");
            }
          }}
        />

        <div className="flex items-center justify-between px-1 pt-2 pb-1">
          <div className="flex items-center gap-1">
            {/* Plus Button - File Upload */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground"
            >
              <Plus size={18} />
            </Button>
          </div>

          {/* Send Button */}
          {isGenerating ? (
            <Button
              onClick={(): void => onStop?.()}
              size="icon"
              className="h-8 w-8 rounded-full"
              variant="secondary"
              title="Stop generation"
            >
              <Square size={14} />
            </Button>
          ) : (
            <Button
              onClick={(): void => {
                handleSend(query);
                setQuery("");
              }}
              disabled={!query.trim()}
              size="icon"
              className="h-8 w-8 rounded-full"
              title="Send message"
            >
              <ArrowUp size={18} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


export default React.memo(ChatInput);