import { AgentStateType } from "../agentState";
import { createContextLogger } from "../utils/logger";
import { finalAnswerPrompt } from "../prompts/finalResultPrompt";
import { ErrorHandler } from "../utils/parser";
import { getConfig } from "../config/config";
import { ExecutorError, ErrorCode } from "../types/errors";
import { emitCompletion, emitStepEvent } from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlm } from "../llm/routing";

interface SearchRowLike {
  chunk_id?: number | string;
  text_content?: string;
  text_json?: string;
  app_name?: string;
  window_title?: string;
  browser_url?: string;
  captured_at?: string;
  image_path?: string;
  frame_id?: number;
  window_x?: number;
  window_y?: number;
  window_width?: number;
  window_height?: number;
}

interface RetrievedSource {
  chunk_id: string;
  text_content: string;
  text_json?: string;
  app_name: string;
  window_title: string;
  browser_url: string;
  captured_at: string;
  image_path: string;
  frame_id?: number;
  window_x?: number;
  window_y?: number;
  window_width?: number;
  window_height?: number;
}

function normalizeChunkId(rawId: number | string | undefined): string | undefined {
  if (rawId === null || rawId === undefined) return undefined;
  const asString = String(rawId).trim();
  if (!asString) return undefined;
  return asString.startsWith("chunk_") ? asString : `chunk_${asString}`;
}

function trimText(value: string | undefined, maxChars: number): string {
  const text = (value ?? "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

function flattenSearchRows(stepResults: Record<string, any> | undefined): SearchRowLike[] {
  if (!stepResults) return [];
  return Object.values(stepResults)
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((row) => row && typeof row === "object" && "chunk_id" in row);
}

function buildRetrievedSources(stepResults: Record<string, any> | undefined): RetrievedSource[] {
  const byChunk = new Map<string, RetrievedSource>();

  for (const row of flattenSearchRows(stepResults)) {
    const chunkId = normalizeChunkId(row.chunk_id);
    if (!chunkId) continue;

    if (!byChunk.has(chunkId)) {
      byChunk.set(chunkId, {
        chunk_id: chunkId,
        text_content: row.text_content ?? "",
        text_json: row.text_json,
        app_name: row.app_name ?? "",
        window_title: row.window_title ?? "",
        browser_url: row.browser_url ?? "",
        captured_at: row.captured_at ?? "",
        image_path: row.image_path ?? "",
        frame_id: row.frame_id,
        window_x: row.window_x,
        window_y: row.window_y,
        window_width: row.window_width,
        window_height: row.window_height,
      });
    }
  }

  return Array.from(byChunk.values());
}

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
      const retrievedSources = buildRetrievedSources(stepResults);
      const includeCitations =
        state.executionPlan?.include_citations ??
        (state.executionPlan?.citation_policy !== "None" && state.executionPlan?.retrieval_depth !== "None");
      const includeTextLayout = state.executionPlan?.include_text_layout ?? false;

      if ((state.llmCalls ?? 0) >= config.agent.maxLlmCalls) {
        const partialSummary = `Partial answer due to runtime safeguards. I found ${Object.keys(stepResults ?? {}).length} completed result sets for your request: "${goal}".`;
        emitCompletion(partialSummary, state.requestId);
        return {
          ...state,
          finalResult: partialSummary,
          retrievedSources,
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
          retrievedSources,
          endTime: Date.now(),
        };
      }

      try {
        const llmContext = retrievedSources.slice(0, 12).map((source) => ({
          chunk_id: source.chunk_id,
          text: trimText(source.text_content, 1200),
          app_name: source.app_name,
          window_title: source.window_title,
          captured_at: source.captured_at,
          browser_url: source.browser_url,
          ...(includeTextLayout
            ? {
                text_json: trimText(source.text_json, 2000),
              }
            : {}),
        }));

        const citationInstruction =
          includeCitations && llmContext.length > 0
            ? "If you make a factual claim backed by retrieved context, cite using exact syntax [[chunk_id]]. For multiple sources use [[chunk_1][chunk_2]]. Only cite IDs present in Retrieved Context."
            : "Do not include citation markers in your response.";

        // Generate final answer prompt
        const prompt = await finalAnswerPrompt.invoke({
          goal,
          retrievedContext: JSON.stringify(llmContext, null, 2),
          citationInstruction,
        });

        logger.debug("Final answer prompt prepared", {
          sourceCount: llmContext.length,
          includeCitations,
          includeTextLayout,
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
          retrievedSources,
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
