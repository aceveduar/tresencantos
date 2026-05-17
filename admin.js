const SESSION_KEY  = "te_admin_session";
const LOCKOUT_KEY  = "te_admin_lock";
const DEFAULT_IMG  = 'tresencantos_default.png';

// SVG icons — renderizado fiable en iOS y Android (emoji ✏⧉ fallan en muchas fuentes)
const ICON_EDIT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 60 * 1000; // 1 minuto de bloqueo por cada 5 intentos fallidos

/* ── ROLES Y PERMISOS ── */
// El rol se almacena en user_metadata.role del JWT de Supabase Auth.
// Valores válidos: 'superadmin' | 'operador' | 'duena'
// Si no está definido se asume 'operador' (nunca da más permisos de los esperados).
function _parseRole() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    // 1. user object almacenado al hacer login
    const fromUser = s?.user?.user_metadata?.role;
    if (fromUser) return fromUser;
    // 2. fallback: decodificar payload del JWT access_token
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
const can = {
  deleteProduct:   ROLE === 'superadmin',
  bulkDelete:      ROLE === 'superadmin',
  importJSON:      ROLE === 'superadmin',
  manageSettings:  ROLE === 'superadmin',
  publishProduct:  ROLE === 'superadmin',
  editProduct:     ROLE !== 'duena',
  addProduct:      ROLE !== 'duena',
};

const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';

// Anon key — para operaciones de autenticación (login/logout/refresh)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';

// Service role key — bypasea RLS para operaciones de datos del admin (nunca en el sitio público)
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyNjIyNiwiZXhwIjoyMDk0MTAyMjI2fQ.B9nZ1KENDQsUtn9PFwiMTrXuMZuWWIphGnH8XPfeJjQ';

let products = [];
let deleteTargetId = null;
let selectedIds = new Set();
let dragSrcId = null;
let currentSort = 'recent';

/* Categorías — cargadas dinámicamente desde config.categories */
let categories = []; // [{code, label, color}]

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
function allLeafCats()  { return categories.filter(c => !subCats(c.code).length); }
function catDisplayName(c) {
  if (!c.parent) return c.label;
  const parent = categories.find(x => x.code === c.parent);
  return parent ? `${parent.label} › ${c.label}` : c.label;
}

function renderCategorySelects() {
  // Select del formulario de producto — sólo hojas (sin hijos)
  const fSel = document.getElementById('f-category');
  if (fSel) {
    const cur = fSel.value;
    const roots = rootCats();
    fSel.innerHTML = `<option value="" disabled selected>Selecciona una categoría</option>` + roots.map(r => {
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
    tSel.innerHTML = `<option value="all">Categoría</option>` +
      roots.map(r => {
        const subs = subCats(r.code);
        if (subs.length) {
          return `<optgroup label="${r.label}"><option value="${r.code}">${r.label} — Todos</option>${subs.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}</optgroup>`;
        }
        return `<option value="${r.code}">${r.label}</option>`;
      }).join('');
  }
}

const getSupabaseUrl = () => SUPABASE_URL;
const getSupabaseKey = () => SUPABASE_SERVICE_KEY;

/* ── ACTIVITY LOG ── */
function getCurrentUserEmail() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.access_token) return 'desconocido';
    return JSON.parse(atob(s.access_token.split('.')[1])).email || 'desconocido';
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

function getFilteredProducts() {
  const q   = document.getElementById('search-input')?.value.toLowerCase() || '';
  const cat = document.getElementById('cat-filter')?.value || 'all';
  const filtered = products.filter(p => {
    const matchCat = adminCatMatches(p.category, cat);
    const matchQ   = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  switch (currentSort) {
    case 'recent':     return [...filtered].sort((a, b) => b.id - a.id);
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

  // Re-renderizar tabla al rotar el teléfono o redimensionar ventana
  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(renderTable, 180);
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
  await showApp();
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
  // Operador: ocultar nav hacia módulos restringidos
  if (ROLE === 'operador') {
    ['stats.html','activity.html','settings.html'].forEach(href => {
      document.querySelectorAll(`a.tbn-icon[href="${href}"]`).forEach(a => a.style.setProperty('display','none'));
    });
  }
  // Enlace a settings — solo superadmin
  if (!can.manageSettings) {
    document.querySelectorAll('a[href="settings.html"]').forEach(a => a.style.setProperty('display', 'none'));
  }
  // Botones de agregar producto — solo si puede
  if (!can.addProduct) {
    document.querySelectorAll('[onclick="openForm()"]').forEach(b => b.style.setProperty('display', 'none'));
    document.querySelector('.fab-add')?.style.setProperty('display', 'none');
  }
  // Botón "Eliminar ✕" en bulk bar — solo superadmin
  if (!can.bulkDelete) {
    document.querySelector('.bulk-bar .btn-red')?.style.setProperty('display', 'none');
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
}

async function showApp() {
  if (!await requireAuth()) return;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const el = document.getElementById('session-user');
    if (el && s.email) el.textContent = s.email;
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
  await loadAppConfig();
  _loadNameMap();
  await loadProductsFromSupabase();
  renderStats();
  setAdminView(currentAdminView);
}

/* ── LOAD PRODUCTS ── */
async function loadProductsFromSupabase() {
  const result = await supabaseApi('products?select=*&order=position.asc');
  const data = result.data;
  if (result.ok && Array.isArray(data) && data.length) {
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
      originalPrice: p.original_price,
      barcode: p.barcode || null,
      stock: p.stock ?? 0,
      cost: p.cost ?? null,
      isPublished: p.is_published ?? true
    }));
    return;
  }
  products = [];
}

/* ── STATS ── */
async function renderStats() {
  const sinStock   = products.filter(p => p.stock === 0 || p.outOfStock).length;
  const disponibles = products.filter(p => p.stock > 0 && !p.outOfStock).length;

  let ventasHoy = 0, ingresosHoy = 0;
  try {
    const hoy = new Date().toISOString().split('T')[0];
    // Solo ventas completadas (type=venta), no apartados pendientes
    const sr = await supabaseApi(`sales?created_at=gte.${hoy}T00:00:00&type=eq.venta&select=total`);
    if (sr.ok && Array.isArray(sr.data)) {
      ventasHoy   = sr.data.length;
      ingresosHoy = sr.data.reduce((s, x) => s + (parseFloat(x.total) || 0), 0);
    }
  } catch {}

  document.getElementById('stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon si-gold">📦</div>
      <div class="num">${products.length}</div>
      <div class="lbl">Productos</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-green">✅</div>
      <div class="num" style="color:var(--green)">${disponibles}</div>
      <div class="lbl">Con stock</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-red">🚫</div>
      <div class="num" style="color:var(--red)">${sinStock}</div>
      <div class="lbl">Sin stock</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-blue">🛍</div>
      <div class="num">${ventasHoy}</div>
      <div class="lbl">Ventas hoy</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon si-amber">💵</div>
      <div class="num" style="color:var(--green)">$${ingresosHoy.toLocaleString('es-MX')}</div>
      <div class="lbl">Ingresos hoy</div>
    </div>
  `;

  // Alerta de productos sin precio — solo visible para superadmin
  if (can.publishProduct) {
    const sinPrecio = products.filter(p => !p.price || p.price === 0);
    const alertEl   = document.getElementById('no-price-alert');
    const alertTxt  = document.getElementById('no-price-alert-text');
    if (alertEl && alertTxt) {
      if (sinPrecio.length > 0) {
        alertTxt.textContent = `${sinPrecio.length} producto${sinPrecio.length > 1 ? 's' : ''} sin precio — pendiente de revisión antes de publicar`;
        alertEl.style.display = 'flex';
      } else {
        alertEl.style.display = 'none';
      }
    }
  }
}

function filterNoPriceProducts() {
  // Resetea filtros y ordena por precio ascendente → productos con $0 quedan arriba
  const catFilter = document.getElementById('cat-filter');
  const searchInput = document.getElementById('search-input');
  const sortSel = document.getElementById('sort-select');
  if (catFilter) catFilter.value = 'all';
  if (searchInput) searchInput.value = '';
  if (sortSel) { sortSel.value = 'price-asc'; currentSort = 'price-asc'; }
  renderTable();
  document.getElementById('no-price-alert')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Refrescar ingresos/ventas del día cuando el usuario vuelve a esta pestaña
// (por ejemplo, tras cancelar ventas de prueba en el POS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isAuthenticated()) renderStats();
});


/* ── TABLE ── */
const isMobile = () => window.matchMedia('(max-width:1024px)').matches;

let currentAdminView = localStorage.getItem('te_admin_view') || 'list';

function setAdminView(view) {
  currentAdminView = view;
  localStorage.setItem('te_admin_view', view);
  document.getElementById('vbtn-list')?.classList.toggle('active', view === 'list');
  document.getElementById('vbtn-cards')?.classList.toggle('active', view === 'cards');
  renderTable();
}

function adminCard(p) {
  const fallback = DEFAULT_IMG;
  const oos = p.outOfStock || p.stock === 0;
  const sel = selectedIds.has(p.id);
  const catColor = getCatColor(p.category);
  const badgeHTML = p.badge
    ? `<span class="badge badge-${p.badgeType||'none'} ac-badge-pos" style="font-size:.6rem;padding:2px 6px">${p.badge}</span>`
    : '';
  const priceHTML = p.originalPrice
    ? `<span class="ac-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="ac-price">$${p.price.toLocaleString('es-MX')}</span>`
    : `<span class="ac-price">$${p.price.toLocaleString('es-MX')}</span>`;
  const oosTitle = oos ? 'Agotado — toca para marcar disponible' : 'Disponible — toca para agotar';
  const pubTitle = p.isPublished === false ? 'Oculto del sitio — toca para publicar' : 'Visible en sitio — toca para ocultar';

  return `
<div class="admin-card${sel?' card-selected':''}${oos?' card-oos':''}"
     data-id="${p.id}"
     ondblclick="openForm(${p.id})"
     ondragstart="void 0">
  <div class="ac-img-wrap">
    <img class="ac-img" src="${p.image}" alt="${p.name}"
         onerror="this.onerror=null;this.src='${fallback}'">
    <input type="checkbox" class="ac-check row-check"
           ${sel?'checked':''} onchange="toggleRowSelect(${p.id},this.checked)">
    ${badgeHTML}
    <div class="ac-oos-label"></div>
    <button class="ac-star toggle-featured" onclick="toggleFeatured(${p.id})"
            title="${p.featured?'Quitar destacado':'Destacar'}">
      ${p.featured?'⭐':'☆'}
    </button>
  </div>
  <div class="ac-body">
    <div class="ac-name" title="${p.name}">${p.name}</div>
    <div class="ac-meta">
      <span class="cat-dot" style="background:${catColor}"></span>
      <span class="cat-label-inline" onclick="editCategoryInline(event,${p.id})" title="Toca para cambiar categoría" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.categoryLabel}</span>
    </div>
    <div class="ac-price-row">${priceHTML}</div>
    <div class="ac-footer">
      <div style="display:flex;align-items:center;gap:6px">
        <button class="ac-status-dot ${oos?'ac-dot-sold':'ac-dot-avail'}"
                onclick="toggleOutOfStock(${p.id})"
                title="${oosTitle}"></button>
        ${stockChip(p)}
        <button class="ac-pub-dot" onclick="togglePublished(${p.id})"
                ontouchstart="event.stopPropagation()"
                title="${pubTitle}">
          ${p.isPublished===false?'🙈':'🌐'}
        </button>
      </div>
      <div class="ac-actions">
        <button class="action-btn" onclick="openForm(${p.id})" title="Editar">${ICON_EDIT}</button>
        <button class="action-btn btn-duplicate" onclick="duplicateProduct(${p.id})" title="Duplicar">${ICON_COPY}</button>
        ${can.deleteProduct ? `<button class="action-btn del" onclick="askDelete(${p.id})" title="Eliminar">✕</button>` : ''}
      </div>
    </div>
  </div>
</div>`;
}

// Detección de doble-tap en mobile (dblclick no es confiable en touch)
const _dblTapTs = {};
function handleMpcDoubleTap(e, id) {
  if (e.target.closest('button,input,a')) return; // ignorar si toca un control
  const now = Date.now();
  if (now - (_dblTapTs[id] || 0) < 350) {
    delete _dblTapTs[id];
    openForm(id);
  } else {
    _dblTapTs[id] = now;
  }
}

function stockChip(p) {
  // stock = 0 → muestra "0" en rojo (no "Sin stock" — eso ya lo indica el botón de Estado)
  // stock = 1 → gris neutro (pieza única, estado normal)
  // stock > 1 → verde
  const cls = p.stock === 0 ? 'sold' : p.stock === 1 ? 'one' : 'ok';
  return `<span class="stock-chip stock-${cls}" onclick="editStockInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar stock" style="cursor:pointer">${p.stock}</span>`;
}

async function editStockInline(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;

  const chip   = e.currentTarget;
  const mobile = isMobile();

  // type="text" + inputMode="numeric" es más fiable que type="number" en Android
  const input = document.createElement('input');
  input.type       = 'text';
  input.inputMode  = 'numeric';
  input.pattern    = '[0-9]*';
  input.autocomplete = 'off';
  input.value = p.stock;
  input.style.cssText = 'width:52px;padding:3px 7px;border:2px solid var(--gold);border-radius:6px;font-size:16px;outline:none;font-family:inherit;font-weight:600;text-align:center';

  // En mobile: envolver input + botón ✓ explícito (evita depender de blur en Android)
  let container;
  if (mobile) {
    container = document.createElement('span');
    container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;vertical-align:middle';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '✓';
    btn.style.cssText = 'background:var(--gold);border:none;color:#fff;border-radius:6px;padding:4px 7px;font-size:.82rem;cursor:pointer;font-family:inherit;line-height:1;touch-action:manipulation';
    btn.ontouchend = e2 => { e2.preventDefault(); save(); };
    btn.onclick = () => save();
    container.appendChild(input);
    container.appendChild(btn);
    chip.replaceWith(container);
  } else {
    chip.replaceWith(input);
  }

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newStock = Math.max(0, parseInt(input.value) || 0);
    if (newStock === p.stock) { renderTable(); return; }

    const patch = { stock: newStock };
    if (newStock > 0 && p.outOfStock)  patch.out_of_stock = false;
    if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true;

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    if (result.ok) {
      p.stock = newStock;
      if (patch.out_of_stock !== undefined) p.outOfStock = patch.out_of_stock;
      renderStats();
      toast(`Stock → ${newStock}${patch.out_of_stock !== undefined ? (patch.out_of_stock ? ' · Marcado agotado' : ' · Marcado disponible') : ''}`);
    } else {
      toast('Error al actualizar stock', 'error');
    }
    renderTable();
  };

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { saved = true; renderTable(); }
  });

  // setTimeout más fiable que rAF en Android para que el teclado no se cierre
  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
    // Desktop: blur guarda con timeout generoso para evitar blur espurio
    // Mobile: NO usar blur — el botón ✓ es el único trigger de guardado
    if (!mobile) {
      setTimeout(() => { if (!saved) input.addEventListener('blur', save); }, 500);
    }
  }, 50);
}

// getCatColor() reemplaza CAT_COLORS — usa el array dinámico de categorías

function publishedToggle(p) {
  if (p.isPublished === false) {
    return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-hidden" title="Tap para publicar en sitio web">🙈 Oculto</button>`;
  }
  return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-visible" title="Tap para ocultar del sitio web">🌐 Web</button>`;
}

async function togglePublished(id) {
  if (!can.publishProduct) { toast('Solo el administrador puede publicar o ocultar productos', 'error'); return; }
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = p.isPublished === false ? true : false;
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

function editCategoryInline(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const span = e.currentTarget;
  const sel = document.createElement('select');
  sel.style.cssText = 'border:2px solid var(--gold);border-radius:6px;padding:2px 6px;font-size:.78rem;font-family:inherit;background:#fff;color:var(--charcoal);outline:none;max-width:150px;cursor:pointer;touch-action:manipulation';
  rootCats().forEach(r => {
    const subs = subCats(r.code);
    if (subs.length) {
      const og = document.createElement('optgroup');
      og.label = r.label;
      const rootOpt = document.createElement('option');
      rootOpt.value = r.code; rootOpt.textContent = `${r.label} — General`;
      if (r.code === p.category) rootOpt.selected = true;
      og.appendChild(rootOpt);
      subs.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.code; opt.textContent = s.label;
        if (s.code === p.category) opt.selected = true;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    } else {
      const opt = document.createElement('option');
      opt.value = r.code; opt.textContent = r.label;
      if (r.code === p.category) opt.selected = true;
      sel.appendChild(opt);
    }
  });
  span.replaceWith(sel);
  let saved = false;
  const save = async () => {
    if (saved) return; saved = true;
    const newCode = sel.value;
    if (newCode === p.category) { renderTable(); return; }
    const cat = categories.find(c => c.code === newCode);
    if (!cat) { renderTable(); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: newCode, category_label: cat.label })
    });
    if (result.ok) {
      p.category = newCode; p.categoryLabel = cat.label;
      toast(`Categoría → ${cat.label}`);
    } else { toast('Error al actualizar categoría', 'error'); }
    renderTable();
  };
  sel.addEventListener('change', save);
  sel.addEventListener('blur', () => { if (!saved) renderTable(); });
  sel.addEventListener('keydown', ev => { if (ev.key === 'Escape') { saved = true; renderTable(); } });
  setTimeout(() => sel.focus(), 50);
}

function desktopRow(p) {
  const fallback = DEFAULT_IMG;
  const oos = p.outOfStock || p.stock === 0;
  const badgeHTML = p.badge ? `<span class="badge badge-${p.badgeType||'none'} badge-xs">${p.badge}</span>` : '';
  const featStar = `<span onclick="toggleFeatured(${p.id})" class="toggle-featured" title="${p.featured ? 'Quitar destacado' : 'Destacar'}">${p.featured ? '⭐' : '☆'}</span>`;
  const catColor = getCatColor(p.category);
  const catDot = `<span class="cat-dot" style="background:${catColor}"></span>`;
  return `
<tr draggable="true" data-id="${p.id}" class="${selectedIds.has(p.id) ? 'row-selected' : ''}"
    ondblclick="if(!event.target.closest('button,input,select,a,.drag-handle,.cat-label-inline'))openForm(${p.id})"
    title="Doble clic para editar">
  <td class="col-check" style="text-align:center">
    <input type="checkbox" class="row-check" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
  </td>
  <td class="col-product">
    <div style="display:flex;align-items:center;gap:10px;min-width:0">
      <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
      <img class="prod-thumb" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'"${oos ? ' style="opacity:.5;filter:grayscale(.5)"' : ''}>
      <div style="min-width:0;flex:1">
        <div class="prod-name" title="${p.name}">${p.name}</div>
        <div class="prod-meta">
          ${catDot}
          <span class="prod-meta-text"><span class="cat-label-inline" onclick="editCategoryInline(event,${p.id})" title="Clic para cambiar categoría">${p.categoryLabel}</span> · #${p.id}${p.barcode ? ` · 🔲 ${p.barcode}` : ''}</span>
          ${badgeHTML}${featStar}${publishedToggle(p)}
        </div>
      </div>
    </div>
  </td>
  <td class="col-price">
    ${p.originalPrice ? `<div class="orig-price-cell">$${p.originalPrice.toLocaleString('es-MX')}</div>` : ''}
    <div class="price-cell">$${p.price.toLocaleString('es-MX')}</div>
  </td>
  <td class="col-state">
    <div class="state-cell">
      <button onclick="toggleOutOfStock(${p.id})" class="oos-cell ${oos ? 'soldout' : 'available'}">
        ${oos ? 'Agotado' : 'Disponible'}
      </button>
      ${stockChip(p)}
    </div>
  </td>
  <td class="col-actions">
    <div class="actions">
      <button class="action-btn" onclick="openForm(${p.id})" title="Editar">${ICON_EDIT}</button>
      <button class="action-btn" onclick="duplicateProduct(${p.id})" title="Duplicar">${ICON_COPY}</button>
      ${can.deleteProduct ? `<button class="action-btn del" onclick="askDelete(${p.id})" title="Eliminar">✕</button>` : ''}
    </div>
  </td>
</tr>`;
}

function mobileCard(p) {
  const fallback = DEFAULT_IMG;
  const sel = selectedIds.has(p.id);
  const oos = p.outOfStock || p.stock === 0;
  const catColor = getCatColor(p.category);

  const priceHTML = p.originalPrice
    ? `<span class="mpc-price-orig">$${p.originalPrice.toLocaleString('es-MX')}</span>
       <span class="mpc-price">$${p.price.toLocaleString('es-MX')}</span>`
    : `<span class="mpc-price">$${p.price.toLocaleString('es-MX')}</span>`;

  const stockInfo = `<span class="mpc-stock-inline">${stockChip(p)}</span>`;

  const badgeHTML = p.badge
    ? `<span class="badge badge-${p.badgeType||'none'} mpc-badge-inline" style="font-size:.6rem;padding:2px 7px">${p.badge}</span>`
    : '';

  return `
<tr class="mpc-row${sel ? ' row-selected' : ''}" data-id="${p.id}">
  <td>
    <div class="mpc${oos ? ' mpc-oos' : ''}">
      <div class="mpc-top" ontouchstart="handleMpcDoubleTap(event,${p.id})">
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
          <div class="mpc-name">${p.name}</div>
          <div class="mpc-cat-tag">
            <span class="cat-dot" style="background:${catColor}"></span>
            <span class="cat-label-inline" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar categoría">${p.categoryLabel}</span>
            ${badgeHTML}
            <button class="ac-pub-dot"
                    onclick="togglePublished(${p.id})"
                    ontouchstart="event.stopPropagation()"
                    title="${p.isPublished===false?'Oculto — toca para publicar':'Web — toca para ocultar'}">
              ${p.isPublished===false?'🙈':'🌐'}
            </button>
          </div>
          <div class="mpc-price-row">
            ${priceHTML}${stockInfo}
            <button class="ac-status-dot ${oos?'ac-dot-sold':'ac-dot-avail'}"
                    onclick="toggleOutOfStock(${p.id})"
                    ontouchstart="event.stopPropagation()"
                    title="${oos?'Agotado — toca para disponible':'Disponible — toca para agotar'}"></button>
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
    const emptyHTML = `<div class="empty-state">
      <div class="es-icon">${isFiltered ? '🔍' : '📦'}</div>
      <p>${isFiltered ? 'Ningún producto coincide con el filtro.' : 'El catálogo está vacío.'}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${isFiltered ? `<button class="btn btn-outline btn-sm" onclick="clearAdminFilters()">✕ Limpiar filtros</button>` : ''}
        ${!isFiltered ? `<button class="btn btn-gold btn-sm" onclick="openForm()">+ Agregar primer producto</button>` : ''}
      </div>
    </div>`;
    if (useCards && cardGrid) { cardGrid.innerHTML = emptyHTML; }
    else {
      const tbody = document.getElementById('products-table');
      if (tbody) tbody.innerHTML = `<tr><td colspan="5">${emptyHTML}</td></tr>`;
    }
    updateBulkBar();
    return;
  }

  if (useCards && cardGrid) {
    cardGrid.innerHTML = filtered.map(p => adminCard(p)).join('');
    updateBulkBar();
    return;
  }

  // Vista lista: mobile → mpc cards, desktop → tabla
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = filtered.map(p => mobile ? mobileCard(p) : desktopRow(p)).join('');

  updateSelectAllCheckbox();
  if (!mobile) initDragDrop();
}

/* ── SELECTION ── */
function toggleRowSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  const row = document.querySelector(`#products-table tr[data-id="${id}"]`);
  if (row) row.classList.toggle('row-selected', checked);
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

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-count');
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}`;
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
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, image: DEFAULT_IMG, outOfStock: false, position: products.length };
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
        featured: copy.featured, out_of_stock: copy.outOfStock,
        original_price: copy.originalPrice, position: copy.position
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
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r => {
        r.classList.remove('drop-above','drop-below');
      });
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (parseInt(row.dataset.id) === dragSrcId) return;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r => {
        r.classList.remove('drop-above','drop-below');
      });
      row.classList.add(e.clientY < mid ? 'drop-above' : 'drop-below');
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      const targetId = parseInt(row.dataset.id);
      if (targetId === dragSrcId) return;
      const srcIdx = products.findIndex(p => p.id === dragSrcId);
      const tgtIdx = products.findIndex(p => p.id === targetId);
      const isAbove = row.classList.contains('drop-above');
      const [item] = products.splice(srcIdx, 1);
      const insertAt = isAbove ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx) : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
      products.splice(insertAt, 0, item);
      toast('Guardando orden...', '');
      const ok = await save();
      if (ok) toast('Orden guardado ✓');
      renderTable();
    });
  });
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
let groqApiKey  = null;
let driveEp     = null;
let driveSecret = null;

async function loadAppConfig() {
  const r = await supabaseApi('config?id=in.(groq_key,drive_ep,drive_secret,wa_float,captura_rapida)&select=id,value');
  if (r.ok && r.data) {
    r.data.forEach(row => {
      if (row.id === 'groq_key')     groqApiKey  = row.value || null;
      if (row.id === 'drive_ep')     driveEp     = row.value || null;
      if (row.id === 'drive_secret') driveSecret = row.value || null;
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
    });
  }
  // Migración automática: si había config en localStorage la subimos a Supabase una sola vez
  const migrations = [];
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
    const systemPrompt = `Eres el asistente de catálogo de Tres Encantos, boutique mexicana. Vendemos bolsos, mochilas, accesorios, maquillaje y productos Natura.
Voz cálida y aspiracional, español de México. Cuando detectes texto o números en la imagen sé preciso — nunca inventes datos que no estén visibles.`;
    const userPrompt = `Analiza esta imagen de producto y responde ÚNICAMENTE con JSON válido, sin markdown ni texto extra.

OBLIGATORIOS (siempre devuélvelos, no importa qué):
• "name": nombre comercial atractivo, máximo 55 chars. Incluye marca si es legible (ej: "Bolso David Jones Negro"). Sin códigos, sin SKUs.
• "description": 1-2 oraciones emocionales y comerciales — qué hace sentir, para qué ocasión. Máximo 180 chars.

OPCIONALES (devuelve null o "" si no estás seguro — nunca fuerces un valor):
• "category": elige el código exacto de esta lista SOLO si el producto coincide claramente. Si tienes duda, devuelve "".
  Opciones: ${catList}
• "price": busca en la imagen un precio escrito a mano con plumón o lapicero, en etiqueta adhesiva de color, o impreso en el empaque.
  - Devuelve solo el número sin símbolos (ej: 350).
  - NO confundas con: mililitros (ml), onzas (oz), gramos (g), tallas (S/M/L/XL), porcentajes (%), códigos de barras, números de lote o cualquier otro valor numérico que no sea precio.
  - Si no hay precio visible o tienes la mínima duda, devuelve null.

Formato de respuesta:
{"name":"...","description":"...","category":"código exacto o cadena vacía","price":número_sin_símbolo_o_null}`;
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
        temperature: 0.3, max_tokens: 450
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
    if (parsed.name)        { const el = document.getElementById('f-name');        el.value = toTitleCase(parsed.name);  flash(el); }
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
function openForm(id) {
  if (id && !can.editProduct) { toast('Vista de solo lectura', ''); return; }
  if (!id && !can.addProduct) { toast('Sin permiso para agregar productos', 'error'); return; }
  populateBadgeList();
  const overlay = document.getElementById('form-overlay');
  document.getElementById('form-title').textContent = id ? 'Editar producto' : 'Agregar producto';

  if (id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('f-id').value = p.id;
    document.getElementById('f-name').value = p.name;
    document.getElementById('f-category').value = p.category;
    document.getElementById('f-category-label').value = p.categoryLabel;
    document.getElementById('f-price').value = p.price;
    document.getElementById('f-original-price').value = p.originalPrice || '';
    document.getElementById('f-badge').value = p.badge || '';
    document.getElementById('f-badge-type').value = p.badgeType || '';
    document.getElementById('f-description').value = p.description;
    document.getElementById('f-image').value = p.image;
    document.getElementById('f-featured').checked = p.featured;
    document.getElementById('f-out-of-stock').checked = p.outOfStock || false;
    document.getElementById('f-published').checked = p.isPublished !== false; // default true
    document.getElementById('f-barcode').value = p.barcode || '';
    document.getElementById('f-stock').value = p.stock ?? 0;
    document.getElementById('f-cost').value = p.cost ?? '';
    updateMarginDisplay();
    previewImg();
  } else {
    document.getElementById('f-id').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-category').value = categories[0]?.code || 'bolsos';
    document.getElementById('f-category-label').value = categories[0]?.label || '';
    document.getElementById('f-price').value = '';
    document.getElementById('f-original-price').value = '';
    document.getElementById('f-badge').value = '';
    document.getElementById('f-badge-type').value = '';
    document.getElementById('f-description').value = '';
    document.getElementById('f-image').value = '';
    document.getElementById('f-featured').checked = false;
    document.getElementById('f-out-of-stock').checked = false;
    document.getElementById('f-barcode').value = '';
    document.getElementById('f-stock').value = 1;
    document.getElementById('f-cost').value = '';
    document.getElementById('f-margin-display').textContent = 'Margen: —';
    document.getElementById('f-img-preview').classList.remove('show');
    document.getElementById('f-img-file').value = '';
    document.getElementById('f-img-camera').value = '';
    hideAiFormBtn();
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initImageUpload();
  document.getElementById('save-btn').disabled = false;
  _applyPriceLock();
  setTimeout(() => document.getElementById('f-name').focus(), 100);
}

function closeForm() {
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
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

function clearAdminFilters() {
  const s = document.getElementById('search-input');
  const c = document.getElementById('cat-filter');
  if (s) s.value = '';
  if (c) c.value = 'all';
  renderTable();
}

function syncCategoryLabel() {
  const cat = document.getElementById('f-category').value;
  document.getElementById('f-category-label').value = getCatLabel(cat);
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
    // Natura primero — muy específico
    [/natura|ekos|chronos|kaiak|mamae|nuxe/,                                  'natura'],
    // Perfumería Natura
    [/perfum|colonia|desodoran/,                                               'natura_perfumes'],
    // Mochilas y derivados
    [/mochila/,                                                                'mochilas_dama'],
    [/mochila.*(personaj|niñ|infantil|kawaii|escolar)/,                        'mochilas_personaje'],
    [/mochila.*(deport|gym|sport)/,                                            'mochilas_deportivas'],
    [/lonchera/,                                                               'loncheras'],
    [/cangurera|riñonera|fanny/,                                               'cangureras'],
    [/lapicera|estuche.*(lapiz|pluma)/,                                        'lapiceras'],
    // Bolsos
    [/bolso|bolsa.*(dama|mujer|elegante|cuero|piel)/,                          'bolsos_dama'],
    [/bolso.*(casual|tela|lona)|tote|shopper/,                                 'bolsos_casual'],
    [/cosmetiquera|neceser|organizador.*(maquilla|cosmet)/,                    'cosmetiqueras'],
    // Accesorios cabello
    [/diadema|dona|liga|pasador|pinza|broche|valerin|cofia|cepillo|cabello/,   'cabello'],
    // Bisutería
    [/arete|collar|cadena|pulsera|bisuter|joya|anillo|cristal/,               'bisuteria'],
    // Moda
    [/gorra|sombrero|chalina|sombrilla|bufanda/,                               'moda'],
    // Belleza - uñas
    [/uña|esmalte|lima|manicure|postiza|poligel|gel uv|brillo de uña/,         'unas'],
    // Belleza - maquillaje
    [/maquilla|labial|base|corrector|rubor|sombra.*(ojo)|cejas|pestañ|rimmel/, 'maquillaje'],
  ];

  for (const [regex, code] of rules) {
    if (regex.test(name)) {
      const sel = document.getElementById('f-category');
      if (!sel || sel.value === code) return; // ya está asignado, no interrumpir
      sel.value = code;
      if (sel.value !== code) return; // código no existe en las opciones actuales
      syncCategoryLabel();
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

/* Formatea descripción: primera letra mayúscula + punto al final */
function formatDescription(str) {
  if (!str) return str;
  let s = str.trim().replace(/\s+/g, ' ');
  if (!s) return s;
  s = s.charAt(0).toUpperCase() + s.slice(1);
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
  const price = parseFloat(document.getElementById('f-price')?.value);
  const cat   = document.getElementById('f-category')?.value;

  if (!name)                                     markError('f-name',     'El nombre es obligatorio');
  if (cat !== 'por_revisar' && (!price || price <= 0)) markError('f-price', 'Ingresa un precio de venta válido');
  if (!cat)                                      markError('f-category', 'Selecciona una categoría');

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
  if (url) {
    preview.src = url;
    preview.classList.add('show');
    preview.onerror = () => preview.classList.remove('show');
  } else {
    preview.classList.remove('show');
  }
}

/* ── SAVE PRODUCT — targeted PATCH or single POST ── */
async function saveProduct() {
  applyTitleCase('f-name');
  applyDescriptionFormat('f-description');
  if (!validateForm()) return;
  const name = document.getElementById('f-name').value.trim();
  const price = parseFloat(document.getElementById('f-price').value);
  const image = document.getElementById('f-image').value.trim();
  const description = document.getElementById('f-description').value.trim();

  if (!name || isNaN(price)) {
    toast('Completa nombre y precio.', 'error');
    return;
  }

  const idVal = document.getElementById('f-id').value;
  const badge = document.getElementById('f-badge').value.trim();
  const origPrice = parseFloat(document.getElementById('f-original-price').value) || null;
  // Operador: productos nuevos siempre inician como no publicados (requieren revisión de precio)
  const publishedVal = !idVal && !can.publishProduct ? false : document.getElementById('f-published').checked;
  const data = {
    name,
    category: document.getElementById('f-category').value,
    categoryLabel: document.getElementById('f-category-label').value.trim() || getCatLabel(document.getElementById('f-category').value),
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
    isPublished: publishedVal
  };

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
    out_of_stock: data.outOfStock,
    original_price: data.originalPrice,
    barcode: data.barcode,
    stock: data.stock,
    cost: data.cost,
    is_published: data.isPublished
  };

  const saveBtn = document.getElementById('save-btn');
  setBtn(saveBtn, true, idVal ? 'Actualizando...' : 'Guardando...');

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
    }
  } else {
    const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
    const newProduct = { id: maxId + 1, ...data, position: products.length };
    products.push(newProduct);

    const result = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: newProduct.id, ...dbPayload, position: newProduct.position })
    });
    if (!result.ok) {
      products.pop();
      setBtn(saveBtn, false);
      const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
      toast(`Error al guardar: ${errMsg}`, 'error');
      return;
    }
  }

  if (idVal) {
    logActivity('producto_editado', `Editó "${name}"`, { id: parseInt(idVal), name, price });
  } else {
    const newId = products[products.length - 1]?.id;
    logActivity('producto_creado', `Creó "${name}" — $${price.toLocaleString('es-MX')}`, { id: newId, name, price });
  }
  closeForm();
  renderTable();
  renderStats();
  toast(idVal ? 'Guardado ✓' : 'Producto agregado ✓');
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

  products = products.filter(p => !selectedIds.has(p.id));
  selectedIds.clear();
  renderTable();
  renderStats();
  updateBulkBar();
  toast('Productos eliminados', 'success');
}

async function bulkSetCategory() {
  if (!selectedIds.size) return;
  const options = categories.map(c => `  ${c.code} → ${c.label}`).join('\n');
  const cat = prompt(`Nueva categoría para ${selectedIds.size} producto(s):\n\n${options}\n\nEscribe el código:`);
  if (cat === null) return;
  const category = cat.trim().toLowerCase();
  if (!categories.find(c => c.code === category)) {
    toast('Código inválido. Usa uno de la lista.', 'error');
    return;
  }
  const categoryLabel = getCatLabel(category);

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ category, category_label: categoryLabel })
    });
    if (!result.ok) {
      toast('Error al actualizar categoría', 'error');
      return;
    }
  }

  products.forEach(p => {
    if (selectedIds.has(p.id)) { p.category = category; p.categoryLabel = categoryLabel; }
  });
  renderTable();
  renderStats();
  toast(`Categoría "${categoryLabel}" aplicada a ${selectedIds.size} producto(s)`, 'success');
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

function openFormScanner() {
  _scanCtx = 'form';
  document.getElementById('scanner-title').textContent = 'Escanear código de barras';
  _launchScanner();
}

function openSearchScanner() {
  _scanCtx = 'search';
  document.getElementById('scanner-title').textContent = 'Buscar producto por código';
  _launchScanner();
}

function _launchScanner() {
  document.getElementById('scanner-status').textContent = 'Iniciando cámara...';
  document.getElementById('scanner-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  if (_scanInst) { _scanInst.clear().catch(() => {}); _scanInst = null; }

  _scanInst = new Html5Qrcode('scanner-reader');
  _scanInst.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 260, height: 100 } },
    (code) => {
      _onAdminScan(code);
    },
    () => {}
  ).then(() => {
    document.getElementById('scanner-status').textContent = 'Apunta al código de barras';
  }).catch(() => {
    document.getElementById('scanner-status').textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
  });
}

function closeAdminScanner() {
  if (_scanInst) { _scanInst.stop().catch(() => {}); _scanInst = null; }
  document.getElementById('scanner-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function _onAdminScan(code) {
  if (_scanCtx === 'form') {
    document.getElementById('f-barcode').value = code;
    closeAdminScanner();
    toast(`Código asignado: ${code}`, 'success');
  } else if (_scanCtx === 'search') {
    closeAdminScanner();
    const p = products.find(x => x.barcode === code);
    if (p) {
      document.getElementById('search-input').value = p.name;
      renderTable();
      toast(`Encontrado: ${p.name}`, 'success');
    } else {
      toast(`Código "${code}" — ningún producto asignado`, 'error');
    }
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
  const rows = [];
  rootCats().forEach(r => {
    rows.push({ c:r, i:categories.indexOf(r), indent:false });
    subCats(r.code).forEach(s => rows.push({ c:s, i:categories.indexOf(s), indent:true }));
  });
  el.innerHTML = rows.map(({ c, i, indent }) => `
<div class="cat-mgr-row" style="${indent ? `padding-left:20px;border-left:3px solid ${c.color||'#ccc'};margin-left:8px` : ''}">
  <span class="cat-dot" style="background:${c.color||'#9B8B78'};width:10px;height:10px;flex-shrink:0"></span>
  <span class="cat-mgr-code">${c.code}</span>
  <input type="text" value="${c.label}" class="cat-label-input"
         onblur="updateCatLabel(${i}, this.value)"
         onkeydown="if(event.key==='Enter')this.blur()"
         placeholder="Nombre visible">
  <button class="action-btn del" onclick="deleteCategoryAt(${i})" title="Eliminar">✕</button>
</div>`).join('');
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
  const codeInput   = document.getElementById('new-cat-code');
  const labelInput  = document.getElementById('new-cat-label');
  const parentInput = document.getElementById('new-cat-parent');
  const code   = codeInput.value.trim().toLowerCase().replace(/\s+/g, '_');
  const label  = labelInput.value.trim();
  const parent = parentInput?.value || '';
  if (!code || !label) { toast('Completa el código y el nombre', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(code)) { toast('El código solo puede tener letras, números y guión bajo', 'error'); return; }
  if (categories.find(c => c.code === code)) { toast('Ya existe una categoría con ese código', 'error'); return; }
  const color = CAT_PALETTE[categories.length % CAT_PALETTE.length];
  const newCat = { code, label, color };
  if (parent && categories.find(c => c.code === parent)) newCat.parent = parent;
  categories.push(newCat);
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  codeInput.value = ''; labelInput.value = '';
  if (parentInput) parentInput.value = '';
  toast(`${parent ? 'Subcategoría' : 'Categoría'} "${label}" creada ✓`, 'success');
}

/* ── VOICE DICTATION ──────────────────────────────────────────────────── */
let _activeRec = null;

function dictate(fieldId) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('Dictado no disponible. Usa Chrome o Safari.', 'error');
    return;
  }

  const btn   = document.getElementById(`dictate-${fieldId}`);
  const field = document.getElementById(fieldId);

  // Detener grabación activa: nullear ANTES de stop() para que onend sepa que fue el usuario
  if (_activeRec) {
    const rec = _activeRec;
    _activeRec = null;
    rec.stop();
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
  let committedText = '';  // texto final acumulado — persiste entre sub-sesiones Android
  let nextFinalIdx  = 0;  // próximo índice final a procesar en la sub-sesión actual

  btn.textContent = '⏹ Detener';
  btn.classList.add('recording');

  // FIX Android: blur cierra el teclado del sistema → su micrófono deja de escuchar
  field.blur();

  sr.onresult = e => {
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
  };

  sr.onend = () => {
    if (_activeRec === sr) {
      // Android cerró la sub-sesión pero el usuario no detuvo — reiniciar
      nextFinalIdx = 0;  // nueva sub-sesión: e.results empieza desde 0
      try { sr.start(); } catch (_) { /* race condition inofensiva */ }
    } else {
      // Usuario detuvo (_activeRec ya fue nulleado) — confirmar texto final
      const sep   = startValue && committedText ? ' ' : '';
      field.value = (startValue + sep + committedText).trim();
      btn.textContent = '🎤 Dictar';
      btn.classList.remove('recording');
    }
  };

  sr.onerror = e => {
    _activeRec = null;
    btn.textContent = '🎤 Dictar';
    btn.classList.remove('recording');
    const sep   = startValue && committedText ? ' ' : '';
    field.value = (startValue + sep + committedText).trim();
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

function toastUndo(msg, onUndo) {
  const el = document.getElementById('undo-bar');
  const msgEl = document.getElementById('undo-msg');
  if (!el) return toast(msg, 'success');
  if (el._t) { clearTimeout(el._t); el._undo = null; }
  msgEl.textContent = msg;
  el.classList.add('show');
  el._undo = onUndo;
  el._t = setTimeout(() => { el.classList.remove('show'); el._undo = null; }, 7000);
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

/* ══ MODO CAPTURA RÁPIDA ═════════════════════════════════════════════ */
let captureCount = 0;
let captureImageDataUrl = null;

function openCaptureMode() {
  const sel = document.getElementById('cap-category');
  if (sel) {
    sel.innerHTML = '<option value="">Sin categoría</option>';
    const roots = categories.filter(c => !c.parent);
    roots.forEach(r => {
      const subs = categories.filter(c => c.parent === r.code);
      if (subs.length) {
        const grp = document.createElement('optgroup');
        grp.label = r.label;
        subs.forEach(s => { const o = document.createElement('option'); o.value = s.code; o.textContent = s.label; grp.appendChild(o); });
        sel.appendChild(grp);
      } else {
        const o = document.createElement('option'); o.value = r.code; o.textContent = r.label; sel.appendChild(o);
      }
    });
  }
  resetCaptureForm(true);
  document.getElementById('cap-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCaptureMode() {
  document.getElementById('cap-overlay').style.display = 'none';
  document.body.style.overflow = '';
  if (captureCount > 0) renderTable();
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
  document.getElementById('cap-name').value = '';
  document.getElementById('cap-price').value = '';
  document.getElementById('cap-category').value = '';
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
    const sysP = 'Eres el asistente de catálogo de Tres Encantos, boutique mexicana de bolsos, accesorios, maquillaje y Natura. Español de México. Preciso con texto y números visibles.';
    const usrP = 'Analiza esta imagen y responde SOLO con JSON válido sin markdown.\n\nOBLIGATORIOS:\n- "name": nombre comercial atractivo, max 55 chars, incluye marca si visible, sin códigos.\n- "description": 1-2 oraciones emocionales, max 180 chars.\n\nOPCIONALES (null o "" si no estás seguro):\n- "category": código exacto de: ' + catList + '\n- "price": precio en etiqueta/plumón/empaque, solo número (ej: 350). NO confundas con ml, oz, g, tallas, %, códigos. null si dudas.\n\n{"name":"...","description":"...","category":"","price":null}';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqApiKey },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: sysP },
          { role: 'user', content: [{ type: 'text', text: usrP }, { type: 'image_url', image_url: { url: captureImageDataUrl } }] }
        ],
        temperature: 0.3, max_tokens: 400
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
  const name = document.getElementById('cap-name')?.value.trim();
  document.getElementById('cap-save-btn').disabled = !name;
}

async function saveCaptureProduct() {
  const name = document.getElementById('cap-name').value.trim();
  if (!name) return;
  const btn = document.getElementById('cap-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const price   = parseFloat(document.getElementById('cap-price').value) || 0;
    const catCode = document.getElementById('cap-category').value;
    const catObj  = categories.find(c => c.code === catCode);
    const maxId   = products.reduce((m, p) => Math.max(m, p.id), 0);
    const newId   = maxId + 1;
    const payload = {
      id: newId, name, price,
      description: '',
      category: catCode || '',
      category_label: catObj?.label || '',
      image: captureImageDataUrl || '',
      is_published: false, out_of_stock: false,
      stock: 1, featured: false, position: newId
    };
    const { ok, data: saveData } = await supabaseApi('products', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (!ok) { console.error('Supabase error al guardar captura:', saveData); throw new Error('Error Supabase'); }
    products.unshift({ ...payload, originalPrice: null, badge: null, badgeType: null, barcode: null, cost: null });
    captureCount++;
    const counter = document.getElementById('cap-counter');
    counter.textContent = '✓ ' + captureCount + ' capturado' + (captureCount > 1 ? 's' : '');
    counter.style.display = 'inline-block';
    toast('"' + name + '" guardado ✓', 'success');
    resetCaptureForm(true);
  } catch (e) {
    toast('Error al guardar — intenta de nuevo', 'error');
    btn.disabled = false; btn.textContent = 'Guardar y siguiente →';
  }
}
