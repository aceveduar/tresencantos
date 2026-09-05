-- =============================================================================
-- Autorización para cerrar turno con una diferencia grande.
--
-- Auditoría de permisos (2026-09-04): cambiar el precio al cobrar, aplicar
-- un descuento, cancelar una venta o editar un apartado ya exigen el
-- permiso correspondiente o el PIN de un gerente si no se tiene (patrón
-- "PIN de autorización de gerente", 20260821_01_override_pin.sql). Cerrar
-- un turno con, por ejemplo, -$3,000 de faltante no pedía nada -- cualquiera
-- podía autocerrarse sin que nadie más se enterara hasta que Ofelia lo
-- notara después en Reportes. Esta migración aplica el mismo mecanismo ya
-- existente (te_permission_or_override/te_consume_matching_override) a
-- te_close_cash_shift, reutilizando el patrón, no reinventándolo.
--
-- Nuevo permiso `canCloseShiftUnsupervised` -- default true para
-- superadmin/encargado/duena (ya son roles de confianza para dinero: tienen
-- canOverridePrice/canApplyDiscount), false para operador (igual criterio
-- que el resto de overrides de Caja).
--
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- 20260904_04_location_check.sql.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. _te_permission_for_email / get_my_permissions -- agregan
--    canCloseShiftUnsupervised (misma firma, CREATE OR REPLACE normal).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._te_permission_for_email(p_email text, p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role        text;
  v_permissions jsonb;
  v_user        jsonb;
  v_override    jsonb;
BEGIN
  IF p_email IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(m.raw_app_meta_data ->> 'role', 'operador') INTO v_role
  FROM auth.users m
  WHERE lower(m.email) = lower(p_email);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    SELECT value::jsonb
      INTO v_permissions
    FROM public.config
    WHERE id = 'user_permissions';
  EXCEPTION WHEN OTHERS THEN
    v_permissions := '{}'::jsonb;
  END;

  v_user := COALESCE(v_permissions -> lower(p_email), '{}'::jsonb);
  IF jsonb_typeof(v_user -> 'role') = 'string'
     AND (v_user ->> 'role') IN ('superadmin', 'encargado', 'duena', 'operador') THEN
    v_role := v_user ->> 'role';
  END IF;

  v_override := v_user -> p_permission;
  IF jsonb_typeof(v_override) = 'boolean' THEN
    RETURN (v_override #>> '{}')::boolean;
  END IF;

  RETURN CASE v_role
    WHEN 'superadmin' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canBulkDelete', 'canImportJSON', 'canMasivo', 'canCancelSale',
      'canEditApartado', 'canViewReports', 'canViewActivity', 'canManageSettings',
      'canOverridePrice', 'canApplyDiscount', 'canMarkTestData', 'canCloseShiftUnsupervised'
    )
    WHEN 'encargado' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canBulkDelete', 'canCancelSale', 'canOverridePrice', 'canApplyDiscount',
      'canCloseShiftUnsupervised'
    )
    WHEN 'duena' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canEditApartado', 'canViewReports', 'canViewActivity',
      'canOverridePrice', 'canApplyDiscount', 'canCloseShiftUnsupervised'
    )
    WHEN 'operador' THEN p_permission IN ('canAddProduct', 'canEditProduct')
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  v_role := public.get_user_role();
  RETURN jsonb_build_object(
    'role', v_role,
    'canAddProduct', public.te_has_permission('canAddProduct'),
    'canEditProduct', public.te_has_permission('canEditProduct'),
    'canDeleteProduct', public.te_has_permission('canDeleteProduct'),
    'canPublishProduct', public.te_has_permission('canPublishProduct'),
    'canBulkDelete', public.te_has_permission('canBulkDelete'),
    'canImportJSON', public.te_has_permission('canImportJSON'),
    'canMasivo', public.te_has_permission('canMasivo'),
    'canCancelSale', public.te_has_permission('canCancelSale'),
    'canEditApartado', public.te_has_permission('canEditApartado'),
    'canViewReports', public.te_has_permission('canViewReports'),
    'canViewActivity', public.te_has_permission('canViewActivity'),
    'canManageSettings', public.te_has_permission('canManageSettings'),
    'canManageCatalogSettings', public.te_has_permission('canManageCatalogSettings'),
    'canOverridePrice', public.te_has_permission('canOverridePrice'),
    'canApplyDiscount', public.te_has_permission('canApplyDiscount'),
    'canMarkTestData', public.te_has_permission('canMarkTestData'),
    'canCloseShiftUnsupervised', public.te_has_permission('canCloseShiftUnsupervised')
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. te_close_cash_shift -- +p_override_tickets (nuevo parámetro -> DROP +
--    CREATE, mismo motivo que 20260904_04: evitar overload ambiguo).
--    Diferencia grande (>= $100, mismo umbral que la alerta) sin el permiso
--    exige un ticket válido de canCloseShiftUnsupervised.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.te_close_cash_shift(numeric, numeric, double precision, double precision);

CREATE FUNCTION public.te_close_cash_shift(
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
  v_gastos    numeric := coalesce(p_gastos_total, 0);
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

REVOKE ALL ON FUNCTION public.te_close_cash_shift(numeric, numeric, double precision, double precision, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_close_cash_shift(numeric, numeric, double precision, double precision, uuid[]) TO authenticated;

COMMIT;
