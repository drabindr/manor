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
  const currentSequenceZone = getCurrentSequenceZone(rawDevice.id);
  const isSequenceRunning = isSequenceActive(rawDevice.id);
  
  const zones: BhyveZone[] = rawDevice.zones?.map((zone: any) => {
    // Check if this zone is currently watering (either individual or part of sequence)
    const isIndividualWatering = rawDevice.status?.watering_status?.current_station === zone.station && 
                               rawDevice.status?.watering_status?.status === 'watering_in_progress';
    const isSequenceWatering = currentSequenceZone?.station === zone.station;
    
    return {
      station: zone.station,
      name: zone.name || `Zone ${zone.station}`,
      smart_watering_enabled: zone.smart_watering_enabled || false,
      sprinkler_type: zone.sprinkler_type || 'unknown',
      is_watering: isIndividualWatering || isSequenceWatering,
      watering_time: 0,
      remaining_time: isIndividualWatering ? 
        rawDevice.status?.watering_status?.current_time_remaining_sec : 
        (isSequenceWatering && currentSequenceZone ? currentSequenceZone.timeRemaining : undefined)
    };
  }) || [];

  const device: BhyveDevice = {
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

  // Add sequence information if active
  if (isSequenceRunning) {
    const sequenceState = getSequenceState(rawDevice.id);
    if (sequenceState) {
      (device as any).activeSequence = {
        isActive: true,
        currentZone: currentSequenceZone?.station,
        timeRemaining: currentSequenceZone?.timeRemaining,
        totalZones: sequenceState.sequence.length,
        currentIndex: sequenceState.currentIndex,
        sequence: sequenceState.sequence.map(z => ({ station: z.station, duration: z.duration }))
      };
    }
  }

  return device;
}

// Add response caching to reduce external API calls
let deviceListCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 15000; // 15 seconds cache

/**
 * List all Bhyve irrigation devices and their current status
 */
export async function listDevices(): Promise<BhyveData> {
  console.log('[Bhyve] Listing irrigation devices');
  
  try {
    // Check cache first
    const now = Date.now();
    if (deviceListCache && (now - deviceListCache.timestamp) < CACHE_TTL_MS) {
      console.log('[Bhyve] Returning cached device data');
      return deviceListCache.data;
    }
    
    const rawDevices = await makeAuthenticatedRequest('/devices');
    const devices = (rawDevices || []).map(transformDevice);
    const result = { devices };
    
    // Update cache
    deviceListCache = {
      data: result,
      timestamp: now
    };
    
    console.log('[Bhyve] Cached fresh device data');
    return result;
  } catch (error) {
    console.error('[Bhyve] Error listing devices:', error);
    // Return cached data if available, even if stale
    if (deviceListCache) {
      console.log('[Bhyve] Returning stale cached data due to error');
      return deviceListCache.data;
    }
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

/**
 * Start a sequential watering program for multiple zones
 */
export async function startWateringSequence(deviceId: string, sequence: Array<{ station: number; duration: number }>): Promise<any> {
  console.log(`[Bhyve] Starting watering sequence for device ${deviceId}:`, sequence);
  
  try {
    const auth = await authenticate();
    
    // Initialize WebSocket client if not already connected
    if (!wsClient) {
      wsClient = new BhyveWebSocketClient();
      await wsClient.connect(auth.token, deviceId);
    }

    // For now, we'll start the first zone immediately and schedule the rest
    // In a production system, you'd want to implement proper scheduling
    if (sequence.length === 0) {
      throw new Error('Empty watering sequence provided');
    }

    // Calculate total duration
    const totalDuration = sequence.reduce((sum, zone) => sum + zone.duration, 0);
    
    // Store sequence state
    activeSequences.set(deviceId, {
      deviceId,
      sequence,
      currentIndex: 0,
      startTime: Date.now(),
      totalDuration
    });

    // Start the first zone immediately
    const firstZone = sequence[0];
    await wsClient.startWatering(firstZone.station, firstZone.duration);
    
    // For remaining zones, we'll implement a simple timeout-based approach
    // In production, you might want to use AWS Step Functions or EventBridge for more robust scheduling
    if (sequence.length > 1) {
      let currentDelay = firstZone.duration * 60 * 1000; // Convert to milliseconds
      
      for (let i = 1; i < sequence.length; i++) {
        const zone = sequence[i];
        setTimeout(async () => {
          try {
            console.log(`[Bhyve] Starting delayed zone ${zone.station} after ${currentDelay}ms`);
            
            // Update sequence state
            const state = activeSequences.get(deviceId);
            if (state) {
              state.currentIndex = i;
              activeSequences.set(deviceId, state);
            }
            
            await wsClient?.startWatering(zone.station, zone.duration);
          } catch (error) {
            console.error(`[Bhyve] Error starting delayed zone ${zone.station}:`, error);
          }
        }, currentDelay);
        
        currentDelay += zone.duration * 60 * 1000; // Add this zone's duration for next delay
      }
      
      // Clean up sequence state after completion
      setTimeout(() => {
        activeSequences.delete(deviceId);
        console.log(`[Bhyve] Sequence completed for device ${deviceId}`);
      }, currentDelay);
    } else {
      // Single zone sequence, clean up after completion
      setTimeout(() => {
        activeSequences.delete(deviceId);
        console.log(`[Bhyve] Single zone sequence completed for device ${deviceId}`);
      }, firstZone.duration * 60 * 1000);
    }
    
    return {
      success: true,
      message: `Started watering sequence with ${sequence.length} zones`,
      sequence: sequence,
      totalDuration: totalDuration
    };
  } catch (error) {
    console.error('[Bhyve] Error starting watering sequence:', error);
    throw error;
  }
}

// State management for tracking active watering sequences
interface WateringSequenceState {
  deviceId: string;
  sequence: Array<{ station: number; duration: number }>;
  currentIndex: number;
  startTime: number;
  totalDuration: number;
}

// In-memory state storage (in production, you'd use DynamoDB or similar)
let activeSequences: Map<string, WateringSequenceState> = new Map();

/**
 * Get the current watering sequence state for a device
 */
export function getSequenceState(deviceId: string): WateringSequenceState | null {
  return activeSequences.get(deviceId) || null;
}

/**
 * Calculate if a sequence is currently active
 */
export function isSequenceActive(deviceId: string): boolean {
  const state = activeSequences.get(deviceId);
  if (!state) return false;
  
  const elapsed = Date.now() - state.startTime;
  return elapsed < state.totalDuration * 60 * 1000; // Convert minutes to milliseconds
}

/**
 * Get the currently active zone in a sequence
 */
export function getCurrentSequenceZone(deviceId: string): { station: number; timeRemaining: number } | null {
  const state = activeSequences.get(deviceId);
  if (!state || !isSequenceActive(deviceId)) {
    return null;
  }
  
  const elapsed = Date.now() - state.startTime;
  let accumulatedTime = 0;
  
  for (let i = 0; i < state.sequence.length; i++) {
    const zone = state.sequence[i];
    const zoneDurationMs = zone.duration * 60 * 1000;
    
    if (elapsed >= accumulatedTime && elapsed < accumulatedTime + zoneDurationMs) {
      const timeRemaining = Math.max(0, zoneDurationMs - (elapsed - accumulatedTime));
      return {
        station: zone.station,
        timeRemaining: Math.ceil(timeRemaining / 1000) // Convert to seconds
      };
    }
    
    accumulatedTime += zoneDurationMs;
  }
  
  return null;
}

// Cleanup function for Lambda container reuse
export function cleanup(): void {
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
}
