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

  // Debug
  useEffect((): void => {
    if (steps.length > 0) {
      console.log("✅ STEPS from step thinking component (count=" + steps.length + ")");
      steps.forEach((step, i) => {
        console.log(`  Step ${i}: ${step.stepId} (${step.stepType}) - Status: ${step.status}, Results: ${step.resultCount ?? 0}`);
      });
    }
  }, [steps]);

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
    <div className="flex flex-col w-full rounded-md bg-transparent">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-3 w-full text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        {isDone ? "Thought process complete" : "Thinking..."}
      </button>

      {/* Animated Body */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-4">
              {/* Timeline */}
              <div className="relative border-l border-border ml-2 space-y-5 pb-2">
                <AnimatePresence>
                  {steps.map((step, index) => {
                    const isLast = index === steps.length - 1 && !isDone;

                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.4,
                          ease: "easeOut",
                          delay: index * 0.15,
                        }}
                        className="relative pl-6"
                      >
                        {/* Timeline Dot */}
                        <div
                          className={`absolute -left-[7px] top-1.5 rounded-full border-2 border-background ${
                            isLast
                              ? "bg-primary animate-pulse h-3 w-3"
                              : "bg-muted h-3 w-3"
                          }`}
                        />

                        {/* Step Content */}
                        <div className="space-y-3">
                          <h3
                            className={`text-xs font-medium ${
                              isLast
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {step.title}
                          </h3>

                          {step.message && (
                            <p className="text-xs text-muted-foreground">
                              {step.message}
                            </p>
                          )}

                          {/* Search Queries */}
                          {step.queries && step.queries.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {step.queries.map((query, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
                                >
                                  <Search className="w-3 h-3 text-muted-foreground" />
                                  <span>{query}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Search Results */}
                          {step.results && step.results.length > 0 && (
                            <div className="mt-2 rounded-xl border border-border overflow-hidden max-w-2xl">
                              <div className="max-h-48 overflow-y-auto">
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
                                    className="flex items-center justify-between px-3 py-2.5  transition-colors border-b border-border last:border-0 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      {/* Favicon Placeholder */}
                                      <div className="flex-shrink-0 w-5 h-5 bg-muted rounded-full flex items-center justify-center border border-border">
                                        <Globe className="w-3 h-3 text-muted-foreground" />
                                      </div>

                                      <span className="text-xs text-gray-300 truncate">
                                        {result.app_name} | {result.window_name}
                                      </span>
                                    </div>

                                    <span className="text-xs text-muted-foreground ml-4 flex-shrink-0">
                                      {renderDate(result.captured_at)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
