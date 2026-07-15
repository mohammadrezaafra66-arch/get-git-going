CREATE OR REPLACE FUNCTION public.compute_daily_capital(p_capital_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(capital_date date, formula_version text, system_suggested_capital numeric, total_receivables numeric, overdue_receivables numeric, due_today_receivables numeric, future_receivables numeric, total_payables numeric, overdue_payables numeric, due_today_payables numeric, future_payables numeric, input_id uuid, bank_balance numeric, cash_balance numeric, incoming_checks numeric, outgoing_checks numeric, external_receivables numeric, external_payables numeric, near_term_expenses numeric, risk_reserve numeric, blocked_funds numeric, inventory_liquidity_value numeric, manual_adjustment numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT * INTO i FROM public.daily_capital_inputs d WHERE d.capital_date = p_capital_date;

  SELECT
    COALESCE(SUM(outstanding_amount), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date <  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date =  p_capital_date), 0),
    COALESCE(SUM(outstanding_amount) FILTER (WHERE due_date >  p_capital_date), 0)
  INTO v_total_r, v_over_r, v_today_r, v_future_r
  FROM public.vw_customer_receivables;

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
$function$;