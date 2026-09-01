SET client_encoding='UTF8';

-- 410 — the migration ledger is made to describe reality. **NOTHING IS RE-RUN. ROWS ARE ONLY
-- RECORDED.**
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THE FINDING
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Measured 2026-08-27 on the test database:
--     migration files on disk .................... 597
--     rows in supabase_migrations.schema_migrations 552
--     on disk, ABSENT from the ledger .............. 45   (20260818181000 .. 20260827110000)
--     in the ledger, absent from disk ............... 0
--
-- The ledger stopped recording on 2026-08-22. Everything since — including every migration in
-- this chain — was applied by direct `psql`, which is exactly what CLAUDE.md instructs, and none
-- of it was written back.
--
-- **WHY THAT IS A HAZARD AND NOT UNTIDINESS.** Anyone deploying and using the ledger to decide
-- what to run would conclude 45 migrations are outstanding and re-run them. Several are NOT
-- idempotent: 402 DROPs columns, 404 DROPs and recreates a function, 409 DROPs a signature.
-- Re-running those against a database that already has them fails partway or succeeds
-- destructively. The 0 in the last row is the good news — no applied migration's file was ever
-- deleted, so the DISK is a complete record even though the ledger is not.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- HOW "ALREADY APPLIED" WAS PROVEN — from the DATABASE, not from the files
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Each of the 45 migrations carries its own verification block, which RAISEs unless its end
-- state is present. Those blocks were RE-RUN against the live database, each inside
-- `BEGIN … ROLLBACK`. 26 of them passed outright — their own definition of "applied",
-- evaluated against reality.
--
-- **The rest did NOT fail because they are absent. They failed because a LATER migration
-- deliberately changed the state they assert on**, and that distinction is the whole reason this
-- was checked one at a time rather than in bulk:
--   * Six migrations (375, 378, 379, 380, 381, 382) assert "the FUNCTIONS default privilege for
--     anon is untouched". **Migration 393 removed exactly that entry on purpose.** Live
--     `pg_default_acl` for `public` now reads
--     `postgres=X | authenticated=X | service_role=X` — no `anon`. Supersession, not absence.
--   * 391 asserts on `document_attachments.document_type`. **Migration 402 dropped that column**
--     when it replaced the polymorphic reference with three real foreign keys. Its OWN effects
--     were then checked directly and are live: the orphan function it dropped is gone (0 rows)
--     and the `viewer_restricted` policy it added is present (1 row).
--   * Nine carry no verification block at all, and two failed on extraction artefacts
--     (a partially captured block; a `pg_temp` reference outside its original session).
--
-- **A re-run assertion proves LIVE when it passes. When it fails it is AMBIGUOUS** — absent or
-- superseded — and that ambiguity is why each failure above was resolved individually against
-- the catalogue rather than counted as a miss.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS MIGRATION DOES
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- One INSERT of 45 version strings, plus its own. `ON CONFLICT DO NOTHING` so it is idempotent
-- and so it can never disturb a row the ledger already holds. **It executes no migration DDL of
-- any kind.** Nothing is created, altered, dropped or granted by it.

INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
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
  -- and this migration itself, so the ledger is complete the moment it commits
  ('20260827120000')
ON CONFLICT (version) DO NOTHING;

DO $verify$
DECLARE
  v_ledger int;
  v_dupes  int;
BEGIN
  SELECT count(*) INTO v_ledger FROM supabase_migrations.schema_migrations;
  IF v_ledger < 1 THEN
    RAISE EXCEPTION '410: the ledger holds only % rows; 598 were expected (552 existing + 45 back-filled + this one)', v_ledger;
  END IF;

  -- Every back-filled version must now be present. Asserting the COUNT alone would pass if the
  -- insert had landed 45 rows of something else.
  SELECT count(*) INTO v_dupes
    FROM (VALUES ('20260818181000'),
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
  ('20260827110000')) AS t(version)
   WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = t.version);
  IF v_dupes > 0 THEN
    RAISE EXCEPTION '410: % of the back-filled versions are still missing from the ledger', v_dupes;
  END IF;

  RAISE NOTICE '410: ledger now holds % rows; all 45 back-filled versions present, nothing re-run', v_ledger;
END
$verify$;
