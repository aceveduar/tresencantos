-- Disponibilidad de productos: una sola fuente de verdad (2026-10-10).
--
-- Cada producto guardaba su disponibilidad en tres columnas que cada pantalla
-- actualizaba por su cuenta: stock, out_of_stock e is_apartado. Se podían
-- contradecir (revisión del 10 oct: 22 productos):
--   * "apartado" con piezas libres (llegó mercancía y nadie quitó la marca):
--     la Tienda decía "solo consultar" aunque había pieza para vender.
--   * "apartado" y "agotado" a la vez.
--   * disponible con 0 piezas y sin apartar: la Tienda lo ofrecía y Caja lo
--     daba por agotado.
--
-- Ahora la base las calcula sola en cada INSERT/UPDATE, venga de donde venga
-- (Inventario, Caja, Recepción, importar, RPC), para productos que no son kit:
--   * archivado            → agotado, no apartado.
--   * stock > 0            → disponible, no apartado.
--   * stock = 0 y está en un apartado activo → "apartado" (la Tienda muestra
--                            "📌 Apartado"), no agotado.
--   * stock = 0 y nadie lo apartó          → agotado.
-- Marcar a mano (sin tocar piezas):
--   * "Agotado" con piezas → las piezas pasan a 0 (agotado = no hay).
--   * "Disponible" con 0 piezas → 1 pieza (misma regla que ya usaba la app).
-- Los kits no cambian (stock 0 y disponibilidad calculada por componentes).
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_06_disponibilidad_desde_stock.sql

BEGIN;

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
        AND d.product_id = NEW.id
    ) INTO v_reserved;
    NEW.is_apartado := v_reserved;
    NEW.out_of_stock := NOT v_reserved;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.te_products_stock_sync() FROM PUBLIC, anon, authenticated;

-- "0_" para que corra antes que los demás BEFORE de products (se ejecutan
-- en orden alfabético): la caja negra y el guardia de publicar ven ya los
-- valores corregidos.
DROP TRIGGER IF EXISTS te_products_0_stock_sync_trg ON public.products;
CREATE TRIGGER te_products_0_stock_sync_trg
  BEFORE INSERT OR UPDATE OF stock, out_of_stock, is_apartado, is_archived, kit_items
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.te_products_stock_sync();

-- Corregir los que ya estaban contradictorios (solo esos: reescribir el
-- catálogo completo llenaría la caja negra de cambios que no cambian nada).
UPDATE public.products p
   SET stock = p.stock  -- dispara el trigger, que recalcula las banderas
 WHERE NOT COALESCE(p.is_archived, false)
   -- COALESCE: con kit_items NULL la condición sería NULL y saltaría el producto.
   AND NOT COALESCE(jsonb_typeof(p.kit_items) = 'array' AND jsonb_array_length(p.kit_items) > 0, false)
   AND (
        (COALESCE(p.stock, 0) > 0 AND (p.out_of_stock OR p.is_apartado))
     OR (COALESCE(p.stock, 0) <= 0 AND p.out_of_stock = p.is_apartado)
     OR (COALESCE(p.stock, 0) <= 0 AND p.is_apartado AND NOT EXISTS (
           SELECT 1 FROM public.sales s
           CROSS JOIN LATERAL public.te_inventory_demand(s.items) d
           WHERE s.origin_type = 'apartado' AND s.status = 'activo'
             AND s.cancelled_at IS NULL AND d.product_id = p.id))
   );

COMMIT;
