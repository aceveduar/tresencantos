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

    const canConfig = role === 'superadmin' || role === 'duena';
    const configLink = canConfig
      ? `<a class="ud-link" href="settings.html">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configuración
        </a>
        <a class="ud-link" href="activity.html">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Actividad
        </a>`
      : `<a class="ud-link" href="activity.html">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Actividad
        </a>`;

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
