-- Turno de caja con varios dispositivos (2026-10-10).
--
-- La misma cuenta puede tener Caja abierta en la tablet del local y en su
-- celular. Dos huecos que esto corrige:
--
--   1. Abrir caja con un turno ya abierto HOY lo cerraba sin conteo y abría
--      otro desde cero: el efectivo y los gastos anteriores quedaban fuera
--      del corte. Ahora te_open_cash_shift regresa el turno abierto
--      ({..., reused: true}). Un turno de un día anterior se sigue cerrando
--      solo (cerrado_auto), como antes.
--   2. Un dispositivo que no se enteró de que el turno se cerró en otro podía
--      seguir cobrando: ese efectivo caía entre dos turnos y no salía en
--      ningún corte. Ahora vender y abonar exigen caja abierta de quien
--      captura (te_assert_open_shift, HINT 'shift_closed' para que Caja
--      muestre "Abrir caja"). "Ya lo cobró Ofelia" no cambia: se revisa el
--      turno de quien teclea, no el de a quien se atribuye.
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_03_turno_varios_dispositivos.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.te_assert_open_shift()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_shifts
     WHERE user_email = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND status = 'abierto'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Tu caja está cerrada (se cerró en otro dispositivo). Ábrela para seguir cobrando.',
      HINT = 'shift_closed';
  END IF;
END;
$function$;
-- Auxiliar interna: solo la llaman otras SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.te_assert_open_shift() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.te_open_cash_shift(p_fondo_inicial numeric, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_email     text;
  v_open      public.cash_shifts;
  v_new       public.cash_shifts;
  v_distancia numeric := public._te_distance_to_store_m(p_lat, p_lng);
  v_lejos     boolean := coalesce(public._te_is_far_from_store(p_lat, p_lng), false);
  v_loc_txt   text := CASE
                         WHEN v_distancia IS NULL THEN ' · 📍 sin ubicación'
                         WHEN v_lejos THEN format(' · 📍 %s km del local', trim(to_char(v_distancia / 1000.0, 'FM999990.0')))
                         ELSE ''
                       END;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_email := lower(coalesce(auth.jwt()->>'email', ''));
  IF v_email = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No se pudo identificar el usuario';
  END IF;
  IF p_fondo_inicial IS NULL OR p_fondo_inicial < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Fondo inicial inválido';
  END IF;

  SELECT * INTO v_open FROM public.cash_shifts
   WHERE user_email = v_email AND status = 'abierto'
   ORDER BY opened_at DESC LIMIT 1
   FOR UPDATE;

  -- Ya hay caja abierta HOY (otro dispositivo de la misma cuenta, o la
  -- pantalla de "Abrir caja" se quedó a la vista): se reutiliza ese turno.
  -- Antes se cerraba sin conteo y el efectivo/gastos previos quedaban fuera
  -- del corte nuevo. El cierre automático queda solo para turnos olvidados
  -- de días anteriores.
  IF FOUND AND (v_open.opened_at AT TIME ZONE 'America/Mexico_City')::date
               = (now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RETURN to_jsonb(v_open) || jsonb_build_object('reused', true);
  END IF;

  IF FOUND THEN
    UPDATE public.cash_shifts
       SET status = 'cerrado_auto', closed_at = now()
     WHERE id = v_open.id;

    INSERT INTO public.activity_log(action, user_email, summary, meta)
    VALUES ('turno_cerrado_auto', v_email,
            'Turno anterior cerrado automáticamente (sin conteo) al abrir uno nuevo',
            jsonb_build_object('shift_id', v_open.id, 'opened_at', v_open.opened_at));
  END IF;

  INSERT INTO public.cash_shifts(user_email, fondo_inicial, status)
  VALUES (v_email, p_fondo_inicial, 'abierto')
  RETURNING * INTO v_new;

  INSERT INTO public.activity_log(action, user_email, summary, meta)
  VALUES ('turno_abierto', v_email,
          format('Abrió caja con fondo de $%s', trim(to_char(p_fondo_inicial, 'FM999,999,990.00'))) || v_loc_txt,
          jsonb_build_object('shift_id', v_new.id, 'fondo_inicial', p_fondo_inicial,
                              'lat', p_lat, 'lng', p_lng, 'distancia_m', v_distancia, 'lejos_del_local', v_lejos));

  RETURN to_jsonb(v_new);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_sale_atomic_v2(p_request_id uuid, p_items jsonb, p_total numeric, p_discount numeric DEFAULT 0, p_payment_method text DEFAULT 'efectivo'::text, p_note text DEFAULT NULL::text, p_is_apartado boolean DEFAULT false, p_paid_amount numeric DEFAULT NULL::numeric, p_customer text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_override_tickets uuid[] DEFAULT NULL::uuid[], p_customer_id bigint DEFAULT NULL::bigint, p_collected_by_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_collected_by_email text;
  v_collected_note text;
  v_short_customer text;
  v_shortage       record;
  v_price_overridden boolean;
  v_authorized_by  text;
  v_authorized_price_by text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  v_collected_by_email := NULLIF(lower(btrim(p_collected_by_email)), '');
  IF v_collected_by_email IS NOT NULL AND v_collected_by_email <> v_actor_email THEN
    IF NOT public._te_is_superadmin_email(v_collected_by_email) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo se puede atribuir un cobro a una cuenta de dueño/a';
    END IF;
  END IF;
  v_collected_note := CASE
    WHEN v_collected_by_email IS NOT NULL AND v_collected_by_email <> v_actor_email
      THEN format(' · cobrado por %s', split_part(v_collected_by_email, '@', 1))
    ELSE ''
  END;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  -- Cobrar exige caja abierta de quien captura (después del replay: un
  -- reintento de algo que ya quedó guardado regresa su respuesta igual).
  PERFORM public.te_assert_open_shift();

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
      'collected_by', COALESCE(v_collected_by_email, v_actor_email),
      'kind', 'payment'
    ))
    ELSE NULL
  END;

  INSERT INTO public.sales (
    total, items, discount, payment_method, note, type, paid_amount,
    customer, customer_id, due_date, seller_email, abonos,
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
    p_customer_id,
    CASE WHEN p_is_apartado THEN p_due_date ELSE NULL END,
    COALESCE(v_collected_by_email, v_actor_email),
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
    COALESCE(v_collected_by_email, v_actor_email),
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
             CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END) || v_collected_note,
      jsonb_build_object(
        'id', v_sale_id, 'customer', v_short_customer, 'total', v_total,
        'anticipo', v_paid, 'pendiente', v_total - v_paid,
        'dueDate', p_due_date, 'items', jsonb_array_length(v_items),
        'itemIds', to_jsonb(v_parent_ids), 'itemsDetail', v_items,
        'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
        'collected_by', COALESCE(v_collected_by_email, v_actor_email),
        'request_id', p_request_id
      )
    );
  ELSIF p_is_apartado THEN
    PERFORM public.te_log_activity(
      'apartado_liquidado',
      format('Apartado pagado completo de %s — $%s%s', v_short_customer, v_total,
             CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END) || v_collected_note,
      jsonb_build_object(
        'id', v_sale_id, 'customer', v_short_customer, 'total', v_total,
        'method', lower(p_payment_method), 'items', jsonb_array_length(v_items),
        'itemIds', to_jsonb(v_parent_ids), 'itemsDetail', v_items,
        'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
        'collected_by', COALESCE(v_collected_by_email, v_actor_email),
        'request_id', p_request_id
      )
    );
  ELSE
    PERFORM public.te_log_activity(
      'venta',
      format('Cobro $%s — %s producto%s%s', v_total, jsonb_array_length(v_items),
             CASE WHEN jsonb_array_length(v_items) = 1 THEN '' ELSE 's' END,
             CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END) || v_collected_note,
      jsonb_build_object(
        'id', v_sale_id, 'total', v_total, 'method', lower(p_payment_method),
        'discount', v_discount, 'items', jsonb_array_length(v_items),
        'itemIds', to_jsonb(v_parent_ids), 'itemsDetail', v_items,
        'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
        'collected_by', COALESCE(v_collected_by_email, v_actor_email),
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
$function$;

CREATE OR REPLACE FUNCTION public.record_apartado_payment_atomic(p_request_id uuid, p_sale_id bigint, p_method text, p_amount numeric, p_expected_version bigint, p_collected_by_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_operation   constant text := 'apartado_payment_v2';
  v_cached      jsonb;
  v_response    jsonb;
  v_sale        public.sales%ROWTYPE;
  v_now         timestamptz := now();
  v_amount      numeric;
  v_paid        numeric;
  v_remaining   numeric;
  v_is_final    boolean;
  v_payment     jsonb;
  v_product_ids bigint[];
  v_customer    text;
  v_actor_email text := lower(auth.jwt() ->> 'email');
  v_collected_by_email text;
  v_collected_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF lower(COALESCE(p_method, '')) NOT IN ('efectivo', 'transferencia') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Metodo de pago invalido';
  END IF;

  v_collected_by_email := NULLIF(lower(btrim(p_collected_by_email)), '');
  IF v_collected_by_email IS NOT NULL AND v_collected_by_email <> v_actor_email THEN
    IF NOT public._te_is_superadmin_email(v_collected_by_email) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo se puede atribuir un cobro a una cuenta de dueño/a';
    END IF;
  END IF;
  v_collected_note := CASE
    WHEN v_collected_by_email IS NOT NULL AND v_collected_by_email <> v_actor_email
      THEN format(' · cobrado por %s', split_part(v_collected_by_email, '@', 1))
    ELSE ''
  END;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  -- Cobrar exige caja abierta de quien captura (después del replay: un
  -- reintento de algo que ya quedó guardado regresa su respuesta igual).
  PERFORM public.te_assert_open_shift();
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
  IF v_sale.cancelled_at IS NOT NULL OR v_sale.status = 'cancelado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El apartado esta cancelado';
  END IF;
  IF v_sale.origin_type <> 'apartado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El registro no es un apartado';
  END IF;
  IF v_sale.status <> 'activo' OR v_sale.type <> 'apartado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El apartado ya esta liquidado';
  END IF;

  v_remaining := round(v_sale.total - COALESCE(v_sale.paid_amount, 0), 2);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El apartado no tiene saldo pendiente; requiere reconciliacion';
  END IF;
  v_amount := CASE WHEN p_amount IS NULL THEN v_remaining ELSE round(p_amount, 2) END;
  IF NOT public.te_numeric_is_finite(v_amount)
     OR v_amount <= 0 OR v_amount > v_remaining THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format('Abono invalido; saldo actual $%s', v_remaining);
  END IF;

  v_paid := round(COALESCE(v_sale.paid_amount, 0) + v_amount, 2);
  v_is_final := v_paid >= round(v_sale.total, 2);
  IF v_is_final THEN v_paid := round(v_sale.total, 2); END IF;

  v_payment := jsonb_build_object(
    'amount', v_amount,
    'method', lower(p_method),
    'date', v_now,
    'request_id', p_request_id,
    'collected_by', COALESCE(v_collected_by_email, v_actor_email),
    'kind', 'payment'
  );

  INSERT INTO public.sale_payments (
    sale_id, request_id, kind, amount, method, paid_at,
    collected_by, collected_by_email, is_estimated, source, meta
  ) VALUES (
    p_sale_id, p_request_id, 'payment', v_amount, lower(p_method), v_now,
    auth.uid(), COALESCE(v_collected_by_email, v_actor_email), false,
    CASE WHEN v_is_final THEN 'rpc_apartado_liquidation' ELSE 'rpc_apartado_payment' END,
    jsonb_build_object('remaining_before', v_remaining)
  );

  UPDATE public.sales
  SET
    paid_amount = v_paid,
    abonos = COALESCE(
      CASE WHEN jsonb_typeof(abonos) = 'array' THEN abonos ELSE '[]'::jsonb END,
      '[]'::jsonb
    ) || jsonb_build_array(v_payment),
    payment_method = CASE WHEN v_is_final THEN lower(p_method) ELSE payment_method END,
    type = CASE WHEN v_is_final THEN 'venta' ELSE 'apartado' END,
    status = CASE WHEN v_is_final THEN 'liquidado' ELSE 'activo' END,
    liquidated_at = CASE WHEN v_is_final THEN v_now ELSE NULL END,
    last_payment_at = v_now,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  IF v_is_final THEN
    SELECT array_agg(d.product_id ORDER BY d.product_id)
      INTO v_product_ids
    FROM public.te_inventory_demand(v_sale.items) d;
    PERFORM p.id FROM public.products p
    WHERE p.id = ANY(v_product_ids)
    ORDER BY p.id
    FOR UPDATE;
    PERFORM public.te_refresh_apartado_product_flags(v_product_ids);
  END IF;

  v_customer := COALESCE(split_part(v_sale.customer, ' · ', 1), 'cliente');
  IF v_is_final THEN
    PERFORM public.te_log_activity(
      'apartado_liquidado',
      format('Liquido apartado de %s — $%s', v_customer, v_amount) || v_collected_note,
      jsonb_build_object(
        'id', p_sale_id, 'customer', v_customer, 'amount', v_amount,
        'total', v_sale.total, 'method', lower(p_method),
        'itemsDetail', v_sale.items, 'collected_by', COALESCE(v_collected_by_email, v_actor_email),
        'request_id', p_request_id
      )
    );
  ELSE
    PERFORM public.te_log_activity(
      'apartado_abono',
      format('Abono de $%s a %s', v_amount, v_customer) || v_collected_note,
      jsonb_build_object(
        'id', p_sale_id, 'customer', v_customer, 'amount', v_amount,
        'method', lower(p_method), 'collected_by', COALESCE(v_collected_by_email, v_actor_email),
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
      'type', CASE WHEN v_is_final THEN 'venta' ELSE 'apartado' END,
      'origin_type', 'apartado',
      'status', CASE WHEN v_is_final THEN 'liquidado' ELSE 'activo' END,
      'total', v_sale.total,
      'paid_amount', v_paid,
      'remaining', round(v_sale.total - v_paid, 2),
      'liquidated_at', CASE WHEN v_is_final THEN v_now ELSE NULL END,
      'version', v_sale.version + 1
    ),
    'payment', v_payment,
    'products', CASE WHEN v_is_final THEN public.te_products_state(v_product_ids) ELSE '[]'::jsonb END
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$function$;

COMMIT;
