# Phase 6 remediation — progress

**Mission:** close the confirmed defects from `docs/execution/phase-6-GATE-A.md` (PR #331).
**Branch:** `feature/phase-6-remediation`, from `staging` @ `d6b15b92`.
**Started / finished:** 2026-08-22.
**Rule observed throughout:** no test in this mission ever clicked `wizard-submit`. Nothing was created on the database by the browser.

---

## Pre-flight answers

| | Answer | Effect |
|---|---|---|
| **Q1** name divergence | **(c)** — rewrite nothing; the readers agree | Phase 4 ran. No stored name changed. The agreed source is the person file |
| **Q2** endorsed-cheque test data | **do not create** | The endorsed branch stays untested end to end and is recorded as such |

Measured before asking Q1, so the owner decided against a number rather than a hunch:

```
customers with a person_id : 27      names that DIVERGE : 22      names that AGREE : 5
suppliers with a person_id : 15      names that DIVERGE : 15
diverge even after trim + whitespace collapse : 22
```

Divergence is the norm on this database, not a handful of stray rows. Options (a) and (b) would have rewritten ~37 stored names.

---

## Phase 0 — housekeeping ✅

PR #331 merged. `Boundary Guard: pass`; `Staging Check: fail` verified set-by-set against the recorded baseline — **70 unique errors, identical sets**, and the PR contained **0** files under `src/`.

```
{"mergedAt":"2026-08-22T11:21:05Z","state":"MERGED"}
```

---

## Phase 1 — BLOCKER: a cheque receipt could not be recorded ✅ CLOSED

**Code analyst.** The Gate A root cause was confirmed against the **live catalogue**, not the repo:

```
create_receipt  IF _channel IN ('bank','cash') AND p_destination_bank_account_id IS NULL -> error
create_receipt  IF _channel = 'cheque' THEN IF p_destination_bank_account_id IS NOT NULL -> error
create_payment  IF p_source_account_id IS NULL -> error          (unconditional, every channel)
```

So a cheque **receipt** must not carry an account and a cheque **payment** must. The old gate demanded one in both cases, and the account control renders only for `bank`, `cash`, `payment+cheque` — so on `receipt+cheque` no control existed, `accountId` stayed `""`, and the disabled button said nothing.

**Developer.** `canNext()` step 4, cheque branch: the account is now required only when `branch === "payment"`. Nothing else changed. Commit `f1b55c63`.

**Reviewer — CHANGE, then PASS.** The independent reviewer objected that the condition was written negatively (`branch !== "payment"`), so a future fourth branch would silently skip the account requirement. Accepted and rewritten positively as `branch === "payment" ? Boolean(accountId) : true` in `89e576d6`.

**Test author + runner.** `e2e/gate-a-phase-6/remediation-accept.spec.ts`, four tests, real output:

```
[1/4] receipt + cheque reaches the review screen
[2/4] payment + own cheque still requires its source account and reaches review
[3/4] regression: receipt + bank unchanged
[4/4] regression: receipt + cash still explains the missing cash box
  4 passed (25.1s)
```

**Independent review subagent — PASS.** It read the live `prosrc` itself, re-ran the suite, and probed the endorsed path separately, confirming the endorsed gate is statically unreachable from the modified expression and still closed. It also confirmed no test submits and typecheck is 70. Its three low-severity notes are all recorded: the positive-form objection (adopted), that the commit touched two files not one (correct — a source file and a spec), and that an untracked diagnosis spec sat in the harness directory (now committed).

---

## Phase 2 — BLOCKER: a `sales` user reached the wizard ✅ CLOSED

**Code analyst — the cause was measured, not inferred.** Gate A flagged its own explanation as read from code. Measured with a session whose only role is `sales`:

```
A) full page load   -> /accounting/payment-vouchers   denied = false
B) client-side nav  -> /unauthorized                  denied = true
```

The **SSR path** fails open. `resolveAuthWithRetry` opens with `if (typeof window === "undefined") return null`, and each guard then returns `{user: null, roles: []}` without throwing, so the server-rendered page is delivered and the initial route is never re-checked.

> **This paragraph originally continued: "The `rolesLoading` path, which Gate A also suspected, is **not** implicated." That was wrong** — see the phase-2/3 independent review section at the foot of this file (its D3). Every guard also returns without throwing on `rolesLoading || profileLoading || loading`, which is a second, client-side fail-open. My measurement never reached it because the roles were already warm. OG-24 has been corrected.

**Blast radius, measured before touching anything:**

```
routes using requireAnyRole     : 62
routes using requirePermission  : 73
routes using requireAdmin       : 15
                            total 150 route files
```

**Autonomous decision — the shared guard was NOT changed.** `ensureAuthReady` reads the session from browser storage (`src/lib/auth/session.ts:315` returns early when there is no `window`), so a server-side deny would redirect **every legitimate user to /login on their first page load**. With 150 route files depending on these three functions, changing them autonomously risks locking the whole application out, and the failure would not be visible in the four routes this mission tests.

**Developer.** Used the pattern this repository already applies in `_app.admin.asan-export.tsx` and five other routes: a client-side check inside the component, which runs after hydration — exactly where the SSR pass is blind. It **holds** rather than renders while `rolesLoading`. Commit `89e576d6`.

**Test author + runner.**

```
P2 sales sees: دسترسی ندارید. ثبت سند حسابداری فقط برای مدیر کل، حسابدار و مدیر است.
  ✓ sales is denied, with a readable Persian message, not a blank page
  ✓ admin still reaches the wizard
  ✓ accountant still reaches the wizard
```

**`manager` could not be tested, and this is a data fact, not a gap in the fix:**

```
test.manager@afrakala.local  ->  manager   status=rejected
test.viewer@afrakala.local   ->  viewer    status=rejected
```

It is the only manager account, its profile status is `rejected`, and the `_app` layout redirects a non-active profile before any route guard runs. Activating it means editing a user's account status, which is outside this mission. Recorded rather than skipped.

**Left open — Owner-Gate.** The shared guards' SSR fail-open still affects 150 route files. Three of the four accounting routes tested show no denial on a full page load. That is a scoped mission of its own.

---

## Phase 3 — the review screen told the user the wrong things ✅ CLOSED

Two of the four items were described differently in the mission than they are in the code. Both are still defects; both causes are recorded rather than quietly worked around.

| # | Mission said | Found | Fixed |
|---|---|---|---|
| 3.1 | Six entered values missing on dual review | Confirmed exactly | All six now shown |
| 3.2 | Dual says «از سرور می‌آید» while receipt/payment say «نمی‌آید» | **There is only ONE disclaimer**, shared by all three branches, and it read as a claim that the screen came from the server | Rewritten for all branches |
| 3.3 | Review renders a Gregorian date | Confirmed — raw ISO `{date}` | `formatDateFa`, the helper the app already uses |
| 3.4 | «پیوست اختیاری است» promises an upload control | It is in the **proforma** empty state and was about attaching a proforma, not a file | Wording made explicit. **No upload control was built** |

**Test author + runner** — asserting the on-screen text, not element presence:

```
P3 dual review:
  تاریخ: ۳۱ مرداد ۱۴۰۵
  شمارهٔ پیگیری: P3-DUAL-TRK
  شرح: P3-DUAL-DESC
  فقط روی سند — بدون اثر حسابداری
  نام انتقال‌دهنده: P3-TRANSFERRER
  شماره حساب انتقال‌دهنده: P3-TR-ACCT
  نام گیرندهٔ حساب: P3-RECIPIENT
  شماره حساب گیرنده: P3-RC-ACCT
  این صفحه فقط ورودی‌های خودتان را نشان می‌دهد و از سرور نمی‌آید؛ سند حسابداری پس از ثبت ساخته می‌شود.

P3 proforma empty state: پیش‌فاکتور بازی برای این مشتری وجود ندارد. تخصیص پیش‌فاکتور اختیاری است.
```

The date assertion is negative as well as positive: the review screen must contain no `YYYY-MM-DD` anywhere.

---

## Phase 4 — name divergence ✅ CLOSED (owner answer (c))

**No stored name was rewritten. No migration. No data change.**

The receipts list read `customers.name`; the Asan export reads the person file. The list now reads `persons.display_name` through `payment_receipts.customer_person_id`, keeping `customers.name` as a fallback for a row with no person. That join key was measured sound first:

```
receipts where customer_person_id IS NULL                        : 0
receipts where it disagrees with customers.person_id             : 0
```

**Acceptance — the same document, the same name, on both screens:**

```
receipts list : شخص آزمایشی 23  ۱۲۰,۰۰۰,۰۰۰  ۱۲۳۶۴
                شخص آزمایشی 2   ۵,۰۰۰,۰۰۰    ۶۵۶۵۶۵۶۵

export preview: واریز از «شخص آزمایشی 23» — پیگیری 12364 …
                واریز از «شخص آزمایشی 2» — پیگیری 65656565 …
  2 passed
```

The legacy names («مشتری آزمایشی 20», «مشتری آزمایشی 8») are asserted **absent** from the list table.

**One test defect of my own, recorded rather than hidden.** The first run of this acceptance failed. The fix was correct; the test was wrong twice — it located rows by a Latin-digit tracking number while the list renders Persian digits, and it asserted the page contains no «خطا», which matches unrelated navigation text. Corrected in `c51fcc47`.

---

## Phase 5 — final verification

Full suite, from scratch, against the deployed tip:

```
npx playwright test --config e2e/gate-a-phase-6/playwright.gate-a.config.ts remediation-accept
  12 passed (59.5s)

npx playwright test --config e2e/gate-a-phase-6/playwright.gate-a.config.ts remediation-accept-p4
  2 passed (14.8s)

npx tsc --noEmit | grep -c "error TS"
70
```

Deployment: the last commit touching `src/` is `24c1e188`, and `APP_GIT_SHA=24c1e188` on the test server — so every source change in this mission is the code that was tested.

---

## Files changed

| File | Why |
|---|---|
| `src/features/ledger-wizard/DocumentWizard.tsx` | the cheque gate (P1); the review screen's six missing values, Jalali date and disclaimer (P3) |
| `src/features/ledger-wizard/ProformaList.tsx` | the proforma empty-state wording (P3.4) |
| `src/routes/_app.accounting.receipts.create.tsx` | the client-side role check (P2) |
| `src/routes/_app.accounting.receipts.tsx` | the list reads the person file (P4) |
| `e2e/gate-a-phase-6/remediation-accept*.spec.ts`, `guard-diagnosis.spec.ts` | acceptance and diagnosis evidence |

`eslint --fix` also removed a pre-existing unused `eslint-disable` directive on `DocumentWizard.tsx:172`. It suppressed nothing, so the removal stands; recorded because it was not part of the brief.

---

## Nothing was BLOCKED

The circuit breaker never fired. No defect needed three attempts.

## Left for the owner

1. **Owner-Gate — the shared guards fail open under SSR.** 150 route files; measured, explained, deliberately not changed here. Needs its own scoped mission.
2. **`manager` has no testable session** (`status=rejected`). Either activate the account or accept that the manager path stays unverified.
3. **The endorsed-cheque branch has no live coverage** — zero endorsable cheques exist and Q2 said not to create one.
4. **G-1**, the unauthenticated view leak, remains open and untouched by this mission, as instructed.

---

## Independent review of phases 2 and 3 — PASS, with six defects, three of them mine

The reviewer confirmed every claim about the three files on screen, and went further than
the acceptance suite in three useful ways: it sampled the sales denial across hydration
(`t=200ms` through `t=5000ms`, denied at every sample, and the SSR HTML carries no wizard
markup, so there is no flash to catch); it exercised the `rolesLoading` hold by delaying
`/rest/v1/user_roles` by 8s and confirmed the page holds rather than flashing a false
denial at a legitimate accountant; and it classified every ASCII token in every added
Persian string, confirming the "English identifier in a Persian message" class did not
ship a fourth time.

### What I accepted and acted on

**D3 — my diagnosis was wrong, and the Owner-Gate said so.** I recorded "only the SSR
path fails open, not the `rolesLoading` path." Every guard has a second non-throwing
return on `rolesLoading || profileLoading || loading`, which is a client-side fail-open
too. My measurement never hit it because the roles were warm. **OG-24 has been corrected**
and now records two fail-open paths, not one.

**D4 — I showed the fields that carry no accounting weight and hid one that does.** The
review screen listed the four T11 evidence-only fields while omitting the **cheque
number**, which is a column on the document and reaches the ledger. Measured by the
reviewer: `CHQ-EVIDENCE-777` entered, `shown on review: false`. Fixed — the review screen
now shows the cheque number, due date and issuing bank on the cheque branches.

**D2 — the exploitability finding is better than mine.** The reviewer established what I
did not: the fail-open is **UI exposure, not privilege escalation**, because RLS returns
no rows and `create_receipt` enforces the same boundary with `42501`. That is now in
OG-24. The fair criticism stands: I deferred the fix without first checking whether the
hole was exploitable.

**D1 — a process slip of mine.** I briefed the reviewer that the box served `89e576d6`; by
the time it ran, phase 4 had landed and the box served `24c1e188`. The reviewer caught it
and proved the three files under review are byte-identical across that range, so the
evidence stands — but the brief was stale and that is my error.

### What I recorded rather than fixed, and why

**D5 — `formatDateFa` is off by one day for a negative-UTC viewer.** `new Date("2026-08-22")`
is UTC midnight and the helper pins no `timeZone`; measured Tehran/London `۳۱ مرداد ۱۴۰۵`,
Los Angeles `۳۰ مرداد ۱۴۰۵`. It is a **pre-existing shared helper** used across the app,
and this mission newly applied it to the review screen. Changing it touches every date in
the product, which is the same reason the shared route guard was left alone. Recorded for
the owner, not fixed here.

**D6 — the denial UX is inconsistent.** A full page load shows an inline Persian message
on the same URL; a client-side navigation redirects to `/unauthorized` with different
wording. The `ثبت فیش جدید` link also stays visible to a sales user, so it is a dead link.
Both are outside the four files this mission owns.

### One claim of the reviewer's I checked rather than accepted

It reported the guard counts as 62 / 74 / 16 against my 62 / 73 / 15. The difference is
immaterial to the argument and I did not re-litigate it; the figure that matters —
roughly 150 distinct route files — is agreed.

### A second test defect of my own, and a real finding it exposed

Adding the D4 cheque test produced a review screen reading **«تاریخ سررسید چک: ۷ اسفند ۲۲۵۷»**
— year 2257. I stopped and measured before recording it as a product defect, and it was
mine:

```
date pickers on this step: 2
  naive   picker[0] = "۱۴۰۵/۰۷/۱۰"
  naive   picker[1] = "۱۴۰۵/۰۵/۳۱۱۴۰۵/۰۷/۱۰"     <- fill() APPENDED
  careful picker[0] = "۱۴۰۵/۰۷/۱۰"
  careful picker[1] = "۱۴۰۵/۰۷/۱۰"
```

Playwright's `fill()` appends on `JalaliDateInput` when the field already holds a value.
The helper now clears and types, and the same test reads:

```
تاریخ: ۱۰ مهر ۱۴۰۵
شمارهٔ چک: CHQ-EVIDENCE-777
تاریخ سررسید چک: ۱۰ مهر ۱۴۰۵
بانک صادرکننده: BANK-EVIDENCE-777
```

**The finding it exposed is real and is recorded, not fixed.** `JalaliDateInput` accepted
`۱۴۰۵/۰۵/۳۱۱۴۰۵/۰۷/۱۰`, converted it to a date in **year 2257** rather than rejecting it,
and `canNext()` passed it because `Boolean(chequeDue)` is true. Nothing between that input
and the RPC bounds a cheque due date — migration 351's date bounds apply to
`p_payment_date`, not to `p_cheque_due_date`. So a malformed due date can reach the point
of submission.

It is out of this mission's scope: `JalaliDateInput` is not one of the four files this
mission owns, it was not a Gate A finding, and confirming what the RPC does with such a
date would require submitting, which this mission may not do. **Recorded for the owner.**

Worth noting in the fix's favour: the only reason this was visible at all is that the
review screen now shows the cheque due date. Before this mission it showed neither.
