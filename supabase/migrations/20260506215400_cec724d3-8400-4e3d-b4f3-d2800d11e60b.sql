
-- Phase 21.3: settlement speed scoring + late payments penalty (active)
-- Adjust rule weights and activate late_payments; add settlement_speed rule
INSERT INTO public.credit_scoring_rules (parameter_name, weight, is_active, window_months)
VALUES ('settlement_speed', 0.20, true, 6)
ON CONFLICT (parameter_name) DO UPDATE SET
  weight = EXCLUDED.weight,
  is_active = EXCLUDED.is_active,
  window_months = COALESCE(public.credit_scoring_rules.window_months, EXCLUDED.window_months);

UPDATE public.credit_scoring_rules SET weight = 0.25, is_active = true WHERE parameter_name = 'purchase_history';
UPDATE public.credit_scoring_rules SET weight = 0.25, is_active = true WHERE parameter_name = 'payment_history';
UPDATE public.credit_scoring_rules SET weight = 0.10, is_active = true WHERE parameter_name = 'late_payments';
UPDATE public.credit_scoring_rules SET weight = 0.10, is_active = true WHERE parameter_name = 'recent_activity';
UPDATE public.credit_scoring_rules SET weight = 0.10, is_active = true WHERE parameter_name = 'outstanding_ratio';

-- Rewrite calculate_credit_score to add settlement speed + recompute late_payments_count
CREATE OR REPLACE FUNCTION public.calculate_credit_score(_customer_id uuid)
 RETURNS TABLE(score integer, credit_limit numeric, params jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_months integer := 6;
  v_window_start  timestamptz;

  v_paid_purchase_amount numeric := 0;
  v_invoice_amount_in_window numeric := 0;
  v_total_purchases_all numeric := 0;
  v_last_purchase timestamptz;
  v_outstanding numeric := 0;
  v_late integer := 0;

  v_avg_paid numeric := 0;

  -- settlement speed
  v_avg_delta_days numeric := NULL;     -- weighted average (by paid amount) delta_days
  v_early_count    integer := 0;
  v_ontime_count   integer := 0;
  v_late_pay_count integer := 0;        -- payment events with delta>0 (informational)
  v_settlement_score numeric := 50;     -- neutral when no data

  v_score numeric := 0;
  v_purchase_score numeric := 0;
  v_payment_score numeric := 0;
  v_late_score numeric := 0;
  v_recent_score numeric := 0;
  v_outstanding_score numeric := 0;
  v_base_limit numeric := 100000000;
  v_final_limit numeric;
  v_params jsonb;

  w_purchase    numeric := 0.25;
  w_payment     numeric := 0.25;
  w_late        numeric := 0.10;
  w_recent      numeric := 0.10;
  w_outstanding numeric := 0.10;
  w_settlement  numeric := 0.20;
BEGIN
  -- Load weights
  SELECT weight INTO w_purchase    FROM credit_scoring_rules WHERE parameter_name='purchase_history' AND is_active;
  SELECT weight INTO w_payment     FROM credit_scoring_rules WHERE parameter_name='payment_history'  AND is_active;
  SELECT weight INTO w_late        FROM credit_scoring_rules WHERE parameter_name='late_payments'    AND is_active;
  SELECT weight INTO w_recent      FROM credit_scoring_rules WHERE parameter_name='recent_activity'  AND is_active;
  SELECT weight INTO w_outstanding FROM credit_scoring_rules WHERE parameter_name='outstanding_ratio' AND is_active;
  SELECT weight INTO w_settlement  FROM credit_scoring_rules WHERE parameter_name='settlement_speed' AND is_active;
  w_purchase    := COALESCE(w_purchase, 0.25);
  w_payment     := COALESCE(w_payment, 0.25);
  w_late        := COALESCE(w_late, 0);
  w_recent      := COALESCE(w_recent, 0.10);
  w_outstanding := COALESCE(w_outstanding, 0.10);
  w_settlement  := COALESCE(w_settlement, 0);

  -- Resolve window
  SELECT window_months INTO v_window_months FROM credit_scoring_rules WHERE parameter_name='payment_history' LIMIT 1;
  IF v_window_months IS NULL THEN
    SELECT window_months INTO v_window_months FROM credit_scoring_rules WHERE parameter_name='purchase_history' LIMIT 1;
  END IF;
  v_window_months := COALESCE(v_window_months, 6);
  v_window_start := (CURRENT_DATE - (v_window_months || ' months')::interval)::timestamptz;

  -- Legacy total_purchases (issued, all-time, non-draft/cancelled)
  SELECT COALESCE(SUM(total_amount),0), MAX(issue_date::timestamptz)
    INTO v_total_purchases_all, v_last_purchase
  FROM invoices
  WHERE customer_id = _customer_id
    AND COALESCE(status,'') NOT IN ('draft','cancelled');

  -- Per-invoice qualifying payments inside window
  WITH inv AS (
    SELECT i.id, i.total_amount
    FROM invoices i
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
  ),
  pay AS (
    SELECT prl.invoice_id, COALESCE(SUM(prl.amount),0) AS paid_in_window
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    WHERE pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
      AND prl.invoice_id IN (SELECT id FROM inv)
    GROUP BY prl.invoice_id
  )
  SELECT
    COALESCE(SUM(LEAST(p.paid_in_window, inv.total_amount)),0),
    COALESCE(SUM(inv.total_amount) FILTER (WHERE p.paid_in_window > 0),0)
  INTO v_paid_purchase_amount, v_invoice_amount_in_window
  FROM inv
  LEFT JOIN pay p ON p.invoice_id = inv.id;

  -- Outstanding from cache (refresh deferred)
  SELECT COALESCE(outstanding_balance,0)
    INTO v_outstanding
  FROM customer_credit_profile WHERE customer_id = _customer_id;

  -- Settlement speed: weighted avg delta_days = payment_date - due_date
  -- Each qualifying payment-link in window where invoice has a due_date
  WITH ev AS (
    SELECT
      prl.amount AS w,
      (pr.payment_date - i.due_date)::int AS delta_days
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    JOIN invoices i ON i.id = prl.invoice_id
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
      AND i.due_date IS NOT NULL
      AND pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
      AND COALESCE(prl.amount,0) > 0
  )
  SELECT
    CASE WHEN COALESCE(SUM(w),0) > 0
         THEN SUM(w * delta_days) / SUM(w)
         ELSE NULL END,
    COALESCE(SUM(CASE WHEN delta_days < 0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN delta_days = 0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN delta_days > 0 THEN 1 ELSE 0 END),0)
  INTO v_avg_delta_days, v_early_count, v_ontime_count, v_late_pay_count
  FROM ev;

  IF v_avg_delta_days IS NULL THEN
    v_settlement_score := 50; -- neutral when no qualifying payments
  ELSE
    v_settlement_score := GREATEST(0, LEAST(100, 50 + ((-v_avg_delta_days) * 2)));
  END IF;

  -- late_payments_count: invoices whose latest qualifying payment is > 7 days after due_date (window-scoped)
  WITH last_pay AS (
    SELECT prl.invoice_id, MAX(pr.payment_date) AS last_payment_date
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    JOIN invoices i ON i.id = prl.invoice_id
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
      AND i.due_date IS NOT NULL
      AND pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
    GROUP BY prl.invoice_id
  )
  SELECT COUNT(*)::int INTO v_late
  FROM last_pay lp
  JOIN invoices i ON i.id = lp.invoice_id
  WHERE (lp.last_payment_date - i.due_date) > 7;

  v_late := COALESCE(v_late, 0);

  -- Average paid_purchase across customers (window-based)
  SELECT COALESCE(AVG(t),0) INTO v_avg_paid FROM (
    SELECT COALESCE(SUM(LEAST(p.paid_in_window, inv.total_amount)),0) AS t
    FROM (
      SELECT i.id, i.customer_id, i.total_amount
      FROM invoices i
      WHERE COALESCE(i.status,'') NOT IN ('draft','cancelled')
    ) inv
    LEFT JOIN (
      SELECT prl.invoice_id, COALESCE(SUM(prl.amount),0) AS paid_in_window
      FROM payment_receipt_links prl
      JOIN payment_receipts pr ON pr.id = prl.receipt_id
      WHERE pr.status::text IN ('approved','verified','confirmed','posted')
        AND pr.payment_date >= v_window_start::date
      GROUP BY prl.invoice_id
    ) p ON p.invoice_id = inv.id
    GROUP BY inv.customer_id
  ) s;

  -- Sub-scores
  IF v_avg_paid > 0 THEN
    v_purchase_score := LEAST(100, (v_paid_purchase_amount / v_avg_paid) * 50);
  ELSIF v_paid_purchase_amount > 0 THEN
    v_purchase_score := 50;
  ELSE
    v_purchase_score := 0;
  END IF;

  IF v_invoice_amount_in_window > 0 THEN
    v_payment_score := LEAST(100, (v_paid_purchase_amount / v_invoice_amount_in_window) * 100);
  ELSE
    v_payment_score := 50;
  END IF;

  v_late_score := GREATEST(0, 100 - v_late * 10);

  IF v_last_purchase IS NOT NULL THEN
    v_recent_score := GREATEST(0, 100 - EXTRACT(DAY FROM (now() - v_last_purchase))::numeric / 3.65);
  ELSE
    v_recent_score := 30;
  END IF;

  IF v_total_purchases_all > 0 THEN
    v_outstanding_score := GREATEST(0, 100 - (v_outstanding / GREATEST(v_total_purchases_all,1)) * 100);
  ELSE
    v_outstanding_score := 100;
  END IF;

  v_score := v_purchase_score    * w_purchase
           + v_payment_score     * w_payment
           + v_late_score        * w_late
           + v_recent_score      * w_recent
           + v_outstanding_score * w_outstanding
           + v_settlement_score  * w_settlement;
  v_score := GREATEST(0, LEAST(100, v_score));
  v_final_limit := v_base_limit * (v_score / 100.0);

  v_params := jsonb_build_object(
    'window_months', v_window_months,
    'window_start', v_window_start,
    'paid_purchase_amount', v_paid_purchase_amount,
    'invoice_amount_in_window', v_invoice_amount_in_window,
    'total_purchases_all_time', v_total_purchases_all,
    'outstanding', v_outstanding,
    'late_payments', v_late,
    'avg_paid_purchase', v_avg_paid,
    'settlement', jsonb_build_object(
      'avg_delta_days', v_avg_delta_days,
      'early_payments', v_early_count,
      'ontime_payments', v_ontime_count,
      'late_payment_events', v_late_pay_count,
      'late_invoices_gt_7d', v_late
    ),
    'sub_scores', jsonb_build_object(
      'purchase', v_purchase_score, 'payment', v_payment_score,
      'late', v_late_score, 'recent', v_recent_score,
      'outstanding', v_outstanding_score, 'settlement', v_settlement_score
    ),
    'weights', jsonb_build_object(
      'purchase_history', w_purchase, 'payment_history', w_payment,
      'late_payments', w_late, 'recent_activity', w_recent,
      'outstanding_ratio', w_outstanding, 'settlement_speed', w_settlement
    ),
    'base_limit', v_base_limit,
    'qualifying_receipt_statuses', jsonb_build_array('approved','verified','confirmed','posted')
  );

  -- Upsert profile (now also refreshing late_payments_count)
  INSERT INTO customer_credit_profile (customer_id, total_purchases, total_paid, last_purchase_date, credit_score, credit_limit, late_payments_count)
    VALUES (_customer_id, v_total_purchases_all, v_paid_purchase_amount, v_last_purchase, ROUND(v_score)::int, ROUND(v_final_limit,2), v_late)
    ON CONFLICT (customer_id) DO UPDATE SET
      total_purchases = EXCLUDED.total_purchases,
      total_paid = EXCLUDED.total_paid,
      last_purchase_date = EXCLUDED.last_purchase_date,
      credit_score = EXCLUDED.credit_score,
      credit_limit = EXCLUDED.credit_limit,
      late_payments_count = EXCLUDED.late_payments_count,
      updated_at = now();

  INSERT INTO credit_score_snapshots (customer_id, score, credit_limit, params_used, calculated_by)
    VALUES (_customer_id, ROUND(v_score)::int, ROUND(v_final_limit,2), v_params, auth.uid());

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (auth.uid(), 'credit_score_calculated', 'customer_credit_profile', _customer_id::text,
            jsonb_build_object(
              'score', ROUND(v_score)::int,
              'credit_limit', ROUND(v_final_limit,2),
              'window_months', v_window_months,
              'paid_purchase_amount', v_paid_purchase_amount,
              'avg_delta_days', v_avg_delta_days,
              'late_invoices_gt_7d', v_late
            ));

  RETURN QUERY SELECT ROUND(v_score)::int, ROUND(v_final_limit,2), v_params;
END $function$;

COMMENT ON FUNCTION public.calculate_credit_score(uuid) IS
'Phase 21.3: امتیاز اعتبار با احتساب سرعت تسویه (settlement_speed) و جریمه دیرکرد (late_payments). فقط پرداخت‌های تأییدشده (approved/verified/confirmed/posted) در پنجره ماه‌های قابل تنظیم محاسبه می‌شوند. late_payments_count بر اساس فاکتورهایی که آخرین پرداختشان بیش از ۷ روز بعد از due_date بوده در همین تابع refresh می‌شود.';

REVOKE EXECUTE ON FUNCTION public.calculate_credit_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_credit_score(uuid) TO authenticated;
