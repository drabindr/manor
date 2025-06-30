// integrationHandler.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as tplink from './providers/tplink';
import * as hue from './providers/hue';
import * as google from './providers/google'; // Import the Google Nest provider
import * as airthings from './providers/airthings';
import * as lg from './providers/lg'; // Import the LG ThinQ provider
import * as bhyve from './providers/bhyve'; // Import the Bhyve irrigation provider

// In-memory cache for Google devices
// { data: any; timestamp: number }
let googleDevicesCache: { data: any; timestamp: number } | null = null;
const GOOGLE_DEVICES_CACHE_TTL_MS = 30000; // 30 seconds TTL

/**
 * Helper function to perform exponential backoff on transient errors (like throttling).
 * Retries on HTTP 429 and possibly other retryable status codes.
 */
async function executeWithRetries<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let attempt = 0;
  let delay = 500; // initial delay in ms
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      const is429 = error?.response?.status === 429;
      const is503 = error?.response?.status === 503;
      // You can add other retryable conditions here if needed
      if (is429 || is503) {
        attempt++;
        console.warn(`Rate limit or transient error encountered. Attempt ${attempt} of ${maxRetries}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        // Non-retriable error, rethrow
        throw error;
      }
    }
  }
  throw new Error("Max retries exceeded for API call.");
}

/**
 * Wraps google.listDevices() with caching and retries.
 */
async function listGoogleDevicesWithCache() {
  const now = Date.now();
  // If we have cached data newer than 30 seconds, return it
  if (googleDevicesCache && (now - googleDevicesCache.timestamp) < GOOGLE_DEVICES_CACHE_TTL_MS) {
    return googleDevicesCache.data;
  }

  // Otherwise, fetch fresh data from the Google API with retries
  const data = await executeWithRetries(() => google.listDevices());
  googleDevicesCache = { data, timestamp: now };
  return data;
}

/**
 * Wrap google.executeDeviceCommand with retries.
 */
async function executeGoogleDeviceCommand(deviceId: string, command: string, params?: any) {
  return executeWithRetries(() => google.executeDeviceCommand(deviceId, command, params));
}

/**
 * Wrap google.getDeviceSettings with retries (no caching by default, but could be added if needed).
 */
async function getGoogleDeviceSettings(deviceId: string) {
  return executeWithRetries(() => google.getDeviceSettings(deviceId));
}

// Export the handler function
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Incoming event:', JSON.stringify(event));

  const provider = event.pathParameters?.provider;
  const deviceType = event.pathParameters?.deviceType;
  const action = event.pathParameters?.action;
  
  console.log('Path parameters:', { provider, deviceType, action });
  console.log('Event path:', event.path);

  // Helper function to create responses with CORS headers
  const createResponse = (
    statusCode: number,
    body: any
  ): APIGatewayProxyResult => {
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
      },
      body: JSON.stringify(body),
    };
  };

  if (!provider) {
    return createResponse(400, { error: 'Missing provider path parameter' });
  }

  // Handle OAuth Initiation and Callback using event.path
  if (event.path.endsWith('/auth/initiate')) {
    if (provider.toLowerCase() === 'google') {
      // Detect if request is from iOS based on User-Agent
      const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || '';
      const isIOS = userAgent.includes('Manor-iOS') || userAgent.includes('casaguard') || userAgent.includes('CFNetwork');
      
      // Use iOS-specific redirect URI if request is from iOS
      let customRedirectUri: string | undefined;
      if (isIOS) {
        customRedirectUri = 'casaguard://auth/callback';
      }
      
      // Initiate OAuth2 flow
      const authUrl = await google.initiateOAuth2Flow(customRedirectUri);
      return {
        statusCode: 302,
        headers: {
          Location: authUrl,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        },
        body: '',
      };
    } else {
      return createResponse(400, { error: `OAuth not supported for provider '${provider}'` });
    }
  } else if (event.path.endsWith('/auth/callback')) {
    if (provider.toLowerCase() === 'google') {
      const code = event.queryStringParameters?.code;
      if (!code) {
        return createResponse(400, { error: 'Missing code parameter in query string' });
      }
      
      // Detect if request is from iOS based on User-Agent
      const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || '';
      const isIOS = userAgent.includes('Manor-iOS') || userAgent.includes('casaguard') || userAgent.includes('CFNetwork');
      
      // Use iOS-specific redirect URI if request is from iOS
      let customRedirectUri: string | undefined;
      if (isIOS) {
        customRedirectUri = 'casaguard://auth/callback';
      }
      
      await google.handleOAuth2Callback(code, customRedirectUri);
      // Redirect back to your web page after successful authorization
      const domainName = process.env.DOMAIN_NAME || '720frontrd.mymanor.click';
      return {
        statusCode: 302,
        headers: {
          Location: `https://${domainName}/`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
        },
        body: '',
      };
    } else {
      return createResponse(400, { error: `OAuth not supported for provider '${provider}'` });
    }
  }

  // Now check for required path parameters after handling OAuth paths
  if (!deviceType || !action) {
    return createResponse(400, { error: 'Missing deviceType or action path parameters' });
  }

  try {
    let response;

    // Handle Hue Provider
    if (provider.toLowerCase() === 'hue') {
      if (deviceType.toLowerCase() === 'lights') {
        if (action.toLowerCase() === 'list') {
          // List all Hue lights (no request body required)
          response = await hue.listLights();
        } else if (action.toLowerCase() === 'trigger') {
          // Parse and validate the request body for triggering a light
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.data) {
            return createResponse(400, {
              error: 'Missing data in request body',
            });
          }

          const { deviceId, state } = requestBody.data;

          if (!deviceId || typeof state !== 'boolean') {
            return createResponse(400, {
              error: 'Invalid deviceId or state in request body',
            });
          }

          // Call the Hue provider to trigger the light
          response = await hue.triggerLight(deviceId, state);
        } else {
          return createResponse(400, { error: 'Unknown action for Hue' });
        }
      } else {
        return createResponse(400, { error: 'Unknown device type for Hue' });
      }
    }

    // Handle TP-Link Provider
    else if (provider.toLowerCase() === 'tplink') {
      if (deviceType.toLowerCase() === 'lights') {
        if (action.toLowerCase() === 'list') {
          // List all TP-Link lights (no request body required)
          response = await tplink.listLights();
        } else if (action.toLowerCase() === 'trigger') {
          // Parse and validate the request body for triggering a light
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.data) {
            return createResponse(400, {
              error: 'Missing data in request body',
            });
          }

          const { deviceId, state } = requestBody.data;

          if (!deviceId || typeof state !== 'boolean') {
            return createResponse(400, {
              error: 'Invalid deviceId or state in request body',
            });
          }

          const numericState = state ? 1 : 0;
          response = await tplink.triggerLights(
            deviceId,
            undefined,
            numericState
          );
        } else {
          return createResponse(400, { error: 'Unknown action for TP-Link' });
        }
      } else {
        return createResponse(400, { error: 'Unknown device type for TP-Link' });
      }
    }

    // Handle Google Nest Provider
    else if (provider.toLowerCase() === 'google') {
      if (deviceType.toLowerCase() === 'devices') {
        if (action.toLowerCase() === 'list') {
          // List all Google Nest devices (with caching and retry)
          response = await listGoogleDevicesWithCache();
        } else if (action.toLowerCase() === 'command') {
          // Handle command action for devices (including cameras)
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody ||
            !requestBody.data ||
            !requestBody.data.deviceId ||
            !requestBody.data.command
          ) {
            return createResponse(400, {
              error: 'Missing deviceId or command in request body',
            });
          }

          const { deviceId, command, params } = requestBody.data;

          // Execute command with retries
          response = await executeGoogleDeviceCommand(deviceId, command, params);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for devices under Google provider`,
          });
        }
      } else if (
        deviceType.toLowerCase() === 'thermostat' ||
        deviceType.toLowerCase() === 'camera'
      ) {
        if (action.toLowerCase() === 'get') {
          // Parse and validate the request body for getting device settings
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.data || !requestBody.data.deviceId) {
            return createResponse(400, {
              error: 'Missing deviceId in request body',
            });
          }

          const { deviceId } = requestBody.data;

          // Retrieve the current device settings with retries
          response = await getGoogleDeviceSettings(deviceId);
        } else if (action.toLowerCase() === 'command') {
          // Parse and validate the request body for executing a command
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody ||
            !requestBody.data ||
            !requestBody.data.deviceId ||
            !requestBody.data.command
          ) {
            return createResponse(400, {
              error: 'Missing deviceId or command in request body',
            });
          }

          const { deviceId, command, params } = requestBody.data;

          // Execute command with retries
          response = await executeGoogleDeviceCommand(deviceId, command, params);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for device type '${deviceType}' under Google provider`,
          });
        }
      } else {
        return createResponse(400, {
          error: `Unknown device type '${deviceType}' for Google provider`,
        });
      }
    }

    // Handle Airthings Provider
    else if (provider.toLowerCase() === 'airthings') {
      if (deviceType.toLowerCase() === 'sensor' && action.toLowerCase() === 'data') {
        response = await airthings.getSensorData();
      } else {
        return createResponse(400, {
          error: `Unknown action '${action}' for device type '${deviceType}' under Airthings provider`,
        });
      }
    }

    // Handle LG ThinQ Provider
    else if (provider.toLowerCase() === 'lg') {
      if (deviceType.toLowerCase() === 'devices') {
        if (action.toLowerCase() === 'list') {
          // List all LG devices
          response = await lg.listDevices();
        } else if (action.toLowerCase() === 'status') {
          // Get device status
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.data || !requestBody.data.deviceId) {
            return createResponse(400, {
              error: 'Missing deviceId in request body',
            });
          }

          const { deviceId } = requestBody.data;
          response = await lg.getDeviceData(deviceId);
        } else {
          return createResponse(400, { 
            error: `Unknown action '${action}' for devices under LG provider` 
          });
        }
      } else if (deviceType.toLowerCase() === 'washer') {
        if (action.toLowerCase() === 'control') {
          // Control washer
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody || 
            !requestBody.data || 
            !requestBody.data.deviceId || 
            !requestBody.data.mode
          ) {
            return createResponse(400, {
              error: 'Missing deviceId or mode in request body',
            });
          }

          const { deviceId, mode, cycle } = requestBody.data;
          
          // Handle different operation modes
          switch (mode.toUpperCase()) {
            case 'START':
              response = await lg.startWashing(deviceId, cycle);
              break;
            case 'STOP':
              response = await lg.stopWashing(deviceId);
              break;
            case 'PAUSE':
              response = await lg.pauseWashing(deviceId);
              break;
            case 'POWER_ON':
            case 'POWER_OFF':
              response = await lg.controlWasher(deviceId, mode);
              break;
            case 'DRAIN':
              // Use dedicated drainAndOff function for proper drain and power off sequence
              response = await lg.drainAndOff(deviceId);
              break;
            default:
              // Try using the generic control for custom modes
              response = await lg.controlWasher(deviceId, mode);
          }
        } else if (action.toLowerCase() === 'cycles') {
          // Get available cycles
          const requestBody = event.body ? JSON.parse(event.body) : null;
          if (!requestBody || !requestBody.data || !requestBody.data.deviceId) {
            return createResponse(400, {
              error: 'Missing deviceId in request body',
            });
          }
          const { deviceId } = requestBody.data;
          response = await lg.getAvailableCycles(deviceId);
        } else if (action.toLowerCase() === 'delay') {
          // Set delayed start
          const requestBody = event.body ? JSON.parse(event.body) : null;
          if (!requestBody || !requestBody.data || !requestBody.data.deviceId || !requestBody.data.hours) {
            return createResponse(400, {
              error: 'Missing deviceId or hours in request body',
            });
          }
          const { deviceId, hours } = requestBody.data;
          response = await lg.setDelayedStart(deviceId, hours);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for washer under LG provider`,
          });
        }
      } else if (deviceType.toLowerCase() === 'dryer') {
        if (action.toLowerCase() === 'control') {
          // Control dryer
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody || 
            !requestBody.data || 
            !requestBody.data.deviceId || 
            !requestBody.data.mode
          ) {
            return createResponse(400, {
              error: 'Missing deviceId or mode in request body',
            });
          }

          const { deviceId, mode, cycle } = requestBody.data;
          
          // Handle different operation modes
          switch (mode.toUpperCase()) {
            case 'START':
              response = await lg.startDrying(deviceId, cycle);
              break;
            case 'STOP':
              response = await lg.stopDrying(deviceId);
              break;
            case 'PAUSE':
              response = await lg.pauseDrying(deviceId);
              break;
            case 'POWER_ON':
            case 'POWER_OFF':
              response = await lg.controlDryer(deviceId, mode);
              break;
            default:
              // Try using the generic control for custom modes
              response = await lg.controlDryer(deviceId, mode);
          }
        } else if (action.toLowerCase() === 'cycles') {
          // Get available cycles
          const requestBody = event.body ? JSON.parse(event.body) : null;
          if (!requestBody || !requestBody.data || !requestBody.data.deviceId) {
            return createResponse(400, {
              error: 'Missing deviceId in request body',
            });
          }
          const { deviceId } = requestBody.data;
          response = await lg.getAvailableCycles(deviceId);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for dryer under LG provider`,
          });
        }
      } else {
        return createResponse(400, {
          error: `Unknown device type '${deviceType}' for LG provider`,
        });
      }
    }

    // Handle Bhyve Irrigation Provider
    else if (provider.toLowerCase() === 'bhyve') {
      console.log('Bhyve provider detected. deviceType:', deviceType, 'action:', action);
      if (deviceType.toLowerCase() === 'devices') {
        console.log('Devices deviceType matched');
        if (action.toLowerCase() === 'list') {
          console.log('List action matched - calling bhyve.listDevices()');
          // List all Bhyve irrigation devices
          response = await bhyve.listDevices();
        } else {
          console.log('Unknown action for devices:', action);
          return createResponse(400, {
            error: `Unknown action '${action}' for devices under Bhyve provider`,
          });
        }
      } else if (deviceType.toLowerCase() === 'zones') {
        if (action.toLowerCase() === 'start') {
          // Start watering a zone
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody || 
            !requestBody.device_id || 
            !requestBody.station || 
            !requestBody.time
          ) {
            return createResponse(400, {
              error: 'Missing device_id, station, or time in request body',
            });
          }

          const { device_id, station, time } = requestBody;
          response = await bhyve.startWatering(device_id, station, time);
        } else if (action.toLowerCase() === 'stop') {
          // Stop watering a zone
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody || 
            !requestBody.device_id || 
            !requestBody.station
          ) {
            return createResponse(400, {
              error: 'Missing device_id or station in request body',
            });
          }

          const { device_id, station } = requestBody;
          response = await bhyve.stopWatering(device_id, station);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for zones under Bhyve provider`,
          });
        }
      } else if (deviceType.toLowerCase() === 'rain-delay') {
        if (action.toLowerCase() === 'cancel') {
          // Cancel rain delay
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id) {
            return createResponse(400, {
              error: 'Missing device_id in request body',
            });
          }

          const { device_id } = requestBody;
          response = await bhyve.cancelRainDelay(device_id);
        } else if (action.toLowerCase() === 'set') {
          // Set rain delay
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id || !requestBody.hours) {
            return createResponse(400, {
              error: 'Missing device_id or hours in request body',
            });
          }

          const { device_id, hours } = requestBody;
          response = await bhyve.setRainDelay(device_id, hours);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for rain-delay under Bhyve provider`,
          });
        }
      } else {
        console.log('Unknown deviceType for Bhyve:', deviceType);
        return createResponse(400, {
          error: `Unknown device type '${deviceType}' for Bhyve provider`,
        });
      }
    }

    // Unknown provider case
    else {
      return createResponse(400, { error: 'Unknown provider' });
    }

    return createResponse(200, response);
  } catch (error: any) {
    console.error('Error:', error);

    // Handle re-authorization required error
    if (error.message.includes('Re-authorization required')) {
      return createResponse(401, {
        error: 'unauthorized',
        message: 'Authorization required. Please re-authorize the application.',
      });
    }

    return createResponse(500, { error: error.message });
  }
};
