-- ROLLBACK for migration 393 (OG-31 — close the FUNCTIONS default privilege).
--
-- Written BEFORE the forward migration (A5.28) and built from the LIVE captured state of
-- `pg_default_acl` on the `afrakala` database on 2026-08-26, not from any file in git.
--
-- ============================================================================
-- THE CAPTURED STATE THIS FILE RESTORES
-- ============================================================================
--
-- Exactly three `defaclobjtype = 'f'` rows existed before 393, and there was **no global
-- (defaclnamespace = 0) row of any objtype**:
--
--     schema        | for_role       | objtype | defaclacl
--   ----------------+----------------+---------+-------------------------------------------
--    public         | supabase_admin | f       | {postgres=X/supabase_admin,
--                                                 anon=X/supabase_admin,
--                                                 authenticated=X/supabase_admin,
--                                                 service_role=X/supabase_admin}
--    pgsodium_masks | supabase_admin | f       | {pgsodium_keyiduser=X/supabase_admin}
--
--   (`pgsodium` and `pgsodium_masks` also carry 'r'/'S' rows; 393 does not touch those and
--    neither does this file.)
--
-- So the restore target is:
--   1. the `public` 'f' row carries `anon=X` again;
--   2. the global 'f' row is GONE;
--   3. the 'f' rows 393 adds for extensions / graphql / pgbouncer / pgsodium / vault are GONE;
--   4. the pre-existing `pgsodium_masks` 'f' row is back to `{pgsodium_keyiduser=X}` alone.
--
-- ============================================================================
-- WHY EACH STATEMENT IS SHAPED THE WAY IT IS
-- ============================================================================
--
-- PostgreSQL deletes a `pg_default_acl` row when the ACL it would hold becomes equal to
-- `acldefault()` for that object type. That is the mechanism this file relies on to make
-- rows disappear rather than linger as empty shells -- and it is asserted at the end rather
-- than assumed, because a lingering global row would silently keep the tap closed while this
-- file reported success.
--
-- `ALTER DEFAULT PRIVILEGES` with no `FOR ROLE` applies FOR ROLE current_user. This file
-- must therefore be run as **supabase_admin**, the same role that owns the forward
-- migration's rows. Running it as `postgres` creates a second, unrelated set of rows and
-- restores nothing.
--
-- ============================================================================
-- HOW TO RUN
-- ============================================================================
--
--   docker cp docs/verification/393-down.sql afrakala-lan-db:/tmp/393-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/393-down.sql
--   docker restart afrakala-lan-rest
--
-- (`--single-transaction` is correct HERE -- this file is meant to commit. A5.26's ban on it
--  applies to reverting *probes*, which must carry their own BEGIN ... ROLLBACK.)

SET client_encoding='UTF8';

-- 1. `public` -- put `anon=X` back on the FUNCTIONS default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;

-- 2. Remove the per-schema restores 393 added. Each of these five rows held exactly
--    `{=X/supabase_admin}` and nothing else, so revoking PUBLIC empties and deletes them.
ALTER DEFAULT PRIVILEGES IN SCHEMA extensions REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgbouncer  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgsodium   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA vault      REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 3. `pgsodium_masks` had a row BEFORE 393. Revoke only the PUBLIC entry 393 added and leave
--    `pgsodium_keyiduser=X` in place -- this row must survive, not disappear.
ALTER DEFAULT PRIVILEGES IN SCHEMA pgsodium_masks REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- 4. Drop the global row by granting PUBLIC back: the resulting ACL equals acldefault(),
--    which is the condition under which PostgreSQL removes the row entirely.
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

-- ============================================================================
-- ASSERT THE RESTORE ACTUALLY HAPPENED
-- ============================================================================
DO $$
DECLARE
  n_global      int;
  public_anon   boolean;
  n_added       int;
  masks_ok      boolean;
BEGIN
  SELECT count(*) INTO n_global
  FROM pg_default_acl WHERE defaclnamespace = 0 AND defaclobjtype = 'f';
  IF n_global <> 0 THEN
    RAISE EXCEPTION '393-down: the global FUNCTIONS default-acl row still exists (% rows) -- the tap is still closed and this rollback did NOT restore the captured state', n_global;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclobjtype = 'f' AND n.nspname = 'public'
      AND a.grantee = 'anon'::regrole AND a.privilege_type = 'EXECUTE'
  ) INTO public_anon;
  IF NOT public_anon THEN
    RAISE EXCEPTION '393-down: the public FUNCTIONS default-acl row does not carry anon=X -- captured state not restored';
  END IF;

  SELECT count(*) INTO n_added
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE d.defaclobjtype = 'f'
    AND n.nspname IN ('extensions','graphql','pgbouncer','pgsodium','vault');
  IF n_added <> 0 THEN
    RAISE EXCEPTION '393-down: % per-schema FUNCTIONS default-acl row(s) added by 393 survive', n_added;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclobjtype = 'f' AND n.nspname = 'pgsodium_masks'
      AND a.grantee = 'pgsodium_keyiduser'::regrole AND a.privilege_type = 'EXECUTE'
  ) INTO masks_ok;
  IF NOT masks_ok THEN
    RAISE EXCEPTION '393-down: the pre-existing pgsodium_masks FUNCTIONS row lost pgsodium_keyiduser=X -- this rollback removed more than 393 added';
  END IF;

  RAISE NOTICE '393-down OK: global FUNCTIONS row gone, public carries anon=X again, the five schemas 393 restored are back to having no row, and pgsodium_masks kept its original entry.';
END $$;
