import React, { useState } from "react";

type LightSwitchProps = {
  light: {
    alias: string;
    deviceId: string;
    relay_state: number; // 0 for Off, 1 for On
  };
  toggleLight: (deviceId: string, newState: boolean) => void;
  iconPath?: string; // Optional path for the background image
};

const LightSwitch: React.FC<LightSwitchProps> = ({ light, toggleLight, iconPath }) => {
  const isOn = light.relay_state === 1;
  const [isPressed, setIsPressed] = useState(false);
  
  // Enhanced haptic feedback helper
  const triggerHaptic = (intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
    if ('vibrate' in navigator) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 40
      };
      navigator.vibrate(patterns[intensity]);
    }
  };

  const handleTouchStart = () => {
    setIsPressed(true);
    triggerHaptic('light');
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  const handleClick = () => {
    toggleLight(light.deviceId, !isOn);
    triggerHaptic('medium');
  };
  
  return (
    <div
      className={`flex flex-col items-center justify-between px-2 py-3 widget-base transition-all duration-200 cursor-pointer w-full touch-manipulation transform hover:scale-105 active:scale-95 ${
        isOn ? 'active ring-2 ring-amber-400/40' : ''
      } ${isPressed ? 'scale-95' : 'scale-100'}`}
      style={{
        background: `${
          isOn 
            ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 41, 59, 0.95) 100%)' 
            : 'var(--widget-bg)'
        }${iconPath ? `, url(${iconPath}) center center / cover no-repeat` : ''}`,
        transform: `${isOn ? 'scale(1.02)' : 'scale(1)'} ${isPressed ? 'scale(0.95)' : ''}`,
        // Enhanced hardware acceleration for iPhone
        willChange: "transform, box-shadow",
        WebkitTransform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        // Better touch targets for iPhone
        minWidth: "75px",
        minHeight: "110px"
      }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      role="switch"
      aria-checked={isOn}
      aria-label={`${light.alias} light switch, currently ${isOn ? 'on' : 'off'}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Enhanced light glow effect when on */}
      {isOn && (
        <div className="absolute inset-0 rounded-2xl bg-amber-400/8 backdrop-blur-sm pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-amber-400/25 rounded-full blur-xl animate-pulse"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-amber-300/30 rounded-full blur-lg"></div>
        </div>
      )}
      
      {/* Device name with enhanced styling for iPhone */}
      <div className="w-full text-center relative z-10">
        <span className="text-xs font-medium text-white px-1 truncate block drop-shadow-sm">
          {light.alias}
        </span>
        <span className={`text-xs mt-1 block font-medium drop-shadow-sm ${isOn ? 'text-amber-300' : 'text-gray-400'}`}>
          {isOn ? 'ON' : 'OFF'}
        </span>
      </div>
      
      {/* Enhanced toggle switch with better iPhone touch feedback */}
      <div className="mt-2 relative z-10">
        <div
          className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
            isOn ? 'bg-gradient-to-r from-yellow-500 to-amber-400 shadow-lg shadow-yellow-500/30' : 'bg-gray-700 shadow-inner'
          }`}
          style={{
            // Enhanced shadows for depth
            boxShadow: isOn 
              ? '0 4px 12px rgba(245, 158, 11, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.2)' 
              : '0 2px 4px rgba(0, 0, 0, 0.4), inset 0 2px 4px rgba(0, 0, 0, 0.2)'
          }}
        >
          <div
            className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full shadow-lg transform transition-all duration-300 ${
              isOn ? 'translate-x-6' : 'translate-x-0'
            }`}
            style={{
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)'
            }}
          />
          
          {/* Enhanced glow under the switch when on */}
          {isOn && (
            <div className="absolute inset-0 rounded-full bg-yellow-400/40 blur-md -z-10 animate-pulse"></div>
          )}
        </div>
      </div>
      
      {/* Enhanced status indicator dot */}
      <div className="absolute top-2 right-2">
        <div className={`h-2 w-2 rounded-full transition-all duration-200 ${
          isOn ? 'bg-yellow-400 animate-pulse shadow-lg shadow-yellow-400/50' : 'bg-gray-600'
        }`}></div>
      </div>

      {/* Touch feedback overlay */}
      {isPressed && (
        <div className="absolute inset-0 bg-white/10 rounded-xl pointer-events-none transition-opacity duration-150"></div>
      )}
    </div>
  );
};

export default LightSwitch;
