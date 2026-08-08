-- Dry run for migration 315. Everything happens inside a transaction that is
-- rolled back, so the live database is unchanged when this finishes.
--
-- Run with:
--   docker cp supabase/migrations/20260808060000_315_seed_role_permissions_missing_modules.sql \
--     afrakala-lan-db:/tmp/315.sql
--   docker cp docs/verification/315-dry-run.sql afrakala-lan-db:/tmp/315-dry.sql
--   docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 -f /tmp/315-dry.sql
--
-- What it proves, in order:
--   1. the three modules really have zero rows before the migration
--   2. the migration's own gate passes (it raises if any set is wrong)
--   3. `has_dynamic_permission` stops falling back — the observable symptom
--      is a real `sales` user losing `accounting.view`, which the fallback
--      was granting
--   4. re-running the migration is a no-op (idempotence)
--   5. the down script removes exactly the seeded rows
SET client_encoding='UTF8';

BEGIN;

\echo '--- 1. before: rows per module (expect three zeros) ---'
SELECT m.module,
       (SELECT count(*) FROM public.role_permissions rp WHERE rp.module = m.module) AS rows_before
  FROM (VALUES ('accounting'), ('hr'), ('market-rates')) AS m(module);

\echo '--- 1b. a real non-admin user to test with ---'
SELECT ur.role::text AS role, count(*) AS users
  FROM public.user_roles ur
 WHERE ur.role::text IN ('sales', 'viewer', 'accountant')
 GROUP BY 1 ORDER BY 1;

\echo '--- 3a. BEFORE seeding: does the fallback grant accounting.view to sales? ---'
SELECT ur.user_id,
       public.has_dynamic_permission(ur.user_id, 'accounting', 'view') AS accounting_view
  FROM public.user_roles ur
 WHERE ur.role::text = 'sales'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles a
                    WHERE a.user_id = ur.user_id AND a.role::text = 'admin')
 LIMIT 3;

\echo '--- 2. apply the migration (its gate raises on any mismatch) ---'
\i /tmp/315.sql

\echo '--- 3b. AFTER seeding: the same users must now be denied ---'
SELECT ur.user_id,
       public.has_dynamic_permission(ur.user_id, 'accounting', 'view') AS accounting_view
  FROM public.user_roles ur
 WHERE ur.role::text = 'sales'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles a
                    WHERE a.user_id = ur.user_id AND a.role::text = 'admin')
 LIMIT 3;

\echo '--- 3c. and an accountant must still be allowed ---'
SELECT ur.user_id,
       public.has_dynamic_permission(ur.user_id, 'accounting', 'view')   AS acc_view,
       public.has_dynamic_permission(ur.user_id, 'market-rates', 'view') AS mr_view,
       public.has_dynamic_permission(ur.user_id, 'hr', 'view')           AS hr_view
  FROM public.user_roles ur
 WHERE ur.role::text = 'accountant'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles a
                    WHERE a.user_id = ur.user_id AND a.role::text = 'admin')
 LIMIT 3;

\echo '--- 3d. seeded matrix as applied ---'
SELECT module, role_name, can_view v, can_create c, can_update u, can_delete d,
       can_approve a, can_export e, can_view_sensitive s
  FROM public.role_permissions
 WHERE module IN ('accounting', 'hr', 'market-rates')
 ORDER BY module, role_name;

\echo '--- 4. idempotence: applying again must insert 0 rows and still pass ---'
\i /tmp/315.sql
SELECT count(*) AS rows_after_second_apply
  FROM public.role_permissions
 WHERE module IN ('accounting', 'hr', 'market-rates');

\echo '--- 5. down script removes exactly the seeded rows ---'
DELETE FROM public.role_permissions
 WHERE module IN ('accounting', 'hr', 'market-rates');
SELECT count(*) AS rows_after_down
  FROM public.role_permissions
 WHERE module IN ('accounting', 'hr', 'market-rates');
SELECT count(*) AS total_rows_back_to_baseline FROM public.role_permissions;

ROLLBACK;

\echo '--- rolled back; live database unchanged ---'
SELECT count(*) AS live_total_rows FROM public.role_permissions;
SELECT count(*) AS live_rows_for_the_three
  FROM public.role_permissions
 WHERE module IN ('accounting', 'hr', 'market-rates');
