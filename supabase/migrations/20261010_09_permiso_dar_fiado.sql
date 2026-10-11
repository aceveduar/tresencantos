-- Permiso "Dar fiado" (canGiveCredit, 2026-10-10).
--
-- Marcar un apartado como fiado ("se lo lleva hoy": la persona se lleva el
-- producto sin terminar de pagar) es prestar mercancía. Antes bastaba
-- "Editar apartados", que las encargadas tienen; ahora es un permiso propio:
-- solo superadmin por defecto; encargadas/operadores lo hacen con el PIN de
-- quien lo tenga, o se les activa en Configuración → Usuarios y Permisos.
-- (Todo permiso nuevo va también en shared.js: UP_PERMS / UP_ROLE_DEFAULTS.)
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_09_permiso_dar_fiado.sql

BEGIN;

CREATE OR REPLACE FUNCTION public._te_permission_for_email(p_email text, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  IF v_role = 'duena' THEN v_role := 'superadmin'; END IF;

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
    IF v_role = 'duena' THEN v_role := 'superadmin'; END IF;
  END IF;

  v_override := v_user -> p_permission;
  IF jsonb_typeof(v_override) = 'boolean' THEN
    RETURN (v_override #>> '{}')::boolean;
  END IF;

  RETURN CASE v_role
    WHEN 'superadmin' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canBulkDelete', 'canCancelSale',
      'canEditApartado', 'canViewReports', 'canViewActivity', 'canManageSettings',
      'canOverridePrice', 'canApplyDiscount', 'canCloseShiftUnsupervised',
      'canUseReceptionIA', 'canReceiveStock', 'canImportExport', 'canGiveCredit'
    )
    WHEN 'encargado' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canBulkDelete', 'canCancelSale', 'canEditApartado', 'canOverridePrice',
      'canApplyDiscount', 'canCloseShiftUnsupervised', 'canUseReceptionIA', 'canReceiveStock'
    )
    WHEN 'operador' THEN p_permission IN ('canAddProduct', 'canEditProduct', 'canReceiveStock')
    ELSE false
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    'canCancelSale', public.te_has_permission('canCancelSale'),
    'canEditApartado', public.te_has_permission('canEditApartado'),
    'canViewReports', public.te_has_permission('canViewReports'),
    'canViewActivity', public.te_has_permission('canViewActivity'),
    'canManageSettings', public.te_has_permission('canManageSettings'),
    'canManageCatalogSettings', public.te_has_permission('canManageCatalogSettings'),
    'canOverridePrice', public.te_has_permission('canOverridePrice'),
    'canApplyDiscount', public.te_has_permission('canApplyDiscount'),
    'canCloseShiftUnsupervised', public.te_has_permission('canCloseShiftUnsupervised'),
    'canUseReceptionIA', public.te_has_permission('canUseReceptionIA'),
    'canReceiveStock', public.te_has_permission('canReceiveStock'),
    'canImportExport', public.te_has_permission('canImportExport'),
    'canGiveCredit', public.te_has_permission('canGiveCredit')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.te_set_apartado_se_lo_llevo(p_sale_id bigint, p_value boolean, p_override_tickets uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_product_ids bigint[];
  v_authorized_by text;
  v_customer text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_permission_or_override('canGiveCredit', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para dar fiado: pide el PIN de Ofelia';
  END IF;
  IF NOT public.te_has_permission('canGiveCredit') THEN
    v_authorized_by := public.te_consume_matching_override('canGiveCredit', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;
  PERFORM set_config('tresencantos.rpc_v2', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR v_sale.origin_type <> 'apartado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Apartado no encontrado';
  END IF;
  IF v_sale.status <> 'activo' OR v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo se puede cambiar en un apartado activo';
  END IF;
  IF v_sale.se_lo_llevo = COALESCE(p_value, false) THEN
    RETURN jsonb_build_object('ok', true, 'se_lo_llevo', v_sale.se_lo_llevo, 'version', v_sale.version);
  END IF;

  UPDATE public.sales
     SET se_lo_llevo = COALESCE(p_value, false), updated_at = now(), version = version + 1
   WHERE id = p_sale_id;

  SELECT array_agg(d.product_id) INTO v_product_ids FROM public.te_inventory_demand(v_sale.items) d;
  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(NULLIF(split_part(v_sale.customer, ' · ', 1), ''), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_editado',
    CASE WHEN p_value THEN format('Marcó que %s se llevó su apartado (fiado)', v_customer)
         ELSE format('Quitó la marca de fiado del apartado de %s', v_customer) END,
    jsonb_build_object('id', p_sale_id, 'customer', v_customer, 'se_lo_llevo', COALESCE(p_value, false),
                       'authorized_by', v_authorized_by)
  );
  RETURN jsonb_build_object('ok', true, 'se_lo_llevo', COALESCE(p_value, false), 'version', v_sale.version + 1);
END;
$function$;

COMMIT;
