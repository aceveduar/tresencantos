/* ── CONFIG ── */
const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
const SESSION_KEY = 'te_admin_session';

/* ── AUTH ── */
(function(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!(s?.access_token && s.expires_at > Math.floor(Date.now()/1000)+60))
      return window.location.href = 'admin.html';
  } catch { window.location.href = 'admin.html'; }
})();

async function doLogout() {
  await logActivity('sesion_cerrada', 'Cerró sesión');
  sessionStorage.removeItem('te_user_can');
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
  try {
    const r = await _call(_getStatsToken());
    if (r.status === 401 && await _refreshStatsToken()) return await _call(_getStatsToken());
    return r;
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

// PostgREST/Supabase puede limitar silenciosamente una respuesta a 1,000 filas.
// Paginar siempre las colecciones que alimentan reportes evita cortes invisibles
// (a diferencia de las vistas de Caja, Reportes sí necesita la colección completa
// para que los totales no queden truncados en silencio).
async function _fetchAll(path, pageSize = 1000) {
  return _posPaginatedFetch(path, { pageSize });
}

const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _driveSz = (url, w) => (url && url.includes('drive.google.com')) ? url.replace(/sz=w\d+/, `sz=w${w}`) : (url || '');

const _myEmail = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'{}')?.user?.email||''; } catch { return ''; } })();
function logActivity(action, summary, meta = null) {
  return api('activity_log', {
    method: 'POST',
    body: JSON.stringify({ user_email: _myEmail, action, summary, meta })
  }).catch(() => {});
}

// Los reportes pertenecen al calendario operativo de la tienda, no a la zona
// configurada en el dispositivo desde el que se consultan.
const _REPORT_TIME_ZONE = 'America/Mexico_City';
const _MX_DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: _REPORT_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function _mxParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = {};
  _MX_DATE_TIME.formatToParts(date).forEach(part => {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  });
  return {
    year: parts.year, month: parts.month, day: parts.day,
    hour: parts.hour, minute: parts.minute, second: parts.second
  };
}

function _dayKey(civil) {
  if (!civil) return '';
  return `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`;
}

function _parseDayKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;
  const civil = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
  return check.getUTCFullYear() === civil.year && check.getUTCMonth() === civil.month - 1 && check.getUTCDate() === civil.day
    ? civil
    : null;
}

function _civilDayNumber(civil) {
  return civil ? Math.floor(Date.UTC(civil.year, civil.month - 1, civil.day) / 86400000) : NaN;
}

function _addCivilDays(civil, amount) {
  const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + amount));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function _addCivilMonths(civil, amount) {
  const date = new Date(Date.UTC(civil.year, civil.month - 1 + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1 };
}

function _civilWeekday(civil) {
  return (new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay() + 6) % 7; // Lun=0
}

function _civilDaysInMonth(civil) {
  return new Date(Date.UTC(civil.year, civil.month, 0)).getUTCDate();
}

// Convierte una pared horaria mexicana a un instante real. La corrección
// iterativa también cubre cambios históricos de offset de la zona IANA.
function _mxInstant(civil, endOfDay = false) {
  const target = {
    ...civil,
    hour: endOfDay ? 23 : 0,
    minute: endOfDay ? 59 : 0,
    second: endOfDay ? 59 : 0,
    millisecond: endOfDay ? 999 : 0
  };
  const targetWall = Date.UTC(
    target.year, target.month - 1, target.day,
    target.hour, target.minute, target.second, target.millisecond
  );
  let instant = targetWall;
  for (let attempt = 0; attempt < 4; attempt++) {
    const represented = _mxParts(new Date(instant));
    if (!represented) break;
    const representedWall = Date.UTC(
      represented.year, represented.month - 1, represented.day,
      represented.hour, represented.minute, represented.second,
      ((instant % 1000) + 1000) % 1000
    );
    const correction = targetWall - representedWall;
    if (!correction) break;
    instant += correction;
  }
  return new Date(instant);
}

function _localDay(value) { return _dayKey(_mxParts(value)); }
function _mxHour(value) { return _mxParts(value)?.hour ?? -1; }
function _mxTime(value) {
  const parts = _mxParts(value);
  return parts ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` : '--:--';
}
function _mxDateLabel(value, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', { timeZone: _REPORT_TIME_ZONE, ...options }).format(date);
}
function _dayKeyLabel(key, options) {
  const civil = _parseDayKey(key);
  if (!civil) return '';
  // Mediodía UTC evita que el formateador cruce de día en cualquier offset de México.
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', ...options })
    .format(new Date(Date.UTC(civil.year, civil.month - 1, civil.day, 12)));
}

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
let prevSales = [];
let payments = [];
let prevPayments = [];
let todayPayments = [];
let todayLiquidatedSales = [];
let paymentsLoaded = false;
let prevPaymentsLoaded = false;
let todayPaymentsLoaded = false;
let salesLoaded = false;
let prevSalesLoaded = false;
let productsLoaded = false;
let todaySummaryLoaded = false;
let apartadosPendientesLoaded = false;
let _customers = [];
let _customerSales = [];
let clientesLoaded = false;
let aptNewCount = 0;
let aptNewLoaded = false;
let prevAptNewCount = 0;
let prevAptNewLoaded = false;
const paymentSalesById = new Map();
let products = [];
let revenueChart = null;
let catChart = null;
let hourChart = null;
let weekdayChart = null;
let nameMap = {};
let categories = [];
let _statsReloadGeneration = 0;

const _SALE_COLS = 'id,total,created_at,items,payment_method,type,origin_type,status,liquidated_at,seller_email,discount,customer,due_date,paid_amount,note,cancelled_at,is_test';
const _PAYMENT_COLS = 'id,sale_id,request_id,request_line,amount,kind,method,paid_at,collected_by,collected_by_email,is_estimated,source';

function _paymentAmount(payment) {
  const amount = parseFloat(payment?.amount) || 0;
  return payment?.kind === 'refund' ? -Math.abs(amount) : amount;
}

function _paymentTotal(list) {
  const total = (list || []).reduce((sum, payment) => sum + _paymentAmount(payment), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

// sale_payments no tiene su propia columna is_test -- se resuelve vía la
// venta a la que pertenece (ya cargada en paymentSalesById por
// _loadPaymentSales, que a propósito NO filtra is_test para poder resolver
// esto). Los fetch de `sales` sí filtran is_test=eq.false directo en la URL.
function _excludeTestPayments(paymentsArr) {
  return (paymentsArr || []).filter(p => !paymentSalesById.get(String(p.sale_id))?.is_test);
}

function _refundOperationCount(list) {
  const keys = new Set();
  (list || []).forEach(payment => {
    if (payment?.kind !== 'refund') return;
    keys.add(payment.request_id ? `${payment.sale_id}:${payment.request_id}` : `legacy:${payment.id}`);
  });
  return keys.size;
}

function _groupRefundOperations(list) {
  const grouped = [];
  const byKey = new Map();
  (list || []).forEach(payment => {
    if (payment.kind !== 'refund' || !payment.request_id) {
      grouped.push(payment);
      return;
    }
    const key = `${payment.sale_id}:${payment.request_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      const operation = { ...payment, refund_breakdown: [{ method: payment.method, amount: _paymentAmount(payment) }] };
      byKey.set(key, operation);
      grouped.push(operation);
      return;
    }
    existing.amount = _paymentAmount(existing) + _paymentAmount(payment);
    existing.is_estimated = Boolean(existing.is_estimated || payment.is_estimated);
    existing.refund_breakdown.push({ method: payment.method, amount: _paymentAmount(payment) });
    if (existing.method !== payment.method) existing.method = 'multiple';
  });
  return grouped;
}

function _saleOrigin(sale) {
  return sale?.origin_type || (sale?.type === 'apartado' ? 'apartado' : 'venta');
}

function _isCompletedSale(sale) {
  if (sale?.status) return sale.status === 'liquidado';
  return sale?.type !== 'apartado';
}

function _rememberSales(rows) {
  (rows || []).forEach(sale => paymentSalesById.set(String(sale.id), sale));
}

async function _loadPaymentSales(paymentRows) {
  const ids = [...new Set((paymentRows || [])
    .map(payment => Number(payment.sale_id))
    .filter(Number.isFinite))]
    .filter(id => !paymentSalesById.has(String(id)));
  let loaded = true;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const r = await _fetchAll(`sales?select=${_SALE_COLS}&id=in.(${chunk.join(',')})&order=id.asc`);
    if (r.ok) _rememberSales(r.data);
    else loaded = false;
  }
  return loaded && ids.every(id => paymentSalesById.has(String(id)));
}

/* ── PERIOD NAV ── */
const _MN  = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const _MNF = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function _fmt(d)  { return d.day+' '+_MN[d.month-1]+' '+d.year; }
function _fmtRange(a,b) {
  if (a.month===b.month&&a.year===b.year)
    return a.day+'–'+b.day+' '+_MN[a.month-1]+' '+a.year;
  if (a.year===b.year)
    return a.day+' '+_MN[a.month-1]+'–'+b.day+' '+_MN[b.month-1]+' '+a.year;
  return _fmt(a)+' – '+_fmt(b);
}
function _fmtMonth(d) { return _MNF[d.month-1]+' '+d.year; }

function getRange(mode, offset) {
  const today = _mxParts(new Date());
  let fromDay, toDay, label, rangeStr;
  if (mode === 'day') {
    fromDay = _addCivilDays(today, offset);
    toDay = fromDay;
    rangeStr = _fmt(fromDay);
    label = offset===0 ? 'Hoy' : offset===-1 ? 'Ayer' : rangeStr;
  } else if (mode === 'week') {
    fromDay = _addCivilDays(today, -_civilWeekday(today) + offset * 7);
    toDay = _addCivilDays(fromDay, 6);
    rangeStr = _fmtRange(fromDay, toDay);
    label = offset===0 ? 'Esta semana' : offset===-1 ? 'Semana pasada' : rangeStr;
  } else {
    fromDay = _addCivilMonths(today, offset);
    toDay = { ...fromDay, day: _civilDaysInMonth(fromDay) };
    rangeStr = _fmtMonth(fromDay);
    label = offset===0 ? 'Este mes' : offset===-1 ? 'Mes pasado' : rangeStr;
  }
  return {
    from: _mxInstant(fromDay).toISOString(),
    to: _mxInstant(toDay, true).toISOString(),
    label, rangeStr,
    fromDay: _dayKey(fromDay),
    toDay: _dayKey(toDay)
  };
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
  // El botón de WhatsApp siempre resume el día calendario real (no el período
  // navegado) — solo debe verse cuando eso coincide con lo que está en pantalla.
  const waBtn = document.getElementById('stats-wa-btn');
  if (waBtn) waBtn.style.display = (_statsMode==='day'&&_statsOffset===0) ? '' : 'none';
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
  const generation = ++_statsReloadGeneration;
  const mode = _statsMode;
  const offset = _statsOffset;
  ['kpi-revenue','kpi-sales','kpi-avg'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '…'; });
  await Promise.all([
    loadSales(mode, offset, generation),
    loadPreviousSales(mode, offset, generation),
    loadTodaySales(generation)
  ]);
  if (generation !== _statsReloadGeneration) return;
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

async function loadSales(mode = _statsMode, offset = _statsOffset, generation = null) {
  const { from, to } = getRange(mode, offset);
  const [directSalesR, apartadoSalesR, paymentsR, apartadoZeroR, aptNewR] = await Promise.all([
    // Una venta directa se completa al crearla; un apartado, al liquidarlo.
    _fetchAll(`sales?select=${_SALE_COLS}&origin_type=eq.venta&status=eq.liquidado&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=created_at.desc,id.desc`),
    _fetchAll(`sales?select=${_SALE_COLS}&origin_type=eq.apartado&status=eq.liquidado&liquidated_at=gte.${encodeURIComponent(from)}&liquidated_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=liquidated_at.desc,id.desc`),
    // Dinero sigue exclusivamente la fecha real del movimiento; no se filtra por
    // el estado actual de la venta para no borrar cobros históricos al cancelar.
    _fetchAll(`sale_payments?select=${_PAYMENT_COLS}&paid_at=gte.${encodeURIComponent(from)}&paid_at=lte.${encodeURIComponent(to)}&order=paid_at.desc,id.desc`),
    // Un apartado creado con $0 de anticipo no genera fila en sale_payments
    // (record_sale_atomic_v2 solo inserta pago si v_paid>0) — sin esto,
    // "Movimientos de hoy" no reflejaba que se creó un apartado nuevo.
    _fetchAll(`sales?select=${_SALE_COLS}&origin_type=eq.apartado&paid_amount=eq.0&cancelled_at=is.null&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=created_at.desc,id.desc`),
    // Apartados nuevos del período (KPI) — se cuentan por fecha de creación,
    // sin importar su estado actual (activo/liquidado/cancelado), igual que
    // "cuántos abrí". Antes filtraba cancelled_at=is.null, contradiciendo su
    // propio comentario: uno abierto y cancelado días después desaparecía de
    // este conteo al ver el reporte de aquel día, aunque su anticipo (dinero,
    // que sí sigue la fecha real del movimiento sin importar el estado
    // actual) siguiera apareciendo — dos cifras del mismo día en desacuerdo.
    _fetchAll(`sales?select=id&origin_type=eq.apartado&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=id.asc`)
  ]);
  const directSales = (directSalesR.ok && Array.isArray(directSalesR.data)) ? directSalesR.data : [];
  const apartadoSales = (apartadoSalesR.ok && Array.isArray(apartadoSalesR.data)) ? apartadoSalesR.data : [];
  const nextPayments = (paymentsR.ok && Array.isArray(paymentsR.data)) ? paymentsR.data : [];
  const apartadoZero = (apartadoZeroR.ok && Array.isArray(apartadoZeroR.data)) ? apartadoZeroR.data : [];
  await _loadPaymentSales(nextPayments);
  if (generation !== null && generation !== _statsReloadGeneration) return;
  salesLoaded = directSalesR.ok && apartadoSalesR.ok;
  paymentsLoaded = paymentsR.ok;
  aptNewLoaded = aptNewR.ok;
  aptNewCount = aptNewR.ok && Array.isArray(aptNewR.data) ? aptNewR.data.length : 0;
  _rememberSales(apartadoZero);
  payments = _excludeTestPayments([...nextPayments, ...apartadoZero.map(sale => ({
    id: `apartado-created-${sale.id}`,
    sale_id: sale.id,
    kind: 'apartado_created',
    amount: 0,
    method: null,
    paid_at: sale.created_at,
    is_estimated: false,
    collected_by_email: sale.seller_email || null
  }))]);
  sales = salesLoaded ? [...directSales, ...apartadoSales] : [];
  _rememberSales(sales);
}

async function loadPreviousSales(mode = _statsMode, offset = _statsOffset, generation = null) {
  const previous = getRange(mode, offset - 1);
  const { from, to } = previous;
  const [directSalesR, apartadoSalesR, paymentsR, aptNewR] = await Promise.all([
    _fetchAll(`sales?select=${_SALE_COLS}&origin_type=eq.venta&status=eq.liquidado&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=created_at.desc,id.desc`),
    _fetchAll(`sales?select=${_SALE_COLS}&origin_type=eq.apartado&status=eq.liquidado&liquidated_at=gte.${encodeURIComponent(from)}&liquidated_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=liquidated_at.desc,id.desc`),
    _fetchAll(`sale_payments?select=${_PAYMENT_COLS}&paid_at=gte.${encodeURIComponent(from)}&paid_at=lte.${encodeURIComponent(to)}&order=paid_at.desc,id.desc`),
    _fetchAll(`sales?select=id&origin_type=eq.apartado&cancelled_at=is.null&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=id.asc`)
  ]);
  const nextSalesLoaded = directSalesR.ok && apartadoSalesR.ok;
  const nextPayments = (paymentsR.ok && Array.isArray(paymentsR.data)) ? paymentsR.data : [];
  const nextSales = nextSalesLoaded ? [
    ...((directSalesR.ok && Array.isArray(directSalesR.data)) ? directSalesR.data : []),
    ...((apartadoSalesR.ok && Array.isArray(apartadoSalesR.data)) ? apartadoSalesR.data : [])
  ] : [];
  // Necesario para que _saleOrigin(paymentSalesById.get(...)) resuelva bien el
  // origen de cada pago del período anterior (si no, cae al default 'venta').
  await _loadPaymentSales(nextPayments);
  if (generation !== null && generation !== _statsReloadGeneration) return;
  prevAptNewLoaded = aptNewR.ok;
  prevAptNewCount = aptNewR.ok && Array.isArray(aptNewR.data) ? aptNewR.data.length : 0;
  prevSalesLoaded = nextSalesLoaded;
  prevPaymentsLoaded = paymentsR.ok;
  prevPayments = _excludeTestPayments(nextPayments);
  prevSales = nextSales;
}

async function loadProducts() {
  const r = await _fetchAll('products?select=id,name,category,category_label,price,cost,stock,out_of_stock,image,images,expiry_date&order=position.asc,id.asc');
  productsLoaded = r.ok;
  products = (r.ok && Array.isArray(r.data)) ? r.data : [];
}

let todaySales = [];
async function loadTodaySales(generation = null) {
  todaySummaryLoaded = false;
  const { from, to } = getRange('day', 0);
  const [salesR, paymentsR, liquidatedR] = await Promise.all([
    _fetchAll(`sales?select=${_SALE_COLS}&cancelled_at=is.null&created_at=gte.${encodeURIComponent(from)}&created_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=created_at.desc,id.desc`),
    _fetchAll(`sale_payments?select=${_PAYMENT_COLS}&paid_at=gte.${encodeURIComponent(from)}&paid_at=lte.${encodeURIComponent(to)}&order=paid_at.desc,id.desc`),
    _fetchAll(`sales?select=${_SALE_COLS}&origin_type=eq.apartado&status=eq.liquidado&liquidated_at=gte.${encodeURIComponent(from)}&liquidated_at=lte.${encodeURIComponent(to)}&is_test=eq.false&order=liquidated_at.desc,id.desc`)
  ]);
  const nextSales = (salesR.ok && Array.isArray(salesR.data)) ? salesR.data : [];
  const nextPayments = (paymentsR.ok && Array.isArray(paymentsR.data)) ? paymentsR.data : [];
  const nextLiquidated = (liquidatedR.ok && Array.isArray(liquidatedR.data)) ? liquidatedR.data : [];
  const paymentSalesLoaded = await _loadPaymentSales(nextPayments);
  if (generation !== null && generation !== _statsReloadGeneration) return;
  todaySummaryLoaded = salesR.ok && paymentsR.ok && liquidatedR.ok && paymentSalesLoaded;
  todaySales = salesR.ok ? nextSales : [];
  todayPaymentsLoaded = paymentsR.ok;
  todayPayments = _excludeTestPayments(nextPayments);
  todayLiquidatedSales = liquidatedR.ok ? nextLiquidated : [];
  _rememberSales(todaySales);
  _rememberSales(todayLiquidatedSales);
}

// Miniaturas + nombre/precio de cada producto — compartido entre venta y abono
function _dvItemsHtml(items) {
  return items.map(i => {
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
}

function renderTodaySales() {
  const el = document.getElementById('today-sales-list');
  const countEl = document.getElementById('today-sales-count');
  const titleEl = document.getElementById('today-sales-title');
  if (!el) return;
  const isToday = _statsMode === 'day' && _statsOffset === 0;
  if (titleEl) titleEl.textContent = isToday ? 'Movimientos de hoy' : `Movimientos — ${PERIOD_LABELS[currentPeriod]}`;
  if (!paymentsLoaded) {
    if (countEl) countEl.textContent = '';
    el.innerHTML = '<p class="no-data" style="color:var(--red)">No se pudieron cargar los movimientos</p>';
    return;
  }

  const displayItems = _groupRefundOperations(payments)
    .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
  const receipts = displayItems.filter(p => p.kind !== 'refund' && p.kind !== 'adjustment' && p.kind !== 'apartado_created').length;
  const refunds = _refundOperationCount(payments);
  const adjustments = displayItems.filter(p => p.kind === 'adjustment').length;

  const hoy = _mxDateLabel(new Date(), {weekday:'long',day:'numeric',month:'long'});
  if (countEl) countEl.textContent = displayItems.length
    ? [
        receipts ? `${receipts} cobro${receipts!==1?'s':''}` : '',
        refunds ? `${refunds} devolución${refunds!==1?'es':''}` : '',
        adjustments ? `${adjustments} ajuste${adjustments!==1?'s':''}` : ''
      ].filter(Boolean).join(' · ')
    : isToday ? hoy : PERIOD_LABELS[currentPeriod];
  if (!displayItems.length) { el.innerHTML = `<p class="no-data">Sin movimientos ${isToday ? 'hoy' : 'en este período'}</p>`; return; }

  el.innerHTML = displayItems.map((payment, idx) => {
    const s = paymentSalesById.get(String(payment.sale_id));
    const time = _mxTime(payment.paid_at);
    const isTrans = payment.method === 'transferencia';
    const isMultiMethod = payment.method === 'multiple';
    const payIconSvg = isMultiMethod
      ? '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>'
      : isTrans
        ? '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'
        : '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>';
    const payIcon = `<span class="dv-sale-pay ${isTrans ? 'dv-pay-trans' : 'dv-pay-efec'}"><svg class="dv-icon" viewBox="0 0 24 24">${payIconSvg}</svg></span>`;
    const items = Array.isArray(s?.items) ? s.items : [];
    const origin = _saleOrigin(s);
    const amount = _paymentAmount(payment);
    const isRefund = payment.kind === 'refund';
    const isAdjustment = payment.kind === 'adjustment';
    const isCreated = payment.kind === 'apartado_created';
    const isLiquidation = _isApartadoLiquidationPayment(payment, s);
    // Un apartado creado CON anticipo no genera la fila "APARTADO NUEVO $0"
    // (esa solo existe para apartados sin anticipo) -- su primer abono se
    // veía como un "ABONO" cualquiera, indistinguible de un abono a un
    // apartado viejo. Sin esto, "Apartados nuevos: 3" en el KPI no cuadraba
    // con lo que se podía contar a simple vista en la lista. Mismo criterio
    // que separa Abonos de Apertura en los KPIs (_isSameDayOpeningPayment).
    const isSameDayOpening = _isSameDayOpeningPayment(payment, s);
    // El tag siempre dice qué fue realmente (venta/abono/liquidado) — que un
    // pago venga del backfill de datos viejos (source legacy_*) no cambia esa
    // respuesta, solo si el dato es confiable (eso ya lo indica por separado
    // "Dato histórico estimado" en el detalle, cuando is_estimated es true).
    const tagText = isRefund ? 'DEVOLUCIÓN' : isAdjustment ? 'AJUSTE'
      : (isCreated || isSameDayOpening) ? 'APARTADO NUEVO'
      : isLiquidation ? 'LIQUIDADO' : origin === 'apartado' ? 'ABONO' : 'VENTA';
    // Mismo color por categoría que las tarjetas KPI de arriba (Ventas verde,
    // Abonos morado, Apertura dorado) -- antes ABONO y VENTA compartían el
    // mismo verde aquí, mientras arriba Abonos ya se veía morado.
    const tagStyle = isRefund
      ? 'background:#FEE2E2;color:#991B1B'
      : isAdjustment
        ? 'background:#FEF3C7;color:#92400E'
        : (isCreated || isSameDayOpening)
          ? 'background:#FFF8EE;color:#9A742D'
          : (!isLiquidation && origin === 'apartado')
            ? 'background:#F1EAFB;color:#5B3FA0'
            : 'background:#DCFCE7;color:#166534';
    const tag = `<span style="font-size:.62rem;${tagStyle};padding:1px 6px;border-radius:50px;font-weight:700;flex-shrink:0">${tagText}</span>`;
    const nombre = origin === 'apartado'
      ? ((s?.customer || '').split(' · 📱 ')[0] || `Apartado #${payment.sale_id}`)
      : (items.length <= 2 ? items.map(i => i.name).join(', ') : `${items[0]?.name || ''} +${items.length - 1} más`) || `Venta #${payment.sale_id}`;
    const itemsHtml = _dvItemsHtml(items);
    const collectorEmail = payment.collected_by_email || '';
    const collector = collectorEmail ? (nameMap[collectorEmail] || collectorEmail.split('@')[0]) : '';
    const _rbIco = p => `<svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px">${p}</svg>`;
    const refundBreakdown = payment.refund_breakdown?.length > 1
      ? payment.refund_breakdown.map(line => `${line.method === 'transferencia' ? _rbIco('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>') : line.method === 'efectivo' ? _rbIco('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>') : _rbIco('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>')} ${line.method}: −$${Math.abs(line.amount).toLocaleString('es-MX')}`).join(' · ')
      : '';
    const detail = [
      collector ? `Registró ${_esc(collector)}` : '',
      payment.is_estimated ? 'Dato histórico estimado' : '',
      refundBreakdown,
      origin === 'apartado' && !isRefund && s ? `Pendiente actual $${Math.max(0, (parseFloat(s.total)||0) - (parseFloat(s.paid_amount)||0)).toLocaleString('es-MX')}` : ''
    ].filter(Boolean).join(' · ');
    const amountText = `${amount < 0 ? '−' : ''}$${Math.abs(amount).toLocaleString('es-MX')}`;
    return `<div class="dv-sale" id="dv-${idx}">
  <div class="dv-sale-head" onclick="dvToggle(${idx})">
    <span class="dv-sale-time">${time}</span>
    ${payIcon}
    ${tag}
    <span class="dv-sale-names">${_esc(nombre)}</span>
    <span class="dv-sale-total"${amount < 0 ? ' style="color:var(--red)"' : ''}>${amountText}</span>
    <span class="dv-sale-arrow">›</span>
  </div>
  <div class="dv-body">${itemsHtml}${detail ? `<div style="font-size:.7rem;color:var(--muted);padding-top:4px">${detail}</div>` : ''}</div>
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

  // Hora pico: redundante en modo Día (el revenue chart ya muestra horarios)
  const horaPicoCard = document.getElementById('hora-pico-card');
  if (horaPicoCard) horaPicoCard.style.display = _statsMode === 'day' ? 'none' : '';

  // Week summary: solo en modo semana (lo puebla _renderWeekComparison)
  const wkSum = document.getElementById('week-summary');
  if (wkSum && _statsMode !== 'week') wkSum.style.display = 'none';

  // Top productos: redundante en modo Día (la lista de ventas ya lo cubre)
  const topCard = document.getElementById('top-products')?.closest('.card');
  if (topCard) topCard.parentElement.style.display = _statsMode === 'day' ? 'none' : '';

  renderKPIs();
  renderBestSeller();
  renderRevenueChart();
  renderCatChart();
  renderTopProducts();
  renderTodaySales();
  renderHourChart();
  renderInventory();
  renderCapitalCategoria();
  renderExpiringProducts();
  renderRentabilidad();
  renderVendedores();
  renderTopClientes();
  renderCalendar();
  renderWeekdayChart();
}

function renderVendedores() {
  const card  = document.getElementById('vendedores-card');
  const body  = document.getElementById('vendedores-body');
  const label = document.getElementById('vendedores-label');
  if (!card || !body) return;
  if (!paymentsLoaded) {
    card.style.display = '';
    label.textContent = 'No disponible';
    body.innerHTML = '<p class="no-data">No disponible</p>';
    return;
  }

  // Cada movimiento pertenece a quien realmente cobró, no a quien creó la venta.
  const map = {};
  payments.forEach(payment => {
    const key = payment.collected_by_email || '__sin_sesion__';
    if (!map[key]) map[key] = { movimientos: 0, total: 0 };
    map[key].movimientos++;
    map[key].total += _paymentAmount(payment);
  });

  const entries = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  // Solo mostrar si hay 2+ vendedores identificados (sin contar ventas sin sesión)
  const identificados = entries.filter(([k]) => k !== '__sin_sesion__').length;
  if (identificados < 2) { card.style.display = 'none'; return; }

  card.style.display = '';
  const maxTotal = Math.max(1, ...entries.map(([, d]) => Math.abs(d.total)));
  label.textContent = PERIOD_LABELS[currentPeriod];

  body.innerHTML = entries.map(([email, d]) => {
    const pct  = Math.round(Math.abs(d.total) / maxTotal * 100);
    const fmt  = n => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-MX')}`;
    const isSinSesion = email === '__sin_sesion__';
    const name = isSinSesion ? 'Cobros sin sesión identificada' : (nameMap[email] || email.split('@')[0]);
    const icon = isSinSesion
      ? '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
      : '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>';
    const barColor = d.total < 0 ? 'var(--red)' : isSinSesion ? '#B5A696' : 'var(--gold)';
    const nameStyle = isSinSesion ? 'color:var(--muted);font-weight:500' : 'font-weight:600';
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.84rem;${nameStyle};display:inline-flex;align-items:center;gap:5px"><svg style="width:13px;height:13px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">${icon}</svg>${_esc(name)}</span>
        <span style="font-weight:700;font-size:.88rem;${isSinSesion?'color:var(--muted)':''}">${fmt(d.total)}</span>
      </div>
      <div style="background:var(--border);border-radius:50px;height:5px;overflow:hidden;margin-bottom:4px">
        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:50px"></div>
      </div>
      <div style="font-size:.7rem;color:var(--muted)">${d.movimientos} movimiento${d.movimientos!==1?'s':''}${isSinSesion?' · sin cobrador identificado':''}</div>
    </div>`;
  }).join('');
}

// Si un cobro y su devolución caen dentro del MISMO período consultado (ej.
// una prueba que se cobra y se cancela el mismo día), el efecto neto de ese
// período es $0 y no debe contar ni en Ventas ni en Abonos -- "Ingresos" ya
// lo resuelve solo (suma la devolución en negativo), pero estos dos
// desgloses excluían la devolución por completo en vez de restarla, dejando
// el cobro original sumado para siempre aunque ya se hubiera revertido.
// No toca periodos distintos: si el cobro fue la semana pasada y se cancela
// hoy, la semana pasada conserva su cifra tal cual se vio en su momento.
function _refundedSaleIdsInPeriod(paymentsArr) {
  return new Set(
    (paymentsArr || [])
      .filter(p => p.kind === 'refund')
      .map(p => String(p.sale_id))
  );
}

// Un apartado que se abre HOY con anticipo se etiqueta "APARTADO NUEVO" en
// Movimientos de hoy (ver isSameDayOpening en el renderer de la lista), no
// "ABONO" -- su dinero tampoco debe sumar al KPI de Abonos, o "Abonos: N" no
// cuadraría con las filas etiquetadas ABONO que se pueden contar a simple
// vista (mismo problema que ya se corrigió para "Apartados nuevos").
function _isSameDayOpeningPayment(payment, sale) {
  if (_saleOrigin(sale) !== 'apartado') return false;
  if (_isApartadoLiquidationPayment(payment, sale)) return false;
  if (!sale?.created_at || !payment?.paid_at) return false;
  return _localDay(sale.created_at) === _localDay(payment.paid_at);
}

// Abonos = dinero que se queda "en curso" sobre un apartado que YA existía
// antes de hoy (parciales, no la apertura ni la liquidación). Ventas cuenta
// la liquidación y Apertura cuenta el anticipo del día 1 -- entre los tres
// suman exactamente Ingresos, sin contar el mismo pago dos veces.
function _abonoPayments(paymentsArr) {
  const refundedInPeriod = _refundedSaleIdsInPeriod(paymentsArr);
  return (paymentsArr || []).filter(payment => {
    const sale = paymentSalesById.get(String(payment.sale_id));
    if (payment.kind === 'refund' || payment.kind === 'adjustment') return false;
    if (refundedInPeriod.has(String(payment.sale_id))) return false;
    if (_saleOrigin(sale) !== 'apartado') return false;
    if (_paymentAmount(payment) <= 0) return false;
    if (_isApartadoLiquidationPayment(payment, sale)) return false;
    return !_isSameDayOpeningPayment(payment, sale);
  });
}

// Apertura = dinero recibido al abrir un apartado nuevo (anticipo del día 1).
// Se muestra como parte del KPI "Apartados nuevos", no de "Abonos".
function _aperturaPayments(paymentsArr) {
  const refundedInPeriod = _refundedSaleIdsInPeriod(paymentsArr);
  return (paymentsArr || []).filter(payment => {
    const sale = paymentSalesById.get(String(payment.sale_id));
    if (payment.kind === 'refund' || payment.kind === 'adjustment') return false;
    if (refundedInPeriod.has(String(payment.sale_id))) return false;
    if (_paymentAmount(payment) <= 0) return false;
    return _isSameDayOpeningPayment(payment, sale);
  });
}

// Ventas = dinero realmente cobrado hoy por transacciones que se completaron
// hoy: el pago de una venta directa (siempre se paga completa el mismo día)
// y, si un apartado se liquidó hoy, solo el pago de la liquidación — no el
// total histórico de la venta (que puede incluir abonos de días anteriores,
// ya contados como Ingresos ese día).
function _salesCashPayments(paymentsArr) {
  const refundedInPeriod = _refundedSaleIdsInPeriod(paymentsArr);
  return (paymentsArr || []).filter(payment => {
    if (payment.kind === 'refund' || payment.kind === 'adjustment' || payment.kind === 'apartado_created') return false;
    if (refundedInPeriod.has(String(payment.sale_id))) return false;
    if (_paymentAmount(payment) <= 0) return false;
    const sale = paymentSalesById.get(String(payment.sale_id));
    const origin = _saleOrigin(sale);
    if (origin === 'venta') return true;
    if (origin === 'apartado') return _isApartadoLiquidationPayment(payment, sale);
    return false;
  });
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
  const totalRev  = _paymentTotal(payments);
  const count     = sales.length;
  const units     = sales.reduce((s,v) => s + (v.items||[]).reduce((a,i) => a + (i.qty||1), 0), 0);

  const salesTotal = _paymentTotal(_salesCashPayments(payments));
  const abonoPaymentsArr = _abonoPayments(payments);
  const abonoCount = abonoPaymentsArr.length;
  const abonoTotal = _paymentTotal(abonoPaymentsArr);
  // Cuánto de ese dinero llegó como anticipo el mismo día que se abrió el
  // apartado -- es el dinero que "Movimientos de hoy" etiqueta APARTADO NUEVO
  // (no $0) y que por eso NO se cuenta también en Abonos (ver _abonoPayments).
  const aperturaTotal = paymentsLoaded ? _paymentTotal(_aperturaPayments(payments)) : 0;

  const prevRev   = _paymentTotal(prevPayments);
  const prevCount = prevSales.length;
  const prevUnits = prevSales.reduce((s,v) => s + (v.items||[]).reduce((a,i) => a + (i.qty||1), 0), 0);
  const prevSalesTotal = _paymentTotal(_salesCashPayments(prevPayments));
  const prevAbonoPaymentsArr = _abonoPayments(prevPayments);
  const prevAbonoCount = prevAbonoPaymentsArr.length;
  const prevAbonoTotal = _paymentTotal(prevAbonoPaymentsArr);

  const fmt = n => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-MX', {maximumFractionDigits:0})}`;

  document.getElementById('kpi-revenue').innerHTML = paymentsLoaded ? fmt(totalRev) + (prevPaymentsLoaded ? kpiDelta(totalRev, prevRev) : '') : '—';
  document.getElementById('kpi-revenue-sub').textContent = !paymentsLoaded
    ? 'No se pudieron cargar movimientos'
    : prevPaymentsLoaded && prevRev !== 0 ? `Período ant.: ${fmt(prevRev)}` : '';

  // Barra de composición: Ingresos = Ventas + Abonos + Apertura -- las
  // mismas tres tarjetas de abajo, para que "de dónde sale este número" se
  // vea de un vistazo en vez de tener que sumarlo a mano. Si hubo una
  // devolución/ajuste de otro movimiento en el período la suma exacta no
  // cuadra -- ahí se oculta la barra en vez de mostrar un desglose
  // engañoso (el detalle sigue completo, renglón por renglón, en
  // Movimientos de hoy).
  const heroBarEl = document.getElementById('kpi-hero-bar');
  const heroLegendEl = document.getElementById('kpi-hero-legend');
  const compTotal = salesTotal + abonoTotal + aperturaTotal;
  const compDiff = totalRev - compTotal;
  if (paymentsLoaded && compTotal > 0 && Math.abs(compDiff) < 1) {
    const segs = [
      { label: 'Ventas',   amount: salesTotal,   color: 'var(--green)'  },
      { label: 'Abonos',   amount: abonoTotal,   color: 'var(--violet)' },
      { label: 'Apertura', amount: aperturaTotal, color: 'var(--teal)'   }
    ].filter(s => s.amount > 0);
    heroBarEl.innerHTML = segs.map(s => `<div class="kpi-hero-bar-seg" style="width:${(s.amount / compTotal * 100).toFixed(2)}%;background:${s.color}"></div>`).join('');
    heroLegendEl.innerHTML = segs.map(s => `<span class="kpi-hero-legend-item"><span class="kpi-hero-dot" style="background:${s.color}"></span>${s.label} ${fmt(s.amount)}</span>`).join('');
    heroBarEl.style.display = 'flex';
    heroLegendEl.style.display = 'flex';
  } else {
    heroBarEl.style.display = 'none';
    heroLegendEl.style.display = 'none';
  }

  document.getElementById('kpi-sales').innerHTML = salesLoaded
    ? count + (prevSalesLoaded ? kpiDelta(count, prevCount) : '')
    : '—';
  document.getElementById('kpi-sales-money').textContent = salesLoaded && count > 0 ? fmt(salesTotal) : '';
  // "Ventas" cuenta ventas directas + apartados liquidados hoy como una sola
  // cifra (mismo dinero, "Ventas$ + Abonos$ = Ingresos" sin duplicar) -- sin
  // este desglose, un apartado liquidado hoy inflaba el número sin ninguna
  // pista de por qué no coincidía con lo que se ve en Movimientos de hoy.
  const ventasDirectas = sales.filter(s => s.origin_type === 'venta').length;
  const aptLiquidadosHoy = count - ventasDirectas;
  const composicion = aptLiquidadosHoy > 0
    ? `${ventasDirectas} directa${ventasDirectas !== 1 ? 's' : ''} + ${aptLiquidadosHoy} apartado${aptLiquidadosHoy !== 1 ? 's' : ''} liquidado${aptLiquidadosHoy !== 1 ? 's' : ''}`
    : '';
  document.getElementById('kpi-sales-sub').textContent = !salesLoaded
    ? 'No disponible'
    : composicion || (prevSalesLoaded && prevCount > 0 ? `Período ant.: ${prevCount} · ${fmt(prevSalesTotal)}` : '');

  document.getElementById('kpi-abonos').innerHTML = paymentsLoaded
    ? abonoCount + (prevPaymentsLoaded ? kpiDelta(abonoCount, prevAbonoCount) : '')
    : '—';
  document.getElementById('kpi-abonos-money').textContent = paymentsLoaded && abonoCount > 0 ? fmt(abonoTotal) : '';
  document.getElementById('kpi-abonos-sub').textContent = !paymentsLoaded
    ? 'No disponible'
    : prevPaymentsLoaded && prevAbonoCount > 0 ? `Período ant.: ${prevAbonoCount} · ${fmt(prevAbonoTotal)}` : '';

  document.getElementById('kpi-aptnew').innerHTML = aptNewLoaded
    ? aptNewCount + (prevAptNewLoaded ? kpiDelta(aptNewCount, prevAptNewCount) : '')
    : '—';
  // El $ de apertura ahora vive junto al número, igual que Ventas/Abonos --
  // antes solo aparecía en el subtítulo chico y parecía que este KPI no
  // tenía dinero asociado, cuando sí lo tiene y es parte de Ingresos.
  document.getElementById('kpi-aptnew-money').textContent = aptNewLoaded && aperturaTotal > 0 ? fmt(aperturaTotal) : '';
  document.getElementById('kpi-aptnew-sub').textContent = !aptNewLoaded
    ? 'No disponible'
    : prevAptNewLoaded && prevAptNewCount > 0 ? `Período ant.: ${prevAptNewCount}` : '';

  document.getElementById('kpi-avg').innerHTML = salesLoaded
    ? units + (prevSalesLoaded ? kpiDelta(units, prevUnits) : '')
    : '—';
  document.getElementById('kpi-avg-sub').textContent = !salesLoaded
    ? 'No disponible'
    : prevSalesLoaded && prevUnits > 0 ? `Período ant.: ${prevUnits}` : '';

  const aptAmt = _aptResumen.pendiente || 0;
  document.getElementById('kpi-apt').textContent = apartadosPendientesLoaded ? fmt(aptAmt) : '—';
  document.getElementById('kpi-apt-sub').textContent = !apartadosPendientesLoaded
    ? 'No disponible'
    : _aptResumen.count > 0
    ? `${_aptResumen.count} apartado${_aptResumen.count!==1?'s':''}${_aptResumen.vencidos ? ` · ⚠️ ${_aptResumen.vencidos} venc.` : ''}`
    : 'Sin apartados activos';
}

/* Hora pico */
function renderHourChart() {
  const byHour  = Array(24).fill(0);
  payments.forEach(payment => {
    const hour = _mxHour(payment.paid_at);
    if (hour >= 0) byHour[hour] += _paymentAmount(payment);
  });
  if (hourChart) { hourChart.destroy(); hourChart = null; }
  if (!paymentsLoaded) { _chartNoData('hour-chart', 'Error al cargar movimientos'); return; }
  if (payments.length === 0) { _chartNoData('hour-chart', 'Sin movimientos en el período'); return; }
  const ctx = _chartReady('hour-chart');
  if (!ctx) return;
  const maxAbs = Math.max(...byHour.map(Math.abs));
  const maxH = byHour.findIndex(value => Math.abs(value) === maxAbs && value !== 0);
  hourChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Array.from({length:24}, (_,i) => `${i}h`),
      datasets: [{
        data: byHour,
        backgroundColor: byHour.map((value, i) => value < 0 ? '#E85D5D' : i === maxH ? '#C9A462' : 'rgba(201,164,98,.35)'),
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
  const range = getRange(_statsMode, _statsOffset);
  if (revenueChart) { revenueChart.destroy(); revenueChart = null; }
  // Solo modo Día lo puebla (_renderDayHourly) -- se resetea aquí para no
  // dejar datos de un período anterior visibles al cambiar de modo/período.
  const daySumEl = document.getElementById('day-hour-summary');
  if (daySumEl) daySumEl.style.display = 'none';
  if (!paymentsLoaded) {
    const summary = document.getElementById('week-summary');
    if (summary) summary.style.display = 'none';
    _chartNoData('revenue-chart', 'Error al cargar movimientos');
    return;
  }
  if (payments.length === 0) { _chartNoData('revenue-chart', 'Sin movimientos registrados'); return; }
  const ctx = _chartReady('revenue-chart');
  if (!ctx) return;

  // Build daily revenue map for current period
  let cursor = _parseDayKey(range.fromDay);
  const endDayNumber = _civilDayNumber(_parseDayKey(range.toDay));
  while (cursor && _civilDayNumber(cursor) <= endDayNumber) {
    byDay[_dayKey(cursor)] = 0;
    cursor = _addCivilDays(cursor, 1);
  }
  payments.forEach(payment => {
    const day = _localDay(payment.paid_at);
    if (day in byDay) byDay[day] += _paymentAmount(payment);
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
        if (val !== 0) {
          const abs = Math.abs(val);
          const lbl = `${val<0?'−':''}$${abs>=1000?(abs/1000).toFixed(1)+'k':Math.round(abs)}`;
          ctx.fillText(lbl, bar.x, val < 0 ? bar.y + 12 : bar.y - 3);
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
  const currByDow = Array(7).fill(0);
  Object.entries(byDayCurr).forEach(([key, val]) => {
    const civil = _parseDayKey(key);
    if (civil) currByDow[_civilWeekday(civil)] = val;
  });

  const prevByDow = Array(7).fill(0);
  prevPayments.forEach(payment => {
    const civil = _mxParts(payment.paid_at);
    if (!civil) return;
    prevByDow[_civilWeekday(civil)] += _paymentAmount(payment);
  });

  const hasPrev = prevByDow.some(v => v !== 0);
  const currTotal = currByDow.reduce((a,b)=>a+b,0);
  const prevTotal = prevByDow.reduce((a,b)=>a+b,0);
  const _currLabel = PERIOD_LABELS[currentPeriod] || 'Esta semana';
  const _fmt = n => `${n<0?'−':''}$${Math.abs(Math.round(n)).toLocaleString('es-MX')}`;

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

  const maxCurr = Math.max(...currByDow.map(Math.abs), 1);
  const currColors = currByDow.map(v => v < 0 ? '#E85D5D' : Math.abs(v)===maxCurr&&v!==0 ? '#C9A462' : 'rgba(201,164,98,.7)');

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
        if (val !== 0) {
          const abs = Math.abs(val);
          ctx.fillText(`${val<0?'−':''}$${abs>=1000?(abs/1000).toFixed(1)+'k':Math.round(abs)}`, bar.x, val < 0 ? bar.y + 12 : bar.y - 3);
        }
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
  payments.forEach(payment => {
    const hour = _mxHour(payment.paid_at);
    if (hour >= 0) byHour[hour] += _paymentAmount(payment);
  });

  const active = byHour.reduce((acc,v,i) => v!==0?[...acc,i]:acc, []);
  const first  = active.length ? active[0] : 8;
  const last   = active.length ? active[active.length-1] : 20;
  const hours  = [];
  for (let h=Math.max(0,first-1); h<=Math.min(23,last+1); h++) hours.push(h);

  const maxH = Math.max(...hours.map(h=>Math.abs(byHour[h])),1);
  const colors = hours.map(h => byHour[h] < 0 ? '#E85D5D' : Math.abs(byHour[h])===maxH&&byHour[h]!==0?'#C9A462':'rgba(201,164,98,.55)');

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

  // La barra de horas (240px fijos) suele quedar mucho más corta que "Por
  // categoría" al lado -- en vez de dejar ese espacio en blanco, se llena
  // con lo que ya se calculó arriba: hora pico, cuántas horas tuvieron
  // movimiento y el promedio por hora activa.
  const daySumEl = document.getElementById('day-hour-summary');
  if (daySumEl) {
    const dayTotal = active.reduce((s,h) => s + byHour[h], 0);
    if (active.length && dayTotal !== 0) {
      const peakHour = active.reduce((best,h) => Math.abs(byHour[h]) > Math.abs(byHour[best]) ? h : best, active[0]);
      const pct = Math.round(Math.abs(byHour[peakHour]) / Math.abs(dayTotal) * 100);
      const avgActive = dayTotal / active.length;
      const fmtMoney = n => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-MX', {maximumFractionDigits:0})}`;
      daySumEl.innerHTML = `
        <div class="dhs-row"><span class="dhs-label">⚡ Hora pico</span><span class="dhs-value">${peakHour}h · ${fmtMoney(byHour[peakHour])}${pct ? ` (${pct}%)` : ''}</span></div>
        <div class="dhs-row"><span class="dhs-label">🕐 Horas con actividad</span><span class="dhs-value">${active.length}</span></div>
        <div class="dhs-row"><span class="dhs-label">📊 Promedio por hora activa</span><span class="dhs-value">${fmtMoney(avgActive)}</span></div>
      `;
      daySumEl.style.display = '';
    }
  }
}


/* Category chart */
function renderCatChart() {
  if (catChart) { catChart.destroy(); catChart = null; }
  if (!salesLoaded || !productsLoaded) {
    _chartNoData('cat-chart', 'No disponible');
    const list = document.getElementById('cat-list');
    if (list) list.innerHTML = '';
    return;
  }
  const catMap = {};
  sales.forEach(s => {
    if (!Array.isArray(s.items)) return;
    s.items.forEach(item => {
      const prod = products.find(p => +p.id === +item.id);
      const cat = prod?.category_label || prod?.category || 'Otro';
      catMap[cat] = (catMap[cat]||0) + (item.subtotal||0);
    });
  });

  const entries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
  if (!entries.length) { _chartNoData('cat-chart', 'Sin datos de categorías'); const _cl=document.getElementById('cat-list'); if(_cl) _cl.innerHTML=''; return; }
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
        legend: { display: false },
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

  // Lista rankeada debajo del donut
  const total = entries.reduce((s,[,v])=>s+v,0);
  const maxVal = entries[0][1];
  const listEl = document.getElementById('cat-list');
  if (listEl) listEl.innerHTML = entries.map(([cat, val], i) => {
    const pct = Math.round(val/total*100);
    const barW = Math.round(val/maxVal*100);
    return `<div class="cl-item">
      <span class="cl-dot" style="background:${COLORS[i%COLORS.length]}"></span>
      <span class="cl-name">${_esc(cat)}</span>
      <span class="cl-bar-wrap"><span class="cl-bar" style="width:${barW}%;background:${COLORS[i%COLORS.length]}"></span></span>
      <span class="cl-val">$${val.toLocaleString('es-MX',{maximumFractionDigits:0})}</span>
      <span class="cl-pct">${pct}%</span>
    </div>`;
  }).join('');
}

/* Top productos */
function aggregateProducts() {
  const map = {};
  sales.forEach(s => {
    if (!Array.isArray(s.items)) return;
    s.items.forEach(item => {
      if (!map[item.id]) map[item.id] = { id: item.id, name: item.name, qty:0, revenue:0 };
      map[item.id].qty += item.qty||1;
      map[item.id].revenue += item.subtotal||0;
    });
  });
  return Object.values(map).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue);
}

const _TP_PH = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C9A462" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>');

function renderTopProducts() {
  const prods = aggregateProducts().slice(0,8);
  const el = document.getElementById('top-products');
  if (!salesLoaded) { el.innerHTML = '<p class="no-data">No disponible</p>'; return; }
  if (!prods.length) { el.innerHTML = '<p class="no-data">Sin ventas en el período</p>'; return; }
  const maxQty = prods[0].qty || 1;
  el.innerHTML = prods.map((p,i) => {
    const prod = products.find(x => +x.id === +p.id);
    const img = _driveSz(_prodImg(prod), 80) || _TP_PH;
    return `<div class="top-prod-item">
  <div class="tp-rank">${i+1}</div>
  <img class="tp-img" src="${img}" alt="${_esc(p.name)}" onerror="this.src='${_TP_PH}'">
  <div class="tp-info">
    <div class="tp-name" title="${_esc(p.name)}">${_esc(p.name)}</div>
    <div class="tp-bar-wrap"><div class="tp-bar" style="width:${Math.round(p.qty/maxQty*100)}%"></div></div>
  </div>
  <div class="tp-stats">
    <div class="tp-revenue">${p.qty} ud${p.qty!==1?'s':''}</div>
    <div class="tp-qty">$${p.revenue.toLocaleString('es-MX',{maximumFractionDigits:0})}</div>
  </div>
</div>`;
  }).join('');
}

/* Inventario */
function renderInventory() {
  if (!productsLoaded) {
    ['inv-out', 'inv-low', 'inv-ok'].forEach(id => { document.getElementById(id).textContent = '—'; });
    document.getElementById('inv-total-label').textContent = 'No disponible';
    document.getElementById('inv-valor-venta').textContent = '—';
    document.getElementById('inv-valor-costo-wrap').style.display = 'none';
    document.getElementById('inv-list').innerHTML = '<p class="no-data" style="padding:16px 0">No disponible</p>';
    return;
  }
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
  const costoNote = document.getElementById('inv-valor-costo-note');
  if (valorCosto > 0) {
    document.getElementById('inv-valor-costo').textContent = '$' + Math.round(valorCosto).toLocaleString('es-MX');
    costoWrap.style.display = '';
    const withCostCount = products.filter(p => p.cost > 0).length;
    if (costoNote) {
      if (withCostCount < products.length) {
        costoNote.textContent = `${withCostCount} de ${products.length} con costo registrado`;
        costoNote.style.display = '';
      } else {
        costoNote.style.display = 'none';
      }
    }
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
  if (!productsLoaded) {
    card.style.display = '';
    totalEl.textContent = 'No disponible';
    body.innerHTML = '<p class="no-data">No disponible</p>';
    return;
  }

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

/* ── PRODUCTOS POR CADUCAR ── */
function renderExpiringProducts() {
  const card  = document.getElementById('expiring-card');
  const body  = document.getElementById('expiring-body');
  const label = document.getElementById('expiring-label');
  if (!card || !body) return;
  if (!productsLoaded) {
    label.textContent = 'No disponible';
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">No disponible</div>';
    return;
  }

  const todayKey = _localDay(new Date());
  const todayNumber = _civilDayNumber(_parseDayKey(todayKey));
  const withExpiry = products
    .filter(p => p.expiry_date)
    .map(p => ({ ...p, _days: _civilDayNumber(_parseDayKey(p.expiry_date)) - todayNumber }))
    .filter(p => Number.isFinite(p._days))
    .filter(p => p._days <= 60)
    .sort((a, b) => a._days - b._days);

  if (!withExpiry.length) {
    label.textContent = '';
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">Sin productos por caducar</div>';
    return;
  }

  const vencidos    = withExpiry.filter(p => p._days < 0).length;
  const valorRiesgo = withExpiry.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0);
  label.textContent = `${withExpiry.length} producto${withExpiry.length !== 1 ? 's' : ''}${vencidos ? ` · ⚠️ ${vencidos} caducado${vencidos > 1 ? 's' : ''}` : ''} · $${Math.round(valorRiesgo).toLocaleString('es-MX')} en riesgo`;

  body.innerHTML = withExpiry.map(p => {
    const color = p._days < 0 ? '#E85D5D' : p._days <= 7 ? '#D97706' : '#B45309';
    const text  = p._days < 0 ? `Caducó hace ${Math.abs(p._days)}d` : p._days === 0 ? 'Caduca hoy' : `Caduca en ${p._days}d`;
    const fecha = _dayKeyLabel(p.expiry_date, { day: 'numeric', month: 'short' });
    const valor = (p.price || 0) * (p.stock || 0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:0">
        <div style="font-weight:600;font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(p.name)}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:2px">${_esc(p.category_label || '')} · Stock: ${p.stock ?? 0}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-weight:700;font-size:.78rem;color:${color}">${text}</div>
        <div style="font-size:.68rem;color:var(--muted)">${fecha}${valor ? ` · $${Math.round(valor).toLocaleString('es-MX')}` : ''}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── RENTABILIDAD ── */
function renderRentabilidad() {
  if (!productsLoaded) {
    ['rent-high', 'rent-mid', 'rent-low'].forEach(id => { document.getElementById(id).textContent = '—'; });
    document.getElementById('rent-label').textContent = 'No disponible';
    document.getElementById('rent-no-cost').style.display = 'none';
    document.getElementById('rent-list').innerHTML = '<p class="no-data">No disponible</p>';
    return;
  }
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

let _aptResumen = { count: 0, pendiente: 0, vencidos: 0 };

function renderBestSeller() {
  const el = document.getElementById('ds-best-row');
  if (!el) return;
  if (!salesLoaded) {
    el.style.display = '';
    el.innerHTML = '<div style="font-size:.76rem;color:var(--muted);padding:0 2px 10px">Productos vendidos: No disponible</div>';
    return;
  }
  // Productos/unidades siguen la fecha real de finalización: created_at en
  // venta directa y liquidated_at en apartado.
  const ventas = sales;
  if (!ventas.length) { el.style.display = 'none'; return; }
  const freq = {};
  ventas.forEach(v => (v.items || []).forEach(i => {
    freq[i.name] = (freq[i.name] || 0) + parseFloat(i.subtotal ?? i.price * (i.qty||1));
  }));
  const best = Object.entries(freq).sort((a,b) => b[1]-a[1])[0];
  if (!best) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<div style="font-size:.76rem;color:var(--muted);padding:0 2px 10px;display:flex;align-items:center;gap:5px;overflow:hidden"><svg style="width:13px;height:13px;flex-shrink:0;fill:var(--gold-dark);stroke:none" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Más vendido: <strong style="color:var(--charcoal)">${_esc(best[0])}</strong> · $${Math.round(best[1]).toLocaleString('es-MX')} en ventas</span></div>`;
}

/* ── APARTADOS PENDIENTES ── */
async function loadApartadosPendientes() {
  const body = document.getElementById('apt-pending-body');
  const label = document.getElementById('apt-summary-label');
  const result = await _fetchAll(`sales?origin_type=eq.apartado&status=eq.activo&select=id,total,paid_amount,customer,created_at,due_date,items&is_test=eq.false&order=due_date.asc.nullslast,created_at.asc,id.asc`);
  apartadosPendientesLoaded = result.ok;
  if (!result.ok) {
    _aptResumen = { count: 0, pendiente: 0, vencidos: 0 };
    label.textContent = 'No disponible';
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">No disponible</div>';
    return;
  }
  if (!result.data?.length) {
    _aptResumen = { count: 0, pendiente: 0, vencidos: 0 };
    label.textContent = '0 activos';
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">Sin apartados pendientes</div>';
    return;
  }
  const data = result.data;
  const totalPendiente = data.reduce((s, a) => s + Math.max(0, (parseFloat(a.total)||0) - (parseFloat(a.paid_amount)||0)), 0);
  const todayKey = _localDay(new Date());
  const todayNumber = _civilDayNumber(_parseDayKey(todayKey));
  const vencidos = data.filter(a => {
    const dueNumber = _civilDayNumber(_parseDayKey(a.due_date));
    return Number.isFinite(dueNumber) && dueNumber < todayNumber;
  }).length;
  _aptResumen = { count: data.length, pendiente: totalPendiente, vencidos };

  label.textContent = `${data.length} activos · $${totalPendiente.toLocaleString('es-MX')} por cobrar${vencidos ? ` · ⚠️ ${vencidos} vencido${vencidos>1?'s':''}` : ''}`;

  body.innerHTML = data.map(s => {
    const total     = parseFloat(s.total) || 0;
    const pagado    = parseFloat(s.paid_amount) || 0;
    const pendiente = Math.max(0, total - pagado);
    const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
    const custParts = (s.customer || '').split(' · 📱 ');
    const nombre    = custParts[0] || 'Sin nombre';
    const fecha     = _mxDateLabel(s.created_at, { day:'numeric', month:'short' });
    const summary   = Array.isArray(s.items) ? s.items.map(i=>i.name).join(', ') : '';

    let dueBadge = '';
    if (s.due_date) {
      const dueNumber = _civilDayNumber(_parseDayKey(s.due_date));
      const diffDays = dueNumber - todayNumber;
      const dueColor = diffDays < 0 ? '#E85D5D' : diffDays <= 7 ? '#D97706' : '#2D6A4F';
      if (Number.isFinite(diffDays)) {
        const dueText = diffDays < 0
          ? `Vencido hace ${Math.abs(diffDays)}d`
          : diffDays === 0 ? 'Vence hoy' : `Vence ${_dayKeyLabel(s.due_date, {day:'numeric',month:'short'})}`;
        dueBadge = `<span style="font-size:.68rem;font-weight:700;color:${dueColor};display:inline-flex;align-items:center;gap:3px"><svg style="width:13px;height:13px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${dueText}</span>`;
      }
    }

    return `<div style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div style="font-weight:600;font-size:.84rem;display:inline-flex;align-items:center;gap:5px"><svg style="width:13px;height:13px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${_esc(nombre)}</div>
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

/* ── CLIENTES FRECUENTES — ranking histórico (no por período), mismo patrón
   de fetch propio que Apartados pendientes. Solo cuenta ventas/apartados ya
   vinculados a un customer_id (customers es aditivo: ventas viejas sin
   teléfono capturado se quedan fuera hasta que esa clienta vuelva a comprar). ── */
async function loadClientesReport() {
  const [custR, salesR] = await Promise.all([
    _fetchAll(`customers?select=id,name,phone,notes,created_at&order=created_at.desc`),
    _fetchAll(`sales?customer_id=not.is.null&status=neq.cancelado&is_test=eq.false&select=id,customer_id,total,paid_amount,created_at,origin_type,status&order=created_at.desc`)
  ]);
  clientesLoaded = custR.ok && salesR.ok;
  _customers = custR.ok ? (custR.data || []) : [];
  _customerSales = salesR.ok ? (salesR.data || []) : [];
}

function _clienteStats(customerId) {
  let total = 0, count = 0, last = null;
  _customerSales.forEach(s => {
    if (s.customer_id !== customerId) return;
    // Un apartado aún activo solo ha "gastado" lo que lleva pagado, no el
    // total del pedido — solo liquidado/venta cuentan el total completo.
    total += s.status === 'activo' ? (parseFloat(s.paid_amount) || 0) : (parseFloat(s.total) || 0);
    count++;
    if (!last || new Date(s.created_at) > new Date(last)) last = s.created_at;
  });
  return { total, count, last };
}

function renderTopClientes() {
  const card  = document.getElementById('clientes-card');
  const body  = document.getElementById('clientes-body');
  const label = document.getElementById('clientes-label');
  if (!card || !body) return;
  if (!clientesLoaded) {
    label.textContent = 'No disponible';
    body.innerHTML = '<p class="no-data">No disponible</p>';
    return;
  }

  const withStats = _customers
    .map(c => ({ ...c, ..._clienteStats(c.id) }))
    .filter(c => c.count > 0);

  const q = (document.getElementById('clientes-search')?.value || '').trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  let list = withStats;
  if (q) {
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (qDigits && (c.phone || '').includes(qDigits))
    );
  }
  list.sort((a, b) => b.total - a.total);

  label.textContent = `${withStats.length} con compras`;

  if (!list.length) {
    body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">${q ? 'Sin resultados' : 'Aún no hay clientas vinculadas — se llena con las próximas ventas'}</div>`;
    return;
  }

  const top = list.slice(0, 10);
  const maxTotal = Math.max(1, ...top.map(c => c.total));
  body.innerHTML = top.map(c => {
    const pct = Math.round(c.total / maxTotal * 100);
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="openClienteProfile(${c.id})">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:.84rem;font-weight:600">${_esc(c.name)}</span>
        <span style="font-weight:700;font-size:.88rem">$${c.total.toLocaleString('es-MX')}</span>
      </div>
      <div style="background:var(--border);border-radius:50px;height:5px;overflow:hidden;margin-bottom:4px">
        <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:50px"></div>
      </div>
      <div style="font-size:.7rem;color:var(--muted)">${c.count} compra${c.count!==1?'s':''}</div>
    </div>`;
  }).join('');
}

/* ── PERFIL DE CLIENTE — popup solo texto (sin imágenes, regla del proyecto
   para Reportes), mismo patrón que _actPopup() en activity.js. ── */
function openClienteProfile(id) {
  const c = _customers.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cliente-pop')?.remove();

  const stats = _clienteStats(id);
  const historial = _customerSales
    .filter(s => s.customer_id === id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const clienteDesde = _mxDateLabel(c.created_at, { day:'numeric', month:'short', year:'numeric' });
  const digits = (c.phone || '').replace(/\D/g, '');
  const waLink = digits ? `https://wa.me/52${digits}` : '';

  const rowsHtml = historial.map(s => {
    const fecha = _mxDateLabel(s.created_at, { day:'numeric', month:'short', year:'numeric' });
    const tipo  = s.origin_type === 'apartado' ? '📌 Apartado' : '🛍️ Venta';
    const estadoTxt = s.status === 'activo' ? ' · activo' : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border);font-size:.8rem">
      <span style="color:var(--muted)">${_esc(fecha)} · ${tipo}${estadoTxt}</span>
      <span style="font-weight:700">$${(parseFloat(s.total)||0).toLocaleString('es-MX')}</span>
    </div>`;
  }).join('') || '<p class="no-data" style="padding:8px 0">Sin compras registradas</p>';

  const pop = document.createElement('div');
  pop.id = 'cliente-pop';
  pop.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);animation:ap-in .15s ease';
  pop.innerHTML = `
    <style>@keyframes ap-in{from{opacity:0}to{opacity:1}}</style>
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;padding:18px;max-width:340px;width:90%;max-height:85vh;overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,.28);position:relative">
      <button onclick="document.getElementById('cliente-pop').remove()" style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:1.1rem;cursor:pointer;color:#8A7564;line-height:1">✕</button>
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:2px;padding-right:24px">${_esc(c.name)}</div>
      ${digits ? `<a href="${waLink}" target="_blank" rel="noopener" style="font-size:.8rem;color:var(--gold-dark);text-decoration:none">📱 ${_esc(c.phone)}</a>` : '<div style="font-size:.8rem;color:var(--muted)">Sin teléfono</div>'}
      <div style="display:flex;gap:8px;margin:14px 0">
        <div style="flex:1;padding:10px;background:#FFF8EE;border:1px solid #EAE0D4;border-radius:10px;text-align:center">
          <div style="font-size:1.1rem;font-weight:700;font-family:'Playfair Display',serif">$${stats.total.toLocaleString('es-MX')}</div>
          <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Total gastado</div>
        </div>
        <div style="flex:1;padding:10px;background:#FFF8EE;border:1px solid #EAE0D4;border-radius:10px;text-align:center">
          <div style="font-size:1.1rem;font-weight:700;font-family:'Playfair Display',serif">${stats.count}</div>
          <div style="font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">Compras</div>
        </div>
      </div>
      <div style="font-size:.72rem;color:var(--muted);margin-bottom:12px">Cliente desde ${clienteDesde}</div>
      <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:4px">Historial</div>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:14px">${rowsHtml}</div>
      <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:4px">Notas</div>
      <textarea id="cliente-notes-input" rows="2" placeholder="Preferencias, tallas, alergias…" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:.82rem;outline:none;font-family:inherit;resize:vertical;box-sizing:border-box">${_esc(c.notes || '')}</textarea>
      <button onclick="_saveClienteNotes(${id})" style="width:100%;margin-top:8px;background:var(--charcoal);color:#fff;padding:9px;border-radius:8px;border:none;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit">Guardar nota</button>
    </div>`;
  pop.addEventListener('click', () => pop.remove());
  document.body.appendChild(pop);
}

async function _saveClienteNotes(id) {
  const btn = document.querySelector(`#cliente-pop button[onclick="_saveClienteNotes(${id})"]`);
  const val = document.getElementById('cliente-notes-input')?.value.trim() || '';
  const c = _customers.find(x => x.id === id);
  if (!c) return;
  const r = await api(`customers?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ notes: val || null, updated_at: new Date().toISOString() })
  });
  if (r.ok) {
    c.notes = val;
    logActivity('cliente_editado', `Notas actualizadas para ${c.name}`, { id, notes: val });
    document.getElementById('cliente-pop')?.remove();
  } else if (btn) {
    btn.textContent = 'No se pudo guardar — intenta de nuevo';
    btn.style.background = 'var(--red)';
  }
}

/* ── INIT ── */
function sendDailySummaryWA() {
  if (!todaySummaryLoaded) {
    alert('El resumen de hoy no está completo. Recarga la página antes de enviarlo.');
    return;
  }
  const fmt = n => `${n < 0 ? '−' : ''}$${Math.abs(parseFloat(n)||0).toLocaleString('es-MX', {maximumFractionDigits:0})}`;
  const ventas = todaySales.filter(s => _saleOrigin(s) === 'venta' && _isCompletedSale(s));
  const aptos = todaySales.filter(s => _saleOrigin(s) === 'apartado');
  const ingresos = _paymentTotal(todayPayments);
  const efectivo = todayPayments
    .filter(payment => payment.method === 'efectivo')
    .reduce((sum, payment) => sum + _paymentAmount(payment), 0);
  const transf = todayPayments
    .filter(payment => payment.method === 'transferencia')
    .reduce((sum, payment) => sum + _paymentAmount(payment), 0);
  const refundLines = todayPayments.filter(payment => payment.kind === 'refund');
  const refundCount = _refundOperationCount(todayPayments);
  const adjustmentLines = todayPayments.filter(payment => payment.kind === 'adjustment');
  // Mismo fix que _abonoPayments/_salesCashPayments -- un anticipo/abono
  // cobrado y devuelto el mismo día no debe seguir contando aquí. Tampoco
  // cuenta el anticipo del día en que se abrió el apartado (_isSameDayOpeningPayment)
  // -- ese dinero se reporta junto con "Apartados nuevos", no aquí, para que
  // coincida con lo que Reportes muestra como Abonos.
  const refundedTodayIds = _refundedSaleIdsInPeriod(todayPayments);
  const apartadoPayments = todayPayments.filter(payment => {
    const sale = paymentSalesById.get(String(payment.sale_id));
    if (refundedTodayIds.has(String(payment.sale_id))) return false;
    if (payment.kind === 'refund' || payment.kind === 'adjustment') return false;
    if (_saleOrigin(sale) !== 'apartado' || _paymentAmount(payment) <= 0) return false;
    return !_isSameDayOpeningPayment(payment, sale);
  });
  const apartadoAmount = _paymentTotal(apartadoPayments);
  const aperturaPayments = todayPayments.filter(payment => {
    const sale = paymentSalesById.get(String(payment.sale_id));
    if (refundedTodayIds.has(String(payment.sale_id))) return false;
    if (payment.kind === 'refund' || payment.kind === 'adjustment') return false;
    if (_paymentAmount(payment) <= 0) return false;
    return _isSameDayOpeningPayment(payment, sale);
  });
  const aperturaAmount = _paymentTotal(aperturaPayments);
  const fecha = _mxDateLabel(new Date(), {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  let msg = `📊 *Resumen del día — Tres Encantos*\n${fecha}\n\n`;
  msg += `💰 *Ingreso neto del día:* ${fmt(ingresos)}\n`;
  msg += `🔢 *Ventas directas:* ${ventas.length}\n`;
  if (efectivo !== 0) msg += `💵 Efectivo: ${fmt(efectivo)}\n`;
  if (transf !== 0)   msg += `📱 Transferencia: ${fmt(transf)}\n`;
  if (refundCount) msg += `↩️ Devoluciones: ${refundCount} (${fmt(_paymentTotal(refundLines))})\n`;
  if (adjustmentLines.length) msg += `🧾 Ajustes: ${adjustmentLines.length} (${fmt(_paymentTotal(adjustmentLines))})\n`;
  if (aptos.length) msg += `\n📌 *Apartados nuevos:* ${aptos.length}${aperturaAmount > 0 ? ` (${fmt(aperturaAmount)} al abrir)` : ''}\n`;
  if (apartadoPayments.length) msg += `💳 *Anticipos y abonos:* ${apartadoPayments.length} (${fmt(apartadoAmount)})\n`;
  if (todayLiquidatedSales.length) msg += `✅ *Apartados liquidados:* ${todayLiquidatedSales.length}\n`;
  if (!todayPayments.length && !ventas.length && !aptos.length && !todayLiquidatedSales.length) msg += `_Sin movimientos registrados hoy._\n`;
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
  if (!paymentsLoaded) {
    el.innerHTML = '<p class="no-data">No disponible</p>';
    return;
  }

  const range = getRange(_statsMode, _statsOffset);
  const todayKey = _localDay(new Date());

  const byDay = {};
  payments.forEach(payment => {
    const day = _localDay(payment.paid_at);
    byDay[day] = (byDay[day]||0) + _paymentAmount(payment);
  });
  const maxRev = Math.max(1, ...Object.values(byDay).map(Math.abs));

  const firstCivil = _parseDayKey(range.fromDay);
  const year = firstCivil.year, month = firstCivil.month - 1;
  const firstDow = _civilWeekday(firstCivil);
  const lastD = _civilDaysInMonth(firstCivil);

  const _DOWS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html = '<div class="cal-grid">';
  _DOWS.forEach(d => html += `<div class="cal-hdr">${d}</div>`);
  for (let i=0;i<firstDow;i++) html += '<div class="cal-empty"></div>';

  for (let d=1;d<=lastD;d++) {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rev = byDay[key]||0;
    const isToday = key === todayKey;
    const isFuture = key > todayKey;

    let cls = 'cal-zero';
    if (isFuture) cls = 'cal-future';
    else if (rev!==0) {
      const pct = Math.abs(rev)/maxRev;
      cls = pct>0.8?'cal-l5':pct>0.55?'cal-l4':pct>0.33?'cal-l3':pct>0.12?'cal-l2':'cal-l1';
    }
    const todayCls = isToday?' cal-today':'';
    const absRev   = Math.abs(rev);
    const fmtRev   = `${rev<0?'−':''}$${absRev>=1000?(absRev/1000).toFixed(1)+'k':Math.round(absRev)}`;
    const amtStr   = rev!==0?`<span class="cal-cell-amt"${rev<0?' style="color:var(--red)"':''}>${fmtRev}</span>`:'';
    const tooltip  = rev!==0?`<span class="cal-tooltip">${d} ${_MN[month]} · ${rev<0?'−':''}$${Math.round(absRev).toLocaleString('es-MX')}</span>`
      : (!isFuture?`<span class="cal-tooltip">${d} ${_MN[month]} · Sin movimientos</span>`:'');
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
  if (!paymentsLoaded) {
    card.style.display = '';
    if (weekdayChart) { weekdayChart.destroy(); weekdayChart = null; }
    _chartNoData('weekday-chart', 'No disponible');
    return;
  }

  const _DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const byDow = Array(7).fill(0);

  payments.forEach(payment => {
    const civil = _mxParts(payment.paid_at);
    if (!civil) return;
    byDow[_civilWeekday(civil)] += _paymentAmount(payment);
  });
  if (byDow.every(v=>v===0)) { card.style.display='none'; return; }

  const ctx = _chartReady('weekday-chart');
  if (!ctx) return;
  if (weekdayChart) { weekdayChart.destroy(); weekdayChart=null; }
  card.style.display='';

  const maxDow = Math.max(...byDow.map(Math.abs));
  const colors = byDow.map(v => v<0?'#E85D5D':Math.abs(v)===maxDow&&v!==0?'#C9A462':'rgba(201,164,98,.4)');

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

function _applyStatsPermissions(permissions) {
  document.querySelectorAll('a[href="activity.html"]').forEach(link => {
    link.style.display = permissions?.canViewActivity === true ? '' : 'none';
  });
  document.querySelectorAll('a[href="settings.html"]').forEach(link => {
    link.style.display = permissions?.canManageSettings === true ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  let permissionState = null;
  try {
    permissionState = typeof _loadMyPerms === 'function'
      ? await _loadMyPerms({ requireFresh: true, withMeta: true })
      : null;
  } catch {}
  const permissions = permissionState?.permissions;
  if (permissionState?.source !== 'server' || permissions?.canViewReports !== true) {
    window.location.replace('admin.html');
    return;
  }
  _applyStatsPermissions(permissions);

  try {
    const _s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const _meta = _s?.user?.user_metadata || {};
    const _name = _meta.full_name || _meta.name || _s?.user?.email?.split('@')[0] || '';
    const _av = document.getElementById('user-avatar');
    const _nl = document.getElementById('user-name-label');
    if (_av) _av.textContent = _name ? _name[0].toUpperCase() : '?';
    if (_nl) _nl.textContent = _name;
    const ga = document.getElementById('ga4-link-card');
    if (ga) ga.style.display = _meta.role === 'superadmin'
      && String(_s?.user?.email || '').toLowerCase() === 'eacevedo@sunname.com.mx' ? '' : 'none';
  } catch {}
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 12000)
  );
  const initialGeneration = ++_statsReloadGeneration;
  const initialMode = _statsMode;
  const initialOffset = _statsOffset;
  try {
    _updateNavUI();
    await Promise.race([
      Promise.all([
        loadProducts(),
        loadSales(initialMode, initialOffset, initialGeneration),
        loadPreviousSales(initialMode, initialOffset, initialGeneration),
        loadApartadosPendientes(),
        loadClientesReport(),
        loadNameMap(),
        loadTodaySales(initialGeneration),
        loadCategories()
      ]),
      timeout
    ]);
    if (initialGeneration !== _statsReloadGeneration) return;
    renderAll();
  } catch {
    if (initialGeneration !== _statsReloadGeneration) return;
    _statsReloadGeneration++;
    salesLoaded = false;
    prevSalesLoaded = false;
    paymentsLoaded = false;
    prevPaymentsLoaded = false;
    productsLoaded = false;
    todayPaymentsLoaded = false;
    todaySummaryLoaded = false;
    apartadosPendientesLoaded = false;
    clientesLoaded = false;
    renderAll();
    const aptLabel = document.getElementById('apt-summary-label');
    const aptBody = document.getElementById('apt-pending-body');
    if (aptLabel) aptLabel.textContent = 'No disponible';
    if (aptBody) aptBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.84rem">No disponible</div>';
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
    if (lbImg) { lbImg.style.transition = 'none'; lbImg.style.transform = `translateY(${cy}px)`; }
    lb.style.opacity = String(Math.max(0, 1 - cy / 200));
  }, { passive: false });
  lb.addEventListener('touchend', () => {
    if (!on) return; on = false;
    const lbImg = document.getElementById('img-lightbox-img');
    if (cy > 90) {
      if (lbImg) { lbImg.style.transition = 'transform .22s ease-in'; lbImg.style.transform = 'translateY(110%)'; }
      lb.style.opacity = '0';
      setTimeout(() => {
        _closeLightbox();
        if (lbImg) { lbImg.style.transform = ''; lbImg.style.transition = ''; }
        lb.style.opacity = '';
      }, 230);
    } else {
      if (lbImg) { lbImg.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)'; lbImg.style.transform = ''; setTimeout(() => lbImg.style.transition = '', 280); }
      lb.style.opacity = '';
    }
    cy = 0;
  });
}
