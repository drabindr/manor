import React, { useState, useEffect } from "react";
import LightSwitch from "./LightSwitch";
import LGAppliances from "./LGAppliances";
import GarageDoor from "./GarageDoor";
import { UilLightbulb, UilBolt } from "@iconscout/react-unicons";

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

// Simple room grouping without complex time-based logic
const groupedLights: Record<string, string[]> = {
  Kitchen: ["Coffee machine"],
  Bedroom: ["Bedroom", "Lamp"],
  Outdoor: ["Outdoor potlights", "Outdoor Lamps", "Hue outdoor bollard 1", "Hue outdoor bollard 2"],
  Bathroom: ["Shower air vent", "Shower light"],
  Garage: ["Garage"],
  Office: ["Office", "Office 2", "Office 3", "Office 4", "Office 5", "Office 6"],
  Closet: ["Mariah closet"],
  LukaRoom: ["Luka room lamp"],
};

const DeviceControl: React.FC = () => {
  const [lights, setLights] = useState<LightDevice[]>([]);
  const [lightsError, setLightsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const toggleLight = async (deviceId: string, newState: boolean) => {
    try {
      const device = lights.find(l => l.deviceId === deviceId);
      if (!device) return;

      const response = await fetch(
        `https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lights/${device.provider}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: deviceId,
            action: newState ? "turn_on" : "turn_off",
          }),
        }
      );

      if (response.ok) {
        // Update UI optimistically
        setLights(prevLights =>
          prevLights.map(light =>
            light.deviceId === deviceId
              ? { ...light, relay_state: newState ? 1 : 0 }
              : light
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle light:", error);
    }
  };

  const fetchLights = async () => {
    setIsLoading(true);
    setLightsError(null);
    try {
      const [tplinkResponse, hueResponse] = await Promise.all([
        fetch("https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lights/tplink"),
        fetch("https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/lights/hue")
      ]);

      if (tplinkResponse.status === 401 || hueResponse.status === 401) {
        setLightsError("Authentication failed. Please check your credentials.");
        return;
      }

      const [tplinkData, hueData] = await Promise.all([
        tplinkResponse.json(),
        hueResponse.json()
      ]);

      const allLights = [
        ...tplinkData.map((light: any) => ({ ...light, provider: "tplink" as const })),
        ...hueData.map((light: any) => ({ ...light, provider: "hue" as const }))
      ];

      setLights(allLights);
    } catch (error) {
      console.error("Error fetching lights:", error);
      setLightsError("Failed to connect to smart home devices. Please check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLights();
  }, []);

  const getLightsByGroup = (groupName: string): LightDevice[] => {
    if (!groupedLights[groupName]) return [];
    return groupedLights[groupName]
      .map(alias => lights.find(light => light.alias === alias))
      .filter((light): light is LightDevice => light !== undefined);
  };

  const renderRoomCard = (groupName: string) => {
    const groupLights = getLightsByGroup(groupName);
    if (groupLights.length === 0) return null;

    const activeCount = groupLights.filter(l => l.relay_state === 1).length;

    return (
      <div
        key={groupName}
        className="p-3 bg-gradient-to-b from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-xl shadow-xl border border-gray-700/50"
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-gray-200 font-medium text-sm">{groupName}</h3>
          <div className="flex space-x-2 text-xs">
            <div className="text-gray-400 bg-gray-800/60 px-2 py-1 rounded-full">
              {groupLights.length}
            </div>
            {activeCount > 0 && (
              <div className="text-yellow-300 bg-yellow-900/30 px-2 py-1 rounded-full">
                {activeCount}
              </div>
            )}
          </div>
        </div>
        
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
          {groupLights.map((light) => (
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

  if (lightsError) {
    return (
      <div className="p-6 mx-4 bg-gradient-to-br from-red-900/40 to-red-950/40 text-white rounded-xl border border-red-800/50 backdrop-blur-sm shadow-xl mt-2">
        <div className="flex items-center justify-center space-x-3">
          <UilBolt className="h-7 w-7 text-red-400" />
          <span className="text-red-100">{lightsError}</span>
        </div>
        <div className="mt-4 flex justify-center">
          <button 
            onClick={fetchLights}
            className="px-4 py-2 bg-red-800/60 hover:bg-red-700/70 text-white rounded-full text-sm flex items-center space-x-2 border border-red-700/50 transition-all"
          >
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full p-8 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black border border-gray-800/40 rounded-xl mx-4 mt-2 h-96">
        <div className="animate-pulse flex flex-col items-center justify-center h-full">
          <UilLightbulb size={56} className="text-gray-600 mb-4" />
          <p className="text-gray-300 font-medium text-lg mb-2">Loading smart devices</p>
          <p className="text-gray-500 text-sm">Please wait while we connect to your home</p>
        </div>
      </div>
    );
  }

  const activeLightCount = lights.filter(light => light.relay_state === 1).length;

  return (
    <div className="w-full h-full flex flex-col">
      {/* Simple header */}
      <div className="mx-4 mb-4 mt-2 flex items-center justify-between bg-gray-900 rounded-xl p-3 border border-gray-800/40 shadow-lg">
        <div className="flex items-center space-x-3">
          <span className="text-xl">🏠</span>
          <h2 className="text-gray-200 font-medium text-base">Devices</h2>
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
      
      {/* Device controls */}
      <div className="grid gap-3 px-4 pb-3" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
        {/* Garage Door */}
        <div className="col-span-full">
          <GarageDoor />
        </div>
        
        {/* LG Appliances */}
        <div className="col-span-full">
          <LGAppliances />
        </div>
        
        {/* Light rooms */}
        {Object.keys(groupedLights).map(groupName => renderRoomCard(groupName))}
      </div>
    </div>
  );
};

export default DeviceControl;