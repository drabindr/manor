import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MediaPlayer,
  MediaProvider,
  MediaPlayerInstance,
  useMediaRemote,
} from '@vidstack/react';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
// import './VideoPlayer.css'; // Make sure your CSS file is imported if needed
import './VideoPlayer.landscape.css'; // Import landscape-specific styles
import { FaCalendarAlt, FaArrowLeft, FaVolumeUp, FaVolumeMute, FaStepBackward, FaStepForward, FaRedo, FaMoon, FaSun } from 'react-icons/fa';
import { logger } from './utils/Logger';

// --- Configuration ---
const API_BASE_URL = 'https://192.168.86.81'; // HTTPS on port 443
// Pickering, Ontario coordinates
const PICKERING_LAT = 43.8191724;
const PICKERING_LONG = -79.0896744;

// --- Helper Functions ---

// Function to fetch sunrise/sunset data for a specific date
const fetchSunriseSunsetData = async (date: string): Promise<{sunrise: number, sunset: number} | null> => {
  try {
    const url = `https://api.sunrise-sunset.org/json?lat=${PICKERING_LAT}&lng=${PICKERING_LONG}&date=${date}&formatted=0`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch sunrise/sunset data');
    
    const data = await response.json();
    if (data.status !== 'OK') throw new Error('Invalid response from sunrise-sunset API');
    
    // Convert UTC times to local times and extract hours/minutes
    const sunriseDate = new Date(data.results.sunrise);
    const sunsetDate = new Date(data.results.sunset);
    
    // Calculate total minutes from midnight
    const sunriseMinutes = sunriseDate.getHours() * 60 + sunriseDate.getMinutes();
    const sunsetMinutes = sunsetDate.getHours() * 60 + sunsetDate.getMinutes();
    
    logger.debug(`Sunrise/sunset data: Sunrise at ${formatTimeDisplay(sunriseMinutes)}, Sunset at ${formatTimeDisplay(sunsetMinutes)}`);
    
    return { sunrise: sunriseMinutes, sunset: sunsetMinutes };
  } catch (error) {
    logger.error('Error fetching sunrise/sunset data:', error);
    return null;
  }
};

const formatTimeDisplay = (totalMinutes: number): string => {
  // Displays time based on local minutes (0-1439)
  if (isNaN(totalMinutes) || totalMinutes < 0 || totalMinutes >= 1440) {
    return '--:--';
  }
  
  const displayMinutes = totalMinutes;
  const hours = Math.floor(displayMinutes / 60);
  const mins = displayMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const getCurrentDate = (dateParam?: string): string => {
  // Gets today's local date or uses the param
  if (dateParam) return dateParam;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

const displayDate = (dateStr: string): string => {
  // Formats local date for display
  try {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  } catch {
    return 'Invalid Date';
  }
};

const buildUtcVideoUrl = (localMinutes: number, localDateStr: string): string => {
    const [year, month, day] = localDateStr.split('-').map(Number);
    const localTime = new Date(year, month - 1, day, Math.floor(localMinutes / 60), localMinutes % 60);

    const urlDate = localTime.toISOString().slice(0, 10);
    const hourStr = String(localTime.getUTCHours()).padStart(2, '0');
    const minuteStr = String(localTime.getUTCMinutes()).padStart(2, '0');

    const url = `${API_BASE_URL}/getRawVideo?date=${urlDate}&hour=${hourStr}&minute=${minuteStr}`;
    logger.debug(`buildUtcVideoUrl: local=${localDateStr} ${formatTimeDisplay(localMinutes)} -> UTC URL=${url}`);
    return url;
};

// --- React Component ---
interface VideoPlayerProps {
  initialDate?: string;
  isLandscape?: boolean;
  style?: React.CSSProperties;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ initialDate, isLandscape = false, style }) => {
  const { date: dateParam } = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const playerRef = useRef<MediaPlayerInstance | null>(null);
  const remote = useMediaRemote();

  // --- State ---
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | undefined>(undefined);
  const [sliderValue, setSliderValue] = useState<number>(0);
  const [availableTimes, setAvailableTimes] = useState<number[]>([]); // Sorted list of available local times (minutes)
  const [isLoading, setIsLoading] = useState<boolean>(true); // Loading state for timeline data
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false); // Loading state for the current video file
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || dateParam || '');
  const [refreshKey, setRefreshKey] = useState<number>(0); // For forcing re-fetch
  // New state for sunrise/sunset markers
  const [sunData, setSunData] = useState<{sunrise: number, sunset: number} | null>(null);
  // Derive a usable date string for backend from selectedDate or fallback
  const currentDate = selectedDate || getCurrentDate(initialDate || dateParam);


  // Fetch list of recording dates
  const fetchAvailableDates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/listAvailableDates`);
      if (!res.ok) throw new Error(`Failed to load dates: ${res.statusText}`);
      const fetchedDates: string[] = await res.json();

      // Filter out dates that are strictly in the future compared to the user's current local date
      const todayStr = getCurrentDate();
      const validDates = fetchedDates.filter(date => date <= todayStr);
      validDates.sort((a, b) => b.localeCompare(a)); // Sort descending (newest first) for the UI dropdown
      setAvailableDates(validDates); // Set the filtered and sorted dates

      // Default to the latest valid date if no specific date is requested or if the requested date is invalid/future
      const requestedDate = initialDate || dateParam;
      if (!requestedDate || !validDates.includes(requestedDate)) {
          if (validDates.length > 0) {
            const latestDate = validDates[0]; // The first element after sorting descending is the latest
            logger.debug(`Defaulting selected date to latest valid date: ${latestDate}`);
            setSelectedDate(latestDate);
            // If dateParam existed but was invalid, update the URL? Or let it be? For now, just set state.
            if (dateParam && dateParam !== latestDate) {
                // Optional: navigate(`/video/${latestDate}`, { replace: true });
            }
          } else {
              logger.warn("No valid dates available after filtering.");
              setSelectedDate(''); // No valid dates, clear selection
          }
      } else {
          // Requested date is valid and exists, keep it
          setSelectedDate(requestedDate);
      }
    } catch (e) {
      logger.error('Error fetching available dates:', e);
      // Consider setting an error state here
    }
  }, [initialDate, dateParam]); // Dependencies: initialDate, dateParam

  // Update effect: load dates on mount
  useEffect(() => { fetchAvailableDates(); }, [fetchAvailableDates]);

  // Fetch times whenever selectedDate changes
  // Fetch times whenever selectedDate changes
  useEffect(() => {
    const fetchAvailableTimes = async () => {
      if (!selectedDate) return;
      
      // Calculate current date for this fetch
      const currentDate = selectedDate || getCurrentDate(initialDate || dateParam);
      
      logger.debug('Starting fetchAvailableTimes for', selectedDate);
      setIsLoading(true);
      setError(null);
      setAvailableTimes([]);
      setCurrentVideoUrl(undefined);

      try {
        const listUrl = `${API_BASE_URL}/listAvailableTimes?date=${currentDate}`;
        logger.debug(`Fetching available times from: ${listUrl}`);
        const response = await fetch(listUrl);
        if (!response.ok) throw new Error(`Failed to fetch available times: ${response.statusText}`);

        // Backend returns an array of available minute-of-day numbers in local time
        const times: number[] = await response.json();
        logger.debug(`Received times array (length ${times.length})`);
        times.sort((a, b) => a - b);
        logger.debug(`Sorted local times:`, times.map(m => formatTimeDisplay(m)));
        setAvailableTimes(times);

        if (times.length > 0) {
          logger.debug('Found available times. Loading most relevant clip...');
          
          // Calculate current local time
          const now = new Date();
          const currentLocalMinutes = now.getHours() * 60 + now.getMinutes();
          
          // Find the closest available local time to the current time
          let bestTimeMatch = times[times.length - 1];
          let closestDistance = Math.abs(bestTimeMatch - currentLocalMinutes);
          
          for (const time of times) {
            const distance = Math.abs(time - currentLocalMinutes);
            if (distance < closestDistance || (distance === closestDistance && time <= currentLocalMinutes)) {
              bestTimeMatch = time;
              closestDistance = distance;
            }
          }
          
          logger.debug(`Current local time: ${formatTimeDisplay(currentLocalMinutes)} (${currentLocalMinutes} min)`);
          logger.debug(`Best match: ${formatTimeDisplay(bestTimeMatch)} (${bestTimeMatch} min), distance: ${closestDistance}`);
          
          const firstTimeLocalMinutes = bestTimeMatch;
          
          setSliderValue(firstTimeLocalMinutes); // Set slider to the appropriate time
          // Construct initial video URL using the UTC helper
          const firstVideoUrl = buildUtcVideoUrl(firstTimeLocalMinutes, currentDate);
          setCurrentVideoUrl(firstVideoUrl);
          logger.debug(`Initial video URL state updated to: ${firstVideoUrl}`);
        } else {
          logger.debug('No available times found for this date.');
          setError("No videos available for this date.");
        }
      } catch (err) {
        logger.error('Error fetching available times:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching video data.');
        setAvailableTimes([]);
      } finally {
        logger.debug('Setting isLoading (timeline data) to false.');
        setIsLoading(false);
      }
    };

    fetchAvailableTimes();
  }, [selectedDate, refreshKey]);

  // Retry function for error state
  const retryFetchAvailableTimes = () => {
    setRefreshKey(prev => prev + 1); // Increment to force re-fetch
  };

  // --- Player Event Handling (Attempt Autoplay, Loading, Errors) ---
   useEffect(() => {
     const player = playerRef.current;
     if (!player || !currentVideoUrl) {
       if (!currentVideoUrl) setIsVideoLoading(false);
       return;
     }
     logger.debug(`Attaching Player event listeners. Player ready, URL: ${currentVideoUrl}`);

    const attemptPlay = () => {
        const currentPlayer = playerRef.current;
        if (currentPlayer && currentPlayer.state.paused) {
             if (!currentPlayer.muted) {
                 logger.debug('Attempting play: Forcing mute on player instance.');
                 currentPlayer.muted = true;
             }
             if (!isMuted) {
                 logger.debug('Attempting play: Syncing React state to muted.');
                 setIsMuted(true);
             }
            logger.debug('Attempting play: Calling remote.play()');
            try {
                remote.play();
            } catch (e: any) {
                if (e.name === 'NotAllowedError') {
                    logger.warn('Autoplay prevented: User interaction likely required.');
                } else {
                    logger.warn('Playback prevented:', e);
                    setError(`Playback Error: ${e.message || 'Unknown Error'}`);
                }
                setIsVideoLoading(false);
            }
        } else if (currentPlayer && !currentPlayer.state.paused) {
            logger.debug('Attempting play: Already playing.');
            setIsVideoLoading(false);
        } else {
            logger.debug('Attempting play: Conditions not met or player not found.');
        }
    };

     const onLoadStart = (event: Event) => { logger.debug('Player event: loadstart', event); setError(null); setIsVideoLoading(true); };
     const onLoadedData = (event: Event) => { logger.debug('Player event: loadeddata', event); setIsVideoLoading(false); attemptPlay(); };
     const onCanPlay = (event: Event) => { logger.debug('Player event: canplay', event); setIsVideoLoading(false); attemptPlay(); };
     const onPlaying = (event: Event) => { logger.debug('Player event: playing', event); setIsVideoLoading(false); };
     const onWaiting = (event: Event) => { logger.debug('Player event: waiting (buffering)', event); setIsVideoLoading(true); };
     const onError = (event: Event) => {
       logger.error('Video player error event object:', event);
       let message = 'Error loading or playing video.';
       if ('detail' in event && (event as CustomEvent).detail) {
           const errorDetail = (event as CustomEvent).detail;
           logger.error('Video player error detail:', errorDetail);
           if (typeof errorDetail?.message === 'string' && errorDetail.message) {
               message = `Video Error: ${errorDetail.message}`;
               if (errorDetail.code) message += ` (Code: ${errorDetail.code})`;
           } else if (errorDetail?.code) { message = `Video Error Code: ${errorDetail.code}`; }
       }
       setError(message);
       setIsVideoLoading(false);
     };

     player.addEventListener('loadstart', onLoadStart);
     player.addEventListener('loadeddata', onLoadedData);
     player.addEventListener('canplay', onCanPlay);
     player.addEventListener('playing', onPlaying);
     player.addEventListener('waiting', onWaiting);
     player.addEventListener('error', onError);

     return () => {
       logger.debug('Cleaning up player event listeners for URL:', currentVideoUrl);
       player.removeEventListener('loadstart', onLoadStart);
       player.removeEventListener('loadeddata', onLoadedData);
       player.removeEventListener('canplay', onCanPlay);
       player.removeEventListener('playing', onPlaying);
       player.removeEventListener('waiting', onWaiting);
       player.removeEventListener('error', onError);
     };
   }, [currentVideoUrl, isMuted]);

  useEffect(() => {
    const player = playerRef.current as any;
    if (player && currentVideoUrl) {
      const playPromise = player.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((e: any) => {
          logger.warn('Autoplay with direct player.play() failed:', e);
        });
      }
    }
    const htmlVideo = document.querySelector('video');
    if (htmlVideo) {
      htmlVideo.play().catch((e: any) => logger.warn('Autoplay on <video> tag failed:', e));
    }
  }, [currentVideoUrl]);

  // --- UI Event Handlers ---
  const handleSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(event.target.value, 10);
    setSliderValue(value); // Temporarily show drag position while scrubbing

    // Find the closest available time that is less than or equal to the slider's value
    let closestTimeLocalMinutes = availableTimes.slice().reverse().find(time => time <= value);

    // If the user scrubs before the very first clip, snap to the first clip
    if (closestTimeLocalMinutes === undefined && availableTimes.length > 0) {
      closestTimeLocalMinutes = availableTimes[0];
    }

    if (closestTimeLocalMinutes !== undefined) {
      // Snap slider to the actual start time of the clip
      setSliderValue(closestTimeLocalMinutes);

      // Build the new URL using the selected local time and the UTC helper
      const newUrl = buildUtcVideoUrl(closestTimeLocalMinutes, currentDate);
      logger.debug(`Slider seeking: Found closest time: ${closestTimeLocalMinutes}. New URL: ${newUrl}`);

      if (newUrl !== currentVideoUrl) {
        logger.debug(`Slider seeking: Updating video URL.`);
        setCurrentVideoUrl(newUrl);
        setIsVideoLoading(true);
      }
    }
  };

  const handleGoBack = () => navigate(-1);
  const toggleMute = () => {
    const player = playerRef.current;
    if (player) {
      const newMuted = !player.muted;
      player.muted = newMuted;
      setIsMuted(newMuted);
      if (!newMuted && player.state.paused) {
        try { remote.play(); } catch {}
      }
    }
  };

  const findCurrentClipIndex = () => {
    if (!availableTimes.length) return -1;

    const adjustedLocalTime = sliderValue;
    logger.debug(`findCurrentClipIndex: SliderValue=${sliderValue} (${formatTimeDisplay(sliderValue)})`);

    // Find the latest available time that starts at or before the current slider time
    const closestAvailableTime = availableTimes.slice().reverse().find(t => t <= adjustedLocalTime);

    if (closestAvailableTime !== undefined) {
        const index = availableTimes.indexOf(closestAvailableTime);
        logger.debug(`findCurrentClipIndex: Found closest available time: ${closestAvailableTime} at index ${index}`);
        return index;
    } else {
        logger.debug(`findCurrentClipIndex: No available time found at or before ${adjustedLocalTime}. Returning -1.`);
        return -1;
    }
  };

  const jumpToVideo = (index: number) => {
    if (index < 0 || index >= availableTimes.length) return;
    const t = availableTimes[index];
    
    // Build the new URL using the UTC helper
    const newUrl = buildUtcVideoUrl(t, currentDate);
    logger.debug(`Jump to video: time=${t}, url=${newUrl}`);
    
    setSliderValue(t); // Move the slider to the new time
    if (newUrl !== currentVideoUrl) {
      setCurrentVideoUrl(newUrl);
      if (!isMuted) setIsMuted(true);
    } else if (playerRef.current) {
      playerRef.current.currentTime = 0; // Replay if it's the same clip
    }
  };

  const handlePreviousClip = () => {
    const idx = findCurrentClipIndex();
    if (idx > 0) jumpToVideo(idx - 1);
  };
  const handleNextClip = () => {
    const idx = findCurrentClipIndex();
    if (idx < availableTimes.length - 1 && idx !== -1) jumpToVideo(idx + 1);
  };

  const currentIdx = findCurrentClipIndex();
  const isFirstClip = currentIdx <= 0;
  const isLastClip = currentIdx === -1 || currentIdx >= availableTimes.length - 1;

  const renderTimeMarkers = () => {
    const currentClipIndex = findCurrentClipIndex();
    return availableTimes.map((time, index) => {
      const positionValue = time;
      const left = `${(positionValue / 1440) * 100}%`;
      const isActive = index === currentClipIndex;
      
      return (
        <button
          key={time}
          className={`time-marker ${isActive ? 'active' : ''}`}
          style={{ left }}
          title={`Jump to ${formatTimeDisplay(time)}`}
          onClick={() => jumpToVideo(index)}
          aria-label={`Jump to video clip starting at ${formatTimeDisplay(time)}`}
        />
      );
    });
  };

  // Render sunrise, and sunset markers
  const renderTimePointIndicators = () => {
    return (
      <>        
        {/* Noon marker - fixed at 12:00 (720 minutes) */}
        <div 
          className="absolute top-0 bottom-0 w-px bg-yellow-400 z-10"
          style={{ left: '50%' }}
          title="Noon (12:00)"
        >
          <div className="absolute -top-6 -translate-x-1/2 text-xs text-yellow-300">
            <FaSun size={14} />
          </div>
        </div>
        
        {/* Sunrise marker */}
        {sunData?.sunrise && (
          <div 
            className="absolute top-0 bottom-0 w-px bg-orange-400 z-10"
            style={{ left: `${(sunData.sunrise / 1440) * 100}%` }}
            title={`Sunrise (${formatTimeDisplay(sunData.sunrise)})`}
          >
            <div className="absolute -top-6 -translate-x-1/2 text-xs text-orange-300">
              <FaSun size={14} className="text-orange-300" />
            </div>
          </div>
        )}
        
        {/* Sunset marker */}
        {sunData?.sunset && (
          <div 
            className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
            style={{ left: `${(sunData.sunset / 1440) * 100}%` }}
            title={`Sunset (${formatTimeDisplay(sunData.sunset)})`}
          >
            <div className="absolute -top-6 -translate-x-1/2 text-xs text-red-300">
              <FaSun size={14} className="text-red-300" />
            </div>
          </div>
        )}
      </>
    );
  };

  const isOverlayMode = initialDate !== undefined;
  useEffect(() => {
    if (isOverlayMode && currentVideoUrl) {
      const playPromise = (playerRef.current as any)?.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  }, [isOverlayMode, currentVideoUrl]);

  // Fetch sunrise/sunset data when selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      fetchSunriseSunsetData(selectedDate).then(data => {
        setSunData(data);
      });
    }
  }, [selectedDate]);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-gray-900 to-black text-gray-200 font-sans">
      {!isOverlayMode && (
        <header className="bg-gray-800/80 backdrop-blur-sm p-3 flex justify-between items-center shadow-md border-b border-gray-700/50 sticky top-0 z-30">
          <button
            onClick={handleGoBack}
            className="flex items-center px-4 py-2 bg-blue-600/80 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800"
            aria-label="Go back"
          >
            <FaArrowLeft className="mr-2 h-4 w-4" /> Back
          </button>
          <div className="flex items-center space-x-2 text-sm font-medium bg-gray-700/50 px-3 py-1.5 rounded-md">
            <FaCalendarAlt className="text-blue-300 h-4 w-4" />
            {availableDates.length > 0 ? (
              <select
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="bg-transparent border-none text-gray-100 font-mono focus:outline-none cursor-pointer"
                aria-label="Select recording date"
              >
                {availableDates.map(date => (
                  <option key={date} value={date} className="bg-gray-800">
                    {displayDate(date)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono">{displayDate(currentDate)}</span>
            )}
          </div>
          <div className="w-28 flex-shrink-0"></div>
        </header>
      )}

      <div className={isOverlayMode ? "w-full h-full flex flex-col" : "flex-1 p-4 md:p-6 flex justify-center items-start"}>
        <div className={`player-container ${isOverlayMode ? "w-full h-full flex flex-col" : "w-full max-w-5xl"} bg-gray-850 border border-gray-700/60 shadow-xl rounded-lg overflow-hidden`}>
          <div className={`relative ${isOverlayMode ? "h-[calc(100%-150px)]" : "aspect-video"} bg-black`}>
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 z-20 backdrop-blur-sm">
                <div className="loader"></div>
                <p className="mt-4 text-base text-gray-400">Loading available times...</p>
              </div>
            )}
            {!isLoading && error && availableTimes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 p-6 text-center z-20">
                 <p className="error-message mb-5 text-base text-red-300">{error}</p>
                 <button
                    onClick={retryFetchAvailableTimes}
                    className="flex items-center px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white rounded-md text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-800"
                  >
                     <FaRedo className="mr-2 h-4 w-4" /> Retry
                 </button>
              </div>
            )}
            {isVideoLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10 pointer-events-none backdrop-blur-sm">
                <div className="loader small"></div>
              </div>
            )}
            {!isLoading && !error && availableTimes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700/50">
                <p className="text-gray-400 text-lg">No video recordings found for this date.</p>
              </div>
            )}
            <MediaPlayer
                key={currentVideoUrl}
                ref={playerRef}
                src={currentVideoUrl ? { src: currentVideoUrl, type: 'video/mp4' } : undefined}
                viewType="video"
                streamType="on-demand"
                load="eager"
                crossOrigin
                playsInline
                autoPlay
                muted={isMuted}
                className={`w-full h-full bg-black transition-opacity duration-300 ${!currentVideoUrl && availableTimes.length > 0 && !isLoading ? 'opacity-50' : 'opacity-100'}`}
              >
                <MediaProvider />
            </MediaPlayer>
            {!isLoading && error && availableTimes.length > 0 && (
                 <div className="absolute bottom-4 left-4 right-4 p-2 bg-red-800/80 text-red-100 text-xs rounded-md z-20 pointer-events-none backdrop-blur-sm">
                    {error}
                 </div>
            )}
          </div>
           <div className={`p-3 md/p-4 bg-gray-850 border-t border-gray-700/60 transition-opacity duration-300 ${availableTimes.length === 0 && !isLoading ? 'opacity-50 cursor-not-allowed' : 'opacity-100'}`}>
              {isOverlayMode && (
                <div className="flex items-center space-x-2 text-sm font-medium mb-3">
                  <FaCalendarAlt className="text-blue-300 h-4 w-4" />
                  <select
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-gray-100 font-mono focus:outline-none cursor-pointer"
                    aria-label="Select recording date"
                  >
                    {availableDates.map(date => (
                      <option key={date} value={date} className="bg-gray-800">
                        {displayDate(date)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
               <div className="relative h-6 flex items-center mb-1 group">
                   {/* Background time indicators (midnight, sunrise, sunset) */}
                   <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                       {renderTimePointIndicators()}
                   </div>
                   
                   {/* Video clip time markers */}
                   {availableTimes.length > 0 && (
                      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                           {renderTimeMarkers()}
                      </div>
                   )}
                   
                   <input
                       type="range" min="0" max="1439" step="1"
                       value={sliderValue}
                       onChange={handleSliderChange}
                       className="range-input w-full"
                       disabled={availableTimes.length === 0 || isLoading}
                       aria-label="Timeline Slider"
                   />
               </div>
               <div className="flex justify-between text-xs text-gray-500 px-1 mb-3">
                   <span>00:00</span> <span>06:00</span> <span>12:00</span> <span>18:00</span> <span>23:59</span>
               </div>
               <div className="flex justify-between items-center">
                   <div className="flex items-center space-x-1">
                       <button
                          onClick={handlePreviousClip}
                          disabled={isFirstClip || isLoading || availableTimes.length === 0}
                          className="control-button"
                          title="Previous Clip"
                          aria-label="Previous Video Clip"
                       >
                           <FaStepBackward size={16} />
                       </button>
                       <button
                           onClick={handleNextClip}
                           disabled={isLastClip || isLoading || availableTimes.length === 0}
                           className="control-button"
                           title="Next Clip"
                           aria-label="Next Video Clip"
                       >
                          <FaStepForward size={16} />
                       </button>
                   </div>
                   <div className="font-mono text-base md:text-lg font-semibold text-gray-100 tabular-nums">
                       {formatTimeDisplay(sliderValue)}
                   </div>
                   <div className="flex justify-end">
                       <button
                          onClick={toggleMute}
                          disabled={!currentVideoUrl || isLoading}
                          className="control-button"
                          title={isMuted ? "Unmute" : "Mute"}
                          aria-label={isMuted ? "Unmute Video" : "Mute Video"}
                       >
                          {isMuted ? <FaVolumeMute size={18} /> : <FaVolumeUp size={18} />}
                       </button>
                   </div>
               </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
