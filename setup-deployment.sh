#!/bin/bash

echo "🏠 Manor Deployment Setup Script"
echo "================================="
echo "This script will configure AWS OIDC and GitHub secrets for Manor deployment"
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   curl 'https://awscli.amazonaws.com/AWSCLIV2.pkg' -o 'AWSCLIV2.pkg'"
    echo "   sudo installer -pkg AWSCLIV2.pkg -target /"
    exit 1
fi

# Check if AWS is configured
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo "❌ AWS CLI not configured. Please run:"
    echo "   aws configure"
    exit 1
fi

echo "✅ AWS CLI configured (Account: $AWS_ACCOUNT_ID)"

# Check GitHub CLI (optional but recommended)
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI found"
    GH_CLI_AVAILABLE=true
    
    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        echo "⚠️  GitHub CLI not authenticated. Run: gh auth login"
        GH_CLI_AVAILABLE=false
    fi
else
    echo "⚠️  GitHub CLI not found (optional). Install with: brew install gh"
    GH_CLI_AVAILABLE=false
fi

# Check CDK CLI
if ! command -v cdk &> /dev/null; then
    echo "❌ CDK CLI not found. Please install it:"
    echo "   npm install -g aws-cdk"
    exit 1
fi

echo "✅ CDK CLI found"
echo ""

# Get repository information
REPO_OWNER="drabindr"
REPO_NAME="manor"
REPO_FULL_NAME="$REPO_OWNER/$REPO_NAME"

echo "📋 Repository: $REPO_FULL_NAME"
echo ""

# Step 1: Create/check OIDC provider
echo "🔧 Step 1: Setting up GitHub OIDC Provider"
echo "==========================================="

OIDC_EXISTS=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')]" --output text 2>/dev/null)

if [ -n "$OIDC_EXISTS" ]; then
    echo "✅ GitHub OIDC provider already exists"
    OIDC_ARN=$(echo "$OIDC_EXISTS" | awk '{print $1}')
    echo "   ARN: $OIDC_ARN"
else
    echo "⚠️  Creating GitHub OIDC provider..."
    
    aws iam create-open-id-connect-provider \
        --url https://token.actions.githubusercontent.com \
        --client-id-list sts.amazonaws.com \
        --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
    
    if [ $? -eq 0 ]; then
        echo "✅ GitHub OIDC provider created successfully"
        OIDC_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
    else
        echo "❌ Failed to create OIDC provider"
        exit 1
    fi
fi

echo ""

# Step 2: Create IAM role
echo "🔧 Step 2: Setting up IAM Role"
echo "=============================="

# Create trust policy
cat > trust-policy.json << EOF
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
                    "token.actions.githubusercontent.com:sub": "repo:${REPO_FULL_NAME}:*"
                }
            }
        }
    ]
}
EOF

ROLE_NAME="ManorGitHubActionsRole"
ROLE_EXISTS=$(aws iam get-role --role-name "$ROLE_NAME" --query "Role.RoleName" --output text 2>/dev/null)

if [ "$ROLE_EXISTS" = "$ROLE_NAME" ]; then
    echo "✅ Role $ROLE_NAME already exists"
    
    # Update trust policy
    echo "🔄 Updating trust policy..."
    aws iam update-assume-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-document file://trust-policy.json
    
    if [ $? -eq 0 ]; then
        echo "✅ Trust policy updated"
    else
        echo "❌ Failed to update trust policy"
        exit 1
    fi
else
    echo "⚠️  Creating IAM role $ROLE_NAME..."
    
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file://trust-policy.json \
        --description "Role for GitHub Actions to deploy Manor infrastructure"
    
    if [ $? -eq 0 ]; then
        echo "✅ IAM role created successfully"
    else
        echo "❌ Failed to create IAM role"
        exit 1
    fi
    
    # Attach necessary policies
    echo "🔗 Attaching policies..."
    
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
    
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
    
    echo "✅ Policies attached"
fi

# Get role ARN
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query "Role.Arn" --output text)
echo "📋 Role ARN: $ROLE_ARN"
echo ""

# Step 3: Check CDK bootstrap
echo "🔧 Step 3: Checking CDK Bootstrap"
echo "=================================="

CDK_BOOTSTRAP=$(aws cloudformation describe-stacks --stack-name CDKToolkit --query "Stacks[0].StackStatus" --output text 2>/dev/null)

if [ "$CDK_BOOTSTRAP" = "CREATE_COMPLETE" ] || [ "$CDK_BOOTSTRAP" = "UPDATE_COMPLETE" ]; then
    echo "✅ CDK is already bootstrapped"
else
    echo "⚠️  CDK not bootstrapped. Bootstrapping now..."
    
    cd packages/cdk || exit 1
    cdk bootstrap "aws://${AWS_ACCOUNT_ID}/us-east-1"
    
    if [ $? -eq 0 ]; then
        echo "✅ CDK bootstrapped successfully"
    else
        echo "❌ Failed to bootstrap CDK"
        exit 1
    fi
    cd ../..
fi

echo ""

# Step 4: Configure GitHub Secrets
echo "🔧 Step 4: Configuring GitHub Secrets"
echo "====================================="

echo "Required secrets:"
echo "- AWS_ROLE_ARN: $ROLE_ARN"
echo "- AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID"
echo "- OPENAI_API_KEY: (you need to provide this)"
echo ""

if [ "$GH_CLI_AVAILABLE" = true ]; then
    echo "🎯 Setting secrets automatically with GitHub CLI..."
    
    # Set AWS secrets
    gh secret set AWS_ROLE_ARN --body "$ROLE_ARN" --repo "$REPO_FULL_NAME"
    gh secret set AWS_ACCOUNT_ID --body "$AWS_ACCOUNT_ID" --repo "$REPO_FULL_NAME"
    
    # Prompt for OpenAI API key
    echo ""
    echo "📝 Please enter your OpenAI API Key:"
    echo "   (Get it from: https://platform.openai.com/api-keys)"
    read -r -s OPENAI_API_KEY
    
    if [ -n "$OPENAI_API_KEY" ]; then
        gh secret set OPENAI_API_KEY --body "$OPENAI_API_KEY" --repo "$REPO_FULL_NAME"
        echo "✅ All secrets configured successfully!"
    else
        echo "⚠️  OpenAI API Key skipped. Set it manually:"
        echo "   gh secret set OPENAI_API_KEY --body \"your-api-key\" --repo \"$REPO_FULL_NAME\""
    fi
else
    echo "📋 Manual secret configuration required:"
    echo ""
    echo "Go to: https://github.com/$REPO_FULL_NAME/settings/secrets/actions"
    echo ""
    echo "Create these repository secrets:"
    echo ""
    echo "1. AWS_ROLE_ARN"
    echo "   Value: $ROLE_ARN"
    echo ""
    echo "2. AWS_ACCOUNT_ID"
    echo "   Value: $AWS_ACCOUNT_ID"
    echo ""
    echo "3. OPENAI_API_KEY"
    echo "   Value: (get from https://platform.openai.com/api-keys)"
    echo ""
    
    if command -v gh &> /dev/null; then
        echo "Or use these GitHub CLI commands:"
        echo ""
        echo "gh secret set AWS_ROLE_ARN --body \"$ROLE_ARN\" --repo \"$REPO_FULL_NAME\""
        echo "gh secret set AWS_ACCOUNT_ID --body \"$AWS_ACCOUNT_ID\" --repo \"$REPO_FULL_NAME\""
        echo "gh secret set OPENAI_API_KEY --body \"your-api-key\" --repo \"$REPO_FULL_NAME\""
    fi
fi

echo ""

# Step 5: Test deployment
echo "🧪 Step 5: Testing Setup"
echo "========================"
echo ""
echo "Your deployment is now configured! Here's what to do next:"
echo ""
echo "1. 🔄 Test the CI/CD pipeline:"
echo "   git add ."
echo "   git commit -m \"chore: trigger deployment test\""
echo "   git push origin main"
echo ""
echo "2. 📊 Monitor the deployment:"
echo "   https://github.com/$REPO_FULL_NAME/actions"
echo ""
echo "3. 🔍 Check AWS CloudFormation stacks:"
echo "   aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE"
echo ""

# Cleanup
echo "🧹 Cleaning up..."
rm -f trust-policy.json
echo "✅ Cleanup complete"
echo ""

echo "🎉 Manor deployment setup completed successfully!"
echo ""
echo "📚 For troubleshooting, check the GitHub Actions logs or AWS CloudFormation console."
echo ""
