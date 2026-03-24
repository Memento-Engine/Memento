---
name: web-search
description: Public web search for external or current information.
tools: web_search
---

# Web Search

Search the public web for external, current, or live information.

## When to Use
Use ONLY when user explicitly asks, or needs current events/live docs/release notes/public facts not in screen history.
Default to local search (sql/semantic/hybrid) for anything about the user's own activity.

## Action

```json
{"action": "webSearch", "query": "React 19 release notes official", "limit": 5}
```

## Tips
- Rewrite vague requests into concrete queries; prefer official sources
- Include time qualifiers if recency matters; keep query short
- Do NOT invent chunk citations for web results
- Can combine with local memory search when both are needed