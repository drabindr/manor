import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || 'us-east-1';
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const connectionsTableName = process.env.CONN_TABLE_NAME || 'GuardConnectionsTable';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Connect event:', JSON.stringify(event, null, 2));
  console.log(`Using connections table: ${connectionsTableName}`);

  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const endpoint = `https://${domainName}/${stage}`;
  
  // Extract any custom headers that might indicate instance type
  let instanceType = 'client';
  let homeId = '';
  let instanceId = '';
  let clientInfo = '';
  
  // Extract headers with better error handling
  if (event.headers) {
    // Check for casa-main specific headers
    instanceType = event.headers['X-Casa-Instance-Type'] || 
                  event.headers['x-casa-instance-type'] || 'client';
    homeId = event.headers['X-Casa-Home-Id'] || 
             event.headers['x-casa-home-id'] || '';
    instanceId = event.headers['X-Casa-Instance-Id'] || 
                event.headers['x-casa-instance-id'] || '';
    
    // Capture client info for debugging
    clientInfo = event.headers['User-Agent'] || '';
  }
  
  console.log(`Connection from ${instanceType} for home ${homeId || 'unknown'}, instance ${instanceId || 'unknown'}`);
  
  try {
    // Check for existing connection with same clientId/instanceId
    if (instanceId) {
      const existingConnections = await dynamoDBClient.send(new ScanCommand({
        TableName: connectionsTableName,
        FilterExpression: 'instanceId = :instanceId AND connectionId <> :connectionId',
        ExpressionAttributeValues: {
          ':instanceId': instanceId,
          ':connectionId': connectionId
        }
      }));
      
      // Clean up any old connections with the same instanceId
      if (existingConnections.Items && existingConnections.Items.length > 0) {
        console.log(`Found ${existingConnections.Items.length} existing connections for instanceId ${instanceId}`);
        
        // Delete old connections for this instance
        await Promise.all(existingConnections.Items.map(conn => 
          dynamoDBClient.send(new DeleteCommand({
            TableName: connectionsTableName,
            Key: { connectionId: conn.connectionId }
          }))
        ));
        
        console.log(`Cleaned up old connections for instanceId ${instanceId}`);
      }
    }
    
    // Create a timestamp for debug purposes
    const now = new Date().toISOString();
    
    // Store connection information in DynamoDB with all necessary fields
    const connectionItem = {
      connectionId,
      domainName,
      stage,
      endpoint,
      instanceType,
      homeId: homeId || null,
      instanceId: instanceId || null,
      clientInfo,
      connected: true,
      connectedAt: now,
      lastSeen: now
    };
    
    console.log(`Storing connection data: ${JSON.stringify(connectionItem)}`);
    
    await dynamoDBClient.send(new PutCommand({
      TableName: connectionsTableName,
      Item: connectionItem
    }));
    
    console.log(`Connection ${connectionId} stored with endpoint ${endpoint}, type: ${instanceType}`);
    
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Error storing connection:', error);
    if (error instanceof Error) {
      console.error(`Error details: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
    }
    return { statusCode: 500, body: 'Failed to connect' };
  }
};
