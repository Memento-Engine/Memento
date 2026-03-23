---
name: hybrid-search
description: Combines FTS and semantic search. Default for most queries.
tools: sql_execute, semantic_search
---

# Hybrid Search

Combines keyword (FTS) and meaning (semantic) search.

## When to Use
- General search queries
- When unsure if exact match or concept
- Complex queries benefiting from both
- Default when query type is ambiguous

## Strategy

1. Run FTS for exact keyword matches
2. Run semantic for conceptual matches
3. Merge and deduplicate by chunk_id
4. Boost items appearing in both

## Action: hybrid

```json
{
  "action": "hybrid",
  "query": "microservices architecture",
  "keywords": ["microservices", "docker", "kubernetes"],
  "limit": 20,
  "filters": {
    "app_names": ["Chrome", "VS Code"]
  }
}
```

## Notes
- `query` drives semantic similarity
- `keywords` drive FTS matching
- Results merged by the orchestrator
- Use when both keywords AND concepts present
  }
}
```

### "Find code where I implemented authentication"

**FTS Query:**
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  SUBSTR(c.text_content, 1, 150) as preview,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as text
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'authentication OR auth OR login'
  AND f.app_name IN ('VS Code', 'Cursor', 'Zed')
ORDER BY f.captured_at DESC
LIMIT 30;
```

**Semantic Query:**
```json
{
  "query": "implementing user authentication login session management",
  "limit": 30,
  "filters": {
    "app_names": ["VS Code", "Visual Studio Code", "Cursor", "Zed"]
  }
}
```

## APP NAME ALIASES - ALWAYS EXPAND!

When filtering by app name, include ALL known variants:

| User Says | Search For |
|-----------|------------|
| "VS Code" | VS Code, Visual Studio Code, Code, VSCode |
| "Chrome" | Chrome, Google Chrome |
| "Twitter" | Twitter, X, twitter.com, x.com |
| "Terminal" | Terminal, iTerm, iTerm2, Warp, Alacritty |

**Rebranded Apps (search BOTH names):**
- Twitter → X (search both)
- Facebook → Meta (search both)

**Browser Category:**
```sql
WHERE app_name IN ('Chrome', 'Google Chrome', 'Firefox', 'Mozilla Firefox', 'Arc', 'Safari', 'Edge', 'Microsoft Edge', 'Brave')
```

**Code Editor Category:**
```sql
WHERE app_name IN ('VS Code', 'Visual Studio Code', 'Code', 'Cursor', 'Zed', 'IntelliJ IDEA', 'IntelliJ', 'WebStorm', 'PyCharm')
```

## Multi-Step Reasoning

Hybrid search often requires a reasoning step to merge results:

```
Step 1: FTS search for exact keywords
Step 2: Semantic search for concepts  
Step 3: REASON - merge results, identify best matches, synthesize answer
```

The REASON step:
- Has access to both FTS and semantic results
- Deduplicates by chunk_id
- Boosts overlapping results
- Constructs final answer

## Output Format

```markdown
## Hybrid Search Results for "[query]"

### High Confidence Matches (FTS + Semantic)
These appeared in both keyword and semantic results:

1. **VS Code - auth.service.ts** (2026-03-11 14:30)
   - FTS: "...implementing >>>authentication<<< middleware..."
   - Semantic similarity: 0.89

### Keyword Matches (FTS only)
2. **Chrome - Auth0 Docs** (2026-03-10 11:00)
   - "...>>>auth<<< token refresh..."

### Conceptual Matches (Semantic only)  
3. **Chrome - JWT Tutorial** (2026-03-09 15:30)
   - About: token-based security (similarity: 0.82)
```

## When to Skip Hybrid

Use FTS only:
- User asks for exact error message
- Searching for specific code snippets
- Looking for file names

Use Semantic only:
- User asks conceptual question
- "Explain...", "Tutorial about...", "How does X work"
- When FTS returns no results
