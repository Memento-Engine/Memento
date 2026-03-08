# Validate Commit Message Format
# Format: <type>(<scope>): <subject>
# Example: feat(auth): add JWT token validation

param(
    [string]$CommitMsgFile
)

# Read commit message
if (-not $CommitMsgFile -or -not (Test-Path $CommitMsgFile)) {
    exit 0
}

$commitMsg = (Get-Content $CommitMsgFile -Raw).Trim()

# Skip validation for merge commits and rebases
if ($commitMsg -match "^Merge|^Rebase|^Squash" -or $commitMsg -match "^\d+\s+changed") {
    exit 0
}

# Get first line only
$firstLine = $commitMsg -split "`n" | Select-Object -First 1

# Commit message pattern: type(scope): subject or type: subject
# Types: feat, fix, docs, style, refactor, perf, test, chore, ci, revert
$validPattern = '^(feat|fix|docs|style|refactor|perf|test|chore|ci|revert)(\([a-z0-9\-]+\))?: .{1,}$'

if ($firstLine -match $validPattern -and $firstLine.Length -le 72) {
    exit 0
}

Write-Host "❌ COMMIT MESSAGE VALIDATION FAILED" -ForegroundColor Red
Write-Host ""
Write-Host "Your commit message doesn't follow the format:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Format: <type>(<scope>): <subject>" -ForegroundColor Cyan
Write-Host "Or:     <type>: <subject>" -ForegroundColor Cyan
Write-Host ""
Write-Host "Valid types:" -ForegroundColor Green
Write-Host "  • feat:     A new feature"
Write-Host "  • fix:      A bug fix"
Write-Host "  • docs:     Documentation only changes"
Write-Host "  • style:    Formatting, prettier, eslint fixes (non-functional)"
Write-Host "  • refactor: Code change that neither fixes a bug nor adds feature"
Write-Host "  • perf:     Code change that improves performance"
Write-Host "  • test:     Adding or updating tests"
Write-Host "  • chore:    Build process, dependencies, tooling changes"
Write-Host "  • ci:       CI/CD configuration changes"
Write-Host "  • revert:   Reverts a previous commit"
Write-Host ""
Write-Host "Scope (optional):" -ForegroundColor Green
Write-Host "  • Specify the area of code affected (e.g., auth, api, ui)"
Write-Host "  • Use lowercase and hyphens"
Write-Host "  • Can be omitted for general changes"
Write-Host ""
Write-Host "Subject:" -ForegroundColor Green
Write-Host "  • Imperative mood: 'add' not 'added' or 'adds'"
Write-Host "  • First letter lowercase"
Write-Host "  • No period at the end"
Write-Host "  • Maximum 50 characters (72 with scope)"
Write-Host ""
Write-Host "Examples:" -ForegroundColor Green
Write-Host "  ✓ feat(auth): add JWT token validation"
Write-Host "  ✓ fix(api): resolve race condition in query handler"
Write-Host "  ✓ docs: update README with setup instructions"
Write-Host "  ✓ refactor(core): simplify error handling logic"
Write-Host "  ✓ perf(search): optimize database indexing"
Write-Host "  ✓ style: format code with prettier"
Write-Host "  ✓ test(executor): add unit tests for extraction validator"
Write-Host ""
Write-Host "Body (optional, after blank line):" -ForegroundColor Green
Write-Host "  • Explain WHAT and WHY, not HOW"
Write-Host "  • Wrap at 72 characters"
Write-Host "  • Separate paragraphs with blank lines"
Write-Host ""
Write-Host "Footer (optional, after blank line):" -ForegroundColor Green
Write-Host "  • Reference issues: 'Closes #123' or 'Fixes #456'"
Write-Host "  • Breaking changes: 'BREAKING CHANGE: description'"
Write-Host ""
Write-Host "Current message:" -ForegroundColor Yellow
Write-Host "  $firstLine"
Write-Host ""
Write-Host "Fix and retry:" -ForegroundColor Cyan
Write-Host "  git commit --amend -m '<correct message>'"
Write-Host ""

exit 1
