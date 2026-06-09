/* ── STATS ── */
function renderStats() {
  const nArchivados = products.filter(p => p.isArchived).length;

  if (_showingArchived) {
    document.getElementById('stats').innerHTML =
      `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="stat-chip stat-chip-filter sc-active" onclick="toggleArchivedView()" style="background:var(--charcoal);border-color:var(--charcoal);color:#fff;gap:6px">
          <span class="sc-icon">←</span><span class="sc-lbl">Volver al inventario</span>
        </button>
        <span style="font-size:.82rem;color:var(--muted)">${nArchivados} producto${nArchivados !== 1 ? 's' : ''} archivado${nArchivados !== 1 ? 's' : ''}</span>
      </div>`;
    return;
  }

  // Helper: define borrador igual que getFilteredProducts para que contador = lo que se ve al filtrar
  const _ib = p => !p.kitItems?.length && !p.isPublished && (!p.price || p.price === 0);

  const nBorradores = products.filter(p => !p.isArchived && _ib(p)).length;
  const visible     = p => !p.isArchived && !_ib(p) && !p.kitItems?.length; // no archivado, no borrador, no kit
  const total       = products.filter(visible).length;
  const conStock    = products.filter(p => visible(p) && p.stock > 0 && !p.outOfStock).length;
  const sinStock    = products.filter(p => visible(p) && (p.stock === 0 || p.outOfStock)).length;
  const ultimaPieza = products.filter(p => visible(p) && p.stock === 1 && !p.outOfStock).length;
  const sinPublicar = products.filter(p => visible(p) && p.isPublished === false).length;
  const nKits       = products.filter(p => !!p.kitItems?.length).length;
  const sinCodigo   = products.filter(p => visible(p) && !p.barcode).length;
  const sinCateg    = products.filter(p => visible(p) && p.category === 'por_revisar').length;
  const nFlag = _flagged.filter(f => {
    const p = products.find(x => x.id === f.id);
    return p && !_ib(p);
  }).length;
  const anyFilter   = _statFilter || _showOnlyFlagged;

  const chip = (key, icon, count, label, activeColor, activeTextColor='#fff') => {
    const isActive = key === 'revisar' ? _showOnlyFlagged : _statFilter === key;
    const isTodos  = key === 'todos';
    const isFilter = key !== 'todos-info';
    const activeStyle = isActive ? `background:${activeColor};border-color:${activeColor};color:${activeTextColor}` : '';
    return `<button class="stat-chip${isFilter ? ' stat-chip-filter' : ''}${isActive ? ' sc-active' : ''}"
      ${isFilter ? `onclick="toggleStatFilter('${key}')"` : ''}
      style="${activeStyle}" title="${label}">
      <span class="sc-icon">${icon}</span>
      <span class="sc-num">${count}</span>
      <span class="sc-lbl">${label}</span>
    </button>`;
  };

  const todosActive = !anyFilter;
  const todosStyle  = todosActive ? 'background:var(--gold);border-color:var(--gold);color:#fff' : '';

  document.getElementById('stats').innerHTML =
    `<button class="stat-chip stat-chip-filter${todosActive ? ' sc-active' : ''}" onclick="toggleStatFilter('todos')" style="${todosStyle}">
       <span class="sc-icon">📦</span>
       <span class="sc-num">${total}</span>
       <span class="sc-lbl">Todos</span>
     </button>` +
    (nKits > 0 ? chip('kits', '🎁', nKits, 'Kits', '#C9A462', '#fff') : '') +
    chip('con-stock',   '✅', conStock,    'Con stock',    '#059669') +
    (sinStock > 0 ? chip('sin-stock', '🚫', sinStock, 'Sin stock', '#dc2626') : '') +
    (ultimaPieza > 0 ? chip('ultima-pieza','⚡', ultimaPieza, 'Última pieza', '#B45309') : '') +
    (sinPublicar  > 0 ? chip('sin-publicar','🙈', sinPublicar, 'Sin publicar', '#C2410C') : '') +
    (nBorradores > 0 ? chip('borradores', '📝', nBorradores, 'Borradores', '#6B7280', '#fff') : '') +
    (nFlag        > 0 ? chip('revisar',     '🚩', nFlag,       'Por revisar',  '#dc2626') : '') +
    (sinCodigo    > 0 ? chip('sin-codigo',  '🔲', sinCodigo,   'Sin código',   '#4B5563') : '') +
    (sinCateg     > 0 ? chip('sin-categ',   '⚠️', sinCateg,    'Sin categoría','#B45309') : '') +
    (() => {
      if (ROLE !== 'superadmin') return '';
      const nBase64 = products.filter(p => !p.isArchived && !_ib(p) && p.image?.startsWith('data:')).length;
      return nBase64 > 0 ? chip('imagen-base64', '🗄', nBase64, 'Imagen base64', '#7C3AED') : '';
    })() +
    (() => {
      if (!can.publishProduct) return '';
      const sinPrecio = products.filter(p => !_ib(p) && (!p.price || p.price === 0));
      if (!sinPrecio.length) return '';
      const dismissed = sessionStorage.getItem('te_no_price_dismissed') === 'true';
      if (!dismissed) return '';
      return `<button class="stat-chip stat-chip-filter" onclick="showNoPriceAlert()" style="" title="Ver productos sin precio">
        <span class="sc-icon">💲</span>
        <span class="sc-num">${sinPrecio.length}</span>
        <span class="sc-lbl">Sin precio</span>
      </button>`;
    })() +
    (nArchivados > 0 && can.deleteProduct ? `<button class="stat-chip" onclick="toggleArchivedView()" title="Ver productos archivados" style="border-color:var(--muted-light);color:var(--muted)">
      <span class="sc-icon">🗄</span>
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
let _apartadosMap = {}; // { productId: totalUnits }

async function loadApartadosMap() {
  const r = await supabaseApi('sales?type=eq.apartado&select=items,total,paid_amount');
  if (!r.ok || !Array.isArray(r.data)) return;
  const map = {};
  r.data.forEach(sale => {
    // Solo apartados sin liquidar (paid_amount < total)
    if (parseFloat(sale.paid_amount || 0) >= parseFloat(sale.total || 0)) return;
    (sale.items || []).forEach(item => {
      if (item.id) map[item.id] = (map[item.id] || 0) + (item.qty || 1);
    });
  });
  _apartadosMap = map;
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
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const sel = selectedIds.has(p.id);
  const catColor = getCatColor(p.category);

  const priceDisplay = p.price === 0
    ? `<span class="ac-price ac-price-zero" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Sin precio — toca para agregar">Sin precio</span>`
    : p.originalPrice
      ? `<span class="ac-orig">$${p.originalPrice.toLocaleString('es-MX')}</span><span class="ac-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar precio">$${p.price.toLocaleString('es-MX')}</span>`
      : `<span class="ac-price ac-price-tap" onclick="editPriceInlineAdmin(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar precio">$${p.price.toLocaleString('es-MX')}</span>`;
  const priceHTML = priceDisplay;
  const oosTitle  = oos ? 'Agotado — toca para marcar disponible' : 'Disponible — toca para agotar';
  const pubTitle  = p.isPublished === false ? 'Oculto del sitio — toca para publicar' : p.outOfStock ? 'Publicado pero agotado — no aparece en el sitio' : 'Visible en sitio — toca para ocultar';
  const pubEmoji  = p.isPublished === false ? '🙈' : p.outOfStock ? '⚠️' : '🌐';
  const flagData  = _flagItem(p.id);
  const flagDotAC = flagData ? `<span class="flag-dot" title="${flagData.note ? flagData.note : 'Pendiente de revisión'}">🚩</span>` : '';
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
    <img class="ac-img" src="${p.image}" alt="${_esc(p.name)}" draggable="false" loading="lazy"
         onerror="this.onerror=null;this.src='${fallback}'">
    <input type="checkbox" class="ac-check row-check"
           ${sel?'checked':''} onchange="toggleRowSelect(${p.id},this.checked)">
    ${flagDotAC}
    <div class="ac-oos-label"></div>
    <button class="ac-star toggle-featured" onclick="toggleFeatured(${p.id})"
            title="${p.featured?'Quitar destacado':'Destacar'}">
      ${p.featured?'⭐':'☆'}
    </button>
    <div class="ac-actions">
      <button class="action-btn" onclick="event.stopPropagation();openForm(${p.id})" ontouchstart="event.stopPropagation()" title="Editar">${ICON_EDIT}</button>
      <button class="action-btn btn-duplicate" onclick="event.stopPropagation();duplicateProduct(${p.id})" ontouchstart="event.stopPropagation()" title="Duplicar">${ICON_COPY}</button>
      ${can.deleteProduct ? `<button class="action-btn del" onclick="event.stopPropagation();askDelete(${p.id})" ontouchstart="event.stopPropagation()" title="Eliminar">✕</button>` : ''}
    </div>
  </div>
  <div class="ac-body">
    <div class="ac-name" title="${_esc(p.name)}">${_esc(p.name)}</div>
    ${flagData?.note ? `<div class="flag-note-line">🚩 "${_esc(flagData.note)}"</div>` : ''}
    <div class="ac-meta">
      <span class="cat-dot" style="background:${catColor}"></span>
      ${editable
        ? `<span class="cat-label-inline${isSinCat?' cat-label-sin-cat':''}" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Clic para cambiar categoría" style="${isSinCat?'':'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'}">${isSinCat ? 'Sin categoría' : _esc(p.categoryLabel)}</span>`
        : `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;color:var(--muted)">${_esc(p.categoryLabel)}</span>`
      }
      ${_showCreator && ROLE === 'superadmin' && p.createdBy ? `<span class="creator-chip" title="${p.createdBy}">👤 ${_creatorName(p.createdBy)}</span>` : ''}
    </div>
    <div class="ac-price-row">${priceHTML}</div>
    <div class="ac-footer">
      <div style="display:flex;align-items:center;gap:6px">
        ${stockChip(p, editable)}
        ${(p.isApartado || _apartadosMap[p.id]) && p.stock <= 1 ? `<span class="apt-chip" title="${_apartadosMap[p.id] || ''} unidad(es) en apartado">📌 Apartado</span>` : ''}
        <button class="ac-pub-dot" onclick="togglePublished(${p.id})"
                ontouchstart="event.stopPropagation()"
                title="${pubTitle}">
          ${pubEmoji}
        </button>
      </div>
    </div>
  </div>
</div>`;
}

function _kitInfo(p) {
  if (!p.kitItems?.length) return null;
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

function stockChip(p, editable = false) {
  if (p.kitItems?.length) {
    const ki = _kitInfo(p);
    if (ki?.stock === 0) {
      const lbl = ki.blocker ? (ki.blocker.length > 14 ? ki.blocker.slice(0, 13) + '…' : ki.blocker) : '?';
      return `<span class="stock-chip stock-sold" style="cursor:default" title="Falta: ${ki.blocker ?? 'componente agotado'}">🎁 Falta: ${lbl}</span>`;
    }
    const n = ki?.stock ?? 0;
    return `<span class="stock-chip stock-ok" style="cursor:default">🎁 ${n} kit${n !== 1 ? 's' : ''}</span>`;
  }
  const cls = p.stock === 0 ? 'sold' : p.stock === 1 ? 'one' : 'ok';
  if (editable) {
    return `<span class="stock-chip stock-${cls}" onclick="editStockInline(event,${p.id},this)" ontouchstart="event.stopPropagation()" title="Clic para editar stock" style="cursor:pointer">${p.stock}</span>`;
  }
  return `<span class="stock-chip stock-${cls}" style="cursor:default">${p.stock}</span>`;
}

async function editStockInline(e, id, chipEl) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;

  const chip = chipEl || e.currentTarget || e.target.closest('.stock-chip,.qv-chip') || e.target;
  const mobile = isMobile();

  // Stepper táctil — reemplaza el chip con [−] N [+] + botón Guardar
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'numeric'; input.pattern = '[0-9]*';
  input.autocomplete = 'off'; input.value = p.stock;
  input.style.cssText = 'width:52px;padding:4px 6px;border:2px solid var(--gold);border-radius:8px;font-size:1.1rem;font-weight:700;text-align:center;outline:none;font-family:inherit;color:var(--charcoal)';

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button'; btnMinus.textContent = '−';
  btnMinus.style.cssText = 'width:36px;height:36px;border-radius:50%;border:2px solid var(--border);background:#fff;font-size:1.2rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-shrink:0';
  btnMinus.ontouchend = e2 => { e2.preventDefault(); input.value = Math.max(0, parseInt(input.value)||0) - 1; };
  btnMinus.onclick    = () => { input.value = Math.max(0, parseInt(input.value)||0) - 1; };

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button'; btnPlus.textContent = '+';
  btnPlus.style.cssText = btnMinus.style.cssText;
  btnPlus.ontouchend = e2 => { e2.preventDefault(); input.value = (parseInt(input.value)||0) + 1; };
  btnPlus.onclick    = () => { input.value = (parseInt(input.value)||0) + 1; };

  const btnSave = document.createElement('button');
  btnSave.type = 'button'; btnSave.textContent = '✓';
  btnSave.style.cssText = 'background:var(--gold);border:none;color:#fff;border-radius:50%;width:36px;height:36px;font-size:1rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit;flex-shrink:0;display:flex;align-items:center;justify-content:center';
  btnSave.ontouchend = e2 => { e2.preventDefault(); save(); };
  btnSave.onclick    = () => save();

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button'; btnCancel.textContent = '✕';
  btnCancel.style.cssText = 'background:none;border:1.5px solid var(--border);color:var(--muted);border-radius:50%;width:32px;height:32px;font-size:.85rem;cursor:pointer;touch-action:manipulation;font-family:inherit;flex-shrink:0;display:flex;align-items:center;justify-content:center';
  btnCancel.ontouchend = e2 => { e2.preventDefault(); saved = true; renderTable(); _qvRefresh(id); };
  btnCancel.onclick    = () => { saved = true; renderTable(); _qvRefresh(id); };

  const container = document.createElement('span');
  container.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:2px 0';
  container.append(btnMinus, input, btnPlus, btnSave, btnCancel);
  chip.replaceWith(container);

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    const newStock = Math.max(0, parseInt(input.value) || 0);
    if (newStock === p.stock) { renderTable(); _qvRefresh(id); _srpRefresh(id); return; }

    const patch = { stock: newStock };
    if (newStock > 0 && p.outOfStock)  patch.out_of_stock = false;
    if (newStock === 0 && !p.outOfStock) patch.out_of_stock = true;
    if (newStock === 0) patch.is_published = false;

    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    });
    if (result.ok) {
      p.stock = newStock;
      if (patch.out_of_stock !== undefined) p.outOfStock = patch.out_of_stock;
      if (newStock === 0) p.isPublished = false;
      renderStats();
      toast(`Stock → ${newStock}${patch.out_of_stock !== undefined ? (patch.out_of_stock ? ' · Marcado agotado · Oculto del sitio' : ' · Marcado disponible') : ''}`);
    } else {
      toast('Error al actualizar stock', 'error');
    }
    renderTable(); _qvRefresh(id); _srpRefresh(id);
  };

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { saved = true; renderTable(); _qvRefresh(id); }
  });

  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
    // Click fuera del stepper → cancelar si sin cambios, guardar si hay cambios
    setTimeout(() => {
      if (saved) return;
      const dismiss = (ev) => {
        if (saved || container.contains(ev.target)) return;
        document.removeEventListener('click', dismiss, true);
        document.removeEventListener('touchend', dismiss, true);
        if (!saved) {
          if (parseInt(input.value) === p.stock) { saved = true; renderTable(); _qvRefresh(id); }
          else save();
        }
      };
      document.addEventListener('click', dismiss, true);
      document.addEventListener('touchend', dismiss, true);
    }, 300);
  }, 50);
}

let _inlineEditActive = false;

async function editPriceInlineAdmin(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!can.editProduct) { toast('Sin permiso para editar precios', 'error'); return; }
  _inlineEditActive = true;

  const trigger = e.currentTarget;
  const mobile = isMobile();

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.pattern = '[0-9]*';
  input.autocomplete = 'off';
  input.value = p.price || '';
  input.placeholder = '0';
  input.style.cssText = 'width:80px;padding:3px 7px;border:2px solid var(--gold);border-radius:6px;font-size:16px;outline:none;font-family:inherit;font-weight:700;text-align:center;color:var(--charcoal)';

  let container;
  if (mobile) {
    container = document.createElement('span');
    container.style.cssText = 'display:inline-flex;align-items:center;gap:4px;vertical-align:middle';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = '✓';
    btn.style.cssText = 'background:var(--gold);border:none;color:#fff;border-radius:6px;padding:4px 7px;font-size:.82rem;cursor:pointer;font-family:inherit;line-height:1;touch-action:manipulation';
    btn.ontouchend = ev => { ev.preventDefault(); save(); };
    btn.onclick = () => save();
    container.appendChild(input); container.appendChild(btn);
    trigger.replaceWith(container);
  } else {
    trigger.replaceWith(input);
  }

  let saved = false;
  const save = async () => {
    if (saved) return;
    saved = true;
    _inlineEditActive = false;
    const newPrice = parseFloat(input.value);
    if (isNaN(newPrice) || newPrice < 0) { renderTable(); _qvRefresh(id); return; }
    if (newPrice === p.price) { renderTable(); _qvRefresh(id); return; }

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

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') { saved = true; _inlineEditActive = false; renderTable(); _qvRefresh(id); }
  });
  setTimeout(() => {
    input.focus();
    if (!mobile) input.select();
    if (!mobile) setTimeout(() => { if (!saved) input.addEventListener('blur', save); }, 500);
  }, 50);
}

// getCatColor() reemplaza CAT_COLORS — usa el array dinámico de categorías

function publishedToggle(p) {
  if (p.isPublished === false) {
    return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-hidden" title="Tap para publicar en sitio web">🙈 Oculto</button>`;
  }
  if (p.outOfStock) {
    return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-agotado" title="Publicado pero agotado — no aparece en el sitio web">⚠️ Agotado</button>`;
  }
  return `<button onclick="togglePublished(${p.id})" ontouchstart="event.stopPropagation()" class="pub-toggle pub-visible" title="Tap para ocultar del sitio web">🌐 Web</button>`;
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
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const featStar   = `<span onclick="toggleFeatured(${p.id})" class="toggle-featured" title="${p.featured ? 'Quitar destacado' : 'Destacar'}">${p.featured ? '⭐' : '☆'}</span>`;
  const catColor   = getCatColor(p.category);
  const catDot     = `<span class="cat-dot" style="background:${catColor}"></span>`;
  const flagDataDR = _flagItem(p.id);
  const isSinCatDR = p.category === 'por_revisar';
  const flagDotRow = flagDataDR ? `<span class="flag-dot-row" title="${flagDataDR.note || 'Pendiente de revisión'}">🚩</span>` : '';
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
      <img class="prod-thumb" src="${p.image}" alt="${_esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'" onclick="event.stopPropagation();openQV(${p.id})" style="cursor:pointer${oos ? ';opacity:.5;filter:grayscale(.5)' : ''}" title="Ver detalle rápido">
      <div style="min-width:0;flex:1">
        <div class="prod-name" title="${_esc(p.name)}">${_esc(p.name)}</div>
        ${flagDataDR?.note ? `<div class="flag-note-line">🚩 "${_esc(flagDataDR.note)}"</div>` : ''}
        <div class="prod-meta">
          ${catDot}
          <span class="prod-meta-text"><span class="cat-label-inline${isSinCatDR ? ' cat-label-sin-cat' : ''}" onclick="editCategoryInline(event,${p.id})" title="Clic para cambiar categoría">${isSinCatDR ? 'Sin categoría' : _esc(p.categoryLabel)}</span> · #${p.id}${_showCreator && ROLE === 'superadmin' && p.createdBy ? ` · <span class="creator-chip" title="${p.createdBy}">👤 ${_creatorName(p.createdBy)}</span>` : ''}</span>
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
      <button onclick="toggleOutOfStock(${p.id})" class="oos-cell ${oos ? 'soldout' : 'available'}">
        ${oos ? 'Agotado' : 'Disponible'}
      </button>
      ${stockChip(p, true)}
    </div>
  </td>
  <td class="col-actions">
    <div class="actions">
      <button class="action-btn" onclick="event.stopPropagation();openForm(${p.id})" ontouchstart="event.stopPropagation()" title="Editar">${ICON_EDIT}</button>
      <button class="action-btn" onclick="event.stopPropagation();duplicateProduct(${p.id})" ontouchstart="event.stopPropagation()" title="Duplicar">${ICON_COPY}</button>
      ${can.deleteProduct ? `<button class="action-btn del" onclick="event.stopPropagation();askDelete(${p.id})" ontouchstart="event.stopPropagation()" title="Eliminar">✕</button>` : ''}
    </div>
  </td>
</tr>`;
}

function mobileCard(p) {
  const fallback = DEFAULT_IMG;
  const sel = selectedIds.has(p.id);
  const oos = p.kitItems?.length ? false : (p.outOfStock || p.stock === 0);
  const catColor = getCatColor(p.category);
  const pubTitle  = p.isPublished === false ? 'Oculto del sitio — toca para publicar' : p.outOfStock ? 'Publicado pero agotado — no aparece en el sitio' : 'Visible en sitio — toca para ocultar';
  const pubEmoji  = p.isPublished === false ? '🙈' : p.outOfStock ? '⚠️' : '🌐';
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
          <img class="mpc-img" src="${p.image}" alt="${_esc(p.name)}" loading="lazy"
               onerror="this.onerror=null;this.src='${fallback}'"
               ${oos ? 'style="opacity:.5;filter:grayscale(.4)"' : ''}>
          <input type="checkbox" class="row-check mpc-check-over"
                 ${sel ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
          <button class="mpc-star${p.featured ? ' feat-active' : ''}"
                  onclick="event.stopPropagation();toggleFeatured(${p.id})"
                  ontouchstart="event.stopPropagation()"
                  title="${p.featured ? 'Quitar destacado' : 'Destacar'}">
            ${p.featured ? '⭐' : '☆'}
          </button>
        </div>
        <div class="mpc-info">
          <div class="mpc-name">${_esc(p.name)}${flagDataMC ? ' <span class="flag-dot-row" title="'+_esc(flagDataMC.note||'Pendiente de revisión')+'">🚩</span>' : ''}</div>
          ${flagDataMC?.note ? `<div class="flag-note-line">🚩 "${_esc(flagDataMC.note)}"</div>` : ''}
          <div class="mpc-cat-tag">
            <span class="cat-dot" style="background:${catColor}"></span>
            <span class="${isSinCatMC ? 'cat-label-sin-cat' : ''}" style="font-size:.72rem;color:${isSinCatMC ? '' : 'var(--muted)'};font-weight:400">${isSinCatMC ? 'Sin categoría' : _esc(p.categoryLabel)}</span>
            ${_showCreator && ROLE === 'superadmin' && p.createdBy ? `<span class="creator-chip" title="${p.createdBy}">👤 ${_creatorName(p.createdBy)}</span>` : ''}
          </div>
          <div class="mpc-price-row">
            ${priceHTML}${stockInfo}
            ${(p.isApartado || _apartadosMap[p.id]) && p.stock <= 1 ? `<span class="apt-chip">📌 Apartado</span>` : ''}
            <button class="ac-pub-dot"
                    onclick="togglePublished(${p.id})"
                    ontouchstart="event.stopPropagation()"
                    title="${pubTitle}">
              ${pubEmoji}
            </button>
          </div>
        </div>
        <div class="mpc-top-actions">
          <button class="mpc-icon-btn" onclick="openForm(${p.id})" title="Editar">${ICON_EDIT}</button>
          <button class="mpc-icon-btn" onclick="duplicateProduct(${p.id})" title="Duplicar">${ICON_COPY}</button>
          ${can.deleteProduct ? `<button class="mpc-icon-btn del-btn" onclick="askDelete(${p.id})" title="Eliminar">✕</button>` : ''}
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
    countEl.style.display = products.length === 0 ? 'none' : '';
    if (products.length > 0) {
      countEl.textContent = filtered.length === products.length
        ? `${products.length} producto${products.length !== 1 ? 's' : ''}`
        : `${filtered.length} de ${products.length}`;
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
      <div class="es-icon">${isFlagOnly ? '🚩' : isFiltered ? '🔍' : '📦'}</div>
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
      if (tbody) tbody.innerHTML = `<tr><td colspan="5">${emptyHTML}</td></tr>`;
    }
    updateBulkBar();
    if (!document.getElementById('qv-overlay')?.classList.contains('open')) _updateActiveFiltersBar();
    return;
  }

  if (!document.getElementById('qv-overlay')?.classList.contains('open')) _updateActiveFiltersBar();

  const visible  = filtered.slice(0, _adminPage * ADMIN_PAGE_SIZE);
  const hasMore  = visible.length < filtered.length;
  const moreHTML = hasMore
    ? `<div id="load-more-wrap" style="padding:16px;text-align:center">
        <button class="btn btn-outline btn-sm" onclick="_loadMoreAdmin()">
          Ver ${Math.min(ADMIN_PAGE_SIZE, filtered.length - visible.length)} más de ${filtered.length - visible.length}
        </button>
       </div>`
    : '';

  if (useCards && cardGrid) {
    cardGrid.innerHTML = visible.map(p => adminCard(p, true)).join('') + moreHTML;
    updateBulkBar();
    return;
  }

  // Vista lista: mobile → mpc cards, desktop → tabla
  const tbody = document.getElementById('products-table');
  if (tbody) tbody.innerHTML = visible.map(p => mobile ? mobileCard(p) : desktopRow(p)).join('') +
    (hasMore ? `<tr><td colspan="5">${moreHTML}</td></tr>` : '');

  updateSelectAllCheckbox();
  if (!mobile) initDragDrop();
}

function _loadMoreAdmin() {
  const firstNewIndex = _adminPage * ADMIN_PAGE_SIZE;
  _adminPage++;
  renderTable();

  const useCards = localStorage.getItem('te_admin_view') !== 'list';
  const cardGrid = document.getElementById('card-grid');
  if (useCards && cardGrid) {
    cardGrid.querySelectorAll('.admin-card')[firstNewIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    const tbody = document.getElementById('products-table');
    tbody?.querySelectorAll('tr')[firstNewIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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

/* ── TOGGLE OUT OF STOCK — targeted PATCH ── */
async function toggleOutOfStock(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = !p.outOfStock;
  const btn = document.querySelector(`tr[data-id="${id}"] .oos-cell`);
  if (btn) btn.style.opacity = '0.35';

  // Al marcar disponible con stock=0 → asignar 1 unidad automáticamente
  const patch = { out_of_stock: newVal };
  if (!newVal && p.stock === 0) patch.stock = 1;

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar estado de stock', 'error');
    return;
  }
  p.outOfStock = newVal;
  if (patch.stock !== undefined) p.stock = patch.stock;
  renderTable();
  renderStats();
  const msg = newVal ? 'Marcado como agotado'
    : patch.stock ? 'Disponible · stock ajustado a 1'
    : 'Marcado como disponible';
  toast(msg);
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
