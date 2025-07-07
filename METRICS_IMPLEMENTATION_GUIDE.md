# Manor Metrics Tracking Implementation Guide

## 🎯 Overview

This guide documents the complete implementation of performance metrics tracking for the Manor application, including Navigation Performance, Core Web Vitals, and Widget Load Error tracking.

## ✅ Successfully Implemented Features

### 1. **Dashboard Widgets** ✅
All previously missing dashboard widgets have been enabled:

- ✅ **Navigation Performance** - Tracks route transitions
- ✅ **Core Web Vitals** (LCP, FID, CLS) - Modern web performance metrics
- ✅ **Widget Load Errors** - Error tracking and monitoring

### 2. **Frontend Tracking Components** ✅

#### Navigation Tracking Hook
```typescript
// packages/website/src/hooks/useNavigationTracking.ts
import useNavigationTracking from './hooks/useNavigationTracking';

function AppContent() {
  // Automatically tracks route changes
  useNavigationTracking();
  return <Routes>...</Routes>;
}
```

#### Error Boundary Component  
```typescript
// packages/website/src/components/MetricsErrorBoundary.tsx
import MetricsErrorBoundary from './components/MetricsErrorBoundary';

<MetricsErrorBoundary widgetName="Thermostat">
  <ThermostatWidget />
</MetricsErrorBoundary>
```

#### Higher-Order Component for Error Tracking
```typescript
import { withErrorTracking } from './components/MetricsErrorBoundary';

const SafeThermostat = withErrorTracking(ThermostatWidget, 'Thermostat');
```

### 3. **MetricsCollector Enhancements** ✅

The MetricsCollector already includes comprehensive tracking:

- ✅ **Web Vitals**: LCP, FID, CLS automatic tracking
- ✅ **Navigation**: Route transition timing
- ✅ **Error Tracking**: Widget load failures
- ✅ **Widget Performance**: Load, render, and data fetch times
- ✅ **Camera Metrics**: Stream startup, quality, and errors
- ✅ **API Latency**: Endpoint response times

## 🚀 How to Use

### Basic Widget Integration

```typescript
import { useMetrics } from './hooks/useMetrics';
import MetricsErrorBoundary from './components/MetricsErrorBoundary';

function MyWidget() {
  const { trackLoadStart, trackLoadEnd, trackDataFetchStart, trackDataFetchEnd } = useMetrics('MyWidget');
  
  useEffect(() => {
    trackLoadStart();
    
    // Simulate data fetch
    trackDataFetchStart();
    fetchData()
      .then(() => trackDataFetchEnd(true))
      .catch(() => trackDataFetchEnd(false))
      .finally(() => trackLoadEnd(true));
  }, []);

  return <div>Widget Content</div>;
}

// Wrap with error boundary
export default function SafeMyWidget() {
  return (
    <MetricsErrorBoundary widgetName="MyWidget">
      <MyWidget />
    </MetricsErrorBoundary>
  );
}
```

### Navigation Tracking

Navigation is automatically tracked when you include the hook in your router:

```typescript
function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

function AppContent() {
  // This automatically tracks all route changes
  useNavigationTracking();
  
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin" element={<Admin />} />
    </Routes>
  );
}
```

### Manual Metrics

```typescript
import metricsCollector from './utils/MetricsCollector';

// Track custom navigation
metricsCollector.trackNavigation('/dashboard', '/settings', 450);

// Track custom errors
metricsCollector.addMetric({
  metricName: 'WidgetLoadError',
  value: 1,
  unit: 'Count',
  timestamp: Date.now(),
  dimensions: {
    widget: 'CustomWidget',
    errorType: 'timeout'
  }
});
```

### Camera Performance Tracking

```typescript
const { trackCameraStreamStartup, trackCameraStreamError } = useMetrics('CameraWidget');

// Track successful camera startup
trackCameraStreamStartup('nest', 'camera-001', 2100, true);

// Track camera error
trackCameraStreamError('nest', 'camera-001', 'connection-timeout');
```

## 📊 Dashboard Widgets

### Navigation Performance
- **Route Transitions**: Time taken to navigate between pages
- **Metrics**: Average navigation latency

### Core Web Vitals
- **LCP**: Largest Contentful Paint (loading performance)
- **FID**: First Input Delay (interactivity)
- **CLS**: Cumulative Layout Shift (visual stability)

### Widget Load Errors
- **Error Count**: Number of widget load failures
- **Error Types**: Categorized by error type (network, timeout, etc.)
- **Widget Breakdown**: Errors per widget type

## 🔧 Technical Implementation Details

### Metrics Collection Flow
1. **Frontend Events** → MetricsCollector → Batch Processing
2. **API Gateway** → Lambda Function → CloudWatch Metrics
3. **CloudWatch Dashboard** → Real-time Visualization

### Error Tracking Categories
- `chunk-load-error`: Failed to load JavaScript chunks
- `network-error`: Network connectivity issues
- `timeout-error`: Request timeouts
- `runtime-error`: JavaScript runtime errors
- `type-error`: Type-related errors
- `reference-error`: Reference errors

### Web Vitals Thresholds
- **LCP**: Good (<2.5s), Needs Improvement (2.5-4s), Poor (>4s)
- **FID**: Good (<100ms), Needs Improvement (100-300ms), Poor (>300ms)
- **CLS**: Good (<0.1), Needs Improvement (0.1-0.25), Poor (>0.25)

## 🎯 Dashboard Access

**CloudWatch Dashboard URL**: 
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=Manor-Performance-Metrics

## 📝 Recent Changes Summary

### Dashboard Stack Updates
- ✅ Enabled Navigation Performance widgets
- ✅ Enabled Core Web Vitals widgets (LCP, FID, CLS)
- ✅ Enabled Widget Load Error tracking
- ✅ Corrected dimension mappings for existing metrics

### Frontend Enhancements
- ✅ Added `useNavigationTracking` hook for automatic route tracking
- ✅ Created `MetricsErrorBoundary` component for error capture
- ✅ Enhanced error categorization and reporting
- ✅ Integrated error boundaries in App.tsx for all major components

### Backend Verification
- ✅ Confirmed metrics API endpoint processing new metric types
- ✅ Verified CloudWatch metric creation
- ✅ Tested complete pipeline with sample data

## 🚨 Monitoring & Alerts

The system now tracks:
- ✅ Page load performance across devices
- ✅ Widget-specific performance and errors
- ✅ Navigation timing between routes
- ✅ Core Web Vitals for user experience
- ✅ Camera stream performance
- ✅ API response times
- ✅ Error rates and types

## 🔄 Next Steps

1. **Monitor Dashboard**: Check metrics appearing in real-time usage
2. **Set Alerts**: Configure CloudWatch alarms for error thresholds
3. **Performance Optimization**: Use metrics to identify improvement areas
4. **User Experience**: Monitor Web Vitals for performance insights

All metrics tracking is now fully implemented and ready for production use!
