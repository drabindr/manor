import React, { useState, useEffect } from 'react';
import { UilUser, UilHome, UilSignout, UilPen, UilCheck } from '@iconscout/react-unicons';
import axios from 'axios';

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
  
  // Admin API URL
  const ADMIN_API_BASE_URL = "https://nocd1rav49.execute-api.us-east-1.amazonaws.com/prod";
  
  // Get display name with fallback
  const userName = displayName || userId.substring(0, 5) + '...';
  
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
    setNewDisplayName(displayName || '');
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
            <span className="text-sm text-gray-200 font-medium">{userName}</span>
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
