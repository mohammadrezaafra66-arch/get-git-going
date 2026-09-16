-- S1 security critic — read-only catalog probe (no DML)
SELECT current_database() AS db, current_user AS usr;

SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       COALESCE(p.proacl::text, '<null-default>') AS proacl,
       p.proconfig AS config,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'sales_interaction_create',
    'sales_interaction_update_status',
    'sales_interaction_set_follow_up',
    'sales_my_month_stats',
    'notify_sales_interaction_assigned'
  )
ORDER BY 1;

SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'sales_interactions'
GROUP BY grantee
ORDER BY 1;

SELECT role, priv, has_table_privilege(role, 'public.sales_interactions', priv) AS ok
FROM (VALUES ('anon'), ('authenticated')) AS r(role)
CROSS JOIN (VALUES
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
  ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
) AS p(priv)
ORDER BY 1, 2;

SELECT c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'sales_interactions';

SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.sales_interactions'::regclass
ORDER BY polname;

SELECT count(*) AS delete_policies
FROM pg_policy
WHERE polrelid = 'public.sales_interactions'::regclass AND polcmd = 'd';

SELECT f,
       has_function_privilege('anon', ('public.' || f)::regprocedure, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'EXECUTE') AS auth_exec
FROM unnest(ARRAY[
  'sales_interaction_create(uuid,text,text,text,uuid,uuid,uuid,timestamptz,text,text)',
  'sales_interaction_update_status(uuid,text,text)',
  'sales_interaction_set_follow_up(uuid,timestamptz,timestamptz)',
  'sales_my_month_stats()',
  'notify_sales_interaction_assigned()'
]) AS f;

SELECT tgname, tgenabled::text, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.sales_interactions'::regclass AND NOT tgisinternal
ORDER BY tgname;

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260916030000', '20260916031000', '20260916032000')
ORDER BY 1;

SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'notification_queue'
GROUP BY grantee
ORDER BY 1;

SELECT has_table_privilege('anon', 'public.notification_queue', 'INSERT') AS anon_ins,
       has_table_privilege('authenticated', 'public.notification_queue', 'INSERT') AS auth_ins,
       has_table_privilege('authenticated', 'public.notification_queue', 'SELECT') AS auth_sel;

-- RLS policies on notification_queue (forge surface)
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.notification_queue'::regclass
ORDER BY polname;
