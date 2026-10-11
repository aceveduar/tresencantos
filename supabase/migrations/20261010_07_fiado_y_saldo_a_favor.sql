-- Fiado y saldo a favor (2026-10-10).
--
-- Dos tipos de apartado que antes el sistema trataba igual:
--   * Apartado: el producto se queda en la tienda hasta que termine de pagar.
--   * Fiado ("se lo llevó"): persona de confianza que se lleva el producto y
--     paga después. sales.se_lo_llevo = true. No reserva nada en la tienda
--     (el producto ya no está: Tienda lo da por agotado, no "📌 Apartado") y
--     nunca se ofrece "liberar". Se marca con te_set_apartado_se_lo_llevo.
--
-- Liberar un apartado vencido (o cancelarlo con dinero pagado) puede dejar el
-- dinero A FAVOR de la clienta en vez de devolverlo en ese momento (casi
-- nunca está presente): cancel_sale_atomic(p_keep_credit => true) no crea
-- devolución y guarda sales.saldo_favor. Cuando vuelve, te_refund_credit se
-- lo devuelve (exige caja abierta: sale dinero del cajón). Reactivar el
-- apartado lo regresa a pagado.
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_07_fiado_y_saldo_a_favor.sql

BEGIN;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS se_lo_llevo boolean NOT NULL DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS saldo_favor numeric NOT NULL DEFAULT 0;

-- Cambia la firma: borrar la vieja para no dejar dos (PostgREST: "is not unique").
DROP FUNCTION IF EXISTS public.cancel_sale_atomic(uuid, bigint, text, bigint, uuid[]);

CREATE OR REPLACE FUNCTION public.cancel_sale_atomic(p_request_id uuid, p_sale_id bigint, p_reason text, p_expected_version bigint, p_override_tickets uuid[] DEFAULT NULL::uuid[], p_keep_credit boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_credit        numeric := 0;
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
  --
  -- Apartado con p_keep_credit (2026-10-10): el dinero NO se devuelve hoy;
  -- queda como saldo a favor de la clienta (sales.saldo_favor) hasta que
  -- vuelva y se le devuelva (te_refund_credit) o lo use en otra compra.
  IF COALESCE(p_keep_credit, false) AND v_sale.origin_type = 'apartado' THEN
    SELECT round(GREATEST(COALESCE(SUM(amount), 0), 0), 2) INTO v_credit
    FROM public.sale_payments WHERE sale_id = p_sale_id;
  ELSE
    v_refund_entries := public.te_refund_sale_balance(
      p_sale_id, p_request_id, 'rpc_sale_cancellation_refund', p_reason, v_now
    );
  END IF;
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
    saldo_favor = v_credit,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(split_part(v_sale.customer, ' · ', 1), 'cliente');
  v_item_count := CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN jsonb_array_length(v_sale.items) ELSE 0 END;

  IF v_sale.origin_type = 'apartado' THEN
    PERFORM public.te_log_activity(
      'apartado_cancelado',
      format('Cancelo apartado de %s — $%s', v_customer, v_sale.total)
        || CASE WHEN v_credit > 0 THEN format(' · $%s quedan a su favor', v_credit) ELSE '' END,
      jsonb_build_object(
        'id', p_sale_id, 'customer', v_customer, 'total', v_sale.total,
        'pagado', v_sale.paid_amount, 'refund', v_refund_amount, 'saldo_favor', v_credit,
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
      'saldo_favor', v_credit,
      'refunds', v_refund_entries,
      'version', v_sale.version + 1
    ),
    'products', public.te_products_state(v_product_ids)
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reactivate_apartado_atomic(p_request_id uuid, p_sale_id bigint, p_reason text, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_operation       constant text := 'reactivate_apartado';
  v_cached          jsonb;
  v_response        jsonb;
  v_sale            public.sales%ROWTYPE;
  v_now             timestamptz := now();
  v_product_ids     bigint[];
  v_shortage        text;
  v_entries         jsonb := '[]'::jsonb;
  v_restored_amount numeric := 0;
  v_paid            numeric;
  v_status          text;
  v_type            text;
  v_customer        text;
  v_line            smallint := 0;
  v_reason          text := NULLIF(btrim(p_reason), '');
  r                 record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  IF public.get_user_role() <> 'superadmin' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Solo el administrador puede reactivar un apartado cancelado';
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
  IF v_sale.cancelled_at IS NULL AND v_sale.status <> 'cancelado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'El apartado no esta cancelado';
  END IF;

  -- Misma proteccion que cancelar/editar: no se muta inventario de un kit
  -- historico cuya composicion es estimada.
  PERFORM public.te_assert_authoritative_inventory_snapshot(v_sale.items, 'reactivar el apartado');

  SELECT array_agg(d.product_id ORDER BY d.product_id)
    INTO v_product_ids
  FROM public.te_inventory_demand(v_sale.items) d;

  PERFORM p.id FROM public.products p
  WHERE p.id = ANY(v_product_ids)
  ORDER BY p.id
  FOR UPDATE;

  IF (SELECT COUNT(*) FROM public.products p WHERE p.id = ANY(v_product_ids))
     <> COALESCE(array_length(v_product_ids, 1), 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Un producto del apartado ya no existe; no se reactivo nada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = ANY(v_product_ids) AND COALESCE(p.is_archived, false)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Un producto del apartado fue archivado; restauralo antes de reactivar';
  END IF;

  SELECT string_agg(
           format('%s (hay %s, se necesitan %s)', p.name, COALESCE(p.stock, 0), d.required_qty),
           '; ' ORDER BY d.product_id
         )
    INTO v_shortage
  FROM public.te_inventory_demand(v_sale.items) d
  JOIN public.products p ON p.id = d.product_id
  WHERE COALESCE(p.stock, 0) < d.required_qty;
  IF v_shortage IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'No hay stock para reactivar: ' || v_shortage;
  END IF;

  -- Devoluciones de la ULTIMA cancelacion (mismo instante que cancelled_at,
  -- porque cancel_sale_atomic usa un solo now() para ambos) que todavia no
  -- fueron revertidas.
  FOR r IN
    SELECT sp.*
    FROM public.sale_payments sp
    WHERE sp.sale_id = p_sale_id
      AND sp.kind = 'refund'
      AND (
        (sp.source IN ('rpc_sale_cancellation_refund', 'legacy_delete_refund')
         AND sp.paid_at = v_sale.cancelled_at)
        -- Devolución de dinero de libreta: sin paid_at, el instante va en meta.
        OR (sp.paid_at IS NULL
            AND sp.meta ->> 'devuelto_en' IS NOT NULL
            AND (sp.meta ->> 'devuelto_en')::timestamptz = v_sale.cancelled_at)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.sale_payments x
        WHERE x.sale_id = sp.sale_id
          AND x.kind = 'adjustment'
          AND x.source = 'rpc_apartado_reactivation'
          AND x.meta ->> 'reverses_payment_id' = sp.id::text
      )
    ORDER BY sp.id
  LOOP
    v_line := v_line + 1;
    -- paid_at = el de la devolucion (no now()): ver nota del encabezado.
    INSERT INTO public.sale_payments (
      sale_id, request_id, request_line, kind, amount, method, paid_at,
      collected_by, collected_by_email, is_estimated, source, meta
    ) VALUES (
      p_sale_id, p_request_id, v_line, 'adjustment', -r.amount, r.method, r.paid_at,
      r.collected_by, r.collected_by_email, r.is_estimated, 'rpc_apartado_reactivation',
      jsonb_build_object(
        'reverses_payment_id', r.id,
        'reverses_request_id', r.request_id,
        'reason', v_reason,
        'reactivated_at', v_now
      )
    );
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'amount', -r.amount,
      'method', r.method,
      'date', r.paid_at,
      'request_id', p_request_id,
      'request_line', v_line,
      'collected_by', r.collected_by_email,
      'kind', 'adjustment',
      'reason', v_reason
    ));
    v_restored_amount := round(v_restored_amount + (-r.amount), 2);
  END LOOP;

  SELECT round(COALESCE(SUM(amount), 0), 2)
    INTO v_paid
  FROM public.sale_payments
  WHERE sale_id = p_sale_id;
  IF v_paid > v_sale.total + 0.005 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Lo pagado supera el total del apartado; revisa el historial de pagos';
  END IF;

  IF v_paid >= v_sale.total THEN
    v_status := 'liquidado'; v_type := 'venta';
  ELSE
    v_status := 'activo'; v_type := 'apartado';
  END IF;

  WITH demand AS (
    SELECT * FROM public.te_inventory_demand(v_sale.items)
  )
  UPDATE public.products p
  SET stock = COALESCE(p.stock, 0) - d.required_qty
  FROM demand d
  WHERE p.id = d.product_id;

  UPDATE public.sales
  SET
    cancelled_at = NULL,
    status = v_status,
    type = v_type,
    paid_amount = v_paid,
    saldo_favor = 0,
    abonos = CASE
      WHEN jsonb_array_length(v_entries) > 0 THEN
        (CASE WHEN jsonb_typeof(abonos) = 'array' THEN abonos ELSE '[]'::jsonb END) || v_entries
      ELSE abonos
    END,
    liquidated_at = CASE WHEN v_status = 'liquidado' THEN COALESCE(liquidated_at, v_now) ELSE NULL END,
    last_payment_at = CASE WHEN jsonb_array_length(v_entries) > 0 THEN v_now ELSE last_payment_at END,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(split_part(v_sale.customer, ' · ', 1), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_reactivado',
    format('Reactivó apartado de %s — $%s (pagado $%s)', v_customer, v_sale.total, v_paid),
    jsonb_build_object(
      'id', p_sale_id, 'customer', v_customer, 'total', v_sale.total,
      'pagado', v_paid, 'restored', v_restored_amount,
      'entries', v_entries, 'reason', v_reason,
      'cancelled_at', v_sale.cancelled_at,
      'items', CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN jsonb_array_length(v_sale.items) ELSE 0 END,
      'itemIds', COALESCE((
        SELECT jsonb_agg(public.te_try_numeric(i.item ->> 'id')::bigint)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN v_sale.items ELSE '[]'::jsonb END
        ) i(item)
        WHERE public.te_try_numeric(i.item ->> 'id') IS NOT NULL
      ), '[]'::jsonb),
      'itemsDetail', v_sale.items, 'dueDate', v_sale.due_date, 'request_id', p_request_id
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'reactivated', true,
    'restored_amount', v_restored_amount,
    'sale', jsonb_build_object(
      'id', p_sale_id, 'origin_type', 'apartado', 'type', v_type,
      'status', v_status, 'paid_amount', v_paid,
      'remaining', GREATEST(round(v_sale.total - v_paid, 2), 0),
      'version', v_sale.version + 1
    ),
    'products', public.te_products_state(v_product_ids)
  );

  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.te_refresh_apartado_product_flags(p_product_ids bigint[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF COALESCE(array_length(p_product_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;

  WITH reserved AS (
    SELECT d.product_id, SUM(d.required_qty)::bigint AS reserved_qty
    FROM public.sales s
    CROSS JOIN LATERAL public.te_inventory_demand(s.items) d
    WHERE s.origin_type = 'apartado'
      AND s.status = 'activo'
      AND s.cancelled_at IS NULL
      AND NOT s.se_lo_llevo
      AND d.product_id = ANY(p_product_ids)
    GROUP BY d.product_id
  )
  UPDATE public.products p
  SET
    is_apartado = CASE
      WHEN COALESCE(p.is_archived, false) THEN false
      ELSE (COALESCE(p.stock, 0) <= 0 AND COALESCE(r.reserved_qty, 0) > 0)
    END,
    out_of_stock = CASE
      WHEN COALESCE(p.is_archived, false) THEN true
      WHEN COALESCE(p.stock, 0) <= 0 THEN COALESCE(r.reserved_qty, 0) = 0
      ELSE false
    END,
    -- La disponibilidad se controla con out_of_stock/is_apartado. No destruye
    -- la preferencia editorial is_published al agotarse, para que una
    -- cancelacion pueda restaurar visibilidad sin publicar borradores ocultos.
    is_published = CASE
      WHEN COALESCE(p.is_archived, false) THEN false
      ELSE p.is_published
    END
  FROM (SELECT unnest(p_product_ids) AS product_id) ids
  LEFT JOIN reserved r ON r.product_id = ids.product_id
  WHERE p.id = ids.product_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.te_products_stock_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_reserved boolean;
BEGIN
  IF jsonb_typeof(NEW.kit_items) = 'array' AND jsonb_array_length(NEW.kit_items) > 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_archived, false) THEN
    NEW.out_of_stock := true;
    NEW.is_apartado := false;
    RETURN NEW;
  END IF;

  -- Cambio explícito de "Agotado/Disponible" sin tocar las piezas.
  IF TG_OP = 'UPDATE'
     AND NEW.out_of_stock IS DISTINCT FROM OLD.out_of_stock
     AND NEW.stock IS NOT DISTINCT FROM OLD.stock THEN
    IF NEW.out_of_stock AND COALESCE(NEW.stock, 0) > 0 THEN
      NEW.stock := 0;
    ELSIF NOT NEW.out_of_stock AND COALESCE(NEW.stock, 0) <= 0
          AND NOT COALESCE(NEW.is_apartado, false) THEN
      NEW.stock := 1;
    END IF;
  END IF;

  IF COALESCE(NEW.stock, 0) > 0 THEN
    NEW.out_of_stock := false;
    NEW.is_apartado := false;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.sales s
      CROSS JOIN LATERAL public.te_inventory_demand(s.items) d
      WHERE s.origin_type = 'apartado'
        AND s.status = 'activo'
        AND s.cancelled_at IS NULL
        AND NOT s.se_lo_llevo
        AND d.product_id = NEW.id
    ) INTO v_reserved;
    NEW.is_apartado := v_reserved;
    NEW.out_of_stock := NOT v_reserved;
  END IF;
  RETURN NEW;
END;
$function$;


GRANT EXECUTE ON FUNCTION public.cancel_sale_atomic(uuid, bigint, text, bigint, uuid[], boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.te_set_apartado_se_lo_llevo(p_sale_id bigint, p_value boolean, p_override_tickets uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_product_ids bigint[];
  v_authorized_by text;
  v_customer text;
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
  PERFORM set_config('tresencantos.rpc_v2', 'on', true);
  PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR v_sale.origin_type <> 'apartado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Apartado no encontrado';
  END IF;
  IF v_sale.status <> 'activo' OR v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo se puede cambiar en un apartado activo';
  END IF;
  IF v_sale.se_lo_llevo = COALESCE(p_value, false) THEN
    RETURN jsonb_build_object('ok', true, 'se_lo_llevo', v_sale.se_lo_llevo, 'version', v_sale.version);
  END IF;

  UPDATE public.sales
     SET se_lo_llevo = COALESCE(p_value, false), updated_at = now(), version = version + 1
   WHERE id = p_sale_id;

  SELECT array_agg(d.product_id) INTO v_product_ids FROM public.te_inventory_demand(v_sale.items) d;
  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(NULLIF(split_part(v_sale.customer, ' · ', 1), ''), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_editado',
    CASE WHEN p_value THEN format('Marcó que %s se llevó su apartado (fiado)', v_customer)
         ELSE format('Quitó la marca de fiado del apartado de %s', v_customer) END,
    jsonb_build_object('id', p_sale_id, 'customer', v_customer, 'se_lo_llevo', COALESCE(p_value, false),
                       'authorized_by', v_authorized_by)
  );
  RETURN jsonb_build_object('ok', true, 'se_lo_llevo', COALESCE(p_value, false), 'version', v_sale.version + 1);
END;
$function$;
REVOKE ALL ON FUNCTION public.te_set_apartado_se_lo_llevo(bigint, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_set_apartado_se_lo_llevo(bigint, boolean, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.te_refund_credit(p_request_id uuid, p_sale_id bigint, p_override_tickets uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_operation constant text := 'refund_credit';
  v_cached jsonb;
  v_response jsonb;
  v_sale public.sales%ROWTYPE;
  v_entries jsonb;
  v_amount numeric;
  v_used_permission text;
  v_authorized_by text;
  v_customer text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  v_used_permission := CASE WHEN public.te_permission_or_override('canEditApartado', p_override_tickets)
                             THEN 'canEditApartado' ELSE 'canCancelSale' END;
  IF NOT public.te_permission_or_override(v_used_permission, p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para devolver saldos a favor';
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  -- Sale dinero del cajón: exige caja abierta de quien lo entrega.
  PERFORM public.te_assert_open_shift();

  IF NOT public.te_has_permission(v_used_permission) THEN
    v_authorized_by := public.te_consume_matching_override(v_used_permission, p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;
  PERFORM set_config('tresencantos.rpc_v2', 'on', true);

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR v_sale.status <> 'cancelado' OR COALESCE(v_sale.saldo_favor, 0) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este apartado no tiene saldo a favor';
  END IF;

  v_entries := public.te_refund_sale_balance(p_sale_id, p_request_id, 'rpc_credit_refund', 'Saldo a favor devuelto', now());
  SELECT round(COALESCE(SUM(abs((e ->> 'amount')::numeric)), 0), 2) INTO v_amount FROM jsonb_array_elements(v_entries) e;

  UPDATE public.sales
     SET saldo_favor = 0, paid_amount = 0, last_payment_at = now(), updated_at = now(), version = version + 1
   WHERE id = p_sale_id;

  v_customer := COALESCE(NULLIF(split_part(v_sale.customer, ' · ', 1), ''), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_reembolso',
    format('Devolvió a %s su saldo a favor — $%s', v_customer, v_amount),
    jsonb_build_object('id', p_sale_id, 'customer', v_customer, 'refund', v_amount, 'refunds', v_entries,
                       'saldo_favor', true, 'authorized_by', v_authorized_by, 'request_id', p_request_id)
  );

  v_response := jsonb_build_object('ok', true, 'operation', v_operation, 'request_id', p_request_id,
    'refund_amount', v_amount, 'refunds', v_entries,
    'sale', jsonb_build_object('id', p_sale_id, 'saldo_favor', 0, 'version', v_sale.version + 1));
  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION public.te_refund_credit(uuid, bigint, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_refund_credit(uuid, bigint, uuid[]) TO authenticated;

COMMIT;
