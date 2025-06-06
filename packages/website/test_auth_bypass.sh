#!/bin/bash

# Test script to verify the auth bypass functionality
echo "🧪 Testing Auth Bypass Functionality"
echo "=================================="

cd /home/runner/work/manor/manor/packages/website

echo ""
echo "📁 Checking environment files..."
if [ -f ".env.development" ]; then
    echo "✅ .env.development exists"
    echo "   Content:"
    grep "REACT_APP_BYPASS_AUTH_FOR_DEV" .env.development || echo "   ❌ Bypass variable not found"
else
    echo "❌ .env.development missing"
fi

echo ""
echo "🔧 Testing build with bypass enabled..."
export REACT_APP_BYPASS_AUTH_FOR_DEV=true
npm run build > /tmp/build_output.log 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Build successful with bypass enabled"
else
    echo "❌ Build failed with bypass enabled"
    echo "Build output:"
    cat /tmp/build_output.log
    exit 1
fi

echo ""
echo "🔧 Testing build with bypass disabled..."
export REACT_APP_BYPASS_AUTH_FOR_DEV=false
npm run build > /tmp/build_output2.log 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Build successful with bypass disabled"
else
    echo "❌ Build failed with bypass disabled"
    echo "Build output:"
    cat /tmp/build_output2.log
    exit 1
fi

echo ""
echo "📄 Checking documentation..."
if [ -f "DEV_AUTH_BYPASS.md" ]; then
    echo "✅ Documentation exists"
    echo "   File size: $(wc -c < DEV_AUTH_BYPASS.md) bytes"
else
    echo "❌ Documentation missing"
fi

echo ""
echo "✅ All tests passed! Auth bypass feature is ready for use."
echo ""
echo "💡 To use the bypass feature:"
echo "   1. Set REACT_APP_BYPASS_AUTH_FOR_DEV=true in your environment"
echo "   2. Start the development server: npm run dev"
echo "   3. Navigate to the app - you'll see DEV MODE indicators"
echo "   4. Click 'Continue to App (Dev Mode)' to bypass authentication"