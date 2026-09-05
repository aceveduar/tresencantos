-- =============================================================================
-- Retira el checador (entrada/salida) -- construido y revisado el mismo día
-- (2026-09-04), Eduardo decidió quitarlo: se traslapaba con el turno de caja
-- (que ya cubre "cuándo trabajó" para la mayoría del tiempo real), los
-- horarios de la tienda son demasiado variables para tener algo contra qué
-- medir un registro de asistencia, y sin ser obligatorio (a diferencia de
-- abrir caja) los datos hubieran quedado incompletos con el tiempo. Ver
-- CLAUDE.md, sección POS -- "Checador (entrada/salida)... -- REVERTIDO" para
-- el razonamiento completo. No reintroducir sin que el negocio realmente lo
-- necesite (nómina por hora, horarios formales, etc.).
--
-- La verificación de ubicación (_te_distance_to_store_m/_te_is_far_from_store,
-- p_lat/p_lng en te_open_cash_shift/te_close_cash_shift) NO se toca -- sigue
-- viva para el turno de caja, que es donde de verdad importa.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.te_clock_in(double precision, double precision);
DROP FUNCTION IF EXISTS public.te_clock_out(double precision, double precision);
DROP TABLE IF EXISTS public.attendance_shifts;

COMMIT;
