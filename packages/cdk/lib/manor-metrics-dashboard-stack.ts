import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Dashboard, GraphWidget, Metric, YAxisProps, SingleValueWidget, LogQueryWidget } from 'aws-cdk-lib/aws-cloudwatch';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class ManorMetricsDashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the metrics collection Lambda function
    const metricsLambda = new NodejsFunction(this, 'MetricsHandler', {
      entry: 'lambda/metrics-handler.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant CloudWatch permissions to the Lambda
    metricsLambda.addToRolePolicy(new PolicyStatement({
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: ['*']
    }));

    // Create API Gateway for metrics endpoint
    const api = new RestApi(this, 'ManorMetricsApi', {
      restApiName: 'Manor Metrics Collection API',
      description: 'API for collecting frontend performance metrics',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      },
    });

    // Add metrics endpoint
    const metricsResource = api.root.addResource('metrics');
    const metricsIntegration = new LambdaIntegration(metricsLambda, {
      proxy: true,
    });
    metricsResource.addMethod('POST', metricsIntegration);
    // OPTIONS method is automatically added by CORS configuration

    // Create the comprehensive Manor dashboard
    const dashboard = new Dashboard(this, 'ManorPerformanceDashboard', {
      dashboardName: 'Manor-Performance-Metrics',
    });

    // Add all the widget sections
    dashboard.addWidgets(...this.createPageLoadWidgets());
    dashboard.addWidgets(...this.createWidgetPerformanceWidgets());
    dashboard.addWidgets(...this.createApiLatencyWidgets());
    dashboard.addWidgets(...this.createUserInteractionWidgets());
    dashboard.addWidgets(...this.createNavigationWidgets());
    dashboard.addWidgets(...this.createWebVitalsWidgets());
    dashboard.addWidgets(...this.createCameraPerformanceWidgets());
    dashboard.addWidgets(...this.createErrorMonitoringWidgets());

    // Output the API endpoint
    new cdk.CfnOutput(this, 'MetricsApiEndpoint', {
      value: api.url + 'metrics',
      description: 'Endpoint for collecting frontend metrics',
      exportName: 'ManorMetricsApiEndpoint',
    });

    // Output the dashboard URL
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=Manor-Performance-Metrics`,
      description: 'CloudWatch Dashboard URL for Manor Performance Metrics'
    });
  }

  /**
   * Page Load Performance Widgets
   */
  private createPageLoadWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    const pageLoadLatencyMetric = new Metric({
      namespace,
      metricName: 'PageLoadLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // Also include metrics for specific pages/devices - with correct dimensions that have data
    const pageLoadDesktopMetric = new Metric({
      namespace,
      metricName: 'PageLoadLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        userAgent: 'Desktop',
        page: 'Dashboard'
      }
    });

    const pageLoadMobileMetric = new Metric({
      namespace,
      metricName: 'PageLoadLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        userAgent: 'Mobile',
        page: 'App'
      }
    });

    const ttfbMetric = new Metric({
      namespace,
      metricName: 'TimeToFirstByte',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        page: 'App'
      }
    });

    const dclMetric = new Metric({
      namespace,
      metricName: 'DOMContentLoaded',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        page: 'App'
      }
    });

    return [
      new GraphWidget({
        title: 'Page Load Performance Overview',
        left: [pageLoadLatencyMetric, pageLoadDesktopMetric, pageLoadMobileMetric, ttfbMetric, dclMetric],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
      new SingleValueWidget({
        title: 'Average Page Load Time',
        metrics: [pageLoadLatencyMetric],
        width: 8,
        height: 6,
      }),
      new SingleValueWidget({
        title: 'Average Time to First Byte',
        metrics: [ttfbMetric],
        width: 8,
        height: 6,
      }),
      new SingleValueWidget({
        title: 'Average DOM Content Loaded',
        metrics: [dclMetric],
        width: 8,
        height: 6,
      }),
    ];
  }

  /**
   * Individual Widget Performance Widgets
   */
  private createWidgetPerformanceWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    // Create metrics for each widget type - using actual widget names from data
    const widgets = [
      'Thermostat', 'LGAppliances', 'DeviceControl'
    ];

    const widgetMetrics = widgets.map(widget => 
      new Metric({
        namespace,
        metricName: 'WidgetLoadLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          widget: widget,
          status: 'success'
        }
      })
    );

    const dataFetchMetrics = widgets.map(widget => 
      new Metric({
        namespace,
        metricName: 'DataFetchLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          widget: widget,
          status: 'success'
        }
      })
    );

    const renderMetrics = widgets.map(widget => 
      new Metric({
        namespace,
        metricName: 'WidgetRenderLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          widget: widget
        }
      })
    );

    // Only include widgets that actually have render data
    const renderMetricsWithData = [
      new Metric({
        namespace,
        metricName: 'WidgetRenderLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          widget: 'Thermostat'
        }
      }),
      new Metric({
        namespace,
        metricName: 'WidgetRenderLatency',
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
        dimensionsMap: {
          widget: 'LGAppliances'
        }
      })
    ];

    return [
      new GraphWidget({
        title: 'Widget Load Latency by Component',
        left: widgetMetrics,
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
      new GraphWidget({
        title: 'Data Fetch Latency by Widget',
        left: dataFetchMetrics,
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Render Latency by Widget',
        left: renderMetricsWithData,
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 12,
        height: 6,
      }),
    ];
  }

  /**
   * API Latency Widgets
   */
  private createApiLatencyWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    const apiLatencyMetric = new Metric({
      namespace,
      metricName: 'ApiCallLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        status: 'success'
      }
    });

    // Add metrics for specific API endpoints we have data for
    const thermostatApiMetric = new Metric({
      namespace,
      metricName: 'ApiCallLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        endpoint: '/api/thermostat/{id}',
        status: 'success'
      }
    });

    const lgApiMetric = new Metric({
      namespace,
      metricName: 'ApiCallLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        endpoint: '/lg/devices/list',
        status: 'success'
      }
    });

    const apiSuccessRate = new Metric({
      namespace,
      metricName: 'ApiCallLatency',
      statistic: 'SampleCount',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        status: 'success'
      }
    });

    const apiErrorRate = new Metric({
      namespace,
      metricName: 'ApiCallLatency',
      statistic: 'SampleCount',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        status: 'error'
      }
    });

    return [
      new GraphWidget({
        title: 'API Call Performance',
        left: [apiLatencyMetric, thermostatApiMetric, lgApiMetric],
        right: [apiSuccessRate, apiErrorRate],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        rightYAxis: {
          min: 0,
          label: 'Count'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
    ];
  }

  /**
   * User Interaction Widgets
   */
  private createUserInteractionWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    const interactionLatencyMetric = new Metric({
      namespace,
      metricName: 'UserInteractionLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        interaction: 'button-click'
      }
    });

    return [
      new GraphWidget({
        title: 'User Interaction Response Times',
        left: [interactionLatencyMetric],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
    ];
  }

  /**
   * Navigation Performance Widgets
   */
  private createNavigationWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    // Navigation metric without dimensions (aggregated)
    const navigationLatencyMetric = new Metric({
      namespace,
      metricName: 'NavigationLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // Navigation metric with specific route transition that we know exists
    const dashboardToAdminNavigation = new Metric({
      namespace,
      metricName: 'NavigationLatency',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        from: '/dashboard',
        to: '/admin'
      }
    });

    return [
      new GraphWidget({
        title: 'Navigation Performance',
        left: [navigationLatencyMetric, dashboardToAdminNavigation],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
    ];
  }

  /**
   * Web Vitals Widgets
   */
  private createWebVitalsWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    const lcpMetric = new Metric({
      namespace,
      metricName: 'LargestContentfulPaint',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const fidMetric = new Metric({
      namespace,
      metricName: 'FirstInputDelay',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    const clsMetric = new Metric({
      namespace,
      metricName: 'CumulativeLayoutShift',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    return [
      new GraphWidget({
        title: 'Core Web Vitals',
        left: [lcpMetric, fidMetric],
        right: [clsMetric],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        rightYAxis: {
          min: 0,
          label: 'Score'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
      new SingleValueWidget({
        title: 'Largest Contentful Paint (LCP)',
        metrics: [lcpMetric],
        width: 8,
        height: 4,
      }),
      new SingleValueWidget({
        title: 'First Input Delay (FID)',
        metrics: [fidMetric],
        width: 8,
        height: 4,
      }),
      new SingleValueWidget({
        title: 'Cumulative Layout Shift (CLS)',
        metrics: [clsMetric],
        width: 8,
        height: 4,
      }),
    ];
  }

  /**
   * Camera Performance Widgets
   */
  private createCameraPerformanceWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    // Camera stream startup time metrics - with proper dimensions that have data
    const cameraStartupMetric = new Metric({
      namespace,
      metricName: 'CameraStreamStartup',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'nest',
        cameraId: 'nest_camera_{id}',
        status: 'success'
      }
    });

    // Camera connection time metrics - with proper dimensions that have data
    const cameraConnectionMetric = new Metric({
      namespace,
      metricName: 'CameraConnectionTime',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'nest',
        cameraId: 'nest_camera_{id}',
        status: 'success'
      }
    });

    // Nest vs Manor camera startup times - with proper dimensions that have data
    const nestStartupMetric = new Metric({
      namespace,
      metricName: 'CameraStreamStartup',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'nest',
        cameraId: 'nest_camera_{id}',
        status: 'success'
      }
    });

    const manorStartupMetric = new Metric({
      namespace,
      metricName: 'CameraStreamStartup',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'manor',
        cameraId: 'manor_camera_{id}',
        status: 'success'
      }
    });

    // Camera quality metrics - with proper dimensions that have data (old format)
    const cameraQualityMetric = new Metric({
      namespace,
      metricName: 'CameraStreamQuality',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'nest_camera_{id}',
        quality: 'high'
      }
    });

    // Camera quality metrics - with proper dimensions that have data (new format)
    const cameraQualityNewMetric = new Metric({
      namespace,
      metricName: 'CameraStreamQuality',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'nest',
        cameraId: 'nest_camera_{id}',
        quality: 'high'
      }
    });

    // Camera error metrics - with proper dimensions that have data
    const cameraErrorMetric = new Metric({
      namespace,
      metricName: 'CameraStreamError',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        cameraType: 'manor',
        cameraId: 'manor_camera_{id}',
        errorType: 'connection-failed'
      }
    });

    return [
      new GraphWidget({
        title: 'Camera Stream Startup Times',
        left: [cameraStartupMetric],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Camera Connection Times',
        left: [cameraConnectionMetric],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Nest vs Manor Camera Startup Comparison',
        left: [nestStartupMetric, manorStartupMetric],
        leftYAxis: {
          min: 0,
          label: 'Milliseconds'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
      new SingleValueWidget({
        title: 'Average Camera Stream Quality',
        metrics: [cameraQualityMetric, cameraQualityNewMetric],
        width: 8,
        height: 4,
      }),
      new SingleValueWidget({
        title: 'Camera Connection Errors',
        metrics: [cameraErrorMetric],
        width: 8,
        height: 4,
      }),
      new SingleValueWidget({
        title: 'Average Startup Time',
        metrics: [cameraStartupMetric],
        width: 8,
        height: 4,
      }),
    ];
  }

  /**
   * Error Monitoring Widgets
   */
  private createErrorMonitoringWidgets(): cdk.aws_cloudwatch.IWidget[] {
    const namespace = 'ManorApp/Performance';

    // Widget errors aggregated (no dimensions)
    const widgetErrorsMetric = new Metric({
      namespace,
      metricName: 'WidgetLoadError',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    // Widget errors by specific widgets that exist
    const thermostatErrorsMetric = new Metric({
      namespace,
      metricName: 'WidgetLoadError',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        widget: 'Thermostat'
      }
    });

    const lgAppliancesErrorsMetric = new Metric({
      namespace,
      metricName: 'WidgetLoadError',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        widget: 'LGAppliances'
      }
    });

    const deviceControlErrorsMetric = new Metric({
      namespace,
      metricName: 'WidgetLoadError',
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
      dimensionsMap: {
        widget: 'DeviceControl'
      }
    });

    return [
      new GraphWidget({
        title: 'Widget Load Errors',
        left: [widgetErrorsMetric, thermostatErrorsMetric, lgAppliancesErrorsMetric, deviceControlErrorsMetric],
        leftYAxis: {
          min: 0,
          label: 'Count'
        } as YAxisProps,
        width: 24,
        height: 6,
      }),
    ];
  }
}
