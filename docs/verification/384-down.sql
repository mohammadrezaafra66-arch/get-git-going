-- 384-down.sql — reverse migration 384 (assert no role bypasses RLS except the four that must).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (M7 rule).
--
-- WHAT 384 DID: nothing. It creates, drops and alters no object, and it changes no role attribute.
-- It is a pure assertion migration.
--
-- WHY IT CHANGES NOTHING, which is the honest answer rather than a cautious one. Measured
-- 2026-08-24 across all 28 roles: `anon` and `authenticated` both already carry
-- `rolbypassrls = false`. There was nothing to revoke. The four roles that do bypass RLS are
-- `postgres`, `service_role`, `supabase_admin` and `supabase_read_only_user`, and the mission's
-- brief placed the first three out of scope while the fourth is Supabase-managed infrastructure
-- raised as an Owner-Gate rather than touched.
--
-- WHAT THIS FILE RESTORES: nothing, because there is nothing to restore. Running it is a no-op and
-- is safe at any time. It exists so every migration from 350 onward has a rollback file and the
-- ledger in 00-progress.md has no gap.
--
-- IF YOU ARE HERE BECAUSE 384 FAILED, this file is not what you want. 384 failing means a role
-- gained `BYPASSRLS` that the assertion does not expect. The fix is `ALTER ROLE <name> NOBYPASSRLS`
-- on that role — an operational action, not a migration rollback — after establishing who set it and
-- why. Note that PostgreSQL cannot prevent that command: event triggers are not supported for
-- `ALTER ROLE`, because roles are cluster-wide and event triggers are per-database. Detection is the
-- only control available, which is why this migration is an assertion and not a guard.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  RAISE NOTICE '384-down: migration 384 asserts only and changes no role attribute; there is nothing to reverse.';
END
$$;
