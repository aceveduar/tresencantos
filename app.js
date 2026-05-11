const WA = "5215534548417";
const WA_BASE = `https://wa.me/${WA}`;
const STORAGE_KEY = "te_products_v1";
const REVISTA_KEY = "te_revista_v1";

const SUPABASE_URL = localStorage.getItem('te_supabase_url') || '';
const SUPABASE_ANON_KEY = localStorage.getItem('te_supabase_anon_key') || '';

let products = [];
let revistaUrl = "";

function supabaseApi(path, opts = {}) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...opts.headers
    }
  }).then(r => r.json());
}

async function loadProducts() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const data = await supabaseApi('products?select=*&order=position.asc');
    if (Array.isArray(data) && data.length) {
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
    const saved = localStorage.getItem(STORAGE_KEY);
    products = saved ? JSON.parse(saved) : [...DEFAULT_PRODUCTS];
  } catch { products = [...DEFAULT_PRODUCTS]; }
}

async function loadRevista() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const data = await supabaseApi('config?id=eq.revista_url&select=value');
    if (Array.isArray(data) && data.length) {
      revistaUrl = data[0].value;
      return;
    }
  }
  try {
    const saved = localStorage.getItem(REVISTA_KEY);
    revistaUrl = saved || "https://www.natura.com.mx/catalogos-digitales";
  } catch {
    revistaUrl = "https://www.natura.com.mx/catalogos-digitales";
  }
}

function updateRevistaLink() {
  const link = document.getElementById("revista-link");
  if (link) link.href = revistaUrl;
}

const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.374 0 0 5.373 0 12c0 2.124.553 4.118 1.522 5.85L.057 23.499l5.772-1.513A11.94 11.94 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.799c-1.891 0-3.653-.507-5.18-1.394l-.371-.22-3.422.897.914-3.329-.242-.384A9.783 9.783 0 012.2 12c0-5.404 4.396-9.799 9.8-9.799 5.403 0 9.798 4.395 9.798 9.8 0 5.403-4.395 9.798-9.798 9.798z"/></svg>`;

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

let products = [];
let currentFilter = "all";
let activeProduct = null;

const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();
  await loadRevista();
  render();
  renderNatura();
  updateRevistaLink();
  renderHeroVisual();
  renderHeroMobileStrip();
  initFilters();
  initNav();
  initReveal();
  initModal();
});

function loadProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    products = saved ? JSON.parse(saved) : [...DEFAULT_PRODUCTS];
  } catch { products = [...DEFAULT_PRODUCTS]; }
}

/* ── RENDER CATALOG ── */
function render() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  const list = currentFilter === 'all' ? products : products.filter(p => p.category === currentFilter);
  if (!list.length) {
    grid.innerHTML = `<div class="empty-msg"><div class="em-icon">🛍️</div><p>No hay productos aquí todavía.<br>¡Escríbenos y te decimos qué tenemos!</p></div>`;
    return;
  }
  grid.innerHTML = list.map(cardHTML).join('');
  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

function cardHTML(p) {
  const badge = p.badge ? `<span class="product-badge badge-${p.badgeType||'best'}">${p.badge}</span>` : '';
  const oosTag = p.outOfStock ? `<span class="product-badge badge-oos" style="background:#9B8B78">Agotado</span>` : '';
  const fallback = `https://picsum.photos/seed/${p.id+10}/500/500`;
  const priceHTML = p.originalPrice
    ? `<div class="product-price"><s class="price-before">$${p.originalPrice.toLocaleString('es-MX')}</s> $${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`
    : `<div class="product-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>`;
  const buyBtn = p.outOfStock
    ? `<button class="btn-buy btn-buy-oos" disabled>Agotado</button>`
    : `<button class="btn-buy" onclick="event.stopPropagation();whatsapp(${p.id})">${WA_SVG} Pedir</button>`;
  return `
<article class="product-card reveal${p.outOfStock ? ' card-oos' : ''}" onclick="${p.outOfStock ? '' : `openModal(${p.id})`}">
  <div class="product-img-wrap">
    <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">
    ${badge}${oosTag}
  </div>
  <div class="product-body">
    <p class="product-cat">${p.categoryLabel}</p>
    <h3>${p.name}</h3>
    <p class="product-desc">${p.description}</p>
    <div class="product-footer">
      ${priceHTML}
      ${buyBtn}
    </div>
  </div>
</article>`;
}

/* ── HERO MOBILE STRIP ── */
function renderHeroMobileStrip() {
  const container = document.getElementById('hero-mobile-strip');
  if (!container) return;
  const items = products.filter(p => p.featured);
  if (!items.length) return;
  const fallback = id => `https://picsum.photos/seed/${id+10}/200/200`;
  container.innerHTML = `<div class="hms-inner">${
    items.map(p => `
<div class="hms-card" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="hms-info">
    <div class="hms-name">${p.name}</div>
    <div class="hms-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`).join('')
  }</div>`;
}

/* ── HERO VISUAL ── */
function renderHeroVisual() {
  const container = document.getElementById('hero-visual');
  if (!container) return;
  const ORDER = [1, 3, 4]; // bolso, aretes, maquillaje — los más visuales primero
  const items = ORDER.map(id => products.find(p => p.id === id)).filter(Boolean);
  if (!items.length) return;
  const fallback = id => `https://picsum.photos/seed/${id+10}/300/300`;
  container.innerHTML = items.map(p => `
<div class="hc" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="hc-info">
    <div class="hc-name">${p.name}</div>
    <div class="hc-price">$${p.price.toLocaleString('es-MX')} MXN</div>
  </div>
</div>`).join('');
}

/* ── RENDER NATURA GRID ── */
function renderNatura() {
  const grid = document.getElementById('natura-grid');
  if (!grid) return;
  const naturaList = products.filter(p => p.category === 'natura').slice(0, 4);
  if (!naturaList.length) { grid.style.display = 'none'; return; }
  const fallback = id => `https://picsum.photos/seed/${id+20}/500/500`;
  grid.innerHTML = naturaList.map(p => `
<div class="nc-card reveal" onclick="openModal(${p.id})">
  <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src='${fallback(p.id)}'">
  <div class="nc-info">
    <div class="nc-name">${p.name}</div>
    <div class="nc-price">$${p.price.toLocaleString('es-MX')}</div>
  </div>
</div>`).join('');
  grid.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ── FILTERS ── */
function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      render();
    });
  });
}

function filterTo(cat) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === cat));
  render();
  document.getElementById('productos')?.scrollIntoView({ behavior:'smooth' });
}

/* ── WHATSAPP ── */
function whatsapp(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const msg = `¡Hola Tres Encantos!\n\nMe interesa este producto:\n\n*${p.name}*\nPrecio: $${p.price.toLocaleString('es-MX')} MXN\n\n${p.description}\n\n¿Está disponible?`;
  window.open(`${WA_BASE}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── MODAL ── */
function initModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function openModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  activeProduct = p;
  const fallback = `https://picsum.photos/seed/${p.id+10}/500/500`;
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
<div class="modal" role="dialog" aria-modal="true">
  <div class="modal-img-wrap">
    <img class="modal-img" src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='${fallback}'">
    <button class="modal-close" onclick="closeModal()">✕</button>
  </div>
  <div class="modal-body">
    <p class="modal-cat">${p.categoryLabel}</p>
    <h2 class="modal-title">${p.name}</h2>
    <p class="modal-desc">${p.description}</p>
    <div class="modal-foot">
      <div class="modal-price">$${p.price.toLocaleString('es-MX')} <small>MXN</small></div>
      <button class="btn btn-wa" onclick="whatsapp(${p.id})">${WA_SVG} Pedir por WhatsApp</button>
    </div>
  </div>
</div>`;
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  activeProduct = null;
}

/* ── NAV ── */
function initNav() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  toggle?.addEventListener('click', () => {
    links.classList.toggle('open');
    toggle.classList.toggle('open');
  });
  links?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    links.classList.remove('open');
    toggle.classList.remove('open');
  }));
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav')) {
      links?.classList.remove('open');
      toggle?.classList.remove('open');
    }
  });
}

/* ── SCROLL REVEAL ── */
function initReveal() {
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => header?.classList.toggle('scrolled', window.scrollY > 20), { passive:true });
}
