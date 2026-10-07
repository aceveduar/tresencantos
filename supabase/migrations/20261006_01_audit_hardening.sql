-- Auditoría 2026-10-06: tres huecos encontrados y verificados contra la base real.
--
-- 1) Borrado real sin permiso. products_update deja a cualquier rol escribir
--    created_by/created_at/id. Una cajera sin canDeleteProduct podía poner
--    created_by=ella y created_at=now() en CUALQUIER producto y luego llamar
--    te_undo_duplicate_product → DELETE real, sin pasar por te_delete_products
--    (sin permiso, sin revisar apartados activos, sin registro en Actividad).
--    Arreglo: esas columnas son inmutables para usuarios de la API.
--
-- 2) PIN de gerente sin freno real. te_request_override registraba el intento
--    fallido y luego hacía RAISE: la excepción revierte la transacción completa,
--    incluido el registro, así que el contador de "5 intentos en 10 min" siempre
--    leía 0 (en producción había 0 override_fallido contra 8 autorizaciones).
--    Un PIN de 4 dígitos se podía adivinar a fuerza bruta en minutos.
--    Arreglo: los fallos regresan {ok:false, message} (el registro sí se guarda;
--    shared.js ya muestra data.message) y se agrega un tope por autorizador.
--
-- 3) XSS guardado vía URL de imagen. Todos los módulos (incluida la Tienda
--    pública) pintan products.image/images dentro de src="…" sin escapar. Un
--    operador podía guardar  x" onerror="…  por REST y ejecutar código en la
--    sesión de una superadmin o en la Tienda. Arreglo: CHECK en BD que solo
--    acepta https://, data:image/ o img/ sin comillas, <, > ni espacios.

BEGIN;

-- ── 1) Columnas inmutables de products ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.te_products_immutable_cols()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Solo aplica a llamadas de la API (con JWT); migraciones y service_role pasan.
  IF auth.uid() IS NOT NULL AND (
       NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'No se puede cambiar el id, la fecha de creación ni el creador de un producto';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.te_products_immutable_cols() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS te_products_immutable_cols_trg ON public.products;
CREATE TRIGGER te_products_immutable_cols_trg
  BEFORE UPDATE OF id, created_at, created_by ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.te_products_immutable_cols();

-- ── 2) PIN de gerente: fallos que sí cuentan ────────────────────────────────
CREATE OR REPLACE FUNCTION public.te_request_override(p_permission text, p_authorizer_email text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
  v_actor_uid      uuid := auth.uid();
  v_actor_email    text := lower(auth.jwt() ->> 'email');
  v_email          text := lower(btrim(p_authorizer_email));
  v_authorizer_uid uuid;
  v_hash           text;
  v_recent_fails   integer;
  v_target_fails   integer;
  v_ticket         uuid;
  v_expires_at     timestamptz;
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  -- Los fallos NO hacen RAISE: una excepción revertiría el registro del
  -- intento y el contador de abajo nunca subiría.

  -- Freno por quien pide: 5 fallos en 10 min.
  SELECT count(*) INTO v_recent_fails
  FROM public.activity_log
  WHERE action = 'override_fallido'
    AND user_email = v_actor_email
    AND created_at > now() - interval '10 minutes';
  IF v_recent_fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Demasiados intentos — espera unos minutos');
  END IF;

  -- Freno por autorizador (aunque se turnen varias cuentas): 10 fallos en 1 h.
  SELECT count(*) INTO v_target_fails
  FROM public.activity_log
  WHERE action = 'override_fallido'
    AND meta ->> 'attempted_authorizer' = v_email
    AND created_at > now() - interval '1 hour';
  IF v_target_fails >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'El PIN de esa persona está bloqueado por intentos fallidos — espera una hora');
  END IF;

  SELECT u.id INTO v_authorizer_uid FROM auth.users u WHERE lower(u.email) = v_email;
  SELECT pin_hash INTO v_hash FROM public.user_pins WHERE email = v_email;

  IF v_authorizer_uid IS NULL OR v_hash IS NULL OR crypt(p_pin, v_hash) <> v_hash THEN
    PERFORM public.te_log_activity(
      'override_fallido',
      format('Intento de autorizacion fallido para "%s" (autorizador: %s)', p_permission, COALESCE(v_email, 'desconocido')),
      jsonb_build_object('permission', p_permission, 'attempted_authorizer', v_email)
    );
    RETURN jsonb_build_object('ok', false, 'message', 'PIN o autorización inválida');
  END IF;

  IF NOT public._te_permission_for_email(v_email, p_permission) THEN
    PERFORM public.te_log_activity(
      'override_fallido',
      format('%s no tiene el permiso "%s" para autorizar', v_email, p_permission),
      jsonb_build_object('permission', p_permission, 'attempted_authorizer', v_email)
    );
    RETURN jsonb_build_object('ok', false, 'message', 'Esa persona tampoco tiene ese permiso');
  END IF;

  INSERT INTO public.permission_overrides (permission, granted_to_uid, granted_by_email, expires_at)
  VALUES (p_permission, v_actor_uid, v_email, now() + interval '5 minutes')
  RETURNING id, expires_at INTO v_ticket, v_expires_at;

  PERFORM public.te_log_activity(
    'permiso_autorizado',
    format('%s autorizó "%s" a %s', v_email, p_permission, v_actor_email),
    jsonb_build_object('permission', p_permission, 'authorized_by', v_email, 'authorized_for', v_actor_email)
  );

  RETURN jsonb_build_object('ok', true, 'ticket', v_ticket, 'expires_at', v_expires_at);
END;
$function$;

-- ── 3) URLs de imagen seguras ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.te_is_safe_img_url(p_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT p_url IS NULL OR p_url ~ '^(https://|data:image/|img/)[^"''<>[:space:]`]*$';
$function$;

CREATE OR REPLACE FUNCTION public.te_are_safe_img_urls(p_urls jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p_urls IS NULL
      OR jsonb_typeof(p_urls) <> 'array'
      OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_urls) e
            WHERE jsonb_typeof(e) <> 'string'
               OR NOT public.te_is_safe_img_url(e #>> '{}')
         );
$function$;

-- Datos viejos: 2 placeholders SVG con comillas simples (ningún código actual
-- los genera). En un data URL '%27' equivale a la comilla.
UPDATE public.products
   SET image = replace(replace(image, '''', '%27'), ' ', '%20')
 WHERE image LIKE 'data:image/svg+xml,%'
   AND NOT public.te_is_safe_img_url(image);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_image_safe;
ALTER TABLE public.products ADD CONSTRAINT products_image_safe
  CHECK (public.te_is_safe_img_url(image) AND public.te_are_safe_img_urls(images));

COMMIT;
