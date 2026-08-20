-- Agrega el permiso canManageCatalogSettings: acceso parcial a
-- Configuración (solo la sección Catálogo), para usuarios que no deben
-- ver Usuarios y Permisos / Notificaciones / Datos / Integraciones.
--
-- No modifica te_has_permission() -- ya es generica: primero busca un
-- override explicito en config.user_permissions -> email -> <permiso>,
-- y si no existe cae a la lista fija por rol. Un permiso nuevo que no
-- aparece en ninguna lista de rol simplemente evalua false por default,
-- asi que solo se activa via override explicito por usuario (como aqui,
-- para Areli).
--
-- Ejecutar una sola vez en Supabase SQL Editor.

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
    'canManageCatalogSettings', public.te_has_permission('canManageCatalogSettings')
  );
END;
$$;

-- Override para Areli: acceso solo a Catálogo dentro de Configuración,
-- sin Reportes ni Actividad. Merge seguro -- no pisa otras claves que ya
-- tenga (p.ej. canAddProduct/canEditProduct de sus defaults de operador
-- si en algun momento fueron sobreescritas), ni otros usuarios en el
-- mismo JSON.
INSERT INTO public.config (id, value)
VALUES (
  'user_permissions',
  jsonb_build_object(
    'areli@tresencantos.com', jsonb_build_object(
      'role', 'operador',
      'canManageCatalogSettings', true,
      'canManageSettings', false,
      'canViewReports', false,
      'canViewActivity', false
    )
  )::text
)
ON CONFLICT (id) DO UPDATE
SET value = (
  COALESCE(public.config.value::jsonb, '{}'::jsonb)
  || jsonb_build_object(
       'areli@tresencantos.com',
       COALESCE(public.config.value::jsonb -> 'areli@tresencantos.com', '{}'::jsonb)
         || jsonb_build_object(
              'role', 'operador',
              'canManageCatalogSettings', true,
              'canManageSettings', false,
              'canViewReports', false,
              'canViewActivity', false
            )
     )
)::text;
