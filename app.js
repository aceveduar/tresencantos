const WA = "5215534548417";
const WA_BASE = `https://wa.me/${WA}`;

const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';

let products = [];
let revistaUrl = "";
let currentFilter = 'all';
let searchQuery   = '';
let currentSort   = 'default';
let activeProduct = null;

const CATALOG_LIMIT = 12;
let _catalogShowAll = false;

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
function showSkeleton() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="product-card skel-card">
      <div class="skel-img"></div>
      <div class="product-body">
        <div class="skel-line" style="width:50%;height:10px;margin-bottom:8px"></div>
        <div class="skel-line" style="width:85%;height:14px;margin-bottom:6px"></div>
        <div class="skel-line" style="width:70%;height:11px;margin-bottom:16px"></div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="skel-line" style="width:35%;height:18px"></div>
          <div class="skel-line" style="width:28%;height:36px;border-radius:50px"></div>
        </div>
      </div>
    </div>`).join('');
}

async function loadProducts() {
  showSkeleton();
  try {
    // is_published=true: solo publicados. out_of_stock=false: solo con stock
    const result = await supabaseApi('products?select=*&is_published=eq.true&out_of_stock=eq.false&order=position.asc');
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

function initAdminBar() {
  try {
    const raw = localStorage.getItem('te_admin_session');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s.access_token || !s.expires_at) return;
    if (s.expires_at <= Math.floor(Date.now() / 1000) + 60) return;
    document.body.classList.add('admin-bar-shown');
  } catch {}
}

document.addEventListener('DOMContentLoaded', async () => {
  initAdminBar();
  await loadProducts();
  await loadRevista();
  render();
  renderNatura();
  updateRevistaLink();
  renderHeroVisual();
  renderHeroMobileStrip();
  initAutoScroll();
  initFilters();
  initNav();
  initReveal();
  initModal();
  initWaFloat();
});

/* ── SEARCH ── */
function onSearchInput(val) {
  searchQuery = val.trim().toLowerCase();
  _catalogShowAll = false;
  render();
}

/* ── SORT ── */
function setSortOption(val) {
  currentSort = val;
  _catalogShowAll = false;
  render();
}

/* ── RENDER CATALOG ── */
function render() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  let list = products.filter(p => {
    const matchCat = currentFilter === 'all'
      || p.category === currentFilter
      || p.category.startsWith(currentFilter + '_');
    const matchQ   = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery) ||
      (p.description || '').toLowerCase().includes(searchQuery) ||
      p.categoryLabel.toLowerCase().includes(searchQuery);
    return matchCat && matchQ;
  });

  switch (currentSort) {
    case 'recent':     list = [...list].sort((a, b) => b.id - a.id); break;
    case 'price-asc':  list = [...list].sort((a, b) => a.price - b.price); break;
    case 'price-desc': list = [...list].sort((a, b) => b.price - a.price); break;
    case 'name':       list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
  }

  if (!list.length) {
    const msg = searchQuery
      ? `No encontramos "${searchQuery}". <a href="https://wa.me/${WA}?text=${encodeURIComponent(`¡Hola! Busco: ${searchQuery}`)}" target="_blank" rel="noopener" style="color:var(--gold)">Pregunta por WhatsApp →</a>`
      : 'No hay productos aquí todavía.<br>¡Escríbenos y te decimos qué tenemos!';
    grid.innerHTML = `<div class="empty-msg"><div class="em-icon">${searchQuery ? '🔍' : '🛍️'}</div><p>${msg}</p></div>`;
    return;
  }

  const isDefaultView = currentFilter === 'all' && !searchQuery;
  const limited = isDefaultView && !_catalogShowAll;
  const visible = limited ? list.slice(0, CATALOG_LIMIT) : list;
  const remaining = limited ? list.length - CATALOG_LIMIT : 0;

  grid.innerHTML = visible.map(cardHTML).join('');

  if (remaining > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'load-more-wrap';
    wrap.innerHTML = `<button class="btn-load-more" onclick="showAllCatalog()">Ver ${remaining} productos más</button>`;
    grid.appendChild(wrap);
  }

  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function showAllCatalog() {
  _catalogShowAll = true;
  render();
}

function discountPct(p) {
  if (!p.originalPrice || p.originalPrice <= p.price) return 0;
  return Math.round((1 - p.price / p.originalPrice) * 100);
}

function cardHTML(p) {
  const oos = p.outOfStock || p.stock === 0;
  const pct = discountPct(p);
  const oosTag = oos ? `<span class="product-badge badge-oos" style="background:#9B8B78">Agotado</span>` : '';

  let badgeArea = '';
  const badgeIsPromo = !p.badgeType || p.badgeType === 'promo';
  if (pct > 0 && p.badge && !badgeIsPromo) {
    // Badge aporta info diferente al descuento (Nuevo, Más vendido, Natura) → mostrar ambos en esquinas opuestas
    badgeArea = `<span class="product-badge badge-${p.badgeType}">${p.badge}</span>`
              + `<span class="product-badge badge-discount">-${pct}%</span>`;
  } else if (pct > 0) {
    // Descuento solo (o badge era "OFERTA" — redundante): solo el %
    badgeArea = `<span class="product-badge badge-discount">-${pct}%</span>`;
  } else if (p.badge) {
    badgeArea = `<span class="product-badge badge-${p.badgeType||'best'}">${p.badge}</span>`;
  }

  // "Últimas unidades" solo cuando hay 2–3 piezas y no hay descuento
  const urgencyTag = (!oos && p.stock >= 2 && p.stock <= 3 && pct === 0)
    ? `<span class="product-badge" style="background:#92400E;left:auto;right:10px">Últimas ${p.stock}</span>` : '';
  const fallback = `https://picsum.photos/seed/${p.id+10}/500/500`;
  const priceHTML = pct > 0
    ? `<div class="product-price"><s class="price-before">$${p.originalPrice.toLocaleString('es-MX')}</s> $${p.price.toLocaleString('es-MX')}</div>`
    : `<div class="product-price">$${p.price.toLocaleString('es-MX')}</div>`;
  const buyBtn = oos
    ? `<button class="btn-buy btn-buy-oos" disabled>Agotado</button>`
    : `<button class="btn-buy" onclick="event.stopPropagation();whatsapp(${p.id})">${WA_SVG} Pedir</button>`;
  return `
<article class="product-card reveal${oos ? ' card-oos' : ''}" onclick="openModal(${p.id})">
  <div class="product-img-wrap">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">
    ${oosTag}${badgeArea}${urgencyTag}
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
  const cardHTML = p => `
<div class="hms-card" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="hms-info">
    <div class="hms-name">${p.name}</div>
    <div class="hms-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`;
  // Renderizar una sola copia; initAutoScroll duplica solo si el contenido desborda
  container.innerHTML = `<div class="hms-inner">${items.map(cardHTML).join('')}</div>`;
}

/* Auto-scroll eliminado — scroll manual con momentum nativo */
function initAutoScroll() { /* no-op */ }

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
    <div class="hc-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`).join('');
}

/* ── RENDER NATURA CARRUSEL ── */
let _ncTimer = null;
let _ncPage  = 0;

const _ncCatLabel = code => ({
  natura_perfumes:'Perfumería', natura_cuerpo:'Cuerpo', natura_facial:'Facial',
  natura_cabello:'Cabello', natura_maquillaje:'Maquillaje'
})[code] || 'Natura';

function renderNatura() {
  const wrap = document.getElementById('nc-wrap');
  if (!wrap) return;
  const list = products
    .filter(p => p.category === 'natura' || p.category?.startsWith('natura_'))
    .slice(0, 8);
  if (!list.length) {
    document.querySelector('.natura-carousel')?.style.setProperty('display','none');
    return;
  }
  const fb = id => `https://picsum.photos/seed/${id+20}/500/500`;
  wrap.innerHTML = list.map(p => `
<div class="nc-card" onclick="openModal(${p.id})">
  <div class="nc-img-wrap">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fb(p.id)}'">
    <div class="nc-overlay"><span>Ver producto →</span></div>
  </div>
  <div class="nc-info">
    <div class="nc-cat">${_ncCatLabel(p.category)}</div>
    <div class="nc-name">${p.name}</div>
    <div class="nc-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`).join('');
  _initNaturaCarousel(list.length);
}

function _initNaturaCarousel(total) {
  if (window.innerWidth <= 900) return; // mobile: grid 2×2, sin carrusel
  const wrap   = document.getElementById('nc-wrap');
  const dotsEl = document.getElementById('nc-dots');
  const nav    = document.getElementById('nc-nav');
  if (!wrap || !dotsEl) return;
  clearInterval(_ncTimer);
  _ncPage = 0;

  const perPage = () => window.innerWidth > 600 ? 2 : 1;
  const pages   = () => Math.ceil(total / perPage());

  const buildDots = () => {
    const n = pages();
    nav.style.display = n > 1 ? 'flex' : 'none';
    dotsEl.innerHTML = Array.from({length: n}, (_, i) =>
      `<button class="nc-dot${i===0?' active':''}" onclick="naturaGoTo(${i})" aria-label="Página ${i+1}"></button>`
    ).join('');
  };
  buildDots();

  window.naturaGoTo = page => {
    const n = pages();
    _ncPage = (page + n) % n;
    const card = wrap.querySelector('.nc-card');
    if (!card) return;
    wrap.scrollTo({ left: _ncPage * perPage() * (card.offsetWidth + 14), behavior:'smooth' });
    dotsEl.querySelectorAll('.nc-dot').forEach((d,i) => d.classList.toggle('active', i === _ncPage));
  };

  window.naturaNav = dir => naturaGoTo(_ncPage + dir);

  const start = () => { _ncTimer = setInterval(() => naturaGoTo(_ncPage + 1), 4200); };
  const stop  = () => clearInterval(_ncTimer);
  start();
  wrap.addEventListener('mouseenter', stop);
  wrap.addEventListener('mouseleave', start);
  wrap.addEventListener('touchstart', stop, {passive:true});
  wrap.addEventListener('touchend',   () => setTimeout(start, 3000));

  let _resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeT);
    _resizeT = setTimeout(() => { buildDots(); naturaGoTo(0); }, 150);
  });
}

/* ── FILTERS ── */
function initFilters() {
  // Contar productos por categoría
  const counts = { all: products.length };
  products.forEach(p => {
    counts[p.category] = (counts[p.category] || 0) + 1;
    // Acumular en la raíz padre (ej: 'bolsos_dama' suma en 'bolsos')
    const root = p.category.split('_')[0];
    if (root !== p.category) counts[root] = (counts[root] || 0) + 1;
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    const f = btn.dataset.filter;
    if (counts[f]) {
      btn.innerHTML = `${btn.textContent} <span class="filter-count">${counts[f]}</span>`;
    }
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = f;
      _catalogShowAll = false;
      render();
    });
  });
}

function filterTo(cat) {
  currentFilter = cat;
  _catalogShowAll = false;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === cat));
  render();
  document.getElementById('productos')?.scrollIntoView({ behavior:'smooth' });
}

/* ── SHARE ── */
async function shareProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p || !navigator.share) return;
  try {
    await navigator.share({
      title: p.name,
      text: `${p.name} — $${p.price.toLocaleString('es-MX')} MXN\n${p.description}`,
      url: window.location.href
    });
  } catch {}
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
  let modalBadgeArea = '';
  const modalBadgeIsPromo = !p.badgeType || p.badgeType === 'promo';
  if (pct > 0 && p.badge && !modalBadgeIsPromo) {
    modalBadgeArea = `<span class="product-badge badge-${p.badgeType}" style="position:absolute;top:10px;left:10px">${p.badge}</span>`
                   + `<span class="product-badge badge-discount" style="position:absolute;top:10px;right:10px;left:auto">-${pct}%</span>`;
  } else if (pct > 0) {
    modalBadgeArea = `<span class="product-badge badge-discount" style="position:absolute;top:10px;right:10px;left:auto">-${pct}%</span>`;
  } else if (p.badge) {
    modalBadgeArea = `<span class="product-badge badge-${p.badgeType||'best'}" style="position:absolute;top:10px;left:10px">${p.badge}</span>`;
  }
  const modalDiscount = '';
  const modalUrgency = (!oos && p.stock >= 2 && p.stock <= 3 && pct === 0)
    ? `<span class="product-badge" style="position:absolute;top:10px;right:10px;left:auto;background:#92400E">Últimas ${p.stock}</span>` : '';
  const modalPriceHTML = pct > 0
    ? `<div class="modal-price">
         <span class="modal-price-old">$${p.originalPrice.toLocaleString('es-MX')} MXN</span>
         $${p.price.toLocaleString('es-MX')} <small>MXN</small>
         <span class="modal-discount">-${pct}% OFF</span>
       </div>`
    : `<div class="modal-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`;
  const shareBtn = navigator.share
    ? `<button class="btn btn-share" onclick="shareProduct(${p.id})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Compartir</button>`
    : '';
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
    ${modalBadgeArea}${modalUrgency}
  </div>
  <div class="modal-body">
    <p class="modal-cat">${p.categoryLabel}</p>
    <h2 class="modal-title">${p.name}</h2>
    <p class="modal-desc">${p.description}</p>
    <div class="modal-foot">
      ${modalPriceHTML}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${modalBtn}
        ${shareBtn}
      </div>
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

/* ── WHATSAPP FLOTANTE ── */
function initWaFloat() {
  const btn = document.getElementById('wa-float');
  if (!btn) return;
  const hero = document.querySelector('.hero');
  const threshold = hero ? hero.offsetHeight * 0.7 : 400;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > threshold);
  }, { passive: true });
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
