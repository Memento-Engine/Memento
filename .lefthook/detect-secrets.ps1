# Detect Secrets in Staged Files
# Prevents common secrets like API keys, tokens, passwords from being committed

param(
    [string[]]$StagedFiles
)

Write-Host "Scanning for secrets..." -ForegroundColor Cyan

$secretPatterns = @(
    @{ name = "AWS Access Key";      pattern = "AKIA[0-9A-Z]{16}" }
    @{ name = "AWS Secret Key";      pattern = "aws_secret_access_key" }
    @{ name = "Private Key";         pattern = "-----BEGIN.*PRIVATE KEY" }
    @{ name = "API Key";             pattern = "(api_key|apiKey|API_KEY)\s*[:=]\s*['\"]?[a-zA-Z0-9]{32}" }
    @{ name = "GitHub Token";        pattern = "ghp_[A-Za-z0-9_]{36,255}" }
    @{ name = "NPM Token";           pattern = "npm_[A-Za-z0-9_]{36,255}" }
    @{ name = "Slack Token";         pattern = "xox[baprs]-[0-9]{12}-[0-9]{12}-[0-9a-zA-Z]{32}" }
    @{ name = "Database Password";   pattern = "(password|DATABASE_PASSWORD|db_pass|DB_PASSWORD)\s*[:=]\s*['\"][^'\"]+['\"]" }
    @{ name = ".env file";           pattern = "\.env$" }
    @{ name = "Secrets file";        pattern = "(secrets|credentials|keys)\..*$" }
    @{ name = "Private Config";      pattern = "private|secret" }
)

$foundSecrets = $false
$scanCount = 0
$filesToCheck = if ($StagedFiles) { $StagedFiles } else { (git diff --cached --name-only) -split "`n" | Where-Object { $_ } }

foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        $scanCount++
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        
        # Check file name patterns
        if ($file -match "\.env|secrets|credentials|\.key$" -and $file -notmatch "\.example") {
            Write-Host "  Potential secret file: $file" -ForegroundColor Yellow
            $foundSecrets = $true
        }
        
        # Check content patterns (only for text files)
        if ($content -and -not ($file -match "\.(exe|dll|so|bin|png|jpg|gif)$")) {
            foreach ($pattern in $secretPatterns) {
                if ($content -match $pattern.pattern) {
                    Write-Host "  Possible $($pattern.name) found in: $file" -ForegroundColor Yellow
                    $foundSecrets = $true
                }
            }
        }
    }
}

if ($foundSecrets) {
    Write-Host ""
    Write-Host " SECRETS DETECTION ALERT" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possible secrets were detected in your staged files!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If these are false positives:" -ForegroundColor Green
    Write-Host "  git commit --no-verify  # Skip hook (NOT RECOMMENDED)"
    Write-Host ""
    Write-Host "IMPORTANT SECURITY NOTES:" -ForegroundColor Red
    Write-Host "  • NEVER commit .env files with real credentials"
    Write-Host "  • Use .env.example with placeholder values"
    Write-Host "  • Add .env to .gitignore"
    Write-Host "  • Rotate any exposed secrets immediately"
    Write-Host "  • Never push API keys, tokens, or passwords"
    Write-Host ""
    Write-Host "If you accidentally committed a secret:" -ForegroundColor Yellow
    Write-Host "  git log -p --follow -- <file>  # Check commit history"
    Write-Host "  # Consider: git filter-branch or BFG Repo-Cleaner"
    Write-Host ""
    exit 1
}

Write-Host "✓ Scanned $scanCount files - No secrets detected" -ForegroundColor Green
exit 0
