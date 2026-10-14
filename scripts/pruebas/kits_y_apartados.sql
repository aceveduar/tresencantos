-- Pruebas de kits, apartados (editar, abonar, liquidar), descuentos y límites del cobro.
-- Mismo esquema que caja.sql: personas temporales, todo dentro de BEGIN … ROLLBACK.
-- Correr con:  powershell -ExecutionPolicy Bypass -File scripts\pruebas.ps1

BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'duena@prueba.test', '{"role":"superadmin"}', '{}', now(), now(), now()),
       ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'cajera@prueba.test', '{"role":"operador"}', '{}', now(), now(), now());
INSERT INTO public.config (id, value) VALUES ('user_permissions', '{}') ON CONFLICT (id) DO NOTHING;
UPDATE public.config SET value = (value::jsonb || '{"duena@prueba.test":{"role":"superadmin"},"cajera@prueba.test":{"role":"operador"}}'::jsonb)::text WHERE id = 'user_permissions';

CREATE TEMP TABLE _r (n serial, caso text, resultado text);
GRANT ALL ON _r TO authenticated; GRANT USAGE ON SEQUENCE _r_n_seq TO authenticated;
CREATE TEMP TABLE _c (k text PRIMARY KEY, v text); GRANT ALL ON _c TO authenticated;
CREATE TEMP TABLE _ok_final (prueba text);

-- Componentes y kit (como postgres)
WITH a AS (INSERT INTO public.products (name, category, category_label, price, description, image, stock, is_published)
           VALUES ('Comp A', 'regalos', 'Regalos', 100, '', 'img/x.jpg', 5, true) RETURNING id),
     b AS (INSERT INTO public.products (name, category, category_label, price, description, image, stock, is_published)
           VALUES ('Comp B', 'regalos', 'Regalos', 80, '', 'img/x.jpg', 3, true) RETURNING id)
INSERT INTO _c SELECT 'a', id::text FROM a UNION ALL SELECT 'b', id::text FROM b;
INSERT INTO public.products (name, category, category_label, price, description, image, stock, is_published, kit_items)
SELECT 'Kit AB', 'regalos', 'Regalos', 230, '', 'img/x.jpg', 0, true,
       jsonb_build_array(jsonb_build_object('id', (SELECT v::bigint FROM _c WHERE k='a'), 'name', 'Comp A', 'qty', 1),
                         jsonb_build_object('id', (SELECT v::bigint FROM _c WHERE k='b'), 'name', 'Comp B', 'qty', 2));
INSERT INTO _c SELECT 'kit', id::text FROM public.products WHERE name = 'Kit AB';

SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","email":"duena@prueba.test","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
SELECT public.te_open_cash_shift(100, null, null);

CREATE OR REPLACE FUNCTION pg_temp.st() RETURNS text LANGUAGE sql AS $$
  SELECT format('A=%s B=%s kit(out_of_stock=%s)', (SELECT stock FROM public.products WHERE id=(SELECT v::bigint FROM _c WHERE k='a')),
    (SELECT stock FROM public.products WHERE id=(SELECT v::bigint FROM _c WHERE k='b')),
    (SELECT out_of_stock FROM public.products WHERE id=(SELECT v::bigint FROM _c WHERE k='kit'))) $$;
CREATE OR REPLACE FUNCTION pg_temp.item(k text, qty int, price numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('id', (SELECT v::bigint FROM _c WHERE _c.k=item.k), 'name', 'x', 'price', price, 'qty', qty)) $$;

INSERT INTO _r(caso, resultado) VALUES ('inicio', pg_temp.st());

-- 1. Vender 1 kit
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('kit',1,230), p_total => 230,
       p_payment_method => 'efectivo', p_paid_amount => 230);
  INSERT INTO _c VALUES ('venta_kit', j->'sale'->>'id');
  INSERT INTO _r(caso, resultado) VALUES ('1 vender 1 kit', 'ok, ' || pg_temp.st());
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('1 vender 1 kit', 'ERROR ' || SQLERRM); END $$;

-- 2. Vender otro kit sin componentes suficientes (B=1, necesita 2)
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('kit',1,230), p_total => 230,
       p_payment_method => 'efectivo', p_paid_amount => 230);
  INSERT INTO _r(caso, resultado) VALUES ('2 kit sin componentes', 'ACEPTADO, ' || pg_temp.st());
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('2 kit sin componentes', 'rechazado: ' || SQLERRM); END $$;

-- 3. Cancelar la venta del kit → componentes regresan
DO $$ DECLARE j jsonb; BEGIN
  j := public.cancel_sale_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _c WHERE k='venta_kit'),
       p_reason => 'prueba', p_expected_version => (SELECT version FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='venta_kit')));
  INSERT INTO _r(caso, resultado) VALUES ('3 cancelar kit', 'ok, ' || pg_temp.st());
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('3 cancelar kit', 'ERROR ' || SQLERRM); END $$;

-- 4. Total que no cuadra con los precios (cobrar $1 por algo de $100)
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('a',1,100), p_total => 1,
       p_payment_method => 'efectivo', p_paid_amount => 1);
  INSERT INTO _r(caso, resultado) VALUES ('4 total no cuadra', 'ACEPTADO total=' || (j->'sale'->>'total'));
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('4 total no cuadra', 'rechazado: ' || SQLERRM); END $$;

-- 5. Precio menor al de catálogo en el renglón (dueña sí tiene canOverridePrice)
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('a',1,50), p_total => 50,
       p_payment_method => 'efectivo', p_paid_amount => 50);
  INSERT INTO _r(caso, resultado) VALUES ('5 precio cambiado', 'aceptado total=' || (j->'sale'->>'total'));
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('5 precio cambiado', 'rechazado: ' || SQLERRM); END $$;

-- 6. Descuento de $20 sobre $100
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('a',1,100), p_total => 80, p_discount => 20,
       p_payment_method => 'transferencia', p_paid_amount => 80);
  INSERT INTO _r(caso, resultado) VALUES ('6 descuento', format('ok total=%s pagado=%s', j->'sale'->>'total', (SELECT sum(amount) FROM public.sale_payments WHERE sale_id=(j->'sale'->>'id')::bigint)));
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('6 descuento', 'ERROR ' || SQLERRM); END $$;

-- 7. Apartado de 1 A ($100) con $0 de anticipo
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('a',1,100), p_total => 100,
       p_payment_method => 'efectivo', p_is_apartado => true, p_paid_amount => 0, p_customer => 'Clienta Prueba', p_due_date => current_date + 30);
  INSERT INTO _c VALUES ('apt', j->'sale'->>'id');
  INSERT INTO _r(caso, resultado) VALUES ('7 apartado anticipo 0', format('ok status=%s, %s', j->'sale'->>'status', pg_temp.st()));
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('7 apartado anticipo 0', 'ERROR ' || SQLERRM); END $$;

-- 8. Editar apartado: agregar 1 B → total 180
DO $$ DECLARE j jsonb; BEGIN
  j := public.edit_apartado_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _c WHERE k='apt'),
       p_items => pg_temp.item('a',1,100) || pg_temp.item('b',1,80),
       p_expected_version => (SELECT version FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt')));
  INSERT INTO _r(caso, resultado) VALUES ('8 editar apartado +B', format('ok total=%s, %s', (SELECT total FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt')), pg_temp.st()));
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('8 editar apartado +B', 'ERROR ' || SQLERRM); END $$;

-- 9. Abono 50, luego intentar abonar de más (200 con saldo 130)
DO $$ DECLARE j jsonb; BEGIN
  PERFORM public.record_apartado_payment_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _c WHERE k='apt'),
       p_method => 'efectivo', p_amount => 50, p_expected_version => (SELECT version FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt')));
  INSERT INTO _r(caso, resultado) VALUES ('9a abono 50', 'ok');
  BEGIN
    PERFORM public.record_apartado_payment_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _c WHERE k='apt'),
       p_method => 'efectivo', p_amount => 200, p_expected_version => (SELECT version FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt')));
    INSERT INTO _r(caso, resultado) VALUES ('9b abonar de más', 'ACEPTADO');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('9b abonar de más', 'rechazado: ' || SQLERRM); END;
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('9 abonos', 'ERROR ' || SQLERRM); END $$;

-- 10. Editar apartado dejando total menor a lo pagado (quitar todo menos B: total 80 < pagado 50? no; quitar A y bajar precio B a 10)
DO $$ DECLARE j jsonb; BEGIN
  j := public.edit_apartado_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _c WHERE k='apt'),
       p_items => pg_temp.item('b',1,10),
       p_expected_version => (SELECT version FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt')));
  INSERT INTO _r(caso, resultado) VALUES ('10 total < pagado', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('10 total < pagado', 'rechazado: ' || SQLERRM); END $$;

-- 11. Liquidar (saldo 130)
DO $$ DECLARE j jsonb; BEGIN
  PERFORM public.record_apartado_payment_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _c WHERE k='apt'),
       p_method => 'transferencia', p_amount => 130, p_expected_version => (SELECT version FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt')));
  INSERT INTO _r(caso, resultado) SELECT '11 liquidar', format('status=%s liquidated_at=%s pagado=%s', status, liquidated_at IS NOT NULL, paid_amount) FROM public.sales WHERE id=(SELECT v::bigint FROM _c WHERE k='apt');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('11 liquidar', 'ERROR ' || SQLERRM); END $$;

-- 12. Mismo request_id dos veces (doble toque en Cobrar)
DO $$ DECLARE r uuid := gen_random_uuid(); j1 jsonb; j2 jsonb; BEGIN
  j1 := public.record_sale_atomic_v2(p_request_id => r, p_items => pg_temp.item('a',1,100), p_total => 100, p_payment_method => 'efectivo', p_paid_amount => 100);
  j2 := public.record_sale_atomic_v2(p_request_id => r, p_items => pg_temp.item('a',1,100), p_total => 100, p_payment_method => 'efectivo', p_paid_amount => 100);
  INSERT INTO _r(caso, resultado) VALUES ('12 doble toque', format('misma venta=%s, %s', (j1->'sale'->>'id') = (j2->'sale'->>'id'), pg_temp.st()));
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('12 doble toque', 'ERROR ' || SQLERRM); END $$;

-- 13. Vender más piezas de las que hay (A)
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('a',50,100), p_total => 5000, p_payment_method => 'efectivo', p_paid_amount => 5000);
  INSERT INTO _r(caso, resultado) VALUES ('13 vender de más', 'ACEPTADO ' || pg_temp.st());
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('13 vender de más', 'rechazado: ' || SQLERRM); END $$;

-- 14. Cantidad negativa o cero
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('a',-2,100), p_total => -200, p_payment_method => 'efectivo', p_paid_amount => -200);
  INSERT INTO _r(caso, resultado) VALUES ('14 cantidad negativa', 'ACEPTADO ' || pg_temp.st());
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('14 cantidad negativa', 'rechazado: ' || SQLERRM); END $$;


-- 15. Cajera sin permiso de cambiar precio: cobrar A a $50 (catálogo $100) debe pedir PIN
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","email":"cajera@prueba.test","role":"authenticated"}', true);
SELECT public.te_open_cash_shift(0, null, null);
DO $$ DECLARE j jsonb; BEGIN
  j := public.record_sale_atomic_v2(p_request_id => gen_random_uuid(), p_items => pg_temp.item('b',1,40), p_total => 40,
       p_payment_method => 'efectivo', p_paid_amount => 40);
  INSERT INTO _r(caso, resultado) VALUES ('15 cajera baja precio', 'ACEPTADO');
EXCEPTION WHEN OTHERS THEN INSERT INTO _r(caso, resultado) VALUES ('15 cajera baja precio', 'rechazado: ' || SQLERRM); END $$;

SELECT set_config('role', 'postgres', true);

-- 16. Reglas de la base (migración 20261014_02): código de barras repetido y stock negativo
UPDATE public.products SET barcode = '7500000000099' WHERE id = (SELECT v::bigint FROM _c WHERE k='a');
DO $$ BEGIN
  UPDATE public.products SET barcode = ' 7500000000099 ' WHERE id = (SELECT v::bigint FROM _c WHERE k='b');
  INSERT INTO _r(caso, resultado) VALUES ('16 código repetido', 'ACEPTADO');
EXCEPTION WHEN unique_violation THEN INSERT INTO _r(caso, resultado) VALUES ('16 código repetido', 'rechazado'); END $$;
DO $$ BEGIN
  UPDATE public.products SET stock = -1 WHERE id = (SELECT v::bigint FROM _c WHERE k='b');
  INSERT INTO _r(caso, resultado) VALUES ('17 stock negativo', 'ACEPTADO');
EXCEPTION WHEN check_violation THEN INSERT INTO _r(caso, resultado) VALUES ('17 stock negativo', 'rechazado'); END $$;

DO $$
DECLARE e record; got text;
BEGIN
  FOR e IN SELECT * FROM (VALUES
    ('1 vender 1 kit', 'ok, A=4 B=1%', 'vender un kit descuenta sus componentes'),
    ('2 kit sin componentes', 'rechazado%', 'no se vende un kit si falta un componente'),
    ('3 cancelar kit', 'ok, A=5 B=3%', 'cancelar un kit regresa sus componentes'),
    ('4 total no cuadra', 'rechazado%', 'el total debe cuadrar con los precios'),
    ('5 precio cambiado', 'aceptado total=50%', 'la dueña puede cambiar un precio'),
    ('6 descuento', 'ok total=80.00 pagado=80.00', 'descuento: total y libro cuadran'),
    ('7 apartado anticipo 0', 'ok status=activo, A=2 B=3%', 'apartado con $0 de anticipo aparta la pieza'),
    ('8 editar apartado +B', 'ok total=180.00, A=2 B=2%', 'editar apartado: agregar producto sube total y aparta'),
    ('9a abono 50', 'ok', 'abonar a un apartado'),
    ('9b abonar de más', 'rechazado%', 'no se abona más del saldo'),
    ('10 total < pagado', 'rechazado%', 'un apartado no queda en menos de lo pagado'),
    ('11 liquidar', 'status=liquidado liquidated_at=t pagado=180.00', 'liquidar marca liquidado con fecha'),
    ('12 doble toque', 'misma venta=t, A=1%', 'doble toque en Cobrar no duplica la venta'),
    ('13 vender de más', 'rechazado%', 'no se venden más piezas de las que hay'),
    ('14 cantidad negativa', 'rechazado%', 'no se aceptan cantidades negativas'),
    ('15 cajera baja precio', 'rechazado%', 'una cajera sin permiso no baja precios (pide PIN)'),
    ('16 código repetido', 'rechazado', 'no se repite un código de barras (aunque traiga espacios)'),
    ('17 stock negativo', 'rechazado', 'el stock nunca queda negativo')
  ) AS t(caso, esperado, nombre) LOOP
    SELECT resultado INTO got FROM _r WHERE caso = e.caso;
    IF got IS NULL OR got NOT LIKE e.esperado THEN
      RAISE EXCEPTION 'PRUEBA FALLÓ: % (obtuve: %)', e.nombre, coalesce(got, 'nada');
    END IF;
    INSERT INTO _ok_final VALUES (e.nombre);
  END LOOP;
END $$;
INSERT INTO _ok_final VALUES ('TODAS LAS PRUEBAS PASARON');
SELECT prueba FROM _ok_final;
ROLLBACK;
