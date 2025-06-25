import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import * as apn from '@parse/node-apn';

const dynamodb = new AWS.DynamoDB.DocumentClient();
const ssm = new AWS.SSM();
const TABLE_NAME = process.env.DEVICE_TOKENS_TABLE || '';

// APNS credentials cache to reduce KMS calls
let apnsCredentialsCache: {
  cert: string;
  key: string;
  teamId: string;
  keyId: string;
  timestamp: number;
} | null = null;

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes cache TTL

interface PushNotification {
  alert?: {
    title?: string;
    subtitle?: string;
    body: string;
  };
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

    // Get APNs credentials from cache or SSM Parameter Store
    let cert, key, teamId, keyId;

    if (apnsCredentialsCache && (Date.now() - apnsCredentialsCache.timestamp) < CACHE_TTL) {
      // Use cached credentials
      cert = apnsCredentialsCache.cert;
      key = apnsCredentialsCache.key;
      teamId = apnsCredentialsCache.teamId;
      keyId = apnsCredentialsCache.keyId;
    } else {
      // Fetch credentials from SSM Parameter Store
      const [certResponse, keyResponse, teamIdResponse, keyIdResponse] = await Promise.all([
        ssm.getParameter({ Name: '/apns/cert', WithDecryption: true }).promise(),
        ssm.getParameter({ Name: '/apns/key', WithDecryption: true }).promise(),
        ssm.getParameter({ Name: '/apns/team-id', WithDecryption: true }).promise(),
        ssm.getParameter({ Name: '/apns/key-id', WithDecryption: true }).promise()
      ]);
      
      cert = certResponse.Parameter?.Value;
      key = keyResponse.Parameter?.Value;
      teamId = teamIdResponse.Parameter?.Value;
      keyId = keyIdResponse.Parameter?.Value;
      
      if (!cert || !key || !teamId || !keyId) {
        throw new Error('Failed to retrieve APNs credentials from Parameter Store');
      }

      // Update cache
      apnsCredentialsCache = {
        cert,
        key,
        teamId,
        keyId,
        timestamp: Date.now()
      };
    }

    // Configure APN provider
    const options: apn.ProviderOptions = {
      token: {
        key,
        keyId,
        teamId
      },
      production: useProductionAPNS
    };

    const apnProvider = new apn.Provider(options);
    
    // Create notification
    const note = new apn.Notification();

    if (notification.alert) {
      note.alert = notification.alert;
    }
    if (notification.badge !== undefined) {
      note.badge = notification.badge;
    }
    if (notification.sound) {
      note.sound = notification.sound;
    }
    if (notification.category) {
      // @ts-ignore - Custom property for APN
      note.category = notification.category;
    }
    if (notification.threadId) {
      // @ts-ignore - Custom property for APN
      note.threadId = notification.threadId;
    }
    if (notification.contentAvailable) {
      note.contentAvailable = true;
    }

    // Add custom data
    if (notification.customData) {
      Object.entries(notification.customData).forEach(([key, value]) => {
        note.payload[key] = value;
      });
    }

    note.topic = 'com.drabindr.casaguard';

    try {
      // If deviceToken is provided, use it directly
      if (deviceToken) {
        const result = await apnProvider.send(note, deviceToken);
        console.log('APNS Send Result:', result);
        
        apnProvider.shutdown();
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: 'Push notification sent',
            result 
          })
        };
      }
      
      // If userId is provided, get all tokens for that user
      if (userId) {
        const tokens = await getDeviceTokens(userId);
        
        if (!tokens.length) {
          apnProvider.shutdown();
          return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'No device tokens found for user' })
          };
        }
        
        const result = await apnProvider.send(note, tokens);
        console.log('APNS Send Result:', result);
        
        apnProvider.shutdown();
        
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: 'Push notifications sent',
            tokensCount: tokens.length,
            result
          })
        };
      }
      
      apnProvider.shutdown();
      
      // Neither userId nor deviceToken provided
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Either userId or deviceToken is required' })
      };
      
    } catch (error) {
      apnProvider.shutdown();
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
  const result = await dynamodb.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }).promise();
  
  return (result.Items || []).map(item => item.deviceToken);
}