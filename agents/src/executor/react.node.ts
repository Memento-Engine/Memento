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
import { CompressedStepOutput } from "../provenance";

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

Now uses Provenance Registry to:
- Store raw data for citation resolution
- Return compressed summaries to reduce context size
============================================================
*/

/**
 * React executor node - uses iterative ReAct loop for search.
 */
export async function reactExecutorNode(
  state: AgentStateType,
  currentStep: PlanStep,
  depContext: Record<string, any> = {},
): Promise<Partial<AgentStateType>> {
  const logger = await getLogger();

  return runWithSpan("react.executor", { goal: state.goal }, async () => {
    const startTime = Date.now();

    logger.info(
      { goal: state.goal, requestId: state.requestId, depCount: Object.keys(depContext).length },
      "Starting ReAct execution",
    );

    try {
      const result = await executeReActLoop(
        currentStep,
        state.requestId,
        depContext,
        state.authHeaders,
      );

      const executionTimeMs = Date.now() - startTime;
      logger.info(
        {
          success: result.success,
          turns: result.turns.length,
          executionTimeMs,
          confidence: result.confidence,
          provenanceId: result.provenance_id,
        },
        "ReAct execution complete",
      );

      if (result.success) {
        // ReAct collected data - pass compressed output to final LLM
        // Raw data is in provenance registry, accessed by provenance_id
        
        const compressedOutput: CompressedStepOutput = {
          provenance_id: result.provenance_id!,
          summary: result.compressed_summary!,
          chunk_ids_available: (result.all_chunk_ids?.length ?? 0) > 0,
        };

        return {
          stepResults: {
            // New compressed format
            provenance_id: result.provenance_id,
            compressed_summary: result.compressed_summary,
            step_goal: currentStep.stepGoal,
            
            // Keep summary for backward compatibility
            react_summary: result.summary,
            react_confidence: result.confidence,
            
            // Store chunk_ids for final citation (small array)
            chunk_ids: result.all_chunk_ids,
          },
          llmCalls: (state.llmCalls ?? 0) + result.turns.length,
          shouldReplan: false,
          hasSearchResults: true,
        };
      } else {
        // ReAct didn't find any data
        return {
          stepResults: {
            provenance_id: result.provenance_id,
            compressed_summary: result.compressed_summary,
            step_goal: currentStep.stepGoal,
            react_summary: result.summary,
            react_error: result.error,
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
