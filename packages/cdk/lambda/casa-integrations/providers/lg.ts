import axios from 'axios';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

async function getParameter(name: string): Promise<string> {
  const command = new GetParameterCommand({ Name: name, WithDecryption: true });
  const response = await ssmClient.send(command);
  if (!response.Parameter?.Value) throw new Error(`Parameter ${name} not found or empty`);
  return response.Parameter.Value;
}

enum OperationState {
  POWER_OFF = 'POWER_OFF',
  POWER_ON = 'POWER_ON',
  START = 'START',
  STOP = 'STOP',
  PAUSE = 'PAUSE',
  NORMAL = 'NORMAL',
  TOWEL = 'TOWEL',
  DELICATE = 'DELICATE',
  BEDDING = 'BEDDING',
  QUICK_WASH = 'QUICK_WASH',
  HEAVY_DUTY = 'HEAVY_DUTY',
  SANITIZE = 'SANITIZE'
}

enum DeviceType {
  WASHER = 'washer',
  DRYER = 'dryer',
  UNKNOWN = 'unknown'
}

async function getCredentials(): Promise<{ userId: string; accessToken: string; countryCode: string }> {
  const userId = await getParameter('/lg/user-id');
  const accessToken = await getParameter('/lg/access-token');
  return { userId, accessToken, countryCode: 'CA' };
}

function generateMessageId(): string {
  const uuid = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  const raw = Buffer.from(uuid);
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '').substring(0, 22);
}

function createHeaders(userId: string, accessToken: string, countryCode: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-message-id': generateMessageId(),
    'x-country': countryCode,
    'x-client-id': userId,
    'x-api-key': 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3',
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

function getDeviceType(device: any): DeviceType {
  const dt = device?.deviceInfo?.deviceType || '';
  if (dt.includes('WASHER')) return DeviceType.WASHER;
  if (dt.includes('DRYER')) return DeviceType.DRYER;
  return DeviceType.UNKNOWN;
}

export async function listDevices(): Promise<any[]> {
  const { userId, accessToken, countryCode } = await getCredentials();
  const headers = createHeaders(userId, accessToken, countryCode);
  const response = await axios.get('https://api-aic.lgthinq.com/devices', { headers });
  const devices = response.data.response || [];
  return devices.map((device: any) => {
    const info = device.deviceInfo || {};
    const deviceType = getDeviceType(device);
    return {
      deviceId: device.deviceId,
      deviceName: info.alias || info.modelName || 'Unknown Device',
      deviceType,
      modelName: info.modelName || 'Unknown Model',
      connected: info.reportable === true,
      rawData: device
    };
  });
}

export async function getDeviceProfile(deviceId: string): Promise<any> {
  const { userId, accessToken, countryCode } = await getCredentials();
  const headers = createHeaders(userId, accessToken, countryCode);
  const response = await axios.get(`https://api-aic.lgthinq.com/devices/${deviceId}/profile`, { headers });
  return response.data.response || {};
}

export async function getDeviceState(deviceId: string): Promise<any> {
  const { userId, accessToken, countryCode } = await getCredentials();
  const headers = createHeaders(userId, accessToken, countryCode);
  const endpoints = [
    `https://api-aic.lgthinq.com/state/device/${deviceId}/state`,
    `https://api-aic.lgthinq.com/devices/${deviceId}/state`
  ];
  let lastErr: any;
  for (const url of endpoints) {
    try {
      const resp = await axios.get(url, { headers });
      if (resp.status === 200 && resp.data.response) return resp.data.response;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Failed to fetch state: ${lastErr?.message}`);
}

export async function controlDevice(deviceId: string, payload: any): Promise<any> {
  const { userId, accessToken, countryCode } = await getCredentials();
  const headers = createHeaders(userId, accessToken, countryCode);
  const response = await axios.post(`https://api-aic.lgthinq.com/devices/${deviceId}/control`, payload, { headers });
  return response.data.response || {};
}

function buildControlPayload(deviceType: DeviceType, mode: OperationState): any {
  const key = deviceType === DeviceType.WASHER ? 'washerOperationMode' : 'dryerOperationMode';
  const loc = deviceType === DeviceType.WASHER ? { location: { locationName: 'MAIN' } } : {};
  return { ...loc, operation: { [key]: mode } };
}

export async function controlWasher(deviceId: string, mode: OperationState): Promise<any> {
  const payload = buildControlPayload(DeviceType.WASHER, mode);
  return controlDevice(deviceId, payload);
}

export async function controlDryer(deviceId: string, mode: OperationState): Promise<any> {
  const payload = buildControlPayload(DeviceType.DRYER, mode);
  return controlDevice(deviceId, payload);
}

export async function checkRemoteControlEnabled(deviceId: string): Promise<boolean> {
  const profile = await getDeviceProfile(deviceId);
  const enabled = profile.remoteControlEnable?.remoteControlEnabled === true;
  if (!enabled) console.warn(`Remote control disabled for ${deviceId}`);
  return enabled;
}

export async function getDeviceData(deviceId: string): Promise<any> {
  try {
    const profile = await getDeviceProfile(deviceId);
    const state = await getDeviceState(deviceId);
    
    // Get device info from the devices list since profile doesn't contain deviceInfo
    const devices = await listDevices();
    const deviceInfo = devices.find(d => d.deviceId === deviceId);
    
    // Use device info from the list or fallback to unknown
    const deviceType = deviceInfo?.deviceType || DeviceType.UNKNOWN;
    const deviceName = deviceInfo?.deviceName || 'Unknown Device';
    const modelName = deviceInfo?.modelName || 'Unknown Model';
  
  // Extract current state from multiple possible locations
  let currentState = 'UNKNOWN';
  let isPoweredOn = false;
  let remainingTime: string | undefined;
  let remoteControlEnabled = false;
  
  // Check for remote control status
  if (profile.property && Array.isArray(profile.property)) {
    const remoteControlProp = profile.property.find((p: any) => p.remoteControlEnable);
    if (remoteControlProp?.remoteControlEnable?.remoteControlEnabled?.value?.r) {
      remoteControlEnabled = remoteControlProp.remoteControlEnable.remoteControlEnabled.value.r.includes(true);
    }
  } else if (state.remoteControlEnable?.remoteControlEnabled !== undefined) {
    remoteControlEnabled = state.remoteControlEnable.remoteControlEnabled;
  }
  
  // Extract state from rawState
  if (state.runState?.currentState) {
    currentState = state.runState.currentState;
  } else if (Array.isArray(state) && state.length > 0 && state[0].runState?.currentState) {
    currentState = state[0].runState.currentState;
  }
  
  // Determine if powered on
  isPoweredOn = currentState !== 'POWER_OFF' && currentState !== 'OFF';
  
  // Extract remaining time
  if (state.timer) {
    const timer = state.timer;
    if (timer.remainHour !== undefined && timer.remainMinute !== undefined) {
      if (timer.remainHour > 0 || timer.remainMinute > 0) {
        remainingTime = timer.remainHour > 0 
          ? `${timer.remainHour}:${timer.remainMinute.toString().padStart(2, '0')}`
          : `${timer.remainMinute}`;
      }
    }
  } else if (Array.isArray(state) && state.length > 0 && state[0].timer) {
    const timer = state[0].timer;
    if (timer.remainHour !== undefined && timer.remainMinute !== undefined) {
      if (timer.remainHour > 0 || timer.remainMinute > 0) {
        remainingTime = timer.remainHour > 0 
          ? `${timer.remainHour}:${timer.remainMinute.toString().padStart(2, '0')}`
          : `${timer.remainMinute}`;
      }
    }
  }
  
  return {
    deviceId,
    deviceName,
    deviceType,
    modelName,
    remoteControlEnabled,
    currentState,
    isPoweredOn,
    remainingTime,
    // Debug info to help troubleshoot power state issues
    _debug: {
      currentState,
      isPoweredOnLogic: `${currentState} !== 'POWER_OFF' && ${currentState} !== 'OFF' = ${isPoweredOn}`,
      rawRunState: state.runState
    },
    rawProfile: profile,
    rawState: state
  };
  } catch (error) {
    console.error('Error in getDeviceData for device:', deviceId, error);
    // Return a minimal valid response to prevent crashes
    return {
      deviceId,
      deviceName: 'Error Loading Device',
      deviceType: DeviceType.UNKNOWN,
      modelName: 'Error',
      remoteControlEnabled: false,
      currentState: 'ERROR',
      isPoweredOn: false,
      remainingTime: undefined,
      _debug: {
        error: error instanceof Error ? error.message : String(error),
        currentState: 'ERROR',
        isPoweredOnLogic: 'ERROR = false'
      },
      rawProfile: {},
      rawState: {}
    };
  }
}

export async function startWashing(deviceId: string, cycle?: string): Promise<any> {
  // Check if remote control is enabled first
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  const payload: any = { 
    location: { locationName: 'MAIN' }, 
    operation: { washerOperationMode: OperationState.START }
  };
  
  // If a specific cycle is provided, add it to the payload
  if (cycle && Object.values(OperationState).includes(cycle as OperationState)) {
    payload.cycle = { cycleType: cycle };
  }
  
  return controlDevice(deviceId, payload);
}

export async function stopWashing(deviceId: string): Promise<any> {
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  const payload = { 
    location: { locationName: 'MAIN' }, 
    operation: { washerOperationMode: OperationState.STOP }
  };
  return controlDevice(deviceId, payload);
}

export async function pauseWashing(deviceId: string): Promise<any> {
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  const payload = { 
    location: { locationName: 'MAIN' }, 
    operation: { washerOperationMode: OperationState.PAUSE }
  };
  return controlDevice(deviceId, payload);
}

export async function startDrying(deviceId: string, cycle?: string): Promise<any> {
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  const payload: any = { 
    operation: { dryerOperationMode: OperationState.START }
  };
  
  if (cycle && Object.values(OperationState).includes(cycle as OperationState)) {
    payload.cycle = { cycleType: cycle };
  }
  
  return controlDevice(deviceId, payload);
}

export async function stopDrying(deviceId: string): Promise<any> {
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  const payload = { 
    operation: { dryerOperationMode: OperationState.STOP }
  };
  return controlDevice(deviceId, payload);
}

export async function pauseDrying(deviceId: string): Promise<any> {
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  const payload = { 
    operation: { dryerOperationMode: OperationState.PAUSE }
  };
  return controlDevice(deviceId, payload);
}

export async function getAvailableCycles(deviceId: string): Promise<string[]> {
  const profile = await getDeviceProfile(deviceId);
  const cycles: string[] = [];
  
  // Extract available cycles from device profile
  if (profile.property && Array.isArray(profile.property)) {
    for (const prop of profile.property) {
      if (prop.cycle && prop.cycle.cycleType && prop.cycle.cycleType.value) {
        const availableCycles = prop.cycle.cycleType.value.w || prop.cycle.cycleType.value.r;
        if (Array.isArray(availableCycles)) {
          cycles.push(...availableCycles);
        }
      }
    }
  }
  
  // Default cycles if none found in profile
  if (cycles.length === 0) {
    return ['NORMAL', 'TOWEL', 'DELICATE', 'BEDDING', 'QUICK_WASH', 'HEAVY_DUTY'];
  }
  
  return [...new Set(cycles)]; // Remove duplicates
}

export async function setDelayedStart(deviceId: string, hours: number): Promise<any> {
  const isEnabled = await checkRemoteControlEnabled(deviceId);
  if (!isEnabled) {
    throw new Error('Remote control is disabled for this device. Please enable it in the LG ThinQ app.');
  }
  
  if (hours < 1 || hours > 19) {
    throw new Error('Delayed start must be between 1 and 19 hours');
  }
  
  const payload = {
    location: { locationName: 'MAIN' },
    timer: { 
      relativeHourToStart: hours,
      relativeMinuteToStart: 0 
    }
  };
  
  return controlDevice(deviceId, payload);
}
