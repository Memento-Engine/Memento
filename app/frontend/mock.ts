import type { MementoUIMessage } from "@/components/types";

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

  // ── Assistant turn ─────────────────────────────────────────────────────────
  {
    id: "mock-assistant-1",
    role: "assistant",
    parts: [
      // thinking steps
      {
        type: "data-thinking",
        data: {
          stepId: "step-plan-1",
          stepType: "planning",
          status: "completed",
          title: "Planning search strategy",
          description: "Decomposing query into targeted sub-searches.",
          duration: 340,
          timestamp: "2026-03-04T10:00:00.000Z",
        },
      },
      {
        type: "data-thinking",
        data: {
          stepId: "step-search-1",
          stepType: "searching",
          status: "completed",
          title: "Searching for Rust async meeting notes",
          query: "Rust async meeting notes",
          resultCount: 6,
          results: [
            {
              chunk_id: 1,
              app_name: "Notion",
              window_name: "Rust Async Working Group – Weekly Sync",
              image_path: "",
              captured_at: "2026-03-04T09:52:10.000Z",
            },
            {
              chunk_id: 2,
              app_name: "Google Chrome",
              window_name: "Rust Async Book – async/.await",
              image_path: "",
              captured_at: "2026-03-04T09:58:00.000Z",
            },
          ],
          duration: 820,
          timestamp: "2026-03-04T10:00:01.000Z",
        },
      },
      {
        type: "data-thinking",
        data: {
          stepId: "step-search-2",
          stepType: "searching",
          status: "completed",
          title: "Searching for follow-up action items",
          query: "async meeting action items tokio runtime",
          resultCount: 3,
          results: [
            {
              chunk_id: 3,
              app_name: "Slack",
              window_name: "#rust-async – action items thread",
              image_path: "",
              captured_at: "2026-03-04T10:10:00.000Z",
            },
          ],
          duration: 670,
          timestamp: "2026-03-04T10:00:02.000Z",
        },
      },
      {
        type: "data-thinking",
        data: {
          stepId: "step-reason-1",
          stepType: "reasoning",
          status: "completed",
          title: "Synthesising results",
          reasoning:
            "Three distinct source types found: Notion notes, Chrome tabs, and Slack threads. Merging into a coherent summary.",
          duration: 210,
          timestamp: "2026-03-04T10:00:03.000Z",
        },
      },
      {
        type: "data-thinking",
        data: {
          stepId: "step-final",
          stepType: "completion",
          status: "final",
          title: "Generating answer",
          duration: 1100,
          timestamp: "2026-03-04T10:00:04.000Z",
        },
      },

      // sources payload
      {
        type: "data-sources",
        data: {
          includeImages: false,
          sources: [
            {
              chunkId: "chunk_1",
              appName: "Notion",
              windowTitle: "Rust Async Working Group – Weekly Sync",
              capturedAt: "2026-03-04T09:52:10.000Z",
              browserUrl: "",
              textContent:
                "Agenda: 1) Pin API stabilisation 2) tokio 1.40 migration guide 3) async-trait removal timeline.",
              imagePath: "",
            },
            {
              chunkId: "chunk_2",
              appName: "Google Chrome",
              windowTitle: "Rust Async Book – async/.await",
              capturedAt: "2026-03-04T09:58:00.000Z",
              browserUrl: "https://rust-lang.github.io/async-book/",
              textContent:
                "The async/.await syntax is built on Futures. A Future is a value that may not have finished computing yet.",
              imagePath: "",
            },
            {
              chunkId: "chunk_3",
              appName: "Slack",
              windowTitle: "#rust-async – action items",
              capturedAt: "2026-03-04T10:10:00.000Z",
              browserUrl: "",
              textContent:
                "Action items: @alice owns the Pin RFC PR. @bob to update the migration guide before Friday. Tokio v1.40 testing sprint starts Monday.",
              imagePath: "",
            },
            {
              chunkId: "chunk_4",
              appName: "Visual Studio Code",
              windowTitle: "async_runtime.rs – memento-core",
              capturedAt: "2026-03-04T09:45:00.000Z",
              browserUrl: "",
              textContent:
                "// TODO: replace block_on with a proper async entrypoint once tokio 1.40 ships.",
              imagePath: "",
            },
          ],
        },
      },

      // final markdown answer with inline citations
      {
        type: "text",
        text: [
          "Here are the key points from last week's Rust async meeting:",
          "",
          "### Agenda topics [chunk_1]",
          "1. **Pin API stabilisation** – the RFC is ready for final comment period.",
          "2. **Tokio 1.40 migration guide** – a formal guide is in progress; the testing sprint starts Monday [chunk_3].",
          "3. **async-trait removal timeline** – the team agreed to target stable Rust 1.82 as the cutoff.",
          "",
          "### Core concepts revisited [chunk_2]",
          "> *A Future is a value that may not have finished computing yet.*",
          "",
          "The discussion referenced the async book to align the team on poll-based execution semantics.",
          "",
          "### Action items [chunk_3]",
          "| Owner | Task | Due |",
          "|-------|------|-----|",
          "| @alice | Pin RFC PR | EOW |",
          "| @bob | Update migration guide | Friday |",
          "| Team | Tokio 1.40 testing sprint | Monday |",
          "",
          "### Related code [chunk_4]",
          "A `// TODO` was flagged in `async_runtime.rs` to replace `block_on` once Tokio 1.40 ships—this aligns with the migration timeline above.",
        ].join("\n"),
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

  // ── Second assistant turn ──────────────────────────────────────────────────
  {
    id: "mock-assistant-2",
    role: "assistant",
    parts: [
      {
        type: "data-sources",
        data: {
          includeImages: false,
          sources: [
            {
              chunkId: "chunk_3",
              appName: "Slack",
              windowTitle: "#rust-async – action items",
              capturedAt: "2026-03-04T10:10:00.000Z",
              browserUrl: "",
              textContent:
                "Action items: @alice owns the Pin RFC PR. @bob to update the migration guide before Friday.",
              imagePath: "",
            },
          ],
        },
      },
      {
        type: "text",
        text: "**@alice** owns the Pin RFC PR [chunk_3]. She is expected to have it ready by end of week.",
      },
    ],
  },
];
