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
        closeLightbox();
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

/* ── PRODUCT PREVIEW ── */
function openPosPreview(id) {
  const p = products.find(x => x.id === id);
  if (p) TE?.track('pos_preview', { id: p.id, name: p.name });
  if (!p) return;
  const fallback = PROD_PLACEHOLDER;
  const effStock = getKitStock(p);
  const isKit    = Array.isArray(p.kitItems);
  const oos      = isKit ? effStock === 0 : (effStock === 0 || p.outOfStock);

  const img = document.getElementById('pos-preview-img');
  img.src = p.image || fallback;
  img.onerror = function() { this.onerror = null; this.src = fallback; };
  img.onclick = function(e) { e.stopPropagation(); openLightbox(this); };
  img.dataset.name = p.name;
  img.dataset.price = p.price;
  img.dataset.qty = 1;

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
  document.body.style.overscrollBehaviorY = 'none';
  _initPosPreviewSwipe();
}

function closePosPreview() {
  document.getElementById('pos-preview').classList.remove('open');
  document.body.style.overscrollBehaviorY = '';
}

function _initPosPreviewSwipe() {
  const inner = document.querySelector('.pos-preview-inner');
  const overlay = document.getElementById('pos-preview');
  if (!inner || inner._swipeInited) return;
  inner._swipeInited = true;
  let sy = null, cy = 0, on = false;
  inner.addEventListener('touchstart', e => { sy = e.touches[0].clientY; cy = 0; on = false; }, { passive: true });
  inner.addEventListener('touchmove', e => {
    if (sy === null) return;
    const dy = e.touches[0].clientY - sy;
    if (!on && dy < 10) return;
    on = true;
    e.preventDefault();
    cy = Math.max(0, dy);
    inner.style.transition = 'none';
    inner.style.transform = `translateY(${cy}px)`;
    if (overlay) overlay.style.opacity = String(Math.max(0, 1 - cy / 200));
  }, { passive: false });
  inner.addEventListener('touchend', () => {
    if (!on) return; on = false;
    if (cy > 90) {
      inner.style.transition = 'transform .22s ease-in';
      inner.style.transform = 'translateY(110%)';
      if (overlay) overlay.style.opacity = '0';
      setTimeout(() => { closePosPreview(); inner.style.transform = inner.style.transition = ''; if (overlay) overlay.style.opacity = ''; }, 230);
    } else {
      inner.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
      inner.style.transform = 'translateY(0)';
      if (overlay) overlay.style.opacity = '';
      setTimeout(() => { inner.style.transform = inner.style.transition = ''; }, 280);
    }
    sy = null; cy = 0;
  }, { passive: true });
}

function openLightbox(img) {
  document.getElementById('img-lightbox-img').src = _driveSz(img.src, 900);
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
  document.body.style.overscrollBehaviorY = 'none';
  _initLightboxSwipe();
}
function closeLightbox() {
  document.getElementById('img-lightbox').classList.remove('open');
  document.body.style.overscrollBehaviorY = '';
}

let _aptDueFilter = 'todos';
let _aptPanelLastFocus = null;
let _aptDetailLastFocus = null;

function _aptDueFiltered(data, filter = _aptDueFilter) {
  const rows = Array.isArray(data) ? data : [];
  if (filter === 'todos') return rows;

  const todayKey = _posMexicoDayKey();

  return rows.filter(sale => {
    if (!sale.due_date) return filter === 'sin-fecha';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sale.due_date)) return filter === 'sin-fecha';
    const diff = _posDayKeyDiff(sale.due_date, todayKey);
    if (filter === 'vencidos') return diff < 0;
    if (filter === 'proximos') return diff >= 0 && diff <= 7;
    return true;
  }).sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
}

function _syncAptDueFilterUI() {
  document.querySelectorAll('.apt-due-filter').forEach(button => {
    const selected = button.dataset.dueFilter === _aptDueFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function _aptFilterByCustomer(data, query) {
  const normalizedQuery = (query || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!normalizedQuery) return data;
  return data.filter(sale => (sale.customer || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalizedQuery));
}

function filterApartadosWithDue(query, target = 'offcanvas') {
  const isLiquidado = _aptViewMode === 'liquidados';
  const source = isLiquidado
    ? (_apartadosLiquidadosAll || [])
    : _aptDueFiltered(_apartadosAll || []);
  const filtered = _aptFilterByCustomer(source, query);
  const clearButton = document.getElementById(target === 'page' ? 'apt-page-search-clear' : 'apt-search-clear');
  if (clearButton) clearButton.style.display = query.trim() ? '' : 'none';
  if (target === 'page') _renderAptPageCards(filtered, isLiquidado);
  else _renderApartadoCards(filtered, isLiquidado);
}

function setAptDueFilter(filter, target = window.innerWidth >= 768 ? 'page' : 'offcanvas') {
  _aptDueFilter = ['todos', 'vencidos', 'proximos', 'sin-fecha'].includes(filter) ? filter : 'todos';
  _syncAptDueFilterUI();
  const search = document.getElementById(target === 'page' ? 'apt-page-search' : 'apt-search');
  filterApartadosWithDue(search?.value || '', target);
}

function aptViewTabKeydown(event, target) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...document.querySelectorAll(`#apt-view-toggle-${target} [role="tab"]`)];
  if (!tabs.length) return;
  event.preventDefault();
  const current = Math.max(0, tabs.indexOf(document.activeElement));
  const next = event.key === 'Home'
    ? tabs[0]
    : event.key === 'End'
      ? tabs[tabs.length - 1]
      : tabs[(current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  next.focus();
  next.click();
}

async function selectAptView(mode, target) {
  const current = await toggleAptView(mode, target);
  if (current === false) return;
  document.querySelectorAll(`#apt-view-toggle-${target} [role="tab"]`).forEach(button => {
    const selected = button.dataset.mode === mode;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  const dueFilters = document.getElementById(`apt-due-filters-${target}`);
  if (dueFilters) dueFilters.hidden = mode === 'liquidados';
  const search = document.getElementById(target === 'page' ? 'apt-page-search' : 'apt-search');
  filterApartadosWithDue(search?.value || '', target);
}

function openApartados(dueFilter = 'todos') {
  // Siempre regresa a "Activos" al abrir, sin importar cómo se dejó la última vez
  _aptPanelLastFocus = document.activeElement;
  _aptDueFilter = ['todos', 'vencidos', 'proximos', 'sin-fecha'].includes(dueFilter) ? dueFilter : 'todos';
  _aptViewMode = 'activos';
  document.querySelectorAll('.apt-view-toggle button').forEach(b => {
    const selected = b.dataset.mode === 'activos';
    b.classList.toggle('active', selected);
    b.setAttribute('aria-selected', String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.apt-due-filters').forEach(filters => { filters.hidden = false; });
  _syncAptDueFilterUI();

  if (window.innerWidth >= 768) {
    const page = document.getElementById('apt-page');
    page.style.display = 'flex';
    page.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    _renderAptPageCards(_aptDueFiltered(_apartadosAll || []));
    const ps = document.getElementById('apt-page-search');
    if (ps) { ps.value = ''; }
    const pc = document.getElementById('apt-page-search-clear');
    if (pc) pc.style.display = 'none';
    requestAnimationFrame(() => document.querySelector('#apt-page .apt-page-back')?.focus());
  } else {
    const offcanvas = document.getElementById('apt-offcanvas');
    offcanvas.classList.add('open');
    offcanvas.setAttribute('aria-hidden', 'false');
    const bd = document.getElementById('apt-backdrop');
    if (bd) { bd.style.display = ''; bd.classList.add('open'); }
    document.body.style.overflow = 'hidden';
    _renderApartadoCards(_aptDueFiltered(_apartadosAll || []));
    requestAnimationFrame(() => offcanvas.querySelector('.history-oc-close')?.focus());
  }
  loadApartados();
}

function closeApartados() {
  const offcanvas = document.getElementById('apt-offcanvas');
  offcanvas.classList.remove('open');
  offcanvas.setAttribute('aria-hidden', 'true');
  const bd = document.getElementById('apt-backdrop');
  if (bd) { bd.classList.remove('open'); setTimeout(() => { bd.style.display = 'none'; }, 280); }
  document.body.style.overflow = '';
  _aptPanelLastFocus?.focus?.();
}

function closeAptPage() {
  const page = document.getElementById('apt-page');
  page.style.display = 'none';
  page.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  _aptPanelLastFocus?.focus?.();
}

function _renderAptPageCards(data, isLiquidado) {
  const grid = document.getElementById('apt-page-list');
  if (!grid) return;
  const count = document.getElementById('apt-page-count');
  if (count) count.textContent = data.length ? `${data.length} ${isLiquidado ? 'liquidado' : 'activo'}${data.length !== 1 ? 's' : ''}` : '';
  if (!data.length) {
    grid.innerHTML = `<div class="history-empty" style="grid-column:1/-1"><div style="font-size:2rem;margin-bottom:8px">${isLiquidado ? '✅' : '🔍'}</div>Sin ${isLiquidado ? 'apartados liquidados' : 'resultados'}</div>`;
    return;
  }
  grid.innerHTML = data.map(s => {
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

    if (isLiquidado) {
      return `<button type="button" class="apc-card" onclick="openAptDetail(${s.id})" aria-label="Ver apartado liquidado de ${_esc(nombre)}, total $${total.toLocaleString('es-MX')}">
  <span class="apc-top">
    <span class="apc-name">👤 ${_esc(nombre)}</span>
    <span class="apc-pending zero">✓ Liquidado</span>
  </span>
  <span class="apc-meta">${t} · ${nItems} prod.${telNum ? ' · 📱 ' + telNum : ''} · $${total.toLocaleString('es-MX')}</span>
</button>`;
    }

    let dueHTML = '';
    let isOverdue = false;
    if (s.due_date) {
      const diff = _posDayKeyDiff(s.due_date);
      isOverdue = diff < 0;
      const dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
      const dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)}d` : diff === 0 ? 'Vence hoy' : `Vence ${_posFormatDayKey(s.due_date,{day:'numeric',month:'short'})}`;
      dueHTML = `<span class="apc-due" style="color:${dueColor}">📅 ${dueText}</span>`;
    }
    return `<button type="button" class="apc-card${isOverdue ? ' apt-overdue' : ''}" onclick="openAptDetail(${s.id})" aria-label="Ver apartado de ${_esc(nombre)}, falta $${pendiente.toLocaleString('es-MX')}${isOverdue ? ', vencido' : ''}">
  <span class="apc-top">
    <span class="apc-name">👤 ${_esc(nombre)}</span>
    <span class="apc-pending${pendiente === 0 ? ' zero' : ''}">${pendiente === 0 ? '✓ Listo' : 'Falta $' + pendiente.toLocaleString('es-MX')}</span>
  </span>
  <span class="apc-meta">${t} · ${nItems} prod.${telNum ? ' · 📱 ' + telNum : ''}</span>
  ${dueHTML}
  <span class="apc-bar" role="progressbar" aria-label="Progreso de pago" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span class="apc-fill" style="width:${pct}%"></span></span>
</button>`;
  }).join('');
}

function openAptDetail(id) {
  const s = (_apartadosData || {})[id];
  if (!s) return;
  _aptDetailLastFocus = document.activeElement;
  const total     = parseFloat(s.total) || 0;
  const pagado    = parseFloat(s.paid_amount || 0);
  const pendiente = Math.max(0, total - pagado);
  const pct       = total > 0 ? Math.min(100, Math.round(pagado / total * 100)) : 0;
  const t         = _posFormatTimestamp(s.created_at, {day:'numeric',month:'short', year:'numeric'});
  const nItems    = Array.isArray(s.items) ? s.items.length : 0;
  const custParts = (s.customer || '').split(' · 📱 ');
  const nombre    = custParts[0] || 'Sin nombre';
  const telNum    = custParts[1] || '';

  document.getElementById('adm-customer').textContent = '👤 ' + nombre;
  document.getElementById('adm-meta').textContent = t + ' · ' + nItems + ' producto' + (nItems !== 1 ? 's' : '') + (telNum ? ' · 📱 ' + telNum : '');

  // Items
  const itemsHTML = (s.items || []).map(i => {
    const prod     = products.find(x => x.id === i.id);
    const img      = _driveSz(prod?.image || i.image || '', 80);
    const qty      = i.qty || 1;
    const sub      = i.subtotal ?? i.price * qty;
    const kitComps = Object.prototype.hasOwnProperty.call(i, 'kit_items') ? i.kit_items : prod?.kitItems;
    const kitHTML  = Array.isArray(kitComps) && kitComps.length
      ? kitComps.map(c => `<div style="font-size:.68rem;color:#9B8B78;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${_esc(c.name)}${c.qty > 1 ? ' ×' + c.qty : ''}</div>`).join('')
      : '';
    const priceLabel = qty > 1
      ? `<span class="apt-item-price">$${sub.toLocaleString('es-MX')}</span><span class="apt-item-qty">$${i.price.toLocaleString('es-MX')} ×${qty}</span>`
      : `<span class="apt-item-price">$${sub.toLocaleString('es-MX')}</span>`;
    return `<div class="apt-item-row"${prod?.image ? ` role="button" tabindex="0" aria-label="Ver imagen de ${_esc(i.name)}" onclick="_aptItemPopup(${i.id},this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_aptItemPopup(${i.id},this)}"` : ''}>
      <img class="apt-item-thumb" src="${img}" onerror="this.style.visibility='hidden'" alt="">
      <div class="apt-item-info"><div class="apt-item-name">${_esc(i.name)}</div>${kitHTML}</div>
      <div class="apt-item-right">${priceLabel}</div>
    </div>`;
  }).join('');

  const abonos = Array.isArray(s.payment_history) ? s.payment_history
    : Array.isArray(s.abonos) ? s.abonos : [];
  const paymentHistoryWarning = s.payment_history_error
    ? '<div style="font-size:.74rem;color:var(--red);margin-top:8px">⚠ Historial incompleto; recarga para consultar el libro de pagos.</div>'
    : '';

  const isLiquidado = _isApartadoLiquidado(s);

  // Due date — sin sentido para un apartado ya liquidado
  let dueAlertHTML = '';
  if (s.due_date && !isLiquidado) {
    const diff = _posDayKeyDiff(s.due_date);
    const dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
    const dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)} día${Math.abs(diff)!==1?'s':''}` : diff === 0 ? 'Vence hoy' : `Vence el ${_posFormatDayKey(s.due_date,{day:'numeric',month:'long'})}`;
    dueAlertHTML = `<div style="font-size:.76rem;font-weight:700;color:${dueColor};margin-bottom:10px">📅 ${dueText}</div>`;
  }

  const disc = parseFloat(s.discount) || 0;
  const subtotal = disc > 0 ? total + disc : 0;

  const summaryRows = [];
  if (disc > 0) {
    summaryRows.push(`<div class="apt-sum-row"><span>Subtotal</span><span>$${subtotal.toLocaleString('es-MX')}</span></div>`);
    summaryRows.push(`<div class="apt-sum-row apt-sum-disc"><span>🏷 Descuento</span><span>−$${disc.toLocaleString('es-MX')}</span></div>`);
  }
  summaryRows.push(`<div class="apt-sum-row apt-sum-total"><span>Total</span><span>$${total.toLocaleString('es-MX')}</span></div>`);

  const abonosVisible = abonos.length ? abonos.map(a => {
    const meta = typeof _apartadoPaymentMeta === 'function'
      ? _apartadoPaymentMeta(a)
      : { amount: parseFloat(a.amount) || 0, dateLabel: 'Histórico', method: a.method || 'sin registrar', icon: '🧾' };
    const amountLabel = `${meta.amount < 0 ? '−' : ''}$${Math.abs(meta.amount).toLocaleString('es-MX')}`;
    return `<div class="apt-abono-row"><span>${meta.dateLabel} · ${meta.icon} ${_esc(meta.method)}</span><span class="apt-abono-amount"${meta.amount < 0 ? ' style="color:var(--red)"' : ''}>${amountLabel}</span></div>`;
  }).join('') : '';

  document.getElementById('adm-body').innerHTML = `
    ${dueAlertHTML}
    <div class="adm-section-title">Productos</div>
    <div class="apt-items-list">${itemsHTML}</div>
    <div class="apt-summary">
      ${summaryRows.join('')}
    </div>
    <div class="apt-progress-section">
      <div class="apt-progress-track" role="progressbar" aria-label="Progreso de pago" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="apt-progress-fill" style="width:${pct}%"></div></div>
      <div class="apt-amounts-row">
        <span class="apt-paid-lbl">✓ Pagado $${pagado.toLocaleString('es-MX')}</span>
        <span class="apt-pending-lbl">${pendiente > 0 ? 'Pendiente $' + pendiente.toLocaleString('es-MX') : '✓ Liquidado'}</span>
      </div>
    </div>
    ${abonosVisible || paymentHistoryWarning ? `<div class="apt-abonos-section"><div class="adm-section-title">Historial de pagos</div>${paymentHistoryWarning}${abonosVisible}</div>` : ''}`;

  // Un apartado liquidado no admite abonar, liquidar, editar ni cancelar desde esta ficha.
  // pendiente<=0 cubre el caso de un registro local desfasado (otra caja ya liquidó
  // o dato aún no refrescado) que isLiquidado no detectaría por venir de status/type.
  if (isLiquidado || pendiente <= _APT_MONEY_EPSILON) {
    const reopenBtn = canEditApartado() && pagado > 0
      ? `<button type="button" class="btn-abonar" id="adm-refund-btn" onclick="refundApartado(${id},'detail')" style="border-color:var(--red);color:var(--red)">↩ Reabrir y reembolsar</button>`
      : '';
    document.getElementById('adm-footer').innerHTML =
      `<button type="button" class="btn-wa-reminder" onclick="sendApartadoReminder(${id})" aria-label="Enviar por WhatsApp" title="Enviar por WhatsApp">💬</button>
       ${reopenBtn || '<span style="flex:1;text-align:center;font-size:.82rem;font-weight:700;color:var(--green)">✓ Liquidado</span>'}`;
  } else {
    const editBtn = canEditApartado()
      ? `<button type="button" class="btn-edit-apt" onclick="closeAptDetail();openEditApartado(${id})" aria-label="Editar apartado" title="Editar apartado">✏️</button>` : '';
    const cancelBtn = canCancelApartado()
      ? `<button type="button" class="btn-cancelar-apt" onclick="cancelApartado(${id})" aria-label="Cancelar apartado" title="Cancelar apartado">✕</button>` : '';
    document.getElementById('adm-footer').innerHTML = `
      <button type="button" class="btn-wa-reminder" onclick="sendApartadoReminder(${id})" aria-label="Enviar recordatorio por WhatsApp" title="Recordatorio WhatsApp">💬</button>
      ${editBtn}
      <button type="button" class="btn-abonar" onclick="closeAptDetail();abonarApartado('${id}','${total}','${pagado}','${_esc(nombre).replace(/'/g,"\\'")}')">Registrar abono</button>
      <button type="button" class="btn-liquidar" onclick="closeAptDetail();openLiqModal(${id})">Cobrar saldo $${pendiente.toLocaleString('es-MX')}</button>
      ${cancelBtn}`;
  }

  const modal = document.getElementById('apt-detail-modal');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => document.getElementById('adm-customer')?.focus());
}

function closeAptDetail() {
  const modal = document.getElementById('apt-detail-modal');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  _aptDetailLastFocus?.focus?.();
}

function _aptDetailBackdrop(e) {
  if (e.target === document.getElementById('apt-detail-modal')) closeAptDetail();
}

function clearAptPageSearch() {
  const el = document.getElementById('apt-page-search');
  if (el) { el.value = ''; el.focus(); }
  const c = document.getElementById('apt-page-search-clear');
  if (c) c.style.display = 'none';
  filterApartadosWithDue('', 'page');
}

function clearAptSearchWithDue(target = 'offcanvas') {
  const input = document.getElementById(target === 'page' ? 'apt-page-search' : 'apt-search');
  if (input) { input.value = ''; input.focus(); }
  filterApartadosWithDue('', target);
}

document.addEventListener('keydown', event => {
  const modal = document.getElementById('apt-detail-modal');
  const page = document.getElementById('apt-page');
  const offcanvas = document.getElementById('apt-offcanvas');
  const activeLayer = modal?.style.display === 'flex'
    ? modal
    : page?.style.display === 'flex'
      ? page
      : offcanvas?.classList.contains('open')
        ? offcanvas
        : null;
  if (!activeLayer) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (activeLayer === modal) closeAptDetail();
    else if (activeLayer === page) closeAptPage();
    else closeApartados();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...activeLayer.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function openHistory() {
  document.getElementById('history-offcanvas').classList.add('open');
  document.getElementById('history-backdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadHistory();
}

function closeHistory() {
  document.getElementById('history-offcanvas').classList.remove('open');
  document.getElementById('history-backdrop').classList.remove('open');
  document.body.style.overflow = '';
}

let _historyLoadGeneration = 0;

async function loadHistory() {
  const loadGeneration = ++_historyLoadGeneration;
  const saleFields = 'id,total,created_at,items,payment_method,type,origin_type,status,customer,discount,note,paid_amount,abonos,seller_email,cancelled_at,version';
  // "Movimientos recientes" es una vista acotada, no el ledger completo —
  // limit=50 evita traer toda la vida de la tienda en cada apertura.
  const result = await api(`sale_payments?select=id,request_id,request_line,amount,kind,method,paid_at,recorded_at,is_estimated,source,collected_by_email,sale:sales(${saleFields})&order=paid_at.desc.nullslast,recorded_at.desc,id.desc&limit=50`);
  if (loadGeneration !== _historyLoadGeneration) return false;
  const el = document.getElementById('history-list');
  if (!result.ok) {
    salesCache = {};
    el.innerHTML = '<div class="history-empty">No se pudo cargar el historial.<br><button class="btn-outline" onclick="loadHistory()" style="margin-top:10px">Reintentar</button></div>';
    return;
  }
  if (!result.data?.length) {
    salesCache = {};
    el.innerHTML = '<div class="history-empty">Sin cobros registrados</div>';
    return;
  }
  salesCache = {};
  const rawMovements = result.data.map(p => ({
    ...p,
    sale: Array.isArray(p.sale) ? p.sale[0] : p.sale
  })).filter(p => p.sale);
  const movements = [];
  const refundGroups = new Map();
  rawMovements.forEach(payment => {
    if (payment.kind !== 'refund' || !payment.request_id) {
      movements.push(payment);
      return;
    }
    const key = `${payment.sale.id}:${payment.request_id}`;
    const existing = refundGroups.get(key);
    if (!existing) {
      const grouped = { ...payment, refund_breakdown: [{ method: payment.method, amount: parseFloat(payment.amount) || 0 }] };
      refundGroups.set(key, grouped);
      movements.push(grouped);
      return;
    }
    existing.amount = (parseFloat(existing.amount) || 0) + (parseFloat(payment.amount) || 0);
    existing.is_estimated = Boolean(existing.is_estimated || payment.is_estimated);
    existing.refund_breakdown.push({ method: payment.method, amount: parseFloat(payment.amount) || 0 });
    if (existing.method !== payment.method) existing.method = 'multiple';
  });
  movements.forEach(p => { salesCache[p.sale.id] = p.sale; });

  // Convertir fecha UTC → clave YYYY-MM-DD en horario de México
  const TZ = 'America/Mexico_City';
  const mxDateKey = iso => {
    if (!iso || Number.isNaN(new Date(iso).getTime())) return 'historico';
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso));
  };
  const hoy  = mxDateKey(new Date().toISOString());
  const ayer = mxDateKey(new Date(Date.now() - 86400000).toISOString());

  // Agrupar por fecha del movimiento, no por la fecha original del apartado.
  const grupos = {};
  movements.forEach(p => {
    const dia = mxDateKey(p.paid_at);
    if (!grupos[dia]) grupos[dia] = [];
    grupos[dia].push(p);
  });

  const newestMovementBySale = new Map();
  movements.forEach(p => {
    if (!newestMovementBySale.has(p.sale.id)) newestMovementBySale.set(p.sale.id, p.id);
  });

  const html = Object.entries(grupos).map(([dia, dayMovements]) => {
    const titulo = dia === 'historico' ? 'Fecha no disponible'
                 : dia === hoy  ? 'Hoy'
                 : dia === ayer ? 'Ayer'
                 : new Date(dia + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });

    const cards = dayMovements.map(payment => {
      const s = payment.sale;
      const paymentDate = payment.paid_at && !Number.isNaN(new Date(payment.paid_at).getTime()) ? new Date(payment.paid_at) : null;
      const hora = paymentDate ? paymentDate.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', timeZone: TZ }) : 'Hora no disponible';
      const total    = parseFloat(s.total) || 0;
      const disc     = parseFloat(s.discount) || 0;
      const items    = Array.isArray(s.items) ? s.items : [];
      const totalQty = items.reduce((n, i) => n + (i.qty || 1), 0);
      const amount = parseFloat(payment.amount) || 0;
      const isApt = s.origin_type === 'apartado' || (!s.origin_type && (s.type === 'apartado' || (s.abonos || []).length));
      const methodIcon = payment.method === 'transferencia' ? '📱' : payment.method === 'efectivo' ? '💵' : '🧾';
      let badgeText;
      let badgeStyle = 'background:#F5F1EB;color:#6B625A;border:1px solid #D8CEC3';
      if (payment.kind === 'refund') {
        badgeText = '↩ Devolución';
        badgeStyle = 'background:#FEE2E2;color:var(--red);border:1px solid #FCA5A5';
      } else if (payment.kind === 'adjustment') {
        badgeText = '🧾 Ajuste histórico';
      } else if (isApt && (/liquidation/.test(payment.source || '') ||
        (payment.source === 'rpc_apartado_initial' && Math.abs(amount - total) < .005))) {
        badgeText = '✅ Apartado liquidado';
        badgeStyle = 'background:#ECFDF5;color:#2D6A4F;border:1px solid #2D6A4F';
      } else if (isApt && payment.source === 'rpc_apartado_initial') {
        badgeText = '📌 Anticipo';
        badgeStyle = 'background:#FFF8EE;color:#9A742D;border:1px solid #C9A462';
      } else if (isApt) {
        badgeText = '📌 Abono';
        badgeStyle = 'background:#FFF8EE;color:#9A742D;border:1px solid #C9A462';
      } else {
        badgeText = `${methodIcon} Venta`;
      }
      const payBadge = `<span class="pay-badge" style="font-size:.62rem;${badgeStyle};padding:2px 6px;border-radius:50px;font-weight:700">${badgeText}</span>`;

      const THUMB_PH = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2228%22 height=%2228%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23D1C4B8%22 stroke-width=%221.5%22%3E%3Crect x=%223%22 y=%223%22 width=%2218%22 height=%2218%22 rx=%222%22/%3E%3Ccircle cx=%228.5%22 cy=%228.5%22 r=%221.5%22/%3E%3Cpath d=%22m21 15-5-5L5 21%22/%3E%3C/svg%3E';
      const itemsHTML = items.map(i => {
        const cur = products.find(p => p.id === i.id);
        const img = _driveSz(cur?.image, 80) || THUMB_PH;
        const displayName = _esc(cur?.name || i.name);
        return `
<div class="hi-item">
  <img class="hi-item-thumb" src="${img}" alt="${displayName}" onerror="this.src='${THUMB_PH}'" data-name="${displayName}" data-price="${i.price}" data-qty="${i.qty||1}" data-seller="${payment.collected_by_email||s.seller_email||''}" onclick="event.stopPropagation();openLightbox(this)" style="cursor:zoom-in">
  <span class="hi-item-name">${displayName}</span>
  <span class="hi-item-qty">×${i.qty || 1}</span>
  <span class="hi-item-sub">$${((i.subtotal ?? i.price * (i.qty || 1))).toLocaleString('es-MX')}</span>
</div>`;
      }).join('');

      const tags = [];
      if (disc > 0)   tags.push(`<span class="hi-tag discount">🏷 −$${disc.toLocaleString('es-MX')}</span>`);
      if (s.note)     tags.push(`<span class="hi-tag note">📝 ${_esc(s.note)}</span>`);
      if (s.customer) tags.push(`<span class="hi-tag customer">👤 ${_esc((s.customer||'').split(' · 📱 ')[0])}</span>`);
      if (payment.is_estimated) tags.push('<span class="hi-tag note">⚠ Histórico estimado</span>');
      if (payment.refund_breakdown?.length > 1) {
        const breakdown = payment.refund_breakdown.map(line =>
          `${line.method === 'transferencia' ? '📱' : line.method === 'efectivo' ? '💵' : '🧾'} $${Math.abs(line.amount).toLocaleString('es-MX')}`
        ).join(' · ');
        tags.push(`<span class="hi-tag note">${breakdown}</span>`);
      }
      if (s.cancelled_at) tags.push('<span class="hi-tag note">Cancelado</span>');
      const footerHTML = tags.length ? `<div class="hi-footer">${tags.join('')}</div>` : '';
      const displayTotal = `${amount < 0 ? '−' : ''}$${Math.abs(amount).toLocaleString('es-MX')}`;
      // Ancla el botón al movimiento más reciente de la venta (evita un ✕ por
      // cada fila cuando hay varios pagos/reembolsos) sin exigir que ese
      // movimiento más reciente sea justo un 'payment' — una venta con algún
      // reembolso parcial también debe poder cancelarse.
      const canCancelThis = canCancelSale() && !s.cancelled_at && newestMovementBySale.get(s.id) === payment.id;

      return `
<div class="hi-card">
  <div class="hi-head">
    <span class="hi-time">${hora} · ${totalQty} art.</span>
    ${payBadge}
    <span class="hi-spacer"></span>
    <span class="hi-total"${amount < 0 ? ' style="color:var(--red)"' : ''}>${displayTotal}</span>
    ${canCancelThis ? `<button class="hi-del" onclick="deleteSale(${s.id})" title="Cancelar registro completo" aria-label="Cancelar registro completo">✕</button>` : ''}
  </div>
  <div class="hi-items">${itemsHTML || '<div style="color:#9B8B78;font-size:.78rem;padding:4px 0">Sin detalle</div>'}</div>
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

  const abonos     = Array.isArray(sale.abonos) ? sale.abonos : [];
  const isApartadoOrigin = sale.origin_type === 'apartado' || sale.type === 'apartado' || abonos.length > 0;
  const totalNum   = parseFloat(sale.total) || 0;
  const total      = totalNum.toLocaleString('es-MX');
  const itemCount  = Array.isArray(sale.items) ? sale.items.length : 0;
  const label      = isApartadoOrigin ? 'apartado' : 'venta';
  const pagado     = isApartadoOrigin ? (parseFloat(sale.paid_amount) || 0) : totalNum;
  const refundText = pagado > 0
    ? `\n\nSe registrará una devolución de $${pagado.toLocaleString('es-MX')} por los mismos métodos de pago.`
    : '';
  if (!confirm(`¿Cancelar el ${label} de $${total} (${itemCount} artículo${itemCount !== 1 ? 's' : ''})?\n\nSe restaurará el stock.${refundText}\n\nEsta acción no se puede deshacer.`)) return;

  const delResult = await posRpc('cancel_sale_atomic', {
    operation: 'cancel_sale',
    context: id,
    fingerprint: `${id}:${sale.version ?? 0}:${pagado}`,
    body: {
      p_sale_id: id,
      p_expected_version: sale.version ?? 0,
      p_reason: 'Cancelado desde Historial de Caja'
    }
  });
  if (!delResult.ok) {
    toast(_posRpcError(delResult, `Error al cancelar el ${label}`), 'error');
    if (delResult.resolvedPrior || delResult.staleConflict) await _refreshPosFinancialState();
    return;
  }

  delete salesCache[id];
  await _refreshPosFinancialState();
  const refundAmount = parseFloat(delResult.data?.sale?.refund_amount) || 0;
  toast(`${isApartadoOrigin ? 'Apartado cancelado' : 'Venta cancelada'} — stock restaurado${refundAmount > 0 ? ` y devolución de $${refundAmount.toLocaleString('es-MX')} registrada` : ''} ✓`, 'success');
}
