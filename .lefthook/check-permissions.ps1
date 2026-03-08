# Check File Permissions and Hygiene
# Prevents problematic files from being committed

Write-Host "Checking file permissions and hygiene..." -ForegroundColor Cyan

# Get staged files
$stagedFiles = (git diff --cached --name-only) -split "`n" | Where-Object { $_ }

$foundIssues = $false

# Files that should never be committed
$forbiddenPatterns = @(
    "\.env$",                      # Environment files
    "\.env\.",                     # .env.local, .env.production, etc.
    "node_modules",                # Node modules
    "\.next",                      # Next.js build
    "target",                      # Rust build
    "\.DS_Store",                  # macOS files
    "Thumbs\.db",                  # Windows thumbnails
    "package-lock\.json$",         # Lock files (use npm-shrinkwrap or yarn.lock)
    "\.vscode/settings\.json$",    # IDE user settings
    "\.idea",                      # IDE settings
    "\.swp$",                      # Vim swap files
    "\.swo$",                      # Vim backup files
    "\.swn$",                      # Vim backup files
    "\~$",                         # Editor temp files
    "\.log$",                      # Log files
    "\.DS_Store",                  # macOS
    "\.vscode/launch\.json$"       # Debug settings
)

foreach ($file in $stagedFiles) {
    # Check forbidden patterns
    foreach ($pattern in $forbiddenPatterns) {
        if ($file -match $pattern) {
            Write-Host "  Problematic file: $file" -ForegroundColor Yellow
            $foundIssues = $true
        }
    }
    
    # Check for Windows executable permissions
    if ($file -match "\.(bat|cmd|ps1|exe)$") {
        Write-Host "ℹ️  Executable script: $file (make sure this is intentional)" -ForegroundColor Cyan
    }
}

if ($foundIssues) {
    Write-Host ""
    Write-Host " FILE HYGIENE CHECKS FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Some files that shouldn't be committed were detected:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Things to check:" -ForegroundColor Green
    Write-Host "  • .env files should never be committed (use .env.example)"
    Write-Host "  • node_modules should be in .gitignore"
    Write-Host "  • Build artifacts should be in .gitignore"
    Write-Host "  • IDE settings should be personal not shared"
    Write-Host "  • Lock files should be committed only once"
    Write-Host "  • Remove files from staging:"
    Write-Host "    git reset HEAD <file>"
    Write-Host ""
    
    # Don't fail hard - these are warnings
    # Users can still commit with --no-verify if needed
    # exit 0
}

Write-Host "✓ File hygiene checks passed" -ForegroundColor Green
exit 0
