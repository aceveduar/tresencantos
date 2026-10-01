-- ============================================================================
-- 20260930_03_drop_rpc_overloads.sql
--
-- Cada vez que una RPC ganó un parámetro se creó con CREATE OR REPLACE sin
-- borrar la firma anterior, así que quedaron varias versiones del mismo nombre
-- (edit_apartado_atomic ×4, record_sale_atomic_v2 ×3, cancel/refund ×2,
-- te_snapshot_sale_items ×2). Una llamada que encaja en más de una falla con
-- "function ... is not unique" (ya pasó con el trigger legacy y en la prueba
-- de humo del 2026-09-30).
--
-- Se conserva solo la versión más nueva de cada una. Verificado antes de
-- borrar (2026-09-30):
--  - la versión más nueva acepta todos los parámetros de las viejas, con los
--    mismos DEFAULT, así que cualquier llamada de la app (argumentos
--    nombrados vía PostgREST) sigue encajando;
--  - te_snapshot_sale_items(jsonb) solo la llamaban las versiones viejas que
--    se borran aquí; las vigentes llaman a (jsonb, uuid[]);
--  - record_sale_atomic (v1, pre Caja v2) ya no la llama nadie.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.record_sale_atomic(jsonb,numeric,numeric,text,text,text,numeric,text,date,jsonb);

DROP FUNCTION IF EXISTS public.record_sale_atomic_v2(uuid,jsonb,numeric,numeric,text,text,boolean,numeric,text,date);
DROP FUNCTION IF EXISTS public.record_sale_atomic_v2(uuid,jsonb,numeric,numeric,text,text,boolean,numeric,text,date,uuid[]);

DROP FUNCTION IF EXISTS public.edit_apartado_atomic(uuid,bigint,jsonb,bigint,numeric);
DROP FUNCTION IF EXISTS public.edit_apartado_atomic(uuid,bigint,jsonb,bigint,numeric,uuid[]);
DROP FUNCTION IF EXISTS public.edit_apartado_atomic(uuid,bigint,jsonb,bigint,numeric,date,uuid[]);

DROP FUNCTION IF EXISTS public.cancel_sale_atomic(uuid,bigint,text,bigint);
DROP FUNCTION IF EXISTS public.refund_apartado_atomic(uuid,bigint,text,bigint);

DROP FUNCTION IF EXISTS public.te_snapshot_sale_items(jsonb);

-- Si alguna sigue duplicada, abortar todo.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(proname || ' x' || c, ', ') INTO v FROM (
    SELECT p.proname, count(*) c
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    GROUP BY p.proname HAVING count(*) > 1
  ) d;
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'Siguen funciones duplicadas: %', v;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
