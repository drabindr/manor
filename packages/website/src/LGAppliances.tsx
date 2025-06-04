import React, { useState, useEffect, memo } from "react";
import { UilSync, UilPower, UilClock, UilHistory, UilCheck, UilBell, UilPlay, UilPause } from "@iconscout/react-unicons";
import { triggerHapticFeedback, hapticPatterns } from "./utils/haptics";
import { DeviceCardSkeleton } from "./components/DeviceCardSkeleton";
import OptimizedImage from "./components/OptimizedImage";

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

// Helper to calculate optimal polling interval based on device states
const calculatePollingInterval = (lgStatus: Record<string, LGDeviceStatus>): number => {
  let minInterval = 300000; // Default: 5 minutes for idle devices
  
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
    <div className="relative bg-gradient-to-br from-gray-700/50 via-gray-800/70 to-gray-900/90 rounded-xl border border-gray-600/40 overflow-hidden shadow-xl transition-all duration-300 hover:shadow-blue-900/30 active:scale-[0.998] hover:border-gray-500/60 backdrop-blur-sm">
      {/* Ambient glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
      
      {/* Status Indicator with enhanced design */}
      <div className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 ${
        isActive
          ? "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 animate-pulse shadow-lg shadow-blue-500/50"
          : status.isPoweredOn
            ? "bg-gradient-to-r from-green-400 via-green-500 to-green-400 shadow-md shadow-green-500/30"
            : "bg-gradient-to-r from-red-400 via-red-500 to-red-400 shadow-md shadow-red-500/30"
      }`} />

      {/* Running Animation with enhanced glow */}
      {isActive && (
        <div className="absolute top-3 right-3 z-10">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 shadow-lg shadow-blue-500/50" />
          </div>
        </div>
      )}

      {/* Enhanced Header */}
      <div className="p-4 flex items-center space-x-3">
        <div className="relative w-12 h-12 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl border border-gray-600/50 shadow-inner flex-shrink-0">
          <OptimizedImage
            src={`/device_icons/${iconMap[device.deviceType]}`}
            alt={device.deviceType}
            className="w-8 h-8 object-contain opacity-90 transition-opacity duration-300"
            onError={handleImgError}
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-xl pointer-events-none" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-100 font-semibold text-base truncate leading-tight tracking-wide">
            {device.deviceName !== "Unknown Device"
              ? device.deviceName
              : `LG ${device.deviceType[0].toUpperCase() + device.deviceType.slice(1)}`}
          </h3>
          <div className="text-gray-400 text-sm truncate mt-0.5">
            {device.modelName !== "Unknown Model"
              ? device.modelName
              : "Reconnecting..."}
          </div>

          {/* Timer inline with enhanced styling */}
          {showTimer && status.remainingTime && (
            <div className="flex items-center mt-2 px-2 py-1 bg-blue-900/30 rounded-lg border border-blue-700/40">
              <UilClock className="h-3 w-3 mr-1.5 text-blue-400" />
              <span className="text-xs text-blue-300 font-medium">{status.remainingTime} min remaining</span>
            </div>
          )}
        </div>
        <div className={`px-3 py-2 rounded-full text-xs font-semibold transition-all duration-300 flex-shrink-0 backdrop-blur-sm ${
          device.deviceType === "unknown"
            ? "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50 shadow-md shadow-yellow-500/20"
            : isActive
              ? "bg-blue-900/50 text-blue-200 border border-blue-700/60 animate-pulse shadow-lg shadow-blue-500/30"
              : status.isPoweredOn
                ? "bg-green-900/50 text-green-200 border border-green-700/60 shadow-md shadow-green-500/20"
                : "bg-red-900/50 text-red-200 border border-red-700/60 shadow-md shadow-red-500/20"
        }`}>
          {badgeText}
        </div>
      </div>

      {/* Enhanced Controls */}
      <div className="px-4 pb-4">
        <div className="flex gap-3">
          {/* Power Button */}
          {device.deviceType === "unknown" ? (
            <button
              onClick={() => {
                setReconnecting(true);
                onPowerToggle();
                triggerHapticFeedback(hapticPatterns.WARNING);
                setTimeout(() => setReconnecting(false), 3000);
              }}
              className="flex-1 py-3 px-4 rounded-lg text-sm font-semibold flex items-center justify-center
                       transition-all duration-300 bg-gradient-to-r from-yellow-700/70 to-yellow-600/70 hover:from-yellow-600/80 hover:to-yellow-500/80 active:from-yellow-800/90 active:to-yellow-700/90
                       text-white border border-yellow-500/60 shadow-lg hover:shadow-xl active:shadow-inner
                       tap-highlight-transparent active:scale-95 backdrop-blur-sm"
              disabled={reconnecting}
            >
              <UilSync size={16} className={`mr-2 ${reconnecting ? 'animate-spin' : ''}`} />
              <span>{reconnecting ? 'Reconnecting...' : 'Reconnect Device'}</span>
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
                className={`px-4 py-3 rounded-lg text-sm font-semibold flex items-center justify-center
                           transition-all duration-300 ${
                             status.remoteControlEnabled === false
                               ? "bg-gray-600/50 text-gray-400 border border-gray-500/40 cursor-not-allowed"
                               : status.isPoweredOn
                               ? "bg-gradient-to-r from-red-700/70 to-red-600/70 hover:from-red-600/80 hover:to-red-500/80 active:from-red-800/90 active:to-red-700/90 text-white border border-red-500/60 shadow-lg hover:shadow-xl"
                               : "bg-gradient-to-r from-green-700/70 to-green-600/70 hover:from-green-600/80 hover:to-green-500/80 active:from-green-800/90 active:to-green-700/90 text-white border border-green-500/60 shadow-lg hover:shadow-xl"
                           } active:shadow-inner tap-highlight-transparent active:scale-95 backdrop-blur-sm`}
              >
                <UilPower size={16} className={`mr-2 ${reconnecting ? 'animate-spin' : ''}`} />
                <span>
                  {status.remoteControlEnabled === false 
                    ? "Remote Disabled" 
                    : status.isPoweredOn ? "Turn Off" : "Turn On"}
                </span>
              </button>

              {/* Cycle Dropdown */}
              <select
                value={selectedCycle || ""}
                onChange={(e) => {
                  if (e.target.value) {
                    onCycleSelect(e.target.value);
                    triggerHapticFeedback();
                  }
                }}
                disabled={!status.isPoweredOn}
                className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium border transition-all duration-300 backdrop-blur-sm
                          ${!status.isPoweredOn
                            ? "bg-gray-700/50 text-gray-500 border-gray-500/40 cursor-not-allowed"
                            : selectedCycle
                              ? "bg-gradient-to-r from-blue-700/70 to-blue-600/70 text-white border-blue-500/60 shadow-lg"
                              : "bg-gray-700/80 text-gray-300 border-gray-500/60 hover:bg-gray-600/90 shadow-md"
                          } focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
              >
                <option value="">Select Wash Cycle</option>
                {cycles.map(cycle => (
                  <option key={cycle} value={cycle} className="bg-gray-800 text-gray-100">
                    {cycle}
                  </option>
                ))}
              </select>

              {/* Start/Stop button */}
              {selectedCycle && (
                <button
                  onClick={() => {
                    onStartStop();
                    triggerHapticFeedback(hapticPatterns.SUCCESS);
                  }}
                  disabled={!status.isPoweredOn}
                  className={`px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center justify-center backdrop-blur-sm
                            ${isActive
                              ? "bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-500/90 hover:to-red-400/90 text-white border border-red-400/60 shadow-lg hover:shadow-xl"
                              : "bg-gradient-to-r from-blue-600/80 to-blue-500/80 hover:from-blue-500/90 hover:to-blue-400/90 text-white border border-blue-400/60 shadow-lg hover:shadow-xl"
                            } active:shadow-inner tap-highlight-transparent active:scale-95`}
                >
                  {isActive ? <UilPause size={16} className="mr-2" /> : <UilPlay size={16} className="mr-2" />}
                  <span>{isActive ? "Stop Cycle" : "Start Cycle"}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Bottom accent line */}
      <div className="h-1 bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-blue-500/30" />
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
  onCycleSelect,
  onPowerToggle,
  onStartStop
}: {
  washer: LGDevice;
  dryer: LGDevice;
  washerStatus: LGDeviceStatus;
  dryerStatus: LGDeviceStatus;
  selectedCycles: Record<string, string>;
  onCycleSelect: (deviceId: string, cycle: string) => void;
  onPowerToggle: (device: LGDevice) => void;
  onStartStop: (device: LGDevice) => void;
}) => {
  const [reconnecting, setReconnecting] = useState<Record<string, boolean>>({});
  const cycles = ["NORMAL","TOWEL","DELICATE","BEDDING"];
  
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
    const deviceIcon = device.deviceType === "washer" ? "W" : "D";
    const deviceName = device.deviceType === "washer" ? "Washer" : "Dryer";
    const isReconnecting = reconnecting[device.deviceId];
    
    return (
      <div className="flex-1 relative min-w-0">
        {/* Status Indicator with enhanced design */}
        <div className={`absolute top-0 left-0 right-0 h-1 transition-all duration-500 ${
          isActive
            ? "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 animate-pulse shadow-lg shadow-blue-500/50"
            : status.isPoweredOn
              ? "bg-gradient-to-r from-green-400 via-green-500 to-green-400 shadow-md shadow-green-500/30"
              : "bg-gradient-to-r from-red-400 via-red-500 to-red-400 shadow-md shadow-red-500/30"
        }`} />

        {/* Running Animation with enhanced glow */}
        {isActive && (
          <div className="absolute top-3 right-3 z-10">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 shadow-lg shadow-blue-500/50" />
            </div>
          </div>
        )}

        {/* Device Header */}
        <div className="p-4 pb-3">
          <div className="flex items-center space-x-3 mb-3">
            <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl border border-gray-600/50 shadow-inner flex-shrink-0">
              <span className="text-blue-400 text-lg font-bold tracking-tight">{deviceIcon}</span>
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-xl pointer-events-none" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-gray-100 font-semibold text-sm truncate leading-tight tracking-wide">
                {deviceName}
              </h4>
              <div className="text-gray-400 text-xs truncate mt-0.5">
                {device.modelName !== "Unknown Model" ? device.modelName : "Reconnecting..."}
              </div>
            </div>
          </div>

          {/* Status Badge with enhanced design */}
          <div className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 backdrop-blur-sm ${
            device.deviceType === "unknown"
              ? "bg-yellow-900/40 text-yellow-300 border border-yellow-700/50 shadow-md shadow-yellow-500/20"
              : isActive
                ? "bg-blue-900/50 text-blue-200 border border-blue-700/60 animate-pulse shadow-lg shadow-blue-500/30"
                : status.isPoweredOn
                  ? "bg-green-900/50 text-green-200 border border-green-700/60 shadow-md shadow-green-500/20"
                  : "bg-red-900/50 text-red-200 border border-red-700/60 shadow-md shadow-red-500/20"
          }`}>
            {badgeText}
          </div>

          {/* Timer with enhanced styling */}
          {showTimer(device, status) && status.remainingTime && (
            <div className="flex items-center mt-2 px-2 py-1 bg-blue-900/30 rounded-lg border border-blue-700/40">
              <UilClock className="h-3 w-3 mr-1.5 text-blue-400" />
              <span className="text-xs text-blue-300 font-medium">{status.remainingTime} min remaining</span>
            </div>
          )}
        </div>

        {/* Controls with enhanced mobile optimization */}
        <div className="px-4 pb-4">
          <div className="space-y-2.5">
            {/* Power Button */}
            {device.deviceType === "unknown" ? (
              <button
                onClick={() => {
                  setReconnecting(prev => ({ ...prev, [device.deviceId]: true }));
                  onPowerToggle(device);
                  triggerHapticFeedback(hapticPatterns.WARNING);
                  setTimeout(() => setReconnecting(prev => ({ ...prev, [device.deviceId]: false })), 3000);
                }}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center
                         transition-all duration-300 bg-gradient-to-r from-yellow-700/70 to-yellow-600/70 hover:from-yellow-600/80 hover:to-yellow-500/80 active:from-yellow-800/90 active:to-yellow-700/90
                         text-white border border-yellow-500/60 shadow-lg hover:shadow-xl active:shadow-inner
                         tap-highlight-transparent active:scale-95 backdrop-blur-sm"
                disabled={isReconnecting}
              >
                <UilSync size={14} className={`mr-2 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>{isReconnecting ? 'Reconnecting...' : 'Reconnect Device'}</span>
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
                  className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center
                             transition-all duration-300 ${
                               status.remoteControlEnabled === false
                                 ? "bg-gray-600/50 text-gray-400 border border-gray-500/40 cursor-not-allowed"
                                 : status.isPoweredOn
                                 ? "bg-gradient-to-r from-red-700/70 to-red-600/70 hover:from-red-600/80 hover:to-red-500/80 active:from-red-800/90 active:to-red-700/90 text-white border border-red-500/60 shadow-lg hover:shadow-xl"
                                 : "bg-gradient-to-r from-green-700/70 to-green-600/70 hover:from-green-600/80 hover:to-green-500/80 active:from-green-800/90 active:to-green-700/90 text-white border border-green-500/60 shadow-lg hover:shadow-xl"
                             } active:shadow-inner tap-highlight-transparent active:scale-95 backdrop-blur-sm`}
                >
                  <UilPower size={14} className={`mr-2 ${isReconnecting ? 'animate-spin' : ''}`} />
                  <span>
                    {status.remoteControlEnabled === false 
                      ? "Remote Disabled" 
                      : status.isPoweredOn ? "Turn Off" : "Turn On"}
                  </span>
                </button>

                {/* Cycle Dropdown with enhanced styling */}
                <select
                  value={selectedCycles[device.deviceId] || ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      onCycleSelect(device.deviceId, e.target.value);
                      triggerHapticFeedback();
                    }
                  }}
                  disabled={!status.isPoweredOn}
                  className={`w-full py-2.5 px-3 rounded-lg text-xs font-medium border transition-all duration-300 backdrop-blur-sm
                            ${!status.isPoweredOn
                              ? "bg-gray-700/50 text-gray-500 border-gray-500/40 cursor-not-allowed"
                              : selectedCycles[device.deviceId]
                                ? "bg-gradient-to-r from-blue-700/70 to-blue-600/70 text-white border-blue-500/60 shadow-lg"
                                : "bg-gray-700/80 text-gray-300 border-gray-500/60 hover:bg-gray-600/90 shadow-md"
                            } focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                >
                  <option value="">Select Wash Cycle</option>
                  {cycles.map(cycle => (
                    <option key={cycle} value={cycle} className="bg-gray-800 text-gray-100">
                      {cycle}
                    </option>
                  ))}
                </select>

                {/* Start/Stop button with enhanced design */}
                {selectedCycles[device.deviceId] && (
                  <button
                    onClick={() => {
                      onStartStop(device);
                      triggerHapticFeedback(hapticPatterns.SUCCESS);
                    }}
                    disabled={!status.isPoweredOn}
                    className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold transition-all duration-300 flex items-center justify-center backdrop-blur-sm
                              ${isActive
                                ? "bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-500/90 hover:to-red-400/90 text-white border border-red-400/60 shadow-lg hover:shadow-xl"
                                : "bg-gradient-to-r from-blue-600/80 to-blue-500/80 hover:from-blue-500/90 hover:to-blue-400/90 text-white border border-blue-400/60 shadow-lg hover:shadow-xl"
                              } active:shadow-inner tap-highlight-transparent active:scale-95`}
                  >
                    {isActive ? <UilPause size={14} className="mr-2" /> : <UilPlay size={14} className="mr-2" />}
                    <span>{isActive ? "Stop Cycle" : "Start Cycle"}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative bg-gradient-to-br from-gray-700/50 via-gray-800/70 to-gray-900/90 rounded-xl border border-gray-600/40 overflow-hidden shadow-xl transition-all duration-300 hover:shadow-blue-900/30 active:scale-[0.998] hover:border-gray-500/60 backdrop-blur-sm">
      {/* Ambient glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
      
      {/* Header with title */}
      <div className="relative p-4 border-b border-gray-600/30 bg-gradient-to-r from-gray-800/60 to-gray-700/40">
        <div className="flex items-center justify-center space-x-3">
          <div className="relative bg-gradient-to-br from-gray-700 to-gray-800 p-2 rounded-xl border border-gray-600/50 shadow-inner">
            <UilPower className="text-blue-400" size={18} />
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent rounded-xl pointer-events-none" />
          </div>
          <h3 className="text-gray-100 font-semibold text-base tracking-wide">LG Appliances</h3>
        </div>
      </div>

      {/* Side-by-side device layout - responsive for mobile */}
      <div className="flex flex-col sm:flex-row sm:divide-x sm:divide-gray-600/30">
        <DeviceColumn device={washer} status={washerStatus} />
        
        {/* Horizontal separator for mobile */}
        <div className="block sm:hidden h-px bg-gradient-to-r from-transparent via-gray-600/50 to-transparent mx-4" />
        
        <DeviceColumn device={dryer} status={dryerStatus} />
      </div>
      
      {/* Bottom accent line */}
      <div className="h-1 bg-gradient-to-r from-blue-500/30 via-purple-500/30 to-blue-500/30" />
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
  const [currentPollingInterval, setCurrentPollingInterval] = useState<number>(15000);

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
      
      // Calculate optimal polling interval based on current device states
      const newInterval = calculatePollingInterval(newStatus);
      if (Math.abs(newInterval - currentPollingInterval) > 1000) { // Only update if difference is >1s to avoid noise
        console.log(`LG Polling interval changed: ${currentPollingInterval/1000}s -> ${newInterval/1000}s`);
        setCurrentPollingInterval(newInterval);
      }
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
        }, currentPollingInterval);
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
  }, [currentPollingInterval, lgLoading]); // Removed lgStatus to prevent infinite loops

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
                <span className="text-gray-400">•</span>
                <span>{Math.round(currentPollingInterval / 1000)}s</span>
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
