# Memento AI

https://github.com/user-attachments/assets/727ef123-f4bb-4c52-8e53-e325f6b28eda

## What It Does

Instead of manually hunting through files, tabs, and notes, you ask:

- *"When did I design the booking system schema?"*
- *"What authentication library was I looking at last Tuesday?"*
- *"Show me everything I read about multi-threading this week."*

Memento AI searches your local screen history using hybrid semantic + keyword retrieval, runs a multi-step agentic pipeline to reason over the results, and streams a cited answer back to you in seconds.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | Next.js 16, React 19, Tailwind CSS v4 |
| Agent pipeline | Node.js 20, LangGraph, Express 5 |
| AI Gateway | Node.js (ESM), Express 5, Drizzle ORM, PostgreSQL |
| Core / Daemon | Rust 2021, SQLite + sqlite-vec, Windows APIs |
| Packaging | Velopack |

---

## Architecture

```
Screen Activity
      │ (Rust daemon — continuous capture + OCR + embedding)
      ▼
Local SQLite DB
  ├── frames        (app, window, url, timestamp)
  ├── chunks        (OCR text segments)
  ├── chunks_fts    (FTS5 keyword index)
  └── vec_chunks    (384-dim vector embeddings)
      │
      ▼
Agent Pipeline  (LangGraph StateGraph)
  ① Chat Context Manager   → bounded conversation window (≤1500 tokens)
  ② Classifier & Router    → rewrite query + route (chat / search / mixed)
  ③ Planner                → generate multi-step search DAG
  ④ Executor               → run steps in parallel (ReAct loop per step)
     └─ Tools: sql · semantic · hybrid · webSearch · readMore
  ⑤ Final Answer           → synthesize + stream cited answer + follow-ups
      │
      ▼
Frontend (Tauri desktop app)
  SSE streaming: step events → text chunks → source cards → follow-up questions
```

For the full pipeline breakdown, see [docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md).

---

## Core Principles

### Privacy-First

- All screen data is stored **only on your local hard drive**
- No raw data, embeddings, or full database contents are ever sent to the cloud
- When a cloud LLM is used, only your query and the top relevant text snippets are forwarded — nothing else

### Local Performance

- FTS5 keyword search and vector similarity search run entirely on-device
- The Rust daemon handles screen capture, OCR, and embedding generation locally
- The agent can answer many queries without any cloud LLM call at all (chat route)

### Two Search Modes

| Mode | Speed | Depth |
|---|---|---|
| `search` | Fast | Up to 4 ReAct turns, 3 searches, 10 results/search |
| `accurateSearch` | Thorough | Up to 8 ReAct turns, 7 searches, 20 results/search |

---

## Key Features

- **Continuous screen memory** — captures what you see, indexes it automatically
- **Hybrid search** — combines FTS5 keyword matching with semantic vector search
- **Agentic reasoning** — multi-step planner + ReAct executor for complex queries
- **Streaming answers** — responses stream token-by-token with inline source citations
- **Web search fallback** — optionally augments local memory with live web results
- **Conversation-aware** — understands follow-up questions using a sliding context window
- **Privacy by default** — fully offline retrieval mode; cloud LLM is opt-in

---

## Use Cases

- Search what you were working on at a specific time
- Recall documentation you read but didn't bookmark
- Trace back to where you first encountered a concept or error
- Summarize your activity on a project over a time range
- Find a specific code snippet you saw in someone else's repo
- Answer "what did I do last week?" with evidence

---

## Getting Started

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions including prerequisites, environment configuration, and how to run each service in development.

**Quick start (Windows):**

```powershell
git clone <repo-url>
cd search_engine
.\setup-hooks.ps1          # install deps + git hooks
cd ai-gateway
cp .env.example .env       # fill in OPENROUTER_API_KEY + JWT secrets
npm run dev                # start AI gateway on :4180
# in another terminal:
cd app
npm run tauri:dev          # start agents + frontend + Tauri desktop app
```

---

## Repository Layout

```
search_engine/
├── app/
│   ├── agents/        ← LangGraph agent server (Node.js)
│   ├── frontend/      ← Next.js UI (static export for Tauri)
│   └── src-tauri/     ← Tauri desktop shell (Rust)
├── ai-gateway/        ← LLM proxy / rate limiter / credit tracker
├── crates/
│   ├── core/          ← Core Rust library (SQLite, OCR, embeddings)
│   ├── daemon/        ← Screen capture daemon binary
│   └── service-helper/← Windows service management helper
├── shared/            ← Shared TypeScript types and utilities
├── migrations/        ← Local SQLite schema migrations
├── docs/
│   └── AGENT_ARCHITECTURE.md ← Detailed agentic pipeline documentation
├── scripts/
│   └── build-release.ps1     ← Full Velopack release build
└── CONTRIBUTING.md    ← Setup, dev workflow, and contribution guide
```

---

## Documentation

| Document | Description |
|---|---|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Prerequisites, setup, dev workflow, git conventions |
| [docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md) | Full agentic pipeline, RAG system, tools, skills, token budgets |
| [ai-gateway/README.md](ai-gateway/README.md) | AI gateway deployment and configuration |

---

## Philosophy

Your memories are yours.

Memento AI is an intelligent retrieval layer over your own local data — not a cloud sync service. It helps you remember, search, and reason over your information without giving up control.

---

## Status

Active development. Contributions and feedback welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

See [LICENSE](LICENSE).
