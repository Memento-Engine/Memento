"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { fadeInUp } from "@/components/landing/motion";
import type { UseCase } from "@/components/landing/content";

export function UseCaseCard({
  item,
  index,
}: {
  item: UseCase;
  index: number;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ scale: 1.02, y: -4 }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-5"
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100"
        transition={{ duration: 0.3 }}
      />
      <div className="relative z-10">
        <span className="text-3xl">{item.icon}</span>
        <p className="mt-3 text-sm font-medium text-foreground">{item.title}</p>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          whileInView={{ opacity: 1, height: "auto" }}
          transition={{ delay: 0.3 + index * 0.1 }}
          className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-3"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">{item.answer}</p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
