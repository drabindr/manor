#!/bin/bash

# GitHub Actions Debugging Script
# This script helps determine the correct repository structure for your deployment

echo "🔍 GitHub Actions Repository Structure Debugging"
echo "================================================="

# Check current working directory
echo "Current directory: $(pwd)"
echo ""

# Check repository structure
echo "📁 Repository Structure Analysis:"
echo "--------------------------------"

if [ -d ".git" ]; then
    echo "✅ This is a Git repository"
    echo "Repository name: $(basename $(git rev-parse --show-toplevel))"
    echo "Current branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"
else
    echo "❌ This is not a Git repository root"
fi

echo ""
echo "📦 Package.json files found:"
find . -name "package.json" -type f 2>/dev/null | head -10

echo ""
echo "🌐 Website-related directories:"
find . -type d -name "*website*" 2>/dev/null
find . -type d -name "*web*" 2>/dev/null

echo ""
echo "📊 Directory structure (2 levels):"
tree -L 2 2>/dev/null || find . -maxdepth 2 -type d | head -20

echo ""
echo "🚀 Recommended GitHub Actions Setup:"
echo "======================================"

# Determine the best setup
if [ -f "package.json" ] && [ -d "../website" ]; then
    echo "SETUP TYPE: Monorepo (manor with website + cdk packages)"
    echo ""
    echo "✅ Use the updated deploy.yml workflow which:"
    echo "   1. Checks out veedu-cdk repository (main)"
    echo "   2. Checks out veedu-website repository (separate)"
    echo "   3. Handles missing website gracefully"
    echo ""
    echo "📋 Required GitHub Secrets:"
    echo "   - AWS_ROLE_ARN: arn:aws:iam::ACCOUNT:role/GitHubActionsRole"
    echo "   - AWS_ACCOUNT_ID: your-aws-account-id"
    echo "   - GITHUB_TOKEN: (automatically provided)"
    echo ""
    echo "🔧 Next Steps:"
    echo "   1. Ensure veedu-website exists as separate GitHub repository"
    echo "   2. Configure the secrets in GitHub repository settings"
    echo "   3. Test with: git push origin test-deploy"

elif [ -f "package.json" ] && [ -d "veedu-website" ]; then
    echo "SETUP TYPE: Monorepo (both projects in same repository)"
    echo ""
    echo "✅ Use the deploy-monorepo.yml workflow which:"
    echo "   1. Checks out single repository containing both projects"
    echo "   2. Automatically detects project locations"
    echo "   3. Handles various directory structures"
    echo ""
    echo "📋 Required GitHub Secrets:"
    echo "   - AWS_ROLE_ARN: arn:aws:iam::ACCOUNT:role/GitHubActionsRole"
    echo "   - AWS_ACCOUNT_ID: your-aws-account-id"
    echo ""
    echo "🔧 Next Steps:"
    echo "   1. Move veedu-website into veedu-cdk repository"
    echo "   2. Commit both projects to same repository"
    echo "   3. Use deploy-monorepo.yml as your workflow"

else
    echo "SETUP TYPE: Custom Configuration Needed"
    echo ""
    echo "📁 Current structure doesn't match expected patterns"
    echo "Please choose one of these approaches:"
    echo ""
    echo "Option A: Separate Repositories"
    echo "   - veedu-cdk repository (contains CDK code)"
    echo "   - veedu-website repository (contains React website)"
    echo ""
    echo "Option B: Monorepo"
    echo "   - Single repository containing both projects"
    echo "   - veedu-cdk/ (CDK project)"
    echo "   - veedu-website/ (React website)"
fi

echo ""
echo "🧪 Testing Repository Access:"
echo "=============================="

if command -v gh >/dev/null 2>&1; then
    echo "GitHub CLI detected, testing repository access..."
    gh repo view 2>/dev/null && echo "✅ Can access current repository" || echo "❌ Cannot access repository via gh cli"
else
    echo "GitHub CLI not installed - install with: brew install gh"
fi

echo ""
echo "⚡ Quick Test Commands:"
echo "======================="
echo "Test CDK synthesis: npx cdk synth"
echo "Test website build: cd ../website && npm run build"
echo "Check GitHub secrets: gh secret list (requires gh cli)"

echo ""
echo "🔗 Useful Links:"
echo "=================="
echo "GitHub Actions docs: https://docs.github.com/en/actions"
echo "AWS OIDC setup: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services"
