---
name: semantic-search
description: Meaning-based search using embeddings. "Find where I learned about microservices"
tools: semantic_search
---

# Semantic Search

Find content by meaning using vector embeddings.

## When to Use
- Conceptual queries: "where I learned about X", "my coding session"
- Fuzzy concepts without exact keywords
- When FTS returns empty for conceptual terms

## Action Format

```json
{
  "action": "semantic",
  "query": "microservices architecture patterns",
  "limit": 20,
  "filters": {
    "app_names": ["Chrome", "VS Code", "Visual Studio Code"],
    "time_range": {
      "start": "2026-03-01T00:00:00Z",
      "end": "2026-03-11T23:59:59Z"
    }
  }
}
```

## Rules
- Always include all app name variants: `VS Code` + `Visual Studio Code`; `X` + `Twitter`
- Use `time_range` for recency constraints
- Cannot do exact phrase matching — use FTS for that
- Write the query as a descriptive phrase, not keywords: "implementing user authentication" not "auth login"
