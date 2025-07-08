import React, { useState, useEffect, useCallback, useRef } from 'react';
import './SeamSecurity.css';
import {
  UilLock,
  UilLockOpenAlt,
  UilShieldCheck,
  UilSync,
  UilPlusCircle,
  UilTimes,
  UilLockOpenAlt as UilKey,
  UilHistory,
  UilCircle,
  UilBolt,
  UilCircle as UilSignal
} from '@iconscout/react-unicons';

// Schlage Logo component
const SchlageLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg 
    className={className}
    viewBox="0 0 572.98 140" 
    xmlns="http://www.w3.org/2000/svg" 
    xmlnsXlink="http://www.w3.org/1999/xlink"
  >
    <defs>
      <linearGradient id="linear-gradient" x1="286.49" y1="134.03" x2="286.49" y2="2.19" gradientTransform="translate(0 138.05) scale(1 -1)" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#e6e7e8"/>
        <stop offset=".17" stopColor="#d2d3d5"/>
        <stop offset=".52" stopColor="#b0b1b3"/>
        <stop offset=".81" stopColor="#9a9c9f"/>
        <stop offset="1" stopColor="#939598"/>
      </linearGradient>
      <linearGradient id="linear-gradient-2" x1="286.49" y1="177.38" x2="286.49" y2="-97.65" gradientTransform="translate(0 138.05) scale(1 -1)" gradientUnits="userSpaceOnUse">
        <stop offset=".19" stopColor="#0081c6"/>
        <stop offset=".71" stopColor="#004f86"/>
        <stop offset="1" stopColor="#003767"/>
      </linearGradient>
    </defs>
    <path fill="url(#linear-gradient)" d="m567.39,15.41h0c-5.6-8.22-14.85-13.22-26.06-14.07H50.02c-6.02,0-12.25,3.92-15.15,9.54l-.19.36L3.76,87.63c-5.41,13.3-4.97,26.07,1.23,35.97,5.61,8.93,15.24,14.28,27.17,15.06h490.61c6,0,12.23-3.93,15.13-9.53l.23-.43,32.46-80.08.24-.7c3.77-12.14,2.55-23.68-3.44-32.49v-.02Z"/>
    <path fill="url(#linear-gradient-2)" d="m564.5,17.38c-4.99-7.33-13.31-11.78-23.43-12.55H50.02c-4.67,0-9.75,3.21-12.04,7.67l-.12.24-.11.25L7,88.95c-4.97,12.22-4.63,23.88.95,32.79,4.99,7.95,13.64,12.72,24.38,13.42h490.43c4.68,0,9.74-3.22,12.04-7.67l.12-.24.09-.24,32.31-79.68.09-.22.07-.24c3.45-11.11,2.38-21.58-2.99-29.49h0Z"/>
    <path fill="#fff" d="m135.08,70.52c.2-13.78,9.17-16.99,15.14-16.99h20.79l3.99-10c.79-2.35-.44-4.24-2.84-4.24h-29.32c-6.35,0-29.16,3.12-29.36,31.47-.2,28.37,23.01,31,29.36,31h33.74v-14.24h-26.37c-5.97,0-14.94-3.21-15.14-17h0Zm96.71-8.55h-25.83v-22.66h-20.45v62.47h20.36v-25.26h25.72v25.25h20.16v-62.46h-19.96v22.66Zm76.77,25.57h-23.74c-2.19,0-2.09-1.75-2.09-1.75v-46.48h-20.26s.03,40.04,0,50.5c0,13.66,13.45,11.97,14.03,11.97h30.8l3.96-9.92c.83-2.37-.33-4.27-2.69-4.32h0Zm120.75-22.75l-3.4,8.5c-.76,2.34.45,4.19,2.84,4.19h10.22v10.04h-13.3c-5.97,0-14.94-3.21-15.14-17,.2-13.78,9.17-16.99,15.14-16.99h29.77l4.04-10.13c.7-2.3-.51-4.09-2.88-4.09h-38.29c-6.36,0-29.17,3.1-29.37,31.46-.2,28.37,23.02,31,29.37,31h42.71l-.11-36.99h-31.61,0Zm-64.93-25.46h-23.89c-1.44,0-2.24.23-3.18,2.19l-23.96,60.23h20.86l18.24-46.31,8.39,21.25h-10.51l-3.85,9.55c-.92,2.45.29,4.41,2.77,4.41h16.95l4.5,11.09h20.83l-24.03-60.45c-.94-1.96-1.67-1.96-3.11-1.96h-.01Zm200.12-21.92c-4.99-7.33-13.31-11.78-23.43-12.55H50.02c-4.67,0-9.75,3.21-12.04,7.67l-.12.24-.11.25L7,88.95c-4.97,12.22-4.63,23.88.95,32.79,4.99,7.95,13.64,12.72,24.38,13.42h490.43c4.68,0,9.74-3.22,12.04-7.67l.12-.24.09-.24,32.31-79.68.09-.22.07-.24c3.45-11.11,2.38-21.58-2.99-29.49v.03Zm-2.52,27.79l-17.76,43.82h-48.89c-3.05,0-4.26-.63-4.26-3.53l.04-8.56h28.18l3.23-8.1.03-.08c.95-2.35-.06-4.29-2.25-4.53h-29.2l-.04-8.53c0-2.9,1.21-3.53,4.26-3.53h32.56v-12.89l-42.87.06c-7.79.55-14.02,6.72-14.66,14.48l.02,32.17c0,8.75,7.11,15.84,15.85,15.84h48.47c2.1.05,3.25,1.53,2.91,3.51l-7.92,19.54c-1.3,2.51-4.4,4.56-6.93,4.56H32.7c-15.99-1.03-24.98-12.4-23.19-27.66h80.87c5.93,0,18.1-4.79,18.1-19.41s-11.88-19.5-18.1-19.5h-26.53c-3.16,0-5.74-2.15-5.74-4.73s2.57-4.69,5.74-4.69l35.81.07,3.91-9.82c.92-2.45-.3-4.4-2.77-4.4,0,0-43.99-.02-45.42-.02-5.94,0-18.11,4.8-18.11,19.41s11.88,19.5,18.11,19.5h26.52c3.16,0,5.73,2.15,5.73,4.73s-2.57,4.7-5.73,4.7H18.32c-2.41,0-3.61-1.91-2.83-4.28L43.07,15.15c1.31-2.52,4.4-4.56,6.93-4.56h490.62c18.11,1.36,27.11,16.04,21.36,34.58v.03Z"/>
    <path fill="#fff" d="m523.69,105.04c3.71,0,6.66,3.02,6.66,6.78s-2.95,6.81-6.69,6.81-6.72-2.98-6.72-6.81,3.01-6.78,6.72-6.78h.03Zm-.03,1.05c-2.99,0-5.42,2.56-5.42,5.73s2.44,5.76,5.45,5.76c3.01.03,5.42-2.54,5.42-5.73s-2.41-5.75-5.42-5.75h-.03Zm-1.27,9.68h-1.21v-7.57c.63-.09,1.24-.18,2.14-.18,1.14,0,1.9.24,2.35.57.45.33.69.85.69,1.57,0,1-.66,1.59-1.47,1.84v.06c.66.12,1.11.72,1.27,1.84.18,1.18.36,1.63.48,1.87h-1.27c-.18-.24-.36-.94-.51-1.93-.18-.96-.66-1.32-1.63-1.32h-.84v3.25h0Zm0-4.19h.87c1,0,1.84-.36,1.84-1.3,0-.66-.48-1.32-1.84-1.32-.39,0-.66.03-.87.06v2.56Z"/>
  </svg>
);

// Yale Logo component
const YaleLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg 
    className={className}
    viewBox="0 0 652 652" 
    xmlns="http://www.w3.org/2000/svg" 
    xmlnsXlink="http://www.w3.org/1999/xlink"
  >
    <g>
      <path fill="#FFD400" d="M576.2,325.5c0,138.1-111.9,250-250,250c-138.1,0-250-111.9-250-250s111.9-250,250-250
        C464.3,75.5,576.2,187.4,576.2,325.5"/>
      <polygon fill="#1C1B1A" points="180.3,344.2 118.9,242.4 160.2,242.4 199.2,308.2 238,242.4 278.8,242.4 217,345.1 217,409.1 
        180.3,409.1 	"/>
      <path fill="#1C1B1A" d="M245.9,325.5c1.9-31.1,29.6-40.4,56.7-40.4c24,0,53,5.4,53,34.3v62.8c0,11,1.2,21.9,4.2,26.8h-33.6
        c-1.2-3.7-2.1-7.7-2.3-11.7c-10.5,11-25.9,14.9-40.6,14.9c-22.9,0-41.1-11.4-41.1-36.2c0-27.3,20.5-33.9,41.1-36.6
        c20.3-3,39.2-2.3,39.2-15.9c0-14.2-9.8-16.3-21.5-16.3c-12.6,0-20.8,5.1-21.9,18.2H245.9z M322.5,350c-5.6,4.9-17.3,5.1-27.6,7
        c-10.3,2.1-19.6,5.6-19.6,17.7c0,12.4,9.6,15.4,20.3,15.4c25.9,0,26.8-20.6,26.8-27.8V350z"/>
      <rect x="369.6" y="242.2" fill="#1C1B1A" width="33.2" height="166.7"/>
      <path fill="#1C1B1A" d="M445,356.8c0.9,21,11.2,30.6,29.7,30.6c13.3,0,24-8.2,26.1-15.6h29.2c-9.3,28.5-29.2,40.6-56.5,40.6
        c-38.1,0-61.7-26.1-61.7-63.5c0-36.2,25-63.7,61.7-63.7c41.1,0,60.9,34.6,58.6,71.7H445z M498.9,335.8c-3-16.8-10.3-25.7-26.4-25.7
        c-21,0-27.1,16.3-27.5,25.7H498.9z"/>
      <path fill="#1C1B1A" d="M510.7,251.2h10.1c6.2,0,9.2,2.5,9.2,7.5c0,4.7-3,6.7-6.9,7.1l7.5,11.6h-4.4l-7.1-11.3h-4.3v11.3h-4.1V251.2z
         M514.8,262.9h4.3c3.6,0,6.9-0.2,6.9-4.3c0-3.5-3-4-5.8-4h-5.4V262.9z"/>
      <path fill="#1C1B1A" d="M497.1,264.7c0,12.3,10,22.2,22.2,22.2c12.3,0,22.2-10,22.2-22.2c0-12.3-10-22.2-22.2-22.2
        C507.1,242.5,497.1,252.4,497.1,264.7 M500.3,264.7c0-10.5,8.5-19,19-19c10.5,0,19,8.5,19,19c0,10.5-8.5,19-19,19
        C508.8,283.7,500.3,275.2,500.3,264.7"/>
    </g>
  </svg>
);

// Types
interface SeamDevice {
  device_id: string;
  device_type: string;
  display_name: string;
  properties: {
    locked?: boolean;
    online?: boolean;
    battery_level?: number;
    door_open?: boolean;
    model?: {
      display_name: string;
      manufacturer_display_name: string;
    };
  };
  capabilities_supported: string[];
  location?: {
    location_name?: string;
    timezone?: string;
  };
  workspace_id: string;
  created_at: string;
  is_managed: boolean;
}

interface AccessCode {
  access_code_id: string;
  device_id: string;
  name: string;
  code: string;
  status: string;
  type: string;
  created_at: string;
}

interface SeamEvent {
  event_id: string;
  event_type: string;
  created_at: string;
  device_id?: string;
  occurred_at: string;
}

interface SeamSecurityProps {
  // Add any props needed
}

const SeamSecurity: React.FC<SeamSecurityProps> = () => {
  const [devices, setDevices] = useState<SeamDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<SeamDevice | null>(null);
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [events, setEvents] = useState<SeamEvent[]>([]);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showAddCode, setShowAddCode] = useState(false);
  const [newCodeName, setNewCodeName] = useState('');
  const [newCodeValue, setNewCodeValue] = useState('');
  const [processingDevices, setProcessingDevices] = useState<Record<string, boolean>>({});
  
  // Long press state
  const [longPressDeviceId, setLongPressDeviceId] = useState<string | null>(null);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [pendingAction, setPendingAction] = useState<'lock' | 'unlock' | null>(null);

  // Long press refs
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Long press configuration
  const LONG_PRESS_DURATION = 1500; // 1.5 seconds for safety
  const PROGRESS_UPDATE_INTERVAL = 50; // Update progress every 50ms

  const API_BASE_URL = 'https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod';

  // Fetch all devices
  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/seam/devices/list`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.status}`);
      }
      
      const data = await response.json();
      
      // The response should contain devices array
      setDevices(data.devices || []);
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    }
  }, []);

  // Control lock (lock/unlock)
  const controlLock = useCallback(async (deviceId: string, action: 'lock' | 'unlock') => {
    // If already processing, don't do anything
    if (processingDevices[deviceId]) {
      return;
    }
    
    try {
      setError(null);
      
      // Set processing state for this device
      setProcessingDevices(prev => ({...prev, [deviceId]: true}));
      
      // Don't update the UI state optimistically yet - wait for API response
      // This ensures the button stays in the same state during processing
      
      // Make the API call
      const response = await fetch(`${API_BASE_URL}/seam/locks/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
          action: action,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} device: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Now update the device state
        const newLockedState = action === 'lock';
        
        // Update the devices list
        setDevices(prevDevices => 
          prevDevices.map(device => 
            device.device_id === deviceId 
              ? {...device, properties: {...device.properties, locked: newLockedState}} 
              : device
          )
        );
        
        console.log(`Successfully ${action}ed device`);
      } else {
        throw new Error(`Failed to ${action} device`);
      }
    } catch (err) {
      console.error(`Error ${action}ing device:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${action} device`);
      
      // Refresh devices to get the real state on error
      await fetchDevices();
    } finally {
      // Clear processing state after a small delay to ensure UI updates properly
      setTimeout(() => {
        setProcessingDevices(prev => ({...prev, [deviceId]: false}));
      }, 500);
    }
  }, [fetchDevices, API_BASE_URL, processingDevices]);

  // Long press handlers
  const handleLongPressEnd = useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    setLongPressDeviceId(null);
    setLongPressProgress(0);
    setPendingAction(null);
  }, []);

  const handleLongPressStart = useCallback((deviceId: string, action: 'lock' | 'unlock') => {
    if (processingDevices[deviceId] || longPressDeviceId) return;

    setLongPressDeviceId(deviceId);
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
      controlLock(deviceId, action);
      handleLongPressEnd();
    }, LONG_PRESS_DURATION);
  }, [controlLock, processingDevices, longPressDeviceId, handleLongPressEnd]);

  // Touch handlers for mobile
  const handleTouchStart = useCallback((deviceId: string, action: 'lock' | 'unlock') => {
    handleLongPressStart(deviceId, action);
  }, [handleLongPressStart]);

  const handleTouchEnd = useCallback(() => {
    handleLongPressEnd();
  }, [handleLongPressEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleLongPressEnd();
    };
  }, [handleLongPressEnd]);

  // Fetch access codes for a device
  const fetchAccessCodes = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/seam/access-codes/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch access codes: ${response.status}`);
      }

      const data = await response.json();
      setAccessCodes(data.access_codes || []);
    } catch (err) {
      console.error('Error fetching access codes:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch access codes');
    }
  }, []);

  // Create new access code
  const createAccessCode = useCallback(async (deviceId: string, code: string, name: string) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/seam/access-codes/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
          code: code,
          name: name,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create access code: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Refresh access codes
        await fetchAccessCodes(deviceId);
        
        // Clear form
        setNewCodeName('');
        setNewCodeValue('');
        setShowAddCode(false);
        
        console.log('Successfully created access code');
      } else {
        throw new Error('Failed to create access code');
      }
    } catch (err) {
      console.error('Error creating access code:', err);
      setError(err instanceof Error ? err.message : 'Failed to create access code');
    }
  }, [fetchAccessCodes]);

  // Delete access code
  const deleteAccessCode = useCallback(async (accessCodeId: string, deviceId: string) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/seam/access-codes/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_code_id: accessCodeId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete access code: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Refresh access codes
        await fetchAccessCodes(deviceId);
        console.log('Successfully deleted access code');
      } else {
        throw new Error('Failed to delete access code');
      }
    } catch (err) {
      console.error('Error deleting access code:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete access code');
    }
  }, [fetchAccessCodes]);

  // Fetch events
  const fetchEvents = useCallback(async (deviceId?: string) => {
    try {
      setError(null);
      // Get events from the last 7 days
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const requestBody: any = {
        limit: 50,
        since: since,
      };
      
      if (deviceId) {
        requestBody.device_id = deviceId;
      }
      
      const response = await fetch(`${API_BASE_URL}/seam/events/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch events: ${response.status}`);
      }

      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    }
  }, []);

  // Get device icon based on name
  const getDeviceIcon = (deviceName: string): string => {
    const name = deviceName.toLowerCase();
    if (name.includes('front') && name.includes('door')) {
      return '🚪'; // Door emoji
    } else if (name.includes('back') || name.includes('patio')) {
      return '🏖️'; // Patio umbrella emoji
    }
    return '🔒'; // Default lock emoji
  };

  // Refresh data
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDevices();
      if (selectedDevice && showAccessCodes) {
        await fetchAccessCodes(selectedDevice.device_id);
      }
      if (showEvents) {
        await fetchEvents(selectedDevice?.device_id);
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchDevices, fetchAccessCodes, fetchEvents, selectedDevice, showAccessCodes, showEvents]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchDevices();
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [fetchDevices]);

  // Handle device selection
  const handleDeviceSelect = useCallback((device: SeamDevice) => {
    // No longer selecting devices - simplified interface
    // Just leave this empty but keep the function for future use
  }, []);

  // Format event type for display
  const formatEventType = (eventType: string) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="w-full max-w-full bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-4 animate-breath">
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-blue-900/30 mb-2">
            <SchlageLogo className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-xl font-medium text-blue-400">Loading Smart Locks</h2>
          <div className="flex items-center space-x-2 text-blue-300/80">
            <div className="animate-spin h-5 w-5 border-2 border-t-transparent border-blue-500 rounded-full"></div>
            <span>Connecting to your devices...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && devices.length === 0) {
    return (
      <div className="w-full max-w-full bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-4 animate-breath">
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-red-900/30 mb-2">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium text-red-400">Smart Lock Error</h2>
          <p className="text-red-300/80 max-w-md">
            {error || "We're having trouble connecting to your smart locks. Please try again later."}
          </p>
          <button 
            onClick={handleRefresh}
            className="px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full w-full max-w-xs mt-2"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full">
      {/* Error display */}
      {error && (
        <div className="bg-gradient-to-br from-[#300] to-[#200] rounded-xl border border-red-500/30 p-2.5 mb-3 mx-0">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-400 text-xs">{error}</span>
          </div>
        </div>
      )}

      {/* Device List - Mobile Optimized Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {devices.map((device) => {
          // Calculate battery indicator class based on level
          const batteryLevel = device.properties.battery_level || 0;
          const batteryClass = 
            batteryLevel < 30 ? 'battery-low' :
            batteryLevel < 60 ? 'battery-medium' : 'battery-high';
          
          return (
            <div
              key={device.device_id}
              className="bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-[#1e293b]/40 p-3 sm:p-4 transition-all duration-300 flex flex-col h-full min-h-[180px] sm:min-h-[200px] animate-breath"
            >
              {/* Optimized ultra-compact layout */}
              <div className="flex flex-col h-full space-y-2 sm:space-y-3">
                {/* Header: Device name with compact manufacturer logo inline */}
                <div className="flex items-center justify-between">
                  <h3 className={`device-name-prominent text-lg sm:text-xl md:text-2xl font-bold leading-tight truncate flex-1 mr-2 ${
                    device.properties.online ? 'text-white' : 'text-gray-500'
                  }`}>
                    <span className="flex items-center space-x-2">
                      <span className="text-xl sm:text-2xl">{getDeviceIcon(device.display_name)}</span>
                      <span>{device.display_name}</span>
                    </span>
                  </h3>
                  <div className="manufacturer-logo-container flex-shrink-0">
                    {device.properties.model?.manufacturer_display_name?.toLowerCase().includes('yale') ? (
                      <YaleLogo className={`h-6 w-auto sm:h-8 sm:w-auto md:h-10 md:w-auto ${
                        device.properties.online ? '' : 'opacity-50 grayscale'
                      }`} />
                    ) : (
                      <SchlageLogo className={`h-4 w-auto sm:h-6 sm:w-auto md:h-7 md:w-auto ${
                        device.properties.online ? '' : 'opacity-50 grayscale'
                      }`} />
                    )}
                  </div>
                </div>
                
                {/* Compact status indicators - simplified layout with proper overflow handling */}
                <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0 overflow-hidden">
                  {/* Lock status with larger icon */}
                  <div className={`flex items-center space-x-2 py-2 px-3 rounded-lg border flex-shrink-0 ${
                    device.properties.locked 
                      ? 'bg-red-500/20 border-red-400/40 text-red-300' 
                      : 'bg-green-500/20 border-green-400/40 text-green-300'
                  } ${!device.properties.online ? 'opacity-50 grayscale' : ''}`}>
                    {device.properties.locked 
                      ? <UilLock className="w-5 h-5 sm:w-6 sm:h-6" /> 
                      : <UilLockOpenAlt className="w-5 h-5 sm:w-6 sm:h-6" />
                    }
                    <span className="font-medium">{device.properties.locked ? 'Locked' : 'Unlocked'}</span>
                  </div>
                  
                  {/* Battery level - compact with constrained width and proper overflow handling */}
                  {device.properties.battery_level && (
                    <div className={`flex items-center space-x-1 bg-blue-500/15 text-blue-300 py-2 px-3 rounded-lg flex-shrink min-w-0 max-w-[80px] ${
                      !device.properties.online ? 'opacity-50 grayscale' : ''
                    }`}>
                      <UilBolt className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="font-medium truncate text-xs">{Math.round(device.properties.battery_level * 100)}%</span>
                    </div>
                  )}
                </div>
                
                {/* Large action button with long press - takes most of the space */}
                <div className="flex-1 flex items-end">
                  {!device.properties.online ? (
                    /* Offline state - disabled button */
                    <div className="w-full px-3 py-4 sm:py-5 rounded-xl text-base sm:text-lg font-bold flex items-center justify-center border-2 bg-gray-800/40 text-gray-500 border-gray-700/30 cursor-not-allowed">
                      <span className="drop-shadow-lg">Device Offline</span>
                    </div>
                  ) : (
                    <button
                      onMouseDown={() => !processingDevices[device.device_id] && handleLongPressStart(device.device_id, device.properties.locked ? 'unlock' : 'lock')}
                      onMouseUp={handleLongPressEnd}
                      onMouseLeave={handleLongPressEnd}
                      onTouchStart={() => handleTouchStart(device.device_id, device.properties.locked ? 'unlock' : 'lock')}
                      onTouchEnd={handleTouchEnd}
                      disabled={processingDevices[device.device_id]}
                      className={`
                        long-press-button relative overflow-hidden px-3 py-4 sm:py-5 rounded-xl text-base sm:text-lg font-bold transition-all duration-200 flex items-center justify-center border-2 backdrop-blur-sm
                        ${processingDevices[device.device_id]
                          ? 'bg-gray-800/60 text-gray-400 cursor-not-allowed border-gray-700/50'
                          : device.properties.locked
                            ? 'bg-gradient-to-br from-green-500/80 to-green-600/90 hover:from-green-400/90 hover:to-green-500/100 active:from-green-600/90 active:to-green-700/100 text-white border-green-400/60 shadow-lg shadow-green-500/25'
                            : 'bg-gradient-to-br from-red-500/80 to-red-600/90 hover:from-red-400/90 hover:to-red-500/100 active:from-red-600/90 active:to-red-700/100 text-white border-red-400/60 shadow-lg shadow-red-500/25'
                        }
                        w-full min-h-[50px] sm:min-h-[60px] touch-manipulation mobile-transition mobile-hardware-accelerated
                        ${longPressDeviceId === device.device_id ? 'scale-[0.98] shadow-inner' : 'transform active:scale-95'}
                      `}
                      style={{
                        transform: 'translateZ(0)',
                        WebkitTransform: 'translateZ(0)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        WebkitTapHighlightColor: 'transparent'
                      }}
                    >
                      {/* Long press progress bar */}
                      {longPressDeviceId === device.device_id && (
                        <div 
                          className={`absolute bottom-0 left-0 h-1.5 transition-all duration-75 rounded-b-xl ${
                            device.properties.locked
                              ? 'bg-gradient-to-r from-green-300 to-green-200 shadow-lg shadow-green-300/60' 
                              : 'bg-gradient-to-r from-red-300 to-red-200 shadow-lg shadow-red-300/60'
                          }`}
                          style={{ width: `${longPressProgress}%` }}
                        />
                      )}

                      {/* Button content */}
                      <div className="relative z-10 flex items-center justify-center">
                        {processingDevices[device.device_id] && (
                          <span className="animate-spin h-4 w-4 sm:h-5 sm:w-5 mr-2 border-2 border-t-transparent border-white rounded-full" />
                        )}
                        <span className="drop-shadow-lg">
                          {processingDevices[device.device_id]
                            ? (device.properties.locked ? 'Unlocking...' : 'Locking...')
                            : longPressDeviceId === device.device_id
                              ? `Hold to ${device.properties.locked ? 'Unlock' : 'Lock'}...`
                              : (device.properties.locked ? 'Hold to Unlock' : 'Hold to Lock')
                          }
                        </span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {devices.length === 0 && !loading && (
        <div className="bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-5 animate-breath">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/70 rounded-full p-4 sm:p-5 w-16 sm:w-20 h-16 sm:h-20 mb-4 sm:mb-6 flex items-center justify-center border border-gray-700/30 shadow-inner">
              <UilShieldCheck size={30} className="text-gray-500 sm:hidden" />
              <UilShieldCheck size={36} className="text-gray-500 hidden sm:block" />
            </div>
            <h3 className="text-gray-300 font-medium mb-2 text-lg sm:text-xl">No Smart Locks Found</h3>
            <p className="text-gray-400 text-sm mb-4 sm:mb-6 max-w-xs">Connect your smart locks to Seam to manage them here.</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors w-full max-w-xs"
            >
              <div className="flex items-center justify-center space-x-2">
                <UilSync size={16} />
                <span>Refresh</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeamSecurity;
