/* ── QUICK VIEW ── */
let _qvCurrentId = null;

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
  btnCancel.style.cssText = 'padding:9px 14px;background:#fff;color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;touch-action:manipulation;font-family:inherit';

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
  btnCancel.style.cssText = 'padding:10px 14px;background:#fff;color:var(--muted);border:1.5px solid var(--border);border-radius:8px;font-size:.84rem;cursor:pointer;touch-action:manipulation;font-family:inherit';

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

    // En mobile: el panel sigue el dedo en tiempo real
    if (_qvSwipeDir === 'v' && window.innerWidth <= 600) {
      const panel = document.getElementById('qv-panel');
      if (panel) {
        panel.style.transition = 'none';
        // Hacia arriba: resistencia (efecto rubber band al 25%)
        panel.style.transform = `translateY(${dy > 0 ? dy : dy * 0.25}px)`;
        _qvDragging = true;
      }
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

    if (dir === 'h' && Math.abs(dx) >= 40) {
      // ← → Navegar entre productos (no en galería)
      if (panel) { panel.style.transition = ''; panel.style.transform = ''; }
      if (!e.target.closest('.qv-gallery')) qvNavigate(dx < 0 ? 1 : -1);

    } else if (dir === 'v' && dy > 72) {
      // ↓ suficiente → cerrar
      _qvCloseWithAnim('down');

    } else if (wasDragging && panel) {
      // No llegó al umbral → rebotar de vuelta con spring
      panel.style.transition = 'transform .38s cubic-bezier(.34,1.56,.64,1)';
      panel.style.transform  = 'translateY(0)';
      setTimeout(() => { panel.style.transition = ''; panel.style.transform = ''; }, 380);
    }
  }, { passive: true });
}

function _qvCloseWithAnim(dir) {
  const panel = document.getElementById('qv-panel');
  if (panel) {
    panel.style.transition = 'transform .32s cubic-bezier(.4,0,1,1), opacity .28s ease';
    panel.style.transform  = dir === 'down' ? 'translateY(105%)' : 'translateY(-48px) scale(.95)';
    panel.style.opacity    = '0';
  }
  setTimeout(() => {
    closeQV();
    if (panel) { panel.style.transition = ''; panel.style.transform = ''; panel.style.opacity = ''; }
  }, 300);
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
  const existing = document.getElementById('kit-comp-popup');
  if (existing) { existing.remove(); if (existing.dataset.forId == id) return; }
  const popup = document.createElement('div');
  popup.id = 'kit-comp-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.22);padding:0;overflow:hidden;width:250px;animation:kcp-in .18s ease';
  popup.innerHTML = '<style>@keyframes kcp-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}</style>';
  document.body.appendChild(popup);
  // Posicionar junto al elemento que se clickeó
  const r = triggerEl.getBoundingClientRect();
  const pw = 250, ph = 320;
  let top = r.top + window.scrollY - ph - 8;
  let left = r.left + window.scrollX + r.width / 2 - pw / 2;
  if (top < 8) top = r.bottom + window.scrollY + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
  _kitCompPopupRender(id);
  const close = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('pointerdown', close); } };
  setTimeout(() => document.addEventListener('pointerdown', close), 10);
}

function _kitCompPopupRender(id) {
  const popup = document.getElementById('kit-comp-popup');
  if (!popup) return;
  const comp = products.find(x => x.id === id);
  if (!comp) return;
  popup.dataset.forId = id;
  const kit = products.find(x => x.id === _qvCurrentId);
  const kitComps = kit?.kitItems || [];
  const idx = kitComps.findIndex(c => c.id === id);
  const total = kitComps.length;
  const hasPrev = idx > 0;
  const hasNext = idx < total - 1;
  const stockTxt = comp.outOfStock || comp.stock === 0
    ? '<span style="color:#E85D5D;font-size:.72rem;font-weight:600">● Agotado</span>'
    : `<span style="color:#2D6A4F;font-size:.72rem;font-weight:600">● ${comp.stock} en stock</span>`;
  const navBtn = s => `width:28px;height:28px;background:rgba(0,0,0,.45);border:none;border-radius:50%;font-size:.9rem;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;line-height:1;z-index:1;position:absolute;top:50%;margin-top:-14px;${s}`;
  popup.innerHTML = `
    <style>@keyframes kcp-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}</style>
    <button onclick="document.getElementById('kit-comp-popup')?.remove()" style="${navBtn('right:8px;top:8px;margin-top:0')}">✕</button>
    ${hasPrev ? `<button onclick="event.stopPropagation();_kitCompPopupNav(-1)" style="${navBtn('left:6px')}">‹</button>` : ''}
    ${hasNext ? `<button onclick="event.stopPropagation();_kitCompPopupNav(1)"  style="${navBtn('right:6px')}">›</button>` : ''}
    <img src="${_driveSz(comp.image || DEFAULT_IMG, 400)}" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'" style="width:100%;height:230px;object-fit:contain;background:#F7F2EB;display:block">
    <div style="padding:8px 12px 12px;display:flex;flex-direction:column;gap:5px">
      <div style="font-size:.84rem;font-weight:700;color:#1C1817;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(comp.name)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        ${stockTxt}
        <span style="font-size:.75rem;color:var(--muted)">$${(comp.price||0).toLocaleString('es-MX')}</span>
      </div>
      ${total > 1 ? `<div style="text-align:center;font-size:.7rem;color:var(--muted-light);margin-top:1px">${idx+1} / ${total}</div>` : ''}
      ${can.editProduct ? `<a href="#" onclick="event.preventDefault();_openFormFromKitQV(${comp.id})" style="font-size:.73rem;color:var(--gold);text-align:center;text-decoration:none;font-weight:600">✏️ Editar producto →</a>` : ''}
    </div>`;
}

function _kitCompPopupNav(dir) {
  const popup = document.getElementById('kit-comp-popup');
  if (!popup) return;
  const kit = products.find(x => x.id === _qvCurrentId);
  if (!kit?.kitItems?.length) return;
  const currentId = parseInt(popup.dataset.forId);
  const idx = kit.kitItems.findIndex(c => c.id === currentId);
  const next = idx + dir;
  if (next < 0 || next >= kit.kitItems.length) return;
  _kitCompPopupRender(kit.kitItems[next].id);
}

// Teclado: ← → Esc cuando el QV está abierto
document.addEventListener('keydown', e => {
  if (!_qvCurrentId) return;
  const tag = document.activeElement?.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  // Si el popup de componente está abierto, las flechas navegan entre componentes del kit
  if (document.getElementById('kit-comp-popup')) {
    if (e.key === 'ArrowRight' && !isEditing) { e.stopImmediatePropagation(); _kitCompPopupNav(1); return; }
    if (e.key === 'ArrowLeft'  && !isEditing) { e.stopImmediatePropagation(); _kitCompPopupNav(-1); return; }
    if (e.key === 'Escape') { document.getElementById('kit-comp-popup')?.remove(); return; }
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
    ? `<span class="qv-chip qv-chip-hidden" ${_pubClick}>🙈 Oculto</span>`
    : p.outOfStock
      ? `<span class="qv-chip qv-chip-warn">⚠️ Agotado</span>`
      : `<span class="qv-chip qv-chip-web" ${_pubClick}>🌐 Web</span>`;
  const oosChip  = oos
    ? `<span class="qv-chip qv-chip-sold">⊘ Agotado</span>`
    : `<span class="qv-chip qv-chip-ok">✓ Disponible</span>`;
  const stockCls = p.stock === 0 ? 'qv-chip-sold' : p.stock === 1 ? '' : 'qv-chip-ok';
  const featChip    = p.featured ? `<span class="qv-chip">⭐ Destacado</span>` : '';
  const barcodeChip = p.barcode  ? `<span class="qv-chip">🔲 ${_esc(p.barcode)}</span>` : '';
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
      stockChipQV = `<span class="qv-chip qv-chip-sold">🎁 Sin componentes</span>`;
    } else if (ki?.stock === 0) {
      const lbl = ki.blocker ? (ki.blocker.length > 16 ? ki.blocker.slice(0, 15) + '…' : ki.blocker) : '?';
      stockChipQV = `<span class="qv-chip qv-chip-sold" title="Falta: ${ki.blocker ?? 'componente agotado'}">🎁 Falta: ${lbl}</span>`;
    } else {
      const n = ki?.stock ?? 0;
      stockChipQV = `<span class="qv-chip qv-chip-ok">🎁 ${n} kit${n !== 1 ? 's' : ''}</span>`;
    }
  } else {
    const stockLbl = p.stock === 0 ? 'Sin stock' : p.stock === 1 ? '1 · Última' : `${p.stock} en stock`;
    stockChipQV = `<span class="qv-chip ${stockCls} qv-editable" onclick="editStockInline(event,${p.id},this)" ontouchstart="event.stopPropagation()" title="Toca para editar stock" style="cursor:pointer">${stockLbl}</span>`;
  }
  document.getElementById('qv-chips').innerHTML =
    oosChip + pubChip + stockChipQV + featChip + marginChip;

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
      kitZone.innerHTML = `<div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">🎁 Incluye</div>` +
        p.kitItems.map(item => {
          const comp = products.find(x => x.id === item.id);
          const clickable = comp ? `onclick="_kitCompPopup(${comp.id},this)" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-light);cursor:pointer;border-radius:6px;transition:background .15s" onmouseenter="this.style.background='var(--gold-light)'" onmouseleave="this.style.background=''"` : `style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-light)"`;
          return `<div ${clickable}>
            <img src="${_driveSz(comp?.image || DEFAULT_IMG, 80)}" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#F0EBE3" onerror="this.onerror=null;this.src='${DEFAULT_IMG}'">
            <span style="flex:1;font-size:.82rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${comp?.name || item.name}</span>
            <span style="font-size:.75rem;color:var(--muted);font-weight:600;flex-shrink:0">×${item.qty}</span>
          </div>`;
        }).join('');
    } else if (Array.isArray(p.kitItems)) {
      kitZone.style.display = '';
      kitZone.innerHTML = `<div style="text-align:center;padding:12px;color:var(--muted);font-size:.82rem;border:1.5px dashed var(--border);border-radius:10px">🎁 Kit sin componentes · edita para agregar productos</div>`;
    } else {
      kitZone.style.display = 'none';
      kitZone.innerHTML = '';
    }
  }

  // Zona de flag
  const flagData = _flagItem(p.id);
  const flagZone = document.getElementById('qv-flag-zone');
  if (flagZone) {
    if (flagData) {
      const d = new Date(flagData.ts);
      const dateStr = d.toLocaleDateString('es-MX', { day:'numeric', month:'short' }) +
                      ' ' + d.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      flagZone.innerHTML = `
        <div class="qv-flag-active">
          <span class="qv-flag-title">🚩 Pendiente de revisión</span>
          ${flagData.note ? `<p class="qv-flag-note-text">"${_esc(flagData.note)}"</p>` : ''}
          <span class="qv-flag-ts">Marcado el ${dateStr}</span>
        </div>`;
    } else {
      flagZone.innerHTML = '';
    }
  }

  // ID + barcode en una línea
  const idEl = document.getElementById('qv-id');
  idEl.innerHTML = `<span style="font-family:monospace">ID #${p.id}</span>${p.barcode ? `<span style="font-family:monospace;color:var(--muted)">· ${_esc(p.barcode)}</span>` : ''}`;

  // Botones de acción
  const btnEdit = can.editProduct
    ? `<button class="qv-btn qv-btn-edit" onclick="closeQV();openForm(${p.id})">${ICON_EDIT} Editar</button>`
    : '';
  const btnDup  = `<button class="qv-btn qv-btn-dup" onclick="closeQV();duplicateProduct(${p.id})">⧉ Duplicar</button>`;
  const btnPub  = can.publishProduct
    ? `<button class="qv-btn qv-btn-pub" onclick="_qvTogglePublished(${p.id})">${p.isPublished === false ? '🌐 Publicar' : '🙈 Ocultar'}</button>`
    : '';
  const btnDel  = can.deleteProduct
    ? `<button class="qv-btn qv-btn-del" onclick="closeQV();askDelete(${p.id})">✕ Eliminar</button>`
    : '';
  const btnFlag = flagData
    ? `<button class="qv-btn qv-btn-flagdone" onclick="unflagProduct(${p.id})">✓ Revisado</button>`
    : `<button class="qv-btn qv-btn-flag"    onclick="_qvShowFlagForm(${p.id})">🚩 Revisar</button>`;
  const btnTop = can.editProduct
    ? `<button class="qv-btn qv-btn-dup" onclick="moveToTop(${p.id})">📌 Al inicio</button>`
    : '';
  const btnAddKit = can.editProduct && !Array.isArray(p.kitItems)
    ? `<button class="qv-btn qv-btn-dup" onclick="_openAddToKit([${p.id}])">🎁 A un kit</button>`
    : '';
  const btnArchive = can.deleteProduct
    ? (_showingArchived
        ? `<button class="qv-btn qv-btn-archive" onclick="restoreProduct(${p.id})">↩ Restaurar</button>`
        : `<button class="qv-btn qv-btn-archive" onclick="archiveProduct(${p.id})">🗄 Archivar</button>`)
    : '';
  const actionsEl = document.getElementById('qv-actions');
  actionsEl.removeAttribute('style');
  // Orden: Editar · Duplicar · Ocultar/Publicar / Al inicio · A un kit · Revisar · Archivar / Eliminar
  actionsEl.innerHTML = btnEdit + btnDup + btnPub + btnTop + btnAddKit + btnFlag + btnArchive + btnDel;
}

async function _qvTogglePublished(id) {
  await togglePublished(id);
  _qvRefresh(id);
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
