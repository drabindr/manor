import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { UilHistory } from '@iconscout/react-unicons';
import { FaCalendarAlt } from 'react-icons/fa';
import VideoPlayer from '../VideoPlayer';

interface HistoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const HistoryOverlay: React.FC<HistoryOverlayProps> = ({
  isOpen,
  onClose
}) => {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined'
      ? window.innerWidth > window.innerHeight
      : false
  );
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isDateReady, setIsDateReady] = useState<boolean>(false);

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

  // Enhanced close handler with haptic feedback
  const handleClose = useCallback(() => {
    triggerHaptic('light');
    onClose();
  }, [onClose, triggerHaptic]);

  // Escape key handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Enhanced orientation watcher with iPhone optimizations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const onRes = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
      
      // Enhanced iOS-specific optimizations
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        // Optimize viewport height for iOS Safari
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      }
    };
    
    window.addEventListener('resize', onRes);
    window.addEventListener('orientationchange', onRes);
    onRes();
    return () => {
      window.removeEventListener('resize', onRes);
      window.removeEventListener('orientationchange', onRes);
    };
  }, []);

  // Fetch available dates
  useEffect(() => {
    const fetchDates = async () => {
      try {
        setIsDateReady(false);
        const res = await fetch('http://192.168.86.81:80/listAvailableDates');
        if (!res.ok) throw new Error(res.statusText);
        const dates = await res.json() as string[];
        dates.sort((a, b) => a.localeCompare(b));
        setAvailableDates(dates);
        if (dates.length) {
          const latestDate = dates[dates.length - 1];
          console.log(`HistoryOverlay: Setting selected date to latest: ${latestDate}`);
          setSelectedDate(latestDate);
        }
        setIsDateReady(true);
      } catch (err) {
        console.error('HistoryOverlay: Error fetching dates:', err);
        setIsDateReady(true);
      }
    };
    if (isOpen) fetchDates();
  }, [isOpen]);

  const formatDate = (s: string) => {
    const [y, m, d] = s.split('-');
    return `${m}/${d}/${y}`;
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div 
      className="fixed inset-0 bg-black z-[9999] flex flex-col touch-manipulation"
      style={{
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden'
      }}
    >
      {/* Enhanced Fixed Header with iPhone optimizations */}
      <div
        className="fixed top-0 left-0 right-0 pb-4 px-4 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/70 to-transparent backdrop-blur-sm transition-all duration-300 z-50"
        style={{
          paddingTop: isLandscape
            ? 'calc(env(safe-area-inset-top, 0px) + 20px)'
            : 'calc(env(safe-area-inset-top, 0px) + 80px)',
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
      >
        <div className="text-white font-medium flex items-center space-x-2">
          <div className="bg-blue-500/20 p-1.5 rounded-lg">
            <UilHistory className="text-blue-400" size={18} />
          </div>
          <span>Casa Camera</span>
          <div className="ml-2 px-2 py-0.5 bg-amber-900/30 border border-amber-700/30 rounded-full text-xs text-amber-400 flex items-center space-x-1">
            <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
            <span>History</span>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="bg-gray-800/70 hover:bg-gray-700/90 text-white px-4 py-2 rounded-full flex items-center space-x-2 transition-all duration-300 border border-gray-700/50 shadow-lg touch-manipulation active:scale-95 min-h-[48px]"
          style={{
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          <span>Close</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Enhanced Video Container with iPhone optimizations */}
      <div
        className={`absolute inset-0 overflow-hidden ${
          isLandscape ? 'landscape-video-container' : ''
        }`}
        style={{
          paddingBottom: isLandscape
            ? 'env(safe-area-inset-bottom, 0px)'
            : '0px',
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
      >
        {/* Only render VideoPlayer when date is ready to prevent timing issues */}
        {isDateReady && selectedDate && (
          <VideoPlayer initialDate={selectedDate} isLandscape={isLandscape} />
        )}
        {/* Enhanced loading state while fetching date */}
        {!isDateReady && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <div className="text-white text-lg font-medium">Loading latest recordings...</div>
              <div className="text-gray-400 text-sm mt-2">Please wait while we prepare your video history</div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.getElementById('fullscreen-root')!
  );
};

export default React.memo(HistoryOverlay, (a, b) => a.isOpen === b.isOpen);
