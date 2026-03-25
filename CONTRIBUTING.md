# Contributing to Memento AI

Welcome! This document explains how to get the project running locally and how to contribute effectively.

---

## Table of Contents

1. [Tech Stack Overview](#tech-stack-overview)
2. [Prerequisites](#prerequisites)
3. [Repository Structure](#repository-structure)
4. [Environment Setup](#environment-setup)
   - [Clone & Hooks](#1-clone--install-git-hooks)
   - [AI Gateway](#2-ai-gateway-setup)
   - [Agents Service](#3-agents-service-setup)
   - [Frontend](#4-frontend-setup)
   - [Rust Crates](#5-rust-crates-setup)
5. [Running in Development](#running-in-development)
6. [Building for Production](#building-for-production)
7. [Project-level Scripts Reference](#project-level-scripts-reference)
8. [Git Workflow & Commit Convention](#git-workflow--commit-convention)
9. [Troubleshooting](#troubleshooting)

---

## Tech Stack Overview

| Layer | Technology |
|---|---|
| Desktop shell | **Tauri v2** (Rust) |
| Frontend | **Next.js 16**, React 19, Tailwind CSS v4 |
| Agent service | **Node.js 20**, Express 5, LangGraph, tsx |
| AI Gateway | **Node.js** (ESM), Express 5, Drizzle ORM, PostgreSQL |
| Core / Daemon | **Rust** (2021 edition), SQLite + sqlite-vec, Windows APIs |
| Auto-updates | Velopack |
| Observability | Sentry, Pino |
| Git hooks | Lefthook |

---

## Prerequisites

Install the following tools before anything else.

### Required — All Platforms

| Tool | Version | Install |
|---|---|---|
| **Node.js** | v20 LTS | https://nodejs.org or `nvm install 20` |
| **Rust** | stable (2021 edition) | https://rustup.rs |
| **Git** | latest | https://git-scm.com |

### Required — Windows (primary dev platform)

| Tool | Install |
|---|---|
| **Visual Studio Build Tools 2022** (C++ workload) | Required by `windows` and `xcap` Rust crates |
| **WebView2 Runtime** | Bundled with Windows 11 / download from Microsoft |
| **Lefthook** (git hooks) | `npm install -g @evilmartians/lefthook` **or** `choco install lefthook` |

### Required — AI Gateway only

| Tool | Install |
|---|---|
| **PostgreSQL** | https://www.postgresql.org/download/ (or Docker) |

### Optional but recommended

| Tool | Purpose |
|---|---|
| **Tauri CLI** (`cargo install tauri-cli`) | `cargo tauri dev` / `cargo tauri build` |
| **Chocolatey** | Windows package manager — easier lefthook install |
| **Docker** | Run PostgreSQL for the AI gateway without a local install |

---

## Repository Structure

```
search_engine/
├── app/
│   ├── agents/          ← Node.js agent server (LangGraph pipeline)
│   ├── frontend/        ← Next.js frontend (static export for Tauri)
│   └── src-tauri/       ← Tauri desktop shell (Rust)
├── ai-gateway/          ← AI proxy / LLM gateway (Express + Drizzle + PostgreSQL)
├── crates/
│   ├── core/            ← Core Rust library (SQLite, OCR, embeddings)
│   ├── daemon/          ← Screen capture daemon binary
│   └── service-helper/  ← Windows service management helper
├── shared/              ← Shared TypeScript utilities (ESM)
├── migrations/          ← Local SQLite migrations
├── scripts/
│   └── build-release.ps1 ← Full release build script
├── Cargo.toml           ← Rust workspace root
└── package.json         ← Root (minimal — each sub-project is independent)
```

---

## Environment Setup

### 1. Clone & Install Git Hooks

```powershell
git clone <repo-url>
cd search_engine
```

**Windows:**
```powershell
.\setup-hooks.ps1
```

**macOS / Linux:**
```bash
chmod +x setup-hooks.sh
./setup-hooks.sh
```

These scripts:
- Check that `lefthook` is installed (and tell you how to install it if not)
- Run `lefthook install` to register `pre-commit`, `pre-push`, and `commit-msg` hooks
- Run `npm install` in `app/` and `app/agents/`
- Copy `ai-gateway/.env.example` → `ai-gateway/.env` if it doesn't already exist

---

### 2. AI Gateway Setup

The AI gateway is an Express proxy that sits between all agent LLM calls and the upstream providers (OpenRouter, etc.). It handles rate limiting, credit tracking, and model routing.

```powershell
cd ai-gateway
```

**a) Configure environment**

```powershell
Copy-Item .env.example .env  # already done by setup-hooks if you ran it
```

Open `ai-gateway/.env` and fill in **at minimum**:

```env
# Required: your OpenRouter key to forward LLM calls
OPENROUTER_API_KEY=sk-or-...

# Required: JWT secrets (any random 32+ char string works locally)
JWT_ACCESS_SECRET=change-me-at-least-32-characters-long
JWT_REFRESH_SECRET=change-me-at-least-32-characters-long

# Optional: Google OAuth (leave blank to skip OAuth login locally)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# PostgreSQL connection (change if your local Postgres differs)
# Not present in .env.example — add if using a custom host:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/memento
```

Full variable reference — `ai-gateway/.env.example`:

| Variable | Default / Notes |
|---|---|
| `AI_GATEWAY_HOST` | `127.0.0.1` |
| `AI_GATEWAY_PORT` | `4180` |
| `OPENROUTER_API_KEY` | **Required** |
| `AI_GATEWAY_DEFAULT_MODEL` | `openai/gpt-4o-mini` |
| `AI_GATEWAY_PLANNER_MODEL` | `openai/gpt-4o-mini` |
| `AI_GATEWAY_EXECUTOR_MODEL` | `deepseek/deepseek-chat` |
| `AI_GATEWAY_FINAL_MODEL` | `openai/gpt-4o-mini` |
| `AI_GATEWAY_FREE_RPM` | `20` |
| `AI_GATEWAY_FREE_DAILY_TOKENS` | `40000` |
| `JWT_ACCESS_SECRET` | **Required** (≥32 chars) |
| `JWT_REFRESH_SECRET` | **Required** (≥32 chars) |

**b) Install dependencies**

```powershell
npm install
```

**c) Run database migrations** (PostgreSQL must be running)

```powershell
npx drizzle-kit migrate
```

**d) Start the gateway**

```powershell
npm run dev
# Starts on http://127.0.0.1:4180
```

---

### 3. Agents Service Setup

The agents service is the LangGraph pipeline server. It runs as a sidecar process embedded in the Tauri app but can also run standalone for development.

```powershell
cd app/agents
npm install
```

**Start in dev mode** (watch mode + TypeScript check):

```powershell
npm run dev
# Starts on http://127.0.0.1:4170 (auto-selects from range 4170-4177)
```

Or start just the server without the TypeScript watcher:

```powershell
npm run dev:agent
```

The agents service expects the AI gateway to be reachable at `http://127.0.0.1:4180` (dev mode) or `https://api.trymemento.in` (production). This is controlled by the `MEMENTO_DEV=true` env variable that `dev:agent` sets automatically.

---

### 4. Frontend Setup

The frontend is a Next.js app that exports static HTML for Tauri, but can also run as a standalone dev server.

```powershell
cd app/frontend
npm install
npm run dev
# Starts on http://localhost:3000
```

The dev server proxies API calls to the local agents service and core daemon automatically.

---

### 5. Rust Crates Setup

The Rust workspace covers the desktop shell, screen capture daemon, core library, and service helper.

**Build all crates** (debug):

```powershell
# From repo root
cargo build
```

**Build just the daemon** (the background screen capture process):

```powershell
cargo build -p memento-daemon
```

**Build the Tauri desktop app** (requires frontend to be built first — see below):

```powershell
cd app
cargo tauri build
```

> **Note:** The Tauri build automatically invokes `npm run build:all` via `beforeBuildCommand`. If you only want to iterate on Rust, skip `tauri build` and use `cargo build -p tauri-app` directly.

---

## Running in Development

To develop the full app (desktop shell + frontend + agents), run all services in parallel:

### Option A — Tauri dev mode (recommended, full desktop app)

```powershell
# From /app directory
# This runs: frontend dev server + agents dev server, then launches Tauri
npm run tauri:dev
```

Behind the scenes, `tauri.conf.json`'s `beforeDevCommand` runs `npm run dev:services` which concurrently starts the Next.js dev server and the agents dev server before Tauri opens.

### Option B — Services only (no desktop window, browser-based)

```powershell
# Terminal 1: AI gateway
cd ai-gateway && npm run dev

# Terminal 2: Agents service
cd app/agents && npm run dev:agent

# Terminal 3: Frontend
cd app/frontend && npm run dev
# Open http://localhost:3000
```

### Option C — Rust daemon standalone (for core/daemon development)

```powershell
# Build and run the screen capturing daemon directly
cargo run -p memento-daemon
```

The daemon writes port files to `%PROGRAMDATA%\memento\ports\` (Windows production) or the user home memento dir (dev mode), which the frontend and agents use to discover service endpoints.

---

## Building for Production

Use the release script for a fully packaged, installable build:

```powershell
# From repo root — builds everything and packages with Velopack
.\scripts\build-release.ps1 -Version "1.0.0"
```

Build order executed by the script:

1. `cargo build --release -p memento-daemon`
2. `cargo build --release -p service-helper`
3. `cd app/agents && npm ci && npm run build:exe` → produces `app/agents/dist/memento-agents.exe`
4. `cd app/frontend && npm ci && npm run build` → static export to `app/frontend/out/`
5. `cd app && cargo tauri build --no-bundle`
6. Velopack (`vpk`) packages everything into `velopack-output/`

### Individual build commands

| What | Command | Output |
|---|---|---|
| Agents executable | `cd app/agents && npm run build:exe` | `app/agents/dist/memento-agents.exe` |
| Frontend static build | `cd app/frontend && npm run build` | `app/frontend/out/` |
| Rust (all, release) | `cargo build --release` | `target/release/` |
| Tauri (no bundle) | `cd app && cargo tauri build --no-bundle` | `target/release/tauri-app.exe` |

---

## Project-level Scripts Reference

### `app/package.json` (from `/app` directory)

| Script | What it does |
|---|---|
| `tauri:dev` | Full Tauri dev mode (starts services + opens desktop window) |
| `dev:services` | Starts frontend + agents concurrently (no desktop window) |
| `build:all` | Builds agents exe + frontend static export |
| `build:agents` | `npm ci` + `npm run build:exe` in `agents/` |
| `build:frontend` | `npm ci` + `npm run build` in `frontend/` |
| `tauri` | Raw Tauri CLI passthrough |

### `app/agents/package.json` (from `/app/agents`)

| Script | What it does |
|---|---|
| `dev` | tsx watch server + TypeScript check (concurrently) |
| `dev:agent` | tsx watch server only (`MEMENTO_DEV=true`) |
| `build:bundle` | esbuild → single CJS bundle |
| `build:exe` | bundle → pkg → standalone `.exe` (node20-win-x64) |
| `typecheck` | `tsc --noEmit --watch` |
| `latency:tail` | Tail latency log file (PowerShell) |

### `app/frontend/package.json` (from `/app/frontend`)

| Script | What it does |
|---|---|
| `dev` | Next.js dev server on `:3000` |
| `build` | Next.js static export |
| `start` | Next.js production server |
| `lint` | ESLint |

### `ai-gateway/package.json` (from `/ai-gateway`)

| Script | What it does |
|---|---|
| `dev` | tsx watch server (`MEMENTO_DEV=true`) |
| `start` | tsx run (production) |
| `typecheck` | `tsc --noEmit` |

---

## Git Workflow & Commit Convention

### Branching

```
main                  ← stable, protected
feature/123-my-feature ← new features
fix/456-bug-desc       ← bug fixes
chore/update-deps      ← maintenance
```

### Conventional Commits

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

**Valid types:**

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, no logic change |
| `refactor` | Refactoring (no feature / no fix) |
| `perf` | Performance improvement |
| `test` | Adding / fixing tests |
| `chore` | Build process, tooling, dependencies |
| `ci` | CI/CD configuration |

**Examples:**

```
feat(agents): add web search caching layer
fix(frontend): resolve SSE stream not closing on unmount
docs(gateway): add rate limit configuration reference
chore(deps): bump langchain to 1.2.0
```

### Lefthook hooks active on commit/push

| Hook | What it checks |
|---|---|
| `commit-msg` | Validates commit message matches Conventional Commits format |
| `pre-commit` | TypeScript type-check (if configured) |
| `pre-push` | Lint / type-check before push |

---

## Troubleshooting

### `cargo build` fails with missing `windows` SDK headers
Install **Visual Studio Build Tools 2022** with the **C++ Desktop Development** workload. Make sure `MSVC` and Windows 10/11 SDK components are checked.

### Tauri dev window doesn't open / WebView2 error
Install the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) from Microsoft. On Windows 11 it is pre-installed; on Windows 10 it may be missing.

### Agents service can't connect to AI gateway
- Confirm `ai-gateway` is running on port `4180`
- Confirm `OPENROUTER_API_KEY` is set in `ai-gateway/.env`
- In dev mode, agents connect to `http://127.0.0.1:4180` (set by `MEMENTO_DEV=true`)

### `npm run build:exe` fails with `pkg` error
The build requires Node.js 20. Run `node -v` to verify. If using `nvm`: `nvm use 20`.

### `npx drizzle-kit migrate` fails (AI gateway)
PostgreSQL must be running and reachable. The default connection is `localhost:5432`. If your Postgres is elsewhere, add `DATABASE_URL=postgresql://user:pass@host:port/dbname` to `ai-gateway/.env`.

### Lefthook not found after `npm install -g @evilmartians/lefthook`
The global npm bin directory may not be on `PATH`. Run `npm config get prefix` and add `<prefix>/bin` to your system `PATH`.

### Port file not found (frontend can't connect to daemon/agents)
The daemon writes port files to `%PROGRAMDATA%\memento\ports\` (Windows, production) or a home-directory path (dev). Run the daemon before starting the frontend, or start via `npm run tauri:dev` which coordinates startup automatically.
