"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Button } from "./ui/button";
import { Plus, ArrowUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useTypewriter } from "@/hooks/useTypeWriter";

// ================= AUTOSIZE TEXTAREA =================

export interface AutosizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const AutosizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutosizeTextareaProps
>(({ className, ...props }, ref) => {
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
        "min-h-[40px] max-h-48 resize-none overflow-y-auto border-none bg-background focus-visible:ring-0 shadow-none custom-scrollbar leading-tight",
        className,
      )}
    />
  );
});

AutosizeTextarea.displayName = "AutosizeTextarea";

// ================= CHAT HOME =================

interface ChatHomeProps {
  handleSend: (query: string) => void;
}

export default function ChatHome({
  handleSend,
}: ChatHomeProps): React.ReactElement {
  const [query, setQuery] = useState("");

  const placeholder = useTypewriter({
    base: "Hey, When did I search about ",
    endings: ["quantum computers?", "GOAT Movie?", "linux securities?"],
  });

  return (
    <div className="flex flex-col w-full items-center bg-background justify-center min-h-screen px-4">
      {/* ===== BRAND ===== */}

      <div className="flex items-center justify-center gap-3 mb-6">
        <Image
          src="/blackLogo.svg"
          alt="logo"
          className="dark:invert shrink-0"
          width={55}
          height={55}
        />

        <h1 className="text-4xl tracking-[0.1em] text-primary font-semibold">
          Memento
        </h1>
      </div>

      {/* ===== INPUT BOX ===== */}

      <div
        className="
        relative
        w-full
        max-w-2xl
        bg-background
        dark:bg-[#0a0a0a]
        border
        rounded-2xl
        shadow-sm
        overflow-hidden
        z-1
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
            className="text-base py-2 px-3 dark:bg-[#0a0a0a] placeholder:text-sm dark:placeholder:text-muted"
          />

          {/* ===== TOOLBAR ===== */}

          <div className="flex items-center justify-between px-1 pt-2 pb-1">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
              >
                <Plus size={20} />
              </Button>
            </div>

            <Button
              onClick={() => handleSend(query)}
              size="icon"
              className="h-9 w-9 rounded-full"
            >
              <ArrowUp size={20} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
