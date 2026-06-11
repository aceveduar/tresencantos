/* ── SWIPE TO CLOSE (offcanvas desde la derecha) ── */
function initSwipeToClose(panelId, backdropId, closeFn, backdropBaseOpacity = 0.35) {
  const panel    = document.getElementById(panelId);
  const backdrop = document.getElementById(backdropId);
  if (!panel) return;

  let startX = 0, startY = 0, curX = 0, dragging = false;

  panel.addEventListener('touchstart', e => {
    startX  = e.touches[0].clientX;
    startY  = e.touches[0].clientY;
    dragging = false; curX = 0;
  }, { passive: true });

  panel.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = Math.abs(e.touches[0].clientY - startY);
    if (!dragging) {
      if (Math.abs(dx) > dy && dx > 10) dragging = true;
      else if (dy > 10) return;
    }
    if (!dragging) return;
    curX = Math.max(0, dx);
    panel.style.transition = 'none';
    panel.style.transform  = `translateX(${curX}px)`;
    if (backdrop) {
      backdrop.style.opacity = String(Math.max(0, backdropBaseOpacity * (1 - curX / panel.offsetWidth)));
    }
  }, { passive: true });

  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const threshold = Math.min(110, panel.offsetWidth * 0.32);
    if (curX > threshold) {
      panel.style.transition = 'transform .22s ease-in';
      panel.style.transform  = `translateX(${panel.offsetWidth}px)`;
      if (backdrop) backdrop.style.opacity = '0';
      setTimeout(() => {
        closeFn();
        panel.style.transform = panel.style.transition = '';
        if (backdrop) backdrop.style.opacity = '';
      }, 230);
    } else {
      panel.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
      panel.style.transform  = 'translateX(0)';
      if (backdrop) backdrop.style.opacity = '';
      setTimeout(() => { panel.style.transform = panel.style.transition = ''; }, 280);
    }
    curX = 0;
  });
}

/* ── SWIPE DOWN TO CLOSE (bottom sheets / modales) ── */
function initSwipeDown(sheetEl, closeFn, overlayEl) {
  if (!sheetEl) return;
  let startY = 0, curY = 0, tracking = false;

  sheetEl.addEventListener('touchstart', e => {
    startY   = e.touches[0].clientY;
    tracking = false; curY = 0;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY;
    if (!tracking) {
      if (dy < 10) return;
      // Solo activar si el contenido scrollable está en el tope
      const sc = sheetEl.querySelector('.abonar-modal,.modal-body,.oc-body,[style*="overflow-y"]');
      if (sc && sc.scrollTop > 4) return;
      tracking = true;
    }
    curY = Math.max(0, dy);
    sheetEl.style.transition = 'none';
    sheetEl.style.transform  = `translateY(${curY}px)`;
    if (overlayEl) overlayEl.style.opacity = String(Math.max(0, 1 - curY / 180));
  }, { passive: true });

  sheetEl.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    if (curY > 90) {
      sheetEl.style.transition = 'transform .22s ease-in';
      sheetEl.style.transform  = 'translateY(110%)';
      if (overlayEl) overlayEl.style.opacity = '0';
      setTimeout(() => {
        closeFn();
        sheetEl.style.transform = sheetEl.style.transition = '';
        if (overlayEl) overlayEl.style.opacity = '';
      }, 230);
    } else {
      sheetEl.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
      sheetEl.style.transform  = 'translateY(0)';
      if (overlayEl) overlayEl.style.opacity = '';
      setTimeout(() => { sheetEl.style.transform = sheetEl.style.transition = ''; }, 280);
    }
    curY = 0;
  });
}

/* ── SWIPE LEFT TO REMOVE (cart items) ── */
function applySwipeRemove() {
  document.querySelectorAll('.cart-item[data-pid]').forEach(el => {
    const pid = parseInt(el.dataset.pid);
    let startX = 0, startY = 0, curX = 0, dragging = false;

    el.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = false; curX = 0;
    }, { passive: true });

    el.addEventListener('touchmove', e => {
      const dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (!dragging) {
        if (Math.abs(dx) < 14 || dy > Math.abs(dx)) return;
        if (dx < 0) dragging = true; else return;
      }
      curX = Math.min(0, dx);
      el.style.transition = 'none';
      el.style.transform  = `translateX(${curX}px)`;
      el.style.opacity    = String(Math.max(0.25, 1 + curX / (el.offsetWidth * 0.6)));
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      if (curX < -68) {
        el.style.transition = 'transform .18s ease-in, opacity .18s';
        el.style.transform  = 'translateX(-110%)';
        el.style.opacity    = '0';
        setTimeout(() => removeFromCart(pid), 185);
      } else {
        el.style.transition = 'transform .25s cubic-bezier(.4,0,.2,1), opacity .2s';
        el.style.transform  = 'translateX(0)';
        el.style.opacity    = '';
        setTimeout(() => { el.style.transform = el.style.transition = ''; el.style.opacity = ''; }, 250);
      }
      curX = 0;
    });
  });
}

let _posNameMap = {};
async function loadPosNameMap() {
  const r = await api('config?id=eq.user_names&select=id,value');
  if (r.ok && r.data?.[0]?.value) {
    try { _posNameMap = JSON.parse(r.data[0].value); } catch {}
  }
}
function _sellerLabel(email) {
  if (!email) return null;
  return _posNameMap[email] || email.split('@')[0].replace(/\./g,' ').replace(/\b\w/g, c => c.toUpperCase());
}

function _initLightboxSwipe() {
  const lb = document.getElementById('img-lightbox');
  if (!lb || lb._swipeInited) return;
  lb._swipeInited = true;
  let sy = 0, cy = 0, on = false;
  lb.addEventListener('touchstart', e => {
    sy = e.touches[0].clientY; cy = 0; on = false;
  }, { passive: true });
  lb.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - sy;
    if (!on && dy > 10) on = true;
    if (!on) return;
    cy = Math.max(0, dy);
    const lbImg = document.getElementById('img-lightbox-img');
    if (lbImg) lbImg.style.transform = `translateY(${cy * 0.45}px) scale(${Math.max(0.85, 1 - cy / 700)})`;
    lb.style.background = `rgba(0,0,0,${Math.max(0, 0.88 - cy / 280)})`;
  }, { passive: true });
  lb.addEventListener('touchend', () => {
    if (!on) return; on = false;
    const lbImg = document.getElementById('img-lightbox-img');
    if (cy > 80) {
      closeLightbox();
      if (lbImg) { lbImg.style.transform = ''; lbImg.style.transition = ''; }
      lb.style.background = '';
    } else {
      if (lbImg) { lbImg.style.transition = 'transform .36s cubic-bezier(.34,1.26,.64,1)'; lbImg.style.transform = ''; setTimeout(() => lbImg.style.transition = '', 360); }
      lb.style.background = '';
    }
    cy = 0;
  });
}

/* ── PRODUCT PREVIEW ── */
let _posPrevId = null;

function openPosPreview(id) {
  const p = products.find(x => x.id === id);
  if (p) TE?.track('pos_preview', { id: p.id, name: p.name });
  if (!p) return;
  _posPrevId = id;
  const fallback = PROD_PLACEHOLDER;
  const effStock = getKitStock(p);
  const isKit    = !!(p.kitItems?.length);
  const oos      = isKit ? effStock === 0 : (effStock === 0 || p.outOfStock);

  const img = document.getElementById('pos-preview-img');
  img.src = p.image || fallback;
  img.onerror = function() { this.onerror = null; this.src = fallback; };

  document.getElementById('pos-preview-cat').textContent   = p.categoryLabel || '';
  document.getElementById('pos-preview-name').textContent  = (isKit ? '🎁 ' : '') + p.name;
  document.getElementById('pos-preview-price').textContent = '$' + p.price.toLocaleString('es-MX') + ' MXN';

  let stockHTML = '';
  if (oos)                          stockHTML = '<span style="color:var(--red)">⊘ Agotado</span>';
  else if (isKit)                   stockHTML = `<span style="color:#6B9E78">🎁 ${effStock} kit${effStock!==1?'s':''} disponibles</span>`;
  else if (effStock === 1)          stockHTML = '<span style="color:var(--gold-dark)">⚡ Última pieza</span>';
  else if (effStock >= 2 && effStock <= 5) stockHTML = `<span style="color:var(--gold-dark)">${effStock} piezas disponibles</span>`;
  else                              stockHTML = '<span style="color:#6B9E78">✓ Disponible</span>';
  document.getElementById('pos-preview-stock').innerHTML = stockHTML;

  const descEl = document.getElementById('pos-preview-desc');
  descEl.textContent  = p.description || '';
  descEl.style.display = p.description ? '' : 'none';

  const btn = document.getElementById('pos-preview-add-btn');
  btn.disabled    = oos;
  btn.textContent = oos ? 'Sin stock' : 'Agregar al carrito';
  btn.onclick     = oos ? null : () => { closePosPreview(); addToCart(id); };

  document.getElementById('pos-preview').classList.add('open');
  _initPosPreviewSwipe();
}

function closePosPreview() {
  document.getElementById('pos-preview').classList.remove('open');
}

function _initPosPreviewSwipe() {
  const inner = document.querySelector('.pos-preview-inner');
  if (!inner || inner._swipeInited) return;
  inner._swipeInited = true;
  let sy = null, cy = 0;
  inner.addEventListener('touchstart', e => { sy = e.touches[0].clientY; cy = 0; }, { passive: true });
  inner.addEventListener('touchmove', e => {
    if (sy === null) return;
    const dy = e.touches[0].clientY - sy;
    if (dy > 0) { cy = dy; inner.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  inner.addEventListener('touchend', () => {
    if (cy > 80) { closePosPreview(); }
    inner.style.transform = '';
    sy = null; cy = 0;
  }, { passive: true });
}

function openLightbox(img) {
  document.getElementById('img-lightbox-img').src = img.src;
  const name   = img.dataset.name   || '';
  const price  = img.dataset.price  || '';
  const qty    = parseInt(img.dataset.qty) || 1;
  const seller = img.dataset.seller || '';
  document.getElementById('img-lb-name').textContent = name;
  const priceNum = parseFloat(price);
  const priceStr = qty > 1
    ? `$${priceNum.toLocaleString('es-MX')} × ${qty}`
    : `$${priceNum.toLocaleString('es-MX')}`;
  document.getElementById('img-lb-price').textContent = priceStr;
  const sellerName = _sellerLabel(seller);
  const sellerRow = document.getElementById('img-lb-seller-row');
  document.getElementById('img-lb-seller').textContent = sellerName || '—';
  sellerRow.style.display = sellerName ? '' : 'none';
  document.getElementById('img-lightbox').classList.add('open');
  _initLightboxSwipe();
}
function closeLightbox() {
  document.getElementById('img-lightbox').classList.remove('open');
}

function openApartados() {
  if (window.innerWidth >= 768) {
    const page = document.getElementById('apt-page');
    page.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    _renderAptPageCards(_apartadosAll || []);
    const ps = document.getElementById('apt-page-search');
    if (ps) { ps.value = ''; }
    const pc = document.getElementById('apt-page-search-clear');
    if (pc) pc.style.display = 'none';
  } else {
    document.getElementById('apt-offcanvas').classList.add('open');
    const bd = document.getElementById('apt-backdrop');
    if (bd) { bd.style.display = ''; bd.classList.add('open'); }
    document.body.style.overflow = 'hidden';
  }
}

function closeApartados() {
  document.getElementById('apt-offcanvas').classList.remove('open');
  const bd = document.getElementById('apt-backdrop');
  if (bd) { bd.classList.remove('open'); setTimeout(() => { bd.style.display = 'none'; }, 280); }
  document.body.style.overflow = '';
}

function closeAptPage() {
  document.getElementById('apt-page').style.display = 'none';
  document.body.style.overflow = '';
}

function _renderAptPageCards(data) {
  const grid = document.getElementById('apt-page-list');
  if (!grid) return;
  const count = document.getElementById('apt-page-count');
  if (count) count.textContent = data.length ? `${data.length} activo${data.length !== 1 ? 's' : ''}` : '';
  if (!data.length) {
    grid.innerHTML = '<div class="history-empty" style="grid-column:1/-1"><div style="font-size:2rem;margin-bottom:8px">🔍</div>Sin resultados</div>';
    return;
  }
  grid.innerHTML = data.map(s => {
    const total     = parseFloat(s.total) || 0;
    const pagado    = parseFloat(s.paid_amount || 0);
    const pendiente = Math.max(0, total - pagado);
    const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
    const t         = new Date(s.created_at).toLocaleDateString('es-MX', {day:'numeric',month:'short'});
    const nItems    = Array.isArray(s.items) ? s.items.length : 0;
    const custParts = (s.customer || '').split(' · 📱 ');
    const nombre    = custParts[0] || 'Sin nombre';
    const telNum    = custParts[1] || '';
    let dueHTML = '';
    let isOverdue = false;
    if (s.due_date) {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const due = new Date(s.due_date + 'T00:00:00');
      const diff = Math.round((due - hoy) / 86400000);
      isOverdue = diff < 0;
      const dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
      const dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)}d` : diff === 0 ? 'Vence hoy' : `Vence ${due.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}`;
      dueHTML = `<div class="apc-due" style="color:${dueColor}">📅 ${dueText}</div>`;
    }
    return `<div class="apc-card${isOverdue ? ' apt-overdue' : ''}" onclick="openAptDetail(${s.id})">
  <div class="apc-top">
    <span class="apc-name">👤 ${_esc(nombre)}</span>
    <span class="apc-pending${pendiente === 0 ? ' zero' : ''}">${pendiente === 0 ? '✓ Listo' : '$' + pendiente.toLocaleString('es-MX')}</span>
  </div>
  <div class="apc-meta">${t} · ${nItems} prod.${telNum ? ' · 📱 ' + telNum : ''}</div>
  ${dueHTML}
  <div class="apc-bar"><div class="apc-fill" style="width:${pct}%"></div></div>
</div>`;
  }).join('');
}

function openAptDetail(id) {
  const s = (_apartadosData || {})[id];
  if (!s) return;
  const total     = parseFloat(s.total) || 0;
  const pagado    = parseFloat(s.paid_amount || 0);
  const pendiente = Math.max(0, total - pagado);
  const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
  const t         = new Date(s.created_at).toLocaleDateString('es-MX', {day:'numeric',month:'short', year:'numeric'});
  const nItems    = Array.isArray(s.items) ? s.items.length : 0;
  const custParts = (s.customer || '').split(' · 📱 ');
  const nombre    = custParts[0] || 'Sin nombre';
  const telNum    = custParts[1] || '';

  document.getElementById('adm-customer').textContent = '👤 ' + nombre;
  document.getElementById('adm-meta').textContent = t + ' · ' + nItems + ' producto' + (nItems !== 1 ? 's' : '') + (telNum ? ' · 📱 ' + telNum : '');

  // Items
  const itemsHTML = (s.items || []).map(i => {
    const prod     = products.find(x => x.id === i.id);
    const img      = prod?.image || i.image || '';
    const price    = (i.subtotal ?? i.price * (i.qty || 1)).toLocaleString('es-MX');
    const kitComps = prod?.kitItems || i.kit_items;
    const kitHTML  = Array.isArray(kitComps) && kitComps.length
      ? kitComps.map(c => `<div style="font-size:.68rem;color:#9B8B78;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${_esc(c.name)}${c.qty > 1 ? ' ×' + c.qty : ''}</div>`).join('')
      : '';
    return `<div class="apt-item-row" onclick="_aptItemPopup(${i.id},this)">
      <img class="apt-item-thumb" src="${img}" onerror="this.style.visibility='hidden'" alt="">
      <div class="apt-item-info"><div class="apt-item-name">${_esc(i.name)}</div>${kitHTML}</div>
      <div class="apt-item-right">
        <span class="apt-item-price">$${price}</span>
        <span class="apt-item-qty">×${i.qty || 1}</span>
      </div>
    </div>`;
  }).join('');

  // Abonos
  const abonos = Array.isArray(s.abonos) ? s.abonos : [];
  const abonosHTML = abonos.length ? `
<div class="apt-abonos" style="margin-top:12px">
  <div class="apt-abonos-title" onclick="_toggleAbonos(this)">Historial de pagos <span class="apt-abonos-toggle">▼</span></div>
  <div class="apt-abonos-body" style="max-height:0">
    ${abonos.map(a => {
      const fecha = new Date(a.date).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
      const ico   = a.method === 'transferencia' ? '📱' : '💵';
      return `<div class="apt-abono-row"><span>${fecha} · ${ico} ${a.method}</span><span class="apt-abono-amount">$${parseFloat(a.amount).toLocaleString('es-MX')}</span></div>`;
    }).join('')}
  </div>
</div>` : '';

  // Due date
  let dueAlertHTML = '';
  if (s.due_date) {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const due = new Date(s.due_date + 'T00:00:00');
    const diff = Math.round((due - hoy) / 86400000);
    const dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
    const dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)} día${Math.abs(diff)!==1?'s':''}` : diff === 0 ? 'Vence hoy' : `Vence el ${due.toLocaleDateString('es-MX',{day:'numeric',month:'long'})}`;
    dueAlertHTML = `<div style="font-size:.76rem;font-weight:700;color:${dueColor};margin-bottom:10px">📅 ${dueText}</div>`;
  }

  document.getElementById('adm-body').innerHTML = `
    ${dueAlertHTML}
    <div class="adm-section-title">Productos</div>
    <div class="apt-items-list" style="margin-bottom:12px">${itemsHTML}</div>
    ${abonosHTML}
    <div class="apt-progress-section" style="margin-top:14px">
      <div class="apt-progress-track"><div class="apt-progress-fill" style="width:${pct}%"></div></div>
      <div class="apt-amounts-row" style="margin-top:4px">
        <span class="apt-paid-lbl">✓ Pagado $${pagado.toLocaleString('es-MX')} (${pct}%)</span>
        <span class="apt-pending-lbl">Pendiente $${pendiente.toLocaleString('es-MX')}</span>
      </div>
    </div>`;

  // Footer buttons
  const editBtn = canEditApartado()
    ? `<button class="btn-edit-apt adm-footer" onclick="closeAptDetail();openEditApartado(${id})" title="Editar" style="width:40px;height:40px;border-radius:10px;border:1.5px solid var(--border);background:#F7F2EB;color:var(--charcoal);font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0">✏️</button>` : '';
  const cancelBtn = canEditApartado()
    ? `<button class="btn-cancelar-apt" onclick="cancelApartado(${id})" title="Cancelar apartado" style="width:40px;height:40px;border-radius:10px;margin-left:auto">✕</button>` : '';
  document.getElementById('adm-footer').innerHTML = `
    <button class="btn-wa-reminder" onclick="sendApartadoReminder(${id})" title="Recordatorio WhatsApp">💬</button>
    ${editBtn}
    <button class="btn-abonar" onclick="closeAptDetail();abonarApartado('${id}','${total}','${pagado}','${_esc(nombre).replace(/'/g,"\\'")}')">+ Abonar</button>
    <button class="btn-liquidar" onclick="closeAptDetail();openLiqModal(${id})">✓ Liquidar</button>
    ${cancelBtn}`;

  const modal = document.getElementById('apt-detail-modal');
  modal.style.display = 'flex';
}

function closeAptDetail() {
  document.getElementById('apt-detail-modal').style.display = 'none';
}

function _aptDetailBackdrop(e) {
  if (e.target === document.getElementById('apt-detail-modal')) closeAptDetail();
}

function clearAptPageSearch() {
  const el = document.getElementById('apt-page-search');
  if (el) { el.value = ''; el.focus(); }
  const c = document.getElementById('apt-page-search-clear');
  if (c) c.style.display = 'none';
  _renderAptPageCards(_apartadosAll || []);
  const count = document.getElementById('apt-page-count');
  const n = (_apartadosAll || []).length;
  if (count) count.textContent = n ? `${n} activo${n !== 1 ? 's' : ''}` : '';
}

function openHistory() {
  document.getElementById('history-offcanvas').classList.add('open');
  document.getElementById('history-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeHistory() {
  document.getElementById('history-offcanvas').classList.remove('open');
  document.getElementById('history-backdrop').classList.remove('open');
  document.body.style.overflow = '';
}

async function loadHistory() {
  const result = await api(`sales?select=id,total,created_at,items,payment_method,type,customer,discount,note,paid_amount,abonos,seller_email&order=created_at.desc&limit=50`);
  const el = document.getElementById('history-list');
  if (!result.ok || !result.data?.length) {
    salesCache = {};
    el.innerHTML = '<div class="history-empty">Sin ventas registradas</div>';
    return;
  }
  salesCache = {};
  result.data.forEach(s => { salesCache[s.id] = s; });

  // Convertir fecha UTC → clave YYYY-MM-DD en horario de México
  const TZ = 'America/Mexico_City';
  const mxDateKey = iso => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso));
  const hoy  = mxDateKey(new Date().toISOString());
  const ayer = mxDateKey(new Date(Date.now() - 86400000).toISOString());
  const ventas = result.data;

  // Agrupar por día en horario México
  const grupos = {};
  ventas.forEach(s => {
    // Apartados sin anticipo: no son dinero recibido, se omiten del historial
    if (s.type === 'apartado' && !(parseFloat(s.paid_amount) > 0)) return;
    const dia = mxDateKey(s.created_at);
    if (!grupos[dia]) grupos[dia] = [];
    grupos[dia].push(s);
  });

  const html = Object.entries(grupos).map(([dia, sales]) => {
    const titulo = dia === hoy  ? 'Hoy'
                 : dia === ayer ? 'Ayer'
                 : new Date(dia + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

    const cards = sales.map(s => {
      const t = new Date(s.created_at);
      const hora = t.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', timeZone: TZ });
      const total    = parseFloat(s.total) || 0;
      const disc     = parseFloat(s.discount) || 0;
      const items    = Array.isArray(s.items) ? s.items : [];
      const totalQty = items.reduce((n, i) => n + (i.qty || 1), 0);

      const isApt  = s.type === 'apartado';
      const abonos = Array.isArray(s.abonos) ? s.abonos : [];
      const isLiquidado = !isApt && abonos.length > 0; // Apartado que se completó
      const pagado = parseFloat(s.paid_amount || 0);
      const payBadge = isApt
        ? '<span class="pay-badge" style="font-size:.62rem;background:#FFF8EE;color:#C9A462;border:1px solid #C9A462;padding:2px 6px;border-radius:50px;font-weight:700">📌 Apartado</span>'
        : isLiquidado
          ? '<span class="pay-badge" style="font-size:.62rem;background:#ECFDF5;color:#2D6A4F;border:1px solid #2D6A4F;padding:2px 6px;border-radius:50px;font-weight:700">✅ Completado</span>'
          : s.payment_method === 'transferencia'
            ? '<span class="pay-badge pay-transferencia" style="font-size:.62rem">📱</span>'
            : '<span class="pay-badge pay-efectivo" style="font-size:.62rem">💵</span>';

      const THUMB_PH = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2228%22 height=%2228%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23D1C4B8%22 stroke-width=%221.5%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpath d=%22m21 15-5-5L5 21%22/%3E%3C/svg%3E';
      const itemsHTML = items.map(i => {
        const cur = products.find(p => p.id === i.id);
        const img = cur?.image || THUMB_PH;
        const displayName = _esc(cur?.name || i.name);
        return `
<div class="hi-item">
  <img class="hi-item-thumb" src="${img}" alt="${displayName}" onerror="this.src='${THUMB_PH}'" data-name="${displayName}" data-price="${i.price}" data-qty="${i.qty||1}" data-seller="${s.seller_email||''}" onclick="event.stopPropagation();openLightbox(this)" style="cursor:zoom-in">
  <span class="hi-item-name">${displayName}</span>
  <span class="hi-item-qty">×${i.qty || 1}</span>
  <span class="hi-item-sub">$${((i.subtotal ?? i.price * (i.qty || 1))).toLocaleString('es-MX')}</span>
</div>`;
      }).join('');

      // Historial de pagos (abonos ya declarado arriba)
      const abonosHiHTML = abonos.length ? `
<div style="margin:5px 0 2px;display:flex;flex-direction:column;gap:3px;border-top:1px dashed #EDE5DC;padding-top:5px">
  ${abonos.map(a => {
    const fd  = new Date(a.date).toLocaleDateString('es-MX',{day:'numeric',month:'short'});
    const ico = a.method === 'transferencia' ? '📱' : '💵';
    return `<div style="display:flex;justify-content:space-between;font-size:.72rem;color:#9B8B78"><span>${fd} · ${ico} ${a.method}</span><span style="font-weight:700;color:var(--charcoal)">$${parseFloat(a.amount).toLocaleString('es-MX')}</span></div>`;
  }).join('')}
</div>` : '';

      const tags = [];
      if (disc > 0)   tags.push(`<span class="hi-tag discount">🏷 −$${disc.toLocaleString('es-MX')}</span>`);
      if (s.note)     tags.push(`<span class="hi-tag note">📝 ${_esc(s.note)}</span>`);
      if (s.customer) tags.push(`<span class="hi-tag customer">👤 ${_esc((s.customer||'').split(' · 📱 ')[0])}</span>`);
      const footerHTML = tags.length ? `<div class="hi-footer">${tags.join('')}</div>` : '';

      return `
<div class="hi-card${isApt ? ' hi-card-apt' : ''}">
  <div class="hi-head">
    <span class="hi-time">${hora} · ${totalQty} art.</span>
    <span class="hi-spacer"></span>
    ${payBadge}
    <span class="hi-total"${isApt ? ' title="Anticipo recibido"' : ''}>$${(isApt ? pagado : total).toLocaleString('es-MX')}${isApt ? '<span style="font-size:.65rem;color:#9B8B78;font-weight:400;margin-left:3px">anticipo</span>' : ''}</span>
    ${canCancelSale() ? `<button class="hi-del" onclick="deleteSale(${s.id})" title="Cancelar">✕</button>` : ''}
  </div>
  <div class="hi-items">${itemsHTML || '<div style="color:#9B8B78;font-size:.78rem;padding:4px 0">Sin detalle</div>'}</div>
  ${abonosHiHTML}
  ${footerHTML}
</div>`;
    }).join('');

    return `<div class="hi-date-sep">${titulo}</div>${cards}`;
  }).join('');

  el.innerHTML = html || '<div class="history-empty">Sin ventas completadas</div>';
}

async function deleteSale(id) {
  if (!canCancelSale()) { toast('Solo el administrador puede cancelar ventas', 'error'); return; }
  const sale = salesCache[id];
  if (!sale) { toast('Registro no encontrado', 'error'); return; }

  const isApt      = sale.type === 'apartado';
  const abonos     = Array.isArray(sale.abonos) ? sale.abonos : [];
  const wasApartado = !isApt && abonos.length > 0; // venta que vino de un apartado liquidado
  const total      = parseFloat(sale.total).toLocaleString('es-MX');
  const itemCount  = Array.isArray(sale.items) ? sale.items.length : 0;
  const label      = isApt ? 'apartado' : 'venta';

  // Si fue un apartado liquidado, ofrecer revertir antes de eliminar
  if (wasApartado) {
    const custParts = (sale.customer || '').split(' · 📱 ');
    const nombre    = custParts[0] || 'Sin nombre';
    const revert = confirm(`Esta venta viene de un apartado liquidado de ${nombre}.\n\n¿Regresar como apartado pendiente?\n\nAceptar = regresar como apartado (no restaura stock)\nCancelar = eliminar completamente (restaura stock)`);
    if (revert) {
      const prevAbonos = abonos.slice(0, -1); // quitar el último abono (la liquidación)
      const prevPagado = prevAbonos.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
      const r = await api(`sales?id=eq.${id}`, { method:'PATCH', body: JSON.stringify({
        type: 'apartado',
        paid_amount: prevPagado,
        abonos: prevAbonos.length > 0 ? prevAbonos : null
      })});
      if (!r.ok) { toast('Error al revertir', 'error'); return; }
      delete salesCache[id];
      await loadHistory();
      await loadApartados();
      toast(`Apartado de ${nombre} restaurado ✓`, 'success');
      return;
    }
    if (!confirm(`¿Eliminar la venta de $${total} (${itemCount} artículo${itemCount !== 1 ? 's' : ''}) completamente?\n\nSe restaurará el stock.`)) return;
  } else {
    if (!confirm(`¿Cancelar el ${label} de $${total} (${itemCount} artículo${itemCount !== 1 ? 's' : ''})?\n\nSe restaurará el stock de los productos.`)) return;
  }

  // 1. Eliminar el registro
  const delResult = await api(`sales?id=eq.${id}`, { method: 'DELETE' });
  if (!delResult.ok) { toast(`Error al cancelar el ${label}`, 'error'); return; }

  // 2. Restaurar stock en paralelo
  if (Array.isArray(sale.items)) {
    const restores = [];
    for (const item of sale.items) {
      const p = products.find(x => x.id === item.id);
      if (p?.kitItems?.length) {
        for (const comp of p.kitItems) {
          const lc = products.find(x => x.id === comp.id);
          const newStock = (lc ? lc.stock : 0) + (item.qty || 1) * comp.qty;
          restores.push(
            api(`products?id=eq.${comp.id}`, { method:'PATCH', body:JSON.stringify({ stock: newStock, out_of_stock: false, is_apartado: false }) })
              .then(() => { if (lc) { lc.stock = newStock; lc.outOfStock = false; } })
          );
        }
      } else {
        const newStock = (p ? p.stock : 0) + (item.qty || 1);
        restores.push(
          api(`products?id=eq.${item.id}`, { method:'PATCH', body:JSON.stringify({ stock: newStock, out_of_stock: false, is_apartado: false }) })
            .then(() => { if (p) { p.stock = newStock; p.outOfStock = false; } })
        );
      }
    }
    await Promise.all(restores);
  }

  // 3. Registrar actividad
  const totalNum = parseFloat(sale.total) || 0;
  if (isApt) {
    const nombre = (sale.customer || '').split(' · 📱 ')[0] || 'Sin nombre';
    logActivity('apartado_cancelado',
      `Canceló apartado de ${nombre} — $${totalNum.toLocaleString('es-MX')}`,
      { customer: nombre, total: totalNum, pagado: parseFloat(sale.paid_amount || 0), items: itemCount });
  } else {
    logActivity('venta_cancelada',
      `Canceló venta de $${totalNum.toLocaleString('es-MX')} — ${itemCount} producto${itemCount !== 1 ? 's' : ''}`,
      { total: totalNum, items: itemCount, method: sale.payment_method, itemIds: (sale.items || []).map(i => i.id) });
  }

  // 4. Refrescar UI
  delete salesCache[id];
  await loadHistory();
  await loadTodayStats();
  if (isApt) await loadApartados();
  showAllProducts();
  toast(`${isApt ? 'Apartado cancelado' : 'Venta eliminada'} y stock restaurado ✓`, 'success');
}
