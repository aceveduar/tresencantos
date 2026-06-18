-- record_sale_atomic — función PostgreSQL para registro atómico de ventas
-- Ejecutar en Supabase SQL Editor (una sola vez)
--
-- ¿Por qué SECURITY DEFINER?
-- Los operadores pueden usar la Caja pero las políticas RLS de products
-- restringen UPDATE a superadmin/encargado/duena. SECURITY DEFINER permite
-- que todos los roles autenticados registren ventas (y el stock baje
-- correctamente) sin exponer una service_role_key en el cliente.
--
-- Atomicidad: todo ocurre en una sola transacción PostgreSQL.
-- Si el stock no alcanza, el INSERT de sales también se revierte.
-- Previene oversell cuando dos cajeras venden el mismo artículo simultáneamente.

CREATE OR REPLACE FUNCTION record_sale_atomic(
  p_items          jsonb,
  p_total          numeric,
  p_discount       numeric   DEFAULT 0,
  p_payment_method text      DEFAULT 'efectivo',
  p_note           text      DEFAULT NULL,
  p_type           text      DEFAULT 'venta',
  p_paid_amount    numeric   DEFAULT NULL,
  p_customer       text      DEFAULT NULL,
  p_due_date       date      DEFAULT NULL,
  p_abonos         jsonb     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id   bigint;
  v_item      jsonb;
  v_comp      jsonb;
  v_prod_id   int;
  v_comp_id   int;
  v_qty       int;
  v_comp_qty  int;
  v_cur_stock int;
  v_new_stock int;
  v_kit_items jsonb;
  v_is_apt    boolean;
  v_all_ids   int[];
BEGIN
  -- Solo usuarios autenticados
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_is_apt  := (p_type = 'apartado');
  v_all_ids := ARRAY[]::int[];

  -- Recopilar todos los IDs de productos que se tocarán (componentes para kits, producto directo para regulares)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'id')::int;
    v_qty     := COALESCE((v_item->>'qty')::int, 1);
    SELECT kit_items INTO v_kit_items FROM products WHERE id = v_prod_id;
    IF v_kit_items IS NOT NULL AND jsonb_array_length(v_kit_items) > 0 THEN
      FOR v_comp IN SELECT * FROM jsonb_array_elements(v_kit_items) LOOP
        v_all_ids := array_append(v_all_ids, (v_comp->>'id')::int);
      END LOOP;
    ELSE
      v_all_ids := array_append(v_all_ids, v_prod_id);
    END IF;
  END LOOP;

  -- Bloquear todas las filas afectadas en orden de ID (evita deadlocks entre transacciones concurrentes)
  PERFORM id FROM products
  WHERE id = ANY(v_all_ids)
  ORDER BY id
  FOR UPDATE;

  -- Validar stock suficiente para cada ítem
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'id')::int;
    v_qty     := COALESCE((v_item->>'qty')::int, 1);
    SELECT kit_items INTO v_kit_items FROM products WHERE id = v_prod_id;

    IF v_kit_items IS NOT NULL AND jsonb_array_length(v_kit_items) > 0 THEN
      -- Kit: validar cada componente
      FOR v_comp IN SELECT * FROM jsonb_array_elements(v_kit_items) LOOP
        v_comp_id  := (v_comp->>'id')::int;
        v_comp_qty := COALESCE((v_comp->>'qty')::int, 1);
        SELECT stock INTO v_cur_stock FROM products WHERE id = v_comp_id;
        IF v_cur_stock < (v_qty * v_comp_qty) THEN
          RAISE EXCEPTION 'Sin stock suficiente en componente del kit (id=%)', v_comp_id;
        END IF;
      END LOOP;
    ELSE
      -- Producto regular
      SELECT stock INTO v_cur_stock FROM products WHERE id = v_prod_id;
      IF COALESCE(v_cur_stock, 0) < v_qty THEN
        RAISE EXCEPTION 'Sin stock suficiente para producto id=%', v_prod_id;
      END IF;
    END IF;
  END LOOP;

  -- Insertar la venta
  INSERT INTO sales (
    total, items, discount, payment_method, note,
    type, paid_amount, customer, due_date, seller_email, abonos
  ) VALUES (
    p_total,
    p_items,
    NULLIF(p_discount, 0),
    p_payment_method,
    p_note,
    p_type,
    p_paid_amount,
    p_customer,
    p_due_date,
    auth.email(),
    p_abonos
  )
  RETURNING id INTO v_sale_id;

  -- Descontar stock para cada ítem
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'id')::int;
    v_qty     := COALESCE((v_item->>'qty')::int, 1);
    SELECT kit_items INTO v_kit_items FROM products WHERE id = v_prod_id;

    IF v_kit_items IS NOT NULL AND jsonb_array_length(v_kit_items) > 0 THEN
      -- Kit: descontar cada componente
      FOR v_comp IN SELECT * FROM jsonb_array_elements(v_kit_items) LOOP
        v_comp_id  := (v_comp->>'id')::int;
        v_comp_qty := COALESCE((v_comp->>'qty')::int, 1);
        SELECT stock INTO v_cur_stock FROM products WHERE id = v_comp_id;
        v_new_stock := GREATEST(0, v_cur_stock - (v_qty * v_comp_qty));
        UPDATE products SET
          stock        = v_new_stock,
          out_of_stock = CASE WHEN v_new_stock = 0 AND NOT v_is_apt THEN true  ELSE out_of_stock END,
          is_published = CASE WHEN v_new_stock = 0 AND NOT v_is_apt THEN false ELSE is_published END,
          is_apartado  = CASE WHEN v_new_stock = 0 AND     v_is_apt THEN true  ELSE is_apartado  END
        WHERE id = v_comp_id;
      END LOOP;
    ELSE
      -- Producto regular
      SELECT stock INTO v_cur_stock FROM products WHERE id = v_prod_id;
      v_new_stock := GREATEST(0, v_cur_stock - v_qty);
      UPDATE products SET
        stock        = v_new_stock,
        out_of_stock = CASE WHEN v_new_stock = 0 AND NOT v_is_apt THEN true  ELSE out_of_stock END,
        is_published = CASE WHEN v_new_stock = 0 AND NOT v_is_apt THEN false ELSE is_published END,
        is_apartado  = CASE WHEN v_new_stock = 0 AND     v_is_apt THEN true  ELSE is_apartado  END
      WHERE id = v_prod_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sale_id', v_sale_id);
END;
$$;

-- Solo usuarios autenticados pueden llamar esta función (no anon)
REVOKE ALL ON FUNCTION record_sale_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_sale_atomic TO authenticated;
