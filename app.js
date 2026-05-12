const WA = "5215534548417";
const WA_BASE = `https://wa.me/${WA}`;
const STORAGE_KEY = "te_products_v1";
const REVISTA_KEY = "te_revista_v1";

const SUPABASE_URL = localStorage.getItem('te_supabase_url') || '';
const SUPABASE_ANON_KEY = localStorage.getItem('te_supabase_anon_key') || '';

let products = [];
let revistaUrl = "";

function supabaseApi(path, opts = {}) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(r => r.json());
}

/* ── LOAD PRODUCTS ── */
async function loadProducts() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const data = await supabaseApi('products?select=*&order=position.asc');
    if (Array.isArray(data) && data.length) {
      products = data.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        categoryLabel: p.category_label,
        price: p.price,
        description: p.description,
        image: p.image,
        badge: p.badge,
        badgeType: p.badge_type,
        featured: p.featured,
        outOfStock: p.out_of_stock,
        originalPrice: p.original_price
      }));
      return;
    }
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    products = saved ? JSON.parse(saved) : [...DEFAULT_PRODUCTS];
  } catch { products = [...DEFAULT_PRODUCTS]; }
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  await loadRevista();
  render();
  renderNatura();
  updateRevistaLink();
  renderHeroVisual();
  renderHeroMobileStrip();
  initFilters();
  initNav();
  initReveal();
  initModal();
});

/* ── RENDER CATALOG ── */
function render() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  const list = currentFilter === 'all' ? products : products.filter(p => p.category === currentFilter);
  if (!list.length) {
    grid.innerHTML = `<div class="empty-msg"><div class="em-icon">🛍️</div><p>No hay productos aquí todavía.<br>¡Escríbenos y te decimos qué tenemos!</p></div>`;
    return;
  }
  grid.innerHTML = list.map(cardHTML).join('');
  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function cardHTML(p) {
  const badge = p.badge ? `<span class="product-badge badge-${p.badgeType||'best'}">${p.badge}</span>` : '';
  const oosTag = p.outOfStock ? `<span class="product-badge badge-oos" style="background:#9B8B78">Agotado</span>` : '';
  const fallback = `https://picsum.photos/seed/${p.id+10}/500/500`;
  const priceHTML = p.originalPrice
    ? `<div class="product-price"><s class="price-before">$${p.originalPrice.toLocaleString('es-MX')}</s> $${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`
    : `<div class="product-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`;
  const buyBtn = p.outOfStock
    ? `<button class="btn-buy btn-buy-oos" disabled>Agotado</button>`
    : `<button class="btn-buy" onclick="event.stopPropagation();whatsapp(${p.id})">${WA_SVG} Pedir</button>`;
  return `
<article class="product-card reveal${p.outOfStock ? ' card-oos' : ''}" onclick="${p.outOfStock ? '' : `openModal(${p.id})`}">
  <div class="product-img-wrap">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">
    ${badge}${oosTag}
  </div>
  <div class="product-body">
    <p class="product-cat">${p.categoryLabel}</p>
    <h3>${p.name}</h3>
    <p class="product-desc">${p.description}</p>
    <div class="product-footer">
      ${priceHTML}
      ${buyBtn}
    </div>
  </div>
</article>`;
}

/* ── HERO MOBILE STRIP ── */
function renderHeroMobileStrip() {
  const container = document.getElementById('hero-mobile-strip');
  if (!container) return;
  const items = products.filter(p => p.featured);
  if (!items.length) return;
  const fallback = id => `https://picsum.photos/seed/${id+10}/200/200`;
  container.innerHTML = `<div class="hms-inner">${
    items.map(p => `
<div class="hms-card" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="hms-info">
    <div class="hms-name">${p.name}</div>
    <div class="hms-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`).join('')
  }</div>`;
}

/* ── HERO VISUAL ── */
function renderHeroVisual() {
  const container = document.getElementById('hero-visual');
  if (!container) return;
  const ORDER = [1, 3, 4]; // bolso, aretes, maquillaje — los más visuales primero
  const items = ORDER.map(id => products.find(p => p.id === id)).filter(Boolean);
  if (!items.length) return;
  const fallback = id => `https://picsum.photos/seed/${id+10}/300/300`;
  container.innerHTML = items.map(p => `
<div class="hc" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="hc-info">
    <div class="hc-name">${p.name}</div>
    <div class="hc-price">$${p.price.toLocaleString('es-MX')} MXN</div>
  </div>
</div>`).join('');
}

/* ── RENDER NATURA GRID ── */
function renderNatura() {
  const grid = document.getElementById('natura-grid');
  if (!grid) return;
  const naturaList = products.filter(p => p.category === 'natura').slice(0, 4);
  if (!naturaList.length) { grid.style.display = 'none'; return; }
  const fallback = id => `https://picsum.photos/seed/${id+20}/500/500`;
  grid.innerHTML = naturaList.map(p => `
<div class="nc-card reveal" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="nc-info">
    <div class="nc-name">${p.name}</div>
    <div class="nc-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`).join('');
  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ── FILTERS ── */
function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      render();
    });
  });
}

function filterTo(cat) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === cat));
  render();
  document.getElementById('productos')?.scrollIntoView({ behavior:'smooth' });
}

/* ── WHATSAPP ── */
function whatsapp(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const msg = `¡Hola Tres Encantos!\n\nMe interesa este producto:\n\n*${p.name}*\nPrecio: $${p.price.toLocaleString('es-MX')} MXN\n\n${p.description}\n\n¿Está disponible?`;
  window.open(`${WA_BASE}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── MODAL ── */
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function openModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  activeProduct = p;
  const fallback = `https://picsum.photos/seed/${p.id+10}/500/500`;
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
<div class="modal" role="dialog" aria-modal="true">
  <div class="modal-img-wrap">
    <img class="modal-img" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'">
    <button class="modal-close" onclick="closeModal()">✕</button>
  </div>
  <div class="modal-body">
    <p class="modal-cat">${p.categoryLabel}</p>
    <h2 class="modal-title">${p.name}</h2>
    <p class="modal-desc">${p.description}</p>
    <div class="modal-foot">
      <div class="modal-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>
      <button class="btn btn-wa" onclick="whatsapp(${p.id})">${WA_SVG} Pedir por WhatsApp</button>
    </div>
  </div>
</div>`;
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  activeProduct = null;
}

/* ── NAV ── */
function initNav() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  toggle?.addEventListener('click', () => {
    links.classList.toggle('open');
    toggle.classList.toggle('open');
  });
  links?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    links.classList.remove('open');
    toggle.classList.remove('open');
  }));
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav')) {
      links?.classList.remove('open');
      toggle?.classList.remove('open');
    }
  });
}

/* ── SCROLL REVEAL ── */
function initReveal() {
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 20), { passive:true });
}
