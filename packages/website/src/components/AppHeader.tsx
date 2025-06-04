import React, { useEffect, useState } from 'react';
import AlarmControls from '../AlarmControls';
import UserProfile from './UserProfile';
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

  const onlineIndicatorColor = isOnline
    ? "bg-gradient-to-r from-teal-400 to-green-600 border-2 border-teal-300"
    : "bg-gradient-to-r from-gray-500 to-gray-700 border-2 border-gray-400";

  const getArmModeDisplay = () =>
    armMode === "stay" ? "Home" : armMode === "away" ? "Away" : "Disarmed";
    
  const getArmModeColor = () =>
    armMode === "stay" ? "text-green-400" : armMode === "away" ? "text-yellow-400" : "text-gray-400";

  const alarmControlsProps = {
    armMode,
    setArmMode,
    isOnline,
    setIsOnline,
    showNotification,
    refreshing,
    onAlarmStateChange, // Pass the callback to AlarmControls
  };

  return (
    <div 
      className="top-app-bar w-full flex flex-col" 
      style={{ 
        paddingTop: isIOS ? "calc(env(safe-area-inset-top) + 2rem)" : "env(safe-area-inset-top)",
        // Add hardware acceleration to prevent flickering during scrolling
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)"
      }}
    >
      <div 
        className="h-16 flex items-center justify-between px-4"
        style={{
          // Move content down slightly on iOS
          marginTop: isIOS ? "8px" : "0px"
        }}
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${onlineIndicatorColor} shadow-lg shadow-teal-500/20 ring-2 ring-black/20`} />
            <span className="veedu-text text-xl font-black bg-gradient-to-r from-yellow-300 via-orange-400 to-red-400 bg-clip-text text-transparent tracking-wider drop-shadow-sm">
              720 Front
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div
            className={`text-sm font-bold ${getArmModeColor()} mr-1 px-2 py-0.5 rounded-full bg-gray-900/50 border border-gray-800`}
          >
            {getArmModeDisplay()}
          </div>
          <AlarmControls {...alarmControlsProps} />
          <UserProfile />
        </div>
      </div>
    </div>
  );
};

export default React.memo(AppHeader);