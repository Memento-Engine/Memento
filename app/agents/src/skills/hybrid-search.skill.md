---
name: hybrid-search
description: Combines FTS and semantic search. Default for most queries.
tools: sql_execute, semantic_search
---

# Hybrid Search

Combines keyword (FTS) and meaning (semantic) search for best coverage.

## When to Use
- General queries where you're unsure of exact keywords
- Both keywords AND concepts present
- Default fallback when query type is ambiguous
- After SQL returns empty

## Action Format

```json
{
  "action": "hybrid",
  "query": "implement authentication login",
  "keywords": ["authentication", "auth", "login"],
  "limit": 20,
  "filters": {
    "app_names": ["VS Code", "Visual Studio Code", "Cursor"]
  }
}
```

- `query` → drives semantic (vector) matching
- `keywords` → drives FTS keyword matching
- Results are merged and deduplicated by `chunk_id`

## App Name Aliases
Always include all variants: `VS Code` + `Visual Studio Code`; `Chrome` + `Google Chrome`; `X` + `Twitter`.

## When to Skip Hybrid
- **FTS only**: exact error message, specific code snippet or file name
- **Semantic only**: purely conceptual question, "explain...", "tutorial about...", FTS returned empty
