-- Down script for migration 281. No BEGIN/COMMIT: the caller owns the transaction.
-- Drops the restrictive policies, restores the eight views to their pre-281 definitions and
-- puts the viewer's module flags back. The seeded viewer/warehouse row is left in place: it
-- is a row that should always have existed, and removing it would re-open the
-- has_dynamic_permission fallback.
SET client_encoding='UTF8';

DROP POLICY IF EXISTS viewer_restricted ON public.customers;
DROP POLICY IF EXISTS viewer_restricted ON public.external_parties;
DROP POLICY IF EXISTS viewer_restricted ON public.person_identifiers;
DROP POLICY IF EXISTS viewer_restricted ON public.person_merge_candidates;
DROP POLICY IF EXISTS viewer_restricted ON public.profiles;
DROP POLICY IF EXISTS viewer_restricted ON public.suppliers;
DROP POLICY IF EXISTS viewer_restricted ON public.visitors;
DROP POLICY IF EXISTS viewer_restricted ON public.inquiries;
DROP POLICY IF EXISTS viewer_restricted ON public.inquiry_price_cache;
DROP POLICY IF EXISTS viewer_restricted ON public.inquiry_status_history;
DROP POLICY IF EXISTS viewer_restricted ON public.invoices;
DROP POLICY IF EXISTS viewer_restricted ON public.sale_list_items;
DROP POLICY IF EXISTS viewer_restricted ON public.sale_list_versions;
DROP POLICY IF EXISTS viewer_restricted ON public.sale_lists;
DROP POLICY IF EXISTS viewer_restricted ON public.sales_quote_items;
DROP POLICY IF EXISTS viewer_restricted ON public.sales_quote_share_logs;
DROP POLICY IF EXISTS viewer_restricted ON public.sales_quotes;
DROP POLICY IF EXISTS viewer_restricted ON public.sales_reminders;
DROP POLICY IF EXISTS viewer_restricted ON public.bank_accounts;
DROP POLICY IF EXISTS viewer_restricted ON public.journal_entries;
DROP POLICY IF EXISTS viewer_restricted ON public.journal_lines;
DROP POLICY IF EXISTS viewer_restricted ON public.payment_receipt_documents;
DROP POLICY IF EXISTS viewer_restricted ON public.payment_receipt_links;
DROP POLICY IF EXISTS viewer_restricted ON public.payment_receipts;
DROP POLICY IF EXISTS viewer_restricted ON public.capital_allocation_ledger;
DROP POLICY IF EXISTS viewer_restricted ON public.credit_requests;
DROP POLICY IF EXISTS viewer_restricted ON public.credit_score_snapshots;
DROP POLICY IF EXISTS viewer_restricted ON public.credit_scoring_rules;
DROP POLICY IF EXISTS viewer_restricted ON public.customer_capital_allocations_dynamic;
DROP POLICY IF EXISTS viewer_restricted ON public.customer_credit_balance;
DROP POLICY IF EXISTS viewer_restricted ON public.customer_credit_ledger;
DROP POLICY IF EXISTS viewer_restricted ON public.customer_credit_profile;
DROP POLICY IF EXISTS viewer_restricted ON public.daily_capital_inputs;
DROP POLICY IF EXISTS viewer_restricted ON public.daily_capital_settings;
DROP POLICY IF EXISTS viewer_restricted ON public.daily_capital_snapshots;
DROP POLICY IF EXISTS viewer_restricted ON public.salesperson_capital_allocations_dynamic;
DROP POLICY IF EXISTS viewer_restricted ON public.product_suppliers;
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_items;
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_prices;
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_request_fulfillments;
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_request_status_history;
DROP POLICY IF EXISTS viewer_restricted ON public.purchase_requests;
DROP POLICY IF EXISTS viewer_restricted ON public.purchases;
DROP POLICY IF EXISTS viewer_restricted ON public.recent_purchase_settings;
DROP POLICY IF EXISTS viewer_restricted ON public.categories;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_table_cells;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_table_columns;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_table_rows;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_tables;
DROP POLICY IF EXISTS viewer_restricted ON public.price_calculation_snapshots;
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_board_access_requests;
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_board_settings;
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_board_viewer_sessions;
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_recompute_queue;
DROP POLICY IF EXISTS viewer_restricted ON public.pricing_rules;
DROP POLICY IF EXISTS viewer_restricted ON public.product_computed_prices;
DROP POLICY IF EXISTS viewer_restricted ON public.product_sale_price_history;
DROP POLICY IF EXISTS viewer_restricted ON public.shipping_cost_rules;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_entity_scores;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_parameter_weights;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_scoring_parameters;
DROP POLICY IF EXISTS viewer_restricted ON public.employee_level_up_events;
DROP POLICY IF EXISTS viewer_restricted ON public.employee_progress;
DROP POLICY IF EXISTS viewer_restricted ON public.employee_score_events;
DROP POLICY IF EXISTS viewer_restricted ON public.employee_scores;
DROP POLICY IF EXISTS viewer_restricted ON public.presence_logs;
DROP POLICY IF EXISTS viewer_restricted ON public.staff_daily_performance_metrics;
DROP POLICY IF EXISTS viewer_restricted ON public.shop_settings;
DROP POLICY IF EXISTS viewer_restricted ON public.ai_provider_health;
DROP POLICY IF EXISTS viewer_restricted ON public.ai_providers;
DROP POLICY IF EXISTS viewer_restricted ON public.ai_usage_routes;
DROP POLICY IF EXISTS viewer_restricted ON public.audit_logs;
DROP POLICY IF EXISTS viewer_restricted ON public.automation_modules;
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_key_audit_log;
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_key_label_access;
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_key_table_access;
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_keys;
DROP POLICY IF EXISTS viewer_restricted ON public.bot_api_usage_logs;
DROP POLICY IF EXISTS viewer_restricted ON public.custom_roles;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_parameter_weights_backup_142;
DROP POLICY IF EXISTS viewer_restricted ON public.dynamic_parameter_weights_backup_20260722;
DROP POLICY IF EXISTS viewer_restricted ON public.knowledge_documents_backup_20260722;
DROP POLICY IF EXISTS viewer_restricted ON public.role_permissions;
DROP POLICY IF EXISTS viewer_restricted ON public.user_roles;
DROP POLICY IF EXISTS viewer_restricted ON public.product_interaction_events;
DROP POLICY IF EXISTS viewer_restricted ON public.product_owner_assignments;
DROP POLICY IF EXISTS viewer_restricted ON public.product_recommendation_overrides;
DROP POLICY IF EXISTS viewer_restricted ON public.promotion_nomination_policy;

CREATE OR REPLACE VIEW public.product_computed_prices_public AS
SELECT product_computed_prices.id,
    product_computed_prices.product_id,
    product_computed_prices.sale_price_type_id,
    product_computed_prices.pricing_rule_id,
    product_computed_prices.final_sale_price,
    product_computed_prices.rounded_sale_price,
    product_computed_prices.computed_at,
    product_computed_prices.source
   FROM product_computed_prices
  WHERE product_computed_prices.settlement_type_id IS NULL;

CREATE OR REPLACE VIEW public.publish_recipients_view AS
SELECT p.id,
    p.full_name,
    array_agg(ur.role ORDER BY ur.role) AS roles
   FROM profiles p
     JOIN user_roles ur ON ur.user_id = p.id
  WHERE p.is_active = true AND (ur.role = ANY (ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]))
  GROUP BY p.id, p.full_name;

CREATE OR REPLACE VIEW public.v_dynamic_customer_capital_balances AS
SELECT c.id AS allocation_id,
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
     CROSS JOIN LATERAL _capital_alloc_used('customer'::text, c.id) u(held, consumed);

CREATE OR REPLACE VIEW public.v_dynamic_salesperson_capital_balances AS
SELECT s.id AS allocation_id,
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
     CROSS JOIN LATERAL _capital_alloc_used('salesperson'::text, s.id) u(held, consumed);

CREATE OR REPLACE VIEW public.v_promotion_suggestions AS
WITH label_sums AS (
         SELECT pll.product_id,
            COALESCE(sum(pl.weight), 0::bigint)::numeric AS label_weight_sum
           FROM product_label_links pll
             JOIN product_labels pl ON pl.id = pll.label_id AND pl.is_active = true
          GROUP BY pll.product_id
        ), sales_90d AS (
         SELECT ii.product_id,
            COALESCE(sum(ii.quantity), 0::numeric) AS qty_90d
           FROM invoice_items ii
             JOIN invoices i ON i.id = ii.invoice_id
          WHERE i.issue_date >= (CURRENT_DATE - '90 days'::interval) AND COALESCE(i.status, ''::text) <> 'cancelled'::text
          GROUP BY ii.product_id
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
  WHERE p.is_active = true AND mc.is_active = true;

CREATE OR REPLACE VIEW public.vw_account_balances AS
WITH inflow AS (
         SELECT pr.destination_bank_account_id AS account_id,
            COALESCE(sum(pr.amount), 0::numeric) AS total_in,
            count(*) AS in_count
           FROM payment_receipts pr
          WHERE pr.destination_bank_account_id IS NOT NULL AND pr.status = 'approved'::text
          GROUP BY pr.destination_bank_account_id
        ), outflow AS (
         SELECT pv.source_bank_account_id AS account_id,
            COALESCE(sum(pv.amount), 0::numeric) AS total_out,
            count(*) AS out_count
           FROM payment_vouchers pv
          WHERE pv.status = 'approved'::text
          GROUP BY pv.source_bank_account_id
        )
 SELECT ba.id AS account_id,
    ba.title,
    ba.bank_name,
    ba.account_type,
    ba.currency,
    ba.is_active,
    ba.opening_balance,
    COALESCE(i.total_in, 0::numeric) AS total_in,
    COALESCE(o.total_out, 0::numeric) AS total_out,
    ba.opening_balance + COALESCE(i.total_in, 0::numeric) - COALESCE(o.total_out, 0::numeric) AS current_balance,
    COALESCE(i.in_count, 0::bigint) AS in_count,
    COALESCE(o.out_count, 0::bigint) AS out_count
   FROM bank_accounts ba
     LEFT JOIN inflow i ON i.account_id = ba.id
     LEFT JOIN outflow o ON o.account_id = ba.id;

CREATE OR REPLACE VIEW public.vw_customer_receivables AS
WITH paid_inv AS (
         SELECT prl.invoice_id AS doc_id,
            COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
           FROM payment_receipt_links prl
             JOIN payment_receipts pr ON pr.id = prl.receipt_id
          WHERE prl.invoice_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
          GROUP BY prl.invoice_id
        ), paid_quote AS (
         SELECT prl.quote_id AS doc_id,
            COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
           FROM payment_receipt_links prl
             JOIN payment_receipts pr ON pr.id = prl.receipt_id
          WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
          GROUP BY prl.quote_id
        )
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
        CASE
            WHEN i.due_date IS NOT NULL THEN i.due_date - CURRENT_DATE
            ELSE NULL::integer
        END AS days_until_due,
    i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE AND (i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
    i.created_at,
        CASE
            WHEN i.due_date IS NULL THEN 'current'::text
            WHEN (CURRENT_DATE - i.due_date) <= 0 THEN 'current'::text
            WHEN (CURRENT_DATE - i.due_date) <= 30 THEN 'd1_30'::text
            WHEN (CURRENT_DATE - i.due_date) <= 60 THEN 'd31_60'::text
            WHEN (CURRENT_DATE - i.due_date) <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN paid_inv p ON p.doc_id = i.id
  WHERE i.commitment_confirmed = true AND COALESCE(i.status, ''::text) <> 'cancelled'::text AND GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric
UNION ALL
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
  WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric;

CREATE OR REPLACE VIEW public.vw_supplier_payables AS
SELECT p.supplier_id,
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
     LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id;
DROP POLICY IF EXISTS dynamic_parameter_weights_backup_142_admin_read ON public.dynamic_parameter_weights_backup_142;
ALTER TABLE public.dynamic_parameter_weights_backup_142 DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dynamic_parameter_weights_backup_20260722_admin_read ON public.dynamic_parameter_weights_backup_20260722;
ALTER TABLE public.dynamic_parameter_weights_backup_20260722 DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_documents_backup_20260722_admin_read ON public.knowledge_documents_backup_20260722;
ALTER TABLE public.knowledge_documents_backup_20260722 DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_receipts_backup_20260722_admin_read ON public.payment_receipts_backup_20260722;
ALTER TABLE public.payment_receipts_backup_20260722 DISABLE ROW LEVEL SECURITY;

UPDATE public.role_permissions
   SET can_view = true, updated_at = now()
 WHERE role_name = 'viewer'
   AND module IN ('invoices', 'sales', 'purchases', 'price-lists', 'data-tables');

DROP FUNCTION IF EXISTS public.is_viewer_only(uuid);
