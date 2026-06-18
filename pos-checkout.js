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

  updateAnticipoInfo();
}

let _cobrandoAhora = false;
async function cobrar() {
  if (!cart.length || _cobrandoAhora) return;
  if (!navigator.onLine) { toast('Sin conexión — no se puede registrar la venta', 'error'); return; }
  _cobrandoAhora = true;
  const isApartado = document.getElementById('pos-is-apartado')?.checked;
  const customerName = document.getElementById('pos-customer')?.value.trim() || '';
  const phone        = document.getElementById('pos-phone')?.value.trim() || '';
  const customer     = customerName + (phone ? ` · 📱 ${phone}` : '');
  const note       = document.getElementById('pos-note')?.value.trim() || '';
  const disc       = getDiscount();
  const total      = getDiscountedTotal();

  let paidAmount, change;

  if (isApartado) {
    if (!customer) { toast('Ingresa el nombre del cliente', 'error'); document.getElementById('pos-customer').focus(); _cobrandoAhora = false; return; }
    paidAmount = parseFloat(document.getElementById('pos-anticipo')?.value) || 0;
    if (paidAmount > total) { toast('El anticipo no puede ser mayor al total del pedido', 'error'); document.getElementById('pos-anticipo').focus(); _cobrandoAhora = false; return; }
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

  const btn = document.getElementById('cobrar-btn');
  btn.setAttribute('data-loading', '1'); btn.disabled = true;

  const items = cart.map(({ product: p, qty, customPrice }) => { const pr = customPrice ?? p.price; return { id:p.id, name:p.name, price:pr, qty, subtotal:pr*qty }; });

  const dueDateEl = document.getElementById('pos-due-date');
  const sellerEmail = getSession()?.user?.email || null;
  const saleData = {
    total, items,
    discount:        disc || null,
    payment_method:  payMethod,
    note:            note || null,
    type:            isApartado ? 'apartado' : 'venta',
    paid_amount:     paidAmount,
    customer:        customer || null,
    due_date:        isApartado && dueDateEl?.value ? dueDateEl.value : null,
    seller_email:    sellerEmail,
    abonos:          isApartado && paidAmount > 0
                       ? [{ amount: paidAmount, method: payMethod, date: new Date().toISOString() }]
                       : null
  };

  // Una sola llamada atómica: valida stock + inserta venta + descuenta stock en una transacción
  const rpcResult = await api('rpc/record_sale_atomic', {
    method: 'POST',
    body: JSON.stringify({
      p_items:           saleData.items,
      p_total:           saleData.total,
      p_discount:        saleData.discount || 0,
      p_payment_method:  saleData.payment_method,
      p_note:            saleData.note || null,
      p_type:            saleData.type,
      p_paid_amount:     saleData.paid_amount ?? null,
      p_customer:        saleData.customer || null,
      p_due_date:        saleData.due_date || null,
      p_abonos:          saleData.abonos || null
    })
  });
  if (!rpcResult.ok) {
    btn.removeAttribute('data-loading'); btn.disabled = false; _cobrandoAhora = false;
    const msg = rpcResult.data?.message || rpcResult.data?.details || '';
    toast(msg.includes('Sin stock') ? msg : 'Error al registrar la venta — intenta de nuevo', 'error');
    return;
  }

  // Actualizar array local optimistamente (Realtime también sincronizará)
  for (const { product: p, qty } of cart) {
    if (p.kitItems?.length) {
      for (const comp of p.kitItems) {
        const lc = products.find(x => x.id === comp.id);
        if (!lc) continue;
        lc.stock = Math.max(0, lc.stock - qty * comp.qty);
        if (lc.stock === 0 && !isApartado) { lc.outOfStock = true; lc.isPublished = false; }
        if (lc.stock === 0 &&  isApartado) { lc.isApartado = true; }
      }
    } else {
      const lp = products.find(x => x.id === p.id);
      if (lp) {
        lp.stock = Math.max(0, lp.stock - qty);
        if (lp.stock === 0 && !isApartado) { lp.outOfStock = true; lp.isPublished = false; }
        if (lp.stock === 0 &&  isApartado) { lp.isApartado = true; }
      }
    }
  }

  btn.removeAttribute('data-loading');

  // Registrar actividad
  if (isApartado) {
    logActivity('apartado_nuevo',
      `Apartado de ${customerName} — $${total.toLocaleString('es-MX')}`,
      { customer: customerName, total, anticipo: paidAmount, pendiente: total - paidAmount });
  } else {
    logActivity('venta',
      `Cobró $${total.toLocaleString('es-MX')} — ${items.length} producto${items.length !== 1 ? 's' : ''}`,
      { total, items: items.length, method: payMethod, discount: disc || 0,
        itemIds: items.map(i => i.id) });
  }

  // Guardar para el ticket WA
  const dueDateVal = isApartado ? document.getElementById('pos-due-date')?.value : null;
  _lastSale = { total, paidAmount, change, disc, note, items, payMethod, isApartado, customer, dueDate: dueDateVal };

  // Reset UI
  cart = [];
  ['pos-cash','pos-discount','pos-note','pos-phone','pos-anticipo'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  document.getElementById('pos-is-apartado').checked = false;
  document.getElementById('apartado-fields').style.display = 'none';
  clearNoteField();
  clearCustomerField();
  clearDiscountField();
  document.getElementById('cobrar-btn').textContent = '✓ Cobrar';
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

  document.getElementById('sd-icon').textContent         = isApt ? '📌' : '✓';
  document.getElementById('sd-title').textContent        = isApt ? 'Apartado registrado' : 'Venta completada';
  document.getElementById('sd-total-label').textContent  = isApt ? 'Total del pedido' : 'Total cobrado';
  document.getElementById('sd-cash-label').textContent   = isApt ? 'Anticipo recibido' : 'Recibido';
  document.getElementById('sd-total').textContent        = fmt(s.total);
  document.getElementById('sd-cash').textContent         = s.paidAmount > 0 ? fmt(s.paidAmount) : '—';
  document.getElementById('sd-change').textContent       = s.change > 0 ? fmt(s.change) : s.payMethod === 'transferencia' ? '—' : '$0';
  document.getElementById('sd-method').textContent       = s.payMethod === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo';

  const pendiente = Math.max(0, (s.total || 0) - (s.paidAmount || 0));
  document.getElementById('sd-pending-row').style.display  = isApt ? '' : 'none';
  document.getElementById('sd-pending').textContent         = fmt(pendiente);
  document.getElementById('sd-change-row').style.display   = isApt ? 'none' : '';
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
  if (waBtn) waBtn.childNodes[waBtn.childNodes.length - 1].textContent = isApt ? ' Enviar confirmación por WhatsApp' : ' Enviar ticket por WhatsApp';
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
  if (s.isApartado) {
    const custParts = (s.customer||'').split(' · 📱 ');
    const nombre    = custParts[0] || 'Cliente';
    const telNum    = custParts[1] || '';
    const pendiente = Math.max(0, (s.total||0) - (s.paidAmount||0));
    const anticipoLine = (s.paidAmount||0) > 0
      ? `✅ Anticipo recibido: $${(s.paidAmount||0).toLocaleString('es-MX')} (${metodo})\n⏳ *Pendiente: $${pendiente.toLocaleString('es-MX')} MXN*`
      : `⏳ *Total a pagar al entregar: $${pendiente.toLocaleString('es-MX')} MXN*`;
    let dueLine = '';
    if (s.dueDate) {
      const due = new Date(s.dueDate + 'T00:00:00');
      dueLine = `\n📅 Fecha límite: *${due.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'})}*`;
    }
    msg = `📌 *Apartado — Tres Encantos*\n━━━━━━━━━━━━━━\n👤 ${nombre}\n${lines}${disc}\n━━━━━━━━━━━━━━\n*Total pedido: $${(s.total||0).toLocaleString('es-MX')} MXN*\n${anticipoLine}${dueLine}${note}\n\nTe avisamos cuando esté listo. ¡Gracias! 💛`;
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

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    if (_posScanner) { _posScanner.stop().catch(() => {}); _posScanner = null; }
    try { await _loadQuaggaPos(); } catch(e) {
      statusEl.textContent = 'No se pudo cargar el escáner.';
      return;
    }
    _posQuaggaActive = true;
    Quagga.init({
      inputStream: { name: 'Live', type: 'LiveStream',
        target: document.getElementById('pos-reader'),
        constraints: { facingMode: { ideal: 'environment' } }
      },
      locator: { patchSize: 'medium', halfSample: true },
      numOfWorkers: 0, frequency: 15,
      decoder: { readers: ['ean_reader','ean_8_reader','code_128_reader','upc_reader','upc_e_reader'] },
      locate: true
    }, (err) => {
      if (err) {
        statusEl.textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
        _posQuaggaActive = false; return;
      }
      Quagga.start();
      statusEl.textContent = 'Apunta al código de barras del producto';
      Quagga.onDetected((result) => {
        const code = result.codeResult?.code;
        if (code) _posHandleCode(code);
      });
    });
  } else {
    if (_posQuaggaActive && window.Quagga) {
      Quagga.offDetected();
      Promise.resolve(Quagga.stop()).catch(() => {});
      _posQuaggaActive = false;
    }
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
}

function closePosScanner() {
  if (_posQuaggaActive && window.Quagga) {
    Quagga.offDetected();
    Promise.resolve(Quagga.stop()).catch(() => {});
    _posQuaggaActive = false;
  }
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
async function loadTodayStats() {
  const TZ = 'America/Mexico_City';
  const mxDateKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso));
  const hoyMX  = mxDateKey(new Date().toISOString());
  // Fetch últimos 8 días para capturar abonos de apartados viejos
  const desde  = new Date(Date.now() - 8*24*3600*1000).toISOString();
  const result = await api(`sales?created_at=gte.${desde}&select=total,paid_amount,payment_method,type,abonos,created_at`);
  const mob    = document.getElementById('daily-summary-mobile');
  if (!result.ok || !result.data?.length) return;

  let efectivo = 0, transferencia = 0;
  result.data.forEach(s => {
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];
    if (abonos.length) {
      // Contar solo abonos de hoy (pueden ser de apartados de días anteriores)
      abonos.forEach(a => {
        if (mxDateKey(a.date) === hoyMX) {
          const amt = parseFloat(a.amount) || 0;
          if (a.method === 'transferencia') transferencia += amt;
          else efectivo += amt;
        }
      });
    } else if (mxDateKey(s.created_at) === hoyMX && s.type !== 'apartado') {
      // Venta simple de hoy: usar total (no paid_amount que incluye efectivo tendered con cambio)
      const amt = parseFloat(s.total) || 0;
      if (s.payment_method === 'transferencia') transferencia += amt;
      else efectivo += amt;
    }
  });

  const total = efectivo + transferencia;
  if (total === 0) return;

  const fmt = n => `$${n.toLocaleString('es-MX')}`;
  mob.innerHTML = `<span style="color:var(--gold-dark);font-weight:700">Hoy</span> &nbsp;💵 ${fmt(efectivo)} &nbsp;📱 ${fmt(transferencia)} &nbsp;<strong>${fmt(total)}</strong>`;
  mob.style.display = 'flex';
}

/* ── DIVISOR ARRASTRABLE ── */
function initDivider() {
  const divider = document.getElementById('pos-divider');
  const body    = document.querySelector('.pos-body');
  if (!divider || !body) return;

  // Restaurar proporción guardada
  const saved = localStorage.getItem('te_pos_split');
  if (saved) body.style.gridTemplateColumns = saved;

  let dragging = false;

  divider.addEventListener('mousedown', e => {
    dragging = true;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect  = body.getBoundingClientRect();
    const leftW = Math.max(200, Math.min(e.clientX - rect.left, rect.width - 200));
    const pct   = (leftW / rect.width * 100).toFixed(1);
    const cols  = `${pct}% 5px 1fr`;
    body.style.gridTemplateColumns = cols;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('te_pos_split', body.style.gridTemplateColumns);
  });
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  // Ocultar nav según rol
  if (_posRole !== 'superadmin' && _posRole !== 'duena') {
    document.querySelectorAll(`a.tbn-icon[href="activity.html"]`).forEach(a => a.style.display = 'none');
  }
  if (_posRole === 'operador') {
    ['stats.html','settings.html'].forEach(href => {
      document.querySelectorAll(`a.tbn-icon[href="${href}"]`).forEach(a => a.style.display = 'none');
    });
  }
  if (_posRole === 'duena' || _posRole === 'encargado') {
    document.querySelectorAll(`a.tbn-icon[href="settings.html"]`).forEach(a => a.style.display = 'none');
  }
  // Registrar inicio de turno (se resetea cada día)
  const hoyKey = new Date().toISOString().split('T')[0];
  if (localStorage.getItem('te_shift_date') !== hoyKey) {
    localStorage.setItem('te_shift_start', new Date().toISOString());
    localStorage.setItem('te_shift_date', hoyKey);
  }
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
  initSwipeDown(document.querySelector('#liq-overlay .abonar-modal'), closeLiqModal,
    document.getElementById('liq-overlay'));

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
      if (document.getElementById('sale-done')?.style.display === 'flex') return;

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
