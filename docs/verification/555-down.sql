-- Reverse 555 Torob Ops (copy/staging only)
SET client_encoding TO 'UTF8';

DROP TABLE IF EXISTS public.torob_ops_report_logs CASCADE;
DROP TABLE IF EXISTS public.torob_ops_findings CASCADE;
DROP TABLE IF EXISTS public.torob_ops_scan_runs CASCADE;
DROP TABLE IF EXISTS public.torob_ops_own_shops CASCADE;
DROP TABLE IF EXISTS public.torob_ops_sessions CASCADE;
DROP TABLE IF EXISTS public.torob_ops_credentials CASCADE;

DELETE FROM public.role_permissions WHERE module = 'torob-ops';

-- Restore audit allowlist without torob_ops (matches 302)
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
    'daily_capital_snapshot','capital_allocation_ledger','platform_release'
  ]);
$$;
