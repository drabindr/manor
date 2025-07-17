import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { TextEncoder } from 'util'; // Import TextEncoder for converting string to Uint8Array

const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log('Message event:', event);

  // Dynamically infer the WebSocket API endpoint from the request context
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const endpoint = `https://${domainName}/${stage}`;

  // Create the API Gateway Management API client with the inferred endpoint
  const apiGwClient = new ApiGatewayManagementApiClient({ endpoint });

  const scanCommand = new ScanCommand({
    TableName: process.env.CONN_TABLE_NAME,
  });
  const scanResult = await dynamoDBClient.send(scanCommand);

  let messageData;
  try {
    messageData = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    console.error('Failed to parse message body:', error);
    return {
      statusCode: 400,
      body: 'Invalid message format.',
    };
  }

  // Add support for doorbell stream commands
  const supportedActions = [
    'start_live_stream',
    'stop_live_stream',
    'start_doorbell_stream',
    'stop_doorbell_stream',
    'ping'
  ];

  const action = messageData.action || messageData.event?.event;
  
  if (!supportedActions.includes(action)) {
    console.log(`Unsupported action: ${action}`);
    return {
      statusCode: 400,
      body: `Unsupported action: ${action}`,
    };
  }

  // Add timestamp and enhance message for stream management
  const enhancedMessage = {
    ...messageData,
    timestamp: new Date().toISOString(),
    connectionId: event.requestContext.connectionId,
  };

  const data = new TextEncoder().encode(JSON.stringify(enhancedMessage));

  let successCount = 0;
  let failureCount = 0;

  for (const item of scanResult.Items!) {
    try {
      await apiGwClient.send(new PostToConnectionCommand({
        ConnectionId: item.connectionId,
        Data: data,
      }));
      successCount++;
    } catch (error) {
      console.error('Failed to send message to connection:', item.connectionId, error);
      failureCount++;
      // Handle stale connections by removing them from the table
      if (error && typeof error === 'object' && 'name' in error && error.name === 'GoneException') {
        try {
          await dynamoDBClient.send(new DeleteCommand({
            TableName: process.env.CONN_TABLE_NAME,
            Key: { connectionId: item.connectionId },
          }));
          console.log(`Removed stale connection: ${item.connectionId}`);
        } catch (deleteError) {
          console.error('Failed to remove stale connection:', deleteError);
        }
      }
    }
  }

  console.log(`Message sent to ${successCount} connections, ${failureCount} failures`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Message sent.',
      successCount,
      failureCount,
      action: action,
    }),
  };
};
