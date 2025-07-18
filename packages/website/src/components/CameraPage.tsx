import React, { useState, useEffect, useMemo } from 'react';
import { UilVideo, UilHistory, UilClock } from "@iconscout/react-unicons";
import CameraCard from '../CameraCard';
import CasaCameraCard, { CasaCameraConfig } from '../CasaCameraCard';
import { sortCamerasWithTimeContext } from '../utils/cameraUtils';

export type CameraDevice = {
  name: string;
  type: string;
  traits: any;
  customName?: string;
  parentRelations?: { displayName: string | null }[];
};

interface CameraPageProps {
  cameras: CameraDevice[];
  onExpandCamera: (cameraName: string) => void;
  cameraRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  casaCameraRef: React.MutableRefObject<HTMLDivElement | null>;
  doorbellCameraRef: React.MutableRefObject<HTMLDivElement | null>;
}

const CameraPage: React.FC<CameraPageProps> = ({ 
  cameras, 
  onExpandCamera, 
  cameraRefs, 
  casaCameraRef,
  doorbellCameraRef 
}) => {
  // Track screen size for responsive behavior
  const [isMobile, setIsMobile] = useState(false);

  // Load initial state from localStorage or use defaults
  const [cameraViewMode, setCameraViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === 'undefined') return "grid";
    const saved = localStorage.getItem('manor-camera-view-mode');
    return (saved === 'grid' || saved === 'list') ? saved : "grid";
  });
  
  // State for number of cameras per row (2 default, cycle to 3 and 4)
  const [columns, setColumns] = useState<number>(() => {
    if (typeof window === 'undefined') return 2;
    const saved = localStorage.getItem('manor-camera-columns');
    const parsedColumns = saved ? parseInt(saved, 10) : 2;
    return (parsedColumns >= 2 && parsedColumns <= 4) ? parsedColumns : 2;
  });

  // Camera ordering preference
  const [sortPreference, setSortPreference] = useState<'time-based' | 'alphabetical' | 'custom'>(() => {
    if (typeof window === 'undefined') return 'time-based';
    const saved = localStorage.getItem('manor-camera-sort');
    return (saved === 'time-based' || saved === 'alphabetical' || saved === 'custom') ? saved : 'time-based';
  });

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

  // Handle window resize for responsive behavior with enhanced iOS optimizations
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 640);
      
      // Enhanced iOS-specific optimizations
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        // Force hardware acceleration for smooth scrolling
        document.documentElement.style.setProperty('-webkit-overflow-scrolling', 'touch');
        
        // Optimize viewport height for iOS Safari
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        // Adjust camera grid for better iPhone viewing
        if (width <= 375) { // iPhone mini/SE
          setColumns(2);
        } else if (width <= 414) { // iPhone 13/14 Pro Max
          setColumns(cameraViewMode === 'grid' ? 2 : 1);
        }
      }
    };
    
    if (typeof window !== 'undefined') {
      handleResize(); // Set initial value
      window.addEventListener('resize', handleResize);
      // Add orientation change listener for better iPhone support
      window.addEventListener('orientationchange', () => {
        setTimeout(handleResize, 100); // Delay to ensure proper viewport calculation
      });
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
      };
    }
  }, [cameraViewMode]);

  // Persist view mode to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('manor-camera-view-mode', cameraViewMode);
    }
  }, [cameraViewMode]);

  // Persist column count to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('manor-camera-columns', columns.toString());
    }
  }, [columns]);

  // Persist sort preference to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('manor-camera-sort', sortPreference);
    }
  }, [sortPreference]);

  // Sort cameras based on user preference and time context
  const sortedCameras = useMemo(() => {
    return sortCamerasWithTimeContext(cameras, sortPreference);
  }, [cameras, sortPreference]);

  // Calculate effective columns based on screen size
  const effectiveColumns = useMemo(() => {
    if (cameraViewMode === 'list') return 1;
    return isMobile ? Math.min(columns, 2) : columns;
  }, [columns, cameraViewMode, isMobile]);

  const cycleSortMode = () => {
    setSortPreference(prev => {
      switch (prev) {
        case 'time-based': return 'alphabetical';
        case 'alphabetical': return 'custom';
        case 'custom': return 'time-based';
        default: return 'time-based';
      }
    });
  };

  const getSortIcon = () => {
    switch (sortPreference) {
      case 'time-based': return <UilClock className="text-blue-400" size={20} />;
      case 'alphabetical': return <UilClock className="text-blue-400" size={20} />;
      case 'custom': return <UilVideo className="text-blue-400" size={20} />;
      default: return <UilClock className="text-blue-400" size={20} />;
    }
  };

  const getSortLabel = () => {
    switch (sortPreference) {
      case 'time-based': return 'Time-based';
      case 'alphabetical': return 'Alphabetical';
      case 'custom': return 'Custom';
      default: return 'Time-based';
    }
  };

  if (cameras.length === 0) {
    return (
      <div className="w-full p-8 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black border border-gray-800/40 rounded-xl m-4 h-96">
        <div className="animate-pulse flex flex-col items-center justify-center h-full">
          <div className="relative mb-6">
            <UilVideo size={56} className="text-gray-600" />
            <div className="absolute inset-0 bg-blue-400 blur-xl opacity-10 rounded-full animate-ping-slow"></div>
          </div>
          <p className="text-gray-300 font-medium text-lg mb-2">Loading camera feeds</p>
          <p className="text-gray-500 text-sm mb-6">Please wait while we connect to your cameras</p>
          <div className="w-56 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-teal-400 to-blue-500 animate-gradient-x"
              style={{ width: "60%" }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-page-container w-full overflow-visible pt-2 pb-4 bg-gradient-to-b from-gray-900 to-black safe-area-padding-x">
      {/* Enhanced Header with Better iPhone Optimizations */}
      <div className="mx-2 sm:mx-4 mb-4 flex items-center justify-between bg-black/30 backdrop-blur-md rounded-xl p-3 border border-gray-800/40 shadow-lg safe-area-padding-top">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="bg-gray-800/70 p-2 rounded-lg">
            <UilVideo className="text-blue-400" size={isMobile ? 20 : 22} />
          </div>
          <div>
            <h2 className="text-gray-200 font-medium text-sm sm:text-base">Camera Feeds</h2>
            <p className="text-xs text-gray-400 hidden sm:block">{getSortLabel()} sorting</p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <div className="text-xs text-gray-400 bg-gray-800/60 backdrop-blur-sm px-2.5 sm:px-3 py-1.5 rounded-full border border-gray-700/40 shadow-lg">
            <span className="hidden sm:inline">{cameras.length + 1} cameras online</span>
            <span className="sm:hidden">{cameras.length + 1}</span>
          </div>
          {/* Enhanced Sort Button with Better Touch Targets */}
          <button
            onClick={() => {
              cycleSortMode();
              triggerHaptic('light');
            }}
            className="bg-gray-800/70 hover:bg-gray-700/80 active:bg-gray-600/90 p-2.5 sm:p-3 rounded-lg transition-all duration-200 border border-gray-700/30 touch-manipulation transform active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center shadow-lg hover:shadow-xl"
            aria-label={`Sort mode: ${getSortLabel()}`}
            title={`Current: ${getSortLabel()}. Click to cycle through sorting options.`}
          >
            {getSortIcon()}
          </button>
          {/* Enhanced View Mode Toggle */}
          <button
            onClick={() => {
              setCameraViewMode(prev => prev === "grid" ? "list" : "grid");
              triggerHaptic('light');
            }}
            className="bg-gray-800/70 hover:bg-gray-700/80 active:bg-gray-600/90 p-2.5 sm:p-3 rounded-lg transition-all duration-200 border border-gray-700/30 touch-manipulation transform active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center shadow-lg hover:shadow-xl"
            aria-label={`Switch to ${cameraViewMode === "grid" ? "list" : "grid"} view`}
          >
            {cameraViewMode === "grid" ? (
              <UilVideo className="text-blue-400" size={isMobile ? 18 : 20} />
            ) : (
              <UilVideo className="text-blue-400" size={isMobile ? 18 : 20} />
            )}
          </button>
          {/* Enhanced Columns Button with Better iPhone Touch Targets */}
          <button
            onClick={() => {
              setCameraViewMode('grid');
              setColumns((prev) => (prev === 4 ? 2 : prev + 1));
              triggerHaptic('light');
            }}
            className="bg-gray-800/70 hover:bg-gray-700/80 active:bg-gray-600/90 p-2.5 sm:p-3 rounded-lg transition-all duration-200 border border-gray-700/30 touch-manipulation transform active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center shadow-lg hover:shadow-xl"
            aria-label={`Set columns per row (currently ${columns})`}
            title={`Columns: ${columns}. Click to cycle 2-4 columns.`}
          >
            <span className="text-blue-400 font-medium text-sm">{columns}</span>
          </button>
        </div>
      </div>
      
      {/* Enhanced Camera Grid with Better Touch Interactions */}
      <div
        className="px-2 sm:px-4 grid gap-2 sm:gap-4"
        style={{
          gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))`,
        }}
      >
        {sortedCameras.map((camera) => (
          <div
            key={camera.name}
            onClick={() => {
              onExpandCamera(camera.name);
              triggerHaptic('medium');
            }}
            className={`camera-card relative transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.96] cursor-pointer rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-gray-800/50 hover:ring-blue-500/30 hover:shadow-blue-900/20 group touch-manipulation will-change-transform ${
              cameraViewMode === "list" ? "aspect-video" : ""
            }`}
            style={{
              // Enhanced hardware acceleration for iPhone
              transform: "translateZ(0)",
              WebkitTransform: "translateZ(0)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden"
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-30 group-hover:opacity-60 transition-opacity duration-300 z-10"></div>
            <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 z-20 bg-black/80 backdrop-blur-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium border border-gray-700/60 shadow-xl">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
                <span className="text-xs sm:text-sm text-white font-medium">{camera.customName || camera.parentRelations?.[0]?.displayName || "Camera"}</span>
              </div>
            </div>
            <div className="group h-full">
              <CameraCard camera={camera} ref={(el) => (cameraRefs.current[camera.name] = el)} />
              {/* Enhanced Fullscreen Button with Better Touch Targets */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onExpandCamera(camera.name);
                  triggerHaptic('medium');
                }}
                className="bg-black/70 hover:bg-black/85 active:bg-black/95 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center sm:space-x-2 shadow-xl camera-button touch-manipulation min-w-[44px] sm:min-w-[100px] min-h-[44px]"
                aria-label="Open camera in fullscreen"
              >
                <svg width={isMobile ? 16 : 18} height={isMobile ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
                <span className="font-medium button-text hidden sm:inline ml-2 sm:ml-0">Fullscreen</span>
              </button>
              </div>
            </div>
          </div>
        ))}
        
        {/* Enhanced Casa Camera Card with Better Touch Interactions */}
        <div
          onClick={() => {
            onExpandCamera("CasaCam");
            triggerHaptic('medium');
          }}
          className={`camera-card relative transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.96] cursor-pointer rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-gray-800/50 hover:ring-blue-500/30 hover:shadow-blue-900/20 group touch-manipulation will-change-transform ${
            cameraViewMode === "list" ? "aspect-video" : ""
          }`}
          style={{
            // Enhanced hardware acceleration for iPhone
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-30 group-hover:opacity-60 transition-opacity duration-300 z-10"></div>
          <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 z-20 bg-black/80 backdrop-blur-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium border border-gray-700/60 shadow-xl">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50"></div>
              <span className="text-xs sm:text-sm text-white font-medium">Casa Camera</span>
            </div>
          </div>
          <div className="group h-full">
            <CasaCameraCard 
              ref={casaCameraRef} 
              config={{
                streamId: 'camera_main',
                streamPath: 'live-stream',
                startCommand: 'start_live_stream',
                stopCommand: 'stop_live_stream',
                displayName: 'Casa Camera'
              }}
            />
            {/* Enhanced Casa Camera Control Buttons */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 camera-button-container">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpandCamera("CasaCam");
                  triggerHaptic('medium');
                }}
                className="bg-black/70 hover:bg-black/85 active:bg-black/95 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center sm:space-x-2 shadow-xl camera-button touch-manipulation min-w-[44px] sm:min-w-[100px] min-h-[44px]"
                aria-label="Open Casa Camera in fullscreen"
              >
                <svg width={isMobile ? 16 : 18} height={isMobile ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
                <span className="font-medium button-text hidden sm:inline ml-2 sm:ml-0">Fullscreen</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof window !== "undefined") {
                    triggerHaptic('medium');
                    
                    // Use react-router navigation if available
                    if ((window as any).navigateToCasaHistory) {
                      (window as any).navigateToCasaHistory();
                    } else {
                      window.location.href = "/casa-camera-history";
                    }
                  }
                }}
                className="bg-black/70 hover:bg-black/85 active:bg-black/95 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center sm:space-x-2 shadow-xl camera-button touch-manipulation min-w-[44px] sm:min-w-[100px] min-h-[44px]"
                aria-label="View Casa Camera history"
              >
                <UilHistory size={isMobile ? 16 : 18} />
                <span className="font-medium button-text hidden sm:inline ml-2 sm:ml-0">History</span>
              </button>
            </div>
          </div>
        </div>
        
        {/* Doorbell Camera Card */}
        <div
          onClick={() => {
            onExpandCamera("Doorbell");
            triggerHaptic('medium');
          }}
          className={`camera-card relative transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.96] cursor-pointer rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-gray-800/50 hover:ring-blue-500/30 hover:shadow-blue-900/20 group touch-manipulation will-change-transform ${
            cameraViewMode === "list" ? "aspect-video" : ""
          }`}
          style={{
            transform: "translateZ(0)",
            WebkitTransform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-30 group-hover:opacity-60 transition-opacity duration-300 z-10"></div>
          <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 z-20 bg-black/80 backdrop-blur-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium border border-gray-700/60 shadow-xl">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse shadow-lg shadow-orange-500/50"></div>
              <span className="text-xs sm:text-sm text-white font-medium">Doorbell Camera</span>
            </div>
          </div>
          <div className="group h-full">
            <CasaCameraCard 
              ref={doorbellCameraRef} 
              config={{
                streamId: 'doorbell',
                streamPath: 'doorbell-stream',
                startCommand: 'start_doorbell_stream',
                stopCommand: 'stop_doorbell_stream',
                displayName: 'Doorbell Camera'
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 camera-button-container">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpandCamera("Doorbell");
                  triggerHaptic('medium');
                }}
                className="bg-black/70 hover:bg-black/85 active:bg-black/95 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center justify-center sm:space-x-2 shadow-xl camera-button touch-manipulation min-w-[44px] sm:min-w-[100px] min-h-[44px]"
                aria-label="Open Doorbell Camera in fullscreen"
              >
                <svg width={isMobile ? 16 : 18} height={isMobile ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
                <span className="font-medium button-text hidden sm:inline ml-2 sm:ml-0">Fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraPage;
