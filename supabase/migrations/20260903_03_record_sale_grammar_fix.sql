-- -----------------------------------------------------------------------------
-- record_sale_atomic_v2 -- corrige "1 producto(s)" en el summary de Actividad
-- de una venta directa (accion 'venta'). El resto de acciones de este mismo
-- archivo (apartado_nuevo, apartado_liquidado) usan "items"/"itemsDetail" sin
-- pluralizar en el texto, asi que no tienen este problema; solo 'venta' lo
-- tenia. Cambio unico: "%s producto(s)%s" -> "%s producto%s%s" con un CASE
-- que agrega la "s" solo cuando jsonb_array_length(v_items) <> 1. Nada mas
-- de la funcion cambia -- mismo cuerpo exacto obtenido de produccion via
-- pg_get_functiondef antes de este cambio.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sale_atomic_v2(p_request_id uuid, p_items jsonb, p_total numeric, p_discount numeric DEFAULT 0, p_payment_method text DEFAULT 'efectivo'::text, p_note text DEFAULT NULL::text, p_is_apartado boolean DEFAULT false, p_paid_amount numeric DEFAULT NULL::numeric, p_customer text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_override_tickets uuid[] DEFAULT NULL::uuid[], p_customer_id bigint DEFAULT NULL::bigint)
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
      format('Cobro $%s — %s producto%s%s', v_total, jsonb_array_length(v_items),
             CASE WHEN jsonb_array_length(v_items) = 1 THEN '' ELSE 's' END,
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
$function$
