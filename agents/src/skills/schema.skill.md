---
name: database-schema
description: Reference schema for the screen activity database. Must be read before generating any SQL queries.
---

# Database Schema Reference

This skill provides the database schema that must be understood before generating SQL queries.

## Tables

### frames
The timeline of captured screen frames.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| captured_at | DATETIME | When the frame was captured (local time) |
| app_name | TEXT | Application name (e.g., 'VS Code', 'Chrome') |
| window_title | TEXT | Window title |
| is_focused | BOOLEAN | Whether the window was actively focused |
| browser_url | TEXT | URL if browser, NULL otherwise |
| window_x | INTEGER | Window X position |
| window_y | INTEGER | Window Y position |
| window_width | INTEGER | Window width |
| window_height | INTEGER | Window height |
| monitor_height | INTEGER | Monitor height |
| monitor_width | INTEGER | Monitor width |
| image_path | TEXT | Path to screenshot file |

**Indexes:**
- `idx_frames_created_at ON frames(captured_at)`
- `idx_frames_app_name ON frames(app_name)`

### chunks
Structured text content extracted from frames via OCR.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| frame_id | INTEGER | Foreign key to frames.id |
| text_content | TEXT | Clean extracted text block |
| text_json | TEXT | JSON with position/layout data |

**Indexes:**
- `idx_chunks_frame_id ON chunks(frame_id)`

### chunks_fts (FTS5 Virtual Table)
Full-text search index on chunks. Use for keyword-based search.

| Column | Type | Description |
|--------|------|-------------|
| rowid | INTEGER | Maps to chunks.id |
| text_content | TEXT | Indexed text for FTS5 MATCH |

**Usage:**
```sql
-- FTS5 search (always include chunk_id)
SELECT 
  c.id as chunk_id,  -- REQUIRED for every SQL query
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  c.text_content
FROM chunks_fts 
JOIN chunks c ON chunks_fts.rowid = c.id
JOIN frames f ON c.frame_id = f.id
WHERE chunks_fts MATCH 'search terms'
LIMIT 20;
```

### vec_chunks (Vector Index)
Semantic embedding index for similarity search. Requires sqlite-vec extension.

| Column | Type | Description |
|--------|------|-------------|
| chunk_id | INTEGER | Maps to chunks.id |
| embedding | float[384] | 384-dimensional embedding vector |

**Usage:**
Semantic search is done via a separate API call, not raw SQL.

## Common Join Patterns

**CRITICAL REQUIREMENT:** Every SQL query MUST include `c.id as chunk_id` (or `MIN(c.id) as chunk_id` for aggregates). This is mandatory for citations - the agent cannot provide source references without chunk_id.

- For queries joining chunks: Use `c.id as chunk_id`
- For queries only on frames: Add `LEFT JOIN chunks c ON c.frame_id = f.id` and select `c.id as chunk_id`
- For aggregate queries with GROUP BY: Use `MIN(c.id) as chunk_id` to get a representative chunk

```sql
-- Get text content with frame metadata (ALWAYS include chunk_id)
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations [[chunk_id]]
  f.captured_at,
  f.app_name,
  f.window_title,
  f.browser_url,
  c.text_content,
  f.image_path
FROM chunks c
JOIN frames f ON c.frame_id = f.id
WHERE ...
ORDER BY f.captured_at DESC
LIMIT 20;
```

## Important Notes

1. **Always use LIMIT** - Queries without LIMIT may return millions of rows
2. **Time format** - captured_at is in local time: `'YYYY-MM-DD HH:MM:SS'`
3. **Date functions** - Use `date(captured_at)` for day, `strftime('%H', captured_at)` for hour
4. **FTS5 syntax** - Use `MATCH` operator, supports `AND`, `OR`, `NOT`, phrase matching with quotes
5. **Case sensitivity** - App names are case-sensitive as captured from OS
