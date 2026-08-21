# Payment-voucher remediation — per-task evidence

**Mission:** close the legacy payment-voucher write path; make displayed bank figures ledger-derived.
**Started:** 2026-08-21
**Branch:** `feature/close-legacy-payment-voucher-path`
**Pre-mission SHA:** `e1fd2ce60ff27bdba954c5d3c84430002d931db8` (= `origin/staging` at start)
**Mode:** REMEDIATE. Scope is section ۲ of the execution document; anything else goes to `deferred.md`.

Evidence contract: every claim below is a pasted command result or a `path:line`. Behavioural claims
come from invoking the real object under a simulated JWT inside `BEGIN … ROLLBACK`.

---

## Phase 0 — Ground Truth  ✅ COMPLETE

Findings are written to `docs/execution/ground-truth.md` §13. Raw evidence follows.

### T-0.1 — readers  ✅ PASS

Acceptance command and real output:

```
$ git grep -c "vw_account_balances\|get_account_ledger" -- src/
src/lib/treasury/queries.ts:1
```

One file, one line, matched 1:1 against ground-truth §13.1. Full `src/` and `pg_proc` sweeps are in
§13.1. Key correction: the UI calls **`get_account_balances`**, which reads `vw_account_balances`.

### T-0.2 — legacy-path data  ✅ PASS — COUNT = 0

```
QUERY: SELECT count(*) FROM payment_vouchers pv WHERE NOT EXISTS
       (SELECT 1 FROM journal_entries je WHERE je.source_type='payment_voucher' AND je.source_id=pv.id)
COUNT = 0
DETAIL ROWS:
(0 rows)

payment_vouchers total = 1
with journal entry     = 1
```

G7 resolved. Owner-Gate item 8 does not trigger.

### T-0.3 — live bodies captured  ✅ PASS

```
vw_account_balances references journal_lines: false
get_account_ledger  references journal_lines: false
```

Full verbatim bodies, captured from the live catalogue before any redesign:

```sql
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
   FROM ( WITH inflow AS (
                 SELECT pr.destination_bank_account_id AS account_id,
                    COALESCE(sum(pr.amount), 0::numeric) AS total_in,
                    count(*) AS in_count
                   FROM payment_receipts pr
                  WHERE pr.destination_bank_account_id IS NOT NULL AND pr.status = 'approved'::text AND pr.document_channel IS DISTINCT FROM 'cheque'::text AND pr.reversed_at IS NULL
                  GROUP BY pr.destination_bank_account_id
                ), outflow AS (
                 SELECT pv.source_bank_account_id AS account_id,
                    COALESCE(sum(pv.amount), 0::numeric) AS total_out,
                    count(*) AS out_count
                   FROM payment_vouchers pv
                  WHERE pv.status = 'approved'::text AND pv.document_channel IS DISTINCT FROM 'cheque'::text AND pv.reversed_at IS NULL
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
             LEFT JOIN outflow o ON o.account_id = ba.id) src
  WHERE NOT is_viewer_only(uid());

CREATE OR REPLACE FUNCTION public.get_account_ledger(p_account_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date)
 RETURNS TABLE(entry_id uuid, entry_kind text, entry_date date, document_number text, counterparty text, document_channel text, amount numeric, signed_amount numeric, running_balance numeric, description text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _opening numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- ماندهٔ ابتدای بازه = opening_balance حساب + همهٔ حرکات تأییدشدهٔ قبل از p_from_date
  SELECT ba.opening_balance INTO _opening
    FROM public.bank_accounts ba WHERE ba.id = p_account_id;
  IF _opening IS NULL THEN
    RAISE EXCEPTION 'حساب یافت نشد.' USING ERRCODE = '22023';
  END IF;

  IF p_from_date IS NOT NULL THEN
    _opening := _opening
      + COALESCE((SELECT SUM(pr.amount) FROM public.payment_receipts pr
                   WHERE pr.destination_bank_account_id = p_account_id
                     AND pr.status = 'approved' AND pr.payment_date < p_from_date
                     AND pr.document_channel IS DISTINCT FROM 'cheque' AND pr.reversed_at IS NULL), 0)
      - COALESCE((SELECT SUM(pv.amount) FROM public.payment_vouchers pv
                   WHERE pv.source_bank_account_id = p_account_id
                     AND pv.status = 'approved' AND pv.payment_date < p_from_date
                     AND pv.document_channel IS DISTINCT FROM 'cheque' AND pv.reversed_at IS NULL), 0);
  END IF;

  RETURN QUERY
  WITH entries AS (
    SELECT pr.id AS entry_id,
           'in'::text AS entry_kind,
           pr.payment_date AS entry_date,
           pr.tracking_number AS document_number,
           COALESCE(c.name, pr.payer_name) AS counterparty,
           pr.document_channel,
           pr.amount,
           pr.amount AS signed_amount,
           pr.description,
           pr.created_at
      FROM public.payment_receipts pr
      LEFT JOIN public.customers c ON c.id = pr.customer_id
     WHERE pr.destination_bank_account_id = p_account_id
       AND pr.status = 'approved'
       AND pr.document_channel IS DISTINCT FROM 'cheque'
       AND pr.reversed_at IS NULL
       AND (p_from_date IS NULL OR pr.payment_date >= p_from_date)
       AND (p_to_date   IS NULL OR pr.payment_date <= p_to_date)
    UNION ALL
    SELECT pv.id AS entry_id,
           'out'::text AS entry_kind,
           pv.payment_date AS entry_date,
           pv.voucher_number AS document_number,
           -- external_parties names its column full_name, not name.
           COALESCE(s.name, ep.full_name, c2.name, pv.payee_name) AS counterparty,
           pv.document_channel,
           pv.amount,
           -pv.amount AS signed_amount,
           pv.description,
           pv.created_at
      FROM public.payment_vouchers pv
      LEFT JOIN public.suppliers s        ON s.id  = pv.payee_supplier_id
      LEFT JOIN public.external_parties ep ON ep.id = pv.payee_party_id
      LEFT JOIN public.customers c2       ON c2.id = pv.payee_customer_id
     WHERE pv.source_bank_account_id = p_account_id
       AND pv.status = 'approved'
       AND pv.document_channel IS DISTINCT FROM 'cheque'
       AND pv.reversed_at IS NULL
       AND (p_from_date IS NULL OR pv.payment_date >= p_from_date)
       AND (p_to_date   IS NULL OR pv.payment_date <= p_to_date)
  )
  SELECT e.entry_id, e.entry_kind, e.entry_date, e.document_number, e.counterparty,
         e.document_channel, e.amount, e.signed_amount,
         (_opening + SUM(e.signed_amount) OVER (
            ORDER BY e.entry_date, e.created_at, e.entry_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW))::numeric AS running_balance,
         e.description
    FROM entries e
   ORDER BY e.entry_date, e.created_at, e.entry_id;
END;
$function$


```

### T-0.4 — RLS and grants  ✅ PASS

```
RLS enabled = true | forced = false

payment_vouchers_delete_admin   | DELETE | USING  has_role(uid(),'admin')
payment_vouchers_insert_finance | INSERT | CHECK  has_any_role(uid(), ARRAY['admin','accountant'])
payment_vouchers_select_finance | SELECT | USING  has_any_role(uid(), ARRAY['admin','manager','accountant'])
payment_vouchers_update_finance | UPDATE | USING/CHECK has_any_role(uid(), ARRAY['admin','accountant'])

anon           : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
authenticated  : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
postgres       : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
service_role   : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
supabase_admin : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

**One explicit sentence, as required:** a logged-in `admin` or `accountant` can today INSERT directly
into `payment_vouchers` through PostgREST, bypassing `create_payment` and producing no journal entry,
because `payment_vouchers_insert_finance` permits it; `manager` cannot, despite being offered the page.

### T-0.5 — D12 retirement mechanism  ✅ PASS — frontend-only

```
$ git show --name-status e7dc789
D  src/shared/components/PaymentReceiptForm.tsx
M  src/lib/treasury/queries.ts        (comment text only; createPaymentVoucher untouched)
M  src/lib/navigation/registry.ts
A  src/features/ledger-wizard/{ChoiceButton,DocumentWizard,MissingAsanMessage,ProformaList,lookup,queries,rpc,types}
A  docs/verification/phase6-accept.sql
```

No `supabase/migrations/` file in commit `e7dc789`. The old receipt form was retired by **full
deletion with no DB-level guard**. This mission mirrors the deletion style but must not mirror the
frontend-only scope — T-0.4 shows why.

### T-0.6 — every writer  ✅ PASS — three, no forgotten fourth

```
create_payment            : prosecdef=true   posts journal
pay_purchase_with_voucher : prosecdef=true   posts journal  (reconfirmed, not assumed)
createPaymentVoucher      : PostgREST insert  NO journal      ← the defect
```

`pay_purchase_with_voucher` live body, the two lines it posts:

```sql
(_journal_id, 1, 'supplier_payable', _purchase.supplier_id,   _amt, 0, _debit_desc),
(_journal_id, 2, 'bank',             _source_bank_account_id, 0, _amt, 'خروج وجه از حساب بانکی');
```

followed by its own debit = credit assertion. It posts a real bank line and must keep working.

**Phase 0 exit:** all six tasks PASS. Findings in `ground-truth.md` §13. No code changed.

---
