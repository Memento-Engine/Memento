import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Search, Globe } from "lucide-react";
import { ThinkingStep } from "./types";
import useReferenceContext from "@/hooks/useReferenceContext";
import { renderDate } from "@/lib/utils";

type Props = {
  steps: ThinkingStep[];
};

export function StepThinking({ steps }: Props) {
  const isDone =
    steps.length > 0 && steps[steps.length - 1].status === "completed";

  const [isCollapsed, setIsCollapsed] = useState(false);
  const { setReferenceMeta } = useReferenceContext();

  // Auto-collapse when finished
  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => {
        setIsCollapsed(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setIsCollapsed(false);
    }
  }, [isDone]);

  if (steps.length === 0) return null;

  return (
    <div className="flex w-full flex-col rounded-lg bg-background">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-2 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        <span className="text-foreground/70">
          {isDone ? "Thought process complete" : "Thinking..."}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-4 pt-1 space-y-0">
              {steps.map((step, index) => {
                const isLastStep = index === steps.length - 1;
                const isActive = isLastStep && !isDone;

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.08,
                    }}
                    className="relative pb-6 last:pb-2"
                  >
                    {/* Vertical Line */}
                    {!isLastStep && (
                      <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border" />
                    )}

                    {/* Row */}
                    <div className="flex items-start gap-3">
                      {/* Dot */}
                      <div className="relative mt-[3px]">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            isActive
                              ? "bg-primary"
                              : "bg-muted-foreground/40"
                          }`}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 space-y-3">
                        {/* Title */}
                        <div className="flex flex-col">
                          <h3
                            className={`text-xs leading-none ${
                              isActive
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.title}
                          </h3>

                          {/* Active Animation */}
                          {isActive && (
                            <div className="mt-1.5 h-[2px] w-24 overflow-hidden rounded-full bg-primary/20">
                              <motion.div
                                className="h-full w-1/2 rounded-full bg-primary"
                                initial={{ x: "-100%" }}
                                animate={{ x: "200%" }}
                                transition={{
                                  repeat: Infinity,
                                  duration: 1.2,
                                  ease: "linear",
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Message */}
                        {step.message && (
                          <p className="text-[13px] leading-relaxed text-muted-foreground">
                            {step.message}
                          </p>
                        )}

                        {/* Queries */}
                        {step.queries && step.queries.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {step.queries.map((query, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-secondary-foreground shadow-sm"
                              >
                                <Search className="h-3 w-3 text-muted-foreground" />
                                <span>{query}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Results */}
                        {step.results && step.results.length > 0 && (
                          <div className="mt-3 max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                            <div className="max-h-48 overflow-y-auto divide-y divide-border">
                              {step.results.map((result, i) => (
                                <div
                                  key={i}
                                  onClick={() => {
                                    setReferenceMeta({
                                      app_name: result.app_name,
                                      browser_url: "",
                                      captured_at: result.captured_at,
                                      chunk_id: 123,
                                      image_path: result.image_path,
                                      text_content: "",
                                      window_height: 0,
                                      window_title: result.window_name,
                                      window_width: 0,
                                      window_x: 0,
                                      window_y: 0,
                                    });
                                  }}
                                  className="flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors hover:bg-muted/50"
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                                      <Globe className="h-3 w-3 text-muted-foreground" />
                                    </div>

                                    <span className="truncate text-[13px] text-foreground">
                                      {result.app_name}
                                      <span className="mx-1 font-normal text-muted-foreground">
                                        |
                                      </span>
                                      {result.window_name}
                                    </span>
                                  </div>

                                  <span className="ml-4 shrink-0 text-xs text-muted-foreground">
                                    {renderDate(result.captured_at)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}