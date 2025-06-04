import React, { useState, useEffect } from "react";
import LightSwitch from "./LightSwitch";
import LGAppliances from "./LGAppliances";
import GarageDoor from "./GarageDoor";
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
  "Luka room lamp": "/device_icons/luka_room_lamp.png",
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
    Outdoor: "🌳",
    Bathroom: "🚿",
    Garage: "🚗",
    Office: "💡",
    Closet: "👗",
    LukaRoom: "🧸",
  };
  
  return iconMap[groupName] || "💡";
};

// Priority device groups for highlighting essential devices
const priorityDevices = {
  essential: ["Coffee machine", "Bedroom", "Outdoor potlights", "Outdoor Lamps"],
};

const groupedLights: Record<string, string[]> = {
  Kitchen: ["Coffee machine"],
  Bedroom: ["Bedroom", "Lamp", "Baby room noise"],
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

// Fixed room order - no time-based logic
const roomOrder = ["Kitchen", "Bedroom", "Outdoor", "Bathroom", "Garage", "Office", "Closet", "LukaRoom"];

// Check if garage door should be at top (daytime) or bottom (nighttime)
const shouldGarageDoorBeFirst = () => {
  const hour = new Date().getHours();
  return hour >= 6 && hour <= 22; // Show at top 6 AM to 10 PM, bottom otherwise
};

const DeviceControl: React.FC = () => {
  const [lights, setLights] = useState<LightDevice[]>([]);
  const [lightsError, setLightsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Check if garage door should be positioned first (daytime) or last (nighttime)
  const garageDoorFirst = shouldGarageDoorBeFirst();

  // Helper function to check if device is essential
  const isEssentialDevice = (alias: string) => {
    return priorityDevices.essential.includes(alias);
  };

  // Function to render a room card
  const renderRoomCard = (room: { name: string; lights: LightDevice[]; deviceCount: number; activeCount: number; hasEssentialDevices: boolean }) => {
    return (
      <div
        className={`relative p-3 sm:p-4 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl overflow-hidden border transition-all duration-200 hover:border-gray-600/50 ${
          room.hasEssentialDevices ? 'border-yellow-600/50' : 'border-gray-700/50'
        }`}
      >
        {/* Priority indicator for essential devices */}
        {room.hasEssentialDevices && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
        )}
        
        {/* Glass effect overlay */}
        <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
        
        {/* Room Title with emoji icons */}
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <div className="text-gray-200 font-medium flex items-center space-x-2">
            <span className="text-lg">{getRoomIcon(room.name)}</span>
            <span className="text-sm sm:text-base">{room.name}</span>
          </div>
          <div className="flex space-x-1 sm:space-x-2">
            <div className="text-xs text-gray-400 bg-gray-800/60 px-2 py-1 rounded-full border border-gray-700/30">
              {room.deviceCount}
            </div>
            {room.activeCount > 0 && (
              <div className="text-xs text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded-full border border-yellow-700/30 flex items-center space-x-1">
                <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse"></div>
                <span>{room.activeCount}</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Light Controls - Optimized mobile grid */}
        <div
          className="grid gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))",
          }}
        >
          {room.lights.map((light) => (
            <LightSwitch
              key={light.deviceId}
              light={light}
              toggleLight={toggleLight}
              iconPath={deviceIcons[light.alias]}
            />
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
        ...(Array.isArray(tplinkData) ? tplinkData : []).map((light) => ({
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

  const getLightsByGroup = (groupName: string): LightDevice[] => {
    const aliases = groupedLights[groupName];
    return lights.filter((light) => aliases.includes(light.alias));
  };

  const toggleLight = async (deviceId: string, newState: boolean) => {
    const light = lights.find((l) => l.deviceId === deviceId);

    if (!light) return;

    const providerUrl =
      light.provider === "tplink"
        ? "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/tplink/lights/trigger"
        : "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/hue/lights/trigger";

    const payload = {
      command: "trigger_light",
      data: {
        deviceId: light.deviceId,
        state: newState,
      },
    };

    try {
      const response = await fetch(providerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        window.location.href =
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/auth/initiate";
        return;
      }

      if (response.ok) {
        setLights((prevLights) =>
          prevLights.map((light) =>
            light.deviceId === deviceId
              ? { ...light, relay_state: newState ? 1 : 0 }
              : light
          )
        );
      } else {
        console.error("Failed to toggle light");
        alert("Failed to toggle the light. Please try again.");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Error toggling light:", errorMessage);
      alert("Failed to toggle the light. Please try again.");
    }
  };
  
  // Count active lights
  const activeLightCount = lights.filter(light => light.relay_state === 1).length;

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
            className="px-4 py-2 bg-red-800/60 hover:bg-red-700/70 text-white rounded-full text-sm flex items-center space-x-2 border border-red-700/50 transition-all"
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
      {/* Compact header - mobile optimized */}
      <div className="mx-2 sm:mx-4 mb-3 mt-2 flex items-center justify-between bg-gray-900 rounded-xl p-3 border border-gray-800/40 shadow-lg">
        <div className="flex items-center space-x-3">
          <span className="text-xl">🏠</span>
          <h2 className="text-gray-200 font-medium text-sm sm:text-base">Devices</h2>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <div className="text-gray-400 bg-gray-800 px-2 py-1 rounded-full border border-gray-700/30">
            {lights.length}
          </div>
          <div className="text-yellow-400 bg-yellow-900/80 px-2 py-1 rounded-full border border-yellow-700/30 flex items-center space-x-1">
            <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse"></div>
            <span>{activeLightCount}</span>
          </div>
        </div>
      </div>
      
      {/* DEVICE CONTROLS - Flexible layout based on content size */}
      <div className="grid gap-3 sm:gap-4 px-2 sm:px-4 pb-3" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
        {/* Garage Door - Show at top during daytime (6 AM to 10 PM) */}
        {garageDoorFirst && (
          <div className="col-span-full">
            <GarageDoor />
          </div>
        )}
        
        {roomOrder.map((groupName) => {
          const groupLights = getLightsByGroup(groupName);
          if (groupLights.length === 0) return null;
          
          const activeCount = groupLights.filter(light => light.relay_state === 1).length;
          const hasEssentialDevices = groupLights.some(light => isEssentialDevice(light.alias));
          
          const room = {
            name: groupName,
            lights: groupLights,
            deviceCount: groupLights.length,
            activeCount,
            hasEssentialDevices
          };
          
          // Rooms with many devices get full width
          if (groupLights.length >= 4) {
            return (
              <div key={groupName} className="col-span-full">
                {renderRoomCard(room)}
              </div>
            );
          }
          
          // Small rooms use auto-fit layout
          return (
            <div key={groupName}>
              {renderRoomCard(room)}
            </div>
          );
        })}
        
        {/* Garage Door - Show at bottom during nighttime (10 PM to 6 AM) */}
        {!garageDoorFirst && (
          <div className="col-span-full">
            <GarageDoor />
          </div>
        )}
      </div>
    
      {/* LG ThinQ Appliances Component - Mobile optimized */}
      <div className="px-2 sm:px-4 pb-4">
        <LGAppliances />
      </div>
    </div>
  );
};

export default DeviceControl;
