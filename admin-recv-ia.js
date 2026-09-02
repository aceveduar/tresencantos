/* ══ RECEPCIÓN CON IA — PDF (Natura) o foto → matching contra catálogo →
   aplicar (stock/costo/precio, o crear producto nuevo). ══════════════════

   ⚠️ MODO DE PRUEBA: mientras _RIA_DRY_RUN sea true, "Aplicar cambios" NUNCA
   escribe en Supabase — solo simula y muestra qué habría pasado. Cambiar a
   false solo cuando se haya validado el matching contra catálogo real y se
   tenga un pedido vigente para aplicar de verdad. También requiere haber
   ejecutado antes la migración supabase/migrations/20260902_01_supplier_code.sql
   (si no, el PATCH/POST real fallaría al mandar la columna supplier_code). */
const _RIA_DRY_RUN = true;

let _riaItems  = [];  // [{supplierCode, rawName, qty, cost, suggestedPrice, categoryGuess, matchProductId, matchCandidates, isNew, priceToApply}]
let _riaKits   = [];  // [{raw_name, components:[...], tu_pagas}] — promociones, no se procesan
let _riaPhotos = [];  // [dataUrl] — fotos en cola antes de extraer (camino de foto)
let _riaDocTotal = null;     // "Total a pagar" del documento — solo para el chequeo de sanidad
let _riaMatchTargetIdx = null; // índice de _riaItems que el picker de vinculación está editando

/* ── Umbrales de matching por nombre — provisionales, a calibrar con uso
   real (mismo criterio que ya se usó para el escáner: probar y ajustar
   contra la realidad, no quedarse con el número teórico). ── */
const _RIA_MATCH_HIGH = 0.55; // score ≥ esto → preseleccionado como match
const _RIA_MATCH_SHOW = 0.28; // score ≥ esto → se muestra como candidato

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
2. Los renglones que empiezan con "KIT" son promociones armadas con componentes ("Comp.") debajo — NO los proceses como productos individuales. SIEMPRE agrégalos a "kits_pendientes" con su descripción, la lista de nombres de sus componentes ("Comp."), y el valor de su propia columna "Tú Pagas" (el total de ese KIT) — nunca los descartes ni los omitas en silencio, aunque no tengan precio individual por componente.
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
2. Si hay renglones tipo "KIT"/promoción con componentes agrupados debajo sin precio individual propio, NO los proceses como productos individuales — agrégalos a "kits_pendientes" con su descripción, los nombres de sus componentes, y su propio total (columna tipo "Tú Pagas" o similar) si es visible; null si no.
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
  _riaPhotos = [];
  _riaDocTotal = null;
  _riaClearDraft();
  _riaShowState('choice');
  const pdfInput = document.getElementById('ria-pdf-input');
  const photoInput = document.getElementById('ria-photo-input');
  if (pdfInput) pdfInput.value = '';
  if (photoInput) photoInput.value = '';
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
      items: _riaItems, kits: _riaKits, docTotal: _riaDocTotal, savedAt: Date.now()
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
  _riaKits = draft.kits || [];
  _riaDocTotal = draft.docTotal ?? null;
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
      const result = await _riaCallGroq(() => _groqTextJson(chunks[i], {
        systemPrompt: _riaTextPrompt(),
        userPrompt: 'Extrae los renglones de producto de este fragmento del pedido según las reglas de arriba — es un fragmento del documento completo, puede empezar o terminar a mitad de una sección.',
        maxCompletionTokens: 2000
      }));
      allItems.push(...(result.items || []));
      allKits.push(...(result.kits_pendientes || []));
      if (docTotal == null && result.total_documento != null) docTotal = Number(result.total_documento);
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 2500));
    }

    _riaItems = allItems.map(_riaComputeItem).filter(Boolean);
    _riaKits = allKits.filter(k => k && k.raw_name);
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
      const result = await _riaCallGroq(() => _groqVisionJson(_riaPhotos[i], {
        systemPrompt: _riaVisionPrompt(),
        userPrompt: 'Extrae los renglones de producto de esta foto según las reglas de arriba.',
        maxCompletionTokens: 2500
      }));
      allItems.push(...(result.items || []));
      allKits.push(...(result.kits_pendientes || []));
      if (docTotal == null && result.total_documento != null) docTotal = Number(result.total_documento);
      if (i < total - 1) await new Promise(r => setTimeout(r, 2500));
    }
    _riaItems = allItems.map(_riaComputeItem).filter(Boolean);
    _riaKits = allKits.filter(k => k && k.raw_name);
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
  const suggestedPrice = raw.precio_revista != null ? Number(raw.precio_revista) : null;
  return {
    supplierCode: raw.supplier_code ? String(raw.supplier_code) : null,
    rawName: String(raw.raw_name).trim(),
    qty,
    cost,
    suggestedPrice: (suggestedPrice != null && !isNaN(suggestedPrice)) ? suggestedPrice : null,
    categoryGuess: raw.category_guess || null,
    // se llenan en _riaMatchCatalog():
    matchProductId: null,
    matchCandidates: [],
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
      it.isNew = false;
      _riaUpdatePriceToApply(it);
      return;
    }
    // 2) similitud de nombre — mismo motor que la detección de duplicados,
    // con un castigo fuerte si hay un marcador de variante en conflicto
    // (ver _RIA_VARIANT_MARKERS arriba).
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
    it.matchProductId = (scored[0] && scored[0].score >= _RIA_MATCH_HIGH) ? scored[0].id : null;
    it.isNew = !it.matchProductId;
    _riaUpdatePriceToApply(it);
  });
}

// El precio que se va a aplicar arranca del precio actual del producto (si
// ya existe) — nunca del precio sugerido por el proveedor, que solo es
// referencia. Si es un producto nuevo, no hay precio actual del que partir,
// así que usa el sugerido como punto de partida (siempre editable).
function _riaUpdatePriceToApply(it) {
  const matched = it.matchProductId ? (products || []).find(p => p.id === it.matchProductId) : null;
  it.priceToApply = matched ? matched.price : (it.suggestedPrice ?? 0);
}

function riaSetMatch(idx, productId) {
  const it = _riaItems[idx];
  if (!it) return;
  it.matchProductId = productId;
  it.isNew = false;
  it.matchManual = true;
  _riaUpdatePriceToApply(it);
  _renderRecvIaReview();
}

function riaSetMatchNew(idx) {
  const it = _riaItems[idx];
  if (!it) return;
  it.matchProductId = null;
  it.isNew = true;
  it.matchManual = true;
  _riaUpdatePriceToApply(it);
  _renderRecvIaReview();
}

/* ── Picker de vinculación manual — mismo patrón de buscador que Kit Builder ── */
function riaOpenMatchPicker(idx) {
  _riaMatchTargetIdx = idx;
  const input = document.getElementById('ria-match-search-input');
  input.value = '';
  document.getElementById('ria-match-picker-results').innerHTML = '';
  document.getElementById('ria-match-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => input.focus(), 200);
}

function closeRiaMatchPicker() {
  document.getElementById('ria-match-overlay').style.display = 'none';
  document.body.style.overflow = '';
  _riaMatchTargetIdx = null;
}

function riaSearchMatchPicker(q) {
  const resultsEl = document.getElementById('ria-match-picker-results');
  const query = q.trim().toLowerCase();
  if (!query) { resultsEl.innerHTML = ''; return; }
  const matches = (products || []).filter(p => p.name.toLowerCase().includes(query)).slice(0, 25);
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
  if (_riaMatchTargetIdx == null) return;
  riaSetMatch(_riaMatchTargetIdx, productId);
  closeRiaMatchPicker();
}

function riaConfirmSetNew() {
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

/* ── Lista editable + matching (compartida por ambos orígenes) ── */
function _renderRecvIaReview() {
  _riaShowState('review');

  const linked = _riaItems.filter(it => it.matchProductId).length;
  const nuevos = _riaItems.length - linked;
  document.getElementById('ria-review-count').textContent =
    `${_riaItems.length} producto${_riaItems.length !== 1 ? 's' : ''} · ${linked} vinculado${linked !== 1 ? 's' : ''} · ${nuevos} nuevo${nuevos !== 1 ? 's' : ''}`;

  _renderRiaSummary();

  document.getElementById('ria-items-list').innerHTML = _riaItems.map((it, idx) => {
    const matched = it.matchProductId ? (products || []).find(p => p.id === it.matchProductId) : null;
    const matchImgAttr = matched ? _riaHoverAttrs(matched.image) : '';
    const matchChip = matched
      ? `<button class="ria-match-chip ria-match-linked" onclick="riaOpenMatchPicker(${idx})" ${matchImgAttr}>✓ <span>${_esc(matched.name)}</span></button>`
      : `<button class="ria-match-chip ria-match-newchip" onclick="riaOpenMatchPicker(${idx})">+ Producto nuevo</button>`;
    const candidatesHtml = (!matched && it.matchCandidates.length)
      ? `<div class="ria-match-candidates"><span class="ria-match-cand-label">¿O tal vez?</span>${it.matchCandidates.map(c => `<button class="ria-match-cand-btn" onclick="riaSetMatch(${idx},${c.id})" ${_riaHoverAttrs(c.image)}>${_esc(c.name)} · ${Math.round(c.score * 100)}%</button>`).join('')}</div>`
      : '';
    // El hint del sugerido solo aporta cuando difiere del precio que se va a
    // aplicar — en un producto nuevo, sin precio propio del catálogo con
    // qué contrastar, ambos valores arrancan iguales y mostrarlo es ruido.
    const suggHint = (it.suggestedPrice != null && Number(it.priceToApply) !== Number(it.suggestedPrice))
      ? ` <span class="ria-sugg-hint">(sug. $${it.suggestedPrice})</span>` : '';
    const priceWarn = (it.priceToApply != null && it.cost != null && Number(it.priceToApply) < it.cost);
    return `
<div class="ria-item-card">
  <div class="ria-item-top">
    <textarea class="ria-item-name" rows="1" oninput="riaUpdateField(${idx},'rawName',this.value);_riaAutoGrow(this)" onfocus="_riaAutoGrow(this)">${_esc(it.rawName)}</textarea>
    <button class="ria-item-remove" onclick="riaRemoveItem(${idx})" title="Quitar">✕</button>
  </div>
  ${it.supplierCode ? `<div class="ria-item-code">Código proveedor: ${_esc(it.supplierCode)}</div>` : ''}
  <div class="ria-match-row">
    ${matchChip}
    ${candidatesHtml}
  </div>
  <div class="ria-item-fields">
    <div class="ria-item-field">
      <label>Cantidad</label>
      <input type="number" min="1" inputmode="numeric" value="${it.qty}" oninput="riaUpdateField(${idx},'qty',this.value)">
    </div>
    <div class="ria-item-field ria-cost">
      <label>Costo</label>
      <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.cost ?? ''}" oninput="riaUpdateField(${idx},'cost',this.value)">
    </div>
    <div class="ria-item-field">
      <label>Precio de venta${suggHint}</label>
      <input type="number" min="0" step="0.01" inputmode="decimal" value="${it.priceToApply ?? ''}" oninput="riaUpdateField(${idx},'priceToApply',this.value)">
    </div>
  </div>
  <div class="ria-item-warn" style="${priceWarn ? 'display:block' : ''}">⚠️ El precio de venta es menor al costo — revisa este renglón</div>
</div>`;
  }).join('');
  document.querySelectorAll('.ria-item-name').forEach(_riaAutoGrow);

  const kitsSection = document.getElementById('ria-kits-section');
  if (_riaKits.length) {
    kitsSection.style.display = 'block';
    document.getElementById('ria-kits-list').innerHTML = _riaKits.map(k => `
<div class="ria-kit-item">
  <div class="ria-kit-name">${_esc(k.raw_name || '')}${k.tu_pagas != null ? ` — $${Number(k.tu_pagas).toFixed(2)}` : ''}</div>
  <div class="ria-kit-comps">${(k.components || []).map(c => _esc(c)).join(' · ')}</div>
</div>`).join('');
  } else {
    kitsSection.style.display = 'none';
  }

  const applyBtn = document.getElementById('ria-apply-btn');
  if (applyBtn) {
    applyBtn.disabled = !_riaItems.length;
    applyBtn.textContent = (_RIA_DRY_RUN ? 'Simular aplicar (' : 'Aplicar cambios (') + _riaItems.length + ')';
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
// se leyó mal antes de aplicar cambios.
function _renderRiaSummary() {
  const el = document.getElementById('ria-review-summary');
  if (_riaDocTotal == null) { el.style.display = 'none'; return; }

  const itemsSum = _riaItems.reduce((s, it) => s + (it.cost != null ? it.cost * it.qty : 0), 0);
  const kitsSum = _riaKits.reduce((s, k) => s + (k.tu_pagas != null && !isNaN(Number(k.tu_pagas)) ? Number(k.tu_pagas) : 0), 0);
  const extracted = Math.round((itemsSum + kitsSum) * 100) / 100;
  const diff = Math.round((extracted - _riaDocTotal) * 100) / 100;
  const closeEnough = Math.abs(diff) <= Math.max(5, _riaDocTotal * 0.01); // tolera redondeos y cargos administrativos menores

  el.style.display = 'flex';
  el.className = 'ria-review-summary ' + (closeEnough ? 'ria-sum-ok' : 'ria-sum-warn');
  const kitHint = _riaKits.length
    ? ` Ya suma los ${_riaKits.length} kit${_riaKits.length !== 1 ? 's' : ''} de promoción de abajo — si a esa lista le falta algún kit comparado con tu PDF, esa es la causa más probable.`
    : ' Tu pedido no trajo ningún kit de promoción detectado — si en el PDF sí hay, prueba extraer de nuevo.';
  el.innerHTML = `
<span>${closeEnough ? '✓' : '⚠️'} Extraído: <strong>$${extracted.toFixed(2)}</strong> · Documento dice: <strong>$${_riaDocTotal.toFixed(2)}</strong></span>
${closeEnough ? '' : `<span>Diferencia de $${Math.abs(diff).toFixed(2)} — revisa los renglones antes de continuar.${kitHint}</span>`}`;
}

/* ── Aplicar cambios (o simular, mientras _RIA_DRY_RUN sea true) ── */
async function riaApplyChanges() {
  if (!_riaItems.length) return;
  const btn = document.getElementById('ria-apply-btn');
  btn.disabled = true;
  btn.textContent = _RIA_DRY_RUN ? 'Simulando…' : 'Aplicando…';

  const results = { updated: [], created: [], failed: [] };
  let nextNewId = (products || []).reduce((m, p) => Math.max(m, p.id), 0) + 1;

  for (const it of _riaItems) {
    try {
      if (it.matchProductId) {
        const product = (products || []).find(p => p.id === it.matchProductId);
        if (!product) throw new Error('Producto no encontrado en el catálogo local');
        const newStock = product.stock + (it.qty || 0);
        const payload = {
          stock: newStock,
          out_of_stock: newStock > 0 ? false : product.outOfStock,
          cost: it.cost != null ? it.cost : product.cost,
          price: it.priceToApply != null ? it.priceToApply : product.price,
          supplier_code: it.supplierCode || product.supplierCode || null
        };
        if (_RIA_DRY_RUN) {
          results.updated.push({
            name: product.name,
            diff: `stock ${product.stock}→${payload.stock} · costo $${product.cost ?? '—'}→$${payload.cost ?? '—'} · precio $${product.price}→$${payload.price}`
          });
        } else {
          const r = await supabaseApi(`products?id=eq.${product.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
          if (!r.ok) throw new Error('Error al guardar en Supabase');
          const diffText = `stock ${product.stock}→${payload.stock} · costo $${product.cost ?? '—'}→$${payload.cost ?? '—'} · precio $${product.price}→$${payload.price}`;
          product.stock = payload.stock;
          product.outOfStock = payload.out_of_stock;
          product.cost = payload.cost;
          product.price = payload.price;
          product.supplierCode = payload.supplier_code;
          results.updated.push({ name: product.name, diff: diffText });
        }
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
        }
      }
    } catch (err) {
      results.failed.push({ name: it.rawName, error: err.message });
    }
  }

  if (!_RIA_DRY_RUN) {
    renderTable();
    renderStats();
    logActivity('recepcion_ia_aplicada',
      `Recepción con IA: ${results.updated.length} actualizados, ${results.created.length} nuevos${results.failed.length ? `, ${results.failed.length} con error` : ''}`,
      { updated: results.updated.length, created: results.created.length, failed: results.failed.length });
    _riaClearDraft();
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
    + section('Con error', results.failed, true);
}
