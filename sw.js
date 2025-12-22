const CACHE_NAME = 'okr-portal-v1';
const ASSETS_TO_CACHE = [
  '/portal/',
  '/portal/index.html',
  '/portal/css/styles.css',
  '/portal/css/logo2.svg',
  '/portal/js/mainWizard.js',
  '/portal/js/store.js',
  '/portal/js/config.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Inštalácia - uloženie základných súborov do cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Aktivácia - čistenie starých verzií cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Stratégia: Stale-While-Revalidate (ukáž z cache, ale na pozadí skús stiahnuť novú verziu)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});