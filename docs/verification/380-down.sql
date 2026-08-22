-- 380-down.sql — reverse migration 380 (assert the OG-25 census as a set).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 380 DID: nothing. It creates, drops and alters no object. It is a pure assertion migration that supersedes
-- migration 379's census. 379 pinned SET MEMBERSHIP - does anon hold any privilege - so adding SELECT
-- to an object already in the census was invisible, including sale_lists, whose missing SELECT is
-- OG-32. Its column sweep was also still an identity test and missed a role anon inherits. 380 pins
-- the privilege SET per object and tests columns with has_column_privilege against the table grant.
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
  RAISE NOTICE '380-down: migration 380 asserts only and creates no object; there is nothing to reverse.';
END
$$;
