import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import { UilSync, UilPower, UilClock, UilHistory, UilCheck, UilBell } from "@iconscout/react-unicons";
import { triggerHapticFeedback, hapticPatterns } from "./utils/haptics";
import { DeviceCardSkeleton } from "./components/DeviceCardSkeleton";
import OptimizedImage from "./components/OptimizedImage";
import { useMetrics } from "./hooks/useMetrics";

// Helper to check if a state is a running state
const isRunningState = (state: string): boolean => {
  if (!state) return false;
  const upper = state.toUpperCase();
  const exact = [
    "RUNNING","SPINNING","RINSING","REFRESHING","DRYING","COOLING",
    "ACTIVE","WASHING","CLEANING","HEATING","SANITIZING",
    "WRINKLE_CARE","WRINKLECARE","TIME_DRY","TIMEDRY",
    "DETECTING","DISPENSING","PREWASH","SOAKING","STEAM_SOFTENING",
    "ADD_DRAIN","DETERGENT_AMOUNT","PAUSE","RESERVED"
  ];
  if (exact.includes(upper)) return true;
  const keywords = [
    "RUN","SPIN","RINS","REFRESH","DRY","COOL","ACTIVE","WASH",
    "CLEAN","HEAT","SANIT","WRINKLE","TIME","TUMBL","DETECT"
  ];
  return keywords.some(k => upper.includes(k));
};

// Helper to format cycle names for display
const formatCycleName = (cycle: string): string => {
  return cycle
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Helper to format running state for display
const formatRunningState = (state: string): string => {
  if (!state) return "UNKNOWN";
  return state.charAt(0) + state.slice(1).toLowerCase();
};

// Helper to calculate optimal polling interval based on device states
const calculatePollingInterval = (lgStatus: Record<string, LGDeviceStatus>): number => {
  let minInterval = 600000; // Increased default: 10 minutes for idle devices (was 5 minutes)
  
  for (const status of Object.values(lgStatus)) {
    if (!status) continue;
    
    const isActive = isRunningState(status.currentState);
    if (!isActive) continue; // Skip idle devices
    
    const remainingTime = status.remainingTime ? parseInt(status.remainingTime) : null;
    
    if (remainingTime !== null) {
      if (remainingTime <= 1) {
        // Last minute: check every 15 seconds
        minInterval = Math.min(minInterval, 15000);
      } else if (remainingTime <= 5) {
        // Last 5 minutes: check every 30 seconds
        minInterval = Math.min(minInterval, 30000);
      } else if (remainingTime <= 10) {
        // 5-10 minutes: check every 1 minute
        minInterval = Math.min(minInterval, 60000);
      } else if (remainingTime <= 20) {
        // 10-20 minutes: check every 2 minutes
        minInterval = Math.min(minInterval, 120000);
      } else {
        // >20 minutes: check every 5 minutes
        minInterval = Math.min(minInterval, 300000);
      }
    } else {
      // Running but no time info: check every 2 minutes
      minInterval = Math.min(minInterval, 120000);
    }
  }
  
  // Ensure minimum reasonable interval (15 seconds)
  return Math.max(minInterval, 15000);
};

type LGDevice = {
  deviceId: string;
  deviceName: string;
  deviceType: "washer" | "dryer" | "unknown";
  modelName: string;
  connected: boolean;
};

type LGDeviceStatus = {
  currentState: string;
  isPoweredOn: boolean;
  remoteControlEnabled?: boolean;
  rawState?: any;
  remainingTime?: string;
  lastUpdated?: number;
  _debug?: {
    currentState: string;
    isPoweredOnLogic: string;
    rawRunState: any;
  };
};

const LGDeviceCard = memo(({
  device,
  status,
  selectedCycle,
  availableCycles,
  onCycleSelect,
  onPowerToggle,
  onStartStop
}: {
  device: LGDevice;
  status: LGDeviceStatus;
  selectedCycle?: string;
  availableCycles?: string[];
  onCycleSelect: (cycle: string) => void;
  onPowerToggle: () => void;
  onStartStop: () => void;
}) => {
  const [reconnecting, setReconnecting] = useState(false);
  
  // Use available cycles or fallback to default
  const cycles = availableCycles && availableCycles.length > 0 ? availableCycles : [
    "NORMAL",
    "QUICK_WASH", 
    "HEAVY_DUTY",
    "DELICATE",
    "TOWEL",
    "BEDDING",
    "COTTON",
    "SYNTHETIC",
    "WOOL",
    "STEAM",
    "SANITIZE",
    "SPIN_RINSE",
    "ECO_WASH"
  ];
  
  const iconMap = {
    washer: "washing-machine.svg",
    dryer: "dryer.svg",
    unknown: "device.png", // fallback icon
  } as const;

  // Never show "UNKNOWN" once we know on/off
  const badgeText = device.deviceType === "unknown"
    ? "RECONNECT"
    : isRunningState(status.currentState)
      ? formatRunningState(status.currentState)
      : (!status.currentState || status.currentState.toUpperCase() === "UNKNOWN")
        ? (status.isPoweredOn ? "ON" : "OFF")
        : status.currentState;

  // Show timer row if running and either we have remainingTime or it's a dryer
  const showTimer = isRunningState(status.currentState) &&
    (status.remainingTime != null || device.deviceType === "dryer");

  // Null-safe image error handler
  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const parent = img.parentElement;
    if (!parent) return;
    img.remove();
    const label = device.deviceType === "washer"
      ? "W"
      : device.deviceType === "dryer"
        ? "D"
        : "?";
    parent.textContent = label;
    parent.classList.add("flex","items-center","justify-center","text-blue-400","text-xl","font-bold");
  };

  const isActive = isRunningState(status.currentState);
  const deviceStatus = isActive ? "active" : (status.isPoweredOn ? "on" : "off");

  return (
    <div className="bg-gray-800/30 p-3 rounded-lg border border-gray-700/40 transition-all duration-300 hover:bg-gray-800/40">
      {/* Device Header */}
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-10 h-10 flex items-center justify-center bg-gray-700/50 rounded-lg border border-gray-600/40">
          <OptimizedImage
            src={`/device_icons/${iconMap[device.deviceType]}`}
            alt={device.deviceType}
            className="w-6 h-6 object-contain opacity-90"
            onError={handleImgError}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-100 font-medium text-sm truncate">
            {device.deviceName !== "Unknown Device"
              ? device.deviceName
              : `${device.deviceType[0].toUpperCase() + device.deviceType.slice(1)}`}
          </h3>
          <div className="text-gray-400 text-xs truncate">
            {device.modelName !== "Unknown Model" ? device.modelName : "Reconnecting..."}
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          device.deviceType === "unknown"
            ? "bg-yellow-900/30 text-yellow-300"
            : isActive
              ? "bg-blue-900/40 text-blue-200 animate-pulse"
              : status.isPoweredOn
                ? "bg-green-900/40 text-green-200"
                : "bg-gray-800/60 text-gray-300"
        }`}>
          {badgeText}
        </div>
      </div>

      {/* Timer */}
      {showTimer && status.remainingTime && (
        <div className="flex items-center mb-3 px-2 py-1 bg-blue-900/20 rounded text-xs text-blue-300">
          <span>{status.remainingTime} min remaining</span>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-2">
        {device.deviceType === "unknown" ? (
          <button
            onClick={() => {
              setReconnecting(true);
              onPowerToggle();
              triggerHapticFeedback(hapticPatterns.WARNING);
              setTimeout(() => setReconnecting(false), 3000);
            }}
            className="w-full py-2 px-3 rounded text-xs font-medium bg-yellow-700/60 hover:bg-yellow-600/70 text-white border border-yellow-500/50 transition-colors touch-manipulation"
            disabled={reconnecting}
          >
            <UilSync size={14} className={`mr-1 ${reconnecting ? 'animate-spin' : ''}`} />
            {reconnecting ? 'Reconnecting...' : 'Reconnect Device'}
          </button>
        ) : (
          <>
            <button
              onClick={() => {
                setReconnecting(true);
                onPowerToggle();
                triggerHapticFeedback(hapticPatterns.SUCCESS);
                setTimeout(() => setReconnecting(false), 2000);
              }}
              disabled={reconnecting || status.remoteControlEnabled === false}
              className={`w-full py-2 px-3 rounded text-xs font-medium transition-colors touch-manipulation ${
                status.remoteControlEnabled === false
                  ? "bg-gray-600/40 text-gray-400 cursor-not-allowed"
                  : status.isPoweredOn
                    ? "bg-red-700/60 hover:bg-red-600/70 text-white border border-red-500/50"
                    : "bg-green-700/60 hover:bg-green-600/70 text-white border border-green-500/50"
              }`}
            >
              <UilPower size={14} className={`mr-1 ${reconnecting ? 'animate-spin' : ''}`} />
              {status.remoteControlEnabled === false 
                ? "Remote Disabled" 
                : status.isPoweredOn 
                  ? (device.deviceType === "washer" ? "Drain & Off" : "Turn Off")
                  : "Turn On"}
            </button>

            <select
              value={selectedCycle || ""}
              onChange={(e) => {
                if (e.target.value) {
                  onCycleSelect(e.target.value);
                  triggerHapticFeedback();
                }
              }}
              disabled={!status.isPoweredOn}
              className={`w-full py-2 px-3 rounded text-xs border transition-colors ${
                !status.isPoweredOn
                  ? "bg-gray-700/40 text-gray-500 border-gray-500/30 cursor-not-allowed"
                  : selectedCycle
                    ? "bg-blue-700/60 text-white border-blue-500/50"
                    : "bg-gray-700/60 text-gray-300 border-gray-500/50 hover:bg-gray-600/70"
              }`}
            >
              <option value="">Select Wash Cycle</option>
              {cycles.map((cycle: string) => (
                <option key={cycle} value={cycle} className="bg-gray-800 text-gray-100">
                  {formatCycleName(cycle)}
                </option>
              ))}
            </select>

            {selectedCycle && (
              <button
                onClick={() => {
                  onStartStop();
                  triggerHapticFeedback(hapticPatterns.SUCCESS);
                }}
                disabled={!status.isPoweredOn}
                className={`w-full py-2 px-3 rounded text-xs font-medium transition-colors touch-manipulation ${
                  isActive
                    ? "bg-red-600/70 hover:bg-red-500/80 text-white border border-red-400/50"
                    : "bg-blue-600/70 hover:bg-blue-500/80 text-white border border-blue-400/50"
                }`}
              >
                {isActive ? <UilPower size={14} className="mr-1" /> : <UilPower size={14} className="mr-1" />}
                {isActive ? "Stop Cycle" : "Start Cycle"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

// Paired Washer/Dryer Component for side-by-side display
const LGPairedDeviceCard = memo(({
  washer,
  dryer,
  washerStatus,
  dryerStatus,
  selectedCycles,
  availableCycles,
  onCycleSelect,
  onPowerToggle,
  onStartStop
}: {
  washer: LGDevice;
  dryer: LGDevice;
  washerStatus: LGDeviceStatus;
  dryerStatus: LGDeviceStatus;
  selectedCycles: Record<string, string>;
  availableCycles: Record<string, string[]>;
  onCycleSelect: (deviceId: string, cycle: string) => void;
  onPowerToggle: (device: LGDevice) => void;
  onStartStop: (device: LGDevice) => void;
}) => {
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});
  
  // Function to get cycles for a device (with fallback)
  const getCyclesForDevice = (deviceId: string) => {
    const deviceCycles = availableCycles[deviceId];
    return deviceCycles && deviceCycles.length > 0 ? deviceCycles : [
      "NORMAL",
      "QUICK_WASH", 
      "HEAVY_DUTY",
      "DELICATE",
      "TOWEL", 
      "BEDDING",
      "COTTON",
      "SYNTHETIC",
      "WOOL",
      "STEAM",
      "SANITIZE",
      "SPIN_RINSE",
      "ECO_WASH"
    ];
  };
  
  const isActiveDevice = (device: LGDevice, status: LGDeviceStatus) => 
    isRunningState(status.currentState);
  
  const getDeviceStatusText = (device: LGDevice, status: LGDeviceStatus) => {
    if (device.deviceType === "unknown") return "RECONNECT";
    if (isRunningState(status.currentState)) return formatRunningState(status.currentState);
    if (!status.currentState || status.currentState.toUpperCase() === "UNKNOWN") {
      return status.isPoweredOn ? "ON" : "OFF";
    }
    return status.currentState;
  };

  const showTimer = (device: LGDevice, status: LGDeviceStatus) => 
    isRunningState(status.currentState) && 
    (status.remainingTime != null || device.deviceType === "dryer");

  const DeviceColumn = ({ device, status }: { device: LGDevice, status: LGDeviceStatus }) => {
    const isActive = isActiveDevice(device, status);
    const badgeText = getDeviceStatusText(device, status);
    const deviceName = device.deviceType === "washer" ? "Washer" : "Dryer";
    const isReconnecting = reconnecting[device.deviceId];
    
    const iconMap = {
      washer: "washing-machine.svg",
      dryer: "dryer.svg",
      unknown: "device.png",
    } as const;

    // Image error handler for paired device
    const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const parent = img.parentElement;
      if (!parent) return;
      img.remove();
      const label = device.deviceType === "washer" ? "W" : "D";
      parent.textContent = label;
      parent.classList.add("flex","items-center","justify-center","text-blue-400","text-lg","font-bold");
    };
    
    return (
      <div className="flex-1 p-3">
        {/* Device Header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-10 h-10 flex items-center justify-center bg-gray-700/50 rounded-lg border border-gray-600/40">
            <OptimizedImage
              src={`/device_icons/${iconMap[device.deviceType]}`}
              alt={device.deviceType}
              className="w-6 h-6 object-contain opacity-90"
              onError={handleImgError}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-gray-100 font-medium text-sm truncate">
              {deviceName}
            </h4>
            <div className="text-gray-400 text-xs truncate">
              {device.modelName !== "Unknown Model" ? device.modelName : "Reconnecting..."}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`inline-flex px-2 py-1 rounded text-xs font-medium mb-3 ${
          device.deviceType === "unknown"
            ? "bg-yellow-900/30 text-yellow-300"
            : isActive
              ? "bg-blue-900/40 text-blue-200 animate-pulse"
              : status.isPoweredOn
                ? "bg-green-900/40 text-green-200"
                : "bg-gray-800/60 text-gray-300"
        }`}>
          {badgeText}
        </div>

        {/* Timer */}
        {showTimer(device, status) && status.remainingTime && (
          <div className="flex items-center mb-3 px-2 py-1 bg-blue-900/20 rounded text-xs text-blue-300">
            <span>{status.remainingTime} min remaining</span>
          </div>
        )}

        {/* Controls */}
        <div className="space-y-2">
          {device.deviceType === "unknown" ? (
            <button
              onClick={() => {
                setReconnecting(prev => ({ ...prev, [device.deviceId]: true }));
                onPowerToggle(device);
                triggerHapticFeedback(hapticPatterns.WARNING);
                setTimeout(() => setReconnecting(prev => ({ ...prev, [device.deviceId]: false })), 3000);
              }}
              className="w-full py-2 px-3 rounded text-xs font-medium bg-yellow-700/70 hover:bg-yellow-600/80 text-white border border-yellow-500/60 transition-colors touch-manipulation"
              disabled={isReconnecting}
            >
              <UilSync size={14} className={`mr-1 ${isReconnecting ? 'animate-spin' : ''}`} />
              {isReconnecting ? 'Reconnecting...' : 'Reconnect Device'}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setReconnecting(prev => ({ ...prev, [device.deviceId]: true }));
                  onPowerToggle(device);
                  triggerHapticFeedback(hapticPatterns.SUCCESS);
                  setTimeout(() => setReconnecting(prev => ({ ...prev, [device.deviceId]: false })), 2000);
                }}
                disabled={isReconnecting || status.remoteControlEnabled === false}
                className={`w-full py-2 px-3 rounded text-xs font-medium transition-colors touch-manipulation ${
                  status.remoteControlEnabled === false
                    ? "bg-gray-600/50 text-gray-400 cursor-not-allowed"
                    : status.isPoweredOn
                      ? "bg-red-700/70 hover:bg-red-600/80 text-white border border-red-500/60"
                      : "bg-green-700/70 hover:bg-green-600/80 text-white border border-green-500/60"
                }`}
              >
                <UilPower size={14} className={`mr-1 ${isReconnecting ? 'animate-spin' : ''}`} />
                {status.remoteControlEnabled === false 
                  ? "Remote Disabled" 
                  : status.isPoweredOn 
                    ? (device.deviceType === "washer" ? "Drain & Off" : "Turn Off")
                    : "Turn On"}
              </button>

              <select
                value={selectedCycles[device.deviceId] || ""}
                onChange={(e) => {
                  if (e.target.value) {
                    onCycleSelect(device.deviceId, e.target.value);
                    triggerHapticFeedback();
                  }
                }}
                disabled={!status.isPoweredOn}
                className={`w-full py-2 px-3 rounded text-xs border transition-colors ${
                  !status.isPoweredOn
                    ? "bg-gray-700/50 text-gray-500 border-gray-500/40 cursor-not-allowed"
                    : selectedCycles[device.deviceId]
                      ? "bg-blue-700/70 text-white border-blue-500/60"
                      : "bg-gray-700/80 text-gray-300 border-gray-500/60 hover:bg-gray-600/90"
                }`}
              >
                <option value="">Select Wash Cycle</option>
                {getCyclesForDevice(device.deviceId).map((cycle: string) => (
                  <option key={cycle} value={cycle} className="bg-gray-800 text-gray-100">
                    {formatCycleName(cycle)}
                  </option>
                ))}
              </select>

              {selectedCycles[device.deviceId] && (
                <button
                  onClick={() => {
                    onStartStop(device);
                    triggerHapticFeedback(hapticPatterns.SUCCESS);
                  }}
                  disabled={!status.isPoweredOn}
                  className={`w-full py-2 px-3 rounded text-xs font-medium transition-colors touch-manipulation ${
                    isActive
                      ? "bg-red-600/80 hover:bg-red-500/90 text-white border border-red-400/60"
                      : "bg-blue-600/80 hover:bg-blue-500/90 text-white border border-blue-400/60"
                  }`}
                >
                  {isActive ? <UilPower size={14} className="mr-1" /> : <UilPower size={14} className="mr-1" />}
                  {isActive ? "Stop Cycle" : "Start Cycle"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-800/30 rounded-lg border border-gray-700/40 overflow-hidden transition-all duration-300 hover:bg-gray-800/40">
      {/* Side-by-side device layout */}
      <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-gray-600/20">
        <DeviceColumn device={washer} status={washerStatus} />
        
        {/* Horizontal separator for mobile */}
        <div className="block sm:hidden h-px bg-gray-600/40 mx-3" />
        
        <DeviceColumn device={dryer} status={dryerStatus} />
      </div>
    </div>
  );
});

const LGAppliances: React.FC = () => {
  // Initialize metrics tracking
  const {
    trackLoadStart,
    trackLoadEnd,
    trackDataFetchStart,
    trackDataFetchEnd,
    trackApiCall,
    trackInteraction
  } = useMetrics('LGAppliances');

  const [lgDevices, setLgDevices] = useState<LGDevice[]>([]);
  const [lgStatus, setLgStatus] = useState<Record<string,LGDeviceStatus>>({});
  const [selectedCycles, setSelectedCycles] = useState<Record<string,string>>({});
  const [availableCycles, setAvailableCycles] = useState<Record<string,string[]>>({});
  const [lgLoading, setLgLoading] = useState(true);
  const [lgError, setLgError] = useState<string|null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Default fallback cycles if dynamic fetching fails
  const fallbackCycles = [
    "NORMAL",
    "QUICK_WASH", 
    "HEAVY_DUTY",
    "DELICATE",
    "TOWEL",
    "BEDDING",
    "COTTON",
    "SYNTHETIC",
    "WOOL",
    "STEAM",
    "SANITIZE",
    "SPIN_RINSE",
    "ECO_WASH"
  ];

  // OPTIMIZATION: Separate state for actual polling interval used by useEffect
  const [activePollingInterval, setActivePollingInterval] = useState(300000); // 5 minutes default
  
  // OPTIMIZATION: Memoized polling interval calculation
  const currentPollingInterval = useMemo(() => 
    calculatePollingInterval(lgStatus),
    [lgStatus]
  );

  // OPTIMIZATION: Update active polling interval when calculated interval changes significantly
  useEffect(() => {
    if (Math.abs(currentPollingInterval - activePollingInterval) > 1000) { // Only update if difference is >1s
      console.log(`LG Polling interval changed: ${activePollingInterval/1000}s -> ${currentPollingInterval/1000}s`);
      setActivePollingInterval(currentPollingInterval);
    }
  }, [currentPollingInterval, activePollingInterval]);

  // OPTIMIZATION: Memoized device lists for better performance
  const { washerDevices, dryerDevices } = useMemo(() => {
    const washers = lgDevices.filter(d => d.deviceType === "washer");
    const dryers = lgDevices.filter(d => d.deviceType === "dryer");
    return { washerDevices: washers, dryerDevices: dryers };
  }, [lgDevices]);

  // OPTIMIZATION: Memoized device pairs for display
  const devicePairs = useMemo(() => {
    const pairs: Array<{ washer?: LGDevice; dryer?: LGDevice }> = [];
    const maxPairs = Math.max(washerDevices.length, dryerDevices.length);
    
    for (let i = 0; i < maxPairs; i++) {
      pairs.push({
        washer: washerDevices[i],
        dryer: dryerDevices[i],
      });
    }
    
    return pairs;
  }, [washerDevices, dryerDevices]);

  // Fetch devices list + status
  const fetchLGDevices = async (initialLoad = false) => {
    const now = new Date();
    if (!initialLoad && now.getTime() - lastUpdateTime.getTime() < 5000) return;
    
    if (initialLoad) {
      trackLoadStart();
      setLgLoading(true);
    } else {
      trackDataFetchStart();
      setIsRefreshing(true);
      triggerHapticFeedback();
    }
    
    setLastUpdateTime(now);

    try {
      // 1) List devices
      const listRes = await trackApiCall(
        () => fetch(
          "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/devices/list",
          { method:"GET", headers:{ "Accept":"application/json","Content-Type":"application/json" } }
        ),
        '/lg/devices/list'
      );
      if (listRes.status === 401) {
        setLgError("Smart appliance authorization expired. Please reconnect your account.");
        setLgDevices([]);
        return;
      }
      if (!listRes.ok) throw new Error(await listRes.text());
      const devices: LGDevice[] = await listRes.json();
      setLgDevices(devices);

      // 2) Fetch status for all devices in batch - OPTIMIZATION: Batch API call
      const newStatus: Record<string,LGDeviceStatus> = {};
      
      try {
        // Batch status fetch instead of individual requests
        const batchStatusRes = await fetch(
          "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/devices/batch-status",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ 
              deviceIds: devices.map(dev => dev.deviceId),
              includeRawState: true 
            })
          }
        );
        
        if (batchStatusRes.ok) {
          const batchData = await batchStatusRes.json();
          console.log(`✅ Batch status fetch successful for ${devices.length} devices`);
          
          // Process batch response
          for (const dev of devices) {
            const data = batchData[dev.deviceId];
            if (!data) continue;
            
            newStatus[dev.deviceId] = processDeviceStatus(dev, data);
          }
        } else {
          throw new Error("Batch API not available, falling back to individual requests");
        }
      } catch (batchError) {
        console.log("⚠️ Batch status fetch failed, falling back to individual requests:", batchError);
        
        // Fallback to individual requests with connection pooling optimization
        const statusPromises = devices.map(async (dev, index) => {
          // Stagger requests slightly to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, index * 50));
          
          try {
            const sr = await fetch(
              "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/devices/status",
              {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json", 
                  "Accept": "application/json",
                  "Connection": "keep-alive" // Optimize connection reuse
                },
                body: JSON.stringify({ data: { deviceId: dev.deviceId } })
              }
            );
            
            if (!sr.ok) throw new Error(await sr.text());
            const data = await sr.json();
            
            return { deviceId: dev.deviceId, device: dev, data };
          } catch (err) {
            console.error("Status fetch error for", dev.deviceId, err);
            return null;
          }
        });
        
        const results = await Promise.all(statusPromises);
        
        // Process individual results
        for (const result of results) {
          if (!result) continue;
          newStatus[result.deviceId] = processDeviceStatus(result.device, result.data);
        }
      }

      setLgStatus(newStatus);
      setLgError(null);
      
      // 3) Fetch available cycles for all devices (only on initial load or when devices change)
      if (initialLoad || devices.length !== lgDevices.length) {
        await fetchCyclesForAllDevices(devices);
      }
      
      // Calculate optimal polling interval based on current device states
      const newInterval = calculatePollingInterval(newStatus);
      if (Math.abs(newInterval - currentPollingInterval) > 1000) { // Only update if difference is >1s to avoid noise
        console.log(`LG Polling interval changed: ${currentPollingInterval/1000}s -> ${newInterval/1000}s`);
        // Interval will be updated automatically by the useEffect above
      }
    } catch(err:any) {
      console.error("fetchLGDevices error", err);
      setLgError("Failed to load smart appliances");
      setLgDevices([]);
      if (initialLoad) {
        trackLoadEnd(false);
      } else {
        trackDataFetchEnd(false);
      }
    } finally {
      setLgLoading(false);
      setIsRefreshing(false);
      if (initialLoad) {
        trackLoadEnd(true);
      } else {
        trackDataFetchEnd(true);
      }
    }
  };

  // Power toggle with drain functionality for washers
  const handlePowerToggle = async (dev: LGDevice) => {
    const cur = lgStatus[dev.deviceId];
    
    // Safety check: ensure we have valid status data
    if (!cur) {
      console.warn('No status data available for device:', dev.deviceId);
      // Refresh data and abort this action
      fetchLGDevices(true);
      return;
    }
    
    // Special handling for washers when turning off - initiate drain
    if (dev.deviceType === "washer" && cur.isPoweredOn) {
      // For washers being turned off, use DRAIN mode instead of POWER_OFF
      const mode = "DRAIN";
      
      // optimistic UI for drain
      setLgStatus(ps => ({
        ...ps,
        [dev.deviceId]: {
          ...ps[dev.deviceId],
          currentState: "Draining..."
        }
      }));

      try {
        await fetch(
          `https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/${dev.deviceType}/control`,
          {
            method:"POST",
            headers:{ "Content-Type":"application/json" },
            body: JSON.stringify({ data:{ deviceId: dev.deviceId, mode } })
          }
        );
        // Refresh data immediately after successful drain action
        setTimeout(() => fetchLGDevices(false), 2000);
      } catch(err) {
        console.error("Drain initiation error", err);
        fetchLGDevices(true);
      }
      return;
    }
    
    // Standard power toggle for other cases
    const mode = cur.isPoweredOn ? "POWER_OFF" : "POWER_ON";

    // optimistic UI
    setLgStatus(ps => ({
      ...ps,
      [dev.deviceId]: {
        ...ps[dev.deviceId],
        isPoweredOn: !ps[dev.deviceId]?.isPoweredOn,
        currentState: !ps[dev.deviceId]?.isPoweredOn ? "Turning on..." : "Turning off..."
      }
    }));

    try {
      await fetch(
        `https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/${dev.deviceType}/control`,
        {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ data:{ deviceId: dev.deviceId, mode } })
        }
      );
      // Refresh data immediately after successful power action
      setTimeout(() => fetchLGDevices(false), 2000);
    } catch(err) {
      console.error("Power toggle error", err);
      fetchLGDevices(true);
    }
  };

  // Cycle selection
  const handleCycleSelect = async (deviceId: string, cycle: string) => {
    setSelectedCycles(ps => ({ ...ps, [deviceId]: cycle }));
  };

  // Start/Stop operation
  const handleStartStop = async (dev: LGDevice) => {
    const isCurrentlyRunning = isRunningState(lgStatus[dev.deviceId]?.currentState || '');
    const mode = isCurrentlyRunning ? 'STOP' : 'START';
    const cycle = selectedCycles[dev.deviceId] || 'NORMAL';

    // Optimistic UI update
    setLgStatus(ps => ({
      ...ps,
      [dev.deviceId]: {
        ...ps[dev.deviceId],
        currentState: isCurrentlyRunning ? 'Stopping...' : 'Starting...'
      }
    }));

    try {
      const payload: any = { 
        deviceId: dev.deviceId, 
        mode 
      };
      
      // Include cycle for START operations
      if (mode === 'START') {
        payload.cycle = cycle;
      }

      await fetch(
        `https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/${dev.deviceType}/control`,
        {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ data: payload })
        }
      );
      
      // Refresh status after a short delay
      setTimeout(() => fetchLGDevices(false), 2000);
    } catch(err) {
      console.error("Start/Stop error", err);
      fetchLGDevices(true);
    }
  };

  // Helper function to process device status data - extracted for reuse between batch and individual calls
  const processDeviceStatus = (dev: LGDevice, data: any): LGDeviceStatus => {
    // Determine currentState + active
    let cs = data.currentState || "UNKNOWN";
    let active = isRunningState(cs);

    if (data.rawState) {
      if (data.rawState.runState?.currentState && isRunningState(data.rawState.runState.currentState)) {
        cs = data.rawState.runState.currentState; active = true;
      } else if (Array.isArray(data.rawState)) {
        for (const st of data.rawState) {
          if (st.runState?.currentState && isRunningState(st.runState.currentState)) {
            cs = st.runState.currentState; active = true; break;
          }
        }
      }
    }
    if (!active && data.rawState?.operation && data.rawState.operation !== "OFF") {
      cs = data.rawState.operation; active = true;
    }

    // Extract remainingTime from multiple fallbacks
    let rt: string|undefined = data.remainingTime?.toString();

    // rawState.runState
    if (!rt && data.rawState?.runState?.remainingTime) {
      rt = data.rawState.runState.remainingTime.toString();
    }

    // rawState array entries
    if (!rt && Array.isArray(data.rawState)) {
      for (const st of data.rawState) {
        if (st.runState?.remainingTime) {
          rt = st.runState.remainingTime.toString();
          break;
        }
        if (st.remainingTimeMinute || st.remainingTime) {
          rt = (st.remainingTimeMinute || st.remainingTime).toString();
          break;
        }
      }
    }

    // rawState.timer remainHour/remainMinute
    if (!rt && data.rawState?.timer) {
      const t = data.rawState.timer;
      // First try remainHour/remainMinute
      if (typeof t.remainHour === "number" && typeof t.remainMinute === "number") {
        const total = t.remainHour * 60 + t.remainMinute;
        if (total > 0) rt = total.toString();
      }
      // For dryers, also try totalHour/totalMinute if remainingTime is 0 but device is running
      if (!rt && dev.deviceType === "dryer" && active && 
          typeof t.totalHour === "number" && typeof t.totalMinute === "number") {
        const total = t.totalHour * 60 + t.totalMinute;
        if (total > 0) rt = total.toString();
      }
      // Also try relativeHourToStop/relativeMinuteToStop for dryers
      if (!rt && dev.deviceType === "dryer" && 
          typeof t.relativeHourToStop === "number" && typeof t.relativeMinuteToStop === "number") {
        const total = t.relativeHourToStop * 60 + t.relativeMinuteToStop;
        if (total > 0) rt = total.toString();
      }
    }

    // rawProfile.property[].runState.currentState.value.rt
    if (!rt && data.rawProfile?.property && Array.isArray(data.rawProfile.property)) {
      for (const prop of data.rawProfile.property) {
        const v = prop.runState?.currentState?.value;
        if (v && typeof v === "object" && v.rt) {
          rt = v.rt.toString();
          break;
        }
      }
    }

    // dryer-specific nested props
    if (!rt && dev.deviceType === "dryer" && data.rawState && typeof data.rawState === "object") {
      const names = ["rtime","rem_time","timeLeft","remTime","timeRemaining"];
      const search = (obj: any): string|undefined => {
        if (typeof obj !== "object" || Array.isArray(obj)) return undefined;
        for (const key of Object.keys(obj)) {
          if (names.includes(key) && (typeof obj[key] === "number" || typeof obj[key] === "string")) {
            return obj[key].toString();
          }
          const res = search(obj[key]);
          if (res) return res;
        }
        return undefined;
      };
      const found = search(data.rawState);
      if (found) rt = found;
    }

    return {
      currentState: active ? cs : data.currentState,
      isPoweredOn: data.isPoweredOn ?? false, // Fallback to false if undefined
      remoteControlEnabled: data.remoteControlEnabled,
      rawState: data.rawState,
      remainingTime: rt,
      lastUpdated: Date.now(),
      _debug: data._debug // Include debug info if available
    };
  };

  // Fetch available cycles for a device
  const fetchAvailableCycles = async (deviceId: string) => {
    try {
      const response = await fetch(
        "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/lg/washer/cycles",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ data: { deviceId } })
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        // The API returns the cycles directly from getAvailableCycles
        const cycles = Array.isArray(result) ? result : [];
        const finalCycles = cycles.length > 0 ? cycles : fallbackCycles;
        
        setAvailableCycles(prev => ({
          ...prev,
          [deviceId]: finalCycles
        }));
        return finalCycles;
      } else {
        console.warn(`Failed to fetch cycles for device ${deviceId}, using fallback`);
        setAvailableCycles(prev => ({
          ...prev,
          [deviceId]: fallbackCycles
        }));
        return fallbackCycles;
      }
    } catch (error) {
      console.error(`Error fetching cycles for device ${deviceId}:`, error);
      setAvailableCycles(prev => ({
        ...prev,
        [deviceId]: fallbackCycles
      }));
      return fallbackCycles;
    }
  };

  // Fetch cycles for all devices
  const fetchCyclesForAllDevices = async (devices: LGDevice[]) => {
    const cyclePromises = devices
      .filter(device => device.deviceType === "washer" || device.deviceType === "dryer")
      .map(device => fetchAvailableCycles(device.deviceId));
    
    await Promise.all(cyclePromises);
  };

  // Adaptive polling based on device states
  useEffect(() => {
    fetchLGDevices(true);
  }, []);

  // Separate effect for adaptive polling with visibility optimization
  useEffect(() => {
    if (lgLoading) return; // Don't start polling until initial load is complete
    
    // Check if page is visible - pause polling when page is hidden
    const isVisible = () => !document.hidden;
    
    const scheduleNext = () => {
      if (isVisible()) {
        const timeoutId = setTimeout(() => {
          fetchLGDevices(false);
        }, activePollingInterval);
        return timeoutId;
      } else {
        // If page is hidden, check visibility more frequently but don't poll data
        const timeoutId = setTimeout(scheduleNext, 5000);
        return timeoutId;
      }
    };
    
    const timeoutId = scheduleNext();
    
    // Listen for visibility changes
    const handleVisibilityChange = () => {
      if (isVisible()) {
        // Resume polling immediately when page becomes visible
        fetchLGDevices(false);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activePollingInterval, lgLoading]); // Use activePollingInterval for actual timing

  return (
    <div className="flex flex-col space-y-6 w-screen -ml-4 px-4">
      <div className="relative p-4 bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-xl shadow-lg overflow-hidden w-full">
        {/* Glass reflective overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent h-1/3 pointer-events-none"></div>
        
        {/* LG Logo (Top Right) */}
        <div className="absolute top-4 right-4">
          <OptimizedImage 
            src="/lg.svg" 
            alt="LG" 
            className="h-8 w-auto opacity-70" 
            loading="lazy" 
            decoding="async" 
          />
        </div>
        
        {/* Header */}
        <div className="text-gray-200 text-base font-bold mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-blue-400 text-xl">🧺</span>
            <span>Laundry Appliances</span>
            {!lgLoading && !isRefreshing && (
              <button 
                onClick={() => fetchLGDevices(true)}
                className="w-8 h-8 rounded-full bg-gray-800/80 hover:bg-gray-700/90 text-blue-400 border border-gray-700/50 
                          transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                          flex items-center justify-center touch-manipulation transform tap-highlight-transparent active:scale-95 ml-2"
                aria-label="Refresh devices"
                style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
              >
                <UilHistory size={16} />
              </button>
            )}
            
            {isRefreshing && (
              <div className="w-8 h-8 rounded-full bg-gray-800/80 text-blue-400 border border-gray-700/50 ml-2 flex items-center justify-center">
                <UilSync size={16} className="animate-spin" />
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          {/* Error State */}
          {lgError && (
            <div className="mb-5 p-4 bg-red-900/20 border border-red-700/40 rounded-lg text-red-300 text-sm shadow-inner">
              <div className="flex items-start">
                <UilBell size={20} className="text-red-400 mr-3 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-red-200 mb-1">Connection Error</p>
                  <p>{lgError}</p>
                  <div className="mt-3 flex space-x-3">
                    <button
                      onClick={() => {
                        fetchLGDevices(true);
                        triggerHapticFeedback(hapticPatterns.SUCCESS);
                      }}
                      className="px-4 py-2 bg-red-800/60 hover:bg-red-700/70 text-white rounded-lg text-sm flex items-center space-x-2
                                transition-colors duration-300 border border-red-600/50 shadow-sm
                                tap-highlight-transparent active:scale-95 min-h-[48px] touch-manipulation transform"
                      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
                    >
                      <UilSync size={16} />
                      <span>Retry Connection</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {lgLoading ? (
            <>
                <div className="py-6 flex flex-col items-center justify-center text-gray-300 mb-6">
                  <div className="bg-gray-800/80 p-4 rounded-full border border-gray-600/50 shadow-inner mb-4">
                    <UilSync className="animate-spin text-blue-400" size={36} />
                  </div>
                  <p className="text-lg">Loading smart appliances...</p>
                  <p className="text-gray-500 text-sm mt-2">Please wait while we connect to your devices</p>
                </div>
              
              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[...Array(2)].map((_, i) => (
                  <DeviceCardSkeleton key={i} />
                ))}
              </div>
            </>
          ) : (
            <>                {/* Empty State */}
                {lgDevices.length === 0 && !lgError ? (
                  <div className="py-10 flex flex-col items-center justify-center text-gray-300">
                    <div className="bg-gray-800/80 p-4 rounded-full border border-gray-600/50 shadow-inner mb-4">
                      <UilPower className="text-gray-400" size={36} />
                    </div>
                    <p className="text-lg">No smart appliances found</p>
                    <p className="text-gray-500 text-sm mt-2">Connect your smart home appliances to see them here</p>
                  </div>
                ) : (
                  /* Device Grid - Check for paired washer/dryer first */
                  (() => {
                    const washer = lgDevices.find(d => d.deviceType === "washer");
                    const dryer = lgDevices.find(d => d.deviceType === "dryer");
                    const otherDevices = lgDevices.filter(d => d.deviceType !== "washer" && d.deviceType !== "dryer");
                    
                    return (
                      <div className="space-y-4 animate-fade-in">
                        {/* Paired Washer/Dryer Component */}
                        {washer && dryer && (
                          <div className="mb-4">
                            <LGPairedDeviceCard
                              washer={washer}
                              dryer={dryer}
                              washerStatus={lgStatus[washer.deviceId] || { currentState: "UNKNOWN", isPoweredOn: false }}
                              dryerStatus={lgStatus[dryer.deviceId] || { currentState: "UNKNOWN", isPoweredOn: false }}
                              selectedCycles={selectedCycles}
                              availableCycles={availableCycles}
                              onPowerToggle={handlePowerToggle}
                              onCycleSelect={handleCycleSelect}
                              onStartStop={handleStartStop}
                            />
                          </div>
                        )}
                        
                        {/* Individual device cards for remaining devices */}
                        {(washer && !dryer) || (!washer && dryer) || otherDevices.length > 0 ? (
                          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {/* Show individual washer or dryer if only one is present */}
                            {washer && !dryer && (
                              <LGDeviceCard
                                key={washer.deviceId}
                                device={washer}
                                status={lgStatus[washer.deviceId] || { currentState: "UNKNOWN", isPoweredOn: false }}
                                selectedCycle={selectedCycles[washer.deviceId]}
                                availableCycles={availableCycles[washer.deviceId]}
                                onPowerToggle={() => handlePowerToggle(washer)}
                                onCycleSelect={cycle => handleCycleSelect(washer.deviceId, cycle)}
                                onStartStop={() => handleStartStop(washer)}
                              />
                            )}
                            {!washer && dryer && (
                              <LGDeviceCard
                                key={dryer.deviceId}
                                device={dryer}
                                status={lgStatus[dryer.deviceId] || { currentState: "UNKNOWN", isPoweredOn: false }}
                                selectedCycle={selectedCycles[dryer.deviceId]}
                                availableCycles={availableCycles[dryer.deviceId]}
                                onPowerToggle={() => handlePowerToggle(dryer)}
                                onCycleSelect={cycle => handleCycleSelect(dryer.deviceId, cycle)}
                                onStartStop={() => handleStartStop(dryer)}
                              />
                            )}
                            
                            {/* Show other device types */}
                            {otherDevices.map(dev => (
                              <LGDeviceCard
                                key={dev.deviceId}
                                device={dev}
                                status={lgStatus[dev.deviceId] || { currentState: "UNKNOWN", isPoweredOn: false }}
                                selectedCycle={selectedCycles[dev.deviceId]}
                                availableCycles={availableCycles[dev.deviceId]}
                                onPowerToggle={() => handlePowerToggle(dev)}
                                onCycleSelect={cycle => handleCycleSelect(dev.deviceId, cycle)}
                                onStartStop={() => handleStartStop(dev)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                )}
              
              {/* Last Updated */}
              {lgDevices.length > 0 && (
                <div className="mt-5 text-xs text-gray-400 text-center flex items-center justify-center">
                  <UilClock size={14} className="mr-1.5" />
                  Last updated: {new Date(lastUpdateTime).toLocaleTimeString()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LGAppliances;
