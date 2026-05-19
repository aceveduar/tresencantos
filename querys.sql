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