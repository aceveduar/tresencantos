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

const CAT_LABELS = {
  bolsos: "Bolsos & Mochilas",
  accesorios: "Accesorios",
  maquillaje: "Maquillaje",
  natura: "Natura"
};

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
      if (document.getElementById('ocr-overlay')?.classList.contains('open'))     { closeOcrScanner(); return; }
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
  await loadProductsFromSupabase();
  renderStats();
  renderTable();
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
      stock: p.stock ?? 0
    }));
    return;
  }
  products = [];
}

/* ── STATS ── */
async function renderStats() {
  const sinStock   = products.filter(p => p.stock === 0).length;
  const disponibles = products.filter(p => p.stock > 0).length;

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

  const chip = e.currentTarget;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.value = p.stock;
  input.style.cssText = 'width:64px;padding:3px 8px;border:2px solid var(--gold);border-radius:6px;font-size:.78rem;outline:none;font-family:inherit;font-weight:600;text-align:center';
  chip.replaceWith(input);
  input.select();
  input.focus();

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newStock = Math.max(0, parseInt(input.value) || 0);
    if (newStock === p.stock) { renderTable(); return; }

    // Sincronizar outOfStock automáticamente con el stock
    const patch = { stock: newStock };
    if (newStock > 0 && p.outOfStock)  patch.out_of_stock = false; // reponer = disponible
    if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true; // agotarse = no disponible

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

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { saved = true; renderTable(); }
  });
  input.addEventListener('blur', save);
}

const CAT_COLORS = {
  bolsos:'#C9A462', accesorios:'#60a5fa',
  maquillaje:'#f472b6', natura:'#34d399',
  perfumes:'#a78bfa', loncheras:'#fb923c'
};

function desktopRow(p) {
  const fallback = `https://picsum.photos/seed/${p.id+10}/80/80`;
  const oos = p.outOfStock || p.stock === 0;
  const badgeHTML = p.badge ? `<span class="badge badge-${p.badgeType||'none'} badge-xs">${p.badge}</span>` : '';
  const featStar = `<span onclick="toggleFeatured(${p.id})" class="toggle-featured" title="${p.featured ? 'Quitar destacado' : 'Destacar'}">${p.featured ? '⭐' : '☆'}</span>`;
  const catColor = CAT_COLORS[p.category] || '#9B8B78';
  const catDot = `<span class="cat-dot" style="background:${catColor}"></span>`;
  return `
<tr draggable="true" data-id="${p.id}" class="${selectedIds.has(p.id) ? 'row-selected' : ''}">
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
  const catColor = CAT_COLORS[p.category] || '#9B8B78';

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
      <div class="mpc-top">
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
  const filtered = getFilteredProducts();
  const mobile = isMobile();

  const countEl = document.getElementById('prod-count');
  if (countEl) {
    countEl.style.display = products.length === 0 ? 'none' : '';
    if (products.length > 0) {
      countEl.textContent = filtered.length === products.length
        ? `${products.length} producto${products.length !== 1 ? 's' : ''}`
        : `${filtered.length} de ${products.length}`;
    }
  }

  const tbody = document.getElementById('products-table');
  if (!filtered.length) {
    const isFiltered = (document.getElementById('search-input')?.value || '') ||
                       (document.getElementById('cat-filter')?.value !== 'all');
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <div class="es-icon">${isFiltered ? '🔍' : '📦'}</div>
      <p>${isFiltered ? 'Ningún producto coincide con el filtro.' : 'El catálogo está vacío.'}</p>
      ${!isFiltered ? `<button class="btn btn-gold btn-sm" onclick="openForm()">+ Agregar primer producto</button>` : ''}
    </div></td></tr>`;
    updateBulkBar();
    return;
  }

  tbody.innerHTML = filtered.map(p => mobile ? mobileCard(p) : desktopRow(p)).join('');

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

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ out_of_stock: newVal })
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar estado de stock', 'error');
    return;
  }
  p.outOfStock = newVal;
  renderTable();
  renderStats();
  toast(newVal ? 'Marcado como agotado' : 'Marcado como disponible', 'success');
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
      document.getElementById('f-image').value = b64;
      const preview = document.getElementById('f-img-preview');
      preview.src = b64;
      preview.classList.add('show');
      document.getElementById('save-btn').disabled = false;
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
    document.getElementById('f-barcode').value = p.barcode || '';
    document.getElementById('f-stock').value = p.stock ?? 0;
    previewImg();
  } else {
    document.getElementById('f-id').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-category').value = 'bolsos';
    document.getElementById('f-category-label').value = CAT_LABELS.bolsos;
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

function syncCategoryLabel() {
  const cat = document.getElementById('f-category').value;
  document.getElementById('f-category-label').value = CAT_LABELS[cat] || '';
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

  if (!name || isNaN(price) || !description) {
    toast('Completa nombre, precio y descripción.', 'error');
    return;
  }

  const idVal = document.getElementById('f-id').value;
  const badge = document.getElementById('f-badge').value.trim();
  const origPrice = parseFloat(document.getElementById('f-original-price').value) || null;
  const data = {
    name,
    category: document.getElementById('f-category').value,
    categoryLabel: document.getElementById('f-category-label').value.trim() || CAT_LABELS[document.getElementById('f-category').value],
    price,
    originalPrice: (origPrice && origPrice > price) ? origPrice : null,
    description,
    image: image || `https://picsum.photos/seed/${Date.now()}/500/500`,
    badge: badge || null,
    badgeType: document.getElementById('f-badge-type').value || null,
    featured: document.getElementById('f-featured').checked,
    outOfStock: document.getElementById('f-out-of-stock').checked,
    barcode: document.getElementById('f-barcode').value.trim() || null,
    stock: parseInt(document.getElementById('f-stock').value) || 0
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
    stock: data.stock
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
  const options = Object.entries(CAT_LABELS).map(([k,v]) => `  ${k} → ${v}`).join('\n');
  const cat = prompt(`Nueva categoría para ${selectedIds.size} producto(s):\n\n${options}\n\nEscribe el código:`);
  if (cat === null) return;
  const category = cat.trim().toLowerCase();
  if (!CAT_LABELS[category]) {
    toast('Categoría inválida. Opciones: bolsos, accesorios, maquillaje, natura', 'error');
    return;
  }
  const categoryLabel = CAT_LABELS[category];

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
  // Si todos agotados → marcar disponibles. En cualquier otro caso → marcar agotados.
  const newVal = !selected.every(p => p.outOfStock);

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ out_of_stock: newVal })
    });
    if (!result.ok) {
      toast('Error al actualizar estado de stock', 'error');
      return;
    }
  }

  selected.forEach(p => { p.outOfStock = newVal; });
  renderTable();
  renderStats();
  toast(newVal ? `${selectedIds.size} producto(s) marcados como agotados` : `${selectedIds.size} producto(s) marcados como disponibles`, 'success');
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
        categoryLabel: p.categoryLabel || p.category_label || CAT_LABELS[p.category] || '',
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

/* ── OCR TEXT SCANNER ─────────────────────────────────────────────────── */

function openOcrScanner() {
  document.getElementById('ocr-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  _resetOcrModal();
}

function closeOcrScanner() {
  document.getElementById('ocr-overlay').classList.remove('open');
  // Restaurar scroll solo si ningún otro modal sigue abierto
  const otherOpen = ['form-overlay','del-overlay','revista-overlay','scanner-overlay']
    .some(id => document.getElementById(id)?.classList.contains('open'));
  if (!otherOpen) document.body.style.overflow = '';
}

function _resetOcrModal() {
  document.getElementById('ocr-state-capture').style.display = '';
  document.getElementById('ocr-img-preview').style.display = 'none';
  document.getElementById('ocr-state-processing').style.display = 'none';
  document.getElementById('ocr-state-result').style.display = 'none';
  document.getElementById('ocr-img-file').value = '';
  document.getElementById('ocr-img-camera').value = '';
  document.getElementById('ocr-result-text').value = '';
  document.getElementById('ocr-result-text').placeholder = '';
}

function ocrRetry() { _resetOcrModal(); }

async function _ensureTesseract() {
  if (typeof Tesseract !== 'undefined') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo cargar el motor OCR'));
    document.head.appendChild(s);
  });
}

async function handleOcrFile(input) {
  const file = input.files[0];
  if (!file) return;

  // Mostrar preview de la imagen capturada
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('ocr-img-preview');
    prev.src = e.target.result;
    prev.style.display = 'block';
  };
  reader.readAsDataURL(file);

  // Cambiar al estado "procesando"
  document.getElementById('ocr-state-capture').style.display = 'none';
  document.getElementById('ocr-state-processing').style.display = 'block';
  document.getElementById('ocr-state-result').style.display = 'none';
  document.getElementById('ocr-progress-text').textContent = 'Cargando motor de reconocimiento…';

  try {
    await _ensureTesseract();

    const result = await Tesseract.recognize(file, 'spa+eng', {
      logger: m => {
        const el = document.getElementById('ocr-progress-text');
        if (!el) return;
        if (m.status === 'loading tesseract core')          el.textContent = 'Cargando motor OCR…';
        else if (m.status === 'loading language traineddata') el.textContent = 'Descargando idioma (solo la primera vez)…';
        else if (m.status === 'recognizing text')
          el.textContent = `Reconociendo texto… ${Math.round(m.progress * 100)}%`;
      }
    });

    const text = (result.data.text || '').trim();

    document.getElementById('ocr-state-processing').style.display = 'none';
    document.getElementById('ocr-state-result').style.display = 'block';
    document.getElementById('ocr-result-text').value = text;

    if (!text) {
      document.getElementById('ocr-result-text').placeholder =
        'No se detectó texto. Intenta con mejor iluminación o acercando más la cámara.';
    }
  } catch (err) {
    document.getElementById('ocr-state-processing').style.display = 'none';
    document.getElementById('ocr-state-capture').style.display = '';
    toast('Error al reconocer texto. Verifica tu conexión e inténtalo de nuevo.', 'error');
    console.error('OCR error:', err);
  }
}

function applyOcrText(field) {
  const raw = document.getElementById('ocr-result-text').value.trim();
  if (!raw) { toast('No hay texto para aplicar', 'error'); return; }

  if (field === 'name') {
    // Primera línea no vacía como nombre del producto
    const firstLine = raw.split('\n').map(l => l.trim()).find(l => l.length > 1) || raw;
    document.getElementById('f-name').value = firstLine;
    closeOcrScanner();
    toast('Nombre aplicado ✓', 'success');
  } else if (field === 'desc') {
    document.getElementById('f-description').value = raw;
    closeOcrScanner();
    toast('Descripción aplicada ✓', 'success');
  }
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
