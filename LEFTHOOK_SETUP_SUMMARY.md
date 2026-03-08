# Git Hooks Setup with Lefthook - Final Summary

## 🎯 What Was Configured

A complete **Lefthook** system has been set up to enforce code quality, security, and consistency standards across your monorepo.

### ✅ Files Created

1. **`.lefthook.yml`** - Main Lefthook configuration with all hooks defined
2. **`.lefthook/` scripts** (PowerShell):
   - `validate-branch.ps1` - Validates branch naming convention
   - `validate-commit-msg.ps1` - Validates commit message format
   - `detect-secrets.ps1` - Scans for API keys, tokens, passwords
   - `check-file-size.ps1` - Prevents large files from being committed
   - `check-permissions.ps1` - Ensures file hygiene
   - `full-lint.ps1` - Comprehensive linting for pre-push

3. **Setup Scripts**:
   - `install-lefthook.ps1` - Automated installation for Windows
   - `setup-hooks.ps1` - Setup script for Windows (alternative)
   - `setup-hooks.sh` - Setup script for macOS/Linux

4. **Documentation**:
   - `LEFTHOOK_GUIDE.md` - Complete comprehensive guide
   - `GIT_HOOKS_QUICKSTART.md` - Quick reference guide
   - `package.json` - Updated with hook commands

5. **Configuration**:
   - `.env.example` - Environment variables template
   - `.gitignore` - Updated with comprehensive patterns

---

## 🚀 Installation Steps

### For Windows (PowerShell)

```powershell
# 1. Install Lefthook (choose one method):

# Method A: Chocolatey (Recommended)
choco install lefthook

# Method B: npm
npm install -g @evilmartians/lefthook

# Method C: Manual Download
# Download from: https://github.com/evilmartians/lefthook/releases
# Extract to a directory in your PATH

# 2. Verify installation
lefthook --version

# 3. Run setup script
.\install-lefthook.ps1

# 4. Edit .env with your actual credentials
notepad .env
```

### For macOS/Linux

```bash
# 1. Install Lefthook
brew install lefthook

# 2. Verify installation
lefthook --version

# 3. Run setup script
chmod +x setup-hooks.sh
./setup-hooks.sh

# 4. Edit .env with your actual credentials
nano .env  # or vim, code, etc.
```

---

## 📋 Commit Message Format

All commits **MUST** follow this format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types (Required)

| Type      | Purpose | Example |
|-----------|---------|---------|
| `feat`    | New feature | `feat(auth): add JWT validation` |
| `fix`     | Bug fix | `fix(api): resolve race condition` |
| `docs`    | Documentation | `docs: update README` |
| `style`   | Code formatting | `style: run prettier` |
| `refactor`| Code restructuring | `refactor(core): simplify logic` |
| `perf`    | Performance improvement | `perf(search): optimize queries` |
| `test`    | Add tests | `test(auth): add token tests` |
| `chore`   | Build, CI, deps | `chore: update dependencies` |
| `ci`      | CI/CD changes | `ci: add GitHub Actions` |
| `revert`  | Revert commit | `revert: undo broken feature` |

### Scope (Optional)

- Specifies what area of code changed
- Use lowercase: `auth`, `api`, `search-engine`
- Example: `feat(auth): ...` or `fix(api): ...`

### Subject Rules

- ✅ Imperative mood: "add" not "added" or "adds"
- ✅ Lowercase first letter
- ✅ No period at end
- ✅ 50 characters max (72 with scope)

### Valid Examples

```
✓ feat(auth): add JWT token validation

✓ fix(api): resolve race condition in query handler

✓ docs: update API reference

✓ refactor(core): simplify error handling

✓ perf(search): optimize database indexing
```

### Invalid Examples

```
✗ added new feature                           (no type)
✗ feat: Add Feature                           (capitalized)
✗ feat: add feature.                          (ends with period)
✗ refactor: this is a very long message       (too long)
```

---

## 🌳 Branch Name Format

All branches **MUST** follow this format:

```
<type>/<issue-id>-<description>
```

### Types

- `feature/` - New features
- `fix/` - Bug fixes
- `hotfix/` - Urgent production fixes
- `refactor/` - Code restructuring
- `docs/` - Documentation changes
- `test/` - Test-related changes
- `chore/` - Build, CI, dependencies

### Rules

- **Lowercase only** - No uppercase letters
- **Hyphens only** - No underscores or spaces
- **Include issue ID** - Reference your tracker (#123, JIRA-456)
- **Descriptive** - Clearly indicate what the branch does
- **Short** - Keep under 50 characters

### Valid Examples

```
✓ feature/123-user-authentication
✓ fix/456-memory-leak-in-search
✓ hotfix/789-critical-api-outage
✓ refactor/cleanup-query-builder
✓ docs/api-documentation
✓ test/add-executor-tests
```

### Invalid Examples

```
✗ feature/Add_User_Auth          (underscores, capitalized)
✗ fix/456                        (missing description)
✗ bugfix/Memory Leak             (spaces, wrong prefix)
✗ my-feature                     (no type, no issue)
```

---

## 🔍 Pre-Commit Hooks (Automatic)

These run **automatically** before each commit:

### 1. **Branch Validation**
- ✓ Validates branch follows `type/description` format
- ✓ Allows existing branches without validation
- ✗ Fails for non-conforming new branches

**Fix if failed:**
```bash
git branch -m feature/123-better-name
git commit --amend
```

### 2. **Secrets Detection**
- ✓ Scans for API keys (AWS, GitHub, NPM, Slack)
- ✓ Detects private keys and passwords
- ✓ Checks for `.env` files
- ✗ Fails and prevents commit if secrets found

**Fix if failed:**
```bash
# Remove secrets from the file
# Add .env to .gitignore
# Rotate the exposed secret immediately
git add .
git commit -m "chore: remove secrets"
```

### 3. **File Hygiene**
- ✓ Warns about problematic files
- ✓ Checks for .env, node_modules, build artifacts
- ✓ Verifies IDE settings are not shared

**Fix if failed:**
```bash
git reset HEAD .env node_modules/
git commit -m "feat: your feature"
```

### 4. **Code Formatting**
- ✓ Auto-formats Rust code (`cargo fmt`)
- ✓ Auto-formats Node code (`prettier --write`)
- ✓ Fails if Rust code doesn't pass `cargo fmt`

**Fix if failed:**
```bash
# Auto-format will happen, just stage and commit again
git add .
git commit -m "style: format code"
```

### 5. **Linting**
- ✓ Runs ESLint on TypeScript/JavaScript
- ✓ Runs Clippy on Rust code
- ✗ Fails if errors found (warnings allowed)

**Fix if failed:**
```bash
npm run lint      # Auto-fix many lint issues
cargo clippy --fix
git add .
git commit --amend
```

### 6. **Commit Message Validation**
- ✓ Validates message format: `type(scope): subject`
- ✗ Fails if format incorrect

**Fix if failed:**
```bash
git commit --amend -m "feat(scope): correct message"
```

---

## 🚀 Pre-Push Hooks (Before Pushing)

These run **automatically** before pushing to remote:

### 1. **Cargo Check**
```bash
cargo check --all --all-features
```
- Validates Rust code compiles
- Fails if compilation errors exist

### 2. **Cargo Tests**
```bash
cargo test --all --all-features
```
- Runs Rust test suite
- Doesn't fail on test failures (informational)

### 3. **UI Build**
```bash
npm run build  # in app/
```
- Ensures frontend builds successfully
- Fails if build errors exist

### 4. **Full Lint**
- Runs comprehensive linting across entire project
- Checks TypeScript, JavaScript, Rust code
- Verifies formatting (Prettier, Rustfmt)

---

## 🔐 Security Best Practices

### Never Commit

❌ `.env` files with real credentials
❌ API keys or tokens
❌ Database passwords
❌ Private keys or certificates
❌ Sensitive configuration

### Always Do

✅ Create `.env.example` with placeholders
✅ Add `.env` to `.gitignore`
✅ Use environment variables in code
✅ Rotate any exposed secrets immediately

### If You Accidentally Commit a Secret

1. **IMMEDIATELY rotate the secret** in your service
2. Check git history:
   ```bash
   git log -p --follow -- filename
   ```
3. Remove from git history:
   - Simple: `git filter-branch` or `git reset`
   - Complex: Use [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

---

## 📚 Useful Commands

### View Hook Status
```bash
npm run hooks:status
lefthook status
```

### Run Hooks Manually
```bash
npm run hooks:run              # Run all hooks
lefthook run pre-commit        # Run pre-commit only
lefthook run pre-push          # Run pre-push only
```

### Format Code
```bash
npm run format                 # Formats both Rust and Node

# Individually:
cargo fmt --all               # Format Rust
npx prettier --write .        # Format Node
```

### Lint Code
```bash
npm run lint                   # Lints both Rust and Node

# Individually:
cargo clippy --all            # Lint Rust
npx eslint --fix src          # Lint and fix Node
```

### Skip Hooks (Emergency Only)
```bash
git commit --no-verify -m "message"        # Skip commit hooks
git push --no-verify                       # Skip push hooks
```

### Reinstall Hooks
```bash
npm run hooks:uninstall
npm run hooks:install
```

---

## 🛠️ Troubleshooting

### "Lefthook not found in PATH"

**Solution:**
```powershell
# Install it:
choco install lefthook
# Or globally via npm:
npm install -g @evilmartians/lefthook

# Verify:
lefthook --version
```

### "Permission denied" on scripts

**Solution (Windows):**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Solution (macOS/Linux):**
```bash
chmod +x .lefthook/*.sh
```

### "Hook seems to be stuck"

**Solution:**
```bash
# Kill any running processes
pkill -f lefthook
pkill -f eslint
pkill -f prettier

# Reinstall
lefthook uninstall
lefthook install
```

### "Branch validation too strict"

**Solution:** Existing branches are now allowed without validation. Only new branches must follow the format.

---

## 📖 Full Documentation

For more detailed information, see:

- **[LEFTHOOK_GUIDE.md](./LEFTHOOK_GUIDE.md)** - Comprehensive guide with examples
- **[GIT_HOOKS_QUICKSTART.md](./GIT_HOOKS_QUICKSTART.md)** - Quick reference
- **[.lefthook.yml](./.lefthook.yml)** - Hook configuration
- **[Conventional Commits](https://www.conventionalcommits.org/)** - Standard format specs
- **[Lefthook Docs](https://evilmartians.github.io/lefthook/)** - Official documentation

---

## ✅ Final Checklist

Before committing, verify:

- [ ] Branch name follows format: `type/description`
- [ ] Code is formatted: `npm run format`
- [ ] Linting passes: `npm run lint`
- [ ] No secrets in code or `.env`
- [ ] Tests pass: `cargo test --all`
- [ ] Commit message follows format: `type(scope): subject`
- [ ] Commit message is clear and descriptive
- [ ] All files staged correctly: `git status`

---

## 🎯 Quick Git Workflow

```bash
# 1. Create feature branch
git checkout -b feature/123-user-authentication

# 2. Make changes
vim src/auth.ts

# 3. Stage changes
git add src/auth.ts

# 4. Commit (hooks run automatically)
git commit -m "feat(auth): add JWT token validation

Implement JWT token validation in the authentication middleware
to ensure all API requests are authenticated before processing."

# 5. Push (hooks run automatically)
git push origin feature/123-user-authentication

# 6. Create Pull Request and merge
```

---

## 🚀 You're All Set!

All git hooks are now active and will run automatically. Code quality and consistency are guaranteed!

For questions, see the comprehensive guides linked above.

**Happy coding!** 🎉
