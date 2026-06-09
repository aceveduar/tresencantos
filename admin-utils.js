/* ── VOICE DICTATION ──────────────────────────────────────────────────── */
let _activeRec = null;

function dictate(fieldId) {
  if (!_activeRec) TE?.track('dictate_start', { field: fieldId });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('Dictado no disponible. Usa Chrome o Safari.', 'error');
    return;
  }

  const btn   = document.getElementById(`dictate-${fieldId}`);
  const field = document.getElementById(fieldId);
  const origLabel = btn.textContent;

  // Detener grabación activa: nullear ANTES de stop() para que onend sepa que fue el usuario
  if (_activeRec) {
    const rec = _activeRec;
    _activeRec = null;
    rec.stop();
    // Limpiar visual del campo activo (puede ser distinto al fieldId actual)
    document.querySelectorAll('.field-recording').forEach(el => el.classList.remove('field-recording'));
    return;
  }

  // Android no mantiene continuous confiablemente — usamos false y reiniciamos en onend
  const isAndroid = /Android/i.test(navigator.userAgent);
  const sr = new SR();
  sr.lang           = 'es-MX';
  sr.interimResults = true;
  sr.continuous     = !isAndroid;

  _activeRec = sr;

  const startValue  = field.value.trimEnd();
  let committedText = '';
  let nextFinalIdx  = 0;
  let _silenceTimer = null;

  const SILENCE_MS = 5000;

  const resetSilenceTimer = () => {
    if (_silenceTimer) clearTimeout(_silenceTimer);
    _silenceTimer = setTimeout(() => stopDictation(), SILENCE_MS);
  };

  const stopDictation = () => {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    if (_activeRec === sr) { _activeRec = null; sr.stop(); }
  };

  if (!btn.dataset.iconOnly) btn.textContent = '⏹ Detener';
  btn.classList.add('recording');
  field.classList.add('field-recording');
  toast('🎤 Grabando… toca el botón para detener', '');

  // FIX Android: blur cierra el teclado del sistema → su micrófono deja de escuchar
  field.blur();

  // Arrancar timer de silencio desde el inicio — se resetea en cada onresult
  resetSilenceTimer();

  sr.onresult = e => {
    resetSilenceTimer(); // cualquier resultado de voz reinicia el contador
    // Solo agregar finales NUEVOS desde nextFinalIdx — nunca releer los ya procesados
    for (let i = nextFinalIdx; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        const t = e.results[i][0].transcript.trim();
        if (t) committedText += (committedText ? ' ' : '') + t;
        nextFinalIdx = i + 1;
      }
    }
    // Interim del resultado actual (solo si no es final)
    const cur     = e.results[e.resultIndex];
    const interim = cur.isFinal ? '' : cur[0].transcript.trim();
    const all     = committedText + (interim ? (committedText ? ' ' : '') + interim : '');
    const sep     = startValue && all ? ' ' : '';
    field.value   = startValue + sep + all;
    if (!cur.isFinal && btn.dataset.iconOnly) return; // búsqueda: solo disparar en finales
    field.dispatchEvent(new Event('input'));
  };

  sr.onend = () => {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    if (_activeRec === sr) {
      // Android cerró la sub-sesión pero el usuario no detuvo — reiniciar
      nextFinalIdx = 0;
      try { sr.start(); } catch (_) {}
    } else {
      // Grabación terminada — limpiar estado visual
      const sep   = startValue && committedText ? ' ' : '';
      let finalVal = (startValue + sep + committedText).trim();
      // Aplicar formato de oraciones solo en el campo descripción
      if (field.id === 'f-description') finalVal = formatDescription(finalVal);
      field.value = finalVal;
      field.dispatchEvent(new Event('input'));
      if (!btn.dataset.iconOnly) btn.textContent = origLabel;
      btn.classList.remove('recording');
      field.classList.remove('field-recording');
      toast('✓ Dictado finalizado', 'success');
    }
  };

  sr.onerror = e => {
    if (_silenceTimer) { clearTimeout(_silenceTimer); _silenceTimer = null; }
    _activeRec = null;
    if (!btn.dataset.iconOnly) btn.textContent = origLabel;
    btn.classList.remove('recording');
    field.classList.remove('field-recording');
    const sep   = startValue && committedText ? ' ' : '';
    field.value = (startValue + sep + committedText).trim();
    field.dispatchEvent(new Event('input'));
    if (e.error === 'not-allowed')
      toast('Permiso de micrófono denegado. Actívalo en los ajustes del navegador.', 'error');
    else if (e.error !== 'aborted')
      toast('Error de micrófono: ' + e.error, 'error');
  };

  sr.start();
}

/* ── TOAST ── */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  const duration = type === 'error' ? 5000 : type === '' ? 1500 : 3000;
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

const truncName = (s, n = 28) => s && s.length > n ? s.slice(0, n) + '…' : (s || '');

function toastUndo(msg, onUndo, onExpire) {
  const el = document.getElementById('undo-bar');
  const msgEl = document.getElementById('undo-msg');
  if (!el) return toast(msg, 'success');
  if (el._t) { clearTimeout(el._t); if (el._expire) el._expire(); el._undo = null; el._expire = null; }
  msgEl.textContent = msg;
  el.classList.add('show');
  el._undo = onUndo;
  el._expire = onExpire || null;
  el._t = setTimeout(() => {
    el.classList.remove('show');
    if (el._expire) el._expire();
    el._undo = null; el._expire = null;
  }, 7000);
}

function toastAction(msg, btnLabel, onAction, duration = 5000) {
  const el    = document.getElementById('action-bar');
  const msgEl = document.getElementById('action-msg');
  const btn   = document.getElementById('action-btn');
  if (!el) return toast(msg, 'success');
  if (el._t) { clearTimeout(el._t); el._action = null; }
  msgEl.textContent = msg;
  btn.textContent   = btnLabel;
  el.classList.add('show');
  el._action = onAction;
  el._t = setTimeout(() => { el.classList.remove('show'); el._action = null; }, duration);
}

function doAction() {
  const el = document.getElementById('action-bar');
  if (!el?._action) return;
  clearTimeout(el._t);
  el.classList.remove('show');
  el._action();
  el._action = null;
}

function doUndo() {
  const el = document.getElementById('undo-bar');
  if (!el?._undo) return;
  clearTimeout(el._t);
  const fn = el._undo;
  el._undo = null;
  el._expire = null;
  el.classList.remove('show');
  fn();
}

/* ── REVISTA ── */
function openRevista() {
  const overlay = document.getElementById('revista-overlay');
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'none';
  document.getElementById('revista-file')._pendingFile = null;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initRevistaUpload();
}

function closeRevista() {
  document.getElementById('revista-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function initRevistaUpload() {
  const zone = document.getElementById('revista-upload-zone');
  if (!zone) return;
  zone.removeEventListener('click', zone._clickHandler);
  zone.removeEventListener('dragover', zone._dragoverHandler);
  zone.removeEventListener('dragleave', zone._dragleaveHandler);
  zone.removeEventListener('drop', zone._dropHandler);

  zone._clickHandler = () => document.getElementById('revista-file').click();
  zone._dragoverHandler = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone._dragleaveHandler = () => zone.classList.remove('drag-over');
  zone._dropHandler = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processRevistaFile(file);
  };

  zone.addEventListener('click', zone._clickHandler);
  zone.addEventListener('dragover', zone._dragoverHandler);
  zone.addEventListener('dragleave', zone._dragleaveHandler);
  zone.addEventListener('drop', zone._dropHandler);
}

function handleRevistaFile(input) {
  const file = input.files[0];
  if (!file) return;
  processRevistaFile(file);
}

function processRevistaFile(file) {
  if (file.type !== 'application/pdf') { toast('Solo se permiten archivos PDF', 'error'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('El PDF es muy grande. Máx 50MB.', 'error'); return; }
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'block';
  document.getElementById('revista-filename').textContent =
    `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  document.getElementById('revista-file')._pendingFile = file;
}

function clearRevistaFile() {
  document.getElementById('revista-file').value = '';
  document.getElementById('revista-file')._pendingFile = null;
  document.getElementById('revista-preview').style.display = 'none';
}

async function saveRevista() {
  const urlInput = document.getElementById('revista-url-input');
  const fileInput = document.getElementById('revista-file');
  const pendingFile = fileInput._pendingFile;
  const urlVal = urlInput.value.trim();

  if (!pendingFile && !urlVal) { toast('Ingresa una URL o sube un PDF', 'error'); return; }

  const saveBtn = document.querySelector('#revista-overlay .btn-gold');
  let finalUrl = urlVal;

  if (pendingFile) {
    setBtn(saveBtn, true, 'Subiendo PDF...');

    // Crear bucket si no existe (ignorar si ya existe)
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'revistas', name: 'revistas', public: true })
      });
    } catch {}

    try {
      const filename = `revista-${Date.now()}.pdf`;
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/revistas/${filename}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true'
        },
        body: pendingFile
      });

      setBtn(saveBtn, false);

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        toast(`Error al subir: ${err.message || err.error || uploadRes.status}`, 'error');
        return;
      }

      finalUrl = `${SUPABASE_URL}/storage/v1/object/public/revistas/${filename}`;
    } catch (e) {
      setBtn(saveBtn, false);
      toast('Error de conexión al subir PDF: ' + e.message, 'error');
      return;
    }
  }

  const result = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'revista_url', value: finalUrl })
  });

  if (!result.ok || result.data?.error) {
    toast('Error al guardar el enlace', 'error');
    return;
  }

  closeRevista();
  toast('Revista guardada correctamente ✓', 'success');
}

/* ── NOMBRES DE USUARIOS ──────────────────────────────────────────────── */
let nameMap = {};

async function _loadNameMap() {
  const { ok, data } = await supabaseApi('config?id=eq.user_names&select=value');
  if (ok && data?.[0]?.value) {
    try { nameMap = JSON.parse(data[0].value); } catch {}
  }
}

async function openNamesModal() {
  const { ok, data } = await supabaseApi('activity_log?select=user_email&limit=500');
  const emails = ok && data ? [...new Set(data.map(d => d.user_email))].filter(Boolean).sort() : [];
  if (!emails.length) { toast('Sin usuarios registrados en el historial de Actividad aún'); return; }
  document.getElementById('names-list-admin').innerHTML = emails.map(e => `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center;margin-bottom:10px">
      <div style="font-size:.78rem;color:var(--muted);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e}">${e}</div>
      <input style="padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:.88rem;outline:none;width:100%;font-family:inherit;transition:border-color .15s"
             data-email="${e}" placeholder="Nombre visible" value="${nameMap[e] || ''}"
             onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
    </div>`).join('');
  document.getElementById('names-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNamesModal() {
  document.getElementById('names-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveNamesAdmin() {
  document.querySelectorAll('#names-list-admin [data-email]').forEach(inp => {
    const val = inp.value.trim();
    if (val) nameMap[inp.dataset.email] = val;
    else delete nameMap[inp.dataset.email];
  });
  const { ok } = await supabaseApi('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'user_names', value: JSON.stringify(nameMap) })
  });
  if (!ok) { toast('Error al guardar', 'error'); return; }
  closeNamesModal();
  toast('Nombres guardados ✓', 'success');
}

/* ── FLAG PARA REVISIÓN — guardado en config Supabase, compartido entre dispositivos ── */
let _flagged = []; // [{id, note, ts}]
let _showOnlyFlagged = localStorage.getItem('te_flag_filter') === '1';

async function loadFlagged() {
  const r = await supabaseApi('config?id=eq.flagged_products&select=value');
  if (r.ok && r.data?.[0]?.value) {
    try { _flagged = JSON.parse(r.data[0].value) || []; } catch { _flagged = []; }
  }
}

async function _saveFlagged() {
  await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'flagged_products', value: JSON.stringify(_flagged) })
  });
}

function _flagItem(id) { return _flagged.find(x => x.id === id); }

async function flagProduct(id, note) {
  _flagged = _flagged.filter(x => x.id !== id);
  _flagged.unshift({ id, note: (note || '').trim(), ts: new Date().toISOString() });
  await _saveFlagged();
  _flagAndRender(id);
  toast('🚩 Marcado para revisar', 'success');
}

async function unflagProduct(id) {
  _flagged = _flagged.filter(x => x.id !== id);
  await _saveFlagged();
  if (_flagged.length === 0) _showOnlyFlagged = false;
  _flagAndRender(id);
  toast('✓ Revisión completada');
}

function _flagAndRender(id) {
  // Actualiza chips/stats pero preserva la página y el scroll para no perder el lugar
  localStorage.setItem('te_flag_filter', _showOnlyFlagged ? '1' : '0');
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  const savedPage = _adminPage;
  renderStats();
  renderTable();
  _adminPage = savedPage;        // re-renderizar no cambia el estado de página
  requestAnimationFrame(() => { window.scrollTo({ top: scrollTop, behavior: 'instant' }); });
  const p = products.find(x => x.id === id);
  if (p && _qvCurrentId === id) _renderQV(p);
}

function toggleFlagFilter() {
  _showOnlyFlagged = !_showOnlyFlagged;
  _syncFlagFilter();
  renderTable();
}

function toggleStatFilter(key) {
  if (key !== 'todos') TE?.track('filter_chip', { chip: key });
  if (key === 'todos') {
    _statFilter = null;
    if (_showOnlyFlagged) { _showOnlyFlagged = false; localStorage.setItem('te_flag_filter','0'); }
  } else if (key === 'revisar') {
    _statFilter = null;
    _showOnlyFlagged = !_showOnlyFlagged;
    localStorage.setItem('te_flag_filter', _showOnlyFlagged ? '1' : '0');
  } else {
    if (_showOnlyFlagged) { _showOnlyFlagged = false; localStorage.setItem('te_flag_filter','0'); }
    _statFilter = _statFilter === key ? null : key;
  }
  _adminPage = 1;
  renderStats();
  renderTable();
}

function _syncFlagFilter() {
  localStorage.setItem('te_flag_filter', _showOnlyFlagged ? '1' : '0');
  _adminPage = 1;
  renderStats();
  renderTable();
}

function _qvShowFlagForm(id) {
  // Mostrar el formulario en el área de acciones (siempre visible, sin scroll)
  const actions = document.getElementById('qv-actions');
  if (!actions) return;
  actions.style.cssText = 'display:block;padding:10px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:#fff';
  actions.innerHTML = `
    <div style="font-size:.72rem;font-weight:600;color:var(--charcoal);margin-bottom:5px">Nota para recordar qué revisar:</div>
    <textarea class="qv-flag-textarea" id="qv-flag-ta" rows="2"
      placeholder="Ej: imagen dice 6 piezas, descripción dice 4…" style="margin-bottom:7px"></textarea>
    <div style="display:flex;gap:7px">
      <button class="qv-btn qv-btn-flag" style="flex:1" onclick="flagProduct(${id},document.getElementById('qv-flag-ta').value)">🚩 Marcar para revisión</button>
      <button class="qv-btn qv-btn-dup" onclick="(p=>p?_renderQV(p):closeQV())(products.find(x=>x.id===${id}))">Cancelar</button>
    </div>`;
  const zone = document.getElementById('qv-flag-zone');
  if (zone) zone.innerHTML = '';
  document.getElementById('qv-flag-ta')?.focus();
}
