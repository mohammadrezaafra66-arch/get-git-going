SET client_encoding='UTF8';

-- Down for 302_platform_releases — LAN test only. Drops release notes objects.

DROP POLICY IF EXISTS platform_releases_select ON public.platform_releases;
DROP POLICY IF EXISTS platform_releases_insert_admin ON public.platform_releases;
DROP POLICY IF EXISTS platform_releases_update_admin_draft ON public.platform_releases;
DROP POLICY IF EXISTS platform_releases_delete_admin_draft ON public.platform_releases;

DROP TRIGGER IF EXISTS platform_releases_protect_published ON public.platform_releases;
DROP TRIGGER IF EXISTS platform_releases_set_updated_at ON public.platform_releases;

DROP FUNCTION IF EXISTS public.publish_platform_release(uuid);
DROP FUNCTION IF EXISTS public.archive_platform_release(uuid);
DROP FUNCTION IF EXISTS public.trg_platform_releases_protect_published();
DROP FUNCTION IF EXISTS public.trg_platform_releases_set_updated_at();

DROP TABLE IF EXISTS public.platform_releases;
DROP SEQUENCE IF EXISTS public.platform_release_number_seq;

DELETE FROM public.role_permissions WHERE module = 'platform-releases';

-- Restore prior audit allowlist (without platform_release) — from migration 153 body.
CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _entity_type = ANY(ARRAY[
    'ai_provider',
    'inquiry','invoice','customer','product','profile','user_role','supplier',
    'purchase_request','purchase_receipt','document','workflow_setting',
    'delivery_receipt','scoring_parameter','parameter_weight',
    'dynamic_entity_score','daily_capital_setting',
    'salesperson_capital_allocation_dynamic','customer_capital_allocation_dynamic',
    'category','brand','price_list','pricing_rule','sale_list','sales_quote',
    'payment_receipt','journal_entry','task','knowledge_article','mission',
    'achievement','league_season','gamification_kpi','gamification_reward',
    'employee_score','penalty_appeal','performance_penalty','credit_request',
    'credit_scoring_rule','feedback','feedback_item','message','messenger_group',
    'notification_event','api_key','didar_activity','market_rate_source',
    'currency_source','currency_rate','academy_course','academy_lesson',
    'academy_quiz','bank_account','external_party','person','call_log',
    'price_alert_rule','stock_alert_request','shipping_cost_rule','settlement_type',
    'payment_term','validation_rule','price_change_reason','recent_purchase_setting',
    'shop_settings','pricing_board_setting','product_label','product_attribute',
    'dynamic_table','marketing_channel','knowledge_document','daily_capital_input',
    'daily_capital_snapshot','capital_allocation_ledger'
  ]);
$$;
