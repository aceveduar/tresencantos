const ADMIN_PASS = "tres3ncantos";
const SESSION_KEY = "te_admin_session";

const CAT_LABELS = {
  bolsos: "Bolsos & Mochilas",
  accesorios: "Accesorios",
  maquillaje: "Maquillaje",
  natura: "Natura"
};

let deleteTargetId = null;

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem(SESSION_KEY) === "1") showApp();
});

function doLogin() {
  const val = document.getElementById('pwd-input').value;
  const err = document.getElementById('pwd-err');
  if (val === ADMIN_PASS) {
    sessionStorage.setItem(SESSION_KEY, "1");
    err.classList.remove('show');
    showApp();
  } else {
    err.classList.add('show');
    document.getElementById('pwd-input').value = '';
    document.getElementById('pwd-input').focus();
  }
}

function doLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  loadProducts();
  renderStats();
  renderTable();
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
    <div class="stat-card"><div class="num">${featured}</div><div class="lbl">En sección Natura</div></div>
    <div class="stat-card"><div class="num">${cats.bolsos||0}</div><div class="lbl">Bolsos & Mochilas</div></div>
    <div class="stat-card"><div class="num">${(cats.accesorios||0)}</div><div class="lbl">Accesorios</div></div>
  `;
}

/* ── TABLE ── */
function renderTable() {
  const q = document.getElementById('search-input')?.value.toLowerCase() || '';
  const cat = document.getElementById('cat-filter')?.value || 'all';
  const filtered = products.filter(p => {
    const matchCat = cat === 'all' || p.category === cat;
    const matchQ = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const tbody = document.getElementById('products-table');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No se encontraron productos.</td></tr>`;
    return;
  }

  const fallback = id => `https://picsum.photos/seed/${id+10}/80/80`;
  tbody.innerHTML = filtered.map(p => `
<tr draggable="true" data-id="${p.id}">
  <td><span class="drag-handle" title="Arrastrar para reordenar">⠿</span></td>
  <td>
    <div style="display:flex;align-items:center;gap:12px">
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

  initDragDrop();
}

/* ── TOGGLE FEATURED ── */
function toggleFeatured(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  p.featured = !p.featured;
  save(); renderTable(); renderStats();
  toast(p.featured ? 'Marcado como destacado ⭐' : 'Quitado de destacados', 'success');
}

/* ── TOGGLE OUT OF STOCK ── */
function toggleOutOfStock(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  p.outOfStock = !p.outOfStock;
  save(); renderTable(); renderStats();
  toast(p.outOfStock ? 'Marcado como agotado' : 'Marcado como disponible', 'success');
}

/* ── DUPLICATE ── */
function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const maxId = products.reduce((m, x) => Math.max(m, x.id), 0);
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, outOfStock: false };
  products.push(copy);
  save(); renderTable(); renderStats();
  toast('Producto duplicado — edítalo para personalizarlo', 'success');
}

/* ── DRAG & DROP REORDER ── */
let dragSrcId = null;

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
    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = parseInt(row.dataset.id);
      if (targetId === dragSrcId) return;
      const srcIdx = products.findIndex(p => p.id === dragSrcId);
      const tgtIdx = products.findIndex(p => p.id === targetId);
      const isAbove = row.classList.contains('drop-above');
      const [item] = products.splice(srcIdx, 1);
      const insertAt = isAbove ? (srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx) : (srcIdx < tgtIdx ? tgtIdx : tgtIdx + 1);
      products.splice(insertAt, 0, item);
      save(); renderTable();
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
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  compressAndPreview(file);
}

function compressAndPreview(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
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
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initImageUpload() {
  const zone = document.getElementById('img-upload-zone');
  if (!zone) return;
  zone.addEventListener('click', () => document.getElementById('f-img-file').click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) compressAndPreview(file);
  });
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

function saveProduct() {
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

  if (idVal) {
    const idx = products.findIndex(p => p.id === parseInt(idVal));
    if (idx > -1) products[idx] = { ...products[idx], ...data };
  } else {
    const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
    products.push({ id: maxId + 1, ...data });
  }

  save();
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

function confirmDelete() {
  if (deleteTargetId === null) return;
  products = products.filter(p => p.id !== deleteTargetId);
  save();
  closeDel();
  renderTable();
  renderStats();
  toast('Producto eliminado', 'success');
}

/* ── SAVE ── */
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
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
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error();
      products = data;
      save();
      renderTable();
      renderStats();
      toast(`${data.length} productos importados ✓`, 'success');
    } catch {
      toast('Archivo inválido. Usa un JSON exportado de esta página.', 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function resetProducts() {
  if (!confirm('¿Restablecer todos los productos al catálogo de demostración? Se perderán los cambios.')) return;
  products = [...DEFAULT_PRODUCTS];
  save();
  renderTable();
  renderStats();
  toast('Catálogo restablecido ✓', 'success');
}

/* ── TOAST ── */
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}


