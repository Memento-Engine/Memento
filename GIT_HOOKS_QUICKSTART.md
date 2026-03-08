# 🪝 Git Hooks Setup

## Quick Setup (5 minutes)

### Windows (PowerShell)
```powershell
# 1. Install Lefthook (if not already installed)
choco install lefthook
# OR: npm install -g @evilmartians/lefthook

# 2. Run setup script
.\setup-hooks.ps1

# That's it! Hooks are now active.
```

### macOS/Linux (Bash)
```bash
# 1. Install Lefthook (if not already installed)
brew install lefthook

# 2. Run setup script
chmod +x setup-hooks.sh
./setup-hooks.sh

# That's it! Hooks are now active.
```

---

## What These Hooks Do

### ✅ Pre-Commit Hooks (Before each commit)
- **Branch validation**: Ensures branch names follow `type/description` format
- **Secrets scanning**: Prevents API keys and passwords from being committed
- **File hygiene**: Blocks problematic files (`.env`, `node_modules`, etc.)
- **Code formatting**: Auto-formats code with Prettier and Rustfmt
- **Linting**: Checks code quality with ESLint and Clippy
- **Commit message validation**: Enforces `type(scope): subject` format

### 🚀 Pre-Push Hooks (Before pushing to remote)
- **Cargo check**: Validates Rust code compiles
- **Rust tests**: Runs test suite
- **UI build**: Ensures frontend builds without errors
- **Full lint**: Comprehensive code quality check

---

## 📋 Commit Message Format

All commits must follow this format:
```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Examples:
- ✅ `feat(auth): add JWT token validation`
- ✅ `fix(api): resolve race condition in search`
- ✅ `refactor(core): simplify error handling`
- ✅ `docs: update README with examples`

**Valid types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `revert`

👉 **[See full guide →](./LEFTHOOK_GUIDE.md#-commit-message-format)**

---

## 🌳 Branch Name Format

All branches must follow this format:
```
<type>/<issue-id>-<description>
```

### Examples:
- ✅ `feature/123-user-authentication`
- ✅ `fix/456-memory-leak-in-search`
- ✅ `hotfix/789-critical-api-outage`

**Valid types**: `feature`, `fix`, `hotfix`, `refactor`, `docs`, `test`, `chore`

👉 **[See full guide →](./LEFTHOOK_GUIDE.md#-branch-naming-format)**

---

## 🚫 Common Issues & Fixes

### "Hook failed - commit message validation"
**Fix**: Update commit message to follow format
```bash
git commit --amend -m "feat(scope): correct message"
```

### "Hook failed - branch name validation"
**Fix**: Rename your branch
```bash
git branch -m feature/123-correct-name
```

### "Hook failed - formatting issues"
**Fix**: Auto-format your code
```bash
npm run format    # Formats both Rust and Node code
```

### "Hook failed - lint errors"
**Fix**: Run auto-fix for linting
```bash
npm run lint      # Auto-fixes many lint issues
```

### "Hooks not running"
**Fix**: Reinstall hooks
```bash
lefthook uninstall
lefthook install
```

---

## ⏭️ Skipping Hooks (Emergency Only)

### Skip ALL hooks
```bash
git commit --no-verify -m "message"
git push --no-verify
```

### Skip during specific scenarios
- **Merge commits**: Hooks automatically skip
- **Rebases**: Hooks automatically skip
- **Squash commits**: Commit message validation skips

---

## 📚 Full Documentation

For detailed information about:
- Commit message conventions
- Branch naming rules
- Security best practices
- Troubleshooting
- Configuration

👉 **[Read the Complete Guide →](./LEFTHOOK_GUIDE.md)**

---

## 🔧 Useful Commands

```bash
# Check hook status
npm run hooks:status
lefthook status

# Run all hooks manually
npm run hooks:run
lefthook run pre-commit
lefthook run pre-push

# Format code
npm run format
cargo fmt --all
npx prettier --write .

# Lint code
npm run lint
cargo clippy
npx eslint --fix

# Install/uninstall hooks
npm run hooks:install
npm run hooks:uninstall
```

---

## 🔐 Security Reminder

**NEVER commit:**
- `.env` files with real credentials
- API keys or tokens
- Database passwords
- Private keys or certificates

**Always:** 
- Use `.env.example` as template
- Add `.env` to `.gitignore`
- Rotate any exposed secrets immediately

---

## ❓ Questions?

1. **Detailed guide**: See [LEFTHOOK_GUIDE.md](./LEFTHOOK_GUIDE.md)
2. **Conventional Commits**: https://www.conventionalcommits.org/
3. **Lefthook docs**: https://evilmartians.github.io/lefthook/

---

**Happy coding! 🚀**
