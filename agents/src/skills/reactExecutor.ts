import { AgentStateType } from "../agentState";
import { executeSql, formatResultsAsJson } from "./sqlExecutor";
import { getToolRegistry } from "../tools/registry";
import { getLogger, logger } from "../utils/logger";
import { getConfig } from "../config/config";
import { invokeRoleLlm, AuthHeaders } from "../llm/routing";
import { getSkills, buildSkillContext } from "./loader";
import { SafeJsonParser } from "../utils/parser";
import { runWithSpan } from "../telemetry/tracing";
import { emitSources, emitStepEvent } from "../utils/eventQueue";
import { z } from "zod";
import { PlanStep } from "../planner/plan.schema";
import { getSearchResultsByChunkIds } from "../tools/getSearchResultsByChunkIds";
import { buildCompactAppAliasSection, expandAppQuery, getAppNameVariants } from "../utils/appNameAliases";
import {
  getProvenanceRegistry,
  ProvenanceRow,
  ProvenanceSummary,
  compressStepResults,
  createCompressedOutput,
  CompressedStepOutput,
} from "../provenance";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Action types the LLM can take in the ReAct loop.
 * Note: ReAct is a DATA COLLECTOR, not an answerer.
 * The final LLM synthesizes answers from collected chunks.
 */
export type ReActActionType = "sql" | "semantic" | "hybrid" | "think" | "done";

/**
 * Schema for LLM action output.
 */
export const ReActActionSchema = z.object({
  thought: z
    .string()
    .describe("Reasoning about current state and what to do next"),
  action: z.enum(["sql", "semantic", "hybrid", "think", "done"]),

  // For sql action
  sql: z.string().optional(),

  // For semantic/hybrid action
  query: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  filters: z
    .object({
      app_names: z.array(z.string()).optional(),
      time_range: z
        .object({
          start: z.string().optional(),
          end: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  // For think action - intermediate reasoning
  analysis: z.string().optional(),

  // For done action - brief summary of what was collected (NOT the final answer)
  summary: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

export type ReActAction = z.infer<typeof ReActActionSchema>;

/**
 * Single turn in the ReAct loop (action + observation).
 */
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

/**
 * Final result of ReAct execution.
 * Contains all turns with their summaries and raw data.
 * The final LLM uses this context to synthesize the answer.
 */
export interface ReActResult {
  success: boolean;
  /** Brief summary from ReAct (NOT the final answer) */
  summary?: string;
  confidence?: "high" | "medium" | "low";
  /** All turns with action thoughts and observation data */
  turns: ReActTurn[];
  totalTimeMs: number;
  error?: string;
  
  /** Provenance tracking for context compression */
  provenance_id?: string;
  compressed_summary?: ProvenanceSummary;
  all_chunk_ids?: number[];
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fuzzy concept indicators that suggest semantic .
 */
const FUZZY_CONCEPTS = [
  "session",
  "coding",
  "programming",
  "work",
  "working",
  "learning",
  "learned",
  "studying",
  "reading",
  "browsing",
  "searching",
  "debugging",
  "deep work",
  "focused",
  "productive",
  "meeting",
  "call",
  "conversation",
  "discussion",
  "tutorial",
  "guide",
  "documentation",
  "research",
  "exploring",
  "watching",
  "activity",
  "activities",
  "doing",
  "did",
  "stuff",
  "things",
];

/**
 * Exact keyword indicators that suggest SQL/FTS search.
 */
const EXACT_INDICATORS = [
  "error",
  "exception",
  "failed",
  "404",
  "500",
  "crash",
  "bug",
  "line",
  "file",
  "function",
  "variable",
  "import",
  "export",
  "exact",
  "specific",
  "precisely",
  "literally",
];

/**
 * Aggregate/structural indicators that suggest SQL.
 */
const AGGREGATE_INDICATORS = [
  "count",
  "how many",
  "total",
  "sum",
  "average",
  "most",
  "least",
  "grouped",
  "per app",
  "per day",
  "breakdown",
  "statistics",
];

/**
 * Time-specific indicators that suggest SQL.
 */
const TIME_INDICATORS = [
  "at \\d",
  "\\d:\\d\\d",
  "\\d pm",
  "\\d am",
  "yesterday",
  "today",
  "this morning",
  "this afternoon",
  "last week",
  "last hour",
  "\\d minutes ago",
];

/**
 * Analyze a query and suggest the best initial action type.
 */
function analyzeQueryIntent(query: string): {
  suggestedAction: "semantic" | "sql" | "hybrid";
  reasoning: string;
  hints: string[];
} {
  const q = query.toLowerCase();
  const hints: string[] = [];

  // Check for fuzzy concepts
  const hasFuzzyConcept = FUZZY_CONCEPTS.some((concept) => q.includes(concept));
  if (hasFuzzyConcept) {
    hints.push("Query contains fuzzy concepts (coding, learning, etc.)");
  }

  // Check for exact keywords
  const hasExactIndicator = EXACT_INDICATORS.some((ind) => q.includes(ind));
  if (hasExactIndicator) {
    hints.push("Query contains exact keyword indicators (error, file, etc.)");
  }

  // Check for aggregates
  const hasAggregateIndicator = AGGREGATE_INDICATORS.some((ind) =>
    q.includes(ind),
  );
  if (hasAggregateIndicator) {
    hints.push("Query requests aggregation or counting");
  }

  // Check for time specifics
  const hasTimeIndicator = TIME_INDICATORS.some((ind) =>
    new RegExp(ind, "i").test(query),
  );
  if (hasTimeIndicator) {
    hints.push("Query has specific time references");
  }

  // Decision logic
  if (hasAggregateIndicator) {
    return {
      suggestedAction: "sql",
      reasoning: "Aggregation queries need SQL with GROUP BY",
      hints,
    };
  }

  if (hasFuzzyConcept && !hasExactIndicator) {
    return {
      suggestedAction: "semantic",
      reasoning: "Fuzzy concepts are best matched with semantic search",
      hints,
    };
  }

  if (hasExactIndicator && !hasFuzzyConcept) {
    return {
      suggestedAction: "sql",
      reasoning: "Exact keywords should use FTS for precision",
      hints,
    };
  }

  if (hasFuzzyConcept && hasExactIndicator) {
    return {
      suggestedAction: "hybrid",
      reasoning: "Mix of concepts and keywords benefits from hybrid search",
      hints,
    };
  }

  if (hasTimeIndicator && !hasFuzzyConcept) {
    return {
      suggestedAction: "sql",
      reasoning: "Time-based queries work well with SQL date functions",
      hints,
    };
  }

  // Default to hybrid for safety
  return {
    suggestedAction: "hybrid",
    reasoning: "Hybrid search is the safe default for unclear queries",
    hints,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build skill reference sections for the prompt.
 */
function buildSkillReferences(
  skills: Map<string, { metadata: { name: string }; content: string }>,
): string {
  const sections: string[] = [];

  // Include these skills in order - skill-selection comes first with critical guidance
  const skillOrder = [
    "skill-selection", // Critical: Action selection guidance
    "fts-search",
    "semantic-search",
    "hybrid-search",
    "temporal-query",
    "aggregation-digest",
  ];

  for (const skillName of skillOrder) {
    const skill = skills.get(skillName);
    if (skill) {
      sections.push(`### ${skill.metadata.name}\n${skill.content}`);
    }
  }

  return sections.join("\n\n");
}

/**
 * Build the ReAct system prompt with schema and all skills.
 */
async function buildReActSystemPrompt(): Promise<string> {
  const skills = await getSkills();
  const schemaSkill = skills.get("database-schema");
  const schemaContext = schemaSkill?.content ?? "";
  const skillReferences = buildSkillReferences(skills);

  return `You are a search agent with access to a screen activity database. Your job is to find information about the user's screen activity by choosing the RIGHT search strategy.

## Database Schema
${schemaContext}

## Query Patterns & Skills
${skillReferences}

## CRITICAL: Choosing the Right Action

### ACTION SELECTION DECISION TREE

1. **Is the query about FUZZY CONCEPTS?** (coding session, learning, debugging, deep work, browsing)
   → Use **semantic** or **hybrid** FIRST, not SQL!

2. **Is the query about EXACT KEYWORDS?** (error messages, specific file names, exact phrases)
   → Use **sql** with FTS MATCH

3. **Is the query STRUCTURAL/AGGREGATE?** (count apps, most used, grouped by)
   → Use **sql** with GROUP BY

4. **Is the query TIME-BASED with specific times?** (at 3pm, yesterday morning)
   → Use **sql** with date filters

5. **UNSURE?**
   → Use **hybrid** as the safe default

### COMMON MISTAKES TO AVOID

❌ **WRONG**: Searching for "rust" in app_name or window_title
   - App names won't contain programming languages!
   - VS Code, IntelliJ work on ALL languages

✓ **RIGHT**: Use semantic search to find content ABOUT Rust, or search for file extensions like ".rs"

❌ **WRONG**: Searching browser_url LIKE '%search%' for search activities
   - Most search URLs don't contain the word "search"
   - Google uses /search?q=, but user might use DuckDuckGo, Bing, etc.

✓ **RIGHT**: Use semantic/hybrid to find browsing activities with search-like behavior

❌ **WRONG**: Using SQL for "what did I do during coding session"
   - "coding session" is a fuzzy concept

✓ **RIGHT**: Use semantic search for conceptual queries, then SQL to refine

${buildCompactAppAliasSection()}

## PROGRAMMING LANGUAGE DETECTION

Languages are NOT in app_name! Look for them in OCR text_content:
- **Rust**: ".rs" files, "cargo", "rustc", "fn main", "impl", "pub fn"
- **Python**: ".py" files, "import", "def ", "class ", "pip"
- **JavaScript/TypeScript**: ".js", ".ts", "npm", "const ", "function", "=>"
- **Go**: ".go" files, "go mod", "func ", "package main"

## Available Actions

### sql
Execute a SQLite query. ONLY SELECT/WITH queries allowed. Always include LIMIT (max 100).
Use for: exact keywords, time queries, aggregations, counts.
\`\`\`json
{"action": "sql", "thought": "Need exact FTS match for error message", "sql": "SELECT c.id as chunk_id, f.captured_at, f.app_name, f.window_title, c.text_content FROM chunks_fts JOIN chunks c ON chunks_fts.rowid = c.id JOIN frames f ON c.frame_id = f.id WHERE chunks_fts MATCH 'error 404' LIMIT 20"}
\`\`\`

### semantic  
Vector similarity search using embeddings. Use for: fuzzy concepts, "things related to X", learning/tutorials, conceptual queries.
\`\`\`json
{"action": "semantic", "thought": "Looking for coding activity - this is a conceptual query", "query": "programming development writing code debugging", "filters": {"app_names": ["VS Code", "Cursor", "IntelliJ IDEA", "WebStorm", "PyCharm"]}}
\`\`\`

### hybrid
Combined FTS + vector search. Use for: mixed queries, keywords + concepts, DEFAULT when unsure.
\`\`\`json
{"action": "hybrid", "thought": "User wants 'search activities' - conceptual but might have keywords", "query": "web search browsing looking up information query", "keywords": ["google", "search", "stackoverflow"]}
\`\`\`

### think
Pause to reason about results before next action.
\`\`\`json
{"action": "think", "thought": "Got empty results from SQL", "analysis": "SQL didn't work because 'rust coding' is conceptual. Need to try semantic search instead targeting code editors."}
\`\`\`

### done
Signal that you have collected enough data. DO NOT synthesize an answer - just summarize what you found.
The final LLM will use the collected chunks to generate an answer with citations.
\`\`\`json
{"action": "done", "thought": "Found sufficient data about user activities", "summary": "Collected 25 chunks: 15 from VS Code showing coding activity, 10 from Chrome showing web browsing", "confidence": "high"}
\`\`\`

## RETRY STRATEGY

If an action returns **empty results**:
1. SQL returned empty → Try **semantic** or **hybrid** with the same concept
2. Semantic returned empty → Try **sql** with broader terms or different app filters
3. Still empty → **Broaden scope**: remove time filters, try different app categories
4. After 3+ empty results → Inform user, suggest alternatives

## Time Reference
Current date: ${new Date().toISOString().split("T")[0]}
Use: date('now') for today, date('now', '-1 day') for yesterday, datetime('now', '-7 days') for last week

## Response Format
1. Output ONLY valid JSON matching an action schema
2. Include reasoning in "thought" - explain WHY you chose this action
3. ONE action per turn - you'll see real results and can adapt
4. If results are empty, SWITCH strategy in your next turn

## EXAMPLES

**Query: "what tabs did I switch during rust coding session"**
Turn 1: {"action": "semantic", "thought": "Rust coding is conceptual - need to find code editor activity with Rust-related content", "query": "rust programming cargo rustc development coding", "filters": {"app_names": ["VS Code", "Cursor", "RustRover", "IntelliJ IDEA"]}}

**Query: "show my all search activities"**  
Turn 1: {"action": "hybrid", "thought": "Search activities = browsing behavior, web searches. This is conceptual, not literal 'search' keyword", "query": "web search browsing google searching information lookup", "keywords": ["google", "stackoverflow", "github"]}

**Query: "find error messages from today"**
Turn 1: {"action": "sql", "thought": "Error messages = exact keyword search", "sql": "SELECT c.id as chunk_id, f.captured_at, f.app_name, f.window_title, c.text_content, snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched FROM chunks_fts JOIN chunks c ON chunks_fts.rowid = c.id JOIN frames f ON c.frame_id = f.id WHERE chunks_fts MATCH 'error OR exception OR failed' AND date(f.captured_at) = date('now') LIMIT 30"}`;
}

/**
 * Build the prompt for each turn, including history.
 */
function buildTurnPrompt(
  userQuery: string,
  history: ReActTurn[],
  depContext: Record<string, any>,
): string {
  let prompt = `## User Query\n${userQuery}\n\n`;

  // Dependency context
  if (depContext && Object.keys(depContext).length > 0) {
    prompt += `## Available Context From Previous Steps\n`;
    prompt += `You may reuse these results instead of searching again.\n\n`;

    for (const [stepId, result] of Object.entries(depContext)) {
      prompt += `### ${stepId}\n`;

      if (Array.isArray(result)) {
        if (result.length === 0) {
          prompt += `Result: Empty\n`;
        } else if (result.length <= 10) {
          prompt += `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`;
        } else {
          prompt += `${result.length} rows available. First 5:\n`;
          prompt += `\`\`\`json\n${JSON.stringify(result.slice(0, 5), null, 2)}\n\`\`\`\n`;
          prompt += `... (${result.length - 5} more rows)\n`;
        }
      } else {
        prompt += `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`;
      }

      prompt += `\n`;
    }

    prompt += `---\n\n`;
  }

  // On first turn, add query analysis to help guide action selection
  if (history.length === 0) {
    const analysis = analyzeQueryIntent(userQuery);
    prompt += `## Query Analysis (First Turn Guidance)\n`;
    prompt += `**Suggested Action:** ${analysis.suggestedAction}\n`;
    prompt += `**Reasoning:** ${analysis.reasoning}\n`;
    if (analysis.hints.length > 0) {
      prompt += `**Detected Patterns:**\n`;
      for (const hint of analysis.hints) {
        prompt += `- ${hint}\n`;
      }
    }
    prompt += `\n⚠️ This is a suggestion. Use your judgment, but strongly consider this guidance.\n\n`;
  }

  // Track empty results for retry guidance
  let emptyResultsCount = 0;
  let lastEmptyAction: ReActActionType | null = null;

  if (history.length > 0) {
    prompt += `## Previous Actions & Observations\n`;

    for (const turn of history) {
      prompt += `\n### Turn ${turn.turnNumber}\n`;
      prompt += `**Thought:** ${turn.action.thought}\n`;
      prompt += `**Action:** ${turn.action.action}\n`;

      if (turn.action.sql) {
        prompt += `**SQL:** \`${turn.action.sql}\`\n`;
      }
      if (turn.action.query) {
        prompt += `**Query:** "${turn.action.query}"\n`;
      }
      if (turn.action.keywords) {
        prompt += `**Keywords:** ${JSON.stringify(turn.action.keywords)}\n`;
      }
      if (turn.action.filters) {
        prompt += `**Filters:** ${JSON.stringify(turn.action.filters)}\n`;
      }
      if (turn.action.analysis) {
        prompt += `**Analysis:** ${turn.action.analysis}\n`;
      }

      prompt += `\n**Observation:**\n`;
      if (turn.observation.success) {
        const data = turn.observation.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            prompt += `⚠️ Empty result set (0 rows) - Consider changing strategy!\n`;
            emptyResultsCount++;
            lastEmptyAction = turn.action.action as ReActActionType;
          } else if (data.length <= 10) {
            prompt += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
          } else {
            // Truncate large results
            prompt += `${turn.observation.rowCount} rows returned. First 5:\n`;
            prompt += `\`\`\`json\n${JSON.stringify(data.slice(0, 5), null, 2)}\n\`\`\`\n`;
            prompt += `...(${data.length - 5} more rows)\n`;
          }
        } else if (data) {
          prompt += `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
        }
      } else {
        prompt += `❌ Error: ${turn.observation.error}\n`;
      }
    }

    prompt += `\n---\n`;

    // Add retry guidance if we have empty results
    if (emptyResultsCount > 0 && lastEmptyAction) {
      prompt += `\n## ⚠️ RETRY GUIDANCE\n`;
      prompt += `Your ${lastEmptyAction} action returned empty. You MUST try a DIFFERENT strategy:\n`;

      switch (lastEmptyAction) {
        case "sql":
          prompt += `- SQL didn't find matches → Try **semantic** or **hybrid** search instead\n`;
          prompt += `- The concept might be fuzzy (e.g., "coding session") → Use semantic search\n`;
          prompt += `- Consider broadening: remove time filters, expand app list\n`;
          break;
        case "semantic":
          prompt += `- Semantic search found nothing → Try **hybrid** with keywords OR broader **sql**\n`;
          prompt += `- Try different app categories (browsers instead of editors, or vice versa)\n`;
          prompt += `- Rephrase the query to capture related concepts\n`;
          break;
        case "hybrid":
          prompt += `- Hybrid returned empty → Try pure **semantic** with broader concept\n`;
          prompt += `- Or try **sql** with different time ranges/app filters\n`;
          prompt += `- Consider: maybe no data exists for this query\n`;
          break;
      }

      if (emptyResultsCount >= 3) {
        prompt += `\n⚠️ Multiple empty results. If no strategy works, use **done** action to signal completion with what you found (even if empty). The final LLM will inform the user.\n`;
      }
    }
  }

  prompt += `\nBased on the above, what is your next action? Output ONLY the JSON action.`;

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════

async function executeSqlAction(
  action: ReActAction,
  requestId: string,
): Promise<ReActTurn["observation"]> {
  if (!action.sql) {
    return { success: false, error: "Missing SQL in action" };
  }

  // Extract query text from SQL for display (simplified)
  const queryDisplay =
    action.sql.length > 80 ? action.sql.slice(0, 80) + "..." : action.sql;

  const result = await executeSql({ sql: action.sql });

  return {
    success: result.success,
    data: result.rows,
    rowCount: result.rowCount,
    error: result.error,
    executionTimeMs: result.executionTimeMs,
  };
}

async function executeSemanticAction(
  action: ReActAction,
  requestId: string,
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
      limit: 20,
      filters: action.filters,
    },
    {
      requestId,
      stepId: `react-semantic`,
      attemptNumber: 1,
      timeout: 30000,
    },
  );

  // Extract the actual results array - it's nested in toolResult.data.data
  const nestedData = toolResult.data as { data?: unknown[] };
  const results = Array.isArray(nestedData?.data)
    ? nestedData.data
    : Array.isArray(toolResult.data)
      ? toolResult.data
      : [];

  console.log({ results }, "Result from tool semantic");

  return {
    success: toolResult.success,
    data: results,
    rowCount: results.length,
    error:
      typeof toolResult.error === "string"
        ? toolResult.error
        : toolResult.error?.message,
    executionTimeMs: toolResult.metadata?.executionTime,
  };
}

async function executeHybridAction(
  action: ReActAction,
  requestId: string,
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
      limit: 20,
      filters: action.filters,
    },
    {
      requestId,
      stepId: `react-hybrid`,
      attemptNumber: 1,
      timeout: 30000,
    },
  );

  // Extract the actual results array - it's nested in toolResult.data.data
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
    error:
      typeof toolResult.error === "string"
        ? toolResult.error
        : toolResult.error?.message,
    executionTimeMs: toolResult.metadata?.executionTime,
  };
}

async function executeThinkAction(
  action: ReActAction,
): Promise<ReActTurn["observation"]> {
  // Think action just records the analysis - no external call
  return {
    success: true,
    data: { analysis: action.analysis },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN REACT LOOP
// ═══════════════════════════════════════════════════════════════════════════

const MAX_TURNS = 4;

/**
 * Execute a query using the ReAct loop.
 *
 * The LLM iteratively:
 * 1. Thinks about what to do
 * 2. Takes an action (sql, semantic, hybrid, think)
 * 3. Observes the result
 * 4. Repeats until it has an answer
 */
export async function executeReActLoop(
  currentPlanStep: PlanStep,
  requestId: string,
  depContext: Record<string, any>,
  authHeaders?: AuthHeaders,
): Promise<ReActResult> {
  const logger = await getLogger();
  const startTime = Date.now();
  const history: ReActTurn[] = [];

  logger.info({ query: currentPlanStep.stepGoal }, "Starting ReAct loop");

  const systemPrompt = await buildReActSystemPrompt();

  if (currentPlanStep.kind === "search" && currentPlanStep.uiSearchQueries) {
    emitStepEvent(requestId, {
      stepType: "searching",
      stepId: currentPlanStep.id,
      title: "Searching for...",
      queries: currentPlanStep.uiSearchQueries,
      status: "running",
    });
  } else if (currentPlanStep.kind === "reason" && currentPlanStep.uiReason) {
    emitStepEvent(requestId, {
      stepType: "reasoning",
      stepId: currentPlanStep.id,
      title: currentPlanStep.uiReason,
      status: "running",
    });
  } else {
    emitStepEvent(requestId, {
      stepType: "searching",
      stepId: currentPlanStep.id,
      title: 'Searching for information...',
      status: "running",
    });
  }

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const turnPrompt = buildTurnPrompt(
      currentPlanStep.stepGoal,
      history,
      depContext,
    );

    // Call LLM for next action
    const { response } = await invokeRoleLlm({
      role: "executor",
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: turnPrompt },
      ],
      requestId: requestId,
      spanName: "react.turn",
      spanAttributes: { turn_number: turn },
      authHeaders,
    });

    const content = typeof response === "string" ? response : response.content;

    // Parse the action
    let action: ReActAction;
    try {
      const parsed = await SafeJsonParser.parseContent(content);
      if (!parsed) {
        throw new Error("Failed to parse LLM response as JSON");
      }
      action = ReActActionSchema.parse(parsed);
    } catch (error) {
      logger.error({ content, error }, "Failed to parse ReAct action");

      // Try to continue with a think action
      action = {
        thought: "Parse error, attempting recovery",
        action: "think",
        analysis: `Could not parse: ${content.slice(0, 200)}`,
      };
    }

    logger.info(
      { turn, action: action.action, analysis : action.analysis, thought: action.thought },
      "ReAct action",
    );

    // Check for done action (terminal) - return turns with all collected data
    if (action.action === "done") {
      history.push({
        turnNumber: turn,
        action,
        observation: { success: true, data: { summary: action.summary } },
      });

      // Extract chunk_ids and raw data from all turns' observation data
      const chunkIds: number[] = [];
      const allRawData: ProvenanceRow[] = [];
      
      for (const t of history) {
        if (t.observation.success && Array.isArray(t.observation.data)) {
          for (const row of t.observation.data) {
            const chunkId = row?.chunk_id ?? row?.id;
            if (typeof chunkId === "number") {
              if (!chunkIds.includes(chunkId)) {
                chunkIds.push(chunkId);
              }
              // Store raw data for provenance
              allRawData.push({
                chunk_id: chunkId,
                ...row,
              });
            }
          }
        }
      }

      console.log("ChunkIDs", chunkIds);
      console.log("History Turn", history);

      // Store in provenance registry
      const registry = getProvenanceRegistry(requestId);
      const provenanceId = registry.store({
        stepId: currentPlanStep.id,
        rawData: allRawData,
        derivation: "source",
        searchType: history.find(h => h.action.action !== "think" && h.action.action !== "done")?.action.action as "sql" | "semantic" | "hybrid" | undefined,
        query: currentPlanStep.stepGoal,
      });

      // Create compressed summary
      const compressedSummary = compressStepResults({
        provenanceId,
        stepId: currentPlanStep.id,
        rawData: allRawData,
        searchType: registry.get(provenanceId)?.search_type,
        query: currentPlanStep.stepGoal,
      });

      // Fetch full results for sources panel (UI still needs this)
      const searchResults = await getSearchResultsByChunkIds(
        chunkIds,
        requestId,
      );

      emitStepEvent(requestId, {
        stepType: "searching",
        stepId: currentPlanStep.id,
        title: "Found relevant information",
        resultCount: searchResults.length,
        results: searchResults,
        status: "running",
      });

      // // Emit sources for the UI sources panel
      // emitSources(requestId, {
      //   includeImages: false,
      //   sources: searchResults.map((s) => ({
      //     chunkId: s.chunk_id,
      //     appName: s.app_name,
      //     windowTitle: s.window_name,
      //     capturedAt: s.captured_at,
      //     browserUrl: s.browser_url,
      //     textContent: s.text_content,
      //     textJson: s.text_json,
      //     imagePath : s.image_path
      //   })),
      // });

      logger.info(
        {
          turns: turn,
          confidence: action.confidence,
          chunkCount: chunkIds.length,
          provenanceId,
        },
        "ReAct loop completed - data stored in provenance registry",
      );

      return {
        success: true,
        summary: action.summary,
        confidence: action.confidence,
        turns: history,
        totalTimeMs: Date.now() - startTime,
        // New provenance fields
        provenance_id: provenanceId,
        compressed_summary: compressedSummary,
        all_chunk_ids: chunkIds,
      };
    }

    // Execute the action
    let observation: ReActTurn["observation"];

    // Let the user know what the agent is thinking
    if (turn > 1) {
      emitStepEvent(requestId, {
        stepType: "searching",
        stepId: currentPlanStep.id,
        title: "Analyzing...",
        message: action.thought,
        status: "running",
      });
    }

    switch (action.action) {
      case "sql":
        observation = await executeSqlAction(action, requestId);
        console.log({ observation }, "Observation from SQL action");
        break;

      case "semantic":
        observation = await executeSemanticAction(action, requestId);
        console.log({ observation }, "Observation from Semantic action");
        break;

      case "hybrid":
        observation = await executeHybridAction(action, requestId);
        console.log({ observation }, "Observation from Hybrid action");
        break;

      case "think":
        observation = await executeThinkAction(action);
        console.log({ observation }, "Observation from Think action");
        break;

      default:
        observation = {
          success: false,
          error: `Unknown action: ${action.action}`,
        };
    }

    // Record the turn
    history.push({
      turnNumber: turn,
      action,
      observation,
    });

    // If action failed, log but continue - LLM can adapt
    if (!observation.success) {
      logger.warn(
        { turn, error: observation.error },
        "Action failed, continuing loop",
      );
    }
  }

  // Max turns reached without done action - still return what we have
  logger.warn(
    { turns: MAX_TURNS },
    "ReAct loop hit max turns - returning available data",
  );

  // Extract chunk_ids and raw data from all turns
  const chunkIds: number[] = [];
  const allRawData: ProvenanceRow[] = [];
  
  for (const t of history) {
    if (t.observation.success && Array.isArray(t.observation.data)) {
      for (const row of t.observation.data) {
        const chunkId = row?.chunk_id ?? row?.id;
        if (typeof chunkId === "number") {
          if (!chunkIds.includes(chunkId)) {
            chunkIds.push(chunkId);
          }
          allRawData.push({
            chunk_id: chunkId,
            ...row,
          });
        }
      }
    }
  }

  // Check if any turn has results
  const hasResults = allRawData.length > 0;

  // Store in provenance registry even if max turns reached
  let provenanceId: string | undefined;
  let compressedSummary: ProvenanceSummary | undefined;
  
  if (hasResults) {
    const registry = getProvenanceRegistry(requestId);
    provenanceId = registry.store({
      stepId: currentPlanStep.id,
      rawData: allRawData,
      derivation: "source",
      query: currentPlanStep.stepGoal,
    });
    
    compressedSummary = compressStepResults({
      provenanceId,
      stepId: currentPlanStep.id,
      rawData: allRawData,
      query: currentPlanStep.stepGoal,
    });
  }

  return {
    success: hasResults,
    turns: history,
    totalTimeMs: Date.now() - startTime,
    error: hasResults
      ? undefined
      : `Max turns (${MAX_TURNS}) reached without finding data`,
    // Provenance fields
    provenance_id: provenanceId,
    compressed_summary: compressedSummary,
    all_chunk_ids: chunkIds.length > 0 ? chunkIds : undefined,
  };
}

/**
 * Format ReAct results for the final answer generator.
 * Returns each turn's summary and results for final LLM context.
 */
export function   formatReActResultsForAnswer(result: ReActResult): string {
  if (!result.success || result.turns.length === 0) {
    return JSON.stringify({
      summary: result.summary || "No data found",
      turns: [],
      error: result.error,
    });
  }

  const filteredResults = result.turns.filter(
    (t) =>
      t.observation.success &&
      Array.isArray(t.observation.data) &&
      t.observation.data.length > 0,
  );

  // Format each turn with its action thought and observation data
  const formattedTurns = filteredResults.map((turn) => ({
    summary: turn.action.summary,
    data: turn.observation.data,
  }));

  return JSON.stringify(
    {
      summary: result.summary,
      confidence: result.confidence,
      turns: formattedTurns,
    },
    null,
    2,
  );
}
