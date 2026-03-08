# 🪝 Git Hooks with Lefthook

Your project now has a comprehensive **Lefthook** system for automated code quality, security, and consistency checks.

## ⚡ Quick Start

### 1. Install Lefthook (One-time setup)

**macOS:**
```bash
brew install lefthook
```

**Windows:**
```powershell
npm install -g @evilmartians/lefthook
```

### 2. Install Git Hooks

```bash
npx lefthook install
```

### 3. Start Using

```bash
git checkout -b feature/123-description
git commit -m "feat(scope): your message"
git push
```

**Hooks run automatically!** ✨

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| **[SETUP_COMPLETE.md](./SETUP_COMPLETE.md)** | ✅ Setup status and overview |
| **[LEFTHOOK_QUICK_REFERENCE.md](./LEFTHOOK_QUICK_REFERENCE.md)** | ⚡ Quick cheat sheet |
| **[GIT_HOOKS_QUICKSTART.md](./GIT_HOOKS_QUICKSTART.md)** | 🚀 Getting started guide |
| **[LEFTHOOK_GUIDE.md](./LEFTHOOK_GUIDE.md)** | 📖 Comprehensive reference |
| **[LEFTHOOK_SETUP_SUMMARY.md](./LEFTHOOK_SETUP_SUMMARY.md)** | 📋 Setup details & examples |
| **[LEFTHOOK_VERIFICATION_CHECKLIST.md](./LEFTHOOK_VERIFICATION_CHECKLIST.md)** | ✓ Verification steps |

---

## 📝 Commit Message Format

```
<type>(<scope>): <subject>
```

**Quick Examples:**
```bash
feat(auth): add JWT validation
fix(api): resolve race condition
docs: update README
refactor(core): simplify logic
test(executor): add unit tests
```

[**Full Guide →**](./LEFTHOOK_GUIDE.md#-commit-message-format)

---

## 🌳 Branch Name Format

```
<type>/<issue-id>-<description>
```

**Quick Examples:**
```bash
feature/123-user-authentication
fix/456-memory-leak
hotfix/789-critical-bug
docs/api-documentation
```

[**Full Guide →**](./LEFTHOOK_GUIDE.md#-branch-naming-format)

---

## ✨ What Hooks Check

### 🔴 Pre-Commit
- Branch naming follows convention
- No secrets (API keys, tokens)
- No problematic files (.env, node_modules)
- Code formatting (Prettier, Rustfmt)
- Linting (ESLint, Clippy)
- Commit message format

### 🟢 Pre-Push
- Rust compiles (`cargo check`)
- Tests pass (`cargo test`)
- Frontend builds (`npm run build`)
- Full linting passes

---

## 🛠️ Common Commands

```bash
# Format code
npm run format

# Lint code
npm run lint

# Check hooks status
npm run hooks:status
npx lefthook status

# Skip hooks (emergency only)
git commit --no-verify -m "message"
git push --no-verify
```

---

## 🔐 Security

**Hooks prevent:**
- ❌ `.env` files with credentials
- ❌ API keys and tokens
- ❌ Database passwords
- ❌ Private keys

**Use instead:**
- ✅ `.env.example` with placeholders
- ✅ Environment variables
- ✅ Secret managers

[**Security Guide →**](./LEFTHOOK_GUIDE.md#-security-best-practices)

---

## ❓ Getting Help

1. **Quick lookup** → [LEFTHOOK_QUICK_REFERENCE.md](./LEFTHOOK_QUICK_REFERENCE.md)
2. **New to this** → [GIT_HOOKS_QUICKSTART.md](./GIT_HOOKS_QUICKSTART.md)
3. **Detailed info** → [LEFTHOOK_GUIDE.md](./LEFTHOOK_GUIDE.md)
4. **Troubleshooting** → [LEFTHOOK_GUIDE.md#-troubleshooting](./LEFTHOOK_GUIDE.md#-troubleshooting)

---

## 📊 File Structure

```
.
├── .lefthook.yml                          # Hook configuration
├── .lefthook/
│   ├── validate-branch.ps1               # Branch validation
│   ├── validate-commit-msg.ps1           # Commit message validation
│   ├── detect-secrets.ps1                # Secrets detection
│   ├── check-file-size.ps1               # File size checks
│   ├── check-permissions.ps1             # File hygiene
│   └── full-lint.ps1                     # Full linting
├── .env.example                           # Environment template
├── package.json                           # Root package with commands
│
├── SETUP_COMPLETE.md                      # Setup status
├── LEFTHOOK_GUIDE.md                      # Comprehensive guide
├── GIT_HOOKS_QUICKSTART.md                # Quick start guide
├── LEFTHOOK_SETUP_SUMMARY.md              # Setup summary
├── LEFTHOOK_VERIFICATION_CHECKLIST.md     # Verification
└── LEFTHOOK_QUICK_REFERENCE.md            # Cheat sheet
```

---

## 🎯 Example Workflow

```bash
# 1. Create feature branch
git checkout -b feature/123-new-feature

# 2. Make changes
# (edit your files)

# 3. Commit
git add .
git commit -m "feat(auth): add JWT validation"
# Hooks automatically:
# ✓ Validate branch
# ✓ Scan for secrets
# ✓ Format code
# ✓ Lint code
# ✓ Validate message

# 4. Push
git push origin feature/123-new-feature
# Pre-push hooks automatically:
# ✓ Check cargo compiles
# ✓ Run test suite
# ✓ Build frontend
# ✓ Run full lint

# 5. Create PR and merge
```

---

## ✅ Installation Status

All hooks are **installed and working**. ✨

```
sync hooks: ✔️ (pre-push, pre-commit, commit-msg)
```

---

## 🚀 Ready to Go!

Your git workflow is now secured with:
- ✓ Automatic code formatting
- ✓ Comprehensive linting
- ✓ Security checks (secrets scanning)
- ✓ Commit message validation
- ✓ Branch naming validation
- ✓ Pre-push quality checks

**Start with:** [LEFTHOOK_QUICK_REFERENCE.md](./LEFTHOOK_QUICK_REFERENCE.md)

**Happy coding!** 🎉

---

*For detailed information, see [SETUP_COMPLETE.md](./SETUP_COMPLETE.md)*
