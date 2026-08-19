-- TRES ENCANTOS
-- Guarda el precio de catalogo por linea de venta cuando difiere del precio
-- realmente cobrado (precio editado a mano en el carrito, sin pasar por el
-- campo "Agregar descuento"). Sin esto, el snapshot de la venta solo guarda
-- el precio cobrado y el precio de catalogo original se pierde para
-- siempre en cuanto se registra la venta -- Historial y Reportes no pueden
-- saber despues cuanto se descontio.
--
-- Migracion aditiva: reemplaza unicamente te_snapshot_sale_items (misma
-- firma), sin tocar tablas, policies ni las demas RPC. El campo nuevo
-- 'original_price' solo aparece en items donde el precio vendido no
-- coincide con products.price al momento de la venta/edicion; el resto de
-- items no cambia de forma.
--
-- Ejecutar en Supabase SQL Editor despues de 20260818_01_apartados_atomic_additive.sql.

BEGIN;

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

    v_name := COALESCE(NULLIF(btrim(v_item ->> 'name'), ''), v_product.name);
    v_normalized := jsonb_build_object(
      'id', v_id,
      'name', v_name,
      'price', v_price,
      'qty', v_qty,
      'subtotal', round(v_price * v_qty, 2)
    );

    -- Precio de catalogo al momento de la venta/edicion, solo si difiere del
    -- precio realmente cobrado. Se calcula aqui (no se confia en nada que
    -- mande el navegador) porque v_product ya esta cargado para este item.
    IF v_product.price IS NOT NULL AND round(v_product.price, 2) <> v_price THEN
      v_normalized := v_normalized || jsonb_build_object('original_price', round(v_product.price, 2));
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

REVOKE ALL ON FUNCTION public.te_snapshot_sale_items(jsonb) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificacion sugerida (solo lectura):
-- SELECT id, jsonb_pretty(items) FROM public.sales ORDER BY id DESC LIMIT 3;
-- Tras registrar una venta de prueba con precio editado, el item debe
-- traer la llave "original_price" ademas de "price".
