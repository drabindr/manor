import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand, CreatePlatformEndpointCommand } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const sns = new SNSClient({});
const TABLE_NAME = process.env.DEVICE_TOKENS_TABLE || '';
const SNS_PLATFORM_APPLICATION_ARN = process.env.SNS_PLATFORM_APPLICATION_ARN || '';

interface PushNotification {
  alert?: {
    title?: string;
    subtitle?: string;
    body: string;
  } | string;
  body?: string;
  badge?: number;
  sound?: string;
  contentAvailable?: boolean;
  category?: string;
  threadId?: string;
  customData?: Record<string, any>;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }

    const body = JSON.parse(event.body);
    const { 
      userId, 
      deviceToken, 
      notification, 
      useProductionAPNS = true 
    } = body;

    if (!notification) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Missing notification content' })
      };
    }

    // Build APNS payload for SNS
    const apnsPayload = {
      aps: {
        alert: notification.alert || notification.body,
        badge: notification.badge,
        sound: notification.sound || 'default',
        'content-available': notification.contentAvailable ? 1 : 0,
        category: notification.category,
        'thread-id': notification.threadId
      },
      ...notification.customData
    };

    // Remove undefined values
    Object.keys(apnsPayload.aps).forEach(key => {
      if (apnsPayload.aps[key] === undefined) {
        delete apnsPayload.aps[key];
      }
    });

    const messageStructure = {
      default: typeof notification.alert === 'string' 
        ? notification.alert 
        : notification.alert?.body || notification.body || 'Notification',
      APNS: JSON.stringify(apnsPayload),
      APNS_SANDBOX: JSON.stringify(apnsPayload)
    };

    try {
      // If deviceToken is provided, send to that specific device
      if (deviceToken) {
        // Create or get SNS endpoint for the device token
        const endpointResponse = await sns.send(new CreatePlatformEndpointCommand({
          PlatformApplicationArn: SNS_PLATFORM_APPLICATION_ARN,
          Token: deviceToken
        }));
        
        if (!endpointResponse.EndpointArn) {
          throw new Error('Failed to create SNS endpoint');
        }

        const publishResult = await sns.send(new PublishCommand({
          TargetArn: endpointResponse.EndpointArn,
          MessageStructure: 'json',
          Message: JSON.stringify(messageStructure)
        }));
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Push notification sent',
            messageId: publishResult.MessageId
          })
        };
      }
      
      // If userId is provided, get all tokens for that user
      if (userId) {
        const tokens = await getDeviceTokens(userId);
        
        if (!tokens.length) {
          return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'No device tokens found for user' })
          };
        }
        
        // Send to all user tokens
        const sendPromises = tokens.map(async token => {
          try {
            const endpointResponse = await sns.send(new CreatePlatformEndpointCommand({
              PlatformApplicationArn: SNS_PLATFORM_APPLICATION_ARN,
              Token: token
            }));
            
            if (!endpointResponse.EndpointArn) {
              throw new Error('Failed to create SNS endpoint');
            }

            return await sns.send(new PublishCommand({
              TargetArn: endpointResponse.EndpointArn,
              MessageStructure: 'json',
              Message: JSON.stringify(messageStructure)
            }));
          } catch (error) {
            console.error(`Failed to send to token ${token}:`, error);
            throw error;
          }
        });
        
        const results = await Promise.allSettled(sendPromises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: 'Push notifications processed',
            tokensCount: tokens.length,
            successful,
            failed
          })
        };
      }
      
      // Neither userId nor deviceToken provided
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Either userId or deviceToken is required' })
      };
      
    } catch (error) {
      console.error('SNS Error:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('Error sending push notification:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message: 'Failed to send push notification', 
        error: (error as Error).message 
      })
    };
  }
}

async function getDeviceTokens(userId: string): Promise<string[]> {
  try {
    // First try to get a specific user record
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId }
    }));
    
    // If this is a simple key-value store, look for deviceTokens array
    if (result.Item?.deviceTokens && Array.isArray(result.Item.deviceTokens)) {
      return result.Item.deviceTokens;
    }
    
    // If deviceToken is directly on the item
    if (result.Item?.deviceToken) {
      return [result.Item.deviceToken];
    }
    
    // Otherwise scan for all tokens for this user
    const scanResult = await dynamodb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));
    
    return (scanResult.Items || [])
      .map((item: any) => item.deviceToken)
      .filter(Boolean);
  } catch (error) {
    console.error('Error fetching device tokens:', error);
    return [];
  }
}