import { AgentStateType } from "../agentState";
import {
  executeReActLoop,
  formatReActResultsForAnswer,
} from "../skills/reactExecutor";
import { getLogger } from "../utils/logger";
import { getConfig } from "../config/config";
import { runWithSpan } from "../telemetry/tracing";
import { emitStepEvent } from "../utils/eventQueue";
import { PlanStep } from "../planner/plan.schema";

/*
============================================================
REACT EXECUTOR NODE
============================================================

Executes a query using the ReAct (Reason + Act) loop.
The LLM iteratively:
  1. Thinks about what to do
  2. Takes an action (sql, semantic, hybrid)
  3. Observes the real result
  4. Repeats until it has an answer

This replaces the upfront planning + execution flow.
============================================================
*/

/**
 * React executor node - uses iterative ReAct loop for search.
 */
export async function reactExecutorNode(
  state: AgentStateType,
  currentStep: PlanStep,
): Promise<Partial<AgentStateType>> {
  const logger = await getLogger();

  return runWithSpan("react.executor", { goal: state.goal }, async () => {
    const startTime = Date.now();

    logger.info(
      { goal: state.goal, requestId: state.requestId },
      "Starting ReAct execution",
    );

    emitStepEvent(state.requestId, {
      stepType: "searching",
      stepId: currentStep.id,
      title: "Searching for information...",
      status: "running",
    });

    try {
      const depContext = {}; // all deps of current step
      const result = await executeReActLoop(
        currentStep,
        state.requestId,
        depContext,
      );

      const executionTimeMs = Date.now() - startTime;
      logger.info(
        {
          success: result.success,
          turns: result.turns.length,
          executionTimeMs,
          confidence: result.confidence,
          chunksCollected: result.collectedChunks.length,
        },
        "ReAct execution complete",
      );

      // Use collectedChunks from result (already deduplicated and sorted)
      const formattedData = formatReActResultsForAnswer(result);

      if (result.success && result.collectedChunks.length > 0) {
        // ReAct collected data - pass to final LLM for synthesis
        return {
          stepResults: {
            // No answer here - final LLM will synthesize
            react_summary: result.summary,
            react_data: formattedData,
            react_turns: result.turns,
            react_confidence: result.confidence,
            // Chunks with IDs for citation
            react_chunks: result.collectedChunks,
          },
          llmCalls: (state.llmCalls ?? 0) + result.turns.length,
          shouldReplan: false,
          hasSearchResults: true,
        };
      } else {
        // ReAct didn't find any data
        return {
          stepResults: {
            react_summary: result.summary,
            react_data: formattedData,
            react_turns: result.turns,
            react_error: result.error,
            react_chunks: [],
          },
          llmCalls: (state.llmCalls ?? 0) + result.turns.length,
          shouldReplan: false, // Don't replan, let finalAnswer handle it
          hasSearchResults: false,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "ReAct execution failed");

      emitStepEvent(state.requestId, {
        stepId: "react-error",
        stepType: "reasoning",
        title: "Searching...",
        status: "failed",
        message:
          "I encountered an issue while searching. I will try to continue.",
      });

      return {
        stepResults: {
          react_error: errorMessage,
        },
        error: errorMessage,
        shouldReplan: false,
      };
    }
  });
}
