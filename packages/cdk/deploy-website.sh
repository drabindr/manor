#!/bin/bash

# Deployment script that runs tests, builds website and deploys via CDK
set -e

echo "🚀 Deploying Veedu Website via CDK"
echo "=================================="

# Change to website directory
cd ../website

# Install dependencies if needed
echo "📦 Installing dependencies..."
if npm ci; then
    echo "✅ Dependencies installed successfully"
else
    echo "⚠️  npm ci failed, trying npm install..."
    if npm install; then
        echo "✅ Dependencies installed with npm install"
    else
        echo "❌ Failed to install dependencies, but attempting to run tests..."
    fi
fi

# Run comprehensive test suite
echo "🧪 Running comprehensive test suite..."
if npm test; then
    echo "✅ All tests passed!"
else
    echo "❌ Tests failed! Stopping deployment."
    echo "📋 Please fix failing tests before deploying."
    exit 1
fi

# Build the website
echo "🏗️ Building website..."
npm run build:production

# Change back to CDK and deploy
echo "☁️ Deploying infrastructure and content..."
cd ../cdk
npm run deploy:website

echo "✅ Deployment complete!"
echo "🌐 Website available at: https://720frontrd.mymanor.click"
