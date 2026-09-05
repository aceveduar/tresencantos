/* ══ MODO RECEPCIÓN ══════════════════════════════════════════════════ */
let _recvSession = []; // [{product, qtyAdded, prevStock}]
let _recvFbTimer = null;
let _recvFbPendingId = null;

function openRecvMode() {
  if (!can.receiveStock) { toast('Sin permiso para recibir mercancía', 'error'); return; }
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
    // Cada "+ Recibir" ya se guardó en el momento -- cerrar no deshace nada.
    // Este mensaje existe para que quede claro antes de salir, con la opción
    // de cancelar y usar "Deshacer todo" o el deshacer por producto si algo
    // se recibió por error.
    const ok = confirm(
      `Recibiste ${total} unidad${total!==1?'es':''} en ${prods} producto${prods!==1?'s':''} en esta sesión — ya quedaron guardados en el inventario.\n\n` +
      `Aceptar: cerrar esta pantalla (no se deshace nada).\n` +
      `Cancelar: seguir aquí para revisar o deshacer algo antes de salir.`
    );
    if (!ok) return;
    toast(`✓ ${total} unidad${total!==1?'es':''} recibidas en ${prods} producto${prods!==1?'s':''}`);
    renderTable();
    renderStats();
    // Modo Recepción no dejaba ningún rastro en Actividad -- ni por escaneo
    // (sería demasiado ruido: decenas de filas por una sola sesión) ni un
    // resumen al cerrar. Un solo registro por sesión, con detalle completo
    // en meta.items por si hace falta ver exactamente qué se recibió.
    logActivity('recepcion_mercancia',
      `Recibió ${total} unidad${total !== 1 ? 'es' : ''} en ${prods} producto${prods !== 1 ? 's' : ''} (Modo Recepción)`,
      { ids: _recvSession.map(x => x.product.id), names: _recvSession.map(x => x.product.name),
        items: _recvSession.map(x => ({ id: x.product.id, name: x.product.name, qtyAdded: x.qtyAdded, prevStock: x.prevStock, newStock: x.product.stock })),
        total, count: prods, bulk: true });
  }
  _recvHideOverlay();
}

// Solo esconde la pantalla, sin confirmar ni tocar _recvSession -- lo usan
// closeRecvMode() (tras su propio confirm) y recvCreateProduct() (que
// necesita cerrar Recepción para abrir el formulario de producto nuevo a
// medio escaneo, sin que le salga un diálogo de "vas a cerrar/perder todo"
// que no tiene nada que ver con lo que está haciendo).
function _recvHideOverlay() {
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
  // Un kit no tiene stock propio que "recibir" -- su disponibilidad depende
  // de sus componentes. Sin este filtro, buscar/escanear un kit aquí
  // terminaba escribiendo un número sin sentido en su campo stock (que el
  // resto de la app siempre trata como fijo en 0 para kits).
  // Coincidencia exacta de código de barras → agregar automáticamente sin mostrar lista
  const barcodeMatch = products.find(p => p.barcode && p.barcode === val && !Array.isArray(p.kitItems));
  if (barcodeMatch) { recvConfirmAdd(barcodeMatch.id); return; }
  const matches = products.filter(p => !Array.isArray(p.kitItems) && _norm(p.name).includes(_norm(val))).slice(0, 8);
  resultsEl.style.display = 'block';
  if (!matches.length) {
    const safeVal = _esc(val).replace(/'/g, "\\'");
    resultsEl.innerHTML = `<div class="recv-no-found" style="padding:18px 16px;text-align:center">
      <div style="margin-bottom:6px"><svg width="28" height="28" viewBox="0 0 24 24" stroke="var(--muted-light)" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
      <div style="font-weight:600;color:var(--charcoal);font-size:.88rem;margin-bottom:4px">Producto no encontrado</div>
      <div style="font-size:.76rem;color:var(--muted);margin-bottom:14px;word-break:break-all;max-width:260px;margin-left:auto;margin-right:auto">${_esc(val)}</div>
      <button onclick="recvCreateProduct('${safeVal}')" style="width:100%;padding:11px 16px;background:var(--ink);color:#fff;border:none;border-radius:10px;font-size:.85rem;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation">+ Crear producto →</button>
    </div>`;
    return;
  }
  const PH = DEFAULT_IMG;
  resultsEl.innerHTML = matches.map(p => `
<div class="recv-result-item" onclick="recvConfirmAdd(${p.id})">
  <img class="recv-result-img" src="${_driveSz(p.image, 80)}" onerror="this.src='${PH}'" alt="">
  <div style="flex:1;min-width:0">
    <div class="recv-result-name">${_esc(p.name)}</div>
    <div class="recv-result-stock">Stock actual: ${p.stock}</div>
  </div>
  <span class="recv-result-add">+ Recibir</span>
</div>`).join('');
}

function recvCreateProduct(val) {
  _recvHideOverlay();
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
  const prevOutOfStock = p.outOfStock;
  const newStock = p.stock + qty;
  const isNewEntry = !existing;

  p.stock = newStock;
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

  // Optimista a propósito (para que escanear se sienta instantáneo), pero
  // antes no revisaba el resultado del PATCH en absoluto -- si el guardado
  // fallaba (red, RLS), el stock local y la sesión de recepción seguían
  // mostrando el aumento como si se hubiera guardado, sin ningún aviso.
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: newStock, out_of_stock: false })
  });
  if (!result.ok) {
    p.stock = prevStock;
    p.outOfStock = prevOutOfStock;
    if (isNewEntry) {
      const idx = _recvSession.findIndex(x => x.product.id === id);
      if (idx !== -1) _recvSession.splice(idx, 1);
    } else {
      existing.qtyAdded -= qty;
    }
    _renderRecvList();
    _recvUpdateHeader();
    toast('No se pudo guardar en el servidor — recepción no registrada, intenta de nuevo', 'error');
  }
}

function _showRecvFeedback(p, totalQty) {
  clearTimeout(_recvFbTimer);
  _recvFbPendingId = p.id;
  const fb = document.getElementById('recv-fb');
  fb.style.display = 'block';
  fb.innerHTML = `
<div class="recv-fb-inner">
  <img class="recv-fb-img" src="${_driveSz(p.image, 80)}" onerror="this.style.display='none'" alt="">
  <div class="recv-fb-info">
    <div class="recv-fb-name">${_esc(p.name)}</div>
    <div class="recv-fb-arrow">${p.stock - totalQty} → <strong>+${totalQty} = ${p.stock}</strong> unidades</div>
    <div class="recv-fb-controls">
      <button class="recv-fb-btn" onclick="recvFbAdjust(-1)">−</button>
      <span class="recv-fb-qty" id="recv-fb-qty">+${totalQty}</span>
      <button class="recv-fb-btn" onclick="recvFbAdjust(+1)">+</button>
      <button class="recv-fb-ok" onclick="_recvFbClose()"><svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px"><polyline points="20 6 9 17 4 12"/></svg>Ok</button>
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
  const curStock = p.stock;
  const curOutOfStock = p.outOfStock;
  p.stock = prevStock;
  p.outOfStock = prevStock === 0;
  _recvSession.splice(idx, 1);
  _renderRecvList();
  _recvUpdateHeader();
  // El toast de éxito se disparaba ANTES del await que intenta el PATCH,
  // y su resultado nunca se revisaba -- si deshacer fallaba en el
  // servidor, la app ya había dicho "revertido" y el stock quedaba mal
  // sincronizado hasta el siguiente reload.
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stock: prevStock, out_of_stock: prevStock === 0 })
  });
  if (result.ok) {
    toast(`↩ ${p.name} revertido`);
  } else {
    p.stock = curStock;
    p.outOfStock = curOutOfStock;
    _recvSession.splice(idx, 0, { product: p, qtyAdded, prevStock });
    _renderRecvList();
    _recvUpdateHeader();
    toast('No se pudo deshacer — el servidor no respondió, intenta de nuevo', 'error');
  }
}

// Snapshot de los ids antes de empezar -- recvUndo va recortando _recvSession
// conforme confirma cada PATCH, así que iterar sobre el arreglo original
// evita saltarse elementos al desplazarse los índices. Sin confirm() propio
// -- lo piden por separado recvUndoAll() y recvDiscardAndClose(), cada uno
// con su propio mensaje.
async function _recvUndoAllSilent() {
  const ids = _recvSession.map(x => x.product.id);
  let failed = 0;
  for (const id of ids) {
    const before = _recvSession.length;
    await recvUndo(id);
    if (_recvSession.length === before) failed++; // recvUndo no lo quitó -> falló
  }
  return failed;
}

async function recvUndoAll() {
  if (!_recvSession.length) return;
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const prods = _recvSession.length;
  const ok = confirm(`¿Deshacer TODO lo recibido en esta sesión?\n\nSe revertirán ${total} unidad${total!==1?'es':''} en ${prods} producto${prods!==1?'s':''}.`);
  if (!ok) return;
  const failed = await _recvUndoAllSilent();
  if (failed) toast(`${failed} producto${failed!==1?'s':''} no se pudo deshacer — revisa la conexión e intenta de nuevo`, 'error');
  else toast('↩ Toda la sesión fue revertida');
}

// "✕ Descartar" (antes "Cerrar/Salir") -- a diferencia de "Finalizar
// recepción", esta es la ruta que NO deja nada guardado: si hay algo
// recibido en la sesión, primero avisa y solo si se confirma revierte todo
// (mismo camino que "Deshacer todo") antes de cerrar. La única forma de
// quedarse con lo recibido es el botón grande de abajo.
async function recvDiscardAndClose() {
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const prods = _recvSession.length;
  if (total > 0) {
    const ok = confirm(
      `Si cierras aquí se PERDERÁ todo lo recibido en esta sesión (${total} unidad${total!==1?'es':''} en ${prods} producto${prods!==1?'s':''}) y NO se reabastecerá.\n\n` +
      `Para guardarlo, cancela y usa "Finalizar recepción" en vez de Descartar.\n\n` +
      `¿Cerrar de todos modos y perder estos cambios?`
    );
    if (!ok) return;
    const failed = await _recvUndoAllSilent();
    if (failed) {
      toast(`${failed} producto${failed!==1?'s':''} no se pudo revertir — revisa la conexión antes de salir`, 'error');
      return; // no cerrar con productos a medio revertir por una falla de red
    }
  }
  _recvHideOverlay();
}

function _renderRecvList() {
  const el = document.getElementById('recv-list');
  if (!_recvSession.length) {
    el.innerHTML = '<div class="recv-empty"><div class="recv-empty-icon"><svg width="32" height="32" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></div>Escanea o busca un producto para comenzar</div>';
    return;
  }
  const PH = DEFAULT_IMG;
  el.innerHTML = _recvSession.map(({ product: p, qtyAdded, prevStock }) => `
<div class="recv-item">
  <img class="recv-item-img" src="${_driveSz(p.image, 80)}" onerror="this.src='${PH}'" alt="">
  <div class="recv-item-info">
    <div class="recv-item-name">${_esc(p.name)}</div>
    <div class="recv-item-arrow">${prevStock} → <strong>+${qtyAdded} = ${p.stock}</strong> uds.</div>
  </div>
  <span class="recv-badge">+${qtyAdded}</span>
  <button class="recv-undo-btn" onclick="recvUndo(${p.id})" title="Deshacer este producto"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Deshacer</button>
</div>`).join('');
}

function _recvUpdateHeader() {
  const total = _recvSession.reduce((s, x) => s + x.qtyAdded, 0);
  const badge = document.getElementById('recv-count-badge');
  const sessionTotal = document.getElementById('recv-session-total');
  const undoAllBtn = document.getElementById('recv-undo-all-btn');
  if (badge) badge.textContent = total > 0 ? `· ${total} unidades` : '';
  if (sessionTotal) sessionTotal.textContent = total > 0
    ? `${total} unid. · ${_recvSession.length} producto${_recvSession.length!==1?'s':''}`
    : '';
  if (undoAllBtn) undoAllBtn.style.display = total > 0 ? 'inline-flex' : 'none';
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
