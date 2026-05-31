-- 1. Verificar qué rol tiene ahora
SELECT email, raw_user_meta_data->>'role' as rol
FROM auth.users
WHERE email = 'areli@tresencantos.com';

-- 2. Corregirlo (si no dice 'operador')
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"operador"}'
WHERE email = 'areli@tresencantos.com';

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"duena"}'
WHERE email = 'ofe@tresencantos.com';



-- Asignar created_by usando fecha en hora México (UTC-6)
-- Supabase guarda en UTC — usar AT TIME ZONE para no tener que restar 6 horas a mano
UPDATE products
SET created_by = 'areli@tresencantos.com'
WHERE created_by IS NULL
  AND (created_at AT TIME ZONE 'America/Mexico_City')::date = '2026-05-30'; -- ← cambia la fecha

-- Ver productos sin created_by con hora en México:
SELECT id, name,
  (created_at AT TIME ZONE 'America/Mexico_City') AS hora_mexico,
  created_by
FROM products
WHERE created_by IS NULL
ORDER BY created_at DESC LIMIT 20;


-- Imágenes en base64 (pesan mucho y causan egress alto)
-- Ver cuántos productos tienen imagen base64 vs Drive:
SELECT
  COUNT(*) FILTER (WHERE image LIKE 'data:image/%') AS con_base64,
  COUNT(*) FILTER (WHERE image LIKE '%drive.google.com%') AS con_drive,
  COUNT(*) FILTER (WHERE image NOT LIKE 'data:image/%' AND image NOT LIKE '%drive.google.com%') AS otro
FROM products;

-- Ver listado de productos con base64 (para ir uno por uno):
SELECT id, name, category_label, LEFT(image, 30) AS imagen_inicio
FROM products
WHERE image LIKE 'data:image/%'
ORDER BY name;



UPDATE products
SET created_by = 'eacevedo@sunname.com.mx'
WHERE id BETWEEN 502 AND 511
   OR id BETWEEN 515 AND 518;

UPDATE products
SET created_by = 'eacevedo@sunname.com.mx'
WHERE created_by IS NULL
  AND id BETWEEN 1 AND 189;

  UPDATE products
SET created_by = 'ofe@tresencantos.com'
WHERE created_by IS NULL;
