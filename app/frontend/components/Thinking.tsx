import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  Timeline,
  TimelineBody,
  TimelineHeader,
  TimelineIcon,
  TimelineItem,
  TimelineSeparator,
} from "@/components/ui/timeline";

import { MementoUIMessage, MyDataPart } from "./types";

type Props = {
  parts: MementoUIMessage["parts"];
};

export function Thinking({ parts }: Props) {
  const thinkingParts = parts.filter((p) => p.type === "data-thinking");
  
  // Determine if the thinking phase is over. 
  // We assume it's done if there is at least one non-thinking part (e.g., the actual answer text).
  const isDone = parts.length > 0 && parts.some((p) => p.type == 'data-thinking' && p.data.title.toLowerCase() === 'done');

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-collapse effect
  useEffect(() => {
    if (isDone) {
      // Add a 1.5s delay before collapsing so the user can see the final thought complete
      const timer = setTimeout(() => {
        setIsCollapsed(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsCollapsed(false);
    }
  }, [isDone]);

  if (thinkingParts.length === 0) return null;

  return (
    <div className="flex flex-col w-full rounded-md">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-3 w-full text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        {isDone ? "Thought 2s" : "Thinking..."}
      </button>

      {/* Animated Body Container */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <Timeline
                color="secondary"
                orientation="vertical"
                className="relative overflow-hidden"
              >
                <AnimatePresence>
                  {thinkingParts.map((m, index) => {
                    // It's only the "active" last item if the whole process isn't done yet
                    const isLast = index === thinkingParts.length - 1 && !isDone;

                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        // Add a slight delay based on the index to create a staggered, slow step-by-step effect
                        transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.15 }}
                      >
                        <TimelineItem>
                          <TimelineHeader>
                            <TimelineSeparator />
                            <TimelineIcon
                              className={`h-3 w-3 ${isLast ? "animate-pulse" : ""}`}
                            />
                          </TimelineHeader>

                          <TimelineBody className="-translate-y-1.5 pb-4">
                            <div className="space-y-1">
                              <h3
                                className={`text-sm ${
                                  isLast
                                    ? "text-foreground animate-pulse"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {m.data.title}
                              </h3>
                            </div>

                            {/* Only render message if it exists to keep UI clean */}
                            {m.data.message && (
                              <p
                                className={`mt-2 text-xs ${
                                  isLast
                                    ? "text-foreground animate-pulse"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {m.data.message}
                              </p>
                            )}
                          </TimelineBody>
                        </TimelineItem>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </Timeline>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}