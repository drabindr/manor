import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import performance from './utils/performance.js';

// Initialize performance monitoring
performance.init();

// Register service worker for caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registration successful:', registration.scope);
      })
      .catch((error) => {
        console.log('[SW] Registration failed:', error);
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));

// Hide initial loader once React app starts rendering
const hideInitialLoader = () => {
  const initialLoader = document.querySelector('.initial-loader');
  if (initialLoader) {
    // Check if the app content is actually ready
    const rootElement = document.getElementById('root');
    const hasAppContent = rootElement && rootElement.children.length > 0;
    
    if (hasAppContent) {
      // Add fade out transition
      initialLoader.style.transition = 'opacity 0.3s ease-out';
      initialLoader.style.opacity = '0';
      setTimeout(() => {
        document.body.classList.add('app-loaded');
        // Remove the loader completely after fade out
        if (initialLoader.parentNode) {
          initialLoader.parentNode.removeChild(initialLoader);
        }
      }, 300);
    } else {
      // If content isn't ready, try again in a bit
      setTimeout(hideInitialLoader, 100);
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

reportWebVitals();
