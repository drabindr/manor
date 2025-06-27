import React, { useEffect, useState } from 'react';
import AlarmControls from '../AlarmControls';
import { useNotifications } from './NotificationsProvider';

interface AppHeaderProps {
  armMode: "stay" | "away" | null;
  setArmMode: (mode: "stay" | "away" | null) => void;
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  refreshing: boolean;
  onAlarmStateChange?: () => void; // Add optional callback for alarm state changes
}

const AppHeader: React.FC<AppHeaderProps> = ({ 
  armMode, 
  setArmMode, 
  isOnline, 
  setIsOnline, 
  refreshing,
  onAlarmStateChange
}) => {
  const { showNotification } = useNotifications();
  const [isIOS, setIsIOS] = useState(false);
  
  // Detect iOS device
  useEffect(() => {
    const ua = window.navigator.userAgent;
    setIsIOS(/iP(hone|od|ad)/.test(ua));
  }, []);

  // Logo filter for connection status
  const logoFilter = isOnline
    ? "none" // Color version when connected
    : "grayscale(100%) brightness(0.7)"; // Grayscale when not connected

  const getArmModeDisplay = () =>
    armMode === "stay" ? "Home" : armMode === "away" ? "Away" : "Disarmed";
    
  const getArmModeColor = () =>
    armMode === "stay" ? "text-green-400" : armMode === "away" ? "text-yellow-400" : "text-gray-400";

  const alarmControlsProps = {
    armMode,
    setArmMode: setArmMode as React.Dispatch<React.SetStateAction<"stay" | "away" | null>>,
    isOnline,
    setIsOnline: setIsOnline as React.Dispatch<React.SetStateAction<boolean>>,
    showNotification,
    refreshing,
    onAlarmStateChange, // Pass the callback to AlarmControls
  };

  return (
    <div 
      className="top-app-bar w-full flex flex-col touch-manipulation ios-safe-inset-x" 
      style={{ 
        paddingTop: isIOS ? "calc(env(safe-area-inset-top) + 2rem)" : "env(safe-area-inset-top)",
        // Enhanced hardware acceleration and performance optimizations
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        willChange: "transform",
        // Enhanced iOS-specific optimizations
        WebkitUserSelect: "none",
        userSelect: "none",
        WebkitTouchCallout: "none"
      }}
    >
      <div 
        className="h-16 flex items-center justify-between px-3 xs:px-3 sm:px-4 transition-all duration-300 ease-out app-header-content"
        style={{
          // Enhanced iOS positioning with better spacing for iPhone 15 Pro
          marginTop: isIOS ? "12px" : "4px",
          // Add subtle interaction feedback
          transform: "translateZ(0)"
        }}
      >
        <div className="flex items-center space-x-3 xs:space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-1 xs:space-x-1.5 sm:space-x-2">
            {/* Logo2 as connection indicator */}
            <img 
              src="/logo2.png" 
              alt="Connection Status" 
              className="w-12 h-12 transition-all duration-500 hover:scale-110 active:scale-95 status-indicator"
              style={{
                filter: logoFilter,
                transform: "translateZ(0)",
                backfaceVisibility: "hidden"
              }}
            />
            
            {/* Simple house name text */}
            <span className="veedu-text text-lg xs:text-xl sm:text-2xl font-black text-liquid-primary tracking-wide drop-shadow-md transition-all duration-300 text-optimized whitespace-nowrap"
                  style={{
                    background: "linear-gradient(135deg, rgba(255, 91, 4, 1), rgba(244, 212, 124, 1))",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    fontFamily: "var(--font-display)",
                    fontWeight: "900",
                    letterSpacing: "0.02em",
                    textShadow: "0 2px 4px rgba(255, 91, 4, 0.3)"
                  }}>
              720 Front
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2 xs:space-x-2.5 sm:space-x-3">
          {/* Enhanced arm mode display with better touch targets */}
          <div
            className={`text-xs xs:text-sm sm:text-sm font-bold ${getArmModeColor()} px-2.5 xs:px-3 py-1.5 rounded-full bg-gray-900/60 border border-gray-800/60 backdrop-blur-sm shadow-lg transition-all duration-300 hover:bg-gray-800/60 active:scale-95 touch-manipulation min-w-[55px] xs:min-w-[60px] text-center`}
          >
            {getArmModeDisplay()}
          </div>
          <AlarmControls {...alarmControlsProps} />
        </div>
      </div>
    </div>
  );
};

export default React.memo(AppHeader);