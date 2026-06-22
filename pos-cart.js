/* ── CART ── */
/* ── FRECUENTES ── */
let _topFromSales = [];

async function loadTopProductsFromSales() {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const r = await api(`sales?created_at=gte.${desde}T00:00:00&type=eq.venta&select=items`);
  if (!r.ok || !Array.isArray(r.data)) return;
  const counts = {};
  for (const sale of r.data) {
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
    .filter(p => p && !p.outOfStock && p.stock > 0);
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
    p.stock = newStock;
    p.outOfStock = false;
    _closeRestockPrompt();
    searchProducts(document.getElementById('pos-search')?.value || '');
    addToCart(id);
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

function editPriceInline(pid) {
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
const isTabMode = () => window.innerWidth <= 1024;

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
  syncCartTopbar();
  _updateMiniCartBar();
  updateChange();
  if (document.getElementById('pos-is-apartado')?.checked) updateAnticipoInfo();

  if (!cart.length) {
    el.innerHTML = '<div class="cart-empty"><div class="em">🛒</div>El carrito está vacío</div>';
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
      ? `<div style="font-size:.7rem;color:#9B8B78;margin-top:1px">🎁 ${_esc(p.kitItems.map(c=>`${c.qty>1?c.qty+'× ':''}${c.name}`).join(', '))}</div>`
      : '';
    return `
<div class="cart-item" data-pid="${p.id}">
  <img class="ci-img" src="${_driveSz(p.image,80)}" alt="${_esc(p.name)}" onerror="this.onerror=null;this.src='${PROD_PLACEHOLDER}'" onclick="event.stopPropagation();openLightbox(this)" data-name="${_esc(p.name)}" data-price="${effPrice}" data-qty="${qty}" style="cursor:zoom-in">
  <div class="ci-info">
    <div class="ci-name">${_esc(p.name)}</div>
    ${kitSub}
    <span class="ci-price${isCustom?' ci-price-custom':''}" onclick="editPriceInline(${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar precio">${priceLabel} c/u</span>
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

async function openCorte() {
  document.getElementById('corte-offcanvas').classList.add('open');
  document.getElementById('corte-backdrop').style.display = 'block';
  document.body.style.overflow = 'hidden';
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
  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Calculando...</div>';

  const TZ = 'America/Mexico_City';
  const ahoraMX   = new Intl.DateTimeFormat('es-MX', { timeZone:TZ, dateStyle:'full', timeStyle:'short' }).format(new Date());
  // Siempre desde medianoche del día (todas las ventas de hoy, sin importar cuándo se abrió el POS)
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const queryFrom  = hoyInicio.toISOString();
  periodoEl.textContent = `Ventas del día · ${ahoraMX}`;

  const result = await api(`sales?created_at=gte.${queryFrom}&select=id,total,paid_amount,payment_method,type,discount,items,abonos,created_at,customer`);
  if (!result.ok) { content.innerHTML = '<div style="color:var(--red);text-align:center">Error al cargar datos</div>'; return; }

  const sales = result.data || [];
  let efectivo = 0, transferencia = 0, numVentas = 0, numApartados = 0, numLiquidados = 0, anticipos = 0;

  sales.forEach(s => {
    const abonos = Array.isArray(s.abonos) ? s.abonos : [];

    if (abonos.length) {
      // Venta con historial de pagos: apartado activo o apartado liquidado
      let abonosDelTurno = 0;
      let hayAbonosDelTurno = false;
      abonos.forEach(a => {
        if (new Date(a.date) >= hoyInicio) {
          const amt = parseFloat(a.amount) || 0;
          if (a.method === 'transferencia') transferencia += amt; else efectivo += amt;
          abonosDelTurno += amt;
          hayAbonosDelTurno = true;
        }
      });
      // Contar una vez por venta, no por abono
      if (hayAbonosDelTurno) {
        if (s.type === 'apartado') {
          numApartados++;
          anticipos += abonosDelTurno;
        } else {
          // Apartado que se liquidó en este turno (type cambió a 'venta')
          numLiquidados++;
          numVentas++;
        }
      }
    } else if (s.type !== 'apartado') {
      // Venta directa: usar total (lo que quedó en caja, ya descontado el cambio)
      const amt = parseFloat(s.total) || 0;
      if (s.payment_method === 'transferencia') transferencia += amt; else efectivo += amt;
      numVentas++;
    } else {
      // Apartado sin anticipo todavía (paid_amount=0, abonos=null)
      numApartados++;
    }
  });

  const total = efectivo + transferencia;
  const fmt = n => `$${n.toLocaleString('es-MX')}`;
  _corteData = { efectivo, transferencia, total, numVentas, numApartados, numLiquidados, anticipos, ahoraMX };

  const ventasDirectas = numVentas - numLiquidados;
  const row = (label, value, sub='') => `
    <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:.8rem;color:var(--muted);font-weight:600">${label}${sub ? `<span style="font-weight:400;margin-left:6px;color:#B5A696">${sub}</span>` : ''}</span>
      <span style="font-weight:700;font-size:.9rem">${value}</span>
    </div>`;

  content.innerHTML = `
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden">
      ${row('🛍 Ventas directas', ventasDirectas)}
      ${numLiquidados ? row('✅ Apartados liquidados', numLiquidados) : ''}
      ${numApartados  ? row('📌 Apartados activos', numApartados, anticipos > 0 ? `anticipo ${fmt(anticipos)}` : '') : ''}
      <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.8rem;color:var(--muted);font-weight:600">💵 Efectivo recibido</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--charcoal)">${fmt(efectivo)}</span>
      </div>
      <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.8rem;color:var(--muted);font-weight:600">📱 Transferencia recibida</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--charcoal)">${fmt(transferencia)}</span>
      </div>
      <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:#F7F2EB">
        <span style="font-size:.88rem;font-weight:700">Total del turno</span>
        <span style="font-size:1.15rem;font-weight:800;color:var(--green)">${fmt(total)}</span>
      </div>
    </div>
    ${anticipos > 0 ? `<div style="background:#FFF8EE;border:1px solid var(--gold);border-radius:10px;padding:10px 14px;font-size:.78rem;color:var(--gold-dark)">📌 <strong>${fmt(anticipos)}</strong> en anticipos de apartados abiertos — pendiente completar cobro</div>` : ''}
    <div style="text-align:center;font-size:.72rem;color:var(--muted);padding:4px 0">Generado ${ahoraMX}</div>
  `;
}

/* ── GASTOS DEL TURNO ────────────────────────────────────────────── */
function _gastosKey() { return 'te_gastos_' + (localStorage.getItem('te_shift_date') || new Date().toISOString().split('T')[0]); }
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
  gastos.push({ desc, amount: monto, time: new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) });
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
    const utilidad = _corteData.total - totalGastos;
    utilRow.style.display = 'flex';
    utilEl.textContent = '$' + utilidad.toLocaleString('es-MX');
    utilEl.style.color = utilidad >= 0 ? 'var(--gold-dark)' : 'var(--red)';
  }
  _renderCierre();
}

/* ── CIERRE DE CAJA (FONDO INICIAL + CONTEO FÍSICO) ──────────────── */
function _fondoKey()  { return 'te_fondo_'  + (localStorage.getItem('te_shift_date') || new Date().toISOString().split('T')[0]); }
function _conteoKey() { return 'te_conteo_' + (localStorage.getItem('te_shift_date') || new Date().toISOString().split('T')[0]); }

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
  if (!_corteData) return;
  const fondo = parseFloat(localStorage.getItem(_fondoKey())) || 0;
  const totalGastos = _getGastos().reduce((s, g) => s + g.amount, 0);
  const esperado = fondo + _corteData.efectivo - totalGastos;
  document.getElementById('corte-esperado').textContent = '$' + esperado.toLocaleString('es-MX');

  const conteoRaw = localStorage.getItem(_conteoKey());
  const diffRow = document.getElementById('corte-diff-row');
  const diffVal = document.getElementById('corte-diff-val');
  if (conteoRaw == null) { diffRow.style.display = 'none'; return; }

  const diff = (parseFloat(conteoRaw) || 0) - esperado;
  diffRow.style.display = 'flex';
  if (diff === 0) {
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
  const { efectivo, transferencia, total, numVentas, numApartados, numLiquidados, anticipos, ahoraMX } = _corteData;
  const fmt = n => `$${n.toLocaleString('es-MX')}`;
  const gastos = _getGastos();
  const totalGastos = gastos.reduce((s, g) => s + g.amount, 0);
  const ventasDirectas = numVentas - (numLiquidados || 0);
  let msg = `🧾 *Corte de caja — Tres Encantos*\n${ahoraMX}\n\n`;
  if (ventasDirectas > 0) msg += `🛍 Ventas directas: ${ventasDirectas}\n`;
  if (numLiquidados)      msg += `✅ Apartados liquidados: ${numLiquidados}\n`;
  if (numApartados)       msg += `📌 Apartados activos: ${numApartados}${anticipos > 0 ? ` (anticipo ${fmt(anticipos)})` : ''}\n`;
  msg += `\n💵 Efectivo: ${fmt(efectivo)}\n📱 Transferencia: ${fmt(transferencia)}\n*Total recibido: ${fmt(total)}*`;
  if (anticipos > 0) msg += `\n⚠️ Incluye ${fmt(anticipos)} en anticipos — pendiente completar cobro`;
  if (gastos.length) {
    msg += `\n\n💸 *Gastos del turno:*\n` + gastos.map(g => `• ${g.desc}: ${fmt(g.amount)}`).join('\n');
    msg += `\nTotal gastos: ${fmt(totalGastos)}`;
    msg += `\n\n🏆 *Utilidad: ${fmt(total - totalGastos)}*`;
  }

  // Cierre de caja (fondo + conteo)
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

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
