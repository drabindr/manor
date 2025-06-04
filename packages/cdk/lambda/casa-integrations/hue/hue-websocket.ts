import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const textEncoder = new TextEncoder();

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("Received event:", event);
  const requestContext = event.requestContext;
  const connectionId = requestContext.connectionId;
  const domainName = requestContext.domainName;
  const stage = requestContext.stage;
  const tableName = process.env.CONN_TABLE_NAME;

  const apiGwClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  // Handle WebSocket connections
  if (requestContext.routeKey === "$connect") {
    await dynamoDBClient.send(
      new PutCommand({
        TableName: tableName,
        Item: { connectionId },
      })
    );
    console.log(`Connection ID ${connectionId} added to the table.`);
    return { statusCode: 200, body: "Connected." };

  // Handle WebSocket disconnections
  } else if (requestContext.routeKey === "$disconnect") {
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { connectionId },
      })
    );
    console.log(`Connection ID ${connectionId} removed from the table.`);
    return { statusCode: 200, body: "Disconnected." };

  // Handle WebSocket messages
  } else if (requestContext.routeKey === "$default") {
    const body = JSON.parse(event.body || "{}");

    // Log the received command
    console.log(`Received command: ${body.command} from connection ${connectionId}`);

    // Scan DynamoDB to get all connections
    const scanCommand = new ScanCommand({
      TableName: tableName,
    });

    // Get all connection IDs
    const scanResult = await dynamoDBClient.send(scanCommand);

    for (const item of scanResult.Items!) {
      try {
        const message = JSON.stringify({
          command: body.command,
          data: body.data || {},  // Include any additional data if present
        });

        await apiGwClient.send(
          new PostToConnectionCommand({
            ConnectionId: item.connectionId, // Broadcast to all connections
            Data: textEncoder.encode(message),
          })
        );

        // Log the response
        console.log(`Broadcasted command '${body.command}' to connection ${item.connectionId}`);
      } catch (error) {
        console.error(`Failed to send message to connection ${item.connectionId}:`, error);
        
        // Remove connection if the send fails
        await dynamoDBClient.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { connectionId: item.connectionId },
          })
        );
        console.log(`Removed connection ${item.connectionId} from the table.`);
      }
    }

    return {
      statusCode: 200,
      body: `Broadcasted command '${body.command}' to all connections.`,
    };
  }

  return { statusCode: 400, body: "Invalid request." };
};
