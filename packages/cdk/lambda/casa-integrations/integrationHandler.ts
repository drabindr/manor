// integrationHandler.ts

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as tplink from './providers/tplink';
import * as hue from './providers/hue';
import * as google from './providers/google'; // Import the Google Nest provider
import * as airthings from './providers/airthings';
import * as lg from './providers/lg'; // Import the LG ThinQ provider
import * as bhyve from './providers/bhyve'; // Import the Bhyve irrigation provider
import * as seam from './providers/seam'; // Import the Seam smart lock provider

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
      // Initiate OAuth2 flow
      const authUrl = await google.initiateOAuth2Flow();
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
      await google.handleOAuth2Callback(code);
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
      } else if (deviceType.toLowerCase() === 'presets') {
        if (action.toLowerCase() === 'start') {
          // Start a watering preset using Bhyve's native multi-zone functionality
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id || !requestBody.preset_name) {
            return createResponse(400, {
              error: 'Missing device_id or preset_name in request body',
            });
          }

          const { device_id, preset_name } = requestBody;
          
          // Get device info to determine zone durations for preset
          const deviceData = await bhyve.listDevices();
          const device = deviceData.devices.find(d => d.id === device_id);
          
          if (!device) {
            return createResponse(400, {
              error: 'Device not found',
            });
          }

          // Define preset configurations (you can expand this)
          const presets: Record<string, Array<{station: number, duration: number}>> = {
            'flowers': [
              { station: 2, duration: 1 },  // 1 minute for front flower bed
              { station: 3, duration: 1 }   // 1 minute for backyard
            ]
          };

          const zones = presets[preset_name.toLowerCase()];
          if (!zones) {
            return createResponse(400, {
              error: `Unknown preset: ${preset_name}. Available presets: ${Object.keys(presets).join(', ')}`
            });
          }

          // Use Bhyve's native multi-zone watering
          response = await bhyve.startWateringProgram(device_id, zones);
        } else if (action.toLowerCase() === 'stop') {
          // Stop/cancel active preset
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id) {
            return createResponse(400, {
              error: 'Missing device_id in request body',
            });
          }

          const { device_id } = requestBody;
          // Stop all watering
          response = await bhyve.stopWatering(device_id, 0); // station 0 might stop all
        } else if (action.toLowerCase() === 'status') {
          // Get device status with enhanced preset progress tracking
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id) {
            return createResponse(400, {
              error: 'Missing device_id in request body',
            });
          }

          const { device_id } = requestBody;
          const deviceData = await bhyve.listDevices();
          const device = deviceData.devices.find(d => d.id === device_id);
          
          if (!device) {
            return createResponse(400, {
              error: 'Device not found',
            });
          }

          // Analyze current watering status and program progress
          const wateringStatus = device.status?.watering_status;
          const currentStation = wateringStatus?.current_station;
          const isWatering = wateringStatus?.status === 'watering' || wateringStatus?.status === 'watering_in_progress';
          const stations = wateringStatus?.stations || [];
          
          // Also check zone-level watering status for more accurate detection
          const wateringZones = device.zones?.filter((zone: any) => zone.is_watering || zone.watering_time > 0) || [];
          const hasActiveZones = wateringZones.length > 0;
          
          console.log('[Bhyve] Device watering status:', JSON.stringify(wateringStatus, null, 2));
          console.log('[Bhyve] Detected stations:', stations);
          console.log('[Bhyve] Is watering:', isWatering);
          console.log('[Bhyve] Current station:', currentStation);
          console.log('[Bhyve] Watering zones:', wateringZones);
          console.log('[Bhyve] Has active zones:', hasActiveZones);
          
          // Enhanced preset progress information
          let presetProgress = null;
          
          // Check for preset patterns: multi-zone programs OR specific flower zones active
          const flowerPresetStations = [2, 3]; // Based on your preset configuration
          const isMultiZoneProgram = stations.length > 1;
          const isFlowerZoneActive = wateringZones.some((zone: any) => flowerPresetStations.includes(zone.station));
          const isFlowerPreset = isMultiZoneProgram && stations.some((s: any) => flowerPresetStations.includes(s.station));
          
          console.log('[Bhyve] Multi-zone program:', isMultiZoneProgram);
          console.log('[Bhyve] Flower zone active:', isFlowerZoneActive);
          console.log('[Bhyve] Is flower preset:', isFlowerPreset);
          
          if (isFlowerPreset || (isFlowerZoneActive && hasActiveZones)) {
            console.log('[Bhyve] Flower preset detected with enhanced logic');
            
            // Use stations array if available (multi-zone program), otherwise build from active zones
            const programStations = isMultiZoneProgram ? stations : 
              wateringZones.filter((zone: any) => flowerPresetStations.includes(zone.station))
                .map((zone: any) => ({ station: zone.station, run_time: zone.watering_time || 0 }));
            
            const totalStations = programStations.length;
            let currentStationIndex = -1;
            let completedStations = 0;
            let activeStation = currentStation;
            
            // If no current station from watering status, check zone-level status
            if (!activeStation && hasActiveZones) {
              const activeZone = wateringZones.find((zone: any) => zone.is_watering);
              activeStation = activeZone?.station;
            }
            
            console.log('[Bhyve] Program stations:', programStations);
            console.log('[Bhyve] Active station:', activeStation);
            
            // Find current station index in the sequence
            if (activeStation && (isWatering || hasActiveZones)) {
              currentStationIndex = programStations.findIndex((s: any) => s.station === activeStation);
              completedStations = Math.max(0, currentStationIndex); // Don't count current station as completed yet
            } else if (!isWatering && !hasActiveZones && programStations.length > 0) {
              // If not watering, all stations are complete
              completedStations = totalStations;
              currentStationIndex = totalStations - 1;
            }
            
            console.log('[Bhyve] Preset progress calculation:', {
              totalStations,
              currentStationIndex,
              completedStations,
              activeStation,
              isWatering,
              hasActiveZones
            });
            
            // Calculate more granular progress including within-station progress
            let overallProgress = 0;
            if (totalStations > 0) {
              // Base progress from completed stations
              const completedStationProgress = (completedStations / totalStations) * 100;
              
              // Add progress within current station if we have timing information
              let currentStationProgress = 0;
              if (currentStationIndex >= 0 && (isWatering || hasActiveZones)) {
                const currentStationData = programStations[currentStationIndex];
                const totalTimeForStation = currentStationData?.run_time * 60; // Convert minutes to seconds
                let remainingTime = wateringStatus?.current_time_remaining_sec || 
                                  (hasActiveZones ? wateringZones.find((z: any) => z.is_watering)?.remaining_time : 0);
                
                // If Bhyve isn't updating the remaining time (common issue), calculate from start time
                const startTimeStr = (wateringStatus as any)?.started_watering_station_at;
                if (startTimeStr && remainingTime === totalTimeForStation) {
                  // Time remaining is unchanged, calculate elapsed time from start timestamp
                  const startTime = new Date(startTimeStr).getTime();
                  const currentTime = Date.now();
                  const elapsedTimeMs = currentTime - startTime;
                  const elapsedTimeSeconds = Math.floor(elapsedTimeMs / 1000);
                  
                  // Update remaining time based on elapsed time
                  remainingTime = Math.max(0, totalTimeForStation - elapsedTimeSeconds);
                  
                  console.log('[Bhyve] Calculated elapsed time from start timestamp:', {
                    startTimeStr,
                    startTime,
                    currentTime,
                    elapsedTimeMs,
                    elapsedTimeSeconds,
                    calculatedRemainingTime: remainingTime
                  });
                }
                
                if (totalTimeForStation && remainingTime !== undefined) {
                  const elapsedTime = totalTimeForStation - remainingTime;
                  const stationProgressPercent = Math.max(0, Math.min(100, (elapsedTime / totalTimeForStation) * 100));
                  // Current station contributes 1/totalStations of the total progress
                  currentStationProgress = (stationProgressPercent / totalStations);
                  
                  console.log('[Bhyve] Current station progress details:', {
                    totalTimeForStation,
                    remainingTime,
                    elapsedTime,
                    stationProgressPercent,
                    currentStationProgress
                  });
                }
              }
              
              overallProgress = Math.round(completedStationProgress + currentStationProgress);
              console.log('[Bhyve] Progress calculation:', {
                completedStationProgress,
                currentStationProgress,
                overallProgress
              });
            }
            
            presetProgress = {
              isActive: isWatering || hasActiveZones || programStations.length > 0, // Consider active if we have stations or active zones
              type: 'flowers',
              totalStations,
              completedStations,
              currentStation: activeStation,
              currentStationIndex,
              progress: overallProgress,
              timeRemaining: wateringStatus?.current_time_remaining_sec || 
                           (hasActiveZones ? wateringZones.find((z: any) => z.is_watering)?.remaining_time : undefined),
              stations: programStations.map((s: any, index: number) => ({
                station: s.station,
                duration: s.run_time,
                status: index < completedStations ? 'completed' : 
                       (index === currentStationIndex && (isWatering || hasActiveZones)) ? 'running' : 'pending'
              }))
            };
            
            console.log('[Bhyve] Generated preset progress:', JSON.stringify(presetProgress, null, 2));
          } else {
            console.log('[Bhyve] No flower preset detected. Multi-zone:', isMultiZoneProgram, 'Flower zones active:', isFlowerZoneActive);
          }
          
          response = {
            success: true,
            device_status: device.status,
            zones: device.zones,
            watering_status: {
              isWatering,
              currentStation,
              timeRemaining: wateringStatus?.current_time_remaining_sec,
              stations
            },
            preset_progress: presetProgress
          };
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for presets under Bhyve provider`,
          });
        }
      } else {
        console.log('Unknown deviceType for Bhyve:', deviceType);
        return createResponse(400, {
          error: `Unknown device type '${deviceType}' for Bhyve provider`,
        });
      }
    }

    // Handle Seam Smart Lock Provider
    else if (provider.toLowerCase() === 'seam') {
      if (deviceType.toLowerCase() === 'devices') {
        if (action.toLowerCase() === 'list') {
          // List all Seam devices
          response = await seam.listDevices();
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for devices under Seam provider`,
          });
        }
      } else if (deviceType.toLowerCase() === 'locks') {
        if (action.toLowerCase() === 'control') {
          // Control lock (lock/unlock)
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (
            !requestBody || 
            !requestBody.device_id || 
            !requestBody.action
          ) {
            return createResponse(400, {
              error: 'Missing device_id or action in request body',
            });
          }

          const { device_id, action: lockAction } = requestBody;
          
          if (lockAction.toLowerCase() === 'lock') {
            response = await seam.lockDevice(device_id);
          } else if (lockAction.toLowerCase() === 'unlock') {
            response = await seam.unlockDevice(device_id);
          } else {
            return createResponse(400, {
              error: `Unknown lock action '${lockAction}'. Use 'lock' or 'unlock'`,
            });
          }
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for locks under Seam provider`,
          });
        }
      } else if (deviceType.toLowerCase() === 'access-codes') {
        if (action.toLowerCase() === 'list') {
          // List access codes for a device
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id) {
            return createResponse(400, {
              error: 'Missing device_id in request body',
            });
          }

          const { device_id } = requestBody;
          response = await seam.getAccessCodes(device_id);
        } else if (action.toLowerCase() === 'create') {
          // Create new access code
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.device_id || !requestBody.code) {
            return createResponse(400, {
              error: 'Missing device_id or code in request body',
            });
          }

          const { device_id, code, name } = requestBody;
          response = await seam.createAccessCode(device_id, code, name);
        } else if (action.toLowerCase() === 'delete') {
          // Delete access code
          const requestBody = event.body ? JSON.parse(event.body) : null;

          if (!requestBody || !requestBody.access_code_id) {
            return createResponse(400, {
              error: 'Missing access_code_id in request body',
            });
          }

          const { access_code_id } = requestBody;
          response = await seam.deleteAccessCode(access_code_id);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for access-codes under Seam provider`,
          });
        }
      } else if (deviceType.toLowerCase() === 'events') {
        if (action.toLowerCase() === 'list') {
          // List events for a device or all devices
          const requestBody = event.body ? JSON.parse(event.body) : null;
          const device_id = requestBody?.device_id;
          const limit = requestBody?.limit || 50;
          const since = requestBody?.since;
          
          response = await seam.getEvents(device_id, limit, since);
        } else {
          return createResponse(400, {
            error: `Unknown action '${action}' for events under Seam provider`,
          });
        }
      } else {
        return createResponse(400, {
          error: `Unknown device type '${deviceType}' for Seam provider`,
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
