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
  document.getElementById('pos-discount').value = '';
  updateChange();
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
  if (document.getElementById('pos-is-apartado')?.checked) return; // requerido en apartado
  const val = document.getElementById('pos-customer')?.value.trim();
  if (!val) clearCustomerField();
}

/* ── APARTADO ── */
function toggleApartadoMode() {
  const isApt = document.getElementById('pos-is-apartado').checked;
  document.getElementById('apartado-fields').style.display = isApt ? '' : 'none';
  document.getElementById('cobrar-btn').textContent = isApt ? '📌 Registrar apartado' : '✓ Cobrar';
  // Ocultar efectivo/cambio en apartado — esos campos se ignoran en cobrar()
  const cashSection = document.getElementById('cash-section');
  if (cashSection) cashSection.style.display = isApt ? 'none' : (payMethod === 'efectivo' ? '' : 'none');
  if (isApt) {
    const cashEl = document.getElementById('pos-cash');
    if (cashEl) cashEl.value = '';
    const changeEl = document.getElementById('pos-change-input');
    if (changeEl) changeEl.value = '';
    // Limpiar descuento — en apartado el precio ya se negoció por ítem
    const discEl = document.getElementById('pos-discount');
    if (discEl) { discEl.value = ''; updateChange(); }
    // Fecha límite por defecto: 30 días
    const dueEl = document.getElementById('pos-due-date');
    if (dueEl && !dueEl.value) {
      const d = new Date(); d.setDate(d.getDate() + 30);
      dueEl.value = d.toISOString().split('T')[0];
    }
    // Auto-focus en el campo de cliente (requerido en apartado)
    document.getElementById('customer-toggle-btn').style.display = 'none';
    document.getElementById('customer-input-wrap').style.display = '';
    setTimeout(() => document.getElementById('pos-customer')?.focus(), 80);
  } else {
    // Al desactivar apartado: limpiar campos específicos del apartado y hint
    ['pos-phone','pos-anticipo','pos-pendiente','pos-due-date'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    // Cliente: si quedó vacío, colapsar de vuelta; si tiene texto, conservarlo (venta normal lo acepta)
    if (!document.getElementById('pos-customer')?.value.trim()) {
      document.getElementById('customer-input-wrap').style.display = 'none';
      document.getElementById('customer-toggle-btn').style.display = '';
    }
    document.querySelectorAll('.anticipo-quick button').forEach(b => b.classList.remove('active-cash'));
    const hint = document.getElementById('cobrar-hint');
    if (hint) hint.style.display = 'none';
  }
  updateAnticipoInfo();
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
    if (el)      { el.value = ''; el.style.color = 'var(--red)'; el.placeholder = 'Anticipo > total'; }
    if (antiEl)  antiEl.style.borderColor = 'var(--red)';
    if (btn)     btn.disabled = true;
    return;
  }

  // Restaurar estilos normales
  if (antiEl) antiEl.style.borderColor = '';

  const pendiente = Math.max(0, total - anticipo);
  if (el) {
    el.value = pendiente > 0 ? pendiente.toFixed(2) : '';
    el.placeholder = pendiente === 0 && anticipo > 0 ? 'Cubierto ✓' : '—';
    el.style.color = pendiente > 0 ? 'var(--red)' : 'var(--green)';
  }
  const hint = document.getElementById('cobrar-hint');
  if (btn && document.getElementById('pos-is-apartado')?.checked) {
    const customer = document.getElementById('pos-customer')?.value.trim() || '';
    const needsCustomer = !customer;
    btn.disabled = needsCustomer;
    if (hint) {
      if (needsCustomer) {
        hint.textContent = 'Ingresa el nombre del cliente para continuar';
        hint.style.display = '';
      } else if (anticipo <= 0) {
        hint.textContent = '📦 Sin anticipo — se cobrará al entregar';
        hint.style.color = 'var(--gold-dark)';
        hint.style.display = '';
      } else {
        hint.style.display = 'none';
      }
    }
  } else if (hint) {
    hint.style.display = 'none';
  }
}


async function loadApartados() {
  const result = await api(`sales?type=eq.apartado&select=id,total,paid_amount,customer,created_at,due_date,items,abonos,discount&order=created_at.desc&limit=100`);
  const ocList    = document.getElementById('apt-offcanvas-list');
  const ocCount   = document.getElementById('apt-oc-count');
  const tabBadge  = document.getElementById('tab-apt-badge');
  const btnBadge  = document.getElementById('btn-apt-badge');

  const empty = !result.ok || !result.data?.length;
  const hoyMs = new Date().setHours(0,0,0,0);

  // Detectar apartados vencidos
  const vencidos = empty ? 0 : result.data.filter(s => {
    if (!s.due_date) return false;
    return new Date(s.due_date + 'T00:00:00') < hoyMs;
  }).length;

  // Badge del tab mobile — rojo si hay vencidos
  if (tabBadge) {
    tabBadge.textContent = empty ? '' : result.data.length;
    tabBadge.style.display = empty ? 'none' : 'flex';
    tabBadge.style.background = vencidos > 0 ? '#E85D5D' : '';
  }

  // Badge del botón en topbar
  if (btnBadge) {
    if (empty) {
      btnBadge.style.display = 'none';
    } else {
      btnBadge.textContent = result.data.length;
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

  if (empty) {
    if (ocList)  ocList.innerHTML = '<div class="history-empty"><div style="font-size:2rem;margin-bottom:8px">📌</div>Sin apartados pendientes</div>';
    if (ocCount) ocCount.textContent = '';
    return;
  }

  if (ocCount) ocCount.textContent = `${result.data.length} apartado${result.data.length !== 1 ? 's' : ''} activo${result.data.length !== 1 ? 's' : ''}${vencidos > 0 ? ` · ${vencidos} vencido${vencidos > 1 ? 's' : ''}` : ''}`;

  // Guardar datos para acceso en abonarApartado y filtrado
  _apartadosData = {};
  _apartadosAll  = result.data || [];
  _apartadosAll.forEach(s => { _apartadosData[s.id] = s; });

  // Resetear búsqueda al recargar
  const aptSearch = document.getElementById('apt-search');
  if (aptSearch) aptSearch.value = '';
  const aptClear = document.getElementById('apt-search-clear');
  if (aptClear) aptClear.style.display = 'none';

  _renderApartadoCards(_apartadosAll);
  // Actualizar page view si está abierta
  const page = document.getElementById('apt-page');
  if (page && page.style.display !== 'none') {
    _renderAptPageCards(_apartadosAll);
    const ps = document.getElementById('apt-page-search');
    if (ps) ps.value = '';
    const pc = document.getElementById('apt-page-search-clear');
    if (pc) pc.style.display = 'none';
  }
}

function _renderApartadoCards(data) {
  const ocList = document.getElementById('apt-offcanvas-list');
  if (!ocList) return;
  if (!data.length) {
    ocList.innerHTML = '<div class="history-empty" style="grid-column:1/-1"><div style="font-size:2rem;margin-bottom:8px">🔍</div>Sin resultados</div>';
    return;
  }
  const itemsHTML = data.map(s => {
    const total     = parseFloat(s.total) || 0;
    const pagado    = parseFloat(s.paid_amount || 0);
    const pendiente = Math.max(0, total - pagado);
    const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
    const t         = new Date(s.created_at).toLocaleDateString('es-MX', {day:'numeric',month:'short'});
    const nItems    = Array.isArray(s.items) ? s.items.length : 0;
    const custParts = (s.customer || '').split(' · 📱 ');
    const nombre    = custParts[0] || 'Sin nombre';
    const telNum    = custParts[1] || '';

    // Fecha de vencimiento
    let dueColor = '', dueText = '', dueHTML = '';
    if (s.due_date) {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const due = new Date(s.due_date + 'T00:00:00');
      const diff = Math.round((due - hoy) / 86400000);
      dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
      dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)}d` : diff === 0 ? 'Vence hoy' : `Vence ${due.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}`;
      dueHTML  = `<span class="apt-h-due" style="color:${dueColor}">📅 ${dueText}</span>`;
    }
    const isOverdue = s.due_date && (() => { const h=new Date();h.setHours(0,0,0,0);return new Date(s.due_date+'T00:00:00') < h; })();

    // Abonos
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];
    const abonosHTML = abonos.length ? `
<div class="apt-abonos">
  <div class="apt-abonos-title" onclick="event.stopPropagation();_toggleAbonos(this)">Historial de pagos <span class="apt-abonos-toggle">▼</span></div>
  <div class="apt-abonos-body" style="max-height:0">
    ${abonos.map(a => {
      const fecha = new Date(a.date).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
      const ico   = a.method === 'transferencia' ? '📱' : '💵';
      return `<div class="apt-abono-row"><span>${fecha} · ${ico} ${a.method}</span><span class="apt-abono-amount">$${parseFloat(a.amount).toLocaleString('es-MX')}</span></div>`;
    }).join('')}
  </div>
</div>` : '';

    // Items
    const itemsListHTML = nItems ? s.items.map(i => {
      const prod  = products.find(x => x.id === i.id);
      const img   = prod?.image || i.image || '';
      const price = (i.subtotal ?? i.price*(i.qty||1)).toLocaleString('es-MX');
      return `<div class="apt-item-row" onclick="event.stopPropagation();_aptItemPopup(${i.id},this)">
        <img class="apt-item-thumb" src="${img}" onerror="this.style.visibility='hidden'" alt="">
        <div class="apt-item-info"><div class="apt-item-name">${_esc(i.name)}</div></div>
        <div class="apt-item-right">
          <span class="apt-item-price">$${price}</span>
          <span class="apt-item-qty">×${i.qty||1}</span>
        </div>
      </div>`;
    }).join('') : '';

    const telLink = telNum ? `<a href="tel:${telNum.replace(/\D/g,'')}" onclick="event.stopPropagation()" style="color:#9B8B78;text-decoration:none;font-size:.72rem">📱 ${telNum}</a>` : '';

    return `
<div class="apartado-item${isOverdue ? ' apt-overdue' : ''}" onclick="_toggleApt(this,${s.id})">
  <div class="apt-header">
    <div class="apt-header-r1">
      <span class="apt-h-name">👤 ${_esc(nombre)}</span>
      <div class="apt-h-right">
        <span class="apt-h-pending${pendiente===0?' zero':''}">${pendiente===0?'✓ Pagado':'$'+pendiente.toLocaleString('es-MX')}</span>
        <span class="apt-chevron">›</span>
      </div>
    </div>
    <div class="apt-header-r2">
      <span class="apt-h-meta">${t} · ${nItems} prod.${telNum ? ' · '+telNum : ''}</span>
      ${dueHTML}
    </div>
    <div class="apt-mini-bar"><div class="apt-mini-fill" style="width:${pct}%"></div></div>
  </div>
  <div class="apt-body">
    ${isOverdue ? '<div class="apt-overdue-badge">⚠️ Vencido</div>' : ''}
    <div class="apt-items-list">${itemsListHTML}</div>
    ${abonosHTML}
    <div class="apt-progress-section">
      <div class="apt-progress-track"><div class="apt-progress-fill" style="width:${pct}%"></div></div>
      <div class="apt-amounts-row">
        <span class="apt-paid-lbl">✓ Pagado $${pagado.toLocaleString('es-MX')} (${pct}%)</span>
        <span class="apt-pending-lbl">Pendiente $${pendiente.toLocaleString('es-MX')}</span>
      </div>
    </div>
    <div class="apt-btns">
      <button class="btn-wa-reminder" onclick="event.stopPropagation();sendApartadoReminder(${s.id})" title="Recordatorio WhatsApp">💬</button>
      ${canEditApartado() ? `<button class="btn-wa-reminder" onclick="event.stopPropagation();openEditApartado(${s.id})" title="Editar" style="background:#F7F2EB;color:var(--charcoal);border:1.5px solid var(--border)">✏️</button>` : ''}
      <button class="btn-abonar" onclick="event.stopPropagation();abonarApartado('${s.id}','${total}','${pagado}','${_esc(nombre).replace(/'/g,"\\'")}')">+ Abonar</button>
      <button class="btn-liquidar" onclick="event.stopPropagation();openLiqModal(${s.id})">✓ Liquidar</button>
      ${canEditApartado() ? `<button class="btn-cancelar-apt" onclick="event.stopPropagation();cancelApartado(${s.id})" title="Cancelar apartado">✕</button>` : ''}
    </div>
  </div>
</div>`;
  }).join('');
  ocList.innerHTML = itemsHTML;
}

/* ── APARTADO TOGGLE ── */
function _toggleApt(el, id) {
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('#apt-offcanvas-list .apartado-item.open').forEach(c => c.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
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
  const existing = document.getElementById('apt-item-popup');
  if (existing) { existing.remove(); if (existing.dataset.forId == productId) return; }
  const prod = products.find(x => x.id === productId);
  if (!prod?.image) return;
  const popup = document.createElement('div');
  popup.id = 'apt-item-popup';
  popup.dataset.forId = productId;
  popup.style.cssText = 'position:fixed;z-index:9999;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.22);padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;width:230px;animation:apt-pop-in .18s ease';
  popup.innerHTML = `
    <style>@keyframes apt-pop-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}</style>
    <button onclick="document.getElementById('apt-item-popup').remove()" style="position:absolute;top:8px;right:8px;background:none;border:none;font-size:1rem;cursor:pointer;color:#8A7564;line-height:1;padding:2px">✕</button>
    <img src="${prod.image}" onerror="this.onerror=null;this.src=''" style="width:190px;height:190px;object-fit:contain;border-radius:8px;background:#F7F2EB">
    <div style="font-size:.86rem;font-weight:600;color:#1C1817;text-align:center;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:100%">${_esc(prod.name)}</div>`;
  document.body.appendChild(popup);
  const r = triggerEl.getBoundingClientRect();
  const pw = 230, ph = popup.offsetHeight || 280;
  let top  = r.top - ph - 8;
  let left = r.left + r.width / 2 - pw / 2;
  if (top < 8) top = r.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  popup.style.top  = top  + 'px';
  popup.style.left = left + 'px';
  const close = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 10);
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
  let fechaTexto  = '';
  if (s.due_date) {
    const due = new Date(s.due_date + 'T00:00:00');
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const dias = Math.round((due - hoy) / 86400000);
    const label = due.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
    fechaTexto = dias < 0
      ? `⚠️ Tu apartado venció hace ${Math.abs(dias)} día${Math.abs(dias)>1?'s':''}. Por favor contáctanos para arreglar tu pedido.`
      : dias === 0
        ? `📅 Tu apartado *vence hoy*. ¡Pasa a recogerlo cuando puedas!`
        : `📅 Tu apartado vence el *${label}* (en ${dias} día${dias>1?'s':''}).`;
  }
  const msg = `Hola *${nombre}* 👋\n\nTe escribimos de *Tres Encantos* con un recordatorio de tu apartado 📌\n\n*Productos:*\n${productos}\n\n💰 Anticipo pagado: *$${pagado.toLocaleString('es-MX')}*\n⏳ Pendiente: *$${pendiente.toLocaleString('es-MX')}*\n${fechaTexto}\n\n¡Te esperamos! 🛍`;
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
  // target: 'page' | 'offcanvas' | undefined (= both)
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const filtered = q.trim()
    ? (_apartadosAll||[]).filter(s => norm(s.customer).includes(norm(q)))
    : (_apartadosAll||[]);
  if (!target || target === 'offcanvas') {
    const clearBtn = document.getElementById('apt-search-clear');
    if (clearBtn) clearBtn.style.display = q.trim() ? '' : 'none';
    _renderApartadoCards(filtered);
  }
  if (!target || target === 'page') {
    const clearBtn = document.getElementById('apt-page-search-clear');
    if (clearBtn) clearBtn.style.display = q.trim() ? '' : 'none';
    _renderAptPageCards(filtered);
  }
}

function clearAptSearch() {
  const el = document.getElementById('apt-search');
  if (el) { el.value = ''; el.focus(); }
  document.getElementById('apt-search-clear').style.display = 'none';
  _renderApartadoCards(_apartadosAll);
}

function abonarApartado(id, total, pagado, nombre) {
  total  = parseFloat(total)  || 0;
  pagado = parseFloat(pagado) || 0;
  const abonos = Array.isArray(_apartadosData[id]?.abonos) ? _apartadosData[id].abonos : [];
  _abonarCtx = { id, total, pagado, pendiente: total - pagado, nombre, abonos };
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
  const over = _abonarCtx && val > _abonarCtx.pendiente;
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
  const monto   = parseFloat(document.getElementById('abonar-amount').value) || 0;
  if (monto <= 0 || monto > _abonarCtx.pendiente) return;
  const nuevoPagado = _abonarCtx.pagado + monto;
  const btn = document.getElementById('abonar-confirm-btn');
  btn.disabled = true; btn.textContent = 'Registrando…';
  const nuevoAbono = { amount: monto, method: _abonarMethod, date: new Date().toISOString() };
  const abonosActualizados = [...(_abonarCtx.abonos || []), nuevoAbono];
  const patch = { paid_amount: nuevoPagado, abonos: abonosActualizados };
  // Primer pago en apartado sin anticipo → anclar fecha de venta a hoy
  if ((_abonarCtx.pagado || 0) === 0) patch.created_at = new Date().toISOString();
  const r = await api(`sales?id=eq.${_abonarCtx.id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  if (!r.ok) { toast('Error al registrar abono', 'error'); btn.disabled = false; btn.textContent = 'Confirmar abono'; return; }
  logActivity('apartado_abono',
    `Abono de $${monto.toLocaleString('es-MX')} a ${_abonarCtx.nombre || 'cliente'}`,
    { amount: monto, method: _abonarMethod });
  closeAbonarModal();
  toast(`Abono de $${monto.toLocaleString('es-MX')} registrado ✓`, 'success');
  loadApartados();
}

/* ── EDITAR APARTADO ────────────────────────────────────────────────── */
let _editAptCtx = null;

function openEditApartado(id) {
  const sale = _apartadosData[id];
  if (!sale) return;
  _editAptCtx = { id, sale, items: (sale.items || []).map(i => ({ ...i })), anularPago: false };
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
  } else if (pagadoRow) {
    pagadoRow.style.display = 'none';
  }
  renderEditAptItems();
  document.getElementById('edit-apt-overlay').style.display = 'flex';
}

function _editAptAnularPago() {
  if (!_editAptCtx) return;
  const pagado = parseFloat(_editAptCtx.sale.paid_amount || 0);
  if (!confirm(`¿Anular el anticipo de $${pagado.toLocaleString('es-MX')} MXN?\n\nEsto dejará el apartado con $0 pagado. No se puede deshacer desde aquí.`)) return;
  _editAptCtx.anularPago = true;
  const row = document.getElementById('edit-apt-pagado-row');
  if (row) row.innerHTML = `<div style="font-size:.82rem;color:var(--red);font-weight:600">✕ Anticipo anulado — se guardará como $0</div>`;
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
        <button onclick="_editAptChangeQty(${idx},-1)" style="width:26px;height:26px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-size:.95rem;line-height:1;font-family:inherit">−</button>
        <span style="font-size:.9rem;font-weight:700;min-width:22px;text-align:center">${item.qty||1}</span>
        <button onclick="_editAptChangeQty(${idx},1)" style="width:26px;height:26px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;font-size:.95rem;line-height:1;font-family:inherit">+</button>
      </div>
      <button onclick="_editAptRemove(${idx})" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1.1rem;padding:4px;line-height:1;flex-shrink:0">✕</button>
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
  item.qty = Math.max(1, (item.qty || 1) + delta);
  item.subtotal = item.price * item.qty;
  renderEditAptItems();
}

function _editAptRemove(idx) {
  _editAptCtx.items.splice(idx, 1);
  renderEditAptItems();
}

function _updateEditAptTotal() {
  const total = _editAptCtx.items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
  const el = document.getElementById('edit-apt-total');
  if (el) el.textContent = `$${total.toLocaleString('es-MX')} MXN`;
}

function searchEditApt(q) {
  const res = document.getElementById('edit-apt-search-results');
  if (!q.trim()) { res.style.display = 'none'; return; }
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase())
  ).sort((a, b) => {
    const aOos = a.outOfStock || a.stock === 0;
    const bOos = b.outOfStock || b.stock === 0;
    return aOos - bOos;
  }).slice(0, 7);
  if (!matches.length) { res.style.display = 'none'; return; }
  res.style.display = 'block';
  res.innerHTML = matches.map(p => {
    const oos = p.outOfStock || p.stock === 0;
    return `<div onclick="_editAptAddProduct(${p.id})" style="cursor:pointer;padding:8px 10px;display:flex;align-items:center;gap:8px;font-size:.82rem;border-bottom:1px solid var(--border);${oos?'opacity:.65':''}">
      <img src="${p.image}" style="width:28px;height:28px;object-fit:cover;border-radius:5px;flex-shrink:0" onerror="this.style.display='none'">
      <span style="flex:1;font-weight:600">${_esc(p.name)}</span>
      <span style="color:${oos?'var(--red)':'var(--muted)'};font-size:.74rem">${oos?'Sin stock':'$'+p.price.toLocaleString('es-MX')}</span>
    </div>`;
  }).join('');
}

function _editAptAddProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const existing = _editAptCtx.items.find(i => i.id === id);
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    existing.subtotal = existing.price * existing.qty;
  } else {
    _editAptCtx.items.push({ id: p.id, name: p.name, price: p.price, qty: 1, subtotal: p.price });
  }
  document.getElementById('edit-apt-search').value = '';
  document.getElementById('edit-apt-search-results').style.display = 'none';
  renderEditAptItems();
}

async function saveEditApt() {
  if (!_editAptCtx) return;
  if (!_editAptCtx.items.length) { toast('El apartado debe tener al menos un producto', 'error'); return; }
  const { id, sale, items } = _editAptCtx;
  const oldItems = sale.items || [];
  items.forEach(i => { i.subtotal = i.price * (i.qty || 1); });
  const newTotal = items.reduce((s, i) => s + i.subtotal, 0);
  const btn = document.getElementById('edit-apt-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';

  // Ajustes de stock: comparar items viejos vs nuevos
  const stockUpdates = [];
  // Restaurar stock de productos quitados o reducidos
  for (const old of oldItems) {
    const nw = items.find(i => i.id === old.id);
    const diff = (old.qty || 1) - (nw ? nw.qty || 1 : 0);
    if (diff > 0) {
      const p = products.find(x => x.id === old.id);
      if (p) {
        const ns = p.stock + diff;
        stockUpdates.push(api(`products?id=eq.${old.id}`, { method:'PATCH', body:JSON.stringify({ stock: ns, out_of_stock: false }) })
          .then(() => { p.stock = ns; p.outOfStock = false; }));
      }
    }
  }
  // Reducir stock de productos agregados o aumentados
  for (const nw of items) {
    const old = oldItems.find(i => i.id === nw.id);
    const diff = (nw.qty || 1) - (old ? old.qty || 1 : 0);
    if (diff > 0) {
      const p = products.find(x => x.id === nw.id);
      if (p) {
        const ns = Math.max(0, p.stock - diff);
        const patch = { stock: ns };
        if (ns === 0) { patch.out_of_stock = false; patch.is_apartado = true; }
        stockUpdates.push(api(`products?id=eq.${nw.id}`, { method:'PATCH', body:JSON.stringify(patch) })
          .then(() => { p.stock = ns; }));
      }
    }
  }
  await Promise.all(stockUpdates);

  // Anticipo: anular si se solicitó, si no ajustar para que no supere el nuevo total
  const pagado = _editAptCtx.anularPago ? 0 : Math.min(parseFloat(sale.paid_amount || 0), newTotal);
  const patchData = { items, total: newTotal, paid_amount: pagado, discount: null };
  if (_editAptCtx.anularPago) patchData.abonos = null;
  const r = await api(`sales?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patchData)
  });
  btn.disabled = false; btn.textContent = 'Guardar cambios';
  if (!r.ok) { toast('Error al guardar cambios', 'error'); return; }
  const nombre = (sale.customer || '').split(' · 📱 ')[0] || 'cliente';
  logActivity('apartado_editado', `Editó apartado de ${nombre} — nuevo total $${newTotal.toLocaleString('es-MX')}`, { id, total: newTotal });
  closeEditApt();
  toast('Apartado actualizado ✓', 'success');
  loadApartados();
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
  const { id, total, restante, sale } = _liqCtx;
  if (restante <= 0) { toast('Este apartado ya está pagado completo ✓', 'success'); closeLiqModal(); return; }
  const method = _liqMethod;
  const btn    = document.getElementById('liq-confirm-btn');
  btn.disabled = true; btn.textContent = 'Liquidando…';
  const abonos     = Array.isArray(sale?.abonos) ? sale.abonos : [];
  const abonoFinal = { amount: restante, method, date: new Date().toISOString() };
  const liqPatch   = { type:'venta', payment_method:method, paid_amount:total, abonos:[...abonos, abonoFinal] };
  // Apartado sin anticipo (ni abonos previos) → fecha de venta = hoy (día de cobro real)
  if ((parseFloat(sale?.paid_amount) || 0) === 0 && !abonos.length) liqPatch.created_at = new Date().toISOString();
  const r = await api(`sales?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(liqPatch)
  });
  btn.disabled = false; btn.textContent = '✓ Liquidar';
  if (!r.ok) { toast('Error al completar apartado', 'error'); return; }
  // Limpiar is_apartado en los productos de este apartado
  const saleItems = sale?.items || [];
  await Promise.all(saleItems.map(item =>
    api(`products?id=eq.${item.id}`, { method:'PATCH', body:JSON.stringify({ is_apartado: false }) }).catch(()=>{})
  ));
  logActivity('apartado_liquidado', `Liquidó apartado — ${method === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo'}`, { method, restante });
  closeLiqModal();
  toast(`Apartado liquidado ✓ — $${restante.toLocaleString('es-MX')} recibido`, 'success');
  loadApartados(); loadHistory(); loadTodayStats();
}
