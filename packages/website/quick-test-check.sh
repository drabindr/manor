#!/bin/bash

# Simple Test Setup Check
echo "🔍 Quick Test Setup Check"
echo "========================="

cd "$(dirname "${BASH_SOURCE[0]}")"

# Check key files
if [ -f "playwright.config.ts" ] && [ -f ".env.test" ] && [ -d "tests" ]; then
    echo "✅ Core test files present"
else
    echo "❌ Missing core test files"
    exit 1
fi

# Check test count
TEST_COUNT=$(find tests -name "*.spec.ts" | wc -l)
echo "✅ Found $TEST_COUNT test files"

# Check environment
if grep -q "REACT_APP_BYPASS_AUTH_FOR_DEV=true" .env.test; then
    echo "✅ Auth bypass configured"
else
    echo "❌ Auth bypass not configured"
    exit 1
fi

# Check dependency
if [ -d "node_modules/@playwright" ]; then
    echo "✅ Playwright installed"
else
    echo "⚠️  Playwright not installed - run: npm install"
fi

echo ""
echo "🎉 Basic test setup is ready!"
echo "📖 See COMPREHENSIVE_TESTING.md for full documentation"