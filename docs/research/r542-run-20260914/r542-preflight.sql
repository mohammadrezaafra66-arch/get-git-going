-- r542 phase 0 preflight. Read-only.
BEGIN READ ONLY;
SELECT 'r542_preflight'
    || '|db=' || current_database()
    || '|replica=' || pg_is_in_recovery()
    || '|ledger_rows=' || (SELECT count(*) FROM supabase_migrations.schema_migrations)
    || '|ledger_max=' || (SELECT max(version) FROM supabase_migrations.schema_migrations)
    || '|row_542=' || (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260914130000')
    || '|row_526=' || (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260913090000')
    || '|server=' || current_setting('server_version')
  AS line;
-- shape the file expects (it refuses on its own if not; this is just for the record)
SELECT 'r542_shape'
    || '|views_present=' || (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                              WHERE n.nspname='public' AND c.relkind='v'
                                AND c.relname IN ('vw_account_balances','vw_supplier_payables','v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances','publish_recipients_view'))
    || '|policy_read_authed=' || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='shop_settings' AND policyname='shop_settings_read_authed')
    || '|policy_read_non_secret=' || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='shop_settings' AND policyname='shop_settings_read_non_secret')
    || '|policy_write_admin=' || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='shop_settings' AND policyname='shop_settings_write_admin')
    || '|guard_fn=' || (to_regprocedure('public.tg_profiles_guard_status_change()') IS NOT NULL)
    || '|guard_trigger=' || (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='profiles_guard_status_change')
    || '|has_role_overloads=' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_role')
    || '|has_any_role_overloads=' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='has_any_role')
    || '|profiles_not_active=' || (SELECT count(*) FROM public.profiles WHERE status IS DISTINCT FROM 'active')
  AS line;
ROLLBACK;
