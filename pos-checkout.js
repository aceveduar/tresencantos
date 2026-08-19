/* ── CHANGE & COBRAR ── */
function updateChange() {
  const isApt = document.getElementById('pos-is-apartado')?.checked;
  const disc  = getDiscount();

  if (!isApt) {
    const total  = getDiscountedTotal();
    const cash   = parseFloat(document.getElementById('pos-cash')?.value) || 0;
    const change = cash - total;
    const showChange = cash > 0 && change >= 0;
    const cashEl = document.getElementById('pos-cash');
    if (cashEl) cashEl.placeholder = total > 0 ? `Mín. $${total.toLocaleString('es-MX')}` : '';
    document.getElementById('pos-change-input').value = showChange ? change.toFixed(2) : '';
    document.getElementById('pos-change-input').style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
  }

  const discEl = document.getElementById('pos-discount-amount');
  if (discEl) discEl.textContent = disc > 0 ? `−$${disc.toLocaleString('es-MX', {maximumFractionDigits:0})}` : '';

  // Total con descuento — evita que el cajero tenga que restar Total − Descuento mentalmente
  // Label consciente del modo: en apartado no se cobra ahora, es el total del pedido
  const totalDiscRow   = document.getElementById('total-discounted-row');
  const totalDiscEl    = document.getElementById('pos-total-discounted');
  const totalDiscLabel = document.getElementById('total-discounted-label');
  if (totalDiscRow && totalDiscEl) {
    if (disc > 0) {
      totalDiscEl.textContent = `$${getDiscountedTotal().toLocaleString('es-MX')}`;
      if (totalDiscLabel) totalDiscLabel.textContent = isApt ? 'Total del pedido' : 'Total a cobrar';
      totalDiscRow.style.display = '';
    } else {
      totalDiscRow.style.display = 'none';
    }
  }

  updateAnticipoInfo();
}

let _cobrandoAhora = false;
async function cobrar() {
  if (!cart.length || _cobrandoAhora) return;
  if (!navigator.onLine) { toast('Sin conexión — no se puede registrar la venta', 'error'); return; }
  _cobrandoAhora = true;
  const isApartado = document.getElementById('pos-is-apartado')?.checked;
  const customerName = document.getElementById(isApartado ? 'pos-apt-customer' : 'pos-customer')?.value.trim() || '';
  const phone        = document.getElementById('pos-phone')?.value.trim() || '';
  const customer     = customerName + (phone ? ` · 📱 ${phone}` : '');
  const note       = document.getElementById('pos-note')?.value.trim() || '';
  const disc       = getDiscount();
  const total      = Math.round(getDiscountedTotal() * 100) / 100;
  if (total <= 0) {
    toast('El total debe ser mayor a $0', 'error');
    _cobrandoAhora = false;
    return;
  }

  let paidAmount, change;

  if (isApartado) {
    if (!customerName) { toast('Ingresa el nombre del cliente', 'error'); document.getElementById('pos-apt-customer')?.focus(); _cobrandoAhora = false; return; }
    paidAmount = Math.round((parseFloat(document.getElementById('pos-anticipo')?.value) || 0) * 100) / 100;
    if (paidAmount > total + _APT_MONEY_EPSILON) { toast('El anticipo no puede ser mayor al total del pedido', 'error'); document.getElementById('pos-anticipo').focus(); _cobrandoAhora = false; return; }
    if (paidAmount >= total - _APT_MONEY_EPSILON) paidAmount = total;
    change = 0;
  } else if (payMethod === 'efectivo') {
    const cash = parseFloat(document.getElementById('pos-cash').value) || 0;
    if (cash > 0 && cash < total) {
      toast(`El efectivo ($${cash.toLocaleString('es-MX')}) no cubre el total ($${total.toLocaleString('es-MX')})`, 'error');
      document.getElementById('pos-cash').focus(); document.getElementById('pos-cash').select();
      _cobrandoAhora = false; return;
    }
    paidAmount = cash || total;
    change = Math.max(0, paidAmount - total);
  } else {
    paidAmount = total; change = 0;
  }
  const apartadoPagadoCompleto = !!isApartado && total > 0 && paidAmount >= total - _APT_MONEY_EPSILON;
  const apartadoActivo = !!isApartado && !apartadoPagadoCompleto;

  const btn = document.getElementById('cobrar-btn');
  btn.setAttribute('data-loading', '1'); btn.disabled = true;

  const items = cart.map(({ product: p, qty, customPrice }) => {
    const pr = Math.round((customPrice ?? p.price) * 100) / 100;
    return {
      id: p.id,
      name: p.name,
      price: pr,
      qty,
      subtotal: Math.round(pr * qty * 100) / 100,
      ...(p.kitItems?.length ? { kit_items: p.kitItems.map(c => ({ id:c.id, name:c.name, qty:c.qty || 1 })) } : {})
    };
  });

  const dueDateEl = document.getElementById('pos-due-date');
  const saleData = {
    total, items,
    discount:        disc || null,
    payment_method:  payMethod,
    note:            note || null,
    type:            apartadoActivo ? 'apartado' : 'venta',
    paid_amount:     paidAmount,
    customer:        customer || null,
    due_date:        apartadoActivo && dueDateEl?.value ? dueDateEl.value : null,
    abonos:          isApartado && paidAmount > 0
                       ? [{ amount: paidAmount, method: payMethod, date: new Date().toISOString() }]
                       : null
  };

  // Una sola llamada idempotente y atómica: valida demanda agregada, guarda
  // snapshot de kits, registra el pago y descuenta stock en una transacción.
  const saleFingerprint = JSON.stringify({ items, total, disc, payMethod, note, isApartado, paidAmount, customer, dueDate: saleData.due_date });
  const rpcResult = await posRpc('record_sale_atomic_v2', {
    operation: 'record_sale',
    context: 'checkout',
    fingerprint: saleFingerprint,
    body: {
      p_items:           saleData.items,
      p_total:           saleData.total,
      p_discount:        saleData.discount || 0,
      p_payment_method:  saleData.payment_method,
      p_note:            saleData.note || null,
      p_is_apartado:     !!isApartado,
      p_paid_amount:     saleData.paid_amount ?? null,
      p_customer:        saleData.customer || null,
      p_due_date:        saleData.due_date || null
    }
  });
  if (!rpcResult.ok) {
    btn.removeAttribute('data-loading'); btn.disabled = false; _cobrandoAhora = false;
    const msg = _posRpcError(rpcResult, 'Error al registrar la venta — intenta de nuevo');
    toast(msg, 'error');
    if (rpcResult.resolvedPrior) await _refreshPosFinancialState();
    return;
  }

  // El RPC devuelve estados absolutos. Aplicarlos evita una doble resta si el
  // evento Realtime llegó antes que la respuesta HTTP.
  (Array.isArray(rpcResult.data?.products) ? rpcResult.data.products : []).forEach(state => {
    const product = products.find(item => item.id === state.id);
    if (!product) return;
    product.stock = parseInt(state.stock, 10) || 0;
    product.outOfStock = !!state.out_of_stock;
  });

  btn.removeAttribute('data-loading');

  // Guardar para el ticket y la confirmación por WhatsApp.
  const dueDateVal = apartadoActivo ? document.getElementById('pos-due-date')?.value : null;

  // La actividad y el libro de pagos quedaron registrados dentro del mismo RPC.
  _lastSale = { total, paidAmount, change, disc, note, items, payMethod,
    isApartado: apartadoActivo, apartadoLiquidado: apartadoPagadoCompleto,
    customer, dueDate: dueDateVal };

  // Reset UI
  cart = [];
  ['pos-cash','pos-discount','pos-note'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.getElementById('pos-is-apartado').checked = false;
  toggleApartadoMode(); // limpia phone/anticipo/pendiente/fecha/cliente-apartado y cierra el sheet
  clearNoteField();
  clearCustomerField();
  clearDiscountField();
  renderCart(); updateChange();
  document.getElementById('pos-search').value = '';
  showAllProducts();
  loadTodayStats(); loadHistory(); loadApartados();

  _cobrandoAhora = false;
  showSaleDone();
}

function showSaleDone() {
  // Bloquear Escape mientras el modal esté abierto
  const _escGuard = e => { if (e.key === 'Escape') e.stopImmediatePropagation(); };
  document.addEventListener('keydown', _escGuard, true);
  document.getElementById('sale-done-overlay')._escGuard = _escGuard;
  const s = _lastSale;
  const fmt = n => `$${parseFloat(n||0).toLocaleString('es-MX')} MXN`;
  const isApt = s.isApartado;
  const isAptFlow = isApt || s.apartadoLiquidado;

  document.getElementById('sd-icon').textContent         = isAptFlow ? '📌' : '✓';
  document.getElementById('sd-title').textContent        = isApt ? 'Apartado registrado' : s.apartadoLiquidado ? 'Apartado liquidado' : 'Venta completada';
  document.getElementById('sd-total-label').textContent  = isAptFlow ? 'Total del pedido' : 'Total cobrado';
  document.getElementById('sd-cash-label').textContent   = isApt ? 'Anticipo recibido' : s.apartadoLiquidado ? 'Pago completo recibido' : 'Recibido';
  document.getElementById('sd-total').textContent        = fmt(s.total);
  document.getElementById('sd-cash').textContent         = s.paidAmount > 0 ? fmt(s.paidAmount) : '—';
  document.getElementById('sd-change').textContent       = s.change > 0 ? fmt(s.change) : s.payMethod === 'transferencia' ? '—' : '$0';
  document.getElementById('sd-method').textContent       = s.payMethod === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo';

  const pendiente = Math.max(0, (s.total || 0) - (s.paidAmount || 0));
  document.getElementById('sd-pending-row').style.display  = isApt ? '' : 'none';
  document.getElementById('sd-pending').textContent         = fmt(pendiente);
  document.getElementById('sd-change-row').style.display   = isApt ? 'none' : '';

  const dueRow = document.getElementById('sd-due-row');
  if (dueRow) {
    dueRow.style.display = (isApt && s.dueDate) ? '' : 'none';
    if (isApt && s.dueDate) {
      const due = new Date(s.dueDate + 'T00:00:00');
      document.getElementById('sd-due').textContent = due.toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
    }
  }
  document.getElementById('sd-customer-row').style.display = s.customer ? '' : 'none';
  document.getElementById('sd-customer').textContent       = (s.customer||'').split(' · 📱 ')[0];

  const transAlert = document.getElementById('sd-transfer-alert');
  if (transAlert) transAlert.style.display = (!isApt && s.payMethod === 'transferencia') ? '' : 'none';
  document.getElementById('sd-discount-row').style.display = s.disc > 0 ? '' : 'none';
  document.getElementById('sd-discount').textContent       = `−${fmt(s.disc)}`;
  document.getElementById('sd-note-row').style.display     = s.note ? '' : 'none';
  document.getElementById('sd-note').textContent           = s.note || '';
  // Texto del botón WA y "Nueva venta" según contexto
  const waBtn = document.querySelector('.btn-wa-ticket');
  if (waBtn) waBtn.childNodes[waBtn.childNodes.length - 1].textContent = isAptFlow ? ' Enviar confirmación por WhatsApp' : ' Enviar ticket por WhatsApp';
  const newSaleBtn = document.querySelector('#sale-done-overlay .btn-green');
  if (newSaleBtn) newSaleBtn.textContent = isApt ? '+ Nueva venta' : '+ Nueva venta';
  document.getElementById('sale-done-overlay').classList.add('open');
}

function sendWhatsAppTicket() {
  const s = _lastSale;
  if (!s?.items?.length) return;
  const lines    = s.items.map(i => {
    const prod = products.find(p => p.id === i.id);
    const imgUrl = prod?.image && !prod.image.startsWith('data:') ? `\n  🖼 ${prod.image}` : '';
    return `• ${i.name} x${i.qty} — $${(i.subtotal||0).toLocaleString('es-MX')}${imgUrl}`;
  }).join('\n');
  const disc     = s.disc > 0 ? `\n🏷 Descuento: −$${s.disc.toLocaleString('es-MX')}` : '';
  const note     = s.note ? `\n📝 ${s.note}` : '';
  const metodo   = s.payMethod === 'transferencia' ? '📱 Transferencia bancaria' : '💵 Efectivo';
  let msg;
  if (s.isApartado || s.apartadoLiquidado) {
    const custParts = (s.customer||'').split(' · 📱 ');
    const nombre    = custParts[0] || 'Cliente';
    const telNum    = custParts[1] || '';
    const pendiente = Math.max(0, (s.total||0) - (s.paidAmount||0));
    const anticipoLine = s.apartadoLiquidado
      ? `✅ *Pago completo recibido: $${(s.total||0).toLocaleString('es-MX')} MXN* (${metodo})`
      : (s.paidAmount||0) > 0
      ? `✅ Anticipo recibido: $${(s.paidAmount||0).toLocaleString('es-MX')} (${metodo})\n⏳ *Pendiente: $${pendiente.toLocaleString('es-MX')} MXN*`
      : `⏳ *Total a pagar al entregar: $${pendiente.toLocaleString('es-MX')} MXN*`;
    let dueLine = '';
    if (s.dueDate) {
      const due = new Date(s.dueDate + 'T00:00:00');
      dueLine = `\n📅 Fecha límite: *${due.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'})}*`;
    }
    const title = s.apartadoLiquidado ? 'Apartado liquidado' : 'Apartado';
    const closing = s.apartadoLiquidado ? 'Tu apartado quedó pagado por completo. ¡Gracias! 💛' : 'Te avisamos cuando esté listo. ¡Gracias! 💛';
    msg = `📌 *${title} — Tres Encantos*\n━━━━━━━━━━━━━━\n👤 ${nombre}\n${lines}${disc}\n━━━━━━━━━━━━━━\n*Total pedido: $${(s.total||0).toLocaleString('es-MX')} MXN*\n${anticipoLine}${dueLine}${note}\n\n${closing}`;
    const telLimpio = telNum.replace(/\D/g,'');
    window.open(telLimpio ? `https://wa.me/52${telLimpio}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    setTimeout(() => closeSaleDone(), 400);
    return;
  } else {
    const nombre   = (s.customer||'').split(' · 📱 ')[0] || '';
    const chng     = s.change > 0 ? `\n💵 Cambio: $${s.change.toLocaleString('es-MX')}` : '';
    const transAviso = s.payMethod === 'transferencia' ? `\n\n⚠️ _Pendiente confirmar recibo de transferencia_` : '';
    const saludo   = nombre ? `¡Gracias por tu compra, ${nombre}! 💛` : '¡Gracias por tu compra! 💛';
    msg = `🛍 *Tres Encantos*\n━━━━━━━━━━━━━━\n${lines}${disc}\n━━━━━━━━━━━━━━\n*Total: $${(s.total||0).toLocaleString('es-MX')} MXN*\n${metodo}${chng}${note}${transAviso}\n\n${saludo}`;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  setTimeout(() => closeSaleDone(), 400);
}

function closeSaleDone() {
  const overlay = document.getElementById('sale-done-overlay');
  if (overlay._escGuard) {
    document.removeEventListener('keydown', overlay._escGuard, true);
    delete overlay._escGuard;
  }
  overlay.classList.remove('open');
  document.getElementById('pos-search').focus();
}

/* ── SCANNER ── */
let _posScanner = null;
let _posQuaggaActive = false;
let _posScanCooldown = false;

function _loadQuaggaPos() {
  return new Promise((resolve, reject) => {
    if (window.Quagga) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@ericblade/quagga2/dist/quagga.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function _loadHtml5QrcodePos() {
  return new Promise((resolve, reject) => {
    if (typeof Html5Qrcode !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function _posHandleCode(code) {
  if (_posScanCooldown) return;
  const p = products.find(x => x.barcode === code);
  if (p) {
    closePosScanner();
    addToCart(p.id);
    document.getElementById('pos-search').value = '';
    searchProducts('');
  } else {
    _posBarcodeNotFound(code);
  }
}

async function openPosScanner() {
  const statusEl = document.getElementById('pos-scan-status');
  statusEl.textContent = 'Iniciando cámara...';
  statusEl.style.color = '';
  _posScanCooldown = false;
  document.getElementById('pos-scanner-overlay').classList.add('open');

  if (_posScanner) { _posScanner.clear().catch(() => {}); _posScanner = null; }
  try { await _loadHtml5QrcodePos(); } catch(e) {
    statusEl.textContent = 'No se pudo cargar el escáner.'; return;
  }
  const barcodeFormats = [
    Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,   Html5QrcodeSupportedFormats.QR_CODE,
  ];
  _posScanner = new Html5Qrcode('pos-reader', { formatsToSupport: barcodeFormats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
  _posScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 260, height: 100 } },
    (code) => _posHandleCode(code),
    () => {}
  ).then(() => {
    statusEl.textContent = 'Apunta al código de barras del producto';
  }).catch(() => {
    statusEl.textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
  });
}

function closePosScanner() {
  if (_posScanner) { _posScanner.stop().catch(() => {}); _posScanner = null; }
  document.getElementById('pos-scanner-overlay').classList.remove('open');
}

// Código no reconocido: deja la cámara activa para reintentar de inmediato
function _posBarcodeNotFound(code) {
  _posScanCooldown = true;
  const statusEl = document.getElementById('pos-scan-status');
  statusEl.textContent = `Código "${code}" no encontrado`;
  statusEl.style.color = 'var(--red)';
  toast(`Código "${code}" — no está registrado en el catálogo`, 'error');
  setTimeout(() => {
    _posScanCooldown = false;
    if (!document.getElementById('pos-scanner-overlay').classList.contains('open')) return;
    statusEl.textContent = 'Apunta al código de barras del producto';
    statusEl.style.color = '';
  }, 1500);
}

/* ── TOAST ── */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), type === 'error' ? 4000 : 2500);
}

/* ── TODAY'S STATS ── */
let _todayStatsLoadGeneration = 0;

async function loadTodayStats() {
  const loadGeneration = ++_todayStatsLoadGeneration;
  const TZ = 'America/Mexico_City';
  const mxDateKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso));
  const hoyMX  = mxDateKey(new Date().toISOString());
  // Ciudad de México permanece en UTC−06:00; consultar el libro por fecha del
  // movimiento incluye abonos de apartados antiguos y devoluciones de hoy.
  const start = new Date(`${hoyMX}T00:00:00-06:00`);
  const end   = new Date(start.getTime() + 86400000);
  const result = await _posFetchAll(`sale_payments?paid_at=gte.${encodeURIComponent(start.toISOString())}&paid_at=lt.${encodeURIComponent(end.toISOString())}&select=amount,method&order=paid_at.asc,id.asc`);
  if (loadGeneration !== _todayStatsLoadGeneration) return false;
  const mob    = document.getElementById('daily-summary-mobile');
  if (!result.ok) {
    if (mob) {
      mob.innerHTML = '<span style="color:var(--red);font-weight:600">No se pudo cargar el resumen de hoy</span>';
      mob.style.display = 'flex';
    }
    return false;
  }
  if (!result.data?.length) {
    if (mob) { mob.style.display = 'none'; mob.innerHTML = ''; }
    return true;
  }

  let efectivo = 0, transferencia = 0, otros = 0;
  result.data.forEach(payment => {
    const amount = parseFloat(payment.amount) || 0;
    if (payment.method === 'transferencia') transferencia += amount;
    else if (payment.method === 'efectivo') efectivo += amount;
    else otros += amount;
  });

  const total = efectivo + transferencia + otros;
  const fmt = n => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-MX')}`;
  mob.innerHTML = `<span style="color:var(--gold-dark);font-weight:700">Hoy</span> &nbsp;💵 ${fmt(efectivo)} &nbsp;📱 ${fmt(transferencia)}${Math.abs(otros) >= .005 ? ` &nbsp;🧾 ${fmt(otros)}` : ''} &nbsp;<strong>${fmt(total)}</strong>`;
  mob.style.display = 'flex';
}

/* ── DIVISOR ARRASTRABLE ── */
function initDivider() {
  const divider = document.getElementById('pos-divider');
  const body    = document.querySelector('.pos-body');
  if (!divider || !body) return;

  const saved = localStorage.getItem('te_pos_split');
  if (saved) body.style.gridTemplateColumns = saved;

  let dragging = false;

  function startDrag(e) {
    dragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }
  function moveDrag(clientX) {
    if (!dragging) return;
    const rect  = body.getBoundingClientRect();
    const leftW = Math.max(200, Math.min(clientX - rect.left, rect.width - 200));
    const pct   = (leftW / rect.width * 100).toFixed(1);
    body.style.gridTemplateColumns = `${pct}% 5px 1fr`;
  }
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('te_pos_split', body.style.gridTemplateColumns);
  }

  divider.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', e => moveDrag(e.clientX));
  document.addEventListener('mouseup', endDrag);

  divider.addEventListener('touchstart', e => { startDrag(e); }, { passive: false });
  document.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); moveDrag(e.touches[0].clientX); } }, { passive: false });
  document.addEventListener('touchend', endDrag);
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  // Ocultar nav según rol + permisos individuales
  const _applyPosNav = (up) => {
    const canStats    = up?.canViewReports    ?? (_posRole === 'superadmin' || _posRole === 'duena');
    const canActivity = up?.canViewActivity   ?? (_posRole === 'superadmin' || _posRole === 'duena');
    const canSettings = up?.canManageSettings ?? (_posRole === 'superadmin');
    document.querySelectorAll('a.tbn-icon[href="stats.html"]').forEach(a => a.style.display = canStats ? '' : 'none');
    document.querySelectorAll('a.tbn-icon[href="activity.html"]').forEach(a => a.style.display = canActivity ? '' : 'none');
    document.querySelectorAll('a.tbn-icon[href="settings.html"]').forEach(a => a.style.display = canSettings ? '' : 'none');
  };
  _applyPosNav(_getMyPermsCached());
  _loadMyPerms().then(up => {
    if (!up) return;
    _applyPosNav(up);
    if (typeof filterApartados === 'function' && _apartadosAll?.length) {
      filterApartados(document.getElementById('apt-search')?.value || '', 'offcanvas');
      filterApartados(document.getElementById('apt-page-search')?.value || '', 'page');
    }
  });
  // Registrar inicio de turno por usuario y por fecha de Ciudad de México.
  _posEnsureCurrentShift();
  // Nombre del usuario en topbar
  try {
    const _s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const _meta = _s?.user?.user_metadata || {};
    const _name = _meta.full_name || _meta.name || _s?.user?.email?.split('@')[0] || '';
    const _initial = _name ? _name[0].toUpperCase() : '?';
    const _av = document.getElementById('user-avatar');
    const _nl = document.getElementById('user-name-label');
    if (_av) _av.textContent = _initial;
    if (_nl) _nl.textContent = _name;
  } catch {}
  initDivider();
  await Promise.all([loadProducts(), loadPosCategories(), loadSalesStats(), loadTopProductsFromSales(), loadPosNameMap(), loadPosConfig(), loadPosRecentlyEdited()]);
  renderCategoryChips();
  setPosView(posView);
  setPosSort(posSort);
  _restoreCart();
  renderCart();
  loadTodayStats();
  loadHistory();
  loadApartados();
  showAllProducts();
  initRealtime();

  // Swipe para cerrar offcanvas (derecha)
  initSwipeToClose('corte-offcanvas',   'corte-backdrop',   closeCorte,      0.35);
  initSwipeToClose('history-offcanvas', 'history-backdrop', closeHistory,    0.35);
  initSwipeToClose('apt-offcanvas',     'apt-backdrop',     closeApartados,  0.35);

  // Swipe down para cerrar modales / bottom sheets
  const saleDoneOv = document.getElementById('sale-done-overlay');
  initSwipeDown(document.querySelector('.sale-done-modal'), closeSaleDone, saleDoneOv);
  initSwipeDown(document.querySelector('#abonar-overlay .abonar-modal'), closeAbonarModal,
    document.getElementById('abonar-overlay'));
  initSwipeDown(document.querySelector('#liquidar-overlay .abonar-modal'), closeLiqModal,
    document.getElementById('liquidar-overlay'));

  // Inicializar pestañas en teléfonos
  if (isTabMode()) switchPosTab('catalog');

  // Reajustar pestañas al rotar el dispositivo
  window.addEventListener('resize', () => {
    if (isTabMode()) switchPosTab(_currentTab);
    else {
      // Volver a layout desktop: quitar clases de pestaña
      document.getElementById('pos-left')?.classList.remove('tab-active','tab-hidden');
      document.getElementById('pos-right')?.classList.remove('tab-active','tab-hidden');
    }
  });

  // Enter en búsqueda → agrega el primer resultado disponible
  document.getElementById('pos-search').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const raw   = e.target.value.trim();
    const terms = _norm(raw).split(/\s+/).filter(Boolean);
    if (!terms.length) return;
    const match = products.find(p =>
      !p.outOfStock && p.stock > 0 && (
        terms.every(t => _norm(p.name).includes(t)) ||
        (p.barcode && p.barcode === raw)
      )
    );
    if (match) {
      addToCart(match.id);
      e.target.value = '';
      _togglePosSearchClear();
      showAllProducts();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePosScanner();
      closeSaleDone();
      const detailModal = document.getElementById('apt-detail-modal');
      if (detailModal && detailModal.style.display !== 'none') { closeAptDetail(); return; }
      const aptPage = document.getElementById('apt-page');
      if (aptPage && aptPage.style.display !== 'none') { closeAptPage(); return; }
    }
    if ((e.key === 'F2' || (e.key === ' ' && document.activeElement.tagName !== 'INPUT')) &&
        !document.getElementById('pos-scanner-overlay').classList.contains('open')) {
      e.preventDefault();
      document.getElementById('pos-search').focus();
    }
  });

  // --- Escáner USB: input trampa + interceptor ---
  function _focusScanTrap() {
    const trap = document.getElementById('scan-trap');
    if (trap) { trap.value = ''; trap.focus({ preventScroll: true }); }
  }

  // Enfocar trampa al cargar (captura escáner sin tocar pantalla en Android)
  setTimeout(_focusScanTrap, 400);

  ;(function(){
    let buf = '', t = null;
    document.addEventListener('keydown', e => {
      if (!e.isTrusted) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      const tag = active?.tagName?.toUpperCase();
      // Si pos-search tiene foco, el input nativo ya maneja el escáner
      if (active?.id === 'pos-search') return;
      // Saltar otros inputs reales (formularios, apartado, etc.) pero no el scan-trap
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && active?.id !== 'scan-trap') return;
      // No interceptar si hay un modal abierto
      if (document.getElementById('pos-scanner-overlay')?.classList.contains('open')) return;
      if (document.getElementById('sale-done-overlay')?.classList.contains('open')) return;

      if (e.key === 'Enter') {
        if (buf.length >= 4) {
          e.preventDefault();
          const si = document.getElementById('pos-search');
          if (si) {
            si.value = buf;
            si.dispatchEvent(new Event('input', { bubbles: true }));
            si.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
          setTimeout(_focusScanTrap, 150); // devolver foco a trampa tras agregar al carrito
        }
        buf = '';
        clearTimeout(t);
        return;
      }

      if (e.key.length === 1) {
        buf += e.key;
        clearTimeout(t);
        t = setTimeout(() => { buf = ''; }, 50);
      }
    });
  })();
});
