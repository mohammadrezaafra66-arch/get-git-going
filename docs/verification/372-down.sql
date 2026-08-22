-- 372-down.sql — reverse migration 372 (re-assert migration 370's end state, by identity).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule from migration 350 onward).
--
-- WHAT 372 DID: nothing. It changes no object. It is a pure assertion migration that supersedes
-- migration 371's gate. It exists because the second independent review defeated 371 twice:
--
--   * `security_invoker` spelled `on` rather than `true`. 371 string-matched the reloption, so the
--     flag was fully effective (accountant 24 -> 1) while the gate printed "371 OK". 372 reads the
--     value through pg_options_to_table and casts it, so every spelling normalises.
--   * A column-level grant to anon. `has_table_privilege` is blind to pg_attribute.attacl, so anon
--     could read current_balance through a single-column grant with the gate still green. 372 adds
--     a has_column_privilege sweep.
--
-- WHAT THIS FILE RESTORES: nothing, because there is nothing to restore. Rolling back an assertion
-- means removing the assertion, and the assertion left no trace in the catalogue.
--
-- This file is present so that every migration from 350 onward has a rollback file and the ledger
-- in 00-progress.md has no gap. Running it is a no-op and is safe at any time.
--
-- ORDER. Independent of 368-down, 369-down and 370-down. If you are rolling back 370, run
-- 370-down; this file neither helps nor hinders that.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  RAISE NOTICE '372-down: migration 372 asserts only and creates no object; there is nothing to reverse.';
END
$$;
