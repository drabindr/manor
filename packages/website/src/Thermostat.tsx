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
  
  // New state for enhanced interactions
  const [selectedSetpoint, setSelectedSetpoint] = useState<'heat' | 'cool' | 'single' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDialActive, setIsDialActive] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(false);

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
   * Keep local setpoints in sync with fetched data and update eco mode
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
    // Update eco mode based on backend data
    if (thermostatData?.ecoMode) {
      setEcoModeActive(thermostatData.ecoMode !== "OFF");
    }
  }, [thermostatData?.setpoint, thermostatData?.heatCelsius, thermostatData?.coolCelsius, thermostatData?.ecoMode]);

  /**
   * Handler to set the thermostat temperature with backend integration
   */
  const setThermostatTemperature = async (newSetpoint: number) => {
    console.log("Setting new setpoint to:", newSetpoint);
    setLocalSetpoint(newSetpoint);
    setPendingChanges(true);
    setIsTemperatureChanging(true);
    
    try {
      const response = await fetch(
        "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              deviceId,
              command: {
                "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat": {
                  heatCelsius: newSetpoint
                }
              }
            }
          })
        }
      );
      
      if (response.ok) {
        // Refresh data after successful update
        setTimeout(() => {
          fetchThermostatData();
          setPendingChanges(false);
        }, 1000);
      }
    } catch (error) {
      console.error("Error setting temperature:", error);
      setPendingChanges(false);
    } finally {
      setTimeout(() => setIsTemperatureChanging(false), 500);
    }
  };

  /**
   * Handler to adjust heat setpoint in HEATCOOL mode with backend integration
   */
  const adjustHeatSetpoint = async (delta: number) => {
    if (localHeatSetpoint !== null && localCoolSetpoint !== null) {
      const newHeatSetpoint = localHeatSetpoint + delta;
      // Ensure heat setpoint doesn't exceed cool setpoint minus 1 degree
      const maxHeatSetpoint = localCoolSetpoint - 1;
      const validHeatSetpoint = Math.min(newHeatSetpoint, maxHeatSetpoint);
      console.log("Setting new heat setpoint to:", validHeatSetpoint);
      setLocalHeatSetpoint(validHeatSetpoint);
      setPendingChanges(true);
      setIsTemperatureChanging(true);
      
      try {
        const response = await fetch(
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
          {
            method: "POST", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                deviceId,
                command: {
                  "sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange": {
                    heatCelsius: validHeatSetpoint,
                    coolCelsius: localCoolSetpoint
                  }
                }
              }
            })
          }
        );
        
        if (response.ok) {
          setTimeout(() => {
            fetchThermostatData();
            setPendingChanges(false);
          }, 1000);
        }
      } catch (error) {
        console.error("Error setting heat setpoint:", error);
        setPendingChanges(false);
      } finally {
        setTimeout(() => setIsTemperatureChanging(false), 500);
      }
    } else if (localHeatSetpoint !== null) {
      // If only heat setpoint is available, adjust it directly
      const newHeatSetpoint = localHeatSetpoint + delta;
      console.log("Setting new heat setpoint to:", newHeatSetpoint);
      setLocalHeatSetpoint(newHeatSetpoint);
      // Call API for single heat setpoint
      setPendingChanges(true);
    }
  };

  /**
   * Handler to adjust cool setpoint in HEATCOOL mode with backend integration
   */
  const adjustCoolSetpoint = async (delta: number) => {
    if (localCoolSetpoint !== null && localHeatSetpoint !== null) {
      const newCoolSetpoint = localCoolSetpoint + delta;
      // Ensure cool setpoint doesn't go below heat setpoint plus 1 degree
      const minCoolSetpoint = localHeatSetpoint + 1;
      const validCoolSetpoint = Math.max(newCoolSetpoint, minCoolSetpoint);
      console.log("Setting new cool setpoint to:", validCoolSetpoint);
      setLocalCoolSetpoint(validCoolSetpoint);
      setPendingChanges(true);
      setIsTemperatureChanging(true);
      
      try {
        const response = await fetch(
          "https://749cc0fpwc.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/set",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                deviceId,
                command: {
                  "sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange": {
                    heatCelsius: localHeatSetpoint,
                    coolCelsius: validCoolSetpoint
                  }
                }
              }
            })
          }
        );
        
        if (response.ok) {
          setTimeout(() => {
            fetchThermostatData();
            setPendingChanges(false);
          }, 1000);
        }
      } catch (error) {
        console.error("Error setting cool setpoint:", error);
        setPendingChanges(false);
      } finally {
        setTimeout(() => setIsTemperatureChanging(false), 500);
      }
    } else if (localCoolSetpoint !== null) {
      // If only cool setpoint is available, adjust it directly
      const newCoolSetpoint = localCoolSetpoint + delta;
      console.log("Setting new cool setpoint to:", newCoolSetpoint);
      setLocalCoolSetpoint(newCoolSetpoint);
      setPendingChanges(true);
    }
  };

  /**
   * Handler to change the thermostat mode with backend integration
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
              command: {
                "sdm.devices.commands.ThermostatMode.SetMode": {
                  mode: newMode
                }
              }
            }
          })
        }
      );
      
      if (response.ok) {
        setTimeout(() => {
          fetchThermostatData();
          setPendingChanges(false);
        }, 1000);
      }
    } catch (error) {
      console.error("Error changing mode:", error);
      setPendingChanges(false);
    }
  };

  /**
   * Interactive dial control - converts mouse position to temperature
   */
  const handleDialInteraction = (event: React.MouseEvent<SVGElement>) => {
    if (!isDragging && !isDialActive) return;
    
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = event.clientX - rect.left - centerX;
    const y = event.clientY - rect.top - centerY;
    
    // Calculate angle from center
    let angle = Math.atan2(y, x) * 180 / Math.PI;
    
    // Normalize angle to 0-360 range
    if (angle < 0) angle += 360;
    
    // Convert to temperature range (270 degrees of rotation, starting at -135)
    // Adjust for our dial's orientation
    let dialAngle = angle + 135;
    if (dialAngle > 360) dialAngle -= 360;
    
    // Ensure angle is within our 270-degree range
    if (dialAngle > 270) return;
    
    // Convert angle to temperature
    const tempPercent = dialAngle / 270;
    const newTemp = minTemp + tempPercent * (maxTemp - minTemp);
    const roundedTemp = Math.round(newTemp * 2) / 2; // Round to nearest 0.5
    
    // Update appropriate setpoint based on selection
    if (thermostatData?.mode === "HEATCOOL") {
      if (selectedSetpoint === 'heat' && localCoolSetpoint !== null) {
        const maxHeat = localCoolSetpoint - 1;
        const validTemp = Math.min(roundedTemp, maxHeat);
        setLocalHeatSetpoint(validTemp);
      } else if (selectedSetpoint === 'cool' && localHeatSetpoint !== null) {
        const minCool = localHeatSetpoint + 1;
        const validTemp = Math.max(roundedTemp, minCool);
        setLocalCoolSetpoint(validTemp);
      }
    } else {
      setLocalSetpoint(roundedTemp);
    }
  };

  /**
   * Start dial interaction
   */
  const startDialInteraction = () => {
    setIsDialActive(true);
    setIsDragging(true);
    setIsTemperatureChanging(true);
  };

  /**
   * End dial interaction and save changes
   */
  const endDialInteraction = async () => {
    setIsDragging(false);
    setIsDialActive(false);
    
    if (thermostatData?.mode === "HEATCOOL") {
      if (selectedSetpoint === 'heat') {
        await adjustHeatSetpoint(0); // This triggers the API call with current value
      } else if (selectedSetpoint === 'cool') {
        await adjustCoolSetpoint(0); // This triggers the API call with current value
      }
    } else {
      if (localSetpoint !== null) {
        await setThermostatTemperature(localSetpoint);
      }
    }
    
    setTimeout(() => setIsTemperatureChanging(false), 300);
  };

  /**
   * Toggle eco mode with backend integration
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
              command: {
                "sdm.devices.commands.ThermostatEco.SetMode": {
                  mode: ecoModeActive ? "OFF" : "MANUAL_ECO"
                }
              }
            }
          })
        }
      );
      
      if (response.ok) {
        setTimeout(() => {
          fetchThermostatData();
          setPendingChanges(false);
        }, 1000);
      }
    } catch (error) {
      console.error("Error toggling eco mode:", error);
      setPendingChanges(false);
    }
  };

  /**
   * Toggle fan for a specified duration with backend integration
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
              command: {
                "sdm.devices.commands.Fan.SetTimer": {
                  timerMode: duration > 0 ? "ON" : "OFF",
                  duration: duration > 0 ? `${duration}s` : undefined
                }
              }
            }
          })
        }
      );
      
      if (response.ok) {
        setTimeout(() => {
          fetchThermostatData();
          setPendingChanges(false);
        }, 1000);
      }
    } catch (error) {
      console.error("Error toggling fan:", error);
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

  // Generate tick marks with enhanced styling and selection states
  const ticks = useMemo(() => {
    const tickMarks = [];
    for (let t = minTemp; t <= maxTemp; t++) {
      const angle = ((t - minTemp) / (maxTemp - minTemp)) * 270 - 135;
      const rad = (angle * Math.PI) / 180;
      const isLongTick = t % 5 === 0;
      
      // Check if this tick represents a setpoint and determine selection state
      let isSetpoint = false;
      let isSelected = false;
      let tickColor = "#888";
      
      if (thermostatData?.mode === "HEATCOOL") {
        const isHeatSetpoint = localHeatSetpoint !== null && t === Math.round(localHeatSetpoint);
        const isCoolSetpoint = localCoolSetpoint !== null && t === Math.round(localCoolSetpoint);
        isSetpoint = isHeatSetpoint || isCoolSetpoint;
        
        if (isHeatSetpoint) {
          tickColor = selectedSetpoint === 'heat' ? "#FF8844" : "#FF5500";
          isSelected = selectedSetpoint === 'heat';
        } else if (isCoolSetpoint) {
          tickColor = selectedSetpoint === 'cool' ? "#44AAFF" : "#00A0FF";
          isSelected = selectedSetpoint === 'cool';
        } else if (isLongTick) {
          tickColor = "#AAA";
        }
      } else {
        isSetpoint = t === Math.round(setpointTemp);
        isSelected = selectedSetpoint === 'single';
        if (isSetpoint) {
          if (thermostatData?.mode === "HEAT") {
            tickColor = isSelected ? "#FF8844" : "#FF5500";
          } else if (thermostatData?.mode === "COOL") {
            tickColor = isSelected ? "#44AAFF" : "#00A0FF";
          }
        } else if (isLongTick) {
          tickColor = "#AAA";
        }
      }
      
      const tickLength = isSetpoint ? (isSelected ? 18 : 14) : isLongTick ? 12 : 6;
      const strokeWidth = isSetpoint ? (isSelected ? 4 : 3) : isLongTick ? 2 : 1;
      
      const x1 = centerX + radiusTicks * Math.cos(rad);
      const y1 = centerY + radiusTicks * Math.sin(rad);
      const x2 = centerX + (radiusTicks - tickLength) * Math.cos(rad);
      const y2 = centerY + (radiusTicks - tickLength) * Math.sin(rad);
      
      // Add tick mark with enhanced selection state
      tickMarks.push(
        <line
          key={t}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={tickColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={`transition-all duration-200 ${isSetpoint ? 'drop-shadow-lg' : ''}`}
          style={{ filter: isSelected ? `drop-shadow(0 0 6px ${tickColor})` : 'none' }}
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
            className="transition-colors duration-200"
          >
            {t}
          </text>
        );
      }
    }
    return tickMarks;
  }, [minTemp, maxTemp, setpointTemp, thermostatData?.mode, localHeatSetpoint, localCoolSetpoint, selectedSetpoint]);

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
              isDialActive ? 'scale-105' : 'scale-95'
            } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={startDialInteraction}
            onMouseMove={handleDialInteraction}
            onMouseUp={endDialInteraction}
            onMouseLeave={endDialInteraction}
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
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="softShadow">
                <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.3" />
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
            
            {/* Black glass display */}
            <circle 
              cx={centerX} 
              cy={centerY} 
              r={radiusBlackCircle} 
              fill="url(#innerGlassGradient)" 
              className="transition-all duration-300"
              style={{ filter: isHvacActive ? 'brightness(1.2)' : 'none' }}
            />
            
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
            
            {/* Temperature needle(s) */}
            {thermostatData?.mode === "HEATCOOL" && localHeatSetpoint !== null && localCoolSetpoint !== null ? (
              /* Dual needles for HEATCOOL mode */
              <g className={`transition-transform duration-300 ${isTemperatureChanging ? 'animate-pulse' : ''}`}>
                {/* Heat setpoint needle */}
                <g>
                  {(() => {
                    const heatRad = (heatAngle * Math.PI) / 180;
                    const xHeat = centerX + radiusTicks * Math.cos(heatRad);
                    const yHeat = centerY + radiusTicks * Math.sin(heatRad);
                    const xHeatBaseLeft = centerX + (halfNeedle - 1) * Math.cos(heatRad + Math.PI / 2);
                    const yHeatBaseLeft = centerY + (halfNeedle - 1) * Math.sin(heatRad + Math.PI / 2);
                    const xHeatBaseRight = centerX + (halfNeedle - 1) * Math.cos(heatRad - Math.PI / 2);
                    const yHeatBaseRight = centerY + (halfNeedle - 1) * Math.sin(heatRad - Math.PI / 2);
                    
                    return (
                      <polygon
                        points={`${xHeat},${yHeat} ${xHeatBaseLeft},${yHeatBaseLeft} ${xHeatBaseRight},${yHeatBaseRight}`}
                        fill="#FF5500"
                        stroke="#222"
                        strokeWidth="0.5"
                      />
                    );
                  })()}
                </g>
                
                {/* Cool setpoint needle */}
                <g>
                  {(() => {
                    const coolRad = (coolAngle * Math.PI) / 180;
                    const xCool = centerX + radiusTicks * Math.cos(coolRad);
                    const yCool = centerY + radiusTicks * Math.sin(coolRad);
                    const xCoolBaseLeft = centerX + (halfNeedle - 1) * Math.cos(coolRad + Math.PI / 2);
                    const yCoolBaseLeft = centerY + (halfNeedle - 1) * Math.sin(coolRad + Math.PI / 2);
                    const xCoolBaseRight = centerX + (halfNeedle - 1) * Math.cos(coolRad - Math.PI / 2);
                    const yCoolBaseRight = centerY + (halfNeedle - 1) * Math.sin(coolRad - Math.PI / 2);
                    
                    return (
                      <polygon
                        points={`${xCool},${yCool} ${xCoolBaseLeft},${yCoolBaseLeft} ${xCoolBaseRight},${yCoolBaseRight}`}
                        fill="#00A0FF"
                        stroke="#222"
                        strokeWidth="0.5"
                      />
                    );
                  })()}
                </g>
                
                {/* Central hub with dual color indicator */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={8}
                  fill="url(#dualModeGradient)"
                  stroke="#222"
                  strokeWidth="0.5"
                />
              </g>
            ) : (
              /* Single needle for other modes */
              <g 
                className={`transition-transform duration-300 ${isTemperatureChanging ? 'animate-pulse' : ''}`}
                style={{ filter: isTemperatureChanging ? "url(#glow)" : "none" }}
              >
                <polygon
                  points={`${xSet},${ySet} ${xBaseLeft},${yBaseLeft} ${xBaseRight},${yBaseRight}`}
                  fill={getModeColor()}
                  stroke="#222"
                  strokeWidth="0.5"
                />
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={8}
                  fill={getModeColor()}
                  stroke="#222"
                  strokeWidth="0.5"
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
          
          {/* Inner Text (Current Temp, Humidity, Selection Controls) */}
          <div
            className="absolute flex flex-col items-center justify-center text-white"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {thermostatData?.mode === "HEATCOOL" ? (
              /* Dual setpoint display with selection for HEATCOOL mode */
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-3 text-2xl font-light tracking-tight mb-2">
                  <button
                    onClick={() => setSelectedSetpoint(selectedSetpoint === 'heat' ? null : 'heat')}
                    className={`flex items-center transition-all duration-300 px-2 py-1 rounded-lg ${
                      selectedSetpoint === 'heat' 
                        ? 'bg-red-500/30 text-red-300 scale-110 shadow-lg shadow-red-500/25' 
                        : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                    }`}
                  >
                    <UilFire size={18} className="mr-1" />
                    <span>{thermostatData.heatCelsius !== null ? Math.round(thermostatData.heatCelsius) : "--"}°</span>
                  </button>
                  <div className="text-gray-500">|</div>
                  <button
                    onClick={() => setSelectedSetpoint(selectedSetpoint === 'cool' ? null : 'cool')}
                    className={`flex items-center transition-all duration-300 px-2 py-1 rounded-lg ${
                      selectedSetpoint === 'cool' 
                        ? 'bg-blue-500/30 text-blue-300 scale-110 shadow-lg shadow-blue-500/25' 
                        : 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                    }`}
                  >
                    <UilSnowflake size={18} className="mr-1" />
                    <span>{thermostatData.coolCelsius !== null ? Math.round(thermostatData.coolCelsius) : "--"}°</span>
                  </button>
                </div>
                <div className="text-xs text-gray-400 opacity-80 mb-1">
                  {selectedSetpoint === 'heat' && "Heat setpoint selected"}
                  {selectedSetpoint === 'cool' && "Cool setpoint selected"}
                  {!selectedSetpoint && "Tap to select heat or cool"}
                </div>
                {selectedSetpoint && (
                  <div className="text-xs text-gray-500 opacity-70">
                    Click dial to adjust • Use +/- buttons
                  </div>
                )}
              </div>
            ) : (
              /* Single setpoint display for other modes */
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setSelectedSetpoint(selectedSetpoint === 'single' ? null : 'single')}
                  className={`transition-all duration-300 rounded-lg px-3 py-2 ${
                    selectedSetpoint === 'single'
                      ? 'scale-110 shadow-lg'
                      : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: selectedSetpoint === 'single' ? `${getModeColor()}20` : 'transparent',
                    color: selectedSetpoint === 'single' ? getModeColor() : 'white',
                    boxShadow: selectedSetpoint === 'single' ? `0 0 20px ${getModeColor()}40` : 'none'
                  }}
                >
                  <div className="text-4xl font-light tracking-tight">
                    {localSetpoint !== null ? Math.round(localSetpoint) : "--"}°
                  </div>
                </button>
                {selectedSetpoint === 'single' && (
                  <div className="text-xs text-gray-500 opacity-70 mt-1">
                    Click dial to adjust • Use +/- buttons
                  </div>
                )}
              </div>
            )}
            
            {thermostatData && (
              <div className="text-sm mt-2 text-gray-300 opacity-80">
                Current: {thermostatData.currentTemperature.toFixed(1)}°C
              </div>
            )}
            
            <div className="text-sm text-blue-400 flex items-center mt-2 space-x-1">
              <UilRaindrops size={16} className="opacity-80" />
              <span className="opacity-90">{thermostatData?.humidity || '--'}%</span>
            </div>
            
            {/* Pending changes indicator */}
            {pendingChanges && (
              <div className="flex items-center mt-2 text-xs text-yellow-400">
                <div className="animate-spin w-3 h-3 border border-yellow-400 border-t-transparent rounded-full mr-1"></div>
                Updating...
              </div>
            )}
          </div>
        </div>
        
        {/* Controls Container */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 bg-black/40 border-t border-gray-800/50 backdrop-blur-sm gap-3 sm:gap-0">
          {/* Mode Control */}
          <div className="relative order-1 sm:order-1">
            <button 
              onClick={() => setModeDropdownOpen(!modeDropdownOpen)} 
              className="group flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-200"
            >
              <span className={`transition-colors duration-200`} style={{ color: getModeColor() }}>
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
            {modeDropdownOpen && (
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
          
          {/* Temperature Controls */}
          <div className="order-3 sm:order-2">
            {thermostatData?.mode === "HEATCOOL" ? (
              /* Enhanced dual controls for HEATCOOL mode */
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                {selectedSetpoint === 'heat' || !selectedSetpoint ? (
                  /* Heat controls */
                  <div className={`flex items-center space-x-1 sm:space-x-2 transition-all duration-300 ${
                    selectedSetpoint === 'heat' ? 'scale-110' : selectedSetpoint === 'cool' ? 'opacity-50' : ''
                  }`}>
                    <button
                      onMouseDown={() => setIsTemperatureChanging(true)}
                      onMouseUp={() => setIsTemperatureChanging(false)}
                      onMouseLeave={() => setIsTemperatureChanging(false)}
                      onClick={() => {
                        setSelectedSetpoint('heat');
                        adjustHeatSetpoint(-0.5);
                      }}
                      className="bg-red-800/60 hover:bg-red-700/80 active:bg-red-600 text-white rounded-full p-1 sm:p-1.5 focus:outline-none transition-all duration-150 border border-red-700/30 hover:scale-105 active:scale-95"
                      title="Decrease heat setpoint"
                    >
                      <UilMinusCircle size={18} className="sm:w-5 sm:h-5" />
                    </button>
                    <div className="flex flex-col items-center px-1">
                      <UilFire size={14} className="text-red-400 sm:w-4 sm:h-4" />
                      <span className="text-xs text-red-400">Heat</span>
                    </div>
                    <button
                      onMouseDown={() => setIsTemperatureChanging(true)}
                      onMouseUp={() => setIsTemperatureChanging(false)}
                      onMouseLeave={() => setIsTemperatureChanging(false)}
                      onClick={() => {
                        setSelectedSetpoint('heat');
                        adjustHeatSetpoint(0.5);
                      }}
                      className="bg-red-800/60 hover:bg-red-700/80 active:bg-red-600 text-white rounded-full p-1 sm:p-1.5 focus:outline-none transition-all duration-150 border border-red-700/30 hover:scale-105 active:scale-95"
                      title="Increase heat setpoint"
                    >
                      <UilPlusCircle size={18} className="sm:w-5 sm:h-5" />
                    </button>
                  </div>
                ) : null}
                
                {selectedSetpoint === 'cool' || !selectedSetpoint ? (
                  /* Cool controls */
                  <div className={`flex items-center space-x-1 sm:space-x-2 transition-all duration-300 ${
                    selectedSetpoint === 'cool' ? 'scale-110' : selectedSetpoint === 'heat' ? 'opacity-50' : ''
                  }`}>
                    <button
                      onMouseDown={() => setIsTemperatureChanging(true)}
                      onMouseUp={() => setIsTemperatureChanging(false)}
                      onMouseLeave={() => setIsTemperatureChanging(false)}
                      onClick={() => {
                        setSelectedSetpoint('cool');
                        adjustCoolSetpoint(-0.5);
                      }}
                      className="bg-blue-800/60 hover:bg-blue-700/80 active:bg-blue-600 text-white rounded-full p-1 sm:p-1.5 focus:outline-none transition-all duration-150 border border-blue-700/30 hover:scale-105 active:scale-95"
                      title="Decrease cool setpoint"
                    >
                      <UilMinusCircle size={18} className="sm:w-5 sm:h-5" />
                    </button>
                    <div className="flex flex-col items-center px-1">
                      <UilSnowflake size={14} className="text-blue-400 sm:w-4 sm:h-4" />
                      <span className="text-xs text-blue-400">Cool</span>
                    </div>
                    <button
                      onMouseDown={() => setIsTemperatureChanging(true)}
                      onMouseUp={() => setIsTemperatureChanging(false)}
                      onMouseLeave={() => setIsTemperatureChanging(false)}
                      onClick={() => {
                        setSelectedSetpoint('cool');
                        adjustCoolSetpoint(0.5);
                      }}
                      className="bg-blue-800/60 hover:bg-blue-700/80 active:bg-blue-600 text-white rounded-full p-1 sm:p-1.5 focus:outline-none transition-all duration-150 border border-blue-700/30 hover:scale-105 active:scale-95"
                      title="Increase cool setpoint"
                    >
                      <UilPlusCircle size={18} className="sm:w-5 sm:h-5" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              /* Enhanced single controls for other modes */
              <div className={`flex space-x-4 transition-all duration-300 ${
                selectedSetpoint === 'single' ? 'scale-110' : ''
              }`}>
                <button
                  onMouseDown={() => setIsTemperatureChanging(true)}
                  onMouseUp={() => setIsTemperatureChanging(false)}
                  onMouseLeave={() => setIsTemperatureChanging(false)}
                  onClick={() => {
                    setSelectedSetpoint('single');
                    if (localSetpoint !== null) setThermostatTemperature(localSetpoint - 0.5);
                  }}
                  className="bg-gray-800/60 hover:bg-gray-700/80 active:bg-gray-600 text-white rounded-full p-2 focus:outline-none transition-all duration-150 border border-gray-700/30 hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: selectedSetpoint === 'single' ? `${getModeColor()}30` : undefined,
                    borderColor: selectedSetpoint === 'single' ? `${getModeColor()}50` : undefined
                  }}
                >
                  <UilMinusCircle size={24} />
                </button>
                <button
                  onMouseDown={() => setIsTemperatureChanging(true)}
                  onMouseUp={() => setIsTemperatureChanging(false)}
                  onMouseLeave={() => setIsTemperatureChanging(false)}
                  onClick={() => {
                    setSelectedSetpoint('single');
                    if (localSetpoint !== null) setThermostatTemperature(localSetpoint + 0.5);
                  }}
                  className="bg-gray-800/60 hover:bg-gray-700/80 active:bg-gray-600 text-white rounded-full p-2 focus:outline-none transition-all duration-150 border border-gray-700/30 hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: selectedSetpoint === 'single' ? `${getModeColor()}30` : undefined,
                    borderColor: selectedSetpoint === 'single' ? `${getModeColor()}50` : undefined
                  }}
                >
                  <UilPlusCircle size={24} />
                </button>
              </div>
            )}
          </div>
          
          {/* Fan & Eco Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3 order-2 sm:order-3">
            {/* Fan Control */}
            <div className="relative">
              <button 
                onClick={() => setFanDropdownOpen(!fanDropdownOpen)} 
                className="group flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors duration-200"
              >
                <UilWind
                  className={`w-5 h-5 sm:w-6 sm:h-6 ${thermostatData?.fanStatus === "ON" ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"}`}
                />
                <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200 hidden sm:inline">Fan</span>
              </button>
              {fanDropdownOpen && (
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
            >
              <UilTrees
                className={`w-5 h-5 sm:w-6 sm:h-6 ${ecoModeActive ? "text-green-400" : "text-gray-500 group-hover:text-gray-300"}`}
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
