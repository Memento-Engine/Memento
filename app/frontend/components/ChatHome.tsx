"use client";
import { Button } from "./ui/button";
import { Plus, ArrowUp } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import React, { useState } from "react";

export interface AutosizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const AutosizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutosizeTextareaProps
>(({ className, ...props }, ref) => {
  const textAreaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setHeight = () => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  };

  React.useImperativeHandle(
    ref,
    () => textAreaRef.current as HTMLTextAreaElement,
  );

  return (
    <Textarea
      {...props}
      ref={textAreaRef}
      onChange={(e) => {
        setHeight();
        props.onChange?.(e);
      }}
      className={cn(
        "min-h-[40px] resize-none overflow-hidden border-none focus-visible:ring-0 shadow-none",
        className,
      )}
    />
  );
});
AutosizeTextarea.displayName = "AutosizeTextarea";

export { AutosizeTextarea };

interface ChatHomeProps {
  handleSend: (query: string) => void;
}
export default function ChatHome({
  handleSend,
}: ChatHomeProps): React.ReactElement {
  const [query, setQuery] = useState<string>("");

  return (
    <div className="flex flex-col w-full items-center bg-white dark:bg-background justify-center min-h-[85vh] px-4">
      {/* Brand */}
      <h1 className="text-4xl font-mono  tracking-[0.09em] font-semibold dark:text-white text-slate-900 mb-6 tracking-tight">
        Memento AI
      </h1>

      {/* The Perplexity Bar Container */}
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-sm focus-within:ring-1 focus-within:ring-slate-300 transition-all overflow-hidden">
        <div className="flex flex-col p-2">
          {/* Expanding Textarea */}
          <AutosizeTextarea
            value={query}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); // VERY important
                handleSend(query);
                setQuery("");
              }
            }}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Browse your memories..."
            className="text-lg py-2 px-3 dark:text-black placeholder:text-slate-400 max-h-48"
          />

          {/* Bottom Toolbar inside the bar */}
          <div className="flex items-center justify-between px-1 pt-2 pb-1">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-500 rounded-full"
              >
                <Plus size={20} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs font-medium text-slate-500 rounded-full hover:bg-slate-100"
              >
                Focus
              </Button>
            </div>

            <Button
              onClick={(): void => handleSend(query)}
              size="icon"
              className="h-9 w-9 rounded-full bg-slate-900 hover:bg-slate-800"
            >
              <ArrowUp size={20} className="text-white" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
