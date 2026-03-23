# Chat Context Logging Enhancement Summary

## Overview
Added comprehensive logging for chat context lifecycle, including raw history, summarization triggers, and formatted context display.

## New Functions in `tokenTracker.ts`

### 1. `logChatHistoryStart()`
Logs the raw chat history at query start with formatted box display.

**Features:**
- Pretty-printed box with cyan borders
- User goal extraction and display (truncated at 70 chars)
- Message count metadata
- Full message listing with role-based colors
  - User messages: Blue
  - Assistant messages: Magenta
- Truncated preview of message content (max 60 chars)
- Includes full JSON metadata for logging

**Example Output:**
```
╔════════════════════════════════════════╗
║  QUERY STARTED - CHAT HISTORY      ║
╠════════════════════════════════════════╣
║ User Goal:
║   Find the best machine learning books...
║ History: 4 messages
╠════════════════════════════════════════╣
║ 1. USER:
║   Previous question about ML...
║ 2. ASSISTANT:
║   Answer about the topic...
╚════════════════════════════════════════╝
```

### 2. `logSummarizationTriggered()`
Logs when chat summarization is triggered with reasoning details.

**Features:**
- Yellow box borders indicating warning/action state
- Shows trigger reason (token threshold or combined tokens threshold)
- Displays old context tokens (colored red)
- Shows new summary tokens (colored green) 
- Full previous summary text
- Full new summary text
- Contextual metadata in JSON

**Example Output:**
```
╔════════════════════════════════════════╗
║  CHAT SUMMARIZATION TRIGGERED     ║
╠════════════════════════════════════════╣
║ Reason: Older tokens (1456) exceeded threshold (1200)
║ Old Context: 1456 tokens
║ New Summary: 287 tokens
╠════════════════════════════════════════╣
║ Previous Summary:
║   Earlier conversation covered topics X, Y, Z...
║
║ New Summary:
║   Combined summary incorporating new messages...
╚════════════════════════════════════════╝
```

### 3. `logFormattedChatContext()`
Logs the final formatted chat context window ready for LLM processing.

**Features:**
- Blue box borders for informational display
- Shows total tokens used (out of 1500 max)
- Shows if summarization was performed
- Displays full formatted context text (no truncation)
- Context includes summary (if exists) + recent pairs
- Full JSON metadata

**Example Output:**
```
╔════════════════════════════════════════╗
║  CHAT CONTEXT WINDOW           ║
╠════════════════════════════════════════╣
║ Tokens: 845/1500
║ Summarized: Yes
╠════════════════════════════════════════╣
║ [Summary of earlier conversation]
║ Previous discussions covered...
║
║ [Recent exchanges]
║ user: What about...
║ assistant: The answer is...
╚════════════════════════════════════════╝
```

## Integration in `chatContextManager.ts`

### Updated `buildChatContextWindow()`

**1. At function start:**
- Extract user goal from messages (last user message)
- Call `logChatHistoryStart()` with goal and full message array
- Logs raw input state before any processing

**2. During summarization trigger:**
- Calculate two trigger conditions:
  - Token threshold: `olderTokens > summarizationTriggerTokens`
  - Combined threshold: `summary + olderTokens > summaryMaxTokens * 2`
- Set `shouldSummarize` flag based on either condition
- If triggered, determine `triggerReason` string with specific metrics
- After summarization completes, call `logSummarizationTriggered()` with:
  - Reason string (which condition fired)
  - Old token count
  - New summary token count
  - Previous summary text
  - New summary text

**3. At function end (before return):**
- Build final `contextWindow` object
- Format context with `formatChatContext()` (summary + recent pairs)
- Call `logFormattedChatContext()` with:
  - Formatted context string (full text, no truncation)
  - Total tokens
  - Whether summarization was performed

## Color Scheme
- **Cyan**: Chat history headers and structure (primary info)
- **Yellow**: Summarization events (attention/action)
- **Blue**: Final chat context (informational)
- **Green**: Token counts that are healthy/reduced
- **Red**: Token counts that are concerning/high
- **Magenta**: Assistant/LLM roles
- **Blue**: User roles

## Logging Flow per Query

1. **Query arrives** → `logChatHistoryStart()` shows raw history
2. **Context built** → If summarization triggered → `logSummarizationTriggered()` shows why/what
3. **Context ready** → `logFormattedChatContext()` shows final window

## Token Budget Thresholds
- Summarization triggers at: ~1200 tokens (older messages)
- Or if: existing summary + older tokens > 600 tokens
- Maximum total context: 1500 tokens
- Summary max: 300 tokens
- Recent pairs max: 600 tokens each

## Full Text Visibility
All three logging functions include the complete text without truncation:
- `logChatHistoryStart`: Full message content (only chat content is truncated to preview)
- `logSummarizationTriggered`: Complete previous and new summary texts
- `logFormattedChatContext`: Entire formatted context with all pairs

## Implementation Notes
- All functions are async and use the pino logger
- Box-drawing characters (╔, ═, ║, ╠, ╣, ╚) for visual structure
- ANSI color codes for terminal-compatible colors (no emojis)
- Metrics included in JSON for structured logging
- Functions called at key lifecycle points in `buildChatContextWindow()`
- Non-critical to query success (errors don't break processing)

## Files Modified
1. `app/agents/src/utils/tokenTracker.ts` - Added 3 new logging functions
2. `app/agents/src/chatContextManager.ts` - Integrated logging calls + added imports

## Testing
The logging will appear in console output during agent queries. Look for:
- Cyan boxes at query start showing chat history
- Yellow boxes when summarization occurs explaining trigger reason  
- Blue boxes showing final context window before LLM processing
