-- 2026-10-14 · Hallazgos encontrados al armar Sunny POS (sunname-mostrador).
--
-- 1) Realtime de stock entre cajas: Caja e Inventario se suscriben a
--    postgres_changes de products, pero la publicación supabase_realtime no
--    tenía ninguna tabla, así que el aviso nunca llegaba y cada dispositivo
--    veía el stock viejo hasta recargar.
-- 2) anon tenía EXECUTE en cancel_sale_atomic (heredado de PUBLIC). La función
--    rechaza sin sesión, pero anon solo debe ejecutar te_log_failed_login.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;

revoke execute on function public.cancel_sale_atomic(uuid, bigint, text, bigint, uuid[], boolean) from public, anon;
grant  execute on function public.cancel_sale_atomic(uuid, bigint, text, bigint, uuid[], boolean) to authenticated;
