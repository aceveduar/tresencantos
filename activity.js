const SUPABASE_URL         = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
const SESSION_KEY          = 'te_admin_session';
const ACTIVITY_TZ           = 'America/Mexico_City';
const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const _activityDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ACTIVITY_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});
function _activityDayKey(value = Date.now()) {
  return _activityDateFormatter.format(new Date(value));
}
function _activityAddDays(dayKey, amount) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function _activityDayStartIso(dayKey) {
  return new Date(`${dayKey}T00:00:00-06:00`).toISOString();
}
function _activityFormat(value, options) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: ACTIVITY_TZ, ...options }).format(new Date(value));
}

/* ── AUTH + ROL ── */
(function(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.access_token || s.expires_at <= Date.now()/1000 + 60) return window.location.href = 'admin.html';
  } catch { window.location.href = 'admin.html'; }
})();

function doLogout() {
  sessionStorage.removeItem('te_user_can');
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
async function _refreshActivityToken() {
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
async function api(path, opts = {}) {
  const _call = (tk) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', ...opts.headers }
  }).then(async r => ({ ok: r.ok, status: r.status, data: r.status !== 204 ? await r.json().catch(()=>null) : null }));
  try {
    const r = await _call(_getActivityToken());
    if (r.status === 401 && await _refreshActivityToken()) return await _call(_getActivityToken());
    return r;
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function _fetchAllActivity(path, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await api(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (!r.ok) return { ...r, data: null };
    const page = Array.isArray(r.data) ? r.data : [];
    rows.push(...page);
    if (page.length < pageSize) return { ok: true, status: r.status, data: rows };
    offset += page.length;
  }
}

function _activityPaymentAmount(payment) {
  const amount = parseFloat(payment?.amount) || 0;
  return payment?.kind === 'refund' ? -Math.abs(amount) : amount;
}

function _activityRefundCount(payments) {
  const keys = new Set();
  (payments || []).forEach(payment => {
    if (payment?.kind !== 'refund') return;
    keys.add(payment.request_id ? `${payment.sale_id}:${payment.request_id}` : `legacy:${payment.id}`);
  });
  return keys.size;
}

/* ── STATE ── */
let allData     = [];
let currentType = '';
let currentSearch = '';
let _activityLoadGeneration = 0;
const _knownActivityUsers = new Set();
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
    try {
      nameMap = JSON.parse(data[0].value);
      Object.keys(nameMap).filter(Boolean).forEach(email => _knownActivityUsers.add(email));
    } catch {}
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

/* ── BÚSQUEDA — consulta el servidor directo, no se limita a lo ya cargado (tope de 300) ── */
let _searchDebounce = null;
function onSearchInput() {
  const el  = document.getElementById('filter-search');
  const val = (el.value || '').trim();
  const wasEmpty = !currentSearch;
  currentSearch = val.toLowerCase();
  document.getElementById('filter-search-clear').style.display = currentSearch ? '' : 'none';

  // Al empezar a buscar, ampliar el período a "Todo" — una búsqueda de cliente casi
  // siempre quiere ver su historial completo, no solo el período activo
  const periodSel = document.getElementById('filter-period');
  if (currentSearch && wasEmpty && periodSel.value !== '0') periodSel.value = '0';

  clearTimeout(_searchDebounce);
  _searchDebounce = setTimeout(load, 350);
}
function clearSearch() {
  document.getElementById('filter-search').value = '';
  currentSearch = '';
  document.getElementById('filter-search-clear').style.display = 'none';
  clearTimeout(_searchDebounce);
  load();
}
function _matchesSearch(item, q) {
  const meta = item.meta || {};
  const haystack = [
    item.summary,
    meta.customer,
    meta.name,
    displayName(item.user_email),
    ...(Array.isArray(meta.itemsDetail) ? meta.itemsDetail.map(i => i.name) : [])
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

/* ── ÍCONOS INLINE ── */
const _actIco = (p, px = 13, sw = 1.75) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">${p}</svg>`;
const _actIcoCash     = (px) => _actIco('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', px);
const _actIcoX        = (px) => _actIco('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', px);
const _actIcoBookmark = (px) => _actIco('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', px);
const _actIcoCard     = (px) => _actIco('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>', px);
const _actIcoEdit     = (px) => _actIco('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>', px);
const _actIcoCheck    = (px) => _actIco('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', px);
const _actIcoUndo     = (px) => _actIco('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', px);
const _actIcoPlus     = (px) => _actIco('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', px);
const _actIcoTrash    = (px) => _actIco('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>', px);
const _actIcoEye      = (px) => _actIco('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>', px);
const _actIcoWarn     = (px) => _actIco('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', px);
const _actIcoClipboard= (px) => _actIco('<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>', px);
const _actIcoPhone    = (px) => _actIco('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>', px);
const _actIcoCalendar = (px) => _actIco('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', px);
const _actIcoPackage  = (px) => _actIco('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', px);

/* ── ACTION CONFIG ── */
const ACTION_CFG = {
  venta:              { type:'venta',      badge:'venta',     icon:_actIcoCash(),     label:'Venta'     },
  venta_cancelada:    { type:'venta',      badge:'eliminado', icon:_actIcoX(),        label:'Venta cancelada' },
  apartado_nuevo:     { type:'apartado',   badge:'apartado',  icon:_actIcoBookmark(), label:'Apartado'  },
  apartado_abono:     { type:'apartado',   badge:'apartado',  icon:_actIcoCard(),     label:'Abono'     },
  apartado_editado:   { type:'apartado',   badge:'apartado',  icon:_actIcoEdit(),     label:'Apartado editado' },
  apartado_liquidado: { type:'apartado',   badge:'apartado',  icon:_actIcoCheck(),    label:'Liquidado' },
  apartado_reembolso: { type:'apartado',   badge:'eliminado', icon:_actIcoUndo(),     label:'Reembolso' },
  apartado_cancelado: { type:'apartado',   badge:'eliminado', icon:_actIcoX(),        label:'Apartado cancelado' },
  comprobante_enviado: { type:'apartado',  badge:'apartado',  icon:_actIco('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'), label:'Comprobante enviado' },
  comprobante_omitido: { type:'apartado',  badge:'eliminado', icon:_actIcoWarn(),     label:'Sin comprobante' },
  producto_creado:       { type:'inventario', badge:'creado',    icon:_actIcoPlus(),  label:'Creado'    },
  producto_editado:      { type:'inventario', badge:'editado',   icon:_actIcoEdit(),  label:'Editado'   },
  producto_eliminado:    { type:'inventario', badge:'eliminado', icon:_actIcoTrash(), label:'Eliminado' },
  duplicado_descartado:  { type:'inventario', badge:'revisado',  icon:_actIcoEye(),   label:'Revisado'  },
  recepcion_ia_aplicada: { type:'inventario', badge:'editado',   icon:_actIcoCheck(), label:'Recepción con IA' },
  permisos_editados:     { type:'sistema', badge:'editado',   icon:_actIcoEdit(),  label:'Permisos'  },
  configuracion_editada: { type:'sistema', badge:'editado',   icon:_actIcoEdit(),  label:'Configuración' },
  permiso_autorizado:    { type:'sistema', badge:'editado',   icon:_actIcoCheck(), label:'PIN autorizado' },
  override_fallido:      { type:'sistema', badge:'eliminado', icon:_actIcoWarn(),  label:'PIN fallido' },
  cliente_creado:        { type:'sistema', badge:'creado',    icon:_actIcoPlus(),  label:'Cliente nuevo' },
  cliente_editado:       { type:'sistema', badge:'editado',   icon:_actIcoEdit(),  label:'Cliente editado' },
  respaldo_generado:     { type:'sistema', badge:'editado',   icon:_actIcoCheck(), label:'Respaldo generado' },
};

/* ── LOAD ── */
async function load() {
  const loadGeneration = ++_activityLoadGeneration;
  document.getElementById('feed').innerHTML = '<div class="spinner"></div>';
  document.getElementById('summary-row').style.display = 'none';

  const periodVal = document.getElementById('filter-period').value;
  const days = parseInt(periodVal);
  const user = document.getElementById('filter-user').value;

  // Fecha de inicio del período
  // "Hoy" (days=1) usa medianoche del día actual, no "hace 24h"
  let from;
  if (days > 0) {
    const firstDay = _activityAddDays(_activityDayKey(), -(days - 1));
    from = _activityDayStartIso(firstDay);
  } else from = null;

  // Query activity_log (feed y conteos de acciones reales).
  let logQ = `activity_log?select=*&order=created_at.desc,id.desc`;
  if (currentSearch) {
    const qSafe = currentSearch.replace(/[,()]/g, ' ').trim();
    const pat = encodeURIComponent(`*${qSafe}*`);
    logQ += `&or=(summary.ilike.${pat},meta->>customer.ilike.${pat},meta->>name.ilike.${pat})&limit=1000`;
  } else {
    // Tope al feed de auditoría — sin esto, período "Todo" trae el
    // activity_log completo desde el primer día de la tienda.
    logQ += `&limit=300`;
  }
  if (from) logQ += `&created_at=gte.${encodeURIComponent(from)}`;
  if (user) logQ += `&user_email=eq.${encodeURIComponent(user)}`;

  // El dinero se consulta por la fecha real del movimiento. No se filtra por el
  // estado actual de la venta: una cancelación posterior no debe borrar un cobro histórico.
  // sale:sales(is_test) sí se pide para poder excluir pruebas (filtrado abajo).
  let paymentsQ = `sale_payments?select=id,sale_id,request_id,request_line,amount,kind,method,paid_at,collected_by,collected_by_email,is_estimated,source,sale:sales(is_test)&order=paid_at.desc,id.desc`;
  if (from) paymentsQ += `&paid_at=gte.${encodeURIComponent(from)}`;
  if (user) paymentsQ += `&collected_by_email=eq.${encodeURIComponent(user)}`;

  // Apartados con pendiente (todos, sin filtro de período)
  let aptQ = `sales?select=id,total,paid_amount&origin_type=eq.apartado&status=eq.activo&is_test=eq.false&order=id.asc`;
  if (user) aptQ += `&seller_email=eq.${encodeURIComponent(user)}`;

  // logQ ya trae su propio limit= — usar _fetchAllActivity aquí anexaría un
  // segundo &limit= (el de paginación, sin tope) que gana sobre el nuestro.
  const [logRes, paymentsRes, aptRes] = await Promise.all([
    api(logQ), _fetchAllActivity(paymentsQ), _fetchAllActivity(aptQ)
  ]);
  if (loadGeneration !== _activityLoadGeneration) return;

  if (!logRes.ok) {
    document.getElementById('feed').innerHTML = `<div class="empty-state"><div class="em">${_actIcoWarn(32)}</div>Error al cargar actividad</div>`;
    return;
  }

  allData = await _filterOutTestSales(logRes.data || []);
  if (loadGeneration !== _activityLoadGeneration) return;
  const paymentsClean = paymentsRes.ok && Array.isArray(paymentsRes.data)
    ? paymentsRes.data.filter(p => !(Array.isArray(p.sale) ? p.sale[0] : p.sale)?.is_test)
    : null;
  populateUsers(allData);
  updateSummary(
    allData,
    paymentsClean,
    aptRes.ok && Array.isArray(aptRes.data) ? aptRes.data : null
  );
  render(allData);
}

// Las acciones ligadas a una venta/apartado guardan el sale_id en meta.id --
// para las demás (producto_*, permisos_*, configuracion_editada, etc.) ese
// mismo campo significa otra cosa (id de producto, por ejemplo), así que
// nunca se cruzan contra sales.is_test.
const _SALE_LINKED_ACTIONS = new Set([
  'venta', 'venta_cancelada', 'apartado_nuevo', 'apartado_abono', 'apartado_editado',
  'apartado_liquidado', 'apartado_reembolso', 'apartado_cancelado',
  'comprobante_enviado', 'comprobante_omitido'
]);
async function _filterOutTestSales(logData) {
  const ids = [...new Set(
    logData
      .filter(item => _SALE_LINKED_ACTIONS.has(item.action) && Number.isFinite(item.meta?.id))
      .map(item => item.meta.id)
  )];
  if (!ids.length) return logData;
  const r = await _fetchAllActivity(`sales?id=in.(${ids.join(',')})&select=id,is_test`);
  if (!r.ok || !Array.isArray(r.data)) return logData; // si falla la consulta, no ocultar de más
  const testIds = new Set(r.data.filter(s => s.is_test).map(s => s.id));
  if (!testIds.size) return logData;
  return logData.filter(item => !(_SALE_LINKED_ACTIONS.has(item.action) && testIds.has(item.meta?.id)));
}

function populateUsers(data) {
  const sel     = document.getElementById('filter-user');
  const current = sel.value;
  data.map(d => d.user_email).filter(Boolean).forEach(email => _knownActivityUsers.add(email));
  if (current) _knownActivityUsers.add(current);
  const emails = [..._knownActivityUsers].sort();
  sel.innerHTML = '<option value="">Todos</option>';
  emails.forEach(e => {
    const o = document.createElement('option');
    o.value = e; o.textContent = displayName(e);
    if (e === current) o.selected = true;
    sel.appendChild(o);
  });
}

function updateSummary(logData, paymentData, allApartados) {
  // Acciones se cuentan desde el log en su fecha real; importes, solo desde el ledger.
  const ventas = logData.filter(item => item.action === 'venta').length;
  // Cancelaciones no aparecían en ningún lado de este resumen -- justo el
  // dato más útil para notar un patrón (ej. alguien que cancela mucho más
  // que el resto) sin tener que leer el feed línea por línea. Al filtrar
  // por una persona específica, esta cifra queda acotada a ella sola --
  // la consulta al servidor ya filtra logData por user_email.
  const ventasCanceladas = logData.filter(item => item.action === 'venta_cancelada').length;
  const paymentsAvailable = Array.isArray(paymentData);
  const movements = paymentData || [];
  const rawNetReceived = movements.reduce((sum, payment) => sum + _activityPaymentAmount(payment), 0);
  const netReceived = Math.round((rawNetReceived + Number.EPSILON) * 100) / 100;
  const refunds = _activityRefundCount(movements);
  document.getElementById('sum-ventas').textContent = ventas;
  document.getElementById('sum-ventas-sub').textContent = [
    paymentsAvailable
      ? `${netReceived < 0 ? '−' : ''}$${Math.abs(netReceived).toLocaleString('es-MX')} neto${refunds ? ` · ${refunds} devolución${refunds !== 1 ? 'es' : ''}` : ''}`
      : 'Ingresos no disponibles',
    ventasCanceladas ? `${ventasCanceladas} cancelada${ventasCanceladas !== 1 ? 's' : ''}` : ''
  ].filter(Boolean).join(' · ');

  // ── Apartados: acciones del período + pendientes actuales globales
  const aptNuevos = logData.filter(item => item.action === 'apartado_nuevo').length;
  const aptAbonos = logData.filter(item => item.action === 'apartado_abono').length;
  const aptLiquidados = logData.filter(item => item.action === 'apartado_liquidado').length;
  const aptReembolsos = logData.filter(item => item.action === 'apartado_reembolso').length;
  const aptCancelados = logData.filter(item => item.action === 'apartado_cancelado').length;
  const aptPendientes = Array.isArray(allApartados)
    ? allApartados.filter(s => (parseFloat(s.paid_amount) || 0) < (parseFloat(s.total) || 0)).length
    : null;
  document.getElementById('sum-apt').textContent = aptNuevos;
  document.getElementById('sum-apt-sub').textContent = [
    aptAbonos ? `${aptAbonos} abono${aptAbonos !== 1 ? 's' : ''}` : '',
    aptLiquidados ? `${aptLiquidados} liquidado${aptLiquidados !== 1 ? 's' : ''}` : '',
    aptReembolsos ? `${aptReembolsos} reembolso${aptReembolsos !== 1 ? 's' : ''}` : '',
    aptCancelados ? `${aptCancelados} cancelado${aptCancelados !== 1 ? 's' : ''}` : '',
    aptPendientes == null ? 'Pendientes no disponibles' : aptPendientes > 0 ? `${aptPendientes} por cobrar (total)` : 'sin pendientes'
  ].filter(Boolean).join(' · ');

  // ── Inventario: desglosado desde activity_log
  const creados   = logData.filter(d => d.action === 'producto_creado').length;
  const editados  = logData.filter(d => d.action === 'producto_editado').length;
  const eliminados= logData.filter(d => d.action === 'producto_eliminado').length;
  const invTotal  = creados + editados + eliminados;
  document.getElementById('sum-inv').textContent = invTotal;
  document.getElementById('sum-inv-sub').innerHTML =
    invTotal > 0 ? `${_actIcoPlus(11)}${creados} ${_actIcoEdit(11)}${editados} ${_actIcoTrash(11)}${eliminados}` : '';

  const anyData = ventas + aptNuevos + aptAbonos + aptLiquidados + aptReembolsos + movements.length + invTotal > 0;
  if (anyData) document.getElementById('summary-row').style.display = '';
}

function render(data) {
  let filtered = currentType
    ? data.filter(d => (ACTION_CFG[d.action]?.type || 'inventario') === currentType)
    : data;
  if (currentSearch) filtered = filtered.filter(d => _matchesSearch(d, currentSearch));

  const feed = document.getElementById('feed');
  if (!filtered.length) {
    // Antes mostraba el mismo mensaje sin importar la causa -- un día
    // ocupado con el chip "Sistema" activo (y nada de ese tipo en el
    // período) se veía idéntico a un día genuinamente sin actividad, sin
    // forma de distinguir "no pasó nada" de "tu filtro no encontró nada".
    const isFiltered = !!currentType || !!currentSearch;
    feed.innerHTML = `<div class="empty-state"><div class="em">${_actIcoClipboard(32)}</div>${isFiltered ? 'Ningún resultado con este filtro' : 'Sin actividad en este período'}</div>`;
    return;
  }

  const groups = {};
  const today = _activityDayKey();
  const yesterday = _activityAddDays(today, -1);

  filtered.forEach(item => {
    const dayKey = _activityDayKey(item.created_at);
    let key;
    if (dayKey === today) key = 'HOY';
    else if (dayKey === yesterday) key = 'AYER';
    else key = _activityFormat(item.created_at, {weekday:'short', day:'numeric', month:'short'});
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  let html = '';
  for (const [date, items] of Object.entries(groups)) {
    html += `<div class="date-sep">${date}</div>`;
    items.forEach(item => {
      const cfg   = ACTION_CFG[item.action] || { badge:'inventario', icon:'•', label: item.action };
      const time  = _activityFormat(item.created_at, {hour:'2-digit', minute:'2-digit'});
      const meta  = item.meta || {};
      const color = avatarColor(item.user_email);
      const name  = displayName(item.user_email);
      const ini   = avatarInitial(item.user_email);

      let detail = '';
      if (item.action === 'venta' || item.action === 'venta_cancelada')
        detail = [
          meta.items != null ? `${meta.items} producto${meta.items !== 1 ? 's' : ''}` : '',
          meta.method ? (meta.method === 'transferencia' ? _actIcoPhone(12)+' Transferencia' : _actIcoCash(12)+' Efectivo') : '',
          meta.discount > 0 ? `Desc. $${(meta.discount).toLocaleString('es-MX')}` : ''
        ].filter(Boolean).join(' · ');
      else if (item.action === 'apartado_nuevo' && meta.anticipo != null)
        detail = `Anticipo $${meta.anticipo.toLocaleString('es-MX')} · Pendiente $${(meta.pendiente ?? 0).toLocaleString('es-MX')}`;
      else if (item.action === 'apartado_abono' && meta.amount != null)
        detail = `$${meta.amount.toLocaleString('es-MX')} · ${meta.method === 'transferencia' ? _actIcoPhone(12)+' Transferencia' : _actIcoCash(12)+' Efectivo'}`;
      else if (item.action === 'apartado_reembolso' && meta.refund != null)
        detail = `Devuelto $${parseFloat(meta.refund).toLocaleString('es-MX')}`;
      else if (item.action === 'apartado_cancelado' && meta.refund > 0)
        detail = `Devuelto $${parseFloat(meta.refund).toLocaleString('es-MX')} · stock restaurado`;

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
// Detalle de productos guardado en el momento del evento (nombre/precio/qty) —
// autosuficiente: sigue siendo correcto aunque el producto se borre o cambie después
function _renderItemsDetail(meta) {
  if (!Array.isArray(meta.itemsDetail) || !meta.itemsDetail.length) return '';
  const rows = meta.itemsDetail.map(i => {
    const qty = i.qty || 1;
    const sub = parseFloat(i.subtotal ?? (i.price * qty) ?? 0);
    const overridden = i.original_price != null && parseFloat(i.original_price) !== parseFloat(i.price);
    const priceNote = overridden
      ? `<div style="font-size:.7rem;color:#B45309;margin-top:1px">Precio modificado: $${parseFloat(i.original_price).toLocaleString('es-MX')} → $${parseFloat(i.price).toLocaleString('es-MX')}</div>`
      : '';
    return `<div style="display:flex;flex-direction:column;gap:0;font-size:.78rem;padding:3px 0;border-bottom:1px solid #F0EBE3">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(i.name || 'Producto')}${qty>1?` ×${qty}`:''}</span>
        <span style="font-weight:600;flex-shrink:0">$${sub.toLocaleString('es-MX')}</span>
      </div>
      ${priceNote}
    </div>`;
  }).join('');
  return `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed #EDE5DC">${rows}</div>`;
}

function _actPopup(idx) {
  const item = allData[idx];
  if (!item) return;
  document.getElementById('act-pop')?.remove();

  const meta = item.meta || {};
  const cfg  = ACTION_CFG[item.action] || { icon:'•', label: item.action };
  const time = _activityFormat(item.created_at,
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
    bodyHtml += `<div style="font-size:.82rem;color:#8A7564">${meta.method==='transferencia'?_actIcoPhone(12)+' Transferencia':_actIcoCash(12)+' Efectivo'}</div>`;
    if (meta.discount > 0) bodyHtml += `<div style="font-size:.78rem;color:#059669;margin-top:4px">Descuento −$${parseFloat(meta.discount).toLocaleString('es-MX')}</div>`;
    if (meta.reason) bodyHtml += `<div style="font-size:.8rem;color:#1C1817;margin-top:8px;padding:8px 10px;background:#F7F2EB;border-radius:8px;font-style:italic">"${_esc(meta.reason)}"</div>`;
    bodyHtml += _renderItemsDetail(meta);
  } else if (isApt) {
    bodyHtml = `<div style="font-size:.9rem;font-weight:700;margin-bottom:6px">${_esc(meta.customer || item.summary)}</div>`;
    if (meta.total != null)    bodyHtml += `<div style="font-size:.82rem;color:#8A7564">Total: $${parseFloat(meta.total).toLocaleString('es-MX')}</div>`;
    if (meta.anticipo != null) bodyHtml += `<div style="font-size:.82rem;color:#059669;margin-top:2px">Anticipo: $${parseFloat(meta.anticipo).toLocaleString('es-MX')}</div>`;
    if (meta.pendiente != null) bodyHtml += `<div style="font-size:.82rem;color:#B45309;margin-top:2px">Pendiente: $${parseFloat(meta.pendiente).toLocaleString('es-MX')}</div>`;
    if (meta.amount != null)   bodyHtml += `<div style="font-size:.82rem;color:#059669;margin-top:2px">Pago: $${parseFloat(meta.amount).toLocaleString('es-MX')}</div>`;
    if (meta.restante != null) bodyHtml += `<div style="font-size:.82rem;color:#059669;margin-top:2px">Liquidado: $${parseFloat(meta.restante).toLocaleString('es-MX')}</div>`;
    if (meta.pagado != null)   bodyHtml += `<div style="font-size:.82rem;color:#8A7564;margin-top:2px">Cobrado antes de cancelar: $${parseFloat(meta.pagado).toLocaleString('es-MX')}</div>`;
    if (meta.refund != null)   bodyHtml += `<div style="font-size:.82rem;color:#E85D5D;margin-top:2px">Devuelto: $${parseFloat(meta.refund).toLocaleString('es-MX')}</div>`;
    if (meta.method)           bodyHtml += `<div style="font-size:.78rem;color:#8A7564;margin-top:2px">${meta.method==='transferencia'?_actIcoPhone(12)+' Transferencia':_actIcoCash(12)+' Efectivo'}</div>`;
    if (meta.dueDate)          bodyHtml += `<div style="font-size:.78rem;color:#8A7564;margin-top:2px">${_actIcoCalendar(12)} Vencía: ${_activityFormat(meta.dueDate+'T12:00:00Z',{day:'numeric',month:'short',year:'numeric'})}</div>`;
    if (meta.reason) bodyHtml += `<div style="font-size:.8rem;color:#1C1817;margin-top:8px;padding:8px 10px;background:#F7F2EB;border-radius:8px;font-style:italic">"${_esc(meta.reason)}"</div>`;
    bodyHtml += _renderItemsDetail(meta);
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
  const permissionState = await _loadMyPerms({ requireFresh: true, withMeta: true });
  const permissions = permissionState?.permissions;
  if (permissionState?.source !== 'server' || permissions?.canViewActivity !== true) {
    window.location.replace('admin.html');
    return;
  }
  document.querySelectorAll('a[href="stats.html"]').forEach(link => {
    link.style.display = permissions.canViewReports ? '' : 'none';
  });
  try {
    const _s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const _m = _s?.user?.user_metadata || {};
    const _n = _m.full_name || _m.name || _s?.user?.email?.split('@')[0] || '';
    const _av = document.getElementById('user-avatar');
    const _nl = document.getElementById('user-name-lbl');
    if (_av) _av.textContent = _n ? _n[0].toUpperCase() : '?';
    if (_nl) _nl.textContent = _n;
  } catch {}
  const [, productsResult] = await Promise.all([
    loadNameMap(),
    _fetchAllActivity('products?select=id,name,image,price&order=id.asc')
  ]);
  if (productsResult.ok && Array.isArray(productsResult.data)) {
    productsResult.data.forEach(p => { _prodMap[p.id] = p; });
  }
  load();
  _chipsScroll();
});
