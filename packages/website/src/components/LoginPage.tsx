import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const { signInWithApple, isLoading } = useAuth();

  // Enhanced iPhone haptic feedback helper
  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
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
  };

  const handleAppleSignIn = async () => {
    try {
      triggerHaptic('light'); // Add haptic feedback for button press
      await signInWithApple();
    } catch (error) {
      console.error('Login failed:', error);
      triggerHaptic('heavy'); // Add haptic feedback for error
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Casa Guard</h1>
          <p className="text-blue-200 text-lg">Your Smart Home Security System</p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white mb-2">Welcome Back</h2>
              <p className="text-blue-200">Sign in to access your home security system</p>
            </div>

            <button
              onClick={handleAppleSignIn}
              disabled={isLoading}
              className={`
                w-full flex items-center justify-center px-6 py-3 rounded-xl font-medium text-white
                transition-all duration-200 transform touch-manipulation
                min-h-[48px] 
                ${isLoading 
                  ? 'bg-gray-600 cursor-not-allowed' 
                  : 'bg-black hover:bg-gray-900 hover:scale-105 active:scale-95'
                }
                shadow-lg hover:shadow-xl
              `}
              style={{ 
                WebkitTapHighlightColor: 'transparent',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden'
              }}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                  </svg>
                  <span>Continue with Apple</span>
                </div>
              )}
            </button>

            <div className="text-center">
              <p className="text-sm text-blue-200">
                Secure authentication powered by Apple Sign In
              </p>
            </div>

            <div className="border-t border-white/20 pt-6">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-medium text-white">Features</h3>
                <div className="grid grid-cols-2 gap-3 text-sm text-blue-200">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Live Cameras</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Garage Control</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Smart Devices</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Event History</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-blue-300">
            Protected by end-to-end encryption
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
