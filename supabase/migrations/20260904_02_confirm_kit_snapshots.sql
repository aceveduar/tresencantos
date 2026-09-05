-- -----------------------------------------------------------------------------
-- Confirma 2 snapshots de kit marcados "estimados" que bloqueaban editar sus
-- apartados -- te_assert_authoritative_inventory_snapshot() rechaza CUALQUIER
-- edicion de inventario en un apartado si alguno de sus items tiene
-- kit_snapshot_estimated=true, hasta que un humano confirme la composicion
-- (mensaje: "Revisa manualmente los componentes y corrige el snapshot antes
-- de mutar inventario"). Verificado con Eduardo (2026-09-04): en ambos casos
-- lo ya guardado en sales.items coincide exactamente con la composicion
-- actual del kit en products.kit_items -- el dato ya era correcto, solo
-- faltaba la confirmacion.
--
-- Afectados:
--   apartado 451 (doña lupe)                — kit id 1067 "homen"
--   apartado 458 (Marisol cocina los pinos)  — kit id 1094 "Kit Crema
--     Hidratante para Manos y Perfume Humor Pripio"
--
-- Solo cambia el flag kit_snapshot_estimated -> false en el item que
-- corresponde a cada kit; el resto del array items (nombre, precio, qty,
-- kit_items, y los demas productos del apartado) queda intacto.
-- -----------------------------------------------------------------------------
UPDATE public.sales
SET items = (
  SELECT jsonb_agg(
    CASE WHEN (elem->>'id')::bigint = 1067
      THEN elem || '{"kit_snapshot_estimated": false}'::jsonb
      ELSE elem
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(items) WITH ORDINALITY AS t(elem, ord)
)
WHERE id = 451;

UPDATE public.sales
SET items = (
  SELECT jsonb_agg(
    CASE WHEN (elem->>'id')::bigint = 1094
      THEN elem || '{"kit_snapshot_estimated": false}'::jsonb
      ELSE elem
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(items) WITH ORDINALITY AS t(elem, ord)
)
WHERE id = 458;
