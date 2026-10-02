-- La clave de Groq deja de ser legible desde el navegador (2026-10-02).
--
-- Las llamadas a la IA pasan por la Edge Function groq-proxy, que lee la
-- clave con la service_role key. Para el cliente basta saber si hay una
-- clave configurada (mostrar "Configura la IA" o "✓ Configurado").
-- Escribirla sigue siendo vía te_save_config_value (exige canManageSettings).

CREATE OR REPLACE FUNCTION public.te_ai_configured()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.config WHERE id = 'groq_key' AND coalesce(btrim(value), '') <> '');
$function$;
REVOKE EXECUTE ON FUNCTION public.te_ai_configured() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_ai_configured() TO authenticated;

DROP POLICY IF EXISTS config_auth_select ON public.config;
CREATE POLICY config_auth_select ON public.config FOR SELECT TO authenticated USING (id <> 'groq_key');
