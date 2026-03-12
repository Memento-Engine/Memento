import { AgentStateType } from "../agentState";
import { createContextLogger } from "../utils/logger";
import { finalAnswerPrompt } from "../prompts/finalResultPrompt";
import { ErrorHandler } from "../utils/parser";
import { getConfig } from "../config/config";
import { ExecutorError, ErrorCode } from "../types/errors";
import {
  emitCompletion,
  emitError,
  emitStepEvent,
  emitTextChunk,
} from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlmStreaming } from "../llm/routing";
import { normalizeOcrLayout, NormalizedOcrLayout } from "../utils/ocrLayout";

/*
============================================================
FINAL ANSWER NODE (v2)
============================================================

Synthesises all step results into a human-readable answer.
Works with the new Plan schema (no DatabaseQuery on steps).
============================================================
*/

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
  normalized_text_layout: NormalizedOcrLayout;
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

function normalizeChunkId(
  rawId: number | string | undefined,
): string | undefined {
  if (rawId === null || rawId === undefined) return undefined;
  const s = String(rawId).trim();
  if (!s) return undefined;
  return s.startsWith("chunk_") ? s : `chunk_${s}`;
}

function trimText(value: string | undefined, maxChars: number): string {
  const text = (value ?? "").trim();
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`;
}

function flattenSearchRows(
  stepResults: Record<string, any> | undefined,
): SearchRowLike[] {
  if (!stepResults) return [];
  return Object.values(stepResults)
    .flatMap((val) => (Array.isArray(val) ? val : []))
    .filter((row) => row && typeof row === "object" && "chunk_id" in row);
}

function buildRetrievedSources(
  stepResults: Record<string, any> | undefined,
): RetrievedSource[] {
  const byChunk = new Map<string, RetrievedSource>();
  for (const row of flattenSearchRows(stepResults)) {
    const chunkId = normalizeChunkId(row.chunk_id);
    if (!chunkId || byChunk.has(chunkId)) continue;
    byChunk.set(chunkId, {
      chunk_id: chunkId,
      text_content: row.text_content ?? "",
      text_json: row.text_json,
      normalized_text_layout: normalizeOcrLayout(
        row.text_content ?? "",
        row.text_json,
      ),
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
  return Array.from(byChunk.values());
}

export async function finalAnswerNodeV2(
  state: AgentStateType,
): Promise<AgentStateType> {
  return runWithSpan(
    "agent.node.final_answer",
    { request_id: state.requestId, node: "finalAnswer" },
    async () => {
      const logger = await createContextLogger(state.requestId, {
        node: "finalAnswer",
      });

      const startMs = Date.now();
      logger.info("Final answer node started", {
        stepCount: state.plan?.steps?.length ?? 0,
        resultCount: Object.keys(state.stepResults ?? {}).length,
      });

      const { stepResults, goal, hasSearchResults } = state;
      const config = await getConfig();
      const retrievedSources = buildRetrievedSources(stepResults); // We don't need this because llm dynamically calls sql what fields it wants. we simply passdown the stepresults to promp.

      // ── Budget guard ───────────────────────────────────────
      if ((state.llmCalls ?? 0) >= config.agent.maxLlmCalls) {
        const partial = `Partial answer due to runtime safeguards. I found ${Object.keys(stepResults ?? {}).length} completed result sets for your request: "${goal}".`;
        logger.warn("LLM call limit reached, partial answer");
        // emitCompletion(partial, state.requestId);
        // return {
        //   ...state,
        //   finalResult: partial,
        //   retrievedSources,
        //   endTime: Date.now(),
        // };
      }

      // ── No results ────────────────────────────────────────
      if (
        // !hasSearchResults ||
        !stepResults ||
        Object.keys(stepResults).length === 0
      ) {
        const noMsg = state.noResultsFound
          ? `I was unable to find any relevant information for your request: "${goal}". The system performed multiple search attempts but did not return any matching results.`
          : `I could not find relevant information for: "${goal}". Try rephrasing your query or providing more specific details.`;
        emitCompletion(noMsg, state.requestId);
        return {
          ...state,
          finalResult: noMsg,
          retrievedSources,
          endTime: Date.now(),
        };
      }

      // ── Build LLM context ─────────────────────────────────

      try {
        const llmContext = retrievedSources.map((src) => ({
          chunk_id: src.chunk_id,
          text: src.text_content,
          app_name: src.app_name,
          window_title: src.window_title,
          captured_at: src.captured_at,
          browser_url: src.browser_url,
        }));

        const citationInstruction =
          llmContext.length > 0
            ? "If you make a factual claim backed by retrieved context, cite using exact syntax [[chunk_id]]. For multiple sources use [[chunk_1][chunk_2]]. Only cite IDs present in Retrieved Context."
            : "Do not include citation markers in your response.";

        const prompt = await finalAnswerPrompt.invoke({
          goal,
          retrievedContext: JSON.stringify(llmContext, null, 2),
          citationInstruction,
        });

        emitStepEvent(
          "finalize_0",
          "completion",
          "Preparing your answer",
          "running",
          state.requestId,
          { description: "Organizing the results" },
        );

        // Use streaming LLM call for final answer - emit text chunks as they arrive
        const llmResult = await invokeRoleLlmStreaming({
          role: "final",
          prompt,
          requestId: state.requestId,
          spanName: "agent.node.final_answer.llm",
          spanAttributes: { node: "finalAnswer" },
          onChunk: (chunk: string) => {
            // Emit each chunk as it arrives for real-time streaming
            emitTextChunk(chunk, state.requestId);
          },
        });

        // Extract plain text (already accumulated from streaming)
        let finalResult: string;
        const content = llmResult.response.content;

        if (typeof content === "string") {
          finalResult = content.trim();
        } else if (Array.isArray(content)) {
          finalResult = content
            .map((item: any) =>
              typeof item === "string" ? item : (item?.text ?? ""),
            )
            .join("")
            .trim();
        } else {
          finalResult = String(content).trim();
        }

        if (!finalResult) throw new Error("Final answer is empty");

        const durationMs = Date.now() - startMs;

        logger.info("Final answer generated", {
          resultLength: finalResult.length,
          durationMs,
        });

        emitStepEvent(
          "finalize_0",
          "completion",
          "Answer ready",
          "completed",
          state.requestId,
          {
            description: "Summarized the findings",
            duration:
              Math.round(
                ((Date.now() - (state.startTime ?? Date.now())) / 1000) * 10,
              ) / 10,
          },
        );

        return {
          ...state,
          finalResult,
          retrievedSources,
          endTime: Date.now(),
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(
          error,
          ErrorCode.EXECUTOR_FAILED,
          {
            node: "finalAnswer",
            goal,
          },
        );

        logger.error("Final answer node failed", error);

        // Emit error event for the frontend
        emitError(
          "Failed to generate response",
          ErrorCode.EXECUTOR_FAILED,
          state.requestId,
          true,
        );

        throw agentError;
      }
    },
  );
}
