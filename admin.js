const SESSION_KEY = "te_admin_session";
const SUPABASE_URL = 'https://qxvrggmpaqhslgdmbhqw.supabase.co';
// Service role key: bypasea RLS — solo usar en admin, nunca en el sitio público
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4dnJnZ21wYXFoc2xnZG1iaHF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyNjIyNiwiZXhwIjoyMDk0MTAyMjI2fQ.B9nZ1KENDQsUtn9PFwiMTrXuMZuWWIphGnH8XPfeJjQ';

let products = [];
let deleteTargetId = null;
let selectedIds = new Set();
let dragSrcId = null;

const CAT_LABELS = {
  bolsos: "Bolsos & Mochilas",
  accesorios: "Accesorios",
  maquillaje: "Maquillaje",
  natura: "Natura"
};

const getSupabaseUrl = () => SUPABASE_URL;
const getSupabaseKey = () => SUPABASE_SERVICE_KEY;

function getFilteredProducts() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  const cat = document.getElementById('cat-filter')?.value || 'all';
  return products.filter(p => {
    const matchCat = cat === 'all' || p.category === cat;
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    return matchCat && matchQ;
  });
}

function supabaseApi(path, opts = {}) {
  return fetch(getSupabaseUrl() + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: getSupabaseKey(),
      Authorization: 'Bearer ' + getSupabaseKey(),
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(async r => {
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text || null; }
    return { ok: r.ok, status: r.status, data };
  });
}

/* ── HELPERS ── */
function setBtn(el, loading, text) {
  if (!el) return;
  if (loading) {
    el.dataset.loading = '1';
    if (text) { el.dataset.origText = el.textContent; el.textContent = text; }
  } else {
    delete el.dataset.loading;
    if (el.dataset.origText) { el.textContent = el.dataset.origText; delete el.dataset.origText; }
  }
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  if (localStorage.getItem(SESSION_KEY) === "1") {
    showApp();
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('form-overlay')?.classList.contains('open'))    { closeForm(); return; }
    if (document.getElementById('del-overlay')?.classList.contains('open'))     { closeDel(); return; }
    if (document.getElementById('revista-overlay')?.classList.contains('open')) { closeRevista(); }
  });
});

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
}

/* ── AUTH ── */
async function doLoginEmail() {
  const email = document.getElementById('email-input').value;
  const password = document.getElementById('pwd-input').value;
  const err = document.getElementById('pwd-err');
  const btn = document.querySelector('.btn-login');

  err.classList.remove('show');
  setBtn(btn, true, 'Verificando...');

  try {
    const result = await supabaseApi(
      `users?email=eq.${encodeURIComponent(email)}&select=id,password`,
      { method: 'GET' }
    );
    const data = result.data;
    const user = (result.ok && Array.isArray(data)) ? data[0] : null;
    if (!user || user.password !== password) {
      err.textContent = 'Credenciales incorrectas';
      err.classList.add('show');
      setBtn(btn, false);
      return;
    }
    localStorage.setItem(SESSION_KEY, "1");
    showApp();
  } catch (e) {
    err.textContent = 'Error de conexión: ' + e.message;
    err.classList.add('show');
    setBtn(btn, false);
  }
}

async function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

/* ── APP ── */
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  await loadProductsFromSupabase();
  renderStats();
  renderTable();
}

/* ── LOAD PRODUCTS ── */
async function loadProductsFromSupabase() {
  const result = await supabaseApi('products?select=*&order=position.asc');
  const data = result.data;
  if (result.ok && Array.isArray(data) && data.length) {
    products = data.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      categoryLabel: p.category_label,
      price: p.price,
      description: p.description,
      image: p.image,
      badge: p.badge,
      badgeType: p.badge_type,
      featured: p.featured,
      outOfStock: p.out_of_stock,
      originalPrice: p.original_price
    }));
    return;
  }
  products = [];
}

/* ── STATS ── */
function renderStats() {
  const cats = {};
  products.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
  const featured = products.filter(p => p.featured).length;
  const oos = products.filter(p => p.outOfStock).length;
  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="num">${products.length}</div><div class="lbl">Productos totales</div></div>
    <div class="stat-card"><div class="num" style="color:var(--red)">${oos}</div><div class="lbl">Agotados</div></div>
    <div class="stat-card"><div class="num">${featured}</div><div class="lbl">Destacados</div></div>
    <div class="stat-card"><div class="num">${cats.bolsos||0}</div><div class="lbl">Bolsos & Mochilas</div></div>
    <div class="stat-card"><div class="num">${(cats.accesorios||0)}</div><div class="lbl">Accesorios</div></div>
  `;
}

/* ── TABLE ── */
function renderTable() {
  const filtered = getFilteredProducts();

  const countEl = document.getElementById('prod-count');
  if (countEl) {
    if (products.length === 0) {
      countEl.style.display = 'none';
    } else {
      countEl.style.display = '';
      countEl.textContent = filtered.length === products.length
        ? `${products.length} producto${products.length !== 1 ? 's' : ''}`
        : `${filtered.length} de ${products.length}`;
    }
  }

  const tbody = document.getElementById('products-table');
  if (!filtered.length) {
    const isFiltered = (document.getElementById('search-input')?.value || '') ||
                       (document.getElementById('cat-filter')?.value !== 'all');
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
      <div class="es-icon">${isFiltered ? '🔍' : '📦'}</div>
      <p>${isFiltered ? 'Ningún producto coincide con el filtro.' : 'El catálogo está vacío.'}</p>
      ${!isFiltered ? `<button class="btn btn-gold btn-sm" onclick="openForm()">+ Agregar primer producto</button>` : ''}
    </div></td></tr>`;
    updateBulkBar();
    return;
  }

  const fallback = id => `https://picsum.photos/seed/${id+10}/80/80`;
  tbody.innerHTML = filtered.map(p => `
<tr draggable="true" data-id="${p.id}" class="${selectedIds.has(p.id) ? 'row-selected' : ''}">
  <td style="width:36px;text-align:center">
    <input type="checkbox" class="row-check" ${selectedIds.has(p.id) ? 'checked' : ''} onchange="toggleRowSelect(${p.id}, this.checked)">
  </td>
  <td>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
      <img class="prod-thumb" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
      <div>
        <div class="prod-name">${p.name}</div>
        <div class="prod-cat">#${p.id}</div>
      </div>
    </div>
  </td>
  <td>${p.categoryLabel}</td>
  <td class="price-cell">
    ${p.originalPrice ? `<span class="orig-price-cell">$${p.originalPrice.toLocaleString('es-MX')}</span>` : ''}
    $${p.price.toLocaleString('es-MX')}
  </td>
  <td>
    <button onclick="toggleOutOfStock(${p.id})" class="oos-cell ${p.outOfStock ? 'soldout' : 'available'}">
      ${p.outOfStock ? 'Agotado' : 'Disponible'}
    </button>
  </td>
  <td>${p.badge ? `<span class="badge badge-${p.badgeType||'none'}">${p.badge}</span>` : '<span style="color:#ccc">—</span>'}</td>
  <td>
    <button class="toggle-featured" onclick="toggleFeatured(${p.id})" title="${p.featured?'Quitar':'Destacar'}">
      ${p.featured ? '⭐' : '☆'}
    </button>
  </td>
  <td>
    <div class="actions">
      <button class="btn btn-outline btn-sm" onclick="openForm(${p.id})">Editar</button>
      <button class="btn btn-outline btn-sm" onclick="duplicateProduct(${p.id})" title="Duplicar">⧉</button>
      <button class="btn btn-red btn-sm" onclick="askDelete(${p.id})">✕</button>
    </div>
  </td>
</tr>`).join('');

  updateSelectAllCheckbox();
  initDragDrop();
}

/* ── SELECTION ── */
function toggleRowSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  const row = document.querySelector(`#products-table tr[data-id="${id}"]`);
  if (row) row.classList.toggle('row-selected', checked);
  updateBulkBar();
  updateSelectAllCheckbox();
}

function toggleSelectAll() {
  const filtered = getFilteredProducts();
  const allChecked = document.getElementById('select-all').checked;
  if (allChecked) filtered.forEach(p => selectedIds.add(p.id));
  else filtered.forEach(p => selectedIds.delete(p.id));

  document.querySelectorAll('#products-table .row-check').forEach(cb => {
    const id = parseInt(cb.closest('tr').dataset.id);
    cb.checked = selectedIds.has(id);
    cb.closest('tr').classList.toggle('row-selected', selectedIds.has(id));
  });
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-count');
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}`;
  } else {
    bar.style.display = 'none';
  }
}

function updateSelectAllCheckbox() {
  const filtered = getFilteredProducts();
  const checkbox = document.getElementById('select-all');
  if (!checkbox || !filtered.length) return;
  const allSelected = filtered.every(p => selectedIds.has(p.id));
  const someSelected = filtered.some(p => selectedIds.has(p.id));
  checkbox.checked = allSelected;
  checkbox.indeterminate = !allSelected && someSelected;
}

/* ── TOGGLE FEATURED — targeted PATCH ── */
async function toggleFeatured(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = !p.featured;
  const btn = document.querySelector(`tr[data-id="${id}"] .toggle-featured`);
  if (btn) btn.style.opacity = '0.35';

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ featured: newVal })
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar destacado', 'error');
    return;
  }
  p.featured = newVal;
  renderTable();
  renderStats();
  toast(newVal ? 'Marcado como destacado ⭐' : 'Quitado de destacados', 'success');
}

/* ── TOGGLE OUT OF STOCK — targeted PATCH ── */
async function toggleOutOfStock(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const newVal = !p.outOfStock;
  const btn = document.querySelector(`tr[data-id="${id}"] .oos-cell`);
  if (btn) btn.style.opacity = '0.35';

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ out_of_stock: newVal })
  });
  if (btn) btn.style.opacity = '';
  if (!result.ok) {
    toast('Error al actualizar estado de stock', 'error');
    return;
  }
  p.outOfStock = newVal;
  renderTable();
  renderStats();
  toast(newVal ? 'Marcado como agotado' : 'Marcado como disponible', 'success');
}

/* ── DUPLICATE — POST single product ── */
async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const maxId = products.reduce((m, x) => Math.max(m, x.id), 0);
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, outOfStock: false, position: products.length };
  products.push(copy);

  if (getSupabaseUrl()) {
    const result = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: copy.id, name: copy.name, category: copy.category,
        category_label: copy.categoryLabel, price: copy.price,
        description: copy.description, image: copy.image,
        badge: copy.badge, badge_type: copy.badgeType,
        featured: copy.featured, out_of_stock: copy.outOfStock,
        original_price: copy.originalPrice, position: copy.position
      })
    });
    if (!result.ok) {
      products.pop();
      toast('Error al duplicar en Supabase', 'error');
      return;
    }
  }

  renderTable();
  renderStats();
  toast('Producto duplicado — edítalo para personalizarlo', 'success');
}

/* ── DRAG & DROP REORDER ── */
function initDragDrop() {
  const rows = document.querySelectorAll('#products-table tr[data-id]');
  rows.forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = parseInt(row.dataset.id);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r => {
        r.classList.remove('drop-above','drop-below');
      });
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      if (parseInt(row.dataset.id) === dragSrcId) return;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      document.querySelectorAll('tr.drop-above,tr.drop-below').forEach(r => {
        r.classList.remove('drop-above','drop-below');
      });
      row.classList.add(e.clientY < mid ? 'drop-above' : 'drop-below');
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      const targetId = parseInt(row.dataset.id);
      if (targetId === dragSrcId) return;
      const srcIdx = products.findIndex(p => p.id === dragSrcId);
      const tgtIdx = products.findIndex(p => p.id === targetId);
      const isAbove = row.classList.contains('drop-above');
      const [item] = products.splice(srcIdx, 1);
      const insertAt = isAbove ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx) : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
      products.splice(insertAt, 0, item);
      toast('Guardando orden...', '');
      const ok = await save();
      if (ok) toast('Orden guardado ✓', 'success');
      renderTable();
    });
  });
}

/* ── BADGE DATALIST ── */
function populateBadgeList() {
  const datalist = document.getElementById('badge-options');
  if (!datalist) return;
  const defaults = ['Más vendido', 'Nuevo', 'Oferta', 'Natura', 'Favorito', 'Temporada', 'Exclusivo', 'Limitado'];
  const fromProducts = products.filter(p => p.badge).map(p => p.badge);
  const all = [...new Set([...defaults, ...fromProducts])];
  datalist.innerHTML = all.map(b => `<option value="${b}">`).join('');
}

/* ── IMAGE UPLOAD ── */
let imageUploadController = null;

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('save-btn').disabled = true;
  compressAndPreview(file);
}

function compressAndPreview(file) {
  if (imageUploadController) imageUploadController.abort();
  const controller = new AbortController();
  imageUploadController = controller;

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      if (controller.signal.aborted) return;
      const canvas = document.createElement('canvas');
      const MAX = 900;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const b64 = canvas.toDataURL('image/jpeg', 0.82);
      document.getElementById('f-image').value = b64;
      const preview = document.getElementById('f-img-preview');
      preview.src = b64;
      preview.classList.add('show');
      document.getElementById('save-btn').disabled = false;
    };
    img.onerror = () => {
      if (!controller.signal.aborted) toast('Error al procesar la imagen', 'error');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initImageUpload() {
  const zone = document.getElementById('img-upload-zone');
  if (!zone) return;
  zone.removeEventListener('click', zone._clickHandler);
  zone.removeEventListener('dragover', zone._dragoverHandler);
  zone.removeEventListener('dragleave', zone._dragleaveHandler);
  zone.removeEventListener('drop', zone._dropHandler);

  zone._clickHandler = () => document.getElementById('f-img-file').click();
  zone._dragoverHandler = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone._dragleaveHandler = () => zone.classList.remove('drag-over');
  zone._dropHandler = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      document.getElementById('save-btn').disabled = true;
      compressAndPreview(file);
    }
  };

  zone.addEventListener('click', zone._clickHandler);
  zone.addEventListener('dragover', zone._dragoverHandler);
  zone.addEventListener('dragleave', zone._dragleaveHandler);
  zone.addEventListener('drop', zone._dropHandler);
}

/* ── FORM ── */
function openForm(id) {
  populateBadgeList();
  const overlay = document.getElementById('form-overlay');
  document.getElementById('form-title').textContent = id ? 'Editar producto' : 'Agregar producto';

  if (id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('f-id').value = p.id;
    document.getElementById('f-name').value = p.name;
    document.getElementById('f-category').value = p.category;
    document.getElementById('f-category-label').value = p.categoryLabel;
    document.getElementById('f-price').value = p.price;
    document.getElementById('f-original-price').value = p.originalPrice || '';
    document.getElementById('f-badge').value = p.badge || '';
    document.getElementById('f-badge-type').value = p.badgeType || '';
    document.getElementById('f-description').value = p.description;
    document.getElementById('f-image').value = p.image;
    document.getElementById('f-featured').checked = p.featured;
    document.getElementById('f-out-of-stock').checked = p.outOfStock || false;
    previewImg();
  } else {
    document.getElementById('f-id').value = '';
    document.getElementById('f-name').value = '';
    document.getElementById('f-category').value = 'bolsos';
    document.getElementById('f-category-label').value = CAT_LABELS.bolsos;
    document.getElementById('f-price').value = '';
    document.getElementById('f-original-price').value = '';
    document.getElementById('f-badge').value = '';
    document.getElementById('f-badge-type').value = '';
    document.getElementById('f-description').value = '';
    document.getElementById('f-image').value = '';
    document.getElementById('f-featured').checked = false;
    document.getElementById('f-out-of-stock').checked = false;
    document.getElementById('f-img-preview').classList.remove('show');
    document.getElementById('f-img-file').value = '';
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initImageUpload();
  document.getElementById('save-btn').disabled = false;
  setTimeout(() => document.getElementById('f-name').focus(), 100);
}

function closeForm() {
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function syncCategoryLabel() {
  const cat = document.getElementById('f-category').value;
  document.getElementById('f-category-label').value = CAT_LABELS[cat] || '';
}

function previewImg() {
  const url = document.getElementById('f-image').value.trim();
  const preview = document.getElementById('f-img-preview');
  if (url) {
    preview.src = url;
    preview.classList.add('show');
    preview.onerror = () => preview.classList.remove('show');
  } else {
    preview.classList.remove('show');
  }
}

/* ── SAVE PRODUCT — targeted PATCH or single POST ── */
async function saveProduct() {
  const name = document.getElementById('f-name').value.trim();
  const price = parseFloat(document.getElementById('f-price').value);
  const image = document.getElementById('f-image').value.trim();
  const description = document.getElementById('f-description').value.trim();

  if (!name || isNaN(price) || !description) {
    toast('Completa nombre, precio y descripción.', 'error');
    return;
  }

  const idVal = document.getElementById('f-id').value;
  const badge = document.getElementById('f-badge').value.trim();
  const origPrice = parseFloat(document.getElementById('f-original-price').value) || null;
  const data = {
    name,
    category: document.getElementById('f-category').value,
    categoryLabel: document.getElementById('f-category-label').value.trim() || CAT_LABELS[document.getElementById('f-category').value],
    price,
    originalPrice: (origPrice && origPrice > price) ? origPrice : null,
    description,
    image: image || `https://picsum.photos/seed/${Date.now()}/500/500`,
    badge: badge || null,
    badgeType: document.getElementById('f-badge-type').value || null,
    featured: document.getElementById('f-featured').checked,
    outOfStock: document.getElementById('f-out-of-stock').checked
  };

  const dbPayload = {
    name: data.name,
    category: data.category,
    category_label: data.categoryLabel,
    price: data.price,
    description: data.description,
    image: data.image,
    badge: data.badge,
    badge_type: data.badgeType,
    featured: data.featured,
    out_of_stock: data.outOfStock,
    original_price: data.originalPrice
  };

  const saveBtn = document.getElementById('save-btn');
  setBtn(saveBtn, true, idVal ? 'Actualizando...' : 'Guardando...');

  if (idVal) {
    const idx = products.findIndex(p => p.id === parseInt(idVal));
    if (idx > -1) products[idx] = { ...products[idx], ...data };

    if (getSupabaseUrl()) {
      const result = await supabaseApi(`products?id=eq.${idVal}`, {
        method: 'PATCH',
        body: JSON.stringify(dbPayload)
      });
      if (!result.ok) {
        setBtn(saveBtn, false);
        const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
        toast(`Error al actualizar: ${errMsg}`, 'error');
        return;
      }
    }
  } else {
    const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
    const newProduct = { id: maxId + 1, ...data, position: products.length };
    products.push(newProduct);

    const result = await supabaseApi('products', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: newProduct.id, ...dbPayload, position: newProduct.position })
    });
    if (!result.ok) {
      products.pop();
      setBtn(saveBtn, false);
      const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
      toast(`Error al guardar: ${errMsg}`, 'error');
      return;
    }
  }

  closeForm();
  renderTable();
  renderStats();
  toast(idVal ? 'Producto actualizado ✓' : 'Producto agregado ✓', 'success');
}

/* ── DELETE ── */
function askDelete(id) {
  deleteTargetId = id;
  document.getElementById('del-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDel() {
  deleteTargetId = null;
  document.getElementById('del-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function confirmDelete() {
  if (deleteTargetId === null) return;
  const id = deleteTargetId;
  const btn = document.getElementById('del-confirm-btn');
  setBtn(btn, true, 'Eliminando...');

  const result = await supabaseApi(`products?id=eq.${id}`, {
    method: 'DELETE',
    headers: { 'Prefer': 'return=minimal' }
  });
  if (!result.ok) {
    setBtn(btn, false);
    const msg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
    toast('Error al eliminar: ' + msg, 'error');
    closeDel();
    return;
  }

  products = products.filter(p => p.id !== id);
  selectedIds.delete(id);
  closeDel();
  renderTable();
  renderStats();
  updateBulkBar();
  toast('Producto eliminado', 'success');
}

/* ── SAVE — batch upsert (usado para reorder e import) ── */
async function save() {
  if (!products.length) return true;

  const payload = products.map((p, i) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    category_label: p.categoryLabel,
    price: p.price,
    description: p.description,
    image: p.image,
    badge: p.badge,
    badge_type: p.badgeType,
    featured: p.featured,
    out_of_stock: p.outOfStock,
    original_price: p.originalPrice,
    position: i
  }));

  const result = await supabaseApi('products', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });

  if (!result.ok) {
    const errMsg = result.data?.message || result.data?.hint || result.data?.details || `HTTP ${result.status}`;
    toast(`Error al guardar: ${errMsg}`, 'error');
    console.error('Supabase save error:', result.status, result.data);
    return false;
  }
  return true;
}

/* ── BULK ACTIONS ── */

async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`¿Eliminar ${selectedIds.size} producto(s) seleccionado(s)?\nEsta acción no se puede deshacer.`)) return;

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    });
    if (!result.ok) {
      const msg = result.data?.message || `HTTP ${result.status}`;
      toast('Error al eliminar: ' + msg, 'error');
      return;
    }
  }

  products = products.filter(p => !selectedIds.has(p.id));
  selectedIds.clear();
  renderTable();
  renderStats();
  updateBulkBar();
  toast('Productos eliminados', 'success');
}

async function bulkSetCategory() {
  if (!selectedIds.size) return;
  const options = Object.entries(CAT_LABELS).map(([k,v]) => `  ${k} → ${v}`).join('\n');
  const cat = prompt(`Nueva categoría para ${selectedIds.size} producto(s):\n\n${options}\n\nEscribe el código:`);
  if (cat === null) return;
  const category = cat.trim().toLowerCase();
  if (!CAT_LABELS[category]) {
    toast('Categoría inválida. Opciones: bolsos, accesorios, maquillaje, natura', 'error');
    return;
  }
  const categoryLabel = CAT_LABELS[category];

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ category, category_label: categoryLabel })
    });
    if (!result.ok) {
      toast('Error al actualizar categoría', 'error');
      return;
    }
  }

  products.forEach(p => {
    if (selectedIds.has(p.id)) { p.category = category; p.categoryLabel = categoryLabel; }
  });
  renderTable();
  renderStats();
  toast(`Categoría "${categoryLabel}" aplicada a ${selectedIds.size} producto(s)`, 'success');
}

async function bulkToggleFeatured() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  // Si todos son destacados → quitar. En cualquier otro caso → destacar todos.
  const newVal = !selected.every(p => p.featured);

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ featured: newVal })
    });
    if (!result.ok) {
      toast('Error al actualizar destacados', 'error');
      return;
    }
  }

  selected.forEach(p => { p.featured = newVal; });
  renderTable();
  renderStats();
  toast(newVal ? `${selectedIds.size} producto(s) marcados como destacados ⭐` : `Destacado removido de ${selectedIds.size} producto(s)`, 'success');
}

async function bulkToggleOOS() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  // Si todos agotados → marcar disponibles. En cualquier otro caso → marcar agotados.
  const newVal = !selected.every(p => p.outOfStock);

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ out_of_stock: newVal })
    });
    if (!result.ok) {
      toast('Error al actualizar estado de stock', 'error');
      return;
    }
  }

  selected.forEach(p => { p.outOfStock = newVal; });
  renderTable();
  renderStats();
  toast(newVal ? `${selectedIds.size} producto(s) marcados como agotados` : `${selectedIds.size} producto(s) marcados como disponibles`, 'success');
}

async function bulkSetBadge() {
  if (!selectedIds.size) return;
  const badge = prompt(`Insignia para ${selectedIds.size} producto(s) (vacío para quitar):`);
  if (badge === null) return;
  const finalBadge = badge.trim() || null;

  let finalType = null;
  if (finalBadge) {
    const typeInput = prompt('Tipo de color:\n  best  → Dorada\n  new   → Negra\n  promo → Roja\n  natura→ Verde\n\nEscribe el tipo:');
    if (typeInput === null) return;
    finalType = ['best','new','promo','natura'].includes(typeInput.trim()) ? typeInput.trim() : null;
  }

  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ badge: finalBadge, badge_type: finalType })
    });
    if (!result.ok) {
      toast('Error al actualizar insignia', 'error');
      return;
    }
  }

  products.forEach(p => {
    if (selectedIds.has(p.id)) { p.badge = finalBadge; p.badgeType = finalType; }
  });
  renderTable();
  toast(finalBadge
    ? `Insignia "${finalBadge}" aplicada a ${selectedIds.size} producto(s)`
    : `Insignias eliminadas de ${selectedIds.size} producto(s)`, 'success');
}

function bulkExport() {
  if (!selectedIds.size) return;
  const selected = products.filter(p => selectedIds.has(p.id));
  const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tres-encantos-seleccion-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast(`${selected.length} producto(s) exportados ✓`, 'success');
}

/* ── EXPORT / IMPORT ── */
function exportProducts() {
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tres-encantos-productos-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importProducts(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const raw = JSON.parse(e.target.result);
      if (!Array.isArray(raw) || !raw.length) {
        toast('Archivo inválido o vacío', 'error');
        return;
      }

      // Normalizar — acepta camelCase (export del admin) y snake_case (export de Supabase)
      const imported = raw.map((p, i) => ({
        id: p.id,
        name: p.name || '',
        category: p.category || 'bolsos',
        categoryLabel: p.categoryLabel || p.category_label || CAT_LABELS[p.category] || '',
        price: Number(p.price) || 0,
        originalPrice: p.originalPrice ?? p.original_price ?? null,
        description: p.description || '',
        image: p.image || '',
        badge: p.badge || null,
        badgeType: p.badgeType || p.badge_type || null,
        featured: Boolean(p.featured),
        outOfStock: Boolean(p.outOfStock ?? p.out_of_stock),
        position: p.position ?? i
      }));

      const newCount    = imported.filter(p => !products.find(x => x.id === p.id)).length;
      const updateCount = imported.length - newCount;

      const lines = [`Importar ${imported.length} producto(s) del archivo:`];
      if (newCount)    lines.push(`  • ${newCount} nuevo(s) se agregarán`);
      if (updateCount) lines.push(`  • ${updateCount} existente(s) se actualizarán`);
      lines.push('\nLos productos que no están en el archivo se conservarán.');
      if (!confirm(lines.join('\n'))) return;

      toast(`Importando ${imported.length} productos...`, '');

      // Upsert solo los productos del archivo — los demás permanecen intactos en Supabase
      const payload = imported.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        category_label: p.categoryLabel,
        price: p.price,
        description: p.description,
        image: p.image,
        badge: p.badge,
        badge_type: p.badgeType,
        featured: p.featured,
        out_of_stock: p.outOfStock,
        original_price: p.originalPrice,
        position: p.position
      }));

      const result = await supabaseApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload)
      });

      if (!result.ok) {
        const errMsg = result.data?.message || result.data?.hint || `HTTP ${result.status}`;
        toast(`Error al importar: ${errMsg}`, 'error');
        console.error('Import error:', result.status, result.data);
        return;
      }

      // Merge en el array local: actualizar existentes + agregar nuevos al final
      const merged = [...products];
      for (const p of imported) {
        const idx = merged.findIndex(x => x.id === p.id);
        if (idx > -1) merged[idx] = p;
        else merged.push(p);
      }
      products = merged;

      selectedIds.clear();
      renderTable();
      renderStats();
      updateBulkBar();
      const summary = [
        newCount    ? `${newCount} agregado(s)` : '',
        updateCount ? `${updateCount} actualizado(s)` : ''
      ].filter(Boolean).join(', ');
      toast(`Importación completa: ${summary} ✓`, 'success');
    } catch {
      toast('Archivo inválido. Usa un JSON exportado de esta página.', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

/* ── TOAST ── */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  const duration = type === 'error' ? 5000 : type === '' ? 1500 : 3000;
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

/* ── REVISTA ── */
function openRevista() {
  const overlay = document.getElementById('revista-overlay');
  document.getElementById('revista-url-input').value = '';
  document.getElementById('revista-preview').style.display = 'none';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  initRevistaUpload();
}

function closeRevista() {
  document.getElementById('revista-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function initRevistaUpload() {
  const zone = document.getElementById('revista-upload-zone');
  if (!zone) return;
  zone.removeEventListener('click', zone._clickHandler);
  zone.removeEventListener('dragover', zone._dragoverHandler);
  zone.removeEventListener('dragleave', zone._dragleaveHandler);
  zone.removeEventListener('drop', zone._dropHandler);

  zone._clickHandler = () => document.getElementById('revista-file').click();
  zone._dragoverHandler = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone._dragleaveHandler = () => zone.classList.remove('drag-over');
  zone._dropHandler = e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processRevistaFile(file);
  };

  zone.addEventListener('click', zone._clickHandler);
  zone.addEventListener('dragover', zone._dragoverHandler);
  zone.addEventListener('dragleave', zone._dragleaveHandler);
  zone.addEventListener('drop', zone._dropHandler);
}

function handleRevistaFile(input) {
  const file = input.files[0];
  if (!file) return;
  processRevistaFile(file);
}

function processRevistaFile(file) {
  if (file.type !== 'application/pdf') { toast('Solo se permiten archivos PDF', 'error'); return; }
  if (file.size > 50 * 1024 * 1024) { toast('El PDF es muy grande. Máx 50MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('revista-url-input').value = '';
    document.getElementById('revista-preview').style.display = 'block';
    document.getElementById('revista-filename').textContent = file.name;
    document.getElementById('revista-file')._base64 = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearRevistaFile() {
  document.getElementById('revista-file').value = '';
  document.getElementById('revista-file')._base64 = null;
  document.getElementById('revista-preview').style.display = 'none';
}

async function saveRevista() {
  const urlInput = document.getElementById('revista-url-input');
  const fileInput = document.getElementById('revista-file');
  const b64 = fileInput._base64;
  const url = urlInput.value.trim();

  if (!b64 && !url) { toast('Ingresa una URL o sube un PDF', 'error'); return; }

  const value = b64 || url;

  const result = await supabaseApi('config', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'revista_url', value })
  });
  if (!result.ok || result.data?.error) {
    toast('Error al guardar en Supabase', 'error');
    return;
  }

  closeRevista();
  toast('Revista guardada correctamente ✓', 'success');
}
