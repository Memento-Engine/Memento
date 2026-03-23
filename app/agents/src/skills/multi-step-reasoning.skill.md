---
name: multi-step-reasoning
description: Guide for multi-step queries with LLM reasoning between steps.
tools: sql_execute, semantic_search
---

# Multi-Step Reasoning

## When Single Step Suffices
- Data dependencies (CTEs handle this)
- Simple aggregations
- Time-based sequences with known anchors

## When Multi-Step Required
- LLM must interpret results before next query
- Conditional logic: "if no results, try X"
- Fuzzy concepts need resolution: "coding session" → actual times

## Pattern 1: Fuzzy Concept Resolution

"Show me what I did during coding sessions"

1. **Search**: Find VS Code/editor activity
2. **Reason**: Identify session boundaries from timestamps
3. **Search**: Get details for each session

## Pattern 2: Conditional Branching

"Find my most used app today, then show yesterday's activity"

1. **Search**: Get app usage today
2. **Reason**: Extract most used app name
3. **Search**: Query that app for yesterday

## Pattern 3: Semantic → SQL Chain

"What did I work on after learning about microservices?"

1. **Semantic**: Find microservices learning content
2. **Reason**: Extract timestamp of learning moment
3. **SQL**: Get activity after that timestamp

## Note
Every SQL step MUST include `c.id as chunk_id` for citations.

## Pattern 4: Aggregation → Detail Drill-down

**Query:** "What did I struggle with today? Give me details."

```
Step 1: SQL - Find error-related content today
  → Returns: apps, error messages, times

Step 2: REASON - Identify struggle patterns
  → Analyzes errors: "Recurring CORS error in auth module"
  → Decides what to drill into

Step 3: SQL - Get detailed context around the errors
  → Queries frames around the error timestamps

Step 4: REASON - Synthesize final answer
  → "You struggled with CORS issues in the auth module.
     You searched StackOverflow 4 times and tried 3 solutions."
```

## Execution Model

```typescript
interface StepResult {
  stepId: string;
  type: "sql" | "semantic" | "reason";
  input: any;
  output: any;
  shouldContinue: boolean;  // false if conditional branch exits early
  nextStepOverride?: string;  // for conditional branching
}
```

**Conditional detection criteria:**
1. Query returns 0 rows when data was expected
2. Query result is ambiguous (needs interpretation)
3. Next step literally depends on LLM deciding something
4. User query contains words like "if", "then", "otherwise"

## Skill Routing Logic

When planner receives a query:

```
1. Parse user intent
2. Check if single-step possible:
   - Pure FTS → fts-search skill
   - Pure semantic → semantic-search skill  
   - Pure time query → temporal-query skill
   - Pure aggregation → aggregation-digest skill
   
3. If multi-step needed:
   - Identify dependency chain
   - Mark steps requiring REASON
   - Flag conditional branches
   - Generate step sequence
```

## Step Schema for Multi-Step Plans

```typescript
interface SkillStep {
  id: string;
  type: "sql" | "semantic" | "reason";
  
  // For SQL steps
  sql?: string;
  
  // For semantic steps  
  semanticQuery?: string;
  semanticFilters?: object;
  
  // For reason steps
  reasoningPrompt?: string;
  inputVariables?: string[];  // which previous step outputs to use
  
  // Execution control
  dependsOn: string[];
  conditionalNext?: {
    condition: string;  // e.g., "result.length === 0"
    ifTrue: string;     // step id or "END"
    ifFalse: string;    // step id
  };
}
```

## Example: Complete Multi-Step Plan

**User:** "What tabs did I open during my yesterday coding session?"

```json
{
  "goal": "Find browser tabs opened during yesterday's coding session",
  "requiresMultiStep": true,
  "steps": [
    {
      "id": "find_session",
      "type": "sql",
      "sql": "SELECT MIN(c.id) as chunk_id, MIN(f.captured_at) as start, MAX(f.captured_at) as end FROM frames f LEFT JOIN chunks c ON c.frame_id = f.id WHERE f.app_name IN ('VS Code', 'Cursor') AND date(f.captured_at) = date('now', '-1 day')",
      "dependsOn": []
    },
    {
      "id": "check_session",
      "type": "reason",
      "reasoningPrompt": "Check if coding session was found. If start/end are NULL, there was no coding yesterday.",
      "inputVariables": ["find_session"],
      "dependsOn": ["find_session"],
      "conditionalNext": {
        "condition": "result[0].start === null",
        "ifTrue": "no_session_response",
        "ifFalse": "get_tabs"
      }
    },
    {
      "id": "no_session_response",
      "type": "reason",
      "reasoningPrompt": "Inform user no coding session was found yesterday",
      "inputVariables": [],
      "dependsOn": ["check_session"]
    },
    {
      "id": "get_tabs",
      "type": "sql",
      "sql": "SELECT c.id as chunk_id, window_title, browser_url, f.captured_at FROM frames f LEFT JOIN chunks c ON c.frame_id = f.id WHERE f.app_name IN ('Chrome', 'Firefox', 'Arc') AND f.captured_at BETWEEN '{find_session.start}' AND '{find_session.end}' ORDER BY f.captured_at LIMIT 30",
      "dependsOn": ["check_session"]
    },
    {
      "id": "synthesize",
      "type": "reason",
      "reasoningPrompt": "List the browser tabs opened during the coding session",
      "inputVariables": ["find_session", "get_tabs"],
      "dependsOn": ["get_tabs"]
    }
  ]
}
```

## Edge Case Detection

Before compiling to single SQL, check:

1. **Fuzzy concepts** - "session", "when I was learning", "deep work"
2. **Conditionals** - "if any", "otherwise", queries that might return empty
3. **Cross-domain reasoning** - semantic + SQL together
4. **Interpretation needed** - "most important", "key", "main"

If any detected → flag as multi-step, don't attempt single SQL.
