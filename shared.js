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

    const pop = document.createElement('div');
    pop.id = 'ud-pop';
    pop.innerHTML = `
      <div class="ud-info">
        <div class="ud-name">${name}</div>
        <div class="ud-email">${email}</div>
        <span class="ud-role">${roleLabel}</span>
      </div>
      <div class="ud-divider"></div>
      <button class="ud-logout" onclick="document.getElementById('ud-pop')?.remove();doLogout()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Cerrar sesión
      </button>`;
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
