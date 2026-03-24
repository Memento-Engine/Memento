---
name: temporal-query
description: Query by time and sequences. "What was I doing at 3pm?" "What happened after X?"
tools: sql_execute
---

# Temporal Query

Query screen activity by time, sequences, and temporal relationships.

## When to Use
- Specific times: "at 3pm", "yesterday morning"
- Sequences: "after X", "before the meeting"
- Durations: "longest session", "how long"

## Patterns

**Always include `c.id as chunk_id` for citations.**

```sql
-- Activity at specific time
SELECT c.id as chunk_id, f.captured_at, f.app_name, f.window_title,
  SUBSTR(c.text_content, 1, 150) as preview
FROM frames f LEFT JOIN chunks c ON c.frame_id = f.id
WHERE f.captured_at BETWEEN '2026-03-11 15:00:00' AND '2026-03-11 15:30:00'
ORDER BY f.captured_at LIMIT 30;

-- After an event (CTE pattern)
WITH anchor AS (
  SELECT f.captured_at as anchor_time
  FROM chunks_fts JOIN chunks c ON chunks_fts.rowid = c.id
  JOIN frames f ON c.frame_id = f.id
  WHERE chunks_fts MATCH 'keyword' ORDER BY f.captured_at DESC LIMIT 1
)
SELECT c.id as chunk_id, f.* FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id CROSS JOIN anchor
WHERE f.captured_at > anchor.anchor_time
  AND f.captured_at < datetime(anchor.anchor_time, '+30 minutes')
LIMIT 20;
```

## Time Functions
- `date('now')` - today
- `date('now', '-1 day')` - yesterday
- `strftime('%H', captured_at)` - hour
- `datetime('now', '-7 days')` - week ago
  f.window_title,
  f.browser_url,
  f.image_path,
  SUBSTR(c.text_content, 1, 150) as preview
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
CROSS JOIN anchor
WHERE f.captured_at < anchor.anchor_time
  AND f.captured_at > datetime(anchor.anchor_time, '-30 minutes')
ORDER BY f.captured_at DESC
LIMIT 20;
```

### First and Last Activity of Day
```sql
SELECT 
  MIN(c.id) as chunk_id,  -- REQUIRED for citations
  MIN(f.captured_at) as first_activity,
  MAX(f.captured_at) as last_activity,
  (julianday(MAX(f.captured_at)) - julianday(MIN(f.captured_at))) * 24 as hours_active
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now');
```

### Timeline of App Usage
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  strftime('%H:%M', f.captured_at) as time,
  f.app_name,
  f.window_title
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now')
GROUP BY strftime('%H', f.captured_at), f.app_name
ORDER BY f.captured_at
LIMIT 50;
```

### Browser Tabs During a Session
**Use Case:** "What tabs did I open during my coding session?"

```sql
WITH coding_session AS (
  SELECT 
    MIN(captured_at) as session_start,
    MAX(captured_at) as session_end
  FROM frames
  WHERE app_name IN ('VS Code', 'Cursor', 'Zed')
    AND date(captured_at) = date('now', '-1 day')
)
SELECT DISTINCT
  c.id as chunk_id,  -- REQUIRED for citations
  f.captured_at,
  f.window_title,
  f.browser_url
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
CROSS JOIN coding_session cs
WHERE f.app_name IN ('Chrome', 'Firefox', 'Arc', 'Safari', 'Edge')
  AND f.captured_at BETWEEN cs.session_start AND cs.session_end
ORDER BY f.captured_at
LIMIT 30;
```

## Time Parsing Reference

| User Says | SQL Filter |
|-----------|------------|
| "today" | `date(captured_at) = date('now')` |
| "yesterday" | `date(captured_at) = date('now', '-1 day')` |
| "this week" | `date(captured_at) >= date('now', '-7 days')` |
| "at 3pm" | `strftime('%H', captured_at) = '15'` |
| "morning" | `strftime('%H', captured_at) BETWEEN '06' AND '12'` |
| "afternoon" | `strftime('%H', captured_at) BETWEEN '12' AND '18'` |
| "evening" | `strftime('%H', captured_at) BETWEEN '18' AND '22'` |
| "last hour" | `captured_at >= datetime('now', '-1 hour')` |

## Multi-Step Temporal Queries

Some temporal queries require LLM reasoning between steps:

**Example:** "Find my coding session yesterday, then show what I researched"

```
Step 1: SQL - Find coding session boundaries
  → Returns: session_start = 14:00, session_end = 18:00

Step 2: REASON - Interpret session times

Step 3: SQL - Query browser activity during session
  → Uses the interpreted times from step 1
```

This requires multi-step because "coding session" is fuzzy and needs interpretation.

## Conditional Branching

**If anchor not found:**
- CTE returns 0 rows
- Main query returns nothing
- Skill should detect this and report "anchor event not found"

```sql
-- Check if anchor exists first
SELECT COUNT(*) as anchor_found
FROM chunks_fts
WHERE chunks_fts MATCH 'microservices';
```

If `anchor_found = 0`, skip the temporal query and inform user.

## Output Format

```markdown
## Timeline: [Time Period]

### [Time] - [App]
**Window:** [title]
**Content:** [preview]

### [Time] - [App]
...

---
**Summary:** You started at X, worked on Y, then switched to Z.
```
