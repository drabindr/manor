/**
 * MetricsCollector - Non-intrusive performance metrics collection for Manor
 * Tracks page load times and individual widget performance
 */

interface MetricData {
  metricName: string;
  value: number;
  unit: string;
  timestamp: number;
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

interface WidgetMetrics {
  name: string;
  loadStartTime: number;
  loadEndTime?: number;
  loadDuration?: number;
  errorCount: number;
  dataFetchDuration?: number;
  renderDuration?: number;
}

class MetricsCollector {
  private metrics: MetricData[] = [];
  private widgetMetrics: Map<string, WidgetMetrics> = new Map();
  private pageLoadStartTime: number = 0;
  private componentLoadTimes: Map<string, number> = new Map();
  private isEnabled: boolean = true;
  private batchSize: number = 50;
  private flushInterval: number = 30000; // 30 seconds
  private lastFlush: number = 0;

  // API endpoint for metrics (configured from CDK deployment)
  private readonly METRICS_ENDPOINT = 'https://4jho8ftish.execute-api.us-east-1.amazonaws.com/prod/metrics';

  constructor() {
    this.pageLoadStartTime = performance.now();
    this.initializeWebVitalsTracking();
    this.startPeriodicFlush();
  }

  /**
   * Track page load metrics
   */
  trackPageLoad(pageName: string): void {
    if (!this.isEnabled) return;

    const loadTime = performance.now() - this.pageLoadStartTime;
    
    this.addMetric({
      metricName: 'PageLoadLatency',
      value: loadTime,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        page: pageName,
        userAgent: navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'
      }
    });

    // Track Web Vitals if available
    this.trackWebVitals(pageName);
  }

  /**
   * Start tracking widget load time
   */
  startWidgetLoad(widgetName: string): void {
    if (!this.isEnabled) return;

    const startTime = performance.now();
    this.widgetMetrics.set(widgetName, {
      name: widgetName,
      loadStartTime: startTime,
      errorCount: 0
    });
    
    this.componentLoadTimes.set(widgetName, startTime);
  }

  /**
   * End widget load tracking
   */
  endWidgetLoad(widgetName: string, success: boolean = true): void {
    if (!this.isEnabled) return;

    const endTime = performance.now();
    const widget = this.widgetMetrics.get(widgetName);
    const startTime = this.componentLoadTimes.get(widgetName);

    if (widget && startTime) {
      const loadDuration = endTime - startTime;
      
      widget.loadEndTime = endTime;
      widget.loadDuration = loadDuration;

      this.addMetric({
        metricName: 'WidgetLoadLatency',
        value: loadDuration,
        unit: 'Milliseconds',
        timestamp: Date.now(),
        dimensions: {
          widget: widgetName,
          status: success ? 'success' : 'error'
        }
      });

      if (!success) {
        widget.errorCount++;
        this.addMetric({
          metricName: 'WidgetLoadError',
          value: 1,
          unit: 'Count',
          timestamp: Date.now(),
          dimensions: {
            widget: widgetName
          }
        });
      }
    }
  }

  /**
   * Track data fetch duration for widgets
   */
  trackDataFetch(widgetName: string, duration: number, success: boolean = true): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'DataFetchLatency',
      value: duration,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        widget: widgetName,
        status: success ? 'success' : 'error'
      }
    });

    const widget = this.widgetMetrics.get(widgetName);
    if (widget) {
      widget.dataFetchDuration = duration;
    }
  }

  /**
   * Track render duration for widgets
   */
  trackRenderTime(widgetName: string, duration: number): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'WidgetRenderLatency', 
      value: duration,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        widget: widgetName
      }
    });

    const widget = this.widgetMetrics.get(widgetName);
    if (widget) {
      widget.renderDuration = duration;
    }
  }

  /**
   * Track API call latency
   */
  trackApiCall(endpoint: string, duration: number, success: boolean = true): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'ApiCallLatency',
      value: duration,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        endpoint: this.sanitizeEndpoint(endpoint),
        status: success ? 'success' : 'error'
      }
    });
  }

  /**
   * Track user interaction latency
   */
  trackInteraction(interactionType: string, duration: number): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'UserInteractionLatency',
      value: duration,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        interaction: interactionType
      }
    });
  }

  /**
   * Track camera stream startup time
   */
  trackCameraStreamStartup(cameraType: 'nest' | 'manor', cameraId: string, startupTime: number, success: boolean = true): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'CameraStreamStartup',
      value: startupTime,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        cameraType: cameraType,
        cameraId: this.sanitizeCameraId(cameraId),
        status: success ? 'success' : 'error'
      }
    });
  }

  /**
   * Track camera stream connection time (time to first frame)
   */
  trackCameraConnectionTime(cameraType: 'nest' | 'manor', cameraId: string, connectionTime: number, success: boolean = true): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'CameraConnectionTime',
      value: connectionTime,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        cameraType: cameraType,
        cameraId: this.sanitizeCameraId(cameraId),
        status: success ? 'success' : 'error'
      }
    });
  }

  /**
   * Track camera stream quality metrics
   */
  trackCameraStreamQuality(cameraType: 'nest' | 'manor', cameraId: string, quality: 'low' | 'medium' | 'high', bufferingEvents: number = 0): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'CameraStreamQuality',
      value: bufferingEvents,
      unit: 'Count',
      timestamp: Date.now(),
      dimensions: {
        cameraType: cameraType,
        cameraId: this.sanitizeCameraId(cameraId),
        quality: quality
      }
    });
  }

  /**
   * Track camera stream errors
   */
  trackCameraStreamError(cameraType: 'nest' | 'manor', cameraId: string, errorType: string): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'CameraStreamError',
      value: 1,
      unit: 'Count',
      timestamp: Date.now(),
      dimensions: {
        cameraType: cameraType,
        cameraId: this.sanitizeCameraId(cameraId),
        errorType: errorType
      }
    });
  }

  /**
   * Track navigation between tabs/pages
   */
  trackNavigation(fromPage: string, toPage: string, duration: number): void {
    if (!this.isEnabled) return;

    this.addMetric({
      metricName: 'NavigationLatency',
      value: duration,
      unit: 'Milliseconds',
      timestamp: Date.now(),
      dimensions: {
        from: fromPage,
        to: toPage
      }
    });
  }

  /**
   * Add a custom metric
   */
  addMetric(metric: MetricData): void {
    if (!this.isEnabled) return;

    this.metrics.push(metric);

    // Auto-flush if batch size is reached
    if (this.metrics.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Initialize Web Vitals tracking
   */
  private initializeWebVitalsTracking(): void {
    // Track Web Vitals using the same pattern as existing code
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        // Largest Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.addMetric({
            metricName: 'LargestContentfulPaint',
            value: lastEntry.startTime,
            unit: 'Milliseconds',
            timestamp: Date.now()
          });
        }).observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            // Type assertion for first-input entries which have processingStart
            const fidEntry = entry as PerformanceEventTiming;
            this.addMetric({
              metricName: 'FirstInputDelay',
              value: fidEntry.processingStart - fidEntry.startTime,
              unit: 'Milliseconds',
              timestamp: Date.now()
            });
          });
        }).observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift
        new PerformanceObserver((list) => {
          let clsValue = 0;
          const entries = list.getEntries();
          entries.forEach((entry) => {
            // Type assertion for layout-shift entries which have value and hadRecentInput
            const lsEntry = entry as any; // Use any for layout shift entries as they have special properties
            if (!lsEntry.hadRecentInput) {
              clsValue += lsEntry.value;
            }
          });
          if (clsValue > 0) {
            this.addMetric({
              metricName: 'CumulativeLayoutShift',
              value: clsValue,
              unit: 'Score',
              timestamp: Date.now()
            });
          }
        }).observe({ entryTypes: ['layout-shift'] });

      } catch (e) {
        console.warn('[MetricsCollector] Performance monitoring not fully supported:', e);
      }
    }
  }

  /**
   * Track Web Vitals for specific page
   */
  private trackWebVitals(pageName: string): void {
    if (typeof window !== 'undefined' && window.performance) {
      const timing = window.performance.timing;
      
      // Time to First Byte
      const ttfb = timing.responseStart - timing.navigationStart;
      this.addMetric({
        metricName: 'TimeToFirstByte',
        value: ttfb,
        unit: 'Milliseconds',
        timestamp: Date.now(),
        dimensions: { page: pageName }
      });

      // DOM Content Loaded
      const dcl = timing.domContentLoadedEventEnd - timing.navigationStart;
      this.addMetric({
        metricName: 'DOMContentLoaded',
        value: dcl,
        unit: 'Milliseconds',
        timestamp: Date.now(),
        dimensions: { page: pageName }
      });
    }
  }

  /**
   * Sanitize endpoint for metrics (remove sensitive data)
   */
  private sanitizeEndpoint(endpoint: string): string {
    return endpoint
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}')
      .replace(/\/\d+/g, '/{id}')
      .split('?')[0]; // Remove query parameters
  }

  /**
   * Sanitize camera ID for metrics (remove sensitive data while keeping useful info)
   */
  private sanitizeCameraId(cameraId: string): string {
    // Keep the camera type info but sanitize the actual ID
    if (cameraId.includes('nest_')) {
      return 'nest_camera_{id}';
    }
    if (cameraId.includes('manor_')) {
      return 'manor_camera_{id}';
    }
    // Generic camera ID sanitization
    return cameraId.replace(/[0-9a-f]{8,}/gi, '{id}').substring(0, 20);
  }

  /**
   * Start periodic flush of metrics
   */
  private startPeriodicFlush(): void {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastFlush >= this.flushInterval && this.metrics.length > 0) {
        this.flush();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Flush metrics to backend
   */
  async flush(): Promise<void> {
    if (this.metrics.length === 0 || !this.isEnabled) return;

    const metricsToSend = [...this.metrics];
    this.metrics = []; // Clear the buffer
    this.lastFlush = Date.now();

    try {
      // Send metrics in batches to avoid overwhelming the backend
      const response = await fetch(this.METRICS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics: metricsToSend,
          timestamp: Date.now(),
          source: 'frontend'
        })
      });

      if (!response.ok) {
        console.warn('[MetricsCollector] Failed to send metrics:', response.status);
        // Re-add metrics to buffer for retry (with limit to prevent memory buildup)
        if (this.metrics.length < this.batchSize * 2) {
          this.metrics.unshift(...metricsToSend.slice(-20)); // Keep only last 20 for retry
        }
      }
    } catch (error) {
      console.warn('[MetricsCollector] Error sending metrics:', error);
      // Re-add a subset of metrics for retry
      if (this.metrics.length < this.batchSize * 2) {
        this.metrics.unshift(...metricsToSend.slice(-10)); // Keep only last 10 for retry
      }
    }
  }

  /**
   * Get current widget metrics (for debugging)
   */
  getWidgetMetrics(): Map<string, WidgetMetrics> {
    return new Map(this.widgetMetrics);
  }

  /**
   * Enable/disable metrics collection
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Force flush metrics (useful for page unload)
   */
  forceFlush(): void {
    this.flush();
  }
}

// Create singleton instance
export const metricsCollector = new MetricsCollector();

// Flush metrics before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    metricsCollector.forceFlush();
  });

  // Also flush on visibility change (when user switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      metricsCollector.forceFlush();
    }
  });
}

export default metricsCollector;
