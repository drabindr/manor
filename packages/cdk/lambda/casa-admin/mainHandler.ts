import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const homesTableName = process.env.HOMES_TABLE || 'Homes';

/**
 * Handler for admin API operations
 */
export const mainHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Set CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
  };

  try {
    const httpMethod = event.httpMethod;
    const path = event.path;
    
    // Handle GET /homes
    if (httpMethod === 'GET' && path === '/homes') {
      const result = await dynamodb.send(new ScanCommand({
        TableName: homesTableName,
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.Items || []),
      };
    }

    // Handle POST /homes (Create a new home)
    if (httpMethod === 'POST' && path === '/homes') {
      const requestBody = JSON.parse(event.body || '{}');
      const { homeId, name, instanceId, status, integrations } = requestBody;

      if (!homeId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'homeId is required' }),
        };
      }

      // Check if integrations is provided and has the required structure
      if (!integrations || typeof integrations !== 'object') {
        requestBody.integrations = {
          google: false,
          alexa: false,
          apple: false
        };
      }

      // Set created timestamp
      requestBody.createdAt = new Date().toISOString();
      requestBody.updatedAt = new Date().toISOString();

      // Store the home record in DynamoDB
      await dynamodb.send(new PutCommand({
        TableName: homesTableName,
        Item: requestBody,
      }));

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ message: 'Home created successfully', homeId }),
      };
    }

    // Handle GET /homes/{homeId}
    if (httpMethod === 'GET' && path.startsWith('/homes/')) {
      const homeId = event.pathParameters?.homeId;
      
      if (!homeId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'homeId is required' }),
        };
      }
      
      const result = await dynamodb.send(new GetCommand({
        TableName: homesTableName,
        Key: { homeId },
      }));

      if (!result.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Home not found' }),
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.Item),
      };
    }

    // Handle PUT /homes/{homeId}
    if (httpMethod === 'PUT' && path.startsWith('/homes/')) {
      const homeId = event.pathParameters?.homeId;
      
      if (!homeId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'homeId is required' }),
        };
      }
      
      // First check if the home exists
      const existingHome = await dynamodb.send(new GetCommand({
        TableName: homesTableName,
        Key: { homeId },
      }));

      if (!existingHome.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Home not found' }),
        };
      }

      const requestBody = JSON.parse(event.body || '{}');
      
      // Merge existing home data with update data
      const updatedHome = {
        ...existingHome.Item,
        ...requestBody,
        homeId, // Ensure homeId cannot be changed
        updatedAt: new Date().toISOString(),
      };

      // Update the home record
      await dynamodb.send(new PutCommand({
        TableName: homesTableName,
        Item: updatedHome,
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Home updated successfully', homeId }),
      };
    }

    // Handle DELETE /homes/{homeId}
    if (httpMethod === 'DELETE' && path.startsWith('/homes/')) {
      const homeId = event.pathParameters?.homeId;
      
      if (!homeId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'homeId is required' }),
        };
      }

      await dynamodb.send(new DeleteCommand({
        TableName: homesTableName,
        Key: { homeId },
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Home deleted successfully', homeId }),
      };
    }

    // Handle OPTIONS requests (for CORS)
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    // Handle unsupported routes
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Route not found' }),
    };
  } catch (error) {
    console.error('Error processing request:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
