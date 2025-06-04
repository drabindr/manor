#!/bin/bash

echo "🚀 Manor AWS OIDC Setup Script"
echo "================================"
echo ""

# Get AWS account ID
echo "🔍 Getting AWS account information..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "❌ Error: AWS CLI not configured or no access"
    echo "   Please run: aws configure"
    echo "   Or ensure your AWS credentials are set up"
    exit 1
fi

echo "✅ AWS Account ID: $AWS_ACCOUNT_ID"
echo "✅ AWS CLI configured"
echo ""

# Check if OIDC provider already exists
echo "🔍 Checking for existing OIDC provider..."
OIDC_EXISTS=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')]" --output text 2>/dev/null)

if [ -n "$OIDC_EXISTS" ]; then
    echo "✅ GitHub OIDC provider already exists: $OIDC_EXISTS"
else
    echo "⚠️  GitHub OIDC provider not found, creating..."
    
    # Create OIDC provider
    aws iam create-open-id-connect-provider \
        --url https://token.actions.githubusercontent.com \
        --client-id-list sts.amazonaws.com \
        --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
    
    if [ $? -eq 0 ]; then
        echo "✅ GitHub OIDC provider created successfully"
    else
        echo "❌ Failed to create OIDC provider"
        exit 1
    fi
fi

echo ""

# Create trust policy file
echo "📝 Creating trust policy file..."
cat > github-actions-trust-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:drabindr/manor:*"
                }
            }
        }
    ]
}
EOF

echo "✅ Trust policy file created: github-actions-trust-policy.json"
echo ""

# Check if role already exists
echo "🔍 Checking for existing GitHubActionsRole..."
ROLE_EXISTS=$(aws iam get-role --role-name GitHubActionsRole --query "Role.RoleName" --output text 2>/dev/null)

if [ "$ROLE_EXISTS" = "GitHubActionsRole" ]; then
    echo "✅ GitHubActionsRole already exists"
    
    # Update trust policy
    echo "🔄 Updating trust policy..."
    aws iam update-assume-role-policy \
        --role-name GitHubActionsRole \
        --policy-document file://github-actions-trust-policy.json
    
    if [ $? -eq 0 ]; then
        echo "✅ Trust policy updated successfully"
    else
        echo "❌ Failed to update trust policy"
    fi
else
    echo "⚠️  GitHubActionsRole not found, creating..."
    
    # Create IAM role
    aws iam create-role \
        --role-name GitHubActionsRole \
        --assume-role-policy-document file://github-actions-trust-policy.json \
        --description "Role for GitHub Actions to deploy Manor infrastructure"
    
    if [ $? -eq 0 ]; then
        echo "✅ GitHubActionsRole created successfully"
    else
        echo "❌ Failed to create GitHubActionsRole"
        exit 1
    fi
    
    # Attach policies
    echo "🔗 Attaching policies to GitHubActionsRole..."
    
    # Attach PowerUserAccess (adjust as needed for security)
    aws iam attach-role-policy \
        --role-name GitHubActionsRole \
        --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
    
    # Attach CDK-specific permissions
    aws iam attach-role-policy \
        --role-name GitHubActionsRole \
        --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
    
    echo "✅ Policies attached successfully"
fi

echo ""

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name GitHubActionsRole --query "Role.Arn" --output text)
echo "📋 GitHub Secrets Configuration:"
echo "=================================="
echo ""
echo "Set these secrets in your GitHub repository settings:"
echo "(Settings > Secrets and variables > Actions > New repository secret)"
echo ""
echo "Secret Name: AWS_ROLE_ARN"
echo "Secret Value: $ROLE_ARN"
echo ""
echo "Secret Name: AWS_ACCOUNT_ID"
echo "Secret Value: $AWS_ACCOUNT_ID"
echo ""

# Check CDK bootstrap
echo "🔍 Checking CDK bootstrap status..."
CDK_BOOTSTRAP=$(aws cloudformation describe-stacks --stack-name CDKToolkit --query "Stacks[0].StackStatus" --output text 2>/dev/null)

if [ "$CDK_BOOTSTRAP" = "CREATE_COMPLETE" ] || [ "$CDK_BOOTSTRAP" = "UPDATE_COMPLETE" ]; then
    echo "✅ CDK is already bootstrapped"
else
    echo "⚠️  CDK not bootstrapped. Run this command:"
    echo "   cdk bootstrap aws://${AWS_ACCOUNT_ID}/us-east-1"
fi

echo ""

# GitHub CLI commands
if command -v gh &> /dev/null; then
    echo "🎯 Quick GitHub Secrets Setup:"
    echo "=============================="
    echo ""
    echo "You can set secrets automatically with these commands:"
    echo ""
    echo "gh secret set AWS_ROLE_ARN --body \"$ROLE_ARN\""
    echo "gh secret set AWS_ACCOUNT_ID --body \"$AWS_ACCOUNT_ID\""
    echo ""
    echo "Or run them now? (y/n)"
    read -r response
    if [[ $response =~ ^[Yy]$ ]]; then
        echo "Setting GitHub secrets..."
        gh secret set AWS_ROLE_ARN --body "$ROLE_ARN"
        gh secret set AWS_ACCOUNT_ID --body "$AWS_ACCOUNT_ID"
        echo "✅ GitHub secrets configured!"
    fi
else
    echo "ℹ️  Install GitHub CLI for easier secret management: brew install gh"
fi

echo ""
echo "🧪 Testing Setup:"
echo "================"
echo ""
echo "1. Test branch deployment (safe):"
echo "   git checkout -b test-deploy && git push origin test-deploy"
echo ""
echo "2. Production deployment:"
echo "   git checkout main && git push origin main"
echo ""
echo "3. Monitor deployment:"
echo "   https://github.com/drabindr/manor/actions"
echo ""

# Cleanup
echo "🧹 Cleaning up temporary files..."
rm -f github-actions-trust-policy.json
echo "✅ Setup complete!"
echo ""
echo "📚 For detailed instructions, see: DEPLOYMENT_SETUP_GUIDE.md"
