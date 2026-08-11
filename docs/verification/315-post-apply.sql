-- Post-apply verification for migration 315. Read-only; no transaction needed.
--
-- The claim to prove is not "the rows exist" (trivial) but "has_dynamic_permission
-- no longer takes the fallback branch". The test: for every real non-admin user
-- and every action, compare the live answer against (a) the seeded row and
-- (b) what the legacy fallback would have said. Wherever those two disagree,
-- the live answer must equal the seeded row.
SET client_encoding='UTF8';

\echo '=== one representative real user per non-admin role ==='
WITH u AS (
  SELECT DISTINCT ON (ur.role::text) ur.role::text AS role, ur.user_id
    FROM public.user_roles ur
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles a
                      WHERE a.user_id = ur.user_id AND a.role::text = 'admin')
   ORDER BY ur.role::text, ur.user_id
)
SELECT role, count(*) AS picked FROM u GROUP BY role ORDER BY role;

\echo ''
\echo '=== live answer vs seeded row vs legacy fallback ==='
\echo 'seed_says = the row written by 315; fallback_says = what the old branch would return'
\echo 'live_says MUST equal seed_says on every line. Lines where fallback_says differs are'
\echo 'the ones that were actually broken before.'
WITH u AS (
  SELECT DISTINCT ON (ur.role::text) ur.role::text AS role, ur.user_id
    FROM public.user_roles ur
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles a
                      WHERE a.user_id = ur.user_id AND a.role::text = 'admin')
   ORDER BY ur.role::text, ur.user_id
),
act AS (
  SELECT * FROM (VALUES
    ('view','can_view'), ('create','can_create'), ('update','can_update'),
    ('delete','can_delete'), ('approve','can_approve'), ('export','can_export'),
    ('view_sensitive','can_view_sensitive')
  ) AS t(action, col)
),
m AS (SELECT unnest(ARRAY['accounting','hr','market-rates']) AS module)
SELECT m.module, u.role, act.action,
       public.has_dynamic_permission(u.user_id, m.module, act.action) AS live_says,
       CASE act.col
         WHEN 'can_view'           THEN rp.can_view
         WHEN 'can_create'         THEN rp.can_create
         WHEN 'can_update'         THEN rp.can_update
         WHEN 'can_delete'         THEN rp.can_delete
         WHEN 'can_approve'        THEN rp.can_approve
         WHEN 'can_export'         THEN rp.can_export
         ELSE rp.can_view_sensitive
       END AS seed_says,
       CASE act.action
         WHEN 'view'   THEN u.role IN ('admin','manager','accountant','sales','viewer')
         WHEN 'create' THEN u.role IN ('admin','manager')
         WHEN 'update' THEN u.role IN ('admin','manager')
         WHEN 'delete' THEN u.role = 'admin'
         ELSE u.role IN ('admin','manager','accountant')
       END AS fallback_says
  FROM m
  CROSS JOIN u
  CROSS JOIN act
  JOIN public.role_permissions rp ON rp.module = m.module AND rp.role_name = u.role
 ORDER BY m.module, u.role, act.action;

\echo ''
\echo '=== VERDICT: rows where live disagrees with the seed (must be 0) ==='
WITH u AS (
  SELECT DISTINCT ON (ur.role::text) ur.role::text AS role, ur.user_id
    FROM public.user_roles ur
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles a
                      WHERE a.user_id = ur.user_id AND a.role::text = 'admin')
   ORDER BY ur.role::text, ur.user_id
),
act AS (
  SELECT * FROM (VALUES
    ('view','can_view'), ('create','can_create'), ('update','can_update'),
    ('delete','can_delete'), ('approve','can_approve'), ('export','can_export'),
    ('view_sensitive','can_view_sensitive')
  ) AS t(action, col)
),
m AS (SELECT unnest(ARRAY['accounting','hr','market-rates']) AS module),
cmp AS (
  SELECT m.module, u.role, act.action,
         public.has_dynamic_permission(u.user_id, m.module, act.action) AS live_says,
         CASE act.col
           WHEN 'can_view'    THEN rp.can_view    WHEN 'can_create' THEN rp.can_create
           WHEN 'can_update'  THEN rp.can_update  WHEN 'can_delete' THEN rp.can_delete
           WHEN 'can_approve' THEN rp.can_approve WHEN 'can_export' THEN rp.can_export
           ELSE rp.can_view_sensitive
         END AS seed_says,
         CASE act.action
           WHEN 'view'   THEN u.role IN ('admin','manager','accountant','sales','viewer')
           WHEN 'create' THEN u.role IN ('admin','manager')
           WHEN 'update' THEN u.role IN ('admin','manager')
           WHEN 'delete' THEN u.role = 'admin'
           ELSE u.role IN ('admin','manager','accountant')
         END AS fallback_says
    FROM m CROSS JOIN u CROSS JOIN act
    JOIN public.role_permissions rp ON rp.module = m.module AND rp.role_name = u.role
)
SELECT count(*) FILTER (WHERE live_says IS DISTINCT FROM seed_says)  AS live_vs_seed_mismatches,
       count(*) FILTER (WHERE seed_says IS DISTINCT FROM fallback_says) AS cases_the_seed_actually_changed,
       count(*) FILTER (WHERE seed_says = false AND fallback_says = true) AS permissions_revoked,
       count(*) FILTER (WHERE seed_says = true AND fallback_says = false) AS permissions_granted,
       count(*) AS total_checked
  FROM cmp;

\echo ''
\echo '=== every module in role_permissions now has a full set of role rows ==='
SELECT count(*) AS modules_with_incomplete_role_coverage
  FROM (
    SELECT module FROM public.role_permissions
     GROUP BY module
    HAVING count(*) <> (SELECT count(DISTINCT role_name) FROM public.role_permissions)
  ) x;
