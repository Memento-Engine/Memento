# Agent System Review - Critical Findings

## 🔴 CRITICAL ISSUES IDENTIFIED

### 1. **Unnecessary LLM Extraction Calls (MAJOR PERFORMANCE ISSUE)**

**Problem**: Every step result (including simple database searches) is passed through an LLM "extraction" process.

**Current Flow**:
```
Search Step
  ├─ Database returns results (structured array)
  └─ LLM called to "interpret" and extract (WASTEFUL!)
       ├─ LLM reads raw results
       ├─ LLM re-validates against schema (already valid!)
       └─ Returns same data
```

**Impact**:
- ❌ Doubles execution time (1 DB call + 1 LLM call per step)
- ❌ Doubles LLM costs
- ❌ Increases error surface (more places for LLM to make mistakes)
- ❌ No actual value - database already returns valid structured data

**Root Cause**: In `executor.node.ts`, the `extractStepResult()` function calls LLM for ALL steps, even simple searches.

**Solution**: 
- ✅ For search steps → return database results directly, skip LLM
- ✅ For reasoning/compute steps → use LLM only for actual reasoning
- ✅ Remove `extractorPrompt` from search execution path

---

### 2. **Overly Complex Planner Prompt**

**Problem**: The planner prompt is ~350 lines with excessive detail.

**Current Issues**:
- Too many rules and edge cases confuse the LLM
- Conflicting guidance on filters (arrays vs strings - was ambiguous before recent fix but still verbose)
- Multiple sections repeating similar concepts
- Not clear what's REQUIRED vs optional

**Example**: The prompt explains filtering in 5+ different sections:
1. DATABASE QUERY STRUCTURE
2. FILTER RULES
3. VARIATION STRATEGIES
4. Examples for GitHub, Slack, Twitter, etc.

**Impact**:
- ❌ LLM spends tokens on ambiguous instructions
- ❌ Increases chance of schema violations
- ❌ Makes debugging harder

**Solution**:
- ✅ Consolidate into single, focused instructions
- ✅ Use a simple template with clear constraints
- ✅ Examples only for complex filter variations

---

### 3. **Inefficient Replanning Architecture**

**Problem**: Current replanning calls the full PLANNER again, regenerating the entire plan.

**Current Flow**:
```
Execution fails
  ├─ Full planner called (expensive!)
  ├─ Generates complete new plan from scratch
  └─ Re-validates entire plan
```

**Better Approach**:
```
Execution fails
  ├─ Identify failed step
  ├─ Modify only that step's query/filters
  └─ Quick validation of just that step
```

**Impact**:
- ❌ Replanning as expensive as initial planning
- ❌ If 3 retries, could be 3x+ the initial LLM cost
- ❌ Full regen loses the structure of good steps

**Status**: Replanner exists but is called less frequently due to good limiting logic ✓

---

### 4. **Graph Flow Not Optimized**

**Current Graph**:
```
START → planner → executor → [conditional] → {replanner → executor loop} OR finalAnswer → END
```

**Issues**:
- ✅ Structure is sound (conditional routing works)
- ✓ Replanning limited to max 3 attempts
- ⚠️ But combined with unnecessary LLM extraction, each step is expensive

---

### 5. **Missing Early Exit Optimization**

**Problem**: If a search returns results, the system still might replan if dependent steps fail.

**Better Behavior**:
- If we already have good search results, use them
- Only replan if no search returned ANY data

**Status**: Partially addressed with `hasSearchResults` flag, but could be clearer

---

## 📊 Performance Impact Summary

### Estimated LLM Calls Per Query (3-step plan):

**BEFORE FIX (Current)**:
```
Initial Planning:    1 LLM call
Execute Step 1:      1 LLM call (search) + 1 LLM call (extraction) = 2 calls
Execute Step 2:      1 LLM call (search) + 1 LLM call (extraction) = 2 calls
Execute Step 3:      1 LLM call (reason) + 1 LLM call (extraction) = 2 calls
Final Answer:        1 LLM call
─────────────────────────────────────
TOTAL:              9 LLM calls ❌
```

**AFTER FIX (Optimized)**:
```
Initial Planning:    1 LLM call
Execute Step 1:      1 DB call (no LLM)
Execute Step 2:      1 DB call (no LLM)
Execute Step 3:      1 LLM call (reasoning only)
Final Answer:        1 LLM call
─────────────────────────────────────
TOTAL:              3 LLM calls ✅ (67% reduction!)
```

---

## 🔧 Planned Fixes

### Priority 1 - CRITICAL (Must do)
1. ✅ Remove LLM extraction from search step path
2. ✅ Simplify planner prompt
3. ✅ Improve replanner to modify step only, don't regenerate

### Priority 2 - Important
1. ✅ Clarify tool descriptions
2. ✅ Add schema validation before execution
3. ✅ Reduce prompt verbosity overall

### Priority 3 - Nice to have
1. Optimize cold-start performance
2. Cache analysis results
3. Parallel step execution (if independent)

---

## 📝 Implementation Plan

### File Changes:

1. **executor/executor.node.ts**
   - Remove automatic LLM extraction for search steps
   - Return database results directly
   - Keep LLM only for reasoning/compute steps

2. **prompts/plannerPrompt.ts**
   - Cut from ~350 lines to ~150 lines
   - Consolidate filter rules
   - Reduce examples, keep only critical ones
   - Add stricter schema enforcement

3. **planner/replanner.node.ts**
   - Optimize to modify failing step only
   - Don't regenerate entire plan
   - Validate only changed step

4. **prompts/extractionPrompt.ts**
   - Keep for reasoning steps only
   - Remove from search path

5. **tools/search.ts**
   - Add better error messages
   - Clarify expected output format

---

## Expected Outcomes

✅ Faster execution (67% fewer LLM calls)
✅ Lower costs (3x fewer LLM API calls)
✅ More reliable (fewer LLM errors)
✅ Clearer code (simpler flow)
