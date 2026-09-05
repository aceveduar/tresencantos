-- =============================================================================
-- Verificación de ubicación (no bloqueante) al abrir/cerrar caja y al
-- marcar entrada/salida.
--
-- Eduardo preguntó si se puede exigir que estas acciones solo se hagan
-- dentro de la tienda -- un navegador no tiene forma de saber "estás
-- conectado al wifi de la tienda" (no se expone por privacidad), y la IP
-- pública no sirve porque con datos móviles (no wifi de la tienda) la IP es
-- la de la compañía celular aunque la persona esté físicamente adentro. La
-- única señal real disponible es la Geolocation API del navegador (GPS/red),
-- que puede fallar por 50-150m en interiores -- por eso esto NO bloquea
-- nada: solo calcula qué tan lejos está el punto reportado del local y lo
-- deja registrado en Actividad (meta.distancia_m / meta.lejos_del_local),
-- visible para Ofelia/Eduardo. Que alguien mienta con GPS falso sigue
-- siendo posible; esto atrapa el caso real descrito (decir que ya llegó sin
-- estar ahí), no una garantía de seguridad.
--
-- Coordenadas del local (Hacienda 1424, Maquixco, Teotihuacán de Arista,
-- Méx. 55840) y radio de tolerancia (150m, cubre imprecisión de GPS en
-- interiores) -- ambos hardcodeados en _te_distance_to_store_m() /
-- _te_is_far_from_store(); si la tienda cambia de dirección, actualizar ahí.
--
-- Como agrega parámetros (p_lat/p_lng) a 4 funciones ya existentes, se
-- eliminan las firmas viejas antes de recrearlas -- un CREATE OR REPLACE con
-- distinta lista de parámetros crea un overload nuevo en vez de reemplazar
-- (mismo detalle ya documentado para edit_apartado_atomic en CLAUDE.md), lo
-- que puede causar ambigüedad en PostgREST. DROP + CREATE evita eso.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- Helper: distancia en metros del punto reportado al local (NULL si no se
-- pudo obtener ubicación). Fórmula esférica estándar, suficiente a esta
-- escala (metros/kilómetros, no requiere PostGIS).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._te_distance_to_store_m(p_lat double precision, p_lng double precision)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_lat IS NULL OR p_lng IS NULL THEN NULL::numeric ELSE
    ROUND((6371000 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(19.686827213571508)) * cos(radians(p_lat)) * cos(radians(p_lng) - radians(-98.89047855889557))
        + sin(radians(19.686827213571508)) * sin(radians(p_lat))
      ))
    ))::numeric, 0)
  END;
$$;

CREATE OR REPLACE FUNCTION public._te_is_far_from_store(p_lat double precision, p_lng double precision)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public._te_distance_to_store_m(p_lat, p_lng) > 150;
$$;

-- -----------------------------------------------------------------------------
-- te_open_cash_shift -- +p_lat/p_lng opcionales
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.te_open_cash_shift(numeric);

CREATE FUNCTION public.te_open_cash_shift(p_fondo_inicial numeric, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email     text;
  v_open      public.cash_shifts;
  v_new       public.cash_shifts;
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
  IF v_email = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No se pudo identificar el usuario';
  END IF;
  IF p_fondo_inicial IS NULL OR p_fondo_inicial < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Fondo inicial inválido';
  END IF;

  SELECT * INTO v_open FROM public.cash_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY opened_at DESC LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.cash_shifts
       SET status = 'cerrado_auto', closed_at = now()
     WHERE id = v_open.id;

    INSERT INTO public.activity_log(action, user_email, summary, meta)
    VALUES ('turno_cerrado_auto', v_email,
            'Turno anterior cerrado automáticamente (sin conteo) al abrir uno nuevo',
            jsonb_build_object('shift_id', v_open.id, 'opened_at', v_open.opened_at));
  END IF;

  INSERT INTO public.cash_shifts(user_email, fondo_inicial, status)
  VALUES (v_email, p_fondo_inicial, 'abierto')
  RETURNING * INTO v_new;

  INSERT INTO public.activity_log(action, user_email, summary, meta)
  VALUES ('turno_abierto', v_email,
          format('Abrió caja con fondo de $%s', trim(to_char(p_fondo_inicial, 'FM999,999,990.00'))) || v_loc_txt,
          jsonb_build_object('shift_id', v_new.id, 'fondo_inicial', p_fondo_inicial,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.te_open_cash_shift(numeric, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_open_cash_shift(numeric, double precision, double precision) TO authenticated;

-- -----------------------------------------------------------------------------
-- te_close_cash_shift -- +p_lat/p_lng opcionales
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.te_close_cash_shift(numeric, numeric);

CREATE FUNCTION public.te_close_cash_shift(p_conteo_final numeric, p_gastos_total numeric DEFAULT 0, p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
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
                 trim(to_char(abs(v_diff), 'FM999,999,990.00'))) || v_loc_txt,
          jsonb_build_object('shift_id', v_shift.id, 'fondo_inicial', v_shift.fondo_inicial,
                              'efectivo_neto', v_efectivo, 'gastos_total', v_gastos,
                              'esperado', v_esperado, 'conteo_final', p_conteo_final,
                              'diferencia', v_diff, 'alerta_diferencia', v_alerta,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_shift);
END;
$$;

REVOKE ALL ON FUNCTION public.te_close_cash_shift(numeric, numeric, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_close_cash_shift(numeric, numeric, double precision, double precision) TO authenticated;

-- -----------------------------------------------------------------------------
-- te_clock_in -- +p_lat/p_lng opcionales
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.te_clock_in();

CREATE FUNCTION public.te_clock_in(p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email     text;
  v_open      public.attendance_shifts;
  v_new       public.attendance_shifts;
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
  IF v_email = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No se pudo identificar el usuario';
  END IF;

  SELECT * INTO v_open FROM public.attendance_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY entrada_at DESC LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.attendance_shifts
       SET status = 'cerrado_auto'
     WHERE id = v_open.id;

    INSERT INTO public.activity_log(action, user_email, summary, meta)
    VALUES ('checador_salida_olvidada', v_email,
            'No registró su salida antes de la siguiente entrada',
            jsonb_build_object('attendance_id', v_open.id, 'entrada_at', v_open.entrada_at));
  END IF;

  INSERT INTO public.attendance_shifts(user_email, status)
  VALUES (v_email, 'abierto')
  RETURNING * INTO v_new;

  INSERT INTO public.activity_log(action, user_email, summary, meta)
  VALUES ('checador_entrada', v_email, 'Registró su entrada' || v_loc_txt,
          jsonb_build_object('attendance_id', v_new.id,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.te_clock_in(double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_clock_in(double precision, double precision) TO authenticated;

-- -----------------------------------------------------------------------------
-- te_clock_out -- +p_lat/p_lng opcionales
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.te_clock_out();

CREATE FUNCTION public.te_clock_out(p_lat double precision DEFAULT NULL, p_lng double precision DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email     text;
  v_shift     public.attendance_shifts;
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

  SELECT * INTO v_shift FROM public.attendance_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY entrada_at DESC LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No tienes una entrada registrada';
  END IF;

  UPDATE public.attendance_shifts
     SET status = 'cerrado', salida_at = now()
   WHERE id = v_shift.id
   RETURNING * INTO v_shift;

  INSERT INTO public.activity_log(action, user_email, summary, meta)
  VALUES ('checador_salida', v_email, 'Registró su salida' || v_loc_txt,
          jsonb_build_object('attendance_id', v_shift.id, 'entrada_at', v_shift.entrada_at,
                              'salida_at', v_shift.salida_at,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_shift);
END;
$$;

REVOKE ALL ON FUNCTION public.te_clock_out(double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_clock_out(double precision, double precision) TO authenticated;

COMMIT;
