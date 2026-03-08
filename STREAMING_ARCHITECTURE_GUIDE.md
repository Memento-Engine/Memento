# Streaming Architecture - Complete Event Flow

## 📊 System Overview

The search engine has complete end-to-end event streaming implemented:

```
[User Query] 
    ↓
[Backend Agent] → emits events to queue
    ↓
[Event Queue] → collects during execution
    ↓
[Server /agent endpoint] → drains & streams NDJSON
    ↓
[Frontend ChatProvider] → receives, parses, validates events
    ↓
[React State] → updates messages & stepUpdates
    ↓
[UI Components] → StepThinking renders thinking events
```

## 🔄 Event Types & Flow

### Type 1: "thinking" Events (Step Progress)
**Emitted by**: Executor, Planner, FinalAnswer nodes

**Format**:
```json
{
  "type": "thinking",
  "data": {
    "stepId": "step1",
    "stepType": "planning|searching|reasoning|completion",
    "title": "Create Execution Plan",
    "status": "running|completed|failed|final",
    "query": "semantic query",
    "description": "step description",
    "resultCount": 10,
    "results": [
      {"app_name": "VS Code", "window_name": "...", "image_path": "...", "captured_at": "..."}
    ],
    "message": "Optional message",
    "timestamp": "2026-03-08T..."
  },
  "timestamp": "2026-03-08T..."
}
```

**Frontend Processing**:
1. Received in `handleStreamingEvent(event)`
2. Validated against `thinkingSchema`
3. Added to `stepUpdates` state
4. Added to last message's `parts` array as type `"data-thinking"`
5. Rendered by `<StepThinking steps={steps} />`

### Type 2: "error" Events (Failures)
**Format**:
```json
{
  "type": "error",
  "data": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "isSystemError": true|false,
    "timestamp": "2026-03-08T..."
  },
  "timestamp": "2026-03-08T..."
}
```

**Frontend Processing**:
- If `isSystemError === true`: Transition to "Error" status (show error UI)
- If `isSystemError === false`: Treat as normal "no results found" (no error UI)

### Type 3: "complete" Events (Finish)
**Format**:
```json
{
  "type": "complete",
  "data": {
    "success": true|false,
    "result": "Final LLM response text",
    "metadata": {
      "noResultsFound": true|false,
      "requestId": "...",
      "duration": 5000
    }
  },
  "timestamp": "2026-03-08T..."
}
```

**Frontend Processing**:
- If `success === true` and `noResultsFound === true`: Transition to "NoResults" status
- If `success === true` and `noResultsFound === false`: Transition to "Finished" status
- If `success === false`: Transition to "Error" status

## 📝 How Events Are Emitted

### Example: Search Step Completion

**Backend (executor.node.ts line 366)**:
```typescript
emitStepEvent(step.id, "searching", step.query, "completed", {
  description: step.query,
  query: step.query,
  results: Array.isArray(result) ? result.slice(0, 3) : undefined,
  resultCount: Array.isArray(result) ? result.length : 1,
});
```

This creates:
```json
{
  "type": "thinking",
  "data": {
    "stepId": "step1",
    "stepType": "searching",
    "title": "Search for GitHub activity",
    "status": "completed",
    "query": "search GitHub for pull requests",
    "resultCount": 10,
    "results": [
      {"app_name": "Google Chrome", "window_name": "GitHub PR #123", ...}
    ],
    "timestamp": "2026-03-08T15:30:45.123Z"
  },
  "timestamp": "2026-03-08T15:30:45.123Z"
}
```

The event is immediately added to the AsyncLocalStorage queue and will be streamed to the frontend.

## 🎯 Debugging: How to Verify Events Are Flowing

### Step 1: Check Backend Event Emission
Open browser DevTools → Network tab → Look for `/api/v1/agent` request

Expected response headers:
- `Content-Type: application/x-ndjson`
- `Transfer-Encoding: chunked`

Expected response body (NDJSON): Each line is a JSON object:
```
{"type":"thinking","data":{...},"timestamp":"..."}
{"type":"thinking","data":{...},"timestamp":"..."}
{"type":"complete","data":{...},"timestamp":"..."}
```

### Step 2: Check Frontend Console
Console should show:
```
[Stream Event #1] Type: thinking, Keys: type, data, timestamp
  | Data Keys: stepId, stepType, title, status, ...
[Stream Event #2] Type: thinking, Keys: type, data, timestamp
✅ Thinking event validated successfully
  | Step: step1 Type: searching Status: completed
  | Results: 10
```

If you see:
```
❌ Failed to parse thinking schema
  | Validation Errors: [...]
```

Then there's a format mismatch. Check the validation errors list.

### Step 3: Check Frontend State
In StepThinking component, you should see:
```
✅ STEPS from step thinking component (count=3)
  Step 0: plan_0 (planning) - Status: completed, Results: undefined
  Step 1: step1 (searching) - Status: completed, Results: 10
  Step 2: final (completion) - Status: final, Results: undefined
```

If you see:
```
✅ STEPS from step thinking component (count=0)
```

Then events aren't making it into the message. Check ChatProvider state updates.

## 🚨 Common Issues & Solutions

### Issue 1: Validation Errors During Planning

**Error**:
```
window_title_contains: "invalid_type" expected array, received string
limit: "too_big" maximum: 100
```

**Root Cause**: LLM not generating correct JSON format

**Solution**: 
✅ DONE - Planner prompt now explicitly shows:
- Filter fields MUST be arrays: `"app_name": ["value1", "value2"]`
- Limit MUST be 1-100
- Added validation error feedback so LLM learns from failures

### Issue 2: Schema Validation Failures in Frontend

**Symptoms**:
- Console shows: `❌ Failed to parse thinking schema`
- Validation Errors list shows missing fields

**Common Causes**:
1. `stepId` missing - Need `string`
2. `stepType` invalid - Must be one of: `"planning" | "searching" | "reasoning" | "completion"`
3. `status` invalid - Must be one of: `"running" | "completed" | "failed" | "final"`
4. `title` missing - Need `string`

**Solution**: Check what data the backend is sending vs what schema expects. The console will show the received data.

### Issue 3: No Step Thinking Visible in UI

**Symptoms**:
- Events are streaming (shows in network tab)
- Console shows `✅ Thinking event validated`
- But no thinking timeline appears in chat

**Debug Steps**:
1. Open browser DevTools → React Component Tree
2. Find `<MessageItem>` component
3. Check `message.parts` - should contain items with `type: "data-thinking"`
4. If missing, event wasn't added to message - check ChatProvider state updates
5. If present, `<StepThinking>` should render them

## 🔧 Recent Changes

### Planner Prompt Updates
✅ Added explicit array notation examples
✅ Added LIMIT CONSTRAINTS section (1-100)
✅ Added previousErrors parameter for error feedback
✅ LLM now learns from validation failures on retries

### Frontend Logging
✅ Added detailed console logging in ChatProvider
✅ Shows each event type and data keys
✅ Shows validation success/failure with details
✅ Shows step thinking component updates with counts

### Event Format
All components now follow consistent format:
- `stepId`: unique identifier
- `stepType`: planning/searching/reasoning/completion
- `status`: running/completed/failed/final
- `title`: human-readable name
- `resultCount`: number of results (0 for no results)
- `results`: array of found items (optional)
- `message`: status message or explanation

## 📊 Expected Behavior

### Successful Query with Results
```
✈️ LocalPending → Thinking → Streaming/Finished
┌─ thinking: Created Execution Plan
├─ thinking: Searched for GitHub (found 10 results)
├─ thinking: Searched for VS Code (found 5 results)
└─ complete: Final answer from LLM
```

### Query with No Results
```
✈️ LocalPending → Thinking → NoResults
┌─ thinking: Created Execution Plan
├─ thinking: Searched (found 0 results)
└─ complete: "No relevant information found"  (NOT in Error state)
```

### System Error
```
✈️ LocalPending → Thinking → Error
├─ thinking: Created Execution Plan
├─ error: "Network timeout" (isSystemError: true)
└─ complete: failure event
```

## 🧪 Testing Checklist

- [ ] Backend compiles without errors
- [ ] Frontend compiles without TypeScript errors
- [ ] Send a query that should find results
- [ ] Check Network tab for streaming response
- [ ] Check Console for "✅ Thinking event validated" messages
- [ ] Verify thinking timeline appears in chat UI
- [ ] Check step details (title, result count, message)
- [ ] Send query that finds no results
- [ ] Verify "NoResults" status (not "Error")
- [ ] Test system error scenario
- [ ] Verify "Error" status with error UI

## 📚 Files Modified

**Backend**:
- ✅ `agents/src/utils/eventQueue.ts` - Event queue system
- ✅ `agents/src/utils/streaming.ts` - Event helpers
- ✅ `agents/src/server.ts` - NDJSON streaming endpoint
- ✅ `agents/src/planner/planner.node.ts` - Event emission + error feedback
- ✅ `agents/src/executor/executor.node.ts` - Step event emission
- ✅ `agents/src/prompts/plannerPrompt.ts` - Improved schema instructions

**Frontend**:
- ✅ `app/frontend/components/types.ts` - Extended schema
- ✅ `app/frontend/providers/ChatProvider.tsx` - Event streaming handler + logging
- ✅ `app/frontend/components/StepThinking.tsx` - Step display + logging
- ✅ `app/frontend/components/MessageItem.tsx` - Error UI logic

## 🎓 Key Concepts

**AsyncLocalStorage**: Keeps event queue scoped to current request
- Events accumulate during graph execution
- Drained after execution completes
- Ensures no race conditions between requests

**NDJSON (Newline-Delimited JSON)**: Streaming format
- One complete JSON object per line
- Clients parse line-by-line as they arrive
- Allows progressive rendering without waiting for completion

**Event Queue Pattern**: Batch streaming
- Events collected during execution (not truly real-time)
- All streamed after execution finishes
- Simple, reliable, no blocking needed during execution

**Schema Validation (Zod)**: Type safety
- Frontend validates all events against schema
- Prevents crashes from unexpected formats
- Clear error messages guide debugging
