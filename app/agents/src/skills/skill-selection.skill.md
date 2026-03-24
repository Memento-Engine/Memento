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
- Fuzzy concepts: "coding session", "deep work", "where I learned X"
- No exact keywords known

### hybrid
- Both keywords AND concepts present
- Default fallback when unsure
- After SQL returns empty

### webSearch
- User explicitly asks for external/web search or needs live docs/news

## App Name Mappings

- Editors: `VS Code`, `Visual Studio Code`, `Cursor`, `Zed`
- Browsers: `Chrome`, `Google Chrome`, `Firefox`, `Arc`, `Safari`, `Edge`
- Terminals: `Terminal`, `iTerm`, `Warp`, `PowerShell`
- Social: `X`, `Twitter` (always search both)

## Retry Strategy
1. SQL empty → try semantic
2. Semantic empty → broaden query, try hybrid
3. Still empty → try different time range or app filter

## Avoid
- `app_name` won't contain the language ("VS Code" ≠ rust) — use semantic
- Don't use SQL for conceptual queries; don't use MATCH for domains
