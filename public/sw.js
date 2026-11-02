const CACHE_NAME = 'cic-miniapps-v12';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './cdi-movil.html',
  './checador-movil.html',
  './facefinder',
  './recorrido-movil.html',
  './bitacora-movil.html',
  './apple-touch-icon.png',
  './favicon.png',
  './favicon.ico',
  './iconos/icon-192.png',
  './iconos/icon-512.png',
  './iconos/icon-maskable-192.png',
  './iconos/icon-maskable-512.png',
  './iconos/apple-touch-icon.png',
  './iconos/favicon-32x32.png',
  './iconos/favicon-16x16.png'
];

// Instalación: Pre-cachear activos base de la PWA
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (asset) => {
          try {
            const res = await fetch(asset, { cache: 'no-cache' });
            if (res && (res.status === 200 || res.type === 'opaque')) {
              await cache.put(asset, res);
            }
          } catch (e) {
            // Un fallo en un recurso no esencial no detiene la instalación
          }
        })
      );
    })
  );
});

// Activación: Purgar cachés obsoletas y reclamar clientes inmediatamente
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[CIC Mini Apps SW] Limpiando caché anterior:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptor de peticiones
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Peticiones de API, SSE, túneles o métodos no-GET: Directo a la Red (Bypass)
  if (
    req.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/photos/') ||
    url.pathname.startsWith('/backend/') ||
    url.pathname.includes('/events') ||
    url.port === '7001' ||
    url.hostname.includes('workers.dev') || url.hostname.includes('cic-10.com')
  ) {
    return;
  }

  // 2. Navegación HTML: Network-First con fallback seguro a index.html en caché
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(async () => {
          // Si la red falla o está en modo standalone inicial, buscar en caché
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;

          const indexCached = await caches.match('./index.html', { ignoreSearch: true }) ||
                              await caches.match('./', { ignoreSearch: true }) ||
                              await caches.match('index.html', { ignoreSearch: true });
          if (indexCached) return indexCached;

          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>CIC Mini Apps</title></head><body style="font-family:system-ui,-apple-system,sans-serif;padding:30px;text-align:center;background:#0f172a;color:#f8fafc;"><h2>CIC Mini Apps</h2><p style="opacity:0.8;">Sin conexión al servidor en este momento.</p><button onclick="location.reload()" style="padding:10px 20px;border-radius:8px;border:none;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Reintentar</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 3. Activos Estáticos (JS, CSS, Imágenes, Fuentes): Stale-While-Revalidate seguro
  event.respondWith(
    (async () => {
      const cachedRes = await caches.match(req);
      if (cachedRes) {
        // En segundo plano revalidar desde la red
        fetch(req)
          .then(async (networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(req, networkRes);
            }
          })
          .catch(() => {});
        return cachedRes;
      }

      // Si no está en caché, traer de la red
      try {
        const networkRes = await fetch(req);
        if (networkRes && networkRes.status === 200) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return networkRes;
      } catch (err) {
        // Fallback aproximado si la red falló
        const fallback = await caches.match(req, { ignoreSearch: true });
        if (fallback) return fallback;
        throw err;
      }
    })()
  );
});

// Soporte para mensaje de actualización forzada desde la interfaz
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
