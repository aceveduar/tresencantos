-- Actividad: "Eliminó 1 producto" ahora dice cuál (2026-10-10).
--
-- te_delete_products registraba solo los ids: una vez borrado no había forma
-- de saber qué producto era. Ahora guarda en meta.products una foto de cada
-- producto borrado (nombre, precio, costo, stock, categoría, código, foto) y
-- el resumen lleva el nombre. Además se recuperan los nombres de los
-- registros viejos con lo último que Actividad sabía de cada id.
--
-- Correr con: supabase db query --linked -f supabase/migrations/20261010_04_eliminar_producto_con_nombre.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.te_delete_products(p_ids bigint[], p_permission text DEFAULT 'canDeleteProduct'::text, p_override_tickets uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_snapshot      jsonb := '[]'::jsonb;
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

  -- Foto de lo que se borra (nombre, precio, stock...) ANTES de borrarlo:
  -- después ya no hay forma de saber qué producto era el id.
  WITH gone AS (
    DELETE FROM public.products WHERE id = ANY(p_ids)
    RETURNING id, name, price, cost, stock, category, barcode, image, is_published
  )
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(gone) ORDER BY gone.id), '[]'::jsonb)
    INTO v_deleted_count, v_snapshot
  FROM gone;

  INSERT INTO public.activity_log (action, user_email, summary, meta)
  VALUES (
    'producto_eliminado',
    v_actor_email,
    CASE
      WHEN v_deleted_count = 1 THEN
        format('Eliminó "%s" — $%s', v_snapshot -> 0 ->> 'name', coalesce(v_snapshot -> 0 ->> 'price', '0'))
      ELSE
        format('Eliminó %s productos: %s%s', v_deleted_count,
               (SELECT string_agg(format('"%s"', e ->> 'name'), ', ')
                  FROM (SELECT e FROM jsonb_array_elements(v_snapshot) e LIMIT 3) x),
               CASE WHEN v_deleted_count > 3 THEN '…' ELSE '' END)
    END
    || CASE WHEN v_authorized_by IS NOT NULL THEN format(' · autorizado por %s', v_authorized_by) ELSE '' END,
    jsonb_build_object('ids', to_jsonb(p_ids), 'count', v_deleted_count, 'authorized_by', v_authorized_by,
                       'names', (SELECT coalesce(jsonb_agg(e ->> 'name'), '[]'::jsonb) FROM jsonb_array_elements(v_snapshot) e),
                       'name', CASE WHEN v_deleted_count = 1 THEN v_snapshot -> 0 ->> 'name' END,
                       'products', v_snapshot)
  );

  RETURN v_deleted_count;
END;
$function$;


-- Registros viejos: nombre = lo último que Actividad registró de ese id
-- (creado/editado) antes de borrarlo.
WITH viejos AS (
  SELECT d.id AS log_id, d.created_at, d.meta, ids.pid, ids.ord
  FROM public.activity_log d
  CROSS JOIN LATERAL jsonb_array_elements_text(d.meta -> 'ids') WITH ORDINALITY AS ids(pid, ord)
  WHERE d.action = 'producto_eliminado' AND d.summary ~ '^Eliminó [0-9]+ producto'
), nombres AS (
  SELECT v.log_id, v.ord,
         (SELECT a.meta ->> 'name' FROM public.activity_log a
           WHERE a.action IN ('producto_creado', 'producto_editado')
             AND a.meta ->> 'id' = v.pid AND a.meta ->> 'name' IS NOT NULL
             AND a.created_at <= v.created_at
           ORDER BY a.created_at DESC LIMIT 1) AS name
  FROM viejos v
), por_log AS (
  SELECT log_id, count(*) AS n,
         jsonb_agg(name ORDER BY ord) FILTER (WHERE name IS NOT NULL) AS names,
         string_agg(format('"%s"', name), ', ' ORDER BY ord) FILTER (WHERE name IS NOT NULL) AS lista
  FROM nombres GROUP BY log_id
)
UPDATE public.activity_log l
   SET summary = CASE WHEN p.n = 1 THEN format('Eliminó %s', p.lista)
                      ELSE format('Eliminó %s productos: %s', p.n, p.lista) END,
       meta = l.meta || jsonb_build_object('names', p.names, 'nombre_recuperado', true)
  FROM por_log p
 WHERE l.id = p.log_id AND p.lista IS NOT NULL;

COMMIT;
