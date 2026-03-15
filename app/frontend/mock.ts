import type { MementoUIMessage, SourceRecord, ThinkingStep } from "@/components/types";

// ============================================================================
// MOCK SOURCE DATA
// ============================================================================

export const MOCK_SOURCES: SourceRecord[] = [
  {
    chunkId: 1,
    appName: "Notion",
    windowTitle: "Rust Async Working Group – Weekly Sync",
    capturedAt: "2026-03-04T09:52:10.000Z",
    browserUrl: "",
    textContent:
      "Agenda: 1) Pin API stabilisation 2) tokio 1.40 migration guide 3) async-trait removal timeline. The Pin API has been a source of confusion for many Rust developers, but the stabilization effort aims to make it more ergonomic.",
    textJson: null,
    normalizedTextLayout: {
      version: 1,
      normalized_text:
        "Agenda: 1) Pin API stabilisation 2) tokio 1.40 migration guide 3) async-trait removal timeline. The Pin API has been a source of confusion for many Rust developers, but the stabilization effort aims to make it more ergonomic.",
      tokens: [
        { text: "Agenda:", x: 10, y: 10, width: 60, height: 20, index: 0 },
        { text: "1)", x: 75, y: 10, width: 15, height: 20, index: 1 },
        { text: "Pin", x: 95, y: 10, width: 25, height: 20, index: 2 },
        { text: "API", x: 125, y: 10, width: 25, height: 20, index: 3 },
      ],
    },
    imagePath: "https://picsum.photos/seed/notion1/800/600",
    frameId: 1,
    windowX: 0,
    windowY: 0,
    windowWidth: 1920,
    windowHeight: 1080,
  },
  {
    chunkId: 2,
    appName: "Google Chrome",
    windowTitle: "Rust Async Book – async/.await",
    capturedAt: "2026-03-04T09:58:00.000Z",
    browserUrl: "https://rust-lang.github.io/async-book/",
    textContent:
      "The async/.await syntax is built on Futures. A Future is a value that may not have finished computing yet. This allows for efficient, non-blocking code execution.",
    textJson: null,
    normalizedTextLayout: {
      version: 1,
      normalized_text:
        "The async/.await syntax is built on Futures. A Future is a value that may not have finished computing yet.",
      tokens: [
        { text: "The", x: 10, y: 10, width: 25, height: 20, index: 0 },
        { text: "async/.await", x: 40, y: 10, width: 80, height: 20, index: 1 },
        { text: "syntax", x: 125, y: 10, width: 45, height: 20, index: 2 },
      ],
    },
    imagePath: "https://picsum.photos/seed/chrome1/800/600",
    frameId: 2,
    windowX: 100,
    windowY: 50,
    windowWidth: 1600,
    windowHeight: 900,
  },
  {
    chunkId: 3,
    appName: "Slack",
    windowTitle: "#rust-async – action items thread",
    capturedAt: "2026-03-04T10:10:00.000Z",
    browserUrl: "",
    textContent:
      "Action items: @alice owns the Pin RFC PR. @bob to update the migration guide before Friday. Tokio v1.40 testing sprint starts Monday. Everyone should review the breaking changes document.",
    textJson: null,
    normalizedTextLayout: {
      version: 1,
      normalized_text:
        "Action items: @alice owns the Pin RFC PR. @bob to update the migration guide before Friday.",
      tokens: [
        { text: "Action", x: 10, y: 10, width: 45, height: 20, index: 0 },
        { text: "items:", x: 60, y: 10, width: 40, height: 20, index: 1 },
      ],
    },
    imagePath: "https://picsum.photos/seed/slack1/800/600",
    frameId: 3,
    windowX: 200,
    windowY: 100,
    windowWidth: 1400,
    windowHeight: 800,
  },
  {
    chunkId: 4,
    appName: "Visual Studio Code",
    windowTitle: "async_runtime.rs – memento-core",
    capturedAt: "2026-03-04T09:45:00.000Z",
    browserUrl: "",
    textContent:
      "// TODO: replace block_on with a proper async entrypoint once tokio 1.40 ships.\n\nfn main() {\n    let rt = tokio::runtime::Runtime::new().unwrap();\n    rt.block_on(async_main());\n}",
    textJson: null,
    normalizedTextLayout: {
      version: 1,
      normalized_text:
        "// TODO: replace block_on with a proper async entrypoint once tokio 1.40 ships.",
      tokens: [
        { text: "// TODO:", x: 10, y: 10, width: 60, height: 20, index: 0 },
        { text: "replace", x: 75, y: 10, width: 50, height: 20, index: 1 },
      ],
    },
    imagePath: "https://picsum.photos/seed/vscode1/800/600",
    frameId: 4,
    windowX: 50,
    windowY: 25,
    windowWidth: 1800,
    windowHeight: 1000,
  },
  {
    chunkId: 5,
    appName: "Discord",
    windowTitle: "Rust Community – #async-wg",
    capturedAt: "2026-03-04T11:05:00.000Z",
    browserUrl: "",
    textContent:
      "The async working group discussed the timeline for async traits stabilization. Expected to land in Rust 1.82. Major improvements to compile times expected.",
    textJson: null,
    normalizedTextLayout: {
      version: 1,
      normalized_text:
        "The async working group discussed the timeline for async traits stabilization. Expected to land in Rust 1.82.",
      tokens: [
        { text: "The", x: 10, y: 10, width: 25, height: 20, index: 0 },
        { text: "async", x: 40, y: 10, width: 35, height: 20, index: 1 },
      ],
    },
    imagePath: "https://picsum.photos/seed/discord1/800/600",
    frameId: 5,
    windowX: 0,
    windowY: 0,
    windowWidth: 1920,
    windowHeight: 1080,
  },
];

// ============================================================================
// MOCK THINKING STEPS
// ============================================================================

export const MOCK_THINKING_STEPS: ThinkingStep[] = [
  {
    stepId: "step-plan-1",
    stepType: "planning",
    status: "completed",
    title: "Planning search strategy",
    description: "Analyzing query to identify key concepts: Rust, async, meeting, last week. Will search across multiple apps for meeting notes and related discussions.",
    queries: ["rust async meeting", "weekly sync notes", "tokio discussion"],
    duration: 340,
    timestamp: "2026-03-04T10:00:00.000Z",
  },
  {
    stepId: "step-search-1",
    stepType: "searching",
    status: "completed",
    title: "Searching for Rust async meeting notes",
    query: "Rust async meeting notes weekly sync",
    resultCount: 6,
    results: [
      {
        chunk_id: 1,
        app_name: "Notion",
        window_name: "Rust Async Working Group – Weekly Sync",
        image_path: "https://picsum.photos/seed/notion1/800/600",
        captured_at: "2026-03-04T09:52:10.000Z",
        browser_url: "",
        text_content: "Agenda: 1) Pin API stabilisation...",
      },
      {
        chunk_id: 2,
        app_name: "Google Chrome",
        window_name: "Rust Async Book – async/.await",
        image_path: "https://picsum.photos/seed/chrome1/800/600",
        captured_at: "2026-03-04T09:58:00.000Z",
        browser_url: "https://rust-lang.github.io/async-book/",
        text_content: "The async/.await syntax is built on Futures...",
      },
    ],
    duration: 820,
    timestamp: "2026-03-04T10:00:01.000Z",
  },
  {
    stepId: "step-search-2",
    stepType: "searching",
    status: "completed",
    title: "Searching for follow-up action items",
    query: "async meeting action items tokio runtime owners",
    resultCount: 3,
    results: [
      {
        chunk_id: 3,
        app_name: "Slack",
        window_name: "#rust-async – action items thread",
        image_path: "https://picsum.photos/seed/slack1/800/600",
        captured_at: "2026-03-04T10:10:00.000Z",
        browser_url: "",
        text_content: "Action items: @alice owns the Pin RFC PR...",
      },
      {
        chunk_id: 5,
        app_name: "Discord",
        window_name: "Rust Community – #async-wg",
        image_path: "https://picsum.photos/seed/discord1/800/600",
        captured_at: "2026-03-04T11:05:00.000Z",
        browser_url: "",
        text_content: "The async working group discussed the timeline...",
      },
    ],
    duration: 670,
    timestamp: "2026-03-04T10:00:02.000Z",
  },
  {
    stepId: "step-search-3",
    stepType: "searching",
    status: "completed",
    title: "Searching for code references",
    query: "tokio runtime async entrypoint block_on",
    resultCount: 2,
    results: [
      {
        chunk_id: 4,
        app_name: "Visual Studio Code",
        window_name: "async_runtime.rs – memento-core",
        image_path: "https://picsum.photos/seed/vscode1/800/600",
        captured_at: "2026-03-04T09:45:00.000Z",
        browser_url: "",
        text_content: "// TODO: replace block_on with a proper async entrypoint...",
      },
    ],
    duration: 450,
    timestamp: "2026-03-04T10:00:02.500Z",
  },
  {
    stepId: "step-reason-1",
    stepType: "reasoning",
    status: "completed",
    title: "Synthesizing results",
    reasoning:
      "Found 5 relevant sources across 4 applications: Notion (meeting notes), Chrome (documentation), Slack (action items), VS Code (code reference), and Discord (community discussion). The sources provide a comprehensive view of the meeting topics, action items, and related context. Merging into a coherent summary organized by topic.",
    duration: 210,
    timestamp: "2026-03-04T10:00:03.000Z",
  },
  {
    stepId: "step-final",
    stepType: "completion",
    status: "final",
    title: "Generating answer",
    message: "Composing final response with citations to all relevant sources.",
    duration: 1100,
    timestamp: "2026-03-04T10:00:04.000Z",
  },
];

// ============================================================================
// MOCK MESSAGES - FULL CONVERSATION
// ============================================================================

export const MOCK_MESSAGES: MementoUIMessage[] = [
  // ── User turn ──────────────────────────────────────────────────────────────
  {
    id: "mock-user-1",
    role: "user",
    parts: [
      {
        type: "text",
        text: "What were the key points from the Rust async meeting I attended last week?",
      },
    ],
  },

  // ── Assistant turn with full thinking + sources + cited text ───────────────
  {
    id: "mock-assistant-1",
    role: "assistant",
    parts: [
      // Thinking step 1: Planning
      {
        type: "data-thinking",
        data: MOCK_THINKING_STEPS[0],
      },
      // Thinking step 2: First search
      {
        type: "data-thinking",
        data: MOCK_THINKING_STEPS[1],
      },
      // Thinking step 3: Second search
      {
        type: "data-thinking",
        data: MOCK_THINKING_STEPS[2],
      },
      // Thinking step 4: Third search
      {
        type: "data-thinking",
        data: MOCK_THINKING_STEPS[3],
      },
      // Thinking step 5: Reasoning
      {
        type: "data-thinking",
        data: MOCK_THINKING_STEPS[4],
      },
      // Thinking step 6: Final
      {
        type: "data-thinking",
        data: MOCK_THINKING_STEPS[5],
      },

      // Sources payload - this populates the sourceMap for citations
      {
        type: "data-sources",
        data: {
          includeImages: true,
          sources: MOCK_SOURCES,
        },
      },

      // Final markdown answer with inline citations using [[chunk_N]] format
      {
        type: "text",
        text: `Here are the key points from last week's Rust async meeting:

## Meeting Agenda [[chunk_1]]

The meeting covered three main topics:

1. **Pin API Stabilisation** – The RFC is ready for final comment period. The team discussed making the Pin API more ergonomic for everyday use.

2. **Tokio 1.40 Migration Guide** – A formal guide is in progress, with the testing sprint starting Monday [[chunk_3]].

3. **async-trait Removal Timeline** – The team agreed to target stable Rust 1.82 as the cutoff for async trait stabilization [[chunk_5]].

## Core Concepts Revisited [[chunk_2]]

> *"A Future is a value that may not have finished computing yet."*

The discussion referenced the async book to align the team on poll-based execution semantics. Understanding Futures is fundamental to working with async Rust.

## Action Items [[chunk_3]]

| Owner | Task | Due |
|-------|------|-----|
| @alice | Pin RFC PR | End of Week |
| @bob | Update migration guide | Friday |
| Team | Tokio 1.40 testing sprint | Monday |

## Related Code Changes [[chunk_4]]

A \`// TODO\` was flagged in \`async_runtime.rs\` to replace \`block_on\` with a proper async entrypoint once Tokio 1.40 ships—this aligns with the migration timeline above.

## Community Discussion [[chunk_5]]

The Discord community also discussed the async traits stabilization timeline, noting that major improvements to compile times are expected with the new implementation.

---

*Found information from 5 sources across Notion, Chrome, Slack, VS Code, and Discord.*`,
      },
    ],
  },

  // ── Second user turn ───────────────────────────────────────────────────────
  {
    id: "mock-user-2",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Who owns the Pin RFC PR?",
      },
    ],
  },

  // ── Second assistant turn (shorter response) ───────────────────────────────
  {
    id: "mock-assistant-2",
    role: "assistant",
    parts: [
      // Single thinking step for quick lookup
      {
        type: "data-thinking",
        data: {
          stepId: "step-quick-search",
          stepType: "searching",
          status: "completed",
          title: "Looking up Pin RFC owner",
          query: "Pin RFC PR owner alice",
          resultCount: 1,
          results: [
            {
              chunk_id: 3,
              app_name: "Slack",
              window_name: "#rust-async – action items thread",
              image_path: "https://picsum.photos/seed/slack1/800/600",
              captured_at: "2026-03-04T10:10:00.000Z",
              browser_url: "",
              text_content: "Action items: @alice owns the Pin RFC PR...",
            },
          ],
          duration: 280,
          timestamp: "2026-03-04T10:05:00.000Z",
        },
      },
      {
        type: "data-thinking",
        data: {
          stepId: "step-final-2",
          stepType: "completion",
          status: "final",
          title: "Generating answer",
          duration: 150,
          timestamp: "2026-03-04T10:05:01.000Z",
        },
      },

      // Sources for this response
      {
        type: "data-sources",
        data: {
          includeImages: false,
          sources: [MOCK_SOURCES[2]], // Just the Slack source
        },
      },

      // Short answer with citation
      {
        type: "text",
        text: `**@alice** owns the Pin RFC PR [[chunk_3]]. According to the action items from the Slack thread, she is expected to have it ready by end of week.`,
      },
    ],
  },

  // ── Third user turn ────────────────────────────────────────────────────────
  {
    id: "mock-user-3",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Show me what the async book says about Futures",
      },
    ],
  },

  // ── Third assistant turn (with image grid) ─────────────────────────────────
  {
    id: "mock-assistant-3",
    role: "assistant",
    parts: [
      {
        type: "data-thinking",
        data: {
          stepId: "step-search-futures",
          stepType: "searching",
          status: "completed",
          title: "Searching for Futures documentation",
          query: "async book Futures rust-lang",
          resultCount: 2,
          results: [
            {
              chunk_id: 2,
              app_name: "Google Chrome",
              window_name: "Rust Async Book – async/.await",
              image_path: "https://picsum.photos/seed/chrome1/800/600",
              captured_at: "2026-03-04T09:58:00.000Z",
              browser_url: "https://rust-lang.github.io/async-book/",
              text_content: "The async/.await syntax is built on Futures...",
            },
          ],
          duration: 320,
          timestamp: "2026-03-04T10:10:00.000Z",
        },
      },
      {
        type: "data-thinking",
        data: {
          stepId: "step-final-3",
          stepType: "completion",
          status: "final",
          title: "Generating answer",
          duration: 200,
          timestamp: "2026-03-04T10:10:01.000Z",
        },
      },

      // Sources with includeImages: true to show the image grid
      {
        type: "data-sources",
        data: {
          includeImages: true,
          sources: [MOCK_SOURCES[1]], // Chrome source with async book
        },
      },

      {
        type: "text",
        text: `From the Rust Async Book that you had open [[chunk_2]]:

> *"The async/.await syntax is built on Futures. A Future is a value that may not have finished computing yet. This allows for efficient, non-blocking code execution."*

The book explains that Futures are the foundation of Rust's async model. Key points:

- **Lazy Execution**: Futures don't do anything until polled
- **Zero-Cost Abstractions**: The compiler transforms async/await into state machines
- **Composability**: Futures can be combined using combinators like \`join!\` and \`select!\`

You can revisit the full documentation at [rust-lang.github.io/async-book](https://rust-lang.github.io/async-book/).`,
      },
    ],
  },
];

// ============================================================================
// HELPER: Get mock response for a given user message
// Use this to return static mock data instead of making API calls
// ============================================================================

export function getMockResponse(userMessage: string): MementoUIMessage | null {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes("rust") && lowerMessage.includes("async") && lowerMessage.includes("meeting")) {
    return MOCK_MESSAGES[1]; // First assistant response
  }

  if (lowerMessage.includes("pin") && lowerMessage.includes("rfc")) {
    return MOCK_MESSAGES[3]; // Second assistant response
  }

  if (lowerMessage.includes("future") || lowerMessage.includes("async book")) {
    return MOCK_MESSAGES[5]; // Third assistant response
  }

  // Default: return the first assistant response
  return MOCK_MESSAGES[1];
}

// ============================================================================
// Flag to enable/disable mock mode
// ============================================================================

export const USE_MOCK_DATA = false;
;
