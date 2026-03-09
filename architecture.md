# AI Gateway Architecture

## Overview

This repository now uses a gateway-first LLM architecture:

**Agents → AI Gateway → LLM Providers**

The `agents` service is responsible only for workflow orchestration (planning, execution, tool calling, and answer synthesis). The new `ai-gateway` service is the only component that can call external LLM providers.

---

## Why this architecture

The refactor separates concerns:

- `agents` focuses on orchestration logic
- `ai-gateway` centralizes model/provider behavior
- provider credentials and routing are removed from `agents`
- limits/usage/fallback become enforceable at one boundary

This enables safer scaling to multi-provider support, billing, and policy enforcement.

---

## Current Components

## 1) Agents Service

Location: `agents/`

### Responsibilities

- plan generation
- step execution
- tool invocation
- final response synthesis

### Non-responsibilities (after refactor)

- no OpenRouter/OpenAI/Anthropic/Gemini direct calls
- no provider API key usage
- no provider fallback decisioning
- no model routing tables

### Integration contract with gateway

Agents now call only:

- `POST /v1/chat` on `ai-gateway`

The integration is implemented in:

- `agents/src/llm/routing.ts`

Configuration used by agents is now gateway-focused only:

- `AI_GATEWAY_URL`
- `AI_GATEWAY_TIMEOUT_MS`
- `AI_GATEWAY_USER_ID`

---

## 2) AI Gateway Service

Location: `ai-gateway/`

### Responsibilities

- request validation
- model selection by role
- fallback model retries
- provider adapter dispatch
- per-user usage tracking
- per-tier rate limiting

### Public endpoint

- `POST /v1/chat`

### Health endpoint

- `GET /health`

---

## API Contract

## Request: `POST /v1/chat`

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "model": "openai/gpt-4o-mini",
  "temperature": 0,
  "max_tokens": 900,
  "user_id": "agents-service",
  "role": "planner"
}
```

### Field notes

- `messages` is required
- `model` is optional; if omitted, gateway selects by `role`
- `temperature` defaults inside gateway if omitted
- `max_tokens` defaults inside gateway if omitted
- `user_id` is required and used for usage/rate limiting
- `role` is optional but recommended (`planner`, `executor`, `final`) so gateway can apply role-specific model policy

## Response

```json
{
  "id": "uuid",
  "model": "openai/gpt-4o-mini",
  "content": "...",
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 300,
    "total_tokens": 420
  },
  "fallback_used": false,
  "attempts": 1
}
```

---

## Internal Gateway Architecture

## A) Config Layer

File: `ai-gateway/src/config.ts`

Holds all model/provider policy:

- provider endpoints and keys
- role-based default + fallback models
- role max output tokens
- default temperature and token defaults
- free/pro limit policies

Key env vars (examples):

- `AI_GATEWAY_OPENROUTER_API_KEY`
- `AI_GATEWAY_OPENROUTER_BASE_URL`
- `AI_GATEWAY_PLANNER_MODEL`
- `AI_GATEWAY_EXECUTOR_FALLBACKS`
- `AI_GATEWAY_FREE_RPM`
- `AI_GATEWAY_FREE_DAILY_TOKENS`
- `AI_GATEWAY_PRO_USERS`

## B) Provider Adapter Layer

Files:

- `ai-gateway/src/providers/provider.ts`
- `ai-gateway/src/providers/openrouter.adapter.ts`

Pattern:

- `LlmProviderAdapter` interface defines provider contract
- each provider has a dedicated adapter
- `OpenRouterAdapter` currently implemented

This structure is designed for incremental addition of:

- OpenAI adapter
- Anthropic adapter
- Gemini adapter

without changing the API surface used by agents.

## C) Model Router + Fallback

File: `ai-gateway/src/modelRouter.ts`

Flow:

1. determine candidate model list
2. if explicit `model` is provided, use that as single candidate
3. otherwise choose role default + fallback list
4. try each candidate sequentially
5. return first successful response
6. if all fail, return error

The response includes:

- `fallback_used`
- `attempts`

so callers and telemetry can see failover behavior.

## D) Usage Tracking

File: `ai-gateway/src/usageTracker.ts`

Tracked per request:

- `user_id`
- `model`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `timestamp`

Current implementation uses in-memory records.

## E) Rate Limiting

File: `ai-gateway/src/rateLimiter.ts`

Tier model:

- free
- pro

Enforced limits:

- requests per minute
- daily token budget

Tier resolution currently uses configured pro user IDs.

---

## End-to-End Request Flow

1. `agents` builds prompt messages for planner/executor/final role
2. `agents` calls `POST /v1/chat` on gateway
3. gateway validates payload
4. gateway checks user tier and rate/token limits
5. gateway selects candidate models
6. gateway invokes provider adapter (OpenRouter)
7. on failure, gateway retries fallback models
8. gateway records usage for successful request
9. gateway returns normalized response to agents
10. agents continue workflow using returned content

---

## What moved from Agents to Gateway

Moved out of `agents`:

- OpenRouter integration details
- provider base URLs and API keys
- model selection and fallback chains
- provider routing logic
- temperature/model default policy

Kept in `agents`:

- workflow nodes (planner/executor/final)
- tool calling
- orchestration safeguards (`maxLlmCalls`, retries)

---

## Security and Policy Benefits

- single outbound LLM boundary
- provider credentials are isolated to gateway
- centralized place for abuse controls and billing logic
- consistent fallback behavior across all agent roles

---

## Multi-Provider Roadmap

To add a provider:

1. create a new adapter implementing `LlmProviderAdapter`
2. register adapter in gateway server startup
3. extend model-to-provider inference/routing
4. configure provider env vars

No changes are required in `agents` when adding providers.

---

## Operational Notes

## Run gateway

From repo root:

- `npm --prefix ai-gateway run dev`

## Run agents

From repo root:

- `npm --prefix agents run dev:agent`

Ensure `AI_GATEWAY_URL` in agents points to the gateway host/port.

---

## Future hardening recommendations

- persist usage in database (replace in-memory tracker)
- add distributed rate limiting (Redis)
- add provider-specific circuit breakers
- add request/response audit logging with PII controls
- add streaming response mode for low-latency UX
- add auth between agents and gateway (service tokens or mTLS)
