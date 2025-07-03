import React, { useState, useEffect, useCallback } from 'react';
import {
  UilLock,
  UilLockOpenAlt,
  UilShieldCheck,
  UilSync,
  UilPlus,
  UilTrashAlt,
  UilLockOpenAlt as UilKey,
  UilHistory,
  UilCircle,
  UilBatteryEmpty,
  UilCircle as UilSignal
} from '@iconscout/react-unicons';

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

  const API_BASE_URL = 'https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/seam';

  // Fetch all devices
  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/devices/list`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter for lock devices
      const lockDevices = data.devices.filter((device: SeamDevice) => 
        device.device_type === 'smart_lock' || 
        device.capabilities_supported.includes('lock')
      );
      
      setDevices(lockDevices);
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    }
  }, []);

  // Control lock (lock/unlock)
  const controlLock = useCallback(async (deviceId: string, action: 'lock' | 'unlock') => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/locks/control`, {
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
        // Refresh devices to get updated status
        await fetchDevices();
        
        // Show success message
        console.log(`Successfully ${action}ed device`);
      } else {
        throw new Error(`Failed to ${action} device`);
      }
    } catch (err) {
      console.error(`Error ${action}ing device:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${action} device`);
    }
  }, [fetchDevices]);

  // Fetch access codes for a device
  const fetchAccessCodes = useCallback(async (deviceId: string) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/access-codes/list`, {
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
      const response = await fetch(`${API_BASE_URL}/access-codes/create`, {
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
      const response = await fetch(`${API_BASE_URL}/access-codes/delete`, {
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
      const response = await fetch(`${API_BASE_URL}/events/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
          limit: 50,
        }),
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
    setSelectedDevice(device);
    setShowAccessCodes(false);
    setShowEvents(false);
    setShowAddCode(false);
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-400"></div>
      </div>
    );
  }

  if (error && devices.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
          <div className="flex items-center">
            <UilShieldCheck className="w-5 h-5 text-red-400 mr-2" />
            <span className="text-red-400 font-medium">Error loading devices</span>
          </div>
          <p className="text-red-300 text-sm mt-2">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <UilShieldCheck className="w-6 h-6 text-yellow-400" />
          <h2 className="text-xl font-bold text-white">Smart Locks</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors disabled:opacity-50"
        >
          <UilSync className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Device List */}
      <div className="space-y-3">
        {devices.map((device) => (
          <div
            key={device.device_id}
            className={`bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4 cursor-pointer transition-all hover:bg-gray-700/50 ${
              selectedDevice?.device_id === device.device_id ? 'ring-2 ring-yellow-400/50' : ''
            }`}
            onClick={() => handleDeviceSelect(device)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full ${device.properties.locked ? 'bg-red-600/20 text-red-400' : 'bg-green-600/20 text-green-400'}`}>
                  {device.properties.locked ? <UilLock className="w-5 h-5" /> : <UilLockOpenAlt className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-medium text-white">{device.display_name}</h3>
                  <div className="flex items-center space-x-2 text-sm text-gray-400">
                    <span>{device.properties.model?.manufacturer_display_name} {device.properties.model?.display_name}</span>
                    <div className="flex items-center space-x-1">
                      <UilCircle className={`w-3 h-3 ${device.properties.online ? 'text-green-400' : 'text-red-400'}`} />
                      {device.properties.battery_level && (
                        <>
                          <UilBatteryEmpty className="w-3 h-3" />
                          <span>{device.properties.battery_level}%</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    controlLock(device.device_id, device.properties.locked ? 'unlock' : 'lock');
                  }}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    device.properties.locked
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {device.properties.locked ? 'Unlock' : 'Lock'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Device Details */}
      {selectedDevice && (
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-white mb-4">Device Details</h3>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => {
                setShowAccessCodes(!showAccessCodes);
                if (!showAccessCodes) {
                  fetchAccessCodes(selectedDevice.device_id);
                }
              }}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors flex items-center space-x-1"
            >
              <UilKey className="w-4 h-4" />
              <span>Access Codes</span>
            </button>
            <button
              onClick={() => {
                setShowEvents(!showEvents);
                if (!showEvents) {
                  fetchEvents(selectedDevice.device_id);
                }
              }}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm transition-colors flex items-center space-x-1"
            >
              <UilHistory className="w-4 h-4" />
              <span>Events</span>
            </button>
          </div>

          {/* Access Codes Section */}
          {showAccessCodes && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-white">Access Codes</h4>
                <button
                  onClick={() => setShowAddCode(!showAddCode)}
                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition-colors flex items-center space-x-1"
                >
                  <UilPlus className="w-4 h-4" />
                  <span>Add</span>
                </button>
              </div>

              {/* Add Code Form */}
              {showAddCode && (
                <div className="bg-gray-700/50 rounded-lg p-3 mb-3">
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Code name"
                      value={newCodeName}
                      onChange={(e) => setNewCodeName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                    <input
                      type="text"
                      placeholder="Code (4-8 digits)"
                      value={newCodeValue}
                      onChange={(e) => setNewCodeValue(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={() => createAccessCode(selectedDevice.device_id, newCodeValue, newCodeName)}
                        disabled={!newCodeName || !newCodeValue || newCodeValue.length < 4}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-md text-sm transition-colors"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => {
                          setShowAddCode(false);
                          setNewCodeName('');
                          setNewCodeValue('');
                        }}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Access Codes List */}
              <div className="space-y-2">
                {accessCodes.map((code) => (
                  <div key={code.access_code_id} className="flex items-center justify-between bg-gray-700/30 rounded-lg p-2">
                    <div>
                      <span className="text-white font-medium">{code.name}</span>
                      <span className="text-gray-400 text-sm ml-2">({code.code})</span>
                    </div>
                    <button
                      onClick={() => deleteAccessCode(code.access_code_id, selectedDevice.device_id)}
                      className="p-1 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <UilTrashAlt className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {accessCodes.length === 0 && (
                  <p className="text-gray-400 text-sm">No access codes found</p>
                )}
              </div>
            </div>
          )}

          {/* Events Section */}
          {showEvents && (
            <div>
              <h4 className="font-medium text-white mb-2">Recent Events</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {events.map((event) => (
                  <div key={event.event_id} className="bg-gray-700/30 rounded-lg p-2">
                    <div className="flex justify-between items-start">
                      <span className="text-white text-sm">{formatEventType(event.event_type)}</span>
                      <span className="text-gray-400 text-xs">{formatTimestamp(event.occurred_at)}</span>
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <p className="text-gray-400 text-sm">No events found</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {devices.length === 0 && !loading && (
        <div className="text-center py-8">
          <UilShieldCheck className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Smart Locks Found</h3>
          <p className="text-gray-400 text-sm mb-4">Connect your smart locks to Seam to manage them here.</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-md transition-colors"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default SeamSecurity;
