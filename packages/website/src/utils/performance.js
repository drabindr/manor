// Performance monitoring utilities
export const performance = {
  // Track page load timing
  measurePageLoad: () => {
    if (typeof window !== 'undefined' && window.performance) {
      const timing = window.performance.timing;
      const navigation = window.performance.navigation;
      
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
      const firstPaint = timing.responseStart - timing.navigationStart;
      
      console.log('Performance Metrics:', {
        loadTime: `${loadTime}ms`,
        domReady: `${domReady}ms`,
        firstPaint: `${firstPaint}ms`,
        navigationType: navigation.type
      });
      
      return {
        loadTime,
        domReady,
        firstPaint,
        navigationType: navigation.type
      };
    }
    return null;
  },
  
  // Track resource loading
  measureResources: () => {
    if (typeof window !== 'undefined' && window.performance) {
      const resources = window.performance.getEntriesByType('resource');
      const jsResources = resources.filter(r => r.name.includes('.js'));
      const cssResources = resources.filter(r => r.name.includes('.css'));
      
      console.log('Resource Loading:', {
        totalResources: resources.length,
        jsFiles: jsResources.length,
        cssFiles: cssResources.length,
        largestJS: jsResources.reduce((max, r) => r.transferSize > max.transferSize ? r : max, {transferSize: 0}),
        largestCSS: cssResources.reduce((max, r) => r.transferSize > max.transferSize ? r : max, {transferSize: 0})
      });
      
      return {
        total: resources.length,
        js: jsResources.length,
        css: cssResources.length
      };
    }
    return null;
  },
  
  // Track Core Web Vitals if available
  measureWebVitals: () => {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        // Largest Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          console.log('LCP (Largest Contentful Paint):', `${lastEntry.startTime.toFixed(2)}ms`);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // First Input Delay
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            console.log('FID (First Input Delay):', `${entry.processingStart - entry.startTime}ms`);
          });
        }).observe({ entryTypes: ['first-input'] });
        
        // Cumulative Layout Shift
        new PerformanceObserver((list) => {
          let clsValue = 0;
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          console.log('CLS (Cumulative Layout Shift):', clsValue);
        }).observe({ entryTypes: ['layout-shift'] });
        
      } catch (e) {
        console.warn('Performance monitoring not fully supported:', e);
      }
    }
  },

  // Camera-specific performance monitoring
  cameraMetrics: {
    loadTimes: new Map(),
    
    // Start timing camera load
    startCameraLoad: (cameraId) => {
      const startTime = performance.now ? performance.now() : Date.now();
      performance.cameraMetrics.loadTimes.set(cameraId, { startTime, endTime: null });
      console.log(`📹 [${cameraId}] Starting camera load at ${startTime.toFixed(2)}ms`);
    },
    
    // End timing camera load and calculate duration
    endCameraLoad: (cameraId, success = true) => {
      const endTime = performance.now ? performance.now() : Date.now();
      const metrics = performance.cameraMetrics.loadTimes.get(cameraId);
      
      if (metrics) {
        metrics.endTime = endTime;
        const duration = endTime - metrics.startTime;
        const status = success ? '✅' : '❌';
        console.log(`📹 [${cameraId}] ${status} Camera load completed in ${duration.toFixed(2)}ms`);
        
        // Store for analytics
        performance.cameraMetrics.loadTimes.set(cameraId, { ...metrics, duration, success });
        return duration;
      }
      return null;
    },
    
    // Get summary of all camera load times
    getSummary: () => {
      const times = Array.from(performance.cameraMetrics.loadTimes.values())
        .filter(m => m.duration != null);
      
      if (times.length === 0) return null;
      
      const successful = times.filter(t => t.success);
      const failed = times.filter(t => !t.success);
      const durations = successful.map(t => t.duration);
      
      const summary = {
        totalCameras: times.length,
        successful: successful.length,
        failed: failed.length,
        avgLoadTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        minLoadTime: durations.length > 0 ? Math.min(...durations) : 0,
        maxLoadTime: durations.length > 0 ? Math.max(...durations) : 0
      };
      
      console.log('📊 Camera Load Summary:', {
        ...summary,
        avgLoadTime: `${summary.avgLoadTime.toFixed(2)}ms`,
        minLoadTime: `${summary.minLoadTime.toFixed(2)}ms`,
        maxLoadTime: `${summary.maxLoadTime.toFixed(2)}ms`
      });
      
      return summary;
    }
  },
  
  // Initialize all performance monitoring
  init: () => {
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          performance.measurePageLoad();
          performance.measureResources();
          performance.measureWebVitals();
        }, 1000);
      });
    }
  }
};

export default performance;