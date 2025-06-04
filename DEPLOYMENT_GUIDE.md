# Manor Deployment Setup Guide

## Overview

This guide will help you set up automated CI/CD deployment for the Manor project using GitHub Actions and AWS. The deployment pipeline automatically builds and deploys both the CDK infrastructure and the website when changes are pushed to the main branch.

## Architecture

- **Infrastructure**: AWS CDK (TypeScript) in `packages/cdk/`
- **Website**: Vite + React app in `packages/website/`
- **Authentication**: GitHub OIDC with AWS IAM roles (no access keys)
- **Deployment**: Automated via GitHub Actions

## Prerequisites

Before running the setup script, ensure you have:

1. **AWS CLI** installed and configured
   ```bash
   aws configure
   # Or use: aws configure sso
   ```

2. **Node.js 18+** and npm installed
   ```bash
   node --version  # Should be 18+
   npm --version
   ```

3. **AWS CDK CLI** installed globally
   ```bash
   npm install -g aws-cdk
   ```

4. **OpenAI API Key** (for the Manor AI features)
   - Get yours at: https://platform.openai.com/api-keys

5. **GitHub CLI** (optional but recommended)
   ```bash
   brew install gh
   gh auth login
   ```

## Quick Setup

Run the automated setup script:

```bash
./setup-deployment.sh
```

This script will:
- ✅ Verify all prerequisites
- ✅ Create GitHub OIDC provider in AWS
- ✅ Create IAM role with proper trust policy
- ✅ Bootstrap CDK if needed
- ✅ Configure GitHub repository secrets
- ✅ Provide testing instructions

## Manual Setup (if automated script fails)

### 1. AWS OIDC Provider Setup

```bash
# Create OIDC provider (one-time per AWS account)
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 2. IAM Role Creation

Create `trust-policy.json`:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
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
```

Create the role:
```bash
aws iam create-role \
    --role-name ManorGitHubActionsRole \
    --assume-role-policy-document file://trust-policy.json

# Attach policies
aws iam attach-role-policy \
    --role-name ManorGitHubActionsRole \
    --policy-arn arn:aws:iam::aws:policy/PowerUserAccess

aws iam attach-role-policy \
    --role-name ManorGitHubActionsRole \
    --policy-arn arn:aws:iam::aws:policy/IAMFullAccess
```

### 3. CDK Bootstrap

```bash
cd packages/cdk
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

### 4. GitHub Secrets Configuration

Go to: https://github.com/drabindr/manor/settings/secrets/actions

Create these repository secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ROLE_ARN` | `arn:aws:iam::YOUR_ACCOUNT_ID:role/ManorGitHubActionsRole` | IAM role for GitHub Actions |
| `AWS_ACCOUNT_ID` | Your AWS account ID | Used for CDK deployment |
| `OPENAI_API_KEY` | Your OpenAI API key | Required for AI features |

Or use GitHub CLI:
```bash
gh secret set AWS_ROLE_ARN --body "arn:aws:iam::YOUR_ACCOUNT_ID:role/ManorGitHubActionsRole"
gh secret set AWS_ACCOUNT_ID --body "YOUR_ACCOUNT_ID"
gh secret set OPENAI_API_KEY --body "your-openai-api-key"
```

## Deployment Workflow

The GitHub Actions workflow (`.github/workflows/ci.yml`) includes:

1. **Test Job**: Runs tests for all packages
2. **Security Job**: Runs security scans (npm audit, secrets scan)
3. **Build Job**: 
   - Installs Lambda dependencies
   - Builds CDK infrastructure
   - Extracts configuration from CDK outputs
   - Builds website with environment variables
4. **Deploy Job**:
   - Deploys CDK stack to AWS
   - Uploads website to S3
   - Invalidates CloudFront cache

## Testing Deployment

### 1. Trigger a Deployment

```bash
# Make a small change and push
git add .
git commit -m "chore: test deployment pipeline"
git push origin main
```

### 2. Monitor Progress

- **GitHub Actions**: https://github.com/drabindr/manor/actions
- **AWS CloudFormation**: AWS Console → CloudFormation
- **Website**: Check the deployed URL from CDK outputs

### 3. Local Development

```bash
# Install dependencies
npm install

# Run website locally
cd packages/website
npm run dev

# Deploy manually (if needed)
cd packages/cdk
npm run deploy
```

## Project Structure

```
manor/
├── packages/
│   ├── cdk/                 # AWS infrastructure (CDK)
│   │   ├── lib/            # CDK stack definitions
│   │   ├── lambda/         # Lambda function code
│   │   └── bin/            # CDK app entry point
│   └── website/            # Frontend application
│       ├── src/            # React components
│       └── public/         # Static assets
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions workflow
└── setup-deployment.sh     # Automated setup script
```

## Environment Variables

The website receives these environment variables from CDK outputs:

- `VITE_API_GATEWAY_URL`: API Gateway endpoint
- `VITE_WEBSOCKET_URL`: WebSocket API endpoint
- `VITE_USER_POOL_ID`: Cognito User Pool ID
- `VITE_USER_POOL_CLIENT_ID`: Cognito App Client ID

## Troubleshooting

### Common Issues

1. **"CDK CLI is not compatible with the CDK library"**
   - Update CDK CLI: `npm install -g aws-cdk@latest`

2. **"Role cannot be assumed"**
   - Check trust policy has correct repository name
   - Verify OIDC provider exists

3. **"Bootstrap required"**
   - Run: `cdk bootstrap aws://ACCOUNT_ID/REGION`

4. **Lambda build failures**
   - Check `packages/cdk/lambda/package.json` dependencies
   - Verify Node.js version compatibility

### Debug Commands

```bash
# Check AWS configuration
aws sts get-caller-identity

# Test CDK deployment locally
cd packages/cdk
cdk diff
cdk deploy --require-approval never

# Check GitHub Actions logs
gh run list
gh run view <run-id>

# Verify secrets
gh secret list
```

## Security Considerations

- ✅ Uses OIDC instead of long-lived access keys
- ✅ Role limited to specific repository
- ✅ Automated security scanning in CI
- ✅ Secrets stored in GitHub secrets (encrypted)
- ⚠️ PowerUserAccess policy (adjust for production)

## Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [OpenAI API Documentation](https://platform.openai.com/docs)

## Support

If you encounter issues:

1. Check the GitHub Actions logs first
2. Verify AWS CloudFormation events
3. Review this guide for common solutions
4. Check AWS CloudWatch logs for Lambda functions
