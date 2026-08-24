-- 385-down.sql — rollback for migration 385. A DOCUMENTED NO-OP.
--
-- Migration 385 repairs migration 384's assertion gate. Like 384 itself, it contains one `DO` block
-- and no DDL and no DCL: it creates nothing, drops nothing, grants nothing and revokes nothing.
-- There is therefore nothing to undo, and this file deliberately contains no statement that changes
-- anything.
--
-- The undo that WOULD be wanted — "make the gate stop asserting" — cannot be written here. Undoing
-- an assertion means deleting the migration file, which is a repository operation, not a SQL one.
-- Removing 385 from `supabase_migrations.schema_migrations` would make it replay, not stop.
--
-- WHAT MUST NOT GO IN THIS FILE. Not `ALTER ROLE <name> BYPASSRLS`, not `GRANT`, not anything that
-- relaxes a role attribute. 385 asserts a property this database already had; a rollback that
-- installed the property's opposite would create the exposure the gate exists to detect.
--
-- Per the programme's rollback rule this file carries statements only — no BEGIN, COMMIT or
-- ROLLBACK. The caller owns the transaction. `docs/verification/rollback-dryrun.sql` is the caller
-- used to prove it, and it was run against this file BEFORE migration 385 was applied.

SET client_encoding = 'UTF8';

DO $rb$
BEGIN
  RAISE NOTICE '385-down: no-op by design. Migration 385 changed no schema object, no role attribute and no privilege, so there is nothing to reverse. To retire the assertion, remove the migration file in the repository';
END
$rb$;
