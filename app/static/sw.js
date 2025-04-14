// app/static/sw.js (updated)
// Service Worker for caching and offline access
const CACHE_NAME = 'big-table-app-v2';
const STATIC_CACHE = 'big-table-static-v2';
const API_CACHE = 'big-table-api-v2';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/static/css/styles.css',
  '/static/js/app.js',
  '/static/manifest.json',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/favicon.ico',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/ag-grid-community@30.2.1/styles/ag-grid.css',
  'https://cdn.jsdelivr.net/npm/ag-grid-community@30.2.1/styles/ag-theme-alpine.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// JavaScript files to cache but check for updates
const JS_ASSETS = [
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.jsdelivr.net/npm/ag-grid-community@30.2.1/dist/ag-grid-community.min.js',
  'https://cdn.tailwindcss.com'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache JS assets
      caches.open(API_CACHE).then((cache) => {
        console.log('Caching JS assets');
        return cache.addAll(JS_ASSETS);
      })
    ])
    .then(() => self.skipWaiting()) // Force waiting service worker to activate
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (![STATIC_CACHE, API_CACHE].includes(key)) {
          console.log('Deleting old cache', key);
          return caches.delete(key);
        }
      }));
    })
    .then(() => self.clients.claim()) // Take control of all clients
  );
});

// Fetch event - stale-while-revalidate strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Different caching strategies based on request type
  if (event.request.method === 'GET') {
    // Handle API requests
    if (url.pathname.startsWith('/api/')) {
      // Network-first approach for API calls
      event.respondWith(networkFirst(event.request));
    }
    // Handle static assets
    else if (
      url.pathname.startsWith('/static/') ||
      STATIC_ASSETS.includes(url.pathname) ||
      JS_ASSETS.includes(event.request.url)
    ) {
      // Cache-first approach for static assets
      event.respondWith(cacheFirst(event.request));
    }
    // Handle other requests
    else {
      // Stale-while-revalidate for everything else
      event.respondWith(staleWhileRevalidate(event.request));
    }
  }
});

// Network-first strategy for API requests
async function networkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    const cache = await caches.open(API_CACHE);

    // Only cache successful responses and non-data API requests
    if (networkResponse.ok && !request.url.includes('/api/v1/table/data?')) {
      // Clone the response before using it
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If cache fails too, return a fallback or error
    return new Response(JSON.stringify({ error: 'Network request failed and no cache available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Cache-first strategy for static assets
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Return cached response but update cache in background
    updateCache(request);
    return cachedResponse;
  }

  // If not in cache, get from network and cache
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If both cache and network fail, return a fallback
    return caches.match('/');
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);

  const fetchPromise = fetch(request).then(async (networkResponse) => {
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // If fetch fails, we already have cachedResponse or null
    return cachedResponse || caches.match('/');
  });

  // Return the cached response immediately, or wait for the network if necessary
  return cachedResponse || fetchPromise;
}

// Helper function to update cache in the background
async function updateCache(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse);
    }
  } catch (error) {
    // Silently fail on background updates
    console.log('Background cache update failed:', error);
  }
}