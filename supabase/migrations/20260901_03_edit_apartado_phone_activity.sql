-- -----------------------------------------------------------------------------
-- edit_apartado_atomic -- el cambio de telefono (20260901_02) guardaba
-- phone_updated:true en el meta de apartado_editado, pero el texto visible
-- en Actividad (summary) nunca lo mencionaba -- seguia diciendo solo "Edito
-- apartado de X -- nuevo total $Y", igual que si no se hubiera tocado el
-- telefono. Inconsistente con el patron que ya usa este mismo log para
-- precio modificado (se anexa "(precio modificado)" al texto). Ahora anexa
-- "· telefono actualizado" / "· telefono eliminado" segun corresponda, y
-- guarda el telefono nuevo en el meta (no solo el booleano) -- mismo nivel
-- de rastro que el resto de Caja v2 (quien, cuando, que cambio).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_apartado_atomic(
  p_request_id uuid,
  p_sale_id bigint,
  p_items jsonb,
  p_expected_version bigint,
  p_discount numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_override_tickets uuid[] DEFAULT NULL,
  p_phone text DEFAULT NULL
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
  v_due_date    date;
  v_now         timestamptz := now();
  v_is_final    boolean;
  v_shortage    record;
  v_customer    text;
  v_customer_name text;
  v_new_customer  text;
  v_phone_digits  text;
  v_phone_note    text := '';
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

  -- Telefono: NULL = no tocar; '' = quitarlo; 10 digitos = fijarlo. El nombre
  -- nunca se toca aqui (sigue siendo inmutable post-creacion). v_phone_note
  -- es lo que se anexa al summary de Actividad para que el cambio no quede
  -- invisible junto al resto de campos editados.
  v_customer_name := COALESCE(NULLIF(split_part(v_sale.customer, ' · 📱 ', 1), ''), 'Cliente');
  IF p_phone IS NULL THEN
    v_new_customer := v_sale.customer;
  ELSIF p_phone = '' THEN
    v_new_customer := v_customer_name;
    v_phone_note := ' · teléfono eliminado';
  ELSE
    v_phone_digits := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone_digits) <> 10 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Teléfono inválido: deben ser 10 dígitos';
    END IF;
    v_new_customer := v_customer_name || ' · 📱 ' || v_phone_digits;
    v_phone_note := ' · teléfono actualizado';
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
    format('Edito apartado de %s — nuevo total $%s%s%s', v_customer, v_total,
           CASE WHEN v_price_overridden THEN ' (precio modificado)' ELSE '' END,
           v_phone_note),
    jsonb_build_object(
      'id', p_sale_id, 'customer', v_customer, 'total', v_total,
      'discount', v_discount, 'due_date', v_due_date, 'itemsDetail', v_items,
      'price_overridden', v_price_overridden, 'authorized_by', v_authorized_by,
      'phone_updated', (p_phone IS NOT NULL), 'phone', v_phone_digits,
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
$$;
