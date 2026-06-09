/* ── CONFIG GLOBAL (Supabase — disponible en todos los dispositivos) ── */
let groqApiKey   = null;
let driveEp      = null;
let driveSecret  = null;
let _showCreator = false;
let _showBatch   = false;
let _showRecv    = false;
let _userNames   = {};  // { "email@x.com": "Nombre visible" }

function _creatorName(email) {
  if (!email) return '';
  const name = _userNames[email] || email.split('@')[0];
  return name.charAt(0).toUpperCase();
}

async function loadAppConfig() {
  const r = await supabaseApi('config?id=in.(groq_key,drive_ep,drive_secret,wa_float,captura_rapida,dismissed_dups,show_creator,show_batch,show_recv,user_names)&select=id,value');
  if (r.ok && r.data) {
    r.data.forEach(row => {
      if (row.id === 'groq_key')     groqApiKey  = row.value || null;
      if (row.id === 'drive_ep')     driveEp     = row.value || null;
      if (row.id === 'drive_secret') driveSecret = row.value || null;
      if (row.id === 'dismissed_dups') {
        try { _dismissedDupsCache = new Set(JSON.parse(row.value || '[]')); }
        catch { _dismissedDupsCache = new Set(); }
      }
      if (row.id === 'wa_float') {
        const toggle = document.getElementById('wa-float-toggle');
        if (toggle) toggle.checked = row.value !== 'false';
      }
      if (row.id === 'captura_rapida') {
        // false solo si está explícitamente desactivado; por defecto activo
        if (row.value === 'false') {
          document.getElementById('btn-capture-mode')?.style.setProperty('display', 'none');
        }
      }
      if (row.id === 'show_creator') {
        _showCreator = row.value === 'true';
        const toggle = document.getElementById('show-creator-toggle');
        if (toggle) toggle.checked = _showCreator;
        _refreshCreatorFilter();
      }
      if (row.id === 'show_batch') {
        _showBatch = row.value === 'true';
        const btn = document.getElementById('btn-batch-upload');
        if (btn && ROLE === 'superadmin') {
          _showBatch ? btn.style.removeProperty('display') : btn.style.setProperty('display', 'none');
        }
      }
      if (row.id === 'show_recv') {
        _showRecv = row.value === 'true';
        const btn = document.getElementById('btn-recv-mode');
        if (btn) _showRecv ? btn.style.removeProperty('display') : btn.style.setProperty('display', 'none');
      }
      if (row.id === 'user_names') {
        try { _userNames = JSON.parse(row.value || '{}'); } catch { _userNames = {}; }
      }
    });
  }
  // Migración automática: si había config en localStorage la subimos a Supabase una sola vez
  const migrations = [];
  if (_dismissedDupsCache === null) {
    // dismissed_dups no existe en Supabase aún — migrar desde localStorage si hay datos
    const localDups = localStorage.getItem(_DUP_DISMISS_KEY);
    if (localDups && localDups !== '[]') {
      try {
        _dismissedDupsCache = new Set(JSON.parse(localDups));
        migrations.push(
          supabaseApi('config', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'dismissed_dups', value: localDups }) })
        );
      } catch { _dismissedDupsCache = new Set(); }
    } else {
      _dismissedDupsCache = new Set();
    }
  }
  if (!driveEp) {
    const oldEp = localStorage.getItem('te_drive_ep');
    const oldSecret = localStorage.getItem('te_drive_secret');
    if (oldEp && oldSecret) {
      driveEp = oldEp; driveSecret = oldSecret;
      migrations.push(
        supabaseApi('config', { method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id:'drive_ep',     value: oldEp}) }),
        supabaseApi('config', { method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id:'drive_secret', value: oldSecret}) })
      );
    }
  }
  if (!groqApiKey) {
    const oldKey = localStorage.getItem('te_groq_key');
    if (oldKey) {
      groqApiKey = oldKey;
      migrations.push(
        supabaseApi('config', { method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify({id:'groq_key', value: oldKey}) })
      );
    }
  }
  if (migrations.length) await Promise.all(migrations);
  loadDriveConfig();
  loadGroqKeyStatus();
}

function loadDriveConfig() {
  const epInput   = document.getElementById('drive-endpoint-input');
  const secInput  = document.getElementById('drive-secret-input');
  const statusTxt = document.getElementById('drive-status-txt');
  if (!epInput) return;
  if (driveEp && driveSecret) {
    epInput.value  = driveEp;
    secInput.value = driveSecret;
    statusTxt.textContent = '✓ Conectado — imágenes nuevas van a Drive';
    statusTxt.style.color = 'var(--green)';
    document.getElementById('drive-test-btn')?.style && (document.getElementById('drive-test-btn').style.display = '');
    document.getElementById('drive-clear-btn')?.style && (document.getElementById('drive-clear-btn').style.display = '');
  }
}

function loadGroqKeyStatus() {
  const el = document.getElementById('groq-key-status');
  if (!el) return;
  if (groqApiKey) {
    el.textContent = '✓ Configurado — IA activa en todos los dispositivos';
    el.style.color = 'var(--green)';
  }
}

async function toggleWaFloat(enabled) {
  const r = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'wa_float', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '💬 Botón WhatsApp activado en Tienda' : '💬 Botón WhatsApp desactivado en Tienda', 'success');
  } else {
    toast('Error al guardar configuración', 'error');
    const toggle = document.getElementById('wa-float-toggle');
    if (toggle) toggle.checked = !enabled;
  }
}

async function saveGroqKey() {
  const val = document.getElementById('groq-key-input')?.value.trim();
  if (!val || !val.startsWith('gsk_')) { toast('Ingresa una key válida de Groq (empieza con gsk_)', 'error'); return; }
  const r = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'groq_key', value: val })
  });
  if (r.ok) {
    groqApiKey = val;
    loadGroqKeyStatus();
    toast('🤖 Groq key guardada — IA disponible para todos los usuarios ✓', 'success');
  } else { toast('Error al guardar la key', 'error'); }
}

async function saveDriveEndpoint() {
  const ep = document.getElementById('drive-endpoint-input').value.trim();
  if (!ep) { toast('Pega primero la URL del Apps Script', 'error'); return; }
  if (!driveSecret) {
    driveSecret = 'te_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  driveEp = ep;
  await Promise.all([
    supabaseApi('config', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'drive_ep', value: ep }) }),
    supabaseApi('config', { method: 'POST', headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'drive_secret', value: driveSecret }) })
  ]);
  document.getElementById('drive-secret-input').value = driveSecret;
  const statusTxt = document.getElementById('drive-status-txt');
  statusTxt.textContent = '✓ Conectado — imágenes nuevas van a Drive';
  statusTxt.style.color = 'var(--green)';
  document.getElementById('drive-test-btn').style.display = '';
  document.getElementById('drive-clear-btn').style.display = '';
  toast('Drive guardado — copia el secreto del campo gris y pégalo en tu Apps Script', 'success');
}

function copyDriveSecret() {
  const val = document.getElementById('drive-secret-input').value;
  if (!val) return;
  navigator.clipboard.writeText(val)
    .then(() => toast('Secreto copiado al portapapeles ✓', 'success'))
    .catch(() => { document.getElementById('drive-secret-input').select(); toast('Selecciona el texto y copia con Ctrl+C / ⌘C', ''); });
}

async function clearDrive() {
  if (!confirm('¿Desconectar Google Drive? Las imágenes futuras se guardarán como base64.')) return;
  await Promise.all([
    supabaseApi('config?id=eq.drive_ep',     { method: 'DELETE' }),
    supabaseApi('config?id=eq.drive_secret', { method: 'DELETE' })
  ]);
  driveEp = null; driveSecret = null;
  document.getElementById('drive-endpoint-input').value = '';
  document.getElementById('drive-secret-input').value = '';
  document.getElementById('drive-status-txt').textContent = '(no configurado)';
  document.getElementById('drive-status-txt').style.color = '';
  document.getElementById('drive-test-btn').style.display = 'none';
  document.getElementById('drive-clear-btn').style.display = 'none';
  toast('Drive desconectado', '');
}

async function testDriveEndpoint() {
  if (!driveEp) return;
  const btn = document.getElementById('drive-test-btn');
  btn.textContent = 'Probando…'; btn.disabled = true;
  try {
    const r = await fetch(driveEp);
    const txt = await r.text();
    toast(txt === 'OK' ? 'Conexión con Drive OK ✓' : 'Respuesta inesperada: ' + txt, txt === 'OK' ? 'success' : 'error');
  } catch(e) { toast('Error al conectar con Drive: ' + e.message, 'error'); }
  btn.textContent = 'Probar'; btn.disabled = false;
}

/* Extrae el file ID de una URL de Drive thumbnail */
function _driveFileId(url) {
  if (!url || !url.includes('drive.google.com')) return null;
  const m = url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

/* Manda el archivo a la papelera de Drive (fire-and-forget, nunca bloquea) */
async function _deleteDriveFile(fileId) {
  if (!driveEp || !driveSecret || !fileId) return;
  try {
    await fetch(driveEp, {
      method: 'POST',
      body: JSON.stringify({ secret: driveSecret, action: 'delete', fileId })
    });
  } catch { /* silencioso — el borrado nunca bloquea el flujo principal */ }
}

async function uploadToDrive(b64) {
  if (!driveEp || !driveSecret) return null;
  try {
    const res = await fetch(driveEp, {
      method: 'POST',
      body: JSON.stringify({ secret: driveSecret, image: b64, name: `producto_${Date.now()}.jpg` })
    });
    const data = await res.json();
    if (!data.ok) {
      const msg = (data.error || '').toLowerCase().includes('autorizado')
        ? 'Drive: secreto incorrecto — ve a Herramientas → Google Drive, copia el secreto del campo gris y pégalo en tu Apps Script'
        : `Drive: ${data.error || 'Error al subir imagen'}`;
      toast(msg, 'error');
    }
    return data.ok ? data.url : null;
  } catch(e) {
    toast('Drive no responde — imagen guardada localmente', 'error');
    return null;
  }
}

async function migrateBase64ToDrive() {
  const toMigrate = products.filter(p => p.image?.startsWith('data:'));
  if (!toMigrate.length) { toast('No hay imágenes base64 que migrar', ''); return; }
  if (!driveEp || !driveSecret) { toast('Configura Google Drive primero en Herramientas → Google Drive', 'error'); return; }
  if (!confirm(`¿Migrar ${toMigrate.length} imágenes a Google Drive automáticamente?\n\nTarda ~${toMigrate.length} segundos. No cierres la ventana.`)) return;

  // Crear overlay de progreso
  const overlay = document.createElement('div');
  overlay.id = 'migrate-progress';
  overlay.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--charcoal);color:#fff;padding:14px 20px;border-radius:12px;font-size:.85rem;z-index:9999;min-width:260px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  document.body.appendChild(overlay);

  const setProgress = (cur, total, name) => {
    overlay.innerHTML = `<div style="font-weight:600;margin-bottom:6px">Migrando imágenes a Drive…</div>
      <div style="background:#444;border-radius:6px;height:6px;margin-bottom:8px">
        <div style="background:var(--gold);height:6px;border-radius:6px;width:${Math.round(cur/total*100)}%;transition:width .3s"></div>
      </div>
      <div style="color:var(--muted-light);font-size:.78rem">${cur}/${total} — ${name}</div>`;
  };

  let ok = 0, fail = 0;
  for (let i = 0; i < toMigrate.length; i++) {
    const p = toMigrate[i];
    setProgress(i, toMigrate.length, p.name.slice(0, 35));
    const url = await uploadToDrive(p.image);
    if (url) {
      const res = await supabaseApi(`products?id=eq.${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ image: url })
      });
      if (res.ok) {
        const idx = products.findIndex(x => x.id === p.id);
        if (idx > -1) products[idx].image = url;
        ok++;
      } else { fail++; }
    } else { fail++; }
    await new Promise(r => setTimeout(r, 600));
  }

  overlay.remove();
  renderTable();
  renderStats();
  if (fail === 0) {
    toast(`✓ ${ok} imágenes migradas a Drive — egress reducido`, 'success');
  } else {
    toast(`${ok} migradas, ${fail} fallidas — revisa la conexión con Drive`, 'error');
  }
}

/* ── IMAGE UPLOAD ── */
let imageUploadController = null;
let currentFormImageDataUrl = null; // base64 de la imagen actual para análisis IA

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('save-btn').disabled = true;
  compressAndPreview(file);
}

function compressAndPreview(file) {
  if (imageUploadController) imageUploadController.abort();
  const controller = new AbortController();
  imageUploadController = controller;

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      if (controller.signal.aborted) return;
      const canvas = document.createElement('canvas');
      const MAX = 900;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const b64 = canvas.toDataURL('image/jpeg', 0.82);

      // Mostrar preview inmediatamente
      const preview = document.getElementById('f-img-preview');
      preview.src = b64;
      preview.classList.add('show');
      currentFormImageDataUrl = b64;
      showAiFormBtn();
      _allImagesEdit[0] = b64;
      renderAdditionalImages();

      // Intentar subir a Drive; si no hay Drive o falla → usar base64
      (async () => {
        const hasDrive = !!driveEp;
        if (hasDrive) toast('Subiendo imagen a Drive…', '');
        const driveUrl = await uploadToDrive(b64);
        if (controller.signal.aborted) return;
        const finalUrl = driveUrl || b64;
        document.getElementById('f-image').value = finalUrl;
        _allImagesEdit[0] = finalUrl;
        renderAdditionalImages();
        document.getElementById('save-btn').disabled = false;
        if (driveUrl) toast('Imagen guardada en Drive ✓', 'success');
      })();
    };
    img.onerror = () => {
      if (!controller.signal.aborted) toast('Error al procesar la imagen', 'error');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initImageUpload() {
  const zone = document.getElementById('img-upload-zone');
  if (!zone) return;
  zone.removeEventListener('dragover', zone._dragoverHandler);
  zone.removeEventListener('dragleave', zone._dragleaveHandler);
  zone.removeEventListener('dragend', zone._dragendHandler);
  zone.removeEventListener('drop', zone._dropHandler);

  // La zona solo maneja drag & drop — los botones internos abren galería/cámara
  zone._dragoverHandler = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone._dragleaveHandler = () => zone.classList.remove('drag-over');
  zone._dragendHandler = () => zone.classList.remove('drag-over');
  zone._dropHandler = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      document.getElementById('save-btn').disabled = true;
      compressAndPreview(file);
    }
  };

  zone.addEventListener('dragover', zone._dragoverHandler);
  zone.addEventListener('dragleave', zone._dragleaveHandler);
  zone.addEventListener('dragend', zone._dragendHandler);
  zone.addEventListener('drop', zone._dropHandler);
}

/* ── AI FORM ANALYSIS ── */
function showAiFormBtn() {
  const wrap = document.getElementById('ai-form-wrap');
  if (!wrap) return;
  wrap.style.display = '';
  wrap.style.opacity = '0';
  requestAnimationFrame(() => { wrap.style.transition = 'opacity .3s'; wrap.style.opacity = '1'; });
  const btn = document.getElementById('ai-form-btn');
  if (btn) { btn.disabled = false; btn.style.borderColor = ''; btn.style.color = ''; }
  const icon = document.querySelector('#ai-form-btn .ai-form-icon');
  const label = document.querySelector('#ai-form-btn .ai-form-label');
  if (icon) icon.textContent = '✨';
  if (label) label.textContent = 'Completar con IA';
}

function hideAiFormBtn() {
  const wrap = document.getElementById('ai-form-wrap');
  if (wrap) wrap.style.display = 'none';
  const kp = document.getElementById('ai-key-prompt');
  if (kp) kp.style.display = 'none';
  currentFormImageDataUrl = null;
}

async function analyzeFormImage() {
  if (!currentFormImageDataUrl) { toast('Primero sube una imagen', 'error'); return; }
  const key = groqApiKey;
  if (!key) {
    const kp = document.getElementById('ai-key-prompt');
    if (kp) { kp.style.display = ''; document.getElementById('ai-key-prompt-input')?.focus(); }
    return;
  }
  const btn = document.getElementById('ai-form-btn');
  const icon = document.querySelector('#ai-form-btn .ai-form-icon');
  const lbl  = document.querySelector('#ai-form-btn .ai-form-label');
  btn.disabled = true;
  icon.innerHTML = '<span class="ai-spinner"></span>';
  lbl.textContent = 'Analizando imagen…';
  try {
    const catList = categories.map(c => `"${c.code}" (${c.label})`).join(', ');
    const systemPrompt = `Eres copywriter senior de catálogo para Tres Encantos, boutique mexicana. Escribes copy listo para publicar — sin edición posterior — al nivel de Sephora, Liverpool, ZARA o Amazon MX.

━━ PASO 0 (SIEMPRE primero) ━━
Lee de arriba a abajo TODO el texto impreso en la imagen: marca, línea/colección, tipo, concentración, variante/aroma, volumen/peso (ml, g), género, ingrediente estrella. Ese texto manda sobre cualquier suposición tuya.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TÍTULO — NATURA (máxima prioridad si detectas la marca)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fórmula: Natura [Línea] [Tipo/Concentración] [Variante] [ml o g] [Género si aplica]

Líneas reconocibles: Kaiak, Essencial, Una, Humor, Nativa, Plant, Tododia, Boticaría, Ekos, Chronos, Mamá Terra, Lumina, Luna, Aqua Mundi, Erva Doce, Faces, Amó, Sínia.
Concentraciones: EDP · EDT · Colônia · Desodorante Colônia · Desodorante Aerossol.
Género: Masculino / Femenino — solo si está escrito; omite si es unisex o no está claro.

Títulos Natura correctos (copia este nivel de detalle):
• "Natura Kaiak Desodorante Colônia Clásico 100ml Masculino"
• "Natura Essencial Eau de Parfum Floral 75ml Femenino"
• "Natura Una Colônia Oud Amaderado 75ml"
• "Natura Tododia Crema Corporal Coco 400ml"
• "Natura Ekos Aceite Corporal Ucuuba 100ml"
• "Natura Chronos Sérum Antienvejecimiento Plus 30g"
• "Natura Plant Shampoo Hidratación Intensa 300ml"
• "Natura Faces Labial Cremoso Rojo Coral 3.5g"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TÍTULO — GENERAL (todo lo que no es Natura)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fórmula: [Marca visible] + [Tipo] + [Material/Acabado] + [Color/Estampado]
• "Bolso Tote Cuero Vegano Negro — David Jones"
• "Cartera Mediana con Cadena Dorada Camel"
• "Mochila Antirrobo Nylon Gris Oscuro — Guess"
• "Clutch de Noche con Pedrería Champagne"
• "Sombras Ahumadas Paleta Café Terracota — NYX"

PROHIBIDO en cualquier título: "bonito", "elegante", "especial", "hermoso", "de calidad", "perfecto", SKUs, códigos alfanuméricos, dimensiones físicas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESCRIPCIÓN PREMIUM — fórmulas por tipo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Regla universal: empieza SIEMPRE con verbo activo o el ingrediente/rasgo estrella. NUNCA con "Este producto es...", "Es un...", "Perfecto para...".

▸ Natura — perfumes y colonias:
  "[Familia olfativa] de [notas clave] que [efecto en quien lo usa]. [Intensidad/duración] para [momento o tipo de persona]."
  Ej: "Fragancia amaderada de oud y almizcle que envuelve con calidez sensual. Larga duración, ideal para noches y ocasiones especiales."
  Ej: "Cítrico fresco de bergamota y cedro blanco que irradia vitalidad. Ligero y persistente, perfecto para el día a día activo."

▸ Natura — cremas, lociones, aceites corporales:
  "[Ingrediente clave] que [beneficio concreto en piel]. [Textura/sensación de uso o resultado visible]."
  Ej: "Manteca de ucuuba que restaura la piel más seca en profundidad. Textura aterciopelada que se absorbe sin residuo graso."
  Ej: "Aceite de maracuyá que nutre e ilumina la piel. Fórmula ligera con aroma tropical que permanece en la piel."

▸ Natura — cabello (shampoo, acondicionador, mascarilla):
  "[Ingrediente activo] que [beneficio en cabello]. [Resultado desde la primera aplicación o tipo de cabello]."
  Ej: "Proteína de arroz que fortalece y repara el cabello dañado por calor. Cabello suave, con brillo y sin frizz desde el primer uso."

▸ Natura — maquillaje (Faces):
  "[Acabado/cobertura] con [beneficio adicional]. [Tono/paleta y para qué tipo de piel o look]."
  Ej: "Acabado mate de larga duración que hidrata mientras cubre. Tono cálido ideal para pieles medias y looks naturales."

▸ Bolsos, mochilas, carteras:
  "[Material o rasgo de diseño] que [funcionalidad o sensación]. [Para qué estilo de vida u ocasión]."
  Ej: "Cuero vegano suave con herrajes dorados que eleva cualquier outfit. Amplio interior organizado para el día completo."

▸ Accesorios y joyería:
  "[Material/acabado] [forma o diseño] que [efecto visual o sensación]. [Ocasión ideal]."
  Ej: "Acero dorado en forma de media luna que da un toque minimal y sofisticado. Combina con cualquier look, de día o de noche."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORÍAS — mapeo de productos a códigos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Usa el código exacto de esta lista. Aplica el mapeo lógico:
• Natura perfumes / colonias / desodorantes con aroma → natura_perfumes
• Natura cremas, lociones, aceites corporales → natura_cuerpo
• Natura shampoo, acondicionador, mascarilla → natura_cabello
• Natura maquillaje (Faces, Una) → natura_maquillaje
• Natura facial (sérum, hidratante, limpiador) → natura_facial
• Avon perfumes / colonias / desodorantes → avon_perfumes
• Avon cremas, lociones, corporales → avon_cuerpo
• Avon facial (sérum, hidratante, limpiador) → avon_facial
• Avon maquillaje (labial, base, sombra, máscara) → avon_maquillaje
• Si ves logo/marca Avon o líneas Avon (Anew, Skin So Soft, Far Away, Black Suede, Luck, Perceive) → usar avon_*
• Bolso grande / tote / shopper / mochila → bolsos o subcategoría correspondiente
• Cartera / billetera / monedero → accesorios o subcategoría
• Anillo / collar / aretes / pulsera → joyería o accesorios
• Labial / sombra / base / rubor → maquillaje
Si no hay código exacto o tienes duda → devuelve "".
Opciones disponibles: ${catList}

Español de México. Responde SOLO con JSON válido, sin markdown.`;
    const userPrompt = `PASO 0: escanea la imagen completa — marca, línea, concentración, variante, ml/g, género, ingrediente visible.

Devuelve ÚNICAMENTE JSON válido, sin markdown.

OBLIGATORIOS:
• "name": 45-70 chars. Natura → fórmula Natura completa. Otros → marca+tipo+material+color. Cero adjetivos genéricos. NUNCA uses siglas de concentración (EDP/EDT/EDC/EDP) — di "Perfume", "Colonia" o "Eau de Parfum" completo si aplica.
• "description": copy listo para publicar, máximo 160 chars. Sigue la fórmula exacta del sistema según el tipo de producto. Empieza con verbo activo o ingrediente estrella — nunca con "Este es...".

OPCIONALES:
• "category": código exacto según el mapeo del sistema. "" si no estás seguro.
• "price": número de etiqueta/plumón/empaque (ej: 350). Solo dígitos. NO confundas con ml, oz, g, tallas, %, lotes, códigos de barras. null si duda.

Formato: {"name":"...","description":"...","category":"","price":null}`;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: currentFormImageDataUrl } }
          ]}
        ],
        temperature: 0.3, max_tokens: 500
      })
    });
    if (!response.ok) {
      const eb = await response.json().catch(() => ({}));
      throw new Error(eb?.error?.message || `Error ${response.status}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('La IA no devolvió un formato reconocible');
    const parsed = JSON.parse(jsonMatch[0]);
    const flash = el => { el.classList.add('ai-filled'); setTimeout(() => el.classList.remove('ai-filled'), 1600); };
    if (parsed.name)        { const el = document.getElementById('f-name');        el.value = toTitleCase(_cleanAiName(parsed.name));  flash(el); }
    if (parsed.description) { const el = document.getElementById('f-description'); el.value = formatDescription(parsed.description); flash(el); }
    {
      const match = parsed.category
        ? categories.find(c =>
            c.code === parsed.category ||
            c.label.toLowerCase() === (parsed.category || '').toLowerCase()
          )
        : null;
      const el = document.getElementById('f-category');
      el.value = match ? match.code : 'por_revisar';
      syncCategoryLabel();
      if (match) flash(el);
    }
    // Precio detectado en imagen (plumón, etiqueta, impreso)
    const rawPrice = parsed.price;
    if (rawPrice !== null && rawPrice !== undefined) {
      const num = Number(rawPrice);
      if (!isNaN(num) && num > 0 && num < 100000) {
        const el = document.getElementById('f-price');
        el.value = Math.round(num);
        flash(el);
        updateMarginDisplay();
      }
    }
    const filled = [parsed.name ? 'nombre' : null, parsed.description ? 'descripción' : null,
                    parsed.category ? 'categoría' : null, (rawPrice && Number(rawPrice) > 0) ? 'precio' : null]
                   .filter(Boolean).join(', ');
    toast(`✨ Completado: ${filled}`, 'success');
    icon.textContent = '✓';
    lbl.textContent = 'Analizado — edita si es necesario';
    btn.style.borderColor = 'var(--green)'; btn.style.color = 'var(--green)';
    setTimeout(() => {
      icon.textContent = '✨'; lbl.textContent = 'Volver a analizar';
      btn.style.borderColor = ''; btn.style.color = '';
      btn.disabled = false;
    }, 3000);
  } catch(err) {
    toast('Error IA: ' + err.message, 'error');
    icon.textContent = '✨'; lbl.textContent = 'Completar con IA';
    btn.disabled = false;
  }
}

async function saveInlineAiKey() {
  const val = document.getElementById('ai-key-prompt-input')?.value.trim();
  if (!val || !val.startsWith('gsk_')) { toast('Ingresa una key válida de Groq (empieza con gsk_)', 'error'); return; }
  const r = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'groq_key', value: val })
  });
  if (r.ok) {
    groqApiKey = val;
    loadGroqKeyStatus();
    document.getElementById('ai-key-prompt').style.display = 'none';
    toast('Key guardada para todos los dispositivos ✓', 'success');
    analyzeFormImage();
  } else { toast('Error al guardar la key', 'error'); }
}

/* ── FORM ── */
let _formSnapshot = null;

function _takeFormSnapshot() {
  const ids = ['f-name','f-price','f-original-price','f-description','f-image','f-category','f-badge','f-badge-type','f-barcode','f-stock','f-cost'];
  const snap = {};
  ids.forEach(id => { const el = document.getElementById(id); if (el) snap[id] = el.value; });
  ['f-featured','f-out-of-stock','f-published','f-is-kit'].forEach(id => {
    const el = document.getElementById(id); if (el) snap[id] = el.checked;
  });
  return snap;
}

function _formIsDirty() {
  if (!_formSnapshot) return false;
  const cur = _takeFormSnapshot();
  return Object.keys(_formSnapshot).some(k => _formSnapshot[k] !== cur[k]);
}

function openForm(id) {
  if (id && !can.editProduct) { toast('Vista de solo lectura', ''); return; }
  if (!id && !can.addProduct) { toast('Sin permiso para agregar productos', 'error'); return; }
  TE?.track(id ? 'form_open_edit' : 'form_open_add', id ? { id } : {});
  populateBadgeList();
  const overlay = document.getElementById('form-overlay');
  document.getElementById('form-title').textContent = id ? 'Editar producto' : 'Agregar producto';
  // Ocultar banner de retorno al kit salvo que venga de _openFormFromKit
  if (!_returnToKitId) { const b = document.getElementById('form-kit-banner'); if (b) b.style.display = 'none'; }

  if (id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('f-id').value = p.id;
    document.getElementById('f-name').value = p.name;
    document.getElementById('f-category').value = p.category;
    document.getElementById('f-category-label').value = p.categoryLabel;
    _updateFormCatBtn(p.category);
    document.getElementById('f-price').value = p.price;
    document.getElementById('f-original-price').value = p.originalPrice || '';
    toggleOfertaField(!!p.originalPrice);
    document.getElementById('f-badge').value = p.badge || '';
    document.getElementById('f-badge-type').value = p.badgeType || '';
    document.getElementById('f-description').value = p.description;
    document.getElementById('f-image').value = p.image;
    if (p.image) { const w = document.getElementById('f-img-url-wrap'); if (w) w.style.display = 'block'; }
    document.getElementById('f-featured').checked = p.featured;
    document.getElementById('f-out-of-stock').checked = p.outOfStock || false;
    document.getElementById('f-published').checked = p.isPublished !== false; // default true
    document.getElementById('f-barcode').value = p.barcode || '';
    document.getElementById('f-stock').value = p.stock ?? 0;
    document.getElementById('f-cost').value = p.cost ?? '';
    updateMarginDisplay();
    previewImg();
    const isKit = !!(p.kitItems && p.kitItems.length);
    document.getElementById('f-is-kit').checked = isKit;
    _kitItemsEdit = isKit ? JSON.parse(JSON.stringify(p.kitItems)) : [];
    toggleKitMode();
    _allImagesEdit = [p.image, ...(p.images || [])].filter(url => url && url.trim());
    renderAdditionalImages();
  } else {
    document.getElementById('f-id').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-category').value = 'por_revisar';
    document.getElementById('f-category-label').value = getCatLabel('por_revisar') || 'Por revisar';
    _updateFormCatBtn('por_revisar');
    document.getElementById('f-price').value = '';
    document.getElementById('f-original-price').value = '';
    toggleOfertaField(false);
    document.getElementById('f-badge').value = '';
    document.getElementById('f-badge-type').value = '';
    document.getElementById('f-description').value = '';
    document.getElementById('f-image').value = '';
    const _urlWrap = document.getElementById('f-img-url-wrap'); if (_urlWrap) _urlWrap.style.display = 'none';
    document.getElementById('img-upload-zone')?.classList.remove('has-image');
    document.getElementById('f-featured').checked = false;
    document.getElementById('f-out-of-stock').checked = false;
    document.getElementById('f-published').checked = false;
    document.getElementById('f-barcode').value = '';
    document.getElementById('f-stock').value = 1;
    document.getElementById('f-cost').value = '';
    document.getElementById('f-margin-display').textContent = 'Margen: —';
    document.getElementById('f-img-preview').classList.remove('show');
    document.getElementById('f-img-file').value = '';
    document.getElementById('f-img-camera').value = '';
    hideAiFormBtn();
    document.getElementById('f-is-kit').checked = false;
    _kitItemsEdit = [];
    document.getElementById('kit-editor').style.display = 'none';
    _allImagesEdit = [];
    renderAdditionalImages();
  }

  _clearDupWarnings();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initImageUpload();
  document.getElementById('save-btn').disabled = false;
  _applyPriceLock();
  setTimeout(() => {
    if (_scrollToKitOnOpen) {
      _scrollToKitOnOpen = false;
      const kitEl = document.getElementById('kit-editor');
      const body  = document.querySelector('#form-overlay .modal-body');
      if (kitEl && body) body.scrollTop = kitEl.offsetTop - 12;
    } else if (id) {
      document.getElementById('f-name').focus();
    } else {
      document.querySelector('#form-overlay .modal-body').scrollTop = 0;
    }
    // Normalizar antes del snapshot: title case y categoría sugerida se aplican en onblur
    // Si no lo hacemos aquí, el primer blur del usuario rompe la comparación (falso positivo)
    if (id) { applyTitleCase('f-name'); suggestCategoryFromName(); }
    _formSnapshot = _takeFormSnapshot();
  }, 150);
}

function closeForm() {
  if (_formIsDirty()) {
    if (!confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
  }
  _formSnapshot = null;
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  setBtn(document.getElementById('save-btn'), false);
  _clearDupWarnings();
  const b = document.getElementById('form-kit-banner'); if (b) b.style.display = 'none';
  if (_returnToDupReview) { _returnToDupReview = false; setTimeout(openDupReview, 80); }
  if (_returnToKitId)   { const id = _returnToKitId;   _returnToKitId   = null; _scrollToKitOnOpen = true; setTimeout(() => openForm(id), 80); }
  if (_returnToKitQVId) { const id = _returnToKitQVId; _returnToKitQVId = null; setTimeout(() => openQV(id), 80); }
}


function toggleOfertaField(forceShow) {
  const wrap = document.getElementById('oferta-wrap');
  const btn  = document.getElementById('toggle-oferta-btn');
  if (!wrap || !btn) return;
  const show = forceShow !== undefined ? forceShow : wrap.style.display === 'none';
  wrap.style.display = show ? 'block' : 'none';
  btn.style.display  = show ? 'none'  : 'block';
  if (!show) document.getElementById('f-original-price').value = '';
}

function updateMarginDisplay() {
  const price = parseFloat(document.getElementById('f-price')?.value) || 0;
  const cost  = parseFloat(document.getElementById('f-cost')?.value)  || 0;
  const el    = document.getElementById('f-margin-display');
  if (!el) return;
  if (!cost || !price) { el.textContent = 'Margen: —'; el.style.color = ''; return; }
  const pct = ((price - cost) / price * 100).toFixed(1);
  const amt = (price - cost).toLocaleString('es-MX');
  el.textContent = `Margen: $${amt} (${pct}%)`;
  el.style.color = parseFloat(pct) >= 30 ? 'var(--green)' : parseFloat(pct) >= 10 ? 'var(--gold-dark)' : 'var(--red)';
}

function _updateActiveFiltersBar() {
  const bar = document.getElementById('filter-active-bar');
  const chipsEl = document.getElementById('fac-chips');
  if (!bar || !chipsEl) return;

  const chips = [];
  const catVal    = document.getElementById('cat-filter')?.value || 'all';
  const sortVal   = document.getElementById('sort-select')?.value || 'recent';
  const searchVal = document.getElementById('search-input')?.value?.trim() || '';

  if (searchVal) chips.push({ label: `🔍 "${searchVal.length > 20 ? searchVal.slice(0,20)+'…' : searchVal}"`, type: 'search' });

  if (catVal !== 'all') {
    const cat = categories.find(c => c.code === catVal);
    chips.push({ label: `📂 ${cat?.label || catVal}`, type: 'cat' });
  }

  const sortLabels = { 'name-az':'A→Z','name-za':'Z→A','price-desc':'$ Mayor','price-asc':'$ Menor','stock-asc':'Agotados primero','stock-desc':'En stock primero' };
  if (sortLabels[sortVal]) chips.push({ label: `↕ ${sortLabels[sortVal]}`, type: 'sort' });

  if (_statFilter) {
    const statLabels = { 'con-stock':'Con stock','sin-stock':'Sin stock','ultima-pieza':'Última pieza','sin-publicar':'Sin publicar','sin-codigo':'Sin código','sin-categ':'Sin categoría','sin-precio':'Sin precio','imagen-base64':'Imagen base64' };
    chips.push({ label: statLabels[_statFilter] || _statFilter, type: 'stat' });
  }

  if (_showOnlyFlagged) chips.push({ label: '🚩 Por revisar', type: 'flag' });

  const creatorVal = document.getElementById('creator-filter')?.value || 'all';
  if (creatorVal !== 'all') {
    const label = creatorVal === '__none__' ? 'Sin registro' : (_userNames[creatorVal] || creatorVal.split('@')[0]);
    chips.push({ label: `👤 ${label}`, type: 'creator' });
  }

  if (chips.length > 0) {
    chipsEl.innerHTML = chips.map(c =>
      `<span class="fac-chip">${c.label}<button class="fac-chip-x" onclick="event.stopPropagation();_clearFilter('${c.type}')" title="Quitar filtro">×</button></span>`
    ).join('') +
    (_statFilter === 'imagen-base64' && ROLE === 'superadmin'
      ? `<button class="fac-chip fac-chip-action" onclick="migrateBase64ToDrive()">🚀 Migrar todas a Drive</button>`
      : '');
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

function _clearFilter(type) {
  _adminPage = 1;
  if (type === 'search') {
    const s = document.getElementById('search-input');
    if (s) s.value = '';
    _toggleSearchClear();
  } else if (type === 'cat') {
    const c = document.getElementById('cat-filter');
    if (c) { c.value = 'all'; _updateCatFilterBtn(); }
  } else if (type === 'sort') {
    const sortSel = document.getElementById('sort-select');
    if (sortSel) { sortSel.value = 'created-new'; currentSort = 'created-new'; localStorage.setItem('te_admin_sort','created-new'); }
  } else if (type === 'stat') {
    _statFilter = null;
  } else if (type === 'flag') {
    _showOnlyFlagged = false;
    _syncFlagFilter();
  } else if (type === 'creator') {
    const creatorSel = document.getElementById('creator-filter');
    if (creatorSel) creatorSel.value = 'all';
  }
  renderTable();
  renderStats();
}

function clearAdminFilters() {
  const s = document.getElementById('search-input');
  const c = document.getElementById('cat-filter');
  const sortSel = document.getElementById('sort-select');
  const creatorSel = document.getElementById('creator-filter');
  if (s) s.value = '';
  if (c) { c.value = 'all'; _updateCatFilterBtn(); }
  if (sortSel) { sortSel.value = 'recent'; currentSort = 'recent'; }
  if (creatorSel) creatorSel.value = 'all';
  if (_showOnlyFlagged) { _showOnlyFlagged = false; _syncFlagFilter(); }
  _statFilter = null;
  _toggleSearchClear();
  _adminPage = 1;
  renderTable();
  renderStats();
}

function _toggleSearchClear() {
  const btn = document.getElementById('search-clear-btn');
  if (btn) btn.style.display = document.getElementById('search-input')?.value ? '' : 'none';
}

let _searchDebTimer = null;
function _searchDebounce() {
  _toggleSearchClear();
  clearTimeout(_searchDebTimer);
  _searchDebTimer = setTimeout(() => {
    _adminPage = 1;
    renderTable();
    TE?.trackSearch(document.getElementById('search-input')?.value || '', !!getFilteredProducts().length);
  }, 180);
}

function clearSearchInput() {
  const s = document.getElementById('search-input');
  if (s) s.value = '';
  _toggleSearchClear();
  _adminPage = 1;
  renderTable();
}

function syncCategoryLabel() {
  const cat = document.getElementById('f-category').value;
  document.getElementById('f-category-label').value = getCatLabel(cat);
  _updateFormCatBtn(cat);
  _applyPriceLock();
}

function _applyPriceLock() {
  const cat      = document.getElementById('f-category')?.value;
  const priceEl  = document.getElementById('f-price');
  const hintEl   = document.getElementById('price-lock-hint');
  if (!priceEl || !hintEl) return;
  const shouldLock = cat === 'por_revisar' && parseFloat(priceEl.value) > 0;
  priceEl.readOnly = shouldLock;
  priceEl.style.background  = shouldLock ? 'var(--cream)' : '';
  priceEl.style.color        = shouldLock ? 'var(--muted)'  : '';
  priceEl.style.cursor       = shouldLock ? 'not-allowed'  : '';
  hintEl.style.display       = shouldLock ? 'block'        : 'none';
}

/* Sugiere categoría automáticamente al escribir el nombre del producto */
function suggestCategoryFromName() {
  const name = (document.getElementById('f-name')?.value || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita acentos para comparar
  if (!name || name.length < 4) return;

  const rules = [
    // ── AVON subcategorías (específicas primero) ─────────────────────────
    [/avon.*perfum|avon.*colonia|avon.*fragancia|far away|black suede|luck\b.*avon|perceive|avon.*desodor|avon.*deo/,
     'avon_perfumes'],
    [/avon.*shampoo|avon.*acondicion|avon.*cabell|avon.*pelo/,
     'avon_cuerpo'],
    [/anew|avon.*facial|avon.*serum|avon.*crema.*cara|avon.*antiedad|avon.*limpiador/,
     'avon_facial'],
    [/avon.*crema.*corp|avon.*locion|avon.*corporal|skin so soft|avon.*hidratante|avon.*exfoli/,
     'avon_cuerpo'],
    [/avon.*labial|avon.*base|avon.*rubor|avon.*sombra|avon.*rimel|avon.*mascara|avon.*maquill|avon.*lip|true color/,
     'avon_maquillaje'],
    // ── AVON general ────────────────────────────────────────────────────
    [/\bavon\b/,
     'avon'],
    // ── NATURA subcategorías (específicas primero) ───────────────────────
    [/perfum|colonia|desodoran|fragancia|eau de|toilette|body splash|deo col/,
     'natura_perfumes'],
    [/shampoo|champu|acondicionad|mascarilla.*(cabello|pelo|capilar)|tratamiento.*(capilar|cabello)|ampolla.*(capilar|cabello)|brillo.*cabello/,
     'natura_cabello'],
    [/crema.*(facial|cara|rostro)|serum|tonificad|toner|micelar|limpiador.*(facial|cara)|antiedad|protector.*solar|antisolar|\bspf\b|bb cream|cc cream|prebase/,
     'natura_facial'],
    [/crema.*(cuerpo|corpor|body)|locion|hidratante|exfolian|aceite.*(cuerpo|corpor)|mantequilla.*(cuerpo|corpor)|jabon.*(corp|bano)|sabonete|gel.*baño/,
     'natura_cuerpo'],
    [/labial.*natura|base.*natura|rubor.*natura|sombra.*natura|paleta.*natura|brocha.*natura|pincel.*natura/,
     'natura_maquillaje'],
    // ── NATURA general (brand names) ────────────────────────────────────
    [/\bnatura\b|ekos|chronos|kaiak|mamae|nuxe|lumina|todo dia|essencial|faces\b|bioserum|ativance|fotoequil|savagina|una\b.*nat|homem.*nat/,
     'natura'],
    // ── MOCHILAS (específicas antes que general) ─────────────────────────
    [/mochila.*(personaj|niñ|infantil|kawaii|unicornio|caricatur|disney|kitty|stitch|pokemon|minion|superheroe|anima|escolar.*niñ)/,
     'mochilas_personaje'],
    [/mochila.*(deport|gym|sport|fitness|entrena|tactico|senderis)|gym.*bag|sport.*bag/,
     'mochilas_deportivas'],
    [/mochila/,
     'mochilas_dama'],
    // ── LONCHERAS ────────────────────────────────────────────────────────
    [/lonchera|fiambrera|porta.*almuerzo|porta.*lunch|lunch.*bag/,
     'loncheras'],
    // ── CANGURERAS ───────────────────────────────────────────────────────
    [/cangurera|riñonera|fanny|cinturon.*bolso|belt.*bag/,
     'cangureras'],
    // ── LAPICERAS ────────────────────────────────────────────────────────
    [/lapicera|estuche.*(lapiz|pluma|lapices)|porta.*(lapiz|pluma)|cartuchera/,
     'lapiceras'],
    // ── COSMETIQUERAS ────────────────────────────────────────────────────
    [/cosmetiquera|neceser|organizador.*(maquilla|cosmet|belleza)|porta.*cosmet|estuche.*(maquilla|cosmet|belleza)|bolsa.*(maquilla|cosmet)/,
     'cosmetiqueras'],
    // ── BOLSOS (casual antes que dama) ───────────────────────────────────
    [/bolso.*(casual|tela|lona|canvas|estampado|juvenil|playa)|bolsa.*(casual|tela|lona|canvas)|tote|shopper/,
     'bolsos_casual'],
    [/bolso|bolsa.*(dama|mujer|elegante|cuero|piel|clasico|lujo|fino|vintage|mano|hombro)|cartera|clutch|\bsobre\b.*bolso|pochette|minibag|mini.*bag|handbag|satchel|hobo|bucket|crossbody|bandolera/,
     'bolsos_dama'],
    // ── CABELLO ──────────────────────────────────────────────────────────
    [/diadema|donas?(?!.*joya)|liga.*cabello|liga.*pelo|ligas.*cabello|pasador|pinza|broche.*cabello|broche.*pelo|valerin|cofia|cepillo.*(cabello|pelo)|peine|turbante|moño|scrunchie|bun\b|clip.*cabello|cintillo|gancho.*cabello|horquilla|hebilla|quita.*greña|argolla.*cabello|arco.*cabello|accesorio.*cabello|accesorio.*pelo|para.*cabello|para.*pelo/,
     'cabello'],
    // ── BISUTERÍA ────────────────────────────────────────────────────────
    [/arete|aretes|collar(?!.*perro)|cadena(?!.*llave)|pulsera|bisuter|joya|anillo|brazalete|gargantilla|tobillera|piercing|medallon|dije|charm\b|argolla(?!.*cabello)|set.*joya|juego.*joya|accesorio.*plata|accesorio.*dorado/,
     'bisuteria'],
    // ── MODA ─────────────────────────────────────────────────────────────
    [/gorra|sombrero|chalina|sombrilla|bufanda|pañuelo|mascada|cinturon(?!.*bolso)|gorrita|cachucha|beanie|boina|visera|gorro|cintillo.*moda/,
     'moda'],
    // ── UÑAS ─────────────────────────────────────────────────────────────
    [/uña|esmalte|lima.*uña|manicure|postiza|poligel|gel.*uv|gel.*uña|brillo.*uña|charol.*uña|\bnail\b|press.*on|kit.*uña|acrilica|top.*coat|base.*coat/,
     'unas'],
    // ── MAQUILLAJE ───────────────────────────────────────────────────────
    [/maquilla|labial\b|corrector\b|rubor|sombra.*(ojo|parpado)|pestañ|rimmel|mascara.*(ojo|pesta)|blush|bronzer|iluminador|contorno.*rostro|delineador|eyeliner|polvo.*compacto|sellador|fijador.*maquilla|primer\b|brocha.*maquilla|pincel.*maquilla|esponja.*maquilla|paleta.*color|pigmento|cejas/,
     'maquillaje'],
  ];

  for (const [regex, code] of rules) {
    if (regex.test(name)) {
      const sel = document.getElementById('f-category');
      if (!sel || sel.value === code) return; // ya está asignado, no interrumpir
      sel.value = code;
      if (sel.value !== code) return; // código no existe en las opciones actuales
      syncCategoryLabel();
      _updateFormCatBtn(code);
      sel.classList.add('ai-filled');
      setTimeout(() => sel.classList.remove('ai-filled'), 1400);
      return;
    }
  }
}

/* Title Case para nombres de productos en español (estilo retail mexicano).
   Primera palabra siempre en mayúscula; preposiciones/artículos/conjunciones
   cortas en minúscula cuando van en el medio. */
function toTitleCase(str) {
  const SMALL = new Set([
    'a','al','con','de','del','e','el','en','es','la','las',
    'lo','los','ni','o','para','por','sin','u','un','una','unos','unas','y'
  ]);
  return str
    .trim()
    .replace(/\s+/g, ' ')          // colapsar espacios múltiples
    .split(' ')
    .map((word, i) => {
      if (!word) return word;
      const low = word.toLowerCase();
      // Primera palabra siempre en mayúscula; SMALL solo en posición intermedia
      if (i === 0 || !SMALL.has(low)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return low;
    })
    .join(' ');
}

function applyTitleCase(fieldId) {
  const el = document.getElementById(fieldId);
  if (el && el.value.trim()) el.value = toTitleCase(el.value);
}

// Limpia siglas técnicas de concentración de perfumes que confunden al cliente
function _cleanAiName(name) {
  if (!name) return name;
  return name
    .replace(/\bEDP\b/g, 'Eau de Parfum')
    .replace(/\bEDT\b/g, 'Eau de Toilette')
    .replace(/\bEDC\b/g, 'Eau de Cologne')
    .replace(/\bedp\b/gi, 'Eau de Parfum')
    .replace(/\bedt\b/gi, 'Eau de Toilette')
    .replace(/\bedc\b/gi, 'Eau de Cologne');
}

/* Convierte HTML del portapapeles a texto limpio con bullets y saltos de línea */
function _htmlToPlainText(html) {
  let s = html;
  s = s.replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?(p|div|h[1-6]|ul|ol|blockquote|tr)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  // Decode ALL HTML entities (named, numeric &#225;, hex &#xE1;) via DOM
  const tmp = document.createElement('textarea');
  tmp.innerHTML = s;
  s = tmp.value;
  // Colapsar bullets duplicados al inicio de línea (ej: "• • texto" → "• texto")
  return s.split('\n').map(l => l.trim().replace(/^([•\-\*·])\s*[•\-\*·]\s*/,'$1 ')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Handler de paste en campos de descripción — convierte HTML a texto limpio */
function handleDescPaste(e) {
  const html = e.clipboardData?.getData('text/html');
  if (!html) return;
  e.preventDefault();
  const clean = _htmlToPlainText(html);
  const ta = e.target;
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + clean + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + clean.length;
}

/* Escapa HTML y convierte \n en <br> para renderizado seguro de descripciones */
function _descHtml(desc) {
  if (!desc) return '';
  let s = desc
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,'<em>$1</em>');
  // Agrupar líneas con viñeta en lista
  s = s.replace(/((?:• .+\n?)+)/g, match => {
    const items = match.trim().split('\n').map(l => `<li>${l.replace(/^• /,'').trim()}</li>`).join('');
    return `<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc">${items}</ul>`;
  });
  s = s.replace(/\n/g,'<br>');
  return s;
}

function _descWrapToggle(marker) {
  const ta = document.getElementById('f-description');
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const val = ta.value;
  const sel = s === e ? '' : val.slice(s, e);
  if (!sel) { ta.focus(); return; }
  let newSel;
  if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length > marker.length * 2) {
    newSel = sel.slice(marker.length, -marker.length);
  } else {
    newSel = marker + sel + marker;
  }
  ta.value = val.slice(0, s) + newSel + val.slice(e);
  ta.setSelectionRange(s, s + newSel.length);
  ta.focus();
}

function toggleBoldDesc()   { _descWrapToggle('**'); }
function toggleItalicDesc() { _descWrapToggle('*');  }

function addBulletDesc() {
  const ta = document.getElementById('f-description');
  if (!ta) return;
  const s = ta.selectionStart;
  const val = ta.value;
  // Insertar "• " al inicio de la línea actual
  const lineStart = val.lastIndexOf('\n', s - 1) + 1;
  const lineText  = val.slice(lineStart, s);
  let insert, newCursor;
  if (lineText.startsWith('• ')) {
    // Ya tiene viñeta → quitar
    ta.value = val.slice(0, lineStart) + lineText.slice(2) + val.slice(s);
    newCursor = s - 2;
  } else {
    ta.value = val.slice(0, lineStart) + '• ' + val.slice(lineStart);
    newCursor = s + 2;
  }
  ta.setSelectionRange(newCursor, newCursor);
  ta.focus();
}

/* Formatea descripción: primera letra mayúscula + punto al final (preserva saltos de línea) */
function formatDescription(str) {
  if (!str) return str;
  const lines = str.split('\n').map(l => l.replace(/ +/g, ' ').trim());
  let s = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return s;
  // Capitalizar primera letra
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // Capitalizar letra tras punto, !, ? o … seguido de espacio
  s = s.replace(/([.!?…][ \t]+)([a-záéíóúàèìòùäëïöüñ])/g,
    (_, punct, letter) => punct + letter.toUpperCase());
  if (!/[.!?…]$/.test(s)) s += '.';
  return s;
}

function applyDescriptionFormat(fieldId) {
  const el = document.getElementById(fieldId);
  if (el && el.value.trim()) el.value = formatDescription(el.value);
}

/* ── VALIDACIÓN DEL FORMULARIO ─────────────────────────────────────── */
function clearFieldError(el) {
  const field = el?.closest?.('.field');
  if (!field) return;
  field.classList.remove('field-invalid');
  field.querySelector('.field-error-msg')?.remove();
}

function validateForm() {
  // Limpiar errores previos
  document.querySelectorAll('.field-invalid').forEach(f => f.classList.remove('field-invalid'));
  document.querySelectorAll('.field-error-msg').forEach(e => e.remove());

  let firstInvalid = null;

  const markError = (inputId, msg) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const field = input.closest('.field');
    if (!field) return;
    field.classList.add('field-invalid');
    const err = document.createElement('p');
    err.className = 'field-error-msg';
    err.textContent = '⚠ ' + msg;
    field.appendChild(err);
    // Auto-limpiar al corregir
    input.addEventListener('input', () => clearFieldError(input), { once: true });
    input.addEventListener('change', () => clearFieldError(input), { once: true });
    if (!firstInvalid) firstInvalid = input;
  };

  const name  = document.getElementById('f-name')?.value.trim();

  if (!name) markError('f-name', 'El nombre es obligatorio');

  if (firstInvalid) {
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstInvalid.focus();
  }

  return !firstInvalid;
}

function clearField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = '';
  el.focus();
}

function previewImg() {
  const url = document.getElementById('f-image').value.trim();
  const preview = document.getElementById('f-img-preview');
  const zone = document.getElementById('img-upload-zone');
  if (url) {
    preview.src = url;
    preview.classList.add('show');
    preview.onerror = () => { preview.classList.remove('show'); zone?.classList.remove('has-image'); };
    zone?.classList.add('has-image');
  } else {
    preview.classList.remove('show');
    zone?.classList.remove('has-image');
  }
  _allImagesEdit[0] = url || '';
  if (!url && _allImagesEdit[0] === '') _allImagesEdit = _allImagesEdit.filter((_, i) => i !== 0);
  renderAdditionalImages();
}

function _syncMainFromStrip() {
  const url = _allImagesEdit[0] || '';
  const inp = document.getElementById('f-image');
  const preview = document.getElementById('f-img-preview');
  const zone = document.getElementById('img-upload-zone');
  const urlWrap = document.getElementById('f-img-url-wrap');
  if (inp) inp.value = url;
  if (preview) {
    if (url) {
      preview.src = url;
      preview.classList.add('show');
      zone?.classList.add('has-image');
      if (urlWrap) urlWrap.style.display = 'block';
    } else {
      preview.classList.remove('show');
      zone?.classList.remove('has-image');
    }
  }
}

/* ── SAVE PRODUCT — targeted PATCH or single POST ── */
async function saveProduct() {
  applyTitleCase('f-name');
  applyDescriptionFormat('f-description');
  if (!validateForm()) return;

  // Re-corre checks de duplicado por si el usuario no pasó por blur
  checkBarcodeConflict();
  checkNameSimilarity();
  const barcodeWarn = document.getElementById('f-barcode-warn');
  const nameWarn    = document.getElementById('f-name-warn');
  if (barcodeWarn?.style.display !== 'none' && barcodeWarn?.classList.contains('error')) return;
  if (nameWarn?.style.display !== 'none') {
    if (!confirm('El sistema detectó un producto similar en el catálogo.\n¿Confirmas que es un producto diferente?')) return;
  }

  const name = document.getElementById('f-name').value.trim();
  const price = parseFloat(document.getElementById('f-price').value) || 0;
  const image = _allImagesEdit[0] || document.getElementById('f-image').value.trim();
  const description = document.getElementById('f-description').value.trim();

  if (!name) {
    toast('El nombre es obligatorio.', 'error');
    return;
  }

  if (document.getElementById('f-is-kit').checked) {
    if (_kitItemsEdit.length === 0) {
      toast('Un kit necesita al menos 2 componentes.', 'error');
      return;
    }
    if (_kitItemsEdit.length === 1 && _kitItemsEdit[0].qty < 2) {
      toast('Un kit con un solo producto no tiene sentido — agrégale más componentes o véndelo directamente.', 'error');
      return;
    }
  }

  const idVal = document.getElementById('f-id').value;
  const badge = document.getElementById('f-badge').value.trim();
  const origPrice = parseFloat(document.getElementById('f-original-price').value) || null;
  const catVal = document.getElementById('f-category').value || 'por_revisar';
  // Sin precio → nunca publicar en web. Operador → siempre inicia sin publicar.
  const sinPrecio = !price || price <= 0;
  const publishedVal = sinPrecio ? false : (!idVal && !can.publishProduct ? false : document.getElementById('f-published').checked);
  const data = {
    name,
    category: catVal,
    categoryLabel: document.getElementById('f-category-label').value.trim() || getCatLabel(catVal),
    price,
    originalPrice: (origPrice && origPrice > price) ? origPrice : null,
    description,
    image: image || DEFAULT_IMG,
    badge: badge || null,
    badgeType: document.getElementById('f-badge-type').value || null,
    featured: document.getElementById('f-featured').checked,
    outOfStock: document.getElementById('f-out-of-stock').checked,
    barcode: document.getElementById('f-barcode').value.trim() || null,
    stock: parseInt(document.getElementById('f-stock').value) || 0,
    cost: parseFloat(document.getElementById('f-cost').value) || null,
    isPublished: publishedVal,
    kitItems: document.getElementById('f-is-kit').checked && _kitItemsEdit.length
      ? _kitItemsEdit.map(item => {
          const prod = products.find(x => x.id === item.id);
          return { ...item, name: prod?.name || item.name, image: prod?.image || item.image || null };
        })
      : null,
    images: _allImagesEdit.length > 1 ? _allImagesEdit.slice(1) : null
  };

  // Auto-sincronizar out_of_stock con stock — el checkbox oculto puede quedar
  // desincronizado si el usuario sólo edita el campo stock sin tocar ese campo
  if (!data.kitItems) {
    if (data.stock > 0) data.outOfStock = false;
    else data.outOfStock = true;
  }

  const dbPayload = {
    name: data.name,
    category: data.category,
    category_label: data.categoryLabel,
    price: data.price,
    description: data.description,
    image: data.image,
    badge: data.badge,
    badge_type: data.badgeType,
    featured: data.featured,
    out_of_stock: data.kitItems ? false : data.outOfStock,
    original_price: data.originalPrice,
    barcode: data.barcode,
    stock: data.stock,
    cost: data.cost,
    is_published: data.isPublished,
    kit_items: data.kitItems,
    images: data.images,
    is_archived: data.isArchived || false,
    ...(!idVal ? { created_by: getCurrentUserEmail() } : {})
  };

  const saveBtn = document.getElementById('save-btn');
  setBtn(saveBtn, true, idVal ? 'Actualizando...' : 'Guardando...');

  // Capturar imagen anterior ANTES de actualizar el array local
  // (para borrarla de Drive solo si el guardado tiene éxito)
  const _prevImage = idVal ? products.find(p => p.id === parseInt(idVal))?.image : null;

  if (idVal) {
    const idx = products.findIndex(p => p.id === parseInt(idVal));
    if (idx > -1) products[idx] = { ...products[idx], ...data };

    if (getSupabaseUrl()) {
      const result = await supabaseApi(`products?id=eq.${idVal}`, {
        method: 'PATCH',
        body: JSON.stringify(dbPayload)
      });
      if (!result.ok) {
        setBtn(saveBtn, false);
        const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
        toast(`Error al actualizar: ${errMsg}`, 'error');
        return;
      }
      // Guardado OK → borrar imagen anterior de Drive si fue reemplazada
      const oldId = _driveFileId(_prevImage);
      if (oldId && _prevImage !== data.image) _deleteDriveFile(oldId);
    }
  } else {
    const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
    const newProduct = { id: maxId + 1, ...data, position: products.length };
    products.push(newProduct);

    let result;
    try {
      result = await supabaseApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: newProduct.id, ...dbPayload, position: newProduct.position })
      });
    } catch (err) {
      products.pop();
      setBtn(saveBtn, false);
      toast(`Error de red al guardar: sin conexión o tiempo de espera agotado`, 'error');
      return;
    }
    if (!result.ok) {
      products.pop();
      setBtn(saveBtn, false);
      const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
      toast(`Error al guardar: ${errMsg}`, 'error');
      return;
    }
  }

  if (idVal) {
    _trackEdit(parseInt(idVal));
    logActivity('producto_editado', `Editó "${name}"`, { id: parseInt(idVal), name, price });
    TE?.track('product_saved', { action: 'edit', name });
  } else {
    const newId = products[products.length - 1]?.id;
    if (newId) _trackEdit(newId);
    logActivity('producto_creado', `Creó "${name}" — $${price.toLocaleString('es-MX')}`, { id: newId, name, price });
    TE?.track('product_saved', { action: 'add', name });
  }
  _formSnapshot = null;
  // Sync: si editamos un producto que es componente de algún kit, actualizar nombre/imagen en esos kits
  if (idVal) _syncKitRefs(parseInt(idVal), name, data.image);
  // Ir a "Recientes" para que el producto guardado aparezca al inicio
  const _sortSel = document.getElementById('sort-select');
  if (_sortSel) { _sortSel.value = 'recent'; currentSort = 'recent'; }
  closeForm();
  renderTable();
  renderStats();
  if (sinPrecio && !idVal) {
    toast('Producto guardado sin precio — asígnalo antes de publicar en la tienda', 'warn');
  } else {
    toast(idVal ? 'Guardado ✓' : 'Producto agregado ✓');
  }
}

async function _syncKitRefs(productId, newName, newImage) {
  const kits = products.filter(p => p.kitItems?.some(item => item.id === productId));
  if (!kits.length) return;
  for (const kit of kits) {
    const updated = kit.kitItems.map(item =>
      item.id === productId ? { ...item, name: newName, image: newImage || item.image } : item
    );
    kit.kitItems = updated;
    await supabaseApi(`products?id=eq.${kit.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ kit_items: updated })
    });
  }
}

/* ── KIT EDITOR ── */
function toggleKitMode() {
  const isKit = document.getElementById('f-is-kit').checked;
  document.getElementById('kit-editor').style.display = isKit ? 'block' : 'none';
  const stockWrap  = document.getElementById('f-stock-wrap');
  const stockInput = document.getElementById('f-stock');
  if (isKit) {
    if (stockWrap) stockWrap.style.display = 'none';
    stockInput.disabled = true;
    stockInput.value = '0';
  } else {
    if (stockWrap) stockWrap.style.display = '';
    stockInput.disabled = false;
  }
  if (isKit) renderKitEditor();
}

function _kitCompPopover(id, event) {
  event.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  document.getElementById('kit-comp-popover')?.remove();
  const pop = document.createElement('div');
  pop.id = 'kit-comp-popover';
  pop.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:14px;padding:0;z-index:99999;box-shadow:0 8px 40px rgba(0,0,0,.28);width:250px;overflow:hidden';
  const stockTxt = (p.outOfStock || p.stock === 0)
    ? '<span style="color:var(--red)">⚠️ Agotado</span>'
    : `<span style="color:var(--green)">● ${p.stock} en stock</span>`;
  pop.innerHTML = `
    <button onclick="document.getElementById('kit-comp-popover')?.remove()" style="position:absolute;top:8px;right:8px;width:28px;height:28px;background:rgba(0,0,0,.45);border:none;border-radius:50%;font-size:.85rem;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;z-index:1">✕</button>
    <img src="${p.image || DEFAULT_IMG}" onerror="this.src='${DEFAULT_IMG}'" style="width:100%;height:230px;object-fit:contain;background:#F9F5EF;display:block">
    <div style="padding:8px 12px 12px">
      <div style="font-weight:700;font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px">${p.name}</div>
      <div style="font-size:.75rem;display:flex;align-items:center;justify-content:space-between">
        ${stockTxt}
        <span style="color:var(--muted)">$${(p.price||0).toLocaleString('es-MX')}</span>
      </div>
      ${can.editProduct ? `<a href="#" onclick="event.preventDefault();_openFormFromKit(${p.id})" style="display:block;margin-top:8px;font-size:.73rem;color:var(--gold);text-align:center;text-decoration:none;font-weight:600">✏️ Editar producto →</a>` : ''}
    </div>`;
  document.body.appendChild(pop);
  setTimeout(() => {
    const close = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 50);
}

function renderKitEditor() {
  const list = document.getElementById('kit-components-list');
  if (!_kitItemsEdit.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:.8rem;padding:12px 0">Sin componentes — busca productos arriba</div>';
    _updateKitStockCalc();
    return;
  }
  list.innerHTML = _kitItemsEdit.map(item => {
    const p = products.find(x => x.id === item.id);
    const stock = p ? (p.outOfStock || p.stock === 0 ? '<span style="color:var(--red)">Agotado</span>' : `<span style="color:var(--green)">${p.stock} uds</span>`) : '<span style="color:var(--muted)">—</span>';
    return `
<div class="kit-comp-row">
  ${p?.image ? `<img src="${p.image}" class="kit-comp-img" onerror="this.style.display='none'" onclick="_kitCompPopover(${item.id},event)" style="cursor:zoom-in" title="Ver producto">` : '<div class="kit-comp-img"></div>'}
  <span class="kit-comp-name" onclick="_kitCompPopover(${item.id},event)" style="cursor:pointer" title="Ver producto">${p?.name || item.name}</span>
  <span class="kit-comp-stock">${stock}</span>
  <div class="kit-comp-qty">
    <button type="button" onclick="changeKitQty(${item.id},-1)">−</button>
    <span>${item.qty}</span>
    <button type="button" onclick="changeKitQty(${item.id},1)">+</button>
  </div>
  <button type="button" class="kit-comp-remove" onclick="removeKitComponent(${item.id})" title="Quitar">✕</button>
</div>`;
  }).join('');
  _updateKitStockCalc();
}

function _updateKitStockCalc() {
  const calcEl = document.getElementById('kit-stock-calc');
  const valEl  = document.getElementById('kit-stock-val');
  if (!_kitItemsEdit.length) { if (calcEl) calcEl.style.display = 'none'; return; }
  let minStock = Infinity;
  let anyOos = false;
  for (const comp of _kitItemsEdit) {
    const p = products.find(x => x.id === comp.id);
    if (!p || p.outOfStock || p.stock === 0) { anyOos = true; break; }
    const avail = Math.floor(p.stock / comp.qty);
    if (avail < minStock) minStock = avail;
  }
  const final = anyOos ? 0 : (minStock === Infinity ? 0 : minStock);
  if (calcEl) calcEl.style.display = '';
  if (valEl) {
    valEl.textContent = final === 0 ? '0 (algún componente agotado)' : `${final} kit${final !== 1 ? 's' : ''}`;
    valEl.style.color = final === 0 ? 'var(--red)' : final <= 2 ? 'var(--gold-dark)' : 'var(--green)';
  }
}

function searchKitProducts(query) {
  const resultsEl = document.getElementById('kit-search-results');
  if (!query.trim()) { resultsEl.style.display = 'none'; return; }
  const editingId = parseInt(document.getElementById('f-id').value) || null;
  // Coincidencia exacta de barcode → agregar componente automáticamente
  const barcodeMatch = products.find(p => p.id !== editingId && p.barcode && p.barcode === query.trim());
  if (barcodeMatch) { addKitComponent(barcodeMatch.id); return; }
  const q = query.toLowerCase();
  const matches = products.filter(p => p.id !== editingId && p.name.toLowerCase().includes(q)).slice(0, 6);
  const termEncoded = encodeURIComponent(query.trim());
  const createBtn = `
<div onclick="_kitFormCreateDraft(decodeURIComponent('${termEncoded}'))" style="cursor:pointer;padding:7px 10px;display:flex;align-items:center;gap:8px;font-size:.82rem;border-bottom:1px solid var(--border);transition:.1s" onmouseenter="this.style.background='#FFF8EE'" onmouseleave="this.style.background=''">
  <div style="width:28px;height:28px;border-radius:5px;background:var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0">➕</div>
  <div style="flex:1;min-width:0">
    <div style="font-weight:600;color:var(--gold-dark)">Crear "${query.trim()}" como borrador</div>
    <div style="color:var(--muted);font-size:.74rem">Stock 0 · Sin publicar · editar después</div>
  </div>
</div>`;
  if (!matches.length) {
    resultsEl.innerHTML = createBtn;
    resultsEl.style.display = 'block';
    return;
  }
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = matches.map(p => `
<div onclick="addKitComponent(${p.id})" style="cursor:pointer;padding:7px 10px;display:flex;align-items:center;gap:8px;font-size:.82rem;border-bottom:1px solid var(--border);transition:.1s" onmouseenter="this.style.background='#FFF8EE'" onmouseleave="this.style.background=''">
  <img src="${p.image}" style="width:28px;height:28px;object-fit:cover;border-radius:5px;flex-shrink:0" onerror="this.style.display='none'">
  <span style="flex:1;font-weight:600">${p.name}</span>
  <span style="color:var(--muted);font-size:.74rem">${p.stock > 0 && !p.outOfStock ? p.stock+' uds' : 'Agotado'}</span>
</div>`).join('') + createBtn;
}

async function _kitFormCreateDraft(name) {
  const newId = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const draft = {
    id: newId, name, category: 'por_revisar', category_label: 'Por revisar',
    price: 0, description: '', stock: 0, out_of_stock: true, is_published: false,
    featured: false, image: DEFAULT_IMG, position: products.length
  };
  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(draft)
  });
  if (!result.ok) { toast('Error al crear borrador', 'error'); return; }
  products.push({
    id: newId, name, category: 'por_revisar', categoryLabel: 'Por revisar',
    price: 0, description: '', stock: 0, outOfStock: true, isPublished: false,
    featured: false, image: DEFAULT_IMG, position: products.length - 1,
    kitItems: null
  });
  document.getElementById('kit-search').value = '';
  document.getElementById('kit-search-results').style.display = 'none';
  addKitComponent(newId);
  logActivity('producto_creado', `Borrador de kit: "${name}" — $0`, { id: newId, name, price: 0 });
  toast(`✓ "${name}" creado como borrador`);
}

function addKitComponent(productId) {
  if (_kitItemsEdit.find(i => i.id === productId)) { toast('Ya está en el kit', ''); return; }
  const p = products.find(x => x.id === productId);
  if (!p) return;
  _kitItemsEdit.push({ id: p.id, name: p.name, qty: 1, image: p.image || null });
  document.getElementById('kit-search').value = '';
  document.getElementById('kit-search-results').style.display = 'none';
  renderKitEditor();
}

function removeKitComponent(productId) {
  _kitItemsEdit = _kitItemsEdit.filter(i => i.id !== productId);
  renderKitEditor();
}

function changeKitQty(productId, delta) {
  const item = _kitItemsEdit.find(i => i.id === productId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  renderKitEditor();
}

/* ── ADDITIONAL IMAGES ── */
async function _urlToBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('fetch failed');
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(blob);
  });
}

function _fileToBase64Resized(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderAdditionalImages() {
  const strip = document.getElementById('additional-images-strip');
  if (!strip) return;
  if (!_allImagesEdit.length) {
    strip.innerHTML = '<span style="font-size:.73rem;color:var(--muted-light);line-height:1.4;align-self:center;padding-left:2px">Sin imágenes — sube una arriba</span>';
    return;
  }
  const total = _allImagesEdit.length;
  strip.innerHTML = _allImagesEdit.map((url, i) => {
    const isMain   = i === 0;
    const isDrive  = url.includes('drive.google.com');
    const isBase64 = url.startsWith('data:');
    const storageBadge = isDrive
      ? `<span style="position:absolute;bottom:22px;left:50%;transform:translateX(-50%);background:#34a853;color:#fff;font-size:.42rem;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;pointer-events:none">Drive</span>`
      : isBase64
      ? `<span style="position:absolute;bottom:22px;left:50%;transform:translateX(-50%);background:#e67e22;color:#fff;font-size:.42rem;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;pointer-events:none">B64</span>`
      : '';
    const mainBadge = isMain
      ? `<span style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);background:var(--gold);color:#fff;font-size:.42rem;font-weight:700;padding:1px 5px;border-radius:10px;white-space:nowrap;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,.18)">⭐ Principal</span>`
      : '';
    const border = isMain ? '2px solid var(--gold)' : '1px solid var(--border)';
    const btnStyle = 'width:22px;height:22px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;font-size:.75rem;display:flex;align-items:center;justify-content:center;color:var(--charcoal);flex-shrink:0;touch-action:manipulation';
    const btnLeft  = i > 0
      ? `<button type="button" onclick="event.stopPropagation();_aiMove(${i},-1)" ontouchend="event.preventDefault();event.stopPropagation();_aiMove(${i},-1)" style="${btnStyle}" title="Mover a la izquierda${i===1?' (→ Principal)':''}">‹</button>`
      : `<span style="width:22px;flex-shrink:0"></span>`;
    const btnRight = i < total - 1
      ? `<button type="button" onclick="event.stopPropagation();_aiMove(${i},1)" ontouchend="event.preventDefault();event.stopPropagation();_aiMove(${i},1)" style="${btnStyle}" title="${i===0?'Quitar de principal':'Mover a la derecha'}">›</button>`
      : `<span style="width:22px;flex-shrink:0"></span>`;
    return `
<div draggable="true" data-ai="${i}"
  style="position:relative;flex-shrink:0;transition:opacity .15s,outline .15s;display:flex;flex-direction:column;align-items:center;gap:4px;touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none"
  ondragstart="_aiDragStart(event,${i})"
  ondragover="_aiDragOver(event,${i})"
  ondrop="_aiDrop(event,${i})"
  ondragend="_aiDragEnd()"
  ontouchstart="event.stopPropagation()">
  <div style="position:relative;margin-top:${isMain?'8':'2'}px">
    <img src="${url}" style="width:68px;height:68px;object-fit:contain;border-radius:8px;border:${border};background:#F7F2EB;display:block;pointer-events:none;cursor:grab;-webkit-touch-callout:none;-webkit-user-drag:none" onerror="this.style.opacity='.3'">
    <button type="button" onclick="removeAdditionalImage(${i})" ontouchend="event.preventDefault();removeAdditionalImage(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--red);color:#fff;border:none;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;line-height:1;box-shadow:0 1px 4px rgba(0,0,0,.25);touch-action:manipulation">✕</button>
    ${mainBadge}${storageBadge}
  </div>
  <div style="display:flex;gap:3px">${btnLeft}${btnRight}</div>
</div>`;
  }).join('');
}

function _aiMove(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= _allImagesEdit.length) return;
  [_allImagesEdit[idx], _allImagesEdit[target]] = [_allImagesEdit[target], _allImagesEdit[idx]];
  if (idx === 0 || target === 0) _syncMainFromStrip();
  renderAdditionalImages();
}

function removeAdditionalImage(idx) {
  _allImagesEdit.splice(idx, 1);
  if (idx === 0) _syncMainFromStrip();
  renderAdditionalImages();
}

// Drag & drop desktop para imágenes adicionales (mobile usa botones ‹ ›)
let _aiDragSrc = null;
function _aiDragStart(e, idx) {
  _aiDragSrc = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const el = document.querySelector(`[data-ai="${idx}"]`); if (el) el.style.opacity = '.35'; }, 0);
}
function _aiDragOver(e, idx) {
  e.preventDefault();
  if (_aiDragSrc === null) return;
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('[data-ai]').forEach(el => el.style.outline = '');
  if (idx !== _aiDragSrc) {
    const el = document.querySelector(`[data-ai="${idx}"]`);
    if (el) el.style.outline = '2px solid var(--gold)';
  }
}
function _aiDrop(e, idx) {
  e.preventDefault();
  if (_aiDragSrc === null || _aiDragSrc === idx) return;
  const srcWasMain = _aiDragSrc === 0;
  const moved = _allImagesEdit.splice(_aiDragSrc, 1)[0];
  _allImagesEdit.splice(idx, 0, moved);
  if (srcWasMain || idx === 0) _syncMainFromStrip();
  renderAdditionalImages();
}
function _aiDragEnd() {
  _aiDragSrc = null;
  document.querySelectorAll('[data-ai]').forEach(el => { el.style.opacity = ''; el.style.outline = ''; });
}

async function addAdditionalImageUrl() {
  const inp = document.getElementById('add-img-url-input');
  const url = inp?.value.trim();
  if (!url) return;
  if (_allImagesEdit.length >= 6) { toast('Máximo 6 imágenes en total', ''); return; }
  _allImagesEdit.push(url);
  inp.value = '';
  renderAdditionalImages();
}

async function handleAdditionalImageFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const addBtn = document.getElementById('add-img-file-btn');
  if (addBtn) { addBtn.textContent = '⏳ Subiendo…'; addBtn.disabled = true; }
  if (_allImagesEdit.length >= 6) { toast('Máximo 6 imágenes en total', ''); input.value = ''; return; }
  try {
    const base64 = await _fileToBase64Resized(file);
    let url = base64;
    if (driveEp && driveSecret) {
      const driveResult = await uploadToDrive(base64);
      if (driveResult) url = driveResult;
    }
    _allImagesEdit.push(url);
    renderAdditionalImages();
  } catch {
    toast('Error al procesar la imagen', 'error');
  } finally {
    if (addBtn) { addBtn.textContent = '📁 Desde galería'; addBtn.disabled = false; }
    input.value = '';
  }
}

/* ── DELETE ── */
function askDelete(id) {
  if (!can.deleteProduct) { toast('Solo el administrador puede eliminar productos', 'error'); return; }
  const kitsAfectados = products.filter(p => p.kitItems?.some(item => item.id === id));
  if (kitsAfectados.length) {
    const nombres = kitsAfectados.map(k => `"${k.name}"`).join(', ');
    if (!confirm(`Este producto es componente de ${kitsAfectados.length === 1 ? 'el kit' : 'los kits'} ${nombres}.\n\nAl eliminarlo esos kits quedarán sin stock. ¿Continuar?`)) return;
  }
  deleteTargetId = id;
  document.getElementById('del-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDel() {
  deleteTargetId = null;
  document.getElementById('del-overlay').classList.remove('open');
  document.body.style.overflow = '';
  const btn = document.getElementById('del-confirm-btn');
  if (btn) setBtn(btn, false);
}

async function confirmDelete() {
  if (deleteTargetId === null) return;
  const id = deleteTargetId;
  const btn = document.getElementById('del-confirm-btn');
  setBtn(btn, true, 'Eliminando...');

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' }
  });
  if (!result.ok) {
    setBtn(btn, false);
    const msg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
    toast('Error al eliminar: ' + msg, 'error');
    closeDel();
    return;
  }

  const deleted = products.find(p => p.id === id);
  const deletedIdx = products.findIndex(p => p.id === id);
  if (deleted) logActivity('producto_eliminado', `Eliminó "${deleted.name}"`, { id, name: deleted.name, price: deleted.price });

  products = products.filter(p => p.id !== id);
  selectedIds.delete(id);
  if (_qvCurrentId === id) closeQV();
  setBtn(btn, false);
  closeDel();
  renderTable();
  renderStats();
  updateBulkBar();

  // Toast con opción de deshacer (7 segundos)
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
        stock: deleted.stock, position: deletedIdx
      })
    });
    if (r.ok) {
      products.splice(deletedIdx, 0, deleted);
      renderTable();
      renderStats();
      toast(`"${truncName(deleted.name)}" restaurado ✓`, 'success');
    }
  }, () => {
    const fileId = _driveFileId(deleted?.image);
    if (fileId) _deleteDriveFile(fileId);
  });
}

/* ── SAVE — batch upsert (usado para reorder e import) ── */
async function save() {
  if (!products.length) return true;

  const payload = products.map((p, i) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    category_label: p.categoryLabel,
    price: p.price,
    description: p.description,
    image: p.image,
    badge: p.badge,
    badge_type: p.badgeType,
    featured: p.featured,
    out_of_stock: p.outOfStock,
    original_price: p.originalPrice,
    barcode: p.barcode ?? null,
    stock: p.stock ?? 0,
    position: i
  }));

  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    const errMsg = result.data?.message || result.data?.hint || result.data?.details || `HTTP ${result.status}`;
    toast(`Error al guardar: ${errMsg}`, 'error');
    console.error('Supabase save error:', result.status, result.data);
    return false;
  }
  return true;
}

/* ── MOVER AL INICIO ── */

async function moveToTop(id) {
  const idx = products.findIndex(p => p.id === id);
  if (idx <= 0) { toast('Ya está al inicio del catálogo'); return; }
  const [p] = products.splice(idx, 1);
  products.unshift(p);
  const ok = await save();
  if (!ok) { products.splice(0, 1); products.splice(idx, 0, p); return; }
  _forcePositionSort();
  renderTable();
  _qvRefresh(id);
  toast('📌 Movido al inicio del catálogo');
}

async function bulkMoveToTop() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  const rest     = products.filter(p => !selectedIds.has(p.id));
  products.length = 0;
  products.push(...selected, ...rest);
  const ok = await save();
  if (!ok) { return; }
  _forcePositionSort();
  renderTable();
  toast(`📌 ${selected.length} producto${selected.length > 1 ? 's movidos' : ' movido'} al inicio`);
}

function _forcePositionSort() {
  currentSort = 'position';
  localStorage.setItem('te_admin_sort', 'position');
  const sel = document.getElementById('sort-select');
  if (sel) sel.value = 'position';
}

/* ── ADD TO KIT ── */
let _addToKitIds = [];

function _openAddToKit(ids) {
  const kits = products.filter(p => p.kitItems?.length).sort((a, b) => b.id - a.id);
  if (!kits.length) { toast('No hay kits en el catálogo — crea uno primero con el botón 🎁', ''); return; }
  _addToKitIds = ids;
  const sub = document.getElementById('atk-sub');
  if (sub) {
    const names = ids.slice(0, 3).map(id => products.find(p => p.id === id)?.name || '').filter(Boolean);
    sub.textContent = names.join(', ') + (ids.length > 3 ? ` y ${ids.length - 3} más` : '');
  }
  const list = document.getElementById('atk-list');
  if (list) {
    list.innerHTML = kits.map(kit => {
      const compNames = (kit.kitItems || []).map(i => products.find(p => p.id === i.id)?.name || i.name).join(', ');
      return `<div class="atk-kit-row" onclick="_confirmAddToKit(${kit.id})">
        <img class="atk-kit-img" src="${kit.image || DEFAULT_IMG}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
        <div class="atk-kit-info">
          <div class="atk-kit-name">${kit.name}</div>
          <div class="atk-kit-comps">${kit.kitItems?.length || 0} componentes · ${compNames.slice(0,60)}${compNames.length>60?'…':''}</div>
        </div>
        <button class="atk-kit-add" onclick="event.stopPropagation();_confirmAddToKit(${kit.id})">Agregar</button>
      </div>`;
    }).join('');
  }
  document.getElementById('atk-overlay').classList.add('open');
}

function _closeAddToKit() {
  document.getElementById('atk-overlay').classList.remove('open');
  _addToKitIds = [];
}

async function _confirmAddToKit(kitId) {
  const kit = products.find(p => p.id === kitId);
  if (!kit) return;
  const idsToAdd = [..._addToKitIds]; // guardar antes de que _closeAddToKit limpie el array
  _closeAddToKit();

  const existing = new Set((kit.kitItems || []).map(i => i.id));
  const toAdd = idsToAdd
    .filter(id => !existing.has(id))
    .map(id => {
      const p = products.find(x => x.id === id);
      return p ? { id: p.id, name: p.name, qty: 1, image: p.image || null } : null;
    })
    .filter(Boolean);

  if (!toAdd.length) {
    toast('Todos los productos seleccionados ya están en ese kit', '');
    return;
  }

  const updated = [...(kit.kitItems || []), ...toAdd];
  kit.kitItems = updated;

  const result = await supabaseApi(`products?id=eq.${kitId}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({ kit_items: updated })
  });

  if (!result.ok) { toast('Error al actualizar el kit', 'error'); kit.kitItems = kit.kitItems.filter(i => !toAdd.find(a => a.id === i.id)); return; }

  const skipped = idsToAdd.length - toAdd.length;
  const msg = skipped
    ? `${toAdd.length} agregado${toAdd.length>1?'s':''} a "${kit.name}" · ${skipped} ya estaba${skipped>1?'n':''}`
    : `${toAdd.length} agregado${toAdd.length>1?'s':''} a "${kit.name}"`;
  toast(msg);
  logActivity('producto_editado', `Agregó ${toAdd.length} producto(s) al kit "${kit.name}"`, { id: kitId, name: kit.name });
}
