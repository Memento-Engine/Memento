import { AgentStateType } from "../agentState";
import { executeSql, formatResultsAsJson } from "./sqlExecutor";
import { getToolRegistry } from "../tools/registry";
import { getLogger, logger, logSectionLine, logSeparator } from "../utils/logger";
import { getConfig } from "../config/config";
import { invokeRoleLlm, AuthHeaders } from "../llm/routing";
import { getSkills, buildSkillContext } from "./loader";
import { SafeJsonParser } from "../utils/parser";
import { runWithSpan } from "../telemetry/tracing";
import { emitStepEvent } from "../utils/eventQueue";
import { z } from "zod";
import { PlanStep } from "../planner/plan.schema";
import { getSearchResultsByChunkIds } from "../tools/getSearchResultsByChunkIds";
import { buildCompactAppAliasSection } from "../utils/appNameAliases";
import {
  StepResult,
  SearchPerformed,
  SearchModeConfig,
  SEARCH_MODE_PRESETS,
  SearchMode,
} from "../types/stepResult";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ReActActionType = "sql" | "semantic" | "hybrid" | "webSearch" | "readMore" | "getStepResult" | "currentDateTime" | "think" | "done";

const VALID_REACT_ACTIONS: ReActActionType[] = [
  "sql",
  "semantic",
  "hybrid",
  "webSearch",
  "readMore",
  "getStepResult",
  "currentDateTime",
  "think",
  "done",
];

const SKILL_ACTION_ALIASES: Record<string, ReActActionType> = {
  "aggregation-digest": "sql",
  "fts-search": "sql",
  "temporal-query": "sql",
  "semantic-search": "semantic",
  "hybrid-search": "hybrid",
  "web-search": "webSearch",
};

export const ReActActionSchema = z.object({
  thought: z.string().describe("Reasoning about current state and what to do next"),
  action: z.enum(VALID_REACT_ACTIONS),

  // For sql action
  sql: z.string().optional(),

  // For semantic/hybrid action
  query: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  filters: z.object({
    app_names: z.array(z.string()).optional(),
    time_range: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
  }).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),

  // For readMore action
  chunkIds: z.array(z.number()).optional(),

  // For getStepResult action
  targetStepId: z.string().optional(),

  // For think action
  analysis: z.string().optional(),

  // For done action
  summary: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  gaps: z.array(z.string()).optional(),
});

export type ReActAction = z.infer<typeof ReActActionSchema>;

export interface ReActTurn {
  turnNumber: number;
  action: ReActAction;
  observation: {
    success: boolean;
    data?: unknown;
    rowCount?: number;
    error?: string;
    executionTimeMs?: number;
  };
}

export interface ReActResult {
  success: boolean;
  stepResult: StepResult;
  turns: ReActTurn[];
  totalTimeMs: number;
}

function normalizeReActActionPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...(payload as Record<string, unknown>) };
  const rawAction = typeof normalized.action === "string" ? normalized.action.trim() : null;

  if (!rawAction || VALID_REACT_ACTIONS.includes(rawAction as ReActActionType)) {
    return normalized;
  }

  const mappedAction = SKILL_ACTION_ALIASES[rawAction];
  if (!mappedAction) {
    return normalized;
  }

  normalized.action = mappedAction;

  if (typeof normalized.thought === "string" && normalized.thought.trim().length > 0) {
    normalized.thought = `${normalized.thought} [normalized from skill alias '${rawAction}']`;
  } else {
    normalized.thought = `Recovered invalid action '${rawAction}' by mapping it to '${mappedAction}'.`;
  }

  return normalized;
}

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW TRUNCATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PREVIEW_LENGTH = 150;
const MAX_OFFSET = 60;

/**
 * Truncate text_content fields in search results to preview length.
 * Preserves all other fields (agent gets full metadata).
 */
function truncateToPreview(rows: Record<string, unknown>[], previewLength = DEFAULT_PREVIEW_LENGTH): Record<string, unknown>[] {
  return rows.map(row => {
    const result = { ...row };
    if (typeof result.text_content === "string" && result.text_content.length > previewLength) {
      const truncated = result.text_content.slice(0, previewLength);
      const lastSpace = truncated.lastIndexOf(" ");
      result.text_content = (lastSpace > previewLength * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "...";
    }
    return result;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════

async function executeSqlAction(
  action: ReActAction,
  requestId: string,
  previewLength: number,
): Promise<ReActTurn["observation"]> {
  if (!action.sql) {
    return { success: false, error: "Missing SQL in action" };
  }

  const result = await executeSql({ sql: action.sql });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
      executionTimeMs: result.executionTimeMs,
    };
  }

  // Truncate text_content to preview
  const previews = truncateToPreview(result.rows ?? [], previewLength);

  return {
    success: true,
    data: previews,
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
  };
}

async function executeSemanticAction(
  action: ReActAction,
  requestId: string,
  previewLength: number,
): Promise<ReActTurn["observation"]> {
  if (!action.query) {
    return { success: false, error: "Missing query in semantic action" };
  }

  const toolRegistry = await getToolRegistry();
  const semanticTool = toolRegistry.get("semantic_search");
  if (!semanticTool) {
    return { success: false, error: "Semantic search tool not available" };
  }

  const toolResult = await semanticTool.execute(
    {
      query: action.query,
      limit: action.limit ?? 20,
      offset: Math.min(action.offset ?? 0, MAX_OFFSET),
      filters: action.filters,
    },
    { requestId, stepId: "react-semantic", attemptNumber: 1, timeout: 30000 },
  );

  const nestedData = toolResult.data as { data?: unknown[] };
  const results = Array.isArray(nestedData?.data)
    ? nestedData.data
    : Array.isArray(toolResult.data)
      ? toolResult.data
      : [];

  // Truncate to preview
  const previews = truncateToPreview(results as Record<string, unknown>[], previewLength);

  return {
    success: toolResult.success,
    data: previews,
    rowCount: previews.length,
    error: typeof toolResult.error === "string" ? toolResult.error : toolResult.error?.message,
  };
}

async function executeHybridAction(
  action: ReActAction,
  requestId: string,
  previewLength: number,
): Promise<ReActTurn["observation"]> {
  if (!action.query) {
    return { success: false, error: "Missing query in hybrid action" };
  }

  const toolRegistry = await getToolRegistry();
  const hybridTool = toolRegistry.get("hybrid_search");
  if (!hybridTool) {
    return { success: false, error: "Hybrid search tool not available" };
  }

  const toolResult = await hybridTool.execute(
    {
      query: action.query,
      keywords: action.keywords,
      limit: action.limit ?? 20,
      offset: Math.min(action.offset ?? 0, MAX_OFFSET),
      filters: action.filters,
    },
    { requestId, stepId: "react-hybrid", attemptNumber: 1, timeout: 30000 },
  );

  const nestedData = toolResult.data as { data?: unknown[] };
  const results = Array.isArray(nestedData?.data)
    ? nestedData.data
    : Array.isArray(toolResult.data)
      ? toolResult.data
      : [];

  const previews = truncateToPreview(results as Record<string, unknown>[], previewLength);

  return {
    success: toolResult.success,
    data: previews,
    rowCount: previews.length,
    error: typeof toolResult.error === "string" ? toolResult.error : toolResult.error?.message,
  };
}

async function executeWebSearchAction(
  action: ReActAction,
  requestId: string,
  authHeaders?: AuthHeaders,
): Promise<ReActTurn["observation"]> {
  if (!action.query) {
    return { success: false, error: "Missing query in webSearch action" };
  }

  const toolRegistry = await getToolRegistry();
  const webSearchTool = toolRegistry.get("web_search");
  if (!webSearchTool) {
    return { success: false, error: "Web search tool not available" };
  }

  const toolResult = await webSearchTool.execute(
    {
      query: action.query,
      limit: action.limit ?? 5,
    },
    {
      requestId,
      stepId: "react-web-search",
      attemptNumber: 1,
      timeout: 30000,
      authHeaders,
    },
  );

  const nestedData = toolResult.data as { data?: unknown[] };
  const results = Array.isArray(nestedData?.data)
    ? nestedData.data
    : Array.isArray(toolResult.data)
      ? toolResult.data
      : [];

  return {
    success: toolResult.success,
    data: results,
    rowCount: results.length,
    error: typeof toolResult.error === "string" ? toolResult.error : toolResult.error?.message,
  };
}

function getObservationKey(row: unknown): string {
  if (row && typeof row === "object") {
    const url = (row as Record<string, unknown>).url;
    if (typeof url === "string" && url.length > 0) {
      return `url:${url}`;
    }
  }

  try {
    return JSON.stringify(row);
  } catch {
    return String(row);
  }
}

async function executeReadMoreAction(
  action: ReActAction,
  requestId: string,
  maxChunks: number,
): Promise<ReActTurn["observation"]> {
  if (!action.chunkIds || action.chunkIds.length === 0) {
    return { success: false, error: "Missing chunkIds in readMore action" };
  }

  const ids = action.chunkIds.slice(0, maxChunks);
  const startTime = Date.now();

  const results = await getSearchResultsByChunkIds(ids, requestId);


  console.log("ReadMore tool returns", results);

  return {
    success: true,
    data: results,
    rowCount: results.length,
    executionTimeMs: Date.now() - startTime,
  };
}

async function executeCurrentDateTimeAction(
  requestId: string,
): Promise<ReActTurn["observation"]> {
  const toolRegistry = await getToolRegistry();
  const currentDateTimeTool = toolRegistry.get("current_datetime");

  if (!currentDateTimeTool) {
    return { success: false, error: "current_datetime tool not available" };
  }

  const toolResult = await currentDateTimeTool.execute(
    {},
    { requestId, stepId: "react-current-datetime", attemptNumber: 1, timeout: 10000 },
  );

  return {
    success: toolResult.success,
    data: toolResult.data,
    error: typeof toolResult.error === "string" ? toolResult.error : toolResult.error?.message,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

function buildSkillReferences(
  skills: Map<string, { metadata: { name: string }; content: string }>,
): string {
  const sections: string[] = [];
  const skillOrder = [
    "skill-selection",
    "fts-search",
    "semantic-search",
    "hybrid-search",
    "web-search",
    "temporal-query",
    "aggregation-digest",
  ];

  for (const skillName of skillOrder) {
    const skill = skills.get(skillName);
    if (skill) {
      sections.push(`### Reference Skill: ${skill.metadata.name}\n${skill.content}`);
    }
  }

  return sections.join("\n\n");
}

async function buildReActSystemPrompt(): Promise<string> {
  const skills = await getSkills();
  const schemaSkill = skills.get("database-schema");
  const schemaContext = schemaSkill?.content ?? "";
  const skillReferences = buildSkillReferences(skills);

  return `You are a search agent with two retrieval modes:
- Local screen activity search over the user's captured history
- Public web search for external or current information

Choose the mode that best matches the user's request. Do not force local search when the question clearly requires live or public web information.

## WORKFLOW
1. **Search** (sql/semantic/hybrid/webSearch) → returns previews or external results
2. **Observe previews** → decide which chunks look relevant
3. **readMore** → get FULL text for specific chunk_ids you want to examine
4. **Repeat or Done** → once you have enough evidence

## Database Schema
${schemaContext}

## Query Patterns & Skills
${skillReferences}

${buildCompactAppAliasSection()}

## Critical Action Rule
- The reference skills above are guidance only. Skill names such as "aggregation-digest", "fts-search", "semantic-search", "hybrid-search", and "temporal-query" are NOT valid action values.
- Your JSON "action" field must be exactly one of: ${VALID_REACT_ACTIONS.join(", ")}.
- If a reference skill suggests an aggregation query, emit action "sql" with the SQL in the "sql" field.
- If a reference skill suggests semantic search, emit action "semantic".
- If a reference skill suggests hybrid search, emit action "hybrid".
- If a reference skill suggests web search, emit action "webSearch".

## Available Actions

### sql
Execute a SQLite query. Returns PREVIEWS (text_content is truncated to ~150 chars).
Always include \`c.id as chunk_id\` and LIMIT clause.
\`\`\`json
{"action": "sql", "thought": "...", "sql": "SELECT c.id as chunk_id, f.captured_at, f.app_name, f.window_title, c.text_content FROM chunks_fts JOIN chunks c ON chunks_fts.rowid = c.id JOIN frames f ON c.frame_id = f.id WHERE chunks_fts MATCH 'error' LIMIT 20"}
\`\`\`

### semantic
Vector similarity search. Returns PREVIEWS.
\`\`\`json
{"action": "semantic", "thought": "...", "query": "coding debugging rust", "filters": {"app_names": ["VS Code", "Cursor"]}, "limit": 20}
\`\`\`

### hybrid
Combined FTS + vector search. Returns PREVIEWS.
\`\`\`json
{"action": "hybrid", "thought": "...", "query": "web search browsing", "keywords": ["google", "stackoverflow"], "limit": 20}
\`\`\`

### webSearch
Public web search for external, current, or verified information. Returns web results with titles, URLs, and snippets.
\`\`\`json
{"action": "webSearch", "thought": "Need external web information", "query": "React 19 release notes March 2026", "limit": 5}
\`\`\`

Use webSearch PROACTIVELY when:
- The user asks for current events, public documentation, release notes, or general web facts
- You're uncertain about something and need external validation
- The query mixes personal history with public knowledge (search both memory AND web)
- Local search results are incomplete and web knowledge could fill gaps
- The topic requires up-to-date or verified external information
- You need to provide more complete context beyond the user's captured history

**IMPORTANT**: Web search and memory search can be combined in the same step. If the query benefits from both, run memory search first, then web search to supplement.

### readMore
Get FULL text content for specific chunks you've seen in previews. Use this when you need to examine content in detail.
Max ${DEFAULT_PREVIEW_LENGTH} chunks per call.
\`\`\`json
{"action": "readMore", "thought": "Chunks 42, 45 look relevant from the VS Code results - need full text", "chunkIds": [42, 45, 47]}
\`\`\`

### getStepResult
Retrieve the full result of a previously completed step. Use when you need detailed findings from another step beyond what dependency context provides.
\`\`\`json
{"action": "getStepResult", "thought": "Need full details from step1 to cross-reference", "targetStepId": "step1"}
\`\`\`

### currentDateTime
Get current local date/time from the user machine (with timezone). Use this before interpreting "today", "yesterday", or local-time references.
\`\`\`json
{"action": "currentDateTime", "thought": "Need exact local date/time before time filtering"}
\`\`\`

### think
Pause to reason about what you've found so far.
\`\`\`json
{"action": "think", "thought": "...", "analysis": "The SQL results show VS Code activity but I haven't found terminal usage yet"}
\`\`\`

### done
Conclude the step. Provide a summary of what you found and any gaps.
\`\`\`json
{"action": "done", "thought": "Found sufficient evidence", "summary": "Found 3 VS Code sessions between 2-6pm working on Rust daemon code", "confidence": "high", "gaps": []}
\`\`\`

If data is incomplete:
\`\`\`json
{"action": "done", "thought": "Could only find partial data", "summary": "Found VS Code activity but no terminal data", "confidence": "medium", "gaps": ["No terminal/CLI activity found", "Morning hours not searched"]}
\`\`\`

## STRATEGY
- First, call currentDateTime to ground all temporal reasoning in the user's local machine time
- Start with a search to see the landscape (previews)
- Use readMore only on chunks that look relevant
- Don't readMore everything — be selective
- If search returns empty, switch strategy (SQL→semantic, or broaden filters)
- After 2-3 empty results, conclude with what you have
- For URLs/domains (github.com, docs.site/path), prefer browser_url LIKE '%...%' instead of bare FTS MATCH tokens
- If using MATCH with dotted/domain terms, quote each term: '"github.com" OR "gitlab.com"'
- **MIX memory + web**: If the query could benefit from both personal history AND public info, run memory search first then webSearch to supplement
- Use webSearch proactively when uncertain or when external validation would strengthen the answer

## Time Reference
Current date: ${new Date().toISOString().split("T")[0]}
Use: date('now') for today, date('now', '-1 day') for yesterday

## Response Format
Output ONLY valid JSON matching an action schema. ONE action per turn.`;
}

/**
 * Build the per-turn prompt with history and context.
 */
function buildTurnPrompt(
  stepGoal: string,
  history: ReActTurn[],
  depContext: Record<string, unknown>,
): string {
  let prompt = `## Step Goal\n${stepGoal}\n\n`;

  // Dependency context from previous steps
  if (Object.keys(depContext).length > 0) {
    prompt += `## Context From Previous Steps\n`;
    for (const [stepId, result] of Object.entries(depContext)) {
      prompt += `### ${stepId}\n`;
      if (typeof result === "string") {
        // Brief from transitive ancestor
        prompt += `${result}\n`;
      } else {
        // Full step result from direct dependency
        prompt += `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`;
      }
      prompt += `\n`;
    }
    prompt += `---\n\n`;
  }

  // Turn history
  if (history.length > 0) {
    prompt += `## Previous Actions & Observations\n`;

    for (const turn of history) {
      prompt += `\n### Turn ${turn.turnNumber}\n`;
      prompt += `**Thought:** ${turn.action.thought}\n`;
      prompt += `**Action:** ${turn.action.action}\n`;

      if (turn.action.sql) prompt += `**SQL:** \`${turn.action.sql}\`\n`;
      if (turn.action.query) prompt += `**Query:** "${turn.action.query}"\n`;
      if (turn.action.keywords) prompt += `**Keywords:** ${JSON.stringify(turn.action.keywords)}\n`;
      if (turn.action.chunkIds) prompt += `**ChunkIds:** ${JSON.stringify(turn.action.chunkIds)}\n`;
      if (turn.action.targetStepId) prompt += `**TargetStep:** ${turn.action.targetStepId}\n`;
      if (turn.action.analysis) prompt += `**Analysis:** ${turn.action.analysis}\n`;

      prompt += `\n**Observation:**\n`;
      if (turn.observation.success) {
        const data = turn.observation.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            prompt += `⚠️ Empty result set (0 rows)\n`;
          } else if (data.length <= 10) {
            prompt += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
          } else {
            prompt += `${turn.observation.rowCount} rows. First 8:\n`;
            prompt += `\`\`\`json\n${JSON.stringify(data.slice(0, 8), null, 2)}\n\`\`\`\n`;
            prompt += `...(${data.length - 8} more)\n`;
          }
        } else if (data) {
          prompt += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
        }
      } else {
        prompt += `❌ Error: ${turn.observation.error}\n`;
      }
    }

    prompt += `\n---\n`;
  }

  prompt += `\nWhat is your next action? Output ONLY the JSON action.`;
  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN REACT LOOP
// ═══════════════════════════════════════════════════════════════════════════

export async function executeReActLoop(
  currentPlanStep: PlanStep,
  requestId: string,
  depContext: Record<string, unknown>,
  searchMode: SearchMode = "search",
  authHeaders?: AuthHeaders,
  allStepResults?: Record<string, StepResult>,
): Promise<ReActResult> {
  const logger = await getLogger();
  const config = await getConfig();
  const modeConfig = SEARCH_MODE_PRESETS[searchMode];
  const startTime = Date.now();
  const history: ReActTurn[] = [];
  const previewLength = config.agent.previewLength;

  // Extract UI-friendly search queries from plan step (if available)
  const uiQueries = (currentPlanStep as any).uiSearchQueries as string[] | undefined;

  // Track for StepResult
  const searchesPerformed: SearchPerformed[] = [];
  const allChunkIds = new Map<number, unknown>();
  const supplementalEvidence = new Map<string, unknown>();
  const chunksRead = new Set<number>();
  let searchCallCount = 0;
  let lastSearchActionType: "sql" | "semantic" | "hybrid" | "webSearch" | undefined;
  let lastSearchQueries: string[] | undefined;


  const systemPrompt = await buildReActSystemPrompt();

  const currentDateTimeObservation = await executeCurrentDateTimeAction(requestId);
  history.push({
    turnNumber: 0,
    action: {
      thought: "Captured current local machine date/time for temporal grounding",
      action: "currentDateTime",
    },
    observation: currentDateTimeObservation,
  });

  for (let turn = 1; turn <= modeConfig.maxReactTurns; turn++) {
    const turnPrompt = buildTurnPrompt(currentPlanStep.stepGoal, history, depContext);
    const { response } = await invokeRoleLlm({
      role: "executor",
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: turnPrompt },
      ],
      requestId,
      spanName: "react.turn",
      spanAttributes: { turn_number: turn },
      authHeaders,
    });

    const content = typeof response === "string" ? response : response.content;
    logSectionLine(logger, "RESULT executor LLM", {
      requestId,
      stepId: currentPlanStep.id,
      turn,
      contentLength: content?.length ?? 0,
    });

    // Parse action
    let action: ReActAction;
    try {
      const parsed = await SafeJsonParser.parseContent(content);
      action = ReActActionSchema.parse(normalizeReActActionPayload(parsed));
    } catch (error) {
      logger.error({ content, error }, "Failed to parse ReAct action");
      action = {
        thought: "Parse error, attempting recovery",
        action: "think",
        analysis: `Could not parse: ${String(content).slice(0, 200)}`,
      };
    }

    logger.info({ turn, action: action.action, thought: action.thought, gaps: action.gaps }, "ReAct action");
    logSectionLine(logger, "THINKING / ANALYSIS", {
      requestId,
      stepId: currentPlanStep.id,
      turn,
      thought: action.thought,
      analysis: action.analysis,
      action: action.action,
    });

    // Handle done action
    if (action.action === "done") {
      // Collect all evidence chunk_ids from successful turns
      for (const t of history) {
        if (t.observation.success && Array.isArray(t.observation.data)) {
          for (const row of t.observation.data as Record<string, unknown>[]) {
            const chunkId = row?.chunk_id ?? row?.id;
            if (typeof chunkId === "number") allChunkIds.set(chunkId, row);
          }
        }
      }

      // Emit search results for UI
      const evidenceIds = Array.from(allChunkIds.keys());
      if (evidenceIds.length > 0) {
        const searchResults = await getSearchResultsByChunkIds(evidenceIds, requestId);
        emitStepEvent(requestId, {
          stepType: "searching",
          stepId: currentPlanStep.id,
          actionType: lastSearchActionType,
          title: `Found ${searchResults.length} relevant result${searchResults.length === 1 ? "" : "s"}`,
          resultCount: searchResults.length,
          results: searchResults,
          queries: lastSearchQueries,
          status: "completed",
        });
      } else if (supplementalEvidence.size > 0) {
        // Convert web search results to StepSearchResult format with sourceType
        const webResults = Array.from(supplementalEvidence.values()).map((row: any, index) => ({
          chunk_id: -(index + 1), // Negative IDs for web results (not real chunk IDs)
          app_name: "Web",
          window_name: row.title ?? row.url ?? "Web result",
          captured_at: row.publishedAt ?? new Date().toISOString(),
          browser_url: row.url,
          text_content: row.snippet,
          sourceType: "web" as const,
          url: row.url,
          title: row.title,
          snippet: row.snippet,
          publishedAt: row.publishedAt,
        }));

        emitStepEvent(requestId, {
          stepType: "searching",
          stepId: currentPlanStep.id,
          actionType: lastSearchActionType,
          title: action.summary ?? `Found ${supplementalEvidence.size} web result${supplementalEvidence.size === 1 ? "" : "s"}`,
          resultCount: supplementalEvidence.size,
          results: webResults,
          queries: lastSearchQueries,
          status: "completed",
        });
      } else {
        emitStepEvent(requestId, {
          stepType: "searching",
          stepId: currentPlanStep.id,
          actionType: lastSearchActionType,
          title: action.summary ?? "Completed search",
          queries: lastSearchQueries,
          status: "completed",
        });
      }

      const stepResult: StepResult = {
        stepId: currentPlanStep.id,
        goal: currentPlanStep.stepGoal,
        status: evidenceIds.length > 0 || supplementalEvidence.size > 0 ? (action.confidence === "high" ? "complete" : "partial") : "empty",
        summary: action.summary ?? "No summary provided",
        evidenceChunkIds: evidenceIds,
        evidence: [...Array.from(allChunkIds.values()), ...Array.from(supplementalEvidence.values())],
        gaps: action.gaps ?? [],
        searchesPerformed,
        chunksRead: Array.from(chunksRead),
        confidence: action.confidence ?? "medium",
      };


      return {
        success: true,
        stepResult,
        turns: history,
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Execute action
    let observation: ReActTurn["observation"];

    switch (action.action) {
      case "sql":
        lastSearchActionType = "sql";
        lastSearchQueries = undefined;
        emitStepEvent(requestId, {
          stepType: "searching",
          actionType: "sql",
          stepId: currentPlanStep.id,
          description: action.thought,
          title: `Searching your data...`,
          status: "running",
        });
        logSectionLine(logger, "CALLED ACTION sql", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          sql: action.sql,
        });
        if (searchCallCount >= modeConfig.maxSearchCalls) {
          observation = { success: false, error: "Search call limit reached. Use readMore or done." };
        } else {
          observation = await executeSqlAction(action, requestId, previewLength);
          searchCallCount++;
          searchesPerformed.push({
            type: "sql",
            query: action.sql?.slice(0, 100) ?? "",
            resultCount: observation.rowCount ?? 0,
          });
        }
        logSectionLine(logger, "RESULT ACTION sql", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          rowCount: observation.rowCount,
          executionTimeMs: observation.executionTimeMs,
          error: observation.error,
        });
        break;

      case "semantic":
        lastSearchActionType = "semantic";
        lastSearchQueries = uiQueries?.slice(0, 3) ?? (action.query ? [action.query] : undefined);
        emitStepEvent(requestId, {
          stepType: "searching",
          actionType: "semantic",
          stepId: currentPlanStep.id,
          title: `Finding similar content...`,
          queries: lastSearchQueries,
          status: "running",
        });
        logSectionLine(logger, "CALLED ACTION semantic", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          query: action.query,
          limit: action.limit ?? 20,
          offset: Math.min(action.offset ?? 0, MAX_OFFSET),
        });
        if (searchCallCount >= modeConfig.maxSearchCalls) {
          observation = { success: false, error: "Search call limit reached. Use readMore or done." };
        } else {
          observation = await executeSemanticAction(action, requestId, previewLength);
          searchCallCount++;
          searchesPerformed.push({
            type: "semantic",
            query: action.query ?? "",
            resultCount: observation.rowCount ?? 0,
          });
        }
        logSectionLine(logger, "RESULT ACTION semantic", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          rowCount: observation.rowCount,
          error: observation.error,
        });
        break;

      case "hybrid":
        lastSearchActionType = "hybrid";
        lastSearchQueries = uiQueries?.slice(0, 3) ?? (action.query ? [action.query] : undefined);
        emitStepEvent(requestId, {
          stepType: "searching",
          actionType: "hybrid",
          stepId: currentPlanStep.id,
          title: `Searching across all sources...`,
          queries: lastSearchQueries,

          status: "running",
        });
        logSectionLine(logger, "CALLED ACTION hybrid", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          query: action.query,
          keywords: action.keywords,
          limit: action.limit ?? 20,
          offset: Math.min(action.offset ?? 0, MAX_OFFSET),
        });
        if (searchCallCount >= modeConfig.maxSearchCalls) {
          observation = { success: false, error: "Search call limit reached. Use readMore or done." };
        } else {
          observation = await executeHybridAction(action, requestId, previewLength);
          searchCallCount++;
          searchesPerformed.push({
            type: "hybrid",
            query: action.query ?? "",
            resultCount: observation.rowCount ?? 0,
          });
        }
        logSectionLine(logger, "RESULT ACTION hybrid", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          rowCount: observation.rowCount,
          error: observation.error,
        });
        break;

      case "webSearch":
        lastSearchActionType = "webSearch";
        lastSearchQueries = uiQueries?.slice(0, 3) ?? (action.query ? [action.query] : undefined);
        emitStepEvent(requestId, {
          stepType: "searching",
          actionType: "webSearch",
          stepId: currentPlanStep.id,
          title: "Searching the web...",
          queries: lastSearchQueries,
          status: "running",
        });
        logSectionLine(logger, "CALLED ACTION webSearch", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          query: action.query,
          limit: action.limit ?? 5,
        });
        if (searchCallCount >= modeConfig.maxSearchCalls) {
          observation = { success: false, error: "Search call limit reached. Use done when you have enough evidence." };
        } else {
          observation = await executeWebSearchAction(action, requestId, authHeaders);
          searchCallCount++;
          searchesPerformed.push({
            type: "webSearch",
            query: action.query ?? "",
            resultCount: observation.rowCount ?? 0,
          });

          // Emit web results immediately for UI feedback
          if (observation.success && Array.isArray(observation.data) && observation.data.length > 0) {
            const webResults = (observation.data as any[]).map((row: any, index) => ({
              chunk_id: -(index + 1),
              app_name: "Web",
              window_name: row.title ?? row.url ?? "Web result",
              captured_at: row.publishedAt ?? new Date().toISOString(),
              browser_url: row.url,
              text_content: row.snippet,
              sourceType: "web" as const,
              url: row.url,
              title: row.title,
              snippet: row.snippet,
              publishedAt: row.publishedAt,
            }));
            emitStepEvent(requestId, {
              stepType: "searching",
              actionType: "webSearch",
              stepId: currentPlanStep.id,
              title: `Found ${webResults.length} web result${webResults.length === 1 ? "" : "s"}`,
              resultCount: webResults.length,
              results: webResults,
              queries: lastSearchQueries,
              status: "completed",
            });
          }
        }
        logSectionLine(logger, "RESULT ACTION webSearch", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          rowCount: observation.rowCount,
          error: observation.error,
        });
        break;

      case "readMore":
        {
          const chunkCount = (action.chunkIds ?? []).slice(0, modeConfig.maxReadMoreChunks).length;
          emitStepEvent(requestId, {
            stepType: "searching",
            actionType: "readMore",
            stepId: currentPlanStep.id,
            title: `Reading ${chunkCount} result${chunkCount === 1 ? "" : "s"} in detail...`,
            status: "running",
          });
        }
        logSectionLine(logger, "CALLED ACTION readMore", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          chunkIds: action.chunkIds,
        });
        observation = await executeReadMoreAction(action, requestId, modeConfig.maxReadMoreChunks);
        // Track which chunks were fully read
        if (observation.success && Array.isArray(observation.data)) {
          for (const row of observation.data as Record<string, unknown>[]) {
            const id = (row as any)?.chunk_id;
            if (typeof id === "number") chunksRead.add(id);
          }
        }
        logSectionLine(logger, "RESULT ACTION readMore", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          rowCount: observation.rowCount,
          error: observation.error,
        });
        break;

      case "getStepResult":
        logSectionLine(logger, "CALLED ACTION getStepResult", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          targetStepId: action.targetStepId,
        });
        if (!action.targetStepId) {
          observation = { success: false, error: "Missing targetStepId in getStepResult action" };
        } else if (!allStepResults || !(action.targetStepId in allStepResults)) {
          observation = { success: false, error: `Step "${action.targetStepId}" not found or not yet completed` };
        } else {
          observation = { success: true, data: allStepResults[action.targetStepId] };
        }
        logSectionLine(logger, "RESULT ACTION getStepResult", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          error: observation.error,
        });
        break;

      case "currentDateTime":
        logSectionLine(logger, "CALLED ACTION currentDateTime", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
        });
        observation = await executeCurrentDateTimeAction(requestId);
        logSectionLine(logger, "RESULT ACTION currentDateTime", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          success: observation.success,
          data: observation.data,
          error: observation.error,
        });
        break;

      case "think":
        emitStepEvent(requestId, {
          stepType: "reasoning",
          actionType: "thinking",
          stepId: currentPlanStep.id,
          title: action.thought ?? action.analysis ?? "Thinking...",
          reasoning: action.analysis,
          status: "running",
        });
        observation = { success: true, data: { analysis: action.analysis } };
        logSectionLine(logger, "RESULT ACTION think", {
          requestId,
          stepId: currentPlanStep.id,
          turn,
          analysis: action.analysis,
        });
        break;

      default:
        observation = { success: false, error: `Unknown action: ${action.action}` };
    }

    // Track chunk_ids from search results
    if (observation.success && Array.isArray(observation.data)) {
      for (const row of observation.data as Record<string, unknown>[]) {
        const chunkId = row?.chunk_id ?? row?.id;
        if (typeof chunkId === "number") {
          allChunkIds.set(chunkId, row);
        } else {
          supplementalEvidence.set(getObservationKey(row), row);
        }
      }
    }

    history.push({ turnNumber: turn, action, observation });
    logSeparator(logger, `REACT TURN END | step=${currentPlanStep.id} turn=${turn}`, {
      requestId,
      stepId: currentPlanStep.id,
      turn,
      action: action.action,
      success: observation.success,
      rowCount: observation.rowCount,
      error: observation.error,
    });
  }

  // Max turns reached — produce step result with what we have
  logger.warn({ turns: modeConfig.maxReactTurns }, "ReAct loop hit max turns");

  const evidenceIds = Array.from(allChunkIds.keys());

  const stepResult: StepResult = {
    stepId: currentPlanStep.id,
    goal: currentPlanStep.stepGoal,
    status: evidenceIds.length > 0 || supplementalEvidence.size > 0 ? "partial" : "empty",
    summary: "Max turns reached. " + (evidenceIds.length > 0 || supplementalEvidence.size > 0 ? `Found ${evidenceIds.length + supplementalEvidence.size} potentially relevant result${evidenceIds.length + supplementalEvidence.size === 1 ? "" : "s"}.` : "No relevant results found."),
    evidenceChunkIds: Array.from(allChunkIds.keys()),
    evidence: [...Array.from(allChunkIds.values()), ...Array.from(supplementalEvidence.values())],
    gaps: ["Step terminated early — turn limit reached"],
    searchesPerformed,
    chunksRead: Array.from(chunksRead),
    confidence: "low",
  };

  return {
    success: evidenceIds.length > 0,
    stepResult,
    turns: history,
    totalTimeMs: Date.now() - startTime,
  };
}
