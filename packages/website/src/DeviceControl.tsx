import React, { useState, useEffect, memo, useMemo, useCallback } from "react";
import LightSwitch from "./LightSwitch";
import LGAppliances from "./LGAppliances";
import GarageDoor from "./GarageDoor";
import BhyveIrrigation from "./BhyveIrrigation";
import { 
  UilCircle, 
  UilLightbulb,
  UilBolt,
  UilSnowflake,
  UilFire,
  UilHome,
  UilTrees
} from "@iconscout/react-unicons";

const deviceIcons: Record<string, string> = {
  "Coffee machine": "/device_icons/coffee.png",
  "Bedroom": "/device_icons/bedroom_light.png",
  "Lamp": "/device_icons/bed_lamp.png",
  "Baby room noise": "/device_icons/baby_room_noise.png",
  "Outdoor potlights": "/device_icons/outdoor_potlight.png",
  "Outdoor Lamps": "/device_icons/outdoor_lamp.png",
  "Hue outdoor bollard 1": "/device_icons/bollard.png",
  "Hue outdoor bollard 2": "/device_icons/bollard.png",
  "Shower air vent": "/device_icons/shower_air_vent.png",
  "Shower light": "/device_icons/shower_light.png",
  "Garage": "/device_icons/garage.png",
  "Office": "/device_icons/light_bar.png",
  "Office 2": "/device_icons/light_bar.png",
  "Office 3": "/device_icons/light_bar.png",
  "Office 4": "/device_icons/light_bar.png",
  "Office 5": "/device_icons/light_bar.png",
  "Office 6": "/device_icons/light_bar.png",
  "Mariah closet": "/device_icons/girl_closet.png",
  "Mariah closet 2": "/device_icons/girl_closet.png",
  "Luka room lamp": "/device_icons/luka_room_lamp.png",
  "TV": "/device_icons/tv.png",
  // Note: Xmas Tree removed since it's typically unplugged and filtered out
};

type LightDevice = {
  alias: string;
  deviceId: string;
  relay_state: number; // 0 for Off, 1 for On
  provider: "tplink" | "hue";
};

// Room icons mapping with emojis for better mobile display
const getRoomIcon = (groupName: string) => {
  const iconMap: Record<string, string> = {
    Kitchen: "☕",
    Bedroom: "🛏️", 
    LivingRoom: "📺",
    Outdoor: "🌳",
    Bathroom: "🚿",
    Garage: "🚗",
    Office: "💡",
    Closet: "👗",
    LukaRoom: "🧸",
  };
  
  return iconMap[groupName] || "💡";
};

// Time-based priority device groups for highlighting essential devices
const getTimeBasedPriorityDevices = () => {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 11) {
    // Morning: Coffee machine, bathroom, bedroom
    return {
      essential: ["Coffee machine", "Shower light", "Bedroom", "Shower air vent"],
      suggested: ["Bathroom", "Kitchen"]
    };
  } else if (hour >= 11 && hour < 17) {
    // Afternoon: Kitchen, TV, LG appliances (lights less relevant when not dark)
    return {
      essential: ["Coffee machine", "TV"],
      suggested: ["Kitchen", "LivingRoom"]
    };
  } else if (hour >= 17 && hour < 22) {
    // Evening: Outdoor lights, kitchen, bedroom, TV
    return {
      essential: ["Outdoor potlights", "Outdoor Lamps", "Coffee machine", "Bedroom", "TV"],
      suggested: ["Outdoor", "Kitchen", "Bedroom", "LivingRoom"]
    };
  } else {
    // Night: Bedroom, bathroom, outdoor security
    return {
      essential: ["Bedroom", "Lamp", "Outdoor potlights", "Outdoor Lamps"],
      suggested: ["Bedroom", "Bathroom", "Outdoor"]
    };
  }
};

const groupedLights: Record<string, string[]> = {
  Kitchen: ["Coffee machine"],
  Bedroom: ["Bedroom", "Lamp", "Baby room noise"],
  LivingRoom: ["TV"], // Xmas Tree removed since it's typically unplugged
  Outdoor: [
    "Outdoor potlights",
    "Outdoor Lamps", 
    "Hue outdoor bollard 1",
    "Hue outdoor bollard 2",
  ],
  Bathroom: ["Shower air vent", "Shower light"],
  Garage: ["Garage"],
  Office: ["Office", "Office 2", "Office 3", "Office 4", "Office 5", "Office 6"],
  Closet: ["Mariah closet", "Mariah closet 2"],
  LukaRoom: ["Luka room lamp"],
};

// Time-based priority system for room ordering
const getTimeBasedRoomOrder = () => {
  const hour = new Date().getHours();
  
  // Morning (6 AM - 11 AM): Prioritize Kitchen, Bathroom, Bedroom
  if (hour >= 6 && hour < 11) {
    return ["Kitchen", "Bathroom", "Bedroom", "LivingRoom", "Office", "Outdoor", "Garage", "Closet", "LukaRoom"];
  }
  // Afternoon/Work hours (11 AM - 5 PM): Prioritize Kitchen, Living Room, Bathroom (lights less relevant when not dark)
  else if (hour >= 11 && hour < 17) {
    return ["Kitchen", "LivingRoom", "Bathroom", "Bedroom", "Outdoor", "Office", "Garage", "Closet", "LukaRoom"];
  }
  // Evening (5 PM - 10 PM): Prioritize Kitchen, Living Room, Outdoor, Bedroom
  else if (hour >= 17 && hour < 22) {
    return ["Kitchen", "LivingRoom", "Outdoor", "Bedroom", "Bathroom", "Office", "Garage", "Closet", "LukaRoom"];
  }
  // Night (10 PM - 6 AM): Prioritize Bedroom, Bathroom, Kitchen
  else {
    return ["Bedroom", "Bathroom", "Kitchen", "LivingRoom", "Outdoor", "Office", "Garage", "Closet", "LukaRoom"];
  }
};

// Get time-based contextual message
const getTimeBasedPrompt = () => {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 11) {
    return "☀️ Good morning! Start your day with coffee and lights.";
  } else if (hour >= 11 && hour < 17) {
    return "🏠 Afternoon focus. Manage appliances and essential devices.";
  } else if (hour >= 17 && hour < 22) {
    return "🌅 Evening time. Set the mood with outdoor and ambient lights.";
  } else {
    return "🌙 Good night. Manage bedroom and security lighting.";
  }
};

// Check if garage door should be at top (daytime) or bottom (nighttime)
const shouldGarageDoorBeFirst = () => {
  const hour = new Date().getHours();
  return hour >= 6 && hour <= 22; // Show at top 6 AM to 10 PM, bottom otherwise
};

// Check if LG appliances should be prioritized (when lights are less relevant)
const shouldLGAppliancesBePrioritized = () => {
  const hour = new Date().getHours();
  // During afternoon (11 AM - 5 PM) when it's likely not dark outside,
  // LG appliances like washing machines are more contextually relevant than lights
  return hour >= 11 && hour < 17;
};

// OPTIMIZATION: Memoized individual light switch component to prevent unnecessary re-renders
const MemoizedLightSwitch = memo(({ 
  light, 
  toggleLight,
  iconPath 
}: { 
  light: LightDevice; 
  toggleLight: (deviceId: string, newState: boolean) => void;
  iconPath?: string;
}) => {
  return (
    <LightSwitch
      light={light}
      toggleLight={toggleLight}
      iconPath={iconPath}
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison to only re-render if device state actually changed
  return (
    prevProps.light.relay_state === nextProps.light.relay_state &&
    prevProps.light.deviceId === nextProps.light.deviceId &&
    prevProps.iconPath === nextProps.iconPath
  );
});

const DeviceControl: React.FC = () => {
  const [lights, setLights] = useState<LightDevice[]>([]);
  const [lightsError, setLightsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  
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
  
  // Enhanced mobile detection with iPhone-specific optimizations
  useEffect(() => {
    const checkMobile = () => {
      const width = window.innerWidth;
      setIsMobile(width < 640);
      
      // Enhanced iOS-specific optimizations
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        // Force hardware acceleration for smooth scrolling
        document.documentElement.style.setProperty('-webkit-overflow-scrolling', 'touch');
        
        // Optimize viewport height for iOS Safari
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        // Add touch-friendly CSS classes
        document.body.classList.add('ios-optimized');
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', () => {
      setTimeout(checkMobile, 100); // Delay for proper viewport calculation
    });
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, []);
  
  // Check if garage door should be positioned first (daytime) or last (nighttime)
  const garageDoorFirst = shouldGarageDoorBeFirst();
  
  // Check if LG appliances should be prioritized
  const lgAppliancesPrioritized = shouldLGAppliancesBePrioritized();
  
  // Get time-based priorities and room order
  const timeBasedPriorities = getTimeBasedPriorityDevices();
  const roomOrder = getTimeBasedRoomOrder();
  const timePrompt = getTimeBasedPrompt();

  // Helper function to check if device is essential (time-aware)
  const isEssentialDevice = (alias: string) => {
    return timeBasedPriorities.essential.includes(alias);
  };

  // Helper function to check if room is suggested for current time
  const isSuggestedRoom = (roomName: string) => {
    return timeBasedPriorities.suggested.includes(roomName);
  };

  // Function to render a room card with enhanced iPhone touch interactions
  const renderRoomCard = (room: { name: string; lights: LightDevice[]; deviceCount: number; activeCount: number; hasEssentialDevices: boolean; isSuggested: boolean; inactiveCount: number }) => {
    return (
      <div
        className={`relative p-2.5 sm:p-4 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden border transition-all duration-300 hover:border-gray-600/50 touch-manipulation transform hover:scale-[1.01] active:scale-[0.99] ${
          room.hasEssentialDevices ? 'border-yellow-600/50 shadow-yellow-900/20' : room.isSuggested ? 'border-blue-600/50 shadow-blue-900/20' : 'border-gray-700/50'
        }`}
        style={{
          // Enhanced hardware acceleration for iPhone
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          willChange: "transform, box-shadow"
        }}
      >
        {/* Priority indicator for essential devices */}
        {room.hasEssentialDevices && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-400 rounded-full animate-pulse shadow-lg shadow-yellow-400/50"></div>
        )}
        
        {/* Suggested room indicator */}
        {room.isSuggested && !room.hasEssentialDevices && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-lg shadow-blue-400/50"></div>
        )}
        
        {/* Enhanced glass effect overlay */}
        <div className="absolute top-0 left-0 right-0 h-10 sm:h-12 bg-gradient-to-b from-white/5 to-transparent pointer-events-none rounded-t-xl"></div>
        
        {/* Room Title with emoji icons - Enhanced for iPhone */}
        <div className="flex justify-between items-center mb-2.5 sm:mb-4">
          <div className="text-gray-200 font-medium flex items-center space-x-2">
            <span className="text-base sm:text-lg filter drop-shadow-sm">{getRoomIcon(room.name)}</span>
            <span className="text-xs sm:text-base truncate font-medium">{room.name}</span>
            {room.isSuggested && (
              <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded-full border border-blue-700/30 hidden sm:inline backdrop-blur-sm">
                Suggested
              </span>
            )}
          </div>
          <div className="flex space-x-1 sm:space-x-2 text-xs">
            <div className="text-gray-400 bg-gray-800/60 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-gray-700/30 backdrop-blur-sm shadow-sm">
              {room.deviceCount}
            </div>
            {room.activeCount > 0 && (
              <div className="text-yellow-300 bg-yellow-900/30 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-yellow-700/30 flex items-center space-x-1 backdrop-blur-sm shadow-sm">
                <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse shadow-sm"></div>
                <span>{room.activeCount}</span>
              </div>
            )}
            {room.inactiveCount > 0 && (
              <div className="text-gray-500 bg-gray-800/40 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-gray-600/30 backdrop-blur-sm shadow-sm">
                <span className="hidden sm:inline">{room.inactiveCount} off</span>
                <span className="sm:hidden">{room.inactiveCount}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Enhanced Light Controls Grid - Optimized for iPhone touch targets */}
        <div
          className="grid gap-1.5 sm:gap-3"
          style={{
            gridTemplateColumns: isMobile ? "repeat(auto-fill, minmax(75px, 1fr))" : "repeat(auto-fill, minmax(80px, 1fr))",
          }}
        >
          {/* Render inactive devices first for better visibility */}
          {room.lights
            .filter(light => light.relay_state === 0)
            .map((light) => (
              <div 
                key={light.deviceId}
                className="touch-manipulation"
                onClick={() => triggerHaptic('light')}
              >
                <LightSwitch
                  light={light}
                  toggleLight={toggleLight}
                  iconPath={deviceIcons[light.alias]}
                />
              </div>
            ))}
          {/* Then render active devices */}
          {room.lights
            .filter(light => light.relay_state === 1)
            .map((light) => (
              <div 
                key={light.deviceId}
                className="touch-manipulation"
                onClick={() => triggerHaptic('light')}
              >
                <LightSwitch
                  light={light}
                  toggleLight={toggleLight}
                  iconPath={deviceIcons[light.alias]}
                />
              </div>
            ))}
        </div>
      </div>
    );
  };

  async function fetchLights() {
    setIsLoading(true);
    try {
      const tplinkResponse = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/tplink/lights/list"
      );

      if (tplinkResponse.status === 401) {
        window.location.href =
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/auth/initiate";
        return;
      }

      const tplinkData = await tplinkResponse.json();

      const hueResponse = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/hue/lights/list"
      );

      if (hueResponse.status === 401) {
        window.location.href =
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/auth/initiate";
        return;
      }

      const hueData = await hueResponse.json();

      const combinedLights = [
        ...(Array.isArray(tplinkData) ? tplinkData : [])
          .filter((light) => light.status === 1 && !light.error) // Only include online devices without errors
          .map((light) => ({
            ...light,
            provider: "tplink",
          })),
        ...Object.keys(hueData).map((lightId) => ({
          alias: hueData[lightId].name,
          deviceId: lightId,
          relay_state: hueData[lightId].state.on ? 1 : 0,
          provider: "hue",
        })),
      ];

      setLights(combinedLights);
      setLightsError(null);
    } catch (error) {
      console.error("Error fetching lights:", error);
      setLights([]);
      setLightsError("Failed to load lights. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchLights();
  }, []);

  // OPTIMIZATION: Memoized light grouping for better performance
  const getLightsByGroup = useCallback((groupName: string): LightDevice[] => {
    if (!groupedLights[groupName]) return [];
    return groupedLights[groupName]
      .map(alias => lights.find(light => light.alias === alias))
      .filter((light): light is LightDevice => light !== undefined);
  }, [lights]);

  // OPTIMIZATION: Enhanced toggle function with haptic feedback
  const toggleLight = useCallback(async (deviceId: string, newState: boolean) => {
    try {
      // Trigger haptic feedback immediately for responsive feel
      triggerHaptic('light');
      
      const device = lights.find(l => l.deviceId === deviceId);
      if (!device) return;

      const response = await fetch(
        `https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/${device.provider}/lights/trigger`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId: deviceId,
              state: newState,
            },
          }),
        }
      );

      if (response.ok) {
        // Optimistically update UI
        setLights(prevLights =>
          prevLights.map(light =>
            light.deviceId === deviceId
              ? { ...light, relay_state: newState ? 1 : 0 }
              : light
          )
        );
        
        // Success haptic feedback
        setTimeout(() => triggerHaptic('light'), 100);
      } else {
        // Error haptic feedback
        triggerHaptic('heavy');
      }
    } catch (error) {
      console.error("Failed to toggle light:", error);
      // Error haptic feedback
      triggerHaptic('heavy');
    }
  }, [lights]);

  // OPTIMIZATION: Memoized active light count
  const activeLightCount = useMemo(() => 
    lights.filter(light => light.relay_state === 1).length,
    [lights]
  );
  
  // Count active lights
  const activeLightCountDeprecated = lights.filter(light => light.relay_state === 1).length;

  if (lightsError) {
    return (
      <div className="p-6 mx-4 bg-gradient-to-br from-red-900/40 to-red-950/40 text-white rounded-xl border border-red-800/50 backdrop-blur-sm shadow-xl mt-2">
        <div className="flex items-center justify-center space-x-3">
          <UilBolt className="h-7 w-7 text-red-400" />
          <span className="text-red-100">{lightsError}</span>
        </div>
        <div className="mt-4 flex justify-center">
          <button 
            onClick={() => fetchLights()}
            className="px-4 py-2 bg-red-800/60 hover:bg-red-700/70 text-white rounded-full text-sm flex items-center space-x-2 border border-red-700/50 transition-all
                      min-h-[48px] touch-manipulation transform tap-highlight-transparent active:scale-95"
            style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
          >
            <span>Retry</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-8 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black border border-gray-800/40 rounded-xl mx-4 mt-2 h-96">
        <div className="animate-pulse flex flex-col items-center justify-center h-full">
          <div className="relative mb-6">
            <UilLightbulb size={56} className="text-gray-600" />
            <div className="absolute inset-0 bg-yellow-400 blur-xl opacity-10 rounded-full animate-ping-slow"></div>
          </div>
          <p className="text-gray-300 font-medium text-lg mb-2">Loading smart devices</p>
          <p className="text-gray-500 text-sm mb-6">Please wait while we connect to your home</p>
          <div className="w-56 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 animate-gradient-x" 
              style={{width: '60%'}}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Enhanced header with better iPhone touch targets */}
      <div className="mx-2 sm:mx-4 mb-3 mt-2 flex items-center justify-between bg-gray-900/90 backdrop-blur-md rounded-xl p-3 border border-gray-800/40 shadow-lg touch-manipulation">
        <div className="flex items-center space-x-3">
          <span className="text-xl filter drop-shadow-sm">🏠</span>
          <div>
            <h2 className="text-gray-200 font-medium text-sm sm:text-base">Smart Devices</h2>
            <p className="text-xs text-gray-400 hidden sm:block">Tap to control your home</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <div className="text-gray-400 bg-gray-800/70 px-2.5 py-1.5 rounded-full border border-gray-700/30 backdrop-blur-sm shadow-sm">
            <span className="hidden sm:inline">Total: </span>{lights.length}
          </div>
          <div className="text-yellow-400 bg-yellow-900/80 px-2.5 py-1.5 rounded-full border border-yellow-700/30 flex items-center space-x-1.5 backdrop-blur-sm shadow-sm">
            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse shadow-sm"></div>
            <span className="font-medium">{activeLightCount}</span>
          </div>
        </div>
      </div>

      {/* Enhanced time-based contextual prompt with better mobile layout */}
      <div className="mx-2 sm:mx-4 mb-3 p-2.5 sm:p-3 bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-xl border border-blue-800/40 shadow-lg backdrop-blur-sm">
        <p className="text-blue-200 text-xs sm:text-sm text-center leading-relaxed font-medium">{timePrompt}</p>
      </div>
      
      {/* Enhanced DEVICE CONTROLS with better iPhone optimizations */}
      <div 
        className="grid gap-2.5 sm:gap-4 px-2 sm:px-4 pb-3" 
        style={{
          gridTemplateColumns: isMobile ? 'repeat(auto-fit, minmax(160px, 1fr))' : 'repeat(auto-fit, minmax(200px, 1fr))'
        }}
      >
        {/* Garage Door - Show at top during daytime (6 AM to 10 PM) */}
        {garageDoorFirst && (
          <div className="col-span-full">
            <div 
              className="touch-manipulation"
              onClick={() => triggerHaptic('medium')}
            >
              <GarageDoor />
            </div>
          </div>
        )}
        

        
        {/* LG ThinQ Appliances Component - Prioritized during afternoon */}
        {lgAppliancesPrioritized && (
          <div className="col-span-full">
            <div 
              className="touch-manipulation"
              onClick={() => triggerHaptic('light')}
            >
              <LGAppliances />
            </div>
          </div>
        )}
        
        {(() => {
          const roomsWithData = roomOrder.map((groupName) => {
            const groupLights = getLightsByGroup(groupName);
            if (groupLights.length === 0) return null;
            
            return renderRoomCard({
              name: groupName,
              lights: groupLights,
              deviceCount: groupLights.length,
              activeCount: groupLights.filter(l => l.relay_state === 1).length,
              hasEssentialDevices: groupLights.some(l => isEssentialDevice(l.alias)),
              isSuggested: isSuggestedRoom(groupName),
              inactiveCount: groupLights.filter(l => l.relay_state === 0).length
            });
          }).filter(Boolean);

          return roomsWithData;
        })()}

        {/* Bhyve Irrigation - Always shown after room cards but before non-prioritized LG appliances */}
        <div className="col-span-full">
          <div 
            className="touch-manipulation"
            onClick={() => triggerHaptic('light')}
          >
            <BhyveIrrigation />
          </div>
        </div>

        {/* LG ThinQ Appliances - Show at bottom if not prioritized */}
        {!lgAppliancesPrioritized && (
          <div className="col-span-full">
            <div 
              className="touch-manipulation"
              onClick={() => triggerHaptic('light')}
            >
              <LGAppliances />
            </div>
          </div>
        )}

        {/* Garage Door - Show at bottom during nighttime */}
        {!garageDoorFirst && (
          <div className="col-span-full">
            <div 
              className="touch-manipulation"
              onClick={() => triggerHaptic('medium')}
            >
              <GarageDoor />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceControl;