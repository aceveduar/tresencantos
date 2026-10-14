/* ── AVISOS AL EQUIPO (Configuración → Avisos al equipo) ──────────────────
   Publicar, editar y quitar los avisos de la campana sin tocar código
   (tabla team_notices, RPC te_save_notice / te_remove_notice). Cada aviso
   muestra quién lo leyó (te_notice_readers): "leído" = la persona lo
   desplegó en la campana, no solo la abrió. Avisos cortos a propósito
   (título 60, texto 280): los pasos largos van en Ayuda y se enlazan. */

let _ntEditingId = null;
let _ntNotices = [];

const _ntAudienceLabel = { todos: 'Todos los módulos', caja: 'Solo Caja', inventario: 'Solo Inventario' };
const _ntToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
const _ntPlusDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d); };
const _ntFmtDate = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const _ntName = email => (nameMap && nameMap[email]) || String(email || '').split('@')[0];

function _ntPreview() {
  const title = document.getElementById('nt-title').value;
  const body = document.getElementById('nt-body').value;
  const help = document.getElementById('nt-help').value.trim();
  document.getElementById('nt-title-count').textContent = `${title.length}/60`;
  document.getElementById('nt-body-count').textContent = `${body.length}/280`;
  const fmt = window._noticeBodyHtml || (t => escH(t));
  document.getElementById('nt-preview').innerHTML = title.trim()
    ? `<div class="nt-prev-title">${escH(title)}</div>
       ${body.trim() ? `<div class="nt-prev-body">${fmt(body)}</div>` : ''}
       ${help ? `<div class="nt-prev-help">Ver cómo en Ayuda →</div>` : ''}`
    : '<div class="nt-prev-empty">Escribe un título para ver la vista previa.</div>';
}

function _ntResetForm() {
  _ntEditingId = null;
  ['nt-title', 'nt-body', 'nt-help'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('nt-audience').value = 'todos';
  document.getElementById('nt-until').value = _ntPlusDays(21);
  document.getElementById('nt-until').min = _ntToday();
  document.getElementById('nt-save-btn').textContent = 'Publicar aviso';
  document.getElementById('nt-form-title').textContent = 'Nuevo aviso';
  _ntPreview();
}

// Lo primero que se ve es la lista (qué hay activo y quién lo leyó); el
// formulario se abre con "+ Nuevo aviso" o "Editar".
function _ntShowForm(show) {
  document.getElementById('nt-form-card').hidden = !show;
  document.getElementById('nt-new-btn').hidden = show;
}
function _ntOpenForm() {
  _ntResetForm();
  _ntShowForm(true);
  document.getElementById('nt-title').focus();
}
function _ntCloseForm() {
  _ntResetForm();
  _ntShowForm(false);
}

async function _ntSave() {
  const title = document.getElementById('nt-title').value.trim();
  const body = document.getElementById('nt-body').value.trim();
  const until = document.getElementById('nt-until').value;
  if (!title) { toast('Escribe un título', 'err'); document.getElementById('nt-title').focus(); return; }
  if (!until || until < _ntToday()) { toast('La fecha "mostrar hasta" ya pasó', 'err'); return; }
  const btn = document.getElementById('nt-save-btn');
  btn.disabled = true;
  const r = await api('rpc/te_save_notice', { method: 'POST', body: JSON.stringify({
    p_id: _ntEditingId, p_title: title, p_body: body,
    p_help_query: document.getElementById('nt-help').value.trim() || null,
    p_audience: document.getElementById('nt-audience').value, p_until: until
  }) });
  btn.disabled = false;
  if (!r.ok) { toast(r.data?.message || 'No se pudo guardar el aviso', 'err'); return; }
  toast(_ntEditingId ? 'Aviso actualizado' : 'Aviso publicado: ya aparece en la campana', 'ok');
  _ntCloseForm();
  _ntLoad();
  window._reloadTeamNotices?.();
}

function _ntEdit(id) {
  const n = _ntNotices.find(x => x.id === id);
  if (!n) return;
  _ntEditingId = id;
  document.getElementById('nt-title').value = n.title;
  document.getElementById('nt-body').value = n.body || '';
  document.getElementById('nt-help').value = n.help_query || '';
  document.getElementById('nt-audience').value = n.audience;
  document.getElementById('nt-until').value = n.until;
  document.getElementById('nt-save-btn').textContent = 'Guardar cambios';
  document.getElementById('nt-form-title').textContent = 'Editar aviso';
  _ntPreview();
  _ntShowForm(true);
  document.getElementById('nt-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function _ntRemove(id) {
  const n = _ntNotices.find(x => x.id === id);
  if (!n) return;
  const ok = await teConfirm({ title: 'Quitar aviso', message: `"${n.title}" dejará de aparecer en la campana de todos.`, confirmText: 'Quitar', danger: true });
  if (!ok) return;
  const r = await api('rpc/te_remove_notice', { method: 'POST', body: JSON.stringify({ p_id: id }) });
  if (!r.ok) { toast(r.data?.message || 'No se pudo quitar', 'err'); return; }
  if (_ntEditingId === id) _ntCloseForm();
  toast('Aviso quitado', 'ok');
  _ntLoad();
  window._reloadTeamNotices?.();
}

async function _ntLoad() {
  const list = document.getElementById('nt-list');
  if (!list) return;
  const [nR, rR] = await Promise.all([
    api(`team_notices?active=eq.true&until=gte.${_ntToday()}&select=id,title,body,help_query,audience,until,created_by,created_at&order=created_at.desc`),
    api('rpc/te_notice_readers', { method: 'POST', body: '{}' })
  ]);
  if (!nR.ok) { list.innerHTML = '<div class="nt-empty">No se pudieron cargar los avisos.</div>'; return; }
  _ntNotices = nR.data || [];
  const readers = {};
  (rR.ok && Array.isArray(rR.data) ? rR.data : []).forEach(x => { (readers[x.notice_id] ||= []).push(x.user_email); });
  // El equipo = las cuentas de Usuarios y permisos; a quien publicó no se le cuenta como pendiente.
  const team = Object.keys(userPermsMap || {}).map(e => e.toLowerCase());
  if (!_ntNotices.length) { list.innerHTML = '<div class="nt-empty">No hay avisos activos. Toca <b>+ Nuevo aviso</b> para escribir uno.</div>'; return; }
  list.innerHTML = _ntNotices.map(n => {
    const read = (readers[n.id] || []);
    const pending = team.filter(e => e !== String(n.created_by).toLowerCase() && !read.includes(e));
    const readTxt = read.length ? `Leído por ${read.map(_ntName).map(escH).join(', ')}` : 'Nadie lo ha leído todavía';
    const pendTxt = pending.length ? ` · Falta: ${pending.map(_ntName).map(escH).join(', ')}` : (read.length ? ' · Todo el equipo' : '');
    return `<div class="nt-item">
      <div class="nt-item-main">
        <div class="nt-item-title">${escH(n.title)}</div>
        <div class="nt-item-meta">${_ntAudienceLabel[n.audience] || ''} · hasta el ${_ntFmtDate(n.until)}</div>
        <div class="nt-item-reads">${readTxt}${pendTxt}</div>
      </div>
      <div class="nt-item-actions">
        <button type="button" class="btn btn-outline btn-sm" onclick="_ntEdit(${n.id})">Editar</button>
        <button type="button" class="btn btn-red-outline btn-sm" onclick="_ntRemove(${n.id})">Quitar</button>
      </div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('section-notices')) return;
  _ntResetForm(); // la lista la carga settings.js al terminar init() (necesita nombres y equipo)
});
