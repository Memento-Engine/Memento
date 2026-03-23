# Memento AI

> Your personal AI memory — search everything you've ever seen on your screen, instantly.

Memento AI is a privacy-first, local desktop application that continuously captures your screen, indexes the content using OCR and semantic embeddings, and lets you search or ask questions about your own history using natural language. All data stays on your machine; only minimal, relevant context is ever sent to an LLM.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development](#development)
- [Building for Production](#building-for-production)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Continuous screen capture & OCR** — a background Windows Service silently indexes everything you see.
- **Hybrid search** — combines semantic vector search (local embeddings via fastembed/ONNX) with keyword search for accurate retrieval.
- **AI-powered Q&A** — a LangGraph agent pipeline plans, executes, and synthesises answers from your captured memories.
- **Automatic replanning** — if a search step yields empty results, the agent revises its plan and retries automatically.
- **Privacy by default** — your full database never leaves your machine; the LLM only receives the top-ranked memory snippets and your query.
- **Free & premium tiers** — rate-limited free access; premium credits unlock higher-quality models via the AI Gateway.
- **Auto-updates** — Velopack delivers delta patches silently; the Windows Service stops, updates, and restarts without user intervention.
- **Streaming answers** — the final answer is streamed token-by-token to the frontend via Server-Sent Events.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Desktop (Windows)                        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               Tauri App  (memento.exe)                │  │
│  │          React shell + Tauri IPC bridge               │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │          Next.js Frontend  (port 3000)         │   │  │
│  │  │   Chat UI · Search UI · Settings · Auth        │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  └──────────────────┬────────────────────────────────────┘  │
│                     │ HTTP (dynamic port 4170–4177)          │
│  ┌──────────────────▼────────────────────────────────────┐  │
│  │          Agents Server  (memento-agents.exe)          │  │
│  │   LangGraph pipeline: clarify → plan → execute →      │  │
│  │   replan → final answer   (Node.js / TypeScript)      │  │
│  └──────────────────┬────────────────────────────────────┘  │
│                     │ SQLite (local DB)                      │
│  ┌──────────────────▼────────────────────────────────────┐  │
│  │         Daemon  (memento-daemon.exe)                  │  │
│  │   Windows Service · screen capture · OCR ·            │  │
│  │   chunking · fastembed embeddings · SQLite storage    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │ HTTPS (OpenRouter)
┌─────────────────────────▼───────────────────────────────────┐
│                  AI Gateway  (cloud / self-hosted)           │
│   Express API · model routing · rate limiting · credits      │
│   PostgreSQL for usage tracking · OpenRouter provider        │
└─────────────────────────────────────────────────────────────┘
```

### Component Summary

| Component | Language | Role |
|-----------|----------|------|
| `app/src-tauri` | Rust | Tauri desktop shell, Velopack auto-update, IPC |
| `app/frontend` | TypeScript / Next.js | Chat & search UI, settings, OAuth |
| `app/agents` | TypeScript / Node.js | LangGraph AI agent pipeline, Express API |
| `crates/daemon` | Rust | Windows Service — screen capture, OCR, embeddings, SQLite |
| `crates/core` | Rust | Shared DB schema, config helpers |
| `crates/service-helper` | Rust | Admin-elevated helper for service install/uninstall |
| `ai-gateway` | TypeScript / Node.js | Cloud LLM gateway — routing, rate limiting, credits |
| `shared` | TypeScript | Shared types, path utilities, error classes |

---

## Tech Stack

- **Desktop shell**: [Tauri v2](https://tauri.app) (Rust)
- **Frontend**: [Next.js 15](https://nextjs.org) + React 19 + Tailwind CSS v4
- **Agent pipeline**: [LangGraph](https://langchain-ai.github.io/langgraphjs/) + [LangChain](https://js.langchain.com/)
- **Daemon**: Rust async (Tokio) + [fastembed](https://github.com/Anush008/fastembed-rs) + ONNX Runtime
- **Database** (local): SQLite via `rusqlite`
- **Database** (gateway): PostgreSQL via Drizzle ORM
- **LLM provider**: [OpenRouter](https://openrouter.ai)
- **Packaging & updates**: [Velopack](https://velopack.io)
- **Logging**: pino (Node.js) + tracing (Rust)
- **Error tracking**: Sentry

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| [Rust](https://rustup.rs) | stable (1.80+) | `rustup update stable` |
| [Node.js](https://nodejs.org) | 20 LTS | Agents, frontend, gateway |
| [npm](https://npmjs.com) | 10+ | bundled with Node.js |
| Windows 10 / 11 | — | Daemon & service are Windows-only |
| [Tauri prerequisites](https://tauri.app/start/prerequisites/) | — | WebView2, Visual C++ build tools |

> **Note**: The screen-capture daemon and Windows Service integration are Windows-only. The frontend and agents server can be developed on any platform.

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Memento-Engine/Memento.git
cd Memento
```

### 2. Install Node.js dependencies

```bash
# Root workspace
npm install

# Frontend
npm ci --prefix app/frontend

# Agents server
npm ci --prefix app/agents

# AI Gateway (optional — needed only if running the gateway locally)
npm ci --prefix ai-gateway
```

### 3. Configure environment variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key from [openrouter.ai](https://openrouter.ai) |
| `DATABASE_URL` | PostgreSQL connection string (AI Gateway) |
| `JWT_SECRET` | Secret for signing user JWTs |
| `MAX_REPLAN_ATTEMPTS` | Max agent replan retries (default: `3`) |

### 4. Start development services

```bash
# Start the Tauri dev build (also starts frontend + agents concurrently)
cd app
npm run tauri:dev
```

Or start individual services:

```bash
# Frontend only (http://localhost:3000)
npm run dev --prefix app/frontend

# Agents server only
npm run dev:agent --prefix app/agents

# Both frontend + agents (without Tauri)
cd app && npm run dev:services
```

---

## Development

### Agents server

```bash
cd app/agents
npm run dev        # tsx watch + tsc typecheck (concurrent)
npm run typecheck  # type-check only
```

### Frontend

```bash
cd app/frontend
npm run dev   # Next.js dev server on :3000
npm run build # production build (output: frontend/out)
```

### Rust (Daemon / Core / Service-helper)

```bash
cargo build                          # debug build, all crates
cargo build --release -p memento-daemon
cargo test                           # run all Rust tests
cargo clippy --all                   # lint
cargo fmt --all                      # format
```

### AI Gateway

```bash
cd ai-gateway
npm run dev   # tsx watch on server.ts
```

Run database migrations before starting the gateway:

```bash
# (migrations run automatically on gateway startup)
```

---

## Building for Production

A single PowerShell script builds every component and packages the release with Velopack:

```powershell
.\scripts\build-release.ps1 -Version "1.2.0"
```

This will:

1. Build `memento-daemon.exe` (Rust, release)
2. Build `service-helper.exe` (Rust, release)
3. Bundle `memento-agents.exe` (Node.js → pkg executable)
4. Build the Next.js frontend (static export)
5. Build the Tauri app (`memento.exe`)
6. Pack everything with Velopack into `velopack-output/`

To trigger a release through CI, push a version tag:

```bash
git tag v1.2.0
git push origin v1.2.0
```

### File locations (Windows)

| Item | Path |
|------|------|
| App installation | `%LOCALAPPDATA%\memento\current\` |
| User data & DB | `%APPDATA%\Memento\` |
| Embedding models | `%APPDATA%\Memento\models\` |
| Logs | `%APPDATA%\Memento\logs\` |
| Shared IPC files | `%PROGRAMDATA%\memento\` |

---

## Project Structure

```
Memento/
├── app/
│   ├── frontend/          # Next.js UI
│   ├── agents/            # LangGraph agent server (Node.js)
│   └── src-tauri/         # Tauri desktop shell (Rust)
├── crates/
│   ├── core/              # Shared Rust: DB, config
│   ├── daemon/            # Windows Service: capture, OCR, embeddings
│   └── service-helper/    # Admin helper for service management
├── ai-gateway/            # Cloud LLM gateway (Node.js)
├── shared/                # Shared TypeScript types & utilities
├── migrations/            # PostgreSQL migrations (AI Gateway)
├── docs/                  # Architecture docs
├── scripts/               # Build & release scripts
└── Cargo.toml             # Rust workspace
```

---

## Contributing

Contributions are welcome! Please follow the conventions below.

### Branch naming

```
<type>/<issue-id>-<short-description>

Examples:
  feature/123-add-dark-mode
  fix/456-memory-leak-in-daemon
  docs/update-readme
```

Valid types: `feature`, `fix`, `hotfix`, `refactor`, `docs`, `test`, `chore`

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

Examples:
  feat(agents): add streaming final-answer endpoint
  fix(daemon): handle OCR timeout gracefully
  docs: update architecture diagram
  chore(deps): bump langchain to 1.2.0
```

Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`

### Git hooks (Lefthook)

Pre-commit and pre-push hooks run automatically and enforce the above conventions, scan for secrets, and lint/format code. Install once:

```bash
# Windows
.\install-lefthook.ps1

# Unix
./setup-hooks.sh
```

To run hooks manually:

```bash
npx lefthook run pre-commit
npx lefthook run pre-push
```

---

## License

This project is under active development. License to be specified.
