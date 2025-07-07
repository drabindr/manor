import React, { useEffect, useRef, useCallback } from 'react';
import metricsCollector from '../utils/MetricsCollector';

/**
 * React hook for tracking widget performance metrics
 * Non-intrusive wrapper around MetricsCollector
 */
export const useMetrics = (widgetName: string) => {
  const startTimeRef = useRef<number | null>(null);
  const dataFetchStartRef = useRef<number | null>(null);
  const renderStartRef = useRef<number | null>(null);

  /**
   * Start tracking widget load
   */
  const trackLoadStart = useCallback(() => {
    startTimeRef.current = performance.now();
    metricsCollector.startWidgetLoad(widgetName);
  }, [widgetName]);

  /**
   * End tracking widget load
   */
  const trackLoadEnd = useCallback((success: boolean = true) => {
    metricsCollector.endWidgetLoad(widgetName, success);
  }, [widgetName]);

  /**
   * Track data fetch start
   */
  const trackDataFetchStart = useCallback(() => {
    dataFetchStartRef.current = performance.now();
  }, []);

  /**
   * Track data fetch end
   */
  const trackDataFetchEnd = useCallback((success: boolean = true) => {
    if (dataFetchStartRef.current !== null) {
      const duration = performance.now() - dataFetchStartRef.current;
      metricsCollector.trackDataFetch(widgetName, duration, success);
      dataFetchStartRef.current = null;
    }
  }, [widgetName]);

  /**
   * Track render start
   */
  const trackRenderStart = useCallback(() => {
    renderStartRef.current = performance.now();
  }, []);

  /**
   * Track render end
   */
  const trackRenderEnd = useCallback(() => {
    if (renderStartRef.current !== null) {
      const duration = performance.now() - renderStartRef.current;
      metricsCollector.trackRenderTime(widgetName, duration);
      renderStartRef.current = null;
    }
  }, [widgetName]);

  /**
   * Track API call
   */
  const trackApiCall = useCallback(async <T>(
    apiCall: () => Promise<T>, 
    endpoint: string
  ): Promise<T> => {
    const startTime = performance.now();
    try {
      const result = await apiCall();
      const duration = performance.now() - startTime;
      metricsCollector.trackApiCall(endpoint, duration, true);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      metricsCollector.trackApiCall(endpoint, duration, false);
      throw error;
    }
  }, []);

  /**
   * Track user interaction
   */
  const trackInteraction = useCallback((interactionType: string) => {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      metricsCollector.trackInteraction(`${widgetName}:${interactionType}`, duration);
    };
  }, [widgetName]);

  /**
   * Track camera stream startup
   */
  const trackCameraStreamStartup = useCallback((cameraType: 'nest' | 'manor', cameraId: string, startupTime: number, success: boolean = true) => {
    metricsCollector.trackCameraStreamStartup(cameraType, cameraId, startupTime, success);
  }, []);

  /**
   * Track camera connection time
   */
  const trackCameraConnectionTime = useCallback((cameraType: 'nest' | 'manor', cameraId: string, connectionTime: number, success: boolean = true) => {
    metricsCollector.trackCameraConnectionTime(cameraType, cameraId, connectionTime, success);
  }, []);

  /**
   * Track camera stream quality
   */
  const trackCameraStreamQuality = useCallback((cameraType: 'nest' | 'manor', cameraId: string, quality: 'low' | 'medium' | 'high', bufferingEvents: number = 0) => {
    metricsCollector.trackCameraStreamQuality(cameraType, cameraId, quality, bufferingEvents);
  }, []);

  /**
   * Track camera stream error
   */
  const trackCameraStreamError = useCallback((cameraType: 'nest' | 'manor', cameraId: string, errorType: string) => {
    metricsCollector.trackCameraStreamError(cameraType, cameraId, errorType);
  }, []);

  return {
    trackLoadStart,
    trackLoadEnd,
    trackDataFetchStart,
    trackDataFetchEnd,
    trackRenderStart,
    trackRenderEnd,
    trackApiCall,
    trackInteraction,
    trackCameraStreamStartup,
    trackCameraConnectionTime,
    trackCameraStreamQuality,
    trackCameraStreamError
  };
};

/**
 * Hook for tracking page-level metrics
 */
export const usePageMetrics = (pageName: string) => {
  const navigationStartRef = useRef<number | null>(null);

  /**
   * Track page load
   */
  const trackPageLoad = useCallback(() => {
    metricsCollector.trackPageLoad(pageName);
  }, [pageName]);

  /**
   * Track navigation start
   */
  const trackNavigationStart = useCallback((fromPage: string) => {
    navigationStartRef.current = performance.now();
  }, []);

  /**
   * Track navigation end
   */
  const trackNavigationEnd = useCallback((fromPage: string) => {
    if (navigationStartRef.current !== null) {
      const duration = performance.now() - navigationStartRef.current;
      metricsCollector.trackNavigation(fromPage, pageName, duration);
      navigationStartRef.current = null;
    }
  }, [pageName]);

  /**
   * Track navigation between tabs
   */
  const trackTabNavigation = useCallback((fromTab: string, toTab: string) => {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      metricsCollector.trackNavigation(fromTab, toTab, duration);
    };
  }, []);

  // Auto-track page load on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      trackPageLoad();
    }, 100); // Small delay to ensure page is rendered
    
    return () => clearTimeout(timer);
  }, [trackPageLoad]);

  return {
    trackPageLoad,
    trackNavigationStart,
    trackNavigationEnd,
    trackTabNavigation
  };
};

/**
 * Higher-order component for automatic metrics tracking
 */
export const withMetrics = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  widgetName: string
): React.ComponentType<P> => {
  const WithMetricsComponent: React.FC<P> = (props: P) => {
    const { trackLoadStart, trackLoadEnd, trackRenderStart, trackRenderEnd } = useMetrics(widgetName);

    useEffect(() => {
      trackLoadStart();
      trackRenderStart();
      
      const timer = setTimeout(() => {
        trackRenderEnd();
        trackLoadEnd(true);
      }, 0);

      return () => {
        clearTimeout(timer);
      };
    }, [trackLoadStart, trackLoadEnd, trackRenderStart, trackRenderEnd]);

    return React.createElement(WrappedComponent, props);
  };

  WithMetricsComponent.displayName = `withMetrics(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return WithMetricsComponent;
};

export default useMetrics;
