-- ============================================================================
-- 20260930_04_products_id_sequence.sql
--
-- products.id tiene DEFAULT nextval('products_id_seq'), pero la app siempre
-- calculaba el id en el cliente (max(id)+1 sobre su copia local) y lo mandaba
-- con `Prefer: resolution=merge-duplicates`. Si dos dispositivos creaban un
-- producto a la vez, ambos calculaban el mismo id y el segundo SOBRESCRIBÍA en
-- silencio el producto del primero. La secuencia nunca se usó (last_value=3,
-- max(id)=1288 al 2026-09-30).
--
-- A partir de este cambio la app deja de mandar `id` al crear y la BD lo asigna.
-- 1. Se adelanta la secuencia al máximo actual.
-- 2. Un trigger por sentencia la vuelve a adelantar si alguien inserta con id
--    explícito (Importar JSON y "Deshacer eliminar" sí mandan id a propósito),
--    para que nextval nunca choque con un id existente.
-- ============================================================================

BEGIN;

SELECT setval('public.products_id_seq', GREATEST((SELECT COALESCE(max(id), 0) FROM public.products), 1), true);

CREATE OR REPLACE FUNCTION public.te_products_sync_id_seq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_max bigint;
BEGIN
  SELECT max(id) INTO v_max FROM public.products;
  IF v_max IS NOT NULL AND v_max > (SELECT last_value FROM public.products_id_seq) THEN
    PERFORM setval('public.products_id_seq', v_max, true);
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.te_products_sync_id_seq() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS te_products_sync_id_seq_trg ON public.products;
CREATE TRIGGER te_products_sync_id_seq_trg
AFTER INSERT ON public.products
FOR EACH STATEMENT EXECUTE FUNCTION public.te_products_sync_id_seq();

-- authenticated necesita usar la secuencia para el DEFAULT al insertar.
GRANT USAGE ON SEQUENCE public.products_id_seq TO authenticated;

COMMIT;
