import React, { useState, useEffect, memo } from "react";
import { UilSync, UilPower, UilClock, UilHistory, UilCheck, UilBell } from "@iconscout/react-unicons";
import { triggerHapticFeedback, hapticPatterns } from "./utils/haptics";
import { DeviceCardSkeleton } from "./components/DeviceCardSkeleton";

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

// Helper to format running state for display
const formatRunningState = (state: string): string => {
  if (!state) return "UNKNOWN";
  return state.charAt(0) + state.slice(1).toLowerCase();
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
  onCycleSelect,
  onPowerToggle,
  onStartStop
}: {
  device: LGDevice;
  status: LGDeviceStatus;
  selectedCycle?: string;
  onCycleSelect: (cycle: string) => void;
  onPowerToggle: () => void;
  onStartStop: () => void;
}) => {
  const [reconnecting, setReconnecting] = useState(false);
  const cycles = ["NORMAL","TOWEL","DELICATE","BEDDING"];
  const iconMap = {
    washer: "washing-machine.png",
    dryer: "dryer.png",
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
    <div className="relative bg-gradient-to-b from-gray-700/40 to-gray-800/80 rounded-lg border border-gray-600/30 overflow-hidden shadow-lg transition-all duration-300 hover:shadow-blue-900/20 active:scale-[0.995] hover:border-gray-500/50">
      {/* Status Indicator */}
      <div className={`absolute top-0 left-0 right-0 h-1 transition-colors duration-300 ${
        isActive
          ? "bg-blue-500 animate-pulse"
          : status.isPoweredOn
            ? "bg-green-400"
            : "bg-red-400"
      }`} />

      {/* Running Animation */}
      {isActive && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
          </div>
        </div>
      )}

      {/* Compact Header */}
      <div className="p-3 flex items-center space-x-2.5">
        <div className="w-10 h-10 flex items-center justify-center bg-gray-800 rounded-lg border border-gray-600/50 shadow-inner flex-shrink-0">
          <img
            src={`/device_icons/${iconMap[device.deviceType]}`}
            alt={device.deviceType}
            className="w-7 h-7 object-contain opacity-90 transition-opacity duration-300"
            onError={handleImgError}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-100 font-medium text-sm truncate leading-tight">
            {device.deviceName !== "Unknown Device"
              ? device.deviceName
              : `LG ${device.deviceType[0].toUpperCase() + device.deviceType.slice(1)}`}
          </h3>
          <div className="text-gray-400 text-xs truncate">
            {device.modelName !== "Unknown Model"
              ? device.modelName
              : "Reconnecting..."}
          </div>

          {/* Timer inline */}
          {showTimer && status.remainingTime && (
            <div className="text-xs text-blue-300 flex items-center mt-0.5">
              <UilClock className="h-3 w-3 mr-1" />
              {status.remainingTime} min left
            </div>
          )}
        </div>
        <div className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300 flex-shrink-0 ${
          device.deviceType === "unknown"
            ? "bg-yellow-900/30 text-yellow-300 border border-yellow-800/30"
            : isActive
              ? "bg-blue-900/40 text-blue-200 border border-blue-800/40 animate-pulse"
              : status.isPoweredOn
                ? "bg-green-900/40 text-green-200 border border-green-800/40"
                : "bg-red-900/40 text-red-200 border border-red-800/40"
        }`}>
          {badgeText}
        </div>
      </div>

      {/* Compact Controls */}
      <div className="px-3 pb-3">
        <div className="flex gap-2">
          {/* Power Button - Smaller */}
          {device.deviceType === "unknown" ? (
            <button
              onClick={() => {
                setReconnecting(true);
                onPowerToggle();
                triggerHapticFeedback(hapticPatterns.WARNING);
                setTimeout(() => setReconnecting(false), 3000);
              }}
              className="flex-1 py-2 px-3 rounded-md text-xs font-medium flex items-center justify-center
                       transition-all duration-300 bg-yellow-700/60 hover:bg-yellow-600/70 active:bg-yellow-800/80
                       text-white border border-yellow-500/50 shadow-sm hover:shadow active:shadow-inner
                       tap-highlight-transparent active:scale-95"
              disabled={reconnecting}
            >
              <UilSync size={14} className={`mr-1.5 ${reconnecting ? 'animate-spin' : ''}`} />
              <span>{reconnecting ? 'Reconnecting...' : 'Reconnect'}</span>
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
                className={`px-3 py-2 rounded-md text-xs font-medium flex items-center justify-center
                           transition-all duration-300 ${
                             status.remoteControlEnabled === false
                               ? "bg-gray-600/50 text-gray-400 border border-gray-500/30 cursor-not-allowed"
                               : status.isPoweredOn
                               ? "bg-red-700/60 hover:bg-red-600/70 active:bg-red-800/80 text-white border border-red-500/50"
                               : "bg-green-700/60 hover:bg-green-600/70 active:bg-green-800/80 text-white border border-green-500/50"
                           } shadow-sm hover:shadow active:shadow-inner tap-highlight-transparent active:scale-95`}
              >
                <UilPower size={14} className={`mr-1 ${reconnecting ? 'animate-spin' : ''}`} />
                <span>
                  {status.remoteControlEnabled === false 
                    ? "Remote Disabled" 
                    : status.isPoweredOn ? "Off" : "On"}
                </span>
              </button>

              {/* Cycle Dropdown - More compact */}
              <select
                value={selectedCycle || ""}
                onChange={(e) => {
                  if (e.target.value) {
                    onCycleSelect(e.target.value);
                    triggerHapticFeedback();
                  }
                }}
                disabled={!status.isPoweredOn}
                className={`flex-1 py-2 px-3 rounded-md text-xs border transition-all duration-300
                          ${!status.isPoweredOn
                            ? "bg-gray-700/50 text-gray-500 border-gray-500/30 cursor-not-allowed"
                            : selectedCycle
                              ? "bg-blue-700/60 text-white border-blue-500/50"
                              : "bg-gray-700/80 text-gray-300 border-gray-500/50 hover:bg-gray-600/90"
                          } focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
              >
                <option value="">Select Cycle</option>
                {cycles.map(cycle => (
                  <option key={cycle} value={cycle} className="bg-gray-800 text-gray-100">
                    {cycle}
                  </option>
                ))}
              </select>

              {/* Start/Stop button - Only show when cycle selected */}
              {selectedCycle && (
                <button
                  onClick={() => {
                    onStartStop();
                    triggerHapticFeedback(hapticPatterns.SUCCESS);
                  }}
                  disabled={!status.isPoweredOn}
                  className={`px-3 py-2 rounded-md text-xs font-medium transition-all duration-300
                            ${isActive
                              ? "bg-red-600/70 hover:bg-red-500/80 text-white border border-red-400/50"
                              : "bg-blue-600/70 hover:bg-blue-500/80 text-white border border-blue-400/50"
                            } shadow-sm hover:shadow active:shadow-inner tap-highlight-transparent active:scale-95`}
                >
                  {isActive ? "Stop" : "Start"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Temporary debug for running state detection */}
      {device.deviceType === "dryer" && (
        <div className="text-cyan-300 text-xs mt-1 font-mono">
          State: {status.currentState} | Running: {isActive.toString()} | Timer: {status.remainingTime || 'none'}
        </div>
      )}
    </div>
  );
});

const LGAppliances: React.FC = () => {
  const [lgDevices, setLgDevices] = useState<LGDevice[]>([]);
  const [lgStatus, setLgStatus] = useState<Record<string,LGDeviceStatus>>({});
  const [selectedCycles, setSelectedCycles] = useState<Record<string,string>>({});
  const [lgLoading, setLgLoading] = useState(true);
  const [lgError, setLgError] = useState<string|null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch devices list + status
  const fetchLGDevices = async (initialLoad = false) => {
    const now = new Date();
    if (!initialLoad && now.getTime() - lastUpdateTime.getTime() < 5000) return;
    
    if (!initialLoad) {
      setIsRefreshing(true);
      triggerHapticFeedback();
    } else {
      setLgLoading(true);
    }
    
    setLastUpdateTime(now);

    try {
      // 1) List devices
      const listRes = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lg/devices/list",
        { method:"GET", headers:{ "Accept":"application/json","Content-Type":"application/json" } }
      );
      if (listRes.status === 401) {
        setLgError("LG ThinQ authorization expired. Please reconnect.");
        setLgDevices([]);
        return;
      }
      if (!listRes.ok) throw new Error(await listRes.text());
      const devices: LGDevice[] = await listRes.json();
      setLgDevices(devices);

      // 2) Fetch status for each
      const newStatus: Record<string,LGDeviceStatus> = {};
      await Promise.all(devices.map(async dev => {
        try {
          const sr = await fetch(
            "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lg/devices/status",
            {
              method:"POST",
              headers:{ "Content-Type":"application/json","Accept":"application/json" },
              body: JSON.stringify({ data:{ deviceId: dev.deviceId } })
            }
          );
          if (!sr.ok) throw new Error(await sr.text());
          const data = await sr.json();

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

          newStatus[dev.deviceId] = {
            currentState: active ? cs : data.currentState,
            isPoweredOn: data.isPoweredOn ?? false, // Fallback to false if undefined
            remoteControlEnabled: data.remoteControlEnabled,
            rawState: data.rawState,
            remainingTime: rt,
            lastUpdated: Date.now(),
            _debug: data._debug // Include debug info if available
          };
        } catch(err) {
          console.error("Status fetch error for", dev.deviceId, err);
        }
      }));

      setLgStatus(newStatus);
      setLgError(null);
    } catch(err:any) {
      console.error("fetchLGDevices error", err);
      setLgError("Failed to load LG appliances");
      setLgDevices([]);
    } finally {
      setLgLoading(false);
      setIsRefreshing(false);
    }
  };

  // Power toggle
  const handlePowerToggle = async (dev: LGDevice) => {
    const cur = lgStatus[dev.deviceId];
    
    // Safety check: ensure we have valid status data
    if (!cur) {
      console.warn('No status data available for device:', dev.deviceId);
      // Refresh data and abort this action
      fetchLGDevices(true);
      return;
    }
    
    // Note: isPoweredOn now has a fallback to false, so it shouldn't be undefined
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
        `https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lg/${dev.deviceType}/control`,
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
  const handleCycleSelect = async (dev: LGDevice, cycle: string) => {
    setSelectedCycles(ps => ({ ...ps, [dev.deviceId]: cycle }));
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
        `https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lg/${dev.deviceType}/control`,
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

  // Initial + 60s polling
  useEffect(() => {
    fetchLGDevices(true);
    const iv = setInterval(() => fetchLGDevices(false), 15000); // Reduced from 60s to 15s for more responsive updates
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="my-0">
      <div className="bg-gradient-to-b from-gray-800/70 to-gray-900/90 rounded-xl border border-gray-700/30 shadow-xl overflow-hidden relative hover:shadow-blue-900/10 transition-shadow duration-300">
        <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-gray-600/30 flex items-center justify-between bg-gradient-to-r from-gray-800/40 to-gray-800/20">
          <div className="flex items-center space-x-2.5">
            <div className="bg-gray-800 p-2 rounded-lg border border-gray-600/50 shadow-inner">
              <UilPower className="text-blue-400" size={20} />
            </div>
            <h2 className="text-gray-100 font-medium text-base">LG ThinQ Appliances</h2>
          </div>
          
          <div className="flex items-center space-x-2">
            {!lgLoading && !isRefreshing && (
              <button 
                onClick={() => fetchLGDevices(true)}
                className="p-2 rounded-full bg-gray-800/80 hover:bg-gray-700/90 text-blue-400 border border-gray-700/50 
                          transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50
                          tap-highlight-transparent active:scale-95"
                aria-label="Refresh devices"
              >
                <UilHistory size={18} />
              </button>
            )}
            
            {isRefreshing && (
              <div className="p-2 rounded-full bg-gray-800/80 text-blue-400 border border-gray-700/50">
                <UilSync size={18} className="animate-spin" />
              </div>
            )}
            
            {!lgLoading && (
              <div className="text-xs text-blue-300 bg-blue-900/40 px-3 py-1.5 rounded-full border border-blue-800/40 flex items-center space-x-2 shadow-inner">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                <span>{lgDevices.length} {lgDevices.length === 1 ? 'device' : 'devices'}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4">
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
                                tap-highlight-transparent active:scale-95"
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
                <p className="text-lg">Loading LG appliances...</p>
                <p className="text-gray-500 text-sm mt-2">Please wait while we connect to your devices</p>
              </div>
              
              <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[...Array(3)].map((_, i) => (
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
                    <p className="text-lg">No LG appliances found</p>
                    <p className="text-gray-500 text-sm mt-2">Connect your LG ThinQ account to see your devices</p>
                  </div>
                ) : (
                  /* Device Grid - More compact layout */
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 animate-fade-in">
                    {lgDevices.map(dev => (
                      <LGDeviceCard
                        key={dev.deviceId}
                        device={dev}
                        status={lgStatus[dev.deviceId] || { currentState: "UNKNOWN", isPoweredOn: false }}
                        selectedCycle={selectedCycles[dev.deviceId]}
                        onPowerToggle={() => handlePowerToggle(dev)}
                        onCycleSelect={cycle => handleCycleSelect(dev, cycle)}
                        onStartStop={() => handleStartStop(dev)}
                      />
                    ))}
                  </div>
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
