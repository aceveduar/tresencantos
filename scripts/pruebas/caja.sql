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

-- ── Superadmin: pasa un apartado de la libreta (antes de las ventas, para
--    probar que un renglón sin producto no rompe el inventario de las demás) ──
-- Total 500, abonos anotados 100 (con fecha) y 150 (sin fecha) → debe 250.
SELECT set_config('request.jwt.claims', '{"sub":"a8c980c1-33b0-46a1-ac2c-761801ede2aa","email":"ofe@tresencantos.com","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
INSERT INTO _ctx
SELECT 'libreta', (public.te_libreta_apartado_create(
  p_request_id => gen_random_uuid(), p_name => 'Prueba libreta', p_phone => null,
  p_total => 500, p_balance => null,
  p_payments => '[{"amount":100,"date":"2025-12-28"},{"amount":150}]'::jsonb,
  p_opened_on => '2025-12-20', p_due_date => current_date + 30, p_note => 'bolsa café')) -> 'sale' ->> 'id';
DO $$ BEGIN
  BEGIN
    PERFORM public.te_libreta_apartado_create(p_request_id => gen_random_uuid(), p_name => 'x', p_total => 100,
      p_payments => '[{"amount":100}]'::jsonb);
    RAISE EXCEPTION 'PRUEBA FALLÓ: se pudo pasar de la libreta un apartado ya pagado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  INSERT INTO _ok(prueba) VALUES ('Libreta: rechaza un apartado que ya está pagado');
END $$;

-- ── Cajera: abre turno con $100 ──────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"585d4e5a-cc26-4a90-9f1a-f6ac8bec2d0e","email":"test@tresencantos.com","role":"authenticated"}', true);
SELECT set_config('role', 'authenticated', true);
INSERT INTO _ctx SELECT 'shift', (public.te_open_cash_shift(p_fondo_inicial => 100)) ->> 'id';
-- Abrir otra vez el mismo día (otro dispositivo) reutiliza el turno, no lo cierra.
DO $$ DECLARE j jsonb; BEGIN
  j := public.te_open_cash_shift(p_fondo_inicial => 999);
  IF (j ->> 'id') <> (SELECT v FROM _ctx WHERE k = 'shift') OR NOT coalesce((j ->> 'reused')::boolean, false) THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: abrir caja con un turno abierto hoy debía reutilizarlo (%)', j;
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Abrir caja dos veces el mismo día reutiliza el turno');
END $$;

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

-- ── Superadmin: abre su caja (cobrar exige turno abierto de quien captura) ──
SELECT public.te_open_cash_shift(p_fondo_inicial => 0);
-- ── Superadmin: apartado de $10 de anticipo que se libera dejando el dinero a su favor,
--    y luego se le devuelve ──
INSERT INTO _ctx
SELECT 'aptfavor', (public.record_sale_atomic_v2(
  p_request_id => gen_random_uuid(),
  p_items => jsonb_build_array(jsonb_build_object('id', (SELECT v::bigint FROM _ctx WHERE k='pid'), 'name', 'prueba', 'price', (SELECT v::numeric FROM _ctx WHERE k='price'), 'qty', 1)),
  p_total => (SELECT v::numeric FROM _ctx WHERE k='price'), p_discount => 0, p_payment_method => 'efectivo',
  p_note => null, p_is_apartado => true, p_paid_amount => 10,
  p_customer => 'Prueba a favor', p_due_date => (current_date + 30))) -> 'sale' ->> 'id';
SELECT public.cancel_sale_atomic(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='aptfavor'), p_reason => 'No pagó (vencido)',
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='aptfavor')),
  p_keep_credit => true);
INSERT INTO _ctx SELECT 'favor_saldo', saldo_favor::text FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='aptfavor');
INSERT INTO _ctx SELECT 'favor_refunds', count(*)::text FROM public.sale_payments WHERE sale_id = (SELECT v::bigint FROM _ctx WHERE k='aptfavor') AND kind = 'refund';
SELECT public.te_refund_credit(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='aptfavor'));

-- ── Superadmin: abona $50 al apartado de libreta, corrige el saldo, y lo cancela ──
SELECT public.record_apartado_payment_atomic(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='libreta'),
  p_method => 'efectivo', p_amount => 50,
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta')));
-- Pagado 300 (250 libreta + 50 hoy); "debe 180" → total 480
SELECT public.te_libreta_apartado_edit(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='libreta'),
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta')),
  p_due_date => current_date + 15, p_balance => 180);
INSERT INTO _ctx SELECT 'libreta_total', total::text FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta');
DO $$ BEGIN
  BEGIN
    PERFORM public.edit_apartado_atomic(p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='libreta'),
      p_items => '[{"id":1,"qty":1}]'::jsonb,
      p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta')));
    RAISE EXCEPTION 'PRUEBA FALLÓ: se le pudieron poner productos a un apartado de libreta';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'PRUEBA FALLÓ%' THEN RAISE; END IF;
  END;
  INSERT INTO _ok(prueba) VALUES ('Libreta: no se le pueden poner productos');
END $$;
SELECT public.cancel_sale_atomic(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='libreta'), p_reason => 'prueba automática',
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta')));
-- La devolución del dinero de papel ($250) va sin fecha de cobro; la de los $50 de hoy, con fecha.
INSERT INTO _ctx SELECT 'libreta_cancel_sum', coalesce(sum(amount), 0)::text FROM public.sale_payments WHERE sale_id = (SELECT v::bigint FROM _ctx WHERE k='libreta');
INSERT INTO _ctx SELECT 'libreta_dated_refunds', coalesce(sum(amount), 0)::text FROM public.sale_payments
 WHERE sale_id = (SELECT v::bigint FROM _ctx WHERE k='libreta') AND kind = 'refund' AND paid_at IS NOT NULL;
-- Reactivar lo deja como estaba: $300 pagados otra vez.
SELECT public.reactivate_apartado_atomic(
  p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='libreta'), p_reason => 'prueba automática',
  p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta')));

-- ── Cajera: cierra turno contando exactamente lo esperado ────────────────
-- Esperado = fondo 100 + venta (precio) + anticipo 5 + abono 2 − (gasto 10 − ingreso 4) − retiro 20
-- (la devolución de la cancelación la registró Ofelia: no toca este cajón)
SELECT set_config('request.jwt.claims', '{"sub":"585d4e5a-cc26-4a90-9f1a-f6ac8bec2d0e","email":"test@tresencantos.com","role":"authenticated"}', true);
INSERT INTO _ctx
SELECT 'cierre', public.te_close_cash_shift(p_conteo_final => 100 + (SELECT v::numeric FROM _ctx WHERE k='price') + 5 + 2 - 6 - 20)::text;

-- Con la caja ya cerrada, otro dispositivo de la cajera no puede seguir cobrando.
DO $$ BEGIN
  BEGIN
    PERFORM public.record_apartado_payment_atomic(
      p_request_id => gen_random_uuid(), p_sale_id => (SELECT v::bigint FROM _ctx WHERE k='apartado'),
      p_method => 'efectivo', p_amount => 1,
      p_expected_version => (SELECT version FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='apartado')));
    RAISE EXCEPTION 'PRUEBA FALLÓ: se pudo cobrar con la caja cerrada';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'PRUEBA FALLÓ%' THEN RAISE; END IF;
  END;
  INSERT INTO _ok(prueba) VALUES ('Con la caja cerrada no se puede cobrar');
END $$;

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

  -- Libreta: los abonos de papel quedan sin fecha de cobro (no cuentan en
  -- Reportes ni en el corte), el saldo corregido movió el total, la fecha del
  -- apartado es la de la libreta, y la cancelación dejó el libro en 0.
  SELECT count(*) INTO x FROM public.sale_payments
   WHERE sale_id = (SELECT v::bigint FROM _ctx WHERE k='libreta') AND source = 'libreta' AND paid_at IS NULL AND kind = 'payment';
  IF x <> 2 THEN RAISE EXCEPTION 'PRUEBA FALLÓ: el apartado de libreta debía tener 2 abonos de papel sin fecha de cobro (tiene %)', x; END IF;
  IF (SELECT v::numeric FROM _ctx WHERE k='libreta_total') <> 480 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: corregir "debe 180" con $300 pagados debía dejar total 480 (quedó %)', (SELECT v FROM _ctx WHERE k='libreta_total');
  END IF;
  SELECT (created_at AT TIME ZONE 'America/Mexico_City')::date::text INTO t FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta');
  IF t <> '2025-12-20' THEN RAISE EXCEPTION 'PRUEBA FALLÓ: la fecha del apartado de libreta quedó %', t; END IF;
  IF (SELECT v::numeric FROM _ctx WHERE k='libreta_cancel_sum') <> 0 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: el libro del apartado de libreta cancelado suma % (debía ser 0)', (SELECT v FROM _ctx WHERE k='libreta_cancel_sum');
  END IF;
  IF (SELECT v::numeric FROM _ctx WHERE k='libreta_dated_refunds') <> -50 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: con fecha de cobro solo debía devolverse lo cobrado hoy (-50), salió %', (SELECT v FROM _ctx WHERE k='libreta_dated_refunds');
  END IF;
  SELECT coalesce(sum(amount), 0) INTO x FROM public.sale_payments WHERE sale_id = (SELECT v::bigint FROM _ctx WHERE k='libreta');
  IF x <> 300 OR (SELECT status FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='libreta')) <> 'activo' THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: reactivar el apartado de libreta debía regresar $300 pagados (libro %)', x;
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Libreta: dinero de papel fuera del corte, saldo corregible, cancelar y reactivar');

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

  -- Disponibilidad calculada por la base (2026-10-10). El producto de prueba
  -- está en el apartado activo de arriba.
  UPDATE public.products SET stock = 0 WHERE id = pid;
  IF (SELECT NOT is_apartado OR out_of_stock FROM public.products WHERE id = pid) THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: con 0 piezas y apartado activo debía quedar "apartado" (no agotado)';
  END IF;
  UPDATE public.products SET stock = 2 WHERE id = pid;
  IF (SELECT is_apartado OR out_of_stock FROM public.products WHERE id = pid) THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: con piezas libres no debía quedar apartado ni agotado';
  END IF;
  UPDATE public.products SET out_of_stock = true WHERE id = pid;
  IF (SELECT stock FROM public.products WHERE id = pid) <> 0 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: marcar agotado a mano debía dejar 0 piezas';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Disponibilidad: apartado, agotado y piezas no se contradicen');

  -- Fiado: si se lo llevó, con 0 piezas el producto queda agotado (no "apartado").
  UPDATE public.sales SET se_lo_llevo = true WHERE id = apt;
  UPDATE public.products SET stock = 0 WHERE id = pid;
  IF (SELECT is_apartado OR NOT out_of_stock FROM public.products WHERE id = pid) THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: un fiado (se lo llevó) no debe dejar el producto como apartado en tienda';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Fiado: lo que se llevó no aparece apartado en la Tienda');

  -- Saldo a favor: liberar sin devolver, luego devolverlo.
  IF (SELECT v::numeric FROM _ctx WHERE k='favor_saldo') <> 10 OR (SELECT v::int FROM _ctx WHERE k='favor_refunds') <> 0 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: liberar dejando a favor debía guardar $10 sin devolución (saldo %, devoluciones %)',
      (SELECT v FROM _ctx WHERE k='favor_saldo'), (SELECT v FROM _ctx WHERE k='favor_refunds');
  END IF;
  SELECT coalesce(sum(amount), 0) INTO x FROM public.sale_payments WHERE sale_id = (SELECT v::bigint FROM _ctx WHERE k='aptfavor');
  IF x <> 0 OR (SELECT saldo_favor FROM public.sales WHERE id = (SELECT v::bigint FROM _ctx WHERE k='aptfavor')) <> 0 THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: devolver el saldo a favor debía dejar el libro y el saldo en 0 (libro %)', x;
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Saldo a favor: se guarda al liberar y se devuelve después');
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

  -- Dar fiado es un permiso propio: una cajera no lo marca sin PIN
  BEGIN
    PERFORM public.te_set_apartado_se_lo_llevo((SELECT v::bigint FROM _ctx WHERE k = 'apartado'), true);
    RAISE EXCEPTION 'PRUEBA FALLÓ: una cajera pudo marcar un fiado sin permiso';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO _ok(prueba) VALUES ('Dar fiado exige su propio permiso o PIN');

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

  -- Secretos: ni la clave de Groq ni el secreto de Drive se leen por SELECT
  IF EXISTS (SELECT 1 FROM public.config WHERE id IN ('groq_key', 'drive_secret')) THEN
    RAISE EXCEPTION 'PRUEBA FALLÓ: una cajera puede leer groq_key o drive_secret';
  END IF;
  INSERT INTO _ok(prueba) VALUES ('Secretos de Groq y Drive no se leen desde la app');
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
