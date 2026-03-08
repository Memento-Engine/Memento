# Replanning Mechanism - Quick Start Guide

## What Changed?

The agent now automatically **replans and retries** when a step returns empty results or fails, instead of giving up immediately.

## Key Features

✅ **Automatic Failure Recovery** - Detects when search returns no results and tries again  
✅ **Smart Revisions** - Changes only the failing step, not the entire plan  
✅ **Safety Limits** - Prevents infinite loops (max 3 replan attempts)  
✅ **Rich Context** - Provides original goal, plan, and results to the replanner  
✅ **Multiple Strategies** - Can broaden searches, refine queries, or add intermediate steps  

## How It Works

### Simple Example: Finding GitHub Activity

**User asks:** "Show me GitHub work from Monday?"

**What happens:** 
1. **Plan Created:** Search for GitHub activity on Monday  
2. **First Execute:** Search returns 0 results ❌  
3. **Auto-Replan:** System realizes "Monday" is too specific  
4. **Revised Plan:** Search for GitHub activity "this week" instead  
5. **Second Execute:** Search returns 5 results ✅  
6. **Answer:** Returns the results

## Files Changed

### Core Implementation Files

| File | Change | Purpose |
|------|--------|---------|
| `src/agentState.ts` | Added 5 new state fields | Track replanning attempts and context |
| `src/executor/executor.node.ts` | Added failure detection | Detect empty results and trigger replan |
| `src/planner/replanner.node.ts` | **NEW FILE** | Handle plan revision |
| `src/prompts/replanPrompt.ts` | **NEW FILE** | Guide LLM through replanning |
| `src/agent.ts` | Added conditional routing | Route to replanner vs final answer |
| `src/config/config.ts` | Added maxReplanAttempts | Configuration for max attempts |

## Configuration

**Default:** Replan up to 3 times if a step fails

**To change:**
```bash
# .env file
MAX_REPLAN_ATTEMPTS=5    # Try more times
# or
MAX_REPLAN_ATTEMPTS=1    # Only try once
```

## When Replanning Happens

✅ Empty search results with dependent steps  
✅ Other step types return empty/null with dependents  
✅ Step execution error (before max attempts)  

❌ No replan if it's the final step with empty result  
❌ No replan if we've already tried 3+ times  

## Testing the Feature

### Test 1: Empty Results Trigger Replan
```typescript
// Mock a search that returns no results
const step1 = { id: "step1", kind: "search", ... };
const result = [];  // Empty

// Executor should:
// ✅ Detect empty result
// ✅ Check for dependents (found: step2)
// ✅ Set shouldReplan = true
// ✅ Return early with replan signal
```

### Test 2: Replanner Modifies Plan
```typescript
// Replanner receives failed step details
// Should modify the query to be less specific
// Return new plan with same structure but different queries
```

### Test 3: Max Attempts Limit
```typescript
// Force 4 failures in a row
// After 3rd replan attempt, should not replan again
// Should route to finalAnswer with best available results
```

## Key Design Principles

### 1. **Minimal Changes**
```
Don't rewrite the whole plan
Only fix the failing part
Keep what worked
```

### 2. **Rich Failure Context**
```
Replanner knows:
- What the user asked for
- What the previous plan was
- Which step failed
- What result it got
- Why it probably failed
```

### 3. **Bounded Retries**
```
Try: 1st execution → fail → replan → 2nd execution → fail → replan → 3rd execution → fail → replan → 4th execution
Stop after 3 replans
```

### 4. **Dependency Aware**
```
Only replan if the failure matters:
- Search fails but no one uses results? Continue.
- Search fails and next 3 steps need it? Replan!
```

## Common Replanning Strategies

### 1. **Broaden the Query**
When query is too specific:
- Remove filter restrictions
- Expand keywords
- Widen time range

Example:
```
Before: Search GitHub "TypeScript debugging Tuesday"
After:  Search GitHub this week
```

### 2. **Refine the Query**
When query is too vague:
- Add more context
- Include specific keywords
- Be more precise

Example:
```
Before: Search "work"
After:  Search "software development code programming"
```

### 3. **Add Intermediate Steps**
When one step is too complex:
- Break it into sub-steps
- Extract intermediate values
- Build context gradually

Example:
```
Before: [Search messages about project]
After:  [Search messages] → [Get dates] → [Search messages in date range]
```

### 4. **Change Search Parameters**
When limits are too restrictive:
- Increase result limit (10 → 50)
- Change sort order (newest → oldest)
- Modify sort field (timestamp → app_name)

## Reading Logs

### Replanning Triggered
```
[executor] Step completed with empty results - may trigger replanning
[executor] Empty result detected on step with dependent steps
[executor] Triggering replanning due to step execution error
```

### Replanning In Progress
```
[replanner] Replanner node started
[replanner] Analyzing failure context
[replanner] Revised plan created successfully
```

### Max Attempts Reached
```
[replanner] Maximum replanning attempts reached
[replanner] Proceeding with best available results
```

## State Tracking

### Before Replanning
```
{
  shouldReplan: true,
  lastFailedStepId: "step1",
  failureReason: "Search returned empty results",
  replanAttempts: 0
}
```

### After Replanning
```
{
  shouldReplan: false,
  lastFailedStepId: undefined,
  failureReason: undefined,
  replanAttempts: 1,
  plan: { /* updated plan */ }
}
```

## Common Issues

### Issue: Same failure repeats
**Cause:** Replanner makes similar revision twice  
**Solution:** Replanner should analyze previous failure and try different strategy  

### Issue: Exceeds max attempts
**Cause:** Plan doesn't improve with replanning  
**Solution:** May need better initial plan or more aggressive revision strategies  

### Issue: Lost results from first execution
**Cause:** Misunderstanding - results ARE preserved  
**Solution:** Check stepResults dict - all completed steps remain  

## Performance Impact

| Scenario | Time | LLM Calls |
|----------|------|-----------|
| No failures | Normal | N (just planner + extraction) |
| 1 replan | +5-10s | N+1 |
| 2 replans | +10-20s | N+2 |
| 3 replans (max) | +15-30s | N+3 |

## Next Steps After Implementation

1. **Test** - Run the failing scenarios to verify replanning works
2. **Monitor** - Watch logs to see replanAttempts and failure patterns
3. **Tune** - Adjust MAX_REPLAN_ATTEMPTS based on user experience
4. **Improve** - Enhance replan prompt if seeing repeat failures

## Documentation Files

- **REPLANNING_MECHANISM.md** - Complete technical reference
- **IMPLEMENTATION_SUMMARY.md** - What changed and why
- **FLOW_DIAGRAMS.md** - Visual flowcharts
- **CODE_EXAMPLES.md** - Code samples and examples
- **QUICK_START.md** - This file

## Questions?

**Q: Will replanning slow things down?**  
A: Only if a step fails. Normal execution is unaffected.

**Q: Can I disable replanning?**  
A: Set MAX_REPLAN_ATTEMPTS=0, or modify shouldReplanRoute() to return "finalAnswer"

**Q: What if the replanner fails?**  
A: Error propagates up and execution stops (safety mechanism)

**Q: Does replanning change the user's original query?**  
A: No, it only revises the internal execution plan

**Q: How much does this cost in LLM API calls?**  
A: One extra call per replan attempt (up to 3 times per query)
