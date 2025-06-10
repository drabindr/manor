import React, { useEffect, useContext, useCallback, useState, useRef } from "react";
import {
  UilHouseUser,
  UilShieldCheck,
  UilLockOpenAlt,
} from "@iconscout/react-unicons";
import { EventContext } from "./EventContext";
import { wsService } from "./WebSocketService";
import { useAuth } from "./contexts/AuthContext";

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
  const { user, signOut } = useAuth();
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

  // Enhanced iPhone haptic feedback system
  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    // iPhone haptic feedback (iOS 13+)
    if ('hapticFeedback' in navigator && (navigator as any).hapticFeedback) {
      const intensityLevels = {
        light: 0.3,
        medium: 0.7,
        heavy: 1.0
      };
      (navigator as any).hapticFeedback.impact(intensityLevels[intensity]);
    } else if ('vibrate' in navigator) {
      // Fallback vibration patterns for other devices
      const patterns = {
        light: [30],
        medium: [50],
        heavy: [100, 50, 100]
      };
      navigator.vibrate(patterns[intensity]);
    }
  };

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
      {/* Enhanced Alarm Control Buttons - iPhone Optimized */}
      {armMode === null ? (
        <div className="relative group" ref={dropdownRef}>
          {/* Enhanced split button container with better touch targets */}
          <div className={`flex items-center rounded-xl shadow-lg overflow-hidden
                         bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700
                         border border-blue-400/30
                         transition-all duration-300 ease-in-out touch-manipulation
                         ${
                           commandPending || refreshing
                             ? "opacity-60 cursor-not-allowed scale-95"
                             : "hover:shadow-xl hover:shadow-blue-500/30 active:scale-95 hover:border-blue-300/60 transform will-change-transform"
                         }`}
               style={{ 
                 minHeight: '48px', // Increased for better touch targets
                 minWidth: '120px',
                 transform: 'translateZ(0)', // Hardware acceleration
                 WebkitTransform: 'translateZ(0)',
                 backfaceVisibility: 'hidden'
               }}
          >
            {/* Enhanced ARM STAY button with better touch targets */}
            <button
              onClick={() => {
                armStay();
                triggerHaptic('medium');
              }}
              disabled={commandPending || refreshing}
              className="relative flex items-center justify-center gap-2 py-3 px-4 pr-3 text-sm font-semibold text-white
                       transition-all duration-300 ease-in-out touch-manipulation
                       hover:bg-white/15 active:scale-95 active:bg-white/25 
                       disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ 
                minWidth: '80px',
                minHeight: '48px'
              }}
            >
              {commandPending && pendingCommand === "Arm Stay" ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-lg">🔒</span>
              )}
              <span className="text-white tracking-wide font-medium hidden sm:inline">STAY</span>
            </button>
            
            {/* Enhanced divider line */}
            <div className="w-px h-6 bg-blue-400/50 shadow-sm"></div>
            
            {/* Enhanced dropdown arrow button with better touch target */}
            <button
              onClick={() => {
                setDropdownOpen(!dropdownOpen);
                triggerHaptic('light');
              }}
              disabled={commandPending || refreshing}
              className="relative flex items-center justify-center py-3 px-3 text-white
                       transition-all duration-300 ease-in-out touch-manipulation
                       hover:bg-white/15 active:scale-95 active:bg-white/25
                       disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ 
                minWidth: '44px',
                minHeight: '48px'
              }}
            >
              <svg 
                className={`w-5 h-5 text-white/90 transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          {/* Enhanced dropdown menu with user info and controls */}
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-2 bg-gray-900/95 backdrop-blur-md border border-gray-700/50 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ minWidth: '280px' }}>
              {/* User Information Section */}
              {user && (
                <>
                  <div className="px-5 py-4 border-b border-gray-500/20">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center liquid-glass-strong"
                           style={{
                             background: "linear-gradient(135deg, rgba(255, 91, 4, 0.2), rgba(244, 212, 124, 0.15))",
                             border: "1px solid rgba(255, 91, 4, 0.3)"
                           }}>
                        <span className="text-orange-400 text-sm font-bold">
                          {user.givenName?.[0]}{user.familyName?.[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">
                          {user.givenName} {user.familyName}
                        </p>
                        <p className="text-gray-300 text-xs">{user.email}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Security Controls Section */}
              <div className="py-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2 px-4">Security Controls</p>
                <button
                  onClick={() => {
                    armAway();
                    setDropdownOpen(false);
                    triggerHaptic('medium');
                  }}
                  disabled={commandPending || refreshing}
                  className={`w-full flex items-center gap-3 py-4 px-4 text-sm font-semibold text-white
                           transition-all duration-300 ease-in-out touch-manipulation
                           ${
                             commandPending || refreshing
                               ? "opacity-60 cursor-not-allowed"
                               : "hover:bg-green-600/20 hover:border-green-400/30 active:scale-95 active:bg-green-600/30"
                           }`}
                  style={{ 
                    minHeight: '52px'
                  }}
                >
                  {commandPending && pendingCommand === "Arm Away" ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span className="text-lg">🔑</span>
                  )}
                  <span className="text-green-300 tracking-wide font-medium">ARM AWAY</span>
                </button>
              </div>

              {/* Sign Out Section */}
              {user && (
                <div className="border-t border-gray-700 py-2">
                  <button
                    onClick={() => {
                      triggerHaptic('medium');
                      signOut();
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-all duration-200 flex items-center space-x-2 min-h-[48px] touch-manipulation rounded-xl mx-2 focus:outline-none focus:ring-2 focus:ring-red-500/50 active:bg-red-900/30"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Backdrop to close dropdown */}
          {dropdownOpen && (
            <div 
              className="fixed inset-0 z-40 tap-highlight-transparent touch-manipulation" 
              onClick={() => {
                triggerHaptic('light');
                setDropdownOpen(false);
              }}
            ></div>
          )}
        </div>
      ) : (
        <button
          onClick={() => {
            disarm();
            triggerHaptic('heavy');
          }}
          disabled={commandPending || refreshing}
          className={`relative flex items-center justify-center gap-3 py-3 px-5 text-sm font-bold rounded-xl text-white shadow-lg
                   bg-gradient-to-r from-red-600 via-red-500 to-red-600
                   transition-all duration-300 ease-in-out touch-manipulation
                   ${
                     commandPending || refreshing
                       ? "opacity-75 cursor-not-allowed scale-95"
                       : "active:scale-95 active:shadow-inner hover:shadow-xl hover:from-red-500 hover:to-red-500 transform will-change-transform"
                   }`}
          style={{ 
            minHeight: '48px',
            minWidth: '120px',
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            backfaceVisibility: 'hidden'
          }}
        >
          {commandPending && pendingCommand === "Disarm" ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg">🔓</span>
          )}
          <span className="font-medium">Disarm</span>
        </button>
      )}
    </div>
  );
};

export default AlarmControls;