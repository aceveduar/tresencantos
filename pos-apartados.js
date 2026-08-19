/* ── ANIMACIÓN "PENDIENTE" — pulso sutil cuando cambia el valor mostrado ── */
let _lastPendienteDisplay = null;
function _pulsePendiente(el) {
  if (!el) return;
  const display = el.value || el.placeholder || '';
  if (display === _lastPendienteDisplay) return;
  _lastPendienteDisplay = display;
  el.classList.remove('pendiente-pulse');
  void el.offsetWidth; // fuerza reflow para poder reiniciar la animación
  el.classList.add('pendiente-pulse');
}

/* ── DESCUENTO ── */
function clampDiscount() {
  const input = document.getElementById('pos-discount');
  if (!input) return;
  const val = parseFloat(input.value) || 0;
  if (discType === 'pct' && val > 100) input.value = 100;
  if (val < 0) input.value = 0;
}

function setDiscountType(type) {
  discType = type;
  document.getElementById('disc-pct-btn').classList.toggle('active', type === 'pct');
  document.getElementById('disc-fixed-btn').classList.toggle('active', type === 'fixed');
  clampDiscount();
  updateChange();
}

function toggleDiscountField() {
  document.getElementById('discount-toggle-btn').style.display = 'none';
  document.getElementById('discount-row-wrap').style.display = '';
  setTimeout(() => document.getElementById('pos-discount')?.focus(), 50);
}
function clearDiscountField() {
  document.getElementById('pos-discount').value = '';
  setDiscountType('fixed');
  document.getElementById('discount-row-wrap').style.display = 'none';
  document.getElementById('discount-toggle-btn').style.display = '';
  updateChange();
}
function autoCollapseDiscount() {
  const val = parseFloat(document.getElementById('pos-discount')?.value) || 0;
  if (val <= 0) clearDiscountField();
}

function getDiscount() {
  const val = parseFloat(document.getElementById('pos-discount')?.value) || 0;
  if (val <= 0) return 0;
  const gross = getTotal();
  return discType === 'pct' ? Math.min(gross, gross * val / 100) : Math.min(gross, val);
}

function getDiscountedTotal() { return Math.max(0, getTotal() - getDiscount()); }

/* ── MÉTODO DE PAGO ── */
function setPayMethod(method) {
  payMethod = method;
  document.getElementById('pay-efectivo').classList.toggle('active', method === 'efectivo');
  document.getElementById('pay-transferencia').classList.toggle('active', method === 'transferencia');
  document.getElementById('apt-pay-efectivo')?.classList.toggle('active', method === 'efectivo');
  document.getElementById('apt-pay-transferencia')?.classList.toggle('active', method === 'transferencia');
  const isApt = document.getElementById('pos-is-apartado')?.checked;
  document.getElementById('cash-section').style.display = (!isApt && method === 'efectivo') ? '' : 'none';
  updateChange();
}

/* ── NOTA ── */
function toggleNoteField() {
  document.getElementById('note-toggle-btn').style.display = 'none';
  document.getElementById('note-input-wrap').style.display = '';
  setTimeout(() => document.getElementById('pos-note').focus(), 50);
}
function clearNoteField() {
  document.getElementById('pos-note').value = '';
  document.getElementById('note-input-wrap').style.display = 'none';
  document.getElementById('note-toggle-btn').style.display = '';
}
function autoCollapseNote() {
  const val = document.getElementById('pos-note')?.value.trim();
  if (!val) clearNoteField();
}

/* ── CLIENTE ── */
function toggleCustomerField() {
  document.getElementById('customer-toggle-btn').style.display = 'none';
  document.getElementById('customer-input-wrap').style.display = '';
  setTimeout(() => document.getElementById('pos-customer').focus(), 50);
}
function clearCustomerField() {
  document.getElementById('pos-customer').value = '';
  document.getElementById('customer-input-wrap').style.display = 'none';
  document.getElementById('customer-toggle-btn').style.display = '';
  updateAnticipoInfo();
}
function autoCollapseCustomer() {
  const val = document.getElementById('pos-customer')?.value.trim();
  if (!val) clearCustomerField();
}

/* ── APARTADO ── */
function toggleApartadoMode() {
  const isApt = document.getElementById('pos-is-apartado').checked;
  document.getElementById('cobrar-btn').textContent = isApt ? '📌 Registrar apartado' : '✓ Cobrar';
  // Ocultar efectivo/cambio en apartado — esos campos se ignoran en cobrar()
  const cashSection = document.getElementById('cash-section');
  if (cashSection) cashSection.style.display = isApt ? 'none' : (payMethod === 'efectivo' ? '' : 'none');
  // Método de pago: en apartado vive dentro del sheet (junto al anticipo), no en la columna principal
  const payRowMain = document.getElementById('pay-method-row-main');
  if (payRowMain) payRowMain.style.display = isApt ? 'none' : '';
  document.getElementById('apartado-group')?.classList.toggle('active', isApt);
  if (isApt) {
    const cashEl = document.getElementById('pos-cash');
    if (cashEl) cashEl.value = '';
    const changeEl = document.getElementById('pos-change-input');
    if (changeEl) changeEl.value = '';
    // Fecha límite por defecto: 30 días
    const dueEl = document.getElementById('pos-due-date');
    if (dueEl && !dueEl.value) {
      const d = new Date(); d.setDate(d.getDate() + 30);
      dueEl.value = _posMexicoDayKey(d);
    }
    // El cliente ahora vive en el sheet del apartado, no en la columna principal
    document.getElementById('cliente-normal-row').style.display = 'none';
    // Si ya había un nombre capturado para venta normal, se lo pasamos al sheet
    const existingName = document.getElementById('pos-customer')?.value.trim();
    const aptCustEl = document.getElementById('pos-apt-customer');
    if (aptCustEl && existingName && !aptCustEl.value) aptCustEl.value = existingName;
    openApartadoSheet();
  } else {
    // Al desactivar apartado: limpiar campos específicos del apartado y hint
    ['pos-apt-customer','pos-phone','pos-anticipo','pos-pendiente','pos-due-date'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('cliente-normal-row').style.display = '';
    document.querySelectorAll('.anticipo-quick button').forEach(b => b.classList.remove('active-cash'));
    const hint = document.getElementById('cobrar-hint');
    if (hint) hint.style.display = 'none';
    closeApartadoSheet();
  }
  _renderApartadoSummary();
  updateChange(); // recalcula label de "Total del pedido"/"Total a cobrar" y todo lo demás (incluye updateAnticipoInfo)
}

/* ── APARTADO SHEET — cliente, teléfono, anticipo y fecha límite en un panel aparte ── */
function openApartadoSheet() {
  const overlay = document.getElementById('apartado-sheet-overlay');
  if (overlay) overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('pos-apt-customer')?.focus(), 80);
}
function closeApartadoSheet() {
  const overlay = document.getElementById('apartado-sheet-overlay');
  if (overlay) overlay.style.display = 'none';
  _renderApartadoSummary();
}
function _confirmApartadoSheet() {
  const name = document.getElementById('pos-apt-customer')?.value.trim();
  if (!name) {
    toast('Ingresa el nombre del cliente', 'error');
    document.getElementById('pos-apt-customer')?.focus();
    return;
  }
  closeApartadoSheet();
}
function _cancelApartadoSheet() {
  document.getElementById('pos-is-apartado').checked = false;
  toggleApartadoMode();
}

function _renderApartadoSummary() {
  const btn     = document.getElementById('apartado-details-btn');
  const summary = document.getElementById('apartado-summary');
  if (!btn || !summary) return;
  const isApt = document.getElementById('pos-is-apartado')?.checked;
  if (!isApt) { btn.style.display = 'none'; summary.style.display = 'none'; return; }

  const customerName = document.getElementById('pos-apt-customer')?.value.trim() || '';
  if (!customerName) {
    summary.style.display = 'none';
    btn.style.display = '';
    return;
  }
  btn.style.display = 'none';
  summary.style.display = 'flex';
  const anticipo  = parseFloat(document.getElementById('pos-anticipo')?.value) || 0;
  const total     = getDiscountedTotal();
  const pendiente = Math.max(0, total - anticipo);
  const dueVal    = document.getElementById('pos-due-date')?.value;
  const dueStr    = dueVal ? _posFormatDayKey(dueVal, { day:'numeric', month:'short' }) : '';
  const parts = [_esc(customerName)];
  if (anticipo > 0 && pendiente > 0) {
    parts.push(`anticipo $${anticipo.toLocaleString('es-MX')}`, `pendiente $${pendiente.toLocaleString('es-MX')}`);
  } else if (anticipo > 0 && pendiente === 0) {
    parts.push(`anticipo $${anticipo.toLocaleString('es-MX')} (cubierto ✓)`);
  } else {
    parts.push(`$${total.toLocaleString('es-MX')} al entregar`);
  }
  if (dueStr) parts.push(`vence ${dueStr}`);
  summary.innerHTML = `<span>📌 ${parts.join(' · ')}</span><span class="apt-summary-edit">✏️ Editar</span>`;
}

function setAnticipo(pct) {
  const total = getDiscountedTotal();
  const amount = pct === 1 ? total : Math.floor(total * pct);
  const el = document.getElementById('pos-anticipo');
  if (el) el.value = amount > 0 ? amount : '';
  document.querySelectorAll('.anticipo-quick button').forEach(b => b.classList.remove('active-cash'));
  event?.currentTarget?.classList.add('active-cash');
  updateAnticipoInfo();
}

function updateAnticipoInfo() {
  const anticipo = parseFloat(document.getElementById('pos-anticipo')?.value) || 0;
  const total    = getDiscountedTotal();
  const el       = document.getElementById('pos-pendiente');
  const antiEl   = document.getElementById('pos-anticipo');
  const btn      = document.getElementById('cobrar-btn');

  if (anticipo > total && anticipo > 0) {
    // Anticipo mayor al total — no tiene sentido para un apartado
    if (el)      { el.value = ''; el.style.color = 'var(--red)'; el.placeholder = 'Anticipo > total'; _pulsePendiente(el); }
    if (antiEl)  antiEl.style.borderColor = 'var(--red)';
    if (btn)     btn.disabled = true;
    return;
  }

  // Restaurar estilos normales
  if (antiEl) antiEl.style.borderColor = '';

  const pendiente = Math.max(0, total - anticipo);
  if (el) {
    if (anticipo > 0 && pendiente > 0) {
      el.value = pendiente.toFixed(2); el.placeholder = ''; el.style.color = 'var(--red)';
    } else if (anticipo > 0 && pendiente === 0) {
      el.value = ''; el.placeholder = 'Cubierto ✓'; el.style.color = 'var(--green)';
    } else if (total > 0) {
      el.value = ''; el.placeholder = 'Cobrar al entregar'; el.style.color = 'var(--muted)';
    } else {
      el.value = ''; el.placeholder = '—'; el.style.color = 'var(--muted)';
    }
    _pulsePendiente(el);
  }
  const hint = document.getElementById('cobrar-hint');
  if (btn && document.getElementById('pos-is-apartado')?.checked) {
    const customer  = document.getElementById('pos-apt-customer')?.value.trim() || '';
    const noCart    = !cart.length;
    const needsCust = !customer;
    btn.disabled = noCart || needsCust;
    if (hint) {
      if (noCart && needsCust) {
        hint.textContent = 'Agrega productos y el nombre del cliente para continuar';
        hint.style.color = '#9B8B78'; hint.style.display = '';
      } else if (noCart) {
        hint.textContent = 'Agrega productos al carrito para continuar';
        hint.style.color = '#9B8B78'; hint.style.display = '';
      } else if (needsCust) {
        hint.textContent = 'Ingresa el nombre del cliente para continuar';
        hint.style.color = '#9B8B78'; hint.style.display = '';
      } else if (anticipo <= 0) {
        hint.textContent = '📦 Sin anticipo — se cobrará al entregar';
        hint.style.color = 'var(--gold-dark)'; hint.style.display = '';
      } else {
        hint.style.display = 'none';
      }
    }
  } else if (hint) {
    hint.style.display = 'none';
  }
  _renderApartadoSummary();
}


let _apartadosLiquidadosAll = [];
let _aptViewMode = 'activos'; // 'activos' | 'liquidados'
let _aptViewRequestGeneration = 0;
let _apartadosLoadGeneration = 0;
let _apartadosLiquidatedLoadGeneration = 0;
const _APT_MONEY_EPSILON = 0.005;

function _aptMoney(value) {
  return Math.round((parseFloat(value) || 0) * 100) / 100;
}

function _apartadoPaymentMeta(payment) {
  const rawAmount = parseFloat(payment?.amount) || 0;
  const amount = payment?.kind === 'refund' ? -Math.abs(rawAmount) : rawAmount;
  const isLedgerEntry = Object.prototype.hasOwnProperty.call(payment || {}, 'paid_at');
  const date = isLedgerEntry ? payment.paid_at : payment?.date;
  const dateLabel = date && !Number.isNaN(new Date(date).getTime())
    ? new Date(date).toLocaleDateString('es-MX', { timeZone:'America/Mexico_City', day:'numeric', month:'short' })
    : 'Histórico';
  const method = payment?.method === 'transferencia' ? 'transferencia'
    : payment?.method === 'efectivo' ? 'efectivo' : 'método sin registrar';
  const icon = amount < 0 ? '↩️' : method === 'transferencia' ? '📱' : method === 'efectivo' ? '💵' : '🧾';
  return { amount, dateLabel, method, icon };
}

async function _hydrateApartadoPayments(rows) {
  const ids = [...new Set((rows || []).map(sale => Number(sale.id)).filter(Number.isFinite))];
  const bySale = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const result = await _posFetchAll(
      `sale_payments?sale_id=in.(${chunk.join(',')})&select=id,sale_id,amount,kind,method,paid_at,recorded_at,is_estimated,source&order=paid_at.asc.nullsfirst,recorded_at.asc,id.asc`
    );
    if (!result.ok) {
      (rows || []).forEach(sale => { sale.payment_history_error = true; });
      return false;
    }
    (result.data || []).forEach(payment => {
      const key = String(payment.sale_id);
      if (!bySale.has(key)) bySale.set(key, []);
      bySale.get(key).push(payment);
    });
  }
  (rows || []).forEach(sale => {
    sale.payment_history = bySale.get(String(sale.id)) || [];
    sale.payment_history_error = false;
  });
  return true;
}

async function _loadApartadoPages(query, pageSize = 500) {
  const rows = [];
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const join = query.includes('?') ? '&' : '?';
    const result = await api(`${query}${join}limit=${pageSize}&offset=${offset}`);
    if (!result.ok) return result;
    const page = Array.isArray(result.data) ? result.data : [];
    rows.push(...page);
    if (page.length < pageSize) return { ok: true, status: result.status, data: rows };
  }
  return { ok: false, status: 413, data: { message: 'Demasiados apartados para cargar en una sola vista' } };
}

async function loadApartadosLiquidados() {
  const loadGeneration = ++_apartadosLiquidatedLoadGeneration;
  const fields = 'id,type,origin_type,status,total,paid_amount,payment_method,customer,created_at,due_date,liquidated_at,last_payment_at,updated_at,version,items,abonos,discount';
  const result = await _loadApartadoPages(`sales?origin_type=eq.apartado&status=eq.liquidado&select=${fields}&order=liquidated_at.desc.nullslast,created_at.desc,id.desc`);
  if (loadGeneration !== _apartadosLiquidatedLoadGeneration) return false;
  if (!result.ok) return null;
  const rows = Array.isArray(result.data) ? result.data : [];
  await _hydrateApartadoPayments(rows);
  if (loadGeneration !== _apartadosLiquidatedLoadGeneration) return false;
  _apartadosLiquidadosAll = rows;
  _apartadosData = {};
  // Activos al final: si un reembolso reabrió un apartado, nunca gana una copia
  // liquidada que hubiera quedado en memoria de una carga anterior.
  [..._apartadosLiquidadosAll, ..._apartadosAll].forEach(s => { _apartadosData[s.id] = s; });
  return _apartadosLiquidadosAll;
}

async function toggleAptView(mode, target) {
  const requestGeneration = ++_aptViewRequestGeneration;
  _aptViewMode = mode;
  document.querySelectorAll(`#apt-view-toggle-${target} button`).forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const isLiq = mode === 'liquidados';
  const renderFn = target === 'page' ? _renderAptPageCards : _renderApartadoCards;
  if (isLiq) {
    const listEl = document.getElementById(target === 'page' ? 'apt-page-list' : 'apt-offcanvas-list');
    if (listEl) listEl.innerHTML = '<div class="history-empty" style="grid-column:1/-1">Cargando…</div>';
    const rows = await loadApartadosLiquidados();
    if (requestGeneration !== _aptViewRequestGeneration || _aptViewMode !== mode) return false;
    if (rows === false) return false;
    if (rows === null) {
      if (listEl) listEl.innerHTML = `<div class="history-empty" style="grid-column:1/-1"><div style="font-size:2rem;margin-bottom:8px">⚠️</div>No se pudieron cargar los liquidados.<br><button type="button" class="btn btn-outline" style="margin-top:12px" onclick="selectAptView('liquidados','${target}')">Reintentar</button></div>`;
      return;
    }
    renderFn(_apartadosLiquidadosAll, true);
  } else {
    renderFn(_apartadosAll, false);
  }
  return true;
}

async function loadApartados() {
  const loadGeneration = ++_apartadosLoadGeneration;
  const fields = 'id,type,origin_type,status,total,paid_amount,payment_method,customer,created_at,due_date,liquidated_at,last_payment_at,updated_at,version,items,abonos,discount';
  const result = await _loadApartadoPages(`sales?origin_type=eq.apartado&status=eq.activo&select=${fields}&order=created_at.desc,id.desc`);
  if (loadGeneration !== _apartadosLoadGeneration) return false;
  const ocList    = document.getElementById('apt-offcanvas-list');
  const ocCount   = document.getElementById('apt-oc-count');
  const tabBadge  = document.getElementById('tab-apt-badge');
  const btnBadge  = document.getElementById('btn-apt-badge');
  const failed = !result.ok;
  const rows = !failed && Array.isArray(result.data) ? result.data : [];
  if (!failed) await _hydrateApartadoPayments(rows);
  if (loadGeneration !== _apartadosLoadGeneration) return false;
  const empty = rows.length === 0;
  const todayKey = _posMexicoDayKey();

  // Limpiar siempre el estado anterior antes de cualquier early return. Así,
  // liquidar el último apartado no puede hacer reaparecer tarjetas obsoletas.
  _apartadosAll = rows;
  _apartadosData = {};
  [..._apartadosLiquidadosAll, ...rows].forEach(s => { _apartadosData[s.id] = s; });

  // Detectar apartados vencidos
  const vencidos = rows.filter(s => {
    if (!s.due_date) return false;
    return s.due_date < todayKey;
  }).length;

  // Badge del tab mobile — rojo si hay vencidos
  if (tabBadge) {
    tabBadge.textContent = empty ? '' : rows.length;
    tabBadge.style.display = empty ? 'none' : 'flex';
    tabBadge.style.background = vencidos > 0 ? '#E85D5D' : '';
  }

  // Badge del botón en topbar
  if (btnBadge) {
    if (empty) {
      btnBadge.style.display = 'none';
    } else {
      btnBadge.textContent = rows.length;
      btnBadge.style.display = 'flex';
      btnBadge.style.background = vencidos > 0 ? '#E85D5D' : 'var(--gold)';
    }
  }

  // Alerta en topbar — solo si hay vencidos
  const alertBtn = document.getElementById('apt-vencidos-alert');
  const alertCount = document.getElementById('apt-vencidos-count');
  if (alertBtn && alertCount) {
    alertBtn.style.display = vencidos > 0 ? '' : 'none';
    alertCount.textContent = vencidos === 1 ? '1 vencido' : `${vencidos} vencidos`;
  }
  // Banner prominente debajo del topbar
  const banner = document.getElementById('apt-venc-banner');
  const bannerTxt = document.getElementById('apt-venc-banner-txt');
  if (banner && bannerTxt) {
    if (vencidos > 0) {
      bannerTxt.textContent = `${vencidos} apartado${vencidos>1?'s':''} vencido${vencidos>1?'s':''} — requieren atención`;
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  if (failed) {
    const errorHTML = '<div class="history-empty"><div style="font-size:2rem;margin-bottom:8px">⚠️</div>No se pudieron cargar los apartados.<br><button type="button" class="btn btn-outline" style="margin-top:12px" onclick="loadApartados()">Reintentar</button></div>';
    if (_aptViewMode === 'activos' && ocList) ocList.innerHTML = errorHTML;
    const pageList = document.getElementById('apt-page-list');
    if (_aptViewMode === 'activos' && pageList) pageList.innerHTML = errorHTML;
    if (ocCount) ocCount.textContent = 'Error de conexión o migración pendiente';
    return;
  }

  if (empty) {
    const emptyHTML = '<div class="history-empty"><div style="font-size:2rem;margin-bottom:8px">📌</div>Sin apartados pendientes</div>';
    if (_aptViewMode === 'activos' && ocList) ocList.innerHTML = emptyHTML;
    const pageList = document.getElementById('apt-page-list');
    if (_aptViewMode === 'activos' && pageList) pageList.innerHTML = emptyHTML;
    if (ocCount) ocCount.textContent = '';
    return;
  }

  if (ocCount) ocCount.textContent = `${rows.length} apartado${rows.length !== 1 ? 's' : ''} activo${rows.length !== 1 ? 's' : ''}${vencidos > 0 ? ` · ${vencidos} vencido${vencidos > 1 ? 's' : ''}` : ''}`;

  if (_aptViewMode === 'activos') {
    if (typeof filterApartadosWithDue === 'function') {
      filterApartadosWithDue(document.getElementById('apt-search')?.value || '', 'offcanvas');
      filterApartadosWithDue(document.getElementById('apt-page-search')?.value || '', 'page');
    } else {
      _renderApartadoCards(rows, false);
      _renderAptPageCards(rows, false);
    }
  }
}

function _renderApartadoCards(data, isLiquidado) {
  const ocList  = document.getElementById('apt-offcanvas-list');
  const ocTitle = document.getElementById('apt-oc-title');
  const ocCount = document.getElementById('apt-oc-count');
  if (!ocList) return;
  // El conteo de "activos" (con vencidos) ya lo arma loadApartados() con más detalle —
  // aquí solo se toca cuando se muestra la vista de liquidados, para no pisarlo
  if (isLiquidado) {
    if (ocTitle) ocTitle.textContent = '✅ Apartados liquidados';
    if (ocCount) ocCount.textContent = data.length ? `${data.length} liquidado${data.length !== 1 ? 's' : ''}` : '';
  } else if (ocTitle) {
    ocTitle.textContent = '📌 Apartados pendientes';
  }
  if (!data.length) {
    ocList.innerHTML = `<div class="history-empty" style="grid-column:1/-1"><div style="font-size:2rem;margin-bottom:8px">${isLiquidado ? '✅' : '🔍'}</div>Sin ${isLiquidado ? 'apartados liquidados' : 'resultados'}</div>`;
    return;
  }
  const itemsHTML = data.map(s => {
    const total     = parseFloat(s.total) || 0;
    const pagado    = parseFloat(s.paid_amount || 0);
    const pendiente = Math.max(0, total - pagado);
    const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
    const cardDate  = isLiquidado ? (s.liquidated_at || s.last_payment_at || s.created_at) : s.created_at;
    const t         = _posFormatTimestamp(cardDate, {day:'numeric',month:'short'});
    const nItems    = Array.isArray(s.items) ? s.items.length : 0;
    const custParts = (s.customer || '').split(' · 📱 ');
    const nombre    = custParts[0] || 'Sin nombre';
    const telNum    = custParts[1] || '';

    // Fecha de vencimiento — sin sentido para un apartado ya liquidado
    let dueColor = '', dueText = '', dueHTML = '';
    if (s.due_date && !isLiquidado) {
      const diff = _posDayKeyDiff(s.due_date);
      dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
      dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)}d` : diff === 0 ? 'Vence hoy' : `Vence ${_posFormatDayKey(s.due_date,{day:'numeric',month:'short'})}`;
      dueHTML  = `<span class="apt-h-due" style="color:${dueColor}">📅 ${dueText}</span>`;
    }
    const isOverdue = !isLiquidado && s.due_date && _posDayKeyDiff(s.due_date) < 0;

    const abonos = Array.isArray(s.payment_history) ? s.payment_history
      : Array.isArray(s.abonos) ? s.abonos : [];
    const historyWarning = s.payment_history_error
      ? '<div style="font-size:.72rem;color:var(--red);padding:6px 0">⚠ Historial incompleto; recarga para consultar el libro de pagos.</div>'
      : '';
    const abonosHTML = historyWarning + (abonos.length ? `
<div class="apt-abonos-section-inline">
  <div class="adm-section-title" style="font-size:.65rem;margin-bottom:4px">Pagos realizados</div>
  ${abonos.map(a => {
    const meta = _apartadoPaymentMeta(a);
    return `<div class="apt-abono-row"><span>${meta.dateLabel} · ${meta.icon} ${_esc(meta.method)}</span><span class="apt-abono-amount"${meta.amount < 0 ? ' style="color:var(--red)"' : ''}>${meta.amount < 0 ? '−' : ''}$${Math.abs(meta.amount).toLocaleString('es-MX')}</span></div>`;
  }).join('')}
</div>` : '');

    // Items
    const itemsListHTML = nItems ? s.items.map(i => {
      const prod  = products.find(x => x.id === i.id);
      const img   = _driveSz(prod?.image || i.image || '', 80);
      const qty   = i.qty || 1;
      const sub   = i.subtotal ?? i.price * qty;
      const priceLabel = qty > 1
        ? `<span class="apt-item-price">$${sub.toLocaleString('es-MX')}</span><span class="apt-item-qty">$${i.price.toLocaleString('es-MX')} ×${qty}</span>`
        : `<span class="apt-item-price">$${sub.toLocaleString('es-MX')}</span>`;
      return `<div class="apt-item-row" onclick="event.stopPropagation();_aptItemPopup(${i.id},this)">
        <img class="apt-item-thumb" src="${img}" onerror="this.style.visibility='hidden'" alt="">
        <div class="apt-item-info"><div class="apt-item-name">${_esc(i.name)}</div></div>
        <div class="apt-item-right">${priceLabel}</div>
      </div>`;
    }).join('') : '';

    const disc = parseFloat(s.discount) || 0;

    return `
<div class="apartado-item${isOverdue ? ' apt-overdue' : ''}">
  <div class="apt-header" role="button" tabindex="0" aria-expanded="false" aria-label="Ver detalle del apartado de ${_esc(nombre)}" onclick="_toggleApt(this.parentElement,${s.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_toggleApt(this.parentElement,${s.id})}">
    <div class="apt-header-r1">
      <span class="apt-h-name">👤 ${_esc(nombre)}</span>
      <div class="apt-h-right">
        <span class="apt-h-pending${pendiente===0?' zero':''}">${pendiente===0?(isLiquidado?'✓ Liquidado':'✓ Pagado'):'Falta $'+pendiente.toLocaleString('es-MX')}</span>
        <span class="apt-chevron">›</span>
      </div>
    </div>
    <div class="apt-header-r2">
      <span class="apt-h-meta">${t} · ${nItems} prod.${telNum ? ' · '+telNum : ''}</span>
      ${dueHTML}
    </div>
    <div class="apt-mini-bar" role="progressbar" aria-label="Progreso de pago" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="apt-mini-fill" style="width:${pct}%"></div></div>
  </div>
  <div class="apt-body">
    ${isOverdue ? '<div class="apt-overdue-badge">⚠️ Vencido</div>' : ''}
    <div class="apt-items-list">${itemsListHTML}</div>
    <div class="apt-summary">
      ${disc > 0 ? `<div class="apt-sum-row"><span>Subtotal</span><span>$${(total+disc).toLocaleString('es-MX')}</span></div><div class="apt-sum-row apt-sum-disc"><span>🏷 Descuento</span><span>−$${disc.toLocaleString('es-MX')}</span></div>` : ''}
      <div class="apt-sum-row apt-sum-total"><span>Total</span><span>$${total.toLocaleString('es-MX')}</span></div>
    </div>
    <div class="apt-progress-section">
      <div class="apt-progress-track" role="progressbar" aria-label="Progreso de pago" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="apt-progress-fill" style="width:${pct}%"></div></div>
      <div class="apt-amounts-row">
        <span class="apt-paid-lbl">✓ Pagado $${pagado.toLocaleString('es-MX')}</span>
        <span class="apt-pending-lbl">${pendiente > 0 ? 'Falta $' + pendiente.toLocaleString('es-MX') : '✓ Liquidado'}</span>
      </div>
    </div>
    ${abonosHTML}
    <div class="apt-btns">
      <button class="btn-wa-reminder" onclick="event.stopPropagation();sendApartadoReminder(${s.id})" title="${isLiquidado ? 'Enviar confirmación por WhatsApp' : 'Enviar recordatorio por WhatsApp'}" aria-label="${isLiquidado ? 'Enviar confirmación por WhatsApp' : 'Enviar recordatorio por WhatsApp'}">💬</button>
      ${(isLiquidado || pendiente <= _APT_MONEY_EPSILON) ? `<span style="flex:1;text-align:center;font-size:.82rem;font-weight:700;color:var(--green)">✓ Liquidado</span>` : `
      ${canEditApartado() ? `<button class="btn-wa-reminder" onclick="event.stopPropagation();openEditApartado(${s.id})" title="Editar" style="background:#F7F2EB;color:var(--charcoal);border:1.5px solid var(--border)">✏️</button>` : ''}
      <button class="btn-abonar" onclick="event.stopPropagation();abonarApartado('${s.id}','${total}','${pagado}','${_esc(nombre).replace(/'/g,"\\'")}')">Registrar abono</button>
      <button class="btn-liquidar" onclick="event.stopPropagation();openLiqModal(${s.id})">Cobrar saldo $${pendiente.toLocaleString('es-MX')}</button>
      ${canCancelApartado() ? `<button class="btn-cancelar-apt" onclick="event.stopPropagation();cancelApartado(${s.id})" title="Cancelar apartado">✕</button>` : ''}`}
    </div>
  </div>
</div>`;
  }).join('');
  ocList.innerHTML = itemsHTML;
}

/* ── APARTADO TOGGLE ── */
function _toggleApt(el, id) {
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('#apt-offcanvas-list .apartado-item.open').forEach(c => {
    c.classList.remove('open');
    c.querySelector('.apt-header')?.setAttribute('aria-expanded', 'false');
  });
  if (!isOpen) {
    el.classList.add('open');
    el.querySelector('.apt-header')?.setAttribute('aria-expanded', 'true');
  }
}

/* ── HISTORIAL TOGGLE ── */
function _toggleAbonos(titleEl) {
  const body   = titleEl.nextElementSibling;
  const arrow  = titleEl.querySelector('.apt-abonos-toggle');
  const open   = body.style.maxHeight !== '0px' && body.style.maxHeight !== '0';
  body.style.maxHeight  = open ? '0' : body.scrollHeight + 'px';
  arrow.style.transform = open ? '' : 'rotate(180deg)';
}

/* ── POPUP IMAGEN PRODUCTO EN APARTADO ── */
function _aptItemPopup(productId, triggerEl) {
  const prod = products.find(x => x.id === productId);
  if (!prod?.image) return;
  const img = document.createElement('img');
  img.src = _driveSz(prod.image, 80);
  img.dataset.name = prod.name;
  img.dataset.price = prod.price;
  img.dataset.qty = 1;
  openLightbox(img);
}

/* ── RECORDATORIO WA APARTADO ───────────────────────────────────────── */
function sendApartadoReminder(id) {
  const s = _apartadosData[id];
  if (!s) return;
  const custParts = (s.customer || '').split(' · 📱 ');
  const nombre    = custParts[0] || 'clienta';
  const telRaw    = custParts[1] || '';
  const total     = parseFloat(s.total) || 0;
  const pagado    = parseFloat(s.paid_amount || 0);
  const pendiente = Math.max(0, total - pagado);
  const productos = Array.isArray(s.items) ? s.items.map(i => `• ${i.name}`).join('\n') : '';
  const liquidado = _isApartadoLiquidado(s);
  let fechaTexto  = '';
  if (s.due_date) {
    const dias = _posDayKeyDiff(s.due_date);
    const label = _posFormatDayKey(s.due_date, { weekday:'long', day:'numeric', month:'long' });
    fechaTexto = dias < 0
      ? `⚠️ Tu apartado venció hace ${Math.abs(dias)} día${Math.abs(dias)>1?'s':''}. Por favor contáctanos para arreglar tu pedido.`
      : dias === 0
        ? `📅 Tu apartado *vence hoy*. ¡Pasa a recogerlo cuando puedas!`
        : `📅 Tu apartado vence el *${label}* (en ${dias} día${dias>1?'s':''}).`;
  }
  const msg = liquidado
    ? `Hola *${nombre}* 👋\n\nTe confirmamos que tu apartado de *Tres Encantos* quedó liquidado ✅\n\n*Productos:*\n${productos}\n\n💰 Total pagado: *$${total.toLocaleString('es-MX')} MXN*\n\n¡Gracias por tu compra! 💛`
    : `Hola *${nombre}* 👋\n\nTe escribimos de *Tres Encantos* con un recordatorio de tu apartado 📌\n\n*Productos:*\n${productos}\n\n💰 Anticipo pagado: *$${pagado.toLocaleString('es-MX')}*\n⏳ Pendiente: *$${pendiente.toLocaleString('es-MX')}*\n${fechaTexto}\n\n¡Te esperamos! 🛍`;
  const telLimpio = telRaw.replace(/\D/g, '');
  const url = telLimpio
    ? `https://wa.me/52${telLimpio}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

/* ── ABONAR ─────────────────────────────────────────────────────────── */
let _abonarCtx    = null;
let _abonarMethod = 'efectivo';
let _apartadosData = {}; // id → sale data (para acceder a abonos al abonar)
let _apartadosAll  = []; // lista completa para filtrar sin refetch

function filterApartados(q, target) {
  if (typeof filterApartadosWithDue === 'function') {
    if (!target) {
      filterApartadosWithDue(q, 'offcanvas');
      filterApartadosWithDue(q, 'page');
    } else {
      filterApartadosWithDue(q, target === 'page' ? 'page' : 'offcanvas');
    }
    return;
  }
  // target: 'page' | 'offcanvas' | undefined (= both)
  // Filtra sobre la lista de la vista activa (Activos o Liquidados) — antes siempre
  // buscaba en _apartadosAll aunque estuvieras viendo Liquidados, y no encontraba nada
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const isLiq  = _aptViewMode === 'liquidados';
  const source = isLiq ? _apartadosLiquidadosAll : _apartadosAll;
  const filtered = q.trim()
    ? (source||[]).filter(s => norm(s.customer).includes(norm(q)))
    : (source||[]);
  if (!target || target === 'offcanvas') {
    const clearBtn = document.getElementById('apt-search-clear');
    if (clearBtn) clearBtn.style.display = q.trim() ? '' : 'none';
    _renderApartadoCards(filtered, isLiq);
  }
  if (!target || target === 'page') {
    const clearBtn = document.getElementById('apt-page-search-clear');
    if (clearBtn) clearBtn.style.display = q.trim() ? '' : 'none';
    _renderAptPageCards(filtered, isLiq);
  }
}

function clearAptSearch() {
  if (typeof clearAptSearchWithDue === 'function') {
    clearAptSearchWithDue('offcanvas');
    return;
  }
  const el = document.getElementById('apt-search');
  if (el) { el.value = ''; el.focus(); }
  document.getElementById('apt-search-clear').style.display = 'none';
  const isLiq = _aptViewMode === 'liquidados';
  _renderApartadoCards(isLiq ? _apartadosLiquidadosAll : _apartadosAll, isLiq);
}

function abonarApartado(id, total, pagado, nombre) {
  total  = parseFloat(total)  || 0;
  pagado = parseFloat(pagado) || 0;
  const sale = _apartadosData[id];
  _abonarCtx = { id, total, pagado, pendiente: Math.max(0, total - pagado), nombre, version: sale?.version ?? 0 };
  _abonarMethod = 'efectivo';
  document.getElementById('abonar-info').textContent =
    `${nombre} · Pendiente $${(total - pagado).toLocaleString('es-MX')}`;
  document.getElementById('abonar-amount').value = '';
  const pendienteAmt = total - pagado;
  const hint = document.getElementById('abonar-max-hint');
  if (hint) hint.textContent = `Máx: $${pendienteAmt.toLocaleString('es-MX')}`;
  document.getElementById('abpay-efectivo').classList.add('active');
  document.getElementById('abpay-transferencia').classList.remove('active');
  document.getElementById('abonar-confirm-btn').disabled = true;
  document.getElementById('abonar-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('abonar-amount').focus(), 100);
}

function setAbonarMethod(m) {
  _abonarMethod = m;
  document.getElementById('abpay-efectivo').classList.toggle('active', m === 'efectivo');
  document.getElementById('abpay-transferencia').classList.toggle('active', m === 'transferencia');
}

function validateAbonarAmount() {
  const val  = parseFloat(document.getElementById('abonar-amount').value) || 0;
  const btn  = document.getElementById('abonar-confirm-btn');
  const hint = document.getElementById('abonar-max-hint');
  const over = _abonarCtx && val > _abonarCtx.pendiente + _APT_MONEY_EPSILON;
  const valid = val > 0 && _abonarCtx && !over;
  btn.disabled = !valid;
  document.getElementById('abonar-amount').style.borderColor = val > 0 && !valid ? 'var(--red)' : '';
  if (hint) hint.style.color = over ? 'var(--red)' : 'var(--muted)';
}

function closeAbonarModal() {
  document.getElementById('abonar-overlay').style.display = 'none';
  _abonarCtx = null;
}

async function confirmAbonar() {
  if (!_abonarCtx) return;
  let monto = Math.round((parseFloat(document.getElementById('abonar-amount').value) || 0) * 100) / 100;
  if (monto <= 0 || monto > _abonarCtx.pendiente + _APT_MONEY_EPSILON) return;
  if (monto >= _abonarCtx.pendiente - _APT_MONEY_EPSILON) monto = _abonarCtx.pendiente;
  const expectedFinal = _abonarCtx.pagado + monto >= _abonarCtx.total - _APT_MONEY_EPSILON;
  const btn = document.getElementById('abonar-confirm-btn');
  btn.disabled = true; btn.textContent = 'Registrando…';
  const r = await posRpc('record_apartado_payment_atomic', {
    operation: 'apartado_payment',
    context: _abonarCtx.id,
    fingerprint: `${_abonarCtx.id}:${_abonarCtx.version}:${monto}:${_abonarMethod}`,
    body: {
      p_sale_id: _abonarCtx.id,
      p_expected_version: _abonarCtx.version,
      p_method: _abonarMethod,
      p_amount: monto
    }
  });
  if (!r.ok) {
    toast(_posRpcError(r, 'Error al registrar abono'), 'error');
    btn.disabled = false; btn.textContent = 'Confirmar abono';
    if (r.resolvedPrior || r.staleConflict) {
      closeAbonarModal();
      await _refreshPosFinancialState();
    }
    else if (!r.ambiguous && !r.pendingConflict) loadApartados();
    return;
  }
  const amountReceived = _aptMoney(r.data?.payment?.amount ?? monto);
  const isFinal = _isApartadoLiquidado(r.data?.sale) || expectedFinal;
  closeAbonarModal();
  toast(isFinal
    ? `Apartado liquidado ✓ — $${amountReceived.toLocaleString('es-MX')} recibido`
    : `Abono de $${amountReceived.toLocaleString('es-MX')} registrado ✓`, 'success');
  await _refreshPosFinancialState();
}

/* ── EDITAR APARTADO ────────────────────────────────────────────────── */
let _editAptCtx = null;

function openEditApartado(id) {
  const sale = _apartadosData[id];
  if (!sale) return;
  if (sale.status && sale.status !== 'activo') {
    toast('Este apartado ya no está activo. Actualiza la lista.', 'error');
    loadApartados();
    return;
  }
  _editAptCtx = { id, sale, items: (sale.items || []).map(i => ({ ...i })) };
  const nombre = (sale.customer || '').split(' · 📱 ')[0] || 'Cliente';
  document.getElementById('edit-apt-info').textContent = `${nombre} · Total $${parseFloat(sale.total||0).toLocaleString('es-MX')} MXN`;
  document.getElementById('edit-apt-search').value = '';
  document.getElementById('edit-apt-search-results').style.display = 'none';
  // Mostrar fila de anticipo si hay algo pagado
  const pagado = parseFloat(sale.paid_amount || 0);
  const pagadoRow = document.getElementById('edit-apt-pagado-row');
  const pagadoAmt = document.getElementById('edit-apt-pagado-amt');
  if (pagado > 0 && pagadoRow) {
    pagadoRow.style.display = 'flex';
    if (pagadoAmt) pagadoAmt.textContent = `$${pagado.toLocaleString('es-MX')} MXN`;
    const refundBtn = document.getElementById('edit-apt-refund-btn');
    if (refundBtn) { refundBtn.disabled = false; refundBtn.textContent = 'Reembolsar'; }
  } else if (pagadoRow) {
    pagadoRow.style.display = 'none';
  }
  renderEditAptItems();
  document.getElementById('edit-apt-overlay').style.display = 'flex';
}

async function _editAptAnularPago() {
  if (!_editAptCtx) return;
  return refundApartado(_editAptCtx.id, 'edit');
}

async function refundApartado(id, source = 'detail') {
  const sale = _apartadosData[id] || (source === 'edit' ? _editAptCtx?.sale : null);
  if (!sale) { toast('Apartado no encontrado', 'error'); return; }
  const pagado = _aptMoney(sale.paid_amount);
  if (pagado <= 0) return;
  const wasLiquidated = _isApartadoLiquidado(sale);
  const consequence = wasLiquidated
    ? 'El apartado volverá a Activos y el inventario seguirá reservado.'
    : 'El apartado seguirá activo y el inventario continuará reservado.';
  if (!confirm(`¿Registrar la devolución de $${pagado.toLocaleString('es-MX')} MXN?\n\n${consequence}\nSe conservará el historial y la devolución se descontará de la caja de hoy por los mismos métodos usados al cobrar. Esta acción no se puede deshacer.`)) return;
  const btn = document.getElementById(source === 'edit' ? 'edit-apt-refund-btn' : 'adm-refund-btn');
  const originalText = btn?.textContent || 'Reembolsar';
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }
  const r = await posRpc('refund_apartado_atomic', {
    operation: 'apartado_refund',
    context: id,
    fingerprint: `${id}:${sale.version ?? 0}:${pagado}`,
    body: {
      p_sale_id: id,
      p_expected_version: sale.version ?? 0,
      p_reason: wasLiquidated ? 'Pago revertido; apartado reabierto desde Caja' : 'Devolución total registrada desde edición de apartado'
    }
  });
  if (!r.ok) {
    toast(_posRpcError(r, 'No se pudo registrar la devolución'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
    if (r.resolvedPrior || r.staleConflict) {
      if (source === 'edit') closeEditApt();
      else closeAptDetail();
      await _refreshPosFinancialState();
    }
    return;
  }
  if (source === 'edit') closeEditApt();
  else closeAptDetail();
  await _refreshPosFinancialState();
  const refunded = _aptMoney(r.data?.refund_amount || pagado);
  toast(`${wasLiquidated ? 'Apartado reabierto' : 'Devolución registrada'} — $${refunded.toLocaleString('es-MX')} devueltos ✓`, 'success');
}

function closeEditApt() {
  document.getElementById('edit-apt-overlay').style.display = 'none';
  _editAptCtx = null;
}

function renderEditAptItems() {
  const el = document.getElementById('edit-apt-items');
  if (!_editAptCtx.items.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:.82rem;padding:12px 0;border:1.5px dashed var(--border);border-radius:9px">Sin productos — agrega uno con el buscador</div>';
    _updateEditAptTotal();
    return;
  }
  el.innerHTML = _editAptCtx.items.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #F0E8DC">
      <div style="flex:1;min-width:0">
        <div style="font-size:.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(item.name)}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:5px">
          <span style="font-size:.75rem;color:var(--muted)">$</span>
          <input type="number" value="${item.price}" min="0" step="1" inputmode="numeric"
            style="width:72px;padding:4px 6px;border:1.5px solid var(--border);border-radius:7px;font-size:.84rem;outline:none;font-family:inherit"
            oninput="_editAptChangePrice(${idx},this.value)"
            onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
          <span style="font-size:.74rem;color:var(--muted);margin-left:2px">c/u</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <button onclick="_editAptChangeQty(${idx},-1)" aria-label="Quitar una unidad de ${_esc(item.name)}" style="width:44px;height:44px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-size:.95rem;line-height:1;font-family:inherit">−</button>
        <span style="font-size:.9rem;font-weight:700;min-width:22px;text-align:center">${item.qty||1}</span>
        <button onclick="_editAptChangeQty(${idx},1)" aria-label="Agregar una unidad de ${_esc(item.name)}" style="width:44px;height:44px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-size:.95rem;line-height:1;font-family:inherit">+</button>
      </div>
      <button onclick="_editAptRemove(${idx})" aria-label="Quitar ${_esc(item.name)} del apartado" style="width:44px;height:44px;background:none;border:none;cursor:pointer;color:var(--red);font-size:1.1rem;padding:4px;line-height:1;flex-shrink:0">✕</button>
    </div>`).join('');
  _updateEditAptTotal();
}

function _editAptChangePrice(idx, val) {
  const item = _editAptCtx.items[idx];
  item.price = parseFloat(val) || 0;
  item.subtotal = item.price * (item.qty || 1);
  _updateEditAptTotal();
}

function _editAptChangeQty(idx, delta) {
  const item = _editAptCtx.items[idx];
  if (delta > 0 && !_editAptCanAdd(item.id)) {
    toast('No hay más existencias disponibles para agregar', 'error');
    return;
  }
  item.qty = Math.max(1, (item.qty || 1) + delta);
  item.subtotal = item.price * item.qty;
  renderEditAptItems();
}

function _editAptRemove(idx) {
  _editAptCtx.items.splice(idx, 1);
  renderEditAptItems();
}

function _updateEditAptTotal() {
  const subtotal = _aptMoney(_editAptCtx.items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0));
  const discount = _aptMoney(_editAptCtx.sale.discount);
  const total = _aptMoney(subtotal - discount);
  const el = document.getElementById('edit-apt-total');
  if (!el) return;
  el.innerHTML = discount > 0
    ? `<div style="font-family:inherit;font-size:.74rem;font-weight:500;color:var(--muted)">Subtotal $${subtotal.toLocaleString('es-MX')} · Descuento −$${discount.toLocaleString('es-MX')}</div><div>Total $${total.toLocaleString('es-MX')} MXN</div>`
    : `Total $${total.toLocaleString('es-MX')} MXN`;
}

function _editAptCanAdd(productId) {
  if (!_editAptCtx) return false;
  const p = products.find(x => x.id === productId);
  if (!p) return false;
  const originalItem = (_editAptCtx.sale.items || []).find(i => i.id === productId);
  const originalQty = originalItem?.qty || 0;
  const currentQty = _editAptCtx.items.find(i => i.id === productId)?.qty || 0;
  const snapshot = originalItem && Object.prototype.hasOwnProperty.call(originalItem, 'kit_items')
    ? originalItem.kit_items : p.kitItems;
  let available;
  if (Array.isArray(snapshot) && snapshot.length) {
    available = snapshot.reduce((min, component) => {
      const currentComponent = products.find(item => item.id === component.id);
      const perKit = Math.max(1, parseInt(component.qty, 10) || 1);
      const componentStock = Math.max(0, parseInt(currentComponent?.stock, 10) || 0);
      return Math.min(min, Math.floor(componentStock / perKit));
    }, Infinity);
    if (!Number.isFinite(available)) available = 0;
  } else {
    available = Math.max(0, parseInt(p.stock, 10) || 0);
  }
  return currentQty < originalQty + available;
}

function searchEditApt(q) {
  const res = document.getElementById('edit-apt-search-results');
  if (!q.trim()) { res.style.display = 'none'; return; }
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase())
  ).sort((a, b) => {
    const aOos = !_editAptCanAdd(a.id);
    const bOos = !_editAptCanAdd(b.id);
    return aOos - bOos;
  }).slice(0, 7);
  if (!matches.length) { res.style.display = 'none'; return; }
  res.style.display = 'block';
  res.innerHTML = matches.map(p => {
    const oos = !_editAptCanAdd(p.id);
    return `<button type="button" ${oos ? 'disabled' : `onclick="_editAptAddProduct(${p.id})"`} aria-disabled="${oos}" style="width:100%;cursor:${oos?'not-allowed':'pointer'};padding:8px 10px;display:flex;align-items:center;gap:8px;font-size:.82rem;border:0;border-bottom:1px solid var(--border);background:#fff;text-align:left;font-family:inherit;${oos?'opacity:.65':''}">
      <img src="${_driveSz(p.image, 80)}" style="width:28px;height:28px;object-fit:cover;border-radius:5px;flex-shrink:0" onerror="this.style.display='none'">
      <span style="flex:1;font-weight:600">${_esc(p.name)}</span>
      <span style="color:${oos?'var(--red)':'var(--muted)'};font-size:.74rem">${oos?'Sin stock':'$'+p.price.toLocaleString('es-MX')}</span>
    </button>`;
  }).join('');
}

function _editAptAddProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!_editAptCanAdd(id)) {
    toast('Producto sin existencias disponibles', 'error');
    return;
  }
  const existing = _editAptCtx.items.find(i => i.id === id);
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    existing.subtotal = existing.price * existing.qty;
  } else {
    _editAptCtx.items.push({
      id: p.id, name: p.name, price: p.price, qty: 1, subtotal: p.price,
      ...(p.kitItems?.length ? { kit_items: p.kitItems.map(c => ({ id:c.id, name:c.name, qty:c.qty || 1 })) } : {})
    });
  }
  document.getElementById('edit-apt-search').value = '';
  document.getElementById('edit-apt-search-results').style.display = 'none';
  renderEditAptItems();
}

async function saveEditApt() {
  if (!_editAptCtx) return;
  if (!_editAptCtx.items.length) { toast('El apartado debe tener al menos un producto', 'error'); return; }
  const { id, sale, items } = _editAptCtx;
  items.forEach(i => {
    i.price = _aptMoney(i.price);
    i.qty = Math.max(1, parseInt(i.qty, 10) || 1);
    i.subtotal = _aptMoney(i.price * i.qty);
  });
  const subtotal = _aptMoney(items.reduce((s, i) => s + i.subtotal, 0));
  const discount = _aptMoney(sale.discount);
  const newTotal = _aptMoney(subtotal - discount);
  const paid = _aptMoney(sale.paid_amount);
  if (newTotal <= 0) {
    toast('El total debe ser mayor a $0. Revisa productos y descuento.', 'error');
    return;
  }
  if (newTotal < paid - _APT_MONEY_EPSILON) {
    toast(`El total no puede quedar debajo de los $${paid.toLocaleString('es-MX')} ya pagados. Registra primero un reembolso.`, 'error');
    return;
  }
  const btn = document.getElementById('edit-apt-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const r = await posRpc('edit_apartado_atomic', {
    operation: 'apartado_edit',
    context: id,
    fingerprint: `${id}:${sale.version ?? 0}:${JSON.stringify(items)}:${discount}`,
    body: {
      p_sale_id: id,
      p_expected_version: sale.version ?? 0,
      p_items: items,
      p_discount: null
    }
  });
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  if (!r.ok) {
    toast(_posRpcError(r, 'Error al guardar cambios'), 'error');
    if (r.resolvedPrior || r.staleConflict) {
      closeEditApt();
      await _refreshPosFinancialState();
    }
    else if (!r.ambiguous && !r.pendingConflict) loadApartados();
    return;
  }
  const quedaLiquidado = _isApartadoLiquidado(r.data?.sale);
  closeEditApt();
  toast(quedaLiquidado ? 'Apartado actualizado y movido a Liquidados ✓' : 'Apartado actualizado ✓', 'success');
  await _refreshPosFinancialState();
}

let _liqCtx = null, _liqMethod = 'efectivo';

function openLiqModal(id) {
  const sale = _apartadosData[id];
  if (!sale) return;
  const total    = parseFloat(sale.total || 0);
  const pagado   = parseFloat(sale.paid_amount || 0);
  const restante = Math.max(0, total - pagado);
  const nombre   = (sale.customer || '').split(' · 📱 ')[0] || 'Cliente';
  _liqCtx    = { id, total, pagado, restante, sale };
  _liqMethod = 'efectivo';
  document.getElementById('liq-info').textContent          = `${nombre} · Total $${total.toLocaleString('es-MX')} MXN`;
  document.getElementById('liq-amount-display').textContent = `$${restante.toLocaleString('es-MX')} MXN`;
  document.getElementById('liq-pay-efectivo').classList.add('active');
  document.getElementById('liq-pay-transf').classList.remove('active');
  document.getElementById('liq-confirm-btn').disabled = false;
  document.getElementById('liq-confirm-btn').textContent = '✓ Liquidar';
  document.getElementById('liquidar-overlay').style.display = 'flex';
}

function setLiqMethod(m) {
  _liqMethod = m;
  document.getElementById('liq-pay-efectivo').classList.toggle('active', m === 'efectivo');
  document.getElementById('liq-pay-transf').classList.toggle('active', m === 'transferencia');
}

function closeLiqModal() {
  document.getElementById('liquidar-overlay').style.display = 'none';
  _liqCtx = null;
}

async function confirmLiquidar() {
  if (!_liqCtx) return;
  const { id, restante, sale } = _liqCtx;
  const alreadyPaid = restante <= _APT_MONEY_EPSILON;
  if (alreadyPaid) {
    // Dato local desfasado (otra caja ya liquidó, o doble tap) — evita mandar
    // p_amount:null al RPC, que rechaza con error de "sin saldo pendiente".
    closeLiqModal();
    toast('Apartado pagado movido a Liquidados ✓', 'success');
    await _refreshPosFinancialState();
    return;
  }
  const method = _liqMethod;
  const btn    = document.getElementById('liq-confirm-btn');
  btn.disabled = true; btn.textContent = 'Liquidando…';
  const r = await posRpc('record_apartado_payment_atomic', {
    operation: 'apartado_payment',
    context: id,
    fingerprint: `${id}:${sale.version ?? 0}:${method}:saldo`,
    body: {
      p_sale_id: id,
      p_expected_version: sale.version ?? 0,
      p_method: method,
      p_amount: null
    }
  });
  btn.disabled = false; btn.textContent = '✓ Liquidar';
  if (!r.ok) {
    toast(_posRpcError(r, 'Error al completar apartado'), 'error');
    if (r.resolvedPrior || r.staleConflict) {
      closeLiqModal();
      await _refreshPosFinancialState();
    }
    else if (!r.ambiguous && !r.pendingConflict) loadApartados();
    return;
  }
  const amountReceived = _aptMoney(r.data?.payment?.amount ?? restante);
  closeLiqModal();
  toast(`Apartado liquidado ✓ — $${amountReceived.toLocaleString('es-MX')} recibido`, 'success');
  await _refreshPosFinancialState();
}
