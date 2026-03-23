---
name: web-search
description: Public web search for external or current information.
tools: web_search
---

# Web Search

Search the public web for external, current, or live information.

## When to Use (Only When Needed)
- User explicitly asks for web search or external research
- Current events, recent releases, live docs
- Public facts, official websites, changelogs that user didn't capture
- External verification of uncertain info
- Questions NOT about user's past activity

## When NOT to Use (Default)
- User's local queries and personal workspace questions
- Questions about what user did/saw/wrote (use screen history)
- Requests answerable from captured screen history
- Code debugging, local project setup, personal data analysis

## Action

```json
{"action": "webSearch", "query": "React 19 release notes official", "limit": 5}
```

## Tips
- Rewrite vague requests into concrete web queries
- Prefer official sources for APIs/releases
- Include time qualifiers if recency matters
- Keep query short and specific
- Do NOT invent chunk citations for web results

## Proactive Use

Only use web search alongside memory searches when:
- Query explicitly requires both personal history AND external facts
- Local screen capture data alone is insufficient
- User benefit clearly justifies the extra cost/latency

Otherwise, default to local search only.