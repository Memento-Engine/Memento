---
name: database-schema
description: Database schema reference for SQL queries.
---

# Database Schema

## Tables

### frames
Screen captures timeline.
- `id` INTEGER PK
- `captured_at` DATETIME (local time)
- `app_name` TEXT
- `window_title` TEXT
- `browser_url` TEXT (NULL if not browser)
- `is_focused` BOOLEAN
- `image_path` TEXT

### chunks
OCR-extracted text from frames.
- `id` INTEGER PK
- `frame_id` INTEGER FK → frames.id
- `text_content` TEXT
- `text_json` TEXT (position data)

### chunks_fts
FTS5 index on chunks.text_content.
- `rowid` → chunks.id
- Use `MATCH` for keyword search

### vec_chunks
Vector embeddings (384-dim). Use semantic_search tool.

## Critical Rule

**Every query MUST include `c.id as chunk_id` for citations.**

```sql
SELECT c.id as chunk_id, f.captured_at, f.app_name,
  SUBSTR(c.text_content, 1, 150) as preview
FROM chunks c JOIN frames f ON c.frame_id = f.id
WHERE ... ORDER BY f.captured_at DESC LIMIT 20;
```

## Notes
- Always use LIMIT
- captured_at is local time: 'YYYY-MM-DD HH:MM:SS'
- App names are case-sensitive
