/* ── FIADO, LIBERAR Y SALDO A FAVOR (2026-10-10) ─────────────────────────
   Dos tipos de apartado:
   - Apartado: el producto se queda en la tienda hasta que termine de pagar.
     Si lleva 30+ días vencido aparece "Liberar producto": el producto vuelve
     a la venta y lo que pagó queda A SU FAVOR (o se le devuelve si está).
   - Fiado ("se lo llevó"): persona de confianza que se lleva el producto y
     paga después. Nunca se ofrece liberar; solo se le sigue cobrando.
   Marcar fiado exige el permiso "Dar fiado" (canGiveCredit: superadmin por
   defecto; los demás con PIN o si se los activan en Configuración).
   Servidor: sales.se_lo_llevo / sales.saldo_favor, te_set_apartado_se_lo_llevo,
   cancel_sale_atomic(p_keep_credit), te_refund_credit.                     */

const _LIBERAR_DIAS = 30;
const _FIADO_ICO = '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';
const _fiadoIco = (px = 11) => `<svg aria-hidden="true" style="width:${px}px;height:${px}px;vertical-align:-1px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24">${_FIADO_ICO}</svg>`;

function _isFiado(s) { return !!s?.se_lo_llevo; }
function _fiadoChipHTML() { return `<span class="lib-chip">${_fiadoIco()} Se lo llevó</span>`; }
// En tarjetas se marca lo que hay que tener presente: el producto sigue
// guardado aquí ("En tienda"). Casi todos los apartados son fiado, y una
// etiqueta que sale en todas las tarjetas ya no distingue nada.
function _enTiendaChipHTML(s) {
  if (!s || _isFiado(s) || s.status !== 'activo' || (typeof _isLibretaSale === 'function' && _isLibretaSale(s))) return '';
  return `<span class="lib-chip">${_uiIcoBookmark(11)} En tienda</span>`;
}
// ¿El apartado que se está capturando en Caja es fiado?
function _formEsFiado() { return !!document.getElementById('apt-se-lo-lleva')?.classList.contains('active'); }
function _saldoFavor(s) { return Math.max(0, parseFloat(s?.saldo_favor) || 0); }
function _favorChipHTML(s) { return `<span class="lib-chip">A favor ${_fmtMx(_saldoFavor(s))}</span>`; }

// Días de vencido (positivo) o null si no ha vencido / no tiene fecha.
function _aptDiasVencido(s) {
  if (!s?.due_date) return null;
  const d = -_posDayKeyDiff(s.due_date);
  return d > 0 ? d : null;
}
function _aptPuedeLiberar(s) {
  if (!s || s.status !== 'activo' || s.cancelled_at) return false;
  if (_isFiado(s) || (typeof _isLibretaSale === 'function' && _isLibretaSale(s))) return false;
  const d = _aptDiasVencido(s);
  return d != null && d >= _LIBERAR_DIAS;
}
// Aviso dentro de la tarjeta/ficha de un apartado que ya se puede liberar.
function _liberarBannerHTML(s) {
  if (!_aptPuedeLiberar(s)) return '';
  return `<div class="apt-liberar">
    <span>Lleva <b>${_aptDiasVencido(s)} días</b> vencido.</span>
    <button type="button" onclick="event.stopPropagation();liberarApartado(${s.id})">Liberar producto</button>
  </div>`;
}

function liberarApartado(id) {
  return cancelApartado(id, { liberar: true });
}

/* "Se lo lleva hoy" al crear el apartado (botón en el sheet de Caja). Solo
   con permiso de editar apartados o el PIN de quien lo tenga: es prestar
   mercancía. */
async function toggleSeLoLleva(btn) {
  if (!btn.classList.contains('active') && !canGiveCredit()) {
    const granted = await requestOverride('canGiveCredit', 'Dar fiado: se lleva el producto');
    if (!granted) return;
  }
  btn.classList.toggle('active');
  btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
  if (typeof updateAnticipoInfo === 'function') updateAnticipoInfo();
  if (typeof _renderApartadoSummary === 'function') _renderApartadoSummary();
}

// Después de crear el apartado (pos-checkout.js), si se marcó "Se lo lleva".
async function _marcarSeLoLlevo(saleId, value = true) {
  const r = await api('rpc/te_set_apartado_se_lo_llevo', {
    method: 'POST',
    body: JSON.stringify({ p_sale_id: saleId, p_value: value, p_override_tickets: _collectOverrideTickets(['canGiveCredit']) })
  });
  _clearOverrideTicket('canGiveCredit');
  if (!r.ok) toast(r.data?.message || 'No se pudo marcar como fiado; márcalo en Editar apartado', 'error');
  return r.ok;
}

// Interruptor en "Editar apartado": se guarda al instante.
async function _editAptToggleFiado(btn) {
  if (!_editAptCtx) return;
  const next = !btn.classList.contains('active');
  if (!canGiveCredit()) {
    const granted = await requestOverride('canGiveCredit', next ? 'Dar fiado: se lo llevó' : 'Quitar fiado');
    if (!granted) return;
  }
  btn.disabled = true;
  const ok = await _marcarSeLoLlevo(_editAptCtx.id, next);
  btn.disabled = false;
  if (!ok) return;
  btn.classList.toggle('active', next);
  btn.setAttribute('aria-pressed', String(next));
  if (_editAptCtx.sale) { _editAptCtx.sale.se_lo_llevo = next; _editAptCtx.sale.version = (_editAptCtx.sale.version ?? 0) + 1; }
  toast(next ? 'Marcado: se lo llevó (fiado)' : 'Ya no está marcado como fiado', 'ok');
  loadApartados();
}

/* Devolver un saldo a favor (Cancelados). Sale dinero del cajón: pide caja. */
async function devolverSaldoFavor(id) {
  const s = (_apartadosData || {})[id];
  const monto = _saldoFavor(s);
  if (!s || monto <= 0) return;
  if (!_posNeedShift('Para devolver un saldo a favor abre la caja.')) return;
  const nombre = _displayName((s.customer || '').split(' · 📱 ')[0] || 'la clienta');
  if (!(await teConfirm({
    title: `¿Devolverle ${_fmtMx(monto)} a ${nombre}?`,
    message: 'Sale del cajón de tu turno.\n\nSi lo quiere usar para comprar algo, devuélveselo aquí y cobra la compra normal con ese dinero.',
    confirmText: `Devolver ${_fmtMx(monto)}`
  }))) return;
  const r = await posRpc('te_refund_credit', {
    operation: 'refund_credit', context: id, fingerprint: `${id}:${monto}`,
    body: { p_sale_id: id, p_override_tickets: _collectOverrideTickets(['canEditApartado', 'canCancelSale']) }
  });
  if (!r.ok) { toast(_posRpcError(r, 'No se pudo registrar la devolución'), 'error'); return; }
  if (document.getElementById('apt-detail-modal')?.style.display === 'flex') closeAptDetail();
  toast(`Devolución de ${_fmtMx(r.data?.refund_amount ?? monto)} a ${nombre} registrada`, 'ok');
  await _refreshPosFinancialState();
}
