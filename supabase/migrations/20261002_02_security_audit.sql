-- Auditoría de seguridad (2026-10-02).
--
-- 1. Funciones auxiliares internas expuestas por REST. Solo deben llamarlas
--    otras funciones SECURITY DEFINER (que corren como su dueño, así que no
--    necesitan el GRANT). La grave: te_refund_sale_balance no valida sesión
--    ni permiso -- una cajera podía llamarla directo y registrar una
--    devolución falsa de cualquier venta a su nombre (baja su efectivo
--    esperado en el corte y los ingresos en Reportes) sin cancelar nada.
--    Verificado en BEGIN/ROLLBACK con la sesión de una cajera.
REVOKE EXECUTE ON FUNCTION public.te_refund_sale_balance(bigint, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.te_rpc_store(uuid, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.te_rpc_replay(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.te_snapshot_sale_items(jsonb, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.te_consume_override(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.te_log_activity(text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 2. Actividad: la política de INSERT solo exigía sesión, así que cualquiera
--    podía escribir un registro con el correo de OTRA persona o con fecha
--    falsa. El cliente ya manda su propio correo; este trigger lo fija desde
--    el JWT para inserts directos (las RPC SECURITY DEFINER corren como su
--    dueño y conservan lo que ponen, p. ej. el correo del autorizador).
CREATE OR REPLACE FUNCTION public.te_activity_log_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated' THEN
    NEW.user_email := coalesce(nullif(lower(auth.jwt() ->> 'email'), ''), NEW.user_email);
    NEW.created_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS te_activity_log_stamp_trg ON public.activity_log;
CREATE TRIGGER te_activity_log_stamp_trg
  BEFORE INSERT ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.te_activity_log_stamp();

-- 3. Productos: RLS solo distinguía rol, no el permiso "Publicar en web".
--    Un operador podía publicar por la API aunque la interfaz no se lo
--    permitiera. Crear sin el permiso -> se guarda oculto (regla documentada
--    "operador que crea producto -> is_published=false"); pasar de oculto a
--    publicado sin el permiso -> se rechaza. Ocultar sigue permitido (lo usan
--    Archivar y los deshacer de Recepción).
CREATE OR REPLACE FUNCTION public.te_products_publish_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' OR NOT coalesce(NEW.is_published, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT public.te_has_permission('canPublishProduct') THEN
      NEW.is_published := false;
    END IF;
  ELSIF NOT coalesce(OLD.is_published, false) AND NOT public.te_has_permission('canPublishProduct') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No tienes permiso para publicar productos en la Tienda';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS te_products_publish_guard_trg ON public.products;
CREATE TRIGGER te_products_publish_guard_trg
  BEFORE INSERT OR UPDATE OF is_published ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.te_products_publish_guard();

-- 4. Borrar productos: el cliente siempre usa te_delete_products /
--    te_undo_duplicate_product (SECURITY DEFINER, con permiso y registro en
--    Actividad). El DELETE directo por rol se saltaba el permiso
--    canDeleteProduct (y sus overrides), el registro y la revisión de
--    apartados activos -- se elimina.
DROP POLICY IF EXISTS products_delete ON public.products;

-- 5. te_delete_products: la regla "no borrar un producto que esté en un
--    apartado activo (ni como componente de kit)" vivía solo en el cliente,
--    que además falla abierto si su consulta falla. Ahora la exige el servidor.
CREATE OR REPLACE FUNCTION public.te_delete_products(p_ids bigint[], p_permission text DEFAULT 'canDeleteProduct'::text, p_override_tickets uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_authorized_by text;
  v_deleted_count integer;
  v_actor_email   text := lower(auth.jwt() ->> 'email');
  v_blocked       text;
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

  SELECT string_agg(DISTINCT format('%s (apartado de %s)', coalesce(p.name, '#' || hit.pid), split_part(coalesce(hit.customer, 'cliente'), ' · ', 1)), ', ')
    INTO v_blocked
    FROM (
      SELECT public.te_try_numeric(i.item ->> 'id')::bigint AS pid, s.customer
        FROM public.sales s, jsonb_array_elements(CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END) i(item)
       WHERE s.origin_type = 'apartado' AND s.status = 'activo'
      UNION ALL
      SELECT public.te_try_numeric(k.comp ->> 'id')::bigint, s.customer
        FROM public.sales s,
             jsonb_array_elements(CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END) i(item),
             jsonb_array_elements(CASE WHEN jsonb_typeof(i.item -> 'kit_items') = 'array' THEN i.item -> 'kit_items' ELSE '[]'::jsonb END) k(comp)
       WHERE s.origin_type = 'apartado' AND s.status = 'activo'
    ) hit
    LEFT JOIN public.products p ON p.id = hit.pid
   WHERE hit.pid = ANY (p_ids);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = format('No se puede eliminar: está en un apartado activo -- %s. Archívalo en su lugar.', v_blocked);
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
$function$;
