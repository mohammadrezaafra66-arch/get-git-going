-- 389-down.sql — rollback for migration 389. REVERSES A REAL PRIVILEGE CHANGE.
--
-- Migration 389 revokes EXECUTE on `find_duplicate_product` from `anon` and from `PUBLIC`, and
-- repairs migration 388's gate. This file restores exactly the state captured live on
-- 2026-08-25 BEFORE 389 was written:
--
--   proacl: {=X/supabase_admin,supabase_admin=X/supabase_admin,anon=X/supabase_admin,
--            authenticated=X/supabase_admin,service_role=X/supabase_admin,postgres=X/supabase_admin}
--
-- The leading `=X` is the PUBLIC grant. PostgreSQL grants EXECUTE on functions to PUBLIC by
-- default, which is why 389 needs two REVOKEs and why this file needs two GRANTs — restoring
-- only `anon` would leave `has_function_privilege('public', …)` false and the captured proacl
-- would not match.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not re-grant `authenticated`, `service_role`,
-- `postgres` or `supabase_admin`, because migration 389 never revoked them — they hold explicit
-- grants that both files leave untouched. Measured inside BEGIN … ROLLBACK before 389 was
-- written: after revoking anon and PUBLIC, `authenticated` is still true, so the one real caller
-- (`src/lib/products/duplicate-check.ts:23`, browser client, i.e. authenticated) never loses
-- access. A rollback that granted more than the migration took away would be the
-- asymmetric-rollback defect migrations 374, 376 and 377 are documented for.
--
-- **RESTORING THIS RE-OPENS A MEASURED LEAK.** With `anon` holding EXECUTE, an unauthenticated
-- caller reads `products.sku` despite migration 388's column revoke, because the function is
-- SECURITY DEFINER and definer rights bypass both column grants and RLS. Four of its five
-- inputs are columns 388 deliberately keeps readable, so the arguments are free. Do not run
-- this file to "unblock" something without reading migration 389's header first.
--
-- 389's gate changes are assertions only; there is nothing to reverse in them. Retiring an
-- assertion means removing the migration file, which is a repository operation, not a SQL one.
--
-- Per the programme's rollback rule this file carries statements only — no BEGIN, no COMMIT, no
-- ROLLBACK. The caller owns the transaction. `docs/verification/rollback-dryrun.sql` is the
-- caller used to prove it, run against this file BEFORE migration 389 was applied.

SET client_encoding = 'UTF8';

GRANT EXECUTE ON FUNCTION public.find_duplicate_product(uuid, uuid, text, text, text, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.find_duplicate_product(uuid, uuid, text, text, text, uuid) TO PUBLIC;
