import { AgentStateType } from "../agentState";
import { createContextLogger } from "../utils/logger";
import { ErrorHandler } from "../utils/parser";
import { getConfig } from "../config/config";
import { ExecutorError, ErrorCode } from "../types/errors";
import {
  emitCompletion,
  emitError,
  emitSources,
  emitStepEvent,
  emitTextChunk,
} from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlmStreaming } from "../llm/routing";
import { normalizeOcrLayout, NormalizedOcrLayout } from "../utils/ocrLayout";
import {
  getProvenanceRegistry,
  ProvenanceSummary,
  cleanupProvenanceRegistry,
} from "../provenance";
import { getSearchResultsByChunkIds } from "../tools/getSearchResultsByChunkIds";
import { ChatPromptTemplate } from "@langchain/core/prompts";

/*
============================================================
FINAL ANSWER NODE (v2) - Provenance-Based
============================================================

Synthesises all step results into a human-readable answer.

Key Changes for Context Compression:
1. LLM receives COMPRESSED SUMMARIES, not raw data
2. Provenance registry stores raw data for citation resolution
3. Citations are resolved AFTER LLM generates answer
4. Significant reduction in context size (10x or more)
============================================================
*/

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
}

interface StepSummaryForLLM {
  step_id: string;
  step_goal: string;
  provenance_id: string;
  summary: string;
  record_count: number;
  by_app?: Record<string, { count: number; top_titles?: string[] }>;
  time_range?: { start: string; end: string };
  topics?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

const finalAnswerPromptWithProvenance = ChatPromptTemplate.fromTemplate(`
You are the final response generator for a personal memory agent.

Your task is to answer the user's question based on the SUMMARIZED search results from previous steps.

CRITICAL: You are working with COMPRESSED SUMMARIES, not raw data.
- Each step has a summary of what was found
- Use the provenance_id for citations (format: [[prov_XXX]])
- If you need more detail from a specific step, mention it in your answer

User Goal:
{goal}

Step Summaries:
{stepSummaries}

Citation Policy:
- Cite claims using provenance IDs: [[prov_001]], [[prov_002]], etc.
- These will be resolved to specific chunk_ids after your response
- Multiple sources: [[prov_001]][[prov_002]]
- If a step has record_count: 0, don't cite it

Response Guidelines:
1. Synthesize information from the step summaries
2. Be specific about what was found (apps, time ranges, topics)
3. If data seems incomplete, say so
4. Never fabricate information not in the summaries
5. Keep response concise and directly useful

Respond in natural language. Do not output JSON.
`);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract step summaries from stepResults for LLM context
 * This is the KEY function that provides compressed context
 */
function extractStepSummaries(
  stepResults: Record<string, any> | undefined,
): StepSummaryForLLM[] {
  if (!stepResults) return [];

  const summaries: StepSummaryForLLM[] = [];

  for (const [stepId, result] of Object.entries(stepResults)) {
    if (!result || typeof result !== "object") continue;

    const compressedSummary = result.compressed_summary as ProvenanceSummary | undefined;

    if (compressedSummary) {
      summaries.push({
        step_id: stepId,
        step_goal: result.step_goal ?? stepId,
        provenance_id: result.provenance_id ?? compressedSummary.provenance_id,
        summary: compressedSummary.summary,
        record_count: compressedSummary.record_count,
        by_app: compressedSummary.by_app,
        time_range: compressedSummary.time_range,
        topics: compressedSummary.topics,
      });
    } else if (result.react_summary) {
      // Fallback for backward compatibility
      summaries.push({
        step_id: stepId,
        step_goal: result.step_goal ?? stepId,
        provenance_id: result.provenance_id ?? `legacy_${stepId}`,
        summary: result.react_summary,
        record_count: result.chunk_ids?.length ?? 0,
      });
    }
  }

  return summaries;
}

/**
 * Format step summaries for the LLM prompt
 */
function formatStepSummariesForPrompt(summaries: StepSummaryForLLM[]): string {
  if (summaries.length === 0) {
    return "No step results available.";
  }

  const parts: string[] = [];

  for (const summary of summaries) {
    parts.push(`### ${summary.step_id} (${summary.provenance_id})`);
    parts.push(`**Goal:** ${summary.step_goal}`);
    parts.push(`**Summary:** ${summary.summary}`);
    parts.push(`**Records:** ${summary.record_count}`);

    if (summary.by_app && Object.keys(summary.by_app).length > 0) {
      const appBreakdown = Object.entries(summary.by_app)
        .map(([app, data]) => `${app}: ${data.count}`)
        .join(", ");
      parts.push(`**Apps:** ${appBreakdown}`);
    }

    if (summary.time_range) {
      parts.push(`**Time Range:** ${summary.time_range.start} to ${summary.time_range.end}`);
    }

    if (summary.topics && summary.topics.length > 0) {
      parts.push(`**Topics:** ${summary.topics.join(", ")}`);
    }

    parts.push(""); // Empty line between steps
  }

  return parts.join("\n");
}

/**
 * Collect all chunk_ids from step results for final source resolution
 */
function collectAllChunkIds(stepResults: Record<string, any> | undefined): number[] {
  if (!stepResults) return [];

  const allIds = new Set<number>();

  for (const result of Object.values(stepResults)) {
    if (!result || typeof result !== "object") continue;

    // Get chunk_ids from the result
    const chunkIds = result.chunk_ids;
    if (Array.isArray(chunkIds)) {
      for (const id of chunkIds) {
        if (typeof id === "number") {
          allIds.add(id);
        }
      }
    }
  }

  return Array.from(allIds);
}

/**
 * Build a map from provenance_id → chunk_ids[] upfront from stepResults.
 * This allows us to resolve citations during streaming.
 */
function buildProvenanceToCitationMap(
  stepResults: Record<string, any> | undefined,
): Map<string, number[]> {
  const citationMap = new Map<string, number[]>();
  if (!stepResults) return citationMap;

  for (const result of Object.values(stepResults)) {
    if (!result || typeof result !== "object") continue;
    const provId = result.provenance_id as string | undefined;
    const chunkIds = result.chunk_ids as number[] | undefined;
    if (provId && chunkIds && chunkIds.length > 0) {
      citationMap.set(provId, chunkIds);
    }
  }

  return citationMap;
}

/**
 * Replace all [[prov_XXX]] citations in a text string using a pre-built map.
 */
function resolveProvenanceCitations(
  text: string,
  citationMap: Map<string, number[]>,
): string {
  return text.replace(/\[\[(prov_\d+)\]\]/g, (_match, provId: string) => {
    const chunkIds = citationMap.get(provId);
    if (!chunkIds || chunkIds.length === 0) return _match;
    return `[[${chunkIds.slice(0, 5).map(id => `chunk_${id}`).join("][")}]]`;
  });
}

/**
 * Create a streaming citation resolver that buffers partial `[[prov_` tokens
 * and emits resolved text as soon as a complete citation is found.
 */
function createStreamingCitationResolver(
  citationMap: Map<string, number[]>,
  emit: (text: string) => void,
) {
  let buffer = "";

  return {
    push(chunk: string) {
      buffer += chunk;

      // Keep flushing resolved segments from the front of the buffer
      while (true) {
        const openIdx = buffer.indexOf("[[");

        // No opening bracket — flush everything
        if (openIdx === -1) {
          if (buffer.length > 0) {
            emit(buffer);
            buffer = "";
          }
          break;
        }

        // Flush text before the opening bracket
        if (openIdx > 0) {
          emit(buffer.slice(0, openIdx));
          buffer = buffer.slice(openIdx);
        }

        // Look for the closing brackets
        const closeIdx = buffer.indexOf("]]");
        if (closeIdx === -1) {
          // Incomplete citation — wait for more data
          break;
        }

        // Extract the full citation token including brackets
        const token = buffer.slice(0, closeIdx + 2);
        buffer = buffer.slice(closeIdx + 2);

        // Resolve and emit
        const resolved = resolveProvenanceCitations(token, citationMap);
        emit(resolved);
      }
    },

    /** Flush any remaining buffered text at end of stream */
    flush() {
      if (buffer.length > 0) {
        const resolved = resolveProvenanceCitations(buffer, citationMap);
        emit(resolved);
        buffer = "";
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NODE
// ═══════════════════════════════════════════════════════════════════════════

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
      logger.info("Final answer node started (provenance-based)", {
        stepCount: state.plan?.steps?.length ?? 0,
        resultCount: Object.keys(state.stepResults ?? {}).length,
      });

      const { stepResults, goal } = state;
      const config = await getConfig();

      // Extract compressed summaries from step results
      const stepSummaries = extractStepSummaries(stepResults);

      logger.info("Step summaries extracted", {
        summaryCount: stepSummaries.length,
        totalRecords: stepSummaries.reduce((sum, s) => sum + s.record_count, 0),
      });

      // ── No results ────────────────────────────────────────
      if (stepSummaries.length === 0 || stepSummaries.every(s => s.record_count === 0)) {
        const noMsg = `I could not find relevant information for: "${goal}". Try rephrasing your query or providing more specific details.`;
        emitCompletion(noMsg, state.requestId);

        // Cleanup provenance registry
        cleanupProvenanceRegistry(state.requestId);

        return {
          ...state,
          finalResult: noMsg,
          retrievedSources: [],
          endTime: Date.now(),
        };
      }

      // ── Build LLM context from compressed summaries ─────────
      try {
        const formattedSummaries = formatStepSummariesForPrompt(stepSummaries);

        // Log context size for monitoring
        const contextSize = formattedSummaries.length;
        logger.info("Context size for final LLM", {
          summaryContextChars: contextSize,
          estimatedTokens: Math.ceil(contextSize / 4),
        });


        logger.info('Formatted summaries for LLM', { formattedSummaries });

        const prompt = await finalAnswerPromptWithProvenance.invoke({
          goal: state.rewrittenQuery ?? state.goal,
          stepSummaries: formattedSummaries,
        });



        console.log("Final LLM prompt", JSON.stringify(prompt, null, 2));



        emitStepEvent(state.requestId, {
          stepId: "finalize_0",
          stepType: "completion",
          title: "Putting it all together...",
          status: "completed",
          message: "I'm compiling the information I found into a final answer for you.",
        });

        // Build citation map BEFORE streaming so we can resolve inline
        const citationMap = buildProvenanceToCitationMap(stepResults);

        const streamResolver = createStreamingCitationResolver(
          citationMap,
          (resolved) => emitTextChunk(resolved, state.requestId),
        );

        // Use streaming LLM call for final answer
        const llmResult = await invokeRoleLlmStreaming({
          role: "final",
          prompt,
          requestId: state.requestId,
          spanName: "agent.node.final_answer.llm",
          spanAttributes: { node: "finalAnswer" },
          onChunk: (chunk: string) => {
            streamResolver.push(chunk);
          },
          authHeaders: state.authHeaders,
        });

        // Flush any remaining buffered citation text
        streamResolver.flush();

        // Extract plain text
        let rawResponse: string;
        const content = llmResult.response.content;

        if (typeof content === "string") {
          rawResponse = content.trim();
        } else if (Array.isArray(content)) {
          rawResponse = content
            .map((item: any) => typeof item === "string" ? item : (item?.text ?? ""))
            .join("")
            .trim();
        } else {
          rawResponse = String(content).trim();
        }

        if (!rawResponse) throw new Error("Final answer is empty");

        // ── Resolve provenance citations to chunk_ids ────────
        const resolvedResponse = resolveProvenanceCitations(rawResponse, citationMap);

        // ── Fetch sources for UI panel ────────────────────────
        const allChunkIds = collectAllChunkIds(stepResults);
        let retrievedSources: RetrievedSource[] = [];

        if (allChunkIds.length > 0) {
          const searchResults = await getSearchResultsByChunkIds(
            allChunkIds.slice(0, 50), // Limit to 50 for UI
            state.requestId,
          );

          retrievedSources = searchResults.map(s => ({
            chunk_id: `chunk_${s.chunk_id}`,
            text_content: s.text_content ?? "",
            app_name: s.app_name ?? "",
            window_title: s.window_name ?? "",
            browser_url: s.browser_url ?? "",
            captured_at: s.captured_at ?? "",
            image_path: s.image_path ?? "",
            normalized_text_layout: { version: 1, normalized_text: "", tokens: [] },
          }));


          // Emit sources for the UI sources panel
          emitSources(state.requestId, {
            includeImages: false,
            sources: searchResults.map((s) => ({
              chunkId: s.chunk_id,
              appName: s.app_name,
              windowTitle: s.window_name,
              capturedAt: s.captured_at,
              browserUrl: s.browser_url,
              textContent: s.text_content,
              textJson: s.text_json,
              imagePath: s.image_path
            })),
          });



        }

        const durationMs = Date.now() - startMs;

        logger.info("Final answer generated (provenance-based)", {
          resultLength: resolvedResponse.length,
          durationMs,
          citationCount: citationMap.size,
          sourceCount: retrievedSources.length,
        });

        // Final completion event
        emitCompletion(resolvedResponse, state.requestId);

        // Cleanup provenance registry after answer is complete
        cleanupProvenanceRegistry(state.requestId);

        return {
          ...state,
          finalResult: resolvedResponse,
          retrievedSources,
          endTime: Date.now(),
          llmCalls: (state.llmCalls ?? 0) + 1,
        };
      } catch (error) {
        const agentError = ErrorHandler.toAgentError(
          error,
          ErrorCode.EXECUTOR_FAILED,
          { node: "finalAnswer", goal },
        );

        logger.error("Final answer node failed", error);

        emitError(
          "Failed to generate response",
          ErrorCode.EXECUTOR_FAILED,
          state.requestId,
          true,
        );

        // Cleanup on error too
        cleanupProvenanceRegistry(state.requestId);

        throw agentError;
      }
    },
  );
}
