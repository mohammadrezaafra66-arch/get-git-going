SET
Output format is unaligned.
CREATE OR REPLACE FUNCTION public._ensure_credit_balance(p_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customer_credit_balance (customer_id, available_credit, held_credit)
  VALUES (
    p_customer_id,
    COALESCE((SELECT credit_limit FROM public.customer_credit_profile WHERE customer_id = p_customer_id LIMIT 1), 0),
    0
  )
  ON CONFLICT (customer_id) DO NOTHING;
END;
$function$


-- ============================================================

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

  -- (a) Legacy total_purchases (issued, all-time): non-draft/cancelled invoices
  --     UNION accepted sales quotes. A quote has no issue_date; created_at is
  --     the moment the customer committed to that amount.
  SELECT COALESCE(SUM(d.total_amount),0), MAX(d.doc_date)
    INTO v_total_purchases_all, v_last_purchase
  FROM (
    SELECT i.total_amount, i.issue_date::timestamptz AS doc_date
      FROM invoices i
     WHERE i.customer_id = _customer_id
       AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
    UNION ALL
    SELECT q.final_amount, q.created_at
      FROM sales_quotes q
     WHERE q.customer_id = _customer_id
       AND q.status = 'accepted'
  ) d;

  -- (b) Per-document qualifying payments inside window
  WITH doc AS (
    SELECT i.id, i.total_amount
    FROM invoices i
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
    UNION ALL
    SELECT q.id, q.final_amount
    FROM sales_quotes q
    WHERE q.customer_id = _customer_id
      AND q.status = 'accepted'
  ),
  pay AS (
    SELECT COALESCE(prl.invoice_id, prl.quote_id) AS doc_id,
           COALESCE(SUM(prl.amount),0) AS paid_in_window
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    WHERE pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
      AND COALESCE(prl.invoice_id, prl.quote_id) IN (SELECT id FROM doc)
    GROUP BY COALESCE(prl.invoice_id, prl.quote_id)
  )
  -- COALESCE inside LEAST is required, not decorative: LEAST() IGNORES NULLs,
  -- so an unpaid document (no matching `pay` row) made LEAST(NULL, total_amount)
  -- collapse to total_amount and counted the document's full value as PAID.
  -- Dormant while invoices had 0 rows; live the moment quotes joined the union.
  SELECT
    COALESCE(SUM(LEAST(COALESCE(p.paid_in_window,0), doc.total_amount)),0),
    COALESCE(SUM(doc.total_amount) FILTER (WHERE p.paid_in_window > 0),0)
  INTO v_paid_purchase_amount, v_invoice_amount_in_window
  FROM doc
  LEFT JOIN pay p ON p.doc_id = doc.id;

  -- Outstanding from cache (refresh deferred).
  -- SELECT INTO with no matching row assigns NULL, defeating the COALESCE and
  -- the DECLARE default; a customer being scored for the first time then got
  -- outstanding_score = 0 (GREATEST(0, NULL)) instead of 100, and self-healed
  -- only on the second run. Re-COALESCE after the assignment.
  SELECT COALESCE(outstanding_balance,0)
    INTO v_outstanding
  FROM customer_credit_profile WHERE customer_id = _customer_id;
  v_outstanding := COALESCE(v_outstanding, 0);

  -- (c) Settlement speed: weighted avg delta_days = payment_date - due_date
  --     Each qualifying payment-link in window whose document carries a due date
  --     (invoice.due_date, or quote.expires_at for an accepted quote).
  WITH doc AS (
    SELECT i.id, i.due_date
    FROM invoices i
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
    UNION ALL
    SELECT q.id, q.expires_at::date
    FROM sales_quotes q
    WHERE q.customer_id = _customer_id
      AND q.status = 'accepted'
  ),
  ev AS (
    SELECT
      prl.amount AS w,
      (pr.payment_date - d.due_date)::int AS delta_days
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    JOIN doc d ON d.id = COALESCE(prl.invoice_id, prl.quote_id)
    WHERE d.due_date IS NOT NULL
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

  -- (d) late_payments_count: documents whose latest qualifying payment is
  --     > 7 days after their due date (window-scoped)
  WITH doc AS (
    SELECT i.id, i.due_date
    FROM invoices i
    WHERE i.customer_id = _customer_id
      AND COALESCE(i.status,'') NOT IN ('draft','cancelled')
    UNION ALL
    SELECT q.id, q.expires_at::date
    FROM sales_quotes q
    WHERE q.customer_id = _customer_id
      AND q.status = 'accepted'
  ),
  last_pay AS (
    SELECT COALESCE(prl.invoice_id, prl.quote_id) AS doc_id,
           MAX(pr.payment_date) AS last_payment_date
    FROM payment_receipt_links prl
    JOIN payment_receipts pr ON pr.id = prl.receipt_id
    JOIN doc d ON d.id = COALESCE(prl.invoice_id, prl.quote_id)
    WHERE d.due_date IS NOT NULL
      AND pr.status::text IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_window_start::date
    GROUP BY COALESCE(prl.invoice_id, prl.quote_id)
  )
  SELECT COUNT(*)::int INTO v_late
  FROM last_pay lp
  JOIN doc d ON d.id = lp.doc_id
  WHERE (lp.last_payment_date - d.due_date) > 7;

  v_late := COALESCE(v_late, 0);

  -- (e) Average paid_purchase across customers (window-based). Must span the
  --     same document universe as (b), otherwise this customer's quote-funded
  --     paid amount would be normalised against an invoice-only average.
  SELECT COALESCE(AVG(t),0) INTO v_avg_paid FROM (
    -- same LEAST()-ignores-NULL fix as (b)
    SELECT COALESCE(SUM(LEAST(COALESCE(p.paid_in_window,0), alldoc.total_amount)),0) AS t
    FROM (
      SELECT i.id, i.customer_id, i.total_amount
      FROM invoices i
      WHERE COALESCE(i.status,'') NOT IN ('draft','cancelled')
      UNION ALL
      SELECT q.id, q.customer_id, q.final_amount
      FROM sales_quotes q
      WHERE q.status = 'accepted'
    ) alldoc
    LEFT JOIN (
      SELECT COALESCE(prl.invoice_id, prl.quote_id) AS doc_id,
             COALESCE(SUM(prl.amount),0) AS paid_in_window
      FROM payment_receipt_links prl
      JOIN payment_receipts pr ON pr.id = prl.receipt_id
      WHERE pr.status::text IN ('approved','verified','confirmed','posted')
        AND pr.payment_date >= v_window_start::date
      GROUP BY COALESCE(prl.invoice_id, prl.quote_id)
    ) p ON p.doc_id = alldoc.id
    GROUP BY alldoc.customer_id
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
    'qualifying_receipt_statuses', jsonb_build_array('approved','verified','confirmed','posted'),
    'document_sources', jsonb_build_array('invoice','accepted_sales_quote')
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
END $function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_customer_realtime_credit(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_responsible uuid;
  v_credit_limit numeric;
  v_has_overdue boolean;
  v_capital_date date;
  v_capital_setting_id uuid;
  v_allocated_capital numeric;
  v_score jsonb;
  v_weighted numeric;
  v_params_evaluated int;
  v_params_active int;
  v_breakdown jsonb;
  v_sum_scores numeric;
  v_self_snapshot numeric := 0;
  v_share_ratio numeric;
  v_raw_allocation numeric := 0;
  v_final_limit numeric := 0;
  v_binding text := 'formula';
  v_is_stale boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin')
    OR public.has_role(v_caller, 'manager')
    OR public.has_role(v_caller, 'accountant')
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires admin, manager, or accountant';
  END IF;

  SELECT c.responsible_id,
         COALESCE(cp.credit_limit, 0),
         COALESCE(cp.has_overdue, false)
  INTO v_responsible, v_credit_limit, v_has_overdue
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile cp ON cp.customer_id = c.id
  WHERE c.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id;
  END IF;

  IF v_has_overdue THEN
    RETURN jsonb_build_object(
      'weighted_score', 0, 'params_evaluated', 0, 'params_active', 0,
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'overdue', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', '[]'::jsonb
    );
  END IF;

  IF v_responsible IS NULL THEN
    RETURN jsonb_build_object(
      'weighted_score', 0, 'params_evaluated', 0, 'params_active', 0,
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'no_salesperson', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', '[]'::jsonb
    );
  END IF;

  -- Latest salesperson capital snapshot via JOIN to daily_capital_settings
  SELECT dcs.capital_date, sca.capital_setting_id, sca.allocated_capital
  INTO v_capital_date, v_capital_setting_id, v_allocated_capital
  FROM public.salesperson_capital_allocations_dynamic sca
  JOIN public.daily_capital_settings dcs ON dcs.id = sca.capital_setting_id
  WHERE sca.salesperson_id = v_responsible
  ORDER BY dcs.capital_date DESC, sca.created_at DESC
  LIMIT 1;

  IF v_capital_date IS NULL THEN
    v_score := public.calculate_dynamic_score('customer', p_customer_id, CURRENT_DATE);
    RETURN jsonb_build_object(
      'weighted_score', COALESCE((v_score->>'weighted_score')::numeric, 0),
      'params_evaluated', COALESCE((v_score->>'params_evaluated')::int, 0),
      'params_active', COALESCE((v_score->>'params_active')::int, 0),
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'no_capital', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', COALESCE(v_score->'breakdown', '[]'::jsonb)
    );
  END IF;

  v_is_stale := v_capital_date < CURRENT_DATE;

  v_score := public.calculate_dynamic_score('customer', p_customer_id, v_capital_date);
  v_weighted         := COALESCE((v_score->>'weighted_score')::numeric, 0);
  v_params_evaluated := COALESCE((v_score->>'params_evaluated')::int, 0);
  v_params_active    := COALESCE((v_score->>'params_active')::int, 0);
  v_breakdown        := COALESCE(v_score->'breakdown', '[]'::jsonb);

  -- Peers' snapshot sum within the same capital setting
  SELECT COALESCE(SUM(cad.weighted_score), 0)
  INTO v_sum_scores
  FROM public.customer_capital_allocations_dynamic cad
  WHERE cad.salesperson_id = v_responsible
    AND cad.capital_setting_id = v_capital_setting_id;

  SELECT COALESCE(cad.weighted_score, 0)
  INTO v_self_snapshot
  FROM public.customer_capital_allocations_dynamic cad
  WHERE cad.salesperson_id = v_responsible
    AND cad.capital_setting_id = v_capital_setting_id
    AND cad.customer_id = p_customer_id
  LIMIT 1;

  v_sum_scores := GREATEST(0, v_sum_scores - v_self_snapshot) + v_weighted;

  IF v_sum_scores > 0 AND v_weighted > 0 THEN
    v_share_ratio := v_weighted / v_sum_scores;
    v_raw_allocation := ROUND(v_allocated_capital * v_share_ratio);
  ELSE
    v_share_ratio := 0;
    v_raw_allocation := 0;
  END IF;

  IF v_credit_limit > 0 AND v_credit_limit <= v_raw_allocation THEN
    v_final_limit := v_credit_limit;
    v_binding := 'credit_limit';
  ELSE
    v_final_limit := v_raw_allocation;
    v_binding := 'formula';
  END IF;

  RETURN jsonb_build_object(
    'weighted_score', v_weighted,
    'params_evaluated', v_params_evaluated,
    'params_active', v_params_active,
    'final_limit', v_final_limit,
    'raw_allocation', v_raw_allocation,
    'credit_limit', v_credit_limit,
    'binding_constraint', v_binding,
    'capital_date_used', v_capital_date,
    'is_capital_stale', v_is_stale,
    'salesperson_allocated_capital', v_allocated_capital,
    'share_ratio', v_share_ratio,
    'breakdown', v_breakdown
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.can_use_customer_capital_allocation(p_customer_id uuid, p_amount numeric)
 RETURNS TABLE(can_use boolean, available numeric, customer_allocation_id uuid, salesperson_allocation_id uuid, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'هیچ snapshot سرمایه فعال وجود ندارد'::text;
    RETURN;
  END IF;

  SELECT id, salesperson_id, final_limit
    INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_id = p_customer_id;
  IF _cca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'مشتری در snapshot فعال تخصیص ندارد'::text;
    RETURN;
  END IF;
  IF _cca.salesperson_id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'کارشناس فروش برای مشتری تعیین نشده'::text;
    RETURN;
  END IF;

  SELECT id, allocated_capital INTO _sca
    FROM public.salesperson_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND salesperson_id = _cca.salesperson_id;
  IF _sca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'کارشناس در snapshot فعال تخصیص ندارد'::text;
    RETURN;
  END IF;

  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca.id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca.id);
  _c_avail := COALESCE(_cca.final_limit,0) - _c_held - _c_cons;
  _s_avail := COALESCE(_sca.allocated_capital,0) - _s_held - _s_cons;

  IF p_amount > _c_avail OR p_amount > _s_avail THEN
    RETURN QUERY SELECT false, LEAST(_c_avail,_s_avail), _cca.id, _sca.id,
      ('سهم سرمایه کافی نیست (مشتری: '||_c_avail||'، فروشنده: '||_s_avail||')')::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, LEAST(_c_avail,_s_avail), _cca.id, _sca.id, 'ok'::text;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_customer_capital_allocations(p_salesperson_allocation_id uuid)
 RETURNS TABLE(salesperson_allocation_id uuid, capital_snapshot_id uuid, capital_date date, salesperson_id uuid, salesperson_final_amount numeric, customer_id uuid, customer_score numeric, total_customer_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  RETURN QUERY
  SELECT
    v_alloc.id,
    v_alloc.capital_snapshot_id,
    v_alloc.capital_date,
    v_alloc.salesperson_id,
    v_alloc.final_amount,
    c.id,
    COALESCE(ccp.credit_score, 0)::numeric,
    v_total,
    CASE
      WHEN v_total > 0 AND COALESCE(ccp.credit_score,0) > 0
        THEN ROUND(v_alloc.final_amount * COALESCE(ccp.credit_score,0)::numeric / v_total)
      ELSE 0
    END
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true
  ORDER BY COALESCE(ccp.credit_score,0) DESC, c.id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.get_customer_credit(p_customer_id uuid)
 RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  RETURN QUERY
  SELECT
    b.available_credit,
    b.held_credit,
    COALESCE(p.total_purchases, 0)::numeric,
    COALESCE(p.outstanding_balance, 0)::numeric
  FROM public.customer_credit_balance b
  LEFT JOIN public.customer_credit_profile p ON p.customer_id = b.customer_id
  WHERE b.customer_id = p_customer_id;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.get_customer_dynamic_credit(p_customer_id uuid)
 RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric, settlement_score integer, has_overdue boolean, overdue_since date, final_limit numeric, capital_date date, binding_constraint text, has_allocation boolean, is_today boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_final_limit numeric := 0;
  v_capital_date date;
  v_binding text;
  v_has_alloc boolean := false;
  v_is_today boolean := false;
  v_held numeric := 0;
  v_outstanding numeric := 0;
  v_total_purchases numeric := 0;
  v_settlement_score integer := 0;
  v_has_overdue boolean := false;
  v_overdue_since date;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  -- Latest dynamic allocation (any date, newest first)
  SELECT a.final_limit, s.capital_date, a.binding_constraint
    INTO v_final_limit, v_capital_date, v_binding
  FROM public.customer_capital_allocations_dynamic a
  JOIN public.daily_capital_settings s ON s.id = a.capital_setting_id
  WHERE a.customer_id = p_customer_id
  ORDER BY s.capital_date DESC, a.created_at DESC
  LIMIT 1;

  IF v_final_limit IS NOT NULL THEN
    v_has_alloc := true;
    v_is_today := (v_capital_date = CURRENT_DATE);
  ELSE
    v_final_limit := 0;
  END IF;

  SELECT COALESCE(b.held_credit, 0) INTO v_held
  FROM public.customer_credit_balance b
  WHERE b.customer_id = p_customer_id;

  SELECT
    COALESCE(p.outstanding_balance, 0),
    COALESCE(p.total_purchases, 0),
    COALESCE(p.settlement_score, 0),
    COALESCE(p.has_overdue, false),
    p.overdue_since
  INTO v_outstanding, v_total_purchases, v_settlement_score, v_has_overdue, v_overdue_since
  FROM public.customer_credit_profile p
  WHERE p.customer_id = p_customer_id;

  RETURN QUERY SELECT
    GREATEST(v_final_limit - COALESCE(v_outstanding, 0) - COALESCE(v_held, 0), 0)::numeric AS available_credit,
    COALESCE(v_held, 0)::numeric AS held_credit,
    COALESCE(v_total_purchases, 0)::numeric AS total_purchases,
    COALESCE(v_outstanding, 0)::numeric AS outstanding_balance,
    COALESCE(v_settlement_score, 0)::integer AS settlement_score,
    COALESCE(v_has_overdue, false)::boolean AS has_overdue,
    v_overdue_since AS overdue_since,
    COALESCE(v_final_limit, 0)::numeric AS final_limit,
    v_capital_date AS capital_date,
    COALESCE(v_binding, '')::text AS binding_constraint,
    v_has_alloc AS has_allocation,
    v_is_today AS is_today;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.hold_capital_allocation(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN RAISE EXCEPTION 'هیچ snapshot سرمایه فعال وجود ندارد'; END IF;

  SELECT id, salesperson_id, final_limit INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_id = p_customer_id
   FOR UPDATE;
  IF _cca.id IS NULL THEN RAISE EXCEPTION 'مشتری در snapshot فعال تخصیص ندارد'; END IF;
  IF _cca.salesperson_id IS NULL THEN RAISE EXCEPTION 'کارشناس فروش برای مشتری تعیین نشده'; END IF;

  SELECT id, allocated_capital INTO _sca
    FROM public.salesperson_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND salesperson_id = _cca.salesperson_id
   FOR UPDATE;
  IF _sca.id IS NULL THEN RAISE EXCEPTION 'کارشناس در snapshot فعال تخصیص ندارد'; END IF;

  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca.id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca.id);
  _c_avail := COALESCE(_cca.final_limit,0) - _c_held - _c_cons;
  _s_avail := COALESCE(_sca.allocated_capital,0) - _s_held - _s_cons;
  IF p_amount > _c_avail THEN RAISE EXCEPTION 'سهم سرمایه مشتری کافی نیست (مانده: %)', _c_avail; END IF;
  IF p_amount > _s_avail THEN RAISE EXCEPTION 'سهم سرمایه فروشنده کافی نیست (مانده: %)', _s_avail; END IF;

  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('customer', _cca.id, 'hold', p_amount,
          _c_held, _c_held + p_amount, _c_cons, _c_cons,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('customer_id', p_customer_id, 'setting_id', _snap));

  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('salesperson', _sca.id, 'hold', p_amount,
          _s_held, _s_held + p_amount, _s_cons, _s_cons,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('salesperson_id', _cca.salesperson_id, 'setting_id', _snap, 'customer_allocation_id', _cca.id));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()), 'capital_allocation_hold', 'invoice', p_invoice_id::text,
          jsonb_build_object('amount', p_amount, 'customer_allocation_id', _cca.id, 'salesperson_allocation_id', _sca.id));
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.hold_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'اعتبار کافی نیست (موجودی: %، درخواست: %)', v_available, p_amount;
  END IF;

  v_new_available := v_available - p_amount;
  v_new_held := v_held + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'hold', -p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'مسدودسازی اعتبار برای پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_hold',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.increase_credit(p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای افزایش اعتبار';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'payment', p_amount, v_available, v_new_available, 'receipt', p_receipt_id, 'افزایش اعتبار با تأیید فیش واریزی', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_payment',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'receipt_id', p_receipt_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.list_trusted_credit_customers(p_search text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_min_total_purchases numeric DEFAULT NULL::numeric, p_max_total_purchases numeric DEFAULT NULL::numeric, p_min_allowed_credit numeric DEFAULT NULL::numeric, p_max_allowed_credit numeric DEFAULT NULL::numeric, p_min_outstanding_balance numeric DEFAULT NULL::numeric, p_max_outstanding_balance numeric DEFAULT NULL::numeric, p_min_credit_score integer DEFAULT NULL::integer, p_max_credit_score integer DEFAULT NULL::integer, p_only_trusted boolean DEFAULT false, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, easy_code text, responsible_id uuid, responsible_name text, total_purchases numeric, credit_score integer, credit_limit numeric, available_credit numeric, held_credit numeric, outstanding_balance numeric, computed_allowed_credit numeric, has_active_overdue boolean, overdue_amount numeric, overdue_count integer, oldest_due_date date, is_trusted boolean, status_code text, status_reason text, total_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH authz AS (
    SELECT public.has_any_role(
      auth.uid(),
      ARRAY[
        'admin'::public.app_role,
        'manager'::public.app_role,
        'accountant'::public.app_role,
        'sales'::public.app_role,
        'viewer'::public.app_role
      ]
    ) AS allowed
  ),
  overdue AS (
    SELECT
      customer_id,
      COALESCE(SUM(outstanding_amount), 0)::numeric AS overdue_amount,
      COUNT(*)::int AS overdue_count,
      MIN(due_date)::date AS oldest_due_date
    FROM public.vw_customer_receivables
    WHERE is_overdue = true
      AND outstanding_amount > 0
    GROUP BY customer_id
  ),
  base AS (
    SELECT
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone,
      c.accounting_code AS easy_code,
      c.responsible_id,
      rp.full_name AS responsible_name,
      COALESCE(ccp.total_purchases, 0)::numeric AS total_purchases,
      COALESCE(ccp.credit_score, 0)::int AS credit_score,
      COALESCE(ccp.credit_limit, 0)::numeric AS credit_limit,
      COALESCE(
        ccb.available_credit,
        GREATEST(COALESCE(ccp.credit_limit, 0) - COALESCE(ccp.outstanding_balance, 0), 0),
        0
      )::numeric AS available_credit,
      COALESCE(ccb.held_credit, 0)::numeric AS held_credit,
      COALESCE(ccp.outstanding_balance, 0)::numeric AS outstanding_balance,
      COALESCE(o.overdue_amount, 0)::numeric AS overdue_amount,
      COALESCE(o.overdue_count, 0)::int AS overdue_count,
      o.oldest_due_date,
      COALESCE(c.is_active, true) AS customer_active
    FROM public.customers c
    LEFT JOIN public.profiles rp ON rp.id = c.responsible_id
    LEFT JOIN public.customer_credit_profile ccp ON ccp.customer_id = c.id
    LEFT JOIN public.customer_credit_balance ccb ON ccb.customer_id = c.id
    LEFT JOIN overdue o ON o.customer_id = c.id
    WHERE (SELECT allowed FROM authz) = true
  ),
  statused AS (
    SELECT
      b.*,
      CASE
        WHEN b.customer_active = false THEN 0::numeric
        WHEN b.overdue_count > 0 THEN 0::numeric
        ELSE GREATEST(COALESCE(b.available_credit, 0), 0)::numeric
      END AS computed_allowed_credit,
      CASE
        WHEN b.customer_active = false THEN false
        WHEN b.overdue_count > 0 THEN false
        WHEN GREATEST(COALESCE(b.available_credit, 0), 0) <= 0 THEN false
        ELSE true
      END AS is_trusted,
      CASE
        WHEN b.customer_active = false THEN 'inactive'
        WHEN b.overdue_count > 0 THEN 'overdue'
        WHEN GREATEST(COALESCE(b.available_credit, 0), 0) <= 0 THEN 'no_credit'
        ELSE 'trusted'
      END AS status_code,
      CASE
        WHEN b.customer_active = false THEN 'مشتری غیرفعال است.'
        WHEN b.overdue_count > 0 THEN 'دارای مانده معوق فعال است.'
        WHEN GREATEST(COALESCE(b.available_credit, 0), 0) <= 0 THEN 'سقف مجاز حساب‌باز ندارد.'
        ELSE 'مجاز برای فروش حساب‌باز تا سقف محاسبه‌شده.'
      END AS status_reason
    FROM base b
  ),
  filtered AS (
    SELECT *
    FROM statused s
    WHERE (COALESCE(NULLIF(BTRIM(p_search), ''), '') = ''
           OR s.customer_name ILIKE '%' || BTRIM(p_search) || '%'
           OR COALESCE(s.easy_code, '') ILIKE '%' || BTRIM(p_search) || '%')
      AND (COALESCE(NULLIF(BTRIM(p_phone), ''), '') = '' OR COALESCE(s.phone, '') ILIKE '%' || BTRIM(p_phone) || '%')
      AND (p_min_total_purchases IS NULL OR s.total_purchases >= p_min_total_purchases)
      AND (p_max_total_purchases IS NULL OR s.total_purchases <= p_max_total_purchases)
      AND (p_min_allowed_credit IS NULL OR s.computed_allowed_credit >= p_min_allowed_credit)
      AND (p_max_allowed_credit IS NULL OR s.computed_allowed_credit <= p_max_allowed_credit)
      AND (p_min_outstanding_balance IS NULL OR s.outstanding_balance >= p_min_outstanding_balance)
      AND (p_max_outstanding_balance IS NULL OR s.outstanding_balance <= p_max_outstanding_balance)
      AND (p_min_credit_score IS NULL OR s.credit_score >= p_min_credit_score)
      AND (p_max_credit_score IS NULL OR s.credit_score <= p_max_credit_score)
      AND (COALESCE(p_only_trusted, false) = false OR s.is_trusted = true)
  )
  SELECT
    f.customer_id,
    f.customer_name,
    f.phone,
    f.easy_code,
    f.responsible_id,
    f.responsible_name,
    f.total_purchases,
    f.credit_score,
    f.credit_limit,
    f.available_credit,
    f.held_credit,
    f.outstanding_balance,
    f.computed_allowed_credit,
    (f.overdue_count > 0) AS has_active_overdue,
    f.overdue_amount,
    f.overdue_count,
    f.oldest_due_date,
    f.is_trusted,
    f.status_code,
    f.status_reason,
    COUNT(*) OVER()::int AS total_count
  FROM filtered f
  ORDER BY f.is_trusted DESC, f.computed_allowed_credit DESC, f.customer_name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_settlement_score(_customer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_score   INTEGER := 0;
  v_delta   INTEGER;
  inv       RECORD;
BEGIN
  FOR inv IN
    SELECT expected_settlement_date, actual_settlement_date
    FROM public.invoices
    WHERE customer_id = _customer_id
      AND expected_settlement_date IS NOT NULL
      AND actual_settlement_date IS NOT NULL
  LOOP
    v_delta := (inv.actual_settlement_date::date - inv.expected_settlement_date);
    IF    v_delta <= 0  THEN v_score := v_score + 10;
    ELSIF v_delta <= 7  THEN v_score := v_score - 5;
    ELSIF v_delta <= 30 THEN v_score := v_score - 15;
    ELSE                     v_score := v_score - 30;
    END IF;
  END LOOP;

  v_score := GREATEST(-100, LEAST(100, v_score));

  INSERT INTO public.customer_credit_profile (customer_id, settlement_score, last_overdue_check_at)
    VALUES (_customer_id, v_score, NOW())
  ON CONFLICT (customer_id) DO UPDATE
    SET settlement_score       = EXCLUDED.settlement_score,
        last_overdue_check_at  = NOW();
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.recompute_customer_credit_scores(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, score integer, credit_limit numeric, status text, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer;
  v_offset integer;
  r record;
  v_score integer;
  v_limit_amt numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::text)
    OR public.has_role(v_uid, 'manager'::text)
    OR public.has_role(v_uid, 'accountant'::text)
  ) THEN
    RAISE EXCEPTION 'forbidden: only admin/manager/accountant may run batch recompute';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  FOR r IN
    SELECT c.id
    FROM public.customers c
    WHERE c.is_active = true
    ORDER BY c.id
    LIMIT v_limit OFFSET v_offset
  LOOP
    BEGIN
      SELECT cs.score, cs.credit_limit
        INTO v_score, v_limit_amt
        FROM public.calculate_credit_score(r.id) AS cs;

      customer_id := r.id;
      score := v_score;
      credit_limit := v_limit_amt;
      status := 'ok';
      error := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      customer_id := r.id;
      score := NULL;
      credit_limit := NULL;
      status := 'error';
      error := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.recompute_dynamic_capital_setting(p_setting_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_setting record;
  v_sp_count int := 0;
  v_cust_count int := 0;
  v_total_allocated numeric := 0;
  v_sum_sp_score numeric := 0;
  v_sum_cust_score numeric := 0;
  v_remainder numeric := 0;
  v_sp record;
  v_locked_ledger int := 0;
BEGIN
  SELECT id, capital_date, total_capital, notes, created_by
    INTO v_setting
    FROM public.daily_capital_settings
   WHERE id = p_setting_id
   FOR UPDATE;

  IF v_setting.id IS NULL THEN
    RAISE EXCEPTION 'capital setting not found: %', p_setting_id;
  END IF;

  IF v_actor IS NOT NULL AND NOT (
    public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'accountant')
  ) THEN
    RAISE EXCEPTION 'unauthorized: requires admin or accountant role';
  END IF;

  SELECT count(*) INTO v_locked_ledger
    FROM public.capital_allocation_ledger l
   WHERE (
      l.allocation_kind = 'customer'
      AND EXISTS (
        SELECT 1
          FROM public.customer_capital_allocations_dynamic c
         WHERE c.id = l.allocation_id
           AND c.capital_setting_id = p_setting_id
      )
    )
    OR (
      l.allocation_kind = 'salesperson'
      AND EXISTS (
        SELECT 1
          FROM public.salesperson_capital_allocations_dynamic s
         WHERE s.id = l.allocation_id
           AND s.capital_setting_id = p_setting_id
      )
    );

  IF v_locked_ledger > 0 THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
    VALUES (
      v_actor,
      'dynamic_capital_recompute_skipped',
      'daily_capital_setting',
      p_setting_id::text,
      jsonb_build_object(
        'reason', COALESCE(p_reason, 'score_changed'),
        'capital_date', v_setting.capital_date,
        'ledger_rows', v_locked_ledger
      )
    );

    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'ledger_exists',
      'ledger_rows', v_locked_ledger,
      'setting_id', p_setting_id
    );
  END IF;

  DROP TABLE IF EXISTS _sp_cust;
  DROP TABLE IF EXISTS _cust_alloc;
  DROP TABLE IF EXISTS _sp_alloc;

  CREATE TEMP TABLE _sp_alloc(
    salesperson_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_amount numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    allocated_capital numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  INSERT INTO _sp_alloc(salesperson_id, weighted_score)
  SELECT ur.user_id,
         COALESCE(
           (public.calculate_dynamic_score('salesperson', ur.user_id, v_setting.capital_date)
             ->> 'weighted_score')::numeric,
           0
         )
    FROM public.user_roles ur
   WHERE ur.role = 'sales'
   GROUP BY ur.user_id;

  SELECT COALESCE(SUM(weighted_score), 0), COUNT(*)
    INTO v_sum_sp_score, v_sp_count
    FROM _sp_alloc;

  IF v_sum_sp_score > 0 THEN
    UPDATE _sp_alloc
       SET share_ratio = weighted_score / v_sum_sp_score,
           raw_amount = (weighted_score / v_sum_sp_score) * v_setting.total_capital,
           floor_amount = FLOOR((weighted_score / v_sum_sp_score) * v_setting.total_capital),
           fractional = ((weighted_score / v_sum_sp_score) * v_setting.total_capital)
             - FLOOR((weighted_score / v_sum_sp_score) * v_setting.total_capital)
     WHERE true;

    SELECT v_setting.total_capital - COALESCE(SUM(floor_amount), 0)
      INTO v_remainder
      FROM _sp_alloc;

    UPDATE _sp_alloc SET allocated_capital = floor_amount WHERE true;

    IF v_remainder > 0 THEN
      WITH ranked AS (
        SELECT salesperson_id
          FROM _sp_alloc
         WHERE weighted_score > 0
         ORDER BY fractional DESC, weighted_score DESC, salesperson_id
         LIMIT v_remainder::int
      )
      UPDATE _sp_alloc a
         SET allocated_capital = a.floor_amount + 1
        FROM ranked r
       WHERE a.salesperson_id = r.salesperson_id;
    END IF;
  END IF;

  UPDATE public.salesperson_capital_allocations_dynamic s
     SET weighted_score = 0,
         share_ratio = 0,
         allocated_capital = 0
   WHERE s.capital_setting_id = p_setting_id
     AND NOT EXISTS (
       SELECT 1 FROM _sp_alloc x WHERE x.salesperson_id = s.salesperson_id
     );

  INSERT INTO public.salesperson_capital_allocations_dynamic(
    capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  )
  SELECT p_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
    FROM _sp_alloc
  ON CONFLICT (capital_setting_id, salesperson_id) DO UPDATE
     SET weighted_score = EXCLUDED.weighted_score,
         share_ratio = EXCLUDED.share_ratio,
         allocated_capital = EXCLUDED.allocated_capital;

  CREATE TEMP TABLE _cust_alloc(
    customer_id uuid PRIMARY KEY,
    salesperson_id uuid NOT NULL,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0,
    credit_limit numeric,
    has_overdue boolean NOT NULL DEFAULT false,
    has_profile boolean NOT NULL DEFAULT false,
    final_limit numeric NOT NULL DEFAULT 0,
    binding_constraint text NOT NULL DEFAULT 'formula'
  ) ON COMMIT DROP;

  CREATE TEMP TABLE _sp_cust(
    customer_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  FOR v_sp IN
    SELECT salesperson_id, allocated_capital
      FROM _sp_alloc
     WHERE allocated_capital > 0
  LOOP
    TRUNCATE _sp_cust;

    INSERT INTO _sp_cust(customer_id, weighted_score)
    SELECT c.id,
           COALESCE(
             (public.calculate_dynamic_score('customer', c.id, v_setting.capital_date)
               ->> 'weighted_score')::numeric,
             0
           )
      FROM public.customers c
     WHERE c.responsible_id = v_sp.salesperson_id
       AND COALESCE(c.is_active, true) = true;

    SELECT COALESCE(SUM(weighted_score), 0)
      INTO v_sum_cust_score
      FROM _sp_cust;

    IF v_sum_cust_score > 0 THEN
      UPDATE _sp_cust
         SET floor_amount = FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital),
             fractional = ((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
               - FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
       WHERE true;

      SELECT v_sp.allocated_capital - COALESCE(SUM(floor_amount), 0)
        INTO v_remainder
        FROM _sp_cust;

      UPDATE _sp_cust SET raw_allocation = floor_amount WHERE true;

      IF v_remainder > 0 THEN
        WITH ranked AS (
          SELECT customer_id
            FROM _sp_cust
           WHERE weighted_score > 0
           ORDER BY fractional DESC, weighted_score DESC, customer_id
           LIMIT v_remainder::int
        )
        UPDATE _sp_cust c
           SET raw_allocation = c.floor_amount + 1
          FROM ranked r
         WHERE c.customer_id = r.customer_id;
      END IF;
    END IF;

    INSERT INTO _cust_alloc(
      customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation
    )
    SELECT sc.customer_id,
           v_sp.salesperson_id,
           sc.weighted_score,
           CASE WHEN v_sum_cust_score > 0 THEN sc.weighted_score / v_sum_cust_score ELSE 0 END,
           sc.raw_allocation
      FROM _sp_cust sc;
  END LOOP;

  UPDATE _cust_alloc ca
     SET credit_limit = ccp.credit_limit,
         has_overdue = COALESCE(ccp.has_overdue, false),
         has_profile = true
    FROM public.customer_credit_profile ccp
   WHERE ccp.customer_id = ca.customer_id;

  UPDATE _cust_alloc
     SET final_limit = CASE
           WHEN has_overdue THEN 0
           WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
           ELSE raw_allocation
         END,
         binding_constraint = CASE
           WHEN has_overdue THEN 'overdue'
           WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN 'credit_limit'
           ELSE 'formula'
         END
   WHERE true;

  UPDATE public.customer_capital_allocations_dynamic c
     SET weighted_score = 0,
         share_ratio = 0,
         raw_allocation = 0,
         final_limit = 0,
         binding_constraint = 'floor'
   WHERE c.capital_setting_id = p_setting_id
     AND NOT EXISTS (
       SELECT 1 FROM _cust_alloc x WHERE x.customer_id = c.customer_id
     );

  INSERT INTO public.customer_capital_allocations_dynamic(
    capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
    raw_allocation, final_limit, binding_constraint
  )
  SELECT p_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
         raw_allocation, final_limit, binding_constraint
    FROM _cust_alloc
  ON CONFLICT (capital_setting_id, customer_id) DO UPDATE
     SET salesperson_id = EXCLUDED.salesperson_id,
         weighted_score = EXCLUDED.weighted_score,
         share_ratio = EXCLUDED.share_ratio,
         raw_allocation = EXCLUDED.raw_allocation,
         final_limit = EXCLUDED.final_limit,
         binding_constraint = EXCLUDED.binding_constraint;

  SELECT COUNT(*), COALESCE(SUM(final_limit), 0)
    INTO v_cust_count, v_total_allocated
    FROM _cust_alloc;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_actor,
    'dynamic_capital_recomputed',
    'daily_capital_setting',
    p_setting_id::text,
    jsonb_build_object(
      'reason', COALESCE(p_reason, 'score_changed'),
      'capital_date', v_setting.capital_date,
      'total_capital', v_setting.total_capital,
      'salespersons_count', v_sp_count,
      'customers_count', v_cust_count,
      'total_allocated_to_customers', v_total_allocated
    )
  );

  RETURN jsonb_build_object(
    'skipped', false,
    'setting_id', p_setting_id,
    'capital_date', v_setting.capital_date,
    'total_capital', v_setting.total_capital,
    'salespersons_count', v_sp_count,
    'customers_count', v_cust_count,
    'total_allocated_to_customers', v_total_allocated
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.release_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;
  v_new_held := GREATEST(v_held - p_amount, 0);

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'release', p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'آزادسازی اعتبار از پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_release',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.run_daily_capital_allocation(p_capital_date date, p_total_capital numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_setting_id uuid;
  v_sp_count int := 0;
  v_cust_count int := 0;
  v_total_allocated numeric := 0;
  v_sum_sp_score numeric;
  v_sp record;
  v_sum_cust_score numeric;
  v_remainder numeric;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized: no session';
  END IF;

  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'accountant')) THEN
    RAISE EXCEPTION 'unauthorized: requires admin or accountant role';
  END IF;

  IF p_total_capital IS NULL OR p_total_capital <= 0 THEN
    RAISE EXCEPTION 'invalid total_capital: must be > 0';
  END IF;

  BEGIN
    INSERT INTO public.daily_capital_settings(capital_date, total_capital, scoring_mode, notes, created_by)
    VALUES (p_capital_date, p_total_capital, 'auto', p_notes, v_caller)
    RETURNING id INTO v_setting_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'capital allocation already exists for date %', p_capital_date;
  END;

  CREATE TEMP TABLE _sp_alloc(
    salesperson_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_amount numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    allocated_capital numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  INSERT INTO _sp_alloc(salesperson_id, weighted_score)
  SELECT ur.user_id,
         COALESCE((public.calculate_dynamic_score('salesperson', ur.user_id, p_capital_date) ->> 'weighted_score')::numeric, 0)
  FROM public.user_roles ur
  WHERE ur.role = 'sales'
  GROUP BY ur.user_id;

  SELECT COALESCE(SUM(weighted_score), 0) INTO v_sum_sp_score FROM _sp_alloc;
  SELECT COUNT(*) INTO v_sp_count FROM _sp_alloc;

  IF v_sum_sp_score > 0 THEN
    UPDATE _sp_alloc SET
      share_ratio  = weighted_score / v_sum_sp_score,
      raw_amount   = (weighted_score / v_sum_sp_score) * p_total_capital,
      floor_amount = FLOOR((weighted_score / v_sum_sp_score) * p_total_capital),
      fractional   = ((weighted_score / v_sum_sp_score) * p_total_capital)
                     - FLOOR((weighted_score / v_sum_sp_score) * p_total_capital)
    WHERE true;

    SELECT p_total_capital - COALESCE(SUM(floor_amount),0) INTO v_remainder FROM _sp_alloc;
    UPDATE _sp_alloc SET allocated_capital = floor_amount WHERE true;

    IF v_remainder > 0 THEN
      WITH ranked AS (
        SELECT salesperson_id
        FROM _sp_alloc
        WHERE weighted_score > 0
        ORDER BY fractional DESC, weighted_score DESC, salesperson_id
        LIMIT v_remainder::int
      )
      UPDATE _sp_alloc a
      SET allocated_capital = a.floor_amount + 1
      FROM ranked r
      WHERE a.salesperson_id = r.salesperson_id;
    END IF;
  END IF;

  INSERT INTO public.salesperson_capital_allocations_dynamic(
    capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  )
  SELECT v_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  FROM _sp_alloc;

  CREATE TEMP TABLE _cust_alloc(
    customer_id uuid PRIMARY KEY,
    salesperson_id uuid NOT NULL,
    weighted_score numeric NOT NULL DEFAULT 0,
    share_ratio numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0,
    credit_limit numeric,
    has_overdue boolean NOT NULL DEFAULT false,
    has_profile boolean NOT NULL DEFAULT false,
    final_limit numeric NOT NULL DEFAULT 0,
    binding_constraint text NOT NULL DEFAULT 'formula'
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS _sp_cust(
    customer_id uuid PRIMARY KEY,
    weighted_score numeric NOT NULL DEFAULT 0,
    floor_amount numeric NOT NULL DEFAULT 0,
    fractional numeric NOT NULL DEFAULT 0,
    raw_allocation numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;
  TRUNCATE _sp_cust;

  FOR v_sp IN
    SELECT salesperson_id, allocated_capital
    FROM _sp_alloc
    WHERE allocated_capital > 0
  LOOP
    TRUNCATE _sp_cust;

    INSERT INTO _sp_cust(customer_id, weighted_score)
    SELECT c.id,
           COALESCE((public.calculate_dynamic_score('customer', c.id, p_capital_date) ->> 'weighted_score')::numeric, 0)
    FROM public.customers c
    WHERE c.responsible_id = v_sp.salesperson_id
      AND COALESCE(c.is_active, true) = true;

    SELECT COALESCE(SUM(weighted_score),0) INTO v_sum_cust_score FROM _sp_cust;

    IF v_sum_cust_score > 0 THEN
      UPDATE _sp_cust SET
        floor_amount = FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital),
        fractional   = ((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
                       - FLOOR((weighted_score / v_sum_cust_score) * v_sp.allocated_capital)
      WHERE true;

      SELECT v_sp.allocated_capital - COALESCE(SUM(floor_amount),0) INTO v_remainder FROM _sp_cust;
      UPDATE _sp_cust SET raw_allocation = floor_amount WHERE true;

      IF v_remainder > 0 THEN
        WITH ranked AS (
          SELECT customer_id
          FROM _sp_cust
          WHERE weighted_score > 0
          ORDER BY fractional DESC, weighted_score DESC, customer_id
          LIMIT v_remainder::int
        )
        UPDATE _sp_cust c
        SET raw_allocation = c.floor_amount + 1
        FROM ranked r
        WHERE c.customer_id = r.customer_id;
      END IF;
    END IF;

    INSERT INTO _cust_alloc(
      customer_id, salesperson_id, weighted_score, share_ratio, raw_allocation
    )
    SELECT
      sc.customer_id,
      v_sp.salesperson_id,
      sc.weighted_score,
      CASE WHEN v_sum_cust_score > 0 THEN sc.weighted_score / v_sum_cust_score ELSE 0 END,
      sc.raw_allocation
    FROM _sp_cust sc;
  END LOOP;

  UPDATE _cust_alloc ca
  SET credit_limit = ccp.credit_limit,
      has_overdue = COALESCE(ccp.has_overdue, false),
      has_profile = true
  FROM public.customer_credit_profile ccp
  WHERE ccp.customer_id = ca.customer_id;

  UPDATE _cust_alloc SET
    final_limit = CASE
      WHEN has_overdue THEN 0
      WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN credit_limit
      ELSE raw_allocation
    END,
    binding_constraint = CASE
      WHEN has_overdue THEN 'overdue'
      WHEN credit_limit IS NOT NULL AND raw_allocation > credit_limit THEN 'credit_limit'
      ELSE 'formula'
    END
  WHERE true;

  SELECT COUNT(*), COALESCE(SUM(final_limit),0) INTO v_cust_count, v_total_allocated FROM _cust_alloc;

  INSERT INTO public.customer_capital_allocations_dynamic(
    capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
    raw_allocation, final_limit, binding_constraint
  )
  SELECT v_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
         raw_allocation, final_limit, binding_constraint
  FROM _cust_alloc;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (
    v_caller,
    'create',
    'daily_capital_setting',
    v_setting_id::text,
    jsonb_build_object(
      'capital_date', p_capital_date,
      'total_capital', p_total_capital,
      'salespersons_count', v_sp_count,
      'customers_count', v_cust_count,
      'total_allocated_to_customers', v_total_allocated,
      'scoring_mode', 'auto'
    )
  );

  RETURN jsonb_build_object(
    'setting_id', v_setting_id,
    'capital_date', p_capital_date,
    'total_capital', p_total_capital,
    'salespersons_count', v_sp_count,
    'customers_count', v_cust_count,
    'total_allocated_to_customers', v_total_allocated
  );
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.save_customer_capital_allocations(p_salesperson_allocation_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc record;
  v_total numeric;
  v_item jsonb;
  v_customer_id uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing record;
  v_action text;
  v_row_id uuid;
  v_count int := 0;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::text,'manager'::text,'accountant'::text]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.capital_snapshot_id, s.capital_date, s.salesperson_id, s.final_amount
    INTO v_alloc
  FROM public.salesperson_capital_allocations s
  WHERE s.id = p_salesperson_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'salesperson_allocation not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(COALESCE(ccp.credit_score,0)), 0) INTO v_total
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile ccp
    ON ccp.customer_id = c.id AND ccp.is_active = true
  WHERE c.responsible_id = v_alloc.salesperson_id
    AND c.is_active = true;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_customer_id := (v_item->>'customer_id')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(btrim(COALESCE(v_item->>'override_reason','')), '');

    IF v_customer_id IS NULL THEN
      RAISE EXCEPTION 'customer_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- verify customer belongs to this salesperson (active); allow missing/zero score
    SELECT COALESCE(ccp.credit_score, 0)::numeric INTO v_score
    FROM public.customers c
    LEFT JOIN public.customer_credit_profile ccp
      ON ccp.customer_id = c.id AND ccp.is_active = true
    WHERE c.id = v_customer_id
      AND c.responsible_id = v_alloc.salesperson_id
      AND c.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer % is not eligible for this salesperson', v_customer_id USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 AND v_score > 0 THEN ROUND(v_alloc.final_amount * v_score / v_total)
      ELSE 0
    END;

    -- detect existing for action classification
    SELECT id INTO v_existing
    FROM public.customer_capital_allocations
    WHERE salesperson_allocation_id = v_alloc.id AND customer_id = v_customer_id;

    INSERT INTO public.customer_capital_allocations (
      salesperson_allocation_id, capital_snapshot_id, capital_date,
      salesperson_id, customer_id,
      customer_score, score_source, total_customer_score,
      system_suggested_amount, final_amount, override_reason,
      status, created_by, approved_by
    ) VALUES (
      v_alloc.id, v_alloc.capital_snapshot_id, v_alloc.capital_date,
      v_alloc.salesperson_id, v_customer_id,
      v_score, 'customer_credit_profile.credit_score', v_total,
      v_suggested, v_final, v_reason,
      'approved', auth.uid(), auth.uid()
    )
    ON CONFLICT (salesperson_allocation_id, customer_id) DO UPDATE
      SET customer_score = EXCLUDED.customer_score,
          total_customer_score = EXCLUDED.total_customer_score,
          system_suggested_amount = EXCLUDED.system_suggested_amount,
          final_amount = EXCLUDED.final_amount,
          override_reason = EXCLUDED.override_reason,
          status = 'approved',
          approved_by = auth.uid(),
          updated_at = now()
    RETURNING id INTO v_row_id;

    IF v_existing.id IS NULL THEN
      v_action := 'create';
    ELSIF ROUND(v_final) <> ROUND(v_suggested) THEN
      v_action := 'override';
    ELSE
      v_action := 'update';
    END IF;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(),
      'customer_capital_allocation',
      v_row_id::text,
      v_action,
      jsonb_build_object(
        'salesperson_allocation_id', v_alloc.id,
        'capital_snapshot_id', v_alloc.capital_snapshot_id,
        'capital_date', v_alloc.capital_date,
        'salesperson_id', v_alloc.salesperson_id,
        'customer_id', v_customer_id,
        'customer_score', v_score,
        'total_customer_score', v_total,
        'suggested', v_suggested,
        'final', v_final,
        'override_reason', v_reason
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('saved', v_count);
END;
$function$


-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_credit_derive_customer_person()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.customer_person_id := NULL;
  ELSE
    SELECT c.person_id INTO NEW.customer_person_id
      FROM public.customers c WHERE c.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END
$function$

