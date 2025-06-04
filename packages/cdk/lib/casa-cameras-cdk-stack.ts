import * as cdk from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class CasaCamerasCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the DynamoDB table to store WebSocket connections
    const connectionsTable = new Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: AttributeType.STRING },
      tableName: 'CamerasConnectionsTable',
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Create the Lambda functions for connecting, disconnecting, and handling API requests
    const connectLambda = new NodejsFunction(this, 'ConnectLambda', {
      entry: 'lambda/casa-cameras-live-stream/connect.ts',
      environment: {
        CONN_TABLE_NAME: connectionsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    const disconnectLambda = new NodejsFunction(this, 'DisconnectLambda', {
      entry: 'lambda/casa-cameras-live-stream/disconnect.ts',
      environment: {
        CONN_TABLE_NAME: connectionsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    const apiLambda = new NodejsFunction(this, 'ApiLambda', {
      entry: 'lambda/casa-cameras-live-stream/api.ts',
      environment: {
        CONN_TABLE_NAME: connectionsTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    // Grant necessary permissions to the Lambda functions
    connectionsTable.grantReadWriteData(connectLambda);
    connectionsTable.grantReadWriteData(disconnectLambda);
    connectionsTable.grantReadWriteData(apiLambda);

    // Create the WebSocket API
    const webSocketApi = new WebSocketApi(this, 'WebSocketApi');

    // Add routes for $connect and $disconnect
    webSocketApi.addRoute('$connect', {
      integration: new WebSocketLambdaIntegration('ConnectIntegration', connectLambda),
    });

    webSocketApi.addRoute('$disconnect', {
      integration: new WebSocketLambdaIntegration('DisconnectIntegration', disconnectLambda),
    });

    // Add a route for $default to handle API messages
    webSocketApi.addRoute('$default', {
      integration: new WebSocketLambdaIntegration('ApiIntegration', apiLambda),
    });

    // Grant the Lambda functions permission to manage WebSocket connections
    const manageConnectionsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
    });

    connectLambda.addToRolePolicy(manageConnectionsPolicy);
    disconnectLambda.addToRolePolicy(manageConnectionsPolicy);
    apiLambda.addToRolePolicy(manageConnectionsPolicy);

    const stage = new WebSocketStage(this, 'ProdStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Output the WebSocket URL
    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: stage.url,
      description: 'The WebSocket API URL',
    });
  }
}
