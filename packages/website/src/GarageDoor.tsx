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
const WS_ENDPOINT = 'wss://ie0qxhdgx9.execute-api.us-east-1.amazonaws.com/prod';
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

  // Control door action
  const controlDoor = useCallback(async (action: ActionType) => {
    if (isLoading || !isConnected) return;

    try {
      setIsLoading(true);
      setError(null);
      setDoorStatus('moving');

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
      // Request status to restore current state
      sendWebSocketMessage({
        type: 'frontend_status_request',
        deviceId: DEVICE_ID,
        timestamp: Date.now()
      });
    }
  }, [isLoading, isConnected, sendWebSocketMessage]);

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

  // Enhanced mobile touch handlers with haptic feedback
  const handleTouchStart = useCallback((action: ActionType) => {
    if (doorStatus === 'fault' || isLoading || !isConnected) return;
    
    // Trigger haptic feedback on supported devices
    if ('vibrate' in navigator) {
      navigator.vibrate(50); // Light haptic feedback
    }
    
    handleLongPressStart(action);
  }, [doorStatus, isLoading, isConnected, handleLongPressStart]);

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
    <div className="relative p-4 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden border border-gray-700/50 transition-all duration-200 hover:border-gray-600/50">
      {/* Offline overlay - blurs entire component when not connected */}
      {!isConnected && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-xl flex items-center justify-center z-20">
          <div className="bg-gray-900/90 rounded-lg px-4 py-3 shadow-xl border border-gray-700/50">
            <div className="flex items-center space-x-3">
              <UilCircle className="text-red-400" size={20} />
              <div className="text-red-300 font-medium text-sm">Offline</div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay for better mobile feedback */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <div className="bg-gray-900/90 rounded-lg px-4 py-3 shadow-xl border border-gray-700/50">
            <div className="flex items-center space-x-3">
              <UilSpinner className="text-blue-400 animate-spin" size={20} />
              <div className="text-blue-300 font-medium text-sm">Operating...</div>
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
        
        {/* Single status badge - shows door status when online, offline status when not */}
        <div className={`text-xs px-2.5 py-1 rounded-full border ${statusInfo.color} ${statusInfo.bgColor} ${statusInfo.borderColor} flex items-center space-x-1.5`}>
          <StatusIcon size={14} className={
            doorStatus === 'moving' ? 'animate-spin' : 
            doorStatus === 'fault' ? 'animate-pulse' : 
            !isConnected ? 'animate-pulse' : ''
          } />
          <span>{statusInfo.text}</span>
        </div>
      </div>

      {/* Error message - More compact inline style */}
      {error && (
        <div className="mb-3 p-2.5 bg-red-900/30 border border-red-700/50 rounded-lg flex items-center space-x-2">
          <UilCircle className="text-red-400 flex-shrink-0" size={16} />
          <span className="text-red-300 text-xs">{error}</span>
        </div>
      )}

      {/* Wiring fault warning - More compact inline style */}
      {doorStatus === 'fault' && (
        <div className="mb-3 p-2.5 bg-orange-900/30 border border-orange-700/50 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <UilCircle className="text-orange-400 animate-pulse flex-shrink-0" size={16} />
            <span className="text-orange-300 font-medium text-xs">Sensor Fault</span>
          </div>
          <p className="text-orange-200 text-xs">
            Check sensor wiring on pin D5
          </p>
        </div>
      )}

      {/* Main Control - Matching room controls design with compact button */}
      <div className="space-y-3">
        <button
          className={`relative w-full h-16 rounded-lg border transition-all duration-200 overflow-hidden touch-manipulation ${
            isLoading || !isConnected || doorStatus === 'fault'
              ? 'bg-gray-800/50 border-gray-600/50 cursor-not-allowed'
              : doorStatus === 'open'
              ? 'bg-green-900/30 border-green-700/50 hover:bg-green-900/50 active:scale-95'
              : 'bg-red-900/30 border-red-700/50 hover:bg-red-900/50 active:scale-95'
          } ${isLongPressing ? 'scale-95' : ''}`}
          onMouseDown={() => doorStatus !== 'fault' && handleLongPressStart('toggle')}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={() => handleTouchStart('toggle')}
          onTouchEnd={handleTouchEnd}
          disabled={isLoading || !isConnected || doorStatus === 'fault'}
        >
          {/* Progress bar for long press */}
          {isLongPressing && (
            <div 
              className={`absolute bottom-0 left-0 h-1 transition-all duration-75 ${
                doorStatus === 'open' ? 'bg-green-400' : 'bg-red-400'
              }`}
              style={{ width: `${longPressProgress}%` }}
            />
          )}
          
          <div className="flex items-center justify-center space-x-3 h-full">
            {isLoading ? (
              <UilSpinner className="text-blue-400 animate-spin" size={24} />
            ) : doorStatus === 'fault' ? (
              <UilCircle className="text-orange-400 animate-pulse" size={24} />
            ) : doorStatus === 'open' ? (
              <span className="text-green-400 text-xl">↓</span>
            ) : (
              <span className="text-red-400 text-xl">↑</span>
            )}
            
            <div className="text-center">
              <div className={`text-sm font-medium ${
                isLoading ? 'text-blue-300' : 
                doorStatus === 'fault' ? 'text-orange-300' :
                doorStatus === 'open' ? 'text-green-300' : 'text-red-300'
              }`}>
                {isLoading ? 'Operating...' : 
                 doorStatus === 'fault' ? 'Sensor Error' :
                 doorStatus === 'open' ? 'Close Door' : 'Open Door'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {doorStatus === 'fault' ? 'Check wiring' : 
                 isLongPressing ? `${Math.ceil((100 - longPressProgress) / 100 * 1.5)}s` :
                 'Hold 1.5s'}
              </div>
            </div>
          </div>
        </button>

        {/* Status info - More compact */}
        <div className="flex justify-between items-center text-xs text-gray-400">
          <span>
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : 'No recent updates'}
          </span>
          <span className="flex items-center">
            <span className="mr-1">⚠️</span>
            Clear area first
          </span>
        </div>
      </div>
    </div>
  );
};

export default GarageDoor;
