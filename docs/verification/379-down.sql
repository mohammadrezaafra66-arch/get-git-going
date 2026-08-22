-- 379-down.sql — reverse migration 379 (assert the OG-25 census as a set).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 379 DID: nothing. It creates, drops and alters no object. It is a pure assertion migration that supersedes
-- migration 378's census check. 378 compared the census as a set, which closed the one-for-one swap,
-- but kept asking `aclexplode ... grantee = 'anon'` underneath — an identity test. So a GRANT to
-- PUBLIC, a role anon inherits, and a column-level grant all walked past it, and its
-- relkind IN ('r','v','S') scope could not see a materialized or partitioned table at all. 379 tests
-- EFFECT with has_table_privilege / has_sequence_privilege across relkind r/v/S/m/p/f, and sweeps
-- pg_attribute for column ACLs.
--
-- WHAT THIS FILE RESTORES: nothing, because there is nothing to restore. Rolling back an assertion
-- means removing the assertion, and the assertion left no trace in the catalogue.
--
-- This file exists so that every migration from 350 onward has a rollback file and the ledger in
-- 00-progress.md has no gap. Running it is a no-op and is safe at any time.
--
-- ORDER. Independent of 373-down and 374-down.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  RAISE NOTICE '379-down: migration 379 asserts only and creates no object; there is nothing to reverse.';
END
$$;
