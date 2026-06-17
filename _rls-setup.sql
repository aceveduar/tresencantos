-- ═══════════════════════════════════════════════════════════════════
-- TRES ENCANTOS — Políticas RLS (Row Level Security)
-- Correr completo en: Supabase → SQL Editor → Run (▶)
-- IMPORTANTE: correr ANTES de hacer deploy del JS actualizado
-- Si algo falla, verificar en Authentication → Policies
-- ═══════════════════════════════════════════════════════════════════

-- ── Helper: extrae el rol del JWT del usuario activo ────────────────
-- Lee de user_metadata.role (asignado via SQL UPDATE auth.users)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    'anon'
  );
$$;

-- ── PRODUCTS ────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Tienda pública (anon): solo productos publicados
-- app.js ya filtra out_of_stock y is_apartado en la query
CREATE POLICY "products_anon_select" ON products
  FOR SELECT
  USING (auth.role() = 'anon' AND is_published = true);

-- Admin (autenticado): todos los productos sin restricción
CREATE POLICY "products_auth_select" ON products
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: superadmin, operador, duena
CREATE POLICY "products_insert" ON products
  FOR INSERT
  WITH CHECK (get_user_role() IN ('superadmin', 'operador', 'duena'));

-- UPDATE: superadmin, operador, duena
CREATE POLICY "products_update" ON products
  FOR UPDATE
  USING (get_user_role() IN ('superadmin', 'operador', 'duena'));

-- DELETE: superadmin, duena y encargado
CREATE POLICY "products_delete" ON products
  FOR DELETE
  USING (get_user_role() IN ('superadmin', 'duena', 'encargado'));


-- ── SALES ───────────────────────────────────────────────────────────
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- SELECT: todos los autenticados (Caja, Reportes, Actividad)
CREATE POLICY "sales_auth_select" ON sales
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: todos los autenticados (registrar venta/apartado)
CREATE POLICY "sales_insert" ON sales
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: todos los autenticados (abonar, editar apartado)
CREATE POLICY "sales_update" ON sales
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- DELETE: superadmin + encargado (cancelar venta — acción restringida)
CREATE POLICY "sales_delete" ON sales
  FOR DELETE
  USING (get_user_role() IN ('superadmin', 'encargado'));


-- ── CONFIG ──────────────────────────────────────────────────────────
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- SELECT público (anon): solo categorías y revista — NO expone groq_key, drive_ep, drive_secret
CREATE POLICY "config_anon_select" ON config
  FOR SELECT
  USING (auth.role() = 'anon' AND id IN ('categories', 'revista_url'));

-- SELECT autenticado: todo (groq_key, drive_ep, drive_secret, user_names, etc.)
CREATE POLICY "config_auth_select" ON config
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: solo superadmin (guardar Groq key, Drive, categorías, etc.)
CREATE POLICY "config_insert" ON config
  FOR INSERT
  WITH CHECK (get_user_role() = 'superadmin');

-- UPDATE: solo superadmin
CREATE POLICY "config_update" ON config
  FOR UPDATE
  USING (get_user_role() = 'superadmin');


-- ── ACTIVITY_LOG ────────────────────────────────────────────────────
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- SELECT: superadmin y duena (módulo Actividad)
CREATE POLICY "activity_select" ON activity_log
  FOR SELECT
  USING (get_user_role() IN ('superadmin', 'duena'));

-- INSERT: todos los autenticados (logActivity desde cualquier módulo)
CREATE POLICY "activity_insert" ON activity_log
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: solo superadmin (limpiar historial en Configuración)
CREATE POLICY "activity_delete" ON activity_log
  FOR DELETE
  USING (get_user_role() = 'superadmin');


-- ── RECENTLY_EDITED ─────────────────────────────────────────────────
ALTER TABLE recently_edited ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer y escribir (lista de productos recientes en Inventario)
CREATE POLICY "recently_edited_auth" ON recently_edited
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ── STORAGE: bucket "revistas" ───────────────────────────────────────
-- Ejecutar SOLO si usas Storage para PDFs de la revista Natura
-- Si el bucket no existe aún, se crea automáticamente la primera vez que se sube un PDF

-- Permitir subida solo a superadmin
CREATE POLICY "revistas_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'revistas'
    AND get_user_role() = 'superadmin'
  );

-- Lectura pública (para que las clientas vean la revista)
CREATE POLICY "revistas_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'revistas');

-- ═══════════════════════════════════════════════════════════════════
-- FIN — Verificar en Authentication → Policies que aparezcan todas
-- Luego hacer deploy del JS y probar cada módulo
-- ═══════════════════════════════════════════════════════════════════
