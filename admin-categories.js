/* ── CATEGORY MANAGER ─────────────────────────────────────────────────── */

function populateCatParentSelect() {
  const sel = document.getElementById('new-cat-parent');
  if (!sel) return;
  sel.innerHTML = `<option value="">— Es categoría raíz —</option>` +
    rootCats().map(r => `<option value="${r.code}">${r.label}</option>`).join('');
}

function openCatManager() {
  document.getElementById('cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCatManagerList();
  populateCatParentSelect();
}

function closeCatManager() {
  document.getElementById('cat-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCatManagerList() {
  const el = document.getElementById('cat-list');
  if (!el) return;
  if (!categories.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:.84rem;text-align:center;padding:12px">Sin categorías</p>';
    return;
  }
  const roots = rootCats();
  let html = '';
  roots.forEach(r => {
    const ri = categories.indexOf(r);
    const subs = subCats(r.code);
    const parentOpts = roots.map(x => `<option value="${x.code}"${x.code===r.code?' selected':''}>${x.label}</option>`).join('');
    html += `
<div class="cat-mgr-root" draggable="true" data-code="${r.code}"
     ondragstart="_catDragStart(event,'root','${r.code}')"
     ondragover="_catDragOver(event,'root')"
     ondrop="_catDrop(event,'root','${r.code}')">
  <span class="cat-mgr-handle" title="Arrastrar para reordenar">⠿</span>
  <span class="cat-mgr-dot" style="background:${r.color||'#9B8B78'}"></span>
  <input class="cat-mgr-root-name" type="text" value="${r.label}"
         onblur="updateCatLabel(${ri},this.value)"
         onkeydown="if(event.key==='Enter')this.blur()" title="Editar nombre">
  <button class="cat-mgr-add-sub" onclick="_catAddSubInline('${r.code}')" title="Agregar subcategoría">+ Sub</button>
  <button class="cat-mgr-del" onclick="deleteCategoryAt(${ri})" title="Eliminar">✕</button>
</div>`;
    if (subs.length) {
      html += `<div class="cat-mgr-subs" data-parent="${r.code}">`;
      subs.forEach(s => {
        const si = categories.indexOf(s);
        const pOpts = roots.filter(x=>x.code!==r.code).map(x=>`<option value="${x.code}">${x.label}</option>`).join('');
        html += `
<div class="cat-mgr-sub-row" draggable="true" data-code="${s.code}"
     ondragstart="_catDragStart(event,'sub','${s.code}')"
     ondragover="_catDragOver(event,'sub')"
     ondrop="_catDrop(event,'sub','${s.code}')">
  <span class="cat-mgr-handle">⠿</span>
  <span class="cat-mgr-dot" style="background:${s.color||r.color||'#9B8B78'}"></span>
  <input class="cat-mgr-sub-name" type="text" value="${s.label}"
         onblur="updateCatLabel(${si},this.value)"
         onkeydown="if(event.key==='Enter')this.blur()" title="Editar nombre">
  <select title="Mover a otra categoría" onchange="_catChangeParent('${s.code}',this.value)"
    style="font-size:.7rem;border:1.5px solid var(--border);border-radius:7px;padding:2px 4px;color:var(--muted);background:#fff;cursor:pointer;max-width:90px;font-family:inherit">
    <option value="${r.code}" selected>↳ ${r.label}</option>
    ${pOpts}
  </select>
  <button class="cat-mgr-del" onclick="deleteCategoryAt(${si})" title="Eliminar">✕</button>
</div>`;
      });
      html += `</div>`;
    }
  });
  el.innerHTML = html;
}

function _catAddSubInline(parentCode) {
  // Si ya hay un formulario abierto para este padre, lo cierra
  const existing = document.getElementById(`cat-sub-form-${parentCode}`);
  if (existing) { existing.remove(); return; }
  // Cierra otros formularios abiertos
  document.querySelectorAll('[id^="cat-sub-form-"]').forEach(el => el.remove());

  const parent = categories.find(c => c.code === parentCode);
  if (!parent) return;

  const form = document.createElement('div');
  form.id = `cat-sub-form-${parentCode}`;
  form.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px 0 6px 18px;margin-left:6px;border-left:2px solid var(--gold)';
  form.innerHTML = `
    <span class="cat-mgr-dot" style="background:${parent.color||'#9B8B78'}"></span>
    <input id="cat-sub-input-${parentCode}" type="text" placeholder="Nombre de la subcategoría…"
      style="flex:1;padding:7px 11px;border:1.5px solid var(--gold);border-radius:8px;font-size:.84rem;font-family:inherit;outline:none"
      onkeydown="if(event.key==='Enter')_catSubConfirm('${parentCode}');if(event.key==='Escape')this.closest('[id^=cat-sub-form]').remove()">
    <button onclick="_catSubConfirm('${parentCode}')"
      style="background:var(--gold);color:#fff;border:none;border-radius:8px;padding:7px 12px;font-size:.8rem;font-weight:700;cursor:pointer;touch-action:manipulation;white-space:nowrap">✓ Agregar</button>
    <button onclick="document.getElementById('cat-sub-form-${parentCode}').remove()"
      style="background:none;border:none;color:var(--muted);font-size:1rem;cursor:pointer;padding:4px;touch-action:manipulation">✕</button>`;

  // Insertar después de la fila raíz (antes del bloque de subs si existe)
  const rootRow = document.querySelector(`.cat-mgr-root`);
  const allRoots = document.querySelectorAll('.cat-mgr-root');
  let targetRoot = null;
  allRoots.forEach(row => {
    const btn = row.querySelector(`[onclick="_catAddSubInline('${parentCode}')"]`);
    if (btn) targetRoot = row;
  });
  if (targetRoot) {
    const subsBlock = targetRoot.nextElementSibling;
    if (subsBlock?.classList.contains('cat-mgr-subs')) {
      subsBlock.insertAdjacentElement('afterend', form);
    } else {
      targetRoot.insertAdjacentElement('afterend', form);
    }
    setTimeout(() => document.getElementById(`cat-sub-input-${parentCode}`)?.focus(), 50);
  }
}

/* ── CATEGORY DRAG & DROP ── */
let _catDragCode = null;
let _catDragType = null;

function _catDragStart(e, type, code) {
  _catDragCode = code;
  _catDragType = type;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget?.classList.add('cat-drag-over'), 0);
}

function _catDragOver(e, type) {
  if (type !== _catDragType) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
  e.currentTarget.classList.add('cat-drag-over');
}

async function _catDrop(e, type, targetCode) {
  e.preventDefault();
  document.querySelectorAll('.cat-drag-over').forEach(el => el.classList.remove('cat-drag-over'));
  if (!_catDragCode || _catDragCode === targetCode || type !== _catDragType) return;

  const srcIdx = categories.findIndex(c => c.code === _catDragCode);
  const tgtIdx = categories.findIndex(c => c.code === targetCode);
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [item] = categories.splice(srcIdx, 1);
  const newTgt = categories.findIndex(c => c.code === targetCode);
  categories.splice(newTgt, 0, item);

  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  _catDragCode = null;
}

async function _catChangeParent(subCode, newParentCode) {
  const sub = categories.find(c => c.code === subCode);
  const newParent = categories.find(c => c.code === newParentCode);
  if (!sub || !newParent) return;
  sub.parent = newParentCode;
  sub.color = newParent.color || sub.color;
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  toast(`"${sub.label}" movida a "${newParent.label}" ✓`, 'success');
}

async function _catSubConfirm(parentCode) {
  const input = document.getElementById(`cat-sub-input-${parentCode}`);
  const label = input?.value.trim();
  if (!label) { input?.focus(); return; }
  const code = parentCode + '_' + label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  if (categories.find(c => c.code === code)) { toast('Ya existe esa subcategoría', 'error'); input?.focus(); return; }
  const parent = categories.find(c => c.code === parentCode);
  const color = parent?.color || CAT_PALETTE[categories.length % CAT_PALETTE.length];
  categories.push({ code, label, color, parent: parentCode });
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  populateCatParentSelect();
  toast(`"${label}" agregada ✓`, 'success');
}

async function updateCatLabel(idx, newLabel) {
  const label = newLabel.trim();
  if (!label || label === categories[idx]?.label) return;
  const code = categories[idx].code;
  categories[idx].label = label;
  await _saveCategories();
  renderCategorySelects();
  // Actualizar category_label en todos los productos de esta categoría
  await supabaseApi(`products?category=eq.${code}`, {
    method: 'PATCH',
    body: JSON.stringify({ category_label: label })
  });
  products.filter(p => p.category === code).forEach(p => { p.categoryLabel = label; });
  renderTable();
  toast(`Categoría "${label}" actualizada ✓`, 'success');
}

async function deleteCategoryAt(idx) {
  const c = categories[idx];
  const count = products.filter(p => p.category === c.code).length;
  const msg = count > 0
    ? `¿Eliminar "${c.label}"? ${count} producto(s) tendrán esta categoría. ¿Continuar?`
    : `¿Eliminar la categoría "${c.label}"?`;
  if (!confirm(msg)) return;
  categories.splice(idx, 1);
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  toast('Categoría eliminada', 'success');
}

async function addCategory() {
  const labelInput  = document.getElementById('new-cat-label');
  const parentInput = document.getElementById('new-cat-parent');
  const label  = labelInput.value.trim();
  const parent = parentInput?.value || '';
  if (!label) { toast('Escribe el nombre de la categoría', 'error'); labelInput.focus(); return; }
  const base = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const code = parent ? `${parent}_${base}` : base;
  if (categories.find(c => c.code === code)) { toast('Ya existe una categoría con ese nombre', 'error'); return; }
  const color = CAT_PALETTE[categories.length % CAT_PALETTE.length];
  const newCat = { code, label, color };
  if (parent && categories.find(c => c.code === parent)) newCat.parent = parent;
  categories.push(newCat);
  await _saveCategories();
  renderCategorySelects();
  renderCatManagerList();
  labelInput.value = '';
  if (parentInput) parentInput.value = '';
  toast(`${parent ? 'Subcategoría' : 'Categoría'} "${label}" creada ✓`, 'success');
}
