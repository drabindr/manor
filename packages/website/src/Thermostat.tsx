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
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [fanDropdownOpen, setFanDropdownOpen] = useState(false);
  const [airthingsData, setAirthingsData] = useState<AirthingsData | null>(null);
  const [isTemperatureChanging, setIsTemperatureChanging] = useState(false);
  const [ecoModeActive, setEcoModeActive] = useState(false);

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
   * Keep local setpoint in sync with fetched data
   */
  useEffect(() => {
    if (thermostatData?.setpoint !== undefined && thermostatData.setpoint !== null) {
      setLocalSetpoint(thermostatData.setpoint);
    }
  }, [thermostatData?.setpoint]);

  /**
   * Handler to set the thermostat temperature
   */
  const setThermostatTemperature = (newSetpoint: number) => {
    console.log("Setting new setpoint to:", newSetpoint);
    setLocalSetpoint(newSetpoint);
  };

  /**
   * Handler to change the thermostat mode
   */
  const changeThermostatMode = (newMode: string) => {
    console.log("Changing thermostat mode to", newMode);
    setModeDropdownOpen(false);
  };

  /**
   * Toggle eco mode
   */
  const toggleEcoMode = () => {
    console.log("Toggling eco mode");
    setEcoModeActive(!ecoModeActive);
  };

  /**
   * Toggle fan for a specified duration
   */
  const toggleFan = (duration: number) => {
    console.log("Toggling fan with duration", duration, "seconds");
    setFanDropdownOpen(false);
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
  const setpointTemp = localSetpoint !== null ? localSetpoint : 20;
  const setpointAngle = ((setpointTemp - minTemp) / (maxTemp - minTemp)) * 270 - 135;
  const setpointRad = (setpointAngle * Math.PI) / 180;
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
      const isSetpoint = t === Math.round(setpointTemp);
      const tickLength = isLongTick ? 12 : isSetpoint ? 14 : 6;
      
      // Determine color based on active mode and tick position
      let tickColor = "#888";
      if (isSetpoint) {
        if (thermostatData?.mode === "HEAT") {
          tickColor = "#FF5500";
        } else if (thermostatData?.mode === "COOL") {
          tickColor = "#00A0FF";
        } else if (thermostatData?.mode === "HEATCOOL") {
          tickColor = "#4DDF4D";
        }
      } else if (isLongTick) {
        tickColor = "#AAA";
      }
      
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
  }, [minTemp, maxTemp, setpointTemp, thermostatData?.mode]);

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
  const progressPath = arcPath(radiusTicks - 3, progressStartAngle, setpointAngle);

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
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="transform transition-transform duration-300 scale-95">
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
            
            {/* Tick marks */}
            {ticks}
            
            {/* Temperature needle */}
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
          
          {/* Inner Text (Current Temp, Humidity) */}
          <div
            className="absolute flex flex-col items-center justify-center text-white"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="text-5xl font-light tracking-tight">
              {localSetpoint !== null ? Math.round(localSetpoint) : "--"}°
            </div>
            {thermostatData && (
              <div className="text-sm mt-1 text-gray-300 opacity-80">
                Current: {thermostatData.currentTemperature.toFixed(1)}°C
              </div>
            )}
            <div className="text-sm text-blue-400 flex items-center mt-2 space-x-1">
              <UilRaindrops size={16} className="opacity-80" />
              <span className="opacity-90">{thermostatData?.humidity || '--'}%</span>
            </div>
          </div>
        </div>
        
        {/* Controls Container */}
        <div className="flex items-center justify-between px-6 py-3 bg-black/40 border-t border-gray-800/50 backdrop-blur-sm">
          {/* Enhanced Mode Control with iPhone optimizations */}
          <div className="relative">
            <button 
              onClick={() => {
                setModeDropdownOpen(!modeDropdownOpen);
                triggerHaptic('light');
              }}
              className="group flex items-center space-x-2 px-4 py-3 rounded-lg 
                         hover:bg-gray-800/50 active:bg-gray-700/60 
                         transition-all duration-200 ease-in-out touch-manipulation
                         border border-gray-700/30 backdrop-blur-sm
                         min-h-[48px] min-w-[80px]"
              style={{ 
                WebkitTapHighlightColor: 'transparent',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden'
              }}
            >
              <span className={`transition-colors duration-200 drop-shadow-sm`} style={{ color: getModeColor() }}>
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
              <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200 font-medium">Mode</span>
            </button>
            {modeDropdownOpen && (
              <div className="absolute bottom-full mb-2 bg-gray-800/95 backdrop-blur-md rounded-xl shadow-2xl z-20 border border-gray-700/50 w-40 overflow-hidden">
                {["HEAT", "COOL", "HEATCOOL", "OFF"].map((modeOption) => (
                  <button
                    key={modeOption}
                    onClick={() => {
                      changeThermostatMode(modeOption);
                      triggerHaptic('medium');
                    }}
                    className={`block w-full text-left px-4 py-3.5 text-sm 
                               hover:bg-gray-700/60 active:bg-gray-600/60 
                               transition-all duration-200 ease-in-out touch-manipulation
                               ${thermostatData?.mode === modeOption ? "bg-gray-700/50" : ""} 
                               ${modeOption === "HEAT" ? "text-red-400" : ""} 
                               ${modeOption === "COOL" ? "text-blue-400" : ""}
                               ${modeOption === "HEATCOOL" ? "text-green-400" : ""}
                               ${modeOption === "OFF" ? "text-gray-400" : ""}`}
                    style={{ 
                      WebkitTapHighlightColor: 'transparent',
                      minHeight: '48px'
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      {modeOption === "HEAT" && <UilFire size={16} />}
                      {modeOption === "COOL" && <UilSnowflake size={16} />}
                      {modeOption === "HEATCOOL" && (
                        <div className="flex space-x-0.5">
                          <UilFire size={14} className="text-red-400" />
                          <UilSnowflake size={14} className="text-blue-400" />
                        </div>
                      )}
                      {modeOption === "OFF" && <UilCircle size={16} />}
                      <span className="font-medium">{modeOption === "HEATCOOL" ? "Auto" : modeOption.charAt(0) + modeOption.slice(1).toLowerCase()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Enhanced Temperature Controls with iPhone optimizations */}
          <div className="flex space-x-3">
            <button
              onMouseDown={() => setIsTemperatureChanging(true)}
              onMouseUp={() => setIsTemperatureChanging(false)}
              onMouseLeave={() => setIsTemperatureChanging(false)}
              onTouchStart={() => {
                setIsTemperatureChanging(true);
                triggerHaptic('light');
              }}
              onTouchEnd={() => setIsTemperatureChanging(false)}
              onClick={() => {
                if (localSetpoint !== null) {
                  setThermostatTemperature(localSetpoint - 0.5);
                  triggerHaptic('medium');
                }
              }}
              className="bg-gradient-to-br from-gray-800/70 via-gray-700/80 to-gray-800/70 
                         hover:from-gray-700/90 hover:via-gray-600/90 hover:to-gray-700/90 
                         active:from-gray-900/90 active:via-gray-800/90 active:to-gray-900/90
                         text-white rounded-full p-3 focus:outline-none 
                         transition-all duration-200 ease-in-out
                         border border-gray-600/40 shadow-lg hover:shadow-xl 
                         active:scale-95 touch-manipulation 
                         min-h-[52px] min-w-[52px] flex items-center justify-center
                         backdrop-blur-sm"
              style={{ 
                WebkitTapHighlightColor: 'transparent',
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                willChange: 'transform, box-shadow'
              }}
            >
              <UilMinusCircle size={26} className="drop-shadow-sm" />
            </button>
            <button
              onMouseDown={() => setIsTemperatureChanging(true)}
              onMouseUp={() => setIsTemperatureChanging(false)}
              onMouseLeave={() => setIsTemperatureChanging(false)}
              onTouchStart={() => {
                setIsTemperatureChanging(true);
                triggerHaptic('light');
              }}
              onTouchEnd={() => setIsTemperatureChanging(false)}
              onClick={() => {
                if (localSetpoint !== null) {
                  setThermostatTemperature(localSetpoint + 0.5);
                  triggerHaptic('medium');
                }
              }}
              className="bg-gradient-to-br from-gray-800/70 via-gray-700/80 to-gray-800/70 
                         hover:from-gray-700/90 hover:via-gray-600/90 hover:to-gray-700/90 
                         active:from-gray-900/90 active:via-gray-800/90 active:to-gray-900/90
                         text-white rounded-full p-3 focus:outline-none 
                         transition-all duration-200 ease-in-out
                         border border-gray-600/40 shadow-lg hover:shadow-xl 
                         active:scale-95 touch-manipulation 
                         min-h-[52px] min-w-[52px] flex items-center justify-center
                         backdrop-blur-sm"
              style={{ 
                WebkitTapHighlightColor: 'transparent',
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                willChange: 'transform, box-shadow'
              }}
            >
              <UilPlusCircle size={26} className="drop-shadow-sm" />
            </button>
          </div>
          
          {/* Enhanced Fan & Eco Controls with iPhone optimizations */}
          <div className="flex items-center space-x-3">
            {/* Enhanced Fan Control */}
            <div className="relative">
              <button 
                onClick={() => {
                  setFanDropdownOpen(!fanDropdownOpen);
                  triggerHaptic('light');
                }}
                className="group flex items-center space-x-2 px-4 py-3 rounded-lg 
                           hover:bg-gray-800/50 active:bg-gray-700/60 
                           transition-all duration-200 ease-in-out touch-manipulation
                           border border-gray-700/30 backdrop-blur-sm
                           min-h-[48px] min-w-[80px]"
                style={{ 
                  WebkitTapHighlightColor: 'transparent',
                  transform: 'translateZ(0)',
                  backfaceVisibility: 'hidden'
                }}
              >
                <UilWind
                  className={thermostatData?.fanStatus === "ON" ? "text-blue-400 drop-shadow-sm" : "text-gray-500 group-hover:text-gray-300 drop-shadow-sm"}
                  size={22}
                />
                <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200 font-medium">Fan</span>
              </button>
              {fanDropdownOpen && (
                <div className="absolute bottom-full mb-2 right-0 bg-gray-800/95 backdrop-blur-md rounded-xl shadow-2xl z-20 border border-gray-700/50 w-36 overflow-hidden">
                  {[15, 30, 60].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={() => {
                        toggleFan(minutes * 60);
                        triggerHaptic('medium');
                      }}
                      className="block w-full text-left px-4 py-3.5 text-sm 
                                 hover:bg-gray-700/60 active:bg-gray-600/60 
                                 transition-all duration-200 ease-in-out touch-manipulation"
                      style={{ 
                        WebkitTapHighlightColor: 'transparent',
                        minHeight: '48px'
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <UilWind size={16} className="text-blue-400" />
                        <span className="font-medium">{minutes} min</span>
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      toggleFan(0);
                      triggerHaptic('medium');
                    }}
                    className="block w-full text-left px-4 py-3.5 text-sm 
                               hover:bg-gray-700/60 active:bg-gray-600/60 
                               transition-all duration-200 ease-in-out touch-manipulation"
                    style={{ 
                      WebkitTapHighlightColor: 'transparent',
                      minHeight: '48px'
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <UilWind size={16} className="text-gray-400" />
                      <span className="font-medium">Off</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
            
            {/* Enhanced Eco Mode Toggle */}
            <button 
              onClick={() => {
                toggleEcoMode();
                triggerHaptic('medium');
              }}
              className={`group flex items-center space-x-2 px-4 py-3 rounded-lg 
                         hover:bg-gray-800/50 active:bg-gray-700/60 
                         transition-all duration-200 ease-in-out touch-manipulation
                         border border-gray-700/30 backdrop-blur-sm
                         min-h-[48px] min-w-[80px]`}
              style={{ 
                WebkitTapHighlightColor: 'transparent',
                transform: 'translateZ(0)',
                backfaceVisibility: 'hidden'
              }}
            >
              <UilTrees
                className={ecoModeActive ? "text-green-400 drop-shadow-sm" : "text-gray-500 group-hover:text-gray-300 drop-shadow-sm"}
                size={22}
              />
              <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors duration-200 font-medium">Eco</span>
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