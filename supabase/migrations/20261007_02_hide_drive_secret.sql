-- drive_secret deja de ser legible para cualquier sesión (2026-10-07).
--
-- Antes cualquier cuenta (también un operador nuevo) podía leer el secreto
-- y, con él, listar o mandar a la papelera archivos de Drive directo contra
-- el Apps Script. Ahora Inventario/Configuración pasan por la Edge Function
-- drive-proxy, que lee el secreto con service_role y valida permisos.
--
-- ORDEN: correr esto DESPUÉS de desplegar drive-proxy y publicar la versión
-- de la app que la usa (sw v589+). Antes de eso, la app vieja dejaría de
-- subir fotos a Drive (caería a base64, sin romper nada).

BEGIN;

-- Configuración → Integraciones necesita mostrar el secreto para pegarlo en
-- el Apps Script: solo con canManageSettings.
CREATE OR REPLACE FUNCTION public.te_get_drive_secret()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.te_has_permission('canManageSettings') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para ver el secreto de Drive';
  END IF;
  RETURN (SELECT nullif(btrim(value), '') FROM public.config WHERE id = 'drive_secret');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.te_get_drive_secret() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_get_drive_secret() TO authenticated;

DROP POLICY IF EXISTS config_auth_select ON public.config;
CREATE POLICY config_auth_select ON public.config
  FOR SELECT TO authenticated
  USING (id NOT IN ('groq_key', 'drive_secret'));

COMMIT;
