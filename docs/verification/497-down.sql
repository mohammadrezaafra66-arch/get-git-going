SET client_encoding='UTF8';

-- ============================================================================
-- 497-down: reverse the CDR column additions on call_logs.
--
-- WARNING, read before running. Dropping these columns DESTROYS whatever an importer
-- has written into them. It is safe only while call_logs has no imported rows -- which
-- is the state 497 was applied in (0 rows). Once C-4 has imported real call detail
-- records, reverse only the CHECK constraint and the index, and leave the columns.
--
-- Apply the same way as a migration:
--   docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f - < docs/verification/497-down.sql
--
-- Then remove the ledger row:
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260906201000';
-- ============================================================================

SET lock_timeout = '60s';

DO $guard$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n FROM public.call_logs;
  IF _n <> 0 THEN
    RAISE EXCEPTION
      '497-down refused: call_logs holds % row(s). Dropping these columns would destroy '
      'imported call data. Reverse the CHECK and the index by hand instead.', _n;
  END IF;
END
$guard$;

-- Restore the original non-unique partial index first, so external_id is never unindexed.
CREATE INDEX IF NOT EXISTS idx_call_logs_external
  ON public.call_logs USING btree (external_id)
  WHERE (external_id IS NOT NULL);

DROP INDEX IF EXISTS public.call_logs_external_id_unique_idx;
DROP INDEX IF EXISTS public.idx_call_logs_extension;

-- Restore the original two-value CHECK.
ALTER TABLE public.call_logs DROP CONSTRAINT IF EXISTS call_logs_direction_check;
ALTER TABLE public.call_logs ADD CONSTRAINT call_logs_direction_check
  CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]));

ALTER TABLE public.call_logs DROP COLUMN IF EXISTS disposition;
ALTER TABLE public.call_logs DROP COLUMN IF EXISTS is_internal;
ALTER TABLE public.call_logs DROP COLUMN IF EXISTS is_missed;
ALTER TABLE public.call_logs DROP COLUMN IF EXISTS extension;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'call_logs'
                AND column_name IN ('extension', 'is_missed', 'is_internal', 'disposition')) THEN
    RAISE EXCEPTION '497-down: a contracted column survived';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'call_logs_external_id_unique_idx') THEN
    RAISE EXCEPTION '497-down: the unique index was not removed';
  END IF;
  RAISE NOTICE '497-down OK: call_logs restored to its pre-497 shape';
END
$do$;
