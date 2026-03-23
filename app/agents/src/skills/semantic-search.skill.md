---
name: semantic-search
description: Meaning-based search using embeddings. "Find where I learned about microservices"
tools: semantic_search
---

# Semantic Search

Find content by meaning using vector embeddings.

## When to Use
- Conceptual queries: "where I learned about X"
- Fuzzy concepts without exact keywords
- Finding related content
- When FTS returns empty for concepts

## API Format

```json
{
  "query": "microservices architecture patterns",
  "limit": 20,
  "filters": {
    "app_names": ["Chrome", "Firefox", "Arc"],
    "time_range": {
      "start": "2026-03-01T00:00:00Z",
      "end": "2026-03-11T23:59:59Z"
    }
  }
}
```

## App Name Aliases

**Always include ALL variants:**
- VS Code / Visual Studio Code / Code / VSCode
- Chrome / Google Chrome
- Cursor / Cursor AI
- Terminal / iTerm / iTerm2 / Warp
- X / Twitter (search both!)

## Tips
- Use for browsers when searching learning content
- Use for editors when searching code concepts
- Combine with time_range for recency
```

### Time-bounded Search
```json
{
  "query": "database migration scripts",
  "limit": 20,
  "filters": {
    "time_range": {
      "start": "2026-03-10T00:00:00Z"
    }
  }
}
```

## Example Queries and Interpretations

| User Query | Semantic Search Query |
|------------|----------------------|
| "Where did I learn about microservices?" | "microservices architecture tutorial explanation" |
| "Find the page about shared types" | "shared types TypeScript frontend backend API" |
| "Tutorial for LangGraph workflows" | "LangGraph workflow nodes tutorial guide" |
| "How does React context work?" | "React context provider consumer state management" |

## Combining with SQL

After semantic search returns chunks, you may need SQL to:
1. Get more context (surrounding frames)
2. Filter by app/time
3. Aggregate results

```sql
-- Get surrounding frames for context (semantic search returns chunk_ids)
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  c.text_content
FROM chunks c
JOIN frames f ON c.frame_id = f.id
WHERE c.id IN (123, 456, 789)  -- IDs from semantic search
ORDER BY f.captured_at
LIMIT 50;
```

## Output Format

```markdown
## Semantic Search Results for "[query]"

Found X relevant matches (similarity score):

### 1. [App] - [Window Title] (0.87)
**Time:** 2026-03-11 14:30
**Content:** [relevant excerpt]

### 2. [App] - [Window Title] (0.82)
...
```

## Limitations

- Cannot do exact phrase matching (use FTS for that)
- May return conceptually related but not exactly matching content
- Requires embedding model to be available
- Vector search is separate from SQL - cannot use in JOINs directly
