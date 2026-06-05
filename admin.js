const SESSION_KEY  = "te_admin_session";
const LOCKOUT_KEY  = "te_admin_lock";
const DEFAULT_IMG  = 'tresencantos_default.png';

// SVG icons — renderizado fiable en iOS y Android (emoji ✏⧉ fallan en muchas fuentes)
const ICON_EDIT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 60 * 1000; // 1 minuto de bloqueo por cada 5 intentos fallidos

/* ── ROLES Y PERMISOS ── */
// Roles válidos: 'superadmin' | 'encargado' | 'operador' | 'duena'
// encargado = operador + eliminar productos + cancelar ventas + ver reportes
// Sin rol definido → 'operador' (nunca escala permisos)
function _parseRole() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    const fromUser = s?.user?.user_metadata?.role;
    if (fromUser) return fromUser;
    const token = s?.access_token;
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const r = payload?.user_metadata?.role;
      if (r) return r;
    }
    return 'operador';
  } catch { return 'operador'; }
}
const ROLE = _parseRole();
const _isSuperOrEncargado = ROLE === 'superadmin' || ROLE === 'encargado';
const _isDuena = ROLE === 'duena';
const can = {
  deleteProduct:   _isSuperOrEncargado || _isDuena || ROLE === 'operador',
  bulkDelete:      _isSuperOrEncargado,
  importJSON:      ROLE === 'superadmin',
  manageSettings:  ROLE === 'superadmin',
  publishProduct:  ROLE === 'superadmin' || _isDuena || ROLE === 'operador',
  editProduct:     true,
  addProduct:      true,
};

const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';

// Anon key — para operaciones de autenticación (login/logout/refresh)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';

// Service role key — bypasea RLS para operaciones de datos del admin (nunca en el sitio público)
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyNjIyNiwiZXhwIjoyMDk0MTAyMjI2fQ.B9nZ1KENDQsUtn9PFwiMTrXuMZuWWIphGnH8XPfeJjQ';

let products = [];
let _kitItemsEdit = [];
let _additionalImagesEdit = [];
let _returnToDupReview = false;
let _returnToKitId = null;     // ID del kit cuyo formulario se debe reabrir al cerrar un componente
let _returnToKitQVId = null;   // ID del kit cuyo QV se debe reabrir al cerrar un componente
let _scrollToKitOnOpen = false; // al regresar al kit, hacer scroll hasta la sección de componentes
let _salesCountMap = new Map(); // productId → qty vendida total
let deleteTargetId = null;
let selectedIds = new Set();
let dragSrcId = null;
let _multiDrag = false;
let _dragScrollRaf = null;

function _dragAutoScroll(e) {
  if (dragSrcId === null) return;
  const ZONE = 80, SPEED = 18;
  const y = e.clientY;
  const h = window.innerHeight;
  cancelAnimationFrame(_dragScrollRaf);
  if (y < ZONE) {
    const step = () => { window.scrollBy(0, -SPEED * (1 - y / ZONE)); if (dragSrcId !== null) _dragScrollRaf = requestAnimationFrame(step); };
    _dragScrollRaf = requestAnimationFrame(step);
  } else if (y > h - ZONE) {
    const step = () => { window.scrollBy(0, SPEED * (1 - (h - y) / ZONE)); if (dragSrcId !== null) _dragScrollRaf = requestAnimationFrame(step); };
    _dragScrollRaf = requestAnimationFrame(step);
  }
}
document.addEventListener('dragover', _dragAutoScroll);
document.addEventListener('dragend', () => { cancelAnimationFrame(_dragScrollRaf); _dragScrollRaf = null; });

function _startMultiDrag(e) {
  _multiDrag = true;
  const ghost = document.createElement('div');
  ghost.textContent = `${selectedIds.size} productos`;
  ghost.style.cssText = 'position:fixed;left:-9999px;top:0;background:var(--charcoal);color:#fff;padding:7px 16px;border-radius:50px;font-weight:700;font-size:.82rem;white-space:nowrap';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 70, 18);
  setTimeout(() => ghost.remove(), 0);
  selectedIds.forEach(sid => {
    document.querySelector(`tr[data-id="${sid}"]`)?.classList.add('dragging');
    document.querySelector(`.admin-card[data-id="${sid}"]`)?.classList.add('card-dragging');
  });
}

function _doMultiDrop(targetId, insertBefore) {
  if (selectedIds.has(targetId)) return false; // soltar sobre seleccionado = no-op
  const group = products.filter(p => selectedIds.has(p.id));
  const rest  = products.filter(p => !selectedIds.has(p.id));
  const tgtIdx = rest.findIndex(p => p.id === targetId);
  if (tgtIdx === -1) return false;
  rest.splice(insertBefore ? tgtIdx : tgtIdx + 1, 0, ...group);
  products.splice(0, products.length, ...rest);
  return true;
}
let currentSort = 'recent';
let _adminPage = 1;
const ADMIN_PAGE_SIZE = 50;
let _realtimeChannel = null;
let _statFilter = null; // 'con-stock' | 'sin-stock' | 'sin-publicar' | 'sin-codigo' | 'ultima-pieza' | 'kits' | 'borradores'

/* Categorías — cargadas dinámicamente desde config.categories */
let categories = []; // [{code, label, color}]

/* ── USAGE TRACKER (TE) ─────────────────────────────────────────────── */
const TE = (() => {
  const _q = [];
  let _timer = null;
  const _email = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY))?.user?.email || ''; } catch { return ''; } };
  const _flush = () => {
    const items = _q.splice(0);
    if (!items.length) return;
    // supabaseApi disponible en tiempo de ejecución
    fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(items)
    }).catch(() => {});
  };
  return {
    track(event, payload = {}) {
      _q.push({ event, user_email: _email(), payload });
      clearTimeout(_timer);
      _timer = setTimeout(_flush, 5000);
    },
    trackSearch(q, found) {
      if ((q || '').length < 3) return;
      this.track('search', { found });
    },
    report() {}  // reportes en stats.html
  };
})();

const CAT_DEFAULTS = [
  // ── BOLSOS ──────────────────────────────────────────────
  {code:'bolsos',              label:'Bolsos',              color:'#C9A462'},
  {code:'bolsos_dama',         label:'Bolsos Dama',         color:'#C9A462', parent:'bolsos'},
  {code:'bolsos_casual',       label:'Bolsos Casual',       color:'#C9A462', parent:'bolsos'},
  {code:'cosmetiqueras',       label:'Cosmetiqueras',       color:'#C9A462', parent:'bolsos'},
  // ── MOCHILAS (incluye cangureras, lapiceras, loncheras) ─
  {code:'mochilas',            label:'Mochilas',            color:'#60a5fa'},
  {code:'mochilas_dama',       label:'Mochilas Dama',       color:'#60a5fa', parent:'mochilas'},
  {code:'mochilas_personaje',  label:'Mochilas Personaje',  color:'#60a5fa', parent:'mochilas'},
  {code:'mochilas_deportivas', label:'Mochilas Deportivas', color:'#60a5fa', parent:'mochilas'},
  {code:'cangureras',          label:'Cangureras',          color:'#60a5fa', parent:'mochilas'},
  {code:'lapiceras',           label:'Lapiceras',           color:'#60a5fa', parent:'mochilas'},
  {code:'loncheras',           label:'Loncheras',           color:'#60a5fa', parent:'mochilas'},
  // ── ACCESORIOS ──────────────────────────────────────────
  {code:'accesorios',          label:'Accesorios',          color:'#f472b6'},
  {code:'cabello',             label:'Cabello',             color:'#f472b6', parent:'accesorios'},
  {code:'bisuteria',           label:'Bisutería & Joyería', color:'#f472b6', parent:'accesorios'},
  {code:'moda',                label:'Moda',                color:'#f472b6', parent:'accesorios'},
  // ── BELLEZA ─────────────────────────────────────────────
  {code:'belleza',             label:'Belleza',             color:'#a78bfa'},
  {code:'maquillaje',          label:'Maquillaje',          color:'#a78bfa', parent:'belleza'},
  {code:'unas',                label:'Uñas & Manicure',     color:'#a78bfa', parent:'belleza'},
  // ── NATURA ──────────────────────────────────────────────
  {code:'natura',              label:'Natura',              color:'#34d399'},
  {code:'natura_perfumes',     label:'Perfumería',          color:'#34d399', parent:'natura'},
  {code:'natura_cuerpo',       label:'Cuerpo',              color:'#34d399', parent:'natura'},
  {code:'natura_facial',       label:'Facial',              color:'#34d399', parent:'natura'},
  {code:'natura_cabello',      label:'Cabello Natura',      color:'#34d399', parent:'natura'},
  {code:'natura_maquillaje',   label:'Maquillaje Natura',   color:'#34d399', parent:'natura'},
  // ── AVON ────────────────────────────────────────────────
  {code:'avon',                label:'Avon',                color:'#e11d48'},
  {code:'avon_perfumes',       label:'Perfumería',          color:'#e11d48', parent:'avon'},
  {code:'avon_cuerpo',         label:'Cuerpo',              color:'#e11d48', parent:'avon'},
  {code:'avon_facial',         label:'Facial',              color:'#e11d48', parent:'avon'},
  {code:'avon_maquillaje',     label:'Maquillaje',          color:'#e11d48', parent:'avon'},
];
const CAT_PALETTE = ['#C9A462','#60a5fa','#f472b6','#34d399','#a78bfa','#fb923c','#fbbf24','#a3e635','#2dd4bf','#f87171'];

function getCatLabel(code) { return categories.find(c => c.code === code)?.label || code; }
function getCatColor(code) { return categories.find(c => c.code === code)?.color || '#9B8B78'; }

async function loadCategories() {
  const r = await supabaseApi('config?id=eq.categories&select=value');
  if (r.ok && r.data?.length && r.data[0].value) {
    try { categories = JSON.parse(r.data[0].value); } catch { categories = [...CAT_DEFAULTS]; }
  } else {
    categories = [...CAT_DEFAULTS];
    await _saveCategories();
  }
  renderCategorySelects();
}

async function _saveCategories() {
  return supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'categories', value: JSON.stringify(categories) })
  });
}

/* Helpers para subcategorías */
function rootCats()     { return categories.filter(c => !c.parent); }
function subCats(code)  { return categories.filter(c => c.parent === code); }
function renderCategorySelects() {
  // Select del formulario de producto — sólo hojas (sin hijos)
  const fSel = document.getElementById('f-category');
  if (fSel) {
    const cur = fSel.value;
    const roots = rootCats();
    fSel.innerHTML = `<option value="por_revisar">📋 Por revisar</option>` + roots.filter(r => r.code !== 'por_revisar').map(r => {
      const subs = subCats(r.code);
      if (subs.length) {
        return `<optgroup label="${r.label}"><option value="${r.code}">${r.label} — General</option>${subs.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}</optgroup>`;
      }
      return `<option value="${r.code}">${r.label}</option>`;
    }).join('');
    if (cur && categories.find(c => c.code === cur)) fSel.value = cur;
  }
  // Select del filtro de la tabla — raíces + hojas indentadas
  const tSel = document.getElementById('cat-filter');
  if (tSel) {
    const roots = rootCats();
    tSel.innerHTML = `<option value="all">Todas las categorías</option>` +
      roots.map(r => {
        const subs = subCats(r.code);
        if (subs.length) {
          return `<optgroup label="${r.label}"><option value="${r.code}">${r.label} — Todos</option>${subs.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}</optgroup>`;
        }
        return `<option value="${r.code}">${r.label}</option>`;
      }).join('');
  }
  _updateCatFilterBtn();
}

function _updateCatFilterBtn() {
  const btn = document.getElementById('cat-filter-btn');
  const lbl = document.getElementById('cat-filter-btn-label');
  if (!btn || !lbl) return;
  const val = document.getElementById('cat-filter')?.value || 'all';
  if (val === 'all') {
    lbl.textContent = 'Categorías';
    btn.classList.remove('has-filter');
  } else {
    const cat = categories.find(c => c.code === val);
    lbl.textContent = cat?.label || val;
    btn.classList.add('has-filter');
  }
}

function openCatSheet() {
  const searchEl = document.getElementById('cat-sheet-search');
  if (searchEl) searchEl.value = '';
  _renderCatSheetChips('');
  document.getElementById('cat-sheet-overlay').classList.add('open');
  document.getElementById('cat-sheet').classList.add('open');
  document.body.style.overflow = 'hidden';
  _initCatSheetSwipe();
  setTimeout(() => searchEl?.focus(), 320);
}

function _renderCatSheetChips(query) {
  const list = document.getElementById('cat-sheet-list');
  if (!list) return;
  const cur   = document.getElementById('cat-filter')?.value || 'all';
  const roots = rootCats();
  const q     = query.toLowerCase().trim();

  const dot  = (color) => `<span style="width:8px;height:8px;border-radius:50%;background:${color || '#8A7564'};display:inline-block;flex-shrink:0"></span>`;
  const chip = (code, label, color, isSelected) =>
    `<button class="bcp-chip${isSelected ? ' selected' : ''}" onclick="selectCatSheet('${code}')">${dot(color)}${label}</button>`;

  let html = '';

  // Chip "Todas" + sección "Por revisar" en una misma franja
  const sinCategCount = products.filter(p => p.category === 'por_revisar').length;
  const todasMatch = !q || 'todas las categorías'.includes(q);
  const revisar    = sinCategCount > 0 && (!q || 'por revisar sin categoría'.includes(q));

  if (todasMatch || revisar) {
    const todasChip   = todasMatch ? chip('all', 'Todas las categorías', '#8A7564', cur === 'all') : '';
    const revisarChip = revisar
      ? chip('por_revisar', `⚠️ Sin categoría — ${sinCategCount}`, '#D97706', cur === 'por_revisar')
      : '';
    html += `<div style="padding:10px 16px 10px"><div class="bcp-chips">${todasChip}${revisarChip}</div></div>`;
  }

  // Categorías agrupadas
  roots.filter(r => r.code !== 'por_revisar').forEach(r => {
    const subs  = subCats(r.code);
    const color = r.color || '#8A7564';
    const items = [
      { code: r.code, label: subs.length ? 'Todos' : r.label, color },
      ...subs.map(s => ({ code: s.code, label: s.label, color: s.color || color }))
    ];
    const filtered = q ? items.filter(i => i.label.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)) : items;
    if (!filtered.length) return;
    html += `<div style="padding:2px 16px 10px;border-top:1px solid var(--border)">
      <div class="bcp-group-label">${r.label.toUpperCase()}</div>
      <div class="bcp-chips">${filtered.map(i => chip(i.code, i.label, i.color, cur === i.code)).join('')}</div>
    </div>`;
  });

  list.innerHTML = html || `<div style="padding:28px;text-align:center;color:var(--muted);font-size:.85rem">Sin resultados</div>`;
}

function _catSheetFilter(q) { _renderCatSheetChips(q); }

function closeCatSheet() {
  document.getElementById('cat-sheet-overlay').classList.remove('open');
  document.getElementById('cat-sheet').classList.remove('open');
  document.body.style.overflow = '';
}

function selectCatSheet(code) {
  if (code !== 'all') TE?.track('filter_category', { cat: code });
  const sel = document.getElementById('cat-filter');
  if (sel) sel.value = code;
  _adminPage = 1;
  _updateCatFilterBtn();
  renderTable();
  closeCatSheet();
}

function _initCatSheetSwipe() {
  const sheet = document.getElementById('cat-sheet');
  if (!sheet || sheet._swipeInited) return;
  sheet._swipeInited = true;
  let sy = null, cy = 0;
  sheet.addEventListener('touchstart', e => { sy = e.touches[0].clientY; cy = 0; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (sy === null) return;
    const dy = e.touches[0].clientY - sy;
    if (dy > 0) { cy = dy; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (cy > 80) closeCatSheet();
    sheet.style.transform = '';
    sy = null; cy = 0;
  }, { passive: true });
}

const getSupabaseUrl = () => SUPABASE_URL;
const getSupabaseKey = () => SUPABASE_SERVICE_KEY;

/* ── ACTIVITY LOG ── */
function getCurrentUserEmail() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.access_token) return 'desconocido';
    // Usar email guardado directamente en la sesión (más confiable que decodificar JWT)
    if (s.email) return s.email;
    if (s.user?.email) return s.user.email;
    // Fallback: decodificar JWT (Base64URL → Base64 estándar antes de atob)
    const b64 = s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).email || 'desconocido';
  } catch { return 'desconocido'; }
}
function logActivity(action, summary, meta = null) {
  supabaseApi('activity_log', {
    method: 'POST',
    body: JSON.stringify({ user_email: getCurrentUserEmail(), action, summary, meta })
  }).catch(() => {});
}

function adminCatMatches(productCat, filterCat) {
  if (filterCat === 'all') return true;
  if (productCat === filterCat) return true;
  if (productCat.startsWith(filterCat + '_')) return true;
  let cat = categories.find(c => c.code === productCat);
  while (cat?.parent) {
    if (cat.parent === filterCat) return true;
    cat = categories.find(c => c.code === cat.parent);
  }
  return false;
}

const _norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function getFilteredProducts() {
  const q           = _norm(document.getElementById('search-input')?.value) || '';
  const cat         = document.getElementById('cat-filter')?.value || 'all';
  const creatorVal  = document.getElementById('creator-filter')?.value || 'all';
  const filtered = products.filter(p => {
    const matchCat = adminCatMatches(p.category, cat);
    const groups = q ? q.split(',').map(g => g.trim().split(/\s+/).filter(Boolean)).filter(g => g.length) : [];
    const matchQ = !groups.length || groups.some(g => g.every(t =>
      _norm(p.name).includes(t) ||
      _norm(p.categoryLabel).includes(t) ||
      (p.barcode && p.barcode.includes(t)) ||
      t === String(Math.round(p.price || 0))
    ));
    const matchFlag    = !_showOnlyFlagged || !!_flagItem(p.id);
    const matchCreator = creatorVal === 'all' || p.createdBy === creatorVal || (!p.createdBy && creatorVal === '__none__');
    const matchStat = !_statFilter ||
      (_statFilter === 'con-stock'    && p.stock > 0 && !p.outOfStock) ||
      (_statFilter === 'sin-stock'    && (p.stock === 0 || p.outOfStock)) ||
      (_statFilter === 'sin-publicar' && p.isPublished === false) ||
      (_statFilter === 'sin-codigo'   && !p.barcode) ||
      (_statFilter === 'sin-categ'    && p.category === 'por_revisar') ||
      (_statFilter === 'ultima-pieza' && p.stock === 1 && !p.outOfStock) ||
      (_statFilter === 'sin-precio'   && (!p.price || p.price === 0)) ||
      (_statFilter === 'imagen-base64' && p.image?.startsWith('data:')) ||
      (_statFilter === 'kits'         && !!p.kitItems?.length) ||
      (_statFilter === 'vendidos'     && (_salesCountMap.get(p.id) || 0) > 0) ||
      (_statFilter === 'borradores');
    const isKit      = !!p.kitItems?.length;
    const isBorrador = !isKit && !p.isPublished && (!p.price || p.price === 0);
    const matchKit      = _statFilter === 'kits'      ? isKit      : !isKit;
    const matchBorrador = _statFilter === 'borradores' ? isBorrador : !isBorrador;
    return matchCat && matchQ && matchFlag && matchStat && matchKit && matchBorrador && matchCreator;
  });

  switch (currentSort) {
    case 'recent': {
      const order = _editedOrder();
      if (!order.length) return [...filtered].sort((a, b) => b.id - a.id);
      return [...filtered].sort((a, b) => {
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        if (ia === -1 && ib === -1) return b.id - a.id;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }
    case 'name-az':    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    case 'name-za':    return [...filtered].sort((a, b) => b.name.localeCompare(a.name, 'es'));
    case 'price-asc':  return [...filtered].sort((a, b) => a.price - b.price);
    case 'price-desc': return [...filtered].sort((a, b) => b.price - a.price);
    case 'stock-asc':  return [...filtered].sort((a, b) => a.stock - b.stock);
    case 'stock-desc': return [...filtered].sort((a, b) => b.stock - a.stock);
    default:           return filtered; // position (orden del drag & drop)
  }
}

function supabaseApi(path, opts = {}) {
  return fetch(getSupabaseUrl() + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: getSupabaseKey(),
      Authorization: 'Bearer ' + getSupabaseKey(),
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text || null; }
    return { ok: r.ok, status: r.status, data };
  });
}

/* ── AUTH HELPERS ── */

// Helper para endpoints de Supabase Auth (usa anon key, no service role)
function supabaseAuth(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  });
}

function isAuthenticated() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    // Token válido si no expiró (con 60s de margen)
    return !!(s?.access_token && s.expires_at > Math.floor(Date.now() / 1000) + 60);
  } catch { return false; }
}

async function refreshSessionIfNeeded() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.refresh_token) return false;

    const result = await supabaseAuth('/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });

    if (!result.ok || !result.data?.access_token) return false;

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token:  result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_at:    Math.floor(Date.now() / 1000) + (result.data.expires_in || 3600),
      email:         result.data.user?.email || s.email,
      user:          result.data.user || s.user
    }));
    return true;
  } catch { return false; }
}

async function requireAuth() {
  if (isAuthenticated()) return true;
  // Token expirado — intentar renovar con el refresh token
  const refreshed = await refreshSessionIfNeeded();
  if (refreshed) return true;
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('app-screen').style.display = 'none';
  showAuthScreen();
  return false;
}

function checkLockout() {
  try {
    const d = JSON.parse(sessionStorage.getItem(LOCKOUT_KEY) || '{}');
    if (d.until && Date.now() < d.until) return Math.ceil((d.until - Date.now()) / 1000);
    if (d.until) sessionStorage.removeItem(LOCKOUT_KEY);
  } catch {}
  return 0;
}

function recordAttempt() {
  try {
    const d = JSON.parse(sessionStorage.getItem(LOCKOUT_KEY) || '{}');
    const count = (d.count || 0) + 1;
    sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(
      count >= MAX_ATTEMPTS ? { count: 0, until: Date.now() + LOCKOUT_MS } : { count }
    ));
  } catch {}
}

function clearAttempts() { sessionStorage.removeItem(LOCKOUT_KEY); }

/* ── HELPERS ── */
function setBtn(el, loading, text) {
  if (!el) return;
  if (loading) {
    el.dataset.loading = '1';
    if (text) { el.dataset.origText = el.textContent; el.textContent = text; }
  } else {
    delete el.dataset.loading;
    if (el.dataset.origText) { el.textContent = el.dataset.origText; delete el.dataset.origText; }
  }
}

/* ── INIT ── */
window.addEventListener('pageshow', () => {
  const srp = document.getElementById('scan-result-panel');
  closeQV();
});

// Advertir si navegan a otro módulo con cambios sin guardar
window.addEventListener('beforeunload', e => {
  if (_formIsDirty() || _capIsDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  if (isAuthenticated()) {
    await showApp();
  } else if (localStorage.getItem(SESSION_KEY)) {
    // Token expirado — intentar renovar silenciosamente
    const refreshed = await refreshSessionIfNeeded();
    if (refreshed) {
      await showApp();
    } else {
      localStorage.removeItem(SESSION_KEY);
      const err = document.getElementById('pwd-err');
      if (err) { err.textContent = 'Tu sesión expiró. Ingresa de nuevo.'; err.classList.add('show'); }
    }
  }
  document.addEventListener('keydown', e => {
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
    const modalOpen = document.querySelector('.overlay.open');

    // Escape — cierra cualquier modal abierto
    if (e.key === 'Escape') {
      if (document.getElementById('form-overlay')?.classList.contains('open'))    { closeForm(); return; }
      if (document.getElementById('del-overlay')?.classList.contains('open'))     { closeDel(); return; }
      if (document.getElementById('revista-overlay')?.classList.contains('open')) { closeRevista(); return; }
      if (document.getElementById('cat-overlay')?.classList.contains('open'))     { closeCatManager(); return; }
      if (document.getElementById('scanner-overlay')?.classList.contains('open')) { closeAdminScanner(); return; }
    }

    // Atajos solo cuando no hay modal abierto y no se está escribiendo
    if (inInput || modalOpen) return;

    // N — nuevo producto
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openForm(); }

    // / — foco en búsqueda
    if (e.key === '/') { e.preventDefault(); document.getElementById('search-input')?.focus(); }

    // Z — deshacer última eliminación
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doUndo(); }
  });

  // Placeholder adaptativo del buscador — corto en mobile, completo en desktop
  const _adaptSearch = () => {
    const el = document.getElementById('search-input');
    if (el) el.placeholder = window.innerWidth <= 640 ? 'Buscar…' : 'Buscar… varios términos separados por coma';
  };
  _adaptSearch();

  // Re-renderizar tabla al rotar el teléfono o redimensionar ventana
  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
    const focused = document.activeElement;
    const inTable = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA') && document.querySelector('.table-wrap')?.contains(focused);
    if (!inTable) { renderTable(); _adaptSearch(); }
  }, 180);
  });

  // Botón scroll-to-top
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('scroll-top-btn');
    if (btn) btn.classList.toggle('show', window.scrollY > 300);
  }, { passive: true });
});

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
}

/* ── AUTH ── */
async function doLoginEmail() {
  const email    = document.getElementById('email-input').value.trim();
  const password = document.getElementById('pwd-input').value;
  const err      = document.getElementById('pwd-err');
  const btn      = document.querySelector('.btn-login');

  err.classList.remove('show');

  // Bloqueo por demasiados intentos
  const wait = checkLockout();
  if (wait) {
    err.textContent = `Demasiados intentos. Espera ${wait} segundo${wait !== 1 ? 's' : ''}.`;
    err.classList.add('show');
    return;
  }

  if (!email || !password) {
    err.textContent = 'Completa email y contraseña';
    err.classList.add('show');
    return;
  }

  setBtn(btn, true, 'Verificando...');

  let result;
  try {
    result = await supabaseAuth('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  } catch (e) {
    err.textContent = 'Error de conexión: ' + e.message;
    err.classList.add('show');
    setBtn(btn, false);
    return;
  }

  if (!result.ok || result.data?.error) {
    recordAttempt();
    const newWait = checkLockout();
    const supabaseMsg = result.data?.error_description || result.data?.msg || result.data?.message || '';
    console.error('Auth error:', result.status, result.data);

    let errMsg;
    if (supabaseMsg.toLowerCase().includes('not confirmed'))
      errMsg = 'Email no verificado — desactiva "Email confirmations" en Supabase → Auth → Settings.';
    else if (supabaseMsg.toLowerCase().includes('invalid login') || supabaseMsg.toLowerCase().includes('invalid credentials'))
      errMsg = 'Email o contraseña incorrectos.';
    else if (supabaseMsg)
      errMsg = supabaseMsg; // mostrar el error real de Supabase
    else
      errMsg = `Error ${result.status} — abre la consola del navegador (F12) para más detalles.`;

    if (newWait) errMsg += ` (bloqueado ${newWait}s)`;
    err.textContent = errMsg;
    err.classList.add('show');
    setBtn(btn, false);
    return;
  }

  clearAttempts();
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    access_token:  result.data.access_token,
    refresh_token: result.data.refresh_token,
    expires_at:    Math.floor(Date.now() / 1000) + (result.data.expires_in || 3600),
    email:         result.data.user.email,
    user:          result.data.user
  }));
  // Recargar para que ROLE se re-evalúe con la sesión correcta
  location.reload();
}

async function doLogout() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    if (s.access_token) {
      await supabaseAuth('/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${s.access_token}` }
      });
    }
  } catch {}
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

/* ── APP ── */
function _applyRoleUI() {
  // Sección JSON (importar/exportar catálogo) — solo superadmin
  if (!can.importJSON) {
    document.getElementById('tools-json-section')?.style.setProperty('display', 'none');
  }
  // Operador: ocultar Reportes, Actividad y Settings
  if (ROLE === 'operador') {
    ['stats.html','activity.html','settings.html'].forEach(href => {
      document.querySelectorAll(`a[href="${href}"]`).forEach(a => a.style.setProperty('display','none'));
    });
  }
  // Encargado: ver Reportes, NO Actividad ni Settings
  if (ROLE === 'encargado') {
    ['activity.html','settings.html'].forEach(href => {
      document.querySelectorAll(`a[href="${href}"]`).forEach(a => a.style.setProperty('display','none'));
    });
  }
  // Dueña: no ve Settings (Actividad sí puede ver)
  if (ROLE === 'duena') {
    document.querySelectorAll('a[href="settings.html"]').forEach(a => a.style.setProperty('display','none'));
  }
  // Settings — solo superadmin
  if (!can.manageSettings) {
    document.querySelectorAll('a[href="settings.html"]').forEach(a => a.style.setProperty('display', 'none'));
  }
  // Tracker — visible para todos los admins autenticados
  const btnTracker = document.getElementById('btn-tracker');
  if (btnTracker) btnTracker.style.removeProperty('display');
  // Botones de agregar producto — solo si puede
  if (!can.addProduct) {
    document.querySelectorAll('[onclick="openForm()"]').forEach(b => b.style.setProperty('display', 'none'));
    document.querySelector('.fab-add')?.style.setProperty('display', 'none');
    document.getElementById('fab-kit')?.style.setProperty('display', 'none');
    document.getElementById('btn-add-kit')?.style.setProperty('display', 'none');
  }
  // Botón "Eliminar ✕" en bulk bar — solo superadmin/encargado
  if (!can.bulkDelete) {
    document.querySelector('.bulk-bar .btn-red')?.style.setProperty('display', 'none');
  }
  // Botón "Publicar / Ocultar" en bulk bar — superadmin y duena
  if (!can.publishProduct) {
    document.getElementById('bulk-publish-btn')?.style.setProperty('display', 'none');
  }
  // Checkbox de publicar — solo superadmin
  if (!can.publishProduct) {
    const pubRow = document.getElementById('f-published')?.closest('label') || document.getElementById('f-published')?.parentElement;
    if (pubRow) {
      pubRow.title = 'Solo el administrador puede publicar en el sitio web';
      pubRow.style.opacity = '0.45';
      pubRow.style.pointerEvents = 'none';
    }
  }
  // Botón Captura rápida — visible si puede agregar
  if (can.addProduct) {
    document.getElementById('btn-capture-mode')?.style.removeProperty('display');
  }
  // Botón Carga masiva — solo superadmin y si está activado en config
  if (ROLE === 'superadmin' && _showBatch) {
    document.getElementById('btn-batch-upload')?.style.removeProperty('display');
  }
}

function _refreshCreatorFilter() {
  const sel = document.getElementById('creator-filter');
  if (!sel) return;
  if (!_showCreator || ROLE !== 'superadmin') {
    sel.style.display = 'none';
    sel.value = 'all';
    return;
  }
  // Poblar con creadores únicos presentes en el catálogo actual
  const emails = [...new Set(products.map(p => p.createdBy).filter(Boolean))].sort();
  const cur = sel.value;
  sel.innerHTML = `<option value="all">👤 Todos</option>` +
    emails.map(e => `<option value="${e}">${_userNames[e] || e.split('@')[0]}</option>`).join('') +
    (products.some(p => !p.createdBy) ? `<option value="__none__">Sin registro</option>` : '');
  sel.style.display = '';
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}


function _getUserDisplay() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const meta = s?.user?.user_metadata || {};
    const name = meta.full_name || meta.name || s?.user?.email?.split('@')[0] || 'Usuario';
    return { name, initial: name[0].toUpperCase() };
  } catch { return { name: '', initial: '?' }; }
}

async function showApp() {
  if (!await requireAuth()) return;
  TE.track('module_inventario');
  try {
    const { name, initial } = _getUserDisplay();
    const avatarEl = document.getElementById('user-avatar');
    const nameEl   = document.getElementById('user-name');
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl)   nameEl.textContent   = name;
  } catch {}
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  _applyRoleUI();

  // Mostrar skeleton mientras cargan datos
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:48px;color:var(--muted)">
    <div style="display:inline-block;width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;margin-bottom:12px"></div>
    <br>Cargando catálogo…
  </td></tr>`;

  await loadCategories();
  await Promise.all([loadAppConfig(), loadFlagged(), loadRecentlyEdited(), loadApartadosMap()]);
  _loadNameMap();
  await loadProductsFromSupabase();
  loadSalesCounts(); // no-blocking — actualiza chips cuando termina
  _syncFlagFilter();
  renderStats();
  _refreshCreatorFilter();
  setAdminView(currentAdminView);
  initRealtime();
  if (location.hash === '#dup-review') {
    history.replaceState(null, '', location.pathname);
    setTimeout(openDupReview, 500);
  }
}

/* ── LOAD PRODUCTS ── */
function mapProduct(p) {
  return {
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
    originalPrice: p.original_price,
    barcode: p.barcode || null,
    stock: p.stock ?? 0,
    cost: p.cost ?? null,
    isPublished: p.is_published ?? true,
    kitItems: p.kit_items || null,
    images: p.images || null,
    isApartado: p.is_apartado || false,
    createdBy: p.created_by || null,
    createdAt: p.created_at || null
  };
}

async function loadSalesCounts() {
  try {
    const r = await supabaseApi('sales?select=items&type=eq.venta&limit=5000');
    if (!r.ok || !Array.isArray(r.data)) return;
    const map = new Map();
    r.data.forEach(sale => {
      (sale.items || []).forEach(item => {
        if (item.id) map.set(item.id, (map.get(item.id) || 0) + (item.qty || 1));
      });
    });
    _salesCountMap = map;
    // Persiste en config para que app.js pueda ordenar en la tienda
    const obj = {};
    map.forEach((qty, id) => { obj[id] = qty; });
    supabaseApi('config', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: 'sales_counts', value: JSON.stringify(obj) })
    });
    renderStats();
    renderTable();
  } catch {}
}

async function loadProductsFromSupabase() {
  const result = await supabaseApi('products?select=*&order=position.asc');
  const data = result.data;
  if (result.ok && Array.isArray(data) && data.length) {
    products = data.map(mapProduct);
    return;
  }
  products = [];
}

/* ── STATS ── */
function renderStats() {
  // Helper: define borrador igual que getFilteredProducts para que contador = lo que se ve al filtrar
  const _ib = p => !p.kitItems?.length && !p.isPublished && (!p.price || p.price === 0);

  const nBorradores = products.filter(_ib).length;
  const visible     = p => !_ib(p) && !p.kitItems?.length; // no borrador, no kit
  const total       = products.filter(visible).length;
  const conStock    = products.filter(p => visible(p) && p.stock > 0 && !p.outOfStock).length;
  const sinStock    = products.filter(p => visible(p) && (p.stock === 0 || p.outOfStock)).length;
  const ultimaPieza = products.filter(p => visible(p) && p.stock === 1 && !p.outOfStock).length;
  const sinPublicar = products.filter(p => visible(p) && p.isPublished === false).length;
  const nKits       = products.filter(p => !!p.kitItems?.length).length;
  const sinCodigo   = products.filter(p => visible(p) && !p.barcode).length;
  const sinCateg    = products.filter(p => visible(p) && p.category === 'por_revisar').length;
  const nFlag = _flagged.filter(f => {
    const p = products.find(x => x.id === f.id);
    return p && !_ib(p);
  }).length;
  const anyFilter   = _statFilter || _showOnlyFlagged;

  const chip = (key, icon, count, label, activeColor, activeTextColor='#fff') => {
    const isActive = key === 'revisar' ? _showOnlyFlagged : _statFilter === key;
    const isTodos  = key === 'todos';
    const isFilter = key !== 'todos-info';
    const activeStyle = isActive ? `background:${activeColor};border-color:${activeColor};color:${activeTextColor}` : '';
    return `<button class="stat-chip${isFilter ? ' stat-chip-filter' : ''}${isActive ? ' sc-active' : ''}"
      ${isFilter ? `onclick="toggleStatFilter('${key}')"` : ''}
      style="${activeStyle}" title="${label}">
      <span class="sc-icon">${icon}</span>
      <span class="sc-num">${count}</span>
      <span class="sc-lbl">${label}</span>
    </button>`;
  };

  const todosActive = !anyFilter;
  const todosStyle  = todosActive ? 'background:var(--gold);border-color:var(--gold);color:#fff' : '';

  document.getElementById('stats').innerHTML =
    `<button class="stat-chip stat-chip-filter${todosActive ? ' sc-active' : ''}" onclick="toggleStatFilter('todos')" style="${todosStyle}">
       <span class="sc-icon">📦</span>
       <span class="sc-num">${total}</span>
       <span class="sc-lbl">Todos</span>
     </button>` +
    chip('con-stock',   '✅', conStock,    'Con stock',    '#059669') +
    (nBorradores > 0 ? chip('borradores', '📝', nBorradores, 'Borradores', '#6B7280', '#fff') : '') +
    (nKits > 0 ? chip('kits', '🎁', nKits, 'Kits', '#C9A462', '#fff') : '') +
    (_salesCountMap.size > 0 ? chip('vendidos', '🔥', _salesCountMap.size, 'Vendidos', '#B45309', '#fff') : '') +
    (sinStock > 0 ? chip('sin-stock', '🚫', sinStock, 'Sin stock', '#dc2626') : '') +
    (ultimaPieza > 0 ? chip('ultima-pieza','⚡', ultimaPieza, 'Última pieza', '#B45309') : '') +
    (sinPublicar  > 0 ? chip('sin-publicar','🙈', sinPublicar, 'Sin publicar', '#C2410C') : '') +
    (sinCodigo    > 0 ? chip('sin-codigo',  '🔲', sinCodigo,   'Sin código',   '#4B5563') : '') +
    (sinCateg     > 0 ? chip('sin-categ',   '⚠️', sinCateg,    'Sin categoría','#B45309') : '') +
    (nFlag        > 0 ? chip('revisar',     '🚩', nFlag,       'Por revisar',  '#dc2626') : '') +
    (() => {
      if (ROLE !== 'superadmin') return '';
      const nBase64 = products.filter(p => !_ib(p) && p.image?.startsWith('data:')).length;
      return nBase64 > 0 ? chip('imagen-base64', '🗄', nBase64, 'Imagen base64', '#7C3AED') : '';
    })() +
    (() => {
      if (!can.publishProduct) return '';
      const sinPrecio = products.filter(p => !_ib(p) && (!p.price || p.price === 0));
      if (!sinPrecio.length) return '';
      const dismissed = sessionStorage.getItem('te_no_price_dismissed') === 'true';
      if (!dismissed) return '';
      return `<button class="stat-chip stat-chip-filter" onclick="showNoPriceAlert()" style="" title="Ver productos sin precio">
        <span class="sc-icon">💲</span>
        <span class="sc-num">${sinPrecio.length}</span>
        <span class="sc-lbl">Sin precio</span>
      </button>`;
    })();

  // Alerta de productos sin precio — solo visible para superadmin
  if (can.publishProduct) {
    const sinPrecio = products.filter(p => !_ib(p) && (!p.price || p.price === 0));
    const alertEl   = document.getElementById('no-price-alert');
    const alertTxt  = document.getElementById('no-price-alert-text');
    if (alertEl && alertTxt) {
      if (sinPrecio.length > 0) {
        alertTxt.textContent = `${sinPrecio.length} producto${sinPrecio.length > 1 ? 's' : ''} sin precio — pendiente de revisión`;
        const dismissed = sessionStorage.getItem('te_no_price_dismissed') === 'true';
        alertEl.style.display = dismissed ? 'none' : 'flex';
      } else {
        alertEl.style.display = 'none';
        sessionStorage.removeItem('te_no_price_dismissed');
      }
    }
  }
}

function dismissNoPriceAlert() {
  sessionStorage.setItem('te_no_price_dismissed', 'true');
  document.getElementById('no-price-alert').style.display = 'none';
  renderStats(); // actualiza chips para mostrar el chip 💲
}

function showNoPriceAlert() {
  sessionStorage.removeItem('te_no_price_dismissed');
  const alertEl = document.getElementById('no-price-alert');
  if (alertEl) {
    alertEl.style.display = 'flex';
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  renderStats(); // quita el chip 💲
}

function filterNoPriceProducts() {
  const catFilter   = document.getElementById('cat-filter');
  const searchInput = document.getElementById('search-input');
  if (catFilter)   catFilter.value   = 'all';
  if (searchInput) searchInput.value = '';
  if (_showOnlyFlagged) { _showOnlyFlagged = false; localStorage.setItem('te_flag_filter','0'); }
  _statFilter = 'sin-precio';
  _adminPage  = 1;
  renderStats();
  renderTable();
}

// Refrescar ingresos/ventas del día cuando el usuario vuelve a esta pestaña
// (por ejemplo, tras cancelar ventas de prueba en el POS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isAuthenticated()) renderStats();
});


/* ── APARTADOS ACTIVOS — mapa productId → unidades reservadas ── */
let _apartadosMap = {}; // { productId: totalUnits }

async function loadApartadosMap() {
  const r = await supabaseApi('sales?type=eq.apartado&select=items,total,paid_amount');
  if (!r.ok || !Array.isArray(r.data)) return;
  const map = {};
  r.data.forEach(sale => {
    // Solo apartados sin liquidar (paid_amount < total)
    if (parseFloat(sale.paid_amount || 0) >= parseFloat(sale.total || 0)) return;
    (sale.items || []).forEach(item => {
      if (item.id) map[item.id] = (map[item.id] || 0) + (item.qty || 1);
    });
  });
  _apartadosMap = map;
}

/* ── RECENTLY EDITED — centralizado en Supabase ── */
let _editedList = []; // cache local: [productId, ...] ordenado por edited_at desc

async function loadRecentlyEdited() {
  const r = await supabaseApi('recently_edited?select=product_id&order=edited_at.desc&limit=60');
  if (r.ok && Array.isArray(r.data)) {
    _editedList = r.data.map(x => x.product_id);
    // Fallback: migrar datos locales si la tabla está vacía
    if (!_editedList.length) {
      const local = JSON.parse(localStorage.getItem('te_recently_edited') || '[]');
      if (local.length) _editedList = local;
    }
  }
}

function _trackEdit(id) {
  // Actualiza cache local inmediatamente
  _editedList = [id, ..._editedList.filter(x => x !== id)].slice(0, 60);
  // Sincroniza con Supabase en background
  const email = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY))?.user?.email || ''; } catch { return ''; } })();
  supabaseApi('recently_edited', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ product_id: id, user_email: email, edited_at: new Date().toISOString() })
  }).catch(() => {});
}

function _editedOrder() {
  return _editedList;
}

/* ── TABLE ── */
const isMobile = () => window.matchMedia('(max-width:1024px)').matches;

/* ── LONG PRESS — modo selección múltiple ── */
// El usuario toca y sostiene 520ms sin moverse → entra en modo selección
const _LP_DELAY  = 520;
const _lpTimers  = {};
let   _lpFired   = false; // evita que el click posterior abra QV tras un long press

function _lpStart(e, id) {
  if (_catEditActive) return;
  if (e.target.closest('button,input,select,a,.stock-chip,.cat-label-inline,.drag-handle')) return;
  _lpFired = false;
  _lpTimers[id] = setTimeout(() => {
    delete _lpTimers[id];
    _lpFired = true;
    if (navigator.vibrate) navigator.vibrate(30);
    // Seleccionar esta card y entrar en modo selección
    const cb = document.querySelector(`[data-id="${id}"] .row-check`);
    if (cb) cb.checked = true;
    toggleRowSelect(id, true);
  }, _LP_DELAY);
}

function _lpEnd(id) {
  clearTimeout(_lpTimers[id]);
  delete _lpTimers[id];
}

function _lpMove(id) {
  // Movimiento = no era intención de long press
  clearTimeout(_lpTimers[id]);
  delete _lpTimers[id];
}

// Decide qué hace un tap en una card según el contexto
function _cardTap(e, id) {
  if (_lpFired) return; // ya fue un long press, ignorar el click sintético
  if (_catEditActive) return;
  if (e.target.closest('button,input,select,a,.stock-chip,.cat-label-inline,.drag-handle')) return;

  if (selectedIds.size > 0) {
    // Modo selección activo → tap alterna selección de esta card
    const newVal = !selectedIds.has(id);
    const cb = document.querySelector(`[data-id="${id}"] .row-check`);
    if (cb) cb.checked = newVal;
    toggleRowSelect(id, newVal);
  } else {
    // Modo normal → abrir Quick View
    openQV(id);
  }
}

let currentAdminView = localStorage.getItem('te_admin_view') || 'list';

function setAdminView(view) {
  currentAdminView = view;
  localStorage.setItem('te_admin_view', view);
  document.getElementById('vbtn-list')?.classList.toggle('active', view === 'list');
  document.getElementById('vbtn-cards')?.classList.toggle('active', view === 'cards');
  renderTable();
}

function adminCard(p, editable = false) {
  const fallback = DEFAULT_IMG;
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const sel = selectedIds.has(p.id);
  const catColor = getCatColor(p.category);

  const priceDisplay = p.price === 0
    ? `<span class="ac-price ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Sin precio — toca para agregar">Sin precio</span>`
    : p.originalPrice
      ? `<span class="ac-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="ac-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar precio">$${p.price.toLocaleString('es-MX')}</span>`
      : `<span class="ac-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar precio">$${p.price.toLocaleString('es-MX')}</span>`;
  const priceHTML = priceDisplay;
  const oosTitle  = oos ? 'Agotado — toca para marcar disponible' : 'Disponible — toca para agotar';
  const pubTitle  = p.isPublished === false ? 'Oculto del sitio — toca para publicar' : p.outOfStock ? 'Publicado pero agotado — no aparece en el sitio' : 'Visible en sitio — toca para ocultar';
  const pubEmoji  = p.isPublished === false ? '🙈' : p.outOfStock ? '⚠️' : '🌐';
  const flagData  = _flagItem(p.id);
  const flagDotAC = flagData ? `<span class="flag-dot" title="${flagData.note ? flagData.note : 'Pendiente de revisión'}">🚩</span>` : '';
  const isSinCat  = p.category === 'por_revisar';

  return `
<div class="admin-card${sel?' card-selected':''}${(p.isApartado||_apartadosMap[p.id])&&p.stock<=1?' card-apartado':oos?' card-oos':''}${isSinCat?' card-por-revisar':''}"
     data-id="${p.id}"
     onclick="_cardTap(event,${p.id})"
     ontouchstart="_lpStart(event,${p.id})"
     ontouchend="_lpEnd(${p.id})"
     ontouchmove="_lpMove(${p.id})"
     draggable="true"
     ondragstart="_cardDragStart(event,${p.id})"
     ondragend="_cardDragEnd(event)"
     ondragover="_cardDragOver(event,${p.id})"
     ondrop="_cardDrop(event,${p.id})"
     style="cursor:pointer">
  <div class="ac-img-wrap">
    <img class="ac-img" src="${p.image}" alt="${p.name}"
         onerror="this.onerror=null;this.src='${fallback}'">
    <input type="checkbox" class="ac-check row-check"
           ${sel?'checked':''} onchange="toggleRowSelect(${p.id},this.checked)">
    ${flagDotAC}
    <div class="ac-oos-label"></div>
    <button class="ac-star toggle-featured" onclick="toggleFeatured(${p.id})"
            title="${p.featured?'Quitar destacado':'Destacar'}">
      ${p.featured?'⭐':'☆'}
    </button>
    <div class="ac-actions">
      <button class="action-btn" onclick="event.stopPropagation();openForm(${p.id})" ontouchstart="event.stopPropagation()" title="Editar">${ICON_EDIT}</button>
      <button class="action-btn btn-duplicate" onclick="event.stopPropagation();duplicateProduct(${p.id})" ontouchstart="event.stopPropagation()" title="Duplicar">${ICON_COPY}</button>
      ${can.deleteProduct ? `<button class="action-btn del" onclick="event.stopPropagation();askDelete(${p.id})" ontouchstart="event.stopPropagation()" title="Eliminar">✕</button>` : ''}
    </div>
  </div>
  <div class="ac-body">
    <div class="ac-name" title="${p.name}">${p.name}</div>
    ${flagData?.note ? `<div class="flag-note-line">🚩 "${flagData.note}"</div>` : ''}
    <div class="ac-meta">
      <span class="cat-dot" style="background:${catColor}"></span>
      ${editable
        ? `<span class="cat-label-inline${isSinCat?' cat-label-sin-cat':''}" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Clic para cambiar categoría" style="${isSinCat?'':'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'}">${isSinCat ? 'Sin categoría' : p.categoryLabel}</span>`
        : `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;color:var(--muted)">${p.categoryLabel}</span>`
      }
      ${_showCreator && ROLE === 'superadmin' && p.createdBy ? `<span class="creator-chip" title="${p.createdBy}">👤 ${_creatorName(p.createdBy)}</span>` : ''}
    </div>
    <div class="ac-price-row">${priceHTML}</div>
    <div class="ac-footer">
      <div style="display:flex;align-items:center;gap:6px">
        ${stockChip(p, editable)}
        ${(p.isApartado || _apartadosMap[p.id]) && p.stock <= 1 ? `<span class="apt-chip" title="${_apartadosMap[p.id] || ''} unidad(es) en apartado">📌 Apartado</span>` : ''}
        <button class="ac-pub-dot" onclick="togglePublished(${p.id})"
                ontouchstart="event.stopPropagation()"
                title="${pubTitle}">
          ${pubEmoji}
        </button>
      </div>
    </div>
  </div>
</div>`;
}

function _kitInfo(p) {
  if (!p.kitItems?.length) return null;
  let min = Infinity, blocker = null;
  for (const comp of p.kitItems) {
    const c = products.find(x => x.id === comp.id);
    if (!c || c.outOfStock || c.stock === 0) return { stock: 0, blocker: comp.name };
    const avail = Math.floor(c.stock / comp.qty);
    if (avail < min) { min = avail; blocker = comp.name; }
  }
  const stock = min === Infinity ? 0 : min;
  return { stock, blocker: stock === 0 ? blocker : null };
}

function stockChip(p, editable = false) {
  if (p.kitItems?.length) {
    const ki = _kitInfo(p);
    if (ki?.stock === 0) {
      const lbl = ki.blocker ? (ki.blocker.length > 14 ? ki.blocker.slice(0, 13) + '…' : ki.blocker) : '?';
      return `<span class="stock-chip stock-sold" style="cursor:default" title="Falta: ${ki.blocker ?? 'componente agotado'}">🎁 Falta: ${lbl}</span>`;
    }
    const n = ki?.stock ?? 0;
    return `<span class="stock-chip stock-ok" style="cursor:default">🎁 ${n} kit${n !== 1 ? 's' : ''}</span>`;
  }
  const cls = p.stock === 0 ? 'sold' : p.stock === 1 ? 'one' : 'ok';
  if (editable) {
    return `<span class="stock-chip stock-${cls}" onclick="editStockInline(event,${p.id},this)" ontouchstart="event.stopPropagation()" title="Clic para editar stock" style="cursor:pointer">${p.stock}</span>`;
  }
  return `<span class="stock-chip stock-${cls}" style="cursor:default">${p.stock}</span>`;
}

async function editStockInline(e, id, chipEl) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;

  const chip = chipEl || e.currentTarget || e.target.closest('.stock-chip,.qv-chip') || e.target;
  const mobile = isMobile();

  // Stepper táctil — reemplaza el chip con [−] N [+] + botón Guardar
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*';
  input.autocomplete = 'off'; input.value = p.stock;
  input.style.cssText = 'width:52px;padding:4px 6px;border:2px solid var(--gold);border-radius:8px;font-size:1.1rem;font-weight:700;text-align:center;outline:none;font-family:inherit;color:var(--charcoal)';

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button'; btnMinus.textContent = '−';
  btnMinus.style.cssText = 'width:36px;height:36px;border-radius:50%;border:2px solid var(--border);background:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-shrink:0';
  btnMinus.ontouchend = e2 => { e2.preventDefault(); input.value = Math.max(0, parseInt(input.value)||0) - 1; };
  btnMinus.onclick    = () => { input.value = Math.max(0, parseInt(input.value)||0) - 1; };

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button'; btnPlus.textContent = '+';
  btnPlus.style.cssText = btnMinus.style.cssText;
  btnPlus.ontouchend = e2 => { e2.preventDefault(); input.value = (parseInt(input.value)||0) + 1; };
  btnPlus.onclick    = () => { input.value = (parseInt(input.value)||0) + 1; };

  const btnSave = document.createElement('button');
  btnSave.type = 'button'; btnSave.textContent = '✓';
  btnSave.style.cssText = 'background:var(--gold);border:none;color:#fff;border-radius:50%;width:36px;height:36px;font-size:1rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit;flex-shrink:0;display:flex;align-items:center;justify-content:center';
  btnSave.ontouchend = e2 => { e2.preventDefault(); save(); };
  btnSave.onclick    = () => save();

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button'; btnCancel.textContent = '✕';
  btnCancel.style.cssText = 'background:none;border:1.5px solid var(--border);color:var(--muted);border-radius:50%;width:32px;height:32px;font-size:.85rem;cursor:pointer;touch-action:manipulation;font-family:inherit;flex-shrink:0;display:flex;align-items:center;justify-content:center';
  btnCancel.ontouchend = e2 => { e2.preventDefault(); saved = true; renderTable(); _qvRefresh(id); };
  btnCancel.onclick    = () => { saved = true; renderTable(); _qvRefresh(id); };

  const container = document.createElement('span');
  container.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:2px 0';
  container.append(btnMinus, input, btnPlus, btnSave, btnCancel);
  chip.replaceWith(container);

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newStock = Math.max(0, parseInt(input.value) || 0);
    if (newStock === p.stock) { renderTable(); _qvRefresh(id); _srpRefresh(id); return; }

    const patch = { stock: newStock };
    if (newStock > 0 && p.outOfStock)  patch.out_of_stock = false;
    if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true;
    if (newStock === 0) patch.is_published = false;

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    if (result.ok) {
      p.stock = newStock;
      if (patch.out_of_stock !== undefined) p.outOfStock = patch.out_of_stock;
      if (newStock === 0) p.isPublished = false;
      renderStats();
      toast(`Stock → ${newStock}${patch.out_of_stock !== undefined ? (patch.out_of_stock ? ' · Marcado agotado · Oculto del sitio' : ' · Marcado disponible') : ''}`);
    } else {
      toast('Error al actualizar stock', 'error');
    }
    renderTable(); _qvRefresh(id); _srpRefresh(id);
  };

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { saved = true; renderTable(); _qvRefresh(id); }
  });

  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
    // Click fuera del stepper → cancelar si sin cambios, guardar si hay cambios
    setTimeout(() => {
      if (saved) return;
      const dismiss = (ev) => {
        if (saved || container.contains(ev.target)) return;
        document.removeEventListener('click', dismiss, true);
        document.removeEventListener('touchend', dismiss, true);
        if (!saved) {
          if (parseInt(input.value) === p.stock) { saved = true; renderTable(); _qvRefresh(id); }
          else save();
        }
      };
      document.addEventListener('click', dismiss, true);
      document.addEventListener('touchend', dismiss, true);
    }, 300);
  }, 50);
}

let _inlineEditActive = false;

async function editPriceInlineAdmin(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!can.editProduct) { toast('Sin permiso para editar precios', 'error'); return; }
  _inlineEditActive = true;

  const trigger = e.currentTarget;
  const mobile = isMobile();

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.pattern = '[0-9]*';
  input.autocomplete = 'off';
  input.value = p.price || '';
  input.placeholder = '0';
  input.style.cssText = 'width:80px;padding:3px 7px;border:2px solid var(--gold);border-radius:6px;font-size:16px;outline:none;font-family:inherit;font-weight:700;text-align:center;color:var(--charcoal)';

  let container;
  if (mobile) {
    container = document.createElement('span');
    container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;vertical-align:middle';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = '✓';
    btn.style.cssText = 'background:var(--gold);border:none;color:#fff;border-radius:6px;padding:4px 7px;font-size:.82rem;cursor:pointer;font-family:inherit;line-height:1;touch-action:manipulation';
    btn.ontouchend = ev => { ev.preventDefault(); save(); };
    btn.onclick = () => save();
    container.appendChild(input); container.appendChild(btn);
    trigger.replaceWith(container);
  } else {
    trigger.replaceWith(input);
  }

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    _inlineEditActive = false;
    const newPrice = parseFloat(input.value);
    if (isNaN(newPrice) || newPrice < 0) { renderTable(); _qvRefresh(id); return; }
    if (newPrice === p.price) { renderTable(); _qvRefresh(id); return; }

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify({ price: newPrice })
    });
    if (result.ok) {
      p.price = newPrice;
      renderStats();
      toast(`Precio actualizado → $${newPrice.toLocaleString('es-MX')}`);
    } else {
      toast('Error al actualizar precio', 'error');
    }
    renderTable(); _qvRefresh(id);
  };

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { saved = true; _inlineEditActive = false; renderTable(); _qvRefresh(id); }
  });
  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
    if (!mobile) setTimeout(() => { if (!saved) input.addEventListener('blur', save); }, 500);
  }, 50);
}

// getCatColor() reemplaza CAT_COLORS — usa el array dinámico de categorías

function publishedToggle(p) {
  if (p.isPublished === false) {
    return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-hidden" title="Tap para publicar en sitio web">🙈 Oculto</button>`;
  }
  if (p.outOfStock) {
    return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-agotado" title="Publicado pero agotado — no aparece en el sitio web">⚠️ Agotado</button>`;
  }
  return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-visible" title="Tap para ocultar del sitio web">🌐 Web</button>`;
}

async function togglePublished(id) {
  if (!can.publishProduct) { toast('Solo el administrador puede publicar o ocultar productos', 'error'); return; }
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = p.isPublished === false ? true : false;
  if (newVal && p.price === 0) { toast('Precio $0 — ajusta el precio antes de publicar en la web', 'warn'); return; }
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_published: newVal })
  });
  if (!result.ok) { toast('Error al actualizar visibilidad', 'error'); return; }
  p.isPublished = newVal;
  renderTable();
  renderStats();
  toast(newVal ? '🌐 Publicado en sitio web' : '🙈 Oculto del sitio web', 'success');
}

let _catEditActive = false;

let _bcpInlineId = null;

function editCategoryInline(e, id) {
  e.stopPropagation();
  e.stopImmediatePropagation();
  _bcpFormMode = false;
  _bcpInlineId = id;
  const p = products.find(x => x.id === id);
  document.getElementById('bcp-sub').textContent = p ? p.name : 'Cambiar categoría';
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function desktopRow(p) {
  const fallback = DEFAULT_IMG;
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const featStar   = `<span onclick="toggleFeatured(${p.id})" class="toggle-featured" title="${p.featured ? 'Quitar destacado' : 'Destacar'}">${p.featured ? '⭐' : '☆'}</span>`;
  const catColor   = getCatColor(p.category);
  const catDot     = `<span class="cat-dot" style="background:${catColor}"></span>`;
  const flagDataDR = _flagItem(p.id);
  const isSinCatDR = p.category === 'por_revisar';
  const flagDotRow = flagDataDR ? `<span class="flag-dot-row" title="${flagDataDR.note || 'Pendiente de revisión'}">🚩</span>` : '';
  return `
<tr draggable="true" data-id="${p.id}" class="${selectedIds.has(p.id) ? 'row-selected' : ''}${isSinCatDR ? ' card-por-revisar' : ''}"
    ondblclick="if(!event.target.closest('button,input,select,a,.drag-handle,.cat-label-inline'))openForm(${p.id})"
    title="Doble clic para editar">
  <td class="col-check" style="text-align:center">
    <input type="checkbox" class="row-check" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
  </td>
  <td class="col-product">
    <div style="display:flex;align-items:center;gap:10px;min-width:0">
      <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
      <img class="prod-thumb" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'" onclick="event.stopPropagation();openQV(${p.id})" style="cursor:pointer${oos ? ';opacity:.5;filter:grayscale(.5)' : ''}" title="Ver detalle rápido">
      <div style="min-width:0;flex:1">
        <div class="prod-name" title="${p.name}">${p.name}</div>
        ${flagDataDR?.note ? `<div class="flag-note-line">🚩 "${flagDataDR.note}"</div>` : ''}
        <div class="prod-meta">
          ${catDot}
          <span class="prod-meta-text"><span class="cat-label-inline${isSinCatDR ? ' cat-label-sin-cat' : ''}" onclick="editCategoryInline(event,${p.id})" title="Clic para cambiar categoría">${isSinCatDR ? 'Sin categoría' : p.categoryLabel}</span> · #${p.id}${_showCreator && ROLE === 'superadmin' && p.createdBy ? ` · <span class="creator-chip" title="${p.createdBy}">👤 ${_creatorName(p.createdBy)}</span>` : ''}</span>
          ${featStar}${publishedToggle(p)}${flagDotRow}
        </div>
      </div>
    </div>
  </td>
  <td class="col-price">
    ${p.originalPrice ? `<div class="orig-price-cell">$${p.originalPrice.toLocaleString('es-MX')}</div>` : ''}
    ${p.price === 0
      ? `<div class="price-cell ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" title="Sin precio — clic para agregar" style="cursor:pointer">Sin precio</div>`
      : `<div class="price-cell ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" title="Clic para editar precio" style="cursor:pointer">$${p.price.toLocaleString('es-MX')}</div>`}
  </td>
  <td class="col-state">
    <div class="state-cell">
      <button onclick="toggleOutOfStock(${p.id})" class="oos-cell ${oos ? 'soldout' : 'available'}">
        ${oos ? 'Agotado' : 'Disponible'}
      </button>
      ${stockChip(p, true)}
    </div>
  </td>
  <td class="col-actions">
    <div class="actions">
      <button class="action-btn" onclick="event.stopPropagation();openForm(${p.id})" ontouchstart="event.stopPropagation()" title="Editar">${ICON_EDIT}</button>
      <button class="action-btn" onclick="event.stopPropagation();duplicateProduct(${p.id})" ontouchstart="event.stopPropagation()" title="Duplicar">${ICON_COPY}</button>
      ${can.deleteProduct ? `<button class="action-btn del" onclick="event.stopPropagation();askDelete(${p.id})" ontouchstart="event.stopPropagation()" title="Eliminar">✕</button>` : ''}
    </div>
  </td>
</tr>`;
}

function mobileCard(p) {
  const fallback = DEFAULT_IMG;
  const sel = selectedIds.has(p.id);
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const catColor = getCatColor(p.category);
  const pubTitle  = p.isPublished === false ? 'Oculto del sitio — toca para publicar' : p.outOfStock ? 'Publicado pero agotado — no aparece en el sitio' : 'Visible en sitio — toca para ocultar';
  const pubEmoji  = p.isPublished === false ? '🙈' : p.outOfStock ? '⚠️' : '🌐';
  const flagDataMC = _flagItem(p.id);
  const isSinCatMC = p.category === 'por_revisar';

  const priceHTML = p.price === 0
    ? `<span class="mpc-price ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Sin precio">Sin precio</span>`
    : p.originalPrice
      ? `<span class="mpc-price-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="mpc-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()">$${p.price.toLocaleString('es-MX')}</span>`
      : `<span class="mpc-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()">$${p.price.toLocaleString('es-MX')}</span>`;

  const stockInfo = `<span class="mpc-stock-inline">${stockChip(p, true)}</span>`;


  return `
<tr class="mpc-row${sel ? ' row-selected' : ''}${isSinCatMC ? ' card-por-revisar' : ''}" data-id="${p.id}">
  <td>
    <div class="mpc${oos ? ' mpc-oos' : ''}">
      <div class="mpc-top"
           onclick="_cardTap(event,${p.id})"
           ontouchstart="_lpStart(event,${p.id})"
           ontouchend="_lpEnd(${p.id})"
           ontouchmove="_lpMove(${p.id})"
           style="cursor:pointer">
        <div class="mpc-img-wrap">
          <img class="mpc-img" src="${p.image}" alt="${p.name}"
               onerror="this.onerror=null;this.src='${fallback}'"
               ${oos ? 'style="opacity:.5;filter:grayscale(.4)"' : ''}>
          <input type="checkbox" class="row-check mpc-check-over"
                 ${sel ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
          <button class="mpc-star${p.featured ? ' feat-active' : ''}"
                  onclick="event.stopPropagation();toggleFeatured(${p.id})"
                  ontouchstart="event.stopPropagation()"
                  title="${p.featured ? 'Quitar destacado' : 'Destacar'}">
            ${p.featured ? '⭐' : '☆'}
          </button>
        </div>
        <div class="mpc-info">
          <div class="mpc-name">${p.name}${flagDataMC ? ' <span class="flag-dot-row" title="'+(flagDataMC.note||'Pendiente de revisión')+'">🚩</span>' : ''}</div>
          ${flagDataMC?.note ? `<div class="flag-note-line">🚩 "${flagDataMC.note}"</div>` : ''}
          <div class="mpc-cat-tag">
            <span class="cat-dot" style="background:${catColor}"></span>
            <span class="${isSinCatMC ? 'cat-label-sin-cat' : ''}" style="font-size:.72rem;color:${isSinCatMC ? '' : 'var(--muted)'};font-weight:400">${isSinCatMC ? 'Sin categoría' : p.categoryLabel}</span>
            ${_showCreator && ROLE === 'superadmin' && p.createdBy ? `<span class="creator-chip" title="${p.createdBy}">👤 ${_creatorName(p.createdBy)}</span>` : ''}
          </div>
          <div class="mpc-price-row">
            ${priceHTML}${stockInfo}
            ${(p.isApartado || _apartadosMap[p.id]) && p.stock <= 1 ? `<span class="apt-chip">📌 Apartado</span>` : ''}
            <button class="ac-pub-dot"
                    onclick="togglePublished(${p.id})"
                    ontouchstart="event.stopPropagation()"
                    title="${pubTitle}">
              ${pubEmoji}
            </button>
          </div>
        </div>
        <div class="mpc-top-actions">
          <button class="mpc-icon-btn" onclick="openForm(${p.id})" title="Editar">${ICON_EDIT}</button>
          <button class="mpc-icon-btn" onclick="duplicateProduct(${p.id})" title="Duplicar">${ICON_COPY}</button>
          ${can.deleteProduct ? `<button class="mpc-icon-btn del-btn" onclick="askDelete(${p.id})" title="Eliminar">✕</button>` : ''}
        </div>
      </div>
    </div>
  </td>
</tr>`;
}

function renderTable() {
  const filtered  = getFilteredProducts();
  const mobile    = isMobile();
  // En mobile, "cards" también activa la vista de grid (2 columnas con adminCard)
  const useCards  = currentAdminView === 'cards';

  const countEl = document.getElementById('prod-count');
  if (countEl) {
    countEl.style.display = products.length === 0 ? 'none' : '';
    if (products.length > 0) {
      countEl.textContent = filtered.length === products.length
        ? `${products.length} producto${products.length !== 1 ? 's' : ''}`
        : `${filtered.length} de ${products.length}`;
    }
  }

  const tableEl  = document.getElementById('products-table-el');
  const cardGrid = document.getElementById('products-card-grid');
  if (tableEl)  tableEl.style.display  = useCards ? 'none' : '';
  if (cardGrid) cardGrid.style.display = useCards ? '' : 'none';

  if (!filtered.length) {
    const isFiltered = (document.getElementById('search-input')?.value || '') ||
                       (document.getElementById('cat-filter')?.value !== 'all');
    const isFlagOnly = _showOnlyFlagged;
    const emptyHTML = `<div class="empty-state">
      <div class="es-icon">${isFlagOnly ? '🚩' : isFiltered ? '🔍' : '📦'}</div>
      <p>${isFlagOnly ? '¡Todo revisado! No hay productos pendientes.' : isFiltered ? 'Ningún producto coincide con el filtro.' : 'El catálogo está vacío.'}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${isFlagOnly ? `<button class="btn btn-gold btn-sm" onclick="toggleFlagFilter()">Ver todos los productos</button>` : ''}
        ${!isFlagOnly && isFiltered ? `<button class="btn btn-outline btn-sm" onclick="clearAdminFilters()">✕ Limpiar filtros</button>` : ''}
        ${!isFlagOnly && !isFiltered ? `<button class="btn btn-gold btn-sm" onclick="openForm()">+ Agregar primer producto</button>` : ''}
      </div>
    </div>`;
    if (useCards && cardGrid) { cardGrid.innerHTML = emptyHTML; }
    else {
      const tbody = document.getElementById('products-table');
      if (tbody) tbody.innerHTML = `<tr><td colspan="5">${emptyHTML}</td></tr>`;
    }
    updateBulkBar();
    if (!document.getElementById('qv-overlay')?.classList.contains('open')) _updateActiveFiltersBar();
    return;
  }

  if (!document.getElementById('qv-overlay')?.classList.contains('open')) _updateActiveFiltersBar();

  const visible  = filtered.slice(0, _adminPage * ADMIN_PAGE_SIZE);
  const hasMore  = visible.length < filtered.length;
  const moreHTML = hasMore
    ? `<div id="load-more-wrap" style="padding:16px;text-align:center">
        <button class="btn btn-outline btn-sm" onclick="_loadMoreAdmin()">
          Ver ${Math.min(ADMIN_PAGE_SIZE, filtered.length - visible.length)} más de ${filtered.length - visible.length}
        </button>
       </div>`
    : '';

  if (useCards && cardGrid) {
    cardGrid.innerHTML = visible.map(p => adminCard(p, true)).join('') + moreHTML;
    updateBulkBar();
    return;
  }

  // Vista lista: mobile → mpc cards, desktop → tabla
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = visible.map(p => mobile ? mobileCard(p) : desktopRow(p)).join('') +
    (hasMore ? `<tr><td colspan="5">${moreHTML}</td></tr>` : '');

  updateSelectAllCheckbox();
  if (!mobile) initDragDrop();
}

function _loadMoreAdmin() {
  const firstNewIndex = _adminPage * ADMIN_PAGE_SIZE;
  _adminPage++;
  renderTable();

  const useCards = localStorage.getItem('te_admin_view') !== 'list';
  const cardGrid = document.getElementById('card-grid');
  if (useCards && cardGrid) {
    cardGrid.querySelectorAll('.admin-card')[firstNewIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    const tbody = document.getElementById('products-table');
    tbody?.querySelectorAll('tr')[firstNewIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ── SELECTION ── */
function toggleRowSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  const row = document.querySelector(`#products-table tr[data-id="${id}"]`);
  if (row) row.classList.toggle('row-selected', checked);
  // Clase selection-active en el grid de cards — revela los checkboxes
  document.getElementById('products-card-grid')
    ?.classList.toggle('selection-active', selectedIds.size > 0);
  updateBulkBar();
  updateSelectAllCheckbox();
}

function toggleSelectAll() {
  const filtered = getFilteredProducts();
  const allChecked = document.getElementById('select-all').checked;
  if (allChecked) filtered.forEach(p => selectedIds.add(p.id));
  else filtered.forEach(p => selectedIds.delete(p.id));

  document.querySelectorAll('#products-table .row-check').forEach(cb => {
    const id = parseInt(cb.closest('tr').dataset.id);
    cb.checked = selectedIds.has(id);
    cb.closest('tr').classList.toggle('row-selected', selectedIds.has(id));
  });
  updateBulkBar();
}

function clearBulkSelection() {
  selectedIds.clear();
  document.getElementById('products-card-grid')?.classList.remove('selection-active');
  renderTable();
  updateBulkBar();
}

function selectAllVisible() {
  const visible = getFilteredProducts();
  visible.forEach(p => selectedIds.add(p.id));
  document.getElementById('products-card-grid')?.classList.add('selection-active');
  renderTable();
  updateBulkBar();
  toast(`${visible.length} productos seleccionados`, '');
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-count');
  const compareBtn = document.getElementById('bulk-compare-btn');
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}`;
    if (compareBtn) compareBtn.style.display = selectedIds.size === 2 ? '' : 'none';
  } else {
    bar.style.display = 'none';
  }
}

function updateSelectAllCheckbox() {
  const filtered = getFilteredProducts();
  const checkbox = document.getElementById('select-all');
  if (!checkbox || !filtered.length) return;
  const allSelected = filtered.every(p => selectedIds.has(p.id));
  const someSelected = filtered.some(p => selectedIds.has(p.id));
  checkbox.checked = allSelected;
  checkbox.indeterminate = !allSelected && someSelected;
}

/* ── TOGGLE FEATURED — targeted PATCH ── */
async function toggleFeatured(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = !p.featured;
  const btn = document.querySelector(`tr[data-id="${id}"] .toggle-featured`);
  if (btn) btn.style.opacity = '0.35';

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ featured: newVal })
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar destacado', 'error');
    return;
  }
  p.featured = newVal;
  renderTable();
  renderStats();
  toast(newVal ? 'Marcado como destacado ⭐' : 'Quitado de destacados');
}

/* ── TOGGLE OUT OF STOCK — targeted PATCH ── */
async function toggleOutOfStock(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = !p.outOfStock;
  const btn = document.querySelector(`tr[data-id="${id}"] .oos-cell`);
  if (btn) btn.style.opacity = '0.35';

  // Al marcar disponible con stock=0 → asignar 1 unidad automáticamente
  const patch = { out_of_stock: newVal };
  if (!newVal && p.stock === 0) patch.stock = 1;

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar estado de stock', 'error');
    return;
  }
  p.outOfStock = newVal;
  if (patch.stock !== undefined) p.stock = patch.stock;
  renderTable();
  renderStats();
  const msg = newVal ? 'Marcado como agotado'
    : patch.stock ? 'Disponible · stock ajustado a 1'
    : 'Marcado como disponible';
  toast(msg);
}

/* ── DUPLICATE — POST single product ── */
async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const maxId = products.reduce((m, x) => Math.max(m, x.id), 0);
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, outOfStock: false, isPublished: false, position: products.length };
  products.push(copy);

  if (getSupabaseUrl()) {
    const result = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: copy.id, name: copy.name, category: copy.category,
        category_label: copy.categoryLabel, price: copy.price,
        description: copy.description, image: copy.image,
        badge: copy.badge, badge_type: copy.badgeType,
        featured: copy.featured, out_of_stock: false, is_published: false,
        original_price: copy.originalPrice, position: copy.position,
        barcode: null, stock: copy.stock ?? 0, cost: copy.cost ?? null,
        kit_items: copy.kitItems ?? null,
        images: copy.images ?? null
      })
    });
    if (!result.ok) {
      products.pop();
      toast('Error al duplicar en Supabase', 'error');
      return;
    }
  }

  renderTable();
  renderStats();
  if (!can.deleteProduct) {
    // Operador: undo para deshacer el duplicado accidental (7 segundos)
    toastUndo(`"${truncName(copy.name)}" duplicado`, async () => {
      const r = await supabaseApi(`products?id=eq.${copy.id}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      if (r.ok) {
        products = products.filter(p => p.id !== copy.id);
        renderTable();
        renderStats();
        toast('Duplicado deshecho ✓', 'success');
      }
    });
  } else {
    toastAction('Producto duplicado', 'Editar →', () => openForm(copy.id));
  }
}

/* ── DRAG & DROP REORDER ── */
function initDragDrop() {
  const rows = document.querySelectorAll('#products-table tr[data-id]');
  rows.forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = parseInt(row.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      if (currentSort !== 'position') {
        currentSort = 'position';
        const sortSel = document.getElementById('sort-select');
        if (sortSel) sortSel.value = 'position';
      }
      if (selectedIds.has(dragSrcId) && selectedIds.size > 1) {
        _startMultiDrag(e);
      } else {
        _multiDrag = false;
        row.classList.add('dragging');
      }
    });
    row.addEventListener('dragend', () => {
      _multiDrag = false;
      document.querySelectorAll('tr.dragging,.admin-card.card-dragging').forEach(el =>
        el.classList.remove('dragging','card-dragging'));
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r =>
        r.classList.remove('drop-above','drop-below'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const tid = parseInt(row.dataset.id);
      if (tid === dragSrcId || selectedIds.has(tid) && _multiDrag) return;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r =>
        r.classList.remove('drop-above','drop-below'));
      row.classList.add(e.clientY < mid ? 'drop-above' : 'drop-below');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = parseInt(row.dataset.id);
      if (targetId === dragSrcId) return;
      const isAbove = row.classList.contains('drop-above');
      if (_multiDrag) {
        _doMultiDrop(targetId, isAbove);
      } else {
        const srcIdx = products.findIndex(p => p.id === dragSrcId);
        const tgtIdx = products.findIndex(p => p.id === targetId);
        const [item] = products.splice(srcIdx, 1);
        const insertAt = isAbove ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx) : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
        products.splice(insertAt, 0, item);
      }
      renderTable();
      save().then(ok => toast(ok ? 'Orden guardado ✓' : 'Error al guardar orden', ok ? '' : 'error'));
    });
  });
}

/* ── DRAG & DROP CARDS ── */
function _cardDragStart(e, id) {
  dragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  if (currentSort !== 'position') {
    currentSort = 'position';
    const sortSel = document.getElementById('sort-select');
    if (sortSel) sortSel.value = 'position';
  }
  if (selectedIds.has(id) && selectedIds.size > 1) {
    _startMultiDrag(e);
  } else {
    _multiDrag = false;
    setTimeout(() => e.target.closest('.admin-card')?.classList.add('card-dragging'), 0);
  }
}

function _cardDragEnd(e) {
  _multiDrag = false;
  document.querySelectorAll('tr.dragging,.admin-card.card-dragging').forEach(el =>
    el.classList.remove('dragging','card-dragging'));
  document.querySelectorAll('.card-drop-before,.card-drop-after').forEach(c =>
    c.classList.remove('card-drop-before','card-drop-after'));
}

function _cardDragOver(e, id) {
  e.preventDefault();
  if (id === dragSrcId || (_multiDrag && selectedIds.has(id))) return;
  document.querySelectorAll('.card-drop-before,.card-drop-after').forEach(c =>
    c.classList.remove('card-drop-before','card-drop-after'));
  const card = e.currentTarget;
  const mid = card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2;
  card.classList.add(e.clientX < mid ? 'card-drop-before' : 'card-drop-after');
}

function _cardDrop(e, targetId) {
  e.preventDefault();
  if (targetId === dragSrcId) return;
  const card = e.currentTarget;
  const isBefore = card.classList.contains('card-drop-before');
  card.classList.remove('card-drop-before','card-drop-after');
  if (_multiDrag) {
    _doMultiDrop(targetId, isBefore);
  } else {
    const srcIdx = products.findIndex(p => p.id === dragSrcId);
    const tgtIdx = products.findIndex(p => p.id === targetId);
    const [item] = products.splice(srcIdx, 1);
    const insertAt = isBefore
      ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx)
      : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
    products.splice(insertAt, 0, item);
  }
  renderTable();
  save().then(ok => toast(ok ? 'Orden guardado ✓' : 'Error al guardar orden', ok ? '' : 'error'));
}

/* ── BADGE DATALIST ── */
function populateBadgeList() {
  const datalist = document.getElementById('badge-options');
  if (!datalist) return;
  const defaults = ['Más vendido', 'Nuevo', 'Oferta', 'Natura', 'Favorito', 'Temporada', 'Exclusivo', 'Limitado'];
  const fromProducts = products.filter(p => p.badge).map(p => p.badge);
  const all = [...new Set([...defaults, ...fromProducts])];
  datalist.innerHTML = all.map(b => `<option value="${b}">`).join('');
}

/* ── CONFIG GLOBAL (Supabase — disponible en todos los dispositivos) ── */
let groqApiKey   = null;
let driveEp      = null;
let driveSecret  = null;
let _showCreator = false;
let _showBatch   = false;
let _showRecv    = false;
let _userNames   = {};  // { "email@x.com": "Nombre visible" }

function _creatorName(email) {
  if (!email) return '';
  const name = _userNames[email] || email.split('@')[0];
  return name.charAt(0).toUpperCase();
}

async function loadAppConfig() {
  const r = await supabaseApi('config?id=in.(groq_key,drive_ep,drive_secret,wa_float,captura_rapida,dismissed_dups,show_creator,show_batch,show_recv,user_names)&select=id,value');
  if (r.ok && r.data) {
    r.data.forEach(row => {
      if (row.id === 'groq_key')     groqApiKey  = row.value || null;
      if (row.id === 'drive_ep')     driveEp     = row.value || null;
      if (row.id === 'drive_secret') driveSecret = row.value || null;
      if (row.id === 'dismissed_dups') {
        try { _dismissedDupsCache = new Set(JSON.parse(row.value || '[]')); }
        catch { _dismissedDupsCache = new Set(); }
      }
      if (row.id === 'wa_float') {
        const toggle = document.getElementById('wa-float-toggle');
        if (toggle) toggle.checked = row.value !== 'false';
      }
      if (row.id === 'captura_rapida') {
        // false solo si está explícitamente desactivado; por defecto activo
        if (row.value === 'false') {
          document.getElementById('btn-capture-mode')?.style.setProperty('display', 'none');
        }
      }
      if (row.id === 'show_creator') {
        _showCreator = row.value === 'true';
        const toggle = document.getElementById('show-creator-toggle');
        if (toggle) toggle.checked = _showCreator;
        _refreshCreatorFilter();
      }
      if (row.id === 'show_batch') {
        _showBatch = row.value === 'true';
        const btn = document.getElementById('btn-batch-upload');
        if (btn && ROLE === 'superadmin') {
          _showBatch ? btn.style.removeProperty('display') : btn.style.setProperty('display', 'none');
        }
      }
      if (row.id === 'show_recv') {
        _showRecv = row.value === 'true';
        const btn = document.getElementById('btn-recv-mode');
        if (btn) _showRecv ? btn.style.removeProperty('display') : btn.style.setProperty('display', 'none');
      }
      if (row.id === 'user_names') {
        try { _userNames = JSON.parse(row.value || '{}'); } catch { _userNames = {}; }
      }
    });
  }
  // Migración automática: si había config en localStorage la subimos a Supabase una sola vez
  const migrations = [];
  if (_dismissedDupsCache === null) {
    // dismissed_dups no existe en Supabase aún — migrar desde localStorage si hay datos
    const localDups = localStorage.getItem(_DUP_DISMISS_KEY);
    if (localDups && localDups !== '[]') {
      try {
        _dismissedDupsCache = new Set(JSON.parse(localDups));
        migrations.push(
          supabaseApi('config', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'dismissed_dups', value: localDups }) })
        );
      } catch { _dismissedDupsCache = new Set(); }
    } else {
      _dismissedDupsCache = new Set();
    }
  }
  if (!driveEp) {
    const oldEp = localStorage.getItem('te_drive_ep');
    const oldSecret = localStorage.getItem('te_drive_secret');
    if (oldEp && oldSecret) {
      driveEp = oldEp; driveSecret = oldSecret;
      migrations.push(
        supabaseApi('config', { method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id:'drive_ep',     value: oldEp}) }),
        supabaseApi('config', { method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id:'drive_secret', value: oldSecret}) })
      );
    }
  }
  if (!groqApiKey) {
    const oldKey = localStorage.getItem('te_groq_key');
    if (oldKey) {
      groqApiKey = oldKey;
      migrations.push(
        supabaseApi('config', { method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id:'groq_key', value: oldKey}) })
      );
    }
  }
  if (migrations.length) await Promise.all(migrations);
  loadDriveConfig();
  loadGroqKeyStatus();
}

function loadDriveConfig() {
  const epInput   = document.getElementById('drive-endpoint-input');
  const secInput  = document.getElementById('drive-secret-input');
  const statusTxt = document.getElementById('drive-status-txt');
  if (!epInput) return;
  if (driveEp && driveSecret) {
    epInput.value  = driveEp;
    secInput.value = driveSecret;
    statusTxt.textContent = '✓ Conectado — imágenes nuevas van a Drive';
    statusTxt.style.color = 'var(--green)';
    document.getElementById('drive-test-btn')?.style && (document.getElementById('drive-test-btn').style.display = '');
    document.getElementById('drive-clear-btn')?.style && (document.getElementById('drive-clear-btn').style.display = '');
  }
}

function loadGroqKeyStatus() {
  const el = document.getElementById('groq-key-status');
  if (!el) return;
  if (groqApiKey) {
    el.textContent = '✓ Configurado — IA activa en todos los dispositivos';
    el.style.color = 'var(--green)';
  }
}

async function toggleWaFloat(enabled) {
  const r = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'wa_float', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '💬 Botón WhatsApp activado en Tienda' : '💬 Botón WhatsApp desactivado en Tienda', 'success');
  } else {
    toast('Error al guardar configuración', 'error');
    const toggle = document.getElementById('wa-float-toggle');
    if (toggle) toggle.checked = !enabled;
  }
}

async function saveGroqKey() {
  const val = document.getElementById('groq-key-input')?.value.trim();
  if (!val || !val.startsWith('gsk_')) { toast('Ingresa una key válida de Groq (empieza con gsk_)', 'error'); return; }
  const r = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'groq_key', value: val })
  });
  if (r.ok) {
    groqApiKey = val;
    loadGroqKeyStatus();
    toast('🤖 Groq key guardada — IA disponible para todos los usuarios ✓', 'success');
  } else { toast('Error al guardar la key', 'error'); }
}

async function saveDriveEndpoint() {
  const ep = document.getElementById('drive-endpoint-input').value.trim();
  if (!ep) { toast('Pega primero la URL del Apps Script', 'error'); return; }
  if (!driveSecret) {
    driveSecret = 'te_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  driveEp = ep;
  await Promise.all([
    supabaseApi('config', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'drive_ep', value: ep }) }),
    supabaseApi('config', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'drive_secret', value: driveSecret }) })
  ]);
  document.getElementById('drive-secret-input').value = driveSecret;
  const statusTxt = document.getElementById('drive-status-txt');
  statusTxt.textContent = '✓ Conectado — imágenes nuevas van a Drive';
  statusTxt.style.color = 'var(--green)';
  document.getElementById('drive-test-btn').style.display = '';
  document.getElementById('drive-clear-btn').style.display = '';
  toast('Drive guardado — copia el secreto del campo gris y pégalo en tu Apps Script', 'success');
}

function copyDriveSecret() {
  const val = document.getElementById('drive-secret-input').value;
  if (!val) return;
  navigator.clipboard.writeText(val)
    .then(() => toast('Secreto copiado al portapapeles ✓', 'success'))
    .catch(() => { document.getElementById('drive-secret-input').select(); toast('Selecciona el texto y copia con Ctrl+C / ⌘C', ''); });
}

async function clearDrive() {
  if (!confirm('¿Desconectar Google Drive? Las imágenes futuras se guardarán como base64.')) return;
  await Promise.all([
    supabaseApi('config?id=eq.drive_ep',     { method: 'DELETE' }),
    supabaseApi('config?id=eq.drive_secret', { method: 'DELETE' })
  ]);
  driveEp = null; driveSecret = null;
  document.getElementById('drive-endpoint-input').value = '';
  document.getElementById('drive-secret-input').value = '';
  document.getElementById('drive-status-txt').textContent = '(no configurado)';
  document.getElementById('drive-status-txt').style.color = '';
  document.getElementById('drive-test-btn').style.display = 'none';
  document.getElementById('drive-clear-btn').style.display = 'none';
  toast('Drive desconectado', '');
}

async function testDriveEndpoint() {
  if (!driveEp) return;
  const btn = document.getElementById('drive-test-btn');
  btn.textContent = 'Probando…'; btn.disabled = true;
  try {
    const r = await fetch(driveEp);
    const txt = await r.text();
    toast(txt === 'OK' ? 'Conexión con Drive OK ✓' : 'Respuesta inesperada: ' + txt, txt === 'OK' ? 'success' : 'error');
  } catch(e) { toast('Error al conectar con Drive: ' + e.message, 'error'); }
  btn.textContent = 'Probar'; btn.disabled = false;
}

/* Extrae el file ID de una URL de Drive thumbnail */
function _driveFileId(url) {
  if (!url || !url.includes('drive.google.com')) return null;
  const m = url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

/* Manda el archivo a la papelera de Drive (fire-and-forget, nunca bloquea) */
async function _deleteDriveFile(fileId) {
  if (!driveEp || !driveSecret || !fileId) return;
  try {
    await fetch(driveEp, {
      method: 'POST',
      body: JSON.stringify({ secret: driveSecret, action: 'delete', fileId })
    });
  } catch { /* silencioso — el borrado nunca bloquea el flujo principal */ }
}

async function uploadToDrive(b64) {
  if (!driveEp || !driveSecret) return null;
  try {
    const res = await fetch(driveEp, {
      method: 'POST',
      body: JSON.stringify({ secret: driveSecret, image: b64, name: `producto_${Date.now()}.jpg` })
    });
    const data = await res.json();
    if (!data.ok) {
      const msg = (data.error || '').toLowerCase().includes('autorizado')
        ? 'Drive: secreto incorrecto — ve a Herramientas → Google Drive, copia el secreto del campo gris y pégalo en tu Apps Script'
        : `Drive: ${data.error || 'Error al subir imagen'}`;
      toast(msg, 'error');
    }
    return data.ok ? data.url : null;
  } catch(e) {
    toast('Drive no responde — imagen guardada localmente', 'error');
    return null;
  }
}

async function migrateBase64ToDrive() {
  const toMigrate = products.filter(p => p.image?.startsWith('data:'));
  if (!toMigrate.length) { toast('No hay imágenes base64 que migrar', ''); return; }
  if (!driveEp || !driveSecret) { toast('Configura Google Drive primero en Herramientas → Google Drive', 'error'); return; }
  if (!confirm(`¿Migrar ${toMigrate.length} imágenes a Google Drive automáticamente?\n\nTarda ~${toMigrate.length} segundos. No cierres la ventana.`)) return;

  // Crear overlay de progreso
  const overlay = document.createElement('div');
  overlay.id = 'migrate-progress';
  overlay.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--charcoal);color:#fff;padding:14px 20px;border-radius:12px;font-size:.85rem;z-index:9999;min-width:260px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  document.body.appendChild(overlay);

  const setProgress = (cur, total, name) => {
    overlay.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Migrando imágenes a Drive…</div>
      <div style="background:#444;border-radius:6px;height:6px;margin-bottom:8px">
        <div style="background:var(--gold);height:6px;border-radius:6px;width:${Math.round(cur/total*100)}%;transition:width .3s"></div>
      </div>
      <div style="color:var(--muted-light);font-size:.78rem">${cur}/${total} — ${name}</div>`;
  };

  let ok = 0, fail = 0;
  for (let i = 0; i < toMigrate.length; i++) {
    const p = toMigrate[i];
    setProgress(i, toMigrate.length, p.name.slice(0, 35));
    const url = await uploadToDrive(p.image);
    if (url) {
      const res = await supabaseApi(`products?id=eq.${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ image: url })
      });
      if (res.ok) {
        const idx = products.findIndex(x => x.id === p.id);
        if (idx > -1) products[idx].image = url;
        ok++;
      } else { fail++; }
    } else { fail++; }
    await new Promise(r => setTimeout(r, 600));
  }

  overlay.remove();
  renderTable();
  renderStats();
  if (fail === 0) {
    toast(`✓ ${ok} imágenes migradas a Drive — egress reducido`, 'success');
  } else {
    toast(`${ok} migradas, ${fail} fallidas — revisa la conexión con Drive`, 'error');
  }
}

/* ── IMAGE UPLOAD ── */
let imageUploadController = null;
let currentFormImageDataUrl = null; // base64 de la imagen actual para análisis IA

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('save-btn').disabled = true;
  compressAndPreview(file);
}

function compressAndPreview(file) {
  if (imageUploadController) imageUploadController.abort();
  const controller = new AbortController();
  imageUploadController = controller;

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      if (controller.signal.aborted) return;
      const canvas = document.createElement('canvas');
      const MAX = 900;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const b64 = canvas.toDataURL('image/jpeg', 0.82);

      // Mostrar preview inmediatamente
      const preview = document.getElementById('f-img-preview');
      preview.src = b64;
      preview.classList.add('show');
      currentFormImageDataUrl = b64;
      showAiFormBtn();

      // Intentar subir a Drive; si no hay Drive o falla → usar base64
      (async () => {
        const hasDrive = !!driveEp;
        if (hasDrive) toast('Subiendo imagen a Drive…', '');
        const driveUrl = await uploadToDrive(b64);
        if (controller.signal.aborted) return;
        document.getElementById('f-image').value = driveUrl || b64;
        document.getElementById('save-btn').disabled = false;
        if (driveUrl) toast('Imagen guardada en Drive ✓', 'success');
      })();
    };
    img.onerror = () => {
      if (!controller.signal.aborted) toast('Error al procesar la imagen', 'error');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initImageUpload() {
  const zone = document.getElementById('img-upload-zone');
  if (!zone) return;
  zone.removeEventListener('dragover', zone._dragoverHandler);
  zone.removeEventListener('dragleave', zone._dragleaveHandler);
  zone.removeEventListener('dragend', zone._dragendHandler);
  zone.removeEventListener('drop', zone._dropHandler);

  // La zona solo maneja drag & drop — los botones internos abren galería/cámara
  zone._dragoverHandler = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone._dragleaveHandler = () => zone.classList.remove('drag-over');
  zone._dragendHandler = () => zone.classList.remove('drag-over');
  zone._dropHandler = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      document.getElementById('save-btn').disabled = true;
      compressAndPreview(file);
    }
  };

  zone.addEventListener('dragover', zone._dragoverHandler);
  zone.addEventListener('dragleave', zone._dragleaveHandler);
  zone.addEventListener('dragend', zone._dragendHandler);
  zone.addEventListener('drop', zone._dropHandler);
}

/* ── AI FORM ANALYSIS ── */
function showAiFormBtn() {
  const wrap = document.getElementById('ai-form-wrap');
  if (!wrap) return;
  wrap.style.display = '';
  wrap.style.opacity = '0';
  requestAnimationFrame(() => { wrap.style.transition = 'opacity .3s'; wrap.style.opacity = '1'; });
  // Restablecer estado del botón
  const btn = document.getElementById('ai-form-btn');
  if (btn) { btn.disabled = false; btn.style.borderColor = ''; btn.style.color = ''; }
  const icon = document.querySelector('#ai-form-btn .ai-form-icon');
  const label = document.querySelector('#ai-form-btn .ai-form-label');
  if (icon) icon.textContent = '✨';
  if (label) label.textContent = 'Completar con IA';
}

function hideAiFormBtn() {
  const wrap = document.getElementById('ai-form-wrap');
  if (wrap) wrap.style.display = 'none';
  const kp = document.getElementById('ai-key-prompt');
  if (kp) kp.style.display = 'none';
  currentFormImageDataUrl = null;
}

async function analyzeFormImage() {
  if (!currentFormImageDataUrl) { toast('Primero sube una imagen', 'error'); return; }
  const key = groqApiKey;
  if (!key) {
    const kp = document.getElementById('ai-key-prompt');
    if (kp) { kp.style.display = ''; document.getElementById('ai-key-prompt-input')?.focus(); }
    return;
  }
  const btn = document.getElementById('ai-form-btn');
  const icon = document.querySelector('#ai-form-btn .ai-form-icon');
  const lbl  = document.querySelector('#ai-form-btn .ai-form-label');
  btn.disabled = true;
  icon.innerHTML = '<span class="ai-spinner"></span>';
  lbl.textContent = 'Analizando imagen…';
  try {
    const catList = categories.map(c => `"${c.code}" (${c.label})`).join(', ');
    const systemPrompt = `Eres copywriter senior de catálogo para Tres Encantos, boutique mexicana. Escribes copy listo para publicar — sin edición posterior — al nivel de Sephora, Liverpool, ZARA o Amazon MX.

━━ PASO 0 (SIEMPRE primero) ━━
Lee de arriba a abajo TODO el texto impreso en la imagen: marca, línea/colección, tipo, concentración, variante/aroma, volumen/peso (ml, g), género, ingrediente estrella. Ese texto manda sobre cualquier suposición tuya.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TÍTULO — NATURA (máxima prioridad si detectas la marca)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fórmula: Natura [Línea] [Tipo/Concentración] [Variante] [ml o g] [Género si aplica]

Líneas reconocibles: Kaiak, Essencial, Una, Humor, Nativa, Plant, Tododia, Boticaría, Ekos, Chronos, Mamá Terra, Lumina, Luna, Aqua Mundi, Erva Doce, Faces, Amó, Sínia.
Concentraciones: EDP · EDT · Colônia · Desodorante Colônia · Desodorante Aerossol.
Género: Masculino / Femenino — solo si está escrito; omite si es unisex o no está claro.

Títulos Natura correctos (copia este nivel de detalle):
• "Natura Kaiak Desodorante Colônia Clásico 100ml Masculino"
• "Natura Essencial Eau de Parfum Floral 75ml Femenino"
• "Natura Una Colônia Oud Amaderado 75ml"
• "Natura Tododia Crema Corporal Coco 400ml"
• "Natura Ekos Aceite Corporal Ucuuba 100ml"
• "Natura Chronos Sérum Antienvejecimiento Plus 30g"
• "Natura Plant Shampoo Hidratación Intensa 300ml"
• "Natura Faces Labial Cremoso Rojo Coral 3.5g"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TÍTULO — GENERAL (todo lo que no es Natura)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fórmula: [Marca visible] + [Tipo] + [Material/Acabado] + [Color/Estampado]
• "Bolso Tote Cuero Vegano Negro — David Jones"
• "Cartera Mediana con Cadena Dorada Camel"
• "Mochila Antirrobo Nylon Gris Oscuro — Guess"
• "Clutch de Noche con Pedrería Champagne"
• "Sombras Ahumadas Paleta Café Terracota — NYX"

PROHIBIDO en cualquier título: "bonito", "elegante", "especial", "hermoso", "de calidad", "perfecto", SKUs, códigos alfanuméricos, dimensiones físicas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESCRIPCIÓN PREMIUM — fórmulas por tipo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Regla universal: empieza SIEMPRE con verbo activo o el ingrediente/rasgo estrella. NUNCA con "Este producto es...", "Es un...", "Perfecto para...".

▸ Natura — perfumes y colonias:
  "[Familia olfativa] de [notas clave] que [efecto en quien lo usa]. [Intensidad/duración] para [momento o tipo de persona]."
  Ej: "Fragancia amaderada de oud y almizcle que envuelve con calidez sensual. Larga duración, ideal para noches y ocasiones especiales."
  Ej: "Cítrico fresco de bergamota y cedro blanco que irradia vitalidad. Ligero y persistente, perfecto para el día a día activo."

▸ Natura — cremas, lociones, aceites corporales:
  "[Ingrediente clave] que [beneficio concreto en piel]. [Textura/sensación de uso o resultado visible]."
  Ej: "Manteca de ucuuba que restaura la piel más seca en profundidad. Textura aterciopelada que se absorbe sin residuo graso."
  Ej: "Aceite de maracuyá que nutre e ilumina la piel. Fórmula ligera con aroma tropical que permanece en la piel."

▸ Natura — cabello (shampoo, acondicionador, mascarilla):
  "[Ingrediente activo] que [beneficio en cabello]. [Resultado desde la primera aplicación o tipo de cabello]."
  Ej: "Proteína de arroz que fortalece y repara el cabello dañado por calor. Cabello suave, con brillo y sin frizz desde el primer uso."

▸ Natura — maquillaje (Faces):
  "[Acabado/cobertura] con [beneficio adicional]. [Tono/paleta y para qué tipo de piel o look]."
  Ej: "Acabado mate de larga duración que hidrata mientras cubre. Tono cálido ideal para pieles medias y looks naturales."

▸ Bolsos, mochilas, carteras:
  "[Material o rasgo de diseño] que [funcionalidad o sensación]. [Para qué estilo de vida u ocasión]."
  Ej: "Cuero vegano suave con herrajes dorados que eleva cualquier outfit. Amplio interior organizado para el día completo."

▸ Accesorios y joyería:
  "[Material/acabado] [forma o diseño] que [efecto visual o sensación]. [Ocasión ideal]."
  Ej: "Acero dorado en forma de media luna que da un toque minimal y sofisticado. Combina con cualquier look, de día o de noche."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORÍAS — mapeo de productos a códigos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usa el código exacto de esta lista. Aplica el mapeo lógico:
• Natura perfumes / colonias / desodorantes con aroma → natura_perfumes
• Natura cremas, lociones, aceites corporales → natura_cuerpo
• Natura shampoo, acondicionador, mascarilla → natura_cabello
• Natura maquillaje (Faces, Una) → natura_maquillaje
• Natura facial (sérum, hidratante, limpiador) → natura_facial
• Avon perfumes / colonias / desodorantes → avon_perfumes
• Avon cremas, lociones, corporales → avon_cuerpo
• Avon facial (sérum, hidratante, limpiador) → avon_facial
• Avon maquillaje (labial, base, sombra, máscara) → avon_maquillaje
• Si ves logo/marca Avon o líneas Avon (Anew, Skin So Soft, Far Away, Black Suede, Luck, Perceive) → usar avon_*
• Bolso grande / tote / shopper / mochila → bolsos o subcategoría correspondiente
• Cartera / billetera / monedero → accesorios o subcategoría
• Anillo / collar / aretes / pulsera → joyería o accesorios
• Labial / sombra / base / rubor → maquillaje
Si no hay código exacto o tienes duda → devuelve "".
Opciones disponibles: ${catList}

Español de México. Responde SOLO con JSON válido, sin markdown.`;
    const userPrompt = `PASO 0: escanea la imagen completa — marca, línea, concentración, variante, ml/g, género, ingrediente visible.

Devuelve ÚNICAMENTE JSON válido, sin markdown.

OBLIGATORIOS:
• "name": 45-70 chars. Natura → fórmula Natura completa. Otros → marca+tipo+material+color. Cero adjetivos genéricos. NUNCA uses siglas de concentración (EDP/EDT/EDC/EDP) — di "Perfume", "Colonia" o "Eau de Parfum" completo si aplica.
• "description": copy listo para publicar, máximo 160 chars. Sigue la fórmula exacta del sistema según el tipo de producto. Empieza con verbo activo o ingrediente estrella — nunca con "Este es...".

OPCIONALES:
• "category": código exacto según el mapeo del sistema. "" si no estás seguro.
• "price": número de etiqueta/plumón/empaque (ej: 350). Solo dígitos. NO confundas con ml, oz, g, tallas, %, lotes, códigos de barras. null si duda.

Formato: {"name":"...","description":"...","category":"","price":null}`;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: currentFormImageDataUrl } }
          ]}
        ],
        temperature: 0.3, max_tokens: 500
      })
    });
    if (!response.ok) {
      const eb = await response.json().catch(() => ({}));
      throw new Error(eb?.error?.message || `Error ${response.status}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('La IA no devolvió un formato reconocible');
    const parsed = JSON.parse(jsonMatch[0]);
    const flash = el => { el.classList.add('ai-filled'); setTimeout(() => el.classList.remove('ai-filled'), 1600); };
    if (parsed.name)        { const el = document.getElementById('f-name');        el.value = toTitleCase(_cleanAiName(parsed.name));  flash(el); }
    if (parsed.description) { const el = document.getElementById('f-description'); el.value = formatDescription(parsed.description); flash(el); }
    {
      const match = parsed.category
        ? categories.find(c =>
            c.code === parsed.category ||
            c.label.toLowerCase() === (parsed.category || '').toLowerCase()
          )
        : null;
      const el = document.getElementById('f-category');
      el.value = match ? match.code : 'por_revisar';
      el.dispatchEvent(new Event('change'));
      if (match) flash(el);
    }
    // Precio detectado en imagen (plumón, etiqueta, impreso)
    const rawPrice = parsed.price;
    if (rawPrice !== null && rawPrice !== undefined) {
      const num = Number(rawPrice);
      if (!isNaN(num) && num > 0 && num < 100000) {
        const el = document.getElementById('f-price');
        el.value = Math.round(num);
        flash(el);
        updateMarginDisplay();
      }
    }
    const filled = [parsed.name ? 'nombre' : null, parsed.description ? 'descripción' : null,
                    parsed.category ? 'categoría' : null, (rawPrice && Number(rawPrice) > 0) ? 'precio' : null]
                   .filter(Boolean).join(', ');
    toast(`✨ Completado: ${filled}`, 'success');
    icon.textContent = '✓';
    lbl.textContent = 'Analizado — edita si es necesario';
    btn.style.borderColor = 'var(--green)'; btn.style.color = 'var(--green)';
    setTimeout(() => {
      icon.textContent = '✨'; lbl.textContent = 'Volver a analizar';
      btn.style.borderColor = ''; btn.style.color = '';
      btn.disabled = false;
    }, 3000);
  } catch(err) {
    toast('Error IA: ' + err.message, 'error');
    icon.textContent = '✨'; lbl.textContent = 'Completar con IA';
    btn.disabled = false;
  }
}

async function saveInlineAiKey() {
  const val = document.getElementById('ai-key-prompt-input')?.value.trim();
  if (!val || !val.startsWith('gsk_')) { toast('Ingresa una key válida de Groq (empieza con gsk_)', 'error'); return; }
  const r = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'groq_key', value: val })
  });
  if (r.ok) {
    groqApiKey = val;
    loadGroqKeyStatus();
    document.getElementById('ai-key-prompt').style.display = 'none';
    toast('Key guardada para todos los dispositivos ✓', 'success');
    analyzeFormImage();
  } else { toast('Error al guardar la key', 'error'); }
}

/* ── FORM ── */
let _formSnapshot = null;

function _takeFormSnapshot() {
  const ids = ['f-name','f-price','f-original-price','f-description','f-image','f-category','f-badge','f-badge-type','f-barcode','f-stock','f-cost'];
  const snap = {};
  ids.forEach(id => { const el = document.getElementById(id); if (el) snap[id] = el.value; });
  ['f-featured','f-out-of-stock','f-published','f-is-kit'].forEach(id => {
    const el = document.getElementById(id); if (el) snap[id] = el.checked;
  });
  return snap;
}

function _formIsDirty() {
  if (!_formSnapshot) return false;
  const cur = _takeFormSnapshot();
  return Object.keys(_formSnapshot).some(k => _formSnapshot[k] !== cur[k]);
}

function openForm(id) {
  if (id && !can.editProduct) { toast('Vista de solo lectura', ''); return; }
  if (!id && !can.addProduct) { toast('Sin permiso para agregar productos', 'error'); return; }
  TE?.track(id ? 'form_open_edit' : 'form_open_add', id ? { id } : {});
  populateBadgeList();
  const overlay = document.getElementById('form-overlay');
  document.getElementById('form-title').textContent = id ? 'Editar producto' : 'Agregar producto';
  // Ocultar banner de retorno al kit salvo que venga de _openFormFromKit
  if (!_returnToKitId) { const b = document.getElementById('form-kit-banner'); if (b) b.style.display = 'none'; }

  if (id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('f-id').value = p.id;
    document.getElementById('f-name').value = p.name;
    document.getElementById('f-category').value = p.category;
    document.getElementById('f-category-label').value = p.categoryLabel;
    _updateFormCatBtn(p.category);
    document.getElementById('f-price').value = p.price;
    document.getElementById('f-original-price').value = p.originalPrice || '';
    toggleOfertaField(!!p.originalPrice);
    document.getElementById('f-badge').value = p.badge || '';
    document.getElementById('f-badge-type').value = p.badgeType || '';
    document.getElementById('f-description').value = p.description;
    document.getElementById('f-image').value = p.image;
    if (p.image) { const w = document.getElementById('f-img-url-wrap'); if (w) w.style.display = 'block'; }
    document.getElementById('f-featured').checked = p.featured;
    document.getElementById('f-out-of-stock').checked = p.outOfStock || false;
    document.getElementById('f-published').checked = p.isPublished !== false; // default true
    document.getElementById('f-barcode').value = p.barcode || '';
    document.getElementById('f-stock').value = p.stock ?? 0;
    document.getElementById('f-cost').value = p.cost ?? '';
    updateMarginDisplay();
    previewImg();
    const isKit = !!(p.kitItems && p.kitItems.length);
    document.getElementById('f-is-kit').checked = isKit;
    _kitItemsEdit = isKit ? JSON.parse(JSON.stringify(p.kitItems)) : [];
    toggleKitMode();
    _additionalImagesEdit = p.images ? [...p.images] : [];
    renderAdditionalImages();
  } else {
    document.getElementById('f-id').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-category').value = 'por_revisar';
    document.getElementById('f-category-label').value = categories[0]?.label || '';
    _updateFormCatBtn('por_revisar');
    document.getElementById('f-price').value = '';
    document.getElementById('f-original-price').value = '';
    toggleOfertaField(false);
    document.getElementById('f-badge').value = '';
    document.getElementById('f-badge-type').value = '';
    document.getElementById('f-description').value = '';
    document.getElementById('f-image').value = '';
    const _urlWrap = document.getElementById('f-img-url-wrap'); if (_urlWrap) _urlWrap.style.display = 'none';
    document.getElementById('img-upload-zone')?.classList.remove('has-image');
    document.getElementById('f-featured').checked = false;
    document.getElementById('f-out-of-stock').checked = false;
    document.getElementById('f-published').checked = false;
    document.getElementById('f-barcode').value = '';
    document.getElementById('f-stock').value = 1;
    document.getElementById('f-cost').value = '';
    document.getElementById('f-margin-display').textContent = 'Margen: —';
    document.getElementById('f-img-preview').classList.remove('show');
    document.getElementById('f-img-file').value = '';
    document.getElementById('f-img-camera').value = '';
    hideAiFormBtn();
    document.getElementById('f-is-kit').checked = false;
    _kitItemsEdit = [];
    document.getElementById('kit-editor').style.display = 'none';
    _additionalImagesEdit = [];
    renderAdditionalImages();
  }

  _clearDupWarnings();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initImageUpload();
  document.getElementById('save-btn').disabled = false;
  _applyPriceLock();
  setTimeout(() => {
    if (_scrollToKitOnOpen) {
      _scrollToKitOnOpen = false;
      const kitEl = document.getElementById('kit-editor');
      const body  = document.querySelector('#form-overlay .modal-body');
      if (kitEl && body) body.scrollTop = kitEl.offsetTop - 12;
    } else if (id) {
      document.getElementById('f-name').focus();
    } else {
      document.querySelector('#form-overlay .modal-body').scrollTop = 0;
    }
    // Normalizar antes del snapshot: title case y categoría sugerida se aplican en onblur
    // Si no lo hacemos aquí, el primer blur del usuario rompe la comparación (falso positivo)
    if (id) { applyTitleCase('f-name'); suggestCategoryFromName(); }
    _formSnapshot = _takeFormSnapshot();
  }, 150);
}

function closeForm() {
  if (_formIsDirty()) {
    if (!confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
  }
  _formSnapshot = null;
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
  _clearDupWarnings();
  const b = document.getElementById('form-kit-banner'); if (b) b.style.display = 'none';
  if (_returnToDupReview) { _returnToDupReview = false; setTimeout(openDupReview, 80); }
  if (_returnToKitId)   { const id = _returnToKitId;   _returnToKitId   = null; _scrollToKitOnOpen = true; setTimeout(() => openForm(id), 80); }
  if (_returnToKitQVId) { const id = _returnToKitQVId; _returnToKitQVId = null; setTimeout(() => openQV(id), 80); }
}


function toggleOfertaField(forceShow) {
  const wrap = document.getElementById('oferta-wrap');
  const btn  = document.getElementById('toggle-oferta-btn');
  if (!wrap || !btn) return;
  const show = forceShow !== undefined ? forceShow : wrap.style.display === 'none';
  wrap.style.display = show ? 'block' : 'none';
  btn.style.display  = show ? 'none'  : 'block';
  if (!show) document.getElementById('f-original-price').value = '';
}

function updateMarginDisplay() {
  const price = parseFloat(document.getElementById('f-price')?.value) || 0;
  const cost  = parseFloat(document.getElementById('f-cost')?.value)  || 0;
  const el    = document.getElementById('f-margin-display');
  if (!el) return;
  if (!cost || !price) { el.textContent = 'Margen: —'; el.style.color = ''; return; }
  const pct = ((price - cost) / price * 100).toFixed(1);
  const amt = (price - cost).toLocaleString('es-MX');
  el.textContent = `Margen: $${amt} (${pct}%)`;
  el.style.color = parseFloat(pct) >= 30 ? 'var(--green)' : parseFloat(pct) >= 10 ? 'var(--gold-dark)' : 'var(--red)';
}

function _updateActiveFiltersBar() {
  const bar = document.getElementById('filter-active-bar');
  const chipsEl = document.getElementById('fac-chips');
  if (!bar || !chipsEl) return;

  const chips = [];
  const catVal = document.getElementById('cat-filter')?.value || 'all';
  const sortVal = document.getElementById('sort-select')?.value || 'recent';
  const searchVal = document.getElementById('search-input')?.value?.trim() || '';

  if (searchVal) chips.push(`🔍 "${searchVal.length > 20 ? searchVal.slice(0,20)+'…' : searchVal}"`);

  if (catVal !== 'all') {
    const cat = categories.find(c => c.code === catVal);
    chips.push(`📂 ${cat?.label || catVal}`);
  }
  const sortLabels = { 'name-az':'A→Z','name-za':'Z→A','price-desc':'$ Mayor','price-asc':'$ Menor','stock-asc':'Agotados primero','stock-desc':'En stock primero' };
  if (sortLabels[sortVal]) chips.push(`↕ ${sortLabels[sortVal]}`);

  if (_statFilter) {
    const statLabels = { 'con-stock':'Con stock','sin-stock':'Sin stock','ultima-pieza':'Última pieza','sin-publicar':'Sin publicar','sin-codigo':'Sin código','sin-categ':'Sin categoría','sin-precio':'Sin precio','imagen-base64':'Imagen base64' };
    chips.push(statLabels[_statFilter] || _statFilter);
    if (_statFilter === 'imagen-base64' && ROLE === 'superadmin') {
      chips.push(`<button class="fac-chip fac-chip-action" onclick="migrateBase64ToDrive()">🚀 Migrar todas a Drive</button>`);
    }
  }
  if (_showOnlyFlagged) chips.push('🚩 Por revisar');

  const creatorVal = document.getElementById('creator-filter')?.value || 'all';
  if (creatorVal !== 'all') {
    const label = creatorVal === '__none__' ? 'Sin registro' : (_userNames[creatorVal] || creatorVal.split('@')[0]);
    chips.push(`👤 ${label}`);
  }

  if (chips.length > 0) {
    chipsEl.innerHTML = chips.map(t => `<span class="fac-chip">${t}</span>`).join('');
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

function clearAdminFilters() {
  const s = document.getElementById('search-input');
  const c = document.getElementById('cat-filter');
  const sortSel = document.getElementById('sort-select');
  const creatorSel = document.getElementById('creator-filter');
  if (s) s.value = '';
  if (c) { c.value = 'all'; _updateCatFilterBtn(); }
  if (sortSel) { sortSel.value = 'recent'; currentSort = 'recent'; }
  if (creatorSel) creatorSel.value = 'all';
  if (_showOnlyFlagged) { _showOnlyFlagged = false; _syncFlagFilter(); }
  _statFilter = null;
  _toggleSearchClear();
  _adminPage = 1;
  renderTable();
  renderStats();
}

function _toggleSearchClear() {
  const btn = document.getElementById('search-clear-btn');
  if (btn) btn.style.display = document.getElementById('search-input')?.value ? '' : 'none';
}

let _searchDebTimer = null;
function _searchDebounce() {
  _toggleSearchClear();
  clearTimeout(_searchDebTimer);
  _searchDebTimer = setTimeout(() => {
    _adminPage = 1;
    renderTable();
    TE?.trackSearch(document.getElementById('search-input')?.value || '', !!getFilteredProducts().length);
  }, 180);
}

function clearSearchInput() {
  const s = document.getElementById('search-input');
  if (s) s.value = '';
  _toggleSearchClear();
  _adminPage = 1;
  renderTable();
}

function syncCategoryLabel() {
  const cat = document.getElementById('f-category').value;
  document.getElementById('f-category-label').value = getCatLabel(cat);
  _updateFormCatBtn(cat);
  _applyPriceLock();
}

function _applyPriceLock() {
  const cat      = document.getElementById('f-category')?.value;
  const priceEl  = document.getElementById('f-price');
  const hintEl   = document.getElementById('price-lock-hint');
  if (!priceEl || !hintEl) return;
  const shouldLock = cat === 'por_revisar' && parseFloat(priceEl.value) > 0;
  priceEl.readOnly = shouldLock;
  priceEl.style.background  = shouldLock ? 'var(--cream)' : '';
  priceEl.style.color        = shouldLock ? 'var(--muted)'  : '';
  priceEl.style.cursor       = shouldLock ? 'not-allowed'  : '';
  hintEl.style.display       = shouldLock ? 'block'        : 'none';
}

/* Sugiere categoría automáticamente al escribir el nombre del producto */
function suggestCategoryFromName() {
  const name = (document.getElementById('f-name')?.value || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita acentos para comparar
  if (!name || name.length < 4) return;

  const rules = [
    // ── AVON subcategorías (específicas primero) ─────────────────────────
    [/avon.*perfum|avon.*colonia|avon.*fragancia|far away|black suede|luck\b.*avon|perceive|avon.*desodor|avon.*deo/,
     'avon_perfumes'],
    [/avon.*shampoo|avon.*acondicion|avon.*cabell|avon.*pelo/,
     'avon_cuerpo'],
    [/anew|avon.*facial|avon.*serum|avon.*crema.*cara|avon.*antiedad|avon.*limpiador/,
     'avon_facial'],
    [/avon.*crema.*corp|avon.*locion|avon.*corporal|skin so soft|avon.*hidratante|avon.*exfoli/,
     'avon_cuerpo'],
    [/avon.*labial|avon.*base|avon.*rubor|avon.*sombra|avon.*rimel|avon.*mascara|avon.*maquill|avon.*lip|true color/,
     'avon_maquillaje'],
    // ── AVON general ────────────────────────────────────────────────────
    [/\bavon\b/,
     'avon'],
    // ── NATURA subcategorías (específicas primero) ───────────────────────
    [/perfum|colonia|desodoran|fragancia|eau de|toilette|body splash|deo col/,
     'natura_perfumes'],
    [/shampoo|champu|acondicionad|mascarilla.*(cabello|pelo|capilar)|tratamiento.*(capilar|cabello)|ampolla.*(capilar|cabello)|brillo.*cabello/,
     'natura_cabello'],
    [/crema.*(facial|cara|rostro)|serum|tonificad|toner|micelar|limpiador.*(facial|cara)|antiedad|protector.*solar|antisolar|\bspf\b|bb cream|cc cream|prebase/,
     'natura_facial'],
    [/crema.*(cuerpo|corpor|body)|locion|hidratante|exfolian|aceite.*(cuerpo|corpor)|mantequilla.*(cuerpo|corpor)|jabon.*(corp|bano)|sabonete|gel.*baño/,
     'natura_cuerpo'],
    [/labial.*natura|base.*natura|rubor.*natura|sombra.*natura|paleta.*natura|brocha.*natura|pincel.*natura/,
     'natura_maquillaje'],
    // ── NATURA general (brand names) ────────────────────────────────────
    [/\bnatura\b|ekos|chronos|kaiak|mamae|nuxe|lumina|todo dia|essencial|faces\b|bioserum|ativance|fotoequil|savagina|una\b.*nat|homem.*nat/,
     'natura'],
    // ── MOCHILAS (específicas antes que general) ─────────────────────────
    [/mochila.*(personaj|niñ|infantil|kawaii|unicornio|caricatur|disney|kitty|stitch|pokemon|minion|superheroe|anima|escolar.*niñ)/,
     'mochilas_personaje'],
    [/mochila.*(deport|gym|sport|fitness|entrena|tactico|senderis)|gym.*bag|sport.*bag/,
     'mochilas_deportivas'],
    [/mochila/,
     'mochilas_dama'],
    // ── LONCHERAS ────────────────────────────────────────────────────────
    [/lonchera|fiambrera|porta.*almuerzo|porta.*lunch|lunch.*bag/,
     'loncheras'],
    // ── CANGURERAS ───────────────────────────────────────────────────────
    [/cangurera|riñonera|fanny|cinturon.*bolso|belt.*bag/,
     'cangureras'],
    // ── LAPICERAS ────────────────────────────────────────────────────────
    [/lapicera|estuche.*(lapiz|pluma|lapices)|porta.*(lapiz|pluma)|cartuchera/,
     'lapiceras'],
    // ── COSMETIQUERAS ────────────────────────────────────────────────────
    [/cosmetiquera|neceser|organizador.*(maquilla|cosmet|belleza)|porta.*cosmet|estuche.*(maquilla|cosmet|belleza)|bolsa.*(maquilla|cosmet)/,
     'cosmetiqueras'],
    // ── BOLSOS (casual antes que dama) ───────────────────────────────────
    [/bolso.*(casual|tela|lona|canvas|estampado|juvenil|playa)|bolsa.*(casual|tela|lona|canvas)|tote|shopper/,
     'bolsos_casual'],
    [/bolso|bolsa.*(dama|mujer|elegante|cuero|piel|clasico|lujo|fino|vintage|mano|hombro)|cartera|clutch|\bsobre\b.*bolso|pochette|minibag|mini.*bag|handbag|satchel|hobo|bucket|crossbody|bandolera/,
     'bolsos_dama'],
    // ── CABELLO ──────────────────────────────────────────────────────────
    [/diadema|donas?(?!.*joya)|liga.*cabello|liga.*pelo|ligas.*cabello|pasador|pinza|broche.*cabello|broche.*pelo|valerin|cofia|cepillo.*(cabello|pelo)|peine|turbante|moño|scrunchie|bun\b|clip.*cabello|cintillo|gancho.*cabello|horquilla|hebilla|quita.*greña|argolla.*cabello|arco.*cabello|accesorio.*cabello|accesorio.*pelo|para.*cabello|para.*pelo/,
     'cabello'],
    // ── BISUTERÍA ────────────────────────────────────────────────────────
    [/arete|aretes|collar(?!.*perro)|cadena(?!.*llave)|pulsera|bisuter|joya|anillo|brazalete|gargantilla|tobillera|piercing|medallon|dije|charm\b|argolla(?!.*cabello)|set.*joya|juego.*joya|accesorio.*plata|accesorio.*dorado/,
     'bisuteria'],
    // ── MODA ─────────────────────────────────────────────────────────────
    [/gorra|sombrero|chalina|sombrilla|bufanda|pañuelo|mascada|cinturon(?!.*bolso)|gorrita|cachucha|beanie|boina|visera|gorro|cintillo.*moda/,
     'moda'],
    // ── UÑAS ─────────────────────────────────────────────────────────────
    [/uña|esmalte|lima.*uña|manicure|postiza|poligel|gel.*uv|gel.*uña|brillo.*uña|charol.*uña|\bnail\b|press.*on|kit.*uña|acrilica|top.*coat|base.*coat/,
     'unas'],
    // ── MAQUILLAJE ───────────────────────────────────────────────────────
    [/maquilla|labial\b|corrector\b|rubor|sombra.*(ojo|parpado)|pestañ|rimmel|mascara.*(ojo|pesta)|blush|bronzer|iluminador|contorno.*rostro|delineador|eyeliner|polvo.*compacto|sellador|fijador.*maquilla|primer\b|brocha.*maquilla|pincel.*maquilla|esponja.*maquilla|paleta.*color|pigmento|cejas/,
     'maquillaje'],
  ];

  for (const [regex, code] of rules) {
    if (regex.test(name)) {
      const sel = document.getElementById('f-category');
      if (!sel || sel.value === code) return; // ya está asignado, no interrumpir
      sel.value = code;
      if (sel.value !== code) return; // código no existe en las opciones actuales
      syncCategoryLabel();
      _updateFormCatBtn(code);
      sel.classList.add('ai-filled');
      setTimeout(() => sel.classList.remove('ai-filled'), 1400);
      return;
    }
  }
}

/* Title Case para nombres de productos en español (estilo retail mexicano).
   Primera palabra siempre en mayúscula; preposiciones/artículos/conjunciones
   cortas en minúscula cuando van en el medio. */
function toTitleCase(str) {
  const SMALL = new Set([
    'a','al','con','de','del','e','el','en','es','la','las',
    'lo','los','ni','o','para','por','sin','u','un','una','unos','unas','y'
  ]);
  return str
    .trim()
    .replace(/\s+/g, ' ')          // colapsar espacios múltiples
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      const low = word.toLowerCase();
      // Primera palabra siempre en mayúscula; SMALL solo en posición intermedia
      if (i === 0 || !SMALL.has(low)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return low;
    })
    .join(' ');
}

function applyTitleCase(fieldId) {
  const el = document.getElementById(fieldId);
  if (el && el.value.trim()) el.value = toTitleCase(el.value);
}

// Limpia siglas técnicas de concentración de perfumes que confunden al cliente
function _cleanAiName(name) {
  if (!name) return name;
  return name
    .replace(/\bEDP\b/g, 'Eau de Parfum')
    .replace(/\bEDT\b/g, 'Eau de Toilette')
    .replace(/\bEDC\b/g, 'Eau de Cologne')
    .replace(/\bedp\b/gi, 'Eau de Parfum')
    .replace(/\bedt\b/gi, 'Eau de Toilette')
    .replace(/\bedc\b/gi, 'Eau de Cologne');
}

/* Convierte HTML del portapapeles a texto limpio con bullets y saltos de línea */
function _htmlToPlainText(html) {
  let s = html;
  s = s.replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div|h[1-6]|ul|ol|blockquote|tr)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  // Decode ALL HTML entities (named, numeric &#225;, hex &#xE1;) via DOM
  const tmp = document.createElement('textarea');
  tmp.innerHTML = s;
  s = tmp.value;
  // Colapsar bullets duplicados al inicio de línea (ej: "• • texto" → "• texto")
  return s.split('\n').map(l => l.trim().replace(/^([•\-\*·])\s*[•\-\*·]\s*/,'$1 ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Handler de paste en campos de descripción — convierte HTML a texto limpio */
function handleDescPaste(e) {
  const html = e.clipboardData?.getData('text/html');
  if (!html) return;
  e.preventDefault();
  const clean = _htmlToPlainText(html);
  const ta = e.target;
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + clean + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + clean.length;
}

/* Escapa HTML y convierte \n en <br> para renderizado seguro de descripciones */
function _descHtml(desc) {
  if (!desc) return '';
  let s = desc
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,'<em>$1</em>');
  // Agrupar líneas con viñeta en lista
  s = s.replace(/((?:• .+\n?)+)/g, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^• /,'').trim()}</li>`).join('');
    return `<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc">${items}</ul>`;
  });
  s = s.replace(/\n/g,'<br>');
  return s;
}

function _descWrapToggle(marker) {
  const ta = document.getElementById('f-description');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const val = ta.value;
  const sel = s === e ? '' : val.slice(s, e);
  if (!sel) { ta.focus(); return; }
  let newSel;
  if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length > marker.length * 2) {
    newSel = sel.slice(marker.length, -marker.length);
  } else {
    newSel = marker + sel + marker;
  }
  ta.value = val.slice(0, s) + newSel + val.slice(e);
  ta.setSelectionRange(s, s + newSel.length);
  ta.focus();
}

function toggleBoldDesc()   { _descWrapToggle('**'); }
function toggleItalicDesc() { _descWrapToggle('*');  }

function addBulletDesc() {
  const ta = document.getElementById('f-description');
  if (!ta) return;
  const s = ta.selectionStart;
  const val = ta.value;
  // Insertar "• " al inicio de la línea actual
  const lineStart = val.lastIndexOf('\n', s - 1) + 1;
  const lineText  = val.slice(lineStart, s);
  let insert, newCursor;
  if (lineText.startsWith('• ')) {
    // Ya tiene viñeta → quitar
    ta.value = val.slice(0, lineStart) + lineText.slice(2) + val.slice(s);
    newCursor = s - 2;
  } else {
    ta.value = val.slice(0, lineStart) + '• ' + val.slice(lineStart);
    newCursor = s + 2;
  }
  ta.setSelectionRange(newCursor, newCursor);
  ta.focus();
}

/* Formatea descripción: primera letra mayúscula + punto al final (preserva saltos de línea) */
function formatDescription(str) {
  if (!str) return str;
  const lines = str.split('\n').map(l => l.replace(/ +/g, ' ').trim());
  let s = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return s;
  // Capitalizar primera letra
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // Capitalizar letra tras punto, !, ? o … seguido de espacio
  s = s.replace(/([.!?…][ \t]+)([a-záéíóúàèìòùäëïöüñ])/g,
    (_, punct, letter) => punct + letter.toUpperCase());
  if (!/[.!?…]$/.test(s)) s += '.';
  return s;
}

function applyDescriptionFormat(fieldId) {
  const el = document.getElementById(fieldId);
  if (el && el.value.trim()) el.value = formatDescription(el.value);
}

/* ── VALIDACIÓN DEL FORMULARIO ─────────────────────────────────────── */
function clearFieldError(el) {
  const field = el?.closest?.('.field');
  if (!field) return;
  field.classList.remove('field-invalid');
  field.querySelector('.field-error-msg')?.remove();
}

function validateForm() {
  // Limpiar errores previos
  document.querySelectorAll('.field-invalid').forEach(f => f.classList.remove('field-invalid'));
  document.querySelectorAll('.field-error-msg').forEach(e => e.remove());

  let firstInvalid = null;

  const markError = (inputId, msg) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const field = input.closest('.field');
    if (!field) return;
    field.classList.add('field-invalid');
    const err = document.createElement('p');
    err.className = 'field-error-msg';
    err.textContent = '⚠ ' + msg;
    field.appendChild(err);
    // Auto-limpiar al corregir
    input.addEventListener('input', () => clearFieldError(input), { once: true });
    input.addEventListener('change', () => clearFieldError(input), { once: true });
    if (!firstInvalid) firstInvalid = input;
  };

  const name  = document.getElementById('f-name')?.value.trim();

  if (!name) markError('f-name', 'El nombre es obligatorio');

  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstInvalid.focus();
  }

  return !firstInvalid;
}

function clearField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.focus();
}

function previewImg() {
  const url = document.getElementById('f-image').value.trim();
  const preview = document.getElementById('f-img-preview');
  const zone = document.getElementById('img-upload-zone');
  if (url) {
    preview.src = url;
    preview.classList.add('show');
    preview.onerror = () => { preview.classList.remove('show'); zone?.classList.remove('has-image'); };
    zone?.classList.add('has-image');
  } else {
    preview.classList.remove('show');
    zone?.classList.remove('has-image');
  }
}

/* ── SAVE PRODUCT — targeted PATCH or single POST ── */
async function saveProduct() {
  applyTitleCase('f-name');
  applyDescriptionFormat('f-description');
  if (!validateForm()) return;

  // Re-corre checks de duplicado por si el usuario no pasó por blur
  checkBarcodeConflict();
  checkNameSimilarity();
  const barcodeWarn = document.getElementById('f-barcode-warn');
  const nameWarn    = document.getElementById('f-name-warn');
  if (barcodeWarn?.style.display !== 'none' && barcodeWarn?.classList.contains('error')) return;
  if (nameWarn?.style.display !== 'none') {
    if (!confirm('El sistema detectó un producto similar en el catálogo.\n¿Confirmas que es un producto diferente?')) return;
  }

  const name = document.getElementById('f-name').value.trim();
  const price = parseFloat(document.getElementById('f-price').value) || 0;
  const image = document.getElementById('f-image').value.trim();
  const description = document.getElementById('f-description').value.trim();

  if (!name) {
    toast('El nombre es obligatorio.', 'error');
    return;
  }

  if (document.getElementById('f-is-kit').checked) {
    if (_kitItemsEdit.length === 0) {
      toast('Un kit necesita al menos 2 componentes.', 'error');
      return;
    }
    if (_kitItemsEdit.length === 1 && _kitItemsEdit[0].qty < 2) {
      toast('Un kit con un solo producto no tiene sentido — agrégale más componentes o véndelo directamente.', 'error');
      return;
    }
  }

  const idVal = document.getElementById('f-id').value;
  const badge = document.getElementById('f-badge').value.trim();
  const origPrice = parseFloat(document.getElementById('f-original-price').value) || null;
  const catVal = document.getElementById('f-category').value || 'por_revisar';
  // Sin precio → nunca publicar en web. Operador → siempre inicia sin publicar.
  const sinPrecio = !price || price <= 0;
  const publishedVal = sinPrecio ? false : (!idVal && !can.publishProduct ? false : document.getElementById('f-published').checked);
  const data = {
    name,
    category: catVal,
    categoryLabel: document.getElementById('f-category-label').value.trim() || getCatLabel(catVal),
    price,
    originalPrice: (origPrice && origPrice > price) ? origPrice : null,
    description,
    image: image || DEFAULT_IMG,
    badge: badge || null,
    badgeType: document.getElementById('f-badge-type').value || null,
    featured: document.getElementById('f-featured').checked,
    outOfStock: document.getElementById('f-out-of-stock').checked,
    barcode: document.getElementById('f-barcode').value.trim() || null,
    stock: parseInt(document.getElementById('f-stock').value) || 0,
    cost: parseFloat(document.getElementById('f-cost').value) || null,
    isPublished: publishedVal,
    kitItems: document.getElementById('f-is-kit').checked && _kitItemsEdit.length
      ? _kitItemsEdit.map(item => {
          const prod = products.find(x => x.id === item.id);
          return { ...item, image: prod?.image || item.image || null };
        })
      : null,
    images: _additionalImagesEdit.length ? _additionalImagesEdit : null
  };

  // Auto-sincronizar out_of_stock con stock — el checkbox oculto puede quedar
  // desincronizado si el usuario sólo edita el campo stock sin tocar ese campo
  if (!data.kitItems) {
    if (data.stock > 0) data.outOfStock = false;
    else data.outOfStock = true;
  }

  const dbPayload = {
    name: data.name,
    category: data.category,
    category_label: data.categoryLabel,
    price: data.price,
    description: data.description,
    image: data.image,
    badge: data.badge,
    badge_type: data.badgeType,
    featured: data.featured,
    out_of_stock: data.kitItems ? false : data.outOfStock,
    original_price: data.originalPrice,
    barcode: data.barcode,
    stock: data.stock,
    cost: data.cost,
    is_published: data.isPublished,
    kit_items: data.kitItems,
    images: data.images,
    ...(!idVal ? { created_by: getCurrentUserEmail() } : {})
  };

  const saveBtn = document.getElementById('save-btn');
  setBtn(saveBtn, true, idVal ? 'Actualizando...' : 'Guardando...');

  // Capturar imagen anterior ANTES de actualizar el array local
  // (para borrarla de Drive solo si el guardado tiene éxito)
  const _prevImage = idVal ? products.find(p => p.id === parseInt(idVal))?.image : null;

  if (idVal) {
    const idx = products.findIndex(p => p.id === parseInt(idVal));
    if (idx > -1) products[idx] = { ...products[idx], ...data };

    if (getSupabaseUrl()) {
      const result = await supabaseApi(`products?id=eq.${idVal}`, {
        method: 'PATCH',
        body: JSON.stringify(dbPayload)
      });
      if (!result.ok) {
        setBtn(saveBtn, false);
        const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
        toast(`Error al actualizar: ${errMsg}`, 'error');
        return;
      }
      // Guardado OK → borrar imagen anterior de Drive si fue reemplazada
      const oldId = _driveFileId(_prevImage);
      if (oldId && _prevImage !== data.image) _deleteDriveFile(oldId);
    }
  } else {
    const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
    const newProduct = { id: maxId + 1, ...data, position: products.length };
    products.push(newProduct);

    let result;
    try {
      result = await supabaseApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: newProduct.id, ...dbPayload, position: newProduct.position })
      });
    } catch (err) {
      products.pop();
      setBtn(saveBtn, false);
      toast(`Error de red al guardar: sin conexión o tiempo de espera agotado`, 'error');
      return;
    }
    if (!result.ok) {
      products.pop();
      setBtn(saveBtn, false);
      const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
      toast(`Error al guardar: ${errMsg}`, 'error');
      return;
    }
  }

  if (idVal) {
    _trackEdit(parseInt(idVal));
    logActivity('producto_editado', `Editó "${name}"`, { id: parseInt(idVal), name, price });
    TE?.track('product_saved', { action: 'edit', name });
  } else {
    const newId = products[products.length - 1]?.id;
    if (newId) _trackEdit(newId);
    logActivity('producto_creado', `Creó "${name}" — $${price.toLocaleString('es-MX')}`, { id: newId, name, price });
    TE?.track('product_saved', { action: 'add', name });
  }
  _formSnapshot = null;
  // Ir a "Recientes" para que el producto guardado aparezca al inicio
  const _sortSel = document.getElementById('sort-select');
  if (_sortSel) { _sortSel.value = 'recent'; currentSort = 'recent'; }
  closeForm();
  renderTable();
  renderStats();
  if (sinPrecio && !idVal) {
    toast('Producto guardado sin precio — asígnalo antes de publicar en la tienda', 'warn');
  } else {
    toast(idVal ? 'Guardado ✓' : 'Producto agregado ✓');
  }
}

/* ── KIT EDITOR ── */
function toggleKitMode() {
  const isKit = document.getElementById('f-is-kit').checked;
  document.getElementById('kit-editor').style.display = isKit ? 'block' : 'none';
  const stockWrap  = document.getElementById('f-stock-wrap');
  const stockInput = document.getElementById('f-stock');
  if (isKit) {
    if (stockWrap) stockWrap.style.display = 'none';
    stockInput.disabled = true;
    stockInput.value = '0';
  } else {
    if (stockWrap) stockWrap.style.display = '';
    stockInput.disabled = false;
  }
  if (isKit) renderKitEditor();
}

function _kitCompPopover(id, event) {
  event.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('kit-comp-popover')?.remove();
  const pop = document.createElement('div');
  pop.id = 'kit-comp-popover';
  pop.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:14px;padding:16px;z-index:99999;box-shadow:0 8px 40px rgba(0,0,0,.28);width:240px;text-align:center';
  const stockTxt = (p.outOfStock || p.stock === 0)
    ? '<span style="color:var(--red)">Agotado</span>'
    : `<span style="color:var(--green)">${p.stock} en stock</span>`;
  pop.innerHTML = `
    <button onclick="document.getElementById('kit-comp-popover')?.remove()" style="position:absolute;top:8px;right:10px;background:none;border:none;font-size:1.1rem;color:var(--muted);cursor:pointer;line-height:1">✕</button>
    <img src="${p.image || DEFAULT_IMG}" onerror="this.src='${DEFAULT_IMG}'" style="width:100%;max-height:180px;object-fit:contain;border-radius:9px;background:#F9F5EF">
    <div style="font-weight:700;margin-top:10px;font-size:.9rem;line-height:1.3">${p.name}</div>
    <div style="font-size:.76rem;margin-top:5px;display:flex;justify-content:center;gap:10px">
      ${stockTxt}
      <span style="color:var(--muted)">$${(p.price||0).toLocaleString('es-MX')}</span>
    </div>
    <button onclick="_openFormFromKit(${p.id})" style="margin-top:12px;width:100%;padding:8px;border:none;border-radius:8px;background:var(--gold);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer">✏️ Editar producto</button>`;
  document.body.appendChild(pop);
  setTimeout(() => {
    const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 50);
}

function renderKitEditor() {
  const list = document.getElementById('kit-components-list');
  if (!_kitItemsEdit.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:.8rem;padding:12px 0">Sin componentes — busca productos arriba</div>';
    _updateKitStockCalc();
    return;
  }
  list.innerHTML = _kitItemsEdit.map(item => {
    const p = products.find(x => x.id === item.id);
    const stock = p ? (p.outOfStock || p.stock === 0 ? '<span style="color:var(--red)">Agotado</span>' : `<span style="color:var(--green)">${p.stock} uds</span>`) : '<span style="color:var(--muted)">—</span>';
    return `
<div class="kit-comp-row">
  ${p?.image ? `<img src="${p.image}" class="kit-comp-img" onerror="this.style.display='none'" onclick="_kitCompPopover(${item.id},event)" style="cursor:zoom-in" title="Ver producto">` : '<div class="kit-comp-img"></div>'}
  <span class="kit-comp-name" onclick="_kitCompPopover(${item.id},event)" style="cursor:pointer" title="Ver producto">${item.name}</span>
  <span class="kit-comp-stock">${stock}</span>
  <div class="kit-comp-qty">
    <button type="button" onclick="changeKitQty(${item.id},-1)">−</button>
    <span>${item.qty}</span>
    <button type="button" onclick="changeKitQty(${item.id},1)">+</button>
  </div>
  <button type="button" class="kit-comp-remove" onclick="removeKitComponent(${item.id})" title="Quitar">✕</button>
</div>`;
  }).join('');
  _updateKitStockCalc();
}

function _updateKitStockCalc() {
  const calcEl = document.getElementById('kit-stock-calc');
  const valEl  = document.getElementById('kit-stock-val');
  if (!_kitItemsEdit.length) { if (calcEl) calcEl.style.display = 'none'; return; }
  let minStock = Infinity;
  let anyOos = false;
  for (const comp of _kitItemsEdit) {
    const p = products.find(x => x.id === comp.id);
    if (!p || p.outOfStock || p.stock === 0) { anyOos = true; break; }
    const avail = Math.floor(p.stock / comp.qty);
    if (avail < minStock) minStock = avail;
  }
  const final = anyOos ? 0 : (minStock === Infinity ? 0 : minStock);
  if (calcEl) calcEl.style.display = '';
  if (valEl) {
    valEl.textContent = final === 0 ? '0 (algún componente agotado)' : `${final} kit${final !== 1 ? 's' : ''}`;
    valEl.style.color = final === 0 ? 'var(--red)' : final <= 2 ? 'var(--gold-dark)' : 'var(--green)';
  }
}

function searchKitProducts(query) {
  const resultsEl = document.getElementById('kit-search-results');
  if (!query.trim()) { resultsEl.style.display = 'none'; return; }
  const editingId = parseInt(document.getElementById('f-id').value) || null;
  // Coincidencia exacta de barcode → agregar componente automáticamente
  const barcodeMatch = products.find(p => p.id !== editingId && p.barcode && p.barcode === query.trim());
  if (barcodeMatch) { addKitComponent(barcodeMatch.id); return; }
  const q = query.toLowerCase();
  const matches = products.filter(p => p.id !== editingId && p.name.toLowerCase().includes(q)).slice(0, 6);
  const termEncoded = encodeURIComponent(query.trim());
  const createBtn = `
<div onclick="_kitFormCreateDraft(decodeURIComponent('${termEncoded}'))" style="cursor:pointer;padding:7px 10px;display:flex;align-items:center;gap:8px;font-size:.82rem;border-bottom:1px solid var(--border);transition:.1s" onmouseenter="this.style.background='#FFF8EE'" onmouseleave="this.style.background=''">
  <div style="width:28px;height:28px;border-radius:5px;background:var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0">➕</div>
  <div style="flex:1;min-width:0">
    <div style="font-weight:600;color:var(--gold-dark)">Crear "${query.trim()}" como borrador</div>
    <div style="color:var(--muted);font-size:.74rem">Stock 0 · Sin publicar · editar después</div>
  </div>
</div>`;
  if (!matches.length) {
    resultsEl.innerHTML = createBtn;
    resultsEl.style.display = 'block';
    return;
  }
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = matches.map(p => `
<div onclick="addKitComponent(${p.id})" style="cursor:pointer;padding:7px 10px;display:flex;align-items:center;gap:8px;font-size:.82rem;border-bottom:1px solid var(--border);transition:.1s" onmouseenter="this.style.background='#FFF8EE'" onmouseleave="this.style.background=''">
  <img src="${p.image}" style="width:28px;height:28px;object-fit:cover;border-radius:5px;flex-shrink:0" onerror="this.style.display='none'">
  <span style="flex:1;font-weight:600">${p.name}</span>
  <span style="color:var(--muted);font-size:.74rem">${p.stock > 0 && !p.outOfStock ? p.stock+' uds' : 'Agotado'}</span>
</div>`).join('') + createBtn;
}

async function _kitFormCreateDraft(name) {
  const newId = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const draft = {
    id: newId, name, category: 'por_revisar', category_label: 'Por revisar',
    price: 0, description: '', stock: 0, out_of_stock: true, is_published: false,
    featured: false, image: DEFAULT_IMG, position: products.length
  };
  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(draft)
  });
  if (!result.ok) { toast('Error al crear borrador', 'error'); return; }
  products.push({
    id: newId, name, category: 'por_revisar', categoryLabel: 'Por revisar',
    price: 0, description: '', stock: 0, outOfStock: true, isPublished: false,
    featured: false, image: DEFAULT_IMG, position: products.length - 1,
    kitItems: null
  });
  document.getElementById('kit-search').value = '';
  document.getElementById('kit-search-results').style.display = 'none';
  addKitComponent(newId);
  logActivity('producto_creado', `Borrador de kit: "${name}" — $0`, { id: newId, name, price: 0 });
  toast(`✓ "${name}" creado como borrador`);
}

function addKitComponent(productId) {
  if (_kitItemsEdit.find(i => i.id === productId)) { toast('Ya está en el kit', ''); return; }
  const p = products.find(x => x.id === productId);
  if (!p) return;
  _kitItemsEdit.push({ id: p.id, name: p.name, qty: 1, image: p.image || null });
  document.getElementById('kit-search').value = '';
  document.getElementById('kit-search-results').style.display = 'none';
  renderKitEditor();
}

function removeKitComponent(productId) {
  _kitItemsEdit = _kitItemsEdit.filter(i => i.id !== productId);
  renderKitEditor();
}

function changeKitQty(productId, delta) {
  const item = _kitItemsEdit.find(i => i.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  renderKitEditor();
}

/* ── ADDITIONAL IMAGES ── */
function _fileToBase64Resized(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderAdditionalImages() {
  const strip = document.getElementById('additional-images-strip');
  if (!strip) return;
  if (!_additionalImagesEdit.length) {
    strip.innerHTML = '<span style="font-size:.73rem;color:var(--muted-light);line-height:1.4;align-self:center;padding-left:2px">Sin imágenes adicionales</span>';
    return;
  }
  strip.innerHTML = _additionalImagesEdit.map((url, i) => {
    const isDrive  = url.includes('drive.google.com');
    const isBase64 = url.startsWith('data:');
    const badge = isDrive
      ? `<span title="Guardada en Drive" style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#34a853;color:#fff;font-size:.5rem;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;pointer-events:none">Drive</span>`
      : isBase64
      ? `<span title="Base64 — no subida a Drive" style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);background:#e67e22;color:#fff;font-size:.5rem;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;pointer-events:none">Base64</span>`
      : '';
    return `
<div draggable="true" data-ai="${i}"
  style="position:relative;flex-shrink:0;margin-bottom:8px;cursor:grab;transition:opacity .15s,outline .15s"
  ondragstart="_aiDragStart(event,${i})"
  ondragover="_aiDragOver(event,${i})"
  ondragleave="_aiDragLeave(event)"
  ondrop="_aiDrop(event,${i})"
  ondragend="_aiDragEnd()">
  <img src="${url}" style="width:72px;height:72px;object-fit:contain;border-radius:8px;border:1px solid var(--border);background:#F7F2EB;display:block;pointer-events:none" onerror="this.style.opacity='.3'">
  <button type="button" onclick="removeAdditionalImage(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--red);color:#fff;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.25)">✕</button>
  ${badge}
</div>`;
  }).join('');
}

function removeAdditionalImage(idx) {
  _additionalImagesEdit.splice(idx, 1);
  renderAdditionalImages();
}

let _aiDragSrc = null;
function _aiDragStart(e, idx) {
  _aiDragSrc = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const el = document.querySelector(`[data-ai="${idx}"]`); if (el) el.style.opacity = '.35'; }, 0);
}
function _aiDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('[data-ai]').forEach(el => el.style.outline = '');
  if (idx !== _aiDragSrc) {
    const el = document.querySelector(`[data-ai="${idx}"]`);
    if (el) el.style.outline = '2px solid var(--gold)';
  }
}
function _aiDragLeave(e) {
  e.currentTarget.style.outline = '';
}
function _aiDrop(e, idx) {
  e.preventDefault();
  if (_aiDragSrc === null || _aiDragSrc === idx) return;
  const moved = _additionalImagesEdit.splice(_aiDragSrc, 1)[0];
  _additionalImagesEdit.splice(idx, 0, moved);
  renderAdditionalImages();
}
function _aiDragEnd() {
  _aiDragSrc = null;
  document.querySelectorAll('[data-ai]').forEach(el => { el.style.opacity = ''; el.style.outline = ''; });
}

async function addAdditionalImageUrl() {
  const inp = document.getElementById('add-img-url-input');
  const url = inp?.value.trim();
  if (!url) return;
  if (_additionalImagesEdit.length >= 5) { toast('Máximo 5 imágenes adicionales', ''); return; }
  _additionalImagesEdit.push(url);
  inp.value = '';
  renderAdditionalImages();
}

async function handleAdditionalImageFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const addBtn = document.getElementById('add-img-file-btn');
  if (addBtn) { addBtn.textContent = '⏳ Subiendo…'; addBtn.disabled = true; }
  if (_additionalImagesEdit.length >= 5) { toast('Máximo 5 imágenes adicionales', ''); input.value = ''; return; }
  try {
    const base64 = await _fileToBase64Resized(file);
    let url = base64;
    if (driveEp && driveSecret) {
      const driveResult = await uploadToDrive(base64);
      if (driveResult) url = driveResult;
    }
    _additionalImagesEdit.push(url);
    renderAdditionalImages();
  } catch {
    toast('Error al procesar la imagen', 'error');
  } finally {
    if (addBtn) { addBtn.textContent = '📁 Desde galería'; addBtn.disabled = false; }
    input.value = '';
  }
}

/* ── DELETE ── */
function askDelete(id) {
  if (!can.deleteProduct) { toast('Solo el administrador puede eliminar productos', 'error'); return; }
  deleteTargetId = id;
  document.getElementById('del-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDel() {
  deleteTargetId = null;
  document.getElementById('del-overlay').classList.remove('open');
  document.body.style.overflow = '';
  const btn = document.getElementById('del-confirm-btn');
  if (btn) setBtn(btn, false);
}

async function confirmDelete() {
  if (deleteTargetId === null) return;
  const id = deleteTargetId;
  const btn = document.getElementById('del-confirm-btn');
  setBtn(btn, true, 'Eliminando...');

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' }
  });
  if (!result.ok) {
    setBtn(btn, false);
    const msg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
    toast('Error al eliminar: ' + msg, 'error');
    closeDel();
    return;
  }

  const deleted = products.find(p => p.id === id);
  const deletedIdx = products.findIndex(p => p.id === id);
  if (deleted) logActivity('producto_eliminado', `Eliminó "${deleted.name}"`, { id, name: deleted.name, price: deleted.price });

  products = products.filter(p => p.id !== id);
  selectedIds.delete(id);
  if (_qvCurrentId === id) closeQV();
  setBtn(btn, false);
  closeDel();
  renderTable();
  renderStats();
  updateBulkBar();

  // Toast con opción de deshacer (7 segundos)
  toastUndo(`"${truncName(deleted?.name || 'Producto')}" eliminado`, async () => {
    if (!deleted) return;
    const r = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: deleted.id, name: deleted.name, category: deleted.category,
        category_label: deleted.categoryLabel, price: deleted.price,
        description: deleted.description, image: deleted.image,
        badge: deleted.badge, badge_type: deleted.badgeType,
        featured: deleted.featured, out_of_stock: deleted.outOfStock,
        original_price: deleted.originalPrice, barcode: deleted.barcode,
        stock: deleted.stock, position: deletedIdx
      })
    });
    if (r.ok) {
      products.splice(deletedIdx, 0, deleted);
      renderTable();
      renderStats();
      toast(`"${truncName(deleted.name)}" restaurado ✓`, 'success');
    }
  }, () => {
    const fileId = _driveFileId(deleted?.image);
    if (fileId) _deleteDriveFile(fileId);
  });
}

/* ── SAVE — batch upsert (usado para reorder e import) ── */
async function save() {
  if (!products.length) return true;

  const payload = products.map((p, i) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    category_label: p.categoryLabel,
    price: p.price,
    description: p.description,
    image: p.image,
    badge: p.badge,
    badge_type: p.badgeType,
    featured: p.featured,
    out_of_stock: p.outOfStock,
    original_price: p.originalPrice,
    barcode: p.barcode ?? null,
    stock: p.stock ?? 0,
    position: i
  }));

  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    const errMsg = result.data?.message || result.data?.hint || result.data?.details || `HTTP ${result.status}`;
    toast(`Error al guardar: ${errMsg}`, 'error');
    console.error('Supabase save error:', result.status, result.data);
    return false;
  }
  return true;
}

/* ── MOVER AL INICIO ── */

async function moveToTop(id) {
  const idx = products.findIndex(p => p.id === id);
  if (idx <= 0) { toast('Ya está al inicio del catálogo'); return; }
  const [p] = products.splice(idx, 1);
  products.unshift(p);
  const ok = await save();
  if (!ok) { products.splice(0, 1); products.splice(idx, 0, p); return; }
  _forcePositionSort();
  renderTable();
  _qvRefresh(id);
  toast('📌 Movido al inicio del catálogo');
}

async function bulkMoveToTop() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  const rest     = products.filter(p => !selectedIds.has(p.id));
  products.length = 0;
  products.push(...selected, ...rest);
  const ok = await save();
  if (!ok) { return; }
  _forcePositionSort();
  renderTable();
  toast(`📌 ${selected.length} producto${selected.length > 1 ? 's movidos' : ' movido'} al inicio`);
}

function _forcePositionSort() {
  currentSort = 'position';
  const sel = document.getElementById('sort-select');
  if (sel) sel.value = 'position';
}

/* ── BULK ACTIONS ── */

async function bulkRestock() {
  if (!selectedIds.size) return;
  const input = prompt(`¿Cuántas unidades agregar a los ${selectedIds.size} producto(s) seleccionado(s)?`);
  if (input === null) return;
  const qty = parseInt(input);
  if (!qty || qty <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }

  const selected = products.filter(p => selectedIds.has(p.id));
  for (const p of selected) {
    const newStock = (p.stock || 0) + qty;
    const result = await supabaseApi(`products?id=eq.${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ stock: newStock, out_of_stock: false })
    });
    if (result.ok) { p.stock = newStock; p.outOfStock = false; }
  }
  renderTable(); renderStats();
  toast(`+${qty} unidades agregadas a ${selectedIds.size} producto(s) ✓`, 'success');
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`¿Eliminar ${selectedIds.size} producto(s) seleccionado(s)?\nEsta acción no se puede deshacer.`)) return;

  const toDelete = products.filter(p => selectedIds.has(p.id));

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    });
    if (!result.ok) {
      const msg = result.data?.message || `HTTP ${result.status}`;
      toast('Error al eliminar: ' + msg, 'error');
      return;
    }
  }

  toDelete.forEach(p => { const fid = _driveFileId(p.image); if (fid) _deleteDriveFile(fid); });
  products = products.filter(p => !selectedIds.has(p.id));
  if (_qvCurrentId && !products.find(p => p.id === _qvCurrentId)) closeQV();
  selectedIds.clear();
  document.getElementById('products-card-grid')?.classList.remove('selection-active');
  renderTable();
  renderStats();
  updateBulkBar();
  toast('Productos eliminados', 'success');
}

let _bcpFormMode = false;
let _bcpKitMode  = false;

function openFormCatPicker() {
  _bcpFormMode = true;
  document.getElementById('bcp-sub').textContent = 'Categoría del producto';
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openKitCatPicker() {
  _bcpKitMode = true;
  document.getElementById('bcp-sub').textContent = 'Categoría del kit';
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _updateKitCatBtn(code) {
  const cat = categories.find(c => c.code === code);
  const dot = document.getElementById('kb-cat-dot');
  const lbl = document.getElementById('kb-cat-label-display');
  if (!dot || !lbl) return;
  dot.style.background = cat?.color || '#9B8B78';
  lbl.textContent = cat?.label || code || 'Seleccionar categoría';
}

function _updateFormCatBtn(code) {
  const cat = categories.find(c => c.code === code);
  const dot = document.getElementById('f-cat-dot');
  const lbl = document.getElementById('f-cat-label-display');
  if (!dot || !lbl) return;
  dot.style.background = cat?.color || '#9B8B78';
  lbl.textContent = cat?.label || code || 'Seleccionar categoría';
}

function bulkSetCategory() {
  if (!selectedIds.size) return;
  _bcpFormMode = false;
  document.getElementById('bcp-sub').textContent = `${selectedIds.size} producto${selectedIds.size > 1 ? 's' : ''} seleccionado${selectedIds.size > 1 ? 's' : ''}`;
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBulkCatPicker() {
  _bcpFormMode = false;
  _bcpKitMode  = false;
  _bcpInlineId = null;
  document.getElementById('bulk-cat-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function _bcpFilter(q) {
  const term = (q || '').toLowerCase();
  const roots = categories.filter(c => !c.parent);
  const list  = document.getElementById('bcp-list');
  let html = '';

  for (const root of roots) {
    const subs = categories.filter(c => c.parent === root.code);
    const all  = [root, ...subs];
    const visible = term ? all.filter(c => c.label.toLowerCase().includes(term) || c.code.includes(term)) : all;
    if (!visible.length) continue;

    if (!term) {
      html += `<div class="bcp-group-label">${root.label}</div><div class="bcp-chips">`;
      html += `<button class="bcp-chip" onclick="_bcpSelect('${root.code}')"><span class="bcp-dot" style="background:${root.color||'#9B8B78'}"></span>${root.label}</button>`;
      subs.forEach(s => {
        html += `<button class="bcp-chip bcp-sub-chip" onclick="_bcpSelect('${s.code}')"><span class="bcp-dot" style="background:${s.color||root.color||'#9B8B78'}"></span>${s.label}</button>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="bcp-chips" style="margin-bottom:8px">`;
      visible.forEach(c => {
        html += `<button class="bcp-chip" onclick="_bcpSelect('${c.code}')"><span class="bcp-dot" style="background:${c.color||'#9B8B78'}"></span>${c.label}</button>`;
      });
      html += `</div>`;
    }
  }
  if (!html) {
    const label = q.trim();
    _bcpPendingLabel = label;
    list.innerHTML = `
      <p style="color:var(--muted);font-size:.85rem;text-align:center;padding:16px 0 10px">Sin resultados para "<strong>${label}</strong>"</p>
      <div style="display:flex;flex-direction:column;gap:10px;padding:0 8px 8px">
        <button onclick="_bcpCreateAndSelect(null)"
          style="background:var(--charcoal);color:#fff;border:none;border-radius:10px;padding:11px 20px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation">
          + Crear "${label}" como categoría
        </button>
        <button onclick="_bcpToggleParentPicker(this)"
          style="background:transparent;color:var(--charcoal);border:1.5px solid var(--border);border-radius:10px;padding:11px 20px;font-size:.88rem;font-weight:600;cursor:pointer;font-family:inherit;touch-action:manipulation">
          + Crear "${label}" como subcategoría de…
        </button>
        <div id="bcp-parent-picker" style="display:none;padding-top:4px"></div>
      </div>`;
  } else {
    list.innerHTML = html;
  }
}

let _bcpPendingLabel = '';

function _bcpToggleParentPicker(btn) {
  const picker = document.getElementById('bcp-parent-picker');
  if (!picker) return;
  if (picker.style.display !== 'none') {
    picker.style.display = 'none';
    btn.style.borderColor = '';
    return;
  }
  const roots = categories.filter(c => !c.parent);
  if (!roots.length) { toast('No hay categorías para usar como padre', 'error'); return; }
  picker.innerHTML = `
    <p style="font-size:.8rem;color:var(--muted);margin-bottom:8px;text-align:center">Elige la categoría padre:</p>
    <div class="bcp-chips" style="justify-content:center">
      ${roots.map(r => `<button class="bcp-chip" onclick="_bcpCreateAndSelect('${r.code}')">
        <span class="bcp-dot" style="background:${r.color||'#9B8B78'}"></span>${r.label}
      </button>`).join('')}
    </div>`;
  picker.style.display = 'block';
  btn.style.borderColor = 'var(--gold)';
}

async function _bcpCreateAndSelect(parentCode = null) {
  const label = _bcpPendingLabel.trim();
  if (!label) return;
  const prefix = parentCode ? parentCode + '_' : '';
  const code = (prefix + label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,''));
  if (categories.find(c => c.code === code)) {
    return _bcpSelect(code);
  }
  const parent = parentCode ? categories.find(c => c.code === parentCode) : null;
  const color = parent ? parent.color : CAT_PALETTE[categories.length % CAT_PALETTE.length];
  const newCat = { code, label, color };
  if (parentCode) newCat.parent = parentCode;
  categories.push(newCat);
  await _saveCategories();
  renderCategorySelects();
  populateCatParentSelect();
  const suffix = parent ? ` en ${parent.label}` : '';
  toast(`Categoría "${label}"${suffix} creada ✓`, 'success');
  _bcpSelect(code);
}

async function _bcpSelect(code) {
  const cat = categories.find(c => c.code === code);
  if (!cat) return;

  if (_bcpFormMode) {
    closeBulkCatPicker();
    const sel = document.getElementById('f-category');
    if (sel) sel.value = cat.code;
    const lblInput = document.getElementById('f-category-label');
    if (lblInput) lblInput.value = cat.label;
    _updateFormCatBtn(cat.code);
    return;
  }

  if (_bcpKitMode) {
    closeBulkCatPicker();
    _kbSelectedCatCode = cat.code;
    _updateKitCatBtn(cat.code);
    document.body.style.overflow = 'hidden'; // restaurar lock del kit builder
    return;
  }

  if (_bcpInlineId !== null) {
    const inlineId = _bcpInlineId;
    closeBulkCatPicker();
    const p = products.find(x => x.id === inlineId);
    if (!p || p.category === cat.code) { renderTable(); _qvRefresh(inlineId); return; }
    supabaseApi(`products?id=eq.${inlineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: cat.code, category_label: cat.label })
    }).then(r => {
      if (r.ok) {
        p.category = cat.code; p.categoryLabel = cat.label;
        // Si el filtro activo era "Sin categoría" y el producto ya tiene categoría, limpiarlo
        // para que el producto quede visible en lugar de desaparecer de la vista
        if (_statFilter === 'sin-categ' && cat.code !== 'por_revisar') _statFilter = null;
        toast(`Categoría → ${cat.label}`);
      } else toast('Error al actualizar categoría', 'error');
      renderTable(); renderStats(); _qvRefresh(inlineId);
    });
    return;
  }

  closeBulkCatPicker();

  const ids = [...selectedIds].join(',');
  const result = await supabaseApi(`products?id=in.(${ids})`, {
    method: 'PATCH',
    body: JSON.stringify({ category: cat.code, category_label: cat.label })
  });
  if (!result.ok) { toast('Error al actualizar categoría', 'error'); return; }

  products.forEach(p => {
    if (selectedIds.has(p.id)) { p.category = cat.code; p.categoryLabel = cat.label; }
  });
  renderTable(); renderStats();
  toast(`● ${cat.label} → ${selectedIds.size} producto${selectedIds.size > 1 ? 's' : ''}`, '');
}

async function bulkToggleFeatured() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  // Si todos son destacados → quitar. En cualquier otro caso → destacar todos.
  const newVal = !selected.every(p => p.featured);

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ featured: newVal })
    });
    if (!result.ok) {
      toast('Error al actualizar destacados', 'error');
      return;
    }
  }

  selected.forEach(p => { p.featured = newVal; });
  renderTable();
  renderStats();
  toast(newVal ? `${selectedIds.size} producto(s) marcados como destacados ⭐` : `Destacado removido de ${selectedIds.size} producto(s)`, 'success');
}

async function bulkToggleOOS() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  const newVal = !selected.every(p => p.outOfStock);

  if (getSupabaseUrl()) {
    // PATCH base: cambiar out_of_stock para todos
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ out_of_stock: newVal })
    });
    if (!result.ok) { toast('Error al actualizar estado de stock', 'error'); return; }

    // Al marcar disponible: los que tenían stock=0 reciben stock=1 (igual que toggleOutOfStock individual)
    if (!newVal) {
      const needStock = selected.filter(p => p.stock === 0);
      for (const p of needStock) {
        await supabaseApi(`products?id=eq.${p.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ stock: 1 })
        });
        p.stock = 1;
      }
    }
  }

  selected.forEach(p => { p.outOfStock = newVal; });
  renderTable();
  renderStats();
  toast(newVal
    ? `${selectedIds.size} producto(s) marcados como agotados`
    : `${selectedIds.size} producto(s) marcados como disponibles`, 'success');
}

async function bulkSetBadge() {
  if (!selectedIds.size) return;
  const badge = prompt(`Insignia para ${selectedIds.size} producto(s) (vacío para quitar):`);
  if (badge === null) return;
  const finalBadge = badge.trim() || null;

  let finalType = null;
  if (finalBadge) {
    const typeInput = prompt('Tipo de color:\n  best  → Dorada\n  new   → Negra\n  promo → Roja\n  natura→ Verde\n\nEscribe el tipo:');
    if (typeInput === null) return;
    finalType = ['best','new','promo','natura'].includes(typeInput.trim()) ? typeInput.trim() : null;
  }

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ badge: finalBadge, badge_type: finalType })
    });
    if (!result.ok) {
      toast('Error al actualizar insignia', 'error');
      return;
    }
  }

  products.forEach(p => {
    if (selectedIds.has(p.id)) { p.badge = finalBadge; p.badgeType = finalType; }
  });
  renderTable();
  toast(finalBadge
    ? `Insignia "${finalBadge}" aplicada a ${selectedIds.size} producto(s)`
    : `Insignias eliminadas de ${selectedIds.size} producto(s)`, 'success');
}

async function bulkTogglePublish() {
  if (!selectedIds.size) return;
  if (!can.publishProduct) { toast('Sin permiso para publicar productos', 'error'); return; }
  const selected = products.filter(p => selectedIds.has(p.id));
  // Si todos están publicados → ocultar; si alguno no lo está → publicar todos
  const newVal = !selected.every(p => p.isPublished !== false);
  if (newVal) {
    const agotados = selected.filter(p => p.outOfStock).length;
    if (agotados > 0 && !confirm(`${agotados} producto(s) están agotados y no aparecerán en el sitio web aunque se publiquen.\n\n¿Continuar?`)) return;
  }
  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ is_published: newVal })
    });
    if (!result.ok) { toast('Error al actualizar visibilidad', 'error'); return; }
  }
  selected.forEach(p => { p.isPublished = newVal; });
  renderTable();
  renderStats();
  toast(newVal
    ? `${selectedIds.size} producto(s) publicados en sitio web 🌐`
    : `${selectedIds.size} producto(s) ocultados del sitio web 🙈`, 'success');
}

function bulkExport() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tres-encantos-seleccion-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast(`${selected.length} producto(s) exportados ✓`, 'success');
}

/* ── EXPORT / IMPORT ── */
function exportProducts() {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tres-encantos-productos-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importProducts(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const raw = JSON.parse(e.target.result);
      if (!Array.isArray(raw) || !raw.length) {
        toast('Archivo inválido o vacío', 'error');
        return;
      }

      // Normalizar — acepta camelCase (export del admin) y snake_case (export de Supabase)
      const imported = raw.map((p, i) => ({
        id: p.id,
        name: p.name || '',
        category: p.category || 'bolsos',
        categoryLabel: p.categoryLabel || p.category_label || getCatLabel(p.category) || '',
        price: Number(p.price) || 0,
        originalPrice: p.originalPrice ?? p.original_price ?? null,
        description: p.description || '',
        image: p.image || '',
        badge: p.badge || null,
        badgeType: p.badgeType || p.badge_type || null,
        featured: Boolean(p.featured),
        outOfStock: Boolean(p.outOfStock ?? p.out_of_stock),
        position: p.position ?? i
      }));

      const newCount    = imported.filter(p => !products.find(x => x.id === p.id)).length;
      const updateCount = imported.length - newCount;

      const lines = [`Importar ${imported.length} producto(s) del archivo:`];
      if (newCount)    lines.push(`  • ${newCount} nuevo(s) se agregarán`);
      if (updateCount) lines.push(`  • ${updateCount} existente(s) se actualizarán`);
      lines.push('\nLos productos que no están en el archivo se conservarán.');
      if (!confirm(lines.join('\n'))) return;

      toast(`Importando ${imported.length} productos...`, '');

      // Upsert solo los productos del archivo — los demás permanecen intactos en Supabase
      const payload = imported.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        category_label: p.categoryLabel,
        price: p.price,
        description: p.description,
        image: p.image,
        badge: p.badge,
        badge_type: p.badgeType,
        featured: p.featured,
        out_of_stock: p.outOfStock,
        original_price: p.originalPrice,
        position: p.position
      }));

      const result = await supabaseApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload)
      });

      if (!result.ok) {
        const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
        toast(`Error al importar: ${errMsg}`, 'error');
        console.error('Import error:', result.status, result.data);
        return;
      }

      // Merge en el array local: actualizar existentes + agregar nuevos al final
      const merged = [...products];
      for (const p of imported) {
        const idx = merged.findIndex(x => x.id === p.id);
        if (idx > -1) merged[idx] = p;
        else merged.push(p);
      }
      products = merged;

      selectedIds.clear();
      renderTable();
      renderStats();
      updateBulkBar();
      const summary = [
        newCount    ? `${newCount} agregado(s)` : '',
        updateCount ? `${updateCount} actualizado(s)` : ''
      ].filter(Boolean).join(', ');
      toast(`Importación completa: ${summary} ✓`, 'success');
    } catch {
      toast('Archivo inválido. Usa un JSON exportado de esta página.', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

/* ── BARCODE SCANNER ── */
let _scanCtx = null;
let _scanInst = null;
let _quaggaActive = false;
let _quaggaDetected = false;

function _loadQuagga() {
  return new Promise((resolve, reject) => {
    if (window.Quagga) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@ericblade/quagga2/dist/quagga.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function openFormScanner() {
  TE?.track('scan_form');
  _scanCtx = 'form';
  document.getElementById('scanner-title').textContent = 'Escanear código de barras';
  _launchScanner();
}

function openCapScanner() {
  _scanCtx = 'capture';
  document.getElementById('scanner-title').textContent = 'Escanear código de barras';
  _launchScanner();
}

function openSearchScanner() {
  _scanCtx = 'search';
  TE?.track('scan_search');
  document.getElementById('scanner-title').textContent = 'Buscar producto por código';
  _launchScanner();
}

function openKitScanner() {
  _scanCtx = 'kb';
  document.getElementById('scanner-title').textContent = 'Escanear componente del kit';
  _launchScanner();
}

async function _launchScanner() {
  document.getElementById('scanner-status').textContent = 'Iniciando cámara...';
  document.getElementById('scanner-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (isIOS) {
    if (_scanInst) { _scanInst.stop().catch(() => {}); _scanInst = null; }
    try { await _loadQuagga(); } catch(e) {
      document.getElementById('scanner-status').textContent = 'No se pudo cargar el escáner.';
      return;
    }
    _quaggaDetected = false;
    _quaggaActive = true;
    Quagga.init({
      inputStream: { name: 'Live', type: 'LiveStream',
        target: document.getElementById('scanner-reader'),
        constraints: { facingMode: { ideal: 'environment' } }
      },
      locator: { patchSize: 'medium', halfSample: true },
      numOfWorkers: 0, frequency: 15,
      decoder: { readers: ['ean_reader','ean_8_reader','code_128_reader','upc_reader','upc_e_reader'] },
      locate: true
    }, (err) => {
      if (err) {
        document.getElementById('scanner-status').textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
        _quaggaActive = false; return;
      }
      Quagga.start();
      document.getElementById('scanner-status').textContent = 'Apunta al código de barras';
      Quagga.onDetected((result) => {
        if (_quaggaDetected) return;
        const code = result.codeResult?.code;
        if (code) { _quaggaDetected = true; _onAdminScan(code); }
      });
    });
  } else {
    if (_scanInst) { _scanInst.clear().catch(() => {}); _scanInst = null; }
    const barcodeFormats = [
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,   Html5QrcodeSupportedFormats.QR_CODE,
    ];
    _scanInst = new Html5Qrcode('scanner-reader', { formatsToSupport: barcodeFormats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    _scanInst.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 100 } },
      (code) => { _onAdminScan(code); },
      () => {}
    ).then(() => {
      document.getElementById('scanner-status').textContent = 'Apunta al código de barras';
    }).catch(() => {
      document.getElementById('scanner-status').textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
    });
  }
}

function closeAdminScanner() {
  if (_quaggaActive && window.Quagga) {
    Quagga.offDetected();
    Promise.resolve(Quagga.stop()).catch(() => {});
    _quaggaActive = false;
  }
  if (_scanInst) { _scanInst.stop().catch(() => {}); _scanInst = null; }
  document.getElementById('scanner-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── DETECCIÓN DE DUPLICADOS ── */
function _normStr(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

// Constantes fuera de la función — no se recrean en cada llamada
const _DUP_STOP = new Set(['de','la','el','los','las','un','una','y','con','para','en','del','al']);
const _stem = w => w.endsWith('es') && w.length > 4 ? w.slice(0,-2) : w.endsWith('s') && w.length > 3 ? w.slice(0,-1) : w;
function _productWords(name) {
  return new Set(_normStr(name).split(' ').filter(w => w.length > 1 && !_DUP_STOP.has(w)).map(_stem));
}
function _wordSim(a, b) {
  const wa = _productWords(a), wb = _productWords(b);
  if (!wa.size || !wb.size) return 0;
  return [...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size);
}

function checkBarcodeConflict() {
  const warn = document.getElementById('f-barcode-warn');
  const code = document.getElementById('f-barcode').value.trim();
  const editingId = parseInt(document.getElementById('f-id').value) || null;
  warn.style.display = 'none';
  if (!code) return;
  const conflict = products.find(p => p.barcode === code && p.id !== editingId);
  if (!conflict) return;
  warn.className = 'dup-warn error';
  warn.innerHTML = `⛔ Este código ya está en <strong>${conflict.name}</strong> — <button type="button" class="dup-link" onclick="closeForm();openForm(${conflict.id})">Ver producto →</button>`;
  warn.style.display = 'block';
}

function checkNameSimilarity() {
  const warn = document.getElementById('f-name-warn');
  const name = document.getElementById('f-name').value.trim();
  const editingId = parseInt(document.getElementById('f-id').value) || null;
  warn.style.display = 'none';
  if (name.length < 4) return;
  const normName = _normStr(name);
  const price = parseFloat(document.getElementById('f-price').value) || null;
  const stock = parseInt(document.getElementById('f-stock').value);

  const formBarcode = document.getElementById('f-barcode')?.value.trim();
  const scored = products.filter(p => {
    if (p.id === editingId) return false;
    // Códigos de barras distintos → productos claramente diferentes
    if (formBarcode && p.barcode && formBarcode !== p.barcode) return false;
    return true;
  }).map(p => {
    const exact = _normStr(p.name) === normName;
    const sim = exact ? 1 : _wordSim(name, p.name);
    const priceMatch = price && p.price === price;
    const stockMatch = !isNaN(stock) && stock >= 2 && p.stock === stock;
    const score = sim + (priceMatch ? 0.25 : 0) + (stockMatch ? 0.15 : 0);
    return { p, sim, score, exact, priceMatch, stockMatch };
  }).filter(({sim, score}) => sim >= 0.55 && score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return;
  const { p: top, exact: isExact, priceMatch, stockMatch } = scored[0];
  const signals = [];
  if (priceMatch) signals.push(`mismo precio ($${top.price.toLocaleString('es-MX')})`);
  if (stockMatch) signals.push(`mismo stock (${top.stock})`);
  window._simIds = scored.map(({p}) => p.id);
  const links = scored.map(({p}, i) =>
    `<button type="button" class="dup-link" onclick="openSimilarModal(${i})">${p.name} →</button>`
  ).join('  ');
  const signalText = signals.length
    ? ` <span style="opacity:.75;font-size:.85em">(${signals.join(', ')})</span>` : '';
  warn.className = 'dup-warn' + (isExact ? ' error' : '');
  warn.innerHTML = isExact
    ? `⛔ Ya existe un producto con ese nombre: ${links}`
    : `⚠️ Nombre similar${signalText}: ${links}`;
  warn.style.display = 'block';
}

function _clearDupWarnings() {
  ['f-name-warn', 'f-barcode-warn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

/* ── REVISIÓN DE DUPLICADOS (escaneo automático al cargar) ─────────────── */
const _DUP_DISMISS_KEY = 'te_dismissed_dups';
let _dismissedDupsCache = null; // null = aún no cargado desde Supabase

function _getDismissedDups() {
  if (_dismissedDupsCache !== null) return _dismissedDupsCache;
  // Fallback a localStorage mientras se carga (o si Supabase falló)
  try { return new Set(JSON.parse(localStorage.getItem(_DUP_DISMISS_KEY) || '[]')); }
  catch { return new Set(); }
}
function _saveDismissedDups(set) {
  _dismissedDupsCache = set;
  localStorage.setItem(_DUP_DISMISS_KEY, JSON.stringify([...set]));
  // Persiste en Supabase para sincronizar entre dispositivos
  supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'dismissed_dups', value: JSON.stringify([...set]) })
  });
}

function _findDuplicatePairs() {
  const dismissed  = _getDismissedDups();
  const productMap = new Map(products.map(p => [p.id, p]));

  // Pre-computar palabras significativas de cada producto (una sola vez)
  const wordSets = new Map(products.map(p => [p.id, _productWords(p.name)]));

  // Índice: palabra → lista de IDs (solo pares que comparten al menos 1 palabra)
  const wordIndex = Object.create(null);
  products.forEach(p => {
    wordSets.get(p.id).forEach(w => {
      if (!wordIndex[w]) wordIndex[w] = [];
      wordIndex[w].push(p.id);
    });
  });

  // Índice de barcodes para detectar coincidencias exactas
  const barcodeIndex = Object.create(null);
  products.forEach(p => {
    if (p.barcode) {
      if (!barcodeIndex[p.barcode]) barcodeIndex[p.barcode] = [];
      barcodeIndex[p.barcode].push(p.id);
    }
  });

  // Índice de imágenes para detectar misma foto (sin necesidad de compartir palabras)
  const imageIndex = Object.create(null);
  const imageFreq  = Object.create(null); // frecuencia de cada URL
  products.forEach(p => {
    if (p.image) {
      imageFreq[p.image] = (imageFreq[p.image] || 0) + 1;
      if (!imageIndex[p.image]) imageIndex[p.image] = [];
      imageIndex[p.image].push(p.id);
    }
  });
  // URLs que aparecen en 3+ productos = imagen genérica (logo, bolsa regalo…) — no es señal de duplicado
  const isGenericImg = url => !url || url === DEFAULT_IMG || (imageFreq[url] || 0) >= 3;

  const seen  = new Set();
  const pairs = [];

  const evalPair = (a, b) => {
    const pairKey = `${Math.min(a.id, b.id)}_${Math.max(a.id, b.id)}`;
    if (seen.has(pairKey) || dismissed.has(pairKey)) return;
    seen.add(pairKey);
    if (a.barcode && b.barcode && a.barcode !== b.barcode) return;

    const barcodeMatch = !!(a.barcode && b.barcode && a.barcode === b.barcode);
    const imageMatch   = !!(a.image && b.image && a.image === b.image && !isGenericImg(a.image));
    const wa = wordSets.get(a.id), wb = wordSets.get(b.id);
    const inter = wa && wb ? [...wa].filter(w => wb.has(w)).length : 0;
    const nameSim = (wa?.size && wb?.size) ? inter / Math.max(wa.size, wb.size) : 0;
    const exact = nameSim === 1 || _normStr(a.name) === _normStr(b.name);
    const priceMatch = a.price > 0 && a.price === b.price;
    const stockMatch = a.stock >= 2 && a.stock === b.stock;
    const catMatch   = !!(a.category && a.category === b.category);
    const score = (barcodeMatch ? 1 : 0) + (imageMatch ? 0.8 : 0) + nameSim
                + (priceMatch ? 0.25 : 0) + (stockMatch ? 0.15 : 0) + (catMatch ? 0.1 : 0);
    if (!barcodeMatch && !imageMatch && !(nameSim >= 0.55 && score >= 0.55)) return;

    const signals = [];
    if (barcodeMatch) signals.push('mismo código de barras');
    if (imageMatch)   signals.push('misma imagen');
    if (exact) signals.push('nombre idéntico');
    else if (nameSim >= 0.55) signals.push('nombre similar');
    if (priceMatch) signals.push(`precio $${a.price.toLocaleString('es-MX')}`);
    if (stockMatch) signals.push(`stock ${a.stock}`);
    pairs.push({ a, b, score, signals, pairKey });
  };

  // Solo comparar productos que comparten palabras
  Object.values(wordIndex).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = productMap.get(ids[i]), b = productMap.get(ids[j]);
        if (a && b) evalPair(a, b);
      }
  });

  // Barcodes iguales (aunque no compartan palabras en el nombre)
  Object.values(barcodeIndex).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = productMap.get(ids[i]), b = productMap.get(ids[j]);
        if (a && b) evalPair(a, b);
      }
  });

  // Imágenes iguales (aunque no compartan palabras ni barcode)
  Object.values(imageIndex).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = productMap.get(ids[i]), b = productMap.get(ids[j]);
        if (a && b) evalPair(a, b);
      }
  });

  return pairs.sort((x, y) => y.score - x.score);
}

function _updateDupBadge() { /* desactivado — solo corre al abrir Revisión de duplicados */ }

function _dismissDupBanner() {
  const pairs = _findDuplicatePairs();
  localStorage.setItem('te_dup_dismiss', pairs.length);
  const banner = document.getElementById('dup-banner');
  if (banner) banner.style.display = 'none';
}

function openDupReview() {
  _renderDupReview();
  document.getElementById('dup-review-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDupReview() {
  document.getElementById('dup-review-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function _openFormFromDup(id) {
  _returnToDupReview = true;
  closeDupReview();
  openForm(id);
}

function _openFormFromKitQV(compId) {
  const kitId = _qvCurrentId;
  _returnToKitQVId = kitId;
  document.getElementById('kit-comp-popup')?.remove();
  closeQV();
  openForm(compId);
}

function _backToKit() {
  if (_formIsDirty()) {
    if (!confirm('Tienes cambios sin guardar en el componente. ¿Volver al kit sin guardar?')) return;
  }
  _formSnapshot = null;
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
  _clearDupWarnings();
  const b = document.getElementById('form-kit-banner'); if (b) b.style.display = 'none';
  const id = _returnToKitId; _returnToKitId = null;
  if (id) { _scrollToKitOnOpen = true; setTimeout(() => openForm(id), 80); }
}

function _openFormFromKit(compId) {
  const kitId = parseInt(document.getElementById('f-id')?.value) || null;
  _returnToKitId = kitId;
  const kitName = kitId ? (products.find(x => x.id === kitId)?.name || 'kit') : 'kit';
  document.getElementById('kit-comp-popover')?.remove();
  _formSnapshot = null;
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
  _clearDupWarnings();
  openForm(compId);
  // Mostrar banner "← Volver al kit [nombre]"
  const banner = document.getElementById('form-kit-banner');
  const bannerTxt = document.getElementById('form-kit-banner-txt');
  if (banner) { banner.style.display = 'flex'; if (bannerTxt) bannerTxt.textContent = `Volver al kit: ${kitName}`; }
}

function _dupThumb(img, name) {
  return img
    ? `<img src="${img}" alt="${name}" loading="lazy">`
    : `<div class="dup-prod-ph">📦</div>`;
}

function _dupCard(p, pairKey, isMed) {
  const createdStr = p.createdAt
    ? new Date(p.createdAt).toLocaleDateString('es-MX', {day:'numeric', month:'short', year:'numeric'})
    : null;
  return `
    <div class="dup-prod">
      ${_dupThumb(p.image, p.name)}
      <div class="dup-prod-name">${p.name}</div>
      <div class="dup-prod-meta">${p.categoryLabel || '—'} · $${(p.price||0).toLocaleString('es-MX')} · Stock ${p.stock}${p.createdBy ? `<span style="margin-left:6px;color:var(--muted);font-size:.78em">· 👤 ${_userNames[p.createdBy] || p.createdBy.split('@')[0]}</span>` : ''}</div>
      ${(p.barcode || createdStr) ? `<div class="dup-prod-meta" style="margin-top:2px">${p.barcode ? `<span>🔲 ${p.barcode}</span>` : ''}${p.barcode && createdStr ? ' · ' : ''}${createdStr ? `<span>📅 ${createdStr}</span>` : ''}</div>` : ''}
      <div class="dup-prod-actions">
        <button class="btn btn-outline btn-sm" onclick="_openFormFromDup(${p.id})">${isMed ? 'Renombrar →' : 'Editar →'}</button>
        ${(!isMed && can.deleteProduct) ? `<button class="btn btn-sm" style="background:var(--red);color:#fff;border:none" onclick="_deleteDupProduct(${p.id},'${pairKey}')">Eliminar</button>` : ''}
      </div>
    </div>`;
}

function _dupRenderPair({ a, b, signals, pairKey, score }) {
  const isMed = score < 0.75;
  const cls   = isMed ? 'dup-med' : 'dup-high';
  const dot   = isMed ? 'amber' : 'red';
  return `
    <div class="dup-pair" id="dup-pair-${pairKey}">
      <div class="dup-signals-row">
        <div class="dup-signals ${cls}"><span class="dup-dot ${dot}"></span>${signals.join(' · ')}</div>
      </div>
      <div class="dup-pair-cols">${_dupCard(a, pairKey, isMed)}${_dupCard(b, pairKey, isMed)}</div>
      <button class="dup-dismiss" onclick="_dismissDupPair('${pairKey}')">
        ${isMed ? '✓ Los nombres ya son distintos — no volver a avisar' : '✓ Son productos distintos — no volver a avisar'}
      </button>
    </div>`;
}

function _renderDupReview() {
  const body = document.getElementById('dup-review-body');
  const pairs = _findDuplicatePairs();
  if (!pairs.length) {
    body.innerHTML = `<p style="text-align:center;padding:40px;color:var(--muted)">✓ Sin duplicados pendientes de revisión.</p>`;
    _updateDupBadge();
    return;
  }

  const high = pairs.filter(p => p.score >= 0.75);
  const med  = pairs.filter(p => p.score < 0.75);

  let html = '';
  if (high.length) {
    html += `<div class="dup-section-title"><span class="dup-dot red"></span>Probables duplicados — considera eliminar uno</div>`;
    html += high.map(_dupRenderPair).join('');
  }
  if (med.length) {
    html += `<div class="dup-section-title"><span class="dup-dot amber"></span>Nombres ambiguos — mejora el nombre para diferenciarlos</div>`;
    html += med.map(_dupRenderPair).join('');
  }
  body.innerHTML = html;
}

function _dismissDupPair(pairKey) {
  const set = _getDismissedDups();
  set.add(pairKey);
  _saveDismissedDups(set);
  // Buscar los nombres del par para el registro
  const [idA, idB] = pairKey.split('_').map(Number);
  const pa = products.find(p => p.id === idA), pb = products.find(p => p.id === idB);
  if (pa && pb) logActivity('duplicado_descartado',
    `Revisó y descartó par como distintos: "${pa.name}" / "${pb.name}"`,
    { id_a: idA, id_b: idB, name_a: pa.name, name_b: pb.name });
  document.getElementById(`dup-pair-${pairKey}`)?.remove();
  if (!document.querySelector('#dup-review-body .dup-pair')) {
    document.getElementById('dup-review-body').innerHTML =
      `<p style="text-align:center;padding:40px;color:var(--muted)">✓ Sin duplicados pendientes de revisión.</p>`;
  }
  _updateDupBadge();
  toast('Par descartado', 'success');
}

async function _deleteDupProduct(id, pairKey) {
  if (!can.deleteProduct) return;
  if (!confirm('¿Eliminar este producto? Tendrás 7 segundos para deshacer.')) return;
  const deleted = products.find(p => p.id === id);
  const deletedIdx = products.findIndex(p => p.id === id);
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'DELETE', headers: { 'Prefer': 'return=minimal' }
  });
  if (!result.ok) { toast('Error al eliminar', 'error'); return; }
  if (deleted) logActivity('producto_eliminado', `Eliminó "${deleted.name}" (duplicado)`, { id, name: deleted.name, price: deleted.price });
  products = products.filter(p => p.id !== id);
  selectedIds.delete(id);
  closeDupReview();
  renderTable();
  renderStats();
  _dismissDupPair(pairKey);
  toastUndo(`"${truncName(deleted?.name || 'Producto')}" eliminado`, async () => {
    if (!deleted) return;
    const r = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: deleted.id, name: deleted.name, category: deleted.category,
        category_label: deleted.categoryLabel, price: deleted.price,
        description: deleted.description, image: deleted.image,
        badge: deleted.badge, badge_type: deleted.badgeType,
        featured: deleted.featured, out_of_stock: deleted.outOfStock,
        original_price: deleted.originalPrice, barcode: deleted.barcode,
        stock: deleted.stock, position: deletedIdx, cost: deleted.cost,
        is_published: deleted.isPublished
      })
    });
    if (!r.ok) { toast('No se pudo restaurar', 'error'); return; }
    products.splice(deletedIdx, 0, deleted);
    const set = _getDismissedDups(); set.delete(pairKey); _saveDismissedDups(set);
    renderTable(); _updateDupBadge();
    toast(`"${truncName(deleted.name)}" restaurado ✓`, 'success');
  }, () => {
    const fileId = _driveFileId(deleted?.image);
    if (fileId) _deleteDriveFile(fileId);
  });
}

// SRP unificado con QV — el escaneo abre el mismo Quick View
function showScanResult(id) {
  TE?.track('scan_result', { id });
  openQV(id);
}
function clearScanResult() { closeQV(); }
function _srpRefresh(id)   { _qvRefresh(id); }

/* ── CÓDIGO LEGADO SRP — conservado por si se re-activa ── */
function _showScanResultLegacy(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  TE?.track('scan_result_legacy', { id: p.id, name: p.name });
  const fallback = DEFAULT_IMG;
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const catColor = getCatColor(p.category);

  // Imagen / galería
  const allImgs = [p.image || fallback, ...(p.images || [])].filter(Boolean);
  const imgZone = document.getElementById('srp-img-zone');
  // Sin opacidad en SRP — aquí se gestiona el producto, el estado lo muestran los chips
  if (allImgs.length > 1) {
    imgZone.innerHTML =
      `<div class="srp-gallery" id="srp-gallery" onscroll="_srpGalleryScroll(this)">
        ${allImgs.map((src, i) => `<img class="srp-gallery-img" src="${src}" alt="${p.name} ${i+1}" onerror="this.onerror=null;this.src='${fallback}'" onclick="_srpImgClick(event)">`).join('')}
      </div>
      <div class="srp-gallery-dots" id="srp-gallery-dots">
        ${allImgs.map((_,i) => `<span class="srp-gd${i===0?' active':''}" onclick="_srpGoTo(${i})"></span>`).join('')}
      </div>`;
  } else {
    imgZone.innerHTML = `<img class="srp-thumb" id="srp-img" src="${allImgs[0]}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'" onclick="_srpImgClick(event)" ondblclick="_srpImgDblClick(event)" title="Clic: ver completa · Doble clic: cambiar imagen">`;
  }
  document.getElementById('srp-cat-dot').style.background = catColor;
  document.getElementById('srp-cat-label').textContent = p.categoryLabel || '';

  // Nombre editable inline
  const nameEl = document.getElementById('srp-name');
  if (can.editProduct) {
    nameEl.innerHTML = `<span class="qv-editable" onclick="_qvEditName(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar nombre">${p.name}</span>`;
  } else {
    nameEl.textContent = p.name;
  }

  // Precio
  let priceHTML = `<span class="srp-price qv-editable" onclick="_qvEditPrice(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar precio">$${p.price.toLocaleString('es-MX')} <small style="font-size:.42em;font-weight:400;color:var(--muted)">MXN</small></span>`;
  if (p.originalPrice && p.originalPrice > p.price) {
    const pct = Math.round((1 - p.price / p.originalPrice) * 100);
    priceHTML += `<span class="srp-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="srp-disc">-${pct}%</span>`;
  }
  document.getElementById('srp-price-row').innerHTML = priceHTML;

  // Chips
  const _isBorrador = !p.kitItems?.length && !p.isPublished && (!p.price || p.price === 0);
  const _pubClick = can.publishProduct ? `onclick="_qvTogglePublished(${p.id})" ontouchstart="event.stopPropagation()" style="cursor:pointer" title="Toca para cambiar visibilidad"` : '';
  const pubChip = _isBorrador
    ? `<span class="qv-chip" style="background:#F3F4F6;color:#374151;border-color:#D1D5DB">📝 Borrador — sin precio</span>`
    : p.isPublished === false
    ? `<span class="qv-chip qv-chip-hidden" ${_pubClick}>🙈 Oculto</span>`
    : p.outOfStock ? `<span class="qv-chip qv-chip-warn">⚠️ Agotado</span>`
    : `<span class="qv-chip qv-chip-web" ${_pubClick}>🌐 Web</span>`;
  const oosChip = oos
    ? `<span class="qv-chip qv-chip-sold">⊘ Agotado</span>`
    : `<span class="qv-chip qv-chip-ok">✓ Disponible</span>`;
  // Chips adicionales — igual que QV
  const featChipSrp  = p.featured ? `<span class="qv-chip">⭐ Destacado</span>` : '';
  let marginChipSrp = '';
  if (p.cost && p.price > 0) {
    const m = Math.round((1 - p.cost / p.price) * 100);
    const mc = m >= 30 ? 'qv-chip-ok' : m >= 10 ? '' : 'qv-chip-sold';
    marginChipSrp = `<span class="qv-chip ${mc}">Margen ${m}%</span>`;
  }
  document.getElementById('srp-chips').innerHTML = oosChip + pubChip + featChipSrp + marginChipSrp;

  // Stock stepper
  _srpPendingStock = null;
  const heroEl = document.getElementById('srp-stock-hero');
  if (p.kitItems?.length) {
    heroEl.style.display = 'none';
  } else {
    const stockColor = p.stock === 0 ? 'var(--red)' : p.stock === 1 ? 'var(--gold-dark)' : 'var(--charcoal)';
    const stockStatus = p.stock === 0 ? 'Sin stock' : p.stock === 1 ? 'Última unidad' : `${p.stock} en stock`;
    heroEl.style.display = 'block';
    heroEl.className = 'srp-stock-hero';
    heroEl.onclick = null;
    heroEl.innerHTML = `
      <div class="srp-stepper-row">
        <button class="srp-step-btn" onclick="_srpStep(-1,${p.id})" ontouchstart="event.stopPropagation()">−</button>
        <span class="srp-stock-num" id="srp-stock-val" style="color:${stockColor}">${p.stock}</span>
        <button class="srp-step-btn" onclick="_srpStep(1,${p.id})" ontouchstart="event.stopPropagation()">+</button>
        <span class="srp-stock-status" id="srp-stock-status" style="margin-left:4px">${stockStatus}</span>
        <button class="srp-step-save" id="srp-step-save" onclick="_srpSaveStep(${p.id})" ontouchstart="event.stopPropagation()">Guardar</button>
      </div>`;
  }

  // Descripción editable
  const descEl = document.getElementById('srp-desc');
  const descToggleSrp = document.getElementById('srp-desc-toggle');
  descEl.classList.remove('expanded');
  if (can.editProduct) {
    descEl.style.display = '';
    descEl.innerHTML = `<span class="qv-editable" onclick="_qvEditDesc(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar">${_descHtml(p.description) || '<em style="color:var(--muted);font-style:normal;font-size:.82rem">+ Agregar descripción</em>'}</span>`;
  } else {
    descEl.innerHTML = _descHtml(p.description);
    descEl.style.display = p.description ? '' : 'none';
  }
  if (descToggleSrp) {
    setTimeout(() => {
      const overflows = descEl.scrollHeight > 84;
      descToggleSrp.style.display = overflows ? 'block' : 'none';
      descToggleSrp.textContent   = 'Ver más ↓';
      descEl.classList.toggle('expanded', !overflows);
    }, 50);
  }

  // ID + barcode en una línea — igual que QV
  const bcEl = document.getElementById('srp-barcode');
  bcEl.style.display = '';
  bcEl.innerHTML = `<span style="font-family:monospace">ID #${p.id}</span>${p.barcode ? `<span style="font-family:monospace;color:var(--muted)"> · ${p.barcode}</span>` : ''}`;

  // Acciones — 6 botones igual que QV
  const flagDataSrp = _flagItem(p.id);
  const btnEdit = can.editProduct ? `<button class="qv-btn qv-btn-edit" onclick="clearScanResult();openForm(${p.id})">${ICON_EDIT} Más campos</button>` : '';
  const btnTop  = can.editProduct ? `<button class="qv-btn qv-btn-dup" onclick="clearScanResult();moveToTop(${p.id})">📌 Al inicio</button>` : '';
  const btnDup  = `<button class="qv-btn qv-btn-dup" onclick="clearScanResult();duplicateProduct(${p.id})">⧉ Duplicar</button>`;
  const btnPub  = can.publishProduct ? `<button class="qv-btn qv-btn-pub" onclick="_qvTogglePublished(${p.id})">${p.isPublished === false ? '🌐 Publicar' : '🙈 Ocultar'}</button>` : '';
  const btnFlag = flagDataSrp
    ? `<button class="qv-btn qv-btn-flagdone" onclick="clearScanResult();unflagProduct(${p.id})">✓ Revisado</button>`
    : `<button class="qv-btn qv-btn-flag" onclick="_qvShowFlagForm(${p.id})">🚩 Revisar</button>`;
  const btnDel  = can.deleteProduct ? `<button class="qv-btn qv-btn-del" onclick="clearScanResult();askDelete(${p.id})">✕ Eliminar</button>` : '';
  document.getElementById('srp-actions').innerHTML = btnEdit + btnTop + btnDup + btnPub + btnFlag + btnDel;

  // Mostrar como bottom sheet overlay
  const srpPanel = document.getElementById('scan-result-panel');
  srpPanel.dataset.srpId = p.id;
  const overlay = document.getElementById('srp-overlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('scroll-top-btn')?.classList.remove('show');
}


let _srpPendingStock = null;

function _srpStep(delta, id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (_srpPendingStock === null) _srpPendingStock = p.stock;
  _srpPendingStock = Math.max(0, _srpPendingStock + delta);

  const numEl    = document.getElementById('srp-stock-val');
  const saveBtn  = document.getElementById('srp-step-save');
  const statusEl = document.getElementById('srp-stock-status');

  if (numEl) {
    numEl.textContent = _srpPendingStock;
    numEl.style.color = _srpPendingStock === 0 ? 'var(--red)' : _srpPendingStock === 1 ? 'var(--gold-dark)' : 'var(--charcoal)';
  }
  if (statusEl) {
    statusEl.textContent = _srpPendingStock === 0 ? 'Sin stock' : _srpPendingStock === 1 ? 'Última unidad' : `${_srpPendingStock} en stock`;
  }
  if (saveBtn) {
    const changed = _srpPendingStock !== p.stock;
    saveBtn.classList.toggle('visible', changed);
    if (!changed) _srpPendingStock = null;
  }
}

async function _srpSaveStep(id) {
  if (_srpPendingStock === null) return;
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newStock = _srpPendingStock;
  const patch = { stock: newStock };
  if (newStock > 0 && p.outOfStock)   patch.out_of_stock = false;
  if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true;
  if (newStock === 0) patch.is_published = false;

  const saveBtn = document.getElementById('srp-step-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '...'; }

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH', body: JSON.stringify(patch)
  });
  if (result.ok) {
    p.stock = newStock;
    if (patch.out_of_stock !== undefined) p.outOfStock = patch.out_of_stock;
    if (newStock === 0) p.isPublished = false;
    _srpPendingStock = null;
    toast(`📦 Stock → ${newStock}`);
    renderTable(); renderStats();
  } else {
    toast('Error al actualizar stock', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }
  }
  _srpRefresh(id);
}

async function _srpEditStock(id) {
  const p = products.find(x => x.id === id);
  const heroEl = document.getElementById('srp-stock-hero');
  if (!p || !heroEl) return;

  // Reemplaza el contenido del hero — sin quitar el elemento del DOM
  heroEl.innerHTML = `
    <input id="srp-stock-input" type="text" inputmode="numeric" pattern="[0-9]*"
      value="${p.stock}" autocomplete="off"
      style="width:64px;padding:6px 10px;border:2px solid var(--gold);border-radius:8px;font-size:1.4rem;font-weight:800;text-align:center;font-family:inherit;outline:none;color:var(--charcoal)">
    <button id="srp-stock-ok" type="button"
      style="background:var(--gold);border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:.85rem;font-weight:700;cursor:pointer;touch-action:manipulation">✓ Guardar</button>`;
  heroEl.onclick = null;

  const input = document.getElementById('srp-stock-input');
  const btn   = document.getElementById('srp-stock-ok');
  input.focus(); input.select();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newStock = Math.max(0, parseInt(input.value) || 0);
    const patch = { stock: newStock };
    if (newStock > 0 && p.outOfStock)  patch.out_of_stock = false;
    if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true;
    if (newStock === 0) patch.is_published = false;

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify(patch)
    });
    if (result.ok) {
      p.stock = newStock;
      if (patch.out_of_stock !== undefined) p.outOfStock = patch.out_of_stock;
      if (newStock === 0) p.isPublished = false;
      toast(`📦 Stock actualizado → ${newStock}`, '');
      renderTable(); renderStats();
    } else {
      toast('Error al actualizar stock', 'error');
    }
    _srpRefresh(id);
  };

  btn.ontouchend = e => { e.preventDefault(); save(); };
  btn.onclick    = () => save();
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { saved = true; _srpRefresh(id); }
  });
  // Tap fuera → guardar automáticamente
  setTimeout(() => {
    input.addEventListener('blur', () => { if (!saved) save(); });
  }, 400);
}

function _onAdminScan(code) {
  if (_scanCtx === 'recv') {
    const p = products.find(x => x.barcode === code);
    closeAdminScanner();
    if (p) {
      recvConfirmAdd(p.id);
    } else {
      toast(`Código no encontrado: ${code} — búscalo por nombre`, 'error');
      document.getElementById('recv-search')?.focus();
    }
  } else if (_scanCtx === 'capture') {
    document.getElementById('cap-barcode').value = code;
    closeAdminScanner();
    toast(`Código asignado: ${code}`, 'success');
  } else if (_scanCtx === 'form') {
    document.getElementById('f-barcode').value = code;
    closeAdminScanner();
    checkBarcodeConflict();
    toast(`Código asignado: ${code}`, 'success');
  } else if (_scanCtx === 'search') {
    closeAdminScanner();
    const p = products.find(x => x.barcode === code);
    if (p) {
      showScanResult(p.id);
    } else {
      toast(`Código "${code}" — ningún producto asignado`, 'error');
    }
  } else if (_scanCtx === 'kb') {
    closeAdminScanner();
    const p = products.find(x => x.barcode === code);
    if (!p) { toast(`Código "${code}" — ningún producto encontrado`, 'error'); return; }
    if (p.kitItems?.length) { toast('Los kits no pueden ser componentes de otro kit', 'error'); return; }
    _kbAddComponent(p.id);
    toast(`${p.name} agregado al kit`, '');
  }
}

/* ── CATEGORY MANAGER ─────────────────────────────────────────────────── */

function populateCatParentSelect() {
  const sel = document.getElementById('new-cat-parent');
  if (!sel) return;
  sel.innerHTML = `<option value="">— Es categoría raíz —</option>` +
    rootCats().map(r => `<option value="${r.code}">${r.label}</option>`).join('');
}

function openCatManager() {
  document.getElementById('cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCatManagerList();
  populateCatParentSelect();
}

function closeCatManager() {
  document.getElementById('cat-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCatManagerList() {
  const el = document.getElementById('cat-list');
  if (!el) return;
  if (!categories.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:.84rem;text-align:center;padding:12px">Sin categorías</p>';
    return;
  }
  const roots = rootCats();
  let html = '';
  roots.forEach(r => {
    const ri = categories.indexOf(r);
    const subs = subCats(r.code);
    const parentOpts = roots.map(x => `<option value="${x.code}"${x.code===r.code?' selected':''}>${x.label}</option>`).join('');
    html += `
<div class="cat-mgr-root" draggable="true" data-code="${r.code}"
     ondragstart="_catDragStart(event,'root','${r.code}')"
     ondragover="_catDragOver(event,'root')"
     ondrop="_catDrop(event,'root','${r.code}')">
  <span class="cat-mgr-handle" title="Arrastrar para reordenar">⠿</span>
  <span class="cat-mgr-dot" style="background:${r.color||'#9B8B78'}"></span>
  <input class="cat-mgr-root-name" type="text" value="${r.label}"
         onblur="updateCatLabel(${ri},this.value)"
         onkeydown="if(event.key==='Enter')this.blur()" title="Editar nombre">
  <button class="cat-mgr-add-sub" onclick="_catAddSubInline('${r.code}')" title="Agregar subcategoría">+ Sub</button>
  <button class="cat-mgr-del" onclick="deleteCategoryAt(${ri})" title="Eliminar">✕</button>
</div>`;
    if (subs.length) {
      html += `<div class="cat-mgr-subs" data-parent="${r.code}">`;
      subs.forEach(s => {
        const si = categories.indexOf(s);
        const pOpts = roots.filter(x=>x.code!==r.code).map(x=>`<option value="${x.code}">${x.label}</option>`).join('');
        html += `
<div class="cat-mgr-sub-row" draggable="true" data-code="${s.code}"
     ondragstart="_catDragStart(event,'sub','${s.code}')"
     ondragover="_catDragOver(event,'sub')"
     ondrop="_catDrop(event,'sub','${s.code}')">
  <span class="cat-mgr-handle">⠿</span>
  <span class="cat-mgr-dot" style="background:${s.color||r.color||'#9B8B78'}"></span>
  <input class="cat-mgr-sub-name" type="text" value="${s.label}"
         onblur="updateCatLabel(${si},this.value)"
         onkeydown="if(event.key==='Enter')this.blur()" title="Editar nombre">
  <select title="Mover a otra categoría" onchange="_catChangeParent('${s.code}',this.value)"
    style="font-size:.7rem;border:1.5px solid var(--border);border-radius:7px;padding:2px 4px;color:var(--muted);background:#fff;cursor:pointer;max-width:90px;font-family:inherit">
    <option value="${r.code}" selected>↳ ${r.label}</option>
    ${pOpts}
  </select>
  <button class="cat-mgr-del" onclick="deleteCategoryAt(${si})" title="Eliminar">✕</button>
</div>`;
      });
      html += `</div>`;
    }
  });
  el.innerHTML = html;
}

function _catAddSubInline(parentCode) {
  // Si ya hay un formulario abierto para este padre, lo cierra
  const existing = document.getElementById(`cat-sub-form-${parentCode}`);
  if (existing) { existing.remove(); return; }
  // Cierra otros formularios abiertos
  document.querySelectorAll('[id^="cat-sub-form-"]').forEach(el => el.remove());

  const parent = categories.find(c => c.code === parentCode);
  if (!parent) return;

  const form = document.createElement('div');
  form.id = `cat-sub-form-${parentCode}`;
  form.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px 0 6px 18px;margin-left:6px;border-left:2px solid var(--gold)';
  form.innerHTML = `
    <span class="cat-mgr-dot" style="background:${parent.color||'#9B8B78'}"></span>
    <input id="cat-sub-input-${parentCode}" type="text" placeholder="Nombre de la subcategoría…"
      style="flex:1;padding:7px 11px;border:1.5px solid var(--gold);border-radius:8px;font-size:.84rem;font-family:inherit;outline:none"
      onkeydown="if(event.key==='Enter')_catSubConfirm('${parentCode}');if(event.key==='Escape')this.closest('[id^=cat-sub-form]').remove()">
    <button onclick="_catSubConfirm('${parentCode}')"
      style="background:var(--gold);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:.8rem;font-weight:700;cursor:pointer;touch-action:manipulation;white-space:nowrap">✓ Agregar</button>
    <button onclick="document.getElementById('cat-sub-form-${parentCode}').remove()"
      style="background:none;border:none;color:var(--muted);font-size:1rem;cursor:pointer;padding:4px;touch-action:manipulation">✕</button>`;

  // Insertar después de la fila raíz (antes del bloque de subs si existe)
  const rootRow = document.querySelector(`.cat-mgr-root`);
  const allRoots = document.querySelectorAll('.cat-mgr-root');
  let targetRoot = null;
  allRoots.forEach(row => {
    const btn = row.querySelector(`[onclick="_catAddSubInline('${parentCode}')"]`);
    if (btn) targetRoot = row;
  });
  if (targetRoot) {
    const subsBlock = targetRoot.nextElementSibling;
    if (subsBlock?.classList.contains('cat-mgr-subs')) {
      subsBlock.insertAdjacentElement('afterend', form);
    } else {
      targetRoot.insertAdjacentElement('afterend', form);
    }
    setTimeout(() => document.getElementById(`cat-sub-input-${parentCode}`)?.focus(), 50);
  }
}

/* ── CATEGORY DRAG & DROP ── */
let _catDragCode = null;
let _catDragType = null;

function _catDragStart(e, type, code) {
  _catDragCode = code;
  _catDragType = type;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget?.classList.add('cat-drag-over'), 0);
}

function _catDragOver(e, type) {
  if (type !== _catDragType) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
  e.currentTarget.classList.add('cat-drag-over');
}

async function _catDrop(e, type, targetCode) {
  e.preventDefault();
  document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
  if (!_catDragCode || _catDragCode === targetCode || type !== _catDragType) return;

  const srcIdx = categories.findIndex(c => c.code === _catDragCode);
  const tgtIdx = categories.findIndex(c => c.code === targetCode);
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [item] = categories.splice(srcIdx, 1);
  const newTgt = categories.findIndex(c => c.code === targetCode);
  categories.splice(newTgt, 0, item);

  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  _catDragCode = null;
}

async function _catChangeParent(subCode, newParentCode) {
  const sub = categories.find(c => c.code === subCode);
  const newParent = categories.find(c => c.code === newParentCode);
  if (!sub || !newParent) return;
  sub.parent = newParentCode;
  sub.color = newParent.color || sub.color;
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  toast(`"${sub.label}" movida a "${newParent.label}" ✓`, 'success');
}

async function _catSubConfirm(parentCode) {
  const input = document.getElementById(`cat-sub-input-${parentCode}`);
  const label = input?.value.trim();
  if (!label) { input?.focus(); return; }
  const code = parentCode + '_' + label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  if (categories.find(c => c.code === code)) { toast('Ya existe esa subcategoría', 'error'); input?.focus(); return; }
  const parent = categories.find(c => c.code === parentCode);
  const color = parent?.color || CAT_PALETTE[categories.length % CAT_PALETTE.length];
  categories.push({ code, label, color, parent: parentCode });
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  populateCatParentSelect();
  toast(`"${label}" agregada ✓`, 'success');
}

async function updateCatLabel(idx, newLabel) {
  const label = newLabel.trim();
  if (!label || label === categories[idx]?.label) return;
  const code = categories[idx].code;
  categories[idx].label = label;
  await _saveCategories();
  renderCategorySelects();
  // Actualizar category_label en todos los productos de esta categoría
  await supabaseApi(`products?category=eq.${code}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_label: label })
  });
  products.filter(p => p.category === code).forEach(p => { p.categoryLabel = label; });
  renderTable();
  toast(`Categoría "${label}" actualizada ✓`, 'success');
}

async function deleteCategoryAt(idx) {
  const c = categories[idx];
  const count = products.filter(p => p.category === c.code).length;
  const msg = count > 0
    ? `¿Eliminar "${c.label}"? ${count} producto(s) tendrán esta categoría. ¿Continuar?`
    : `¿Eliminar la categoría "${c.label}"?`;
  if (!confirm(msg)) return;
  categories.splice(idx, 1);
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  toast('Categoría eliminada', 'success');
}

async function addCategory() {
  const labelInput  = document.getElementById('new-cat-label');
  const parentInput = document.getElementById('new-cat-parent');
  const label  = labelInput.value.trim();
  const parent = parentInput?.value || '';
  if (!label) { toast('Escribe el nombre de la categoría', 'error'); labelInput.focus(); return; }
  const base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const code = parent ? `${parent}_${base}` : base;
  if (categories.find(c => c.code === code)) { toast('Ya existe una categoría con ese nombre', 'error'); return; }
  const color = CAT_PALETTE[categories.length % CAT_PALETTE.length];
  const newCat = { code, label, color };
  if (parent && categories.find(c => c.code === parent)) newCat.parent = parent;
  categories.push(newCat);
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  labelInput.value = '';
  if (parentInput) parentInput.value = '';
  toast(`${parent ? 'Subcategoría' : 'Categoría'} "${label}" creada ✓`, 'success');
}

/* ── VOICE DICTATION ──────────────────────────────────────────────────── */
let _activeRec = null;

function dictate(fieldId) {
  if (!_activeRec) TE?.track('dictate_start', { field: fieldId });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('Dictado no disponible. Usa Chrome o Safari.', 'error');
    return;
  }

  const btn   = document.getElementById(`dictate-${fieldId}`);
  const field = document.getElementById(fieldId);
  const origLabel = btn.textContent;

  // Detener grabación activa: nullear ANTES de stop() para que onend sepa que fue el usuario
  if (_activeRec) {
    const rec = _activeRec;
    _activeRec = null;
    rec.stop();
    // Limpiar visual del campo activo (puede ser distinto al fieldId actual)
    document.querySelectorAll('.field-recording').forEach(el => el.classList.remove('field-recording'));
    return;
  }

  // Android no mantiene continuous confiablemente — usamos false y reiniciamos en onend
  const isAndroid = /Android/i.test(navigator.userAgent);
  const sr = new SR();
  sr.lang           = 'es-MX';
  sr.interimResults = true;
  sr.continuous     = !isAndroid;

  _activeRec = sr;

  const startValue  = field.value.trimEnd();
  let committedText = '';
  let nextFinalIdx  = 0;
  let _silenceTimer = null;

  const SILENCE_MS = 5000;

  const resetSilenceTimer = () => {
    if (_silenceTimer) clearTimeout(_silenceTimer);
    _silenceTimer = setTimeout(() => stopDictation(), SILENCE_MS);
  };

  const stopDictation = () => {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    if (_activeRec === sr) { _activeRec = null; sr.stop(); }
  };

  if (!btn.dataset.iconOnly) btn.textContent = '⏹ Detener';
  btn.classList.add('recording');
  field.classList.add('field-recording');
  toast('🎤 Grabando… toca el botón para detener', '');

  // FIX Android: blur cierra el teclado del sistema → su micrófono deja de escuchar
  field.blur();

  // Arrancar timer de silencio desde el inicio — se resetea en cada onresult
  resetSilenceTimer();

  sr.onresult = e => {
    resetSilenceTimer(); // cualquier resultado de voz reinicia el contador
    // Solo agregar finales NUEVOS desde nextFinalIdx — nunca releer los ya procesados
    for (let i = nextFinalIdx; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        const t = e.results[i][0].transcript.trim();
        if (t) committedText += (committedText ? ' ' : '') + t;
        nextFinalIdx = i + 1;
      }
    }
    // Interim del resultado actual (solo si no es final)
    const cur     = e.results[e.resultIndex];
    const interim = cur.isFinal ? '' : cur[0].transcript.trim();
    const all     = committedText + (interim ? (committedText ? ' ' : '') + interim : '');
    const sep     = startValue && all ? ' ' : '';
    field.value   = startValue + sep + all;
    if (!cur.isFinal && btn.dataset.iconOnly) return; // búsqueda: solo disparar en finales
    field.dispatchEvent(new Event('input'));
  };

  sr.onend = () => {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    if (_activeRec === sr) {
      // Android cerró la sub-sesión pero el usuario no detuvo — reiniciar
      nextFinalIdx = 0;
      try { sr.start(); } catch (_) {}
    } else {
      // Grabación terminada — limpiar estado visual
      const sep   = startValue && committedText ? ' ' : '';
      let finalVal = (startValue + sep + committedText).trim();
      // Aplicar formato de oraciones solo en el campo descripción
      if (field.id === 'f-description') finalVal = formatDescription(finalVal);
      field.value = finalVal;
      field.dispatchEvent(new Event('input'));
      if (!btn.dataset.iconOnly) btn.textContent = origLabel;
      btn.classList.remove('recording');
      field.classList.remove('field-recording');
      toast('✓ Dictado finalizado', 'success');
    }
  };

  sr.onerror = e => {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    _activeRec = null;
    if (!btn.dataset.iconOnly) btn.textContent = origLabel;
    btn.classList.remove('recording');
    field.classList.remove('field-recording');
    const sep   = startValue && committedText ? ' ' : '';
    field.value = (startValue + sep + committedText).trim();
    field.dispatchEvent(new Event('input'));
    if (e.error === 'not-allowed')
      toast('Permiso de micrófono denegado. Actívalo en los ajustes del navegador.', 'error');
    else if (e.error !== 'aborted')
      toast('Error de micrófono: ' + e.error, 'error');
  };

  sr.start();
}

/* ── TOAST ── */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  const duration = type === 'error' ? 5000 : type === '' ? 1500 : 3000;
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

const truncName = (s, n = 28) => s && s.length > n ? s.slice(0, n) + '…' : (s || '');

function toastUndo(msg, onUndo, onExpire) {
  const el = document.getElementById('undo-bar');
  const msgEl = document.getElementById('undo-msg');
  if (!el) return toast(msg, 'success');
  if (el._t) { clearTimeout(el._t); if (el._expire) el._expire(); el._undo = null; el._expire = null; }
  msgEl.textContent = msg;
  el.classList.add('show');
  el._undo = onUndo;
  el._expire = onExpire || null;
  el._t = setTimeout(() => {
    el.classList.remove('show');
    if (el._expire) el._expire();
    el._undo = null; el._expire = null;
  }, 7000);
}

function toastAction(msg, btnLabel, onAction, duration = 5000) {
  const el    = document.getElementById('action-bar');
  const msgEl = document.getElementById('action-msg');
  const btn   = document.getElementById('action-btn');
  if (!el) return toast(msg, 'success');
  if (el._t) { clearTimeout(el._t); el._action = null; }
  msgEl.textContent = msg;
  btn.textContent   = btnLabel;
  el.classList.add('show');
  el._action = onAction;
  el._t = setTimeout(() => { el.classList.remove('show'); el._action = null; }, duration);
}

function doAction() {
  const el = document.getElementById('action-bar');
  if (!el?._action) return;
  clearTimeout(el._t);
  el.classList.remove('show');
  el._action();
  el._action = null;
}

function doUndo() {
  const el = document.getElementById('undo-bar');
  if (!el?._undo) return;
  clearTimeout(el._t);
  const fn = el._undo;
  el._undo = null;
  el._expire = null;
  el.classList.remove('show');
  fn();
}

/* ── REVISTA ── */
function openRevista() {
  const overlay = document.getElementById('revista-overlay');
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'none';
  document.getElementById('revista-file')._pendingFile = null;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initRevistaUpload();
}

function closeRevista() {
  document.getElementById('revista-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function initRevistaUpload() {
  const zone = document.getElementById('revista-upload-zone');
  if (!zone) return;
  zone.removeEventListener('click', zone._clickHandler);
  zone.removeEventListener('dragover', zone._dragoverHandler);
  zone.removeEventListener('dragleave', zone._dragleaveHandler);
  zone.removeEventListener('drop', zone._dropHandler);

  zone._clickHandler = () => document.getElementById('revista-file').click();
  zone._dragoverHandler = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone._dragleaveHandler = () => zone.classList.remove('drag-over');
  zone._dropHandler = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processRevistaFile(file);
  };

  zone.addEventListener('click', zone._clickHandler);
  zone.addEventListener('dragover', zone._dragoverHandler);
  zone.addEventListener('dragleave', zone._dragleaveHandler);
  zone.addEventListener('drop', zone._dropHandler);
}

function handleRevistaFile(input) {
  const file = input.files[0];
  if (!file) return;
  processRevistaFile(file);
}

function processRevistaFile(file) {
  if (file.type !== 'application/pdf') { toast('Solo se permiten archivos PDF', 'error'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('El PDF es muy grande. Máx 50MB.', 'error'); return; }
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'block';
  document.getElementById('revista-filename').textContent =
    `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  document.getElementById('revista-file')._pendingFile = file;
}

function clearRevistaFile() {
  document.getElementById('revista-file').value = '';
  document.getElementById('revista-file')._pendingFile = null;
  document.getElementById('revista-preview').style.display = 'none';
}

async function saveRevista() {
  const urlInput = document.getElementById('revista-url-input');
  const fileInput = document.getElementById('revista-file');
  const pendingFile = fileInput._pendingFile;
  const urlVal = urlInput.value.trim();

  if (!pendingFile && !urlVal) { toast('Ingresa una URL o sube un PDF', 'error'); return; }

  const saveBtn = document.querySelector('#revista-overlay .btn-gold');
  let finalUrl = urlVal;

  if (pendingFile) {
    setBtn(saveBtn, true, 'Subiendo PDF...');

    // Crear bucket si no existe (ignorar si ya existe)
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'revistas', name: 'revistas', public: true })
      });
    } catch {}

    try {
      const filename = `revista-${Date.now()}.pdf`;
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/revistas/${filename}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true'
        },
        body: pendingFile
      });

      setBtn(saveBtn, false);

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        toast(`Error al subir: ${err.message || err.error || uploadRes.status}`, 'error');
        return;
      }

      finalUrl = `${SUPABASE_URL}/storage/v1/object/public/revistas/${filename}`;
    } catch (e) {
      setBtn(saveBtn, false);
      toast('Error de conexión al subir PDF: ' + e.message, 'error');
      return;
    }
  }

  const result = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'revista_url', value: finalUrl })
  });

  if (!result.ok || result.data?.error) {
    toast('Error al guardar el enlace', 'error');
    return;
  }

  closeRevista();
  toast('Revista guardada correctamente ✓', 'success');
}

/* ── NOMBRES DE USUARIOS ──────────────────────────────────────────────── */
let nameMap = {};

async function _loadNameMap() {
  const { ok, data } = await supabaseApi('config?id=eq.user_names&select=value');
  if (ok && data?.[0]?.value) {
    try { nameMap = JSON.parse(data[0].value); } catch {}
  }
}

async function openNamesModal() {
  const { ok, data } = await supabaseApi('activity_log?select=user_email&limit=500');
  const emails = ok && data ? [...new Set(data.map(d => d.user_email))].filter(Boolean).sort() : [];
  if (!emails.length) { toast('Sin usuarios registrados en el historial de Actividad aún'); return; }
  document.getElementById('names-list-admin').innerHTML = emails.map(e => `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:10px">
      <div style="font-size:.78rem;color:var(--muted);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e}">${e}</div>
      <input style="padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem;outline:none;width:100%;font-family:inherit;transition:border-color .15s"
             data-email="${e}" placeholder="Nombre visible" value="${nameMap[e] || ''}"
             onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
    </div>`).join('');
  document.getElementById('names-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNamesModal() {
  document.getElementById('names-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveNamesAdmin() {
  document.querySelectorAll('#names-list-admin [data-email]').forEach(inp => {
    const val = inp.value.trim();
    if (val) nameMap[inp.dataset.email] = val;
    else delete nameMap[inp.dataset.email];
  });
  const { ok } = await supabaseApi('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'user_names', value: JSON.stringify(nameMap) })
  });
  if (!ok) { toast('Error al guardar', 'error'); return; }
  closeNamesModal();
  toast('Nombres guardados ✓', 'success');
}

/* ══ MODO RECEPCIÓN ══════════════════════════════════════════════════ */
let _recvSession = []; // [{product, qtyAdded, prevStock}]
let _recvFbTimer = null;
let _recvFbPendingId = null;
let _recvFbPendingQty = 0;

function openRecvMode() {
  _recvSession = [];
  _renderRecvList();
  _recvUpdateHeader();
  document.getElementById('recv-overlay').style.display = 'flex';
  document.getElementById('recv-fb').style.display = 'none';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('recv-search')?.focus(), 300);
}

function closeRecvMode() {
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const prods = _recvSession.length;
  if (total > 0) {
    toast(`✓ ${total} unidad${total!==1?'es':''} recibidas en ${prods} producto${prods!==1?'s':''}`);
    renderTable();
    renderStats();
  }
  document.getElementById('recv-overlay').style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('recv-search').value = '';
  document.getElementById('recv-search-results').style.display = 'none';
  clearTimeout(_recvFbTimer);
}

function openRecvScanner() {
  _scanCtx = 'recv';
  document.getElementById('scanner-title').textContent = 'Escanear producto';
  _launchScanner();
}

function recvSearch(q) {
  const resultsEl = document.getElementById('recv-search-results');
  const val = q.trim();
  if (!val) { resultsEl.style.display = 'none'; return; }
  // Coincidencia exacta de código de barras → agregar automáticamente sin mostrar lista
  const barcodeMatch = products.find(p => p.barcode && p.barcode === val);
  if (barcodeMatch) { recvConfirmAdd(barcodeMatch.id); return; }
  const matches = products.filter(p => _norm(p.name).includes(_norm(val))).slice(0, 8);
  resultsEl.style.display = 'block';
  if (!matches.length) {
    const safeVal = val.replace(/'/g, "\\'");
    resultsEl.innerHTML = `<div class="recv-no-found" style="padding:18px 16px;text-align:center">
      <div style="font-size:1.6rem;margin-bottom:6px">🔍</div>
      <div style="font-weight:600;color:var(--charcoal);font-size:.88rem;margin-bottom:4px">Producto no encontrado</div>
      <div style="font-size:.76rem;color:var(--muted);margin-bottom:14px;word-break:break-all;max-width:260px;margin-left:auto;margin-right:auto">${val}</div>
      <button onclick="recvCreateProduct('${safeVal}')" style="width:100%;padding:11px 16px;background:var(--charcoal);color:#fff;border:none;border-radius:10px;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation">+ Crear producto →</button>
    </div>`;
    return;
  }
  const PH = DEFAULT_IMG;
  resultsEl.innerHTML = matches.map(p => `
<div class="recv-result-item" onclick="recvConfirmAdd(${p.id})">
  <img class="recv-result-img" src="${p.image}" onerror="this.src='${PH}'" alt="">
  <div style="flex:1;min-width:0">
    <div class="recv-result-name">${p.name}</div>
    <div class="recv-result-stock">Stock actual: ${p.stock}</div>
  </div>
  <span class="recv-result-add">+ Recibir</span>
</div>`).join('');
}

function recvCreateProduct(val) {
  document.getElementById('recv-search').value = '';
  document.getElementById('recv-search-results').style.display = 'none';
  closeRecvMode();
  openForm();
  // Pre-llenar barcode si es numérico (pistola), o nombre si es texto
  setTimeout(() => {
    const isBarcode = /^\d{6,}$/.test(val);
    if (isBarcode) {
      const bc = document.getElementById('f-barcode');
      if (bc) bc.value = val;
    } else {
      const nm = document.getElementById('f-name');
      if (nm) { nm.value = val; nm.focus(); }
    }
  }, 150);
}

function recvSearchKey(e) {
  if (e.key !== 'Enter') return;
  const resultsEl = document.getElementById('recv-search-results');
  if (resultsEl.style.display === 'none') return;
  // No encontrado: Enter de la pistola limpia el campo pero deja la tarjeta visible
  if (resultsEl.querySelector('.recv-no-found')) {
    e.preventDefault();
    document.getElementById('recv-search').value = '';
    document.getElementById('recv-search').focus();
    return;
  }
  // Hay resultados: Enter selecciona el primero
  const first = resultsEl.querySelector('.recv-result-item');
  if (first) first.click();
}

function recvConfirmAdd(id, qty = 1) {
  document.getElementById('recv-search').value = '';
  document.getElementById('recv-search-results').style.display = 'none';
  _recvDoAdd(id, qty);
}

async function _recvDoAdd(id, qty) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const existing = _recvSession.find(x => x.product.id === id);
  const prevStock = existing ? existing.prevStock : p.stock;

  p.stock = p.stock + qty;
  if (p.outOfStock) p.outOfStock = false;

  if (existing) {
    existing.qtyAdded += qty;
  } else {
    _recvSession.unshift({ product: p, qtyAdded: qty, prevStock });
  }

  _showRecvFeedback(p, existing ? existing.qtyAdded : qty);
  _renderRecvList();
  _recvUpdateHeader();
  if (navigator.vibrate) navigator.vibrate(40);

  await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: p.stock, out_of_stock: false })
  });
}

function _showRecvFeedback(p, totalQty) {
  clearTimeout(_recvFbTimer);
  _recvFbPendingId = p.id;
  _recvFbPendingQty = totalQty;
  const fb = document.getElementById('recv-fb');
  fb.style.display = 'block';
  fb.innerHTML = `
<div class="recv-fb-inner">
  <img class="recv-fb-img" src="${p.image}" onerror="this.style.display='none'" alt="">
  <div class="recv-fb-info">
    <div class="recv-fb-name">${p.name}</div>
    <div class="recv-fb-arrow">${p.stock - totalQty} → <strong>+${totalQty} = ${p.stock}</strong> unidades</div>
    <div class="recv-fb-controls">
      <button class="recv-fb-btn" onclick="recvFbAdjust(-1)">−</button>
      <span class="recv-fb-qty" id="recv-fb-qty">+${totalQty}</span>
      <button class="recv-fb-btn" onclick="recvFbAdjust(+1)">+</button>
      <button class="recv-fb-ok" onclick="_recvFbClose()">✓ Ok</button>
    </div>
  </div>
</div>`;
  _recvFbTimer = setTimeout(() => _recvFbClose(), 4000);
}

function recvFbAdjust(delta) {
  clearTimeout(_recvFbTimer);
  if (!_recvFbPendingId) return;
  const item = _recvSession.find(x => x.product.id === _recvFbPendingId);
  if (!item) return;
  if (delta < 0 && item.qtyAdded <= 1) return;
  _recvDoAdd(_recvFbPendingId, delta);
}

function _recvFbClose() {
  clearTimeout(_recvFbTimer);
  document.getElementById('recv-fb').style.display = 'none';
  _recvFbPendingId = null;
}

async function recvUndo(id) {
  const idx = _recvSession.findIndex(x => x.product.id === id);
  if (idx === -1) return;
  const { product: p, qtyAdded, prevStock } = _recvSession[idx];
  p.stock = prevStock;
  p.outOfStock = prevStock === 0;
  _recvSession.splice(idx, 1);
  _renderRecvList();
  _recvUpdateHeader();
  toast(`↩ ${p.name} revertido`);
  await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: prevStock, out_of_stock: prevStock === 0 })
  });
}

function _renderRecvList() {
  const el = document.getElementById('recv-list');
  if (!_recvSession.length) {
    el.innerHTML = '<div class="recv-empty"><div class="recv-empty-icon">📦</div>Escanea o busca un producto para comenzar</div>';
    return;
  }
  const PH = DEFAULT_IMG;
  el.innerHTML = _recvSession.map(({ product: p, qtyAdded, prevStock }) => `
<div class="recv-item">
  <img class="recv-item-img" src="${p.image}" onerror="this.src='${PH}'" alt="">
  <div class="recv-item-info">
    <div class="recv-item-name">${p.name}</div>
    <div class="recv-item-arrow">${prevStock} → <strong>+${qtyAdded} = ${p.stock}</strong> uds.</div>
  </div>
  <span class="recv-badge">+${qtyAdded}</span>
  <button class="recv-undo-btn" onclick="recvUndo(${p.id})" title="Deshacer">↩</button>
</div>`).join('');
}

function _recvUpdateHeader() {
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const badge = document.getElementById('recv-count-badge');
  const sessionTotal = document.getElementById('recv-session-total');
  if (badge) badge.textContent = total > 0 ? `· ${total} unidades` : '';
  if (sessionTotal) sessionTotal.textContent = total > 0
    ? `${total} unid. · ${_recvSession.length} producto${_recvSession.length!==1?'s':''}`
    : '';
}

function recvShareWA() {
  if (!_recvSession.length) { toast('Nada recibido aún', ''); return; }
  const fecha = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  const lines = _recvSession.map(({ product: p, qtyAdded, prevStock }) =>
    `• ${p.name}: +${qtyAdded} (${prevStock} → ${p.stock})`
  );
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const msg = `📦 Recepción de mercancía — ${fecha}\n\n${lines.join('\n')}\n\nTotal: ${total} unidades en ${_recvSession.length} productos`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ══ MODO CAPTURA RÁPIDA ═════════════════════════════════════════════ */
let captureCount = 0;
let captureImageDataUrl = null;

function openCaptureMode() {
  resetCaptureForm(true);
  document.getElementById('cap-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function _capIsDirty() {
  const name  = document.getElementById('cap-name')?.value.trim();
  const price = document.getElementById('cap-price')?.value.trim();
  return !!(captureImageDataUrl || name || price);
}

function closeCaptureMode(force) {
  if (!force && _capIsDirty()) {
    if (!confirm('Tienes datos sin guardar en captura rápida. ¿Salir de todas formas?')) return;
  }
  document.getElementById('cap-overlay').style.display = 'none';
  document.body.style.overflow = '';
  if (captureCount > 0) {
    // Cambiar a Recientes para ver los productos recién capturados
    const sortSel = document.getElementById('sort-select');
    if (sortSel) { sortSel.value = 'recent'; currentSort = 'recent'; }
    renderTable();
    renderStats();
  }
  captureCount = 0;
}

function resetCaptureForm(keepCount) {
  captureImageDataUrl = null;
  document.getElementById('cap-file').value = '';
  const prev = document.getElementById('cap-preview-img');
  prev.style.display = 'none'; prev.src = '';
  document.getElementById('cap-photo-ph').style.display = 'flex';
  document.getElementById('cap-retake-btn').style.display = 'none';
  document.getElementById('cap-photo-area').classList.remove('has-photo');
  document.getElementById('cap-ai-status').style.display = 'none';
  const spin = document.getElementById('cap-ai-spin');
  const ico  = document.getElementById('cap-ai-icon');
  if (spin) { spin.style.display = 'block'; }
  if (ico)  { ico.style.display  = 'none'; }
  const nameEl  = document.getElementById('cap-name');
  const priceEl = document.getElementById('cap-price');
  nameEl.value  = '';
  priceEl.value = '';
  nameEl.classList.remove('cap-err');
  priceEl.classList.remove('cap-err');
  const stockEl = document.getElementById('cap-stock');
  if (stockEl) stockEl.value = '1';
  const capBarcode = document.getElementById('cap-barcode'); if (capBarcode) capBarcode.value = '';
  const capCat = document.getElementById('cap-category'); if (capCat) capCat.value = 'por_revisar';
  const saveBtn = document.getElementById('cap-save-btn');
  if (saveBtn) saveBtn.textContent = 'Guardar y siguiente →';
  updateCapSaveBtn();
}

async function handleCapturePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const raw = new Image();
    raw.onload = async () => {
      // Comprimir igual que el formulario: max 900px, JPEG 0.82
      const canvas = document.createElement('canvas');
      const MAX = 900;
      let w = raw.width, h = raw.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(raw, 0, 0, w, h);
      captureImageDataUrl = canvas.toDataURL('image/jpeg', 0.82);

      const img = document.getElementById('cap-preview-img');
      img.src = captureImageDataUrl;
      img.style.display = 'block';
      document.getElementById('cap-photo-ph').style.display = 'none';
      document.getElementById('cap-retake-btn').style.display = 'block';
      document.getElementById('cap-photo-area').classList.add('has-photo');
      updateCapSaveBtn();
      await runCaptureAI();
    };
    raw.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _capSetAIStatus(done, icon, text) {
  const spin = document.getElementById('cap-ai-spin');
  const ico  = document.getElementById('cap-ai-icon');
  const msg  = document.getElementById('cap-ai-msg');
  if (done) {
    spin.style.display = 'none';
    ico.style.display  = 'inline';
    ico.textContent    = icon;
  } else {
    spin.style.display = 'block';
    ico.style.display  = 'none';
  }
  msg.textContent = text;
}

function _capMatchCategory(code) {
  if (!code) return null;
  const norm = code.toLowerCase().trim();
  // 1. Exacto
  let m = categories.find(c => c.code === norm);
  if (m) return m;
  // 2. Label exacto (case insensitive)
  m = categories.find(c => c.label.toLowerCase() === norm);
  if (m) return m;
  // 3. Código empieza con lo que devolvió la IA (ej: "natura" → "natura_perfumes")
  m = categories.find(c => c.code.startsWith(norm + '_'));
  if (m) return m;
  // 4. Lo que devolvió la IA empieza con el código de categoría (ej: IA dijo "natura_algo" pero solo existe "natura")
  m = categories.find(c => norm.startsWith(c.code));
  if (m) return m;
  // 5. Label contiene la palabra (ej: IA dijo "bolsas" → label "Bolsos & Mochilas")
  m = categories.find(c => c.label.toLowerCase().includes(norm) || norm.includes(c.label.toLowerCase()));
  if (m) return m;
  return null;
}

async function runCaptureAI() {
  if (!captureImageDataUrl || !groqApiKey) {
    if (!groqApiKey) toast('Configura la IA en Configuración', 'error');
    return;
  }
  document.getElementById('cap-ai-status').style.display = 'flex';
  _capSetAIStatus(false, '', 'Analizando imagen con IA...');
  try {
    const catList = categories.map(c => '"' + c.code + '" (' + c.label + ')').join(', ');
    const sysP = 'Eres copywriter senior para Tres Encantos. Copy listo para publicar, nivel Sephora/Liverpool/Amazon MX.\n\nPASO 0: lee TODO el texto del empaque (marca, línea, concentración, variante, ml/g, género) antes de escribir.\n\nTÍTULO NATURA: Natura [Línea] [Tipo] [Variante] [ml/g] [Género]. Líneas: Kaiak, Essencial, Una, Humor, Nativa, Plant, Tododia, Ekos, Chronos, Mamá Terra, Lumina, Luna, Faces, Amó. Ej: "Natura Kaiak Desodorante Colônia Clásico 100ml Masculino".\n\nTÍTULO AVON: Avon [Línea] [Tipo] [Variante] [ml/g]. Líneas: Anew, Skin So Soft, Far Away, Black Suede, Luck, Perceive, True Color. Ej: "Avon Far Away Eau de Parfum 50ml Femenino", "Avon Anew Sérum Retinol 30ml".\n\nTÍTULO GENERAL: [Marca] + [Tipo] + [Material/Acabado] + [Color].\n\nDESCRIPCIÓN PREMIUM — empieza con verbo activo o ingrediente, nunca "Este es...":\n• Perfume/Colonia Natura o Avon → "[Familia olfativa] de [notas] que [efecto]."\n• Crema/Loción Natura o Avon → "[Ingrediente] que [beneficio]. [Textura/resultado]."\n• Maquillaje → "[Acabado] que [beneficio extra]. [Tono/look ideal]."\n• Bolso/Cartera → "[Material] que [funcionalidad]. [Ocasión]."\n\nCATEGORÍA — si ves marca Avon o líneas Avon → avon_perfumes/avon_cuerpo/avon_facial/avon_maquillaje. Si ves Natura → natura_perfumes/natura_cuerpo/natura_facial/natura_cabello/natura_maquillaje. Bolso grande → bolsos; cartera → accesorios; labial/sombra → maquillaje. "" si duda.\n\nPROHIBIDO: "bonito","elegante","especial","hermoso". Sin SKUs. Español de México.';
    const usrP = 'PASO 0: escanea la imagen — marca, línea, concentración, variante, ml/g, género. Devuelve SOLO JSON válido sin markdown.\n\nOBLIGATORIOS:\n- "name": 45-70 chars. Natura: línea+tipo+variante+ml+género. Otros: marca+tipo+material+color. NUNCA uses EDP/EDT/EDC — escribe "Perfume", "Colonia" o "Eau de Parfum" completo.\n- "description": copy listo para publicar, máx 160 chars. Fórmula según tipo. Empieza con verbo o ingrediente, nunca "Este es...".\n\nOPCIONALES (null o "" si dudas):\n- "category": código exacto según mapeo del sistema. Opciones: ' + catList + '\n- "price": número de etiqueta/plumón/empaque (ej: 350). Solo dígitos. NO confundas con ml, oz, g, tallas, %, códigos. null si duda.\n\n{"name":"...","description":"...","category":"","price":null}';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqApiKey },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: sysP },
          { role: 'user', content: [{ type: 'text', text: usrP }, { type: 'image_url', image_url: { url: captureImageDataUrl } }] }
        ],
        temperature: 0.3, max_tokens: 500
      })
    });
    if (!res.ok) throw new Error('Error ' + res.status);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Sin JSON');
    const p = JSON.parse(jsonMatch[0]);
    const flash = id => { const el = document.getElementById(id); if (!el) return; el.classList.add('ai-filled'); setTimeout(() => el.classList.remove('ai-filled'), 1200); };
    if (p.name)  { document.getElementById('cap-name').value = toTitleCase(p.name); flash('cap-name'); }
    if (p.price) { const n = Number(p.price); if (!isNaN(n) && n > 0 && n < 100000) { document.getElementById('cap-price').value = Math.round(n); flash('cap-price'); } }
    const catMatch = _capMatchCategory(p.category);
    const sel = document.getElementById('cap-category');
    if (catMatch) {
      sel.value = catMatch.code;
      if (sel.value === catMatch.code) flash('cap-category');
    } else {
      sel.value = 'por_revisar';
    }
    const catSet = !!catMatch;
    const filled = [p.name ? 'nombre' : null, (p.price && Number(p.price) > 0) ? 'precio' : null, catSet ? 'categoría' : '⚠️ sin categoría — quedó en "Por revisar"'].filter(Boolean);
    _capSetAIStatus(true, catSet ? '✓' : '⚠️', filled.join(', '));
    updateCapSaveBtn();
  } catch (err) {
    _capSetAIStatus(true, '⚠️', 'IA no disponible — completa manualmente');
  }
}

function updateCapSaveBtn() {
  const name  = document.getElementById('cap-name')?.value.trim();
  const ok    = !!name;
  document.getElementById('cap-save-btn').disabled = !ok;
  const hint = document.getElementById('cap-require-hint');
  if (!hint) return;
  hint.textContent = ok ? '' : '⚠️ Falta el nombre del producto';
}

async function saveCaptureProduct() {
  const name  = document.getElementById('cap-name').value.trim();
  const price = parseFloat(document.getElementById('cap-price').value) || 0;
  const stock = Math.max(1, parseInt(document.getElementById('cap-stock')?.value) || 1);
  if (!name) return;
  const btn = document.getElementById('cap-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const barcode = document.getElementById('cap-barcode')?.value.trim() || null;
    // Consultar el ID máximo real en Supabase para evitar conflictos de primary key
    const maxResult = await supabaseApi('products?select=id&order=id.desc&limit=1');
    const maxId = (maxResult.ok && maxResult.data?.length) ? maxResult.data[0].id : 0;
    const newId = maxId + 1;
    const capCatCode  = document.getElementById('cap-category')?.value || 'por_revisar';
    const capCatMatch = categories.find(c => c.code === capCatCode);
    // Subir imagen a Drive antes de guardar
    let captureImgFinal = captureImageDataUrl || '';
    if (captureImgFinal && driveEp && driveSecret) {
      const driveUrl = await uploadToDrive(captureImgFinal);
      if (driveUrl) captureImgFinal = driveUrl;
    }
    const payload = {
      id: newId, name, price,
      description: '',
      category: capCatMatch ? capCatMatch.code : 'por_revisar',
      category_label: capCatMatch ? capCatMatch.label : 'Por revisar',
      image: captureImgFinal,
      is_published: false, out_of_stock: false,
      stock, featured: false, position: newId,
      barcode, created_by: getCurrentUserEmail()
    };
    const { ok, data: saveData } = await supabaseApi('products', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (!ok) {
      const msg = saveData?.message || saveData?.error || JSON.stringify(saveData);
      console.error('Supabase error captura rápida:', msg);
      throw new Error(msg);
    }
    products.unshift({ ...payload, originalPrice: null, badge: null, badgeType: null, barcode, cost: null, createdBy: payload.created_by });
    _trackEdit(newId);
    logActivity('producto_creado', `Creó "${name}" — $${(price||0).toLocaleString('es-MX')}`, { id: newId, name, price });
    captureCount++;
    const counter = document.getElementById('cap-counter');
    counter.textContent = '✓ ' + captureCount + ' capturado' + (captureCount > 1 ? 's' : '');
    counter.style.display = 'inline-block';
    toast('"' + name + '" guardado ✓', 'success');
    resetCaptureForm(true);
  } catch (e) {
    const msg = e?.message && e.message !== 'Error Supabase' ? e.message : 'Error al guardar — intenta de nuevo';
    toast(msg.length > 80 ? 'Error al guardar — intenta de nuevo' : msg, 'error');
    console.error('saveCaptureProduct error:', e);
    btn.disabled = false; btn.textContent = 'Guardar y siguiente →';
  }
}

/* ── SWIPE DOWN TO CLOSE (captura rápida mobile) ── */
(function initAdminSwipeGestures() {
  function swipeDown(sheetEl, closeFn, overlayEl) {
    if (!sheetEl) return;
    let startY = 0, curY = 0, on = false;
    sheetEl.addEventListener('touchstart', e => { startY = e.touches[0].clientY; on = false; curY = 0; }, { passive: true });
    sheetEl.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      if (!on) { if (dy < 10) return; const sc = sheetEl.querySelector('.cap-body'); if (sc && sc.scrollTop > 4) return; on = true; }
      curY = Math.max(0, dy);
      sheetEl.style.transition = 'none';
      sheetEl.style.transform  = `translateY(${curY}px)`;
      if (overlayEl) overlayEl.style.opacity = String(Math.max(0, 1 - curY / 180));
    }, { passive: true });
    sheetEl.addEventListener('touchend', () => {
      if (!on) return; on = false;
      if (curY > 90) {
        sheetEl.style.transition = 'transform .22s ease-in';
        sheetEl.style.transform  = 'translateY(110%)';
        if (overlayEl) overlayEl.style.opacity = '0';
        setTimeout(() => { closeFn(); sheetEl.style.transform = sheetEl.style.transition = ''; if (overlayEl) overlayEl.style.opacity = ''; }, 230);
      } else {
        sheetEl.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
        sheetEl.style.transform  = 'translateY(0)';
        if (overlayEl) overlayEl.style.opacity = '';
        setTimeout(() => { sheetEl.style.transform = sheetEl.style.transition = ''; }, 280);
      }
      curY = 0;
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    swipeDown(document.querySelector('.cap-modal'),
      () => { if (!_capIsDirty() || confirm('Tienes datos sin guardar. ¿Salir de todas formas?')) closeCaptureMode(true); },
      document.getElementById('cap-overlay'));
  });
})();

/* ── MODAL COMPARAR SIMILAR ─────────────────────────────────────────── */
let _simCurrent = 0;

function openSimilarModal(index) {
  _simCurrent = index;
  _renderSimilarModal();
  document.getElementById('sim-overlay').classList.add('open');
}

function closeSimilarModal() {
  document.getElementById('sim-overlay').classList.remove('open');
}

function simGoEdit() {
  const id = window._simIds?.[_simCurrent];
  if (!id) return;
  closeSimilarModal();
  closeForm();
  openForm(id);
}

function _renderSimilarModal() {
  const id = window._simIds?.[_simCurrent];
  const p  = products.find(x => x.id === id);
  if (!p) return;

  document.getElementById('sim-img').src    = p.image || '';
  document.getElementById('sim-img').alt    = p.name;
  document.getElementById('sim-cat').textContent   = p.category_label || p.categoryLabel || '';
  document.getElementById('sim-name').textContent  = p.name;
  document.getElementById('sim-price').textContent = `$${(p.price||0).toLocaleString('es-MX')} MXN`;
  document.getElementById('sim-stock').textContent = p.stock ?? '—';

  const nav = document.getElementById('sim-nav');
  const total = window._simIds?.length || 1;
  if (total <= 1) { nav.style.display = 'none'; return; }
  nav.style.display = 'flex';
  nav.innerHTML = window._simIds.map((_, i) =>
    `<button class="sim-dot${i === _simCurrent ? ' active' : ''}" onclick="openSimilarModal(${i})"></button>`
  ).join('');
}

/* ── FLAG PARA REVISIÓN — guardado en config Supabase, compartido entre dispositivos ── */
let _flagged = []; // [{id, note, ts}]
let _showOnlyFlagged = localStorage.getItem('te_flag_filter') === '1';

async function loadFlagged() {
  const r = await supabaseApi('config?id=eq.flagged_products&select=value');
  if (r.ok && r.data?.[0]?.value) {
    try { _flagged = JSON.parse(r.data[0].value) || []; } catch { _flagged = []; }
  }
}

async function _saveFlagged() {
  await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'flagged_products', value: JSON.stringify(_flagged) })
  });
}

function _flagItem(id) { return _flagged.find(x => x.id === id); }

async function flagProduct(id, note) {
  _flagged = _flagged.filter(x => x.id !== id);
  _flagged.unshift({ id, note: (note || '').trim(), ts: new Date().toISOString() });
  await _saveFlagged();
  _syncFlagFilter();
  renderTable();
  const p = products.find(x => x.id === id);
  if (p && _qvCurrentId === id) _renderQV(p);
  toast('🚩 Marcado para revisar', 'success');
}

async function unflagProduct(id) {
  _flagged = _flagged.filter(x => x.id !== id);
  await _saveFlagged();
  // Si ya no quedan pendientes, salir del filtro automáticamente
  if (_flagged.length === 0) _showOnlyFlagged = false;
  _syncFlagFilter();
  renderTable();
  const p = products.find(x => x.id === id);
  if (p && _qvCurrentId === id) _renderQV(p);
  toast('✓ Revisión completada');
}

function toggleFlagFilter() {
  _showOnlyFlagged = !_showOnlyFlagged;
  _syncFlagFilter();
  renderTable();
}

function toggleStatFilter(key) {
  if (key !== 'todos') TE?.track('filter_chip', { chip: key });
  if (key === 'todos') {
    _statFilter = null;
    if (_showOnlyFlagged) { _showOnlyFlagged = false; localStorage.setItem('te_flag_filter','0'); }
  } else if (key === 'revisar') {
    _statFilter = null;
    _showOnlyFlagged = !_showOnlyFlagged;
    localStorage.setItem('te_flag_filter', _showOnlyFlagged ? '1' : '0');
  } else {
    if (_showOnlyFlagged) { _showOnlyFlagged = false; localStorage.setItem('te_flag_filter','0'); }
    _statFilter = _statFilter === key ? null : key;
  }
  _adminPage = 1;
  renderStats();
  renderTable();
}

function _syncFlagFilter() {
  localStorage.setItem('te_flag_filter', _showOnlyFlagged ? '1' : '0');
  _adminPage = 1;
  renderStats();
  renderTable();
}

function _qvShowFlagForm(id) {
  const zone = document.getElementById('qv-flag-zone');
  if (!zone) return;
  zone.innerHTML = `
    <div class="qv-flag-form">
      <label>Nota para recordar qué revisar:</label>
      <textarea class="qv-flag-textarea" id="qv-flag-ta" rows="3"
        placeholder="Ej: imagen dice 6 piezas, descripción dice 4…"></textarea>
      <div class="qv-flag-btns">
        <button class="qv-btn qv-btn-flag" onclick="flagProduct(${id},document.getElementById('qv-flag-ta').value)">🚩 Marcar</button>
        <button class="qv-btn qv-btn-dup" onclick="(p=>p?_renderQV(p):closeQV())(products.find(x=>x.id===${id}))">Cancelar</button>
      </div>
    </div>`;
  document.getElementById('qv-flag-ta')?.focus();
}

/* ── QUICK VIEW ── */
let _qvCurrentId = null;
let _qvDismissEditor = null; // cierra el editor inline activo antes de abrir otro

function openQV(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  TE?.track('qv_open', { id: p.id, name: p.name });
  _qvCurrentId = id;
  _renderQV(p);
  document.getElementById('qv-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  _initQVSwipe();
}

function closeQV() {
  document.getElementById('qv-overlay').classList.remove('open');
  document.body.style.overflow = '';
  _qvCurrentId = null;
}

function qvNavigate(dir) {
  const list = getFilteredProducts();
  const idx  = list.findIndex(p => p.id === _qvCurrentId);
  if (idx === -1) return;
  const next = list[idx + dir];
  if (!next) return;
  const panel = document.getElementById('qv-panel');
  const animClass = dir > 0 ? 'qv-anim-right' : 'qv-anim-left';
  panel.classList.remove('qv-anim-right', 'qv-anim-left');
  void panel.offsetWidth; // reflow
  _qvCurrentId = next.id;
  _renderQV(next);
  panel.classList.add(animClass);
}

function _qvRefresh(id) {
  const overlay = document.getElementById('qv-overlay');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('open') || overlay.style.display === 'flex';
  if (!isOpen) return;
  const p = products.find(x => x.id === id);
  if (p) _renderQV(p);
}
// Alias — antes era el SRP, ahora ambos usan el mismo QV. Sin llamada circular.
function _srpRefresh(id) {}

async function _qvEditPrice(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const el = e.currentTarget;
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'decimal';
  input.value = p.price;
  input.style.cssText = 'width:100px;padding:3px 8px;border:2px solid var(--gold);border-radius:6px;font-size:1.25rem;font-weight:800;font-family:inherit;outline:none;text-align:center;color:var(--charcoal)';
  el.replaceWith(input);
  input.focus(); input.select();
  let saved = false;
  const save = async () => {
    if (saved) return; saved = true;
    const newPrice = parseFloat(String(input.value).replace(/,/g, '')) || 0;
    if (newPrice === p.price) { _qvRefresh(id); renderTable(); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify({ price: newPrice })
    });
    if (result.ok) { p.price = newPrice; toast(`Precio → $${newPrice.toLocaleString('es-MX')}`); TE?.track('inline_price'); }
    else toast('Error al actualizar precio', 'error');
    _qvRefresh(id); renderTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') { saved = true; _qvRefresh(id); }
  });
}

async function _qvEditName(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const el = e.currentTarget;

  const wrap  = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

  const ta = document.createElement('textarea');
  ta.rows = 2; ta.value = p.name;
  ta.style.cssText = 'width:100%;padding:8px 10px;border:2px solid var(--gold);border-radius:8px;font-size:1.05rem;font-weight:700;font-family:inherit;outline:none;color:var(--charcoal);box-sizing:border-box;resize:none;line-height:1.3';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px';

  const btnSave = document.createElement('button');
  btnSave.type = 'button'; btnSave.textContent = '✓ Guardar';
  btnSave.style.cssText = 'flex:1;padding:9px;background:var(--gold);color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button'; btnCancel.textContent = '✕';
  btnCancel.style.cssText = 'padding:9px 14px;background:#fff;color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation;font-family:inherit';

  row.append(btnSave, btnCancel);
  wrap.append(ta, row);
  el.replaceWith(wrap);
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);

  let saved = false;
  const doSave = async () => {
    if (saved) return; saved = true;
    const newName = ta.value.trim();
    if (!newName || newName === p.name) { _qvRefresh(id); renderTable(); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, { method:'PATCH', body:JSON.stringify({ name: newName }) });
    if (result.ok) { p.name = newName; toast('Nombre actualizado'); TE?.track('inline_name'); }
    else { toast('Error', 'error'); saved = false; }
    _qvRefresh(id); renderTable();
  };
  const doCancel = () => { saved = true; _qvRefresh(id); renderTable(); };

  btnSave.ontouchend   = e2 => { e2.preventDefault(); doSave(); };
  btnSave.onclick      = doSave;
  btnCancel.ontouchend = e2 => { e2.preventDefault(); doCancel(); };
  btnCancel.onclick    = doCancel;
  ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') doCancel(); });
}

async function _qvEditDesc(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const descContainer = document.getElementById('qv-desc');
  if (descContainer) descContainer.classList.add('expanded');
  document.getElementById('qv-desc-toggle')?.style.setProperty('display','none');
  const el = e.currentTarget;

  const wrap = document.createElement('div');
  const ta = document.createElement('textarea');
  ta.value = p.description || ''; ta.rows = 4;
  ta.placeholder = 'Descripción del producto…';
  ta.style.cssText = 'width:100%;padding:8px 10px;border:2px solid var(--gold);border-radius:8px;font-size:.85rem;font-family:inherit;outline:none;color:var(--charcoal);resize:vertical;box-sizing:border-box;display:block;line-height:1.6';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px';

  const btnSave = document.createElement('button');
  btnSave.type = 'button'; btnSave.textContent = '✓ Guardar';
  btnSave.style.cssText = 'flex:1;padding:10px;background:var(--gold);color:#fff;border:none;border-radius:8px;font-size:.84rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button'; btnCancel.textContent = '✕';
  btnCancel.style.cssText = 'padding:10px 14px;background:#fff;color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;cursor:pointer;touch-action:manipulation;font-family:inherit';

  row.append(btnSave, btnCancel);
  wrap.append(ta, row);
  el.replaceWith(wrap);
  ta.focus(); ta.addEventListener('paste', handleDescPaste);

  let saved = false;
  const doSave = async () => {
    if (saved) return; saved = true;
    const newDesc = ta.value.trim();
    if (newDesc === (p.description || '').trim()) { _qvRefresh(id); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, { method:'PATCH', body:JSON.stringify({ description: newDesc || null }) });
    if (result.ok) { p.description = newDesc || null; toast('Descripción actualizada'); TE?.track('inline_desc'); }
    else { toast('Error', 'error'); saved = false; }
    _qvRefresh(id);
  };
  const doCancel = () => { saved = true; _qvRefresh(id); };

  btnSave.ontouchend   = e2 => { e2.preventDefault(); doSave(); };
  btnSave.onclick      = doSave;
  btnCancel.ontouchend = e2 => { e2.preventDefault(); doCancel(); };
  btnCancel.onclick    = doCancel;
  ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') doCancel(); });
}

let _qvSwipeX = null, _qvSwipeY = null, _qvSwipeDir = null;

function _initQVSwipe() {
  const overlay = document.getElementById('qv-overlay');
  if (!overlay || overlay._swipeInited) return;
  overlay._swipeInited = true;

  let _qvDragging = false;

  overlay.addEventListener('touchstart', e => {
    // No iniciar swipe sobre inputs ni sobre la descripción scrolleable
    if (e.target.closest('input, textarea, [contenteditable], .qv-desc')) { _qvSwipeX = null; return; }
    _qvSwipeX   = e.touches[0].clientX;
    _qvSwipeY   = e.touches[0].clientY;
    _qvSwipeDir = null;
    _qvDragging = false;
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (_qvSwipeX === null) return;
    const dx    = Math.abs(e.touches[0].clientX - _qvSwipeX);
    const dy    = e.touches[0].clientY - _qvSwipeY;
    const absDy = Math.abs(dy);
    if (!_qvSwipeDir && (dx > 8 || absDy > 8)) _qvSwipeDir = dx > absDy ? 'h' : 'v';

    // En mobile: el panel sigue el dedo en tiempo real
    if (_qvSwipeDir === 'v' && window.innerWidth <= 600) {
      const panel = document.getElementById('qv-panel');
      if (panel) {
        panel.style.transition = 'none';
        // Hacia arriba: resistencia (efecto rubber band al 25%)
        panel.style.transform = `translateY(${dy > 0 ? dy : dy * 0.25}px)`;
        _qvDragging = true;
      }
    }
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    if (_qvSwipeX === null) return;
    const dx        = e.changedTouches[0].clientX - _qvSwipeX;
    const dy        = e.changedTouches[0].clientY - _qvSwipeY;
    const dir       = _qvSwipeDir;
    const wasDragging = _qvDragging;
    _qvSwipeX = _qvSwipeY = _qvSwipeDir = null;
    _qvDragging = false;

    const panel = document.getElementById('qv-panel');

    if (dir === 'h' && Math.abs(dx) >= 40) {
      // ← → Navegar entre productos (no en galería)
      if (panel) { panel.style.transition = ''; panel.style.transform = ''; }
      if (!e.target.closest('.qv-gallery')) qvNavigate(dx < 0 ? 1 : -1);

    } else if (dir === 'v' && dy > 72) {
      // ↓ suficiente → cerrar
      _qvCloseWithAnim('down');

    } else if (wasDragging && panel) {
      // No llegó al umbral → rebotar de vuelta con spring
      panel.style.transition = 'transform .38s cubic-bezier(.34,1.56,.64,1)';
      panel.style.transform  = 'translateY(0)';
      setTimeout(() => { panel.style.transition = ''; panel.style.transform = ''; }, 380);
    }
  }, { passive: true });
}

function _qvCloseWithAnim(dir) {
  const panel = document.getElementById('qv-panel');
  if (panel) {
    panel.style.transition = 'transform .32s cubic-bezier(.4,0,1,1), opacity .28s ease';
    panel.style.transform  = dir === 'down' ? 'translateY(105%)' : 'translateY(-48px) scale(.95)';
    panel.style.opacity    = '0';
  }
  setTimeout(() => {
    closeQV();
    if (panel) { panel.style.transition = ''; panel.style.transform = ''; panel.style.opacity = ''; }
  }, 300);
}

// Doble tap en imagen → zoom pantalla completa
let _qvLastTap = 0;
function _qvImgDoubleTap(e) {
  const now = Date.now();
  if (now - _qvLastTap < 320) {
    e.preventDefault();
    _qvOpenZoom();
  }
  _qvLastTap = now;
}

// Desktop: clic simple = zoom, doble clic = subir imagen
let _qvClickTimer = null;
function _qvImgClick(e) {
  clearTimeout(_qvClickTimer);
  _qvClickTimer = setTimeout(() => _qvOpenZoom(), 220);
}
function _qvImgDblClick(e) {
  clearTimeout(_qvClickTimer);
  if (!can.editProduct) return;
  document.getElementById('qv-img-file').click();
}

async function _qvHandleImgUpload(input) {
  const file = input.files?.[0];
  if (!file || !_qvCurrentId) return;
  const p = products.find(x => x.id === _qvCurrentId);
  if (!p) return;

  const img = document.getElementById('qv-img');
  if (img) { img.style.opacity = '.4'; img.style.transition = 'opacity .2s'; }
  toast('Subiendo imagen…', '');

  const b64 = await _fileToBase64Resized(file);
  let finalUrl = b64;
  if (driveEp && driveSecret) {
    const driveResult = await uploadToDrive(b64);
    if (driveResult) finalUrl = driveResult;
  }

  const result = await supabaseApi(`products?id=eq.${_qvCurrentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ image: finalUrl })
  });
  input.value = '';
  if (result.ok) {
    p.image = finalUrl;
    renderTable();
    openQV(_qvCurrentId);
    toast('Imagen actualizada ✓', 'success');
  } else {
    if (img) img.style.opacity = '1';
    toast('Error al guardar imagen', 'error');
  }
}

function _qvOpenZoom() {
  const p = products.find(x => x.id === _qvCurrentId);
  if (!p) return;
  // Imagen activa en la galería (o la única imagen)
  const gallery = document.getElementById('qv-gallery');
  let src = p.image;
  if (gallery) {
    const idx = Math.round(gallery.scrollLeft / gallery.offsetWidth);
    const allImgs = [p.image, ...(p.images || [])].filter(Boolean);
    src = allImgs[idx] || p.image;
  }
  const fs = document.createElement('div');
  fs.id = 'qv-zoom';
  fs.innerHTML = `
    <img src="${src}" alt="${p.name}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
    <button onclick="document.getElementById('qv-zoom').remove()" title="Cerrar">✕</button>`;
  fs.onclick = e => { if (e.target === fs) fs.remove(); };
  document.body.appendChild(fs);
  requestAnimationFrame(() => fs.classList.add('open'));
}

let _srpClickTimer = null;
function _srpGalleryScroll(gallery) {
  const idx = Math.round(gallery.scrollLeft / gallery.clientWidth);
  document.querySelectorAll('#srp-gallery-dots .srp-gd').forEach((d, i) => d.classList.toggle('active', i === idx));
}
function _srpGoTo(idx) {
  const g = document.getElementById('srp-gallery');
  if (g) g.scrollTo({ left: idx * g.clientWidth, behavior: 'smooth' });
}

function _srpImgClick(e) {
  clearTimeout(_srpClickTimer);
  _srpClickTimer = setTimeout(() => _srpOpenZoom(), 220);
}
function _srpImgDblClick(e) {
  clearTimeout(_srpClickTimer);
  if (!can.editProduct) return;
  document.getElementById('srp-img-file').click();
}
async function _srpHandleImgUpload(input) {
  const file = input.files?.[0];
  const srpId = parseInt(document.getElementById('scan-result-panel').dataset.srpId);
  if (!file || !srpId) return;
  const p = products.find(x => x.id === srpId);
  if (!p) return;
  const img = document.getElementById('srp-img');
  if (img) { img.style.opacity = '.4'; img.style.transition = 'opacity .2s'; }
  toast('Subiendo imagen…', '');
  const b64 = await _fileToBase64Resized(file);
  let finalUrl = b64;
  if (driveEp && driveSecret) {
    const driveResult = await uploadToDrive(b64);
    if (driveResult) finalUrl = driveResult;
  }
  const result = await supabaseApi(`products?id=eq.${srpId}`, {
    method: 'PATCH', body: JSON.stringify({ image: finalUrl })
  });
  input.value = '';
  if (result.ok) {
    p.image = finalUrl;
    renderTable();
    _srpRefresh(srpId);
    toast('Imagen actualizada ✓', 'success');
  } else {
    if (img) img.style.opacity = '1';
    toast('Error al guardar imagen', 'error');
  }
}

function _srpOpenZoom() {
  const img = document.getElementById('srp-img');
  if (!img?.src) return;
  const fs = document.createElement('div');
  fs.id = 'qv-zoom';
  fs.innerHTML = `<img src="${img.src}" alt=""><button onclick="document.getElementById('qv-zoom').remove()" title="Cerrar">✕</button>`;
  fs.onclick = e => { if (e.target === fs) fs.remove(); };
  document.body.appendChild(fs);
  requestAnimationFrame(() => fs.classList.add('open'));
}

/* ── KIT COMPONENT MINI-POPUP ── */
function _kitCompPopup(id, triggerEl) {
  const existing = document.getElementById('kit-comp-popup');
  if (existing) { existing.remove(); if (existing.dataset.forId == id) return; }
  const comp = products.find(x => x.id === id);
  if (!comp) return;
  const stockTxt = comp.outOfStock || comp.stock === 0
    ? '<span style="color:#E85D5D;font-size:.72rem;font-weight:600">● Agotado</span>'
    : `<span style="color:#2D6A4F;font-size:.72rem;font-weight:600">● ${comp.stock} en stock</span>`;
  const popup = document.createElement('div');
  popup.id = 'kit-comp-popup';
  popup.dataset.forId = id;
  popup.style.cssText = 'position:fixed;z-index:9999;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.22);padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;width:230px;animation:kcp-in .18s ease';
  popup.innerHTML = `
    <style>@keyframes kcp-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}</style>
    <button onclick="document.getElementById('kit-comp-popup').remove()" style="position:absolute;top:8px;right:8px;background:none;border:none;font-size:1rem;cursor:pointer;color:#8A7564;line-height:1;padding:2px">✕</button>
    <img src="${comp.image || DEFAULT_IMG}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'" style="width:190px;height:190px;object-fit:contain;border-radius:8px;background:#F7F2EB">
    <div style="font-size:.86rem;font-weight:600;color:#1C1817;text-align:center;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:100%">${comp.name}</div>
    ${stockTxt}
    ${can.editProduct ? `<button onclick="_openFormFromKitQV(${comp.id})" style="width:100%;padding:8px;border:none;border-radius:8px;background:var(--gold);color:#fff;font-size:.82rem;font-weight:600;cursor:pointer">✏️ Editar producto</button>` : ''}`;
  // Posicionar junto al elemento que se clickeó
  document.body.appendChild(popup);
  const r = triggerEl.getBoundingClientRect();
  const pw = 230, ph = popup.offsetHeight || 260;
  let top = r.top + window.scrollY - ph - 8;
  let left = r.left + window.scrollX + r.width / 2 - pw / 2;
  if (top < 8) top = r.bottom + window.scrollY + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
  const close = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 10);
}

// Teclado: ← → Esc cuando el QV está abierto
document.addEventListener('keydown', e => {
  if (!_qvCurrentId) return;
  const tag = document.activeElement?.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  if (e.key === 'ArrowRight' && !isEditing) qvNavigate(1);
  if (e.key === 'ArrowLeft'  && !isEditing) qvNavigate(-1);
  if (e.key === 'Escape' && !document.getElementById('form-overlay')?.classList.contains('open')) closeQV();
});

function _qvGalleryScroll(gallery) {
  const idx = Math.round(gallery.scrollLeft / gallery.offsetWidth);
  document.querySelectorAll('#qv-gallery-dots .qv-gd').forEach((d, i) => d.classList.toggle('active', i === idx));
}

function _qvGoTo(idx) {
  const g = document.getElementById('qv-gallery');
  if (g) g.scrollTo({ left: idx * g.offsetWidth, behavior: 'smooth' });
}

function _qvImgNav(dir) {
  const g = document.getElementById('qv-gallery');
  if (!g) return;
  const total = g.querySelectorAll('.qv-gallery-img').length;
  const idx = Math.round(g.scrollLeft / g.offsetWidth);
  _qvGoTo(Math.max(0, Math.min(total - 1, idx + dir)));
}

function _renderQV(p) {
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const catColor = getCatColor(p.category);
  const fallback = DEFAULT_IMG;

  // Contador y flechas de navegación
  const list = getFilteredProducts();
  const idx  = list.findIndex(x => x.id === p.id);
  const counterEl = document.getElementById('qv-counter');
  if (counterEl) counterEl.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
  const prevBtn = document.getElementById('qv-prev');
  const nextBtn = document.getElementById('qv-next');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= list.length - 1;

  // Imagen (galería si hay imágenes adicionales)
  const imgContainer = document.getElementById('qv-img-container');
  const allImgs = [p.image || fallback, ...(p.images || [])].filter(Boolean);
  const oosStyle = oos ? 'opacity:.5;filter:grayscale(.4)' : '';
  if (allImgs.length > 1) {
    imgContainer.innerHTML =
      `<div class="qv-gallery" id="qv-gallery" onscroll="_qvGalleryScroll(this)" ontouchend="_qvImgDoubleTap(event)">
        ${allImgs.map((src, i) => `<img class="qv-gallery-img" src="${src}" alt="${p.name} ${i+1}" onerror="this.onerror=null;this.src='${fallback}'" onclick="_qvOpenZoom()" style="cursor:zoom-in;${oosStyle}">`).join('')}
       </div>
       <div class="qv-gallery-dots" id="qv-gallery-dots">
         ${allImgs.map((_,i) => `<span class="qv-gd${i===0?' active':''}" onclick="_qvGoTo(${i})"></span>`).join('')}
       </div>
       <button class="qv-img-nav qv-img-nav-prev" onclick="_qvImgNav(-1)" title="Imagen anterior">&#8249;</button>
       <button class="qv-img-nav qv-img-nav-next" onclick="_qvImgNav(1)"  title="Imagen siguiente">&#8250;</button>`;
  } else {
    imgContainer.innerHTML = `<img id="qv-img" src="${allImgs[0]}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'" onclick="_qvImgClick(event)" ondblclick="_qvImgDblClick(event)" style="width:100%;height:260px;object-fit:contain;display:block;cursor:zoom-in;${oosStyle}" title="Clic: ver completa · Doble clic: cambiar imagen">`;
  }

  // Badge
  document.getElementById('qv-badge-zone').innerHTML = p.badge
    ? `<span class="badge badge-${p.badgeType || 'none'}">${p.badge}</span>`
    : '';

  // Categoría — editable inline
  document.getElementById('qv-cat-row').innerHTML =
    `<span class="cat-dot" style="background:${catColor}"></span>
     <span class="qv-cat-label cat-label-inline qv-editable" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar categoría">${p.categoryLabel || '—'}</span>`;

  // Nombre
  const nameEl = document.getElementById('qv-name');
  if (can.editProduct) {
    nameEl.innerHTML = `<span class="qv-editable" onclick="_qvEditName(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar nombre">${p.name}</span>`;
  } else {
    nameEl.textContent = p.name;
  }

  // Precio
  let priceHTML = `<span class="qv-price qv-editable" onclick="_qvEditPrice(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar precio">$${p.price.toLocaleString('es-MX')} <small style="font-size:.42em;font-weight:400;color:var(--muted);font-family:inherit">MXN</small></span>`;
  if (p.originalPrice && p.originalPrice > p.price) {
    const pct = Math.round((1 - p.price / p.originalPrice) * 100);
    priceHTML += `<span class="qv-price-orig">$${p.originalPrice.toLocaleString('es-MX')}</span>
                  <span class="qv-disc-chip">-${pct}%</span>`;
  }
  document.getElementById('qv-price-row').innerHTML = priceHTML;

  // Chips de estado
  const _pubClick = can.publishProduct
    ? `onclick="_qvTogglePublished(${p.id})" ontouchstart="event.stopPropagation()" style="cursor:pointer" title="Toca para cambiar visibilidad"`
    : '';
  const pubChip  = p.isPublished === false
    ? `<span class="qv-chip qv-chip-hidden" ${_pubClick}>🙈 Oculto</span>`
    : p.outOfStock
      ? `<span class="qv-chip qv-chip-warn">⚠️ Agotado</span>`
      : `<span class="qv-chip qv-chip-web" ${_pubClick}>🌐 Web</span>`;
  const oosChip  = oos
    ? `<span class="qv-chip qv-chip-sold">⊘ Agotado</span>`
    : `<span class="qv-chip qv-chip-ok">✓ Disponible</span>`;
  const stockCls = p.stock === 0 ? 'qv-chip-sold' : p.stock === 1 ? '' : 'qv-chip-ok';
  const featChip    = p.featured ? `<span class="qv-chip">⭐ Destacado</span>` : '';
  const barcodeChip = p.barcode  ? `<span class="qv-chip">🔲 ${p.barcode}</span>` : '';
  let marginChip = '';
  if (p.cost && p.price > 0) {
    const m = Math.round((1 - p.cost / p.price) * 100);
    const mc = m >= 30 ? 'qv-chip-ok' : m >= 10 ? '' : 'qv-chip-sold';
    marginChip = `<span class="qv-chip ${mc}">Margen ${m}%</span>`;
  }
  let stockChipQV;
  if (p.kitItems?.length) {
    const ki = _kitInfo(p);
    if (ki?.stock === 0) {
      const lbl = ki.blocker ? (ki.blocker.length > 16 ? ki.blocker.slice(0, 15) + '…' : ki.blocker) : '?';
      stockChipQV = `<span class="qv-chip qv-chip-sold" title="Falta: ${ki.blocker ?? 'componente agotado'}">🎁 Falta: ${lbl}</span>`;
    } else {
      const n = ki?.stock ?? 0;
      stockChipQV = `<span class="qv-chip qv-chip-ok">🎁 ${n} kit${n !== 1 ? 's' : ''}</span>`;
    }
  } else {
    const stockLbl = p.stock === 0 ? 'Sin stock' : p.stock === 1 ? '1 · Última' : `${p.stock} en stock`;
    stockChipQV = `<span class="qv-chip ${stockCls} qv-editable" onclick="editStockInline(event,${p.id},this)" ontouchstart="event.stopPropagation()" title="Toca para editar stock" style="cursor:pointer">${stockLbl}</span>`;
  }
  document.getElementById('qv-chips').innerHTML =
    oosChip + pubChip + stockChipQV + featChip + marginChip;

  // Descripción
  const descEl   = document.getElementById('qv-desc');
  const descToggle = document.getElementById('qv-desc-toggle');
  descEl.classList.remove('expanded');
  if (can.editProduct) {
    descEl.style.display = '';
    descEl.innerHTML = `<span class="qv-editable" onclick="_qvEditDesc(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar descripción" style="display:block;min-height:1.4em">${_descHtml(p.description) || '<em style="color:var(--muted);font-style:normal;font-size:.82rem">+ Agregar descripción</em>'}</span>`;
  } else {
    descEl.innerHTML = _descHtml(p.description);
    descEl.style.display = p.description ? '' : 'none';
  }
  // Mostrar "Ver más" solo si la descripción desborda los 80px
  if (descToggle) {
    setTimeout(() => {
      const overflows = descEl.scrollHeight > 84;
      descToggle.style.display = overflows ? 'block' : 'none';
      descToggle.textContent   = 'Ver más ↓';
      descEl.classList.toggle('expanded', !overflows);
    }, 50);
  }

  // Componentes del kit
  const kitZone = document.getElementById('qv-kit-components');
  if (kitZone) {
    if (p.kitItems?.length) {
      kitZone.style.display = '';
      kitZone.innerHTML = `<div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">🎁 Incluye</div>` +
        p.kitItems.map(item => {
          const comp = products.find(x => x.id === item.id);
          const clickable = comp ? `onclick="_kitCompPopup(${comp.id},this)" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-light);cursor:pointer;border-radius:6px;transition:background .15s" onmouseenter="this.style.background='var(--gold-light)'" onmouseleave="this.style.background=''"` : `style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-light)"`;
          return `<div ${clickable}>
            <img src="${comp?.image || DEFAULT_IMG}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#F0EBE3" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
            <span style="flex:1;font-size:.82rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${item.name}</span>
            <span style="font-size:.75rem;color:var(--muted);font-weight:600;flex-shrink:0">×${item.qty}</span>
          </div>`;
        }).join('');
    } else {
      kitZone.style.display = 'none';
      kitZone.innerHTML = '';
    }
  }

  // Zona de flag
  const flagData = _flagItem(p.id);
  const flagZone = document.getElementById('qv-flag-zone');
  if (flagZone) {
    if (flagData) {
      const d = new Date(flagData.ts);
      const dateStr = d.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) +
                      ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      flagZone.innerHTML = `
        <div class="qv-flag-active">
          <span class="qv-flag-title">🚩 Pendiente de revisión</span>
          ${flagData.note ? `<p class="qv-flag-note-text">"${flagData.note}"</p>` : ''}
          <span class="qv-flag-ts">Marcado el ${dateStr}</span>
        </div>`;
    } else {
      flagZone.innerHTML = '';
    }
  }

  // ID + barcode en una línea
  const idEl = document.getElementById('qv-id');
  idEl.innerHTML = `<span style="font-family:monospace">ID #${p.id}</span>${p.barcode ? `<span style="font-family:monospace;color:var(--muted)">· ${p.barcode}</span>` : ''}`;

  // Botones de acción
  const btnEdit = can.editProduct
    ? `<button class="qv-btn qv-btn-edit" onclick="closeQV();openForm(${p.id})">${ICON_EDIT} Más campos</button>`
    : '';
  const btnDup  = `<button class="qv-btn qv-btn-dup" onclick="closeQV();duplicateProduct(${p.id})">⧉ Duplicar</button>`;
  const btnPub  = can.publishProduct
    ? `<button class="qv-btn qv-btn-pub" onclick="_qvTogglePublished(${p.id})">${p.isPublished === false ? '🌐 Publicar' : '🙈 Ocultar'}</button>`
    : '';
  const btnDel  = can.deleteProduct
    ? `<button class="qv-btn qv-btn-del" onclick="closeQV();askDelete(${p.id})">✕ Eliminar</button>`
    : '';
  const btnFlag = flagData
    ? `<button class="qv-btn qv-btn-flagdone" onclick="unflagProduct(${p.id})">✓ Revisado</button>`
    : `<button class="qv-btn qv-btn-flag"    onclick="_qvShowFlagForm(${p.id})">🚩 Revisar</button>`;
  const btnTop = can.editProduct
    ? `<button class="qv-btn qv-btn-dup" onclick="moveToTop(${p.id})">📌 Al inicio</button>`
    : '';
  document.getElementById('qv-actions').innerHTML = btnEdit + btnPub + btnTop + btnDup + btnFlag + btnDel;
}

async function _qvTogglePublished(id) {
  await togglePublished(id);
  _qvRefresh(id);
}

function _qvToggleDesc() {
  const descEl = document.getElementById('qv-desc');
  const btn    = document.getElementById('qv-desc-toggle');
  if (!descEl || !btn) return;
  const expanding = !descEl.classList.contains('expanded');
  descEl.classList.toggle('expanded', expanding);
  btn.textContent = expanding ? 'Ver menos ↑' : 'Ver más ↓';
}

function _srpToggleDesc() {
  const descEl = document.getElementById('srp-desc');
  const btn    = document.getElementById('srp-desc-toggle');
  if (!descEl || !btn) return;
  const expanding = !descEl.classList.contains('expanded');
  descEl.classList.toggle('expanded', expanding);
  btn.textContent = expanding ? 'Ver menos ↑' : 'Ver más ↓';
}

// Cerrar QV con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('qv-overlay')?.classList.contains('open')) {
    closeQV();
  }
});

/* ── SUPABASE REALTIME ── */
function initRealtime() {
  if (typeof window.supabase === 'undefined') return;
  try {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    _realtimeChannel = client
      .channel('admin-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, _handleRealtimeProduct)
      .subscribe();
  } catch(err) {
    console.warn('Realtime no disponible:', err);
  }
}

function _handleRealtimeProduct({ eventType, new: row, old }) {
  // Ignorar si hay un input activo en el QV (usuario editando inline)
  if (document.querySelector('#qv-info input, #qv-info textarea')) return;

  if (eventType === 'UPDATE') {
    const idx = products.findIndex(x => x.id === row.id);
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...mapProduct(row) };
      renderTable(); renderStats(); _qvRefresh(row.id);
    }
  } else if (eventType === 'INSERT') {
    if (!products.find(x => x.id === row.id)) {
      products.push(mapProduct(row));
      renderTable(); renderStats();
    }
  } else if (eventType === 'DELETE') {
    const idx = products.findIndex(x => x.id === old.id);
    if (idx >= 0) {
      products.splice(idx, 1);
      if (_qvCurrentId === old.id) closeQV();
      renderTable(); renderStats();
    }
  }
}

/* ══ KIT BUILDER ════════════════════════════════════════════════════════ */
let _kbComponents = [];
let _kbImageDataUrl = null;
let _kbSelectedCatCode = '';

const KIT_DEFAULT_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23FFF8EE'/%3E%3Ctext x='50' y='62' font-size='52' text-anchor='middle' dominant-baseline='middle'%3E%F0%9F%8E%81%3C/text%3E%3C/svg%3E`;

function _kbAutoSuggestCat() {
  if (_kbSelectedCatCode) return;
  const raw = (document.getElementById('kb-name')?.value || '').toLowerCase();
  const name = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!name || name.length < 3) return;

  const words = name.split(/\s+/).filter(w => w.length > 2);
  // subcategorías primero (más específicas)
  const ordered = [...categories].sort((a, b) => (a.parent ? -1 : 1));
  let match = null;
  for (const cat of ordered) {
    const label = cat.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const code  = cat.code.toLowerCase();
    if (words.some(w => label.includes(w) || code.includes(w))) { match = cat; break; }
  }
  // fallback: natura
  if (!match) match = categories.find(c => c.code === 'natura') || categories.find(c => c.code.startsWith('natura'));
  if (match) {
    _kbSelectedCatCode = match.code;
    _updateKitCatBtn(match.code);
  }
}

function openKitBuilder() {
  try {
    if (!can.addProduct) { toast('Sin permiso para agregar productos', 'error'); return; }
    _kbComponents = [];
    _kbImageDataUrl = null;
    _kbSelectedCatCode = '';
    const byId = id => document.getElementById(id);
    byId('kb-name').value = '';
    byId('kb-price').value = '';
    byId('kb-search').value = '';
    byId('kb-search-results').style.display = 'none';
    byId('kb-search-results').innerHTML = '';
    byId('kb-stock-preview').textContent = '';
    byId('kb-save-btn').disabled = false;
    byId('kb-save-btn').textContent = 'Guardar Kit →';
    byId('kb-img-preview').style.display = 'none';
    byId('kb-img-placeholder').style.display = 'flex';
    byId('kb-img-remove').style.display = 'none';
    byId('kb-img-input').value = '';
    byId('kb-price-hint').style.display = 'none';
    const kbCatSel = byId('kb-category');
    if (kbCatSel) kbCatSel.value = '';
    const kbDot = byId('kb-cat-dot');
    const kbLbl = byId('kb-cat-label-display');
    if (kbDot) kbDot.style.background = '#9B8B78';
    if (kbLbl) kbLbl.textContent = 'Seleccionar categoría';
    _kbRenderComponents();
    const kbo = byId('kit-builder-overlay');
    kbo.style.display = 'flex';
    kbo.classList.add('kb-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => byId('kb-name').focus(), 250);
  } catch(e) { toast('Error al abrir Kit Builder: ' + e.message, 'error'); }
}

function closeKitBuilder() {
  const el = document.getElementById('kit-builder-overlay');
  el.classList.remove('kb-open');
  el.style.display = 'none';
  document.body.style.overflow = '';
}

function _kbPopulateCategories() {
  const sel = document.getElementById('kb-category');
  sel.innerHTML = '';
  categories.filter(c => !c.parent).forEach(r => {
    const o = document.createElement('option');
    o.value = r.code; o.textContent = r.label; sel.appendChild(o);
    categories.filter(c => c.parent === r.code).forEach(sub => {
      const s = document.createElement('option');
      s.value = sub.code; s.textContent = '  · ' + sub.label; sel.appendChild(s);
    });
  });
}

function _kbSearch(q) {
  const res = document.getElementById('kb-search-results');
  const term = (q || '').toLowerCase().trim();
  if (!term) { res.style.display = 'none'; return; }
  const taken = new Set(_kbComponents.map(c => c.id));
  const matches = products.filter(p =>
    !p.kitItems?.length && !taken.has(p.id) &&
    p.name.toLowerCase().includes(term)
  ).sort((a, b) => {
    const aOos = a.outOfStock || a.stock === 0;
    const bOos = b.outOfStock || b.stock === 0;
    return aOos - bOos; // con stock primero
  }).slice(0, 8);
  const termEncoded = encodeURIComponent(term);
  const createBtn = `
    <div class="kb-result-item" onclick="_kbCreateDraft(decodeURIComponent('${termEncoded}'))">
      <div style="width:36px;height:36px;border-radius:7px;background:var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">➕</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.84rem;font-weight:600;color:var(--gold-dark)">Crear "${term}" como borrador</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:1px">Stock 0 · Sin publicar · editar después</div>
      </div>
    </div>`;

  if (!matches.length) {
    res.innerHTML = createBtn;
    res.style.display = 'block'; return;
  }
  res.innerHTML = matches.map(p => {
    const isOos = p.outOfStock || p.stock === 0;
    const stockTxt = isOos
      ? `<span style="color:var(--red)">⚠️ Agotado — se puede agregar igual</span>`
      : `${p.stock} en stock`;
    return `
    <div class="kb-result-item" onclick="_kbAddComponent(${p.id})" style="${isOos ? 'opacity:.75' : ''}">
      <img src="${p.image}" style="width:36px;height:36px;object-fit:cover;border-radius:7px;flex-shrink:0;background:#F0EBE3" onerror="this.src='${DEFAULT_IMG}'">
      <div style="flex:1;min-width:0">
        <div style="font-size:.84rem;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:1px">${stockTxt}</div>
      </div>
      <span style="font-size:.75rem;color:var(--gold);font-weight:700;flex-shrink:0">+ agregar</span>
    </div>`;
  }).join('') + createBtn;
  res.style.display = 'block';
}

async function _kbCreateDraft(name) {
  const newId = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const draft = {
    id: newId, name, category: 'por_revisar', category_label: 'Por revisar',
    price: 0, description: '', stock: 0, out_of_stock: true, is_published: false,
    featured: false, image: DEFAULT_IMG, position: products.length
  };
  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(draft)
  });
  if (!result.ok) { toast('Error al crear borrador', 'error'); return; }
  // Agregar al array local con el shape normalizado
  products.push({
    id: newId, name, category: 'por_revisar', categoryLabel: 'Por revisar',
    price: 0, stock: 0, outOfStock: true, isPublished: false,
    image: DEFAULT_IMG, position: products.length - 1
  });
  logActivity('producto_creado', `Borrador de kit: "${name}" — $0`, { id: newId, name, price: 0 });
  document.getElementById('kb-search').value = '';
  document.getElementById('kb-search-results').style.display = 'none';
  _kbAddComponent(newId);
  toast(`✓ "${name}" creado como borrador`);
}

async function _kbHandleImageFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  await _kbSetImageFromFile(file);
}

async function _kbSetImageFromFile(file) {
  const dataUrl = await _fileToBase64Resized(file);
  _kbImageDataUrl = dataUrl;
  const preview = document.getElementById('kb-img-preview');
  preview.src = dataUrl; preview.style.display = 'block';
  document.getElementById('kb-img-placeholder').style.display = 'none';
  document.getElementById('kb-img-remove').style.display = 'block';
}

/* ── PEGAR IMAGEN DESDE PORTAPAPELES (Ctrl+V / Cmd+V) ── */
document.addEventListener('paste', async e => {
  const file = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))?.getAsFile();
  if (!file) return;

  const formOpen = document.getElementById('form-overlay')?.classList.contains('open');
  const kbOpen   = document.getElementById('kit-builder-overlay')?.classList.contains('open');

  if (formOpen) {
    // No pegar si el foco está en un input de texto
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    document.getElementById('save-btn').disabled = true;
    compressAndPreview(file);
    toast('Imagen pegada desde portapapeles');
  } else if (kbOpen) {
    e.preventDefault();
    await _kbSetImageFromFile(file);
    toast('Imagen pegada desde portapapeles');
  }
});

function _kbRemoveImage() {
  _kbImageDataUrl = null;
  document.getElementById('kb-img-preview').style.display = 'none';
  document.getElementById('kb-img-placeholder').style.display = 'flex';
  document.getElementById('kb-img-remove').style.display = 'none';
  document.getElementById('kb-img-input').value = '';
}

function _kbSuggestPrice() {
  const hint = document.getElementById('kb-price-hint');
  if (!_kbComponents.length) { hint.style.display = 'none'; return; }
  const sum = _kbComponents.reduce((t, c) => {
    const p = products.find(x => x.id === c.id);
    return t + (p?.price || 0) * c.qty;
  }, 0);
  if (!sum) { hint.style.display = 'none'; return; }
  hint.style.display = 'block';
  hint.innerHTML = `Suma de componentes: <strong>$${sum.toLocaleString('es-MX')}</strong> · <a href="#" onclick="event.preventDefault();document.getElementById('kb-price').value=${sum};this.parentElement.style.display='none'" style="color:var(--gold);text-decoration:none;font-weight:600">Usar este precio</a>`;
  const priceEl = document.getElementById('kb-price');
  if (!priceEl.value) priceEl.value = sum;
}

function _kbAddComponent(id) {
  const p = products.find(x => x.id === id);
  if (!p || _kbComponents.find(c => c.id === id)) return;
  _kbComponents.push({ id: p.id, name: p.name, qty: 1, stock: p.stock, image: p.image, oos: p.outOfStock || p.stock === 0 });
  document.getElementById('kb-search').value = '';
  document.getElementById('kb-search-results').style.display = 'none';
  _kbRenderComponents();
  _kbUpdateStock();
  _kbSuggestPrice();
}

function _kbRemoveComponent(id) {
  _kbComponents = _kbComponents.filter(c => c.id !== id);
  _kbRenderComponents();
  _kbUpdateStock();
  _kbSuggestPrice();
}

function _kbChangeQty(id, delta) {
  const c = _kbComponents.find(x => x.id === id);
  if (!c) return;
  c.qty = Math.max(1, c.qty + delta);
  _kbRenderComponents();
  _kbUpdateStock();
  _kbSuggestPrice();
}

function _kbRenderComponents() {
  const el = document.getElementById('kb-components');
  if (!_kbComponents.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted);font-size:.82rem;border:1.5px dashed var(--border);border-radius:10px">Busca o escanea productos para agregar como componentes</div>';
    return;
  }
  el.innerHTML = _kbComponents.map(c => `
    <div class="kb-comp">
      <img src="${c.image || DEFAULT_IMG}" style="width:44px;height:44px;object-fit:cover;border-radius:9px;flex-shrink:0;cursor:zoom-in" onerror="this.src='${DEFAULT_IMG}'" onclick="_kitCompPopover(${c.id},event)" title="Ver producto">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="_kitCompPopover(${c.id},event)" title="Ver producto">
        <div style="font-size:.84rem;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${c.name}</div>
        ${c.oos ? `<div style="font-size:.7rem;color:var(--red);margin-top:2px">⚠️ Agotado — disponibilidad calculada cuando haya stock</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
        <button class="kb-qty-btn" onclick="_kbChangeQty(${c.id},-1)">−</button>
        <span style="font-size:.9rem;font-weight:700;min-width:22px;text-align:center">${c.qty}</span>
        <button class="kb-qty-btn" onclick="_kbChangeQty(${c.id},1)">+</button>
        <button class="kb-qty-btn" onclick="_kbRemoveComponent(${c.id})" style="border-color:#FECACA;background:#FEF2F2;color:var(--red)">✕</button>
      </div>
    </div>`).join('');
}

function _kbUpdateStock() {
  const el = document.getElementById('kb-stock-preview');
  if (!_kbComponents.length) { el.textContent = ''; return; }
  const avail = Math.min(..._kbComponents.map(c => Math.floor(c.stock / c.qty)));
  el.textContent = avail > 0
    ? `📦 ${avail} kit${avail !== 1 ? 's' : ''} disponibles con el stock actual`
    : '⚠️ Sin stock suficiente con el inventario actual';
  el.style.color = avail > 0 ? 'var(--green)' : 'var(--red)';
}

async function _saveKit() {
  const name  = document.getElementById('kb-name').value.trim();
  const price = parseFloat(document.getElementById('kb-price').value);
  if (!name)                      { toast('Escribe el nombre del kit', 'error'); document.getElementById('kb-name').focus(); return; }
  if (isNaN(price) || price < 0) { toast('Escribe un precio válido', 'error'); document.getElementById('kb-price').focus(); return; }
  if (_kbComponents.length < 2)   { toast('Un kit necesita al menos 2 componentes', 'error'); return; }

  const catCode = _kbSelectedCatCode || '';
  if (!catCode) { toast('Selecciona una categoría', 'error'); return; }
  const catObj   = categories.find(c => c.code === catCode);
  const catLabel = catObj?.label || catCode;
  const newId    = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const position = products.length;
  const isPublished = can.publishProduct ? true : false;
  const kitItems = _kbComponents.map(c => ({ id: c.id, name: c.name, qty: c.qty, image: c.image || null }));

  const btn = document.getElementById('kb-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';

  let kitImage = KIT_DEFAULT_IMG;
  if (_kbImageDataUrl) {
    const uploaded = await uploadToDrive(_kbImageDataUrl);
    kitImage = uploaded || _kbImageDataUrl;
  }

  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: newId, name, category: catCode, category_label: catLabel,
      price, description: '', image: kitImage,
      badge: '🎁 Kit', badge_type: 'new', featured: false,
      out_of_stock: false, original_price: null,
      barcode: null, stock: 0, cost: null,
      is_published: isPublished, kit_items: kitItems, images: null, position
    })
  });

  if (!result.ok) {
    const errMsg = result.data?.message || result.data?.hint || result.data?.details || `HTTP ${result.status}`;
    toast(`Error al guardar kit: ${errMsg}`, 'error');
    btn.disabled = false; btn.textContent = 'Guardar Kit →';
    return;
  }

  products.push({
    id: newId, name, category: catCode, categoryLabel: catLabel,
    price, originalPrice: null, description: null, image: kitImage,
    badge: '🎁 Kit', badgeType: 'new', featured: false, outOfStock: false,
    barcode: null, stock: 0, cost: null, isPublished, kitItems, images: null, position
  });
  _trackEdit(newId);
  logActivity('producto_creado', `Creó kit "${name}" — $${price.toLocaleString('es-MX')}`, { id: newId, name, price });
  closeKitBuilder();
  // Resetear filtros para que el kit siempre sea visible al crearlo
  const cf = document.getElementById('cat-filter');
  if (cf) cf.value = 'all';
  _statFilter = null;
  renderTable();
  renderStats();
  toast(`🎁 Kit "${name}" creado`, '');
}

async function _dismantleKit(id) {
  const p = products.find(x => x.id === id);
  if (!p?.kitItems?.length) return;

  if (!confirm(`¿Desarmar el kit "${p.name}"?\n\nSe convertirá en un producto individual. Tendrás que asignarle stock manualmente.`)) return;

  const restoreStock = confirm(`¿Devolver stock a los componentes?\n\nSe sumará 1 unidad de cada componente al stock actual.`);
  const kitBackup = JSON.parse(JSON.stringify(p.kitItems));

  const patches = [
    supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ kit_items: null, stock: 0, out_of_stock: true })
    })
  ];

  if (restoreStock) {
    kitBackup.forEach(comp => {
      const compProd = products.find(x => x.id === comp.id);
      if (!compProd) return;
      const newStock = (compProd.stock || 0) + comp.qty;
      patches.push(supabaseApi(`products?id=eq.${comp.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ stock: newStock, out_of_stock: false })
      }));
    });
  }

  const results = await Promise.all(patches);
  if (!results[0].ok) { toast('Error al desarmar el kit', 'error'); return; }

  // Actualizar array local
  p.kitItems = null; p.stock = 0; p.outOfStock = true;
  if (restoreStock) {
    kitBackup.forEach(comp => {
      const compProd = products.find(x => x.id === comp.id);
      if (compProd) { compProd.stock = (compProd.stock || 0) + comp.qty; compProd.outOfStock = false; }
    });
  }

  closeQV();
  renderTable();
  renderStats();
  logActivity('producto_editado', `Desarmó kit "${p.name}"${restoreStock ? ' — stock devuelto a componentes' : ''}`, { id, name: p.name });
  toast(`📦 Kit "${p.name}" desarmado${restoreStock ? ' · stock devuelto a componentes' : ''}`, '');
}

/* ══════════════════════════════════════════════════════════════════
   CARGA MASIVA CON IA — solo superadmin
   ══════════════════════════════════════════════════════════════════ */

let _batchItems = []; // [{dataUrl, name, description, category, status}]

function openBatchUpload() {
  _batchItems = [];
  _batchRenderCards();
  document.getElementById('batch-overlay').style.display = 'flex';
  document.getElementById('batch-file-input').value = '';
  document.getElementById('batch-camera-input').value = '';
}

function closeBatchUpload() {
  document.getElementById('batch-overlay').style.display = 'none';
  _batchItems = [];
}

function _batchDragOver(e) {
  e.preventDefault();
  document.getElementById('batch-dropzone').classList.add('drag-over');
}
function _batchDragLeave(e) {
  document.getElementById('batch-dropzone').classList.remove('drag-over');
}
function _batchDrop(e) {
  e.preventDefault();
  document.getElementById('batch-dropzone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) _batchProcessFiles(files);
}
function _batchHandleInput(input) {
  const files = Array.from(input.files);
  if (files.length) _batchProcessFiles(files);
  input.value = '';
}

async function _batchProcessFiles(files) {
  const btn = document.getElementById('batch-analyze-all-btn');
  for (const file of files) {
    const dataUrl = await _fileToBase64Resized(file);
    _batchItems.push({ dataUrl, name: '', description: '', category: '', status: 'pending' });
  }
  _batchRenderCards();
  if (btn) btn.style.display = '';
}

function _batchRenderCards() {
  const grid = document.getElementById('batch-grid');
  const publishBtn = document.getElementById('batch-publish-btn');
  const analyzeBtn = document.getElementById('batch-analyze-all-btn');
  if (!_batchItems.length) {
    grid.innerHTML = '<div class="batch-empty">Agrega fotos para comenzar</div>';
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicar 0 productos';
    if (analyzeBtn) analyzeBtn.style.display = 'none';
    return;
  }
  const catOptions = categories.map(c => {
    if (c.parent) return `<option value="${c.code}">${c.label}</option>`;
    return `<option value="${c.code}" style="font-weight:700">${c.label}</option>`;
  }).join('');

  grid.innerHTML = _batchItems.map((item, i) => {
    const statusHtml = item.status === 'analyzing'
      ? '<div class="batch-status analyzing">🔄 Analizando…</div>'
      : item.status === 'done'
      ? '<div class="batch-status done">✓ Listo</div>'
      : item.status === 'error'
      ? '<div class="batch-status error">✗ Error — reintenta</div>'
      : '';
    return `
<div class="batch-card" id="bcard-${i}">
  <img class="batch-card-img" src="${item.dataUrl}" alt="">
  <div class="batch-card-body">
    ${statusHtml}
    <div class="batch-card-actions">
      <button class="btn-ai" onclick="_batchAnalyzeOne(${i})" ${item.status === 'analyzing' ? 'disabled' : ''}>✨ Analizar</button>
      <button class="btn-remove" onclick="_batchRemove(${i})" title="Eliminar">✕</button>
    </div>
    <input type="text" placeholder="Nombre del producto" value="${item.name.replace(/"/g,'&quot;')}"
           oninput="_batchItems[${i}].name=this.value;_batchUpdateFooter()">
    <textarea rows="2" placeholder="Descripción…"
              oninput="_batchItems[${i}].description=this.value">${item.description}</textarea>
    <select onchange="_batchItems[${i}].category=this.value">
      <option value="">— Categoría —</option>
      ${catOptions}
    </select>
  </div>
</div>`;
  }).join('');

  // Restore category selects
  _batchItems.forEach((item, i) => {
    const sel = grid.querySelector(`#bcard-${i} select`);
    if (sel && item.category) sel.value = item.category;
  });

  _batchUpdateFooter();
}

function _batchUpdateFooter() {
  const btn = document.getElementById('batch-publish-btn');
  const ready = _batchItems.filter(it => it.name.trim()).length;
  btn.textContent = `Publicar ${ready} producto${ready !== 1 ? 's' : ''}`;
  btn.disabled = ready === 0;
}

function _batchRemove(idx) {
  _batchItems.splice(idx, 1);
  _batchRenderCards();
  if (_batchItems.length) document.getElementById('batch-analyze-all-btn').style.display = '';
}

async function _batchCallGroq(dataUrl) {
  if (!groqApiKey) throw new Error('No hay Groq key configurada');
  const catList = categories.map(c => c.code).join(', ');
  const systemPrompt = `Eres experto en productos de boutique mexicana. Analiza la imagen y responde SOLO JSON válido sin markdown.\nCategorías disponibles: ${catList}`;
  const userPrompt = `Devuelve JSON: {"name":"45-70 chars, marca+tipo+material+color/variante","description":"copy máx 160 chars, empieza con verbo activo, nunca con Este es","category":"código exacto o vacío si dudas","price":null}`;
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]}
      ],
      temperature: 0.3, max_tokens: 400
    })
  });
  if (!resp.ok) {
    const eb = await resp.json().catch(() => ({}));
    throw new Error(eb?.error?.message || `Error ${resp.status}`);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Respuesta IA inválida');
  return JSON.parse(m[0]);
}

async function _batchAnalyzeOne(idx) {
  if (!_batchItems[idx]) return;
  _batchItems[idx].status = 'analyzing';
  _batchRenderCards();
  try {
    const parsed = await _batchCallGroq(_batchItems[idx].dataUrl);
    _batchItems[idx].name        = toTitleCase(_cleanAiName(parsed.name || ''));
    _batchItems[idx].description = formatDescription(parsed.description || '') || '';
    const match = parsed.category ? categories.find(c => c.code === parsed.category) : null;
    _batchItems[idx].category    = match ? match.code : '';
    _batchItems[idx].status      = 'done';
  } catch (err) {
    console.error('Batch IA error:', err);
    _batchItems[idx].status = 'error';
  }
  _batchRenderCards();
}

async function _batchAnalyzeAll() {
  if (!groqApiKey) { toast('Configura la Groq API key en Configuración primero', 'error'); return; }
  const btn = document.getElementById('batch-analyze-all-btn');
  btn.disabled = true; btn.textContent = '⏳ Analizando…';
  for (let i = 0; i < _batchItems.length; i++) {
    if (_batchItems[i].status === 'analyzing') continue;
    _batchItems[i].status = 'analyzing';
    _batchRenderCards();
    try {
      const parsed = await _batchCallGroq(_batchItems[i].dataUrl);
      _batchItems[i].name        = toTitleCase(_cleanAiName(parsed.name || ''));
      _batchItems[i].description = formatDescription(parsed.description || '') || '';
      const match = parsed.category ? categories.find(c => c.code === parsed.category) : null;
      _batchItems[i].category    = match ? match.code : '';
      _batchItems[i].status      = 'done';
    } catch (err) {
      _batchItems[i].status = 'error';
    }
    _batchRenderCards();
    if (i < _batchItems.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  btn.disabled = false; btn.textContent = '✨ Analizar todo';
}

async function _batchPublish() {
  const toPublish = _batchItems.filter(it => it.name.trim());
  if (!toPublish.length) return;
  const btn = document.getElementById('batch-publish-btn');
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const maxResult = await supabaseApi('products?select=id&order=id.desc&limit=1');
    let nextId = (maxResult.ok && maxResult.data?.length) ? maxResult.data[0].id + 1 : 1;
    let created = 0;
    for (const item of toPublish) {
      // Intentar subir a Drive, fallback a base64
      let imageUrl = item.dataUrl;
      if (driveEp && driveSecret) {
        try { imageUrl = await uploadToDrive(item.dataUrl); } catch(_) {}
      }
      const catObj = categories.find(c => c.code === item.category);
      const payload = {
        id: nextId, name: item.name.trim(),
        description: item.description.trim() || null,
        category: item.category || 'por_revisar',
        category_label: catObj?.label || 'Por revisar',
        price: 0, image: imageUrl,
        is_published: false, out_of_stock: false,
        stock: 1, featured: false, position: nextId,
        created_by: getCurrentUserEmail()
      };
      const { ok } = await supabaseApi('products', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(payload)
      });
      if (ok) {
        products.unshift({ ...payload, originalPrice: null, badge: null, badgeType: null, cost: null, createdBy: payload.created_by });
        logActivity('producto_creado', `Creó "${payload.name}" — carga masiva`, { id: nextId, name: payload.name, price: 0 });
        created++;
        nextId++;
      }
    }
    renderTable();
    renderStats();
    toast(`✓ ${created} producto${created !== 1 ? 's' : ''} creado${created !== 1 ? 's' : ''} — ajusta precio y publica en web cuando estén listos`, 'success');
    closeBatchUpload();
  } catch (err) {
    console.error('Batch publish error:', err);
    toast('Error al publicar — revisa la consola', 'error');
    btn.disabled = false;
    btn.textContent = `Publicar ${toPublish.length} productos`;
  }
}

/* ══════════════════════════════════════════════════════
   COMPARE MODAL — comparación lado a lado + IA
   ══════════════════════════════════════════════════════ */

let _compareIds = [];

function openCompareModal() {
  if (selectedIds.size !== 2) return;
  _compareIds = [...selectedIds];
  const [a, b] = _compareIds.map(id => products.find(p => p.id === id));
  if (!a || !b) return;

  document.getElementById('compare-col-a').innerHTML = _renderCmpCol(a, b.id);
  document.getElementById('compare-col-b').innerHTML = _renderCmpCol(b, a.id);

  // Reset AI section
  const aiResult = document.getElementById('compare-ai-result');
  aiResult.textContent = '';
  aiResult.className = '';
  aiResult.style.display = 'none';
  const aiBtn = document.getElementById('compare-ai-btn');
  if (aiBtn) { aiBtn.disabled = false; aiBtn.textContent = '🤖 ¿Son el mismo producto?'; }

  // Render keep/delete actions
  const actions = document.getElementById('compare-actions');
  if (can.deleteProduct) {
    actions.innerHTML = `
      <button class="cmp-keep-btn" onclick="_cmpKeep(${a.id},${b.id})">✓ Quedarme con <b>${_truncate(a.name,22)}</b><br><small style="font-weight:400;opacity:.7">Eliminar el otro</small></button>
      <button class="cmp-keep-btn" onclick="_cmpKeep(${b.id},${a.id})">✓ Quedarme con <b>${_truncate(b.name,22)}</b><br><small style="font-weight:400;opacity:.7">Eliminar el otro</small></button>`;
  } else {
    actions.innerHTML = `<div style="font-size:.8rem;color:var(--muted);grid-column:1/-1;text-align:center">Solo el administrador puede eliminar productos</div>`;
  }

  document.getElementById('compare-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal() {
  document.getElementById('compare-modal').classList.remove('open');
  document.body.style.overflow = '';
  _compareIds = [];
}

function _truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : (str || '');
}

function _renderCmpCol(p, otherId) {
  const margin = p.cost && p.price ? Math.round((p.price - p.cost) / p.price * 100) : null;
  const marginClass = margin === null ? '' : margin >= 30 ? 'green' : margin >= 10 ? 'amber' : 'red';

  const chips = [];
  if (p.isPublished) chips.push('<span class="cmp-chip green">🌐 Publicado</span>');
  else chips.push('<span class="cmp-chip">🙈 Oculto</span>');
  if (p.featured) chips.push('<span class="cmp-chip amber">⭐ Destacado</span>');
  if (p.outOfStock || p.stock === 0) chips.push('<span class="cmp-chip red">Agotado</span>');
  else chips.push(`<span class="cmp-chip green">Stock: ${p.stock}</span>`);
  if (p.barcode) chips.push(`<span class="cmp-chip">🔲 ${p.barcode}</span>`);

  return `
    <img class="cmp-img" src="${p.image || DEFAULT_IMG}" onerror="this.src='${DEFAULT_IMG}'" loading="lazy">
    <div class="cmp-name">${p.name}</div>
    <div class="cmp-meta">${p.categoryLabel || '—'}${p.createdBy ? ` · 👤 ${_creatorName(p.createdBy)}` : ''} · #${p.id}</div>
    <div class="cmp-price">$${(p.price || 0).toLocaleString('es-MX')} <span style="font-size:.75rem;font-weight:400;color:var(--muted)">MXN</span>${p.originalPrice ? `<s>$${p.originalPrice.toLocaleString('es-MX')}</s>` : ''}</div>
    ${margin !== null ? `<div class="cmp-meta"><span class="cmp-chip ${marginClass}">Costo $${p.cost.toLocaleString('es-MX')} · Margen ${margin}%</span></div>` : ''}
    <div>${chips.join('')}</div>
    ${p.description ? `<div class="cmp-desc">${p.description}</div>` : ''}
  `;
}

async function _cmpKeep(keepId, deleteId) {
  if (!can.deleteProduct) return;
  const del = products.find(p => p.id === deleteId);
  if (!del) return;
  if (!confirm(`¿Eliminar "${del.name}"?\n\nSe quedará el otro producto. Esta acción no se puede deshacer.`)) return;

  const btns = document.querySelectorAll('.cmp-keep-btn');
  btns.forEach(b => b.disabled = true);

  const result = await supabaseApi(`products?id=eq.${deleteId}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' }
  });

  if (!result.ok) {
    btns.forEach(b => b.disabled = false);
    toast('Error al eliminar', 'error');
    return;
  }

  logActivity('producto_eliminado', `Eliminó "${del.name}" (duplicado)`, { id: deleteId, name: del.name });
  products = products.filter(p => p.id !== deleteId);
  selectedIds.delete(deleteId);
  selectedIds.delete(keepId);
  if (_qvCurrentId === deleteId) closeQV();
  closeCompareModal();
  renderTable();
  renderStats();
  updateBulkBar();
  toast(`"${del.name}" eliminado — se quedó el producto seleccionado`);
}

async function _urlToBase64(url) {
  if (!url || url.startsWith('data:')) return url;
  // fetch() falla por CORS en Drive URLs — usar canvas vía <img> que sí puede cargar la imagen
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const MAX = 768;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch { resolve(url); } // canvas tainted → fallback a URL
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

async function compareWithAI() {
  if (!groqApiKey) {
    toast('Configura la API key de Groq en Configuración → Integraciones', 'error');
    return;
  }
  const [a, b] = _compareIds.map(id => products.find(p => p.id === id));
  if (!a || !b) return;

  const btn = document.getElementById('compare-ai-btn');
  const result = document.getElementById('compare-ai-result');
  btn.disabled = true;
  btn.textContent = '🤖 Analizando…';
  result.style.display = 'none';
  result.className = '';

  btn.textContent = '🤖 Cargando imágenes…';
  const [imgA, imgB] = await Promise.all([
    _urlToBase64(a.image || DEFAULT_IMG),
    _urlToBase64(b.image || DEFAULT_IMG)
  ]);
  btn.textContent = '🤖 Analizando…';

  // Si las imágenes no se pudieron convertir (Drive bloquea CORS), usar comparación por texto
  const canUseImages = imgA.startsWith('data:') && imgB.startsWith('data:');
  const content = canUseImages
    ? [
        { type: 'text', text: `Eres un asistente de inventario. ¿Son el mismo producto físico? Nombres: "${a.name}" y "${b.name}". Responde en español: SÍ, NO o PROBABLEMENTE, seguido de máximo 2 oraciones de justificación visual. Sé directo.` },
        { type: 'image_url', image_url: { url: imgA } },
        { type: 'image_url', image_url: { url: imgB } }
      ]
    : `Eres un asistente de inventario. Compara estos dos productos de una boutique y determina si son el mismo artículo:\n\nProducto A: "${a.name}" — Categoría: ${a.categoryLabel} — Precio: $${a.price}\nProducto B: "${b.name}" — Categoría: ${b.categoryLabel} — Precio: $${b.price}\n\nResponde en español: SÍ, NO o PROBABLEMENTE, seguido de máximo 2 oraciones de justificación. Sé directo y conciso.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqApiKey}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content }],
        max_tokens: 180,
        temperature: 0.2
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    const text = data.choices?.[0]?.message?.content?.trim() || 'Sin respuesta';
    result.textContent = (canUseImages ? '' : '📝 (comparación por nombre) ') + text;
    result.style.display = 'block';
    result.classList.add('show');
  } catch (e) {
    toast('Error al consultar IA: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🤖 ¿Son el mismo producto?';
  }
}


// --- Interceptor global de escáner USB ---
// Detecta ráfagas de caracteres (< 50ms entre cada uno) = escáner, no teclado humano
;(function(){
  let buf = '', t = null;

  document.addEventListener('keydown', e => {
    if (!e.isTrusted) return; // ignorar eventos sintéticos para evitar loop
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const active = document.activeElement;
    const tag = active?.tagName?.toUpperCase();
    // No interceptar si el cursor ya está en otro campo (formulario, textarea, etc.)
    const inOtherInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      && active.id !== 'search-input';
    if (inOtherInput) return;
    // No interceptar si hay un modal abierto
    if (document.querySelector('#form-overlay[style*="flex"], #qv-overlay.active, .modal-overlay.open')) return;

    if (e.key === 'Enter') {
      if (buf.length >= 4) {
        e.preventDefault();
        const code = buf;
        const exactMatch = products.find(p => p.barcode && p.barcode === code);
        if (exactMatch) {
          showScanResult(exactMatch.id);
        } else {
          const si = document.getElementById('search-input');
          if (si) {
            si.value = code;
            si.dispatchEvent(new Event('input', { bubbles: true }));
            si.focus();
          }
        }
      }
      buf = '';
      clearTimeout(t);
      return;
    }

    if (e.key.length === 1) {
      buf += e.key;
      clearTimeout(t);
      // Si pasan más de 50ms sin otro carácter, no es escáner — resetear
      t = setTimeout(() => { buf = ''; }, 50);
    }
  });
})();
