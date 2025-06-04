import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = process.env.DEVICE_TOKENS_TABLE || '';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Missing request body' })
      };
    }

    const body = JSON.parse(event.body);
    const { userId, deviceToken } = body;

    if (!userId || !deviceToken) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Missing required fields: userId and deviceToken are required' })
      };
    }

    // Store token in DynamoDB with a timestamp and 1-year TTL
    const now = new Date();
    const ttl = Math.floor(now.getTime() / 1000) + (365 * 24 * 60 * 60); // 1 year TTL
    
    const item = {
      userId,
      deviceToken,
      createdAt: now.toISOString(),
      ttl
    };

    await dynamodb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Device token registered successfully',
        userId,
        registeredAt: now.toISOString()
      })
    };
  } catch (error) {
    console.error('Error registering device token:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Failed to register device token', error: (error as Error).message })
    };
  }
}