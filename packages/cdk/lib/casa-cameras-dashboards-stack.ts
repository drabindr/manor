import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Dashboard, GraphWidget, Metric, YAxisProps } from 'aws-cdk-lib/aws-cloudwatch';

export class CasaCamerasDashboardsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a single CloudWatch Dashboard
    const dashboard = new Dashboard(this, 'CasaCamerasDashboard', {
      dashboardName: 'CasaCamerasDashboard',
    });

    // Add Local Writer widgets
    dashboard.addWidgets(...this.createLocalWriterWidgets());

    // Add Local Writer system metrics widgets 
    dashboard.addWidgets(...this.createLocalWriterSystemMetricsWidgets());

    // Add Camera Live Stream widgets
    dashboard.addWidgets(...this.createCameraStreamWidgets());

    // Add Camera Stream system metrics widgets (CPU, Memory, Disk) 
    dashboard.addWidgets(...this.createSystemMetricsWidgets());
  }

  private createLocalWriterWidgets(): GraphWidget[] {
    const namespace = 'CasaCameraLocalWriter';

    // Define specific metrics for Local Writer using dimensional metrics
    const diskUsageRootMetric = new Metric({
      namespace,
      metricName: 'DiskUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        'MountPoint': 'Root'
      },
    });

    const diskUsageVideoStorageMetric = new Metric({
      namespace,
      metricName: 'DiskUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        'MountPoint': 'VideoStorage'
      },
    });

    // Create widgets for Local Writer metrics
    return [
      new GraphWidget({
        title: 'Local Writer - Root Disk Usage (%)',
        left: [diskUsageRootMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 24,
      }),
      new GraphWidget({
        title: 'Local Writer - Video Storage Disk Usage (%)',
        left: [diskUsageVideoStorageMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 24,
      }),
    ];
  }

  private createLocalWriterSystemMetricsWidgets(): GraphWidget[] {
    const namespace = 'CasaCameraLocalWriter';

    const cpuUsageMetric = new Metric({
      namespace,
      metricName: 'CPUUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const memoryUsageMetric = new Metric({
      namespace,
      metricName: 'MemoryUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    return [
      new GraphWidget({
        title: 'Local Writer - CPU Usage (%)',
        left: [cpuUsageMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 12,
      }),
      new GraphWidget({
        title: 'Local Writer - Memory Usage (%)',
        left: [memoryUsageMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 12,
      }),
    ];
  }

  private createCameraStreamWidgets(): GraphWidget[] {
    const namespace = 'CasaCameraStream';

    // Define specific metrics for Camera Live Stream
    const connectionStatusMetric = new Metric({
      namespace,
      metricName: 'ConnectionStatus',
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const uploadDurationMetric = new Metric({
      namespace,
      metricName: 'UploadDuration',
      statistic: 'Average',
      period: cdk.Duration.minutes(1),
    });

    const streamDurationMetric = new Metric({
      namespace,
      metricName: 'StreamDuration',
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const uploadFailuresMetric = new Metric({
      namespace,
      metricName: 'UploadFailures',
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    const ffmpegRestartsMetric = new Metric({
      namespace,
      metricName: 'FFmpegRestarts',
      statistic: 'Sum',
      period: cdk.Duration.minutes(1),
    });

    // Create widgets for Camera Stream metrics
    return [
      new GraphWidget({
        title: 'Camera Stream - Connection Status',
        left: [connectionStatusMetric],
        leftYAxis: {
          min: 0,
          max: 1,
        } as YAxisProps,
      }),
      new GraphWidget({
        title: 'Camera Stream - Average Upload Duration (seconds)',
        left: [uploadDurationMetric],
      }),
      new GraphWidget({
        title: 'Camera Stream - Stream Duration (seconds)',
        left: [streamDurationMetric],
      }),
      new GraphWidget({
        title: 'Camera Stream - Upload Failures',
        left: [uploadFailuresMetric],
      }),
      new GraphWidget({
        title: 'Camera Stream - FFmpeg Restarts',
        left: [ffmpegRestartsMetric],
        leftYAxis: {
          min: 0,
        } as YAxisProps,
      }),
    ];
  }

  /**
   * Creates widgets for system metrics (CPUUsage, MemoryUsage, DiskUsage)
   * that your Python application emits under the "CasaCameraStream" namespace.
   * This tracks the hls.py streaming application system usage.
   */
  private createSystemMetricsWidgets(): GraphWidget[] {
    const namespace = 'CasaCameraStream';

    const cpuUsageMetric = new Metric({
      namespace,
      metricName: 'CPUUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const memoryUsageMetric = new Metric({
      namespace,
      metricName: 'MemoryUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const diskUsageMetric = new Metric({
      namespace,
      metricName: 'DiskUsage',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    return [
      new GraphWidget({
        title: 'System - CPU Usage (%)',
        left: [cpuUsageMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 8,
      }),
      new GraphWidget({
        title: 'System - Memory Usage (%)',
        left: [memoryUsageMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 8,
      }),
      new GraphWidget({
        title: 'System - Disk Usage (%)',
        left: [diskUsageMetric],
        leftYAxis: {
          min: 0,
          max: 100,
        } as YAxisProps,
        width: 8,
      }),
    ];
  }
}
