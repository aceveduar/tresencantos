// ⚠️ Incrementar CACHE_VERSION en cada deploy para invalidar caché anterior
const CACHE_VERSION = 'v661';
const CACHE = `tres-encantos-${CACHE_VERSION}`;

// Base path dinámica — funciona en GitHub Pages (/tresencantos) y en dominio raíz ("")
const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');

const STATIC = [
  `${BASE}/index.html`,
  `${BASE}/app.js`,
  `${BASE}/style.css`,
  `${BASE}/manifest.json`,
  `${BASE}/img/logo-vector/logo-fondo-claro.svg`,
  `${BASE}/img/logo-vector/logo-tres-encantos.svg`,
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

// Notificación de venta tocada — enfoca una pestaña ya abierta de la app (sin navegarla,
// para no interrumpir una venta a medias en Caja) o abre Actividad si no hay ninguna
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = `${BASE}/activity.html`;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsList => {
      for (const client of clientsList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// Cloudflare Pages redirige x.html → /x (308). Una respuesta que pasó por una redirección
// no se puede entregar a una navegación: Chrome la rechaza con ERR_FAILED (pasó al tocar
// "Tienda" en la app instalada, 2026-11-09). Se re-empaqueta como respuesta limpia.
function _clean(res) {
  if (!res || !res.redirected) return res;
  return res.blob().then(body => new Response(body, {
    status: res.status, statusText: res.statusText, headers: res.headers,
  }));
}

// La misma página tiene dos direcciones: los enlaces dicen "pos.html" y Cloudflare la
// guarda como "/pos" (y "index.html" como "/"). Sin conexión se busca también la otra.
function _altPath(path) {
  if (path.endsWith('/index.html')) return path.slice(0, -10);
  if (path.endsWith('/')) return path + 'index.html';
  if (path.endsWith('.html')) return path.slice(0, -5);
  if (!/\.[a-z0-9]+$/i.test(path)) return path + '.html';
  return null;
}
function _matchPage(req) {
  return caches.match(req).then(hit => {
    if (hit || req.mode !== 'navigate') return hit;
    const u = new URL(req.url);
    const alt = _altPath(u.pathname);
    return caches.match(u.origin + u.pathname, { ignoreSearch: true })
      .then(h => h || (alt && caches.match(u.origin + alt, { ignoreSearch: true })));
  });
}

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
    _matchPage(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok) {
          Promise.resolve(_clean(res.clone()))
            .then(clean => caches.open(CACHE).then(c => c.put(e.request, clean)));
        }
        return _clean(res);
      }).catch(() => _clean(cached) || new Response('', { status: 503 }));

      return cached ? _clean(cached) : networkFetch;
    })
  );
});
