# Casa Guard GitHub Actions Deployment Setup Guide

## Current Status ✅

Your GitHub Actions workflow is now ready! Here's what's been completed:

- ✅ **GitHub Actions Workflow**: `.github/workflows/deploy.yml` created and configured
- ✅ **Repository Structure**: Separate `veedu-cdk` and `veedu-website` repositories detected
- ✅ **Workflow Testing**: Local build and deployment scripts validated
- ✅ **Error Handling**: Graceful fallbacks for missing dependencies

## Required Setup Steps

### 1. Configure AWS OIDC Provider (One-time setup)

You need to set up AWS IAM OIDC provider for GitHub Actions authentication:

```bash
# Create the OIDC provider (run once per AWS account)
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create IAM role for GitHub Actions
aws iam create-role \
    --role-name GitHubActionsRole \
    --assume-role-policy-document file://github-actions-trust-policy.json

# Attach necessary policies
aws iam attach-role-policy \
    --role-name GitHubActionsRole \
    --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

**Trust Policy** (save as `github-actions-trust-policy.json`):
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
                    "token.actions.githubusercontent.com:sub": "repo:drabindr/veedu-cdk:*"
                }
            }
        }
    ]
}
```

### 2. Configure GitHub Repository Secrets

Set up these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ROLE_ARN` | `arn:aws:iam::YOUR_ACCOUNT_ID:role/GitHubActionsRole` | IAM role for deployment |
| `AWS_ACCOUNT_ID` | `123456789012` | Your 12-digit AWS account ID |

### 3. Test the Deployment

#### Option A: Test Branch Deployment (Recommended)

```bash
# Create and push a test branch
git checkout -b test-deploy
git push origin test-deploy
```

This will trigger the workflow but skip AWS deployment (safe testing).

#### Option B: Production Deployment

```bash
# Deploy to production (main branch)
git checkout main
git push origin main
```

This will trigger full deployment to AWS.

## Troubleshooting

### Common Issues and Solutions

#### 1. "veedu-website repository checkout failed"

**Cause**: GitHub token doesn't have access to the `veedu-website` repository.

**Solutions**:
- Make `veedu-website` repository public, OR
- Create a Personal Access Token with repo access, OR
- Use the monorepo setup (move `veedu-website` into `veedu-cdk`)

#### 2. "AWS credentials not configured"

**Cause**: GitHub secrets not set up correctly.

**Solution**: Verify secrets are configured:
```bash
gh secret list
```

#### 3. "CDK deployment failed"

**Causes**: Missing AWS permissions or CDK bootstrap.

**Solutions**:
```bash
# Bootstrap CDK (run once per region/account)
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1

# Verify CDK can deploy locally
npm run deploy:infrastructure
```

#### 4. "Website build failed"

**Cause**: Missing dependencies or build script.

**Solution**: Test locally:
```bash
cd ../veedu-website
npm install
npm run build:production
```

## Workflow Details

### What the Workflow Does

1. **Checkout Code**: Downloads both `veedu-cdk` and `veedu-website` repositories
2. **Install Dependencies**: Sets up Node.js and installs npm packages
3. **Build CDK**: Compiles TypeScript and validates CDK code
4. **Deploy Infrastructure**: Deploys authentication, API, and core stacks
5. **Extract Configuration**: Gets AWS resource URLs from CDK outputs
6. **Build Website**: Creates production website with real AWS configuration
7. **Deploy Website**: Uploads website to S3 and invalidates CloudFront

### Deployment Environments

| Branch | Behavior | AWS Deployment |
|--------|----------|----------------|
| `test-deploy` | Builds and validates | ❌ No deployment |
| `main` | Full deployment | ✅ Deploys to AWS |
| Other branches | No action | ❌ No deployment |

## Quick Start Commands

```bash
# 1. Set up AWS OIDC and secrets (see sections above)

# 2. Test with safe branch
git checkout -b test-deploy
git push origin test-deploy

# 3. Check GitHub Actions tab for results

# 4. If successful, deploy to production
git checkout main
git merge test-deploy
git push origin main
```

## Monitoring

### GitHub Actions

- View workflow runs: `https://github.com/drabindr/veedu-cdk/actions`
- Monitor logs for detailed deployment progress
- Check for any error messages or failures

### AWS Resources

After successful deployment, verify:
- CloudFormation stacks created successfully
- S3 bucket contains website files
- CloudFront distribution serves website
- API Gateway endpoints respond correctly

## Next Steps

1. **Set up AWS OIDC provider and IAM role**
2. **Configure GitHub repository secrets**
3. **Test deployment with `test-deploy` branch**
4. **Deploy to production with `main` branch**
5. **Monitor and validate deployed resources**

## Support

If you encounter issues:
1. Check GitHub Actions logs for detailed error messages
2. Verify AWS credentials and permissions
3. Test CDK deployment locally first
4. Ensure all dependencies are installed correctly

The workflow includes comprehensive error handling and debugging output to help identify and resolve issues quickly.
