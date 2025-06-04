import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION || 'us-east-1';
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const connectionsTableName = process.env.CONN_TABLE_NAME || 'GuardConnectionsTable';
const alarmStateTableName = process.env.ALARM_STATE_TABLE_NAME || 'AlarmState';
// Get ping interval from environment variable or use default of 5 minutes
const pingIntervalMinutes = parseInt(process.env.PING_INTERVAL_MINUTES || '5', 10);

/**
 * Sends ping messages to connected clients on a reduced schedule and updates connections that don't respond
 * Optimized to reduce API Gateway costs by:
 * 1. Only pinging a subset of connections each run
 * 2. Using a longer timeout for marking homes as disconnected
 */
export const handler = async (): Promise<void> => {
  try {
    console.log(`Ping handler started with interval of ${pingIntervalMinutes} minutes`);
    
    // Check if this execution should ping connections (by using the current minute)
    // This reduces ping frequency while keeping the Lambda running every minute for status checks
    const currentMinute = new Date().getMinutes();
    const shouldSendPings = currentMinute % pingIntervalMinutes === 0; // Use environment variable for interval
    
    // Get all connections
    const connections = await dynamoDBClient.send(new ScanCommand({
      TableName: connectionsTableName,
    }));

    if (!connections.Items || connections.Items.length === 0) {
      console.log('No connections found');
      return;
    }

    console.log(`Found ${connections.Items.length} connections, will${shouldSendPings ? '' : ' not'} send pings this cycle`);
    
    // Get all connected Casa-Main instances from AlarmState table
    const alarmStates = await dynamoDBClient.send(new ScanCommand({
      TableName: alarmStateTableName,
    }));

    // Track connections that need to be removed
    const staleConnectionIds: string[] = [];
    
    // Only send pings on the reduced schedule
    if (shouldSendPings) {
      // Send ping to connections
      // Batch connections to avoid overwhelming the API Gateway
      const batchSize = 25; // Process connections in batches of 25
      const connectionBatches = [];
      
      for (let i = 0; i < connections.Items.length; i += batchSize) {
        connectionBatches.push(connections.Items.slice(i, i + batchSize));
      }
      
      console.log(`Split ${connections.Items.length} connections into ${connectionBatches.length} batches`);
      
      // Process each batch sequentially to avoid overwhelming API Gateway
      for (let batchIndex = 0; batchIndex < connectionBatches.length; batchIndex++) {
        const batch = connectionBatches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${connectionBatches.length} with ${batch.length} connections`);
        
        const pingPromises = batch.map(async (connection) => {
          const { connectionId, endpoint, instanceType } = connection;
          
          // Skip if necessary data is missing
          if (!connectionId || !endpoint) {
            console.log(`Connection ${connectionId} missing endpoint or connectionId, marking as stale`);
            staleConnectionIds.push(connectionId);
            return;
          }
          
          // Skip pinging casa-main instances too frequently - they will ping us when needed
          // Only send pings to client connections, not to casa-main instances
          if (instanceType === 'casa-main') {
            return;
          }
          
          const apiGatewayManagementApi = new ApiGatewayManagementApiClient({
            endpoint,
            region,
          });

          // Create ping message with timestamp
          const pingMessage = {
            event: 'ping',
            timestamp: new Date().toISOString(),
            homesStatus: alarmStates.Items?.map(home => ({
              homeId: home.id,
              connected: home.connected || false,
              mode: home.mode || 'unknown',
              lastUpdated: home.lastUpdated || new Date().toISOString()
            })) || []
          };

          try {
            await apiGatewayManagementApi.send(
              new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: Buffer.from(JSON.stringify(pingMessage)),
              })
            );
            console.log(`Ping sent to connection: ${connectionId}`);
          } catch (error: any) {
            // Connection is stale if we get a 410 error
            if (error.statusCode === 410 || 
                (error.$metadata && error.$metadata.httpStatusCode === 410) || 
                error.code === 'GoneException') {
              console.log(`Stale connection: ${connectionId}. Adding to removal list.`);
              staleConnectionIds.push(connectionId);
            } else {
              console.error(`Error sending ping to ${connectionId}:`, error);
            }
          }
        });

        // Wait for all ping attempts to complete in this batch
        await Promise.allSettled(pingPromises);
        
        // Add a small delay between batches to prevent rate limiting
        if (batchIndex < connectionBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between batches
        }
      }
    }

    // Check if any casa-main instances haven't responded in the timeout period
    // This still runs every minute to ensure quick detection of disconnected homes
    const timeoutSeconds = Math.max(pingIntervalMinutes * 60 * 1.5, 180); // At least 3 mins or 1.5 times ping interval
    console.log(`Using timeout of ${timeoutSeconds} seconds for casa-main connections`);
    const now = new Date();
    
    if (alarmStates.Items) {
      for (const home of alarmStates.Items) {
        // Skip homes without lastUpdated
        if (!home.lastUpdated) continue;
        
        const lastUpdated = new Date(home.lastUpdated);
        const timeDiff = (now.getTime() - lastUpdated.getTime()) / 1000; // seconds
        
        // If home hasn't updated in the timeout period, mark as disconnected
        if (timeDiff > timeoutSeconds && home.connected) {
          console.log(`Marking home ${home.id} as disconnected (last updated ${timeDiff}s ago)`);
          await dynamoDBClient.send(
            new UpdateCommand({
              TableName: alarmStateTableName,
              Key: { id: home.id },
              UpdateExpression: 'SET connected = :connected',
              ExpressionAttributeValues: {
                ':connected': false,
              },
            })
          );
        }
      }
    }
    
    // Clean up stale connections
    if (staleConnectionIds.length > 0) {
      console.log(`Removing ${staleConnectionIds.length} stale connections`);
      
      // Process deletions in batches
      const batchSize = 25;
      const staleConnectionBatches = [];
      for (let i = 0; i < staleConnectionIds.length; i += batchSize) {
        staleConnectionBatches.push(staleConnectionIds.slice(i, i + batchSize));
      }
      
      let totalSuccess = 0;
      for (const batch of staleConnectionBatches) {
        const deletePromises = batch.map(connectionId => 
          dynamoDBClient.send(
            new DeleteCommand({
              TableName: connectionsTableName,
              Key: { connectionId }
            })
          )
        );
        
        const results = await Promise.allSettled(deletePromises);
        const batchSuccess = results.filter(r => r.status === 'fulfilled').length;
        totalSuccess += batchSuccess;
        
        // Add a small delay between delete batches
        if (batch !== staleConnectionBatches[staleConnectionBatches.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between batches
        }
      }
      
      console.log(`Successfully removed ${totalSuccess}/${staleConnectionIds.length} stale connections`);
    }
    
    console.log('Ping handler completed successfully');
  } catch (error) {
    console.error('Error in ping handler:', error);
  }
};
