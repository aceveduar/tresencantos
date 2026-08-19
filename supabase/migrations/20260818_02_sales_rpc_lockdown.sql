-- TRES ENCANTOS
-- Fase 2: cerrar mutaciones directas de sales y retirar la RPC v1.
--
-- NO ejecutar junto con la fase 1.
-- Ejecutar solo despues de:
--   1. desplegar el frontend que usa exclusivamente las RPC v2;
--   2. incrementar CACHE_VERSION del Service Worker;
--   3. confirmar que las cajas/dispositivos ya recargaron la version nueva.
--
-- IMPORTANTE: este archivo cierra sales, no los PATCH directos de products que
-- existian en clientes antiguos. Una PWA vieja podria alcanzar a escribir
-- stock y despues recibir 403 en sales. Por eso la confirmacion del paso 3 es
-- un requisito operativo estricto, no solo una recomendacion.

BEGIN;

-- Verificacion defensiva: no cerrar RLS si falta alguna RPC v2.
DO $$
BEGIN
  IF to_regprocedure('public.record_sale_atomic_v2(uuid,jsonb,numeric,numeric,text,text,boolean,numeric,text,date)') IS NULL
     OR to_regprocedure('public.record_apartado_payment_atomic(uuid,bigint,text,numeric,bigint)') IS NULL
     OR to_regprocedure('public.edit_apartado_atomic(uuid,bigint,jsonb,bigint,numeric)') IS NULL
     OR to_regprocedure('public.cancel_sale_atomic(uuid,bigint,text,bigint)') IS NULL
     OR to_regprocedure('public.refund_apartado_atomic(uuid,bigint,text,bigint)') IS NULL
     OR to_regprocedure('public.get_pos_rpc_result(uuid)') IS NULL
     OR to_regprocedure('public.get_my_permissions()') IS NULL THEN
    RAISE EXCEPTION 'Faltan RPC v2; ejecuta primero 20260818_01_apartados_atomic_additive.sql';
  END IF;
END;
$$;

-- Ultimo cierre de la ventana de compatibilidad: importa cualquier abono que
-- un cliente cacheado haya escrito despues de fase 1 y vuelve a derivar estado
-- y banderas desde el ledger antes de bloquear REST.
SELECT set_config('tresencantos.rpc_v2', 'on', true);

-- Respeta el orden de locks de las RPC (advisory antes de filas/tablas). Luego
-- ACCESS EXCLUSIVE impide que un PATCH legacy se cuele entre el barrido final
-- y el DROP de policies dentro de esta misma transaccion.
SELECT pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));
LOCK TABLE public.sales IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v_sale_id bigint;
BEGIN
  IF to_regprocedure('public.te_sync_legacy_sale_payments(bigint)') IS NOT NULL THEN
    FOR v_sale_id IN SELECT id FROM public.sales ORDER BY id
    LOOP
      PERFORM public.te_sync_legacy_sale_payments(v_sale_id);
    END LOOP;
  END IF;
END;
$$;

WITH totals AS (
  SELECT
    s.id,
    round(COALESCE(SUM(p.amount), 0), 2) AS paid,
    MAX(p.paid_at) FILTER (WHERE p.amount <> 0) AS last_paid_at
  FROM public.sales s
  LEFT JOIN public.sale_payments p ON p.sale_id = s.id
  WHERE s.origin_type = 'apartado'
  GROUP BY s.id
)
UPDATE public.sales s
SET
  paid_amount = t.paid,
  last_payment_at = t.last_paid_at,
  status = CASE
    WHEN s.cancelled_at IS NOT NULL THEN 'cancelado'
    WHEN t.paid >= round(s.total, 2) THEN 'liquidado'
    ELSE 'activo'
  END,
  type = CASE
    WHEN s.cancelled_at IS NULL AND t.paid < round(s.total, 2) THEN 'apartado'
    ELSE 'venta'
  END,
  liquidated_at = CASE
    WHEN s.cancelled_at IS NULL AND t.paid >= round(s.total, 2)
      THEN COALESCE(s.liquidated_at, t.last_paid_at)
    WHEN s.cancelled_at IS NULL THEN NULL
    ELSE s.liquidated_at
  END,
  updated_at = COALESCE(
    GREATEST(s.updated_at, s.cancelled_at, t.last_paid_at, s.created_at),
    now()
  ),
  version = s.version + 1
FROM totals t
WHERE s.id = t.id
  AND (
    s.paid_amount IS DISTINCT FROM t.paid
    OR s.last_payment_at IS DISTINCT FROM t.last_paid_at
    OR s.status IS DISTINCT FROM CASE
      WHEN s.cancelled_at IS NOT NULL THEN 'cancelado'
      WHEN t.paid >= round(s.total, 2) THEN 'liquidado'
      ELSE 'activo'
    END
    OR s.type IS DISTINCT FROM CASE
      WHEN s.cancelled_at IS NULL AND t.paid < round(s.total, 2) THEN 'apartado'
      ELSE 'venta'
    END
    OR s.liquidated_at IS DISTINCT FROM CASE
      WHEN s.cancelled_at IS NULL AND t.paid >= round(s.total, 2)
        THEN COALESCE(s.liquidated_at, t.last_paid_at)
      WHEN s.cancelled_at IS NULL THEN NULL
      ELSE s.liquidated_at
    END
  );

DO $$
DECLARE
  v_ids bigint[];
BEGIN
  SELECT array_agg(DISTINCT d.product_id ORDER BY d.product_id)
    INTO v_ids
  FROM public.sales s
  CROSS JOIN LATERAL public.te_inventory_demand(s.items) d
  WHERE s.origin_type = 'apartado';

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tresencantos:inventory', 0));
    PERFORM p.id FROM public.products p
    WHERE p.id = ANY(v_ids)
    ORDER BY p.id
    FOR UPDATE;
    PERFORM public.te_refresh_apartado_product_flags(v_ids);
  END IF;
END;
$$;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Nombres exactos de las policies historicas recuperadas de _rls-setup.sql.
DROP POLICY IF EXISTS sales_insert ON public.sales;
DROP POLICY IF EXISTS sales_update ON public.sales;
DROP POLICY IF EXISTS sales_delete ON public.sales;

-- No confiar solo en nombres historicos: si existe otra policy mutante, aborta
-- la transaccion completa en lugar de dejar una puerta REST abierta.
DO $$
DECLARE
  v_policies text;
BEGIN
  SELECT string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname)
    INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'sales'
    AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE');

  IF v_policies IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Persisten policies de mutacion sobre public.sales: ' || v_policies,
      HINT = 'Audita y elimina esas policies antes de aplicar el lockdown.';
  END IF;
END;
$$;

-- Conserva sales_auth_select: todos los usuarios autenticados siguen leyendo.
-- No se crean policies de mutacion; las funciones SECURITY DEFINER v2 son el
-- unico camino soportado para cambiar ventas, pagos y apartados.

-- La firma exacta de la RPC v1 recuperada del historial del repositorio.
-- El guard permite ejecutar esta migracion tambien en un ambiente nuevo donde
-- la funcion historica nunca haya existido.
DO $$
BEGIN
  IF to_regprocedure(
    'public.record_sale_atomic(jsonb,numeric,numeric,text,text,text,numeric,text,date,jsonb)'
  ) IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_sale_atomic(jsonb,numeric,numeric,text,text,text,numeric,text,date,jsonb) FROM PUBLIC, authenticated';
  END IF;
END;
$$;

-- Ya sin mutaciones REST, retira la capa temporal para que incluso operaciones
-- de mantenimiento con service_role no adquieran semantica legacy por error.
DROP TRIGGER IF EXISTS te_sales_compat_before_write_trg ON public.sales;
DROP TRIGGER IF EXISTS te_sales_compat_after_write_trg ON public.sales;
DROP TRIGGER IF EXISTS te_sales_compat_before_delete_trg ON public.sales;
DROP FUNCTION IF EXISTS public.te_sales_compat_before_write();
DROP FUNCTION IF EXISTS public.te_sales_compat_after_write();
DROP FUNCTION IF EXISTS public.te_sales_compat_before_delete();
DROP FUNCTION IF EXISTS public.te_sync_legacy_sale_payments(bigint);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificacion sugerida:
-- SELECT policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='sales'
-- ORDER BY policyname;
-- Debe quedar solamente la policy SELECT correspondiente.
