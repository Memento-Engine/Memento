# Refactoring Visual Summary

## Architecture Comparison

### BEFORE: Brittle & Fragile
```
┌─────────────────────────────────────────────────────────┐
│                   Express Server                         │
│  - Minimal validation                                    │
│  - Generic error responses                               │
│  - No request tracing                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              LangGraph Workflow                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Planner    │──│   Executor   │──│Final Answer  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                              │
│    - Hardcoded       - Hardcoded tools                   │
│      LLM             - Mixed concerns                    │
│    - Basic retry     - Tight coupling                    │
│                      - No accumulation                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           External Services                              │
│  - Hardcoded URLs                                        │
│  - No error recovery                                     │
│  - Generic timeouts                                      │
└─────────────────────────────────────────────────────────┘

Issues:
❌ Hardcoded config
❌ No tool registry
❌ Poor error messages
❌ No request tracing
❌ Mixed logging
❌ In-place mutations
❌ Incomplete state
```

---

### AFTER: Robust & Extensible
```
┌─────────────────────────────────────────────────────────┐
│                   Express Server                         │
│  ✅ Zod request validation                              │
│  ✅ Structured error responses                          │
│  ✅ Request ID injection                                │
│  ✅ Execution metrics                                   │
│  ✅ Multiple endpoints                                  │
│  ✅ Error middleware                                    │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────────────┐  ┌──────────────────┐
│  Configuration       │  │  Tool Registry   │
│  System              │  │  System          │
│  ✅ Validated        │  │  ✅ Dynamic      │
│  ✅ Typed            │  │  ✅ Extensible   │
│  ✅ Defaults         │  │  ✅ Interface    │
└────────┬─────────────┘  └────────┬─────────┘
         │                         │
         └────────────┬────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│           Logging & Utilities                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Logger System │  │JSON Parser   │  │Error Handler │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ✅ Unified       ✅ Type-safe    ✅ Structured        │
│  ✅ Contextual    ✅ Validated    ✅ Recoverable       │
│  ✅ Traceable     ✅ Fallbacks    ✅ Timeout-safe      │
└────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              LangGraph Workflow                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Planner    │  │   Executor   │  │Final Answer  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ✅ Singleton       ✅ Tool registry   ✅ Proper state  │
│    LLM             ✅ Modular design   ✅ Metrics      │
│  ✅ Auto retry     ✅ Error accum.     ✅ Tracing      │
│  ✅ Enhanced       ✅ Timeout safe                      │
│    validation      ✅ Graceful fail                     │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌──────────────────────┐  ┌──────────────────┐
│  Error Type System   │  │  Execution State │
│  ┌──────────────────┐│  │  ┌──────────────┐│
│  │ErrorCode enum  ┌─┘│  │  │Enhanced      ││
│  │  - 16+ codes   │  │  │  │tracking:     ││
│  │AgentError      │  │  │  │  - requestId ││
│  │  - Context     │  │  │  │  - attempts  ││
│  │  - Status code │  │  │  │  - errors    ││
│  │Specialized:    │  │  │  │  - timing    ││
│  │  - Validation  │  │  │  └──────────────┘│
│  │  - Planner     │  │  └──────────────────┘
│  │  - Executor    │  │
│  │  - Tool        │  │
│  │  - Timeout     │  │
│  └──────────────────┘│
└──────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           External Services                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │Search Tool   │  │LLM Provider  │  │Custom Tools  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ✅ Error handling  ✅ Timeout wrap  ✅ Pluggable      │
│  ✅ Structured      ✅ Retry logic   ✅ Validated      │
│  ✅ Fault-tolerant  ✅ Monitoring    ✅ Typed          │
└─────────────────────────────────────────────────────────┘

Improvements:
✅ Environment-based config
✅ Extensible tool registry
✅ Detailed error messages
✅ Request tracing
✅ Unified logging
✅ Immutable state returns
✅ Complete state tracking
✅ Type safety throughout
✅ Automatic retries
✅ Timeout protection
```

---

## Data Flow Comparison

### BEFORE: Simple but Brittle
```
User Request
    │
    ▼
┌─────────────────┐
│  server.ts      │────► Minimal validation
│  (70 lines)     │────► Generic try/catch
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │Planner │─────► Hardcoded LLM
    └────┬───┘      Basic retry
         │
         ▼
    ┌─────────┐
    │Executor │─────► Hardcoded tools
    └────┬────┘      No error recovery
         │
         ▼
    ┌──────────────┐
    │FinalAnswer   │─────► Returns void!
    └────┬─────────┘       No metrics
         │
         ▼
    Error or Result
    (Generic message)
```

### AFTER: Robust & Observable
```
User Request
    │
    ▼
┌─────────────────────────────┐
│  server.ts                  │
│  (250 lines)                │
│  ✅ Validation              │
│  ✅ Request ID injection    │
│  ✅ Error middleware        │
│  ✅ Structured responses    │
│  ✅ Metrics tracking        │
└────────┬────────────────────┘
         │
    ┌────┴────────────────────────────┐
    │                                 │
    ▼                                 ▼
┌──────────────┐            ┌─────────────────┐
│Config System │            │Tool Registry    │
│  ✅ Validated│            │  ✅ Dynamic     │
└──────┬───────┘            └────────┬────────┘
       │                             │
       └────────────┬────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
    ┌────────────────┐    ┌──────────────────┐
    │Logging System  │    │Parser & Utils    │
    │✅ Contextual   │    │✅ Safe parsing   │
    │✅ Traceable    │    │✅ Type checking  │
    │✅ Structured   │    │✅ Retry logic    │
    │✅ No overhead  │    │✅ Timeouts       │
    └────────┬───────┘    └────────┬─────────┘
             └──────────┬─────────┘
                        │
                        ▼
    ┌─────────────────────────────────────┐
    │         LangGraph Workflow          │
    │                                     │
    │ ┌──────┐  ┌──────┐  ┌──────────┐   │
    │ │Plan  │→ │Exec  │→ │FinalAns  │   │
    │ └──∧───┘  └──∧───┘  └──∧──────┘   │
    │    │         │          │          │
    │    │ Retry   │ Error    │ Metrics  │
    │    │ w/      │ Accum.   │ Tracking │
    │    │ backoff │ Safety   │ Tracing  │
    │    │         │ Exit     │          │
    └────┼─────────┼──────────┼──────────┘
         │         │          │
         ▼         ▼          ▼
    ┌─────────────────────────────────────┐
    │  Error Type System                  │
    │  ✅ 16+ error codes                 │
    │  ✅ Structured context              │
    │  ✅ HTTP status mapping             │
    │  ✅ Root cause tracking             │
    └────────────┬────────────────────────┘
                 │
                 ▼
    ┌─────────────────────────────────────┐
    │  Response with Metrics              │
    │  {                                  │
    │    success: true/false              │
    │    result/error: <data>             │
    │    metadata: {                      │
    │      requestId: <uuid>              │
    │      duration: <ms>                 │
    │      timestamp: <iso>               │
    │    }                                │
    │  }                                  │
    └─────────────────────────────────────┘
```

---

## Component Timeline

### BEFORE
```
Session Start
    │
    ├─► Load config (hardcoded defaults)
    │
    ├─► Initialize LLM (direct instantiation)
    │
    ├─► Wait for request
    │
    └─► Workflow execution
        ├─► Planner (basic retry, generic errors)
        ├─► Executor (hardcoded tools, poor recovery)
        └─► Final Answer (returns void, loses context)
```

### AFTER
```
Session Start
    │
    ├─► Load & validate config from environment
    │   └─► Zod schema validation, clear errors
    │
    ├─► Initialize logger with level/format
    │   └─► Ready for structured output
    │
    ├─► Initialize tool registry
    │   └─► Load built-in and custom tools
    │
    ├─► Initialize LLM (singleton)
    │   └─► Single instance, configured
    │
    ├─► Start HTTP server
    │   └─► Ready for requests
    │
    └─► Handle request
        │
        ├─► [Request Flow]
        │   ├─► Validate input (Zod)
        │   ├─► Create context logger with request ID
        │   ├─► Start metrics timer
        │
        └─► Workflow execution
            │
            ├─► Planner
            │   ├─► Attempt 1: Generate plan
            │   ├─► Validate with cycle/reference checks
            │   ├─► On failure: Automatic retry with backoff
            │   └─► Propagate filters to dependent steps
            │
            ├─► Executor
            │   ├─► For each step:
            │   │   ├─► Validate dependencies resolved
            │   │   ├─► Get tool from registry
            │   │   ├─► Execute with timeout
            │   │   ├─► Validate output schema
            │   │   └─► On failure: Retry with backoff
            │   └─► Accumulate errors for context
            │
            └─► Final Answer
                ├─► Synthesize results
                ├─► Generate response
                └─► Return updated state with endTime & finalResult
                    │
                    └─► Response
                        ├─► Add request ID
                        ├─► Calculate duration
                        ├─► Include execution metrics
                        └─► Send to client
```

---

## Error Handling Flow

### BEFORE
```
Error Occurs
    │
    ▼
  Catch
    │
    ▼
console.error() ──► Maybe visible
    │
    ▼
throw new Error(generic message)
    │
    ▼
Express catches it
    │
    ▼
500 response with "Agent execution failed"
    │
    ▼
User has no context for debugging
```

### AFTER
```
Error Occurs
    │
    ├─► Is it an AgentError?
    │   │
    │   ├─[Yes]─► Extract code & context
    │   │         │
    │   │         └─► HTTP status from code
    │   │
    │   └─[No]───► Convert to AgentError
    │              ├─► Determine error code
    │              ├─► Attach cause
    │              └─► Add contextual metadata
    │
    ▼
Log error with request ID
    │
    ├─► Structured logging
    ├─► Full context available
    └─► Traceable across distributed logs
        │
        ▼
Build error response
    │
    ├─► Code: Specific code for consumption
    ├─► Message: Human-readable explanation
    ├─► Details: Context for debugging
    │   ├─► stepId
    │   ├─► missingDependency
    │   ├─► availableResults
    │   └─► cause (original error)
    └─► Metadata: Request tracking
        ├─► requestId
        ├─► duration
        └─► timestamp
            │
            ▼
Send HTTP response
    │
    ├─► Status code from error type
    ├─► Structured JSON body
    ├─► X-Request-ID header
    └─► User can debug or report issue
        │
        └─► Easy correlation with server logs
```

---

## New Capabilities

### BEFORE: Missing
```
❌ Request tracing across log stream
❌ Error codes for categorization
❌ Structured error context
❌ Custom error types
❌ Automatic retries
❌ Per-operation timeouts
❌ Tool extensibility
❌ Configuration validation
❌ Health endpoints
❌ Tool discovery
❌ Execution metrics
❌ Input validation
❌ State tracking
```

### AFTER: Available
```
✅ Request tracing (UUID in all logs)
✅ Error codes (16+ specific codes)
✅ Structured error context (step, dependency, etc.)
✅ Custom error types (ValidationError, ExecutorError, etc.)
✅ Automatic retries (3x plan, 2x step with backoff)
✅ Per-operation timeouts (LLM, tools, network)
✅ Tool extensibility (Registry pattern)
✅ Configuration validation (Zod schemas)
✅ Health endpoints (/healthz)
✅ Tool discovery (/tools)
✅ Execution metrics (duration, attempts)
✅ Input validation (goal length, format)
✅ State tracking (requestId, attempts, errors, timing)
```

---

## Summary Table

| Aspect | Before | After |
|--------|--------|-------|
| **Files** | 9 source | 17 source |
| **Lines** | ~1,000 | ~2,000 |
| **Config** | Hardcoded | Validated + defaults |
| **Error Codes** | 0 | 16+ |
| **Tool System** | Hardcoded | Dynamic registry |
| **Retry Logic** | Basic | Exponential backoff |
| **Logging** | Mixed | Unified + contextual |
| **Type Safety** | Partial | Comprehensive |
| **Request Tracing** | None | UUID-based |
| **Input Validation** | Minimal | Comprehensive |
| **Error Recovery** | None | Automatic retries |
| **API Docs** | None | 3 doc files |
| **Test Ready** | No | Yes |
| **Production Ready** | No | Yes |

---

## Deployment Readiness

### BEFORE: Prototype
```
⚠️  Hardcoded config
⚠️  No monitoring hooks
⚠️  Generic errors
⚠️  No tracing support
⚠️  No health checks
⚠️  No metrics
❌ Not production-ready
```

### AFTER: Production-Ready
```
✅ Environment config
✅ Structured logging
✅ Specific error codes  
✅ Request tracing support
✅ Health check endpoint
✅ Execution metrics
✅ Easy to add monitoring
✅ Deployment checklist included
✅ Production-ready!
```

---

**All diagrams © 2026 Refactoring Documentation**
