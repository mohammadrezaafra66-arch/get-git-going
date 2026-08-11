SET client_encoding='UTF8';

-- 323 — staged retirement of the dead invoice subsystem, part 1 of 2.
--
-- Scope approved by the owner: drop waybills, waybill_items and invoice_items plus the
-- functions that exist only to serve them. The `invoices` table itself is deliberately
-- LEFT IN PLACE — see docs/execution/nav-invoices-cleanup-mission-STATUS.md, phase 4.
--
-- Why the split: a live pg_proc scan found 25 functions whose bodies reference
-- `invoices`, including post_receipt_accounting, enforce_payment_receipt_link_limits,
-- get_receivable_detail, calculate_credit_score, update_customer_overdue_status and
-- person_merge. Dropping the table would also force dropping an FK on
-- payment_receipt_links. That is out of scope here and is tracked as a follow-up.
--
-- Data safety: verified on the live DB immediately before writing this migration —
--   invoices 0 · invoice_items 0 · waybills 0 · waybill_items 0 rows
--   delivery_receipts: 1 row, 0 with invoice_id · payment_receipt_links: 3 rows, 0 with invoice_id
--   sum(held_credit) = 0.00
-- Nothing outside the dropped set points at the dropped set: the only FKs referencing
-- these three tables are waybill_items -> waybills and waybill_items -> invoice_items.
--
-- Only two live objects had to be rewritten rather than dropped; both are patched from
-- their live definitions (docs/verification/pre-323/), not retyped from memory.
--
-- Down-script: docs/verification/323-down.sql

-- ---------------------------------------------------------------------------
-- 1. Rewrite the two live objects that referenced the doomed tables.
--    Order matters: these must stop referencing the tables BEFORE the drops.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_timeline(p_product_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(event_time timestamp with time zone, event_type text, actor_id uuid, actor_name text, description text, amount numeric, reference_id uuid, reference_type text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with events as (
    -- inquiries
    select
      i.created_at as event_time,
      'inquiry'::text as event_type,
      i.requested_by as actor_id,
      p.full_name as actor_name,
      'استعلام قیمت ثبت شد'::text as description,
      ir.price::numeric as amount,
      i.id as reference_id,
      'inquiry'::text as reference_type
    from inquiries i
    left join profiles p on p.id = i.requested_by
    left join lateral (
      select price
      from inquiry_replies
      where inquiry_id = i.id and is_valid = true
      order by created_at asc
      limit 1
    ) ir on true
    where i.product_id = p_product_id

    union all

    -- purchase_requests
    select
      pr.created_at,
      'purchase_request'::text,
      pr.requested_by,
      p.full_name,
      'درخواست خرید ثبت شد'::text,
      pr.final_price,
      pr.id,
      'purchase_request'::text
    from purchase_requests pr
    left join profiles p on p.id = pr.requested_by
    where pr.product_id = p_product_id

    union all

    -- documents (linked to inquiries on this product)
    select
      d.created_at,
      'document'::text,
      d.uploaded_by,
      p.full_name,
      case d.type
        when 'bijak' then 'بیجک آپلود شد'
        when 'invoice' then 'فاکتور آپلود شد'
        when 'havale' then 'حواله آپلود شد'
        else 'سند آپلود شد'
      end,
      null::numeric,
      d.id,
      'document'::text
    from documents d
    join inquiries i on i.id = d.reference_id
    left join profiles p on p.id = d.uploaded_by
    where d.reference_type = 'inquiry'
      and i.product_id = p_product_id

    union all

    -- documents linked directly to purchase_requests of this product
    select
      d.created_at,
      'document'::text,
      d.uploaded_by,
      p.full_name,
      case d.type
        when 'bijak' then 'بیجک آپلود شد'
        when 'invoice' then 'فاکتور آپلود شد'
        when 'havale' then 'حواله آپلود شد'
        else 'سند آپلود شد'
      end,
      null::numeric,
      d.id,
      'document'::text
    from documents d
    join purchase_requests pr on pr.id = d.reference_id
    left join profiles p on p.id = d.uploaded_by
    where d.reference_type = 'purchase_request'
      and pr.product_id = p_product_id


    -- 323: this arm joined the invoice line-item table, which this migration drops.
    -- It contributed nothing: delivery_receipts holds 0 rows with a non-null
    -- invoice_id and that table was empty, so this UNION arm always returned zero
    -- rows. Removed rather than repointed — delivery receipts are not linked to
    -- sales_quotes today, so there is no equivalent join to move it to.
  )
  select * from events
  order by event_time desc
  limit p_limit offset p_offset;
$function$
;

CREATE OR REPLACE VIEW public.v_promotion_suggestions AS
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
         -- 323: previously "FROM invoice_items ii JOIN invoices i ...". invoice_items is
         -- dropped by this migration. This arm was ALREADY DEAD: both tables held zero
         -- rows, so qty_90d was never populated for any product. Replaced with a typed
         -- empty set so the view's behaviour is byte-for-byte identical to today.
         -- FOLLOW-UP: the real 90-day sales signal lives in sales_quote_items/sales_quotes
         -- (50 live rows). Repointing it there is a BEHAVIOUR CHANGE — it would switch this
         -- view from "no sales signal" to "real sales signal" and change which products get
         -- promoted — so it is deliberately NOT bundled into a deletion migration.
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

-- ---------------------------------------------------------------------------
-- 2. Drop the functions that exist only to serve the dropped tables.
--    Signatures are dropped explicitly (AGENTS.md rule 5 — a defaulted parameter
--    overloads rather than replaces, so vague drops leave ghosts behind).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_waybill_for_invoice(uuid, text, text, text, text, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.create_waybills_batch(uuid, jsonb, boolean);
DROP FUNCTION IF EXISTS public.update_waybill_status(uuid, text);

-- ---------------------------------------------------------------------------
-- 3. Drop the tables. Child-before-parent; every one verified at 0 rows above.
--    Their triggers go with them.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.waybill_items;
DROP TABLE IF EXISTS public.waybills;
DROP TABLE IF EXISTS public.invoice_items;

-- ---------------------------------------------------------------------------
-- 4. Drop the trigger functions that belonged to invoice_items. Only safe after
--    the table is gone, because dropping a table does not drop its trigger function.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.audit_invoice_item_insert();
DROP FUNCTION IF EXISTS public.validate_invoice_item_price();

-- ---------------------------------------------------------------------------
-- 5. Assert the outcome inside the same transaction, so a surprise rolls back.
-- ---------------------------------------------------------------------------

DO $do$
DECLARE
  v_tables int;
  v_funcs  int;
  v_refs   int;
BEGIN
  SELECT count(*) INTO v_tables FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN ('invoice_items','waybills','waybill_items');
  IF v_tables <> 0 THEN
    RAISE EXCEPTION '323: expected 0 of the three tables to remain, found %', v_tables;
  END IF;

  SELECT count(*) INTO v_funcs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('create_waybill_for_invoice','create_waybills_batch','update_waybill_status',
      'audit_invoice_item_insert','validate_invoice_item_price');
  IF v_funcs <> 0 THEN
    RAISE EXCEPTION '323: expected 0 waybill/invoice_item functions to remain, found %', v_funcs;
  END IF;

  -- Nothing anywhere may still reference the dropped tables, or it fails at RUN time
  -- rather than here. This is the assertion that matters most.
  SELECT count(*) INTO v_refs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f'
     AND (pg_get_functiondef(p.oid) ~* '\minvoice_items\M'
       OR pg_get_functiondef(p.oid) ~* '\mwaybill_items\M'
       OR pg_get_functiondef(p.oid) ~* '\mwaybills\M');
  IF v_refs <> 0 THEN
    RAISE EXCEPTION '323: % function(s) still reference a dropped table', v_refs;
  END IF;

  IF (SELECT count(*) FROM public.invoices) IS NULL THEN
    RAISE EXCEPTION '323: invoices must still exist and be readable';
  END IF;

  RAISE NOTICE '323 OK: 3 tables dropped, 5 functions dropped, 0 dangling references, invoices intact';
END
$do$;
