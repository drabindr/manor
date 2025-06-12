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