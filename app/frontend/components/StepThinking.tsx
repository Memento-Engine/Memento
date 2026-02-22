import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Search, Globe } from "lucide-react";
import { ThinkingStep } from "./types";
import { formatDistanceToNow } from "date-fns";
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

  useEffect((): void => {
    console.log("STEPS from step thinking", steps);
  }, [steps]);

  // Auto-collapse effect when finished
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
    <div className="flex flex-col w-full p-0 m-0 rounded-md bg-transparent">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex  cursor-pointer items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors py-3 w-full text-left"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        {isDone ? "Thought process complete" : "Thinking..."}
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
            <div className="px-0 pb-4">
              {/* Timeline Container */}
              <div className="relative border-l-1 border-gray-200 ml-2 space-y-6 pb-2">
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
                          className={`absolute -left-[7px] top-1.2 h-3 w-3 rounded-full border-2 border-white ${
                            isLast ? "bg-blue-500 animate-pulse" : "bg-gray-300"
                          }`}
                        />

                        {/* Step Content */}
                        <div className="space-y-3">
                          <h3
                            className={`text-xs font-medium ${
                              isLast ? "text-gray-900" : "text-gray-500"
                            }`}
                          >
                            {step.title}
                          </h3>

                          {step.message && (
                            <p className="text-xs text-gray-600">
                              {step.message}
                            </p>
                          )}

                          {/* Search Queries UI (Edge Space Content) */}
                          {step.queries && step.queries.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {step.queries.map((query, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700"
                                >
                                  <Search className="w-3 h-3 text-gray-400" />
                                  <span>{query}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Search Results UI (Edge Space Content) */}
                          {step.results && step.results.length > 0 && (
                            <div className="mt-2 rounded-xl border border-gray-200 bg-white overflow-hidden max-w-2xl">
                              <div className="max-h-48 overflow-y-auto">
                                {step.results.map((result, i) => (
                                  <div
                                    key={i}
                                    onClick={(): void => {
                                      console.log("Clicked on Source", result);
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
                                    className="flex items-center justify-between px-2 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                      {/* Placeholder Icon representing a favicon */}
                                      <div className="flex-shrink-0 w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200">
                                        <Globe className="w-3 h-3 text-gray-500" />
                                      </div>
                                      <span className="text-xs text-gray-800 truncate">
                                        {result.app_name} | {result.window_name}
                                      </span>
                                    </div>
                                    <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
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
