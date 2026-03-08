# Replanning Mechanism Implementation

## Overview

A comprehensive replanning mechanism has been implemented to allow the agent to recover from failed execution steps. When a step returns empty results or fails, the system automatically triggers a replanning process to revise the execution plan and recover from the failure.

## Architecture

### 1. **State Extensions** (`agentState.ts`)

Added new fields to track replanning state:

```typescript
// Replanning phase
replanAttempts: Annotation<number>(),           // Number of replan attempts made
lastFailedStepId: Annotation<string | undefined>(), // ID of the step that failed
failureReason: Annotation<string | undefined>(),    // Description of why it failed
previousPlan: Annotation<PlannerPlan | undefined>(),// Previous plan before replanning
shouldReplan: Annotation<boolean>(),                 // Flag to trigger replanning
```

### 2. **Failure Detection in Executor** (`executor/executor.node.ts`)

The executor has been enhanced to detect three types of failures:

#### Empty Results Detection
- **Search steps**: When a search returns no results (empty array)
- **Non-search steps**: When compute/reason/tool steps return empty objects, empty strings, or null values

#### Dependent Step Analysis
- Before triggering replanning, the system checks if the failed step has dependent steps
- If a step has dependents that depend on its output, replanning is triggered
- If a step fails but has no dependents (e.g., final step), execution continues with the empty result

#### Error Recovery
- Step execution errors can trigger replanning (up to max attempts)
- The system checks if maximum replan attempts have been reached
- If max attempts reached, throws error instead of replanning

#### Helper Functions

```typescript
isEmptyResult(result)        // Checks if result is empty/null/undefined
hasDependentSteps(plan, id)  // Checks if step has dependents
shouldTriggerReplan(state)   // Verifies we haven't exceeded max replan attempts
```

### 3. **Replanner Node** (`planner/replanner.node.ts`)

New dedicated node that handles the replanning logic:

**Inputs from failed execution:**
- Original user goal
- Current (failed) plan
- Failed step details
- Execution result from the failed step
- Reason for failure

**Process:**
1. Validates we haven't exceeded max replan attempts (default: 3)
2. Finds the failed step in the plan
3. Invokes LLM with replan prompt to revise the plan
4. Validates the revised plan structure
5. Returns updated state with new plan

**Key Features:**
- Minimal revisions: Only changes the failing step and dependent steps
- Preserves previous steps unchanged
- Resolves failed step index in revised plan for proper execution resume
- Includes retry logic with exponential backoff for replan generation

### 4. **Replan Prompt** (`prompts/replanPrompt.ts`)

Specialized prompt that guides the LLM through replanning:

**Replanning Strategies Provided:**
1. **Broaden the Query** - If query was too specific
   - Remove overly specific filters
   - Expand keywords
   - Widen time ranges

2. **Refine the Query** - If query was too vague
   - Add context to semantic query
   - Include missing keywords
   - Add appropriate filters

3. **Modify Filters** - If filters blocked results
   - Remove restrictive filters
   - Broaden text_search
   - Expand time ranges

4. **Change Search Scope** - Adjust search parameters
   - Increase limit parameter
   - Change sort order
   - Modify sort field

5. **Add Intermediate Steps** - Break complex queries
   - Extract intermediate values
   - Build context gradually

6. **Change Keywords** - Better query terms
   - Replace failed keywords
   - Use broader terms
   - Add related terms

### 5. **Workflow Graph Updates** (`agent.ts`)

Updated the graph to include conditional routing:

```
START
  ↓
PLANNER (creates initial plan)
  ↓
EXECUTOR (executes steps)
  ├─→ If shouldReplan = true → REPLANNER → back to EXECUTOR (loop)
  └─→ If shouldReplan = false → FINAL ANSWER → END
```

**Conditional Edge Logic:**
- After executor completes, `shouldReplanRoute()` evaluates `state.shouldReplan`
- If true, routes to replanner node
- If false, routes to finalAnswer node
- Replanner loops back to executor for retry execution

### 6. **Configuration** (`config/config.ts`)

Added new configuration parameter:

```typescript
maxReplanAttempts: z.number().int().min(1).default(3)
```

Environment variable: `MAX_REPLAN_ATTEMPTS` (default: 3)

This limits the number of times the system will attempt to replan and prevents infinite loops.

## Execution Flow Example

### Scenario: Search Query Fails

1. **Initial Plan Creation**
   ```
   - Step 1: Search for "GitHub activity"
   - Step 2: Extract commit timestamps
   - Step 3: Summarize findings
   ```

2. **First Execution Attempt**
   - Step 1 executes → Returns empty array (no results)
   - Step 1 has dependents (Step 2 depends on it)
   - Triggers replanning signal (`shouldReplan = true`)

3. **Replanning Phase**
   - Replanner invokes LLM with:
     - Original goal: "Find GitHub activity"
     - Failed step: "Search for GitHub activity"
     - Result: Empty array
     - Reason: "Search returned empty results"
   
4. **Revised Plan Examples**
   
   **Option A: Broaden the Query**
   ```
   - Step 1: Search for "GitHub" (removed "activity" keyword)
             OR remove browser_url_contains filter
   - Step 2: Extract commit timestamps
   - Step 3: Summarize findings
   ```
   
   **Option B: Add Intermediate Steps**
   ```
   - Step 1: Search for recent browser activity
   - Step 2: Extract URLs to identify GitHub sessions
   - Step 3: Search specifically for GitHub activity in that timeframe
   - Step 4: Extract timestamps
   - Step 5: Summarize findings
   ```

5. **Second Execution Attempt**
   - Executes revised plan starting from failed step
   - If Step 1 succeeds now, continues with Step 2, 3, etc.
   - If Step 1 still fails, attempts another replan (up to max)

6. **Final Answer**
   - After successful plan execution OR max replan attempts reached
   - Routes to finalAnswer node to generate response

## Safety Mechanisms

### 1. **Max Replan Attempts**
- Default maximum: 3 attempts
- Prevents infinite loops
- After max reached, proceeds with best available results

### 2. **Dependency Analysis**
- Only triggers replanning for steps with dependents
- Non-critical final steps continue even with empty results
- Prevents unnecessary replanning

### 3. **Plan Validation**
- Each revised plan is validated against schema
- Retries with exponential backoff if validation fails
- Falls back to error if plan validation fails after retries

### 4. **State Tracking**
- Tracks number of replan attempts
- Stores failed step ID and failure reason
- Preserves previous plan for context
- Maintains complete execution history

## Configuration Examples

### Default Configuration
```
MAX_REPLAN_ATTEMPTS=3    # Maximum retry attempts
MAX_PLAN_RETRIES=3       # Retries for LLM plan generation
```

### Conservative Configuration
```
MAX_REPLAN_ATTEMPTS=1    # Only replan once
```

### Aggressive Configuration
```
MAX_REPLAN_ATTEMPTS=5    # More recovery attempts
```

## Integration Points

### 1. **Executor Node Changes**
- Added failure detection logic
- Returns early with replan signal instead of throwing
- Maintains step results and errors throughout process

### 2. **New Replanner Node**
- Completely separate from basic planner
- Receives rich context about failure
- Outputs revised plan with same structure

### 3. **Workflow Graph Routing**
- Conditional edge based on `shouldReplan` flag
- Replanner loops back to executor
- Maintains execution flow through replanning cycles

### 4. **Configuration Extension**
- Single new config parameter
- Backward compatible (default value provided)
- Configurable via environment variable

## Error Handling

### When Replanning Cannot Help
1. **Max attempts reached**: Proceeds with best available results
2. **Validation failures**: Throws error if revised plan invalid
3. **Missing dependencies**: Maintains error tracking for diagnosis
4. **Network/Tool errors**: Can trigger replanning or propagate based on type

### Error Classification
- **Recoverable**: Empty results, specific filter issues → Replan
- **Non-recoverable**: Invalid dependencies, configuration errors → Throw
- **Terminal**: Max replan attempts exhausted → Use best results

## Testing Recommendations

1. **Happy Path**: Plan succeeds on first execution
   - Verify `shouldReplan = false` after executor
   - Routes directly to finalAnswer

2. **Replan Once**: Plan fails once, succeeds after replanning
   - Trigger empty result on first step
   - Verify replanner invokes and revises plan
   - Verify second execution succeeds

3. **Multiple Replans**: Plan fails multiple times
   - Mock sequential failures
   - Verify replan attempts increment
   - Verify stops at max attempts

4. **Max Attempts Exceeded**: Plan fails beyond max retries
   - Force failures beyond limit
   - Verify error handling or fallback behavior

5. **Edge Cases**:
   - Non-critical step with empty result
   - Step without dependents fails
   - Replanner generates invalid plan
   - Missing failed step in revised plan

## Key Behaviors

### When Replanning Happens
✓ Search step returns empty results (has dependents)
✓ Non-search step returns empty result (has dependents)
✓ Step throws execution error (max attempts not reached)

### When Replanning Does NOT Happen
✗ Final/non-critical step returns empty result (no dependents)
✗ Max replan attempts already reached
✗ Fundamental configuration/validation errors

### What Gets Preserved
- All completed steps before the failure
- Step results and execution history
- Request context and goal
- Original plan (stored as previousPlan)

### What Gets Modified
- The failing step and its query
- Dependent steps that directly depend on it
- Plan structure unchanged unless necessary
- Resume execution from failed step index

## Performance Impact

- **Initial planning**: Unchanged
- **Normal execution**: Unchanged
- **Failure recovery**: One extra LLM call per replan (bounded by max attempts)
- **Total latency**: Up to 3x longer if maximum replans needed, otherwise minimal impact

## Future Enhancements

1. **Intelligent Failure Analysis**: Analyze failure patterns to suggest specific strategies
2. **Adaptive Limits**: Adjust max replan attempts based on query complexity
3. **Strategy Selection**: Let replanner choose best strategy from alternatives
4. **Failure Caching**: Cache failures to avoid same mistakes
5. **Parallel Replanning**: Try multiple replan strategies simultaneously
