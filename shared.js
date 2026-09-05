/* shared.js — Dropdown de usuario para todos los módulos admin
   Requiere: shared.css, elemento #user-avatar, función doLogout() en el módulo */

/* ── MODO OSCURO — infraestructura compartida (2026-09-04) ──
   `data-theme="dark"` en <html> activa el bloque [data-theme="dark"] que
   cada módulo defina en su propia hoja de estilos. Hoy solo admin.css lo
   define — Inventario es el primer módulo con paleta oscura real. El
   resto de módulos ya recibe estos tokens con sus valores claros de
   siempre (ver :root en shared.css), así que activar el toggle ahí no
   rompe nada, solo no cambia de color todavía. Cuando otro módulo sume su
   propio bloque [data-theme="dark"], el toggle ya aparece solo — no hace
   falta tocar shared.js — con solo agregar data-theme-ready="1" en su
   <html> (ver admin.html).
   La aplicación temprana (antes del primer paint, para evitar flash)
   vive en un <script> inline en el <head> de cada módulo — esto de aquí
   es una red de seguridad por si un módulo futuro olvida ese inline. */
try {
  if (localStorage.getItem('te_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) {}

function _themeSupported() { return document.documentElement.hasAttribute('data-theme-ready'); }

function _toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  try { localStorage.setItem('te_theme', isDark ? 'dark' : 'light'); } catch (e) {}
}

function _themeToggleRowHtml() {
  if (!_themeSupported()) return '';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return `<label class="ud-theme-row">
      <span class="ud-theme-row-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        Modo oscuro
      </span>
      <span class="ud-theme-switch">
        <input type="checkbox" ${isDark ? 'checked' : ''} onchange="_toggleTheme(this.checked)">
        <span class="ud-theme-switch-slider"></span>
      </span>
    </label>`;
}

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
      ${_themeToggleRowHtml()}
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
    _udOpening = false;
  }

  document.addEventListener('DOMContentLoaded', _initUserDropdown);
})();

/* ── OFFLINE BANNER ── */
(function () {
  function _initOfflineBanner() {
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    // Posicionar sobre la tab bar en Caja mobile (≤640px, único breakpoint donde es visible), al fondo en el resto
    const hasPosTabBar = !!document.getElementById('pos-tab-bar') && window.matchMedia('(max-width:640px)').matches;
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

/* ── AVISOS DE SISTEMA — campana de notificaciones en la topbar, para
   cualquier usuario con sesión activa (Ofelia, Areli, Eduardo, sin
   distinción de rol). Reemplaza al banner fijo que se descartaba una sola
   vez y desaparecía para siempre (2026-08-21 a 2026-09-04) -- Eduardo pidió
   un lugar donde poder releer lo que ya se mandó, sin que se amontone en
   pantalla. Mismo patrón de lectura que Gmail/Slack: la campana muestra un
   contador de no leídos; abrir el panel los marca leídos, pero la lista
   completa (leídos incluidos) sigue disponible mientras el aviso no expire.
   `until` ('YYYY-MM-DD', inclusive, opcional) evita que un dispositivo
   nuevo -- que nunca marcó nada como leído en su localStorage -- reciba la
   cola completa de avisos acumulados desde que existe esta lista. Regla
   práctica: ~3 semanas de vida por aviso.
   Compatibilidad: reutiliza la misma llave `te_notice_${id}` que ya usaba
   el banner viejo -- un aviso ya descartado antes de este cambio sigue
   contando como leído, sin migración.
   Para agregar un aviso futuro: nuevo objeto {id, text, until} al arreglo. ── */
(function () {
  // `icon` referencia un ícono SVG fijo (_NOTIF_ICONS más abajo) en vez de un
  // emoji embebido en el texto -- un emoji se ve distinto (a veces roto) según
  // el teléfono/SO; un ícono propio se ve igual en todos. `text` se acortó a
  // una sola línea, en el lenguaje de "qué cambia para ti", no un reporte
  // técnico del bug.
  const SYS_NOTICES = [
    { id: 'staff-access-2026-08', icon: 'lock', text: 'El acceso a Caja e Inventario se movió arriba, junto al carrito, en la Tienda.', until: '2026-08-31' },
    { id: 'por-revisar-2026-08',  icon: 'flag', text: 'Revisen los productos marcados "Por revisar" — usen el chip de filtro para verlos.', until: '2026-08-31' },
    { id: 'edit-apt-due-date-2026-09', icon: 'calendar', text: 'Editar apartado ahora muestra y deja ajustar la fecha límite de pago.', until: '2026-09-22' },
    { id: 'resend-receipt-2026-09b', icon: 'send', text: 'En Apartados, la flecha junto a cada pago reenvía ese comprobante por WhatsApp.', until: '2026-09-22' },
    { id: 'edit-apt-phone-2026-09', icon: 'phone', text: 'Ya puedes agregar o corregir el teléfono del cliente al editar un apartado.', until: '2026-09-22' },
    { id: 'edit-apt-fix-2026-09', icon: 'wrench', text: 'Se arregló que "Editar apartado" no guardaba al agregar un producto.', until: '2026-09-25' },
    { id: 'turno-caja-2026-09', icon: 'wallet',
      title: 'Abrir turno de caja ya es obligatorio',
      text: 'Antes de vender, Caja te va a pedir abrir tu turno: declara cuánto efectivo tienes al empezar (puede ser $0). Al terminar tu día, ciérralo desde "🧾 Corte" contando el efectivo real que tienes en la caja. Si se te olvida cerrarlo, el sistema lo cierra solo la próxima vez que entres, pero sin tu conteo — mejor ciérralo tú misma cada día para que el corte salga exacto.',
      until: '2026-09-26' },
  ];

  const _NOTIF_ICONS = {
    wrench:   '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    send:     '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    lock:     '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    flag:     '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    wallet:   '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    info:     '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
  };
  function _notifIconSvg(name) {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${_NOTIF_ICONS[name] || _NOTIF_ICONS.info}</svg>`;
  }

  function _hasValidSession() {
    try {
      const s = JSON.parse(localStorage.getItem('te_admin_session') || '{}');
      if (!s.access_token || !s.expires_at) return false;
      return s.expires_at > Math.floor(Date.now() / 1000) + 60;
    } catch { return false; }
  }

  function _activeNotices() {
    const todayKey = new Date().toISOString().slice(0, 10);
    return SYS_NOTICES.filter(n => !n.until || n.until >= todayKey);
  }

  function _isRead(id) { return !!localStorage.getItem(`te_notice_${id}`); }

  function _updateBadge(bell) {
    const count = _activeNotices().filter(n => !_isRead(n.id)).length;
    let badge = bell.querySelector('.notif-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'notif-badge';
        bell.appendChild(badge);
      }
      badge.textContent = count > 9 ? '9+' : String(count);
    } else if (badge) {
      badge.remove();
    }
  }

  function _toggleNotifPanel(bell) {
    const existing = document.getElementById('notif-pop');
    if (existing) { existing.remove(); return; }

    const notices = _activeNotices().slice().reverse(); // más reciente primero
    const unreadIds = new Set(notices.filter(n => !_isRead(n.id)).map(n => n.id));

    const pop = document.createElement('div');
    pop.id = 'notif-pop';
    pop.innerHTML = `
      <div class="notif-pop-title">Notificaciones</div>
      ${notices.length
        ? notices.map(n => n.title
            // Avisos largos: título siempre visible, el detalle se desglosa
            // al tocar -- evita un bloque de texto largo por default en una
            // lista que se supone hojear rápido.
            ? `<button type="button" class="notif-item notif-item-expandable${unreadIds.has(n.id) ? ' unread' : ''}" onclick="this.classList.toggle('open')">
                <span class="notif-item-icon">${_notifIconSvg(n.icon)}</span>
                <span class="notif-item-text">
                  <span class="notif-item-title">${n.title}<svg class="notif-item-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
                  <span class="notif-item-body">${n.text}</span>
                </span>
              </button>`
            : `<div class="notif-item${unreadIds.has(n.id) ? ' unread' : ''}">
                <span class="notif-item-icon">${_notifIconSvg(n.icon)}</span>
                <span class="notif-item-text">${n.text}</span>
              </div>`
          ).join('')
        : '<div class="notif-empty">Sin notificaciones por ahora.</div>'}`;
    document.body.appendChild(pop);

    const r = bell.getBoundingClientRect();
    const pw = 300;
    let left = r.right - pw;
    if (left < 8) left = 8;
    pop.style.cssText += `top:${r.bottom + 6}px;left:${left}px`;

    // Marcar leído al abrir -- el resaltado de "no leído" se queda visible
    // en esta misma vista (ya se calculó unreadIds antes de este paso).
    unreadIds.forEach(id => localStorage.setItem(`te_notice_${id}`, '1'));
    _updateBadge(bell);

    setTimeout(() => {
      document.addEventListener('click', function close(e) {
        if (!pop.contains(e.target) && e.target !== bell && !bell.contains(e.target)) {
          pop.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 10);
  }

  function _initNotifBell() {
    if (!_hasValidSession()) return;
    const avatar = document.getElementById('user-avatar');
    if (!avatar || !avatar.parentElement) return;

    const bell = document.createElement('button');
    bell.type = 'button';
    bell.id = 'notif-bell';
    bell.title = 'Notificaciones';
    bell.setAttribute('aria-label', 'Notificaciones');
    bell.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
    bell.addEventListener('click', e => { e.stopPropagation(); _toggleNotifPanel(bell); });

    avatar.parentElement.insertBefore(bell, avatar);
    _updateBadge(bell);
  }

  document.addEventListener('DOMContentLoaded', _initNotifBell);
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
  {key:'canCancelSale',     label:'Cancelar ventas',     group:'Caja', desc:'Anular una venta ya cobrada y restaurar el stock'},
  {key:'canEditApartado',   label:'Editar apartados',    group:'Caja', desc:'Modificar, cancelar o reembolsar un apartado existente'},
  {key:'canOverridePrice',  label:'Modificar precio al cobrar', group:'Caja', desc:'Cambiar el precio de un producto en el carrito antes de cobrar'},
  {key:'canApplyDiscount',  label:'Aplicar descuentos',  group:'Caja', desc:'Usar el campo "Agregar descuento" al cobrar'},
  {key:'canMarkTestData',   label:'Marcar pruebas',      group:'Caja', desc:'Ocultar una venta/apartado de prueba de Historial, Reportes y Corte de caja sin borrarlo'},
  {key:'canCloseShiftUnsupervised', label:'Cerrar turno con diferencia grande', group:'Caja', desc:'Cerrar un turno de caja sin pedir autorización aunque la diferencia sea de $100 o más'},
  {key:'canViewReports',    label:'Ver Reportes',        group:'Módulos', desc:'Entrar al módulo de Reportes'},
  {key:'canViewActivity',   label:'Ver Actividad',       group:'Módulos', desc:'Entrar al módulo de Actividad (auditoría)'},
  {key:'canManageSettings', label:'Configuración',       group:'Módulos', desc:'Acceso completo a Configuración, incluyendo Usuarios y Permisos'},
  {key:'canManageCatalogSettings', label:'Configuración (solo Catálogo)', group:'Módulos', desc:'Entra a Configuración pero solo ve la sección Catálogo'},
];
const UP_ROLE_DEFAULTS = {
  superadmin:{canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:true, canCancelSale:true, canEditApartado:true, canOverridePrice:true, canApplyDiscount:true, canMarkTestData:true, canViewReports:true, canViewActivity:true, canManageSettings:true, canManageCatalogSettings:false, canCloseShiftUnsupervised:true},
  encargado: {canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:true, canCancelSale:true, canEditApartado:false, canOverridePrice:true, canApplyDiscount:true, canMarkTestData:false, canViewReports:false, canViewActivity:false, canManageSettings:false, canManageCatalogSettings:false, canCloseShiftUnsupervised:true},
  duena:     {canAddProduct:true, canEditProduct:true, canDeleteProduct:true, canPublishProduct:true, canBulkDelete:false, canCancelSale:false, canEditApartado:true, canOverridePrice:true, canApplyDiscount:true, canMarkTestData:false, canViewReports:true, canViewActivity:true, canManageSettings:false, canManageCatalogSettings:false, canCloseShiftUnsupervised:true},
  operador:  {canAddProduct:true, canEditProduct:true, canDeleteProduct:false, canPublishProduct:false, canBulkDelete:false, canCancelSale:false, canEditApartado:false, canOverridePrice:false, canApplyDiscount:false, canMarkTestData:false, canViewReports:false, canViewActivity:false, canManageSettings:false, canManageCatalogSettings:false, canCloseShiftUnsupervised:false},
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

// Ubicación (2026-09-04) -- no bloquea nada, solo intenta obtener lat/lng
// para que el servidor calcule qué tan lejos del local se hizo la acción
// (te_open_cash_shift/te_close_cash_shift ya aceptan p_lat/p_lng opcionales
// -- se usaba también para el checador, retirado el mismo día, ver
// CLAUDE.md). Sin permiso, sin GPS, o si tarda más de 6s, resuelve null --
// la acción sigue igual, solo queda "sin ubicación" en vez de con distancia.
function _getGeoLocation(timeoutMs = 6000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { clearTimeout(timer); finish(null); },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
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
