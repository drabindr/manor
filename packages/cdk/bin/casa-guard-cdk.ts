#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CasaGuardCdkStack } from '../lib/casa-guard-cdk-stack';
import { CasaCamerasCdkStack } from '../lib/casa-cameras-cdk-stack';
import { CasaIntegrationsCdkStack } from '../lib/casa-integrations-cdk-stack';
import { CasaCamerasDashboardsStack } from '../lib/casa-cameras-dashboards-stack';
import { CasaAdminCdkStack } from '../lib/casa-admin-cdk-stack';
import { CasaDomainStack } from '../lib/casa-domain-stack';
import { CasaAuthStack } from '../lib/casa-auth-stack';
import { ManorWebsiteStack } from '../lib/manor-website-stack';

const app = new cdk.App();

// Domain stack should be deployed first as other stacks depend on it
const domainStack = new CasaDomainStack(app, 'CasaDomainStack', {
  env: {
    account: '680511694845',
    region: 'us-east-1', // Certificates for CloudFront must be in us-east-1
  },
});

// Auth stack depends on domain stack
const authStack = new CasaAuthStack(app, 'CasaAuthStack', {
  domainName: 'mymanor.click',
  env: {
    account: '680511694845',
    region: 'us-east-1',
  },
});

// Website stack depends on domain stack - now serves Manor website on subdomain
const skipWebsiteDeployment = process.env.SKIP_WEBSITE_DEPLOYMENT === 'true';

const websiteStack = new ManorWebsiteStack(app, 'ManorWebsiteStack', {
  domainName: '720frontrd.mymanor.click',
  hostedZone: domainStack.hostedZone,
  websiteBuildPath: process.env.WEBSITE_BUILD_PATH || '../website/build',
  skipWebsiteDeployment: skipWebsiteDeployment,
  env: {
    account: '680511694845',
    region: 'us-east-1',
  },
});

// Other stacks
new CasaGuardCdkStack(app, 'CasaGuardCdkStack', {});
new CasaCamerasCdkStack(app, 'CasaCamerasCdkStack', {});
new CasaIntegrationsCdkStack(app, 'CasaIntegrationsStack', {});
new CasaCamerasDashboardsStack(app, 'CasaCamerasDashboardsStack', {});
new CasaAdminCdkStack(app, 'CasaAdminCdkStack', {});

// Add dependencies
authStack.addDependency(domainStack);
websiteStack.addDependency(domainStack);