import React, { useState, useCallback } from 'react';
import { UilHome, UilUsersAlt, UilBell } from '@iconscout/react-unicons';
import UserHomeStatus from './UserHomeStatus';
import './UserHomeStatusBoard.css';

interface UserHomeStatusType {
  userId: string;
  homeId: string;
  state: 'home' | 'away' | null;
  displayName?: string;
}

interface UserHomeStatusBoardProps {
  userHomeStatuses: UserHomeStatusType[];
  homeId: string;
  isLoading?: boolean;
  error?: string | null;
  onDisplayNameUpdate?: (userId: string, newDisplayName: string) => void;
}

const UserHomeStatusBoard: React.FC<UserHomeStatusBoardProps> = ({
  userHomeStatuses,
  homeId,
  isLoading = false,
  error = null,
  onDisplayNameUpdate
}) => {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Enhanced iPhone haptic feedback helper
  const triggerHaptic = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40
      };
      navigator.vibrate(patterns[intensity]);
    }
    
    // Enhanced haptic feedback for modern browsers
    if ('hapticFeedback' in navigator) {
      const intensityLevels = {
        light: 0.3,
        medium: 0.6,
        heavy: 1.0
      };
      (navigator as any).hapticFeedback?.impact(intensityLevels[intensity]);
    }
  }, []);

  // Get users at home and away
  const usersAtHome = userHomeStatuses.filter(user => user.state === 'home');
  const usersAway = userHomeStatuses.filter(user => user.state === 'away');
  const unknownUsers = userHomeStatuses.filter(user => user.state === null || user.state === undefined);

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 backdrop-blur-lg rounded-xl border border-indigo-800/30 p-4 animate-breath">
        <div className="flex items-center justify-center space-x-3">
          <span className="text-xl animate-pulse">🏠</span>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-gray-300">Loading occupancy...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 backdrop-blur-lg rounded-xl border border-red-800/30 p-4 animate-breath">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="text-sm font-medium text-red-300">Connection Error</h3>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          </div>
          <button 
            className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800/60 text-red-200 text-xs rounded-lg border border-red-700/40 transition-colors"
            onClick={() => window.location.reload()}
          >
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (userHomeStatuses.length === 0) {
    return (
      <div className="bg-gradient-to-r from-gray-900/40 to-gray-800/40 backdrop-blur-lg rounded-xl border border-gray-700/30 p-4 animate-breath">
        <div className="flex items-center justify-center space-x-3">
          <span className="text-xl">🏚️</span>
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-300">No Residents</h3>
            <p className="text-xs text-gray-400">Waiting for occupancy data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 backdrop-blur-lg rounded-xl border border-indigo-800/30 p-4 animate-breath">
      {/* Compact horizontal layout */}
      <div className="flex items-center justify-between">
        {/* Left side: Home status with emoji */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <span className="text-3xl">{usersAtHome.length > 0 ? '🏠' : '🏚️'}</span>
            {usersAtHome.length > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-white">{usersAtHome.length}</span>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">
              Occupancy Status
            </h3>
            <p className="text-xs text-gray-300">
              {usersAtHome.length > 0 
                ? `${usersAtHome.length} home` 
                : 'Empty'
              }
              {usersAway.length > 0 && ` • ${usersAway.length} away`}
            </p>
          </div>
        </div>

        {/* Right side: User avatars in horizontal row */}
        <div className="flex items-center space-x-2">
          {userHomeStatuses.slice(0, 4).map((user) => {
            const displayName = user.displayName || user.userId.substring(0, 2).toUpperCase();
            const isHome = user.state === 'home';
            
            return (
              <div
                key={user.userId}
                className="relative cursor-pointer transition-all duration-300 hover:scale-110 touch-manipulation group"
                onClick={() => {
                  triggerHaptic('light');
                  setEditingUserId(user.userId);
                }}
                style={{
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                {/* User avatar with status emoji overlay */}
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  isHome 
                    ? 'bg-gradient-to-r from-green-500/30 to-green-600/40 border-green-500/70 text-green-200' 
                    : 'bg-gradient-to-r from-blue-500/30 to-blue-600/40 border-blue-500/70 text-blue-200'
                } group-hover:shadow-lg`}>
                  {displayName}
                </div>
                
                {/* Status emoji indicator - larger and clearer */}
                <div className="absolute -bottom-1 -right-1 text-base bg-gray-900/60 rounded-full p-0.5">
                  {isHome ? '🏡' : '🚗'}
                </div>
                
                {/* Edit hint on hover */}
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  Tap to edit
                </div>
              </div>
            );
          })}
          
          {/* Show count if more than 4 users */}
          {userHomeStatuses.length > 4 && (
            <div className="w-10 h-10 rounded-full bg-gray-700/50 border-2 border-gray-500/50 flex items-center justify-center text-xs font-bold text-gray-300">
              +{userHomeStatuses.length - 4}
            </div>
          )}
          
          {/* Status summary counts */}
          <div className="ml-2 text-xs text-gray-300 hidden sm:flex items-center space-x-2">
            {usersAtHome.length > 0 && (
              <span className="bg-green-900/30 px-2 py-1.5 rounded-full">
                {usersAtHome.length} home
              </span>
            )}
            {usersAway.length > 0 && (
              <span className="bg-blue-900/30 px-2 py-1.5 rounded-full">
                {usersAway.length} away
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal overlay */}
      {editingUserId && userHomeStatuses.find(u => u.userId === editingUserId) && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingUserId(null);
              triggerHaptic('light');
            }
          }}
        >
          <div className="max-w-sm w-full">
            <UserHomeStatus
              status={userHomeStatuses.find(u => u.userId === editingUserId)?.state || null}
              userId={editingUserId}
              displayName={userHomeStatuses.find(u => u.userId === editingUserId)?.displayName}
              homeId={homeId}
              onDisplayNameUpdate={(userId, newName) => {
                onDisplayNameUpdate?.(userId, newName);
                setEditingUserId(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default UserHomeStatusBoard;
