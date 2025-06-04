import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const textEncoder = new TextEncoder();

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("Received event:", event);

  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const endpoint = `https://${domainName}/${stage}`;
  console.log("Endpoint:", endpoint);

  const connectionId = event.requestContext.connectionId;
  const apiGwClient = new ApiGatewayManagementApiClient({ endpoint });

  try {
    // Scan all connections from DynamoDB
    const scanCommand = new ScanCommand({
      TableName: process.env.CONN_TABLE_NAME,
    });
    const scanResult = await dynamoDBClient.send(scanCommand);

    // Notify other clients of disconnection
    for (const item of scanResult.Items!) {
      if (item.connectionId !== connectionId) {
        try {
          const message = JSON.stringify({
            event: {
              id: Date.now().toString(),
              event: "client_disconnected",
              connectionId,
              timestamp: new Date().toISOString(),
            },
          });

          await apiGwClient.send(
            new PostToConnectionCommand({
              ConnectionId: item.connectionId,
              Data: textEncoder.encode(message),
            })
          );
        } catch (error) {
          console.error("Failed to send message, removing connection:", item.connectionId, error);
          const deleteCommand = new DeleteCommand({
            TableName: process.env.CONN_TABLE_NAME,
            Key: { connectionId: item.connectionId },
          });
          await dynamoDBClient.send(deleteCommand);
        }
      }
    }

    // Remove the disconnecting connection from DynamoDB
    const deleteDisconnectingCommand = new DeleteCommand({
      TableName: process.env.CONN_TABLE_NAME,
      Key: { connectionId },
    });
    await dynamoDBClient.send(deleteDisconnectingCommand);

    return {
      statusCode: 200,
      body: "Disconnected and notified other clients.",
    };
  } catch (error) {
    console.error("Error on disconnect:", error);
    return {
      statusCode: 500,
      body: "Failed to handle disconnect.",
    };
  }
};
