-- Pruebas automáticas de Caja y seguridad (2026-10-02).
--
-- Corre ventas, apartados, abonos, cancelaciones, movimientos y el cierre de
-- turno REALES contra la base de producción, dentro de una transacción que
-- siempre termina en ROLLBACK: no queda nada guardado (solo avanzan las
-- secuencias de ids, que es inofensivo). Si algo no cuadra, se detiene con
-- "PRUEBA FALLÓ: ...". Si todo pasa, la última fila dice
-- "TODAS LAS PRUEBAS PASARON".
--
-- Correr con:  powershell -ExecutionPolicy Bypass -File scripts\pruebas.ps1
--
-- Actores: test@tresencantos.com (cajera, abre y cierra turno) y
-- ofe@tresencantos.com (superadmin, cancela). Si cambian sus ids en Auth,
-- actualizar los "sub" de abajo.

BEGIN;

CREATE TEMP TABLE _ctx (k text PRIMARY KEY, v text);
GRANT ALL ON _ctx TO authenticated;

CREATE TEMP TABLE _ok (n serial, prueba text);
GRANT ALL ON _ok TO authenticated;
GRANT USAGE ON SEQUENCE _ok_n_seq TO authenticated;

-- Producto de prueba: uno normal (no kit), con stock y precio.
INSERT INTO _ctx
SELECT 'pid', id::text FROM public.products
 WHERE kit_items IS NULL AND NOT coalesce(is_archived, false) AND NOT out_of_stock AND stock >= 3 AND price > 0
 ORDER BY id LIMIT 1;
INSERT INTO _ctx SELECT 'price', price::text FROM public.products WHERE id = (SELECT v::bigint FROM _ctx WHERE k = 'pid');
INSERT INTO _ctx SELECT 'stock0', stock::text FROM public.products WHERE id = (SELECT v::bigint FROM _ctx WHERE k = 'pid');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM _ctx WHERE k = 'pid') THEN RAISE EXCEPTION 'PRUEBA FALLÓ: no hay producto con stock para probar'; END IF;
END $$;

-- ── Cajera: abre turno con $100 ──────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"585d4e5a-cc26-4a90-9f1a-f6ac8bec2d0e","email":"test@tresencantos.com","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
INSERT INTO _ctx SELECT 'shift', (public.te_open_cash_shift(p_fondo_inicial => 100)) ->> 'id';

-- 1. Venta en efectivo de 1 pieza
INSERT INTO _ctx
SELECT 'venta', (public.record_sale_atomic_v2(
  p_request_id => gen_random_uuid(),
  p_items => jsonb_build_array(jsonb_build_object('id', (SELECT v::bigint FROM _ctx WHERE k='pid'), 'name', 'prueba', 'price', (SELECT v::numeric FROM _ctx WHERE k='price'), 'qty', 1)),
  p_total => (SELECT v::numeric FROM _ctx WHERE k='price'), p_discount => 0, p_payment_method => 'efectivo',
  p_note => null, p_is_apartado => false, p_paid_amount => (SELECT v::numeric FROM _ctx WHERE k='price'),
  p_customer => null, p_due_date => null)) -> 'sale' ->> 'id';

-- 2. Apartado de 1 pieza con anticipo de $5
INSERT INTO _ctx
SELECT 'apartado', (public.record_sale_atomic_v2(
  p_request_id => gen_random_uuid(),
  p_items => jsonb_build_array(jsonb_build_object('id', (SELECT v::bigint FROM _ctx WHERE k='pid'), 'name', 'prueba', 'price', (SELECT v::numeric FROM _ctx WHERE k='price'), 'qty', 1)),
  p_total => (SELECT v::numeric FROM _ctx WHERE k='price'), p_discount => 0, p_payment_method => 'efectivo',
  p_note => null, p_is_apartado => true, p_paid_amount => 5,
  p_customer => 'Prueba automática', p_due_date => (current_date + 30))) -> 'sale' ->> 'id';

-- 3. Abono de $2 al apartado
SELECT public.record_apartado_payment_atomic(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='apartado'),
  p_method => 'efectivo', p_amount => 2,
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='apartado')));

-- 4. Movimientos del turno: gasto 10, ingreso 4, retiro 20
SELECT public.te_add_shift_expense('prueba gasto', 10, 'gasto');
SELECT public.te_add_shift_expense('prueba ingreso', 4, 'ingreso');
SELECT public.te_add_shift_expense('prueba retiro', 20, 'retiro');

-- 5. Seguridad: la cajera no puede registrar devoluciones sueltas,
--    ni falsificar Actividad, ni borrar productos directo.
DO $$ BEGIN
  BEGIN
    PERFORM public.te_refund_sale_balance((SELECT v::bigint FROM _ctx WHERE k='venta'), gen_random_uuid(), 'x', 'x', now());
    RAISE EXCEPTION 'PRUEBA FALLÓ: una cajera pudo llamar te_refund_sale_balance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO _ok(prueba) VALUES ('Cajera no puede registrar devoluciones sueltas');

  INSERT INTO public.activity_log(action, user_email, summary, created_at) VALUES ('prueba_forja', 'ofe@tresencantos.com', 'x', '2020-01-01');

  DELETE FROM public.products WHERE id = (SELECT v::bigint FROM _ctx WHERE k='pid');
END $$;

-- ── Superadmin: cancela la venta ─────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"a8c980c1-33b0-46a1-ac2c-761801ede2aa","email":"ofe@tresencantos.com","role":"authenticated"}', true);
SELECT public.cancel_sale_atomic(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='venta'), p_reason => 'prueba automática',
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='venta')));

-- ── Cajera: cierra turno contando exactamente lo esperado ────────────────
-- Esperado = fondo 100 + venta (precio) + anticipo 5 + abono 2 − (gasto 10 − ingreso 4) − retiro 20
-- (la devolución de la cancelación la registró Ofelia: no toca este cajón)
SELECT set_config('request.jwt.claims', '{"sub":"585d4e5a-cc26-4a90-9f1a-f6ac8bec2d0e","email":"test@tresencantos.com","role":"authenticated"}', true);
INSERT INTO _ctx
SELECT 'cierre', public.te_close_cash_shift(p_conteo_final => 100 + (SELECT v::numeric FROM _ctx WHERE k='price') + 5 + 2 - 6 - 20)::text;

-- ── Verificaciones (como postgres, para leer todo) ───────────────────────
SELECT set_config('role', 'postgres', true);
DO $$
DECLARE
  pid      bigint  := (SELECT v::bigint  FROM _ctx WHERE k='pid');
  price    numeric := (SELECT v::numeric FROM _ctx WHERE k='price');
  stock0   integer := (SELECT v::integer FROM _ctx WHERE k='stock0');
  venta    bigint  := (SELECT v::bigint  FROM _ctx WHERE k='venta');
  apt      bigint  := (SELECT v::bigint  FROM _ctx WHERE k='apartado');
  cierre   jsonb   := (SELECT v::jsonb   FROM _ctx WHERE k='cierre');
  x        numeric;
  t        text;
BEGIN
  -- Venta cancelada: libro en cero y stock de regreso
  SELECT status INTO t FROM public.sales WHERE id = venta;
  IF t <> 'cancelado' THEN RAISE EXCEPTION 'PRUEBA FALLÓ: la venta debía quedar cancelada (está %)', t; END IF;
  SELECT coalesce(sum(amount), 0) INTO x FROM public.sale_payments WHERE sale_id = venta;
  IF x <> 0 THEN RAISE EXCEPTION 'PRUEBA FALLÓ: el libro de la venta cancelada suma % (debía ser 0)', x; END IF;
  INSERT INTO _ok(prueba) VALUES ('Venta y cancelación: libro en 0');

  -- Apartado: pagado 7 en el libro y en paid_amount
  SELECT coalesce(sum(amount), 0) INTO x FROM public.sale_payments WHERE sale_id = apt;
  IF x <> 7 THEN RAISE EXCEPTION 'PRUEBA FALLÓ: el apartado debía tener $7 en el libro (tiene %)', x; END IF;
  SELECT paid_amount INTO x FROM public.sales WHERE id = apt;
  IF x <> 7 THEN RAISE EXCEPTION 'PRUEBA FALLÓ: paid_amount del apartado es % (debía ser 7)', x; END IF;
  INSERT INTO _ok(prueba) VALUES ('Apartado: anticipo + abono = libro = paid_amount');

  -- Stock: la venta se canceló (regresa) y el apartado sigue reservando 1
  SELECT stock INTO x FROM public.products WHERE id = pid;
  IF x <> stock0 - 1 THEN RAISE EXCEPTION 'PRUEBA FALLÓ: stock final % (esperado %)', x, stock0 - 1; END IF;
  INSERT INTO _ok(prueba) VALUES ('Stock correcto tras venta, cancelación y apartado');

  -- Cierre: diferencia 0, gastos netos 6, retiros 20
  IF (cierre ->> 'diferencia')::numeric <> 0 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: el cierre debía cuadrar y salió diferencia % (esperado %)', cierre ->> 'diferencia', cierre ->> 'esperado';
  END IF;
  IF (cierre ->> 'gastos_total')::numeric <> 6 OR (cierre ->> 'retiros_total')::numeric <> 20 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: gastos % / retiros % (esperado 6 / 20)', cierre ->> 'gastos_total', cierre ->> 'retiros_total';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Cierre de turno cuadra con gastos, ingresos y retiros');

  -- Actividad sellada con la sesión real
  SELECT user_email || ' ' || created_at::date INTO t FROM public.activity_log WHERE action = 'prueba_forja';
  IF t NOT LIKE 'test@tresencantos.com %' OR t LIKE '%2020-01-01' THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: Actividad aceptó correo/fecha falsos (%)', t;
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Actividad no acepta correo ni fecha falsos');

  -- Borrado directo de productos sin efecto
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = pid) THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: una cajera pudo borrar un producto directo';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Productos no se pueden borrar directo');

  -- Caja negra: el retiro y la venta no deben aparecer como cambios manuales
  IF EXISTS (SELECT 1 FROM public.product_changes WHERE product_id = pid AND changed_at >= now() - interval '1 minute') THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: la caja negra registró cambios de una venta por RPC';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Caja negra ignora las ventas por RPC');
END $$;

-- ── Candados de la auditoría 2026-10-06 (cajera sin canDeleteProduct) ─────
SELECT set_config('request.jwt.claims', '{"sub":"585d4e5a-cc26-4a90-9f1a-f6ac8bec2d0e","email":"test@tresencantos.com","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
DO $$
DECLARE
  pid bigint := (SELECT v::bigint FROM _ctx WHERE k = 'pid');
  j jsonb;
  i int;
BEGIN
  -- Hacerse pasar por creadora para borrar con "deshacer duplicado"
  BEGIN
    UPDATE public.products SET created_by = 'test@tresencantos.com', created_at = now() WHERE id = pid;
    RAISE EXCEPTION 'PRUEBA FALLÓ: una cajera pudo cambiar el creador de un producto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO _ok(prueba) VALUES ('Creador y fecha de creación no se pueden cambiar');

  -- URL de imagen que rompe el atributo src (XSS guardado)
  BEGIN
    UPDATE public.products SET image = 'https://x.com/a.jpg" onerror="alert(1)' WHERE id = pid;
    RAISE EXCEPTION 'PRUEBA FALLÓ: se guardó una URL de imagen con comillas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO _ok(prueba) VALUES ('URLs de imagen peligrosas se rechazan');

  -- PIN de gerente: el 6.º intento fallido en 10 min se bloquea
  FOR i IN 1..6 LOOP
    j := public.te_request_override('canCancelSale', 'ofe@tresencantos.com', 'x');
  END LOOP;
  IF coalesce(j ->> 'message', '') NOT LIKE 'Demasiados intentos%' THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: el PIN no se bloquea tras 5 fallos (%)', j;
  END IF;
  INSERT INTO _ok(prueba) VALUES ('PIN de gerente se bloquea tras 5 fallos');

  -- Clientas: solo quien ve Reportes las edita directo
  IF NOT public.te_has_permission('canViewReports') THEN
    UPDATE public.customers SET notes = 'prueba' WHERE id = (SELECT min(id) FROM public.customers);
    GET DIAGNOSTICS i = ROW_COUNT;
    IF i > 0 THEN
      RAISE EXCEPTION 'PRUEBA FALLÓ: una cajera sin Reportes pudo editar una clienta';
    END IF;
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Clientas solo se editan con permiso de Reportes');
END $$;

-- Sin sesión: no se puede llenar Actividad con "sesión fallida"
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('role', 'anon', true);
SELECT public.te_log_failed_login('spam' || g || '@prueba.test') FROM generate_series(1, 25) g;
SELECT set_config('role', 'postgres', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.activity_log
       WHERE action = 'sesion_fallida' AND meta ->> 'email' LIKE 'spam%@prueba.test') > 20 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: sin sesión se pudo llenar Actividad sin límite';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Sin sesión no se puede llenar Actividad');
END $$;

INSERT INTO _ok(prueba) VALUES ('TODAS LAS PRUEBAS PASARON');
SELECT prueba FROM _ok ORDER BY n;

ROLLBACK;
