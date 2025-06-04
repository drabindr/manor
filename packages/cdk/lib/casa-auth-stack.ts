import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

export interface CasaAuthStackProps extends cdk.StackProps {
  domainName: string;
}

export class CasaAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authenticatedRole: iam.Role;
  public readonly unauthenticatedRole: iam.Role;

  constructor(scope: Construct, id: string, props: CasaAuthStackProps) {
    super(scope, id, props);

    // Create secret for Apple Sign In private key (value needs to be set manually)
    const applePrivateKeySecret = new secretsmanager.Secret(this, 'ApplePrivateKeySecret', {
      secretName: 'casa-guard/apple-signin-private-key',
      description: 'Private key for Apple Sign In authentication',
    });

    // Create Lambda functions for Cognito triggers
    const preTokenGenerationLambda = new nodejs.NodejsFunction(this, 'PreTokenGenerationFunction', {
      entry: path.join(__dirname, '../lambda/auth/pre-token-generation.ts'),
      functionName: 'casa-guard-pre-token-generation',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        NODE_ENV: 'production',
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    const preSignupLambda = new nodejs.NodejsFunction(this, 'PreSignupFunction', {
      entry: path.join(__dirname, '../lambda/auth/pre-signup.ts'),
      functionName: 'casa-guard-pre-signup',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        NODE_ENV: 'production',
        ALLOWED_APPLE_EMAILS: 'drabindr@gmail.com,jcsubram@gmail.com',
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'CasaGuardUserPool', {
      userPoolName: 'casa-guard-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,  // Keep required - AWS doesn't allow changing this on existing pools
          mutable: true,
        },
        familyName: {
          required: true,  // Keep required - AWS doesn't allow changing this on existing pools
          mutable: true,
        },
      },
      customAttributes: {
        'role': new cognito.StringAttribute({ 
          mutable: true,
        }),
        'homeId': new cognito.StringAttribute({ 
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lambdaTriggers: {
        preTokenGeneration: preTokenGenerationLambda,
        preSignUp: preSignupLambda,
      },
    });

    // Add custom domain for hosted UI
    const userPoolDomain = this.userPool.addDomain('CasaGuardUserPoolDomain', {
      cognitoDomain: {
        domainPrefix: 'casa-guard-auth', // We'll use Cognito domain for now, custom domain later
      },
    });

    // Create User Pool Client for web application
    this.userPoolClient = new cognito.UserPoolClient(this, 'CasaGuardWebClient', {
      userPool: this.userPool,
      userPoolClientName: 'casa-guard-web-client',
      generateSecret: false, // Public client for web apps
      authFlows: {
        userSrp: true,
        userPassword: false, // Disable for security
        adminUserPassword: false,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.APPLE,
      ],
      // Configure token validity periods
      accessTokenValidity: cdk.Duration.hours(24), // Maximum allowed duration (24 hours)
      idTokenValidity: cdk.Duration.hours(24), // Maximum allowed duration (24 hours)  
      refreshTokenValidity: cdk.Duration.days(365), // 1 year - like most consumer apps
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://720frontrd.${props.domainName}/auth/callback`,
          `https://720frontrd.${props.domainName}`,
          `https://${props.domainName}/auth/callback`,
          `https://www.${props.domainName}/auth/callback`,
          'http://localhost:3000/auth/callback', // For development
        ],
        logoutUrls: [
          `https://720frontrd.${props.domainName}`,
          `https://720frontrd.${props.domainName}/auth/callback`,
          `https://${props.domainName}`,
          `https://www.${props.domainName}`,
          'http://localhost:3000', // For development
        ],
      },
    });

    // Apple Sign in with Apple identity provider
    const appleProvider = new cognito.UserPoolIdentityProviderApple(this, 'AppleProvider', {
      userPool: this.userPool,
      clientId: 'com.manor.service.signin',
      teamId: 'P3ABP9SXH7',
      keyId: '7AY5TA7RKG',
      privateKey: applePrivateKeySecret.secretValue.unsafeUnwrap(),
      scopes: ['email', 'name'], // Request both email and name from Apple
      attributeMapping: {
        email: cognito.ProviderAttribute.APPLE_EMAIL,
        // Map Apple name fields to the required User Pool attributes
        // These will be filled with default values by pre-signup Lambda if Apple doesn't provide them
        givenName: cognito.ProviderAttribute.APPLE_FIRST_NAME,
        familyName: cognito.ProviderAttribute.APPLE_LAST_NAME,
      },
    });

    // Update client to depend on the provider
    this.userPoolClient.node.addDependency(appleProvider);

    // Create Identity Pool for AWS credentials
    this.identityPool = new cognito.CfnIdentityPool(this, 'CasaGuardIdentityPool', {
      identityPoolName: 'casa-guard-identity-pool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // Create IAM roles for authenticated and unauthenticated users
    this.authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        CasaGuardAuthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            // S3 access for user-specific resources
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
              ],
              resources: [
                'arn:aws:s3:::casa-guard-user-data/${cognito-identity.amazonaws.com:sub}/*',
              ],
            }),
            // DynamoDB access for user data
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/casa-guard-*`,
              ],
              conditions: {
                'ForAllValues:StringEquals': {
                  'dynamodb:LeadingKeys': ['${cognito-identity.amazonaws.com:sub}'],
                },
              },
            }),
            // API Gateway access
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'execute-api:Invoke',
              ],
              resources: [
                `arn:aws:execute-api:${this.region}:${this.account}:*/*/casa-guard/*`,
              ],
            }),
          ],
        }),
      },
    });

    this.unauthenticatedRole = new iam.Role(this, 'CognitoUnauthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        CasaGuardUnauthenticatedPolicy: new iam.PolicyDocument({
          statements: [
            // Very limited access for unauthenticated users
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
              ],
              resources: [
                'arn:aws:s3:::casa-guard-public/*',
              ],
            }),
          ],
        }),
      },
    });

    // Attach roles to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
        unauthenticated: this.unauthenticatedRole.roleArn,
      },
    });

    // Store configuration in Parameter Store for the web app
    new ssm.StringParameter(this, 'CognitoUserPoolId', {
      parameterName: '/casa-guard/auth/user-pool-id',
      stringValue: this.userPool.userPoolId,
    });

    new ssm.StringParameter(this, 'CognitoUserPoolClientId', {
      parameterName: '/casa-guard/auth/user-pool-client-id',
      stringValue: this.userPoolClient.userPoolClientId,
    });

    new ssm.StringParameter(this, 'CognitoIdentityPoolId', {
      parameterName: '/casa-guard/auth/identity-pool-id',
      stringValue: this.identityPool.ref,
    });

    new ssm.StringParameter(this, 'CognitoDomain', {
      parameterName: '/casa-guard/auth/domain',
      stringValue: userPoolDomain.domainName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: 'CasaGuardUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: 'CasaGuardUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      exportName: 'CasaGuardIdentityPoolId',
    });

    new cdk.CfnOutput(this, 'AuthDomain', {
      value: userPoolDomain.domainName,
      exportName: 'CasaGuardAuthDomain',
    });
  }
}
