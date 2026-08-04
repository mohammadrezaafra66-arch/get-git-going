-- 295: the source query for the secondary bank-deposit export (M4.7).
--
-- An ALTERNATIVE path for deposits, targeting Asan's `واریزیهای بانکی` screen. The accounting
-- document from 4.5/4.6 stays the default; this exists because the owner's screenshots show Asan
-- also accepts a flat six-column deposit list with **Latin** headers.
--
-- Layout 4, reproduced exactly as the Asan screen writes it — Date, Code_M, Name_Moshtari,
-- Shomare_Peygiri, Mablagh, Bank_cod. The transliterations are neither translated nor
-- spell-corrected; they are what the screen expects.
--
-- SOURCE, AND WHY IT IS NARROWER THAN "ALL RECEIPTS"
--
--   * Only `status = 'approved'`. A receipt awaiting review is not money received. On this
--     database that is 1 of 6 rows, and the other five are deliberately absent rather than
--     exported with a caveat.
--   * Only receipts with a `destination_bank_account_id`. This layout IS the bank-deposit list —
--     `Bank_cod` is mandatory to it. A cash receipt has no receiving bank and belongs on the
--     accounting document instead, not here with a blank bank code.
--
-- BLOCKING, following the owner's asymmetric rule
--
-- `Code_M` is the payer's Asan person code and a missing one BLOCKS, because Asan must know the
-- party. Same rule as the sales export, same reason. There is no product code in this layout, so
-- the product exemption never applies here.
--
-- The payer's code is read from `person_identifiers`, reached through `customer_person_id` if
-- present and otherwise through `customers.person_id` — `payment_receipts` carries both, and the
-- older rows only have the customer link.
--
-- `payer_accounting_code` on the receipt is deliberately NOT used: it is free text captured at
-- receipt time (values like '002' and 'cust-123' exist on `journal_entries`), not the identity
-- store M3.1 established. Two sources of truth for a person's Asan code is how they drift.
--
-- Amounts are returned in TOMAN. The x10 to Rial happens in `src/lib/asan/amounts.ts`, the one
-- conversion point for the whole program.
--
-- Rollback: docs/verification/295-down.sql
SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
RETURNS TABLE (
  doc_id          uuid,
  doc_label       text,
  doc_date        date,
  party_name      text,
  person_code     text,
  tracking_number text,
  amount          numeric,
  bank_code       text,
  bank_title      text,
  blocked_reason  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
       AND pr.payment_date BETWEEN _from AND _to
  )
  SELECT r.id,
         'واریز ' || to_char(r.pdate, 'YYYY-MM-DD') || ' — ' ||
           COALESCE(NULLIF(r.pname, ''), left(r.id::text, 8)),
         r.pdate,
         r.pname,
         r.pcode,
         r.tracking,
         r.amt,
         r.bcode,
         r.btitle,
         CASE
           WHEN r.pcode IS NULL OR btrim(r.pcode) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(r.pname, ''), '؟') || '» ثبت نشده است'
           WHEN r.bcode IS NULL
             THEN 'کد آسان حساب بانکی مقصد ثبت نشده است'
           WHEN r.amt IS NULL OR r.amt <= 0
             THEN 'مبلغ این واریز معتبر نیست'
           WHEN r.amt <> trunc(r.amt)
             THEN 'مبلغ این واریز عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           ELSE NULL
         END
    FROM r
   ORDER BY r.pdate, r.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_list_bank_deposit_export(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_list_bank_deposit_export(date, date) TO authenticated;

COMMENT ON FUNCTION public.asan_list_bank_deposit_export(date, date) IS
  'ASAN M4.7: one row per approved bank-received payment receipt in range, for the Latin-header واریزیهای بانکی layout. Amounts in Toman.';

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE _n integer; _def text;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one asan_list_bank_deposit_export, found %', _n;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export';

  -- Rule 2.1. This body carries no ASCII question mark of its own; the Persian «؟» is U+061F.
  IF _def LIKE '%?%' THEN
    RAISE EXCEPTION 'persian text corrupted on the way in, or an ASCII question mark was introduced';
  END IF;

  -- An unapproved receipt is not money received. If a later edit drops this, money that has not
  -- been verified reaches live accounting.
  IF _def NOT LIKE '%status = ''approved''%' THEN
    RAISE EXCEPTION 'the approved-only condition is missing';
  END IF;

  -- This layout IS the bank list; a receipt with no receiving bank must not appear in it with a
  -- blank Bank_cod.
  IF _def NOT LIKE '%destination_bank_account_id IS NOT NULL%' THEN
    RAISE EXCEPTION 'the destination-bank condition is missing';
  END IF;

  -- The receipt's own free-text payer code must never become the identity source.
  IF _def LIKE '%payer_accounting_code%' THEN
    RAISE EXCEPTION 'payer_accounting_code is free text, not the identity store';
  END IF;
END
$chk$;
