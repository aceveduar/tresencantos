/* ── NAVEGACIÓN DE CONFIGURACIÓN (2026-10-14) ─────────────────────────────
   Antes era una sola página de ~4,500 px en celular con las 5 secciones
   apiladas. Patrón Shopify Admin: en celular un índice (ícono + nombre + qué
   hay adentro) y cada sección se abre sola con "‹ Configuración"; en
   escritorio menú fijo a la izquierda y una sección a la derecha. Cada
   sección tiene su dirección (#usuarios, #datos…): el botón Atrás del celular
   funciona y se puede enlazar directo. Las secciones que el permiso oculta
   (style.display='none' en settings.js) tampoco aparecen en el menú; si solo
   queda una, se abre directo sin índice. No toca el contenido de las secciones. */

const _SET_SECTIONS = [
  { id: 'section-users', slug: 'usuarios', title: 'Usuarios y permisos', desc: 'Quién entra y qué puede hacer',
    icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
  { id: 'section-notices', slug: 'avisos', title: 'Avisos al equipo', desc: 'Mensajes en la campana y quién los leyó',
    icon: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
  { id: 'section-catalog', slug: 'catalogo', title: 'Catálogo y Tienda', desc: 'Categorías, revista y opciones de los módulos',
    icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
  { id: 'section-data', slug: 'datos', title: 'Datos y respaldos', desc: 'Exportar, importar, respaldos y revisiones',
    icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>' },
  { id: 'section-integrations', slug: 'integraciones', title: 'Integraciones', desc: 'Inteligencia artificial y fotos en Drive',
    icon: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>' },
];
const _setIsDesktop = () => window.matchMedia('(min-width: 900px)').matches;
let _setAllowed = [];
let _setCameFromIndex = false;

function _setRender() {
  const slug = decodeURIComponent(location.hash.replace('#', ''));
  let cur = _setAllowed.find(s => s.slug === slug);
  const single = _setAllowed.length === 1;
  if (!cur && (single || _setIsDesktop())) cur = _setAllowed[0];
  document.body.classList.toggle('set-single', single);
  document.body.classList.toggle('set-index', !cur);
  _SET_SECTIONS.forEach(s => document.getElementById(s.id)?.classList.toggle('set-active', !!cur && s.id === cur.id));
  document.querySelectorAll('.set-nav-item').forEach(b => {
    const on = !!cur && b.dataset.slug === cur.slug;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.title = cur ? `${cur.title} · Configuración` : 'Configuración';
}

function _setGo(slug) {
  _setCameFromIndex = !_setIsDesktop();
  if (location.hash === '#' + slug) _setRender(); else location.hash = slug;
  window.scrollTo(0, 0);
}

function _setBack() {
  // Si llegó desde el índice, Atrás regresa ahí sin dejar pasos de más en el historial.
  if (_setCameFromIndex) { _setCameFromIndex = false; history.back(); }
  else { history.replaceState(null, '', location.pathname); _setRender(); }
  window.scrollTo(0, 0);
}

// Subtítulo de grupo (scard-divider-label) sin ninguna fila visible debajo: se oculta.
window._setTidyDividers = function () {
  document.querySelectorAll('.scard-divider-label').forEach(lab => {
    let el = lab.nextElementSibling, any = false;
    while (el && !el.classList.contains('scard-divider-label')) {
      if (el.classList.contains('scard-row') && getComputedStyle(el).display !== 'none') any = true;
      el = el.nextElementSibling;
    }
    lab.style.display = any ? '' : 'none';
  });
};

// Lo llama settings.js después de aplicar los permisos (antes de init()).
function _setNavInit() {
  const main = document.querySelector('.main');
  if (!main || document.getElementById('set-nav')) return;
  _setAllowed = _SET_SECTIONS.filter(s => {
    const el = document.getElementById(s.id);
    return el && el.style.display !== 'none';
  });
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const nav = document.createElement('nav');
  nav.id = 'set-nav';
  nav.className = 'set-nav';
  nav.setAttribute('aria-label', 'Secciones de Configuración');
  nav.innerHTML = `<h1 class="set-nav-title">Configuración</h1><div class="set-nav-list">${_setAllowed.map(s => `
    <button type="button" class="set-nav-item" data-slug="${s.slug}" onclick="_setGo('${s.slug}')">
      <span class="set-nav-ico">${svg(s.icon)}</span>
      <span class="set-nav-txt"><b>${s.title}</b><small>${s.desc}</small></span>
      <span class="set-nav-chev">${svg('<polyline points="9 18 15 12 9 6"/>')}</span>
    </button>`).join('')}</div>`;
  main.prepend(nav);
  main.classList.add('set-main');
  // Encabezado de cada sección: "‹ Configuración" (solo celular) arriba del título.
  _setAllowed.forEach(s => {
    const sec = document.getElementById(s.id);
    const label = sec.querySelector('.section-label');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'set-back';
    back.innerHTML = `${svg('<polyline points="15 18 9 12 15 6"/>')}Configuración`;
    back.onclick = _setBack;
    sec.insertBefore(back, label || sec.firstChild);
    sec.querySelector('.set-sec-desc') || label?.insertAdjacentHTML('afterend', `<p class="set-sec-desc">${s.desc}</p>`);
  });
  window.addEventListener('hashchange', _setRender);
  window.matchMedia('(min-width: 900px)').addEventListener('change', _setRender);
  _setRender();
}
