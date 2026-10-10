-- Apartados de libreta (2026-10-10).
--
-- Ofelia llevaba apartados en una libreta de papel antes de usar el sistema
-- (y algunos nunca se pasaron). Esta migración permite registrarlos tal como
-- están anotados -- sin productos, a veces sin fecha, con abonos restados a
-- lápiz -- sin inventar datos ni ensuciar Reportes:
--
--   * Un apartado de libreta es un apartado normal (activo, se abona, se
--     liquida, se cancela, entra a la ronda de cobranza) cuyo único renglón
--     es {"libreta": true, "name": "Apartado de libreta", ...}: no apunta a
--     ningún producto y no toca inventario.
--   * Los abonos anotados en la libreta van al libro de pagos con
--     paid_at NULL y source 'libreta': suman al saldo pero no a ingresos ni
--     al corte de ningún turno (Reportes y corte filtran por paid_at). Los
--     abonos que se cobren desde hoy son pagos normales y sí cuentan.
--
-- Cambios a funciones existentes (solo para tolerar el renglón sin producto):
--   te_inventory_demand    ignora renglones de libreta (antes exigía id).
--   refund_apartado_atomic el registro de Actividad ya no exige id.
--   edit_apartado_atomic   rechaza con mensaje claro un apartado de libreta.
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_01_apartados_libreta.sql

BEGIN;

-- ── 1. Ajustes a funciones existentes ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.te_sale_is_libreta(p_items jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) AS x(item)
    WHERE COALESCE((x.item ->> 'libreta')::boolean, false)
  );
$function$;
REVOKE ALL ON FUNCTION public.te_sale_is_libreta(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_sale_is_libreta(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.te_inventory_demand(p_items jsonb)
 RETURNS TABLE(product_id bigint, required_qty bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH item_rows AS (
    SELECT
      item,
      public.te_require_positive_bigint(item ->> 'id', 'id de producto') AS item_id,
      public.te_require_positive_bigint(COALESCE(item ->> 'qty', '1'), 'cantidad de producto') AS item_qty
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
    ) AS x(item)
    -- Renglón de libreta: dinero sin producto, no reserva ni mueve inventario.
    WHERE NOT COALESCE((x.item ->> 'libreta')::boolean, false)
  ), item_sources AS (
    SELECT
      i.*,
      CASE
        -- Cualquier array presente, incluso [], es un snapshot autoritativo.
        WHEN jsonb_typeof(i.item -> 'kit_items') = 'array'
          THEN i.item -> 'kit_items'
        WHEN jsonb_typeof(p.kit_items) = 'array'
             AND jsonb_array_length(p.kit_items) > 0
          THEN p.kit_items
        ELSE '[]'::jsonb
      END AS kit_items
    FROM item_rows i
    LEFT JOIN public.products p ON p.id = i.item_id
  ), expanded AS (
    SELECT
      public.te_require_positive_bigint(component ->> 'id', 'id de componente') AS product_id,
      s.item_qty * public.te_require_positive_bigint(
        COALESCE(component ->> 'qty', '1'), 'cantidad de componente'
      ) AS required_qty
    FROM item_sources s
    CROSS JOIN LATERAL jsonb_array_elements(s.kit_items) AS k(component)
    WHERE jsonb_array_length(s.kit_items) > 0

    UNION ALL

    SELECT s.item_id, s.item_qty
    FROM item_sources s
    WHERE jsonb_array_length(s.kit_items) = 0
  )
  SELECT e.product_id, SUM(e.required_qty)::bigint
  FROM expanded e
  GROUP BY e.product_id
  ORDER BY e.product_id;
$function$;

CREATE OR REPLACE FUNCTION public.refund_apartado_atomic(p_request_id uuid, p_sale_id bigint, p_reason text, p_expected_version bigint, p_override_tickets uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
        SELECT jsonb_agg(public.te_try_numeric(i.item ->> 'id')::bigint)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_sale.items) = 'array' THEN v_sale.items ELSE '[]'::jsonb END
        ) i(item)
        WHERE public.te_try_numeric(i.item ->> 'id') IS NOT NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.edit_apartado_atomic(p_request_id uuid, p_sale_id bigint, p_items jsonb, p_expected_version bigint, p_discount numeric DEFAULT NULL::numeric, p_due_date date DEFAULT NULL::date, p_override_tickets uuid[] DEFAULT NULL::uuid[], p_phone text DEFAULT NULL::text, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_due_date    date;
  v_now         timestamptz := now();
  v_is_final    boolean;
  v_shortage    record;
  v_customer    text;
  v_customer_name text;
  v_customer_tel  text;
  v_new_customer  text;
  v_new_name      text;
  v_new_tel       text;
  v_phone_digits  text;
  v_phone_note    text := '';
  v_name_note     text := '';
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
  -- Los apartados de libreta no tienen productos: se corrigen con
  -- te_libreta_apartado_edit (Caja abre ese formulario en su lugar).
  IF public.te_sale_is_libreta(v_sale.items) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este apartado es de libreta: corrígelo desde su ficha';
  END IF;

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
  v_due_date := COALESCE(p_due_date, v_sale.due_date);
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

  -- Nombre y telefono viven juntos en sales.customer ("Nombre · 📱 Tel").
  --   p_phone: NULL = no tocar; '' = quitarlo; 10 digitos = fijarlo.
  --   p_name : NULL = no tocar; texto no vacio = nuevo nombre.
  -- Si no cambia ninguno se conserva v_sale.customer tal cual (mismo
  -- comportamiento de siempre). v_phone_note / v_name_note se anexan al
  -- summary de Actividad para que el cambio no quede invisible.
  v_customer_name := COALESCE(NULLIF(split_part(v_sale.customer, ' · 📱 ', 1), ''), 'Cliente');
  v_customer_tel  := NULLIF(split_part(v_sale.customer, ' · 📱 ', 2), '');
  v_new_name := v_customer_name;
  v_new_tel  := v_customer_tel;

  IF p_name IS NOT NULL THEN
    v_new_name := btrim(p_name);
    IF v_new_name = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El nombre no puede quedar vacío';
    END IF;
    IF char_length(v_new_name) > 80 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El nombre es demasiado largo (máximo 80 caracteres)';
    END IF;
    IF v_new_name <> v_customer_name THEN
      v_name_note := format(' · nombre corregido (antes: %s)', v_customer_name);
    END IF;
  END IF;

  IF p_phone IS NOT NULL THEN
    IF p_phone = '' THEN
      v_new_tel := NULL;
      v_phone_note := ' · teléfono eliminado';
    ELSE
      v_phone_digits := regexp_replace(p_phone, '\D', '', 'g');
      IF length(v_phone_digits) <> 10 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Teléfono inválido: deben ser 10 dígitos';
      END IF;
      v_new_tel := v_phone_digits;
      v_phone_note := ' · teléfono actualizado';
    END IF;
  END IF;

  IF p_name IS NULL AND p_phone IS NULL THEN
    v_new_customer := v_sale.customer;
  ELSE
    v_new_customer := v_new_name || CASE WHEN v_new_tel IS NOT NULL THEN ' · 📱 ' || v_new_tel ELSE '' END;
  END IF;

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
    due_date = v_due_date,
    customer = v_new_customer,
    type = CASE WHEN v_is_final THEN 'venta' ELSE 'apartado' END,
    status = CASE WHEN v_is_final THEN 'liquidado' ELSE 'activo' END,
    liquidated_at = CASE WHEN v_is_final THEN v_now ELSE NULL END,
    updated_at = v_now,
    version = version + 1
  WHERE id = p_sale_id;

  PERFORM public.te_refresh_apartado_product_flags(v_product_ids);

  v_customer := COALESCE(split_part(v_new_customer, ' · ', 1), 'cliente');
  PERFORM public.te_log_activity(
    'apartado_editado',
    format('Edito apartado de %s — nuevo total $%s%s%s%s', v_customer, v_total,
           CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END,
           v_phone_note, v_name_note),
    jsonb_build_object(
      'id', p_sale_id, 'customer', v_customer, 'total', v_total,
      'discount', v_discount, 'due_date', v_due_date, 'itemsDetail', v_items,
      'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
      'phone_updated', (p_phone IS NOT NULL), 'phone', v_phone_digits,
      'name_updated', (v_name_note <> ''), 'namePrevio', v_customer_name,
      'request_id', p_request_id,
      'itemsDetailPrevio', v_sale.items, 'totalPrevio', v_sale.total,
      'discountPrevio', v_sale.discount, 'dueDatePrevio', v_sale.due_date,
      'customerPrevio', v_sale.customer
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
      'due_date', v_due_date,
      'customer', v_new_customer,
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
$function$;

-- ── 2. Registrar un apartado de libreta ──────────────────────────────────
-- Crea un apartado activo SIN productos de inventario: un solo renglón
-- {libreta:true} con el total. Lo que la clienta ya había abonado en papel
-- entra al libro de pagos con paid_at NULL (fecha desconocida o anterior al
-- sistema), method 'unknown', is_estimated y source 'libreta': así cuenta
-- para el saldo del apartado pero NUNCA para Reportes ni para el corte, que
-- filtran por paid_at. La fecha escrita en la libreta (si la hay) va en meta.
--
--   p_total    : total del apartado si se conoce (entonces p_balance se ignora)
--   p_balance  : lo que debe hoy, cuando no se conoce el total
--   p_payments : [{amount, date?}] abonos anotados (solo con p_total)
CREATE OR REPLACE FUNCTION public.te_libreta_apartado_create(
  p_request_id uuid,
  p_name text,
  p_phone text DEFAULT NULL,
  p_total numeric DEFAULT NULL,
  p_balance numeric DEFAULT NULL,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_opened_on date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_photo text DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_operation   constant text := 'libreta_apartado_create';
  v_cached      jsonb;
  v_response    jsonb;
  v_name        text := NULLIF(btrim(p_name), '');
  v_phone       text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  v_note        text := NULLIF(btrim(p_note), '');
  v_photo       text := NULLIF(btrim(p_photo), '');
  v_payments    jsonb := CASE WHEN jsonb_typeof(p_payments) = 'array' THEN p_payments ELSE '[]'::jsonb END;
  v_paid        numeric := 0;
  v_total       numeric;
  v_balance     numeric;
  v_today       date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_created_at  timestamptz;
  v_customer    text;
  v_customer_id bigint;
  v_items       jsonb;
  v_sale_id     bigint;
  v_entry       record;
  v_line        smallint := 0;
  v_authorized_by text;
  v_actor_email text := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_permission_or_override('canEditApartado', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para registrar apartados de libreta';
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  IF NOT public.te_has_permission('canEditApartado') THEN
    v_authorized_by := public.te_consume_matching_override('canEditApartado', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;

  PERFORM set_config('tresencantos.rpc_v2', 'on', true);

  IF v_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Falta el nombre de la clienta';
  END IF;
  IF char_length(v_name) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El nombre es demasiado largo (máximo 80 caracteres)';
  END IF;
  IF v_phone IS NOT NULL AND length(v_phone) <> 10 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Teléfono inválido: deben ser 10 dígitos';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La nota es demasiado larga (máximo 300 caracteres)';
  END IF;
  -- La foto se pinta en src="…": solo URLs https sin comillas/espacios.
  IF v_photo IS NOT NULL AND v_photo !~ '^https://[^\s"''<>]+$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Foto inválida';
  END IF;
  IF p_opened_on IS NOT NULL AND (p_opened_on > v_today OR p_opened_on < DATE '2015-01-01') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La fecha del apartado no puede ser futura';
  END IF;
  IF jsonb_array_length(v_payments) > 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Demasiados abonos';
  END IF;

  -- Cada abono: monto > 0 con centavos a lo más y fecha opcional no futura.
  FOR v_entry IN
    SELECT public.te_try_numeric(x.item ->> 'amount') AS amount, x.item ->> 'date' AS raw_date
    FROM jsonb_array_elements(v_payments) AS x(item)
  LOOP
    IF v_entry.amount IS NULL OR NOT public.te_numeric_is_finite(v_entry.amount)
       OR v_entry.amount <= 0 OR round(v_entry.amount, 2) <> v_entry.amount THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Hay un abono con monto inválido';
    END IF;
    IF NULLIF(v_entry.raw_date, '') IS NOT NULL THEN
      IF v_entry.raw_date !~ '^\d{4}-\d{2}-\d{2}$' OR v_entry.raw_date::date > v_today THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Hay un abono con fecha inválida';
      END IF;
    END IF;
    v_paid := v_paid + v_entry.amount;
  END LOOP;

  IF p_total IS NOT NULL THEN
    v_total := round(p_total, 2);
    IF NOT public.te_numeric_is_finite(v_total) OR v_total <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El total debe ser mayor a cero';
    END IF;
    IF v_paid >= v_total THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'Los abonos cubren todo el total: ese apartado ya está pagado y no hace falta pasarlo';
    END IF;
  ELSE
    IF jsonb_array_length(v_payments) > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Para anotar abonos hace falta el total del apartado';
    END IF;
    v_total := round(COALESCE(p_balance, 0), 2);
    IF NOT public.te_numeric_is_finite(v_total) OR v_total <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Falta cuánto debe';
    END IF;
  END IF;
  v_balance := v_total - v_paid;

  v_customer := v_name || CASE WHEN v_phone IS NOT NULL THEN ' · 📱 ' || v_phone ELSE '' END;
  IF v_phone IS NOT NULL THEN
    v_customer_id := NULLIF(public.te_find_or_create_customer(v_name, v_phone) ->> 'id', '')::bigint;
  END IF;

  -- Mediodía de Ciudad de México: el día queda bien en cualquier zona.
  v_created_at := CASE
    WHEN p_opened_on IS NOT NULL THEN (p_opened_on + time '12:00') AT TIME ZONE 'America/Mexico_City'
    ELSE now()
  END;

  v_items := jsonb_build_array(jsonb_build_object(
    'libreta', true,
    'name', 'Apartado de libreta',
    'price', v_total,
    'qty', 1,
    'subtotal', v_total,
    'nota', v_note,
    'foto', v_photo,
    'fecha_apartado', p_opened_on
  ));

  INSERT INTO public.sales (
    created_at, total, items, discount, payment_method, note, type, paid_amount,
    customer, customer_id, due_date, seller_email, abonos,
    origin_type, status, liquidated_at, last_payment_at, updated_at, version
  ) VALUES (
    v_created_at, v_total, v_items, NULL, 'efectivo', v_note, 'apartado', v_paid,
    v_customer, v_customer_id, p_due_date, v_actor_email, NULL,
    'apartado', 'activo', NULL, NULL, now(), 0
  )
  RETURNING id INTO v_sale_id;

  FOR v_entry IN
    SELECT public.te_try_numeric(x.item ->> 'amount') AS amount,
           NULLIF(x.item ->> 'date', '')::date AS paid_on,
           x.ord
    FROM jsonb_array_elements(v_payments) WITH ORDINALITY AS x(item, ord)
    ORDER BY x.ord
  LOOP
    v_line := v_line + 1;
    INSERT INTO public.sale_payments (
      sale_id, request_id, request_line, kind, amount, method, paid_at,
      collected_by, collected_by_email, is_estimated, source, meta
    ) VALUES (
      v_sale_id, p_request_id, v_line, 'payment', round(v_entry.amount, 2), 'unknown', NULL,
      NULL, NULL, true, 'libreta',
      jsonb_build_object('fecha', v_entry.paid_on, 'orden', v_entry.ord, 'registrado_por', v_actor_email)
    );
  END LOOP;

  PERFORM public.te_log_activity(
    'apartado_libreta',
    format('Pasó de la libreta el apartado de %s — debe $%s', v_name, v_balance),
    jsonb_build_object(
      'id', v_sale_id, 'customer', v_name, 'total', v_total, 'pagado', v_paid,
      'pendiente', v_balance, 'abonos', jsonb_array_length(v_payments),
      'fecha_apartado', p_opened_on, 'dueDate', p_due_date, 'nota', v_note,
      'foto', v_photo IS NOT NULL, 'authorized_by', v_authorized_by,
      'request_id', p_request_id
    )
  );

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'sale', jsonb_build_object(
      'id', v_sale_id, 'origin_type', 'apartado', 'status', 'activo', 'type', 'apartado',
      'total', v_total, 'paid_amount', v_paid, 'remaining', v_balance, 'version', 0
    )
  );
  PERFORM public.te_rpc_store(p_request_id, v_operation, v_sale_id, v_response);
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.te_libreta_apartado_create(uuid, text, text, numeric, numeric, jsonb, date, date, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_libreta_apartado_create(uuid, text, text, numeric, numeric, jsonb, date, date, text, text, uuid[]) TO authenticated;


-- ── 3. Corregir un apartado de libreta ───────────────────────────────────
-- Nombre, teléfono, fecha límite, nota y "lo que debe hoy". El saldo se
-- corrige moviendo el total (total = pagado + saldo): los pagos son un libro
-- de solo-agregar y no se tocan. NULL en un parámetro = no cambiarlo
-- (p_phone '' = quitarlo; p_due_date se manda siempre, NULL = sin fecha).
CREATE OR REPLACE FUNCTION public.te_libreta_apartado_edit(
  p_request_id uuid,
  p_sale_id bigint,
  p_expected_version bigint,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_balance numeric DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_operation   constant text := 'libreta_apartado_edit';
  v_cached      jsonb;
  v_response    jsonb;
  v_sale        public.sales%ROWTYPE;
  v_old_name    text;
  v_old_tel     text;
  v_new_name    text;
  v_new_tel     text;
  v_note        text;
  v_paid        numeric;
  v_old_balance numeric;
  v_balance     numeric;
  v_total       numeric;
  v_items       jsonb;
  v_changes     text[] := ARRAY[]::text[];
  v_authorized_by text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_permission_or_override('canEditApartado', p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para editar apartados';
  END IF;

  v_cached := public.te_rpc_replay(p_request_id, v_operation);
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  IF NOT public.te_has_permission('canEditApartado') THEN
    v_authorized_by := public.te_consume_matching_override('canEditApartado', p_override_tickets);
    IF v_authorized_by IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Autorización inválida o expirada';
    END IF;
  END IF;

  PERFORM set_config('tresencantos.rpc_v2', 'on', true);

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Apartado no encontrado';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_sale.version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'El apartado cambió en otro dispositivo; vuelve a cargarlo';
  END IF;
  IF NOT public.te_sale_is_libreta(v_sale.items) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Este apartado no es de libreta';
  END IF;
  IF v_sale.origin_type <> 'apartado' OR v_sale.status <> 'activo' OR v_sale.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo se puede editar un apartado activo';
  END IF;

  v_old_name := COALESCE(NULLIF(split_part(v_sale.customer, ' · 📱 ', 1), ''), 'Cliente');
  v_old_tel  := NULLIF(split_part(v_sale.customer, ' · 📱 ', 2), '');
  v_new_name := COALESCE(NULLIF(btrim(p_name), ''), v_old_name);
  IF char_length(v_new_name) > 80 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El nombre es demasiado largo (máximo 80 caracteres)';
  END IF;
  v_new_tel := v_old_tel;
  IF p_phone IS NOT NULL THEN
    v_new_tel := NULLIF(regexp_replace(p_phone, '\D', '', 'g'), '');
    IF v_new_tel IS NOT NULL AND length(v_new_tel) <> 10 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Teléfono inválido: deben ser 10 dígitos';
    END IF;
  END IF;
  v_note := CASE WHEN p_note IS NULL THEN v_sale.note ELSE NULLIF(btrim(p_note), '') END;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La nota es demasiado larga (máximo 300 caracteres)';
  END IF;

  v_paid := round(COALESCE(v_sale.paid_amount, 0), 2);
  v_old_balance := round(v_sale.total - v_paid, 2);
  v_balance := CASE WHEN p_balance IS NULL THEN v_old_balance ELSE round(p_balance, 2) END;
  IF NOT public.te_numeric_is_finite(v_balance) OR v_balance <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Lo que debe tiene que ser mayor a cero (si ya pagó todo, usa "Cobrar saldo")';
  END IF;
  v_total := v_paid + v_balance;

  IF v_new_name <> v_old_name THEN v_changes := v_changes || format('nombre (antes: %s)', v_old_name); END IF;
  IF v_new_tel IS DISTINCT FROM v_old_tel THEN v_changes := v_changes || 'teléfono'::text; END IF;
  IF p_due_date IS DISTINCT FROM v_sale.due_date THEN v_changes := v_changes || 'fecha límite'::text; END IF;
  IF v_note IS DISTINCT FROM v_sale.note THEN v_changes := v_changes || 'nota'::text; END IF;
  IF v_balance <> v_old_balance THEN
    v_changes := v_changes || format('saldo $%s → $%s', v_old_balance, v_balance);
  END IF;

  -- El renglón de libreta lleva el total y la nota que se pintan en la ficha.
  SELECT jsonb_agg(
           CASE WHEN COALESCE((e.item ->> 'libreta')::boolean, false)
             THEN e.item || jsonb_build_object('price', v_total, 'subtotal', v_total, 'nota', v_note)
             ELSE e.item END
           ORDER BY e.ord)
    INTO v_items
  FROM jsonb_array_elements(v_sale.items) WITH ORDINALITY AS e(item, ord);

  UPDATE public.sales SET
    customer   = v_new_name || CASE WHEN v_new_tel IS NOT NULL THEN ' · 📱 ' || v_new_tel ELSE '' END,
    customer_id = CASE
      WHEN v_new_tel IS NOT NULL AND v_new_tel IS DISTINCT FROM v_old_tel
        THEN NULLIF(public.te_find_or_create_customer(v_new_name, v_new_tel) ->> 'id', '')::bigint
      ELSE customer_id END,
    due_date   = p_due_date,
    note       = v_note,
    total      = v_total,
    items      = v_items,
    updated_at = now(),
    version    = version + 1
  WHERE id = p_sale_id;

  IF array_length(v_changes, 1) > 0 THEN
    PERFORM public.te_log_activity(
      'apartado_editado',
      format('Corrigió el apartado de libreta de %s: %s', v_new_name, array_to_string(v_changes, ', ')),
      jsonb_build_object(
        'id', p_sale_id, 'customer', v_new_name, 'libreta', true,
        'total', v_total, 'pendiente', v_balance, 'pendiente_antes', v_old_balance,
        'dueDate', p_due_date, 'authorized_by', v_authorized_by, 'request_id', p_request_id
      )
    );
  END IF;

  v_response := jsonb_build_object(
    'ok', true,
    'operation', v_operation,
    'request_id', p_request_id,
    'sale', jsonb_build_object(
      'id', p_sale_id, 'total', v_total, 'paid_amount', v_paid,
      'remaining', v_balance, 'version', v_sale.version + 1
    )
  );
  PERFORM public.te_rpc_store(p_request_id, v_operation, p_sale_id, v_response);
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.te_libreta_apartado_edit(uuid, bigint, bigint, text, text, date, text, numeric, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_libreta_apartado_edit(uuid, bigint, bigint, text, text, date, text, numeric, uuid[]) TO authenticated;


-- ── 4. Interruptor en Configuración (encendido para Tres Encantos) ────────
-- Sin la fila, Caja no muestra "Pasar de la libreta" (default apagado para
-- cualquier tienda nueva).
INSERT INTO public.config (id, value) VALUES ('show_libreta', 'true')
ON CONFLICT (id) DO NOTHING;

COMMIT;
