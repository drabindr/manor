export interface MetricData {
  metricName: string;
  value: number;
  unit: 'Milliseconds' | 'Count' | 'Percent';
  dimensions?: Array<{ Name: string; Value: string }>;
  timestamp?: Date;
}

export interface MetricsConfig {
  region: string;
  identityPoolId: string;
  namespace: string;
}

export interface MetricsService {
  init(config: MetricsConfig): Promise<void>;
  recordMetric(metric: MetricData): void;
  recordPageLoadMetric(componentType: string, loadTime: number, additionalDimensions?: Record<string, string>): void;
  recordCameraLoadMetric(cameraType: 'nest' | 'proprietary', cameraName: string, loadTime: number): void;
  recordSecurityLoadMetric(loadTime: number): void;
  recordDeviceLoadMetric(deviceType: string, loadTime: number): void;
  recordComponentLoadMetric(componentName: string, loadTime: number): void;
  destroy(): void;
}