#!/bin/bash
# Setup script for Git hooks with Lefthook
# Run this after cloning the repository

set -e  # Exit on error

echo "==================================="
echo "🪝 Setting up Git Hooks (Lefthook)"
echo "==================================="
echo ""

# Check if lefthook is installed
if ! command -v lefthook &> /dev/null; then
    echo "❌ Lefthook not found!"
    echo ""
    echo "Install Lefthook using one of these methods:"
    echo ""
    echo "macOS (Homebrew):"
    echo "  brew install lefthook"
    echo ""
    echo "Linux (Homebrew):"
    echo "  brew install lefthook"
    echo ""
    echo "Or download from: https://github.com/evilmartians/lefthook/releases"
    echo ""
    exit 1
fi

echo "✓ Lefthook found: $(lefthook --version)"
echo ""

# Install git hooks
echo "📋 Installing git hooks..."
lefthook install

echo "✓ Git hooks installed"
echo ""

# Check Node.js dependencies
echo "📦 Checking dependencies..."

if [ -f "agents/package.json" ]; then
    echo "Installing agents dependencies..."
    cd agents
    npm install || true
    cd ..
fi

if [ -f "app/package.json" ]; then
    echo "Installing app dependencies..."
    cd app
    npm install || true
    cd ..
fi

echo "✓ Dependencies installed"
echo ""

# Verify setup
echo "🔍 Verifying setup..."
lefthook status || true

echo ""
echo "==================================="
echo "✅ Setup Complete!"
echo "==================================="
echo ""
echo "📚 Documentation:"
echo "   Read LEFTHOOK_GUIDE.md for complete guide"
echo ""
echo "🚀 Quick start:"
echo "   • Format code: npm run format"
echo "   • Lint code: npm run lint"
echo "   • Check hooks: npm run hooks:status"
echo ""
echo "💡 Git workflow:"
echo "   1. Create feature branch: git checkout -b feature/123-description"
echo "   2. Make changes and commit: git commit -m 'feat(scope): message'"
echo "   3. Push changes: git push"
echo ""
echo "✨ All hooks are now active and will run automatically!"
echo ""
