-- =============================================================================
-- Corrige dos huecos que aparecieron al quitar la política vieja y demasiado
-- permisiva de `config` ("Config is modifiable by authenticated users",
-- ALL, auth.role()='authenticated' sin filtrar por rol) -- esa política
-- dejaba escribir/borrar en `config` a cualquier usuario autenticado sin
-- importar su rol, haciendo irrelevantes a `config_insert`/`config_update`
-- (que sí exigen superadmin), y de rebote también cubría el único DELETE
-- que hace el sistema sobre esta tabla.
--
-- 1. Restaura DELETE en `config`, solo para superadmin -- `clearDrive()`
--    ("Desconectar Drive" en Configuración → Integraciones, settings.js)
--    hace DELETE directo sobre `drive_ep`/`drive_secret` y quedó sin ninguna
--    política que lo permitiera, ni siquiera para superadmin.
--
-- 2. RPC `te_save_config_value(p_id, p_value)` -- único camino para que
--    alguien con un permiso delegado (no superadmin) pueda seguir grabando
--    los ajustes que ya usaba antes de este endurecimiento:
--      - `canManageCatalogSettings` (Configuración → Catálogo): wa_float,
--        captura_rapida, show_creator, show_restock, show_recv,
--        show_recv_ia, categories, revista_url, revista_cover.
--      - `canImportExport` (Configuración → Datos): user_names.
--      - Cualquier otra llave (groq_key, drive_ep, drive_secret, y
--        cualquier id no listado arriba) sigue exigiendo `canManageSettings`
--        completo -- ningún permiso parcial la alcanza.
--    `user_permissions` queda excluida a propósito de esta RPC genérica --
--    sigue teniendo su propio camino dedicado, `te_save_user_permissions`
--    (con su propio diff/registro en Actividad), para no duplicar lógica.
--
-- Caso real que motivó esto: Areli (operador) tiene `canManageCatalogSettings`
-- activo y usa los toggles de Catálogo -- sin esta RPC, esas escrituras
-- habrían quedado bloqueadas por las mismas políticas que acabamos de
-- endurecer correctamente para cerrar el hueco de seguridad.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DELETE en config -- solo superadmin (mismo criterio que config_update).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS config_delete ON public.config;
CREATE POLICY config_delete ON public.config
  FOR DELETE
  USING (public.get_user_role() = 'superadmin');

-- -----------------------------------------------------------------------------
-- 2. te_save_config_value -- valida el permiso correcto según qué llave se
--    esté tocando, y solo entonces escribe (SECURITY DEFINER, bypasea RLS
--    una vez adentro, igual que te_save_user_permissions).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_save_config_value(p_id text, p_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_required_perm text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  IF p_id = 'user_permissions' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usa te_save_user_permissions para esta llave';
  END IF;

  v_required_perm := CASE
    WHEN p_id IN ('wa_float','captura_rapida','show_creator','show_restock',
                  'show_recv','show_recv_ia','categories','revista_url','revista_cover')
      THEN 'canManageCatalogSettings'
    WHEN p_id = 'user_names'
      THEN 'canImportExport'
    ELSE NULL
  END;

  IF NOT (
    public.te_has_permission('canManageSettings')
    OR (v_required_perm IS NOT NULL AND public.te_has_permission(v_required_perm))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para editar esta configuración';
  END IF;

  INSERT INTO public.config (id, value)
  VALUES (p_id, p_value)
  ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.te_save_config_value(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_save_config_value(text, text) TO authenticated;

COMMIT;
