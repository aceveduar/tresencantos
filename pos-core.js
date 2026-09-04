/* ── CONFIG ── */
const SUPABASE_URL      = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
const SESSION_KEY = 'te_admin_session';
const TE = null; // tracking removed — stub keeps TE?.track() calls safe
const _esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _giftIconSvg  = (px = 14) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`;
const _clockIconSvg = (px = 14) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
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
function canCancelSale() {
  const up = _getMyPermsCached();
  if (up && 'canCancelSale' in up) return up.canCancelSale;
  const r = getPosRole(); return r === 'superadmin' || r === 'encargado';
}
function canEditApartado() {
  const up = _getMyPermsCached();
  if (up && 'canEditApartado' in up) return up.canEditApartado;
  const r = getPosRole(); return r === 'superadmin' || r === 'duena';
}
function canCancelApartado() {
  return canEditApartado() || canCancelSale();
}
function canOverridePrice() {
  const up = _getMyPermsCached();
  if (up && 'canOverridePrice' in up) return up.canOverridePrice;
  const r = getPosRole(); return r === 'superadmin' || r === 'encargado' || r === 'duena';
}
function canApplyDiscount() {
  const up = _getMyPermsCached();
  if (up && 'canApplyDiscount' in up) return up.canApplyDiscount;
  const r = getPosRole(); return r === 'superadmin' || r === 'encargado' || r === 'duena';
}
function canManageSettings() {
  const up = _getMyPermsCached();
  if (up && 'canManageSettings' in up) return up.canManageSettings;
  return getPosRole() === 'superadmin';
}
function canMarkTestData() {
  const up = _getMyPermsCached();
  if (up && 'canMarkTestData' in up) return up.canMarkTestData;
  return getPosRole() === 'superadmin';
}

let _cancelAptCtx = null;

async function cancelApartado(id) {
  if (!canCancelApartado()) {
    const granted = await requestOverride('canEditApartado', 'Cancelar apartado');
    if (!granted) return;
  }
  const sale = (_apartadosData || {})[id];
  if (!sale) { toast('Apartado no encontrado', 'error'); return; }

  const custParts = (sale.customer || '').split(' · 📱 ');
  const nombre    = custParts[0] || 'Sin nombre';
  const total     = parseFloat(sale.total || 0);
  const pagado    = parseFloat(sale.paid_amount || 0);
  const nItems    = Array.isArray(sale.items) ? sale.items.length : 0;

  _cancelAptCtx = { id, sale, nombre, total, pagado, nItems };

  document.getElementById('cancel-apt-info').textContent = `${nombre} · $${total.toLocaleString('es-MX')} MXN · ${nItems} producto${nItems !== 1 ? 's' : ''}`;
  const reasonEl = document.getElementById('cancel-apt-reason');
  if (reasonEl) reasonEl.value = '';
  const warnEl = document.getElementById('cancel-apt-warning');
  warnEl.innerHTML = pagado > 0
    ? `<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:3px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Ya se pagaron <strong>$${pagado.toLocaleString('es-MX')}</strong>. Al cancelar se registrará la devolución por los mismos métodos de pago y se restaurará el stock.<br>Esta acción no se puede deshacer.`
    : `Se restaurará el stock. Esta acción no se puede deshacer.`;
  document.getElementById('cancel-apt-overlay').style.display = 'flex';
}

function _closeCancelAptModal() {
  document.getElementById('cancel-apt-overlay').style.display = 'none';
  _cancelAptCtx = null;
}

async function _confirmCancelApartado() {
  if (!_cancelAptCtx) return;
  const { id, sale, nombre, total, pagado, nItems } = _cancelAptCtx;
  const btn = document.getElementById('cancel-apt-confirm-btn');
  btn.disabled = true; btn.textContent = 'Cancelando…';

  // p_reason ya existía en el RPC y viajaba hasta activity_log.meta.reason,
  // pero el cliente siempre mandaba el texto fijo "Cancelado desde Caja" --
  // no explica NADA de lo que de verdad pasó, solo desde qué pantalla se
  // tocó el botón (algo que la propia acción ya deja claro). Ahora manda lo
  // que la cajera escribió, o null si lo dejó vacío (mejor sin dato que con
  // uno falso que aparenta ser información real).
  const reasonVal = (document.getElementById('cancel-apt-reason')?.value || '').trim();
  const delResult = await _posCancelSaleAtomic(id, sale, reasonVal || null);
  if (!delResult.ok) {
    toast(_posRpcError(delResult, 'Error al cancelar apartado'), 'error');
    btn.disabled = false; btn.textContent = 'Sí, cancelar apartado';
    if (delResult.resolvedPrior || delResult.staleConflict) {
      _closeCancelAptModal();
      closeAptDetail();
    }
    return;
  }

  btn.disabled = false; btn.textContent = 'Sí, cancelar apartado';
  _closeCancelAptModal();
  closeAptDetail();
  await _refreshPosFinancialState();
  const refundAmount = parseFloat(delResult.data?.sale?.refund_amount) || 0;
  toast(`Apartado de ${nombre} cancelado — stock restaurado${refundAmount > 0 ? ` y devolución de $${refundAmount.toLocaleString('es-MX')} registrada` : ''} ✓`, 'success');
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
  sessionStorage.removeItem('te_user_can');
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'admin.html';
}

/* ── STATE ── */
let products      = [];
let posCategories = [];
let cart          = [];
let salesStats    = {};
let salesCache  = {};
let paymentsCache = {}; // sale_payments.id → payment row (para reenviar comprobante desde Historial)
let currentCat  = 'all';
let payMethod   = 'efectivo';
let discType    = 'fixed';
let _lastSale   = {};

function _saveCart() {
  try {
    const data = cart.map(x => ({ id: x.product.id, qty: x.qty, cp: x.customPrice }));
    localStorage.setItem('te_pos_cart', JSON.stringify(data));
  } catch {}
}
function _restoreCart() {
  try {
    const raw = JSON.parse(localStorage.getItem('te_pos_cart') || '[]');
    if (!Array.isArray(raw) || !raw.length) return;
    cart = raw.map(x => {
      const p = products.find(pr => pr.id === x.id);
      if (!p) return null;
      const item = { product: p, qty: x.qty || 1 };
      if (x.cp != null) item.customPrice = x.cp;
      return item;
    }).filter(Boolean);
  } catch { cart = []; }
}
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
async function _refreshPosToken() {
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
// El servidor atribuye cada cobro al email del token de la sesión que hace la
// llamada (auth.jwt()->>'email'); si ese token no trae email, el pago igual
// se registra pero queda sin dueño ("Sin cajero registrado" en el Corte).
// posRpc() revisa esto antes de cualquier operación de dinero para atajarlo
// en el momento, no días después en Reportes.
function _posSessionEmailClaim() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (s?.user?.email) return String(s.user.email).toLowerCase();
    const jwtEmail = JSON.parse(atob(s?.access_token?.split('.')[1]))?.email;
    return jwtEmail ? String(jwtEmail).toLowerCase() : '';
  } catch { return ''; }
}

async function api(path, opts = {}) {
  const _call = (tk) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${tk}`,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { ok: r.ok, status: r.status, data };
  });
  try {
    const r = await _call(_getPosToken());
    if (r.status === 401 && await _refreshPosToken()) return await _call(_getPosToken());
    return r;
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function _posFetchAll(path, pageSize = 500, maxRows = 20000) {
  return _posPaginatedFetch(path, { pageSize, maxRows, tooManyMessage: 'Hay demasiados movimientos para completar la consulta' });
}

function _posMexicoDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function _posDayKeyValue(dayKey) {
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  return Date.UTC(year || 0, (month || 1) - 1, day || 1);
}

function _posDayKeyDiff(dayKey, baseKey = _posMexicoDayKey()) {
  return Math.round((_posDayKeyValue(dayKey) - _posDayKeyValue(baseKey)) / 86400000);
}

function _posFormatDayKey(dayKey, options = {}) {
  const date = new Date(`${dayKey}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', ...options
  }).format(date);
}

function _posFormatTimestamp(value, options = {}) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', ...options
  }).format(new Date(value));
}

function _posCurrentUserEmail() {
  return String(getSession()?.user?.email || '').trim().toLowerCase();
}

function _posShiftScope() {
  return (_posCurrentUserEmail() || 'sin_usuario').replace(/[^a-z0-9]+/g, '_');
}

function _posShiftStorageKey(name) {
  return `te_${name}_${_posShiftScope()}`;
}

function _posDailyStorageKey(name, date = null) {
  const day = date || localStorage.getItem(_posShiftStorageKey('shift_date')) || _posMexicoDayKey();
  return `te_${name}_${_posShiftScope()}_${day}`;
}

function _posEnsureCurrentShift() {
  const today = _posMexicoDayKey();
  const dateKey = _posShiftStorageKey('shift_date');
  const startKey = _posShiftStorageKey('shift_start');
  let storedDate = localStorage.getItem(dateKey);

  // Primera ejecución tras actualizar: conservar el turno/caja local anterior
  // para el usuario que tiene abierta la sesión, sin borrar las llaves legado.
  if (!storedDate) {
    const legacyDate = localStorage.getItem('te_shift_date');
    const migrationOwnerKey = 'te_shift_legacy_migrated_owner';
    const migrationOwner = localStorage.getItem(migrationOwnerKey);
    if (legacyDate === today && (!migrationOwner || migrationOwner === _posShiftScope())) {
      storedDate = legacyDate;
      localStorage.setItem(dateKey, legacyDate);
      const legacyStart = localStorage.getItem('te_shift_start');
      if (legacyStart) localStorage.setItem(startKey, legacyStart);
      ['gastos', 'fondo', 'conteo'].forEach(name => {
        const legacyValue = localStorage.getItem(`te_${name}_${legacyDate}`);
        const scopedKey = _posDailyStorageKey(name, legacyDate);
        if (legacyValue != null && localStorage.getItem(scopedKey) == null) {
          localStorage.setItem(scopedKey, legacyValue);
        }
      });
      localStorage.setItem(migrationOwnerKey, _posShiftScope());
    }
  }

  if (storedDate !== today) {
    localStorage.setItem(dateKey, today);
    localStorage.setItem(startKey, new Date().toISOString());
  } else if (!localStorage.getItem(startKey)) {
    localStorage.setItem(startKey, new Date().toISOString());
  }
  return {
    date: today,
    start: localStorage.getItem(startKey),
    actorEmail: _posCurrentUserEmail()
  };
}

/* ── RPC IDEMPOTENTES ──
 * Conserva el request_id antes de enviar. Si la red se corta después de que
 * PostgreSQL hizo commit, el siguiente intento reutiliza el mismo UUID y el
 * servidor devuelve la respuesta guardada sin repetir cobros ni movimientos.
 */
const _POS_RPC_PENDING_KEY = 'te_pos_pending_rpc_v2';

function _posUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

function _posRpcPendingRead() {
  try { return JSON.parse(localStorage.getItem(_POS_RPC_PENDING_KEY) || '{}'); }
  catch { return {}; }
}

function _posRpcPendingWrite(all) {
  try {
    if (Object.keys(all).length) localStorage.setItem(_POS_RPC_PENDING_KEY, JSON.stringify(all));
    else localStorage.removeItem(_POS_RPC_PENDING_KEY);
  } catch {}
}

function _posRpcRequest(operation, context, fingerprint) {
  const all = _posRpcPendingRead();
  const key = `${operation}:${context}`;
  const pending = all[key];
  if (pending && pending.fingerprint !== fingerprint) {
    return { key, conflict: true, requestId: pending.requestId, pending };
  }
  if (!pending) {
    all[key] = { requestId: _posUuid(), fingerprint, createdAt: new Date().toISOString() };
    _posRpcPendingWrite(all);
  }
  return { key, conflict: false, requestId: (pending || all[key]).requestId };
}

function _posRpcRequestDone(key) {
  const all = _posRpcPendingRead();
  delete all[key];
  _posRpcPendingWrite(all);
}

async function posRpc(path, { operation, context = 'global', fingerprint = '', body = {} }) {
  if (!_posSessionEmailClaim()) {
    const refreshed = await _refreshPosToken().catch(() => false);
    if (!refreshed || !_posSessionEmailClaim()) {
      return {
        ok: false,
        status: 401,
        data: { message: 'Tu sesión no tiene email registrado — cierra sesión y vuelve a entrar antes de continuar, así el cobro queda bien atribuido.' }
      };
    }
  }
  const requestFingerprint = fingerprint || JSON.stringify(body);
  let request = _posRpcRequest(operation, context, requestFingerprint);
  if (request.conflict) {
    // Después de una respuesta perdida, una recarga puede cambiar el formulario.
    // Preguntar al servidor bajo el mismo advisory lock evita tanto duplicar como
    // dejar el dispositivo bloqueado para siempre con un UUID pendiente.
    try {
      const check = await api('rpc/get_pos_rpc_result', {
        method: 'POST',
        body: JSON.stringify({ p_request_id: request.requestId })
      });
      if (check.ok && check.data?.found === false) {
        _posRpcRequestDone(request.key);
        request = _posRpcRequest(operation, context, requestFingerprint);
      } else if (check.ok && check.data?.found === true) {
        _posRpcRequestDone(request.key);
        return {
          ok: false,
          status: 409,
          resolvedPrior: true,
          priorResponse: check.data.response,
          data: { message: 'La operación anterior sí quedó registrada. Actualizamos los datos; revisa el resultado y vuelve a intentar la nueva operación.' }
        };
      } else {
        return {
          ok: false,
          status: check.status || 0,
          pendingConflict: true,
          data: { message: 'Hay una operación anterior sin confirmar. Repite primero esa operación con los mismos datos.' }
        };
      }
    } catch {
      return {
        ok: false,
        status: 0,
        pendingConflict: true,
        data: { message: 'Hay una operación anterior sin confirmar. Repite primero esa operación con los mismos datos.' }
      };
    }
  }
  try {
    const result = await api(`rpc/${path}`, {
      method: 'POST',
      body: JSON.stringify({ p_request_id: request.requestId, ...body })
    });
    if (result.status === 0) {
      return {
        ...result,
        ambiguous: true,
        data: { message: 'No se pudo confirmar la operación. Reintenta para consultar el mismo movimiento sin duplicarlo.' }
      };
    }
    // PostgreSQL usa 40001 para avisar que la versión leída por la caja ya
    // cambió. PostgREST puede exponerlo como HTTP 500, pero la transacción hizo
    // rollback: es un conflicto definitivo, no una respuesta ambigua.
    const staleConflict = result?.data?.code === '40001';
    if (result.ok || staleConflict || (result.status >= 400 && result.status < 500 && ![408, 429].includes(result.status))) {
      _posRpcRequestDone(request.key);
    }
    return staleConflict ? { ...result, staleConflict: true } : result;
  } catch {
    return {
      ok: false,
      status: 0,
      ambiguous: true,
      data: { message: 'No se pudo confirmar la operación. Reintenta para consultar el mismo movimiento sin duplicarlo.' }
    };
  }
}

function _posRpcError(result, fallback) {
  const message = result?.data?.message || result?.data?.details || '';
  if (result?.pendingConflict || result?.ambiguous) return message;
  if (result?.status === 404 || /function .* does not exist|schema cache|PGRST202/i.test(message)) {
    return 'Falta aplicar la migración de Apartados en Supabase. No se modificó ningún dato.';
  }
  return message || fallback;
}

// Única fuente de verdad para "¿este apartado ya está liquidado?", usada por
// pos-apartados.js y pos-ui.js. Las dos cláusulas !sale.status son compat con
// filas anteriores a la migración v2 (sin status poblado todavía) — sin ese
// guard, un apartado reabierto por refund_apartado_atomic (status vuelve a
// 'activo' pero type puede seguir en 'venta', legacy) se clasificaría como
// liquidado otra vez. No quitar el guard sin volver a probar ese flujo.
function _isApartadoLiquidado(sale) {
  if (!sale) return false;
  if (sale.status === 'liquidado') return true;
  if (sale.status) return false;
  if (sale.origin_type === 'apartado' && sale.type === 'venta') return true;
  const abonos = Array.isArray(sale.payment_history) ? sale.payment_history
    : Array.isArray(sale.abonos) ? sale.abonos : [];
  return sale.type === 'venta' && abonos.length > 0;
}

async function _refreshPosFinancialState() {
  const tasks = [];
  if (typeof loadProducts === 'function') tasks.push(loadProducts());
  if (typeof loadApartados === 'function') tasks.push(loadApartados());
  if (typeof loadApartadosLiquidados === 'function') tasks.push(loadApartadosLiquidados());
  if (typeof loadApartadosCancelados === 'function') tasks.push(loadApartadosCancelados());
  if (typeof loadHistory === 'function') tasks.push(loadHistory());
  if (typeof loadTodayStats === 'function') tasks.push(loadTodayStats());
  await Promise.allSettled(tasks);
  if (typeof showAllProducts === 'function') showAllProducts();
  if (typeof filterApartadosWithDue === 'function') {
    filterApartadosWithDue(document.getElementById('apt-search')?.value || '', 'offcanvas');
    filterApartadosWithDue(document.getElementById('apt-page-search')?.value || '', 'page');
  }
}

// Suma el descuento implícito en items con precio editado a mano en el
// carrito (item.original_price != item.price), separado del campo plano
// "Agregar descuento" (sales.discount). Usado por el modal post-venta, el
// ticket de WhatsApp, Historial y la ficha de apartado para que un precio
// negociado por producto también cuente como descuento visible.
function _itemsDiscountTotal(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, i) =>
    sum + (i.original_price != null ? (i.original_price - i.price) * (i.qty || 1) : 0), 0);
}

// Único punto de entrada para cancel_sale_atomic — usado tanto desde el
// panel de Apartados como desde Historial, para que ambos flujos no puedan
// desincronizarse en el fingerprint, el pago considerado o cuándo refrescar.
// Refresca en cualquier falla que no sea ambiguous/pendingConflict (no solo
// resolvedPrior/staleConflict), igual que ya hacían abonar/editar/reembolsar
// en pos-apartados.js — evita dejar el botón de cancelar accionable sobre
// datos locales desactualizados tras un rechazo del servidor.
async function _posCancelSaleAtomic(id, sale, reason) {
  const pagado = parseFloat(sale?.paid_amount ?? sale?.total) || 0;
  const result = await posRpc('cancel_sale_atomic', {
    operation: 'cancel_sale',
    context: id,
    fingerprint: `${id}:${sale?.version ?? 0}:${pagado}`,
    body: {
      p_sale_id: id,
      p_expected_version: sale?.version ?? 0,
      p_reason: reason,
      p_override_tickets: _collectOverrideTickets(['canCancelSale', 'canEditApartado'])
    }
  });
  if (!result.ok && !result.ambiguous && !result.pendingConflict) {
    await _refreshPosFinancialState();
  }
  return result;
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
    kitItems: p.kit_items || null,
    expiryDate: p.expiry_date || null
  };
}

let _productsLoadGeneration = 0;
async function loadProducts() {
  const loadGeneration = ++_productsLoadGeneration;
  const result = await _posFetchAll('products?select=id,name,category,category_label,price,original_price,description,image,barcode,stock,out_of_stock,badge,badge_type,kit_items,expiry_date&is_archived=eq.false&order=position.asc,id.asc');
  if (loadGeneration !== _productsLoadGeneration) return false;
  if (result.ok && Array.isArray(result.data)) {
    products = result.data.map(_mapPosProduct);
    try {
      localStorage.setItem('te_pos_products_cache', JSON.stringify(result.data));
      localStorage.setItem('te_pos_products_cache_ts', Date.now());
    } catch {}
  } else {
    // Fallback: cargar desde caché local si no hay conexión
    try {
      const cached = localStorage.getItem('te_pos_products_cache');
      if (cached) {
        products = JSON.parse(cached).map(_mapPosProduct);
        const ts = parseInt(localStorage.getItem('te_pos_products_cache_ts') || '0');
        const mins = Math.round((Date.now() - ts) / 60000);
        const age = mins < 60 ? `${mins} min` : `${Math.round(mins/60)} h`;
        toast(`Sin conexión — catálogo de hace ${age}. Las ventas no se pueden registrar.`, 'error');
      }
    } catch {}
  }
  renderFrecuentes();
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
        global: { headers: { Authorization: `Bearer ${_getPosToken()}` } }
      });
      client
        .channel('pos-products')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, _handleRealtimeProduct)
        .subscribe();
    } catch (err) {
      console.warn('Realtime no disponible:', err);
    }
  }).catch(() => console.warn('No se pudo cargar supabase.js para Realtime'));
}

function _driveSz(url, w) {
  if (!url || !url.includes('drive.google.com')) return url;
  return url.replace(/sz=w\d+/, `sz=w${w}`);
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
  if (!Array.isArray(p.kitItems)) return p.stock;
  if (!p.kitItems.length) return 0;
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
    const r = await api('sales?select=items&cancelled_at=is.null&order=created_at.desc&limit=200');
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
  const isKit = Array.isArray(p.kitItems);
  const oos = isKit ? effStock === 0 : (effStock === 0 || p.outOfStock);
  const stockCls = isKit ? (oos ? 'stock-sold' : 'stock-ok') : (effStock === 0 ? 'stock-sold' : effStock === 1 ? 'stock-one' : 'stock-ok');
  const stockTxt = isKit
    ? (isKit && !p.kitItems.length ? 'Sin componentes' : oos ? 'Sin stock' : `${_giftIconSvg(13)} ${effStock} kit${effStock!==1?'s':''}`)
    : (effStock === 0 ? 'Sin stock' : `${effStock} ud${effStock!==1?'s':''}`);
  const kitComps = isKit && p.kitItems.length
    ? p.kitItems.map(c => `<div style="font-size:.6rem;color:#9B8B78;line-height:1.3;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.qty > 1 ? c.qty + '× ' : ''}${_esc(c.name)}</div>`).join('')
    : '';
  let expBadge = '';
  if (p.expiryDate) {
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(p.expiryDate + 'T00:00:00') - hoy) / 86400000);
    if (days < 0) expBadge = `<span class="pos-card-stock stock-sold" style="margin-left:4px" title="Caducó hace ${Math.abs(days)}d">${_clockIconSvg(13)}</span>`;
    else if (days <= 60) expBadge = `<span class="pos-card-stock stock-one" style="margin-left:4px" title="Caduca en ${days}d">${_clockIconSvg(13)} ${days}d</span>`;
  }
  return `
<div class="pos-card${oos?' card-sold':''}" onclick="${oos?`_showRestockPrompt(${p.id})`:` addToCart(${p.id},this.querySelector('.pos-card-add-icon'),event)`}">
  <div class="pos-card-img-wrap">
    <img class="pos-card-img" src="${_driveSz(p.image,200)}" alt="${_esc(p.name)}" loading="lazy"
         onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'"
         onclick="event.stopPropagation();openPosPreview(${p.id})" style="cursor:zoom-in">
    <div class="pos-card-add">
      <div class="pos-card-add-icon">+</div>
    </div>
  </div>
  <div class="pos-card-body">
    <div class="pos-card-name">${isKit ? _giftIconSvg(14) + ' ' : ''}${_esc(p.name)}</div>
    ${kitComps}
    <div class="pos-card-price">$${p.price.toLocaleString('es-MX')}</div>
    <span class="pos-card-stock ${stockCls}">${stockTxt}</span>${expBadge}
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
    const isOos = Array.isArray(p.kitItems) ? effStock === 0 : (p.outOfStock || p.stock === 0);
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
      const aOos = Array.isArray(a.kitItems) ? getKitStock(a) === 0 : (a.outOfStock || a.stock === 0);
      const bOos = Array.isArray(b.kitItems) ? getKitStock(b) === 0 : (b.outOfStock || b.stock === 0);
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
    el.innerHTML = '<div class="pos-empty"><div class="em"><svg style="width:30px;height:30px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>No hay productos cargados</div>';
    return;
  }
  const filtered = getFilteredProducts();
  if (!filtered.length) {
    el.innerHTML = '<div class="pos-empty"><div class="em"><svg style="width:30px;height:30px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>Sin productos en esta categoría</div>';
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
    el.innerHTML = `<div class="pos-empty"><div class="em"><svg style="width:30px;height:30px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>Sin resultados</div>`;
    return;
  }
  renderPosProducts(matches, false);
}

const PROD_PLACEHOLDER = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22400%22%20height%3D%22400%22%20viewBox%3D%220%200%20400%20400%22%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22%23F7F2EB%22%2F%3E%3Crect%20x%3D%22130%22%20y%3D%22100%22%20width%3D%22140%22%20height%3D%22140%22%20rx%3D%2210%22%20fill%3D%22none%22%20stroke%3D%22%23D4BC94%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%22158%22%20cy%3D%22127%22%20r%3D%2214%22%20fill%3D%22%23D4BC94%22%2F%3E%3Cpath%20d%3D%22M130%20210%20L175%20165%20L210%20195%20L255%20150%20L280%20180%20L280%20240%20L130%20240Z%22%20fill%3D%22%23D4BC94%22%20fill-opacity%3D%22.4%22%2F%3E%3C%2Fsvg%3E';

function productCard(p) {
  const effStock = getKitStock(p);
  const isKit    = Array.isArray(p.kitItems);
  const oos      = isKit ? effStock === 0 : (effStock === 0 || p.outOfStock);
  const disabled = oos ? 'style="opacity:.5;cursor:not-allowed"' : '';
  const kitCompsLine = isKit && p.kitItems.length
    ? p.kitItems.map(c => `<div style="font-size:.7rem;color:#9B8B78;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.qty > 1 ? c.qty + '× ' : ''}${_esc(c.name)}</div>`).join('')
    : '';
  const stockSub = isKit
    ? (isKit && !p.kitItems.length ? ' · <span style="color:var(--red)">Sin componentes</span>' : oos ? ' · <span style="color:var(--red)">Sin stock</span>' : ` · <span style="color:#6B9E78;font-weight:600">${_giftIconSvg(13)} ${effStock} kit${effStock!==1?'s':''}</span>`)
    : effStock === 1
      ? ' · <span style="color:#C9A462;font-weight:700">Última</span>'
      : effStock >= 2 && effStock <= 5
        ? ` · <span style="color:#6B9E78;font-weight:600">${effStock} uds</span>`
        : effStock > 5
          ? ` · <span style="color:#9B8B78">${effStock} uds</span>`
          : '';
  let expSub = '';
  if (p.expiryDate) {
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const days = Math.round((new Date(p.expiryDate + 'T00:00:00') - hoy) / 86400000);
    if (days < 0) expSub = ` · <span style="color:var(--red);font-weight:700">${_clockIconSvg(13)} Caducado</span>`;
    else if (days <= 60) expSub = ` · <span style="color:#D97706;font-weight:700">${_clockIconSvg(13)} ${days}d</span>`;
  }
  return `
<div class="pos-prod" onclick="${oos ? `_showRestockPrompt(${p.id})` : `addToCart(${p.id},null,event)`}" ${oos ? '' : ''}>
  <img class="pos-prod-img" src="${_driveSz(p.image,200)}" alt="${_esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'" onclick="event.stopPropagation();${oos ? `_showRestockPrompt(${p.id})` : `openPosPreview(${p.id})`}" style="cursor:${oos?'pointer':'zoom-in'}">
  <div class="pos-prod-info">
    <div class="pos-prod-name">${isKit ? _giftIconSvg(14) + ' ' : ''}${_esc(p.name)}</div>
    ${kitCompsLine}
    <div class="pos-prod-sub"${kitCompsLine ? ' style="margin-top:5px;padding-top:4px;border-top:1px solid #EDE0CF"' : ''}>${_esc(p.categoryLabel)}${stockSub}${expSub}</div>
  </div>
  <div class="pos-prod-right">
    <div class="pos-prod-price">$${p.price.toLocaleString('es-MX')}</div>
    <button class="pos-prod-add${oos ? ' btn-stock-oos' : ''}" onclick="event.stopPropagation();${oos ? `_showRestockPrompt(${p.id})` : `addToCart(${p.id},this,event)`}" title="${oos ? 'Sin stock — toca para reabastecer' : 'Agregar'}">+</button>
  </div>
</div>`;
}
