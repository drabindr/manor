# Manor - Unified Home Automation Platform

[![CI/CD Status](https://github.com/drabindr/manor/actions/workflows/ci.yml/badge.svg)](https://github.com/drabindr/manor/actions/workflows/ci.yml)
[![GitHub Issues](https://img.shields.io/github/issues/drabindr/manor)](https://github.com/drabindr/manor/issues)
[![GitHub Stars](https://img.shields.io/github/stars/drabindr/manor)](https://github.com/drabindr/manor/stargazers)
[![License](https://img.shields.io/badge/license-Private-red)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](package.json)
[![AWS CDK](https://img.shields.io/badge/AWS-CDK-orange)](packages/cdk)

Manor is a comprehensive monorepo that combines a React-based frontend web application with AWS CDK infrastructure for a complete home automation and management platform.

## Repository Structure

This is a monorepo containing two main packages:

```
manor/
├── packages/
│   ├── website/          # React frontend application
│   └── cdk/              # AWS CDK infrastructure and Lambda functions
├── .github/workflows/    # CI/CD pipelines
└── package.json          # Workspace configuration
```

## Packages

### 📱 Website (`packages/website`)
- **Technology**: React, TypeScript, Vite
- **Purpose**: Frontend web application for home automation control
- **Features**: Device control, camera monitoring, user authentication, real-time updates
- **Package Name**: `@manor/website`

### ☁️ CDK (`packages/cdk`)
- **Technology**: AWS CDK, TypeScript, Python
- **Purpose**: Cloud infrastructure, Lambda functions, and backend services
- **Features**: Authentication, device integrations, data storage, real-time messaging
- **Package Name**: `@manor/cdk`

## Quick Start

### Prerequisites
- Node.js (≥18.0.0)
- npm (≥9.0.0)
- AWS CLI configured (for CDK deployments)
- CDK CLI (`npm install -g aws-cdk`)
- OpenAI API key (for AI features)

### 🚀 One-Command Setup
```bash
# Set up complete CI/CD deployment pipeline
./setup-deployment.sh
```

### Installation
```bash
# Clone the repository
git clone https://github.com/drabindr/manor.git
cd manor

# Install all dependencies
npm install

# Install dependencies for all packages
npm run install:all
```

### Development
```bash
# Build all packages
npm run build

# Start website development server
npm run dev

# Run tests for all packages
npm run test
```

### 🚀 Deployment

**Automated (Recommended):**
- Push to `main` branch triggers automatic deployment via GitHub Actions
- Monitor: https://github.com/drabindr/manor/actions

**Manual:**
```bash
# Deploy infrastructure
npm run deploy
```

**Setup CI/CD Pipeline:**
```bash
# Run the automated setup script
./setup-deployment.sh
```

For detailed deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

## Workspace Scripts

- `npm run build` - Build all packages
- `npm run test` - Run tests for all packages  
- `npm run dev` - Start the website development server
- `npm run deploy` - Deploy CDK infrastructure
- `npm run install:all` - Install dependencies for all packages

## Architecture

### System Overview

Manor uses a serverless, cloud-native architecture on AWS with seamless integration between frontend and backend components:

```
Frontend (React) ↔ REST API ↔ Lambda (API Handlers)
Frontend (React) ↔ WebSocket API ↔ Lambda (WebSocket Handler)
iOS App ↔ REST API ↔ Lambda (API Handlers)
Lambda ↔ DynamoDB (EventLogs, AlarmState, UserHomeStates, Homes)
Lambda ↔ External Services (Google Nest, TP-Link, Airthings, APNs)
Python Scripts ↔ S3 (Video Storage)
```

### Frontend (Website)
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **Authentication**: AWS Cognito integration
- **Real-time**: WebSocket connections to backend
- **UI**: Modern responsive design with Tailwind CSS

### Backend (CDK)
- **Infrastructure**: AWS CDK for Infrastructure as Code
- **Compute**: Lambda functions for serverless processing
- **Storage**: DynamoDB for data persistence
- **Authentication**: Cognito User Pools
- **Real-time**: WebSocket API Gateway
- **Device Integration**: IoT device management and control

### 📋 Detailed Architecture Documentation
- **[System Design & Requirements](packages/cdk/doc/system_design_and_requirements.md)** - Complete system architecture and technical specifications
- **[Data Flow Diagrams](packages/cdk/doc/system_design_and_requirements.md#6-data-flow)** - User interactions and real-time update flows
- **[Security Architecture](packages/cdk/doc/system_design_and_requirements.md#7-security)** - Authentication, authorization, and data encryption details

## 🔄 Key Workflows

### Home Automation Flow
1. **User Command** → Frontend/iOS App → REST API → Lambda Function
2. **Lambda** → External Service API (Nest, TP-Link) → Device Action
3. **Status Update** → DynamoDB → WebSocket → Real-time UI Update

### Security Management Flow
1. **Security Event** → Device/Sensor → Lambda Function → DynamoDB (EventLogs)
2. **Alert Processing** → WebSocket Push → Connected Clients
3. **Mobile Notifications** → APNs → iOS App Push Notification

### Location-based Automation
1. **Location Update** → iOS App → REST API → Lambda Function
2. **Geofence Logic** → Update UserHomeStates → Trigger Automation
3. **Automated Actions** → Device Control → Status Updates

## Git History

This monorepo was created by consolidating two separate repositories:
- `veedu-website` - Frontend React application
- `veedu-cdk` - AWS CDK infrastructure

The git history preserves the development timeline while organizing the code into a clean monorepo structure.

## Security

- All sensitive credentials are configured via environment variables
- AWS secrets are managed through environment variables and AWS services
- No hardcoded credentials are stored in the codebase
- GitHub secret scanning protection is enabled

## Environment Variables

### Website
```bash
# Copy and configure environment files
cp packages/website/.env.example packages/website/.env.local
```

### CDK
```bash
# Required AWS credentials
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
OPENAI_API_KEY=your_openai_key  # For AI features
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes in the appropriate package
3. Ensure all tests pass: `npm run test`
4. Ensure all packages build: `npm run build`
5. Submit a pull request

## CI/CD

Automated CI/CD pipeline with GitHub Actions:
- ✅ Automated testing on pull requests  
- ✅ Building and deployment on merge to main
- ✅ Security scanning and dependency updates
- ✅ AWS OIDC authentication (no access keys)

**Setup**: Run `./setup-deployment.sh` for automated configuration.

## 📚 Documentation

### Getting Started
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Complete deployment setup guide
- **[SETUP_SUMMARY.md](SETUP_SUMMARY.md)** - Quick deployment status and commands
- **[Setup Script](setup-deployment.sh)** - Automated deployment configuration

### Architecture & Technical Details
- **[System Design & Requirements](packages/cdk/doc/system_design_and_requirements.md)** - Complete system architecture
- **[CI/CD Pipeline](.github/workflows/ci.yml)** - GitHub Actions workflow
- **[CDK Deployment Guide](packages/cdk/DEPLOYMENT_SETUP_GUIDE.md)** - CDK-specific deployment instructions

### Component Documentation
- **[Website Package](packages/website/README.md)** - Frontend React application details
- **[CDK Package](packages/cdk/)** - Infrastructure and Lambda functions

## 🔧 Troubleshooting & FAQ

### Quick Fixes
```bash
# Update CDK CLI
npm install -g aws-cdk@latest

# Bootstrap CDK
cdk bootstrap aws://ACCOUNT_ID/us-east-1

# Check GitHub Actions
gh run list

# Reset dependencies
npm run install:all
```

### Common Issues

#### Q: Deployment fails with "AWS credentials not configured"
**A:** Ensure your AWS credentials are properly set up:
```bash
# Check AWS configuration
aws configure list

# For GitHub Actions, verify secrets are set
gh secret list
```

#### Q: CDK deployment fails with bootstrap error
**A:** Bootstrap CDK for your account and region:
```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

#### Q: Website build fails locally
**A:** Check Node.js version and dependencies:
```bash
# Verify Node.js version (>=18.0.0 required)
node --version

# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Q: Lambda functions not deploying correctly
**A:** Verify Lambda dependencies are installed:
```bash
cd packages/cdk/lambda
npm install
```

#### Q: Real-time updates not working
**A:** Check WebSocket API Gateway configuration and connection status in browser dev tools.

#### Q: External integrations (Nest, TP-Link) failing
**A:** Verify API credentials are properly configured in environment variables or AWS SSM parameters.

### Getting Help
- **Detailed Troubleshooting**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#troubleshooting)
- **CDK Issues**: Check [CDK Deployment Guide](packages/cdk/DEPLOYMENT_SETUP_GUIDE.md#troubleshooting)
- **GitHub Issues**: Create an issue in this repository for additional support

## License

This project is private and proprietary.

## Support

For questions or issues, please create an issue in this repository.
