import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Search,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { ThinkingStep } from "./types";
import { SearchQueryData, SourceReviewData } from "@/contexts/chatContext";
import useReferenceContext from "@/hooks/useReferenceContext";
import { cn, renderDate } from "@/lib/utils";
import { useAppIcon } from "@/hooks/useAppIcon";
import { StepSearchResult } from "@shared/types/frontend";

type Props = {
  steps: ThinkingStep[];
};

// Component for rendering app icon in results
export function AppIconDisplay({
  appName,
  browserUrl,
}: {
  appName: string;
  browserUrl?: string;
}) {
  const { src, loading } = useAppIcon(appName, browserUrl);

  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted overflow-hidden">
      {loading ? (
        <div className="h-3 w-3 rounded-full bg-muted-foreground/20 animate-pulse" />
      ) : (
        <img src={src} alt={appName} className="h-3.5 w-3.5 object-contain" />
      )}
    </div>
  );
}

export function StepThinking({ steps }: Props) {
  const isDone =
    steps.length > 0 &&
    ["completed", "final"].includes(steps[steps.length - 1].status);

  const completedDuration =
    steps
      .map((step) => step.duration)
      .find((value) => typeof value === "number" && value > 0) ?? 2;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
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

  const toggleStepExpanded = (e: React.MouseEvent, stepId: string) => {
    e.stopPropagation();
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  if (steps.length === 0) return null;

  return (
    <div className="flex w-full flex-col rounded-lg bg-background">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-2 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <motion.div
          animate={{ rotate: isCollapsed ? -90 : 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>

        <span
          className={cn("text-foreground/70", !isDone && "thinking-shimmer")}
        >
          {isDone ? `Thought for ${completedDuration}s` : "Thinking..."}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="relative pb-4 pt-1">
              <div className="space-y-0">
                {steps.map((step, index) => {
                  const isLastStep = index === steps.length - 1;
                  const isActive = isLastStep && !isDone;
                  const hasCompleted = ["completed", "final"].includes(
                    step.status,
                  );

                  // Extract and normalize results safely
                  const normalizedResults = (step.results ?? []).map(
                    (result: StepSearchResult) => ({
                      app_name: result.app_name,
                      window_name: result.window_name ?? "",
                      image_path: result.image_path,
                      captured_at: result.captured_at ?? "",
                      browser_url: result.browser_url ?? "",
                    }),
                  );

                  const isExpanded = expandedSteps.has(step.stepId);
                  const visibleResults = isExpanded
                    ? normalizedResults
                    : normalizedResults.slice(0, 5);
                  const hiddenCount = Math.max(0, normalizedResults.length - 5);

                  return (
                    <motion.div
                      layout
                      key={step.stepId}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        opacity: { duration: 0.2, delay: index * 0.05 },
                        x: { duration: 0.2, delay: index * 0.05 },
                        layout: { duration: 0.3, type: "spring", bounce: 0 },
                      }}
                      className="relative pb-5 last:pb-2"
                    >
                      {/* Segmented vertical line connecting exactly to the next step's center */}
                      {!isLastStep && (
                        <div className="absolute left-[7.5px] top-[10px] bottom-[-10px] w-px bg-border z-0" />
                      )}

                      {/* Row with dot and content */}
                      <div className="relative flex items-start gap-3 z-10">
                        {/* Dot - centered inside a strict bounding box to perfectly align with text line-height */}
                        <div className="flex h-5 w-4 shrink-0 items-center justify-center bg-background">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 30,
                              delay: index * 0.05,
                            }}
                            className={cn(
                              "h-2 w-2 rounded-full transition-colors duration-200 z-10",
                              isActive && "bg-primary ring-2 ring-primary/20",
                              hasCompleted && !isActive && "bg-foreground/60",
                              !hasCompleted &&
                                !isActive &&
                                "bg-muted-foreground/40",
                            )}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Description */}
                          <p
                            className={cn(
                              "text-xs leading-5 m-0",
                              isActive && "step-shimmer",
                              hasCompleted && !isActive && "text-foreground/80",
                              !hasCompleted &&
                                !isActive &&
                                "text-muted-foreground",
                            )}
                          >
                            {step.title ||
                              step.description ||
                              "Working on it..."}
                          </p>

                          {/* Search queries */}
                          {step.queries && step.queries.length > 0 && (
                            <motion.div layout className="flex flex-wrap gap-1.5 pt-0.5">
                              {step.queries.map((query: string, i: number) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.1 + i * 0.05 }}
                                  className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  <Search className="h-2.5 w-2.5" />
                                  <span className="truncate max-w-[200px]">
                                    {query}
                                  </span>
                                </motion.div>
                              ))}
                            </motion.div>
                          )}

                          {/* Results with app icons */}
                          {normalizedResults.length > 0 && (
                            <motion.div
                              layout
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 }}
                              className="mt-2 max-w-xl overflow-hidden rounded-lg border border-border/50 bg-card/50"
                            >
                              <div className="max-h-60 divide-y divide-border/50 overflow-y-auto">
                                <AnimatePresence initial={false}>
                                  {visibleResults.map((result: any, i: number) => (
                                    <motion.div
                                      layout
                                      key={`${result.app_name}-${result.captured_at}-${i}`}
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.2 }}
                                      onClick={() => {
                                        setReferenceMeta({
                                          app_name: result.app_name,
                                          browser_url: result.browser_url,
                                          captured_at: result.captured_at,
                                          chunk_id: result.chunk_id,
                                          image_path: result.image_path,
                                          text_content: "",
                                          text_json: undefined,
                                          window_height: 0,
                                          window_title: result.window_name,
                                          window_width: 0,
                                          window_x: 0,
                                          window_y: 0,
                                        });
                                      }}
                                      className="flex cursor-pointer items-center justify-between px-2.5 py-2 transition-colors hover:bg-muted/30"
                                    >
                                      <div className="flex items-center gap-2.5 overflow-hidden">
                                        <AppIconDisplay
                                          appName={result.app_name}
                                          browserUrl={result.browser_url}
                                        />
                                        <span className="truncate text-[11px] text-foreground/70">
                                          {result.app_name}
                                          {result.window_name && (
                                            <>
                                              <span className="mx-1 text-muted-foreground/50">
                                                ·
                                              </span>
                                              <span className="text-muted-foreground">
                                                {result.window_name}
                                              </span>
                                            </>
                                          )}
                                        </span>
                                      </div>
                                      <span className="ml-3 shrink-0 text-[10px] text-muted-foreground/60">
                                        {renderDate(result.captured_at)}
                                      </span>
                                    </motion.div>
                                  ))}
                                </AnimatePresence>

                                {/* Toggle Button for Expand / Collapse */}
                                {normalizedResults.length > 5 && (
                                  <motion.button
                                    layout
                                    onClick={(e) => toggleStepExpanded(e, step.stepId)}
                                    className="w-full px-2.5 py-2 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center font-medium"
                                  >
                                    {isExpanded
                                      ? "Show less"
                                      : `+${hiddenCount} more results`}
                                  </motion.button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}