# Gate A — phase 6, the three-branch document wizard

**Date:** 2026-08-21
**Reviewer:** independent. Did not write phase 6.
**Under review:** `src/features/ledger-wizard/` (PR #325), merged to `staging` with no Gate A. `staging` @ `59ca554`, served by the test box (`APP_GIT_SHA=59ca5543`).
**Method:** Playwright against the live test server, plus code reading where the browser cannot explain a cause. **No test in this review ever clicked a submit button.** Every run fills fields, steps forward, reads the screen, screenshots, and stops.
**Production (`192.168.170.10`):** not contacted.

**Evidence scripts:** `e2e/gate-a-phase-6/` — five spec files and a dedicated Playwright config. They are deliberately **not** added to `playwright.config.ts`'s `testMatch`: they print evidence rather than assert a contract, so they do not belong in the regression suite. Run them with:

```
npx playwright test --config e2e/gate-a-phase-6/playwright.gate-a.config.ts
```

`e2e/` is outside `tsconfig.json`'s `include`, so these TypeScript files cannot change the typecheck count. Measured after writing them: **70**, the D14 baseline. No file under `src/` was modified.

---

## Verdict

**FAIL — 1 BLOCKER · 3 MAJOR · 3 MINOR.**

The blocker is narrow and total: **a cheque receipt cannot be created at all.** The wizard's own step-4 gate requires a bank account for a cheque receipt, and that branch never renders an account control, so the "بعدی" button is permanently disabled and nothing on the page says why. Phase 6 deleted `PaymentReceiptForm`, so no other path to a cheque receipt exists.

Two of the six previously-reported findings **do not reproduce as defects**, and this report explains why the earlier observer saw what they saw. That matters as much as the confirmations.

---

## Row-by-row verdict on the six known findings

| # | Reported | Verdict | Evidence |
|---|---|---|---|
| 1 | Cheque receipt branch gets stuck, no error shown | **REPRODUCED — BLOCKER** | P6-B1 below. A/B against the payment branch isolates the cause |
| 2 | Payment wizard doesn't enforce recipient-must-be-supplier | **NOT REPRODUCED — not a defect** | The premise is wrong; see below |
| 3 | Dual evidence-only names missing from the review screen | **REPRODUCED — and worse than reported** | P6-M1. Six values are missing, not four |
| 4 | Review screen uses the Gregorian calendar | **REPRODUCED — MAJOR** | P6-M3 |
| 5 | Review screen is not a real preview | **REPRODUCED — confirmed, text quoted** | P6-m1 |
| 6 | Asan export preview shows mismatched data | **NOT REPRODUCED as a data defect — but the confusion is real and has a cause** | P6-m3 |

### Why finding 2 is not a defect

The report assumed a payment must go to a supplier. **The contract says otherwise.** `docs/api/rpc-contracts.md:260`:

```
p_payee_type  text,  -- 'supplier' | 'external_party' | 'customer'   (P3-C2)
```

The live function agrees — `IF _payee_type NOT IN ('supplier', 'external_party', 'customer')` — and a real payment to a customer already exists in the ledger (`PAY-1405-000052`, `payee_type=customer`). A refund to a customer is a legitimate payment.

Measured: the payment branch accepted شخص آزمایشی 17 (a customer who is **not** a supplier and not an external party) and enabled "بعدی". That is correct behaviour.

The control in the same run shows the receipt branch *does* enforce its own narrower rule, because `create_receipt` takes `p_customer_id` only:

```
=== F2-control receipt payer = a supplier (should be refused) ===
party accepted : false
on-screen text : این شخص مشتری نیست. دریافت فقط از مشتری ثبت می‌شود.
```

The asymmetry the observer noticed is by design, not a gap.

### Why finding 6 is not a data defect

Two documents were selected (the page pre-ticks eligible rows; this run touched no checkbox) and previewed:

```
=== listed, untouched ===
سند 2026-07-25 — 6d6b1896 | ۱۴۰۵/۰۵/۰۳ | مشتری آزمایشی 17 | ۱۰,۱۰۰,۰۰۰,۰۰۰ | مسدود | کد حساب آسان … ثبت نشده است
سند 2026-08-19 — d9f2eda4 | ۱۴۰۵/۰۵/۲۸ | مشتری آزمایشی 20 | ۱۲۰,۰۰۰,۰۰۰    | آماده
سند 2026-08-20 — e6330d06 | ۱۴۰۵/۰۵/۲۹ | مشتری آزمایشی 8  | ۵,۰۰۰,۰۰۰      | آماده

=== PREVIEW PANEL verbatim ===
تعداد اسناد انتخاب‌شده: ۲
مجموع مبلغ (ریال): ۱,۲۵۰,۰۰۰,۰۰۰
شماره‌ها: سند 2026-08-19 — d9f2eda4، سند 2026-08-20 — e6330d06
کد حساب | شرح                                                             | بدهکار      | بستانکار
8       | واریز از «شخص آزمایشی 23» — پیگیری 12364 — واریز به حساب بانکی   | 1200000000  |
600018  | واریز از «شخص آزمایشی 23» — پیگیری 12364 — افزایش اعتبار…        |             | 1200000000
8       | واریز از «شخص آزمایشی 2» — پیگیری 65656565 — واریز به حساب بانکی |   50000000  |
2       | واریز از «شخص آزمایشی 2» — پیگیری 65656565 — افزایش اعتبار…      |             | 50000000
```

The numbers are right. 120,000,000 + 5,000,000 Toman = 125,000,000, and the file is in **Rial** (the page carries an amber banner saying so), so 1,250,000,000. Tracking `12364` and `65656565` are exactly the two selected documents.

What is **not** right is that the same two documents are named differently in the two panels. Measured in the catalogue:

```
receipt 12364     | customers.name = مشتری آزمایشی 20 | persons.display_name = شخص آزمایشی 23 | SAME = false
receipt 65656565  | customers.name = مشتری آزمایشی 8  | persons.display_name = شخص آزمایشی 2  | SAME = false
```

The table shows the customer-record name; the journal line description carries the unified person's display name. An accountant comparing the two panels sees different people and different numbers for what is one document. **That is what the earlier observer saw, and calling it a preview bug was a reasonable reading of a genuinely confusing screen.** Recorded as P6-m3.

---

## Defects

### P6-B1 — BLOCKER — a cheque receipt cannot be created

**Location:** `src/features/ledger-wizard/DocumentWizard.tsx`, `canNext()` step 4 vs the step-4 render block.

**Description.** For a cheque receipt the step-4 gate is:

```js
if (channel === "cheque") {
  if (branch === "payment" && chequeKind === "endorsed") return Boolean(endorsedId) && Boolean(accountId);
  return Boolean(chequeNumber) && Boolean(chequeDue) && Boolean(time) && Boolean(accountId);
}
```

It requires `accountId`. But the account control renders only when:

```js
channel === "bank" || channel === "cash" || (branch === "payment" && channel === "cheque")
```

For **receipt + cheque** that is false, so no control exists, `accountId` stays `""`, and `canNext()` can never return true. Because "بعدی" is `disabled={!canNext()}` rather than a validation that runs on click, **nothing is shown to the user** — no message, no highlighted field.

The requirement is also contradicted by the wizard's own submit, which sends `p_destination_bank_account_id: channel === "cheque" ? null : accountId`, and by `create_receipt`, which **refuses** a destination account for a cheque: «برای چک، حساب مقصد ثبت نمی‌شود؛ چک پس از وصول به حساب می‌نشیند». So the gate demands a value the wizard would never send and the database would reject.

**Evidence — every visible field filled, including the due date:**

```
=== F1-airtight cheque receipt ===
{
  "chequeNumberFilled": true,
  "issuingBankFilled": true,
  "dueDateLabelOnScreen": true,
  "accountControlRendered": false,
  "accountLabelOnScreen": false,
  "nextDisabled": true
}
after force-click: review visible = false
```

**Evidence — A/B isolating the cause.** Identical effort on both branches:

```
=== A: PAYMENT + cheque(own) ===
account picker rendered : true
next disabled           : false
A reached review        : true

=== B: RECEIPT + cheque, identical effort ===
account picker rendered : false
next disabled           : true
B reached review        : false
```

The only difference between A and B is the account control, which B needs to pass its own gate and never gets.

**Consequence.** Phase 6 deleted `PaymentReceiptForm` (commit `e7dc789`, `D src/shared/components/PaymentReceiptForm.tsx`). There is no other UI for creating a cheque receipt. The RPC works — this review's own database probes created cheque receipts through `create_receipt` — but no user can reach it.

**Recommendation.** Drop `Boolean(accountId)` from the cheque branch of the step-4 gate for `branch === "receipt"`. Separately, consider whether a permanently-disabled "next" is the right interaction at all: a gate that cannot be satisfied and says nothing is indistinguishable from a frozen page. **This review does not apply the fix.**

### P6-M1 — MAJOR — the dual review screen omits everything the user typed except party, amount and date

**Location:** `DocumentWizard.tsx` step 5 render block.

**Description.** T11 defines four evidence-only fields on a dual document — the transferrer's and recipient's names and account numbers, carrying no accounting weight. The wizard asks for all four. The review screen renders none of them, and also omits the tracking number and the description.

**Evidence.** All four filled, confirmed by the script, then the review screen searched for each value **anywhere on the page**:

```
=== F3 fields filled ===
{ "نام انتقال‌دهنده": true, "شماره حساب انتقال‌دهنده": true,
  "نام گیرندهٔ حساب": true, "شماره حساب گیرنده": true }

=== F3 on the review screen ===
{ "GATEA-TRANSFERRER": false, "GATEA-TR-ACCT": false,
  "GATEA-RECIPIENT": false,   "GATEA-RC-ACCT": false,
  "GATEA-DUAL-TRK2 (tracking)": false, "GATEA-DUAL-DESC (description)": false }
```

The review screen in full, verbatim:

```
نوع: سند دوبل
طرف: شخص آزمایشی 2 / نوع پرونده: مشتری / کد آسان: 002
ذینفع: شخص آزمایشی 78 / نوع پرونده: تأمین‌کننده / کد آسان: 90019001
مبلغ: ۲٬۵۰۰٬۰۰۰ تومان
تاریخ: 2026-08-21
پیش‌نمایش سند حسابداری از سرور می‌آید؛ اینجا فقط ورودی‌ها نمایش داده می‌شود.
```

**Consequence.** The evidence-only fields exist precisely so a human can check the slip against the document before it is filed. The last screen before submitting money cannot show them. The same is true of the tracking number, which is the field an accountant most often mistypes.

**Recommendation.** Render the four T11 fields, the tracking number and the description on step 5. **Not applied here.**

### P6-M2 — MAJOR — a sales-only user reaches the wizard, contrary to OG-13

**Location:** the route guard, `src/lib/rbac/route-guards.ts` `requireAnyRole`, as used by `src/routes/_app.accounting.receipts.create.tsx:11`.

**Description.** The route declares `requireAnyRole(["admin", "accountant", "manager"])`. OG-13's answer is that `sales` may not create. A sales-only session reaches the page, sees the wizard, and can step into it.

**Evidence — the session is proved sales-only first, so this is not a stale-token artefact:**

```
=== who is this session? ===
identity on screen : test.sales@afrakala.local
"بدون نقش" present : false
url                : /sales/quotes          (loads normally)

catalogue: roles of ea9b35dd-… = sales      (that role only)

=== sales at /accounting/receipts/create ===
final url       : /accounting/receipts/create
wizard rendered : true
branch buttons  : true
redirected away : false
denial wording  : false
sales can reach step 3 (party lookup): true
```

**It is wider than the wizard.** Same session, four routes:

```
/accounting/receipts/create    redirected=false  denial=false
/admin/asan-export             redirected=false  denial=true
/accounting/payment-vouchers   redirected=false  denial=false
/accounting/treasury           redirected=false  denial=false
```

One route does deny, which proves denial is possible in this app; three do not.

**Cause — inferred from code, not measured.** `requireAnyRole` has two fail-open paths:

```js
if (typeof window === "undefined") return null;                       // resolveAuthWithRetry
…
if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
```

Either returns without throwing the `/unauthorized` redirect. **The browser evidence is behavioural; this explanation is a code reading and has not been proved by instrumenting the guard.**

**Consequence.** No wrong data can be written — the RPC still refuses with `42501`, and the wizard maps that to «شما مجوز ثبت این سند را ندارید.» But a salesperson can fill an entire document, look up a party and read their Asan code and name, and be refused only at the end. It is wasted work and an information surface for a role that should not have it. It is also a guard the programme believes is working.

**Recommendation.** Treat as shared-infrastructure work, not a wizard fix: `requireAnyRole` should fail closed. Because it affects at least three accounting routes, it deserves its own scoped mission. **Not applied here.**

### P6-M3 — MAJOR — the review screen shows a Gregorian date

**Location:** `DocumentWizard.tsx` step 5, `<p>تاریخ: {date}</p>`.

**Evidence.** From the receipt review screen and again from the dual review screen:

```
مبلغ: ۱٬۵۰۰٬۰۰۰ تومان
تاریخ: 2026-08-21
```

The amount on the same line is localised with `toLocaleString("fa-IR")`; the date is the raw ISO value. Every other date surface checked in this review is Jalali — the Asan export table shows `۱۴۰۵/۰۵/۲۸` for the same period.

**Consequence.** The last screen before money is committed shows a date in a calendar the user does not work in, next to an amount in the calendar they do. A 2026-08-21 that should have been 1405/05/30 is exactly the kind of thing this screen exists to catch.

**Recommendation.** Format `date` with the same Jalali helper the rest of the app uses. **Not applied here.**

### P6-m1 — MINOR — the review screen is inputs-only, and says so

**Evidence, exact text:**

```
پیش‌نمایش سند حسابداری از سرور می‌آید؛ اینجا فقط ورودی‌ها نمایش داده می‌شود.
```

The sentence is honest, and on its own it is fine. Combined with **P6-M1** it is the finding: the screen shows six facts, four of which the user cannot get wrong (branch, channel, party, amount), and omits the ones they can. It is labelled a preview and is closer to a receipt for four of the fields.

**Recommendation.** Either show everything entered, or rename it so it does not read as a verification step.

### P6-m2 — MINOR — `stepper-spec.md` still contradicts the running code on `23505`

**Evidence.**

```
docs/frontend/stepper-spec.md:167
| Server error `23505` | Treat as success — the document already exists; navigate to it |

src/features/ledger-wizard/rpc.ts:65
if (raw.includes("23505") || error.code === "23505") { return { ok: false, … } }
```

**The running code is correct** and its own comment says why. The document is stale, and it is the one a future implementer would read first.

**Recommendation.** Correct line 167 to match `rpc-contracts.md`.

### P6-m3 — MINOR — the export table and its preview name the same party differently

Full evidence under "Why finding 6 is not a data defect" above. `customers.name` and `persons.display_name` diverge in the test data, the table uses one and the journal description uses the other, and nothing on screen says they are the same party. It produced a false BLOCKER report from a careful observer, which is the cost.

**Recommendation.** Show one name for one party on that screen, or label which is which. Note this is Asan-export surface, not wizard code.

---

## Verified correct

| # | Claim | Evidence |
|---|---|---|
| V-1 | The bank receipt branch works end to end up to review | `next disabled=false`; review screen rendered and screenshotted |
| V-2 | The payment + own-cheque branch works end to end up to review | `account picker rendered: true`, `A reached review: true` |
| V-3 | The receipt branch enforces its narrower party rule | «این شخص مشتری نیست. دریافت فقط از مشتری ثبت می‌شود.» shown for a supplier |
| V-4 | The payment branch correctly accepts a customer payee | Contract `rpc-contracts.md:260`, live function, and `PAY-1405-000052` all agree |
| V-5 | The cash branch fails **gracefully** — the opposite of P6-B1 | `no-cash-box message: true` («صندوقی با نوع نقدی ثبت نشده است»); next disabled, but the reason is on screen |
| V-6 | No attachment control is exposed (contract C8 / `0A000`) | `file input anywhere: 0` on the step that would carry one |
| V-7 | `23505` is treated as an error in the running code | `rpc.ts:65` returns `ok:false`; only the doc is stale |
| V-8 | Toman labelling is consistent in the wizard | «تومان» ×3, Latin "toman" ×0 |
| V-9 | The Asan export page uses Jalali dates | `۱۴۰۵/۰۵/۲۸`, `۱۴۰۵/۰۵/۲۹` in the listed rows |
| V-10 | The Asan export blocks a document with no party Asan code, visibly | Row 0: `مسدود` with «کد حساب آسان برای «مشتری آزمایشی 17» ثبت نشده است» |
| V-11 | The export preview arithmetic is right | 120,000,000 + 5,000,000 Toman → `مجموع مبلغ (ریال): ۱,۲۵۰,۰۰۰,۰۰۰`, unit stated on screen |
| V-12 | The export preview selects the documents it says it selects | `شماره‌ها: سند 2026-08-19 — d9f2eda4، سند 2026-08-20 — e6330d06`, matching the two eligible rows |
| V-13 | No submit was ever pressed, and no document was created by this review | Every script stops at the review screen; `payment_vouchers`, `payment_receipts`, `dual_documents` counts unchanged |
| V-14 | This review changed no application file | `git status --porcelain -- src/` empty; typecheck **70**, unchanged |

---

## What I could not verify

- **What a user sees when the backend refuses at submit.** The `42501` and `P0001` paths (a party with no Asan code, a `sales` user who fills the form anyway) are mapped in `rpc.ts` to Persian messages, but confirming what renders requires pressing submit, which this review is not authorised to do. The mapping is read, not seen.
- **The endorsed-cheque branch.** `payment_receipts` holds **zero** approved cheque receipts, so no held cheque exists to endorse and the branch cannot be exercised from the browser.
- **The cash branch beyond its refusal.** No `account_type='cash'` row exists, so the cash path stops at the same place it would for any user.
- **Whether `requireAnyRole`'s SSR path or its loading path is the one failing open.** Both are fail-open in the source; distinguishing them needs instrumentation this review did not add.
- **Roles other than `admin` and `sales`.** `accountant` and `manager` sessions exist in `e2e/auth/` and were not exercised; the findings above may present differently for them.
- **Whether P6-B1 also affects a cheque *payment* of kind `own` on a machine with no bank account.** Only the receipt branch was proved stuck.
- **Mobile/RTL layout.** Everything here is desktop Chrome at default viewport.

---

*End of review. No application file was changed. The artefacts are this report and the scripts under `e2e/gate-a-phase-6/`.*
