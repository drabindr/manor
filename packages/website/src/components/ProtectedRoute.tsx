import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoginPage from './LoginPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
  requiredHomeId?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole, 
  requiredHomeId 
}) => {
  const { isAuthenticated, isLoading, user, hasRole, belongsToHome } = useAuth();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <img 
            src="/logo2.png" 
            alt="Casa Guard Logo" 
            className="w-16 h-16 mx-auto mb-4 animate-pulse"
          />
          <p className="text-white text-lg">Loading Casa Guard...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, show login page
  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  // Check role-based access
  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-pink-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-red-200 mb-4">
              You don't have the required permissions to access this area.
            </p>
            <p className="text-sm text-red-300">
              Required role: <span className="font-mono bg-red-800/50 px-2 py-1 rounded">{requiredRole}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check home-based access
  if (requiredHomeId && !belongsToHome(requiredHomeId)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 via-orange-800 to-red-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
            <div className="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2V7zm0 0a2 2 0 012-2h10a2 2 0 012 2v2H3V7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Wrong Home</h2>
            <p className="text-amber-200 mb-4">
              You don't have access to this home's security system.
            </p>
            <p className="text-sm text-amber-300">
              Required home: <span className="font-mono bg-amber-800/50 px-2 py-1 rounded">{requiredHomeId}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated and authorized, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;
