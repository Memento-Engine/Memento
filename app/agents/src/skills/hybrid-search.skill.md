---
name: hybrid-search
description: Combines FTS and semantic search for best results. Default for most queries.
tools: sql_execute, semantic_search
---

# Hybrid Search Skill

Combines keyword-based FTS and meaning-based semantic search for optimal results.

## When to Use
- Most general search queries
- When unsure if user wants exact match or conceptual match
- Complex queries that benefit from both approaches
- Default choice when query type is ambiguous

## Strategy

1. **Run both searches in parallel:**
   - FTS for exact keyword matches
   - Semantic for conceptual matches

2. **Merge and deduplicate results:**
   - Combine results by chunk_id
   - Boost items that appear in both

3. **Rank by combined score:**
   - FTS provides precision (exact matches)
   - Semantic provides recall (related content)

## Execution Pattern

**IMPORTANT:** Always include `c.id as chunk_id` in SELECT statements for citations.

### Step 1: FTS Search
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  SUBSTR(c.text_content, 1, 150) as preview,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched_text,
  1.0 as fts_score
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'microservices architecture'
ORDER BY f.captured_at DESC
LIMIT 30;
```

### Step 2: Semantic Search
```json
{
  "query": "microservices architecture design patterns",
  "limit": 30
}
```

### Step 3: Merge Results (reasoning step)

The LLM receives both result sets and:
1. Identifies overlapping chunks (high confidence matches)
2. Ranks unique FTS results (exact matches)
3. Ranks unique semantic results (conceptual matches)
4. Returns merged, deduplicated list

## Query Examples

### "What did I learn about microservices?"

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
WHERE chunks_fts MATCH 'microservices'
ORDER BY f.captured_at DESC
LIMIT 30;
```

**Semantic Query:**
```json
{
  "query": "learning microservices architecture distributed systems",
  "limit": 30,
  "filters": {
    "app_names": ["Chrome", "Firefox", "Arc", "Safari"]
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
