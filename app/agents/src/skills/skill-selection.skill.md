---
name: skill-selection
description: Guide for choosing the right search strategy.
---

# Skill Selection

## Choose Action Type

### sql (FTS)
- Exact keywords, error messages, specific terms
- Quantitative: "how many", "count", "most used"
- Time-based: "at 3pm", "yesterday"

### semantic
- Fuzzy concepts: "coding session", "deep work"
- Conceptual: "what did I learn about X"
- No exact keywords known

### hybrid
- Both keywords AND concepts present
- Default fallback when unsure
- After SQL returns empty

### webSearch (ONLY When Needed)
- User explicitly asks for web search
- External/current web information not in screen history
- Docs, releases, news, live facts required
- Uncertain about external facts and need validation
- Can run alongside memory searches
- DO NOT use for personal queries or local data

## App Name Mappings

**Always include ALL variants:**

| Category | Names |
|----------|-------|
| Editors | VS Code, Visual Studio Code, Cursor, Zed, IntelliJ |
| Browsers | Chrome, Google Chrome, Firefox, Arc, Safari, Edge |
| Terminals | Terminal, iTerm, Warp, PowerShell |
| Social | X, Twitter (both!), Slack, Discord |

## Retry Strategy

1. SQL empty → Try semantic
2. Semantic empty → Broaden query, try hybrid
3. Still empty → Try different time range or app filter

## QUERY INTERPRETATION EXAMPLES

| User Query | Action | Reasoning |
|------------|--------|-----------|
| "what tabs did I switch during rust coding" | SEMANTIC first | "rust coding" is fuzzy - need to find code editor activity with Rust-related content |
| "show my search activities" | HYBRID | "search activities" is conceptual - not just URLs with "search" in them |
| "find error 404 messages" | SQL (FTS) | Exact keyword match needed |
| "what was I doing at 3pm" | SQL | Time-based structural query |
| "when did I learn about microservices" | SEMANTIC | "learn" is conceptual |
| "count apps used today" | SQL | Aggregation query |
| "debugging session yesterday" | SEMANTIC + SQL | Fuzzy concept + time filter |

## COMMON MISTAKES TO AVOID

1. **Don't assume app_name contains the language** - "VS Code" won't show "rust"
2. **Don't search browser_url for "search"** - Most search URLs don't have that word
3. **Don't use SQL for conceptual queries** - Use semantic/hybrid first
4. **Don't give up after one empty result** - Try a different action type
5. **Don't force local search for external facts** - Use web search when the answer belongs on the public web
