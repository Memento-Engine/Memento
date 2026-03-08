# Full Lint Check for Pre-Push
# Runs comprehensive linting across the entire project

Write-Host "📋 Running full project lint..." -ForegroundColor Cyan

$hasErrors = $false

# Colors for output
$successColor = "Green"
$errorColor = "Red"
$infoColor = "Cyan"

Write-Host ""
Write-Host "=== TYPESCRIPT/JAVASCRIPT LINTING ===" -ForegroundColor $infoColor

# Check agents lint
if (Test-Path "agents") {
    Write-Host "Checking agents..." -ForegroundColor $infoColor
    Push-Location agents
    
    if (Test-Path "package.json") {
        # Try to run eslint if available
        $eslintTool = npm list eslint 2>$null | Select-String -Pattern "eslint@" -Quiet
        if ($eslintTool -or (Test-Path "node_modules/.bin/eslint")) {
            npx eslint src --max-warnings 10 2>&1 | ForEach-Object {
                if ($_ -match "error|Error") {
                    Write-Host "  ❌ $_" -ForegroundColor $errorColor
                    $hasErrors = $true
                } else {
                    Write-Host "  ℹ️  $_" -ForegroundColor $infoColor
                }
            }
        } else {
            Write-Host "  ⓘ eslint not installed (optional)" -ForegroundColor "Yellow"
        }
    }
    Pop-Location
}

# Check app lint
if (Test-Path "app") {
    Write-Host "Checking app..." -ForegroundColor $infoColor
    Push-Location app
    
    if (Test-Path "package.json") {
        # Try to run eslint if available
        $eslintTool = npm list eslint 2>$null | Select-String -Pattern "eslint@" -Quiet
        if ($eslintTool -or (Test-Path "node_modules/.bin/eslint")) {
            npx eslint . --max-warnings 10 2>&1 | ForEach-Object {
                if ($_ -match "error|Error") {
                    Write-Host "  ❌ $_" -ForegroundColor $errorColor
                    $hasErrors = $true
                } else {
                    Write-Host "  ℹ️  $_" -ForegroundColor $infoColor
                }
            }
        } else {
            Write-Host "  ⓘ eslint not installed (optional)" -ForegroundColor "Yellow"
        }
    }
    Pop-Location
}

Write-Host ""
Write-Host "=== RUST LINTING ===" -ForegroundColor $infoColor

# Check Rust clippy
if ((Get-Command cargo -ErrorAction SilentlyContinue) -and (Test-Path "Cargo.toml")) {
    Write-Host "Running clippy..." -ForegroundColor $infoColor
    cargo clippy --all --all-features -- -D warnings 2>&1 | ForEach-Object {
        if ($_ -match "error|warning" -and $_ -match "cargo clippy") {
            Write-Host "  ❌ $_" -ForegroundColor $errorColor
            $hasErrors = $true
        } else {
            Write-Host "  ✓ $_" -ForegroundColor $successColor
        }
    }
} else {
    Write-Host "  ⓘ Cargo not available or no Cargo.toml found" -ForegroundColor "Yellow"
}

Write-Host ""
Write-Host "=== FORMATTING CHECKS ===" -ForegroundColor $infoColor

# Check Rust formatting
if ((Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Host "Checking Rust formatting..." -ForegroundColor $infoColor
    $fmtResult = cargo fmt -- --check 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ❌ Rust formatting issues found" -ForegroundColor $errorColor
        Write-Host "    Run: cargo fmt --all" -ForegroundColor "Yellow"
        $hasErrors = $true
    } else {
        Write-Host "  ✓ Rust code is properly formatted" -ForegroundColor $successColor
    }
}

# Check Node formatting
foreach ($dir in @("agents", "app")) {
    if (Test-Path "$dir") {
        Push-Location $dir
        if (Test-Path "package.json") {
            Write-Host "Checking Node formatting in $dir..." -ForegroundColor $infoColor
            $prettierTool = npm list prettier 2>$null | Select-Object -Pattern "prettier@" -Quiet
            if ($prettierTool -or (Test-Path "node_modules/.bin/prettier")) {
                npx prettier --check "src/**/*.{ts,tsx,js}" 2>&1 | FindStr "would reformat" > $null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  ❌ Format issues found in $dir" -ForegroundColor $errorColor
                    Write-Host "    Run: npx prettier --write src/**/*.{ts,tsx,js}" -ForegroundColor "Yellow"
                    $hasErrors = $true
                } else {
                    Write-Host "  ✓ Node code is properly formatted in $dir" -ForegroundColor $successColor
                }
            }
        }
        Pop-Location
    }
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor $infoColor

if ($hasErrors) {
    Write-Host "❌ Linting issues found! Fix issues before pushing." -ForegroundColor $errorColor
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor "Yellow"
    Write-Host "  • cargo fmt --all           # Format Rust code"
    Write-Host "  • npx prettier --write .    # Format Node code"
    Write-Host "  • npx eslint --fix .        # Auto-fix lint issues"
    Write-Host "  • cargo clippy --fix        # Auto-fix clippy warnings"
    Write-Host ""
    exit 1
} else {
    Write-Host "✓ All lint checks passed!" -ForegroundColor $successColor
    exit 0
}
