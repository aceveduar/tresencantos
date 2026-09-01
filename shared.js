/* shared.js — Dropdown de usuario para todos los módulos admin
   Requiere: shared.css, elemento #user-avatar, función doLogout() en el módulo */

(function () {
  function _initUserDropdown() {
    const avatar = document.getElementById('user-avatar');
    if (!avatar) return;
    avatar.style.cursor = 'pointer';
    avatar.title = 'Mi cuenta';
    avatar.addEventListener('click', function (e) {
      e.stopPropagation();
      _toggleUserDropdown();
    });
  }

  function _toggleUserDropdown() {
    const existing = document.getElementById('ud-pop');
    if (existing) { existing.remove(); return; }

    const avatar = document.getElementById('user-avatar');
    if (!avatar) return;

    // Leer sesión
    let name = '', email = '', role = '';
    try {
      const s = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
      const meta = s?.user?.user_metadata || {};
      name  = meta.full_name || meta.name || s?.user?.email?.split('@')[0] || '?';
      email = s?.user?.email || '';
      role  = meta.role || 'operador';
    } catch {}

    const roleLabel = { superadmin:'Super Admin', duena:'Dueña', operador:'Operador' }[role] || role;

    const _up = (() => {
      try {
        const cached = JSON.parse(sessionStorage.getItem('te_user_can') || '{}');
        return cached?.email?.toLowerCase() === email.toLowerCase() && cached?.permissions
          ? cached.permissions : {};
      } catch { return {}; }
    })();
    const canConfig   = ('canManageSettings' in _up ? _up.canManageSettings : role === 'superadmin')
                         || _up.canManageCatalogSettings === true;
    const canActivity = 'canViewActivity'   in _up ? _up.canViewActivity   : (role === 'superadmin' || role === 'duena');
    const configLink = (canConfig
      ? `<a class="ud-link" href="settings.html">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configuración
        </a>` : '') +
      (canActivity
      ? `<a class="ud-link" href="activity.html">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Actividad
        </a>` : '') +
      `<button class="ud-link" style="width:100%;text-align:left;background:none;border:none;font-family:inherit;cursor:pointer" onclick="document.getElementById('ud-pop')?.remove();openMyPinModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
        Mi PIN de autorización
      </button>`;

    const pop = document.createElement('div');
    pop.id = 'ud-pop';
    pop.innerHTML = `
      <div class="ud-info">
        <div class="ud-name"></div>
        <div class="ud-email"></div>
        <span class="ud-role">${roleLabel}</span>
      </div>
      <div class="ud-divider"></div>
      ${configLink}
      <button class="ud-logout" onclick="document.getElementById('ud-pop')?.remove();doLogout()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Cerrar sesión
      </button>`;
    pop.querySelector('.ud-name').textContent = name;
    pop.querySelector('.ud-email').textContent = email;
    document.body.appendChild(pop);

    // Posicionar bajo el avatar
    const r = avatar.getBoundingClientRect();
    const pw = 210;
    let left = r.right - pw;
    if (left < 8) left = 8;
    pop.style.cssText += `top:${r.bottom + 6}px;left:${left}px`;

    setTimeout(() => {
      document.addEventListener('click', function close(e) {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); }
      });
    }, 10);
  }

  document.addEventListener('DOMContentLoaded', _initUserDropdown);
})();

/* ── OFFLINE BANNER ── */
(function () {
  function _initOfflineBanner() {
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    // Posicionar sobre la tab bar en Caja, al fondo en el resto
    const hasPosTabBar = !!document.getElementById('pos-tab-bar');
    banner.style.bottom = hasPosTabBar ? '56px' : '0';
    document.body.appendChild(banner);

    let hideTimer = null;

    const goOffline = () => {
      clearTimeout(hideTimer);
      banner.textContent = '⚡ Sin conexión a internet — los cambios no se guardarán';
      banner.className = 'ob-offline';
    };

    const goOnline = () => {
      clearTimeout(hideTimer);
      banner.textContent = '✓ Conexión restaurada';
      banner.className = 'ob-online';
      hideTimer = setTimeout(() => { banner.className = ''; }, 3000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (!navigator.onLine) goOffline();
  }

  document.addEventListener('DOMContentLoaded', _initOfflineBanner);
})();

/* ── AVISOS DE SISTEMA — descartables, para cualquier usuario con sesión
   activa (Ofelia, Areli, Eduardo, sin distinción de rol). Lista de anuncios
   breves sobre cambios del sistema; se muestra uno a la vez (nunca varios
   encimados) y cada uno se descarta por separado en localStorage, así que
   un aviso nuevo agregado a SYS_NOTICES siempre aparece -- incluso si uno
   viejo ya se cerró -- y el que se está viendo no desaparece solo, solo con
   la ✕. Para agregar un aviso futuro: nuevo objeto {id, text} al arreglo. ── */
(function () {
  const SYS_NOTICES = [
    { id: 'staff-access-2026-08', text: '🔒 El acceso a Caja e Inventario cambió de lugar — ahora está arriba, junto al carrito, en la Tienda.' },
    { id: 'por-revisar-2026-08',  text: '🚩 Revisen los productos marcados "Por revisar" en Inventario — usen el chip de filtro para verlos.' },
    { id: 'edit-apt-due-date-2026-09', text: '📅 Al editar un apartado ahora puedes ver y ajustar la fecha límite de pago — antes no aparecía ahí.' },
  ];

  function _hasValidSession() {
    try {
      const s = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
      if (!s.access_token || !s.expires_at) return false;
      return s.expires_at > Math.floor(Date.now() / 1000) + 60;
    } catch { return false; }
  }

  function _initSysNotice() {
    if (!_hasValidSession()) return;
    const notice = SYS_NOTICES.find(n => !localStorage.getItem(`te_notice_${n.id}`));
    if (!notice) return;

    const banner = document.createElement('div');
    banner.id = 'sys-notice';
    banner.dataset.id = notice.id;
    const hasPosTabBar = !!document.getElementById('pos-tab-bar');
    banner.style.bottom = hasPosTabBar ? '56px' : '0';
    banner.innerHTML =
      `<span class="sn-text">${notice.text}</span>` +
      `<button type="button" class="sn-close" aria-label="Cerrar aviso">✕</button>`;
    banner.querySelector('.sn-close').onclick = () => {
      localStorage.setItem(`te_notice_${notice.id}`, '1');
      banner.remove();
    };
    document.body.appendChild(banner);
  }

  document.addEventListener('DOMContentLoaded', _initSysNotice);
})();

/* ── NOTIFICACIONES DE VENTA — polling por dispositivo, sin cargar Realtime en los 5 módulos ── */
(function () {
  let _salesNotifTimer = null;
  let _notifNameMap = null; // { email: displayName } — mismo origen que Actividad/Reportes/Configuración

  async function _getNotifNameMap(url, key, tok) {
    if (_notifNameMap) return _notifNameMap;
    _notifNameMap = {};
    try {
      const r = await fetch(`${url}/rest/v1/config?id=eq.user_names&select=value`,
        { headers: { apikey: key, Authorization: `Bearer ${tok}` } });
      if (r.ok) {
        const data = await r.json();
        if (data?.[0]?.value) _notifNameMap = JSON.parse(data[0].value);
      }
    } catch {}
    return _notifNameMap;
  }

  function _notifEnabled() {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted'
      && localStorage.getItem('te_sales_notif_enabled') === '1';
  }

  function _showSaleNotification(title, body, tag) {
    const opts = { body, icon: 'icono-192.png', badge: 'icono-192.png', tag };
    const fallback = () => {
      try {
        const n = new Notification(title, opts);
        n.onclick = () => { window.focus(); n.close(); };
      } catch {}
    };
    if (navigator.serviceWorker) {
      // navigator.serviceWorker.ready nunca resuelve ni rechaza si no hay SW activo —
      // sin timeout, la notificación se perdería en silencio para siempre en ese caso
      Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, rej) => setTimeout(rej, 1500))
      ]).then(reg => reg.showNotification(title, opts)).catch(fallback);
    } else {
      fallback();
    }
  }

  async function _pollNewSalesLegacy() {
    if (!_notifEnabled()) return;
    const url = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    const key = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
    if (!url || !key) return;
    let tok = '';
    try { tok = JSON.parse(localStorage.getItem('te_admin_session') || '{}')?.access_token || ''; } catch {}
    if (!tok) return;

    try {
      // cancelled_at=is.null: una venta cancelada segundos después de crearse no debe notificar.
      // limit=50 (antes 10): margen contra ráfagas de ventas entre una revisión y la siguiente.
      const r = await fetch(`${url}/rest/v1/sales?select=id,type,total,paid_amount,customer,seller_email,abonos&cancelled_at=is.null&order=id.desc&limit=50`,
        { headers: { apikey: key, Authorization: `Bearer ${tok}` } });
      if (!r.ok) return;
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return;

      const maxId      = Math.max(...rows.map(s => s.id));
      const lastId     = parseInt(localStorage.getItem('te_last_seen_sale_id') || '0', 10);
      const prevAbonoTs = parseInt(localStorage.getItem('te_last_seen_abono_ts') || '0', 10);

      // Primera vez que corre en este dispositivo — solo ancla el punto de partida, no notifica retroactivo
      if (!lastId) {
        localStorage.setItem('te_last_seen_sale_id', String(maxId));
        let anchorAbonoTs = prevAbonoTs;
        rows.forEach(s => (s.abonos || []).forEach(a => {
          const t = new Date(a.date).getTime();
          if (t > anchorAbonoTs) anchorAbonoTs = t;
        }));
        localStorage.setItem('te_last_seen_abono_ts', String(anchorAbonoTs));
        return;
      }

      // Ventas/apartados recién creados
      const nuevas = rows.filter(s => s.id > lastId).sort((a, b) => a.id - b.id);

      // Abonos/liquidaciones sobre filas que YA existían — un abono o una liquidación
      // modifican una fila que ya existe (no crean una nueva), así que sin esto nunca se
      // avisaba cuando llegaba dinero después de la creación del apartado
      let maxAbonoTs = prevAbonoTs;
      const abonoEvents = [];
      rows.forEach(s => {
        if (!Array.isArray(s.abonos) || !s.abonos.length) return;
        const isNewRow = s.id > lastId;
        s.abonos.forEach(a => {
          const t = new Date(a.date).getTime();
          if (t > maxAbonoTs) maxAbonoTs = t;
          if (!isNewRow && prevAbonoTs && t > prevAbonoTs) abonoEvents.push({ sale: s, abono: a });
        });
      });

      if (nuevas.length || abonoEvents.length) {
        const nameMap = await _getNotifNameMap(url, key, tok);

        nuevas.forEach(s => {
          const monto   = `$${parseFloat(s.total || 0).toLocaleString('es-MX')}`;
          const cliente = (s.customer || '').split(' · 📱 ')[0];
          const quien   = s.seller_email ? (nameMap[s.seller_email] || s.seller_email.split('@')[0]) : '';
          const title   = s.type === 'apartado' ? '📌 Nuevo apartado' : '🛍️ Nueva venta';
          const body    = [monto, cliente, quien].filter(Boolean).join(' · ');
          _showSaleNotification(title, body, 'te-sale-' + s.id);
        });

        abonoEvents.sort((a, b) => new Date(a.abono.date) - new Date(b.abono.date));
        abonoEvents.forEach(({ sale: s, abono: a }) => {
          const monto     = `$${parseFloat(a.amount || 0).toLocaleString('es-MX')}`;
          const cliente   = (s.customer || '').split(' · 📱 ')[0];
          const quien     = s.seller_email ? (nameMap[s.seller_email] || s.seller_email.split('@')[0]) : '';
          const pendiente = Math.max(0, parseFloat(s.total || 0) - parseFloat(s.paid_amount || 0));
          const title     = pendiente <= 0 ? '✅ Apartado liquidado' : '💳 Abono recibido';
          const body      = [monto, cliente, quien].filter(Boolean).join(' · ');
          _showSaleNotification(title, body, 'te-abono-' + s.id + '-' + a.date);
        });
      }

      if (maxId > lastId) localStorage.setItem('te_last_seen_sale_id', String(maxId));
      localStorage.setItem('te_last_seen_abono_ts', String(maxAbonoTs));
    } catch {}
  }

  async function _pollNewSales() {
    if (!_notifEnabled()) return;
    const url = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    const key = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
    if (!url || !key) return;
    let token = '';
    try { token = JSON.parse(localStorage.getItem('te_admin_session') || '{}')?.access_token || ''; } catch {}
    if (!token) return;

    const headers = { apikey: key, Authorization: `Bearer ${token}` };
    const lastSaleId = parseInt(localStorage.getItem('te_last_seen_sale_id') || '0', 10);
    const lastPaymentId = parseInt(localStorage.getItem('te_last_seen_payment_id') || '0', 10);
    const salesFilter = lastSaleId
      ? `id=gt.${lastSaleId}&order=id.asc&limit=1000`
      : 'order=id.desc&limit=1';
    const paymentsFilter = lastPaymentId
      ? `id=gt.${lastPaymentId}&order=id.asc&limit=1000`
      : 'order=id.desc&limit=1';
    const saleFields = 'id,total,paid_amount,customer,seller_email,origin_type,status';

    try {
      const [salesResponse, paymentsResponse] = await Promise.all([
        fetch(`${url}/rest/v1/sales?select=${saleFields}&cancelled_at=is.null&${salesFilter}`, { headers }),
        fetch(`${url}/rest/v1/sale_payments?select=id,sale_id,request_id,amount,kind,method,paid_at,collected_by_email,source,sale:sales(${saleFields})&${paymentsFilter}`, { headers })
      ]);
      // Compatibilidad durante el despliegue de fase 1.
      if (paymentsResponse.status === 404) return _pollNewSalesLegacy();
      if (!salesResponse.ok || !paymentsResponse.ok) return;
      const salesRows = await salesResponse.json();
      const paymentRows = await paymentsResponse.json();
      if (!Array.isArray(salesRows) || !Array.isArray(paymentRows)) return;

      const maxSaleId = salesRows.reduce((max, sale) => Math.max(max, Number(sale.id) || 0), lastSaleId);
      const maxPaymentId = paymentRows.reduce((max, payment) => Math.max(max, Number(payment.id) || 0), lastPaymentId);
      if (!lastSaleId) localStorage.setItem('te_last_seen_sale_id', String(maxSaleId));
      if (!lastPaymentId) localStorage.setItem('te_last_seen_payment_id', String(maxPaymentId));

      const newSales = lastSaleId ? salesRows : [];
      const newSaleIds = new Set(newSales.map(sale => Number(sale.id)));
      const newPayments = lastPaymentId
        ? paymentRows.map(payment => ({
            ...payment,
            sale: Array.isArray(payment.sale) ? payment.sale[0] : payment.sale
          })).filter(payment => payment.sale && !newSaleIds.has(Number(payment.sale_id)))
        : [];
      if (!newSales.length && !newPayments.length) return;

      const nameMap = await _getNotifNameMap(url, key, token);
      const personName = email => email ? (nameMap[email] || email.split('@')[0]) : '';
      newSales.forEach(sale => {
        const amount = `$${parseFloat(sale.total || 0).toLocaleString('es-MX')}`;
        const customer = (sale.customer || '').split(' · 📱 ')[0];
        const actor = personName(sale.seller_email);
        const isApartado = sale.origin_type === 'apartado';
        const title = isApartado
          ? (sale.status === 'liquidado' ? '✅ Apartado liquidado' : '📌 Nuevo apartado')
          : '🛍️ Nueva venta';
        _showSaleNotification(title, [amount, customer, actor].filter(Boolean).join(' · '), `te-sale-${sale.id}`);
      });

      // Una devolución puede generar una línea por método; agrupar por request_id
      // evita dos notificaciones para una sola operación del cajero.
      const events = [];
      const refundsByRequest = new Map();
      newPayments.forEach(payment => {
        if (payment.kind !== 'refund' || !payment.request_id) {
          events.push(payment);
          return;
        }
        const groupKey = `${payment.sale_id}:${payment.request_id}`;
        const existing = refundsByRequest.get(groupKey);
        if (!existing) {
          const grouped = { ...payment };
          refundsByRequest.set(groupKey, grouped);
          events.push(grouped);
        } else {
          existing.amount = (parseFloat(existing.amount) || 0) + (parseFloat(payment.amount) || 0);
        }
      });

      events.forEach(payment => {
        const sale = payment.sale;
        const rawAmount = parseFloat(payment.amount) || 0;
        const amount = `${rawAmount < 0 ? '−' : ''}$${Math.abs(rawAmount).toLocaleString('es-MX')}`;
        const customer = (sale.customer || '').split(' · 📱 ')[0];
        const actor = personName(payment.collected_by_email || sale.seller_email);
        let title = '💳 Cobro registrado';
        if (payment.kind === 'refund') title = '↩️ Devolución registrada';
        else if (payment.kind === 'adjustment') title = '🧾 Ajuste registrado';
        else if (sale.origin_type === 'apartado') {
          title = _isApartadoLiquidationPayment(payment, sale)
            ? '✅ Apartado liquidado' : '💳 Abono recibido';
        }
        _showSaleNotification(title, [amount, customer, actor].filter(Boolean).join(' · '),
          `te-payment-${payment.request_id || payment.id}`);
      });

      if (maxSaleId > lastSaleId) localStorage.setItem('te_last_seen_sale_id', String(maxSaleId));
      if (maxPaymentId > lastPaymentId) localStorage.setItem('te_last_seen_payment_id', String(maxPaymentId));
    } catch {}
  }

  window._startSalesNotifPolling = function () {
    if (_salesNotifTimer) return;
    _pollNewSales();
    _salesNotifTimer = setInterval(_pollNewSales, 25000);
  };
  window._stopSalesNotifPolling = function () {
    clearInterval(_salesNotifTimer);
    _salesNotifTimer = null;
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (_notifEnabled()) window._startSalesNotifPolling();
  });
})();

/* ── PERMISSION SYSTEM ── */
const UP_PERMS = [
  {key:'canAddProduct',     label:'Agregar productos',   group:'Inventario', desc:'Crear productos nuevos en el catálogo'},
  {key:'canEditProduct',    label:'Editar y precios',    group:'Inventario', desc:'Editar nombre, descripción, categoría y precio de un producto existente'},
  {key:'canDeleteProduct',  label:'Eliminar productos',  group:'Inventario', desc:'Borrar un producto por completo del catálogo'},
  {key:'canPublishProduct', label:'Publicar en web',     group:'Inventario', desc:'Mostrar u ocultar un producto en la Tienda pública'},
  {key:'canBulkDelete',     label:'Borrado masivo',      group:'Inventario', desc:'Eliminar varios productos seleccionados a la vez'},
  {key:'canImportJSON',     label:'Import / Export JSON',group:'Inventario', desc:'Respaldar o reemplazar el catálogo completo desde un archivo'},
  {key:'canCancelSale',     label:'Cancelar ventas',     group:'Caja', desc:'Anular una venta ya cobrada y restaurar el stock'},
  {key:'canEditApartado',   label:'Editar apartados',    group:'Caja', desc:'Modificar, cancelar o reembolsar un apartado existente'},
  {key:'canOverridePrice',  label:'Modificar precio al cobrar', group:'Caja', desc:'Cambiar el precio de un producto en el carrito antes de cobrar'},
  {key:'canApplyDiscount',  label:'Aplicar descuentos',  group:'Caja', desc:'Usar el campo "Agregar descuento" al cobrar'},
  {key:'canMarkTestData',   label:'Marcar pruebas',      group:'Caja', desc:'Ocultar una venta/apartado de prueba de Historial, Reportes y Corte de caja sin borrarlo'},
  {key:'canViewReports',    label:'Ver Reportes',        group:'Módulos', desc:'Entrar al módulo de Reportes'},
  {key:'canViewActivity',   label:'Ver Actividad',       group:'Módulos', desc:'Entrar al módulo de Actividad (auditoría)'},
  {key:'canManageSettings', label:'Configuración',       group:'Módulos', desc:'Acceso completo a Configuración, incluyendo Usuarios y Permisos'},
  {key:'canManageCatalogSettings', label:'Configuración (solo Catálogo)', group:'Módulos', desc:'Entra a Configuración pero solo ve la sección Catálogo'},
];
const UP_ROLE_DEFAULTS = {
  superadmin:{canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:true, canImportJSON:true, canCancelSale:true, canEditApartado:true, canOverridePrice:true, canApplyDiscount:true, canMarkTestData:true, canViewReports:true, canViewActivity:true, canManageSettings:true, canManageCatalogSettings:false},
  encargado: {canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:true, canImportJSON:false, canCancelSale:true, canEditApartado:false, canOverridePrice:true, canApplyDiscount:true, canMarkTestData:false, canViewReports:false, canViewActivity:false, canManageSettings:false, canManageCatalogSettings:false},
  duena:     {canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:false, canImportJSON:false, canCancelSale:false, canEditApartado:true, canOverridePrice:true, canApplyDiscount:true, canMarkTestData:false, canViewReports:true, canViewActivity:true, canManageSettings:false, canManageCatalogSettings:false},
  operador:  {canAddProduct:true, canEditProduct:true, canDeleteProduct:false, canPublishProduct:false, canBulkDelete:false, canImportJSON:false, canCancelSale:false, canEditApartado:false, canOverridePrice:false, canApplyDiscount:false, canMarkTestData:false, canViewReports:false, canViewActivity:false, canManageSettings:false, canManageCatalogSettings:false},
};

/* ── PIN DE AUTORIZACIÓN (override puntual de un permiso bloqueado) ──
   Reutilizable desde cualquier módulo admin: si el usuario activo no tiene
   el permiso, requestOverride(permiso, etiqueta) muestra un sheet donde
   alguien con ese permiso teclea su propio PIN; al autorizar, el ticket
   (uuid) queda guardado 5 min en _overrideTickets y debe mandarse como
   p_override_tickets en la llamada RPC real (record_sale_atomic_v2,
   cancel_sale_atomic, etc. — ver supabase/migrations/20260821_01_override_pin.sql). */
let _overrideTickets = {}; // permission -> {ticket, expiresAt}

function _hasValidOverrideTicket(permission) {
  const t = _overrideTickets[permission];
  return !!(t && new Date(t.expiresAt).getTime() > Date.now());
}
function _clearOverrideTicket(permission) { delete _overrideTickets[permission]; }
// Junta los tickets vigentes de los permisos pedidos — para pasarlos tal cual
// como p_override_tickets a la RPC de negocio.
function _collectOverrideTickets(permissions) {
  return permissions
    .map(p => _hasValidOverrideTicket(p) ? _overrideTickets[p].ticket : null)
    .filter(Boolean);
}

async function _sharedRpc(name, body) {
  const url = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
  const key = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
  const session = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
  const token = session?.access_token || '';
  if (!url || !key || !token) return { ok: false, data: { message: 'Sesión no disponible' } };
  const request = async currentToken => fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let r = await request(token);
  const refreshToken =
    (typeof _refreshPosToken === 'function' && _refreshPosToken) ||
    (typeof _refreshStatsToken === 'function' && _refreshStatsToken) ||
    (typeof _refreshActivityToken === 'function' && _refreshActivityToken) ||
    (typeof _refreshSettingsToken === 'function' && _refreshSettingsToken) ||
    (typeof refreshSessionIfNeeded === 'function' && refreshSessionIfNeeded) ||
    null;
  if (r.status === 401 && refreshToken && await refreshToken()) {
    const refreshed = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
    r = await request(refreshed?.access_token || '');
  }
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text || null; }
  return { ok: r.ok, status: r.status, data };
}

// Punto de entrada: si ya hay un ticket vigente para `permission`, resuelve
// de inmediato (true). Si no, abre el sheet de autorización y resuelve
// según lo que pase ahí (true = autorizado, false = cancelado/fallido).
function requestOverride(permission, label) {
  if (_hasValidOverrideTicket(permission)) return Promise.resolve(true);
  return new Promise(resolve => _openOverrideSheet(permission, label, resolve));
}

function _openOverrideSheet(permission, label, onDone) {
  document.getElementById('override-sheet')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'override-sheet';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  wrap.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;padding:22px;max-width:320px;width:90%;box-shadow:0 12px 48px rgba(0,0,0,.3)">
      <div style="font-size:1rem;font-weight:700;color:#1C1817;margin-bottom:4px">🔒 Se requiere autorización</div>
      <div style="font-size:.82rem;color:#8A7564;margin-bottom:16px">${(label||'').replace(/[<>&]/g,'')} — pide que alguien con permiso teclee aquí su email y su PIN.</div>
      <input id="ov-email" type="email" placeholder="Email de quien autoriza" autocomplete="off"
        style="width:100%;padding:11px 12px;border:1.5px solid #EAE0D4;border-radius:10px;font-size:.95rem;margin-bottom:10px;font-family:inherit;box-sizing:border-box">
      <input id="ov-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="PIN (4-6 dígitos)" autocomplete="off"
        style="width:100%;padding:11px 12px;border:1.5px solid #EAE0D4;border-radius:10px;font-size:.95rem;margin-bottom:6px;font-family:inherit;box-sizing:border-box;letter-spacing:.3em">
      <div id="ov-error" style="color:#E85D5D;font-size:.78rem;min-height:16px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button id="ov-cancel" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid #EAE0D4;background:#fff;font-weight:600;font-family:inherit;cursor:pointer">Cancelar</button>
        <button id="ov-submit" style="flex:1;padding:11px;border-radius:10px;border:none;background:#C9A462;color:#fff;font-weight:700;font-family:inherit;cursor:pointer">Autorizar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = (result) => { wrap.remove(); onDone(result); };
  wrap.addEventListener('click', () => close(false));
  document.getElementById('ov-cancel').onclick = () => close(false);
  document.getElementById('ov-email').focus();
  const submit = async () => {
    const email = document.getElementById('ov-email').value.trim();
    const pin = document.getElementById('ov-pin').value.trim();
    const errEl = document.getElementById('ov-error');
    if (!email || !pin) { errEl.textContent = 'Completa ambos campos'; return; }
    const btn = document.getElementById('ov-submit');
    btn.disabled = true; btn.textContent = 'Verificando…';
    const r = await _sharedRpc('te_request_override', { p_permission: permission, p_authorizer_email: email, p_pin: pin });
    if (r.ok && r.data?.ok) {
      _overrideTickets[permission] = { ticket: r.data.ticket, expiresAt: r.data.expires_at };
      close(true);
    } else {
      errEl.textContent = r.data?.message || 'PIN o autorización inválida';
      btn.disabled = false; btn.textContent = 'Autorizar';
      document.getElementById('ov-pin').value = '';
      document.getElementById('ov-pin').focus();
    }
  };
  document.getElementById('ov-submit').onclick = submit;
  document.getElementById('ov-pin').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

function openMyPinModal() {
  document.getElementById('mypin-sheet')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'mypin-sheet';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  wrap.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:18px;padding:22px;max-width:320px;width:90%;box-shadow:0 12px 48px rgba(0,0,0,.3)">
      <div style="font-size:1rem;font-weight:700;color:#1C1817;margin-bottom:4px">🔑 Mi PIN de autorización</div>
      <div style="font-size:.82rem;color:#8A7564;margin-bottom:16px">Úsalo cuando alguien sin permiso necesite tu autorización para una acción puntual (precio, descuento, cancelar, etc). Solo tú puedes verlo o cambiarlo.</div>
      <input id="mypin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Nuevo PIN (4-6 dígitos)" autocomplete="off"
        style="width:100%;padding:11px 12px;border:1.5px solid #EAE0D4;border-radius:10px;font-size:.95rem;margin-bottom:6px;font-family:inherit;box-sizing:border-box;letter-spacing:.3em">
      <div id="mypin-error" style="color:#E85D5D;font-size:.78rem;min-height:16px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button id="mypin-cancel" style="flex:1;padding:11px;border-radius:10px;border:1.5px solid #EAE0D4;background:#fff;font-weight:600;font-family:inherit;cursor:pointer">Cancelar</button>
        <button id="mypin-submit" style="flex:1;padding:11px;border-radius:10px;border:none;background:#C9A462;color:#fff;font-weight:700;font-family:inherit;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', close);
  document.getElementById('mypin-cancel').onclick = close;
  document.getElementById('mypin-input').focus();
  const submit = async () => {
    const pin = document.getElementById('mypin-input').value.trim();
    const errEl = document.getElementById('mypin-error');
    if (!/^[0-9]{4,6}$/.test(pin)) { errEl.textContent = 'El PIN debe ser de 4 a 6 dígitos'; return; }
    const btn = document.getElementById('mypin-submit');
    btn.disabled = true; btn.textContent = 'Guardando…';
    const r = await _sharedRpc('te_set_my_pin', { p_pin: pin });
    if (r.ok && r.data?.ok) {
      close();
      if (typeof toast === 'function') toast('PIN guardado ✓', 'ok');
    } else {
      errEl.textContent = r.data?.message || 'Error al guardar';
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  };
  document.getElementById('mypin-submit').onclick = submit;
  document.getElementById('mypin-input').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

// Bucle de paginación por offset/limit compartido por _posFetchAll
// (pos-core.js) y _fetchAll (stats.js) — cada uno llama a través de su
// propio api() (con el token del módulo correspondiente), así que solo se
// deduplica el bucle, no el transporte. maxRows=Infinity reproduce el
// comportamiento original de stats.js (traer la colección completa para
// que los reportes no corten datos en silencio); pos-core.js sigue
// pasando su propio tope de 20000.
async function _posPaginatedFetch(path, { pageSize = 500, maxRows = Infinity, tooManyMessage } = {}) {
  const rows = [];
  let offset = 0;
  while (offset < maxRows) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await api(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (!r.ok) return { ...r, data: null };
    const page = Array.isArray(r.data) ? r.data : [];
    rows.push(...page);
    if (page.length < pageSize) return { ok: true, status: r.status, data: rows };
    offset += page.length;
  }
  return { ok: false, status: 413, data: { message: tooManyMessage || 'Demasiados registros para completar la consulta' } };
}

// Única fuente de verdad para "¿este pago dejó liquidado el apartado?",
// usada por stats.js, pos-ui.js, pos-cart.js y el poller de notificaciones
// de este mismo archivo. rpc_apartado_liquidation siempre lo es por
// construcción; un anticipo (rpc_apartado_initial) solo cuenta si el status
// actual de la venta ya es 'liquidado' — más confiable que adivinar por
// comparación de montos, que solo se usa si no hay sale.status disponible.
function _isApartadoLiquidationPayment(payment, sale) {
  if (!payment) return false;
  if (payment.source === 'rpc_apartado_liquidation') return true;
  if (payment.source !== 'rpc_apartado_initial') return false;
  if (sale && sale.status) return sale.status === 'liquidado';
  const total = parseFloat(sale?.total) || 0;
  const amount = parseFloat(payment.amount) || 0;
  return total > 0 && Math.abs(amount - total) < .005;
}

function _getMyPermsCached() {
  try {
    const session = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
    const email = String(session?.user?.email || '').toLowerCase();
    const cached = JSON.parse(sessionStorage.getItem('te_user_can') || 'null');
    return email && cached?.email?.toLowerCase() === email && cached?.permissions
      ? cached.permissions : null;
  } catch { return null; }
}
async function _loadMyPerms(options = {}) {
  const requireFresh = options?.requireFresh === true;
  const withMeta = options?.withMeta === true;
  const cached = _getMyPermsCached();
  const result = (permissions, source) => {
    const state = {
      permissions: permissions || null,
      source,
      fresh: source === 'server'
    };
    if (withMeta) return state;
    return requireFresh && !state.fresh ? null : state.permissions;
  };
  try {
    const session = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
    const token = session?.access_token || '';
    const email = String(session?.user?.email || '').toLowerCase();
    const url = typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '';
    const key = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';
    if (!token || !email || !url || !key) return result(cached, cached ? 'cache' : 'unavailable');

    // La autorización efectiva se calcula en PostgreSQL a partir del usuario
    // autenticado. El caché solo sirve para pintar navegación mientras no hay
    // conexión; una pantalla restringida debe usar { requireFresh: true }.
    const request = async currentToken => fetch(`${url}/rest/v1/rpc/get_my_permissions`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    let response = await request(token);
    const refreshToken =
      (typeof _refreshPosToken === 'function' && _refreshPosToken) ||
      (typeof _refreshStatsToken === 'function' && _refreshStatsToken) ||
      (typeof _refreshActivityToken === 'function' && _refreshActivityToken) ||
      (typeof _refreshSettingsToken === 'function' && _refreshSettingsToken) ||
      (typeof refreshSessionIfNeeded === 'function' && refreshSessionIfNeeded) ||
      null;
    if (response.status === 401 && refreshToken && await refreshToken()) {
      const refreshed = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
      response = await request(refreshed?.access_token || '');
    }
    if (!response.ok) return result(cached, cached ? 'cache' : 'unavailable');
    const permissions = await response.json().catch(() => null);
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return result(cached, cached ? 'cache' : 'unavailable');
    }
    sessionStorage.setItem('te_user_can', JSON.stringify({ email, permissions }));
    return result(permissions, 'server');
  } catch {
    return result(cached, cached ? 'cache' : 'unavailable');
  }
}
