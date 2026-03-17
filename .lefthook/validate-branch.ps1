# Validate Git Branch Naming Convention
# Branch format: <type>/<issue-id>-<description>
# Types: feature, fix, hotfix, refactor, docs, test, chore
# Example: feature/123-user-authentication

$branch = git rev-parse --abbrev-ref HEAD
$mainBranches = @("main", "master", "develop", "staging")

# Allow pushing to main branches
if ($mainBranches -contains $branch) {
    exit 0
}

# Allow existing branches to skip validation (use -f to enforce)
$allBranches = (git branch -a | Where-Object { -not $_.StartsWith('*') }).Trim()
$branchCount = ($allBranches | Measure-Object).Count

# If branch already exists in git, allow it (don't validate pre-existing branches)
if ($branchCount -gt 1 -or $branch -ne '') {
    $branchExists = $allBranches -contains $branch -or $allBranches -like "*$branch`n*"
    if ($branchExists -and $branch) {
        # Allow existing branches - no validation needed
        exit 0
    }
}

# Branch naming pattern for NEW branches:
# Optional: issue ID (123- or #123-)
# Description with hyphens (lowercase)
$validPattern = '^(feature|fix|hotfix|refactor|docs|test|chore)/[a-z0-9]+-[a-z0-9\-]+$'

if ($branch -match $validPattern) {
    exit 0
}

Write-Host '[FAIL] BRANCH NAME VALIDATION FAILED' -ForegroundColor Red
Write-Host ''
Write-Host "Your branch name '$branch' doesn't follow the naming convention:" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Format: <type>/<issue-id>-<description>' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Valid types:' -ForegroundColor Green
Write-Host '  - feature/ - New features'
Write-Host '  - fix/     - Bug fixes'
Write-Host '  - hotfix/  - Urgent production fixes'
Write-Host '  - refactor/- Code refactoring'
Write-Host '  - docs/    - Documentation changes'
Write-Host '  - test/    - Test-related changes'
Write-Host '  - chore/   - Build, CI, dependencies'
Write-Host ''
Write-Host 'Examples:' -ForegroundColor Green
Write-Host '  [OK] feature/123-user-authentication'
Write-Host '  [OK] fix/456-memory-leak-in-search'
Write-Host '  [OK] hotfix/789-critical-api-outage'
Write-Host '  [OK] refactor/cleanup-query-builder'
Write-Host ''
Write-Host 'Guidelines:' -ForegroundColor Cyan
Write-Host '  - Use lowercase letters, numbers, hyphens only'
Write-Host '  - No underscores, spaces, or special characters'
Write-Host '  - Keep under 50 characters'
Write-Host '  - Include issue ID when available'
Write-Host ''
Write-Host 'Rename your branch:' -ForegroundColor Yellow
Write-Host '  git branch -m <new-branch-name>'
Write-Host ""

exit 1
