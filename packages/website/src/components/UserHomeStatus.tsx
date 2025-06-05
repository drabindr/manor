import React, { useState, useEffect } from 'react';
import { UilUser, UilHome, UilSignout, UilPen, UilCheck } from '@iconscout/react-unicons';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import UserProfilesService from '../services/UserProfilesService';

interface UserHomeStatusProps {
  status: 'home' | 'away' | null;
  userId: string;
  displayName?: string;
  homeId: string;
  onDisplayNameUpdate?: (userId: string, newDisplayName: string) => void;
}

const UserHomeStatus: React.FC<UserHomeStatusProps> = ({ status, userId, displayName, homeId, onDisplayNameUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(displayName || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const [isLoadingName, setIsLoadingName] = useState(false);
  const { user } = useAuth();
  
  // Admin API URL
  const ADMIN_API_BASE_URL = "https://nocd1rav49.execute-api.us-east-1.amazonaws.com/prod";
  
  // Initialize UserProfilesService
  const userProfilesService = UserProfilesService.getInstance();
  
  // Effect to load user display name
  useEffect(() => {
    const loadUserDisplayName = async () => {
      // If we have a custom display name, use it
      if (displayName && displayName.trim()) {
        setUserDisplayName(displayName);
        return;
      }

      // If this is the current user, use their auth data directly
      if (user && userId === user.sub && user.givenName && user.familyName) {
        const fullName = `${user.givenName} ${user.familyName}`.trim();
        setUserDisplayName(fullName);
        return;
      }

      // For other users, fetch from the API
      if (homeId && userId !== user?.sub) {
        setIsLoadingName(true);
        try {
          const fetchedDisplayName = await userProfilesService.getUserDisplayName(userId, homeId);
          setUserDisplayName(fetchedDisplayName);
        } catch (error) {
          console.error('Error loading user display name:', error);
          // Fall back to UUID truncation
          setUserDisplayName(userId.substring(0, 5) + '...');
        } finally {
          setIsLoadingName(false);
        }
      } else {
        // Fallback for no homeId or same user without names
        setUserDisplayName(userId.substring(0, 5) + '...');
      }
    };

    loadUserDisplayName();
  }, [userId, displayName, homeId, user, userProfilesService]);

  // Get display name to show (use state or fallback)
  const userName = userDisplayName || displayName || 
    (user && userId === user.sub && user.givenName && user.familyName 
      ? `${user.givenName} ${user.familyName}`.trim() 
      : userId.substring(0, 5) + '...');
  
  // Get status indicator based on user's status
  const getStatusIndicator = () => {
    switch (status) {
      case 'home':
        return (
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-green-400 text-xs">Home</span>
          </div>
        );
      case 'away':
        return (
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-blue-400 text-xs">Away</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-500"></div>
            <span className="text-gray-400 text-xs">Unknown</span>
          </div>
        );
    }
  };
  
  // Get appropriate icon based on user's status
  const StatusIcon = () => {
    switch (status) {
      case 'home':
        return <UilHome className="text-green-500" size={18} />;
      case 'away':
        return <UilSignout className="text-blue-500" size={18} />;
      default:
        return <UilUser className="text-gray-500" size={18} />;
    }
  };

  // Handle double click to open edit mode
  const handleDoubleClick = () => {
    setIsEditing(true);
    // Initialize with current display name, or if none exists and this is the current user, use their actual name
    const initialDisplayName = displayName || 
      (user && userId === user.sub && user.givenName && user.familyName 
        ? `${user.givenName} ${user.familyName}`.trim() 
        : '');
    setNewDisplayName(initialDisplayName);
    setError(null);
  };

  // Handle form submission to update display name
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Use the admin API to update the display name
      await axios.post(`${ADMIN_API_BASE_URL}/saveDisplayName`, {
        userId,
        homeId,
        displayName: newDisplayName,
      });
      
      console.log(`Display name for ${userId} saved using Admin API.`);
      
      // Call the parent callback if provided
      if (onDisplayNameUpdate) {
        onDisplayNameUpdate(userId, newDisplayName);
      }

      // Update local state immediately
      setUserDisplayName(newDisplayName);

      // Clear cache for this user so fresh data is fetched next time
      userProfilesService.clearCache(userId);

      // Close the edit mode
      setIsEditing(false);
    } catch (err) {
      console.error("Error saving display name:", err);
      setError(`Failed to save display name: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel editing
  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
  };

  // Render edit mode
  if (isEditing) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 border border-blue-500/50 transition-all duration-300 shadow-lg">
        <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-full bg-gray-700 border border-gray-600/30">
              <StatusIcon />
            </div>
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Enter display name"
              className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-red-400 text-xs px-2 py-1 bg-red-900/20 rounded border border-red-800/30">
              {error}
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-300 hover:text-white text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center justify-center space-x-1 bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <UilCheck size={14} />
              )}
              <span>Save</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Render normal view with double-click functionality
  return (
    <div 
      className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 shadow-md hover:shadow-lg hover:bg-gray-800/70 cursor-pointer"
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-full bg-gray-700 border border-gray-600/30">
            <StatusIcon />
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-sm text-gray-200 font-medium">
              {isLoadingName ? (
                <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
              ) : (
                userName
              )}
            </span>
            <UilPen 
              size={12} 
              className="text-gray-400 hover:text-blue-400 cursor-pointer transition-colors" 
              onClick={(e) => {
                e.stopPropagation();
                handleDoubleClick();
              }}
            />
          </div>
        </div>
        {getStatusIndicator()}
      </div>
    </div>
  );
};

export default UserHomeStatus;
