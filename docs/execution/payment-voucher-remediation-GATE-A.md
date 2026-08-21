# Gate A — payment-voucher remediation

**Date:** 2026-08-21
**Reviewer:** independent. Did not write the remediation.
**Under review:** migrations **368** / **369** and the D22 frontend change, merged as PR #328 and #329. `staging` @ `59ca554`.
**Method:** live catalogue only (`pg_get_functiondef`, `pg_get_viewdef`, `pg_policies`, `pg_policy`, `pg_class`, `pg_proc.proacl`, `information_schema`). Every behavioural claim is a real object invoked under a simulated JWT inside `BEGIN … ROLLBACK`, plus real HTTP calls against the running PostgREST. No repo file was used as evidence of what is live.
**Production (`192.168.170.10`):** not contacted.

**Census, before and after this review — identical on all eight tables:**

```
journal_entries 7 | journal_lines 14 | payment_receipts 10 | payment_vouchers 1
dual_documents 1  | document_numbers 159 | payment_receipt_links 3 | audit_logs 43514
```

---

## Verdict

**PASS** on all five Definition-of-Success items. The remediation does what it claims, and I proved the number rather than the source line.

**But this review found one BLOCKER-severity defect that the remediation did not cause and did not close: the company's bank balance is readable over HTTP by anyone holding the public anon key, with no login.** It is pre-existing — the pre-369 view carried the identical guard — but migration 369 re-created that exact view, and the mission's own security rule (Execution Document §10, "re-verify the ACL shows no `PUBLIC` or `anon` grant") pointed straight at it and was answered for functions only. It needs its own triage, urgently, and it is not a reason to reject this remediation.

**Severity count: 1 BLOCKER · 0 MAJOR · 4 MINOR.**

---

## The question that matters most — is RLS genuinely enforced, or does the fix only look closed?

**Genuinely enforced.** Measured, not assumed:

```
relrowsecurity      = true    <- RLS is ON, so dropping the policy is a real change
relforcerowsecurity = false   <- the owner bypasses RLS, which is what the SECURITY DEFINER writers need

policies on payment_vouchers = 3
  payment_vouchers_delete_admin    cmd=d  PERMISSIVE
  payment_vouchers_select_finance  cmd=r  PERMISSIVE
  payment_vouchers_update_finance  cmd=w  PERMISSIVE
policies permitting INSERT (cmd 'a' or '*') = 0
```

Had `relrowsecurity` been `false`, dropping the policy would have changed nothing and every authenticated insert would still have succeeded. It is `true`.

Reproduced end to end, as role `authenticated` with an admin JWT, inside `BEGIN … ROLLBACK`, running the exact insert shape the old `createPaymentVoucher` used:

```
A_raw_insert_as_authenticated
    42501 :: new row violates row-level security policy for table "payment_vouchers"
B_create_payment_same_session
    SUCCEEDS -> PAY-1405-000053 | journal entries 1
F_raw_insert_as_anon
    42501 :: new row violates row-level security policy for table "payment_vouchers"
```

The path is closed for `authenticated` and for `anon`, and the RPC still works in the same session.

**One correction to the mission's own reasoning, in its favour.** D19 and 368's header claim the change "mirrors A4/G6 — `journal_entries` and `journal_lines` carry no INSERT policy at all." My first measurement appeared to contradict that. It did not: those tables each carry a **RESTRICTIVE** `viewer_restricted` policy with `cmd='*'`, which restricts rather than permits. Counting permissive policies only, all four ledger-class tables agree:

```
journal_entries   permissive INSERT policies = 0
journal_lines     permissive INSERT policies = 0
document_numbers  permissive INSERT policies = 0
payment_vouchers  permissive INSERT policies = 0
```

The claim is correct. I record the near-miss because it is the kind of measurement error that produces a confident false finding.

---

## Defects

### G-1 — BLOCKER — `vw_account_balances` returns the bank balance to an unauthenticated caller

**Location:** `public.vw_account_balances` (re-created by migration 369); table grant to `anon`; `public.is_viewer_only`.

**Description.** The view's only guard is `WHERE NOT public.is_viewer_only(auth.uid())`. For an anonymous request `auth.uid()` is `NULL`, and `is_viewer_only(NULL)` returns **false**, so `NOT false` is **true** and every row passes. The view is owned by `supabase_admin` with **no `security_invoker`**, so it runs with owner rights and the RLS on `journal_lines` / `journal_entries` underneath never applies. `anon` holds `SELECT` on the view. The anon key is a client-side key shipped in the public bundle.

**Evidence.** Real HTTP call to the running PostgREST with only the anon key, no user session:

```
GET /rest/v1/vw_account_balances?select=title,current_balance
  -> HTTP 200
  -> [{"title":"12","current_balance":10289000000.00}]

control, same key, same request shape:
GET /rest/v1/journal_entries?select=id   -> HTTP 200  []      (RLS correctly blocks)
GET /rest/v1/payment_vouchers?select=id  -> HTTP 200  []      (RLS correctly blocks)
GET /rest/v1/customers?select=id         -> HTTP 200  []      (RLS correctly blocks)
```

The base tables are protected. The view is not.

```
is_viewer_only(NULL) = false   ->  NOT (...) = true
vw_account_balances owner = supabase_admin, reloptions = <none>   (no security_invoker)
anon grants on the view: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
the anon key is present in /app/.output/public/assets/index-BEJ8Bsru.js
```

**It is a class, not one view.** Eight views carry the same `is_viewer_only` guard. Six also carry an `anon` SELECT grant. Four return data over HTTP:

```
vw_account_balances                     HTTP 200   bank balances
product_computed_prices_public          HTTP 200   product prices
publish_recipients_view                 HTTP 200   staff full names
v_promotion_suggestions                 HTTP 200   product data
v_dynamic_customer_capital_balances     HTTP 401   42501 permission denied
v_dynamic_salesperson_capital_balances  HTTP 401   42501 permission denied
vw_customer_receivables                 HTTP 401   (no anon grant)
vw_supplier_payables                    HTTP 401   (no anon grant)
```

I did not determine why the two `v_dynamic_*` views return 401 despite `information_schema` showing an `anon` SELECT grant. That inconsistency is itself worth someone's attention.

**Not caused by this mission.** `369-down.sql:68` holds the pre-369 body captured verbatim from the catalogue, and it carries the identical `WHERE NOT is_viewer_only(uid())`. The exposure predates the remediation.

**Recommendation — the owner decides, this review does not.** Three options, none of them taken here:

1. **Revoke `anon` on these views.** Smallest change, closes the four confirmed leaks. Does not fix the guard, so any future `anon` grant reopens it.
2. **Fix the guard** so a NULL uid fails closed — e.g. require an authenticated role rather than merely "not a viewer". Fixes the class at the root; touches eight views and needs each one's readers re-checked.
3. **Add `security_invoker=true`** to these views so the underlying RLS applies. Ten other views in this schema already use it, so the project knows the mechanism — the inconsistency is itself the finding. Highest confidence, largest blast radius.

This is not for the payment-voucher mission to fix. It deserves its own scoped mission with its own Gate A.

### G-2 — MINOR — `authenticated` keeps a bare table-level INSERT grant on `payment_vouchers`

**Evidence.**

```
authenticated : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
anon          : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

RLS is the only thing refusing the insert. If RLS were ever disabled on this table, the raw path reopens silently rather than failing.

**Why MINOR and not MAJOR.** The identical grant exists on `journal_entries` and `journal_lines` — the very tables 368 mirrors — and on 230 objects in this schema. `payment_vouchers` is now exactly consistent with the pattern it claims to follow. Narrowing one table would be cosmetic; the mission said so in 368's header and recorded it in `deferred.md`, which is the correct handling. The risk is real but schema-wide.

**Recommendation.** Fold into the same scoped mission as G-1 — both are "the grant layer is doing nothing and RLS is load-bearing alone".

### G-3 — MINOR — `payment_vouchers` lacks the `viewer_restricted` policy its sibling ledger tables carry

**Evidence.**

```
journal_entries :: viewer_restricted  cmd=*  RESTRICTIVE  qual=(NOT is_viewer_only(uid()))
journal_lines   :: viewer_restricted  cmd=*  RESTRICTIVE  qual=(NOT is_viewer_only(uid()))
payment_vouchers :: (no viewer_restricted policy)
```

Not a live hole: `payment_vouchers_select_finance` already requires admin/manager/accountant, which a viewer-only user fails. It is an inconsistency with the pattern, and it is the open **OG-15**.

**Recommendation.** Record against OG-15. No action inside this mission's scope.

### G-4 — MINOR — commit `59ca554` is described as documentation-only and is not

**Evidence.**

```
59ca5543  docs: commit outstanding research/audit artefacts from prior missions
53 files:  24 .txt   18 .md   9 .sql   1 .mjs   1 .jsonl
```

The nine `.sql` files are `audit/inventory/readonly-xray*.sql` and `scratch/programme-audit-*.sql` — ad-hoc analysis scripts. None is under `supabase/migrations/`, none is application code, and my independent scan reproduces the mission's clean verdict:

```
secret-like tokens (SERVICE_ROLE|JWT_SECRET|POSTGRES_PASSWORD|LOVABLE_API_KEY|PGPASSWORD|eyJhbGciOi|PRIVATE KEY) : 0
phone-shaped strings ((\+98|09)[0-9]{9}) : 0
```

So the content is safe. What is imprecise is the characterisation — and `scratch/` is now permanent repository content that will ship in every clone.

**Recommendation.** Decide whether `scratch/` belongs in the repository or in `.gitignore`. Not urgent.

### G-5 — MINOR — both balance readers carry PUBLIC and `anon` EXECUTE

**Evidence.**

```
get_account_balances  secdef=true  search_path=public
    acl = =X/supabase_admin | postgres=X | supabase_admin=X | anon=X | authenticated=X | service_role=X
get_account_ledger    secdef=true  search_path=public
    acl = (identical)
```

`=X` is a grant to PUBLIC. **Verified harmless in practice** — under genuine anonymous claims both refuse:

```
auth.uid() under {"role":"anon"} = NULL (correct)
get_account_balances() as anon  -> 42501 :: forbidden
get_account_ledger(...) as anon -> 42501 :: forbidden
```

Pre-existing; `CREATE OR REPLACE` in 369 preserved the ACL rather than widening it.

**Recommendation.** Same scoped mission as G-1/G-2.

---

## Verified correct

| # | Claim | How I proved it |
|---|---|---|
| V-1 | RLS genuinely enforced; the raw path is closed | `relrowsecurity=true`, 0 permissive INSERT policies, `42501` reproduced for `authenticated` **and** `anon` |
| V-2 | `create_payment` unaffected | Same session as the refusal: `PAY-1405-000053`, 1 journal entry |
| V-3 | A bank receipt moves the figure by exactly its amount | `create_receipt` 3,141,592 → delta **3141592.00** |
| V-4 | A bank payment moves it by exactly its amount | `create_payment` 2,718,281 → delta **−2718281.00** |
| V-5 | **The arithmetic itself, computed not inferred** | Hand-summed ledger net = 10,189,423,311; `opening 100,000,000 + net` = **10,289,423,311**; view = **10,289,423,311**. Equal |
| V-6 | **The negative case** — the defect is closed at the reader | Journal-less voucher for **777,000,000** inserted as the owner (what the legacy path produced): 0 journal entries, figure delta **0.00** |
| V-7 | Cheque payment still does not move the bank figure | delta **0.00** (OG-18 / 359 preserved) |
| V-8 | Dual document still does not move it | delta **0.00** |
| V-9 | `pay_purchase_with_voucher` unaffected and visible to the new readers | Invoked on a real unpaid purchase: delta **−1,234,567**, exactly its amount |
| V-10 | T-0.2's zero-legacy-data claim still holds | Re-measured: vouchers with no journal entry = **0** |
| V-11 | `get_account_balances` reads the corrected view, no separate computation | Live body: `FROM public.vw_account_balances v`, nothing else; `SECURITY DEFINER`, `search_path=public`, role-gated |
| V-12 | Neither reader takes **money** from the source tables | `vw_account_balances` mentions `payment_receipts`/`payment_vouchers`: **false**. `get_account_ledger` mentions them on exactly two lines, both `SELECT … document_channel` — the display label, as D21 says |
| V-13 | The page is read-only **in fact** | No `useMutation`, no `.insert(`, no `.rpc(`, no `<form`, no `onSubmit`, no `mutate(` anywhere in the file |
| V-14 | `createPaymentVoucher` is gone from `src/` | Only match is the removal comment at `queries.ts:173` |
| V-15 | The two references the mission found still resolve | `DocumentWizard.tsx:294` and `treasury.tsx:105` both point at a route whose file exists, exports one `createFileRoute`, exports its component, and appears 12× in the generated route tree |
| V-16 | The deployed bundle matches, reproduced independently | «سند پرداخت جدید» absent; `_app.accounting.payment-vouchers-B2x3wdSz.js` present; `APP_GIT_SHA=59ca5543` = staging tip |
| V-17 | Both rollback files run and keep their hands off the transaction | Dry-run harness on 369-down then 368-down: `841 → 841` both times, `still_in_txn=t`, no ERROR, no "no transaction in progress" |
| V-18 | No stale-signature defect (the `361-down` / m7 class) | `369-down:70` declares `(p_account_id uuid, p_from_date date, p_to_date date)`; live identity args are identical. It is `CREATE OR REPLACE`, not `DROP`, so a future signature change fails **loudly** rather than no-opping |
| V-19 | No mixed-script user message introduced | Only Persian-bearing lines in either function are `'حساب یافت نشد.'` (pure Persian) and one code comment |
| V-20 | typecheck / Boundary Guard / drift | `npx tsc --noEmit` → **70**; Boundary Guard **pass** on both #328 and #329; mission diff = **11 files**, nothing outside scope |

---

## Definition of Success — item by item

| # | Item | Verdict | Basis |
|---|---|---|---|
| 1 | Only `create_payment` can create a payment document | **PASS** | V-1, V-2. Refusal reproduced for two roles; RPC unaffected in the same session |
| 2 | Every displayed bank figure is ledger-derived | **PASS** | V-3 – V-6, V-11, V-12. The arithmetic was computed and matched exactly, and the journal-less voucher moved nothing |
| 3 | Legacy data measured and decided, not silently kept or dropped | **PASS** | V-10 re-measured 0; D20 records the decision; no row was deleted or altered |
| 4 | typecheck 70 / Boundary Guard green / zero drift | **PASS** | V-20 |
| 5 | Independent Gate A review | **This document** | — |

---

## D22 — read-only history instead of deletion

**The implementation matches the decision. Nothing is left half-migrated toward the original full-deletion plan.**

| What D22 said | Measured |
|---|---|
| Remove the create capability | No mutation, form, insert or rpc call anywhere in the page (V-13); `createPaymentVoucher` gone from `src/` (V-14) |
| Keep the page and its list | Route file exists, exports its `createFileRoute` and component, ships in the bundle (V-15, V-16) |
| Keep both registry entries | `registry.ts` → **2**, `primary-modules.ts` → **1** |
| Keep `fetchPaymentVouchers` | Present, 1 export |
| No debris from the abandoned plan | `eslint` reports **0** unused-variable findings on the page; no orphaned imports, no dead component |

The choice also removed work rather than adding it: keeping the route is what leaves `DocumentWizard.tsx:294` and `treasury.tsx:105` — the two references the founding document never listed — working with no edit to either. Under full deletion both would have needed changing.

---

## What I could not verify

- **Production.** Not contacted, by instruction. Nothing here says anything about production's catalogue, grants, or data.
- **Why `v_dynamic_customer_capital_balances` and `v_dynamic_salesperson_capital_balances` return HTTP 401** while `information_schema` reports an `anon` SELECT grant on both. Measured the contradiction; did not explain it.
- **Whether the G-1 exposure is reachable from outside this LAN.** I called PostgREST on `localhost:9000` from the test host. I did not test what the network permits from elsewhere, and that materially changes how urgent G-1 is.
- **The browser.** Every frontend finding is static analysis plus a grep of the shipped bundle. I did not click through the page, the wizard's post-payment navigation, or the treasury link.
- **The full down-chain in reverse order** beyond 369-down and 368-down. I proved these two run and restore state; I did not run the wider 367→336 chain.
- **Whether any *other* reader of bank figures exists** that neither the mission nor I enumerated. I confirmed the two named readers and `get_account_balances`; a reader outside those names would not have surfaced.
- **Cash paths.** No `account_type='cash'` row exists, so cash remains untestable, exactly as before this mission.
- **The `_dynamic` capital views' correctness** — out of scope; only their exposure was measured.

**One disclosure about method.** My first anon probe reported both reader RPCs returning data to `anon` — an apparent MAJOR leak. It was wrong: `SET LOCAL "request.jwt.claims"` persists for the transaction, so the admin's claims were still in force when I switched role. Re-run with genuine anonymous claims (`{"role":"anon"}`, `auth.uid()` NULL), both correctly returned `42501`. The false positive is recorded because the correction is what produced V-5's discipline elsewhere in this report, and because a Gate A that hides its own near-misses is worth less.

---

*End of review. No migration, database object, or application file was changed. This file is the only artefact.*
