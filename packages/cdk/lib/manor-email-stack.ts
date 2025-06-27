import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export interface ManorEmailStackProps extends StackProps {
  notificationEmail: string;
}

export class ManorEmailStack extends Stack {
  constructor(scope: Construct, id: string, props: ManorEmailStackProps) {
    super(scope, id, props);

    const { notificationEmail } = props;

    // Create SES email identity for sending emails
    const emailIdentity = new ses.EmailIdentity(this, 'ManorEmailIdentity', {
      identity: ses.Identity.email('noreply@mymanor.click'),
    });

    // Lambda function for email signup
    const emailSignupFunction = new NodejsFunction(this, 'EmailSignupFunction', {
      entry: 'lambda/email-signup.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      environment: {
        NOTIFICATION_EMAIL: notificationEmail,
        SENDER_EMAIL: 'noreply@mymanor.click',
      },
    });

    // Grant SES permissions to Lambda
    emailSignupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:SendEmail',
          'ses:SendRawEmail',
        ],
        resources: ['*'],
      })
    );

    // API Gateway for email signup
    const emailApi = new apigateway.RestApi(this, 'ManorEmailApi', {
      restApiName: 'Manor Email Service',
      description: 'API for Manor email signup',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    const emailResource = emailApi.root.addResource('email');
    const signupResource = emailResource.addResource('signup');

    signupResource.addMethod('POST', new apigateway.LambdaIntegration(emailSignupFunction), {
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true,
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
          },
        },
      ],
    });

    // Outputs
    new CfnOutput(this, 'EmailApiUrl', {
      value: emailApi.url,
      description: 'Email API Gateway URL',
      exportName: 'ManorEmailApiUrl',
    });

    new CfnOutput(this, 'EmailSignupEndpoint', {
      value: `${emailApi.url}email/signup`,
      description: 'Email signup endpoint',
      exportName: 'ManorEmailSignupEndpoint',
    });

    new CfnOutput(this, 'SenderEmail', {
      value: 'noreply@mymanor.click',
      description: 'Sender email address',
      exportName: 'ManorSenderEmail',
    });
  }
}
