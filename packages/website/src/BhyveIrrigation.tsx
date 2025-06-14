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
  formatTimeRemaining
}) => {
  const [selectedDuration, setSelectedDuration] = useState(idealDuration);
  const [localTime, setLocalTime] = useState<number | undefined>(timeRemaining);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
    <div className={`relative p-2 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden border transition-all duration-300 hover:border-gray-600/50 touch-manipulation transform hover:scale-[1.02] active:scale-[0.98] ${
      isWatering
        ? 'border-blue-600/50 shadow-blue-900/20'
        : 'border-gray-700/50'
    }`}
    style={{
      transform: "translateZ(0)",
      WebkitTransform: "translateZ(0)",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      willChange: "transform, box-shadow"
    }}>
      {/* Zone Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          <span className="text-sm filter drop-shadow-sm">{icon}</span>
          <div className="min-w-0 flex-1">
            <h4 className="text-gray-200 font-medium text-xs truncate">
              {zone.name}
            </h4>
            <p className="text-xs text-gray-400 opacity-75">
              Zone {zone.station}
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
  const [hasInitialized, setHasInitialized] = useState(false);
  const [delayLoading, setDelayLoading] = useState<Record<string, boolean>>({});
  const [isWidgetVisible, setIsWidgetVisible] = useState(false);
  const [isUserActive, setIsUserActive] = useState(true);
  const [lastWateringAction, setLastWateringAction] = useState<number>(0);
  
  const widgetRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const API_BASE = "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod";

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
      setIsLoading(true);
      setError(null);
      
      const data = await makeRequest('bhyve/devices/list');
      setDevices(data.devices || []);
      setHasInitialized(true);
      
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
      
      // Update status with grace period logic
      setStatus(prev => {
        const updated = { ...prev };
        
        for (const [deviceId, newStatus] of Object.entries(deviceStatuses)) {
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
        
        return updated;
      });
    } catch (error) {
      console.error('Failed to load Bhyve devices:', error);
      setError('Failed to load irrigation devices');
      setHasInitialized(true); // Still mark as initialized to show error state
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest]);

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
          status: 'watering',
          lastUpdated: Date.now()
        } as WateringStatus & { lastUpdated: number };
      } else if (action === 'stop') {
        updated[deviceId] = {
          deviceId,
          isWatering: false,
          currentStation: undefined,
          timeRemaining: undefined,
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
      setLastWateringAction(Date.now());
      
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
  }, [makeRequest, activeRequests, loadDevices, updateImmediateStatus]);

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
      setLastWateringAction(Date.now());
      
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
        loadDevices();
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
  }, [makeRequest, activeRequests, loadDevices]);

  // Feedback for rain delay
  const handleSetRainDelay = useCallback(async (id: string, delay: number) => {
    setDelayLoading(prev => ({ ...prev, [id]: true }));
    try {
      await setRainDelay(id, delay);
    } finally {
      setTimeout(() => setDelayLoading(prev => ({ ...prev, [id]: false })), 800); // show spinner briefly
    }
  }, [setRainDelay]);

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
    if (!hasInitialized) {
      console.log('[Bhyve] Initial load of devices');
      loadDevices();
    }
  }, []); // Empty dependency array to run only once

  // Smart polling: only when widget is visible AND user is active AND not recently acted
  useEffect(() => {
    // Don't call loadDevices() immediately here as it causes refreshes on every dependency change
    
    let intervalId: NodeJS.Timeout;
    
    const shouldPoll = isWidgetVisible && isUserActive && document.visibilityState === 'visible';
    
    const startSmartPolling = () => {
      if (intervalId) clearInterval(intervalId);
      
      if (shouldPoll) {
        console.log('[Bhyve] Starting smart polling - widget visible and user active');
        
        // Determine polling frequency based on activity
        const hasActiveWatering = Object.values(status).some(s => s.isWatering);
        const pollInterval = hasActiveWatering ? 5000 : 30000; // 5s if watering, 30s if idle
        
        intervalId = setInterval(() => {
          // Don't poll if we recently performed a watering action (avoid timer conflicts)
          const timeSinceAction = Date.now() - lastWateringAction;
          if (timeSinceAction < 8000) { // 8 seconds pause after watering actions
            console.log(`[Bhyve] Skipping poll - recent watering action ${Math.round(timeSinceAction/1000)}s ago`);
            return;
          }
          
          if (isWidgetVisible && isUserActive && document.visibilityState === 'visible') {
            console.log('[Bhyve] Smart polling - refreshing device status');
            loadDevices();
          }
        }, pollInterval);
      } else {
        console.log('[Bhyve] Stopping smart polling - widget not visible or user inactive');
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isWidgetVisible && isUserActive) {
        console.log('[Bhyve] Page became visible with active widget - starting smart polling');
        loadDevices(); // Immediate refresh when page becomes visible
        startSmartPolling();
      } else {
        console.log('[Bhyve] Page hidden or widget not active - stopping smart polling');
        if (intervalId) clearInterval(intervalId);
      }
    };
    
    startSmartPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadDevices, isWidgetVisible, isUserActive, lastWateringAction]);

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
  if (!hasInitialized) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="w-full p-6 bg-gradient-to-b from-blue-900/20 to-blue-800/20 border border-blue-800/40 rounded-xl mt-2">
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
      <div className="w-full p-6 bg-gradient-to-b from-red-900/20 to-red-800/20 border border-red-800/40 rounded-xl mt-2">
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
      <div className="w-full p-6 bg-gradient-to-b from-gray-900/20 to-gray-800/20 border border-gray-800/40 rounded-xl mt-2">
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
            className={`relative p-2.5 sm:p-3 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden border transition-all duration-300 hover:border-gray-600/50 touch-manipulation transform hover:scale-[1.01] active:scale-[0.99] w-full max-w-full my-2`}
            style={{
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              willChange: "transform, box-shadow"
            }}
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
            <div className="flex items-center justify-between mb-2.5 p-1.5 bg-gray-900/20 rounded-lg border border-gray-700/30">
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
                className="w-full mb-2.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-xs rounded-lg transition-colors touch-manipulation flex items-center justify-center"
              >
                {isDelayLoading ? <span className="loader mr-2 w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : '☀️'} Clear Rain Delay ({rainDelay}h)
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
