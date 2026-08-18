-- 350-down.sql — rollback for
--   supabase/migrations/20260819090000_350_bank_deposit_export_excludes_cash_cheque.sql
--
-- Restores asan_list_bank_deposit_export to the definition that was live immediately before
-- migration 350, captured with pg_get_functiondef on 2026-08-19. The only difference is the
-- absence of the document_channel predicate 350 adds.
--
-- NO TRANSACTION CONTROL IN THIS FILE — deliberately. See Gate A M7.
--
-- Rollback files in this programme used to carry their own BEGIN; … COMMIT;. That makes them
-- impossible to dry-run: running such a file with \i inside an outer BEGIN … ROLLBACK does not
-- stay inside the outer transaction — the embedded COMMIT commits everything and the outer
-- ROLLBACK becomes a no-op ("WARNING: there is no transaction in progress"). Measured 2026-08-18.
--
-- So this file contains statements only. The caller supplies the transaction:
--
--   * to actually roll back:
--       psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f 350-down.sql
--   * to dry-run it (apply, assert, discard) use the harness:
--       docs/verification/rollback-dryrun.sql
--
-- DATA LOSS: none. This replaces a function body. It restores rows to the export that migration
-- 350 removed — cash and cheque receipts — which is the behaviour OG-B1 answer (c) rejected.
-- Do not roll this back without re-reading that answer: cash and cheque go to Asan manually.
--
-- Ordering: independent of 351/352/353. May be rolled back alone.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text, person_code text,
               tracking_number text, amount numeric, bank_code text, bank_title text,
               blocked_reason text)
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
$function$;
