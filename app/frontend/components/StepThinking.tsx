import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { ThinkingStep } from "./types";
import useReferenceContext from "@/hooks/useReferenceContext";
import { cn, renderDate } from "@/lib/utils";
import { useAppIcon } from "@/hooks/useAppIcon";

type Props = {
  steps: ThinkingStep[];
};

// Component for rendering app icon in results
function AppIconDisplay({ appName, browserUrl }: { appName: string; browserUrl?: string }) {
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

// Get user-friendly description for current step
function getStepDescription(step: ThinkingStep): string {
  const resultCount = step.resultCount ?? step.results?.length ?? 0;
  
  switch (step.stepType) {
    case "planning":
      return step.message || "Understanding your question...";
    case "searching":
      if (step.status === "running") {
        return step.query ? `Searching: "${step.query}"` : "Searching memories...";
      }
      if (resultCount > 0) {
        return `Found ${resultCount} relevant ${resultCount === 1 ? "memory" : "memories"}`;
      }
      return step.message || "No matching memories found";
    case "reasoning":
      if (step.status === "running") {
        return resultCount > 0 
          ? `Analyzing ${resultCount} ${resultCount === 1 ? "result" : "results"}...` 
          : "Evaluating findings...";
      }
      return step.message || "Analysis complete";
    case "completion":
      return step.message || "Preparing response...";
    default:
      return step.message || step.title;
  }
}

export function StepThinking({ steps }: Props) {
  const mergedSteps = steps.reduce<ThinkingStep[]>((acc, step) => {
    // Skip router steps - only show actual planning/searching/reasoning steps
    if (step.stepId === "router_0") {
      return acc;
    }
    
    const existingIndex = acc.findIndex((item) => item.stepId === step.stepId);
    if (existingIndex >= 0) {
      acc[existingIndex] = {
        ...acc[existingIndex],
        ...step,
      };
      return acc;
    }

    acc.push(step);
    return acc;
  }, []);

  const isDone =
    mergedSteps.length > 0 &&
    ["completed", "final"].includes(mergedSteps[mergedSteps.length - 1].status);

  const completedDuration =
    mergedSteps
      .map((step) => step.duration)
      .find((value) => typeof value === "number" && value > 0) ?? 2;

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

  if (mergedSteps.length === 0) return null;

  return (
    <div className="flex w-full flex-col rounded-lg bg-background">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-2 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}

        <span className={cn("text-foreground/70", !isDone && "thinking-shimmer")}>
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
            <div className="relative pb-4 pt-1 pl-1">
              {/* Continuous vertical line */}
              <div 
                className="absolute left-[4px] top-[8px] w-px bg-border"
                style={{ height: `calc(100% - 24px)` }}
              />
              
              <div className="space-y-0">
                {mergedSteps.map((step, index) => {
                  const isLastStep = index === mergedSteps.length - 1;
                  const isActive = isLastStep && !isDone;
                  const hasCompleted = ["completed", "final"].includes(step.status);
                  const description = getStepDescription(step);
                  
                  const normalizedResults = (step.results ?? []).map((result: any) => ({
                    app_name: result.app_name,
                    window_name: result.window_name ?? result.window_title ?? "",
                    image_path: result.image_path,
                    captured_at: result.captured_at ?? result.timestamp ?? "",
                    browser_url: result.browser_url ?? "",
                  }));

                  return (
                    <motion.div
                      key={step.stepId}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.2,
                        delay: index * 0.05,
                        ease: "easeOut",
                      }}
                      className="relative pb-5 last:pb-2"
                    >
                      {/* Row with dot and content */}
                      <div className="flex items-start gap-3">
                        {/* Dot - perfectly aligned */}
                        <div className="relative z-10 mt-[5px] shrink-0">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ 
                              type: "spring", 
                              stiffness: 500, 
                              damping: 30,
                              delay: index * 0.05 
                            }}
                            className={cn(
                              "h-2 w-2 rounded-full transition-colors duration-200",
                              isActive && "bg-primary ring-2 ring-primary/20",
                              hasCompleted && !isActive && "bg-foreground/60",
                              !hasCompleted && !isActive && "bg-muted-foreground/40"
                            )}
                          />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Description - user-friendly text */}
                          <p
                            className={cn(
                              "text-xs leading-relaxed",
                              isActive && "step-shimmer",
                              hasCompleted && !isActive && "text-foreground/80",
                              !hasCompleted && !isActive && "text-muted-foreground"
                            )}
                          >
                            {description}
                          </p>

                          {/* Search queries */}
                          {step.queries && step.queries.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {step.queries.map((query: string, i: number) => (
                                <motion.div
                                  key={i}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: 0.1 + i * 0.05 }}
                                  className="flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  <Search className="h-2.5 w-2.5" />
                                  <span className="truncate max-w-[200px]">{query}</span>
                                </motion.div>
                              ))}
                            </div>
                          )}

                          {/* Results with app icons */}
                          {normalizedResults.length > 0 && (
                            <motion.div 
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 }}
                              className="mt-2 max-w-xl overflow-hidden rounded-lg border border-border/50 bg-card/50"
                            >
                              <div className="max-h-40 divide-y divide-border/50 overflow-y-auto">
                                {normalizedResults.slice(0, 5).map((result: any, i: number) => (
                                  <motion.div
                                    key={i}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.15 + i * 0.03 }}
                                    onClick={() => {
                                      setReferenceMeta({
                                        app_name: result.app_name,
                                        browser_url: result.browser_url,
                                        captured_at: result.captured_at,
                                        chunk_id: `chunk_${i}`,
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
                                            <span className="mx-1 text-muted-foreground/50">·</span>
                                            <span className="text-muted-foreground">{result.window_name}</span>
                                          </>
                                        )}
                                      </span>
                                    </div>
                                    <span className="ml-3 shrink-0 text-[10px] text-muted-foreground/60">
                                      {renderDate(result.captured_at)}
                                    </span>
                                  </motion.div>
                                ))}
                                {normalizedResults.length > 5 && (
                                  <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground text-center">
                                    +{normalizedResults.length - 5} more results
                                  </div>
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