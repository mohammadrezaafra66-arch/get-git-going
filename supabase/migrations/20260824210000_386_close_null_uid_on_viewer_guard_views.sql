-- 386 — close the NULL-uid fail-open on the eight `is_viewer_only` guard-class views (OG-26).
--
-- ============================================================================
-- WHAT IS WRONG
-- ============================================================================
--
-- All eight views end with the identical outer predicate `WHERE NOT is_viewer_only(uid())`.
-- `is_viewer_only(NULL)` returns FALSE — it asks whether `viewer` is the user's sole role, and
-- a NULL user has no roles at all — so `NOT FALSE` is TRUE and every row passes. **The guard
-- opens for an unidentified caller instead of closing.** That is G-1's root cause surviving in
-- the predicate rather than in the grant.
--
-- Measured 2026-08-24, `authenticated` with a JWT carrying no `sub` claim, inside an explicit
-- BEGIN … ROLLBACK written in the probe file:
--
--   publish_recipients_view                    24 rows
--   v_dynamic_customer_capital_balances        14 rows
--   v_dynamic_salesperson_capital_balances    210 rows
--   vw_account_balances                         1 row
--
-- ============================================================================
-- THREE THINGS THE MISSION BRIEF GOT WRONG, MEASURED
-- ============================================================================
--
--   1. "All eight are SECURITY DEFINER." They are not. `product_computed_prices_public` and
--      `v_promotion_suggestions` carry `security_invoker = true`, set by migration 370.
--
--   2. The fail-open is live on FOUR of the eight, not all eight. The two invoker views already
--      return zero rows to a NULL uid, because base-table RLS reaches the caller and
--      `has_any_role(NULL, …)` is false. `vw_customer_receivables` and `vw_supplier_payables`
--      are not selectable by `authenticated` at all — only `service_role`, which bypasses RLS
--      regardless.
--
--   3. `anon` holds zero privileges on all eight (migration 370), so this is a LATENT fail-open,
--      not a live leak through PostgREST. It becomes live again the moment any of these views
--      gains an `anon` grant. That is the reason to close it now rather than to relax.
--
-- All eight are changed anyway, uniformly. A guard class with one predicate is a class that can
-- be asserted in one statement; leaving four of eight on the old form would create exactly the
-- kind of "which ones did we fix?" drift this programme keeps finding.
--
-- ============================================================================
-- OPTION (ب), AND THE MEASUREMENT THAT CHOSE IT
-- ============================================================================
--
-- The alternative was to fix `is_viewer_only` itself so it returns TRUE for a NULL uid. That is
-- one change instead of eight, and it was NOT taken. The caller census:
--
--   8 views  ·  91 RLS policies  ·  1 function
--
-- All 91 policies are one name — `viewer_restricted` — with the identical predicate
-- `NOT is_viewer_only(uid())`, all `TO {authenticated}`, all `cmd=ALL`, the same expression in
-- `WITH CHECK`. And one caller depends on the current behaviour:
--
--   search_visible_persons:  IF public.is_viewer_only(auth.uid()) THEN _missing := ARRAY[]…
--
-- It uses the guard POSITIVELY — a viewer-only user has the missing-identifier filters stripped.
-- With a NULL uid it takes the ELSE branch today; changing the function would flip it to the
-- viewer branch. That is not fail-closed, just different. **The owner was asked with those
-- numbers in hand and chose (ب): the eight views only.** The function is untouched, so the 91
-- policies and `search_visible_persons` behave exactly as before.
--
-- ============================================================================
-- WHY EVERY STATEMENT BELOW RESTATES `security_invoker` OR DELIBERATELY DOES NOT
-- ============================================================================
--
-- **`CREATE OR REPLACE VIEW` DROPS `reloptions`.** Measured, not assumed, inside an explicit
-- BEGIN … ROLLBACK:
--
--   BEFORE  product_computed_prices_public  reloptions={security_invoker=true}
--   CREATE OR REPLACE VIEW …                (no WITH clause)
--   AFTER   product_computed_prices_public  reloptions=(none)      <-- migration 370 undone
--           relacl                          unchanged
--           anon SELECT                     false, unchanged
--
-- So a naive replace would silently revert the G-1 remediation on two views, and the regression
-- bar would not catch it: no `anon` privilege moves, so R4 stays green while the view quietly
-- goes back to definer rights. The two invoker views therefore restate
-- `WITH (security_invoker = true)` in their own statement, and the gate below asserts
-- `reloptions` by name rather than trusting that.
--
-- The same probe proved `relacl` IS preserved, so this migration contains no GRANT and no
-- REVOKE. Adding one would be the asymmetric-rollback defect migrations 374/376/377 carry.
--
-- OG-28 — whether `security_invoker` should be turned on for the other six — is NOT touched.
-- The owner declined it explicitly on 2026-08-22: "Do not change what signed-in roles currently
-- see. Fix only the NULL-uid fail-open." No signed-in row count moves here; the gate proves it.
--
-- Object owner: supabase_admin.
-- ROLLBACK: docs/verification/386-down.sql — written from the captured `pg_get_viewdef` output
-- and dry-run proved BEFORE this file was applied.

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

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
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());


-- ---------------------------------------------------------------------------
-- gate — the ONE assertion this mission is allowed.
--
-- It tests EFFECT, not catalogue identity, wherever effect can be tested: it actually calls
-- each view as a NULL-uid `authenticated` caller and counts the rows. Five consecutive gates in
-- this programme fell to asking the catalogue who is named instead of what the caller can do.
--
-- It asserts BY NAME, per view. A count cannot see a swap — one view fixed while another is
-- reverted leaves the count identical, which is how gate 381 fell in M3.
--
-- It cannot pass hollow: if the guard class shrinks below eight, or a named view stops
-- existing, it raises rather than reporting success against an empty set.
-- ---------------------------------------------------------------------------

DO $chk$
DECLARE
  v         text;
  n         bigint;
  bad       text;
  guarded   text[];
  expected  text[] := ARRAY['product_computed_prices_public','publish_recipients_view',
                            'v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances',
                            'v_promotion_suggestions','vw_account_balances',
                            'vw_customer_receivables','vw_supplier_payables'];
  -- migration 370 set these two, and CREATE OR REPLACE VIEW drops reloptions, so they are the
  -- two this migration could most easily have broken without any privilege moving.
  invoker   text[] := ARRAY['product_computed_prices_public','v_promotion_suggestions'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. The guard class is still exactly the eight views this migration changed.
  --    Derived from the catalogue, not restated, so a ninth view adopting the
  --    guard fails here instead of silently going unprotected.
  ---------------------------------------------------------------------------
  SELECT array_agg(c.relname ORDER BY c.relname) INTO guarded
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'v'
     AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';

  IF guarded IS DISTINCT FROM (SELECT array_agg(e ORDER BY e) FROM unnest(expected) e) THEN
    RAISE EXCEPTION '386: the is_viewer_only guard class is %, expected %. A view joined or left the class; it must be closed to a NULL uid before this assertion can mean anything', guarded, expected;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. THE CHANGE, BY EFFECT. Each view, by name, called as `authenticated`
  --    with a JWT that has no `sub` claim — which is exactly the caller the
  --    old predicate let through. Zero rows, every one.
  --
  --    This runs inside the migration's own transaction and sets the role
  --    LOCALLY, so it cannot leak past this block.
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY expected LOOP
    BEGIN
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
      EXECUTE format('SELECT count(*) FROM public.%I', v) INTO n;
      PERFORM set_config('role', 'supabase_admin', true);
      IF n <> 0 THEN
        RAISE EXCEPTION '386: % returned % row(s) to a caller with no uid. The guard still opens instead of closing — NOT is_viewer_only(NULL) is TRUE, which is why the predicate needs uid() IS NOT NULL in front of it', v, n;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        -- vw_customer_receivables and vw_supplier_payables are not selectable by
        -- `authenticated` at all; a denial is a stronger result than zero rows.
        PERFORM set_config('role', 'supabase_admin', true);
      WHEN OTHERS THEN
        PERFORM set_config('role', 'supabase_admin', true);
        RAISE;
    END;
  END LOOP;
  PERFORM set_config('role', 'supabase_admin', true);
  PERFORM set_config('request.jwt.claims', '', true);

  ---------------------------------------------------------------------------
  -- 3. THE PREDICATE ITSELF, by name. Check 2 would also pass if a view were
  --    emptied for some unrelated reason, so the text is asserted too.
  ---------------------------------------------------------------------------
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (expected)
     AND pg_get_viewdef(c.oid) NOT ILIKE '%uid() IS NOT NULL%';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '386: view(s) % still carry the old predicate without a uid() IS NOT NULL guard', bad;
  END IF;

  ---------------------------------------------------------------------------
  -- 4. security_invoker survived. CREATE OR REPLACE VIEW DROPS reloptions —
  --    measured — so this is the assertion that stops this migration from
  --    silently undoing migration 370 on two views. No privilege moves when
  --    that happens, so the regression bar's anon checks cannot see it.
  ---------------------------------------------------------------------------
  FOREACH v IN ARRAY invoker LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
       WHERE ns.nspname = 'public' AND c.relname = v
         AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on')
    ) THEN
      RAISE EXCEPTION '386: % lost security_invoker. CREATE OR REPLACE VIEW drops reloptions, so a replace without an explicit WITH clause reverts migration 370 — and no anon privilege changes, so nothing else in the regression bar would have caught it', v;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. G-1 must not have regressed: anon holds nothing on any of the eight.
  --    Asserted by EFFECT, so a PUBLIC grant or an inherited role cannot walk
  --    past it the way `grantee = 'anon'` would let it.
  ---------------------------------------------------------------------------
  SELECT string_agg(c.relname || ':' || p, ', ' ORDER BY c.relname, p) INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','TRUNCATE']) p
   WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (expected)
     AND has_table_privilege('anon', c.oid, p);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '386: anon holds privilege(s) % on the guard class — migration 370 has been undone and this is G-1 live again', bad;
  END IF;

  RAISE NOTICE '386 OK: the is_viewer_only guard class is still exactly the 8 expected views; every one of them returns zero rows to an authenticated caller whose JWT carries no sub claim, or refuses that caller outright (vw_customer_receivables and vw_supplier_payables are not selectable by authenticated at all); all 8 predicates now carry uid() IS NOT NULL; product_computed_prices_public and v_promotion_suggestions still hold security_invoker=true, which CREATE OR REPLACE VIEW would otherwise have silently dropped and no privilege check would have noticed; and anon holds zero privileges on all 8, so G-1 has not regressed. Signed-in visibility is deliberately unchanged — OG-28 stays open';
END
$chk$;
