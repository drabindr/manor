import React, { useEffect, useContext, useCallback, useState, useRef } from "react";
import {
  UilHouseUser,
  UilShieldCheck,
  UilLockOpenAlt,
} from "@iconscout/react-unicons";
import { EventContext } from "./EventContext";
import { wsService } from "./WebSocketService";

type ArmMode = "stay" | "away" | null;

interface AlarmControlsProps {
  armMode: ArmMode;
  setArmMode: React.Dispatch<React.SetStateAction<ArmMode>>;
  isOnline: boolean;
  setIsOnline: React.Dispatch<React.SetStateAction<boolean>>;
  showNotification: (message: string, type: string, command?: string) => void;
  refreshing: boolean;
  onAlarmStateChange?: () => void; // Add optional callback for alarm state changes
}

const AlarmControls: React.FC<AlarmControlsProps> = ({
  armMode,
  setArmMode,
  isOnline,
  setIsOnline,
  showNotification,
  refreshing,
  onAlarmStateChange,
}) => {
  const { addEvent } = useContext(EventContext);
  const [commandPending, setCommandPending] = useState(false);
  const [lastStateUpdate, setLastStateUpdate] = useState<number>(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const disconnectNotificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const MAX_RETRY_ATTEMPTS = 3;
  const COMMAND_ACK_TIMEOUT = 12000; // 12 seconds
  const DISCONNECT_NOTIFICATION_DELAY = 8000; // 8 seconds

  const updateArmModeFromSystemState = useCallback(
    (state: string | undefined) => {
      if (state === "Arm Stay" || state?.includes("(auto)")) {
        setArmMode("stay");
      } else if (state === "Arm Away") {
        setArmMode("away");
      } else if (state === "Disarm") {
        setArmMode(null);
      }
      
      // Notify parent component about the alarm state change
      if (onAlarmStateChange) {
        onAlarmStateChange();
      }
    },
    [setArmMode, onAlarmStateChange]
  );

  // Handle timeout/retry for commands
  const checkCommandStatus = useCallback((commandName: string, attemptCount: number = 0) => {
    if (!commandPending || attemptCount >= MAX_RETRY_ATTEMPTS) {
      if (attemptCount >= MAX_RETRY_ATTEMPTS) {
        setCommandPending(false);
        setPendingCommand(null);
        setPendingCommandId(null);
        setRetryAttempts(0);
        showNotification(`${commandName} command may have failed, please check system status`, "warning", commandName);
      }
      return;
    }

    // Request the current state to see if command was successful
    wsService.sendCommand("GetSystemState");
    setRetryAttempts(attemptCount + 1);
    
    // Schedule another check
    setTimeout(() => {
      // Only continue checking if command is still pending
      if (commandPending && pendingCommand === commandName) {
        checkCommandStatus(commandName, attemptCount + 1);
      }
    }, 5000);
  }, [commandPending, pendingCommand, showNotification]);

  const handleWsEvent = useCallback(
    (event: CustomEvent) => {
      const eventData = event.detail;
      
      if (eventData.type === "connected" || eventData.type === "pong") {
        setIsOnline(true);
        
        // Cancel any pending disconnect notification when connection is restored
        if (disconnectNotificationTimeoutRef.current) {
          clearTimeout(disconnectNotificationTimeoutRef.current);
          disconnectNotificationTimeoutRef.current = null;
        }
        
        if (eventData.type === "connected") {
          wsService.sendCommand("GetSystemState");
        }
      } else if (eventData.type === "disconnected" || eventData.type === "error") {
        setIsOnline(false);
        
        // Use delayed notification mechanism to avoid noise during brief interruptions
        if (!disconnectNotificationTimeoutRef.current) {
          disconnectNotificationTimeoutRef.current = setTimeout(() => {
            // Double-check that connection is still offline before showing notification
            if (!wsService.isOnline()) {
              showNotification("Disconnected from security system", "error");
            }
            disconnectNotificationTimeoutRef.current = null;
          }, DISCONNECT_NOTIFICATION_DELAY);
        }
      } else if (eventData.type === "command_ack") {
        const { command, state, success } = eventData.data;
        
        // Only handle if it matches our pending command
        if (command === pendingCommand) {
          if (success) {
            // Update state if provided
            if (state) {
              updateArmModeFromSystemState(state);
              setLastStateUpdate(Date.now());
            }
            
            // Clear pending state since command was successful
            setCommandPending(false);
            setPendingCommand(null);
            setPendingCommandId(null);
            setRetryAttempts(0);
            setFetchError(null);
            
            showNotification(`${command} executed successfully`, "success", command);
            
            // Notify parent component about the alarm state change
            if (onAlarmStateChange) {
              onAlarmStateChange();
            }
          }
        }
      } else if (eventData.type === "command_timeout") {
        const { command, commandId } = eventData.data;
        
        if (commandId === pendingCommandId) {
          console.log("Command timed out:", command);
          
          if (command) {
            showNotification(`${command} is processing, verifying status...`, "info", command);
            checkCommandStatus(command);
          }
        }
      } else if (eventData.type === "command_sent") {
        const { command, commandId } = eventData.data;
        
        if (commandId === pendingCommandId) {
          showNotification(`${command} sent to system, awaiting result...`, "info", command);
        }
      } else if (eventData.type === "system_state") {
        const state = eventData.data?.state;
        if (state) {
          updateArmModeFromSystemState(state);
          setLastStateUpdate(Date.now());
          setFetchError(null);
          
          // If we were waiting for a command and the state matches, command succeeded
          if (commandPending && pendingCommand) {
            const expectedState = 
              pendingCommand === "Arm Stay" ? "Arm Stay" :
              pendingCommand === "Arm Away" ? "Arm Away" :
              pendingCommand === "Disarm" ? "Disarm" : null;
              
            if (state === expectedState) {
              setCommandPending(false);
              setPendingCommand(null);
              setPendingCommandId(null);
              setRetryAttempts(0);
              showNotification(`${pendingCommand} executed successfully`, "success", pendingCommand);
            }
          }
        }
      } else if (eventData.type === "command_queued") {
        const { command } = eventData.data;
        showNotification(`${command} queued, awaiting connection`, "info", command);
      }
    },
    [
      setIsOnline,
      updateArmModeFromSystemState,
      showNotification,
      pendingCommand,
      pendingCommandId,
      commandPending,
      checkCommandStatus,
      onAlarmStateChange
    ]
  );

  useEffect(() => {
    const listener = (event: Event) => handleWsEvent(event as CustomEvent);
    wsService.on("event", listener);
    setIsOnline(wsService.isOnline());
    
    // Initial connection
    if (!wsService.isOnline()) {
      wsService.connect();
    } else {
      // If already connected, request current state
      wsService.sendCommand("GetSystemState");
    }
    
    // Periodic connection check
    const connectionCheckInterval = setInterval(() => {
      const isCurrentlyOnline = wsService.isOnline();
      setIsOnline(isCurrentlyOnline);
      
      // If connection was restored, request current state
      if (isCurrentlyOnline && !isOnline) {
        wsService.sendCommand("GetSystemState");
      }
    }, 10000);
    
    return () => {
      wsService.off("event", listener);
      clearInterval(connectionCheckInterval);
      
      // Clean up disconnect notification timeout on unmount
      if (disconnectNotificationTimeoutRef.current) {
        clearTimeout(disconnectNotificationTimeoutRef.current);
        disconnectNotificationTimeoutRef.current = null;
      }
    };
  }, [handleWsEvent, isOnline]);

  useEffect(() => {
    if (armMode !== null) {
      document.body.classList.add("armed-border");
    } else {
      document.body.classList.remove("armed-border");
    }
  }, [armMode]);

  // Click outside handler for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [dropdownOpen]);

  const armStay = () => {
    if (refreshing || commandPending) return;
    
    // If system is already armed in stay mode, don't send the command
    if (armMode === "stay") {
      showNotification("System is already armed in Stay mode", "info");
      return;
    }
    
    const confirmed = window.confirm("Are you sure you want to arm the system in STAY mode?");
    if (!confirmed) return;
    
    setFetchError(null);
    setCommandPending(true);
    setPendingCommand("Arm Stay");
    
    console.log("Sending Arm Stay command via wsService");
    const commandId = wsService.sendCommand("Arm Stay");
    setPendingCommandId(commandId);
    
    setTimeout(() => {
      if (commandPending && pendingCommand === "Arm Stay" && pendingCommandId === commandId) {
        checkCommandStatus("Arm Stay");
      }
    }, COMMAND_ACK_TIMEOUT);
  };

  const armAway = () => {
    if (refreshing || commandPending) return;
    
    const confirmed = window.confirm("Are you sure you want to arm the system in AWAY mode?");
    if (!confirmed) return;
    
    setFetchError(null);
    setCommandPending(true);
    setPendingCommand("Arm Away");
    
    console.log("Sending Arm Away command via wsService");
    const commandId = wsService.sendCommand("Arm Away");
    setPendingCommandId(commandId);
    
    setTimeout(() => {
      if (commandPending && pendingCommand === "Arm Away" && pendingCommandId === commandId) {
        checkCommandStatus("Arm Away");
      }
    }, COMMAND_ACK_TIMEOUT);
  };

  const disarm = () => {
    if (refreshing || commandPending) return;
    
    const confirmed = window.confirm("Are you sure you want to disarm the system?");
    if (!confirmed) return;
    
    setFetchError(null);
    setCommandPending(true);
    setPendingCommand("Disarm");
    
    console.log("Sending Disarm command via wsService");
    const commandId = wsService.sendCommand("Disarm");
    setPendingCommandId(commandId);
    
    setTimeout(() => {
      if (commandPending && pendingCommand === "Disarm" && pendingCommandId === commandId) {
        checkCommandStatus("Disarm");
      }
    }, COMMAND_ACK_TIMEOUT);
  };

  function convertUTCtoEST(utcDateStr: string): string {
    try {
      const utcDate = new Date(utcDateStr);
      if (isNaN(utcDate.getTime())) throw new Error("Invalid Date");
      
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      };
      
      const estDate = new Intl.DateTimeFormat("en-US", options).format(utcDate);
      return estDate.replace(",", "");
    } catch (error) {
      console.error("Failed to convert UTC to EST:", error);
      return utcDateStr;
    }
  }

  return (
    <div className="flex items-center">
      {fetchError && (
        <div className="mr-4 p-2 bg-red-600/20 border border-red-600/40 rounded-md text-center">
          <p className="text-sm text-red-400">{fetchError}</p>
        </div>
      )}
      {retryAttempts > 0 && (
        <div className="mr-4 p-2 bg-yellow-600/20 border border-yellow-600/40 rounded-md text-center">
          <p className="text-sm text-yellow-400">Verifying command... ({retryAttempts}/{MAX_RETRY_ATTEMPTS})</p>
        </div>
      )}
      {/* Alarm Control Buttons - Compact horizontal layout for header */}
      {armMode === null ? (
        <div className="relative group" ref={dropdownRef}>
          {/* Unified split button container */}
          <div className={`flex items-center rounded-xl shadow-md overflow-hidden
                         bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700
                         border border-blue-400/30
                         transition-all duration-200 ease-in-out
                         ${
                           commandPending || refreshing
                             ? "opacity-60 cursor-not-allowed scale-95"
                             : "hover:shadow-lg hover:shadow-blue-500/25 hover:scale-105 hover:border-blue-300/50"
                         }`}
               style={{ minHeight: '40px' }}
          >
            {/* Main ARM STAY button */}
            <button
              onClick={armStay}
              disabled={commandPending || refreshing}
              className="relative flex items-center justify-center gap-2 py-2.5 px-3 pr-2 text-sm font-semibold text-white
                       transition-all duration-200 ease-in-out
                       hover:bg-white/10 active:scale-95 active:bg-white/20"
              style={{ minWidth: '70px' }}
            >
              {commandPending && pendingCommand === "Arm Stay" ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-lg">🔒</span>
              )}
              <span className="text-white tracking-wide hidden sm:inline">STAY</span>
            </button>
            
            {/* Divider line */}
            <div className="w-px h-6 bg-blue-400/40"></div>
            
            {/* Dropdown arrow button */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              disabled={commandPending || refreshing}
              className="relative flex items-center justify-center py-2.5 px-2 text-white
                       transition-all duration-200 ease-in-out
                       hover:bg-white/10 active:scale-95 active:bg-white/20"
              style={{ width: '32px' }}
            >
              <svg 
                className={`w-7 h-7 text-white/90 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-xl z-50 min-w-[120px]">
              <button
                onClick={() => {
                  armAway();
                  setDropdownOpen(false);
                }}
                disabled={commandPending || refreshing}
                className={`w-full flex items-center gap-2 py-2.5 px-3 text-sm font-semibold text-white
                         transition-all duration-200 ease-in-out rounded-xl
                         ${
                           commandPending || refreshing
                             ? "opacity-60 cursor-not-allowed"
                             : "hover:bg-green-600/20 hover:border-green-400/30 active:scale-95"
                         }`}
              >
                {commandPending && pendingCommand === "Arm Away" ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-lg">🔑</span>
                )}
                <span className="text-green-300 tracking-wide">ARM AWAY</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={disarm}
          disabled={commandPending || refreshing}
          className={`relative flex items-center justify-center gap-2 py-2 px-4 text-sm font-bold rounded-lg text-white shadow-md
                   bg-gradient-to-r from-red-600 via-red-500 to-red-600
                   transition-transform duration-150
                   ${
                     commandPending || refreshing
                       ? "opacity-75 cursor-not-allowed"
                       : "active:scale-95 active:shadow-inner hover:bg-red-700"
                   }`}
        >
          {commandPending && pendingCommand === "Disarm" ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg">🔓</span>
          )}
          <span>Disarm</span>
        </button>
      )}
    </div>
  );
};

export default AlarmControls;