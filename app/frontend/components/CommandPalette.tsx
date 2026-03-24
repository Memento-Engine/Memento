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
  ArrowRight,
  Clock,
  Hash,
  FileText,
  Zap,
  Home,
  Sparkles,
  ChevronRight,
  Command,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string[];
  section: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({
  open,
  onOpenChange,
}: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { setTheme, theme } = useTheme();

  // Define all available commands
  const commands: CommandItem[] = useMemo(
    () => [
      // Quick Actions
      {
        id: "new-chat",
        label: "New Chat",
        description: "Start a new conversation",
        icon: <MessageSquare className="h-4 w-4" />,
        onSelect: () => {
          console.log("New chat");
          onOpenChange(false);
        },
        keywords: ["create", "start", "conversation"],
        section: "Actions",
      },
      {
        id: "home",
        label: "Go to Home",
        description: "Navigate to home page",
        icon: <Home className="h-4 w-4" />,
        onSelect: () => {
          console.log("Go home");
          onOpenChange(false);
        },
        keywords: ["navigate", "main"],
        section: "Navigation",
      },
      {
        id: "settings",
        label: "Open Settings",
        description: "Configure your preferences",
        icon: <Settings className="h-4 w-4" />,
        onSelect: () => {
          console.log("Open settings");
          onOpenChange(false);
        },
        keywords: ["preferences", "config"],
        section: "Navigation",
      },
      {
        id: "profile",
        label: "View Profile",
        description: "Manage your account",
        icon: <User className="h-4 w-4" />,
        onSelect: () => {
          console.log("View profile");
          onOpenChange(false);
        },
        keywords: ["account", "user"],
        section: "Navigation",
      },
      // Theme Commands
      {
        id: "theme-light",
        label: "Light Mode",
        description: "Switch to light theme",
        icon: <Sun className="h-4 w-4" />,
        onSelect: () => {
          setTheme("light");
          onOpenChange(false);
        },
        keywords: ["theme", "appearance", "bright"],
        section: "Appearance",
      },
      {
        id: "theme-dark",
        label: "Dark Mode",
        description: "Switch to dark theme",
        icon: <Moon className="h-4 w-4" />,
        onSelect: () => {
          setTheme("dark");
          onOpenChange(false);
        },
        keywords: ["theme", "appearance", "night"],
        section: "Appearance",
      },
      {
        id: "theme-system",
        label: "System Theme",
        description: "Use system preference",
        icon: <Monitor className="h-4 w-4" />,
        onSelect: () => {
          setTheme("system");
          onOpenChange(false);
        },
        keywords: ["theme", "appearance", "auto"],
        section: "Appearance",
      },
    ],
    [setTheme, onOpenChange]
  );

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return commands;
    }

    return commands.filter((cmd) => {
      const searchStr = `${cmd.label} ${cmd.description} ${cmd.keywords?.join(" ")}`.toLowerCase();
      return searchStr.includes(normalizedQuery);
    });
  }, [query, commands]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl p-0 gap-0 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden"
      >
        {/* Search Input */}
        <div className="flex items-center border-b border-border/50 px-4 h-16 bg-gradient-to-b from-muted/30 to-transparent">
          <Search className="h-5 w-5 text-muted-foreground/50 mr-3 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="border-none shadow-none focus-visible:ring-0 h-full px-0 text-base bg-transparent placeholder:text-muted-foreground/50"
          />
          <div className="flex items-center gap-1.5 ml-3 shrink-0">
            <kbd className="hidden sm:inline-flex h-6 select-none items-center gap-0.5 rounded-md border border-border/50 bg-muted/50 px-2 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>
        </div>

        {/* Commands List */}
        <ScrollArea className="max-h-[420px]">
          <div className="p-2" ref={listRef}>
            {Object.entries(groupedCommands).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mb-3">
                  <Search className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm text-muted-foreground/70">
                  No results found
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Try searching for something else
                </p>
              </div>
            ) : (
              Object.entries(groupedCommands).map(([section, items], sectionIdx) => {
                const startIndex = Object.entries(groupedCommands)
                  .slice(0, sectionIdx)
                  .reduce((acc, [, items]) => acc + items.length, 0);

                return (
                  <div key={section} className="mb-4 last:mb-0">
                    {/* Section Header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
                      <div className="h-px flex-1 bg-border/30" />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        {section}
                      </span>
                      <div className="h-px flex-1 bg-border/30" />
                    </div>

                    {/* Section Items */}
                    <div className="space-y-0.5">
                      {items.map((cmd, idx) => {
                        const globalIndex = startIndex + idx;
                        const isSelected = globalIndex === selectedIndex;
                        const isActiveTheme =
                          cmd.id === `theme-${theme}` && theme !== "system";

                        return (
                          <button
                            key={cmd.id}
                            data-index={globalIndex}
                            onClick={cmd.onSelect}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={cn(
                              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all outline-none",
                              "hover:bg-muted/80",
                              isSelected &&
                                "bg-gradient-to-r from-primary/[0.08] to-primary/[0.04] ring-1 ring-primary/20",
                              isActiveTheme && "opacity-60"
                            )}
                          >
                            {/* Icon */}
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-all",
                                isSelected
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted/50 text-muted-foreground/70"
                              )}
                            >
                              {cmd.icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    "text-sm font-medium truncate",
                                    isSelected
                                      ? "text-foreground"
                                      : "text-foreground/90"
                                  )}
                                >
                                  {cmd.label}
                                </span>
                                {isActiveTheme && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    Active
                                  </span>
                                )}
                              </div>
                              {cmd.description && (
                                <p
                                  className={cn(
                                    "text-xs truncate mt-0.5",
                                    isSelected
                                      ? "text-muted-foreground/80"
                                      : "text-muted-foreground/60"
                                  )}
                                >
                                  {cmd.description}
                                </p>
                              )}
                            </div>

                            {/* Arrow indicator */}
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 shrink-0 transition-all",
                                isSelected
                                  ? "text-primary/70 opacity-100 translate-x-0"
                                  : "text-muted-foreground/30 opacity-0 -translate-x-1"
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
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2.5 bg-muted/20">
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
            <div className="flex items-center gap-1">
              <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[9px]">
                ↑
              </kbd>
              <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[9px]">
                ↓
              </kbd>
              <span className="ml-1">Navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[9px]">
                ↵
              </kbd>
              <span className="ml-1">Select</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
            <Command className="h-3 w-3" />
            <span>Command Palette</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to use the command palette
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}
