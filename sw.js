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

// Stratégia: Stale-While-Revalidate (ukáž z cache, ale na pozadí aktualizuj)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      
      // Vytvoríme prísľub zo siete (network fetch)
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        
        // KONTROLA: Ak je odpoveď neplatná (napr. chyba 404 alebo CORS), vrátime ju bez ukladania
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // DÔLEŽITÉ: Klonujeme odpoveď HNEĎ, kým je stream čerstvý
        const responseToCache = networkResponse.clone();

        // Uložíme kópiu do cache na pozadí
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        // Originálnu odpoveď vrátime pre prehliadač
        return networkResponse;
      }).catch(() => {
        // Ak zlyhá sieť aj cache (napr. ste offline a súbor v cache nie je)
        return cachedResponse;
      });

      // Ak máme niečo v cache, vrátime to okamžite (rýchlosť)
      // fetchPromise beží na pozadí a aktualizuje cache pre budúcu návštevu
      return cachedResponse || fetchPromise;
    })
  );
});