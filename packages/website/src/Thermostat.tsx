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
  
  // Mobile-optimized UI state
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
   * Render - Simplified Mobile-Optimized Version
   */
  return (
    <div className="flex flex-col space-y-4 w-full max-w-sm mx-auto px-4">
      {/* =============== SIMPLIFIED THERMOSTAT CARD =============== */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden w-full relative">
        
        {/* Header with Status */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <div 
              className="text-sm font-medium px-2 py-1 rounded"
              style={{ color: getModeColor() }}
            >
              {getStatusText()}
            </div>
          </div>
          <OptimizedImage src="/nest.svg" alt="Nest" className="h-5 w-5 opacity-70" loading="lazy" decoding="async" />
        </div>
        
        {/* Main Temperature Display */}
        <div className="flex flex-col items-center py-6">
          {thermostatData?.mode === "HEATCOOL" ? (
            /* Simplified dual setpoint display */
            <div className="flex flex-col items-center space-y-4">
              <div className="flex items-center space-x-6">
                {/* Heat Setpoint */}
                <button
                  onClick={selectHeatSetpoint}
                  className={`flex flex-col items-center p-3 rounded-lg transition-all ${
                    activeSetpoint === 'heat' 
                      ? 'bg-red-800/30 text-red-300 scale-105' 
                      : 'text-red-500 opacity-70 hover:opacity-100'
                  }`}
                >
                  <UilFire size={24} />
                  <span className="text-xl font-light mt-1">
                    {localHeatSetpoint !== null ? Math.round(localHeatSetpoint) : "--"}°
                  </span>
                  <span className="text-xs">Heat</span>
                </button>
                
                {/* Cool Setpoint */}
                <button
                  onClick={selectCoolSetpoint}
                  className={`flex flex-col items-center p-3 rounded-lg transition-all ${
                    activeSetpoint === 'cool' 
                      ? 'bg-blue-800/30 text-blue-300 scale-105' 
                      : 'text-blue-500 opacity-70 hover:opacity-100'
                  }`}
                >
                  <UilSnowflake size={24} />
                  <span className="text-xl font-light mt-1">
                    {localCoolSetpoint !== null ? Math.round(localCoolSetpoint) : "--"}°
                  </span>
                  <span className="text-xs">Cool</span>
                </button>
              </div>
              
              {/* Active setpoint indicator */}
              <div className="text-xs text-gray-400">
                {activeSetpoint === 'heat' ? 'Heat' : 'Cool'} control active
              </div>
            </div>
          ) : (
            /* Single setpoint display */
            <div className="flex flex-col items-center">
              <div className="text-4xl font-light text-white">
                {localSetpoint !== null ? Math.round(localSetpoint) : "--"}°
              </div>
              <div className="text-sm text-gray-400 mt-1">Target</div>
            </div>
          )}
          
          {/* Current temperature */}
          {thermostatData && (
            <div className="text-sm text-gray-300 mt-3">
              Current: {thermostatData.currentTemperature.toFixed(1)}°C
            </div>
          )}
          
          {/* Humidity */}
          <div className="flex items-center text-sm text-blue-400 mt-2">
            <UilRaindrops size={16} className="mr-1" />
            <span>{thermostatData?.humidity || '--'}%</span>
          </div>
        </div>
        
        {/* Temperature Controls */}
        <div className="flex items-center justify-center space-x-8 py-4 border-t border-gray-700">
          <button
            onClick={decreaseActiveSetpoint}
            disabled={pendingChanges}
            className={`p-3 rounded-full transition-all ${
              pendingChanges 
                ? 'opacity-50' 
                : 'hover:scale-110 active:scale-95'
            } ${
              thermostatData?.mode === "HEATCOOL" 
                ? (activeSetpoint === 'heat' ? 'bg-red-800/50 text-red-300' : 'bg-blue-800/50 text-blue-300')
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            <UilMinusCircle size={28} />
          </button>
          
          <div className="text-center">
            <div className="text-xs text-gray-400">
              {pendingChanges ? "Updating..." : "Adjust Temp"}
            </div>
          </div>
          
          <button
            onClick={increaseActiveSetpoint}
            disabled={pendingChanges}
            className={`p-3 rounded-full transition-all ${
              pendingChanges 
                ? 'opacity-50' 
                : 'hover:scale-110 active:scale-95'
            } ${
              thermostatData?.mode === "HEATCOOL" 
                ? (activeSetpoint === 'heat' ? 'bg-red-800/50 text-red-300' : 'bg-blue-800/50 text-blue-300')
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            <UilPlusCircle size={28} />
          </button>
        </div>
        
        {/* Mode and Controls */}
        <div className="flex items-center justify-between p-4 bg-gray-800/50">
          {/* Mode Control */}
          <div className="relative">
            <button 
              onClick={() => setModeDropdownOpen(!modeDropdownOpen)} 
              className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-700/50 transition-colors"
              disabled={pendingChanges}
            >
              <span style={{ color: getModeColor() }}>
                {thermostatData?.mode === "HEAT" && <UilFire size={20} />}
                {thermostatData?.mode === "COOL" && <UilSnowflake size={20} />}
                {thermostatData?.mode === "HEATCOOL" && (
                  <div className="flex space-x-1">
                    <UilFire size={16} className="text-red-500" />
                    <UilSnowflake size={16} className="text-blue-500" />
                  </div>
                )}
                {thermostatData?.mode === "OFF" && <UilCircle size={20} />}
              </span>
              <span className="text-xs text-gray-400">Mode</span>
            </button>
            {modeDropdownOpen && !pendingChanges && (
              <div className="absolute bottom-full mb-2 bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-600 w-32">
                {["HEAT", "COOL", "HEATCOOL", "OFF"].map((modeOption) => (
                  <button
                    key={modeOption}
                    onClick={() => changeThermostatMode(modeOption)}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${
                      thermostatData?.mode === modeOption ? "bg-gray-700/50" : ""
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {modeOption === "HEAT" && <UilFire size={16} className="text-red-400" />}
                      {modeOption === "COOL" && <UilSnowflake size={16} className="text-blue-400" />}
                      {modeOption === "HEATCOOL" && (
                        <div className="flex space-x-1">
                          <UilFire size={14} className="text-red-400" />
                          <UilSnowflake size={14} className="text-blue-400" />
                        </div>
                      )}
                      {modeOption === "OFF" && <UilCircle size={16} className="text-gray-400" />}
                      <span className="text-gray-200">
                        {modeOption === "HEATCOOL" ? "Auto" : modeOption.charAt(0) + modeOption.slice(1).toLowerCase()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Fan Control */}
          <button 
            onClick={() => setFanDropdownOpen(!fanDropdownOpen)} 
            className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-700/50 transition-colors"
            disabled={pendingChanges}
          >
            <UilWind
              className={`w-5 h-5 ${
                thermostatData?.fanStatus === "ON" ? "text-blue-400" : "text-gray-500"
              }`}
            />
            <span className="text-xs text-gray-400">Fan</span>
          </button>
          {fanDropdownOpen && !pendingChanges && (
            <div className="absolute bottom-full right-4 mb-2 bg-gray-800 rounded-lg shadow-xl z-20 border border-gray-600 w-28">
              {[15, 30, 60].map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => toggleFan(minutes * 60)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors text-gray-200"
                >
                  {minutes} min
                </button>
              ))}
              <button
                onClick={() => toggleFan(0)}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors text-gray-200"
              >
                Off
              </button>
            </div>
          )}
          
          {/* Eco Mode */}
          <button 
            onClick={toggleEcoMode} 
            className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-700/50 transition-colors"
            disabled={pendingChanges}
          >
            <UilTrees
              className={`w-5 h-5 ${
                ecoModeActive ? "text-green-400" : "text-gray-500"
              }`}
            />
            <span className="text-xs text-gray-400">Eco</span>
          </button>
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
