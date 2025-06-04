// Service Worker for manor234
// Provides basic caching for improved page load performance

const CACHE_NAME = 'manor234-v1';
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static resources');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - implement cache-first strategy for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip API requests and WebSocket connections
  if (request.url.includes('/api/') || 
      request.url.includes('websocket') ||
      request.url.includes('.amazonaws.com')) {
    return;
  }
  
  // Cache-first strategy for static assets
  if (request.url.includes('.js') || 
      request.url.includes('.css') || 
      request.url.includes('.png') ||
      request.url.includes('.jpg') ||
      request.url.includes('.svg') ||
      request.url.includes('.woff') ||
      request.url.includes('.woff2')) {
    
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            console.log('[SW] Serving from cache:', request.url);
            return response;
          }
          
          console.log('[SW] Fetching and caching:', request.url);
          return fetch(request).then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response before caching
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseToCache);
              });
            
            return response;
          });
        })
    );
  }
  
  // Network-first strategy for HTML pages
  else if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request);
        })
    );
  }
});

// Handle background sync for offline functionality
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  // Future enhancement: handle offline actions
});

// Handle push notifications (if needed in the future)
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received');
  // Future enhancement: handle push notifications
});