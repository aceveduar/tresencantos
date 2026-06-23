/* ══ KIT BUILDER ════════════════════════════════════════════════════════ */
let _kbComponents = [];
let _kbImageDataUrl = null;
let _kbSelectedCatCode = '';

const KIT_DEFAULT_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23FFF8EE'/%3E%3Ctext x='50' y='62' font-size='52' text-anchor='middle' dominant-baseline='middle'%3E%F0%9F%8E%81%3C/text%3E%3C/svg%3E`;

function _kbAutoSuggestCat() {
  if (_kbSelectedCatCode) return;
  const raw = (document.getElementById('kb-name')?.value || '').toLowerCase();
  const name = raw.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!name || name.length < 3) return;

  const words = name.split(/\s+/).filter(w => w.length > 2);
  // subcategorías primero (más específicas)
  const ordered = [...categories].sort((a, b) => (a.parent ? -1 : 1));
  let match = null;
  for (const cat of ordered) {
    const label = cat.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const code  = cat.code.toLowerCase();
    if (words.some(w => label.includes(w) || code.includes(w))) { match = cat; break; }
  }
  // fallback: natura
  if (!match) match = categories.find(c => c.code === 'natura') || categories.find(c => c.code.startsWith('natura'));
  if (match) {
    _kbSelectedCatCode = match.code;
    _updateKitCatBtn(match.code);
  }
}

function openKitBuilder() {
  try {
    if (!can.addProduct) { toast('Sin permiso para agregar productos', 'error'); return; }
    _kbComponents = [];
    _kbImageDataUrl = null;
    _kbSelectedCatCode = '';
    const byId = id => document.getElementById(id);
    byId('kb-name').value = '';
    byId('kb-price').value = '';
    byId('kb-search').value = '';
    byId('kb-search-results').style.display = 'none';
    byId('kb-search-results').innerHTML = '';
    byId('kb-stock-preview').textContent = '';
    byId('kb-save-btn').disabled = false;
    byId('kb-save-btn').textContent = 'Guardar Kit →';
    byId('kb-save-btn').onclick = _saveKit;
    byId('kb-img-preview').style.display = 'none';
    byId('kb-img-placeholder').style.display = 'flex';
    byId('kb-img-remove').style.display = 'none';
    byId('kb-img-input').value = '';
    byId('kb-price-hint').style.display = 'none';
    const kbDot = byId('kb-cat-dot');
    const kbLbl = byId('kb-cat-label-display');
    if (kbDot) kbDot.style.background = '#9B8B78';
    if (kbLbl) kbLbl.textContent = 'Seleccionar categoría';
    _kbRenderComponents();
    _kbUpdateStock();
    const kbo = byId('kit-builder-overlay');
    kbo.style.display = 'flex';
    kbo.classList.add('kb-open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => byId('kb-name').focus(), 250);
  } catch(e) { toast('Error al abrir Kit Builder: ' + e.message, 'error'); }
}

function closeKitBuilder() {
  const el = document.getElementById('kit-builder-overlay');
  el.classList.remove('kb-open');
  el.style.display = 'none';
  document.body.style.overflow = '';
}

function _closeKitBuilderSafe() {
  const name  = document.getElementById('kb-name')?.value.trim();
  const price = document.getElementById('kb-price')?.value.trim();
  const hasData = name || price || _kbComponents.length > 0 || _kbImageDataUrl;
  if (hasData && !confirm('¿Descartar el kit? Perderás lo que llevas ingresado.')) return;
  closeKitBuilder();
}

function _kbToggleBelow(show) {
  const comps = document.getElementById('kb-components');
  const stock = document.getElementById('kb-stock-preview');
  const count = document.getElementById('kb-comp-count');
  const btn   = document.getElementById('kb-save-btn');
  if (comps) comps.style.display = show ? '' : 'none';
  if (stock) stock.style.display = show ? '' : 'none';
  if (count) count.textContent = !show && _kbComponents.length ? `· ${_kbComponents.length} agregados` : '';
  if (btn) {
    if (!show && _kbComponents.length) {
      btn.textContent = `✓ Ver ${_kbComponents.length} componente${_kbComponents.length > 1 ? 's' : ''}`;
      btn.onclick = _kbCloseSearch;
    } else {
      btn.textContent = 'Guardar Kit →';
      btn.onclick = _saveKit;
    }
  }
}

function _kbCloseSearch() {
  const search = document.getElementById('kb-search');
  const clear = document.getElementById('kb-search-clear');
  if (search) search.value = '';
  if (clear) clear.style.display = 'none';
  document.getElementById('kb-search-results').style.display = 'none';
  _kbToggleBelow(true);
}

function _kbSearch(q) {
  const res = document.getElementById('kb-search-results');
  const term = (q || '').toLowerCase().trim();
  if (!term) { res.style.display = 'none'; _kbToggleBelow(true); return; }
  const taken = new Set(_kbComponents.map(c => c.id));
  const matches = products.filter(p =>
    !Array.isArray(p.kitItems) && !taken.has(p.id) &&
    p.name.toLowerCase().includes(term)
  ).sort((a, b) => {
    const aOos = a.outOfStock || a.stock === 0;
    const bOos = b.outOfStock || b.stock === 0;
    return aOos - bOos; // con stock primero
  }).slice(0, 8);
  const termEncoded = encodeURIComponent(term);
  const createBtn = `
    <div class="kb-result-item" onclick="_kbCreateDraft(decodeURIComponent('${termEncoded}'))">
      <div style="width:36px;height:36px;border-radius:7px;background:var(--gold-light);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">➕</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.84rem;font-weight:600;color:var(--gold-dark)">Crear "${term}" como borrador</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:1px">Stock 0 · Sin publicar · editar después</div>
      </div>
    </div>`;

  if (!matches.length) {
    res.innerHTML = createBtn;
    res.style.display = 'block'; return;
  }
  res.innerHTML = matches.map(p => {
    const isOos = p.outOfStock || p.stock === 0;
    const stockTxt = isOos
      ? `<span style="color:var(--red)">⚠️ Agotado — se puede agregar igual</span>`
      : `${p.stock} en stock`;
    return `
    <div class="kb-result-item" onclick="_kbAddComponent(${p.id})" style="${isOos ? 'opacity:.75' : ''}">
      <img src="${_driveSz(p.image, 80)}" style="width:36px;height:36px;object-fit:cover;border-radius:7px;flex-shrink:0;background:#F0EBE3" onerror="this.src='${DEFAULT_IMG}'">
      <div style="flex:1;min-width:0">
        <div style="font-size:.84rem;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${_esc(p.name)}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:1px">${stockTxt}</div>
      </div>
      <span style="font-size:.75rem;color:var(--gold);font-weight:700;flex-shrink:0">+ agregar</span>
    </div>`;
  }).join('') + createBtn;
  res.style.display = 'block';
  _kbToggleBelow(false);
  document.getElementById('kb-search')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

async function _kbCreateDraft(name) {
  const newId = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const draft = {
    id: newId, name, category: 'por_revisar', category_label: 'Por revisar',
    price: 0, description: '', stock: 0, out_of_stock: true, is_published: false,
    featured: false, image: DEFAULT_IMG, position: products.length
  };
  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(draft)
  });
  if (!result.ok) { toast('Error al crear borrador', 'error'); return; }
  // Agregar al array local con el shape normalizado
  products.push({
    id: newId, name, category: 'por_revisar', categoryLabel: 'Por revisar',
    price: 0, stock: 0, outOfStock: true, isPublished: false,
    image: DEFAULT_IMG, position: products.length - 1
  });
  logActivity('producto_creado', `Borrador de kit: "${name}" — $0`, { id: newId, name, price: 0 });
  document.getElementById('kb-search').value = '';
  document.getElementById('kb-search-results').style.display = 'none';
  _kbAddComponent(newId);
  toast(`✓ "${name}" creado como borrador`);
}

async function _kbHandleImageFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  await _kbSetImageFromFile(file);
}

async function _kbSetImageFromFile(file) {
  const dataUrl = await _fileToBase64Resized(file);
  _kbImageDataUrl = dataUrl;
  const preview = document.getElementById('kb-img-preview');
  preview.src = dataUrl; preview.style.display = 'block';
  document.getElementById('kb-img-placeholder').style.display = 'none';
  document.getElementById('kb-img-remove').style.display = 'block';
}

/* ── PEGAR IMAGEN DESDE PORTAPAPELES (Ctrl+V / Cmd+V) ── */
document.addEventListener('paste', async e => {
  const file = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))?.getAsFile();
  if (!file) return;

  const formOpen = document.getElementById('form-overlay')?.classList.contains('open');
  const kbOpen   = document.getElementById('kit-builder-overlay')?.classList.contains('open');

  if (formOpen) {
    // No pegar si el foco está en un input de texto
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    addImagesToForm([file]);
    toast('Imagen pegada desde portapapeles');
  } else if (kbOpen) {
    e.preventDefault();
    await _kbSetImageFromFile(file);
    toast('Imagen pegada desde portapapeles');
  }
});

function _kbRemoveImage() {
  _kbImageDataUrl = null;
  document.getElementById('kb-img-preview').style.display = 'none';
  document.getElementById('kb-img-placeholder').style.display = 'flex';
  document.getElementById('kb-img-remove').style.display = 'none';
  document.getElementById('kb-img-input').value = '';
}

function _kbSuggestPrice() {
  const hint = document.getElementById('kb-price-hint');
  if (!_kbComponents.length) { hint.style.display = 'none'; return; }
  const sum = _kbComponents.reduce((t, c) => {
    const p = products.find(x => x.id === c.id);
    return t + (p?.price || 0) * c.qty;
  }, 0);
  if (!sum) { hint.style.display = 'none'; return; }
  hint.style.display = 'block';
  hint.innerHTML = `Suma de componentes: <strong>$${sum.toLocaleString('es-MX')}</strong> · <a href="#" onclick="event.preventDefault();document.getElementById('kb-price').value=${sum};this.parentElement.style.display='none'" style="color:var(--gold);text-decoration:none;font-weight:600">Usar este precio</a>`;
  const priceEl = document.getElementById('kb-price');
  if (!priceEl.value) priceEl.value = sum;
}

function _kbAddComponent(id) {
  const p = products.find(x => x.id === id);
  if (!p || _kbComponents.find(c => c.id === id)) return;
  _kbComponents.push({ id: p.id, name: p.name, qty: 1, stock: p.stock, image: p.image, oos: p.outOfStock || p.stock === 0 });
  const searchEl = document.getElementById('kb-search');
  const q = searchEl.value.trim();
  if (q) _kbSearch(q); else { searchEl.value = ''; document.getElementById('kb-search-results').style.display = 'none'; }
  _kbRenderComponents();
  _kbUpdateStock();
  _kbSuggestPrice();
}

function _kbRemoveComponent(id) {
  _kbComponents = _kbComponents.filter(c => c.id !== id);
  _kbRenderComponents();
  _kbUpdateStock();
  _kbSuggestPrice();
}

function _kbChangeQty(id, delta) {
  const c = _kbComponents.find(x => x.id === id);
  if (!c) return;
  c.qty = Math.max(1, c.qty + delta);
  _kbRenderComponents();
  _kbUpdateStock();
  _kbSuggestPrice();
}

function _kbRenderComponents() {
  const el = document.getElementById('kb-components');
  if (!_kbComponents.length) {
    el.innerHTML = '<div style="text-align:center;padding:14px;color:var(--muted);font-size:.8rem;border:1.5px dashed var(--border);border-radius:10px">Busca productos arriba para agregarlos al kit</div>';
    return;
  }
  el.innerHTML = _kbComponents.map(c => `
    <div class="kb-comp">
      <img src="${c.image || DEFAULT_IMG}" style="width:44px;height:44px;object-fit:cover;border-radius:9px;flex-shrink:0;cursor:zoom-in" onerror="this.src='${DEFAULT_IMG}'" onclick="_kitCompPopover(${c.id},event)" title="Ver producto">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="_kitCompPopover(${c.id},event)" title="Ver producto">
        <div style="font-size:.84rem;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${_esc(c.name)}</div>
        ${c.oos ? `<div style="font-size:.7rem;color:var(--red);margin-top:2px">⚠️ Agotado — disponibilidad calculada cuando haya stock</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
        <button class="kb-qty-btn" onclick="_kbChangeQty(${c.id},-1)">−</button>
        <span style="font-size:.9rem;font-weight:700;min-width:22px;text-align:center">${c.qty}</span>
        <button class="kb-qty-btn" onclick="_kbChangeQty(${c.id},1)">+</button>
        <button class="kb-qty-btn" onclick="_kbRemoveComponent(${c.id})" style="border-color:#FECACA;background:#FEF2F2;color:var(--red)">✕</button>
      </div>
    </div>`).join('');
}

function _kbUpdateStock() {
  const el = document.getElementById('kb-stock-preview');
  if (!_kbComponents.length) { el.textContent = ''; return; }
  const avail = Math.min(..._kbComponents.map(c => Math.floor(c.stock / c.qty)));
  el.textContent = avail > 0
    ? `📦 ${avail} kit${avail !== 1 ? 's' : ''} disponibles con el stock actual`
    : '⚠️ Sin stock suficiente con el inventario actual';
  el.style.color = avail > 0 ? 'var(--green)' : 'var(--red)';
}

async function _saveKit() {
  const name  = document.getElementById('kb-name').value.trim();
  const price = parseFloat(document.getElementById('kb-price').value);
  if (!name)                      { toast('Escribe el nombre del kit', 'error'); document.getElementById('kb-name').focus(); return; }
  if (isNaN(price) || price < 0) { toast('Escribe un precio válido', 'error'); document.getElementById('kb-price').focus(); return; }

  const catCode = _kbSelectedCatCode || '';
  if (!catCode) { toast('Selecciona una categoría', 'error'); return; }
  const catObj   = categories.find(c => c.code === catCode);
  const catLabel = catObj?.label || catCode;
  const newId    = products.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const position = products.length;
  const isPublished = can.publishProduct ? true : false;
  const kitItems = _kbComponents.map(c => ({ id: c.id, name: c.name, qty: c.qty, image: c.image || null }));

  const btn = document.getElementById('kb-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';

  let kitImage = KIT_DEFAULT_IMG;
  if (_kbImageDataUrl) {
    const uploaded = await uploadToDrive(_kbImageDataUrl);
    kitImage = uploaded || _kbImageDataUrl;
  }

  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: newId, name, category: catCode, category_label: catLabel,
      price, description: '', image: kitImage,
      badge: '🎁 Kit', badge_type: 'new', featured: false,
      out_of_stock: false, original_price: null,
      barcode: null, stock: 0, cost: null,
      is_published: isPublished, kit_items: kitItems, images: null, position
    })
  });

  if (!result.ok) {
    const errMsg = result.data?.message || result.data?.hint || result.data?.details || `HTTP ${result.status}`;
    toast(`Error al guardar kit: ${errMsg}`, 'error');
    btn.disabled = false; btn.textContent = 'Guardar Kit →';
    return;
  }

  products.push({
    id: newId, name, category: catCode, categoryLabel: catLabel,
    price, originalPrice: null, description: null, image: kitImage,
    badge: '🎁 Kit', badgeType: 'new', featured: false, outOfStock: false,
    barcode: null, stock: 0, cost: null, isPublished, kitItems, images: null, position
  });
  _trackEdit(newId);
  logActivity('producto_creado', `Creó kit "${name}" — $${price.toLocaleString('es-MX')}`, { id: newId, name, price });
  closeKitBuilder();
  // Resetear filtros para que el kit siempre sea visible al crearlo
  const cf = document.getElementById('cat-filter');
  if (cf) cf.value = 'all';
  _statFilter = null;
  renderTable();
  renderStats();
  toast(`🎁 Kit "${name}" creado`, '');
}

