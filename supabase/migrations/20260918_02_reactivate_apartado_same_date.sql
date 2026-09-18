-- =============================================================================
-- Reactivar apartado: la reversa lleva la fecha de la devolucion (2026-09-18)
--
-- Ajuste a reactivate_apartado_atomic (20260918_01). La primera version fechaba
-- el ajuste que compensa la devolucion con now(). Reactivando el MISMO dia de
-- la cancelacion da lo mismo, pero reactivando otro dia el -$X de la
-- devolucion se quedaba en el dia de la cancelacion y el +$X caia como
-- "ingreso" del dia de la reactivacion -- dinero que nunca entro ese dia.
--
-- Ahora el ajuste usa el mismo paid_at que la devolucion que revierte: en
-- cualquier dia ambos se anulan en Reportes/Caja/Corte del dia original y el
-- historial de ingresos queda como si la cancelacion por error nunca hubiera
-- movido dinero. recorded_at sigue siendo now() (cuando de verdad se
-- registro) y Actividad guarda la hora real de quien reactivo.
--
-- Mismo nombre y firma que 20260918_01: CREATE OR REPLACE, seguro de repetir.
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.reactivate_apartado_atomic(
  p_request_id uuid,
  p_sale_id bigint,
  p_reason text,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
      AND sp.source IN ('rpc_sale_cancellation_refund', 'legacy_delete_refund')
      AND sp.paid_at = v_sale.cancelled_at
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
$$;

REVOKE ALL ON FUNCTION public.reactivate_apartado_atomic(uuid, bigint, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_apartado_atomic(uuid, bigint, text, bigint) TO authenticated;

COMMIT;
