
-- Audit log injection hardening (Option A): keep actor_id check, add entity_type allow-list.
CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _entity_type IN (
    'auth','bot_api_keys','brands','categories','category','category_product_attribute',
    'credit_scoring_rules','currency_rate_fetches','currency_rates','currency_sources',
    'customer','customer_credit_profile','daily_mood_entries',
    'dynamic_table','dynamic_table_cell','dynamic_table_column','dynamic_table_columns',
    'dynamic_table_row','dynamic_table_rows','dynamic_tables',
    'external_party','gamification_kpi','gamification_mission',
    'invoice','invoice_item',
    'market_rate_source_mapping','marketing_channel','messenger_group',
    'payment_receipt','payment_receipt_document',
    'person','person_context_link','person_identifier',
    'price_calculation_snapshots','pricing_board_settings','pricing_rules',
    'product','product_label','product_label_links','product_owner_assignments',
    'product_recommendation_override','product_sale_price_history','product_supplier','products',
    'promotion_suggestion','purchase_prices','purchase_request',
    'role','role_permissions',
    'sale_list','sale_lists','sale_price_types','sales_quote_share_logs','sales_quotes',
    'settlement_types','shipping_cost_rules','stock_alert_requests','supplier',
    'user','user_roles',
    -- reserved for upcoming slices
    'delivery_receipt','document','workflow_setting','employee_profile'
  );
$$;

DROP POLICY IF EXISTS "system inserts audit logs" ON public.audit_logs;

CREATE POLICY "system inserts audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = actor_id
    AND public.is_valid_audit_entity_type(entity_type)
  );
