SET client_encoding='UTF8';

-- 457. The supplier payables report shows the debt, not the cash-incentive price.
--
-- WHAT IT SHOWED BEFORE. `vw_supplier_payables` took the amount owed as:
--     CASE WHEN p.paid_at IS NOT NULL THEN 0 ELSE COALESCE(p.cash_price, p.total_amount, 0) END
-- so any purchase carrying a `cash_price` reported that number as the debt.
--
-- `cash_price` is NOT a debt. The purchase form asks for it as
--   label       "the cash price of this same supplier at this same moment"
--   placeholder "what would it be if we paid cash right now?"
-- under a badge reading "score-earning", and its only other consumer is the
-- "gold of time" gamification score (`award_buyer_purchase_score`,
-- `vw_purchase_float.implied_daily_cost`), which uses it as the BENCHMARK the
-- credit price is compared against:
--     implied_daily := ((purchase_price - cash_price) / cash_price) / promised_days
-- It is a counterfactual -- what the supplier would have accepted for immediate
-- cash -- and it is optional (absent => score 0). It is never what we owe.
--
-- WHERE THE OLD RULE CAME FROM. Migration 20260506195804 introduced it and said
-- so in its own header:
--     "Partial payment of purchases is NOT modeled in current schema; outstanding
--      for an unpaid purchase = coalesce(cash_price, total_amount). To be
--      revisited when partial purchase payments are introduced."
-- A stop-gap, never a definition of the liability. This migration revisits it.
--
-- THE LIVE ROW, MEASURED 2026-09-05 ON THE TEST DATABASE. Exactly one unpaid
-- purchase of 317 carries a cash_price:
--     purchase      ba1c75a0-d406-4389-ac4f-e1501dbbe915
--     supplier      "test supplier 10"
--     payment term  "30-day settlement"  (days = 30, active)
--     quantity      1
--     purchase_price   12,000,000,000     total_amount  12,000,000,000
--     cash_price       10,000,000,000     paid_at       NULL
-- The term is THIRTY-DAY CREDIT. The old expression therefore granted the credit
-- period and applied the immediate-cash discount at the same time: it dated the
-- row 2026-08-25 (purchase_date + 30) while claiming only 10,000,000,000 was
-- owed on that date. We owe 12,000,000,000. The payables screen understated the
-- company's debt by 2,000,000,000 toman.
--
-- THE DIMENSION BUG UNDERNEATH IT. `create_purchase` computes
--     _line_total := p_purchase_price * p_quantity   -> total_amount
-- but stores `cash_price` exactly as typed. `cash_price` is a PER-UNIT figure
-- (the form places it between the unit price and the quantity field; the score
-- ratio above only type-checks per-unit), while `total_amount` is grossed by
-- quantity. So COALESCE(cash_price, total_amount) chose between two numbers of
-- different dimensions, and at quantity > 1 the error would have picked up a
-- quantity factor on top of the discount. Today 0 rows have both a cash_price
-- and quantity > 1, which is the only reason that has not yet been seen.
--
-- WHAT MOVES. Exactly one row, the one above: outstanding_amount and therefore
-- aging_bucket sums rise by 2,000,000,000. Measured, unpaid totals:
--     before  328,938,021,699.94        after  330,938,021,699.94
-- No other row differs in any column (proved by EXCEPT in both directions).
-- `cash_price` REMAINS a column of this view and of get_payables_list /
-- get_payable_detail, and the payables page keeps its own separate
-- "cash price" column -- no information is removed from any screen.
--
-- CURRENCY. `currency` was COALESCE(p.cash_price_currency, p.currency); now that
-- the amount is the purchase total, its currency is the purchase currency.
-- Measured: 0 purchases have cash_price_currency distinct from currency
-- (create_purchase writes it as a mirror of currency), so this is a no-op on
-- today's data and is changed only so the column cannot drift from the amount.
--
-- NOT TOUCHED, DELIBERATELY: `pay_purchase_with_voucher` defaults its voucher
-- amount to COALESCE(_amount, cash_price, total_amount). That is a different
-- question -- what we choose to PAY, which may legitimately be the cash price if
-- we are paying cash on the spot -- and it accepts an explicit amount. It is
-- reported as a separate finding rather than changed here.
--
-- DATA IMPACT: none. This is a view; no row is written, and the 10 rows in
-- daily_capital_snapshots are all dated 2026-07-20/21, before this purchase
-- (2026-07-26), so no stored snapshot changes. compute_daily_capital is STABLE,
-- writes nothing, and has no function callers, so nothing is frozen and needs
-- recomputing.

CREATE OR REPLACE VIEW public.vw_supplier_payables AS
  SELECT src.supplier_id,
     src.supplier_name,
     src.purchase_id,
     src.purchase_date,
     src.payment_term_days,
     src.due_date,
     src.purchase_total_amount,
     src.cash_price,
     src.currency,
     src.paid_at,
     src.is_paid,
     src.outstanding_amount,
     src.days_until_due,
     src.is_overdue,
     src.product_summary,
     src.created_at,
     src.aging_bucket
    FROM ( SELECT p.supplier_id,
             s.name AS supplier_name,
             p.id AS purchase_id,
             p.purchase_date,
             pt.days AS payment_term_days,
                 CASE
                     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                     ELSE p.purchase_date
                 END AS due_date,
             p.total_amount AS purchase_total_amount,
             p.cash_price,
             p.currency,
             p.paid_at,
             p.paid_at IS NOT NULL AS is_paid,
                 CASE
                     WHEN p.paid_at IS NOT NULL THEN 0::numeric
                     ELSE COALESCE(p.total_amount, 0::numeric)
                 END AS outstanding_amount,
                 CASE
                     WHEN p.paid_at IS NOT NULL THEN NULL::integer
                     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - tehran_today()
                     ELSE p.purchase_date - tehran_today()
                 END AS days_until_due,
             p.paid_at IS NULL AND
                 CASE
                     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                     ELSE p.purchase_date
                 END < tehran_today() AS is_overdue,
             NULL::text AS product_summary,
             p.created_at,
                 CASE
                     WHEN p.paid_at IS NOT NULL THEN 'current'::text
                     WHEN (tehran_today() -
                     CASE
                         WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                         ELSE p.purchase_date
                     END) <= 0 THEN 'current'::text
                     WHEN (tehran_today() -
                     CASE
                         WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                         ELSE p.purchase_date
                     END) <= 30 THEN 'd1_30'::text
                     WHEN (tehran_today() -
                     CASE
                         WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                         ELSE p.purchase_date
                     END) <= 60 THEN 'd31_60'::text
                     WHEN (tehran_today() -
                     CASE
                         WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                         ELSE p.purchase_date
                     END) <= 90 THEN 'd61_90'::text
                     ELSE 'd90_plus'::text
                 END AS aging_bucket
            FROM purchases p
              LEFT JOIN suppliers s ON s.id = p.supplier_id
              LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id) src
   WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());

COMMENT ON VIEW public.vw_supplier_payables IS
  'Supplier payables aging. outstanding_amount is the purchase total_amount (457): cash_price is the gamification benchmark price, not the debt. Partial purchase payments are still not modeled.';
