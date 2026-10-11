-- Todos los apartados activos al 10 de octubre de 2026 son fiado (2026-10-10).
--
-- Eduardo/Ofelia: hoy no hay apartados con el producto guardado en la tienda;
-- todas las personas con apartado ya se llevaron su producto. Se marcan como
-- "se lo llevó" (sales.se_lo_llevo). Efectos:
--   * Ninguno ofrece "Liberar producto".
--   * Sus productos dejan de contar como reservados: los que tenían 0 piezas
--     pasan de "📌 Apartado" a agotado en la Tienda (ya no están en la tienda).
--   * Sus recordatorios hablan de saldo pendiente.
-- Los apartados nuevos siguen siendo "se queda en la tienda" salvo que se
-- marque "Se lo lleva hoy".
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_08_apartados_actuales_son_fiado.sql

BEGIN;

WITH marcados AS (
  UPDATE public.sales
     SET se_lo_llevo = true, updated_at = now(), version = version + 1
   WHERE origin_type = 'apartado' AND status = 'activo' AND cancelled_at IS NULL
     AND NOT se_lo_llevo
  RETURNING id, customer
)
INSERT INTO public.activity_log (action, user_email, summary, meta)
SELECT 'apartado_editado', 'sistema',
       format('Se marcaron %s apartados existentes como fiado (se llevaron el producto)', count(*)),
       jsonb_build_object('ids', jsonb_agg(id ORDER BY id), 'se_lo_llevo', true, 'motivo', 'apartados_actuales_son_fiado_2026_10_10')
FROM marcados
HAVING count(*) > 0;

-- Recalcular "apartado/agotado" de todos los productos que estaban apartados.
SELECT public.te_refresh_apartado_product_flags(array_agg(id)) FROM public.products WHERE is_apartado;

COMMIT;
