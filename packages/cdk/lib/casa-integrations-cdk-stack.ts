// casa-integrations-cdk-stack.ts

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { applyAutoScaling } from './helpers';

export class CasaIntegrationsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the Lambda function
    const integrationLambda = new NodejsFunction(this, 'IntegrationLambda', {
      entry: 'lambda/casa-integrations/integrationHandler.ts',
      bundling: {
        externalModules: ['@aws-sdk/*'], // Use the '@aws-sdk/*' available in the Lambda runtime
        nodeModules: ['ws', 'node-apn', 'axios', 'uuid'], // Include all required modules
        platform: 'linux',
        minify: false, // Disable minification to help with debugging
        sourceMap: false, // Disable source maps to simplify output
      },
      timeout: cdk.Duration.seconds(10),
    });

    // Grant Lambda permissions to read and write parameters from Parameter Store
    const ssmPolicy = new PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
        'ssm:PutParameter', // Added permission to write
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/tplink/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/google/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/airthings/*`, // Add Airthings permissions
        `arn:aws:ssm:${this.region}:${this.account}:parameter/lg/*`, // Add LG ThinQ permissions
        `arn:aws:ssm:${this.region}:${this.account}:parameter/bhyve/*`, // Add Bhyve permissions
      ],
    });

    integrationLambda.addToRolePolicy(ssmPolicy);

    // Create the REST API with default CORS options
    const api = new RestApi(this, 'CasaIntegrationsApi', {
      restApiName: 'Casa Integrations Service',
      description: 'This service handles control of devices from various providers.',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: Cors.DEFAULT_HEADERS,
      },
    });

    // Define the provider path parameter
    const providerResource = api.root.addResource('{provider}');

    // Define 'deviceType' and 'action' as path parameters
    const deviceTypeResource = providerResource.addResource('{deviceType}');
    const actionResource = deviceTypeResource.addResource('{action}');

    // Set up methods for the actionResource with Lambda Proxy integration
    const integration = new LambdaIntegration(integrationLambda, {
      proxy: true, // Enable Lambda Proxy integration
    });

    actionResource.addMethod('ANY', integration);

    // ==== APPLE PUSH NOTIFICATION SERVICE (APNs) INTEGRATION ====
    // Temporarily commented out due to Lambda zip deployment issues
    /*
    // DynamoDB table to store device tokens
    const deviceTokensTable = new Table(this, 'IntegrationsDeviceTokensTable', {
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'deviceToken', type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl', // Optional TTL for expired tokens
    });
    
    // Lambda function to register device tokens
    const registerTokenLambda = new NodejsFunction(this, 'RegisterTokenLambda', {
      entry: 'lambda/casa-integrations/apns/register-token.ts',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: {
        minify: true,
        externalModules: ['@aws-sdk/*']
      },
      environment: {
        DEVICE_TOKENS_TABLE: deviceTokensTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
    });
    
    // Lambda function to send push notifications
    const sendPushLambda = new NodejsFunction(this, 'SendPushLambda', {
      entry: 'lambda/casa-integrations/apns/send-push.ts',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: {
        minify: true,
        externalModules: ['@aws-sdk/*', 'aws-sdk'], // Include both AWS SDK v2 and v3
        nodeModules: ['node-apn'], // Include node-apn for APNs functionality
        platform: 'linux',
      },
      environment: {
        DEVICE_TOKENS_TABLE: deviceTokensTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });
    
    // Grant Lambda functions access to the device tokens table
    deviceTokensTable.grantReadWriteData(registerTokenLambda);
    deviceTokensTable.grantReadData(sendPushLambda);
    
    // Grant access to Parameter Store for APNs certificates
    const apnsPolicy = new PolicyStatement({
      actions: [
        'ssm:GetParameter',
        'ssm:GetParameters',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/apns/*`,
      ],
    });
    sendPushLambda.addToRolePolicy(apnsPolicy);
    
    // Register token API endpoint
    const apnsResource = api.root.addResource('apns');
    const registerResource = apnsResource.addResource('register');
    const registerIntegration = new LambdaIntegration(registerTokenLambda, {
      proxy: true,
    });
    registerResource.addMethod('POST', registerIntegration);
    
    // Send push notification API endpoint
    const pushResource = apnsResource.addResource('push');
    const pushIntegration = new LambdaIntegration(sendPushLambda, {
      proxy: true,
    });
    pushResource.addMethod('POST', pushIntegration);
    
    // Output the API URLs
    new cdk.CfnOutput(this, 'RegisterTokenURL', {
      value: `${api.url}apns/register`,
      description: 'URL for registering device tokens',
    });
    
    new cdk.CfnOutput(this, 'SendPushURL', {
      value: `${api.url}apns/push`,
      description: 'URL for sending push notifications',
    });
    */

    // Output the main API Gateway URL
    new cdk.CfnOutput(this, 'IntegrationsApiUrl', {
      value: api.url,
      description: 'URL for the main integrations API',
      exportName: 'CasaIntegrationsApiUrl',
    });

    // **Hue integration (unchanged from your original code)**

    // Create a DynamoDB table to track WebSocket connections
    const hueConnectionsTable = new Table(this, 'IntegrationsHueConnectionsTable', {
      partitionKey: { name: 'connectionId', type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Lambda function to handle WebSocket connections, disconnections, and default routes
    const hueWebSocketLambda = new NodejsFunction(this, 'HueWebSocketHandler', {
      entry: 'lambda/casa-integrations/hue/hue-websocket.ts',
      environment: {
        CONN_TABLE_NAME: hueConnectionsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    // Grant the Lambda function read/write access to the DynamoDB table
    hueConnectionsTable.grantReadWriteData(hueWebSocketLambda);

    // Create the WebSocket API for Hue integration
    const hueWebSocketApi = new WebSocketApi(this, 'HueWebSocketApi');

    // WebSocket stage for Hue WebSocket API
    const hueWebSocketStage = new WebSocketStage(this, 'HueProdStage', {
      webSocketApi: hueWebSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // WebSocket route integration for all routes ($connect, $disconnect, $default)
    hueWebSocketApi.addRoute('$connect', {
      integration: new WebSocketLambdaIntegration('HueConnectIntegration', hueWebSocketLambda),
    });

    hueWebSocketApi.addRoute('$disconnect', {
      integration: new WebSocketLambdaIntegration('HueDisconnectIntegration', hueWebSocketLambda),
    });

    hueWebSocketApi.addRoute('$default', {
      integration: new WebSocketLambdaIntegration('HueDefaultIntegration', hueWebSocketLambda),
    });

    // Grant the Lambda function permission to manage WebSocket connections
    const manageConnectionsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${hueWebSocketApi.apiId}/*`],
    });

    hueWebSocketLambda.addToRolePolicy(manageConnectionsPolicy);

    // Output the WebSocket API URL for Philips Hue integration
    new cdk.CfnOutput(this, 'HueWebSocketURL', {
      value: hueWebSocketStage.url,
      description: 'The WebSocket API URL for Hue integration',
    });

    // ==== GARAGE DOOR CONTROL INTEGRATION ====
    
    // Note: Using direct device communication without storing door state in DynamoDB
    // This reduces costs while maintaining reliable WebSocket connections

    // Lambda function to handle garage door control operations
    const garageDoorLambda = new NodejsFunction(this, 'GarageDoorControlLambda', {
      entry: 'lambda/casa-integrations/garage-door/garage-door-handler.ts',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: {
        minify: true,
        externalModules: ['@aws-sdk/*']
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Garage door API endpoints
    const garageDoorResource = api.root.addResource('garage-door');
    
    // Device registration endpoint
    const registerDeviceResource = garageDoorResource.addResource('register');
    const registerDeviceIntegration = new LambdaIntegration(garageDoorLambda, {
      proxy: true,
    });
    registerDeviceResource.addMethod('POST', registerDeviceIntegration);

    // Control endpoint for open/close commands
    const controlResource = garageDoorResource.addResource('control');
    const deviceResource = controlResource.addResource('{deviceId}');
    const commandResource = deviceResource.addResource('{command}');
    const controlIntegration = new LambdaIntegration(garageDoorLambda, {
      proxy: true,
    });
    commandResource.addMethod('POST', controlIntegration);

    // Status endpoint to check door status
    const statusResource = garageDoorResource.addResource('status');
    const statusDeviceResource = statusResource.addResource('{deviceId}');
    const statusIntegration = new LambdaIntegration(garageDoorLambda, {
      proxy: true,
    });
    statusDeviceResource.addMethod('GET', statusIntegration);

    // Heartbeat endpoint for device keep-alive
    const heartbeatResource = garageDoorResource.addResource('heartbeat');
    const heartbeatDeviceResource = heartbeatResource.addResource('{deviceId}');
    const heartbeatIntegration = new LambdaIntegration(garageDoorLambda, {
      proxy: true,
    });
    heartbeatDeviceResource.addMethod('POST', heartbeatIntegration);

    // Output the garage door API URLs
    new cdk.CfnOutput(this, 'GarageDoorRegisterURL', {
      value: `${api.url}garage-door/register`,
      description: 'URL for registering garage door devices',
    });

    new cdk.CfnOutput(this, 'GarageDoorControlURL', {
      value: `${api.url}garage-door/control/{deviceId}/{command}`,
      description: 'URL for controlling garage door (open/close)',
    });

    new cdk.CfnOutput(this, 'GarageDoorStatusURL', {
      value: `${api.url}garage-door/status/{deviceId}`,
      description: 'URL for checking garage door status',
    });

    new cdk.CfnOutput(this, 'GarageDoorHeartbeatURL', {
      value: `${api.url}garage-door/heartbeat/{deviceId}`,
      description: 'URL for garage door device heartbeat',
    });

    // ==== GARAGE DOOR WEBSOCKET INTEGRATION ====
    
    // DynamoDB table to store WebSocket connections
    const garageDoorConnectionsTable = new Table(this, 'GarageDoorConnectionsTable', {
      partitionKey: { name: 'connectionId', type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl', // Auto-cleanup stale connections
    });

    // Lambda function to handle garage door WebSocket operations
    const garageDoorWebSocketLambda = new NodejsFunction(this, 'GarageDoorWebSocketLambda', {
      entry: 'lambda/casa-integrations/garage-door/garage-door-websocket.ts',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: {
        minify: true,
        externalModules: ['@aws-sdk/*']
      },
      environment: {
        CONN_TABLE_NAME: garageDoorConnectionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant Lambda function access to the connections table
    garageDoorConnectionsTable.grantReadWriteData(garageDoorWebSocketLambda);

    // Create the WebSocket API for Garage Door integration
    const garageDoorWebSocketApi = new WebSocketApi(this, 'GarageDoorWebSocketApi');

    // WebSocket stage for Garage Door WebSocket API
    const garageDoorWebSocketStage = new WebSocketStage(this, 'GarageDoorProdStage', {
      webSocketApi: garageDoorWebSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // WebSocket route integration for all routes ($connect, $disconnect, $default)
    garageDoorWebSocketApi.addRoute('$connect', {
      integration: new WebSocketLambdaIntegration('GarageDoorConnectIntegration', garageDoorWebSocketLambda),
    });

    garageDoorWebSocketApi.addRoute('$disconnect', {
      integration: new WebSocketLambdaIntegration('GarageDoorDisconnectIntegration', garageDoorWebSocketLambda),
    });

    garageDoorWebSocketApi.addRoute('$default', {
      integration: new WebSocketLambdaIntegration('GarageDoorDefaultIntegration', garageDoorWebSocketLambda),
    });

    // Grant the Lambda function permission to manage WebSocket connections
    const garageDoorManageConnectionsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${garageDoorWebSocketApi.apiId}/*`],
    });

    garageDoorWebSocketLambda.addToRolePolicy(garageDoorManageConnectionsPolicy);

    // Output the WebSocket API URL for Garage Door integration
    new cdk.CfnOutput(this, 'GarageDoorWebSocketURL', {
      value: garageDoorWebSocketStage.url,
      description: 'The WebSocket API URL for Garage Door real-time communication',
    });
  }
}
