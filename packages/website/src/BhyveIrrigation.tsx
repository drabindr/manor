import React, { useState, useEffect, useCallback, useRef } from 'react';
import OptimizedImage from "./components/OptimizedImage";

// Enhanced haptic feedback helper
const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate([50, 25, 50]);
        break;
      case 'heavy':
        navigator.vibrate([100, 50, 100]);
        break;
    }
  }
};

interface BhyveZone {
  station: number;
  name: string;
  smart_watering_enabled: boolean;
  sprinkler_type: string;
}

interface BhyveDevice {
  id: string;
  mac_address: string;
  name: string;
  type: string;
  last_connected_at: string;
  status: {
    run_mode: string;
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
    next_start_programs?: Array<{
      program: string;
      next_start_time: string;
    }>;
  };
  zones: BhyveZone[];
}

interface WateringStatus {
  deviceId: string;
  isWatering: boolean;
  currentStation?: number;
  timeRemaining?: number;
  status: string;
}

interface ZoneCardProps {
  zone: BhyveZone;
  deviceId: string;
  isWatering: boolean;
  timeRemaining?: number;
  durations: number[];
  idealDuration: number;
  icon: string;
  isDeviceWatering: boolean;
  activeRequests: Set<string>;
  startWatering: (deviceId: string, station: number, duration: number) => void;
  stopWatering: (deviceId: string, station: number) => void;
  formatTimeRemaining: (seconds: number) => string;
  flowerPresetInfo?: {
    isInPreset: boolean;
    isCurrentZone: boolean;
    isNextZone: boolean;
    hasFinished: boolean;
  };
}

// Zone Card Component - Consistent with room tile design
const ZoneCard: React.FC<ZoneCardProps> = ({
  zone,
  deviceId,
  isWatering,
  timeRemaining,
  durations,
  idealDuration,
  icon,
  isDeviceWatering,
  activeRequests,
  startWatering,
  stopWatering,
  formatTimeRemaining,
  flowerPresetInfo
}) => {
  const [selectedDuration, setSelectedDuration] = useState(idealDuration);
  const [localTime, setLocalTime] = useState<number | undefined>(timeRemaining);
  const [originalDuration, setOriginalDuration] = useState<number | undefined>(undefined);
  const intervalRef = useRef<number | null>(null);

  // Start local countdown when watering - sync with server time more frequently
  useEffect(() => {
    if (isWatering) {
      // Always sync with server time for better accuracy - don't restrict updates
      if (timeRemaining !== undefined) {
        console.log(`[Bhyve] Syncing timer for zone ${zone.station}: ${timeRemaining} seconds (local: ${localTime})`);
        setLocalTime(timeRemaining);
        // Set original duration when watering starts if we don't have it
        if (originalDuration === undefined && timeRemaining > 0) {
          const startDuration = Math.max(timeRemaining, 60); // Assume at least 1 minute for progress bar
          setOriginalDuration(startDuration);
          console.log(`[Bhyve] Set original duration for zone ${zone.station}: ${startDuration} seconds`);
        }
      }
      
      // Start timer if not already running
      if (!intervalRef.current) {
        console.log(`[Bhyve] Starting countdown timer for zone ${zone.station}`);
        intervalRef.current = setInterval(() => {
          setLocalTime((prev) => {
            if (prev !== undefined && prev <= 0) {
              // Stop timer when it reaches zero
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
              }
              return 0; // Don't go negative
            }
            return prev !== undefined ? prev - 1 : 0;
          });
        }, 1000);
      }
    } else {
      // Not watering - clear timer and sync with backend time
      if (intervalRef.current) {
        console.log(`[Bhyve] Stopping countdown timer for zone ${zone.station}`);
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setLocalTime(timeRemaining);
      setOriginalDuration(undefined); // Clear original duration when not watering
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isWatering, timeRemaining, zone.station]); // Removed originalDuration from deps to prevent loops

  return (
    <div className={`device-widget-small ${isWatering ? 'device-widget-small-active' : ''} ${flowerPresetInfo?.isInPreset ? 'border border-pink-500/30' : ''} p-2`}>
      {/* Zone Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          <span className="text-sm filter drop-shadow-sm">{icon}</span>
          <div className="min-w-0 flex-1">
            <h4 className="text-gray-200 font-medium text-xs truncate">
              {zone.name}
              {flowerPresetInfo?.isInPreset && (
                <span className="ml-1 text-pink-400">🌸</span>
              )}
            </h4>
            <p className="text-xs text-gray-400 opacity-75">
              Zone {zone.station}
              {flowerPresetInfo?.isNextZone && (
                <span className="ml-1 text-yellow-400">• Next</span>
              )}
              {flowerPresetInfo?.hasFinished && (
                <span className="ml-1 text-green-400">• Done</span>
              )}
            </p>
          </div>
        </div>
        {isWatering && (
          <div className="text-right flex-shrink-0">
            <div className={`font-medium text-xs ${localTime !== undefined && localTime <= 0 ? 'text-green-300' : 'text-blue-300'}`}>
              {localTime !== undefined ? (localTime <= 0 ? 'Finished' : formatTimeRemaining(localTime)) : 'Loading...'}
            </div>
            {originalDuration !== undefined && localTime !== undefined && (
              <div className="text-xs text-gray-500 opacity-75">
                {Math.round(((originalDuration - localTime) / originalDuration) * 100)}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      {isWatering ? (
        <div className="space-y-1.5">
          {/* Stop button when watering with progress bar */}
          <button
            onClick={() => {
              triggerHaptic('heavy');
              stopWatering(deviceId, zone.station);
            }}
            disabled={activeRequests.has(`${deviceId}-${zone.station}-stop`)}
            className="w-full px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-xs rounded transition-colors touch-manipulation font-medium relative overflow-hidden"
          >
            {/* Progress bar background */}
            <div 
              className="absolute inset-0 bg-red-800/40 transition-all duration-1000 ease-linear"
              style={{
                width: localTime !== undefined && originalDuration !== undefined && originalDuration > 0
                  ? `${Math.max(0, Math.min(100, ((originalDuration - localTime) / originalDuration) * 100))}%`
                  : '0%'
              }}
            />
            {/* Button text */}
            <span className="relative z-10 drop-shadow-sm">
              {activeRequests.has(`${deviceId}-${zone.station}-stop`) ? (
                <span className="flex items-center justify-center">
                  <span className="loader mr-1 w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Stopping...
                </span>
              ) : (
                `Stop (${localTime !== undefined ? formatTimeRemaining(localTime) : ''})`
              )}
            </span>
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Single Duration Dropdown with Start Button */}
          <div className="flex items-center space-x-1.5">
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(Number(e.target.value))}
              className="flex-1 px-2 py-1 bg-gray-800/60 border border-gray-700/50 rounded text-xs text-white focus:border-blue-500 focus:outline-none min-h-[32px] touch-manipulation"
            >
              {durations.map((duration) => (
                <option key={duration} value={duration}>
                  {duration}m
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                triggerHaptic('medium');
                startWatering(deviceId, zone.station, selectedDuration);
              }}
              disabled={activeRequests.has(`${deviceId}-${zone.station}-start`) || isDeviceWatering}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-xs rounded transition-colors touch-manipulation font-medium min-h-[32px] min-w-[44px]"
            >
              Start
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const BhyveIrrigation: React.FC = () => {
  const [devices, setDevices] = useState<BhyveDevice[]>([]);
  const [status, setStatus] = useState<Record<string, WateringStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRequests, setActiveRequests] = useState<Set<string>>(new Set());
  const [delayLoading, setDelayLoading] = useState<Record<string, boolean>>({});
  const [isWidgetVisible, setIsWidgetVisible] = useState(false);
  const [isUserActive, setIsUserActive] = useState(true);
  const [lastWateringAction, setLastWateringAction] = useState<number>(0);
  const [activePresetSchedules, setActivePresetSchedules] = useState<Record<string, any>>({});
  
  const widgetRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimeoutRef = useRef<number | null>(null);
  const lastWateringActionRef = useRef<number>(0);
  const hasInitializedRef = useRef<boolean>(false);
  const loadDevicesRef = useRef<typeof loadDevices>();
  
  // Refs for state variables accessed in loadDevices to avoid dependencies
  const statusRef = useRef<Record<string, WateringStatus>>({});
  const activePresetSchedulesRef = useRef<Record<string, any>>({});

  const API_BASE = "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod";

  // Time-based priorities - Updated to include noon time
  const getTimeBasedPriority = () => {
    const hour = new Date().getHours();
    
    if (hour >= 6 && hour < 11) {
      // Morning: prioritize irrigation
      return { priority: 'high', timeContext: 'morning', emoji: '🌅' };
    } else if (hour >= 11 && hour < 14) {
      // Around noon: good time for watering (avoid extreme midday heat but still good timing)
      return { priority: 'high', timeContext: 'noon', emoji: '☀️' };
    } else if (hour >= 17 && hour < 20) {
      // Evening: prioritize irrigation  
      return { priority: 'high', timeContext: 'evening', emoji: '🌆' };
    } else {
      return { priority: 'normal', timeContext: 'day', emoji: '🏠' };
    }
  };

  const { priority: timePriority, timeContext, emoji: timeEmoji } = getTimeBasedPriority();

  // Enhanced zone icon selection based on zone name/type
  const getZoneIcon = (zoneName: string, isWatering: boolean = false) => {
    const lowerName = zoneName.toLowerCase();
    
    if (isWatering) {
      return '🚿'; // Always use shower when actively watering
    }
    
    // More varied and contextually appropriate icon selection
    if (lowerName.includes('flower') || lowerName.includes('bed') || lowerName.includes('garden')) {
      return '🌸'; // Flower/garden areas
    } else if (lowerName.includes('front') && (lowerName.includes('yard') || lowerName.includes('lawn'))) {
      return '🏡'; // Front yard/lawn
    } else if (lowerName.includes('back') && (lowerName.includes('yard') || lowerName.includes('lawn'))) {
      return '🌳'; // Back yard
    } else if (lowerName.includes('side') || lowerName.includes('strip')) {
      return '🌿'; // Side areas/strips
    } else if (lowerName.includes('tree') || lowerName.includes('shrub') || lowerName.includes('bush')) {
      return '🌲'; // Trees/shrubs
    } else if (lowerName.includes('vegetable') || lowerName.includes('herb') || lowerName.includes('tomato') || lowerName.includes('pepper')) {
      return '🥬'; // Vegetable/herb gardens
    } else if (lowerName.includes('pot') || lowerName.includes('planter') || lowerName.includes('container')) {
      return '🪴'; // Potted plants
    } else if (lowerName.includes('rose') || lowerName.includes('orchid') || lowerName.includes('lily')) {
      return '🌹'; // Specific flower types
    } else if (lowerName.includes('grass') || lowerName.includes('lawn') || lowerName.includes('turf')) {
      return '🌱'; // Grass/lawn areas
    } else if (lowerName.includes('drip') || lowerName.includes('micro')) {
      return '💧'; // Drip irrigation systems
    } else if (lowerName.includes('sprinkler') || lowerName.includes('spray')) {
      return '🌊'; // Sprinkler systems
    } else {
      return '💧'; // Default water drop for generic zones
    }
  };

  // Zone duration presets based on zone type with ideal duration
  const getZoneDurations = (zoneName: string) => {
    const lowerName = zoneName.toLowerCase();
    
    if (lowerName.includes('flower') || lowerName.includes('bed') || lowerName.includes('pot')) {
      return { durations: [1, 3, 5, 8], ideal: 3 }; // Flower beds need shorter durations
    } else if (lowerName.includes('front') || lowerName.includes('back') || lowerName.includes('yard') || lowerName.includes('lawn')) {
      return { durations: [10, 15, 30, 45], ideal: 15 }; // Lawn areas need longer durations
    } else if (lowerName.includes('tree') || lowerName.includes('shrub')) {
      return { durations: [20, 30, 60, 90], ideal: 30 }; // Trees need deep watering
    } else {
      return { durations: [1, 5, 15, 30], ideal: 5 }; // Default moderate durations
    }
  };

  const makeRequest = useCallback(async (endpoint: string, method = 'GET', body?: any) => {
    try {
      const fullUrl = `${API_BASE}/${endpoint}`;
      console.log(`[Bhyve] Making ${method} request to: ${fullUrl}`);
      
      const headers: Record<string, string> = {};
      if (body) {
        headers['Content-Type'] = 'application/json';
      }
      
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Bhyve] Request failed with status ${response.status}:`, errorText);
        throw new Error(`Request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`[Bhyve] API request failed: ${endpoint}`, error);
      throw error;
    }
  }, [API_BASE]);

  const loadDevices = useCallback(async () => {
    try {
      if (!hasInitializedRef.current) {
        console.log('[Bhyve] Initializing Bhyve irrigation system');
        setIsLoading(true);
        setError(null);
      }
      
      const data = await makeRequest('bhyve/devices/list');
      setDevices(data.devices || []);
      
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
      }
      
      // Extract status from the devices data itself - check both device-level and zone-level status
      const deviceStatuses: { [deviceId: string]: any } = {};
      
      for (const device of data.devices || []) {
        // Check if any zone is currently watering
        const wateringZone = device.zones?.find((zone: any) => zone.is_watering);
        const deviceWateringStatus = device.status['watering-status'] || device.status.watering_status;
        
        let isWatering = false;
        let currentStation: number | undefined;
        let timeRemaining: number | undefined;
        let deviceStatus = 'idle';
        
        // First, check if this device has active preset schedule data (more reliable)
        const presetKey = `${device.id}_flowers`;
        const activePreset = activePresetSchedulesRef.current[presetKey];
        if (activePreset && activePreset.backendProgress && activePreset.backendProgress.isActive) {
          // Use backend preset data for more accurate status during preset schedules
          isWatering = true;
          currentStation = activePreset.backendProgress.currentStation;
          timeRemaining = activePreset.backendProgress.timeRemaining;
          deviceStatus = 'watering';
          console.log(`[Bhyve] Using preset data for device ${device.id}: station ${currentStation}, time: ${timeRemaining}`);
        } else if (wateringZone) {
          // Zone-level status (fallback)
          isWatering = true;
          currentStation = wateringZone.station;
          // Use remaining_time if watering_time is 0 or undefined
          timeRemaining = wateringZone.watering_time > 0 ? wateringZone.watering_time : wateringZone.remaining_time;
          deviceStatus = 'watering';
          console.log(`[Bhyve] Zone ${wateringZone.station} is watering, watering_time: ${wateringZone.watering_time}, remaining_time: ${wateringZone.remaining_time}`);
        } else if (deviceWateringStatus && (deviceWateringStatus.status === 'watering' || deviceWateringStatus.status === 'watering_in_progress')) {
          // Device-level status as final fallback
          isWatering = true;
          currentStation = deviceWateringStatus.current_station;
          timeRemaining = deviceWateringStatus.current_time_remaining_sec;
          deviceStatus = 'watering';
          console.log(`[Bhyve] Device-level watering status: station ${currentStation}, time: ${timeRemaining}`);
        }
        
        deviceStatuses[device.id] = {
          deviceId: device.id,
          isWatering,
          currentStation,
          timeRemaining,
          status: deviceStatus,
          lastUpdated: Date.now()
        };
      }        // Simple status update without complex grace period logic
        setStatus(prev => {
          const updated = { ...prev };
          
          for (const deviceId in deviceStatuses) {
            const newStatus = deviceStatuses[deviceId];
            console.log(`[Bhyve] Device ${deviceId} status:`, newStatus);
            updated[deviceId] = newStatus as WateringStatus;
          }
          
          return updated;
        });
    } catch (error) {
      console.error('Failed to load Bhyve devices:', error);
      setError('Failed to load irrigation devices');
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
      }
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest]); // Keep simple dependency to prevent constant reloading

  // Update ref when loadDevices function changes
  useEffect(() => {
    loadDevicesRef.current = loadDevices;
  }, [loadDevices]);

  // Keep refs in sync with state - simplified
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    activePresetSchedulesRef.current = activePresetSchedules;
  }, [activePresetSchedules]);

  // Enhanced status tracking with immediate updates for better user feedback
  const updateImmediateStatus = useCallback((deviceId: string, action: 'start' | 'stop', station?: number, duration?: number) => {
    setStatus(prev => {
      const updated = { ...prev };
      
      if (action === 'start' && station && duration) {
        updated[deviceId] = {
          deviceId,
          isWatering: true,
          currentStation: station,
          timeRemaining: duration * 60, // Convert minutes to seconds
          originalDuration: duration * 60, // Store original duration in seconds
          status: 'watering',
          lastUpdated: Date.now()
        } as WateringStatus & { lastUpdated: number };
      } else if (action === 'stop') {
        updated[deviceId] = {
          deviceId,
          isWatering: false,
          currentStation: undefined,
          timeRemaining: undefined,
          originalDuration: undefined, // Clear original duration when stopping
          status: 'idle',
          lastUpdated: Date.now()
        } as WateringStatus & { lastUpdated: number };
      }
      
      return updated;
    });
  }, []);

  const startWatering = useCallback(async (deviceId: string, station: number, duration: number) => {
    const requestKey = `${deviceId}-${station}-start`;
    
    if (activeRequests.has(requestKey)) return;
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('medium');
      
      // Immediate status update for better UX
      updateImmediateStatus(deviceId, 'start', station, duration);
      
      // Track watering action to pause polling temporarily
      const actionTime = Date.now();
      setLastWateringAction(actionTime);
      lastWateringActionRef.current = actionTime;
      
      await makeRequest('bhyve/zones/start', 'POST', {
        device_id: deviceId, 
        station: station, 
        time: duration
      });
      
      // Don't force immediate refresh - let grace period and regular polling handle sync
      console.log('[Bhyve] Start command completed - relying on grace period and polling for status sync');
      
    } catch (error) {
      console.error('Failed to start watering:', error);
      triggerHaptic('heavy');
      // Revert immediate status update on error
      updateImmediateStatus(deviceId, 'stop');
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [makeRequest, activeRequests, updateImmediateStatus]); // Removed loadDevices from dependencies

  const stopZoneWatering = useCallback(async (deviceId: string, station: number) => {
    const requestKey = `${deviceId}-${station}-stop`;
    
    if (activeRequests.has(requestKey)) {
      console.log(`[Bhyve] Stop request already in progress for ${deviceId}-${station}`);
      return;
    }
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('heavy');
      console.log(`[Bhyve] Stopping watering for device ${deviceId}, station ${station}`);
      
      // Immediate status update for better UX
      updateImmediateStatus(deviceId, 'stop');
      
      // Track watering action to pause polling temporarily
      const actionTime = Date.now();
      setLastWateringAction(actionTime);
      lastWateringActionRef.current = actionTime;
      
      await makeRequest('bhyve/zones/stop', 'POST', {
        device_id: deviceId,
        station: station
      });
      
      console.log('[Bhyve] Stop command completed - relying on regular polling for sync');
      
    } catch (error) {
      console.error('Failed to stop zone watering:', error);
      triggerHaptic('heavy');
      // No need to revert since stop is generally safe and immediate update is reasonable
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [makeRequest, activeRequests, updateImmediateStatus]);

  const stopWatering = useCallback(async (deviceId: string) => {
    const requestKey = `${deviceId}-stop`;
    
    if (activeRequests.has(requestKey)) return;
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('heavy');
      
      // For device-level stop, find the currently running station and stop it
      const deviceStatus = status[deviceId];
      if (deviceStatus?.currentStation) {
        console.log(`[Bhyve] Stopping device ${deviceId}, station ${deviceStatus.currentStation}`);
        
        // Use the zone-specific stop function for consistency
        await stopZoneWatering(deviceId, deviceStatus.currentStation);
      } else {
        console.log(`[Bhyve] No active station found for device ${deviceId}`);
      }
      
    } catch (error) {
      console.error('Failed to stop watering:', error);
      triggerHaptic('heavy');
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [activeRequests, status, stopZoneWatering]);

  const setRainDelay = useCallback(async (deviceId: string, hours: number) => {
    const requestKey = `${deviceId}-rain-${hours}`;
    
    if (activeRequests.has(requestKey)) return;
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('light');
      
      if (hours === 0) {
        // Cancel rain delay
        await makeRequest('bhyve/rain-delay/cancel', 'POST', {
          device_id: deviceId
        });
      } else {
        // Set rain delay
        await makeRequest('bhyve/rain-delay/set', 'POST', {
          device_id: deviceId,
          hours: hours
        });
      }
      
      // Refresh device list
      setTimeout(() => {
        loadDevicesRef.current?.();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to set rain delay:', error);
      triggerHaptic('heavy');
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [makeRequest, activeRequests]); // Removed loadDevices from dependencies

  // Feedback for rain delay
  const handleSetRainDelay = useCallback(async (id: string, delay: number) => {
    setDelayLoading(prev => ({ ...prev, [id]: true }));
    try {
      await setRainDelay(id, delay);
    } finally {
      setTimeout(() => setDelayLoading(prev => ({ ...prev, [id]: false })), 800); // show spinner briefly
    }
  }, [setRainDelay]);

  // Function to load preset schedules for a device with enhanced progress tracking
  const loadPresetSchedules = useCallback(async (deviceId: string) => {
    try {
      const response = await makeRequest('bhyve/presets/status', 'POST', {
        device_id: deviceId
      });
      
      console.log(`[Bhyve] Preset status response for ${deviceId}:`, response);
      
      if (response.success) {
        if (response.preset_progress && response.preset_progress.isActive) {
          // Use enhanced backend progress tracking
          const progress = response.preset_progress;
          setActivePresetSchedules(prev => {
            const updated = { ...prev };
            const key = `${deviceId}_${progress.type}`;
            
            updated[key] = {
              deviceId,
              presetType: progress.type,
              currentStepIndex: progress.currentStationIndex >= 0 ? progress.currentStationIndex : 0,
              totalSteps: progress.totalStations,
              timeRemaining: progress.timeRemaining || 0,
              isActive: true,
              isStarting: false, // Clear starting flag when real data comes in
              lastUpdated: Date.now(),
              backendProgress: progress,
              stations: progress.stations || []
            };
            
            console.log(`[Bhyve] Updated active preset for ${deviceId}:`, updated[key]);
            return updated;
          });
        } else {
          // No active preset schedules or preset_progress is null
          console.log(`[Bhyve] No active preset for ${deviceId}, clearing schedules`);
          setActivePresetSchedules(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(key => {
              if (key.startsWith(deviceId + '_')) {
                console.log(`[Bhyve] Removing preset schedule: ${key}`);
                delete updated[key];
              }
            });
            return updated;
          });
        }
      } else {
        console.log(`[Bhyve] Preset status request failed for ${deviceId}:`, response);
        // Clear schedules on failed response
        setActivePresetSchedules(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(key => {
            if (key.startsWith(deviceId + '_')) {
              delete updated[key];
            }
          });
          return updated;
        });
      }
    } catch (error) {
      console.error('Failed to load preset schedules:', error);
      // Clear schedules on error
      setActivePresetSchedules(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (key.startsWith(deviceId + '_')) {
            delete updated[key];
          }
        });
        return updated;
      });
    }
  }, [makeRequest]);

  const startFlowerPreset = useCallback(async (deviceId: string) => {
    const requestKey = `${deviceId}-flower-preset`;
    
    if (activeRequests.has(requestKey)) return;
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('medium');
      
      console.log('[Bhyve] Starting flower preset for device:', deviceId);
      
      // Call backend API to start the preset schedule
      const response = await makeRequest('bhyve/presets/start', 'POST', {
        device_id: deviceId,
        preset_name: 'Flowers'
      });
      
      console.log('[Bhyve] Preset start response:', response);
      
      // Track watering action to pause polling temporarily
      const actionTime = Date.now();
      setLastWateringAction(actionTime);
      lastWateringActionRef.current = actionTime;
      
      // Immediate status check after starting (simple approach)
      setTimeout(() => {
        loadDevicesRef.current?.();
      }, 2000); // Simple 2-second delay to let the command take effect
      
      console.log('[Bhyve] Flower preset started successfully');
      
    } catch (error) {
      console.error('Failed to start flower preset:', error);
      triggerHaptic('heavy');
      
      // Clear the starting state on error
      setActivePresetSchedules(prev => {
        const updated = { ...prev };
        const key = `${deviceId}_flowers`;
        delete updated[key];
        return updated;
      });
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [makeRequest, activeRequests, loadPresetSchedules]);

  // Function to stop flower preset
  const stopFlowerPreset = useCallback(async (deviceId: string) => {
    const requestKey = `${deviceId}-stop-preset`;
    
    if (activeRequests.has(requestKey)) return;
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('heavy');
      
      console.log('[Bhyve] Stopping flower preset for device:', deviceId);
      
      // Call backend API to stop the preset schedule
      await makeRequest('bhyve/presets/stop', 'POST', {
        device_id: deviceId
      });
      
      // Clear local preset schedules
      setActivePresetSchedules(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (key.startsWith(deviceId + '_')) {
            delete updated[key];
          }
        });
        return updated;
      });
      
      console.log('[Bhyve] Flower preset stopped');
      
    } catch (error) {
      console.error('Failed to stop flower preset:', error);
      triggerHaptic('heavy');
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [makeRequest, activeRequests]);

  // Track user activity (mouse, touch, keyboard)
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      if (!isUserActive) {
        setIsUserActive(true);
        console.log('[Bhyve] User became active');
      }
      
      // Reset inactivity timer
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      
      // Set user as inactive after 30 seconds of no activity
      inactivityTimeoutRef.current = setTimeout(() => {
        setIsUserActive(false);
        console.log('[Bhyve] User became inactive');
      }, 30000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Initial activity check
    updateActivity();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [isUserActive]);

  // Track widget visibility using Intersection Observer
  useEffect(() => {
    if (!widgetRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasVisible = isWidgetVisible;
        const nowVisible = entry.isIntersecting && entry.intersectionRatio > 0.1; // At least 10% visible
        
        if (wasVisible !== nowVisible) {
          setIsWidgetVisible(nowVisible);
          console.log(`[Bhyve] Widget visibility changed: ${nowVisible ? 'visible' : 'hidden'}`);
        }
      },
      {
        threshold: [0, 0.1, 0.5, 1], // Multiple thresholds for better detection
        rootMargin: '50px' // Start observing 50px before widget comes into view
      }
    );

    observer.observe(widgetRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isWidgetVisible]);

  // Load preset schedules when devices change
  useEffect(() => {
    if (devices.length > 0) {
      // Load preset schedules for all devices
      devices.forEach(device => {
        loadPresetSchedules(device.id);
      });
    }
  }, [devices, loadPresetSchedules]);

  // Initial load when component mounts - only once
  useEffect(() => {
    if (!hasInitializedRef.current) {
      console.log('[Bhyve] Initial load of devices');
      loadDevices();
    }
  }, []); // Empty dependency array to run only once

  // Simplified polling: only when widget is visible AND user is active
  useEffect(() => {
    let intervalId: number;
    
    const shouldPoll = isWidgetVisible && isUserActive && document.visibilityState === 'visible';
    const hasActivePresetSchedules = Object.keys(activePresetSchedules).length > 0;
    
    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      
      if (shouldPoll) {
        console.log('[Bhyve] Starting polling - widget visible and user active');
        
        // Determine polling frequency based on activity
        const statusValues = Object.keys(status).map(key => status[key]);
        const hasActiveWatering = statusValues.some((s: WateringStatus) => s.isWatering);
        // More frequent polling during preset schedules for better transition detection
        const pollInterval = (hasActiveWatering || hasActivePresetSchedules) ? 3000 : 15000; // 3s if active, 15s if idle
        
        intervalId = setInterval(() => {
          // Simple polling delay to avoid conflicts with user actions
          const timeSinceAction = Date.now() - lastWateringActionRef.current;
          if (timeSinceAction < 2000) { // Reduced to 2 seconds for faster preset transitions
            console.log(`[Bhyve] Skipping poll - recent watering action ${Math.round(timeSinceAction/1000)}s ago`);
            return;
          }
          
          if (isWidgetVisible && isUserActive && document.visibilityState === 'visible') {
            console.log('[Bhyve] Polling - refreshing device status');
            loadDevicesRef.current?.();
            
            // Also refresh preset schedules if we have active ones
            if (hasActivePresetSchedules) {
              Object.keys(activePresetSchedules).forEach(presetKey => {
                const deviceId = presetKey.split('_')[0]; // Extract device ID from key like "device123_flowers"
                loadPresetSchedules(deviceId);
              });
            }
          }
        }, pollInterval);
      } else {
        console.log('[Bhyve] Stopping polling - widget not visible or user inactive');
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isWidgetVisible && isUserActive) {
        console.log('[Bhyve] Page became visible with active widget - starting polling');
        loadDevicesRef.current?.(); // Immediate refresh when page becomes visible
        startPolling();
      } else {
        console.log('[Bhyve] Page hidden or widget not active - stopping polling');
        if (intervalId) clearInterval(intervalId);
      }
    };
    
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isWidgetVisible, isUserActive, activePresetSchedules, status]); // Include dependencies for polling frequency

  const formatTimeRemaining = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const getStatusColor = (deviceStatus?: WateringStatus) => {
    if (!deviceStatus) return 'text-gray-400';
    
    if (deviceStatus.isWatering) {
      return 'text-blue-400';
    } else if (deviceStatus.status === 'idle') {
      return 'text-green-400';
    } else {
      return 'text-yellow-400';
    }
  };

  const getStatusIcon = (deviceStatus?: WateringStatus) => {
    if (!deviceStatus) return '💧';
    
    if (deviceStatus.isWatering) {
      return '🚿';
    } else if (deviceStatus.status === 'idle') {
      return '💧';
    } else {
      return '⏸️';
    }
  };

  // Don't render anything until we've at least tried to initialize
  if (!hasInitializedRef.current) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="device-widget p-6 my-2">
        <div className="animate-pulse flex flex-col items-center justify-center h-32">
          <div className="text-4xl mb-3">💧</div>
          <p className="text-blue-300 font-medium text-lg mb-2">Loading irrigation system</p>
          <p className="text-blue-400 text-sm">Connecting to Bhyve...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-widget p-6 my-2 border-red-800/40">
        <div className="flex flex-col items-center justify-center h-32">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-300 font-medium text-lg mb-2">Irrigation Error</p>
          <p className="text-red-400 text-sm text-center">{error}</p>
          <button
            onClick={loadDevices}
            className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors touch-manipulation"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="device-widget p-6 my-2">
        <div className="flex flex-col items-center justify-center h-32">
          <div className="text-4xl mb-3">💧</div>
          <p className="text-gray-300 font-medium text-lg mb-2">No Irrigation Devices</p>
          <p className="text-gray-400 text-sm text-center">No Bhyve devices found</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={widgetRef} className="flex flex-col space-y-6 w-screen -ml-4 px-4">
      {devices.map((device) => {
        const deviceStatus = status[device.id];
        const isDeviceWatering = deviceStatus?.isWatering;
        const rainDelay = typeof device.status.rain_delay === 'number' ? device.status.rain_delay : (device.status.rain_delay?.delay || 0);
        const isDelayLoading = delayLoading[device.id] || false;

        return (
          <div
            key={device.id}
            className={`relative p-4 bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-xl shadow-lg overflow-hidden w-full ${timePriority === 'high' ? 'device-widget-priority' : ''}`}
          >
            {/* Glass reflective overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent h-1/3 pointer-events-none"></div>
            
            {/* Orbit Logo (Top Right) */}
            <div className="absolute top-2 right-3">
              <OptimizedImage 
                src="/orbit.svg" 
                alt="Orbit"
                className="h-12 w-auto opacity-70 filter brightness-0 invert"
                loading="lazy"
                decoding="async"
              />
            </div>

            {/* Header - Device Name and Status */}
            <div className="text-gray-200 text-base font-bold mb-4 flex items-center space-x-2">
              <span className="text-blue-400 text-xl">💧</span>
              <span>Outdoor Irrigation</span>
              {timePriority === 'high' && (
                <div className="text-blue-200 bg-blue-900/30 px-2 py-1 rounded-full border border-blue-700/30 backdrop-blur-sm shadow-sm font-bold tracking-widest text-xs">
                  AUTO
                </div>
              )}
            </div>

            {/* Activity Status - Compact status with active counter */}
            <div className="flex items-center justify-between mb-4 p-2 bg-gray-900/20 rounded-lg border border-gray-700/30">
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <span>{device.zones.filter(z => deviceStatus?.isWatering && deviceStatus.currentStation === z.station).length} active</span>
                {deviceStatus?.timeRemaining && deviceStatus.isWatering && (
                  <span>⏱️ {formatTimeRemaining(deviceStatus.timeRemaining)}</span>
                )}
              </div>
              {rainDelay > 0 && (
                <div className="text-yellow-300 text-sm">
                  Rain delayed {rainDelay}h
                </div>
              )}
            </div>

            {/* Flower Preset Control - Only show if actually part of a preset schedule */}
            {(() => {
              const presetKey = `${device.id}_flowers`;
              const activePreset = activePresetSchedules[presetKey];
              const progress = activePreset?.backendProgress?.progress || 0;
              const currentStation = activePreset?.backendProgress?.currentStation;
              const timeRemaining = activePreset?.backendProgress?.timeRemaining;
              // Only show preset controls if we have a genuine preset schedule from backend
              const hasActivePresetSchedule = activePreset && activePreset.isActive && activePreset.backendProgress && activePreset.backendProgress.isActive;
              
              return hasActivePresetSchedule ? (
                <button
                  onClick={() => stopFlowerPreset(device.id)}
                  className="w-full mb-4 px-4 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors touch-manipulation relative overflow-hidden shadow-lg"
                >
                  {/* Progress bar background */}
                  <div 
                    className="absolute inset-0 bg-red-800/40 transition-all duration-500 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                  {/* Button content */}
                  <span className="relative z-10 flex items-center justify-center">
                    � Stop Flower Preset
                    {progress > 0 && (
                      <span className="ml-2 text-xs opacity-75">
                        ({progress}%{currentStation ? ` - Zone ${currentStation}` : ''}{timeRemaining ? ` - ${formatTimeRemaining(timeRemaining)}` : ''})
                      </span>
                    )}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => startFlowerPreset(device.id)}
                  disabled={activeRequests.has(`${device.id}-flower-preset`) || isDeviceWatering}
                  className="w-full mb-4 px-4 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-800 text-white text-sm font-semibold rounded-lg transition-colors touch-manipulation flex items-center justify-center shadow-lg"
                >
                  {activeRequests.has(`${device.id}-flower-preset`) ? 
                    <span className="loader mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : 
                    '🌸'
                  } 
                  {isDeviceWatering ? 'Watering Active' : 'Start Flower Preset'}
                </button>
              );
            })()}

            {/* Rain Delay Controls - More compact, with feedback */}
            {rainDelay === 0 ? (
              <button
                onClick={() => handleSetRainDelay(device.id, 24)}
                disabled={activeRequests.has(`${device.id}-rain-24`) || isDelayLoading}
                className="w-full mb-4 px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white text-sm rounded-lg transition-colors touch-manipulation flex items-center justify-center"
              >
                {isDelayLoading ? <span className="loader mr-2 w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : '🌧️'} Set 24h Rain Delay
              </button>
            ) : (
              <button
                onClick={() => handleSetRainDelay(device.id, 0)}
                disabled={activeRequests.has(`${device.id}-rain-0`) || isDelayLoading}
                className="w-full mb-4 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-sm rounded-md transition-colors touch-manipulation flex items-center justify-center opacity-75"
              >
                {isDelayLoading ? <span className="loader mr-2 w-2 h-2 border border-gray-300 border-t-transparent rounded-full animate-spin"></span> : '☀️'} Clear Rain Delay ({rainDelay}h)
              </button>
            )}

            {/* Zones Grid - 2 per row with consistent spacing */}
            <div className="grid grid-cols-2 gap-3">
              {device.zones.map((zone) => {
                const isZoneWatering = deviceStatus?.isWatering && deviceStatus.currentStation === zone.station;
                const { durations, ideal } = getZoneDurations(zone.name);
                const zoneIcon = getZoneIcon(zone.name, isZoneWatering);
                // Pass time remaining only if this specific zone is watering
                const zoneTimeRemaining = isZoneWatering ? deviceStatus?.timeRemaining : undefined;
                
                // Calculate preset schedule info for this zone
                const presetKey = `${device.id}_flowers`;
                const activePreset = activePresetSchedules[presetKey];
                const flowerPresetInfo = activePreset?.backendProgress?.stations ? {
                  isInPreset: activePreset.backendProgress.stations.some((s: any) => s.station === zone.station),
                  isCurrentZone: activePreset.backendProgress.stations.some((s: any) => s.station === zone.station && s.status === 'running'),
                  isNextZone: activePreset.backendProgress.stations.some((s: any) => s.station === zone.station && s.status === 'pending'),
                  hasFinished: activePreset.backendProgress.stations.some((s: any) => s.station === zone.station && s.status === 'completed')
                } : undefined;

                return (
                  <ZoneCard
                    key={zone.station}
                    zone={zone}
                    deviceId={device.id}
                    isWatering={isZoneWatering}
                    timeRemaining={zoneTimeRemaining}
                    durations={durations}
                    idealDuration={ideal}
                    icon={zoneIcon}
                    isDeviceWatering={isDeviceWatering}
                    activeRequests={activeRequests}
                    startWatering={startWatering}
                    stopWatering={stopZoneWatering}
                    formatTimeRemaining={formatTimeRemaining}
                    flowerPresetInfo={flowerPresetInfo}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BhyveIrrigation;
