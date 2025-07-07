import React, { Component, ErrorInfo, ReactNode } from 'react';
import metricsCollector from '../utils/MetricsCollector';

interface Props {
  children: ReactNode;
  widgetName?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary that tracks widget load errors and sends them to CloudWatch
 */
class MetricsErrorBoundary extends Component<Props, State> {
  private errorStartTime: number = 0;

  public state: State = {
    hasError: false
  };

  constructor(props: Props) {
    super(props);
    this.errorStartTime = performance.now();
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorDuration = performance.now() - this.errorStartTime;
    const widgetName = this.props.widgetName || 'Unknown';
    
    console.error('[MetricsErrorBoundary] Widget error captured:', {
      widget: widgetName,
      error: error.message,
      duration: errorDuration,
      componentStack: errorInfo.componentStack
    });

    // Track the widget load error
    metricsCollector.addMetric({
      metricName: 'WidgetLoadError',
      value: 1,
      unit: 'Count',
      timestamp: Date.now(),
      dimensions: {
        widget: widgetName,
        errorType: this.getErrorType(error),
        errorMessage: error.message.substring(0, 100) // Truncate long messages
      },
      metadata: {
        componentStack: errorInfo.componentStack?.substring(0, 500),
        duration: errorDuration
      }
    });

    // Also track as a failed widget load
    metricsCollector.endWidgetLoad(widgetName, false);
  }

  private getErrorType(error: Error): string {
    if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
      return 'chunk-load-error';
    }
    if (error.message.includes('Network Error') || error.message.includes('fetch')) {
      return 'network-error';
    }
    if (error.message.includes('TypeError')) {
      return 'type-error';
    }
    if (error.message.includes('ReferenceError')) {
      return 'reference-error';
    }
    if (error.message.includes('timeout')) {
      return 'timeout-error';
    }
    return 'runtime-error';
  }

  public render() {
    if (this.state.hasError) {
      // Return custom fallback UI or a default error message
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ 
          padding: '20px', 
          border: '1px solid #ff6b6b', 
          borderRadius: '8px', 
          backgroundColor: '#ffe0e0',
          color: '#cc0000',
          margin: '10px 0'
        }}>
          <h3>Widget Error</h3>
          <p>
            {this.props.widgetName ? `The ${this.props.widgetName} widget` : 'This widget'} 
            {' '}encountered an error and couldn't load properly.
          </p>
          <details style={{ marginTop: '10px' }}>
            <summary>Error Details</summary>
            <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '200px' }}>
              {this.state.error?.message}
            </pre>
          </details>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#ff6b6b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap widgets with error tracking
 */
export const withErrorTracking = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  widgetName: string,
  fallback?: ReactNode
): React.ComponentType<P> => {
  const WithErrorTrackingComponent: React.FC<P> = (props: P) => {
    return (
      <MetricsErrorBoundary widgetName={widgetName} fallback={fallback}>
        <WrappedComponent {...props} />
      </MetricsErrorBoundary>
    );
  };

  WithErrorTrackingComponent.displayName = `withErrorTracking(${WrappedComponent.displayName || WrappedComponent.name})`;
  
  return WithErrorTrackingComponent;
};

export default MetricsErrorBoundary;
