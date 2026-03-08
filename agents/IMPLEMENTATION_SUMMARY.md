# Replanning Implementation Summary

## Files Modified

### 1. **Core State Management**
- **`src/agentState.ts`** - Added replanning state fields
  - `replanAttempts`: Tracks number of replan cycles
  - `lastFailedStepId`: Identifies which step failed
  - `failureReason`: Documents why the step failed
  - `previousPlan`: Stores plan before replanning
  - `shouldReplan`: Flag to trigger replanning

### 2. **Executor Logic**
- **`src/executor/executor.node.ts`** - Enhanced failure detection
  - `isEmptyResult()`: Identifies empty/null/invalid results
  - `hasDependentSteps()`: Checks if step has downstream dependencies
  - `shouldTriggerReplan()`: Validates max attempts not exceeded
  - Modified main loop to detect failures and return replan signals
  - Preserves step results during replanning cycles

### 3. **Replanning Node**
- **`src/planner/replanner.node.ts`** - NEW FILE
  - Handles failure analysis and plan revision
  - Invokes LLM with replan prompt and context
  - Validates revised plans
  - Resumes execution from correct step index
  - Respects max replan attempt limits

### 4. **Prompts**
- **`src/prompts/replanPrompt.ts`** - NEW FILE
  - Specialized prompt for LLM-guided plan revision
  - Provides clear failure strategies:
    - Broaden queries (remove filters, expand keywords)
    - Refine queries (add context, include keywords)
    - Modify filters (remove restrictions, expand scope)
    - Change search parameters (increase limits, adjust sorting)
    - Add intermediate steps (break complex queries)
    - Alternative keywords

### 5. **Workflow Graph**
- **`src/agent.ts`** - Added conditional routing
  - Imported `replannerNode`
  - Added `shouldReplanRoute()` function
  - Added replanner node to graph
  - Added conditional edge from executor:
    - If `shouldReplan = true` → replanner → executor (loop)
    - If `shouldReplan = false` → finalAnswer → END

### 6. **Configuration**
- **`src/config/config.ts`** - Added replanning configuration
  - `maxReplanAttempts`: Default 3 (configurable via environment)
  - Prevents infinite loops
  - Respects safety limits

## Key Design Decisions

### 1. **Minimal Plan Revision**
- Only failing step and direct dependents are modified
- Previous successful steps are preserved
- Reduces LLM complexity and cost

### 2. **Dependency-Aware Triggering**
- Only replans when failed step affects downstream steps
- Final/terminal steps with empty results don't trigger replan
- Efficient use of replanning budget

### 3. **Bounded Attempts**
- Maximum 3 replan attempts (default, configurable)
- After limit, proceeds with best available results
- Prevents infinite loops and excessive latency

### 4. **Rich Failure Context**
- Passes original goal, previous plan, failed step, and result to replanner
- Enables LLM to make informed decisions about revision strategy
- Better recovery from specific failure patterns

### 5. **Loop-Back Architecture**
- Replanner output feeds directly back to executor
- Execution resumes from failed step index
- Maintains execution history throughout

## How It Works in Practice

### Step 1: Initial Planning
```
User Query → Planner → Plan with Steps [S1, S2, S3]
```

### Step 2: Execution
```
Executor runs S1 → Returns empty results
Checks if S1 has dependents → YES (S2 depends on it)
```

### Step 3: Failure Detection
```
Executor sets:
  shouldReplan = true
  lastFailedStepId = "S1"
  failureReason = "Search returned empty results"
  Returns early from execution
```

### Step 4: Replanning
```
Replanner receives:
  - Original goal
  - Previous plan
  - Failed step details
  - Empty result
  
Invokes LLM with replan prompt
LLM decides: "Broaden the search query"
Generates revised plan with modified S1
Returns updated plan
```

### Step 5: Second Execution Attempt
```
Executor resumes from failed step index
Runs revised S1 (broader query) → Returns results
Continues with S2, S3 normally
```

### Step 6: Success or Final Attempt
```
If S1 succeeds: Execution completes normally → finalAnswer
If S1 fails again: Replanning may occur (up to max)
After max attempts: Routes to finalAnswer with best results
```

## Integration Checklist

- ✅ AgentState updated with replanning fields
- ✅ Executor enhanced with failure detection
- ✅ New replanner node created
- ✅ Replan prompt specialized for failure recovery
- ✅ Workflow graph includes conditional routing
- ✅ Configuration supports max replan attempts
- ✅ Helper functions validate state and dependencies
- ✅ Error handling respects safety limits

## Testing Entry Points

1. **Test empty result detection**: Executor should detect when search returns `[]`
2. **Test dependency analysis**: Only replan if step has dependents
3. **Test replan limit**: Stop after max attempts, don't loop infinitely
4. **Test plan revision**: Replanner should modify failed step appropriately
5. **Test execution resumption**: Executor should resume from correct step after replan

## Configuration Environment Variables

```bash
# Maximum number of replanning attempts (default: 3)
MAX_REPLAN_ATTEMPTS=3

# Maximum retries for plan generation (default: 3)
MAX_PLAN_RETRIES=3

# Maximum step execution retries (default: 2)
MAX_STEP_RETRIES=2
```

## Performance Characteristics

| Scenario | Impact |
|----------|--------|
| Successful first execution | No impact, no extra LLM calls |
| One failed step, recovers on replan | +1 LLM call (5-10 seconds) |
| Multiple replans (max 3) | +3 LLM calls (15-30 seconds) |
| Worst case (repeated failures) | Bounded by max attempts, graceful degradation |

## Monitoring & Debugging

### State Indicators
- **`replanAttempts`**: How many times replanning was triggered
- **`lastFailedStepId`**: Which step failed
- **`failureReason`**: Why it failed (useful for debugging)
- **`previousPlan`**: What the plan looked like before replanning
- **`shouldReplan`**: Current routing decision

### Logging Output
The system logs:
- When replanning is triggered (step detection)
- Replan attempt count
- Failure analysis (empty results, errors)
- Revised plan details
- Execution resumption point

## Known Limitations

1. **LLM-Dependent**: Replanner quality depends on LLM's plan revision ability
2. **Linear Strategies**: Focuses on single-path revisions, not branching alternatives
3. **Timeout Not Extended**: Step timeout doesn't increase after replan
4. **Context Window**: Very long execution histories may exceed LLM context limits
5. **Determinism**: Same failure may replan differently on subsequent runs

## Future Enhancements

1. **Machine Learning**: Learn which strategy works best for different failure types
2. **Parallel Strategies**: Try multiple replan strategies simultaneously
3. **Adaptive Limits**: Adjust max attempts based on plan complexity
4. **Strategy Ranking**: Score alternative replan strategies and pick best
5. **Failure Prevention**: Proactively refine plans before execution
