const SUPABASE_URL         = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyNjIyNiwiZXhwIjoyMDk0MTAyMjI2fQ.B9nZ1KENDQsUtn9PFwiMTrXuMZuWWIphGnH8XPfeJjQ';
const SESSION_KEY          = 'te_admin_session';
const CAT_PALETTE          = ['#C9A462','#60a5fa','#f472b6','#34d399','#a78bfa','#fb923c','#fbbf24','#a3e635','#2dd4bf','#f87171'];

/* ── AUTH + ROL ── */
let ROLE = 'operador';
(function(){
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.access_token || s.expires_at <= Date.now()/1000 + 60) return window.location.href = 'admin.html';
    ROLE = s?.user?.user_metadata?.role ||
      (() => { try { return JSON.parse(atob(s.access_token.split('.')[1]))?.user_metadata?.role; } catch{} })() ||
      'operador';
    if (ROLE === 'operador') window.location.href = 'admin.html';
  } catch { window.location.href = 'admin.html'; }
})();

function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'admin.html';
}

/* ── API ── */
function api(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', ...opts.headers }
  }).then(async r => {
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text || null; }
    return { ok: r.ok, status: r.status, data };
  });
}

/* ── STATE ── */
let categories = [];
let groqApiKey = null;
let _openSections = new Set();
let _dragCode = null, _dragType = null;
let _catCounts = {};
let driveEp    = null;
let driveSecret= null;
let nameMap    = {};

/* ── INIT ── */
async function init() {
  const [cfgR, catR, namesR] = await Promise.all([
    api('config?id=in.(groq_key,drive_ep,drive_secret,wa_float,captura_rapida,show_creator,show_batch,show_restock,show_recv)&select=id,value'),
    api('config?id=eq.categories&select=value'),
    api('config?id=eq.user_names&select=value')
  ]);

  if (cfgR.ok && cfgR.data) {
    cfgR.data.forEach(row => {
      if (row.id === 'groq_key')     groqApiKey  = row.value || null;
      if (row.id === 'drive_ep')     driveEp     = row.value || null;
      if (row.id === 'drive_secret') driveSecret = row.value || null;
      if (row.id === 'wa_float') {
        const toggle = document.getElementById('wa-float-toggle');
        if (toggle) toggle.checked = row.value !== 'false';
      }
      if (row.id === 'captura_rapida') {
        const toggle = document.getElementById('captura-rapida-toggle');
        if (toggle) toggle.checked = row.value !== 'false';
      }
      if (row.id === 'show_creator') {
        const toggle = document.getElementById('show-creator-toggle');
        if (toggle) toggle.checked = row.value === 'true';
      }
      if (row.id === 'show_batch') {
        const toggle = document.getElementById('show-batch-toggle');
        if (toggle) toggle.checked = row.value === 'true';
      }
      if (row.id === 'show_restock') {
        const toggle = document.getElementById('show-restock-toggle');
        if (toggle) toggle.checked = row.value !== 'false';
      }
      if (row.id === 'show_recv') {
        const toggle = document.getElementById('show-recv-toggle');
        if (toggle) toggle.checked = row.value === 'true';
      }
    });
  }

  if (catR.ok && catR.data?.[0]?.value) {
    try { categories = JSON.parse(catR.data[0].value); } catch { categories = []; }
  }

  if (namesR.ok && namesR.data?.[0]?.value) {
    try { nameMap = JSON.parse(namesR.data[0].value); } catch {}
  }

  loadGroqKeyStatus();
  loadDriveConfig();
}

/* ── GROQ ── */
function loadGroqKeyStatus() {
  const el = document.getElementById('groq-key-status');
  if (!el) return;
  if (groqApiKey) {
    el.textContent = '✓ Configurado'; el.classList.add('ok');
  }
}

async function saveGroqKey() {
  const val = document.getElementById('groq-key-input').value.trim();
  if (!val || !val.startsWith('gsk_')) { toast('Ingresa una key válida (empieza con gsk_)', 'err'); return; }
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'groq_key', value: val })
  });
  if (r.ok) {
    groqApiKey = val;
    document.getElementById('groq-key-input').value = '';
    loadGroqKeyStatus();
    toast('🤖 Groq key guardada — IA activa en todos los dispositivos ✓', 'ok');
  } else { toast('Error al guardar la key', 'err'); }
}

/* ── DRIVE ── */
function loadDriveConfig() {
  if (!driveEp || !driveSecret) return;
  document.getElementById('drive-endpoint-input').value = driveEp;
  document.getElementById('drive-secret-input').value   = driveSecret;
  const st = document.getElementById('drive-status-txt');
  st.textContent = '✓ Conectado'; st.classList.add('ok');
  document.getElementById('drive-test-btn').style.display = '';
  document.getElementById('drive-clear-btn').style.display = '';
}

async function saveDriveEndpoint() {
  const ep = document.getElementById('drive-endpoint-input').value.trim();
  if (!ep) { toast('Pega primero la URL del Apps Script', 'err'); return; }
  if (!driveSecret) driveSecret = 'te_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  driveEp = ep;
  const [r1, r2] = await Promise.all([
    api('config', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id:'drive_ep',     value: ep }) }),
    api('config', { method:'POST', headers:{ Prefer:'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id:'drive_secret', value: driveSecret }) })
  ]);
  if (!r1.ok || !r2.ok) { toast('Error al guardar en Supabase — intenta de nuevo', 'err'); return; }
  document.getElementById('drive-secret-input').value = driveSecret;
  const st = document.getElementById('drive-status-txt');
  st.textContent = '✓ Conectado'; st.classList.add('ok');
  document.getElementById('drive-test-btn').style.display = '';
  document.getElementById('drive-clear-btn').style.display = '';
  toast('Drive guardado — copia el secreto del campo gris y pégalo en tu Apps Script ✓', 'ok');
}

function copyDriveSecret() {
  const val = document.getElementById('drive-secret-input').value;
  if (!val) return;
  navigator.clipboard.writeText(val)
    .then(() => toast('Secreto copiado al portapapeles ✓', 'ok'))
    .catch(() => toast('Selecciona el texto y copia con Ctrl+C / ⌘C', ''));
}

async function clearDrive() {
  if (!confirm('¿Desconectar Google Drive? Las imágenes futuras se guardarán como base64.')) return;
  await Promise.all([
    api('config?id=eq.drive_ep',     { method:'DELETE' }),
    api('config?id=eq.drive_secret', { method:'DELETE' })
  ]);
  driveEp = null; driveSecret = null;
  document.getElementById('drive-endpoint-input').value = '';
  document.getElementById('drive-secret-input').value   = '';
  const st = document.getElementById('drive-status-txt');
  st.textContent = '(no configurado)'; st.classList.remove('ok');
  document.getElementById('drive-test-btn').style.display  = 'none';
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
    toast(txt === 'OK' ? 'Conexión con Drive OK ✓' : 'Respuesta inesperada: ' + txt, txt === 'OK' ? 'ok' : 'err');
  } catch(e) { toast('Error al conectar: ' + e.message, 'err'); }
  btn.textContent = 'Probar conexión'; btn.disabled = false;
}

/* ── WA FLOAT ── */
async function toggleCapturaRapida(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'captura_rapida', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '📸 Captura rápida activada' : '📸 Captura rápida desactivada', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('captura-rapida-toggle').checked = !enabled;
  }
}

async function toggleShowCreator(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'show_creator', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '👤 Ver creador activado' : '👤 Ver creador desactivado', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('show-creator-toggle').checked = !enabled;
  }
}

async function toggleShowRecv(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'show_recv', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '🚚 Recibir mercancía activado en Inventario' : '🚚 Recibir mercancía desactivado', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('show-recv-toggle').checked = !enabled;
  }
}

async function toggleShowRestock(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'show_restock', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '📦 Reabastecimiento activado en Caja' : '📦 Reabastecimiento desactivado en Caja', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('show-restock-toggle').checked = !enabled;
  }
}

async function toggleShowBatch(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'show_batch', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '📸 Carga masiva activada' : '📸 Carga masiva desactivada', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('show-batch-toggle').checked = !enabled;
  }
}

async function toggleWaFloat(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'wa_float', value: String(enabled) })
  });
  if (r.ok) {
    toast(enabled ? '💬 Botón WhatsApp activado en Tienda' : '💬 Botón WhatsApp desactivado', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('wa-float-toggle').checked = !enabled;
  }
}

/* ── CATEGORIES ── */
function rootCats()    { return categories.filter(c => !c.parent); }
function subCats(code) { return categories.filter(c => c.parent === code); }

async function _saveCats() {
  return api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'categories', value: JSON.stringify(categories) })
  });
}

function openCatManager() {
  renderCatList();
  populateCatParent();
  document.getElementById('cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  api('products?select=category').then(r => {
    if (!r.ok || !Array.isArray(r.data)) return;
    _catCounts = {};
    r.data.forEach(p => { if (p.category) _catCounts[p.category] = (_catCounts[p.category]||0)+1; });
    renderCatList();
  });
}

function closeCatManager() {
  document.getElementById('cat-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCatList() {
  const el = document.getElementById('cat-list');
  if (!categories.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:.84rem;text-align:center;padding:16px">Sin categorías</p>';
    return;
  }
  const roots = rootCats();
  el.innerHTML = roots.map(r => {
    const ri = categories.indexOf(r);
    const subs = subCats(r.code);
    const otherRoots = roots.filter(x => x.code !== r.code);
    const parentOpts = otherRoots.map(x => `<option value="${x.code}">${escH(x.label)}</option>`).join('');
    const subRows = subs.map(s => {
      const si = categories.indexOf(s);
      const moveOpts = otherRoots.map(x => `<option value="${x.code}">${x.label}</option>`).join('');
      const cnt = _catCounts[s.code];
      return `<div class="cat-sub-row" draggable="true" data-code="${s.code}"
        ondragstart="_catDragStart(event,'sub','${s.code}')"
        ondragover="_catDragOverSub(event,'${s.code}')"
        ondrop="_catDropSub(event,'${s.code}')"
        ondragend="_catDragEnd()">
        <span class="cat-drag-handle" title="Arrastrar">⠿</span>
        <span class="cat-dot" style="background:${s.color||r.color||'#9B8B78'}" title="${s.code}"></span>
        <input type="text" class="cat-sub-name" value="${escH(s.label)}"
          onblur="updateCatLabel(${si},this.value)"
          onkeydown="if(event.key==='Enter')this.blur()">
        ${cnt ? `<span class="cat-prod-count">${cnt}</span>` : ''}
        ${otherRoots.length ? `<select class="cat-move-sel" onchange="_catMoveToParent('${s.code}',this.value)" title="Mover a otra categoría">
          <option value="" disabled selected>↳</option>
          ${moveOpts}
        </select>` : ''}
        <button class="cat-del" onclick="deleteCategoryAt(${si})" title="Eliminar">✕</button>
      </div>`;
    }).join('');
    const rootCount = (_catCounts[r.code]||0) + subs.reduce((n,s) => n+(_catCounts[s.code]||0), 0);
    return `<div class="cat-section" draggable="true" data-code="${r.code}"
      ondragstart="_catDragStart(event,'root','${r.code}')"
      ondragover="_catDragOverSection(event,'${r.code}')"
      ondrop="_catDropSection(event,'${r.code}')"
      ondragend="_catDragEnd()">
      <div class="cat-sec-head" onclick="toggleCatSection('${r.code}')"
        ondragover="_catDragOverHead(event,'${r.code}')"
        ondrop="_catDropOnHead(event,'${r.code}')">
        <span class="cat-drag-handle" title="Arrastrar para reordenar">⠿</span>
        <span class="cat-sec-arrow">▶</span>
        <span class="cat-dot" style="background:${r.color||'#9B8B78'}" title="${r.code}"></span>
        <input type="text" class="cat-sec-name" value="${escH(r.label)}"
          onclick="event.stopPropagation()"
          onblur="updateCatLabel(${ri},this.value)"
          onkeydown="if(event.key==='Enter')this.blur();event.stopPropagation()">
        ${subs.length ? `<span class="cat-sec-count">${subs.length} sub</span>` : ''}
        ${rootCount ? `<span class="cat-prod-count">${rootCount}</span>` : ''}
        ${otherRoots.length ? `<select class="cat-move-sel" onclick="event.stopPropagation()" onchange="event.stopPropagation();_catMakeSubOf('${r.code}',this.value)" title="Mover como subcategoría de…">
          <option value="" disabled selected>↳</option>
          ${parentOpts}
        </select>` : ''}
        <button class="cat-mgr-add-sub" onclick="event.stopPropagation();_catAddSubInline('${r.code}')" title="Agregar subcategoría">+ Sub</button>
        <button class="cat-del" onclick="event.stopPropagation();deleteCategoryAt(${ri})" title="Eliminar raíz">✕</button>
      </div>
      <div class="cat-sec-body">
        ${subRows ? `<div class="cat-subs-list">${subRows}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  // Restaurar secciones que estaban abiertas
  _openSections.forEach(code => {
    const s = document.querySelector(`.cat-section[data-code="${CSS.escape(code)}"]`);
    if (s) s.classList.add('open');
  });
}

function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function toggleCatSection(code) {
  const section = document.querySelector(`.cat-section[data-code="${CSS.escape(code)}"]`);
  if (!section) return;
  section.classList.toggle('open');
  section.classList.contains('open') ? _openSections.add(code) : _openSections.delete(code);
}

function _catOpenSection(code) {
  _openSections.add(code);
  const s = document.querySelector(`.cat-section[data-code="${CSS.escape(code)}"]`);
  if (s) s.classList.add('open');
}

function _catAddSubInline(parentCode) {
  const section = document.querySelector(`.cat-section[data-code="${CSS.escape(parentCode)}"]`);
  if (!section) return;
  _catOpenSection(parentCode);
  const existing = document.getElementById(`cat-sub-form-${parentCode}`);
  if (existing) { existing.remove(); return; }
  const parent = categories.find(c => c.code === parentCode);
  if (!parent) return;
  const form = document.createElement('div');
  form.id = `cat-sub-form-${parentCode}`;
  form.className = 'cat-sub-inline-form';
  form.innerHTML = `
    <span class="cat-dot" style="background:${parent.color||'#9B8B78'}"></span>
    <input id="cat-sub-inp-${parentCode}" type="text" placeholder="Nombre de la subcategoría…" class="cat-sub-new-inp"
      onkeydown="if(event.key==='Enter')_catSubConfirm('${parentCode}');if(event.key==='Escape')this.closest('.cat-sub-inline-form').remove()">
    <button onclick="_catSubConfirm('${parentCode}')" class="btn btn-gold btn-sm" style="flex-shrink:0;padding:6px 12px">✓</button>
    <button onclick="document.getElementById('cat-sub-form-${parentCode}').remove()" class="cat-del">✕</button>`;
  section.querySelector('.cat-sec-body').appendChild(form);
  setTimeout(() => document.getElementById(`cat-sub-inp-${parentCode}`)?.focus(), 50);
}

async function _catSubConfirm(parentCode) {
  const input = document.getElementById(`cat-sub-inp-${parentCode}`);
  const label = input?.value.trim();
  if (!label) { input?.focus(); return; }
  const code = parentCode + '_' + label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  if (categories.find(c => c.code === code)) { toast('Ya existe esa subcategoría', 'err'); input?.focus(); return; }
  const parent = categories.find(c => c.code === parentCode);
  const color = parent?.color || CAT_PALETTE[categories.length % CAT_PALETTE.length];
  categories.push({ code, label, color, parent: parentCode });
  await _saveCats();
  renderCatList();
  populateCatParent();
  _catOpenSection(parentCode);
  toast(`"${label}" agregada ✓`, 'ok');
}

async function _catMoveToParent(subCode, newParentCode) {
  if (!newParentCode) return;
  const sub = categories.find(c => c.code === subCode);
  const newParent = categories.find(c => c.code === newParentCode);
  if (!sub || !newParent) return;
  sub.parent = newParentCode;
  sub.color = newParent.color || sub.color;
  await _saveCats();
  renderCatList();
  populateCatParent();
  _catOpenSection(newParentCode);
  toast(`"${sub.label}" movida a "${newParent.label}" ✓`, 'ok');
}

async function _catMakeSubOf(rootCode, newParentCode) {
  if (!newParentCode) { renderCatList(); return; }
  const root = categories.find(c => c.code === rootCode);
  const newParent = categories.find(c => c.code === newParentCode);
  if (!root || !newParent) { renderCatList(); return; }
  const children = subCats(rootCode);
  const msg = children.length
    ? `¿Mover "${root.label}" y sus ${children.length} subcategoría(s) a "${newParent.label}"?`
    : `¿Mover "${root.label}" a "${newParent.label}"?`;
  if (!confirm(msg)) { renderCatList(); return; }
  root.parent = newParentCode;
  root.color = newParent.color || root.color;
  children.forEach(c => { c.parent = newParentCode; c.color = newParent.color || c.color; });
  await _saveCats();
  renderCatList();
  populateCatParent();
  _catOpenSection(newParentCode);
  const msg2 = children.length
    ? `"${root.label}" y ${children.length} sub(s) movidas a "${newParent.label}" ✓`
    : `"${root.label}" movida a "${newParent.label}" ✓`;
  toast(msg2, 'ok');
}

/* ── DRAG & DROP ─────────────────────────────────────────────────── */
function _catDragStart(e, type, code) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
    e.preventDefault(); return;
  }
  if (type === 'sub') e.stopPropagation(); // evita que burbujee al .cat-section padre
  _dragCode = code; _dragType = type;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', code);
  setTimeout(() => {
    const el = document.querySelector(
      type === 'root' ? `.cat-section[data-code="${CSS.escape(code)}"]`
                      : `.cat-sub-row[data-code="${CSS.escape(code)}"]`);
    if (el) el.classList.add('cat-dragging');
  }, 0);
}

function _catDragEnd() {
  document.querySelectorAll('.cat-dragging,.cat-drag-over,.cat-drag-accept')
    .forEach(el => el.classList.remove('cat-dragging','cat-drag-over','cat-drag-accept'));
  _dragCode = null; _dragType = null;
}

function _catDragOverSection(e, targetCode) {
  if (_dragType !== 'root' || _dragCode === targetCode) return;
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
  e.currentTarget.classList.add('cat-drag-over');
}

function _catDropSection(e, targetCode) {
  e.preventDefault(); e.stopPropagation();
  if (_dragType !== 'root' || _dragCode === targetCode) return;
  _catReorder(_dragCode, targetCode);
}

function _catDragOverHead(e, parentCode) {
  if (_dragCode === parentCode) return;
  if (_dragType === 'sub') {
    const sub = categories.find(c => c.code === _dragCode);
    if (!sub || sub.parent === parentCode) return;
  }
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.cat-drag-accept,.cat-drag-over').forEach(el => el.classList.remove('cat-drag-accept','cat-drag-over'));
  e.currentTarget.classList.add('cat-drag-accept');
}

function _catDropOnHead(e, parentCode) {
  e.preventDefault(); e.stopPropagation();
  if (_dragCode === parentCode) return;
  const newParent = categories.find(c => c.code === parentCode);
  if (!newParent) return;

  if (_dragType === 'sub') {
    const sub = categories.find(c => c.code === _dragCode);
    if (!sub || sub.parent === parentCode) return;
    sub.parent = parentCode;
    sub.color = newParent.color || sub.color;
    _saveCats().then(() => {
      renderCatList(); populateCatParent(); _catOpenSection(parentCode);
      toast(`"${sub.label}" movida a "${newParent.label}" ✓`, 'ok');
    });
    return;
  }

  if (_dragType === 'root') {
    const root = categories.find(c => c.code === _dragCode);
    if (!root) return;
    const children = subCats(root.code);
    root.parent = parentCode;
    root.color = newParent.color || root.color;
    children.forEach(c => { c.parent = parentCode; c.color = newParent.color || c.color; });
    _saveCats().then(() => {
      renderCatList(); populateCatParent(); _catOpenSection(parentCode);
      const msg = children.length
        ? `"${root.label}" y ${children.length} sub(s) movidas a "${newParent.label}" ✓`
        : `"${root.label}" movida a "${newParent.label}" ✓`;
      toast(msg, 'ok');
    });
  }
}

function _catDragOverSub(e, targetCode) {
  if (_dragType !== 'sub' || _dragCode === targetCode) return;
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('.cat-sub-row.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
  e.currentTarget.classList.add('cat-drag-over');
}

function _catDropSub(e, targetCode) {
  e.preventDefault(); e.stopPropagation();
  if (_dragType !== 'sub' || _dragCode === targetCode) return;
  const src = categories.find(c => c.code === _dragCode);
  const tgt = categories.find(c => c.code === targetCode);
  if (!src || !tgt || src.parent !== tgt.parent) return;
  _catReorder(_dragCode, targetCode);
}

async function _catReorder(srcCode, tgtCode) {
  const srcIdx = categories.findIndex(c => c.code === srcCode);
  const tgtIdx = categories.findIndex(c => c.code === tgtCode);
  if (srcIdx === -1 || tgtIdx === -1) return;
  const [item] = categories.splice(srcIdx, 1);
  const newTgt = categories.findIndex(c => c.code === tgtCode);
  categories.splice(newTgt, 0, item);
  await _saveCats();
  renderCatList();
  if (item.parent) _catOpenSection(item.parent);
}

function populateCatParent() {
  const sel = document.getElementById('new-cat-parent');
  sel.innerHTML = '<option value="">— Es categoría raíz —</option>';
  rootCats().forEach(r => {
    const o = document.createElement('option');
    o.value = r.code; o.textContent = r.label;
    sel.appendChild(o);
  });
}

async function updateCatLabel(idx, newLabel) {
  const label = newLabel.trim();
  if (!label || label === categories[idx]?.label) return;
  const code = categories[idx].code;
  categories[idx].label = label;
  await _saveCats();
  await api(`products?category=eq.${code}`, { method:'PATCH', body: JSON.stringify({ category_label: label }) });
  toast(`"${label}" actualizado ✓`, 'ok');
}

async function deleteCategoryAt(idx) {
  const c = categories[idx];
  const r = await api(`products?category=eq.${c.code}&select=id`);
  const count = r.ok && Array.isArray(r.data) ? r.data.length : 0;
  const msg = count > 0
    ? `¿Eliminar "${c.label}"? ${count} producto(s) quedarán sin categoría. ¿Continuar?`
    : `¿Eliminar la categoría "${c.label}"?`;
  if (!confirm(msg)) return;
  categories.splice(idx, 1);
  await _saveCats();
  renderCatList();
  populateCatParent();
  toast('Categoría eliminada', '');
}

async function addCategory() {
  const labelInput = document.getElementById('new-cat-label');
  const parentSel  = document.getElementById('new-cat-parent');
  const label  = labelInput.value.trim();
  const parent = parentSel.value;
  if (!label) { toast('Escribe el nombre de la categoría', 'err'); labelInput.focus(); return; }
  const base = label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const code = parent ? `${parent}_${base}` : base;
  if (categories.find(c => c.code === code)) { toast('Ya existe una categoría con ese nombre', 'err'); return; }
  const color = CAT_PALETTE[categories.length % CAT_PALETTE.length];
  const newCat = { code, label, color };
  if (parent && categories.find(c => c.code === parent)) newCat.parent = parent;
  categories.push(newCat);
  await _saveCats();
  renderCatList();
  populateCatParent();
  labelInput.value = '';
  parentSel.value = '';
  if (parent) _catOpenSection(parent);
  toast(`${parent ? 'Subcategoría' : 'Categoría'} "${label}" creada ✓`, 'ok');
}

/* ── REVISTA ── */
function openRevista() {
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'none';
  document.getElementById('revista-file')._pendingFile = null;
  document.getElementById('revista-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  initRevistaZone();
}

function closeRevista() {
  document.getElementById('revista-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function initRevistaZone() {
  const zone = document.getElementById('revista-upload-zone');
  const clone = zone.cloneNode(true);
  zone.parentNode.replaceChild(clone, zone);
  clone.addEventListener('click', () => document.getElementById('revista-file').click());
  clone.addEventListener('dragover', e => { e.preventDefault(); clone.classList.add('drag-over'); });
  clone.addEventListener('dragleave', () => clone.classList.remove('drag-over'));
  clone.addEventListener('drop', e => {
    e.preventDefault(); clone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processRevistaFile(file);
  });
}

function handleRevistaFile(input) {
  if (input.files[0]) processRevistaFile(input.files[0]);
}

function processRevistaFile(file) {
  if (file.type !== 'application/pdf') { toast('Solo se permiten archivos PDF', 'err'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('El PDF es muy grande. Máx 50MB.', 'err'); return; }
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'block';
  document.getElementById('revista-filename').textContent = `${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;
  document.getElementById('revista-file')._pendingFile = file;
}

function clearRevistaFile() {
  document.getElementById('revista-file').value = '';
  document.getElementById('revista-file')._pendingFile = null;
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'none';
}

async function saveRevista() {
  const fileInput   = document.getElementById('revista-file');
  const pendingFile = fileInput._pendingFile;
  const urlVal      = document.getElementById('revista-url-input').value.trim();
  if (!pendingFile && !urlVal) { toast('Ingresa una URL o sube un PDF', 'err'); return; }

  const saveBtn = document.getElementById('revista-save-btn');
  let finalUrl  = urlVal;

  if (pendingFile) {
    saveBtn.textContent = 'Subiendo PDF…'; saveBtn.disabled = true;
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id:'revistas', name:'revistas', public: true })
      });
    } catch {}
    try {
      const filename = `revista-${Date.now()}.pdf`;
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/revistas/${filename}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
        body: pendingFile
      });
      saveBtn.textContent = 'Guardar revista'; saveBtn.disabled = false;
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        toast(`Error al subir: ${err.message || err.error || uploadRes.status}`, 'err');
        return;
      }
      finalUrl = `${SUPABASE_URL}/storage/v1/object/public/revistas/${filename}`;
    } catch(e) {
      saveBtn.textContent = 'Guardar revista'; saveBtn.disabled = false;
      toast('Error de conexión: ' + e.message, 'err');
      return;
    }
  }

  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'revista_url', value: finalUrl })
  });
  if (!r.ok) { toast('Error al guardar el enlace', 'err'); return; }
  closeRevista();
  toast('Revista guardada ✓', 'ok');
}

/* ── NOMBRES ── */
async function openNamesModal() {
  // Obtener usuarios reales desde Supabase Auth Admin API
  let emails = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    if (r.ok) {
      const data = await r.json();
      emails = (data.users || []).map(u => u.email).filter(Boolean);
    }
  } catch {}
  // Fallback: emails del activity_log si la API falla
  if (!emails.length) {
    const r2 = await api('activity_log?select=user_email&limit=500');
    if (r2.ok && r2.data) emails = [...new Set(r2.data.map(d => d.user_email))].filter(Boolean);
  }
  // Incluir también usuarios que ya tenían nombre guardado pero no están en las fuentes anteriores
  Object.keys(nameMap).forEach(e => { if (!emails.includes(e)) emails.push(e); });
  emails = emails.sort();
  if (!emails.length) { toast('Sin usuarios registrados aún'); return; }
  document.getElementById('names-list').innerHTML = emails.map(e => `
    <div class="name-pair">
      <div class="name-email" title="${e}">${e}</div>
      <input class="field-input" data-email="${e}" placeholder="Nombre visible" value="${nameMap[e]||''}"
             style="padding:8px 12px">
    </div>`).join('');
  document.getElementById('names-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNamesModal() {
  document.getElementById('names-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveNamesAdmin() {
  document.querySelectorAll('#names-list [data-email]').forEach(inp => {
    const val = inp.value.trim();
    if (val) nameMap[inp.dataset.email] = val;
    else delete nameMap[inp.dataset.email];
  });
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'user_names', value: JSON.stringify(nameMap) })
  });
  if (!r.ok) { toast('Error al guardar', 'err'); return; }
  closeNamesModal();
  toast('Nombres guardados ✓', 'ok');
}

/* ── EXPORT / IMPORT ── */
async function exportProducts() {
  const r = await api('products?select=*&order=position.asc');
  if (!r.ok || !r.data?.length) { toast('Sin productos para exportar', ''); return; }
  const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tres-encantos-productos-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast(`${r.data.length} productos exportados ✓`, 'ok');
}

function importProducts(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const raw = JSON.parse(e.target.result);
      if (!Array.isArray(raw) || !raw.length) { toast('Archivo inválido', 'err'); return; }
      if (!confirm(`¿Importar ${raw.length} productos? Los existentes con el mismo ID se actualizarán.`)) return;
      toast('Importando…', '');
      const r = await api('products', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(raw)
      });
      if (r.ok) toast(`${raw.length} productos importados ✓`, 'ok');
      else toast('Error al importar', 'err');
    } catch { toast('Archivo JSON inválido', 'err'); }
  };
  reader.readAsText(file);
  input.value = '';
}

/* ── LOG DE ACTIVIDAD ── */
async function clearActivityLog() {
  const range = document.getElementById('log-range-select')?.value || 'all';
  const labels = { '1w':'más de 1 semana', '1m':'más de 1 mes', '3m':'más de 3 meses', '6m':'más de 6 meses', 'all':'todo el historial' };
  if (!confirm(`¿Borrar los registros de ${labels[range]}?\nEsta acción no se puede deshacer.`)) return;

  let filter;
  if (range === 'all') {
    filter = 'activity_log?id=gt.0';
  } else {
    const days = { '1w': 7, '1m': 30, '3m': 90, '6m': 180 }[range];
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    filter = `activity_log?created_at=lt.${encodeURIComponent(cutoff)}`;
  }

  const r = await api(filter, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (r.ok) toast(`Registros de ${labels[range]} eliminados ✓`, 'ok');
  else toast('Error al borrar el historial', 'err');
}

/* ── TOAST ── */
let _toastT;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast${type ? ' '+type : ''} show`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.classList.remove('show'), type === 'err' ? 5000 : 3000);
}

/* ── CLOSE ON BACKDROP ── */
document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'), document.body.style.overflow = ''; });
});

/* ── ESCAPE KEY ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(ov => { ov.classList.remove('open'); document.body.style.overflow = ''; });
});

document.addEventListener('DOMContentLoaded', () => {
  try {
    const _s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    const _m = _s?.user?.user_metadata || {};
    const _n = _m.full_name || _m.name || _s?.user?.email?.split('@')[0] || '';
    const _av = document.getElementById('user-avatar');
    const _nl = document.getElementById('user-name-lbl');
    if (_av) _av.textContent = _n ? _n[0].toUpperCase() : '?';
    if (_nl) _nl.textContent = _n;
  } catch {}
  init();
  if (ROLE === 'superadmin') {
    const row = document.getElementById('clear-log-row');
    if (row) row.style.display = '';
  }
  // Mostrar conteo de duplicados desde última revisión en Inventario
  const dupCount = parseInt(localStorage.getItem('te_dup_last_count') || '0');
  const dupTag = document.getElementById('dup-count-tag');
  if (dupTag && dupCount > 0) {
    dupTag.innerHTML = ` — <strong style="color:#D97706">${dupCount} posibles</strong>`;
  }
});
