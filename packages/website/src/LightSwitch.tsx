import React from "react";

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
  
  return (
    <div
      className={`flex flex-col items-center justify-between px-2 py-3 rounded-xl transition-all cursor-pointer w-full backdrop-blur-sm ${
        isOn ? 'ring-2 ring-yellow-500/20 shadow-lg shadow-yellow-500/10' : 'ring-1 ring-gray-700/30 shadow-md'
      }`}
      style={{
        minHeight: "110px",
        background: `linear-gradient(to bottom, ${
          isOn 
            ? 'rgba(45, 40, 15, 0.8), rgba(35, 30, 10, 0.9)' 
            : 'rgba(25, 25, 25, 0.8), rgba(18, 18, 18, 0.9)'
        }), ${iconPath ? `url(${iconPath})` : 'none'} center center / cover no-repeat`,
        transform: isOn ? 'scale(1.02)' : 'scale(1)',
      }}
      onClick={() => toggleLight(light.deviceId, !isOn)}
    >
      {/* Light glow effect when on */}
      {isOn && (
        <div className="absolute inset-0 rounded-xl bg-yellow-400/5 backdrop-blur-sm pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-yellow-400/20 rounded-full blur-xl"></div>
        </div>
      )}
      
      {/* Device name with improved styling */}
      <div className="w-full text-center relative z-10">
        <span className="text-xs font-medium text-white px-1 truncate block">
          {light.alias}
        </span>
        <span className={`text-xs mt-1 block ${isOn ? 'text-yellow-300' : 'text-gray-400'}`}>
          {isOn ? 'ON' : 'OFF'}
        </span>
      </div>
      
      {/* Enhanced toggle switch */}
      <div className="mt-2 relative z-10">
        <div
          className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${
            isOn ? 'bg-gradient-to-r from-yellow-500 to-amber-400' : 'bg-gray-700'
          }`}
        >
          <div
            className={`absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
              isOn ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
          
          {/* Subtle glow under the switch when on */}
          {isOn && (
            <div className="absolute inset-0 rounded-full bg-yellow-400/30 blur-sm -z-10"></div>
          )}
        </div>
      </div>
      
      {/* Status indicator dot */}
      <div className="absolute top-2 right-2">
        <div className={`h-1.5 w-1.5 rounded-full ${
          isOn ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'
        }`}></div>
      </div>
    </div>
  );
};

export default LightSwitch;
