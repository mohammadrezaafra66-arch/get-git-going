-- 281: restrict the `viewer` role.
--
-- A viewer-only account could read 146 of 234 relations before this migration, including
-- phone numbers, addresses, sales quotes, payment receipts, credit balances, purchase and
-- computed prices, the audit log and the privilege map itself. Measured, not assumed: a real
-- JWT was minted and every relation requested through PostgREST.
--   enumeration and reasoning: docs/asan/viewer-restriction-plan.md
--   raw measurement:           docs/verification/asan/viewer-probe-before.json
--   rollback:                  docs/verification/281-down.sql
--
-- Method: one RESTRICTIVE policy per denied table. RESTRICTIVE is AND-ed with the existing
-- permissive policies, so this can only subtract, and only for users whose sole role is
-- `viewer`. No existing policy is rewritten.
SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.is_viewer_only(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  -- True only when `viewer` is the user's *sole* role. Roles are additive everywhere else in
  -- this system (has_any_role grants if any role qualifies); restricting on "holds viewer"
  -- would be the one place where gaining a role removes access, and it would blind the
  -- owner's own account, which holds viewer alongside admin/manager/sales/accountant.
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = _user_id AND ur.role = 'viewer')
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = _user_id AND ur.role <> 'viewer');
$fn$;

REVOKE ALL ON FUNCTION public.is_viewer_only(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_viewer_only(uuid) TO authenticated, anon, service_role;


-- contact and identity (7 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.customers;
CREATE POLICY viewer_restricted ON public.customers AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.external_parties;
CREATE POLICY viewer_restricted ON public.external_parties AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.person_identifiers;
CREATE POLICY viewer_restricted ON public.person_identifiers AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.person_merge_candidates;
CREATE POLICY viewer_restricted ON public.person_merge_candidates AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.profiles;
CREATE POLICY viewer_restricted ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.suppliers;
CREATE POLICY viewer_restricted ON public.suppliers AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.visitors;
CREATE POLICY viewer_restricted ON public.visitors AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- sales documents (11 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.inquiries;
CREATE POLICY viewer_restricted ON public.inquiries AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.inquiry_price_cache;
CREATE POLICY viewer_restricted ON public.inquiry_price_cache AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.inquiry_status_history;
CREATE POLICY viewer_restricted ON public.inquiry_status_history AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.invoices;
CREATE POLICY viewer_restricted ON public.invoices AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sale_list_items;
CREATE POLICY viewer_restricted ON public.sale_list_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sale_list_versions;
CREATE POLICY viewer_restricted ON public.sale_list_versions AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sale_lists;
CREATE POLICY viewer_restricted ON public.sale_lists AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sales_quote_items;
CREATE POLICY viewer_restricted ON public.sales_quote_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sales_quote_share_logs;
CREATE POLICY viewer_restricted ON public.sales_quote_share_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sales_quotes;
CREATE POLICY viewer_restricted ON public.sales_quotes AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.sales_reminders;
CREATE POLICY viewer_restricted ON public.sales_reminders AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- payments and accounting (6 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.bank_accounts;
CREATE POLICY viewer_restricted ON public.bank_accounts AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.journal_entries;
CREATE POLICY viewer_restricted ON public.journal_entries AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.journal_lines;
CREATE POLICY viewer_restricted ON public.journal_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.payment_receipt_documents;
CREATE POLICY viewer_restricted ON public.payment_receipt_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.payment_receipt_links;
CREATE POLICY viewer_restricted ON public.payment_receipt_links AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.payment_receipts;
CREATE POLICY viewer_restricted ON public.payment_receipts AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- credit and capital (12 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.capital_allocation_ledger;
CREATE POLICY viewer_restricted ON public.capital_allocation_ledger AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.credit_requests;
CREATE POLICY viewer_restricted ON public.credit_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.credit_score_snapshots;
CREATE POLICY viewer_restricted ON public.credit_score_snapshots AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.credit_scoring_rules;
CREATE POLICY viewer_restricted ON public.credit_scoring_rules AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.customer_capital_allocations_dynamic;
CREATE POLICY viewer_restricted ON public.customer_capital_allocations_dynamic AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.customer_credit_balance;
CREATE POLICY viewer_restricted ON public.customer_credit_balance AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.customer_credit_ledger;
CREATE POLICY viewer_restricted ON public.customer_credit_ledger AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.customer_credit_profile;
CREATE POLICY viewer_restricted ON public.customer_credit_profile AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.daily_capital_inputs;
CREATE POLICY viewer_restricted ON public.daily_capital_inputs AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.daily_capital_settings;
CREATE POLICY viewer_restricted ON public.daily_capital_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.daily_capital_snapshots;
CREATE POLICY viewer_restricted ON public.daily_capital_snapshots AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.salesperson_capital_allocations_dynamic;
CREATE POLICY viewer_restricted ON public.salesperson_capital_allocations_dynamic AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- purchasing (8 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.product_suppliers;
CREATE POLICY viewer_restricted ON public.product_suppliers AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_items;
CREATE POLICY viewer_restricted ON public.purchase_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_prices;
CREATE POLICY viewer_restricted ON public.purchase_prices AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_request_fulfillments;
CREATE POLICY viewer_restricted ON public.purchase_request_fulfillments AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_request_status_history;
CREATE POLICY viewer_restricted ON public.purchase_request_status_history AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_requests;
CREATE POLICY viewer_restricted ON public.purchase_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.purchases;
CREATE POLICY viewer_restricted ON public.purchases AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.recent_purchase_settings;
CREATE POLICY viewer_restricted ON public.recent_purchase_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- pricing and margins (14 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.categories;
CREATE POLICY viewer_restricted ON public.categories AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_table_cells;
CREATE POLICY viewer_restricted ON public.dynamic_table_cells AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_table_columns;
CREATE POLICY viewer_restricted ON public.dynamic_table_columns AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_table_rows;
CREATE POLICY viewer_restricted ON public.dynamic_table_rows AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_tables;
CREATE POLICY viewer_restricted ON public.dynamic_tables AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.price_calculation_snapshots;
CREATE POLICY viewer_restricted ON public.price_calculation_snapshots AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_board_access_requests;
CREATE POLICY viewer_restricted ON public.pricing_board_access_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_board_settings;
CREATE POLICY viewer_restricted ON public.pricing_board_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_board_viewer_sessions;
CREATE POLICY viewer_restricted ON public.pricing_board_viewer_sessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_recompute_queue;
CREATE POLICY viewer_restricted ON public.pricing_recompute_queue AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_rules;
CREATE POLICY viewer_restricted ON public.pricing_rules AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.product_computed_prices;
CREATE POLICY viewer_restricted ON public.product_computed_prices AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.product_sale_price_history;
CREATE POLICY viewer_restricted ON public.product_sale_price_history AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.shipping_cost_rules;
CREATE POLICY viewer_restricted ON public.shipping_cost_rules AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- personal performance (9 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_entity_scores;
CREATE POLICY viewer_restricted ON public.dynamic_entity_scores AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_parameter_weights;
CREATE POLICY viewer_restricted ON public.dynamic_parameter_weights AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_scoring_parameters;
CREATE POLICY viewer_restricted ON public.dynamic_scoring_parameters AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.employee_level_up_events;
CREATE POLICY viewer_restricted ON public.employee_level_up_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.employee_progress;
CREATE POLICY viewer_restricted ON public.employee_progress AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.employee_score_events;
CREATE POLICY viewer_restricted ON public.employee_score_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.employee_scores;
CREATE POLICY viewer_restricted ON public.employee_scores AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.presence_logs;
CREATE POLICY viewer_restricted ON public.presence_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.staff_daily_performance_metrics;
CREATE POLICY viewer_restricted ON public.staff_daily_performance_metrics AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- configuration holding secrets, contact details and margins (1 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.shop_settings;
CREATE POLICY viewer_restricted ON public.shop_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- security and infrastructure (16 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.ai_provider_health;
CREATE POLICY viewer_restricted ON public.ai_provider_health AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.ai_providers;
CREATE POLICY viewer_restricted ON public.ai_providers AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.ai_usage_routes;
CREATE POLICY viewer_restricted ON public.ai_usage_routes AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.audit_logs;
CREATE POLICY viewer_restricted ON public.audit_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.automation_modules;
CREATE POLICY viewer_restricted ON public.automation_modules AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_key_audit_log;
CREATE POLICY viewer_restricted ON public.bot_api_key_audit_log AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_key_label_access;
CREATE POLICY viewer_restricted ON public.bot_api_key_label_access AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_key_table_access;
CREATE POLICY viewer_restricted ON public.bot_api_key_table_access AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_keys;
CREATE POLICY viewer_restricted ON public.bot_api_keys AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_usage_logs;
CREATE POLICY viewer_restricted ON public.bot_api_usage_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.custom_roles;
CREATE POLICY viewer_restricted ON public.custom_roles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_parameter_weights_backup_142;
CREATE POLICY viewer_restricted ON public.dynamic_parameter_weights_backup_142 AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_parameter_weights_backup_20260722;
CREATE POLICY viewer_restricted ON public.dynamic_parameter_weights_backup_20260722 AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.knowledge_documents_backup_20260722;
CREATE POLICY viewer_restricted ON public.knowledge_documents_backup_20260722 AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.role_permissions;
CREATE POLICY viewer_restricted ON public.role_permissions AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.user_roles;
CREATE POLICY viewer_restricted ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- internal product intelligence (4 tables)
DROP POLICY IF EXISTS viewer_restricted ON public.product_interaction_events;
CREATE POLICY viewer_restricted ON public.product_interaction_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.product_owner_assignments;
CREATE POLICY viewer_restricted ON public.product_owner_assignments AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.product_recommendation_overrides;
CREATE POLICY viewer_restricted ON public.product_recommendation_overrides AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));
DROP POLICY IF EXISTS viewer_restricted ON public.promotion_nomination_policy;
CREATE POLICY viewer_restricted ON public.promotion_nomination_policy AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- Four 2026-07-22 backup tables were created with row level security never enabled at all, so
-- no policy on them -- restrictive or otherwise -- had any effect and every authenticated user
-- could read them whole. payment_receipts_backup_20260722 is a copy of the receipts ledger and
-- knowledge_documents_backup_20260722 is the only surviving copy of 42 documents. RLS is
-- switched on and each gets an admin-only read policy, which is what a repair snapshot needs.
-- service_role bypasses RLS, so server-side code is unaffected.
ALTER TABLE public.dynamic_parameter_weights_backup_142 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dynamic_parameter_weights_backup_142_admin_read ON public.dynamic_parameter_weights_backup_142;
CREATE POLICY dynamic_parameter_weights_backup_142_admin_read ON public.dynamic_parameter_weights_backup_142 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.dynamic_parameter_weights_backup_20260722 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dynamic_parameter_weights_backup_20260722_admin_read ON public.dynamic_parameter_weights_backup_20260722;
CREATE POLICY dynamic_parameter_weights_backup_20260722_admin_read ON public.dynamic_parameter_weights_backup_20260722 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.knowledge_documents_backup_20260722 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_documents_backup_20260722_admin_read ON public.knowledge_documents_backup_20260722;
CREATE POLICY knowledge_documents_backup_20260722_admin_read ON public.knowledge_documents_backup_20260722 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.payment_receipts_backup_20260722 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipts_backup_20260722_admin_read ON public.payment_receipts_backup_20260722;
CREATE POLICY payment_receipts_backup_20260722_admin_read ON public.payment_receipts_backup_20260722 FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Views carry no RLS of their own, and these eight run with their owner's rights. Each is
-- re-created as its own unchanged definition wrapped in one guard, so the inner SQL and the
-- column list are untouched. Live definitions: docs/verification/pre-281/.
CREATE OR REPLACE VIEW public.product_computed_prices_public AS
  SELECT * FROM (
    SELECT product_computed_prices.id,
        product_computed_prices.product_id,
        product_computed_prices.sale_price_type_id,
        product_computed_prices.pricing_rule_id,
        product_computed_prices.final_sale_price,
        product_computed_prices.rounded_sale_price,
        product_computed_prices.computed_at,
        product_computed_prices.source
       FROM product_computed_prices
      WHERE product_computed_prices.settlement_type_id IS NULL
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.publish_recipients_view AS
  SELECT * FROM (
    SELECT p.id,
        p.full_name,
        array_agg(ur.role ORDER BY ur.role) AS roles
       FROM profiles p
         JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.is_active = true AND (ur.role = ANY (ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]))
      GROUP BY p.id, p.full_name
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.v_dynamic_customer_capital_balances AS
  SELECT * FROM (
    SELECT c.id AS allocation_id,
        c.capital_setting_id,
        c.customer_id,
        c.salesperson_id,
        c.weighted_score,
        c.share_ratio,
        c.raw_allocation,
        COALESCE(c.final_limit, 0::numeric) AS final_limit,
        u.held AS held_amount,
        u.consumed AS consumed_amount,
        GREATEST(COALESCE(c.final_limit, 0::numeric) - u.held - u.consumed, 0::numeric) AS remaining_amount,
        c.binding_constraint,
        c.created_at
       FROM customer_capital_allocations_dynamic c
         CROSS JOIN LATERAL _capital_alloc_used('customer'::text, c.id) u(held, consumed)
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.v_dynamic_salesperson_capital_balances AS
  SELECT * FROM (
    SELECT s.id AS allocation_id,
        s.capital_setting_id,
        s.salesperson_id,
        s.weighted_score,
        s.share_ratio,
        COALESCE(s.allocated_capital, 0::numeric) AS allocated_capital,
        u.held AS held_amount,
        u.consumed AS consumed_amount,
        GREATEST(COALESCE(s.allocated_capital, 0::numeric) - u.held - u.consumed, 0::numeric) AS remaining_amount,
        s.created_at
       FROM salesperson_capital_allocations_dynamic s
         CROSS JOIN LATERAL _capital_alloc_used('salesperson'::text, s.id) u(held, consumed)
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.v_promotion_suggestions AS
  SELECT * FROM (
    WITH label_sums AS (
             SELECT pll.product_id,
                COALESCE(sum(pl.weight), 0::bigint)::numeric AS label_weight_sum
               FROM product_label_links pll
                 JOIN product_labels pl ON pl.id = pll.label_id AND pl.is_active = true
              GROUP BY pll.product_id
            ), sales_90d AS (
             SELECT ii.product_id,
                COALESCE(sum(ii.quantity), 0::numeric) AS qty_90d
               FROM invoice_items ii
                 JOIN invoices i ON i.id = ii.invoice_id
              WHERE i.issue_date >= (CURRENT_DATE - '90 days'::interval) AND COALESCE(i.status, ''::text) <> 'cancelled'::text
              GROUP BY ii.product_id
            ), used_today AS (
             SELECT (audit_logs.diff ->> 'channel_id'::text)::uuid AS channel_id,
                count(*)::integer AS used
               FROM audit_logs
              WHERE audit_logs.action = 'promotion_suggestion_used'::text AND audit_logs.created_at >= (date_trunc('day'::text, (now() AT TIME ZONE 'Asia/Tehran'::text)) AT TIME ZONE 'Asia/Tehran'::text) AND audit_logs.diff ? 'channel_id'::text
              GROUP BY ((audit_logs.diff ->> 'channel_id'::text)::uuid)
            ), nom_today AS (
             SELECT pn.product_id,
                COALESCE(sum(pn.boost_applied), 0::numeric) AS raw_boost,
                count(*)::integer AS nomination_count,
                max(pn.created_at) AS last_nominated_at
               FROM promotion_nominations pn
              WHERE pn.nominated_on = (now() AT TIME ZONE 'Asia/Tehran'::text)::date AND pn.cancelled_at IS NULL
              GROUP BY pn.product_id
            ), def_policy AS (
             SELECT promotion_nomination_policy.boost_cap_per_product
               FROM promotion_nomination_policy
              WHERE promotion_nomination_policy.is_active AND promotion_nomination_policy.role IS NULL AND promotion_nomination_policy.user_id IS NULL
             LIMIT 1
            )
     SELECT p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.stock_status,
        mc.id AS channel_id,
        mc.name AS channel_name,
        COALESCE(ls.label_weight_sum, 0::numeric) AS label_weight_sum,
        mc.weight::numeric AS channel_weight,
            CASE p.stock_status::text
                WHEN 'available'::text THEN 1.0
                WHEN 'limited'::text THEN 0.6
                WHEN 'unknown'::text THEN 0.4
                ELSE 0.0
            END AS stock_factor,
        LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) AS recency_factor,
        COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
            CASE p.stock_status::text
                WHEN 'available'::text THEN 1.0
                WHEN 'limited'::text THEN 0.6
                WHEN 'unknown'::text THEN 0.4
                ELSE 0.0
            END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) +
            CASE
                WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
                ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
            END AS score,
        COALESCE(s90.qty_90d, 0::numeric) AS qty_90d,
        mc.daily_quota,
        COALESCE(ut.used, 0) AS used_today,
            CASE
                WHEN mc.daily_quota IS NULL OR mc.daily_quota = 0 THEN NULL::integer
                ELSE GREATEST(mc.daily_quota - COALESCE(ut.used, 0), 0)
            END AS remaining_today,
        COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
            CASE p.stock_status::text
                WHEN 'available'::text THEN 1.0
                WHEN 'limited'::text THEN 0.6
                WHEN 'unknown'::text THEN 0.4
                ELSE 0.0
            END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) AS market_score,
            CASE
                WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
                ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
            END AS sales_nomination_boost,
        COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
            CASE p.stock_status::text
                WHEN 'available'::text THEN 1.0
                WHEN 'limited'::text THEN 0.6
                WHEN 'unknown'::text THEN 0.4
                ELSE 0.0
            END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) +
            CASE
                WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
                ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
            END AS final_score,
        COALESCE(nt.nomination_count, 0) AS nomination_count,
        nt.last_nominated_at
       FROM products p
         CROSS JOIN marketing_channels mc
         LEFT JOIN label_sums ls ON ls.product_id = p.id
         LEFT JOIN sales_90d s90 ON s90.product_id = p.id
         LEFT JOIN used_today ut ON ut.channel_id = mc.id
         LEFT JOIN nom_today nt ON nt.product_id = p.id
         LEFT JOIN def_policy dp ON true
      WHERE p.is_active = true AND mc.is_active = true
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.vw_account_balances AS
  SELECT * FROM (
    WITH inflow AS (
             SELECT pr.destination_bank_account_id AS account_id,
                COALESCE(sum(pr.amount), 0::numeric) AS total_in,
                count(*) AS in_count
               FROM payment_receipts pr
              WHERE pr.destination_bank_account_id IS NOT NULL AND pr.status = 'approved'::text
              GROUP BY pr.destination_bank_account_id
            ), outflow AS (
             SELECT pv.source_bank_account_id AS account_id,
                COALESCE(sum(pv.amount), 0::numeric) AS total_out,
                count(*) AS out_count
               FROM payment_vouchers pv
              WHERE pv.status = 'approved'::text
              GROUP BY pv.source_bank_account_id
            )
     SELECT ba.id AS account_id,
        ba.title,
        ba.bank_name,
        ba.account_type,
        ba.currency,
        ba.is_active,
        ba.opening_balance,
        COALESCE(i.total_in, 0::numeric) AS total_in,
        COALESCE(o.total_out, 0::numeric) AS total_out,
        ba.opening_balance + COALESCE(i.total_in, 0::numeric) - COALESCE(o.total_out, 0::numeric) AS current_balance,
        COALESCE(i.in_count, 0::bigint) AS in_count,
        COALESCE(o.out_count, 0::bigint) AS out_count
       FROM bank_accounts ba
         LEFT JOIN inflow i ON i.account_id = ba.id
         LEFT JOIN outflow o ON o.account_id = ba.id
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.vw_customer_receivables AS
  SELECT * FROM (
    WITH paid_inv AS (
             SELECT prl.invoice_id AS doc_id,
                COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
               FROM payment_receipt_links prl
                 JOIN payment_receipts pr ON pr.id = prl.receipt_id
              WHERE prl.invoice_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
              GROUP BY prl.invoice_id
            ), paid_quote AS (
             SELECT prl.quote_id AS doc_id,
                COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
               FROM payment_receipt_links prl
                 JOIN payment_receipts pr ON pr.id = prl.receipt_id
              WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
              GROUP BY prl.quote_id
            )
     SELECT i.customer_id,
        c.name AS customer_name,
        i.id AS invoice_id,
        i.number AS invoice_number,
        i.invoice_type,
        i.status AS invoice_status,
        i.due_date,
        i.total_amount,
        COALESCE(i.deposit_amount, 0::numeric) AS deposit_amount,
        COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
        GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
        i.commitment_confirmed,
            CASE
                WHEN i.due_date IS NOT NULL THEN i.due_date - CURRENT_DATE
                ELSE NULL::integer
            END AS days_until_due,
        i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE AND (i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
        i.created_at,
            CASE
                WHEN i.due_date IS NULL THEN 'current'::text
                WHEN (CURRENT_DATE - i.due_date) <= 0 THEN 'current'::text
                WHEN (CURRENT_DATE - i.due_date) <= 30 THEN 'd1_30'::text
                WHEN (CURRENT_DATE - i.due_date) <= 60 THEN 'd31_60'::text
                WHEN (CURRENT_DATE - i.due_date) <= 90 THEN 'd61_90'::text
                ELSE 'd90_plus'::text
            END AS aging_bucket
       FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         LEFT JOIN paid_inv p ON p.doc_id = i.id
      WHERE i.commitment_confirmed = true AND COALESCE(i.status, ''::text) <> 'cancelled'::text AND GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric
    UNION ALL
     SELECT q.customer_id,
        COALESCE(c.name, q.customer_name) AS customer_name,
        q.id AS invoice_id,
        q.quote_number AS invoice_number,
        'sales_quote'::text AS invoice_type,
        q.status::text AS invoice_status,
        q.expires_at::date AS due_date,
        q.final_amount::numeric(18,2) AS total_amount,
        0::numeric AS deposit_amount,
        COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
        GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
        true AS commitment_confirmed,
            CASE
                WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - CURRENT_DATE
                ELSE NULL::integer
            END AS days_until_due,
        q.expires_at IS NOT NULL AND q.expires_at::date < CURRENT_DATE AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
        q.created_at,
            CASE
                WHEN q.expires_at IS NULL THEN 'current'::text
                WHEN (CURRENT_DATE - q.expires_at::date) <= 0 THEN 'current'::text
                WHEN (CURRENT_DATE - q.expires_at::date) <= 30 THEN 'd1_30'::text
                WHEN (CURRENT_DATE - q.expires_at::date) <= 60 THEN 'd31_60'::text
                WHEN (CURRENT_DATE - q.expires_at::date) <= 90 THEN 'd61_90'::text
                ELSE 'd90_plus'::text
            END AS aging_bucket
       FROM sales_quotes q
         LEFT JOIN customers c ON c.id = q.customer_id
         LEFT JOIN paid_quote p ON p.doc_id = q.id
      WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());
CREATE OR REPLACE VIEW public.vw_supplier_payables AS
  SELECT * FROM (
    SELECT p.supplier_id,
        s.name AS supplier_name,
        p.id AS purchase_id,
        p.purchase_date,
        pt.days AS payment_term_days,
            CASE
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                ELSE p.purchase_date
            END AS due_date,
        p.total_amount AS purchase_total_amount,
        p.cash_price,
        COALESCE(p.cash_price_currency, p.currency) AS currency,
        p.paid_at,
        p.paid_at IS NOT NULL AS is_paid,
            CASE
                WHEN p.paid_at IS NOT NULL THEN 0::numeric
                ELSE COALESCE(p.cash_price, p.total_amount, 0::numeric)
            END AS outstanding_amount,
            CASE
                WHEN p.paid_at IS NOT NULL THEN NULL::integer
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - CURRENT_DATE
                ELSE p.purchase_date - CURRENT_DATE
            END AS days_until_due,
        p.paid_at IS NULL AND
            CASE
                WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                ELSE p.purchase_date
            END < CURRENT_DATE AS is_overdue,
        NULL::text AS product_summary,
        p.created_at,
            CASE
                WHEN p.paid_at IS NOT NULL THEN 'current'::text
                WHEN (CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END) <= 0 THEN 'current'::text
                WHEN (CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END) <= 30 THEN 'd1_30'::text
                WHEN (CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END) <= 60 THEN 'd31_60'::text
                WHEN (CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END) <= 90 THEN 'd61_90'::text
                ELSE 'd90_plus'::text
            END AS aging_bucket
       FROM purchases p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id
  ) src
  WHERE NOT public.is_viewer_only(auth.uid());

-- Layer 2: module gating. `warehouse` had no viewer row at all, and
-- has_dynamic_permission's fallback GRANTS 'view' to viewer when a module has no row
-- (rule 2.5), so absence was permission. Seeding it also completes viewer coverage to all
-- 20 modules, which closes the fallback for this role for good.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT 'viewer', 'warehouse', false, false, false, false, false, false, false
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions
                    WHERE role_name = 'viewer' AND module = 'warehouse');

UPDATE public.role_permissions
   SET can_view = false, can_create = false, can_update = false, can_delete = false,
       can_approve = false, can_export = false, can_view_sensitive = false, updated_at = now()
 WHERE role_name = 'viewer'
   AND module IN ('invoices', 'sales', 'purchases', 'price-lists', 'data-tables');

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'viewer_restricted' AND permissive = 'RESTRICTIVE';
  IF n <> 88 THEN RAISE EXCEPTION 'expected 88 restrictive viewer policies, found %', n; END IF;

  SELECT count(*) INTO n FROM public.role_permissions WHERE role_name = 'viewer';
  IF n <> 20 THEN RAISE EXCEPTION 'viewer must have a row for all 20 modules, found %', n; END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE role_name = 'viewer' AND can_view AND module IN
     ('invoices','sales','purchases','price-lists','data-tables','warehouse');
  IF n <> 0 THEN RAISE EXCEPTION 'restricted modules still viewable: %', n; END IF;

  -- the owner's account holds viewer alongside four other roles and must stay unrestricted
  IF public.is_viewer_only('1a15e8c6-3a83-49c2-9531-db9046d30968'::uuid) THEN
    RAISE EXCEPTION 'a multi-role account was classified as viewer-only';
  END IF;
  IF NOT public.is_viewer_only('20303d30-ab9d-4fc6-be96-ec5db1dcb647'::uuid) THEN
    RAISE EXCEPTION 'the viewer-only test account was not classified as viewer-only';
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION '% tables in public still have RLS disabled', n; END IF;
END
$chk$;
