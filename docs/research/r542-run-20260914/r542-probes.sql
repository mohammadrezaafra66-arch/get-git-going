-- r542 phase 2 / phase 7 probes. Read-only. Picks personas deterministically; prints no identifier.
\set ON_ERROR_STOP 1
BEGIN READ ONLY;
SELECT
  coalesce((SELECT p.id::text FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
             WHERE p.status = 'inactive'
               AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
             ORDER BY (u.id IS NULL), (u.banned_until IS NOT NULL AND u.banned_until > now()), p.id LIMIT 1),
           '00000000-0000-0000-0000-000000000000') AS inactive_norole,
  coalesce((SELECT p.id::text FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
             WHERE p.status = 'inactive'
               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'admin')
             ORDER BY (u.id IS NULL), (u.banned_until IS NOT NULL AND u.banned_until > now()), p.id LIMIT 1),
           '00000000-0000-0000-0000-000000000000') AS inactive_admin,
  coalesce((SELECT p.id::text FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
             WHERE p.status = 'active'
               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'sales')
               AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text <> 'sales')
             ORDER BY (u.id IS NULL), (u.banned_until IS NOT NULL AND u.banned_until > now()), p.id LIMIT 1),
           '00000000-0000-0000-0000-000000000000') AS sales,
  coalesce((SELECT p.id::text FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
             WHERE p.status = 'active'
               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'admin')
               AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'accountant')
             ORDER BY (u.id IS NULL), (u.banned_until IS NOT NULL AND u.banned_until > now()), p.id LIMIT 1),
           '00000000-0000-0000-0000-000000000000') AS active_admin,
  coalesce((SELECT p.id::text FROM public.profiles p
             WHERE p.status = 'active'
               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'accountant')
             ORDER BY p.id LIMIT 1),
           '00000000-0000-0000-0000-000000000000') AS real_accountant
\gset u_
-- a stable fingerprint of WHICH users were picked, so before/after can prove they are the same five
SELECT 'r542_personas|pick_md5=' || md5(:'u_inactive_norole' || :'u_inactive_admin' || :'u_sales' || :'u_active_admin' || :'u_real_accountant')
    || '|active_accountant_count=' || (SELECT count(*) FROM public.profiles p WHERE p.status = 'active'
                                         AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'accountant'))
  AS line;
ROLLBACK;

\set pname inactive_norole
\set uid :u_inactive_norole
\i /tmp/r542_probe_one.sql

\set pname sales
\set uid :u_sales
\i /tmp/r542_probe_one.sql

\set pname inactive_admin
\set uid :u_inactive_admin
\i /tmp/r542_probe_one.sql

\set pname active_admin
\set uid :u_active_admin
\i /tmp/r542_probe_one.sql

\set pname real_accountant
\set uid :u_real_accountant
\i /tmp/r542_probe_one.sql
