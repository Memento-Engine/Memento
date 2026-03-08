#!/usr/bin/env powershell
# Comprehensive Lefthook Installation Script for Windows
# This script installs Lefthook and sets up all git hooks

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         Lefthook Installation & Setup for Windows          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Lefthook is already installed
Write-Host "[STEP 1] Checking for Lefthook installation..." -ForegroundColor Yellow
$lefthookExists = $null -ne (Get-Command lefthook -ErrorAction SilentlyContinue)

if ($lefthookExists) {
    $version = & lefthook --version
    Write-Host "✓ Lefthook found: $version" -ForegroundColor Green
} else {
    Write-Host "[OPTION A] Install via Chocolatey (Recommended)" -ForegroundColor Cyan
    Write-Host "  choco install lefthook"
    Write-Host ""
    Write-Host "[OPTION B] Install via npm (Global)" -ForegroundColor Cyan
    Write-Host "  npm install -g @evilmartians/lefthook"
    Write-Host ""
    Write-Host "[OPTION C] Download Binary from:" -ForegroundColor Cyan
    Write-Host "  https://github.com/evilmartians/lefthook/releases"
    Write-Host ""
    Write-Host "✗ Lefthook is not installed. Please install using one of the methods above." -ForegroundColor Red
    Write-Host ""
    
    # Try to install via Chocolatey if available
    $chocoExists = $null -ne (Get-Command choco -ErrorAction SilentlyContinue)
    if ($chocoExists) {
        Write-Host "Attempting to install Lefthook via Chocolatey..." -ForegroundColor Yellow
        choco install lefthook -y
        $lefthookExists = $null -ne (Get-Command lefthook -ErrorAction SilentlyContinue)
        if ($lefthookExists) {
            Write-Host "✓ Lefthook installed successfully!" -ForegroundColor Green
        } else {
            Write-Host "✗ Installation failed. Please install manually." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✗ Chocolatey not found. Please install Lefthook manually." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Step 2: Check PowerShell Execution Policy
Write-Host "[STEP 2] Checking PowerShell Execution Policy..." -ForegroundColor Yellow
$executionPolicy = Get-ExecutionPolicy
if ($executionPolicy -eq "Restricted") {
    Write-Host "  Current policy: $executionPolicy (Too restrictive)" -ForegroundColor Yellow
    Write-Host "  Setting to 'RemoteSigned'..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Write-Host "  ✓ Execution policy updated" -ForegroundColor Green
} else {
    Write-Host "  ✓ Execution policy: $executionPolicy" -ForegroundColor Green
}

Write-Host ""

# Step 3: Install Git Hooks
Write-Host "[STEP 3] Installing Git hooks..." -ForegroundColor Yellow
Push-Location $PSScriptRoot
& lefthook install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Git hooks installed" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install git hooks" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host ""

# Step 4: Create .env file if needed
Write-Host "[STEP 4] Checking environment configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "  Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
        Write-Host "  ✓ .env created" -ForegroundColor Green
        Write-Host ""
        Write-Host "  [IMPORTANT] Edit .env and add your actual credentials:" -ForegroundColor Red
        Write-Host "    - OPENAI_API_KEY"
        Write-Host "    - DATABASE_URL"
        Write-Host "    - Other configuration values"
        Write-Host ""
    }
} else {
    Write-Host "  ✓ .env already exists" -ForegroundColor Green
}

Write-Host ""

# Step 5: Install Node dependencies
Write-Host "[STEP 5] Installing Node.js dependencies..." -ForegroundColor Yellow

$nodeInstalled = $null -ne (Get-Command npm -ErrorAction SilentlyContinue)
if (-not $nodeInstalled) {
    Write-Host "  ✗ npm not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
} else {
    if (Test-Path "agents/package.json") {
        Write-Host "  Installing agents dependencies..." -ForegroundColor Cyan
        Push-Location agents
        npm install --silent 2>$null
        Pop-Location
        Write-Host "  ✓ agents dependencies installed" -ForegroundColor Green
    }
    
    if (Test-Path "app/package.json") {
        Write-Host "  Installing app dependencies..." -ForegroundColor Cyan
        Push-Location app
        npm install --silent 2>$null
        Pop-Location
        Write-Host "  ✓ app dependencies installed" -ForegroundColor Green
    }
}

Pop-Location

Write-Host ""

# Step 6: Verify Setup
Write-Host "[STEP 6] Verifying setup..." -ForegroundColor Yellow
& lefthook status 2>&1 | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              ✓ SETUP COMPLETE!                             ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   • Read LEFTHOOK_GUIDE.md for comprehensive guide"
Write-Host "   • Read GIT_HOOKS_QUICKSTART.md for quick reference"
Write-Host ""

Write-Host "🚀 Quick Start:" -ForegroundColor Cyan
Write-Host "   Format code:  npm run format"
Write-Host "   Lint code:    npm run lint"
Write-Host "   Check hooks:  npm run hooks:status"
Write-Host ""

Write-Host "💡 Git Workflow:" -ForegroundColor Cyan
Write-Host "   1. Create branch:    git checkout -b feature/123-description"
Write-Host "   2. Make changes and: git add ."
Write-Host "   3. Commit:           git commit -m 'feat(scope): description'"
Write-Host "   4. Push:             git push origin feature/123-description"
Write-Host ""

Write-Host "🔗 Git Hooks Explanation:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   PRE-COMMIT (runs before each commit):" -ForegroundColor Yellow
Write-Host "   • Branch validation:    Ensure branch follows naming convention"
Write-Host "   • Secrets detection:    Prevent API keys from being committed"
Write-Host "   • File hygiene:         Block .env, node_modules, etc."
Write-Host "   • Code formatting:      Auto-format with Prettier & Rustfmt"
Write-Host "   • Linting:              Check code quality with ESLint & Clippy"
Write-Host "   • Commit validation:    Enforce message format"
Write-Host ""

Write-Host "   PRE-PUSH (runs before pushing to remote):" -ForegroundColor Yellow
Write-Host "   • Cargo check:          Validate Rust compiles"
Write-Host "   • Rust tests:           Run test suite"
Write-Host "   • App build:            Ensure frontend builds"
Write-Host "   • Full lint:            Comprehensive code quality check"
Write-Host ""

Write-Host "📋 Commit Message Format:" -ForegroundColor Cyan
Write-Host "   <type>(<scope>): <subject>"
Write-Host ""
Write-Host "   Examples:"
Write-Host "   • feat(auth): add JWT token validation"
Write-Host "   • fix(api): resolve race condition"
Write-Host "   • docs: update README"
Write-Host ""

Write-Host "🌳 Branch Name Format:" -ForegroundColor Cyan
Write-Host "   <type>/<issue-id>-<description>"
Write-Host ""
Write-Host "   Examples:"
Write-Host "   • feature/123-user-authentication"
Write-Host "   • fix/456-memory-leak-in-search"
Write-Host ""

Write-Host "✨ All hooks are now active and will run automatically!" -ForegroundColor Green
Write-Host ""
