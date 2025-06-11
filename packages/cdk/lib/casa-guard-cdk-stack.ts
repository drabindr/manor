import * as cdk from "aws-cdk-lib";
import { WebSocketApi, WebSocketStage } from "aws-cdk-lib/aws-apigatewayv2";
import { WebSocketLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Table, AttributeType, ProjectionType } from "aws-cdk-lib/aws-dynamodb"; // Import ProjectionType
import {
  PolicyStatement,
  Effect,
  FederatedPrincipal,
  Role,
  User,
  AnyPrincipal,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import {
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
} from "aws-cdk-lib/aws-cognito";
import { Bucket, BucketEncryption, HttpMethods, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { applyAutoScaling } from "./helpers";

export class CasaGuardCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const camerasBucketProps = {
      encryption: BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedOrigins: ['http://localhost:3000', '*'],
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.POST, HttpMethods.DELETE, HttpMethods.HEAD],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    };

    const camerasUser = User.fromUserArn(this, "User", "arn:aws:iam::680511694845:user/casa-guard-720-front-road");

    const camerasDataBucket = new Bucket(this, 'CamerasDataBucket', {
      bucketName: 'casa-cameras-data',
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(2),
        },
      ],
      publicReadAccess: true, // Make the bucket publicly readable
      blockPublicAccess: BlockPublicAccess.BLOCK_ACLS, // Allow public access through bucket policies
      ...camerasBucketProps
    });
    camerasDataBucket.grantReadWrite(camerasUser);

    // Add a bucket policy to allow public read access to the live-stream directory
    camerasDataBucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        principals: [new AnyPrincipal()],
        resources: [`${camerasDataBucket.bucketArn}/live-stream/*`],
      })
    );

    const camerasDailyAggData = new Bucket(this, 'CamerasDailyAggBucket', {
      bucketName: 'casa-cameras-daily-aggregate',
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7),
        },
      ],
      ...camerasBucketProps
    });
    camerasDataBucket.grantReadWrite(camerasUser);
 
    const nodeUser = new User(this, 'NodeUser', {
      userName: 'casa-guard-720-front-road',
    });

    const logTable = new Table(this, "LogTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      tableName: "EventLogs",
      timeToLiveAttribute: "ttl",
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Add GSI for homeId in EventLogs table - Fix: Use ProjectionType.ALL
    logTable.addGlobalSecondaryIndex({
      indexName: "HomeIdIndex",
      partitionKey: { name: "homeId", type: AttributeType.STRING },
      sortKey: { name: "timestamp", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    logTable.grantFullAccess(nodeUser);
    
    // Create the AlarmState table
    const alarmStateTable = new Table(this, "AlarmStateTable", {
      tableName: "AlarmState",
      partitionKey: { name: "id", type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Reference the existing UserHomeStates2 table from CasaAdminCdkStack
    const userHomeStatesTable = Table.fromTableArn(
      this,
      "UserHomeStatesTable",
      "arn:aws:dynamodb:us-east-1:680511694845:table/UserHomeStates2"
    );

    // Reference the Homes table from CasaAdminCdkStack
    const homesTable = Table.fromTableArn(
      this,
      "HomesTable",
      `arn:aws:dynamodb:${this.region}:${this.account}:table/Homes`
    );

    // Create an identity pool
    const identityPool = new CfnIdentityPool(this, "CasaGuardIdentityPool", {
      allowUnauthenticatedIdentities: true, // Set to false if you require authentication
    });

    // Create an IAM role for unauthenticated users
    const unauthRole = new Role(this, "CognitoDefaultUnauthRole", {
      assumedBy: new FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    unauthRole.addToPolicy(
      new PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:Scan", "dynamodb:Query"],
        resources: [
          logTable.tableArn, 
          alarmStateTable.tableArn, 
          userHomeStatesTable.tableArn,
          homesTable.tableArn,
          `${logTable.tableArn}/index/HomeIdIndex`
        ],
      })
    );

    camerasDataBucket.grantRead(unauthRole);

    // Attach the IAM roles to the identity pool
    new CfnIdentityPoolRoleAttachment(this, "DefaultValid", {
      identityPoolId: identityPool.ref,
      roles: {
        unauthenticated: unauthRole.roleArn,
      },
    });

    const connectionsTable = new Table(this, "GuardConnectionsTable", {
      partitionKey: { name: "connectionId", type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    const connectLambda = new NodejsFunction(this, "ConnectHandler", {
      entry: "lambda/connect.ts",
      environment: { CONN_TABLE_NAME: connectionsTable.tableName },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    const disconnectLambda = new NodejsFunction(this, "DisconnectHandler", {
      entry: "lambda/disconnect.ts",
      environment: { CONN_TABLE_NAME: connectionsTable.tableName },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    const webSocketApi = new WebSocketApi(this, "WebSocketApi", {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "ConnectIntegration",
          connectLambda
        ),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          "DisconnectIntegration",
          disconnectLambda
        ),
      },
    });

    const webSocketStage = new WebSocketStage(this, "ProdStage", {
      webSocketApi,
      stageName: "prod",
      autoDeploy: true,
    });

    // This is the Lambda function you should check logs for:
    const apiLambda = new NodejsFunction(this, "ApiHandler", {
      entry: "lambda/api.ts",
      environment: {
        CONN_TABLE_NAME: connectionsTable.tableName,
        LOG_TABLE_NAME: logTable.tableName,
        ALARM_STATE_TABLE_NAME: alarmStateTable.tableName,
        HOMES_TABLE_NAME: "Homes",
      },
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    // Create ping Lambda for monitoring connection status
    const pingLambda = new NodejsFunction(this, "PingHandler", {
      entry: "lambda/ping.ts",
      environment: {
        CONN_TABLE_NAME: connectionsTable.tableName,
        ALARM_STATE_TABLE_NAME: alarmStateTable.tableName,
        PING_INTERVAL_MINUTES: "10", // Increased from 5 to 10 minutes to reduce Lambda invocations
      },
      timeout: cdk.Duration.seconds(60), // Increase timeout to handle larger batches of connections
      bundling: {
        externalModules: ['@aws-sdk/*']
      }
    });

    new cdk.aws_events.Rule(this, "PingScheduleRule", {
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(10)), // Reduced from 5 to 10 minutes to decrease Lambda invocations
      targets: [new cdk.aws_events_targets.LambdaFunction(pingLambda)],
    });

    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["execute-api:ManageConnections"],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`,
      ],
    });

    apiLambda.addToRolePolicy(policy);
    pingLambda.addToRolePolicy(policy);

    // This shows the apiLambda handles the default and command routes:
    webSocketApi.addRoute("$default", {
      integration: new WebSocketLambdaIntegration(
        "DefaultIntegration",
        apiLambda
      ),
    });

    webSocketApi.addRoute("command", {
      integration: new WebSocketLambdaIntegration(
        "CommandIntegration",
        apiLambda
      ),
    });

    connectionsTable.grantReadWriteData(connectLambda);
    connectionsTable.grantReadWriteData(disconnectLambda);
    connectionsTable.grantReadWriteData(apiLambda);
    connectionsTable.grantReadWriteData(pingLambda);
    logTable.grantReadWriteData(apiLambda);
    alarmStateTable.grantReadWriteData(apiLambda);
    alarmStateTable.grantReadWriteData(pingLambda);
    alarmStateTable.grantReadWriteData(disconnectLambda);
    homesTable.grantReadWriteData(apiLambda);

    new cdk.CfnOutput(this, "WebSocketURL", {
      value: webSocketStage.url,
      description: "The URL of the WebSocket API",
    });
  }
}
