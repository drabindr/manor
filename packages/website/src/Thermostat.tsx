import React, { useState, useEffect, useMemo } from "react";
import OptimizedImage from "./components/OptimizedImage";
import {
  UilMinusCircle,
  UilPlusCircle,
  UilFire,
  UilCircle,
  UilSnowflake,
  UilTrees,
  UilWind,
  UilRaindrops,
} from "@iconscout/react-unicons";
import { GiRadiations, GiDustCloud, GiMolecule, GiChemicalDrop } from "react-icons/gi";
import { WiHumidity, WiThermometer, WiBarometer } from "react-icons/wi";

interface ThermostatProps {
  onLoaded?: () => void;
}

/**
 * Data structures for thermostat and Airthings data
 */
type ThermostatData = {
  currentTemperature: number;
  humidity: number;
  mode: string;
  ecoMode: string;
  setpoint: number | null;
  heatCelsius: number | null;
  coolCelsius: number | null;
  hvacStatus: string;
  fanStatus: string;
};

type AirthingsData = {
  radon: { value: number; unit: string; assessment: string };
  pm2_5: { value: number; unit: string; assessment: string };
  co2: { value: number; unit: string; assessment: string };
  voc: { value: number; unit: string; assessment: string };
  humidity: { value: number; unit: string; assessment: string };
  pm1: { value: number; unit: string; assessment: string };
  temperature: { value: number; unit: string; assessment: string };
  pressure: { value: number; unit: string; assessment: string };
};

/**
 * More accurate assessment functions for each metric type
 */
const assessAirQuality = {
  // Radon: WHO recommends below 100 Bq/m³, concern starts at 200+
  radon: (value: number): string => {
    if (value < 100) return "good";
    if (value < 200) return "fair";
    return "poor";
  },
  
  // CO2: Below 800ppm is good, 800-1000 is fair, above 1000 is poor
  co2: (value: number): string => {
    if (value < 800) return "good";
    if (value < 1000) return "fair";
    return "poor";
  },
  
  // VOC: Below 250ppb is good, 250-2000 is fair, above 2000 is poor
  voc: (value: number): string => {
    if (value < 250) return "good";
    if (value < 2000) return "fair";
    return "poor";
  },
  
  // Humidity: 30-60% is ideal, below 30% is too dry, above 60% is too humid
  humidity: (value: number): string => {
    if (value >= 30 && value <= 60) return "good";
    if (value < 30 || value <= 65) return "fair"; // Slightly outside ideal range
    return "poor"; // Very dry or very humid
  },
  
  // Temperature: 18-24°C is comfortable, 16-18 or 24-26 is acceptable
  temperature: (value: number): string => {
    if (value >= 18 && value <= 24) return "good";
    if (value >= 16 && value < 18 || value > 24 && value <= 26) return "fair";
    return "poor"; 
  },
  
  // PM2.5: WHO guidelines suggest below 5 μg/m³ is good, 5-10 is fair, above 10 is poor
  pm2_5: (value: number): string => {
    if (value <= 5) return "good";
    if (value <= 10) return "fair";
    return "poor";
  },
  
  // PM1: More stringent than PM2.5
  pm1: (value: number): string => {
    if (value <= 10) return "good";
    if (value <= 20) return "fair";
    return "poor";
  },
  
  // Pressure: 980-1020 hPa is typical
  pressure: (value: number): string => {
    if (value >= 990 && value <= 1010) return "good";
    if (value >= 980 && value < 990 || value > 1010 && value <= 1020) return "fair";
    return "poor";
  }
};

/**
 * Provide bar widths based on assessment
 */
function getBarWidth(assessment: string): string {
  switch (assessment) {
    case "good":
      return "80%";
    case "fair":
      return "50%";
    case "poor":
      return "20%";
    default:
      return "50%";
  }
}

function getBarColor(assessment: string): string {
  switch (assessment) {
    case "good":
      return "bg-green-500";
    case "fair":
      return "bg-yellow-500";
    case "poor":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

/**
 * Icon set for each Airthings metric
 */
const metricIcons: Record<string, JSX.Element> = {
  radon: <GiRadiations size={20} />,
  pm2_5: <GiDustCloud size={20} />,
  co2: <GiChemicalDrop size={20} />,
  voc: <GiMolecule size={20} />,
  humidity: <WiHumidity size={20} />,
  pm1: <GiDustCloud size={20} />,
  temperature: <WiThermometer size={20} />,
  pressure: <WiBarometer size={20} />,
};

const Thermostat: React.FC<ThermostatProps> = ({ onLoaded }) => {
  /**
   * State declarations
   */
  const [thermostatData, setThermostatData] = useState<ThermostatData | null>(null);
  const [localSetpoint, setLocalSetpoint] = useState<number | null>(null);
  const [localHeatSetpoint, setLocalHeatSetpoint] = useState<number | null>(null);
  const [localCoolSetpoint, setLocalCoolSetpoint] = useState<number | null>(null);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [fanDropdownOpen, setFanDropdownOpen] = useState(false);
  const [airthingsData, setAirthingsData] = useState<AirthingsData | null>(null);
  const [isTemperatureChanging, setIsTemperatureChanging] = useState(false);
  const [ecoModeActive, setEcoModeActive] = useState(false);
  
  // Enhanced UI state for dial interaction
  const [isDragging, setIsDragging] = useState(false);
  const [selectedSetpoint, setSelectedSetpoint] = useState<'heat' | 'cool' | 'single' | null>(null);
  const [hoverTemp, setHoverTemp] = useState<number | null>(null);
  const [pendingChanges, setPendingChanges] = useState(false);
  
  // Active setpoint selection for HEATCOOL mode
  const [activeSetpoint, setActiveSetpoint] = useState<'heat' | 'cool'>('heat');

  /**
   * Example Nest device ID
   */
  const deviceId =
    "enterprises/2828af4f-a7f9-4a6b-bce4-fee9a684740e/devices/AVPHwEvhsd_Yc952TWnspnWUc8nVtLNU_vmzVEZGKAHQBWYpqP3B3cOjxUp7eAI4QhY3GMXoOWsA8WoRWo7lnczqilIz9g";

  /**
   * Fetch Thermostat data from your Nest integration
   */
  const fetchThermostatData = async () => {
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/get",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
            },
          }),
        }
      );
      if (response.status === 401) {
        window.location.href =
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/auth/initiate";
        return;
      }
      const data = await response.json();
      const traits = data.traits;
      const currentTemperature =
        traits["sdm.devices.traits.Temperature"].ambientTemperatureCelsius;
      const humidity =
        traits["sdm.devices.traits.Humidity"].ambientHumidityPercent;
      const mode = traits["sdm.devices.traits.ThermostatMode"].mode;
      const ecoMode = traits["sdm.devices.traits.ThermostatEco"].mode;
      const hvacStatus = traits["sdm.devices.traits.ThermostatHvac"].status;
      const fanStatus = traits["sdm.devices.traits.Fan"]?.timerMode || "OFF";

      let setpoint = null;
      if (mode === "HEAT") {
        setpoint = traits["sdm.devices.traits.ThermostatTemperatureSetpoint"].heatCelsius;
      } else if (mode === "COOL") {
        setpoint = traits["sdm.devices.traits.ThermostatTemperatureSetpoint"].coolCelsius;
      } else if (mode === "HEATCOOL") {
        const heatSetpoint = traits["sdm.devices.traits.ThermostatTemperatureSetpoint"].heatCelsius;
        const coolSetpoint = traits["sdm.devices.traits.ThermostatTemperatureSetpoint"].coolCelsius;
        setpoint = (heatSetpoint + coolSetpoint) / 2;
      }

      setThermostatData({
        currentTemperature,
        humidity,
        mode,
        ecoMode,
        setpoint,
        heatCelsius:
          traits["sdm.devices.traits.ThermostatTemperatureSetpoint"].heatCelsius || null,
        coolCelsius:
          traits["sdm.devices.traits.ThermostatTemperatureSetpoint"].coolCelsius || null,
        hvacStatus,
        fanStatus,
      });
    } catch (error) {
      console.error("Error fetching thermostat data:", error);
      setThermostatData(null);
    }
  };

  /**
   * Fetch Airthings sensor data
   */
  const fetchAirthings = async () => {
    try {
      const endpoint = 'https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/airthings/sensor/data';
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        
        // Apply our local, more accurate assessment to each metric
        const enhancedData = {
          ...data,
          radon: {
            ...data.radon,
            assessment: assessAirQuality.radon(data.radon.value)
          },
          co2: {
            ...data.co2,
            assessment: assessAirQuality.co2(data.co2.value)
          },
          voc: {
            ...data.voc,
            assessment: assessAirQuality.voc(data.voc.value)
          },
          humidity: {
            ...data.humidity,
            assessment: assessAirQuality.humidity(data.humidity.value)
          },
          temperature: {
            ...data.temperature,
            assessment: assessAirQuality.temperature(data.temperature.value)
          },
          pm2_5: {
            ...data.pm2_5,
            assessment: assessAirQuality.pm2_5(data.pm2_5.value)
          },
          pm1: {
            ...data.pm1,
            assessment: assessAirQuality.pm1(data.pm1.value)
          },
          pressure: {
            ...data.pressure,
            assessment: assessAirQuality.pressure(data.pressure.value)
          }
        };
        
        setAirthingsData(enhancedData);
      } else {
        console.error("Failed to fetch Airthings data");
      }
    } catch (error) {
      console.error("Error fetching Airthings data:", error);
    }
  };

  /**
   * On mount, fetch data from both endpoints and then signal loaded via onLoaded callback.
   */
  useEffect(() => {
    async function fetchAll() {
      await Promise.all([fetchThermostatData(), fetchAirthings()]);
      if (onLoaded) {
        onLoaded();
      }
    }
    fetchAll();
  }, [onLoaded]);

  /**
   * Keep local setpoints in sync with fetched data
   */
  useEffect(() => {
    if (thermostatData?.setpoint !== undefined && thermostatData.setpoint !== null) {
      setLocalSetpoint(thermostatData.setpoint);
    }
    if (thermostatData?.heatCelsius !== undefined && thermostatData.heatCelsius !== null) {
      setLocalHeatSetpoint(thermostatData.heatCelsius);
    }
    if (thermostatData?.coolCelsius !== undefined && thermostatData.coolCelsius !== null) {
      setLocalCoolSetpoint(thermostatData.coolCelsius);
    }
  }, [thermostatData?.setpoint, thermostatData?.heatCelsius, thermostatData?.coolCelsius]);

  /**
   * Global mouse event handling for dial interaction
   */
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleDialMouseUp();
      }
    };

    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        // Convert to React.MouseEvent-like object for consistency
        const syntheticEvent = {
          currentTarget: document.querySelector('svg'),
          clientX: event.clientX,
          clientY: event.clientY,
          preventDefault: () => event.preventDefault(),
        } as any;
        
        if (syntheticEvent.currentTarget) {
          handleDialMouseMove(syntheticEvent);
        }
      }
    };

    if (isDragging) {
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.addEventListener('mousemove', handleGlobalMouseMove);
    }

    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDragging, selectedSetpoint, localHeatSetpoint, localCoolSetpoint, localSetpoint]);

  /**
   * Handle setpoint selection for HEATCOOL mode
   */
  const selectHeatSetpoint = () => {
    setActiveSetpoint('heat');
  };

  const selectCoolSetpoint = () => {
    setActiveSetpoint('cool');
  };

  /**
   * Arrow control functions for selected setpoint
   */
  const increaseActiveSetpoint = async () => {
    if (thermostatData?.mode === "HEATCOOL") {
      if (activeSetpoint === 'heat') {
        await adjustHeatSetpoint(0.5);
      } else {
        await adjustCoolSetpoint(0.5);
      }
    } else if (localSetpoint !== null) {
      await setThermostatTemperature(localSetpoint + 0.5);
    }
  };

  const decreaseActiveSetpoint = async () => {
    if (thermostatData?.mode === "HEATCOOL") {
      if (activeSetpoint === 'heat') {
        await adjustHeatSetpoint(-0.5);
      } else {
        await adjustCoolSetpoint(-0.5);
      }
    } else if (localSetpoint !== null) {
      await setThermostatTemperature(localSetpoint - 0.5);
    }
  };

  /**
   * Enhanced temperature setting functions with backend integration
   */
  const setThermostatTemperature = async (newSetpoint: number) => {
    console.log("Setting new setpoint to:", newSetpoint);
    setLocalSetpoint(newSetpoint);
    setPendingChanges(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              mode: thermostatData?.mode,
              setpoint: newSetpoint,
            },
          }),
        }
      );
      
      if (response.ok) {
        console.log("Temperature setpoint updated successfully");
        // Refresh data after successful update
        setTimeout(fetchThermostatData, 1000);
      } else {
        console.error("Failed to update temperature setpoint");
      }
    } catch (error) {
      console.error("Error updating temperature setpoint:", error);
    } finally {
      setPendingChanges(false);
    }
  };

  /**
   * Enhanced heat setpoint adjustment with backend integration
   */
  const adjustHeatSetpoint = async (delta: number) => {
    if (localHeatSetpoint === null) return;
    
    const newHeatSetpoint = localHeatSetpoint + delta;
    
    // Ensure heat setpoint doesn't exceed cool setpoint minus 1 degree
    const maxHeatSetpoint = localCoolSetpoint !== null ? localCoolSetpoint - 1 : newHeatSetpoint;
    const validHeatSetpoint = Math.min(Math.max(newHeatSetpoint, 10), Math.min(maxHeatSetpoint, 30));
    
    console.log("Setting new heat setpoint to:", validHeatSetpoint);
    setLocalHeatSetpoint(validHeatSetpoint);
    setPendingChanges(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              mode: "HEATCOOL",
              heatSetpoint: validHeatSetpoint,
              coolSetpoint: localCoolSetpoint,
            },
          }),
        }
      );
      
      if (response.ok) {
        console.log("Heat setpoint updated successfully");
        setTimeout(fetchThermostatData, 1000);
      } else {
        console.error("Failed to update heat setpoint");
      }
    } catch (error) {
      console.error("Error updating heat setpoint:", error);
    } finally {
      setPendingChanges(false);
    }
  };

  /**
   * Enhanced cool setpoint adjustment with backend integration
   */
  const adjustCoolSetpoint = async (delta: number) => {
    if (localCoolSetpoint === null) return;
    
    const newCoolSetpoint = localCoolSetpoint + delta;
    
    // Ensure cool setpoint doesn't go below heat setpoint plus 1 degree
    const minCoolSetpoint = localHeatSetpoint !== null ? localHeatSetpoint + 1 : newCoolSetpoint;
    const validCoolSetpoint = Math.max(Math.min(newCoolSetpoint, 30), Math.max(minCoolSetpoint, 10));
    
    console.log("Setting new cool setpoint to:", validCoolSetpoint);
    setLocalCoolSetpoint(validCoolSetpoint);
    setPendingChanges(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              mode: "HEATCOOL",
              heatSetpoint: localHeatSetpoint,
              coolSetpoint: validCoolSetpoint,
            },
          }),
        }
      );
      
      if (response.ok) {
        console.log("Cool setpoint updated successfully");
        setTimeout(fetchThermostatData, 1000);
      } else {
        console.error("Failed to update cool setpoint");
      }
    } catch (error) {
      console.error("Error updating cool setpoint:", error);
    } finally {
      setPendingChanges(false);
    }
  };

  /**
   * Enhanced mode change with backend integration
   */
  const changeThermostatMode = async (newMode: string) => {
    console.log("Changing thermostat mode to", newMode);
    setModeDropdownOpen(false);
    setPendingChanges(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              mode: newMode,
            },
          }),
        }
      );
      
      if (response.ok) {
        console.log("Thermostat mode updated successfully");
        setTimeout(fetchThermostatData, 1000);
      } else {
        console.error("Failed to update thermostat mode");
      }
    } catch (error) {
      console.error("Error updating thermostat mode:", error);
    } finally {
      setPendingChanges(false);
    }
  };

  /**
   * Interactive dial functions for temperature selection
   */
  const getTemperatureFromAngle = (angle: number): number => {
    // Convert angle to temperature (angle range: -135° to 135°, temp range: 10°C to 30°C)
    const normalizedAngle = Math.max(-135, Math.min(135, angle));
    const temp = ((normalizedAngle + 135) / 270) * (maxTemp - minTemp) + minTemp;
    return Math.round(temp * 2) / 2; // Round to nearest 0.5
  };

  const getAngleFromEvent = (event: React.MouseEvent, svgRect: DOMRect): number => {
    const clientX = event.clientX;
    const clientY = event.clientY;
    
    const svgCenterX = svgRect.left + svgRect.width / 2;
    const svgCenterY = svgRect.top + svgRect.height / 2;
    
    const deltaX = clientX - svgCenterX;
    const deltaY = clientY - svgCenterY;
    
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    return angle;
  };

  const handleDialMouseDown = (event: React.MouseEvent) => {
    const svgElement = (event.currentTarget as SVGElement);
    const svgRect = svgElement.getBoundingClientRect();
    const angle = getAngleFromEvent(event, svgRect);
    const temp = getTemperatureFromAngle(angle);
    
    setIsDragging(true);
    setIsTemperatureChanging(true);
    
    // Use the currently active setpoint for HEATCOOL mode
    if (thermostatData?.mode === "HEATCOOL") {
      setSelectedSetpoint(activeSetpoint);
    } else {
      setSelectedSetpoint('single');
    }
    
    event.preventDefault();
  };

  const handleDialMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) {
      // Show hover temperature
      const svgElement = (event.currentTarget as SVGElement);
      const svgRect = svgElement.getBoundingClientRect();
      const angle = getAngleFromEvent(event, svgRect);
      const temp = getTemperatureFromAngle(angle);
      setHoverTemp(temp);
      return;
    }

    const svgElement = (event.currentTarget as SVGElement);
    const svgRect = svgElement.getBoundingClientRect();
    const angle = getAngleFromEvent(event, svgRect);
    const temp = getTemperatureFromAngle(angle);

    // Update appropriate setpoint based on selection
    if (selectedSetpoint === 'heat') {
      const maxHeat = localCoolSetpoint ? localCoolSetpoint - 1 : 30;
      const validTemp = Math.min(Math.max(temp, 10), maxHeat);
      setLocalHeatSetpoint(validTemp);
    } else if (selectedSetpoint === 'cool') {
      const minCool = localHeatSetpoint ? localHeatSetpoint + 1 : 10;
      const validTemp = Math.max(Math.min(temp, 30), minCool);
      setLocalCoolSetpoint(validTemp);
    } else if (selectedSetpoint === 'single') {
      const validTemp = Math.min(Math.max(temp, 10), 30);
      setLocalSetpoint(validTemp);
    }
  };

  const handleDialMouseUp = async () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    setIsTemperatureChanging(false);
    setSelectedSetpoint(null);
    
    // Send backend update based on what was changed
    if (selectedSetpoint === 'heat' || selectedSetpoint === 'cool') {
      setPendingChanges(true);
      try {
        const response = await fetch(
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                deviceId,
                mode: "HEATCOOL",
                heatSetpoint: localHeatSetpoint,
                coolSetpoint: localCoolSetpoint,
              },
            }),
          }
        );
        
        if (response.ok) {
          console.log("HEATCOOL setpoints updated successfully");
          setTimeout(fetchThermostatData, 1000);
        }
      } catch (error) {
        console.error("Error updating HEATCOOL setpoints:", error);
      } finally {
        setPendingChanges(false);
      }
    } else if (selectedSetpoint === 'single') {
      await setThermostatTemperature(localSetpoint!);
    }
  };

  const handleDialMouseLeave = () => {
    setHoverTemp(null);
    if (isDragging) {
      handleDialMouseUp();
    }
  };

  /**
   * Enhanced eco mode toggle with backend integration
   */
  const toggleEcoMode = async () => {
    console.log("Toggling eco mode");
    setEcoModeActive(!ecoModeActive);
    setPendingChanges(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              ecoMode: !ecoModeActive ? "MANUAL_ECO" : "OFF",
            },
          }),
        }
      );
      
      if (response.ok) {
        console.log("Eco mode updated successfully");
        setTimeout(fetchThermostatData, 1000);
      } else {
        console.error("Failed to update eco mode");
        setEcoModeActive(ecoModeActive); // Revert on failure
      }
    } catch (error) {
      console.error("Error updating eco mode:", error);
      setEcoModeActive(ecoModeActive); // Revert on failure
    } finally {
      setPendingChanges(false);
    }
  };

  /**
   * Enhanced fan toggle with backend integration
   */
  const toggleFan = async (duration: number) => {
    console.log("Toggling fan with duration", duration, "seconds");
    setFanDropdownOpen(false);
    setPendingChanges(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              fanTimer: duration > 0 ? duration : null,
            },
          }),
        }
      );
      
      if (response.ok) {
        console.log("Fan timer updated successfully");
        setTimeout(fetchThermostatData, 1000);
      } else {
        console.error("Failed to update fan timer");
      }
    } catch (error) {
      console.error("Error updating fan timer:", error);
    } finally {
      setPendingChanges(false);
    }
  };

  // Add detailed thermostat dial variables before the return
  const width = 300;
  const height = 300;
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusOuter = 140;
  const radiusBezelInner = 130;
  const radiusBlackCircle = 120;
  const radiusTicks = 110;
  const minTemp = 10;
  const maxTemp = 30;
  
  // Calculate setpoint temperature and angle for dial
  const setpointTemp = thermostatData?.mode === "HEATCOOL" 
    ? (localHeatSetpoint !== null && localCoolSetpoint !== null 
        ? (localHeatSetpoint + localCoolSetpoint) / 2 
        : 20)
    : (localSetpoint !== null ? localSetpoint : 20);
  
  const setpointAngle = ((setpointTemp - minTemp) / (maxTemp - minTemp)) * 270 - 135;
  const setpointRad = (setpointAngle * Math.PI) / 180;
  
  // For HEATCOOL mode, calculate heat and cool angles
  const heatAngle = localHeatSetpoint !== null 
    ? ((localHeatSetpoint - minTemp) / (maxTemp - minTemp)) * 270 - 135
    : setpointAngle;
  const coolAngle = localCoolSetpoint !== null 
    ? ((localCoolSetpoint - minTemp) / (maxTemp - minTemp)) * 270 - 135
    : setpointAngle;
  
  const xSet = centerX + radiusTicks * Math.cos(setpointRad);
  const ySet = centerY + radiusTicks * Math.sin(setpointRad);
  const needleWidth = 6;
  const halfNeedle = needleWidth / 2;
  const xBaseLeft = centerX + halfNeedle * Math.cos(setpointRad + Math.PI / 2);
  const yBaseLeft = centerY + halfNeedle * Math.sin(setpointRad + Math.PI / 2);
  const xBaseRight = centerX + halfNeedle * Math.cos(setpointRad - Math.PI / 2);
  const yBaseRight = centerY + halfNeedle * Math.sin(setpointRad - Math.PI / 2);

  // Generate tick marks with enhanced styling
  const ticks = useMemo(() => {
    const tickMarks = [];
    for (let t = minTemp; t <= maxTemp; t++) {
      const angle = ((t - minTemp) / (maxTemp - minTemp)) * 270 - 135;
      const rad = (angle * Math.PI) / 180;
      const isLongTick = t % 5 === 0;
      
      // Check if this tick represents a setpoint
      let isSetpoint = false;
      let tickColor = "#888";
      
      if (thermostatData?.mode === "HEATCOOL") {
        const isHeatSetpoint = localHeatSetpoint !== null && t === Math.round(localHeatSetpoint);
        const isCoolSetpoint = localCoolSetpoint !== null && t === Math.round(localCoolSetpoint);
        isSetpoint = isHeatSetpoint || isCoolSetpoint;
        
        if (isHeatSetpoint) {
          tickColor = "#FF5500";
        } else if (isCoolSetpoint) {
          tickColor = "#00A0FF";
        } else if (isLongTick) {
          tickColor = "#AAA";
        }
      } else {
        isSetpoint = t === Math.round(setpointTemp);
        if (isSetpoint) {
          if (thermostatData?.mode === "HEAT") {
            tickColor = "#FF5500";
          } else if (thermostatData?.mode === "COOL") {
            tickColor = "#00A0FF";
          }
        } else if (isLongTick) {
          tickColor = "#AAA";
        }
      }
      
      const tickLength = isLongTick ? 12 : isSetpoint ? 14 : 6;
      
      const x1 = centerX + radiusTicks * Math.cos(rad);
      const y1 = centerY + radiusTicks * Math.sin(rad);
      const x2 = centerX + (radiusTicks - tickLength) * Math.cos(rad);
      const y2 = centerY + (radiusTicks - tickLength) * Math.sin(rad);
      
      // Add tick mark
      tickMarks.push(
        <line
          key={t}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={tickColor}
          strokeWidth={isSetpoint ? 3 : isLongTick ? 2 : 1}
          strokeLinecap="round"
        />
      );
      
      // Add temperature label for long ticks
      if (isLongTick) {
        const textDist = radiusTicks - 28;
        const tx = centerX + textDist * Math.cos(rad);
        const ty = centerY + textDist * Math.sin(rad);
        tickMarks.push(
          <text
            key={`text-${t}`}
            x={tx}
            y={ty}
            fontSize="10"
            fill="#AAA"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {t}
          </text>
        );
      }
    }
    return tickMarks;
  }, [minTemp, maxTemp, setpointTemp, thermostatData?.mode, localHeatSetpoint, localCoolSetpoint]);

  // Calculate arc paths for the leaf indicator and active area
  const arcPath = (radius: number, startAngle: number, endAngle: number) => {
    const start = {
      x: centerX + radius * Math.cos(startAngle * Math.PI / 180),
      y: centerY + radius * Math.sin(startAngle * Math.PI / 180)
    };
    const end = {
      x: centerX + radius * Math.cos(endAngle * Math.PI / 180),
      y: centerY + radius * Math.sin(endAngle * Math.PI / 180)
    };
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
  };

  // Calculate progress path (colored arc showing the temperature setting)
  const progressStartAngle = -135;
  const progressPath = thermostatData?.mode === "HEATCOOL" && localHeatSetpoint !== null && localCoolSetpoint !== null
    ? arcPath(radiusTicks - 3, heatAngle, coolAngle)
    : arcPath(radiusTicks - 3, progressStartAngle, setpointAngle);

  // Status text based on thermostat data
  const getStatusText = () => {
    if (!thermostatData) return "Connecting...";
    
    if (thermostatData.mode === "OFF") return "Off";
    if (thermostatData.hvacStatus === "HEATING") return "Heating";
    if (thermostatData.hvacStatus === "COOLING") return "Cooling";
    if (thermostatData.mode === "HEAT") return "Heat";
    if (thermostatData.mode === "COOL") return "Cool";
    if (thermostatData.mode === "HEATCOOL") return "Auto";
    
    return "Ready";
  };

  // Mode color for UI elements
  const getModeColor = () => {
    if (!thermostatData) return "#888";
    
    if (thermostatData.hvacStatus === "HEATING") return "#FF5500";
    if (thermostatData.hvacStatus === "COOLING") return "#00A0FF";
    if (thermostatData.mode === "HEAT") return "#FF5500";
    if (thermostatData.mode === "COOL") return "#00A0FF";
    if (thermostatData.mode === "HEATCOOL") return "#4DDF4D";
    
    return "#888";
  };

  // Determine if HVAC is currently active
  const isHvacActive = thermostatData?.hvacStatus === "HEATING" || 
                       thermostatData?.hvacStatus === "COOLING";

  /**
   * Render
   */
  return (
    <div className="flex flex-col space-y-6 w-screen -ml-4 px-4">
      {/* =============== THERMOSTAT CARD =============== */}
      <div className="bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-2xl shadow-2xl overflow-hidden w-full relative min-h-[380px] flex flex-col">
        {/* Glass reflective overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent h-1/2 pointer-events-none"></div>
        
        {/* Nest Logo (Top Right) */}
        <div className="absolute top-3 right-3 z-10">
          <div className="bg-black/30 rounded-full p-1.5 backdrop-blur-sm">
            <OptimizedImage src="/nest.svg" alt="Nest" className="h-6 w-6 opacity-80 hover:opacity-100 transition-opacity duration-200" loading="lazy" decoding="async" />
          </div>
        </div>
        
        {/* Status text at the top */}
        <div className="flex items-center justify-center pt-4 pb-1">
          <div 
            className="text-xs font-medium uppercase tracking-wider px-3 py-1 rounded-full border"
            style={{ 
              color: getModeColor(),
              borderColor: `${getModeColor()}50`
            }}
          >
            {getStatusText()}
            {isHvacActive && (
              <span className="inline-block ml-1 w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
            )}
          </div>
        </div>
        
        {/* Thermostat Dial */}
        <div className="flex items-center justify-center flex-1 relative">
          <svg 
            width={width} 
            height={height} 
            viewBox={`0 0 ${width} ${height}`} 
            className={`transform transition-all duration-300 cursor-pointer ${
              isDragging ? 'scale-105' : 'scale-95 hover:scale-100'
            } ${pendingChanges ? 'animate-pulse' : ''}`}
            onMouseDown={handleDialMouseDown}
            onMouseMove={handleDialMouseMove}
            onMouseUp={handleDialMouseUp}
            onMouseLeave={handleDialMouseLeave}
          >
            <defs>
              {/* Enhanced gradients for a more premium look */}
              <linearGradient id="bezelGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#555555" />
                <stop offset="40%" stopColor="#333333" />
                <stop offset="60%" stopColor="#222222" />
                <stop offset="100%" stopColor="#111111" />
              </linearGradient>
              <linearGradient id="silverRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0f0f0" />
                <stop offset="30%" stopColor="#c0c0c0" />
                <stop offset="70%" stopColor="#a0a0a0" />
                <stop offset="100%" stopColor="#808080" />
              </linearGradient>
              <radialGradient id="innerGlassGradient" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#333333" />
                <stop offset="100%" stopColor="#111111" />
              </radialGradient>
              <radialGradient id="heatingGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FF6600" />
                <stop offset="100%" stopColor="#DD4400" />
              </radialGradient>
              <radialGradient id="coolingGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00BBFF" />
                <stop offset="100%" stopColor="#0088DD" />
              </radialGradient>
              <linearGradient id="dualModeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#FF5500" />
                <stop offset="50%" stopColor="#4DDF4D" />
                <stop offset="100%" stopColor="#00A0FF" />
              </linearGradient>
              <radialGradient id="selectedGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4DDF4D" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#4DDF4D" stopOpacity="0.2" />
              </radialGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="strongGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="softShadow">
                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.3" />
              </filter>
              <filter id="hoverGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            
            {/* Outer silver ring (premium metal look) */}
            <circle 
              cx={centerX} 
              cy={centerY} 
              r={radiusOuter} 
              fill="url(#silverRingGradient)" 
              filter="url(#softShadow)" 
            />
            
            {/* Inner bezel ring */}
            <circle cx={centerX} cy={centerY} r={radiusBezelInner + 2} fill="url(#bezelGradient)" />
            
            {/* Black glass display with enhanced selection feedback */}
            <circle 
              cx={centerX} 
              cy={centerY} 
              r={radiusBlackCircle} 
              fill="url(#innerGlassGradient)" 
              className="transition-all duration-300"
              style={{ 
                filter: isHvacActive ? 'brightness(1.2)' : isDragging ? 'brightness(1.1)' : 'none',
                stroke: selectedSetpoint ? '#4DDF4D' : 
                        (thermostatData?.mode === "HEATCOOL" && activeSetpoint === 'heat') ? '#FF5500' :
                        (thermostatData?.mode === "HEATCOOL" && activeSetpoint === 'cool') ? '#00A0FF' : 
                        'none',
                strokeWidth: selectedSetpoint ? 3 : (thermostatData?.mode === "HEATCOOL" ? 2 : 0),
                strokeOpacity: selectedSetpoint ? 0.8 : 0.4
              }}
            />
            
            {/* Selection indicator overlay */}
            {selectedSetpoint && (
              <circle 
                cx={centerX} 
                cy={centerY} 
                r={radiusBlackCircle - 5} 
                fill="url(#selectedGradient)" 
                className="animate-pulse"
              />
            )}
            
            {/* Hover temperature indicator */}
            {hoverTemp !== null && !isDragging && (
              <>
                {(() => {
                  const hoverAngle = ((hoverTemp - minTemp) / (maxTemp - minTemp)) * 270 - 135;
                  const hoverRad = (hoverAngle * Math.PI) / 180;
                  const hoverX = centerX + (radiusTicks - 15) * Math.cos(hoverRad);
                  const hoverY = centerY + (radiusTicks - 15) * Math.sin(hoverRad);
                  
                  return (
                    <g className="animate-pulse">
                      <circle
                        cx={hoverX}
                        cy={hoverY}
                        r="8"
                        fill="#4DDF4D"
                        fillOpacity="0.8"
                        filter="url(#hoverGlow)"
                      />
                      <text
                        x={hoverX}
                        y={hoverY + 1}
                        fontSize="8"
                        fill="#000"
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        fontWeight="bold"
                      >
                        {hoverTemp}
                      </text>
                    </g>
                  );
                })()}
              </>
            )}
            
            {/* Subtle reflection on glass */}
            <ellipse 
              cx={centerX - 20} 
              cy={centerY - 30} 
              rx={radiusBlackCircle - 30} 
              ry={20} 
              fill="white" 
              opacity={0.03} 
            />
            
            {/* Active progress arc */}
            {thermostatData?.mode === "HEATCOOL" && localHeatSetpoint !== null && localCoolSetpoint !== null ? (
              /* Range arc for HEATCOOL mode */
              <>
                {/* Background range indicator */}
                <path 
                  d={progressPath}
                  stroke="#4DDF4D"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  opacity={0.3}
                  className="transition-all duration-300"
                />
                <path 
                  d={progressPath}
                  stroke="#4DDF4D"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  opacity={0.8}
                  className="transition-all duration-300"
                  filter={isHvacActive ? "url(#glow)" : "none"}
                />
              </>
            ) : (
              /* Standard progress arc for other modes */
              <path 
                d={progressPath}
                stroke={getModeColor()}
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                opacity={0.8}
                className="transition-all duration-300"
                filter={isHvacActive ? "url(#glow)" : "none"}
              />
            )}
            
            {/* Tick marks */}
            {ticks}
            
            {/* Temperature needle(s) with enhanced selection feedback */}
            {thermostatData?.mode === "HEATCOOL" && localHeatSetpoint !== null && localCoolSetpoint !== null ? (
              /* Dual needles for HEATCOOL mode with active indicator */
              <g className={`transition-all duration-300 ${isTemperatureChanging ? 'animate-pulse' : ''}`}>
                {/* Heat setpoint needle */}
                <g className={`transition-all duration-200 ${
                  activeSetpoint === 'heat' ? 'scale-110' : 'scale-100 opacity-70'
                }`}>
                  {(() => {
                    const heatRad = (heatAngle * Math.PI) / 180;
                    const xHeat = centerX + radiusTicks * Math.cos(heatRad);
                    const yHeat = centerY + radiusTicks * Math.sin(heatRad);
                    const needleSize = activeSetpoint === 'heat' ? halfNeedle + 1 : halfNeedle - 1;
                    const xHeatBaseLeft = centerX + needleSize * Math.cos(heatRad + Math.PI / 2);
                    const yHeatBaseLeft = centerY + needleSize * Math.sin(heatRad + Math.PI / 2);
                    const xHeatBaseRight = centerX + needleSize * Math.cos(heatRad - Math.PI / 2);
                    const yHeatBaseRight = centerY + needleSize * Math.sin(heatRad - Math.PI / 2);
                    
                    return (
                      <polygon
                        points={`${xHeat},${yHeat} ${xHeatBaseLeft},${yHeatBaseLeft} ${xHeatBaseRight},${yHeatBaseRight}`}
                        fill={activeSetpoint === 'heat' ? "#FF3300" : "#FF5500"}
                        stroke="#222"
                        strokeWidth={activeSetpoint === 'heat' ? "1" : "0.5"}
                        filter={activeSetpoint === 'heat' ? "url(#strongGlow)" : "none"}
                        className="transition-all duration-200"
                      />
                    );
                  })()}
                </g>
                
                {/* Cool setpoint needle */}
                <g className={`transition-all duration-200 ${
                  activeSetpoint === 'cool' ? 'scale-110' : 'scale-100 opacity-70'
                }`}>
                  {(() => {
                    const coolRad = (coolAngle * Math.PI) / 180;
                    const xCool = centerX + radiusTicks * Math.cos(coolRad);
                    const yCool = centerY + radiusTicks * Math.sin(coolRad);
                    const needleSize = activeSetpoint === 'cool' ? halfNeedle + 1 : halfNeedle - 1;
                    const xCoolBaseLeft = centerX + needleSize * Math.cos(coolRad + Math.PI / 2);
                    const yCoolBaseLeft = centerY + needleSize * Math.sin(coolRad + Math.PI / 2);
                    const xCoolBaseRight = centerX + needleSize * Math.cos(coolRad - Math.PI / 2);
                    const yCoolBaseRight = centerY + needleSize * Math.sin(coolRad - Math.PI / 2);
                    
                    return (
                      <polygon
                        points={`${xCool},${yCool} ${xCoolBaseLeft},${yCoolBaseLeft} ${xCoolBaseRight},${yCoolBaseRight}`}
                        fill={activeSetpoint === 'cool' ? "#0088FF" : "#00A0FF"}
                        stroke="#222"
                        strokeWidth={activeSetpoint === 'cool' ? "1" : "0.5"}
                        filter={activeSetpoint === 'cool' ? "url(#strongGlow)" : "none"}
                        className="transition-all duration-200"
                      />
                    );
                  })()}
                </g>
                
                {/* Central hub with active setpoint indicator */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={10}
                  fill={activeSetpoint === 'heat' ? "#FF3300" : "#0088FF"}
                  stroke="#222"
                  strokeWidth="1"
                  filter="url(#strongGlow)"
                  className="transition-all duration-200"
                />
                
                {/* Active setpoint indicator in center */}
                <text
                  x={centerX}
                  y={centerY + 1}
                  fontSize="8"
                  fill="white"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontWeight="bold"
                  className="pointer-events-none"
                >
                  {activeSetpoint === 'heat' ? 'H' : 'C'}
                </text>
              </g>
            ) : (
              /* Single needle for other modes with selection feedback */
              <g 
                className={`transition-all duration-300 ${isTemperatureChanging ? 'animate-pulse' : ''} ${selectedSetpoint === 'single' ? 'scale-110' : ''}`}
                style={{ filter: isTemperatureChanging || selectedSetpoint === 'single' ? "url(#strongGlow)" : "none" }}
              >
                <polygon
                  points={`${xSet},${ySet} ${xBaseLeft},${yBaseLeft} ${xBaseRight},${yBaseRight}`}
                  fill={getModeColor()}
                  stroke="#222"
                  strokeWidth="0.5"
                  className="transition-all duration-200"
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={selectedSetpoint === 'single' ? 10 : 8}
                  fill={getModeColor()}
                  stroke="#222"
                  strokeWidth="0.5"
                  className="transition-all duration-200"
                />
              </g>
            )}
            
            {/* Eco leaf indicator */}
            {ecoModeActive && (
              <g transform={`translate(${centerX - 10}, ${centerY + 30})`}>
                <path
                  d="M10,0 C15,5 20,10 10,20 C0,10 5,5 10,0"
                  fill="#4DDF4D"
                  filter="url(#glow)"
                  className="animate-pulse"
                />
              </g>
            )}
          </svg>
          
          {/* Enhanced Inner Text with Selection Feedback */}
          <div
            className="absolute flex flex-col items-center justify-center text-white pointer-events-none"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* Hover temperature display */}
            {hoverTemp !== null && !isDragging && (
              <div className="absolute -top-12 text-sm text-green-400 font-medium animate-pulse">
                Set to {hoverTemp}°C
              </div>
            )}
            
            {/* Selection feedback */}
            {selectedSetpoint && (
              <div className="absolute -top-8 text-xs text-green-400 font-medium animate-pulse">
                {selectedSetpoint === 'heat' ? 'Adjusting Heat' : 
                 selectedSetpoint === 'cool' ? 'Adjusting Cool' : 
                 'Adjusting Temperature'}
              </div>
            )}
            
            {thermostatData?.mode === "HEATCOOL" ? (
              /* Enhanced dual setpoint display with clear selection indicators */
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-4 text-3xl font-light tracking-tight">
                  {/* Heat Setpoint - Clickable with enhanced selection indicator */}
                  <button
                    onClick={selectHeatSetpoint}
                    className={`relative flex items-center transition-all duration-200 hover:scale-105 px-3 py-2 rounded-xl ${
                      activeSetpoint === 'heat' 
                        ? 'text-red-200 scale-110 font-bold bg-red-900/30 shadow-lg shadow-red-500/20 ring-2 ring-red-400/30' 
                        : 'text-red-500 opacity-60 hover:opacity-80 hover:bg-red-900/10'
                    }`}
                  >
                    {activeSetpoint === 'heat' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-red-400/20 rounded-xl animate-pulse"></div>
                    )}
                    <UilFire size={activeSetpoint === 'heat' ? 28 : 22} className="mr-2 z-10" />
                    <span className={`z-10 ${activeSetpoint === 'heat' ? 'font-bold' : 'font-light'}`}>
                      {localHeatSetpoint !== null ? Math.round(localHeatSetpoint) : "--"}°
                    </span>
                    {activeSetpoint === 'heat' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-pulse shadow-lg shadow-red-400/50"></div>
                    )}
                  </button>
                  
                  <div className="text-gray-500 text-2xl">|</div>
                  
                  {/* Cool Setpoint - Clickable with enhanced selection indicator */}
                  <button
                    onClick={selectCoolSetpoint}
                    className={`relative flex items-center transition-all duration-200 hover:scale-105 px-3 py-2 rounded-xl ${
                      activeSetpoint === 'cool' 
                        ? 'text-blue-200 scale-110 font-bold bg-blue-900/30 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/30' 
                        : 'text-blue-500 opacity-60 hover:opacity-80 hover:bg-blue-900/10'
                    }`}
                  >
                    {activeSetpoint === 'cool' && (
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-blue-400/20 rounded-xl animate-pulse"></div>
                    )}
                    <UilSnowflake size={activeSetpoint === 'cool' ? 28 : 22} className="mr-2 z-10" />
                    <span className={`z-10 ${activeSetpoint === 'cool' ? 'font-bold' : 'font-light'}`}>
                      {localCoolSetpoint !== null ? Math.round(localCoolSetpoint) : "--"}°
                    </span>
                    {activeSetpoint === 'cool' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-pulse shadow-lg shadow-blue-400/50"></div>
                    )}
                  </button>
                </div>
                
                {/* Enhanced active setpoint indicator */}
                <div className="text-xs mt-3 text-center">
                  <div className={`px-4 py-2 rounded-full ${
                    activeSetpoint === 'heat' 
                      ? 'bg-red-900/40 text-red-300 border border-red-500/30' 
                      : 'bg-blue-900/40 text-blue-300 border border-blue-500/30'
                  } transition-all duration-200`}>
                    <span className="font-semibold">
                      {activeSetpoint === 'heat' ? '🔥 Heat' : '❄️ Cool'} Control Active
                    </span>
                    <div className="text-xs opacity-80 mt-1">
                      Tap to switch • Drag dial to adjust
                    </div>
                  </div>
                </div>
                
                {pendingChanges && (
                  <div className="text-xs text-yellow-400 animate-pulse mt-2">
                    Updating thermostat...
                  </div>
                )}
              </div>
            ) : (
              /* Enhanced single setpoint display for other modes */
              <div className="flex flex-col items-center">
                <div className={`text-5xl font-light tracking-tight transition-all duration-200 ${
                  selectedSetpoint === 'single' ? 'scale-110' : ''
                }`}>
                  {localSetpoint !== null ? Math.round(localSetpoint) : "--"}°
                </div>
                {pendingChanges && (
                  <div className="text-xs text-yellow-400 animate-pulse">
                    Updating...
                  </div>
                )}
              </div>
            )}
            
            {thermostatData && (
              <div className="text-sm mt-1 text-gray-300 opacity-80">
                Current: {thermostatData.currentTemperature.toFixed(1)}°C
              </div>
            )}
            
            <div className="text-sm text-blue-400 flex items-center mt-2 space-x-1">
              <UilRaindrops size={16} className="opacity-80" />
              <span className="opacity-90">{thermostatData?.humidity || '--'}%</span>
            </div>
            
            {/* Interactive hint with setpoint awareness */}
            {!selectedSetpoint && !isDragging && (
              <div className="text-xs text-gray-500 mt-2 opacity-60 animate-pulse text-center">
                {thermostatData?.mode === "HEATCOOL" ? (
                  <div>
                    <div>Click and drag to adjust</div>
                    <div className={`text-xs mt-1 ${
                      activeSetpoint === 'heat' ? 'text-red-400' : 'text-blue-400'
                    }`}>
                      {activeSetpoint === 'heat' ? '🔥 Heat' : '❄️ Cool'} selected
                    </div>
                  </div>
                ) : (
                  "Click and drag to adjust"
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Simplified Controls Container */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-black/40 border-t border-gray-800/50 backdrop-blur-sm">
          {/* Mode Control */}
          <div className="relative">
            <button 
              onClick={() => setModeDropdownOpen(!modeDropdownOpen)} 
              className="group flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-200"
              disabled={pendingChanges}
            >
              <span className={`transition-colors duration-200 ${pendingChanges ? 'opacity-50' : ''}`} style={{ color: getModeColor() }}>
                {thermostatData?.mode === "HEAT" && <UilFire size={22} />}
                {thermostatData?.mode === "COOL" && <UilSnowflake size={22} />}
                {thermostatData?.mode === "HEATCOOL" && (
                  <div className="flex space-x-1">
                    <UilFire size={18} className="text-red-500" />
                    <UilSnowflake size={18} className="text-blue-500" />
                  </div>
                )}
                {thermostatData?.mode === "OFF" && <UilCircle size={22} />}
              </span>
              <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200">Mode</span>
            </button>
            {modeDropdownOpen && !pendingChanges && (
              <div className="absolute bottom-full mb-2 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-xl z-20 border border-gray-700 w-32 overflow-hidden">
                {["HEAT", "COOL", "HEATCOOL", "OFF"].map((modeOption) => (
                  <button
                    key={modeOption}
                    onClick={() => changeThermostatMode(modeOption)}
                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors duration-150 ${
                      thermostatData?.mode === modeOption ? "bg-gray-700/50" : ""
                    } ${modeOption === "HEAT" ? "text-red-400" : ""} 
                    ${modeOption === "COOL" ? "text-blue-400" : ""}
                    ${modeOption === "HEATCOOL" ? "text-green-400" : ""}
                    ${modeOption === "OFF" ? "text-gray-400" : ""}`}
                  >
                    <div className="flex items-center space-x-2">
                      {modeOption === "HEAT" && <UilFire size={16} />}
                      {modeOption === "COOL" && <UilSnowflake size={16} />}
                      {modeOption === "HEATCOOL" && (
                        <div className="flex space-x-0.5">
                          <UilFire size={14} className="text-red-400" />
                          <UilSnowflake size={14} className="text-blue-400" />
                        </div>
                      )}
                      {modeOption === "OFF" && <UilCircle size={16} />}
                      <span>{modeOption === "HEATCOOL" ? "Auto" : modeOption.charAt(0) + modeOption.slice(1).toLowerCase()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Enhanced Temperature Arrow Controls */}
          <div className="text-center flex-1 mx-4">
            {thermostatData?.mode === "HEATCOOL" ? (
              /* Enhanced arrow controls for HEATCOOL mode */
              <div className="flex flex-col items-center space-y-3">
                <button
                  onClick={increaseActiveSetpoint}
                  disabled={pendingChanges}
                  className={`p-3 rounded-full transition-all duration-200 shadow-lg relative ${
                    pendingChanges 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:scale-110 active:scale-95 hover:shadow-xl'
                  } ${
                    activeSetpoint === 'heat' 
                      ? 'bg-gradient-to-br from-red-600/70 to-red-800/70 hover:from-red-500/80 hover:to-red-700/80 text-red-100 shadow-red-500/30' 
                      : 'bg-gradient-to-br from-blue-600/70 to-blue-800/70 hover:from-blue-500/80 hover:to-blue-700/80 text-blue-100 shadow-blue-500/30'
                  }`}
                  title={`Increase ${activeSetpoint} setpoint`}
                >
                  <UilPlusCircle size={24} />
                  {!pendingChanges && (
                    <div className={`absolute inset-0 rounded-full ${
                      activeSetpoint === 'heat' ? 'bg-red-400/20' : 'bg-blue-400/20'
                    } animate-ping opacity-20`}></div>
                  )}
                </button>
                
                <div className={`text-center px-3 py-1 rounded-lg ${
                  activeSetpoint === 'heat' 
                    ? 'bg-red-900/20 text-red-300 border border-red-500/20' 
                    : 'bg-blue-900/20 text-blue-300 border border-blue-500/20'
                }`}>
                  <div className="text-xs font-medium">
                    {isDragging ? "Adjusting..." : 
                     pendingChanges ? "Updating..." :
                     `${activeSetpoint === 'heat' ? '🔥 Heat' : '❄️ Cool'}`}
                  </div>
                  <div className="text-xs opacity-70">
                    {isDragging || pendingChanges ? "" : "Controls"}
                  </div>
                </div>
                
                <button
                  onClick={decreaseActiveSetpoint}
                  disabled={pendingChanges}
                  className={`p-3 rounded-full transition-all duration-200 shadow-lg relative ${
                    pendingChanges 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:scale-110 active:scale-95 hover:shadow-xl'
                  } ${
                    activeSetpoint === 'heat' 
                      ? 'bg-gradient-to-br from-red-600/70 to-red-800/70 hover:from-red-500/80 hover:to-red-700/80 text-red-100 shadow-red-500/30' 
                      : 'bg-gradient-to-br from-blue-600/70 to-blue-800/70 hover:from-blue-500/80 hover:to-blue-700/80 text-blue-100 shadow-blue-500/30'
                  }`}
                  title={`Decrease ${activeSetpoint} setpoint`}
                >
                  <UilMinusCircle size={24} />
                  {!pendingChanges && (
                    <div className={`absolute inset-0 rounded-full ${
                      activeSetpoint === 'heat' ? 'bg-red-400/20' : 'bg-blue-400/20'
                    } animate-ping opacity-20`}></div>
                  )}
                </button>
              </div>
            ) : (
              /* Enhanced arrow controls for single setpoint modes */
              <div className="flex flex-col items-center space-y-3">
                <button
                  onClick={increaseActiveSetpoint}
                  disabled={pendingChanges}
                  className={`p-3 rounded-full transition-all duration-200 shadow-lg relative ${
                    pendingChanges 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:scale-110 active:scale-95 hover:shadow-xl'
                  } bg-gradient-to-br from-gray-600/70 to-gray-800/70 hover:from-gray-500/80 hover:to-gray-700/80 text-gray-100 shadow-gray-500/30`}
                  title="Increase temperature"
                >
                  <UilPlusCircle size={24} />
                  {!pendingChanges && (
                    <div className="absolute inset-0 rounded-full bg-gray-400/20 animate-ping opacity-20"></div>
                  )}
                </button>
                
                <div className="text-center px-3 py-1 rounded-lg bg-gray-900/20 text-gray-300 border border-gray-500/20">
                  <div className="text-xs font-medium">
                    {isDragging ? "Adjusting..." : 
                     pendingChanges ? "Updating..." :
                     "🌡️ Temperature"}
                  </div>
                  <div className="text-xs opacity-70">
                    {isDragging || pendingChanges ? "" : "Controls"}
                  </div>
                </div>
                
                <button
                  onClick={decreaseActiveSetpoint}
                  disabled={pendingChanges}
                  className={`p-3 rounded-full transition-all duration-200 shadow-lg relative ${
                    pendingChanges 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:scale-110 active:scale-95 hover:shadow-xl'
                  } bg-gradient-to-br from-gray-600/70 to-gray-800/70 hover:from-gray-500/80 hover:to-gray-700/80 text-gray-100 shadow-gray-500/30`}
                  title="Decrease temperature"
                >
                  <UilMinusCircle size={24} />
                  {!pendingChanges && (
                    <div className="absolute inset-0 rounded-full bg-gray-400/20 animate-ping opacity-20"></div>
                  )}
                </button>
              </div>
            )}
          </div>
          
          {/* Fan & Eco Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Fan Control */}
            <div className="relative">
              <button 
                onClick={() => setFanDropdownOpen(!fanDropdownOpen)} 
                className="group flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-200"
                disabled={pendingChanges}
              >
                <UilWind
                  className={`w-5 h-5 sm:w-6 sm:h-6 ${
                    pendingChanges ? 'opacity-50' : 
                    thermostatData?.fanStatus === "ON" ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"
                  }`}
                />
                <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200 hidden sm:inline">Fan</span>
              </button>
              {fanDropdownOpen && !pendingChanges && (
                <div className="absolute bottom-full mb-2 right-0 bg-gray-800/90 backdrop-blur-sm rounded-lg shadow-xl z-20 border border-gray-700 w-32 overflow-hidden">
                  {[15, 30, 60].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={() => toggleFan(minutes * 60)}
                      className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors duration-150"
                    >
                      <div className="flex items-center space-x-2">
                        <UilWind size={16} className="text-blue-400" />
                        <span>{minutes} min</span>
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => toggleFan(0)}
                    className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors duration-150"
                  >
                    <div className="flex items-center space-x-2">
                      <UilWind size={16} className="text-gray-400" />
                      <span>Off</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
            
            {/* Eco Mode Toggle */}
            <button 
              onClick={toggleEcoMode} 
              className={`group flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-200`}
              disabled={pendingChanges}
            >
              <UilTrees
                className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  pendingChanges ? 'opacity-50' : 
                  ecoModeActive ? "text-green-400" : "text-gray-500 group-hover:text-gray-300"
                }`}
              />
              <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200 hidden sm:inline">Eco</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* =============== AIRTHINGS CARD =============== */}
      {airthingsData && (
        <div className="relative p-4 bg-gradient-to-b from-gray-900 to-black border border-gray-800 rounded-xl shadow-lg overflow-hidden w-full">
          {/* Glass reflective overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent h-1/3 pointer-events-none"></div>
          
          {/* Room Name (Top Left) */}
          <div className="text-gray-200 text-base font-bold mb-4 flex items-center space-x-2">
            <WiThermometer className="text-blue-400" size={24} />
            <span>Living Room Air Quality</span>
          </div>
          
          {/* Airthings Logo (Top Right) */}
          <div className="absolute top-4 right-4">
            <OptimizedImage 
              src="/airthings.svg" 
              alt="Airthings"
              className="h-5 w-auto opacity-70"
              loading="lazy"
              decoding="async"
            />
          </div>
          
          {/* List of metrics with enhanced bars */}
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(airthingsData).map(([key, metric]) => {
              const barColor = getBarColor(metric.assessment);
              const barWidth = getBarWidth(metric.assessment);
              return (
                <div
                  key={key}
                  className={`flex flex-col bg-gray-800/30 p-3 rounded-lg border border-gray-700/40`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`text-${key === 'temperature' ? 'red-400' : 
                                             key === 'humidity' ? 'blue-400' : 
                                             key === 'co2' ? 'purple-400' : 
                                             key === 'voc' ? 'yellow-400' : 
                                             key === 'radon' ? 'orange-400' : 'green-400'}`}>
                        {metricIcons[key]}
                      </div>
                      <div className="text-white font-medium text-sm">{key === "pm2_5" ? "PM2.5" : key.toUpperCase()}</div>
                    </div>
                    <div className="text-sm font-medium" style={{ color: barColor }}>
                      {metric.value} {metric.unit}
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-700/50 rounded-full overflow-hidden mb-1">
                    <div 
                      className={`h-full ${barColor} transition-all duration-700`} 
                      style={{ width: barWidth, boxShadow: `0 0 8px ${barColor.replace('bg-', '').replace('-500', '')}` }} 
                    />
                  </div>
                  <div className="text-xs text-gray-400 capitalize">{metric.assessment}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Thermostat;
