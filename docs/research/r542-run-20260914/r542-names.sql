-- r542: names the probes depend on. Read-only. Prints names and counts only.
BEGIN READ ONLY;
SELECT 'col|' || table_name || '.' || column_name || ':' || data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name IN ('shop_settings', 'profiles', 'user_roles')
   AND column_name IN ('key', 'value', 'status', 'is_active', 'id', 'user_id', 'role')
 ORDER BY 1;
SELECT 'rel|' || x || '=' || (to_regclass('public.' || x) IS NOT NULL)
  FROM unnest(ARRAY['bank_accounts', 'customer_capital_allocations_dynamic', 'salesperson_capital_allocations_dynamic',
                    'audit_logs', 'shop_settings', 'vw_account_balances', 'v_dynamic_customer_capital_balances',
                    'v_dynamic_salesperson_capital_balances', 'publish_recipients_view', 'vw_supplier_payables']) x;
SELECT 'status|' || coalesce(status, '<null>') || '=' || count(*) FROM public.profiles GROUP BY status ORDER BY 1;
SELECT 'candidates'
  || '|inactive_norole=' || (SELECT count(*) FROM public.profiles p WHERE p.status = 'inactive'
                               AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id))
  || '|inactive_admin=' || (SELECT count(*) FROM public.profiles p WHERE p.status = 'inactive'
                               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'admin'))
  || '|active_sales_only=' || (SELECT count(*) FROM public.profiles p WHERE p.status = 'active'
                               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'sales')
                               AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text <> 'sales'))
  || '|active_admin_not_accountant=' || (SELECT count(*) FROM public.profiles p WHERE p.status = 'active'
                               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'admin')
                               AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'accountant'))
  || '|active_accountant=' || (SELECT count(*) FROM public.profiles p WHERE p.status = 'active'
                               AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = 'accountant'))
  || '|active_accountant_roles=' || coalesce((SELECT string_agg(r, ';') FROM (
                               SELECT string_agg(ur.role::text, '+' ORDER BY ur.role::text) AS r
                                 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
                                WHERE p.status = 'active'
                                  AND EXISTS (SELECT 1 FROM public.user_roles a WHERE a.user_id = p.id AND a.role::text = 'accountant')
                                GROUP BY p.id) s), '-')
  AS line;
ROLLBACK;
