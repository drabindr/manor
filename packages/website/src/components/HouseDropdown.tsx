import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Enhanced haptic feedback helper
const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if ('vibrate' in navigator) {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate([50, 25, 50]);
        break;
      case 'heavy':
        navigator.vibrate([100, 50, 100]);
        break;
    }
  }
};

const HouseDropdown: React.FC = () => {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative house-dropdown">
      <button
        onClick={() => {
          triggerHaptic('light');
          setIsMenuOpen(!isMenuOpen);
        }}
        className="flex items-center space-x-1 xs:space-x-1.5 sm:space-x-2 p-1.5 xs:p-2 sm:p-3 rounded-xl hover:bg-white/10 transition-all duration-200 min-h-[44px] min-w-[44px] touch-manipulation transform hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-white/20"
        style={{ transform: 'translateZ(0)' }}
      >
        <span className="veedu-text text-base xs:text-lg sm:text-xl font-black bg-gradient-to-r from-yellow-300 via-orange-400 to-red-400 bg-clip-text text-transparent tracking-wider drop-shadow-sm transition-all duration-200 text-optimized">
          <span className="inline-block">720 Front</span>
        </span>
        <svg 
          className={`w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-white transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isMenuOpen && (
        <div className="absolute left-0 top-full mt-3 w-56 sm:w-64 bg-gray-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700/60 py-3 z-50 dropdown-menu animate-fade-in-up"
             style={{ transform: 'translateZ(0)' }}>
          <div className="px-4 py-3 border-b border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user.givenName?.[0]}{user.familyName?.[0]}
                </span>
              </div>
              <div>
                <p className="text-white text-sm font-medium">
                  {user.givenName} {user.familyName}
                </p>
                <p className="text-gray-300 text-xs">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="py-2">
            <div className="px-4 py-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Account Info</p>
              <div className="space-y-1">
                {user.role && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">Role:</span>
                    <span className="text-sm font-medium text-white bg-blue-600/80 px-2 py-1 rounded">
                      {user.role}
                    </span>
                  </div>
                )}
                {user.homeId && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">Home ID:</span>
                    <span className="text-sm font-mono text-white bg-gray-700/80 px-2 py-1 rounded">
                      {user.homeId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-300">User ID:</span>
                  <span className="text-xs font-mono text-gray-400 bg-gray-700/80 px-2 py-1 rounded">
                    {user.sub.slice(0, 8)}...
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 py-2">
            <button
              onClick={() => {
                triggerHaptic('medium');
                signOut();
              }}
              className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-all duration-200 flex items-center space-x-2 min-h-[48px] touch-manipulation rounded-xl mx-2 focus:outline-none focus:ring-2 focus:ring-red-500/50 active:bg-red-900/30"
              style={{ transform: 'translateZ(0)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Backdrop to close menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 z-40 tap-highlight-transparent touch-manipulation" 
          onClick={() => {
            triggerHaptic('light');
            setIsMenuOpen(false);
          }}
        ></div>
      )}
    </div>
  );
};

export default HouseDropdown;