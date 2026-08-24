-- 387-down.sql — rollback for migration 387. A DOCUMENTED NO-OP.
--
-- Migration 387 repairs migration 386's assertion gate. Like 386's gate it contains one `DO`
-- block and no DDL and no DCL: it creates nothing, drops nothing, grants nothing and revokes
-- nothing. There is therefore nothing to undo.
--
-- The undo that WOULD be wanted — "make the gate stop asserting" — cannot be written here.
-- Retiring an assertion means removing the migration file, which is a repository operation.
-- Deleting 387's row from `supabase_migrations.schema_migrations` would make it replay, not stop.
--
-- WHAT MUST NOT GO IN THIS FILE. Not a `CREATE OR REPLACE VIEW` that puts any of the eight
-- guard-class views back to the permissive predicate, and not a `GRANT`. Reversing 386 is
-- `386-down.sql`'s job and it exists; a rollback that quietly re-opened the NULL-uid path while
-- claiming to undo a gate would be the worst shape in this directory.
--
-- Per the programme's rollback rule this file carries statements only — no BEGIN, COMMIT or
-- ROLLBACK. The caller owns the transaction. `docs/verification/rollback-dryrun.sql` is the
-- caller used to prove it, run against this file BEFORE migration 387 was applied.

SET client_encoding = 'UTF8';

DO $rb$
BEGIN
  RAISE NOTICE '387-down: no-op by design. Migration 387 changed no view, no function, no privilege and no role attribute, so there is nothing to reverse. To reverse the guard-class change itself, use 386-down.sql';
END
$rb$;
