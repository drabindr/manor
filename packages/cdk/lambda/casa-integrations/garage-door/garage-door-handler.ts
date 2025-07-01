import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Remove DynamoDB dependency - we'll communicate directly with device via WebSocket
// The device will maintain its own state and respond to direct queries

// Simplified interfaces - no database storage
interface ControlRequest {
  deviceId: string;
  command: 'open' | 'close' | 'toggle';
}

interface StatusRequest {
  deviceId: string;
}

// WebSocket API configuration for direct device communication
const WEBSOCKET_API_URL = process.env.WEBSOCKET_API_URL || 'wss://utekypghuf.execute-api.us-east-1.amazonaws.com/prod';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    const path = event.path;
    const method = event.httpMethod;

    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    // Control endpoint - relay command to device via WebSocket
    if (path.startsWith('/garage-door/control/') && method === 'POST') {
      return await handleDeviceControl(event, corsHeaders);
    }

    // Status endpoint - request fresh status from device
    if (path.startsWith('/garage-door/status/') && method === 'GET') {
      return await handleStatusCheck(event, corsHeaders);
    }

    // Heartbeat endpoint - lightweight acknowledgment (no storage)
    if (path.startsWith('/garage-door/heartbeat/') && method === 'POST') {
      return await handleHeartbeat(event, corsHeaders);
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function handleDeviceControl(event: APIGatewayProxyEvent, headers: any): Promise<APIGatewayProxyResult> {
  const pathParts = event.path.split('/');
  const deviceId = pathParts[3];
  const command = pathParts[4];

  if (!deviceId || !command) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'deviceId and command are required' })
    };
  }

  if (!['open', 'close', 'toggle'].includes(command)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid command. Use: open, close, or toggle' })
    };
  }

  // Send command directly to device via WebSocket (handled by WebSocket lambda)
  // This endpoint just acknowledges the command was received
  console.log(`Command ${command} received for device ${deviceId}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: `Command ${command} will be sent to device ${deviceId}`,
      status: 'command_queued',
      deviceId: deviceId,
      command: command,
      timestamp: new Date().toISOString(),
      note: 'Command will be processed via WebSocket connection'
    })
  };
}

async function handleStatusCheck(event: APIGatewayProxyEvent, headers: any): Promise<APIGatewayProxyResult> {
  const pathParts = event.path.split('/');
  const deviceId = pathParts[3];

  if (!deviceId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'deviceId is required' })
    };
  }

  // Request fresh status from device via WebSocket
  // For now, return a response that triggers frontend to request via WebSocket
  console.log(`Status request for device ${deviceId} - will be handled via WebSocket`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Status request queued',
      deviceId: deviceId,
      status: 'unknown', // Frontend should request fresh status via WebSocket
      timestamp: new Date().toISOString(),
      note: 'Fresh status will be provided via WebSocket connection'
    })
  };
}

async function handleHeartbeat(event: APIGatewayProxyEvent, headers: any): Promise<APIGatewayProxyResult> {
  const pathParts = event.path.split('/');
  const deviceId = pathParts[3];

  if (!deviceId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'deviceId is required' })
    };
  }

  // Simple heartbeat acknowledgment - no storage
  console.log(`Heartbeat received from device ${deviceId}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Heartbeat acknowledged',
      deviceId: deviceId,
      timestamp: new Date().toISOString()
    })
  };
}
