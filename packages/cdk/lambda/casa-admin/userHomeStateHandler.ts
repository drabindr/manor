import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoDbClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoDbClient);
const USER_HOME_STATES_TABLE = process.env.USER_HOME_STATES_TABLE || "";

// Define default headers to include CORS
const defaultHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE,PATCH,HEAD"
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const { userId, homeId, state } = JSON.parse(event.body || "{}");

  if (!userId || !homeId || !state) {
    console.error("Missing required parameters:", { userId, homeId, state });
    return {
      statusCode: 400,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Missing required parameters" }),
    };
  }

  const params = {
    TableName: USER_HOME_STATES_TABLE,
    Key: {
      userId,
      homeId,
    },
    UpdateExpression: "set #state = :state, #timestamp = :timestamp",
    ExpressionAttributeNames: {
      "#state": "state",
      "#timestamp": "timestamp",
    },
    ExpressionAttributeValues: {
      ":state": state,
      ":timestamp": new Date().toISOString(),
    },
    ReturnValues: "UPDATED_NEW" as const,
  };

  try {
    console.log("Updating user home state with params:", params);
    await dynamoDb.send(new UpdateCommand(params));
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "User home state updated successfully" }),
    };
  } catch (error) {
    console.error("Error updating user home state:", error);
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

// New handler to save display names
export const saveDisplayNameHandler: APIGatewayProxyHandler = async (event) => {
  const { userId, homeId, displayName } = JSON.parse(event.body || "{}");

  if (!userId || !homeId || !displayName) {
    console.error("Missing required parameters:", { userId, homeId, displayName });
    return {
      statusCode: 400,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Missing required parameters" }),
    };
  }

  const params = {
    TableName: USER_HOME_STATES_TABLE,
    Key: { userId, homeId },
    UpdateExpression: "set #displayName = :displayName",
    ExpressionAttributeNames: { "#displayName": "displayName" },
    ExpressionAttributeValues: { ":displayName": displayName },
    ReturnValues: "UPDATED_NEW" as const,
  };

  try {
    console.log("Saving display name with params:", params);
    await dynamoDb.send(new UpdateCommand(params));
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Display name saved successfully" }),
    };
  } catch (error) {
    console.error("Error saving display name:", error);
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
