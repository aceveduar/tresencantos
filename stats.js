/* ── CONFIG ── */
const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
const SESSION_KEY = 'te_admin_session';

/* ── AUTH + ROL ── */
(function(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!(s?.access_token && s.expires_at > Math.floor(Date.now()/1000)+60))
      return window.location.href = 'admin.html';
    const role = s?.user?.user_metadata?.role ||
      (() => { try { return JSON.parse(atob(s.access_token.split('.')[1]))?.user_metadata?.role; } catch{} })() ||
      'operador';
    // Verificar permiso individual antes de usar el rol por defecto
    const _up = (() => { try { return JSON.parse(sessionStorage.getItem('te_user_can')||'{}'); } catch { return {}; } })();
    const canViewReports = 'canViewReports' in _up ? _up.canViewReports : (role === 'superadmin' || role === 'duena');
    if (!canViewReports) return window.location.href = 'admin.html';
    const userEmail = s?.user?.email ||
      (() => { try { return JSON.parse(atob(s.access_token.split('.')[1]))?.email; } catch{} })() || '';
    if (role === 'superadmin' && userEmail === 'eacevedo@sunname.com.mx') {
      document.addEventListener('DOMContentLoaded', () => {
        const ga = document.getElementById('ga4-link-card');
        if (ga) ga.style.display = '';
      });
    }
    const canViewActivity = 'canViewActivity' in _up ? _up.canViewActivity : (role === 'superadmin' || role === 'duena');
    if (!canViewActivity) {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll(`a[href="activity.html"]`).forEach(a => a.style.display = 'none');
      });
    }
    const canSettings = 'canManageSettings' in _up ? _up.canManageSettings : (role === 'superadmin');
    if (!canSettings) {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll(`a[href="settings.html"]`).forEach(a => a.style.display = 'none');
      });
    }
  } catch { window.location.href = 'admin.html'; }
})();

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'admin.html';
}

/* ── API ── */
function _getStatsToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return s?.access_token || SUPABASE_ANON_KEY;
  } catch { return SUPABASE_ANON_KEY; }
}
async function _refreshStatsToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.refresh_token) return false;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.access_token) return false;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: Math.floor(Date.now()/1000) + (d.expires_in||3600),
      email: d.user?.email || s.email, user: d.user || s.user
    }));
    return true;
  } catch { return false; }
}
async function api(path, opts={}) {
  const _call = (tk) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${tk}`,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  });
  const r = await _call(_getStatsToken());
  if (r.status === 401 && await _refreshStatsToken()) return _call(_getStatsToken());
  return r;
}

const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _driveSz = (url, w) => (url && url.includes('drive.google.com')) ? url.replace(/sz=w\d+/, `sz=w${w}`) : (url || '');
function _localDay(iso) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function _chartNoData(canvasId, msg) {
  const c = document.getElementById(canvasId);
  if (!c) return;
  c.style.display = 'none';
  const wrap = c.parentElement;
  let nd = wrap.querySelector('.no-data');
  if (!nd) { nd = document.createElement('p'); nd.className = 'no-data'; wrap.appendChild(nd); }
  nd.textContent = msg; nd.style.display = '';
}
function _chartReady(canvasId) {
  const c = document.getElementById(canvasId);
  if (!c) return null;
  c.style.display = '';
  const nd = c.parentElement.querySelector('.no-data');
  if (nd) nd.style.display = 'none';
  return c.getContext('2d');
}

/* ── STATE ── */
let _statsMode = 'day';
let _statsOffset = 0;
let currentPeriod = 'today'; // derived — updated by _updateNavUI()
let sales = [];
let salesAll = [];
let prevSales = [];
let prevSalesAll = [];
let products = [];
let revenueChart = null;
let catChart = null;
let hourChart = null;
let weekdayChart = null;
let nameMap = {};
let categories = [];

/* ── PERIOD NAV ── */
const _MN  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const _MNF = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function _fmt(d)  { return d.getDate()+' '+_MN[d.getMonth()]+' '+d.getFullYear(); }
function _fmtRange(a,b) {
  if (a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear())
    return a.getDate()+'–'+b.getDate()+' '+_MN[a.getMonth()]+' '+a.getFullYear();
  if (a.getFullYear()===b.getFullYear())
    return a.getDate()+' '+_MN[a.getMonth()]+'–'+b.getDate()+' '+_MN[b.getMonth()]+' '+a.getFullYear();
  return _fmt(a)+' – '+_fmt(b);
}
function _fmtMonth(d) { return _MNF[d.getMonth()]+' '+d.getFullYear(); }

function getRange(mode, offset) {
  const now = new Date();
  let from, to, label, rangeStr;
  if (mode === 'day') {
    from = new Date(now); from.setDate(from.getDate()+offset); from.setHours(0,0,0,0);
    to   = new Date(from); to.setHours(23,59,59,999);
    rangeStr = _fmt(from);
    label = offset===0 ? 'Hoy' : offset===-1 ? 'Ayer' : rangeStr;
  } else if (mode === 'week') {
    const base = new Date(now);
    const dow = base.getDay();
    base.setDate(base.getDate()+(dow===0?-6:1-dow)+offset*7);
    base.setHours(0,0,0,0);
    from = new Date(base);
    to   = new Date(base); to.setDate(to.getDate()+6); to.setHours(23,59,59,999);
    rangeStr = _fmtRange(from, to);
    label = offset===0 ? 'Esta semana' : offset===-1 ? 'Semana pasada' : rangeStr;
  } else {
    from = new Date(now.getFullYear(), now.getMonth()+offset, 1, 0,0,0,0);
    to   = new Date(from.getFullYear(), from.getMonth()+1, 0, 23,59,59,999);
    rangeStr = _fmtMonth(from);
    label = offset===0 ? 'Este mes' : offset===-1 ? 'Mes pasado' : rangeStr;
  }
  return { from: from.toISOString(), to: to.toISOString(), label, rangeStr };
}
function _currentFrom() { return getRange(_statsMode, _statsOffset).from; }
function _currentTo()   { return getRange(_statsMode, _statsOffset).to; }
function _prevRange()   { const r=getRange(_statsMode,_statsOffset-1); return [r.from,r.to]; }

const PERIOD_LABELS = { today:'Hoy', week:'Esta semana', month:'Este mes', day_custom:'Este día', all:'Todo' };

function _updateNavUI() {
  const range = getRange(_statsMode, _statsOffset);
  const lbl = document.getElementById('stats-range-label');
  if (lbl) lbl.textContent = range.rangeStr;
  document.querySelectorAll('.smode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===_statsMode));
  const fwd = document.getElementById('stats-nav-fwd');
  if (fwd) fwd.disabled = _statsOffset >= 0;
  const now = document.getElementById('stats-nav-now');
  if (now) now.style.display = _statsOffset < 0 ? '' : 'none';
  if (_statsMode==='day'&&_statsOffset===0) currentPeriod='today';
  else if (_statsMode==='day') currentPeriod='day_custom';
  else if (_statsMode==='week') currentPeriod='week';
  else currentPeriod='month';
  PERIOD_LABELS[currentPeriod] = range.label;
}

function navigate(delta) {
  if (delta > 0 && _statsOffset >= 0) return;
  _statsOffset += delta;
  _updateNavUI();
  _reloadStats();
}
function setMode(mode) { _statsMode=mode; _statsOffset=0; _updateNavUI(); _reloadStats(); }
function resetToNow()  { _statsOffset=0; _updateNavUI(); _reloadStats(); }
async function _reloadStats() {
  ['kpi-revenue','kpi-sales','kpi-avg'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '…'; });
  await Promise.all([loadSales(),loadPreviousSales()]);
  renderAll();
}

/* ── LOAD ── */
async function loadNameMap() {
  const r = await api('config?id=eq.user_names&select=value');
  if (r.ok && r.data?.[0]?.value) {
    try { nameMap = JSON.parse(r.data[0].value); } catch {}
  }
}

async function loadCategories() {
  const r = await api('config?id=eq.categories&select=value');
  if (r.ok && r.data?.[0]?.value) {
    try { categories = JSON.parse(r.data[0].value); } catch { categories = []; }
  }
}

async function loadSales() {
  const { from, to } = getRange(_statsMode, _statsOffset);
  const filter = `&created_at=gte.${from}&created_at=lte.${to}`;
  const r = await api(`sales?select=id,total,created_at,items,payment_method,type,seller_email,discount,customer,abonos&order=created_at.desc${filter}&limit=500`);
  const data = (r.ok && Array.isArray(r.data)) ? r.data : [];
  salesAll = data;
  sales = data.filter(s => s.type !== 'apartado');
}

async function loadPreviousSales() {
  const [from, to] = _prevRange();
  const r = await api(`sales?select=id,total,created_at,type,abonos&created_at=gte.${from}&created_at=lte.${to}&limit=500`);
  const prevData = (r.ok && Array.isArray(r.data)) ? r.data : [];
  prevSalesAll = prevData;
  prevSales = prevData.filter(s => s.type !== 'apartado');
}

async function loadProducts() {
  const r = await api('products?select=id,name,category,category_label,price,cost,stock,out_of_stock,image,images&order=position.asc&limit=2000');
  products = (r.ok && Array.isArray(r.data)) ? r.data : [];
}

let todaySales = [];
async function loadTodaySales() {
  const from = new Date(); from.setHours(0,0,0,0);
  const r = await api(`sales?select=id,total,created_at,items,payment_method,type,discount,note,seller_email,customer,abonos&order=created_at.desc&created_at=gte.${from.toISOString()}&limit=200`);
  todaySales = (r.ok && Array.isArray(r.data)) ? r.data : [];
}

function renderTodaySales() {
  const el = document.getElementById('today-sales-list');
  const countEl = document.getElementById('today-sales-count');
  const titleEl = document.getElementById('today-sales-title');
  if (!el) return;
  const isToday = _statsMode === 'day' && _statsOffset === 0;
  const all = [...(isToday ? todaySales : sales)].sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  if (titleEl) titleEl.textContent = isToday ? 'Ventas de hoy' : `Ventas — ${PERIOD_LABELS[currentPeriod]}`;
  const ventas = all.filter(s => s.type !== 'apartado');
  const apartados = all.filter(s => s.type === 'apartado');
  const hoy = new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});
  if (countEl) countEl.textContent = all.length
    ? `${ventas.length} venta${ventas.length!==1?'s':''}${apartados.length?` · ${apartados.length} apt.`:''}`
    : isToday ? hoy : PERIOD_LABELS[currentPeriod];
  if (!all.length) { el.innerHTML = `<p class="no-data">Sin ventas ${isToday ? 'hoy' : 'en este período'}</p>`; return; }
  const fromIso = _currentFrom();
  const _listToIso = _currentTo();
  el.innerHTML = all.map((s, idx) => {
    const t = new Date(s.created_at);
    const h = t.getHours(), m = t.getMinutes();
    const time = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
    const isTrans = s.payment_method === 'transferencia';
    const payIcon = `<span class="dv-sale-pay ${isTrans ? 'dv-pay-trans' : 'dv-pay-efec'}">${isTrans ? '📱' : '💵'}</span>`;
    const isAp = s.type === 'apartado';
    const items = Array.isArray(s.items) ? s.items : [];
    const names = items.map(i => i.name).join(', ');
    const apTag = isAp ? `<span style="font-size:.62rem;background:#FEF3C7;color:#92400E;padding:1px 6px;border-radius:50px;font-weight:700;flex-shrink:0">APT</span>` : '';

    // Monto del período: si hay abonos mostramos solo lo cobrado en el período activo
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];
    const fullTotal = parseFloat(s.total || 0);
    const periodAmt = abonos.length ? _abonoRevenue(s, fromIso, _listToIso) : fullTotal;
    const showOf = abonos.length && Math.round(periodAmt) !== Math.round(fullTotal);
    const totalHtml = showOf
      ? `$${Math.round(periodAmt).toLocaleString('es-MX')}<span class="dv-total-of">/ $${Math.round(fullTotal).toLocaleString('es-MX')}</span>`
      : `$${Math.round(fullTotal).toLocaleString('es-MX')}`;

    const itemsHtml = items.map(i => {
      const prod = products.find(p => +p.id === +i.id);
      const img = _driveSz(_prodImg(prod), 80) || _DV_PH;
      const fullImg = _driveSz(_prodImg(prod), 600) || img;
      const qty = i.qty || 1;
      const sub = parseFloat(i.subtotal ?? i.price * qty);
      const meta = qty > 1
        ? `${qty} × $${parseFloat(i.price).toLocaleString('es-MX',{maximumFractionDigits:0})}`
        : `$${parseFloat(i.price).toLocaleString('es-MX',{maximumFractionDigits:0})}`;
      const stockInfo = prod ? (prod.out_of_stock || prod.stock === 0 ? '● Agotado' : `● ${prod.stock} en stock`) : '';
      const stockColor = prod && !prod.out_of_stock && prod.stock > 0 ? '#2D6A4F' : '#E85D5D';
      const nameEsc = _esc(i.name).replace(/'/g, "\\'");
      return `<div class="dv-item">
  <img class="dv-thumb" src="${img}" data-full="${_esc(fullImg)}" alt="${_esc(i.name)}" onerror="_dvImgErr(this)" style="cursor:pointer" onclick="event.stopPropagation();_dvImgPopup(this,this.dataset.full||this.src,'${nameEsc}',${parseFloat(i.price)},${qty},'${stockInfo}','${stockColor}')">
  <div style="flex:1;min-width:0"><div class="dv-item-name">${_esc(i.name)}</div><div class="dv-item-meta">${meta}</div></div>
  <div class="dv-item-sub">$${sub.toLocaleString('es-MX',{maximumFractionDigits:0})}</div>
</div>`;
    }).join('');
    const discRow = s.discount>0
      ? `<div style="font-size:.7rem;color:var(--muted);text-align:right;padding-top:4px">Descuento −$${parseFloat(s.discount).toLocaleString('es-MX',{maximumFractionDigits:0})}</div>` : '';
    const custRow = isAp && s.customer ? `<div style="font-size:.7rem;color:var(--muted);padding-top:2px">Cliente: ${_esc(s.customer)}</div>` : '';
    return `<div class="dv-sale" id="dv-${idx}">
  <div class="dv-sale-head" onclick="dvToggle(${idx})">
    <span class="dv-sale-time">${time}</span>
    ${payIcon}
    ${apTag}
    <span class="dv-sale-names">${_esc(names)}</span>
    <span class="dv-sale-total">${totalHtml}</span>
    <span class="dv-sale-arrow">›</span>
  </div>
  <div class="dv-body">${itemsHtml}${discRow}${custRow}</div>
</div>`;
  }).join('');
}

function dvToggle(idx) {
  document.getElementById('dv-'+idx)?.classList.toggle('open');
}

const _DV_PH = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#C9A462" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>');
function _dvImgErr(el) { el.onerror = null; el.src = _DV_PH; }
function _prodImg(prod) {
  if (!prod) return null;
  if (prod.image && prod.image.length > 5 && prod.image !== 'null') return prod.image;
  const extras = Array.isArray(prod.images) ? prod.images : (typeof prod.images === 'string' ? JSON.parse(prod.images || '[]') : []);
  return extras[0] || null;
}

/* ── RENDER ── */
function renderAll() {
  const lbl = PERIOD_LABELS[currentPeriod];
  document.getElementById('chart-period-label').textContent = lbl;
  document.getElementById('top-prod-period').textContent = lbl;
  document.getElementById('hour-period-label').textContent = lbl;

  const _isToday = _statsMode === 'day' && _statsOffset === 0;

  // Título dinámico de la gráfica principal según modo
  const revTitle = document.getElementById('revenue-chart-title');
  if (revTitle) {
    if (_statsMode === 'day')   revTitle.textContent = 'Ingresos por hora';
    else if (_statsMode === 'week') revTitle.textContent = lbl + ' vs anterior';
    else revTitle.textContent = 'Ingresos por día';
  }

  // Resumen del día: solo relevante en "Hoy"
  document.getElementById('day-summary').style.display = _isToday ? '' : 'none';

  // Hora pico: redundante en modo Día (el revenue chart ya muestra horarios)
  const horaPicoCard = document.getElementById('hora-pico-card');
  if (horaPicoCard) horaPicoCard.style.display = _statsMode === 'day' ? 'none' : '';

  // Week summary: solo en modo semana (lo puebla _renderWeekComparison)
  const wkSum = document.getElementById('week-summary');
  if (wkSum && _statsMode !== 'week') wkSum.style.display = 'none';

  renderDaySummary();
  renderKPIs();
  renderRevenueChart();
  renderCatChart();
  renderTopProducts();
  renderTodaySales();
  renderHourChart();
  renderInventory();
  renderCapitalCategoria();
  renderRentabilidad();
  renderVendedores();
  renderCalendar();
  renderWeekdayChart();
}

function renderVendedores() {
  const card  = document.getElementById('vendedores-card');
  const body  = document.getElementById('vendedores-body');
  const label = document.getElementById('vendedores-label');
  if (!card || !body) return;

  // Agrupar por seller_email
  const map = {};
  const _fromIso = _currentFrom();
  const _toIso   = _currentTo();
  salesAll.forEach(s => {
    const key = s.seller_email || '__sin_sesion__';
    if (!map[key]) map[key] = { ventas: 0, total: 0 };
    if (s.type !== 'apartado') map[key].ventas++; // solo ventas completas en el conteo
    map[key].total += _abonoRevenue(s, _fromIso, _toIso);
  });

  const entries = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  // Solo mostrar si hay 2+ vendedores identificados (sin contar ventas sin sesión)
  const identificados = entries.filter(([k]) => k !== '__sin_sesion__').length;
  if (identificados < 2) { card.style.display = 'none'; return; }

  card.style.display = '';
  const maxTotal = entries[0][1].total;
  label.textContent = PERIOD_LABELS[currentPeriod];

  body.innerHTML = entries.map(([email, d]) => {
    const pct  = maxTotal > 0 ? Math.round(d.total / maxTotal * 100) : 0;
    const fmt  = n => `$${n.toLocaleString('es-MX')}`;
    const isSinSesion = email === '__sin_sesion__';
    const name = isSinSesion ? 'Ventas sin sesión activa' : (nameMap[email] || email.split('@')[0]);
    const icon = isSinSesion ? '🕐' : '👤';
    const barColor = isSinSesion ? '#B5A696' : 'var(--gold)';
    const nameStyle = isSinSesion ? 'color:var(--muted);font-weight:500' : 'font-weight:600';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.84rem;${nameStyle}">${icon} ${_esc(name)}</span>
        <span style="font-weight:700;font-size:.88rem;${isSinSesion?'color:var(--muted)':''}">${fmt(d.total)}</span>
      </div>
      <div style="background:var(--border);border-radius:50px;height:5px;overflow:hidden;margin-bottom:4px">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:50px"></div>
      </div>
      <div style="font-size:.7rem;color:var(--muted)">${d.ventas} venta${d.ventas!==1?'s':''}${isSinSesion?' · registradas antes del sistema de sesiones':''}</div>
    </div>`;
  }).join('');
}

// Retorna el ingreso de una venta/apartado que cae dentro del período [fromIso, toIso].
// Si tiene abonos, suma solo los abonos dentro del rango; si no, usa total.
// Apartados sin abonos (anticipo=0) retornan 0 — aún no se ha cobrado nada.
function _abonoRevenue(sale, fromIso, toIso) {
  const abonos = Array.isArray(sale.abonos) ? sale.abonos : [];
  if (!abonos.length) {
    if (sale.type === 'apartado') return 0;
    return parseFloat(sale.total || 0);
  }
  const from = fromIso ? new Date(fromIso).getTime() : 0;
  const to   = toIso   ? new Date(toIso).getTime()   : Date.now() + 86400000;
  return abonos
    .filter(a => { const t = new Date(a.date).getTime(); return t >= from && t <= to; })
    .reduce((s, a) => s + parseFloat(a.amount || 0), 0);
}

/* KPIs con delta vs período anterior */
function kpiDelta(curr, prev) {
  if (!prev) return '';
  if (prev === 0) return '';
  const pct = (curr - prev) / prev * 100;
  const sign = pct >= 0 ? '+' : '';
  const color = pct >= 0 ? '#065F46' : '#991B1B';
  const bg    = pct >= 0 ? '#D1FAE5' : '#FEE2E2';
  return ` <span style="font-size:.66rem;font-weight:700;padding:2px 6px;border-radius:50px;background:${bg};color:${color}">${sign}${pct.toFixed(0)}%</span>`;
}

function renderKPIs() {
  const fromIso   = _currentFrom();
  const toIso     = _currentTo();
  const [prevFromIso, prevToIso] = _prevRange();

  const totalRev  = salesAll.reduce((s,x) => s + _abonoRevenue(x, fromIso, toIso), 0);
  const count     = sales.length;
  const units     = sales.reduce((s,v) => s + (v.items||[]).reduce((a,i) => a + (i.qty||1), 0), 0);

  const prevRev   = prevSalesAll.reduce((s,x) => s + _abonoRevenue(x, prevFromIso, prevToIso), 0);
  const prevCount = prevSales.length;
  const prevUnits = prevSales.reduce((s,v) => s + (v.items||[]).reduce((a,i) => a + (i.qty||1), 0), 0);

  const fmt = n => `$${n.toLocaleString('es-MX', {maximumFractionDigits:0})}`;

  document.getElementById('kpi-revenue').innerHTML = fmt(totalRev) + kpiDelta(totalRev, prevRev);
  document.getElementById('kpi-revenue-sub').textContent = prevRev > 0 ? `Período ant.: ${fmt(prevRev)}` : '';
  document.getElementById('kpi-sales').innerHTML = count + kpiDelta(count, prevCount);
  document.getElementById('kpi-sales-sub').textContent = prevCount > 0 ? `Período ant.: ${prevCount}` : '';
  document.getElementById('kpi-avg').innerHTML = (units || '—') + kpiDelta(units, prevUnits);
  document.getElementById('kpi-avg-sub').textContent = prevUnits > 0 ? `Período ant.: ${prevUnits}` : '';

  const aptAmt = _aptResumen.pendiente || 0;
  document.getElementById('kpi-apt').textContent = aptAmt > 0 ? fmt(aptAmt) : '$0';
  document.getElementById('kpi-apt-sub').textContent = _aptResumen.count > 0
    ? `${_aptResumen.count} apartado${_aptResumen.count!==1?'s':''}${_aptResumen.vencidos ? ` · ⚠️ ${_aptResumen.vencidos} venc.` : ''}`
    : 'Sin apartados activos';
}

/* Hora pico */
function renderHourChart() {
  const byHour  = Array(24).fill(0);
  const fromMs  = new Date(_currentFrom()).getTime();
  salesAll.forEach(s => {
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];
    if (abonos.length) {
      abonos.forEach(a => {
        const t = new Date(a.date).getTime();
        if (t >= fromMs) byHour[new Date(a.date).getHours()] += parseFloat(a.amount || 0);
      });
    } else {
      byHour[new Date(s.created_at).getHours()] += parseFloat(s.total || 0);
    }
  });
  if (hourChart) { hourChart.destroy(); hourChart = null; }
  if (salesAll.length === 0) { _chartNoData('hour-chart', 'Sin datos en el período'); return; }
  const ctx = _chartReady('hour-chart');
  if (!ctx) return;
  const maxH = byHour.indexOf(Math.max(...byHour));
  hourChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({length:24}, (_,i) => `${i}h`),
      datasets: [{
        data: byHour,
        backgroundColor: byHour.map((_, i) => i === maxH ? '#C9A462' : 'rgba(201,164,98,.35)'),
        borderRadius: 4, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{ label: c => `$${c.parsed.y.toLocaleString('es-MX')}` }}},
      scales: {
        y: { beginAtZero:true, ticks:{ callback: v=>`$${v.toLocaleString('es-MX')}`, font:{size:10} }, grid:{color:'#F0E8E0'} },
        x: { grid:{display:false}, ticks:{font:{size:9}, maxRotation:0} }
      }
    }
  });
}

/* Revenue chart */
function renderRevenueChart() {
  const byDay = {};
  const from  = _currentFrom();
  const to    = _currentTo();
  const start = new Date(from);
  const end   = new Date(to);
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  if (salesAll.length === 0) { _chartNoData('revenue-chart', 'Sin ventas registradas'); return; }
  const ctx = _chartReady('revenue-chart');
  if (!ctx) return;

  // Build daily revenue map for current period
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    byDay[_localDay(d)] = 0;
  }
  salesAll.forEach(s => {
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];
    if (abonos.length) {
      abonos.forEach(a => {
        const day = _localDay(a.date);
        if (day in byDay) byDay[day] += parseFloat(a.amount||0);
      });
    } else {
      const day = _localDay(s.created_at);
      byDay[day] = (byDay[day]||0) + parseFloat(s.total||0);
    }
  });

  if (_statsMode === 'week') {
    _renderWeekComparison(ctx, byDay);
    return;
  }

  if (_statsMode === 'day') {
    _renderDayHourly(ctx);
    return;
  }

  // Month mode: bars by day
  const days = Object.keys(byDay).sort();
  const isMonth = true;

  const barLabelPlugin = {
    id:'barLabels',
    afterDatasetsDraw(chart) {
      const {ctx} = chart;
      ctx.save(); ctx.font='600 9px Inter,sans-serif'; ctx.fillStyle='#6B5C48';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      chart.getDatasetMeta(0).data.forEach((bar,i) => {
        const val = chart.data.datasets[0].data[i];
        if (val > 0) {
          const lbl = val>=1000?'$'+(val/1000).toFixed(1)+'k':'$'+Math.round(val);
          ctx.fillText(lbl, bar.x, bar.y-3);
        }
      });
      ctx.restore();
    }
  };

  const mkLabel = d => {
    if (isMonth) return parseInt(d.split('-')[2])+'';
    const [,m,day] = d.split('-');
    return parseInt(day)+'/'+parseInt(m);
  };

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(mkLabel),
      datasets: [{
        data: days.map(d => byDay[d]),
        backgroundColor: 'rgba(201,164,98,.75)',
        borderColor: '#C9A462', borderWidth:1,
        borderRadius: 3, borderSkipped:false
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:18}},
      plugins: {
        legend:{display:false},
        tooltip:{callbacks:{label:c=>`${c.parsed.y.toLocaleString('es-MX')}`}}
      },
      scales: {
        y:{beginAtZero:true, ticks:{callback:v=>`${v>=1000?(v/1000).toFixed(0)+'k':v}`,font:{size:10}}, grid:{color:'#F0E8E0'}},
        x:{grid:{display:false}, ticks:{font:{size:9}, maxRotation:0}}
      }
    },
    plugins: [barLabelPlugin]
  });
}

function _renderWeekComparison(ctx, byDayCurr) {
  const _DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const [prevFrom, prevTo] = _prevRange();

  const currByDow = Array(7).fill(0);
  Object.entries(byDayCurr).forEach(([key, val]) => {
    const dow = (new Date(key+'T12:00:00').getDay()+6)%7;
    currByDow[dow] = val;
  });

  const prevByDow = Array(7).fill(0);
  prevSalesAll.forEach(s => {
    const dow = (new Date(s.created_at).getDay()+6)%7;
    prevByDow[dow] += _abonoRevenue(s, prevFrom, prevTo);
  });

  const hasPrev = prevByDow.some(v=>v>0);
  const currTotal = currByDow.reduce((a,b)=>a+b,0);
  const prevTotal = prevByDow.reduce((a,b)=>a+b,0);
  const _currLabel = PERIOD_LABELS[currentPeriod] || 'Esta semana';
  const _fmt = n => '$'+Math.round(n).toLocaleString('es-MX');

  // Week summary pills
  const ws = document.getElementById('week-summary');
  if (ws) {
    ws.style.display = '';
    let delta = '';
    if (hasPrev && prevTotal > 0) {
      const pct = Math.round((currTotal - prevTotal) / prevTotal * 100);
      const sign = pct >= 0 ? '+' : '';
      const bg = pct >= 0 ? '#D1FAE5' : '#FEE2E2';
      const col = pct >= 0 ? '#065F46' : '#991B1B';
      delta = `<span style="font-size:.72rem;font-weight:700;padding:3px 8px;border-radius:50px;background:${bg};color:${col}">${sign}${pct}%</span>`;
    }
    ws.innerHTML = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <div style="flex:1;min-width:100px">
        <div style="font-size:.65rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">${_esc(_currLabel)}</div>
        <div style="font-size:1.2rem;font-weight:700;font-family:'Playfair Display',serif;display:flex;align-items:center;gap:8px">${_fmt(currTotal)} ${delta}</div>
      </div>
      ${hasPrev ? `<div style="text-align:right">
        <div style="font-size:.65rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">Anterior</div>
        <div style="font-size:.95rem;font-weight:600;color:var(--muted)">${_fmt(prevTotal)}</div>
      </div>` : ''}
    </div>`;
  }

  const maxCurr = Math.max(...currByDow, 1);
  const currColors = currByDow.map(v => v===maxCurr&&v>0 ? '#C9A462' : 'rgba(201,164,98,.7)');

  const datasets = [{
    label: _currLabel,
    data: currByDow,
    backgroundColor: currColors,
    borderColor: '#A67C3A', borderWidth: 1,
    borderRadius: 6, borderSkipped: false,
    barPercentage: hasPrev ? 0.7 : 0.6,
    categoryPercentage: hasPrev ? 0.7 : 0.5
  }];
  if (hasPrev) datasets.push({
    label: 'Anterior',
    data: prevByDow,
    backgroundColor: 'rgba(180,160,140,.35)',
    borderColor: 'rgba(160,140,120,.55)', borderWidth: 1,
    borderRadius: 4, borderSkipped: false,
    barPercentage: 0.7,
    categoryPercentage: 0.7
  });

  const labelPlugin = {
    id:'wkLabels',
    afterDatasetsDraw(chart) {
      const {ctx} = chart;
      ctx.save();
      ctx.font = '600 9.5px Inter,sans-serif';
      ctx.fillStyle = '#5C4B38';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const val = chart.data.datasets[0].data[i];
        if (val > 0) ctx.fillText(val>=1000?'$'+(val/1000).toFixed(1)+'k':'$'+Math.round(val), bar.x, bar.y - 3);
      });
      ctx.restore();
    }
  };

  revenueChart = new Chart(ctx, {
    type:'bar',
    data:{ labels:_DOW, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:22}},
      plugins:{
        legend:{ display:hasPrev, position:'top', align:'end',
          labels:{boxWidth:12,boxHeight:12,font:{size:11,weight:'500'},color:'#8A7564',padding:10,
            usePointStyle:true,pointStyle:'rectRounded'}},
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: $${c.parsed.y.toLocaleString('es-MX')}`}}
      },
      scales:{
        y:{beginAtZero:true, ticks:{callback:v=>`$${v>=1000?(v/1000).toFixed(0)+'k':v}`,font:{size:10}}, grid:{color:'#F0E8E0'}},
        x:{grid:{display:false}, ticks:{font:{size:12,weight:'600'},color:'#6B5C48'}}
      }
    },
    plugins:[labelPlugin]
  });
}


function _renderDayHourly(ctx) {
  const byHour = Array(24).fill(0);
  const fromMs = new Date(_currentFrom()).getTime();
  salesAll.forEach(s => {
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];
    if (abonos.length) {
      abonos.forEach(a => {
        const t = new Date(a.date).getTime();
        if (t >= fromMs) byHour[new Date(a.date).getHours()] += parseFloat(a.amount||0);
      });
    } else {
      byHour[new Date(s.created_at).getHours()] += parseFloat(s.total||0);
    }
  });

  const active = byHour.reduce((acc,v,i) => v>0?[...acc,i]:acc, []);
  const first  = active.length ? active[0] : 8;
  const last   = active.length ? active[active.length-1] : 20;
  const hours  = [];
  for (let h=Math.max(0,first-1); h<=Math.min(23,last+1); h++) hours.push(h);

  const maxH = Math.max(...hours.map(h=>byHour[h]),1);
  const colors = hours.map(h => byHour[h]===maxH&&byHour[h]>0?'#C9A462':'rgba(201,164,98,.55)');

  revenueChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels: hours.map(h=>h+'h'),
      datasets:[{data:hours.map(h=>byHour[h]), backgroundColor:colors, borderRadius:5, borderSkipped:false}]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:14}},
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>`$${c.parsed.y.toLocaleString('es-MX')}`}}
      },
      scales:{
        y:{beginAtZero:true, ticks:{callback:v=>v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v, font:{size:10}}, grid:{color:'#F0E8E0'}},
        x:{grid:{display:false}, ticks:{font:{size:11}}}
      }
    }
  });
}


/* Category chart */
function renderCatChart() {
  const catMap = {};
  sales.forEach(s => {
    if (!Array.isArray(s.items)) return;
    s.items.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      const cat = prod?.category_label || prod?.category || 'Otro';
      catMap[cat] = (catMap[cat]||0) + (item.subtotal||0);
    });
  });

  const entries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  if (catChart) { catChart.destroy(); catChart = null; }
  if (!entries.length) { _chartNoData('cat-chart', 'Sin datos de categorías'); return; }
  const ctx = _chartReady('cat-chart');
  if (!ctx) return;

  const COLORS = ['#C9A462','#34d399','#60a5fa','#f472b6','#a78bfa','#fb923c','#fbbf24'];
  catChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k])=>k),
      datasets: [{ data: entries.map(([,v])=>v), backgroundColor: COLORS.slice(0,entries.length), borderWidth: 2, borderColor:'#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position:'bottom',
          labels:{
            font:{family:'Inter',size:11}, padding:10, boxWidth:12,
            generateLabels(chart) {
              const data = chart.data.datasets[0].data;
              const total = data.reduce((s,v)=>s+v,0);
              return chart.data.labels.map((label, i) => ({
                text: `${label}  $${data[i].toLocaleString('es-MX',{maximumFractionDigits:0})} (${Math.round(data[i]/total*100)}%)`,
                fillStyle: COLORS[i % COLORS.length],
                strokeStyle: '#fff',
                lineWidth: 2,
                index: i,
                hidden: false
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: c => {
              const total = c.dataset.data.reduce((s,v)=>s+v,0);
              return ` $${c.parsed.toLocaleString('es-MX',{maximumFractionDigits:0})} (${Math.round(c.parsed/total*100)}%)`;
            }
          }
        }
      }
    }
  });
}

/* Top productos */
function aggregateProducts() {
  const map = {};
  sales.forEach(s => {
    if (!Array.isArray(s.items)) return;
    s.items.forEach(item => {
      if (!map[item.id]) map[item.id] = { name: item.name, qty:0, revenue:0 };
      map[item.id].qty += item.qty||1;
      map[item.id].revenue += item.subtotal||0;
    });
  });
  return Object.values(map).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue);
}

function renderTopProducts() {
  const prods = aggregateProducts().slice(0,8);
  const el = document.getElementById('top-products');
  if (!prods.length) { el.innerHTML = '<p class="no-data">Sin ventas en el período</p>'; return; }
  const maxQty = prods[0].qty || 1;
  el.innerHTML = prods.map((p,i) => `
<div class="top-prod-item">
  <div class="tp-rank">${i+1}</div>
  <div class="tp-info">
    <div class="tp-name" title="${_esc(p.name)}">${_esc(p.name)}</div>
    <div class="tp-bar-wrap"><div class="tp-bar" style="width:${Math.round(p.qty/maxQty*100)}%"></div></div>
  </div>
  <div class="tp-stats">
    <div class="tp-revenue">${p.qty} ud${p.qty!==1?'s':''}</div>
    <div class="tp-qty">$${p.revenue.toLocaleString('es-MX',{maximumFractionDigits:0})}</div>
  </div>
</div>`).join('');
}

/* Inventario */
function renderInventory() {
  const out  = products.filter(p => p.stock===0 || p.out_of_stock);
  const low  = products.filter(p => p.stock===1 && !p.out_of_stock);
  const ok   = products.filter(p => p.stock>1  && !p.out_of_stock);

  document.getElementById('inv-out').textContent = out.length;
  document.getElementById('inv-low').textContent = low.length;
  document.getElementById('inv-ok').textContent  = ok.length;
  document.getElementById('inv-total-label').textContent = `${products.length} productos`;

  const valorVenta = products.reduce((s, p) => s + (p.stock > 0 ? p.price * p.stock : 0), 0);
  document.getElementById('inv-valor-venta').textContent = '$' + Math.round(valorVenta).toLocaleString('es-MX');
  const valorCosto = products.reduce((s, p) => s + (p.cost > 0 && p.stock > 0 ? p.cost * p.stock : 0), 0);
  const costoWrap = document.getElementById('inv-valor-costo-wrap');
  if (valorCosto > 0) {
    document.getElementById('inv-valor-costo').textContent = '$' + Math.round(valorCosto).toLocaleString('es-MX');
    costoWrap.style.display = '';
  } else {
    costoWrap.style.display = 'none';
  }

  const el = document.getElementById('inv-list');
  const items = [
    ...out.map(p => ({name:p.name, badge:'Agotado', cls:'badge-red'})),
    ...low.map(p => ({name:p.name, badge:'1 ud.', cls:'badge-amber'}))
  ].slice(0,12);

  el.innerHTML = items.length
    ? items.map(i => `
<div class="inv-list-item">
  <span class="inv-name">${_esc(i.name)}</span>
  <span class="badge-sm ${i.cls}">${i.badge}</span>
</div>`).join('')
    : '<p class="no-data" style="padding:16px 0">Todo el inventario tiene existencias ✓</p>';
}

/* Valor de mercancía (a precio de venta) por categoría — Natura y Avon se muestran fusionados */
const _CAT_ROOT_MERGE = { avon: 'natura' };

function renderCapitalCategoria() {
  const card    = document.getElementById('capital-cat-card');
  const body    = document.getElementById('capital-cat-body');
  const totalEl = document.getElementById('capital-cat-total');
  if (!card || !body) return;

  const withStock = products.filter(p => p.price > 0 && p.stock > 0);
  if (!withStock.length) { card.style.display = 'none'; return; }

  const map = {};
  withStock.forEach(p => {
    const cat = categories.find(c => c.code === p.category);
    let rootCode, label;
    if (cat) {
      const root = cat.parent || cat.code;
      rootCode = _CAT_ROOT_MERGE[root] || root;
      label = rootCode === 'natura' ? 'Natura y Avon' : (categories.find(c => c.code === rootCode)?.label || rootCode);
    } else {
      rootCode = p.category || 'otro';
      label = p.category_label || 'Otro';
    }
    if (!map[rootCode]) map[rootCode] = { label, total: 0 };
    map[rootCode].total += p.price * p.stock;
  });

  const entries    = Object.values(map).sort((a, b) => b.total - a.total);
  const grandTotal = entries.reduce((s, e) => s + e.total, 0);
  const maxTotal   = entries[0].total;

  card.style.display = '';
  totalEl.textContent = `$${Math.round(grandTotal).toLocaleString('es-MX')} en total`;

  body.innerHTML = entries.map(e => {
    const pct   = Math.round(e.total / maxTotal * 100);
    const share = Math.round(e.total / grandTotal * 100);
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.84rem;font-weight:600">${_esc(e.label)}</span>
        <span style="font-weight:700;font-size:.88rem">$${Math.round(e.total).toLocaleString('es-MX')}</span>
      </div>
      <div style="background:var(--border);border-radius:50px;height:5px;overflow:hidden;margin-bottom:4px">
        <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:50px"></div>
      </div>
      <div style="font-size:.7rem;color:var(--muted)">${share}% del valor en venta</div>
    </div>`;
  }).join('');
}

/* ── RENTABILIDAD ── */
function renderRentabilidad() {
  const margin = p => p.cost > 0 && p.price > 0
    ? Math.round((p.price - p.cost) / p.price * 100) : null;

  const withCost = products.filter(p => p.cost > 0 && p.price > 0);
  const noCost   = products.filter(p => !p.cost || p.cost <= 0);
  const high = withCost.filter(p => margin(p) >= 30);
  const mid  = withCost.filter(p => margin(p) >= 10 && margin(p) < 30);
  const low  = withCost.filter(p => margin(p) < 10);

  document.getElementById('rent-high').textContent = high.length;
  document.getElementById('rent-mid').textContent  = mid.length;
  document.getElementById('rent-low').textContent  = low.length;
  document.getElementById('rent-label').textContent =
    withCost.length ? `${withCost.length} producto${withCost.length!==1?'s':''} con costo` : 'Sin costos registrados';

  const noCostEl = document.getElementById('rent-no-cost');
  noCostEl.style.display = noCost.length ? '' : 'none';
  document.getElementById('rent-no-cost-n').textContent = noCost.length;

  const watchList = [...low, ...mid]
    .map(p => ({ ...p, pct: margin(p) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 10);

  const el = document.getElementById('rent-list');
  if (!watchList.length) {
    el.innerHTML = withCost.length
      ? '<p class="no-data" style="padding:10px 0">Todos los productos con costo tienen margen ≥30% ✓</p>'
      : '';
    return;
  }
  el.innerHTML =
    `<p style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Margen más bajo — revisar precio o costo</p>` +
    watchList.map(p => `
<div class="inv-list-item">
  <span class="inv-name">${_esc(p.name)}</span>
  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
    <span style="font-size:.74rem;color:var(--muted)">$${p.price.toLocaleString('es-MX')}</span>
    <span class="badge-sm ${p.pct < 10 ? 'badge-red' : 'badge-amber'}">${p.pct}%</span>
  </div>
</div>`).join('');
}

/* setPeriod removed — setMode() / navigate() handle period changes */

/* ── RESUMEN DEL DÍA ── */
let _aptResumen = { count: 0, pendiente: 0, vencidos: 0 };

function renderDaySummary() {
  const fecha = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('ds-date').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);

  const ventas = todaySales.filter(s => s.type !== 'apartado');
  const todayStartMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const todayEndMs   = Date.now();
  let totalHoy = 0;
  todaySales.forEach(v => {
    const abonos = Array.isArray(v.abonos) ? v.abonos : [];
    if (abonos.length) {
      abonos.forEach(a => {
        const t = new Date(a.date).getTime();
        if (t >= todayStartMs && t <= todayEndMs) totalHoy += parseFloat(a.amount || 0);
      });
    } else if (v.type !== 'apartado') {
      totalHoy += parseFloat(v.total || 0);
    }
  });
  const numVentas = ventas.length;

  const mainEl = document.getElementById('ds-main');
  const subEl  = document.getElementById('ds-sub');
  const bestEl = document.getElementById('ds-best');
  const pillsEl = document.getElementById('ds-pills');

  if (!numVentas) {
    mainEl.innerHTML = '<span class="day-summary-none">Aún no hay ventas hoy</span>';
    subEl.textContent = '';
    bestEl.style.display = 'none';
  } else {
    mainEl.textContent = `$${totalHoy.toLocaleString('es-MX', {maximumFractionDigits:0})}`;
    subEl.textContent = `${numVentas} venta${numVentas !== 1 ? 's' : ''} hoy`;

    // Producto más vendido por ingresos
    const freq = {};
    ventas.forEach(v => (v.items || []).forEach(i => {
      freq[i.name] = (freq[i.name] || 0) + parseFloat(i.subtotal ?? i.price * (i.qty||1));
    }));
    const best = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];
    if (best) {
      bestEl.style.display = 'block';
      const bestName = best[0].length > 28 ? best[0].slice(0, 26) + '…' : best[0];
      bestEl.textContent = `⭐ Lo más vendido: ${bestName} ($${Math.round(best[1]).toLocaleString('es-MX')})`;
    } else {
      bestEl.style.display = 'none';
    }
  }

  // Pills
  const pills = [];
  let efectivo = 0, transfer = 0;
  todaySales.forEach(v => {
    const abonos = Array.isArray(v.abonos) ? v.abonos : [];
    if (abonos.length) {
      abonos.forEach(a => {
        const t = new Date(a.date).getTime();
        if (t >= todayStartMs && t <= todayEndMs) {
          if (a.method === 'transferencia') transfer += parseFloat(a.amount || 0);
          else efectivo += parseFloat(a.amount || 0);
        }
      });
    } else if (v.type !== 'apartado') {
      if (v.payment_method === 'transferencia') transfer += parseFloat(v.total || 0);
      else efectivo += parseFloat(v.total || 0);
    }
  });
  if (efectivo > 0) pills.push(`<span class="day-summary-pill">💵 $${efectivo.toLocaleString('es-MX',{maximumFractionDigits:0})} efectivo</span>`);
  if (transfer > 0) pills.push(`<span class="day-summary-pill">📱 $${transfer.toLocaleString('es-MX',{maximumFractionDigits:0})} transferencia</span>`);
  if (_aptResumen.count > 0) {
    const cls = _aptResumen.vencidos > 0 ? 'apt venc' : 'apt';
    const txt = _aptResumen.vencidos > 0
      ? `⚠️ ${_aptResumen.count} apartado${_aptResumen.count>1?'s':''} · ${_aptResumen.vencidos} vencido${_aptResumen.vencidos>1?'s':''}`
      : `⏳ ${_aptResumen.count} apartado${_aptResumen.count>1?'s':''} por cobrar`;
    pills.push(`<span class="day-summary-pill ${cls}">${txt}</span>`);
  }
  pillsEl.innerHTML = pills.join('');
}

/* ── APARTADOS PENDIENTES ── */
async function loadApartadosPendientes() {
  const body = document.getElementById('apt-pending-body');
  const label = document.getElementById('apt-summary-label');
  const result = await api(`sales?type=eq.apartado&select=id,total,paid_amount,customer,created_at,due_date,items&order=created_at.asc`);
  if (!result.ok || !result.data?.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">Sin apartados pendientes</div>';
    return;
  }
  const data = result.data;
  const totalPendiente = data.reduce((s, a) => s + Math.max(0, (parseFloat(a.total)||0) - (parseFloat(a.paid_amount)||0)), 0);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const vencidos = data.filter(a => a.due_date && new Date(a.due_date+'T00:00:00') < hoy).length;
  _aptResumen = { count: data.length, pendiente: totalPendiente, vencidos };

  label.textContent = `${data.length} activos · $${totalPendiente.toLocaleString('es-MX')} por cobrar${vencidos ? ` · ⚠️ ${vencidos} vencido${vencidos>1?'s':''}` : ''}`;

  body.innerHTML = data.map(s => {
    const total     = parseFloat(s.total) || 0;
    const pagado    = parseFloat(s.paid_amount) || 0;
    const pendiente = Math.max(0, total - pagado);
    const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
    const custParts = (s.customer || '').split(' · 📱 ');
    const nombre    = custParts[0] || 'Sin nombre';
    const fecha     = new Date(s.created_at).toLocaleDateString('es-MX', { day:'numeric', month:'short' });
    const summary   = Array.isArray(s.items) ? s.items.map(i=>i.name).join(', ') : '';

    let dueBadge = '';
    if (s.due_date) {
      const due      = new Date(s.due_date + 'T00:00:00');
      const diffDays = Math.round((due - hoy) / 86400000);
      const dueColor = diffDays < 0 ? '#E85D5D' : diffDays <= 7 ? '#D97706' : '#2D6A4F';
      const dueText  = diffDays < 0 ? `Vencido hace ${Math.abs(diffDays)}d` : diffDays === 0 ? 'Vence hoy' : `Vence ${due.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}`;
      dueBadge = `<span style="font-size:.68rem;font-weight:700;color:${dueColor}">📅 ${dueText}</span>`;
    }

    return `<div style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div style="font-weight:600;font-size:.84rem">👤 ${_esc(nombre)}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:2px">${_esc(fecha + ' · ' + summary.substring(0,50) + (summary.length>50?'…':''))}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;font-size:.88rem;color:var(--red)">$${pendiente.toLocaleString('es-MX')}</div>
          <div style="font-size:.68rem;color:var(--muted)">de $${total.toLocaleString('es-MX')}</div>
        </div>
      </div>
      <div style="background:var(--border);border-radius:50px;height:5px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:50px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.68rem;color:var(--muted)">${pct}% pagado</span>
        ${dueBadge}
      </div>
    </div>`;
  }).join('');
}

/* ── INIT ── */
function sendDailySummaryWA() {
  const fmt = n => '$' + parseFloat(n||0).toLocaleString('es-MX', {maximumFractionDigits:0});
  const today = sales.filter(s => {
    const d = new Date(s.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const ventas  = today.filter(s => s.type !== 'apartado');
  const aptos   = today.filter(s => s.type === 'apartado');
  const ingresos = ventas.reduce((s,x) => s + parseFloat(x.total||0), 0);
  const efectivo = ventas.filter(s=>s.payment_method==='efectivo').reduce((s,x)=>s+parseFloat(x.total||0),0);
  const transf   = ventas.filter(s=>s.payment_method==='transferencia').reduce((s,x)=>s+parseFloat(x.total||0),0);
  const now = new Date();
  const fecha = now.toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  let msg = `📊 *Resumen del día — Tres Encantos*\n${fecha}\n\n`;
  msg += `💰 *Ingresos del día:* ${fmt(ingresos)}\n`;
  msg += `🔢 *Ventas completadas:* ${ventas.length}\n`;
  if (efectivo > 0) msg += `💵 Efectivo: ${fmt(efectivo)}\n`;
  if (transf > 0)   msg += `📱 Transferencia: ${fmt(transf)}\n`;
  if (aptos.length > 0) msg += `\n📌 *Apartados nuevos:* ${aptos.length} (anticipo ${fmt(aptos.reduce((s,x)=>s+parseFloat(x.paid_amount||0),0))})\n`;
  if (!ventas.length && !aptos.length) msg += `_Sin ventas registradas hoy._\n`;
  msg += `\n¡Hasta mañana! 🌟`;
  const WA = '5215534548417';
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── CALENDAR HEATMAP (month only) ── */
function renderCalendar() {
  const card = document.getElementById('calendar-card');
  const el   = document.getElementById('sales-calendar');
  if (!card||!el) return;
  if (_statsMode !== 'month') { card.style.display='none'; return; }
  card.style.display='';

  const fromIso = _currentFrom(), toIso = _currentTo();
  const today = new Date(); today.setHours(0,0,0,0);

  const byDay = {};
  salesAll.forEach(s => {
    const day = _localDay(s.created_at);
    byDay[day] = (byDay[day]||0) + _abonoRevenue(s, fromIso, toIso);
  });
  const maxRev = Math.max(1, ...Object.values(byDay));

  const d0 = new Date(fromIso);
  const year = d0.getFullYear(), month = d0.getMonth();
  const firstDow = (new Date(year,month,1).getDay()+6)%7; // Mon=0
  const lastD    = new Date(year,month+1,0).getDate();

  const _DOWS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html = '<div class="cal-grid">';
  _DOWS.forEach(d => html += `<div class="cal-hdr">${d}</div>`);
  for (let i=0;i<firstDow;i++) html += '<div class="cal-empty"></div>';

  for (let d=1;d<=lastD;d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rev = byDay[key]||0;
    const cellDate = new Date(year,month,d);
    const isToday  = cellDate.getTime()===today.getTime();
    const isFuture = cellDate > today;

    let cls = 'cal-zero';
    if (isFuture) cls = 'cal-future';
    else if (rev>0) {
      const pct = rev/maxRev;
      cls = pct>0.8?'cal-l5':pct>0.55?'cal-l4':pct>0.33?'cal-l3':pct>0.12?'cal-l2':'cal-l1';
    }
    const todayCls = isToday?' cal-today':'';
    const fmtRev   = rev>=1000?'$'+(rev/1000).toFixed(1)+'k':'$'+Math.round(rev);
    const amtStr   = rev>0?`<span class="cal-cell-amt">${fmtRev}</span>`:'';
    const tooltip  = rev>0?`<span class="cal-tooltip">${d} ${_MN[month]} · $${Math.round(rev).toLocaleString('es-MX')}</span>`
      : (!isFuture?`<span class="cal-tooltip">${d} ${_MN[month]} · Sin ventas</span>`:'');
    const tapAttr = !isFuture ? ' onclick="_calTap(this)"' : '';
    html += `<div class="cal-cell ${cls}${todayCls}"${tapAttr}>${tooltip}<span class="cal-cell-n">${d}</span>${amtStr}</div>`;
  }
  html += '</div>';
  html += `<div class="cal-legend"><span>Menos</span><div class="cal-legend-cell" style="background:var(--cream);border:1px dashed var(--border)"></div><div class="cal-legend-cell" style="background:#FEF3CD"></div><div class="cal-legend-cell" style="background:#FBBF24"></div><div class="cal-legend-cell" style="background:#C9A462"></div><div class="cal-legend-cell" style="background:#A67C3A"></div><div class="cal-legend-cell" style="background:#7C5A2E"></div><span>Más</span></div>`;
  el.innerHTML = html;
}

function _calTap(cell) {
  const was = cell.classList.contains('cal-tap');
  document.querySelectorAll('.cal-tap').forEach(c => c.classList.remove('cal-tap'));
  if (!was) cell.classList.add('cal-tap');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.cal-cell')) document.querySelectorAll('.cal-tap').forEach(c => c.classList.remove('cal-tap'));
});

/* ── WEEKDAY PATTERN (week + month) ── */
function renderWeekdayChart() {
  const card = document.getElementById('weekday-card');
  if (!card) return;
  if (_statsMode!=='month') { card.style.display='none'; if(weekdayChart){weekdayChart.destroy();weekdayChart=null;} return; }

  const fromIso = _currentFrom(), toIso = _currentTo();
  const _DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const byDow = Array(7).fill(0);

  salesAll.forEach(s => {
    const dow = (new Date(s.created_at).getDay()+6)%7;
    byDow[dow] += _abonoRevenue(s, fromIso, toIso);
  });
  if (byDow.every(v=>v===0)) { card.style.display='none'; return; }

  const ctx = document.getElementById('weekday-chart')?.getContext('2d');
  if (!ctx) return;
  if (weekdayChart) { weekdayChart.destroy(); weekdayChart=null; }
  card.style.display='';

  const maxDow = Math.max(...byDow);
  const colors = byDow.map(v => v===maxDow&&v>0?'#C9A462':'rgba(201,164,98,.4)');

  const lbl = document.getElementById('weekday-period-label');
  if (lbl) lbl.textContent = PERIOD_LABELS[currentPeriod]||'';

  weekdayChart = new Chart(ctx, {
    type:'bar',
    data:{
      labels:_DOW,
      datasets:[{data:byDow, backgroundColor:colors, borderRadius:6, borderSkipped:false}]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>`$${c.parsed.y.toLocaleString('es-MX')}`}}
      },
      scales:{
        y:{beginAtZero:true,ticks:{callback:v=>v>=1000?'$'+(v/1000).toFixed(0)+'k':'$'+v,font:{size:10}},grid:{color:'#F0E8E0'}},
        x:{grid:{display:false},ticks:{font:{size:11,weight:'500'}}}
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const _s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const _meta = _s?.user?.user_metadata || {};
    const _name = _meta.full_name || _meta.name || _s?.user?.email?.split('@')[0] || '';
    const _av = document.getElementById('user-avatar');
    const _nl = document.getElementById('user-name-label');
    if (_av) _av.textContent = _name ? _name[0].toUpperCase() : '?';
    if (_nl) _nl.textContent = _name;
  } catch {}
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 12000)
  );
  try {
    _updateNavUI();
    await Promise.race([
      Promise.all([loadProducts(), loadSales(), loadPreviousSales(), loadApartadosPendientes(), loadNameMap(), loadTodaySales(), loadCategories()]),
      timeout
    ]);
    renderAll();
  } catch {
    document.querySelectorAll('.loading-state').forEach(el => {
      el.innerHTML = '<span style="color:#E85D5D;font-size:.82rem">⚠️ Error al cargar — revisa tu conexión y recarga la página</span>';
    });
  }
});


function _dvImgPopup(trigger, img, name, price, qty, stockInfo, stockColor) {
  document.getElementById('img-lightbox-img').src = _driveSz(img, 900);
  document.getElementById('img-lb-name').textContent = name;
  const priceStr = qty > 1
    ? `${qty} × $${price.toLocaleString('es-MX',{maximumFractionDigits:0})}`
    : `$${price.toLocaleString('es-MX',{maximumFractionDigits:0})} MXN`;
  document.getElementById('img-lb-price').textContent = priceStr;
  const stockRow = document.getElementById('img-lb-stock-row');
  if (stockInfo) { stockRow.style.display = ''; document.getElementById('img-lb-stock').textContent = stockInfo; }
  else { stockRow.style.display = 'none'; }
  document.getElementById('img-lightbox').classList.add('open');
  document.body.style.overscrollBehaviorY = 'none';
  _initStatsLightboxSwipe();
}

function _closeLightbox() {
  document.getElementById('img-lightbox').classList.remove('open');
  document.body.style.overscrollBehaviorY = '';
}

function _initStatsLightboxSwipe() {
  const lb = document.getElementById('img-lightbox');
  if (!lb || lb._swipeInited) return;
  lb._swipeInited = true;
  let sy = 0, cy = 0, on = false;
  lb.addEventListener('touchstart', e => { sy = e.touches[0].clientY; cy = 0; on = false; }, { passive: true });
  lb.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - sy;
    if (!on && dy > 10) on = true;
    if (!on) return;
    e.preventDefault();
    cy = Math.max(0, dy);
    const lbImg = document.getElementById('img-lightbox-img');
    if (lbImg) lbImg.style.transform = `translateY(${cy * 0.45}px) scale(${Math.max(0.85, 1 - cy / 700)})`;
    lb.style.background = `rgba(0,0,0,${Math.max(0, 0.88 - cy / 280)})`;
  }, { passive: false });
  lb.addEventListener('touchend', () => {
    if (!on) return; on = false;
    const lbImg = document.getElementById('img-lightbox-img');
    if (cy > 80) {
      _closeLightbox();
      if (lbImg) { lbImg.style.transform = ''; lbImg.style.transition = ''; }
      lb.style.background = '';
    } else {
      if (lbImg) { lbImg.style.transition = 'transform .36s cubic-bezier(.34,1.26,.64,1)'; lbImg.style.transform = ''; setTimeout(() => lbImg.style.transition = '', 360); }
      lb.style.background = '';
    }
    cy = 0;
  });
}
