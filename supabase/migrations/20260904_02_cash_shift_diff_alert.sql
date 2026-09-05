-- =============================================================================
-- Alerta de diferencia grande al cerrar turno.
--
-- Eduardo pidió que un faltante/sobrante grande no se vea "igual de discreto"
-- que uno chico en el resumen de Actividad. Esta migración reemplaza
-- te_close_cash_shift (20260904_01_cash_shifts.sql) agregando un marcador
-- "⚠️" al summary y un campo `alerta_diferencia` en meta cuando
-- abs(diferencia) >= 100 -- mismo umbral que usa Reportes del lado del
-- cliente (_DIFF_ALERTA_MONTO, stats.js). Si se ajusta el umbral, ajustar
-- ambos lados.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Aditiva (CREATE OR
-- REPLACE, misma firma -- no rompe llamadas existentes).
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.te_close_cash_shift(p_conteo_final numeric, p_gastos_total numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email     text;
  v_shift     public.cash_shifts;
  v_efectivo  numeric;
  v_esperado  numeric;
  v_diff      numeric;
  v_gastos    numeric := coalesce(p_gastos_total, 0);
  v_alerta    boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_email := lower(coalesce(auth.jwt()->>'email', ''));

  SELECT * INTO v_shift FROM public.cash_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY opened_at DESC LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No tienes un turno abierto';
  END IF;
  IF p_conteo_final IS NULL OR p_conteo_final < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Conteo final inválido';
  END IF;

  SELECT coalesce(sum(sp.amount), 0) INTO v_efectivo
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
   WHERE lower(sp.collected_by_email) = v_email
     AND sp.method = 'efectivo'
     AND sp.paid_at >= v_shift.opened_at
     AND sp.paid_at <= now()
     AND coalesce(s.is_test, false) = false;

  v_esperado := v_shift.fondo_inicial + v_efectivo - v_gastos;
  v_diff := p_conteo_final - v_esperado;
  v_alerta := abs(v_diff) >= 100;

  UPDATE public.cash_shifts
     SET status = 'cerrado',
         closed_at = now(),
         conteo_final = p_conteo_final,
         efectivo_neto = v_efectivo,
         gastos_total = v_gastos,
         esperado = v_esperado,
         diferencia = v_diff
   WHERE id = v_shift.id
   RETURNING * INTO v_shift;

  INSERT INTO public.activity_log(action, user_email, summary, meta)
  VALUES ('turno_cerrado', v_email,
          (CASE WHEN v_alerta THEN '⚠️ ' ELSE '' END) ||
          format('Cerró caja -- esperado $%s, contado $%s (%s$%s)',
                 trim(to_char(v_esperado, 'FM999,999,990.00')),
                 trim(to_char(p_conteo_final, 'FM999,999,990.00')),
                 CASE WHEN v_diff >= 0 THEN '+' ELSE '-' END,
                 trim(to_char(abs(v_diff), 'FM999,999,990.00'))),
          jsonb_build_object('shift_id', v_shift.id, 'fondo_inicial', v_shift.fondo_inicial,
                              'efectivo_neto', v_efectivo, 'gastos_total', v_gastos,
                              'esperado', v_esperado, 'conteo_final', p_conteo_final,
                              'diferencia', v_diff, 'alerta_diferencia', v_alerta));

  RETURN to_jsonb(v_shift);
END;
$$;

REVOKE ALL ON FUNCTION public.te_close_cash_shift(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_close_cash_shift(numeric, numeric) TO authenticated;

COMMIT;
