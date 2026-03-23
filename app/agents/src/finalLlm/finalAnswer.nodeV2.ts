import { AgentStateType } from "../agentState";
import { createContextLogger } from "../utils/logger";
import { ErrorHandler } from "../utils/parser";
import { ErrorCode } from "../types/errors";
import {
  emitCompletion,
  emitError,
  emitSources,
  emitStepEvent,
  emitTextChunk,
} from "../utils/eventQueue";
import { runWithSpan } from "../telemetry/tracing";
import { invokeRoleLlmStreaming } from "../llm/routing";
import { getSearchResultsByChunkIds } from "../tools/getSearchResultsByChunkIds";
import { StepResult } from "../types/stepResult";

// ═══════════════════════════════════════════════════════════════════════════
// CITATION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse all [[chunk_N]] citation IDs from the LLM response text.
 * This covers any chunk the model decided to cite, regardless of whether
 * the pre-computed allChunkIds set already contains it.
 */
function extractCitedChunkIds(text: string): number[] {
  const ids = new Set<number>();
  const re = /\[\[chunk_(\d+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ids.add(Number(m[1]));
  }
  return Array.from(ids);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format step results as context for the final LLM.
 * Each step becomes a section with its brief + evidence summary.
 */
function formatStepBriefs(stepResults: Record<string, StepResult>): string {
  const entries = Object.entries(stepResults);
  if (entries.length === 0) return "No step results available.";

  const parts: string[] = [];

  for (const [stepId, result] of entries) {
    parts.push(`### ${stepId}`);
    parts.push(`**Goal:** ${result.goal}`);
    parts.push(`**Status:** ${result.status} (${result.confidence} confidence)`);
    parts.push(`**Summary:** ${result.summary}`);
    parts.push(`**Evidence:**\n\`\`\`json\n${JSON.stringify(result.evidence, null, 2)}\n\`\`\``);

    if (result.gaps.length > 0) {
      parts.push(`**Gaps:** ${result.gaps.join("; ")}`);
    }

    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Collect all evidence chunk_ids across all steps.
 */
function collectAllChunkIds(stepResults: Record<string, StepResult>): number[] {
  const ids = new Set<number>();
  for (const result of Object.values(stepResults)) {
    // Primary source: evidenceChunkIds built by the executor
    for (const id of result.evidenceChunkIds) {
      ids.add(id);
    }
    // Defensive: also scan the evidence rows directly to catch any divergence
    if (Array.isArray(result.evidence)) {
      for (const row of result.evidence as Record<string, unknown>[]) {
        const chunkId = (row?.chunk_id ?? row?.id);
        if (typeof chunkId === "number") ids.add(chunkId);
      }
    }
    // Include explicitly-read chunks
    for (const id of result.chunksRead ?? []) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

/**
 * Format last N chat messages for tone context.
 */
function formatRecentChat(chatHistory: Array<{ role: string; content: string }>, count: number): string {
  if (!chatHistory || chatHistory.length === 0) return "";

  const recent = chatHistory.slice(-count);
  return recent.map(m => `${m.role}: ${m.content}`).join("\n");
}

function buildFinalPrompt(
  goal: string,
  rewrittenQuery: string | undefined,
  stepBriefs: string,
  recentChat: string,
  currentDateTime: string,
): string {
  return `You are the final response generator for a personal memory search agent.

Your task: synthesize search step results into a clear, direct answer for the user.

## Current Date/Time
${currentDateTime}
Use this as reference for any temporal language like "today", "yesterday", "this week", etc.

## User Goal
${rewrittenQuery ?? goal}

## Step Results
${stepBriefs}

## Citation Rules
- Cite evidence using chunk_ids: [[chunk_42]]
- Multiple sources: [[chunk_42][chunk_45]]
- Only cite chunks mentioned in step results
- If evidence is from web search and has no chunk_id, do not invent chunk citations
- If a step found nothing, say so honestly

## Response Guidelines
- Synthesize information from all steps
- Be specific about what was found (apps, time ranges, activities)
- Acknowledge gaps if any step reported them
- Never fabricate information not in the step summaries
- Keep response concise and directly useful
- Use natural conversational language

${recentChat ? `## Recent Conversation\n${recentChat}\n\nMatch the conversational tone above.` : ""}

Respond in natural language. Do not output JSON.`;
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
      const logger = await createContextLogger(state.requestId, { node: "finalAnswer" });
      const startMs = Date.now();

      logger.info("Final answer node started", {
        stepCount: state.plan?.steps?.length ?? 0,
        resultCount: Object.keys(state.stepResults ?? {}).length,
      });

      const stepResults = (state.stepResults ?? {}) as Record<string, StepResult>;
      const { goal } = state;

      // Check if we have any results
      const allChunkIds = collectAllChunkIds(stepResults);

      try {
        // Fetch sources for UI panel
        const searchResults = await getSearchResultsByChunkIds(allChunkIds, state.requestId);

        // Emit sources for UI
        emitSources(state.requestId, {
          includeImages: false,
          sources: searchResults.map(s => ({
            chunkId: s.chunk_id,
            appName: s.app_name,
            windowTitle: s.window_name,
            capturedAt: s.captured_at,
            browserUrl: s.browser_url,
            textContent: s.text_content,
            textJson: s.text_json,
            imagePath: s.image_path,
          })),
        });
        const stepBriefs = formatStepBriefs(stepResults);


        console.log("Formatted step briefs for final LLM prompt:\n");
        console.dir(stepBriefs, { depth: null, colors: true });

        const recentChat = formatRecentChat(state.chatHistory ?? [], 3);

        // Get current date/time for temporal grounding
        const now = new Date();
        const currentDateTime = `${now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })} at ${now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })}`;

        const prompt = buildFinalPrompt(
          goal,
          state.rewrittenQuery,
          stepBriefs,
          recentChat,
          currentDateTime,
        );

        console.log("Final CuSTOME LLM prompt:", JSON.stringify(prompt, null, 2));

        logger.info("Final LLM context", {
          promptChars: prompt.length,
          estimatedTokens: Math.ceil(prompt.length / 4),
          chunkCount: allChunkIds.length,
        });

        emitStepEvent(state.requestId, {
          stepId: "finalize_0",
          stepType: "completion",
          actionType: "summarizing",
          title: "Generating your answer...",
          status: "completed",
        });

        // Stream final answer
        const llmResult = await invokeRoleLlmStreaming({
          role: "final",
          prompt: [
            { role: "system", content: prompt },
            { role: "user", content: state.rewrittenQuery ?? state.goal },
          ],
          requestId: state.requestId,
          spanName: "agent.node.final_answer.llm",
          spanAttributes: { node: "finalAnswer" },
          onChunk: (chunk: string) => {
            emitTextChunk(chunk, state.requestId);
          },
          authHeaders: state.authHeaders,
        });

        // Extract response text
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


        const durationMs = Date.now() - startMs;
        logger.info("Final answer generated", {
          resultLength: rawResponse.length,
          durationMs,
          sourceCount: searchResults.length,
        });

        emitCompletion(rawResponse, state.requestId);

        return {
          ...state,
          finalResult: rawResponse,
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
        emitError("Failed to generate response", ErrorCode.EXECUTOR_FAILED, state.requestId, true);
        throw agentError;
      }
    },
  );
}
