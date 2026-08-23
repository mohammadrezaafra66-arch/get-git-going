-- 383-down.sql — reverse migration 383 (assert OG-33 closure across ALL overloads).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7 rule).
--
-- WHAT 383 DID: nothing. It creates, drops and alters no object. It replaces migration 382's
-- check 1 — which asserted two exact signatures — with one that asserts by `proname`, so every
-- present and future overload of `get_recent_purchase_label*` must be closed to `anon` and `PUBLIC`.
--
-- WHY IT EXISTS. The independent review defeated 382 by creating
-- `get_recent_purchase_label(p_sku text)`. That overload is anon-executable and serves the exact
-- data OG-33 closed; 382 checked two exact signatures and printed OK. Migration 381's whole-schema
-- census would have caught it (745 <> 744), but that census was removed in 382 for good reason — it
-- pinned the state of 839 untouched functions into a migration that must replay whole and in order.
-- 383 keeps that replay-safety win and closes the hole by narrowing the assertion to the name rather
-- than widening it back to the schema.
--
-- The hole is reachable by ACCIDENT, not only by malice, which is why the owner overrode the
-- mission's two-round cap to have it fixed before shipping: **OG-31 is open**, so any newly created
-- function — including any overload — is granted EXECUTE to PUBLIC automatically. A future migration
-- that adds an overload reopens the leak without anyone writing a grant.
--
-- WHAT THIS FILE RESTORES: nothing, because there is nothing to restore. Running it is a no-op and
-- is safe at any time. It exists so every migration from 350 onward has a rollback file.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  RAISE NOTICE '383-down: migration 383 asserts only and creates no object; there is nothing to reverse.';
END
$$;
