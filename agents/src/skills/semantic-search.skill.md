---
name: semantic-search
description: Meaning-based search using embeddings. "Find where I learned about microservices" "Tutorial about React hooks"
tools: semantic_search
---

# Semantic Search Skill

Find content by meaning, not just keywords. Uses vector embeddings.

## When to Use
- User asks about concepts, not specific words
- Looking for "things related to X"
- Finding tutorials, explanations, learning moments
- When exact keywords are unknown
- When FTS returns no results for conceptual queries

## How It Works

1. The query is converted to a 384-dimensional embedding vector
2. Vector similarity search finds chunks with similar meaning
3. Results are ranked by cosine similarity

## API Call Format

This skill uses the `semantic_search` tool, not raw SQL.

```json
{
  "query": "microservices architecture patterns",
  "limit": 20,
  "filters": {
    "app_names": ["Chrome", "Firefox", "Arc", "Safari"],
    "time_range": {
      "start": "2026-03-01T00:00:00Z",
      "end": "2026-03-11T23:59:59Z"
    }
  }
}
```

## Query Patterns

### Basic Semantic Search
```json
{
  "query": "React hooks tutorial useState useEffect",
  "limit": 20
}
```

### Browser-only Search (for learning content)
```json
{
  "query": "kubernetes deployment strategies",
  "limit": 20,
  "filters": {
    "app_names": ["Chrome", "Firefox", "Arc", "Safari", "Edge"]
  }
}
```

### Code Editor Search (for implementation)
```json
{
  "query": "authentication middleware implementation",
  "limit": 20,
  "filters": {
    "app_names": ["VS Code", "Cursor", "Zed", "IntelliJ", "WebStorm"]
  }
}
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
