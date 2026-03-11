"use client";

import React, { useState } from "react";
import { Button } from "./ui/button";
import { Plus, ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTypewriter } from "@/hooks/useTypeWriter";
import useSystemHealth from "@/hooks/useSystemHealth";

// ================= AUTOSIZE TEXTAREA =================

export interface AutosizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const AutosizeTextarea = React.forwardRef<HTMLTextAreaElement, AutosizeTextareaProps>(
  ({ className, ...props }, ref) => {
    const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const MAX_HEIGHT = 192; // same as max-h-48

    const setHeight = () => {
      const el = textAreaRef.current;
      if (!el) return;

      // reset height
      el.style.height = "auto";

      // new height with limit
      const newHeight = Math.min(el.scrollHeight, MAX_HEIGHT);

      el.style.height = `${newHeight}px`;

      // enable scroll only after limit
      el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
    };

    React.useImperativeHandle(ref, () => textAreaRef.current!);

    React.useEffect(() => {
      setHeight();
    });

    return (
      <Textarea
        {...props}
        ref={textAreaRef}
        onChange={(e) => {
          setHeight();
          props.onChange?.(e);
        }}
        className={cn(
          "min-h-[40px] max-h-48 resize-none overflow-y-auto border-none bg-transparent focus-visible:ring-0 shadow-none custom-scrollbar leading-tight",
          className
        )}
      />
    );
  }
);

AutosizeTextarea.displayName = "AutosizeTextarea";

// ================= CHAT HOME =================

interface ChatHomeProps {
  handleSend: (query: string) => void;
}

export default function ChatHome({ handleSend }: ChatHomeProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const { isRunning } = useSystemHealth();

  const placeholder = useTypewriter({
    base: "Hey, When did I search about ",
    endings: ["quantum computers?", "GOAT Movie?", "linux securities?"],
  });

  return (
    <div className="relative flex w-full flex-col">
      {/* Main Container - Added relative positioning here */}
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background px-4">
        {/* ===== MEMENTO DAEMON HEALTH STATUS (FLOATING) ===== */}
        {!isRunning && (
          <div className="absolute top-6 z-2 flex w-full max-w-2xl items-center justify-between rounded-2xl border border-border bg-card/90 px-4 py-2.5 text-sm text-muted-foreground shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3">
              {/* Pulsing indicator dot */}
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
              <p>
                <span className="font-semibold text-foreground">Memento offline. </span>
                Start via settings or widget.
              </p>
            </div>

            {/* Quick action link */}
            <button className="whitespace-nowrap font-medium text-primary transition-colors hover:text-primary/80">
              Settings
            </button>
          </div>
        )}

        {/* ===== BRAND ===== */}
        <div className="mb-6 flex items-center justify-center gap-1 select-none">
          <h1 className="font-display text-4xl font-medium tracking-tight text-primary md:text-5xl .thinking-shimmer">
            memento
          </h1>
        </div>

        {/* ===== INPUT BOX ===== */}
        <div
          className="
            relative
            w-full
            max-w-2xl
            bg-card
            border-border
            border
            rounded-2xl
            shadow-sm
            overflow-hidden
            z-10
          "
        >
          <div className="flex flex-col p-2">
            <AutosizeTextarea
              value={query}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(query);
                  setQuery("");
                }
              }}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`${placeholder}|`}
              className="px-3 py-2 text-base placeholder:text-sm focus:outline-none"
            />

            {/* ===== TOOLBAR ===== */}
            <div className="flex items-center justify-between px-1 pt-2 pb-1">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <Plus size={20} />
                </Button>
              </div>

              <Button
                onClick={() => {
                  handleSend(query);
                  setQuery("");
                }}
                size="icon"
                className="h-9 w-9 rounded-full"
              >
                <ArrowUp size={20} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
