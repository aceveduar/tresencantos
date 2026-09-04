-- ============================================================================
-- Registro de bloqueo por intentos fallidos de inicio de sesión
-- ============================================================================
-- Un intento de login fallido no tiene JWT válido por definición, así que no
-- puede usar el mismo camino que el resto de logActivity() (que exige sesión
-- autenticada, por diseño -- "nunca confiar en el cliente"). Esta función es
-- la única excepción deliberada: SECURITY DEFINER, otorgada a anon, pero
-- deliberadamente angosta -- solo registra el momento en que se activa el
-- bloqueo de 5 intentos (no cada intento individual), y nunca más de una fila
-- por email cada 10 minutos, sin importar cuántas veces se llame. Mismo
-- patrón anti-fuerza-bruta que ya usa 'override_fallido' en
-- 20260821_01_override_pin.sql, aplicado aquí al login en vez del PIN.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.te_log_failed_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_recent integer;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
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
$$;

REVOKE ALL ON FUNCTION public.te_log_failed_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_log_failed_login(text) TO anon, authenticated;
