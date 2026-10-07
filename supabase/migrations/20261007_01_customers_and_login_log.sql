-- Auditoría 2026-10-06, puntos medios.
--
-- 1) customers_auth_update era USING (true): cualquier cuenta (también un
--    operador nuevo) podía cambiar nombre/teléfono de cualquier clienta por
--    REST, sin rastro en Actividad. La única pantalla que edita directo es
--    Reportes → Clientes frecuentes (requiere canViewReports); Caja cambia
--    nombre/teléfono vía edit_apartado_atomic y te_find_or_create_customer
--    (SECURITY DEFINER, no dependen de esta política).
--
-- 2) te_log_failed_login (ejecutable por anon) solo frenaba por correo: con
--    correos inventados se podía llenar activity_log sin límite. Tope global
--    de 20 registros por hora.

BEGIN;

DROP POLICY IF EXISTS customers_auth_update ON public.customers;
CREATE POLICY customers_auth_update ON public.customers
  FOR UPDATE TO authenticated
  USING ((SELECT public.te_has_permission('canViewReports')))
  WITH CHECK ((SELECT public.te_has_permission('canViewReports')));

CREATE OR REPLACE FUNCTION public.te_log_failed_login(p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_email text := left(lower(btrim(p_email)), 200);
  v_recent integer;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  -- Tope global: nadie sin sesión puede llenar Actividad con correos inventados.
  IF (SELECT count(*) FROM public.activity_log
       WHERE action = 'sesion_fallida' AND created_at > now() - interval '1 hour') >= 20 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.activity_log
  WHERE action = 'sesion_fallida'
    AND meta ->> 'email' = v_email
    AND created_at > now() - interval '10 minutes';

  IF v_recent > 0 THEN
    RETURN; -- ya se registró un bloqueo reciente para este email, no repetir
  END IF;

  PERFORM public.te_log_activity(
    'sesion_fallida',
    format('Bloqueado por intentos fallidos de inicio de sesión: %s', v_email),
    jsonb_build_object('email', v_email)
  );
END;
$function$;

COMMIT;
