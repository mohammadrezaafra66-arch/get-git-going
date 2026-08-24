-- 386-down.sql — rollback for migration 386. REVERSES A REAL CHANGE, not a no-op.
--
-- Migration 386 adds `uid() IS NOT NULL AND` to the outer WHERE of eight views. This file puts
-- each of those eight back exactly as `pg_get_viewdef` returned it on 2026-08-24, BEFORE the
-- migration was written — captured first, per the programme's rule, and reversed from the
-- capture rather than from an assumed original.
--
-- TWO THINGS THIS FILE MUST GET RIGHT, both measured rather than assumed:
--
--   1. `CREATE OR REPLACE VIEW` DROPS `reloptions`. Measured inside BEGIN … ROLLBACK:
--      `product_computed_prices_public` went from `{security_invoker=true}` to `(none)` after a
--      plain replace. So the two views that carry `security_invoker = true` — set by migration
--      370, the G-1 remediation — MUST restate it in their own `WITH (...)` clause here, or
--      rolling back would quietly undo G-1 while looking successful.
--
--   2. `CREATE OR REPLACE VIEW` PRESERVES `relacl`. Measured in the same probe: `anon`'s zero
--      privileges survived the replace untouched. So this file deliberately contains no GRANT
--      and no REVOKE. Adding one would be the asymmetric-rollback defect migrations 374, 376
--      and 377 are documented for.
--
-- Per the programme's rollback rule this file carries statements only — no BEGIN, no COMMIT, no
-- ROLLBACK. The caller owns the transaction. `docs/verification/rollback-dryrun.sql` is the
-- caller used to prove it, and it was run against this file BEFORE migration 386 was applied.

SET client_encoding = 'UTF8';

-- ===================== product_computed_prices_public =====================
-- reloptions: {security_invoker=true}
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.product_computed_prices_public WITH (security_invoker = true) AS
 SELECT src.id,
    src.product_id,
    src.sale_price_type_id,
    src.pricing_rule_id,
    src.final_sale_price,
    src.rounded_sale_price,
    src.computed_at,
    src.source
   FROM ( SELECT product_computed_prices.id,
            product_computed_prices.product_id,
            product_computed_prices.sale_price_type_id,
            product_computed_prices.pricing_rule_id,
            product_computed_prices.final_sale_price,
            product_computed_prices.rounded_sale_price,
            product_computed_prices.computed_at,
            product_computed_prices.source
           FROM product_computed_prices
          WHERE product_computed_prices.settlement_type_id IS NULL) src
  WHERE NOT is_viewer_only(uid());

-- ===================== publish_recipients_view =====================
-- reloptions: (none)
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.publish_recipients_view AS
 SELECT src.id,
    src.full_name,
    src.roles
   FROM ( SELECT p.id,
            p.full_name,
            array_agg(ur.role ORDER BY ur.role) AS roles
           FROM profiles p
             JOIN user_roles ur ON ur.user_id = p.id
          WHERE p.is_active = true AND (ur.role = ANY (ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]))
          GROUP BY p.id, p.full_name) src
  WHERE NOT is_viewer_only(uid());

-- ===================== v_dynamic_customer_capital_balances =====================
-- reloptions: (none)
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.v_dynamic_customer_capital_balances AS
 SELECT src.allocation_id,
    src.capital_setting_id,
    src.customer_id,
    src.salesperson_id,
    src.weighted_score,
    src.share_ratio,
    src.raw_allocation,
    src.final_limit,
    src.held_amount,
    src.consumed_amount,
    src.remaining_amount,
    src.binding_constraint,
    src.created_at
   FROM ( SELECT c.id AS allocation_id,
            c.capital_setting_id,
            c.customer_id,
            c.salesperson_id,
            c.weighted_score,
            c.share_ratio,
            c.raw_allocation,
            COALESCE(c.final_limit, 0::numeric) AS final_limit,
            u.held AS held_amount,
            u.consumed AS consumed_amount,
            GREATEST(COALESCE(c.final_limit, 0::numeric) - u.held - u.consumed, 0::numeric) AS remaining_amount,
            c.binding_constraint,
            c.created_at
           FROM customer_capital_allocations_dynamic c
             CROSS JOIN LATERAL _capital_alloc_used('customer'::text, c.id) u(held, consumed)) src
  WHERE NOT is_viewer_only(uid());

-- ===================== v_dynamic_salesperson_capital_balances =====================
-- reloptions: (none)
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.v_dynamic_salesperson_capital_balances AS
 SELECT src.allocation_id,
    src.capital_setting_id,
    src.salesperson_id,
    src.weighted_score,
    src.share_ratio,
    src.allocated_capital,
    src.held_amount,
    src.consumed_amount,
    src.remaining_amount,
    src.created_at
   FROM ( SELECT s.id AS allocation_id,
            s.capital_setting_id,
            s.salesperson_id,
            s.weighted_score,
            s.share_ratio,
            COALESCE(s.allocated_capital, 0::numeric) AS allocated_capital,
            u.held AS held_amount,
            u.consumed AS consumed_amount,
            GREATEST(COALESCE(s.allocated_capital, 0::numeric) - u.held - u.consumed, 0::numeric) AS remaining_amount,
            s.created_at
           FROM salesperson_capital_allocations_dynamic s
             CROSS JOIN LATERAL _capital_alloc_used('salesperson'::text, s.id) u(held, consumed)) src
  WHERE NOT is_viewer_only(uid());

-- ===================== v_promotion_suggestions =====================
-- reloptions: {security_invoker=true}
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.v_promotion_suggestions WITH (security_invoker = true) AS
 SELECT src.product_id,
    src.product_name,
    src.sku,
    src.stock_status,
    src.channel_id,
    src.channel_name,
    src.label_weight_sum,
    src.channel_weight,
    src.stock_factor,
    src.recency_factor,
    src.score,
    src.qty_90d,
    src.daily_quota,
    src.used_today,
    src.remaining_today,
    src.market_score,
    src.sales_nomination_boost,
    src.final_score,
    src.nomination_count,
    src.last_nominated_at
   FROM ( WITH label_sums AS (
                 SELECT pll.product_id,
                    COALESCE(sum(pl.weight), 0::bigint)::numeric AS label_weight_sum
                   FROM product_label_links pll
                     JOIN product_labels pl ON pl.id = pll.label_id AND pl.is_active = true
                  GROUP BY pll.product_id
                ), sales_90d AS (
                 SELECT NULL::uuid AS product_id,
                    0::numeric AS qty_90d
                  WHERE false
                ), used_today AS (
                 SELECT (audit_logs.diff ->> 'channel_id'::text)::uuid AS channel_id,
                    count(*)::integer AS used
                   FROM audit_logs
                  WHERE audit_logs.action = 'promotion_suggestion_used'::text AND audit_logs.created_at >= (date_trunc('day'::text, (now() AT TIME ZONE 'Asia/Tehran'::text)) AT TIME ZONE 'Asia/Tehran'::text) AND audit_logs.diff ? 'channel_id'::text
                  GROUP BY ((audit_logs.diff ->> 'channel_id'::text)::uuid)
                ), nom_today AS (
                 SELECT pn.product_id,
                    COALESCE(sum(pn.boost_applied), 0::numeric) AS raw_boost,
                    count(*)::integer AS nomination_count,
                    max(pn.created_at) AS last_nominated_at
                   FROM promotion_nominations pn
                  WHERE pn.nominated_on = (now() AT TIME ZONE 'Asia/Tehran'::text)::date AND pn.cancelled_at IS NULL
                  GROUP BY pn.product_id
                ), def_policy AS (
                 SELECT promotion_nomination_policy.boost_cap_per_product
                   FROM promotion_nomination_policy
                  WHERE promotion_nomination_policy.is_active AND promotion_nomination_policy.role IS NULL AND promotion_nomination_policy.user_id IS NULL
                 LIMIT 1
                )
         SELECT p.id AS product_id,
            p.name AS product_name,
            p.sku,
            p.stock_status,
            mc.id AS channel_id,
            mc.name AS channel_name,
            COALESCE(ls.label_weight_sum, 0::numeric) AS label_weight_sum,
            mc.weight::numeric AS channel_weight,
                CASE p.stock_status::text
                    WHEN 'available'::text THEN 1.0
                    WHEN 'limited'::text THEN 0.6
                    WHEN 'unknown'::text THEN 0.4
                    ELSE 0.0
                END AS stock_factor,
            LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) AS recency_factor,
            COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
                CASE p.stock_status::text
                    WHEN 'available'::text THEN 1.0
                    WHEN 'limited'::text THEN 0.6
                    WHEN 'unknown'::text THEN 0.4
                    ELSE 0.0
                END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) +
                CASE
                    WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
                    ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
                END AS score,
            COALESCE(s90.qty_90d, 0::numeric) AS qty_90d,
            mc.daily_quota,
            COALESCE(ut.used, 0) AS used_today,
                CASE
                    WHEN mc.daily_quota IS NULL OR mc.daily_quota = 0 THEN NULL::integer
                    ELSE GREATEST(mc.daily_quota - COALESCE(ut.used, 0), 0)
                END AS remaining_today,
            COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
                CASE p.stock_status::text
                    WHEN 'available'::text THEN 1.0
                    WHEN 'limited'::text THEN 0.6
                    WHEN 'unknown'::text THEN 0.4
                    ELSE 0.0
                END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) AS market_score,
                CASE
                    WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
                    ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
                END AS sales_nomination_boost,
            COALESCE(ls.label_weight_sum, 0::numeric) * mc.weight::numeric * COALESCE(p.promotion_weight, 1::numeric) *
                CASE p.stock_status::text
                    WHEN 'available'::text THEN 1.0
                    WHEN 'limited'::text THEN 0.6
                    WHEN 'unknown'::text THEN 0.4
                    ELSE 0.0
                END * LEAST(3.0, 1::numeric + ln(1::numeric + COALESCE(s90.qty_90d, 0::numeric)) / 5::numeric) +
                CASE
                    WHEN dp.boost_cap_per_product IS NULL OR dp.boost_cap_per_product <= 0::numeric THEN COALESCE(nt.raw_boost, 0::numeric)
                    ELSE LEAST(COALESCE(nt.raw_boost, 0::numeric), dp.boost_cap_per_product)
                END AS final_score,
            COALESCE(nt.nomination_count, 0) AS nomination_count,
            nt.last_nominated_at
           FROM products p
             CROSS JOIN marketing_channels mc
             LEFT JOIN label_sums ls ON ls.product_id = p.id
             LEFT JOIN sales_90d s90 ON s90.product_id = p.id
             LEFT JOIN used_today ut ON ut.channel_id = mc.id
             LEFT JOIN nom_today nt ON nt.product_id = p.id
             LEFT JOIN def_policy dp ON true
          WHERE p.is_active = true AND mc.is_active = true) src
  WHERE NOT is_viewer_only(uid());

-- ===================== vw_account_balances =====================
-- reloptions: (none)
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.vw_account_balances AS
 SELECT src.account_id,
    src.title,
    src.bank_name,
    src.account_type,
    src.currency,
    src.is_active,
    src.opening_balance,
    src.total_in,
    src.total_out,
    src.current_balance,
    src.in_count,
    src.out_count
   FROM ( WITH bank_moves AS (
                 SELECT jl.account_ref_id AS account_id,
                    COALESCE(sum(jl.debit), 0::numeric) AS total_in,
                    COALESCE(sum(jl.credit), 0::numeric) AS total_out,
                    count(*) FILTER (WHERE jl.debit > 0::numeric) AS in_count,
                    count(*) FILTER (WHERE jl.credit > 0::numeric) AS out_count
                   FROM journal_lines jl
                     JOIN journal_entries je ON je.id = jl.journal_entry_id
                  WHERE jl.account_kind = 'bank'::text AND je.status = 'posted'::text AND je.reverses_entry_id IS NULL AND NOT (EXISTS ( SELECT 1
                           FROM journal_entries r
                          WHERE r.reverses_entry_id = je.id))
                  GROUP BY jl.account_ref_id
                )
         SELECT ba.id AS account_id,
            ba.title,
            ba.bank_name,
            ba.account_type,
            ba.currency,
            ba.is_active,
            ba.opening_balance,
            COALESCE(m.total_in, 0::numeric) AS total_in,
            COALESCE(m.total_out, 0::numeric) AS total_out,
            ba.opening_balance + COALESCE(m.total_in, 0::numeric) - COALESCE(m.total_out, 0::numeric) AS current_balance,
            COALESCE(m.in_count, 0::bigint) AS in_count,
            COALESCE(m.out_count, 0::bigint) AS out_count
           FROM bank_accounts ba
             LEFT JOIN bank_moves m ON m.account_id = ba.id) src
  WHERE NOT is_viewer_only(uid());

-- ===================== vw_customer_receivables =====================
-- reloptions: (none)
-- owner: supabase_admin
CREATE OR REPLACE VIEW public.vw_customer_receivables AS
 SELECT src.customer_id,
    src.customer_name,
    src.invoice_id,
    src.invoice_number,
    src.invoice_type,
    src.invoice_status,
    src.due_date,
    src.total_amount,
    src.deposit_amount,
    src.confirmed_paid_amount,
    src.outstanding_amount,
    src.commitment_confirmed,
    src.days_until_due,
    src.is_overdue,
    src.created_at,
    src.aging_bucket
   FROM ( WITH paid_quote AS (
                 SELECT prl.quote_id AS doc_id,
                    COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
                   FROM payment_receipt_links prl
                     JOIN payment_receipts pr ON pr.id = prl.receipt_id
                  WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
                  GROUP BY prl.quote_id
                )
         SELECT q.customer_id,
            COALESCE(c.name, q.customer_name) AS customer_name,
            q.id AS invoice_id,
            q.quote_number AS invoice_number,
            'sales_quote'::text AS invoice_type,
            q.status::text AS invoice_status,
            q.expires_at::date AS due_date,
            q.final_amount::numeric(18,2) AS total_amount,
            0::numeric AS deposit_amount,
            COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
            GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
            true AS commitment_confirmed,
                CASE
                    WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - CURRENT_DATE
                    ELSE NULL::integer
                END AS days_until_due,
            q.expires_at IS NOT NULL AND q.expires_at::date < CURRENT_DATE AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
            q.created_at,
                CASE
                    WHEN q.expires_at IS NULL THEN 'current'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 0 THEN 'current'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 30 THEN 'd1_30'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 60 THEN 'd31_60'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 90 THEN 'd61_90'::text
                    ELSE 'd90_plus'::text
                END AS aging_bucket
           FROM sales_quotes q
             LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN paid_quote p ON p.doc_id = q.id
          WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric) src
  WHERE NOT is_viewer_only(uid());

-- ===================== vw_supplier_payables =====================
-- reloptions: (none)
-- owner: supabase_admin
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
            COALESCE(p.cash_price_currency, p.currency) AS currency,
            p.paid_at,
            p.paid_at IS NOT NULL AS is_paid,
                CASE
                    WHEN p.paid_at IS NOT NULL THEN 0::numeric
                    ELSE COALESCE(p.cash_price, p.total_amount, 0::numeric)
                END AS outstanding_amount,
                CASE
                    WHEN p.paid_at IS NOT NULL THEN NULL::integer
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - CURRENT_DATE
                    ELSE p.purchase_date - CURRENT_DATE
                END AS days_until_due,
            p.paid_at IS NULL AND
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END < CURRENT_DATE AS is_overdue,
            NULL::text AS product_summary,
            p.created_at,
                CASE
                    WHEN p.paid_at IS NOT NULL THEN 'current'::text
                    WHEN (CURRENT_DATE -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 0 THEN 'current'::text
                    WHEN (CURRENT_DATE -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 30 THEN 'd1_30'::text
                    WHEN (CURRENT_DATE -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 60 THEN 'd31_60'::text
                    WHEN (CURRENT_DATE -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 90 THEN 'd61_90'::text
                    ELSE 'd90_plus'::text
                END AS aging_bucket
           FROM purchases p
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id) src
  WHERE NOT is_viewer_only(uid());

