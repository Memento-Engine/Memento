"use client";

import React, { useState, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SearchMode } from "./types";
import { cn } from "@/lib/utils";
import { useTypewriter } from "@/hooks/useTypeWriter";
import useSystemHealth from "@/hooks/useSystemHealth";

// ================= AUTOSIZE TEXTAREA =================

export interface AutosizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const AutosizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutosizeTextareaProps
>(({ className, onChange, value, ...props }, ref) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const MAX_HEIGHT = 192;

  const setHeight = () => {
    const el = textAreaRef.current;
    if (!el) return;

    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, MAX_HEIGHT);

    el.style.height = `${newHeight}px`;
    el.style.overflowY =
      el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  };

  React.useImperativeHandle(
    ref,
    () => textAreaRef.current as HTMLTextAreaElement
  );

  React.useEffect(() => {
    setHeight();
  }, [value]);

  return (
    <Textarea
      {...props}
      ref={textAreaRef}
      value={value}
      onChange={(e) => {
        setHeight();
        onChange?.(e);
      }}
      className={cn(
        "min-h-[40px] max-h-48 resize-none border-none bg-transparent focus-visible:ring-0 shadow-none custom-scrollbar leading-tight",
        className
      )}
    />
  );
});

AutosizeTextarea.displayName = "AutosizeTextarea";

// ================= CHAT HOME =================

interface ChatHomeProps {
  handleSend: (query: string, searchMode: SearchMode) => void;
}

export default function ChatHome({
  handleSend,
}: ChatHomeProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] =
    useState<SearchMode>("search");

  const { isRunning } = useSystemHealth();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const placeholder = useTypewriter({
    base: "Hey, When did I last look at ",
    endings: [
      "that GitHub repo I forked?",
      "the apartment I was comparing?",
      "that guy's LinkedIn profile?",
      "the course I was halfway through?",
      "my old résumé draft?",
    ],
  });

  const submit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    handleSend(trimmed, searchMode);
    setQuery("");

    // focus back
    textareaRef.current?.focus();
  }, [query, searchMode, handleSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  return (
    <div className="relative flex w-full flex-col">
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background px-4">

        {/* ===== STATUS ===== */}
        {!isRunning && (
          <div className="absolute top-6 z-20 flex w-full max-w-2xl items-center justify-between rounded-2xl border border-border bg-card/90 px-4 py-2.5 text-sm text-muted-foreground shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <p>
                <span className="font-semibold text-foreground">
                  Memento offline.
                </span>{" "}
                Start via settings.
              </p>
            </div>

            <button className="font-medium text-primary hover:opacity-80">
              Settings
            </button>
          </div>
        )}

        {/* ===== BRAND ===== */}
        <h1 className="mb-6 font-display text-4xl font-medium tracking-tight text-primary md:text-5xl">
          memento
        </h1>

        {/* ===== INPUT ===== */}
        <div className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

          <div className="flex flex-col p-2">

            <AutosizeTextarea
              ref={textareaRef}
              value={query}
              onKeyDown={handleKeyDown}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`${placeholder}|`}
              className="px-3 py-2 text-base placeholder:text-sm"
              aria-label="Search input"
            />

            {/* ===== TOOLBAR ===== */}
            <div className="flex items-center justify-between px-1 pt-2 pb-1">

              <div className="flex rounded-full border border-border bg-muted/40 p-1">
                {(["search", "accurateSearch"] as SearchMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSearchMode(mode)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      searchMode === mode
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode === "search" ? "Search" : "Accurate"}
                  </button>
                ))}
              </div>

              <Button
                onClick={submit}
                size="icon"
                className="h-9 w-9 rounded-full"
                disabled={!query.trim() || !isRunning}
              >
                <ArrowUp size={18} />
              </Button>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}