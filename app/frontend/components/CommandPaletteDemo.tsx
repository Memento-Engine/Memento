"use client";

import { useState } from "react";
import CommandPalette from "@/components/CommandPalette";
import { Button } from "@/components/ui/button";
import { Command, Sparkles, Keyboard } from "lucide-react";

export default function CommandPaletteDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      <div className="container max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
              <Command className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Command Palette
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A beautiful, Vercel-inspired command palette with keyboard
            navigation and smooth interactions
          </p>
        </div>

        {/* Demo Cards */}
        <div className="grid gap-6 md:grid-cols-2 mb-12">
          {/* Keyboard Shortcut Card */}
          <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all hover:border-border hover:shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Keyboard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Keyboard Shortcut</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Press{" "}
                  <kbd className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-2 font-mono text-xs font-medium">
                    Ctrl + K
                  </kbd>{" "}
                  to open
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground/70">
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px]">
                      ↑
                    </kbd>
                    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px]">
                      ↓
                    </kbd>
                    Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px]">
                      ↵
                    </kbd>
                    Select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px]">
                      ESC
                    </kbd>
                    Close
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Features Card */}
          <div className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all hover:border-border hover:shadow-lg">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Features</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary/40" />
                    Fuzzy search
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary/40" />
                    Keyboard navigation
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary/40" />
                    Grouped commands
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary/40" />
                    Beautiful animations
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Button
            size="lg"
            onClick={() => setOpen(true)}
            className="group relative overflow-hidden rounded-xl px-8 py-6 text-base font-medium shadow-lg transition-all hover:shadow-xl"
          >
            <span className="relative z-10 flex items-center gap-2">
              <Command className="h-5 w-5" />
              Open Command Palette
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 transition-opacity group-hover:opacity-100" />
          </Button>
          <p className="mt-4 text-sm text-muted-foreground">
            Or press{" "}
            <kbd className="inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xs">
              K
            </kbd>
          </p>
        </div>

        {/* Preview Section */}
        <div className="mt-16 rounded-2xl border border-border/50 bg-muted/20 p-8">
          <h2 className="text-xl font-semibold mb-4">Example Commands</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "New Chat", keys: "Start a conversation" },
              { label: "Settings", keys: "Configure preferences" },
              { label: "Light Mode", keys: "Switch theme" },
              { label: "Dark Mode", keys: "Switch theme" },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 px-4 py-3 text-sm"
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground">
                  {item.keys}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
