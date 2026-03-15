"use client";

import { motion } from "framer-motion";
import { Eye, EyeOff, Sparkles } from "lucide-react";

export function CaptureVisual() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-muted/60 to-transparent">
      <motion.div
        className="absolute inset-4 rounded-lg border border-border/60 bg-card/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="p-3">
          <div className="flex gap-1.5 mb-3">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="space-y-2">
            <div className="h-2 w-3/4 rounded bg-muted-foreground/15" />
            <div className="h-2 w-1/2 rounded bg-muted-foreground/15" />
            <div className="h-2 w-2/3 rounded bg-muted-foreground/15" />
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
        initial={{ top: "1rem" }}
        animate={{ top: ["1rem", "10rem", "1rem"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0.5, 1, 0.5], scale: 1 }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="h-2 w-2 rounded-full bg-primary" />
        <span className="text-[10px] text-primary">Remembering</span>
      </motion.div>
    </div>
  );
}

export function MaskVisual() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-muted/60 to-transparent">
      <div className="absolute inset-4 grid grid-cols-2 gap-2">
        <motion.div
          className="rounded-lg border border-border/60 bg-card/50 p-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <div className="h-3 w-3 rounded bg-primary/30" />
            <div className="h-1.5 w-12 rounded bg-muted-foreground/20" />
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded bg-muted-foreground/15" />
            <div className="h-1.5 w-2/3 rounded bg-muted-foreground/15" />
          </div>
          <motion.div
            className="mt-2 flex items-center gap-1 text-[8px] text-primary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <Eye className="h-2 w-2" /> Visible
          </motion.div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/40 p-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.div
            className="absolute inset-0 bg-muted/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-2 opacity-30">
              <div className="h-3 w-3 rounded bg-muted-foreground/40" />
              <div className="h-1.5 w-12 rounded bg-muted-foreground/20" />
            </div>
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: "spring" }}
            >
              <div className="rounded-full bg-background/70 p-2">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              </div>
            </motion.div>
          </div>
          <motion.div
            className="absolute bottom-2 left-2 z-10 flex items-center gap-1 text-[8px] text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <EyeOff className="h-2 w-2" /> Masked
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export function AskVisual() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-muted/60 to-transparent p-4">
      <div className="space-y-3">
        <motion.div
          className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-muted/60 p-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-[11px] text-foreground">
            What was that coffee shop recommendation?
          </p>
        </motion.div>

        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 0.6, duration: 1.5 }}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-3 w-3 text-primary" />
          </div>
          <div className="flex gap-1">
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            />
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            />
            <motion.div
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            />
          </div>
        </motion.div>

        <motion.div
          className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border/60 bg-card/50 p-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2 }}
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-foreground">
                Found it! Sarah mentioned "Blue Bottle Coffee" when you were
                chatting on Tuesday.
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground">
                From: iMessage • 2 days ago
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
