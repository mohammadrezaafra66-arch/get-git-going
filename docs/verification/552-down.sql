SET client_encoding TO 'UTF8';

-- ============================================================================
-- 552-down: remove call_ring_events (copy/staging only — never production).
--
-- Order (CLAUDE.md rule 9 / migration 328): DROP TABLE first (removes the
-- persons FK), then restore person_merge WITHOUT call_ring_events.person_id
-- so the registry matches the catalog again.
--
-- Apply:
--   docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f - < docs/verification/552-down.sql
--
-- Then remove the ledger row:
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916160000';
--
-- After DROP, re-apply the previous person_merge body (migration 545 /
-- live dump without call_ring_events.person_id) before asserting registry.
-- ============================================================================

SET lock_timeout = '60s';

DROP POLICY IF EXISTS call_ring_events_select_authenticated ON public.call_ring_events;

DROP INDEX IF EXISTS public.uq_call_ring_events_linkedid_extension;
DROP INDEX IF EXISTS public.idx_call_ring_events_created_at_desc;
DROP INDEX IF EXISTS public.idx_call_ring_events_employee_created;

DROP TABLE IF EXISTS public.call_ring_events;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'call_ring_events'
  ) THEN
    RAISE EXCEPTION '552-down: call_ring_events survived DROP TABLE';
  END IF;

  RAISE NOTICE
    '552-down OK: call_ring_events dropped. Re-apply prior person_merge (without call_ring_events.person_id) before asserting registry.';
END
$do$;
