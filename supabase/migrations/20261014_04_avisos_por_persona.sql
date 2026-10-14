-- 2026-10-14 · Avisos al equipo: leído y descartado van por PERSONA, no por dispositivo.
-- Antes "descartado" (✕) vivía en el localStorage del dispositivo: en la tablet
-- compartida de la tienda lo que leía/descartaba una cajera contaba para la otra,
-- y lo descartado en el celular seguía apareciendo en la tablet.

BEGIN;

ALTER TABLE public.team_notice_reads ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

DROP FUNCTION IF EXISTS public.te_mark_notice_read(bigint);
CREATE OR REPLACE FUNCTION public.te_mark_notice_read(p_id bigint, p_dismiss boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No autenticado'; END IF;
  INSERT INTO public.team_notice_reads (notice_id, user_email, dismissed_at)
  SELECT p_id, lower(auth.jwt() ->> 'email'), CASE WHEN p_dismiss THEN now() END
   WHERE EXISTS (SELECT 1 FROM public.team_notices WHERE id = p_id)
  ON CONFLICT (notice_id, user_email) DO UPDATE
    SET dismissed_at = CASE WHEN p_dismiss THEN coalesce(team_notice_reads.dismissed_at, now())
                            ELSE team_notice_reads.dismissed_at END;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.te_mark_notice_read(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.te_mark_notice_read(bigint, boolean) TO authenticated;

COMMIT;
