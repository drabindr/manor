#!/bin/bash

# Simple deployment script that builds website and deploys via CDK
set -e

echo "🚀 Deploying Manor Website via CDK"
echo "==================================="

# Change to website directory and build
echo "📦 Building website..."
cd ../website
npm run build:production

# Change back to CDK and deploy
echo "☁️ Deploying infrastructure and content..."
cd ../cdk
npm run deploy:website

echo "✅ Deployment complete!"
echo "🌐 Website available at: https://720frontrd.mymanor.click"
