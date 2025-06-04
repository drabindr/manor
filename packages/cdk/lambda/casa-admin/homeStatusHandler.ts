import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const homesTableName = process.env.HOMES_TABLE || 'Homes';
const websocketUrl = process.env.WEBSOCKET_URL || 'wss://w42qpgs203.execute-api.us-east-1.amazonaws.com/prod';

/**
 * Handler for home status endpoint
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // Set CORS headers for all responses
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
    };
    
    // Check if a specific home ID was requested
    const homeId = event.pathParameters?.homeId;
    
    if (homeId) {
      // Query for specific home
      const homeData = await getHomeStatus(homeId);
      
      if (!homeData) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: `Home ${homeId} not found` }),
        };
      }
      
      // Try to query current state from casa-main if home is online
      if (homeData.status === 'online' && homeData.instanceId) {
        try {
          const realtimeStatus = await queryRealtimeStatus(homeId);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              ...homeData,
              realtimeStatus,
            }),
          };
        } catch (error) {
          console.error('Error querying realtime status:', error);
          // Return the basic home data if realtime query fails
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify(homeData),
          };
        }
      } else {
        // Return basic home data for offline homes
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(homeData),
        };
      }
    } else {
      // Query all homes
      const homes = await getAllHomes();
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(homes),
      };
    }
  } catch (error) {
    console.error('Error handling request:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
      },
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

/**
 * Get status for a specific home
 */
async function getHomeStatus(homeId: string) {
  const result = await dynamodb.send(new GetCommand({
    TableName: homesTableName,
    Key: { homeId },
  }));
  
  return result.Item;
}

/**
 * Get all homes
 */
async function getAllHomes() {
  const result = await dynamodb.send(new ScanCommand({
    TableName: homesTableName,
  }));
  
  return result.Items || [];
}

/**
 * Query realtime status from casa-main via WebSocket
 */
async function queryRealtimeStatus(homeId: string): Promise<any> {
  // Extract domain and stage from WebSocket URL
  const wsUrlParts = websocketUrl.replace('wss://', '').split('/');
  const domain = wsUrlParts[0];
  const stage = wsUrlParts[1];
  
  const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
    endpoint: `https://${domain}/${stage}`,
    region: 'us-east-1',
  });
  
  // This is a simplified implementation - in reality, you would need to:
  // 1. Create a temporary WebSocket connection
  // 2. Send a status query command
  // 3. Wait for the response
  // 4. Clean up the connection
  
  // For now, we'll just return a placeholder
  return {
    queryTime: new Date().toISOString(),
    note: "Realtime status query not implemented yet - implement using WebSocket connection"
  };
}
