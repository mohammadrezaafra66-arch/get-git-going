-- 292: the source query for export 1, sales invoices (M4.3).
--
-- WHY THIS IS A FUNCTION AND NOT FIVE CLIENT-SIDE JOINS
--
-- The owner defined the exportable set precisely: "the pre-invoices that are finalized by the
-- accountant ... and where stock has already been deducted". That definition decides what
-- enters live accounting, so it belongs in the database where it is auditable and where a
-- direct PostgREST call hits it too (rule 2.5), not in a page that a second client could
-- reimplement differently.
--
-- WHAT "FINALIZED AND STOCK-DEDUCTED" ACTUALLY IS, MEASURED RATHER THAN ASSUMED
--
--   * Stock deduction is bound to one transition. `trg_sales_quotes_stock_out` fires
--     AFTER UPDATE OF status WHEN (new.status = 'accepted' AND old.status IS DISTINCT FROM
--     'accepted') and writes `stock_movements` rows with ref_type = 'sale_quote_confirm'.
--     So `accepted` IS the stock-deducting status, and the material evidence is the movement
--     row. The candidate set is therefore `status = 'accepted'` and nothing else: a draft has
--     deducted nothing and a cancelled quote has been voided (and migration 290 burned its
--     number).
--
--   * Accountant finalization is `accounting_registered_at`, set only by
--     `set_quote_accounting_marker(..., 'registered', true)`, which is restricted to
--     admin/accountant/manager and refuses a cancelled quote. It is the only accountant-operated
--     flag on the table.
--
--     On its own that marker means nothing: 32 of the 50 quotes on this database carry it while
--     still in `draft`. It is only a finalization signal in conjunction with `accepted`, which
--     is exactly why the owner asked for BOTH conditions rather than either.
--
--   * The two signals disagree for three quotes, and the disagreement is history, not a bug.
--     SQ-2026-000003/4/5 were accepted on 2026-07-21 and 2026-07-23 — before migration 210
--     (2026-07-26) created the stock-out trigger — so no movement was ever written for them and
--     none ever will be. SQ-2026-000024 was accepted on 2026-07-28 and is the only accepted
--     quote carrying a movement.
--
--     They are therefore LISTED AND BLOCKED with that reason spelled out, never silently
--     omitted. The accountant must be able to see that three finalized invoices are being held
--     back and why; a set that quietly shrinks from four to one is how an invoice goes missing.
--
-- Amounts are returned in TOMAN, unconverted. The Toman -> Rial x10 happens in exactly one
-- place, `src/lib/asan/amounts.ts`, so there is one conversion to test and no chance of a
-- double conversion.
--
-- Rollback: docs/verification/292-down.sql
SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.asan_list_sales_export(_from date, _to date)
RETURNS TABLE (
  quote_id        uuid,
  quote_number    text,
  quote_date      date,
  customer_name   text,
  customer_phone  text,
  person_code     text,
  final_amount    numeric,
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
  bank_amount     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
-- The RETURNS TABLE names (quote_id, quantity, line_total, ...) are also plpgsql variables, and
-- they collide with the identically-named columns inside the query. Resolve every ambiguous
-- name to the COLUMN; the only two real variables here, `_from` and `_to`, are named so they
-- cannot collide with anything. Without this the function raises "column reference is
-- ambiguous" at run time rather than at creation time — it compiled fine and failed on first
-- call, which is precisely what the dry run is for.
#variable_conflict use_column
BEGIN
  -- Refuse loudly. Returning zero rows to an unauthorised caller would be read upstream as
  -- "there is nothing to export" (rule 2.5), which is the worst possible answer here.
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
             LIMIT 1) AS person_code,
           (sq.accounting_registered_at IS NOT NULL) AS finalized,
           EXISTS (SELECT 1 FROM public.stock_movements m
                    WHERE m.ref_type = 'sale_quote_confirm' AND m.ref_id = sq.id) AS stock_out
      FROM public.sales_quotes sq
     WHERE sq.status = 'accepted'
       AND (sq.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN _from AND _to
  ),
  pay AS (
    -- Only APPROVED receipts are money received. A receipt that landed in one of our bank
    -- accounts is a bank deposit; anything else approved is cash in hand. Nothing here guesses
    -- from a free-text bank name — `destination_bank_account_id` is the structured fact.
    --
    -- ⛔ The amount is `l.amount`, the sum ALLOCATED to this quote — never `r.amount`, the
    -- receipt total. One receipt can settle several invoices, and on this database exactly that
    -- happens: receipt fd8194a5 totals 10 100 000 000 Toman of which 100 100 000 belongs to
    -- SQ-2026-000003. Summing the receipt total would have written a bank deposit one hundred
    -- times the invoice into live accounting. The dry run caught it; the arithmetic below is
    -- asserted in the phase test so it cannot come back.
    SELECT l.quote_id AS qid,
           SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NULL)     AS cash,
           SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NOT NULL) AS bank
      FROM public.payment_receipt_links l
      JOIN public.payment_receipts r ON r.id = l.receipt_id
     WHERE l.quote_id IS NOT NULL AND r.status = 'approved'
     GROUP BY l.quote_id
  ),
  li AS (
    SELECT i.quote_id,
           ROW_NUMBER() OVER (PARTITION BY i.quote_id ORDER BY i.created_at, i.id)::int AS line_no,
           p.accounting_code AS product_code,
           COALESCE(NULLIF(i.title_snapshot, ''), p.name, i.free_item_name, '') AS product_name,
           NULLIF(p.barcode, '') AS product_barcode,
           i.quantity, i.unit_price,
           COALESCE(i.discount_amount, 0) AS line_discount,
           i.line_total
      FROM public.sales_quote_items i
      LEFT JOIN public.products p ON p.id = i.product_id
     WHERE i.quote_id IN (SELECT id FROM q)
  ),
  agg AS (SELECT li.quote_id AS qid, COUNT(*) AS n, SUM(li.line_total) AS total
            FROM li GROUP BY li.quote_id)
  SELECT q.id, q.quote_number, q.qdate, q.customer_name, q.customer_phone, q.person_code,
         q.final_amount,
         -- First failing condition wins, so the accountant is told the one thing to fix first.
         -- A missing PRODUCT code is deliberately absent from this list: per the owner, a line
         -- whose product has no Asan code still exports with column D empty and Asan mints one
         -- under group 101. A missing PERSON code blocks, because Asan must know the party.
         CASE
           WHEN COALESCE(a.n, 0) = 0
             THEN 'این پیش‌فاکتور هیچ ردیف کالایی ندارد'
           WHEN q.person_code IS NULL OR btrim(q.person_code) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(q.customer_name, ''), '؟') || '» ثبت نشده است'
           WHEN NOT q.finalized
             THEN 'حسابدار این پیش‌فاکتور را «ثبت شد در حسابداری» علامت نزده است'
           WHEN NOT q.stock_out
             THEN 'موجودی این پیش‌فاکتور کسر نشده است؛ پیش از فعال‌شدن سازوکار کسر موجودی قطعی شده است'
           WHEN a.total IS DISTINCT FROM q.final_amount
             THEN 'جمع ردیف‌ها با مبلغ نهایی پیش‌فاکتور نمی‌خواند'
           ELSE NULL
         END AS blocked_reason,
         li.line_no, li.product_code, li.product_name, li.product_barcode,
         li.quantity, li.unit_price, li.line_discount, li.line_total,
         -- Payment totals belong to the document, so they are written on its FIRST line only.
         -- Repeating them on every line would multiply the receipt by the line count inside Asan.
         CASE WHEN li.line_no = 1 THEN pay.cash END,
         CASE WHEN li.line_no = 1 THEN pay.bank END
    FROM q
    -- LEFT, not INNER: a finalized quote carrying no line items must still appear, blocked and
    -- named. An INNER JOIN would make it vanish from the preview entirely, which is the one
    -- outcome the shell is built to prevent.
    LEFT JOIN li ON li.quote_id = q.id
    LEFT JOIN agg a ON a.qid = q.id
    LEFT JOIN pay ON pay.qid = q.id
   -- Deterministic, so re-exporting the same selection produces byte-identical output.
   ORDER BY q.qdate, q.quote_number, li.line_no;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_list_sales_export(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_list_sales_export(date, date) TO authenticated;

COMMENT ON FUNCTION public.asan_list_sales_export(date, date) IS
  'ASAN M4.3: one row per line of every accepted sales quote in range, with the block reason for any that is not exportable. Amounts in Toman; the x10 to Rial happens in the client layer.';

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE _n integer; _def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_sales_export';
  IF _def IS NULL THEN RAISE EXCEPTION 'asan_list_sales_export was not created'; END IF;

  -- Rule 2.1: the Persian block reasons are the whole point of this function. If a '?' reached
  -- the catalogue, the accountant would be shown mojibake instead of what to fix.
  IF _def LIKE '%?%' THEN
    RAISE EXCEPTION 'persian text corrupted on the way in';
  END IF;

  -- The finalization definition must be BOTH conditions. If a later edit drops either one, the
  -- export silently widens to include invoices whose stock never moved.
  IF _def NOT LIKE '%accounting_registered_at%' THEN
    RAISE EXCEPTION 'the accountant-finalized condition is missing';
  END IF;
  IF _def NOT LIKE '%sale_quote_confirm%' THEN
    RAISE EXCEPTION 'the stock-deducted condition is missing';
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_sales_export';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one asan_list_sales_export, found % (rule 2.5: a defaulted parameter overloads rather than replaces)', _n;
  END IF;
END
$chk$;
