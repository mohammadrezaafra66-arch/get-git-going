BEGIN;

-- Production hotfix, 2026-08-31.
-- anon and authenticated hold TRUNCATE on the three role/identity tables.
-- TRUNCATE is not subject to RLS, so the 221 RLS policies that protect every
-- other write path do not protect this one. An unauthenticated caller could
-- empty user_roles in a single statement and lock every human out.
-- Only TRUNCATE is removed. SELECT, INSERT, UPDATE and DELETE are left
-- exactly as they are, because RLS does gate those and because a prior
-- migration granted anon access for the registration form.

REVOKE TRUNCATE ON TABLE public.user_roles       FROM anon;
REVOKE TRUNCATE ON TABLE public.user_roles       FROM authenticated;
REVOKE TRUNCATE ON TABLE public.role_permissions FROM anon;
REVOKE TRUNCATE ON TABLE public.role_permissions FROM authenticated;
REVOKE TRUNCATE ON TABLE public.profiles         FROM anon;
REVOKE TRUNCATE ON TABLE public.profiles         FROM authenticated;

-- Two-sided assertion. Asserting only the revoke would pass a migration that
-- locked the application out; asserting only survival would pass one that
-- revoked nothing.
DO $verify$
DECLARE
  v_trunc int;
  v_other int;
BEGIN
  SELECT count(*) INTO v_trunc
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(rolname)
   WHERE n.nspname = 'public'
     AND c.relname IN ('user_roles','role_permissions','profiles')
     AND has_table_privilege(r.rolname, c.oid, 'TRUNCATE');
  IF v_trunc <> 0 THEN
    RAISE EXCEPTION 'hotfix: TRUNCATE still held in % cases', v_trunc;
  END IF;

  SELECT count(*) INTO v_other
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'),('authenticated')) AS r(rolname)
   WHERE n.nspname = 'public'
     AND c.relname IN ('user_roles','role_permissions','profiles')
     AND has_table_privilege(r.rolname, c.oid, 'SELECT');
  IF v_other <> 6 THEN
    RAISE EXCEPTION 'hotfix: SELECT should still be held in all 6 cases but is held in % - the revoke went too far', v_other;
  END IF;

  RAISE NOTICE 'hotfix: TRUNCATE removed in all 6 cases; SELECT intact in all 6';
END
$verify$;

COMMIT;
