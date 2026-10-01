-- ============================================================================
-- 20260930_01_security_hardening.sql
--
-- Auditoría de seguridad 2026-09-30 (verificado contra producción con
-- `supabase db advisors` + consultas con la clave anon pública de la Tienda).
--
-- Hallazgos que corrige:
--  1. CRÍTICO — política vieja "Config is viewable by everyone" (USING true):
--     cualquier visitante de la Tienda podía leer groq_key, drive_secret,
--     drive_ep, user_permissions y user_names. Las políticas nuevas y correctas
--     (config_anon_read / config_auth_select) ya existían, pero RLS combina
--     políticas permisivas con OR, así que la vieja las anulaba.
--  2. CRÍTICO — política vieja "Products are viewable by everyone" (USING true):
--     anon veía productos NO publicados (150 al momento de la auditoría) y
--     columnas internas (cost, barcode, supplier_code). Además se restringen
--     las COLUMNAS que anon puede leer, porque RLS solo filtra filas: aun con
--     la política correcta, anon podía pedir `select=cost` de lo publicado.
--  3. ALTO — 53 funciones SECURITY DEFINER ejecutables por `anon` (sin sesión).
--     Las que validan auth.uid() rechazan igual, pero varias no validan nada
--     (te_refresh_apartado_product_flags escribe en products; te_products_state
--     y _te_permission_for_email filtran información). Ahora solo
--     `authenticated` ejecuta funciones, salvo te_log_failed_login (se llama
--     antes de iniciar sesión, por diseño) y los helpers internos, que solo
--     se llaman desde otras funciones SECURITY DEFINER (corren como dueño).
--  4. MEDIO — search_path mutable en 3 funciones.
--
-- Lo que la Tienda pública necesita y se conserva (verificado en app.js):
--   products: id,name,category,category_label,price,original_price,description,
--             image,badge,badge_type,featured,out_of_stock,is_apartado,stock,
--             images,kit_items  (+ is_published/position para filtrar/ordenar)
--   config:   categories, wa_float, revista_url, revista_cover (config_anon_read)
--
-- Reversible: cada política borrada se puede recrear; los GRANT se pueden
-- volver a dar. Ejecutar en el SQL Editor de Supabase.
--
-- ⚠️ DESPUÉS de ejecutar: ROTAR groq_key y drive_secret (estuvieron expuestas
-- públicamente; no hay forma de saber si alguien las copió).
-- ============================================================================

BEGIN;

-- ── 1. config: quitar lectura pública total ─────────────────────────────────
DROP POLICY IF EXISTS "Config is viewable by everyone" ON public.config;
-- Redundante con config_anon_read (que además incluye revista_cover/wa_float):
DROP POLICY IF EXISTS config_anon_select ON public.config;

-- ── 2. products: quitar lectura pública total + limitar columnas a anon ─────
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;

REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, name, category, category_label, price, original_price, description,
  image, badge, badge_type, featured, out_of_stock, is_apartado, stock,
  images, kit_items, is_published, position
) ON public.products TO anon;

-- anon nunca escribe productos (la Tienda solo lee):
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.config   FROM anon;

-- ── 3. Funciones: nadie sin sesión ejecuta nada (salvo login fallido) ───────
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      -- excluir funciones que pertenecen a extensiones
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;

-- Se llama desde la pantalla de login, antes de tener sesión:
GRANT EXECUTE ON FUNCTION public.te_log_failed_login(text) TO anon;

-- Helpers internos: solo los llaman otras funciones SECURITY DEFINER (que
-- corren como dueño), nunca la app. Verificado: ninguna función invoker ni el
-- cliente los llama.
REVOKE EXECUTE ON FUNCTION public.te_refresh_apartado_product_flags(bigint[])          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.te_products_state(bigint[])                          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._te_permission_for_email(text, text)                 FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._te_is_superadmin_email(text)                        FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.te_consume_matching_override(text, uuid[])           FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.te_inventory_demand(jsonb)                           FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.te_preserve_item_kit_snapshots(jsonb, jsonb)         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.te_assert_authoritative_inventory_snapshot(jsonb, text) FROM authenticated;

-- Funciones futuras: que no nazcan ejecutables por anon/PUBLIC.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- ── 4. search_path fijo ─────────────────────────────────────────────────────
ALTER FUNCTION public._te_is_far_from_store(double precision, double precision)   SET search_path = public;
ALTER FUNCTION public._te_distance_to_store_m(double precision, double precision) SET search_path = public;
ALTER FUNCTION public.te_search_activity_meta(text, timestamptz, text)            SET search_path = public;

COMMIT;
