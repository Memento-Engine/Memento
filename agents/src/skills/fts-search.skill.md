---
name: fts-search
description: Full-text keyword search using FTS5. "Find mentions of error 404" "Search for meeting notes"
tools: sql_execute
---

# FTS Search Skill

Fast keyword-based search using SQLite FTS5 index.

## When to Use
- User wants to find specific keywords or phrases
- Exact text matching is needed
- Searching for error messages, code snippets, specific terms

## Query Patterns

**IMPORTANT:** Always include `c.id as chunk_id` in SELECT statements for citations.

### Basic FTS Search
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  c.text_content,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched_text
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'error'
ORDER BY f.captured_at DESC
LIMIT 20;
```

### Multi-term Search (AND)
```sql
SELECT 
  c.id as chunk_id,
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  c.text_content,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched_text
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'authentication AND error'
ORDER BY f.captured_at DESC
LIMIT 20;
```

### Phrase Search (exact phrase)
```sql
SELECT 
  c.id as chunk_id,
  f.captured_at,
  f.app_name,
  f.browser_url,
  f.image_path,
  c.text_content,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched_text
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH '"connection refused"'
ORDER BY f.captured_at DESC
LIMIT 20;
```

### Search with App Filter
```sql
SELECT 
  c.id as chunk_id,
  f.captured_at,
  f.window_title,
  f.browser_url,
  f.image_path,
  c.text_content,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched_text
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'TODO'
  AND f.app_name IN ('VS Code', 'Cursor', 'Zed')
ORDER BY f.captured_at DESC
LIMIT 20;
```

### Search with Time Range
```sql
SELECT 
  c.id as chunk_id,
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  c.text_content,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched_text
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'budget'
  AND date(f.captured_at) = date('now')
ORDER BY f.captured_at DESC
LIMIT 20;
```

### Count Occurrences by Day
```sql
SELECT 
  MIN(c.id) as chunk_id,  -- REQUIRED for citations
  date(f.captured_at) as day,
  COUNT(*) as mentions
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'screenpipe'
GROUP BY day
ORDER BY day DESC
LIMIT 14;
```

### Count Occurrences by App
```sql
SELECT 
  MIN(c.id) as chunk_id,  -- REQUIRED for citations
  f.app_name,
  COUNT(*) as mentions
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'deadline'
  AND date(f.captured_at) >= date('now', '-7 days')
GROUP BY f.app_name
ORDER BY mentions DESC
LIMIT 10;
```

## FTS5 Syntax Reference

| Syntax | Meaning | Example |
|--------|---------|---------|
| `term` | Single term | `error` |
| `term1 term2` | Implicit AND | `auth error` |
| `term1 AND term2` | Explicit AND | `auth AND error` |
| `term1 OR term2` | Either term | `error OR exception` |
| `NOT term` | Exclude term | `error NOT warning` |
| `"exact phrase"` | Phrase match | `"connection refused"` |
| `prefix*` | Prefix match | `config*` matches configure, configuration |
| `NEAR(t1 t2, N)` | Terms within N tokens | `NEAR(auth error, 5)` |

## Output Format

Return results as a markdown table or structured list:

```markdown
## Search Results for "[query]"

Found X matches:

| Time | App | Window | Matched Text |
|------|-----|--------|--------------|
| 2026-03-11 14:30 | VS Code | auth.ts | ...>>>error<<<: invalid token... |
```

## Error Handling

If FTS returns no results:
1. Try broader terms (remove specific qualifiers)
2. Try OR instead of AND
3. Try prefix matching with `*`
4. Suggest semantic search as alternative
