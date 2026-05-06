
-- =====================================================================
-- Phase 19.1B — Fix daily-capital compute to honor p_capital_date,
-- and add secure upsert RPC for daily_capital_inputs.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.compute_daily_capital(
  p_capital_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  capital_date              date,
  formula_version           text,
  system_suggested_capital  numeric,
  total_receivables         numeric,
  overdue_receivables       numeric,
  due_today_receivables     numeric,
  future_receivables        numeric,
  total_payables            numeric,
  overdue_payables          numeric,
  due_today_payables        numeric,
  future_payables           numeric,
  input_id                  uuid,
  bank_balance              numeric,
  cash_balance              numeric,
  incoming_checks           numeric,
  outgoing_checks           numeric,
  external_receivables      numeric,
  external_payables         numeric,
  near_term_expenses        numeric,
  risk_reserve              numeric,
  blocked_funds             numeric,
  inventory_liquidity_value numeric,
  manual_adjustment         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i public.daily_capital_inputs%ROWTYPE;
  v_total_r numeric; v_over_r numeric; v_today_r numeric; v_future_r numeric;
  v_total_p numeric; v_over_p numeric; v_today_p numeric; v_future_p numeric;
  v_suggested numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    p_capital_date := CURRENT_DATE;
  END IF;

  SELECT * INTO i FROM public.daily_capital_inputs WHERE capital_date = p_capital_date;

  -- Receivables relative to p_capital_date (SECURITY DEFINER bypasses view grants).
  SELECT
    COALESCE(SUM(outstanding_amount), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date <  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date =  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date >  p_capital_date), 0)
  INTO v_total_r, v_over_r, v_today_r, v_future_r
  FROM public.vw_customer_receivables;

  -- Payables relative to p_capital_date (only unpaid).
  SELECT
    COALESCE(SUM(outstanding_amount), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date <  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date =  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date >  p_capital_date), 0)
  INTO v_total_p, v_over_p, v_today_p, v_future_p
  FROM public.vw_supplier_payables
  WHERE is_paid = false;

  v_suggested :=
      COALESCE(i.bank_balance,0)
    + COALESCE(i.cash_balance,0)
    + COALESCE(i.incoming_checks,0)
    + COALESCE(v_today_r,0)
    + COALESCE(i.external_receivables,0)
    + COALESCE(i.inventory_liquidity_value,0)
    + COALESCE(i.manual_adjustment,0)
    - COALESCE(v_today_p,0)
    - COALESCE(i.outgoing_checks,0)
    - COALESCE(i.external_payables,0)
    - COALESCE(i.near_term_expenses,0)
    - COALESCE(i.risk_reserve,0)
    - COALESCE(i.blocked_funds,0);

  IF v_suggested < 0 THEN v_suggested := 0; END IF;

  capital_date              := p_capital_date;
  formula_version           := 'v1';
  system_suggested_capital  := v_suggested;
  total_receivables         := v_total_r;
  overdue_receivables       := v_over_r;
  due_today_receivables     := v_today_r;
  future_receivables        := v_future_r;
  total_payables            := v_total_p;
  overdue_payables          := v_over_p;
  due_today_payables        := v_today_p;
  future_payables           := v_future_p;
  input_id                  := i.id;
  bank_balance              := COALESCE(i.bank_balance,0);
  cash_balance              := COALESCE(i.cash_balance,0);
  incoming_checks           := COALESCE(i.incoming_checks,0);
  outgoing_checks           := COALESCE(i.outgoing_checks,0);
  external_receivables      := COALESCE(i.external_receivables,0);
  external_payables         := COALESCE(i.external_payables,0);
  near_term_expenses        := COALESCE(i.near_term_expenses,0);
  risk_reserve              := COALESCE(i.risk_reserve,0);
  blocked_funds             := COALESCE(i.blocked_funds,0);
  inventory_liquidity_value := COALESCE(i.inventory_liquidity_value,0);
  manual_adjustment         := COALESCE(i.manual_adjustment,0);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.compute_daily_capital(date) IS
  'Phase 19.1B: read-only compute of daily capital (formula v1). Fully relative to p_capital_date.';

-- ---------- New: secure upsert RPC for daily_capital_inputs ----------
CREATE OR REPLACE FUNCTION public.upsert_daily_capital_input(
  p_capital_date              date,
  p_bank_balance              numeric DEFAULT 0,
  p_cash_balance              numeric DEFAULT 0,
  p_incoming_checks           numeric DEFAULT 0,
  p_outgoing_checks           numeric DEFAULT 0,
  p_external_receivables      numeric DEFAULT 0,
  p_external_payables         numeric DEFAULT 0,
  p_near_term_expenses        numeric DEFAULT 0,
  p_risk_reserve              numeric DEFAULT 0,
  p_blocked_funds             numeric DEFAULT 0,
  p_inventory_liquidity_value numeric DEFAULT 0,
  p_manual_adjustment         numeric DEFAULT 0,
  p_notes                     text    DEFAULT NULL
)
RETURNS public.daily_capital_inputs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.daily_capital_inputs;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;

  -- Disallow negative numeric inputs (defensive; UI may also clamp).
  IF p_bank_balance < 0 OR p_cash_balance < 0 OR p_incoming_checks < 0
     OR p_outgoing_checks < 0 OR p_external_receivables < 0 OR p_external_payables < 0
     OR p_near_term_expenses < 0 OR p_risk_reserve < 0 OR p_blocked_funds < 0
     OR p_inventory_liquidity_value < 0 THEN
    RAISE EXCEPTION 'numeric inputs must be >= 0' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_inputs(
    capital_date, bank_balance, cash_balance, incoming_checks, outgoing_checks,
    external_receivables, external_payables, near_term_expenses, risk_reserve,
    blocked_funds, inventory_liquidity_value, manual_adjustment, notes,
    created_by, updated_by
  ) VALUES (
    p_capital_date, p_bank_balance, p_cash_balance, p_incoming_checks, p_outgoing_checks,
    p_external_receivables, p_external_payables, p_near_term_expenses, p_risk_reserve,
    p_blocked_funds, p_inventory_liquidity_value, p_manual_adjustment, p_notes,
    auth.uid(), auth.uid()
  )
  ON CONFLICT (capital_date) DO UPDATE SET
    bank_balance              = EXCLUDED.bank_balance,
    cash_balance              = EXCLUDED.cash_balance,
    incoming_checks           = EXCLUDED.incoming_checks,
    outgoing_checks           = EXCLUDED.outgoing_checks,
    external_receivables      = EXCLUDED.external_receivables,
    external_payables         = EXCLUDED.external_payables,
    near_term_expenses        = EXCLUDED.near_term_expenses,
    risk_reserve              = EXCLUDED.risk_reserve,
    blocked_funds             = EXCLUDED.blocked_funds,
    inventory_liquidity_value = EXCLUDED.inventory_liquidity_value,
    manual_adjustment         = EXCLUDED.manual_adjustment,
    notes                     = EXCLUDED.notes,
    updated_by                = auth.uid()
  RETURNING * INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_daily_capital_input(
  date, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_daily_capital_input(
  date, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, text
) TO authenticated;

COMMENT ON FUNCTION public.upsert_daily_capital_input(
  date, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, text
) IS 'Phase 19.1B: secure upsert for one daily_capital_inputs row per capital_date. Role-guarded; audit via existing trigger.';
