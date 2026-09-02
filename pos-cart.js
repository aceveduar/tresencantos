/* ── CART ── */
/* ── ÍCONOS INLINE PARA EL CORTE DE CAJA ── */
const _ico = (p, px = 13, sw = 1.75) => `<svg style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:${sw};stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">${p}</svg>`;
const _icoBag      = () => _ico('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>');
const _icoCheck    = () => _ico('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>');
const _icoBookmark = () => _ico('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>');
const _icoCash     = () => _ico('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>');
const _icoPhone    = () => _ico('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>');
const _icoReceipt  = () => _ico('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
const _icoUndo     = () => _ico('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>');
const _icoWarn     = () => _ico('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
const _icoUsers    = () => _ico('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
const _icoUser     = () => _ico('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
const _icoHelp     = () => _ico('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
/* ── FRECUENTES ── */
let _topFromSales = [];

async function loadTopProductsFromSales() {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const [directResult, apartadoResult] = await Promise.all([
    _posFetchAll(`sales?origin_type=eq.venta&status=eq.liquidado&created_at=gte.${encodeURIComponent(desde)}&select=id,items&is_test=eq.false&order=created_at.asc,id.asc`),
    _posFetchAll(`sales?origin_type=eq.apartado&status=eq.liquidado&liquidated_at=gte.${encodeURIComponent(desde)}&select=id,items&is_test=eq.false&order=liquidated_at.asc,id.asc`)
  ]);
  if (!directResult.ok || !apartadoResult.ok) return;
  const rows = [...(directResult.data || []), ...(apartadoResult.data || [])];
  const counts = {};
  for (const sale of rows) {
    const seen = new Set();
    for (const item of (Array.isArray(sale.items) ? sale.items : [])) {
      if (item.id && !seen.has(item.id)) { seen.add(item.id); counts[item.id] = (counts[item.id] || 0) + 1; }
    }
  }
  _topFromSales = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => parseInt(id));
}

function renderFrecuentes(hide) {
  const el = document.getElementById('pos-frecuentes');
  if (!el) return;
  if (hide) { el.classList.remove('visible'); return; }
  const top = _topFromSales
    .map(id => products.find(p => p.id === id))
    // getKitStock() ya devuelve p.stock tal cual para no-kits -- un kit
    // frecuente con stock real en sus componentes nunca aparecía aquí
    // porque p.stock de un kit siempre es 0 en BD por diseño.
    .filter(p => p && !p.outOfStock && getKitStock(p) > 0);
  if (top.length < 3) { el.classList.remove('visible'); return; }
  el.innerHTML = `<span class="pos-freq-label">Freq.</span>` +
    top.map(p => `
<div class="pos-freq-card" onclick="addToCart(${p.id})" title="${_esc(p.name)}">
  <div class="pos-freq-img-wrap">
    <img class="pos-freq-img" src="${_driveSz(p.image,80)}" alt="${_esc(p.name)}" onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'">
    <div class="pos-freq-add"><span class="pos-freq-add-icon">+</span></div>
  </div>
  <span class="pos-freq-name">${_esc(p.name)}</span>
  <span class="pos-freq-price">$${p.price.toLocaleString('es-MX')}</span>
</div>`).join('');
  el.classList.add('visible');
}

function addToCart(id, btn, e) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const effStock = getKitStock(p);
  const isKitP = Array.isArray(p.kitItems);
  if (effStock === 0 || (!isKitP && p.outOfStock)) return;
  TE?.track('pos_add_cart', { id: p.id, name: p.name });

  const existing = cart.find(x => x.product.id === id);
  if (existing) {
    if (existing.qty >= effStock) {
      _cartStockFeedback(btn, e);
      setTimeout(() => _showRestockPrompt(id), 350);
      return;
    }
    existing.qty++;
  } else {
    cart.push({ product: p, qty: 1 });
  }
  renderCart();
  _cartAddFeedback(btn, e);
}

function _cartAddFeedback(btn, e) {
  // 1. Botón → ✓ por 600ms
  if (btn) {
    btn.textContent = '✓';
    btn.classList.add('btn-added');
    clearTimeout(btn._rt);
    btn._rt = setTimeout(() => { btn.textContent = '+'; btn.classList.remove('btn-added'); }, 600);
  }
  // 2. Badge del tab carrito → pop
  const badge = document.getElementById('tab-cart-badge');
  if (badge) {
    badge.classList.remove('badge-pop');
    requestAnimationFrame(() => { badge.offsetWidth; badge.classList.add('badge-pop'); });
  }
  // 3. Pill flotante que sube y desaparece
  const x = btn ? btn.getBoundingClientRect().left + btn.getBoundingClientRect().width / 2
                : (e?.clientX ?? window.innerWidth / 2);
  const y = btn ? btn.getBoundingClientRect().top
                : (e?.clientY ?? window.innerHeight / 2);
  const pill = document.createElement('div');
  pill.className = 'cart-pill';
  pill.textContent = '+ al carrito';
  pill.style.left = (x - 52) + 'px';
  pill.style.top  = (y - 8)  + 'px';
  document.body.appendChild(pill);
  setTimeout(() => pill.remove(), 700);
}

function _cartStockFeedback(btn, e) {
  const el = btn || (() => {
    if (!e) return null;
    const el2 = document.elementFromPoint(e.clientX, e.clientY);
    return el2?.closest('.pos-prod-add, .pos-card-add-icon')
        || el2?.closest('.pos-prod, .pos-card')?.querySelector('.pos-prod-add, .pos-card-add-icon');
  })();
  if (el) {
    el.classList.remove('btn-added', 'btn-stock');
    el.offsetWidth;
    el.classList.add('btn-stock');
    clearTimeout(el._rt);
    el._rt = setTimeout(() => el.classList.remove('btn-stock'), 500);
  }
}

/* ── RESTOCK PROMPT ── */
let _restockProductId = null;
let _restockQty = 1;
let _showRestock = true;

function _showRestockPrompt(id) {
  if (!_showRestock) return;
  const p = products.find(x => x.id === id);
  if (!p) return;
  _restockProductId = id;
  _restockQty = 1;
  document.getElementById('restock-prod-name').textContent = p.name;
  document.getElementById('restock-qty-val').textContent = 1;
  const btn = document.getElementById('restock-confirm-btn');
  btn.disabled = false;
  btn.textContent = 'Reabastecer y agregar al carrito →';
  document.getElementById('restock-prompt').style.display = 'flex';
}

function _restockChangeQty(delta) {
  _restockQty = Math.max(1, Math.min(99, _restockQty + delta));
  document.getElementById('restock-qty-val').textContent = _restockQty;
}

function _closeRestockPrompt() {
  document.getElementById('restock-prompt').style.display = 'none';
}

async function _confirmRestock() {
  const id = _restockProductId;
  if (!id) return;
  const p = products.find(x => x.id === id);
  if (!p) return;
  const btn = document.getElementById('restock-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  const newStock = (p.stock || 0) + _restockQty;
  const res = await api(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: newStock, out_of_stock: false })
  });
  if (res.ok) {
    const prevStock = p.stock;
    p.stock = newStock;
    p.outOfStock = false;
    _closeRestockPrompt();
    searchProducts(document.getElementById('pos-search')?.value || '');
    addToCart(id);
    logActivity('producto_editado', `Reabasteció "${p.name}" desde Caja: ${prevStock} → ${newStock}`, { id, name: p.name, prevStock, newStock, source: 'caja_restock' });
    toast(`📦 +${_restockQty} en stock — agregado al carrito`, '');
  } else {
    toast('Error al reabastecer', 'error');
    btn.disabled = false;
    btn.textContent = 'Reabastecer y agregar al carrito →';
  }
}

function removeFromCart(id) {
  cart = cart.filter(x => x.product.id !== id);
  renderCart();
}

async function editPriceInline(pid) {
  if (!canOverridePrice()) {
    const granted = await requestOverride('canOverridePrice', 'Modificar precio al cobrar');
    if (!granted) return;
  }
  const item = cart.find(x => x.product.id === pid);
  if (!item) return;
  const priceEl = document.querySelector(`.cart-item[data-pid="${pid}"] .ci-price`);
  if (!priceEl) return;

  const current = item.customPrice ?? item.product.price;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.value = current;
  input.className = 'ci-price-input';
  priceEl.replaceWith(input);
  input.select();
  input.focus();

  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const val = parseFloat(input.value);
    if (!isNaN(val) && val >= 0) {
      item.customPrice = (val === item.product.price) ? undefined : val;
    }
    renderCart();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { saved = true; renderCart(); }
  });
  input.addEventListener('blur', save);
}

function changeQty(id, delta) {
  const item = cart.find(x => x.product.id === id);
  if (!item) return;
  const maxStock = getKitStock(item.product);
  item.qty = Math.max(1, Math.min(item.qty + delta, maxStock));
  renderCart();
}

function clearCart() {
  if (!cart.length) return;
  if (!confirm('¿Vaciar el carrito?')) return;
  cart = [];
  renderCart();
}

function getTotal() {
  return cart.reduce((s, x) => s + (x.customPrice ?? x.product.price) * x.qty, 0);
}

/* ── TAB NAVIGATION (mobile) ── */
let _currentTab = 'catalog';
const isTabMode = () => window.innerWidth <= 640;

function switchPosTab(tab) {
  _currentTab = tab;
  if (!isTabMode()) return;
  const left  = document.getElementById('pos-left');
  const right = document.getElementById('pos-right');
  if (!left || !right) return;

  const isCatalog = tab === 'catalog';
  const isCart    = tab === 'cart';

  left.classList.toggle('tab-active',  isCatalog);
  left.classList.toggle('tab-hidden',  !isCatalog);
  right.classList.toggle('tab-active', isCart);
  right.classList.toggle('tab-hidden', !isCart);
  document.getElementById('tab-catalog')?.classList.toggle('active', isCatalog);
  document.getElementById('tab-cart')?.classList.toggle('active',    isCart);
  if (!isCatalog) updateChange();
  _updateMiniCartBar();
}

/* ── BARRA MINI DE TOTAL (catálogo, mobile/tablet) ── */
function _updateMiniCartBar() {
  const bar = document.getElementById('pos-mini-cart-bar');
  if (!bar) return;
  const totalItems = cart.reduce((s, x) => s + x.qty, 0);
  const show = isTabMode() && _currentTab === 'catalog' && totalItems > 0;
  bar.classList.toggle('visible', show);
  if (show) {
    document.getElementById('pmc-count').textContent = totalItems;
    document.getElementById('pmc-total').textContent = `$${getDiscountedTotal().toLocaleString('es-MX')}`;
  }
}

/* ── CART TOPBAR PREVIEW ── */
function toggleCartPreview() {
  // En mobile las pestañas reemplazan el dropdown
  if (isTabMode()) { switchPosTab(_currentTab === 'cart' ? 'catalog' : 'cart'); return; }
  const preview = document.getElementById('cart-preview');
  const backdrop = document.getElementById('cart-preview-backdrop');
  const isOpen = preview.classList.contains('open');
  if (isOpen) { closeCartPreview(); return; }
  renderCartPreview();
  preview.classList.add('open');
  backdrop.classList.add('open');
}

function closeCartPreview() {
  document.getElementById('cart-preview')?.classList.remove('open');
  document.getElementById('cart-preview-backdrop')?.classList.remove('open');
}

function renderCartPreview() {
  const el = document.getElementById('cp-items');
  const totalEl = document.getElementById('cp-total');
  const cobrarBtn = document.getElementById('cp-cobrar-btn');
  if (!el) return;
  if (!cart.length) {
    el.innerHTML = '<div class="cp-empty">El carrito está vacío</div>';
    if (totalEl) totalEl.textContent = '$0';
    if (cobrarBtn) cobrarBtn.disabled = true;
    return;
  }
  el.innerHTML = cart.map(({ product: p, qty, customPrice }) => {
    const effPrice = customPrice ?? p.price;
    return `
<div class="cp-item">
  <img class="cp-item-img" src="${_driveSz(p.image,80)}" alt="${_esc(p.name)}" onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'">
  <span class="cp-item-name" title="${_esc(p.name)}">${_esc(p.name)}</span>
  <span class="cp-item-qty">×${qty}</span>
  <span class="cp-item-sub">$${(effPrice*qty).toLocaleString('es-MX')}</span>
</div>`;
  }).join('');
  const total = getDiscountedTotal();
  if (totalEl) totalEl.textContent = `$${total.toLocaleString('es-MX')}`;
  if (cobrarBtn) cobrarBtn.disabled = false;
}

function syncCartTopbar() {
  const totalItems = cart.reduce((s, x) => s + x.qty, 0);
  // Badge topbar (desktop)
  const badge = document.getElementById('cart-topbar-badge');
  const btn   = document.getElementById('cart-topbar-btn');
  if (badge) { badge.textContent = totalItems > 0 ? totalItems : ''; badge.style.display = totalItems > 0 ? 'flex' : 'none'; }
  if (btn)   btn.classList.toggle('has-items', totalItems > 0);
  // Badge pestaña (mobile)
  const tabBadge = document.getElementById('tab-cart-badge');
  if (tabBadge) { tabBadge.textContent = totalItems > 0 ? totalItems : ''; tabBadge.style.display = totalItems > 0 ? 'flex' : 'none'; }
  // Preview abierto → actualizar
  if (document.getElementById('cart-preview')?.classList.contains('open')) renderCartPreview();
}

function renderCart() {
  const el = document.getElementById('cart-items');
  const countEl = document.getElementById('cart-count');
  const totalEl = document.getElementById('pos-total');
  const cobrarBtn = document.getElementById('cobrar-btn');
  const total = getTotal();
  const totalItems = cart.reduce((s, x) => s + x.qty, 0);

  countEl.textContent = totalItems > 0 ? `(${totalItems})` : '';
  totalEl.textContent = `$${total.toLocaleString('es-MX')}`;
  cobrarBtn.disabled = cart.length === 0;
  // Descuento/pago/efectivo/nota/apartado/cliente no sirven de nada sin
  // productos en el carrito -- se ocultan en vez de mostrar un formulario
  // de cobro que no se puede usar todavía.
  const fieldsWrap = document.getElementById('checkout-fields-wrap');
  if (fieldsWrap) fieldsWrap.style.display = cart.length ? '' : 'none';
  syncCartTopbar();
  _updateMiniCartBar();
  updateChange();
  if (document.getElementById('pos-is-apartado')?.checked) updateAnticipoInfo();

  if (!cart.length) {
    el.innerHTML = '<div class="cart-empty"><div class="em"><svg style="width:26px;height:26px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>El carrito está vacío</div>';
    _saveCart();
    return;
  }

  el.innerHTML = cart.map(({ product: p, qty, customPrice }) => {
    const effPrice = customPrice ?? p.price;
    const isCustom = customPrice != null && customPrice !== p.price;
    const priceLabel = isCustom
      ? `<span style="text-decoration:line-through;opacity:.45;font-size:.65rem;margin-right:3px">$${p.price.toLocaleString('es-MX')}</span>$${effPrice.toLocaleString('es-MX')}`
      : `$${effPrice.toLocaleString('es-MX')}`;
    const kitSub = Array.isArray(p.kitItems) && p.kitItems.length
      ? `<div style="font-size:.7rem;color:#9B8B78;margin-top:1px">${_giftIconSvg(13)} ${_esc(p.kitItems.map(c=>`${c.qty>1?c.qty+'× ':''}${c.name}`).join(', '))}</div>`
      : '';
    return `
<div class="cart-item" data-pid="${p.id}">
  <img class="ci-img" src="${_driveSz(p.image,80)}" alt="${_esc(p.name)}" onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'" onclick="event.stopPropagation();openLightbox(this)" data-name="${_esc(p.name)}" data-price="${effPrice}" data-qty="${qty}" style="cursor:zoom-in">
  <div class="ci-info">
    <div class="ci-name">${_esc(p.name)}</div>
    ${kitSub}
    <span class="ci-price${isCustom?' ci-price-custom':''}" onclick="editPriceInline(${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar precio" style="cursor:pointer">${priceLabel} c/u</span>
    <div class="ci-row2">
      <div class="ci-qty">
        <button class="${qty === 1 ? 'ci-qty-del' : ''}" onclick="${qty === 1 ? `removeFromCart(${p.id})` : `changeQty(${p.id}, -1)`}" title="${qty === 1 ? 'Quitar' : 'Reducir'}">
          ${qty === 1 ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>` : '−'}
        </button>
        <span class="qty-num">${qty}</span>
        <button onclick="changeQty(${p.id}, +1)">+</button>
      </div>
    </div>
  </div>
  <div class="ci-right">
    <div class="ci-subtotal">$${(effPrice * qty).toLocaleString('es-MX')}</div>
  </div>
</div>`;
  }).join('');
  applySwipeRemove();
  _saveCart();
}

// Escalera de montos "redondos": denominaciones reales de billete en México
// (20/50/100/200/500/1000) y, arriba de $1,000, múltiplos de $500 -- no
// existe un billete único más grande, pero un cliente sí paga con varios
// de $500/$1,000. Sin esto, redondear con un solo paso fijo (ej. $100) da
// saltos absurdos para un total chico ($40/$60 en vez de $20/$50) o para
// uno grande (saltar de $3,304 directo a $5,000 sin pasar por $3,500/$4,000).
const _CASH_LADDER = (() => {
  const arr = [20, 50, 100, 200, 500, 1000];
  for (let n = 1500; n <= 100000; n += 500) arr.push(n);
  return arr;
})();

// Montos "rápidos" de efectivo -- antes fijos en $100/$200/$500 sin importar
// el total, así que en una venta de $3,304 ninguno servía (todos por debajo
// de lo que hay que cobrar) y en una de $10 sobraban ($500/$1000 no tienen
// nada que ver con un producto de diez pesos). Ahora se toman los siguientes
// 3 peldaños de la escalera que sean ≥ el total, para que representen lo que
// un cliente de verdad entregaría sea cual sea el tamaño de la venta.
function _posQuickCashAmounts(total) {
  const t = Math.max(total, 0);
  let idx = _CASH_LADDER.findIndex(v => v >= t);
  if (idx === -1) idx = Math.max(0, _CASH_LADDER.length - 3);
  return _CASH_LADDER.slice(idx, idx + 3);
}

function _updateQuickCashButtons() {
  const total = typeof getDiscountedTotal === 'function' ? getDiscountedTotal() : getTotal();
  const amounts = _posQuickCashAmounts(total);
  ['quick-cash-1', 'quick-cash-2', 'quick-cash-3'].forEach((id, i) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const amount = amounts[i];
    if (amount == null) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.textContent = `$${amount.toLocaleString('es-MX')}`;
    btn.onclick = () => setCash(amount);
  });
}

function setCash(amount) {
  const total = getTotal();
  const val = amount === total ? total : amount;
  document.getElementById('pos-cash').value = val;
  updateChange();
  // Highlight el botón seleccionado
  document.querySelectorAll('.cash-quick button').forEach(b => b.classList.remove('active-cash'));
  event?.currentTarget?.classList.add('active-cash');
}

/* ── CORTE DE CAJA ── */
let _corteData = null;

let _corteMode = 'mio'; // 'mio' | 'general'

function setCorteMode(mode) {
  if (_corteMode === mode) return;
  _corteMode = mode;
  document.getElementById('corte-mode-mio')?.classList.toggle('active', mode === 'mio');
  document.getElementById('corte-mode-general')?.classList.toggle('active', mode === 'general');
  const personal = document.getElementById('corte-personal-sections');
  if (personal) personal.style.display = mode === 'general' ? 'none' : '';
  loadCorte();
}

async function openCorte() {
  document.getElementById('corte-offcanvas').classList.add('open');
  document.getElementById('corte-backdrop').style.display = 'block';
  document.body.style.overflow = 'hidden';
  // Siempre abre en "Mi turno" — el toggle "General" es una consulta aparte,
  // no debe quedar pegado de una vez anterior de este mismo dispositivo.
  _corteMode = 'mio';
  document.getElementById('corte-mode-mio')?.classList.add('active');
  document.getElementById('corte-mode-general')?.classList.remove('active');
  document.getElementById('corte-personal-sections').style.display = '';
  await loadCorte();
  renderGastos();
  _initCierreInputs();
}

function closeCorte() {
  document.getElementById('corte-offcanvas').classList.remove('open');
  document.getElementById('corte-backdrop').style.display = 'none';
  document.body.style.overflow = '';
}

async function loadCorte() {
  const content = document.getElementById('corte-content');
  const periodoEl = document.getElementById('corte-periodo');
  const shareButton = document.getElementById('corte-wa-btn');
  _corteData = null;
  if (shareButton) shareButton.disabled = true;
  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Calculando...</div>';

  const TZ = 'America/Mexico_City';
  const now = new Date();
  const ahoraMX = new Intl.DateTimeFormat('es-MX', { timeZone:TZ, dateStyle:'full', timeStyle:'short' }).format(now);
  const shift = _posEnsureCurrentShift();
  if (!shift.actorEmail) {
    content.innerHTML = '<div style="color:var(--red);text-align:center">No se pudo identificar al usuario de esta caja. Vuelve a iniciar sesión.</div>';
    return;
  }
  const isGeneral = _corteMode === 'general';
  const hoyMX = _posMexicoDayKey(now);
  const hoyInicio = new Date(`${hoyMX}T00:00:00-06:00`);
  const rawShiftStart = new Date(shift.start || '');
  const shiftStart = !Number.isNaN(rawShiftStart.getTime()) && rawShiftStart >= hoyInicio && rawShiftStart <= now
    ? rawShiftStart : hoyInicio;
  // General suma la tienda completa desde medianoche — otras cajeras pueden
  // haber empezado su turno antes que el actual, no tendría sentido acotar
  // al horario de quien está viendo la pantalla.
  const rangeStart = isGeneral ? hoyInicio : shiftStart;
  const from = encodeURIComponent(rangeStart.toISOString());
  const to   = encodeURIComponent(now.toISOString());
  const inicioMX = new Intl.DateTimeFormat('es-MX', { timeZone:TZ, hour:'2-digit', minute:'2-digit' }).format(rangeStart);
  const actorLabel = shift.actorEmail.split('@')[0];
  periodoEl.textContent = isGeneral
    ? `General — hoy desde las ${inicioMX}, todas las cajeras`
    : `Turno de ${actorLabel} desde ${inicioMX}`;

  const [paymentsResult, createdResult] = await Promise.all([
    _posFetchAll(`sale_payments?paid_at=gte.${from}&paid_at=lte.${to}&select=sale_id,amount,kind,method,paid_at,source,collected_by_email,sale:sales(origin_type,status,is_test)&order=paid_at.asc,id.asc`),
    _posFetchAll(`sales?created_at=gte.${from}&created_at=lte.${to}&select=id,origin_type,status,seller_email,is_test&is_test=eq.false&order=created_at.asc,id.asc`)
  ]);
  if (!paymentsResult.ok || !createdResult.ok) {
    content.innerHTML = '<div style="color:var(--red);text-align:center">No se pudo calcular el corte. Verifica la migración de pagos y reintenta.</div>';
    return;
  }

  // sale_payments no tiene columna is_test propia -- se filtra por la venta
  // relacionada, ya embebida en la consulta (mismo criterio que Historial/
  // Reportes, para que el Corte tampoco arrastre pruebas).
  const allPayments = (paymentsResult.data || []).filter(payment => {
    const sale = Array.isArray(payment.sale) ? payment.sale[0] : payment.sale;
    return !sale?.is_test;
  });
  const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const payments = isGeneral ? allPayments : allPayments.filter(payment =>
    String(payment.collected_by_email || '').toLowerCase() === shift.actorEmail
  );
  const unassignedPayments = allPayments.filter(payment => !payment.collected_by_email);
  const otherCashiers = allPayments.filter(payment =>
    payment.collected_by_email && String(payment.collected_by_email).toLowerCase() !== shift.actorEmail
  );
  const created = isGeneral ? (createdResult.data || []) : (createdResult.data || []).filter(sale =>
    String(sale.seller_email || '').toLowerCase() === shift.actorEmail
  );
  let efectivo = 0, transferencia = 0, otros = 0, devoluciones = 0, anticipos = 0;

  payments.forEach(payment => {
    const amount = parseFloat(payment.amount) || 0;
    if (payment.method === 'transferencia') transferencia += amount;
    else if (payment.method === 'efectivo') efectivo += amount;
    else otros += amount;
    if (payment.kind === 'refund') devoluciones += Math.abs(amount);

    const sale = Array.isArray(payment.sale) ? payment.sale[0] : payment.sale;
    if (amount > 0 && sale?.origin_type === 'apartado' && sale?.status === 'activo') anticipos += amount;
  });
  efectivo = money(efectivo);
  transferencia = money(transferencia);
  otros = money(otros);
  devoluciones = money(devoluciones);
  anticipos = money(anticipos);

  const numVentas = created.filter(s => s.origin_type === 'venta' && s.status !== 'cancelado').length;
  const numApartados = created.filter(s => s.origin_type === 'apartado' && s.status !== 'cancelado').length;
  const numLiquidados = new Set(payments
    .filter(payment => {
      const sale = Array.isArray(payment.sale) ? payment.sale[0] : payment.sale;
      return _isApartadoLiquidationPayment(payment, sale);
    })
    .map(payment => payment.sale_id)).size;
  const unassignedNet = money(unassignedPayments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0));
  const otherCashiersNet = money(otherCashiers.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0));

  const total = money(efectivo + transferencia + otros);
  const fmt = n => `$${n.toLocaleString('es-MX')}`;
  const breakdown = isGeneral ? _corteBreakdownRows(allPayments) : [];
  _corteData = { efectivo, transferencia, otros, devoluciones, total, numVentas, numApartados,
    numLiquidados, anticipos, ahoraMX, inicioMX, actorLabel, unassignedNet, otherCashiersNet, isGeneral, breakdown };
  if (shareButton) shareButton.disabled = false;

  const row = (label, value, sub='') => `
    <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.8rem;color:var(--muted);font-weight:600">${label}${sub ? `<span style="font-weight:400;margin-left:6px;color:#B5A696">${sub}</span>` : ''}</span>
      <span style="font-weight:700;font-size:.9rem">${value}</span>
    </div>`;

  content.innerHTML = `
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      ${row(_icoBag() + ' Ventas directas', numVentas)}
      ${numLiquidados ? row(_icoCheck() + ' Apartados liquidados', numLiquidados) : ''}
      ${numApartados  ? row(_icoBookmark() + ' Apartados nuevos', numApartados, anticipos > 0 ? `anticipos activos ${fmt(anticipos)}` : '') : ''}
      <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.8rem;color:var(--muted);font-weight:600">${_icoCash()} Efectivo neto</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--charcoal)">${fmt(efectivo)}</span>
      </div>
      <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.8rem;color:var(--muted);font-weight:600">${_icoPhone()} Transferencia neta</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--charcoal)">${fmt(transferencia)}</span>
      </div>
      ${Math.abs(otros) >= .005 ? row(_icoReceipt() + ' Ajustes sin método', fmt(otros)) : ''}
      ${devoluciones > 0 ? row(_icoUndo() + ' Devoluciones registradas', `−${fmt(devoluciones)}`) : ''}
      <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:#F7F2EB">
        <span style="font-size:.88rem;font-weight:700">${isGeneral ? 'Neto del día' : 'Neto del turno'}<span style="font-weight:400;font-size:.7rem;color:#B5A696;display:block;margin-top:1px">${isGeneral ? 'Todas las cajeras, hoy' : 'Solo lo que cobraste tú en este horario'}</span></span>
        <span style="font-size:1.15rem;font-weight:800;color:${total > 0 ? 'var(--green)' : 'var(--muted)'}">${fmt(total)}</span>
      </div>
    </div>
    ${anticipos > 0 ? `<div style="background:#FFF8EE;border:1px solid var(--gold);border-radius:10px;padding:10px 14px;font-size:.78rem;color:var(--gold-dark)">${_icoBookmark()} <strong>${fmt(anticipos)}</strong> cobrados ${isGeneral ? 'hoy' : 'en este turno'} en apartados que continúan activos</div>` : ''}
    ${!isGeneral && unassignedPayments.length ? `<div style="background:#FFF3F3;border:1px solid #FCA5A5;border-radius:10px;padding:10px 14px;font-size:.76rem;color:#991B1B">${_icoWarn()} ${fmt(unassignedNet)} en ${unassignedPayments.length} abono${unassignedPayments.length!==1?'s':''} antiguo${unassignedPayments.length!==1?'s':''} sin registro de quién los cobró (datos de antes de esta actualización) — no cuentan en tu corte.</div>` : ''}
    ${!isGeneral && otherCashiers.length ? `<div style="background:#F7F2EB;border:1px solid var(--border);border-radius:10px;padding:10px 14px;font-size:.76rem;color:var(--muted)">${_icoUsers()} ${fmt(otherCashiersNet)} los cobró otra cuenta en este mismo horario — no cuentan en tu corte.</div>` : ''}
    <div style="text-align:center;font-size:.72rem;color:var(--muted);padding:4px 0">Generado ${ahoraMX}</div>
  `;

  const breakdownEl = document.getElementById('corte-breakdown');
  if (breakdownEl) breakdownEl.innerHTML = isGeneral ? _renderCorteBreakdown(breakdown, fmt) : '';
}

// Quién cobró qué, sumado en efectivo+transferencia (mismo criterio que el
// neto de arriba) — así "General" no solo da un total, deja ver la parte de
// cada cajera para que Ofelia pueda repartir/verificar sin abrir Reportes.
function _corteBreakdownRows(payments) {
  const byPerson = new Map();
  (payments || []).forEach(payment => {
    const key = payment.collected_by_email ? String(payment.collected_by_email).toLowerCase() : '';
    const amount = parseFloat(payment.amount) || 0;
    byPerson.set(key, (byPerson.get(key) || 0) + amount);
  });
  return [...byPerson.entries()]
    .map(([email, net]) => ({ email, net: Math.round((net + Number.EPSILON) * 100) / 100 }))
    .filter(r => Math.abs(r.net) >= .005)
    .sort((a, b) => b.net - a.net);
}

function _renderCorteBreakdown(rows, fmt) {
  if (!rows.length) return '';
  return `
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="padding:10px 16px;border-bottom:1px solid var(--border)"><span style="font-size:.82rem;font-weight:700;color:var(--charcoal)">${_icoUsers()} Por cajero</span></div>
      ${rows.map(r => `
        <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:.8rem;color:var(--muted);font-weight:600">${r.email ? _icoUser() + ' ' + _esc(r.email.split('@')[0]) : _icoHelp() + ' Sin cajero registrado'}</span>
          <span style="font-weight:700;font-size:.9rem">${fmt(r.net)}</span>
        </div>`).join('')}
    </div>`;
}

/* ── GASTOS DEL TURNO ────────────────────────────────────────────── */
function _gastosKey() { return _posDailyStorageKey('gastos'); }
function _getGastos() { try { return JSON.parse(localStorage.getItem(_gastosKey())) || []; } catch { return []; } }
function _saveGastos(g) { localStorage.setItem(_gastosKey(), JSON.stringify(g)); }

function showGastoForm() {
  const f = document.getElementById('gastos-form');
  f.style.display = 'flex'; document.getElementById('gasto-desc').focus();
}
function hideGastoForm() {
  document.getElementById('gastos-form').style.display = 'none';
  document.getElementById('gasto-desc').value = '';
  document.getElementById('gasto-monto').value = '';
}

function agregarGasto() {
  const desc  = document.getElementById('gasto-desc').value.trim();
  const monto = parseFloat(document.getElementById('gasto-monto').value) || 0;
  if (!desc || monto <= 0) return;
  const gastos = _getGastos();
  gastos.push({ desc, amount: monto, time: new Date().toLocaleTimeString('es-MX', { timeZone:'America/Mexico_City', hour:'2-digit', minute:'2-digit' }) });
  _saveGastos(gastos);
  hideGastoForm();
  renderGastos();
}

function eliminarGasto(idx) {
  const gastos = _getGastos();
  gastos.splice(idx, 1);
  _saveGastos(gastos);
  renderGastos();
}

function renderGastos() {
  const gastos = _getGastos();
  const list   = document.getElementById('gastos-list');
  const totRow = document.getElementById('gastos-total-row');
  const totEl  = document.getElementById('gastos-total');
  const utilRow= document.getElementById('utilidad-row');
  const utilEl = document.getElementById('utilidad-val');
  if (!gastos.length) {
    list.innerHTML = '<div style="padding:10px 0;font-size:.78rem;color:var(--muted);text-align:center">Sin gastos registrados</div>';
    totRow.style.display = 'none';
    utilRow.style.display = 'none';
    _renderCierre();
    return;
  }
  const totalGastos = gastos.reduce((s, g) => s + g.amount, 0);
  list.innerHTML = gastos.map((g, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div>
        <span style="font-size:.82rem;font-weight:600">${_esc(g.desc)}</span>
        <span style="font-size:.68rem;color:var(--muted);margin-left:6px">${g.time}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-weight:700;color:var(--red);font-size:.84rem">-$${g.amount.toLocaleString('es-MX')}</span>
        <button onclick="eliminarGasto(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:2px 4px">✕</button>
      </div>
    </div>`).join('');
  totRow.style.display = 'flex';
  totEl.textContent = '-$' + totalGastos.toLocaleString('es-MX');
  if (_corteData) {
    const utilidad = Math.round((_corteData.total - totalGastos + Number.EPSILON) * 100) / 100;
    utilRow.style.display = 'flex';
    utilEl.textContent = '$' + utilidad.toLocaleString('es-MX');
    utilEl.style.color = utilidad >= 0 ? 'var(--gold-dark)' : 'var(--red)';
  } else {
    utilRow.style.display = 'none';
  }
  _renderCierre();
}

/* ── CIERRE DE CAJA (FONDO INICIAL + CONTEO FÍSICO) ──────────────── */
function _fondoKey()  { return _posDailyStorageKey('fondo'); }
function _conteoKey() { return _posDailyStorageKey('conteo'); }

function _initCierreInputs() {
  const fondo  = localStorage.getItem(_fondoKey());
  const conteo = localStorage.getItem(_conteoKey());
  document.getElementById('corte-fondo').value  = fondo  != null ? fondo  : '';
  document.getElementById('corte-conteo').value = conteo != null ? conteo : '';
  _renderCierre();
}

function _onFondoChange() {
  const val = document.getElementById('corte-fondo').value;
  if (val === '') localStorage.removeItem(_fondoKey());
  else localStorage.setItem(_fondoKey(), parseFloat(val) || 0);
  _renderCierre();
}

function _onConteoChange() {
  const val = document.getElementById('corte-conteo').value;
  if (val === '') localStorage.removeItem(_conteoKey());
  else localStorage.setItem(_conteoKey(), parseFloat(val) || 0);
  _renderCierre();
}

function _renderCierre() {
  if (!_corteData) {
    const expected = document.getElementById('corte-esperado');
    const diffRow = document.getElementById('corte-diff-row');
    if (expected) expected.textContent = '—';
    if (diffRow) diffRow.style.display = 'none';
    return;
  }
  const fondo = parseFloat(localStorage.getItem(_fondoKey())) || 0;
  const totalGastos = _getGastos().reduce((s, g) => s + g.amount, 0);
  const esperado = Math.round((fondo + _corteData.efectivo - totalGastos + Number.EPSILON) * 100) / 100;
  document.getElementById('corte-esperado').textContent = '$' + esperado.toLocaleString('es-MX');

  const conteoRaw = localStorage.getItem(_conteoKey());
  const diffRow = document.getElementById('corte-diff-row');
  const diffVal = document.getElementById('corte-diff-val');
  if (conteoRaw == null) { diffRow.style.display = 'none'; return; }

  const diff = Math.round(((parseFloat(conteoRaw) || 0) - esperado + Number.EPSILON) * 100) / 100;
  diffRow.style.display = 'flex';
  if (Math.abs(diff) < .005) {
    diffVal.textContent = '✓ Cuadra';
    diffVal.style.color = 'var(--green)';
  } else if (diff > 0) {
    diffVal.textContent = `+$${diff.toLocaleString('es-MX')} sobrante`;
    diffVal.style.color = 'var(--gold-dark)';
  } else {
    diffVal.textContent = `-$${Math.abs(diff).toLocaleString('es-MX')} faltante`;
    diffVal.style.color = 'var(--red)';
  }
}

function compartirCorteWA() {
  if (!_corteData) return;
  const { efectivo, transferencia, otros, devoluciones, total, numVentas, numApartados,
    numLiquidados, anticipos, ahoraMX, inicioMX, actorLabel, unassignedNet, otherCashiersNet,
    isGeneral, breakdown } = _corteData;
  const fmt = n => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-MX')}`;
  const gastos = _getGastos();
  const totalGastos = gastos.reduce((s, g) => s + g.amount, 0);
  let msg = isGeneral
    ? `🧾 *Corte general — Tres Encantos*\nHoy desde las ${inicioMX} · todas las cajeras\n${ahoraMX}\n\n`
    : `🧾 *Corte de caja — Tres Encantos*\n${actorLabel} · desde ${inicioMX}\n${ahoraMX}\n\n`;
  if (numVentas > 0)      msg += `🛍 Ventas directas: ${numVentas}\n`;
  if (numLiquidados)      msg += `✅ Apartados liquidados: ${numLiquidados}\n`;
  if (numApartados)       msg += `📌 Apartados nuevos: ${numApartados}${anticipos > 0 ? ` (anticipos activos ${fmt(anticipos)})` : ''}\n`;
  msg += `\n💵 Efectivo neto: ${fmt(efectivo)}\n📱 Transferencia neta: ${fmt(transferencia)}\n*${isGeneral ? 'Neto del día' : 'Neto del turno'}: ${fmt(total)}*`;
  if (Math.abs(otros || 0) >= .005) msg += `\n🧾 Ajustes sin método: ${fmt(otros)}`;
  if (devoluciones > 0) msg += `\n↩️ Devoluciones registradas: −${fmt(devoluciones)}`;
  if (anticipos > 0) msg += `\n📌 Incluye ${fmt(anticipos)} cobrados en apartados aún activos`;
  if (isGeneral) {
    if (breakdown?.length) {
      msg += `\n\n👥 *Por cajero:*\n` + breakdown.map(r =>
        `• ${r.email ? r.email.split('@')[0] : 'Sin cajero registrado'}: ${fmt(r.net)}`
      ).join('\n');
    }
  } else {
    if (Math.abs(unassignedNet || 0) >= .005) msg += `\n⚠ ${fmt(unassignedNet)} en abonos antiguos sin registro de quién los cobró — no incluidos`;
    if (Math.abs(otherCashiersNet || 0) >= .005) msg += `\n👥 ${fmt(otherCashiersNet)} cobrados por otra cuenta — no incluidos`;
  }
  if (gastos.length && !isGeneral) {
    msg += `\n\n💸 *Gastos del turno:*\n` + gastos.map(g => `• ${g.desc}: ${fmt(g.amount)}`).join('\n');
    msg += `\nTotal gastos: ${fmt(totalGastos)}`;
    msg += `\n\n🏆 *Utilidad: ${fmt(total - totalGastos)}*`;
  }

  // Cierre de caja (fondo + conteo) — es del cajón de quien tiene la sesión
  // abierta en este dispositivo, no tiene sentido combinado en "General".
  if (!isGeneral) {
    const fondo = parseFloat(localStorage.getItem(_fondoKey())) || 0;
    const esperado = fondo + efectivo - totalGastos;
    const conteoRaw = localStorage.getItem(_conteoKey());
    if (fondo > 0 || conteoRaw != null) {
      msg += `\n\n💵 *Cierre de caja:*`;
      msg += `\nFondo inicial: ${fmt(fondo)}`;
      msg += `\nEfectivo esperado: ${fmt(esperado)}`;
      if (conteoRaw != null) {
        const conteo = parseFloat(conteoRaw) || 0;
        const diff = conteo - esperado;
        msg += `\nConteo físico: ${fmt(conteo)}`;
        msg += diff === 0 ? `\n✓ Cuadra` : diff > 0 ? `\n+${fmt(diff)} sobrante` : `\n-${fmt(Math.abs(diff))} faltante`;
      }
    }
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
