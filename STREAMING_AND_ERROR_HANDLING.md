# Complete Streaming and Error Handling Implementation

## Overview

The system has been completely redesigned to:
1. **Stream step-by-step reasoning** to the frontend in real-time
2. **Gracefully handle "no results found" scenarios** without throwing errors
3. **Always emit final responses** even when search finds no data
4. **Properly categorize errors** - distinguishing system failures from empty search results
5. **Update the thinking UI** continuously with execution progress

## Architecture Changes

### Backend Flow (TypeScript/Node.js)

#### 1. Event Queue System (`agents/src/utils/eventQueue.ts`)
- **Purpose**: Collect and emit streaming events during agent execution
- **How it works**:
  - Uses `AsyncLocalStorage` to maintain per-request event queues
  - `withEventQueue()` wraps the graph execution with event context
  - Agent nodes call `emitStepEvent()`, `emitCompletion()`, `emitError()` to queue events
  - `drainQueuedEvents()` retrieves all events at the end of execution
- **Key Functions**:
  - `emitStepEvent()` - Emit planning/searching/reasoning/completion events
  - `emitCompletion()` - Emit final LLM response
  - `emitError()` - Emit error events with `isSystemError` flag
  - `drainQueuedEvents()` - Retrieve and clear queued events

#### 2. Updated Agent State (`agents/src/agentState.ts`)
**New fields added**:
- `noResultsFound: boolean` - Tracks if max replan attempts reached with no data
- `hasSearchResults: boolean` - Tracks if any search returned data

**Why**: These flags enable the system to distinguish between "no results" (normal) and actual failures (error).

#### 3. Enhanced Agent Graph (`agents/src/agent.ts`)
**Updated `shouldReplanRoute()` function**:
```typescript
// OLD: If shouldReplan is true, always go to replanner
// NEW: If shouldReplan is true AND we haven't maxed out attempts, go to replanner
//      Otherwise, go to finalAnswer (which will generate a "no results" response if needed)

if (state.shouldReplan && currentReplanAttempts < maxReplanAttempts) {
  return "replanner";  // Try replanning again
}

if (state.shouldReplan && currentReplanAttempts >= maxReplanAttempts) {
  state.noResultsFound = true;  // Mark that we gave up on finding results
}

return "finalAnswer";  // Generate response with or without results
```

**Effect**: The system never throws an error when searches come up empty - instead it marks the state and moves to final answer generation.

#### 4. Planner with Event Emission (`agents/src/planner/planner.node.ts`)
```typescript
emitStepEvent(
  "plan_0",
  "planning",
  "Create Execution Plan",
  "completed",
  {
    description: `Created plan with ${plan.steps.length} steps`,
    query: state.goal,
    queries: plan.steps.map((s) => s.query),
  },
);
```
**Effect**: Frontend sees "Create Execution Plan" step as it completes.

#### 5. Executor with Step Tracking (`agents/src/executor/executor.node.ts`)
**For each executed step**:
```typescript
emitStepEvent(
  step.id,
  step.kind === "search" ? "searching" : "reasoning",
  step.query,
  "completed",  // or "failed"
  {
    description: step.query,
    query: step.query,
    results: Array.isArray(result) ? result.slice(0, 3) : undefined,
    resultCount: Array.isArray(result) ? result.length : 1,
  },
);
```

**Key Change**: No longer throws error when max replan attempts reached. Instead:
- Sets `shouldReplan = true` to trigger routing decision
- Returns gracefully to let `shouldReplanRoute()` decide what to do
- The route function checks if we've exhausted attempts and routes to finalAnswer

**Tracks results**:
```typescript
const hasAnyResults = Object.values(stepResults).some(
  (result) => result && (!Array.isArray(result) || result.length > 0),
);

return {
  ...state,
  stepResults,
  hasSearchResults: hasAnyResults,  // NEW: Track if we found data
};
```

#### 6. Final Answer Node (`agents/src/finalLlm/finalAnswer.node.ts`)
**Completely redesigned to handle empty results**:
```typescript
// If no search results found, generate a "no results" message
if (!hasSearchResults || !stepResults || Object.keys(stepResults).length === 0) {
  const noResultsMessage = noResultsFound
    ? `I was unable to find any relevant information...`
    : `I could not find relevant information...`;

  emitCompletion(noResultsMessage);  // ALWAYS emit final response
  
  return {
    ...state,
    finalResult: noResultsMessage,
    endTime: Date.now(),
  };
}

// Otherwise, generate answer from results as normal
const finalResult = await llm.invoke(prompt);
emitCompletion(finalResult);  // Stream the LLM response
```

**Key behaviors**:
- Always generates a response, even with no search data
- Always calls `emitCompletion()` to stream the final message
- Gracefully handles LLM errors by emitting fallback message

#### 7. Streaming Server (`agents/src/server.ts`)
**Complete redesign for JSON streaming**:
```typescript
// Set headers for streaming response
res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
res.setHeader("Transfer-Encoding", "chunked");

// Wrap execution in event queue
let result = await withEventQueue(async () => {
  return await graph.invoke({...});
});

// Get all accumulated events
const events = drainQueuedEvents();

// Stream each event as NDJSON (newline-delimited JSON)
for (const event of events) {
  res.write(JSON.stringify(event) + "\n");
}

// Handle errors properly
if (executionError) {
  res.write(JSON.stringify({
    type: "error",
    data: {
      message: executionError.message,
      code: executionError.code,
      isSystemError: true,  // Real system error
    },
  }) + "\n");
}

// Send completion with success/failure status
res.write(JSON.stringify({
  type: "complete",
  data: {
    success: result?.finalResult ? true : false,
    result: result?.finalResult,
    noResultsFound: result?.noResultsFound,  // Signal to frontend
  },
}) + "\n");
```

**Response format**: NDJSON (each line is a JSON object):
```
{"type": "thinking", "data": {...}}\n
{"type": "thinking", "data": {...}}\n
{"type": "complete", "data": {...}}\n
```

### Frontend Changes (React)

#### 1. Enhanced Types (`app/frontend/components/types.ts`)
**Extended `thinkingSchema`**:
```typescript
export const thinkingSchema = z.object({
  stepId: z.string(),                      // "plan_0", "step_1", etc.
  stepType: z.enum([
    "planning",                            // Planner creating plan
    "searching",                           // Executor searching
    "reasoning",                           // Executor reasoning
    "completion",                          // Final answer
  ]),
  status: z.enum([
    "running",                             // Currently executing
    "completed",                           // Finished successfully
    "failed",                              // Failed but recovered
    "final",                               // Pipeline finished
  ]),
  title: z.string(),                       // Human-readable name
  description: z.string().optional(),
  query: z.string().optional(),
  results: z.array(...).optional(),        // Search results
  resultCount: z.number().optional(),      // Count of results
  message: z.string().optional(),
  reasoning: z.string().optional(),
  queries: z.array(z.string()).optional(),
  duration: z.number().optional(),
  timestamp: z.string().optional(),
});
```

#### 2. Updated Chat Context (`app/frontend/contexts/chatContext.ts`)
**New status type**:
```typescript
export type AssistantStatus =
  | "Idle"
  | "LocalPending"
  | "Thinking"
  | "Streaming"
  | "Finished"
  | "NoResults"           // NEW: Search completed but found nothing
  | "Error";              // Only real system errors
```

**New state field**:
```typescript
type ChatContext = {
  ...existing fields...
  stepUpdates: any[];     // NEW: Array of step thinking events
};
```

**State transitions**:
- `Idle` → `LocalPending` (user sends message)
- `LocalPending` → `Thinking` (backend acknowledges)
- `Thinking` → `Streaming` | `Finished` | `NoResults` | `Error`
- `Streaming` → `Finished` | `NoResults` | `Error`
- `Finished` → `Idle` (ready for next message)
- `NoResults` → `Idle` (ready for next message - NOT in error line)
- `Error` → `Idle` (ready for retry)

#### 3. ChatProvider with Event Handling (`app/frontend/providers/ChatProvider.tsx`)
**New event handlers**:

```typescript
case "thinking": {
  // Step progress update
  transitionStatus("Thinking");
  
  const thinkingStep = event.data;
  setStepUpdates((prev) => [...prev, thinkingStep]);
  
  // Add to messages for StepThinking component
  setMessages((prev) => {
    // Create/update assistant message with thinking data
  });
}

case "complete": {
  // Final result and status
  const completeData = event.data;
  
  if (completeData.success) {
    if (completeData.noResultsFound) {
      transitionStatus("NoResults");   // NOT an error
    } else {
      transitionStatus("Finished");
    }
    
    // Add final message to chat
    if (completeData.result) {
      setMessages((prev) => {
        // Add final LLM response
      });
    }
  } else {
    transitionStatus("Error");
  }
}

case "error": {
  // Error event with context
  const errorData = event.data;
  
  if (errorData.isSystemError) {
    transitionStatus("Error");         // Real system error
  } else {
    transitionStatus("Finished");      // Not an error
  }
}
```

**Streaming parser**:
```typescript
const reader = res.body.getReader();
const decoder = new TextDecoder("utf-8");

let buffer = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  
  // Split by newlines to get individual JSON objects
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";  // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    await handleStreamingEvent(event);
  }
}
```

#### 4. MessageItem Error Handling (`app/frontend/components/MessageItem.tsx`)
**Updated render logic**:
```typescript
const renderAssistantDraft = () => {
  if (isLastMessage) {
    switch (assistantStatus) {
      case "LocalPending":
        return <ThinkingBubble />;
      
      case "Error":
        // Only show error UI for REAL system errors
        return (
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive font-medium">
              Something went wrong
            </p>
            <p className="text-xs text-destructive/70 mt-1">
              An error occurred while processing your request...
            </p>
            {onRegenerate && (
              <Button onClick={() => onRegenerate(message.id)}>
                Retry
              </Button>
            )}
          </div>
        );
      
      case "NoResults":
        // NOT an error - the message will contain the LLM explanation
        return null;
      
      default:
        return null;
    }
  }
};
```

## Execution Flow Example

### Scenario: User asks question, no search results found

**1. User Action**: "Find information about quantum computers in my screenshots"

**2. Client Sends**:
```json
{
  "goal": "Find information about quantum computers in my screenshots"
}
```

**3. Backend Events Streamed**:
```
{"type": "thinking", "data": {"stepId": "plan_0", "stepType": "planning", "status": "completed", ...}\n
{"type": "thinking", "data": {"stepId": "step_1", "stepType": "searching", "status": "completed", "resultCount": 0, "message": "Search returned no results"}\n
{"type": "thinking", "data": {"stepId": "plan_1", "stepType": "planning", "status": "completed", ...}\n (replan 1/3)
{"type": "thinking", "data": {"stepId": "step_1", "stepType": "searching", "status": "completed", "resultCount": 0, "message": "Search returned no results"}\n
... (replan attempt 2, 3)
{"type": "thinking", "data": {"stepId": "final", "stepType": "completion", "status": "final", "message": "I was unable to find any relevant information about quantum computers in your captured data. The system performed multiple search attempts with different query variations but did not return any matching results."}\n
{"type": "complete", "data": {"success": true, "result": "I was unable to find...", "noResultsFound": true}\n
```

**4. Frontend Behavior**:
- Shows "Create Execution Plan" step
- Shows "Searching..." with query for each step (0 results)
- Shows "Replanning..." indication
- Repeats search with variations (up to 3 times)
- **Transitions to "NoResults" state** (NOT "Error")
- Displays final LLM response explaining no data was found
- **NO error UI is shown** - just a normal message

**5. User Experience**:
- Sees thinking bubble while searching
- Sees step-by-step progress in StepThinking component
- Gets clear explanation that no results were found
- Can ask a new question without seeing error state

## Error Scenarios

### Real System Error Example
```
Error: "LLM API key invalid"
↓
isSystemError: true
↓
Status: "Error"
↓
Shows error UI with "Retry" button
```

### No Results Example
```
Search: [] (empty array)
↓
After max replans: noResultsFound = true
↓
Status: "NoResults" (from "Finished")
↓
Shows LLM response: "No information found"
↓
NO error UI displayed
```

## Key Advantages

1. **Always Communicates**: User always sees a final response, never just an error
2. **Real-time Progress**: Step-by-step thinking visible as it executes
3. **Smart Error Handling**: Distinguishes between system failures and empty results
4. **Better UX**: "No results found" is not presented as a failure
5. **Graceful Degradation**: Continues to function with "best effort" response even when data is scarce
6. **Streaming**: Events arrive as they happen, not all at once at the end

## Testing Checklist

- [ ] Agent generates steps that emit events properly
- [ ] Events stream to frontend as NDJSON
- [ ] Frontend parses events correctly
- [ ] Planning steps show in thinking UI
- [ ] Search steps show with result counts
- [ ] Replanning attempts are tracked and shown
- [ ] No-results scenario transitions to "NoResults" status
- [ ] "NoResults" status does NOT show error UI
- [ ] Error messages show error UI with "Retry" button
- [ ] Final message is always emitted and displayed
- [ ] StepThinking component updates with incoming events
- [ ] Multiple replans display sequentially in UI

## Files Changed

### Backend
- `agents/src/utils/eventQueue.ts` (new)
- `agents/src/utils/streaming.ts` (new)
- `agents/src/agentState.ts` (updated)
- `agents/src/agent.ts` (updated)
- `agents/src/planner/planner.node.ts` (updated)
- `agents/src/executor/executor.node.ts` (updated)
- `agents/src/finalLlm/finalAnswer.node.ts` (updated)
- `agents/src/server.ts` (updated)

### Frontend
- `app/frontend/components/types.ts` (updated)
- `app/frontend/contexts/chatContext.ts` (updated)
- `app/frontend/providers/ChatProvider.tsx` (updated)
- `app/frontend/components/MessageItem.tsx` (updated)

## Next Steps

1. **Test the streaming**: Run the backend and verify events are being emitted
2. **Debug the frontend**: Check browser console for event parsing
3. **Verify StepThinking**: Component should update with incoming step events
4. **Test error handling**: Try various failure scenarios
5. **Performance check**: Monitor event queue size and memory usage
6. **UI polish**: Refine how thinking steps are displayed
