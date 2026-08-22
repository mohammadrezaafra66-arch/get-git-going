-- 375-down.sql — reverse migration 375 (assert the OG-25 end state).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7).
--
-- WHAT 375 DID: nothing. It creates, drops and alters no object. It is a pure assertion migration,
-- following the pattern of 371 and 372: a `DO` block that checks the end state of 373 and 374 and
-- raises `P0001` if it does not hold.
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
  RAISE NOTICE '375-down: migration 375 asserts only and creates no object; there is nothing to reverse.';
END
$$;
