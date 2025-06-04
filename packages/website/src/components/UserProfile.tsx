import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const UserProfile: React.FC = () => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex items-center space-x-2 sm:space-x-3 p-1 sm:p-2 rounded-lg">
      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
        <span className="text-white text-xs sm:text-sm font-medium">
          {user.givenName?.[0]}{user.familyName?.[0]}
        </span>
      </div>
      <div className="hidden sm:block text-left">
        <p className="text-white text-sm font-medium">
          {user.givenName} {user.familyName}
        </p>
        <p className="text-blue-200 text-xs">{user.email}</p>
      </div>
    </div>
  );
};

export default UserProfile;
