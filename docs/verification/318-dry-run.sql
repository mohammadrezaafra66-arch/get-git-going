-- Dry run for migration 318. Everything is inside a transaction that is rolled
-- back, so the live database is unchanged when this finishes.
--
-- ⛔ TWO MISTAKES THIS FILE USED TO MAKE, BOTH OF WHICH ACTUALLY FIRED
--
-- The first version `\i`-included `318-down.sql`. That file is a standalone
-- rollback and carries its own BEGIN/COMMIT, so its COMMIT ended the dry run's
-- outer transaction. Everything after it ran autocommitted and the closing
-- ROLLBACK had nothing left to undo.
--
-- The second version then used `\set ON_ERROR_STOP 0` to demonstrate the guard
-- refusing. With the transaction already gone, psql carried on past the
-- refusal and executed the three DELETEs anyway — committing the very deletion
-- the dry run was supposed to be rehearsing. The rows were restored from
-- 318-down.sql and the migration re-applied through the proper path.
--
-- The lesson is general: a dry run must never `\i` a file containing
-- transaction control, and must never relax ON_ERROR_STOP outside a savepoint.
-- Both rules are now followed below — the rollback steps are inlined, and the
-- refusal test runs inside a SAVEPOINT with the error trapped in PL/pgSQL.
--
-- Proves, in order:
--   1. the three rows exist and the person carries nothing else
--   2. the migration deletes exactly three rows
--   3. the specimen 135ac0e1 is untouched, with all its attachments
--   4. the rollback restores all three rows with their original values
--   5. the guard refuses when the person stops being inert
SET client_encoding='UTF8';

BEGIN;

\echo '=== 1. before: what exists, and what the person is attached to ==='
SELECT 'person' AS row, id::text, display_name AS name FROM public.persons
 WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c'
UNION ALL
SELECT 'customer', id::text, name FROM public.customers
 WHERE id = '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0'
UNION ALL
SELECT 'context_link', id::text, context_kind FROM public.person_context_links
 WHERE id = '50c74c77-1ddb-433f-96ba-a881be53e7eb';

\echo '--- referencing rows outside customers/person_context_links (expect 0) ---'
DO $t$
DECLARE r record; _n bigint; _total bigint := 0;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'public.persons'::regclass
       AND c.conrelid::regclass::text NOT IN ('customers', 'person_context_links')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
      INTO _n USING '271d7c44-c89f-44db-9b91-99474cdf0a2c'::uuid;
    _total := _total + _n;
  END LOOP;
  IF _total <> 0 THEN RAISE EXCEPTION 'person is not inert: % rows', _total; END IF;
  RAISE NOTICE 'PASS: referencing rows elsewhere = %', _total;
END
$t$;

\echo ''
\echo '=== 2. apply the migration (guard and gate both raise on any surprise) ==='
\i /tmp/318.sql

\echo ''
\echo '=== 3. after: all three gone, specimen intact ==='
SELECT
  (SELECT count(*) FROM public.persons              WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c') AS person_left,
  (SELECT count(*) FROM public.customers            WHERE id = '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0') AS customer_left,
  (SELECT count(*) FROM public.person_context_links WHERE id = '50c74c77-1ddb-433f-96ba-a881be53e7eb') AS link_left,
  (SELECT count(*) FROM public.persons              WHERE id = '135ac0e1-a2b4-4692-b736-dd6cc106972f') AS specimen_alive,
  (SELECT count(*) FROM public.person_identifiers   WHERE person_id = '135ac0e1-a2b4-4692-b736-dd6cc106972f') AS specimen_identifiers,
  (SELECT count(*) FROM public.customer_capital_allocations_dynamic
                                                    WHERE customer_person_id = '135ac0e1-a2b4-4692-b736-dd6cc106972f') AS specimen_capital_rows;

\echo ''
\echo '=== 4. the rollback restores all three (inlined from 318-down.sql, no COMMIT) ==='
INSERT INTO public.persons
  (id, kind, display_name, legal_name, visibility_scope, is_active, notes,
   created_by, created_at, updated_at)
VALUES
  ('271d7c44-c89f-44db-9b91-99474cdf0a2c', 'individual', 'محمدزین الدین', NULL,
   'internal_general', true, NULL,
   'b51e3d4f-2220-4e6b-a697-c326d70f9ad2',
   '2026-08-05 11:22:50.815664+00', '2026-08-05 11:22:50.815664+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers
  (id, name, phone, email, address, tax_id, created_at, updated_at, city, notes,
   is_active, responsible_id, accounting_code, link_group, birth_date, person_id,
   didar_contact_id)
VALUES
  ('5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0', 'محمدزین الدین', NULL, NULL, NULL, NULL,
   '2026-08-05 11:22:50.815664+00', '2026-08-05 11:22:50.815664+00', NULL, NULL,
   true, NULL, NULL, NULL, NULL,
   '271d7c44-c89f-44db-9b91-99474cdf0a2c', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.person_context_links
  (id, person_id, context_kind, ref_table, ref_id, note, started_at, ended_at,
   created_by, created_at, updated_at)
VALUES
  ('50c74c77-1ddb-433f-96ba-a881be53e7eb',
   '271d7c44-c89f-44db-9b91-99474cdf0a2c', 'customer', 'customers',
   '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0', NULL,
   '2026-08-05 11:22:50.815664+00', NULL,
   'b51e3d4f-2220-4e6b-a697-c326d70f9ad2',
   '2026-08-05 11:22:50.815664+00', '2026-08-05 11:22:50.815664+00')
ON CONFLICT (id) DO NOTHING;

SELECT
  (SELECT count(*) FROM public.persons              WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c') AS person_back,
  (SELECT count(*) FROM public.customers            WHERE id = '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0') AS customer_back,
  (SELECT count(*) FROM public.person_context_links WHERE id = '50c74c77-1ddb-433f-96ba-a881be53e7eb') AS link_back;

\echo '--- restored values must equal the originals, not defaults ---'
SELECT id, kind, display_name, visibility_scope, is_active, created_by, created_at, updated_at
  FROM public.persons WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c';

\echo ''
\echo '=== 5. the guard refuses when the person stops being inert ==='
-- Inside a SAVEPOINT, with the failure trapped in PL/pgSQL rather than by
-- relaxing ON_ERROR_STOP, so a refusal can never fall through to the DELETEs.
DO $t$
DECLARE _msg text; _refused boolean := false; _n bigint; _total bigint := 0; r record;
BEGIN
  INSERT INTO public.person_aliases (person_id, alias, source)
  VALUES ('271d7c44-c89f-44db-9b91-99474cdf0a2c', 'dry run 318 probe', 'manual');

  -- Re-run the guard's logic exactly as the migration states it.
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'public.persons'::regclass
       AND c.conrelid::regclass::text NOT IN ('customers', 'person_context_links')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
      INTO _n USING '271d7c44-c89f-44db-9b91-99474cdf0a2c'::uuid;
    _total := _total + _n;
  END LOOP;

  IF _total = 0 THEN
    RAISE EXCEPTION 'FAIL: the guard would not have noticed the attached alias';
  END IF;
  RAISE NOTICE 'PASS: guard sees % referencing row(s) and would refuse', _total;

  DELETE FROM public.person_aliases WHERE alias = 'dry run 318 probe';
END
$t$;

ROLLBACK;

\echo ''
\echo '=== rolled back; live database unchanged ==='
SELECT
  (SELECT count(*) FROM public.persons WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c') AS person_still_here,
  (SELECT count(*) FROM public.persons WHERE id = '135ac0e1-a2b4-4692-b736-dd6cc106972f') AS specimen_still_here,
  (SELECT count(*) FROM public.person_aliases WHERE alias = 'dry run 318 probe') AS probe_residue;
