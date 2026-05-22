/**
 * tracker.js — Telemetría de uso para Tres Encantos
 * Registra acciones del usuario en localStorage para análisis de UX.
 * Sin red, sin servidor, completamente privado.
 */

const TE = (() => {
  const KEY_PREFIX = 'te_usage_';
  const TZ         = 'America/Mexico_City';

  const _today = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

  const _hour = () =>
    parseInt(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }), 10);

  function _get(date = _today()) {
    try { return JSON.parse(localStorage.getItem(KEY_PREFIX + date)) || _empty(date); }
    catch { return _empty(date); }
  }

  function _empty(date) { return { date, events: [] }; }

  function _save(day) {
    try { localStorage.setItem(KEY_PREFIX + day.date, JSON.stringify(day)); } catch {}
  }

  // ── API PÚBLICA ────────────────────────────────────────────────────────────

  function track(event, meta = {}) {
    const day = _get();
    day.events.push({ ts: Date.now(), h: _hour(), e: event, ...meta });
    _save(day);
  }

  // ── BÚSQUEDA DEBOUNCEADA ───────────────────────────────────────────────────
  let _searchTimer = null;
  function trackSearch(term, hasResults) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      if (term.trim().length < 2) return;
      track('search', { q: term.trim().slice(0, 40), empty: !hasResults });
    }, 1200);
  }

  // ── AGREGACIÓN PARA REPORTE ────────────────────────────────────────────────
  const LABELS = {
    session_start:    'Inicio de sesión',
    session_pause:    'App en segundo plano',
    session_resume:   'App de vuelta',
    qv_open:          'Quick View abierto',
    scan_search:      'Escáner — buscar producto',
    scan_form:        'Escáner — asignar código',
    scan_result:      'Resultado de escaneo (big card)',
    form_open_add:    'Formulario — agregar producto',
    form_open_edit:   'Formulario — editar producto',
    product_saved:    'Producto guardado',
    product_deleted:  'Producto eliminado',
    product_dup:      'Producto duplicado',
    inline_name:      'Edición inline — nombre',
    inline_price:     'Edición inline — precio',
    inline_desc:      'Edición inline — descripción',
    inline_stock:     'Edición inline — stock',
    inline_category:  'Edición inline — categoría',
    web_toggle:       'Toggle Web / Oculto',
    filter_chip:      'Chip de filtro activado',
    filter_category:  'Filtro por categoría',
    filter_sort:      'Cambio de ordenamiento',
    search:           'Búsqueda de producto',
    ai_used:          'IA usada (Groq)',
    dictate_start:    'Dictado de voz iniciado',
    bulk_action:      'Acción masiva',
    module_open:      'Módulo abierto',
    pos_add_cart:     'Agregar al carrito (Caja)',
    pos_checkout:     'Cobro completado (Caja)',
    pos_preview:      'Preview de producto (Caja)',
    pos_scan:         'Escáner en Caja',
    cat_sheet_open:   'Selector de categoría abierto',
  };

  function _aggregate(events) {
    const counts      = {};
    const byHour      = Array(24).fill(0);
    const qvProds     = {};
    const searches    = { total: 0, empty: 0, terms: {} };
    const modules     = {};
    const chips       = {};
    const sorts       = {};
    const inlineEdits = {};
    const cats        = {};

    for (const ev of events) {
      counts[ev.e] = (counts[ev.e] || 0) + 1;
      if (ev.h >= 0 && ev.h < 24) byHour[ev.h]++;

      if (ev.e === 'qv_open' && ev.id) {
        if (!qvProds[ev.id]) qvProds[ev.id] = { id: ev.id, name: ev.name || `#${ev.id}`, n: 0 };
        qvProds[ev.id].n++;
      }
      if (ev.e === 'search') {
        searches.total++;
        if (ev.empty) searches.empty++;
        if (ev.q) searches.terms[ev.q] = (searches.terms[ev.q] || 0) + 1;
      }
      if (ev.e === 'module_open' && ev.mod) modules[ev.mod] = (modules[ev.mod] || 0) + 1;
      if (ev.e === 'filter_chip' && ev.chip) chips[ev.chip] = (chips[ev.chip] || 0) + 1;
      if (ev.e === 'filter_sort' && ev.sort) sorts[ev.sort] = (sorts[ev.sort] || 0) + 1;
      if (ev.e === 'filter_category' && ev.cat) cats[ev.cat] = (cats[ev.cat] || 0) + 1;
      if (ev.e.startsWith('inline_')) inlineEdits[ev.e] = (inlineEdits[ev.e] || 0) + 1;
    }
    return { counts, byHour, qvProds, searches, modules, chips, sorts, inlineEdits, cats };
  }

  // ── MODAL DE REPORTE ───────────────────────────────────────────────────────
  function report(date = _today()) {
    const day = _get(date);
    if (!day.events.length) {
      _toast('Sin datos de uso para hoy aún.'); return;
    }
    const agg = _aggregate(day.events);

    // KPIs
    const total   = day.events.filter(e => !['session_pause','session_resume'].includes(e.e)).length;
    const first   = day.events[0]?.ts;
    const last    = day.events[day.events.length - 1]?.ts;
    const durMin  = first && last ? Math.round((last - first) / 60000) : 0;
    const durStr  = durMin >= 60 ? `${Math.floor(durMin/60)}h ${durMin % 60}m` : `${durMin}m`;
    const dateStr = new Date(first).toLocaleDateString('es-MX', { day:'numeric', month:'long' });

    // Top events
    const skip = new Set(['session_start','session_pause','session_resume']);
    const top  = Object.entries(agg.counts)
      .filter(([k]) => !skip.has(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14);
    const maxN = top[0]?.[1] || 1;

    const bar = ([k, n]) => `
      <div class="tr-bar-row">
        <span class="tr-bar-lbl">${LABELS[k] || k}</span>
        <div class="tr-bar-track"><div class="tr-bar-fill" style="width:${Math.round(n/maxN*100)}%"></div></div>
        <span class="tr-bar-n">${n}</span>
      </div>`;

    // Heatmap
    const maxH = Math.max(...agg.byHour, 1);
    const hmap = agg.byHour.map((n, h) => {
      const lbl = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`;
      return `<div class="tr-hcol${n === 0 ? ' tr-hcol-e' : ''}" title="${n} acciones a las ${h}:00" style="--p:${Math.round(n/maxH*100)}%"><span>${lbl}</span></div>`;
    }).join('');

    // Top QV products
    const topProds = Object.values(agg.qvProds).sort((a,b) => b.n - a.n).slice(0, 6);

    // Chips usados
    const chipRows = Object.entries(agg.chips).sort((a,b)=>b[1]-a[1])
      .map(([c,n]) => `<span class="tr-tag">${c} <b>${n}</b></span>`).join('');

    // Categorías filtradas
    const catRows = Object.entries(agg.cats).sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([c,n]) => `<span class="tr-tag">${c} <b>${n}</b></span>`).join('');

    // Módulos
    const modRows = Object.entries(agg.modules).sort((a,b)=>b[1]-a[1])
      .map(([m,n]) => `<span class="tr-tag">${m} <b>${n}</b></span>`).join('');

    // Búsquedas sin resultado
    const emptyTerms = Object.entries(agg.searches.terms)
      .filter(([,n]) => n > 0).sort((a,b)=>b[1]-a[1]).slice(0,6);

    _showModal(`
      <div class="tr-header">
        <div>
          <div class="tr-title">📊 Uso del día · ${dateStr}</div>
          <div class="tr-sub">Datos registrados localmente en este dispositivo</div>
        </div>
        <button class="tr-x" onclick="document.getElementById('te-modal').remove()">✕</button>
      </div>

      <div class="tr-kpis">
        <div class="tr-kpi"><b>${total}</b><span>Acciones</span></div>
        <div class="tr-kpi"><b>${durStr}</b><span>Tiempo activo</span></div>
        <div class="tr-kpi"><b>${agg.searches.total}</b><span>Búsquedas</span></div>
        ${agg.searches.empty > 0 ? `<div class="tr-kpi tr-kpi-warn"><b>${agg.searches.empty}</b><span>Sin resultado</span></div>` : ''}
      </div>

      ${modRows ? `<div class="tr-sec">Módulos visitados</div><div class="tr-tags">${modRows}</div>` : ''}

      <div class="tr-sec">Acciones más frecuentes</div>
      ${top.map(bar).join('')}

      <div class="tr-sec">Actividad por hora</div>
      <div class="tr-hmap">${hmap}</div>

      ${chipRows ? `<div class="tr-sec">Filtros rápidos usados</div><div class="tr-tags">${chipRows}</div>` : ''}
      ${catRows  ? `<div class="tr-sec">Categorías filtradas</div><div class="tr-tags">${catRows}</div>`   : ''}

      ${topProds.length ? `
        <div class="tr-sec">Productos más vistos en Quick View</div>
        ${topProds.map(p => `
          <div class="tr-prod">
            <span class="tr-prod-name">${p.name}</span>
            <span class="tr-prod-n">${p.n}×</span>
          </div>`).join('')}
      ` : ''}

      ${agg.searches.empty > 0 ? `
        <div class="tr-sec tr-sec-warn">⚠️ Búsquedas sin resultado</div>
        <p class="tr-hint">${agg.searches.empty} búsqueda${agg.searches.empty>1?'s':''} no encontraron nada — posibles productos faltantes o con nombre diferente.</p>
        ${emptyTerms.length ? `<div class="tr-tags">${emptyTerms.map(([t,n])=>`<span class="tr-tag tr-tag-warn">"${t}" <b>${n}</b></span>`).join('')}</div>` : ''}
      ` : ''}

      <div class="tr-footer">
        <button class="tr-btn-exp" onclick="TE.export('${date}')">⬇ Exportar JSON</button>
        <button class="tr-btn-close" onclick="document.getElementById('te-modal').remove()">Cerrar</button>
      </div>
    `);
  }

  function _showModal(html) {
    let el = document.getElementById('te-modal');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'te-modal';
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    el.innerHTML = `<style>
      #te-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
      #te-panel{background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:90dvh;overflow-y:auto;padding:20px 18px 32px;font-family:'Inter',sans-serif;-webkit-overflow-scrolling:touch}
      .tr-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
      .tr-title{font-size:1rem;font-weight:700;color:#1C1817}
      .tr-sub{font-size:.68rem;color:#8A7564;margin-top:2px}
      .tr-x{background:none;border:none;font-size:1.1rem;cursor:pointer;color:#8A7564;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .tr-x:hover{background:#F7F2EB}
      .tr-sec{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8A7564;margin:16px 0 7px;padding-top:12px;border-top:1px solid #F0EBE3}
      .tr-sec:first-of-type{border-top:none;padding-top:0}
      .tr-sec-warn{color:#B45309}
      .tr-kpis{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px}
      .tr-kpi{background:#F7F2EB;border-radius:10px;padding:8px 12px;flex:1;min-width:70px;text-align:center}
      .tr-kpi b{display:block;font-size:1.25rem;font-weight:800;color:#1C1817}
      .tr-kpi span{font-size:.58rem;color:#8A7564;text-transform:uppercase;letter-spacing:.04em}
      .tr-kpi-warn{background:#FEF3C7}
      .tr-kpi-warn b{color:#B45309}
      .tr-bar-row{display:flex;align-items:center;gap:7px;margin-bottom:5px}
      .tr-bar-lbl{font-size:.73rem;color:#2E2825;width:170px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tr-bar-track{flex:1;height:7px;background:#EAE0D4;border-radius:4px;overflow:hidden}
      .tr-bar-fill{height:100%;background:#C9A462;border-radius:4px}
      .tr-bar-n{font-size:.7rem;font-weight:700;color:#1C1817;width:22px;text-align:right;flex-shrink:0}
      .tr-hmap{display:flex;gap:2px;align-items:flex-end;height:48px;margin-bottom:4px}
      .tr-hcol{display:flex;flex-direction:column;align-items:center;flex:1;gap:2px;position:relative}
      .tr-hcol::before{content:'';display:block;width:100%;height:calc(var(--p) * 0.36px + 4px);background:#C9A462;border-radius:2px 2px 0 0;max-height:36px}
      .tr-hcol-e::before{background:#EAE0D4;height:4px}
      .tr-hcol span{font-size:.4rem;color:#B5A696;white-space:nowrap}
      .tr-tags{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px}
      .tr-tag{display:inline-flex;align-items:center;gap:4px;background:#F0EBE3;border-radius:50px;padding:3px 10px;font-size:.72rem;color:#2E2825}
      .tr-tag b{color:#C9A462;font-weight:700}
      .tr-tag-warn{background:#FEF3C7}
      .tr-tag-warn b{color:#B45309}
      .tr-prod{display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F7F2EB}
      .tr-prod-name{font-size:.78rem;color:#2E2825;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
      .tr-prod-n{font-size:.75rem;font-weight:700;color:#C9A462;flex-shrink:0;margin-left:8px}
      .tr-hint{font-size:.75rem;color:#8A7564;margin-bottom:8px;line-height:1.5}
      .tr-footer{display:flex;gap:8px;margin-top:20px;padding-top:14px;border-top:1px solid #F0EBE3}
      .tr-btn-exp{flex:1;padding:9px;border:1.5px solid #EAE0D4;background:#fff;border-radius:10px;font-size:.78rem;font-weight:600;cursor:pointer;color:#2E2825;font-family:inherit}
      .tr-btn-exp:hover{border-color:#C9A462}
      .tr-btn-close{flex:1;padding:9px;background:#C9A462;color:#fff;border:none;border-radius:10px;font-size:.78rem;font-weight:700;cursor:pointer;font-family:inherit}
    </style><div id="te-panel">${html}</div>`;
    document.body.appendChild(el);
  }

  function _toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1C1817;color:#fff;padding:8px 16px;border-radius:8px;font-size:.82rem;z-index:9999;pointer-events:none';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ── EXPORTAR ──────────────────────────────────────────────────────────────
  function exportData(date = _today()) {
    const day  = _get(date);
    const blob = new Blob([JSON.stringify(day, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `te_uso_${date}.json`;
    a.click();
  }

  // ── HISTORIAL DE DÍAS ─────────────────────────────────────────────────────
  function listDays() {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(KEY_PREFIX))
      .map(k => k.replace(KEY_PREFIX, ''))
      .sort()
      .reverse();
  }

  // ── AUTO-TRACK SESIÓN ─────────────────────────────────────────────────────
  const _mod = document.title.split('—')[0]?.trim().split(' ')[0] || 'desconocido';
  track('session_start', { mod: _mod });
  track('module_open',   { mod: _mod });

  document.addEventListener('visibilitychange', () => {
    track(document.hidden ? 'session_pause' : 'session_resume');
  });

  // Keyboard shortcut: Ctrl + Shift + U → reporte
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'U') { e.preventDefault(); report(); }
  });

  return { track, trackSearch, report, export: exportData, listDays };
})();
