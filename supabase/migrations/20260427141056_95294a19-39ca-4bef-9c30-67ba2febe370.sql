
-- Phase 7: Customer Credit System

-- helper trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1) customer_credit_profile
CREATE TABLE public.customer_credit_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
  total_purchases numeric(15,2) NOT NULL DEFAULT 0,
  total_paid numeric(15,2) NOT NULL DEFAULT 0,
  outstanding_balance numeric(15,2) NOT NULL DEFAULT 0,
  late_payments_count integer NOT NULL DEFAULT 0,
  last_purchase_date timestamptz,
  credit_score integer NOT NULL DEFAULT 0 CHECK (credit_score BETWEEN 0 AND 100),
  credit_limit numeric(15,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ccp_customer ON public.customer_credit_profile(customer_id);

-- 2) credit_scoring_rules
CREATE TABLE public.credit_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_name text NOT NULL UNIQUE,
  weight numeric(3,2) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  min_value numeric,
  max_value numeric,
  score_formula text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) credit_requests
CREATE TABLE public.credit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id),
  requested_amount numeric(15,2) NOT NULL CHECK (requested_amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_requests_customer ON public.credit_requests(customer_id);
CREATE INDEX idx_credit_requests_status ON public.credit_requests(status);

-- 4) credit_score_snapshots
CREATE TABLE public.credit_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  credit_limit numeric(15,2) NOT NULL DEFAULT 0,
  params_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_by uuid REFERENCES public.profiles(id),
  calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_css_customer_calc ON public.credit_score_snapshots(customer_id, calculated_at DESC);

-- updated_at triggers
CREATE TRIGGER trg_ccp_updated BEFORE UPDATE ON public.customer_credit_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_csr_updated BEFORE UPDATE ON public.credit_scoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON public.credit_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.customer_credit_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_score_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccp_read_authed" ON public.customer_credit_profile
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "ccp_write_privileged" ON public.customer_credit_profile
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

CREATE POLICY "csr_read_privileged" ON public.credit_scoring_rules
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));
CREATE POLICY "csr_write_admin_accountant" ON public.credit_scoring_rules
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]));

CREATE POLICY "cr_read_authed" ON public.credit_requests
  FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "cr_insert_sales" ON public.credit_requests
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]));
CREATE POLICY "cr_update_privileged" ON public.credit_requests
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]));

CREATE POLICY "css_read_privileged" ON public.credit_score_snapshots
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));
CREATE POLICY "css_insert_privileged" ON public.credit_score_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]));

-- Seed defaults
INSERT INTO public.credit_scoring_rules (parameter_name, weight, score_formula, is_active) VALUES
  ('purchase_history',  0.30, 'normalize total_purchases vs avg', true),
  ('payment_history',   0.30, 'paid / total_purchases * 100',     true),
  ('late_payments',     0.20, '100 - late_count*10 (min 0)',      true),
  ('recent_activity',   0.10, 'days since last purchase factor',  true),
  ('outstanding_ratio', 0.10, '100 - outstanding/total*100',      true);

-- RPC: calculate credit score
CREATE OR REPLACE FUNCTION public.calculate_credit_score(_customer_id uuid)
RETURNS TABLE(score integer, credit_limit numeric, params jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_total_purchases numeric := 0;
  v_total_paid numeric := 0;
  v_outstanding numeric := 0;
  v_late integer := 0;
  v_last_purchase timestamptz;
  v_avg_purchases numeric := 0;
  v_score numeric := 0;
  v_purchase_score numeric := 0;
  v_payment_score numeric := 0;
  v_late_score numeric := 0;
  v_recent_score numeric := 0;
  v_outstanding_score numeric := 0;
  v_base_limit numeric := 100000000;
  v_final_limit numeric;
  v_params jsonb;
  w_purchase numeric := 0.30;
  w_payment numeric := 0.30;
  w_late numeric := 0.20;
  w_recent numeric := 0.10;
  w_outstanding numeric := 0.10;
BEGIN
  SELECT weight INTO w_purchase FROM credit_scoring_rules WHERE parameter_name='purchase_history' AND is_active;
  SELECT weight INTO w_payment FROM credit_scoring_rules WHERE parameter_name='payment_history' AND is_active;
  SELECT weight INTO w_late FROM credit_scoring_rules WHERE parameter_name='late_payments' AND is_active;
  SELECT weight INTO w_recent FROM credit_scoring_rules WHERE parameter_name='recent_activity' AND is_active;
  SELECT weight INTO w_outstanding FROM credit_scoring_rules WHERE parameter_name='outstanding_ratio' AND is_active;
  w_purchase := COALESCE(w_purchase, 0.30);
  w_payment := COALESCE(w_payment, 0.30);
  w_late := COALESCE(w_late, 0.20);
  w_recent := COALESCE(w_recent, 0.10);
  w_outstanding := COALESCE(w_outstanding, 0.10);

  SELECT COALESCE(SUM(total_amount),0), MAX(issue_date::timestamptz)
    INTO v_total_purchases, v_last_purchase
  FROM invoices
  WHERE customer_id = _customer_id AND status <> 'draft';

  SELECT COALESCE(total_paid,0), COALESCE(outstanding_balance,0), COALESCE(late_payments_count,0)
    INTO v_total_paid, v_outstanding, v_late
  FROM customer_credit_profile WHERE customer_id = _customer_id;

  SELECT COALESCE(AVG(t),0) INTO v_avg_purchases FROM (
    SELECT SUM(total_amount) AS t FROM invoices WHERE status <> 'draft' GROUP BY customer_id
  ) s;

  IF v_avg_purchases > 0 THEN
    v_purchase_score := LEAST(100, (v_total_purchases / v_avg_purchases) * 50);
  END IF;
  IF v_total_purchases > 0 THEN
    v_payment_score := LEAST(100, (v_total_paid / v_total_purchases) * 100);
  ELSE
    v_payment_score := 50;
  END IF;
  v_late_score := GREATEST(0, 100 - v_late * 10);
  IF v_last_purchase IS NOT NULL THEN
    v_recent_score := GREATEST(0, 100 - EXTRACT(DAY FROM (now() - v_last_purchase))::numeric / 3.65);
  ELSE
    v_recent_score := 30;
  END IF;
  IF v_total_purchases > 0 THEN
    v_outstanding_score := GREATEST(0, 100 - (v_outstanding / GREATEST(v_total_purchases,1)) * 100);
  ELSE
    v_outstanding_score := 100;
  END IF;

  v_score := v_purchase_score * w_purchase
           + v_payment_score  * w_payment
           + v_late_score     * w_late
           + v_recent_score   * w_recent
           + v_outstanding_score * w_outstanding;
  v_score := GREATEST(0, LEAST(100, v_score));
  v_final_limit := v_base_limit * (v_score / 100.0);

  v_params := jsonb_build_object(
    'total_purchases', v_total_purchases,
    'total_paid', v_total_paid,
    'outstanding', v_outstanding,
    'late_payments', v_late,
    'avg_purchases', v_avg_purchases,
    'sub_scores', jsonb_build_object(
      'purchase', v_purchase_score, 'payment', v_payment_score,
      'late', v_late_score, 'recent', v_recent_score, 'outstanding', v_outstanding_score
    ),
    'weights', jsonb_build_object(
      'purchase_history', w_purchase, 'payment_history', w_payment,
      'late_payments', w_late, 'recent_activity', w_recent, 'outstanding_ratio', w_outstanding
    ),
    'base_limit', v_base_limit
  );

  INSERT INTO customer_credit_profile (customer_id, total_purchases, last_purchase_date, credit_score, credit_limit)
    VALUES (_customer_id, v_total_purchases, v_last_purchase, ROUND(v_score)::int, ROUND(v_final_limit,2))
    ON CONFLICT (customer_id) DO UPDATE SET
      total_purchases = EXCLUDED.total_purchases,
      last_purchase_date = EXCLUDED.last_purchase_date,
      credit_score = EXCLUDED.credit_score,
      credit_limit = EXCLUDED.credit_limit,
      updated_at = now();

  INSERT INTO credit_score_snapshots (customer_id, score, credit_limit, params_used, calculated_by)
    VALUES (_customer_id, ROUND(v_score)::int, ROUND(v_final_limit,2), v_params, auth.uid());

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (auth.uid(), 'credit_score_calculated', 'customer_credit_profile', _customer_id::text,
            jsonb_build_object('score', ROUND(v_score)::int, 'credit_limit', ROUND(v_final_limit,2)));

  RETURN QUERY SELECT ROUND(v_score)::int, ROUND(v_final_limit,2), v_params;
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_credit_score(uuid) TO authenticated;

-- Audit trigger for rule changes
CREATE OR REPLACE FUNCTION public.audit_credit_rule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (auth.uid(), 'credit_rule_updated', 'credit_scoring_rules', NEW.id::text,
          jsonb_build_object('parameter', NEW.parameter_name, 'weight', NEW.weight, 'is_active', NEW.is_active));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_csr_audit AFTER UPDATE ON public.credit_scoring_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_credit_rule_change();
