-- Permisos de Caja (precio/descuento) + auditoria completa en Actividad.
-- Reemplaza a DOS archivos previos que nunca se ejecutaron y ya no existen
-- como archivos separados (su contenido esta incluido aqui completo):
--   - 20260820_01_catalog_only_settings_permission.sql (canManageCatalogSettings)
--   - 20260819_01_item_original_price.sql (original_price en te_snapshot_sale_items)
-- Ejecutar solo este archivo, una sola vez, en Supabase SQL Editor.
--
-- Contenido:
--   1. canManageCatalogSettings, canOverridePrice, canApplyDiscount -- nuevos
--      permisos, mismo mecanismo generico que el resto (te_has_permission +
--      get_my_permissions). canManageCatalogSettings solo se activa por
--      override individual (como hoy para Areli); los otros dos tienen
--      default por rol.
--   2. te_snapshot_sale_items -- ahora compara el precio recibido contra el
--      precio real del catalogo. Si difieren, exige canOverridePrice y deja
--      el precio original congelado en el snapshot (antes se descartaba).
--   3. record_sale_atomic_v2 / edit_apartado_atomic -- exigen canApplyDiscount
--      cuando se aplica o cambia un descuento.
--   4. te_save_user_permissions -- nueva RPC SECURITY DEFINER: unico camino
--      para escribir config.id='user_permissions'. Valida canManageSettings
--      en el servidor (nunca canManageCatalogSettings) y registra en
--      Actividad que cambio y para quien. settings.js debe usarla en vez del
--      POST directo a la tabla config.
--   5. Override de Areli (igual que antes).

-- -----------------------------------------------------------------------------
-- 1a. te_has_permission -- agrega los 2 permisos con default por rol
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_has_permission(p_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email       text;
  v_role        text := public.get_user_role();
  v_permissions jsonb;
  v_user        jsonb;
  v_override    jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  BEGIN
    SELECT value::jsonb
      INTO v_permissions
    FROM public.config
    WHERE id = 'user_permissions';
  EXCEPTION WHEN OTHERS THEN
    v_permissions := '{}'::jsonb;
  END;

  v_user := COALESCE(v_permissions -> v_email, '{}'::jsonb);
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

-- -----------------------------------------------------------------------------
-- 1b. get_my_permissions -- agrega las 3 claves nuevas a la respuesta
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  v_role := public.get_user_role();
  RETURN jsonb_build_object(
    'role', v_role,
    'canAddProduct', public.te_has_permission('canAddProduct'),
    'canEditProduct', public.te_has_permission('canEditProduct'),
    'canDeleteProduct', public.te_has_permission('canDeleteProduct'),
    'canPublishProduct', public.te_has_permission('canPublishProduct'),
    'canBulkDelete', public.te_has_permission('canBulkDelete'),
    'canImportJSON', public.te_has_permission('canImportJSON'),
    'canMasivo', public.te_has_permission('canMasivo'),
    'canCancelSale', public.te_has_permission('canCancelSale'),
    'canEditApartado', public.te_has_permission('canEditApartado'),
    'canViewReports', public.te_has_permission('canViewReports'),
    'canViewActivity', public.te_has_permission('canViewActivity'),
    'canManageSettings', public.te_has_permission('canManageSettings'),
    'canManageCatalogSettings', public.te_has_permission('canManageCatalogSettings'),
    'canOverridePrice', public.te_has_permission('canOverridePrice'),
    'canApplyDiscount', public.te_has_permission('canApplyDiscount')
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. te_snapshot_sale_items -- valida el precio contra el catalogo y congela
--    el precio original cuando hay una diferencia autorizada.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_snapshot_sale_items(p_items jsonb)
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

    -- Precio modificado respecto al catalogo -- requiere permiso explicito.
    -- Sin esto, cualquiera con acceso a Caja podia mandar cualquier precio
    -- via API aunque la UI escondiera el campo.
    v_catalog_price := round(COALESCE(v_product.price, 0), 2);
    IF v_price <> v_catalog_price THEN
      IF NOT public.te_has_permission('canOverridePrice') THEN
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
-- 3a. record_sale_atomic_v2 -- exige canApplyDiscount cuando hay descuento, y
--     marca price_overridden en el log de actividad cuando algun item trae
--     precio distinto al catalogo (te_snapshot_sale_items ya lo valido).
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
  p_due_date date DEFAULT NULL
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

  v_items := public.te_snapshot_sale_items(p_items);
  v_price_overridden := EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e.value ? 'original_price'
  );

  SELECT COALESCE(SUM((x.item ->> 'subtotal')::numeric), 0)
    INTO v_subtotal
  FROM jsonb_array_elements(v_items) AS x(item);

  v_discount := round(COALESCE(p_discount, 0), 2);
  IF NOT public.te_numeric_is_finite(v_discount)
     OR v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Descuento invalido';
  END IF;
  IF v_discount > 0 AND NOT public.te_has_permission('canApplyDiscount') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para aplicar descuentos';
  END IF;
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
        'price_overridden', v_price_overridden,
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
        'price_overridden', v_price_overridden,
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
        'price_overridden', v_price_overridden,
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
-- 3b. edit_apartado_atomic -- exige canApplyDiscount solo cuando el descuento
--     realmente cambia respecto al que ya tenia el apartado (el precio ya
--     queda cubierto por te_snapshot_sale_items, que esta funcion tambien usa).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_apartado_atomic(
  p_request_id uuid,
  p_sale_id bigint,
  p_items jsonb,
  p_expected_version bigint,
  p_discount numeric DEFAULT NULL
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_has_permission('canEditApartado') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para editar apartados';
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
    public.te_snapshot_sale_items(p_items),
    v_sale.items
  );
  v_price_overridden := EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) e WHERE e.value ? 'original_price'
  );

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
  IF v_discount <> round(COALESCE(v_sale.discount, 0), 2)
     AND NOT public.te_has_permission('canApplyDiscount') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para modificar el descuento';
  END IF;
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
      'price_overridden', v_price_overridden, 'request_id', p_request_id
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
-- 4. te_save_user_permissions -- unico camino para escribir
--    config.id='user_permissions'. Antes settings.js hacia un POST directo a
--    la tabla config, sin ninguna verificacion de permiso en el servidor mas
--    alla de la politica RLS de la tabla. Esta RPC valida canManageSettings
--    explicitamente (nunca canManageCatalogSettings) y registra en Actividad
--    exactamente que cambio y para quien, antes de escribir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.te_save_user_permissions(p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old        jsonb;
  v_new        jsonb := COALESCE(p_permissions, '{}'::jsonb);
  v_email      text;
  v_old_user   jsonb;
  v_new_user   jsonb;
  v_changes    text[] := '{}';
  v_key        text;
  v_old_val    jsonb;
  v_new_val    jsonb;
  v_all_emails text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;
  IF NOT public.te_has_permission('canManageSettings') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para editar permisos de usuarios';
  END IF;
  IF jsonb_typeof(v_new) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Formato de permisos invalido';
  END IF;

  BEGIN
    SELECT value::jsonb INTO v_old FROM public.config WHERE id = 'user_permissions';
  EXCEPTION WHEN OTHERS THEN
    v_old := '{}'::jsonb;
  END;
  v_old := COALESCE(v_old, '{}'::jsonb);

  SELECT array_agg(DISTINCT e) INTO v_all_emails
  FROM (
    SELECT jsonb_object_keys(v_old) AS e
    UNION
    SELECT jsonb_object_keys(v_new) AS e
  ) x;

  FOREACH v_email IN ARRAY COALESCE(v_all_emails, '{}')
  LOOP
    v_old_user := v_old -> v_email;
    v_new_user := v_new -> v_email;
    IF v_old_user IS DISTINCT FROM v_new_user THEN
      IF v_new_user IS NULL THEN
        v_changes := v_changes || format('%s: eliminado de la lista', v_email);
      ELSIF v_old_user IS NULL THEN
        v_changes := v_changes || format('%s: agregado (%s)', v_email, COALESCE(v_new_user ->> 'role', 'operador'));
      ELSE
        FOR v_key IN
          SELECT DISTINCT k FROM (
            SELECT jsonb_object_keys(v_old_user) AS k
            UNION
            SELECT jsonb_object_keys(v_new_user) AS k
          ) kk
        LOOP
          v_old_val := v_old_user -> v_key;
          v_new_val := v_new_user -> v_key;
          IF v_old_val IS DISTINCT FROM v_new_val THEN
            v_changes := v_changes || format('%s.%s: %s -> %s',
              v_email, v_key,
              COALESCE(v_old_val #>> '{}', 'sin definir'),
              COALESCE(v_new_val #>> '{}', 'sin definir'));
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.config (id, value)
  VALUES ('user_permissions', v_new::text)
  ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;

  IF array_length(v_changes, 1) > 0 THEN
    PERFORM public.te_log_activity(
      'permisos_editados',
      format('Actualizo permisos: %s', array_to_string(v_changes, '; ')),
      jsonb_build_object('changes', to_jsonb(v_changes))
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.te_save_user_permissions(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_save_user_permissions(jsonb) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Override de Areli: acceso solo a Catalogo dentro de Configuracion, sin
--    Reportes ni Actividad. Merge seguro -- no pisa otras claves que ya tenga
--    ni otros usuarios en el mismo JSON.
-- -----------------------------------------------------------------------------
INSERT INTO public.config (id, value)
VALUES (
  'user_permissions',
  jsonb_build_object(
    'areli@tresencantos.com', jsonb_build_object(
      'role', 'operador',
      'canManageCatalogSettings', true,
      'canManageSettings', false,
      'canViewReports', false,
      'canViewActivity', false
    )
  )::text
)
ON CONFLICT (id) DO UPDATE
SET value = (
  COALESCE(public.config.value::jsonb, '{}'::jsonb)
  || jsonb_build_object(
       'areli@tresencantos.com',
       COALESCE(public.config.value::jsonb -> 'areli@tresencantos.com', '{}'::jsonb)
         || jsonb_build_object(
              'role', 'operador',
              'canManageCatalogSettings', true,
              'canManageSettings', false,
              'canViewReports', false,
              'canViewActivity', false
            )
     )
)::text;
