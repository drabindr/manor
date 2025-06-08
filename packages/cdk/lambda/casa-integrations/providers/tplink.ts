import axios from 'axios';
import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

async function getCredentials() {
  const command = new GetParametersCommand({
    Names: [
      '/tplink/cloudUsername',
      '/tplink/cloudPassword',
      '/tplink/terminalUUID',
    ],
    WithDecryption: true,
  });

  const response = await ssmClient.send(command);

  const params = response.Parameters || [];
  const credentials: Record<string, string> = {};

  for (const param of params) {
    if (param.Name && param.Value) {
      credentials[param.Name] = param.Value;
    }
  }

  const CLOUD_USERNAME = credentials['/tplink/cloudUsername'];
  const CLOUD_PASSWORD = credentials['/tplink/cloudPassword'];
  const TERMINAL_UUID = credentials['/tplink/terminalUUID'];

  if (!CLOUD_USERNAME || !CLOUD_PASSWORD || !TERMINAL_UUID) {
    throw new Error('Missing TP-Link credentials in Parameter Store');
  }

  return { CLOUD_USERNAME, CLOUD_PASSWORD, TERMINAL_UUID };
}

async function getToken(
  CLOUD_USERNAME: string,
  CLOUD_PASSWORD: string,
  TERMINAL_UUID: string
): Promise<string> {
  try {
    const response = await axios.post('https://wap.tplinkcloud.com/', {
      method: 'login',
      params: {
        appType: 'Kasa_Android',
        cloudUserName: CLOUD_USERNAME,
        cloudPassword: CLOUD_PASSWORD,
        terminalUUID: TERMINAL_UUID,
        appVersion: '1.4.4.607',
        osType: 'Android',
      },
    });

    if (response.data.error_code && response.data.error_code !== 0) {
      throw new Error(`Login failed: ${response.data.msg || 'Unknown error'}`);
    }

    return response.data.result.token;
  } catch (error: any) {
    console.error('Authentication error:', error.response?.data || error.message);
    throw new Error(
      `Authentication failed. Details: ${
        error.response?.data?.msg || error.message || 'Unknown error'
      }`
    );
  }
}

async function getDeviceList(token: string): Promise<any[]> {
  try {
    const deviceListResponse = await axios.post(
      `https://wap.tplinkcloud.com?token=${token}`,
      {
        method: 'getDeviceList',
        params: {},
      }
    );

    if (
      deviceListResponse.data.error_code &&
      deviceListResponse.data.error_code !== 0
    ) {
      throw new Error(
        `getDeviceList failed: ${deviceListResponse.data.msg || 'Unknown error'}`
      );
    }

    const devices = deviceListResponse.data.result.deviceList;

    // Fetch relay state for each device
    const devicesWithState = await Promise.all(
      devices.map(async (device: any) => {
        try {
          let appServerUrl = device.appServerUrl;
          if (!appServerUrl.startsWith('http')) {
            appServerUrl = 'https://' + appServerUrl;
          }

          const stateResponse = await axios.post(
            `${appServerUrl}?token=${token}`,
            {
              method: 'passthrough',
              params: {
                deviceId: device.deviceId,
                requestData: '{"system":{"get_sysinfo":{}}}',
              },
            }
          );

          // Safely check for responseData
          const responseData =
            stateResponse?.data?.result?.responseData &&
            JSON.parse(stateResponse.data.result.responseData);

          if (!responseData) {
            console.error(
              `Device ${device.deviceId}: responseData is missing or invalid.`
            );
            return {
              ...device,
              relay_state: 0, // Default to OFF for devices with missing data
              error: 'responseData is missing or invalid',
            };
          }

          if (responseData.error_code && responseData.error_code !== 0) {
            console.error(
              `Device ${device.deviceId}: Error getting sysinfo: ${
                responseData.msg || 'Unknown error'
              }`
            );
            return {
              ...device,
              relay_state: 0, // Default to OFF for devices with errors
              error: responseData.msg || 'Unknown error',
            };
          }

          const sysInfo = responseData.system.get_sysinfo;
          return { ...device, relay_state: sysInfo.relay_state };
        } catch (error: any) {
          console.error(
            `Error fetching relay state for device ${device.deviceId}:`,
            error.response?.data || error.message
          );
          return {
            ...device,
            relay_state: 0, // Default to OFF for devices with communication errors
            error: error.response?.data?.msg || error.message || 'Unknown error',
          };
        }
      })
    );

    return devicesWithState;
  } catch (error: any) {
    console.error('Error in getDeviceList:', error.response?.data || error.message);
    throw new Error(
      `Failed to retrieve device list. Token may be invalid. Details: ${
        error.response?.data?.msg || error.message || 'Unknown error'
      }`
    );
  }
}

export async function triggerLights(
  deviceId?: string,
  alias?: string,
  state: number = 1
): Promise<any> {
  const { CLOUD_USERNAME, CLOUD_PASSWORD, TERMINAL_UUID } =
    await getCredentials();

  const token = await getToken(CLOUD_USERNAME, CLOUD_PASSWORD, TERMINAL_UUID);
  console.log(`Token: ${token}`);

  if (!deviceId && !alias) {
    throw new Error(
      'You must provide either a deviceId or an alias to trigger a device.'
    );
  }

  // Get the list of devices
  const devices = await getDeviceList(token);

  // Find the device by deviceId or alias
  const device = devices.find((d) => {
    if (deviceId && d.deviceId === deviceId) {
      return true;
    }
    if (alias && d.alias.toLowerCase() === alias.toLowerCase()) {
      return true;
    }
    return false;
  });

  if (!device) {
    throw new Error('Device not found.');
  }

  let appServerUrl = device.appServerUrl;
  if (!appServerUrl.startsWith('http')) {
    appServerUrl = 'https://' + appServerUrl;
  }

  // Send the command to the specific device
  try {
    const response = await axios.post(`${appServerUrl}?token=${token}`, {
      method: 'passthrough',
      params: {
        deviceId: device.deviceId,
        requestData: `{"system":{"set_relay_state":{"state":${state}}}}`,
      },
    });

    if (response.data.error_code && response.data.error_code !== 0) {
      throw new Error(
        `Error triggering device: ${response.data.msg || 'Unknown error'}`
      );
    }

    return response.data;
  } catch (error: any) {
    console.error(
      `Error triggering device ${device.deviceId}:`,
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to trigger device ${device.deviceId}. Details: ${
        error.response?.data?.msg || error.message || 'Unknown error'
      }`
    );
  }
}

export async function listLights(): Promise<any> {
  const { CLOUD_USERNAME, CLOUD_PASSWORD, TERMINAL_UUID } =
    await getCredentials();

  const token = await getToken(CLOUD_USERNAME, CLOUD_PASSWORD, TERMINAL_UUID);
  console.log(`Token: ${token}`);

  const devices = await getDeviceList(token);

  console.log('Devices:', devices);

  return devices;
}
