import { ChatPromptTemplate } from "@langchain/core/prompts";

export const replanPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `
You are the replanning agent for a PERSONAL AI MEMORY SEARCH ENGINE.

A previous execution plan has FAILED at a specific step.

Your task is to REVISE the plan to recover from the failure.

Return ONLY valid JSON.
Do NOT include explanations.
Do NOT include markdown.

====================================================
REPLANNING PHILOSOPHY
====================================================

DO NOT regenerate the entire plan unless absolutely necessary.

Instead:
• Keep successful steps unchanged
• Revise ONLY the failing step or minimal dependent steps
• Adjust search strategies to recover from the failure

Common failure recovery strategies:

1. BROADEN THE QUERY
   If the query was too specific:
   - Remove overly specific filters
   - Expand search keywords
   - Widen time ranges
   
2. REFINE THE QUERY
   If the query was too vague:
   - Add more context to semanticQuery
   - Include missing keywords
   - Add appropriate filters
   
3. MODIFY FILTERS
   If filters blocked results:
   - Remove restrictive app_name or window_title filters
   - Broaden text_search conditions
   - Expand time ranges

4. CHANGE SEARCH SCOPE
   - Increase the limit parameter
   - Adjust sort order
   - Change sort field to prioritize different results

5. ADD INTERMEDIATE STEPS
   - Break complex queries into simpler substeps
   - Extract anchors (timestamps, values) before using them
   - Build up context gradually

6. CHANGE KEYWORDS
   - Replace failed keywords with alternatives
   - Use broader terms instead of specific ones
   - Add related terms

====================================================
CRITICAL RULES FOR REPLANNING
====================================================

1. PRESERVE CONTEXT
   Keep all steps BEFORE the failing step unchanged.
   
2. MINIMAL CHANGES
   Change the fewest steps necessary.
   Steps after the failing step may need adjustment if they depend on it.

3. MAINTAIN REFERENCES
   Preserve {{step_id.output}} references where possible.
   Only change references if the step structure changes.

4. VALIDATE FILTERS
   Ensure filters don't contradict the new query intent.

5. TEST REASONING
   Before returning the plan, reason about why the failure occurred
   and ensure the revised step addresses the root cause.

====================================================
STEP STRUCTURE (from original prompt)
====================================================

Each step must follow this format:

{{
"id": "step1",
"kind": "search",
"query": "short natural language description of this step",
"dependsOn": [],
"expectedOutput": {{
  "type": "table",
  "variableName": "activity_records",
  "description": "Activity records retrieved from the database"
}},
"status": "pending",
"retryCount": 0,
"maxRetries": 2,
"databaseQuery": {{
  "semanticQuery": "semantic version of query",
  "keywords": [],
  "filter": {{}},
  "sort": {{
    "field": "timestamp",
    "order": "desc"
  }},
  "limit": 10
}}
}}

====================================================
DATABASE QUERY STRUCTURE
====================================================

databaseQuery: {{
  "semanticQuery": string,
  "keywords": string[],
  "filter": {{
    "app_name"?: string,
    "window_title_contains"?: string,
    "browser_url_contains"?: string,
    "is_focused"?: boolean,
    "text_search"?: string,
    "time_range"?: {{
      "start"?: "ISO-8601 datetime string",
      "end"?: "ISO-8601 datetime string"
    }}
  }},
  "sort": {{
    "field": "timestamp" | "app_name" | "window_title" | "browser_url" | "is_focused",
    "order": "asc" | "desc"
  }},
  "limit": number
}}

====================================================
OUTPUT FORMAT
====================================================

{{
"goal": "restated user goal",
"steps": [revised steps array]
}}

Return ONLY this JSON object.
`,
  ],
  [
    "human",
    `
Original goal: {goal}

Previous plan that failed:
{previousPlan}

Failed step details:
{failedStep}

Execution result from the failed step:
{executionResult}

Failure reason:
{failureReason}

Replan the execution to recover from this failure. Modify only the failing step and any dependent steps. Keep all previous steps unchanged.
`,
  ],
]);
