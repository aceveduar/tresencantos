const SUPABASE_URL         = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
const SESSION_KEY          = 'te_admin_session';
const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── AUTH + ROL ── */
(function(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.access_token || s.expires_at <= Date.now()/1000 + 60) return window.location.href = 'admin.html';
    const role = s?.user?.user_metadata?.role ||
      (() => { try { return JSON.parse(atob(s.access_token.split('.')[1]))?.user_metadata?.role; } catch{} })() ||
      'operador';
    const _up = (() => { try { return JSON.parse(sessionStorage.getItem('te_user_can')||'{}'); } catch { return {}; } })();
    const canViewActivity = 'canViewActivity' in _up ? _up.canViewActivity : (role === 'superadmin' || role === 'duena');
    if (!canViewActivity) return window.location.href = 'admin.html';
  } catch { window.location.href = 'admin.html'; }
})();

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'admin.html';
}

/* ── API ── */
function _getActivityToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return s?.access_token || SUPABASE_ANON_KEY;
  } catch { return SUPABASE_ANON_KEY; }
}
async function api(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_getActivityToken()}`, 'Content-Type': 'application/json', ...opts.headers }
  });
  return { ok: r.ok, data: r.status !== 204 ? await r.json().catch(()=>null) : null };
}

/* ── STATE ── */
let allData     = [];
let currentType = '';
let nameMap     = {}; // { email: displayName }
let _prodMap    = {}; // { id: {name, image, price} } — para popup de eventos de producto

/* ── NOMBRE HELPERS ── */
function displayName(email) {
  return nameMap[email] || (email ? email.split('@')[0] : 'desconocido');
}
function avatarInitial(email) {
  const name = nameMap[email];
  return name ? name[0].toUpperCase() : (email || '?')[0].toUpperCase();
}
function avatarColor(email) {
  const fixed = {
    'eacevedo@sunname.com.mx':       '#2D6A4F',
    'ma.dolores.mtz.mtz@gmail.com':  '#6366F1',
    'areli@tresencantos.com':        '#be185d',
  };
  if (fixed[email]) return fixed[email];
  const palette = ['#C9A462','#0891B2','#D97706','#7C3AED','#E85D5D','#059669'];
  let h = 0;
  for (const c of (email || '')) h = c.charCodeAt(0) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

/* ── LOAD NAME MAP ── */
async function loadNameMap() {
  const { ok, data } = await api('config?id=eq.user_names&select=value');
  if (ok && data?.[0]?.value) {
    try { nameMap = JSON.parse(data[0].value); } catch {}
  }
}

/* ── CHIP SCROLL INDICATOR ── */
function _chipsScroll() {
  const el   = document.getElementById('chip-group');
  const wrap = document.getElementById('chip-group-wrap');
  if (!el || !wrap) return;
  wrap.classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
}

/* ── FILTERS ── */
function setType(btn, type) {
  currentType = type;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.type === type));
  render(allData);
}

/* ── ACTION CONFIG ── */
const ACTION_CFG = {
  venta:              { type:'venta',      badge:'venta',     icon:'💰', label:'Venta'     },
  venta_cancelada:    { type:'venta',      badge:'eliminado', icon:'❌', label:'Venta cancelada' },
  apartado_nuevo:     { type:'apartado',   badge:'apartado',  icon:'📌', label:'Apartado'  },
  apartado_abono:     { type:'apartado',   badge:'apartado',  icon:'💳', label:'Abono'     },
  apartado_editado:   { type:'apartado',   badge:'apartado',  icon:'✏️', label:'Apartado editado' },
  apartado_liquidado: { type:'apartado',   badge:'apartado',  icon:'✅', label:'Liquidado' },
  apartado_cancelado: { type:'apartado',   badge:'eliminado', icon:'❌', label:'Apartado cancelado' },
  producto_creado:       { type:'inventario', badge:'creado',    icon:'➕', label:'Creado'    },
  producto_editado:      { type:'inventario', badge:'editado',   icon:'✏️', label:'Editado'   },
  producto_eliminado:    { type:'inventario', badge:'eliminado', icon:'🗑', label:'Eliminado' },
  duplicado_descartado:  { type:'inventario', badge:'revisado',  icon:'👁', label:'Revisado'  },
};

/* ── LOAD ── */
async function load() {
  document.getElementById('feed').innerHTML = '<div class="spinner"></div>';
  document.getElementById('summary-row').style.display = 'none';

  const periodVal = document.getElementById('filter-period').value;
  const days = parseInt(periodVal);
  const user = document.getElementById('filter-user').value;

  // Fecha de inicio del período
  // "Hoy" (days=1) usa medianoche del día actual, no "hace 24h"
  let from;
  if (days === 1) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    from = t.toISOString();
  } else {
    from = days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : null;
  }

  // Query activity_log (feed de auditoría)
  let logQ = `activity_log?select=*&order=created_at.desc&limit=300`;
  if (from) logQ += `&created_at=gte.${encodeURIComponent(from)}`;
  if (user) logQ += `&user_email=eq.${encodeURIComponent(user)}`;

  // Query sales del período (fuente de verdad para KPIs)
  let salesQ = `sales?select=id,total,type,paid_amount`;
  if (from) salesQ += `&created_at=gte.${encodeURIComponent(from)}`;

  // Apartados con pendiente (todos, sin filtro de período)
  const aptQ = `sales?select=id,total,paid_amount&type=eq.apartado`;

  const [logRes, salesRes, aptRes] = await Promise.all([
    api(logQ), api(salesQ), api(aptQ)
  ]);

  if (!logRes.ok) {
    document.getElementById('feed').innerHTML = '<div class="empty-state"><div class="em">⚠️</div>Error al cargar actividad</div>';
    return;
  }

  allData = logRes.data || [];
  populateUsers(allData);
  updateSummary(allData, salesRes.data || [], aptRes.data || []);
  render(allData);
}

function populateUsers(data) {
  const emails  = [...new Set(data.map(d => d.user_email))].filter(Boolean).sort();
  const sel     = document.getElementById('filter-user');
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  emails.forEach(e => {
    const o = document.createElement('option');
    o.value = e; o.textContent = displayName(e);
    if (e === current) o.selected = true;
    sel.appendChild(o);
  });
}

function updateSummary(logData, salesData, allApartados) {
  // ── Ventas: desde tabla sales (fuente de verdad)
  const ventas      = salesData.filter(s => s.type === 'venta');
  const ventasTotal = ventas.reduce((s, v) => s + (v.total || 0), 0);
  document.getElementById('sum-ventas').textContent = ventas.length;
  document.getElementById('sum-ventas-sub').textContent =
    ventas.length > 0 ? `$${ventasTotal.toLocaleString('es-MX')}` : '';

  // ── Apartados: nuevos en el período + pendientes totales
  const aptNuevos     = salesData.filter(s => s.type === 'apartado').length;
  const aptPendientes = allApartados.filter(s => (s.paid_amount || 0) < s.total).length;
  document.getElementById('sum-apt').textContent = aptNuevos;
  document.getElementById('sum-apt-sub').textContent =
    aptPendientes > 0 ? `${aptPendientes} por cobrar (total)` : 'sin pendientes';

  // ── Inventario: desglosado desde activity_log
  const creados   = logData.filter(d => d.action === 'producto_creado').length;
  const editados  = logData.filter(d => d.action === 'producto_editado').length;
  const eliminados= logData.filter(d => d.action === 'producto_eliminado').length;
  const invTotal  = creados + editados + eliminados;
  document.getElementById('sum-inv').textContent = invTotal;
  document.getElementById('sum-inv-sub').textContent =
    invTotal > 0 ? `➕${creados} ✏️${editados} 🗑${eliminados}` : '';

  const anyData = ventas.length + aptNuevos + invTotal > 0;
  if (anyData) document.getElementById('summary-row').style.display = '';
}

function render(data) {
  const filtered = currentType
    ? data.filter(d => (ACTION_CFG[d.action]?.type || 'inventario') === currentType)
    : data;

  const feed = document.getElementById('feed');
  if (!filtered.length) {
    feed.innerHTML = '<div class="empty-state"><div class="em">📋</div>Sin actividad en este período</div>';
    return;
  }

  const groups = {};
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today - 86400000);

  filtered.forEach(item => {
    const d = new Date(item.created_at); d.setHours(0,0,0,0);
    let key;
    if (d.getTime() === today.getTime())     key = 'HOY';
    else if (d.getTime() === yesterday.getTime()) key = 'AYER';
    else key = new Date(item.created_at).toLocaleDateString('es-MX', {weekday:'short', day:'numeric', month:'short'});
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  let html = '';
  for (const [date, items] of Object.entries(groups)) {
    html += `<div class="date-sep">${date}</div>`;
    items.forEach(item => {
      const cfg   = ACTION_CFG[item.action] || { badge:'inventario', icon:'•', label: item.action };
      const time  = new Date(item.created_at).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});
      const meta  = item.meta || {};
      const color = avatarColor(item.user_email);
      const name  = displayName(item.user_email);
      const ini   = avatarInitial(item.user_email);

      let detail = '';
      if (item.action === 'venta' || item.action === 'venta_cancelada')
        detail = [
          meta.items != null ? `${meta.items} producto${meta.items !== 1 ? 's' : ''}` : '',
          meta.method === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo',
          meta.discount > 0 ? `Desc. $${(meta.discount).toLocaleString('es-MX')}` : ''
        ].filter(Boolean).join(' · ');
      else if (item.action === 'apartado_nuevo' && meta.anticipo != null)
        detail = `Anticipo $${meta.anticipo.toLocaleString('es-MX')} · Pendiente $${meta.pendiente.toLocaleString('es-MX')}`;
      else if (item.action === 'apartado_abono' && meta.amount != null)
        detail = `$${meta.amount.toLocaleString('es-MX')} · ${meta.method === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo'}`;

      const idx = allData.indexOf(item);
      html += `<div class="act-card" onclick="_actPopup(${idx})" style="cursor:pointer">
  <div class="act-avatar" style="background:${color}">${ini}</div>
  <div class="act-body">
    <div class="act-top">
      <span class="act-badge badge-${cfg.badge}">${cfg.icon} ${cfg.label}</span>
      <span class="act-user">${_esc(name)}</span>
      <span class="act-time">${time}</span>
    </div>
    <div class="act-summary">${_esc(item.summary)}</div>
    ${detail ? `<div class="act-detail">${detail}</div>` : ''}
  </div>
</div>`;
    });
  }

  feed.innerHTML = html;
}

/* ── POPUP DE DETALLE ── */
const DEFAULT_IMG = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23F7F2EB%22%2F%3E%3Crect%20x%3D%22130%22%20y%3D%22100%22%20width%3D%22140%22%20height%3D%22140%22%20rx%3D%2210%22%20fill%3D%22none%22%20stroke%3D%22%23D4BC94%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22158%22%20cy%3D%22127%22%20r%3D%2214%22%20fill%3D%22%23D4BC94%22%2F%3E%3Cpath%20d%3D%22M130%20210%20L175%20165%20L210%20195%20L255%20150%20L280%20180%20L280%20240%20L130%20240Z%22%20fill%3D%22%23D4BC94%22%20fill-opacity%3D%22.4%22%2F%3E%3C%2Fsvg%3E';
function _actPopup(idx) {
  const item = allData[idx];
  if (!item) return;
  document.getElementById('act-pop')?.remove();

  const meta = item.meta || {};
  const cfg  = ACTION_CFG[item.action] || { icon:'•', label: item.action };
  const time = new Date(item.created_at).toLocaleString('es-MX',
    {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});

  // Contenido según tipo de acción
  let imgHtml = '', bodyHtml = '';
  const isProductAction = ['producto_editado','producto_creado','producto_eliminado','duplicado_descartado'].includes(item.action);
  const isSale  = item.action === 'venta' || item.action === 'venta_cancelada';
  const isApt   = item.action.startsWith('apartado');

  if (isProductAction && meta.id) {
    const p = _prodMap[meta.id];
    const img = p?.image || DEFAULT_IMG;
    imgHtml = `<img src="${img}" onerror="this.src='${DEFAULT_IMG}'" style="width:100%;max-height:200px;object-fit:contain;border-radius:10px;background:#F7F2EB;margin-bottom:12px">`;
    bodyHtml = `<div style="font-size:.9rem;font-weight:700;line-height:1.35;margin-bottom:4px">${_esc(meta.name || p?.name || '—')}</div>`;
    if (meta.price != null) bodyHtml += `<div style="font-size:1rem;font-weight:700;font-family:'Playfair Display',serif;color:#C9A462">$${parseFloat(meta.price).toLocaleString('es-MX')} MXN</div>`;
    if (p?.price != null && p.price !== meta.price) bodyHtml += `<div style="font-size:.72rem;color:#8A7564;margin-top:2px">Precio actual: $${parseFloat(p.price).toLocaleString('es-MX')}</div>`;
  } else if (isSale) {
    // Thumbnails de productos vendidos (si están disponibles en el meta)
    const ids = Array.isArray(meta.itemIds) ? meta.itemIds : [];
    if (ids.length) {
      const thumbs = ids.slice(0, 5).map(id => {
        const p = _prodMap[id];
        const src = p?.image || DEFAULT_IMG;
        return `<img src="${src}" onerror="this.src='${DEFAULT_IMG}'" title="${_esc(p?.name||'')}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;background:#F7F2EB;flex-shrink:0">`;
      }).join('');
      imgHtml = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${thumbs}</div>`;
    }
    bodyHtml = `<div style="font-size:1.1rem;font-weight:700;font-family:'Playfair Display',serif;color:#C9A462;margin-bottom:6px">$${parseFloat(meta.total||0).toLocaleString('es-MX')} MXN</div>`;
    bodyHtml += `<div style="font-size:.82rem;color:#1C1817;margin-bottom:4px">${meta.items||0} producto${(meta.items||0)!==1?'s':''}</div>`;
    bodyHtml += `<div style="font-size:.82rem;color:#8A7564">${meta.method==='transferencia'?'📱 Transferencia':'💵 Efectivo'}</div>`;
    if (meta.discount > 0) bodyHtml += `<div style="font-size:.78rem;color:#059669;margin-top:4px">Descuento −$${parseFloat(meta.discount).toLocaleString('es-MX')}</div>`;
  } else if (isApt) {
    bodyHtml = `<div style="font-size:.9rem;font-weight:700;margin-bottom:6px">${_esc(meta.customer || item.summary)}</div>`;
    if (meta.total != null)    bodyHtml += `<div style="font-size:.82rem;color:#8A7564">Total: $${parseFloat(meta.total).toLocaleString('es-MX')}</div>`;
    if (meta.anticipo != null) bodyHtml += `<div style="font-size:.82rem;color:#059669;margin-top:2px">Anticipo: $${parseFloat(meta.anticipo).toLocaleString('es-MX')}</div>`;
    if (meta.pendiente != null) bodyHtml += `<div style="font-size:.82rem;color:#B45309;margin-top:2px">Pendiente: $${parseFloat(meta.pendiente).toLocaleString('es-MX')}</div>`;
    if (meta.amount != null)   bodyHtml += `<div style="font-size:.82rem;color:#059669;margin-top:2px">Abono: $${parseFloat(meta.amount).toLocaleString('es-MX')}</div>`;
    if (meta.pagado != null)   bodyHtml += `<div style="font-size:.82rem;color:#E85D5D;margin-top:2px">Pagado (perdido): $${parseFloat(meta.pagado).toLocaleString('es-MX')}</div>`;
  } else {
    bodyHtml = `<div style="font-size:.85rem;color:#1C1817">${_esc(item.summary)}</div>`;
  }

  const pop = document.createElement('div');
  pop.id = 'act-pop';
  pop.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);animation:ap-in .15s ease';
  pop.innerHTML = `
    <style>@keyframes ap-in{from{opacity:0}to{opacity:1}}</style>
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;padding:18px;max-width:300px;width:90%;box-shadow:0 12px 48px rgba(0,0,0,.28);position:relative">
      <button onclick="document.getElementById('act-pop').remove()" style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:#8A7564;line-height:1">✕</button>
      ${imgHtml}
      <div style="font-size:.7rem;color:#8A7564;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">${cfg.icon} ${cfg.label} · ${time}</div>
      ${bodyHtml}
    </div>`;
  pop.addEventListener('click', () => pop.remove());
  document.body.appendChild(pop);
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const _s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const _m = _s?.user?.user_metadata || {};
    const _n = _m.full_name || _m.name || _s?.user?.email?.split('@')[0] || '';
    const _av = document.getElementById('user-avatar');
    const _nl = document.getElementById('user-name-lbl');
    if (_av) _av.textContent = _n ? _n[0].toUpperCase() : '?';
    if (_nl) _nl.textContent = _n;
  } catch {}
  await loadNameMap();
  api('products?select=id,name,image,price&limit=2000').then(r => {
    if (r.ok && Array.isArray(r.data)) r.data.forEach(p => { _prodMap[p.id] = p; });
  });
  load();
  _chipsScroll();
});
