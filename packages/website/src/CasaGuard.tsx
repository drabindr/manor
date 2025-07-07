import React, { useState, useEffect, useRef, useContext, Suspense, lazy, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { useMetrics } from './hooks/useMetrics';
import { EventContext, EventProvider } from "./EventContext";
import { wsService } from "./WebSocketService";
import { logger } from "./utils/Logger";
import cameraConnectionService from './services/CameraConnectionService';
import {
  UilHouseUser,
  UilShieldCheck,
  UilLockOpenAlt,
  UilTemperature,
  UilVideo,
  UilLightbulb,
  UilHistory,
} from "@iconscout/react-unicons";
import PullToRefresh from "react-simple-pull-to-refresh";
import "./components/CasaGuard.css";

// Lazy loaded components with optimized loading priorities
const NotificationsProvider = lazy(() => import('./components/NotificationsProvider'));

// PRIORITY 1: Critical above-the-fold components (immediate)
const AppHeader = lazy(() => 
  import('./components/AppHeader').then(module => {
    // Preload Navigation while AppHeader loads
    import('./components/Navigation');
    return module;
  })
);

// PRIORITY 2: Navigation and core UI (within 100ms)
const Navigation = lazy(() => import('./components/Navigation'));

// PRIORITY 3: Main content components (within 500ms)  
const Thermostat = lazy(() => 
  import('./Thermostat').then(module => {
    // Preload DeviceControl while Thermostat loads
    import('./DeviceControl');
    return module;
  })
);
const DeviceControl = lazy(() => import('./DeviceControl'));

// PRIORITY 4: Secondary components (after 1s)
const CameraPage = lazy(() => import('./components/CameraPage'));
const SecurityTab = lazy(() => import('./SecurityTab'));

// PRIORITY 5: Modal/overlay components (on-demand only)
const LoadingOverlay = lazy(() => import('./components/LoadingOverlay'));
const FullscreenCamera = lazy(() => import('./components/FullscreenCamera'));
const HistoryOverlay = lazy(() => import('./components/HistoryOverlay'));

// Optimized prefetching with priority-based loading
const prefetchComponents = () => {
  // Use scheduler.postTask if available for better priority control
  const scheduleByPriority = (fn: () => void, priority: 'user-blocking' | 'user-visible' | 'background' = 'background', delay = 0) => {
    const execute = () => {
      if ('scheduler' in window && (window as any).scheduler?.postTask) {
        (window as any).scheduler.postTask(fn, { priority });
      } else if ('requestIdleCallback' in window) {
        requestIdleCallback(fn, { timeout: 5000 });
      } else {
        setTimeout(fn, delay);
      }
    };
    
    if (delay > 0) {
      setTimeout(execute, delay);
    } else {
      execute();
    }
  };

  // PRIORITY 1: Critical components (user-blocking priority)
  scheduleByPriority(() => {
    import('./components/Navigation');
    import('./components/AppHeader');
  }, 'user-blocking', 0);

  // PRIORITY 2: Main content (user-visible priority) 
  scheduleByPriority(() => {
    import('./Thermostat');
    import('./DeviceControl');
  }, 'user-visible', 100);

  // PRIORITY 3: Secondary content (background priority)
  scheduleByPriority(() => {
    import('./SecurityTab');
    import('./components/CameraPage');
  }, 'background', 500);

  // PRIORITY 4: Utility components (background, low priority)
  scheduleByPriority(() => {
    import('./components/LoadingOverlay');
    import('./components/FullscreenCamera');
    import('./components/HistoryOverlay');
    import('./components/NotificationsProvider');
  }, 'background', 1000);
};

// Locally load only the types
import type { CameraDevice } from './components/CameraPage';

// Types
type ArmMode = "stay" | "away" | null;

// Main component
const CasaGuard: React.FC = () => {
  // Initialize metrics tracking
  const { trackLoadStart, trackLoadEnd, trackApiCall, trackInteraction } = useMetrics('CasaGuard');

  // Enhanced iPhone haptic feedback helper
  const triggerHaptic = useCallback((intensity: 'light' | 'medium' | 'heavy' = 'medium') => {
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
  }, []);

  // State management
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [armMode, setArmMode] = useState<ArmMode>(null);
  const [thermoData, setThermoData] = useState<{ currentTemp: number | null }>({
    currentTemp: null,
  });
  const [isThermostatLoaded, setIsThermostatLoaded] = useState(false);
  const [expandedCameraName, setExpandedCameraName] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("thermostat");
  const [refreshing, setRefreshing] = useState(false);
  const [cameraViewMode, setCameraViewMode] = useState<"grid" | "list">("grid");
  const [notifications, setNotifications] = useState<
    { message: string; type: string; id: number; command?: string }[]
  >([]);
  // New state for pull-to-refresh active state
  const [isPullActive, setIsPullActive] = useState(false);

  // Get homeId from EventContext
  const { homeId } = useContext(EventContext);

  // Refs
  const cameraRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const casaCameraRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalParentRef = useRef<ParentNode | null>(null);
  const originalNextSiblingRef = useRef<Node | null>(null);
  const thermostatRefreshKey = useRef(0);
  const deviceControlRefreshKey = useRef(0);
  const eventHistoryRef = useRef<any>(null);

  // Container height for iOS Safari with improved calculation
  const [containerHeight, setContainerHeight] = useState("calc(100vh - 122px)");

  // Enhanced notification function that handles replacing "awaiting" notifications
  const showNotification = useCallback((message: string, type: string, command?: string) => {
    const id = Date.now();
    
    setNotifications((prev) => {
      // If this is a success message and we have a command
      if (type === "success" && command) {
        // Remove any "awaiting result" or "processing" notifications for the same command
        const filtered = prev.filter(n => 
          !(n.command === command && 
            (n.message.includes("sent to system") || 
             n.message.includes("processing") ||
             n.message.includes("queued")))
        );
        return [...filtered, { message, type, id, command }];
      } else {
        // For non-success messages, just add them
        return [...prev, { message, type, id, command }];
      }
    });
    
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  // AlarmControls props
  const alarmControlsProps = useMemo(() => ({
    armMode,
    setArmMode,
    isOnline,
    setIsOnline,
    showNotification,
    refreshing,
    // Add reference to eventHistoryRef to refresh event logs after alarm control changes
    onAlarmStateChange: () => {
      if (eventHistoryRef.current) {
        logger.debug("Refreshing event history after alarm state change");
        eventHistoryRef.current.refresh();
      }
    }
  }), [armMode, setArmMode, isOnline, setIsOnline, showNotification, refreshing]);

  // Improved iOS Safari optimizations
  useEffect(() => {
    const ua = window.navigator.userAgent;
    const isIOS = /iP(hone|od|ad)/.test(ua);
    
    if (isIOS) {
      // Optimize height calculation for iOS
      const setIOSSafeContainerHeight = () => {
        // Use iOS-specific viewport height calculations
        setContainerHeight("calc(var(--vh, 1vh) * 100 - 130px)");
      };
      
      // Set custom viewport height variable
      const setVhVariable = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        setIOSSafeContainerHeight();
      };
      
      // Apply smooth scrolling optimizations for iOS
      document.documentElement.classList.add('ios-optimized');
      
      setVhVariable();
      window.addEventListener('resize', setVhVariable);
      
      // Hide iOS home indicator to optimize space
      const hideIOSHomeIndicator = () => {
        if ("standalone" in window.navigator && !(window.navigator as any).standalone) {
          document.documentElement.style.setProperty("--safe-area-inset-bottom", "0px");
        }
      };
      
      hideIOSHomeIndicator();
      window.addEventListener("resize", hideIOSHomeIndicator);
      
      return () => {
        window.removeEventListener("resize", hideIOSHomeIndicator);
        window.removeEventListener("resize", setVhVariable);
        document.documentElement.classList.remove('ios-optimized');
      };
    }
  }, []);

  // Data Fetching
  const fetchCameras = useCallback(async () => {
    try {
      setRefreshing(true);
      const response = await fetch(
        "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/google/devices/list"
      );
      if (response.status === 401) {
        window.location.href =
          "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/google/auth/initiate";
        return;
      }
      const data = await response.json();
      const devices = data || [];
      const cameraDevices = devices.filter(
        (device: any) =>
          (device.type === "sdm.devices.types.CAMERA" ||
            device.type === "sdm.devices.types.DOORBELL" ||
            device.type === "sdm.devices.types.DISPLAY") &&
          device.traits?.["sdm.devices.traits.CameraLiveStream"]?.supportedProtocols?.includes(
            "WEB_RTC"
          )
      );
      setCameras(cameraDevices);
      setRefreshing(false);
    } catch (error) {
      logger.error("Error fetching cameras:", error);
      setRefreshing(false);
    }
  }, []);

  const fetchThermostatMinimal = useCallback(async () => {
    try {
      setRefreshing(true);
      const response = await fetch(
        "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/google/thermostat/get",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Remove deviceId from shorthand syntax since it's not defined
          body: JSON.stringify({ data: {} }),
        }
      );
      if (response.status === 401) {
        window.location.href =
          "https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod/google/auth/initiate";
        return;
      }
      const data = await response.json();
      const currentTemperature =
        data.traits?.["sdm.devices.traits.Temperature"]?.ambientTemperatureCelsius ?? null;
      setThermoData({ currentTemp: currentTemperature });
      setIsThermostatLoaded(true);
      setRefreshing(false);
    } catch (error) {
      logger.error("Error fetching thermostat data:", error);
      setIsThermostatLoaded(true);
      setRefreshing(false);
    }
  }, []);

  // Fetch alarm state using WebSocket service
  const fetchAlarmState = useCallback(() => {
    try {
      setRefreshing(true);
      // Get current alarm state from WebSocket service
      const currentMode = wsService.getCurrentMode();
      
      if (currentMode) {
        updateArmModeFromState(currentMode);
      } else {
        // If no state is available, request system state
        wsService.sendCommand("GetSystemState");
      }
      
      setRefreshing(false);
    } catch (error) {
      logger.error("Error fetching alarm state:", error);
      setRefreshing(false);
    }
  }, []);

  // Helper function to update arm mode state based on alarm state string
  const updateArmModeFromState = useCallback((alarmState: string) => {
    if (alarmState?.includes("(auto)")) {
      setArmMode(
        alarmState.toLowerCase().includes("arm") && !alarmState.toLowerCase().includes("disarm")
          ? "stay"
          : null
      );
    } else if (alarmState === "Arm Stay") setArmMode("stay");
    else if (alarmState === "Arm Away") setArmMode("away");
    else setArmMode(null);
    
    // After updating arm mode, refresh event history
    if (eventHistoryRef.current) {
      logger.debug("Refreshing event history after arm mode update");
      eventHistoryRef.current.refresh();
    }
  }, []);

  // WebSocket event listener for system state updates
  useEffect(() => {
    const handleWebSocketEvent = (event: CustomEvent<any>) => {
      const { type, data } = event.detail;
      
      // Update connection status
      if (type === "connected") {
        setIsOnline(true);
      } else if (type === "disconnected" || type === "connection_failed_permanently") {
        setIsOnline(false);
      }
      
      // Update alarm state when we get system_state events
      if (type === "system_state" && data && data.state) {
        updateArmModeFromState(data.state);
      }
      
      // Refresh event logs when a command is acknowledged
      if (type === "command_ack" && data && data.success) {
        if (eventHistoryRef.current) {
          logger.debug("Refreshing event history after command_ack");
          setTimeout(() => eventHistoryRef.current.refresh(), 1500); // Add delay to let system update
        }
      }
    };

    wsService.on("event", handleWebSocketEvent as any);
    
    // Set initial online status
    setIsOnline(wsService.isOnline());
    
    return () => {
      wsService.off("event", handleWebSocketEvent as any);
    };
  }, [updateArmModeFromState]);

  // Initial Data Fetching with Camera Connection Service
  useEffect(() => {
    const fetchAllData = async () => {
      // Ensure camera connection service is initialized early
      // This will start establishing connections in parallel with data fetching
      // Use timeout to prevent blocking the main data fetch
      Promise.race([
        cameraConnectionService.init(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Camera service init timeout')), 10000)
        )
      ]).catch(error => {
        logger.warn('[CasaGuard] Camera connection service initialization failed:', error);
      });
      
      await Promise.all([fetchCameras(), fetchThermostatMinimal()]);
      fetchAlarmState(); // This doesn't need to be awaited as it uses the WebSocket
      
      // Start background prefetching of components after initial load
      prefetchComponents();
    };
    fetchAllData();
  }, [fetchCameras, fetchThermostatMinimal, fetchAlarmState]);

  // Improved Pull-to-Refresh handling
  const onPullStart = useCallback(() => {
    setIsPullActive(true);
  }, []);
  
  const onPullStop = useCallback(() => {
    setIsPullActive(false);
  }, []);

  // Enhanced Pull-to-Refresh with better state tracking
  const onGlobalRefresh = useCallback(async () => {
    if (refreshing) return Promise.resolve();
    
    // Track that refresh has started
    setRefreshing(true);
    setIsThermostatLoaded(false);
    
    try {
      // Use Promise.all to fetch data in parallel
      await Promise.all([fetchCameras(), fetchThermostatMinimal()]);
      
      // Update alarm state through WebSocket
      fetchAlarmState();
      
      // Increment refresh keys and refresh history
      thermostatRefreshKey.current += 1;
      deviceControlRefreshKey.current += 1;
      
      if (eventHistoryRef.current) {
        await eventHistoryRef.current.refresh();
      }
      
      // Ensure UI updates are complete before resolving
      return new Promise(resolve => {
        // Small delay to ensure smooth visual transition
        setTimeout(() => {
          setRefreshing(false);
          resolve(true);
        }, 300);
      });
    } catch (error) {
      logger.error("Error during refresh:", error);
      setRefreshing(false);
      return Promise.reject(error);
    }
  }, [refreshing, fetchCameras, fetchThermostatMinimal, fetchAlarmState]);

  // Add navigation function for Casa Camera history
  useEffect(() => {
    // Make the navigation function available globally
    (window as any).navigateToCasaHistory = () => {
      // Open the history overlay instead of navigating to a new page
      setIsHistoryOpen(true);
    };
    
    return () => {
      // Clean up the global function when component unmounts
      delete (window as any).navigateToCasaHistory;
    };
  }, []);

  // Fullscreen Camera Logic
  let fullscreenElement: HTMLDivElement | null = null;
  if (expandedCameraName) {
    fullscreenElement =
      expandedCameraName === "CasaCam"
        ? casaCameraRef.current
        : cameraRefs.current[expandedCameraName] || null;
  }

  useEffect(() => {
    if (!expandedCameraName) return;
    const el =
      expandedCameraName === "CasaCam"
        ? casaCameraRef.current
        : cameraRefs.current[expandedCameraName];
    if (!el) return;
    const fullscreenContainer = document.getElementById("fullscreen-camera-container");
    if (!fullscreenContainer) return;
    originalParentRef.current = el.parentNode;
    originalNextSiblingRef.current = el.nextSibling;
    fullscreenContainer.appendChild(el);
    return () => {
      if (originalParentRef.current) {
        originalParentRef.current.insertBefore(el, originalNextSiblingRef.current);
      }
      originalParentRef.current = null;
      originalNextSiblingRef.current = null;
    };
  }, [expandedCameraName, cameras]);

  // Explicitly create a non-memoized version of setExpandedCameraName for passing to CameraPage
  // This is needed because the memoization was preventing proper updates when clicking on cameras
  const handleExpandCamera = (cameraName: string) => {
    setExpandedCameraName(cameraName);
  };

  // Handle closing the history overlay
  const handleCloseHistory = useCallback(() => {
    setIsHistoryOpen(false);
  }, []);

  // Create memoized tab components to prevent re-rendering when switching tabs
  const tabComponents = useMemo(() => ({
    thermostat: <Thermostat key="thermostat-component" />,
    cameras: (
      <CameraPage 
        cameras={cameras}
        onExpandCamera={handleExpandCamera} // Use the non-memoized function here
        cameraRefs={cameraRefs}
        casaCameraRef={casaCameraRef}
      />
    ),
    devices: <DeviceControl key="devices-component" />,
    security: <SecurityTab ref={eventHistoryRef} />,
  }), [cameras]); // Remove setExpandedCameraName from the dependency array

  // Tab configuration - fixed order (no time-based logic)
  const tabs = useMemo(() => [
    { id: "thermostat", label: "Climate", icon: (props: { size?: number; className?: string }) => <UilTemperature size={props.size} className={props.className} /> },
    { id: "cameras", label: "Cameras", icon: (props: { size?: number; className?: string }) => <UilVideo size={props.size} className={props.className} /> },
    { id: "devices", label: "Devices", icon: (props: { size?: number; className?: string }) => <UilLightbulb size={props.size} className={props.className} /> },
    { id: "security", label: "Security", icon: (props: { size?: number; className?: string }) => <UilShieldCheck size={props.size} className={props.className} /> },
  ], []);

  // Scroll to top on tab change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeTab]);

  // Handle manual refresh of specific components
  const handleRefresh = useCallback((tabId: string) => {
    if (tabId === 'thermostat') {
      thermostatRefreshKey.current += 1;
    } else if (tabId === 'devices') {
      deviceControlRefreshKey.current += 1;
    } else if (tabId === 'security' && eventHistoryRef.current) {
      eventHistoryRef.current.refresh();
    }
  }, []);

  // Tab-specific pull-to-refresh that refreshes current tab first, then others in background
  const handleTabPullToRefresh = useCallback(async (tabId: string) => {
    if (refreshing) return Promise.resolve();
    
    logger.debug(`Pull-to-refresh triggered for tab: ${tabId}`);
    setRefreshing(true);
    
    try {
      // First: Refresh the current active tab's widgets immediately
      if (tabId === 'thermostat') {
        await fetchThermostatMinimal();
        thermostatRefreshKey.current += 1;
      } else if (tabId === 'cameras') {
        await fetchCameras();
      } else if (tabId === 'devices') {
        deviceControlRefreshKey.current += 1;
      } else if (tabId === 'security' && eventHistoryRef.current) {
        await eventHistoryRef.current.refresh();
      }
      
      // Second: Refresh other tabs in the background (don't await these)
      const backgroundRefreshPromises: Promise<any>[] = [];
      
      if (tabId !== 'thermostat') {
        backgroundRefreshPromises.push(
          fetchThermostatMinimal().then(() => {
            thermostatRefreshKey.current += 1;
          })
        );
      }
      
      if (tabId !== 'cameras') {
        backgroundRefreshPromises.push(fetchCameras());
      }
      
      if (tabId !== 'devices') {
        backgroundRefreshPromises.push(
          Promise.resolve().then(() => {
            deviceControlRefreshKey.current += 1;
          })
        );
      }
      
      if (tabId !== 'security' && eventHistoryRef.current) {
        backgroundRefreshPromises.push(eventHistoryRef.current.refresh());
      }
      
      // Always refresh alarm state
      fetchAlarmState();
      
      // Start background refreshes but don't wait for them
      Promise.all(backgroundRefreshPromises).catch(error => {
        logger.error("Error during background refresh:", error);
      });
      
      // Ensure UI updates are complete before resolving
      return new Promise(resolve => {
        setTimeout(() => {
          setRefreshing(false);
          resolve(true);
        }, 300);
      });
    } catch (error) {
      logger.error(`Error during tab refresh for ${tabId}:`, error);
      setRefreshing(false);
      return Promise.reject(error);
    }
  }, [refreshing, fetchCameras, fetchThermostatMinimal, fetchAlarmState]);

  // Improved handling of tab changes to prevent unnecessary renders with haptic feedback
  const handleSetActiveTab = useCallback((tabId: string) => {
    // Only update if tab is changing
    if (activeTab !== tabId) {
      setActiveTab(tabId);
      triggerHaptic('light'); // Add haptic feedback for tab changes
    }
  }, [activeTab, triggerHaptic]);

  const handleCloseExpandedCamera = useCallback(() => {
    setExpandedCameraName(null);
  }, []);

  return (
    <Suspense fallback={<LoadingFallback />}>
      <NotificationsProvider>
        <EventProvider>
          {armMode !== null && (
            <div className="pointer-events-none fixed inset-0 z-[9999] border-4 security-border rounded-2xl m-1" />
          )}
          
          <div
            className="min-h-screen w-full flex flex-col text-white relative ios-optimized bg-gray-950" // Base background for the new theme
            style={{
              paddingTop: "calc(5rem + env(safe-area-inset-top) + 1.25rem)",
              height: "100vh",
              position: "fixed",
              width: "100%",
              overflow: "hidden"
            }}
          >
            {/* Removed previous circuit board background */}
            {/* Added new Hexagon background from bgvault.tech */}
            <div className="absolute inset-0 -z-10">
              {/* SVG Hexagon Pattern Layer */}
              <div className="absolute inset-0 opacity-[0.15]">
                <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="hexagons" width="50" height="43.4" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
                      <path 
                        d="M25 0 L50 14.4 L50 38.4 L25 51.8 L0 38.4 L0 14.4 Z" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="1"
                        className="text-blue-400/30"
                      />
                      {/* Note: The second path in the original HTML seemed malformed/duplicated, using only the first */}
                    </pattern>
                    {/* Note: The linearGradient in the original HTML seemed malformed, omitting it for now */}
                  </defs>
                  <rect width="100%" height="100%" fill="url(#hexagons)" />
                  {/* <rect width="100%" height="100%" fill="url(#hex-gradient)" /> */}
                </svg>
              </div>
              
              {/* Gradient Overlays */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.1),transparent_60%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.1),transparent_60%)]" />
            </div>
            
            <AppHeader 
              armMode={armMode}
              setArmMode={setArmMode}
              isOnline={isOnline}
              setIsOnline={setIsOnline}
              refreshing={refreshing}
              onAlarmStateChange={() => {
                if (eventHistoryRef.current) {
                  logger.debug("Refreshing event history from AppHeader");
                  eventHistoryRef.current.refresh();
                }
              }}
            />
                        
              <div
                ref={containerRef}
                className="flex flex-col overflow-y-auto tab-content relative"
                style={{
                  height: "calc(100vh - 5rem - env(safe-area-inset-top) - 1.25rem - var(--bottom-nav-height) - env(safe-area-inset-bottom))",
                  WebkitOverflowScrolling: "touch",
                  transform: "translate3d(0,0,0)",
                  willChange: "transform",
                  paddingBottom: "2rem"
                }}
              >
                {/* Render all tabs but only show the active one */}
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={
                      activeTab === tab.id
                        ? `${tab.id === "cameras" || tab.id === "security" || tab.id === "devices"
                            ? "px-0 py-0 camera-content"
                            : "px-4 py-3"}`
                        : "hidden-tab"
                    }
                    style={{
                      // Only apply transforms to the active tab to reduce painting
                      transform: activeTab === tab.id ? "translate3d(0,0,0)" : "none",
                      willChange: activeTab === tab.id ? "transform" : "auto"
                    }}
                    aria-hidden={activeTab !== tab.id}
                  >
                    <PullToRefresh
                      onRefresh={() => handleTabPullToRefresh(tab.id)}
                      pullDownThreshold={67}
                      maxPullDownDistance={95}
                      refreshingContent={
                        <div className="flex justify-center items-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-yellow-400"></div>
                        </div>
                      }
                      pullingContent={
                        <div className="flex justify-center items-center py-2">
                          <div className="text-gray-400 text-sm">Pull to refresh {tab.label.toLowerCase()}...</div>
                        </div>
                      }
                    >
                      <Suspense fallback={<TabLoadingFallback />}>
                        {/* Use memoized tab components instead of dynamically loading each time */}
                        {tabComponents[tab.id as keyof typeof tabComponents]}
                      </Suspense>
                    </PullToRefresh>
                  </div>
                ))}
              </div>
            
            <LoadingOverlay isLoading={!isThermostatLoaded} />
            
            <Navigation 
              tabs={tabs}
              activeTab={activeTab}
              setActiveTab={handleSetActiveTab}
            />
          </div>
          
          <FullscreenCamera 
            expandedCameraName={expandedCameraName}
            onClose={handleCloseExpandedCamera}
            cameras={cameras}
            fullscreenElement={fullscreenElement}
          />

          <HistoryOverlay 
            isOpen={isHistoryOpen}
            onClose={handleCloseHistory}
          />
        </EventProvider>
      </NotificationsProvider>
    </Suspense>
  );
};

// Simple loading fallbacks - consistent with MANOR branding
const LoadingFallback = React.memo(() => (
  <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
    <div className="relative mb-6">
      <div 
        className="w-20 h-20 rounded-full border-4 border-gray-800 flex items-center justify-center"
        style={{ 
          willChange: 'transform',
          transform: 'translateZ(0)'
        }}
      >
        <div 
          className="absolute inset-0 rounded-full border-t-4 border-yellow-500 animate-spin"
          style={{ willChange: 'transform' }}
        ></div>
        <div
          className="absolute inset-2 rounded-full border-t-3 border-yellow-400 animate-spin"
          style={{ 
            animationDuration: "1.5s",
            animationDirection: "reverse",
            willChange: 'transform' 
          }}
        ></div>
        <div className="relative z-10 flex items-center justify-center">
          <img 
            src="/logo2.png" 
            alt="MANOR logo" 
            className="w-12 h-12 object-contain"
          />
        </div>
      </div>
    </div>
    <div className="text-yellow-400 text-2xl font-bold tracking-wider uppercase">MANOR</div>
  </div>
));

const TabLoadingFallback = React.memo(() => (
  <div className="w-full h-64 flex flex-col items-center justify-center">
    <div className="relative mb-4">
      <div 
        className="w-12 h-12 rounded-full border-3 border-gray-800 flex items-center justify-center"
        style={{ 
          willChange: 'transform',
          transform: 'translateZ(0)'
        }}
      >
        <div 
          className="absolute inset-0 rounded-full border-t-3 border-yellow-500 animate-spin"
          style={{ willChange: 'transform' }}
        ></div>
        <div
          className="absolute inset-1 rounded-full border-t-2 border-yellow-400 animate-spin"
          style={{ 
            animationDuration: "1.5s",
            animationDirection: "reverse",
            willChange: 'transform' 
          }}
        ></div>
        <div className="relative z-10 flex items-center justify-center">
          <img 
            src="/logo2.png" 
            alt="MANOR logo" 
            className="w-6 h-6 object-contain"
          />
        </div>
      </div>
    </div>
    <div className="text-yellow-400 text-lg font-bold tracking-wider uppercase">MANOR</div>
  </div>
));

export default CasaGuard;
