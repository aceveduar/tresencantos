/* ══ MODO RECEPCIÓN ══════════════════════════════════════════════════ */
let _recvSession = []; // [{product, qtyAdded, prevStock}]
let _recvFbTimer = null;
let _recvFbPendingId = null;
let _recvFbPendingQty = 0;

function openRecvMode() {
  _recvSession = [];
  _renderRecvList();
  _recvUpdateHeader();
  document.getElementById('recv-overlay').style.display = 'flex';
  document.getElementById('recv-fb').style.display = 'none';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('recv-search')?.focus(), 300);
}

function closeRecvMode() {
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const prods = _recvSession.length;
  if (total > 0) {
    toast(`✓ ${total} unidad${total!==1?'es':''} recibidas en ${prods} producto${prods!==1?'s':''}`);
    renderTable();
    renderStats();
  }
  document.getElementById('recv-overlay').style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('recv-search').value = '';
  document.getElementById('recv-search-results').style.display = 'none';
  clearTimeout(_recvFbTimer);
}

function openRecvScanner() {
  _scanCtx = 'recv';
  document.getElementById('scanner-title').textContent = 'Escanear producto';
  _launchScanner();
}

function recvSearch(q) {
  const resultsEl = document.getElementById('recv-search-results');
  const val = q.trim();
  if (!val) { resultsEl.style.display = 'none'; return; }
  // Coincidencia exacta de código de barras → agregar automáticamente sin mostrar lista
  const barcodeMatch = products.find(p => p.barcode && p.barcode === val);
  if (barcodeMatch) { recvConfirmAdd(barcodeMatch.id); return; }
  const matches = products.filter(p => _norm(p.name).includes(_norm(val))).slice(0, 8);
  resultsEl.style.display = 'block';
  if (!matches.length) {
    const safeVal = val.replace(/'/g, "\\'");
    resultsEl.innerHTML = `<div class="recv-no-found" style="padding:18px 16px;text-align:center">
      <div style="font-size:1.6rem;margin-bottom:6px">🔍</div>
      <div style="font-weight:600;color:var(--charcoal);font-size:.88rem;margin-bottom:4px">Producto no encontrado</div>
      <div style="font-size:.76rem;color:var(--muted);margin-bottom:14px;word-break:break-all;max-width:260px;margin-left:auto;margin-right:auto">${val}</div>
      <button onclick="recvCreateProduct('${safeVal}')" style="width:100%;padding:11px 16px;background:var(--charcoal);color:#fff;border:none;border-radius:10px;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation">+ Crear producto →</button>
    </div>`;
    return;
  }
  const PH = DEFAULT_IMG;
  resultsEl.innerHTML = matches.map(p => `
<div class="recv-result-item" onclick="recvConfirmAdd(${p.id})">
  <img class="recv-result-img" src="${p.image}" onerror="this.src='${PH}'" alt="">
  <div style="flex:1;min-width:0">
    <div class="recv-result-name">${p.name}</div>
    <div class="recv-result-stock">Stock actual: ${p.stock}</div>
  </div>
  <span class="recv-result-add">+ Recibir</span>
</div>`).join('');
}

function recvCreateProduct(val) {
  document.getElementById('recv-search').value = '';
  document.getElementById('recv-search-results').style.display = 'none';
  closeRecvMode();
  openForm();
  // Pre-llenar barcode si es numérico (pistola), o nombre si es texto
  setTimeout(() => {
    const isBarcode = /^\d{6,}$/.test(val);
    if (isBarcode) {
      const bc = document.getElementById('f-barcode');
      if (bc) bc.value = val;
    } else {
      const nm = document.getElementById('f-name');
      if (nm) { nm.value = val; nm.focus(); }
    }
  }, 150);
}

function recvSearchKey(e) {
  if (e.key !== 'Enter') return;
  const resultsEl = document.getElementById('recv-search-results');
  if (resultsEl.style.display === 'none') return;
  // No encontrado: Enter de la pistola limpia el campo pero deja la tarjeta visible
  if (resultsEl.querySelector('.recv-no-found')) {
    e.preventDefault();
    document.getElementById('recv-search').value = '';
    document.getElementById('recv-search').focus();
    return;
  }
  // Hay resultados: Enter selecciona el primero
  const first = resultsEl.querySelector('.recv-result-item');
  if (first) first.click();
}

function recvConfirmAdd(id, qty = 1) {
  document.getElementById('recv-search').value = '';
  document.getElementById('recv-search-results').style.display = 'none';
  _recvDoAdd(id, qty);
}

async function _recvDoAdd(id, qty) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const existing = _recvSession.find(x => x.product.id === id);
  const prevStock = existing ? existing.prevStock : p.stock;

  p.stock = p.stock + qty;
  if (p.outOfStock) p.outOfStock = false;

  if (existing) {
    existing.qtyAdded += qty;
  } else {
    _recvSession.unshift({ product: p, qtyAdded: qty, prevStock });
  }

  _showRecvFeedback(p, existing ? existing.qtyAdded : qty);
  _renderRecvList();
  _recvUpdateHeader();
  if (navigator.vibrate) navigator.vibrate(40);

  await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: p.stock, out_of_stock: false })
  });
}

function _showRecvFeedback(p, totalQty) {
  clearTimeout(_recvFbTimer);
  _recvFbPendingId = p.id;
  _recvFbPendingQty = totalQty;
  const fb = document.getElementById('recv-fb');
  fb.style.display = 'block';
  fb.innerHTML = `
<div class="recv-fb-inner">
  <img class="recv-fb-img" src="${p.image}" onerror="this.style.display='none'" alt="">
  <div class="recv-fb-info">
    <div class="recv-fb-name">${p.name}</div>
    <div class="recv-fb-arrow">${p.stock - totalQty} → <strong>+${totalQty} = ${p.stock}</strong> unidades</div>
    <div class="recv-fb-controls">
      <button class="recv-fb-btn" onclick="recvFbAdjust(-1)">−</button>
      <span class="recv-fb-qty" id="recv-fb-qty">+${totalQty}</span>
      <button class="recv-fb-btn" onclick="recvFbAdjust(+1)">+</button>
      <button class="recv-fb-ok" onclick="_recvFbClose()">✓ Ok</button>
    </div>
  </div>
</div>`;
  _recvFbTimer = setTimeout(() => _recvFbClose(), 4000);
}

function recvFbAdjust(delta) {
  clearTimeout(_recvFbTimer);
  if (!_recvFbPendingId) return;
  const item = _recvSession.find(x => x.product.id === _recvFbPendingId);
  if (!item) return;
  if (delta < 0 && item.qtyAdded <= 1) return;
  _recvDoAdd(_recvFbPendingId, delta);
}

function _recvFbClose() {
  clearTimeout(_recvFbTimer);
  document.getElementById('recv-fb').style.display = 'none';
  _recvFbPendingId = null;
}

async function recvUndo(id) {
  const idx = _recvSession.findIndex(x => x.product.id === id);
  if (idx === -1) return;
  const { product: p, qtyAdded, prevStock } = _recvSession[idx];
  p.stock = prevStock;
  p.outOfStock = prevStock === 0;
  _recvSession.splice(idx, 1);
  _renderRecvList();
  _recvUpdateHeader();
  toast(`↩ ${p.name} revertido`);
  await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: prevStock, out_of_stock: prevStock === 0 })
  });
}

function _renderRecvList() {
  const el = document.getElementById('recv-list');
  if (!_recvSession.length) {
    el.innerHTML = '<div class="recv-empty"><div class="recv-empty-icon">📦</div>Escanea o busca un producto para comenzar</div>';
    return;
  }
  const PH = DEFAULT_IMG;
  el.innerHTML = _recvSession.map(({ product: p, qtyAdded, prevStock }) => `
<div class="recv-item">
  <img class="recv-item-img" src="${p.image}" onerror="this.src='${PH}'" alt="">
  <div class="recv-item-info">
    <div class="recv-item-name">${p.name}</div>
    <div class="recv-item-arrow">${prevStock} → <strong>+${qtyAdded} = ${p.stock}</strong> uds.</div>
  </div>
  <span class="recv-badge">+${qtyAdded}</span>
  <button class="recv-undo-btn" onclick="recvUndo(${p.id})" title="Deshacer">↩</button>
</div>`).join('');
}

function _recvUpdateHeader() {
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const badge = document.getElementById('recv-count-badge');
  const sessionTotal = document.getElementById('recv-session-total');
  if (badge) badge.textContent = total > 0 ? `· ${total} unidades` : '';
  if (sessionTotal) sessionTotal.textContent = total > 0
    ? `${total} unid. · ${_recvSession.length} producto${_recvSession.length!==1?'s':''}`
    : '';
}

function recvShareWA() {
  if (!_recvSession.length) { toast('Nada recibido aún', ''); return; }
  const fecha = new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  const lines = _recvSession.map(({ product: p, qtyAdded, prevStock }) =>
    `• ${p.name}: +${qtyAdded} (${prevStock} → ${p.stock})`
  );
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const msg = `📦 Recepción de mercancía — ${fecha}\n\n${lines.join('\n')}\n\nTotal: ${total} unidades en ${_recvSession.length} productos`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
