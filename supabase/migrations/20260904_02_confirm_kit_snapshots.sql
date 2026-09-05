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
--
-- IMPORTANTE: un UPDATE directo a sales dispara te_sales_compat_before_write()
-- (trigger legado, pre-Caja v2), que llama a te_snapshot_sale_items(NEW.items)
-- con UN solo argumento -- ambiguo, porque hoy existen dos versiones de esa
-- funcion (1 y 2 argumentos) y Postgres no puede elegir cual usar. Las RPC
-- reales (record_sale_atomic_v2, edit_apartado_atomic) nunca pisan este
-- problema porque activan tresencantos.rpc_v2='on' antes de escribir, y el
-- trigger se retira de inmediato (RETURN NEW) cuando ve esa bandera activa.
-- Replicamos exactamente eso aqui -- no se toca ni se borra ninguna funcion.
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL tresencantos.rpc_v2 = 'on';

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

COMMIT;
