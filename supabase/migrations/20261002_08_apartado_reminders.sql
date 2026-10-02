-- Ronda de cobranza de apartados vencidos (2026-10-02).
--
-- Cada recordatorio por WhatsApp se registra en Actividad como
-- 'recordatorio_enviado' (meta.id = id del apartado). activity_log solo lo
-- lee superadmin, así que la ronda de Caja consulta este resumen: última
-- vez, quién y cuántas veces se le recordó a cada apartado -- compartido
-- entre dispositivos para no escribirle dos veces el mismo día a la clienta.

CREATE OR REPLACE FUNCTION public.te_apartado_reminders()
 RETURNS TABLE (sale_id bigint, last_at timestamptz, last_by text, veces integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT DISTINCT ON (r.sid)
         r.sid, r.created_at, r.user_email,
         (count(*) OVER (PARTITION BY r.sid))::integer
    FROM (
      SELECT public.te_try_numeric(a.meta ->> 'id')::bigint AS sid, a.created_at, a.user_email
        FROM public.activity_log a
       WHERE a.action = 'recordatorio_enviado'
         AND public.te_try_numeric(a.meta ->> 'id') IS NOT NULL
    ) r
   ORDER BY r.sid, r.created_at DESC;
$function$;
REVOKE EXECUTE ON FUNCTION public.te_apartado_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_apartado_reminders() TO authenticated;
