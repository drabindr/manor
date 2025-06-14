// Bhyve irrigation provider - Real API implementation
import { SSM } from '@aws-sdk/client-ssm';
import WebSocket from 'ws';
import axios from 'axios';

const ssm = new SSM({});

interface BhyveCredentials {
  email: string;
  password: string;
}

export interface BhyveZone {
  station: number;
  name: string;
  smart_watering_enabled?: boolean;
  sprinkler_type?: string;
  is_watering: boolean;
  watering_time: number;
  remaining_time?: number;
}

export interface BhyveDevice {
  id: string;
  name: string;
  mac_address?: string;
  type?: string;
  last_seen?: string;
  zones: BhyveZone[];
  rain_delay_expiration?: string;
  status?: {
    run_mode?: string;
    watering_status?: {
      current_station?: number;
      status: string;
      current_time_remaining_sec?: number;
      stations?: Array<{
        station: number;
        run_time: number;
      }>;
    };
    rain_delay?: {
      delay: number;
      weather_type: string;
    };
  };
}

export interface BhyveData {
  devices: BhyveDevice[];
}

interface WateringCommand {
  deviceId: string;
  station: number;
  duration: number; // minutes
}

class BhyveWebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private deviceId: string | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  async connect(token: string, deviceId: string): Promise<void> {
    this.token = token;
    this.deviceId = deviceId;
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://api.orbitbhyve.com/v1/events');
      
      this.ws.on('open', () => {
        console.log('[Bhyve WebSocket] Connected');
        
        // Send connection message
        this.send({
          event: 'app_connection',
          orbit_session_token: token,
          subscribe_device_id: deviceId
        });

        // Start ping interval (every 25 seconds)
        this.pingInterval = setInterval(() => {
          this.send({ event: 'ping' });
        }, 25000);

        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('[Bhyve WebSocket] Error:', error);
        reject(error);
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('[Bhyve WebSocket] Message:', message);
        } catch (error) {
          console.error('[Bhyve WebSocket] Parse error:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('[Bhyve WebSocket] Closed');
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
      });
    });
  }

  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log('[Bhyve WebSocket] Sent:', message);
    } else {
      console.error('[Bhyve WebSocket] Not connected');
    }
  }

  async startWatering(station: number, minutes: number): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device ID not set');
    }

    const command = {
      event: 'change_mode',
      mode: 'manual',
      device_id: this.deviceId,
      timestamp: new Date().toISOString(),
      stations: [{
        station: station,
        run_time: minutes
      }]
    };

    this.send(command);
  }

  async stopWatering(): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device ID not set');
    }

    const command = {
      event: 'change_mode',
      mode: 'manual',
      device_id: this.deviceId,
      timestamp: new Date().toISOString(),
      stations: []
    };

    this.send(command);
  }

  async setRainDelay(hours: number): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Device ID not set');
    }

    const command = {
      event: 'rain_delay',
      device_id: this.deviceId,
      delay: hours
    };

    this.send(command);
  }

  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

let wsClient: BhyveWebSocketClient | null = null;

async function getBhyveCredentials(): Promise<BhyveCredentials> {
  try {
    const [emailParam, passwordParam] = await Promise.all([
      ssm.getParameter({ Name: '/bhyve/email' }),
      ssm.getParameter({ Name: '/bhyve/password', WithDecryption: true })
    ]);

    if (!emailParam.Parameter?.Value || !passwordParam.Parameter?.Value) {
      throw new Error('Bhyve credentials not found in SSM');
    }

    return {
      email: emailParam.Parameter.Value,
      password: passwordParam.Parameter.Value
    };
  } catch (error) {
    console.error('[Bhyve] Error getting credentials:', error);
    throw new Error('Failed to retrieve Bhyve credentials');
  }
}

async function authenticate(): Promise<{ token: string; user_id: string }> {
  const credentials = await getBhyveCredentials();
  
  const response = await axios.post('https://api.orbitbhyve.com/v1/session', {
    session: {
      email: credentials.email,
      password: credentials.password
    }
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Manor/1.0.0'
    }
  });

  const data = response.data;
  
  if (!data.orbit_session_token || !data.user_id) {
    throw new Error('Invalid authentication response');
  }

  return {
    token: data.orbit_session_token,
    user_id: data.user_id
  };
}

async function makeAuthenticatedRequest(endpoint: string, options: any = {}): Promise<any> {
  const auth = await authenticate();
  
  const response = await axios({
    url: `https://api.orbitbhyve.com/v1${endpoint}`,
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'orbit-session-token': auth.token,
      'User-Agent': 'Manor/1.0.0',
      ...options.headers
    },
    data: options.data
  });

  return response.data;
}

function transformDevice(rawDevice: any): BhyveDevice {
  const zones: BhyveZone[] = rawDevice.zones?.map((zone: any) => ({
    station: zone.station,
    name: zone.name || `Zone ${zone.station}`,
    smart_watering_enabled: zone.smart_watering_enabled || false,
    sprinkler_type: zone.sprinkler_type || 'unknown',
    is_watering: rawDevice.status?.watering_status?.current_station === zone.station && 
                  rawDevice.status?.watering_status?.status === 'watering_in_progress',
    watering_time: 0,
    remaining_time: rawDevice.status?.watering_status?.current_station === zone.station ? 
                   rawDevice.status?.watering_status?.current_time_remaining_sec : undefined
  })) || [];

  return {
    id: rawDevice.id,
    name: rawDevice.name || 'Unknown Device',
    mac_address: rawDevice.mac_address,
    type: rawDevice.type,
    last_seen: rawDevice.last_connected_at,
    zones,
    rain_delay_expiration: rawDevice.status?.rain_delay?.delay ? 
      new Date(Date.now() + rawDevice.status.rain_delay.delay * 3600000).toISOString() : undefined,
    status: rawDevice.status
  };
}

/**
 * List all Bhyve irrigation devices and their current status
 */
export async function listDevices(): Promise<BhyveData> {
  console.log('[Bhyve] Listing irrigation devices');
  
  try {
    const rawDevices = await makeAuthenticatedRequest('/devices');
    const devices = (rawDevices || []).map(transformDevice);
    
    return { devices };
  } catch (error) {
    console.error('[Bhyve] Error listing devices:', error);
    throw error;
  }
}

/**
 * Start watering a specific zone
 */
export async function startWatering(deviceId: string, station: number, timeMinutes: number): Promise<any> {
  console.log(`[Bhyve] Starting watering for device ${deviceId}, station ${station}, duration ${timeMinutes} minutes`);
  
  try {
    const auth = await authenticate();
    
    // Initialize WebSocket client if not already connected
    if (!wsClient) {
      wsClient = new BhyveWebSocketClient();
      await wsClient.connect(auth.token, deviceId);
    }

    await wsClient.startWatering(station, timeMinutes);
    
    return {
      success: true,
      message: `Started watering zone ${station} for ${timeMinutes} minutes`
    };
  } catch (error) {
    console.error('[Bhyve] Error starting watering:', error);
    throw error;
  }
}

/**
 * Stop watering a specific zone
 */
export async function stopWatering(deviceId: string, station: number): Promise<any> {
  console.log(`[Bhyve] Stopping watering for device ${deviceId}, station ${station}`);
  
  try {
    if (!wsClient) {
      const auth = await authenticate();
      wsClient = new BhyveWebSocketClient();
      await wsClient.connect(auth.token, deviceId);
    }

    await wsClient.stopWatering();
    
    return {
      success: true,
      message: `Stopped watering zone ${station}`
    };
  } catch (error) {
    console.error('[Bhyve] Error stopping watering:', error);
    throw error;
  }
}

/**
 * Cancel rain delay for a device
 */
export async function cancelRainDelay(deviceId: string): Promise<any> {
  console.log(`[Bhyve] Canceling rain delay for device ${deviceId}`);
  
  try {
    if (!wsClient) {
      const auth = await authenticate();
      wsClient = new BhyveWebSocketClient();
      await wsClient.connect(auth.token, deviceId);
    }

    await wsClient.setRainDelay(0); // 0 hours = cancel delay
    
    return {
      success: true,
      message: 'Rain delay cancelled'
    };
  } catch (error) {
    console.error('[Bhyve] Error canceling rain delay:', error);
    throw error;
  }
}

/**
 * Set rain delay for a device
 */
export async function setRainDelay(deviceId: string, hours: number): Promise<any> {
  console.log(`[Bhyve] Setting rain delay for device ${deviceId} to ${hours} hours`);
  
  try {
    if (!wsClient) {
      const auth = await authenticate();
      wsClient = new BhyveWebSocketClient();
      await wsClient.connect(auth.token, deviceId);
    }

    await wsClient.setRainDelay(hours);
    
    return {
      success: true,
      message: `Rain delay set to ${hours} hours`
    };
  } catch (error) {
    console.error('[Bhyve] Error setting rain delay:', error);
    throw error;
  }
}

// Cleanup function for Lambda container reuse
export function cleanup(): void {
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
}
