-- 2026-10-14 · Avisos al equipo desde Configuración (campana de la barra).
-- Antes cada aviso era un objeto escrito en shared.js (SYS_NOTICES): cada aviso
-- nuevo requería cambiar código. Ahora quien tiene canManageSettings los publica,
-- edita y quita desde Configuración → Avisos, y ve quién los leyó.
-- Leído = la persona abrió (desplegó) el aviso, no solo vio la campana.

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_notices (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  body        text NOT NULL DEFAULT '' CHECK (char_length(body) <= 280),
  help_query  text CHECK (help_query IS NULL OR char_length(help_query) <= 60), -- "Ver cómo": búsqueda en Ayuda
  audience    text NOT NULL DEFAULT 'todos' CHECK (audience IN ('todos','caja','inventario')),
  until       date NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_notice_reads (
  notice_id   bigint NOT NULL REFERENCES public.team_notices(id) ON DELETE CASCADE,
  user_email  text NOT NULL,
  read_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_email)
);

ALTER TABLE public.team_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_notice_reads ENABLE ROW LEVEL SECURITY;

-- Escritura solo por RPC; lectura: avisos para todo el personal, lecturas solo las propias
-- (quién leyó qué lo da te_notice_readers a quien administra).
REVOKE ALL ON public.team_notices, public.team_notice_reads FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.team_notices_id_seq FROM anon, authenticated;
GRANT SELECT ON public.team_notices, public.team_notice_reads TO authenticated;

DROP POLICY IF EXISTS team_notices_read ON public.team_notices;
CREATE POLICY team_notices_read ON public.team_notices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS team_notice_reads_own ON public.team_notice_reads;
CREATE POLICY team_notice_reads_own ON public.team_notice_reads FOR SELECT TO authenticated
  USING (user_email = lower((select auth.jwt()) ->> 'email'));

-- Publicar o editar (p_id NULL = nuevo)
CREATE OR REPLACE FUNCTION public.te_save_notice(p_id bigint, p_title text, p_body text, p_help_query text,
                                                 p_audience text, p_until date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
DECLARE v_id bigint; v_email text := lower(auth.jwt() ->> 'email');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado'; END IF;
  IF NOT public.te_has_permission('canManageSettings') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para publicar avisos';
  END IF;
  IF p_until IS NULL OR p_until < (now() AT TIME ZONE 'America/Mexico_City')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La fecha "mostrar hasta" ya pasó';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.team_notices (title, body, help_query, audience, until, created_by)
    VALUES (btrim(p_title), coalesce(btrim(p_body), ''), nullif(btrim(p_help_query), ''), coalesce(p_audience, 'todos'), p_until, v_email)
    RETURNING id INTO v_id;
    PERFORM public.te_log_activity('aviso_publicado', 'Publicó el aviso "' || btrim(p_title) || '"', jsonb_build_object('notice_id', v_id));
  ELSE
    UPDATE public.team_notices
       SET title = btrim(p_title), body = coalesce(btrim(p_body), ''), help_query = nullif(btrim(p_help_query), ''),
           audience = coalesce(p_audience, 'todos'), until = p_until, updated_at = now()
     WHERE id = p_id AND active
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Ese aviso ya no existe'; END IF;
    PERFORM public.te_log_activity('aviso_editado', 'Editó el aviso "' || btrim(p_title) || '"', jsonb_build_object('notice_id', v_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- Quitar (queda en la tabla para el historial; deja de mostrarse)
CREATE OR REPLACE FUNCTION public.te_remove_notice(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
DECLARE v_title text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado'; END IF;
  IF NOT public.te_has_permission('canManageSettings') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso para quitar avisos';
  END IF;
  UPDATE public.team_notices SET active = false, updated_at = now() WHERE id = p_id AND active RETURNING title INTO v_title;
  IF v_title IS NOT NULL THEN
    PERFORM public.te_log_activity('aviso_quitado', 'Quitó el aviso "' || v_title || '"', jsonb_build_object('notice_id', p_id));
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Marcar leído (al desplegar el aviso). Idempotente.
CREATE OR REPLACE FUNCTION public.te_mark_notice_read(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado'; END IF;
  INSERT INTO public.team_notice_reads (notice_id, user_email)
  SELECT p_id, lower(auth.jwt() ->> 'email') WHERE EXISTS (SELECT 1 FROM public.team_notices WHERE id = p_id)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Quién leyó cada aviso activo (para Configuración → Avisos)
CREATE OR REPLACE FUNCTION public.te_notice_readers()
RETURNS TABLE (notice_id bigint, user_email text, read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.te_has_permission('canManageSettings') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sin permiso';
  END IF;
  RETURN QUERY SELECT r.notice_id, r.user_email, r.read_at
    FROM public.team_notice_reads r JOIN public.team_notices n ON n.id = r.notice_id
   WHERE n.active ORDER BY r.read_at;
END $$;

REVOKE ALL ON FUNCTION public.te_save_notice(bigint,text,text,text,text,date), public.te_remove_notice(bigint),
                       public.te_mark_notice_read(bigint), public.te_notice_readers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_save_notice(bigint,text,text,text,text,date), public.te_remove_notice(bigint),
                          public.te_mark_notice_read(bigint), public.te_notice_readers() TO authenticated;

COMMIT;
