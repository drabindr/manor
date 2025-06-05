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
  document.body.classList.add('app-loaded');
};

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide loader after initial render
setTimeout(hideInitialLoader, 100);

reportWebVitals();
