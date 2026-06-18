-- Ejecutar en Supabase SQL Editor
-- Amplía permisos de operador: puede eliminar productos y publicar en web

-- DELETE: agregar política permisiva para operador
-- (las políticas permisivas se combinan con OR, así que no necesitamos
--  tocar las políticas existentes — solo agregamos la nueva)
CREATE POLICY "operador_delete_products" ON products
  FOR DELETE TO authenticated
  USING (get_user_role() = 'operador');

-- PUBLISH: operador ya podía hacer UPDATE (para editar precio/nombre/etc)
-- y la restricción era solo en el frontend. No se requiere cambio en RLS.
