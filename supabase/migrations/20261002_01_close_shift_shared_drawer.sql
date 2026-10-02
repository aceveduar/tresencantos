-- Cierre de turno con cajón compartido (2026-10-02).
--
-- El turno es por persona, pero el cajón es uno solo: el 1 oct Ofelia cobró
-- $1,015 en efectivo desde su sesión mientras Renata tenía el turno abierto,
-- y el corte de Renata los excluía (correcto por diseño, pero el dinero sí
-- estaba en el cajón) -> "no cuadró". Ahora quien cierra declara, persona por
-- persona, si el efectivo que cobraron otras cuentas durante su turno está en
-- este cajón; el servidor suma ese efectivo al esperado (calculado aquí, no
-- confiando en un monto del cliente) y lo deja anotado en el turno y en
-- Actividad.

ALTER TABLE public.cash_shifts
  ADD COLUMN IF NOT EXISTS efectivo_otras_cuentas numeric NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.te_close_cash_shift(numeric, numeric, double precision, double precision, uuid[]);

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

  -- Efectivo de otras cuentas que quien cierra confirma tener en su cajón.
  -- Se recalcula desde sale_payments con la misma ventana del turno; un
  -- correo sin cobros en esa ventana simplemente no suma nada.
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

  SELECT coalesce(sum(CASE WHEN kind = 'ingreso' THEN -amount ELSE amount END), 0) INTO v_gastos
    FROM public.cash_shift_expenses
   WHERE shift_id = v_shift.id
     AND cancelled_at IS NULL;

  v_esperado := v_shift.fondo_inicial + v_efectivo + v_otros - v_gastos;
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
          v_loc_txt ||
          (CASE WHEN v_authorized_by IS NOT NULL THEN format(' · autorizado por %s', v_authorized_by) ELSE '' END),
          jsonb_build_object('shift_id', v_shift.id, 'fondo_inicial', v_shift.fondo_inicial,
                              'efectivo_neto', v_efectivo, 'gastos_total', v_gastos,
                              'efectivo_otras_cuentas', v_otros, 'otras_cuentas', v_otros_det,
                              'esperado', v_esperado, 'conteo_final', p_conteo_final,
                              'diferencia', v_diff, 'alerta_diferencia', v_alerta,
                              'authorized_by', v_authorized_by,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_shift);
END;
$function$;

REVOKE ALL ON FUNCTION public.te_close_cash_shift(numeric, numeric, double precision, double precision, uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_close_cash_shift(numeric, numeric, double precision, double precision, uuid[], text[]) TO authenticated;
