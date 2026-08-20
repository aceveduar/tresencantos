-- PIN de autorizacion de gerente (override puntual de un permiso bloqueado).
--
-- Escenario: Areli (operador) no tiene canOverridePrice/canApplyDiscount ni
-- puede cancelar una venta, pero Ofelia (duena) esta fuera y la autoriza por
-- telefono a hacerlo de todos modos, una sola vez. Ofelia teclea su propio
-- PIN (separado de su contrasena) en el celular de Areli, sin cerrar la
-- sesion de Areli. Mismo patron que Square POS / Shopify POS para overrides
-- de gerente.
--
-- Piezas:
--   1. user_pins + te_set_my_pin -- cada quien fija/cambia SU PROPIO PIN.
--      Nadie, ni superadmin, puede ver o resetear el PIN de otra persona.
--   2. _te_permission_for_email -- refactor de te_has_permission para poder
--      preguntar "¿fulano tiene X?" sin depender de auth.uid().
--   3. permission_overrides + te_request_override/te_override_valid/
--      te_consume_override -- tickets de un solo uso, 90s de vida.
--   4. te_permission_or_override -- helper de conveniencia para los guards.
--   5. CREATE OR REPLACE de las 5 RPC de Caja que ya validaban permisos,
--      agregando el parametro opcional p_override_tickets.
--
-- Ejecutar una sola vez en Supabase SQL Editor, despues de
-- 20260820_01_permisos_caja_y_auditoria.sql.
--
-- Nota (2026-08-21, post-ejecucion): Supabase instala pgcrypto en el
-- esquema "extensions", no en "public" -- te_set_my_pin/te_request_override
-- necesitan "extensions" en su search_path para encontrar crypt()/gen_salt().
-- Ya corregido abajo; si esto se corrio antes del fix, basta con:
--   ALTER FUNCTION public.te_set_my_pin(text) SET search_path = pg_catalog, public, extensions;
--   ALTER FUNCTION public.te_request_override(text, text, text) SET search_path = pg_catalog, public, extensions;

-- -----------------------------------------------------------------------------
-- 1. user_pins -- autoservicio, sin acceso directo de PostgREST
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_pins (
  email      text PRIMARY KEY,
  pin_hash   text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.user_pins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.te_set_my_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El PIN debe ser de 4 a 6 digitos';
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'No se pudo resolver tu email';
  END IF;

  INSERT INTO public.user_pins (email, pin_hash, updated_at)
  VALUES (v_email, crypt(p_pin, gen_salt('bf')), now())
  ON CONFLICT (email) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.te_set_my_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_set_my_pin(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. te_has_permission -- refactor para permitir consultar por email ajeno,
--    sin cambiar el comportamiento de ningun call site existente.
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
      'canOverridePrice', 'canApplyDiscount'
    )
    WHEN 'encargado' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canBulkDelete', 'canCancelSale', 'canOverridePrice', 'canApplyDiscount'
    )
    WHEN 'duena' THEN p_permission IN (
      'canAddProduct', 'canEditProduct', 'canDeleteProduct', 'canPublishProduct',
      'canEditApartado', 'canViewReports', 'canViewActivity',
      'canOverridePrice', 'canApplyDiscount'
    )
    WHEN 'operador' THEN p_permission IN ('canAddProduct', 'canEditProduct')
    ELSE false
  END;
END;
$$;
REVOKE ALL ON FUNCTION public._te_permission_for_email(text, text) FROM PUBLIC;

-- get_user_role() (definida en 20260818_01) ya resuelve el rol desde
-- auth.jwt()/auth.uid() para la sesion activa -- _te_permission_for_email
-- necesita hacerlo por email ajeno, por eso repite esa parte en vez de
-- reutilizarla. te_has_permission ahora es un wrapper de una linea:
CREATE OR REPLACE FUNCTION public.te_has_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  RETURN public._te_permission_for_email(v_email, p_permission);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. permission_overrides -- tickets de un solo uso, 90s de vida
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permission_overrides (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission       text NOT NULL,
  granted_to_uid   uuid NOT NULL,
  granted_by_email text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz
);
REVOKE ALL ON public.permission_overrides FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS permission_overrides_lookup_idx
  ON public.permission_overrides (granted_to_uid, permission, used_at, expires_at);

CREATE OR REPLACE FUNCTION public.te_request_override(
  p_permission text,
  p_authorizer_email text,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_actor_uid     uuid := auth.uid();
  v_actor_email   text := lower(auth.jwt() ->> 'email');
  v_email         text := lower(btrim(p_authorizer_email));
  v_authorizer_uid uuid;
  v_hash          text;
  v_recent_fails  integer;
  v_ticket        uuid;
  v_expires_at    timestamptz;
BEGIN
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  -- Freno anti-fuerza-bruta: 5 intentos fallidos en 10 min por quien pide
  -- la autorizacion, sin siquiera mirar el PIN de este intento.
  SELECT count(*) INTO v_recent_fails
  FROM public.activity_log
  WHERE action = 'override_fallido'
    AND user_email = v_actor_email
    AND created_at > now() - interval '10 minutes';
  IF v_recent_fails >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Demasiados intentos — espera unos minutos';
  END IF;

  SELECT u.id INTO v_authorizer_uid FROM auth.users u WHERE lower(u.email) = v_email;

  SELECT pin_hash INTO v_hash FROM public.user_pins WHERE email = v_email;

  IF v_authorizer_uid IS NULL OR v_hash IS NULL OR crypt(p_pin, v_hash) <> v_hash THEN
    PERFORM public.te_log_activity(
      'override_fallido',
      format('Intento de autorizacion fallido para "%s" (autorizador: %s)', p_permission, COALESCE(v_email, 'desconocido')),
      jsonb_build_object('permission', p_permission, 'attempted_authorizer', v_email)
    );
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PIN o autorización inválida';
  END IF;

  IF NOT public._te_permission_for_email(v_email, p_permission) THEN
    PERFORM public.te_log_activity(
      'override_fallido',
      format('%s no tiene el permiso "%s" para autorizar', v_email, p_permission),
      jsonb_build_object('permission', p_permission, 'attempted_authorizer', v_email)
    );
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Esa persona tampoco tiene ese permiso';
  END IF;

  -- 5 minutos -- suficiente para terminar de armar la venta y cobrar, corto
  -- para que no quede una autorizacion abierta olvidada en el dispositivo.
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
$$;
REVOKE ALL ON FUNCTION public.te_request_override(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_request_override(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.te_override_valid(p_ticket uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.permission_overrides o
    WHERE o.id = p_ticket
      AND o.permission = p_permission
      AND o.granted_to_uid = auth.uid()
      AND o.used_at IS NULL
      AND o.expires_at > now()
  );
$$;
REVOKE ALL ON FUNCTION public.te_override_valid(uuid, text) FROM PUBLIC;

-- Marca el ticket usado (una sola vez) y regresa quien autorizo, para que
-- el llamador lo anote en el log de actividad de la accion real. NULL si
-- el ticket no era valido.
CREATE OR REPLACE FUNCTION public.te_consume_override(p_ticket uuid, p_permission text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text;
BEGIN
  UPDATE public.permission_overrides o
  SET used_at = now()
  WHERE o.id = p_ticket
    AND o.permission = p_permission
    AND o.granted_to_uid = auth.uid()
    AND o.used_at IS NULL
    AND o.expires_at > now()
  RETURNING o.granted_by_email INTO v_email;
  RETURN v_email;
END;
$$;
REVOKE ALL ON FUNCTION public.te_consume_override(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.te_permission_or_override(p_permission text, p_tickets uuid[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.te_has_permission(p_permission) THEN
    RETURN true;
  END IF;
  IF p_tickets IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM unnest(p_tickets) t WHERE public.te_override_valid(t, p_permission)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.te_permission_or_override(text, uuid[]) FROM PUBLIC;

-- Encuentra, entre los tickets recibidos, el que sirve para p_permission y
-- lo consume. Helper compartido para no repetir la subconsulta en cada RPC.
CREATE OR REPLACE FUNCTION public.te_consume_matching_override(p_permission text, p_tickets uuid[])
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ticket uuid;
BEGIN
  IF p_tickets IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT t INTO v_ticket FROM unnest(p_tickets) t WHERE public.te_override_valid(t, p_permission) LIMIT 1;
  IF v_ticket IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.te_consume_override(v_ticket, p_permission);
END;
$$;
REVOKE ALL ON FUNCTION public.te_consume_matching_override(text, uuid[]) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 4a. te_snapshot_sale_items -- admite tickets para el override de precio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_snapshot_sale_items(p_items jsonb, p_override_tickets uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item              jsonb;
  v_component         jsonb;
  v_product           public.products%ROWTYPE;
  v_raw_id            numeric;
  v_raw_qty           numeric;
  v_raw_price         numeric;
  v_raw_component_id  numeric;
  v_raw_component_qty numeric;
  v_id                bigint;
  v_qty               integer;
  v_component_id      bigint;
  v_component_qty     integer;
  v_price             numeric;
  v_name              text;
  v_kit_snapshot      jsonb;
  v_snapshot          jsonb := '[]'::jsonb;
  v_normalized        jsonb;
  v_catalog_price     numeric;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La venta debe tener al menos un producto';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_raw_id := public.te_try_numeric(v_item ->> 'id');
    v_raw_qty := public.te_try_numeric(v_item ->> 'qty');
    v_raw_price := public.te_try_numeric(v_item ->> 'price');

    IF v_raw_id IS NULL OR v_raw_id <= 0 OR v_raw_id <> trunc(v_raw_id)
       OR v_raw_id > 9223372036854775807::numeric THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Producto sin id valido';
    END IF;
    v_id := v_raw_id::bigint;

    IF v_raw_qty IS NULL OR v_raw_qty <= 0 OR v_raw_qty <> trunc(v_raw_qty)
       OR v_raw_qty > 2147483647::numeric THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('Cantidad invalida para producto id=%s', v_id);
    END IF;
    v_qty := v_raw_qty::integer;

    v_price := round(v_raw_price, 2);
    IF NOT public.te_numeric_is_finite(v_price) OR v_price < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('Precio invalido para producto id=%s', v_id);
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Producto id=%s no existe', v_id);
    END IF;

    -- Precio modificado respecto al catalogo -- requiere permiso explicito o
    -- un ticket de autorizacion valido para canOverridePrice.
    v_catalog_price := round(COALESCE(v_product.price, 0), 2);
    IF v_price <> v_catalog_price THEN
      IF NOT public.te_permission_or_override('canOverridePrice', p_override_tickets) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format('Sin permiso para modificar el precio de "%s"', v_product.name);
      END IF;
    END IF;

    v_name := COALESCE(NULLIF(btrim(v_item ->> 'name'), ''), v_product.name);
    v_normalized := jsonb_build_object(
      'id', v_id,
      'name', v_name,
      'price', v_price,
      'qty', v_qty,
      'subtotal', round(v_price * v_qty, 2)
    );

    -- Congela el precio real de catalogo cuando hubo override -- antes este
    -- dato se perdia por completo al llegar aqui, sin dejar rastro permanente.
    IF v_price <> v_catalog_price THEN
      v_normalized := v_normalized || jsonb_build_object('original_price', v_catalog_price);
    END IF;

    -- Valida y normaliza el kit que vive en base. Asi el snapshot nunca puede
    -- redondear un id/cantidad fraccional hacia otro producto por un cast.
    v_kit_snapshot := '[]'::jsonb;
    IF jsonb_typeof(v_product.kit_items) = 'array' THEN
      FOR v_component IN SELECT value FROM jsonb_array_elements(v_product.kit_items)
      LOOP
        v_raw_component_id := public.te_try_numeric(v_component ->> 'id');
        v_raw_component_qty := COALESCE(public.te_try_numeric(v_component ->> 'qty'), 1);

        IF v_raw_component_id IS NULL OR v_raw_component_id <= 0
           OR v_raw_component_id <> trunc(v_raw_component_id)
           OR v_raw_component_id > 9223372036854775807::numeric THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = format('Kit id=%s contiene un componente sin id valido', v_id);
        END IF;
        IF v_raw_component_qty <= 0 OR v_raw_component_qty <> trunc(v_raw_component_qty)
           OR v_raw_component_qty > 2147483647::numeric THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = format('Kit id=%s contiene una cantidad invalida', v_id);
        END IF;

        v_component_id := v_raw_component_id::bigint;
        v_component_qty := v_raw_component_qty::integer;
        v_kit_snapshot := v_kit_snapshot || jsonb_build_array(jsonb_build_object(
          'id', v_component_id,
          'name', NULLIF(btrim(v_component ->> 'name'), ''),
          'qty', v_component_qty
        ));
      END LOOP;
    END IF;

    -- Tambien se guarda [] para un producto regular. La presencia de la llave
    -- hace el snapshot autoritativo si ese producto se convierte en kit luego.
    v_normalized := v_normalized || jsonb_build_object(
      'kit_items', v_kit_snapshot,
      'kit_snapshot_estimated', false
    );

    v_snapshot := v_snapshot || jsonb_build_array(v_normalized);
  END LOOP;

  RETURN v_snapshot;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4b. record_sale_atomic_v2 -- admite p_override_tickets para descuento y,
--     via te_snapshot_sale_items, para precio.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sale_atomic_v2(
  p_request_id uuid,
  p_items jsonb,
  p_total numeric,
  p_discount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'efectivo',
  p_note text DEFAULT NULL,
  p_is_apartado boolean DEFAULT false,
  p_paid_amount numeric DEFAULT NULL,
  p_customer text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operation      constant text := 'record_sale_v2';
  v_cached         jsonb;
  v_response       jsonb;
  v_items          jsonb;
  v_sale_id        bigint;
  v_parent_ids     bigint[];
  v_product_ids    bigint[];
  v_subtotal       numeric;
  v_discount       numeric;
  v_total          numeric;
  v_paid           numeric;
  v_tendered       numeric;
  v_origin         text;
  v_status         text;
  v_type           text;
  v_now            timestamptz := now();
  v_abonos         jsonb;
  v_customer       text := NULLIF(btrim(p_customer), '');
  v_actor_email    text := lower(auth.jwt() ->> 'email');
  v_short_customer text;
  v_shortage       record;
  v_price_overridden boolean;
  v_authorized_by  text;
  v_authorized_price_by text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  PERFORM set_config('tresencantos.rpc_v2', 'on', true);

  -- Todos los RPC de inventario toman el mismo advisory lock antes de filas.
  PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La venta debe tener productos';
  END IF;
  IF lower(COALESCE(p_payment_method, '')) NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Metodo de pago invalido';
  END IF;
  IF p_is_apartado AND v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El cliente es obligatorio para un apartado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT public.te_try_numeric(x.item ->> 'id') AS raw_id
      FROM jsonb_array_elements(p_items) AS x(item)
    ) q
    WHERE raw_id IS NULL OR raw_id <= 0 OR raw_id <> trunc(raw_id)
       OR raw_id > 9223372036854775807::numeric
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Hay productos con id invalido';
  END IF;

  SELECT array_agg(DISTINCT q.raw_id::bigint ORDER BY q.raw_id::bigint)
    INTO v_parent_ids
  FROM (
    SELECT public.te_try_numeric(x.item ->> 'id') AS raw_id
    FROM jsonb_array_elements(p_items) AS x(item)
  ) q;

  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_parent_ids)
  ORDER BY p.id
  FOR UPDATE;

  IF (SELECT COUNT(*) FROM public.products p WHERE p.id = ANY(v_parent_ids))
     <> COALESCE(array_length(v_parent_ids, 1), 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Uno o mas productos ya no existen';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = ANY(v_parent_ids) AND COALESCE(p.is_archived, false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Un producto fue archivado; recarga la caja antes de cobrar';
  END IF;

  v_items := public.te_snapshot_sale_items(p_items, p_override_tickets);
  v_price_overridden := EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e.value ? 'original_price'
  );
  IF v_price_overridden AND NOT public.te_has_permission('canOverridePrice') THEN
    v_authorized_price_by := public.te_consume_matching_override('canOverridePrice', p_override_tickets);
    IF v_authorized_price_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización de precio inválida o expirada';
    END IF;
  END IF;

  SELECT COALESCE(SUM((x.item ->> 'subtotal')::numeric), 0)
    INTO v_subtotal
  FROM jsonb_array_elements(v_items) AS x(item);

  v_discount := round(COALESCE(p_discount, 0), 2);
  IF NOT public.te_numeric_is_finite(v_discount)
     OR v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descuento invalido';
  END IF;
  IF v_discount > 0 AND NOT public.te_permission_or_override('canApplyDiscount', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para aplicar descuentos';
  END IF;
  IF v_discount > 0 AND NOT public.te_has_permission('canApplyDiscount') THEN
    v_authorized_by := public.te_consume_matching_override('canApplyDiscount', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización de descuento inválida o expirada';
    END IF;
  END IF;
  v_authorized_by := COALESCE(v_authorized_by, v_authorized_price_by);
  v_total := round(v_subtotal - v_discount, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El total debe ser mayor a cero';
  END IF;
  IF NOT public.te_numeric_is_finite(p_total)
     OR abs(round(p_total, 2) - v_total) >= 0.005 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('El total cambio: esperado %s, recibido %s', v_total, COALESCE(p_total, 0));
  END IF;

  IF p_is_apartado THEN
    v_paid := round(COALESCE(p_paid_amount, 0), 2);
    IF NOT public.te_numeric_is_finite(v_paid)
       OR v_paid < 0 OR v_paid > v_total THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El anticipo no puede superar el total';
    END IF;
    v_tendered := v_paid;
    v_origin := 'apartado';
    IF v_paid >= v_total THEN
      v_status := 'liquidado'; v_type := 'venta';
    ELSE
      v_status := 'activo'; v_type := 'apartado';
    END IF;
  ELSE
    v_paid := v_total;
    v_tendered := round(COALESCE(p_paid_amount, v_total), 2);
    IF NOT public.te_numeric_is_finite(v_tendered) OR v_tendered < v_total THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El pago no cubre el total';
    END IF;
    v_origin := 'venta'; v_status := 'liquidado'; v_type := 'venta';
  END IF;

  SELECT array_agg(d.product_id ORDER BY d.product_id)
    INTO v_product_ids
  FROM public.te_inventory_demand(v_items) d;

  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_product_ids)
  ORDER BY p.id
  FOR UPDATE;

  IF (SELECT COUNT(*) FROM public.products p WHERE p.id = ANY(v_product_ids))
     <> COALESCE(array_length(v_product_ids, 1), 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Un componente del kit ya no existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = ANY(v_product_ids) AND COALESCE(p.is_archived, false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Un producto o componente fue archivado; recarga la caja antes de cobrar';
  END IF;

  SELECT d.product_id, d.required_qty, COALESCE(p.stock, 0) AS stock
    INTO v_shortage
  FROM public.te_inventory_demand(v_items) d
  JOIN public.products p ON p.id = d.product_id
  WHERE COALESCE(p.stock, 0) < d.required_qty
  ORDER BY d.product_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('Sin stock suficiente para producto id=%s (disponible %s, requerido %s)',
                       v_shortage.product_id, v_shortage.stock, v_shortage.required_qty);
  END IF;

  v_abonos := CASE
    WHEN p_is_apartado AND v_paid > 0 THEN jsonb_build_array(jsonb_build_object(
      'amount', v_paid,
      'method', lower(p_payment_method),
      'date', v_now,
      'request_id', p_request_id,
      'collected_by', v_actor_email,
      'kind', 'payment'
    ))
    ELSE NULL
  END;

  INSERT INTO public.sales (
    total, items, discount, payment_method, note, type, paid_amount,
    customer, due_date, seller_email, abonos,
    origin_type, status, liquidated_at, last_payment_at, updated_at, version
  ) VALUES (
    v_total,
    v_items,
    NULLIF(v_discount, 0),
    lower(p_payment_method),
    NULLIF(btrim(p_note), ''),
    v_type,
    v_tendered,
    v_customer,
    CASE WHEN p_is_apartado THEN p_due_date ELSE NULL END,
    v_actor_email,
    v_abonos,
    v_origin,
    v_status,
    CASE WHEN v_status = 'liquidado' THEN v_now ELSE NULL END,
    CASE WHEN (NOT p_is_apartado) OR v_paid > 0 THEN v_now ELSE NULL END,
    v_now,
    0
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.sale_payments (
    sale_id, request_id, kind, amount, method, paid_at,
    collected_by, collected_by_email, is_estimated, source, meta
  )
  SELECT
    v_sale_id,
    p_request_id,
    'payment',
    CASE WHEN p_is_apartado THEN v_paid ELSE v_total END,
    lower(p_payment_method),
    v_now,
    auth.uid(),
    v_actor_email,
    false,
    CASE WHEN p_is_apartado THEN 'rpc_apartado_initial' ELSE 'rpc_direct_sale' END,
    jsonb_build_object('origin_type', v_origin)
  WHERE (NOT p_is_apartado) OR v_paid > 0;

  WITH demand AS (
    SELECT * FROM public.te_inventory_demand(v_items)
  )
  UPDATE public.products p
  SET stock = COALESCE(p.stock, 0) - d.required_qty
  FROM demand d
  WHERE p.id = d.product_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_short_customer := COALESCE(split_part(v_customer, ' · ', 1), 'cliente');
  IF p_is_apartado AND v_status = 'activo' THEN
    PERFORM public.te_log_activity(
      'apartado_nuevo',
      format('Apartado de %s — $%s%s', v_short_customer, v_total,
             CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END),
      jsonb_build_object(
        'id', v_sale_id, 'customer', v_short_customer, 'total', v_total,
        'anticipo', v_paid, 'pendiente', v_total - v_paid,
        'dueDate', p_due_date, 'items', jsonb_array_length(v_items),
        'itemIds', to_jsonb(v_parent_ids), 'itemsDetail', v_items,
        'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
        'request_id', p_request_id
      )
    );
  ELSIF p_is_apartado THEN
    PERFORM public.te_log_activity(
      'apartado_liquidado',
      format('Apartado pagado completo de %s — $%s%s', v_short_customer, v_total,
             CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END),
      jsonb_build_object(
        'id', v_sale_id, 'customer', v_short_customer, 'total', v_total,
        'method', lower(p_payment_method), 'items', jsonb_array_length(v_items),
        'itemIds', to_jsonb(v_parent_ids), 'itemsDetail', v_items,
        'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
        'request_id', p_request_id
      )
    );
  ELSE
    PERFORM public.te_log_activity(
      'venta',
      format('Cobro $%s — %s producto(s)%s', v_total, jsonb_array_length(v_items),
             CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END),
      jsonb_build_object(
        'id', v_sale_id, 'total', v_total, 'method', lower(p_payment_method),
        'discount', v_discount, 'items', jsonb_array_length(v_items),
        'itemIds', to_jsonb(v_parent_ids), 'itemsDetail', v_items,
        'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
        'request_id', p_request_id
      )
    );
  END IF;

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'liquidated', (v_status = 'liquidado'),
    'sale', jsonb_build_object(
      'id', v_sale_id,
      'origin_type', v_origin,
      'status', v_status,
      'type', v_type,
      'total', v_total,
      'paid_amount', CASE WHEN p_is_apartado THEN v_paid ELSE v_tendered END,
      'remaining', CASE WHEN p_is_apartado THEN v_total - v_paid ELSE 0 END,
      'liquidated_at', CASE WHEN v_status = 'liquidado' THEN v_now ELSE NULL END,
      'version', 0
    ),
    'products', public.te_products_state(v_product_ids)
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, v_sale_id, v_response);
  RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4c. edit_apartado_atomic -- admite p_override_tickets para precio (via
--     te_snapshot_sale_items) y descuento.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_apartado_atomic(
  p_request_id uuid,
  p_sale_id bigint,
  p_items jsonb,
  p_expected_version bigint,
  p_discount numeric DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operation   constant text := 'edit_apartado_v2';
  v_cached      jsonb;
  v_response    jsonb;
  v_sale        public.sales%ROWTYPE;
  v_items       jsonb;
  v_parent_ids  bigint[];
  v_product_ids bigint[];
  v_subtotal    numeric;
  v_discount    numeric;
  v_total       numeric;
  v_paid        numeric;
  v_now         timestamptz := now();
  v_is_final    boolean;
  v_shortage    record;
  v_customer    text;
  v_price_overridden boolean;
  v_authorized_by text;
  v_authorized_price_by text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_permission_or_override('canEditApartado', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para editar apartados';
  END IF;
  IF NOT public.te_has_permission('canEditApartado') THEN
    v_authorized_by := public.te_consume_matching_override('canEditApartado', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  PERFORM set_config('tresencantos.rpc_v2', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Apartado no encontrado';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_sale.version THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'El apartado cambio en otro dispositivo; vuelve a cargarlo';
  END IF;
  IF v_sale.origin_type <> 'apartado' OR v_sale.status <> 'activo' OR v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo se puede editar un apartado activo';
  END IF;
  PERFORM public.te_assert_authoritative_inventory_snapshot(v_sale.items, 'editar el inventario del apartado');

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El apartado debe conservar al menos un producto';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT public.te_try_numeric(x.item ->> 'id') AS raw_id
      FROM jsonb_array_elements(p_items) AS x(item)
    ) q
    WHERE raw_id IS NULL OR raw_id <= 0 OR raw_id <> trunc(raw_id)
       OR raw_id > 9223372036854775807::numeric
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Hay productos con id invalido';
  END IF;

  SELECT array_agg(DISTINCT q.raw_id::bigint ORDER BY q.raw_id::bigint)
    INTO v_parent_ids
  FROM (
    SELECT public.te_try_numeric(x.item ->> 'id') AS raw_id
    FROM jsonb_array_elements(p_items) AS x(item)
  ) q;

  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_parent_ids)
  ORDER BY p.id
  FOR UPDATE;
  IF (SELECT COUNT(*) FROM public.products p WHERE p.id = ANY(v_parent_ids))
     <> COALESCE(array_length(v_parent_ids, 1), 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Uno o mas productos ya no existen';
  END IF;

  -- Para productos que ya pertenecian al apartado, conserva el snapshot del
  -- kit guardado en la fila bloqueada. Solo productos nuevos toman la
  -- composicion actual; nunca se acepta kit_items enviado por el navegador.
  v_items := public.te_preserve_item_kit_snapshots(
    public.te_snapshot_sale_items(p_items, p_override_tickets),
    v_sale.items
  );
  v_price_overridden := EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e.value ? 'original_price'
  );
  IF v_price_overridden AND NOT public.te_has_permission('canOverridePrice') THEN
    v_authorized_price_by := public.te_consume_matching_override('canOverridePrice', p_override_tickets);
    IF v_authorized_price_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización de precio inválida o expirada';
    END IF;
  END IF;

  -- Un producto padre archivado puede conservarse o reducirse para resolver
  -- un apartado previo, pero nunca agregarse/aumentarse desde un carrito stale.
  IF EXISTS (
    WITH old_parent AS (
      SELECT
        public.te_require_positive_bigint(i.item ->> 'id', 'id de producto') AS product_id,
        SUM(public.te_require_positive_bigint(COALESCE(i.item ->> 'qty', '1'), 'cantidad de producto')) AS qty
      FROM jsonb_array_elements(v_sale.items) i(item)
      GROUP BY 1
    ), new_parent AS (
      SELECT
        public.te_require_positive_bigint(i.item ->> 'id', 'id de producto') AS product_id,
        SUM(public.te_require_positive_bigint(COALESCE(i.item ->> 'qty', '1'), 'cantidad de producto')) AS qty
      FROM jsonb_array_elements(v_items) i(item)
      GROUP BY 1
    )
    SELECT 1
    FROM new_parent n
    LEFT JOIN old_parent o USING (product_id)
    JOIN public.products p ON p.id = n.product_id
    WHERE n.qty > COALESCE(o.qty, 0)
      AND COALESCE(p.is_archived, false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'No se puede agregar o aumentar un producto archivado; recarga el inventario';
  END IF;

  -- Subtotales no dependen del snapshot preservado, pero se recalculan tras la
  -- fusion para mantener una sola fuente de verdad en este bloque.
  SELECT COALESCE(SUM((x.item ->> 'subtotal')::numeric), 0)
    INTO v_subtotal
  FROM jsonb_array_elements(v_items) AS x(item);

  v_discount := round(COALESCE(p_discount, v_sale.discount, 0), 2);
  IF NOT public.te_numeric_is_finite(v_discount)
     OR v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descuento invalido';
  END IF;
  IF v_discount <> round(COALESCE(v_sale.discount, 0), 2) THEN
    IF NOT public.te_permission_or_override('canApplyDiscount', p_override_tickets) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para modificar el descuento';
    END IF;
    IF NOT public.te_has_permission('canApplyDiscount') THEN
      v_authorized_by := public.te_consume_matching_override('canApplyDiscount', p_override_tickets);
      IF v_authorized_by IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización de descuento inválida o expirada';
      END IF;
    END IF;
  END IF;
  v_authorized_by := COALESCE(v_authorized_by, v_authorized_price_by);
  v_total := round(v_subtotal - v_discount, 2);
  v_paid := round(COALESCE(v_sale.paid_amount, 0), 2);
  IF NOT public.te_numeric_is_finite(v_total)
     OR NOT public.te_numeric_is_finite(v_paid)
     OR v_total <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El total debe ser mayor a cero';
  END IF;
  IF v_total < v_paid THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('El total ($%s) no puede ser menor a lo pagado ($%s); registra una devolucion explicita', v_total, v_paid);
  END IF;
  v_is_final := v_paid >= v_total;

  SELECT array_agg(id ORDER BY id)
    INTO v_product_ids
  FROM (
    SELECT product_id AS id FROM public.te_inventory_demand(v_sale.items)
    UNION
    SELECT product_id AS id FROM public.te_inventory_demand(v_items)
  ) ids;

  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_product_ids)
  ORDER BY p.id
  FOR UPDATE;
  IF (SELECT COUNT(*) FROM public.products p WHERE p.id = ANY(v_product_ids))
     <> COALESCE(array_length(v_product_ids, 1), 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Un producto o componente historico ya no existe';
  END IF;

  IF EXISTS (
    WITH old_demand AS (
      SELECT * FROM public.te_inventory_demand(v_sale.items)
    ), new_demand AS (
      SELECT * FROM public.te_inventory_demand(v_items)
    ), delta AS (
      SELECT
        COALESCE(n.product_id, o.product_id) AS product_id,
        COALESCE(n.required_qty, 0) - COALESCE(o.required_qty, 0) AS qty
      FROM old_demand o
      FULL JOIN new_demand n USING (product_id)
    )
    SELECT 1
    FROM delta d
    JOIN public.products p ON p.id = d.product_id
    WHERE d.qty > 0 AND COALESCE(p.is_archived, false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'No se puede aumentar inventario reservado de un producto o componente archivado';
  END IF;

  WITH old_demand AS (
    SELECT * FROM public.te_inventory_demand(v_sale.items)
  ), new_demand AS (
    SELECT * FROM public.te_inventory_demand(v_items)
  ), delta AS (
    SELECT
      COALESCE(n.product_id, o.product_id) AS product_id,
      COALESCE(n.required_qty, 0) - COALESCE(o.required_qty, 0) AS qty
    FROM old_demand o
    FULL JOIN new_demand n USING (product_id)
  )
  SELECT d.product_id, d.qty, COALESCE(p.stock, 0) AS stock
    INTO v_shortage
  FROM delta d
  JOIN public.products p ON p.id = d.product_id
  WHERE d.qty > 0 AND COALESCE(p.stock, 0) < d.qty
  ORDER BY d.product_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format('Sin stock para aumentar producto id=%s (disponible %s, requerido %s)',
                       v_shortage.product_id, v_shortage.stock, v_shortage.qty);
  END IF;

  WITH old_demand AS (
    SELECT * FROM public.te_inventory_demand(v_sale.items)
  ), new_demand AS (
    SELECT * FROM public.te_inventory_demand(v_items)
  ), delta AS (
    SELECT
      COALESCE(n.product_id, o.product_id) AS product_id,
      COALESCE(n.required_qty, 0) - COALESCE(o.required_qty, 0) AS qty
    FROM old_demand o
    FULL JOIN new_demand n USING (product_id)
  )
  UPDATE public.products p
  SET stock = COALESCE(p.stock, 0) - d.qty
  FROM delta d
  WHERE p.id = d.product_id AND d.qty <> 0;

  UPDATE public.sales
  SET
    items = v_items,
    total = v_total,
    discount = NULLIF(v_discount, 0),
    type = CASE WHEN v_is_final THEN 'venta' ELSE 'apartado' END,
    status = CASE WHEN v_is_final THEN 'liquidado' ELSE 'activo' END,
    liquidated_at = CASE WHEN v_is_final THEN v_now ELSE NULL END,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(split_part(v_sale.customer, ' · ', 1), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_editado',
    format('Edito apartado de %s — nuevo total $%s%s', v_customer, v_total,
           CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END),
    jsonb_build_object(
      'id', p_sale_id, 'customer', v_customer, 'total', v_total,
      'discount', v_discount, 'itemsDetail', v_items,
      'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
      'request_id', p_request_id
    )
  );
  IF v_is_final THEN
    PERFORM public.te_log_activity(
      'apartado_liquidado',
      format('Apartado de %s quedo liquidado al editar el total', v_customer),
      jsonb_build_object(
        'id', p_sale_id, 'customer', v_customer, 'total', v_total,
        'amount', 0, 'no_cash_movement', true, 'itemsDetail', v_items,
        'request_id', p_request_id
      )
    );
  END IF;

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'liquidated', v_is_final,
    'sale', jsonb_build_object(
      'id', p_sale_id,
      'origin_type', 'apartado',
      'type', CASE WHEN v_is_final THEN 'venta' ELSE 'apartado' END,
      'status', CASE WHEN v_is_final THEN 'liquidado' ELSE 'activo' END,
      'total', v_total,
      'paid_amount', v_paid,
      'remaining', v_total - v_paid,
      'liquidated_at', CASE WHEN v_is_final THEN v_now ELSE NULL END,
      'version', v_sale.version + 1,
      'items', v_items,
      'discount', NULLIF(v_discount, 0)
    ),
    'products', public.te_products_state(v_product_ids)
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4d. cancel_sale_atomic -- admite p_override_tickets para canCancelSale/canEditApartado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_sale_atomic(
  p_request_id uuid,
  p_sale_id bigint,
  p_reason text,
  p_expected_version bigint,
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operation     constant text := 'cancel_sale_v2';
  v_cached        jsonb;
  v_response      jsonb;
  v_sale          public.sales%ROWTYPE;
  v_now           timestamptz := now();
  v_product_ids   bigint[];
  v_refund_amount numeric := 0;
  v_refund_entries jsonb := '[]'::jsonb;
  v_customer      text;
  v_item_count    integer;
  v_actor_email   text := lower(auth.jwt() ->> 'email');
  v_authorized_by text;
  v_used_permission text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  PERFORM set_config('tresencantos.rpc_v2', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Venta no encontrada';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_sale.version THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'La venta cambio en otro dispositivo; vuelve a cargarla';
  END IF;

  IF v_sale.cancelled_at IS NOT NULL OR v_sale.status = 'cancelado' THEN
    v_response := jsonb_build_object(
      'ok', true, 'operation', v_operation, 'request_id', p_request_id,
      'already_cancelled', true,
      'sale', jsonb_build_object(
        'id', p_sale_id, 'type', 'venta', 'status', 'cancelado',
        'cancelled_at', v_sale.cancelled_at, 'version', v_sale.version
      ),
      'products', '[]'::jsonb
    );
    PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
    RETURN v_response;
  END IF;

  IF v_sale.origin_type = 'apartado' AND v_sale.status = 'activo' THEN
    v_used_permission := CASE WHEN public.te_permission_or_override('canEditApartado', p_override_tickets)
                               THEN 'canEditApartado' ELSE 'canCancelSale' END;
    IF NOT (public.te_permission_or_override('canEditApartado', p_override_tickets)
            OR public.te_permission_or_override('canCancelSale', p_override_tickets)) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para cancelar este apartado';
    END IF;
  ELSE
    v_used_permission := 'canCancelSale';
    IF NOT public.te_permission_or_override('canCancelSale', p_override_tickets) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para cancelar ventas';
    END IF;
  END IF;
  IF NOT public.te_has_permission(v_used_permission) THEN
    v_authorized_by := public.te_consume_matching_override(v_used_permission, p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;

  PERFORM public.te_assert_authoritative_inventory_snapshot(v_sale.items, 'cancelar y restaurar stock');

  SELECT array_agg(d.product_id ORDER BY d.product_id)
    INTO v_product_ids
  FROM public.te_inventory_demand(v_sale.items) d;

  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_product_ids)
  ORDER BY p.id
  FOR UPDATE;
  IF (SELECT COUNT(*) FROM public.products p WHERE p.id = ANY(v_product_ids))
     <> COALESCE(array_length(v_product_ids, 1), 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Un producto historico ya no existe; no se cancelo nada';
  END IF;

  -- La UI promete devolucion al cancelar. Siempre devuelve el neto recibido,
  -- separado por sus metodos originales; si el neto es cero no crea movimientos.
  v_refund_entries := public.te_refund_sale_balance(
    p_sale_id, p_request_id, 'rpc_sale_cancellation_refund', p_reason, v_now
  );
  SELECT round(COALESCE(SUM(abs((e.entry ->> 'amount')::numeric)), 0), 2)
    INTO v_refund_amount
  FROM jsonb_array_elements(v_refund_entries) AS e(entry);

  WITH demand AS (
    SELECT * FROM public.te_inventory_demand(v_sale.items)
  )
  UPDATE public.products p
  SET stock = COALESCE(p.stock, 0) + d.required_qty,
      out_of_stock = false
  FROM demand d
  WHERE p.id = d.product_id;

  UPDATE public.sales
  SET
    cancelled_at = v_now,
    type = 'venta',
    status = 'cancelado',
    paid_amount = CASE WHEN v_refund_amount > 0 THEN 0 ELSE paid_amount END,
    abonos = CASE
      WHEN jsonb_array_length(v_refund_entries) > 0 THEN
        (CASE WHEN jsonb_typeof(abonos) = 'array' THEN abonos ELSE '[]'::jsonb END)
        || v_refund_entries
      ELSE abonos
    END,
    last_payment_at = CASE WHEN jsonb_array_length(v_refund_entries) > 0 THEN v_now ELSE last_payment_at END,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(split_part(v_sale.customer, ' · ', 1), 'cliente');
  v_item_count := CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN jsonb_array_length(v_sale.items) ELSE 0 END;

  IF v_sale.origin_type = 'apartado' THEN
    PERFORM public.te_log_activity(
      'apartado_cancelado',
      format('Cancelo apartado de %s — $%s', v_customer, v_sale.total),
      jsonb_build_object(
        'id', p_sale_id, 'customer', v_customer, 'total', v_sale.total,
        'pagado', v_sale.paid_amount, 'refund', v_refund_amount,
        'refunds', v_refund_entries, 'reason', NULLIF(btrim(p_reason), ''),
        'items', v_item_count,
        'itemIds', COALESCE((
          SELECT jsonb_agg(public.te_try_numeric(i.item ->> 'id')::bigint)
          FROM jsonb_array_elements(v_sale.items) i(item)
          WHERE public.te_try_numeric(i.item ->> 'id') IS NOT NULL
        ), '[]'::jsonb),
        'itemsDetail', v_sale.items,
        'dueDate', v_sale.due_date, 'authorized_by', v_authorized_by, 'request_id', p_request_id
      )
    );
  ELSE
    PERFORM public.te_log_activity(
      'venta_cancelada',
      format('Cancelo venta de $%s — %s producto(s)', v_sale.total, v_item_count),
      jsonb_build_object(
        'id', p_sale_id, 'total', v_sale.total, 'refund', v_refund_amount,
        'refunds', v_refund_entries, 'reason', NULLIF(btrim(p_reason), ''),
        'items', v_item_count,
        'itemIds', COALESCE((
          SELECT jsonb_agg(public.te_try_numeric(i.item ->> 'id')::bigint)
          FROM jsonb_array_elements(v_sale.items) i(item)
          WHERE public.te_try_numeric(i.item ->> 'id') IS NOT NULL
        ), '[]'::jsonb),
        'itemsDetail', v_sale.items, 'authorized_by', v_authorized_by, 'request_id', p_request_id
      )
    );
  END IF;

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'already_cancelled', false,
    'sale', jsonb_build_object(
      'id', p_sale_id,
      'origin_type', v_sale.origin_type,
      'type', 'venta',
      'status', 'cancelado',
      'cancelled_at', v_now,
      'refund_amount', v_refund_amount,
      'refunds', v_refund_entries,
      'version', v_sale.version + 1
    ),
    'products', public.te_products_state(v_product_ids)
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4e. refund_apartado_atomic -- admite p_override_tickets para canEditApartado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_apartado_atomic(
  p_request_id uuid,
  p_sale_id bigint,
  p_reason text,
  p_expected_version bigint,
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_operation      constant text := 'refund_apartado';
  v_cached         jsonb;
  v_response       jsonb;
  v_sale           public.sales%ROWTYPE;
  v_now            timestamptz := now();
  v_refunds        jsonb;
  v_refund_amount  numeric;
  v_product_ids    bigint[];
  v_customer       text;
  v_authorized_by  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  IF NOT public.te_permission_or_override('canEditApartado', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para devolver pagos de apartados';
  END IF;
  IF NOT public.te_has_permission('canEditApartado') THEN
    v_authorized_by := public.te_consume_matching_override('canEditApartado', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;
  PERFORM set_config('tresencantos.rpc_v2', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Apartado no encontrado';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_sale.version THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'El apartado cambio en otro dispositivo; vuelve a cargarlo';
  END IF;
  IF v_sale.origin_type <> 'apartado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El registro no es un apartado';
  END IF;
  IF v_sale.cancelled_at IS NOT NULL OR v_sale.status = 'cancelado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El apartado esta cancelado';
  END IF;

  SELECT array_agg(d.product_id ORDER BY d.product_id)
    INTO v_product_ids
  FROM public.te_inventory_demand(v_sale.items) d;
  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_product_ids)
  ORDER BY p.id
  FOR UPDATE;

  v_refunds := public.te_refund_sale_balance(
    p_sale_id, p_request_id, 'rpc_apartado_refund', p_reason, v_now
  );
  SELECT round(COALESCE(SUM(abs((e.entry ->> 'amount')::numeric)), 0), 2)
    INTO v_refund_amount
  FROM jsonb_array_elements(v_refunds) AS e(entry);
  IF v_refund_amount <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El apartado no tiene pagos por devolver';
  END IF;

  UPDATE public.sales
  SET
    paid_amount = 0,
    abonos = (CASE WHEN jsonb_typeof(abonos) = 'array' THEN abonos ELSE '[]'::jsonb END) || v_refunds,
    type = 'apartado',
    status = 'activo',
    liquidated_at = NULL,
    last_payment_at = v_now,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);
  v_customer := COALESCE(split_part(v_sale.customer, ' · ', 1), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_reembolso',
    format('Devolvio $%s del apartado de %s', v_refund_amount, v_customer),
    jsonb_build_object(
      'id', p_sale_id, 'customer', v_customer, 'refund', v_refund_amount,
      'refunds', v_refunds, 'reason', NULLIF(btrim(p_reason), ''),
      'items', CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN jsonb_array_length(v_sale.items) ELSE 0 END,
      'itemIds', COALESCE((
        SELECT jsonb_agg(public.te_require_positive_bigint(i.item ->> 'id', 'id de producto'))
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN v_sale.items ELSE '[]'::jsonb END
        ) i(item)
      ), '[]'::jsonb),
      'itemsDetail', v_sale.items, 'authorized_by', v_authorized_by, 'request_id', p_request_id
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'refunded', true,
    'refund_amount', v_refund_amount,
    'refunds', v_refunds,
    'sale', jsonb_build_object(
      'id', p_sale_id, 'origin_type', 'apartado', 'type', 'apartado',
      'status', 'activo', 'paid_amount', 0, 'remaining', v_sale.total,
      'liquidated_at', NULL, 'version', v_sale.version + 1
    ),
    'products', public.te_products_state(v_product_ids)
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$$;
