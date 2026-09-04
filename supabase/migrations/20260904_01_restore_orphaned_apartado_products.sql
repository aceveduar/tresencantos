-- -----------------------------------------------------------------------------
-- Restaura 8 productos eliminados del catalogo que seguian referenciados por
-- 8 apartados activos (ids 228, 354, 370, 376, 437, 443, 494, 531) -- edit_
-- apartado_atomic exige que TODO producto que se quede en un apartado siga
-- existiendo en products antes de guardar cualquier cambio, asi que esos 8
-- apartados quedaron bloqueados para editarse en cuanto se borro cada
-- producto (auditoria via SQL, 2026-09-04).
--
-- No se puede simplemente "quitar la linea" del apartado como solucion --
-- en el modelo real de negocio de esta tienda, Ofelia entrega el producto
-- fisico a clientas de confianza AL CREAR el apartado (~80% de los casos),
-- antes de que paguen -- el producto ya salio de la tienda. Quitar la linea
-- borraria una deuda real, no un pedido pendiente de armar.
--
-- Estos 8 se restauran SOLO como placeholder para desbloquear la edicion:
-- category='por_revisar' (uso interno, nunca aparece en filtros normales),
-- is_published=false + out_of_stock=true + stock=0 (nunca vendibles otra
-- vez por accidente en Caja/Tienda). El precio es EXACTO al que ya estaba
-- congelado en cada apartado (sacado de sales.items) -- si no coincidiera,
-- la proxima edicion de estos apartados dispararia sin necesidad la
-- validacion de "precio modificado" (canOverridePrice) en
-- te_snapshot_sale_items.
--
-- El guard nuevo en Inventario (_productsInActiveApartados, admin-utils.js,
-- conectado en askDelete/bulkDelete) evita que esto se repita: ahora avisa
-- antes de borrar un producto que sigue en un apartado activo.
-- -----------------------------------------------------------------------------
INSERT INTO public.products (
  id, name, category, category_label, price, image,
  stock, out_of_stock, is_published, featured, position, description
) VALUES
  (162,  'Natura Chronos Derma Multiprotector Aclarador de Manchas Incoloro Fps 50+ 50ml', 'por_revisar', 'Por revisar', 369,    'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (220,  'Natura Tododia Desodorante Antitranspirante Roll-on Leite de Algodão 70ml',      'por_revisar', 'Por revisar', 100,    'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (672,  'Clearskin By Avon Blemish Clearing Pink Clay Triple Exfoliante Facial 60g',      'por_revisar', 'Por revisar', 90,     'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (732,  'Natura una Corrector Cobertura Extrema 24h 8ml',                                 'por_revisar', 'Por revisar', 185,    'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (787,  'Natura Tododia Desodorante Antitranspirante en Crema Invisible 80g',             'por_revisar', 'Por revisar', 115,    'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (970,  'Natura Tododia Crema Corporal Noites de Verão 400ml',                            'por_revisar', 'Por revisar', 188,    'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (1100, 'Kit Quimicamente Dañado',                                                        'por_revisar', 'Por revisar', 443.00, 'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.'),
  (1110, 'Perfume Luna Atitude',                                                           'por_revisar', 'Por revisar', 663.00, 'img/tresencantos_default.png', 0, true, false, false, 0, 'Restaurado 2026-09-04 solo para permitir editar apartados historicos -- no vender.')
ON CONFLICT (id) DO NOTHING;
