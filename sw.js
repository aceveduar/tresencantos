// ⚠️ Incrementar CACHE_VERSION en cada deploy para invalidar caché anterior
const CACHE_VERSION = 'v18';
const CACHE = `tres-encantos-${CACHE_VERSION}`;

const STATIC = [
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/logo.png',
  '/ofelia.jpeg'
];

// Instalar: precachear archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar versiones anteriores del caché
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: solo interceptar GET
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Supabase, Google Fonts y APIs externas — siempre red, sin cachear
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Archivos propios — cache first, actualiza en background (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached || new Response('', { status: 503 }));

      return cached || networkFetch;
    })
  );
});
