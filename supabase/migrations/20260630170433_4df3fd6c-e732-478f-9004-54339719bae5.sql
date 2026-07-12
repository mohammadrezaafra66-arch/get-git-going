
-- ============================================================
-- Phase 5: Dynamic Scoring — Daily Capital Snapshot Tables
-- ============================================================

-- 1) daily_capital_settings
CREATE TABLE public.daily_capital_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_date date NOT NULL UNIQUE,
  total_capital numeric NOT NULL CHECK (total_capital > 0),
  scoring_mode text NOT NULL DEFAULT 'manual' CHECK (scoring_mode IN ('manual','auto')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.daily_capital_settings TO authenticated;
GRANT ALL    ON public.daily_capital_settings TO service_role;

ALTER TABLE public.daily_capital_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY dcs_select_authenticated
  ON public.daily_capital_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY dcs_admin_accountant_all
  ON public.daily_capital_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE TRIGGER trg_dcs_updated_at
  BEFORE UPDATE ON public.daily_capital_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) salesperson_capital_allocations_dynamic
CREATE TABLE public.salesperson_capital_allocations_dynamic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_setting_id uuid NOT NULL REFERENCES public.daily_capital_settings(id) ON DELETE CASCADE,
  salesperson_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weighted_score numeric,
  share_ratio numeric,
  allocated_capital numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_scad_setting_sp UNIQUE (capital_setting_id, salesperson_id)
);

CREATE INDEX idx_scad_salesperson ON public.salesperson_capital_allocations_dynamic(salesperson_id);
CREATE INDEX idx_scad_setting     ON public.salesperson_capital_allocations_dynamic(capital_setting_id);

GRANT SELECT ON public.salesperson_capital_allocations_dynamic TO authenticated;
GRANT ALL    ON public.salesperson_capital_allocations_dynamic TO service_role;

ALTER TABLE public.salesperson_capital_allocations_dynamic ENABLE ROW LEVEL SECURITY;

CREATE POLICY scad_admin_accountant_select
  ON public.salesperson_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY scad_owner_select
  ON public.salesperson_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING (salesperson_id = auth.uid());

-- 3) customer_capital_allocations_dynamic
CREATE TABLE public.customer_capital_allocations_dynamic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_setting_id uuid NOT NULL REFERENCES public.daily_capital_settings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  salesperson_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  weighted_score numeric,
  share_ratio numeric,
  raw_allocation numeric,
  final_limit numeric,
  binding_constraint text CHECK (binding_constraint IN ('formula','credit_limit','overdue','floor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_ccad_setting_cust UNIQUE (capital_setting_id, customer_id)
);

CREATE INDEX idx_ccad_salesperson ON public.customer_capital_allocations_dynamic(salesperson_id);
CREATE INDEX idx_ccad_customer    ON public.customer_capital_allocations_dynamic(customer_id);
CREATE INDEX idx_ccad_setting     ON public.customer_capital_allocations_dynamic(capital_setting_id);

GRANT SELECT ON public.customer_capital_allocations_dynamic TO authenticated;
GRANT ALL    ON public.customer_capital_allocations_dynamic TO service_role;

ALTER TABLE public.customer_capital_allocations_dynamic ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccad_admin_accountant_select
  ON public.customer_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant'));

CREATE POLICY ccad_owner_select
  ON public.customer_capital_allocations_dynamic
  FOR SELECT TO authenticated
  USING (salesperson_id = auth.uid());

-- 4) Extend audit allow-list
CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _entity_type IN (
    -- existing entries preserved
    'inquiry','inquiry_reply','inquiry_transfer','invoice','invoice_item',
    'customer','customer_credit_profile','customer_credit_ledger','credit_request',
    'product','product_image','product_label','product_supplier','product_attribute',
    'category','brand','supplier','purchase','purchase_request','purchase_receipt',
    'document','delivery_receipt','payment_receipt','waybill',
    'profile','user_role','custom_role','role_permission','employee_profile',
    'task','message','messenger_group','notification_event',
    'sale_list','sales_quote','price_list','pricing_rule','price_alert_rule',
    'workflow_setting','gamification_kpi','gamification_kpi_rule','mission','achievement',
    'bank_account','journal_entry','journal_line','settlement_type','payment_term',
    'api_key','bot_api_key','didar_activity','knowledge_article','knowledge_document',
    'feedback','penalty_appeal','performance_penalty',
    'dynamic_table','dynamic_table_row','dynamic_table_column',
    'market_rate_source','market_rate_tick','currency_source','currency_rate',
    'scoring_parameter','parameter_weight','dynamic_entity_score',
    -- phase 5 additions
    'capital_setting','salesperson_allocation_dynamic','customer_allocation_dynamic'
  );
$$;
