# CI Waterfall Architecture

This document describes the tiered CI/CD system designed to catch common Windows deployment bugs at the earliest possible stage.

## Overview

The CI system is organized into 4 tiers, each accumulating checks from previous tiers:

```
┌──────────────────────────────────────────────────────────────────┐
│                    TIER 4 — main (Full CI)                       │
│     All 10 checks, Windows 10+11 matrix, required to pass        │
├──────────────────────────────────────────────────────────────────┤
│              TIER 3 — test branch (~30 min)                      │
│     + #6 Startup diagnostics, #8 Production simulation,         │
│       #10 Installer smoke test                                   │
├──────────────────────────────────────────────────────────────────┤
│           TIER 2 — develop/staging (~15 min)                     │
│     + #7 Win10+11 matrix, #5 Binary presence, #1 E2E smoke       │
├──────────────────────────────────────────────────────────────────┤
│              TIER 1 — Every PR (~2 min)                          │
│     #9 Anti-pattern grep, #3 ESLint, #4 Helper usage, #2 Unit    │
└──────────────────────────────────────────────────────────────────┘
```

## Check Catalog

### Tier 1 — Every PR (all branches)
**Windows Latest · ~2 min · No binaries needed**

| ID | Check | Type | Description |
|----|-------|------|-------------|
| #9 | Anti-pattern grep | Lint | Fails if `isDev: isDesktopProductionMode()` (wrong polarity) |
| #3 | ESLint invoke rules | Lint | Blocks raw `process.env` in invoke payloads |
| #4 | Helper usage grep | Lint | Ensures all invoke sites use `isDesktopProductionMode` |
| #2 | Daemon mode contract | Unit | Tests correct `isDev` mapping at all call sites |

### Tier 2 — develop / staging branches
**Windows 10 + 11 matrix · ~15 min**

| ID | Check | Type | Description |
|----|-------|------|-------------|
| #7 | OS Matrix Build | Build | Builds all components on Win10 (2019) and Win11 (latest) |
| #5 | Binary presence | Build | Verifies all required .exe files exist after build |
| #1 | E2E smoke test | E2E | Builds release → launches headless → checks health |

### Tier 3 — test branch
**Windows 10 + 11 matrix · ~30 min**

| ID | Check | Type | Description |
|----|-------|------|-------------|
| #6 | Startup diagnostics | E2E | Logs spawn commands, validates paths |
| #8 | Production simulation | E2E | Runs with prod flags, tests ProgramData paths |
| #10 | Installer smoke test | E2E | Installs Velopack package, validates files |

### Tier 4 — main
**Full CI run · All 10 checks · Windows 10 + 11**

All checks from all tiers must pass before merge.

## Workflow Files

```
.github/workflows/
├── ci-tier1-pr.yml           # PR checks (all branches)
├── ci-tier2-staging.yml      # develop/staging checks
├── ci-tier3-test.yml         # test branch checks
├── ci-tier4-main.yml         # main branch full CI
├── build-release.yml         # Release workflow (dispatch only)
├── _reusable-lint-checks.yml # Reusable: #9, #3, #4
├── _reusable-unit-tests.yml  # Reusable: #2, frontend/Rust tests
├── _reusable-build-checks.yml# Reusable: #7, #5
└── _reusable-e2e-tests.yml   # Reusable: #1, #6, #8, #10
```

## Branch Protection Rules

Recommended settings:

### All branches (PRs)
- Require: `ci-tier1-pr.yml` → `tier1-summary` job

### develop, staging
- Require: `ci-tier2-staging.yml` → `tier2-summary` job

### test
- Require: `ci-tier3-test.yml` → `tier3-summary` job

### main
- Require: `ci-tier4-main.yml` → `tier4-summary` job
- Require linear history
- Require signed commits (optional)

## Windows OS Bug Detection

These checks are specifically designed to catch common Windows deployment issues:

### Os error 3 (Path not found)
- **Check #1, #6**: E2E tests fail if this appears in daemon logs
- **Check #8**: Production simulation verifies ProgramData paths exist
- **Check #10**: Installer test validates all files are present

### Mode Polarity Bugs
- **Check #9**: Catches `isDev: isDesktopProductionMode()` (missing negation)
- **Check #4**: Ensures helper function is used everywhere
- **Check #2**: Contract test validates correctness

### Missing Binaries
- **Check #5**: Explicit check for all required .exe files
- **Check #10**: Installer test validates installation integrity

### Windows Service Issues
- **Check #8**: Production simulation tests service-helper behavior
- **Check #1**: E2E verifies daemon health in both dev/prod modes

## Custom ESLint Rule

Located at `app/frontend/eslint-rules/no-raw-process-env-invoke.js`

This rule blocks:
```typescript
// ❌ WRONG - blocked by ESLint
invoke("start_daemon", { isDev: process.env.NODE_ENV !== "production" })

// ✓ CORRECT - allowed
invoke("start_daemon", { isDev: !isDesktopProductionMode() })
```

## Contract Test

Located at `app/frontend/__tests__/daemon-launch-mode.test.ts`

Scans all source files and validates that every `invoke("start_daemon")` and `invoke("stop_daemon")` call uses the correct pattern.

## Release Process

1. Ensure all Tier 4 checks pass on main
2. Run `build-release.yml` via workflow_dispatch
3. Enter version (e.g., `1.2.3` or `1.2.3-rc.1`)
4. Tier checks run again (unless skipped)
5. Build and package with Velopack
6. Create GitHub release with artifacts

## Troubleshooting

### CI failing on anti-pattern check
The check found code like `isDev: isDesktopProductionMode()` which is wrong.
Fix: Change to `isDev: !isDesktopProductionMode()` (add negation).

### ESLint rule blocking invoke
Import the helper and use it:
```typescript
import { isDesktopProductionMode } from "@/lib/runtimeMode";
// ...
invoke("start_daemon", { isDev: !isDesktopProductionMode() })
```

### Os error 3 in E2E tests
The daemon is trying to access a path that doesn't exist. Check:
1. Build artifacts include all binaries
2. ProgramData directories are created
3. Port files are written correctly

### Binary presence check failing
Ensure all build jobs completed successfully and artifacts were uploaded.
Required binaries: `memento.exe`, `memento-daemon.exe`, `memento-agents.exe`, `service-helper.exe`
