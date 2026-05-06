-- 1) Add window_months column to credit_scoring_rules (idempotent)
ALTER TABLE public.credit_scoring_rules
  ADD COLUMN IF NOT EXISTS window_months integer NOT NULL DEFAULT 6;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_scoring_rules_window_months_chk'
  ) THEN
    ALTER TABLE public.credit_scoring_rules
      ADD CONSTRAINT credit_scoring_rules_window_months_chk
      CHECK (window_months BETWEEN 1 AND 60);
  END IF;
END $$;

-- 2) Idempotent indexes for new query path
CREATE INDEX IF NOT EXISTS idx_payment_receipt_links_invoice_id ON public.payment_receipt_links(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipt_links_receipt_id ON public.payment_receipt_links(receipt_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_status_date ON public.payment_receipts(status, payment_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON public.invoices(customer_id, status);

-- 3) Rewrite calculate_credit_score (signature unchanged)
CREATE OR REPLACE FUNCTION public.calculate_credit_score(_customer_id uuid)
 RETURNS TABLE(score integer, credit_limit numeric, params jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_months integer := 6;
  v_window_start  timestamptz;

  v_paid_purchase_amount numeric := 0;   -- sum over invoices of LEAST(sum_paid, total_amount), within window
  v_invoice_amount_in_window numeric := 0; -- sum of total_amount for invoices that received any qualifying payment in window
  v_total_purchases_all numeric := 0;     -- legacy: kept for backward compatibility of customer_credit_profile.total_purchases
  v_last_purchase timestamptz;
  v_outstanding numeric := 0;
  v_late integer := 0;

  v_avg_paid numeric := 0;

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
  -- Load weights
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

  -- Resolve window (use payment_history rule's window_months; fallback purchase_history; fallback 6)
  SELECT window_months INTO v_window_months
  FROM credit_scoring_rules
  WHERE parameter_name='payment_history'
  LIMIT 1;
  IF v_window_months IS NULL THEN
    SELECT window_months INTO v_window_months
    FROM credit_scoring_rules
    WHERE parameter_name='purchase_history'
    LIMIT 1;
  END IF;
  v_window_months := COALESCE(v_window_months, 6);
  v_window_start := (CURRENT_DATE - (v_window_months || ' months')::interval)::timestamptz;

  -- Legacy total_purchases (issued, all-time, non-draft) kept so existing UI/profile semantics remain intact
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
    WHERE pr.status IN ('approved','verified','confirmed','posted')
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

  -- Outstanding & late: use existing (cache) profile values for now (Phase 21.3 will refresh late)
  SELECT COALESCE(outstanding_balance,0), COALESCE(late_payments_count,0)
    INTO v_outstanding, v_late
  FROM customer_credit_profile WHERE customer_id = _customer_id;

  -- Average paid_purchase across customers (window-based) for normalization
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
      WHERE pr.status IN ('approved','verified','confirmed','posted')
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
    v_payment_score := 50; -- neutral when no invoices in window
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

  v_score := v_purchase_score * w_purchase
           + v_payment_score  * w_payment
           + v_late_score     * w_late
           + v_recent_score   * w_recent
           + v_outstanding_score * w_outstanding;
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
    'sub_scores', jsonb_build_object(
      'purchase', v_purchase_score, 'payment', v_payment_score,
      'late', v_late_score, 'recent', v_recent_score, 'outstanding', v_outstanding_score
    ),
    'weights', jsonb_build_object(
      'purchase_history', w_purchase, 'payment_history', w_payment,
      'late_payments', w_late, 'recent_activity', w_recent, 'outstanding_ratio', w_outstanding
    ),
    'base_limit', v_base_limit,
    'qualifying_receipt_statuses', jsonb_build_array('approved','verified','confirmed','posted')
  );

  -- Upsert profile: keep total_purchases semantics (issued, all-time), refresh total_paid from window-confirmed
  INSERT INTO customer_credit_profile (customer_id, total_purchases, total_paid, last_purchase_date, credit_score, credit_limit)
    VALUES (_customer_id, v_total_purchases_all, v_paid_purchase_amount, v_last_purchase, ROUND(v_score)::int, ROUND(v_final_limit,2))
    ON CONFLICT (customer_id) DO UPDATE SET
      total_purchases = EXCLUDED.total_purchases,
      total_paid = EXCLUDED.total_paid,
      last_purchase_date = EXCLUDED.last_purchase_date,
      credit_score = EXCLUDED.credit_score,
      credit_limit = EXCLUDED.credit_limit,
      updated_at = now();

  INSERT INTO credit_score_snapshots (customer_id, score, credit_limit, params_used, calculated_by)
    VALUES (_customer_id, ROUND(v_score)::int, ROUND(v_final_limit,2), v_params, auth.uid());

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (auth.uid(), 'credit_score_calculated', 'customer_credit_profile', _customer_id::text,
            jsonb_build_object(
              'score', ROUND(v_score)::int,
              'credit_limit', ROUND(v_final_limit,2),
              'window_months', v_window_months,
              'paid_purchase_amount', v_paid_purchase_amount
            ));

  RETURN QUERY SELECT ROUND(v_score)::int, ROUND(v_final_limit,2), v_params;
END $function$;

-- 4) Re-assert security from Phase 21.1B (CREATE OR REPLACE preserves grants, but be explicit)
REVOKE ALL ON FUNCTION public.calculate_credit_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_credit_score(uuid) TO authenticated;

COMMENT ON FUNCTION public.calculate_credit_score(uuid) IS
'Phase 21.2: Credit score based on confirmed paid purchases within configurable window (default 6 months). Qualifying receipt statuses: approved, verified, confirmed, posted. Per-invoice paid amount capped at invoice total_amount. Late/early settlement is deferred to Phase 21.3.';