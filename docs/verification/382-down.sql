-- 382-down.sql — reverse migration 382 (repair migration 381's assertion gate).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7 rule).
--
-- WHAT 382 DID: nothing. It creates, drops and alters no object. It is a pure assertion migration
-- that REPAIRS the gate shipped in 381 — it does not add a second one. The programme's cap is one
-- assertion gate per mission, and "if it is defeated, repair that gate"; 381 is applied and
-- committed and this repository does not edit an applied migration, so the repair ships here and
-- 381's checks 4 and 5 are explicitly retired by it.
--
-- WHY 381's GATE NEEDED REPAIR. An independent review defeated it twice, and both holes came from
-- the same mistake: **it was aimed at the schema instead of at the change.**
--
--   * Check 5 asserted `744` anon-executable functions — a NET census over 841 functions, 839 of
--     which 381 never touches. A net census cannot see a swap: the reviewer closed
--     `is_viewer_only` and `tehran_today` to anon and opened two admin RPCs, the count stayed 744,
--     and the gate passed. `is_viewer_only` backs 91 RLS policies.
--   * Nothing checked the consumers that must keep working. The reviewer revoked anon SELECT on
--     `shop_settings` and `products` — killing `/api/healthz` and `/api/public/products` — and the
--     gate passed.
--   * Check 5 also pins whole-schema state into a migration that must replay whole-and-in-order.
--     Any future migration that adds or removes one anon-executable function breaks 381's replay
--     for a reason unrelated to 381.
--   * `supabase_admin` in 381's keep-list is vacuous: it is a superuser, so
--     `has_function_privilege('supabase_admin', …)` is unconditionally true. The reviewer revoked
--     the owner's own grant and 381 still printed "supabase_admin kept it".
--   * 381's check 4 is a self-invalidating tripwire — it asserts a freshly created function IS
--     still anon-executable, so it fails the day OG-31 is closed. It is also the only DDL in an
--     otherwise pure-DCL migration.
--
-- WHAT THIS FILE RESTORES: nothing, because there is nothing to restore.
--
-- Running it is a no-op and is safe at any time. It exists so every migration from 350 onward has a
-- rollback file and the ledger has no gap.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  RAISE NOTICE '382-down: migration 382 asserts only and creates no object; there is nothing to reverse.';
END
$$;
