-- Permiso independiente canMarkTestData para "marcar como prueba"
-- (is_test) -- antes exigia canManageSettings, lo que obligaba a dar
-- acceso completo a Configuracion solo para poder ocultar una venta de
-- prueba. Default: solo superadmin: true; ajustable por override
-- individual igual que el resto de UP_PERMS (shared.js).
--
-- Ejecutar una sola vez en Supabase SQL Editor, despues de
-- 20260820_02_is_test_flag.sql.

CREATE OR REPLACE FUNCTION public.te_has_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  RETURN public._te_permission_for_email(v_email, p_permission);
END;
$$;

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
      'canOverridePrice', 'canApplyDiscount', 'canMarkTestData'
    )
    WHEN 'encargado' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canBulkDelete', 'canCancelSale', 'canOverridePrice', 'canApplyDiscount'
    )
    WHEN 'duena' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canEditApartado', 'canViewReports', 'canViewActivity',
      'canOverridePrice', 'canApplyDiscount'
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
    'canMarkTestData', public.te_has_permission('canMarkTestData')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.te_set_sale_test_flag(p_sale_id bigint, p_is_test boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_customer text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_has_permission('canMarkTestData') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para marcar pruebas';
  END IF;

  UPDATE public.sales SET is_test = p_is_test WHERE id = p_sale_id
  RETURNING customer INTO v_customer;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Venta no encontrada';
  END IF;

  PERFORM public.te_log_activity(
    'configuracion_editada',
    format('%s venta/apartado #%s (%s) como prueba',
      CASE WHEN p_is_test THEN 'Marcó' ELSE 'Desmarcó' END,
      p_sale_id, COALESCE(NULLIF(btrim(v_customer), ''), 'sin cliente')),
    jsonb_build_object('sale_id', p_sale_id, 'is_test', p_is_test)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
