CREATE TABLE IF NOT EXISTS public.dynamic_scoring_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('customer','salesperson')),
  code text NOT NULL,
  label_fa text NOT NULL,
  direction text NOT NULL DEFAULT 'positive' CHECK (direction IN ('positive','negative')),
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dyn_scoring_params_entity_code_uniq UNIQUE (entity_type, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_scoring_parameters TO authenticated;
GRANT ALL ON public.dynamic_scoring_parameters TO service_role;

ALTER TABLE public.dynamic_scoring_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dyn_scoring_params_read_authenticated"
  ON public.dynamic_scoring_parameters FOR SELECT TO authenticated USING (true);

CREATE POLICY "dyn_scoring_params_admin_write"
  ON public.dynamic_scoring_parameters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TABLE IF NOT EXISTS public.dynamic_parameter_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id uuid NOT NULL REFERENCES public.dynamic_scoring_parameters(id) ON DELETE CASCADE,
  weight numeric(4,3) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS dyn_param_weights_parameter_idx
  ON public.dynamic_parameter_weights (parameter_id, valid_from DESC);

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.dynamic_parameter_weights
  ADD CONSTRAINT dyn_param_weights_no_overlap
  EXCLUDE USING gist (
    parameter_id WITH =,
    daterange(valid_from, COALESCE(valid_to, 'infinity'::date), '[)') WITH &&
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_parameter_weights TO authenticated;
GRANT ALL ON public.dynamic_parameter_weights TO service_role;

ALTER TABLE public.dynamic_parameter_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dyn_param_weights_read_authenticated"
  ON public.dynamic_parameter_weights FOR SELECT TO authenticated USING (true);

CREATE POLICY "dyn_param_weights_admin_write"
  ON public.dynamic_parameter_weights FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER dyn_scoring_params_set_updated_at
  BEFORE UPDATE ON public.dynamic_scoring_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _entity_type IN (
    SELECT unnest(ARRAY[
      'achievement','ai_conversation','ai_generated_content','appeal','audit_log',
      'bank_account','bot_api_key','brand','call_log','capital_allocation',
      'category','credit_request','credit_score_snapshot','credit_scoring_rule',
      'currency','currency_rate','currency_source','custom_role','customer',
      'customer_capital_allocation','customer_credit','daily_capital','daily_mood',
      'delivery_receipt','didar_activity','document','dynamic_table',
      'employee_profile','employee_score','external_party','feedback',
      'gamification_kpi','gamification_reward','inquiry','invoice',
      'journal_entry','knowledge_article','knowledge_document','league',
      'market_indicator','market_rate','marketing_channel','message','messenger',
      'mission','notification','payment_receipt','payment_term','penalty',
      'performance_penalty','person','presence','price_alert','price_list',
      'pricing_board','pricing_rule','product','product_image','profile',
      'purchase','purchase_receipt','purchase_request','recent_purchase',
      'role_permission','sale_list','sale_price_type','sales_quote',
      'salesperson_capital_allocation','score_snapshot','settlement_type',
      'shipping_cost_rule','shop_setting','stock_alert','supplier','task',
      'user_role','validation_rule','waybill','workflow_setting',
      'scoring_parameter','parameter_weight'
    ])
  );
$$;