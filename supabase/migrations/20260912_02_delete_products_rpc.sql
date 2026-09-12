-- =============================================================================
-- te_delete_products -- extiende el PIN de autorización a Inventario
-- (canDeleteProduct / canBulkDelete), pendiente desde 20260821_01_override_pin.sql.
--
-- Por qué una RPC y no solo un ticket dentro de la política RLS de DELETE:
-- te_consume_matching_override() tiene efecto secundario (marca el ticket
-- usado). Un DELETE directo evalúa la política RLS una vez por fila
-- candidata -- meterle el consumo del ticket ahí adentro habría consumido
-- (o intentado consumir) el mismo ticket varias veces en un borrado masivo,
-- rompiendo la garantía de "un ticket = un uso". Envolver el borrado en una
-- función SECURITY DEFINER (mismo patrón que usa toda Caja v2 para lo
-- sensible) resuelve esto: el permiso/ticket se revisa y se consume
-- exactamente una vez por llamada, sin importar cuántas filas se borren.
--
-- p_permission distingue si la llamada viene de "Eliminar" (canDeleteProduct)
-- o "Borrado masivo" (canBulkDelete) -- son overrides independientes, alguien
-- puede tener uno sin el otro.
--
-- Deliberadamente fuera de alcance (igual que antes de este archivo, no es
-- una regresión): la función NO repite la validación de "producto en un
-- apartado activo" (_productsInActiveApartados, ya sigue viviendo solo del
-- lado del cliente en admin-form.js/admin-bulk.js/admin-scanner.js) ni la
-- de "componente de un kit". Extender esas validaciones al servidor es un
-- trabajo aparte, no lo que se pidió aquí.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.te_delete_products(
  p_ids bigint[],
  p_permission text DEFAULT 'canDeleteProduct',
  p_override_tickets uuid[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_authorized_by text;
  v_deleted_count integer;
  v_actor_email   text := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  IF p_permission NOT IN ('canDeleteProduct', 'canBulkDelete') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Permiso inválido';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.te_permission_or_override(p_permission, p_override_tickets) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No tienes permiso para eliminar productos';
  END IF;

  v_authorized_by := public.te_consume_matching_override(p_permission, p_override_tickets);

  DELETE FROM public.products WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  INSERT INTO public.activity_log (action, user_email, summary, meta)
  VALUES (
    'producto_eliminado',
    v_actor_email,
    format('Eliminó %s producto%s%s',
           v_deleted_count,
           CASE WHEN v_deleted_count = 1 THEN '' ELSE 's' END,
           CASE WHEN v_authorized_by IS NOT NULL THEN format(' · autorizado por %s', v_authorized_by) ELSE '' END),
    jsonb_build_object('ids', to_jsonb(p_ids), 'count', v_deleted_count, 'authorized_by', v_authorized_by)
  );

  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.te_delete_products(bigint[], text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_delete_products(bigint[], text, uuid[]) TO authenticated;

COMMIT;
