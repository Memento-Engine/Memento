import { AgentStateType } from "../agentState";
import { executeReActLoop, formatReActResultsForAnswer } from "../skills/reactExecutor";
import { getLogger } from "../utils/logger";
import { getConfig } from "../config/config";
import { runWithSpan } from "../telemetry/tracing";
import { emitStepEvent } from "../utils/eventQueue";

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
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const logger = await getLogger();
  const config = await getConfig();

  return runWithSpan(
    "react.executor",
    { goal: state.goal },
    async () => {
      const startTime = Date.now();

      logger.info({ goal: state.goal, requestId: state.requestId }, "Starting ReAct execution");

      emitStepEvent(
        "react-start",
        "reasoning",
        "Starting search...",
        "running",
        state.requestId
      );

      try {
        const result = await executeReActLoop(state.goal, state);

        const executionTimeMs = Date.now() - startTime;
        logger.info({
          success: result.success,
          turns: result.turns.length,
          executionTimeMs,
          confidence: result.confidence,
        }, "ReAct execution complete");

        // Extract all search results from turns for citations
        const allSearchResults: unknown[] = [];
        for (const turn of result.turns) {
          if (
            turn.observation.success &&
            turn.observation.data &&
            Array.isArray(turn.observation.data)
          ) {
            allSearchResults.push(...turn.observation.data);
          }
        }

        if (result.success && result.answer) {
          // ReAct produced a final answer
          return {
            stepResults: {
              react_answer: result.answer,
              react_turns: result.turns,
              react_confidence: result.confidence,
              // Include search results for citation extraction
              react_search_results: allSearchResults,
            },
            llmCalls: (state.llmCalls ?? 0) + result.turns.length,
            shouldReplan: false,
            hasSearchResults: allSearchResults.length > 0,
          };
        } else {
          // ReAct didn't produce an answer - try to use the data gathered
          const lastData = formatReActResultsForAnswer(result);
          
          return {
            stepResults: {
              react_answer: null,
              react_data: lastData,
              react_turns: result.turns,
              react_error: result.error,
              // Include search results for citation extraction
              react_search_results: allSearchResults,
            },
            llmCalls: (state.llmCalls ?? 0) + result.turns.length,
            shouldReplan: false, // Don't replan, let finalAnswer handle it
            hasSearchResults: allSearchResults.length > 0,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, "ReAct execution failed");

        emitStepEvent(
          "react-error",
          "reasoning",
          "Search failed",
          "failed",
          state.requestId
        );

        return {
          stepResults: {
            react_error: errorMessage,
          },
          error: errorMessage,
          shouldReplan: false,
        };
      }
    }
  );
}
