// app/static/sw.js
// Optimized Service Worker for better caching and offline support

// Fetch the dynamic cache version from the server
const CACHE_BASE_NAME = 'big-table-app';
const CACHE_VERSION = '20250605183329-b118b8e2-20250605182738-20ae3d81-20250605181258-2b3956a3-20250605181130-3ba1a0b8-20250503123346-c4fef034-20250503122547-4fb1c5dd-20250503121236-ac28f715-20250503114739-e12e01bb-20250503111622-ec589d53-20250502235244-e9562722-20250502231058-be32e047-20250502215239-61ed980a-20250502212906-dc59fcd6-20250502211228-f79e9078-20250502210541-4ae607a2-20250502205439-a400e177-20250502204949-055f9ce4-20250502204531-94bd1779-20250502203539-86ca4450-20250502202335-5b67f44e-20250502202059-fd4b5b60-20250502115901-4979a90e-20250502115800-88c35d37-20250502114317-e61d4b8d-20250502111951-6c2679f9-20250502111648-4b0fac88-20250502110102-fd51d7af-20250502105911-c848d923-20250502104646-71b0baff-20250502102243-229ceaca-20250501130654-c20a8ae4-20250501124503-a05e8d6a-20250501124404-cf803d7e-20250501124308-ad92cd95-20250501122722-58f256ac-20250501122318-f1c0c8f9-20250501121456-15229f96-20250501121048-2d7f9483-20250501120923-a98c1121-20250501115250-c9c41f83-20250501113842-bf5cbaed-20250501113336-c2f50735-20250430133952-7dc1f0d5-20250430133917-ec74e317-20250430132830-e2595de0-20250430132700-083a487c-20250430132459-465d48e5-20250430130415-47a52b4d-20250430125911-706b14ca-v1';

// Try to get the current cache version from cache_version.json
fetch('/static/cache_version.json')
  .then(response => {
    if (response.ok) return response.json();
    throw new Error('Failed to load cache version');
  })
  .then(data => {
    if (data && data.version) {
      CACHE_VERSION = data.version;
      console.log(`Using cache version: ${CACHE_VERSION}`);
    }
  })
  .catch(error => {
    console.warn('Could not fetch cache version, using default:', error);
  });

// Dynamic cache names
const STATIC_CACHE = `${CACHE_BASE_NAME}-static-${CACHE_VERSION}`;
const API_CACHE = `${CACHE_BASE_NAME}-api-${CACHE_VERSION}`;
const FONT_CACHE = `${CACHE_BASE_NAME}-fonts-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
  // '/',
  // '/static/css/styles.css',
  // '/static/css/custom.css',
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