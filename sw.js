// ⚠️ Incrementar CACHE_VERSION en cada deploy para invalidar caché anterior
const CACHE_VERSION = 'v103';
const CACHE = `tres-encantos-${CACHE_VERSION}`;

// Base path dinámica — funciona en GitHub Pages (/tresencantos) y en dominio raíz ("")
const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');

const STATIC = [
  `${BASE}/index.html`,
  `${BASE}/app.js`,
  `${BASE}/style.css`,
  `${BASE}/manifest.json`,
  `${BASE}/img/logo.png`,
  `${BASE}/img/ofelia.jpeg`,
  `${BASE}/img/icono-192.png`,
  `${BASE}/img/icono-512.png`,
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

  // Supabase, Google Fonts, Drive y APIs externas — siempre red, sin cachear
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('drive.google.com')
  ) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Archivos propios — cache first, actualiza en background (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          const resClone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      }).catch(() => cached || new Response('', { status: 503 }));

      return cached || networkFetch;
    })
  );
});
