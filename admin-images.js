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
  const r = await supabaseApi('config?id=in.(groq_key,drive_ep,drive_secret,captura_rapida,dismissed_dups,show_creator,show_batch,show_recv,user_names,user_permissions)&select=id,value');
  if (r.ok && r.data) {
    r.data.forEach(row => {
      if (row.id === 'groq_key')     groqApiKey  = row.value || null;
      if (row.id === 'drive_ep')     driveEp     = row.value || null;
      if (row.id === 'drive_secret') driveSecret = row.value || null;
      if (row.id === 'dismissed_dups') {
        try { _dismissedDupsCache = new Set(JSON.parse(row.value || '[]')); }
        catch { _dismissedDupsCache = new Set(); }
      }
      if (row.id === 'captura_rapida') {
        // false solo si está explícitamente desactivado; por defecto activo
        if (row.value === 'false') {
          document.getElementById('btn-capture-mode')?.style.setProperty('display', 'none');
        }
      }
      if (row.id === 'show_creator') {
        _showCreator = row.value === 'true';
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
      if (row.id === 'user_permissions') {
        try {
          const allPerms = JSON.parse(row.value || '{}');
          const myEmail  = (()=>{ try{ return JSON.parse(localStorage.getItem('te_admin_session')||'{}')?.user?.email||null; }catch{return null;} })();
          const myPerms  = myEmail ? allPerms[myEmail] || null : null;
          if (myPerms) {
            sessionStorage.setItem('te_user_can', JSON.stringify(myPerms));
            _applyUserPermsToAdmin(myPerms);
            _applyRoleUI();
          }
        } catch {}
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

/* ── IMAGE UPLOAD — flujo unificado: cada archivo se agrega a _allImagesEdit (máx 6) ── */
let currentFormImageDataUrl = null; // base64 de la imagen principal para análisis IA

function handleFileSelect(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  if (files.length) addImagesToForm(files);
}

async function addImagesToForm(files) {
  const imgFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imgFiles.length) return;
  document.getElementById('save-btn').disabled = true;
  for (const file of imgFiles) {
    if (_allImagesEdit.length >= 6) { toast('Máximo 6 imágenes en total', ''); break; }
    await _addImageFile(file);
  }
  document.getElementById('save-btn').disabled = false;
}

async function _addImageFile(file) {
  let b64;
  try {
    b64 = await _fileToBase64Resized(file);
  } catch {
    toast('Error al procesar la imagen', 'error');
    return;
  }
  const isMain = _allImagesEdit.length === 0;
  _allImagesEdit.push(b64);
  if (isMain) { currentFormImageDataUrl = b64; showAiFormBtn(); }
  renderAdditionalImages();

  // Intentar subir a Drive; si no hay Drive o falla → se queda en base64
  if (driveEp) {
    const driveUrl = await uploadToDrive(b64);
    const idx = _allImagesEdit.indexOf(b64);
    if (driveUrl && idx > -1) {
      _allImagesEdit[idx] = driveUrl;
      renderAdditionalImages();
    }
  }
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
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) addImagesToForm(files);
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
    document.getElementById('ai-key-prompt').style.display = 'none';
    toast('Key guardada para todos los dispositivos ✓', 'success');
    analyzeFormImage();
  } else { toast('Error al guardar la key', 'error'); }
}
