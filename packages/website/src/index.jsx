import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import performance from './utils/performance.js';
import cameraConnectionService from './services/CameraConnectionService';

// Initialize performance monitoring
performance.init();

// Initialize camera connections early for faster load times
// Use a try-catch to ensure this doesn't break the app if there are issues
try {
  cameraConnectionService.init().catch(error => {
    console.warn('[CameraInit] Early camera connection initialization failed:', error);
  });
} catch (syncError) {
  console.warn('[CameraInit] Synchronous camera connection initialization failed:', syncError);
}

// Enhanced service worker registration with module preloading
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registration successful:', registration.scope);
        
        // Preload critical modules once SW is ready
        if (registration.active) {
          preloadCriticalResources();
        }
      })
      .catch((error) => {
        console.log('[SW] Registration failed:', error);
      });
  });
}

// Preload critical resources for faster subsequent loads
function preloadCriticalResources() {
  const criticalResources = [
    '/assets/react-vendor',
    '/assets/aws-auth',
    '/assets/icons',
    // Add camera-related resources for faster camera loading
    '/assets/aws-db',
    '/assets/video'
  ];
  
  criticalResources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = resource;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));

// Enhanced loader hiding with performance optimization
const hideInitialLoader = () => {
  const initialLoader = document.getElementById('initial-loader');
  if (initialLoader) {
    // Check if the app content is actually ready
    const rootElement = document.getElementById('root');
    const hasAppContent = rootElement && rootElement.children.length > 0;
    
    if (hasAppContent) {
      // Use requestAnimationFrame for smooth transition
      requestAnimationFrame(() => {
        initialLoader.style.transition = 'opacity 0.3s ease-out';
        initialLoader.style.opacity = '0';
        
        setTimeout(() => {
          document.body.classList.add('app-loaded');
          // Remove the loader completely after fade out
          if (initialLoader.parentNode) {
            initialLoader.parentNode.removeChild(initialLoader);
          }
          
          // Dispatch custom event for performance tracking
          window.dispatchEvent(new CustomEvent('appLoaded', {
            detail: { timestamp: performance.now() }
          }));
        }, 300);
      });
    } else {
      // If content isn't ready, try again in a bit
      setTimeout(hideInitialLoader, 50);
    }
  } else {
    document.body.classList.add('app-loaded');
  }
};

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide loader after app is mounted and ready to show content
// Use a shorter timeout and more intelligent detection
setTimeout(hideInitialLoader, 200);

// Cleanup camera connections when the page is unloaded
window.addEventListener('beforeunload', () => {
  try {
    cameraConnectionService.cleanup();
  } catch (error) {
    console.warn('[CameraCleanup] Error during cleanup:', error);
  }
});

reportWebVitals();
