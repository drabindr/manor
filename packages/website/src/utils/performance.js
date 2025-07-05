import metricsService from '../services/MetricsService';

// Performance monitoring utilities with CloudWatch integration
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

      // Send metrics to CloudWatch
      try {
        metricsService.recordMetric({
          metricName: 'PageLoadTime',
          value: loadTime,
          unit: 'Milliseconds',
          dimensions: [
            { Name: 'NavigationType', Value: navigation.type.toString() },
            { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
          ]
        });

        metricsService.recordMetric({
          metricName: 'DOMReadyTime',
          value: domReady,
          unit: 'Milliseconds',
          dimensions: [
            { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
          ]
        });
      } catch (error) {
        console.debug('Failed to send page load metrics:', error);
      }
      
      return {
        loadTime,
        domReady,
        firstPaint,
        navigationType: navigation.type
      };
    }
    return null;
  },

  // Measure component load timing
  measureComponentLoad: (componentName, startTime) => {
    if (typeof window !== 'undefined' && startTime) {
      const endTime = performance.now ? performance.now() : Date.now();
      const loadTime = Math.round(endTime - startTime);
      
      console.log(`Component Load: ${componentName} took ${loadTime}ms`);
      
      // Send to CloudWatch
      try {
        metricsService.recordComponentLoadMetric(componentName, loadTime);
      } catch (error) {
        console.debug(`Failed to send ${componentName} load metrics:`, error);
      }
      
      return loadTime;
    }
    return null;
  },

  // Create a performance mark for component timing
  markComponentStart: (componentName) => {
    if (typeof window !== 'undefined') {
      const startTime = performance.now ? performance.now() : Date.now();
      const markName = `${componentName}-start`;
      
      if (window.performance && window.performance.mark) {
        window.performance.mark(markName);
      }
      
      return startTime;
    }
    return null;
  },

  // Measure from a performance mark
  measureFromMark: (componentName, startTime) => {
    if (typeof window !== 'undefined' && startTime) {
      const endTime = performance.now ? performance.now() : Date.now();
      const loadTime = Math.round(endTime - startTime);
      const markName = `${componentName}-start`;
      const measureName = `${componentName}-load`;
      
      if (window.performance && window.performance.measure) {
        try {
          window.performance.measure(measureName, markName);
        } catch (e) {
          // Mark might not exist, ignore
        }
      }
      
      console.log(`Component Load: ${componentName} took ${loadTime}ms`);
      
      // Send to CloudWatch
      try {
        metricsService.recordComponentLoadMetric(componentName, loadTime);
      } catch (error) {
        console.debug(`Failed to send ${componentName} load metrics:`, error);
      }
      
      return loadTime;
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

      // Send resource metrics to CloudWatch
      try {
        metricsService.recordMetric({
          metricName: 'ResourceCount',
          value: resources.length,
          unit: 'Count',
          dimensions: [
            { Name: 'ResourceType', Value: 'Total' },
            { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
          ]
        });

        metricsService.recordMetric({
          metricName: 'ResourceCount',
          value: jsResources.length,
          unit: 'Count',
          dimensions: [
            { Name: 'ResourceType', Value: 'JavaScript' },
            { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
          ]
        });

        metricsService.recordMetric({
          metricName: 'ResourceCount',
          value: cssResources.length,
          unit: 'Count',
          dimensions: [
            { Name: 'ResourceType', Value: 'CSS' },
            { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
          ]
        });
      } catch (error) {
        console.debug('Failed to send resource metrics:', error);
      }
      
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
          const lcpTime = lastEntry.startTime;
          console.log('LCP (Largest Contentful Paint):', `${lcpTime.toFixed(2)}ms`);
          
          // Send to CloudWatch
          try {
            metricsService.recordMetric({
              metricName: 'LargestContentfulPaint',
              value: lcpTime,
              unit: 'Milliseconds',
              dimensions: [
                { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
              ]
            });
          } catch (error) {
            console.debug('Failed to send LCP metrics:', error);
          }
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // First Input Delay
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            const fidTime = entry.processingStart - entry.startTime;
            console.log('FID (First Input Delay):', `${fidTime}ms`);
            
            // Send to CloudWatch
            try {
              metricsService.recordMetric({
                metricName: 'FirstInputDelay',
                value: fidTime,
                unit: 'Milliseconds',
                dimensions: [
                  { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
                ]
              });
            } catch (error) {
              console.debug('Failed to send FID metrics:', error);
            }
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
          
          // Send to CloudWatch
          try {
            metricsService.recordMetric({
              metricName: 'CumulativeLayoutShift',
              value: clsValue,
              unit: 'Count',
              dimensions: [
                { Name: 'Environment', Value: process.env.NODE_ENV || 'development' }
              ]
            });
          } catch (error) {
            console.debug('Failed to send CLS metrics:', error);
          }
        }).observe({ entryTypes: ['layout-shift'] });
        
      } catch (e) {
        console.warn('Performance monitoring not fully supported:', e);
      }
    }
  },
  
  // Initialize all performance monitoring
  init: () => {
    if (typeof window !== 'undefined') {
      // Initialize metrics service
      const metricsConfig = {
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
        identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID || '',
        namespace: 'Manor/Frontend'
      };

      if (metricsConfig.identityPoolId) {
        metricsService.init(metricsConfig).catch(error => {
          console.warn('Failed to initialize metrics service:', error);
        });
      }

      window.addEventListener('load', () => {
        setTimeout(() => {
          performance.measurePageLoad();
          performance.measureResources();
          performance.measureWebVitals();
        }, 1000);
      });

      // Clean up metrics service on page unload
      window.addEventListener('beforeunload', () => {
        try {
          metricsService.destroy();
        } catch (error) {
          console.debug('Error destroying metrics service:', error);
        }
      });
    }
  }
};

export default performance;