-- Down script for migration 282. No BEGIN/COMMIT: the caller owns the transaction.
-- Restores both accounts to the state they were in before 282: afra-admin active,
-- test.admin rejected. Only do this if the e2e harness is repointed back at afra-admin
-- as well (e2e/helpers/pgrest.ts ADMIN_USER_ID and e2e/auth/admin.storage.json).
SET client_encoding='UTF8';

UPDATE public.profiles p
   SET status = 'active', is_active = true, updated_at = now()
  FROM auth.users u
 WHERE u.id = p.id
   AND u.email = 'afra-admin@local.test';

UPDATE public.profiles p
   SET status = 'rejected', is_active = false, updated_at = now()
  FROM auth.users u
 WHERE u.id = p.id
   AND u.email = 'test.admin@afrakala.local';
