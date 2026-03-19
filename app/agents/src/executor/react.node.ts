import { AgentStateType } from "../agentState";
import { executeReActLoop } from "../skills/reactExecutor";
import { getLogger } from "../utils/logger";
import { runWithSpan } from "../telemetry/tracing";
import { emitStepEvent } from "../utils/eventQueue";
import { PlanStep } from "../planner/plan.schema";
import { StepResult } from "../types/stepResult";

export async function reactExecutorNode(
  state: AgentStateType,
  currentStep: PlanStep,
  depContext: Record<string, unknown> = {},
  allStepResults?: Record<string, StepResult>,
): Promise<{ stepResult: StepResult; llmCalls: number }> {
  const logger = await getLogger();

  return runWithSpan("react.executor", { goal: state.goal }, async () => {
    try {
      const result = await executeReActLoop(
        currentStep,
        state.requestId,
        depContext,
        state.searchMode,
        state.authHeaders,
        allStepResults,
      );

      logger.info(
        {
          result,
        },
        "ReAct execution complete",
      );

      return {
        stepResult: result.stepResult,
        llmCalls: result.turns.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "ReAct execution failed");

      emitStepEvent(state.requestId, {
        stepId: currentStep.id,
        stepType: "searching",
        title: "Search encountered an issue",
        status: "failed",
      });

      // Return an empty step result on failure
      return {
        stepResult: {
          stepId: currentStep.id,
          goal: currentStep.stepGoal,
          status: "empty",
          summary: `Step failed: ${errorMessage}`,
          evidenceChunkIds: [],
          gaps: ["Step execution failed"],
          searchesPerformed: [],
          chunksRead: [],
          confidence: "low",
        },
        llmCalls: 0,
      };
    }
  });
}
