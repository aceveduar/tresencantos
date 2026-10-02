-- Limpieza de políticas RLS (2026-10-02) -- avisos de `supabase db advisors`:
-- multiple_permissive_policies y auth_rls_initplan. Mismo comportamiento:
-- `auth.role() = 'x'` en una política TO public se reemplaza por una
-- política TO x (el rol ya lo filtra Postgres, sin evaluar por fila), y
-- get_user_role() va envuelta en (select …) para evaluarse una vez por
-- consulta. Ninguna política nueva abre acceso que antes no existiera.

-- products
DROP POLICY IF EXISTS products_anon_select ON public.products;
DROP POLICY IF EXISTS products_auth_select ON public.products;
CREATE POLICY products_anon_select ON public.products FOR SELECT TO anon USING (is_published = true);
CREATE POLICY products_auth_select ON public.products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated
  WITH CHECK ((select public.get_user_role()) = ANY (ARRAY['superadmin', 'encargado', 'operador']));
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated
  USING ((select public.get_user_role()) = ANY (ARRAY['superadmin', 'encargado', 'operador']));

-- config
DROP POLICY IF EXISTS config_auth_select ON public.config;
CREATE POLICY config_auth_select ON public.config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS config_delete ON public.config;
CREATE POLICY config_delete ON public.config FOR DELETE TO authenticated USING ((select public.get_user_role()) = 'superadmin');
DROP POLICY IF EXISTS config_insert ON public.config;
CREATE POLICY config_insert ON public.config FOR INSERT TO authenticated WITH CHECK ((select public.get_user_role()) = 'superadmin');
DROP POLICY IF EXISTS config_update ON public.config;
CREATE POLICY config_update ON public.config FOR UPDATE TO authenticated USING ((select public.get_user_role()) = 'superadmin');

-- activity_log
DROP POLICY IF EXISTS activity_insert ON public.activity_log;
CREATE POLICY activity_insert ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS activity_select ON public.activity_log;
CREATE POLICY activity_select ON public.activity_log FOR SELECT TO authenticated
  USING ((select public.get_user_role()) = ANY (ARRAY['superadmin', 'duena']));
DROP POLICY IF EXISTS activity_delete ON public.activity_log;
CREATE POLICY activity_delete ON public.activity_log FOR DELETE TO authenticated USING ((select public.get_user_role()) = 'superadmin');

-- tablas de lectura para cualquier sesión
DROP POLICY IF EXISTS sales_auth_select ON public.sales;
CREATE POLICY sales_auth_select ON public.sales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sale_payments_auth_select ON public.sale_payments;
CREATE POLICY sale_payments_auth_select ON public.sale_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cash_shift_expenses_auth_select ON public.cash_shift_expenses;
CREATE POLICY cash_shift_expenses_auth_select ON public.cash_shift_expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS customers_auth_select ON public.customers;
CREATE POLICY customers_auth_select ON public.customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS customers_auth_update ON public.customers;
CREATE POLICY customers_auth_update ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS recently_edited_auth ON public.recently_edited;
CREATE POLICY recently_edited_auth ON public.recently_edited FOR ALL TO authenticated USING (true) WITH CHECK (true);
