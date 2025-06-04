import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from 'uuid';

const region = process.env.AWS_REGION || 'us-east-1';
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const connectionsTableName = process.env.CONN_TABLE_NAME || 'GuardConnectionsTable';
const logTableName = process.env.LOG_TABLE_NAME || 'EventLogs';
const alarmStateTableName = process.env.ALARM_STATE_TABLE_NAME || 'AlarmState';
const homesTableName = process.env.HOMES_TABLE_NAME || 'Homes';

// Store API clients by endpoint to avoid recreating them
const apiGatewayClients = new Map<string, ApiGatewayManagementApiClient>();

/**
 * Handle WebSocket API events and forward commands to casa-main
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connection ID' };
  }
  
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;
  const endpoint = `https://${domainName}/${stage}`;
  
  // Get or create API Gateway client for this endpoint
  let apiGatewayManagementApi = apiGatewayClients.get(endpoint);
  if (!apiGatewayManagementApi) {
    apiGatewayManagementApi = new ApiGatewayManagementApiClient({
      endpoint,
      region,
    });
    apiGatewayClients.set(endpoint, apiGatewayManagementApi);
  }

  // Handle route-specific logic
  const routeKey = event.requestContext.routeKey;
  
  try {
    if (routeKey === 'command') {
      return await handleCommand(event, apiGatewayManagementApi, connectionId);
    } else {
      // Handle default route
      return await handleDefaultRoute(event, apiGatewayManagementApi, connectionId);
    }
  } catch (error: unknown) {
    console.error('Error handling event:', error);
    
    // Check if this is a GoneException and clean up the connection
    if (isGoneException(error)) {
      await cleanupStaleConnection(connectionId);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

// Type guard for GoneException errors
function isGoneException(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    return (
      ('code' in error && error.code === 'GoneException') ||
      ('$metadata' in error && 
       typeof error.$metadata === 'object' && 
       error.$metadata !== null &&
       'httpStatusCode' in error.$metadata && 
       error.$metadata.httpStatusCode === 410)
    );
  }
  return false;
}

/**
 * Clean up a stale connection from the connections table
 */
async function cleanupStaleConnection(connectionId: string): Promise<void> {
  try {
    console.log(`Cleaning up stale connection: ${connectionId}`);
    await dynamoDBClient.send(
      new DeleteCommand({
        TableName: connectionsTableName,
        Key: { connectionId },
      })
    );
    console.log(`Successfully removed stale connection: ${connectionId}`);
  } catch (cleanupError) {
    console.error(`Failed to clean up stale connection: ${connectionId}`, cleanupError);
  }
}

/**
 * Handle command messages to execute actions on casa-main
 */
async function handleCommand(
  event: APIGatewayProxyEvent,
  apiGatewayManagementApi: ApiGatewayManagementApiClient,
  connectionId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return { statusCode: 400, body: 'Missing request body' };
  }
  
  // Parse command data
  const body = JSON.parse(event.body);
  
  // Extract command from various possible formats
  let command = body.command;
  if (!command && body.event) command = body.event;  // Handle if sent as 'event' instead of 'command'
  
  const homeId = body.homeId || '720frontrd';
  const commandId = body.commandId || body.id || uuidv4(); // Use existing commandId or id if provided
  
  console.log(`Processing command: ${command} for home ${homeId} with ID ${commandId}`);
  
  if (!command) {
    await sendToConnection(apiGatewayManagementApi, connectionId, {
      type: 'error',
      message: 'Command is required',
    });
    return { statusCode: 400, body: 'Command is required' };
  }
  
  try {
    // First, immediately acknowledge receipt of command to the sender
    await sendToConnection(apiGatewayManagementApi, connectionId, {
      type: 'command_sent',
      commandId,
      message: `Command ${command} received and being processed`,
      timestamp: new Date().toISOString(),
    });

    // Normalize command names to match what casa-main expects
    // Be more thorough with command normalization
    let normalizedCommand = command;
    
    // Normalize case-insensitive matches for better reliability
    const commandLower = command.toLowerCase();
    if (commandLower === 'stay' || commandLower === 'arm stay' || commandLower === 'armstay') {
      normalizedCommand = 'Arm Stay';
    }
    else if (commandLower === 'away' || commandLower === 'arm away' || commandLower === 'armaway') {
      normalizedCommand = 'Arm Away';
    }
    else if (commandLower === 'disarm' || commandLower === 'off') {
      normalizedCommand = 'Disarm';
    }
    else if (commandLower.includes('system') && commandLower.includes('state')) {
      normalizedCommand = 'GetSystemState';
    }
    
    console.log(`Normalized command "${command}" to "${normalizedCommand}"`);
    
    // Use the function to target casa-main instances
    const sent = await sendCommandToCasaMain(normalizedCommand, commandId, homeId);
    
    if (!sent) {
      console.log(`No casa-main instances found for home ${homeId}`);
      // Send failure message back to client
      await sendToConnection(apiGatewayManagementApi, connectionId, {
        type: 'command_ack',
        commandId,
        success: false,
        error: 'No home controller found',
        timestamp: new Date().toISOString(),
      });
    }
    
    // Return success since we've already handled the acknowledgment
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: sent ? 'Command sent to home controller' : 'No home controller found', 
        commandId 
      }),
    };
  } catch (error) {
    console.error('Error handling command:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error processing command' }),
    };
  }
}

/**
 * Handle default route for message broadcasting and event logging
 */
async function handleDefaultRoute(
  event: APIGatewayProxyEvent,
  apiGatewayManagementApi: ApiGatewayManagementApiClient,
  connectionId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return { statusCode: 400, body: 'Invalid request body' };
  }
  
  // Parse the message
  const body = JSON.parse(event.body);
  
  // Check if this is actually a command sent on the wrong route
  if (body.command && typeof body.command === 'string') {
    console.log('Detected command in default route, handling as command', body);
    return await handleCommand(event, apiGatewayManagementApi, connectionId);
  }
  
  // Handle command acknowledgments from casa-main
  if (body.type === 'command_ack') {
    console.log(`Received command_ack for commandId: ${body.commandId}, checking if broadcast needed`);
    
    // Always broadcast non-GetSystemState acknowledgments to all clients
    if (!body.command || body.command !== 'GetSystemState') {
      try {
        // Forward the acknowledgment to all connections except the one that sent it
        const connections = await dynamoDBClient.send(new ScanCommand({
          TableName: connectionsTableName,
          FilterExpression: 'connectionId <> :connId AND (instanceType = :clientType OR attribute_not_exists(instanceType))',
          ExpressionAttributeValues: {
            ':connId': connectionId,
            ':clientType': 'client'
          }
        }));
        
        console.log(`Broadcasting ack to ${connections.Items?.length || 0} connections`);
        
        if (connections.Items && connections.Items.length > 0) {
          const results = await Promise.allSettled(
            connections.Items.map(async (conn) => {
              try {
                const connId = conn.connectionId;
                
                // Use a more reliable way to determine the endpoint
                let connEndpoint;
                if (conn.endpoint) {
                  connEndpoint = conn.endpoint;
                } else if (conn.domainName && conn.stage) {
                  connEndpoint = `https://${conn.domainName}/${conn.stage}`;
                } else {
                  // Use default endpoint as last resort
                  connEndpoint = process.env.API_GATEWAY_ENDPOINT || 
                               'https://w42qpgs203.execute-api.us-east-1.amazonaws.com/prod';
                }
                
                // Skip if endpoint is still undefined or malformed
                if (!connEndpoint || connEndpoint.includes('undefined')) {
                  console.error(`Invalid endpoint for connection ${connId}: ${connEndpoint}`);
                  return false;
                }
                
                // Ensure command type is set in acknowledgment
                const ackMessage = {
                  ...body,
                  command: body.command || (body.state === 'Arm Stay' ? 'Arm Stay' :
                                         body.state === 'Arm Away' ? 'Arm Away' :
                                         body.state === 'Disarm' ? 'Disarm' : undefined)
                };
                
                console.log(`Forwarding command_ack to connection: ${connId} using endpoint ${connEndpoint}`);
                
                // Reuse API Gateway client if possible
                let connGateway = apiGatewayClients.get(connEndpoint);
                if (!connGateway) {
                  connGateway = new ApiGatewayManagementApiClient({
                    endpoint: connEndpoint,
                    region,
                  });
                  apiGatewayClients.set(connEndpoint, connGateway);
                }
                
                await connGateway.send(
                  new PostToConnectionCommand({
                    ConnectionId: connId,
                    Data: Buffer.from(JSON.stringify(ackMessage)),
                  })
                );
                
                console.log(`Successfully sent ack to connection: ${connId}`);
                return true;
              } catch (error: any) {
                if (error.code === 'GoneException' || 
                    (error.$metadata && error.$metadata.httpStatusCode === 410)) {
                  console.log(`Connection ${conn.connectionId} is gone, removing from connections table`);
                  await cleanupStaleConnection(conn.connectionId);
                } else {
                  console.error(`Error forwarding ack to ${conn.connectionId}:`, error);
                }
                return false;
              }
            })
          );
          
          const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
          console.log(`Successfully sent ack to ${successCount}/${connections.Items.length} connections`);
        } else {
          console.log('No client connections to forward ack to');
        }
        
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Acknowledgment forwarded' }),
        };
      } catch (error) {
        console.error('Error broadcasting acknowledgment:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Error forwarding acknowledgment' }),
        };
      }
    }
    
    // For GetSystemState acknowledgments, only send back to the original requestor
    console.log('GetSystemState response - sending only to originator');
    try {
      await sendToConnection(apiGatewayManagementApi, connectionId, body);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'GetSystemState acknowledgment sent to originator' }),
      };
    } catch (error) {
      console.error('Error sending GetSystemState response:', error);
      return {
        statusCode: 500,
        body: 'Error sending GetSystemState response',
      };
    }
  }
  
  // Handle system state updates from casa-main
  if (body.type === 'system_state') {
    // Forward system state to all clients
    const connections = await dynamoDBClient.send(new ScanCommand({
      TableName: connectionsTableName,
      FilterExpression: 'connectionId <> :connId',
      ExpressionAttributeValues: {
        ':connId': connectionId,
      },
    }));
    
    if (connections.Items && connections.Items.length > 0) {
      await Promise.allSettled(
        connections.Items.map((conn) => {
          try {
            const connId = conn.connectionId;
            const connEndpoint = conn.endpoint;
            
            // Skip invalid connections or missing body
            if (!connId || !connEndpoint || !event.body) {
              return Promise.resolve();
            }
            
            // Reuse API Gateway client if possible
            let connGateway = apiGatewayClients.get(connEndpoint);
            if (!connGateway) {
              connGateway = new ApiGatewayManagementApiClient({
                endpoint: connEndpoint,
                region,
              });
              apiGatewayClients.set(connEndpoint, connGateway);
            }
            
            // Forward the event to other clients
            return connGateway.send(
              new PostToConnectionCommand({
                ConnectionId: connId,
                Data: Buffer.from(event.body || ''),
              })
            );
          } catch (error) {
            console.error(`Error sending system state to connection ${conn.connectionId}:`, error);
            return Promise.resolve();
          }
        })
      );
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'System state forwarded' }),
    };
  }
  
  // Handle pong responses from casa-main
  if (body.event === 'pong') {
    // Update alarm state table to indicate this home is connected
    try {
      const homeId = body.homeId || '720frontrd';
      const systemState = body.systemState;
      const instanceId = body.instanceId;
      
      if (homeId && instanceId) {
        await dynamoDBClient.send(new PutCommand({
          TableName: alarmStateTableName,
          Item: {
            id: homeId,
            connected: true,
            lastUpdated: new Date().toISOString(),
            mode: systemState || 'unknown',
            instanceId
          },
        }));
        
        console.log(`Updated connection status for home ${homeId}`);
      }
    } catch (updateError) {
      console.error('Error updating connection status:', updateError);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Pong received' }),
    };
  }
  
  // Log event if it has the right structure
  if (body.id && body.event && body.timestamp) {
    try {
      // Skip logging ping events
      if (body.event.includes('client_ping') || body.event.includes('ping')) {
        console.log('Skipping ping event logging:', body.event);
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Ping event skipped' }),
        };
      }

      // Check for duplicate events - particularly system mode changes
      if (body.event && body.event.includes('System mode changed')) {
        console.log('Checking for duplicate system mode change event:', body.event);

        // Look for recent identical events in the past 30 seconds
        try {
          // Use a 30-second time window for duplicate detection
          const currentTime = new Date();
          const timeWindowDate = new Date(currentTime.getTime() - 30000); // 30 seconds ago
          const timeWindowStr = timeWindowDate.toISOString();
          
          const homeId = body.homeId || '720frontrd';
          
          // Query the table using the GSI
          const recentEvents = await dynamoDBClient.send(new QueryCommand({
            TableName: logTableName,
            IndexName: 'HomeIdIndex',
            KeyConditionExpression: 'homeId = :homeId AND #ts >= :timestamp',
            ExpressionAttributeNames: {
              '#ts': 'timestamp'
            },
            ExpressionAttributeValues: {
              ':homeId': homeId,
              ':timestamp': timeWindowStr
            },
            ScanIndexForward: false,
            Limit: 5 // Just need to check a few recent events
          }));
          
          // Check if there are matching events
          if (recentEvents.Items && recentEvents.Items.length > 0) {
            for (const item of recentEvents.Items) {
              if (item.event === body.event) {
                // Found a duplicate, skip logging
                console.log(`Skipping duplicate event: ${body.event}, found matching event from ${item.timestamp}`);
                return {
                  statusCode: 200,
                  body: JSON.stringify({ message: 'Duplicate event skipped' })
                };
              }
            }
          }
        } catch (error) {
          console.error('Error checking for duplicate events:', error);
          // Continue with the insertion if duplicate check fails
        }
      }

      // Check for duplicate event ID - most reliable way to prevent duplicates
      try {
        const existingEvent = await dynamoDBClient.send(new GetCommand({
          TableName: logTableName,
          Key: { id: body.id }
        }));
        
        if (existingEvent.Item) {
          console.log(`Skipping duplicate event with ID: ${body.id}`);
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Duplicate event ID skipped' })
          };
        }
      } catch (error) {
        console.error('Error checking for existing event ID:', error);
        // Continue with insertion if ID check fails
      }

      // Store in DynamoDB
      await dynamoDBClient.send(new PutCommand({
        TableName: logTableName,
        Item: {
          id: body.id,
          event: body.event,
          timestamp: body.timestamp,
          ttl: body.ttl || Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days from now
          homeId: body.homeId || '720frontrd',
        },
      }));
      
      // Broadcast to connected clients
      const connections = await dynamoDBClient.send(new ScanCommand({
        TableName: connectionsTableName,
        FilterExpression: 'connectionId <> :connectionId',
        ExpressionAttributeValues: {
          ':connectionId': connectionId,
        },
      }));
      
      if (connections.Items && connections.Items.length > 0) {
        await Promise.allSettled(
          connections.Items.map((conn) => {
            try {
              const connId = conn.connectionId;
              const connEndpoint = conn.endpoint;
              
              // Skip invalid connections or missing body
              if (!connId || !connEndpoint || !event.body) {
                return Promise.resolve();
              }
              
              // Reuse API Gateway client if possible
              let connGateway = apiGatewayClients.get(connEndpoint);
              if (!connGateway) {
                connGateway = new ApiGatewayManagementApiClient({
                  endpoint: connEndpoint,
                  region,
                });
                apiGatewayClients.set(connEndpoint, connGateway);
              }
              
              // Forward the event to connected clients
              return connGateway.send(
                new PostToConnectionCommand({
                  ConnectionId: connId,
                  Data: Buffer.from(event.body || ''),
                })
              );
            } catch (error) {
              console.error(`Error broadcasting event to ${conn.connectionId}:`, error);
              return Promise.resolve();
            }
          })
        );
      }
    } catch (dbError) {
      console.error('Error logging event to DynamoDB:', dbError);
      return { statusCode: 500, body: 'Error logging event' };
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Message processed' }),
  };
}

/**
 * Send a message to a specific connection
 */
async function sendToConnection(
  apiGatewayManagementApi: ApiGatewayManagementApiClient,
  connectionId: string,
  message: any
): Promise<void> {
  try {
    await apiGatewayManagementApi.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      })
    );
  } catch (error: unknown) {
    console.error(`Error sending message to connection ${connectionId}:`, error);
    
    // Delete connection if it's gone (410 error)
    if (isGoneException(error)) {
      await cleanupStaleConnection(connectionId);
    }
    
    throw error;
  }
}

/**
 * Send command to casa-main instances
 */
async function sendCommandToCasaMain(
  command: string,
  commandId: string,
  homeId: string
): Promise<boolean> {
  try {
    // Get active connections
    const connections = await dynamoDBClient.send(new ScanCommand({
      TableName: connectionsTableName,
    }));
    
    if (!connections.Items || connections.Items.length === 0) {
      console.log('No WebSocket connections available');
      return false;
    }
    
    console.log(`Looking for casa-main instance for home ${homeId} among ${connections.Items.length} connections`);
    
    // Look for casa-main instances first, with better filtering
    const casaMainConnections = connections.Items.filter(conn => 
      // Match by instance type AND homeId if both are present
      (conn.instanceType === 'casa-main' && (conn.homeId === homeId || !conn.homeId)) ||
      // Otherwise, look for connections with matching homeId but without instanceType
      (!conn.instanceType && conn.homeId === homeId) ||
      // Finally, include connections with instanceId but without specific type
      (!conn.instanceType && conn.instanceId)
    );
    
    // Fallback to all connections if no casa-main found
    const targetConnections = casaMainConnections.length > 0 
      ? casaMainConnections 
      : connections.Items;
    
    console.log(`Found ${casaMainConnections.length} casa-main instances, sending command to ${targetConnections.length} connections`);
    
    // Format the command message exactly as casa-main expects
    const commandMessage = {
      command,
      commandId,
      homeId,
      timestamp: new Date().toISOString(),
    };

    console.log(`Sending command message: ${JSON.stringify(commandMessage)}`);
  
    // Send to all potential casa-main instances
    let sentCount = 0;
    await Promise.allSettled(
      targetConnections.map(async (conn) => {
        try {
          const connId = conn.connectionId;
          
          // More reliable endpoint determination
          let connEndpoint;
          if (conn.endpoint) {
            connEndpoint = conn.endpoint;
          } else if (conn.domainName && conn.stage) {
            connEndpoint = `https://${conn.domainName}/${conn.stage}`;
          } else {
            // Use default endpoint as last resort
            connEndpoint = process.env.API_GATEWAY_ENDPOINT || 
                          'https://w42qpgs203.execute-api.us-east-1.amazonaws.com/prod';
          }
          
          // Skip if endpoint is invalid
          if (!connEndpoint || connEndpoint.includes('undefined')) {
            console.error(`Invalid endpoint for connection ${connId}: ${connEndpoint}`);
            return;
          }
          
          console.log(`Sending command to connection: ${connId} using endpoint ${connEndpoint}`);
          
          // Reuse API Gateway client if possible
          let connGateway = apiGatewayClients.get(connEndpoint);
          if (!connGateway) {
            connGateway = new ApiGatewayManagementApiClient({
              endpoint: connEndpoint,
              region,
            });
            apiGatewayClients.set(connEndpoint, connGateway);
          }
          
          await connGateway.send(
            new PostToConnectionCommand({
              ConnectionId: connId,
              Data: Buffer.from(JSON.stringify(commandMessage)),
            })
          );
          
          console.log(`Command sent to connection: ${connId}`);
          sentCount++;
        } catch (error: any) {
          if (error.code === 'GoneException' || 
              (error.$metadata && error.$metadata.httpStatusCode === 410)) {
            console.log(`Connection ${conn.connectionId} is gone, removing from connections table`);
            await cleanupStaleConnection(conn.connectionId);
          } else {
            console.error(`Error sending command to connection ${conn.connectionId}:`, error);
          }
        }
      })
    );
    
    return sentCount > 0;
  } catch (error) {
    console.error('Error in sendCommandToCasaMain:', error);
    return false;
  }
}
