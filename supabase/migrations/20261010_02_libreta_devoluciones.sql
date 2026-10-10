-- Apartados de libreta, parte 2 (2026-10-10): devoluciones de dinero de papel.
--
-- Si se cancela (o se reembolsa) un apartado de libreta, la parte de la
-- devolución que corresponde a abonos anotados en papel (método 'unknown')
-- se registra SIN paid_at, igual que esos abonos: no resta en Reportes ni en
-- el corte de nadie lo que nunca sumó. El instante real va en
-- meta.devuelto_en, y reactivate_apartado_atomic lo usa para revertirla.
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_02_libreta_devoluciones.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.te_refund_sale_balance(p_sale_id bigint, p_request_id uuid, p_source text, p_reason text, p_paid_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_total_remaining numeric;
  v_take            numeric;
  v_line            smallint := 0;
  v_method          record;
  v_refunds         jsonb := '[]'::jsonb;
  v_entry           jsonb;
  v_actor_email     text := lower(auth.jwt() ->> 'email');
  v_is_libreta      boolean;
  v_paper           boolean;
BEGIN
  SELECT public.te_sale_is_libreta(items) INTO v_is_libreta FROM public.sales WHERE id = p_sale_id;
  SELECT round(GREATEST(COALESCE(SUM(amount), 0), 0), 2)
    INTO v_total_remaining
  FROM public.sale_payments
  WHERE sale_id = p_sale_id;

  IF v_total_remaining <= 0 THEN
    RETURN v_refunds;
  END IF;

  FOR v_method IN
    SELECT method, round(SUM(amount), 2) AS balance
    FROM public.sale_payments
    WHERE sale_id = p_sale_id
    GROUP BY method
    HAVING round(SUM(amount), 2) > 0
    ORDER BY CASE method WHEN 'efectivo' THEN 1 WHEN 'transferencia' THEN 2 ELSE 3 END
  LOOP
    EXIT WHEN v_total_remaining <= 0;
    v_take := LEAST(v_method.balance, v_total_remaining);
    IF v_take <= 0 THEN CONTINUE; END IF;
    v_line := v_line + 1;
    -- Dinero de papel (abonos de libreta, método desconocido): su devolución
    -- tampoco lleva fecha de cobro, así no resta en Reportes ni en el corte
    -- lo que nunca sumó. El instante real queda en meta.devuelto_en.
    v_paper := COALESCE(v_is_libreta, false) AND v_method.method = 'unknown';

    v_entry := jsonb_build_object(
      'amount', -v_take,
      'method', v_method.method,
      'date', p_paid_at,
      'request_id', p_request_id,
      'request_line', v_line,
      'collected_by', v_actor_email,
      'kind', 'refund',
      'reason', NULLIF(btrim(p_reason), '')
    );

    INSERT INTO public.sale_payments (
      sale_id, request_id, request_line, kind, amount, method, paid_at,
      collected_by, collected_by_email, is_estimated, source, meta
    ) VALUES (
      p_sale_id, p_request_id, v_line, 'refund', -v_take, v_method.method,
      CASE WHEN v_paper THEN NULL ELSE p_paid_at END,
      auth.uid(), v_actor_email, v_method.method = 'unknown', p_source,
      jsonb_build_object('reason', NULLIF(btrim(p_reason), ''))
        || CASE WHEN v_paper THEN jsonb_build_object('devuelto_en', p_paid_at, 'libreta', true) ELSE '{}'::jsonb END
    );

    v_refunds := v_refunds || jsonb_build_array(v_entry);
    v_total_remaining := round(v_total_remaining - v_take, 2);
  END LOOP;

  IF v_total_remaining > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'No se pudo distribuir completamente la devolucion por metodo original';
  END IF;

  RETURN v_refunds;
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

COMMIT;
