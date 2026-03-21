---
name: web-search
description: Public web search for external, current, or non-local information.
tools: web_search
---

# Web Search Skill

Use this when the answer should come from the public web rather than the user's captured screen history.

## When to Use
- Current events, recent releases, breaking changes, live documentation
- Public facts, websites, official docs, blog posts, changelogs
- External verification when local results are missing or clearly not relevant
- Questions that are not about the user's past activity

## When Not to Use
- Questions about what the user did, saw, wrote, or opened in the past
- Requests that should be answered from local screen history
- Cases where local search already provides the evidence

## Execution Pattern

Call the `web_search` tool with a focused public-web query.

```json
{
  "query": "React 19 release notes official",
  "limit": 5
}
```

## Query Guidance

- Rewrite vague requests into concrete public-web queries
- Prefer official sources when the user asks about APIs, releases, or documentation
- Include time qualifiers if recency matters
- Keep the query short and specific

## Examples

| User Query | Web Query |
|------------|-----------|
| "What changed in React 19?" | "React 19 release notes official" |
| "Latest Tavily pricing" | "Tavily pricing official" |
| "Next.js 16 release notes" | "Next.js 16 release notes" |

## Result Handling

- Use returned titles, URLs, and snippets as evidence
- Summarize the findings directly
- Do not fabricate chunk citations for web-only results