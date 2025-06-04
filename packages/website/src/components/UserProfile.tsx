import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const UserProfile: React.FC = () => {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">
            {user.givenName?.[0]}{user.familyName?.[0]}
          </span>
        </div>
        <div className="hidden sm:block text-left">
          <p className="text-white text-sm font-medium">
            {user.givenName} {user.familyName}
          </p>
          <p className="text-blue-200 text-xs">{user.email}</p>
        </div>
        <svg 
          className={`w-4 h-4 text-white transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user.givenName?.[0]}{user.familyName?.[0]}
                </span>
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">
                  {user.givenName} {user.familyName}
                </p>
                <p className="text-gray-500 text-xs">{user.email}</p>
              </div>
            </div>
          </div>

          <div className="py-2">
            <div className="px-4 py-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Account Info</p>
              <div className="space-y-1">
                {user.role && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Role:</span>
                    <span className="text-sm font-medium text-gray-900 bg-blue-100 px-2 py-1 rounded">
                      {user.role}
                    </span>
                  </div>
                )}
                {user.homeId && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Home ID:</span>
                    <span className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">
                      {user.homeId}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">User ID:</span>
                  <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {user.sub.slice(0, 8)}...
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 py-2">
            <button
              onClick={signOut}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center space-x-2"
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
          className="fixed inset-0 z-40" 
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}
    </div>
  );
};

export default UserProfile;
