-- 378-down.sql — reverse migration 378 (assert the OG-25 census as a set).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 378 DID: nothing. It creates, drops and alters no object. It is a pure assertion migration that supersedes
-- migration 375's census check. 375 counted objects, so a one-for-one revoke-and-grant swap passed
-- it while an existing object had genuinely been revoked; and it could not see sequences at all,
-- because information_schema.role_table_grants does not report them. 378 pins all 216 object names
-- across relkind r/v/S and tests each sequence directly.
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
  RAISE NOTICE '378-down: migration 378 asserts only and creates no object; there is nothing to reverse.';
END
$$;
