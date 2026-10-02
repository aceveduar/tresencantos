-- Caja negra de cambios manuales a productos (2026-10-02).
--
-- Decisión: en vez de bloquear en servidor los cambios de precio/stock por
-- permiso fino (los operadores ya tienen canEditProduct por defecto, y precio
-- y costo cambian legítimamente desde Editar, Recibir con factura y Recepción
-- con IA -- un bloqueo protegería poco y arriesgaría romper flujos), se deja
-- un registro forense que el cliente no puede saltarse: quién cambió qué
-- campo sensible, cuándo, y de qué valor a cuál.
--
-- - Solo cambios manuales: los que hacen las RPC de venta/apartado (con
--   tresencantos.rpc_v2='on') no se registran -- ya viven en sale_payments.
-- - Tabla aparte (no activity_log): el cliente ya escribe "producto_editado"
--   en Actividad; duplicarlo ahí sería ruido. Esto es la versión que no se
--   puede omitir ni falsear, para investigar (p. ej. ajustes de stock).
-- - Lectura solo superadmin; nadie escribe directo (solo el trigger).

CREATE TABLE IF NOT EXISTS public.product_changes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  bigint NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  user_email  text,
  changes     jsonb NOT NULL   -- { "campo": [antes, después], ... }
);
CREATE INDEX IF NOT EXISTS product_changes_product_idx ON public.product_changes (product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS product_changes_time_idx ON public.product_changes (changed_at DESC);

ALTER TABLE public.product_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_changes TO authenticated;
DROP POLICY IF EXISTS product_changes_superadmin_select ON public.product_changes;
CREATE POLICY product_changes_superadmin_select ON public.product_changes
  FOR SELECT TO authenticated USING ((select public.get_user_role()) = 'superadmin');

CREATE OR REPLACE FUNCTION public.te_products_audit_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF current_setting('tresencantos.rpc_v2', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF NEW.price          IS DISTINCT FROM OLD.price          THEN v_changes := v_changes || jsonb_build_object('price',          jsonb_build_array(OLD.price, NEW.price)); END IF;
  IF NEW.original_price IS DISTINCT FROM OLD.original_price THEN v_changes := v_changes || jsonb_build_object('original_price', jsonb_build_array(OLD.original_price, NEW.original_price)); END IF;
  IF NEW.cost           IS DISTINCT FROM OLD.cost           THEN v_changes := v_changes || jsonb_build_object('cost',           jsonb_build_array(OLD.cost, NEW.cost)); END IF;
  IF NEW.stock          IS DISTINCT FROM OLD.stock          THEN v_changes := v_changes || jsonb_build_object('stock',          jsonb_build_array(OLD.stock, NEW.stock)); END IF;
  IF NEW.out_of_stock   IS DISTINCT FROM OLD.out_of_stock   THEN v_changes := v_changes || jsonb_build_object('out_of_stock',   jsonb_build_array(OLD.out_of_stock, NEW.out_of_stock)); END IF;
  IF NEW.is_published   IS DISTINCT FROM OLD.is_published   THEN v_changes := v_changes || jsonb_build_object('is_published',   jsonb_build_array(OLD.is_published, NEW.is_published)); END IF;
  IF NEW.is_archived    IS DISTINCT FROM OLD.is_archived    THEN v_changes := v_changes || jsonb_build_object('is_archived',    jsonb_build_array(OLD.is_archived, NEW.is_archived)); END IF;
  IF NEW.name           IS DISTINCT FROM OLD.name           THEN v_changes := v_changes || jsonb_build_object('name',           jsonb_build_array(OLD.name, NEW.name)); END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.product_changes (product_id, user_email, changes)
    VALUES (NEW.id, nullif(lower(auth.jwt() ->> 'email'), ''), v_changes);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.te_products_audit_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS te_products_audit_changes_trg ON public.products;
CREATE TRIGGER te_products_audit_changes_trg
  AFTER UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.te_products_audit_changes();
