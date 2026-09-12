-- =============================================================================
-- Gastos del turno -- persisten y se auditan en servidor (2026-09-12)
--
-- Hasta ahora, los gastos que se registran durante un turno ("Taxi -$50",
-- "Refresco -$20") solo vivían en localStorage del dispositivo -- al cerrar
-- turno, únicamente se mandaba el TOTAL agregado (`p_gastos_total`) a
-- te_close_cash_shift(), y la función confiaba ciegamente en ese número.
-- Hueco real de control: alguien con un faltante real podía simplemente
-- declarar un gasto inventado del mismo monto para que el conteo cuadrara,
-- y nadie podía verificarlo -- mismo tipo de problema que "conteo a ciegas"
-- ya resolvió para el efectivo, pero seguía abierto para los gastos.
--
-- Esta migración:
-- 1. Crea `cash_shift_expenses` -- cada gasto es su propia fila, con hora y
--    autor reales del servidor (no lo que mande el cliente).
-- 2. te_add_shift_expense() -- único camino para agregar un gasto al turno
--    abierto de quien llama.
-- 3. te_cancel_shift_expense() -- "eliminar" un gasto NUNCA lo borra de
--    verdad (mismo principio de ledger append-only que sales/sale_payments)
--    -- lo marca cancelado, conservando quién y cuándo. Si no fuera así,
--    alguien podría agregar un gasto inventado y "quitarlo" antes de que
--    nadie lo note, sin dejar ningún rastro -- justo el hueco que esto
--    busca cerrar.
-- 4. te_close_cash_shift() ya NO confía en `p_gastos_total` (parámetro
--    conservado en la firma por compatibilidad, pero ignorado) -- calcula
--    el total sumando los gastos reales no cancelados de ESTE turno.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.cash_shift_expenses (
  id                 bigint generated always as identity primary key,
  shift_id           bigint NOT NULL REFERENCES public.cash_shifts(id),
  description        text NOT NULL,
  amount             numeric NOT NULL CHECK (amount > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by_email   text NOT NULL,
  cancelled_at       timestamptz,
  cancelled_by_email text,
  is_test            boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS cash_shift_expenses_shift_id_idx ON public.cash_shift_expenses(shift_id);

ALTER TABLE public.cash_shift_expenses ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a cualquier autenticado -- mismo criterio que cash_shifts
-- (la restricción real vive en la UI/RPC). Sin políticas de INSERT/UPDATE:
-- toda escritura pasa por las RPC de abajo.
DROP POLICY IF EXISTS "cash_shift_expenses_auth_select" ON public.cash_shift_expenses;
CREATE POLICY "cash_shift_expenses_auth_select" ON public.cash_shift_expenses
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- te_add_shift_expense -- agrega un gasto al turno abierto de quien llama.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_add_shift_expense(p_description text, p_amount numeric)
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

  SELECT * INTO v_shift FROM public.cash_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY opened_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No tienes un turno abierto';
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Falta la descripción del gasto';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El monto debe ser mayor a cero';
  END IF;

  INSERT INTO public.cash_shift_expenses (shift_id, description, amount, created_by_email)
  VALUES (v_shift.id, btrim(p_description), p_amount, v_email)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.te_add_shift_expense(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_add_shift_expense(text, numeric) TO authenticated;

-- -----------------------------------------------------------------------------
-- te_cancel_shift_expense -- "quita" un gasto sin borrarlo (soft-cancel).
-- Solo sobre el turno ABIERTO de quien llama -- no se puede tocar el gasto
-- de otra persona ni el de un turno ya cerrado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_cancel_shift_expense(p_expense_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  UPDATE public.cash_shift_expenses e
     SET cancelled_at = now(), cancelled_by_email = v_email
   WHERE e.id = p_expense_id
     AND e.cancelled_at IS NULL
     AND e.shift_id IN (
       SELECT id FROM public.cash_shifts
        WHERE user_email = v_email AND status = 'abierto'
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Gasto no encontrado o ya no se puede quitar';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.te_cancel_shift_expense(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_cancel_shift_expense(bigint) TO authenticated;

-- -----------------------------------------------------------------------------
-- te_close_cash_shift -- misma firma, ya no confía en p_gastos_total.
-- -----------------------------------------------------------------------------
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

  -- Antes: v_gastos := coalesce(p_gastos_total, 0) -- confiaba en lo que
  -- mandara el cliente. Ahora se calcula del ledger real de este turno;
  -- p_gastos_total se conserva en la firma mas ya no se usa.
  SELECT coalesce(sum(amount), 0) INTO v_gastos
    FROM public.cash_shift_expenses
   WHERE shift_id = v_shift.id
     AND cancelled_at IS NULL
     AND coalesce(is_test, false) = false;

  v_esperado := v_shift.fondo_inicial + v_efectivo - v_gastos;
  v_diff := p_conteo_final - v_esperado;
  v_alerta := abs(v_diff) >= 100;

  -- Diferencia grande: exige el permiso o un ticket de autorización válido
  -- -- mismo patrón que precio/descuento/cancelar/editar apartado.
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
