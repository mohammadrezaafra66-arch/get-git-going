-- 371-down.sql — reverse migration 371 (re-assert migration 370's end state, by identity).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule from migration 350 onward).
--
-- WHAT 371 DID: nothing. It changes no object. It is a pure assertion migration — a `DO` block
-- that re-checks migration 370's end state by NAME rather than by COUNT, and raises if the state
-- has drifted. It exists because the independent review of 370 proved that 370's own gate could
-- print "370 OK" over three different wrong end states:
--
--   * security_invoker on the WRONG two guard-class views (the gate counted 2, never checked which)
--   * anon reading through a PUBLIC grant (the gate tested grantee = 'anon', an identity test,
--     not has_table_privilege, an effective-privilege test)
--   * `authenticated` losing publish_recipients_view or vw_account_balances (the gate's fourth
--     check covered only 4 of the 6 revoked views)
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
  RAISE NOTICE '371-down: migration 371 asserts only and creates no object; there is nothing to reverse.';
END
$$;
