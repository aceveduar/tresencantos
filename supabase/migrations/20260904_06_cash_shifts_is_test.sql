-- =============================================================================
-- Protección is_test para cash_shifts (turno de caja) -- mismo mecanismo
-- que ya existe para sales (20260820_02_is_test_flag.sql), aplicado a la
-- tabla nueva de esta semana. Sin esto, cualquier prueba real de Eduardo/
-- Ofelia abriendo o cerrando caja queda para siempre mezclada con datos
-- reales en Reportes ("Turnos de caja") y Actividad, sin forma de ocultarla
-- -- el mismo problema que is_test ya resolvió para ventas, sin protección
-- en la tabla nueva.
--
-- Reutiliza el permiso ya existente canMarkTestData (no se crea uno nuevo)
-- -- mismo criterio: quien puede ocultar una venta de prueba, puede ocultar
-- un turno de prueba.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- =============================================================================
BEGIN;

ALTER TABLE public.cash_shifts ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.te_set_shift_test_flag(p_shift_id bigint, p_is_test boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_has_permission('canMarkTestData') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para marcar pruebas';
  END IF;

  UPDATE public.cash_shifts SET is_test = p_is_test WHERE id = p_shift_id
  RETURNING user_email INTO v_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Turno no encontrado';
  END IF;

  PERFORM public.te_log_activity(
    'configuracion_editada',
    format('%s turno de caja #%s (%s) como prueba',
      CASE WHEN p_is_test THEN 'Marcó' ELSE 'Desmarcó' END,
      p_shift_id, v_email),
    jsonb_build_object('shift_id', p_shift_id, 'is_test', p_is_test)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.te_set_shift_test_flag(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_set_shift_test_flag(bigint, boolean) TO authenticated;

COMMIT;
