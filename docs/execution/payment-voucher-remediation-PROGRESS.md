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

## Phase 1 — Decision & Design  ✅ COMPLETE

Decisions recorded as **D19**, **D20**, **D21** in `docs/execution/decisions.md`.

### T-1.1 — retirement mechanism  ✅ PASS → D19

Both halves, per the pre-existing **D13** ("form and database — a form-only check is bypassed by a
direct PostgREST call"). DB half: drop `payment_vouchers_insert_finance`, replace with nothing
(A4/G6 pattern). Frontend half: full deletion of four named paths. `fetchPaymentVouchers` is kept —
it only reads and two surviving routes need it.

### T-1.2 — legacy data  ✅ PASS → D20 — no remediation needed

T-0.2 measured `COUNT = 0`. Owner-Gate item 8 does not trigger. Nothing to decide.

### T-1.3 — corrected bodies drafted  ✅ PASS → D21

Two design inputs measured live rather than assumed:

```
journal lines with account_kind=bank belonging to a cheque-channel receipt = 0
journal lines with account_kind=bank belonging to a cheque-channel voucher = 0

bank lines total = 6
bank lines whose account_ref_id is NOT a bank_accounts id = 0
```

The first pair proves reading from the ledger cannot reintroduce the OG-18 / 359 cheque defect: a
cheque never posts to `account_kind='bank'`. The second proves `account_ref_id` is a sound join key.

The reversal predicate is copied from the live `asan_list_journal_export` (367 / T15), not invented.

### T-1.4 — zero-diff proof  ✅ PASS — difference is 0 on every column

Old (live view) vs new (proposed journal-derived formula), run side by side in one rolled-back
transaction:

```
account 12
    total_in        OLD=10225000000.00  NEW=10225000000.00  diff=0.00
    total_out       OLD=36000000        NEW=36000000        diff=0
    current_balance OLD=10289000000.00  NEW=10289000000.00  diff=0.00
    in_count        OLD=3               NEW=3
    out_count       OLD=1               NEW=1
```

Every legitimately-posted document produces an identical figure under both formulas. The counts
match too, which is the stricter test — it proves the 367 reversal predicate excludes the
OG14-CONC pair exactly as the old `reversed_at IS NULL` filter did.

**Phase 1 exit:** D19, D20, D21 recorded; zero-diff proven. No migration written yet.

---

## Phase 2 — Build  🟡 PARTIAL (T-2.1 – T-2.3 done; T-2.4 blocked on an owner decision)

### T-2.1 — backup  ✅ PASS

```
$ ls -la /d/AfraKalaBackups/pre-pv-remediation-20260821-161257.dump
-rw-r--r-- 1 AFRA 197121 16958227 Aug 21 16:13 pre-pv-remediation-20260821-161257.dump

$ pg_restore -l  →  TOC Entries: 5052
```

Real file, 16,958,227 bytes, valid custom-format archive.

### T-2.2 — migration 368, close the direct-INSERT path  ✅ PASS

Next free number taken from **both** sources before naming: local tree max `367`, `origin/staging`
max `367`, no untracked migration files. → **368**.

Down file written first and dry-run proved **before** the forward migration existed:

```
>>>> STATE BEFORE (outside any transaction) | 841 | f
DROP POLICY / CREATE POLICY
>>>> down file completed; still inside the transaction | still_in_txn = t
ROLLBACK
>>>> STATE AFTER ROLLBACK — must equal STATE BEFORE | 841
```

Forward migration applied, gate passed:

```
SET / DROP POLICY
NOTICE:  368: direct INSERT path closed. 0 INSERT policies, 3 SECURITY DEFINER writers intact,
         3 other policies untouched.
DO
exit=0
```

**Acceptance — as role `authenticated` with an admin JWT, inside `BEGIN … ROLLBACK`:**

```
A1_direct_insert
    42501 :: new row violates row-level security policy for table "payment_vouchers"
A2_create_payment_rpc
    STILL SUCCEEDS -> PAY-1405-000053  | journal entries for it = 1

INSERT policies remaining on payment_vouchers: <NONE — path closed>
```

Definition of Success item ۱ is met: only `create_payment` can create a payment document.

### T-2.3 — migration 369, ledger-derived readers  ✅ PASS

Down file assembled from `pg_get_viewdef()` / `pg_get_functiondef()` output pasted verbatim — the
original bodies were never retyped, so the rollback cannot drift from what was replaced. Dry-run:

```
CREATE VIEW / CREATE FUNCTION
still_in_txn = t
STATE AFTER ROLLBACK 841  =  STATE BEFORE 841
```

Forward migration applied, gate passed:

```
NOTICE:  369: both balance readers now derive from journal_lines, with the 367 reversal predicate.
```

**Acceptance, both halves, one rolled-back transaction:**

```
STEP0_baseline                current_balance = 10289000000.00

STEP1_posted_receipt          receipt RCP-1405-000056 for 7,777,000
                              balance 10289000000.00 -> 10296777000.00   delta=7777000.00
                              ledger bank net (opening excluded) = 10196777000.00
                              view = opening + ledger net -> 10296777000.00   MATCHES view: true

STEP2_journal_less_voucher    inserted voucher for 500,000,000 with 0 journal entries
                              balance 10296777000.00 -> 10296777000.00   delta=0.00
                              VERDICT: figure did NOT move — defect closed at the reader
```

Step 2 is the direct proof the defect is closed at the **reader**, not only at the writer: a
journal-less voucher inserted as the table owner — exactly what the legacy path used to produce —
now moves nothing.

**`get_account_ledger` after 369**, live data:

```
in  | 2026-07-25 | docnum=<null>           | مشتری آزمایشی 17 | channel=<empty> | 10100000000.00 | running=10200000000.00
in  | 2026-08-19 | docnum=RCP-1405-000054  | مشتری آزمایشی 20 | channel=<empty> |   120000000    | running=10320000000.00
in  | 2026-08-20 | docnum=RCP-1405-000055  | مشتری آزمایشی 8  | channel=<empty> |     5000000    | running=10325000000.00
out | 2026-08-20 | docnum=PAY-1405-000052  | مشتری آزمایشی 8  | channel=other   |    36000000    | running=10289000000.00
```

The closing `running_balance` is **10,289,000,000** — identical to `vw_account_balances.current_balance`.
Two independent readers of the same money now agree, which is the reconciliation the deep audit
recommended. The July seed shows `docnum=<null>` because it predates document numbering; the
`RCP-`/`PAY-` numbers are the D21 correction replacing `tracking_number`/`voucher_number`.

### T-2.4 — remove the frontend legacy path  ⛔ BLOCKED — Owner decision required

**Shared-tree gate (section ۹ item ۷) checked first, as required:**

```
$ git status --short -- <the four paths>
CLEAN — 0 uncommitted changes on the four paths. Gate not triggered.
pre-task SHA for rollback: 14078e416a9efc09a1bc3cb3eb2ea7d9dca37ba1
```

The gate did not trigger. T-2.4 is blocked by a **different** finding, recorded here rather than
decided: see the note below and `deferred.md`.

**Two references the execution document's scope list does not name:**

```
src/features/ledger-wizard/DocumentWizard.tsx:294  await navigate({ to: "/accounting/payment-vouchers" });
src/routes/_app.accounting.treasury.tsx:105        <Link to="/accounting/payment-vouchers">
src/routeTree.gen.ts                                13 generated references
```

**And the fact that changes the decision:** `_app.accounting.payment-vouchers.tsx` (577 lines) is not
only the create form. It is the **only** list of payment vouchers in the application — a full table
of شماره سند / تاریخ / دریافت‌کننده / نوع / کانال / از حساب / مبلغ / چک, fed by `fetchPaymentVouchers`.
No other route renders that list; `treasury.tsx` only links to it and `purchase-payments.tsx` does
not call it.

Full deletion therefore removes the only place a user can see a payment document — including the one
the wizard has just created, which is where the wizard navigates on success. That is materially
different from D12, where the wizard **replaced** the deleted form's function.

Execution document §13 open question ۱ pre-declares this exact fork and its condition: *"If the
read-only-history variant is wanted instead, T-2.4 must be rewritten before Phase 2 starts."* The
new evidence bears directly on it, so the question goes back to the owner rather than being settled
by a Safe Default.

**Everything not depending on that answer has been completed** — 368 and 369 are applied, proven and
independent of it.

---

## Phase 3 — Test / Self-Test / Red-Team / Verify  🟡 PARTIAL (T-3.1 – T-3.3 PASS; T-3.4/T-3.5 blocked on T-2.4)

### T-3.1 — happy-path regression, all six document types  ✅ 6/6 PASS

Each created through the real RPC inside one `BEGIN … ROLLBACK`, measuring
`vw_account_balances.current_balance` before and after:

```
1_bank_receipt        expect +1000000  actual  1000000.00   PASS
2_cheque_receipt      expect        0  actual        0.00   PASS
3_bank_payment        expect -3000000  actual -3000000.00   PASS
4_own_cheque_payment  expect        0  actual        0.00   PASS
5_endorsed_cheque     expect        0  actual        0.00   PASS
6_dual_document       expect        0  actual        0.00   PASS
```

Rows 2, 4 and 5 are the OG-18 / migration-359 behaviour: a cheque must not move the bank figure.
It still does not — now because a cheque never posts to `account_kind='bank'`, rather than because
a `document_channel` label says so.

### T-3.2 — red-team: try to recreate the original defect  ✅ PASS

```
A_direct_insert_redteam       42501 :: new row violates row-level security policy for table "payment_vouchers"
A2_update_path                UPDATE allowed but matched 0 rows — UPDATE cannot create a voucher, only alter one
B_pay_purchase_with_voucher   INVOKED on a real purchase.
                              ledger bank net delta = -1000000.00
                              view current_balance delta = -1000000.00
                              PASS — still posts a real bank line, and the new reader sees it
```

`A2` is an addition to the specified steps: having closed INSERT, the obvious next attack is to
smuggle a voucher in through the UPDATE policy, which is still open to admin and accountant. It
cannot — `UPDATE` alters existing rows and creates none.

`B` was invoked for real on one of the 101 unpaid purchases, not inferred from its body. The second
legitimate writer is neither stranded by 368 nor invisible to 369.

### T-3.3 — concurrency and malformed input  ✅ 4/4 PASS

```
C_fractional_amount   22023 :: مبلغ پرداخت باید عدد صحیح (تومان) باشد
D_missing_tracking    22023 :: شمارهٔ پیگیری برای پرداخت بانکی الزامی است
E_non_finance_role    42501 :: اجازهٔ ثبت سند پرداخت را ندارید
```

Concurrency, two real sessions against the same document type:

```
A got: PAY-1405-000053
B got: PAY-1405-000053     Time: 3021.757 ms
```

Session B blocked for 3,021 ms — the remainder of session A's five-second advisory lock — then
minted. Both report the same number because A rolled back and released the serial; only one could
ever commit, and `UNIQUE (doc_type, serial)` is the backstop. The pre-existing idempotency mechanism
is re-confirmed intact; neither 368 nor 369 touched numbering.

### T-3.4 / T-3.5  ⛔ BLOCKED

Both require T-2.4 merged. Not started.

### Database left as found

```
                     before (2026-08-20)   after all probes
journal_entries              7                     7
journal_lines               14                    14
payment_receipts            10                    10
payment_vouchers             1                     1
dual_documents               1                     1
document_numbers           159                   159
document_attachments         0                     0
payment_receipt_links        3                     3
audit_logs               43509                 43514
```

Every ledger table is unchanged. `audit_logs` gained five rows, and they are **not from this
mission**: all five are dated 2026-08-21 10:34–10:37 UTC from actor `8ff55610` — a person creating a
person and a customer through the UI — which predates this session's first probe at roughly 11:10
UTC. The shared test database is in ordinary daily use, which is itself a fact phase 8 needs.

Object changes made deliberately by this mission: one RLS policy dropped (368), one view and one
function replaced (369). Both have proved rollback files.

---

## T-2.4 — remove the frontend legacy path  ✅ PASS (read-only variant, D22)

Owner answered execution-document §13 open question ۱ on 2026-08-21: **read-only history**, not full
deletion. Recorded as **D22**; D19's frontend half is overturned, its database half stands.

**Removed**

| Where | What |
|---|---|
| `src/lib/treasury/queries.ts` | `createPaymentVoucher` and `CreateVoucherInput` — replaced by a comment naming 368 and D19 so the next reader is not tempted to restore it |
| `_app.accounting.payment-vouchers.tsx` | the create `<Dialog>`, its `useMutation`, `FormState`/`EMPTY`, the `open`/`form` state, `canCreate`, the header's create button, the `PayeePicker` component, and the four queries that only fed the form (`accountsQ`, `suppliersQ`, `partiesQ`, `customersQ`) |
| same file | imports left unused by the above: `useMutation`, `useQueryClient`, `toast`, `supabase`, `useAuth`, `Plus`, `Wallet`, `Input`, `Textarea`, all `Dialog*`, all `Select*`, `ACCOUNT_TYPE_FA` |

**Kept, deliberately:** the page, its route, the date filters, the table, both `registry.ts` entries
and `primary-modules.ts:142`. Keeping the route is what leaves `DocumentWizard.tsx:294` and
`treasury.tsx:105` working untouched — the two references T-2.4's scope list did not name.

The empty-state copy changed from «… یک سند پرداخت بسازید» to «سند پرداخت از «ثبت سند» در ویزارد
ساخته می‌شود و پس از ثبت اینجا دیده می‌شود.» — the old wording told the user to do something the page
no longer offers.

The file went from 577 lines to 170.

**Acceptance**

```
$ git grep -n "export async function createPaymentVoucher\|createPaymentVoucher(" -- src/
NONE — the function is gone; only the removal note remains

$ git grep -c "createPaymentVoucher\|_app.accounting.payment-vouchers" -- src/
src/lib/treasury/queries.ts:1     ← the removal comment
src/routeTree.gen.ts:1            ← generated, and correct: the route still exists

$ npx tsc --noEmit | grep -c "error TS"
70                                ← unchanged baseline (D14)

$ npm run build
✔ built

$ npx eslint <the two touched files>
exit 0
```

The specified acceptance was `git grep -c … -> 0`. Under D22 the correct expected value is **not**
zero for the route path, because the route is deliberately kept; it is zero for the **function**,
which is what the task was actually closing. Both are shown above rather than reporting the one that
looks tidier.

> Original acceptance assumed full deletion; owner decision D22 changed this to read-only history.
> Corrected acceptance: `createPaymentVoucher` count = 0 (PASS); the route path string remaining in
> registry.ts / primary-modules.ts / DocumentWizard.tsx / routeTree.gen.ts is expected under D22, not
> a defect.

---

## Release-note trailer correction (2026-08-21)

Commit `cd3922be` ("feat(ledger): migrations 368-369 …") shipped without a `Release-note-fa:`
trailer. It should have carried one: migration 369 changes what a user sees in the bank account
ledger — the `document_number` column now shows the minted `RCP-`/`PAY-` number instead of the
tracking number. Per AGENTS.md, a commit that changes anything a user can see must carry the
trailer, and commits without one are not published.

History is not rewritten to fix this — no rebase, no force-push. This follow-up commit carries the
trailer instead, with the wording already used on the frontend commit `fba9874d`.

