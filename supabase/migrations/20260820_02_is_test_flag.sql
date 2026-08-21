-- Marcar ventas/apartados de prueba para que dejen de aparecer en
-- Historial, Apartados (Cancelados/Liquidados/Activos) y Reportes --
-- SIN borrar el registro. Nunca se borra nada de sales/sale_payments
-- (mismo principio de "nunca borrar el registro historico" de toda la
-- Caja v2, documentado en CLAUDE.md) -- las pruebas ya se netean a $0
-- en los KPIs de dinero (fix previo, 20260820_01), esto solo las oculta
-- de la vista para que el Historial no se vea lleno de ruido de pruebas.
--
-- Ejecutar una sola vez en Supabase SQL Editor.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.te_set_sale_test_flag(p_sale_id bigint, p_is_test boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_has_permission('canManageSettings') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para marcar pruebas';
  END IF;

  UPDATE public.sales SET is_test = p_is_test WHERE id = p_sale_id
  RETURNING customer INTO v_customer;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Venta no encontrada';
  END IF;

  PERFORM public.te_log_activity(
    'configuracion_editada',
    format('%s venta/apartado #%s (%s) como prueba',
      CASE WHEN p_is_test THEN 'Marcó' ELSE 'Desmarcó' END,
      p_sale_id, COALESCE(NULLIF(btrim(v_customer), ''), 'sin cliente')),
    jsonb_build_object('sale_id', p_sale_id, 'is_test', p_is_test)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.te_set_sale_test_flag(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_set_sale_test_flag(bigint, boolean) TO authenticated;

-- Limpieza puntual de lo ya identificado hoy: todas las pruebas de Eduardo
-- comparten el mismo numero de telefono de prueba (7721204509), visible en
-- cada una de las capturas -- criterio preciso y seguro, no depende del
-- nombre (que incluia tanto "TEST..." como "Eduardo Acevedo" a secas).
UPDATE public.sales
SET is_test = true
WHERE customer LIKE '%7721204509%';
