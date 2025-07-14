import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);
const USER_HOME_STATES_TABLE = process.env.USER_HOME_STATES_TABLE || "";

// JWT Verifier for Cognito tokens
const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID || "us-east-1_DctgZMaFm",
  tokenUse: "id",
  clientId: process.env.USER_POOL_CLIENT_ID || "5nv2s3dlscaug7q0kmfh78g3sh",
});

// Define default headers to include CORS
const defaultHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE,PATCH,HEAD"
};

// Function to extract user info from JWT token
const extractUserFromToken = async (event: any): Promise<{ userId: string; givenName?: string; email?: string } | null> => {
  try {
    // Check for Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader) {
      console.log("No Authorization header found");
      return null;
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      console.log("No token found in Authorization header");
      return null;
    }

    // Verify and decode the JWT token
    const payload = await jwtVerifier.verify(token);
    console.log("JWT payload:", JSON.stringify(payload, null, 2));
    
    return {
      userId: payload.sub,
      givenName: payload.given_name as string | undefined,
      email: payload.email as string | undefined
    };
  } catch (error) {
    console.log("Error extracting user from token:", error);
    return null;
  }
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const httpMethod = event.httpMethod;
  
  // Handle GET requests to fetch user home states
  if (httpMethod === "GET") {
    const homeId = event.queryStringParameters?.homeId;
    
    if (!homeId) {
      console.error("Missing required parameter: homeId");
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({ message: "Missing required parameter: homeId" }),
      };
    }

    const params = {
      TableName: USER_HOME_STATES_TABLE,
      FilterExpression: "homeId = :homeId",
      ExpressionAttributeValues: {
        ":homeId": homeId
      }
    };

    try {
      console.log("Scanning user home states with params:", params);
      const result = await dynamoDb.send(new ScanCommand(params));
      
      return {
        statusCode: 200,
        headers: defaultHeaders,
        body: JSON.stringify({ 
          homeStates: result.Items || [],
          count: result.Count || 0
        }),
      };
    } catch (error) {
      console.error("Error querying user home states:", error);
      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  }
  
  // Handle POST requests to update user home states
  if (httpMethod === "POST") {
    const { userId, homeId, state, displayName } = JSON.parse(event.body || "{}");

    if (!userId || !homeId || !state) {
      console.error("Missing required parameters:", { userId, homeId, state });
      return {
        statusCode: 400,
        headers: defaultHeaders,
        body: JSON.stringify({ message: "Missing required parameters" }),
      };
    }

    // Try to extract user info from JWT token
    const tokenUser = await extractUserFromToken(event);
    
    // Determine the final display name with priority:
    // 1. Explicitly provided displayName
    // 2. Given name from JWT token (if user matches)
    // 3. Extract from userId fallback
    let finalDisplayName = displayName;
    
    if (!finalDisplayName && tokenUser && tokenUser.userId === userId && tokenUser.givenName) {
      finalDisplayName = tokenUser.givenName;
      console.log(`Using first name from JWT token: ${finalDisplayName}`);
    }
    
    if (!finalDisplayName) {
      // Extract display name from Google OAuth userId if not already provided
      const extractDisplayName = (userId: string): string | undefined => {
        // Google OAuth userIds often contain email addresses or names
        // Pattern: google_<numbers>_<email> or similar
        if (userId.includes('@')) {
          const emailPart = userId.split('@')[0];
          // Remove any prefixes like 'google_' or numbers
          const cleanName = emailPart.replace(/^(google_|apple_)?\d*_?/, '');
          return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        }
        
        // If it's a long string, take first few characters
        if (userId.length > 10) {
          return userId.substring(0, 8) + '...';
        }
        
        return undefined;
      };

      finalDisplayName = extractDisplayName(userId);
    }

    // Determine if we should update displayName or use if_not_exists
    const shouldUpdateDisplayName = tokenUser && tokenUser.userId === userId && tokenUser.givenName;
    
    const params = {
      TableName: USER_HOME_STATES_TABLE,
      Key: {
        userId,
        homeId,
      },
      UpdateExpression: shouldUpdateDisplayName 
        ? "set #state = :state, #timestamp = :timestamp, #enabled = if_not_exists(#enabled, :defaultEnabled), #displayName = :displayName"
        : "set #state = :state, #timestamp = :timestamp, #enabled = if_not_exists(#enabled, :defaultEnabled), #displayName = if_not_exists(#displayName, :displayName)",
      ExpressionAttributeNames: {
        "#state": "state",
        "#timestamp": "timestamp",
        "#enabled": "enabled",
        "#displayName": "displayName"
      },
      ExpressionAttributeValues: {
        ":state": state,
        ":timestamp": new Date().toISOString(),
        ":defaultEnabled": true, // New devices are enabled by default - they should work normally
        ":displayName": finalDisplayName || userId.substring(0, 8) + '...' // Set default display name
      },
      ReturnValues: "ALL_NEW" as const,
    };

    console.log("Updating user home state with params:", {
      ...params,
      shouldUpdateDisplayName,
      tokenUserInfo: tokenUser ? { userId: tokenUser.userId, givenName: tokenUser.givenName } : null
    });

    try {
      const result = await dynamoDb.send(new UpdateCommand(params));
      
      return {
        statusCode: 200,
        headers: defaultHeaders,
        body: JSON.stringify({ 
          message: "User home state updated successfully",
          enabled: result.Attributes?.enabled || true
        }),
      };
    } catch (error) {
      console.error("Error updating user home state:", error);
      return {
        statusCode: 500,
        headers: defaultHeaders,
        body: JSON.stringify({ message: "Internal server error" }),
      };
    }
  }
  
  // Handle OPTIONS requests
  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "CORS preflight response" }),
    };
  }
  
  // Handle unsupported methods
  return {
    statusCode: 405,
    headers: defaultHeaders,
    body: JSON.stringify({ message: "Method not allowed" }),
  };
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

// New handler to get device status
export const getDeviceStatusHandler: APIGatewayProxyHandler = async (event) => {
  const { userId, homeId } = event.queryStringParameters || {};

  if (!userId || !homeId) {
    console.error("Missing required parameters:", { userId, homeId });
    return {
      statusCode: 400,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Missing required parameters" }),
    };
  }

  const params = {
    TableName: USER_HOME_STATES_TABLE,
    Key: { userId, homeId },
  };

  try {
    console.log("Getting device status with params:", params);
    const result = await dynamoDb.send(new GetCommand(params));
    
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ 
        enabled: result.Item?.enabled || false,
        state: result.Item?.state || null,
        displayName: result.Item?.displayName || null
      }),
    };
  } catch (error) {
    console.error("Error getting device status:", error);
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

// New handler to update device enabled status
export const updateDeviceStatusHandler: APIGatewayProxyHandler = async (event) => {
  const { userId, homeId, enabled } = JSON.parse(event.body || "{}");

  if (!userId || !homeId || typeof enabled !== 'boolean') {
    console.error("Missing required parameters:", { userId, homeId, enabled });
    return {
      statusCode: 400,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Missing required parameters" }),
    };
  }

  const params = {
    TableName: USER_HOME_STATES_TABLE,
    Key: { userId, homeId },
    UpdateExpression: "set #enabled = :enabled, #timestamp = :timestamp",
    ExpressionAttributeNames: { 
      "#enabled": "enabled",
      "#timestamp": "timestamp"
    },
    ExpressionAttributeValues: { 
      ":enabled": enabled,
      ":timestamp": new Date().toISOString()
    },
    ReturnValues: "UPDATED_NEW" as const,
  };

  try {
    console.log("Updating device status with params:", params);
    await dynamoDb.send(new UpdateCommand(params));
    return {
      statusCode: 200,
      headers: defaultHeaders,
      body: JSON.stringify({ 
        message: "Device status updated successfully",
        enabled: enabled
      }),
    };
  } catch (error) {
    console.error("Error updating device status:", error);
    return {
      statusCode: 500,
      headers: defaultHeaders,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
