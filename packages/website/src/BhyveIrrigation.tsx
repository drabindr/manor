import React, { useState, useEffect, useCallback, useRef } from 'react';

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
  const intervalRef = useRef<number | null>(null);

  // Start local countdown when watering - allows negative countdown
  useEffect(() => {
    if (isWatering) {
      // Only reset localTime if we don't have a timer running or if this is a significant change
      if (!intervalRef.current || localTime === undefined || Math.abs((timeRemaining || 0) - localTime) > 5) {
        console.log(`[Bhyve] Setting timer for zone ${zone.station}: ${timeRemaining} seconds`);
        setLocalTime(timeRemaining || 0);
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
            return prev !== undefined ? prev - 1 : -1;
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
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isWatering, timeRemaining, zone.station]);

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
              {localTime !== undefined ? (localTime <= 0 ? 'Finished' : formatTimeRemaining(localTime)) : ''}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {isWatering ? (
        <div className="space-y-1.5">
          {/* Stop button when watering */}
          <button
            onClick={() => {
              triggerHaptic('heavy');
              stopWatering(deviceId, zone.station);
            }}
            disabled={activeRequests.has(`${deviceId}-${zone.station}-stop`)}
            className="w-full px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white text-xs rounded transition-colors touch-manipulation font-medium"
          >
            Stop Watering
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
  const [activeFlowerPresets, setActiveFlowerPresets] = useState<Record<string, { zones: number[], currentIndex: number, startTime: number }>>({});
  
  const widgetRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimeoutRef = useRef<number | null>(null);
  const lastWateringActionRef = useRef<number>(0);
  const hasInitializedRef = useRef<boolean>(false);
  const loadDevicesRef = useRef<typeof loadDevices>();
  const progressFlowerPresetRef = useRef<((deviceId: string) => Promise<void>) | null>(null);
  
  // Refs for state variables accessed in loadDevices to avoid dependencies
  const statusRef = useRef<Record<string, WateringStatus>>({});
  const activeFlowerPresetsRef = useRef<Record<string, { zones: number[], currentIndex: number, startTime: number }>>({});

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
        console.log('[Bhyve] Request body:', body);
      }
      
      console.log('[Bhyve] Request headers:', headers);
      
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      console.log(`[Bhyve] Response status: ${response.status}`);
      console.log(`[Bhyve] Response headers:`, response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Bhyve] Request failed with status ${response.status}:`, errorText);
        throw new Error(`Request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[Bhyve] Response data:', data);
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
        
        if (wateringZone) {
          // Zone-level status (more reliable)
          isWatering = true;
          currentStation = wateringZone.station;
          // Use remaining_time if watering_time is 0 or undefined
          timeRemaining = wateringZone.watering_time > 0 ? wateringZone.watering_time : wateringZone.remaining_time;
          deviceStatus = 'watering';
          console.log(`[Bhyve] Zone ${wateringZone.station} is watering, watering_time: ${wateringZone.watering_time}, remaining_time: ${wateringZone.remaining_time}`);
        } else if (deviceWateringStatus && (deviceWateringStatus.status === 'watering' || deviceWateringStatus.status === 'watering_in_progress')) {
          // Device-level status as fallback
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
      }
      
      // Update status with grace period logic and check for flower preset progressions
      setStatus(prev => {
        const updated = { ...prev };
        
        for (const deviceId in deviceStatuses) {
          const newStatus = deviceStatuses[deviceId];
          const existingStatus = prev[deviceId];
          const timeSinceUpdate = Date.now() - (existingStatus as any)?.lastUpdated;
          
          // Grace period logic: preserve immediate user actions for a short time
          if (existingStatus && timeSinceUpdate < 15000) { // 15 seconds grace period (reduced from 30)
            // If we just started watering but backend shows idle, preserve watering status
            if (existingStatus.isWatering && !newStatus.isWatering) {
              console.log(`[Bhyve] Preserving watering status for device ${deviceId} (grace period: ${Math.round(timeSinceUpdate/1000)}s)`);
              continue;
            }
            // If we just stopped watering but backend still shows watering, preserve stopped status
            if (!existingStatus.isWatering && newStatus.isWatering) {
              console.log(`[Bhyve] Preserving stopped status for device ${deviceId} (grace period: ${Math.round(timeSinceUpdate/1000)}s)`);
              continue;
            }
          }
          
          console.log(`[Bhyve] Device ${deviceId} status:`, newStatus);
          updated[deviceId] = newStatus as WateringStatus;
        }
        
        // Check for flower preset progressions after status update using the updated statuses
        const currentActiveFlowerPresets = activeFlowerPresetsRef.current;
        for (const deviceId in currentActiveFlowerPresets) {
          const preset = currentActiveFlowerPresets[deviceId];
          const deviceStatus = updated[deviceId]; // Use updated status instead of old status
          const currentStation = preset.zones[preset.currentIndex];
          
          // If the current preset zone is no longer watering, progress to next zone
          if (deviceStatus && (!deviceStatus.isWatering || deviceStatus.currentStation !== currentStation)) {
            console.log(`[Bhyve] Zone ${currentStation} finished in flower preset, progressing to next zone`);
            // Use setTimeout to avoid dependency issues
            setTimeout(() => {
              // Find progressFlowerPreset function and call it
              const progressFn = progressFlowerPresetRef.current;
              if (progressFn) progressFn(deviceId);
            }, 1000);
          }
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
  }, [makeRequest]); // Removed activeFlowerPresets and status from dependencies to prevent constant reloading

  // Update ref when loadDevices function changes
  useEffect(() => {
    loadDevicesRef.current = loadDevices;
  }, [loadDevices]);

  // Keep refs in sync with state to avoid dependencies in loadDevices
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    activeFlowerPresetsRef.current = activeFlowerPresets;
  }, [activeFlowerPresets]);

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
      
      // Don't force immediate refresh - let immediate update and polling handle sync
      console.log('[Bhyve] Stop command completed - immediate status updated');
      
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

  const startFlowerPreset = useCallback(async (deviceId: string) => {
    const requestKey = `${deviceId}-flower-preset`;
    
    if (activeRequests.has(requestKey)) return;
    
    try {
      setActiveRequests(prev => new Set(prev).add(requestKey));
      triggerHaptic('medium');
      
      console.log('[Bhyve] Starting flower preset for device:', deviceId);
      
      // Get device zones for the preset
      const device = devices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error('Device not found');
      }
      
      // Define flower preset zones in order: Front flower bed (zone 2) -> Backyard (zone 3)
      const flowerPresetZones = device.zones.filter(zone => {
        const lowerName = zone.name.toLowerCase();
        // Include flower/bed/garden zones AND backyard
        return lowerName.includes('flower') || 
               lowerName.includes('bed') || 
               lowerName.includes('garden') ||
               (lowerName.includes('back') && lowerName.includes('yard')) ||
               zone.station === 3; // Specifically include zone 3 (backyard)
      }).sort((a, b) => a.station - b.station); // Sort by station number for consistent order
      
      if (flowerPresetZones.length === 0) {
        throw new Error('No flower preset zones found for this device');
      }
      
      console.log('[Bhyve] Found flower preset zones:', flowerPresetZones.map(z => `${z.name} (station ${z.station})`));
      
      // Set up the preset sequence state
      setActiveFlowerPresets(prev => ({
        ...prev,
        [deviceId]: {
          zones: flowerPresetZones.map(z => z.station),
          currentIndex: 0,
          startTime: Date.now()
        }
      }));
      
      // Start the first zone
      const firstZone = flowerPresetZones[0];
      console.log(`[Bhyve] Starting first flower preset zone: ${firstZone.name} (station ${firstZone.station}) for 1 minute`);
      
      // Update UI immediately before making the API call
      updateImmediateStatus(deviceId, 'start', firstZone.station, 1); // 1 minute
      
      await makeRequest('bhyve/zones/start', 'POST', {
        device_id: deviceId,
        station: firstZone.station,
        time: 1 // 1 minute
      });
      
      // Track watering action to pause polling temporarily
      const actionTime = Date.now();
      setLastWateringAction(actionTime);
      lastWateringActionRef.current = actionTime;
      
      console.log('[Bhyve] First flower preset zone started successfully');
      
    } catch (error) {
      console.error('Failed to start flower preset:', error);
      triggerHaptic('heavy');
      // Clean up preset state on error
      setActiveFlowerPresets(prev => {
        const updated = { ...prev };
        delete updated[deviceId];
        return updated;
      });
    } finally {
      setActiveRequests(prev => {
        const next = new Set(prev);
        next.delete(requestKey);
        return next;
      });
    }
  }, [makeRequest, activeRequests, devices, updateImmediateStatus]);

  // Function to progress flower preset to next zone
  const progressFlowerPreset = useCallback(async (deviceId: string) => {
    const preset = activeFlowerPresets[deviceId];
    if (!preset) return;
    
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;
    
    const nextIndex = preset.currentIndex + 1;
    
    if (nextIndex >= preset.zones.length) {
      // Preset completed - clean up
      console.log('[Bhyve] Flower preset completed for device:', deviceId);
      setActiveFlowerPresets(prev => {
        const updated = { ...prev };
        delete updated[deviceId];
        return updated;
      });
      return;
    }
    
    // Start next zone
    const nextStation = preset.zones[nextIndex];
    const nextZone = device.zones.find(z => z.station === nextStation);
    
    if (nextZone) {
      console.log(`[Bhyve] Progressing flower preset to zone: ${nextZone.name} (station ${nextStation})`);
      
      // Update preset state
      setActiveFlowerPresets(prev => ({
        ...prev,
        [deviceId]: {
          ...preset,
          currentIndex: nextIndex
        }
      }));
      
      // Start the next zone
      updateImmediateStatus(deviceId, 'start', nextStation, 1); // 1 minute
      
      try {
        await makeRequest('bhyve/zones/start', 'POST', {
          device_id: deviceId,
          station: nextStation,
          time: 1 // 1 minute
        });
        
        // Track watering action
        const actionTime = Date.now();
        setLastWateringAction(actionTime);
        lastWateringActionRef.current = actionTime;
        
        console.log(`[Bhyve] Successfully started next flower preset zone: ${nextZone.name}`);
      } catch (error) {
        console.error('Failed to start next flower preset zone:', error);
        // Clean up preset on error
        setActiveFlowerPresets(prev => {
          const updated = { ...prev };
          delete updated[deviceId];
          return updated;
        });
      }
    }
  }, [activeFlowerPresets, devices, makeRequest, updateImmediateStatus]);

  // Update ref when progressFlowerPreset function changes
  useEffect(() => {
    progressFlowerPresetRef.current = progressFlowerPreset;
  }, [progressFlowerPreset]);

  // Function to stop flower preset
  const stopFlowerPreset = useCallback(async (deviceId: string) => {
    const preset = activeFlowerPresets[deviceId];
    if (!preset) return;
    
    console.log('[Bhyve] Stopping flower preset for device:', deviceId);
    
    // Stop current watering zone if any
    const deviceStatus = status[deviceId];
    if (deviceStatus?.isWatering && deviceStatus.currentStation) {
      await stopZoneWatering(deviceId, deviceStatus.currentStation);
    }
    
    // Clean up preset state
    setActiveFlowerPresets(prev => {
      const updated = { ...prev };
      delete updated[deviceId];
      return updated;
    });
    
    console.log('[Bhyve] Flower preset stopped');
  }, [activeFlowerPresets, status, stopZoneWatering]);

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

  // Initial load when component mounts - only once
  useEffect(() => {
    if (!hasInitializedRef.current) {
      console.log('[Bhyve] Initial load of devices');
      loadDevices();
    }
  }, []); // Empty dependency array to run only once

  // Smart polling: only when widget is visible AND user is active AND not recently acted
  // PLUS special polling for active flower presets
  useEffect(() => {
    // Don't call loadDevices() immediately here as it causes refreshes on every dependency change
    
    let intervalId: number;
    let flowerPresetIntervalId: number;
    
    const shouldPoll = isWidgetVisible && isUserActive && document.visibilityState === 'visible';
    const hasActiveFlowerPresets = Object.keys(activeFlowerPresets).length > 0;
    
    const startSmartPolling = () => {
      if (intervalId) clearInterval(intervalId);
      
      if (shouldPoll) {
        console.log('[Bhyve] Starting smart polling - widget visible and user active');
        
        // Determine polling frequency based on activity
        const statusValues = Object.keys(status).map(key => status[key]);
        const hasActiveWatering = statusValues.some((s: WateringStatus) => s.isWatering);
        const pollInterval = hasActiveWatering ? 5000 : 30000; // 5s if watering, 30s if idle
        
        intervalId = setInterval(() => {
          // Don't poll if we recently performed a watering action (avoid timer conflicts)
          const timeSinceAction = Date.now() - lastWateringActionRef.current;
          if (timeSinceAction < 8000) { // 8 seconds pause after watering actions
            console.log(`[Bhyve] Skipping poll - recent watering action ${Math.round(timeSinceAction/1000)}s ago`);
            return;
          }
          
          if (isWidgetVisible && isUserActive && document.visibilityState === 'visible') {
            console.log('[Bhyve] Smart polling - refreshing device status');
            loadDevicesRef.current?.();
          }
        }, pollInterval);
      } else {
        console.log('[Bhyve] Stopping smart polling - widget not visible or user inactive');
      }
    };
    
    // Separate polling for flower presets - always active when presets are running
    const startFlowerPresetPolling = () => {
      if (flowerPresetIntervalId) clearInterval(flowerPresetIntervalId);
      
      if (hasActiveFlowerPresets) {
        console.log('[Bhyve] Starting flower preset polling - active presets detected');
        
        flowerPresetIntervalId = setInterval(() => {
          // Don't poll if we recently performed a watering action (avoid timer conflicts)
          const timeSinceAction = Date.now() - lastWateringActionRef.current;
          if (timeSinceAction < 3000) { // Shorter pause for flower presets (3 seconds)
            console.log(`[Bhyve] Skipping flower preset poll - recent watering action ${Math.round(timeSinceAction/1000)}s ago`);
            return;
          }
          
          console.log('[Bhyve] Flower preset polling - checking device status for progression');
          loadDevicesRef.current?.();
        }, 3000); // Check every 3 seconds for flower preset progression
      } else {
        console.log('[Bhyve] Stopping flower preset polling - no active presets');
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isWidgetVisible && isUserActive) {
        console.log('[Bhyve] Page became visible with active widget - starting smart polling');
        loadDevicesRef.current?.(); // Immediate refresh when page becomes visible
        startSmartPolling();
      } else {
        console.log('[Bhyve] Page hidden or widget not active - stopping smart polling');
        if (intervalId) clearInterval(intervalId);
      }
    };
    
    startSmartPolling();
    startFlowerPresetPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (flowerPresetIntervalId) clearInterval(flowerPresetIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isWidgetVisible, isUserActive, activeFlowerPresets]); // Added activeFlowerPresets to deps

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
    <div ref={widgetRef} className="w-full px-0 sm:px-0">
      {devices.map((device) => {
        const deviceStatus = status[device.id];
        const isDeviceWatering = deviceStatus?.isWatering;
        const rainDelay = typeof device.status.rain_delay === 'number' ? device.status.rain_delay : (device.status.rain_delay?.delay || 0);
        const isDelayLoading = delayLoading[device.id] || false;

        return (
          <div
            key={device.id}
            className={`device-widget ${timePriority === 'high' ? 'device-widget-priority' : ''} p-2.5 sm:p-3 w-full max-w-full my-2`}
          >
            {/* Enhanced glass effect overlay */}
            <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-white/5 to-transparent pointer-events-none rounded-t-xl"></div>

            {/* Header - Cleaned up */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-gray-200 font-medium flex items-center space-x-2">
                <span className="text-base sm:text-lg filter drop-shadow-sm">💧</span>
                <span className="text-xs sm:text-sm font-semibold tracking-wide">Outdoor Irrigation</span>
              </div>
              <div className="flex space-x-1 text-xs">
                <div className="text-blue-200 bg-blue-900/30 px-2 py-1 rounded-full border border-blue-700/30 backdrop-blur-sm shadow-sm font-bold tracking-widest">
                  AUTO
                </div>
              </div>
            </div>

            {/* Activity Status - Compact status with active counter */}
            <div className="flex items-center justify-between mb-3 p-1.5 bg-gray-900/20 rounded-lg border border-gray-700/30">
              <div className="flex items-center space-x-2 text-xs text-gray-300">
                <span>💧 {device.zones.filter(z => deviceStatus?.isWatering && deviceStatus.currentStation === z.station).length} active</span>
                {deviceStatus?.timeRemaining && deviceStatus.isWatering && (
                  <span>⏱️ {formatTimeRemaining(deviceStatus.timeRemaining)}</span>
                )}
              </div>
              {rainDelay > 0 && (
                <div className="text-yellow-300 text-xs">
                  Rain delayed {rainDelay}h
                </div>
              )}
            </div>

            {/* Flower Preset Control - Prominent and First */}
            {activeFlowerPresets[device.id] ? (
              <button
                onClick={() => stopFlowerPreset(device.id)}
                className="w-full mb-3 px-3 py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors touch-manipulation flex items-center justify-center shadow-lg"
              >
                🛑 Stop Flower Preset ({activeFlowerPresets[device.id].currentIndex + 1}/{activeFlowerPresets[device.id].zones.length})
              </button>
            ) : (
              <button
                onClick={() => startFlowerPreset(device.id)}
                disabled={activeRequests.has(`${device.id}-flower-preset`) || isDeviceWatering}
                className="w-full mb-3 px-3 py-3 bg-pink-600 hover:bg-pink-700 disabled:bg-gray-800 text-white text-sm font-semibold rounded-lg transition-colors touch-manipulation flex items-center justify-center shadow-lg"
              >
                {activeRequests.has(`${device.id}-flower-preset`) ? 
                  <span className="loader mr-2 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : 
                  '🌸'
                } 
                {isDeviceWatering ? 'Watering Active' : 'Start Flower Preset'}
              </button>
            )}

            {/* Rain Delay Controls - More compact, with feedback */}
            {rainDelay === 0 ? (
              <button
                onClick={() => handleSetRainDelay(device.id, 24)}
                disabled={activeRequests.has(`${device.id}-rain-24`) || isDelayLoading}
                className="w-full mb-2.5 px-2.5 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white text-xs rounded-lg transition-colors touch-manipulation flex items-center justify-center"
              >
                {isDelayLoading ? <span className="loader mr-2 w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : '🌧️'} Set 24h Rain Delay
              </button>
            ) : (
              <button
                onClick={() => handleSetRainDelay(device.id, 0)}
                disabled={activeRequests.has(`${device.id}-rain-0`) || isDelayLoading}
                className="w-full mb-2.5 px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 text-xs rounded-md transition-colors touch-manipulation flex items-center justify-center opacity-75"
              >
                {isDelayLoading ? <span className="loader mr-2 w-2 h-2 border border-gray-300 border-t-transparent rounded-full animate-spin"></span> : '☀️'} Clear Rain Delay ({rainDelay}h)
              </button>
            )}

            {/* Zones Grid - 2 per row with tighter spacing */}
            <div className="grid grid-cols-2 gap-1.5">
              {device.zones.map((zone) => {
                const isZoneWatering = deviceStatus?.isWatering && deviceStatus.currentStation === zone.station;
                const { durations, ideal } = getZoneDurations(zone.name);
                const zoneIcon = getZoneIcon(zone.name, isZoneWatering);
                // Pass time remaining only if this specific zone is watering
                const zoneTimeRemaining = isZoneWatering ? deviceStatus?.timeRemaining : undefined;
                
                // Calculate flower preset info for this zone
                const preset = activeFlowerPresets[device.id];
                const flowerPresetInfo = preset ? {
                  isInPreset: preset.zones.includes(zone.station),
                  isCurrentZone: preset.zones[preset.currentIndex] === zone.station,
                  isNextZone: preset.currentIndex + 1 < preset.zones.length && preset.zones[preset.currentIndex + 1] === zone.station,
                  hasFinished: preset.zones.indexOf(zone.station) !== -1 && preset.zones.indexOf(zone.station) < preset.currentIndex
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
