SET client_encoding TO 'UTF8';
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('uid', 'is_service_role')
ORDER BY 1, 2;
