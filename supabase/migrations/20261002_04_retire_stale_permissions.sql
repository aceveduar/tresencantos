-- Permisos retirados (2026-10-02): canImportJSON y canMasivo (Carga masiva,
-- eliminada) seguían en los defaults del servidor y en get_my_permissions()
-- aunque ningún módulo los usa. Se quitan para que servidor y shared.js
-- (UP_PERMS) tengan exactamente la misma lista.

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
      'canUseReceptionIA', 'canReceiveStock', 'canImportExport'
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
    'canImportExport', public.te_has_permission('canImportExport')
  );
END;
$function$;
