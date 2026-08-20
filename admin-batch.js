/* ══════════════════════════════════════════════════════════════════
   CARGA MASIVA CON IA — solo superadmin
   ══════════════════════════════════════════════════════════════════ */

let _batchItems = []; // [{dataUrl, name, description, category, status}]

const _BATCH_ICON_SPARKLE = '<svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';
const _BATCH_ICON_SPIN    = '<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(201,164,98,.3);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;vertical-align:-1px;margin-right:4px"></span>';

function openBatchUpload() {
  _batchItems = [];
  _batchRenderCards();
  document.getElementById('batch-overlay').style.display = 'flex';
  document.getElementById('batch-file-input').value = '';
  document.getElementById('batch-camera-input').value = '';
}

function closeBatchUpload() {
  document.getElementById('batch-overlay').style.display = 'none';
  _batchItems = [];
}

function _batchDragOver(e) {
  e.preventDefault();
  document.getElementById('batch-dropzone').classList.add('drag-over');
}
function _batchDragLeave(e) {
  document.getElementById('batch-dropzone').classList.remove('drag-over');
}
function _batchDrop(e) {
  e.preventDefault();
  document.getElementById('batch-dropzone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) _batchProcessFiles(files);
}
function _batchHandleInput(input) {
  const files = Array.from(input.files);
  if (files.length) _batchProcessFiles(files);
  input.value = '';
}

async function _batchProcessFiles(files) {
  const btn = document.getElementById('batch-analyze-all-btn');
  for (const file of files) {
    const dataUrl = await _fileToBase64Resized(file);
    _batchItems.push({ dataUrl, name: '', description: '', category: '', status: 'pending', error: '' });
  }
  _batchRenderCards();
  if (btn) btn.style.display = '';
}

function _batchRenderCards() {
  const grid = document.getElementById('batch-grid');
  const publishBtn = document.getElementById('batch-publish-btn');
  const analyzeBtn = document.getElementById('batch-analyze-all-btn');
  if (!_batchItems.length) {
    grid.innerHTML = '<div class="batch-empty">Agrega fotos para comenzar</div>';
    publishBtn.disabled = true;
    publishBtn.textContent = 'Publicar 0 productos';
    if (analyzeBtn) analyzeBtn.style.display = 'none';
    return;
  }
  const catOptions = categories.map(c => {
    if (c.parent) return `<option value="${c.code}">${_esc(c.label)}</option>`;
    return `<option value="${c.code}" style="font-weight:700">${_esc(c.label)}</option>`;
  }).join('');

  grid.innerHTML = _batchItems.map((item, i) => {
    const statusHtml = item.status === 'analyzing'
      ? `<div class="batch-status analyzing">${_BATCH_ICON_SPIN}Analizando…</div>`
      : item.status === 'done'
      ? '<div class="batch-status done">✓ Listo</div>'
      : item.status === 'error'
      ? `<div class="batch-status error">✗ ${_esc(item.error || 'Error — reintenta')}</div>`
      : '';
    return `
<div class="batch-card" id="bcard-${i}">
  <img class="batch-card-img" src="${item.dataUrl}" alt="">
  <div class="batch-card-body">
    ${statusHtml}
    <div class="batch-card-actions">
      <button class="btn-ai" onclick="_batchAnalyzeOne(${i})" ${item.status === 'analyzing' ? 'disabled' : ''}>${_BATCH_ICON_SPARKLE}Analizar</button>
      <button class="btn-remove" onclick="_batchRemove(${i})" title="Eliminar">✕</button>
    </div>
    <input type="text" placeholder="Nombre del producto" value="${_esc(item.name)}"
           oninput="_batchItems[${i}].name=this.value;_batchUpdateFooter()">
    <textarea rows="2" placeholder="Descripción…"
              oninput="_batchItems[${i}].description=this.value">${_esc(item.description)}</textarea>
    <select onchange="_batchItems[${i}].category=this.value">
      <option value="">— Categoría —</option>
      ${catOptions}
    </select>
  </div>
</div>`;
  }).join('');

  // Restore category selects
  _batchItems.forEach((item, i) => {
    const sel = grid.querySelector(`#bcard-${i} select`);
    if (sel && item.category) sel.value = item.category;
  });

  _batchUpdateFooter();
}

function _batchUpdateFooter() {
  const btn = document.getElementById('batch-publish-btn');
  const ready = _batchItems.filter(it => it.name.trim()).length;
  btn.textContent = `Publicar ${ready} producto${ready !== 1 ? 's' : ''}`;
  btn.disabled = ready === 0;
}

function _batchRemove(idx) {
  _batchItems.splice(idx, 1);
  _batchRenderCards();
  if (_batchItems.length) document.getElementById('batch-analyze-all-btn').style.display = '';
}

async function _batchCallGroq(dataUrl) {
  if (!groqApiKey) throw new Error('No hay Groq key configurada');
  const catList = categories.map(c => c.code).join(', ');
  const systemPrompt = `Eres experto en productos de boutique mexicana. Analiza la imagen y responde SOLO JSON válido sin markdown.\nCategorías disponibles: ${catList}`;
  const userPrompt = `Devuelve JSON: {"name":"45-70 chars, marca+tipo+material+color/variante","description":"copy máx 160 chars, empieza con verbo activo, nunca con Este es","category":"código exacto o vacío si dudas","price":null}`;
  return _groqVisionJson(dataUrl, {
    systemPrompt,
    userPrompt,
    maxCompletionTokens: 600
  });
}

async function _batchAnalyzeOne(idx) {
  if (!_batchItems[idx]) return;
  _batchItems[idx].status = 'analyzing';
  _batchItems[idx].error = '';
  _batchRenderCards();
  try {
    const parsed = await _batchCallGroq(_batchItems[idx].dataUrl);
    _batchItems[idx].name        = toTitleCase(_cleanAiName(parsed.name || ''));
    _batchItems[idx].description = formatDescription(parsed.description || '') || '';
    const match = parsed.category ? categories.find(c => c.code === parsed.category) : null;
    _batchItems[idx].category    = match ? match.code : '';
    _batchItems[idx].status      = 'done';
  } catch (err) {
    console.error('Batch IA error:', err);
    _batchItems[idx].status = 'error';
    _batchItems[idx].error = err?.message || 'Error — reintenta';
    toast('Error IA: ' + _batchItems[idx].error, 'error');
  }
  _batchRenderCards();
}

async function _batchAnalyzeAll() {
  if (!groqApiKey) { toast('Configura la Groq API key en Configuración primero', 'error'); return; }
  const btn = document.getElementById('batch-analyze-all-btn');
  const origBtnLabel = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = `${_BATCH_ICON_SPIN}Analizando…`;
  for (let i = 0; i < _batchItems.length; i++) {
    if (_batchItems[i].status === 'analyzing') continue;
    _batchItems[i].status = 'analyzing';
    _batchItems[i].error = '';
    _batchRenderCards();
    try {
      const parsed = await _batchCallGroq(_batchItems[i].dataUrl);
      _batchItems[i].name        = toTitleCase(_cleanAiName(parsed.name || ''));
      _batchItems[i].description = formatDescription(parsed.description || '') || '';
      const match = parsed.category ? categories.find(c => c.code === parsed.category) : null;
      _batchItems[i].category    = match ? match.code : '';
      _batchItems[i].status      = 'done';
    } catch (err) {
      console.error('Batch IA error:', err);
      _batchItems[i].status = 'error';
      _batchItems[i].error = err?.message || 'Error — reintenta';
    }
    _batchRenderCards();
    if (i < _batchItems.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  btn.disabled = false; btn.innerHTML = origBtnLabel;
  const failed = _batchItems.filter(item => item.status === 'error');
  if (failed.length) {
    const firstError = failed[0].error || 'No disponible';
    toast(`IA: ${failed.length} imagen${failed.length !== 1 ? 'es' : ''} sin analizar — ${firstError}`, 'error');
  }
}

async function _batchPublish() {
  const toPublish = _batchItems.filter(it => it.name.trim());
  if (!toPublish.length) return;
  const btn = document.getElementById('batch-publish-btn');
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    const maxResult = await supabaseApi('products?select=id&order=id.desc&limit=1');
    let nextId = (maxResult.ok && maxResult.data?.length) ? maxResult.data[0].id + 1 : 1;
    let created = 0;
    for (const item of toPublish) {
      // Intentar subir a Drive, fallback a base64
      let imageUrl = item.dataUrl;
      if (driveEp && driveSecret) {
        try { imageUrl = await uploadToDrive(item.dataUrl); } catch(_) {}
      }
      const catObj = categories.find(c => c.code === item.category);
      const payload = {
        id: nextId, name: item.name.trim(),
        description: item.description.trim() || null,
        category: item.category || 'por_revisar',
        category_label: catObj?.label || 'Por revisar',
        price: 0, image: imageUrl,
        is_published: false, out_of_stock: false,
        stock: 1, featured: false, position: nextId,
        created_by: getCurrentUserEmail()
      };
      const { ok } = await supabaseApi('products', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(payload)
      });
      if (ok) {
        products.unshift({ ...payload, originalPrice: null, badge: null, badgeType: null, cost: null, createdBy: payload.created_by });
        logActivity('producto_creado', `Creó "${payload.name}" — carga masiva`, { id: nextId, name: payload.name, price: 0 });
        created++;
        nextId++;
      }
    }
    renderTable();
    renderStats();
    toast(`✓ ${created} producto${created !== 1 ? 's' : ''} creado${created !== 1 ? 's' : ''} — ajusta precio y publica en web cuando estén listos`, 'success');
    closeBatchUpload();
  } catch (err) {
    console.error('Batch publish error:', err);
    toast('Error al publicar — revisa la consola', 'error');
    btn.disabled = false;
    btn.textContent = `Publicar ${toPublish.length} productos`;
  }
}

/* ══════════════════════════════════════════════════════
   COMPARE MODAL — comparación lado a lado + IA
   ══════════════════════════════════════════════════════ */

let _compareIds = [];

function openCompareModal() {
  if (selectedIds.size !== 2) return;
  _compareIds = [...selectedIds];
  const [a, b] = _compareIds.map(id => products.find(p => p.id === id));
  if (!a || !b) return;

  document.getElementById('compare-col-a').innerHTML = _renderCmpCol(a, b.id);
  document.getElementById('compare-col-b').innerHTML = _renderCmpCol(b, a.id);

  // Render keep/delete actions
  const actions = document.getElementById('compare-actions');
  if (can.deleteProduct) {
    actions.innerHTML = `
      <button class="cmp-keep-btn" onclick="_cmpKeep(${a.id},${b.id})">✓ Quedarme con <b>${_esc(_truncate(a.name,22))}</b><br><small style="font-weight:400;opacity:.7">Eliminar el otro</small></button>
      <button class="cmp-keep-btn" onclick="_cmpKeep(${b.id},${a.id})">✓ Quedarme con <b>${_esc(_truncate(b.name,22))}</b><br><small style="font-weight:400;opacity:.7">Eliminar el otro</small></button>`;
  } else {
    actions.innerHTML = `<div style="font-size:.8rem;color:var(--muted);grid-column:1/-1;text-align:center">Solo el administrador puede eliminar productos</div>`;
  }

  document.getElementById('compare-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal() {
  document.getElementById('compare-modal').classList.remove('open');
  document.body.style.overflow = '';
  _compareIds = [];
}

function openCmpZoom() {
  const [idA, idB] = _compareIds;
  const a = products.find(p => p.id === idA);
  const b = products.find(p => p.id === idB);
  if (!a || !b) return;
  const fill = (el, prod) => {
    el.innerHTML = `<img src="${prod.image || DEFAULT_IMG}" onerror="this.src='${DEFAULT_IMG}'" alt="${_esc(prod.name)}">
      <div class="cmp-zoom-label">${_esc(prod.name)}</div>`;
  };
  fill(document.getElementById('cmp-zoom-a'), a);
  fill(document.getElementById('cmp-zoom-b'), b);
  document.getElementById('cmp-zoom').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCmpZoom() {
  document.getElementById('cmp-zoom').classList.remove('open');
  document.body.style.overflow = 'hidden'; // compare modal still open
}

function _truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : (str || '');
}

function _renderCmpCol(p, otherId) {
  const margin = p.cost && p.price ? Math.round((p.price - p.cost) / p.price * 100) : null;
  const marginClass = margin === null ? '' : margin >= 30 ? 'green' : margin >= 10 ? 'amber' : 'red';

  const chips = [];
  if (p.isPublished) chips.push('<span class="cmp-chip green"><svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>Publicado</span>');
  else chips.push('<span class="cmp-chip"><svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:2px"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>Oculto</span>');
  if (p.featured) chips.push('<span class="cmp-chip amber"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-1px;margin-right:2px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Destacado</span>');
  if (p.outOfStock || p.stock === 0) chips.push('<span class="cmp-chip red">Agotado</span>');
  else chips.push(`<span class="cmp-chip green">Stock: ${p.stock}</span>`);
  if (p.barcode) chips.push(`<span class="cmp-chip"><svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><line x1="4" y1="6" x2="4" y2="18"/><line x1="8" y1="6" x2="8" y2="18"/><line x1="11" y1="6" x2="11" y2="18"/><line x1="14" y1="6" x2="14" y2="18"/><line x1="18" y1="6" x2="18" y2="18"/><line x1="20" y1="6" x2="20" y2="18"/></svg> ${_esc(p.barcode)}</span>`);

  return `
    <img class="cmp-img" src="${p.image || DEFAULT_IMG}" onerror="this.src='${DEFAULT_IMG}'" loading="lazy" onclick="openCmpZoom()" style="cursor:zoom-in" title="Ver ambas imágenes en grande">
    <div class="cmp-name">${_esc(p.name)}</div>
    <div class="cmp-meta">${_esc(p.categoryLabel || '—')}${p.createdBy ? ` · <svg width="11" height="11" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${_esc(_creatorName(p.createdBy))}` : ''} · #${p.id}</div>
    <div class="cmp-price">$${(p.price || 0).toLocaleString('es-MX')} <span style="font-size:.75rem;font-weight:400;color:var(--muted)">MXN</span>${p.originalPrice ? `<s>$${p.originalPrice.toLocaleString('es-MX')}</s>` : ''}</div>
    ${margin !== null ? `<div class="cmp-meta"><span class="cmp-chip ${marginClass}">Costo $${p.cost.toLocaleString('es-MX')} · Margen ${margin}%</span></div>` : ''}
    <div>${chips.join('')}</div>
    ${p.description ? `<div class="cmp-desc">${_esc(p.description)}</div>` : ''}
  `;
}

async function _cmpKeep(keepId, deleteId) {
  if (!can.deleteProduct) return;
  const del = products.find(p => p.id === deleteId);
  if (!del) return;
  if (!confirm(`¿Eliminar "${del.name}"?\n\nSe quedará el otro producto. Esta acción no se puede deshacer.`)) return;

  const btns = document.querySelectorAll('.cmp-keep-btn');
  btns.forEach(b => b.disabled = true);

  const result = await supabaseApi(`products?id=eq.${deleteId}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' }
  });

  if (!result.ok) {
    btns.forEach(b => b.disabled = false);
    toast('Error al eliminar', 'error');
    return;
  }

  logActivity('producto_eliminado', `Eliminó "${del.name}" (duplicado)`, { id: deleteId, name: del.name });
  products = products.filter(p => p.id !== deleteId);
  selectedIds.delete(deleteId);
  selectedIds.delete(keepId);
  if (_qvCurrentId === deleteId) closeQV();
  closeCompareModal();
  renderTable();
  renderStats();
  updateBulkBar();
  toast(`"${del.name}" eliminado — se quedó el producto seleccionado`);
}

// --- Interceptor global de escáner USB ---
// Detecta ráfagas de caracteres (< 50ms entre cada uno) = escáner, no teclado humano
;(function(){
  let buf = '', t = null;

  document.addEventListener('keydown', e => {
    if (!e.isTrusted) return; // ignorar eventos sintéticos para evitar loop
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const active = document.activeElement;
    const tag = active?.tagName?.toUpperCase();
    // No interceptar si el cursor ya está en otro campo (formulario, textarea, etc.)
    const inOtherInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      && active.id !== 'search-input';
    if (inOtherInput) return;
    // No interceptar si hay un modal abierto
    if (document.querySelector('#form-overlay[style*="flex"], #qv-overlay.active, .modal-overlay.open')) return;

    if (e.key === 'Enter') {
      if (buf.length >= 4) {
        e.preventDefault();
        const code = buf;
        const exactMatch = products.find(p => p.barcode && p.barcode === code);
        if (exactMatch) {
          showScanResult(exactMatch.id);
        } else {
          const si = document.getElementById('search-input');
          if (si) {
            si.value = code;
            si.dispatchEvent(new Event('input', { bubbles: true }));
            si.focus();
          }
        }
      }
      buf = '';
      clearTimeout(t);
      return;
    }

    if (e.key.length === 1) {
      buf += e.key;
      clearTimeout(t);
      // Si pasan más de 50ms sin otro carácter, no es escáner — resetear
      t = setTimeout(() => { buf = ''; }, 50);
    }
  });
})();
