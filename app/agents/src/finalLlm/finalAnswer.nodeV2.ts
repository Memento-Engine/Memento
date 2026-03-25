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
import { invokeRoleLlmStreaming, truncateToApproxTokens } from "../llm/routing";
import { getSearchResultsByChunkIds } from "../tools/getSearchResultsByChunkIds";
import { StepResult } from "../types/stepResult";
import { SafeJsonParser } from "../utils/parser";
import { formatLocalDateTimeForPrompt } from "../utils/time";

const FOLLOWUPS_TAG_START = "<FOLLOWUPS_JSON>";
const FOLLOWUPS_TAG_END = "</FOLLOWUPS_JSON>";

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
  if (entries.length === 0) return "No search results available.";

  const parts: string[] = [];

  for (const [_stepId, result] of entries) {
    const evidence = Array.isArray(result.evidence) ? result.evidence : [];
    const memoryEvidence = evidence.filter((e) => (e.source_type ?? "memory") === "memory");
    const webEvidence = evidence.filter((e) => e.source_type === "web");

    // Don't expose internal step IDs to the LLM
    parts.push(`### Search: ${result.goal}`);
    parts.push(`**Found:** ${result.evidenceChunkIds.length + webEvidence.length} result(s)`);
    parts.push(`**Summary:** ${result.summary}`);
    // if (memoryEvidence.length > 0) {
    //   parts.push(`**Memory Citations:** ${memoryEvidence.map((e) => `[[chunk_${e.chunk_id}]]`).join(" ")}`);
    // }
    if (webEvidence.length > 0) {
      parts.push(`**Web Citations:** ${webEvidence.map((e) => `[[web_${Math.abs(Number(e.chunk_id) || 0)}]]`).join(" ")}`);
    }
    parts.push(`**Evidence:**\n\`\`\`json\n${JSON.stringify(evidence, null, 2)}\n\`\`\``);

    // Only show gaps that are user-relevant, not internal status messages
    const userRelevantGaps = result.gaps.filter(g =>
      !g.includes("turn limit") &&
      !g.includes("terminated early") &&
      !g.includes("Max turns")
    );
    if (userRelevantGaps.length > 0) {
      parts.push(`**Additional notes:** ${userRelevantGaps.join("; ")}`);
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
        if (typeof chunkId === "number" && chunkId > 0) ids.add(chunkId);
      }
    }
    // Include explicitly-read chunks
    for (const id of result.chunksRead ?? []) {
      if (id > 0) ids.add(id);
    }
  }
  return Array.from(ids);
}

function collectWebEvidence(stepResults: Record<string, StepResult>) {
  const byWebId = new Map<number, { chunkId: number; title: string; url: string; snippet: string; capturedAt: string }>();

  for (const result of Object.values(stepResults)) {
    if (!Array.isArray(result.evidence)) continue;

    for (const item of result.evidence as any[]) {
      const sourceType = item?.source_type;
      const chunkId = Number(item?.chunk_id);
      if (sourceType !== "web" || !Number.isFinite(chunkId) || chunkId >= 0) continue;

      const webId = Math.abs(chunkId);
      if (byWebId.has(webId)) continue;

      byWebId.set(webId, {
        chunkId,
        title: (item?.title as string) ?? "Web result",
        url: (item?.url as string) ?? "",
        snippet: (item?.whatItIsAbout as string) ?? "",
        capturedAt: new Date().toISOString(),
      });
    }
  }

  return Array.from(byWebId.values());
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
- For memory evidence, cite using [[chunk_42]]
- For web evidence, cite using [[web_1]] (web id is abs(chunk_id) where web evidence uses negative chunk_id in evidence)
- Multiple sources: [[chunk_42][chunk_45]][[web_1][web_2]] (each citation in separate brackets)
- The source type is in evidence item field "source_type"
- Never cite anything other than [[chunk_N]] or [[web_N]]
- If no results were found, say so honestly
- Limit citations to 3-5 most relevant chunks per statement, not every chunk

## Response Guidelines
- Synthesize information from all search results
- Be specific about what was found (apps, time ranges, activities)
- NEVER mention internal system details like "steps", "turns", "limits", or "timeouts"
- NEVER say things like "ran out of time" or "step terminated" — these are internal
- Never fabricate information not in the evidence
- Keep response concise and directly useful
- Use natural conversational language

## Follow-up Generation
- After the answer, append a follow-up block using this exact format:
${FOLLOWUPS_TAG_START}
{"followups":["question 1","question 2","question 3"]}
${FOLLOWUPS_TAG_END}
- The answer must come first, and the follow-up block must come last
- Return 0 to 3 follow-up questions
- Follow-ups must be short, natural, actionable next searches
- Follow-ups must not repeat the answer
- Follow-ups must not mention steps, chunks, confidence, citations, or system details
- Follow-ups should be useful narrowing or expansion options by app, person, topic, time range, or format
- Total follow-up text should stay under about 50 tokens
- If no strong next step exists, return an empty array

${recentChat ? `## Recent Conversation\n${recentChat}\n\nMatch the conversational tone above.` : ""}

Respond with the answer in natural language, then append the follow-up block exactly as specified.`;
}

function estimateApproxTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.ceil(normalized.length / 4);
}

function normalizeFollowups(parsed: unknown): string[] {
  const rawFollowups =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { followups?: unknown[] }).followups)
      ? (parsed as { followups: unknown[] }).followups
      : [];

  const unique = Array.from(
    new Set(
      rawFollowups
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
        .map((value) => truncateToApproxTokens(value, 16).trim()),
    ),
  );

  const capped: string[] = [];
  let usedTokens = 0;

  for (const followup of unique.slice(0, 3)) {
    const remainingTokens = 50 - usedTokens;
    if (remainingTokens <= 0) break;

    const bounded = truncateToApproxTokens(followup, Math.min(16, remainingTokens)).trim();
    if (!bounded) continue;

    const estimatedTokens = estimateApproxTokens(bounded);
    if (usedTokens + estimatedTokens > 50) break;

    capped.push(bounded);
    usedTokens += estimatedTokens;
  }

  return capped;
}

async function extractAnswerAndFollowups(rawResponse: string): Promise<{ answer: string; followups: string[] }> {
  const startIndex = rawResponse.indexOf(FOLLOWUPS_TAG_START);
  const endIndex = rawResponse.indexOf(FOLLOWUPS_TAG_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return { answer: rawResponse.trim(), followups: [] };
  }

  const answer = rawResponse.slice(0, startIndex).trim();
  const followupsPayload = rawResponse
    .slice(startIndex + FOLLOWUPS_TAG_START.length, endIndex)
    .trim();

  try {
    const parsed = await SafeJsonParser.parseContent(followupsPayload);
    return {
      answer,
      followups: normalizeFollowups(parsed),
    };
  } catch {
    return { answer, followups: [] };
  }
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
      const { goal, rewrittenQuery } = state;


      console.log("Rewritten Query in final llm call:\n", rewrittenQuery);

      // Check if we have any results
      const allChunkIds = collectAllChunkIds(stepResults);

      try {
        // Fetch sources for UI panel
        const searchResults = await getSearchResultsByChunkIds(allChunkIds, state.requestId);
        const webEvidence = collectWebEvidence(stepResults);

        const memorySources = searchResults.map(s => ({
          chunkId: s.chunk_id,
          appName: s.app_name,
          windowTitle: s.window_name,
          capturedAt: s.captured_at,
          browserUrl: s.browser_url,
          textContent: s.text_content,
          textJson: s.text_json,
          imagePath: s.image_path,
          sourceType: "memory" as const,
        }));

        const webSources = webEvidence.map(w => ({
          chunkId: w.chunkId,
          appName: "Web",
          windowTitle: w.title,
          capturedAt: w.capturedAt,
          browserUrl: w.url,
          textContent: w.snippet,
          textJson: null,
          imagePath: "",
          sourceType: "web" as const,
        }));

        // Emit sources for UI
        emitSources(state.requestId, {
          includeImages: false,
          sources: [...memorySources, ...webSources],
        });
        const stepBriefs = formatStepBriefs(stepResults);


        console.log("Formatted step briefs for final LLM prompt:\n");
        console.dir(stepBriefs, { depth: null, colors: true });

        const recentChat = formatRecentChat(state.chatHistory ?? [], 3);

        // Get current local date/time for temporal grounding
        const currentDateTime = formatLocalDateTimeForPrompt();

        const prompt = buildFinalPrompt(
          rewrittenQuery ?? goal,
          state.rewrittenQuery,
          stepBriefs,
          recentChat,
          currentDateTime,
        );

        console.log("Final LLM prompt:\n");
        console.dir(prompt, { depth: null, colors: true });

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

        // Single final LLM call: answer plus followup payload in the same response.
        const llmResult = await invokeRoleLlmStreaming({
          role: "final",
          prompt: [
            { role: "system", content: prompt },
            { role: "user", content: state.rewrittenQuery ?? state.goal },
          ],
          requestId: state.requestId,
          spanName: "agent.node.final_answer.llm",
          spanAttributes: { node: "finalAnswer" },
          onChunk: (_chunk: string) => {
            // Buffer until the full response is available so the followup payload
            // is not streamed into the visible answer text.
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

        const { answer: finalAnswer, followups } = await extractAnswerAndFollowups(rawResponse);
        if (!finalAnswer) throw new Error("Parsed final answer is empty");

        emitTextChunk(finalAnswer, state.requestId);

        const durationMs = Date.now() - startMs;
        logger.info("Final answer generated", {
          resultLength: finalAnswer.length,
          durationMs,
          sourceCount: searchResults.length,
        });

        if (followups.length > 0) {
          logger.info("Generated followups", {
            count: followups.length,
            followups,
          });
        }

        emitCompletion(finalAnswer, state.requestId, "final", followups.length > 0 ? followups : undefined);

        return {
          ...state,
          finalResult: finalAnswer,
          finalFollowups: followups.length > 0 ? followups : undefined,
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
