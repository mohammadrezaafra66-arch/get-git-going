-- S1 ids + notification_queue RLS (read-only)
SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'notification_queue';

SELECT ur.role::text AS role, ur.user_id
FROM public.user_roles ur
WHERE ur.role::text IN ('sales', 'admin', 'manager', 'accountant')
ORDER BY 1, 2
LIMIT 16;

SELECT id AS person_id FROM public.persons ORDER BY created_at NULLS LAST LIMIT 1;
SELECT id AS customer_id, responsible_id FROM public.customers ORDER BY created_at NULLS LAST LIMIT 3;
