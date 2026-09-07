-- =============================================================================
-- te_search_activity_meta -- busqueda por texto dentro de activity_log.meta,
-- para encontrar en Actividad ventas/apartados de varios productos cuyo
-- nombre solo vive en meta.itemsDetail (un array), no en un campo plano.
--
-- Por que un RPC y no un filtro normal: PostgREST no soporta castear una
-- columna (meta::text) dentro de un or=(...) -- devuelve PGRST100 "failed to
-- parse logic tree" (confirmado en vivo contra este proyecto). Tampoco
-- funciona como filtro suelto fuera de or(): para operadores de patron
-- (like/ilike) PostgREST no aplica el cast explicito al valor de la columna
-- antes de comparar y Postgres tira "operator does not exist: jsonb ~~*
-- unknown" -- limitacion real de PostgREST con columnas jsonb + ilike, no
-- un error de sintaxis nuestro. El cast si funciona en SQL crudo dentro de
-- una funcion, de ahi este RPC.
--
-- SECURITY INVOKER (no DEFINER): no necesita saltarse RLS, la politica de
-- lectura de activity_log ya es abierta a cualquier autenticado -- este RPC
-- solo existe para lograr el cast que PostgREST no permite armar por URL.
-- =============================================================================

CREATE OR REPLACE FUNCTION te_search_activity_meta(
  p_pattern text,
  p_from    timestamptz DEFAULT NULL,
  p_user    text        DEFAULT NULL
)
RETURNS SETOF activity_log
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT *
  FROM activity_log
  WHERE meta IS NOT NULL
    AND meta::text ILIKE p_pattern
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_user IS NULL OR user_email = p_user)
  ORDER BY created_at DESC, id DESC
  LIMIT 1000;
$$;

REVOKE ALL ON FUNCTION te_search_activity_meta(text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION te_search_activity_meta(text, timestamptz, text) TO authenticated;
