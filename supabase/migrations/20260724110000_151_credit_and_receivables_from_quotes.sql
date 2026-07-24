-- =====================================================================
-- 151 - Phase 2.2 + 2.3: credit score and receivables read quote payments
-- =====================================================================
-- Context: public.invoices has 0 rows and is a dead parallel design.
-- sales_quotes is the live pre-invoice workflow, and since migration 148 a
-- payment_receipt_links row targets EITHER invoice_id OR quote_id (XOR CHECK).
-- Everything below was invoice-keyed and therefore evaluated to zero.
--
-- 2.2 calculate_credit_score
--   Five invoice-keyed blocks now read a UNION of invoices and ACCEPTED
--   sales_quotes:
--     (a) legacy all-time total_purchases / last_purchase_date
--     (b) per-document qualifying payments inside the window
--     (c) settlement speed (weighted avg payment_date - due_date)
--     (d) late_payments_count (latest qualifying payment > 7 days past due)
--     (e) the cross-customer average that normalises purchase_score
--   The scoring shape is untouched: same sub-scores, same weights, same
--   formula, same window resolution, same upsert/snapshot/audit writes.
--   (a) is included because leaving it invoice-only would write a
--   customer_credit_profile row claiming total_paid > total_purchases.
--
--   Document mapping  invoice -> quote:
--     id                -> id
--     total_amount      -> final_amount
--     due_date          -> expires_at::date   (the only date a quote carries)
--     issue_date        -> created_at
--     status not in (draft,cancelled) -> status = 'accepted'
--   NOTE: every accepted quote in the live data has expires_at NULL, so (c)
--   and (d) contribute nothing from quotes until quotes are given an expiry.
--   That is the same graceful-degradation the invoice branches already have
--   (both already filter due_date IS NOT NULL).
--
--   payment_receipt_links targets are disjoint by the migration-148 CHECK, so
--   COALESCE(invoice_id, quote_id) is an exact document key, not a guess.
--
-- 2.3 vw_customer_receivables / get_receivable_detail
--   The view gains a UNION ALL branch for accepted quotes. Balance rule matches
--   the receipt form: outstanding = final_amount - approved allocations, and
--   only status='accepted' is a debt (draft/sent/canceled/rejected are not).
--   Column names, types and order are unchanged, so CREATE OR REPLACE VIEW
--   keeps every existing grant, and get_receivables_list /
--   get_receivables_summary / _app.reports.tsx pick the rows up unchanged.
--   get_receivable_detail's inner join to invoices becomes a LEFT JOIN (a quote
--   row has no invoice), issue_date falls back to the row's created_at, and the
--   receipt join matches on either key.
--
-- TWO LATENT DEFECTS FIXED (both dormant only because invoices had 0 rows;
-- both would have produced wrong money figures the moment quotes joined the
-- union, so they are fixed here rather than left behind a working feature):
--   1. LEAST() ignores NULLs. In (b) and (e) an UNPAID document has no row in
--      the payments CTE, so LEAST(NULL, total_amount) returned total_amount and
--      the document's full value was counted as PAID. Measured before the fix:
--      a customer who had paid nothing scored paid_purchase_amount =
--      163,100,000 and customer_credit_profile.total_paid would have been
--      written with that figure. Now LEAST(COALESCE(paid,0), total_amount).
--   2. `SELECT COALESCE(outstanding_balance,0) INTO v_outstanding` assigns NULL
--      when the customer has no customer_credit_profile row yet, defeating both
--      the COALESCE and the DECLARE default. outstanding_score then evaluated
--      GREATEST(0, NULL) = 0 instead of 100, so a customer's FIRST scoring run
--      was penalised and only self-corrected on the second run. Now re-COALESCEd
--      after the assignment.
--
-- Qualifying receipt statuses are left as the existing four-value list. The
-- payment_receipts CHECK only permits pending_review/approved/rejected, so in
-- practice that list means exactly "approved" -- the same set migration 150
-- used for the sales KPI.
--
-- ROLLBACK: restore the prior bodies from git history (this file is the only
-- thing that changed them).
--
-- APPLY WITH:
--   psql -U supabase_admin -d afrakala --single-transaction -v ON_ERROR_STOP=1 \
--        -f 20260724110000_151_credit_and_receivables_from_quotes.sql
-- This file deliberately carries no BEGIN/COMMIT of its own: an inner COMMIT
-- would close psql's --single-transaction wrapper early and silently reintroduce
-- the half-applied-schema risk it exists to prevent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2.2  calculate_credit_score
-- ---------------------------------------------------------------------
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
END $function$;

-- ---------------------------------------------------------------------
-- 2.3a  vw_customer_receivables
-- ---------------------------------------------------------------------
-- Same columns, same order, same types -> CREATE OR REPLACE keeps the grants.
CREATE OR REPLACE VIEW public.vw_customer_receivables AS
WITH paid_inv AS (
  SELECT prl.invoice_id AS doc_id,
         COALESCE(SUM(prl.amount), 0::numeric) AS confirmed_paid_amount
  FROM payment_receipt_links prl
  JOIN payment_receipts pr ON pr.id = prl.receipt_id
  WHERE prl.invoice_id IS NOT NULL
    AND pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text])
  GROUP BY prl.invoice_id
),
paid_quote AS (
  SELECT prl.quote_id AS doc_id,
         COALESCE(SUM(prl.amount), 0::numeric) AS confirmed_paid_amount
  FROM payment_receipt_links prl
  JOIN payment_receipts pr ON pr.id = prl.receipt_id
  WHERE prl.quote_id IS NOT NULL
    AND pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text])
  GROUP BY prl.quote_id
)
-- Invoice branch: unchanged from the original definition.
SELECT i.customer_id,
       c.name AS customer_name,
       i.id AS invoice_id,
       i.number AS invoice_number,
       i.invoice_type,
       i.status AS invoice_status,
       i.due_date,
       i.total_amount,
       COALESCE(i.deposit_amount, 0::numeric) AS deposit_amount,
       COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
       GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
       i.commitment_confirmed,
       CASE WHEN i.due_date IS NOT NULL THEN i.due_date - CURRENT_DATE ELSE NULL::integer END AS days_until_due,
       i.due_date IS NOT NULL
         AND i.due_date < CURRENT_DATE
         AND (i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
       i.created_at
FROM invoices i
LEFT JOIN customers c ON c.id = i.customer_id
LEFT JOIN paid_inv p ON p.doc_id = i.id
WHERE i.commitment_confirmed = true
  AND COALESCE(i.status, ''::text) <> 'cancelled'::text
  AND GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric

UNION ALL

-- Accepted-quote branch: an accepted quote with an unpaid balance is a debt.
-- draft / sent / canceled / rejected quotes are not debts and are excluded.
-- customer_id may be NULL for a guest quote; customer_name then falls back to
-- the name captured on the quote so the row is still identifiable.
SELECT q.customer_id,
       COALESCE(c.name, q.customer_name) AS customer_name,
       q.id AS invoice_id,
       q.quote_number AS invoice_number,
       'sales_quote'::text AS invoice_type,
       q.status::text AS invoice_status,
       q.expires_at::date AS due_date,
       -- numeric(18,2) so the UNION keeps the existing view column's typmod;
       -- CREATE OR REPLACE VIEW refuses to widen numeric(18,2) to numeric.
       -- final_amount holds whole Rials, so the cast is lossless here.
       q.final_amount::numeric(18,2) AS total_amount,
       0::numeric AS deposit_amount,
       COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
       GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
       true AS commitment_confirmed,
       CASE WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - CURRENT_DATE ELSE NULL::integer END AS days_until_due,
       q.expires_at IS NOT NULL
         AND q.expires_at::date < CURRENT_DATE
         AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
       q.created_at
FROM sales_quotes q
LEFT JOIN customers c ON c.id = q.customer_id
LEFT JOIN paid_quote p ON p.doc_id = q.id
WHERE q.status = 'accepted'
  AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric;

-- ---------------------------------------------------------------------
-- 2.3b  get_receivable_detail
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_receivable_detail(p_customer_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, customer_phone text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, issue_date date, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, is_overdue boolean, receipt_id uuid, receipt_amount numeric, receipt_status text, receipt_payment_date date, receipt_tracking_number text, receipt_bank_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL AND p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id or p_invoice_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, COALESCE(c.phone, q.customer_phone) AS customer_phone,
    v.invoice_id, v.invoice_number, v.invoice_type, v.invoice_status,
    -- a quote has no issue_date; the receivable row's created_at is the date it
    -- became a commitment
    COALESCE(i.issue_date, v.created_at::date) AS issue_date,
    v.due_date,
    v.total_amount, v.deposit_amount, v.confirmed_paid_amount,
    v.outstanding_amount, v.is_overdue,
    pr.id AS receipt_id, prl.amount AS receipt_amount, pr.status AS receipt_status,
    pr.payment_date AS receipt_payment_date,
    pr.tracking_number AS receipt_tracking_number,
    pr.bank_name AS receipt_bank_name
  FROM public.vw_customer_receivables v
  -- LEFT: a quote-sourced row has no matching invoice
  LEFT JOIN public.invoices i          ON i.id = v.invoice_id
  LEFT JOIN public.sales_quotes q      ON q.id = v.invoice_id
  LEFT JOIN public.customers c         ON c.id = v.customer_id
  -- v.invoice_id carries an invoice id or a quote id; the two id spaces are
  -- disjoint, and the migration-148 CHECK guarantees a link row sets exactly one
  LEFT JOIN public.payment_receipt_links prl
         ON (prl.invoice_id = v.invoice_id OR prl.quote_id = v.invoice_id)
  LEFT JOIN public.payment_receipts    pr   ON pr.id = prl.receipt_id
  WHERE (p_invoice_id  IS NULL OR v.invoice_id  = p_invoice_id)
    AND (p_customer_id IS NULL OR v.customer_id = p_customer_id)
  ORDER BY v.due_date NULLS LAST, pr.payment_date NULLS LAST;
END;
$function$;
