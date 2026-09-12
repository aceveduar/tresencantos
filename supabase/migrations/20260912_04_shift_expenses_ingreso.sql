-- =============================================================================
-- Gastos del turno acepta ingresos, no solo salidas (2026-09-12)
--
-- Motivado por un caso real: en la tienda también se hacen recargas
-- telefónicas (vía terminal Mercado Pago) aparte de las ventas del
-- catálogo. Ese efectivo entra a la caja física pero el sistema no sabía
-- nada de eso -- causó un faltante/sobrante fantasma en un cierre de turno
-- que costó tiempo reconstruir a mano. Eduardo confirmó explícitamente que
-- NO quiere calcular el margen/comisión exacto por recarga (variable,
-- unos centavos) -- lo único que hace falta es explicar el movimiento de
-- efectivo para que el cierre cuadre, no llevar contabilidad de ese
-- negocio aparte.
--
-- Un "ingreso" (ej. "Recarga +$52") es un gasto con signo contrario -- se
-- guarda en la misma tabla cash_shift_expenses con `kind='ingreso'`, y
-- resta (en vez de sumar) al total que se descuenta de "esperado".
-- =============================================================================
BEGIN;

ALTER TABLE public.cash_shift_expenses
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'gasto';
ALTER TABLE public.cash_shift_expenses
  DROP CONSTRAINT IF EXISTS cash_shift_expenses_kind_check;
ALTER TABLE public.cash_shift_expenses
  ADD CONSTRAINT cash_shift_expenses_kind_check CHECK (kind IN ('gasto', 'ingreso'));

CREATE OR REPLACE FUNCTION public.te_add_shift_expense(
  p_description text,
  p_amount numeric,
  p_kind text DEFAULT 'gasto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text;
  v_shift public.cash_shifts;
  v_row   public.cash_shift_expenses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF p_kind NOT IN ('gasto', 'ingreso') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de movimiento inválido';
  END IF;

  SELECT * INTO v_shift FROM public.cash_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No tienes un turno abierto';
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Falta la descripción';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El monto debe ser mayor a cero';
  END IF;

  INSERT INTO public.cash_shift_expenses (shift_id, description, amount, kind, created_by_email)
  VALUES (v_shift.id, btrim(p_description), p_amount, p_kind, v_email)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.te_add_shift_expense(text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_add_shift_expense(text, numeric, text) TO authenticated;
-- La firma anterior (2 argumentos, sin p_kind) queda huérfana -- se quita
-- para que PostgREST no dude entre las dos cuando el cliente ya manda
-- p_kind siempre.
DROP FUNCTION IF EXISTS public.te_add_shift_expense(text, numeric);

-- El total que se descuenta de "esperado" ahora es neto: gastos suman,
-- ingresos restan. Resto de la función sin cambios respecto a
-- 20260912_03_cash_shift_expenses.sql.
CREATE OR REPLACE FUNCTION public.te_close_cash_shift(
  p_conteo_final numeric,
  p_gastos_total numeric DEFAULT 0,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL
)
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
  v_gastos    numeric;
  v_alerta    boolean;
  v_authorized_by text;
  v_distancia numeric := public._te_distance_to_store_m(p_lat, p_lng);
  v_lejos     boolean := coalesce(public._te_is_far_from_store(p_lat, p_lng), false);
  v_loc_txt   text := CASE
                         WHEN v_distancia IS NULL THEN ' · 📍 sin ubicación'
                         WHEN v_lejos THEN format(' · 📍 %s km del local', trim(to_char(v_distancia / 1000.0, 'FM999990.0')))
                         ELSE ''
                       END;
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

  -- Neto del ledger de este turno: 'gasto' suma, 'ingreso' resta.
  SELECT coalesce(sum(CASE WHEN kind = 'ingreso' THEN -amount ELSE amount END), 0) INTO v_gastos
    FROM public.cash_shift_expenses
   WHERE shift_id = v_shift.id
     AND cancelled_at IS NULL
     AND coalesce(is_test, false) = false;

  v_esperado := v_shift.fondo_inicial + v_efectivo - v_gastos;
  v_diff := p_conteo_final - v_esperado;
  v_alerta := abs(v_diff) >= 100;

  IF v_alerta AND NOT public.te_permission_or_override('canCloseShiftUnsupervised', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Se requiere autorización para cerrar con una diferencia grande';
  END IF;
  IF v_alerta AND NOT public.te_has_permission('canCloseShiftUnsupervised') THEN
    v_authorized_by := public.te_consume_matching_override('canCloseShiftUnsupervised', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;

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
                 trim(to_char(abs(v_diff), 'FM999,999,990.00'))) || v_loc_txt ||
          (CASE WHEN v_authorized_by IS NOT NULL THEN format(' · autorizado por %s', v_authorized_by) ELSE '' END),
          jsonb_build_object('shift_id', v_shift.id, 'fondo_inicial', v_shift.fondo_inicial,
                              'efectivo_neto', v_efectivo, 'gastos_total', v_gastos,
                              'esperado', v_esperado, 'conteo_final', p_conteo_final,
                              'diferencia', v_diff, 'alerta_diferencia', v_alerta,
                              'authorized_by', v_authorized_by,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_shift);
END;
$$;

COMMIT;
