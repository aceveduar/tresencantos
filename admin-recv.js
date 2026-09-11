/* ══ MODO RECEPCIÓN ══════════════════════════════════════════════════
   Dos modos (_recvMode, elegido en la pantalla inicial, ver recvSetMode):
   "fast" (default -- comportamiento de siempre: escanear/buscar solo suma
   stock, tarjeta de feedback transitoria) y "invoice" (2026-09-11 -- cuando
   sí tienes una factura/nota en la mano: cada renglón de la lista muestra
   Costo/Precio/Código de proveedor editables ahí mismo, save-on-blur, igual
   patrón que ya usa Inventario para editar inline. El mode solo decide QUÉ
   SE MUESTRA -- los tres campos se snapshotean siempre (ver _recvDoAdd),
   así que cambiar de modo a medio sesión no pierde nada y los renglones ya
   agregados en "fast" también quedan editables si cambias a "invoice". */
let _recvSession = []; // [{product, qtyAdded, prevStock, prevCost, prevPrice, prevSupplierCode, isNewlyCreated?}]
let _recvMode = 'fast';
let _recvFbTimer = null;
let _recvFbPendingId = null;

function openRecvMode() {
  if (!can.receiveStock) { toast('Sin permiso para recibir mercancía', 'error'); return; }
  _recvSession = [];
  recvSetMode('fast');
  _renderRecvList();
  _recvUpdateHeader();
  document.getElementById('recv-overlay').style.display = 'flex';
  document.getElementById('recv-fb').style.display = 'none';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('recv-search')?.focus(), 300);
}

function recvSetMode(mode) {
  _recvMode = mode;
  const fastBtn = document.getElementById('recv-mode-fast');
  const invBtn = document.getElementById('recv-mode-invoice');
  if (fastBtn) fastBtn.classList.toggle('active', mode === 'fast');
  if (invBtn) invBtn.classList.toggle('active', mode === 'invoice');
  const hint = document.getElementById('recv-mode-hint');
  if (hint) hint.style.display = mode === 'invoice' ? 'block' : 'none';
  _renderRecvList(); // los renglones ya en la lista también deben mostrar/ocultar los campos extra
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
    const nuevos = _recvSession.filter(x => x.isNewlyCreated).length;
    toast(`✓ ${total} unidad${total!==1?'es':''} recibidas en ${prods} producto${prods!==1?'s':''}`);
    renderTable();
    renderStats();
    // Modo Recepción no dejaba ningún rastro en Actividad -- ni por escaneo
    // (sería demasiado ruido: decenas de filas por una sola sesión) ni un
    // resumen al cerrar. Un solo registro por sesión, con detalle completo
    // en meta.items por si hace falta ver exactamente qué se recibió --
    // incluye costo/precio/código actuales y si el producto se creó en la
    // misma sesión (modo "Con factura" + alta desde "Recibir mercancía").
    logActivity('recepcion_mercancia',
      `Recibió ${total} unidad${total !== 1 ? 'es' : ''} en ${prods} producto${prods !== 1 ? 's' : ''}${nuevos ? ` (${nuevos} nuevo${nuevos!==1?'s':''})` : ''} (Modo Recepción)`,
      { ids: _recvSession.map(x => x.product.id), names: _recvSession.map(x => x.product.name),
        items: _recvSession.map(x => ({
          id: x.product.id, name: x.product.name, qtyAdded: x.qtyAdded, prevStock: x.prevStock, newStock: x.product.stock,
          cost: x.product.cost, price: x.product.price, supplierCode: x.product.supplierCode,
          ...(x.isNewlyCreated ? { isNewlyCreated: true } : {})
        })),
        total, count: prods, nuevos, bulk: true });
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
  // _returnToRecv (admin.js) le dice a closeForm() que, al cerrar el
  // formulario completo -- se guarde o se cancele -- regrese aquí en vez de
  // dejar al usuario en el catálogo general. Antes se perdía la sesión de
  // recepción a medio hacer sin ninguna forma de volver (el bug reportado).
  _returnToRecv = true;
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

// saveProduct() (admin-form.js) llama esto justo después de crear el
// producto, solo si _returnToRecv estaba activo -- se registra en la
// sesión como "recibido" (su stock inicial = la cantidad recibida) para que
// aparezca en la lista, el resumen de WhatsApp y el registro de Actividad
// al finalizar, igual que cualquier producto escaneado normal.
function _recvRegisterCreatedProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  _recvSession.unshift({
    product: p, qtyAdded: p.stock, prevStock: 0,
    prevCost: p.cost, prevPrice: p.price, prevSupplierCode: p.supplierCode,
    isNewlyCreated: true
  });
  _showRecvFeedback(p, p.stock);
}

// Reabre Recepción tal como quedó -- a diferencia de openRecvMode(), NUNCA
// reinicia _recvSession (por eso es una función separada: openRecvMode()
// siempre empieza sesión nueva a propósito, esta nunca debe hacerlo).
function _recvResumeOverlay() {
  _renderRecvList();
  _recvUpdateHeader();
  document.getElementById('recv-overlay').style.display = 'flex';
  document.getElementById('recv-fb').style.display = 'none';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('recv-search')?.focus(), 300);
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
  // Snapshot de costo/precio/código -- se captura solo la primera vez que el
  // producto entra a la sesión (igual que prevStock), para que "Deshacer"
  // pueda restaurarlos aunque se hayan editado en modo "Con factura" y sin
  // importar si el modo cambió a medio camino.
  const prevCost = existing ? existing.prevCost : p.cost;
  const prevPrice = existing ? existing.prevPrice : p.price;
  const prevSupplierCode = existing ? existing.prevSupplierCode : p.supplierCode;
  const prevOutOfStock = p.outOfStock;
  const newStock = p.stock + qty;
  const isNewEntry = !existing;

  p.stock = newStock;
  if (p.outOfStock) p.outOfStock = false;

  if (existing) {
    existing.qtyAdded += qty;
  } else {
    _recvSession.unshift({ product: p, qtyAdded: qty, prevStock, prevCost, prevPrice, prevSupplierCode });
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

// Modo "Con factura": edita costo/precio/código de proveedor directo en la
// lista, con el mismo patrón "tocar → editar → blur = guardar" que ya usa
// Inventario para stock/categoría -- cada campo se guarda por separado, sin
// depender de la tarjeta de feedback (que sigue siendo solo para la
// cantidad, transitoria). Deliberadamente sin las validaciones/advertencias
// de Recepción con IA (precio bajo el costo, chequeo de sanidad, etc.) --
// este flujo es para una recepción rápida sin documento, no para el
// análisis a fondo de una factura completa, que ya cubre esa herramienta.
const _RECV_FIELD_MAP = { cost: 'cost', price: 'price', supplierCode: 'supplier_code' };
async function recvUpdateExtraField(id, field, rawValue) {
  const p = products.find(x => x.id === id);
  const dbField = _RECV_FIELD_MAP[field];
  if (!p || !dbField) return;
  let value;
  if (field === 'supplierCode') {
    value = rawValue.trim() || null;
  } else {
    const n = parseFloat(rawValue);
    value = (rawValue.trim() === '' || isNaN(n)) ? null : n;
  }
  const prev = p[field] ?? null;
  if (value === prev) return; // sin cambio real -- nada que guardar
  p[field] = value;
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ [dbField]: value })
  });
  if (!result.ok) {
    p[field] = prev;
    _renderRecvList();
    toast('No se pudo guardar — el servidor no respondió, intenta de nuevo', 'error');
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
  const item = _recvSession[idx];
  const { product: p } = item;

  if (item.isNewlyCreated) {
    // Un producto creado en esta misma sesión no tiene un "stock anterior"
    // real que restaurar -- se archiva, mismo mecanismo reversible que ya
    // usa "🗑️ Eliminar"/Recepción con IA para este caso exacto.
    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: true, is_published: false, out_of_stock: true })
    });
    if (result.ok) {
      p.isArchived = true; p.isPublished = false; p.outOfStock = true;
      _recvSession.splice(idx, 1);
      _renderRecvList();
      _recvUpdateHeader();
      toast(`📦 "${p.name}" archivado — reversible desde "📦 Archivados"`);
    } else {
      toast('No se pudo archivar — el servidor no respondió, intenta de nuevo', 'error');
    }
    return;
  }

  const curStock = p.stock, curOutOfStock = p.outOfStock;
  const curCost = p.cost, curPrice = p.price, curSupplierCode = p.supplierCode;
  p.stock = item.prevStock;
  p.outOfStock = item.prevStock === 0;
  // Restaura también costo/precio/código -- no-op si nunca se tocaron
  // (modo "Rápido" o si nadie editó esos campos en "Con factura").
  p.cost = item.prevCost;
  p.price = item.prevPrice;
  p.supplierCode = item.prevSupplierCode;
  _recvSession.splice(idx, 1);
  _renderRecvList();
  _recvUpdateHeader();
  // El toast de éxito se disparaba ANTES del await que intenta el PATCH,
  // y su resultado nunca se revisaba -- si deshacer fallaba en el
  // servidor, la app ya había dicho "revertido" y el stock quedaba mal
  // sincronizado hasta el siguiente reload.
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      stock: item.prevStock, out_of_stock: item.prevStock === 0,
      cost: p.cost, price: p.price, supplier_code: p.supplierCode
    })
  });
  if (result.ok) {
    toast(`↩ ${p.name} revertido`);
  } else {
    p.stock = curStock; p.outOfStock = curOutOfStock;
    p.cost = curCost; p.price = curPrice; p.supplierCode = curSupplierCode;
    _recvSession.splice(idx, 0, item);
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
  const invoiceMode = _recvMode === 'invoice';
  el.innerHTML = _recvSession.map(({ product: p, qtyAdded, prevStock, isNewlyCreated }) => `
<div class="recv-item-card">
  <div class="recv-item">
    <img class="recv-item-img" src="${_driveSz(p.image, 80)}" onerror="this.src='${PH}'" alt="">
    <div class="recv-item-info">
      <div class="recv-item-name">${_esc(p.name)}${isNewlyCreated ? '<span class="recv-new-badge">✨ Nuevo</span>' : ''}</div>
      <div class="recv-item-arrow">${prevStock} → <strong>+${qtyAdded} = ${p.stock}</strong> uds.</div>
    </div>
    <span class="recv-badge">+${qtyAdded}</span>
    ${isNewlyCreated
      ? `<button class="recv-undo-btn recv-archive-btn" onclick="recvUndo(${p.id})" title="Se creó en esta sesión -- archivarlo es la forma de deshacerlo"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>Archivar</button>`
      : `<button class="recv-undo-btn" onclick="recvUndo(${p.id})" title="Deshacer este producto"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Deshacer</button>`}
  </div>
  ${invoiceMode ? `
  <div class="recv-item-extra">
    <div class="ria-item-fields">
      <div class="ria-item-field">
        <label>Costo</label>
        <input type="number" min="0" step="0.01" inputmode="decimal" value="${p.cost ?? ''}" onblur="recvUpdateExtraField(${p.id},'cost',this.value)">
      </div>
      <div class="ria-item-field">
        <label>Precio</label>
        <input type="number" min="0" step="0.01" inputmode="decimal" value="${p.price ?? ''}" onblur="recvUpdateExtraField(${p.id},'price',this.value)">
      </div>
      <div class="ria-item-field">
        <label>Cód. proveedor</label>
        <input type="text" value="${_esc(p.supplierCode || '')}" onblur="recvUpdateExtraField(${p.id},'supplierCode',this.value)">
      </div>
    </div>
  </div>` : ''}
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
