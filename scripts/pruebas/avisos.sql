-- Pruebas de Avisos al equipo (migración 20261014_03). Personas temporales,
-- todo dentro de BEGIN … ROLLBACK. Correr con: powershell -ExecutionPolicy Bypass -File scripts/pruebas.ps1

BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'duena@prueba.test', '{"role":"superadmin"}', '{}', now(), now(), now()),
       ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'cajera@prueba.test', '{"role":"operador"}', '{}', now(), now(), now());
INSERT INTO public.config (id, value) VALUES ('user_permissions', '{}') ON CONFLICT (id) DO NOTHING;
UPDATE public.config SET value = (value::jsonb || '{"duena@prueba.test":{"role":"superadmin"},"cajera@prueba.test":{"role":"operador"}}'::jsonb)::text WHERE id = 'user_permissions';

CREATE TEMP TABLE _r (caso text, resultado text); GRANT ALL ON _r TO authenticated;
CREATE TEMP TABLE _c (k text PRIMARY KEY, v text); GRANT ALL ON _c TO authenticated;
CREATE TEMP TABLE _ok_final (prueba text);
SELECT set_config('role', 'authenticated', true);

-- 1. La dueña publica
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","email":"duena@prueba.test","role":"authenticated"}', true);
DO $$ DECLARE j jsonb; BEGIN
  j := public.te_save_notice(null, 'Prueba de aviso', 'Texto corto', 'fotos', 'todos', current_date + 7);
  INSERT INTO _c VALUES ('id', j->>'id');
  INSERT INTO _r VALUES ('1 publicar', 'ok');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('1 publicar', 'ERROR ' || SQLERRM); END $$;

-- 2. Fecha pasada se rechaza
DO $$ BEGIN
  PERFORM public.te_save_notice(null, 'x', '', null, 'todos', current_date - 1);
  INSERT INTO _r VALUES ('2 fecha pasada', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('2 fecha pasada', 'rechazado'); END $$;

-- 3. Texto de más de 280 se rechaza (avisos cortos)
DO $$ BEGIN
  PERFORM public.te_save_notice(null, 'x', repeat('a', 281), null, 'todos', current_date + 1);
  INSERT INTO _r VALUES ('3 texto largo', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('3 texto largo', 'rechazado'); END $$;

-- 4. La cajera no puede publicar ni quitar
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","email":"cajera@prueba.test","role":"authenticated"}', true);
DO $$ BEGIN
  PERFORM public.te_save_notice(null, 'x', '', null, 'todos', current_date + 1);
  INSERT INTO _r VALUES ('4a cajera publica', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('4a cajera publica', 'rechazado'); END $$;
DO $$ BEGIN
  PERFORM public.te_remove_notice((SELECT v::bigint FROM _c WHERE k = 'id'));
  INSERT INTO _r VALUES ('4b cajera quita', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('4b cajera quita', 'rechazado'); END $$;

-- 5. La cajera lo lee (dos veces: no duplica) y solo ve sus propias lecturas
DO $$ BEGIN
  PERFORM public.te_mark_notice_read((SELECT v::bigint FROM _c WHERE k = 'id'));
  PERFORM public.te_mark_notice_read((SELECT v::bigint FROM _c WHERE k = 'id'));
  INSERT INTO _r SELECT '5 cajera lee', 'lecturas propias=' || count(*) FROM public.team_notice_reads;
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('5 cajera lee', 'ERROR ' || SQLERRM); END $$;
-- 5b. Descartar (✕) queda registrado por persona y sigue contando como leído
DO $$ BEGIN
  PERFORM public.te_mark_notice_read((SELECT v::bigint FROM _c WHERE k = 'id'), true);
  PERFORM public.te_mark_notice_read((SELECT v::bigint FROM _c WHERE k = 'id'));  -- abrirlo otra vez no lo "des-descarta"
  INSERT INTO _r SELECT '5b cajera descarta', 'descartado=' || (dismissed_at IS NOT NULL) FROM public.team_notice_reads;
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('5b cajera descarta', 'ERROR ' || SQLERRM); END $$;
DO $$ BEGIN
  PERFORM * FROM public.te_notice_readers();
  INSERT INTO _r VALUES ('6 cajera ve lectores', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('6 cajera ve lectores', 'rechazado'); END $$;
DO $$ BEGIN
  INSERT INTO public.team_notices (title, body, until, created_by) VALUES ('directo', '', current_date + 1, 'x');
  INSERT INTO _r VALUES ('7 escribir directo', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('7 escribir directo', 'rechazado'); END $$;

-- 8. La dueña ve quién lo leyó y lo quita
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","email":"duena@prueba.test","role":"authenticated"}', true);
DO $$ BEGIN
  INSERT INTO _r SELECT '8 dueña ve lectores', string_agg(user_email, ',') FROM public.te_notice_readers() WHERE notice_id = (SELECT v::bigint FROM _c WHERE k = 'id');
  PERFORM public.te_remove_notice((SELECT v::bigint FROM _c WHERE k = 'id'));
  INSERT INTO _r SELECT '9 quitar', 'activo=' || active FROM public.team_notices WHERE id = (SELECT v::bigint FROM _c WHERE k = 'id');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES ('8 dueña ve lectores', 'ERROR ' || SQLERRM); END $$;

SELECT set_config('role', 'postgres', true);
DO $$
DECLARE e record; got text;
BEGIN
  FOR e IN SELECT * FROM (VALUES
    ('1 publicar', 'ok', 'la dueña publica un aviso'),
    ('2 fecha pasada', 'rechazado', 'no se publica un aviso ya vencido'),
    ('3 texto largo', 'rechazado', 'el texto de un aviso no pasa de 280 caracteres'),
    ('4a cajera publica', 'rechazado', 'una cajera no publica avisos'),
    ('4b cajera quita', 'rechazado', 'una cajera no quita avisos'),
    ('5 cajera lee', 'lecturas propias=1', 'leer dos veces cuenta una vez y cada quien ve solo lo suyo'),
    ('5b cajera descarta', 'descartado=true', 'descartar queda por persona (no por dispositivo) y no se deshace al abrirlo'),
    ('6 cajera ve lectores', 'rechazado', 'una cajera no ve quién leyó'),
    ('7 escribir directo', 'rechazado', 'nadie escribe avisos sin la RPC'),
    ('8 dueña ve lectores', 'cajera@prueba.test', 'la dueña ve quién leyó'),
    ('9 quitar', 'activo=false', 'quitar un aviso lo deja de mostrar')
  ) AS t(caso, esperado, nombre) LOOP
    SELECT resultado INTO got FROM _r WHERE caso = e.caso;
    IF got IS NULL OR got NOT LIKE e.esperado THEN
      RAISE EXCEPTION 'PRUEBA FALLÓ: % (obtuve: %)', e.nombre, coalesce(got, 'nada');
    END IF;
    INSERT INTO _ok_final VALUES ('Avisos: ' || e.nombre);
  END LOOP;
END $$;
INSERT INTO _ok_final VALUES ('TODAS LAS PRUEBAS PASARON');
SELECT prueba FROM _ok_final;
ROLLBACK;
