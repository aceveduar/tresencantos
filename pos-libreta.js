/* ── APARTADOS DE LIBRETA (2026-10-10) ───────────────────────────────────
   Pasa al sistema los apartados que se llevaban en papel. La libreta trae
   lo que trae: nombre, a veces el total, abonos restados a lápiz, a veces
   fechas. Se captura tal cual -- lo que no viene se deja vacío, nada se
   inventa.

   - El apartado queda activo como cualquier otro (abonar, liquidar,
     recordatorios, cancelar) pero sin productos: un renglón {libreta:true}.
   - Los abonos de papel suman al saldo pero no cuentan en Reportes ni en el
     corte (el servidor los guarda sin fecha de cobro, source 'libreta').
   - El formulario se queda abierto después de guardar para pasar la
     siguiente clienta sin volver a abrirlo.
   - Se enciende/apaga en Configuración (config.show_libreta). Todo vive en
     este archivo + te_libreta_apartado_create/_edit en Supabase.         */

let _showLibreta = false;
let _libCtx = null;
let _libSavedThisSession = 0;

const _LIB_ICO_BOOK = '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 7h6"/><path d="M9 11h4"/>';
const _libIco = (px = 14) => `<svg aria-hidden="true" style="width:${px}px;height:${px}px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">${_LIB_ICO_BOOK}</svg>`;

async function loadLibretaConfig() {
  try {
    const r = await api('config?id=eq.show_libreta&select=value');
    _showLibreta = !!(r.ok && r.data?.[0]?.value === 'true');
  } catch { _showLibreta = false; }
  document.querySelectorAll('.libreta-entry').forEach(b => { b.hidden = !_showLibreta; });
}

/* ── Helpers que usan los renders de apartados (pos-apartados / pos-ui) ── */
function _libretaItem(sale) {
  return (Array.isArray(sale?.items) ? sale.items : []).find(i => i && i.libreta) || null;
}
function _isLibretaSale(sale) { return !!_libretaItem(sale); }

// "12 dic" si la libreta trae la fecha; "Sin fecha" si no.
function _libretaDateLabel(sale, opts = { day: 'numeric', month: 'short' }) {
  const it = _libretaItem(sale);
  return it?.fecha_apartado ? _posFormatDayKey(it.fecha_apartado, opts) : 'Sin fecha';
}

// Renglón que sustituye a la lista de productos en tarjetas y fichas.
function _libretaItemRowHTML(item) {
  const total = parseFloat(item.subtotal ?? item.price) || 0;
  const foto = /^https:\/\/[^\s"'<>]+$/.test(item.foto || '') ? item.foto : '';
  return `<div class="apt-item-row lib-item-row">
    <span class="lib-item-ico">${_libIco(18)}</span>
    <div class="apt-item-info">
      <div class="apt-item-name">Anotado en la libreta</div>
      ${item.nota ? `<div class="lib-item-note">${_esc(item.nota)}</div>` : ''}
      ${foto ? `<button type="button" class="lib-photo-link" onclick="event.stopPropagation();_libOpenPhoto('${_esc(foto)}')">Ver foto de la página</button>` : ''}
    </div>
    <div class="apt-item-right"><span class="apt-item-price">${_fmtMx(total)}</span></div>
  </div>`;
}

function _libOpenPhoto(url) {
  const img = document.createElement('img');
  img.src = url;
  img.dataset.name = 'Página de la libreta';
  openLightbox(img);
  const price = document.getElementById('img-lb-price');
  if (price) price.textContent = '';
}

// Etiqueta corta para tarjetas: chip "Libreta".
function _libretaChipHTML() {
  return `<span class="lib-chip">${_libIco(11)} Libreta</span>`;
}

/* ── Formulario ──────────────────────────────────────────────────────── */
function _libTodayKey() { return _posMexicoDayKey(); }
function _libPlusDays(n) {
  const d = new Date(`${_libTodayKey()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function _libMoney(v) {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function _libEl(id) { return document.getElementById(id); }

async function openLibreta() {
  if (!canEditApartado() && !_hasValidOverrideTicket('canEditApartado')) {
    const granted = await requestOverride('canEditApartado', 'Pasar apartados de la libreta');
    if (!granted) return;
  }
  _libCtx = { mode: 'new', abonos: [], knowsTotal: true, photo: null, photoBusy: false };
  _libResetFields();
  _libEl('lib-title').textContent = 'Pasar de la libreta';
  _libEl('lib-sub').textContent = 'Copia lo que está anotado. Lo que no venga, déjalo vacío.';
  _libEl('lib-saved').hidden = true;
  _libShowMode();
  _libEl('libreta-overlay').style.display = 'flex';
  requestAnimationFrame(() => _libEl('lib-name')?.focus());
}

// Corregir uno ya pasado: nombre, teléfono, nota, fecha límite y lo que debe.
async function openLibretaEdit(id) {
  if (!canEditApartado()) {
    const granted = await requestOverride('canEditApartado', 'Corregir apartado de libreta');
    if (!granted) return;
  }
  const sale = (_apartadosData || {})[id];
  if (!sale || sale.status !== 'activo') { toast('Este apartado ya no está activo. Actualiza la lista.', 'error'); return; }
  const parts = (sale.customer || '').split(' · 📱 ');
  const total = parseFloat(sale.total) || 0;
  const paid = parseFloat(sale.paid_amount) || 0;
  const history = Array.isArray(sale.payment_history) ? sale.payment_history : [];
  const paperPaid = history.filter(p => p.source === 'libreta').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  _libCtx = { mode: 'edit', id, version: sale.version ?? 0, paid, paperPaid, knowsTotal: false, abonos: [] };
  _libResetFields();
  _libEl('lib-title').textContent = 'Corregir apartado de libreta';
  const openedOn = _libretaItem(sale)?.fecha_apartado;
  _libEl('lib-sub').textContent = openedOn
    ? `Anotado en la libreta el ${_posFormatDayKey(openedOn, { day: 'numeric', month: 'long', year: 'numeric' })}.`
    : 'Anotado en la libreta, sin fecha.';
  _libEl('lib-saved').hidden = true;
  _libEl('lib-name').value = parts[0] || '';
  _libEl('lib-phone').value = parts[1] || '';
  _libEl('lib-note').value = _libretaItem(sale)?.nota || sale.note || '';
  _libEl('lib-due').value = sale.due_date || '';
  _libEl('lib-debe').value = Math.max(0, Math.round((total - paid) * 100) / 100) || '';
  const paidLine = paid > 0
    ? `Ya pagó ${_fmtMx(paid)}${paperPaid > 0 && paperPaid < paid ? ` (${_fmtMx(paperPaid)} en la libreta y ${_fmtMx(paid - paperPaid)} aquí)` : paperPaid > 0 ? ' según la libreta' : ''}. Esos pagos no se cambian.`
    : 'No tiene pagos registrados.';
  _libEl('lib-edit-paid').textContent = paidLine;
  _libShowMode();
  _libEl('libreta-overlay').style.display = 'flex';
  requestAnimationFrame(() => _libEl('lib-debe')?.focus());
}

function _libResetFields() {
  ['lib-name', 'lib-phone', 'lib-total', 'lib-debe', 'lib-note', 'lib-opened'].forEach(id => { const el = _libEl(id); if (el) el.value = ''; });
  _libEl('lib-due').value = _libPlusDays(30);
  _libEl('lib-opened').max = _libTodayKey();
  _libEl('lib-dup').hidden = true;
  _libEl('lib-error').textContent = '';
  _libSetPhoto(null);
  _libRenderAbonos();
  _libRecalc();
}

function _libShowMode() {
  const isEdit = _libCtx?.mode === 'edit';
  _libEl('lib-mode-toggle').hidden = isEdit;
  _libEl('lib-total-block').hidden = isEdit || !_libCtx.knowsTotal;
  _libEl('lib-debe-block').hidden = !isEdit && _libCtx.knowsTotal;
  _libEl('lib-edit-paid').hidden = !isEdit;
  _libEl('lib-opened-wrap').hidden = isEdit;
  _libEl('lib-photo-wrap').hidden = isEdit;
  _libEl('lib-debe-label').textContent = isEdit ? 'Lo que debe hoy' : '¿Cuánto debe?';
  document.querySelectorAll('#lib-mode-toggle button').forEach(b => {
    const on = (b.dataset.mode === 'total') === !!_libCtx.knowsTotal;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  _libRecalc();
}

function setLibretaMode(mode) {
  if (!_libCtx || _libCtx.mode === 'edit') return;
  _libCtx.knowsTotal = mode === 'total';
  _libShowMode();
  requestAnimationFrame(() => _libEl(_libCtx.knowsTotal ? 'lib-total' : 'lib-debe')?.focus());
}

/* Abonos: cada renglón muestra cuánto quedaba después, como la resta a
   lápiz en la libreta -- así es fácil comparar con lo anotado. */
function addLibretaAbono() {
  if (!_libCtx) return;
  _libCtx.abonos.push({ amount: '', date: '' });
  _libRenderAbonos();
  const inputs = document.querySelectorAll('#lib-abonos .lib-abono-amount');
  inputs[inputs.length - 1]?.focus();
}

function _libRemoveAbono(idx) {
  _libCtx.abonos.splice(idx, 1);
  _libRenderAbonos();
  _libRecalc();
}

function _libAbonoInput(idx, field, value) {
  if (!_libCtx?.abonos[idx]) return;
  _libCtx.abonos[idx][field] = value;
  _libRecalc();
}

function _libAbonoKey(e, idx) {
  // Enter en el último abono abre el siguiente: se capturan de corrido.
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (idx === _libCtx.abonos.length - 1 && _libMoney(_libCtx.abonos[idx].amount) > 0) addLibretaAbono();
}

function _libToggleAbonoDate(idx) {
  const el = _libEl(`lib-abono-date-${idx}`);
  if (!el) return;
  el.hidden = false;
  el.max = _libTodayKey();
  el.focus();
  try { el.showPicker?.(); } catch {}
}

function _libRenderAbonos() {
  const list = _libEl('lib-abonos');
  if (!list || !_libCtx) return;
  list.innerHTML = _libCtx.abonos.map((a, i) => `
    <div class="lib-abono">
      <span class="lib-abono-n">Abono ${i + 1}</span>
      <div class="lib-abono-field">
        <span class="lib-abono-sign">−$</span>
        <input type="number" class="lib-abono-amount" inputmode="decimal" min="0" step="any" placeholder="0" value="${_esc(String(a.amount))}"
          aria-label="Monto del abono ${i + 1}" oninput="_libAbonoInput(${i},'amount',this.value)" onkeydown="_libAbonoKey(event,${i})">
      </div>
      <button type="button" class="lib-abono-datebtn${a.date ? ' has-date' : ''}" onclick="_libToggleAbonoDate(${i})" aria-label="Fecha del abono ${i + 1}" ${a.date ? 'hidden' : ''}>${_uiIcoCalendar()} Fecha</button>
      <input type="date" class="lib-abono-date" id="lib-abono-date-${i}" value="${_esc(a.date)}" ${a.date ? '' : 'hidden'}
        aria-label="Fecha del abono ${i + 1}" onchange="_libAbonoInput(${i},'date',this.value)">
      <button type="button" class="lib-abono-x" onclick="_libRemoveAbono(${i})" aria-label="Quitar abono ${i + 1}">${_uiIcoX(null, 16)}</button>
      <span class="lib-abono-left" id="lib-abono-left-${i}"></span>
    </div>`).join('');
}

function _libRecalc() {
  if (!_libCtx) return;
  const err = _libEl('lib-error');
  const btn = _libEl('lib-save-btn');
  const footTotal = _libEl('lib-foot-total');
  const footDetail = _libEl('lib-foot-detail');
  let debe = 0, problem = '', detail = '';

  if (_libCtx.mode === 'edit') {
    debe = _libMoney(_libEl('lib-debe').value);
    const before = Math.max(0, Math.round(((parseFloat(_apartadosData?.[_libCtx.id]?.total) || 0) - _libCtx.paid) * 100) / 100);
    if (debe <= 0) problem = 'Escribe cuánto debe. Si ya pagó todo, cierra esto y usa “Cobrar saldo”.';
    else if (Math.abs(debe - before) > 0.004) detail = `Antes: ${_fmtMx(before)}`;
  } else if (_libCtx.knowsTotal) {
    const total = _libMoney(_libEl('lib-total').value);
    let left = total;
    let sum = 0;
    _libCtx.abonos.forEach((a, i) => {
      const amt = _libMoney(a.amount);
      sum += amt;
      left = Math.round((left - amt) * 100) / 100;
      const cell = _libEl(`lib-abono-left-${i}`);
      if (cell) cell.textContent = total > 0 && amt > 0 ? `queda ${_fmtMx(left)}` : '';
      if (cell) cell.classList.toggle('neg', total > 0 && left < 0);
    });
    debe = Math.round((total - sum) * 100) / 100;
    if (total > 0 && sum > 0) detail = `${_fmtMx(total)} − ${_fmtMx(sum)} de abonos`;
    if (total > 0 && sum > 0 && debe <= 0) {
      problem = `Los abonos suman ${_fmtMx(sum)}, lo mismo o más que el total. Si ya terminó de pagar, no hace falta pasarla.`;
    }
  } else {
    debe = _libMoney(_libEl('lib-debe').value);
  }

  const name = (_libEl('lib-name').value || '').trim();
  const phone = (_libEl('lib-phone').value || '').replace(/\D/g, '');
  if (!problem && phone && phone.length !== 10) problem = 'El teléfono debe tener 10 dígitos (o déjalo vacío).';

  err.textContent = problem;
  footTotal.textContent = _fmtMx(Math.max(0, debe));
  footDetail.textContent = detail;
  const ready = !problem && debe > 0 && name && !_libCtx.photoBusy;
  btn.disabled = !ready;
  btn.textContent = _libCtx.photoBusy ? 'Subiendo foto…'
    : _libCtx.mode === 'edit' ? 'Guardar corrección'
    : 'Guardar';
}

// Aviso (no bloquea) si ya hay un apartado activo con ese nombre: la libreta
// puede repetir clientas y es fácil pasar la misma dos veces.
function _libCheckDuplicate() {
  const box = _libEl('lib-dup');
  if (!box || !_libCtx) return;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(_libEl('lib-name').value);
  if (q.length < 3) { box.hidden = true; return; }
  const match = (_apartadosAll || []).find(s => {
    if (_libCtx.mode === 'edit' && s.id === _libCtx.id) return false;
    const n = norm((s.customer || '').split(' · 📱 ')[0]);
    return n === q || (q.length >= 5 && (n.startsWith(q) || q.startsWith(n)));
  });
  if (!match) { box.hidden = true; return; }
  const falta = Math.max(0, (parseFloat(match.total) || 0) - (parseFloat(match.paid_amount) || 0));
  box.innerHTML = `${_uiIcoWarn()} Ya hay un apartado de <b>${_esc(_displayName((match.customer || '').split(' · 📱 ')[0]))}</b>${_isLibretaSale(match) ? ' de la libreta' : ''} (falta ${_fmtMx(falta)}). Si es otra persona, sigue.`;
  box.hidden = false;
}

function _libOnName() { _libCheckDuplicate(); _libRecalc(); }

/* ── Foto de la página: se sube a Drive al elegirla ── */
function _libSetPhoto(url) {
  if (_libCtx) _libCtx.photo = url;
  const prev = _libEl('lib-photo-prev');
  const btn = _libEl('lib-photo-btn');
  if (!prev || !btn) return;
  if (url) {
    prev.innerHTML = `<img src="${_esc(_driveSz(url, 160))}" alt="Foto de la página" onclick="_libOpenPhoto('${_esc(url)}')">
      <button type="button" class="lib-photo-x" onclick="_libSetPhoto(null)" aria-label="Quitar foto">${_uiIcoX(null, 14)}</button>`;
    prev.hidden = false;
    btn.hidden = true;
  } else {
    prev.innerHTML = '';
    prev.hidden = true;
    btn.hidden = false;
    btn.innerHTML = `${_uiIco('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', 16)} Agregar foto de la página`;
  }
}

function _libCompress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        // 1600px: la letra a lápiz se sigue leyendo al ampliar.
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function _libPickPhoto(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !_libCtx) return;
  _libCtx.photoBusy = true;
  _libRecalc();
  const btn = _libEl('lib-photo-btn');
  if (btn) btn.textContent = 'Subiendo foto…';
  try {
    const image = await _libCompress(file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const call = tk => fetch(`${SUPABASE_URL}/functions/v1/drive-proxy`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${tk}` },
      body: JSON.stringify({ action: 'upload', image, name: `libreta_${Date.now()}.jpg` })
    });
    let res = await call(_getPosToken());
    if (res.status === 401 && await _refreshPosToken()) res = await call(_getPosToken());
    clearTimeout(timer);
    const data = await res.json().catch(() => null);
    if (!data?.ok || !/^https:\/\//.test(data.url || '')) {
      toast(res.status === 403 ? 'Tu cuenta no puede subir fotos; guarda sin foto' : 'No se pudo subir la foto; puedes guardar sin ella', 'error');
      _libSetPhoto(null);
    } else {
      _libSetPhoto(data.url);
    }
  } catch {
    toast('No se pudo subir la foto; puedes guardar sin ella', 'error');
    _libSetPhoto(null);
  } finally {
    if (_libCtx) _libCtx.photoBusy = false;
    _libRecalc();
  }
}

/* ── Guardar ── */
async function saveLibreta() {
  if (!_libCtx) return;
  _libRecalc();
  const btn = _libEl('lib-save-btn');
  if (btn.disabled) return;
  if (!canEditApartado() && !_hasValidOverrideTicket('canEditApartado')) {
    const granted = await requestOverride('canEditApartado', 'Pasar apartados de la libreta');
    if (!granted) return;
  }
  const name = _titleCaseName(_libEl('lib-name').value);
  const phone = (_libEl('lib-phone').value || '').replace(/\D/g, '');
  const note = (_libEl('lib-note').value || '').trim();
  const due = _libEl('lib-due').value || null;
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  let r;
  if (_libCtx.mode === 'edit') {
    const balance = _libMoney(_libEl('lib-debe').value);
    const body = {
      p_sale_id: _libCtx.id, p_expected_version: _libCtx.version,
      p_name: name, p_phone: phone, p_due_date: due, p_note: note, p_balance: balance,
      p_override_tickets: _collectOverrideTickets(['canEditApartado'])
    };
    r = await posRpc('te_libreta_apartado_edit', {
      operation: 'libreta_edit', context: _libCtx.id,
      fingerprint: JSON.stringify({ ...body, p_override_tickets: null }), body
    });
  } else {
    const knowsTotal = _libCtx.knowsTotal;
    const payments = knowsTotal
      ? _libCtx.abonos.filter(a => _libMoney(a.amount) > 0).map(a => ({ amount: _libMoney(a.amount), date: a.date || null }))
      : [];
    const body = {
      p_name: name, p_phone: phone || null,
      p_total: knowsTotal ? _libMoney(_libEl('lib-total').value) : null,
      p_balance: knowsTotal ? null : _libMoney(_libEl('lib-debe').value),
      p_payments: payments,
      p_opened_on: _libEl('lib-opened').value || null,
      p_due_date: due, p_note: note || null, p_photo: _libCtx.photo || null,
      p_override_tickets: _collectOverrideTickets(['canEditApartado'])
    };
    r = await posRpc('te_libreta_apartado_create', {
      operation: 'libreta_create', context: 'new',
      fingerprint: JSON.stringify({ ...body, p_override_tickets: null }), body
    });
  }
  _clearOverrideTicket('canEditApartado');

  if (!r.ok) {
    _libEl('lib-error').textContent = _posRpcError(r, 'No se pudo guardar');
    _libRecalc();
    if (r.resolvedPrior || r.staleConflict) loadApartados();
    return;
  }

  const debe = _aptMoney(r.data?.sale?.remaining);
  if (_libCtx.mode === 'edit') {
    closeLibreta(true);
    toast(`✓ Apartado de ${name} corregido · debe ${_fmtMx(debe)}`, 'ok');
  } else {
    // Se queda abierto y limpio para la siguiente clienta de la libreta.
    _libSavedThisSession += 1;
    const keepDue = _libEl('lib-due').value;
    const knowsTotal = _libCtx.knowsTotal;
    _libCtx = { mode: 'new', abonos: [], knowsTotal, photo: null, photoBusy: false };
    _libResetFields();
    _libEl('lib-due').value = keepDue;
    _libShowMode();
    const saved = _libEl('lib-saved');
    saved.innerHTML = `${_uiIcoCheck(null, 15)} <span><b>${_esc(name)}</b> quedó guardada · debe ${_fmtMx(debe)}</span><span class="lib-saved-count">${_libSavedThisSession} ${_libSavedThisSession === 1 ? 'pasada' : 'pasadas'}</span>`;
    saved.hidden = false;
    _libEl('lib-sub').textContent = 'Sigue con la siguiente, o cierra cuando termines.';
    _libEl('libreta-overlay').querySelector('.eam-body').scrollTop = 0;
    requestAnimationFrame(() => _libEl('lib-name')?.focus());
  }
  loadApartados();
}

// Con datos a medio capturar, cerrar (o tocar fuera) pregunta primero.
async function closeLibreta(force = false) {
  if (!force && _libCtx?.mode === 'new') {
    const typed = ['lib-name', 'lib-phone', 'lib-total', 'lib-debe', 'lib-note'].some(id => (_libEl(id)?.value || '').trim())
      || _libCtx.abonos.some(a => _libMoney(a.amount) > 0) || _libCtx.photo;
    if (typed && !(await teConfirm({ title: '¿Cerrar sin guardar?', message: 'Lo que escribiste de esta clienta se pierde.', confirmText: 'Cerrar sin guardar', danger: true }))) return;
  }
  _libEl('libreta-overlay').style.display = 'none';
  _libCtx = null;
}
