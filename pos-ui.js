/* ── ÍCONOS INLINE (apartados escritorio + historial) ── */
const _uiIco = (p, px = 13, sw = 1.75) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">${p}</svg>`;
const _uiIcoUser     = () => _uiIco('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
const _uiIcoCalendar = () => _uiIco('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>');
const _uiIcoBookmark = (px = 13) => _uiIco('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', px);
const _uiIcoCheck    = (color, px = 13) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:${color||'currentColor'};fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
const _uiIcoX        = (color, px = 13) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:${color||'currentColor'};fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
const _uiIcoSearch   = (px = 20) => _uiIco('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', px, 1.5);
const _uiIcoTag      = () => _uiIco('<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42Z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>');
const _uiIcoEdit     = () => _uiIco('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
const _uiIcoCash     = () => _uiIco('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>');
const _uiIcoPhone    = () => _uiIco('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>');
const _uiIcoReceipt  = () => _uiIco('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
const _uiIcoWarn     = (px = 13) => _uiIco('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', px);
const _uiIcoZap      = () => `<svg style="width:13px;height:13px;vertical-align:-2px;fill:currentColor;stroke:none" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const _uiIcoFlask    = (px = 13) => _uiIco('<path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/>', px);
const _uiIcoSend     = (px = 13) => _uiIco('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', px);
const _uiIcoWA       = () => `<svg width="18" height="18" fill="#fff" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.374 0 0 5.373 0 12c0 2.124.553 4.118 1.522 5.85L.057 23.499l5.772-1.513A11.94 11.94 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0z"/></svg>`;

/* ── SWIPE TO CLOSE (offcanvas desde la derecha) ── */
function initSwipeToClose(panelId, backdropId, closeFn, backdropBaseOpacity = 0.35, ignoreSelector = null) {
  const panel    = document.getElementById(panelId);
  const backdrop = document.getElementById(backdropId);
  if (!panel) return;

  let startX = 0, startY = 0, curX = 0, dragging = false, ignored = false;

  panel.addEventListener('touchstart', e => {
    startX  = e.touches[0].clientX;
    startY  = e.touches[0].clientY;
    dragging = false; curX = 0;
    // Un dedo que arranca sobre una fila con su propio scroll horizontal
    // (p.ej. los chips de vencimiento en Apartados) nunca debe competir con
    // cerrar el panel — ambos escuchan el mismo touchmove porque burbujea.
    ignored = !!(ignoreSelector && e.target.closest(ignoreSelector));
  }, { passive: true });

  panel.addEventListener('touchmove', e => {
    if (ignored) return;
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
  document.getElementById('pos-preview-name').innerHTML     = (isKit ? _giftIconSvg(14) + ' ' : '') + _esc(p.name);
  document.getElementById('pos-preview-price').textContent = '$' + p.price.toLocaleString('es-MX') + ' MXN';

  let stockHTML = '';
  if (oos)                          stockHTML = '<span style="color:var(--red)">⊘ Agotado</span>';
  else if (isKit)                   stockHTML = `<span style="color:#6B9E78">${_giftIconSvg(13)} ${effStock} kit${effStock!==1?'s':''} disponibles</span>`;
  else if (effStock === 1)          stockHTML = `<span style="color:var(--gold-dark)">${_uiIcoZap()} Última pieza</span>`;
  else if (effStock >= 2 && effStock <= 5) stockHTML = `<span style="color:var(--gold-dark)">${effStock} piezas disponibles</span>`;
  else                              stockHTML = `<span style="color:#6B9E78">${_uiIcoCheck()} Disponible</span>`;
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
    // Llegar aquí significa que sí hay una fecha válida — nunca debe contar
    // para "Sin fecha" (antes caía al `return true` final de abajo, el mismo
    // que usa "Todos", así que "Sin fecha" mostraba todo).
    if (filter === 'sin-fecha') return false;
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
  const isCancelado = _aptViewMode === 'cancelados';
  const source = isCancelado
    ? (_apartadosCanceladosAll || [])
    : isLiquidado
      ? (_apartadosLiquidadosAll || [])
      : _aptDueFiltered(_apartadosAll || []);
  const filtered = _aptFilterByCustomer(source, query);
  const clearButton = document.getElementById(target === 'page' ? 'apt-page-search-clear' : 'apt-search-clear');
  if (clearButton) clearButton.style.display = query.trim() ? '' : 'none';
  if (isCancelado) {
    (target === 'page' ? _renderAptPageCanceladosCards : _renderApartadoCanceladosCards)(filtered);
  } else if (target === 'page') {
    _renderAptPageCards(filtered, isLiquidado);
  } else {
    _renderApartadoCards(filtered, isLiquidado);
  }
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

function _aptDueFiltersScroll(target) {
  const el = document.getElementById(`apt-due-filters-${target}`);
  const wrap = document.getElementById(`apt-due-filters-wrap-${target}`);
  if (!el || !wrap) return;
  wrap.classList.toggle('at-end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
}

async function selectAptView(mode, target) {
  const current = await toggleAptView(mode, target);
  if (current === false) return;
  document.querySelectorAll(`#apt-view-toggle-${target} [role="tab"]`).forEach(button => {
    const selected = button.dataset.mode === mode;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  const dueFilters = document.getElementById(`apt-due-filters-wrap-${target}`);
  if (dueFilters) dueFilters.hidden = mode !== 'activos';
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
  document.querySelectorAll('.apt-due-filters-wrap').forEach(wrap => { wrap.hidden = false; });
  _syncAptDueFilterUI();
  ['oc', 'page'].forEach(_aptDueFiltersScroll);

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

function _renderAptPageCanceladosCards(data) {
  const grid = document.getElementById('apt-page-list');
  if (!grid) return;
  const count = document.getElementById('apt-page-count');
  if (count) count.textContent = data.length ? `${data.length} cancelado${data.length !== 1 ? 's' : ''}` : '';
  if (!data.length) {
    grid.innerHTML = `<div class="history-empty" style="grid-column:1/-1"><div style="margin-bottom:8px">${_uiIcoX('var(--red)', 30)}</div>Sin apartados cancelados</div>`;
    return;
  }
  grid.innerHTML = data.map(s => {
    const total = parseFloat(s.total) || 0;
    const t = _posFormatTimestamp(s.cancelled_at || s.updated_at || s.created_at, { day:'numeric', month:'short' });
    const nItems = Array.isArray(s.items) ? s.items.length : 0;
    const custParts = (s.customer || '').split(' · 📱 ');
    const nombre = custParts[0] || 'Sin nombre';
    const telNum = custParts[1] || '';
    return `<button type="button" class="apc-card apc-card-cancelado" onclick="openAptDetail(${s.id})" aria-label="Ver apartado cancelado de ${_esc(nombre)}, total $${total.toLocaleString('es-MX')}">
  <span class="apc-top">
    <span class="apc-name">${_uiIcoUser()} ${_esc(nombre)}</span>
    <span class="apt-h-pending cancelado">✕ Cancelado</span>
  </span>
  <span class="apc-meta">${t} · ${nItems} prod.${telNum ? ' · 📱 ' + telNum : ''} · $${total.toLocaleString('es-MX')}</span>
</button>`;
  }).join('');
}

function _renderAptPageCards(data, isLiquidado) {
  const grid = document.getElementById('apt-page-list');
  if (!grid) return;
  const count = document.getElementById('apt-page-count');
  if (count) {
    const totalFalta = isLiquidado ? 0 : data.reduce((sum, s) => sum + Math.max(0, (parseFloat(s.total) || 0) - parseFloat(s.paid_amount || 0)), 0);
    count.textContent = data.length
      ? `${data.length} ${isLiquidado ? 'liquidado' : 'activo'}${data.length !== 1 ? 's' : ''}${!isLiquidado ? ` · $${totalFalta.toLocaleString('es-MX')} por cobrar` : ''}`
      : '';
  }
  if (!data.length) {
    grid.innerHTML = `<div class="history-empty" style="grid-column:1/-1"><div style="margin-bottom:8px">${isLiquidado ? _uiIcoCheck('var(--green)', 30) : _uiIcoSearch(30)}</div>Sin ${isLiquidado ? 'apartados liquidados' : 'resultados'}</div>`;
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
    <span class="apc-name">${_uiIcoUser()} ${_esc(nombre)}</span>
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
      dueHTML = `<span class="apc-due" style="color:${dueColor}">${_uiIcoCalendar()} ${dueText}</span>`;
    }
    return `<button type="button" class="apc-card${isOverdue ? ' apt-overdue' : ''}" onclick="openAptDetail(${s.id})" aria-label="Ver apartado de ${_esc(nombre)}, falta $${pendiente.toLocaleString('es-MX')}${isOverdue ? ', vencido' : ''}">
  <span class="apc-top">
    <span class="apc-name">${_uiIcoUser()} ${_esc(nombre)}</span>
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

  document.getElementById('adm-customer').innerHTML = _uiIcoUser() + ' ' + _esc(nombre);
  document.getElementById('adm-meta').innerHTML = _esc(t + ' · ' + nItems + ' producto' + (nItems !== 1 ? 's' : '')) + (telNum ? ' · ' + _uiIcoPhone() + ' ' + _esc(telNum) : '');

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
    const origSub = i.original_price != null
      ? `<span style="text-decoration:line-through;opacity:.45;font-size:.68rem;margin-right:3px">$${(i.original_price * qty).toLocaleString('es-MX')}</span>`
      : '';
    const priceLabel = qty > 1
      ? `${origSub}<span class="apt-item-price">$${sub.toLocaleString('es-MX')}</span><span class="apt-item-qty">$${i.price.toLocaleString('es-MX')} ×${qty}</span>`
      : `${origSub}<span class="apt-item-price">$${sub.toLocaleString('es-MX')}</span>`;
    return `<div class="apt-item-row"${prod?.image ? ` role="button" tabindex="0" aria-label="Ver imagen de ${_esc(i.name)}" onclick="_aptItemPopup(${i.id},this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_aptItemPopup(${i.id},this)}"` : ''}>
      <img class="apt-item-thumb" src="${img}" onerror="this.style.visibility='hidden'" alt="">
      <div class="apt-item-info"><div class="apt-item-name">${_esc(i.name)}</div>${kitHTML}</div>
      <div class="apt-item-right">${priceLabel}</div>
    </div>`;
  }).join('');

  const abonos = Array.isArray(s.payment_history) ? s.payment_history
    : Array.isArray(s.abonos) ? s.abonos : [];
  const paymentHistoryWarning = s.payment_history_error
    ? `<div style="font-size:.74rem;color:var(--red);margin-top:8px">${_uiIcoWarn()} Historial incompleto; recarga para consultar el libro de pagos.</div>`
    : '';

  const isLiquidado = _isApartadoLiquidado(s);
  const isCancelado = s.status === 'cancelado';

  // Due date — sin sentido para un apartado ya liquidado
  let dueAlertHTML = '';
  if (s.due_date && !isLiquidado) {
    const diff = _posDayKeyDiff(s.due_date);
    const dueColor = diff < 0 ? '#E85D5D' : diff <= 7 ? '#D97706' : '#6B9E78';
    const dueText  = diff < 0 ? `Venció hace ${Math.abs(diff)} día${Math.abs(diff)!==1?'s':''}` : diff === 0 ? 'Vence hoy' : `Vence el ${_posFormatDayKey(s.due_date,{day:'numeric',month:'long'})}`;
    dueAlertHTML = `<div style="font-size:.76rem;font-weight:700;color:${dueColor};margin-bottom:10px">${_uiIcoCalendar()} ${dueText}</div>`;
  }

  const disc = Math.round(((parseFloat(s.discount) || 0) + _itemsDiscountTotal(s.items)) * 100) / 100;
  const subtotal = disc > 0 ? total + disc : 0;

  const summaryRows = [];
  if (disc > 0) {
    summaryRows.push(`<div class="apt-sum-row"><span>Subtotal</span><span>$${subtotal.toLocaleString('es-MX')}</span></div>`);
    summaryRows.push(`<div class="apt-sum-row apt-sum-disc"><span>${_uiIcoTag()} Descuento</span><span>−$${disc.toLocaleString('es-MX')}</span></div>`);
  }
  summaryRows.push(`<div class="apt-sum-row apt-sum-total"><span>Total</span><span>$${total.toLocaleString('es-MX')}</span></div>`);

  const abonosVisible = abonos.length ? abonos.map(a => {
    const meta = typeof _apartadoPaymentMeta === 'function'
      ? _apartadoPaymentMeta(a)
      : { amount: parseFloat(a.amount) || 0, dateLabel: 'Histórico', method: a.method || 'sin registrar', icon: _uiIcoReceipt() };
    const amountLabel = `${meta.amount < 0 ? '−' : ''}$${Math.abs(meta.amount).toLocaleString('es-MX')}`;
    // Solo si viene del libro de pagos real (sale_payments.id) -- el formato
    // legado sale.abonos no trae id y no está en paymentsCache.
    const resendBtn = a.id != null
      ? `<button class="hi-del hi-send" style="padding:2px 4px" onclick="event.stopPropagation();resendReceipt('${a.id}')" title="Reenviar comprobante por WhatsApp" aria-label="Reenviar comprobante por WhatsApp">${_uiIcoSend(12)}</button>`
      : '';
    return `<div class="apt-abono-row"><span>${meta.dateLabel} · ${meta.icon} ${_esc(meta.method)}</span><span style="display:flex;align-items:center;gap:2px"><span class="apt-abono-amount"${meta.amount < 0 ? ' style="color:var(--red)"' : ''}>${amountLabel}</span>${resendBtn}</span></div>`;
  }).join('') : '';

  document.getElementById('adm-body').innerHTML = `
    ${dueAlertHTML}
    <div class="adm-section-title">Productos</div>
    <div class="apt-items-list">${itemsHTML}</div>
    <div class="apt-summary">
      ${summaryRows.join('')}
    </div>
    ${isCancelado ? '' : `<div class="apt-progress-section">
      <div class="apt-progress-track" role="progressbar" aria-label="Progreso de pago" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="apt-progress-fill" style="width:${pct}%"></div></div>
      <div class="apt-amounts-row">
        <span class="apt-paid-lbl">✓ Pagado $${pagado.toLocaleString('es-MX')}</span>
        <span class="apt-pending-lbl">${pendiente > 0 ? 'Pendiente $' + pendiente.toLocaleString('es-MX') : '✓ Liquidado'}</span>
      </div>
    </div>`}
    ${abonosVisible || paymentHistoryWarning ? `<div class="apt-abonos-section"><div class="adm-section-title">Historial de pagos</div>${paymentHistoryWarning}${abonosVisible}</div>` : ''}`;

  // Un apartado cancelado no admite ninguna acción — ni siquiera reabrir
  // (no hay RPC para eso; cancelar es terminal, a diferencia de liquidar).
  if (isCancelado) {
    const canceladoFecha = s.cancelled_at
      ? ` · ${_posFormatTimestamp(s.cancelled_at, {day:'numeric',month:'short'})}`
      : '';
    // canMarkTestData es su propio permiso (no depende de canManageSettings)
    // -- ver markSaleAsTest (pos-apartados.js).
    const testBtn = canMarkTestData()
      ? `<button type="button" class="btn-edit-apt" onclick="markSaleAsTest(${id},'${_esc(nombre).replace(/'/g,"\\'")}')" aria-label="Marcar como prueba" title="Marcar como prueba — se oculta de Historial/Reportes/Corte">${_uiIcoFlask(14)}</button>`
      : '';
    document.getElementById('adm-footer').innerHTML =
      `<span style="flex:1;text-align:center;font-size:.82rem;font-weight:700;color:var(--muted)">✕ Cancelado${canceladoFecha}</span>${testBtn}`;
    const modal = document.getElementById('apt-detail-modal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => document.getElementById('adm-customer')?.focus());
    return;
  }

  // Un apartado liquidado no admite abonar, liquidar, editar ni cancelar desde esta ficha.
  // pendiente<=0 cubre el caso de un registro local desfasado (otra caja ya liquidó
  // o dato aún no refrescado) que isLiquidado no detectaría por venir de status/type.
  if (isLiquidado || pendiente <= _APT_MONEY_EPSILON) {
    const reopenBtn = pagado > 0
      ? `<button type="button" class="btn-abonar" id="adm-refund-btn" onclick="refundApartado(${id},'detail')" style="border-color:var(--red);color:var(--red)">${_uiIco('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>')} Reabrir y reembolsar</button>`
      : '';
    document.getElementById('adm-footer').innerHTML =
      `<button type="button" class="btn-wa-reminder" onclick="sendApartadoReminder(${id})" aria-label="Enviar por WhatsApp" title="Enviar por WhatsApp">${_uiIcoWA()}</button>
       ${reopenBtn || '<span style="flex:1;text-align:center;font-size:.82rem;font-weight:700;color:var(--green)">✓ Liquidado</span>'}`;
  } else {
    const editBtn = `<button type="button" class="btn-edit-apt" onclick="closeAptDetail();openEditApartado(${id})" aria-label="Editar apartado" title="Editar apartado">${_uiIcoEdit()}</button>`;
    const cancelBtn = `<button type="button" class="btn-cancelar-apt" onclick="cancelApartado(${id})" aria-label="Cancelar apartado" title="Cancelar apartado">✕</button>`;
    document.getElementById('adm-footer').innerHTML = `
      <button type="button" class="btn-wa-reminder" onclick="sendApartadoReminder(${id})" aria-label="Enviar recordatorio por WhatsApp" title="Recordatorio WhatsApp">${_uiIcoWA()}</button>
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
  const saleFields = 'id,total,created_at,items,payment_method,type,origin_type,status,customer,discount,note,paid_amount,abonos,seller_email,cancelled_at,version,is_test,due_date';
  // "Movimientos recientes" es una vista acotada, no el ledger completo —
  // limit=50 evita traer toda la vida de la tienda en cada apertura.
  // Un apartado creado con $0 de anticipo no genera fila en sale_payments
  // (record_sale_atomic_v2 solo inserta pago si v_paid>0) — se consulta
  // aparte para no desaparecer de Historial hasta el primer abono.
  const [result, createdResult] = await Promise.all([
    api(`sale_payments?select=id,request_id,request_line,amount,kind,method,paid_at,recorded_at,is_estimated,source,collected_by_email,sale:sales(${saleFields})&order=paid_at.desc.nullslast,recorded_at.desc,id.desc&limit=50`),
    api(`sales?select=${saleFields}&origin_type=eq.apartado&paid_amount=eq.0&cancelled_at=is.null&is_test=eq.false&order=created_at.desc&limit=20`)
  ]);
  if (loadGeneration !== _historyLoadGeneration) return false;
  const el = document.getElementById('history-list');
  if (!result.ok) {
    salesCache = {};
    paymentsCache = {};
    el.innerHTML = '<div class="history-empty">No se pudo cargar el historial.<br><button class="btn-outline" onclick="loadHistory()" style="margin-top:10px">Reintentar</button></div>';
    return;
  }
  salesCache = {};
  paymentsCache = {};
  const rawMovements = (result.data || []).map(p => ({
    ...p,
    sale: Array.isArray(p.sale) ? p.sale[0] : p.sale
  })).filter(p => p.sale && !p.sale.is_test);
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
  if (createdResult.ok) {
    (createdResult.data || []).forEach(sale => {
      movements.push({
        id: `apartado-created-${sale.id}`,
        kind: 'apartado_created',
        amount: 0,
        method: null,
        paid_at: sale.created_at,
        is_estimated: false,
        collected_by_email: sale.seller_email || null,
        sale
      });
    });
  }
  if (!movements.length) {
    el.innerHTML = '<div class="history-empty">Sin cobros registrados</div>';
    return;
  }
  movements.sort((a, b) => new Date(b.paid_at || 0) - new Date(a.paid_at || 0));
  movements.forEach(p => { salesCache[p.sale.id] = p.sale; paymentsCache[p.id] = p; });

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
      const methodIcon = payment.method === 'transferencia' ? _uiIcoPhone() : payment.method === 'efectivo' ? _uiIcoCash() : _uiIcoReceipt();
      let badgeText;
      let badgeStyle = 'background:#F5F1EB;color:#6B625A;border:1px solid #D8CEC3';
      if (payment.kind === 'apartado_created') {
        badgeText = _uiIcoBookmark() + ' Apartado nuevo';
        badgeStyle = 'background:#FFF8EE;color:#9A742D;border:1px solid #C9A462';
      } else if (payment.kind === 'refund') {
        badgeText = _uiIco('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>') + ' Devolución';
        badgeStyle = 'background:#FEE2E2;color:var(--red);border:1px solid #FCA5A5';
      } else if (payment.kind === 'adjustment') {
        badgeText = _uiIcoReceipt() + ' Ajuste histórico';
      } else if (isApt && _isApartadoLiquidationPayment(payment, s)) {
        badgeText = _uiIcoCheck('#2D6A4F') + ' Apartado liquidado';
        badgeStyle = 'background:#ECFDF5;color:#2D6A4F;border:1px solid #2D6A4F';
      } else if (isApt && payment.source === 'rpc_apartado_initial') {
        badgeText = _uiIcoBookmark() + ' Anticipo';
        badgeStyle = 'background:#FFF8EE;color:#9A742D;border:1px solid #C9A462';
      } else if (isApt) {
        badgeText = _uiIcoBookmark() + ' Abono';
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
        const origSub = i.original_price != null
          ? `<span style="text-decoration:line-through;opacity:.45;font-size:.68rem;margin-right:3px">$${(i.original_price * (i.qty || 1)).toLocaleString('es-MX')}</span>`
          : '';
        return `
<div class="hi-item">
  <img class="hi-item-thumb" src="${img}" alt="${displayName}" onerror="this.src='${THUMB_PH}'" data-name="${displayName}" data-price="${i.price}" data-qty="${i.qty||1}" data-seller="${payment.collected_by_email||s.seller_email||''}" onclick="event.stopPropagation();openLightbox(this)" style="cursor:zoom-in">
  <span class="hi-item-name">${displayName}</span>
  <span class="hi-item-qty">×${i.qty || 1}</span>
  <span class="hi-item-sub">${origSub}$${((i.subtotal ?? i.price * (i.qty || 1))).toLocaleString('es-MX')}</span>
</div>`;
      }).join('');

      const totalDisc = Math.round((disc + _itemsDiscountTotal(items)) * 100) / 100;
      const tags = [];
      if (totalDisc > 0) tags.push(`<span class="hi-tag discount">${_uiIcoTag()} −$${totalDisc.toLocaleString('es-MX')}</span>`);
      if (s.note)     tags.push(`<span class="hi-tag note">${_uiIcoEdit()} ${_esc(s.note)}</span>`);
      if (s.customer) tags.push(`<span class="hi-tag customer">${_uiIcoUser()} ${_esc((s.customer||'').split(' · 📱 ')[0])}</span>`);
      if (payment.is_estimated) tags.push(`<span class="hi-tag note">${_uiIcoWarn()} Histórico estimado</span>`);
      if (payment.refund_breakdown?.length > 1) {
        const breakdown = payment.refund_breakdown.map(line =>
          `${line.method === 'transferencia' ? _uiIcoPhone() : line.method === 'efectivo' ? _uiIcoCash() : _uiIcoReceipt()} $${Math.abs(line.amount).toLocaleString('es-MX')}`
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
      const canCancelThis = !s.cancelled_at && newestMovementBySale.get(s.id) === payment.id;
      // Cualquier movimiento (venta directa o apartado, en cualquier estado)
      // puede marcarse como prueba desde aquí -- a diferencia de Apartados
      // Cancelados, Historial es el único lugar que cubre ventas directas y
      // apartados sin importar su estado actual. Ver markSaleAsTest (pos-apartados.js).
      const testBtn = canMarkTestData()
        ? `<button class="hi-del" style="color:var(--muted)" onclick="markSaleAsTest(${s.id},'${_esc((s.customer||'').split(' · 📱 ')[0] || `Venta #${s.id}`).replace(/'/g,"\\'")}')" title="Marcar como prueba" aria-label="Marcar como prueba">${_uiIcoFlask(13)}</button>`
        : '';
      // Reenviar comprobante de este movimiento puntual -- antes solo se
      // podía enviar en el momento justo después de cobrar (datos en
      // memoria); ahora se reconstruye desde lo ya guardado en la BD, así
      // que sirve sin importar cuánto tiempo haya pasado.
      const resendBtn = `<button class="hi-del hi-send" onclick="event.stopPropagation();resendReceipt('${payment.id}')" title="Reenviar comprobante por WhatsApp" aria-label="Reenviar comprobante por WhatsApp">${_uiIcoSend(13)}</button>`;

      return `
<div class="hi-card">
  <div class="hi-head">
    <span class="hi-time">${hora} · ${totalQty} art.</span>
    ${payBadge}
    <span class="hi-spacer"></span>
    ${resendBtn}
    <span class="hi-total"${amount < 0 ? ' style="color:var(--red)"' : ''}>${displayTotal}</span>
    ${testBtn}
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

// Reenvía el comprobante de un movimiento ya registrado, reconstruido desde
// lo guardado en la BD (sale_payments + sales.items) en vez de depender del
// contexto en memoria del momento del cobro (sendWhatsAppTicket/
// sendPaymentReceipt) -- por eso sirve sin importar cuánto tiempo haya
// pasado. Mismo estilo visual, formato más simple (sin fotos de producto).
async function resendReceipt(paymentId) {
  const payment = paymentsCache[paymentId];
  const s = payment?.sale;
  if (!payment || !s) { toast('No se encontró ese movimiento', 'error'); return; }

  const isApt = s.origin_type === 'apartado' || (!s.origin_type && (s.type === 'apartado' || (s.abonos || []).length));
  const isLiquidation = isApt && _isApartadoLiquidationPayment(payment, s);
  const isCreated = payment.kind === 'apartado_created';
  const amount = Math.abs(parseFloat(payment.amount) || 0);
  const items = Array.isArray(s.items) ? s.items : [];
  const custParts = (s.customer || '').split(' · 📱 ');
  const nombre = custParts[0] || 'Cliente';
  const telLimpio = (custParts[1] || '').replace(/\D/g, '');
  const fecha = payment.paid_at ? new Date(payment.paid_at) : new Date();
  const fechaTxt = `${fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} a las ${fecha.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
  const metodoTxt = payment.method === 'transferencia' ? '📱 Transferencia' : '💵 Efectivo';
  const total = parseFloat(s.total) || 0;

  // El pendiente debe reflejar el saldo TAL COMO ERA el día de este pago, no
  // el de hoy -- si ya hubo abonos después, mostrar el saldo actual haría
  // ver que ese día se debía menos de lo real. Se recalcula sumando solo los
  // pagos hasta esa fecha (inclusive), usando el historial ya cargado si
  // viene del detalle del apartado, o consultándolo si viene de Historial.
  let pendiente = Math.max(0, total - (parseFloat(s.paid_amount) || 0));
  let isLatestPayment = true;
  if (isApt && !isLiquidation && payment.kind !== 'refund') {
    let history = Array.isArray(s.payment_history) ? s.payment_history : null;
    if (!history) {
      const r = await _posFetchAll(`sale_payments?sale_id=eq.${s.id}&select=amount,kind,paid_at&order=paid_at.asc`);
      history = r.ok ? r.data : null;
    }
    if (Array.isArray(history) && history.length) {
      const thisTime = fecha.getTime();
      let cumPaid = 0;
      history.forEach(p => {
        const t = p.paid_at ? new Date(p.paid_at).getTime() : 0;
        if (t > thisTime) { isLatestPayment = false; return; }
        const amt = parseFloat(p.amount) || 0;
        cumPaid += p.kind === 'refund' ? -Math.abs(amt) : amt;
      });
      pendiente = Math.max(0, total - cumPaid);
    }
  }
  const historicoLine = !isLatestPayment
    ? '\n_(Comprobante de un abono anterior — puede haber pagos más recientes)_'
    : '';

  let msg;
  if (payment.kind === 'refund') {
    msg = `↩️ *Comprobante de devolución — Tres Encantos*\n━━━━━━━━━━━━━━\n👤 ${nombre}\n💰 Devuelto: *$${amount.toLocaleString('es-MX')} MXN*\n📅 ${fechaTxt}\nFolio #${s.id}\n\nCualquier duda, con gusto te apoyamos. 💛`;
  } else if (isApt && isLiquidation) {
    msg = `✅ *Comprobante de pago — Tres Encantos*\n━━━━━━━━━━━━━━\n👤 ${nombre}\n💰 Pago recibido: *$${amount.toLocaleString('es-MX')} MXN* (${metodoTxt})\n📅 ${fechaTxt}\n✅ *Tu apartado quedó pagado por completo.*\nFolio #${s.id}\n\n¡Gracias por tu confianza! 💛`;
  } else if (isApt) {
    let dueLine = '';
    if (s.due_date) {
      const due = new Date(s.due_date + 'T00:00:00');
      dueLine = `\n📅 Fecha límite: *${due.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}*`;
    }
    const label = isCreated ? 'Apartado nuevo' : 'Abono recibido';
    msg = `📌 *Comprobante — Tres Encantos*\n━━━━━━━━━━━━━━\n👤 ${nombre}\n💰 ${label}: *$${amount.toLocaleString('es-MX')} MXN* (${metodoTxt})\n📅 ${fechaTxt}\n⏳ Pendiente en esa fecha: *$${pendiente.toLocaleString('es-MX')} MXN*${dueLine}${historicoLine}\nFolio #${s.id}\n\n¡Gracias por tu confianza! 💛`;
  } else {
    const lines = items.map(i => `• ${i.name} x${i.qty || 1} — $${(i.subtotal ?? i.price * (i.qty || 1)).toLocaleString('es-MX')}`).join('\n');
    msg = `🛍 *Comprobante — Tres Encantos*\n━━━━━━━━━━━━━━\n${lines}\n━━━━━━━━━━━━━━\n*Total: $${total.toLocaleString('es-MX')} MXN* (${metodoTxt})\n📅 ${fechaTxt}\nFolio #${s.id}\n\n¡Gracias por tu compra! 💛`;
  }

  window.open(telLimpio ? `https://wa.me/52${telLimpio}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  logActivity('comprobante_enviado',
    `Reenvió comprobante a ${nombre} — $${amount.toLocaleString('es-MX')}`,
    { id: s.id, payment_id: paymentId, nombre, monto: amount, metodo: payment.method, resend: true });
  toast('Comprobante reenviado ✓', 'success');
}

async function deleteSale(id) {
  const sale = salesCache[id];
  if (!sale) { toast('Registro no encontrado', 'error'); return; }

  const abonos     = Array.isArray(sale.abonos) ? sale.abonos : [];
  const isApartadoOrigin = sale.origin_type === 'apartado' || sale.type === 'apartado' || abonos.length > 0;
  const isActiveApartado = isApartadoOrigin && sale.status === 'activo' && !sale.cancelled_at;
  const hasPerm = isActiveApartado ? canCancelApartado() : canCancelSale();
  if (!hasPerm) {
    const granted = await requestOverride(
      isActiveApartado ? 'canEditApartado' : 'canCancelSale',
      isActiveApartado ? 'Cancelar apartado' : 'Cancelar venta'
    );
    if (!granted) return;
  }
  const totalNum   = parseFloat(sale.total) || 0;
  const total      = totalNum.toLocaleString('es-MX');
  const itemCount  = Array.isArray(sale.items) ? sale.items.length : 0;
  const label      = isApartadoOrigin ? 'apartado' : 'venta';
  const pagado     = isApartadoOrigin ? (parseFloat(sale.paid_amount) || 0) : totalNum;
  const refundText = pagado > 0
    ? `\n\nSe registrará una devolución de $${pagado.toLocaleString('es-MX')} por los mismos métodos de pago.`
    : '';
  if (!confirm(`¿Cancelar el ${label} de $${total} (${itemCount} artículo${itemCount !== 1 ? 's' : ''})?\n\nSe restaurará el stock.${refundText}\n\nEsta acción no se puede deshacer.`)) return;

  const delResult = await _posCancelSaleAtomic(id, sale, 'Cancelado desde Historial de Caja');
  if (!delResult.ok) {
    toast(_posRpcError(delResult, `Error al cancelar el ${label}`), 'error');
    return;
  }

  delete salesCache[id];
  await _refreshPosFinancialState();
  const refundAmount = parseFloat(delResult.data?.sale?.refund_amount) || 0;
  toast(`${isApartadoOrigin ? 'Apartado cancelado' : 'Venta cancelada'} — stock restaurado${refundAmount > 0 ? ` y devolución de $${refundAmount.toLocaleString('es-MX')} registrada` : ''} ✓`, 'success');
}
