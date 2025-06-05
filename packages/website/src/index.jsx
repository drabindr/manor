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
    // Add fade out transition
    initialLoader.style.transition = 'opacity 0.3s ease-out';
    initialLoader.style.opacity = '0';
    setTimeout(() => {
      document.body.classList.add('app-loaded');
    }, 300);
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
// Give a bit more time for React components to initialize
setTimeout(hideInitialLoader, 500);

reportWebVitals();
