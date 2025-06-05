import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import {
  RestApi,
  LambdaIntegration,
  MockIntegration,
  PassthroughBehavior,
  GatewayResponse, ResponseType,
} from "aws-cdk-lib/aws-apigateway";
import { Table, AttributeType, ProjectionType } from "aws-cdk-lib/aws-dynamodb"; // Import ProjectionType
import { PolicyStatement, Role, FederatedPrincipal } from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { CfnIdentityPool } from "aws-cdk-lib/aws-cognito";
import { saveDisplayNameHandler } from "../lambda/casa-admin/userHomeStateHandler";

export class CasaAdminCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a DynamoDB table to store home records with enhanced attributes
    const homesTable = new Table(this, "HomesTable", {
      tableName: "Homes",
      partitionKey: { name: "homeId", type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Add GSI for looking up homes by instanceId - Fix: Use ProjectionType.ALL
    homesTable.addGlobalSecondaryIndex({
      indexName: "InstanceIdIndex",
      partitionKey: { name: "instanceId", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL
    });

    // Create a DynamoDB table to store user home states.
    const userHomeStatesTable = new Table(this, "UserHomeStatesTable", {
      tableName: "UserHomeStates2",
      partitionKey: { name: "userId", type: AttributeType.STRING },
      sortKey: { name: "homeId", type: AttributeType.STRING },
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Create a Lambda function to handle admin API operations.
    const mainLambda = new NodejsFunction(this, "MainHandler", {
      entry: "lambda/casa-admin/mainHandler.ts",
      handler: "mainHandler", // Ensure this matches the exported function name in mainHandler.ts
      runtime: lambda.Runtime.NODEJS_LATEST,
      environment: {
        HOMES_TABLE: homesTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*', 'aws-sdk'],
        minify: true,
        platform: 'linux',
      }
    });

    // Create a Lambda function to handle home state queries
    const homeStatusLambda = new NodejsFunction(this, "HomeStatusHandler", {
      entry: "lambda/casa-admin/homeStatusHandler.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_LATEST,
      environment: {
        HOMES_TABLE: homesTable.tableName,
        WEBSOCKET_URL: "wss://w42qpgs203.execute-api.us-east-1.amazonaws.com/prod"
      },
      bundling: {
        externalModules: ['@aws-sdk/*', 'aws-sdk'],
        minify: true,
        platform: 'linux',
      }
    });

    // Create a Lambda function to handle user home state updates.
    const userHomeStateLambda = new NodejsFunction(this, "UserHomeStateHandler", {
      entry: "lambda/casa-admin/userHomeStateHandler.ts",
      handler: "handler", // Ensure this matches the exported function name in userHomeStateHandler.ts
      runtime: lambda.Runtime.NODEJS_LATEST,
      environment: {
        USER_HOME_STATES_TABLE: userHomeStatesTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*', 'aws-sdk'],
        minify: true,
        platform: 'linux',
      }
    });

    // Create a Lambda function to handle saving display names.
    const saveDisplayNameLambda = new NodejsFunction(this, "SaveDisplayNameHandler", {
      entry: "lambda/casa-admin/userHomeStateHandler.ts",
      handler: "saveDisplayNameHandler",
      runtime: lambda.Runtime.NODEJS_LATEST,
      environment: {
        USER_HOME_STATES_TABLE: userHomeStatesTable.tableName,
      },
      bundling: {
        externalModules: ['@aws-sdk/*', 'aws-sdk'],
        minify: true,
        platform: 'linux',
      }
    });

    // Create a Lambda function to handle user profiles.
    const userProfilesLambda = new NodejsFunction(this, "UserProfilesHandler", {
      entry: "lambda/casa-admin/userProfilesHandler.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_LATEST,
      environment: {
        USER_HOME_STATES_TABLE: userHomeStatesTable.tableName,
        USER_POOL_ID: 'us-east-1_5V0U65Iev', // From production config
      },
      bundling: {
        externalModules: ['@aws-sdk/*', 'aws-sdk'],
        minify: true,
        platform: 'linux',
      }
    });

    // Grant the Lambda permission to read/write the tables.
    homesTable.grantReadWriteData(mainLambda);
    homesTable.grantReadWriteData(homeStatusLambda);
    userHomeStatesTable.grantReadWriteData(userHomeStateLambda);
    userHomeStatesTable.grantReadWriteData(saveDisplayNameLambda);
    userHomeStatesTable.grantReadData(userProfilesLambda);

    // Allow the user profiles lambda to read from Cognito User Pool
    userProfilesLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "cognito-idp:AdminGetUser",
        ],
        resources: ["*"], // Will be scoped to specific user pool in production
      })
    );

    // Allow the Lambda to create/update/delete SSM parameters and get parameters by path.
    mainLambda.addToRolePolicy(
      new PolicyStatement({
        actions: [
          "ssm:PutParameter",
          "ssm:GetParametersByPath",
          "ssm:DeleteParameter"
        ],
        resources: ["arn:aws:ssm:us-east-1:680511694845:parameter/*"], // Updated ARN pattern
      })
    );

    // Allow the home status lambda to use execute-api for WebSocket API
    homeStatusLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["execute-api:ManageConnections"],
        resources: ["*"], // Scope this down in production
      })
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
        resources: [userHomeStatesTable.tableArn],
      })
    );

    // Create a REST API for the admin panel.
    const adminApi = new RestApi(this, "AdminApi", {
      restApiName: "CasaAdminService",
      description: "Service for managing home integration settings",
    });

    // Create a MockIntegration to handle OPTIONS (preflight) requests.
    const corsIntegration = new MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers":
              "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Methods":
              "'OPTIONS,GET,POST,PUT,DELETE'",
          },
        },
      ],
      passthroughBehavior: PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": "{\"statusCode\": 200}",
      },
    });

    // Define the method response options to indicate which headers will be returned.
    const methodResponse = {
      statusCode: "200",
      responseParameters: {
        "method.response.header.Access-Control-Allow-Headers": true,
        "method.response.header.Access-Control-Allow-Origin": true,
        "method.response.header.Access-Control-Allow-Methods": true,
      },
    };

    // Define the /homes resource.
    const homesResource = adminApi.root.addResource("homes");
    const lambdaIntegration = new LambdaIntegration(mainLambda, {
      proxy: true,
    });

    // Add methods for /homes.
    homesResource.addMethod("POST", lambdaIntegration);
    homesResource.addMethod("GET", lambdaIntegration);
    homesResource.addMethod("OPTIONS", corsIntegration, {
      methodResponses: [methodResponse],
    });

    // Define a child resource /homes/{homeId} for operations on a specific home.
    const singleHomeResource = homesResource.addResource("{homeId}");
    singleHomeResource.addMethod("PUT", lambdaIntegration);
    singleHomeResource.addMethod("DELETE", lambdaIntegration);
    singleHomeResource.addMethod("OPTIONS", corsIntegration, {
      methodResponses: [methodResponse],
    });

    // Define the /user-home-states resource.
    const userHomeStatesResource = adminApi.root.addResource("user-home-states");
    userHomeStatesResource.addMethod("POST", new LambdaIntegration(userHomeStateLambda));
    userHomeStatesResource.addMethod("OPTIONS", corsIntegration, {
      methodResponses: [methodResponse],
    });

    // Define the /saveDisplayName resource.
    const saveDisplayNameResource = adminApi.root.addResource("saveDisplayName");
    saveDisplayNameResource.addMethod("POST", new LambdaIntegration(saveDisplayNameLambda));
    saveDisplayNameResource.addMethod("OPTIONS", corsIntegration, {
      methodResponses: [methodResponse],
    });

    // Define the /user-profiles resource.
    const userProfilesResource = adminApi.root.addResource("user-profiles");
    userProfilesResource.addMethod("POST", new LambdaIntegration(userProfilesLambda));
    userProfilesResource.addMethod("OPTIONS", corsIntegration, {
      methodResponses: [methodResponse],
    });

    // Define the /home-status resource for getting authoritative state
    const homeStatusResource = adminApi.root.addResource("home-status");
    homeStatusResource.addMethod("GET", new LambdaIntegration(homeStatusLambda));
    homeStatusResource.addResource("{homeId}").addMethod("GET", new LambdaIntegration(homeStatusLambda));
    homeStatusResource.addMethod("OPTIONS", corsIntegration, {
      methodResponses: [methodResponse],
    });

    // Add GatewayResponses for DEFAULT_4XX and DEFAULT_5XX to include CORS headers.
    new GatewayResponse(this, "Default4xxResponse", {
      restApi: adminApi,
      type: ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        "Access-Control-Allow-Methods": "'OPTIONS,GET,POST,PUT,DELETE'",
      },
      statusCode: "200",
    });

    new GatewayResponse(this, "Default5xxResponse", {
      restApi: adminApi,
      type: ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        "Access-Control-Allow-Methods": "'OPTIONS,GET,POST,PUT,DELETE'",
      },
      statusCode: "200",
    });

    new cdk.CfnOutput(this, "AdminApiUrl", {
      value: adminApi.url,
      description: "The URL of the Admin API",
    });
  }
}
