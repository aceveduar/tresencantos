/* ── ICONS ── */
const _arIco = (p, px = 13, sw = 1.75) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px">${p}</svg>`;
const AR_ICO_PACKAGE  = (px=13) => _arIco('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', px);
const AR_ICO_GIFT     = (px=13) => _arIco('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>', px, 1.5);
const AR_ICO_CHECK    = (px=13) => _arIco('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', px);
const AR_ICO_XCIRCLE  = (px=13) => _arIco('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', px);
const AR_ICO_ZAP      = (px=13) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-2px;margin-right:3px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const AR_ICO_BOOKMARK = (px=13) => _arIco('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', px);
const AR_ICO_EYEOFF   = (px=13) => _arIco('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>', px);
const AR_ICO_GLOBE    = (px=13) => _arIco('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', px);
const AR_ICO_CLOCK    = (px=13) => _arIco('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', px);
const AR_ICO_FILE     = (px=13) => _arIco('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', px);
const AR_ICO_FLAG     = (px=13) => _arIco('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', px);
const AR_ICO_BARCODE  = (px=13) => _arIco('<line x1="4" y1="6" x2="4" y2="18"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="11" y1="6" x2="11" y2="18"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="18" y1="6" x2="18" y2="18"/><line x1="20" y1="6" x2="20" y2="18"/>', px);
const AR_ICO_WARN     = (px=13) => _arIco('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', px);
const AR_ICO_ARCHIVE  = (px=13) => _arIco('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/>', px);
const AR_ICO_DOLLAR   = (px=13) => _arIco('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', px);
const AR_ICO_SEARCH   = (px=13) => _arIco('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', px);
const AR_ICO_USER     = (px=13) => _arIco('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', px);
// Paleta semántica de los chips de filtro — 4 colores fijos en vez de uno
// distinto por chip: gris=neutro, verde=ok, ámbar=atención, rojo=crítico.
const AR_C_NEUTRAL = '#6B7280';
const AR_C_GREEN   = '#059669';
const AR_C_AMBER   = '#92400E';
const AR_C_RED     = '#dc2626';
const _arStar = (filled, px=13) => filled
  ? `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
  : `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

/* ── STATS ── */
function renderStats() {
  const nArchivados = products.filter(p => p.isArchived).length;

  if (_showingArchived) {
    document.getElementById('stats').innerHTML =
      `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="stat-chip stat-chip-filter sc-active" onclick="toggleArchivedView()" style="background:var(--charcoal);border-color:var(--charcoal);color:#fff;gap:6px">
          <span class="sc-icon">${_arIco('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>')}</span><span class="sc-lbl">Volver al inventario</span>
        </button>
        <span style="font-size:.82rem;color:var(--muted)">${nArchivados} producto${nArchivados !== 1 ? 's' : ''} archivado${nArchivados !== 1 ? 's' : ''}</span>
      </div>`;
    _statsScroll();
    return;
  }

  // Helper: define borrador igual que getFilteredProducts para que contador = lo que se ve al filtrar
  const _ib = p => !Array.isArray(p.kitItems) && !p.isPublished && (!p.price || p.price === 0);

  const nBorradores = products.filter(p => !p.isArchived && _ib(p)).length;
  const visible     = p => !p.isArchived && !_ib(p) && !Array.isArray(p.kitItems); // no archivado, no borrador, no kit
  const total       = products.filter(visible).length;
  const conStock    = products.filter(p => visible(p) && p.stock > 0 && !p.outOfStock).length;
  const sinStock    = products.filter(p => visible(p) && (p.stock === 0 || p.outOfStock)).length;
  const ultimaPieza = products.filter(p => visible(p) && p.stock === 1 && !p.outOfStock).length;
  const sinPublicar = products.filter(p => visible(p) && p.isPublished === false).length;
  const nKits       = products.filter(p => Array.isArray(p.kitItems)).length;
  const sinCodigo   = products.filter(p => visible(p) && !p.barcode).length;
  const sinCateg    = products.filter(p => visible(p) && p.category === 'por_revisar').length;
  const porCaducar  = products.filter(p => visible(p) && ['soon','expired'].includes(_expiryStatus(p)?.state)).length;
  const nApartado   = products.filter(p => !p.isArchived && (p.isApartado || _apartadosMap[p.id])).length;
  const nFlag = _flagged.filter(f => {
    const p = products.find(x => x.id === f.id);
    return p && !_ib(p);
  }).length;
  const anyFilter   = _statFilter || _showOnlyFlagged;

  const chip = (key, icon, count, label, activeColor) => {
    const isActive = key === 'revisar' ? _showOnlyFlagged : _statFilter === key;
    const isTodos  = key === 'todos';
    const isFilter = key !== 'todos-info';
    // Tono claro + borde/texto del color, no relleno solido — mismo tratamiento minimalista en los 4 estados.
    const activeStyle = isActive ? `background:${activeColor}1a;border-color:${activeColor};color:${activeColor}` : '';
    return `<button class="stat-chip${isFilter ? ' stat-chip-filter' : ''}${isActive ? ' sc-active' : ''}"
      ${isFilter ? `onclick="toggleStatFilter('${key}')"` : ''}
      style="${activeStyle}" title="${label}">
      <span class="sc-icon">${icon}</span>
      <span class="sc-num">${count}</span>
      <span class="sc-lbl">${label}</span>
    </button>`;
  };

  const todosActive = !anyFilter;
  const todosStyle  = todosActive ? 'background:var(--gold-light);border-color:var(--gold);color:var(--gold-dark)' : '';

  document.getElementById('stats').innerHTML =
    `<button class="stat-chip stat-chip-filter${todosActive ? ' sc-active' : ''}" onclick="toggleStatFilter('todos')" style="${todosStyle}">
       <span class="sc-icon">${AR_ICO_PACKAGE()}</span>
       <span class="sc-num">${total}</span>
       <span class="sc-lbl">Todos</span>
     </button>` +
    (nKits > 0 ? chip('kits', AR_ICO_GIFT(), nKits, 'Kits', AR_C_NEUTRAL) : '') +
    chip('con-stock',   AR_ICO_CHECK(), conStock,    'Con stock',    AR_C_GREEN) +
    (sinStock > 0 ? chip('sin-stock', AR_ICO_XCIRCLE(), sinStock, 'Sin stock', AR_C_RED) : '') +
    (ultimaPieza > 0 ? chip('ultima-pieza', AR_ICO_ZAP(), ultimaPieza, 'Última pieza', AR_C_AMBER) : '') +
    (nApartado > 0 ? chip('apartado', AR_ICO_BOOKMARK(), nApartado, 'Apartado', AR_C_AMBER) : '') +
    (sinPublicar  > 0 ? chip('sin-publicar', AR_ICO_EYEOFF(), sinPublicar, 'Sin publicar', AR_C_AMBER) : '') +
    (porCaducar   > 0 ? chip('por-caducar', AR_ICO_CLOCK(),  porCaducar,  'Por caducar', AR_C_RED) : '') +
    (nBorradores > 0 ? chip('borradores', AR_ICO_FILE(), nBorradores, 'Borradores', AR_C_NEUTRAL) : '') +
    (nFlag        > 0 ? chip('revisar',     AR_ICO_FLAG(),     nFlag,       'Por revisar',  AR_C_RED) : '') +
    (sinCodigo    > 0 ? chip('sin-codigo',  AR_ICO_BARCODE(),   sinCodigo,   'Sin código',   AR_C_NEUTRAL) : '') +
    (sinCateg     > 0 ? chip('sin-categ',   AR_ICO_WARN(), sinCateg,    'Sin categoría', AR_C_AMBER) : '') +
    (() => {
      if (ROLE !== 'superadmin') return '';
      const nBase64 = products.filter(p => !p.isArchived && !_ib(p) && p.image?.startsWith('data:')).length;
      return nBase64 > 0 ? chip('imagen-base64', AR_ICO_ARCHIVE(), nBase64, 'Imagen base64', AR_C_NEUTRAL) : '';
    })() +
    (() => {
      if (!can.publishProduct) return '';
      const sinPrecio = products.filter(p => !_ib(p) && (!p.price || p.price === 0));
      if (!sinPrecio.length) return '';
      const dismissed = sessionStorage.getItem('te_no_price_dismissed') === 'true';
      if (!dismissed) return '';
      return `<button class="stat-chip stat-chip-filter" onclick="showNoPriceAlert()" style="" title="Ver productos sin precio">
        <span class="sc-icon">${AR_ICO_DOLLAR()}</span>
        <span class="sc-num">${sinPrecio.length}</span>
        <span class="sc-lbl">Sin precio</span>
      </button>`;
    })() +
    (nArchivados > 0 && can.deleteProduct ? `<button class="stat-chip" onclick="toggleArchivedView()" title="Ver productos archivados" style="border-color:var(--muted-light);color:var(--muted)">
      <span class="sc-icon">${AR_ICO_ARCHIVE()}</span>
      <span class="sc-num">${nArchivados}</span>
      <span class="sc-lbl">Archivados</span>
    </button>` : '');

  // Alerta de productos sin precio — solo visible para superadmin
  if (can.publishProduct) {
    const sinPrecio = products.filter(p => !p.isArchived && !_ib(p) && (!p.price || p.price === 0));
    const alertEl   = document.getElementById('no-price-alert');
    const alertTxt  = document.getElementById('no-price-alert-text');
    if (alertEl && alertTxt) {
      if (sinPrecio.length > 0) {
        alertTxt.textContent = `${sinPrecio.length} producto${sinPrecio.length > 1 ? 's' : ''} sin precio — pendiente de revisión`;
        const dismissed = sessionStorage.getItem('te_no_price_dismissed') === 'true';
        alertEl.style.display = dismissed ? 'none' : 'flex';
      } else {
        alertEl.style.display = 'none';
        sessionStorage.removeItem('te_no_price_dismissed');
      }
    }
  }
  _statsScroll();
}

/* Oculta el indicador "›" de .stats-wrap cuando ya no hay más chips a la derecha */
function _statsScroll() {
  const el = document.getElementById('stats');
  const wrap = el?.parentElement;
  if (!el || !wrap) return;
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
  wrap.classList.toggle('at-end', atEnd);
}

function dismissNoPriceAlert() {
  sessionStorage.setItem('te_no_price_dismissed', 'true');
  document.getElementById('no-price-alert').style.display = 'none';
  renderStats(); // actualiza chips para mostrar el chip 💲
}

function showNoPriceAlert() {
  sessionStorage.removeItem('te_no_price_dismissed');
  const alertEl = document.getElementById('no-price-alert');
  if (alertEl) {
    alertEl.style.display = 'flex';
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  renderStats(); // quita el chip 💲
}

function filterNoPriceProducts() {
  const catFilter   = document.getElementById('cat-filter');
  const searchInput = document.getElementById('search-input');
  if (catFilter)   catFilter.value   = 'all';
  if (searchInput) searchInput.value = '';
  if (_showOnlyFlagged) { _showOnlyFlagged = false; localStorage.setItem('te_flag_filter','0'); }
  _statFilter = 'sin-precio';
  _adminPage  = 1;
  renderStats();
  renderTable();
}

// Refrescar ingresos/ventas del día cuando el usuario vuelve a esta pestaña
// (por ejemplo, tras cancelar ventas de prueba en el POS)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isAuthenticated()) renderStats();
});


/* ── APARTADOS ACTIVOS — mapa productId → unidades reservadas ── */
let _apartadosMap    = {}; // { productId: totalUnits }
let _apartadosDetail = {}; // { productId: [{ saleId, customer, qty, total, paidAmount, dueDate, createdAt }] }

async function loadApartadosMap() {
  const r = await supabaseApi('sales?type=eq.apartado&cancelled_at=is.null&select=id,items,total,paid_amount,customer,due_date,created_at');
  if (!r.ok || !Array.isArray(r.data)) return;
  const map = {};
  const detail = {};
  r.data.forEach(sale => {
    // Solo apartados sin liquidar (paid_amount < total)
    if (parseFloat(sale.paid_amount || 0) >= parseFloat(sale.total || 0)) return;
    (sale.items || []).forEach(item => {
      if (!item.id) return;
      map[item.id] = (map[item.id] || 0) + (item.qty || 1);
      (detail[item.id] = detail[item.id] || []).push({
        saleId: sale.id,
        customer: (sale.customer || '').split(' · 📱 ')[0] || 'Sin nombre',
        qty: item.qty || 1,
        total: parseFloat(sale.total || 0),
        paidAmount: parseFloat(sale.paid_amount || 0),
        dueDate: sale.due_date || null,
        createdAt: sale.created_at
      });
    });
  });
  _apartadosMap    = map;
  _apartadosDetail = detail;
}

// Si un producto es componente de un kit, y ese kit sí tiene un apartado activo
// (sale.items solo guarda el id del kit, no el de sus componentes) — evita falsos huérfanos
function _findKitApartadoParent(componentId) {
  return products.find(k => Array.isArray(k.kitItems)
    && k.kitItems.some(ci => ci.id === componentId)
    && _apartadosMap[k.id]);
}

function _aptTitle(id) {
  const list = _apartadosDetail[id];
  if (!list?.length) return 'En apartado';
  return _esc(list.map(a => `${a.customer} ×${a.qty}`).join(', '));
}

/* ── RECENTLY EDITED — centralizado en Supabase ── */
let _editedList = []; // cache local: [productId, ...] ordenado por edited_at desc

async function loadRecentlyEdited() {
  const r = await supabaseApi('recently_edited?select=product_id&order=edited_at.desc&limit=60');
  if (r.ok && Array.isArray(r.data)) {
    _editedList = r.data.map(x => x.product_id);
    // Fallback: migrar datos locales si la tabla está vacía
    if (!_editedList.length) {
      const local = JSON.parse(localStorage.getItem('te_recently_edited') || '[]');
      if (local.length) _editedList = local;
    }
  }
}

function _trackEdit(id) {
  // Actualiza cache local inmediatamente
  _editedList = [id, ..._editedList.filter(x => x !== id)].slice(0, 60);
  // Sincroniza con Supabase en background
  const email = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY))?.user?.email || ''; } catch { return ''; } })();
  supabaseApi('recently_edited', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ product_id: id, user_email: email, edited_at: new Date().toISOString() })
  }).catch(() => {});
}

function _editedOrder() {
  return _editedList;
}

/* ── TABLE ── */
const isMobile = () => window.matchMedia('(max-width:1024px)').matches;

/* ── LONG PRESS — modo selección múltiple ── */
// El usuario toca y sostiene 520ms sin moverse → entra en modo selección
const _LP_DELAY  = 520;
const _lpTimers  = {};
let   _lpFired   = false; // evita que el click posterior abra QV tras un long press

function _lpStart(e, id) {
  if (_catEditActive) return;
  if (e.target.closest('button,input,select,a,.stock-chip,.cat-label-inline,.drag-handle')) return;
  _lpFired = false;
  _lpTimers[id] = setTimeout(() => {
    delete _lpTimers[id];
    _lpFired = true;
    if (navigator.vibrate) navigator.vibrate(30);
    // Seleccionar esta card y entrar en modo selección
    const cb = document.querySelector(`[data-id="${id}"] .row-check`);
    if (cb) cb.checked = true;
    toggleRowSelect(id, true);
  }, _LP_DELAY);
}

function _lpEnd(id) {
  clearTimeout(_lpTimers[id]);
  delete _lpTimers[id];
}

function _lpMove(id) {
  // Movimiento = no era intención de long press
  clearTimeout(_lpTimers[id]);
  delete _lpTimers[id];
}

// Decide qué hace un tap en una card según el contexto
function _cardTap(e, id) {
  if (_lpFired) return; // ya fue un long press, ignorar el click sintético
  if (_catEditActive) return;
  if (e.target.closest('button,input,select,a,.stock-chip,.cat-label-inline,.drag-handle')) return;

  // Ctrl/Cmd+clic → toggle selección directa en desktop
  if (e.ctrlKey || e.metaKey) {
    const newVal = !selectedIds.has(id);
    const cb = document.querySelector(`[data-id="${id}"] .row-check`);
    if (cb) cb.checked = newVal;
    toggleRowSelect(id, newVal);
    return;
  }

  if (selectedIds.size > 0) {
    // Modo selección activo → tap alterna selección de esta card
    const newVal = !selectedIds.has(id);
    const cb = document.querySelector(`[data-id="${id}"] .row-check`);
    if (cb) cb.checked = newVal;
    toggleRowSelect(id, newVal);
  } else {
    // Modo normal → abrir Quick View
    openQV(id);
  }
}

let currentAdminView = localStorage.getItem('te_admin_view') || 'list';

function setAdminView(view) {
  currentAdminView = view;
  localStorage.setItem('te_admin_view', view);
  document.getElementById('vbtn-list')?.classList.toggle('active', view === 'list');
  document.getElementById('vbtn-cards')?.classList.toggle('active', view === 'cards');
  renderTable();
}

function adminCard(p, editable = false) {
  const fallback = DEFAULT_IMG;
  const oos = Array.isArray(p.kitItems) ? false : (p.outOfStock || p.stock === 0);
  const sel = selectedIds.has(p.id);
  const catColor = getCatColor(p.category);

  const priceDisplay = p.price === 0
    ? `<span class="ac-price ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Sin precio — toca para agregar">Sin precio</span>`
    : p.originalPrice
      ? `<span class="ac-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="ac-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar precio">$${p.price.toLocaleString('es-MX')}</span>`
      : `<span class="ac-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar precio">$${p.price.toLocaleString('es-MX')}</span>`;
  const priceHTML = priceDisplay;
  const flagData  = _flagItem(p.id);
  const flagDotAC = flagData ? `<span class="flag-dot" title="${_esc(flagData.note || 'Pendiente de revisión')}">${AR_ICO_FLAG(13)}</span>` : '';
  const isSinCat  = p.category === 'por_revisar';

  return `
<div class="admin-card${sel?' card-selected':''}${(p.isApartado||_apartadosMap[p.id])&&p.stock<=1?' card-apartado':oos?' card-oos':''}${isSinCat?' card-por-revisar':''}"
     data-id="${p.id}"
     onclick="_cardTap(event,${p.id})"
     ontouchstart="_lpStart(event,${p.id})"
     ontouchend="_lpEnd(${p.id})"
     ontouchmove="_lpMove(${p.id})"
     draggable="true"
     ondragstart="_cardDragStart(event,${p.id})"
     ondragend="_cardDragEnd(event)"
     ondragover="_cardDragOver(event,${p.id})"
     ondrop="_cardDrop(event,${p.id})"
     style="cursor:pointer">
  <div class="ac-img-wrap">
    <img class="ac-img" src="${_driveSz(p.image,300)}" alt="${_esc(p.name)}" draggable="false" loading="lazy"
         onerror="this.onerror=null;this.src='${fallback}'">
    <input type="checkbox" class="ac-check row-check"
           ${sel?'checked':''} onchange="toggleRowSelect(${p.id},this.checked)">
    ${flagDotAC}
    <button class="ac-star toggle-featured${p.featured ? ' feat-active' : ''}" onclick="toggleFeatured(${p.id})"
            title="${p.featured?'Quitar destacado':'Destacar'}">
      ${_arStar(p.featured, 15)}
    </button>
  </div>
  <div class="ac-body">
    <div class="ac-name" title="${_esc(p.name)}">${_esc(p.name)}</div>
    ${flagData?.note ? `<div class="flag-note-line">${AR_ICO_FLAG(13)}"${_esc(flagData.note)}"</div>` : ''}
    <div class="ac-meta">
      <span class="cat-dot" style="background:${catColor}"></span>
      ${editable
        ? `<span class="cat-label-inline${isSinCat?' cat-label-sin-cat':''}" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Clic para cambiar categoría" style="${isSinCat?'':'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'}">${isSinCat ? 'Sin categoría' : _esc(p.categoryLabel)}</span>`
        : `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;color:var(--muted)">${_esc(p.categoryLabel)}</span>`
      }
      ${_showCreator && ROLE === 'superadmin' && p.createdBy ? `<span class="creator-chip" title="${p.createdBy}">${AR_ICO_USER()}${_creatorName(p.createdBy)}</span>` : ''}
    </div>
    <div class="ac-price-row">${priceHTML}</div>
    <div class="ac-footer">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${stockChip(p, editable)}
        ${expiryChip(p)}
        ${publishedToggle(p)}
      </div>
    </div>
  </div>
</div>`;
}

function _kitInfo(p) {
  if (!Array.isArray(p.kitItems)) return null;
  if (!p.kitItems.length) return { stock: 0, empty: true };
  let min = Infinity, blocker = null;
  for (const comp of p.kitItems) {
    const c = products.find(x => x.id === comp.id);
    if (!c || c.outOfStock || c.stock === 0) return { stock: 0, blocker: comp.name };
    const avail = Math.floor(c.stock / comp.qty);
    if (avail < min) { min = avail; blocker = comp.name; }
  }
  const stock = min === Infinity ? 0 : min;
  return { stock, blocker: stock === 0 ? blocker : null };
}

function expiryChip(p) {
  const st = _expiryStatus(p);
  if (!st || st.state === 'ok') return '';
  const dateStr = new Date(p.expiryDate + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
  return st.state === 'expired'
    ? `<span class="exp-chip exp-chip-expired" title="Caducó el ${dateStr}">${AR_ICO_CLOCK(13)}Caducado</span>`
    : `<span class="exp-chip exp-chip-soon" title="Caduca el ${dateStr}">${AR_ICO_CLOCK(13)}${st.days}d</span>`;
}

function stockChip(p, editable = false) {
  if (Array.isArray(p.kitItems)) {
    const ki = _kitInfo(p);
    if (ki?.empty) return `<span class="stock-chip stock-sold" style="cursor:default">${AR_ICO_GIFT(13)}Sin componentes</span>`;
    if (ki?.stock === 0) {
      // El nombre del componente faltante no cabe sin truncarlo a media
      // palabra -- y en mobile el atributo title (única forma de leerlo
      // completo) no se dispara con el dedo. En vez de eso: etiqueta corta
      // y completa siempre, toca para ver exactamente cuál falta en el QV
      // (que ya resalta el componente agotado en la lista "Incluye").
      return `<span class="stock-chip stock-sold" onclick="event.stopPropagation();openQV(${p.id})" ontouchstart="event.stopPropagation()" title="Falta: ${_esc(ki.blocker ?? 'componente agotado')} — toca para ver detalle" style="cursor:pointer">${AR_ICO_GIFT(13)}Reabastecer</span>`;
    }
    const n = ki?.stock ?? 0;
    return `<span class="stock-chip stock-ok" style="cursor:default">${AR_ICO_GIFT(13)}${n} kit${n !== 1 ? 's' : ''}</span>`;
  }
  // Agotado/Apartado ya explican por qué el stock es bajo — se fusionan en
  // un solo chip en vez de repetir el mismo estado en dos insignias.
  const isApt = (p.isApartado || _apartadosMap[p.id]) && p.stock <= 1;
  const label = p.outOfStock
    ? `${AR_ICO_WARN(11)}${p.stock} · Agotado`
    : isApt
      ? `${AR_ICO_BOOKMARK(11)}${p.stock} · Apartado`
      : p.stock;
  const cls = p.outOfStock ? 'sold' : isApt ? 'apt' : p.stock === 1 ? 'one' : 'ok';
  const title = isApt ? _aptTitle(p.id) : 'Clic para editar stock';
  if (editable) {
    return `<span class="stock-chip stock-${cls}" onclick="editStockInline(event,${p.id},this)" ontouchstart="event.stopPropagation()" title="${_esc(title)}" style="cursor:pointer">${label}</span>`;
  }
  return `<span class="stock-chip stock-${cls}" style="cursor:default" title="${_esc(title)}">${label}</span>`;
}

async function editStockInline(e, id, chipEl) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;

  const chip = chipEl || e.currentTarget || e.target.closest('.stock-chip,.qv-chip') || e.target;
  const mobile = isMobile();

  // Cápsula flotante anclada al chip — antes el stepper [−] N [+] ✓ ✕ se
  // insertaba EN la fila, apretado junto al precio y demás controles de la
  // tarjeta (5-6 zonas táctiles pegadas). El chip nunca se toca/reemplaza,
  // así que cancelar no necesita re-renderizar nada.
  chip.classList.add('stock-chip-editing');

  const backdrop = document.createElement('div');
  backdrop.className = 'field-pop-backdrop';

  const pop = document.createElement('div');
  pop.className = 'field-pop';
  pop.innerHTML = `
    <div class="field-pop-label">Editar stock</div>
    <div class="field-pop-stepper">
      <button type="button" class="sp-minus">−</button>
      <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${p.stock}">
      <button type="button" class="sp-plus">+</button>
    </div>
    <div class="field-pop-actions">
      <button type="button" class="field-pop-cancel">Cancelar</button>
      <button type="button" class="field-pop-save">Guardar</button>
    </div>`;
  document.body.append(backdrop, pop);

  const input     = pop.querySelector('input');
  const btnMinus  = pop.querySelector('.sp-minus');
  const btnPlus   = pop.querySelector('.sp-plus');
  const btnSave   = pop.querySelector('.field-pop-save');
  const btnCancel = pop.querySelector('.field-pop-cancel');

  const position = () => {
    const r = chip.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  };
  position();

  let saved = false;
  const teardown = () => {
    chip.classList.remove('stock-chip-editing');
    backdrop.remove(); pop.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', position);
  };
  const cancel = () => { if (saved) return; saved = true; teardown(); };

  const save = async () => {
    if (saved) return;
    saved = true;
    const newStock = Math.max(0, parseInt(input.value) || 0);
    teardown();
    if (newStock === p.stock) return;

    const patch = { stock: newStock };
    if (newStock > 0 && p.outOfStock)  patch.out_of_stock = false;
    if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true;
    if (newStock === 0) patch.is_published = false;

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    if (result.ok) {
      const prevStock = p.stock;
      p.stock = newStock;
      if (patch.out_of_stock !== undefined) p.outOfStock = patch.out_of_stock;
      if (newStock === 0) p.isPublished = false;
      renderStats();
      logActivity('producto_editado', `Cambió stock de "${p.name}": ${prevStock} → ${newStock}`, { id, name: p.name, prevStock, newStock });
      toast(`Stock → ${newStock}${patch.out_of_stock !== undefined ? (patch.out_of_stock ? ' · Marcado agotado · Oculto del sitio' : ' · Marcado disponible') : ''}`);
    } else {
      toast('Error al actualizar stock', 'error');
    }
    renderTable(); _qvRefresh(id);
  };

  btnMinus.onclick  = () => { input.value = Math.max(0, parseInt(input.value)||0) - 1; };
  btnPlus.onclick   = () => { input.value = (parseInt(input.value)||0) + 1; };
  btnSave.onclick   = () => save();
  btnCancel.onclick = () => cancel();
  backdrop.onclick  = () => cancel();

  const onKey = ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
  };
  const onScroll = () => cancel();
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', position);
  // Scroll listener con retraso: al enfocar el input, iOS/Android suelen
  // hacer scroll automático para esquivar el teclado — sin este retraso ese
  // scroll cerraría el popover de inmediato, apenas abierto.
  setTimeout(() => window.addEventListener('scroll', onScroll, true), 400);

  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
  }, 50);
}

let _inlineEditActive = false;

async function editPriceInlineAdmin(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!can.editProduct) { toast('Sin permiso para editar precios', 'error'); return; }
  _inlineEditActive = true;

  // Mismo popover flotante que editStockInline — antes el precio se
  // reemplazaba EN la fila (en mobile con su propio botón ✓ pegado a los
  // demás chips de la tarjeta: stock, Web/Oculto). El valor original nunca
  // se toca, así que cancelar no necesita re-renderizar nada.
  const trigger = e.currentTarget;
  const mobile = isMobile();
  trigger.classList.add('field-value-editing');

  const backdrop = document.createElement('div');
  backdrop.className = 'field-pop-backdrop';

  const pop = document.createElement('div');
  pop.className = 'field-pop';
  pop.innerHTML = `
    <div class="field-pop-label">Editar precio</div>
    <div class="field-pop-input-row">
      <span class="field-pop-currency">$</span>
      <input type="text" inputmode="decimal" pattern="[0-9]*" autocomplete="off" value="${p.price || ''}" placeholder="0">
    </div>
    <div class="field-pop-actions">
      <button type="button" class="field-pop-cancel">Cancelar</button>
      <button type="button" class="field-pop-save">Guardar</button>
    </div>`;
  document.body.append(backdrop, pop);

  const input     = pop.querySelector('input');
  const btnSave   = pop.querySelector('.field-pop-save');
  const btnCancel = pop.querySelector('.field-pop-cancel');

  const position = () => {
    const r = trigger.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  };
  position();

  let saved = false;
  const teardown = () => {
    trigger.classList.remove('field-value-editing');
    backdrop.remove(); pop.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', position);
    _inlineEditActive = false;
  };
  const cancel = () => { if (saved) return; saved = true; teardown(); };

  const save = async () => {
    if (saved) return;
    saved = true;
    const newPrice = parseFloat(input.value);
    teardown();
    if (isNaN(newPrice) || newPrice < 0) return;
    if (newPrice === p.price) return;

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify({ price: newPrice })
    });
    if (result.ok) {
      p.price = newPrice;
      renderStats();
      toast(`Precio actualizado → $${newPrice.toLocaleString('es-MX')}`);
    } else {
      toast('Error al actualizar precio', 'error');
    }
    renderTable(); _qvRefresh(id);
  };

  btnSave.onclick   = () => save();
  btnCancel.onclick = () => cancel();
  backdrop.onclick  = () => cancel();

  const onKey = ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
  };
  const onScroll = () => cancel();
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', position);
  setTimeout(() => window.addEventListener('scroll', onScroll, true), 400);

  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
  }, 50);
}

// getCatColor() reemplaza CAT_COLORS — usa el array dinámico de categorías

function publishedToggle(p) {
  // El chip de stock ya explica "Agotado" cuando aplica — aquí solo se
  // refleja el campo real is_published (Web/Oculto), sin repetir el estado.
  if (p.isPublished === false) {
    return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-hidden" title="Tap para publicar en sitio web">${AR_ICO_EYEOFF(13)}<span class="pub-toggle-lbl">Oculto</span></button>`;
  }
  return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-visible" title="Tap para ocultar del sitio web">${AR_ICO_GLOBE(13)}<span class="pub-toggle-lbl">Web</span></button>`;
}

async function togglePublished(id) {
  if (!can.publishProduct) { toast('Solo el administrador puede publicar o ocultar productos', 'error'); return; }
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = p.isPublished === false ? true : false;
  if (newVal && p.price === 0) { toast('Precio $0 — ajusta el precio antes de publicar en la web', 'warn'); return; }
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_published: newVal })
  });
  if (!result.ok) { toast('Error al actualizar visibilidad', 'error'); return; }
  p.isPublished = newVal;
  renderTable();
  renderStats();
  toast(newVal ? '🌐 Publicado en sitio web' : '🙈 Oculto del sitio web', 'success');
}

let _catEditActive = false;

let _bcpInlineId = null;

function editCategoryInline(e, id) {
  e.stopPropagation();
  e.stopImmediatePropagation();
  _bcpFormMode = false;
  _bcpInlineId = id;
  const p = products.find(x => x.id === id);
  document.getElementById('bcp-sub').textContent = p ? p.name : 'Cambiar categoría';
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function desktopRow(p) {
  const fallback = DEFAULT_IMG;
  const oos = Array.isArray(p.kitItems) ? false : (p.outOfStock || p.stock === 0);
  const featStar   = `<span onclick="toggleFeatured(${p.id})" class="toggle-featured${p.featured ? ' feat-active' : ''}" title="${p.featured ? 'Quitar destacado' : 'Destacar'}">${_arStar(p.featured, 14)}</span>`;
  const catColor   = getCatColor(p.category);
  const catDot     = `<span class="cat-dot" style="background:${catColor}"></span>`;
  const flagDataDR = _flagItem(p.id);
  const isSinCatDR = p.category === 'por_revisar';
  const flagDotRow = flagDataDR ? `<span class="flag-dot-row" title="${_esc(flagDataDR.note || 'Pendiente de revisión')}">${AR_ICO_FLAG(13)}</span>` : '';
  return `
<tr draggable="true" data-id="${p.id}" class="${selectedIds.has(p.id) ? 'row-selected' : ''}${isSinCatDR ? ' card-por-revisar' : ''}"
    ondblclick="if(!event.target.closest('button,input,select,a,.drag-handle,.cat-label-inline'))openForm(${p.id})"
    title="Doble clic para editar">
  <td class="col-check" style="text-align:center">
    <input type="checkbox" class="row-check" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
  </td>
  <td class="col-product">
    <div style="display:flex;align-items:center;gap:10px;min-width:0">
      <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
      <img class="prod-thumb" src="${_driveSz(p.image,80)}" alt="${_esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'" onclick="event.stopPropagation();openQV(${p.id})" style="cursor:pointer${oos ? ';opacity:.5;filter:grayscale(.5)' : ''}" title="Ver detalle rápido">
      <div style="min-width:0;flex:1">
        <div class="prod-name" title="${_esc(p.name)}">${_esc(p.name)}</div>
        ${flagDataDR?.note ? `<div class="flag-note-line">${AR_ICO_FLAG(13)}"${_esc(flagDataDR.note)}"</div>` : ''}
        <div class="prod-meta">
          ${catDot}
          <span class="prod-meta-text"><span class="cat-label-inline${isSinCatDR ? ' cat-label-sin-cat' : ''}" onclick="editCategoryInline(event,${p.id})" title="Clic para cambiar categoría">${isSinCatDR ? 'Sin categoría' : _esc(p.categoryLabel)}</span> · #${p.id}${_showCreator && ROLE === 'superadmin' && p.createdBy ? ` · <span class="creator-chip" title="${p.createdBy}">${AR_ICO_USER()}${_creatorName(p.createdBy)}</span>` : ''}</span>
          ${featStar}${publishedToggle(p)}${flagDotRow}
        </div>
      </div>
    </div>
  </td>
  <td class="col-price">
    ${p.originalPrice ? `<div class="orig-price-cell">$${p.originalPrice.toLocaleString('es-MX')}</div>` : ''}
    ${p.price === 0
      ? `<div class="price-cell ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" title="Sin precio — clic para agregar" style="cursor:pointer">Sin precio</div>`
      : `<div class="price-cell ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" title="Clic para editar precio" style="cursor:pointer">$${p.price.toLocaleString('es-MX')}</div>`}
  </td>
  <td class="col-state">
    <div class="state-cell">
      ${stockChip(p, true)}
      ${expiryChip(p)}
    </div>
  </td>
</tr>`;
}

function mobileCard(p) {
  const fallback = DEFAULT_IMG;
  const sel = selectedIds.has(p.id);
  const oos = Array.isArray(p.kitItems) ? false : (p.outOfStock || p.stock === 0);
  const catColor = getCatColor(p.category);
  const flagDataMC = _flagItem(p.id);
  const isSinCatMC = p.category === 'por_revisar';

  const priceHTML = p.price === 0
    ? `<span class="mpc-price ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Sin precio">Sin precio</span>`
    : p.originalPrice
      ? `<span class="mpc-price-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="mpc-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()">$${p.price.toLocaleString('es-MX')}</span>`
      : `<span class="mpc-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()">$${p.price.toLocaleString('es-MX')}</span>`;

  const stockInfo = `<span class="mpc-stock-inline">${stockChip(p, true)}</span>`;


  return `
<tr class="mpc-row${sel ? ' row-selected' : ''}${isSinCatMC ? ' card-por-revisar' : ''}" data-id="${p.id}">
  <td>
    <div class="mpc${oos ? ' mpc-oos' : ''}">
      <div class="mpc-top"
           onclick="_cardTap(event,${p.id})"
           ontouchstart="_lpStart(event,${p.id})"
           ontouchend="_lpEnd(${p.id})"
           ontouchmove="_lpMove(${p.id})"
           style="cursor:pointer">
        <div class="mpc-img-wrap">
          <img class="mpc-img" src="${_driveSz(p.image,300)}" alt="${_esc(p.name)}" loading="lazy"
               onerror="this.onerror=null;this.src='${fallback}'"
               ${oos ? 'style="opacity:.5;filter:grayscale(.4)"' : ''}>
          <input type="checkbox" class="row-check mpc-check-over"
                 ${sel ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
          <button class="mpc-star${p.featured ? ' feat-active' : ''}"
                  onclick="event.stopPropagation();toggleFeatured(${p.id})"
                  ontouchstart="event.stopPropagation()"
                  title="${p.featured ? 'Quitar destacado' : 'Destacar'}">
            ${_arStar(p.featured, 14)}
          </button>
        </div>
        <div class="mpc-info">
          <div class="mpc-name">${_esc(p.name)}${flagDataMC ? ' <span class="flag-dot-row" title="'+_esc(flagDataMC.note||'Pendiente de revisión')+'">'+AR_ICO_FLAG(13)+'</span>' : ''}</div>
          ${flagDataMC?.note ? `<div class="flag-note-line">${AR_ICO_FLAG(13)}"${_esc(flagDataMC.note)}"</div>` : ''}
          <div class="mpc-cat-tag">
            <span class="cat-dot" style="background:${catColor}"></span>
            <span class="cat-label-inline${isSinCatMC ? ' cat-label-sin-cat' : ''}" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar categoría">${isSinCatMC ? 'Sin categoría' : _esc(p.categoryLabel)}</span>
            ${_showCreator && ROLE === 'superadmin' && p.createdBy ? `<span class="creator-chip" title="${p.createdBy}">${AR_ICO_USER()}${_creatorName(p.createdBy)}</span>` : ''}
          </div>
          <div class="mpc-price-row">
            ${priceHTML}${stockInfo}
            ${expiryChip(p)}
            ${publishedToggle(p)}
          </div>
        </div>
      </div>
    </div>
  </td>
</tr>`;
}

function renderTable() {
  const filtered  = getFilteredProducts();
  const mobile    = isMobile();
  // En mobile, "cards" también activa la vista de grid (2 columnas con adminCard)
  const useCards  = currentAdminView === 'cards';

  const countEl = document.getElementById('prod-count');
  if (countEl) {
    // El denominador debe ser el catálogo activo (o archivado, según la vista),
    // no products.length crudo -- ese mezcla archivados con activos y no
    // coincide con ningún número que el usuario reconozca (ni "Todos" ni nada).
    const poolTotal = products.filter(p => _showingArchived ? p.isArchived : !p.isArchived).length;
    countEl.style.display = poolTotal === 0 ? 'none' : '';
    if (poolTotal > 0) {
      countEl.textContent = filtered.length === poolTotal
        ? `${poolTotal} producto${poolTotal !== 1 ? 's' : ''}`
        : `${filtered.length} de ${poolTotal}`;
    }
  }

  const tableEl  = document.getElementById('products-table-el');
  const cardGrid = document.getElementById('products-card-grid');
  if (tableEl)  tableEl.style.display  = useCards ? 'none' : '';
  if (cardGrid) cardGrid.style.display = useCards ? '' : 'none';

  if (!filtered.length) {
    const isFiltered = (document.getElementById('search-input')?.value || '') ||
                       (document.getElementById('cat-filter')?.value !== 'all');
    const isFlagOnly = _showOnlyFlagged;
    const emptyHTML = `<div class="empty-state">
      <div class="es-icon" style="color:var(--muted-light)">${isFlagOnly ? AR_ICO_FLAG(40) : isFiltered ? AR_ICO_SEARCH(40) : AR_ICO_PACKAGE(40)}</div>
      <p>${isFlagOnly ? '¡Todo revisado! No hay productos pendientes.' : isFiltered ? 'Ningún producto coincide con el filtro.' : 'El catálogo está vacío.'}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${isFlagOnly ? `<button class="btn btn-gold btn-sm" onclick="toggleFlagFilter()">Ver todos los productos</button>` : ''}
        ${!isFlagOnly && isFiltered ? `<button class="btn btn-outline btn-sm" onclick="clearAdminFilters()">✕ Limpiar filtros</button>` : ''}
        ${!isFlagOnly && !isFiltered ? `<button class="btn btn-gold btn-sm" onclick="openForm()">+ Agregar primer producto</button>` : ''}
      </div>
    </div>`;
    if (useCards && cardGrid) { cardGrid.innerHTML = emptyHTML; }
    else {
      const tbody = document.getElementById('products-table');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4">${emptyHTML}</td></tr>`;
    }
    updateBulkBar();
    if (!document.getElementById('qv-overlay')?.classList.contains('open')) _updateActiveFiltersBar();
    _setupLoadMoreSentinel(false);
    return;
  }

  if (!document.getElementById('qv-overlay')?.classList.contains('open')) _updateActiveFiltersBar();

  const visible  = filtered.slice(0, _adminPage * ADMIN_PAGE_SIZE);
  const hasMore  = visible.length < filtered.length;
  const sentinelHTML = hasMore
    ? `<div id="admin-load-sentinel" style="padding:16px;text-align:center;color:var(--muted);font-size:.85rem">Cargando más…</div>`
    : '';

  if (useCards && cardGrid) {
    cardGrid.innerHTML = visible.map(p => adminCard(p, true)).join('') + sentinelHTML;
    updateBulkBar();
    _setupLoadMoreSentinel(hasMore);
    return;
  }

  // Vista lista: mobile → mpc cards, desktop → tabla
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = visible.map(p => mobile ? mobileCard(p) : desktopRow(p)).join('') +
    (hasMore ? `<tr><td colspan="4">${sentinelHTML}</td></tr>` : '');

  updateSelectAllCheckbox();
  if (!mobile) initDragDrop();
  _setupLoadMoreSentinel(hasMore);
}

/* ── INFINITE SCROLL ── */
function _setupLoadMoreSentinel(hasMore) {
  if (_adminLoadObserver) { _adminLoadObserver.disconnect(); _adminLoadObserver = null; }
  if (!hasMore) return;
  const sentinel = document.getElementById('admin-load-sentinel');
  if (!sentinel) return;
  _adminLoadObserver = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    _adminLoadObserver.disconnect();
    _adminLoadObserver = null;
    _adminPage++;
    renderTable();
  }, { rootMargin: '400px' });
  _adminLoadObserver.observe(sentinel);
}

/* ── SELECTION ── */
function toggleRowSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  const row = document.querySelector(`#products-table tr[data-id="${id}"]`);
  if (row) row.classList.toggle('row-selected', checked);
  // Clase selection-active en el grid de cards — revela los checkboxes
  document.getElementById('products-card-grid')
    ?.classList.toggle('selection-active', selectedIds.size > 0);
  updateBulkBar();
  updateSelectAllCheckbox();
}

function toggleSelectAll() {
  const filtered = getFilteredProducts();
  const allChecked = document.getElementById('select-all').checked;
  if (allChecked) filtered.forEach(p => selectedIds.add(p.id));
  else filtered.forEach(p => selectedIds.delete(p.id));

  document.querySelectorAll('#products-table .row-check').forEach(cb => {
    const id = parseInt(cb.closest('tr').dataset.id);
    cb.checked = selectedIds.has(id);
    cb.closest('tr').classList.toggle('row-selected', selectedIds.has(id));
  });
  updateBulkBar();
}

function clearBulkSelection() {
  selectedIds.clear();
  document.getElementById('products-card-grid')?.classList.remove('selection-active');
  renderTable();
  updateBulkBar();
}

function selectAllVisible() {
  const visible = getFilteredProducts();
  visible.forEach(p => selectedIds.add(p.id));
  document.getElementById('products-card-grid')?.classList.add('selection-active');
  renderTable();
  updateBulkBar();
  toast(`${visible.length} productos seleccionados`, '');
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-count');
  const compareBtn = document.getElementById('bulk-compare-btn');
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}`;
    if (compareBtn) compareBtn.style.display = selectedIds.size === 2 ? '' : 'none';
    _bulkBarScroll();
  } else {
    bar.style.display = 'none';
  }
}

function updateSelectAllCheckbox() {
  const filtered = getFilteredProducts();
  const checkbox = document.getElementById('select-all');
  if (!checkbox || !filtered.length) return;
  const allSelected = filtered.every(p => selectedIds.has(p.id));
  const someSelected = filtered.some(p => selectedIds.has(p.id));
  checkbox.checked = allSelected;
  checkbox.indeterminate = !allSelected && someSelected;
}

/* ── TOGGLE FEATURED — targeted PATCH ── */
async function toggleFeatured(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = !p.featured;
  const btn = document.querySelector(`tr[data-id="${id}"] .toggle-featured`);
  if (btn) btn.style.opacity = '0.35';

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ featured: newVal })
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar destacado', 'error');
    return;
  }
  p.featured = newVal;
  renderTable();
  renderStats();
  toast(newVal ? 'Marcado como destacado ⭐' : 'Quitado de destacados');
}

/* ── DUPLICATE — POST single product ── */
async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const maxId = products.reduce((m, x) => Math.max(m, x.id), 0);
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, outOfStock: false, isPublished: false, position: products.length };
  products.push(copy);

  if (getSupabaseUrl()) {
    const result = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: copy.id, name: copy.name, category: copy.category,
        category_label: copy.categoryLabel, price: copy.price,
        description: copy.description, image: copy.image,
        badge: copy.badge, badge_type: copy.badgeType,
        featured: copy.featured, out_of_stock: false, is_published: false,
        original_price: copy.originalPrice, position: copy.position,
        barcode: null, stock: copy.stock ?? 0, cost: copy.cost ?? null,
        expiry_date: copy.expiryDate ?? null,
        kit_items: copy.kitItems ?? null,
        images: copy.images ?? null
      })
    });
    if (!result.ok) {
      products.pop();
      toast('Error al duplicar en Supabase', 'error');
      return;
    }
    _trackEdit(copy.id);
  }

  renderTable();
  renderStats();
  if (!can.deleteProduct) {
    // Operador: undo para deshacer el duplicado accidental (7 segundos)
    toastUndo(`"${truncName(copy.name)}" duplicado`, async () => {
      const r = await supabaseApi(`products?id=eq.${copy.id}`, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } });
      if (r.ok) {
        products = products.filter(p => p.id !== copy.id);
        renderTable();
        renderStats();
        toast('Duplicado deshecho ✓', 'success');
      }
    });
  } else {
    toastAction('Producto duplicado', 'Editar →', () => openForm(copy.id));
  }
}

/* ── DRAG & DROP REORDER ── */
function initDragDrop() {
  const rows = document.querySelectorAll('#products-table tr[data-id]');
  rows.forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = parseInt(row.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      if (selectedIds.has(dragSrcId) && selectedIds.size > 1) {
        _startMultiDrag(e);
      } else {
        _multiDrag = false;
        row.classList.add('dragging');
      }
    });
    row.addEventListener('dragend', () => {
      _multiDrag = false;
      document.getElementById('products-card-grid')?.classList.remove('multi-dragging');
      document.querySelectorAll('tr.dragging,.admin-card.card-dragging').forEach(el =>
        el.classList.remove('dragging','card-dragging'));
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r =>
        r.classList.remove('drop-above','drop-below'));
    });
    row.addEventListener('dragover', e => {
      const tid = parseInt(row.dataset.id);
      if (tid === dragSrcId || (_multiDrag && selectedIds.has(tid))) return; // sin preventDefault → cursor "no-drop"
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r =>
        r.classList.remove('drop-above','drop-below'));
      row.classList.add(e.clientY < mid ? 'drop-above' : 'drop-below');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = parseInt(row.dataset.id);
      if (targetId === dragSrcId) return;
      if (_multiDrag && selectedIds.has(targetId)) return; // soltar sobre seleccionado = no-op real
      const isAbove = row.classList.contains('drop-above');
      if (_multiDrag) {
        _doMultiDrop(targetId, isAbove);
      } else {
        const srcIdx = products.findIndex(p => p.id === dragSrcId);
        const tgtIdx = products.findIndex(p => p.id === targetId);
        const [item] = products.splice(srcIdx, 1);
        const insertAt = isAbove ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx) : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
        products.splice(insertAt, 0, item);
      }
      _forcePositionSort();
      renderTable();
      save().then(ok => toast(ok ? 'Orden guardado ✓' : 'Error al guardar orden', ok ? '' : 'error'));
    });
  });
}

/* ── DRAG & DROP CARDS ── */
function _cardDragStart(e, id) {
  dragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  if (selectedIds.has(id) && selectedIds.size > 1) {
    _startMultiDrag(e);
  } else {
    _multiDrag = false;
    setTimeout(() => e.target.closest('.admin-card')?.classList.add('card-dragging'), 0);
  }
}

function _cardDragEnd(e) {
  _multiDrag = false;
  document.getElementById('products-card-grid')?.classList.remove('multi-dragging');
  document.querySelectorAll('tr.dragging,.admin-card.card-dragging').forEach(el =>
    el.classList.remove('dragging','card-dragging'));
  document.querySelectorAll('.card-drop-before,.card-drop-after').forEach(c =>
    c.classList.remove('card-drop-before','card-drop-after'));
}

function _cardDragOver(e, id) {
  if (id === dragSrcId || (_multiDrag && selectedIds.has(id))) return; // sin preventDefault → cursor "no-drop"
  e.preventDefault();
  document.querySelectorAll('.card-drop-before,.card-drop-after').forEach(c =>
    c.classList.remove('card-drop-before','card-drop-after'));
  const card = e.currentTarget;
  const mid = card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2;
  card.classList.add(e.clientX < mid ? 'card-drop-before' : 'card-drop-after');
}

function _cardDrop(e, targetId) {
  e.preventDefault();
  if (targetId === dragSrcId) return;
  if (_multiDrag && selectedIds.has(targetId)) return; // soltar sobre seleccionado = no-op real
  const card = e.currentTarget;
  const isBefore = card.classList.contains('card-drop-before');
  card.classList.remove('card-drop-before','card-drop-after');
  if (_multiDrag) {
    _doMultiDrop(targetId, isBefore);
  } else {
    const srcIdx = products.findIndex(p => p.id === dragSrcId);
    const tgtIdx = products.findIndex(p => p.id === targetId);
    const [item] = products.splice(srcIdx, 1);
    const insertAt = isBefore
      ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx)
      : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
    products.splice(insertAt, 0, item);
  }
  _forcePositionSort();
  renderTable();
  save().then(ok => toast(ok ? 'Orden guardado ✓' : 'Error al guardar orden', ok ? '' : 'error'));
}

/* ── BADGE DATALIST ── */
function populateBadgeList() {
  const datalist = document.getElementById('badge-options');
  if (!datalist) return;
  const defaults = ['Más vendido', 'Nuevo', 'Oferta', 'Natura', 'Favorito', 'Temporada', 'Exclusivo', 'Limitado'];
  const fromProducts = products.filter(p => p.badge).map(p => p.badge);
  const all = [...new Set([...defaults, ...fromProducts])];
  datalist.innerHTML = all.map(b => `<option value="${b}">`).join('');
}
