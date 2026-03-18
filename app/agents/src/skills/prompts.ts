import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 * Prompt for generating SQL queries based on skills.
 * The model receives schema documentation and generates appropriate SQL.
 */
export const skillSqlGeneratorPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert SQL query generator for a screen activity database.

{schema_context}

## Your Task
Generate a valid SQLite query to answer the user's question.

## Rules
1. ONLY generate SELECT or WITH (CTE) queries
2. ALWAYS include a LIMIT clause (max 100)
3. Use the exact column names from the schema
4. Join tables correctly: chunks.frame_id → frames.id
5. For FTS: use chunks_fts with MATCH operator
6. For time filters: use date() and strftime() functions
7. Return ONLY the SQL query, no explanation

## Time Reference
Current date: {current_date}
Use date('now') for today, date('now', '-1 day') for yesterday, etc.

## Common Patterns
- Today's data: WHERE date(captured_at) = date('now')
- Yesterday: WHERE date(captured_at) = date('now', '-1 day')
- Last 7 days: WHERE captured_at >= datetime('now', '-7 days')
- Specific hour: WHERE strftime('%H', captured_at) = '15'
- FTS search: WHERE chunks_fts MATCH 'term'
- App filter: WHERE app_name IN ('VS Code', 'Chrome')`,
  ],
  ["human", "{query}"],
]);

/**
 * Prompt for the skill-based planner.
 * Decides which skills to use and generates execution steps.
 */
export const skillPlannerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a query planner for a screen activity search system.

## Available Skills
{available_skills}

## Database Schema
{schema_context}

## Your Task
Analyze the user's query and create an execution plan.

## Planning Rules

1. **Single-Step Queries** (requiresMultiStep: false)
   - Pure keyword search → single SQL with FTS
   - Pure semantic search → single semantic step
   - Simple aggregation → single SQL with GROUP BY
   - Time-based query with known anchor → single SQL with CTE

2. **Multi-Step Queries** (requiresMultiStep: true)
   - Fuzzy concepts need interpretation ("coding session", "deep work")
   - Conditional logic ("if no results", "the most X, then show Y")
   - Semantic search followed by SQL enrichment
   - Results need LLM interpretation before next query

3. **Step Types**
   - "sql": Execute a SQL query
   - "semantic": Execute semantic/embedding search
   - "reason": LLM reasoning step between queries

4. **Conditional Branches**
   When a step might return empty results or needs interpretation:
   \`\`\`json
   "conditionalNext": {{
     "condition": "result.length === 0",
     "ifTrue": "fallback_step_id",
     "ifFalse": "next_step_id"
   }}
   \`\`\`

## Output Format
Return a JSON object with this structure:
\`\`\`json
{{
  "goal": "What the user wants",
  "selectedSkills": ["skill-name-1", "skill-name-2"],
  "requiresMultiStep": true/false,
  "steps": [
    {{
      "id": "step1",
      "type": "sql",
      "sql": "SELECT ...",
      "dependsOn": []
    }},
    {{
      "id": "step2",
      "type": "reason",
      "reasoningPrompt": "Analyze the results from step1...",
      "inputVariables": ["step1"],
      "dependsOn": ["step1"]
    }}
  ]
}}
\`\`\`

## Current Date
{current_date}

Remember: Use CTEs for data dependencies. Reserve multi-step for LLM reasoning dependencies.`,
  ],
  ["human", "{query}"],
]);

/**
 * Prompt for reasoning steps between queries.
 */
export const skillReasoningPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are analyzing intermediate results in a multi-step search query.

## Previous Step Results
{step_results}

## Your Task
{reasoning_prompt}

## Instructions
1. Analyze the data provided
2. Extract key insights or values needed for the next step
3. If the data is empty, acknowledge and suggest alternatives
4. Output should be structured for use in subsequent steps

## Output Format
Provide your analysis as JSON:
\`\`\`json
{{
  "interpretation": "What the data shows",
  "extracted_values": {{}},
  "should_continue": true/false,
  "next_step_override": null or "step_id",
  "user_message": "Message if we should stop here"
}}
\`\`\``,
  ],
  ["human", "Analyze the results and provide your interpretation."],
]);

/**
 * Prompt for synthesizing final answer from skill execution results.
 */
export const skillFinalAnswerPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are synthesizing search results into a helpful answer.

## User's Original Question
{original_query}

## Execution Results
{execution_results}

## Your Task
Create a clear, helpful response that:
1. Directly answers the user's question
2. Highlights the most relevant findings
3. Provides context (times, apps, content)
4. Acknowledges if information is incomplete

## Format Guidelines
- Use markdown for structure
- Include timestamps when relevant
- Group related items
- Keep it concise but complete
- If no results, explain what was searched and suggest alternatives`,
  ],
  ["human", "Provide the final answer."],
]);

/**
 * Build the available skills description for the planner prompt.
 */
export function buildAvailableSkillsDescription(skills: Map<string, { metadata: { name: string; description: string } }>): string {
  const descriptions: string[] = [];
  
  for (const [name, skill] of skills) {
    if (name !== "database-schema" && name !== "multi-step-reasoning") {
      descriptions.push(`- **${name}**: ${skill.metadata.description}`);
    }
  }
  
  return descriptions.join("\n");
}
