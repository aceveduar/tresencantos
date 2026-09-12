-- =============================================================================
-- Limpieza de RLS en `products` (2026-09-12) -- encontrado al preparar la
-- extensión del PIN de autorización a Inventario (canDeleteProduct/
-- canPublishProduct/canBulkDelete), pendiente desde 20260821_01_override_pin.sql
-- ("requiere ver el texto vigente de esas políticas primero").
--
-- Auditoría en vivo (SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE tablename='products') encontró que las políticas granulares por rol
-- eran decorativas: una política vieja "Products are modifiable by
-- authenticated users" (FOR ALL, qual: auth.role()='authenticated', sin
-- ningún chequeo de rol) dejaba pasar a CUALQUIER usuario autenticado para
-- insertar/editar/eliminar cualquier producto, sin importar su rol -- en
-- Postgres las políticas permisivas se combinan con OR, así que basta una
-- sola política permisiva de más para volver inútiles todas las demás.
--
-- Efecto real, antes de este fix:
-- - Un 'operador' SÍ podía eliminar productos (existía hasta una política
--   con su nombre, "operador_delete_products", que se lo permitía
--   explícitamente) -- contradice la matriz de permisos documentada
--   ("Eliminar producto: superadmin ✓, encargado ✓, operador ✗").
-- - 'encargado' no aparecía en absoluto en products_insert/products_update
--   (solo superadmin/operador/duena) -- nunca se notó porque la política
--   ALL ya lo dejaba pasar igual.
-- - Las 3 entradas 'duena' en los arreglos de rol son inofensivas desde
--   20260905_01_retire_duena_role.sql -- get_user_role() nunca vuelve a
--   devolver ese string (alias a 'superadmin' en el origen), así que esas
--   ramas ya eran letra muerta antes de este archivo; se quitan aquí de
--   paso por claridad, no porque cambiaran el comportamiento.
--
-- Este archivo SOLO consolida las políticas para que coincidan con la
-- matriz de permisos ya documentada. El mecanismo de ticket/PIN
-- (te_override_valid) para canDeleteProduct/canBulkDelete/canPublishProduct
-- se agrega en una migración aparte, después de confirmar que esta
-- consolidación no rompió nada en producción.
-- =============================================================================
BEGIN;

-- Catch-all que volvía decorativas todas las políticas de abajo.
DROP POLICY IF EXISTS "Products are modifiable by authenticated users" ON public.products;

-- Le daba DELETE a 'operador' -- contradice la matriz de permisos.
DROP POLICY IF EXISTS "operador_delete_products" ON public.products;

-- DELETE: superadmin, encargado. (canDeleteProduct / canBulkDelete)
DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete" ON public.products
  FOR DELETE
  USING (get_user_role() = ANY (ARRAY['superadmin', 'encargado']));

-- INSERT: superadmin, encargado, operador. (canAddProduct -- los 3 roles
-- pueden agregar según la matriz; antes le faltaba 'encargado')
DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert" ON public.products
  FOR INSERT
  WITH CHECK (get_user_role() = ANY (ARRAY['superadmin', 'encargado', 'operador']));

-- UPDATE: superadmin, encargado, operador. (canEditProduct -- los 3 roles
-- pueden editar/precio según la matriz; antes le faltaba 'encargado'.
-- canPublishProduct -- que operador no debería poder publicar/ocultar --
-- sigue siendo un chequeo solo de cliente por ahora, igual que antes de
-- este archivo; RLS no distingue qué columna cambió dentro de un UPDATE
-- sin un trigger aparte, fuera de alcance de esta limpieza puntual.)
DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products
  FOR UPDATE
  USING (get_user_role() = ANY (ARRAY['superadmin', 'encargado', 'operador']));

COMMIT;
