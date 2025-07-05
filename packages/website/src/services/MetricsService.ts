import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';

interface MetricData {
  metricName: string;
  value: number;
  unit: 'Milliseconds' | 'Count' | 'Percent';
  dimensions?: Array<{ Name: string; Value: string }>;
  timestamp?: Date;
}

interface MetricsConfig {
  region: string;
  identityPoolId: string;
  namespace: string;
}

class MetricsService {
  private cloudWatchClient: CloudWatchClient | null = null;
  private config: MetricsConfig | null = null;
  private metricQueue: MetricData[] = [];
  private isInitialized = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 20; // CloudWatch limit
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  /**
   * Initialize the metrics service with AWS configuration
   */
  async init(config: MetricsConfig): Promise<void> {
    try {
      this.config = config;
      
      // Create credentials provider
      const credentials = fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region: config.region }),
        identityPoolId: config.identityPoolId,
      });

      // Initialize CloudWatch client
      this.cloudWatchClient = new CloudWatchClient({
        region: config.region,
        credentials,
      });

      this.isInitialized = true;
      this.startBatchFlush();
      
      console.debug('[MetricsService] Initialized successfully');
    } catch (error) {
      console.warn('[MetricsService] Failed to initialize:', error);
      // Gracefully degrade - metrics will be queued but not sent
    }
  }

  /**
   * Record a metric for later batched transmission to CloudWatch
   */
  recordMetric(metric: MetricData): void {
    // Add timestamp if not provided
    const metricWithTimestamp = {
      ...metric,
      timestamp: metric.timestamp || new Date(),
    };

    this.metricQueue.push(metricWithTimestamp);

    // If queue gets too large, flush immediately to prevent memory issues
    if (this.metricQueue.length >= this.BATCH_SIZE * 2) {
      this.flushMetrics();
    }
  }

  /**
   * Record page load latency metrics for specific components
   */
  recordPageLoadMetric(componentType: string, loadTime: number, additionalDimensions?: Record<string, string>): void {
    const dimensions = [
      { Name: 'ComponentType', Value: componentType },
      { Name: 'Environment', Value: process.env.NODE_ENV || 'development' },
    ];

    // Add any additional dimensions
    if (additionalDimensions) {
      Object.entries(additionalDimensions).forEach(([key, value]) => {
        dimensions.push({ Name: key, Value: value });
      });
    }

    this.recordMetric({
      metricName: 'PageLoadLatency',
      value: loadTime,
      unit: 'Milliseconds',
      dimensions,
    });
  }

  /**
   * Record camera load latency specifically
   */
  recordCameraLoadMetric(cameraType: 'nest' | 'proprietary', cameraName: string, loadTime: number): void {
    this.recordPageLoadMetric('Camera', loadTime, {
      CameraType: cameraType,
      CameraName: cameraName,
    });
  }

  /**
   * Record security card load latency
   */
  recordSecurityLoadMetric(loadTime: number): void {
    this.recordPageLoadMetric('SecurityCard', loadTime);
  }

  /**
   * Record device card load latency
   */
  recordDeviceLoadMetric(deviceType: string, loadTime: number): void {
    this.recordPageLoadMetric('DeviceCard', loadTime, {
      DeviceType: deviceType,
    });
  }

  /**
   * Record general component load latency
   */
  recordComponentLoadMetric(componentName: string, loadTime: number): void {
    this.recordPageLoadMetric('Component', loadTime, {
      ComponentName: componentName,
    });
  }

  /**
   * Start the batch flush timer
   */
  private startBatchFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flushMetrics();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Flush queued metrics to CloudWatch in batches
   */
  private async flushMetrics(): Promise<void> {
    if (!this.isInitialized || !this.cloudWatchClient || this.metricQueue.length === 0) {
      return;
    }

    // Process metrics in batches
    while (this.metricQueue.length > 0) {
      const batch = this.metricQueue.splice(0, this.BATCH_SIZE);
      
      try {
        const metricData = batch.map(metric => ({
          MetricName: metric.metricName,
          Value: metric.value,
          Unit: metric.unit,
          Dimensions: metric.dimensions,
          Timestamp: metric.timestamp,
        }));

        const command = new PutMetricDataCommand({
          Namespace: this.config!.namespace,
          MetricData: metricData,
        });

        await this.cloudWatchClient.send(command);
        console.debug(`[MetricsService] Successfully sent ${batch.length} metrics to CloudWatch`);
      } catch (error) {
        console.warn('[MetricsService] Failed to send metrics batch:', error);
        // Re-queue the failed batch (but only once to avoid infinite loops)
        if (batch.length > 0 && this.metricQueue.length < this.BATCH_SIZE * 3) {
          this.metricQueue.unshift(...batch);
        }
        break; // Stop processing batches if one fails
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining metrics
    this.flushMetrics();
    
    this.isInitialized = false;
    this.cloudWatchClient = null;
    this.config = null;
    this.metricQueue = [];
  }
}

// Singleton instance
export const metricsService = new MetricsService();
export default metricsService;