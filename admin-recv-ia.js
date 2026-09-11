/* ══ RECEPCIÓN CON IA — PDF (Natura) o foto → matching contra catálogo →
   aplicar. Dos modos (_riaMode, elegido en la pantalla inicial, ver
   riaSetMode): "stock" (default — mercancía nueva: suma stock, actualiza
   costo/precio, puede crear productos nuevos) y "costOnly" (2026-09-06,
   ampliado 2026-09-11 — "Actualizar": para productos que YA existen, nunca
   toca stock ni precio de venta y nunca crea productos nuevos -- lo que no
   se vincula se omite. Escribe `cost` cuando el documento lo trae (factura
   vieja) y siempre `supplier_code` cuando hay match -- si el documento no
   trae costo (ej. una página de catálogo con solo el "Cod:" de cada
   producto), el campo de costo simplemente queda vacío y no se toca nada;
   nunca hizo falta un tercer modo separado para ese caso, "solo código" ya
   era "solo costos" sin dato de costo que aplicar. El modo "codeOnly"
   independiente que existió brevemente el 2026-09-11 se fusionó aquí el
   mismo día). El matching (nombre, código de proveedor aprendido, escáner,
   orden por categoría-guess) es el mismo motor en ambos modos.
   ══════════════════

   ✅ EN PRODUCCIÓN desde 2026-09-06 — "Aplicar cambios" escribe de verdad en
   Supabase. Migración supabase/migrations/20260902_01_supplier_code.sql ya
   ejecutada en el SQL Editor (confirmado por Eduardo: "Success. No rows
   returned"). Validado antes de este cambio: costo/cantidad deterministas,
   precio de venta prioriza revista, matching nunca autoselecciona por
   nombre (solo por código de proveedor aprendido), categoría de producto
   nuevo editable. Si algún día hace falta volver a modo de prueba (ej. para
   probar un cambio grande sin arriesgar el catálogo real), regresar esta
   constante a `true`. */
const _RIA_DRY_RUN = false;

let _riaItems  = [];  // [{supplierCode, rawName, qty, cost, suggestedPrice, categoryGuess, matchProductId, matchCandidates, isNew, priceToApply}]
let _riaKits   = [];  // [{raw_name, tu_pagas, components:[{name,matchProductId,matchManual,isNew,cost}]}] — promociones; los componentes SÍ se pueden vincular y costear, ver _riaNormalizeKit()
let _riaPhotos = [];  // [dataUrl] — fotos en cola antes de extraer (camino de foto)
let _riaDocTotal = null;     // "Total a pagar" del documento — solo para el chequeo de sanidad
let _riaMatchTargetIdx = null; // índice de _riaItems que el picker de vinculación está editando
let _riaMatchTargetKit = null; // {kitIdx,compIdx} cuando el picker abrió desde un componente de kit en vez de un renglón normal -- mutuamente excluyente con _riaMatchTargetIdx
let _riaKitsExpanded = false; // colapsado por default -- ver _riaToggleKitsSection()

// 'stock' (default, comportamiento de siempre — suma stock, actualiza costo
// y precio) vs. 'costOnly' ("Actualizar" en la UI — para productos que YA
// existen: nunca toca stock ni precio de venta, nunca crea productos nuevos.
// Escribe `cost` cuando el documento lo trae y siempre `supplier_code`
// cuando hay match; si no hay costo que extraer, ese campo se queda vacío
// sin romper nada -- por eso nunca hizo falta un tercer modo "solo código"
// aparte). Se elige en la pantalla inicial, antes de extraer, y no cambia a
// medio revisar — ver riaSetMode(). El matching (nombre, código de
// proveedor aprendido, escáner, categoría-guess para ordenar resultados) es
// EXACTAMENTE el mismo motor en ambos modos.
let _riaMode = 'stock';

/* ── Umbral de matching por nombre — solo decide qué se MUESTRA como
   candidato, nunca qué se autoselecciona (ver _riaMatchCatalog: un score
   alto puede venir de palabras genéricas compartidas por casi cualquier
   producto de la misma línea, no de que sea el producto correcto — probado
   en la práctica el 2026-09-05, no es un caso hipotético). ── */
const _RIA_MATCH_SHOW = 0.28; // score ≥ esto → se muestra como candidato

// La IA solo entrega los componentes de un kit como nombres sueltos (sin
// código de proveedor, sin precio individual -- la factura nunca lo da).
// Los envuelve aquí en el mismo tipo de objeto vinculable que un renglón
// normal, con el costo pre-cargado a un reparto parejo del total del kit
// (editable -- si Eduardo sabe que unos componentes valen más que otros,
// ajusta cada uno a mano). Idempotente: si ya viene en el formato nuevo
// (ej. al restaurar un borrador guardado después de este cambio), no lo
// vuelve a envolver.
function _riaNormalizeKit(k) {
  const rawComps = Array.isArray(k.components) ? k.components : [];
  const evenCost = (k.tu_pagas != null && rawComps.length)
    ? Math.round((Number(k.tu_pagas) / rawComps.length) * 100) / 100
    : null;
  return {
    raw_name: k.raw_name,
    tu_pagas: k.tu_pagas,
    components: rawComps.map(c => (typeof c === 'string'
      ? { name: c, matchProductId: null, matchManual: false, isNew: false, cost: evenCost }
      : c))
  };
}

// Componentes de kit que Eduardo sí decidió tocar (vinculó o marcó "producto
// nuevo") -- uno que se quedó en su estado default ("Vincular", sin tocar)
// se ignora por completo al aplicar, mismo criterio que un renglón normal
// sin vincular en modo costOnly: nunca se inventa nada sin decisión humana.
function _riaActionableKitComponents() {
  const out = [];
  for (let ki = 0; ki < _riaKits.length; ki++) {
    const comps = _riaKits[ki].components || [];
    for (let ci = 0; ci < comps.length; ci++) {
      const c = comps[ci];
      if (c.matchProductId || c.isNew) out.push({ kit: _riaKits[ki], comp: c });
    }
  }
  return out;
}

function _riaCatList() {
  return (typeof categories !== 'undefined' ? categories : []).map(c => `"${c.code}" (${c.label})`).join(', ');
}

function _riaTextPrompt() {
  return `Eres un asistente que extrae datos estructurados de una "Orden de surtido" de Natura México (documento de pedido para consultoras/revendedoras). El texto que recibes viene de extraer el contenido de un PDF con una tabla — el orden del texto puede venir alterado respecto a las columnas visuales, pero cada renglón de producto trae: un código numérico, una descripción en mayúsculas, cantidad pedida, cantidad enviada, valor en puntos, precio revista, valor total promocionado, valor sin IVA, descuento CN, y "tú pagas".

REGLAS:
1. Para cada producto normal (bajo la sección "Venta", con un código numérico y una descripción — NO un renglón que empiece con "KIT" o "Comp."), extrae exactamente estos campos crudos, SIN hacer ningún cálculo tú mismo:
   - "supplier_code": el código numérico del producto (ej. "1897")
   - "raw_name": la descripción tal cual aparece (ej. "BEIJO DE HUMOR EAU DE TOILETTE FEMENINA 75 ML")
   - "cant_pedida": número, cantidad pedida
   - "cant_enviada": número, cantidad enviada (puede ser igual a cant_pedida)
   - "precio_revista": número, el precio POR UNIDAD de la columna "Precio Revista"
   - "tu_pagas": número, el valor de la columna "Tú Pagas" (el total de ese renglón completo, no por unidad)
   - "category_guess": el código exacto de categoría que mejor le quede de esta lista: ${_riaCatList()}. "" si no tienes ninguna pista clara.
2. Los renglones que empiezan con "KIT" son promociones armadas con componentes ("Comp.") debajo — NO los proceses como productos individuales. SIEMPRE agrégalos a "kits_pendientes" con su descripción, la lista de nombres de sus componentes ("Comp."), y el valor de su propia columna "Tú Pagas" (el total de ese KIT) — nunca los descartes ni los omitas en silencio, aunque no tengan precio individual por componente. Es común que aparezcan VARIOS renglones "KIT" seguidos, cada uno con su propio "Comp." debajo — revísalos todos, uno por uno, de inicio a fin del fragmento antes de responder; omitir alguno (sobre todo los últimos) es un error frecuente y cuesta dinero real si pasa desapercibido.
3. Ignora POR COMPLETO la sección "Regalos" (al final del documento, productos sin precio) — nunca la incluyas.
4. Ignora encabezados de tabla, subtotales, información de crédito/pago/penalizaciones/deudas anteriores — solo extrae renglones de producto reales.
5. Si este fragmento contiene la línea "Total a pagar" (el total final de todo el pedido, generalmente cerca del final, después de "Subtotales"), extráelo en "total_documento". Si no aparece en este fragmento, usa null.
6. Si un número no es legible o no aparece, usa null en ese campo — nunca lo inventes.
7. NO hagas ninguna división ni cálculo de costo — solo extrae los números crudos tal cual aparecen en el documento. El costo por unidad se calcula después, fuera de tu respuesta.
8. Tu respuesta SIEMPRE debe incluir las claves "items", "kits_pendientes" y "total_documento", aunque alguna quede vacía o en null.

Responde con un objeto JSON exactamente así:
{"items":[{"supplier_code":"1897","raw_name":"BEIJO DE HUMOR EAU DE TOILETTE FEMENINA 75 ML","cant_pedida":2,"cant_enviada":2,"precio_revista":375,"tu_pagas":491.38,"category_guess":"natura_perfumes"}],"kits_pendientes":[{"raw_name":"PROMO EXCLUSIVA DEOS EN CREMA","components":["TODODIA DES CRM ALGODAO INVIS 80ML MEX","TODODIA DES CRM AVELA CAS INVIS 80ML MEX"],"tu_pagas":182.70}],"total_documento":7230.13}`;
}

function _riaVisionPrompt() {
  return `Eres un asistente que lee la FOTO de una hoja de pedido de un proveedor (Natura, Avon u otro similar) para una consultora/revendedora de belleza en México. La hoja es una tabla con columnas típicas: código de producto, descripción, cantidad pedida, cantidad enviada, precio de catálogo/revista (por unidad, lo que se le podría cobrar al público), y el total que paga la consultora por ese renglón — aunque el formato exacto puede variar según el proveedor.

REGLAS:
1. Para cada renglón de producto real (código y/o descripción, con cantidad y algún precio), extrae exactamente estos campos crudos, SIN hacer ningún cálculo tú mismo:
   - "supplier_code": el código del producto tal cual aparece; null si no hay código visible
   - "raw_name": la descripción del producto
   - "cant_pedida": número, cantidad pedida
   - "cant_enviada": número, cantidad enviada (si no se distingue de la pedida, usa el mismo valor)
   - "precio_revista": número, el precio de catálogo/revista POR UNIDAD; null si no aparece
   - "tu_pagas": número, el TOTAL que paga la consultora por ese renglón completo (no por unidad); null si la hoja no trae un total por renglón
   - "costo_unitario": número, úsalo SOLO si la hoja trae directamente un costo por unidad y no un total por renglón; null en cualquier otro caso
   - "category_guess": el código exacto de categoría que mejor le quede de esta lista: ${_riaCatList()}. "" si no tienes ninguna pista clara.
2. Si hay renglones tipo "KIT"/promoción con componentes agrupados debajo sin precio individual propio, NO los proceses como productos individuales — agrégalos a "kits_pendientes" con su descripción, los nombres de sus componentes, y su propio total (columna tipo "Tú Pagas" o similar) si es visible; null si no. Es común que aparezcan VARIOS renglones "KIT" seguidos, cada uno con sus propios componentes debajo — revísalos todos, uno por uno, de inicio a fin de la foto antes de responder; omitir alguno (sobre todo los últimos) es un error frecuente y cuesta dinero real si pasa desapercibido.
3. Ignora regalos/muestras sin precio, totales, información de crédito/pago/penalizaciones — solo extrae renglones de producto reales.
4. Si la foto muestra un total general del pedido completo (ej. "Total a pagar"), extráelo en "total_documento"; null si no se ve.
5. Si un número no es legible o falta, usa null — nunca lo inventes.
6. NO hagas ninguna división ni cálculo — solo extrae los números tal cual aparecen en la foto.
7. Tu respuesta SIEMPRE debe incluir las claves "items", "kits_pendientes" y "total_documento", aunque alguna quede vacía o en null.

Responde con un objeto JSON exactamente así:
{"items":[{"supplier_code":"1897","raw_name":"...","cant_pedida":2,"cant_enviada":2,"precio_revista":375,"tu_pagas":491.38,"costo_unitario":null,"category_guess":""}],"kits_pendientes":[{"raw_name":"...","components":["...","..."],"tu_pagas":null}],"total_documento":null}`;
}

/* ── Estado del overlay — un solo dispatcher para las 5 vistas ── */
function _riaShowState(state) {
  const ids = { choice: 'ria-upload-step', photos: 'ria-photo-stage', status: 'ria-status', review: 'ria-review-step', result: 'ria-result-step' };
  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === state ? 'flex' : 'none';
  });
  const footer = document.getElementById('ria-review-footer');
  if (footer) footer.style.display = state === 'review' ? 'flex' : 'none';
}

function _riaSetStatus(msg) {
  _riaShowState('status');
  document.getElementById('ria-status-msg').textContent = msg;
}

/* ── Overlay ── */
function openRecvIaMode() {
  if (!can.useReceptionIA) { toast('Sin permiso para usar Recepción con IA', 'error'); return; }
  document.getElementById('recv-ia-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (_riaTryRestoreDraft()) {
    // Recalcula solo lo que el usuario no había decidido a mano — así un
    // borrador viejo se beneficia de mejoras al algoritmo (o cambios en el
    // catálogo) sin perder los vínculos que ya habías confirmado.
    _riaMatchCatalog();
    _renderRecvIaReview();
  } else {
    resetRecvIa();
  }
}

function closeRecvIaMode() {
  document.getElementById('recv-ia-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function resetRecvIa() {
  _riaItems = [];
  _riaKits = [];
  _riaKitsExpanded = false;
  _riaPhotos = [];
  _riaDocTotal = null;
  _riaClearDraft();
  _riaShowState('choice');
  _riaRenderChoiceUndoBanner();
  // Siempre vuelve al modo default ("recibiendo mercancía") al empezar de
  // nuevo — que el modo "solo costos" sobreviviera solo por accidente entre
  // sesiones sería justo el tipo de sorpresa silenciosa que hay que evitar
  // (aplicar de más o de menos sin darte cuenta de en qué modo estabas).
  riaSetMode('stock');
  const pdfInput = document.getElementById('ria-pdf-input');
  const photoInput = document.getElementById('ria-photo-input');
  if (pdfInput) pdfInput.value = '';
  if (photoInput) photoInput.value = '';
}

// Se elige en la pantalla inicial, antes de subir el documento — nunca a
// medio revisar (los botones de modo solo existen en #ria-upload-step).
function riaSetMode(mode) {
  _riaMode = mode;
  const stockBtn = document.getElementById('ria-mode-stock');
  const costBtn = document.getElementById('ria-mode-costonly');
  if (stockBtn) stockBtn.classList.toggle('active', mode === 'stock');
  if (costBtn) costBtn.classList.toggle('active', mode === 'costOnly');
  const hint = document.getElementById('ria-upload-hint');
  if (hint) {
    hint.innerHTML = mode === 'costOnly'
      ? 'Para productos que ya existen: actualiza <strong>costo</strong> (si el documento lo trae) y <strong>código de proveedor</strong>. No toca stock ni precio, y no crea productos nuevos.'
      : '¿Prefieres sumar stock a mano? Usa <a href="#" onclick="event.preventDefault();closeRecvIaMode();openRecvMode()">Recibir mercancía</a>.';
  }
}

/* ── Deshacer la última recepción aplicada — a propósito NO es el toast de
   7 segundos que ya usa el resto de Inventario (Duplicar/Archivar): Eduardo
   pidió explícitamente más tiempo, porque uno puede darse cuenta del error
   minutos u horas después, no solo en los segundos siguientes. Vive en
   localStorage (sobrevive cerrar el overlay o recargar la página) y solo
   se invalida cuando: (1) el usuario ya lo usó, o (2) se aplica OTRA
   recepción real después — solo el lote más reciente se puede deshacer,
   nunca un historial completo. Deliberadamente NO intenta detectar si algo
   más tocó estos productos mientras tanto (edición manual en Inventario,
   otra recepción de otro flujo) — sería mucho más complejo y frágil; en vez
   de eso, el propio botón avisa ese riesgo en el confirm() antes de actuar,
   y quien deshace decide con esa información. ── */
const _RIA_UNDO_KEY = 'te_ria_last_undo';

function _riaSaveUndoSnapshot(updated, created) {
  if (!updated.length && !created.length) { _riaClearUndoSnapshot(); return; }
  try {
    localStorage.setItem(_RIA_UNDO_KEY, JSON.stringify({ appliedAt: Date.now(), updated, created }));
  } catch { /* localStorage lleno o no disponible — no bloquea el flujo, solo no habrá deshacer */ }
}

function _riaClearUndoSnapshot() {
  try { localStorage.removeItem(_RIA_UNDO_KEY); } catch {}
}

function _riaLoadUndoSnapshot() {
  try {
    const raw = localStorage.getItem(_RIA_UNDO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _riaAgeLabel(ts) {
  const ageMin = Math.round((Date.now() - ts) / 60000);
  return ageMin < 1 ? 'hace un momento' : ageMin < 60 ? `hace ${ageMin} min` : `hace ${Math.round(ageMin / 60)} h`;
}

// Banner en la pantalla inicial (elegir PDF/foto) — para cuando ya se cerró
// el resultado de la recepción, o incluso se cerró el overlay por completo,
// y solo hasta después se nota el error.
function _riaRenderChoiceUndoBanner() {
  const el = document.getElementById('ria-undo-banner');
  if (!el) return;
  const snap = _riaLoadUndoSnapshot();
  if (!snap) { el.innerHTML = ''; return; }
  const n = snap.updated.length + snap.created.length;
  el.innerHTML = `
<div class="ria-undo-card">
  <span>Tu última recepción con IA (${n} producto${n !== 1 ? 's' : ''}, aplicada ${_riaAgeLabel(snap.appliedAt)}) se puede deshacer.</span>
  <button class="ria-undo-btn" onclick="riaUndoLastApply()">↩ Deshacer esa recepción</button>
</div>`;
}

async function riaUndoLastApply() {
  const snap = _riaLoadUndoSnapshot();
  if (!snap) return;
  const n = snap.updated.length + snap.created.length;
  const ok = confirm(
    `¿Deshacer la recepción aplicada ${_riaAgeLabel(snap.appliedAt)} (${n} producto${n !== 1 ? 's' : ''})?\n\n` +
    `Se restará el stock que sumó, y costo/precio/código de proveedor regresan a como estaban antes. Los productos nuevos que creó se archivan (no se borran — quedan reversibles desde "📦 Archivados").\n\n` +
    `Si desde entonces editaste estos productos por otro lado (Inventario, otra recepción), esos cambios también se perderían.`
  );
  if (!ok) return;

  let okCount = 0, failCount = 0;
  for (const u of snap.updated) {
    try {
      const product = (products || []).find(p => p.id === u.productId);
      // Resta por DIFERENCIA, no por valor absoluto — si alguien vendió parte
      // de este stock en Caja mientras tanto, esa venta real no se borra.
      const currentStock = product ? product.stock : null;
      const newStock = currentStock != null ? Math.max(0, currentStock - u.deltaQty) : null;
      const payload = { cost: u.before.cost, price: u.before.price, supplier_code: u.before.supplierCode };
      if (newStock != null) { payload.stock = newStock; payload.out_of_stock = newStock > 0 ? false : true; }
      const r = await supabaseApi(`products?id=eq.${u.productId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('fail');
      if (product) {
        if (newStock != null) { product.stock = newStock; product.outOfStock = payload.out_of_stock; }
        product.cost = payload.cost;
        product.price = payload.price;
        product.supplierCode = payload.supplier_code;
      }
      okCount++;
    } catch { failCount++; }
  }
  for (const c of snap.created) {
    try {
      const r = await supabaseApi(`products?id=eq.${c.productId}`, { method: 'PATCH', body: JSON.stringify({ is_archived: true, is_published: false, out_of_stock: true }) });
      if (!r.ok) throw new Error('fail');
      const product = (products || []).find(p => p.id === c.productId);
      if (product) { product.isArchived = true; product.isPublished = false; product.outOfStock = true; }
      okCount++;
    } catch { failCount++; }
  }

  renderTable();
  renderStats();
  logActivity('recepcion_ia_deshecha',
    `Deshizo una recepción con IA: ${okCount} revertido${okCount !== 1 ? 's' : ''}${failCount ? `, ${failCount} con error` : ''}`,
    { reverted: okCount, failed: failCount });
  _riaClearUndoSnapshot();
  toast(failCount ? `Deshecho con ${failCount} error(es) — revisa esos productos a mano` : 'Recepción deshecha', failCount ? 'error' : 'success');
  _riaRenderChoiceUndoBanner();
  const resultUndoEl = document.getElementById('ria-result-undo');
  if (resultUndoEl) resultUndoEl.innerHTML = '';
}

/* ── Guardado automático — sobrevive a un cierre accidental o un recargue
   de página. Solo protege la lista ya extraída (lo caro de rehacer, por el
   límite de tokens de Groq) — no las fotos en cola, que son baratas de
   retomar con solo volver a fotografiar. ── */
const _RIA_DRAFT_KEY = 'te_ria_draft';
let _riaSaveDraftTimer = null;

function _riaSaveDraft() {
  if (!_riaItems.length && !_riaKits.length) { _riaClearDraft(); return; }
  try {
    localStorage.setItem(_RIA_DRAFT_KEY, JSON.stringify({
      items: _riaItems, kits: _riaKits, docTotal: _riaDocTotal, mode: _riaMode, savedAt: Date.now()
    }));
  } catch { /* localStorage lleno o no disponible — no bloquea el flujo */ }
}

function _riaSaveDraftDebounced() {
  clearTimeout(_riaSaveDraftTimer);
  _riaSaveDraftTimer = setTimeout(_riaSaveDraft, 600);
}

function _riaClearDraft() {
  try { localStorage.removeItem(_RIA_DRAFT_KEY); } catch {}
}

function _riaTryRestoreDraft() {
  let raw;
  try { raw = localStorage.getItem(_RIA_DRAFT_KEY); } catch { return false; }
  if (!raw) return false;
  let draft;
  try { draft = JSON.parse(raw); } catch { _riaClearDraft(); return false; }
  if (!draft || !draft.items || !draft.items.length) { _riaClearDraft(); return false; }

  const ageMin = Math.round((Date.now() - (draft.savedAt || 0)) / 60000);
  const ageLabel = ageMin < 1 ? 'hace un momento' : ageMin < 60 ? `hace ${ageMin} min` : `hace ${Math.round(ageMin / 60)} h`;
  const wantsRestore = confirm(`Tienes un pedido sin terminar (${draft.items.length} productos, guardado ${ageLabel}).\n\n¿Continuar donde lo dejaste?\n\n(Cancelar = empezar de nuevo, se descarta ese avance)`);
  if (!wantsRestore) { _riaClearDraft(); return false; }

  _riaItems = draft.items;
  _riaKits = (draft.kits || []).map(_riaNormalizeKit);
  _riaDocTotal = draft.docTotal ?? null;
  // 'codeOnly' ya no existe (fusionado en 'costOnly' el mismo día que se
  // creó) -- un borrador guardado en esa ventana breve cae a 'costOnly', su
  // equivalente más cercano, en vez de perderse o caer al modo por default.
  _riaMode = (draft.mode === 'costOnly' || draft.mode === 'codeOnly') ? 'costOnly' : 'stock';
  return true;
}

// Avisa antes de salir/recargar si hay trabajo de vinculación sin terminar
// y visible en pantalla — el guardado automático ya lo protege, pero es
// mejor evitar la salida accidental que tener que restaurarla después.
window.addEventListener('beforeunload', function (e) {
  const overlay = document.getElementById('recv-ia-overlay');
  if (overlay && overlay.style.display === 'flex' && _riaItems.length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ── Camino PDF (Natura — texto real, sin visión) ── */
async function handleRecvIaPdf(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf') { toast('Selecciona un archivo PDF', 'error'); return; }
  try {
    _riaSetStatus('Leyendo el PDF…');
    await _loadPdfJs();
    const text = await _extractPdfText(file);
    if (!text.trim()) throw new Error('No se pudo leer texto del PDF — ¿es un escaneo sin texto?');

    // Groq (tier gratuito) limita tokens por minuto — un pedido completo no
    // cabe en una sola llamada, así que se procesa en fragmentos.
    const chunks = _riaChunkText(text, 5000);
    const allItems = [];
    const allKits = [];
    let docTotal = null;
    for (let i = 0; i < chunks.length; i++) {
      _riaSetStatus(chunks.length > 1 ? `Extrayendo con IA (${i + 1}/${chunks.length})…` : 'Extrayendo productos con IA…');
      // Más margen de tokens que el resto de usos de IA del proyecto
      // (2026-09-11) -- un pedido con varios productos Y varios kits de
      // promoción puede dividirse en un fragmento que le toque casi puros
      // renglones "KIT" al final, sin la tabla completa a la vista;
      // confirmado contra una factura real de Natura que la IA perdía 2-3 de
      // 5 kits de forma inconsistente entre corridas (los 16 productos
      // normales siempre salían bien, solo los kits, que van al final del
      // JSON de respuesta). Reforzado también con la instrucción explícita
      // de abajo. `reasoningEffort:'default'` se probó el mismo día y se
      // revirtió de inmediato -- rompía el modo JSON estricto de este modelo
      // (Groq devolvía "Failed to validate JSON", confirmado en producción
      // por Eduardo) -- se queda en 'none' (el default de _groqTextJson) y
      // NO reintentar subirlo sin poder probarlo primero.
      const result = await _riaCallGroq(() => _groqTextJson(chunks[i], {
        systemPrompt: _riaTextPrompt(),
        userPrompt: 'Extrae los renglones de producto de este fragmento del pedido según las reglas de arriba — es un fragmento del documento completo, puede empezar o terminar a mitad de una sección. Presta especial atención a los renglones "KIT": revisa el fragmento completo de inicio a fin y no omitas ninguno, aunque haya varios seguidos o el fragmento termine justo después del último.',
        maxCompletionTokens: 3000
      }));
      allItems.push(...(result.items || []));
      allKits.push(...(result.kits_pendientes || []));
      if (docTotal == null && result.total_documento != null) docTotal = Number(result.total_documento);
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2500));
    }

    _riaItems = allItems.map(_riaComputeItem).filter(Boolean);
    _riaKits = allKits.filter(k => k && k.raw_name).map(_riaNormalizeKit);
    _riaDocTotal = (docTotal != null && !isNaN(docTotal)) ? docTotal : null;
    console.log('[Recepción IA] fragmentos:', chunks.length, '· productos:', _riaItems.length, '· kits:', _riaKits.length, '· total documento:', _riaDocTotal);
    if (!_riaItems.length && !_riaKits.length) throw new Error('La IA no encontró productos en este PDF');
    _riaMatchCatalog();
    _renderRecvIaReview();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    resetRecvIa();
  }
}

// Groq (tier gratuito) puede responder "límite temporal" (429) si varias
// llamadas seguidas suman más tokens de los permitidos por minuto — en vez
// de fallar de inmediato, espera y reintenta un par de veces.
async function _riaCallGroq(fn, { retries = 2, delayMs = 15000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = /límite temporal/.test(err.message || '');
      if (isRateLimit && attempt < retries) {
        _riaSetStatus(`Groq pidió esperar — reintentando en ${Math.round(delayMs / 1000)}s…`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}

// Divide el texto en fragmentos que quepan cómodamente en el límite de
// tokens por minuto de Groq, cortando siempre entre renglones completos
// gracias a que _extractPdfText ya reconstruye saltos de línea reales.
// Un renglón "KIT" y sus "Comp." siguientes se agrupan primero en un solo
// bloque atómico que nunca se separa entre dos fragmentos — si un "Comp."
// queda huérfano de su KIT en el fragmento equivocado, la IA no tiene forma
// de saber a qué promoción pertenece y lo descarta.
function _riaChunkText(text, maxChunkChars = 5000) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*KIT\b/i.test(line)) {
      let block = line;
      while (i + 1 < lines.length && /^\s*Comp\.?\b/i.test(lines[i + 1])) {
        i++;
        block += '\n' + lines[i];
      }
      blocks.push(block);
    } else {
      blocks.push(line);
    }
  }
  const chunks = [];
  let current = '';
  for (const block of blocks) {
    if (current && current.length + block.length + 1 > maxChunkChars) {
      chunks.push(current);
      current = block;
    } else {
      current += (current ? '\n' : '') + block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function _loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
      resolve();
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function _extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += _riaItemsToLines(content.items) + '\n\n';
  }
  return _riaTrimPdfText(text);
}

// pdf.js entrega cada fragmento de texto por separado, sin indicar dónde
// termina un renglón visual de la tabla — hay que reconstruirlo agrupando
// por posición vertical (Y). Sin esto, una página completa llega como una
// sola línea gigantesca y no hay forma de partirla sin cortar un producto
// a la mitad.
function _riaItemsToLines(items) {
  const rows = [];
  const TOL = 2; // tolerancia en unidades PDF para considerar "misma línea"
  items.forEach(it => {
    const y = it.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < TOL);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x: it.transform[4], str: it.str });
  });
  rows.sort((a, b) => b.y - a.y); // arriba → abajo
  return rows.map(r => r.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(' ')).join('\n');
}

// pdf.js extrae el PDF completo, incluyendo bloques que no aportan nada al
// pedido (deudas anteriores, cuotas, resumen de cajas, métodos de pago) y
// que pueden pesar tanto o más que la tabla real de productos. Recortarlos
// reduce el tamaño de lo que se manda a Groq y le quita ruido a la extracción.
function _riaTrimPdfText(text) {
  let out = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const cutMarkers = [/Deudas Anteriores/i, /Resumen de Cajas/i, /PAGO REFLEJADO AL MOMENTO/i];
  for (const marker of cutMarkers) {
    const m = out.match(marker);
    if (m && m.index > 0) out = out.slice(0, m.index);
  }
  const MAX_CHARS = 20000;
  if (out.length > MAX_CHARS) {
    toast('El PDF es muy grande — se analizó solo la primera parte', '');
    out = out.slice(0, MAX_CHARS);
  }
  return out.trim();
}

/* ── Camino foto (cuando solo hay el papel — Avon u otro proveedor) ── */
function handleRecvIaPhoto(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Selecciona una imagen', 'error'); return; }
  _riaAddPhoto(file);
}

async function _riaAddPhoto(file) {
  let dataUrl;
  try {
    dataUrl = await _riaResizePhoto(file);
  } catch {
    toast('Error al procesar la foto', 'error');
    return;
  }
  _riaPhotos.push(dataUrl);
  _renderRiaPhotoStage();
}

// Resolución más alta que las fotos de producto (900px) — aquí se fotografía
// una tabla de texto denso, no un objeto, y necesita quedar legible.
function _riaResizePhoto(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function riaRemovePhoto(idx) {
  _riaPhotos.splice(idx, 1);
  _renderRiaPhotoStage();
}

function _renderRiaPhotoStage() {
  if (!_riaPhotos.length) { _riaShowState('choice'); return; }
  _riaShowState('photos');
  document.getElementById('ria-photo-thumbs').innerHTML = _riaPhotos.map((dataUrl, idx) => `
<div class="ria-photo-thumb">
  <img src="${dataUrl}" alt="">
  <button onclick="riaRemovePhoto(${idx})" title="Quitar">✕</button>
  <span class="ria-photo-num">${idx + 1}</span>
</div>`).join('');
}

async function recvIaExtractPhotos() {
  if (!_riaPhotos.length) return;
  const total = _riaPhotos.length;
  try {
    const allItems = [];
    const allKits = [];
    let docTotal = null;
    for (let i = 0; i < total; i++) {
      _riaSetStatus(total > 1 ? `Leyendo foto ${i + 1} de ${total}…` : 'Leyendo foto con IA…');
      // Mismo ajuste que en el camino de PDF (ver handleRecvIaPdf) -- más
      // margen de tokens e insistencia explícita en no saltarse ningún
      // "KIT", por el mismo problema confirmado contra una factura real
      // (kits perdidos de forma inconsistente, casi siempre los últimos en
      // aparecer en la hoja). `reasoningEffort` se queda en 'none' -- subirlo
      // a 'default' rompe el modo JSON estricto de este modelo (confirmado
      // en producción el mismo día, ver el comentario en handleRecvIaPdf).
      const result = await _riaCallGroq(() => _groqVisionJson(_riaPhotos[i], {
        systemPrompt: _riaVisionPrompt(),
        userPrompt: 'Extrae los renglones de producto de esta foto según las reglas de arriba. Presta especial atención a los renglones "KIT": revisa la foto completa de inicio a fin y no omitas ninguno, aunque haya varios seguidos.',
        maxCompletionTokens: 3000
      }));
      allItems.push(...(result.items || []));
      allKits.push(...(result.kits_pendientes || []));
      if (docTotal == null && result.total_documento != null) docTotal = Number(result.total_documento);
      if (i < total - 1) await new Promise(r => setTimeout(r, 2500));
    }
    _riaItems = allItems.map(_riaComputeItem).filter(Boolean);
    _riaKits = allKits.filter(k => k && k.raw_name).map(_riaNormalizeKit);
    _riaDocTotal = (docTotal != null && !isNaN(docTotal)) ? docTotal : null;
    if (!_riaItems.length && !_riaKits.length) throw new Error('La IA no encontró productos en las fotos');
    _riaMatchCatalog();
    _renderRecvIaReview();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    _renderRiaPhotoStage(); // conserva las fotos ya tomadas para reintentar
  }
}

/* Costo por unidad se calcula aquí (no por la IA) — aritmética determinista.
   Usa cant. enviada cuando existe (lo que realmente llegó); si no, cant.
   pedida. Prioriza "tu_pagas" (total del renglón ÷ cantidad); si la hoja
   solo trae un costo unitario directo (foto de otro proveedor), lo usa tal cual. */
function _riaComputeItem(raw) {
  if (!raw || !raw.raw_name) return null;
  const cantPedida = Number(raw.cant_pedida) || 0;
  const cantEnviada = Number(raw.cant_enviada) || 0;
  const qty = cantEnviada > 0 ? cantEnviada : (cantPedida > 0 ? cantPedida : 1);
  const tuPagas = raw.tu_pagas != null ? Number(raw.tu_pagas) : null;
  let cost = null;
  if (tuPagas != null && !isNaN(tuPagas) && qty > 0) {
    cost = Math.round((tuPagas / qty) * 100) / 100;
  } else if (raw.costo_unitario != null) {
    const cu = Number(raw.costo_unitario);
    if (!isNaN(cu)) cost = Math.round(cu * 100) / 100;
  }
  // Precio de venta (revista) SÍ se redondea a pesos enteros -- Ofelia nunca
  // cobra centavos, aunque Natura sí los liste en su revista ($383.50). El
  // costo (arriba) es dato interno para calcular margen y se queda exacto,
  // nunca se redondea a entero.
  const suggestedPriceRaw = raw.precio_revista != null ? Number(raw.precio_revista) : null;
  const suggestedPrice = (suggestedPriceRaw != null && !isNaN(suggestedPriceRaw)) ? Math.round(suggestedPriceRaw) : null;
  return {
    supplierCode: raw.supplier_code ? String(raw.supplier_code) : null,
    rawName: String(raw.raw_name).trim(),
    qty,
    cost,
    suggestedPrice,
    categoryGuess: raw.category_guess || null,
    // se llenan en _riaMatchCatalog():
    matchProductId: null,
    matchCandidates: [],
    matchScore: null, // score del match automático por nombre — null si fue por código exacto o manual (ambos de confianza plena)
    isNew: true,
    priceToApply: null,
    matchManual: false // true solo si el usuario lo eligió a propósito (candidato/buscador/escáner) — nunca lo pisa un recálculo automático
  };
}

// Palabras que casi siempre distinguen dos variantes REALMENTE distintas del
// mismo producto base, aunque compartan casi todas las demás palabras
// genéricas ("Eau de Toilette 75ml", "Crema Nutritiva Nuez Pecán y Cacao").
// Se detectaron a partir de errores reales al probar: "Femenina" vs.
// "Masculino" (perfumes) y "Repuesto" vs. producto completo (cremas/geles
// sin envase, más baratos) — cada grupo canoniza sus variantes de escritura
// a una sola marca para no confundir "masculina"≠"masculino" como mismatch.
const _RIA_VARIANT_MARKERS = [
  { re: /\bmasculin[oa]\b/, tag: 'masculino' },
  { re: /\bfemenin[oa]\b/,  tag: 'femenino' },
  { re: /\brepuesto\b/,     tag: 'repuesto' },
  { re: /\brecarga\b/,      tag: 'recarga' }
];

function _riaMarkersOf(name) {
  const n = _normStr(name || '');
  return _RIA_VARIANT_MARKERS.filter(m => m.re.test(n)).map(m => m.tag);
}

// true si algún marcador aparece en un nombre pero no en el otro — señal
// fuerte de que son variantes distintas, sin importar cuántas palabras
// genéricas compartan.
function _riaMarkerMismatch(nameA, nameB) {
  const a = _riaMarkersOf(nameA), b = _riaMarkersOf(nameB);
  if (!a.length && !b.length) return false;
  return a.some(w => !b.includes(w)) || b.some(w => !a.includes(w));
}

/* ── Matching contra el catálogo — se puede llamar varias veces (ej. al
   restaurar un borrador) sin perder lo que el usuario ya decidió a mano. ── */
function _riaMatchCatalog() {
  _riaItems.forEach(it => {
    if (it.matchManual) return; // decisión del usuario — nunca se recalcula sola
    // 1) código de proveedor exacto — el más confiable, si ya se vinculó antes
    const codeMatch = it.supplierCode
      ? (products || []).find(p => p.supplierCode && String(p.supplierCode) === it.supplierCode)
      : null;
    if (codeMatch) {
      it.matchProductId = codeMatch.id;
      it.matchCandidates = [];
      it.matchScore = null; // código exacto — no es una suposición, no necesita score
      it.isNew = false;
      _riaUpdatePriceToApply(it);
      return;
    }
    // 2) similitud de nombre — mismo motor que la detección de duplicados.
    // Probado en la práctica (2026-09-05, caso real de Eduardo): palabras
    // genéricas que casi todos los perfumes comparten ("Frescor", "Eau de
    // Toilette", "Ekos") pesan tanto o más que la única palabra que de
    // verdad distingue el producto (el aroma — "Acai" vs "Maracujá"), así
    // que un score alto NO es evidencia confiable de que sea el producto
    // correcto. Por eso esto NUNCA autoselecciona — solo el código de
    // proveedor ya aprendido (punto 1, arriba) lo hace. Aquí solo se arma
    // la lista de candidatos para que una persona elija; el renglón
    // siempre arranca como "producto nuevo" hasta que alguien confirme uno
    // a mano (y a partir de ahí, la próxima vez con el mismo código de
    // proveedor sí sería un match aprendido y confiable).
    const scored = (products || [])
      .map(p => {
        let score = _wordSim(it.rawName, p.name);
        if (_riaMarkerMismatch(it.rawName, p.name)) score *= 0.2;
        return { id: p.id, name: p.name, price: p.price, image: p.image, score };
      })
      .filter(c => c.score >= _RIA_MATCH_SHOW)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    it.matchCandidates = scored;
    it.matchProductId = null;
    it.matchScore = null;
    it.isNew = true;
    _riaUpdatePriceToApply(it);
  });
}

// El precio que se va a aplicar arranca del precio de revista (el dato que
// trae el propio pedido, más confiable que un precio de catálogo que puede
// llevar meses sin tocarse) — Eduardo lo pidió así explícitamente el
// 2026-09-05 tras ver que se sugería el precio viejo del catálogo ($200) en
// vez del de revista ($383.50): Ofelia siempre puede editarlo, pero el punto
// de partida debe ser el dato más reciente, no el más viejo. Solo cuando el
// proveedor no trae precio de revista (ej. foto de otro proveedor sin esa
// columna) se usa el precio actual del producto ya vinculado como respaldo.
function _riaUpdatePriceToApply(it) {
  if (it.suggestedPrice != null) { it.priceToApply = it.suggestedPrice; return; }
  const matched = it.matchProductId ? (products || []).find(p => p.id === it.matchProductId) : null;
  it.priceToApply = matched ? matched.price : 0;
}

function riaSetMatch(idx, productId) {
  const it = _riaItems[idx];
  if (!it) return;
  it.matchProductId = productId;
  it.matchScore = null; // elegido a mano — no es una suposición del algoritmo
  it.isNew = false;
  it.matchManual = true;
  _riaUpdatePriceToApply(it);
  _renderRecvIaReview();
}

function riaSetMatchNew(idx) {
  const it = _riaItems[idx];
  if (!it) return;
  it.matchProductId = null;
  it.matchScore = null;
  it.isNew = true;
  it.matchManual = true;
  _riaUpdatePriceToApply(it);
  _renderRecvIaReview();
}

// Componentes de kit -- mismo par de acciones que riaSetMatch/riaSetMatchNew,
// pero sobre _riaKits[kitIdx].components[compIdx] en vez de _riaItems[idx].
// Sin priceToApply: la factura nunca da precio individual por componente, así
// que nunca se toca el precio de venta del producto vinculado, solo su costo.
function riaSetKitCompMatch(kitIdx, compIdx, productId) {
  const comp = _riaKits[kitIdx]?.components?.[compIdx];
  if (!comp) return;
  comp.matchProductId = productId;
  comp.isNew = false;
  comp.matchManual = true;
  _renderRecvIaReview();
}

function riaSetKitCompNew(kitIdx, compIdx) {
  const comp = _riaKits[kitIdx]?.components?.[compIdx];
  if (!comp) return;
  comp.matchProductId = null;
  comp.isNew = true;
  comp.matchManual = true;
  _renderRecvIaReview();
}

function riaUpdateKitCompCost(kitIdx, compIdx, value) {
  const comp = _riaKits[kitIdx]?.components?.[compIdx];
  if (!comp) return;
  const num = parseFloat(value);
  comp.cost = isNaN(num) ? null : num;
  _riaSaveDraftDebounced();
}

// Quitar el kit completo de la revisión -- para cuando no se quiere armar ese
// kit en absoluto (mismo criterio que riaRemoveItem con un renglón normal).
function riaRemoveKit(kitIdx) {
  _riaKits.splice(kitIdx, 1);
  _renderRecvIaReview();
}

/* ── Picker de vinculación manual — mismo patrón de buscador que Kit Builder.
   Ahora que ningún match se autoselecciona por nombre (2026-09-05), este
   picker es el camino principal para casi todos los renglones — de ahí las
   3 mejoras de agilidad de ese mismo día: (1) el header muestra qué renglón
   estás buscando, para no perderlo de vista entre 15-18 productos parecidos;
   (2) el buscador ordena primero por la categoría que ya adivinó la IA
   (nunca autoselecciona, solo reduce el scroll); (3) escanear código de
   barras — el método que Eduardo ya usa cuando tiene el producto físico en
   mano, más confiable que cualquier búsqueda por nombre — ahora también se
   puede iniciar directo desde la tarjeta, sin pasar por este picker. ── */
function riaOpenMatchPicker(idx) {
  _riaMatchTargetIdx = idx;
  _riaMatchTargetKit = null;
  const it = _riaItems[idx];
  const input = document.getElementById('ria-match-search-input');
  input.value = '';
  document.getElementById('ria-match-picker-results').innerHTML = '';
  const ctxEl = document.getElementById('ria-match-picker-context');
  if (ctxEl && it) {
    ctxEl.innerHTML = `${_esc(toTitleCase(it.rawName))}${it.supplierCode ? ` <span class="ria-mpc-code">· código ${_esc(it.supplierCode)}</span>` : ''}`;
  }
  // En "Actualizar" no tiene sentido crear un producto nuevo desde una
  // factura vieja o desde una página de catálogo (quedaría con stock=0 solo
  // para tener dónde poner el dato) — se oculta la salida de escape, el
  // renglón se omite si no se vincula a algo que ya existe.
  const newBtn = document.getElementById('ria-match-set-new-btn');
  if (newBtn) newBtn.style.display = _riaMode !== 'stock' ? 'none' : '';
  document.getElementById('ria-match-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => input.focus(), 200);
}

// Mismo picker que arriba, pero para un componente de kit (_riaKits[kitIdx]
// .components[compIdx]) en vez de un renglón normal -- riaConfirmMatch/
// riaConfirmSetNew despachan a uno u otro según cuál target esté activo.
function riaOpenKitCompPicker(kitIdx, compIdx) {
  _riaMatchTargetIdx = null;
  _riaMatchTargetKit = { kitIdx, compIdx };
  const kit = _riaKits[kitIdx];
  const comp = kit?.components?.[compIdx];
  const input = document.getElementById('ria-match-search-input');
  input.value = '';
  document.getElementById('ria-match-picker-results').innerHTML = '';
  const ctxEl = document.getElementById('ria-match-picker-context');
  if (ctxEl && comp) {
    ctxEl.innerHTML = `${_esc(toTitleCase(comp.name))} <span class="ria-mpc-code">· componente de "${_esc(toTitleCase(kit.raw_name || ''))}"</span>`;
  }
  const newBtn = document.getElementById('ria-match-set-new-btn');
  if (newBtn) newBtn.style.display = _riaMode !== 'stock' ? 'none' : '';
  document.getElementById('ria-match-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => input.focus(), 200);
}

function closeRiaMatchPicker() {
  document.getElementById('ria-match-overlay').style.display = 'none';
  document.body.style.overflow = '';
  _riaMatchTargetIdx = null;
  _riaMatchTargetKit = null;
}

// Escanear directo desde la tarjeta, sin abrir el picker primero — el
// escaneo no necesita buscador, así que forzar ese paso intermedio solo
// suma un toque innecesario al método que ya es el más confiable.
function riaOpenScannerFor(idx) {
  _riaMatchTargetIdx = idx;
  _riaMatchTargetKit = null;
  openRiaMatchScanner();
}

// Colapsado por default -- con muchos componentes por vincular (chip + botón
// de escaneo + costo por cada uno) esta sección puede volverse más alta que
// la lista de productos normales de arriba, quitándole protagonismo al flujo
// principal. El resumen del encabezado (armado en _renderRecvIaReview) sigue
// visible siempre, colapsado o no, para no esconder que falta vincular algo.
function _riaToggleKitsSection() {
  _riaKitsExpanded = !_riaKitsExpanded;
  const list = document.getElementById('ria-kits-list');
  const ico = document.getElementById('ria-kits-toggle-ico');
  if (list) list.style.display = _riaKitsExpanded ? 'block' : 'none';
  if (ico) ico.textContent = _riaKitsExpanded ? '▴' : '▾';
}

function riaOpenKitCompScanner(kitIdx, compIdx) {
  _riaMatchTargetIdx = null;
  _riaMatchTargetKit = { kitIdx, compIdx };
  openRiaMatchScanner();
}

function riaSearchMatchPicker(q) {
  const resultsEl = document.getElementById('ria-match-picker-results');
  const query = q.trim().toLowerCase();
  if (!query) { resultsEl.innerHTML = ''; return; }
  // La categoría que adivinó la IA para este renglón no es un match — sigue
  // siendo aventurada, no hay que confiar en ella a ciegas (mismo motivo por
  // el que ya no autoseleccionamos nada) — pero sí sirve para ORDENAR: si es
  // correcta, el producto que buscas aparece arriba sin scroll; si está
  // mal, no pierdes nada porque el resto de resultados sigue ahí debajo.
  const targetItem = _riaMatchTargetIdx != null ? _riaItems[_riaMatchTargetIdx] : null;
  const guessCat = targetItem ? targetItem.categoryGuess : null;
  const matches = (products || [])
    .filter(p => p.name.toLowerCase().includes(query))
    .sort((a, b) => (guessCat ? (a.category === guessCat ? 0 : 1) - (b.category === guessCat ? 0 : 1) : 0))
    .slice(0, 25);
  if (!matches.length) {
    resultsEl.innerHTML = '<div style="padding:14px;text-align:center;color:var(--muted);font-size:.82rem">Sin resultados</div>';
    return;
  }
  resultsEl.innerHTML = matches.map(p => `
<div class="ria-match-result-item" onclick="riaConfirmMatch(${p.id})">
  <img src="${_driveSz(p.image, 70)}" alt="" onerror="this.style.display='none'">
  <span class="ria-match-result-name">${_esc(p.name)}</span>
  <span class="ria-match-result-price">$${p.price}</span>
</div>`).join('');
}

// Si tienes el producto físico a la mano, escanear su código de barras es
// más confiable que comparar nombres — mismo escáner ya usado en el resto
// de Inventario/Caja (admin-scanner.js despacha por _scanCtx).
function openRiaMatchScanner() {
  _scanCtx = 'ria-match';
  document.getElementById('scanner-title').textContent = 'Escanear producto';
  _launchScanner();
}

function riaConfirmMatch(productId) {
  if (_riaMatchTargetKit) {
    riaSetKitCompMatch(_riaMatchTargetKit.kitIdx, _riaMatchTargetKit.compIdx, productId);
    closeRiaMatchPicker();
    return;
  }
  if (_riaMatchTargetIdx == null) return;
  riaSetMatch(_riaMatchTargetIdx, productId);
  closeRiaMatchPicker();
}

function riaConfirmSetNew() {
  if (_riaMatchTargetKit) {
    riaSetKitCompNew(_riaMatchTargetKit.kitIdx, _riaMatchTargetKit.compIdx);
    closeRiaMatchPicker();
    return;
  }
  if (_riaMatchTargetIdx == null) return;
  riaSetMatchNew(_riaMatchTargetIdx);
  closeRiaMatchPicker();
}

/* ── Vista previa de imagen al pasar el cursor (solo desktop/mouse — en
   mobile el buscador manual ya muestra miniatura de cada resultado) ── */
function _riaHoverAttrs(imageUrl) {
  if (!imageUrl) return '';
  const safeUrl = _esc(imageUrl).replace(/'/g, "\\'");
  return `onmouseenter="riaShowImgPreview(event,'${safeUrl}')" onmousemove="riaMoveImgPreview(event)" onmouseleave="riaHideImgPreview()"`;
}

function _riaGetImgPreviewEl() {
  let el = document.getElementById('ria-img-preview');
  if (!el) {
    el = document.createElement('img');
    el.id = 'ria-img-preview';
    document.body.appendChild(el);
  }
  return el;
}

function riaShowImgPreview(e, imageUrl) {
  if (!imageUrl) return;
  const el = _riaGetImgPreviewEl();
  el.src = _driveSz(imageUrl, 300);
  el.style.display = 'block';
  riaMoveImgPreview(e);
}

function riaMoveImgPreview(e) {
  const el = document.getElementById('ria-img-preview');
  if (!el || el.style.display === 'none') return;
  const SIZE = 150, PAD = 16;
  let x = e.clientX + PAD;
  let y = e.clientY + PAD;
  if (x + SIZE > window.innerWidth) x = e.clientX - SIZE - PAD;
  if (y + SIZE > window.innerHeight) y = e.clientY - SIZE - PAD;
  el.style.left = Math.max(4, x) + 'px';
  el.style.top = Math.max(4, y) + 'px';
}

function riaHideImgPreview() {
  const el = document.getElementById('ria-img-preview');
  if (el) el.style.display = 'none';
}

// El nombre extraído puede ser largo ("Repuesto Tododía Crema Nutritiva
// para Cuerpo 400ml Nuez Pecán y Cacao") — en vez de cortarlo a media
// palabra en un <input> de una sola línea, el campo crece verticalmente.
function _riaAutoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Mismo patrón de <optgroup> que el select del formulario de producto
// (renderCategorySelects() en admin.js) — reutiliza rootCats()/subCats() en
// vez de duplicar la estructura de categorías.
function _riaCategoryOptions(selectedCode) {
  const sel = selectedCode || 'por_revisar';
  let html = `<option value="por_revisar"${sel === 'por_revisar' ? ' selected' : ''}>📋 Por revisar</option>`;
  html += rootCats().filter(r => r.code !== 'por_revisar').map(r => {
    const subs = subCats(r.code);
    const rootOpt = `<option value="${r.code}"${sel === r.code ? ' selected' : ''}>${_esc(r.label)}${subs.length ? ' — General' : ''}</option>`;
    const subOpts = subs.map(s => `<option value="${s.code}"${sel === s.code ? ' selected' : ''}>${_esc(s.label)}</option>`).join('');
    return subs.length ? `<optgroup label="${_esc(r.label)}">${rootOpt}${subOpts}</optgroup>` : rootOpt;
  }).join('');
  return html;
}

function riaUpdateCategory(idx, code) {
  const it = _riaItems[idx];
  if (!it) return;
  it.categoryGuess = code || null;
  _riaSaveDraftDebounced();
}

/* ── Lista editable + matching (compartida por ambos orígenes) ── */
function _renderRecvIaReview() {
  _riaShowState('review');

  // "costOnly" ("Actualizar" en la UI) nunca crea productos nuevos -- lo
  // que no se vincula se omite.
  const neverCreates = _riaMode === 'costOnly';
  const linked = _riaItems.filter(it => it.matchProductId).length;
  const nuevos = _riaItems.length - linked;
  document.getElementById('ria-review-count').textContent = neverCreates
    ? `${_riaItems.length} producto${_riaItems.length !== 1 ? 's' : ''} · ${linked} vinculado${linked !== 1 ? 's' : ''} · ${nuevos} sin vincular (se omite${nuevos !== 1 ? 'n' : ''})`
    : `${_riaItems.length} producto${_riaItems.length !== 1 ? 's' : ''} · ${linked} vinculado${linked !== 1 ? 's' : ''} · ${nuevos} nuevo${nuevos !== 1 ? 's' : ''}`;

  _renderRiaSummary();

  document.getElementById('ria-items-list').innerHTML = _riaItems.map((it, idx) => {
    const matched = it.matchProductId ? (products || []).find(p => p.id === it.matchProductId) : null;
    const matchImgAttr = matched ? _riaHoverAttrs(matched.image) : '';
    // El score solo existe para un match automático por nombre (nunca por
    // código exacto ni por elección manual) — es justo el caso donde puede
    // estar mal, así que se muestra siempre en el chip en vez de esconderse
    // detrás de un ✓ que se ve igual de seguro sea cual sea el origen del match.
    const scoreLabel = (matched && !it.matchManual && it.matchScore != null) ? ` · ${Math.round(it.matchScore * 100)}%` : '';
    const matchChip = matched
      ? `<button class="ria-match-chip ria-match-linked" onclick="riaOpenMatchPicker(${idx})" title="¿No es este producto? Toca para cambiarlo" ${matchImgAttr}>✓ <span>${_esc(matched.name)}${scoreLabel}</span></button>`
      : neverCreates
        ? `<button class="ria-match-chip ria-match-newchip" onclick="riaOpenMatchPicker(${idx})">Vincular (o quitar)</button>`
        : `<button class="ria-match-chip ria-match-newchip" onclick="riaOpenMatchPicker(${idx})">+ Producto nuevo</button>`;
    // Escanear el código de barras del producto físico es más confiable que
    // cualquier búsqueda por nombre (Eduardo ya lo usa así) — un ícono
    // directo en la tarjeta evita tener que abrir el picker solo para llegar
    // a ese botón cuando ya se tiene el producto en la mano.
    const scanBtn = `<button class="ria-scan-icon-btn" onclick="riaOpenScannerFor(${idx})" title="Tengo el producto — escanear código de barras"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14"/><path d="M7 5v14"/><path d="M11 5v14"/><path d="M14 5v14"/><path d="M18 5v14"/><path d="M21 5v14"/></svg></button>`;
    // Las alternativas se quedan visibles aunque ya haya un match preseleccionado
    // (solo se ocultan si el usuario ya lo confirmó a mano) — un match por
    // nombre es una suposición, nunca un hecho, y la corrección debe ser tan
    // fácil como tocar el candidato correcto, sin tener que abrir el buscador.
    const otherCandidates = it.matchCandidates.filter(c => c.id !== it.matchProductId);
    const candidatesHtml = (!it.matchManual && otherCandidates.length)
      ? `<div class="ria-match-candidates"><span class="ria-match-cand-label">${matched ? '¿No es este? Prueba:' : '¿O tal vez?'}</span>${otherCandidates.map(c => `<button class="ria-match-cand-btn" onclick="riaSetMatch(${idx},${c.id})" ${_riaHoverAttrs(c.image)}>${_esc(c.name)} · ${Math.round(c.score * 100)}%</button>`).join('')}</div>`
      : '';
    // El hint junto al precio muestra el precio ACTUAL del producto vinculado
    // cuando difiere del que se va a aplicar — además de servir de referencia,
    // una diferencia enorme (ej. $200 vs $383.50) es en sí misma una señal de
    // que el match de arriba puede estar equivocado. Sin match (producto
    // nuevo), muestra el precio de revista si el usuario lo editó a mano.
    const suggHint = (matched && Number(it.priceToApply) !== Number(matched.price))
      ? ` <span class="ria-sugg-hint">(catálogo: $${matched.price})</span>`
      : (!matched && it.suggestedPrice != null && Number(it.priceToApply) !== Number(it.suggestedPrice))
        ? ` <span class="ria-sugg-hint">(sug. $${it.suggestedPrice})</span>` : '';
    // En modo "solo costos" nunca se toca el precio de venta, así que el
    // riesgo real no es "vas a vender perdiendo con el precio que estás por
    // escribir" (no hay ninguno) sino "el costo que la factura vieja revela
    // ya es MAYOR que el precio actual del producto" — es decir, esta
    // factura acaba de descubrir que ya se estaba vendiendo perdiendo dinero,
    // aunque esta operación no vaya a cambiar el precio para arreglarlo.
    const priceWarn = _riaMode === 'costOnly'
      ? (matched && it.cost != null && Number(it.cost) > Number(matched.price))
      : (it.priceToApply != null && it.cost != null && Number(it.priceToApply) < it.cost);
    const priceWarnMsg = _riaMode === 'costOnly'
      ? 'Este costo es mayor al precio de venta actual del producto — ya se está vendiendo perdiendo dinero, aunque este modo no cambia el precio. Revísalo en Inventario.'
      : 'El precio de venta es menor al costo — revisa este renglón';
    // La categoría solo se pide/edita para productos NUEVOS, y solo existen
    // productos nuevos en modo "recibiendo mercancía" — en "Actualizar"
    // nunca se crea nada, lo que no vincula se omite (ver omitNote abajo).
    const categoryFieldHtml = (!matched && _riaMode === 'stock') ? `
    <div class="ria-item-field ria-cat">
      <label>Categoría</label>
      <select onchange="riaUpdateCategory(${idx},this.value)">${_riaCategoryOptions(it.categoryGuess)}</select>
    </div>` : '';
    const priceFieldHtml = neverCreates ? '' : `
    <div class="ria-item-field">
      <label>Precio de venta${suggHint}</label>
      <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.priceToApply ?? ''}" oninput="riaUpdateField(${idx},'priceToApply',this.value)">
    </div>`;
    const omitNote = (!matched && neverCreates)
      ? `<div class="ria-item-warn ria-item-omit" style="display:block">Sin vincular — este renglón se omite al aplicar en este modo (no crea productos nuevos).</div>` : '';
    // El campo Costo siempre se muestra, incluso en "Actualizar" cuando el
    // documento no trajo ningún dato de costo (ej. una página de catálogo
    // con solo el "Cod:" de cada producto) -- se queda vacío y no se aplica
    // nada si no lo tocas, así que no hace daño mostrarlo de más. Por eso no
    // existe un modo separado "solo código": ocultar el campo aquí solo
    // agregaría una decisión de más sin evitar ningún riesgo real.
    const itemFieldsHtml = `
  <div class="ria-item-fields${_riaMode === 'costOnly' ? ' ria-costonly-fields' : ''}">
    <div class="ria-item-field">
      <label>${_riaMode === 'costOnly' ? 'Cantidad (factura)' : 'Cantidad'}</label>
      <input type="number" min="1" inputmode="numeric" value="${it.qty}" oninput="riaUpdateField(${idx},'qty',this.value)">
    </div>
    <div class="ria-item-field ria-cost">
      <label>Costo</label>
      <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.cost ?? ''}" oninput="riaUpdateField(${idx},'cost',this.value)">
    </div>
    ${priceFieldHtml}
    ${categoryFieldHtml}
  </div>`;
    // toTitleCase() solo aquí, para mostrar -- it.rawName sigue guardado tal
    // cual llegó de la factura (MAYÚSCULAS). Leer 16 nombres en mayúsculas
    // sostenidas es más difícil de escanear que en Título; si el usuario
    // escribe algo distinto, riaUpdateField() guarda exactamente lo que
    // tecleó (no se re-normaliza sobre la marcha, solo al renderizar de
    // nuevo). El único lugar que de verdad persiste el nombre (crear
    // producto nuevo en modo "Mercancía nueva") ya aplicaba toTitleCase() al
    // aplicar, sin cambios ahí.
    return `
<div class="ria-item-card">
  <div class="ria-item-top">
    <textarea class="ria-item-name" rows="1" oninput="riaUpdateField(${idx},'rawName',this.value);_riaAutoGrow(this)" onfocus="_riaAutoGrow(this)">${_esc(toTitleCase(it.rawName))}</textarea>
    <button class="ria-item-remove" onclick="riaRemoveItem(${idx})" title="Quitar">✕</button>
  </div>
  ${it.supplierCode ? `<div class="ria-item-code">Código proveedor: ${_esc(it.supplierCode)}</div>` : ''}
  <div class="ria-match-row">
    <div class="ria-match-chip-row">
      ${matchChip}
      ${scanBtn}
    </div>
    ${candidatesHtml}
  </div>
  ${itemFieldsHtml}
  <div class="ria-item-warn" style="${priceWarn ? 'display:block' : ''}"><svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${priceWarnMsg}</div>
  ${omitNote}
</div>`;
  }).join('');
  document.querySelectorAll('.ria-item-name').forEach(_riaAutoGrow);

  const kitsSection = document.getElementById('ria-kits-section');
  if (_riaKits.length) {
    kitsSection.style.display = 'block';
    const totalComps = _riaKits.reduce((n, k) => n + (k.components || []).length, 0);
    const pendingComps = _riaKits.reduce((n, k) => n + (k.components || []).filter(c => !c.matchProductId && !c.isNew).length, 0);
    const kitsTotal = _riaKits.reduce((s, k) => s + (k.tu_pagas != null && !isNaN(Number(k.tu_pagas)) ? Number(k.tu_pagas) : 0), 0);
    const labelEl = document.getElementById('ria-kits-head-label');
    if (labelEl) {
      labelEl.textContent = `Kits de promoción (${_riaKits.length}) — $${kitsTotal.toFixed(2)} · ${totalComps} componente${totalComps !== 1 ? 's' : ''}${pendingComps ? `, ${pendingComps} sin vincular` : ''}`;
    }
    // El ícono (stroke="currentColor") y el texto se ven en ámbar/advertencia
    // mientras falte vincular algo -- una vez que ya no hay pendientes, no
    // tiene sentido que el encabezado se siga viendo como una alerta cuando
    // ya no hay nada de qué alertar.
    const headEl = document.getElementById('ria-kits-head');
    if (headEl) headEl.classList.toggle('ria-kits-ok', pendingComps === 0);
    const listEl = document.getElementById('ria-kits-list');
    if (listEl) listEl.style.display = _riaKitsExpanded ? 'block' : 'none';
    const icoEl = document.getElementById('ria-kits-toggle-ico');
    if (icoEl) icoEl.textContent = _riaKitsExpanded ? '▴' : '▾';
    document.getElementById('ria-kits-list').innerHTML = _riaKits.map((k, ki) => {
      const compsHtml = (k.components || []).map((c, ci) => {
        const matched = c.matchProductId ? (products || []).find(p => p.id === c.matchProductId) : null;
        const chip = matched
          ? `<button class="ria-match-chip ria-match-linked" onclick="riaOpenKitCompPicker(${ki},${ci})" title="¿No es este producto? Toca para cambiarlo">✓ <span>${_esc(matched.name)}</span></button>`
          : (c.isNew
              ? `<button class="ria-match-chip ria-match-newchip" onclick="riaOpenKitCompPicker(${ki},${ci})"><span>+ Producto nuevo</span></button>`
              : `<button class="ria-match-chip ria-match-newchip" onclick="riaOpenKitCompPicker(${ki},${ci})"><span>Vincular</span></button>`);
        return `
    <div class="ria-kit-comp-row">
      <div class="ria-kit-comp-name">${_esc(toTitleCase(c.name))}</div>
      <div class="ria-match-chip-row">
        ${chip}
        <button class="ria-scan-icon-btn" onclick="riaOpenKitCompScanner(${ki},${ci})" title="Tengo el producto — escanear código de barras"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14"/><path d="M7 5v14"/><path d="M11 5v14"/><path d="M14 5v14"/><path d="M18 5v14"/><path d="M21 5v14"/></svg></button>
        <input type="number" step="0.01" inputmode="decimal" class="ria-kit-comp-cost" placeholder="Costo" value="${c.cost != null ? c.cost : ''}" oninput="riaUpdateKitCompCost(${ki},${ci},this.value)">
      </div>
    </div>`;
      }).join('');
      return `
<div class="ria-kit-item">
  <div class="ria-kit-top">
    <div class="ria-kit-name">${_esc(toTitleCase(k.raw_name || ''))}${k.tu_pagas != null ? ` — $${Number(k.tu_pagas).toFixed(2)}` : ''}</div>
    <button class="ria-item-remove" onclick="riaRemoveKit(${ki})" title="Quitar este kit — no se va a armar">✕</button>
  </div>
  <div class="ria-kit-comp-list">${compsHtml}</div>
</div>`;
    }).join('');
  } else {
    kitsSection.style.display = 'none';
  }

  const applyBtn = document.getElementById('ria-apply-btn');
  if (applyBtn) {
    applyBtn.disabled = !_riaItems.length && !_riaActionableKitComponents().length;
    const label = _riaMode === 'costOnly' ? 'Actualizar catálogo (' : 'Aplicar cambios (';
    applyBtn.textContent = (_RIA_DRY_RUN ? 'Simular: ' + label : label) + _riaItems.length + ')';
  }
  const badge = document.getElementById('ria-dry-badge');
  if (badge) badge.classList.toggle('show', _RIA_DRY_RUN);

  _riaSaveDraft();
}

// Actualiza el dato en memoria sin re-renderizar la lista completa — evita
// perder el foco del input mientras se escribe. Los avisos (margen negativo,
// contador de vinculados) se recalculan la próxima vez que se renderiza
// (ej. al quitar un renglón o cambiar un match).
function riaUpdateField(idx, field, value) {
  const it = _riaItems[idx];
  if (!it) return;
  if (field === 'rawName') { it.rawName = value; _riaSaveDraftDebounced(); return; }
  const num = parseFloat(value);
  it[field] = isNaN(num) ? null : num;
  _riaSaveDraftDebounced();
}

function riaRemoveItem(idx) {
  _riaItems.splice(idx, 1);
  _renderRecvIaReview();
}

// Chequeo de sanidad: suma lo que la IA calculó como costo de cada producto
// + kit, y lo compara contra el "Total a pagar" real del documento — nunca
// se guarda en ningún producto, es solo para detectar de un vistazo si algo
// se leyó mal antes de aplicar cambios. Extraído a función propia porque el
// confirm() de riaApplyChanges() necesita el mismo cálculo — un solo lugar
// evita que ambos se desalineen si el criterio de tolerancia cambia.
function _riaSanityCheck() {
  // Ya se cubre solo con _riaDocTotal == null -- un documento sin "Total a
  // pagar" (ej. una página de catálogo sin datos de costo) no tiene nada
  // que comparar y el chequeo no aplica, sin necesidad de mirar el modo.
  if (_riaDocTotal == null) return null;
  const itemsSum = _riaItems.reduce((s, it) => s + (it.cost != null ? it.cost * it.qty : 0), 0);
  const kitsSum = _riaKits.reduce((s, k) => s + (k.tu_pagas != null && !isNaN(Number(k.tu_pagas)) ? Number(k.tu_pagas) : 0), 0);
  const extracted = Math.round((itemsSum + kitsSum) * 100) / 100;
  const diff = Math.round((extracted - _riaDocTotal) * 100) / 100;
  const closeEnough = Math.abs(diff) <= Math.max(5, _riaDocTotal * 0.01); // tolera redondeos y cargos administrativos menores
  return { extracted, diff, closeEnough };
}

function _renderRiaSummary() {
  const el = document.getElementById('ria-review-summary');
  const check = _riaSanityCheck();
  if (!check) { el.style.display = 'none'; return; }
  const { extracted, diff, closeEnough } = check;

  el.style.display = 'flex';
  el.className = 'ria-review-summary ' + (closeEnough ? 'ria-sum-ok' : 'ria-sum-warn');
  const kitHint = _riaKits.length
    ? ` Ya suma los ${_riaKits.length} kit${_riaKits.length !== 1 ? 's' : ''} de promoción de abajo — si a esa lista le falta algún kit comparado con tu PDF, esa es la causa más probable.`
    : ' Tu pedido no trajo ningún kit de promoción detectado — si en el PDF sí hay, prueba extraer de nuevo.';
  el.innerHTML = `
<span>${closeEnough ? '✓' : '<svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'} Extraído: <strong>$${extracted.toFixed(2)}</strong> · Documento dice: <strong>$${_riaDocTotal.toFixed(2)}</strong></span>
${closeEnough ? '' : `<span>Diferencia de $${Math.abs(diff).toFixed(2)} — revisa los renglones antes de continuar.${kitHint}</span>`}`;
}

// Confirmación final antes de escribir en Supabase — solo en modo real
// ("Simular aplicar" ya es de bajo riesgo, no necesita este paso). No es un
// "¿estás seguro?" genérico que se ignora a fuerza de verlo siempre: solo
// aparece (y solo menciona) los dos riesgos reales que el propio código ya
// detecta pero que son fáciles de pasar por alto entre 15-18 tarjetas —
// precio por debajo del costo (perder dinero en cada venta) y el total que
// no cuadra contra el documento (algo se leyó mal). Si nada de eso aplica,
// el mensaje es un resumen corto, no una advertencia.
function _riaConfirmApply() {
  const linked = _riaItems.filter(it => it.matchProductId).length;
  const nuevos = _riaItems.length - linked;
  const kitComps = _riaActionableKitComponents();
  const kitLinked = kitComps.filter(x => x.comp.matchProductId).length;
  const kitNuevos = kitComps.length - kitLinked;
  const kitLine = kitComps.length
    ? `\n\nDe los componentes de kit: ${kitLinked} componente${kitLinked !== 1 ? 's' : ''} existente${kitLinked !== 1 ? 's' : ''} se actualizará${kitLinked !== 1 ? 'n' : ''}${kitNuevos ? ` y ${kitNuevos} se crearán como producto nuevo` : ''}.`
    : '';
  // Si hay kits en el documento pero ninguno de sus componentes se tocó (ni
  // vinculado ni marcado nuevo), riaApplyChanges() los omite por completo y
  // en silencio -- sin este aviso, ese dinero desaparece sin dejar ningún
  // rastro. Confirmado con una factura real (2026-09-11) donde $358.08 en 5
  // kits quedaron sin vincular sin que nada lo señalara en este diálogo.
  const untouchedKits = _riaKits.filter(k => !(k.components || []).some(c => c.matchProductId || c.isNew));
  const untouchedKitsValue = untouchedKits.reduce((s, k) => s + (k.tu_pagas != null && !isNaN(Number(k.tu_pagas)) ? Number(k.tu_pagas) : 0), 0);
  let msg;
  let lossItems = [];
  if (_riaMode === 'costOnly') {
    // Algunos renglones vinculados sí traen costo (factura) y otros no (ej.
    // una página de catálogo con solo el "Cod:") -- el mensaje distingue
    // ambos en vez de decir "se actualizará el costo" cuando en realidad
    // varios solo van a aprender su código de proveedor.
    const costUpdates = _riaItems.filter(it => it.matchProductId && it.cost != null).length;
    const codeOnlyUpdates = linked - costUpdates;
    const parts = [];
    if (costUpdates) parts.push(`el costo de ${costUpdates} producto${costUpdates !== 1 ? 's' : ''}`);
    if (codeOnlyUpdates) parts.push(`solo el código de proveedor de ${codeOnlyUpdates} producto${codeOnlyUpdates !== 1 ? 's' : ''} (sin costo en el documento)`);
    const whatLine = parts.length ? `Se actualizará ${parts.join(' y ')}.` : '';
    msg = `¿Aplicar esta actualización?\n\n${whatLine} No se toca stock ni precio de venta.${nuevos ? ` ${nuevos} renglón${nuevos !== 1 ? 'es' : ''} sin vincular se omitirá${nuevos !== 1 ? 'n' : ''}.` : ''}${kitLine}`;
    lossItems = _riaItems.filter(it => {
      const matched = it.matchProductId ? (products || []).find(p => p.id === it.matchProductId) : null;
      return matched && it.cost != null && Number(it.cost) > Number(matched.price);
    });
    if (lossItems.length) {
      msg += `\n\n⚠️ ${lossItems.length} con costo MAYOR al precio de venta actual (ya se venden perdiendo dinero, aunque este modo no cambia el precio):\n${lossItems.slice(0, 8).map(it => `• ${toTitleCase(it.rawName)}`).join('\n')}${lossItems.length > 8 ? `\n… y ${lossItems.length - 8} más` : ''}`;
    }
  } else {
    msg = `¿Aplicar esta recepción?\n\n${linked} producto${linked !== 1 ? 's' : ''} existente${linked !== 1 ? 's' : ''} se actualizará${linked !== 1 ? 'n' : ''} (stock/costo/precio) y ${nuevos} producto${nuevos !== 1 ? 's' : ''} nuevo${nuevos !== 1 ? 's' : ''} se crearán.${kitLine}`;
    lossItems = _riaItems.filter(it => it.priceToApply != null && it.cost != null && Number(it.priceToApply) < it.cost);
    if (lossItems.length) {
      msg += `\n\n⚠️ ${lossItems.length} con precio de venta MENOR al costo (se venderían perdiendo dinero):\n${lossItems.slice(0, 8).map(it => `• ${toTitleCase(it.rawName)}`).join('\n')}${lossItems.length > 8 ? `\n… y ${lossItems.length - 8} más` : ''}`;
    }
  }

  const check = _riaSanityCheck();
  if (check && !check.closeEnough) {
    msg += `\n\n⚠️ El total extraído ($${check.extracted.toFixed(2)}) no cuadra con el documento ($${_riaDocTotal.toFixed(2)}) — diferencia de $${Math.abs(check.diff).toFixed(2)}. Puede que algo se haya leído mal.`;
  }

  if (untouchedKits.length) {
    msg += `\n\n⚠️ ${untouchedKits.length} kit${untouchedKits.length !== 1 ? 's' : ''} de promoción ($${untouchedKitsValue.toFixed(2)}) sin vincular ningún componente — se van a omitir por completo, sin ningún registro. Para aplicarlos, vincula al menos un componente de cada uno (▾ Kits de promoción, arriba de este botón) antes de continuar.`;
  }

  return confirm(msg);
}

/* ── Aplicar cambios (o simular, mientras _RIA_DRY_RUN sea true) ── */
async function riaApplyChanges() {
  const actionableKitComps = _riaActionableKitComponents();
  if (!_riaItems.length && !actionableKitComps.length) return;
  if (!_RIA_DRY_RUN && !_riaConfirmApply()) return;
  const btn = document.getElementById('ria-apply-btn');
  btn.disabled = true;
  btn.textContent = _RIA_DRY_RUN ? 'Simulando…' : 'Aplicando…';

  const results = { updated: [], created: [], failed: [], skipped: [] };
  const undoUpdated = []; // reversión por diferencia — ver riaUndoLastApply()
  const undoCreated = [];
  let nextNewId = (products || []).reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const costOnly = _riaMode === 'costOnly';

  for (const it of _riaItems) {
    try {
      if (it.matchProductId) {
        const product = (products || []).find(p => p.id === it.matchProductId);
        if (!product) throw new Error('Producto no encontrado en el catálogo local');
        const beforeSnapshot = { cost: product.cost, price: product.price, supplierCode: product.supplierCode };
        // "costOnly" ("Actualizar"): costo (si el renglón trae uno -- si no,
        // queda igual) y código de proveedor, nunca stock ni precio.
        // Cualquier otro caso: el flujo normal completo.
        const payload = costOnly ? {
          cost: it.cost != null ? it.cost : product.cost,
          supplier_code: it.supplierCode || product.supplierCode || null
        } : {
          stock: product.stock + (it.qty || 0),
          out_of_stock: (product.stock + (it.qty || 0)) > 0 ? false : product.outOfStock,
          cost: it.cost != null ? it.cost : product.cost,
          price: it.priceToApply != null ? it.priceToApply : product.price,
          supplier_code: it.supplierCode || product.supplierCode || null
        };
        const diffText = costOnly
          ? `costo $${product.cost ?? '—'}→$${payload.cost ?? '—'} · código proveedor: ${product.supplierCode ?? '—'}→${payload.supplier_code ?? '—'}`
          : `stock ${product.stock}→${payload.stock} · costo $${product.cost ?? '—'}→$${payload.cost ?? '—'} · precio $${product.price}→$${payload.price}`;
        if (_RIA_DRY_RUN) {
          results.updated.push({ name: product.name, diff: diffText });
        } else {
          const r = await supabaseApi(`products?id=eq.${product.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          if (!r.ok) throw new Error('Error al guardar en Supabase');
          if (payload.stock != null) { product.stock = payload.stock; product.outOfStock = payload.out_of_stock; }
          product.cost = payload.cost;
          if (payload.price != null) product.price = payload.price;
          product.supplierCode = payload.supplier_code;
          results.updated.push({ name: product.name, diff: diffText });
          undoUpdated.push({ productId: product.id, deltaQty: costOnly ? 0 : (it.qty || 0), before: beforeSnapshot });
        }
      } else if (costOnly) {
        // Sin vincular en "Actualizar" — nunca crea un producto fantasma
        // solo para tener dónde poner el dato, se omite.
        results.skipped.push({ name: toTitleCase(it.rawName) });
      } else {
        const newId = nextNewId++;
        const catMatch = it.categoryGuess ? (categories || []).find(c => c.code === it.categoryGuess) : null;
        const category = catMatch ? catMatch.code : 'por_revisar';
        const categoryLabel = catMatch ? catMatch.label : 'Por revisar';
        const cleanName = toTitleCase(it.rawName);
        const draft = {
          id: newId, name: cleanName, category, category_label: categoryLabel,
          price: it.priceToApply || 0, cost: it.cost ?? null, description: '', stock: it.qty || 0,
          out_of_stock: false, is_published: false, featured: false, image: DEFAULT_IMG,
          position: (products || []).length, supplier_code: it.supplierCode || null
        };
        if (_RIA_DRY_RUN) {
          results.created.push({ name: cleanName, diff: `stock ${draft.stock} · costo $${draft.cost ?? '—'} · precio $${draft.price} · categoría ${categoryLabel}` });
        } else {
          const r = await supabaseApi('products', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(draft) });
          if (!r.ok) throw new Error('Error al crear en Supabase');
          products.push({
            id: newId, name: cleanName, category, categoryLabel, price: draft.price, cost: draft.cost,
            description: '', stock: draft.stock, outOfStock: false, isPublished: false, featured: false,
            image: DEFAULT_IMG, position: draft.position, kitItems: null, supplierCode: draft.supplier_code
          });
          await flagProduct(newId, 'Creado por Recepción con IA — falta foto/descripción/revisar categoría');
          results.created.push({ name: cleanName, diff: `stock ${draft.stock} · costo $${draft.cost ?? '—'} · precio $${draft.price} · categoría ${categoryLabel}` });
          undoCreated.push({ productId: newId });
        }
      }
    } catch (err) {
      results.failed.push({ name: toTitleCase(it.rawName), error: err.message });
    }
  }

  // Componentes de kit -- mismo patrón que un renglón normal (vincula/crea),
  // con dos diferencias: nunca hay precio de revista propio (la factura solo
  // da el total del kit, nunca por componente) así que jamás se toca el
  // precio de venta, y la cantidad siempre es 1 por componente por kit (no
  // hay un dato de "cuántos" distinto en la factura para esto).
  for (const { kit, comp } of actionableKitComps) {
    try {
      if (comp.matchProductId) {
        const product = (products || []).find(p => p.id === comp.matchProductId);
        if (!product) throw new Error('Producto no encontrado en el catálogo local');
        const beforeSnapshot = { cost: product.cost, price: product.price, supplierCode: product.supplierCode };
        const payload = costOnly
          ? { cost: comp.cost != null ? comp.cost : product.cost }
          : { stock: product.stock + 1, out_of_stock: (product.stock + 1) > 0 ? false : product.outOfStock, cost: comp.cost != null ? comp.cost : product.cost };
        const diffText = (costOnly
          ? `costo $${product.cost ?? '—'}→$${payload.cost ?? '—'}`
          : `stock ${product.stock}→${payload.stock} · costo $${product.cost ?? '—'}→$${payload.cost ?? '—'}`) + ` (kit "${toTitleCase(kit.raw_name || '')}")`;
        if (_RIA_DRY_RUN) {
          results.updated.push({ name: product.name, diff: diffText });
        } else {
          const r = await supabaseApi(`products?id=eq.${product.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          if (!r.ok) throw new Error('Error al guardar en Supabase');
          if (payload.stock != null) { product.stock = payload.stock; product.outOfStock = payload.out_of_stock; }
          product.cost = payload.cost;
          results.updated.push({ name: product.name, diff: diffText });
          undoUpdated.push({ productId: product.id, deltaQty: costOnly ? 0 : 1, before: beforeSnapshot });
        }
      } else if (costOnly) {
        // Igual que un renglón normal sin vincular en "Actualizar": nunca
        // crea un producto fantasma, se omite.
        results.skipped.push({ name: toTitleCase(comp.name) });
      } else {
        const newId = nextNewId++;
        const cleanName = toTitleCase(comp.name);
        const draft = {
          id: newId, name: cleanName, category: 'por_revisar', category_label: 'Por revisar',
          price: 0, cost: comp.cost ?? null, description: '', stock: 1,
          out_of_stock: false, is_published: false, featured: false, image: DEFAULT_IMG,
          position: (products || []).length, supplier_code: null
        };
        const kitTag = ` (kit "${toTitleCase(kit.raw_name || '')}")`;
        if (_RIA_DRY_RUN) {
          results.created.push({ name: cleanName, diff: `stock ${draft.stock} · costo $${draft.cost ?? '—'} · precio $${draft.price} · categoría Por revisar${kitTag}` });
        } else {
          const r = await supabaseApi('products', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(draft) });
          if (!r.ok) throw new Error('Error al crear en Supabase');
          products.push({
            id: newId, name: cleanName, category: 'por_revisar', categoryLabel: 'Por revisar', price: draft.price, cost: draft.cost,
            description: '', stock: draft.stock, outOfStock: false, isPublished: false, featured: false,
            image: DEFAULT_IMG, position: draft.position, kitItems: null, supplierCode: null
          });
          await flagProduct(newId, 'Creado por Recepción con IA (componente de kit) — falta foto/descripción/revisar categoría y precio de venta');
          results.created.push({ name: cleanName, diff: `stock ${draft.stock} · costo $${draft.cost ?? '—'} · precio $${draft.price} · categoría Por revisar${kitTag}` });
          undoCreated.push({ productId: newId });
        }
      }
    } catch (err) {
      results.failed.push({ name: toTitleCase(comp.name), error: err.message });
    }
  }

  if (!_RIA_DRY_RUN) {
    renderTable();
    renderStats();
    logActivity('recepcion_ia_aplicada',
      costOnly
        ? `Recepción con IA (Actualizar catálogo): ${results.updated.length} actualizados${results.skipped.length ? `, ${results.skipped.length} omitidos` : ''}${results.failed.length ? `, ${results.failed.length} con error` : ''}`
        : `Recepción con IA: ${results.updated.length} actualizados, ${results.created.length} nuevos${results.failed.length ? `, ${results.failed.length} con error` : ''}`,
      { mode: _riaMode, updated: results.updated.length, created: results.created.length, skipped: results.skipped.length, failed: results.failed.length });
    _riaClearDraft();
    _riaSaveUndoSnapshot(undoUpdated, undoCreated);
  }

  _riaShowApplyResult(results);
  btn.disabled = false;
}

function _riaShowApplyResult(results) {
  _riaShowState('result');
  const el = document.getElementById('ria-result-content');
  const banner = _RIA_DRY_RUN
    ? '<div class="ria-result-banner ria-dry">🧪 SIMULACIÓN — no se guardó nada en el catálogo. Esto es lo que habría pasado:</div>'
    : '<div class="ria-result-banner ria-real">✓ Cambios aplicados a tu catálogo</div>';

  const section = (label, rows, isFail) => !rows.length ? '' : `
<div class="ria-result-group-label">${label} (${rows.length})</div>
${rows.map(r => `<div class="ria-result-row ${isFail ? 'ria-result-fail' : ''}"><strong>${_esc(r.name)}</strong>${r.diff ? `<span class="ria-result-diff">${_esc(r.diff)}</span>` : ''}${r.error ? `<span class="ria-result-diff">${_esc(r.error)}</span>` : ''}</div>`).join('')}`;

  el.innerHTML = banner
    + section('Actualizados', results.updated, false)
    + section('Nuevos', results.created, false)
    + section('Omitidos — sin vincular', results.skipped, false)
    + section('Con error', results.failed, true);

  const undoEl = document.getElementById('ria-result-undo');
  if (undoEl) {
    const canUndo = !_RIA_DRY_RUN && (results.updated.length + results.created.length > 0);
    undoEl.innerHTML = canUndo
      ? `<button class="ria-undo-btn" onclick="riaUndoLastApply()">↩ Deshacer esta recepción</button>`
      : '';
  }
}
