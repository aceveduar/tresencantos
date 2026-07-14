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

    const _up = (() => { try { return JSON.parse(sessionStorage.getItem('te_user_can')||'{}'); } catch { return {}; } })();
    const canConfig   = 'canManageSettings' in _up ? _up.canManageSettings : role === 'superadmin';
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
        </a>` : '');

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

  async function _pollNewSales() {
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
  {key:'canAddProduct',     label:'Agregar productos',   group:'Inventario'},
  {key:'canEditProduct',    label:'Editar y precios',    group:'Inventario'},
  {key:'canDeleteProduct',  label:'Eliminar productos',  group:'Inventario'},
  {key:'canPublishProduct', label:'Publicar en web',     group:'Inventario'},
  {key:'canBulkDelete',     label:'Borrado masivo',      group:'Inventario'},
  {key:'canImportJSON',     label:'Import / Export JSON',group:'Inventario'},
  {key:'canMasivo',         label:'Carga masiva IA',     group:'Inventario'},
  {key:'canCancelSale',     label:'Cancelar ventas',     group:'Caja'},
  {key:'canEditApartado',   label:'Editar apartados',    group:'Caja'},
  {key:'canViewReports',    label:'Ver Reportes',        group:'Módulos'},
  {key:'canViewActivity',   label:'Ver Actividad',       group:'Módulos'},
  {key:'canManageSettings', label:'Configuración',       group:'Módulos'},
];
const UP_ROLE_DEFAULTS = {
  superadmin:{canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:true, canImportJSON:true, canMasivo:true, canCancelSale:true, canEditApartado:true, canViewReports:true, canViewActivity:true, canManageSettings:true},
  encargado: {canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:true, canImportJSON:false, canMasivo:false, canCancelSale:true, canEditApartado:false, canViewReports:false, canViewActivity:false, canManageSettings:false},
  duena:     {canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:false, canImportJSON:false, canMasivo:false, canCancelSale:false, canEditApartado:true, canViewReports:true, canViewActivity:true, canManageSettings:false},
  operador:  {canAddProduct:true, canEditProduct:true, canDeleteProduct:false, canPublishProduct:false, canBulkDelete:false, canImportJSON:false, canMasivo:false, canCancelSale:false, canEditApartado:false, canViewReports:false, canViewActivity:false, canManageSettings:false},
};
function _getMyPermsCached() {
  try { const c=sessionStorage.getItem('te_user_can'); return c?JSON.parse(c):null; } catch { return null; }
}
async function _loadMyPerms() {
  const cached=_getMyPermsCached(); if(cached) return cached;
  try {
    const _s=JSON.parse(localStorage.getItem('te_admin_session')||'{}');
    const tok=_s?.access_token||'';
    const url=typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'';
    const key=typeof SUPABASE_ANON_KEY!=='undefined'?SUPABASE_ANON_KEY:'';
    const r=await fetch(`${url}/rest/v1/config?id=eq.user_permissions&select=value`,
      {headers:{apikey:key,Authorization:`Bearer ${tok}`}});
    if(!r.ok) return null;
    const data=await r.json();
    const all=JSON.parse(data?.[0]?.value||'{}');
    const email=_s?.user?.email||null;
    const my=email?all[email]||null:null;
    if(my) sessionStorage.setItem('te_user_can',JSON.stringify(my));
    return my;
  } catch { return null; }
}
