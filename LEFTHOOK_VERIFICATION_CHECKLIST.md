# Lefthook Setup Verification Checklist

This checklist verifies that all components of the Lefthook system are properly configured.

## ✅ Configuration Files

- [x] `.lefthook.yml` - Main Lefthook configuration
- [x] `.lefthook/validate-branch.ps1` - Branch validation script
- [x] `.lefthook/validate-commit-msg.ps1` - Commit message validation
- [x] `.lefthook/detect-secrets.ps1` - Secrets detection
- [x] `.lefthook/check-file-size.ps1` - Large file detection
- [x] `.lefthook/check-permissions.ps1` - File hygiene checks
- [x] `.lefthook/full-lint.ps1` - Full linting script
- [x] `.env.example` - Environment variables template
- [x] `.gitignore` - Updated with comprehensive patterns
- [x] `package.json` - Root package with hook commands

## ✅ Documentation Files

- [x] `LEFTHOOK_GUIDE.md` - Complete comprehensive guide
- [x] `GIT_HOOKS_QUICKSTART.md` - Quick reference guide
- [x] `LEFTHOOK_SETUP_SUMMARY.md` - This summary document

## ✅ Setup Scripts

- [x] `install-lefthook.ps1` - Windows PowerShell installation
- [x] `setup-hooks.ps1` - Windows alternative setup
- [x] `setup-hooks.sh` - macOS/Linux setup script

## 📋 Next Steps

### 1. Install Lefthook

**Windows (PowerShell):**
```powershell
# Option A: Chocolatey (Recommended)
choco install lefthook

# Option B: npm
npm install -g @evilmartians/lefthook

# Verify
lefthook --version
```

**macOS/Linux:**
```bash
brew install lefthook
lefthook --version
```

### 2. Run Setup Script

**Windows:**
```powershell
.\install-lefthook.ps1
```

**macOS/Linux:**
```bash
chmod +x setup-hooks.sh
./setup-hooks.sh
```

### 3. Verify Installation

```bash
# Check hook status
npm run hooks:status
lefthook status
```

### 4. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit with your credentials
# (Do NOT commit .env)
```

### 5. Create Your First Feature Branch

```bash
git checkout -b feature/123-first-feature
echo "Hello World" > hello.txt
git add hello.txt
git commit -m "feat(demo): add hello world example"
git push origin feature/123-first-feature
```

## 🔍 Testing the Hooks

### Test Branch Validation
```bash
# This should fail (wrong branch name)
git checkout -b my-branch
git commit --allow-empty -m "test"  # Will fail with helpful message
git checkout agentic_workflow       # Switch back

# This should pass (correct format or existing branch)
git checkout -b feature/456-test-branch
git commit --allow-empty -m "test"  # Will pass
```

### Test Commit Message Validation
```bash
# This should fail (wrong format)
git commit --allow-empty -m "update code"

# This should pass (correct format)
git commit --allow-empty -m "feat(core): add new feature"
```

### Test Secrets Detection
```bash
# This should warn (contains secret pattern)
echo "API_KEY=sk_secret_key_here" > .env.test
git add .env.test
git commit -m "test: add secrets"  # Will warn/fail

# Fix it:
rm .env.test
git reset HEAD .env.test
git commit -m "test: remove secrets"
```

### Test Code Formatting
```bash
# Write unformatted code
echo "const x=1" > test.js

# Commit - prettier will auto-format
git add test.js
git commit -m "feat: add test"  # Auto-formats the file

# Clean up
rm test.js
```

## 📊 Hook Flow Diagram

```
┌─────────────────────────────────────────────┐
│         git commit -m "..."                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │  PRE-COMMIT HOOKS    │
      └──────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌──────────┐
│ Branch  │ │Secrets  │ │   File   │
│Validate │ │ Detect  │ │ Hygiene  │
└─────────┘ └─────────┘ └──────────┘
    │            │            │
    └────────────┼────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌─────────┐ ┌─────────┐ ┌──────────┐
│ Commit  │ │  Code   │ │ Linting  │
│Message  │ │ Format  │ │ (ESLint, │
│Validate │ │ (Pretty │ │ Clippy)  │
│         │ │  r)     │ │          │
└─────────┘ └─────────┘ └──────────┘
    │            │            │
    └────────────┼────────────┘
                 │
        ┌────────▼────────┐
        │ ALL PASS?       │
        └────────┬────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
      ✓ PASS         ✗ FAIL
         │               │
    Commit →         Reject ↓
  succeeds        (show errors)


┌─────────────────────────────────────────────┐
│              git push origin ...             │
└────────────────┬────────────────────────────┘
                 │
                 ▼
      ┌──────────────────────┐
      │   PRE-PUSH HOOKS     │
      └──────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Cargo   │ │  Cargo   │ │   UI     │
│  Check   │ │  Test    │ │  Build   │
└──────────┘ └──────────┘ └──────────┘
    │            │            │
    └────────────┼────────────┘
                 │
                 ▼
          ┌─────────────┐
          │  Full Lint  │
          └─────────────┘
                 │
        ┌────────▼────────┐
        │ ALL PASS?       │
        └────────┬────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
      ✓ PASS         ✗ FAIL
         │               │
    Push →           Reject ↓
  succeeds       (show errors)
```

## 🎯 Commit Message Examples

### Good Examples
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
fix(search): prevent duplicate results in pagination

Fix race condition that caused concurrent requests to return
overlapping results when paginating through search results.

Closes #456
```

```
docs: update API documentation with examples
```

### Bad Examples
```
❌ add new feature              (no type)
❌ FEAT: ADD FEATURE            (caps, no lowercase)
❌ feat: add feature.           (ends with period)
❌ refactor: this is a very long commit message that should be shorter
```

## 🌳 Branch Naming Examples

### Good Examples
```
✓ feature/123-user-authentication
✓ fix/456-memory-leak-in-search
✓ hotfix/789-critical-api-outage
✓ refactor/cleanup-query-builder
✓ docs/api-documentation
✓ test/add-executor-tests
✓ chore/update-dependencies
```

### Bad Examples
```
❌ feature/Add_User_Auth         (underscores, caps)
❌ fix/456                       (missing description)
❌ bugfix/memory-leak            (wrong prefix)
❌ my-feature                    (no type, no issue)
❌ feature/this-is-a-very-long-branch-name-that-exceeds-50-chars
```

## 🔒 Environment Security Checklist

- [ ] `.env` file created from `.env.example`
- [ ] `.env` added to `.gitignore`
- [ ] All real credentials filled in `.env`
- [ ] No `.env` files ever committed to git
- [ ] Never hardcode secrets in code
- [ ] All API keys and passwords in environment variables
- [ ] `.env.example` contains only placeholders

## 📞 Troubleshooting Quick Links

1. **Lefthook not found** → Install from https://github.com/evilmartians/lefthook/releases
2. **PowerShell permission denied** → Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
3. **Hooks not running** → Run `lefthook install` to reinstall
4. **Branch validation failing** → Check branch name matches `type/issue-description` format
5. **Commit message validation failing** → Use format `type(scope): subject`
6. **Pre-commit hooks too slow** → Use `npm run format && npm run lint` locally before committing
7. **Need to skip hooks** → Use `git commit --no-verify` (not recommended)

## 📚 Documentation Guide

| Document | Purpose | Audience |
|----------|---------|----------|
| `LEFTHOOK_GUIDE.md` | Comprehensive reference | Detailed information |
| `GIT_HOOKS_QUICKSTART.md` | Quick reference | Fast lookup |
| `LEFTHOOK_SETUP_SUMMARY.md` | Setup and examples | Getting started |
| `.lefthook.yml` | Hook configuration | Advanced setup |

## ✨ You're Ready!

All components are in place. Follow the **Next Steps** section above to complete the setup and start using the git hooks system.

For detailed information:
- 📖 Read [LEFTHOOK_GUIDE.md](./LEFTHOOK_GUIDE.md)
- ⚡ Quick ref: [GIT_HOOKS_QUICKSTART.md](./GIT_HOOKS_QUICKSTART.md)

**Happy coding!** 🚀
