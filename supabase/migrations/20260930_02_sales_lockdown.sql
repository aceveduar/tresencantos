-- ============================================================================
-- 20260930_02_sales_lockdown.sql
--
-- Reemplaza en la práctica a 20260818_02_sales_rpc_lockdown.sql, que nunca se
-- ejecutó: su verificación previa buscaba firmas de RPC que ya cambiaron
-- (p. ej. record_apartado_payment_atomic ganó p_collected_by_email) y abortaba.
--
-- Solo conserva la parte que cierra la puerta. Se omitió el recálculo masivo de
-- saldos de la fase 2 original porque se verificó (2026-09-30) que es un no-op:
-- los 194 apartados ya coinciden con sale_payments (0 diferencias de
-- paid_amount, 0 de status). También se verificó que el cliente actual no
-- escribe directo en `sales` (todo pasa por posRpc → RPC v2) y que ninguna
-- función depende de los triggers/funciones de compatibilidad que se borran.
--
-- Efecto: ningún usuario (ni siquiera con sesión) puede INSERT/UPDATE/DELETE
-- directo sobre `sales`; solo las RPC SECURITY DEFINER v2. La lectura
-- (sales_auth_select) se conserva.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS sales_insert ON public.sales;
DROP POLICY IF EXISTS sales_update ON public.sales;
DROP POLICY IF EXISTS sales_delete ON public.sales;

-- Si queda cualquier otra policy de escritura, abortar todo.
DO $$
DECLARE v_policies text;
BEGIN
  SELECT string_agg(policyname || ':' || cmd, ', ')
    INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'sales'
    AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE');
  IF v_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Persisten policies de mutacion sobre public.sales: %', v_policies;
  END IF;
END $$;

-- RPC v1 (anterior a Caja v2): ya nadie la llama.
DO $$
BEGIN
  IF to_regprocedure('public.record_sale_atomic(jsonb,numeric,numeric,text,text,text,numeric,text,date,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_sale_atomic(jsonb,numeric,numeric,text,text,text,numeric,text,date,jsonb) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- Capa de compatibilidad legacy: sin escrituras directas ya no sirve.
DROP TRIGGER IF EXISTS te_sales_compat_before_write_trg  ON public.sales;
DROP TRIGGER IF EXISTS te_sales_compat_after_write_trg   ON public.sales;
DROP TRIGGER IF EXISTS te_sales_compat_before_delete_trg ON public.sales;
DROP FUNCTION IF EXISTS public.te_sales_compat_before_write();
DROP FUNCTION IF EXISTS public.te_sales_compat_after_write();
DROP FUNCTION IF EXISTS public.te_sales_compat_before_delete();
DROP FUNCTION IF EXISTS public.te_sync_legacy_sale_payments(bigint);

NOTIFY pgrst, 'reload schema';

COMMIT;
