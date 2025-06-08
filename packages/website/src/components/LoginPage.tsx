import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentHomeName } from '../utils/homeUtils';

const LoginPage: React.FC = () => {
  const { signInWithApple, isLoading } = useAuth();
  const homeName = getCurrentHomeName();

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 1px, transparent 1px),
                           radial-gradient(circle at 75% 75%, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}></div>
      </div>
      
      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Header Section */}
        <div className="text-center">
          <div className="mb-8">
            <img 
              src="/logo2.png" 
              alt="MANOR Logo" 
              className="w-24 h-24 mx-auto mb-6 rounded-2xl shadow-2xl ring-4 ring-white/20 transition-transform duration-300 hover:scale-105"
            />
          </div>
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">MANOR</h1>
          <p className="text-blue-200/80 text-lg font-medium">Welcome back to {homeName}</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 hover:border-white/20 transition-all duration-300">
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-xl font-medium text-white/90 mb-3">Sign in to continue</h2>
              <p className="text-blue-200/70 text-sm">Access your smart home securely</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleAppleSignIn}
                disabled={isLoading}
                className={`
                  group w-full flex items-center justify-center px-6 py-4 rounded-2xl font-semibold
                  transition-all duration-300 transform touch-manipulation
                  min-h-[56px] text-base
                  ${isLoading 
                    ? 'bg-gray-700/50 cursor-not-allowed text-gray-300' 
                    : 'bg-black hover:bg-gray-900 text-white hover:scale-[1.02] active:scale-[0.98] hover:shadow-2xl'
                  }
                  shadow-lg border border-gray-800 hover:border-gray-700
                `}
                style={{ 
                  WebkitTapHighlightColor: 'transparent',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-gray-400/30 border-t-gray-300 rounded-full animate-spin"></div>
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09 22C7.79 22.05 6.8 20.68 5.96 19.47C4.25 17 2.94 12.45 4.7 9.39C5.57 7.87 7.13 6.91 8.82 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"/>
                    </svg>
                    <span>Continue with Apple</span>
                  </div>
                )}
              </button>
              
              {/* Alternative sign-in hint */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-transparent text-blue-200/60">Secure authentication</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center space-x-2 text-blue-200/60">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs font-medium">End-to-end encrypted</span>
          </div>
          <p className="text-xs text-blue-300/50">
            Your privacy and security are our top priority
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
