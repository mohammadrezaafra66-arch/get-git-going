-- 1. جدول
CREATE TABLE public.dynamic_entity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('customer','salesperson')),
  entity_id uuid NOT NULL,
  parameter_id uuid NOT NULL REFERENCES public.dynamic_scoring_parameters(id) ON DELETE CASCADE,
  raw_score numeric(4,3) NOT NULL CHECK (raw_score >= 0 AND raw_score <= 1),
  note text,
  scored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  period_month date NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_score UNIQUE (entity_type, entity_id, parameter_id, period_month)
);

-- 2. ایندکس‌ها
CREATE INDEX idx_dyn_scores_entity ON public.dynamic_entity_scores (entity_type, entity_id, period_month DESC);
CREATE INDEX idx_dyn_scores_period ON public.dynamic_entity_scores (period_month DESC, entity_type);

-- 3. GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dynamic_entity_scores TO authenticated;
GRANT ALL ON public.dynamic_entity_scores TO service_role;

-- 4. RLS
ALTER TABLE public.dynamic_entity_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dyn_scores_read_authenticated" ON public.dynamic_entity_scores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dyn_scores_write_admin_accountant" ON public.dynamic_entity_scores
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'accountant'));

-- 5. Trigger اعتبارسنجی entity_id
CREATE OR REPLACE FUNCTION public.validate_dynamic_entity_score()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.entity_type = 'customer' THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'مشتری با شناسه % یافت نشد', NEW.entity_id;
    END IF;
  ELSIF NEW.entity_type = 'salesperson' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.entity_id) THEN
      RAISE EXCEPTION 'کارشناس با شناسه % یافت نشد', NEW.entity_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_dyn_score
  BEFORE INSERT OR UPDATE ON public.dynamic_entity_scores
  FOR EACH ROW EXECUTE FUNCTION public.validate_dynamic_entity_score();

-- 6. set_updated_at
CREATE TRIGGER trg_dyn_scores_set_updated_at
  BEFORE UPDATE ON public.dynamic_entity_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Audit trigger
CREATE OR REPLACE FUNCTION public.audit_dynamic_entity_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(),
    'dynamic_entity_score',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_dyn_score
  AFTER INSERT OR UPDATE OR DELETE ON public.dynamic_entity_scores
  FOR EACH ROW EXECUTE FUNCTION public.audit_dynamic_entity_score();

-- 8. افزودن 'dynamic_entity_score' به allow-list audit
CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT _entity_type IN (
    SELECT unnest(ARRAY[
      'achievement','ai_conversation','ai_generated_content','appeal','audit_log',
      'bank_account','bot_api_key','brand','call_log','capital_allocation',
      'category','credit_request','credit_score_snapshot','credit_scoring_rule',
      'currency','currency_rate','currency_source','custom_role','customer',
      'customer_capital_allocation','customer_credit','daily_capital','daily_mood',
      'delivery_receipt','didar_activity','document','dynamic_table',
      'employee_profile','employee_score','external_party','feedback',
      'gamification_kpi','gamification_kpi_rule','gamification_reward','inquiry','invoice',
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
      'scoring_parameter','parameter_weight','dynamic_entity_score'
    ])
  );
$function$;