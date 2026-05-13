const WA = "5215534548417";
const WA_BASE = `https://wa.me/${WA}`;

const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';

let products = [];
let revistaUrl = "";
let currentFilter = 'all';
let activeProduct = null;

const WA_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.374 0 0 5.373 0 12c0 2.124.553 4.118 1.522 5.85L.057 23.499l5.772-1.513A11.94 11.94 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.799c-1.891 0-3.653-.507-5.18-1.394l-.371-.22-3.422.897.914-3.329-.242-.384A9.783 9.783 0 012.2 12c0-5.404 4.396-9.799 9.8-9.799 5.403 0 9.798 4.395 9.798 9.8 0 5.403-4.395 9.798-9.798 9.798z"/></svg>`;

function supabaseApi(path, opts = {}) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  });
}

/* ── LOAD PRODUCTS ── */
async function loadProducts() {
  try {
    const result = await supabaseApi('products?select=*&order=position.asc');
    if (result.ok && Array.isArray(result.data) && result.data.length) {
      products = result.data.map(p => ({
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
  } catch {}
  products = [];
}

/* ── REVISTA ── */
async function loadRevista() {
  try {
    const result = await supabaseApi('config?id=eq.revista_url&select=value');
    if (result.ok && Array.isArray(result.data) && result.data.length) {
      revistaUrl = result.data[0].value;
      return;
    }
  } catch {}
  revistaUrl = "https://www.natura.com.mx/catalogos-digitales";
}

function updateRevistaLink() {
  const link = document.getElementById("revista-link");
  if (link) link.href = revistaUrl;
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

function discountPct(p) {
  if (!p.originalPrice || p.originalPrice <= p.price) return 0;
  return Math.round((1 - p.price / p.originalPrice) * 100);
}

function cardHTML(p) {
  // Stock es la fuente de verdad: agotado si outOfStock manual O si el contador llegó a 0
  const oos = p.outOfStock || p.stock === 0;
  const badge = p.badge ? `<span class="product-badge badge-${p.badgeType||'best'}">${p.badge}</span>` : '';
  const oosTag = oos ? `<span class="product-badge badge-oos" style="background:#9B8B78">Agotado</span>` : '';
  const pct = discountPct(p);
  const discountTag = pct > 0 ? `<span class="product-badge badge-discount">-${pct}%</span>` : '';
  // "Últimos X" solo cuando hay pocas unidades, no hay descuento y no está agotado
  const urgencyTag = (!oos && p.stock > 0 && p.stock <= 5 && pct === 0)
    ? `<span class="product-badge" style="background:#92400E;left:auto;right:10px">Últimos ${p.stock}</span>` : '';
  const fallback = `https://picsum.photos/seed/${p.id+10}/500/500`;
  const priceHTML = pct > 0
    ? `<div class="product-price"><s class="price-before">$${p.originalPrice.toLocaleString('es-MX')}</s> $${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`
    : `<div class="product-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`;
  const buyBtn = oos
    ? `<button class="btn-buy btn-buy-oos" disabled>Agotado</button>`
    : `<button class="btn-buy" onclick="event.stopPropagation();whatsapp(${p.id})">${WA_SVG} Pedir</button>`;
  return `
<article class="product-card reveal${oos ? ' card-oos' : ''}" onclick="openModal(${p.id})">
  <div class="product-img-wrap">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">
    ${badge}${oosTag}${discountTag}${urgencyTag}
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
  const items = products.filter(p => p.featured).slice(0, 3);
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
  const pct = discountPct(p);
  const priceText = pct > 0
    ? `~$${p.originalPrice.toLocaleString('es-MX')} MXN~ → *$${p.price.toLocaleString('es-MX')} MXN* (-${pct}% 🔥)`
    : `*$${p.price.toLocaleString('es-MX')} MXN*`;
  const msg = `¡Hola! 😊 Me interesa este producto de Tres Encantos:\n\n*${p.name}*\nPrecio: ${priceText}\n\n¿Está disponible?`;
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
  const oos = p.outOfStock || p.stock === 0;
  const pct = discountPct(p);
  const modalDiscount = pct > 0 ? `<span class="product-badge badge-discount" style="position:absolute;top:10px;right:10px;left:auto">-${pct}%</span>` : '';
  const modalUrgency = (!oos && p.stock > 0 && p.stock <= 5 && pct === 0)
    ? `<span class="product-badge" style="position:absolute;top:10px;right:10px;left:auto;background:#92400E">Últimos ${p.stock}</span>` : '';
  const modalPriceHTML = pct > 0
    ? `<div class="modal-price">
         <span class="modal-price-old">$${p.originalPrice.toLocaleString('es-MX')} MXN</span>
         $${p.price.toLocaleString('es-MX')} <small>MXN</small>
         <span class="modal-discount">-${pct}% OFF</span>
       </div>`
    : `<div class="modal-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`;
  const modalBtn = oos
    ? `<button class="btn" style="background:#ccc;cursor:default;opacity:.8" disabled>Agotado por el momento</button>`
    : `<button class="btn btn-wa" onclick="whatsapp(${p.id})">${WA_SVG} Pedir por WhatsApp</button>`;
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
<div class="modal" role="dialog" aria-modal="true">
  <div class="modal-img-wrap">
    <img class="modal-img" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'"${oos ? ' style="filter:grayscale(.4)"' : ''}>
    <button class="modal-close" onclick="closeModal()">✕</button>
    ${oos ? `<span class="product-badge badge-oos" style="position:absolute;top:10px;left:10px;background:#9B8B78">Agotado</span>` : ''}
    ${modalDiscount}${modalUrgency}
  </div>
  <div class="modal-body">
    <p class="modal-cat">${p.categoryLabel}</p>
    <h2 class="modal-title">${p.name}</h2>
    <p class="modal-desc">${p.description}</p>
    <div class="modal-foot">
      ${modalPriceHTML}
      ${modalBtn}
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
