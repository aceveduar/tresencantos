-- ============================================================================
-- 20260930_05_config_inventory_keys.sql
--
-- Inventario escribía directo a `config` en 4 lugares (categorías desde la hoja
-- de categorías, "Marcar para revisión", descartar un duplicado y pegar la
-- clave de Groq). Desde el endurecimiento de `config` (2026-09-12) solo
-- superadmin puede escribir directo, así que para cualquier otra persona esas
-- acciones fallaban en silencio — incluidas las marcas que Recepción con IA
-- pone sola en cada producto nuevo.
--
-- Ahora todo pasa por te_save_config_value, que gana dos llaves:
--   flagged_products, dismissed_dups → canEditProduct (tareas de inventario)
-- `categories` ya estaba (canManageCatalogSettings) y `groq_key` sigue
-- exigiendo canManageSettings completo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.te_save_config_value(p_id text, p_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    WHEN p_id IN ('flagged_products','dismissed_dups')
      THEN 'canEditProduct'
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
$function$;
