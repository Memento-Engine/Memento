import { AgentStateType } from "../agentState";
import { executeSql, formatResultsAsJson } from "./sqlExecutor";
import { getToolRegistry } from "../tools/registry";
import { getLogger } from "../utils/logger";
import { getConfig } from "../config/config";
import { invokeRoleLlm } from "../llm/routing";
import { getSkills, buildSkillContext } from "./loader";
import { SafeJsonParser } from "../utils/parser";
import { runWithSpan } from "../telemetry/tracing";
import { emitStepEvent } from "../utils/eventQueue";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Action types the LLM can take in the ReAct loop.
 */
export type ReActActionType = "sql" | "semantic" | "hybrid" | "think" | "answer";

/**
 * Schema for LLM action output.
 */
export const ReActActionSchema = z.object({
  thought: z.string().describe("Reasoning about current state and what to do next"),
  action: z.enum(["sql", "semantic", "hybrid", "think", "answer"]),
  
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
  
  // For think action - intermediate reasoning
  analysis: z.string().optional(),
  
  // For answer action - final response
  answer: z.string().optional(),
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
 */
export interface ReActResult {
  success: boolean;
  answer?: string;
  confidence?: "high" | "medium" | "low";
  turns: ReActTurn[];
  totalTimeMs: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fuzzy concept indicators that suggest semantic search.
 */
const FUZZY_CONCEPTS = [
  "session", "coding", "programming", "work", "working", "learning", "learned",
  "studying", "reading", "browsing", "searching", "debugging", "deep work",
  "focused", "productive", "meeting", "call", "conversation", "discussion",
  "tutorial", "guide", "documentation", "research", "exploring", "watching",
  "activity", "activities", "doing", "did", "stuff", "things"
];

/**
 * Exact keyword indicators that suggest SQL/FTS search.
 */
const EXACT_INDICATORS = [
  "error", "exception", "failed", "404", "500", "crash", "bug",
  "line", "file", "function", "variable", "import", "export",
  "exact", "specific", "precisely", "literally"
];

/**
 * Aggregate/structural indicators that suggest SQL.
 */
const AGGREGATE_INDICATORS = [
  "count", "how many", "total", "sum", "average", "most", "least",
  "grouped", "per app", "per day", "breakdown", "statistics"
];

/**
 * Time-specific indicators that suggest SQL.
 */
const TIME_INDICATORS = [
  "at \\d", "\\d:\\d\\d", "\\d pm", "\\d am", "yesterday", "today", "this morning",
  "this afternoon", "last week", "last hour", "\\d minutes ago"
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
  const hasFuzzyConcept = FUZZY_CONCEPTS.some(concept => q.includes(concept));
  if (hasFuzzyConcept) {
    hints.push("Query contains fuzzy concepts (coding, learning, etc.)");
  }
  
  // Check for exact keywords
  const hasExactIndicator = EXACT_INDICATORS.some(ind => q.includes(ind));
  if (hasExactIndicator) {
    hints.push("Query contains exact keyword indicators (error, file, etc.)");
  }
  
  // Check for aggregates
  const hasAggregateIndicator = AGGREGATE_INDICATORS.some(ind => q.includes(ind));
  if (hasAggregateIndicator) {
    hints.push("Query requests aggregation or counting");
  }
  
  // Check for time specifics
  const hasTimeIndicator = TIME_INDICATORS.some(ind => new RegExp(ind, "i").test(query));
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
function buildSkillReferences(skills: Map<string, { metadata: { name: string }; content: string }>): string {
  const sections: string[] = [];
  
  // Include these skills in order - skill-selection comes first with critical guidance
  const skillOrder = [
    "skill-selection",  // Critical: Action selection guidance
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

## APP NAME MAPPINGS (Memorize This!)

**CODE EDITORS** (for "coding", "programming", "development", "writing code"):
VS Code, Visual Studio Code, Code, Cursor, Zed, IntelliJ IDEA, WebStorm, PyCharm, GoLand, RustRover, Sublime Text, Atom, Neovim, Vim, Android Studio, Xcode

**BROWSERS** (for "browsing", "searching", "reading", "learning online"):
Chrome, Google Chrome, Firefox, Mozilla Firefox, Arc, Safari, Edge, Microsoft Edge, Brave, Opera, Vivaldi

**TERMINALS** (for "terminal", "command line", "shell", "running commands"):
Terminal, iTerm, iTerm2, Warp, Alacritty, Kitty, PowerShell, cmd, Command Prompt, Windows Terminal

**COMMUNICATION** (for "meetings", "chat", "talking", "discussing"):
Slack, Discord, Microsoft Teams, Teams, Zoom

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

### answer
Provide final answer when you have enough information.
\`\`\`json
{"action": "answer", "thought": "Found relevant data", "answer": "Based on your screen activity...", "confidence": "high"}
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
  history: ReActTurn[]
): string {
  let prompt = `## User Query\n${userQuery}\n\n`;
  
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
        prompt += `\n⚠️ Multiple empty results. If no strategy works, use **answer** action to inform the user that no matching activity was found and suggest alternatives.\n`;
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
  state: AgentStateType
): Promise<ReActTurn["observation"]> {
  if (!action.sql) {
    return { success: false, error: "Missing SQL in action" };
  }
  
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
  state: AgentStateType
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
      requestId: state.requestId,
      stepId: `react-semantic`,
      attemptNumber: 1,
      timeout: 30000,
    }
  );
  
  // Extract the actual results array - it's nested in toolResult.data.data
  const nestedData = toolResult.data as { data?: unknown[] };
  const results = Array.isArray(nestedData?.data) ? nestedData.data : 
                  Array.isArray(toolResult.data) ? toolResult.data : [];
  
  return {
    success: toolResult.success,
    data: results,
    rowCount: results.length,
    error: typeof toolResult.error === "string" ? toolResult.error : toolResult.error?.message,
    executionTimeMs: toolResult.metadata?.executionTime,
  };
}

async function executeHybridAction(
  action: ReActAction,
  state: AgentStateType
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
      requestId: state.requestId,
      stepId: `react-hybrid`,
      attemptNumber: 1,
      timeout: 30000,
    }
  );
  
  // Extract the actual results array - it's nested in toolResult.data.data
  const nestedData = toolResult.data as { data?: unknown[] };
  const results = Array.isArray(nestedData?.data) ? nestedData.data : 
                  Array.isArray(toolResult.data) ? toolResult.data : [];
  
  return {
    success: toolResult.success,
    data: results,
    rowCount: results.length,
    error: typeof toolResult.error === "string" ? toolResult.error : toolResult.error?.message,
    executionTimeMs: toolResult.metadata?.executionTime,
  };
}

async function executeThinkAction(
  action: ReActAction
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
  userQuery: string,
  state: AgentStateType
): Promise<ReActResult> {
  const logger = await getLogger();
  const startTime = Date.now();
  const history: ReActTurn[] = [];
  
  logger.info({ query: userQuery }, "Starting ReAct loop");
  
  const systemPrompt = await buildReActSystemPrompt();
  
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const turnPrompt = buildTurnPrompt(userQuery, history);
    
    emitStepEvent(
      `react-turn-${turn}`,
      "reasoning",
      `Turn ${turn}: Deciding next action`,
      "running",
      state.requestId
    );
    
    // Call LLM for next action
    const { response } = await invokeRoleLlm({
      role: "executor",
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: turnPrompt },
      ],
      requestId: state.requestId,
      spanName: "react.turn",
      spanAttributes: { turn_number: turn },
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
    
    logger.info({ turn, action: action.action, thought: action.thought?.slice(0, 100) }, "ReAct action");
    
    // Check for answer action (terminal)
    if (action.action === "answer") {
      emitStepEvent(
        `react-turn-${turn}`,
        "reasoning",
        "Generating answer",
        "completed",
        state.requestId
      );
      
      history.push({
        turnNumber: turn,
        action,
        observation: { success: true, data: { answer: action.answer } },
      });
      
      logger.info({ turns: turn, confidence: action.confidence }, "ReAct loop completed with answer");
      
      return {
        success: true,
        answer: action.answer,
        confidence: action.confidence,
        turns: history,
        totalTimeMs: Date.now() - startTime,
      };
    }
    
    // Execute the action
    let observation: ReActTurn["observation"];
    
    switch (action.action) {
      case "sql":
        emitStepEvent(
          `react-turn-${turn}`,
          "searching",
          `Executing SQL query`,
          "running",
          state.requestId
        );
        observation = await executeSqlAction(action, state);
        break;
        
      case "semantic":
        emitStepEvent(
          `react-turn-${turn}`,
          "searching",
          `Running semantic search`,
          "running",
          state.requestId
        );
        observation = await executeSemanticAction(action, state);
        break;
        
      case "hybrid":
        emitStepEvent(
          `react-turn-${turn}`,
          "searching",
          `Running hybrid search`,
          "running",
          state.requestId
        );
        observation = await executeHybridAction(action, state);
        break;
        
      case "think":
        observation = await executeThinkAction(action);
        break;
        
      default:
        observation = { success: false, error: `Unknown action: ${action.action}` };
    }
    
    // Record the turn
    history.push({
      turnNumber: turn,
      action,
      observation,
    });
    
    emitStepEvent(
      `react-turn-${turn}`,
      action.action === "think" ? "reasoning" : "searching",
      `Turn ${turn} complete`,
      observation.success ? "completed" : "failed",
      state.requestId,
      { resultCount: observation.rowCount }
    );
    
    // If action failed, log but continue - LLM can adapt
    if (!observation.success) {
      logger.warn({ turn, error: observation.error }, "Action failed, continuing loop");
    }
  }
  
  // Max turns reached without answer
  logger.warn({ turns: MAX_TURNS }, "ReAct loop hit max turns without answer");
  
  return {
    success: false,
    turns: history,
    totalTimeMs: Date.now() - startTime,
    error: `Max turns (${MAX_TURNS}) reached without final answer`,
  };
}

/**
 * Format ReAct results for the final answer generator.
 */
export function formatReActResultsForAnswer(result: ReActResult): string {
  if (result.answer) {
    return result.answer;
  }
  
  // Build a summary of what was found
  const searches = result.turns.filter(t => 
    t.action.action === "sql" || 
    t.action.action === "semantic" || 
    t.action.action === "hybrid"
  );
  
  if (searches.length === 0) {
    return "No search results available.";
  }
  
  const lastSearch = searches[searches.length - 1];
  if (lastSearch.observation.success && lastSearch.observation.data) {
    return JSON.stringify(lastSearch.observation.data, null, 2);
  }
  
  return "Search completed but no clear results.";
}
