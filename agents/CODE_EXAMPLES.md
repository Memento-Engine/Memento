# Replanning Mechanism - Code Examples

## 1. State Flow Example

### Initial State (after planning)
```typescript
{
  goal: "Find my GitHub project from this week",
  requestId: "req-123",
  
  // Plan successfully created
  plan: {
    goal: "Find GitHub project activity",
    steps: [
      {
        id: "step1",
        kind: "search",
        query: "Find GitHub repository activity",
        databaseQuery: {
          semanticQuery: "GitHub project repository viewing and editing",
          keywords: ["github", "repository", "project"],
          filter: {
            app_name: "Google Chrome",
            browser_url_contains: "github.com",
            time_range: { start: "...", end: "..." }
          }
        }
      },
      {
        id: "step2",
        kind: "compute",
        query: "Extract repository names and timestamps",
        dependsOn: ["step1"]
      }
    ]
  },
  
  // Execution starts
  currentStep: 0,
  stepResults: {},
  stepErrors: {},
  
  // Replanning not yet triggered
  replanAttempts: 0,
  lastFailedStepId: undefined,
  failureReason: undefined,
  shouldReplan: false
}
```

### After Step Failure (empty results)
```typescript
{
  // ... same as above ...
  
  // Execution state after step1 fails
  currentStep: 0,  // Still at failed step
  stepResults: {
    step1: []  // Empty results stored
  },
  stepErrors: {},
  
  // Replanning triggered
  replanAttempts: 0,
  lastFailedStepId: "step1",
  failureReason: "Search returned empty results. Query: \"Find GitHub repository activity\"",
  previousPlan: { /* original plan */},
  shouldReplan: true  // Signal to run replanner
}
```

### After Replanning (revised plan)
```typescript
{
  // ... same request context ...
  
  // New revised plan
  plan: {
    goal: "Find GitHub project activity",
    steps: [
      {
        id: "step1",
        kind: "search",
        query: "Find GitHub activity - broadened query",
        databaseQuery: {
          semanticQuery: "GitHub viewing", // Simplified query
          keywords: ["github"],  // Removed "repository" and "project"
          filter: {
            // Removed app_name filter to search all browsers
            browser_url_contains: "github.com",
            // Removed time_range to look at all available data
          }
        }
      },
      {
        id: "step2",
        kind: "compute",
        query: "Extract repository names and timestamps",
        dependsOn: ["step1"]
      }
    ]
  },
  
  // Ready for second execution attempt
  currentStep: 0,  // Resume from failed step
  stepResults: {},  // Reset for new execution
  stepErrors: {},
  
  // After replanning
  replanAttempts: 1,
  lastFailedStepId: undefined,  // Cleared
  failureReason: undefined,  // Cleared
  previousPlan: {/* first plan */},
  shouldReplan: false  // Now ready to execute
}
```

## 2. Failure Detection Examples

### Example 1: Empty Search Results

```typescript
// During executor
const result = await search(step1);  // Returns: []

// isEmptyResult check
isEmptyResult([]);  // → true

// Dependency check
hasDependentSteps(plan, "step1");  // → true (step2 depends on this)

// Decision
shouldReplan = true;
lastFailedStepId = "step1";
```

### Example 2: Null Result from Computation

```typescript
// During executor
const result = await computeStep(step);  // Returns: null

// isEmptyResult check
isEmptyResult(null);  // → true

// Dependency check
hasDependentSteps(plan, "step2");  // → true

// Decision
shouldReplan = true;
lastFailedStepId = "step2";
```

### Example 3: Empty Object Result

```typescript
// During executor
const result = await processData(step);  // Returns: {}

// isEmptyResult check
isEmptyResult({});  // → true

// Dependency check
hasDependentSteps(plan, "step3");  // → false (final step)

// Decision
shouldReplan = false;
// Store empty result and continue
stepResults[step.id] = {};
```

### Example 4: Error Thrown During Execution

```typescript
// During executor
try {
  const result = await executeStep(step);
  throw new Error("Connection timeout");
} catch (error) {
  // Check if we should replan
  const maxReplanAttempts = getConfig().agent.maxReplanAttempts;  // 3
  const currentReplanAttempts = state.replanAttempts ?? 0;  // 2
  
  // shouldTriggerReplan(state)
  if (currentReplanAttempts < maxReplanAttempts) {
    shouldReplan = true;
    lastFailedStepId = step.id;
    failureReason = "Step execution failed: Connection timeout";
  } else {
    throw error;  // Max attempts reached, fail
  }
}
```

## 3. Replanning Strategies in Action

### Strategy 1: Broaden the Query

**Original Step (Failed):**
```typescript
{
  databaseQuery: {
    semanticQuery: "VS Code debugging TypeScript files",
    keywords: ["typescript", "debug"],
    filter: {
      app_name: "VS Code",
      window_title_contains: "debugger"
    }
  }
}
```

**Revised Step (Broadened):**
```typescript
{
  databaseQuery: {
    semanticQuery: "VS Code activity",  // Simplified
    keywords: ["vscode"],  // Removed specific keywords
    filter: {
      app_name: "VS Code",
      // Removed window_title_contains - too specific
    },
    limit: 20  // Increased limit
  }
}
```

### Strategy 2: Add Intermediate Steps

**Original Plan (Failed):**
```typescript
{
  steps: [
    {
      id: "step1",
      kind: "search",
      query: "Find Slack messages about project X from last week",
      expectedOutput: { type: "table", variableName: "messages" }
    }
  ]
}
```

**Revised Plan:**
```typescript
{
  steps: [
    {
      id: "step1",
      kind: "search",
      query: "Find recent Slack activity",
      expectedOutput: { type: "table", variableName: "slack_activity" }
    },
    {
      id: "step2",
      kind: "compute",
      query: "Extract date range from Slack activity",
      dependsOn: ["step1"],
      expectedOutput: { type: "value", variableName: "last_week_range" }
    },
    {
      id: "step3",
      kind: "search",
      query: "Find Slack messages about project X from extracted date",
      filter: {
        time_range: "{{step2.output}}"
      },
      expectedOutput: { type: "table", variableName: "messages" }
    }
  ]
}
```

### Strategy 3: Refine Query with More Context

**Original Step (Too vague):**
```typescript
{
  databaseQuery: {
    semanticQuery: "work",
    keywords: ["work"],
    filter: {}
  }
}
```

**Revised Step (More specific):**
```typescript
{
  databaseQuery: {
    semanticQuery: "software development coding programming work",
    keywords: ["code", "programming", "development", "github"],
    filter: {
      app_name: "VS Code",
      text_search: "function class method"
    }
  }
}
```

## 4. Workflow Graph Routing Examples

### Route to Replanner
```typescript
// After executor completes with failure
const state = {
  shouldReplan: true,
  lastFailedStepId: "step1",
  replanAttempts: 0
};

// In shouldReplanRoute()
function shouldReplanRoute(state) {
  if (state.shouldReplan) {  // true
    return "replanner";  // Routes to replanner node
  }
  return "finalAnswer";
}

// Graph follows: executor → replanner → executor (back to loop)
```

### Route to Final Answer
```typescript
// After executor completes successfully
const state = {
  shouldReplan: false,
  currentStep: plan.steps.length,  // All steps complete
  stepResults: { /* all results */ }
};

// In shouldReplanRoute()
function shouldReplanRoute(state) {
  if (state.shouldReplan) {  // false
    return "replanner";
  }
  return "finalAnswer";  // Routes to final answer
}

// Graph follows: executor → finalAnswer → END
```

## 5. Max Attempts Logic

### Configuration Check
```typescript
// In replanner node
const maxReplanAttempts = getConfig().agent.maxReplanAttempts;  // 3
const currentReplanAttempts = state.replanAttempts ?? 0;

// First failure
currentReplanAttempts = 0;  // < 3, proceed to replan

// After first replan
currentReplanAttempts = 1;  // < 3, can replan again

// After second replan  
currentReplanAttempts = 2;  // < 3, allow final replan

// After third replan
currentReplanAttempts = 3;  // NOT < 3, stop replanning
return {
  ...state,
  shouldReplan: false,
  plannerErrors: "Max replan attempts (3) reached..."
}
```

## 6. Complete Execution Example

```typescript
// User query: "Show me GitHub work from Monday"

// 1. PLANNING PHASE
// Planner creates initial plan
state = {
  plan: {
    steps: [
      { id: "step1", query: "Find GitHub activity Monday", ... },
      { id: "step2", query: "Extract repositories", dependsOn: ["step1"] }
    ]
  },
  currentStep: 0,
  shouldReplan: false
}

// 2. FIRST EXECUTION
state = await executorNode(state);
// step1 executes → returns []  (NO RESULTS)
// Detected: empty result + has dependents
// Returns:
state = {
  ...state,
  currentStep: 0,
  shouldReplan: true,
  lastFailedStepId: "step1",
  failureReason: "Search returned empty results"
}

// 3. FIRST REPLANNING
state = await replannerNode(state);
// Analyzes: query was too specific
// Revises: removes "Monday" filter, broadens to "this week"
state = {
  plan: {
    steps: [
      { 
        id: "step1", 
        query: "Find GitHub activity this week",
        filter: { /* Monday filter removed */ }
      },
      { id: "step2", query: "Extract repositories", dependsOn: ["step1"] }
    ]
  },
  currentStep: 0,
  replanAttempts: 1,
  shouldReplan: false
}

// 4. SECOND EXECUTION
state = await executorNode(state);
// step1 executes → returns [{record1}, {record2}]  (SUCCESS)
// step2 executes → returns ["repo-a", "repo-b"]  (SUCCESS)
state = {
  ...state,
  currentStep: 2,  // All steps complete
  stepResults: { step1: [...], step2: [...] },
  shouldReplan: false
}

// 5. FINAL ANSWER
state = await finalAnswerNode(state);
// Generates: "Found 2 GitHub repositories worked on this week..."
state = {
  ...state,
  finalResult: "Found repositories: repo-a, repo-b from Monday-Friday"
}

// 6. RETURN
return state.finalResult;
```

## 7. Configuration Environment Variables

```bash
# .env file
MAX_REPLAN_ATTEMPTS=3         # Try replanning up to 3 times
MAX_PLAN_RETRIES=3            # Retry plan generation 3 times
MAX_STEP_RETRIES=2            # Retry individual step execution 2 times
STEP_TIMEOUT_MS=60000         # Timeout per step: 60 seconds
```

## 8. Logging Examples

### When Replanning Triggers
```
[executor] Step execution detected empty results
  - stepId: step1
  - stepKind: search
  - hasDependents: true

[executor] Triggering replanning due to empty results
  - currentStep: 0
  - replanAttempts: 0

[state] shouldReplan = true
[state] lastFailedStepId = step1
```

### During Replanning
```
[replanner] Replanner node started
  - replanAttempts: 0
  - failedStepId: step1

[replanner] Analyzing failure context
  - stepId: step1
  - stepKind: search
  - resultLength: 0

[replanner] Revised plan created successfully
  - stepCount: 2
  - stepIds: [step1, step2]

[replanner] Ready to retry execution
  - currentStep: 0
```

### Max Attempts Reached
```
[replanner] Maximum replanning attempts reached
  - currentAttempts: 3
  - maxAttempts: 3

[state] Proceeding with best available results
[state] finalResult: "No detailed results, but here's what was found..."
```
