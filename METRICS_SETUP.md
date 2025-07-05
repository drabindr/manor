# Page Load Latency Metrics - CloudWatch Dashboard Setup

## Overview

This guide explains how to deploy and use the CloudWatch dashboard for monitoring page load latency metrics in the Manor application.

## Metrics Collected

The Manor frontend now collects the following performance metrics:

### Component Load Latency
- **Nest Camera Load Time**: Time from component mount to video stream establishment
- **Proprietary Camera Load Time**: Time from component mount to HLS stream playback
- **Security Card Load Time**: Time from component mount to security data loaded
- **Device Card Load Time**: Time from component mount to device controls ready

### Core Web Vitals
- **Largest Contentful Paint (LCP)**: Time to render the largest content element
- **First Input Delay (FID)**: Time from first user interaction to browser response
- **Cumulative Layout Shift (CLS)**: Measure of visual stability

### Page Performance
- **Page Load Time**: Total time from navigation start to load complete
- **DOM Ready Time**: Time from navigation start to DOM content loaded
- **Resource Count**: Number of JS/CSS resources loaded

## Environment Variables Required

Add these environment variables to your production deployment:

```bash
REACT_APP_AWS_REGION=us-east-1
REACT_APP_IDENTITY_POOL_ID=your-identity-pool-id
```

## CloudWatch Dashboard Deployment

### Method 1: AWS CLI
```bash
aws cloudwatch put-dashboard \
  --dashboard-name "Manor-Frontend-Performance" \
  --dashboard-body file://cloudwatch-dashboard.json \
  --region us-east-1
```

### Method 2: AWS Console
1. Go to CloudWatch in the AWS Console
2. Navigate to Dashboards
3. Click "Create dashboard"
4. Name it "Manor-Frontend-Performance"
5. Copy the JSON content from `cloudwatch-dashboard.json`
6. Use the "Source" tab to paste the JSON
7. Save the dashboard

## Dashboard Widgets

The dashboard includes the following widgets:

1. **Page Load Latency by Component Type**: Average load times for all component types
2. **Nest Camera Load Time Percentiles**: P50, P90, P99 percentiles for nest cameras
3. **Proprietary Camera Load Time Percentiles**: P50, P90, P99 percentiles for casa cameras
4. **Core Web Vitals**: LCP, FID, and CLS metrics
5. **Overall Page Load Performance**: Page load and DOM ready times
6. **Camera Load Errors**: Count of failed camera loads by type
7. **Resource Loading Statistics**: JavaScript and CSS resource counts

## Metric Dimensions

Metrics are tagged with the following dimensions for filtering:

- **ComponentType**: Camera, SecurityCard, DeviceCard, Component
- **CameraType**: nest, proprietary
- **CameraName**: Individual camera names for nest cameras
- **DeviceType**: Device category for device cards
- **Environment**: development, production
- **ResourceType**: Total, JavaScript, CSS

## Performance Impact

The metrics collection is designed to have minimal performance impact:

- Metrics are batched and sent asynchronously every 5 seconds
- CloudWatch API calls are non-blocking
- Failed metric submissions don't affect user experience
- Graceful degradation if CloudWatch is unavailable

## Monitoring and Alerts

Consider setting up CloudWatch alarms for:

- Camera load times > 10 seconds (indicates connectivity issues)
- High camera load error rates
- LCP > 2.5 seconds (poor user experience)
- FID > 100ms (poor responsiveness)

Example alarm for slow camera loads:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "Manor-Slow-Camera-Load" \
  --alarm-description "Camera load time exceeds 10 seconds" \
  --metric-name PageLoadLatency \
  --namespace Manor/Frontend \
  --statistic Average \
  --period 300 \
  --threshold 10000 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ComponentType,Value=Camera \
  --evaluation-periods 2
```

## Troubleshooting

### No Metrics Appearing
1. Check that environment variables are set correctly
2. Verify IAM permissions for the identity pool
3. Check browser console for metric service errors

### Metrics Delayed
- Metrics are batched for 5 seconds before sending
- CloudWatch metrics can take 1-5 minutes to appear
- Check the timestamp on metrics to verify freshness

### High Metric Costs
- Metrics are sent at most every 5 seconds per metric type
- Consider adjusting batch size or frequency if costs are high
- Use metric filters to reduce noise from development environments

## IAM Permissions

The Cognito Identity Pool needs CloudWatch permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "Manor/Frontend"
        }
      }
    }
  ]
}
```