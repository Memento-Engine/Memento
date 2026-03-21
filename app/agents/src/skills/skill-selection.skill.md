---
name: skill-selection
description: Critical guide for choosing the right search strategy based on query type
---

# Skill Selection Guide

## CRITICAL: Choose the Right Action

### Use SEMANTIC Search When:
- Query contains **fuzzy concepts**: "coding session", "deep work", "learning", "debugging"
- Query is **conceptual**: "what did I learn about X", "when was I working on X"
- **No exact keywords** to match
- Looking for **related content** without knowing exact words
- Previous SQL returned **empty results**

### Use SQL (FTS) When:
- Query contains **exact keywords**: error messages, specific terms, file names
- Query is **structural**: "show me all X grouped by Y"
- Query is **quantitative**: "how many", "count of", "most used"
- Query has **time constraints**: "at 3pm", "yesterday", "last week"

### Use HYBRID Search When:
- Query has **both keywords AND concepts**
- **Default fallback** when unsure
- After SQL returns empty, retry with hybrid
- User wants "search activities" - this is conceptual!

### Use WEB Search When:
- The user asks for **external or current information** not tied to captured screen history
- The answer depends on the **public internet**: docs, release notes, news, websites, live facts
- You need to **verify a public claim** against the web
- Local search results are empty but the request is clearly about outside knowledge
- **You are uncertain** and need external validation of your findings
- The query **mixes personal + public knowledge** - search BOTH memory AND web
- **Supplementing memory results** would provide a more complete answer

**PROACTIVE STRATEGY**: Web search can run alongside memory searches. Don't wait for memory search to fail - if the query could benefit from both personal history AND public information, use both.

## APP NAME MAPPINGS (Critical Knowledge)

**⚠️ ALWAYS use ALL variants of an app name in filters!**

**CODE EDITORS** (use for "coding", "programming", "development"):
- VS Code / Visual Studio Code / Code / VSCode
- Cursor / Cursor AI
- Zed / Zed Editor
- IntelliJ IDEA / IntelliJ, WebStorm, PyCharm, GoLand, RustRover
- Sublime Text / Sublime, Atom, Neovim / nvim, Vim
- Android Studio, Xcode

**BROWSERS** (use for "browsing", "searching", "learning", "reading"):
- Chrome / Google Chrome
- Firefox / Mozilla Firefox
- Arc / Arc Browser
- Safari / Apple Safari
- Edge / Microsoft Edge
- Brave, Opera, Vivaldi

**COMMUNICATION** (use for "meetings", "chat", "talking"):
- Slack
- Discord
- Microsoft Teams / Teams / MS Teams
- Zoom / Zoom Meeting
- Google Meet (in browser)

**TERMINALS** (use for "terminal", "command line", "shell"):
- Terminal / iTerm / iTerm2
- Warp / Warp Terminal
- Alacritty, Kitty
- PowerShell / pwsh, cmd / Command Prompt
- Windows Terminal / wt

**SOCIAL MEDIA (REBRANDS - search BOTH names!):**
- X / Twitter (formerly Twitter) - ALWAYS search both!
- Meta / Facebook (company rebranded)
- Instagram / IG, LinkedIn, Reddit

## LANGUAGE / FRAMEWORK DETECTION

When user mentions a programming language, search for:
- **Rust**: Look for code editors + files with ".rs", or text containing "cargo", "rustc", "fn main", "impl"
- **Python**: Code editors + ".py", "pip", "import", "def ", "class"
- **JavaScript/TypeScript**: Code editors + ".js", ".ts", "npm", "node", "const", "function"
- **Go**: Code editors + ".go", "go mod", "func ", "package main"

**IMPORTANT:** Don't just search for "rust" in window_title - the content/OCR text is more reliable!

## RETRY STRATEGIES

### When SQL Returns Empty:
1. **Try semantic search** with the core concept
2. **Broaden the query** - remove time filters, expand app list
3. **Try hybrid search** with keywords + concept

### When Semantic Returns Empty:
1. **Try SQL with broader terms**
2. **Check different time ranges**
3. **Try related app categories**

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
