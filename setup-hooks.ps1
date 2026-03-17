# Setup script for Git hooks with Lefthook (Windows PowerShell)
# Run this after cloning the repository

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "🪝 Setting up Git Hooks (Lefthook)" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Check if lefthook is installed
$lefthookExists = $null -ne (Get-Command lefthook -ErrorAction SilentlyContinue)

if (-not $lefthookExists) {
    Write-Host "❌ Lefthook not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Lefthook using one of these methods:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Using Chocolatey:" -ForegroundColor Green
    Write-Host "  choco install lefthook"
    Write-Host ""
    Write-Host "Using npm:" -ForegroundColor Green
    Write-Host "  npm install -g @evilmartians/lefthook"
    Write-Host ""
    Write-Host "Or download from: https://github.com/evilmartians/lefthook/releases" -ForegroundColor Blue
    Write-Host ""
    exit 1
}

$lefthookVersion = & lefthook --version
Write-Host "✓ Lefthook found: $lefthookVersion" -ForegroundColor Green
Write-Host ""

# Check PowerShell execution policy
$executionPolicy = Get-ExecutionPolicy
if ($executionPolicy -eq "Restricted") {
    Write-Host "⚠️  PowerShell execution policy is 'Restricted'" -ForegroundColor Yellow
    Write-Host "Setting to 'RemoteSigned' for current user..." -ForegroundColor Yellow
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Write-Host "✓ Execution policy updated" -ForegroundColor Green
    Write-Host ""
}

# Install git hooks
Write-Host "📋 Installing git hooks..." -ForegroundColor Cyan
& lefthook install

Write-Host "✓ Git hooks installed" -ForegroundColor Green
Write-Host ""

# Check Node.js dependencies
Write-Host "📦 Checking dependencies..." -ForegroundColor Cyan

$agentsPath = "agents/package.json"
if (Test-Path $agentsPath) {
    Write-Host "Installing agents dependencies..." -ForegroundColor Yellow
    Push-Location agents
    npm install *> $null
    Pop-Location
}

$appPath = "app/package.json"
if (Test-Path $appPath) {
    Write-Host "Installing app dependencies..." -ForegroundColor Yellow
    Push-Location app
    npm install *> $null
    Pop-Location
}

Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Create .env file if it doesn't exist
if (-not (Test-Path ".env")) {
    Write-Host "📝 Creating .env file..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env" -ErrorAction SilentlyContinue
    Write-Host "✓ .env created from .env.example" -ForegroundColor Green
    Write-Host "  (Remember to fill in your actual credentials!)" -ForegroundColor Yellow
} else {
    Write-Host "✓ .env already exists" -ForegroundColor Green
}

Write-Host ""

# Verify setup
Write-Host "🔍 Verifying setup..." -ForegroundColor Cyan
& lefthook status *> $null

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Green
Write-Host "   Read LEFTHOOK_GUIDE.md for complete guide"
Write-Host ""
Write-Host "🚀 Quick start:" -ForegroundColor Green
Write-Host "   • Format code: npm run format"
Write-Host "   • Lint code: npm run lint"
Write-Host "   • Check hooks: npm run hooks:status"
Write-Host ""
Write-Host "💡 Git workflow:" -ForegroundColor Green
Write-Host "   1. Create feature branch: git checkout -b feature/123-description"
Write-Host "   2. Make changes and commit: git commit -m 'feat(scope): message'"
Write-Host "   3. Push changes: git push"
Write-Host ""
Write-Host "✨ All hooks are now active and will run automatically!" -ForegroundColor Green
Write-Host ""
