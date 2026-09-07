SET client_encoding='UTF8';

-- ============================================================================
-- 498-down: remove call_log_extensions.
--
-- WARNING. This table holds the owner's own extension -> employee mapping, typed in by
-- hand through /admin/call-extensions. Dropping it destroys that work and there is no
-- other copy: nothing derives this mapping, which is the entire reason the table exists
-- (D-35). The guard below therefore REFUSES to run while the table has rows. Export
-- them first if you really mean to.
--
-- Note on CLAUDE.md rule 9 / migration 328: this table's foreign keys point at
-- public.profiles, NOT public.persons, so dropping it does not change person_merge's
-- registry and the ordering rule (registry before DROP TABLE) does not apply here. The
-- assertion at the end proves the registry is untouched either way.
--
-- Apply the same way as a migration:
--   docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f - < docs/verification/498-down.sql
--
-- Then remove the ledger row:
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260906202000';
-- ============================================================================

SET lock_timeout = '60s';

DO $guard$
DECLARE _n bigint;
BEGIN
  SELECT count(*) INTO _n FROM public.call_log_extensions;
  IF _n <> 0 THEN
    RAISE EXCEPTION
      '498-down refused: call_log_extensions holds % row(s) of owner-supplied mapping. '
      'Nothing else in the system can reproduce it. Export it before dropping.', _n;
  END IF;
END
$guard$;

DROP TABLE IF EXISTS public.call_log_extensions;

DO $do$
DECLARE _persons int; _bad int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'call_log_extensions') THEN
    RAISE EXCEPTION '498-down: the table survived';
  END IF;

  SELECT count(*) INTO _persons
    FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.persons'::regclass;
  SELECT count(*) FILTER (WHERE verdict <> 'ok') INTO _bad
    FROM public.person_fk_registry_report();
  IF _bad <> 0 THEN
    RAISE EXCEPTION '498-down: person FK registry is out of balance (% bad rows)', _bad;
  END IF;

  RAISE NOTICE '498-down OK: table dropped; persons still has % FKs, registry balanced', _persons;
END
$do$;
