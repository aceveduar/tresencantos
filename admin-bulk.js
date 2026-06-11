/* ── BULK ACTIONS ── */

async function bulkFlag() {
  if (!selectedIds.size) return;
  const ids = [...selectedIds];
  const ts = new Date().toISOString();
  for (const id of ids) {
    _flagged = _flagged.filter(x => x.id !== id);
    _flagged.unshift({ id, note: '', ts });
  }
  await _saveFlagged();
  localStorage.setItem('te_flag_filter', _showOnlyFlagged ? '1' : '0');
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  const savedPage = _adminPage;
  renderStats();
  renderTable();
  _adminPage = savedPage;
  requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'instant' }));
  clearBulkSelection();
  toast(`🚩 ${ids.length} producto${ids.length > 1 ? 's' : ''} marcado${ids.length > 1 ? 's' : ''} para revisar`);
}

async function bulkRestock() {
  if (!selectedIds.size) return;
  const input = prompt(`¿Cuántas unidades agregar a los ${selectedIds.size} producto(s) seleccionado(s)?`);
  if (input === null) return;
  const qty = parseInt(input);
  if (!qty || qty <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }

  const selected = products.filter(p => selectedIds.has(p.id));
  for (const p of selected) {
    const newStock = (p.stock || 0) + qty;
    const result = await supabaseApi(`products?id=eq.${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ stock: newStock, out_of_stock: false })
    });
    if (result.ok) { p.stock = newStock; p.outOfStock = false; }
  }
  renderTable(); renderStats();
  toast(`+${qty} unidades agregadas a ${selectedIds.size} producto(s) ✓`, 'success');
}

async function bulkDelete() {
  if (!selectedIds.size) return;
  if (!confirm(`¿Eliminar ${selectedIds.size} producto(s) seleccionado(s)?\nEsta acción no se puede deshacer.`)) return;

  const toDelete = products.filter(p => selectedIds.has(p.id));

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

  toDelete.forEach(p => { const fid = _driveFileId(p.image); if (fid) _deleteDriveFile(fid); });
  products = products.filter(p => !selectedIds.has(p.id));
  if (_qvCurrentId && !products.find(p => p.id === _qvCurrentId)) closeQV();
  selectedIds.clear();
  document.getElementById('products-card-grid')?.classList.remove('selection-active');
  renderTable();
  renderStats();
  updateBulkBar();
  toast('Productos eliminados', 'success');
}

let _bcpFormMode = false;
let _bcpKitMode  = false;

function openFormCatPicker() {
  _bcpFormMode = true;
  document.getElementById('bcp-sub').textContent = 'Categoría del producto';
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openKitCatPicker() {
  _bcpKitMode = true;
  document.getElementById('bcp-sub').textContent = 'Categoría del kit';
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _updateKitCatBtn(code) {
  const cat = categories.find(c => c.code === code);
  const dot = document.getElementById('kb-cat-dot');
  const lbl = document.getElementById('kb-cat-label-display');
  if (!dot || !lbl) return;
  dot.style.background = cat?.color || '#9B8B78';
  lbl.textContent = cat?.label || code || 'Seleccionar categoría';
}

function _updateFormCatBtn(code) {
  const cat = categories.find(c => c.code === code);
  const dot = document.getElementById('f-cat-dot');
  const lbl = document.getElementById('f-cat-label-display');
  if (!dot || !lbl) return;
  dot.style.background = cat?.color || '#9B8B78';
  lbl.textContent = cat?.label || code || 'Seleccionar categoría';
}

function bulkSetCategory() {
  if (!selectedIds.size) return;
  _bcpFormMode = false;
  document.getElementById('bcp-sub').textContent = `${selectedIds.size} producto${selectedIds.size > 1 ? 's' : ''} seleccionado${selectedIds.size > 1 ? 's' : ''}`;
  document.getElementById('bcp-search-input').value = '';
  _bcpFilter('');
  document.getElementById('bulk-cat-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeBulkCatPicker() {
  _bcpFormMode = false;
  _bcpKitMode  = false;
  _bcpInlineId = null;
  document.getElementById('bulk-cat-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function _bcpFilter(q) {
  const term = (q || '').toLowerCase();
  const roots = categories.filter(c => !c.parent);
  const list  = document.getElementById('bcp-list');
  let html = '';

  for (const root of roots) {
    const subs = categories.filter(c => c.parent === root.code);
    const all  = [root, ...subs];
    const visible = term ? all.filter(c => c.label.toLowerCase().includes(term) || c.code.includes(term)) : all;
    if (!visible.length) continue;

    if (!term) {
      html += `<div class="bcp-group-label">${_esc(root.label)}</div><div class="bcp-chips">`;
      html += `<button class="bcp-chip" onclick="_bcpSelect('${root.code}')"><span class="bcp-dot" style="background:${root.color||'#9B8B78'}"></span>${_esc(root.label)}</button>`;
      subs.forEach(s => {
        html += `<button class="bcp-chip bcp-sub-chip" onclick="_bcpSelect('${s.code}')"><span class="bcp-dot" style="background:${s.color||root.color||'#9B8B78'}"></span>${_esc(s.label)}</button>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="bcp-chips" style="margin-bottom:8px">`;
      visible.forEach(c => {
        html += `<button class="bcp-chip" onclick="_bcpSelect('${c.code}')"><span class="bcp-dot" style="background:${c.color||'#9B8B78'}"></span>${_esc(c.label)}</button>`;
      });
      html += `</div>`;
    }
  }
  if (!html) {
    const label = q.trim();
    _bcpPendingLabel = label;
    list.innerHTML = `
      <p style="color:var(--muted);font-size:.85rem;text-align:center;padding:16px 0 10px">Sin resultados para "<strong>${_esc(label)}</strong>"</p>
      <div style="display:flex;flex-direction:column;gap:10px;padding:0 8px 8px">
        <button onclick="_bcpCreateAndSelect(null)"
          style="background:var(--charcoal);color:#fff;border:none;border-radius:10px;padding:11px 20px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation">
          + Crear "${_esc(label)}" como categoría
        </button>
        <button onclick="_bcpToggleParentPicker(this)"
          style="background:transparent;color:var(--charcoal);border:1.5px solid var(--border);border-radius:10px;padding:11px 20px;font-size:.88rem;font-weight:600;cursor:pointer;font-family:inherit;touch-action:manipulation">
          + Crear "${_esc(label)}" como subcategoría de…
        </button>
        <div id="bcp-parent-picker" style="display:none;padding-top:4px"></div>
      </div>`;
  } else {
    list.innerHTML = html;
  }
}

let _bcpPendingLabel = '';

function _bcpToggleParentPicker(btn) {
  const picker = document.getElementById('bcp-parent-picker');
  if (!picker) return;
  if (picker.style.display !== 'none') {
    picker.style.display = 'none';
    btn.style.borderColor = '';
    return;
  }
  const roots = categories.filter(c => !c.parent);
  if (!roots.length) { toast('No hay categorías para usar como padre', 'error'); return; }
  picker.innerHTML = `
    <p style="font-size:.8rem;color:var(--muted);margin-bottom:8px;text-align:center">Elige la categoría padre:</p>
    <div class="bcp-chips" style="justify-content:center">
      ${roots.map(r => `<button class="bcp-chip" onclick="_bcpCreateAndSelect('${r.code}')">
        <span class="bcp-dot" style="background:${r.color||'#9B8B78'}"></span>${_esc(r.label)}
      </button>`).join('')}
    </div>`;
  picker.style.display = 'block';
  btn.style.borderColor = 'var(--gold)';
}

async function _bcpCreateAndSelect(parentCode = null) {
  const label = _bcpPendingLabel.trim();
  if (!label) return;
  const prefix = parentCode ? parentCode + '_' : '';
  const code = (prefix + label.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,''));
  if (categories.find(c => c.code === code)) {
    return _bcpSelect(code);
  }
  const parent = parentCode ? categories.find(c => c.code === parentCode) : null;
  const color = parent ? parent.color : CAT_PALETTE[categories.length % CAT_PALETTE.length];
  const newCat = { code, label, color };
  if (parentCode) newCat.parent = parentCode;
  categories.push(newCat);
  await _saveCategories();
  renderCategorySelects();
  populateCatParentSelect();
  const suffix = parent ? ` en ${parent.label}` : '';
  toast(`Categoría "${label}"${suffix} creada ✓`, 'success');
  _bcpSelect(code);
}

async function _bcpSelect(code) {
  const cat = categories.find(c => c.code === code);
  if (!cat) return;

  if (_bcpFormMode) {
    closeBulkCatPicker();
    const sel = document.getElementById('f-category');
    if (sel) sel.value = cat.code;
    const lblInput = document.getElementById('f-category-label');
    if (lblInput) lblInput.value = cat.label;
    _updateFormCatBtn(cat.code);
    return;
  }

  if (_bcpKitMode) {
    closeBulkCatPicker();
    _kbSelectedCatCode = cat.code;
    _updateKitCatBtn(cat.code);
    document.body.style.overflow = 'hidden'; // restaurar lock del kit builder
    return;
  }

  if (_bcpInlineId !== null) {
    const inlineId = _bcpInlineId;
    closeBulkCatPicker();
    const p = products.find(x => x.id === inlineId);
    if (!p || p.category === cat.code) { renderTable(); _qvRefresh(inlineId); return; }
    supabaseApi(`products?id=eq.${inlineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ category: cat.code, category_label: cat.label })
    }).then(r => {
      if (r.ok) {
        p.category = cat.code; p.categoryLabel = cat.label;
        // Si el filtro activo era "Sin categoría" y el producto ya tiene categoría, limpiarlo
        // para que el producto quede visible en lugar de desaparecer de la vista
        if (_statFilter === 'sin-categ' && cat.code !== 'por_revisar') _statFilter = null;
        toast(`Categoría → ${cat.label}`);
      } else toast('Error al actualizar categoría', 'error');
      renderTable(); renderStats(); _qvRefresh(inlineId);
    });
    return;
  }

  closeBulkCatPicker();

  const ids = [...selectedIds].join(',');
  const result = await supabaseApi(`products?id=in.(${ids})`, {
    method: 'PATCH',
    body: JSON.stringify({ category: cat.code, category_label: cat.label })
  });
  if (!result.ok) { toast('Error al actualizar categoría', 'error'); return; }

  products.forEach(p => {
    if (selectedIds.has(p.id)) { p.category = cat.code; p.categoryLabel = cat.label; }
  });
  renderTable(); renderStats();
  toast(`● ${cat.label} → ${selectedIds.size} producto${selectedIds.size > 1 ? 's' : ''}`, '');
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
  const newVal = !selected.every(p => p.outOfStock);

  if (getSupabaseUrl()) {
    // PATCH base: cambiar out_of_stock para todos
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ out_of_stock: newVal })
    });
    if (!result.ok) { toast('Error al actualizar estado de stock', 'error'); return; }

    // Al marcar disponible: los que tenían stock=0 reciben stock=1 (igual que toggleOutOfStock individual)
    if (!newVal) {
      const needStock = selected.filter(p => p.stock === 0);
      for (const p of needStock) {
        await supabaseApi(`products?id=eq.${p.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ stock: 1 })
        });
        p.stock = 1;
      }
    }
  }

  selected.forEach(p => { p.outOfStock = newVal; });
  renderTable();
  renderStats();
  toast(newVal
    ? `${selectedIds.size} producto(s) marcados como agotados`
    : `${selectedIds.size} producto(s) marcados como disponibles`, 'success');
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

async function bulkTogglePublish() {
  if (!selectedIds.size) return;
  if (!can.publishProduct) { toast('Sin permiso para publicar productos', 'error'); return; }
  const selected = products.filter(p => selectedIds.has(p.id));
  // Si todos están publicados → ocultar; si alguno no lo está → publicar todos
  const newVal = !selected.every(p => p.isPublished !== false);
  if (newVal) {
    const agotados = selected.filter(p => p.outOfStock).length;
    if (agotados > 0 && !confirm(`${agotados} producto(s) están agotados y no aparecerán en el sitio web aunque se publiquen.\n\n¿Continuar?`)) return;
  }
  if (getSupabaseUrl()) {
    const ids = [...selectedIds].join(',');
    const result = await supabaseApi(`products?id=in.(${ids})`, {
      method: 'PATCH',
      body: JSON.stringify({ is_published: newVal })
    });
    if (!result.ok) { toast('Error al actualizar visibilidad', 'error'); return; }
  }
  selected.forEach(p => { p.isPublished = newVal; });
  renderTable();
  renderStats();
  toast(newVal
    ? `${selectedIds.size} producto(s) publicados en sitio web 🌐`
    : `${selectedIds.size} producto(s) ocultados del sitio web 🙈`, 'success');
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
        categoryLabel: p.categoryLabel || p.category_label || getCatLabel(p.category) || '',
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
