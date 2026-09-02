const SUPABASE_URL         = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
const SUPABASE_ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjYyMjYsImV4cCI6MjA5NDEwMjIyNn0.irCFwOR5HL_ZOVjFGVw9LqmzYicDZTNEmxcknu_j6cI';
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
  } catch { window.location.href = 'admin.html'; }
})();

function doLogout() {
  sessionStorage.removeItem('te_user_can');
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'admin.html';
}

/* ── API ── */
function _getSettingsToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return s?.access_token || SUPABASE_ANON_KEY;
  } catch { return SUPABASE_ANON_KEY; }
}
async function _refreshSettingsToken() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s?.refresh_token) return false;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.access_token) return false;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: Math.floor(Date.now()/1000) + (d.expires_in||3600),
      email: d.user?.email || s.email, user: d.user || s.user
    }));
    return true;
  } catch { return false; }
}
async function api(path, opts = {}) {
  const _call = (tk) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', ...opts.headers }
  }).then(async r => {
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text || null; }
    return { ok: r.ok, status: r.status, data };
  });
  const r = await _call(_getSettingsToken());
  if (r.status === 401 && await _refreshSettingsToken()) return _call(_getSettingsToken());
  return r;
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
let userPermsMap = {};  // { "email": { role, canXxx: bool, … } }
const _myEmail = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'{}')?.user?.email||''; } catch { return ''; } })();
function logActivity(action, summary, meta = null) {
  api('activity_log', {
    method: 'POST',
    body: JSON.stringify({ user_email: _myEmail, action, summary, meta })
  }).catch(() => {});
}

/* ── INIT ── */
async function init() {
  const [cfgR, catR, namesR] = await Promise.all([
    api('config?id=in.(groq_key,drive_ep,drive_secret,wa_float,captura_rapida,show_creator,show_restock,show_recv,user_permissions)&select=id,value'),
    api('config?id=eq.categories&select=value'),
    api('config?id=eq.user_names&select=value')
  ]);

  if (cfgR.ok && cfgR.data) {
    cfgR.data.forEach(row => {
      if (row.id === 'groq_key')          groqApiKey   = row.value || null;
      if (row.id === 'drive_ep')          driveEp      = row.value || null;
      if (row.id === 'drive_secret')      driveSecret  = row.value || null;
      if (row.id === 'user_permissions')  { try { userPermsMap = JSON.parse(row.value||'{}'); } catch {} }
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

  // Migración silenciosa: corregir operadores con canDelete/canPublish:true (bug pre-2026-06-19)
  let _driftFixed = false;
  Object.values(userPermsMap).forEach(perms => {
    if ((!perms.role || perms.role === 'operador') &&
        (perms.canDeleteProduct === true || perms.canPublishProduct === true)) {
      perms.canDeleteProduct  = false;
      perms.canPublishProduct = false;
      _driftFixed = true;
    }
  });
  if (_driftFixed) api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'user_permissions', value: JSON.stringify(userPermsMap) })
  });

  if (catR.ok && catR.data?.[0]?.value) {
    try { categories = JSON.parse(catR.data[0].value); } catch { categories = []; }
  }

  if (namesR.ok && namesR.data?.[0]?.value) {
    try { nameMap = JSON.parse(namesR.data[0].value); } catch {}
  }

  renderUsersPerms();
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
    logActivity('configuracion_editada', 'Actualizó la Groq API key', { setting: 'groq_key' });
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
  logActivity('configuracion_editada', 'Configuró/actualizó Google Drive', { setting: 'drive_ep' });
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
  logActivity('configuracion_editada', 'Desconectó Google Drive', { setting: 'drive_ep' });
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
    logActivity('configuracion_editada', `${enabled ? 'Activó' : 'Desactivó'} Captura rápida`, { setting: 'captura_rapida', value: enabled });
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
    logActivity('configuracion_editada', `${enabled ? 'Activó' : 'Desactivó'} Ver creador`, { setting: 'show_creator', value: enabled });
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
    logActivity('configuracion_editada', `${enabled ? 'Activó' : 'Desactivó'} Recibir mercancía`, { setting: 'show_recv', value: enabled });
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
    logActivity('configuracion_editada', `${enabled ? 'Activó' : 'Desactivó'} Reabastecimiento en Caja`, { setting: 'show_restock', value: enabled });
    toast(enabled ? '📦 Reabastecimiento activado en Caja' : '📦 Reabastecimiento desactivado en Caja', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('show-restock-toggle').checked = !enabled;
  }
}

async function toggleWaFloat(enabled) {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'wa_float', value: String(enabled) })
  });
  if (r.ok) {
    logActivity('configuracion_editada', `${enabled ? 'Activó' : 'Desactivó'} el botón WhatsApp flotante en Tienda`, { setting: 'wa_float', value: enabled });
    toast(enabled ? '💬 Botón WhatsApp activado en Tienda' : '💬 Botón WhatsApp desactivado', 'ok');
  } else {
    toast('Error al guardar', 'err');
    document.getElementById('wa-float-toggle').checked = !enabled;
  }
}

/* ── NOTIFICACIONES DE VENTA (por dispositivo — ver shared.js) ── */
async function toggleSalesNotif(checked) {
  const toggle = document.getElementById('sales-notif-toggle');
  if (checked) {
    if (!('Notification' in window)) {
      toast('Tu navegador no soporta notificaciones', 'err');
      if (toggle) toggle.checked = false;
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      if (toggle) toggle.checked = false;
      toast('Permiso de notificaciones denegado — actívalo en los ajustes del navegador', 'err');
      _renderSalesNotifHint();
      return;
    }
    localStorage.setItem('te_sales_notif_enabled', '1');
    toast('Notificaciones de venta activadas en este dispositivo ✓', 'ok');
    window._startSalesNotifPolling?.();
  } else {
    localStorage.setItem('te_sales_notif_enabled', '0');
    window._stopSalesNotifPolling?.();
    toast('Notificaciones de venta desactivadas', 'ok');
  }
  _renderSalesNotifHint();
}

function _renderSalesNotifHint() {
  const row  = document.getElementById('sales-notif-hint-row');
  const hint = document.getElementById('sales-notif-hint');
  if (!row || !hint) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
    hint.innerHTML = '<svg style="width:13px;height:13px;vertical-align:-2px;margin-right:3px;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Bloqueadas en este navegador — actívalas en los ajustes del sitio (candado en la barra de direcciones) para poder usarlas aquí.';
    row.style.display = '';
  } else if (localStorage.getItem('te_sales_notif_enabled') === '1') {
    hint.textContent = 'Activas en este dispositivo. Solo llegan mientras tengas una pestaña de Tres Encantos abierta (puede estar en segundo plano) — si cierras el navegador del todo, no llegan.';
    row.style.display = '';
  } else {
    row.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('sales-notif-toggle');
  if (toggle) {
    toggle.checked = typeof Notification !== 'undefined' && Notification.permission === 'granted'
      && localStorage.getItem('te_sales_notif_enabled') === '1';
  }
  _renderSalesNotifHint();
});

/* ── CATEGORIES ── */
function rootCats()    { return categories.filter(c => !c.parent); }
function subCats(code) { return categories.filter(c => c.parent === code); }

async function _saveCats() {
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'categories', value: JSON.stringify(categories) })
  });
  // Ninguno de los llamadores revisaba r.ok -- si el guardado fallaba (RLS,
  // red), la UI mutaba el estado local y mostraba un toast verde de éxito
  // igual; el cambio se revertía solo al recargar, sin que nadie se enterara
  // de que nunca se guardó de verdad.
  if (!r.ok) toast('Error al guardar — el cambio no se guardó, recarga para verificar', 'err');
  return r;
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
      const moveOpts = otherRoots.map(x => `<option value="${x.code}">${escH(x.label)}</option>`).join('');
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

function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
  // Si es una raíz con subcategorías, hay que contar y borrar también sus
  // hijas -- antes splice(idx,1) solo quitaba la raíz, dejando las
  // subcategorías huérfanas en la config (con parent apuntando a un código
  // que ya no existe) y el conteo del diálogo por debajo del real, porque
  // solo consultaba productos con category=eq.<código de la raíz>.
  const children = !c.parent ? subCats(c.code) : [];
  const codes = [c.code, ...children.map(x => x.code)];
  const r = await api(`products?category=in.(${codes.join(',')})&select=id`);
  const count = r.ok && Array.isArray(r.data) ? r.data.length : 0;
  const childWarning = children.length
    ? ` (incluye ${children.length} subcategoría${children.length !== 1 ? 's' : ''}: ${children.map(x => x.label).join(', ')})`
    : '';
  // El mensaje anterior decía "quedarán sin categoría", pero eso no es lo
  // que pasa -- el producto conserva el código eliminado y desaparece de
  // los filtros sin avisar (el riesgo ya documentado, causante de ~300
  // productos huérfanos encontrados y corregidos por separado esta misma
  // sesión). El mensaje ahora describe la consecuencia real.
  const msg = count > 0
    ? `¿Eliminar "${c.label}"${childWarning}? ${count} producto(s) quedarán con una categoría que ya no existe — desaparecerán de los filtros de Inventario/Caja/Tienda aunque sigan existiendo (solo se verán en "Todos" o buscando por texto). ¿Continuar?`
    : `¿Eliminar la categoría "${c.label}"${childWarning}?`;
  if (!confirm(msg)) return;
  const removeCodes = new Set(codes);
  const snapshot = categories;
  categories = categories.filter(x => !removeCodes.has(x.code));
  const saveResult = await _saveCats();
  if (!saveResult.ok) { categories = snapshot; return; }
  renderCatList();
  populateCatParent();
  logActivity('configuracion_editada', `Eliminó la categoría "${c.label}"${children.length ? ` y ${children.length} subcategoría(s)` : ''}`, { code: c.code, label: c.label, childCodes: children.map(x => x.code) });
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
  logActivity('configuracion_editada', `Creó ${parent ? 'la subcategoría' : 'la categoría'} "${label}"`, { code, label, parent: parent || null });
  toast(`${parent ? 'Subcategoría' : 'Categoría'} "${label}" creada ✓`, 'ok');
}

/* ── REVISTA ── */
async function openRevista() {
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-cover-input').value = '';
  document.getElementById('revista-preview').style.display = 'none';
  document.getElementById('revista-file')._pendingFile = null;
  try {
    const r = await api('config?id=in.(revista_url,revista_cover)&select=id,value');
    if (r.ok && r.data) {
      r.data.forEach(row => {
        if (row.id === 'revista_url') document.getElementById('revista-url-input').value = row.value || '';
        if (row.id === 'revista_cover') document.getElementById('revista-cover-input').value = row.value || '';
      });
    }
  } catch {}
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
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_getSettingsToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id:'revistas', name:'revistas', public: true })
      });
    } catch {}
    try {
      const filename = `revista-${Date.now()}.pdf`;
      const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/revistas/${filename}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${_getSettingsToken()}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
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

  const coverVal = document.getElementById('revista-cover-input').value.trim();
  await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'revista_cover', value: coverVal })
  });

  closeRevista();
  logActivity('configuracion_editada', 'Actualizó la Revista Digital Natura', { setting: 'revista_url' });
  toast('Revista guardada ✓', 'ok');
}

/* ── RESPALDO COMPLETO ──
   Solo lectura — descarga una copia de las tablas críticas en un JSON. No es
   un mecanismo de restauración: sales/sale_payments están bloqueadas contra
   escritura directa a propósito (fase 2 del lockdown de Caja v2, ver
   CLAUDE.md), así que "restaurar" esas tablas desde un archivo no es un
   camino que este botón ofrezca ni deba ofrecer. Para recuperación real ante
   un incidente, el mecanismo es el respaldo/point-in-time-recovery de
   Supabase (Dashboard → Database → Backups), fuera del alcance del código. */
async function exportFullBackup() {
  const btn = document.getElementById('backup-full-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Exportando…'; }
  const tables = [
    ['products',      'products?select=*&order=id.asc'],
    ['sales',         'sales?select=*&order=id.asc'],
    ['sale_payments', 'sale_payments?select=*&order=id.asc'],
    ['customers',     'customers?select=*&order=id.asc'],
    ['activity_log',  'activity_log?select=*&order=id.asc'],
    ['config',        'config?select=*']
  ];
  const result = {};
  for (const [name, query] of tables) {
    const r = await _posPaginatedFetch(query);
    if (!r.ok) {
      toast(`No se pudo exportar "${name}" — respaldo cancelado, ningún archivo se descargó`, 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Exportar todo'; }
      return;
    }
    result[name] = r.data || [];
  }
  const payload = { exported_at: new Date().toISOString(), ...result };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tres-encantos-respaldo-completo-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  const counts = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length]));
  const totalRows = Object.values(counts).reduce((s, n) => s + n, 0);
  toast(`Respaldo completo generado — ${totalRows.toLocaleString('es-MX')} registros ✓`, 'ok');
  logActivity('respaldo_generado', `Respaldo completo generado (${totalRows.toLocaleString('es-MX')} registros)`, counts);
  if (btn) { btn.disabled = false; btn.textContent = 'Exportar todo'; }
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
  if (r.ok) {
    // Se registra despues de borrar -- si se registrara antes, el propio
    // borrado (rango "todo") eliminaria esta marca junto con el resto.
    logActivity('configuracion_editada', `Limpió el historial de Actividad (${labels[range]})`, { range });
    toast(`Registros de ${labels[range]} eliminados ✓`, 'ok');
  }
  else toast('Error al borrar el historial', 'err');
}

/* ── USER PERMISSIONS PANEL ── */
const _UP_ROLE_LABELS = {superadmin:'Superadmin', encargado:'Encargada', duena:'Dueña', operador:'Operador'};
const _UP_AVATAR_COLORS = ['#C9A462','#60a5fa','#f472b6','#34d399','#a78bfa','#fb923c'];

function _upAvatarColor(email) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return _UP_AVATAR_COLORS[h % _UP_AVATAR_COLORS.length];
}

// Cuenta cuántos permisos de `email` difieren del default de su rol —
// usado tanto para el badge "Personalizado" en la fila colapsada como
// para habilitar "Restablecer al rol" en el detalle.
function _upOverrideCount(email) {
  const perms = userPermsMap[email] || {};
  const role  = perms.role || 'operador';
  const defs  = UP_ROLE_DEFAULTS[role] || UP_ROLE_DEFAULTS.operador;
  return UP_PERMS.reduce((n, p) => {
    const val = p.key in perms ? perms[p.key] : defs[p.key];
    return n + (val !== defs[p.key] ? 1 : 0);
  }, 0);
}

function renderUsersPerms() {
  const list = document.getElementById('up-list');
  if (!list) return;

  const allEmails = [...new Set([...Object.keys(nameMap), ...Object.keys(userPermsMap)])].sort();
  if (!allEmails.length) {
    list.innerHTML = '<div class="up-loading">Sin usuarios registrados</div>';
    return;
  }
  list.innerHTML = allEmails.map(email => _renderUserCard(email)).join('');
}

function _renderUserCard(email) {
  const name   = nameMap[email] || email.split('@')[0];
  const initial= name.slice(0,1).toUpperCase();
  const color  = _upAvatarColor(email);
  const isMe   = email === _myEmail;
  const perms  = userPermsMap[email] || {};
  const role   = perms.role || 'operador';

  const roleOpts = ['superadmin','encargado','duena','operador'].map(v =>
    `<option value="${v}"${v===role?' selected':''}>${escH(_UP_ROLE_LABELS[v]||v)}</option>`
  ).join('');
  const overrideCount = _upOverrideCount(email);
  const overrideBadge = overrideCount
    ? `<span class="up-override-badge" title="${overrideCount} permiso${overrideCount>1?'s':''} distinto${overrideCount>1?'s':''} al default de ${escH(_UP_ROLE_LABELS[role]||role)}">${overrideCount} personalizado${overrideCount>1?'s':''}</span>`
    : '';

  return `<div class="up-card" data-email="${escH(email)}">
    <div class="up-head">
      <div class="up-toggle-area" onclick="_upToggleCard(this)">
        <div class="up-avatar" style="background:${color}">${escH(initial)}</div>
        <div class="up-meta">
          <div class="up-name">
            <input class="up-name-inp" value="${escH(name)}" data-orig="${escH(name)}"
              onclick="event.stopPropagation()"
              onblur="_upSaveName(this,'${escH(email).replace(/'/g,"\\'")}')"
              onkeydown="if(event.key==='Enter')this.blur();else if(event.key==='Escape'){this.value=this.dataset.orig;this.blur()}">
            ${isMe?` <span class="up-me">tú</span>`:''}
            ${overrideBadge}
          </div>
          <div class="up-email">${escH(email)}</div>
        </div>
        <span class="up-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
      </div>
      <select class="up-role-sel" onclick="event.stopPropagation()" onchange="_upRoleChange(this)"${isMe ? ' disabled title="No puedes cambiar tu propio rol"' : ''}>
        ${roleOpts}
      </select>
      ${isMe ? '' : `<button class="up-remove-btn" onclick="event.stopPropagation();_upRemoveUser('${escH(email).replace(/'/g,"\\'")}')" title="Quitar usuario">✕</button>`}
    </div>
    <div class="up-perms" style="display:none">${_renderPermsBody(email)}</div>
  </div>`;
}

function _renderPermsBody(email) {
  const perms  = userPermsMap[email] || {};
  const role   = perms.role || 'operador';
  const defs   = UP_ROLE_DEFAULTS[role] || UP_ROLE_DEFAULTS.operador;
  const groups = [...new Set(UP_PERMS.map(p => p.group))];
  const overrideCount = _upOverrideCount(email);
  const intro = `<div class="up-perm-intro">Estos son los permisos de <strong>${escH(_UP_ROLE_LABELS[role]||role)}</strong>. Lo marcado en dorado ya no coincide con el rol.</div>`;
  const groupsHtml = groups.map(group => {
    const items = UP_PERMS.filter(p => p.group === group);
    const rows  = items.map(p => {
      const val = p.key in perms ? perms[p.key] : defs[p.key];
      const isOverride = val !== defs[p.key];
      return `<label class="up-perm-row${isOverride ? ' up-perm-overridden' : ''}" title="${escH(p.desc||'')}">
        <input type="checkbox" class="up-perm-cb"${val?' checked':''} onchange="_upPermChange(this,'${p.key}')">
        <span class="up-perm-label">${escH(p.label)}</span>
        ${isOverride ? '<span class="up-perm-diff-tag">≠ rol</span>' : ''}
      </label>`;
    }).join('');
    return `<div class="up-perm-group">
      <div class="up-perm-group-lbl">${escH(group)}</div>
      <div class="up-perm-grid">${rows}</div>
    </div>`;
  }).join('');
  return intro + groupsHtml + `<button class="up-reset-btn" onclick="_upResetPerms('${escH(email).replace(/'/g,"\\'")}')" ${!overrideCount ? 'disabled' : ''}><svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>Restablecer al rol</button>`;
}

function _upToggleCard(el) {
  const card    = el.closest('.up-card');
  const permsDiv= card.querySelector('.up-perms');
  const chevron = card.querySelector('.up-chevron');
  const open    = permsDiv.style.display !== 'none';
  permsDiv.style.display  = open ? 'none' : '';
  chevron.style.transform = open ? '' : 'rotate(-180deg)';
  card.classList.toggle('up-card-open', !open);
}

function _upRoleChange(sel) {
  const card    = sel.closest('.up-card');
  const email   = card.dataset.email;
  const prevRole= (userPermsMap[email]?.role) || 'operador';
  const newRole = sel.value;
  const name    = nameMap[email] || email.split('@')[0];
  if (prevRole === 'superadmin' && newRole !== 'superadmin') {
    if (!confirm(`¿Cambiar a ${name} de Superadmin a ${_UP_ROLE_LABELS[newRole]||newRole}?\nPerderá acceso a Configuración.`)) {
      sel.value = prevRole;
      return;
    }
  }
  // Cambiar de rol reemplaza todo el mapa de permisos por los defaults del
  // rol nuevo -- si ya tenia permisos personalizados, se pierden. Avisar
  // solo cuando de verdad hay algo que perder, para no interrumpir el caso
  // comun (cambiar el rol de alguien sin overrides).
  const overrideCount = _upOverrideCount(email);
  if (overrideCount > 0 && !confirm(`${name} tiene ${overrideCount} permiso${overrideCount>1?'s':''} personalizado${overrideCount>1?'s':''} distinto${overrideCount>1?'s':''} de su rol actual.\n\nCambiar de rol los reemplaza por los defaults de ${_UP_ROLE_LABELS[newRole]||newRole}. ¿Continuar?`)) {
    sel.value = prevRole;
    return;
  }
  const defs    = UP_ROLE_DEFAULTS[newRole] || UP_ROLE_DEFAULTS.operador;
  userPermsMap[email] = { ...defs, role: newRole };
  const permsDiv = card.querySelector('.up-perms');
  if (permsDiv) permsDiv.innerHTML = _renderPermsBody(email);
  _upRefreshBadge(email);
  _upSavePerms();
}

// Refresca solo el badge "N personalizados" de una tarjeta sin
// re-renderizar toda la lista (evita perder el scroll/estado abierto).
function _upRefreshBadge(email) {
  const card = document.querySelector(`.up-card[data-email="${CSS.escape(email)}"]`);
  if (!card) return;
  const nameDiv = card.querySelector('.up-name');
  if (!nameDiv) return;
  nameDiv.querySelector('.up-override-badge')?.remove();
  const n = _upOverrideCount(email);
  if (n > 0) {
    const role = userPermsMap[email]?.role || 'operador';
    const badge = document.createElement('span');
    badge.className = 'up-override-badge';
    badge.title = `${n} permiso${n>1?'s':''} distinto${n>1?'s':''} al default de ${_UP_ROLE_LABELS[role]||role}`;
    badge.textContent = `${n} personalizado${n>1?'s':''}`;
    nameDiv.appendChild(badge);
  }
}

function _upPermChange(cb, key) {
  const card  = cb.closest('.up-card');
  const email = card.dataset.email;
  if (!userPermsMap[email]) {
    const roleSel = card.querySelector('.up-role-sel');
    const role = roleSel?.value || 'operador';
    userPermsMap[email] = { ...UP_ROLE_DEFAULTS[role]||UP_ROLE_DEFAULTS.operador, role };
  }
  userPermsMap[email][key] = cb.checked;

  // Feedback visual inmediato del cambio -- sin esto, el "≠ rol" y el badge
  // solo se veian correctos al cerrar y volver a abrir la tarjeta.
  const role = userPermsMap[email].role || 'operador';
  const defs = UP_ROLE_DEFAULTS[role] || UP_ROLE_DEFAULTS.operador;
  const row  = cb.closest('.up-perm-row');
  const isOverride = cb.checked !== defs[key];
  row?.classList.toggle('up-perm-overridden', isOverride);
  row?.querySelector('.up-perm-diff-tag')?.remove();
  if (isOverride && row) row.insertAdjacentHTML('beforeend', '<span class="up-perm-diff-tag">≠ rol</span>');
  const resetBtn = card.querySelector('.up-reset-btn');
  if (resetBtn) resetBtn.disabled = _upOverrideCount(email) === 0;
  _upRefreshBadge(email);

  _upSavePerms();
}

function _upAddUser() {
  const input   = document.getElementById('up-new-email');
  const roleSel = document.getElementById('up-new-role');
  const email   = (input?.value||'').trim().toLowerCase();
  const role    = roleSel?.value || 'operador';
  if (!email || !email.includes('@')) { toast('Ingresa un correo válido', 'err'); return; }
  if (userPermsMap[email]) { toast('Este usuario ya está en la lista', ''); input.value=''; return; }
  userPermsMap[email] = { ...UP_ROLE_DEFAULTS[role]||UP_ROLE_DEFAULTS.operador, role };
  input.value = '';
  if (roleSel) roleSel.value = 'operador';
  renderUsersPerms();
  _upSavePerms();
}

async function _upSaveName(inp, email) {
  const newName = inp.value.trim();
  const oldName = nameMap[email] || email.split('@')[0];
  if (!newName) { inp.value = oldName; return; }
  if (newName === oldName) return;
  nameMap[email] = newName;
  inp.dataset.orig = newName;
  const r = await api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'user_names', value: JSON.stringify(nameMap) })
  });
  if (r.ok) toast('Nombre actualizado ✓', 'ok');
  else { toast('Error al guardar el nombre', 'err'); nameMap[email] = oldName; inp.value = oldName; inp.dataset.orig = oldName; }
}

function _upRemoveUser(email) {
  if (email === _myEmail) { toast('No puedes eliminarte a ti mismo', 'err'); return; }
  const name = nameMap[email] || email.split('@')[0];
  if (!confirm(`¿Quitar a ${name} de la lista de permisos?`)) return;
  delete userPermsMap[email];
  delete nameMap[email];
  renderUsersPerms();
  _upSavePerms();
  api('config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 'user_names', value: JSON.stringify(nameMap) })
  });
}

function _upResetPerms(email) {
  const role = userPermsMap[email]?.role || 'operador';
  userPermsMap[email] = { ...UP_ROLE_DEFAULTS[role], role };
  const card = document.querySelector(`.up-card[data-email="${CSS.escape(email)}"]`);
  if (card) {
    const permsDiv = card.querySelector('.up-perms');
    if (permsDiv) permsDiv.innerHTML = _renderPermsBody(email);
  }
  _upRefreshBadge(email);
  _upSavePerms();
  toast('Permisos restablecidos al rol ✓', 'ok');
}

let _upSaveTimer = null;
function _upSavePerms() {
  clearTimeout(_upSaveTimer);
  _upSaveTimer = setTimeout(async () => {
    // Via RPC (no POST directo a la tabla config): valida canManageSettings
    // en el servidor y registra en Actividad quien cambio que, antes de
    // escribir. Unico camino permitido para tocar user_permissions.
    const r = await api('rpc/te_save_user_permissions', {
      method: 'POST',
      body: JSON.stringify({ p_permissions: userPermsMap })
    });
    if (r.ok) {
      sessionStorage.removeItem('te_user_can');
      toast('Permisos guardados ✓', 'ok');
    } else { toast(r.data?.message || 'Error al guardar permisos', 'err'); }
  }, 600);
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

document.addEventListener('DOMContentLoaded', async () => {
  const permissionState = await _loadMyPerms({ requireFresh: true, withMeta: true });
  const permissions = permissionState?.permissions;
  const isFullSettings = permissions?.canManageSettings === true;
  const isCatalogOnly  = !isFullSettings && permissions?.canManageCatalogSettings === true;
  if (permissionState?.source !== 'server' || (!isFullSettings && !isCatalogOnly)) {
    window.location.replace('admin.html');
    return;
  }
  if (isCatalogOnly) {
    ['section-users', 'section-notifications', 'section-data', 'section-integrations'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }
  if (permissions.role) ROLE = permissions.role;
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
