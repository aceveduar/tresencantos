const WA = "5215534548417";
const WA_BASE = `https://wa.me/${WA}`;

const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';

let products = [];
let publicCategories = [];
let waFloatEnabled = true;
let _salesCounts = {}; // { productId: qtySold } — cargado desde config
let revistaUrl = "";
let currentFilter = 'all';
let searchQuery   = '';
let currentSort   = 'default';
let activeProduct = null;
let _modalQty     = 1;

const CATALOG_LIMIT = 12;
let _catalogShowAll = false;

function _descHtml(desc) {
  if (!desc) return '';
  let s = desc
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,'<em>$1</em>');
  s = s.replace(/((?:• .+\n?)+)/g, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^• /,'').trim()}</li>`).join('');
    return `<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc">${items}</ul>`;
  });
  s = s.replace(/\n/g,'<br>');
  return s;
}

function _descText(desc) {
  if (!desc) return '';
  return desc
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/^[•\-]\s*/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/* ── CARRITO ── */
let cart = JSON.parse(localStorage.getItem('te_cart') || '[]');

function saveCart() { localStorage.setItem('te_cart', JSON.stringify(cart)); }

function addToCart(id, qty = 1) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const existing = cart.find(x => x.id === id);
  const currentQty = existing ? existing.qty : 0;
  const available = (p.stock || 0) - currentQty;
  const toAdd = Math.min(qty, available);
  if (toAdd <= 0) return;
  if (existing) existing.qty += toAdd;
  else cart.push({ id: p.id, name: p.name, price: p.price, qty: toAdd, image: p.image });
  saveCart();
  renderCartBadge();
}

function removeFromCart(id) {
  cart = cart.filter(x => x.id !== id);
  saveCart();
  renderCartBadge();
  renderCartBody();
}

function updateCartQty(id, delta, btn) {
  const item = cart.find(x => x.id === id);
  if (!item) return;
  const p = products.find(x => x.id === id);
  const maxQty = p ? (p.stock || 1) : 1;
  const next = Math.max(1, Math.min(item.qty + delta, maxQty));
  if (next === item.qty && delta > 0 && btn) {
    btn.classList.remove('btn-at-max');
    requestAnimationFrame(() => { btn.classList.add('btn-at-max'); setTimeout(() => btn.classList.remove('btn-at-max'), 500); });
    return;
  }
  item.qty = next;
  saveCart();
  renderCartBadge();
  renderCartBody();
}

function clearCart() {
  cart = [];
  saveCart();
  renderCartBadge();
  renderCartBody();
}

function cartTotal() { return cart.reduce((s, x) => s + x.price * x.qty, 0); }

function renderCartBadge() {
  const total = cart.reduce((s, x) => s + x.qty, 0);
  const badge = document.getElementById('nav-cart-badge');
  const cartBtn = document.getElementById('nav-cart-btn');
  if (!badge) return;
  badge.textContent = total;
  badge.classList.toggle('visible', total > 0);
  if (total > 0 && cartBtn) {
    cartBtn.classList.remove('cart-pulse');
    requestAnimationFrame(() => requestAnimationFrame(() => cartBtn.classList.add('cart-pulse')));
  }
}

function renderCartBody() {
  const body = document.getElementById('cart-body');
  const foot = document.getElementById('cart-foot');
  const totalEl = document.getElementById('cart-total');
  if (!body) return;
  if (!cart.length) {
    body.innerHTML = '<div class="cart-empty">🛒<br>Tu pedido está vacío.<br>Agrega productos para continuar.</div>';
    if (foot) foot.style.display = 'none';
    return;
  }
  body.innerHTML = cart.map(item => `
<div class="cart-item">
  <img class="cart-item-img" src="${item.image}" alt="${item.name}" onerror="this.onerror=null;this.src='tresencantos_default.png'">
  <div class="cart-item-info">
    <div class="cart-item-name">${item.name}</div>
    <div class="cart-item-price">$${item.price.toLocaleString('es-MX')} MXN</div>
  </div>
  <div class="cart-item-controls">
    <button class="cqty-btn" onclick="updateCartQty(${item.id},-1)">−</button>
    <span class="cqty-num">${item.qty}</span>
    <button class="cqty-btn" onclick="updateCartQty(${item.id},1,this)">+</button>
    <button class="cqty-btn" onclick="removeFromCart(${item.id})" style="border-color:#FECACA;color:#EF4444;margin-left:4px">✕</button>
  </div>
</div>`).join('');
  if (foot) foot.style.display = 'block';
  if (totalEl) totalEl.textContent = '$' + cartTotal().toLocaleString('es-MX') + ' MXN';
}

function openCart() {
  renderCartBody();
  document.getElementById('cart-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function cartWhatsApp() {
  if (!cart.length) return;
  const btn = document.querySelector('.btn-cart-wa');
  if (btn?.disabled) return;
  if (btn) { btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 2000); }
  const snapshot = [...cart]; // captura el carrito en este momento
  const lines = snapshot.map(x => `• ${x.name} x${x.qty} — $${(x.price * x.qty).toLocaleString('es-MX')} MXN`).join('\n');
  const total = '$' + snapshot.reduce((s, x) => s + x.price * x.qty, 0).toLocaleString('es-MX') + ' MXN';
  const msg = `¡Hola! 😊 Me gustaría hacer el siguiente pedido de Tres Encantos:\n\n${lines}\n\n*Total: ${total}*\n\n¿Está todo disponible?`;
  window.open(`${WA_BASE}?text=${encodeURIComponent(msg)}`, '_blank');
}

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
  let failed = false;
  try {
    // Publicados con stock O apartados activos
    const result = await supabaseApi('products?select=id,name,category,category_label,price,original_price,description,image,badge,badge_type,featured,out_of_stock,is_apartado,stock,images,kit_items&is_published=eq.true&category=neq.por_revisar&or=(out_of_stock.eq.false,is_apartado.eq.true)&order=position.asc');
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
        isApartado: p.is_apartado || false,
        originalPrice: p.original_price,
        stock: p.stock,
        images: p.images || null,
        kitItems: p.kit_items || null
      }));
      return;
    }
    if (!result.ok) failed = true;
  } catch { failed = true; }
  products = [];
  if (failed) _showCatalogError();
}

function _showCatalogError() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:56px 24px">
    <div style="font-size:2.5rem;margin-bottom:14px">😕</div>
    <p style="font-size:.95rem;color:#6B5C48;margin-bottom:6px;font-weight:600">No pudimos cargar el catálogo</p>
    <p style="font-size:.82rem;color:#9B8B78;margin-bottom:22px">Revisa tu conexión e intenta de nuevo</p>
    <button onclick="location.reload()" style="background:#C9A462;color:#fff;border:none;border-radius:50px;padding:12px 28px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation">↺ Reintentar</button>
  </div>`;
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

async function loadCategories() {
  try {
    const result = await supabaseApi('config?id=in.(categories,wa_float,sales_counts)&select=id,value');
    if (result.ok && result.data) {
      result.data.forEach(row => {
        if (row.id === 'categories' && row.value) publicCategories = JSON.parse(row.value);
        if (row.id === 'wa_float') waFloatEnabled = row.value !== 'false';
        if (row.id === 'sales_counts' && row.value) {
          try { _salesCounts = JSON.parse(row.value); } catch {}
        }
      });
    }
  } catch {}
}

function catMatchesFilter(productCat, filterCat) {
  if (filterCat === 'all') return true;
  if (productCat === filterCat) return true;
  if (productCat.startsWith(filterCat + '_')) return true;
  // Matching por parentesco: sube la cadena de padres hasta encontrar filterCat
  let cat = publicCategories.find(c => c.code === productCat);
  while (cat?.parent) {
    if (cat.parent === filterCat) return true;
    cat = publicCategories.find(c => c.code === cat.parent);
  }
  return false;
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
    // Ocultar links restringidos según rol
    const role = s.user?.user_metadata?.role ||
      (() => { try { return JSON.parse(atob(s.access_token.split('.')[1]))?.user_metadata?.role; } catch { return null; } })() ||
      'operador';
    if (role === 'operador') {
      ['stats.html', 'activity.html', 'settings.html'].forEach(href => {
        document.querySelector(`#admin-bar a[href="${href}"]`)?.remove();
      });
    } else if (role === 'duena') {
      ['settings.html'].forEach(href => {
        document.querySelector(`#admin-bar a[href="${href}"]`)?.remove();
      });
    }
  } catch {}
}

function doLogout() {
  localStorage.removeItem('te_admin_session');
  location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
  initAdminBar();
  await Promise.all([loadProducts(), loadRevista(), loadCategories()]);
  render();
  renderNatura();
  updateRevistaLink();
  renderHeroVisual();
  renderHeroMobileStrip();
  initAutoScroll();
  initFilters();
  initStickyFilters();
  initNav();
  initReveal();
  initModal();
  initWaFloat();
  renderCartBadge();
});

const _norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ── SEARCH ── */
function onSearchInput(val) {
  searchQuery = _norm(val);
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
    const matchCat = catMatchesFilter(p.category, currentFilter);
    const groups = searchQuery ? searchQuery.split(',').map(g => g.trim().split(/\s+/).filter(Boolean)).filter(g => g.length) : [];
    const matchQ = !groups.length || groups.some(g => g.every(t =>
      _norm(p.name).includes(t) ||
      _norm(p.description).includes(t) ||
      _norm(p.categoryLabel).includes(t)
    ));
    return matchCat && matchQ;
  });

  switch (currentSort) {
    case 'recent':     list = [...list].sort((a, b) => b.id - a.id); break;
    case 'price-asc':  list = [...list].sort((a, b) => a.price - b.price); break;
    case 'price-desc': list = [...list].sort((a, b) => b.price - a.price); break;
    case 'name':       list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
    case 'popular':    list = [...list].sort((a, b) => (_salesCounts[b.id] || 0) - (_salesCounts[a.id] || 0)); break;
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

function kitStock(p) {
  if (!p.kitItems?.length) return null;
  const stocks = p.kitItems.map(c => {
    const comp = products.find(x => x.id === c.id);
    if (!comp) return null; // componente no publicado individualmente
    return Math.floor(comp.stock / c.qty);
  });
  if (stocks.some(s => s === null)) return null; // fallback al flag del kit
  return Math.min(...stocks);
}

function isOos(p) {
  if (p.kitItems?.length) {
    const s = kitStock(p);
    return s === null ? p.outOfStock : s === 0;
  }
  return p.outOfStock || p.stock === 0;
}

function cardHTML(p) {
  const oos = isOos(p);
  const apt = p.isApartado && p.stock <= 1;
  const pct = discountPct(p);
  const oosTag = apt
    ? `<span class="product-badge badge-apartado">📌 Apartado</span>`
    : oos ? `<span class="product-badge badge-oos" style="background:#9B8B78">Agotado</span>` : '';

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

  const urgencyTag = '';
  const fallback = 'tresencantos_default.png';
  const priceHTML = pct > 0
    ? `<div class="product-price"><s class="price-before">$${p.originalPrice.toLocaleString('es-MX')}</s> $${p.price.toLocaleString('es-MX')}</div>`
    : `<div class="product-price">$${p.price.toLocaleString('es-MX')}</div>`;
  const buyBtn = apt
    ? `<button class="btn-buy btn-buy-oos" onclick="event.stopPropagation();whatsapp(${p.id},this)" style="background:#92400E">${WA_SVG} Consultar</button>`
    : oos ? `<button class="btn-buy btn-buy-oos" disabled>Agotado</button>`
    : `<button class="btn-buy" onclick="event.stopPropagation();whatsapp(${p.id},this)">${WA_SVG} Pedir</button>`;
  return `
<article class="product-card reveal${oos ? ' card-oos' : ''}" onclick="openModal(${p.id})">
  <div class="product-img-wrap">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">
    ${oosTag}${badgeArea}${urgencyTag}
  </div>
  <div class="product-body">
    <p class="product-cat">${p.categoryLabel}</p>
    <h3>${p.name}</h3>
    <p class="product-desc">${_descText(p.description)}</p>
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
  const fallback = () => 'tresencantos_default.png';
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
  const fallback = () => 'tresencantos_default.png';
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
  const fb = () => 'tresencantos_default.png';
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

/* ── STICKY FILTERS ── */
function initStickyFilters() {
  const row = document.querySelector('.products-filters-row');
  if (!row) return;

  const placeholder = document.createElement('div');
  placeholder.style.display = 'none';
  row.parentElement.insertBefore(placeholder, row);

  let stuck = false;
  let lastY = window.scrollY;
  const naturalTop = row.getBoundingClientRect().top + window.scrollY;

  function getOffset() {
    return document.body.classList.contains('admin-bar-shown') ? 114 : 70;
  }
  function show(offset) {
    if (stuck) return;
    stuck = true;
    placeholder.style.display = 'block';
    placeholder.style.height = row.offsetHeight + 'px';
    row.style.top = offset + 'px';
    row.classList.add('is-stuck');
  }
  function hide() {
    if (!stuck) return;
    stuck = false;
    placeholder.style.display = 'none';
    row.style.top = '';
    row.classList.remove('is-stuck');
  }
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const offset = getOffset();
    const pastFilter = y > naturalTop - offset;
    const scrollingUp = y < lastY;
    lastY = y;

    if (!pastFilter) { hide(); return; }
    if (scrollingUp) show(offset); else hide();
  }, { passive: true });
}

/* ── FILTERS ── */
function initFilters() {
  const container = document.getElementById('products-filters');
  if (!container) return;

  const roots = publicCategories.filter(c => !c.parent);
  const activeCats = roots.length
    ? roots.filter(r => products.some(p => catMatchesFilter(p.category, r.code)))
    : [...new Map(products.map(p => [p.category, { code: p.category, label: p.categoryLabel }])).values()];

  container.innerHTML = `<button class="filter-btn active" data-filter="all">Todo</button>` +
    activeCats.map(r => {
      const n = products.filter(p => catMatchesFilter(p.category, r.code)).length;
      return `<button class="filter-btn" data-filter="${r.code}">${r.label} <span class="filter-count">${n}</span></button>`;
    }).join('');

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
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
function whatsapp(id, btn) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Abriendo WhatsApp…';
    btn.style.background = '#1da851';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2200);
  }
  const pct = discountPct(p);
  const priceText = pct > 0
    ? `~$${p.originalPrice.toLocaleString('es-MX')} MXN~ → *$${p.price.toLocaleString('es-MX')} MXN* (-${pct}% 🔥)`
    : `*$${p.price.toLocaleString('es-MX')} MXN*`;
  const msg = `¡Hola! 😊 Me interesa este producto de Tres Encantos:\n\n*${p.name}*\nPrecio: ${priceText}\n\n¿Está disponible?`;
  window.open(`${WA_BASE}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── MODAL ── */
function _swipeDown(getSheet, closeFn, getOverlay) {
  let startY = 0, curY = 0, on = false;
  const area = () => getSheet();
  document.addEventListener('touchstart', e => {
    const sh = area(); if (!sh) return;
    if (!sh.closest('#modal-overlay.open, #cart-overlay.open')) return;
    startY = e.touches[0].clientY; on = false; curY = 0;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    const sh = area(); if (!sh || !sh.closest('#modal-overlay.open, #cart-overlay.open')) return;
    const dy = e.touches[0].clientY - startY;
    if (!on) {
      if (dy < 12) return;
      const sc = sh.querySelector('.modal-body,.cart-sheet-body');
      if (sc && sc.scrollTop > 4) return;
      on = true;
    }
    curY = Math.max(0, dy);
    sh.style.transition = 'none';
    sh.style.transform  = `translateY(${curY}px)`;
    const ov = getOverlay?.();
    if (ov) ov.style.opacity = String(Math.max(0, 1 - curY / 200));
  }, { passive: true });
  document.addEventListener('touchend', () => {
    const sh = area(); if (!sh || !on) return; on = false;
    const ov = getOverlay?.();
    if (curY > 100) {
      sh.style.transition = 'transform .22s ease-in';
      sh.style.transform  = 'translateY(110%)';
      if (ov) ov.style.opacity = '0';
      setTimeout(() => { closeFn(); sh.style.transform = sh.style.transition = ''; if (ov) ov.style.opacity = ''; }, 230);
    } else {
      sh.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
      sh.style.transform  = 'translateY(0)';
      if (ov) ov.style.opacity = '';
      setTimeout(() => { sh.style.transform = sh.style.transition = ''; }, 280);
    }
    curY = 0;
  });
}

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (!activeProduct) return;
    if (e.key === 'ArrowRight') _modalNavigate(1);
    if (e.key === 'ArrowLeft')  _modalNavigate(-1);
  });
  _swipeDown(
    () => document.querySelector('#modal-overlay .modal'),
    closeModal,
    () => document.getElementById('modal-overlay')
  );
  _swipeDown(
    () => document.querySelector('#cart-overlay .cart-sheet'),
    closeCart,
    () => document.getElementById('cart-overlay')
  );
  _initModalSwipeNav();
}

function _modalNavigate(dir) {
  const idx = products.findIndex(p => p.id === activeProduct?.id);
  if (idx === -1) return;
  const next = products[idx + dir];
  if (!next) return;
  const modal = document.querySelector('#modal-overlay .modal');
  if (modal) {
    modal.style.transition = 'transform .2s cubic-bezier(.4,0,1,1), opacity .18s ease';
    modal.style.transform  = `translateX(${dir > 0 ? '-40px' : '40px'})`;
    modal.style.opacity    = '0';
  }
  setTimeout(() => {
    openModal(next.id);
    const nm = document.querySelector('#modal-overlay .modal');
    if (nm) {
      nm.style.transition = 'none';
      nm.style.transform  = `translateX(${dir > 0 ? '40px' : '-40px'})`;
      nm.style.opacity    = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        nm.style.transition = 'transform .3s cubic-bezier(.215,.61,.355,1), opacity .26s ease';
        nm.style.transform  = '';
        nm.style.opacity    = '';
        setTimeout(() => { nm.style.transition = nm.style.transform = nm.style.opacity = ''; }, 300);
      }));
    }
  }, 190);
}

function _initModalSwipeNav() {
  let sx = 0, sy = 0, swDir = null, inGallery = false;
  document.addEventListener('touchstart', e => {
    if (!document.querySelector('#modal-overlay.open')) return;
    inGallery = !!e.target.closest('.modal-gallery');
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; swDir = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (swDir) return;
    const dx = Math.abs(e.touches[0].clientX - sx);
    const dy = Math.abs(e.touches[0].clientY - sy);
    if (dx > 8 || dy > 8) swDir = dx > dy ? 'h' : 'v';
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!activeProduct || swDir !== 'h' || inGallery) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) < 45) return;
    _modalNavigate(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function openModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  activeProduct = p;
  _modalQty = 1;
  const fallback = 'tresencantos_default.png';
  const oos = isOos(p);
  const pct = discountPct(p);

  // Categoría con contexto de padre si es subcategoría
  let catDisplay = p.categoryLabel;
  if (publicCategories.length) {
    const cat = publicCategories.find(c => c.code === p.category);
    if (cat?.parent) {
      const parent = publicCategories.find(c => c.code === cat.parent);
      if (parent) catDisplay = `${parent.label} · ${p.categoryLabel}`;
    }
  }

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
  const urgencyText = '';
  const ctaPriceHTML = pct > 0
    ? `<div class="modal-cta-price">
         <span class="modal-price-old">$${p.originalPrice.toLocaleString('es-MX')}</span>
         <span class="modal-cta-amount">$${p.price.toLocaleString('es-MX')} <small>MXN</small></span>
         <span class="modal-discount">-${pct}% OFF</span>
       </div>`
    : `<div class="modal-cta-price"><span class="modal-cta-amount">$${p.price.toLocaleString('es-MX')} <small>MXN</small></span></div>`;
  const shareBtn = navigator.share
    ? `<button class="btn btn-share modal-share-btn" onclick="shareProduct(${p.id})" aria-label="Compartir"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>`
    : '';
  const waDirectBtn = oos ? '' : `<button class="modal-wa-direct" onclick="whatsapp(${p.id})" title="Pedir por WhatsApp" aria-label="Pedir por WhatsApp">${WA_SVG}</button>`;
  const modalBtn = oos
    ? `<button class="btn modal-btn-oos" onclick="notifyRestock(${p.id},this)">🔔 Avisarme cuando haya stock</button>`
    : `<div class="modal-qty-row">
        <button class="modal-qty-btn" onclick="changeModalQty(-1)">−</button>
        <span class="modal-qty-num" id="modal-qty-num">1</span>
        <button class="modal-qty-btn" id="modal-qty-plus" onclick="changeModalQty(1)">+</button>
      </div>
      <button class="btn btn-modal-addcart" id="modal-addcart-btn" onclick="modalAddToCart(${p.id})">
        🛒 Agregar al carrito
      </button>
      <button class="modal-wa-mobile" onclick="whatsapp(${p.id})">${WA_SVG} Pedir directo por WhatsApp</button>`;
  const descHTML = p.description
    ? `<p class="modal-desc">${_descHtml(p.description)}</p>`
    : '';
  const kitHTML = p.kitItems?.length
    ? `<div class="modal-kit-includes">
        <div class="modal-kit-title">🎁 Incluye</div>
        ${p.kitItems.map(item => {
          const comp = products.find(x => x.id === item.id);
          const img  = comp?.image || item.image;
          return `<div class="modal-kit-item">
            ${img ? `<img src="${img}" alt="${item.name}" onerror="this.style.display='none'">` : ''}
            <span>${item.name}</span>
            ${item.qty > 1 ? `<span class="modal-kit-qty">×${item.qty}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`
    : '';
  const allImgs = [p.image, ...(p.images || [])].filter(Boolean);
  const hasGallery = allImgs.length > 1;
  const galleryHTML = hasGallery
    ? `<div class="modal-gallery" id="modal-gallery" onscroll="_updateGalleryDots(this)">
        ${allImgs.map((src, i) => `<img class="modal-gallery-img" src="${src}" alt="${p.name} ${i+1}" onerror="this.onerror=null;this.src='${fallback}'"${oos && i===0 ? ' style="filter:grayscale(.4)"' : ''}>`).join('')}
       </div>
       <div class="modal-gallery-dots" id="modal-gallery-dots">
         ${allImgs.map((_,i) => `<span class="mgd${i===0?' mgd-active':''}" onclick="_goToGalleryImg(${i})"></span>`).join('')}
       </div>`
    : `<img class="modal-img" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'"${oos ? ' style="filter:grayscale(.4)"' : ''}>`;

  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
<div class="modal" role="dialog" aria-modal="true" aria-label="${p.name}">
  <div class="modal-img-wrap${hasGallery ? ' has-gallery' : ''}">
    ${galleryHTML}
    <button class="modal-close" onclick="closeModal()" aria-label="Cerrar">✕</button>
    ${oos ? `<span class="product-badge badge-oos" style="position:absolute;top:10px;left:10px;background:#9B8B78">Agotado</span>` : ''}
    ${!hasGallery ? modalBadgeArea : ''}
  </div>
  <div class="modal-body">
    <p class="modal-cat">${catDisplay}</p>
    <h2 class="modal-title">${p.name}</h2>
    ${descHTML}
    ${kitHTML}
    ${urgencyText}
  </div>
  <div class="modal-cta">
    <div class="modal-cta-row">
      ${ctaPriceHTML}
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        ${waDirectBtn}
        ${shareBtn}
      </div>
    </div>
    ${modalBtn}
  </div>
</div>`;
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function notifyRestock(id, btn) {
  const p = products.find(x => x.id === id) || activeProduct;
  const name = p ? p.name : 'este producto';
  const msg = `¡Hola! 😊 Me interesa *${name}* pero está agotado. ¿Podrías avisarme cuando vuelva a haber stock? ¡Gracias!`;
  btn.textContent = '✓ Abriendo WhatsApp…';
  btn.style.background = '#25D366';
  btn.style.color = '#fff';
  btn.style.cursor = 'default';
  window.open(`${WA_BASE}?text=${encodeURIComponent(msg)}`, '_blank');
}

function changeModalQty(delta) {
  const maxQty = activeProduct ? (activeProduct.stock || 1) : 1;
  const next = Math.max(1, Math.min(_modalQty + delta, maxQty));
  if (next === _modalQty && delta > 0) {
    const btn = document.getElementById('modal-qty-plus');
    if (btn) { btn.classList.remove('btn-at-max'); requestAnimationFrame(() => { btn.classList.add('btn-at-max'); setTimeout(() => btn.classList.remove('btn-at-max'), 500); }); }
    return;
  }
  _modalQty = next;
  const el = document.getElementById('modal-qty-num');
  if (el) el.textContent = _modalQty;
}

function modalAddToCart(id) {
  addToCart(id, _modalQty);
  const btn = document.getElementById('modal-addcart-btn');
  if (btn) {
    btn.innerHTML = `✓ ${_modalQty > 1 ? _modalQty + ' agregados' : 'Agregado'} &nbsp;·&nbsp; <u style="font-weight:400;font-size:.88em">Ver carrito →</u>`;
    btn.classList.add('added');
    btn.onclick = () => { closeModal(); openCart(); };
    setTimeout(() => {
      btn.innerHTML = '🛒 Agregar al carrito';
      btn.classList.remove('added');
      btn.onclick = () => modalAddToCart(id);
    }, 3000);
  }
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  activeProduct = null;
}

function _updateGalleryDots(gallery) {
  const idx = Math.round(gallery.scrollLeft / gallery.offsetWidth);
  document.querySelectorAll('#modal-gallery-dots .mgd').forEach((d, i) => d.classList.toggle('mgd-active', i === idx));
}

function _goToGalleryImg(idx) {
  const g = document.getElementById('modal-gallery');
  if (g) g.scrollTo({ left: idx * g.offsetWidth, behavior: 'smooth' });
}

/* ── WHATSAPP FLOTANTE ── */
function initWaFloat() {
  const btn = document.getElementById('wa-float');
  if (!btn) return;
  if (!waFloatEnabled) { btn.style.display = 'none'; return; }
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
