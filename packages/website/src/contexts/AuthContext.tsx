import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AuthService, User, AuthConfig, initializeAuth, getAuthService } from '../services/AuthService';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithApple: () => Promise<void>;
  signOut: () => void;
  getAccessToken: () => string | null;
  hasRole: (role: string) => boolean;
  belongsToHome: (homeId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  config: AuthConfig;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, config }) => {
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const [user, setUser] = useState<User | null>(null);
  
  // Check for development mode to determine initial loading state
  const isDevelopmentMode = config.userPoolId.includes('DEVDEVDEV') || 
                           config.userPoolClientId.includes('development') ||
                           process.env.REACT_APP_DEV_AUTH_BYPASS === 'true';
  
  // In development mode, start with loading = false to avoid spinner
  const [isLoading, setIsLoading] = useState(!isDevelopmentMode);

  useEffect(() => {
    // Set a timeout to prevent indefinite loading
    const loadingTimeout = setTimeout(() => {
      console.warn('[Auth] Loading timeout reached, forcing loading to false');
      setIsLoading(false);
    }, 10000); // 10 second timeout

    // Initialize auth service
    const service = initializeAuth(config);
    setAuthService(service);

    // Check if user is already authenticated
    if (service.isAuthenticated()) {
      setUser(service.getCurrentUser());
    }

    // Handle OAuth callback if present
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    
    if (window.location.pathname === '/auth/callback') {
      if (code) {
        handleAuthCallback(service, code);
      } else if (error) {
        console.error('Auth error:', error, errorDescription);
        
        // Only redirect for non-Apple errors or truly fatal Apple errors
        if (error === 'access_denied') {
          setIsLoading(false);
          window.location.href = '/?error=' + encodeURIComponent('User cancelled authentication');
        } else {
          // For other errors, try to proceed with normal auth flow
          setIsLoading(false);
          window.location.href = '/?error=' + encodeURIComponent(errorDescription || 'Authentication failed');
        }
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }

    // Clear the timeout since we've completed initialization
    clearTimeout(loadingTimeout);

    // Cleanup function
    return () => {
      clearTimeout(loadingTimeout);
    };
  }, [config]);

  const handleMissingAttributesError = async (service: AuthService, errorDescription: string) => {
    try {
      setIsLoading(true);
      
      console.error('❌ Apple Sign-In failed due to missing attributes:', errorDescription);
      console.error('❌ This means Apple did not provide required user information');
      console.error('❌ Without authorization code, we cannot get real tokens from Cognito');
      console.error('❌ User must retry sign-in or use different provider');
      
      // DO NOT create placeholder tokens - this causes the refresh token issues
      // Instead, redirect to login with a clear error message
      const errorMsg = 'Apple Sign-In failed: missing required user information. Please try again or use a different sign-in method.';
      window.location.href = '/?error=' + encodeURIComponent(errorMsg);
      
    } catch (error) {
      console.error('Failed to handle missing attributes error:', error);
      window.location.href = '/?error=' + encodeURIComponent('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthCallback = async (service: AuthService, code: string) => {
    const callbackTimeout = setTimeout(() => {
      console.warn('[Auth] Callback timeout reached, forcing loading to false');
      setIsLoading(false);
      window.location.href = '/?error=' + encodeURIComponent('Authentication timeout');
    }, 15000); // 15 second timeout for callback

    try {
      setIsLoading(true);
      const user = await service.handleCallback(code);
      setUser(user);
      
      clearTimeout(callbackTimeout);
      // Force redirect to main app instead of using history.replaceState
      window.location.href = '/';
    } catch (error) {
      console.error('Authentication callback failed:', error);
      clearTimeout(callbackTimeout);
      // Redirect to login
      window.location.href = '/';
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithApple = async () => {
    if (!authService) return;
    
    try {
      await authService.signInWithApple();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const signOut = () => {
    if (!authService) return;
    
    authService.signOut();
    setUser(null);
  };

  const getAccessToken = (): string | null => {
    if (!authService) return null;
    return authService.getAccessToken();
  };

  const hasRole = (role: string): boolean => {
    if (!authService) return false;
    return authService.hasRole(role);
  };

  const belongsToHome = (homeId: string): boolean => {
    if (!authService) return false;
    return authService.belongsToHome(homeId);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    signInWithApple,
    signOut,
    getAccessToken,
    hasRole,
    belongsToHome,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
