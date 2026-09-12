SET client_encoding='UTF8';

-- 526 -- catalogue repair: bring five migrations' asserted end states into effect where the
-- ledger records them as applied but the catalogue does not reflect them (R-1 / E-1 finding,
-- confirmed independently on a second, separate restore of prod13.dump on 2026-09-13).
--
-- ============================================================================================
-- WHAT THIS FILE IS, AND WHAT IT DELIBERATELY IS NOT
-- ============================================================================================
--
-- This is NOT a redefinition of 386/394/396/404/409. Those migrations are not edited (CLAUDE.md
-- rule 6) and their ledger rows are untouched; this migration gets a ledger row of its own,
-- at version 20260913090000, WRITTEN BY THE OPERATOR'S mig_apply STEP AND NOT BY THIS FILE.
-- Wording corrected 2026-09-12 by the Stage 2 gate: the previous sentence read "this
-- migration inserts its own new row", which invites the defect found in 535/536 -- a
-- self-INSERT makes the operator's ledger step report a duplicate-key ERROR, a stop
-- condition on the owner-typed run. No migration in this mission writes its own ledger row;
-- verified across all ten. See INTEGRATION-LOG.md, "Step 3 - gate finding G-1". Every
-- statement below is CATALOGUE-DRIVEN: it reads the live pg_catalog state of the target object,
-- compares it against the end state the original migration asserted (via that migration's own
-- gate, or via the live pg_get_functiondef/pg_get_viewdef read against the migration file), and
-- acts ONLY when the two disagree. Where TEST already carries the correct state, every check
-- below evaluates false and this migration is a complete no-op there -- proved in
-- docs/research/convergence/E-1-proof.md by applying it twice against a fresh restore and
-- diffing the catalogue before/after each run.
--
-- ============================================================================================
-- HOW THE TARGET STATE FOR EACH OBJECT WAS ESTABLISHED
-- ============================================================================================
--
-- For every function and RLS policy touched below, `grep -l 'CREATE OR REPLACE FUNCTION
-- public.<name>('` (or the policy's ALTER/CREATE POLICY) was run across supabase/migrations/ and
-- the LAST migration to define the object was read in full. In every case that is the migration
-- named in this file's task list (386/394/396/404/409) -- no later migration redefines any of
-- these nine objects' bodies. Two apparent near-misses were checked and ruled out:
--   * 457 (2026-09-05) redefines vw_supplier_payables again, AFTER 396 -- but that view is
--     already correct on production (confirmed below: no CURRENT_DATE, has tehran_today), so
--     this file does not touch it. Its presence is noted so nobody "fixes" it a third time.
--   * 462 (2026-09-06) redefines expire_stale_credit_holds(integer,integer) again, AFTER 409 --
--     and the LIVE 2-arg body on production already matches 462's text exactly (role set
--     admin/manager/accountant/sales, auth.uid() as actor_id). 409's own job -- dropping the
--     stale 1-arg overload -- is what remains undone, and is the only 409 repair here.
--
-- ============================================================================================
-- PRECONDITION -- every target object must exist before any repair logic runs
-- ============================================================================================
DO $pre526$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(x.what, ', ') INTO v_missing FROM (
    SELECT 'view product_computed_prices_public' AS what
     WHERE to_regclass('public.product_computed_prices_public') IS NULL
    UNION ALL SELECT 'view v_promotion_suggestions'
     WHERE to_regclass('public.v_promotion_suggestions') IS NULL
    UNION ALL SELECT 'view vw_account_balances'
     WHERE to_regclass('public.vw_account_balances') IS NULL
    UNION ALL SELECT 'function create_purchase(15-arg)'
     WHERE to_regprocedure('public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)') IS NULL
    UNION ALL SELECT 'function get_payables_list'
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='get_payables_list')
    UNION ALL SELECT 'function upsert_staff_daily_performance_metric'
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                         WHERE n.nspname='public' AND p.proname='upsert_staff_daily_performance_metric')
    UNION ALL SELECT 'policy sdpm_insert_privileged'
     WHERE NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='sdpm_insert_privileged'
                          AND polrelid='public.staff_daily_performance_metrics'::regclass)
    UNION ALL SELECT 'policy sdpm_update_privileged'
     WHERE NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='sdpm_update_privileged'
                          AND polrelid='public.staff_daily_performance_metrics'::regclass)
    UNION ALL SELECT 'function asan_list_bank_deposit_export(date,date)'
     WHERE to_regprocedure('public.asan_list_bank_deposit_export(date,date)') IS NULL
    UNION ALL SELECT 'function expire_stale_credit_holds(integer,integer)'
     WHERE to_regprocedure('public.expire_stale_credit_holds(integer,integer)') IS NULL
  ) x;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '526: cannot repair -- the following target object(s) are absent entirely, which is a different failure than "effect absent": %. This migration only repairs a body/predicate/grant that is out of date; an absent object needs its own investigation.', v_missing;
  END IF;
  RAISE NOTICE '526: precondition OK -- all nine target objects exist';
END
$pre526$;

-- ============================================================================================
-- 386 (a) -- product_computed_prices_public: security_invoker=true.
-- The predicate already carries uid() IS NOT NULL on production (verified), so only the
-- reloption needs restoring. ALTER VIEW SET does not touch the query text at all -- the
-- narrowest possible fix, and immune to 386's own documented hazard (CREATE OR REPLACE VIEW
-- drops reloptions).
-- ============================================================================================
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
     LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
    WHERE ns.nspname = 'public' AND c.relname = 'product_computed_prices_public'
      AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on')
  ) THEN 'false' ELSE 'true' END AS need_386a \gset

\if :need_386a
ALTER VIEW public.product_computed_prices_public SET (security_invoker = true);
\echo '526: [386a] set security_invoker=true on product_computed_prices_public (was unset)'
\else
\echo '526: [386a] product_computed_prices_public already carries security_invoker=true -- no-op'
\endif

-- ============================================================================================
-- 386 (b) -- v_promotion_suggestions: needs BOTH security_invoker=true AND the
-- "uid() IS NOT NULL AND" guard prefix. Neither survived on production. The body below is
-- byte-for-byte the query 386 wrote (verified: 386 is the last migration to CREATE OR REPLACE
-- this view; 387 only gates it, never redefines it).
--
-- NOTE ON pg_get_viewdef ARITY: the single-argument form `pg_get_viewdef(oid)` -- what 387's own
-- gate uses -- renders this predicate WITH the extra parens 387 asserts:
-- 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'. The two-argument "pretty" form
-- `pg_get_viewdef(oid, true)` renders the SAME stored expression WITHOUT them. Measured on
-- prod_rehearsal_e1 against the six views nothing here touches. This file uses the single-arg
-- form throughout, matching 387's own convention, so its "want" string is 387's string verbatim.
-- ============================================================================================
SELECT CASE WHEN
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
      WHERE ns.nspname = 'public' AND c.relname = 'v_promotion_suggestions'
        AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on')
    )
    OR right(pg_get_viewdef('public.v_promotion_suggestions'::regclass),
             length('WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'))
         <> 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'
  THEN 'true' ELSE 'false' END AS need_386b \gset

\if :need_386b
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
\echo '526: [386b] redefined v_promotion_suggestions -- restored security_invoker=true and the uid() IS NOT NULL guard'
\else
\echo '526: [386b] v_promotion_suggestions already correct -- no-op'
\endif

-- ============================================================================================
-- 386 (c) -- vw_account_balances: the "uid() IS NOT NULL AND" guard prefix is missing (the view
-- still reads "WHERE NOT is_viewer_only(uid())" only). This view is NOT in the security_invoker
-- pair, so only the predicate is repaired. 386 is the last migration to CREATE OR REPLACE this
-- view's query (verified).
-- ============================================================================================
-- Same pg_get_viewdef-arity note as 386(b) above -- single-arg form, 387's "want" string verbatim.
SELECT CASE WHEN
    right(pg_get_viewdef('public.vw_account_balances'::regclass),
          length('WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'))
      <> 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'
  THEN 'true' ELSE 'false' END AS need_386c \gset

\if :need_386c
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
\echo '526: [386c] redefined vw_account_balances -- restored the uid() IS NOT NULL guard'
\else
\echo '526: [386c] vw_account_balances already correct -- no-op'
\endif

-- ============================================================================================
-- 394 -- create_purchase: compare against public.tehran_today(), not the UTC CURRENT_DATE.
-- Byte-for-byte the body 394 wrote (verified: 394 is the last migration to CREATE OR REPLACE
-- this function; 252/251 predate it).
-- ============================================================================================
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)'::regprocedure
       AND (position('public.tehran_today()' in p.prosrc) = 0 OR p.prosrc ~ '>\s*CURRENT_DATE')
  ) THEN 'true' ELSE 'false' END AS need_394 \gset

\if :need_394
CREATE OR REPLACE FUNCTION public.create_purchase(p_product_id uuid, p_payment_term_id uuid, p_purchase_price numeric, p_currency text, p_quantity integer, p_purchase_date date, p_supplier_id uuid DEFAULT NULL::uuid, p_cash_price numeric DEFAULT NULL::numeric, p_warehouse_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid, p_allocate_quantity numeric DEFAULT NULL::numeric, p_allow_over_allocation boolean DEFAULT false, p_over_allocation_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  _uid         uuid := auth.uid();
  _is_priv     boolean;
  _notes       text;
  _currency    text;
  _line_total  numeric;
  _cash        numeric;
  _cash_cur    text;
  _purchase_id uuid;
  _item_id     uuid;
  _payload     jsonb;
  _hash        text;
  _existing    public.purchase_idempotency%ROWTYPE;
  _result      jsonb;
  _req         public.purchase_requests%ROWTYPE;
  _req_assignee uuid;
  _supplied    numeric := 0;
  _remaining   numeric := 0;
  _alloc       numeric;
  _over        boolean := false;
  _over_note   text;
  _total_alloc numeric;
  _effective   numeric;
  _new_status  text;
  _final_price numeric;
  _req_json    jsonb := NULL;
  _product     record;
  _term        record;
  _supplier    record;
  _warehouse   record;
BEGIN
  ---------------------------------------------------------------------------
  -- 1-2. Authentication and authorization (unchanged from 251).
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_NOT_AUTHENTICATED';
  END IF;

  _is_priv := public.has_any_role(_uid, ARRAY['admin','manager']::text[]);

  -- Standalone purchases (no request): admin/manager only, exactly as C2 and
  -- exactly as the RLS policy on purchases. Unchanged.
  IF p_request_id IS NULL AND NOT _is_priv THEN
    RAISE EXCEPTION 'اجازهٔ ثبت سند خرید ندارید.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_PERMISSION_DENIED';
  END IF;

  -- Request path: the buyer the request is ASSIGNED to may register its
  -- purchase, and admin/manager may override. A cheap unlocked read is enough
  -- to decide access; the authoritative re-check happens under FOR UPDATE below,
  -- so a concurrent reassignment cannot slip through.
  --
  -- This is the one place where the RPC is broader than the RLS policy on
  -- purchases (admin/manager). It has to be: the whole feature is that the
  -- assigned buyer registers the purchase. In practice nothing changes today --
  -- create_purchase_request assigns every request to the first active manager,
  -- so every assignee already holds manager. Aligning RLS and role_permissions
  -- with this rule is the separate permission-unification phase.
  IF p_request_id IS NOT NULL THEN
    SELECT assigned_to INTO _req_assignee
      FROM public.purchase_requests WHERE id = p_request_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'درخواست خرید پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'REQUEST_NOT_FOUND';
    END IF;

    IF NOT _is_priv AND _req_assignee IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'این درخواست به شما تخصیص داده نشده است.'
        USING ERRCODE = '42501', HINT = 'NOT_ASSIGNED';
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. Over-allocation arguments only make sense with a request.
  ---------------------------------------------------------------------------
  _over_note := NULLIF(btrim(COALESCE(p_over_allocation_note,'')),'');
  IF p_request_id IS NULL
     AND (p_allocate_quantity IS NOT NULL
          OR COALESCE(p_allow_over_allocation,false)
          OR _over_note IS NOT NULL) THEN
    RAISE EXCEPTION 'پارامترهای تخصیص بدون درخواست خرید معنا ندارند.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_ALLOCATION_WITHOUT_REQUEST';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. Shared validation (identical to 251).
  ---------------------------------------------------------------------------
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'انتخاب محصول الزامی است.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRODUCT_REQUIRED';
  END IF;

  SELECT id, name, status INTO _product FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده یافت نشد.'
      USING ERRCODE = '23503', HINT = 'PURCHASE_PRODUCT_INVALID';
  END IF;
  IF _product.status <> 'active' THEN
    RAISE EXCEPTION 'محصول انتخاب‌شده فعال نیست.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRODUCT_INACTIVE';
  END IF;

  SELECT id, is_active INTO _term FROM public.payment_terms WHERE id = p_payment_term_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'زمان تسویه انتخاب‌شده یافت نشد.'
      USING ERRCODE = '23503', HINT = 'PURCHASE_PAYMENT_TERM_INVALID';
  END IF;
  IF NOT _term.is_active THEN
    RAISE EXCEPTION 'زمان تسویه انتخاب‌شده فعال نیست.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PAYMENT_TERM_INACTIVE';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT id, is_active INTO _supplier FROM public.suppliers WHERE id = p_supplier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'تأمین‌کنندهٔ انتخاب‌شده یافت نشد.'
        USING ERRCODE = '23503', HINT = 'PURCHASE_SUPPLIER_INVALID';
    END IF;
    IF NOT _supplier.is_active THEN
      RAISE EXCEPTION 'تأمین‌کنندهٔ انتخاب‌شده فعال نیست.'
        USING ERRCODE = '22023', HINT = 'PURCHASE_SUPPLIER_INACTIVE';
    END IF;
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    SELECT id, is_active INTO _warehouse FROM public.warehouses WHERE id = p_warehouse_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'انبار انتخاب‌شده یافت نشد.'
        USING ERRCODE = '23503', HINT = 'PURCHASE_WAREHOUSE_INVALID';
    END IF;
    IF NOT _warehouse.is_active THEN
      RAISE EXCEPTION 'انبار انتخاب‌شده فعال نیست.'
        USING ERRCODE = '22023', HINT = 'PURCHASE_WAREHOUSE_INACTIVE';
    END IF;
  END IF;

  _currency := lower(btrim(COALESCE(p_currency, '')));
  IF _currency NOT IN ('toman','usd','aed') THEN
    RAISE EXCEPTION 'ارز انتخاب‌شده برای سند خرید پشتیبانی نمی‌شود.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_CURRENCY_INVALID';
  END IF;

  IF p_purchase_price IS NULL OR p_purchase_price <= 0 THEN
    RAISE EXCEPTION 'قیمت خرید باید بزرگ‌تر از صفر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_PRICE_INVALID';
  END IF;

  IF p_cash_price IS NOT NULL AND p_cash_price <= 0 THEN
    RAISE EXCEPTION 'قیمت نقدی باید بزرگ‌تر از صفر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_CASH_PRICE_INVALID';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'تعداد باید عددی صحیح و حداقل ۱ باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_QUANTITY_INVALID';
  END IF;

  IF p_purchase_date IS NULL THEN
    RAISE EXCEPTION 'تاریخ خرید الزامی است.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_REQUIRED';
  END IF;
  IF p_purchase_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ خرید نمی‌تواند در آینده باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_DATE_FUTURE';
  END IF;

  _notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF _notes IS NOT NULL AND length(_notes) > 500 THEN
    RAISE EXCEPTION 'توضیحات نمی‌تواند بیش از ۵۰۰ کاراکتر باشد.'
      USING ERRCODE = '22023', HINT = 'PURCHASE_NOTES_TOO_LONG';
  END IF;

  _line_total := p_purchase_price * p_quantity;
  _cash       := p_cash_price;
  _cash_cur   := CASE WHEN _cash IS NOT NULL THEN _currency ELSE NULL END;

  ---------------------------------------------------------------------------
  -- 5. Idempotency. The payload now carries the request context, so the same
  --    key used for a different request or a different allocation is a
  --    conflict rather than a silent replay.
  ---------------------------------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    _payload := jsonb_build_object(
      'request_id',        p_request_id::text,
      'product_id',        p_product_id::text,
      'quantity',          p_quantity::text,
      'allocate_quantity', CASE WHEN p_allocate_quantity IS NULL THEN NULL
                                ELSE trim_scale(round(p_allocate_quantity, 3))::text END,
      'allow_over',        COALESCE(p_allow_over_allocation,false)::text,
      'over_note',         _over_note,
      'purchase_price',    trim_scale(round(p_purchase_price, 2))::text,
      'cash_price',        CASE WHEN _cash IS NULL THEN NULL
                                ELSE trim_scale(round(_cash, 2))::text END,
      'currency',          _currency,
      'supplier_id',       p_supplier_id::text,
      'warehouse_id',      p_warehouse_id::text,
      'payment_term_id',   p_payment_term_id::text,
      'purchase_date',     to_char(p_purchase_date, 'YYYY-MM-DD'),
      'created_by',        _uid::text
    );
    _hash := encode(extensions.digest(_payload::text, 'sha256'), 'hex');

    SELECT * INTO _existing FROM public.purchase_idempotency
     WHERE idempotency_key = p_idempotency_key FOR UPDATE;

    IF FOUND THEN
      IF _existing.created_by <> _uid THEN
        RAISE EXCEPTION 'این عملیات قبلاً توسط کاربر دیگری ثبت شده است.'
          USING ERRCODE = '23505', HINT = 'PURCHASE_IDEMPOTENCY_CONFLICT';
      END IF;
      IF _existing.payload_hash <> _hash THEN
        RAISE EXCEPTION 'این عملیات قبلاً با اطلاعات متفاوتی ثبت شده است.'
          USING ERRCODE = '23505', HINT = 'PURCHASE_IDEMPOTENCY_CONFLICT';
      END IF;
      IF _existing.state = 'completed' THEN
        RETURN jsonb_set(_existing.result, '{created}', 'false'::jsonb);
      END IF;
      IF _existing.state = 'processing' AND _existing.created_at > now() - interval '5 minutes' THEN
        RAISE EXCEPTION 'این عملیات هم‌اکنون در حال ثبت است. لطفاً چند لحظه صبر کنید.'
          USING ERRCODE = '55006', HINT = 'PURCHASE_IN_PROGRESS';
      END IF;
      DELETE FROM public.purchase_idempotency WHERE idempotency_key = p_idempotency_key;
    END IF;

    INSERT INTO public.purchase_idempotency
      (idempotency_key, created_by, scope, payload_hash, state)
    VALUES (p_idempotency_key, _uid, 'create_purchase', _hash, 'processing');
  END IF;

  ---------------------------------------------------------------------------
  -- 6. Request branch: lock, validate, compute the allocation.
  --    The lock is taken BEFORE anything is written, so a concurrent buyer
  --    waits here and then sees the updated remaining quantity.
  ---------------------------------------------------------------------------
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO _req FROM public.purchase_requests
     WHERE id = p_request_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'درخواست خرید پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'REQUEST_NOT_FOUND';
    END IF;

    IF _req.legacy_no_fulfillment THEN
      RAISE EXCEPTION 'این درخواست قدیمی سند مرتبط قابل اتکا ندارد.'
        USING ERRCODE = '22023', HINT = 'REQUEST_LEGACY_UNKNOWN';
    END IF;

    IF _req.status = 'cancelled' THEN
      RAISE EXCEPTION 'این درخواست لغو شده است.'
        USING ERRCODE = '22023', HINT = 'REQUEST_CANCELLED';
    END IF;

    IF _req.status NOT IN ('approved','partially_purchased') THEN
      IF _req.status IN ('purchased','delivered') THEN
        RAISE EXCEPTION 'این درخواست قبلاً به‌طور کامل تأمین شده است.'
          USING ERRCODE = '22023', HINT = 'REQUEST_ALREADY_COMPLETED';
      END IF;
      RAISE EXCEPTION 'این درخواست هنوز آماده ثبت خرید نیست.'
        USING ERRCODE = '22023', HINT = 'REQUEST_NOT_APPROVED';
    END IF;

    -- Authoritative assignment re-check, now under the row lock: a concurrent
    -- reassignment between the access check above and here must not slip past.
    IF NOT _is_priv AND _req.assigned_to IS DISTINCT FROM _uid THEN
      RAISE EXCEPTION 'این درخواست به شما تخصیص داده شده نیست.'
        USING ERRCODE = '42501', HINT = 'NOT_ASSIGNED';
    END IF;

    -- The product must match. The UI locks the field, but a crafted request
    -- must not be able to satisfy a request for A with a purchase of B.
    IF _req.product_id <> p_product_id THEN
      RAISE EXCEPTION 'محصول خرید با محصول درخواست یکسان نیست.'
        USING ERRCODE = '22023', HINT = 'PRODUCT_MISMATCH';
    END IF;

    SELECT COALESCE(SUM(f.allocated_quantity), 0) INTO _supplied
      FROM public.purchase_request_fulfillments f
     WHERE f.purchase_request_id = p_request_id;

    _remaining := GREATEST(_req.quantity - _supplied, 0);

    IF _remaining <= 0 THEN
      RAISE EXCEPTION 'این درخواست قبلاً به‌طور کامل تأمین شده است.'
        USING ERRCODE = '22023', HINT = 'REQUEST_ALREADY_COMPLETED';
    END IF;

    -- Default: never allocate more than is still needed, and never more than
    -- was actually purchased.
    _alloc := COALESCE(p_allocate_quantity, LEAST(_remaining, p_quantity::numeric));

    IF _alloc <= 0 THEN
      RAISE EXCEPTION 'مقدار تخصیص معتبر نیست.'
        USING ERRCODE = '22023', HINT = 'INVALID_ALLOCATION';
    END IF;

    IF _alloc > p_quantity::numeric THEN
      RAISE EXCEPTION 'مقدار تخصیص نمی‌تواند از مقدار خریداری‌شده بیشتر باشد.'
        USING ERRCODE = '22023', HINT = 'INVALID_ALLOCATION';
    END IF;

    IF _alloc > _remaining THEN
      IF NOT COALESCE(p_allow_over_allocation, false) THEN
        RAISE EXCEPTION 'مقدار تخصیص از مقدار باقی‌مانده بیشتر است.'
          USING ERRCODE = '22023', HINT = 'OVER_ALLOCATION_CONFIRMATION_REQUIRED';
      END IF;
      IF _over_note IS NULL THEN
        RAISE EXCEPTION 'برای تخصیص مازاد باید دلیل ثبت شود.'
          USING ERRCODE = '22023', HINT = 'OVER_ALLOCATION_NOTE_REQUIRED';
      END IF;
      _over := true;
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- 7-8. The purchase and its line (identical to 251).
  ---------------------------------------------------------------------------
  INSERT INTO public.purchases (
    product_id, supplier_id, payment_term_id, purchase_price, currency,
    cash_price, cash_price_currency, quantity, purchase_date, notes,
    created_by, total_amount, status, warehouse_id
  )
  VALUES (
    p_product_id, p_supplier_id, p_payment_term_id, p_purchase_price, _currency,
    _cash, _cash_cur, p_quantity, p_purchase_date, _notes,
    _uid, _line_total, 'received', p_warehouse_id
  )
  RETURNING id INTO _purchase_id;

  INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price, line_total)
  VALUES (_purchase_id, p_product_id, p_quantity, p_purchase_price, _line_total)
  RETURNING id INTO _item_id;

  ---------------------------------------------------------------------------
  -- 9-14. Fulfillment, derived state, history, notification, audit.
  ---------------------------------------------------------------------------
  IF p_request_id IS NOT NULL THEN
    -- Lock the freshly created line too. It cannot be contended yet, but the
    -- order is established here so a future allocate-to-existing-line path
    -- cannot introduce a deadlock by locking the other way round.
    PERFORM 1 FROM public.purchase_items WHERE id = _item_id FOR UPDATE;

    INSERT INTO public.purchase_request_fulfillments
      (purchase_request_id, purchase_id, purchase_item_id, allocated_quantity,
       is_over_allocation, over_allocation_note, source, created_by)
    VALUES (p_request_id, _purchase_id, _item_id, _alloc,
            _over, CASE WHEN _over THEN _over_note ELSE NULL END, 'rpc', _uid);

    SELECT COALESCE(SUM(f.allocated_quantity), 0) INTO _total_alloc
      FROM public.purchase_request_fulfillments f
     WHERE f.purchase_request_id = p_request_id;

    _effective := LEAST(_total_alloc, _req.quantity);

    _new_status := CASE
      WHEN _total_alloc <= 0                 THEN 'approved'
      WHEN _total_alloc < _req.quantity      THEN 'partially_purchased'
      ELSE 'purchased'
    END;

    -- final_price recomputed from the real purchases, so the existing card
    -- display keeps working without becoming a second source of truth.
    SELECT COALESCE(SUM(f.allocated_quantity * pi.unit_price), 0) INTO _final_price
      FROM public.purchase_request_fulfillments f
      JOIN public.purchase_items pi ON pi.id = f.purchase_item_id
     WHERE f.purchase_request_id = p_request_id;

    UPDATE public.purchase_requests
       SET status      = _new_status,
           final_price = _final_price,
           updated_at  = now()
     WHERE id = p_request_id;

    -- Exactly one history row per real transition.
    IF _new_status IS DISTINCT FROM _req.status THEN
      INSERT INTO public.purchase_request_status_history
        (request_id, from_status, to_status, changed_by, note)
      VALUES (p_request_id, _req.status, _new_status, _uid,
              'ثبت سند خرید ' || left(_purchase_id::text, 8)
              || ' — تخصیص ' || trim_scale(_alloc)::text
              || CASE WHEN _over THEN ' (مازاد: ' || _over_note || ')' ELSE '' END);

      INSERT INTO public.notification_events
        (event_type, user_id, channel, payload, status)
      VALUES (
        CASE WHEN _new_status = 'purchased'
             THEN 'purchase_request_purchased'
             ELSE 'purchase_request_partially_purchased' END,
        _req.requested_by, 'in_app',
        jsonb_build_object(
          'title', CASE WHEN _new_status='purchased'
                        THEN 'خرید درخواست شما انجام شد'
                        ELSE 'بخشی از درخواست خرید شما تأمین شد' END,
          'body',  'تأمین‌شده ' || trim_scale(_effective)::text
                   || ' از ' || trim_scale(_req.quantity)::text,
          'reference_type','purchase_request',
          'reference_id',  p_request_id,
          'purchase_id',   _purchase_id,
          'from', _req.status, 'to', _new_status),
        'pending');
    END IF;

    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
    VALUES ('purchase_request', p_request_id::text, 'purchase_linked_to_request', _uid,
            jsonb_build_object(
              'purchase_id',        _purchase_id,
              'purchase_item_id',   _item_id,
              'purchased_quantity', p_quantity,
              'allocated_quantity', _alloc,
              'is_over_allocation', _over,
              'over_allocation_note', CASE WHEN _over THEN _over_note ELSE NULL END,
              'total_allocated',    _total_alloc,
              'effective_supplied', _effective,
              'remaining',          GREATEST(_req.quantity - _total_alloc, 0),
              'from_status',        _req.status,
              'to_status',          _new_status));

    _req_json := jsonb_build_object(
      'id',                 p_request_id,
      'status',             _new_status,
      'requested_quantity', _req.quantity,
      'allocated_quantity', _alloc,
      'total_allocated',    _total_alloc,
      'effective_supplied', _effective,
      'remaining_quantity', GREATEST(_req.quantity - _total_alloc, 0),
      'is_over_allocation', _over,
      'unit',               _req.unit);
  END IF;

  ---------------------------------------------------------------------------
  -- 15. Result.
  ---------------------------------------------------------------------------
  SELECT jsonb_build_object(
    'created', true,
    'purchase', jsonb_build_object(
      'id',             p.id,
      'short_id',       left(p.id::text, 8),
      'product_id',     p.product_id,
      'product_name',   _product.name,
      'supplier_id',    p.supplier_id,
      'supplier_name',  (SELECT s.name FROM public.suppliers s WHERE s.id = p.supplier_id),
      'warehouse_id',   p.warehouse_id,
      'warehouse_name', (SELECT w.name FROM public.warehouses w WHERE w.id = p.warehouse_id),
      'payment_term_id',p.payment_term_id,
      'purchase_price', p.purchase_price,
      'cash_price',     p.cash_price,
      'currency',       p.currency,
      'quantity',       p.quantity,
      'total_amount',   p.total_amount,
      'purchase_date',  to_char(p.purchase_date, 'YYYY-MM-DD'),
      'status',         p.status
    ),
    'item', jsonb_build_object('id', _item_id, 'quantity', p_quantity, 'line_total', _line_total),
    'request', _req_json
  )
  INTO _result
  FROM public.purchases p WHERE p.id = _purchase_id;

  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.purchase_idempotency
       SET state='completed', purchase_id=_purchase_id, result=_result, completed_at=now()
     WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN _result;
END;
$function$;
\echo '526: [394] redefined create_purchase -- restored the tehran_today() future-date comparison'
\else
\echo '526: [394] create_purchase already compares against tehran_today() -- no-op'
\endif

-- ============================================================================================
-- 396 (a) -- get_payables_list: still compared due dates against CURRENT_DATE. Byte-for-byte the
-- body 396 wrote (verified: 396 is the last migration to CREATE OR REPLACE this function; 457
-- and 520 mention its name only in comments and never redefine it).
-- ============================================================================================
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_payables_list'
       AND (pg_get_functiondef(p.oid) ~* 'CURRENT_DATE' OR pg_get_functiondef(p.oid) !~* 'tehran_today')
  ) THEN 'true' ELSE 'false' END AS need_396a \gset

\if :need_396a
CREATE OR REPLACE FUNCTION public.get_payables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_paid boolean DEFAULT false)
 RETURNS TABLE(supplier_id uuid, supplier_name text, purchase_id uuid, purchase_date date, due_date date, payment_term_days integer, purchase_total_amount numeric, cash_price numeric, currency text, paid_at timestamp with time zone, outstanding_amount numeric, is_paid boolean, days_until_due integer, is_overdue boolean, product_summary text, created_at timestamp with time zone, aging_bucket text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_filter text := COALESCE(p_due_filter, 'all');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_filter NOT IN ('all','overdue','today','tomorrow','future',
                      'current','d1_30','d31_60','d61_90','d90_plus') THEN
    RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.days_until_due, v.is_overdue,
    v.product_summary, v.created_at, v.aging_bucket
  FROM public.vw_supplier_payables v
  WHERE (p_include_paid OR v.is_paid = false)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      v_filter = 'all'
      OR (v_filter = 'overdue'  AND v.is_overdue)
      OR (v_filter = 'today'    AND v.due_date = public.tehran_today())
      OR (v_filter = 'tomorrow' AND v.due_date = public.tehran_today() + 1)
      OR (v_filter = 'future'   AND v.due_date > public.tehran_today() + 1)
      OR (v_filter IN ('current','d1_30','d31_60','d61_90','d90_plus')
          AND v.aging_bucket = v_filter)
    )
    AND (
      v_search IS NULL
      OR v.supplier_name    ILIKE '%'||v_search||'%'
      OR v.purchase_id::text ILIKE '%'||v_search||'%'
    )
  ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;
\echo '526: [396a] redefined get_payables_list -- restored the tehran_today() due-date comparison'
\else
\echo '526: [396a] get_payables_list already uses tehran_today() -- no-op'
\endif

-- ============================================================================================
-- 396 (b) -- upsert_staff_daily_performance_metric: same class. Byte-for-byte the body 396 wrote
-- (verified: 396 is the last migration to CREATE OR REPLACE this function; 520 adds a new
-- trigger alongside it but never redefines its body).
-- ============================================================================================
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'upsert_staff_daily_performance_metric'
       AND (pg_get_functiondef(p.oid) ~* 'CURRENT_DATE' OR pg_get_functiondef(p.oid) !~* 'tehran_today')
  ) THEN 'true' ELSE 'false' END AS need_396b \gset

\if :need_396b
CREATE OR REPLACE FUNCTION public.upsert_staff_daily_performance_metric(p_staff_user_id uuid, p_metric_date date, p_sales_amount numeric, p_profit_amount numeric, p_inbound_calls_count integer, p_outbound_calls_count integer, p_talk_time_minutes integer, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  IF NOT public.has_any_role(v_uid,
       ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت عملکرد روزانه';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');

  IF p_metric_date IS NULL OR p_metric_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ نامعتبر است؛ ثبت برای آینده مجاز نیست';
  END IF;

  -- 5-day window. Admin may override for corrections.
  IF p_metric_date < public.tehran_today() - INTERVAL '5 days' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'ویرایش فقط تا ۵ روز گذشته مجاز است';
  END IF;

  IF COALESCE(p_sales_amount,0) < 0
     OR COALESCE(p_inbound_calls_count,0) < 0
     OR COALESCE(p_outbound_calls_count,0) < 0
     OR COALESCE(p_talk_time_minutes,0) < 0 THEN
    RAISE EXCEPTION 'مقادیر نمی‌توانند منفی باشند';
  END IF;

  INSERT INTO public.staff_daily_performance_metrics AS m
    (metric_date, staff_user_id, sales_amount, profit_amount,
     inbound_calls_count, outbound_calls_count, talk_time_minutes,
     notes, created_by, updated_by)
  VALUES
    (p_metric_date, p_staff_user_id, COALESCE(p_sales_amount,0), COALESCE(p_profit_amount,0),
     COALESCE(p_inbound_calls_count,0), COALESCE(p_outbound_calls_count,0),
     COALESCE(p_talk_time_minutes,0), NULLIF(btrim(COALESCE(p_notes,'')), ''), v_uid, v_uid)
  ON CONFLICT (metric_date, staff_user_id) DO UPDATE
    SET sales_amount         = EXCLUDED.sales_amount,
        profit_amount        = EXCLUDED.profit_amount,
        inbound_calls_count  = EXCLUDED.inbound_calls_count,
        outbound_calls_count = EXCLUDED.outbound_calls_count,
        talk_time_minutes    = EXCLUDED.talk_time_minutes,
        notes                = EXCLUDED.notes,
        updated_by           = v_uid,
        updated_at           = now()
  RETURNING m.id INTO v_id;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'staff_daily_performance_metric', v_id::text,
          'staff_daily_metric_upserted',
          jsonb_build_object(
            'staff_user_id', p_staff_user_id,
            'metric_date', p_metric_date,
            'sales_amount', COALESCE(p_sales_amount,0),
            'profit_amount', COALESCE(p_profit_amount,0),
            'inbound_calls_count', COALESCE(p_inbound_calls_count,0),
            'outbound_calls_count', COALESCE(p_outbound_calls_count,0),
            'talk_time_minutes', COALESCE(p_talk_time_minutes,0)));

  -- Recalculate this employee's score. Never let a scoring failure roll back
  -- the metric itself.
  BEGIN
    PERFORM public.calculate_employee_score(p_staff_user_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, 'staff_daily_performance_metric', v_id::text,
            'score_recalc_failed', jsonb_build_object('error', SQLERRM));
  END;

  RETURN v_id;
END;
$function$;
\echo '526: [396b] redefined upsert_staff_daily_performance_metric -- restored the tehran_today() comparisons'
\else
\echo '526: [396b] upsert_staff_daily_performance_metric already uses tehran_today() -- no-op'
\endif

-- ============================================================================================
-- 396 (c) -- the two RLS policies on staff_daily_performance_metrics: the function's own guard
-- is not the gate that refuses a stale write, the policy is (396's own reasoning). Restored with
-- ALTER POLICY, which never leaves the table unprotected even mid-transaction.
-- ============================================================================================
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_policy pol
     WHERE pol.polrelid = 'public.staff_daily_performance_metrics'::regclass
       AND pol.polname IN ('sdpm_insert_privileged','sdpm_update_privileged')
       AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
            || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~* 'CURRENT_DATE'
  ) THEN 'true' ELSE 'false' END AS need_396c \gset

\if :need_396c
ALTER POLICY sdpm_insert_privileged ON public.staff_daily_performance_metrics
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])
    AND (metric_date >= (public.tehran_today() - '5 days'::interval))
    AND (metric_date <= public.tehran_today())
  );

ALTER POLICY sdpm_update_privileged ON public.staff_daily_performance_metrics
  USING (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])
    AND (metric_date >= (public.tehran_today() - '5 days'::interval))
  )
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])
    AND (metric_date >= (public.tehran_today() - '5 days'::interval))
  );
\echo '526: [396c] restored tehran_today() on sdpm_insert_privileged / sdpm_update_privileged'
\else
\echo '526: [396c] sdpm_insert_privileged / sdpm_update_privileged already use tehran_today() -- no-op'
\endif

-- ============================================================================================
-- 404 -- asan_list_bank_deposit_export: the payment-vouchers branch (v/combined CTEs, the
-- `direction` output column) is absent; production still runs the pre-404 receipts-only version.
-- Byte-for-byte the body 404 wrote (verified: 404 is the last migration to CREATE OR REPLACE
-- this function). DROP is required, not CREATE OR REPLACE alone: the OUT-parameter list gained
-- an 11th column, and RETURNS TABLE cannot change return type under CREATE OR REPLACE (404's own
-- documented reason, safety rule 5). The DROP loses the ACL; measured on prod_rehearsal_e1 the
-- default privileges for schema public functions already grant authenticated+service_role
-- (no anon) to a fresh object owned by supabase_admin, matching 404's own assertions exactly, so
-- no explicit GRANT is needed after the DROP+CREATE below -- verified, not assumed, in
-- E-1-proof.md.
-- ============================================================================================
-- NOTE: `direction` is an OUT-parameter name (part of RETURNS TABLE), not body text -- the fixed
-- function's prosrc never spells the word "direction" literally (it returns b.dir positionally).
-- The correct catalogue signal is proargnames, not a prosrc grep.
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export'
       AND (NOT ('direction' = ANY (p.proargnames)) OR p.prosrc !~* 'combined')
  ) THEN 'true' ELSE 'false' END AS need_404 \gset

\if :need_404
DROP FUNCTION IF EXISTS public.asan_list_bank_deposit_export(date, date);

CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text, person_code text,
               tracking_number text, amount numeric, bank_code text, bank_title text,
               blocked_reason text, direction text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT pr.id,
           pr.payment_date AS pdate,
           COALESCE(NULLIF(btrim(pr.payer_name), ''), '') AS pname,
           NULLIF(btrim(pr.tracking_number), '') AS tracking,
           pr.amount AS amt,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = COALESCE(
                     pr.customer_person_id,
                     (SELECT c.person_id FROM public.customers c WHERE c.id = pr.customer_id))
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode,
           (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS bcode,
           (SELECT ba.title FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS btitle
      FROM public.payment_receipts pr
     WHERE pr.status = 'approved'
       AND pr.destination_bank_account_id IS NOT NULL
       -- 350 / Gate A B1, owner answer (c): cash and cheque go to Asan by hand, so they must not
       -- appear in the automatic bank-deposit file. NULL is kept deliberately -- it is what the
       -- bank branch stores until the phase-6 wizard collects the real sub-channel (C6).
       AND (pr.document_channel IS NULL
            OR pr.document_channel NOT IN ('cash', 'cheque'))
       AND pr.reversed_at IS NULL
       AND pr.payment_date BETWEEN _from AND _to
  ),
  v AS (
    SELECT pv.id,
           pv.payment_date AS pdate,
           -- Four-way, because a voucher's counterparty lives in whichever of four columns
           -- `payee_type` selected. Same chain as asan_list_journal_export's voucher branch.
           COALESCE(NULLIF(btrim(s.name), ''),
                    NULLIF(btrim(ep.full_name), ''),
                    NULLIF(btrim(cu.name), ''),
                    NULLIF(btrim(pv.payee_name), ''), '') AS pname,
           NULLIF(btrim(pv.tracking_number), '') AS tracking,
           pv.amount AS amt,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = COALESCE(pv.payee_person_id, s.person_id, ep.person_id, cu.person_id)
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode,
           -- SOURCE account for a payment: the money leaves this bank. The receipt branch reads
           -- the DESTINATION account for the mirror reason.
           (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
             WHERE ba.id = pv.source_bank_account_id) AS bcode,
           (SELECT ba.title FROM public.bank_accounts ba
             WHERE ba.id = pv.source_bank_account_id) AS btitle
      FROM public.payment_vouchers pv
      LEFT JOIN public.suppliers s        ON s.id  = pv.payee_supplier_id
      LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
      LEFT JOIN public.customers cu       ON cu.id = pv.payee_customer_id
     WHERE pv.status = 'approved'
       -- No `IS NULL` disjunct: document_channel is NOT NULL on vouchers, unlike receipts.
       AND pv.document_channel NOT IN ('cash', 'cheque')
       AND pv.reversed_at IS NULL
       AND pv.payment_date BETWEEN _from AND _to
  ),
  combined AS (
    SELECT r.*, 'receipt'::text AS dir FROM r
    UNION ALL
    SELECT v.*, 'payment'::text AS dir FROM v
  )
  SELECT b.id,
         CASE WHEN b.dir = 'payment' THEN 'پرداخت ' ELSE 'واریز ' END
           || to_char(b.pdate, 'YYYY-MM-DD') || ' — ' ||
           COALESCE(NULLIF(b.pname, ''), left(b.id::text, 8)),
         b.pdate,
         b.pname,
         b.pcode,
         b.tracking,
         b.amt,                       -- POSITIVE. The sign is applied by mablaghFor, not here.
         b.bcode,
         b.btitle,
         CASE
           WHEN b.pcode IS NULL OR btrim(b.pcode) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(b.pname, ''), '؟') || '» ثبت نشده است'
           WHEN b.bcode IS NULL
             THEN CASE WHEN b.dir = 'payment'
                       THEN 'کد آسان حساب بانکی مبدأ ثبت نشده است'
                       ELSE 'کد آسان حساب بانکی مقصد ثبت نشده است' END
           WHEN b.amt IS NULL OR b.amt <= 0
             THEN 'مبلغ این واریز معتبر نیست'
           WHEN b.amt <> trunc(b.amt)
             THEN 'مبلغ این واریز عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           ELSE NULL
         END,
         b.dir
    FROM combined b
   ORDER BY b.pdate, b.id;
END;
$function$;
\echo '526: [404] dropped and redefined asan_list_bank_deposit_export -- restored the payment-vouchers branch and the direction column'
\else
\echo '526: [404] asan_list_bank_deposit_export already has the payment-vouchers branch -- no-op'
\endif

-- ============================================================================================
-- 409 -- expire_stale_credit_holds: the stale (integer)-only overload from before 409 must not
-- survive, or a 1-argument call becomes ambiguous at runtime. The 2-argument version is NOT
-- redefined here: verified live on prod_rehearsal_e1 that its body already matches 462's later
-- text exactly (role set admin/manager/accountant/sales, auth.uid() as actor_id) -- 462 is in
-- the ledger and its effect IS present, unlike the five migrations this file repairs.
-- ============================================================================================
DO $pre409$
DECLARE
  v_callers text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'expire_stale_credit_holds' AND p.pronargs = 1) THEN
    SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_callers
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosrc ~ 'expire_stale_credit_holds\s*\('
       AND p.proname <> 'expire_stale_credit_holds';
    IF v_callers IS NOT NULL THEN
      RAISE EXCEPTION '526: refusing to drop expire_stale_credit_holds(integer) -- source scan found possible caller(s): %. This must be resolved by a human before the overload is removed.', v_callers;
    END IF;
    RAISE NOTICE '526: [409 precheck] no other function in public source-references expire_stale_credit_holds(...) -- safe to drop the (integer) overload';
  END IF;
END
$pre409$;

SELECT CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'expire_stale_credit_holds' AND p.pronargs = 1
  ) THEN 'true' ELSE 'false' END AS need_409 \gset

\if :need_409
DROP FUNCTION public.expire_stale_credit_holds(integer);
\echo '526: [409] dropped the stale expire_stale_credit_holds(integer) overload'
\else
\echo '526: [409] expire_stale_credit_holds(integer) already absent -- no-op'
\endif

-- ============================================================================================
-- FINAL GATE -- re-read the catalogue and assert every one of the five migrations' end states.
-- This is the ONE assertion this migration is allowed (A2.9 style): it runs unconditionally,
-- whether or not any \if branch above fired, so a partial or silently-skipped repair cannot pass.
-- ============================================================================================
DO $gate526$
DECLARE
  bad  text;
  n    int;
  -- 387's own tail string, unmodified -- this gate uses pg_get_viewdef(oid), single-arg, the
  -- same form 387 uses, which renders WITH the extra parens (see the note above 386(b)).
  want text := 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));';
  expected8 text[] := ARRAY['product_computed_prices_public','publish_recipients_view',
                            'v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances',
                            'v_promotion_suggestions','vw_account_balances',
                            'vw_customer_receivables','vw_supplier_payables'];
  invoker2  text[] := ARRAY['product_computed_prices_public','v_promotion_suggestions'];
  guarded   text[];
BEGIN
  -- 386: the guard class is still exactly the 8 views, and every one ends in the exact tail.
  SELECT array_agg(c.relname ORDER BY c.relname) INTO guarded
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'v'
     AND pg_get_viewdef(c.oid) ILIKE '%is_viewer_only%';
  IF guarded IS DISTINCT FROM (SELECT array_agg(e ORDER BY e) FROM unnest(expected8) e) THEN
    RAISE EXCEPTION '526 gate: is_viewer_only guard class is %, expected the 8 public views', guarded;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (expected8)
     AND right(pg_get_viewdef(c.oid), length(want)) <> want;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '526 gate: view(s) % do not end in the exact guard tail %', bad, want;
  END IF;

  FOREACH bad IN ARRAY invoker2 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
       WHERE ns.nspname = 'public' AND c.relname = bad
         AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on')
    ) THEN
      RAISE EXCEPTION '526 gate: % is missing security_invoker=true', bad;
    END IF;
  END LOOP;
  bad := NULL;

  -- anon must hold nothing on any of the 8 (G-1 must not have regressed).
  SELECT string_agg(c.relname || ':' || p, ', ' ORDER BY c.relname, p) INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','TRUNCATE']) p
   WHERE ns.nspname = 'public' AND c.relkind = 'v' AND c.relname = ANY (expected8)
     AND has_table_privilege('anon', c.oid, p);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '526 gate: anon holds privilege(s) % on the guard class', bad;
  END IF;

  -- 394
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.oid = 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)'::regprocedure
                AND (position('public.tehran_today()' in p.prosrc) = 0 OR p.prosrc ~ '>\s*CURRENT_DATE')) THEN
    RAISE EXCEPTION '526 gate: create_purchase still does not compare against tehran_today()';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_purchase') <> 1 THEN
    RAISE EXCEPTION '526 gate: create_purchase is overloaded';
  END IF;

  -- 396
  SELECT string_agg(x.name, ', ') INTO bad FROM (
    SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('get_payables_list','upsert_staff_daily_performance_metric')
       AND (pg_get_functiondef(p.oid) ~* 'CURRENT_DATE' OR pg_get_functiondef(p.oid) !~* 'tehran_today')
  ) x;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '526 gate: function(s) % still UTC-bound', bad;
  END IF;

  SELECT string_agg(pol.polname, ', ') INTO bad
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.staff_daily_performance_metrics'::regclass
     AND pol.polname IN ('sdpm_insert_privileged','sdpm_update_privileged')
     AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~* 'CURRENT_DATE';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '526 gate: policy(ies) % still UTC-bound', bad;
  END IF;

  -- 404
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export') <> 1 THEN
    RAISE EXCEPTION '526 gate: asan_list_bank_deposit_export is overloaded or absent';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export'
                AND (NOT ('direction' = ANY (p.proargnames)) OR p.prosrc !~* 'combined')) THEN
    RAISE EXCEPTION '526 gate: asan_list_bank_deposit_export is still missing the payment-vouchers branch';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.asan_list_bank_deposit_export(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION '526 gate: authenticated lost EXECUTE on asan_list_bank_deposit_export';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.asan_list_bank_deposit_export(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION '526 gate: service_role lost EXECUTE on asan_list_bank_deposit_export';
  END IF;
  IF has_function_privilege('anon', 'public.asan_list_bank_deposit_export(date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION '526 gate: anon regained EXECUTE on asan_list_bank_deposit_export';
  END IF;

  -- 409
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
   WHERE nn.nspname = 'public' AND p.proname = 'expire_stale_credit_holds';
  IF n <> 1 THEN
    RAISE EXCEPTION '526 gate: % signatures of expire_stale_credit_holds exist; expected exactly 1', n;
  END IF;
  IF to_regprocedure('public.expire_stale_credit_holds(integer)') IS NOT NULL THEN
    RAISE EXCEPTION '526 gate: the stale expire_stale_credit_holds(integer) overload still exists';
  END IF;
  IF to_regprocedure('public.expire_stale_credit_holds(integer,integer)') IS NULL THEN
    RAISE EXCEPTION '526 gate: expire_stale_credit_holds(integer,integer) is missing';
  END IF;

  RAISE NOTICE '526 OK: all five migrations'' asserted end states (386/394/396/404/409) are present in the catalogue. Ledger rows for 386/394/396/404/409 are untouched. This migration does NOT write supabase_migrations.schema_migrations -- the operator''s ledger step does, and expects INSERT 0 1.';
END
$gate526$;
