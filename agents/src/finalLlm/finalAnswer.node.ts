import { AgentStateType } from "../agentState";
import { createContextLogger } from "../utils/logger";
import { finalAnswerPrompt } from "../prompts/finalResultPrompt";
import { ErrorHandler } from "../utils/parser";
import { getConfig } from "../config/config";
import { ExecutorError, ErrorCode } from "../types/errors";
import { emitCompletion, emitStepEvent } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

/**
 * Final answer node: Synthesize step results into final answer.
 * Generates natural language response for the user.
 * Always generates a response, even if no search results were found.
 */
export async function finalAnswerNode(state: AgentStateType): Promise<AgentStateType> {
  return runWithSpan(
    "agent.node.final_answer",
    {
      request_id: state.requestId,
      node: "finalAnswer",
    },
    async () => {
      const logger = await createContextLogger(state.requestId, {
        node: "finalAnswer",
      });

      logger.info("Final answer node started", {
        stepCount: state.plan?.steps?.length ?? 0,
        resultCount: Object.keys(state.stepResults ?? {}).length,
        noResultsFound: state.noResultsFound,
        hasSearchResults: state.hasSearchResults,
      });

      const { stepResults, goal, noResultsFound, hasSearchResults } = state;
      const config = await getConfig();

      if ((state.llmCalls ?? 0) >= config.agent.maxLlmCalls) {
        const partialSummary = `Partial answer due to runtime safeguards. I found ${Object.keys(stepResults ?? {}).length} completed result sets for your request: "${goal}".`;
        emitCompletion(partialSummary, state.requestId);
        return {
          ...state,
          finalResult: partialSummary,
          endTime: Date.now(),
        };
      }

      // Handle case where no results were found
      if (!hasSearchResults || !stepResults || Object.keys(stepResults).length === 0) {
        logger.warn("No search results available - generating no-results response", {
          goal,
          noResultsFound,
          resultsCount: Object.keys(stepResults ?? {}).length,
        });

        const noResultsMessage = noResultsFound
          ? `I was unable to find any relevant information for your request: "${goal}". The system performed multiple search attempts with different queries and variations, but did not return any matching results from the captured data.`
          : `I could not find relevant information for your request: "${goal}". Please try rephrasing your query or providing more specific details.`;

        // Emit completion event even with no results
        emitCompletion(noResultsMessage, state.requestId);

        return {
          ...state,
          finalResult: noResultsMessage,
          endTime: Date.now(),
        };
      }

      try {
        // Generate final answer prompt
        const prompt = await finalAnswerPrompt.invoke({
          goal,
          stepResults: JSON.stringify(stepResults, null, 2),
        });

        logger.debug("Final answer prompt prepared", {
          resultSize: JSON.stringify(stepResults).length,
        });

        emitStepEvent(
          "finalize_0",
          "completion",
          "Finalizing the answer...",
          "running",
          state.requestId,
          {
            description: "Synthesizing the final response",
          }
        );

        const llmInvocation = await invokeRoleLlm({
          role: "final",
          prompt,
          requestId: state.requestId,
          spanName: "agent.node.final_answer.llm",
          spanAttributes: {
            node: "finalAnswer",
          },
        });
        const llmResult = llmInvocation.response;

        // Extract content as plain text (not JSON)
        // The finalAnswer prompt explicitly asks for natural language, not JSON
        let finalResult: string;

        if (typeof llmResult.content === "string") {
          finalResult = llmResult.content.trim();
        } else if (Array.isArray(llmResult.content)) {
          finalResult = llmResult.content
            .map((item: any) => {
              if (typeof item === "string") return item;
              if (item && typeof item === "object" && "text" in item) {
                return item.text ?? "";
              }
              return "";
            })
            .join("")
            .trim();
        } else {
          finalResult = String(llmResult.content).trim();
        }

        if (!finalResult) {
          throw new Error("Final answer is empty");
        }

        logger.info("Final answer generated successfully", {
          resultLength: finalResult.length,
        });

        emitStepEvent(
          "finalize_0",
          "completion",
          "Finished",
          "completed",
          state.requestId,
          {
            description: "Final answer generated",
            duration: Math.max(1, Math.round(((Date.now() - (state.startTime ?? Date.now())) / 1000) * 10) / 10),
          }
        );
        // Emit completion event
        emitCompletion(finalResult, state.requestId);

        return {
          ...state,
          finalResult,
          endTime: Date.now(),
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(error, ErrorCode.EXECUTOR_FAILED, {
          node: "finalAnswer",
          goal,
        });

        logger.error("Final answer node failed", error, {
          error: agentError.code,
          message: agentError.message,
        });

        // Even on error, try to provide something to the user
        const fallbackMessage = `I encountered an error while processing your request: "${goal}". The system was unable to complete the response generation.`;
        emitCompletion(fallbackMessage, state.requestId);

        throw agentError;
      }
    }
  );
}
