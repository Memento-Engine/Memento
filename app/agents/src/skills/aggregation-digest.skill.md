---
name: aggregation-digest
description: Aggregate and summarize activity. "What apps did I use today?" "Time breakdown this week"
tools: sql_execute
---

# Aggregation & Digest Skill

Generate summaries, statistics, and aggregated views of screen activity.

## ReAct Executor Note
- This is a reference skill, not an executor action.
- When following this skill inside the ReAct loop, emit action `sql`, never `aggregation-digest`.

## When to Use
- User asks for summaries ("What did I work on today?")
- User wants statistics ("How much time on X?")
- User asks about patterns ("Which apps do I use most?")
- User wants a digest or overview

## Query Patterns

**IMPORTANT:** Always include `c.id as chunk_id` in SELECT statements for citations.

### App Usage Breakdown (Time Estimate)
```sql
SELECT
  c.id as chunk_id,  -- REQUIRED for citations
  f.app_name,
  COUNT(*) as frames,
  ROUND(COUNT(*) * 5.0 / 60, 1) as approx_minutes
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now')
GROUP BY f.app_name
ORDER BY frames DESC
LIMIT 15;
```

### App Usage by Day (Weekly View)
```sql
SELECT
  c.id as chunk_id,  -- REQUIRED for citations
  date(f.captured_at) as day,
  f.app_name,
  COUNT(*) as frames,
  ROUND(COUNT(*) * 5.0 / 60, 1) as approx_minutes
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE f.captured_at >= datetime('now', '-7 days')
GROUP BY day, f.app_name
ORDER BY day DESC, frames DESC;
```

### Most Visited Windows/URLs
```sql
SELECT
  c.id as chunk_id,  -- REQUIRED for citations
  f.app_name,
  f.window_title,
  f.browser_url,
  COUNT(*) as visits
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now')
  AND f.browser_url IS NOT NULL
GROUP BY f.browser_url
ORDER BY visits DESC
LIMIT 20;
```

### Focus Time Analysis (Continuous App Usage)
```sql
WITH sessions AS (
  SELECT 
    f.id as frame_id,
    f.app_name,
    f.captured_at,
    CASE 
      WHEN f.app_name != LAG(f.app_name) OVER (ORDER BY f.captured_at)
        OR f.captured_at > datetime(LAG(f.captured_at) OVER (ORDER BY f.captured_at), '+2 minutes')
      THEN 1 ELSE 0 
    END as new_session
  FROM frames f
  WHERE date(f.captured_at) = date('now')
),
session_groups AS (
  SELECT 
    frame_id,
    app_name,
    captured_at,
    SUM(new_session) OVER (ORDER BY captured_at) as session_id
  FROM sessions
)
SELECT 
  MIN(c.id) as chunk_id,  -- REQUIRED for citations
  sg.app_name,
  MIN(sg.captured_at) as session_start,
  MAX(sg.captured_at) as session_end,
  COUNT(*) as frames,
  ROUND((julianday(MAX(sg.captured_at)) - julianday(MIN(sg.captured_at))) * 24 * 60, 1) as duration_minutes
FROM session_groups sg
LEFT JOIN chunks c ON c.frame_id = sg.frame_id
GROUP BY sg.session_id, sg.app_name
HAVING duration_minutes > 10
ORDER BY duration_minutes DESC
LIMIT 10;
```

### Content Samples by App
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  f.app_name,
  f.window_title,
  f.browser_url,
  f.image_path,
  f.captured_at,
  substr(c.text_content, 1, 200) as sample
FROM chunks c
JOIN frames f ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now')
GROUP BY f.app_name
LIMIT 10;
```

### Hourly Activity Heatmap
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  strftime('%H', f.captured_at) as hour,
  COUNT(*) as activity_level
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now')
GROUP BY hour
ORDER BY hour;
```

### Topic Frequency (What You Worked On)
```sql
SELECT 
  c.id as chunk_id,  -- REQUIRED for citations
  CASE 
    WHEN c.text_content LIKE '%error%' OR c.text_content LIKE '%exception%' THEN 'Debugging'
    WHEN c.text_content LIKE '%test%' THEN 'Testing'
    WHEN c.text_content LIKE '%meeting%' OR f.app_name IN ('Zoom', 'Teams', 'Slack') THEN 'Communication'
    WHEN f.app_name IN ('VS Code', 'Cursor', 'Zed') THEN 'Coding'
    WHEN f.app_name IN ('Chrome', 'Firefox', 'Safari') THEN 'Browsing'
    ELSE 'Other'
  END as activity_type,
  COUNT(*) as frames,
  ROUND(COUNT(*) * 5.0 / 60, 1) as approx_minutes
FROM frames f
LEFT JOIN chunks c ON c.frame_id = f.id
WHERE date(f.captured_at) = date('now')
GROUP BY activity_type
ORDER BY frames DESC;
```

### Long Sessions (> 1 hour) with StackOverflow
```sql
WITH coding_sessions AS (
  SELECT 
    date(f.captured_at) as day,
    MIN(f.captured_at) as session_start,
    MAX(f.captured_at) as session_end,
    (julianday(MAX(f.captured_at)) - julianday(MIN(f.captured_at))) * 24 as hours,
    MIN(c.id) as chunk_id  -- REQUIRED for citations
  FROM frames f
  LEFT JOIN chunks c ON c.frame_id = f.id
  WHERE f.app_name IN ('VS Code', 'Cursor', 'Zed')
  GROUP BY date(f.captured_at), strftime('%H', f.captured_at) / 2
  HAVING hours > 1
)
SELECT 
  cs.chunk_id,  -- REQUIRED for citations
  cs.day,
  cs.session_start,
  cs.session_end,
  cs.hours,
  COUNT(DISTINCT f.id) as stackoverflow_visits
FROM coding_sessions cs
LEFT JOIN frames f ON f.captured_at BETWEEN cs.session_start AND cs.session_end
  AND f.window_title LIKE '%Stack Overflow%'
GROUP BY cs.day, cs.session_start
ORDER BY cs.day DESC
LIMIT 10;
```

## Output Format: Daily Digest

```markdown
## Daily Digest - 2026-03-11

### Time Breakdown
| App | Time | Focus |
|-----|------|-------|
| VS Code | ~3h 20min | screenpipe, auth-service |
| Chrome | ~1h 45min | GitHub, Docs, StackOverflow |
| Slack | ~45min | team-engineering |

### Timeline
- **9:00-11:30** - Deep work on auth feature (VS Code)
- **11:30-12:00** - Code review, PR comments (GitHub)
- **12:00-13:00** - Lunch break
- **14:00-17:00** - Debugging, testing, Slack discussions

### Key Activities
- Worked on authentication middleware
- Reviewed 3 pull requests
- Resolved CORS issue
- Team sync on Slack

### Patterns
- Good morning focus block (2.5 hours uninterrupted)
- Afternoon was more fragmented (12 app switches)
- Heavy browser usage in afternoon (research mode)

### Stats
- First activity: 09:02
- Last activity: 17:45
- Total active time: ~6h 30min
- Most context switches: 14:00-15:00
```

## Multi-Step Aggregation

For complex digests, multiple queries may be needed:

```
Step 1: SQL - Get app usage breakdown
Step 2: SQL - Get timeline of activities
Step 3: SQL - Get content samples
Step 4: REASON - Synthesize into coherent narrative
```

The final REASON step has all data and creates the digest.
