SET client_encoding='UTF8';
\set ON_ERROR_STOP on

-- =============================================================================
-- Backfill: give every existing supplier and customer a person_id (item 230)
-- =============================================================================
--
-- SAFE BY DEFAULT. This script ROLLS BACK unless you explicitly ask it not to.
--
--   dry run (default):
--     psql ... -f 230-backfill-existing.sql
--   apply for real:
--     psql ... -v dry_run=false -f 230-backfill-existing.sql
--
-- The whole thing is ONE transaction, so either every row is bridged or none
-- is. The verification block below raises if anything is left unbridged, which
-- aborts the transaction before it can commit a partial result.
--
-- ATTRIBUTION: person_create_full/backfill need auth.uid(), so the run is
-- attributed to :actor (an admin by default). created_by on the generated
-- persons rows and the provenance links will carry that id. Override with
--   -v actor=<uuid>
--
-- WHAT IT WILL NOT DO
--   person_backfill_existing can only UPDATE suppliers/customers. It cannot
--   insert one. That is deliberate — see the header of migration 230.
-- =============================================================================

\if :{?dry_run}
\else
  \set dry_run true
\endif

\if :{?actor}
\else
  \set actor '05098088-2849-43f4-8eb5-7c473c3832ec'
\endif

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', :'actor', 'role', 'authenticated')::text,
                  true);

\echo ''
\echo '--- BEFORE ---'
SELECT 'suppliers' AS t, count(*) AS total, count(person_id) AS bridged FROM public.suppliers
UNION ALL
SELECT 'customers', count(*), count(person_id) FROM public.customers
UNION ALL
SELECT 'persons', count(*), 0 FROM public.persons;

\echo ''
\echo '--- BACKFILL: suppliers ---'
SELECT jsonb_pretty(
  public.person_backfill_existing('suppliers') - 'rows'
) AS supplier_summary;

\echo ''
\echo '--- BACKFILL: customers ---'
SELECT jsonb_pretty(
  public.person_backfill_existing('customers') - 'rows'
) AS customer_summary;

\echo ''
\echo '--- AFTER ---'
SELECT 'suppliers' AS t, count(*) AS total, count(person_id) AS bridged FROM public.suppliers
UNION ALL
SELECT 'customers', count(*), count(person_id) FROM public.customers
UNION ALL
SELECT 'persons', count(*), 0 FROM public.persons;

\echo ''
\echo '--- per-row outcome (action, identifier used) ---'
SELECT s.name AS legacy_name,
       CASE WHEN s.person_id IS NULL THEN 'UNBRIDGED' ELSE 'ok' END AS state,
       (SELECT pi.kind FROM public.person_identifiers pi
         WHERE pi.person_id = s.person_id LIMIT 1) AS identifier_kind
FROM public.suppliers s ORDER BY s.name;

RESET ROLE;

-- --- verification: abort rather than commit a partial backfill --------------
DO $$
DECLARE _s bigint; _c bigint; _orphan bigint; _links bigint;
BEGIN
  SELECT count(*) INTO _s FROM public.suppliers WHERE person_id IS NULL;
  SELECT count(*) INTO _c FROM public.customers WHERE person_id IS NULL;
  IF _s > 0 OR _c > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % suppliers and % customers still unbridged', _s, _c;
  END IF;

  SELECT count(*) INTO _orphan FROM (
    SELECT s.person_id FROM public.suppliers s WHERE s.person_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = s.person_id)
    UNION ALL
    SELECT c.person_id FROM public.customers c WHERE c.person_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.persons p WHERE p.id = c.person_id)
  ) x;
  IF _orphan > 0 THEN
    RAISE EXCEPTION 'Backfill produced % orphan person_id reference(s)', _orphan;
  END IF;

  SELECT count(*) INTO _links FROM public.person_context_links
   WHERE context_kind IN ('supplier','customer');
  IF _links < 25 THEN
    RAISE EXCEPTION 'Expected at least 25 provenance links, found %', _links;
  END IF;

  RAISE NOTICE 'Verification OK: all rows bridged, no orphans, % provenance links', _links;
END $$;

\if :dry_run
  \echo ''
  \echo '################  DRY RUN — ROLLING BACK  ################'
  \echo '# Re-run with  -v dry_run=false  to apply for real.       #'
  \echo '##########################################################'
  ROLLBACK;
\else
  \echo ''
  \echo '################  APPLYING (COMMIT)  ################'
  COMMIT;
\endif

\echo ''
\echo '--- FINAL STATE ON DISK ---'
SELECT 'suppliers' AS t, count(*) AS total, count(person_id) AS bridged FROM public.suppliers
UNION ALL
SELECT 'customers', count(*), count(person_id) FROM public.customers
UNION ALL
SELECT 'persons', count(*), 0 FROM public.persons;
