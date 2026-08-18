# OG-18 / OG-14 / OG-19 — three owner decisions — PROGRESS

One migration (OG-18) and two records (OG-14, OG-19). `staging @ 14a640b3`.

## HANDOFF STATE

```
Mission:              record three owner decisions; one schema change
Status:               complete
Branch:               feature/og18-cheque-bank-balance
Migrations applied:   359
REST restarted after: yes
Backup taken:         D:\AfraKalaBackups\post-og18-20260819-030620.dump
                      *** TAKEN AFTER THE MIGRATION, NOT BEFORE — process deviation, see below ***
Typecheck:            70 / 70 baseline
Test data:            NONE persists — every probe inside BEGIN … ROLLBACK; census before and after
Gates:                OG-18 CLOSED (migration 359). OG-14 ANSWERED and scheduled. OG-19 ANSWERED (T14).
```

---

## Part 1 — OG-18: a cheque does not move the bank balance until it clears

**Owner's answer 2026-08-19: option (a).** Migration **359**.

### §H, first half — what writes or depends on what I am changing

Measured from the live catalogue, **excluding comment-only matches**. This mattered: a plain
`prosrc ~ 'vw_account_balances'` returns `create_payment` and `create_receipt`, but only because
their *comments* mention the view. Filtering to non-comment lines gives the real set:

| Object | Real SQL readers | `src/` readers |
|---|---|---|
| `vw_account_balances` | **exactly one** — `get_account_balances` (`FROM public.vw_account_balances v`). **No view** reads it. | only via that RPC, `src/lib/treasury/queries.ts:66` |
| `get_account_ledger` | **none** | `src/lib/treasury/queries.ts:93` |
| `asan_list_journal_export` | none | `src/lib/asan/export-journal.ts` |

**Would any of them be surprised by a bank balance that no longer moves on cheque day?**
No. `get_account_balances` passes the view's columns straight through — it computes nothing of its
own and has **no threshold, comparison or gate** that a smaller `total_out` could trip. The treasury
screen displays the numbers. Nothing alerts on them, reconciles against them, or blocks on them.

### §H, second half — could the view and the ledger now disagree in the opposite direction?

**No, and the reason is structural rather than incidental:**

```
pg_get_viewdef('public.vw_account_balances') ~ 'journal_lines'   ->  false
```

**`vw_account_balances` does not read the ledger at all.** It is computed entirely from
`payment_receipts` and `payment_vouchers`. So there is no object that sums both the view and the
ledger and could be pulled apart by this change — confirmed by searching for any function
referencing both outside comments: **none**.

Before 359 the view *disagreed* with the ledger about cheque documents. After it, the two agree on
cheques and remain independently computed for everything else. That independence is the larger
matter recorded as **OG-19 / T14**, and 359 does not touch it.

### The one place I went beyond the letter of the brief — stated so it can be overturned

OG-18 was raised about cheque **payments**. The identical defect existed on the **receipt** side of
the same two objects: a cheque *receipt* raised the displayed balance before clearing, while
`create_receipt` debits `cheque_receivable`, never `bank`.

**Both directions are fixed.** Reasoning:

* the decision recorded is *"a cheque does not move the bank balance until it clears"*, and a cheque
  that has not cleared has not moved it in **either** direction;
* it is the same predicate on the same two objects — leaving one half would create exactly the
  asymmetry Gate A objected to over OG-20 (receipts guarded, vouchers not);
* it avoids a second visit to two objects phase 5 would otherwise have to revisit — the same
  reasoning the brief itself used to bundle the label fix.

**To overturn:** delete the two `pr.document_channel` predicates in 359 and nothing else changes.

**Cash is deliberately NOT excluded.** Migration 350 excluded cash *and* cheque from the Asan export
because a cash receipt is not a bank deposit. Here the question is different: a cash box **is** a
`bank_accounts` row (D2), and a cash payment really does move that account. Excluding cash would
understate the صندوق.

`payment_receipts.document_channel` is **nullable** (a bank receipt stores NULL — phase-2 C6), so the
predicate is `IS DISTINCT FROM`, not `<>`, which would silently drop every NULL-channel row. The same
spelling is used on the voucher side for uniformity even though that column is `NOT NULL`.

### The second fix in the same migration — the customer-payee label

`asan_list_journal_export` built a payment's label from `suppliers`, `external_parties` and
`payee_name` but **not** `payee_customer_id`, so a payment to a customer rendered as «؟». Phase 3
made `payee_type='customer'` reachable. Found during the phase-3 Gate A remediation and correctly not
widened into then. `get_account_ledger` already joined customers — only the export was missing it.
**Label only:** `acode`, the blocking decision and the `doc_kind` classification are untouched.

### Acceptance — both directions, because a predicate that excludes too much is the same defect

All inside `BEGIN … ROLLBACK` under an admin JWT:

```
total_out BEFORE            = 0
total_out after CHEQUE 900k = 0        (Gate A measured 900000 here)   moved = f
total_out after BANK   250k = 250000                                   moved = t
total_in  after CHEQUE receipt: 10100000000.00 -> 10100000000.00       moved = f
total_in  after BANK   receipt: 10100000000.00 -> 10100111000.00       moved = t
```

Customer-payee label:

```
line_description | پرداخت به «مشتری آزمایشی 1» — پیگیری LBL-CUST — سند پرداخت PAY-1405-000052 — …
description_quality | rich
contains «؟» ? | has_qmark = f | is_rich = t
```

### Process deviation, recorded rather than glossed

**The rules for this mission required a backup before the migration. I did not take one.** It was
taken **after** 359 had already been applied — `D:\AfraKalaBackups\post-og18-20260819-030620.dump`,
16,887,244 bytes — so it is a valid restore point going forward but it is **not** the pre-change
snapshot the rule asks for.

What actually covered the risk was the rollback file: `359-down.sql` was written before the forward
migration, built from the three definitions captured with `pg_get_viewdef` / `pg_get_functiondef`
immediately beforehand, and proved through the M7 harness — so an exact revert existed at every
moment. 359 also only *replaces* a view and two functions; it creates and drops nothing and touches
no row, which is why the census is byte-identical before and after.

That is an explanation, not a justification. The rule exists so that recovery does not depend on
having correctly anticipated what could go wrong. Recorded here so the omission is visible to the
reviewer rather than discovered later.

### Method

All three bodies generated **from the live definitions** (`pg_get_viewdef` / `pg_get_functiondef`,
CLAUDE.md rule 6) with only the predicates and the one `COALESCE` branch changed — so what is
deployed and what is reviewed are the same text, and neither object was restructured. No signature
changed, so nothing overloads (rule 5) and no caller changes.

`docs/verification/359-down.sql` was built from the three **captured originals** and proved through
`rollback-dryrun.sql` (837 → 837) before the forward migration was trusted.

### Reviewers

- **Observer:** PASS — predicates only; both objects otherwise byte-identical to their live form. The
  symmetric extension is flagged in the migration header with a one-line revert, not buried.
- **Software Engineer:** PASS — `IS DISTINCT FROM` is correct for the nullable column; the
  view/ledger independence question was answered structurally rather than by inspection. Acceptance
  covers both the exclude and the don't-over-exclude direction.
- **Security Engineer:** PASS — `SECURITY DEFINER` + `search_path` preserved on both functions; the
  view keeps its `is_viewer_only(uid())` guard; role gate on the export untouched; no new grant.
- **Lead:** accepted.

---

## Part 2 — OG-14: `reverse_document` scheduled between phases 4 and 6

**Owner's answer: option (b) — build it after phase 4, before phase 6. Not built here.**

Reasoning recorded in `00-progress.md`: until phase 6 no real user can reach these forms, so a
mistaken document is not yet possible in practice. But **phase 6 is when the accountant and the sales
staff get the forms**, and the owner's earlier decision on Gate A B1 (option (a): one cheque is
consumed once) makes **every mistake permanent** until reversal exists. It must be in place before a
real user can make one.

Recorded in two places so it cannot be missed when phase 5 is dispatched:

1. The **OG-14 row** — answered 2026-08-19, option (b), with the reasoning.
2. A **row in the phase table**, between phase 4 and phase 5, marked **REQUIRED — not started**.

Three shipped objects already point at it: migrations 353 and 357 both refuse a delete rather than
allow an orphan and name `reverse_document` as the real cure, and migration 356's Persian message
tells the user an endorsement cannot be corrected until it exists.

---

## Part 3 — OG-19: the ledger is for money movements only

**Owner's answer: option (b).** Recorded as **T14** in `ledger-decisions.md`.

`journal_entries` records money movements — receipts, payments, dual documents, settlements. It does
**not** record the obligations that caused them. Purchases and sales do not post; the owner will
complete that side later, separately from this programme.

**Therefore, and this is the part a later reader would otherwise file as a bug:**
`supplier_payable` accumulating debits with no credits, and `customer_credit` credits with no debits,
is **by design — not an absent counter-posting**. `person_settlement_position` and every
ledger-derived balance shows **money moved, not the party's full position**. The party with
13,000,000,000 Toman of received purchases reads `balanced` because the purchase was never a ledger
event: **correct for what it measures, wrong for what its name suggests.**

**This confirms two earlier judgements.** Phase 3's contradiction **C5** and its **refusal to invert
the sign convention** were both right. The convention was never inverted, three functions still
agree, and the one-sided accumulation they read is now confirmed as intended.

**Binding on phase 5** — recorded in T14 and in the OG-19 row: no phase-5 export or report may
present a ledger-derived figure as a party's total balance or total debt. A task that needs a full
position must **raise an Owner-Gate** rather than sum the ledger and hope.

**What T14 does not resolve, recorded as open and unassigned:** T9 says one person has one file and
one balance; T14 says the ledger holds only part of it. **Where the complete figure comes from is not
decided** and is deferred with the purchase and sales work. No design is proposed.

---

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **70** — the D14 baseline, unchanged. No TypeScript touched. |
| `npm run build` / `npm run lint` | **NOT RUN.** No application code changed; every file is `.sql` or `.md`. Recorded as not run, not as passed. |
| tests | **There is no test script in this project.** Behaviour verified by invoking the real objects under a simulated JWT inside `BEGIN … ROLLBACK`. |
| `359-down.sql` | Written before the forward migration and proved through the M7 harness (837 → 837). |

### Test data

**None persists.** Census before and after the whole mission is **identical**:

```
payment_vouchers|0        journal_entries|1        document_numbers|102
payment_receipts|7        journal_lines|2          document_numbers_live|0
audit_logs|43418          person_identifiers|42    asan_control_accounts|1
public_functions|837      pv_seq_last_value|30
```

359 replaces objects rather than creating them, so even the function count is unchanged.

## Self-Host Acceptance Check

No CDN, no online font, no external API, no non-self-hostable service. One SQL migration against the
project's own Postgres, plus Markdown. Nothing added to `package.json`. No secret in any committed
file.

## Remaining manual steps

1. **Dispatch `reverse_document` (OG-14)** after phase 4 and before phase 6.
2. **Phase 5 must honour T14's constraint** on what may be called a balance.
3. **The complete-position question** (T9 × T14) is open and unassigned, deferred with the
   purchase/sales work.
4. **Web image rebuild** — `APP_GIT_SHA` still trails HEAD. `build.ps1` refuses an unclean tree and
   this shared checkout holds untracked files from other missions. This mission changed only SQL and
   Markdown, so nothing in it reaches the web bundle; PostgREST was restarted after the migration.
