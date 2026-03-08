# 🪝 Git Hooks with Lefthook - Complete Guide

## Overview

This project uses **Lefthook** to enforce code quality standards and security checks before commits and pushes. All hooks are configured with clear formatting guidelines and validation rules.

## Quick Start

### Installation

1. **Install Lefthook** (Windows):
   ```powershell
   # Using Chocolatey
   choco install lefthook
   
   # Or using npm globally  
   npm install -g @evilmartians/lefthook
   ```

2. **Install Lefthook** (macOS/Linux):
   ```bash
   brew install lefthook  # macOS
   # or download from: https://github.com/evilmartians/lefthook/releases
   ```

3. **Install Git Hooks**:
   ```bash
   lefthook install
   ```

4. **Update npm dependencies** (once for full setup):
   ```bash
   npm install  # in agents/
   npm install  # in app/
   cd agents && npm install
   cd ../app && npm install
   ```

---

## 📋 Commit Message Format

### Format Specification

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type      | Description | Example |
|-----------|-------------|---------|
| `feat`    | A new feature | `feat(auth): add JWT validation` |
| `fix`     | A bug fix | `fix(api): resolve race condition` |
| `docs`    | Documentation only | `docs: update API reference` |
| `style`   | Code formatting (non-functional) | `style: format with prettier` |
| `refactor`| Code restructuring | `refactor(core): simplify error handling` |
| `perf`    | Performance improvements | `perf(search): optimize queries` |
| `test`    | Add/update tests | `test(auth): add token validation tests` |
| `chore`   | Build, CI, dependencies | `chore: update dependencies` |
| `ci`      | CI/CD configuration | `ci: add GitHub Actions workflow` |
| `revert`  | Revert previous commit | `revert: undo broken feature` |

### Scope (Optional)

- Specifies the area of code affected
- Use lowercase and hyphens: `auth`, `search-engine`, `ui-components`
- Examples: `feat(auth)`, `fix(api)`, `refactor(core)`

### Subject Rules

- **Imperative mood**: Use "add" not "added" or "adds"
- **Lowercase first letter**: Start with lowercase (except proper nouns)
- **No period at end**: Don't end with punctuation
- **Concise**: 50 characters maximum
- **With scope**: 72 characters maximum

### Body (Optional)

After a blank line, provide detailed explanation:
- Explain **WHAT** and **WHY**, not HOW
- Wrap at 72 characters
- Use bullet points for multiple reasons
- Separate paragraphs with blank lines

### Footer (Optional)

```
Closes #123
Fixes #456, #789
BREAKING CHANGE: description of breaking change
```

### Examples

✅ **Good commits:**
```
feat(auth): add JWT token validation

Implement JWT token validation in the authentication middleware.
This ensures API requests are authenticated before processing.

- Validates token signature
- Checks token expiration
- Returns 401 for invalid tokens

Closes #123
```

```
fix(search): prevent duplicate results in paginated queries

Fix race condition in the search query handler where
concurrent requests could return overlapping results.

Closes #456
```

```
refactor(core): simplify error handling in executor

Replace nested try-catch blocks with error handling middleware
for cleaner, more maintainable code.
```

❌ **Bad commits:**
- `added new feature` (past tense, no type)
- `wip` (not descriptive)
- `fix stuff` (too vague)
- `feat: Add Feature` (capital letter)
- `feat: add feature.` (ends with period)

---

## 🌳 Branch Naming Format

### Format Specification

```
<type>/<issue-id>-<description>
```

### Types

| Type       | Purpose | Example |
|-----------|---------|---------|
| `feature/` | New features | `feature/123-user-authentication` |
| `fix/`     | Bug fixes | `fix/456-memory-leak-search` |
| `hotfix/`  | Urgent production fixes | `hotfix/789-critical-outage` |
| `refactor/`| Code restructuring | `refactor/cleanup-query-builder` |
| `docs/`    | Documentation | `docs/api-documentation` |
| `test/`    | Test-related changes | `test/add-integration-tests` |
| `chore/`   | Build, CI, dependencies | `chore/update-dependencies` |

### Naming Rules

- **Lowercase only**: No uppercase letters
- **Hyphens only**: Use `-` for separation, no underscores or spaces
- **Include issue ID**: Reference your issue tracker (e.g., `#123`, `JIRA-456`)
- **Descriptive name**: Clearly indicate what the branch does
- **Maximum 50 characters**: Keep branch names short and memorable
- **No special characters**: Only `a-z`, `0-9`, and `-`

### Examples

✅ **Good branch names:**
- `feature/123-user-authentication`
- `fix/456-memory-leak-in-search`
- `hotfix/789-critical-api-outage`
- `refactor/cleanup-query-builder`
- `docs/api-documentation`
- `test/add-executor-tests`
- `chore/update-dependencies`

❌ **Bad branch names:**
- `feature/Add_User_Authentication` (contains underscores and capitals)
- `fix/456` (missing description)
- `bugfix/Memory Leak` (spaces, wrong prefix)
- `my-feature` (no type, no issue)
- `feature/123-this-is-a-very-long-description-that-exceeds-50-characters` (too long)

---

## 🔍 Pre-Commit Hooks

### What They Check

| Check | Purpose | Runs On |
|-------|---------|---------|
| **Branch Name Validation** | Ensures branch follows naming convention | All commits except merges |
| **File Hygiene** | Prevents problematic files (.env, node_modules, etc.) | All commits |
| **Secrets Detection** | Scans for API keys, tokens, passwords | All commits |
| **Rust Formatting** | Checks `cargo fmt` compliance | Rust files only |
| **Node Formatting** | Runs Prettier on staged files | TypeScript/JavaScript files |
| **Linting** | ESLint for Node, Clippy for Rust | All code files |
| **Commit Message Validation** | Validates message format | All commits |

### How to Skip (When Necessary)

#### Skip All Hooks
```bash
git commit --no-verify -m "commit message"
```

#### Skip Specific Checks
- Hooks can be skipped using `skip` flags in lefthook.yml
- Not recommended - use only for emergencies

### Fixing Hook Failures

#### Format Code Issues
```bash
# Rust
cargo fmt --all

# Node
npx prettier --write .
```

#### Lint Errors
```bash
# Rust - auto-fix clippy warnings
cargo clippy --fix --all --allow-dirty

# Node - auto-fix ESLint issues
npx eslint --fix src/**/*.ts
```

#### Branch Name Issues
```bash
git branch -m <new-branch-name>
```

#### Commit Message Issues
```bash
git commit --amend -m "new message"
```

---

## 🚀 Pre-Push Hooks

Run comprehensive checks before pushing to remote:

### Checks Performed

1. **Cargo Check**: Validates Rust code compiles
   ```bash
   cargo check --all --all-features
   ```

2. **Cargo Tests**: Runs Rust test suite
   ```bash
   cargo test --all --all-features
   ```

3. **UI Build**: Ensures frontend builds successfully
   ```bash
   npm run build  # in app/
   ```

4. **Full Lint**: Comprehensive linting across entire project
   - TypeScript/JavaScript linting
   - Rust linting with Clippy
   - Code formatting verification

### Pre-Push Failures

If pre-push hooks fail:

1. **Fix the issues locally**:
   ```bash
   cargo fmt --all
   npx prettier --write .
   npx eslint --fix src/**/*.ts
   ```

2. **Run tests again**:
   ```bash
   cargo test --all
   npm run build
   ```

3. **Try pushing again**:
   ```bash
   git push
   ```

4. **Skip hooks in emergencies** (not recommended):
   ```bash
   git push --no-verify
   ```

---

## 🔐 Security Checks

### Secrets Detection

The `detect-secrets.ps1` script looks for:
- AWS credentials (access keys, secret keys)
- Private keys (RSA, DSA, etc.)
- API keys and tokens (GitHub, NPM, Slack, etc.)
- Database passwords
- `.env` files with credentials

### Preventing Secret Commits

#### Create `.env` Template
```bash
# .env.example (commit this)
DATABASE_URL=postgres://localhost/mydb
API_KEY=your-api-key-here
JWT_SECRET=your-secret-here

# .env (add to .gitignore)
DATABASE_URL=postgres://user:pass@host/db
API_KEY=sk-1234567890abcdef
JWT_SECRET=super-secret-key-12345
```

#### Add to `.gitignore`
```
.env
.env.local
.env.*.local
.env.production
```

#### If You Accidentally Committed a Secret

1. **Rotate the secret immediately** (most important!)
2. Check your git history:
   ```bash
   git log -p --follow -- sensitive-file.txt
   ```
3. Consider using `git filter-branch` or [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

---

## 📦 Lefthook Configuration

The `.lefthook.yml` file controls all hooks. Key sections:

```yaml
pre-commit:
  commands:
    01-branch-validate:  # Branch naming
    02-file-hygiene:     # File checks
    03-secrets-detection: # Secret scanning
    04-rust-checks:      # Rust formatting
    05-node-format:      # Node formatting
    06-node-lint:        # ESLint
    07-commit-msg-validate: # Commit message

pre-push:
  commands:
    01-rust-check:       # cargo check
    02-rust-test:        # cargo test
    03-ui-build:         # npm build
    04-full-lint:        # comprehensive lint
```

---

## 🛠️ Troubleshooting

### Hooks Not Running

```bash
# Check if hooks are installed
lefthook version
lefthook status

# Reinstall hooks
lefthook install

# Run specific hook manually
lefthook run pre-commit
```

### Permission Denied on Scripts

```bash
# On Windows PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# On macOS/Linux
chmod +x .lefthook/*.sh
```

### Script Execution Issues

```bash
# Check script exists
Test-Path .lefthook/validate-branch.ps1

# Run script manually to debug
./.lefthook/validate-branch.ps1
```

### Hooks Too Slow

- Parallel execution is disabled to ensure sequential validation
- Consider running `cargo check` locally before committing
- Add frequently-used commands to your IDE

---

## 📚 References

- **Conventional Commits**: https://www.conventionalcommits.org/
- **Lefthook Documentation**: https://evilmartians.github.io/lefthook/
- **Git Hooks**: https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks

---

## ✅ Final Checklist Before Each Commit

- [ ] Branch name follows format: `type/description`
- [ ] All code is formatted: `cargo fmt --all` & `prettier --write .`
- [ ] Linting passes: `cargo clippy`, `eslint`
- [ ] No secrets in code or `.env` files
- [ ] Tests pass: `cargo test --all`
- [ ] Commit message follows format: `type(scope): subject`
- [ ] Commit message is clear and descriptive
- [ ] All files are staged correctly

---

## 🎯 Quick Commands

```bash
# Install/update hooks
lefthook install

# Run all pre-commit hooks manually
lefthook run pre-commit

# Run all pre-push hooks manually
lefthook run pre-push

# Skip all hooks (emergency only)
git commit --no-verify -m "message"
git push --no-verify

# Check hook status
lefthook status

# Reinstall everything
lefthook uninstall && lefthook install
```

---

**Last Updated**: March 2026
**Maintained by**: Development Team
