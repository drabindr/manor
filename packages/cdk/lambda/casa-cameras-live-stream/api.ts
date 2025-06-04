import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
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

  const data = event.body ? new TextEncoder().encode(event.body) : undefined;

  if (!data) {
    return {
      statusCode: 400,
      body: 'No data to send.',
    };
  }

  for (const item of scanResult.Items!) {
    try {
      await apiGwClient.send(new PostToConnectionCommand({
        ConnectionId: item.connectionId,
        Data: data, // Data is now Uint8Array
      }));
    } catch (error) {
      console.error('Failed to send message:', error);
      // Handle errors, e.g., remove invalid connection IDs
    }
  }

  return {
    statusCode: 200,
    body: 'Message sent.',
  };
};
