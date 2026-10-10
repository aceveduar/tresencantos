-- Turnos de caja: el conteo empieza el 10 de octubre de 2026.
--
-- Del 4 de septiembre al 9 de octubre el equipo estaba aprendiendo el sistema
-- (malas capturas, cobros de Ofelia sin registrar, etc.) y las diferencias de
-- esos cortes no reflejan faltantes reales. A pedido de Eduardo:
--   * config.turnos_desde marca desde cuándo cuentan los turnos en Reportes:
--     abiertos desde esa fecha, o cerrados con conteo desde esa fecha (así
--     cuenta el turno que venía de la noche anterior). Los anteriores no se
--     borran: siguen en la base y en Actividad.
--   * Los turnos que seguían abiertos desde antes de esa fecha (Ofelia desde
--     el 5 de sep, otra cuenta desde el 4) se cierran sin conteo, para que su
--     próximo corte no arrastre semanas de aprendizaje.
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_05_turnos_desde_hoy.sql

BEGIN;

INSERT INTO public.config (id, value) VALUES ('turnos_desde', '2026-10-10T00:00:00-06:00')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;

WITH viejos AS (
  UPDATE public.cash_shifts
     SET status = 'cerrado_auto', closed_at = now()
   WHERE status = 'abierto'
     -- Solo los de la etapa de aprendizaje: el de Renata de anoche (9 oct)
     -- sigue en curso y cuenta cuando lo cierre.
     AND opened_at < '2026-10-09T00:00:00-06:00'::timestamptz
  RETURNING id, user_email, opened_at
)
INSERT INTO public.activity_log (action, user_email, summary, meta)
SELECT 'turno_cerrado_auto', user_email,
       'Turno de la etapa de aprendizaje cerrado sin conteo (el conteo de turnos empieza el 10 de octubre)',
       jsonb_build_object('shift_id', id, 'opened_at', opened_at, 'motivo', 'reinicio_conteo_2026_10_10')
FROM viejos;

COMMIT;
