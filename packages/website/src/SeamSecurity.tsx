import React, { useState, useEffect, useCallback } from 'react';
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
      <div className="w-full max-w-full bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-4">
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
      <div className="w-full max-w-full bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-4">
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

      {/* Device List */}
      <div className="space-y-4">
        {devices.map((device) => {
          // Calculate battery indicator class based on level
          const batteryLevel = device.properties.battery_level || 0;
          const batteryClass = 
            batteryLevel < 30 ? 'battery-low' :
            batteryLevel < 60 ? 'battery-medium' : 'battery-high';
          
          return (
            <div
              key={device.device_id}
              className="bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-4 transition-all duration-300"
            >
              <div className="flex flex-col space-y-5">
                {/* Top row with lock icon and device info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {/* Lock icon with status indicator */}
                    <div className={`relative p-4 rounded-full flex items-center justify-center ${
                      device.properties.locked 
                        ? 'bg-red-600/90 border border-red-500/30' 
                        : 'bg-green-600/90 border border-green-500/30'
                    }`}>
                      {device.properties.locked 
                        ? <UilLock className="w-7 h-7 text-white" /> 
                        : <UilLockOpenAlt className="w-7 h-7 text-white" />
                      }
                    </div>
                    
                    {/* Device info */}
                    <div className="ml-4">
                      <h3 className="font-medium text-white text-xl">{device.display_name}</h3>
                    </div>
                  </div>
                  
                  {/* Status badges */}
                  <div className="flex items-center gap-3">
                    {/* Manufacturer logo */}
                    <div className="bg-[#1e293b] py-1 px-3 rounded-full flex items-center">
                      <SchlageLogo className="h-4 w-auto" />
                    </div>
                    
                    {/* Online status */}
                    <div className={`flex items-center space-x-1.5 py-1 px-3 rounded-full ${
                      device.properties.online 
                        ? 'bg-green-900/30' 
                        : 'bg-red-900/30'
                    }`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        device.properties.online ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                      }`}></div>
                      <span className={`text-sm ${
                        device.properties.online ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {device.properties.online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    
                    {/* Battery level if available */}
                    {device.properties.battery_level && (
                      <div className="flex items-center space-x-2 bg-[#1e293b] py-1 px-3 rounded-full">
                        <UilBolt className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-gray-300">{Math.round(device.properties.battery_level * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Lock/Unlock button */}
                <div className="pt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!processingDevices[device.device_id]) {
                        controlLock(device.device_id, device.properties.locked ? 'unlock' : 'lock');
                      }
                    }}
                    disabled={processingDevices[device.device_id]}
                    className={`
                      px-4 py-4 rounded-full text-base font-medium transition-all duration-200 flex items-center justify-center
                      ${processingDevices[device.device_id]
                        ? 'bg-gray-800/60 text-gray-400 cursor-not-allowed'
                        : device.properties.locked
                          ? 'bg-green-600 hover:bg-green-500 text-white'
                          : 'bg-red-600 hover:bg-red-500 text-white'
                      }
                      w-full
                    `}
                  >
                    {processingDevices[device.device_id] && (
                      <span className="animate-spin h-4 w-4 mr-2 border-2 border-t-transparent border-white rounded-full" />
                    )}
                    <span>
                      {processingDevices[device.device_id]
                        ? (device.properties.locked ? 'Unlocking...' : 'Locking...')
                        : (device.properties.locked ? 'Unlock' : 'Lock')
                      }
                    </span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {devices.length === 0 && !loading && (
        <div className="bg-gradient-to-br from-[#0e1726]/95 to-[#0a1120]/95 backdrop-blur-lg rounded-xl shadow-xl border border-[#1e293b]/40 p-5">
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
