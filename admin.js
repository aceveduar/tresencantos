const SESSION_KEY  = "te_admin_session";
const LOCKOUT_KEY  = "te_admin_lock";
const DEFAULT_IMG  = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23F7F2EB%22%2F%3E%3Crect%20x%3D%22130%22%20y%3D%22100%22%20width%3D%22140%22%20height%3D%22140%22%20rx%3D%2210%22%20fill%3D%22none%22%20stroke%3D%22%23D4BC94%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22158%22%20cy%3D%22127%22%20r%3D%2214%22%20fill%3D%22%23D4BC94%22%2F%3E%3Cpath%20d%3D%22M130%20210%20L175%20165%20L210%20195%20L255%20150%20L280%20180%20L280%20240%20L130%20240Z%22%20fill%3D%22%23D4BC94%22%20fill-opacity%3D%22.4%22%2F%3E%3C%2Fsvg%3E';

// SVG icons — renderizado fiable en iOS y Android (emoji ✏⧉ fallan en muchas fuentes)
const ICON_EDIT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 60 * 1000; // 1 minuto de bloqueo por cada 5 intentos fallidos

/* ── ROLES Y PERMISOS ── */
// Roles válidos: 'superadmin' | 'encargado' | 'operador' | 'duena'
// encargado = puede todo excepto: Reportes, Actividad, Configuración, Import/Export JSON
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
let can = {
  deleteProduct:   true,
  bulkDelete:      _isSuperOrEncargado,
  importJSON:      ROLE === 'superadmin',
  manageSettings:  ROLE === 'superadmin',
  publishProduct:  true,
  editProduct:     true,
  addProduct:      true,
  masivo:          ROLE === 'superadmin',
  viewReports:     ROLE === 'superadmin' || ROLE === 'duena',
  viewActivity:    ROLE === 'superadmin' || ROLE === 'duena',
};

function _applyUserPermsToAdmin(up) {
  if (!up) return;
  if ('canDeleteProduct'  in up) can.deleteProduct  = up.canDeleteProduct;
  if ('canBulkDelete'     in up) can.bulkDelete     = up.canBulkDelete;
  if ('canImportJSON'     in up) can.importJSON      = up.canImportJSON;
  if ('canManageSettings' in up) can.manageSettings  = up.canManageSettings;
  if ('canPublishProduct' in up) can.publishProduct  = up.canPublishProduct;
  if ('canEditProduct'    in up) can.editProduct     = up.canEditProduct;
  if ('canAddProduct'     in up) can.addProduct      = up.canAddProduct;
  if ('canMasivo'         in up) can.masivo          = up.canMasivo;
  if ('canViewReports'    in up) can.viewReports     = up.canViewReports;
  if ('canViewActivity'   in up) can.viewActivity    = up.canViewActivity;
}

const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';

let products = [];
let _kitItemsEdit = [];
let _allImagesEdit = []; // array unificado: [0]=principal, [1..n]=adicionales
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
  document.getElementById('products-card-grid')?.classList.add('multi-dragging');
  const ghost = document.createElement('div');
  ghost.textContent = `${selectedIds.size} productos`;
  ghost.style.cssText = 'position:fixed;left:-9999px;top:0;background:var(--charcoal);color:#fff;padding:7px 16px;border-radius:50px;font-weight:700;font-size:.82rem;white-space:nowrap';
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, 70, 18);
  requestAnimationFrame(() => ghost.remove());
  // setTimeout = igual que single drag: aplicar DESPUÉS de que dragstart termine
  // Si se aplica card-dragging síncronamente, pointer-events:none cancela el drag en Chrome
  setTimeout(() => {
    selectedIds.forEach(sid => {
      document.querySelector(`tr[data-id="${sid}"]`)?.classList.add('dragging');
      document.querySelector(`.admin-card[data-id="${sid}"]`)?.classList.add('card-dragging');
    });
  }, 0);
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
let currentSort = localStorage.getItem('te_admin_sort') || 'created-new';
let _adminPage = 1;
const ADMIN_PAGE_SIZE = 50;
let _adminLoadObserver = null;
let _realtimeChannel = null;
let _statFilter = null; // 'con-stock' | 'sin-stock' | 'sin-publicar' | 'sin-codigo' | 'ultima-pieza' | 'kits' | 'borradores'
let _showingArchived = false;

/* Categorías — cargadas dinámicamente desde config.categories */
let categories = []; // [{code, label, color}]

const TE = null; // tracking removed — stub keeps TE?.track() calls safe

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
        return `<optgroup label="${_esc(r.label)}"><option value="${r.code}">${_esc(r.label)} — General</option>${subs.map(s => `<option value="${s.code}">${_esc(s.label)}</option>`).join('')}</optgroup>`;
      }
      return `<option value="${r.code}">${_esc(r.label)}</option>`;
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
          return `<optgroup label="${_esc(r.label)}"><option value="${r.code}">${_esc(r.label)} — Todos</option>${subs.map(s => `<option value="${s.code}">${_esc(s.label)}</option>`).join('')}</optgroup>`;
        }
        return `<option value="${r.code}">${_esc(r.label)}</option>`;
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
    `<button class="bcp-chip${isSelected ? ' selected' : ''}" onclick="selectCatSheet('${code}')">${dot(color)}${_esc(label)}</button>`;

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
      <div class="bcp-group-label">${_esc(r.label.toUpperCase())}</div>
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
function _getAdminToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return s?.access_token || SUPABASE_ANON_KEY;
  } catch { return SUPABASE_ANON_KEY; }
}

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

const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const _normCache = new Map();
const _norm = s => {
  const k = s || '';
  if (_normCache.has(k)) return _normCache.get(k);
  const v = k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  _normCache.set(k, v);
  return v;
};

function getFilteredProducts() {
  const q           = _norm(document.getElementById('search-input')?.value) || '';
  const cat         = document.getElementById('cat-filter')?.value || 'all';
  const creatorVal  = document.getElementById('creator-filter')?.value || 'all';
  const filtered = products.filter(p => {
    if (_showingArchived ? !p.isArchived : p.isArchived) return false;
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
      (_statFilter === 'kits'         && Array.isArray(p.kitItems)) ||
      (_statFilter === 'borradores');
    const isKit      = Array.isArray(p.kitItems);
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
    case 'created-new': return [...filtered].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
      return tb - ta;
    });
    case 'created-old': return [...filtered].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
      return ta - tb;
    });
    default:           return filtered; // position (orden del drag & drop)
  }
}

function _driveSz(url, w) {
  if (!url || !url.includes('drive.google.com')) return url;
  return url.replace(/sz=w\d+/, `sz=w${w}`);
}

function _openKitLightbox(p, editFn) {
  document.getElementById('kit-comp-popover')?.remove();
  document.getElementById('kit-comp-popup')?.remove();
  const lb = document.createElement('div');
  lb.id = 'kit-lightbox';
  lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 16px;overscroll-behavior:none;touch-action:none';
  const stockTxt = (p.outOfStock || p.stock === 0)
    ? '<span style="color:#EF4444">Agotado</span>'
    : `<span style="color:#6abe83">● ${p.stock} en stock</span>`;
  lb.innerHTML = `
    <img src="${_driveSz(p.image || DEFAULT_IMG, 900)}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'" style="max-width:100%;max-height:58dvh;border-radius:12px;object-fit:contain;display:block">
    <div style="width:100%;max-width:360px;margin-top:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 16px;backdrop-filter:blur(8px)">
      <div style="font-size:.92rem;font-weight:700;color:#fff;margin-bottom:8px;line-height:1.3">${_esc(p.name)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;margin-bottom:4px"><span style="color:rgba(255,255,255,.5)">Stock</span>${stockTxt}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem"><span style="color:rgba(255,255,255,.5)">Precio</span><span style="color:rgba(255,255,255,.9);font-weight:600">$${(p.price||0).toLocaleString('es-MX')}</span></div>
      ${editFn ? `<button onclick="event.stopPropagation();document.getElementById('kit-lightbox').remove();(${editFn.toString()})()" style="display:block;width:100%;margin-top:10px;background:rgba(201,164,98,.2);border:1px solid rgba(201,164,98,.4);border-radius:8px;padding:9px;color:var(--gold);font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit;text-align:center">✏️ Editar producto →</button>` : ''}
    </div>`;
  lb.onclick = e => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
  let sy = 0, cy = 0, on = false;
  const img = lb.querySelector('img');
  lb.addEventListener('touchstart', e => { sy = e.touches[0].clientY; cy = 0; on = false; }, { passive: true });
  lb.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - sy;
    if (!on && dy > 10) on = true;
    if (!on) return;
    e.preventDefault();
    cy = Math.max(0, dy);
    if (img) img.style.transform = `translateY(${cy * 0.45}px) scale(${Math.max(0.85, 1 - cy / 700)})`;
    lb.style.background = `rgba(0,0,0,${Math.max(0, 0.88 - cy / 280)})`;
  }, { passive: false });
  lb.addEventListener('touchend', () => {
    if (!on) return; on = false;
    if (cy > 80) { lb.remove(); }
    else { if (img) { img.style.transition = 'transform .36s cubic-bezier(.34,1.26,.64,1)'; img.style.transform = ''; setTimeout(() => img.style.transition = '', 360); } lb.style.background = ''; }
    cy = 0;
  });
}

async function supabaseApi(path, opts = {}) {
  const _call = (token) => fetch(getSupabaseUrl() + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text || null; }
    return { ok: r.ok, status: r.status, data };
  });
  const r = await _call(_getAdminToken());
  if (r.status === 401 && await refreshSessionIfNeeded()) return _call(_getAdminToken());
  return r;
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
      if (document.getElementById('cmp-zoom')?.classList.contains('open'))        { closeCmpZoom(); return; }
      if (document.getElementById('form-overlay')?.classList.contains('open'))    { closeForm(); return; }
      if (document.getElementById('del-overlay')?.classList.contains('open'))     { closeDel(); return; }
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
  // Nav links — basado en can (respeta permisos individuales del panel)
  const _hide = href => document.querySelectorAll(`a[href="${href}"]`).forEach(a => a.style.setProperty('display','none'));
  const _show = href => document.querySelectorAll(`a[href="${href}"]`).forEach(a => a.style.removeProperty('display'));
  // Reportar primero limpia, luego aplica estado actual (idempotente para re-llamadas)
  if (!can.viewReports)    _hide('stats.html');    else _show('stats.html');
  if (!can.viewActivity)   _hide('activity.html'); else _show('activity.html');
  if (!can.manageSettings) _hide('settings.html'); else _show('settings.html');
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
  // Botón Carga masiva — permiso canMasivo + config activado
  if (can.masivo && _showBatch) {
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
  try {
    const { name, initial } = _getUserDisplay();
    const avatarEl = document.getElementById('user-avatar');
    const nameEl   = document.getElementById('user-name');
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl)   nameEl.textContent   = name;
  } catch {}
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  // Aplicar permisos cacheados de sesión antes del render de UI (evita flash)
  _applyUserPermsToAdmin(_getMyPermsCached());
  _applyRoleUI();
  // Actualizar async en caso de que el caché estuviera vacío (primera visita o sesión nueva)
  _loadMyPerms().then(up => { if (up) { _applyUserPermsToAdmin(up); _applyRoleUI(); } });

  // Mostrar skeleton mientras cargan datos
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:48px;color:var(--muted)">
    <div style="display:inline-block;width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;margin-bottom:12px"></div>
    <br>Cargando catálogo…
  </td></tr>`;

  await loadCategories();
  await Promise.all([loadAppConfig(), loadFlagged(), loadRecentlyEdited(), loadApartadosMap()]);
  await loadProductsFromSupabase();
  loadSalesCounts(); // no-blocking — actualiza chips cuando termina
  _syncFlagFilter();
  renderStats();
  _refreshCreatorFilter();
  // Restaurar sort guardado
  const sortSel = document.getElementById('sort-select');
  if (sortSel) sortSel.value = currentSort;
  setAdminView(currentAdminView);
  initRealtime();
  localStorage.setItem('te_dup_last_count', _findDuplicatePairs().length);
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
    createdAt: p.created_at || null,
    isArchived: p.is_archived || false
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
    try {
      localStorage.setItem('te_products_cache', JSON.stringify(data));
      localStorage.setItem('te_products_cache_ts', Date.now());
    } catch {}
    return;
  }
  // Fallback: cargar desde caché local si no hay conexión
  try {
    const cached = localStorage.getItem('te_products_cache');
    if (cached) {
      products = JSON.parse(cached).map(mapProduct);
      const ts = parseInt(localStorage.getItem('te_products_cache_ts') || '0');
      const mins = Math.round((Date.now() - ts) / 60000);
      const age = mins < 60 ? `${mins} min` : `${Math.round(mins/60)} h`;
      toast(`Sin conexión — mostrando catálogo de hace ${age}`, 'error');
      return;
    }
  } catch {}
  products = [];
}

/* ── SUPABASE REALTIME ── */
function initRealtime() {
  const load = new Promise((res, rej) => {
    if (window.supabase) { res(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  load.then(() => {
    try {
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${_getAdminToken()}` } }
      });
      _realtimeChannel = client
        .channel('admin-products')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, _handleRealtimeProduct)
        .subscribe();
    } catch(err) {
      console.warn('Realtime no disponible:', err);
    }
  }).catch(() => console.warn('No se pudo cargar supabase.js para Realtime'));
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
