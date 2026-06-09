/* ══ MODO CAPTURA RÁPIDA ═════════════════════════════════════════════ */
let captureCount = 0;
let captureImageDataUrl = null;

function openCaptureMode() {
  resetCaptureForm(true);
  document.getElementById('cap-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function _capIsDirty() {
  const name  = document.getElementById('cap-name')?.value.trim();
  const price = document.getElementById('cap-price')?.value.trim();
  return !!(captureImageDataUrl || name || price);
}

function closeCaptureMode(force) {
  if (!force && _capIsDirty()) {
    if (!confirm('Tienes datos sin guardar en captura rápida. ¿Salir de todas formas?')) return;
  }
  document.getElementById('cap-overlay').style.display = 'none';
  document.body.style.overflow = '';
  if (captureCount > 0) {
    // Cambiar a Recientes para ver los productos recién capturados
    const sortSel = document.getElementById('sort-select');
    if (sortSel) { sortSel.value = 'recent'; currentSort = 'recent'; }
    renderTable();
    renderStats();
  }
  captureCount = 0;
}

function resetCaptureForm(keepCount) {
  captureImageDataUrl = null;
  document.getElementById('cap-file').value = '';
  const prev = document.getElementById('cap-preview-img');
  prev.style.display = 'none'; prev.src = '';
  document.getElementById('cap-photo-ph').style.display = 'flex';
  document.getElementById('cap-retake-btn').style.display = 'none';
  document.getElementById('cap-photo-area').classList.remove('has-photo');
  document.getElementById('cap-ai-status').style.display = 'none';
  const spin = document.getElementById('cap-ai-spin');
  const ico  = document.getElementById('cap-ai-icon');
  if (spin) { spin.style.display = 'block'; }
  if (ico)  { ico.style.display  = 'none'; }
  const nameEl  = document.getElementById('cap-name');
  const priceEl = document.getElementById('cap-price');
  nameEl.value  = '';
  priceEl.value = '';
  nameEl.classList.remove('cap-err');
  priceEl.classList.remove('cap-err');
  const stockEl = document.getElementById('cap-stock');
  if (stockEl) stockEl.value = '1';
  const capBarcode = document.getElementById('cap-barcode'); if (capBarcode) capBarcode.value = '';
  const capCat = document.getElementById('cap-category'); if (capCat) capCat.value = 'por_revisar';
  const saveBtn = document.getElementById('cap-save-btn');
  if (saveBtn) saveBtn.textContent = 'Guardar y siguiente →';
  updateCapSaveBtn();
}

async function handleCapturePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const raw = new Image();
    raw.onload = async () => {
      // Comprimir igual que el formulario: max 900px, JPEG 0.82
      const canvas = document.createElement('canvas');
      const MAX = 900;
      let w = raw.width, h = raw.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(raw, 0, 0, w, h);
      captureImageDataUrl = canvas.toDataURL('image/jpeg', 0.82);

      const img = document.getElementById('cap-preview-img');
      img.src = captureImageDataUrl;
      img.style.display = 'block';
      document.getElementById('cap-photo-ph').style.display = 'none';
      document.getElementById('cap-retake-btn').style.display = 'block';
      document.getElementById('cap-photo-area').classList.add('has-photo');
      updateCapSaveBtn();
      await runCaptureAI();
    };
    raw.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function _capSetAIStatus(done, icon, text) {
  const spin = document.getElementById('cap-ai-spin');
  const ico  = document.getElementById('cap-ai-icon');
  const msg  = document.getElementById('cap-ai-msg');
  if (done) {
    spin.style.display = 'none';
    ico.style.display  = 'inline';
    ico.textContent    = icon;
  } else {
    spin.style.display = 'block';
    ico.style.display  = 'none';
  }
  msg.textContent = text;
}

function _capMatchCategory(code) {
  if (!code) return null;
  const norm = code.toLowerCase().trim();
  // 1. Exacto
  let m = categories.find(c => c.code === norm);
  if (m) return m;
  // 2. Label exacto (case insensitive)
  m = categories.find(c => c.label.toLowerCase() === norm);
  if (m) return m;
  // 3. Código empieza con lo que devolvió la IA (ej: "natura" → "natura_perfumes")
  m = categories.find(c => c.code.startsWith(norm + '_'));
  if (m) return m;
  // 4. Lo que devolvió la IA empieza con el código de categoría (ej: IA dijo "natura_algo" pero solo existe "natura")
  m = categories.find(c => norm.startsWith(c.code));
  if (m) return m;
  // 5. Label contiene la palabra (ej: IA dijo "bolsas" → label "Bolsos & Mochilas")
  m = categories.find(c => c.label.toLowerCase().includes(norm) || norm.includes(c.label.toLowerCase()));
  if (m) return m;
  return null;
}

async function runCaptureAI() {
  if (!captureImageDataUrl || !groqApiKey) {
    if (!groqApiKey) toast('Configura la IA en Configuración', 'error');
    return;
  }
  document.getElementById('cap-ai-status').style.display = 'flex';
  _capSetAIStatus(false, '', 'Analizando imagen con IA...');
  try {
    const catList = categories.map(c => '"' + c.code + '" (' + c.label + ')').join(', ');
    const sysP = 'Eres copywriter senior para Tres Encantos. Copy listo para publicar, nivel Sephora/Liverpool/Amazon MX.\n\nPASO 0: lee TODO el texto del empaque (marca, línea, concentración, variante, ml/g, género) antes de escribir.\n\nTÍTULO NATURA: Natura [Línea] [Tipo] [Variante] [ml/g] [Género]. Líneas: Kaiak, Essencial, Una, Humor, Nativa, Plant, Tododia, Ekos, Chronos, Mamá Terra, Lumina, Luna, Faces, Amó. Ej: "Natura Kaiak Desodorante Colônia Clásico 100ml Masculino".\n\nTÍTULO AVON: Avon [Línea] [Tipo] [Variante] [ml/g]. Líneas: Anew, Skin So Soft, Far Away, Black Suede, Luck, Perceive, True Color. Ej: "Avon Far Away Eau de Parfum 50ml Femenino", "Avon Anew Sérum Retinol 30ml".\n\nTÍTULO GENERAL: [Marca] + [Tipo] + [Material/Acabado] + [Color].\n\nDESCRIPCIÓN PREMIUM — empieza con verbo activo o ingrediente, nunca "Este es...":\n• Perfume/Colonia Natura o Avon → "[Familia olfativa] de [notas] que [efecto]."\n• Crema/Loción Natura o Avon → "[Ingrediente] que [beneficio]. [Textura/resultado]."\n• Maquillaje → "[Acabado] que [beneficio extra]. [Tono/look ideal]."\n• Bolso/Cartera → "[Material] que [funcionalidad]. [Ocasión]."\n\nCATEGORÍA — si ves marca Avon o líneas Avon → avon_perfumes/avon_cuerpo/avon_facial/avon_maquillaje. Si ves Natura → natura_perfumes/natura_cuerpo/natura_facial/natura_cabello/natura_maquillaje. Bolso grande → bolsos; cartera → accesorios; labial/sombra → maquillaje. "" si duda.\n\nPROHIBIDO: "bonito","elegante","especial","hermoso". Sin SKUs. Español de México.';
    const usrP = 'PASO 0: escanea la imagen — marca, línea, concentración, variante, ml/g, género. Devuelve SOLO JSON válido sin markdown.\n\nOBLIGATORIOS:\n- "name": 45-70 chars. Natura: línea+tipo+variante+ml+género. Otros: marca+tipo+material+color. NUNCA uses EDP/EDT/EDC — escribe "Perfume", "Colonia" o "Eau de Parfum" completo.\n- "description": copy listo para publicar, máx 160 chars. Fórmula según tipo. Empieza con verbo o ingrediente, nunca "Este es...".\n\nOPCIONALES (null o "" si dudas):\n- "category": código exacto según mapeo del sistema. Opciones: ' + catList + '\n- "price": número de etiqueta/plumón/empaque (ej: 350). Solo dígitos. NO confundas con ml, oz, g, tallas, %, códigos. null si duda.\n\n{"name":"...","description":"...","category":"","price":null}';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqApiKey },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: sysP },
          { role: 'user', content: [{ type: 'text', text: usrP }, { type: 'image_url', image_url: { url: captureImageDataUrl } }] }
        ],
        temperature: 0.3, max_tokens: 500
      })
    });
    if (!res.ok) throw new Error('Error ' + res.status);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Sin JSON');
    const p = JSON.parse(jsonMatch[0]);
    const flash = id => { const el = document.getElementById(id); if (!el) return; el.classList.add('ai-filled'); setTimeout(() => el.classList.remove('ai-filled'), 1200); };
    if (p.name)  { document.getElementById('cap-name').value = toTitleCase(p.name); flash('cap-name'); }
    if (p.price) { const n = Number(p.price); if (!isNaN(n) && n > 0 && n < 100000) { document.getElementById('cap-price').value = Math.round(n); flash('cap-price'); } }
    const catMatch = _capMatchCategory(p.category);
    const sel = document.getElementById('cap-category');
    if (catMatch) {
      sel.value = catMatch.code;
      if (sel.value === catMatch.code) flash('cap-category');
    } else {
      sel.value = 'por_revisar';
    }
    const catSet = !!catMatch;
    const filled = [p.name ? 'nombre' : null, (p.price && Number(p.price) > 0) ? 'precio' : null, catSet ? 'categoría' : '⚠️ sin categoría — quedó en "Por revisar"'].filter(Boolean);
    _capSetAIStatus(true, catSet ? '✓' : '⚠️', filled.join(', '));
    updateCapSaveBtn();
  } catch (err) {
    _capSetAIStatus(true, '⚠️', 'IA no disponible — completa manualmente');
  }
}

function updateCapSaveBtn() {
  const name  = document.getElementById('cap-name')?.value.trim();
  const ok    = !!name;
  document.getElementById('cap-save-btn').disabled = !ok;
  const hint = document.getElementById('cap-require-hint');
  if (!hint) return;
  hint.textContent = ok ? '' : '⚠️ Falta el nombre del producto';
}

async function saveCaptureProduct() {
  const name  = document.getElementById('cap-name').value.trim();
  const price = parseFloat(document.getElementById('cap-price').value) || 0;
  const stock = Math.max(1, parseInt(document.getElementById('cap-stock')?.value) || 1);
  if (!name) return;
  const btn = document.getElementById('cap-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const barcode = document.getElementById('cap-barcode')?.value.trim() || null;
    // Consultar el ID máximo real en Supabase para evitar conflictos de primary key
    const maxResult = await supabaseApi('products?select=id&order=id.desc&limit=1');
    const maxId = (maxResult.ok && maxResult.data?.length) ? maxResult.data[0].id : 0;
    const newId = maxId + 1;
    const capCatCode  = document.getElementById('cap-category')?.value || 'por_revisar';
    const capCatMatch = categories.find(c => c.code === capCatCode);
    // Subir imagen a Drive antes de guardar
    let captureImgFinal = captureImageDataUrl || '';
    if (captureImgFinal && driveEp && driveSecret) {
      const driveUrl = await uploadToDrive(captureImgFinal);
      if (driveUrl) captureImgFinal = driveUrl;
    }
    const payload = {
      id: newId, name, price,
      description: '',
      category: capCatMatch ? capCatMatch.code : 'por_revisar',
      category_label: capCatMatch ? capCatMatch.label : 'Por revisar',
      image: captureImgFinal,
      is_published: false, out_of_stock: false,
      stock, featured: false, position: newId,
      barcode, created_by: getCurrentUserEmail()
    };
    const { ok, data: saveData } = await supabaseApi('products', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload)
    });
    if (!ok) {
      const msg = saveData?.message || saveData?.error || JSON.stringify(saveData);
      console.error('Supabase error captura rápida:', msg);
      throw new Error(msg);
    }
    products.unshift({ ...payload, originalPrice: null, badge: null, badgeType: null, barcode, cost: null, createdBy: payload.created_by });
    _trackEdit(newId);
    logActivity('producto_creado', `Creó "${name}" — $${(price||0).toLocaleString('es-MX')}`, { id: newId, name, price });
    captureCount++;
    const counter = document.getElementById('cap-counter');
    counter.textContent = '✓ ' + captureCount + ' capturado' + (captureCount > 1 ? 's' : '');
    counter.style.display = 'inline-block';
    toast('"' + name + '" guardado ✓', 'success');
    resetCaptureForm(true);
  } catch (e) {
    const msg = e?.message && e.message !== 'Error Supabase' ? e.message : 'Error al guardar — intenta de nuevo';
    toast(msg.length > 80 ? 'Error al guardar — intenta de nuevo' : msg, 'error');
    console.error('saveCaptureProduct error:', e);
    btn.disabled = false; btn.textContent = 'Guardar y siguiente →';
  }
}

/* ── SWIPE DOWN TO CLOSE (captura rápida mobile) ── */
(function initAdminSwipeGestures() {
  function swipeDown(sheetEl, closeFn, overlayEl) {
    if (!sheetEl) return;
    let startY = 0, curY = 0, on = false;
    sheetEl.addEventListener('touchstart', e => { startY = e.touches[0].clientY; on = false; curY = 0; }, { passive: true });
    sheetEl.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      if (!on) { if (dy < 10) return; const sc = sheetEl.querySelector('.cap-body'); if (sc && sc.scrollTop > 4) return; on = true; }
      curY = Math.max(0, dy);
      sheetEl.style.transition = 'none';
      sheetEl.style.transform  = `translateY(${curY}px)`;
      if (overlayEl) overlayEl.style.opacity = String(Math.max(0, 1 - curY / 180));
    }, { passive: true });
    sheetEl.addEventListener('touchend', () => {
      if (!on) return; on = false;
      if (curY > 90) {
        sheetEl.style.transition = 'transform .22s ease-in';
        sheetEl.style.transform  = 'translateY(110%)';
        if (overlayEl) overlayEl.style.opacity = '0';
        setTimeout(() => { closeFn(); sheetEl.style.transform = sheetEl.style.transition = ''; if (overlayEl) overlayEl.style.opacity = ''; }, 230);
      } else {
        sheetEl.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
        sheetEl.style.transform  = 'translateY(0)';
        if (overlayEl) overlayEl.style.opacity = '';
        setTimeout(() => { sheetEl.style.transform = sheetEl.style.transition = ''; }, 280);
      }
      curY = 0;
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    swipeDown(document.querySelector('.cap-modal'),
      () => { if (!_capIsDirty() || confirm('Tienes datos sin guardar. ¿Salir de todas formas?')) closeCaptureMode(true); },
      document.getElementById('cap-overlay'));
  });
})();

/* ── MODAL COMPARAR SIMILAR ─────────────────────────────────────────── */
let _simCurrent = 0;

function openSimilarModal(index) {
  _simCurrent = index;
  _renderSimilarModal();
  document.getElementById('sim-overlay').classList.add('open');
}

function closeSimilarModal() {
  document.getElementById('sim-overlay').classList.remove('open');
}

function simGoEdit() {
  const id = window._simIds?.[_simCurrent];
  if (!id) return;
  closeSimilarModal();
  closeForm();
  openForm(id);
}

function _renderSimilarModal() {
  const id = window._simIds?.[_simCurrent];
  const p  = products.find(x => x.id === id);
  if (!p) return;

  document.getElementById('sim-img').src    = p.image || '';
  document.getElementById('sim-img').alt    = p.name;
  document.getElementById('sim-cat').textContent   = p.category_label || p.categoryLabel || '';
  document.getElementById('sim-name').textContent  = p.name;
  document.getElementById('sim-price').textContent = `$${(p.price||0).toLocaleString('es-MX')} MXN`;
  document.getElementById('sim-stock').textContent = p.stock ?? '—';

  const nav = document.getElementById('sim-nav');
  const total = window._simIds?.length || 1;
  if (total <= 1) { nav.style.display = 'none'; return; }
  nav.style.display = 'flex';
  nav.innerHTML = window._simIds.map((_, i) =>
    `<button class="sim-dot${i === _simCurrent ? ' active' : ''}" onclick="openSimilarModal(${i})"></button>`
  ).join('');
}
