---
name: fts-search
description: Full-text keyword search using FTS5. "Find mentions of error 404" "Search for meeting notes"
tools: sql_execute
---

# FTS Search

Fast keyword-based search using SQLite FTS5 index.

## When to Use
- Specific keywords, phrases, error messages
- Exact text or code snippet matching
- Counting keyword occurrences

## Canonical Pattern

```sql
SELECT c.id as chunk_id, f.captured_at, f.app_name, f.window_title,  -- chunk_id required
  SUBSTR(c.text_content, 1, 150) as preview,
  snippet(chunks_fts, 0, '>>>', '<<<', '...', 40) as matched
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'search_term'
  AND f.app_name IN ('VS Code', 'Cursor')
  AND date(f.captured_at) = date('now')
ORDER BY f.captured_at DESC LIMIT 20;
```

## FTS5 Operators
- `t1 t2` AND · `t1 OR t2` OR · `NOT t` exclude
- `"exact phrase"` phrase · `prefix*` prefix · `NEAR(t1 t2, N)` proximity

## Tips
- For URLs/domains use `browser_url LIKE '%github.com%'` — not MATCH
- Quote dotted terms in MATCH: `'"github.com"'`
- If empty → broaden terms, then try semantic or hybrid
