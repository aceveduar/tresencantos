/* ── BARCODE SCANNER ── */
let _scanCtx = null;
let _scanInst = null;
let _quaggaActive = false;
let _quaggaDetected = false;

function _loadQuagga() {
  return new Promise((resolve, reject) => {
    if (window.Quagga) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@ericblade/quagga2/dist/quagga.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function openFormScanner() {
  TE?.track('scan_form');
  _scanCtx = 'form';
  document.getElementById('scanner-title').textContent = 'Escanear código de barras';
  _launchScanner();
}

function openCapScanner() {
  _scanCtx = 'capture';
  document.getElementById('scanner-title').textContent = 'Escanear código de barras';
  _launchScanner();
}

function openSearchScanner() {
  _scanCtx = 'search';
  TE?.track('scan_search');
  document.getElementById('scanner-title').textContent = 'Buscar producto por código';
  _launchScanner();
}

function openKitScanner() {
  _scanCtx = 'kb';
  document.getElementById('scanner-title').textContent = 'Escanear componente del kit';
  _launchScanner();
}

async function _launchScanner() {
  document.getElementById('scanner-status').textContent = 'Iniciando cámara...';
  document.getElementById('scanner-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    if (_scanInst) { _scanInst.stop().catch(() => {}); _scanInst = null; }
    try { await _loadQuagga(); } catch(e) {
      document.getElementById('scanner-status').textContent = 'No se pudo cargar el escáner.';
      return;
    }
    _quaggaDetected = false;
    _quaggaActive = true;
    Quagga.init({
      inputStream: { name: 'Live', type: 'LiveStream',
        target: document.getElementById('scanner-reader'),
        constraints: { facingMode: { ideal: 'environment' } }
      },
      locator: { patchSize: 'medium', halfSample: true },
      numOfWorkers: 0, frequency: 15,
      decoder: { readers: ['ean_reader','ean_8_reader','code_128_reader','upc_reader','upc_e_reader'] },
      locate: true
    }, (err) => {
      if (err) {
        document.getElementById('scanner-status').textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
        _quaggaActive = false; return;
      }
      Quagga.start();
      document.getElementById('scanner-status').textContent = 'Apunta al código de barras';
      Quagga.onDetected((result) => {
        if (_quaggaDetected) return;
        const code = result.codeResult?.code;
        if (code) { _quaggaDetected = true; _onAdminScan(code); }
      });
    });
  } else {
    if (_scanInst) { _scanInst.clear().catch(() => {}); _scanInst = null; }
    const barcodeFormats = [
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,   Html5QrcodeSupportedFormats.QR_CODE,
    ];
    _scanInst = new Html5Qrcode('scanner-reader', { formatsToSupport: barcodeFormats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    _scanInst.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 100 } },
      (code) => { _onAdminScan(code); },
      () => {}
    ).then(() => {
      document.getElementById('scanner-status').textContent = 'Apunta al código de barras';
    }).catch(() => {
      document.getElementById('scanner-status').textContent = 'No se pudo acceder a la cámara. Verifica los permisos.';
    });
  }
}

function closeAdminScanner() {
  if (_quaggaActive && window.Quagga) {
    Quagga.offDetected();
    Promise.resolve(Quagga.stop()).catch(() => {});
    _quaggaActive = false;
  }
  if (_scanInst) { _scanInst.stop().catch(() => {}); _scanInst = null; }
  document.getElementById('scanner-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── DETECCIÓN DE DUPLICADOS ── */
function _normStr(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
}

// Constantes fuera de la función — no se recrean en cada llamada
const _DUP_STOP = new Set(['de','la','el','los','las','un','una','y','con','para','en','del','al']);
const _stem = w => w.endsWith('es') && w.length > 4 ? w.slice(0,-2) : w.endsWith('s') && w.length > 3 ? w.slice(0,-1) : w;
function _productWords(name) {
  return new Set(_normStr(name).split(' ').filter(w => w.length > 1 && !_DUP_STOP.has(w)).map(_stem));
}
function _wordSim(a, b) {
  const wa = _productWords(a), wb = _productWords(b);
  if (!wa.size || !wb.size) return 0;
  return [...wa].filter(w => wb.has(w)).length / Math.max(wa.size, wb.size);
}

function checkBarcodeConflict() {
  const warn = document.getElementById('f-barcode-warn');
  const code = document.getElementById('f-barcode').value.trim();
  const editingId = parseInt(document.getElementById('f-id').value) || null;
  warn.style.display = 'none';
  if (!code) return;
  const conflict = products.find(p => p.barcode === code && p.id !== editingId);
  if (!conflict) return;
  warn.className = 'dup-warn error';
  warn.innerHTML = `⛔ Este código ya está en <strong>${_esc(conflict.name)}</strong> — <button type="button" class="dup-link" onclick="closeForm();openForm(${conflict.id})">Ver producto →</button>`;
  warn.style.display = 'block';
}

function checkNameSimilarity() {
  const warn = document.getElementById('f-name-warn');
  const name = document.getElementById('f-name').value.trim();
  const editingId = parseInt(document.getElementById('f-id').value) || null;
  warn.style.display = 'none';
  if (name.length < 4) return;
  const normName = _normStr(name);
  const price = parseFloat(document.getElementById('f-price').value) || null;
  const stock = parseInt(document.getElementById('f-stock').value);

  const formBarcode = document.getElementById('f-barcode')?.value.trim();
  const scored = products.filter(p => {
    if (p.id === editingId) return false;
    // Códigos de barras distintos → productos claramente diferentes
    if (formBarcode && p.barcode && formBarcode !== p.barcode) return false;
    return true;
  }).map(p => {
    const exact = _normStr(p.name) === normName;
    const sim = exact ? 1 : _wordSim(name, p.name);
    const priceMatch = price && p.price === price;
    const stockMatch = !isNaN(stock) && stock >= 2 && p.stock === stock;
    const score = sim + (priceMatch ? 0.25 : 0) + (stockMatch ? 0.15 : 0);
    return { p, sim, score, exact, priceMatch, stockMatch };
  }).filter(({sim, score}) => sim >= 0.55 && score >= 0.55)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return;
  const { p: top, exact: isExact, priceMatch, stockMatch } = scored[0];
  const signals = [];
  if (priceMatch) signals.push(`mismo precio ($${top.price.toLocaleString('es-MX')})`);
  if (stockMatch) signals.push(`mismo stock (${top.stock})`);
  window._simIds = scored.map(({p}) => p.id);
  const links = scored.map(({p}, i) =>
    `<button type="button" class="dup-link" onclick="openSimilarModal(${i})">${_esc(p.name)} →</button>`
  ).join('  ');
  const signalText = signals.length
    ? ` <span style="opacity:.75;font-size:.85em">(${signals.join(', ')})</span>` : '';
  warn.className = 'dup-warn' + (isExact ? ' error' : '');
  warn.innerHTML = isExact
    ? `⛔ Ya existe un producto con ese nombre: ${links}`
    : `⚠️ Nombre similar${signalText}: ${links}`;
  warn.style.display = 'block';
}

function _clearDupWarnings() {
  ['f-name-warn', 'f-barcode-warn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

/* ── REVISIÓN DE DUPLICADOS (escaneo automático al cargar) ─────────────── */
const _DUP_DISMISS_KEY = 'te_dismissed_dups';
let _dismissedDupsCache = null; // null = aún no cargado desde Supabase

function _getDismissedDups() {
  if (_dismissedDupsCache !== null) return _dismissedDupsCache;
  // Fallback a localStorage mientras se carga (o si Supabase falló)
  try { return new Set(JSON.parse(localStorage.getItem(_DUP_DISMISS_KEY) || '[]')); }
  catch { return new Set(); }
}
function _saveDismissedDups(set) {
  _dismissedDupsCache = set;
  localStorage.setItem(_DUP_DISMISS_KEY, JSON.stringify([...set]));
  // Persiste en Supabase para sincronizar entre dispositivos
  supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'dismissed_dups', value: JSON.stringify([...set]) })
  });
}

function _findDuplicatePairs() {
  const dismissed  = _getDismissedDups();
  const productMap = new Map(products.map(p => [p.id, p]));

  // Pre-computar palabras significativas de cada producto (una sola vez)
  const wordSets = new Map(products.map(p => [p.id, _productWords(p.name)]));

  // Índice: palabra → lista de IDs (solo pares que comparten al menos 1 palabra)
  const wordIndex = Object.create(null);
  products.forEach(p => {
    wordSets.get(p.id).forEach(w => {
      if (!wordIndex[w]) wordIndex[w] = [];
      wordIndex[w].push(p.id);
    });
  });

  // Índice de barcodes para detectar coincidencias exactas
  const barcodeIndex = Object.create(null);
  products.forEach(p => {
    if (p.barcode) {
      if (!barcodeIndex[p.barcode]) barcodeIndex[p.barcode] = [];
      barcodeIndex[p.barcode].push(p.id);
    }
  });

  // Índice de imágenes para detectar misma foto (sin necesidad de compartir palabras)
  const imageIndex = Object.create(null);
  const imageFreq  = Object.create(null); // frecuencia de cada URL
  products.forEach(p => {
    if (p.image) {
      imageFreq[p.image] = (imageFreq[p.image] || 0) + 1;
      if (!imageIndex[p.image]) imageIndex[p.image] = [];
      imageIndex[p.image].push(p.id);
    }
  });
  // URLs que aparecen en 3+ productos = imagen genérica (logo, bolsa regalo…) — no es señal de duplicado
  const isGenericImg = url => !url || url === DEFAULT_IMG || (imageFreq[url] || 0) >= 3;

  const seen  = new Set();
  const pairs = [];

  const evalPair = (a, b) => {
    const pairKey = `${Math.min(a.id, b.id)}_${Math.max(a.id, b.id)}`;
    if (seen.has(pairKey) || dismissed.has(pairKey)) return;
    seen.add(pairKey);
    if (a.barcode && b.barcode && a.barcode !== b.barcode) return;

    const barcodeMatch = !!(a.barcode && b.barcode && a.barcode === b.barcode);
    const imageMatch   = !!(a.image && b.image && a.image === b.image && !isGenericImg(a.image));
    const wa = wordSets.get(a.id), wb = wordSets.get(b.id);
    const inter = wa && wb ? [...wa].filter(w => wb.has(w)).length : 0;
    const nameSim = (wa?.size && wb?.size) ? inter / Math.max(wa.size, wb.size) : 0;
    const exact = nameSim === 1 || _normStr(a.name) === _normStr(b.name);
    const priceMatch = a.price > 0 && a.price === b.price;
    const stockMatch = a.stock >= 2 && a.stock === b.stock;
    const catMatch   = !!(a.category && a.category === b.category);
    const score = (barcodeMatch ? 1 : 0) + (imageMatch ? 0.8 : 0) + nameSim
                + (priceMatch ? 0.25 : 0) + (stockMatch ? 0.15 : 0) + (catMatch ? 0.1 : 0);
    if (!barcodeMatch && !imageMatch && !(nameSim >= 0.55 && score >= 0.55)) return;

    const signals = [];
    if (barcodeMatch) signals.push('mismo código de barras');
    if (imageMatch)   signals.push('misma imagen');
    if (exact) signals.push('nombre idéntico');
    else if (nameSim >= 0.55) signals.push('nombre similar');
    if (priceMatch) signals.push(`precio $${a.price.toLocaleString('es-MX')}`);
    if (stockMatch) signals.push(`stock ${a.stock}`);
    pairs.push({ a, b, score, signals, pairKey });
  };

  // Solo comparar productos que comparten palabras
  Object.values(wordIndex).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = productMap.get(ids[i]), b = productMap.get(ids[j]);
        if (a && b) evalPair(a, b);
      }
  });

  // Barcodes iguales (aunque no compartan palabras en el nombre)
  Object.values(barcodeIndex).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = productMap.get(ids[i]), b = productMap.get(ids[j]);
        if (a && b) evalPair(a, b);
      }
  });

  // Imágenes iguales (aunque no compartan palabras ni barcode)
  Object.values(imageIndex).forEach(ids => {
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = productMap.get(ids[i]), b = productMap.get(ids[j]);
        if (a && b) evalPair(a, b);
      }
  });

  return pairs.sort((x, y) => y.score - x.score);
}

function _updateDupBadge() { /* desactivado — solo corre al abrir Revisión de duplicados */ }

/* ── ARCHIVAR / RESTAURAR ── */
async function archiveProduct(id) {
  if (!can.deleteProduct) return;
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Archivar "${p.name}"?\nDesaparecerá del inventario y la caja. Podrás restaurarlo desde "Archivados".`)) return;
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_archived: true, is_published: false, out_of_stock: true })
  });
  if (!result.ok) { toast('Error al archivar', 'error'); return; }
  const idx = products.findIndex(x => x.id === id);
  if (idx > -1) products[idx] = { ...products[idx], isArchived: true, isPublished: false, outOfStock: true };
  closeQV();
  renderTable();
  renderStats();
  logActivity('producto_editado', `Archivó "${p.name}"`, { id, name: p.name });
  toastUndo(`"${truncName(p.name)}" archivado`, async () => {
    const r = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_archived: false })
    });
    if (!r.ok) { toast('No se pudo restaurar', 'error'); return; }
    const i = products.findIndex(x => x.id === id);
    if (i > -1) products[i] = { ...products[i], isArchived: false };
    renderTable(); renderStats();
    toast(`"${truncName(p.name)}" restaurado ✓`, 'success');
  });
}

async function restoreProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_archived: false })
  });
  if (!result.ok) { toast('Error al restaurar', 'error'); return; }
  const idx = products.findIndex(x => x.id === id);
  if (idx > -1) products[idx] = { ...products[idx], isArchived: false };
  closeQV();
  renderTable();
  renderStats();
  logActivity('producto_editado', `Restauró "${p.name}" del archivo`, { id, name: p.name });
  toast(`"${truncName(p.name)}" restaurado al inventario ✓`, 'success');
}

function toggleArchivedView() {
  _showingArchived = !_showingArchived;
  _statFilter = null;
  _showOnlyFlagged = false;
  _adminPage = 1;
  renderTable();
  renderStats();
}

function _dismissDupBanner() {
  const pairs = _findDuplicatePairs();
  localStorage.setItem('te_dup_dismiss', pairs.length);
  const banner = document.getElementById('dup-banner');
  if (banner) banner.style.display = 'none';
}

function openDupReview() {
  _renderDupReview();
  document.getElementById('dup-review-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDupReview() {
  document.getElementById('dup-review-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function _openFormFromDup(id) {
  _returnToDupReview = true;
  closeDupReview();
  openForm(id);
}

function _openFormFromKitQV(compId) {
  const kitId = _qvCurrentId;
  _returnToKitQVId = kitId;
  document.getElementById('kit-comp-popup')?.remove();
  closeQV();
  openForm(compId);
}

function _backToKit() {
  if (_formIsDirty()) {
    if (!confirm('Tienes cambios sin guardar en el componente. ¿Volver al kit sin guardar?')) return;
  }
  _formSnapshot = null;
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
  _clearDupWarnings();
  const b = document.getElementById('form-kit-banner'); if (b) b.style.display = 'none';
  const id = _returnToKitId; _returnToKitId = null;
  if (id) { _scrollToKitOnOpen = true; setTimeout(() => openForm(id), 80); }
}

function _openFormFromKit(compId) {
  const kitId = parseInt(document.getElementById('f-id')?.value) || null;
  _returnToKitId = kitId;
  const kitName = kitId ? (products.find(x => x.id === kitId)?.name || 'kit') : 'kit';
  document.getElementById('kit-comp-popover')?.remove();
  _formSnapshot = null;
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
  _clearDupWarnings();
  openForm(compId);
  // Mostrar banner "← Volver al kit [nombre]"
  const banner = document.getElementById('form-kit-banner');
  const bannerTxt = document.getElementById('form-kit-banner-txt');
  if (banner) { banner.style.display = 'flex'; if (bannerTxt) bannerTxt.textContent = `Volver al kit: ${kitName}`; }
}

function _dupThumb(img, name, otherImg) {
  if (!img) return `<div class="dup-prod-ph">📦</div>`;
  const otherEsc = (otherImg || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<img src="${img}" alt="${_esc(name)}" loading="lazy" style="cursor:zoom-in" data-other="${otherEsc}" data-name="${_esc(name)}" onclick="_dupOpenZoom(this)">`;
}

function _dupOpenZoom(el) {
  const src = el.src;
  const otherSrc = el.dataset.other || '';
  if (otherSrc) {
    // Split view — reutiliza el overlay #cmp-zoom
    const za = document.getElementById('cmp-zoom-a');
    const zb = document.getElementById('cmp-zoom-b');
    if (za && zb) {
      za.innerHTML = `<img src="${src}" alt="">`;
      zb.innerHTML = `<img src="${otherSrc}" alt="">`;
      document.getElementById('cmp-zoom').classList.add('open');
      document.body.style.overflow = 'hidden';
      return;
    }
  }
  // Fallback: imagen única
  const overlay = document.createElement('div');
  overlay.id = 'qv-zoom';
  overlay.innerHTML = `<img src="${src}" alt=""><button onclick="document.getElementById('qv-zoom').remove()" title="Cerrar">✕</button>`;
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function _dupCard(p, pairKey, isMed, otherImg) {
  const createdStr = p.createdAt
    ? new Date(p.createdAt).toLocaleDateString('es-MX', {day:'numeric', month:'short', year:'numeric'})
    : null;
  return `
    <div class="dup-prod">
      ${_dupThumb(p.image, p.name, otherImg)}
      <div class="dup-prod-name">${_esc(p.name)}</div>
      <div class="dup-prod-meta">${_esc(p.categoryLabel || '—')} · $${(p.price||0).toLocaleString('es-MX')} · Stock ${p.stock}${p.createdBy ? `<span style="margin-left:6px;color:var(--muted);font-size:.78em">· 👤 ${_esc(_userNames[p.createdBy] || p.createdBy.split('@')[0])}</span>` : ''}</div>
      ${(p.barcode || createdStr) ? `<div class="dup-prod-meta" style="margin-top:2px">${p.barcode ? `<span>🔲 ${_esc(p.barcode)}</span>` : ''}${p.barcode && createdStr ? ' · ' : ''}${createdStr ? `<span>📅 ${createdStr}</span>` : ''}</div>` : ''}
      <div class="dup-prod-actions">
        <button class="btn btn-outline btn-sm" onclick="_openFormFromDup(${p.id})">${isMed ? 'Renombrar →' : 'Editar →'}</button>
        ${(!isMed && can.deleteProduct) ? `<button class="btn btn-sm" style="background:var(--red);color:#fff;border:none" onclick="_deleteDupProduct(${p.id},'${pairKey}')">Eliminar</button>` : ''}
      </div>
    </div>`;
}

function _dupRenderPair({ a, b, signals, pairKey, score }) {
  const isMed = score < 0.75;
  const cls   = isMed ? 'dup-med' : 'dup-high';
  const dot   = isMed ? 'amber' : 'red';
  return `
    <div class="dup-pair" id="dup-pair-${pairKey}">
      <div class="dup-signals-row">
        <div class="dup-signals ${cls}"><span class="dup-dot ${dot}"></span>${signals.join(' · ')}</div>
      </div>
      <div class="dup-pair-cols">${_dupCard(a, pairKey, isMed, b.image)}${_dupCard(b, pairKey, isMed, a.image)}</div>
      <button class="dup-dismiss" onclick="_dismissDupPair('${pairKey}')">
        ${isMed ? '✓ Los nombres ya son distintos — no volver a avisar' : '✓ Son productos distintos — no volver a avisar'}
      </button>
    </div>`;
}

function _renderDupReview() {
  const body = document.getElementById('dup-review-body');
  const pairs = _findDuplicatePairs();
  if (!pairs.length) {
    body.innerHTML = `<p style="text-align:center;padding:40px;color:var(--muted)">✓ Sin duplicados pendientes de revisión.</p>`;
    _updateDupBadge();
    return;
  }

  const high = pairs.filter(p => p.score >= 0.75);
  const med  = pairs.filter(p => p.score < 0.75);

  let html = '';
  if (high.length) {
    html += `<div class="dup-section-title"><span class="dup-dot red"></span>Probables duplicados — considera eliminar uno</div>`;
    html += high.map(_dupRenderPair).join('');
  }
  if (med.length) {
    html += `<div class="dup-section-title"><span class="dup-dot amber"></span>Nombres ambiguos — mejora el nombre para diferenciarlos</div>`;
    html += med.map(_dupRenderPair).join('');
  }
  body.innerHTML = html;
}

function _dismissDupPair(pairKey) {
  const set = _getDismissedDups();
  set.add(pairKey);
  _saveDismissedDups(set);
  // Buscar los nombres del par para el registro
  const [idA, idB] = pairKey.split('_').map(Number);
  const pa = products.find(p => p.id === idA), pb = products.find(p => p.id === idB);
  if (pa && pb) logActivity('duplicado_descartado',
    `Revisó y descartó par como distintos: "${pa.name}" / "${pb.name}"`,
    { id_a: idA, id_b: idB, name_a: pa.name, name_b: pb.name });
  document.getElementById(`dup-pair-${pairKey}`)?.remove();
  if (!document.querySelector('#dup-review-body .dup-pair')) {
    document.getElementById('dup-review-body').innerHTML =
      `<p style="text-align:center;padding:40px;color:var(--muted)">✓ Sin duplicados pendientes de revisión.</p>`;
  }
  _updateDupBadge();
  toast('Par descartado', 'success');
}

async function _deleteDupProduct(id, pairKey) {
  if (!can.deleteProduct) return;
  if (!confirm('¿Eliminar este producto? Tendrás 7 segundos para deshacer.')) return;
  const deleted = products.find(p => p.id === id);
  const deletedIdx = products.findIndex(p => p.id === id);
  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'DELETE', headers: { 'Prefer': 'return=minimal' }
  });
  if (!result.ok) { toast('Error al eliminar', 'error'); return; }
  if (deleted) logActivity('producto_eliminado', `Eliminó "${deleted.name}" (duplicado)`, { id, name: deleted.name, price: deleted.price });
  products = products.filter(p => p.id !== id);
  selectedIds.delete(id);
  renderTable();
  renderStats();
  _dismissDupPair(pairKey);
  toastUndo(`"${truncName(deleted?.name || 'Producto')}" eliminado`, async () => {
    if (!deleted) return;
    const r = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: deleted.id, name: deleted.name, category: deleted.category,
        category_label: deleted.categoryLabel, price: deleted.price,
        description: deleted.description, image: deleted.image,
        badge: deleted.badge, badge_type: deleted.badgeType,
        featured: deleted.featured, out_of_stock: deleted.outOfStock,
        original_price: deleted.originalPrice, barcode: deleted.barcode,
        stock: deleted.stock, position: deletedIdx, cost: deleted.cost,
        is_published: deleted.isPublished
      })
    });
    if (!r.ok) { toast('No se pudo restaurar', 'error'); return; }
    products.splice(deletedIdx, 0, deleted);
    const set = _getDismissedDups(); set.delete(pairKey); _saveDismissedDups(set);
    renderTable(); _updateDupBadge();
    toast(`"${truncName(deleted.name)}" restaurado ✓`, 'success');
  }, () => {
    const fileId = _driveFileId(deleted?.image);
    if (fileId) _deleteDriveFile(fileId);
  });
}

// SRP unificado con QV — el escaneo abre el mismo Quick View
function showScanResult(id) {
  TE?.track('scan_result', { id });
  openQV(id);
}
function clearScanResult() { closeQV(); }
function _srpRefresh(id)   { _qvRefresh(id); }
