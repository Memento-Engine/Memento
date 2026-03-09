import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Search, Globe } from "lucide-react";
import { ThinkingStep } from "./types";
import useReferenceContext from "@/hooks/useReferenceContext";
import { cn, renderDate } from "@/lib/utils";

type Props = {
  steps: ThinkingStep[];
};

export const mockSteps = [
  {
    title: "Searching indexed memories",
    status: "running",
    message: "Scanning your captured activities...",
    queries: ["meeting notes", "design doc", "chat with John"],
  },
  {
    title: "Processing results",
    status: "completed",
    results: [
      {
        app_name: "Google Chrome",
        window_name: "Figma - Design System",
        image_path: "/captures/figma-design.png",
        captured_at: "2026-03-06T16:45:10Z",
      },
      {
        app_name: "Visual Studio Code",
        window_name: "search-engine.ts",
        image_path: "/captures/vscode-code.png",
        captured_at: "2026-03-06T16:47:32Z",
      },
    ],
    message: "Relevant activities found in your history.",
  },
  {
    title: "Generating answer",
    status: "final",
    message: "Here are the most relevant moments from your memory.",
  },
];

export function StepThinking({ steps }: Props) {
  const mergedSteps = steps.reduce<ThinkingStep[]>((acc, step) => {
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

        <span
          className={cn("text-foreground/70", !isDone && "thinking-shimmer")}
        >
          {isDone ? `Thought ${completedDuration}s` : "Thinking..."}
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
            <div className="space-y-0 pb-4 pt-1">
              {mergedSteps.map((step, index) => {
                const isLastStep = index === mergedSteps.length - 1;
                const isActive = isLastStep && !isDone;
                const hasCompleted = ["completed", "final"].includes(step.status);
                const normalizedResults = (step.results ?? []).map((result: any) => ({
                  app_name: result.app_name,
                  window_name: result.window_name ?? result.window_title ?? "",
                  image_path: result.image_path,
                  captured_at: result.captured_at ?? result.timestamp ?? "",
                }));

                return (
                  <motion.div
                    key={step.stepId}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.08,
                    }}
                    className="relative pb-6 last:pb-2"
                  >
                    {/* Vertical Line - Centered perfectly to the 10px dot */}
                    {!isLastStep && (
                      <div className="absolute bottom-0 left-[5px] top-[16px] w-px bg-border" />
                    )}

                    {/* Row */}
                    <div className="flex items-start gap-3">
                      {/* Dot Container */}
                      <div className="relative mt-[3px] shrink-0">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            isActive ? "bg-primary" : hasCompleted ? "bg-foreground/70" : "bg-muted-foreground/40"
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
                                ? "text-foreground thinking-shimmer"
                                : hasCompleted
                                  ? "text-foreground/90"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {step.title}
                          </h3>
                        </div>

                        {/* Message */}
                        {step.message && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
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
                        {normalizedResults.length > 0 && (
                          <div className="mt-3 max-w-2xl overflow-hidden rounded-lg border border-border bg-sidebar shadow-sm">
                            <div className="max-h-48 divide-y divide-border overflow-y-auto">
                              {normalizedResults.map((result, i) => (
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
                                  className="flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors hover:bg-muted/20"
                                >
                                  <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                                      <Globe className="h-3 w-3 text-muted-foreground" />
                                    </div>

                                    <span className="truncate text-xs text-foreground/80">
                                      {result.app_name}
                                      <span className="mx-1 font-normal">
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
