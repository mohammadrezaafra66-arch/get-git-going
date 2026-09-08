SET client_encoding='UTF8';

-- R-2 — reproduce production's LYING migration ledger on the rehearsal database.
--
-- WHY THIS FILE EXISTS INSTEAD OF RUNNING MIGRATION 410.
-- Migration 410 (20260827120000_410_backfill_migration_ledger.sql) inserts exactly these 46
-- versions and then asserts the ledger ends at 598 rows -- a number measured on the TEST
-- database (552 pre-existing + 45 back-filled + itself). The production baseline holds 523
-- pre-existing rows, so 410's own assertion FAILS there:
--     ERROR: 410: the ledger holds only 569 rows; 598 were expected
-- With --single-transaction that rolls the INSERT back. This file performs the same recording
-- and asserts the number production actually shows (569 rows, max 20260827120000).
--
-- IT RE-RUNS NO MIGRATION. It writes rows to supabase_migrations.schema_migrations and nothing
-- else. No DDL, no data change.

BEGIN;

INSERT INTO supabase_migrations.schema_migrations (version)
SELECT v FROM (VALUES
  ('20260818181000'),
  ('20260819090000'),
  ('20260819110000'),
  ('20260819112000'),
  ('20260819120000'),
  ('20260819131000'),
  ('20260819170000'),
  ('20260822171000'),
  ('20260822193000'),
  ('20260822211000'),
  ('20260822212000'),
  ('20260822220000'),
  ('20260822233000'),
  ('20260822234000'),
  ('20260823001000'),
  ('20260823010000'),
  ('20260823160000'),
  ('20260823183000'),
  ('20260823210000'),
  ('20260824120000'),
  ('20260824193000'),
  ('20260824210000'),
  ('20260824234500'),
  ('20260825020000'),
  ('20260825043000'),
  ('20260825120000'),
  ('20260825180000'),
  ('20260826090000'),
  ('20260826140000'),
  ('20260826180000'),
  ('20260826200000'),
  ('20260826220000'),
  ('20260826230000'),
  ('20260827000000'),
  ('20260827010000'),
  ('20260827020000'),
  ('20260827030000'),
  ('20260827040000'),
  ('20260827050000'),
  ('20260827060000'),
  ('20260827070000'),
  ('20260827080000'),
  ('20260827090000'),
  ('20260827100000'),
  ('20260827110000'),
  ('20260827120000')
) AS t(v)
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = t.v
);

DO $verify$
DECLARE
  v_rows bigint;
  v_max  text;
BEGIN
  SELECT count(*), max(version) INTO v_rows, v_max FROM supabase_migrations.schema_migrations;
  IF v_rows <> 569 THEN
    RAISE EXCEPTION 'R-2: ledger holds % rows; production shows 569', v_rows;
  END IF;
  IF v_max <> '20260827120000' THEN
    RAISE EXCEPTION 'R-2: ledger max is %; production shows 20260827120000', v_max;
  END IF;
  RAISE NOTICE 'R-2: ledger now 569 rows, max 20260827120000 -- production shape reproduced';
END
$verify$;

COMMIT;
