-- =============================================================================
-- te_undo_duplicate_product -- deja que un operador (o cualquiera) deshaga su
-- PROPIO duplicado reciente sin pedir permiso de eliminar ni PIN de
-- autorización.
--
-- Por qué hace falta: 20260912_01_products_rls_cleanup.sql restringió DELETE
-- en `products` a solo superadmin/encargado (correcto, cerró un hueco de
-- seguridad real). Pero `duplicateProduct()` (admin-render.js) ya tenía un
-- botón "Deshacer" (7s) pensado justo para operador -- que no tiene
-- canDeleteProduct -- usando un DELETE directo. Desde ese cleanup, ese
-- DELETE queda bloqueado por RLS en silencio: PostgREST regresa 204 "éxito"
-- con 0 filas afectadas, así que el cliente mostraba "Duplicado deshecho ✓"
-- y lo quitaba de la pantalla, pero el duplicado se quedaba para siempre en
-- la base de datos. Confirmado como causa real de productos duplicados
-- acumulados (2026-09-12).
--
-- Eduardo, consultado explícitamente, prefirió que esto siga sin pedir PIN
-- (a diferencia de "Eliminar" real) -- es de bajo riesgo y suele ser un
-- error de tap, no una decisión que amerite autorización de un superior.
--
-- Por qué esto es seguro sin exigir canDeleteProduct: la función valida 2
-- cosas server-side antes de borrar, ninguna confiada al cliente --
--   1. el producto lo creó la MISMA persona que llama esta función
--      (auth.jwt()->>'email' contra products.created_by).
--   2. se creó hace menos de 2 minutos (margen generoso sobre el timeout de
--      7s del toast, para conexiones lentas -- pero acotado para que esto
--      nunca sirva como un "borrar cualquier cosa mía" de alcance amplio).
-- Fuera de esa ventana estrecha, no hay forma de usar esta función para
-- borrar nada -- ni un producto ajeno, ni uno propio ya viejo.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.te_undo_duplicate_product(p_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_email   text := lower(auth.jwt() ->> 'email');
  v_created_by    text;
  v_created_at    timestamptz;
  v_deleted_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado';
  END IF;

  SELECT lower(created_by), created_at INTO v_created_by, v_created_at
  FROM public.products WHERE id = p_id;

  IF v_created_by IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Este producto no se puede deshacer de esta forma';
  END IF;

  IF v_created_by IS DISTINCT FROM v_actor_email THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo puedes deshacer un duplicado que tú mismo acabas de crear';
  END IF;

  IF v_created_at IS NULL OR v_created_at < now() - interval '2 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Ya pasó demasiado tiempo para deshacerlo así -- usa Eliminar en su lugar';
  END IF;

  DELETE FROM public.products WHERE id = p_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.te_undo_duplicate_product(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.te_undo_duplicate_product(bigint) TO authenticated;

COMMIT;
