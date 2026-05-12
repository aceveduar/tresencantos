const SESSION_KEY = "te_admin_session";
const SUPABASE_URL_KEY = "te_supabase_url";
const SUPABASE_ANON_KEY_LS = "te_supabase_anon_key";

let products = [];
let deleteTargetId = null;

const CAT_LABELS = {
  bolsos: "Bolsos & Mochilas",
  accesorios: "Accesorios",
  maquillaje: "Maquillaje",
  natura: "Natura"
};

const getSupabaseUrl = () => localStorage.getItem(SUPABASE_URL_KEY) || '';
const getSupabaseKey = () => localStorage.getItem(SUPABASE_ANON_KEY_LS) || '';

const DEFAULT_PRODUCTS = [
  {
    id:1, name:"Bolso Glamour Camel",
    category:"bolsos", categoryLabel:"Bolsos & Carteras",
    price:380,
    description:"Bolso de dama en piel sintética premium. Diseño elegante con cierre metálico dorado. Cabe cartera, celular, llaves y lo esencial.",
    image:"https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=500&q=80",
    badge:"Más vendido", badgeType:"best", featured:true
  },
  {
    id:2, name:"Perfume Natura Essencial Feminino",
    category:"natura", categoryLabel:"Natura",
    price:498,
    description:"Fragancia floral irresistible. Notas de jazmín, rosa y sándalo. Larga duración, perfecta para el día y la noche.",
    image:"https://images.unsplash.com/photo-1590156206657-aec67f4dc4a7?auto=format&fit=crop&w=500&q=80",
    badge:"Natura", badgeType:"natura", featured:true
  },
  {
    id:3, name:"Set Aretes Dorados Flor",
    category:"accesorios", categoryLabel:"Accesorios",
    price:120,
    description:"Aretes de flor con baño en oro. Ligeros y cómodos para uso diario. Incluye 3 pares en distintos tamaños. No dañan la piel.",
    image:"https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=500&q=80",
    badge:"Nuevo", badgeType:"new", featured:true
  },
  {
    id:4, name:"Kit Maquillaje Natural Look",
    category:"maquillaje", categoryLabel:"Maquillaje",
    price:650,
    description:"Kit completo para el look natural perfecto. Base, rubor, sombras nude, labial y pincel. Fórmula suave y larga duración.",
    image:"https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=500&q=80",
    badge:"Favorito", badgeType:"best", featured:true
  },
  {
    id:5, name:"Mochila Trendy Canvas",
    category:"bolsos", categoryLabel:"Bolsos & Mochilas",
    price:320,
    description:"Mochila de canvas resistente con diseño moderno. Compartimentos organizados, tirantes ajustables y bolsillo frontal con cierre.",
    image:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=500&q=80",
    badge:null, badgeType:null, featured:true
  },
  {
    id:6, name:"Set Pulseras Boho Chic",
    category:"accesorios", categoryLabel:"Accesorios",
    price:180,
    description:"Set de 7 pulseras con diseño boho. Mezcla de macramé, perlas y metal dorado. Se usan juntas o por separado.",
    image:"https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=500&q=80",
    badge:"Oferta", badgeType:"promo", featured:true
  },
  {
    id:7, name:"Crema Natura Ekos Ucuuba",
    category:"natura", categoryLabel:"Natura",
    price:280,
    description:"Crema corporal hidratante con extracto de ucuuba amazónica. Textura suave y aterciopelada. Piel suave desde la primera aplicación.",
    image:"https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=500&q=80",
    badge:"Natura", badgeType:"natura", featured:false
  },
  {
    id:8, name:"Sombrero Verano Chic",
    category:"accesorios", categoryLabel:"Accesorios",
    price:220,
    description:"Sombrero de ala ancha con lazo decorativo. Material de paja trenzada premium. Perfecto para playa, campo o paseo en ciudad.",
    image:"https://images.unsplash.com/photo-1572307480813-ceb0e59d8325?auto=format&fit=crop&w=500&q=80",
    badge:"Temporada", badgeType:"new", featured:false
  },
  {
    id:9, name:"Lonchera Térmica Floral",
    category:"bolsos", categoryLabel:"Loncheras",
    price:250,
    description:"Lonchera isotérmica con diseño floral. Mantiene alimentos fríos o calientes 6 horas. Fácil limpieza, asa para llevar.",
    image:"https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=500&q=80",
    badge:null, badgeType:null, featured:false
  },
  {
    id:10, name:"Diadema Terciopelo Elegante",
    category:"accesorios", categoryLabel:"Accesorios",
    price:85,
    description:"Diadema de terciopelo suave con lazo decorativo. Para looks casuales y formales. Disponible en varios colores.",
    image:"https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=500&q=80",
    badge:null, badgeType:null, featured:false
  },
  {
    id:11, name:"Labial Natura Una Línea",
    category:"maquillaje", categoryLabel:"Maquillaje",
    price:195,
    description:"Labial de alta cobertura con acabado sedoso. Fórmula hidratante con vitamina E. Duración de hasta 8 horas.",
    image:"https://images.unsplash.com/photo-1586495777744-4e6232bf4e0c?auto=format&fit=crop&w=500&q=80",
    badge:"Natura", badgeType:"natura", featured:false
  },
  {
    id:12, name:"Cadenita Dorada Estrella",
    category:"accesorios", categoryLabel:"Accesorios",
    price:95,
    description:"Cadenita fina con dije de estrella en baño de oro de 18k. Cierre de mosquetón. Ideal para regalar o usar a diario.",
    image:"https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=500&q=80",
    badge:"Nuevo", badgeType:"new", featured:false
  }
];

function supabaseApi(path, opts = {}) {
  return fetch(getSupabaseUrl() + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: getSupabaseKey(),
      Authorization: 'Bearer ' + getSupabaseKey(),
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })));
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  if (localStorage.getItem(SESSION_KEY) === "1" && getSupabaseUrl() && getSupabaseKey()) {
    showApp();
  }
});

function showAuthScreen() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

function showSetupScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'flex';
  document.getElementById('setup-url').value = localStorage.getItem(SUPABASE_URL_KEY) || '';
  document.getElementById('setup-key').value = localStorage.getItem(SUPABASE_ANON_KEY_LS) || '';
}

/* ── AUTH ── */
async function doLoginEmail() {
  const email = document.getElementById('email-input').value;
  const password = document.getElementById('pwd-input').value;
  const err = document.getElementById('pwd-err');

  if (!getSupabaseUrl() || !getSupabaseKey()) {
    err.textContent = 'Configura Supabase primero';
    err.classList.add('show');
    return;
  }

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
      return;
    }

    localStorage.setItem(SESSION_KEY, "1");
    showApp();
  } catch (e) {
    err.textContent = 'Error de conexión: ' + e.message;
    err.classList.add('show');
  }
}

async function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

/* ── SETUP SUPABASE ── */
function openSetupModal() {
  document.getElementById('setup-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('setup-url').value = localStorage.getItem(SUPABASE_URL_KEY) || '';
  document.getElementById('setup-key').value = localStorage.getItem(SUPABASE_ANON_KEY_LS) || '';
  document.getElementById('setup-url-modal').value = localStorage.getItem(SUPABASE_URL_KEY) || '';
  document.getElementById('setup-key-modal').value = localStorage.getItem(SUPABASE_ANON_KEY_LS) || '';
}

function closeSetup() {
  document.getElementById('setup-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveSetup() {
  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();

  if (!url || !key) {
    toast('Completa ambos campos', 'error');
    return;
  }

  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY_LS, key);

  toast('Verificando conexión...', '');
  showAuthScreen();

  try {
    const res = await fetch(url + '/rest/v1/', {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (res.ok) {
      toast('Supabase configurado y conexión verificada ✓', 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      toast('Error ' + res.status + ': ' + (err.message || 'verifica URL y key'), 'error');
    }
  } catch (e) {
    toast('No se pudo conectar: ' + e.message, 'error');
  }
}

/* ── APP ── */
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  await loadProductsFromSupabase();
  renderStats();
  renderTable();
}

/* ── LOAD PRODUCTS ── */
async function loadProductsFromSupabase() {
  if (getSupabaseUrl() && getSupabaseKey()) {
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
  }
  try {
    const saved = localStorage.getItem('te_products_v1');
    products = saved ? JSON.parse(saved) : [...DEFAULT_PRODUCTS];
  } catch {
    products = [...DEFAULT_PRODUCTS];
  }
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
async function toggleFeatured(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  p.featured = !p.featured;
  await save();
  renderTable();
  renderStats();
  toast(p.featured ? 'Marcado como destacado ⭐' : 'Quitado de destacados', 'success');
}

/* ── TOGGLE OUT OF STOCK ── */
async function toggleOutOfStock(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  p.outOfStock = !p.outOfStock;
  await save();
  renderTable();
  renderStats();
  toast(p.outOfStock ? 'Marcado como agotado' : 'Marcado como disponible', 'success');
}

/* ── DUPLICATE ── */
async function duplicateProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const maxId = products.reduce((m, x) => Math.max(m, x.id), 0);
  const copy = { ...p, id: maxId + 1, name: 'Copia de ' + p.name, outOfStock: false };
  products.push(copy);
  await save();
  renderTable();
  renderStats();
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
      await save();
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

  if (idVal) {
    const idx = products.findIndex(p => p.id === parseInt(idVal));
    if (idx > -1) products[idx] = { ...products[idx], ...data };
  } else {
    const maxId = products.reduce((m, p) => Math.max(m, p.id), 0);
    products.push({ id: maxId + 1, ...data });
  }

  await save();
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
  products = products.filter(p => p.id !== deleteTargetId);
  await save();
  closeDel();
  renderTable();
  renderStats();
  toast('Producto eliminado', 'success');
}

/* ── SAVE ── */
async function save() {
  if (getSupabaseUrl() && getSupabaseKey()) {
    let hasError = false;
    for (const p of products) {
      const result = await supabaseApi('products', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
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
          position: products.indexOf(p)
        })
      });
      if (!result.ok) {
        console.error('Error guardando producto:', p.name, result);
        hasError = true;
      }
    }
    if (hasError) {
      toast('Error al guardar en Supabase. ¿RLS activado?', 'error');
    }
    return;
  }
  localStorage.setItem('te_products_v1', JSON.stringify(products));
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
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error();
      products = data;
      await save();
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

async function resetProducts() {
  if (!confirm('¿Restablecer todos los productos al catálogo de demostración? Se perderán los cambios.')) return;
  products = [...DEFAULT_PRODUCTS];
  await save();
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
    if (file && file.type === 'application/pdf') {
      processRevistaFile(file);
    }
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
  if (file.type !== 'application/pdf') {
    toast('Solo se permiten archivos PDF', 'error');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    toast('El PDF es muy grande. Máx 50MB.', 'error');
    return;
  }
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

  if (!b64 && !url) {
    toast('Ingresa una URL o sube un PDF', 'error');
    return;
  }

  const value = b64 || url;

  if (getSupabaseUrl() && getSupabaseKey()) {
    const result = await supabaseApi('config', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'revista_url', value: value })
    });
    if (!result.ok || result.data?.error) {
      toast('Error al guardar en Supabase', 'error');
      return;
    }
  } else {
    localStorage.setItem('te_revista_v1', value);
  }

  closeRevista();
  toast('Revista guardada correctamente ✓', 'success');
}