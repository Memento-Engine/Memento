"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Edit3, MessageCircle, MessageSquare, Pin, Plus, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { listChatSessions, type ChatSessionRow } from "@/api/messages";
import useChatContext from "@/hooks/useChatContext";
import { onOpenChatSearchDialog } from "@/lib/chatSearch";
import { cn } from "@/lib/utils";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChatSearchDialog(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { chatId, openChat } = useChatContext();

  const refreshChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listChatSessions(200);
      setSessions(rows);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    return onOpenChatSearchDialog(() => {
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    void refreshChats();

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    return () => window.clearTimeout(timer);
  }, [open, refreshChats]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return sessions;
    }

    return sessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sessions]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const handleOpenChat = useCallback(async (sessionId: string) => {
    setOpen(false);
    await openChat(sessionId);
  }, [openChat]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    const itemCount = filteredSessions.length;
    if (itemCount === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % itemCount);
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount);
        break;
      case "Enter":
        event.preventDefault();
        void handleOpenChat(filteredSessions[selectedIndex].session_id);
        break;
    }
  }, [filteredSessions, selectedIndex, handleOpenChat]);

  const renderDialogSkeletons = () => (
    Array.from({ length: 6 }).map((_, index) => (
      <div
        key={`dialog-chat-skeleton-${index}`}
        className="flex w-full items-start justify-between rounded-xl border px-3 py-3"
      >
        <div className="min-w-0 flex-1 pr-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-[58%] rounded-sm" />
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <Skeleton className="h-3 w-[28%] rounded-sm" />
          </div>
        </div>

        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    ))
  );

return (
  <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent
      showCloseButton={false}
      className="max-w-2xl p-0 rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
    >
      {/* Search Bar - Increased height and refined focus */}
      <div className="flex items-center border-b border-border/50 px-4 h-14 bg-muted/30">
        <Search className="h-5 w-5 text-muted-foreground/70 mr-3" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search conversations..."
          className="border-none shadow-none focus-visible:ring-0 h-full px-0 text-base bg-transparent"
        />
        <div className="flex items-center gap-2 ml-auto">
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>
      </div>

      <ScrollArea className="max-h-[480px] p-2">
        <div className="space-y-1" ref={listRef}>

          {/* Section Header */}
          {filteredSessions.length > 0 && (
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Recent Chats
            </div>
          )}

          {/* Chats List */}
          {!isLoading && filteredSessions.map((session, index) => {
            const isActive = session.session_id === chatId;
            const isSelected = index === selectedIndex;

            return (
              <button
                key={session.session_id}
                data-index={index}
                onClick={() => void handleOpenChat(session.session_id)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-all outline-none",
                  "hover:bg-muted/80 focus:bg-muted/80",
                  isSelected && "bg-muted/80 ring-1 ring-primary/30",
                  isActive && "bg-muted font-medium border-l-2 border-primary rounded-l-none"
                )}
              >
                <div className={cn(
                  "p-1.5 rounded-md",
                  isSelected ? "bg-primary/10 text-primary" : isActive ? "bg-primary/10 text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  <MessageSquare className="h-4 w-4" />
                </div>

                <div className="flex flex-col items-start flex-1 overflow-hidden">
                  <span className="truncate w-full text-left">
                    {session.title || "Untitled Chat"}
                  </span>
                  <span className="text-[11px] text-muted-foreground/70 truncate">
                    {session.last_message_at|| "No messages yet"}
                  </span>
                </div>

                {session.pinned && (
                  <Pin className="h-3.5 w-3.5 text-primary/70 rotate-45" />
                )}
              </button>
            );
          })}

          {/* Empty State */}
          {!isLoading && filteredSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Search className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium">No results found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your search query.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer / Context Hints */}
      <div className="flex items-center gap-4 border-t border-border/50 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <kbd className="rounded border bg-background px-1">↑↓</kbd> Navigate
        </div>
        <div className="flex items-center gap-1">
          <kbd className="rounded border bg-background px-1">Enter</kbd> Open
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
}
