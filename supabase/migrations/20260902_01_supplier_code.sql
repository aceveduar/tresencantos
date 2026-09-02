-- =============================================================================
-- supplier_code -- codigo de catalogo del proveedor (Natura, Avon, etc.) para
-- Recepcion con IA.
--
-- Cuando un renglon de una hoja de pedido no trae un match confiable por
-- nombre, el usuario lo vincula a mano una vez a un producto existente. Ese
-- vinculo se guarda aqui (el codigo interno del proveedor, ej. "1897" en
-- Natura -- distinto del barcode/EAN que usa Caja) para que la proxima vez
-- que ese mismo codigo aparezca en un pedido nuevo, el match sea automatico
-- y exacto en vez de volver a depender de similitud de nombre.
--
-- No es un campo visible en el formulario de producto -- es plomeria interna
-- de matching, no algo que se edite a mano dia a dia.
--
-- Aditiva, nullable, sin backfill (no hay forma de inferir el codigo de un
-- proveedor a partir de datos ya existentes). Ejecutar una sola vez en el
-- SQL Editor de Supabase.
-- =============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_code TEXT;
