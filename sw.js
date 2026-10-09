// Versión "viva" de la aplicación: única fuente de verdad.
// El banner de index.html la solicita al SW (mensaje GET_VERSION)
// y el SW también la anuncia al activarse una nueva versión.
const APP_VERSION = 'v2.26';
const CACHE_NAME = 'planes-programas-' + APP_VERSION;
const BASE_PATH = '/planesyprogramas/';

const PRECACHE_URLS = [
    BASE_PATH,
    BASE_PATH + 'index.html',
    BASE_PATH + 'manifest.json',
    BASE_PATH + 'favicon.png',
    BASE_PATH + 'icon-192.png',
    BASE_PATH + 'icon-512.png'
];

// CDN resources to cache on first load
const CDN_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

// Install: precache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_URLS).then(() => {
                // Cache CDN resources but don't fail if they can't be cached
                return Promise.allSettled(
                    CDN_URLS.map(url =>
                        fetch(url).then(response => {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                        }).catch(() => {})
                    )
                );
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME && name.startsWith('planes-programas-'))
                    .map((name) => caches.delete(name))
            );
        }).then(() => self.clients.claim())
          .then(() => announceVersion())
    );
});

// Anuncia la versión activa a todas las pestañas/ventanas de la PWA
// (includeUncontrolled para alcanzar también a las que aún no controla)
function announceVersion() {
    return self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
            client.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
        });
    });
}

// Responde a la petición de versión desde la página (chip del banner)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_VERSION' && event.source) {
        event.source.postMessage({ type: 'APP_VERSION', version: APP_VERSION });
    }
});

// Fetch: network-first strategy for app files, cache-first for CDN
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET and cross-origin requests except CDN
    if (event.request.method !== 'GET') return;

    // Firebase RTDB requests: always network (real-time data)
    if (url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com')) {
        return;
    }

    // CDN resources: cache-first
    if (url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                });
            })
        );
        return;
    }

    // App shell: network-first with cache fallback
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
