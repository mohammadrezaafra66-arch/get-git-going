SET client_encoding='UTF8';

-- =============================================================================
-- 234-down — rollback for migration 234 (person merge-candidates queue)
-- =============================================================================
--
-- Drops the table migration 234 created. Safe: person_merge_candidates holds
-- only derived suspicion, never source data. Nothing else references it, and
-- re-applying 234 rebuilds the rows from person_identifiers.
--
-- This is a DROP TABLE, which the project rules normally forbid — the exception
-- is that this table was created by migration 234 itself and contains no
-- authored data. If a reviewer has since marked pairs as reviewed/rejected,
-- that judgement WILL be lost; export it first if you care:
--   \copy (SELECT * FROM public.person_merge_candidates) TO 'merge_candidates.csv' CSV HEADER
--
-- HOW TO RUN:
--   docker cp docs\verification\234-down.sql afrakala-lan-db:/tmp/234-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/234-down.sql
--   docker restart afrakala-lan-rest
-- =============================================================================

DO $$
DECLARE
  v_reviewed integer;
BEGIN
  SELECT count(*) INTO v_reviewed
    FROM public.person_merge_candidates WHERE status <> 'pending';
  IF v_reviewed > 0 THEN
    RAISE WARNING 'Dropping % reviewed merge candidate(s). That review judgement is being discarded.',
      v_reviewed;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'person_merge_candidates does not exist; nothing to drop.';
END
$$;

DROP TABLE IF EXISTS public.person_merge_candidates;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='person_merge_candidates') THEN
    RAISE EXCEPTION 'Rollback incomplete: person_merge_candidates still exists';
  END IF;
  RAISE NOTICE 'Migration 234 rolled back.';
END
$$;

NOTIFY pgrst, 'reload schema';
