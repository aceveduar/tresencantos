-- Retiros de efectivo en el turno (2026-10-02).
--
-- El 2 oct Renata cerró contando solo el fondo ($312 vs $586 esperado): el
-- dinero del día se sacó del cajón sin registrarlo, y el corte "no cuadró".
-- Un retiro (la dueña se lleva la venta, un depósito al banco) no es gasto
-- ni ingreso: es dinero de la tienda que cambia de lugar. Resta del esperado
-- del cajón, pero no afecta la utilidad. Se guarda aparte (retiros_total)
-- y cada uno queda en Actividad con quién lo registró y para quién.

ALTER TABLE public.cash_shift_expenses DROP CONSTRAINT IF EXISTS cash_shift_expenses_kind_check;
ALTER TABLE public.cash_shift_expenses ADD CONSTRAINT cash_shift_expenses_kind_check
  CHECK (kind = ANY (ARRAY['gasto'::text, 'ingreso'::text, 'retiro'::text]));

ALTER TABLE public.cash_shifts
  ADD COLUMN IF NOT EXISTS retiros_total numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.te_add_shift_expense(p_description text, p_amount numeric, p_kind text DEFAULT 'gasto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_email text;
  v_shift public.cash_shifts;
  v_row   public.cash_shift_expenses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF p_kind NOT IN ('gasto', 'ingreso', 'retiro') THEN
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

  -- Un retiro saca dinero real del cajón: siempre a Actividad, para que la
  -- dueña vea cada salida aunque nadie revise el corte.
  IF p_kind = 'retiro' THEN
    INSERT INTO public.activity_log (action, user_email, summary, meta)
    VALUES ('retiro_efectivo', v_email,
            format('Retiro de efectivo $%s — %s', trim(to_char(p_amount, 'FM999,999,990.00')), btrim(p_description)),
            jsonb_build_object('shift_id', v_shift.id, 'expense_id', v_row.id, 'amount', p_amount, 'description', btrim(p_description)));
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

-- te_close_cash_shift: gastos (gasto − ingreso) y retiros por separado;
-- ambos restan del esperado.
CREATE OR REPLACE FUNCTION public.te_close_cash_shift(
  p_conteo_final numeric,
  p_gastos_total numeric DEFAULT 0,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL,
  p_include_cash_from text[] DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_email     text;
  v_shift     public.cash_shifts;
  v_efectivo  numeric;
  v_otros     numeric := 0;
  v_otros_det jsonb := '[]'::jsonb;
  v_include   text[];
  v_esperado  numeric;
  v_diff      numeric;
  v_gastos    numeric;
  v_retiros   numeric;
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
     AND sp.paid_at <= now();

  SELECT coalesce(array_agg(DISTINCT lower(trim(e))), '{}') INTO v_include
    FROM unnest(coalesce(p_include_cash_from, '{}')) AS e
   WHERE coalesce(trim(e), '') <> '' AND lower(trim(e)) <> v_email;

  IF array_length(v_include, 1) > 0 THEN
    SELECT coalesce(sum(t.total), 0),
           coalesce(jsonb_agg(jsonb_build_object('email', t.email, 'efectivo', t.total) ORDER BY t.email), '[]'::jsonb)
      INTO v_otros, v_otros_det
      FROM (
        SELECT lower(sp.collected_by_email) AS email, sum(sp.amount) AS total
          FROM public.sale_payments sp
         WHERE lower(sp.collected_by_email) = ANY (v_include)
           AND sp.method = 'efectivo'
           AND sp.paid_at >= v_shift.opened_at
           AND sp.paid_at <= now()
         GROUP BY lower(sp.collected_by_email)
      ) t;
  END IF;

  SELECT coalesce(sum(CASE kind WHEN 'ingreso' THEN -amount WHEN 'gasto' THEN amount ELSE 0 END), 0),
         coalesce(sum(CASE WHEN kind = 'retiro' THEN amount ELSE 0 END), 0)
    INTO v_gastos, v_retiros
    FROM public.cash_shift_expenses
   WHERE shift_id = v_shift.id
     AND cancelled_at IS NULL;

  v_esperado := v_shift.fondo_inicial + v_efectivo + v_otros - v_gastos - v_retiros;
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
         efectivo_otras_cuentas = v_otros,
         gastos_total = v_gastos,
         retiros_total = v_retiros,
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
                 trim(to_char(abs(v_diff), 'FM999,999,990.00'))) ||
          (CASE WHEN v_otros <> 0 THEN format(' · incluye $%s de otras cuentas', trim(to_char(v_otros, 'FM999,999,990.00'))) ELSE '' END) ||
          (CASE WHEN v_retiros <> 0 THEN format(' · retiros $%s', trim(to_char(v_retiros, 'FM999,999,990.00'))) ELSE '' END) ||
          v_loc_txt ||
          (CASE WHEN v_authorized_by IS NOT NULL THEN format(' · autorizado por %s', v_authorized_by) ELSE '' END),
          jsonb_build_object('shift_id', v_shift.id, 'fondo_inicial', v_shift.fondo_inicial,
                              'efectivo_neto', v_efectivo, 'gastos_total', v_gastos,
                              'retiros_total', v_retiros,
                              'efectivo_otras_cuentas', v_otros, 'otras_cuentas', v_otros_det,
                              'esperado', v_esperado, 'conteo_final', p_conteo_final,
                              'diferencia', v_diff, 'alerta_diferencia', v_alerta,
                              'authorized_by', v_authorized_by,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_shift);
END;
$function$;
