import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  UilHome,
  UilCircle,
  UilLock,
  UilLockOpenAlt,
  UilSpinner,
  UilBolt
} from '@iconscout/react-unicons';

interface GarageDoorProps {
  onStatusUpdate?: (status: string) => void;
}

type DoorStatus = 'open' | 'closed' | 'unknown' | 'moving' | 'fault';
type ActionType = 'open' | 'close' | 'toggle';

// WebSocket endpoint for the AWS backend
const WS_ENDPOINT = 'wss://utekypghuf.execute-api.us-east-1.amazonaws.com/prod';
const DEVICE_ID = 'garage-door-001';

const GarageDoor: React.FC<GarageDoorProps> = ({ onStatusUpdate }) => {
  const [doorStatus, setDoorStatus] = useState<DoorStatus>('unknown');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for WebSocket and timers
  const wsRef = useRef<WebSocket | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Configuration
  const LONG_PRESS_DURATION = 1500; // 1.5 seconds for safety
  const PROGRESS_UPDATE_INTERVAL = 50; // Update progress every 50ms
  const RECONNECT_DELAY = 5000; // 5 seconds
  const PING_INTERVAL = 30000; // 30 seconds

  // Enhanced haptic feedback system for iPhone
  const triggerHaptic = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    // iPhone haptic feedback (iOS 13+)
    if ('hapticFeedback' in navigator && (navigator as any).hapticFeedback) {
      const intensityLevels = {
        light: 0.3,
        medium: 0.7,
        heavy: 1.0
      };
      (navigator as any).hapticFeedback.impact(intensityLevels[intensity]);
    } else if ('vibrate' in navigator) {
      // Fallback vibration pattern
      const patterns = {
        light: [50],
        medium: [100],
        heavy: [150, 50, 150]
      };
      navigator.vibrate(patterns[intensity]);
    }
  }, []);

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_ENDPOINT);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        
        // Register as frontend first
        ws.send(JSON.stringify({
          type: 'frontend_register',
          timestamp: Date.now()
        }));
        
        // Request initial status after a short delay
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: 'frontend_status_request',
            deviceId: DEVICE_ID,
            timestamp: Date.now()
          }));
        }, 1000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          // Handle different message types from backend
          if (data.type === 'device_status_update' && data.deviceId === DEVICE_ID) {
            const newStatus = data.doorStatus as DoorStatus;
            setDoorStatus(newStatus);
            setLastUpdate(new Date());
            setIsLoading(newStatus === 'moving');
            
            if (onStatusUpdate) {
              onStatusUpdate(newStatus);
            }
          } else if (data.type === 'device_heartbeat' && data.deviceId === DEVICE_ID) {
            // Handle ESP8266 heartbeat messages with door status updates
            const newStatus = data.doorStatus as DoorStatus;
            console.log('ESP8266 heartbeat - Door status:', newStatus);
            setDoorStatus(newStatus);
            setLastUpdate(new Date(data.timestamp || Date.now()));
            setIsLoading(newStatus === 'moving');
            
            if (onStatusUpdate) {
              onStatusUpdate(newStatus);
            }
          } else if (data.type === 'status_response' && data.deviceId === DEVICE_ID) {
            // Backend confirmed status request was sent to device
            console.log('Status request sent to device:', data.message);
          } else if (data.type === 'command_response') {
            // Backend confirmed command was sent to device
            console.log('Command response:', data.message);
          } else if (data.type === 'error') {
            setError(data.message || 'Unknown error occurred');
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Attempt to reconnect after delay
        if (!event.wasClean) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, RECONNECT_DELAY);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error - will retry');
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setError('Failed to connect to garage door service');
    }
  }, [onStatusUpdate]);

  // Send WebSocket message
  const sendWebSocketMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Send ping to keep connection alive
  const sendPing = useCallback(() => {
    sendWebSocketMessage({
      type: 'ping',
      timestamp: Date.now()
    });
  }, [sendWebSocketMessage]);

  // Control door action with enhanced feedback
  const controlDoor = useCallback(async (action: ActionType) => {
    if (isLoading || !isConnected) return;

    try {
      setIsLoading(true);
      setError(null);
      setDoorStatus('moving');

      // Heavy haptic feedback for successful command
      triggerHaptic('heavy');

      const success = sendWebSocketMessage({
        type: 'frontend_command',
        deviceId: DEVICE_ID,
        command: action,
        timestamp: Date.now()
      });

      if (!success) {
        throw new Error('WebSocket not connected');
      }

      // The device will send back status updates via WebSocket
    } catch (error) {
      setError(`Failed to ${action} door. Please try again.`);
      console.error(`Failed to ${action} door:`, error);
      setIsLoading(false);
      
      // Light haptic feedback for error
      triggerHaptic('light');
      
      // Request status to restore current state
      sendWebSocketMessage({
        type: 'frontend_status_request',
        deviceId: DEVICE_ID,
        timestamp: Date.now()
      });
    }
  }, [isLoading, isConnected, sendWebSocketMessage, triggerHaptic]);

  // Long press handlers - Define handleLongPressEnd first to avoid circular dependency
  const handleLongPressEnd = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    setIsLongPressing(false);
    setLongPressProgress(0);
    setPendingAction(null);
  }, []);

  const handleLongPressStart = useCallback((action: ActionType) => {
    if (isLoading || isLongPressing || !isConnected) return;

    setIsLongPressing(true);
    setPendingAction(action);
    setLongPressProgress(0);

    // Progress animation
    progressIntervalRef.current = setInterval(() => {
      setLongPressProgress((prev) => {
        const newProgress = prev + (PROGRESS_UPDATE_INTERVAL / LONG_PRESS_DURATION) * 100;
        return Math.min(newProgress, 100);
      });
    }, PROGRESS_UPDATE_INTERVAL);

    // Execute action after long press duration
    longPressTimeoutRef.current = setTimeout(() => {
      if (action) {
        controlDoor(action);
      }
      handleLongPressEnd();
    }, LONG_PRESS_DURATION);
  }, [controlDoor, isLoading, isLongPressing, isConnected, handleLongPressEnd]);

  // Enhanced mobile touch handlers with iPhone optimizations
  const handleTouchStart = useCallback((action: ActionType) => {
    if (doorStatus === 'fault' || isLoading || !isConnected) {
      triggerHaptic('light');
      return;
    }
    
    // Medium haptic feedback for valid interactions
    triggerHaptic('medium');
    handleLongPressStart(action);
  }, [doorStatus, isLoading, isConnected, handleLongPressStart, triggerHaptic]);

  const handleTouchEnd = useCallback(() => {
    handleLongPressEnd();
  }, [handleLongPressEnd]);

  // Initialize WebSocket connection
  useEffect(() => {
    connectWebSocket();

    // Set up ping interval
    pingIntervalRef.current = setInterval(sendPing, PING_INTERVAL);

    return () => {
      // Cleanup
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      handleLongPressEnd();
    };
  }, [connectWebSocket, sendPing, handleLongPressEnd]);

  // Get status display info - Enhanced for mobile visibility
  const getStatusInfo = () => {
    // If not connected, show offline status
    if (!isConnected) {
      return {
        icon: UilCircle,
        text: 'Offline',
        color: 'text-red-300',
        bgColor: 'bg-red-900/40',
        borderColor: 'border-red-600/60'
      };
    }

    switch (doorStatus) {
      case 'open':
        return {
          icon: UilLockOpenAlt,
          text: 'Open',
          color: 'text-red-300',
          bgColor: 'bg-red-900/40',
          borderColor: 'border-red-600/60'
        };
      case 'closed':
        return {
          icon: UilLock,
          text: 'Closed',
          color: 'text-green-300',
          bgColor: 'bg-green-900/40',
          borderColor: 'border-green-600/60'
        };
      case 'moving':
        return {
          icon: UilSpinner,
          text: 'Moving...',
          color: 'text-blue-300',
          bgColor: 'bg-blue-900/40',
          borderColor: 'border-blue-600/60'
        };
      case 'fault':
        return {
          icon: UilCircle,
          text: 'Sensor Error',
          color: 'text-orange-300',
          bgColor: 'bg-orange-900/40',
          borderColor: 'border-orange-600/60'
        };
      default:
        return {
          icon: UilCircle,
          text: 'Unknown',
          color: 'text-gray-300',
          bgColor: 'bg-gray-800/40',
          borderColor: 'border-gray-600/60'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Alternative approach: Don't render component at all when offline
  // if (!isConnected) {
  //   return null;
  // }

  return (
    <div className="device-widget p-5">
      {/* Enhanced offline overlay for iPhone */}
      {!isConnected && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-md rounded-xl flex items-center justify-center z-20">
          <div className="bg-gray-900/95 rounded-xl px-6 py-4 shadow-2xl border border-gray-600/50 backdrop-blur-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-full bg-red-900/60 border border-red-600/50">
                <UilCircle className="text-red-400 animate-pulse" size={20} />
              </div>
              <div>
                <div className="text-red-300 font-semibold text-base">Connection Lost</div>
                <div className="text-gray-400 text-sm">Attempting to reconnect...</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced loading overlay for better iPhone feedback */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <div className="bg-gray-900/95 rounded-xl px-6 py-4 shadow-2xl border border-gray-600/50 backdrop-blur-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-full bg-blue-900/60 border border-blue-600/50">
                <UilSpinner className="text-blue-400 animate-spin" size={20} />
              </div>
              <div>
                <div className="text-blue-300 font-semibold text-base">Operating Door</div>
                <div className="text-gray-400 text-sm">Please wait...</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Glass effect overlay */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
      
      {/* Header - Exactly matching room controls pattern */}
      <div className="flex justify-between items-center mb-4">
        <div className="text-gray-200 font-medium flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-gray-800/80 border border-gray-700/50 shadow-inner">
            <UilHome className="text-blue-400" size={20} />
          </div>
          <span>Garage</span>
        </div>
        
        {/* Enhanced status badge for iPhone visibility */}
        <div className={`px-3 py-2 rounded-xl border backdrop-blur-sm shadow-lg transition-all duration-300 ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor} flex items-center space-x-2`}>
          <StatusIcon size={16} className={
            doorStatus === 'moving' ? 'animate-spin' : 
            doorStatus === 'fault' ? 'animate-pulse' : 
            !isConnected ? 'animate-pulse' : ''
          } />
          <span className="font-semibold text-sm">{statusInfo.text}</span>
        </div>
      </div>

      {/* Enhanced error message with better iPhone visibility */}
      {error && (
        <div className="mb-4 p-3.5 bg-gradient-to-r from-red-900/40 to-red-800/40 border border-red-600/50 rounded-xl backdrop-blur-sm shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="p-1.5 rounded-full bg-red-900/60 border border-red-600/50">
              <UilCircle className="text-red-400 animate-pulse" size={16} />
            </div>
            <span className="text-red-200 font-medium">{error}</span>
          </div>
        </div>
      )}

      {/* Enhanced wiring fault warning with better iPhone visibility */}
      {doorStatus === 'fault' && (
        <div className="mb-4 p-3.5 bg-gradient-to-r from-orange-900/40 to-orange-800/40 border border-orange-600/50 rounded-xl backdrop-blur-sm shadow-lg">
          <div className="flex items-center space-x-3 mb-2">
            <div className="p-1.5 rounded-full bg-orange-900/60 border border-orange-600/50">
              <UilCircle className="text-orange-400 animate-pulse" size={16} />
            </div>
            <span className="text-orange-200 font-semibold">Sensor Fault Detected</span>
          </div>
          <p className="text-orange-300 text-sm ml-8">
            Check sensor wiring on pin D5. Door operation is disabled for safety.
          </p>
        </div>
      )}

      {/* Main Control - Enhanced iPhone optimizations */}
      <div className="space-y-3">
        <button
          className={`relative w-full rounded-xl border transition-all duration-300 overflow-hidden touch-manipulation ${
            isLoading || !isConnected || doorStatus === 'fault'
              ? 'bg-gray-800/50 border-gray-600/50 cursor-not-allowed opacity-60'
              : doorStatus === 'open'
              ? 'bg-gradient-to-br from-green-900/40 via-green-900/50 to-green-800/60 border-green-700/50 hover:from-green-800/60 hover:via-green-800/70 hover:to-green-700/80 active:scale-[0.98] shadow-lg hover:shadow-green-900/30'
              : 'bg-gradient-to-br from-red-900/40 via-red-900/50 to-red-800/60 border-red-700/50 hover:from-red-800/60 hover:via-red-800/70 hover:to-red-700/80 active:scale-[0.98] shadow-lg hover:shadow-red-900/30'
          } ${isLongPressing ? 'scale-[0.96] shadow-inner' : ''}`}
          style={{
            minHeight: '72px', // Larger touch target for iPhone
            minWidth: '100%',
            transform: 'translateZ(0)', // Hardware acceleration
            WebkitTransform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            WebkitTapHighlightColor: 'transparent'
          }}
          onMouseDown={() => doorStatus !== 'fault' && handleLongPressStart('toggle')}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={() => handleTouchStart('toggle')}
          onTouchEnd={handleTouchEnd}
          disabled={isLoading || !isConnected || doorStatus === 'fault'}
          aria-label={`${doorStatus === 'open' ? 'Close' : 'Open'} garage door`}
        >
          {/* Enhanced progress bar for long press */}
          {isLongPressing && (
            <div 
              className={`absolute bottom-0 left-0 h-2 transition-all duration-75 rounded-b-xl ${
                doorStatus === 'open' 
                  ? 'bg-gradient-to-r from-green-400 to-green-300 shadow-lg shadow-green-400/50' 
                  : 'bg-gradient-to-r from-red-400 to-red-300 shadow-lg shadow-red-400/50'
              }`}
              style={{ width: `${longPressProgress}%` }}
            />
          )}
          
          {/* Ambient glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/10 pointer-events-none rounded-xl" />
          
          <div className="flex items-center justify-center space-x-4 h-full py-4 px-6 relative z-10">
            <div className={`p-3 rounded-full border transition-all duration-300 ${
              isLoading ? 'bg-blue-900/50 border-blue-600/50' : 
              doorStatus === 'fault' ? 'bg-orange-900/50 border-orange-600/50' :
              doorStatus === 'open' ? 'bg-green-900/50 border-green-600/50' : 'bg-red-900/50 border-red-600/50'
            }`}>
              {isLoading ? (
                <UilSpinner className="text-blue-400 animate-spin" size={28} />
              ) : doorStatus === 'fault' ? (
                <UilCircle className="text-orange-400 animate-pulse" size={28} />
              ) : doorStatus === 'open' ? (
                <span className="text-green-400 text-2xl font-bold">↓</span>
              ) : (
                <span className="text-red-400 text-2xl font-bold">↑</span>
              )}
            </div>
            
            <div className="text-center flex-1">
              <div className={`text-lg font-semibold tracking-wide ${
                isLoading ? 'text-blue-300' : 
                doorStatus === 'fault' ? 'text-orange-300' :
                doorStatus === 'open' ? 'text-green-300' : 'text-red-300'
              }`}>
                {isLoading ? 'Operating...' : 
                 doorStatus === 'fault' ? 'Sensor Error' :
                 doorStatus === 'open' ? 'Close Door' : 'Open Door'}
              </div>
              <div className={`text-sm mt-1 transition-all duration-300 ${
                isLongPressing ? 'text-white font-medium' : 'text-gray-400'
              }`}>
                {doorStatus === 'fault' ? 'Check wiring' : 
                 isLongPressing ? `${Math.ceil((100 - longPressProgress) / 100 * 1.5)}s` :
                 'Hold 1.5s to operate'}
              </div>
            </div>
          </div>
        </button>

        {/* Enhanced status info with iPhone optimizations */}
        <div className="flex justify-between items-center text-sm bg-gray-800/40 rounded-lg px-3 py-2.5 border border-gray-700/30">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected 
                ? 'bg-green-400 animate-pulse' 
                : 'bg-red-400 animate-pulse'
            }`} />
            <span className="text-gray-300 font-medium">
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'No recent updates'}
            </span>
          </div>
          <div className="flex items-center space-x-1.5 text-orange-300">
            <span className="text-base">⚠️</span>
            <span className="font-medium">Clear area first</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GarageDoor;
