-- 293: the source query for export 2, purchase invoices (M4.4) — and one canonical row shape.
--
-- TWO THINGS, AND THE SECOND IS WHY THEY ARE IN ONE MIGRATION
--
-- The sales and purchase tabs are the SAME eighteen columns and differ in exactly three header
-- texts (I, J, K). They must therefore share one row builder, or the two will drift until only
-- one of them is right — the parallel implementation rule 14 forbids.
--
-- Migration 292 named its output `quote_id`, `quote_number`, `customer_name` and so on. Those
-- names cannot describe a purchase, so this migration renames them to `doc_*` / `party_*` and
-- gives the purchase function the identical shape. Rule 2.6 forbids EDITING 292; this is the
-- sanctioned alternative, a forward migration. `CREATE OR REPLACE` cannot change a function's
-- output column names, so 292's function is dropped and recreated with the same
-- `(date, date)` signature — no overload is created (rule 5).
--
-- WHAT THE PURCHASE DATA ACTUALLY LOOKS LIKE, MEASURED FIRST
--
--   * 289 purchases, all `status = 'received'` and all `currency = 'toman'`. `received` is
--     therefore the whole candidate set: goods in, purchase real.
--   * `purchases.number` is NULL on all 289, so the human title falls back to date + short id.
--     Column A is the Asan number from 4.1 regardless, so nothing financial depends on it.
--   * Only 8 purchases have a supplier at all, and **not one supplier carries an Asan person
--     code**. So today every purchase is blocked for the ordinary missing-party reason, the file
--     is empty, and that is the correct answer rather than a broken one: per the owner, a
--     missing person code blocks the document because Asan must know the party. The phase test
--     therefore constructs its exportable case and removes it again.
--   * **There is no payment data for purchases anywhere.** `payment_receipt_links` has no
--     purchase column, `purchase_receipts` holds uploaded images rather than payments, and
--     `paid_at` is NULL on all 289. Columns I, J and K (`پرداخت نقد` / `پرداخت از بانک` /
--     `پرداخت چک`) are therefore left EMPTY. `paid_at` alone would say *that* something was
--     paid, never *how*, and putting a total under `پرداخت نقد` on that basis is a guess about
--     a payment method. Recorded in UNVERIFIED-LAYOUTS.md rather than invented.
--
-- ⛔ THE FRACTIONAL-AMOUNT BLOCK, WHICH SALES DID NOT NEED
--
-- `tomanToRial` refuses a fractional Toman value rather than rounding it, because rounding money
-- silently is worse than refusing. On `sales_quotes` that is free: zero rows are fractional. On
-- `purchases` **two rows are** (24 999 999.99 and 24.95). Without a block those two would make
-- the row builder throw and take the whole export down with them. They are blocked and named
-- instead, so the other invoices still export — the same rule the 4.2 shell applies everywhere.
--
-- Rollback: docs/verification/293-down.sql
SET client_encoding='UTF8';

DROP FUNCTION IF EXISTS public.asan_list_sales_export(date, date);

CREATE OR REPLACE FUNCTION public.asan_list_sales_export(_from date, _to date)
RETURNS TABLE (
  doc_id          uuid,
  doc_number      text,
  doc_date        date,
  party_name      text,
  party_phone     text,
  person_code     text,
  doc_total       numeric,
  blocked_reason  text,
  line_no         integer,
  product_code    text,
  product_name    text,
  product_barcode text,
  quantity        numeric,
  unit_price      numeric,
  line_discount   numeric,
  line_total      numeric,
  cash_amount     numeric,
  bank_amount     numeric,
  cheque_amount   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از پیش‌فاکتورها را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH q AS (
    SELECT sq.id,
           sq.quote_number,
           (sq.created_at AT TIME ZONE 'Asia/Tehran')::date AS qdate,
           sq.customer_name,
           sq.customer_phone,
           sq.final_amount,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = sq.customer_person_id
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode,
           (sq.accounting_registered_at IS NOT NULL) AS finalized,
           EXISTS (SELECT 1 FROM public.stock_movements m
                    WHERE m.ref_type = 'sale_quote_confirm' AND m.ref_id = sq.id) AS stock_out
      FROM public.sales_quotes sq
     WHERE sq.status = 'accepted'
       AND (sq.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN _from AND _to
  ),
  pay AS (
    -- ⛔ `l.amount`, the sum ALLOCATED to this quote — never `r.amount`, the receipt total. One
    -- receipt can settle several invoices; on this database receipt fd8194a5 totals
    -- 10 100 000 000 Toman of which 100 100 000 belongs to SQ-2026-000003. Summing the receipt
    -- would write a bank deposit one hundred times the invoice into live accounting.
    SELECT l.quote_id AS qid,
           SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NULL)     AS cash,
           SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NOT NULL) AS bank
      FROM public.payment_receipt_links l
      JOIN public.payment_receipts r ON r.id = l.receipt_id
     WHERE l.quote_id IS NOT NULL AND r.status = 'approved'
     GROUP BY l.quote_id
  ),
  li AS (
    SELECT i.quote_id AS qid,
           ROW_NUMBER() OVER (PARTITION BY i.quote_id ORDER BY i.created_at, i.id)::int AS lno,
           p.accounting_code AS pcode,
           COALESCE(NULLIF(i.title_snapshot, ''), p.name, i.free_item_name, '') AS pname,
           NULLIF(p.barcode, '') AS pbarcode,
           i.quantity AS qty, i.unit_price AS uprice,
           COALESCE(i.discount_amount, 0) AS ldisc,
           i.line_total AS ltotal
      FROM public.sales_quote_items i
      LEFT JOIN public.products p ON p.id = i.product_id
     WHERE i.quote_id IN (SELECT id FROM q)
  ),
  agg AS (SELECT li.qid, COUNT(*) AS n, SUM(li.ltotal) AS total,
                 bool_or(li.uprice <> trunc(li.uprice) OR li.ltotal <> trunc(li.ltotal)) AS frac
            FROM li GROUP BY li.qid)
  SELECT q.id, q.quote_number, q.qdate, q.customer_name, q.customer_phone, q.pcode,
         q.final_amount,
         CASE
           WHEN COALESCE(a.n, 0) = 0
             THEN 'این پیش‌فاکتور هیچ ردیف کالایی ندارد'
           WHEN q.pcode IS NULL OR btrim(q.pcode) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(q.customer_name, ''), '؟') || '» ثبت نشده است'
           WHEN NOT q.finalized
             THEN 'حسابدار این پیش‌فاکتور را «ثبت شد در حسابداری» علامت نزده است'
           WHEN NOT q.stock_out
             THEN 'موجودی این پیش‌فاکتور کسر نشده است؛ پیش از فعال‌شدن سازوکار کسر موجودی قطعی شده است'
           WHEN COALESCE(a.frac, false) OR q.final_amount <> trunc(q.final_amount)
             THEN 'مبلغ این پیش‌فاکتور عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           WHEN a.total IS DISTINCT FROM q.final_amount
             THEN 'جمع ردیف‌ها با مبلغ نهایی پیش‌فاکتور نمی‌خواند'
           ELSE NULL
         END,
         li.lno, li.pcode, li.pname, li.pbarcode,
         li.qty, li.uprice, li.ldisc, li.ltotal,
         -- Document totals belong on the FIRST line only; repeating them would multiply the
         -- receipt by the line count inside Asan.
         CASE WHEN li.lno = 1 THEN pay.cash END,
         CASE WHEN li.lno = 1 THEN pay.bank END,
         NULL::numeric  -- the sales tab has no cheque column; K is confirmed empty
    FROM q
    -- LEFT, not INNER: a finalized quote carrying no line items must still appear, blocked and
    -- named, rather than vanishing from the preview.
    LEFT JOIN li ON li.qid = q.id
    LEFT JOIN agg a ON a.qid = q.id
    LEFT JOIN pay ON pay.qid = q.id
   ORDER BY q.qdate, q.quote_number, li.lno;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_list_sales_export(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_list_sales_export(date, date) TO authenticated;
COMMENT ON FUNCTION public.asan_list_sales_export(date, date) IS
  'ASAN M4.3/M4.4: one row per line of every accepted sales quote in range, in the canonical invoice row shape. Amounts in Toman; the x10 to Rial happens in the client layer.';

-- ------------------------------------------------------------------ purchases ----
CREATE OR REPLACE FUNCTION public.asan_list_purchase_export(_from date, _to date)
RETURNS TABLE (
  doc_id          uuid,
  doc_number      text,
  doc_date        date,
  party_name      text,
  party_phone     text,
  person_code     text,
  doc_total       numeric,
  blocked_reason  text,
  line_no         integer,
  product_code    text,
  product_name    text,
  product_barcode text,
  quantity        numeric,
  unit_price      numeric,
  line_discount   numeric,
  line_total      numeric,
  cash_amount     numeric,
  bank_amount     numeric,
  cheque_amount   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از اسناد خرید را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH p AS (
    SELECT pu.id,
           -- `number` is NULL on every existing purchase, so the label falls back to something a
           -- human can recognise. Column A carries the Asan number, so nothing financial rides
           -- on this string.
           COALESCE(NULLIF(btrim(pu.number), ''),
                    'خرید ' || to_char(pu.purchase_date, 'YYYY-MM-DD') ||
                    ' — ' || left(pu.id::text, 8)) AS pnumber,
           pu.purchase_date AS pdate,
           s.name  AS sname,
           s.phone AS sphone,
           pu.total_amount,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = COALESCE(pu.supplier_person_id, s.person_id)
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode
      FROM public.purchases pu
      LEFT JOIN public.suppliers s ON s.id = pu.supplier_id
     WHERE pu.status = 'received'
       AND pu.purchase_date BETWEEN _from AND _to
  ),
  li AS (
    SELECT i.purchase_id AS pid,
           ROW_NUMBER() OVER (PARTITION BY i.purchase_id ORDER BY i.id)::int AS lno,
           pr.accounting_code AS prcode,
           COALESCE(pr.name, '') AS prname,
           NULLIF(pr.barcode, '') AS prbarcode,
           i.quantity AS qty, i.unit_price AS uprice, i.line_total AS ltotal
      FROM public.purchase_items i
      LEFT JOIN public.products pr ON pr.id = i.product_id
     WHERE i.purchase_id IN (SELECT id FROM p)
  ),
  agg AS (SELECT li.pid, COUNT(*) AS n, SUM(li.ltotal) AS total,
                 bool_or(li.uprice <> trunc(li.uprice) OR li.ltotal <> trunc(li.ltotal)) AS frac
            FROM li GROUP BY li.pid)
  SELECT p.id, p.pnumber, p.pdate, p.sname, p.sphone, p.pcode, p.total_amount,
         CASE
           WHEN COALESCE(a.n, 0) = 0
             THEN 'این سند خرید هیچ ردیف کالایی ندارد'
           WHEN p.pcode IS NULL OR btrim(p.pcode) = ''
             THEN 'کد آسان برای تأمین‌کننده «' || COALESCE(NULLIF(p.sname, ''), '؟') ||
                  '» ثبت نشده است'
           -- ⛔ Two live purchases carry fractional Toman amounts. Blocking them keeps the
           -- Toman->Rial conversion exact for everything else instead of throwing and taking the
           -- whole export down.
           WHEN COALESCE(a.frac, false) OR p.total_amount <> trunc(p.total_amount)
             THEN 'مبلغ این سند خرید عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           WHEN a.total IS DISTINCT FROM p.total_amount
             THEN 'جمع ردیف‌ها با مبلغ کل سند خرید نمی‌خواند'
           ELSE NULL
         END,
         li.lno, li.prcode, li.prname, li.prbarcode,
         li.qty, li.uprice,
         NULL::numeric,  -- L تخفیف — purchase_items carries no discount column
         li.ltotal,
         -- I / J / K stay empty: nothing in this database records HOW a purchase was paid.
         NULL::numeric, NULL::numeric, NULL::numeric
    FROM p
    LEFT JOIN li ON li.pid = p.id
    LEFT JOIN agg a ON a.pid = p.id
   ORDER BY p.pdate, p.pnumber, li.lno;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_list_purchase_export(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_list_purchase_export(date, date) TO authenticated;
COMMENT ON FUNCTION public.asan_list_purchase_export(date, date) IS
  'ASAN M4.4: one row per line of every received purchase in range, in the same canonical invoice row shape as the sales export. Amounts in Toman.';

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE _n integer; _sales text; _purch text;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('asan_list_sales_export', 'asan_list_purchase_export');
  IF _n <> 2 THEN
    RAISE EXCEPTION 'expected exactly 2 export source functions, found % (an overload would make every call ambiguous)', _n;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO _sales FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_sales_export';
  SELECT pg_get_functiondef(p.oid) INTO _purch FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_purchase_export';

  -- Rule 2.1: the block reasons are the whole point. A '?' here shows the accountant mojibake
  -- instead of what to fix.
  IF _sales LIKE '%?%' OR _purch LIKE '%?%' THEN
    RAISE EXCEPTION 'persian text corrupted on the way in';
  END IF;

  -- The sales finalization definition must survive this rewrite intact.
  IF _sales NOT LIKE '%accounting_registered_at%' OR _sales NOT LIKE '%sale_quote_confirm%' THEN
    RAISE EXCEPTION 'the rewrite dropped half of the finalized-and-stock-deducted rule';
  END IF;

  -- Both must carry the fractional-amount guard, or a fractional row throws at build time.
  IF _sales NOT LIKE '%trunc(%' OR _purch NOT LIKE '%trunc(%' THEN
    RAISE EXCEPTION 'the fractional-amount block is missing';
  END IF;

  -- Both must expose the identical row shape, or the shared row builder is a lie.
  SELECT count(*) INTO _n FROM (
    SELECT unnest(p.proargnames) AS nm, p.proname
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('asan_list_sales_export', 'asan_list_purchase_export')
  ) x GROUP BY x.nm HAVING count(*) <> 2;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'the two export sources do not expose the same columns';
  END IF;
END
$chk$;
