// app/static/sw.js
// Optimized Service Worker for better caching and offline support
const CACHE_NAME = 'big-table-app-v3';
const STATIC_CACHE = 'big-table-static-v3';
const API_CACHE = 'big-table-api-v3';
const FONT_CACHE = 'big-table-fonts-v3';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/static/css/styles.css',
  '/static/css/custom.css',
  // '/static/js/app.js',
  '/static/js/edit.js',
  '/static/manifest.json',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/favicon.ico'
];

// JavaScript libraries to cache
const JS_LIBS = [
  'https://code.jquery.com/jquery-3.7.1.min.js',
  'https://cdn.jsdelivr.net/npm/ag-grid-community@30.2.1/dist/ag-grid-community.min.js',
  'https://cdn.tailwindcss.com'
];

// CSS libraries to cache
const CSS_LIBS = [
  'https://cdn.jsdelivr.net/npm/ag-grid-community@30.2.1/styles/ag-grid.css',
  'https://cdn.jsdelivr.net/npm/ag-grid-community@30.2.1/styles/ag-theme-alpine.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Font resources to cache
const FONT_RESOURCES = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2'
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Caching static assets');
        return cache.addAll([...STATIC_ASSETS]);
      }),
      // Cache JS libraries
      caches.open(API_CACHE).then((cache) => {
        console.log('Caching JS libraries');
        return cache.addAll(JS_LIBS);
      }),
      // Cache CSS libraries
      caches.open(API_CACHE).then((cache) => {
        console.log('Caching CSS libraries');
        return cache.addAll(CSS_LIBS);
      }),
      // Cache fonts separately
      caches.open(FONT_CACHE).then((cache) => {
        console.log('Caching font resources');
        return cache.addAll(FONT_RESOURCES);
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
        if (![STATIC_CACHE, API_CACHE, FONT_CACHE].includes(key)) {
          console.log('Deleting old cache', key);
          return caches.delete(key);
        }
      }));
    })
    .then(() => self.clients.claim()) // Take control of all clients
  );
});

// Helper: Create an offline response
function createOfflineResponse(message = 'You appear to be offline') {
  return new Response(
    `<!DOCTYPE html>
    <html lang="et">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Võrguühendus puudub</title>
      <style>
        body { font-family: 'Inter', sans-serif; margin: 0; padding: 20px; color: #1e293b; }
        .offline-container { max-width: 500px; margin: 50px auto; text-align: center; padding: 20px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h1 { font-size: 24px; margin-bottom: 10px; }
        p { line-height: 1.6; color: #64748b; }
        .icon { font-size: 48px; margin-bottom: 20px; color: #3b82f6; }
        .btn { background-color: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="icon">⚠️</div>
        <h1>Võrguühendus puudub</h1>
        <p>${message}</p>
        <p>Kui teil on internetiühendus taastatud, proovige lehte värskendada.</p>
        <button class="btn" onclick="window.location.reload()">Proovi uuesti</button>
      </div>
    </body>
    </html>`,
    {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

// Fetch event - optimized caching strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Different caching strategies based on request type

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    // Network-first approach for API calls with offline fallback
    event.respondWith(networkFirst(event.request));
  }
  // Handle font requests - cache-first with long TTL
  else if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.pathname.includes('webfonts') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(cacheFirst(event.request, FONT_CACHE));
  }
  // Handle static assets and libraries - cache-first
  else if (
    url.pathname.startsWith('/static/') ||
    STATIC_ASSETS.includes(url.pathname) ||
    JS_LIBS.includes(event.request.url) ||
    CSS_LIBS.includes(event.request.url)
  ) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
  }
  // Handle main HTML requests - network-first with offline fallback
  else if (
    url.pathname === '/' ||
    url.pathname.endsWith('.html')
  ) {
    event.respondWith(networkFirst(event.request, true));
  }
  // Handle all other requests - stale-while-revalidate
  else {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});

// Network-first strategy with improved offline handling
async function networkFirst(request, isHtml = false) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    // Only cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);

      // Don't cache user-specific data - privacy protection
      if (!request.url.includes('/api/v1/table/data?')) {
        cache.put(request, networkResponse.clone());
      }
    }

    return networkResponse;
  } catch (error) {
    console.log('Network request failed, falling back to cache', request.url);
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // If cache fails and it's an HTML request, return pretty offline page
    if (isHtml) {
      return createOfflineResponse();
    }

    // For API requests, return JSON error
    return new Response(
      JSON.stringify({
        error: 'Võrguühendus puudub',
        offline: true,
        timestamp: new Date().toISOString()
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Cache-first strategy with background updates
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Return cached response immediately
    // Update cache in background only for non-font resources
    if (cacheName !== FONT_CACHE) {
      updateCache(request, cacheName);
    }
    return cachedResponse;
  }

  // If not in cache, get from network
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // If request fails, return generic error or fallback
    console.error('Cache miss and network error:', error);

    // Try to match similar resources - e.g., for images
    if (request.destination === 'image') {
      return caches.match('/static/icons/icon-192x192.png');
    }

    // For scripts/styles, return an empty response
    if (request.destination === 'script' || request.destination === 'style') {
      return new Response('/* Failed to load resource */', {
        headers: { 'Content-Type': request.destination === 'script' ? 'text/javascript' : 'text/css' }
      });
    }

    // For other resources, return a minimal offline response
    return new Response('Resource unavailable offline', { status: 408 });
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
  }).catch((error) => {
    console.error('Fetch failed in stale-while-revalidate:', error);
    // Return the cached response or null if none exists
    return cachedResponse;
  });

  // Return cached response immediately if available, otherwise wait for fetch
  return cachedResponse || fetchPromise;
}

// Helper function to update cache in the background
async function updateCache(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      await cache.put(request, networkResponse);
      console.log('Background update completed for:', request.url);
    }
  } catch (error) {
    // Silently fail on background updates
    console.log('Background cache update failed:', error);
  }
}