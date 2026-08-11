-- 282: put the emergency admin back to sleep, and give the e2e harness its own admin.
--
-- `afra-admin@local.test` was activated for a previous test harness and left active. It is a
-- break-glass account: it should exist and it should not be usable day to day.
-- `_app.tsx` redirects any profile whose status is not 'active' to /pending-approval, so
-- status='inactive' is what actually closes the door in the application.
--
-- The e2e harness did depend on it: playwright.config.ts loads
-- e2e/auth/admin.storage.json, which held an afra-admin session, and
-- e2e/helpers/pgrest.ts minted admin JWTs from its id. Both are repointed at
-- `test.admin@afrakala.local` in the same commit, which already holds the admin role and only
-- needed activating.
--
-- Keyed on email, so this is a no-op on any environment that does not have these accounts.
-- Rollback: docs/verification/282-down.sql
SET client_encoding='UTF8';

UPDATE public.profiles p
   SET status = 'active', is_active = true, updated_at = now()
  FROM auth.users u
 WHERE u.id = p.id
   AND u.email = 'test.admin@afrakala.local';

UPDATE public.profiles p
   SET status = 'inactive', is_active = false, updated_at = now()
  FROM auth.users u
 WHERE u.id = p.id
   AND u.email = 'afra-admin@local.test';

DO $chk$
DECLARE r record;
BEGIN
  SELECT p.status, p.is_active INTO r
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
   WHERE u.email = 'afra-admin@local.test';
  IF FOUND AND (r.status <> 'inactive' OR r.is_active) THEN
    RAISE EXCEPTION 'afra-admin@local.test is still usable: status=% is_active=%', r.status, r.is_active;
  END IF;

  SELECT p.status, p.is_active INTO r
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
   WHERE u.email = 'test.admin@afrakala.local';
  IF FOUND AND (r.status <> 'active' OR NOT r.is_active) THEN
    RAISE EXCEPTION 'test.admin@afrakala.local was not activated: status=% is_active=%', r.status, r.is_active;
  END IF;

  -- the replacement must actually hold the admin role, or the harness would silently
  -- start running its "admin" specs as a user with no privileges
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'test.admin@afrakala.local')
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur JOIN auth.users u ON u.id = ur.user_id
        WHERE u.email = 'test.admin@afrakala.local' AND ur.role = 'admin')
  THEN
    RAISE EXCEPTION 'test.admin@afrakala.local does not hold the admin role';
  END IF;
END
$chk$;
