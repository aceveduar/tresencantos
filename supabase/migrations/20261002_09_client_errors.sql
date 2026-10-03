-- Registro de errores de la app (2026-10-02).
--
-- Si Caja/Inventario fallan en el celular de una cajera, hoy nadie se
-- entera hasta que lo reportan (y "no sirve" no dice qué falló). shared.js
-- manda aquí los errores de JavaScript no atrapados; se ven en
-- Configuración → Datos (solo superadmin).
--
-- - Deduplica: el mismo error (persona + mensaje + origen) en 24 h solo suma
--   al contador, no crea filas nuevas.
-- - Freno: máx. 30 errores distintos por persona por hora.
-- - Textos recortados para que un stack enorme no llene la tabla.

CREATE TABLE IF NOT EXISTS public.client_errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_at     timestamptz NOT NULL DEFAULT now(),
  veces       integer NOT NULL DEFAULT 1,
  user_email  text,
  module      text,
  message     text NOT NULL,
  source      text,
  stack       text,
  url         text,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS client_errors_last_idx ON public.client_errors (last_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_errors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.client_errors TO authenticated;
DROP POLICY IF EXISTS client_errors_superadmin_select ON public.client_errors;
CREATE POLICY client_errors_superadmin_select ON public.client_errors
  FOR SELECT TO authenticated USING ((select public.get_user_role()) = 'superadmin');

CREATE OR REPLACE FUNCTION public.te_log_client_error(
  p_module text, p_message text, p_source text DEFAULT NULL, p_stack text DEFAULT NULL,
  p_url text DEFAULT NULL, p_user_agent text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_email  text := nullif(lower(auth.jwt() ->> 'email'), '');
  v_msg    text := left(btrim(coalesce(p_message, '')), 500);
  v_source text := left(p_source, 300);
  v_id     bigint;
BEGIN
  IF auth.uid() IS NULL OR v_msg = '' THEN
    RETURN;
  END IF;

  SELECT id INTO v_id FROM public.client_errors
   WHERE user_email IS NOT DISTINCT FROM v_email
     AND message = v_msg
     AND source IS NOT DISTINCT FROM v_source
     AND last_at > now() - interval '24 hours'
   ORDER BY last_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.client_errors SET veces = veces + 1, last_at = now() WHERE id = v_id;
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.client_errors
       WHERE user_email IS NOT DISTINCT FROM v_email AND created_at > now() - interval '1 hour') >= 30 THEN
    RETURN;
  END IF;

  INSERT INTO public.client_errors (user_email, module, message, source, stack, url, user_agent)
  VALUES (v_email, left(p_module, 40), v_msg, v_source, left(p_stack, 2000), left(p_url, 300), left(p_user_agent, 300));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.te_log_client_error(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_log_client_error(text, text, text, text, text, text) TO authenticated;
