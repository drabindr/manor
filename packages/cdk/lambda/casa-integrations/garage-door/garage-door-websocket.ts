import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const textEncoder = new TextEncoder();

const CONNECTIONS_TABLE = process.env.CONN_TABLE_NAME!;

// Note: We removed DEVICES_TABLE - device state is managed by ESP8266 directly
// Only connection tracking is persisted in DynamoDB

// In-memory maps for device state during lambda instance lifetime
// These are lost on cold starts but will be rebuilt as devices reconnect
const activeConnections = new Map<string, {
  connectionType: 'frontend' | 'device' | 'unknown';
  deviceId?: string;
  lastSeen: number;
}>();

// Map deviceId to connectionId for quick lookups
const deviceConnections = new Map<string, string>();

// COST OPTIMIZATION: Add connection state cache with TTL to reduce DynamoDB scans
const connectionStateCache = new Map<string, {
  deviceId: string;
  lastSeen: number;
  cached: number;
}>();

const CACHE_TTL = 60000; // 1 minute cache TTL

// Function to rebuild in-memory state from DynamoDB and validate connections
async function rebuildInMemoryState(apiGwClient?: ApiGatewayManagementApiClient): Promise<void> {
  try {
    console.log("🔄 Rebuilding in-memory state from DynamoDB...");
    
    // COST OPTIMIZATION: Use more targeted query instead of full table scan when possible
    const scanResult = await dynamoDBClient.send(
      new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        // Only get active connections from last 30 minutes to reduce scan size
        FilterExpression: 'lastSeen > :minTime',
        ExpressionAttributeValues: {
          ':minTime': Date.now() - 1800000, // 30 minutes ago (more generous for device connections)
        },
      })
    );

    const validConnections: string[] = [];
    const staleConnections: string[] = [];

    if (scanResult.Items) {
      for (const item of scanResult.Items) {
        const connectionId = item.connectionId;
        const connectionType = item.connectionType;
        const deviceId = item.deviceId;
        const lastSeen = item.lastSeen || Date.now();

        // Validate connection is still alive if we have API Gateway client
        let isConnectionAlive = true;
        if (apiGwClient) {
          try {
            // Try to send a ping to validate the connection
            await apiGwClient.send(
              new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: textEncoder.encode(JSON.stringify({ type: 'ping', timestamp: Date.now() })),
              })
            );
            validConnections.push(connectionId);
            console.log(`✅ Validated connection: ${connectionId} (${connectionType})`);
          } catch (error: any) {
            // Connection is stale, mark for cleanup
            isConnectionAlive = false;
            staleConnections.push(connectionId);
            console.log(`❌ Stale connection detected: ${connectionId} (${connectionType}) - ${error.message}`);
          }
        }

        if (isConnectionAlive) {
          // Add to in-memory maps
          activeConnections.set(connectionId, {
            connectionType: connectionType as 'frontend' | 'device' | 'unknown',
            deviceId: deviceId,
            lastSeen: lastSeen,
          });

          // If it's a device, also add to device connections map
          if (connectionType === 'device' && deviceId) {
            deviceConnections.set(deviceId, connectionId);
            console.log(`✅ Rebuilt device connection: ${deviceId} -> ${connectionId}`);
          }
        }
      }

      // Clean up stale connections from DynamoDB
      for (const staleConnectionId of staleConnections) {
        try {
          await dynamoDBClient.send(
            new DeleteCommand({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId: staleConnectionId },
            })
          );
          console.log(`🗑️ Cleaned up stale connection: ${staleConnectionId}`);
        } catch (error) {
          console.error(`Error cleaning up stale connection ${staleConnectionId}:`, error);
        }
      }

      console.log(`✅ Rebuilt in-memory state with ${validConnections.length} valid connections, cleaned up ${staleConnections.length} stale connections`);
    }
  } catch (error) {
    console.error("❌ Error rebuilding in-memory state:", error);
  }
}

interface WebSocketConnection {
  connectionId: string;
  connectionType: 'frontend' | 'device' | 'unknown';
  deviceId?: string;
  lastSeen: number;
}

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  console.log("Received event:", JSON.stringify(event, null, 2));
  
  const requestContext = event.requestContext;
  const connectionId = requestContext.connectionId;
  const domainName = requestContext.domainName;
  const stage = requestContext.stage;

  const apiGwClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });

  try {
    // Handle WebSocket connections
    if (requestContext.routeKey === "$connect") {
      return await handleConnect(connectionId);
    }
    
    // Handle WebSocket disconnections
    else if (requestContext.routeKey === "$disconnect") {
      return await handleDisconnect(connectionId);
    }
    
    // Handle WebSocket messages
    else if (requestContext.routeKey === "$default") {
      return await handleMessage(event, apiGwClient);
    }

    return { statusCode: 400, body: "Invalid route." };

  } catch (error) {
    console.error("Error handling WebSocket event:", error);
    return { statusCode: 500, body: "Internal server error." };
  }
};

async function handleConnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  // Store connection in DynamoDB for persistence across Lambda invocations
  await dynamoDBClient.send(
    new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: {
        connectionId,
        connectionType: 'unknown', // Will be updated when we receive the first message
        lastSeen: Date.now(),
      },
    })
  );

  // Also store in memory for quick lookups during this Lambda's lifetime
  activeConnections.set(connectionId, {
    connectionType: 'unknown',
    lastSeen: Date.now(),
  });
  
  console.log(`Connection ID ${connectionId} added to the table and memory.`);
  return { statusCode: 200, body: "Connected." };
}

async function handleDisconnect(connectionId: string): Promise<APIGatewayProxyResultV2> {
  // Check if this was a device connection to log it
  const connectionResult = await dynamoDBClient.send(
    new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    })
  );

  // Also check in-memory cache
  const connection = activeConnections.get(connectionId);

  if (connectionResult.Item?.connectionType === 'device' && connectionResult.Item?.deviceId) {
    // Remove device connection mapping
    deviceConnections.delete(connectionResult.Item.deviceId);
    console.log(`Device ${connectionResult.Item.deviceId} disconnected`);
  } else if (connection?.connectionType === 'device' && connection.deviceId) {
    // Remove device connection mapping from in-memory cache too
    deviceConnections.delete(connection.deviceId);
    console.log(`Device ${connection.deviceId} disconnected (from memory)`);
  }

  // Remove connection from table
  await dynamoDBClient.send(
    new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    })
  );
  
  // Also remove from in-memory cache
  activeConnections.delete(connectionId);
  
  console.log(`Connection ID ${connectionId} removed from the table and memory.`);
  return { statusCode: 200, body: "Disconnected." };
}

async function handleMessage(
  event: APIGatewayProxyWebsocketEventV2,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || "{}");
  const messageType = body.type;

  console.log(`Received message type: ${messageType} from connection ${connectionId}`);

  switch (messageType) {
    case 'device_register':
      return await handleDeviceRegister(connectionId, body, apiGwClient);
    
    case 'device_heartbeat':
      return await handleDeviceHeartbeat(connectionId, body, apiGwClient);
    
    case 'frontend_register':
      return await handleFrontendRegister(connectionId, body);
    
    case 'frontend_command':
    case 'device_command':
      return await handleFrontendCommand(connectionId, body, apiGwClient);
    
    case 'frontend_status_request':
    case 'device_status_request':
      return await handleFrontendStatusRequest(connectionId, body, apiGwClient);
    
    case 'ping':
      return await handlePing(connectionId, apiGwClient);
    
    case 'health_check':
      return await handleHealthCheck(connectionId, body, apiGwClient);
    
    default:
      console.log(`Unknown message type: ${messageType}`);
      return { statusCode: 400, body: "Unknown message type." };
  }
}

async function handleDeviceRegister(
  connectionId: string,
  body: any,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  const deviceId = body.deviceId;
  const doorStatus = body.doorStatus || 'unknown';
  
  // Update connection as device type in DynamoDB
  await dynamoDBClient.send(
    new UpdateCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
      UpdateExpression: 'SET connectionType = :type, deviceId = :deviceId, lastSeen = :lastSeen',
      ExpressionAttributeValues: {
        ':type': 'device',
        ':deviceId': deviceId,
        ':lastSeen': Date.now(),
      },
    })
  );

  // Also update in-memory maps
  activeConnections.set(connectionId, {
    connectionType: 'device',
    deviceId: deviceId,
    lastSeen: Date.now(),
  });

  // Map device to connection for easy lookup
  deviceConnections.set(deviceId, connectionId);

  // Send confirmation to device
  await sendToConnection(apiGwClient, connectionId, {
    type: 'device_register_response',
    status: 'success',
    message: 'Device registered successfully',
  });

  console.log(`Device ${deviceId} registered with connection ${connectionId}`);
  return { statusCode: 200, body: "Device registered." };
}

async function handleDeviceHeartbeat(
  connectionId: string,
  body: any,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  const deviceId = body.deviceId;
  const doorStatus = body.doorStatus;
  
  // Update connection last seen time
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.lastSeen = Date.now();
  }

  // Broadcast status to all frontend connections
  await broadcastToFrontendConnections(apiGwClient, {
    type: 'device_status_update',
    deviceId,
    doorStatus,
    timestamp: Date.now(),
    isOnline: true,
  }, deviceId);

  console.log(`Heartbeat received from device ${deviceId}: ${doorStatus}`);
  return { statusCode: 200, body: "Heartbeat received." };
}

async function handleFrontendRegister(
  connectionId: string,
  body: any
): Promise<APIGatewayProxyResultV2> {
  // Update connection as frontend type in DynamoDB
  await dynamoDBClient.send(
    new UpdateCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
      UpdateExpression: 'SET connectionType = :type, lastSeen = :lastSeen',
      ExpressionAttributeValues: {
        ':type': 'frontend',
        ':lastSeen': Date.now(),
      },
    })
  );

  // Also update in-memory map
  activeConnections.set(connectionId, {
    connectionType: 'frontend',
    lastSeen: Date.now(),
  });

  console.log(`Frontend registered with connection ${connectionId}`);
  return { statusCode: 200, body: "Frontend registered." };
}

async function handleFrontendCommand(
  connectionId: string,
  body: any,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  const deviceId = body.deviceId;
  const command = body.command; // 'open', 'close', 'toggle'
  
  console.log(`🎮 Frontend command: ${command} for device: ${deviceId}`);
  
  // Get device connection from memory
  let deviceConnectionId = deviceConnections.get(deviceId);
  let isOnline = deviceConnectionId && activeConnections.has(deviceConnectionId);

  // If not found in memory, try rebuilding state from DynamoDB with validation
  if (!isOnline) {
    console.log(`Device ${deviceId} not found in memory, rebuilding state from DynamoDB with validation...`);
    await rebuildInMemoryState(apiGwClient);
    deviceConnectionId = deviceConnections.get(deviceId);
    isOnline = deviceConnectionId && activeConnections.has(deviceConnectionId);
  }

  if (!isOnline) {
    console.log(`❌ Device ${deviceId} is offline or not connected`);
    // Send error response to frontend
    await sendToConnection(apiGwClient, connectionId, {
      type: 'command_response',
      status: 'error',
      deviceId,
      message: 'Device is offline or not connected. Please check device connection and try again.',
    });
    return { statusCode: 200, body: "Device offline." };
  }

  console.log(`✅ Sending command ${command} to device ${deviceId} via connection ${deviceConnectionId}`);
  
  // Send command to device
  try {
    await sendToConnection(apiGwClient, deviceConnectionId!, {
      type: 'device_command',
      command,
      timestamp: Date.now(),
    });

    // Send confirmation to frontend
    await sendToConnection(apiGwClient, connectionId, {
      type: 'command_response',
      status: 'success',
      deviceId,
      message: `Command ${command} sent to device successfully`,
    });

    console.log(`✅ Command ${command} sent to device ${deviceId}`);
    return { statusCode: 200, body: "Command sent." };
  } catch (error: any) {
    console.error(`❌ Error sending command to device ${deviceId}:`, error);
    
    // Device connection might be stale, remove it
    if (deviceConnectionId) {
      activeConnections.delete(deviceConnectionId);
      deviceConnections.delete(deviceId);
      console.log(`🗑️ Removed stale device connection: ${deviceId}`);
    }
    
    await sendToConnection(apiGwClient, connectionId, {
      type: 'command_response',
      status: 'error',
      deviceId,
      message: 'Failed to send command to device. Device may have disconnected.',
    });
    
    return { statusCode: 200, body: "Command failed." };
  }
}

async function handleFrontendStatusRequest(
  connectionId: string,
  body: any,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  const deviceId = body.deviceId;
  
  console.log(`📊 Status request for device: ${deviceId}`);
  
  // Get device connection from memory
  let deviceConnectionId = deviceConnections.get(deviceId);
  let isOnline = deviceConnectionId && activeConnections.has(deviceConnectionId);

  // If not found in memory, try rebuilding state from DynamoDB with validation
  if (!isOnline) {
    console.log(`Device ${deviceId} not found in memory, rebuilding state from DynamoDB with validation...`);
    await rebuildInMemoryState(apiGwClient);
    deviceConnectionId = deviceConnections.get(deviceId);
    isOnline = deviceConnectionId && activeConnections.has(deviceConnectionId);
  }

  if (!isOnline) {
    console.log(`❌ Device ${deviceId} not found or offline`);
    await sendToConnection(apiGwClient, connectionId, {
      type: 'status_response',
      status: 'error',
      deviceId,
      message: 'Device not found or offline',
      isOnline: false,
    });
    return { statusCode: 200, body: "Device not found." };
  }

  console.log(`✅ Requesting status from device ${deviceId} via connection ${deviceConnectionId}`);
  
  // Request current status from device
  try {
    await sendToConnection(apiGwClient, deviceConnectionId!, {
      type: 'device_status_request',
      timestamp: Date.now(),
    });

    // Send response indicating status request was sent
    await sendToConnection(apiGwClient, connectionId, {
      type: 'status_response',
      status: 'success',
      deviceId,
      message: 'Status request sent to device',
      isOnline: true,
      timestamp: Date.now(),
    });

    console.log(`✅ Status requested for device ${deviceId}`);
    return { statusCode: 200, body: "Status request processed." };
  } catch (error: any) {
    console.error(`❌ Error requesting status from device ${deviceId}:`, error);
    
    // Device connection might be stale, remove it
    if (deviceConnectionId) {
      activeConnections.delete(deviceConnectionId);
      deviceConnections.delete(deviceId);
      console.log(`🗑️ Removed stale device connection: ${deviceId}`);
    }
    
    await sendToConnection(apiGwClient, connectionId, {
      type: 'status_response',
      status: 'error',
      deviceId,
      message: 'Failed to request status from device. Device may have disconnected.',
      isOnline: false,
    });
    
    return { statusCode: 200, body: "Status request failed." };
  }
}

async function handlePing(
  connectionId: string,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  // Update connection last seen time if it exists in our tracking
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.lastSeen = Date.now();
  }

  // Send pong response
  await sendToConnection(apiGwClient, connectionId, {
    type: 'pong',
    timestamp: Date.now(),
  });

  console.log(`Ping received from connection ${connectionId}, responded with pong`);
  return { statusCode: 200, body: "Pong sent." };
}

async function handleHealthCheck(
  connectionId: string,
  body: any,
  apiGwClient: ApiGatewayManagementApiClient
): Promise<APIGatewayProxyResultV2> {
  const deviceId = body.deviceId;
  
  console.log(`🏥 Health check received from device ${deviceId} (${connectionId})`);
  
  // Check if we have this device in our in-memory state
  const registeredConnectionId = deviceConnections.get(deviceId);
  const isRegistered = registeredConnectionId === connectionId;
  
  // Update connection last seen time
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.lastSeen = Date.now();
  }

  // Send health check response with registration status
  await sendToConnection(apiGwClient, connectionId, {
    type: 'health_check_response',
    isRegistered: isRegistered,
    timestamp: Date.now(),
    message: isRegistered ? 'Device registered and healthy' : 'Device needs re-registration'
  });

  console.log(`🏥 Health check response sent to ${deviceId}: ${isRegistered ? 'healthy' : 'needs re-registration'}`);
  return { statusCode: 200, body: "Health check processed." };
}

// COST OPTIMIZATION: Only broadcast to subscribed frontends, not all connections
const subscribedFrontends = new Map<string, Set<string>>(); // deviceId -> Set of frontend connectionIds

async function broadcastToFrontendConnections(
  apiGwClient: ApiGatewayManagementApiClient,
  message: any,
  targetDeviceId?: string // OPTIMIZATION: Only send to frontends interested in this device
): Promise<void> {
  let frontendConnections: Set<string>;
  
  if (targetDeviceId && subscribedFrontends.has(targetDeviceId)) {
    // COST OPTIMIZATION: Only send to frontends that subscribed to this specific device
    frontendConnections = subscribedFrontends.get(targetDeviceId)!;
  } else {
    // Fallback: Get all frontend connections from DynamoDB for persistence
    const scanResult = await dynamoDBClient.send(
      new ScanCommand({
        TableName: CONNECTIONS_TABLE,
        FilterExpression: 'connectionType = :type AND lastSeen > :minTime',
        ExpressionAttributeValues: {
          ':type': 'frontend',
          ':minTime': Date.now() - 300000, // Only active frontends from last 5 minutes
        },
      })
    );

    // Combine with any in-memory connections
    const inMemoryConnections = Array.from(activeConnections.entries())
      .filter(([_, connection]) => connection.connectionType === 'frontend')
      .map(([connectionId, _]) => connectionId);

    // Create a Set to avoid duplicates
    frontendConnections = new Set([
      ...(scanResult.Items?.map(item => item.connectionId) || []),
      ...inMemoryConnections
    ]);
  }

  const sendPromises = Array.from(frontendConnections).map(async (connectionId) => {
    try {
      await sendToConnection(apiGwClient, connectionId, message);
    } catch (error) {
      console.error(`Failed to send to frontend connection ${connectionId}:`, error);
      // Remove stale connection
      activeConnections.delete(connectionId);
      
      // Remove from subscription list if it exists
      if (targetDeviceId && subscribedFrontends.has(targetDeviceId)) {
        subscribedFrontends.get(targetDeviceId)!.delete(connectionId);
      }
      
      try {
        await dynamoDBClient.send(
          new DeleteCommand({
            TableName: CONNECTIONS_TABLE,
            Key: { connectionId },
          })
        );
      } catch (dbError) {
        console.error(`Failed to delete stale connection from DynamoDB: ${connectionId}`, dbError);
      }
    }
  });

  await Promise.allSettled(sendPromises);
}

async function sendToConnection(
  apiGwClient: ApiGatewayManagementApiClient,
  connectionId: string,
  message: any
): Promise<void> {
  await apiGwClient.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: textEncoder.encode(JSON.stringify(message)),
    })
  );
}
