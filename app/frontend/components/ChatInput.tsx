import { ArrowUp, Plus, Square } from "lucide-react";
import { AutosizeTextarea } from "./ChatHome"; // Ensure this path is correct
import { Button } from "./ui/button";
import React, { useState } from "react";
import { SearchMode } from "./types";
import { cn } from "@/lib/utils";

export interface ChatInputProps {
  handleSend: (query: string, searchMode: SearchMode) => void;
  isGenerating?: boolean;
  onStop?: () => void;
}

function ChatInput({
  handleSend,
  isGenerating = false,
  onStop,
}: ChatInputProps): React.ReactElement {
  const [query, setQuery] = useState<string>("");
  const [searchMode, setSearchMode] = useState<SearchMode>("search");

  const submit = (): void => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || isGenerating) {
      return;
    }

    handleSend(trimmedQuery, searchMode);
    setQuery("");
  };

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
              submit();
            }
          }}
        />

        <div className="flex items-center justify-between px-1 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-border bg-muted/40 p-1">
              {(["search", "accurateSearch"] as SearchMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSearchMode(mode)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    searchMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode === "search" ? "Search" : "Accurate"}
                </button>
              ))}
            </div>
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
              onClick={submit}
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
