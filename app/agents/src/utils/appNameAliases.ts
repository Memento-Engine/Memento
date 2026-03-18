/**
 * App Name Aliases Module
 * 
 * Handles multiple names for applications including:
 * - Brand variations (VS Code, Visual Studio Code, Code)
 * - Former/rebrand names (Twitter/X)
 * - Common abbreviations and typos
 * 
 * This is critical for search accuracy: when a user says "VS Code",
 * we need to search for all variants that might appear in window titles or app names.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AppCategory {
  /** Category name for grouping */
  category: string;
  /** Description of what these apps are used for */
  description: string;
  /** All app names in this category (primary names) */
  apps: string[];
}

export interface AppAliasEntry {
  /** Canonical/primary name */
  canonical: string;
  /** All known aliases, variants, former names */
  aliases: string[];
  /** Category this app belongs to */
  category: string;
  /** Optional: former name if rebranded */
  formerName?: string;
  /** Keywords users might use to refer to this app */
  keywords: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// APP ALIAS REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Comprehensive app alias registry.
 * Maps canonical names to all their variants.
 */
export const APP_ALIASES: AppAliasEntry[] = [
  // ── CODE EDITORS ──────────────────────────────────────────
  {
    canonical: "Visual Studio Code",
    aliases: ["VS Code", "VSCode", "Code", "vscode", "code"],
    category: "code_editor",
    keywords: ["coding", "programming", "development", "editor", "code editor"],
  },
  {
    canonical: "Cursor",
    aliases: ["cursor", "Cursor AI", "CursorAI"],
    category: "code_editor",
    keywords: ["coding", "programming", "AI editor", "code editor"],
  },
  {
    canonical: "Zed",
    aliases: ["zed", "Zed Editor"],
    category: "code_editor",
    keywords: ["coding", "programming", "editor", "code editor"],
  },
  {
    canonical: "IntelliJ IDEA",
    aliases: ["IntelliJ", "IDEA", "intellij", "intellij-idea"],
    category: "code_editor",
    keywords: ["Java", "coding", "IDE", "JetBrains"],
  },
  {
    canonical: "WebStorm",
    aliases: ["webstorm", "Web Storm"],
    category: "code_editor",
    keywords: ["JavaScript", "TypeScript", "coding", "IDE", "JetBrains"],
  },
  {
    canonical: "PyCharm",
    aliases: ["pycharm", "Py Charm"],
    category: "code_editor",
    keywords: ["Python", "coding", "IDE", "JetBrains"],
  },
  {
    canonical: "GoLand",
    aliases: ["goland", "Go Land"],
    category: "code_editor",
    keywords: ["Go", "Golang", "coding", "IDE", "JetBrains"],
  },
  {
    canonical: "RustRover",
    aliases: ["rustrover", "Rust Rover"],
    category: "code_editor",
    keywords: ["Rust", "coding", "IDE", "JetBrains"],
  },
  {
    canonical: "Sublime Text",
    aliases: ["Sublime", "sublime", "SublimeText", "subl"],
    category: "code_editor",
    keywords: ["coding", "programming", "editor", "text editor"],
  },
  {
    canonical: "Atom",
    aliases: ["atom", "Atom Editor"],
    category: "code_editor",
    keywords: ["coding", "programming", "editor", "GitHub"],
  },
  {
    canonical: "Neovim",
    aliases: ["neovim", "nvim", "NeoVim"],
    category: "code_editor",
    keywords: ["coding", "programming", "vim", "editor", "terminal"],
  },
  {
    canonical: "Vim",
    aliases: ["vim", "vi", "VIM"],
    category: "code_editor",
    keywords: ["coding", "programming", "editor", "terminal"],
  },
  {
    canonical: "Android Studio",
    aliases: ["android-studio", "AndroidStudio"],
    category: "code_editor",
    keywords: ["Android", "mobile", "coding", "IDE", "Google"],
  },
  {
    canonical: "Xcode",
    aliases: ["xcode", "XCode", "X Code"],
    category: "code_editor",
    keywords: ["iOS", "macOS", "Swift", "coding", "Apple", "IDE"],
  },
  {
    canonical: "Visual Studio",
    aliases: ["VS", "VisualStudio", "visual-studio", "devenv"],
    category: "code_editor",
    keywords: ["C#", ".NET", "Windows", "coding", "IDE", "Microsoft"],
  },
  {
    canonical: "Emacs",
    aliases: ["emacs", "GNU Emacs"],
    category: "code_editor",
    keywords: ["coding", "programming", "editor", "lisp"],
  },
  
  // ── BROWSERS ──────────────────────────────────────────────
  {
    canonical: "Google Chrome",
    aliases: ["Chrome", "chrome", "Google Chrome", "google-chrome"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "search", "Google"],
  },
  {
    canonical: "Mozilla Firefox",
    aliases: ["Firefox", "firefox", "FF", "Mozilla"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "search"],
  },
  {
    canonical: "Arc",
    aliases: ["arc", "Arc Browser", "The Browser Company"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "search"],
  },
  {
    canonical: "Safari",
    aliases: ["safari", "Apple Safari"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "Apple", "macOS"],
  },
  {
    canonical: "Microsoft Edge",
    aliases: ["Edge", "edge", "MS Edge", "Chromium Edge"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "Microsoft"],
  },
  {
    canonical: "Brave",
    aliases: ["brave", "Brave Browser"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "privacy"],
  },
  {
    canonical: "Opera",
    aliases: ["opera", "Opera Browser", "Opera GX"],
    category: "browser",
    keywords: ["browsing", "web", "internet"],
  },
  {
    canonical: "Vivaldi",
    aliases: ["vivaldi", "Vivaldi Browser"],
    category: "browser",
    keywords: ["browsing", "web", "internet", "customization"],
  },
  
  // ── TERMINALS ─────────────────────────────────────────────
  {
    canonical: "Terminal",
    aliases: ["terminal", "Terminal.app", "Apple Terminal"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "bash", "zsh"],
  },
  {
    canonical: "iTerm2",
    aliases: ["iTerm", "iterm", "iterm2", "iTerm 2"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "macOS"],
  },
  {
    canonical: "Warp",
    aliases: ["warp", "Warp Terminal"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "AI terminal"],
  },
  {
    canonical: "Alacritty",
    aliases: ["alacritty"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "GPU terminal"],
  },
  {
    canonical: "Kitty",
    aliases: ["kitty", "Kitty Terminal"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "GPU terminal"],
  },
  {
    canonical: "Windows Terminal",
    aliases: ["wt", "WindowsTerminal", "windows-terminal"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "Windows", "PowerShell"],
  },
  {
    canonical: "PowerShell",
    aliases: ["powershell", "pwsh", "PS", "Windows PowerShell"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "Windows", "scripting"],
  },
  {
    canonical: "Command Prompt",
    aliases: ["cmd", "cmd.exe", "DOS", "Command"],
    category: "terminal",
    keywords: ["command line", "shell", "CLI", "Windows"],
  },
  
  // ── COMMUNICATION ─────────────────────────────────────────
  {
    canonical: "Slack",
    aliases: ["slack", "Slack App"],
    category: "communication",
    keywords: ["chat", "messaging", "team", "work", "collaboration"],
  },
  {
    canonical: "Discord",
    aliases: ["discord", "Discord App"],
    category: "communication",
    keywords: ["chat", "messaging", "voice", "gaming", "community"],
  },
  {
    canonical: "Microsoft Teams",
    aliases: ["Teams", "teams", "MS Teams", "Microsoft Teams"],
    category: "communication",
    keywords: ["chat", "messaging", "meetings", "video call", "Microsoft"],
  },
  {
    canonical: "Zoom",
    aliases: ["zoom", "Zoom Meeting", "Zoom.us"],
    category: "communication",
    keywords: ["video call", "meetings", "conference", "screen share"],
  },
  {
    canonical: "Google Meet",
    aliases: ["Meet", "meet", "Google Meet", "Google Meetings"],
    category: "communication",
    keywords: ["video call", "meetings", "conference", "Google"],
  },
  
  // ── SOCIAL MEDIA (with rebrand tracking) ──────────────────
  {
    canonical: "X",
    aliases: ["Twitter", "twitter", "x", "x.com", "twitter.com"],
    formerName: "Twitter",
    category: "social_media",
    keywords: ["social media", "microblogging", "posts", "tweets"],
  },
  {
    canonical: "Meta",
    aliases: ["Facebook", "facebook", "FB", "meta", "facebook.com"],
    formerName: "Facebook",
    category: "social_media",
    keywords: ["social media", "social network", "posts"],
  },
  {
    canonical: "Instagram",
    aliases: ["instagram", "IG", "Insta", "instagram.com"],
    category: "social_media",
    keywords: ["social media", "photos", "stories", "reels"],
  },
  {
    canonical: "LinkedIn",
    aliases: ["linkedin", "Linked In", "linkedin.com"],
    category: "social_media",
    keywords: ["professional", "networking", "jobs", "career"],
  },
  {
    canonical: "Reddit",
    aliases: ["reddit", "reddit.com", "subreddit"],
    category: "social_media",
    keywords: ["social media", "forums", "communities", "discussions"],
  },
  
  // ── PRODUCTIVITY ──────────────────────────────────────────
  {
    canonical: "Notion",
    aliases: ["notion", "Notion.so", "notion.so"],
    category: "productivity",
    keywords: ["notes", "wiki", "documentation", "workspace", "knowledge base"],
  },
  {
    canonical: "Obsidian",
    aliases: ["obsidian", "Obsidian.md"],
    category: "productivity",
    keywords: ["notes", "markdown", "knowledge graph", "personal wiki"],
  },
  {
    canonical: "Figma",
    aliases: ["figma", "figma.com"],
    category: "design",
    keywords: ["design", "UI", "UX", "prototyping", "wireframe"],
  },
  {
    canonical: "Linear",
    aliases: ["linear", "linear.app", "Linear App"],
    category: "productivity",
    keywords: ["project management", "issues", "tickets", "sprint"],
  },
  {
    canonical: "Jira",
    aliases: ["jira", "JIRA", "Atlassian Jira"],
    category: "productivity",
    keywords: ["project management", "issues", "tickets", "sprint", "Atlassian"],
  },
  {
    canonical: "Asana",
    aliases: ["asana", "asana.com"],
    category: "productivity",
    keywords: ["project management", "tasks", "workflow"],
  },
  {
    canonical: "GitHub",
    aliases: ["github", "GitHub.com", "github.com", "GH"],
    category: "development",
    keywords: ["git", "code", "repository", "pull request", "PR", "issues"],
  },
  {
    canonical: "GitLab",
    aliases: ["gitlab", "GitLab.com", "gitlab.com"],
    category: "development",
    keywords: ["git", "code", "repository", "merge request", "CI/CD"],
  },
  
  // ── DOCUMENTS ─────────────────────────────────────────────
  {
    canonical: "Google Docs",
    aliases: ["Docs", "Google Documents", "docs.google.com"],
    category: "documents",
    keywords: ["writing", "document", "word processor", "Google"],
  },
  {
    canonical: "Google Sheets",
    aliases: ["Sheets", "Google Spreadsheets", "sheets.google.com"],
    category: "documents",
    keywords: ["spreadsheet", "data", "excel", "Google"],
  },
  {
    canonical: "Microsoft Word",
    aliases: ["Word", "word", "MS Word", "WINWORD"],
    category: "documents",
    keywords: ["writing", "document", "word processor", "Office"],
  },
  {
    canonical: "Microsoft Excel",
    aliases: ["Excel", "excel", "MS Excel", "EXCEL"],
    category: "documents",
    keywords: ["spreadsheet", "data", "Office"],
  },
  
  // ── MEDIA ─────────────────────────────────────────────────
  {
    canonical: "Spotify",
    aliases: ["spotify", "Spotify.app"],
    category: "media",
    keywords: ["music", "streaming", "audio", "podcast"],
  },
  {
    canonical: "YouTube",
    aliases: ["youtube", "YouTube.com", "youtube.com", "YT"],
    category: "media",
    keywords: ["video", "streaming", "watching", "tutorials"],
  },
  {
    canonical: "Netflix",
    aliases: ["netflix", "Netflix.com", "netflix.com"],
    category: "media",
    keywords: ["video", "streaming", "movies", "shows"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const APP_CATEGORIES: AppCategory[] = [
  {
    category: "code_editor",
    description: "Code editors and IDEs for programming and development",
    apps: APP_ALIASES.filter(a => a.category === "code_editor").map(a => a.canonical),
  },
  {
    category: "browser",
    description: "Web browsers for browsing, searching, and reading online",
    apps: APP_ALIASES.filter(a => a.category === "browser").map(a => a.canonical),
  },
  {
    category: "terminal",
    description: "Terminal emulators and command line interfaces",
    apps: APP_ALIASES.filter(a => a.category === "terminal").map(a => a.canonical),
  },
  {
    category: "communication",
    description: "Chat, messaging, and video conferencing apps",
    apps: APP_ALIASES.filter(a => a.category === "communication").map(a => a.canonical),
  },
  {
    category: "social_media",
    description: "Social media and networking platforms",
    apps: APP_ALIASES.filter(a => a.category === "social_media").map(a => a.canonical),
  },
  {
    category: "productivity",
    description: "Productivity and project management tools",
    apps: APP_ALIASES.filter(a => a.category === "productivity").map(a => a.canonical),
  },
  {
    category: "design",
    description: "Design and prototyping tools",
    apps: APP_ALIASES.filter(a => a.category === "design").map(a => a.canonical),
  },
  {
    category: "development",
    description: "Development tools (Git, CI/CD, etc.)",
    apps: APP_ALIASES.filter(a => a.category === "development").map(a => a.canonical),
  },
  {
    category: "documents",
    description: "Document editing and spreadsheet applications",
    apps: APP_ALIASES.filter(a => a.category === "documents").map(a => a.canonical),
  },
  {
    category: "media",
    description: "Music, video, and entertainment applications",
    apps: APP_ALIASES.filter(a => a.category === "media").map(a => a.canonical),
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Pre-built lookup maps for O(1) access
const aliasToCanonicalMap = new Map<string, string>();
const canonicalToAliasesMap = new Map<string, string[]>();
const categoryToAppsMap = new Map<string, string[]>();

// Initialize lookup maps
function initializeMaps() {
  for (const entry of APP_ALIASES) {
    // Map canonical name to itself and all aliases
    const allNames = [entry.canonical, ...entry.aliases];
    canonicalToAliasesMap.set(entry.canonical, allNames);
    
    // Map each variant to canonical
    for (const alias of allNames) {
      aliasToCanonicalMap.set(alias.toLowerCase(), entry.canonical);
    }
  }
  
  for (const cat of APP_CATEGORIES) {
    categoryToAppsMap.set(cat.category, cat.apps);
  }
}

initializeMaps();

/**
 * Get canonical app name from any variant.
 * @param appName - Any app name variant (e.g., "VS Code", "vscode")
 * @returns Canonical name or original if not found
 */
export function getCanonicalAppName(appName: string): string {
  return aliasToCanonicalMap.get(appName.toLowerCase()) ?? appName;
}

/**
 * Get all name variants for an app.
 * @param appName - Any app name variant
 * @returns Array of all known names
 */
export function getAppNameVariants(appName: string): string[] {
  const canonical = getCanonicalAppName(appName);
  return canonicalToAliasesMap.get(canonical) ?? [appName];
}

/**
 * Get all apps in a category.
 * @param category - Category name (e.g., "code_editor", "browser")
 * @returns Array of canonical app names
 */
export function getAppsInCategory(category: string): string[] {
  return categoryToAppsMap.get(category) ?? [];
}

/**
 * Get all aliases for apps in a category (for SQL IN clauses).
 * @param category - Category name
 * @returns Flat array of all app name variants
 */
export function getAllAppNamesInCategory(category: string): string[] {
  const canonicals = getAppsInCategory(category);
  const allNames: string[] = [];
  for (const canonical of canonicals) {
    const variants = canonicalToAliasesMap.get(canonical);
    if (variants) {
      allNames.push(...variants);
    }
  }
  return allNames;
}

/**
 * Expand a user's app name query to include all variants.
 * Useful for building SQL WHERE clauses or filter arrays.
 * 
 * @param userInput - User's input (e.g., "VS Code", "twitter", "browsers")
 * @returns Object with expanded app names and SQL helper
 * 
 * @example
 * expandAppQuery("VS Code")
 * // Returns: {
 * //   apps: ["Visual Studio Code", "VS Code", "VSCode", "Code", "vscode", "code"],
 * //   sqlInClause: "'Visual Studio Code', 'VS Code', 'VSCode', 'Code', 'vscode', 'code'"
 * // }
 * 
 * expandAppQuery("browsers")
 * // Returns all browser app names
 */
export function expandAppQuery(userInput: string): {
  apps: string[];
  sqlInClause: string;
  category?: string;
} {
  const input = userInput.toLowerCase().trim();
  
  // Check if it's a category query
  const categoryKeywords: Record<string, string> = {
    "browsers": "browser",
    "browser": "browser",
    "code editors": "code_editor",
    "code editor": "code_editor",
    "editors": "code_editor",
    "ides": "code_editor",
    "terminals": "terminal",
    "terminal": "terminal",
    "command line": "terminal",
    "cli": "terminal",
    "chat": "communication",
    "communication": "communication",
    "meetings": "communication",
    "social media": "social_media",
    "social": "social_media",
  };
  
  const matchedCategory = categoryKeywords[input];
  if (matchedCategory) {
    const apps = getAllAppNamesInCategory(matchedCategory);
    return {
      apps,
      sqlInClause: apps.map(a => `'${a.replace(/'/g, "''")}'`).join(", "),
      category: matchedCategory,
    };
  }
  
  // Otherwise, expand the specific app name
  const variants = getAppNameVariants(userInput);
  return {
    apps: variants,
    sqlInClause: variants.map(a => `'${a.replace(/'/g, "''")}'`).join(", "),
  };
}

/**
 * Check if an app query includes former/rebranded names.
 * Useful for informing users about brand changes.
 * 
 * @param appName - App name to check
 * @returns Former name info if applicable
 */
export function getFormerNameInfo(appName: string): {
  hasFormerName: boolean;
  currentName?: string;
  formerName?: string;
} {
  const canonical = getCanonicalAppName(appName);
  const entry = APP_ALIASES.find(a => a.canonical === canonical);
  
  if (entry?.formerName) {
    return {
      hasFormerName: true,
      currentName: entry.canonical,
      formerName: entry.formerName,
    };
  }
  
  return { hasFormerName: false };
}

/**
 * Build a comprehensive prompt section for app name awareness.
 * Include this in LLM system prompts.
 */
export function buildAppAliasPromptSection(): string {
  const sections: string[] = [];
  
  sections.push("## APP NAME ALIASES & VARIANTS\n");
  sections.push("When users mention an app, search for ALL variants. These are the known mappings:\n");
  
  for (const cat of APP_CATEGORIES) {
    const catApps = APP_ALIASES.filter(a => a.category === cat.category);
    if (catApps.length === 0) continue;
    
    sections.push(`\n### ${cat.description.toUpperCase()}`);
    for (const app of catApps) {
      const variants = [app.canonical, ...app.aliases.slice(0, 3)].join(", ");
      const formerNote = app.formerName ? ` (formerly ${app.formerName})` : "";
      sections.push(`- **${app.canonical}**${formerNote}: ${variants}`);
    }
  }
  
  sections.push("\n### IMPORTANT REBRAND NOTES");
  sections.push("- **Twitter** is now **X** - search for both: 'Twitter', 'X', 'twitter', 'x.com'");
  sections.push("- **Facebook** the company is now **Meta** - but app may still show as 'Facebook'");
  
  sections.push("\n### USAGE IN QUERIES");
  sections.push("When building SQL filters:");
  sections.push("```sql");
  sections.push("-- For VS Code:");
  sections.push("WHERE app_name IN ('Visual Studio Code', 'VS Code', 'VSCode', 'Code')");
  sections.push("-- For browsers:");
  sections.push("WHERE app_name IN ('Google Chrome', 'Chrome', 'Firefox', 'Mozilla Firefox', 'Arc', 'Safari', 'Edge')");
  sections.push("```");
  
  return sections.join("\n");
}

/**
 * Build a compact version for token-sensitive contexts.
 */
export function buildCompactAppAliasSection(): string {
  const lines: string[] = [
    "## APP NAME VARIANTS (Always Search Multiple)",
    "",
    "**CODE EDITORS:** VS Code/Visual Studio Code/Code/VSCode, Cursor, Zed, IntelliJ IDEA/IntelliJ, WebStorm, PyCharm, GoLand, RustRover, Sublime Text/Sublime, Vim/Neovim/nvim, Xcode, Android Studio",
    "",
    "**BROWSERS:** Chrome/Google Chrome, Firefox/Mozilla Firefox, Arc, Safari, Edge/Microsoft Edge, Brave, Opera, Vivaldi",
    "",
    "**TERMINALS:** Terminal/iTerm/iTerm2, Warp, Alacritty, Kitty, Windows Terminal/wt, PowerShell/pwsh, cmd/Command Prompt",
    "",
    "**COMMUNICATION:** Slack, Discord, Teams/Microsoft Teams, Zoom, Google Meet",
    "",
    "**SOCIAL (with former names):** X (formerly Twitter) - search both!, Meta/Facebook, Instagram, LinkedIn, Reddit",
    "",
    "**DEVELOPMENT:** GitHub/GH, GitLab, Figma, Notion, Linear, Jira",
    "",
    "⚠️ ALWAYS expand user's app mention to ALL variants. When user says 'VS Code', search for: 'VS Code', 'Visual Studio Code', 'VSCode', 'Code'",
  ];
  
  return lines.join("\n");
}
