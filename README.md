# Manor - Unified Home Automation Platform

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

### Deployment
```bash
# Deploy infrastructure
npm run deploy
```

## Workspace Scripts

- `npm run build` - Build all packages
- `npm run test` - Run tests for all packages  
- `npm run dev` - Start the website development server
- `npm run deploy` - Deploy CDK infrastructure
- `npm run install:all` - Install dependencies for all packages

## Architecture

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

GitHub Actions workflows are configured for:
- Automated testing on pull requests
- Building and deployment on merge to main
- Security scanning and dependency updates

## License

This project is private and proprietary.

## Support

For questions or issues, please create an issue in this repository.
