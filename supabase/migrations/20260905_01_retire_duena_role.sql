-- =============================================================================
-- Reestructura de roles (2026-09-05): retira "dueña" como rol independiente
-- y conecta los 3 permisos nuevos de Inventario (canUseReceptionIA,
-- canReceiveStock, canImportExport) que se agregaron esta semana solo del
-- lado del cliente (shared.js/admin.js) pero nunca se conectaron aquí --
-- get_my_permissions() nunca devolvía esas 3 claves, así que activar u
-- ocultar esos permisos por persona desde Configuración no tenía ningún
-- efecto real (el cliente solo aplica un override si la clave existe en la
-- respuesta del servidor).
--
-- Por qué se retira "dueña": el rol nunca se mostró en ninguna pantalla (el
-- chip de rol se quitó de la topbar hace tiempo) y en la práctica ya se
-- abandonó -- Ofelia corre hoy como 'superadmin' literal en
-- config.user_permissions. Mantener un rol paralelo casi-pero-no-igual a
-- superadmin sin ningún beneficio visible es exactamente el tipo de
-- desalineación que causa el override-fatigue que motivó esta revisión.
--
-- Este archivo NO borra el token 'duena' de las listas de validación --
-- lo trata como alias de 'superadmin' en los 2 puntos donde se resuelve el
-- rol (get_user_role, _te_permission_for_email). Así, cualquier cuenta que
-- se hubiera quedado con ese valor en auth.users.raw_app_meta_data o en
-- config.user_permissions sigue funcionando exactamente como superadmin,
-- sin necesitar primero una migración de datos aparte ni arriesgar dejar a
-- alguien sin acceso. Las políticas RLS de `products` (fuera de alcance,
-- ver nota en 20260821_01_override_pin.sql) siguen intactas -- si alguna
-- todavía compara contra el literal 'duena', ya no importa: get_user_role()
-- nunca vuelve a devolver ese string.
--
-- Cambio de permisos real (no solo retitulado): 'canEditApartado' pasa a
-- true por default para 'encargado'. Areli (encargado) ya lo tenía activado
-- como override individual -- señal de que el default estaba desalineado
-- con lo que un encargado de confianza real necesita hacer.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase, después de
-- 20260904_07_close_shift_authorization.sql.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. get_user_role() -- usado por las políticas RLS (products, sales, config,
--    activity_log, recently_edited). Alias duena -> superadmin en los 2
--    puntos de retorno, sin tocar el resto de la lógica.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_app_role    text;
  v_config      jsonb := '{}'::jsonb;
  v_config_role text;
  v_has_config  boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'anon';
  END IF;

  SELECT lower(u.email), u.raw_app_meta_data ->> 'role'
    INTO v_email, v_app_role
  FROM auth.users u
  WHERE u.id = v_uid;

  BEGIN
    SELECT value::jsonb, true INTO v_config, v_has_config
    FROM public.config
    WHERE id = 'user_permissions';
  EXCEPTION WHEN OTHERS THEN
    v_config := '{}'::jsonb;
    v_has_config := false;
  END;

  v_config_role := v_config -> v_email ->> 'role';
  IF v_config_role IN ('superadmin', 'encargado', 'duena', 'operador') THEN
    RETURN CASE WHEN v_config_role = 'duena' THEN 'superadmin' ELSE v_config_role END;
  END IF;
  -- Si existe el mapa administrable, omitir/remover un usuario equivale a
  -- degradarlo a operador; no conserva para siempre el rol del rollout.
  IF v_has_config THEN
    RETURN 'operador';
  END IF;
  IF v_app_role IN ('superadmin', 'encargado', 'duena', 'operador') THEN
    RETURN CASE WHEN v_app_role = 'duena' THEN 'superadmin' ELSE v_app_role END;
  END IF;
  RETURN 'operador';
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. _te_permission_for_email -- misma normalización duena->superadmin, más
--    los 3 permisos nuevos conectados por rol y canEditApartado en encargado.
--    te_has_permission() ya delega aquí desde 20260821_02, no hace falta
--    tocarla.
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
      'canBulkDelete', 'canImportJSON', 'canMasivo', 'canCancelSale',
      'canEditApartado', 'canViewReports', 'canViewActivity', 'canManageSettings',
      'canOverridePrice', 'canApplyDiscount', 'canMarkTestData', 'canCloseShiftUnsupervised',
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
$$;

-- -----------------------------------------------------------------------------
-- 3. get_my_permissions() -- agrega las 3 claves nuevas a la respuesta para
--    que el cliente (admin.js `_applyUserPermsToAdmin`) reciba el override
--    real en vez de quedarse siempre en su default de arranque.
-- -----------------------------------------------------------------------------
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
    'canCloseShiftUnsupervised', public.te_has_permission('canCloseShiftUnsupervised'),
    'canUseReceptionIA', public.te_has_permission('canUseReceptionIA'),
    'canReceiveStock', public.te_has_permission('canReceiveStock'),
    'canImportExport', public.te_has_permission('canImportExport')
  );
END;
$$;

COMMIT;
