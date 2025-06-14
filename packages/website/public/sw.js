// Service Worker for manor234
// Provides aggressive caching for improved page load performance
// Fixed to handle CSS MIME types correctly and skip caching in development

const CACHE_NAME = 'manor234-v3';
const CACHE_EXPIRY = 'manor234-expiry-v3';
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Check if we're in development mode
const isDevelopment = self.location.hostname === 'localhost' || 
                     self.location.hostname === '127.0.0.1' ||
                     self.location.hostname.includes('localhost');

// Cache expiry times (in milliseconds)
const CACHE_STRATEGIES = {
  static: 7 * 24 * 60 * 60 * 1000, // 7 days for static assets
  api: 5 * 60 * 1000, // 5 minutes for API responses
  images: 30 * 24 * 60 * 60 * 1000, // 30 days for images
};

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v3');
  
  if (isDevelopment) {
    console.log('[SW] Development mode detected, skipping cache preload');
    self.skipWaiting();
    return;
  }
  
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Caching static resources');
        return cache.addAll(STATIC_CACHE_URLS);
      }),
      caches.open(CACHE_EXPIRY).then((cache) => {
        console.log('[SW] Initializing expiry cache');
        return cache;
      })
    ]).then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== CACHE_EXPIRY) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper function to check if cache entry is expired
async function isCacheExpired(request, cacheType) {
  try {
    const expiryCache = await caches.open(CACHE_EXPIRY);
    const expiryResponse = await expiryCache.match(request.url + '_expiry');
    
    if (!expiryResponse) {
      return true; // No expiry data, consider expired
    }
    
    const expiryTime = await expiryResponse.text();
    return Date.now() > parseInt(expiryTime);
  } catch (e) {
    return true; // On error, consider expired
  }
}

// Helper function to set cache expiry
async function setCacheExpiry(url, cacheType) {
  try {
    const expiryCache = await caches.open(CACHE_EXPIRY);
    const expiryTime = Date.now() + CACHE_STRATEGIES[cacheType];
    const expiryResponse = new Response(expiryTime.toString());
    await expiryCache.put(url + '_expiry', expiryResponse);
  } catch (e) {
    console.warn('[SW] Failed to set cache expiry:', e);
  }
}

// Fetch event - implement smart caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip in development mode to prevent cache issues
  if (isDevelopment) {
    return;
  }
  
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
  
  // Skip CSS and JS files to prevent MIME type issues - only cache images, fonts, and HTML
  if (request.url.match(/\.(js|css)$/)) {
    return;
  }
  
  // Cache images, fonts, and other safe static assets
  if (request.url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico)$/)) {
    const cacheType = request.url.match(/\.(png|jpg|jpeg|gif|svg|ico)$/) ? 'images' : 'static';
    
    event.respondWith(
      caches.match(request).then(async (response) => {
        if (response && !(await isCacheExpired(request, cacheType))) {
          console.log('[SW] Serving from cache:', request.url);
          return response;
        }
        
        console.log('[SW] Fetching and caching:', request.url);
        try {
          const networkResponse = await fetch(request);
          
          // Don't cache non-successful responses
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          
          // Clone the response before caching
          const responseToCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, responseToCache);
          await setCacheExpiry(request.url, cacheType);
          
          return networkResponse;
        } catch (error) {
          // If network fails and we have a cached version (even expired), use it
          if (response) {
            console.log('[SW] Network failed, using stale cache:', request.url);
            return response;
          }
          throw error;
        }
      })
    );
  }
  
  // Stale-while-revalidate strategy for HTML pages
  else if (request.destination === 'document') {
    event.respondWith(
      caches.match(request).then(async (cachedResponse) => {
        const fetchPromise = fetch(request).then((response) => {
          // Clone and cache the response
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        });
        
        // Return cached version immediately if available, then update in background
        if (cachedResponse) {
          console.log('[SW] Serving HTML from cache, updating in background:', request.url);
          return cachedResponse;
        }
        
        // If no cached version, wait for network
        return fetchPromise.catch(() => {
          // If network fails, return a basic offline page
          return new Response('Application is offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
    );
  }
});

// Enhanced background sync for better offline functionality
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Clean up expired cache entries
      cleanExpiredCache()
    );
  }
});

// Helper function to clean expired cache entries
async function cleanExpiredCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const expiryCache = await caches.open(CACHE_EXPIRY);
    const requests = await cache.keys();
    
    for (const request of requests) {
      if (await isCacheExpired(request, 'static')) {
        console.log('[SW] Removing expired cache entry:', request.url);
        await cache.delete(request);
        await expiryCache.delete(request.url + '_expiry');
      }
    }
  } catch (e) {
    console.warn('[SW] Failed to clean expired cache:', e);
  }
}

// Handle push notifications (if needed in the future)
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received');
  // Future enhancement: handle push notifications
});