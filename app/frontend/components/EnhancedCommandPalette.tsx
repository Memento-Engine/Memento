"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  MessageSquare,
  Settings,
  User,
  Moon,
  Sun,
  Monitor,
  Clock,
  Home,
  Sparkles,
  ChevronRight,
  Command,
  Plus,
  SquarePen,
  History,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { listChatSessions, type ChatSessionRow } from "@/api/messages";
import useChatContext from "@/hooks/useChatContext";
import { onOpenChatSearchDialog } from "@/lib/chatSearch";
import { useRouter } from "next/navigation";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string[];
  section: string;
  timestamp?: string;
  type: "command" | "chat";
}

interface EnhancedCommandPaletteProps {}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function EnhancedCommandPalette(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { setTheme, theme } = useTheme();
  const { chatId, openChat, startNewChat } = useChatContext();
  const router = useRouter();

  // Listen for open command palette event
  useEffect(() => {
    return onOpenChatSearchDialog(() => {
      setOpen(true);
    });
  }, []);

  // Load chat sessions
  const loadChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const sessions = await listChatSessions(50);
      setChatSessions(sessions);
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadChats();
    }
  }, [open, loadChats]);

  // Define static commands
  const staticCommands: CommandItem[] = useMemo(
    () => [
      // Quick Actions
      {
        id: "new-chat",
        label: "New Chat",
        description: "Start a fresh conversation",
        icon: <SquarePen className="h-[18px] w-[18px]" />,
        onSelect: () => {
          startNewChat();
          router.push("/", { scroll: false });
          setOpen(false);
        },
        keywords: ["create", "start", "conversation", "new"],
        section: "Quick Actions",
        type: "command",
      },
      {
        id: "home",
        label: "Go Home",
        description: "Return to the main page",
        icon: <Home className="h-[18px] w-[18px]" />,
        onSelect: () => {
          router.push("/", { scroll: false });
          setOpen(false);
        },
        keywords: ["navigate", "main", "home"],
        section: "Navigation",
        type: "command",
      },
      {
        id: "settings",
        label: "Settings",
        description: "Manage your preferences",
        icon: <Settings className="h-[18px] w-[18px]" />,
        onSelect: () => {
          // Settings dialog will need to be triggered via event or direct state
          console.log("Open settings");
          setOpen(false);
        },
        keywords: ["preferences", "config", "options"],
        section: "Navigation",
        type: "command",
      },
      {
        id: "profile",
        label: "Profile",
        description: "View your account details",
        icon: <User className="h-[18px] w-[18px]" />,
        onSelect: () => {
          // Profile will be opened via settings
          console.log("View profile");
          setOpen(false);
        },
        keywords: ["account", "user", "me"],
        section: "Navigation",
        type: "command",
      },
      // Theme Commands
      {
        id: "theme-light",
        label: "Light Theme",
        description: "Use light color scheme",
        icon: <Sun className="h-[18px] w-[18px]" />,
        onSelect: () => {
          setTheme("light");
          setOpen(false);
        },
        keywords: ["theme", "appearance", "bright", "day"],
        section: "Appearance",
        type: "command",
      },
      {
        id: "theme-dark",
        label: "Dark Theme",
        description: "Use dark color scheme",
        icon: <Moon className="h-[18px] w-[18px]" />,
        onSelect: () => {
          setTheme("dark");
          setOpen(false);
        },
        keywords: ["theme", "appearance", "night", "black"],
        section: "Appearance",
        type: "command",
      },
      {
        id: "theme-system",
        label: "System Theme",
        description: "Match your system settings",
        icon: <Monitor className="h-[18px] w-[18px]" />,
        onSelect: () => {
          setTheme("system");
          setOpen(false);
        },
        keywords: ["theme", "appearance", "auto", "default"],
        section: "Appearance",
        type: "command",
      },
    ],
    [setTheme, startNewChat, router]
  );

  // Convert chat sessions to command items
  const chatCommands: CommandItem[] = useMemo(
    () =>
      chatSessions.map((session) => ({
        id: `chat-${session.session_id}`,
        label: session.title,
        description: `Last active ${formatTimestamp(session.last_message_at)}`,
        icon: <MessageSquare className="h-[18px] w-[18px]" />,
        onSelect: async () => {
          await openChat(session.session_id);
          setOpen(false);
        },
        keywords: [session.title],
        section: "Recent Chats",
        timestamp: session.last_message_at,
        type: "chat",
      })),
    [chatSessions, openChat]
  );

  // Combine all commands
  const allCommands = useMemo(
    () => [...staticCommands, ...chatCommands],
    [staticCommands, chatCommands]
  );

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return allCommands;
    }

    return allCommands.filter((cmd) => {
      const searchStr = `${cmd.label} ${cmd.description} ${cmd.keywords?.join(" ")}`.toLowerCase();
      return searchStr.includes(normalizedQuery);
    });
  }, [query, allCommands]);

  // Group commands by section
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.section]) {
        groups[cmd.section] = [];
      }
      groups[cmd.section].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when dialog opens
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    return () => window.clearTimeout(timer);
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const itemCount = filteredCommands.length;
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
          filteredCommands[selectedIndex]?.onSelect();
          break;
      }
    },
    [filteredCommands, selectedIndex]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[640px] p-0 gap-0 rounded-xl border border-border/60 bg-background shadow-2xl overflow-hidden"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for commands, chats, or actions..."
            className="border-none shadow-none focus-visible:ring-0 h-10 px-0 text-[15px] bg-transparent placeholder:text-muted-foreground/50 font-normal"
          />
          <kbd className="hidden sm:inline-flex h-6 select-none items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 font-mono text-[10px] font-medium text-muted-foreground/70 shadow-sm">
            ESC
          </kbd>
        </div>

        {/* Commands List */}
        <ScrollArea className="max-h-[min(540px,calc(100vh-200px))]">
          <div className="px-2 py-3" ref={listRef}>
            {isLoadingChats && query === "" ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Loading commands...</p>
                </div>
              </div>
            ) : Object.entries(groupedCommands).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50 mb-4 ring-1 ring-border/50">
                  <Search className="h-6 w-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground/90 mb-1">
                  No results found
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Try searching with different keywords
                </p>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([section, items], sectionIdx) => {
                const startIndex = Object.entries(groupedCommands)
                  .slice(0, sectionIdx)
                  .reduce((acc, [, items]) => acc + items.length, 0);

                return (
                  <div key={section} className="mb-6 last:mb-2">
                    {/* Section Header */}
                    <div className="px-3 py-2 mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {section}
                      </span>
                    </div>

                    {/* Section Items */}
                    <div className="space-y-1">
                      {items.map((cmd, idx) => {
                        const globalIndex = startIndex + idx;
                        const isSelected = globalIndex === selectedIndex;
                        const isActiveTheme =
                          cmd.id === `theme-${theme}` && theme !== "system";
                        const isActiveChat = cmd.type === "chat" && cmd.id === `chat-${chatId}`;

                        return (
                          <button
                            key={cmd.id}
                            data-index={globalIndex}
                            onClick={cmd.onSelect}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={cn(
                              "group relative flex w-full items-center gap-3.5 rounded-lg px-3 py-3 text-left transition-all duration-150 outline-none",
                              isSelected
                                ? "bg-accent/50 ring-1 ring-border/50 shadow-sm"
                                : "hover:bg-accent/30",
                              (isActiveTheme || isActiveChat) && "opacity-50"
                            )}
                          >
                            {/* Icon */}
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-150",
                                isSelected
                                  ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                                  : "bg-muted/50 text-muted-foreground group-hover:bg-muted/80"
                              )}
                            >
                              {cmd.icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span
                                  className={cn(
                                    "text-[13px] font-medium truncate leading-none",
                                    isSelected
                                      ? "text-foreground"
                                      : "text-foreground/90"
                                  )}
                                >
                                  {cmd.label}
                                </span>
                                {(isActiveTheme || isActiveChat) && (
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-primary/80 bg-primary/10 px-2 py-0.5 rounded-md ring-1 ring-primary/20">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {isActiveChat ? "Active" : "Current"}
                                  </span>
                                )}
                              </div>
                              {cmd.description && (
                                <p
                                  className={cn(
                                    "text-[12px] truncate leading-none",
                                    isSelected
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground/70"
                                  )}
                                >
                                  {cmd.description}
                                </p>
                              )}
                            </div>

                            {/* Arrow indicator */}
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 transition-all duration-150",
                                isSelected
                                  ? "text-muted-foreground/60 opacity-100 translate-x-0"
                                  : "text-muted-foreground/30 opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0"
                              )}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-3 bg-muted/20">
          <div className="flex items-center gap-6 text-[11px] text-muted-foreground/70">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/60 bg-background px-1.5 font-mono text-[10px] font-medium shadow-sm">
                  ↑
                </kbd>
                <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/60 bg-background px-1.5 font-mono text-[10px] font-medium shadow-sm">
                  ↓
                </kbd>
              </div>
              <span className="font-medium">to navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 min-w-[24px] items-center justify-center rounded border border-border/60 bg-background px-1.5 font-mono text-[10px] font-medium shadow-sm">
                ↵
              </kbd>
              <span className="font-medium">to select</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
