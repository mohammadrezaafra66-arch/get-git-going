SELECT version FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260922040600','20260922040500') ORDER BY 1;
SELECT module_key, count(*) AS n
  FROM public.role_permissions
 WHERE module_key IN ('sales-deals-for-others','deal-lost-reasons','deal-lost-report')
 GROUP BY 1 ORDER BY 1;
