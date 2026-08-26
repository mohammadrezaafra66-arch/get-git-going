SET client_encoding='UTF8';

-- 404 — OG-67: the Asan bank file carries bank PAYMENTS as well as bank receipts, and says
-- which is which.
--
-- THE RULE, unchanged: bank receipts and bank payments are AUTOMATIC through this template;
-- cash and cheque stay MANUAL. Both branches below exclude `cash` and `cheque` explicitly.
--
-- WHAT WAS ALREADY BUILT, and why this is the last mile rather than a feature.
-- `src/lib/asan/export-bank-deposit-rows.ts` already models the whole thing:
--     export type BankFlowDirection = "receipt" | "payment";     // :25
--     direction?: BankFlowDirection | null                       // :43 on BankDepositRow
--     function mablaghFor(amount, direction) {                   // :57
--       const rial = tomanStringToRial(amount);
--       if (rial === null || direction !== "payment" || rial === 0) return rial;
--       return -rial;                                            // -0 explicitly avoided
--     }
-- The mapping negates for payments and is already asserted two-sided by
-- `e2e/asan/export-bank-deposits.spec.ts:314-333` — **on CONSTRUCTED rows**, because that spec's
-- own header says a payment row "cannot be obtained from live data today". The sign logic was
-- tested; the DATA PATH to it did not exist. This migration is that path.
--
-- **THE AMOUNT STAYS POSITIVE HERE.** The sign belongs to the presentation layer, which already
-- implements it. Returning a negative from SQL would double-negate in `mablaghFor` and would
-- also poison every other consumer of this RPC. What SQL contributes is the `direction` column;
-- what TypeScript contributes is the sign.
--
-- WHY THIS IS A DROP AND NOT A PLAIN `CREATE OR REPLACE`.
-- The function gains an 11th OUT column. For a `RETURNS TABLE`, the OUT parameters ARE the
-- return type, so `CREATE OR REPLACE` fails with "cannot change return type of existing
-- function". The argument signature `(date, date)` is unchanged, so exactly one old function is
-- dropped and there is no overload risk (safety rule 5's other half).
--   Consequence checked rather than assumed: a dropped function loses its grants. Before this
--   migration the ACL was `anon=X | authenticated=X | service_role=X`. Afterwards `authenticated`
--   and `service_role` must still hold EXECUTE — asserted below — while `anon` does NOT get it
--   back, because migration 393 closed the FUNCTIONS default for `anon` in `public`. That is an
--   improvement and changes no behaviour: the function's own first statement already refuses
--   anyone without the admin/accountant role with 42501.
--
-- WHAT WAS **NOT** CHANGED. The `r` CTE is a byte-for-byte copy of the live receipt branch,
-- including its comment about why NULL `document_channel` is kept. Safety rule 4: the live
-- definition is the baseline, and a receipt row's output must not shift by one character. The
-- new voucher branch is added ALONGSIDE it, never merged into it.
--
-- THE VOUCHER BRANCH IS NOT A COPY OF THE RECEIPT BRANCH, because the two tables differ:
--   * `payment_vouchers.document_channel` is NOT NULL, so the receipt branch's
--     `IS NULL OR NOT IN (…)` disjunct would be dead code here — it is a plain `NOT IN`.
--   * `source_bank_account_id` is NOT NULL, so no `IS NOT NULL` filter is needed (the receipt
--     branch needs one because `destination_bank_account_id` is nullable).
--   * There is no single name column. The four-way COALESCE below is not new design — it is the
--     chain already proven in `asan_list_journal_export`'s `payment_voucher` branch.
--   * `tracking_number` is NULLABLE on vouchers and NOT NULL on receipts. That is deliberate and
--     needs no new blocked_reason: a missing tracking number produces an empty cell, exactly as
--     a blank one already does on the receipt side via `NULLIF(btrim(...), '')`.
--   * `amount` carries `CHECK (amount > 0)`, so the `amt <= 0` rung of the ladder is unreachable
--     for vouchers. It is kept anyway rather than special-cased, because a ladder with a hole in
--     it is harder to read than one with an unreachable rung.

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
       -- appear in the automatic bank-deposit file. NULL is kept deliberately — it is what the
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
  -- Named , not : BOTH is a reserved word in PostgreSQL (TRIM(BOTH …)) and a
  -- CTE by that name is a syntax error. The dry run caught it.
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

-- Assertions. The interesting half is that RECEIPTS DID NOT MOVE: a change that adds payments by
-- shifting receipts would look like a success in every count.
DO $verify$
DECLARE
  v_auth  boolean;
  v_svc   boolean;
  v_dirs  text;
  v_neg   int;
BEGIN
  SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         has_function_privilege('service_role', p.oid, 'EXECUTE')
    INTO v_auth, v_svc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export';

  -- A dropped function loses its grants. If this is not restored the export silently 403s for
  -- every real user, which no count in this migration would have noticed.
  IF NOT coalesce(v_auth, false) THEN
    RAISE EXCEPTION '404: authenticated lost EXECUTE when the function was dropped; the export is now unreachable';
  END IF;
  IF NOT coalesce(v_svc, false) THEN
    RAISE EXCEPTION '404: service_role lost EXECUTE when the function was dropped';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export') <> 1 THEN
    RAISE EXCEPTION '404: the function is overloaded; exactly one signature must exist';
  END IF;

  -- Behavioural, as an admin, over a range wide enough to include everything.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', (SELECT (array_agg(user_id ORDER BY user_id))[1]
                                FROM public.user_roles WHERE role = 'admin'),
                      'role', 'authenticated')::text, true);

  SELECT string_agg(DISTINCT direction, ',' ORDER BY direction) INTO v_dirs
    FROM public.asan_list_bank_deposit_export('2000-01-01'::date, '2100-01-01'::date);

  IF v_dirs IS NULL THEN
    RAISE NOTICE '404: the export returned no rows at all; direction cannot be exercised here';
  ELSE
    RAISE NOTICE '404: directions present in the live export: %', v_dirs;
  END IF;

  -- The amount must NEVER be negative in SQL. If it were, mablaghFor would negate it again and
  -- the file would carry a positive number for a payment.
  SELECT count(*) INTO v_neg
    FROM public.asan_list_bank_deposit_export('2000-01-01'::date, '2100-01-01'::date)
   WHERE amount < 0;
  IF v_neg > 0 THEN
    RAISE EXCEPTION '404: % row(s) carry a negative amount; the sign belongs to the presentation layer, not to SQL', v_neg;
  END IF;

  PERFORM set_config('role', 'none', true);
  RAISE NOTICE '404: verified - grants intact, single signature, no negative amounts in SQL';
END
$verify$;
