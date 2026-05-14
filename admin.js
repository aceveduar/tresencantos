const SESSION_KEY  = "te_admin_session";
const LOCKOUT_KEY  = "te_admin_lock";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 60 * 1000; // 1 minuto de bloqueo por cada 5 intentos fallidos

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
  {code:'bolsos',     label:'Bolsos & Mochilas', color:'#C9A462'},
  {code:'accesorios', label:'Accesorios',         color:'#60a5fa'},
  {code:'maquillaje', label:'Maquillaje',          color:'#f472b6'},
  {code:'natura',     label:'Natura',              color:'#34d399'},
  {code:'perfumes',   label:'Perfumes',            color:'#a78bfa'},
  {code:'loncheras',  label:'Loncheras',           color:'#fb923c'}
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
    fSel.innerHTML = roots.map(r => {
      const subs = subCats(r.code);
      if (subs.length) {
        return `<optgroup label="${r.label}">${subs.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}</optgroup>`;
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
          return `<optgroup label="${r.label}">${subs.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}</optgroup>`;
        }
        return `<option value="${r.code}">${r.label}</option>`;
      }).join('');
  }
}

const getSupabaseUrl = () => SUPABASE_URL;
const getSupabaseKey = () => SUPABASE_SERVICE_KEY;

function getFilteredProducts() {
  const q   = document.getElementById('search-input')?.value.toLowerCase() || '';
  const cat = document.getElementById('cat-filter')?.value || 'all';
  const filtered = products.filter(p => {
    const matchCat = cat === 'all' || p.category === cat;
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
      email:         s.email
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
    email:         result.data.user.email
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
async function showApp() {
  if (!await requireAuth()) return;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const el = document.getElementById('session-user');
    if (el && s.email) el.textContent = s.email;
  } catch {}
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';

  // Mostrar skeleton mientras cargan datos
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:48px;color:var(--muted)">
    <div style="display:inline-block;width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;margin-bottom:12px"></div>
    <br>Cargando catálogo…
  </td></tr>`;

  await loadCategories();
  await loadProductsFromSupabase();
  renderStats();
  setAdminView(currentAdminView);
  loadDriveConfig();
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
    const sr = await supabaseApi(`sales?created_at=gte.${hoy}T00:00:00&select=total`);
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
      <div class="lbl">Con existencias</div>
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
}


/* ── TABLE ── */
const isMobile = () => window.matchMedia('(max-width:640px)').matches;

let currentAdminView = localStorage.getItem('te_admin_view') || 'list';

function setAdminView(view) {
  currentAdminView = view;
  localStorage.setItem('te_admin_view', view);
  document.getElementById('vbtn-list')?.classList.toggle('active', view === 'list');
  document.getElementById('vbtn-cards')?.classList.toggle('active', view === 'cards');
  renderTable();
}

function adminCard(p) {
  const fallback = `https://picsum.photos/seed/${p.id+10}/300/300`;
  const oos = p.outOfStock || p.stock === 0;
  const sel = selectedIds.has(p.id);
  const catColor = getCatColor(p.category);
  const badgeHTML = p.badge
    ? `<span class="badge badge-${p.badgeType||'none'} ac-badge-pos" style="font-size:.6rem;padding:2px 6px">${p.badge}</span>`
    : '';
  const priceHTML = p.originalPrice
    ? `<span class="ac-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="ac-price">$${p.price.toLocaleString('es-MX')}</span>`
    : `<span class="ac-price">$${p.price.toLocaleString('es-MX')}</span>`;

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
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.categoryLabel}</span>
      <span style="flex-shrink:0">· #${p.id}</span>
    </div>
    <div class="ac-price-row">${priceHTML}</div>
    <div class="ac-footer">
      <div style="display:flex;align-items:center;gap:4px">
        <button onclick="toggleOutOfStock(${p.id})" class="oos-cell ${oos?'soldout':'available'}" style="font-size:.65rem;padding:3px 8px">
          ${oos?'Agotado':'Disponible'}
        </button>
        ${stockChip(p)}
      </div>
      <div class="ac-actions">
        <button class="action-btn" onclick="openForm(${p.id})" title="Editar">✏</button>
        <button class="action-btn" onclick="duplicateProduct(${p.id})" title="Duplicar">⧉</button>
        <button class="action-btn del" onclick="askDelete(${p.id})" title="Eliminar">✕</button>
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
  return `<span class="stock-chip stock-${cls}" onclick="editStockInline(event,${p.id})" title="Toca para editar stock" style="cursor:pointer">${p.stock}</span>`;
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
      toast(`Stock → ${newStock}${patch.out_of_stock !== undefined ? (patch.out_of_stock ? ' · Marcado agotado' : ' · Marcado disponible') : ''}`, 'success');
    } else {
      toast('Error al actualizar stock', 'error');
    }
    renderTable();
  };

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { saved = true; renderTable(); }
  });

  requestAnimationFrame(() => {
    input.focus();
    if (!mobile) input.select();
    // Desktop: blur guarda con timeout generoso para evitar blur espurio
    // Mobile: NO usar blur — el botón ✓ es el único trigger de guardado
    if (!mobile) {
      setTimeout(() => { if (!saved) input.addEventListener('blur', save); }, 500);
    }
  });
}

// getCatColor() reemplaza CAT_COLORS — usa el array dinámico de categorías

function desktopRow(p) {
  const fallback = `https://picsum.photos/seed/${p.id+10}/80/80`;
  const oos = p.outOfStock || p.stock === 0;
  const badgeHTML = p.badge ? `<span class="badge badge-${p.badgeType||'none'} badge-xs">${p.badge}</span>` : '';
  const featStar = `<span onclick="toggleFeatured(${p.id})" class="toggle-featured" title="${p.featured ? 'Quitar destacado' : 'Destacar'}">${p.featured ? '⭐' : '☆'}</span>`;
  const catColor = getCatColor(p.category);
  const catDot = `<span class="cat-dot" style="background:${catColor}"></span>`;
  return `
<tr draggable="true" data-id="${p.id}" class="${selectedIds.has(p.id) ? 'row-selected' : ''}"
    ondblclick="if(!event.target.closest('button,input,a,.drag-handle'))openForm(${p.id})"
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
          <span class="prod-meta-text">${p.categoryLabel} · #${p.id}${p.barcode ? ` · 🔲 ${p.barcode}` : ''}</span>
          ${badgeHTML}${featStar}
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
      <button class="action-btn" onclick="openForm(${p.id})" title="Editar">✏</button>
      <button class="action-btn" onclick="duplicateProduct(${p.id})" title="Duplicar">⧉</button>
      <button class="action-btn del" onclick="askDelete(${p.id})" title="Eliminar">✕</button>
    </div>
  </td>
</tr>`;
}

function mobileCard(p) {
  const fallback = `https://picsum.photos/seed/${p.id+10}/80/80`;
  const sel = selectedIds.has(p.id);
  const oos = p.outOfStock || p.stock === 0;
  const catColor = getCatColor(p.category);

  const priceHTML = p.originalPrice
    ? `<span class="mpc-price-orig">$${p.originalPrice.toLocaleString('es-MX')}</span>
       <span class="mpc-price">$${p.price.toLocaleString('es-MX')}</span>`
    : `<span class="mpc-price">$${p.price.toLocaleString('es-MX')}</span>`;

  const stockInfo = (!oos && p.stock > 0)
    ? `<span class="mpc-stock-inline">${stockChip(p)}</span>` : '';

  const badgeHTML = p.badge
    ? `<span class="badge badge-${p.badgeType||'none'}" style="font-size:.62rem;padding:3px 8px">${p.badge}</span>`
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
        </div>
        <div class="mpc-info">
          <div class="mpc-name">${p.name}</div>
          <div class="mpc-cat-tag">
            <span class="cat-dot" style="background:${catColor}"></span>
            ${p.categoryLabel}${p.barcode ? ` · 🔲 ${p.barcode}` : ''}
          </div>
          <div class="mpc-price-row">${priceHTML}${stockInfo}</div>
        </div>
      </div>
      <div class="mpc-bar">
        <button onclick="toggleOutOfStock(${p.id})"
                class="oos-cell ${oos ? 'soldout' : 'available'} mpc-oos-btn">
          ${oos ? 'Agotado' : 'Disponible'}
        </button>
        ${badgeHTML}
        <div class="mpc-icon-group">
          <button class="mpc-icon-btn${p.featured ? ' feat-active' : ''}"
                  onclick="toggleFeatured(${p.id})"
                  title="${p.featured ? 'Quitar destacado' : 'Destacar'}">
            ${p.featured ? '⭐' : '☆'}
          </button>
          <button class="mpc-icon-btn" onclick="openForm(${p.id})" title="Editar">✏</button>
          <button class="mpc-icon-btn" onclick="duplicateProduct(${p.id})" title="Duplicar">⧉</button>
          <button class="mpc-icon-btn del-btn" onclick="askDelete(${p.id})" title="Eliminar">✕</button>
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
  toast(newVal ? 'Marcado como destacado ⭐' : 'Quitado de destacados', 'success');
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
  toast(msg, 'success');
}

/* ── DUPLICATE — POST single product ── */
async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const maxId = products.reduce((m, x) => Math.max(m, x.id), 0);
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, outOfStock: false, position: products.length };
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
  toast('Producto duplicado — edítalo para personalizarlo', 'success');
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
      if (ok) toast('Orden guardado ✓', 'success');
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

/* ── GOOGLE DRIVE CONFIG ── */
const DRIVE_EP_KEY     = 'te_drive_ep';
const DRIVE_SECRET_KEY = 'te_drive_secret'; // guardado en localStorage, no en código

function loadDriveConfig() {
  const ep     = localStorage.getItem(DRIVE_EP_KEY);
  const secret = localStorage.getItem(DRIVE_SECRET_KEY);
  const epInput  = document.getElementById('drive-endpoint-input');
  const secInput = document.getElementById('drive-secret-input');
  const statusTxt = document.getElementById('drive-status-txt');
  if (!epInput) return;
  if (ep && secret) {
    epInput.value  = ep;
    secInput.value = secret;
    statusTxt.textContent = '✓ Conectado — imágenes nuevas van a Drive';
    statusTxt.style.color = 'var(--green)';
    document.getElementById('drive-test-btn')?.style && (document.getElementById('drive-test-btn').style.display = '');
    document.getElementById('drive-clear-btn')?.style && (document.getElementById('drive-clear-btn').style.display = '');
  }
}

function saveDriveEndpoint() {
  const ep = document.getElementById('drive-endpoint-input').value.trim();
  if (!ep) { toast('Pega primero la URL del Apps Script', 'error'); return; }

  localStorage.setItem(DRIVE_EP_KEY, ep);

  // Generar secreto único si no existe aún
  let secret = localStorage.getItem(DRIVE_SECRET_KEY);
  if (!secret) {
    secret = 'te_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DRIVE_SECRET_KEY, secret);
  }

  // Mostrar secreto en el campo — el usuario lo copia de ahí
  document.getElementById('drive-secret-input').value = secret;

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
    .catch(() => {
      // Fallback: seleccionar el texto manualmente
      document.getElementById('drive-secret-input').select();
      toast('Selecciona el texto y copia con Ctrl+C / ⌘C', '');
    });
}

function clearDrive() {
  if (!confirm('¿Desconectar Google Drive? Las imágenes futuras se guardarán como base64.')) return;
  localStorage.removeItem(DRIVE_EP_KEY);
  localStorage.removeItem(DRIVE_SECRET_KEY);
  document.getElementById('drive-endpoint-input').value = '';
  document.getElementById('drive-secret-input').value = '';
  document.getElementById('drive-status-txt').textContent = '(no configurado)';
  document.getElementById('drive-status-txt').style.color = '';
  document.getElementById('drive-test-btn').style.display = 'none';
  document.getElementById('drive-clear-btn').style.display = 'none';
  toast('Drive desconectado', '');
}

async function testDriveEndpoint() {
  const ep = localStorage.getItem(DRIVE_EP_KEY);
  if (!ep) return;
  const btn = document.getElementById('drive-test-btn');
  btn.textContent = 'Probando…';
  btn.disabled = true;
  try {
    const r = await fetch(ep);
    const txt = await r.text();
    toast(txt === 'OK' ? 'Conexión con Drive OK ✓' : 'Respuesta inesperada: ' + txt,
          txt === 'OK' ? 'success' : 'error');
  } catch(e) {
    toast('Error al conectar con Drive: ' + e.message, 'error');
  }
  btn.textContent = 'Probar';
  btn.disabled = false;
}

async function uploadToDrive(b64) {
  const ep     = localStorage.getItem(DRIVE_EP_KEY);
  const secret = localStorage.getItem(DRIVE_SECRET_KEY);
  if (!ep || !secret) return null;
  try {
    const res = await fetch(ep, {
      method: 'POST',
      body: JSON.stringify({ secret, image: b64, name: `producto_${Date.now()}.jpg` })
    });
    const data = await res.json();
    return data.ok ? data.url : null;
  } catch { return null; }
}

/* ── IMAGE UPLOAD ── */
let imageUploadController = null;

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

      // Intentar subir a Drive; si no hay Drive o falla → usar base64
      (async () => {
        const hasDrive = !!localStorage.getItem(DRIVE_EP_KEY);
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

/* ── FORM ── */
function openForm(id) {
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
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initImageUpload();
  document.getElementById('save-btn').disabled = false;
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
  const data = {
    name,
    category: document.getElementById('f-category').value,
    categoryLabel: document.getElementById('f-category-label').value.trim() || getCatLabel(document.getElementById('f-category').value),
    price,
    originalPrice: (origPrice && origPrice > price) ? origPrice : null,
    description,
    image: image || `https://picsum.photos/seed/${Date.now()}/500/500`,
    badge: badge || null,
    badgeType: document.getElementById('f-badge-type').value || null,
    featured: document.getElementById('f-featured').checked,
    outOfStock: document.getElementById('f-out-of-stock').checked,
    barcode: document.getElementById('f-barcode').value.trim() || null,
    stock: parseInt(document.getElementById('f-stock').value) || 0,
    cost: parseFloat(document.getElementById('f-cost').value) || null,
    isPublished: document.getElementById('f-published').checked
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

  closeForm();
  renderTable();
  renderStats();
  toast(idVal ? 'Producto actualizado ✓' : 'Producto agregado ✓', 'success');
}

/* ── DELETE ── */
function askDelete(id) {
  deleteTargetId = id;
  document.getElementById('del-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDel() {
  deleteTargetId = null;
  document.getElementById('del-overlay').classList.remove('open');
  document.body.style.overflow = '';
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

  products = products.filter(p => p.id !== id);
  selectedIds.delete(id);
  closeDel();
  renderTable();
  renderStats();
  updateBulkBar();

  // Toast con opción de deshacer (7 segundos)
  toastUndo(`"${deleted?.name || 'Producto'}" eliminado`, async () => {
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
      toast(`"${deleted.name}" restaurado ✓`, 'success');
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

  // Si ya hay grabación activa → detener
  if (_activeRec) {
    _activeRec.stop();
    return;
  }

  const sr = new SR();
  sr.lang            = 'es-MX';
  sr.continuous      = true;   // no para en silencios cortos
  sr.interimResults  = true;   // muestra texto mientras se habla

  _activeRec = sr;

  const startValue = field.value.trimEnd();
  let spoken = '';             // texto final acumulado, reconstruido en cada evento

  btn.textContent = '⏹ Detener';
  btn.classList.add('recording');

  sr.onresult = e => {
    // Recorrer TODOS los resultados desde 0 (no desde e.resultIndex)
    // para evitar duplicados cuando el browser re-entrega el mismo índice
    const finals = [];
    let interim  = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finals.push(e.results[i][0].transcript.trim());
      else interim += e.results[i][0].transcript;
    }
    spoken = finals.join(' ');                              // reconstrucción limpia
    const sep = startValue && (spoken || interim) ? ' ' : '';
    field.value = startValue + sep + spoken + (interim ? ' ' + interim.trim() : '');
  };

  const finish = () => {
    _activeRec = null;
    btn.textContent = '🎤 Dictar';
    btn.classList.remove('recording');
    const sep = startValue && spoken ? ' ' : '';
    field.value = (startValue + sep + spoken).trim();
  };

  sr.onend   = finish;
  sr.onerror = e => {
    finish();
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
