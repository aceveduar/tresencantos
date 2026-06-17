/* ── CONFIG ── */
const SUPABASE_URL      = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
const SESSION_KEY = 'te_admin_session';
const TE = null; // tracking removed — stub keeps TE?.track() calls safe
const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _posSession = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } })();
const KNOWN_ROLES = ['superadmin', 'encargado', 'operador', 'duena'];
const _posRole = (() => {
  const r = _posSession?.user?.user_metadata?.role;
  if (r && KNOWN_ROLES.includes(r)) return r;
  try {
    const jr = JSON.parse(atob(_posSession?.access_token?.split('.')[1]))?.user_metadata?.role;
    return (jr && KNOWN_ROLES.includes(jr)) ? jr : 'operador';
  } catch { return 'operador'; }
})();
// Lee la sesión actual en cada llamada para evitar que quede cacheado si cambia la cuenta
function getPosRole() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    const r = s?.user?.user_metadata?.role;
    if (r && KNOWN_ROLES.includes(r)) return r;
    const jr = JSON.parse(atob(s?.access_token?.split('.')[1]))?.user_metadata?.role;
    return (jr && KNOWN_ROLES.includes(jr)) ? jr : 'operador';
  } catch { return 'operador'; }
}
function canCancelSale() { const r = getPosRole(); return r === 'superadmin' || r === 'encargado'; }
function canEditApartado() { const r = getPosRole(); return r === 'superadmin' || r === 'duena'; }

async function cancelApartado(id) {
  if (!canEditApartado()) { toast('Sin permiso para cancelar apartados', 'error'); return; }
  const sale = (_apartadosData || {})[id];
  if (!sale) { toast('Apartado no encontrado', 'error'); return; }

  const custParts = (sale.customer || '').split(' · 📱 ');
  const nombre    = custParts[0] || 'Sin nombre';
  const total     = parseFloat(sale.total || 0);
  const pagado    = parseFloat(sale.paid_amount || 0);
  const nItems    = Array.isArray(sale.items) ? sale.items.length : 0;

  let msg = `¿Cancelar el apartado de ${nombre}?\n\n`;
  msg += `• $${total.toLocaleString('es-MX')} total · ${nItems} producto${nItems !== 1 ? 's' : ''}\n`;
  if (pagado > 0) msg += `• $${pagado.toLocaleString('es-MX')} ya pagado — se perderá al cancelar\n`;
  msg += `\nSe restaurará el stock. Esta acción no se puede deshacer.`;
  if (!confirm(msg)) return;

  const delResult = await api(`sales?id=eq.${id}`, { method: 'DELETE', headers: { 'Prefer': 'return=representation' } });
  if (!delResult.ok || (Array.isArray(delResult.data) && delResult.data.length === 0)) { toast('Error al cancelar apartado — sin permiso o registro no encontrado', 'error'); return; }

  if (Array.isArray(sale.items)) {
    const restores = [];
    for (const item of sale.items) {
      const p = products.find(x => x.id === item.id);
      if (p?.kitItems?.length) {
        for (const comp of p.kitItems) {
          const lc = products.find(x => x.id === comp.id);
          const newStock = (lc ? lc.stock : 0) + (item.qty || 1) * comp.qty;
          restores.push(api(`products?id=eq.${comp.id}`, { method:'PATCH', body:JSON.stringify({ stock: newStock, out_of_stock: false }) })
            .then(() => { if (lc) { lc.stock = newStock; lc.outOfStock = false; } }));
        }
      } else {
        const newStock = (p ? p.stock : 0) + (item.qty || 1);
        restores.push(api(`products?id=eq.${item.id}`, { method:'PATCH', body:JSON.stringify({ stock: newStock, out_of_stock: false }) })
          .then(() => { if (p) { p.stock = newStock; p.outOfStock = false; } }));
      }
    }
    await Promise.all(restores);
  }

  logActivity('apartado_cancelado',
    `Canceló apartado de ${nombre} — $${total.toLocaleString('es-MX')}`,
    { customer: nombre, total, pagado, items: nItems });

  closeAptDetail();
  await loadApartados();
  showAllProducts();
  toast(`Apartado de ${nombre} cancelado — stock restaurado ✓`, 'success');
}

/* ── AUTH CHECK ── */
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function isAuthenticated() {
  const s = getSession();
  return !!(s?.access_token && s.expires_at > Math.floor(Date.now() / 1000) + 60);
}
if (!isAuthenticated()) {
  window.location.href = 'admin.html';
}

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'admin.html';
}

/* ── STATE ── */
let products      = [];
let posCategories = [];
let cart          = [];
let salesStats    = {};
let salesCache  = {};
let currentCat  = 'all';
let payMethod   = 'efectivo';
let discType    = 'pct';
let _lastSale   = {};
let posView     = (window.innerWidth <= 1024) ? 'list' : (localStorage.getItem('te_pos_view') || 'list');
let posSort     = localStorage.getItem('te_pos_sort') || 'position';
let _posRecentOrder = JSON.parse(localStorage.getItem('te_recently_edited') || '[]');

/* ── API ── */
function _getPosToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return s?.access_token || SUPABASE_ANON_KEY;
  } catch { return SUPABASE_ANON_KEY; }
}
function api(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${_getPosToken()}`,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  });
}

/* ── LOAD PRODUCTS ── */
function _mapPosProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    categoryLabel: p.category_label,
    price: p.price,
    originalPrice: p.original_price,
    description: p.description || '',
    image: p.image,
    barcode: p.barcode || null,
    stock: p.stock ?? 0,
    outOfStock: p.out_of_stock,
    badge: p.badge,
    badgeType: p.badge_type,
    kitItems: p.kit_items || null
  };
}

async function loadProducts() {
  const result = await api('products?select=id,name,category,category_label,price,original_price,description,image,barcode,stock,out_of_stock,badge,badge_type,kit_items&is_archived=eq.false&order=position.asc');
  if (result.ok && Array.isArray(result.data)) {
    products = result.data.map(_mapPosProduct);
  }
  renderFrecuentes();
}

/* ── SUPABASE REALTIME ── */
function initRealtime() {
  if (typeof window.supabase === 'undefined') return;
  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${_getPosToken()}` } }
    });
    client
      .channel('pos-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, _handleRealtimeProduct)
      .subscribe();
  } catch (err) {
    console.warn('Realtime no disponible:', err);
  }
}

function _handleRealtimeProduct({ eventType, new: row, old }) {
  if (eventType === 'INSERT') {
    if (!row.is_archived && !products.find(x => x.id === row.id)) products.push(_mapPosProduct(row));
  } else if (eventType === 'UPDATE') {
    const idx = products.findIndex(x => x.id === row.id);
    if (row.is_archived) {
      if (idx >= 0) products.splice(idx, 1);
    } else if (idx >= 0) {
      products[idx] = { ...products[idx], ..._mapPosProduct(row) };
    } else {
      products.push(_mapPosProduct(row));
    }
  } else if (eventType === 'DELETE') {
    const idx = products.findIndex(x => x.id === old.id);
    if (idx >= 0) products.splice(idx, 1);
  }
  searchProducts(document.getElementById('pos-search')?.value || '');
}

/* ── KIT STOCK ── */
function getKitStock(p) {
  if (!p.kitItems?.length) return p.stock;
  let min = Infinity;
  for (const comp of p.kitItems) {
    const c = products.find(x => x.id === comp.id);
    if (!c || c.outOfStock || c.stock === 0) return 0;
    const avail = Math.floor(c.stock / comp.qty);
    if (avail < min) min = avail;
  }
  return min === Infinity ? 0 : min;
}

/* ── LOAD CATEGORIES ── */
async function refreshPosProducts() {
  const btn = document.getElementById('pos-refresh-btn');
  if (btn) { btn.style.opacity = '.4'; btn.style.pointerEvents = 'none'; }
  await Promise.all([loadProducts(), loadSalesStats(), loadTopProductsFromSales(), loadPosRecentlyEdited()]);
  showAllProducts();
  if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
  toast('Catálogo actualizado ✓', 'success');
}

async function loadPosCategories() {
  try {
    const r = await api('config?id=eq.categories&select=value');
    if (r.ok && r.data?.length && r.data[0].value) posCategories = JSON.parse(r.data[0].value);
  } catch {}
}

async function loadPosConfig() {
  try {
    const r = await api('config?id=eq.show_restock&select=id,value');
    if (r.ok && r.data?.length) _showRestock = r.data[0].value !== 'false';
  } catch {}
}

async function loadPosRecentlyEdited() {
  try {
    const r = await api('recently_edited?select=product_id&order=edited_at.desc&limit=60');
    if (r.ok && Array.isArray(r.data)) {
      _posRecentOrder = r.data.map(d => d.product_id);
      localStorage.setItem('te_recently_edited', JSON.stringify(_posRecentOrder));
    }
  } catch {}
}

async function loadSalesStats() {
  try {
    const r = await api('sales?select=items&order=created_at.desc&limit=200');
    if (!r.ok) return;
    salesStats = {};
    (r.data || []).forEach(sale => {
      if (!Array.isArray(sale.items)) return;
      sale.items.forEach(item => {
        if (item.id) salesStats[item.id] = (salesStats[item.id] || 0) + (item.qty || 1);
      });
    });
  } catch {}
}

function applySort(list) {
  switch (posSort) {
    case 'recientes': {
      const order = _posRecentOrder.length ? _posRecentOrder : JSON.parse(localStorage.getItem('te_recently_edited') || '[]');
      if (!order.length) return [...list].sort((a, b) => b.id - a.id);
      const idx = new Map(order.map((id, i) => [id, i]));
      return [...list].sort((a, b) => {
        const ia = idx.has(a.id) ? idx.get(a.id) : order.length;
        const ib = idx.has(b.id) ? idx.get(b.id) : order.length;
        if (ia === ib) return b.id - a.id;
        return ia - ib;
      });
    }
    case 'populares': return [...list].sort((a, b) => (salesStats[b.id] || 0) - (salesStats[a.id] || 0));
    case 'az':        return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    default: return list;
  }
}

function setPosSort(sort) {
  posSort = sort;
  localStorage.setItem('te_pos_sort', sort);
  document.querySelectorAll('.pos-sort-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.sort === sort)
  );
  const q = document.getElementById('pos-search')?.value || '';
  searchProducts(q);
}

function catMatchesFilter(productCat, filterCat) {
  if (filterCat === 'all') return true;
  if (productCat === filterCat) return true;
  if (productCat.startsWith(filterCat + '_')) return true;
  let cat = posCategories.find(c => c.code === productCat);
  while (cat?.parent) {
    if (cat.parent === filterCat) return true;
    cat = posCategories.find(c => c.code === cat.parent);
  }
  return false;
}

/* ── ACTIVITY LOG ── */
function getCurrentUserEmail() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.access_token) return 'desconocido';
    return JSON.parse(atob(s.access_token.split('.')[1])).email || 'desconocido';
  } catch { return 'desconocido'; }
}
function logActivity(action, summary, meta = null) {
  api('activity_log', {
    method: 'POST',
    body: JSON.stringify({ user_email: getCurrentUserEmail(), action, summary, meta })
  }).catch(() => {});
}

/* ── VIEW TOGGLE ── */
function setPosView(view) {
  posView = view;
  localStorage.setItem('te_pos_view', view);
  document.getElementById('pos-vbtn-list')?.classList.toggle('active', view === 'list');
  document.getElementById('pos-vbtn-cards')?.classList.toggle('active', view === 'cards');
  showAllProducts();
}

function posCard(p) {
  const effStock = getKitStock(p);
  const isKit = !!(p.kitItems?.length);
  const oos = isKit ? effStock === 0 : (effStock === 0 || p.outOfStock);
  const stockCls = isKit ? (oos ? 'stock-sold' : 'stock-ok') : (effStock === 0 ? 'stock-sold' : effStock === 1 ? 'stock-one' : 'stock-ok');
  const stockTxt = isKit
    ? (oos ? 'Sin stock' : `🎁 ${effStock} kit${effStock!==1?'s':''}`)
    : (effStock === 0 ? 'Sin stock' : `${effStock} ud${effStock!==1?'s':''}`);
  const kitComps = isKit && p.kitItems?.length
    ? p.kitItems.map(c => `<div style="font-size:.6rem;color:#9B8B78;line-height:1.3;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.qty > 1 ? c.qty + '× ' : ''}${_esc(c.name)}</div>`).join('')
    : '';
  return `
<div class="pos-card${oos?' card-sold':''}" onclick="${oos?`_showRestockPrompt(${p.id})`:` addToCart(${p.id},this.querySelector('.pos-card-add-icon'),event)`}">
  <div class="pos-card-img-wrap">
    <img class="pos-card-img" src="${p.image}" alt="${_esc(p.name)}" loading="lazy"
         onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'"
         onclick="event.stopPropagation();openPosPreview(${p.id})" style="cursor:zoom-in">
    <div class="pos-card-add">
      <div class="pos-card-add-icon">+</div>
    </div>
  </div>
  <div class="pos-card-body">
    <div class="pos-card-name">${isKit ? '🎁 ' : ''}${_esc(p.name)}</div>
    ${kitComps}
    <div class="pos-card-price">$${p.price.toLocaleString('es-MX')}</div>
    <span class="pos-card-stock ${stockCls}">${stockTxt}</span>
  </div>
</div>`;
}

/* ── CATEGORY CHIPS ── */
function renderCategoryChips() {
  const bar = document.getElementById('cat-chip-bar');
  if (!bar) return;
  const roots = posCategories.filter(c => !c.parent && c.code !== 'por_revisar' && products.some(p => catMatchesFilter(p.category, c.code)));
  const chips = roots.length
    ? roots
    : [...new Map(products.map(p => [p.category, { code: p.category, label: p.categoryLabel }])).values()];
  bar.innerHTML = `<button class="cat-chip active" data-cat="all" onclick="setCategory('all')">Todos</button>` +
    chips.map(c => `<button class="cat-chip" data-cat="${c.code}" onclick="setCategory('${c.code}')">${_esc(c.label)}</button>`).join('');
  _catChipScroll();
}

/* Oculta el indicador "›" de .cat-chip-bar-wrap cuando ya no hay más chips a la derecha */
function _catChipScroll() {
  const el = document.getElementById('cat-chip-bar');
  const wrap = document.getElementById('cat-chip-bar-wrap');
  if (!el || !wrap) return;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  wrap.classList.toggle('at-end', atEnd);
}

function setCategory(cat) {
  currentCat = cat;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
  const q = document.getElementById('pos-search').value;
  searchProducts(q);
}

const _normCache = new Map();
const _norm = s => {
  const k = s || '';
  if (_normCache.has(k)) return _normCache.get(k);
  const v = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  _normCache.set(k, v);
  return v;
};

/* ── SEARCH ── */
function getFilteredProducts(q = '', includeOos = false) {
  const groups = _norm(q).split(',').map(g => g.trim().split(/\s+/).filter(Boolean)).filter(g => g.length);
  const filtered = products.filter(p => {
    const effStock = getKitStock(p);
    const isOos = p.kitItems?.length ? effStock === 0 : (p.outOfStock || p.stock === 0);
    if (isOos && !includeOos) return false;
    const matchCat = catMatchesFilter(p.category, currentCat);
    const matchQ   = !groups.length || groups.some(g => g.every(t =>
      _norm(p.name).includes(t) ||
      (p.barcode && p.barcode.includes(t)) ||
      _norm(p.categoryLabel).includes(t)
    ));
    return matchCat && matchQ;
  });
  const sorted = applySort(filtered);
  // OOS al final cuando se incluyen
  if (includeOos) {
    sorted.sort((a, b) => {
      const aOos = a.kitItems?.length ? getKitStock(a) === 0 : (a.outOfStock || a.stock === 0);
      const bOos = b.kitItems?.length ? getKitStock(b) === 0 : (b.outOfStock || b.stock === 0);
      return aOos - bOos;
    });
  }
  return sorted;
}

function renderPosProducts(list, groupByCategory = false) {
  const el = document.getElementById('pos-results');
  if (!list.length) return;
  if (posView === 'cards') {
    el.innerHTML = `<div class="pos-grid">${list.map(p => posCard(p)).join('')}</div>`;
    return;
  }
  // Vista lista (con headers de categoría si es showAll)
  if (groupByCategory) {
    // Agrupar por categoría raíz (sin padre) para evitar secciones fragmentadas
    const getRootLabel = cat => {
      const c = posCategories.find(x => x.code === cat);
      if (!c) return cat;
      if (!c.parent) return c.label;
      const root = posCategories.find(x => x.code === c.parent);
      return root ? root.label : c.label;
    };
    const cats = {};
    const order = [];
    list.forEach(p => {
      const key = getRootLabel(p.category);
      if (!cats[key]) { cats[key] = []; order.push(key); }
      cats[key].push(p);
    });
    el.innerHTML = order.map(label =>
      `<div class="cat-header">${_esc(label)}</div>` + cats[label].map(p => productCard(p)).join('')
    ).join('');
  } else {
    el.innerHTML = list.map(p => productCard(p)).join('');
  }
}

function showAllProducts() {
  const el = document.getElementById('pos-results');
  if (!products.length) {
    el.innerHTML = '<div class="pos-empty"><div class="em">📦</div>No hay productos cargados</div>';
    return;
  }
  const filtered = getFilteredProducts();
  if (!filtered.length) {
    el.innerHTML = '<div class="pos-empty"><div class="em">🔍</div>Sin productos en esta categoría</div>';
    return;
  }
  const groupCat = currentCat === 'all' && posView === 'list' && posSort === 'az';
  renderPosProducts(filtered, groupCat);
}

function _togglePosSearchClear() {
  const btn = document.getElementById('pos-search-clear');
  if (btn) btn.style.display = document.getElementById('pos-search')?.value ? '' : 'none';
}
function clearPosSearch() {
  const s = document.getElementById('pos-search');
  if (s) { s.value = ''; s.focus(); }
  _togglePosSearchClear();
  searchProducts('');
}

let _posSearchDebTimer = null;
function _posSearchDebounce(q) {
  _togglePosSearchClear();
  clearTimeout(_posSearchDebTimer);
  _posSearchDebTimer = setTimeout(() => searchProducts(q), 180);
}

function searchProducts(q) {
  renderFrecuentes(!!q.trim());
  const el = document.getElementById('pos-results');
  const matches = getFilteredProducts(q, !!q.trim()).slice(0, 40);
  if (!q.trim() && currentCat === 'all') { showAllProducts(); return; }
  if (!matches.length) {
    el.innerHTML = `<div class="pos-empty"><div class="em">🔍</div>Sin resultados</div>`;
    return;
  }
  renderPosProducts(matches, false);
}

const PROD_PLACEHOLDER = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23F7F2EB%22%2F%3E%3Crect%20x%3D%22130%22%20y%3D%22100%22%20width%3D%22140%22%20height%3D%22140%22%20rx%3D%2210%22%20fill%3D%22none%22%20stroke%3D%22%23D4BC94%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22158%22%20cy%3D%22127%22%20r%3D%2214%22%20fill%3D%22%23D4BC94%22%2F%3E%3Cpath%20d%3D%22M130%20210%20L175%20165%20L210%20195%20L255%20150%20L280%20180%20L280%20240%20L130%20240Z%22%20fill%3D%22%23D4BC94%22%20fill-opacity%3D%22.4%22%2F%3E%3C%2Fsvg%3E';

function productCard(p) {
  const effStock = getKitStock(p);
  const isKit    = !!(p.kitItems?.length);
  const oos      = isKit ? effStock === 0 : (effStock === 0 || p.outOfStock);
  const disabled = oos ? 'style="opacity:.5;cursor:not-allowed"' : '';
  const kitCompsLine = isKit && p.kitItems?.length
    ? p.kitItems.map(c => `<div style="font-size:.7rem;color:#9B8B78;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.qty > 1 ? c.qty + '× ' : ''}${_esc(c.name)}</div>`).join('')
    : '';
  const stockSub = isKit
    ? (oos ? ' · <span style="color:var(--red)">Sin stock</span>' : ` · <span style="color:#6B9E78;font-weight:600">🎁 ${effStock} kit${effStock!==1?'s':''}</span>`)
    : effStock === 1
      ? ' · <span style="color:#C9A462;font-weight:700">Última</span>'
      : effStock >= 2 && effStock <= 5
        ? ` · <span style="color:#6B9E78;font-weight:600">${effStock} uds</span>`
        : effStock > 5
          ? ` · <span style="color:#9B8B78">${effStock} uds</span>`
          : '';
  return `
<div class="pos-prod" onclick="${oos ? `_showRestockPrompt(${p.id})` : `addToCart(${p.id},null,event)`}" ${oos ? '' : ''}>
  <img class="pos-prod-img" src="${p.image}" alt="${_esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'" onclick="event.stopPropagation();${oos ? `_showRestockPrompt(${p.id})` : `openPosPreview(${p.id})`}" style="cursor:${oos?'pointer':'zoom-in'}">
  <div class="pos-prod-info">
    <div class="pos-prod-name">${isKit ? '🎁 ' : ''}${_esc(p.name)}</div>
    ${kitCompsLine}
    <div class="pos-prod-sub"${kitCompsLine ? ' style="margin-top:5px;padding-top:4px;border-top:1px solid #EDE0CF"' : ''}>${_esc(p.categoryLabel)}${stockSub}</div>
  </div>
  <div class="pos-prod-right">
    <div class="pos-prod-price">$${p.price.toLocaleString('es-MX')}</div>
    <button class="pos-prod-add${oos ? ' btn-stock-oos' : ''}" onclick="event.stopPropagation();${oos ? `_showRestockPrompt(${p.id})` : `addToCart(${p.id},this,event)`}" title="${oos ? 'Sin stock — toca para reabastecer' : 'Agregar'}">+</button>
  </div>
</div>`;
}
