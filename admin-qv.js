/* ── QUICK VIEW ── */
let _qvCurrentId = null;

const _qvIco = (p, px = 13, sw = 1.75) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:3px">${p}</svg>`;
const QV_ICO_EYEOFF   = (px=13) => _qvIco('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>', px);
const QV_ICO_WARN     = (px=13) => _qvIco('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', px);
const QV_ICO_GLOBE    = (px=13) => _qvIco('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', px);
const QV_ICO_STAR     = (px=13) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-2px;margin-right:3px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const QV_ICO_GIFT     = (px=13) => _qvIco('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>', px, 1.5);
const QV_ICO_CLOCK    = (px=13) => _qvIco('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', px);
const QV_ICO_USER     = (px=13) => _qvIco('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', px);
const QV_ICO_BOOKMARK = (px=13) => _qvIco('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', px);
const QV_ICO_FLAG     = (px=13) => _qvIco('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>', px);
const QV_ICO_SHARE    = (px=13) => _qvIco('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>', px);
const QV_ICO_UNDO     = (px=13) => _qvIco('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', px);
const QV_ICO_ARCHIVE  = (px=13) => _qvIco('<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/>', px);

async function _qvShare(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!p.isPublished) { toast('Publica el producto primero para poder compartirlo', 'err'); return; }
  const url = `${SITE_URL}?p=${p.id}`;
  const kit = Array.isArray(p.kitItems) ? '🎁 ' : '';
  const price = `$${p.price.toLocaleString('es-MX')}`;
  let desc = '';
  if (p.description) {
    let d = p.description.slice(0, 120);
    if (p.description.length > 120) d = d.replace(/\s+\S*$/, '') + '…';
    desc = `\n${d}`;
  }
  const last = p.stock === 1 ? '\n⚡ ¡Última pieza!' : '';
  const text = `✨ ${kit}${p.name} — ${price}${desc}${last}\n\n🛒 Tres Encantos 👇`;
  if (navigator.share) {
    try { await navigator.share({ title: p.name, text, url }); return; } catch {}
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); } catch {}
  const btn = document.querySelector('.qv-btn-share');
  if (btn) { const orig = btn.innerHTML; btn.textContent = '✓ Copiado'; setTimeout(() => btn.innerHTML = orig, 1500); }
}

function openQV(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  TE?.track('qv_open', { id: p.id, name: p.name });
  _qvCurrentId = id;
  _renderQV(p);
  document.getElementById('qv-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  _initQVSwipe();
}

function closeQV() {
  document.getElementById('qv-overlay').classList.remove('open');
  document.body.style.overflow = '';
  _qvCurrentId = null;
}

function qvNavigate(dir) {
  const list = getFilteredProducts();
  const idx  = list.findIndex(p => p.id === _qvCurrentId);
  if (idx === -1) return;
  const next = list[idx + dir];
  if (!next) return;
  const panel = document.getElementById('qv-panel');
  const animClass = dir > 0 ? 'qv-anim-right' : 'qv-anim-left';
  panel.classList.remove('qv-anim-right', 'qv-anim-left');
  void panel.offsetWidth; // reflow
  _qvCurrentId = next.id;
  _renderQV(next);
  panel.classList.add(animClass);
}

function _qvRefresh(id) {
  const overlay = document.getElementById('qv-overlay');
  if (!overlay) return;
  const isOpen = overlay.classList.contains('open') || overlay.style.display === 'flex';
  if (!isOpen) return;
  const p = products.find(x => x.id === id);
  if (p) _renderQV(p);
}

async function _qvEditPrice(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const el = e.currentTarget;
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'decimal';
  input.value = p.price;
  input.style.cssText = 'width:100px;padding:3px 8px;border:2px solid var(--gold);border-radius:6px;font-size:1.25rem;font-weight:800;font-family:inherit;outline:none;text-align:center;color:var(--charcoal)';
  el.replaceWith(input);
  input.focus(); input.select();
  let saved = false;
  const save = async () => {
    if (saved) return; saved = true;
    const newPrice = parseFloat(String(input.value).replace(/,/g, '')) || 0;
    if (newPrice === p.price) { _qvRefresh(id); renderTable(); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, {
      method: 'PATCH', body: JSON.stringify({ price: newPrice })
    });
    if (result.ok) { p.price = newPrice; toast(`Precio → $${newPrice.toLocaleString('es-MX')}`); TE?.track('inline_price'); }
    else toast('Error al actualizar precio', 'error');
    _qvRefresh(id); renderTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') { saved = true; _qvRefresh(id); }
  });
}

async function _qvEditName(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const el = e.currentTarget;

  const wrap  = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';

  const ta = document.createElement('textarea');
  ta.rows = 2; ta.value = p.name;
  ta.style.cssText = 'width:100%;padding:8px 10px;border:2px solid var(--gold);border-radius:8px;font-size:1.05rem;font-weight:700;font-family:inherit;outline:none;color:var(--charcoal);box-sizing:border-box;resize:none;line-height:1.3';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px';

  const btnSave = document.createElement('button');
  btnSave.type = 'button'; btnSave.textContent = '✓ Guardar';
  btnSave.style.cssText = 'flex:1;padding:9px;background:var(--gold);color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button'; btnCancel.textContent = '✕';
  btnCancel.style.cssText = 'padding:9px 14px;background:var(--surface);color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation;font-family:inherit';

  row.append(btnSave, btnCancel);
  wrap.append(ta, row);
  el.replaceWith(wrap);
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);

  let saved = false;
  const doSave = async () => {
    if (saved) return; saved = true;
    const newName = ta.value.trim();
    if (!newName || newName === p.name) { _qvRefresh(id); renderTable(); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, { method:'PATCH', body:JSON.stringify({ name: newName }) });
    if (result.ok) { p.name = newName; toast('Nombre actualizado'); TE?.track('inline_name'); }
    else { toast('Error', 'error'); saved = false; }
    _qvRefresh(id); renderTable();
  };
  const doCancel = () => { saved = true; _qvRefresh(id); renderTable(); };

  btnSave.ontouchend   = e2 => { e2.preventDefault(); doSave(); };
  btnSave.onclick      = doSave;
  btnCancel.ontouchend = e2 => { e2.preventDefault(); doCancel(); };
  btnCancel.onclick    = doCancel;
  ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') doCancel(); });
}

async function _qvEditDesc(e, id) {
  e.stopPropagation();
  const p = products.find(x => x.id === id);
  if (!p) return;
  const descContainer = document.getElementById('qv-desc');
  if (descContainer) descContainer.classList.add('expanded');
  document.getElementById('qv-desc-toggle')?.style.setProperty('display','none');
  const el = e.currentTarget;

  const wrap = document.createElement('div');
  const ta = document.createElement('textarea');
  ta.value = p.description || ''; ta.rows = 4;
  ta.placeholder = 'Descripción del producto…';
  ta.style.cssText = 'width:100%;padding:8px 10px;border:2px solid var(--gold);border-radius:8px;font-size:.85rem;font-family:inherit;outline:none;color:var(--charcoal);resize:vertical;box-sizing:border-box;display:block;line-height:1.6';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;margin-top:6px';

  const btnSave = document.createElement('button');
  btnSave.type = 'button'; btnSave.textContent = '✓ Guardar';
  btnSave.style.cssText = 'flex:1;padding:10px;background:var(--gold);color:#fff;border:none;border-radius:8px;font-size:.84rem;font-weight:700;cursor:pointer;touch-action:manipulation;font-family:inherit';

  const btnCancel = document.createElement('button');
  btnCancel.type = 'button'; btnCancel.textContent = '✕';
  btnCancel.style.cssText = 'padding:10px 14px;background:var(--surface);color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;cursor:pointer;touch-action:manipulation;font-family:inherit';

  row.append(btnSave, btnCancel);
  wrap.append(ta, row);
  el.replaceWith(wrap);
  ta.focus(); ta.addEventListener('paste', handleDescPaste);

  let saved = false;
  const doSave = async () => {
    if (saved) return; saved = true;
    const newDesc = ta.value.trim();
    if (newDesc === (p.description || '').trim()) { _qvRefresh(id); return; }
    const result = await supabaseApi(`products?id=eq.${id}`, { method:'PATCH', body:JSON.stringify({ description: newDesc || null }) });
    if (result.ok) { p.description = newDesc || null; toast('Descripción actualizada'); TE?.track('inline_desc'); }
    else { toast('Error', 'error'); saved = false; }
    _qvRefresh(id);
  };
  const doCancel = () => { saved = true; _qvRefresh(id); };

  btnSave.ontouchend   = e2 => { e2.preventDefault(); doSave(); };
  btnSave.onclick      = doSave;
  btnCancel.ontouchend = e2 => { e2.preventDefault(); doCancel(); };
  btnCancel.onclick    = doCancel;
  ta.addEventListener('keydown', ev => { if (ev.key === 'Escape') doCancel(); });
}

let _qvSwipeX = null, _qvSwipeY = null, _qvSwipeDir = null;

function _initQVSwipe() {
  const overlay = document.getElementById('qv-overlay');
  if (!overlay || overlay._swipeInited) return;
  overlay._swipeInited = true;

  let _qvDragging = false;

  overlay.addEventListener('touchstart', e => {
    // No iniciar swipe sobre inputs ni sobre la descripción scrolleable
    if (e.target.closest('input, textarea, [contenteditable], .qv-desc')) { _qvSwipeX = null; return; }
    _qvSwipeX   = e.touches[0].clientX;
    _qvSwipeY   = e.touches[0].clientY;
    _qvSwipeDir = null;
    _qvDragging = false;
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (_qvSwipeX === null) return;
    const dx    = Math.abs(e.touches[0].clientX - _qvSwipeX);
    const dy    = e.touches[0].clientY - _qvSwipeY;
    const absDy = Math.abs(dy);
    if (!_qvSwipeDir && (dx > 8 || absDy > 8)) _qvSwipeDir = dx > absDy ? 'h' : 'v';

    if (_qvSwipeDir === 'v' && dy > 0 && window.innerWidth <= 600) {
      const panel = document.getElementById('qv-panel');
      if (panel) {
        panel.style.transition = 'none';
        panel.style.transform = `translateY(${dy}px)`;
        _qvDragging = true;
      }
      const ov = document.getElementById('qv-overlay');
      if (ov) ov.style.opacity = String(Math.max(0, 1 - dy / 200));
    }
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    if (_qvSwipeX === null) return;
    const dx        = e.changedTouches[0].clientX - _qvSwipeX;
    const dy        = e.changedTouches[0].clientY - _qvSwipeY;
    const dir       = _qvSwipeDir;
    const wasDragging = _qvDragging;
    _qvSwipeX = _qvSwipeY = _qvSwipeDir = null;
    _qvDragging = false;

    const panel = document.getElementById('qv-panel');

    const ov = document.getElementById('qv-overlay');

    if (dir === 'h' && Math.abs(dx) >= 40) {
      if (panel) { panel.style.transition = ''; panel.style.transform = ''; }
      if (ov) ov.style.opacity = '';
      if (!e.target.closest('.qv-gallery')) qvNavigate(dx < 0 ? 1 : -1);

    } else if (dir === 'v' && dy > 90) {
      _qvCloseWithAnim('down');

    } else if (wasDragging && panel) {
      panel.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
      panel.style.transform  = 'translateY(0)';
      if (ov) ov.style.opacity = '';
      setTimeout(() => { panel.style.transition = ''; panel.style.transform = ''; }, 280);
    }
  }, { passive: true });
}

function _qvCloseWithAnim(dir) {
  const panel = document.getElementById('qv-panel');
  const ov = document.getElementById('qv-overlay');
  if (panel) {
    panel.style.transition = 'transform .22s ease-in';
    panel.style.transform  = dir === 'down' ? 'translateY(110%)' : 'translateY(-48px) scale(.95)';
  }
  if (ov) ov.style.opacity = '0';
  setTimeout(() => {
    closeQV();
    if (panel) { panel.style.transition = ''; panel.style.transform = ''; }
    if (ov) ov.style.opacity = '';
  }, 230);
}

// Doble tap en imagen → zoom pantalla completa
let _qvLastTap = 0;
function _qvImgDoubleTap(e) {
  const now = Date.now();
  if (now - _qvLastTap < 320) {
    e.preventDefault();
    _qvOpenZoom();
  }
  _qvLastTap = now;
}

// Desktop: clic simple = zoom, doble clic = subir imagen
let _qvClickTimer = null;
function _qvImgClick(e) {
  clearTimeout(_qvClickTimer);
  _qvClickTimer = setTimeout(() => _qvOpenZoom(), 220);
}
function _qvImgDblClick(e) {
  clearTimeout(_qvClickTimer);
  if (!can.editProduct) return;
  document.getElementById('qv-img-file').click();
}

async function _qvHandleImgUpload(input) {
  const file = input.files?.[0];
  if (!file || !_qvCurrentId) return;
  const p = products.find(x => x.id === _qvCurrentId);
  if (!p) return;

  const img = document.getElementById('qv-img');
  if (img) { img.style.opacity = '.4'; img.style.transition = 'opacity .2s'; }
  toast('Subiendo imagen…', '');

  const b64 = await _fileToBase64Resized(file);
  let finalUrl = b64;
  if (driveEp && driveSecret) {
    const driveResult = await uploadToDrive(b64);
    if (driveResult) finalUrl = driveResult;
  }

  const result = await supabaseApi(`products?id=eq.${_qvCurrentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ image: finalUrl })
  });
  input.value = '';
  if (result.ok) {
    p.image = finalUrl;
    renderTable();
    openQV(_qvCurrentId);
    toast('Imagen actualizada ✓', 'success');
  } else {
    if (img) img.style.opacity = '1';
    toast('Error al guardar imagen', 'error');
  }
}

function _qvOpenZoom() {
  const p = products.find(x => x.id === _qvCurrentId);
  if (!p) return;
  // Imagen activa en la galería (o la única imagen)
  const gallery = document.getElementById('qv-gallery');
  let src = p.image;
  if (gallery) {
    const idx = Math.round(gallery.scrollLeft / gallery.offsetWidth);
    const allImgs = [p.image, ...(p.images || [])].filter(Boolean);
    src = allImgs[idx] || p.image;
  }
  const fs = document.createElement('div');
  fs.id = 'qv-zoom';
  fs.innerHTML = `
    <img src="${src}" alt="${_esc(p.name)}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
    <button onclick="document.getElementById('qv-zoom').remove()" title="Cerrar">✕</button>`;
  fs.onclick = e => { if (e.target === fs) fs.remove(); };
  document.body.appendChild(fs);
  requestAnimationFrame(() => fs.classList.add('open'));
}

/* ── KIT COMPONENT MINI-POPUP ── */
function _kitCompPopup(id, triggerEl) {
  const comp = products.find(x => x.id === id);
  if (!comp) return;
  _openKitLightbox(comp, can.editProduct ? () => _openFormFromKitQV(comp.id) : null);
}

// Teclado: ← → Esc cuando el QV está abierto
document.addEventListener('keydown', e => {
  if (!_qvCurrentId) return;
  const tag = document.activeElement?.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  if (document.getElementById('kit-lightbox')) {
    if (e.key === 'Escape') { document.getElementById('kit-lightbox')?.remove(); return; }
  }
  if (e.key === 'ArrowRight' && !isEditing) qvNavigate(1);
  if (e.key === 'ArrowLeft'  && !isEditing) qvNavigate(-1);
  if (e.key === 'Escape' && !document.getElementById('form-overlay')?.classList.contains('open')) closeQV();
});

function _qvGalleryScroll(gallery) {
  const idx = Math.round(gallery.scrollLeft / gallery.offsetWidth);
  document.querySelectorAll('#qv-gallery-dots .qv-gd').forEach((d, i) => d.classList.toggle('active', i === idx));
}

function _qvGoTo(idx) {
  const g = document.getElementById('qv-gallery');
  if (g) g.scrollTo({ left: idx * g.offsetWidth, behavior: 'smooth' });
}

function _qvImgNav(dir) {
  const g = document.getElementById('qv-gallery');
  if (!g) return;
  const total = g.querySelectorAll('.qv-gallery-img').length;
  const idx = Math.round(g.scrollLeft / g.offsetWidth);
  _qvGoTo(Math.max(0, Math.min(total - 1, idx + dir)));
}

function _renderQV(p) {
  const oos = Array.isArray(p.kitItems) ? false : (p.outOfStock || p.stock === 0);
  const catColor = getCatColor(p.category);
  const fallback = DEFAULT_IMG;

  // Contador y flechas de navegación
  const list = getFilteredProducts();
  const idx  = list.findIndex(x => x.id === p.id);
  const counterEl = document.getElementById('qv-counter');
  if (counterEl) counterEl.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
  const prevBtn = document.getElementById('qv-prev');
  const nextBtn = document.getElementById('qv-next');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= list.length - 1;

  // Imagen (galería si hay imágenes adicionales)
  const imgContainer = document.getElementById('qv-img-container');
  const allImgs = [p.image || fallback, ...(p.images || [])].filter(Boolean);
  const oosStyle = oos ? 'opacity:.5;filter:grayscale(.4)' : '';
  if (allImgs.length > 1) {
    imgContainer.innerHTML =
      `<div class="qv-gallery" id="qv-gallery" onscroll="_qvGalleryScroll(this)" ontouchend="_qvImgDoubleTap(event)">
        ${allImgs.map((src, i) => `<img class="qv-gallery-img" src="${src}" alt="${_esc(p.name)} ${i+1}" onerror="this.onerror=null;this.src='${fallback}'" onclick="_qvOpenZoom()" style="cursor:zoom-in;${oosStyle}">`).join('')}
       </div>
       <div class="qv-gallery-dots" id="qv-gallery-dots">
         ${allImgs.map((_,i) => `<span class="qv-gd${i===0?' active':''}" onclick="_qvGoTo(${i})"></span>`).join('')}
       </div>
       <button class="qv-img-nav qv-img-nav-prev" onclick="_qvImgNav(-1)" title="Imagen anterior">&#8249;</button>
       <button class="qv-img-nav qv-img-nav-next" onclick="_qvImgNav(1)"  title="Imagen siguiente">&#8250;</button>`;
  } else {
    imgContainer.innerHTML = `<img id="qv-img" src="${allImgs[0]}" alt="${_esc(p.name)}" onerror="this.onerror=null;this.src='${fallback}'" onclick="_qvImgClick(event)" ondblclick="_qvImgDblClick(event)" style="width:100%;height:260px;object-fit:contain;display:block;cursor:zoom-in;${oosStyle}" title="Clic: ver completa · Doble clic: cambiar imagen">`;
  }

  // Badge
  document.getElementById('qv-badge-zone').innerHTML = p.badge
    ? `<span class="badge badge-${p.badgeType || 'none'}">${_esc(p.badge)}</span>`
    : '';

  // Categoría — editable inline
  document.getElementById('qv-cat-row').innerHTML =
    `<span class="cat-dot" style="background:${catColor}"></span>
     <span class="qv-cat-label cat-label-inline qv-editable" onclick="editCategoryInline(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar categoría">${_esc(p.categoryLabel || '—')}</span>`;

  // Nombre
  const nameEl = document.getElementById('qv-name');
  if (can.editProduct) {
    nameEl.innerHTML = `<span class="qv-editable" onclick="_qvEditName(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar nombre">${_esc(p.name)}</span>`;
  } else {
    nameEl.textContent = p.name;
  }

  // Precio
  let priceHTML = `<span class="qv-price qv-editable" onclick="_qvEditPrice(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para cambiar precio">$${p.price.toLocaleString('es-MX')} <small style="font-size:.42em;font-weight:400;color:var(--muted);font-family:inherit">MXN</small></span>`;
  if (p.originalPrice && p.originalPrice > p.price) {
    const pct = Math.round((1 - p.price / p.originalPrice) * 100);
    priceHTML += `<span class="qv-price-orig">$${p.originalPrice.toLocaleString('es-MX')}</span>
                  <span class="qv-disc-chip">-${pct}%</span>`;
  }
  document.getElementById('qv-price-row').innerHTML = priceHTML;

  // Chips de estado
  const _pubClick = can.publishProduct
    ? `onclick="_qvTogglePublished(${p.id})" ontouchstart="event.stopPropagation()" style="cursor:pointer" title="Toca para cambiar visibilidad"`
    : '';
  const pubChip  = p.isPublished === false
    ? `<span class="qv-chip qv-chip-hidden" ${_pubClick}>${QV_ICO_EYEOFF(13)}Oculto</span>`
    : p.outOfStock
      ? `<span class="qv-chip qv-chip-warn">${QV_ICO_WARN(13)}Agotado</span>`
      : `<span class="qv-chip qv-chip-web" ${_pubClick}>${QV_ICO_GLOBE(13)}Web</span>`;
  const stockCls = p.stock === 0 ? 'qv-chip-sold' : p.stock === 1 ? '' : 'qv-chip-ok';
  const featChip    = p.featured ? `<span class="qv-chip">${QV_ICO_STAR(13)}Destacado</span>` : '';
  let marginChip = '';
  if (p.cost && p.price > 0) {
    const m = Math.round((1 - p.cost / p.price) * 100);
    const mc = m >= 30 ? 'qv-chip-ok' : m >= 10 ? '' : 'qv-chip-sold';
    marginChip = `<span class="qv-chip ${mc}">Margen ${m}%</span>`;
  }
  let stockChipQV;
  if (Array.isArray(p.kitItems)) {
    const ki = _kitInfo(p);
    if (ki?.empty) {
      stockChipQV = `<span class="qv-chip qv-chip-sold">${QV_ICO_GIFT(13)}Sin componentes</span>`;
    } else if (ki?.stock === 0) {
      // El nombre completo del bloqueo ya no vive aquí truncado -- se ve
      // sin cortes en la lista "Incluye" de abajo, con el componente
      // agotado resaltado en rojo.
      stockChipQV = `<span class="qv-chip qv-chip-sold" title="${_esc(ki.blocker ?? 'Componente agotado')}">${QV_ICO_GIFT(13)}Reabastecer</span>`;
    } else {
      const n = ki?.stock ?? 0;
      stockChipQV = `<span class="qv-chip qv-chip-ok">${QV_ICO_GIFT(13)}${n} kit${n !== 1 ? 's' : ''}</span>`;
    }
  } else {
    const stockLbl = p.stock === 0 ? 'Sin stock' : p.stock === 1 ? '1 · Última' : `${p.stock} en stock`;
    stockChipQV = `<span class="qv-chip ${stockCls} qv-editable" onclick="editStockInline(event,${p.id},this)" ontouchstart="event.stopPropagation()" title="Toca para editar stock" style="cursor:pointer">${stockLbl}</span>`;
  }
  let expiryChipQV = '';
  const expSt = _expiryStatus(p);
  if (expSt && expSt.state !== 'ok') {
    const dateStr = new Date(p.expiryDate + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
    expiryChipQV = expSt.state === 'expired'
      ? `<span class="qv-chip qv-chip-sold" title="Caducó el ${dateStr}">${QV_ICO_CLOCK(13)}Caducado</span>`
      : `<span class="qv-chip qv-chip-warn" title="Caduca el ${dateStr}">${QV_ICO_CLOCK(13)}Caduca en ${expSt.days}d</span>`;
  }
  document.getElementById('qv-chips').innerHTML =
    pubChip + stockChipQV + featChip + marginChip + expiryChipQV;

  // Descripción
  const descEl   = document.getElementById('qv-desc');
  const descToggle = document.getElementById('qv-desc-toggle');
  descEl.classList.remove('expanded');
  if (can.editProduct) {
    descEl.style.display = '';
    descEl.innerHTML = `<span class="qv-editable" onclick="_qvEditDesc(event,${p.id})" ontouchstart="event.stopPropagation()" title="Toca para editar descripción" style="display:block;min-height:1.4em">${_descHtml(p.description) || '<em style="color:var(--muted);font-style:normal;font-size:.82rem">+ Agregar descripción</em>'}</span>`;
  } else {
    descEl.innerHTML = _descHtml(p.description);
    descEl.style.display = p.description ? '' : 'none';
  }
  // Mostrar "Ver más" solo si la descripción desborda los 80px
  if (descToggle) {
    setTimeout(() => {
      const overflows = descEl.scrollHeight > 84;
      descToggle.style.display = overflows ? 'block' : 'none';
      descToggle.textContent   = 'Ver más ↓';
      descEl.classList.toggle('expanded', !overflows);
      _qvInfoScroll();
    }, 50);
  }

  // Componentes del kit
  const kitZone = document.getElementById('qv-kit-components');
  if (kitZone) {
    if (Array.isArray(p.kitItems) && p.kitItems.length) {
      kitZone.style.display = '';
      kitZone.innerHTML = `<div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${QV_ICO_GIFT(13)}Incluye</div>` +
        p.kitItems.map(item => {
          const comp = products.find(x => x.id === item.id);
          // El componente que bloquea el kit se resalta aquí, sin cortes de
          // nombre -- reemplaza el "Falta: nombre truncado" que antes vivía
          // en el chip resumen (inútil en mobile, sin hover para el title).
          const compOos = !comp || comp.outOfStock || comp.stock === 0;
          const baseBg = compOos ? 'var(--tint-red-bg)' : '';
          const rowStyle = `display:flex;align-items:center;gap:8px;padding:5px 6px;margin:0 -6px;border-radius:6px;background:${baseBg};${compOos ? '' : 'border-bottom:1px solid var(--border-light);'}`;
          const clickable = comp ? `onclick="_kitCompPopup(${comp.id},this)" style="${rowStyle}cursor:pointer;transition:background .15s" onmouseenter="this.style.background='var(--gold-light)'" onmouseleave="this.style.background='${baseBg}'"` : `style="${rowStyle}"`;
          const oosTag = compOos ? `<span style="font-size:.66rem;font-weight:700;color:#991B1B;background:#FEE2E2;padding:1px 7px;border-radius:50px;flex-shrink:0">Sin stock</span>` : '';
          return `<div ${clickable}>
            <img src="${_driveSz(comp?.image || DEFAULT_IMG, 80)}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;background:var(--surface-soft)" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
            <span style="flex:1;font-size:.82rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${_esc(comp?.name || item.name)}</span>
            ${oosTag}
            <span style="font-size:.75rem;color:var(--muted);font-weight:600;flex-shrink:0">×${item.qty}</span>
          </div>`;
        }).join('');
    } else if (Array.isArray(p.kitItems)) {
      kitZone.style.display = '';
      kitZone.innerHTML = `<div style="text-align:center;padding:12px;color:var(--muted);font-size:.82rem;border:1.5px dashed var(--border);border-radius:10px">${QV_ICO_GIFT(13)}Kit sin componentes · edita para agregar productos</div>`;
    } else {
      kitZone.style.display = 'none';
      kitZone.innerHTML = '';
    }
  }

  // Zona de apartado — quién reservó este producto
  const aptZone = document.getElementById('qv-apartado-zone');
  if (aptZone) {
    const aptList   = _apartadosDetail[p.id];
    const kitParent = !aptList?.length ? _findKitApartadoParent(p.id) : null;
    const renderList = (list, title) => `
        <div class="qv-flag-active" style="border-color:var(--tint-amber-border);background:var(--tint-amber-bg)">
          <span class="qv-flag-title" style="color:var(--tint-amber-strong)">${title}</span>
          ${list.map(a => {
            const d = a.createdAt ? new Date(a.createdAt) : null;
            const dateStr = d ? d.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) : '';
            const pendiente = Math.max(0, a.total - a.paidAmount);
            const dueStr = a.dueDate ? new Date(a.dueDate + 'T00:00:00').toLocaleDateString('es-MX', { day:'numeric', month:'short' }) : '';
            return `<p class="qv-flag-note-text">
              ${QV_ICO_USER(13)}${_esc(a.customer)} · ×${a.qty} · pendiente $${pendiente.toLocaleString('es-MX')}${dueStr ? ` · vence ${dueStr}` : ''}${dateStr ? ` · apartado el ${dateStr}` : ''}
            </p>`;
          }).join('')}
        </div>`;

    if (aptList?.length) {
      aptZone.innerHTML = renderList(aptList, `${QV_ICO_BOOKMARK(13)}Apartado — ${aptList.length > 1 ? `${aptList.length} clientes` : '1 cliente'}`);
    } else if (kitParent) {
      aptZone.innerHTML = renderList(_apartadosDetail[kitParent.id], `${QV_ICO_BOOKMARK(13)}Reservado como parte del kit "${_esc(kitParent.name)}"`);
    } else if (p.isApartado) {
      aptZone.innerHTML = `
        <div class="qv-flag-active" style="border-color:var(--tint-red-border);background:var(--tint-red-bg)">
          <span class="qv-flag-title" style="color:var(--tint-red-strong)">${QV_ICO_WARN(13)}Marcado como apartado, pero sin apartado activo</span>
          <p class="qv-flag-note-text">No encontramos ningún apartado pendiente en Caja que lo respalde — probablemente quedó la marca pegada de un apartado ya cancelado. Verifica en Caja → Apartados antes de quitarlo si tienes dudas.</p>
          ${can.editProduct ? `<button class="btn btn-sm" style="margin-top:8px;background:#B91C1C;color:#fff;border:none" onclick="_clearOrphanApartado(${p.id})">Quitar marca de apartado</button>` : ''}
        </div>`;
    } else {
      aptZone.innerHTML = '';
    }
  }

  // Zona de flag — banner prioritario arriba cuando se navega desde el
  // filtro "Por revisar" (evita repetir el mismo mensaje dos veces en el
  // mismo panel), caja normal abajo en cualquier otro contexto.
  const flagData = _flagItem(p.id);
  const flagZone = document.getElementById('qv-flag-zone');
  const flagPriorityZone = document.getElementById('qv-flag-priority');
  if (flagZone && flagPriorityZone) {
    if (flagData) {
      const d = new Date(flagData.ts);
      const dateStr = d.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) +
                      ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      if (_showOnlyFlagged) {
        flagPriorityZone.innerHTML = `
          <div class="qv-flag-priority">
            <span class="qv-flag-priority-title">${QV_ICO_FLAG(13)}Pendiente de revisión</span>
            ${flagData.note ? `<p class="qv-flag-priority-note">"${_esc(flagData.note)}"</p>` : ''}
            <span class="qv-flag-priority-ts">Marcado el ${dateStr}</span>
            <button type="button" class="qv-flag-priority-resolve" onclick="unflagProduct(${p.id})">✓ Marcar como revisado</button>
          </div>`;
        flagZone.innerHTML = '';
      } else {
        flagPriorityZone.innerHTML = '';
        flagZone.innerHTML = `
          <div class="qv-flag-active">
            <span class="qv-flag-title">${QV_ICO_FLAG(13)}Pendiente de revisión</span>
            ${flagData.note ? `<p class="qv-flag-note-text">"${_esc(flagData.note)}"</p>` : ''}
            <span class="qv-flag-ts">Marcado el ${dateStr}</span>
          </div>`;
      }
    } else {
      flagZone.innerHTML = '';
      flagPriorityZone.innerHTML = '';
    }
  }

  // ID + barcode en una línea
  const idEl = document.getElementById('qv-id');
  idEl.innerHTML = `<span style="font-family:monospace">ID #${p.id}</span>${p.barcode ? `<span style="font-family:monospace;color:var(--muted)">· ${_esc(p.barcode)}</span>` : ''}` +
    ` <a href="#" onclick="event.preventDefault();openProductTimeline(${p.id},'${_esc(p.name).replace(/'/g,"\\'")}')" style="color:var(--gold-dark);font-weight:700;text-decoration:underline;font-family:inherit">${QV_ICO_CLOCK(11)} Ver historial</a>`;

  // Botones de acción
  const btnEdit = can.editProduct
    ? `<button class="qv-btn qv-btn-edit" onclick="closeQV();openForm(${p.id})">${ICON_EDIT} Editar</button>`
    : '';
  const btnDup  = `<button class="qv-btn qv-btn-dup" onclick="closeQV();duplicateProduct(${p.id})">${ICON_COPY} Duplicar</button>`;
  const btnPub  = can.publishProduct
    ? `<button class="qv-btn qv-btn-pub" onclick="_qvTogglePublished(${p.id})">${p.isPublished === false ? QV_ICO_GLOBE() + 'Publicar' : QV_ICO_EYEOFF() + 'Ocultar'}</button>`
    : '';
  const btnDel  = can.deleteProduct
    ? `<button class="qv-btn qv-btn-del" onclick="closeQV();askDelete(${p.id})">✕ Eliminar</button>`
    : '';
  const btnFlag = flagData
    ? `<button class="qv-btn qv-btn-flagdone" onclick="unflagProduct(${p.id})">✓ Revisado</button>`
    : `<button class="qv-btn qv-btn-flag"    onclick="_qvShowFlagForm(${p.id})">${QV_ICO_FLAG()}Revisar</button>`;
  const btnShare = `<button class="qv-btn qv-btn-share" onclick="_qvShare(${p.id})">${QV_ICO_SHARE()}Compartir</button>`;
  const btnTop = can.editProduct
    ? `<button class="qv-btn qv-btn-dup" onclick="moveToTop(${p.id})">${QV_ICO_BOOKMARK()}Al inicio</button>`
    : '';
  const btnAddKit = can.editProduct && !Array.isArray(p.kitItems)
    ? `<button class="qv-btn qv-btn-dup" onclick="_openAddToKit([${p.id}])">${QV_ICO_GIFT()}A un kit</button>`
    : '';
  const btnArchive = can.deleteProduct
    ? (_showingArchived
        ? `<button class="qv-btn qv-btn-archive" onclick="restoreProduct(${p.id})">${QV_ICO_UNDO()}Restaurar</button>`
        : `<button class="qv-btn qv-btn-archive" onclick="archiveProduct(${p.id})">${QV_ICO_ARCHIVE()}Archivar</button>`)
    : '';
  const actionsEl = document.getElementById('qv-actions');
  actionsEl.removeAttribute('style');
  // Orden: Editar · Duplicar · Ocultar/Publicar / Al inicio · A un kit · Revisar · Archivar / Eliminar
  actionsEl.innerHTML = btnShare + btnEdit + btnDup + btnPub + btnTop + btnAddKit + btnFlag + btnArchive + btnDel;
}

async function _qvTogglePublished(id) {
  await togglePublished(id);
  _qvRefresh(id);
}

async function _clearOrphanApartado(id) {
  if (!can.editProduct) { toast('Sin permiso para editar productos', 'error'); return; }
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!confirm('¿Quitar la marca de apartado? Ya se verificó que no hay ningún apartado activo que lo respalde en la tabla de ventas.')) return;
  const result = await supabaseApi(`products?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ is_apartado: false }) });
  if (!result.ok) { toast('Error al quitar la marca de apartado', 'error'); return; }
  p.isApartado = false;
  toast('Marca de apartado quitada ✓', 'success');
  _qvRefresh(id);
  renderStats();
  renderTable();
}

function _qvToggleDesc() {
  const descEl = document.getElementById('qv-desc');
  const btn    = document.getElementById('qv-desc-toggle');
  if (!descEl || !btn) return;
  const expanding = !descEl.classList.contains('expanded');
  descEl.classList.toggle('expanded', expanding);
  btn.textContent = expanding ? 'Ver menos ↑' : 'Ver más ↓';
  _qvInfoScroll();
}

// Difumina la zona de botones cuando .qv-info tiene más contenido por debajo del fold
function _qvInfoScroll() {
  const info = document.querySelector('.qv-info');
  const actions = document.getElementById('qv-actions');
  if (!info || !actions) return;
  const overflows = info.scrollHeight > info.clientHeight + 1;
  const atEnd = info.scrollTop + info.clientHeight >= info.scrollHeight - 2;
  actions.classList.toggle('qv-fade-hidden', !overflows || atEnd);
}

// Cerrar QV con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('qv-overlay')?.classList.contains('open')) {
    closeQV();
  }
});

/* ── HISTORIAL POR PRODUCTO ────────────────────────────────────────────────
   Timeline de Actividad acotado a UN producto -- para investigar "¿por qué
   cambió este precio/stock, quién lo hizo?" sin buscar a mano en el feed
   general. Se crea el overlay dinámicamente (mismo patrón que #qv-zoom),
   consulta activity_log por meta.id = id del producto en las acciones que
   usan esa convención (producto_creado/editado/eliminado). */
const _PROD_TIMELINE_ACTIONS = 'producto_creado,producto_editado,producto_eliminado';

async function openProductTimeline(productId, productName) {
  document.getElementById('prod-timeline-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'prod-timeline-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:ap-in .15s ease';
  overlay.onclick = e => { if (e.target === overlay) closeProductTimeline(); };
  overlay.innerHTML = `
    <style>@keyframes ap-in{from{opacity:0}to{opacity:1}}</style>
    <div onclick="event.stopPropagation()" style="background:var(--surface);border-radius:18px;padding:18px;max-width:340px;width:90%;max-height:78vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.28)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <h3 style="font-size:1rem;margin:0">${QV_ICO_CLOCK(15)} Historial</h3>
        <button onclick="closeProductTimeline()" style="background:none;border:none;font-size:1.1rem;color:var(--muted);cursor:pointer;padding:4px" aria-label="Cerrar">✕</button>
      </div>
      <p style="font-size:.82rem;color:var(--muted);margin:0 0 12px;font-weight:600">${_esc(productName)}</p>
      <div id="prod-timeline-list" style="overflow-y:auto;flex:1;min-height:60px">
        <div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem">Cargando…</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const listEl = document.getElementById('prod-timeline-list');
  const result = await supabaseApi(`activity_log?select=action,summary,created_at,user_email,meta&meta->>id=eq.${productId}&action=in.(${_PROD_TIMELINE_ACTIONS})&order=created_at.asc`);
  if (!document.getElementById('prod-timeline-overlay')) return; // se cerró mientras cargaba
  if (!result.ok || !Array.isArray(result.data)) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);font-size:.85rem">No se pudo cargar el historial.</div>';
    return;
  }
  if (!result.data.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem">Sin eventos registrados para este producto.</div>';
    return;
  }
  listEl.innerHTML = result.data.map(ev => {
    const d = new Date(ev.created_at);
    const when = d.toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' }) + ' · ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const who = (ev.user_email || 'desconocido').split('@')[0];
    return `
<div style="border-left:2px solid var(--gold);padding:2px 0 14px 14px;margin-left:4px;position:relative">
  <span style="position:absolute;left:-5px;top:4px;width:8px;height:8px;border-radius:50%;background:var(--gold)"></span>
  <div style="font-size:.68rem;color:var(--muted);font-weight:600">${_esc(when)} · ${_esc(who)}</div>
  <div style="font-size:.85rem;color:#1C1817;margin-top:2px">${_esc(ev.summary)}</div>
</div>`;
  }).join('');
}

function closeProductTimeline() {
  document.getElementById('prod-timeline-overlay')?.remove();
}
