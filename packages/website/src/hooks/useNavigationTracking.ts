import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import metricsCollector from '../utils/MetricsCollector';

/**
 * Custom hook to track navigation performance between routes
 */
export const useNavigationTracking = () => {
  const location = useLocation();
  const previousLocation = useRef<string>('');
  const navigationStartTime = useRef<number>(0);
  const isInitialLoad = useRef<boolean>(true);

  useEffect(() => {
    const currentPath = location.pathname;

    // Track navigation if this isn't the initial page load
    if (!isInitialLoad.current && previousLocation.current && previousLocation.current !== currentPath) {
      const navigationDuration = performance.now() - navigationStartTime.current;
      
      // Track the navigation
      metricsCollector.trackNavigation(
        previousLocation.current,
        currentPath,
        navigationDuration
      );
      
      console.log(`[Navigation] ${previousLocation.current} -> ${currentPath}: ${navigationDuration.toFixed(2)}ms`);
    }

    // Prepare for next navigation
    previousLocation.current = currentPath;
    navigationStartTime.current = performance.now();
    
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
    }
  }, [location.pathname]);

  return {
    currentPath: location.pathname,
    trackCustomNavigation: (fromPage: string, toPage: string, duration: number) => {
      metricsCollector.trackNavigation(fromPage, toPage, duration);
    }
  };
};

export default useNavigationTracking;
