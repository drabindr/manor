// seam.ts - Seam smart lock integration provider

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'us-east-1' });

// Interface definitions
interface SeamDevice {
  device_id: string;
  device_type: string;
  display_name: string;
  properties: {
    locked?: boolean;
    online?: boolean;
    battery_level?: number;
    door_open?: boolean;
    model?: {
      display_name: string;
      manufacturer_display_name: string;
    };
  };
  capabilities_supported: string[];
  location?: {
    location_name?: string;
    timezone?: string;
  };
  workspace_id: string;
  created_at: string;
  is_managed: boolean;
}

interface SeamEvent {
  event_id: string;
  event_type: string;
  created_at: string;
  device_id?: string;
  occurred_at: string;
}

// Helper function to get Seam API key from AWS SSM
async function getSeamApiKey(): Promise<string> {
  try {
    const command = new GetParameterCommand({
      Name: '/casa-integrations/seam/api-key',
      WithDecryption: true,
    });
    const response = await ssmClient.send(command);
    
    if (!response.Parameter?.Value) {
      throw new Error('Seam API key not found in SSM Parameter Store');
    }
    
    return response.Parameter.Value;
  } catch (error) {
    console.error('Error retrieving Seam API key from SSM:', error);
    console.log('SSM Parameter Name:', '/casa-integrations/seam/api-key');
    throw new Error('Failed to retrieve Seam API key. Please ensure it is stored in SSM Parameter Store at /casa-integrations/seam/api-key');
  }
}

// Helper function to make API calls to Seam
async function makeSeamApiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
  const apiKey = await getSeamApiKey();
  const baseUrl = 'https://connect.getseam.com';
  
  const defaultHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Seam API error (${response.status}):`, errorText);
    throw new Error(`Seam API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * List all Seam devices (locks, keypads, etc.)
 */
export async function listDevices(): Promise<{ devices: SeamDevice[] }> {
  try {
    console.log('[Seam] Fetching device list...');
    const response = await makeSeamApiCall('/devices/list');
    
    console.log('[Seam] Device list response:', JSON.stringify(response, null, 2));
    
    return {
      devices: response.devices || []
    };
  } catch (error) {
    console.error('[Seam] Error listing devices:', error);
    throw error;
  }
}

/**
 * Get detailed information about a specific device
 */
export async function getDevice(deviceId: string): Promise<SeamDevice> {
  try {
    console.log(`[Seam] Fetching device details for: ${deviceId}`);
    const response = await makeSeamApiCall('/devices/get', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
      }),
    });
    
    console.log('[Seam] Device details response:', JSON.stringify(response, null, 2));
    
    return response.device;
  } catch (error) {
    console.error(`[Seam] Error getting device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Lock a device
 */
export async function lockDevice(deviceId: string): Promise<{ success: boolean; action_attempt_id?: string }> {
  try {
    console.log(`[Seam] Locking device: ${deviceId}`);
    const response = await makeSeamApiCall('/locks/lock_door', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
      }),
    });
    
    console.log('[Seam] Lock response:', JSON.stringify(response, null, 2));
    
    return {
      success: true,
      action_attempt_id: response.action_attempt?.action_attempt_id,
    };
  } catch (error) {
    console.error(`[Seam] Error locking device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Unlock a device
 */
export async function unlockDevice(deviceId: string): Promise<{ success: boolean; action_attempt_id?: string }> {
  try {
    console.log(`[Seam] Unlocking device: ${deviceId}`);
    const response = await makeSeamApiCall('/locks/unlock_door', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
      }),
    });
    
    console.log('[Seam] Unlock response:', JSON.stringify(response, null, 2));
    
    return {
      success: true,
      action_attempt_id: response.action_attempt?.action_attempt_id,
    };
  } catch (error) {
    console.error(`[Seam] Error unlocking device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Get access codes for a device (if supported)
 */
export async function getAccessCodes(deviceId: string): Promise<{ access_codes: any[] }> {
  try {
    console.log(`[Seam] Fetching access codes for device: ${deviceId}`);
    const response = await makeSeamApiCall('/access_codes/list', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
      }),
    });
    
    console.log('[Seam] Access codes response:', JSON.stringify(response, null, 2));
    
    return {
      access_codes: response.access_codes || []
    };
  } catch (error) {
    console.error(`[Seam] Error getting access codes for device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Create a new access code
 */
export async function createAccessCode(
  deviceId: string, 
  code: string, 
  name?: string
): Promise<{ success: boolean; access_code?: any }> {
  try {
    console.log(`[Seam] Creating access code for device: ${deviceId}`);
    const response = await makeSeamApiCall('/access_codes/create', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
        code: code,
        name: name || `Code ${code}`,
      }),
    });
    
    console.log('[Seam] Create access code response:', JSON.stringify(response, null, 2));
    
    return {
      success: true,
      access_code: response.access_code,
    };
  } catch (error) {
    console.error(`[Seam] Error creating access code for device ${deviceId}:`, error);
    throw error;
  }
}

/**
 * Delete an access code
 */
export async function deleteAccessCode(accessCodeId: string): Promise<{ success: boolean }> {
  try {
    console.log(`[Seam] Deleting access code: ${accessCodeId}`);
    await makeSeamApiCall('/access_codes/delete', {
      method: 'POST',
      body: JSON.stringify({
        access_code_id: accessCodeId,
      }),
    });
    
    console.log('[Seam] Access code deleted successfully');
    
    return {
      success: true,
    };
  } catch (error) {
    console.error(`[Seam] Error deleting access code ${accessCodeId}:`, error);
    throw error;
  }
}

/**
 * Get events for a device or all devices
 */
export async function getEvents(deviceId?: string, limit: number = 50, since?: string): Promise<{ events: SeamEvent[] }> {
  try {
    console.log(`[Seam] Fetching events${deviceId ? ` for device: ${deviceId}` : ' for all devices'}`);
    
    const requestBody: any = {
      limit: limit,
    };
    
    if (deviceId) {
      requestBody.device_id = deviceId;
    }
    
    if (since) {
      requestBody.since = since;
    }
    
    const response = await makeSeamApiCall('/events/list', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    
    console.log('[Seam] Events response:', JSON.stringify(response, null, 2));
    
    return {
      events: response.events || []
    };
  } catch (error) {
    console.error(`[Seam] Error getting events:`, error);
    throw error;
  }
}

/**
 * Check the status of an action attempt
 */
export async function getActionAttempt(actionAttemptId: string): Promise<any> {
  try {
    console.log(`[Seam] Checking action attempt status: ${actionAttemptId}`);
    const response = await makeSeamApiCall('/action_attempts/get', {
      method: 'POST',
      body: JSON.stringify({
        action_attempt_id: actionAttemptId,
      }),
    });
    
    console.log('[Seam] Action attempt response:', JSON.stringify(response, null, 2));
    
    return response.action_attempt;
  } catch (error) {
    console.error(`[Seam] Error getting action attempt ${actionAttemptId}:`, error);
    throw error;
  }
}
