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
                ? 'bg-gradient-to-r from-green-500/20 to-green-600/30 border-green-500/60 text-green-300 shadow-lg shadow-green-500/20' 
                : 'bg-gradient-to-r from-blue-500/20 to-blue-600/30 border-blue-500/60 text-blue-300 shadow-lg shadow-blue-500/20'
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
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gray-800/80 rounded-full p-1 backdrop-blur-sm">
            <UilBell size={12} className="text-gray-300" />
          </div>
        </div>
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-gray-900/95 to-gray-950/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-gray-800/40 animate-breath">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20"></div>
            <div className="absolute inset-0 rounded-full border-t-2 border-blue-400 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <UilHome size={24} className="text-blue-400" />
            </div>
          </div>
          <span className="text-gray-400 text-sm mt-4">Loading occupancy status...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-gradient-to-br from-gray-900/95 to-gray-950/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-red-900/40 animate-breath">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="bg-red-500/10 p-4 rounded-full border border-red-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-center">
            <h3 className="text-red-400 font-medium mb-1">Connection Error</h3>
            <p className="text-gray-400 text-sm max-w-xs">{error}</p>
          </div>
          <button 
            className="mt-4 px-4 py-2 bg-red-900/30 hover:bg-red-800/40 text-red-300 text-sm rounded-full border border-red-800/40 transition-colors"
            onClick={() => window.location.reload()}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (userHomeStatuses.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-900/95 to-gray-950/95 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-gray-800/40 animate-breath">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="bg-gray-800/70 p-4 rounded-full border border-gray-700/40">
            <UilUsersAlt size={24} className="text-gray-500" />
          </div>
          <div className="text-center">
            <h3 className="text-gray-400 font-medium mb-1">No Occupancy Data</h3>
            <p className="text-gray-500 text-sm max-w-xs">Residents will appear here when data is available</p>
          </div>
          <div className="mt-4 px-4 py-2 bg-gray-800/50 text-gray-400 text-sm rounded-full border border-gray-700/40">
            Waiting for data...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900/95 to-gray-950/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-gray-800/40 overflow-hidden animate-breath">
      {/* Header */}
      <div className="p-4 border-b border-gray-800/30 bg-gradient-to-r from-gray-900/50 to-gray-950/50">
        <div className="flex items-center space-x-3">
          <div className="bg-gray-800/70 p-2 rounded-full border border-gray-700/40 shadow-inner">
            <UilHome size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-gray-200 font-medium">Occupancy Status</h3>
            <p className="text-gray-400 text-xs">
              {usersAtHome.length > 0 
                ? `${usersAtHome.length} resident${usersAtHome.length === 1 ? '' : 's'} present` 
                : 'No one present'
              }
              {usersAway.length > 0 && ` • ${usersAway.length} away`}
              {unknownUsers.length > 0 && ` • ${unknownUsers.length} status unknown`}
            </p>
          </div>
        </div>
      </div>

      {/* House visualization */}
      <div className="p-6 sm:p-8 pb-8">
        <div className="relative flex items-center justify-center h-48 sm:h-56">
          {/* House icon - centered */}
          <div className="relative">
            {/* House background glow effect */}
            <div className={`absolute inset-0 blur-2xl scale-150 opacity-30 rounded-full transition-colors duration-700 ${
              usersAtHome.length > 0 ? 'bg-blue-500' : 'bg-gray-600'
            }`}></div>
            
            {/* Main house icon */}
            <div className="relative bg-gradient-to-br from-gray-800/80 to-gray-900/90 p-6 rounded-full border border-gray-700/40 backdrop-blur-sm shadow-2xl">
              <div className="relative flex items-center justify-center w-16 h-16">
                {/* Glass reflection */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent h-1/3 rounded-full pointer-events-none"></div>
                
                {/* Home icon */}
                <UilHome size={40} className={`transition-colors duration-700 ${
                  usersAtHome.length > 0 ? 'text-blue-300' : 'text-gray-400'
                }`} />
                
                {/* Fun house features */}
                {usersAtHome.length > 0 && (
                  <>
                    {/* Animated pulsing ring */}
                    <div className="absolute inset-0 border-2 border-blue-400/30 rounded-full animate-pulse"></div>
                    
                    {/* Chimney smoke when people are home */}
                    <div className="absolute -top-4 -right-1 w-1 h-3 opacity-60">
                      <div className="w-1 h-1 bg-gray-400 rounded-full animate-float"></div>
                      <div className="w-1 h-1 bg-gray-400 rounded-full animate-float" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-1 h-1 bg-gray-400 rounded-full animate-float" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </>
                )}
              </div>
              
              {/* House "lights" indicator for people home */}
              {usersAtHome.length > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-400 rounded-full shadow-lg shadow-blue-500/50 flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-900">{usersAtHome.length}</span>
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
          <div className="flex items-center space-x-2 bg-gray-800/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-gentle-pulse"></div>
            <span className="text-green-400">Present ({usersAtHome.length})</span>
          </div>
          <div className="flex items-center space-x-2 bg-gray-800/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-blue-400">Away ({usersAway.length})</span>
          </div>
          {unknownUsers.length > 0 && (
            <div className="flex items-center space-x-2 bg-gray-800/40 px-3 py-1.5 rounded-full backdrop-blur-sm">
              <div className="w-3 h-3 rounded-full bg-gray-500"></div>
              <span className="text-gray-400">Unknown ({unknownUsers.length})</span>
            </div>
          )}
        </div>

        {/* Professional hint text */}
        <div className="mt-3 sm:mt-4 text-center">
          <p className="text-gray-500 text-xs italic">Tap avatar to edit display name</p>
        </div>
      </div>
    </div>
  );
};

export default UserHomeStatusBoard;