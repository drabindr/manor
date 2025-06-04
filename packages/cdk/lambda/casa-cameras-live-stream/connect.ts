// lambda/casa-cameras-live-stream/connect.ts

import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const CONN_TABLE_NAME = process.env.CONN_TABLE_NAME || '';

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
  console.log('Connect event:', JSON.stringify(event));
  const connectionId = event.requestContext.connectionId;

  try {
    await dynamoDBClient.send(new PutCommand({
      TableName: CONN_TABLE_NAME,
      Item: {
        connectionId: connectionId,
        connectedAt: new Date().toISOString()
      }
    }));
    
    console.log(`Connection ID ${connectionId} added to table ${CONN_TABLE_NAME}.`);
    return { statusCode: 200, body: 'Connected.' };
  } catch (e) {
    console.error('Failed to connect:', e);
    return { statusCode: 500, body: 'Failed to connect.' };
  }
};
