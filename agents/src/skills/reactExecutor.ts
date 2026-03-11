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
// PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build skill reference sections for the prompt.
 */
function buildSkillReferences(skills: Map<string, { metadata: { name: string }; content: string }>): string {
  const sections: string[] = [];
  
  // Include these skills in order
  const skillOrder = [
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
  
  return `You are a search agent with access to a screen activity database.

## Database Schema
${schemaContext}

## Query Patterns & Skills
${skillReferences}

## Available Actions

### sql
Execute a SQLite query. ONLY SELECT/WITH queries allowed. Always include LIMIT (max 100).
\`\`\`json
{"action": "sql", "thought": "...", "sql": "SELECT ..."}
\`\`\`

### semantic  
Vector similarity search using embeddings. Good for fuzzy/conceptual queries.
\`\`\`json
{"action": "semantic", "thought": "...", "query": "natural language description", "filters": {"app_names": ["Chrome"]}}
\`\`\`

### hybrid
Combined FTS + vector search with RRF scoring. Best for queries with specific keywords AND concepts.
\`\`\`json
{"action": "hybrid", "thought": "...", "query": "concept description", "keywords": ["exact", "terms"]}
\`\`\`

### think
Pause to reason about results before next action. Use when you need to interpret data.
\`\`\`json
{"action": "think", "thought": "...", "analysis": "What I learned: ..."}
\`\`\`

### answer
Provide final answer to the user. Use when you have enough information.
\`\`\`json
{"action": "answer", "thought": "...", "answer": "The user's answer...", "confidence": "high"}
\`\`\`

## Time Reference
Current date: ${new Date().toISOString().split("T")[0]}

## How to Respond
1. Output ONLY valid JSON matching the action schema
2. Include your reasoning in "thought"
3. Execute ONE action at a time - you'll see the result and can do more
4. When confident you have the answer, use "answer" action

## Important
- You see REAL results after each action, so use actual values (not placeholders)
- If a query returns empty, you can try a different approach
- For multi-part questions, gather data iteratively
- Prefer SQL + CTEs for complex joins over multiple queries`;
}

/**
 * Build the prompt for each turn, including history.
 */
function buildTurnPrompt(
  userQuery: string,
  history: ReActTurn[]
): string {
  let prompt = `## User Query\n${userQuery}\n\n`;
  
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
      if (turn.action.analysis) {
        prompt += `**Analysis:** ${turn.action.analysis}\n`;
      }
      
      prompt += `\n**Observation:**\n`;
      if (turn.observation.success) {
        const data = turn.observation.data;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            prompt += `Empty result set (0 rows)\n`;
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
        prompt += `Error: ${turn.observation.error}\n`;
      }
    }
    
    prompt += `\n---\n`;
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
  
  return {
    success: toolResult.success,
    data: toolResult.data,
    rowCount: Array.isArray(toolResult.data) ? toolResult.data.length : undefined,
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
  
  return {
    success: toolResult.success,
    data: toolResult.data,
    rowCount: Array.isArray(toolResult.data) ? toolResult.data.length : undefined,
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

const MAX_TURNS = 10;

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
