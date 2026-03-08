# Lefthook Quick Reference Card

## 🔧 Installation

```powershell
# Windows - Install Lefthook
choco install lefthook
# or
npm install -g @evilmartians/lefthook

# Run setup
.\install-lefthook.ps1
```

```bash
# macOS/Linux - Install Lefthook
brew install lefthook

# Run setup
chmod +x setup-hooks.sh && ./setup-hooks.sh
```

---

## 📋 Commit Message Format

```
<type>(<scope>): <subject>
```

**Types:** `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `chore` | `ci` | `revert`

**Examples:**
```bash
git commit -m "feat(auth): add JWT token validation"
git commit -m "fix(api): resolve race condition"
git commit -m "docs: update README"
git commit -m "refactor(core): simplify error handling"
git commit -m "test(executor): add unit tests"
```

---

## 🌳 Branch Name Format

```
<type>/<issue-id>-<description>
```

**Types:** `feature/` | `fix/` | `hotfix/` | `refactor/` | `docs/` | `test/` | `chore/`

**Examples:**
```bash
git checkout -b feature/123-user-authentication
git checkout -b fix/456-memory-leak
git checkout -b hotfix/789-critical-bug
git checkout -b docs/api-documentation
```

---

## ✅ Git Workflow

```bash
# 1. Create branch
git checkout -b feature/123-description

# 2. Make changes and commit
git add .
git commit -m "feat(scope): description"
# [hooks run automatically]

# 3. Push to remote
git push origin feature/123-description
# [pre-push hooks run automatically]
```

---

## 🚀 Useful Commands

```bash
# Check hook status
npm run hooks:status

# Format code
npm run format

# Lint code
npm run lint

# Run hooks manually
lefthook run pre-commit
lefthook run pre-push

# Skip hooks (emergency only)
git commit --no-verify -m "message"
git push --no-verify
```

---

## ✨ What Hooks Check

### Pre-Commit (Before Commit)
- ✓ Branch naming follows convention
- ✓ No secrets (API keys, tokens, passwords)
- ✓ No problematic files (.env, node_modules)
- ✓ Code formatting (Prettier, Rustfmt)
- ✓ Linting (ESLint, Clippy)
- ✓ Commit message format

### Pre-Push (Before Push)
- ✓ Rust compiles (`cargo check`)
- ✓ Rust tests pass (`cargo test`)
- ✓ Frontend builds successfully (`npm build`)
- ✓ Full linting passes

---

## 🔐 Security

**Never commit:**
```
.env                    # Use .env.example instead
API_KEY=abc123         # Use environment variables
password="secret"      # Use environment variables
private_key.pem        # Add to .gitignore
```

**If you commit a secret:**
1. ⚠️ Rotate it immediately in your service
2. Remove from git history
3. Use `git filter-branch` or BFG Repo-Cleaner if needed

---

## ❌ Common Failures & Fixes

| Failure | Cause | Fix |
|---------|-------|-----|
| Branch validation fails | Wrong branch name | `git branch -m feature/123-name` |
| Commit message fails | Wrong format | `git commit --amend -m "feat(scope): text"` |
| Secrets detected | API key in code | Remove secret, add to .env, rotate key |
| Formatting issues | Code not formatted | `npm run format` |
| Lint errors | Code quality issues | `npm run lint` |
| Build fails | Compilation error | Fix code, `git add .`, `git commit --amend` |

---

## 📚 Full Documentation

| Document | Purpose |
|----------|---------|
| `LEFTHOOK_GUIDE.md` | Complete comprehensive guide |
| `GIT_HOOKS_QUICKSTART.md` | Quick reference |
| `LEFTHOOK_SETUP_SUMMARY.md` | Setup and examples |
| `LEFTHOOK_VERIFICATION_CHECKLIST.md` | Verification steps |

---

## 🎯 Summary

1. **Install Lefthook** - `choco install lefthook` (Windows) or `brew install lefthook` (macOS)
2. **Run setup** - `.\install-lefthook.ps1` or `./setup-hooks.sh`
3. **Create branch** - `git checkout -b feature/123-description`
4. **Commit** - `git commit -m "feat(scope): description"`
5. **Push** - `git push origin feature/123-description`

Hooks run automatically. No manual action needed!

---

## 🚨 Emergency Commands

```bash
# Skip commit hooks
git commit --no-verify -m "message"

# Skip push hooks
git push --no-verify

# Reinstall hooks
lefthook uninstall && lefthook install

# Check hook status
lefthook status
```

---

**Questions?** See `LEFTHOOK_GUIDE.md` for detailed documentation.
