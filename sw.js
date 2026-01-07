/* sw.js - ENHANCED PWA STRATEGY (v5.3) */

// Verzia cache - pri automate tu build proces vloží hash (napr. 'v' + Date.now())
const CACHE_VERSION = 'v5.5';
const STATIC_CACHE = `okr-portal-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `okr-portal-dynamic-${CACHE_VERSION}`;

// Jadro aplikácie (Shell) - stratégia Cache First
const CORE_ASSETS = [
    './',
    './index.html',
    './css/styles.css',
    './js/mainWizard.js',
    './js/config.js',
    './js/store.js',
    './js/utils.js'
];

// Zoznam overených CDN pre stratégiu Stale-While-Revalidate
const EXTERNAL_LIBS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net'
];

/**
 * INSTALL: Inštalácia Service Workera a pred-kešovanie jadra
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => {
            console.log('[SW] Kešujem statické jadro aplikácie');
            return cache.addAll(CORE_ASSETS);
        })
    );
    self.skipWaiting();
});

/**
 * ACTIVATE: Čistenie starých verzií cache (Cache-Busting)
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Ak cache nepatrí k aktuálnej verzii, vymažeme ju
                    if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                        console.log('[SW] Odstraňujem starú cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

/**
 * FETCH: Inteligentné riadenie požiadaviek podľa typu assetu
 * ✅ OPRAVA: Presný pathname matching namiesto includes()
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. ✅ OPRAVA: Ignorujeme nepodporované schémy (chrome-extension, about, data, blob, atď.)
    const unsupportedSchemes = ['chrome-extension', 'chrome', 'about', 'moz-extension', 'safari-extension', 'blob', 'data'];
    if (unsupportedSchemes.some(scheme => url.protocol.startsWith(scheme))) {
        return;
    }

    // 2. Ignorujeme Firebase API a iné ako GET požiadavky
    if (event.request.method !== 'GET' || url.href.includes('firestore.googleapis.com')) {
        return;
    }

    // 2. Stratégia STALE-WHILE-REVALIDATE pre externé knižnice (CDN)
    const isExternalLib = EXTERNAL_LIBS.some(lib => url.hostname.includes(lib));
    
    if (isExternalLib) {
        event.respondWith(
            caches.open(DYNAMIC_CACHE).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => null); // Tichý fail ak je sieť offline

                    // Vrátime cache (ak je) alebo počkáme na sieť
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // ✅ OPRAVA: Presný matching pomocou pathname pre index.html
    // Stratégia NETWORK FIRST s cache fallbackom - zabráni "zaseknutiu" na starej verzii
    const pathname = url.pathname;
    const isIndexHtml = pathname === '/' || pathname === '/index.html' || pathname.endsWith('/index.html');
    
    if (isIndexHtml) {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // ✅ OPRAVA: Klonujeme response pred jeho použitím
                    if (networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(STATIC_CACHE).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Offline fallback - použijeme cache
                    return caches.match(event.request);
                })
        );
        return;
    }

    // 3. ✅ OPRAVA: Presný pathname matching pre statické jadro - CACHE FIRST stratégia
    const isStaticAsset = CORE_ASSETS.some(asset => {
        // Normalizácia cesty (odstránime './' prefix)
        const normalizedAsset = asset.replace(/^\.\//, '');
        // Presné porovnanie pathname (koncí na náš asset)
        return pathname.endsWith('/' + normalizedAsset) || pathname === '/' + normalizedAsset;
    });
    
    if (isStaticAsset) {
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request);
            })
        );
        return;
    }

    // 4. Stratégia NETWORK FIRST pre ostatné dynamické dáta s fallbackom
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Kešujeme úspešné GET požiadavky na naše assety
                if (networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Offline fallback
                return caches.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;

                    // Fallback pre HTML (zobraziť index.html ak sme offline)
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});