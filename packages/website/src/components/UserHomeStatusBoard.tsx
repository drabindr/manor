import React, { useState, useCallback } from 'react';
import { UilHome, UilUsersAlt, UilEdit } from '@iconscout/react-unicons';
import UserHomeStatus from './UserHomeStatus';

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

  // Generate user display component
  const UserIndicator: React.FC<{ user: UserHomeStatusType; style: React.CSSProperties }> = ({ user, style }) => {
    const isEditing = editingUserId === user.userId;
    const displayName = user.displayName || user.userId.substring(0, 3).toUpperCase();
    const isHome = user.state === 'home';
    
    if (isEditing) {
      return (
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
              status={user.state}
              userId={user.userId}
              displayName={user.displayName}
              homeId={homeId}
              onDisplayNameUpdate={(userId, newName) => {
                onDisplayNameUpdate?.(userId, newName);
                setEditingUserId(null);
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div 
        className="absolute top-1/2 left-1/2 cursor-pointer transition-all duration-300 hover:scale-110 touch-manipulation group"
        onClick={() => {
          triggerHaptic('light');
          setEditingUserId(user.userId);
        }}
        style={{
          ...style,
          transform: `${style.transform || ''} translateZ(0)`,
          backfaceVisibility: 'hidden'
        }}
      >
        <div className="relative flex flex-col items-center space-y-1">
          {/* User avatar circle */}
          <div 
            className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${
              isHome 
                ? 'bg-green-500/20 border-green-500 text-green-300 shadow-lg shadow-green-500/20' 
                : 'bg-blue-500/20 border-blue-500 text-blue-300 shadow-lg shadow-blue-500/20'
            } group-hover:shadow-xl ${isHome ? 'group-hover:shadow-green-500/30' : 'group-hover:shadow-blue-500/30'}`}
          >
            {displayName}
          </div>
          
          {/* Status dot */}
          <div 
            className={`w-3 h-3 rounded-full ${
              isHome 
                ? 'bg-green-500 animate-pulse' 
                : 'bg-blue-500'
            }`}
          />
          
          {/* Edit indicator */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <UilEdit size={12} className="text-gray-400" />
          </div>
        </div>
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          <span className="ml-3 text-gray-400">Loading who's home...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-red-700/50">
        <div className="flex items-center justify-center py-8 text-red-400">
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (userHomeStatuses.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl p-6 border border-gray-700/50">
        <div className="flex items-center justify-center py-8 text-gray-400">
          <UilUsersAlt className="mr-2" size={20} />
          <span className="text-sm">No user status information available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl border border-gray-700/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50 bg-gradient-to-r from-gray-800/50 to-gray-900/50">
        <div className="flex items-center space-x-3">
          <div className="bg-gray-800/70 p-2 rounded-lg border border-gray-700/40 shadow-inner">
            <UilHome size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-gray-200 font-medium">Who's Home? 🏠</h3>
            <p className="text-gray-400 text-xs">
              {usersAtHome.length > 0 
                ? `${usersAtHome.length} person${usersAtHome.length === 1 ? '' : 's'} enjoying home` 
                : 'Nobody home'
              }
              {usersAway.length > 0 && ` • ${usersAway.length} out and about`}
              {unknownUsers.length > 0 && ` • ${unknownUsers.length} status unknown`}
            </p>
          </div>
        </div>
      </div>

      {/* House visualization */}
      <div className="p-4 sm:p-6 pb-6 sm:pb-8">
        <div className="relative flex items-center justify-center h-40 sm:h-48">
          {/* House icon - centered */}
          <div className="relative">
            {/* House background glow */}
            <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-xl scale-150"></div>
            
            {/* Main house icon */}
            <div className="relative bg-gradient-to-br from-gray-700/50 to-gray-800/70 p-4 sm:p-6 rounded-2xl border border-gray-600/30 backdrop-blur-sm shadow-2xl">
              <div className="relative">
                <UilHome size={32} className="text-gray-300 sm:w-12 sm:h-12" />
                
                {/* Fun house features */}
                {usersAtHome.length > 0 && (
                  <>
                    {/* Chimney smoke when people are home */}
                    <div className="absolute -top-2 -right-1 w-1 h-3 opacity-60">
                      <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    
                    {/* Window lights */}
                    <div className="absolute top-1 left-1 w-1 h-1 bg-yellow-400 rounded-full animate-pulse"></div>
                    <div className="absolute top-1 right-1 w-1 h-1 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                  </>
                )}
              </div>
              
              {/* House "lights" indicator for people home */}
              {usersAtHome.length > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full animate-pulse shadow-lg shadow-yellow-500/50 flex items-center justify-center">
                  <span className="text-xs font-bold text-yellow-900">{usersAtHome.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Position users around the house */}
          {userHomeStatuses.map((user, index) => {
            const totalUsers = userHomeStatuses.length;
            const angle = (index * 360) / totalUsers;
            const radius = totalUsers === 1 ? 60 : Math.min(80, 60 + totalUsers * 8); // Adjust radius based on user count
            
            // Calculate position
            const x = Math.cos((angle - 90) * Math.PI / 180) * radius;
            const y = Math.sin((angle - 90) * Math.PI / 180) * radius;
            
            return (
              <UserIndicator
                key={user.userId}
                user={user}
                style={{
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
                }}
              />
            );
          })}
        </div>

        {/* Status legend */}
        <div className="mt-4 sm:mt-6 flex items-center justify-center space-x-4 sm:space-x-6 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-green-400">🏠 At Home ({usersAtHome.length})</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-blue-400">🚗 Away ({usersAway.length})</span>
          </div>
          {unknownUsers.length > 0 && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span className="text-gray-400">❓ Unknown ({unknownUsers.length})</span>
            </div>
          )}
        </div>

        {/* Hint text */}
        <div className="mt-3 sm:mt-4 text-center">
          <p className="text-gray-500 text-xs">👆 Tap any person to give them a custom name</p>
        </div>
      </div>
    </div>
  );
};

export default UserHomeStatusBoard;