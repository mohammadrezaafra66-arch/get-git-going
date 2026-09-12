# E-3 proof — F-5, F-9, F-10 investigation

## Verdict

**F-5: FIXED** (currency label + KPI-subtitle digit locale). **F-9: FIXED** (sitemap origin + dead
pricing-hub branch removed). **F-10: the "9 stable failures in `e2e/persons/`" claim is FALSE** —
zero specs in `e2e/persons/` exercise the pages where the plain-text-customer-name defect actually
lives (`/sales/customers`, `/sales/quotes` list, `/accounting/receivables`). Every spec in that
directory that asserts a `/persons/*` link targets a page (quote detail, receipt detail, product
detail, or the persons module itself) that already renders the link correctly in current source.
No code change was made for F-10; it is a correction to the brief, not a fix.
F-1/F-2/F-3/F-4/F-6 were out of scope per the mission brief (already fixed / not-a-defect) and were
not touched.

Build: `npm run build` exit 0 (E3). `npx tsc --noEmit`: identical 70 errors across the same 6
pre-existing files before and after my changes — zero new errors, zero errors in any file I
touched (E4, before/after captured on the same baseline, not seeded).

---

## F-5 — currency label and KPI-subtitle digit locale

### 1. `fmtMoney` currency label

**File**: `src/routes/_app.accounting.payables.tsx:122-127` (post-edit; was 122-126).

Before:
```ts
function fmtMoney(n: number | null | undefined, currency?: string | null) {
  if (n == null) return NA;
  const cur = currency || "تومان";
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} ${cur}`;
}
```
Bug: `currency || "تومان"` only substitutes the Persian label when `currency` is falsy. A real
enum value such as `"toman"` or `"usd"` is truthy, so it passed straight through unlabelled English
text into a Persian, RTL page.

After:
```ts
function fmtMoney(n: number | null | undefined, currency?: string | null) {
  if (n == null) return NA;
  const cur = currency
    ? (CURRENCY_LABELS[currency as CurrencyCode] ?? currency)
    : CURRENCY_LABELS.toman;
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} ${cur}`;
}
```
Import added: `src/routes/_app.accounting.payables.tsx:12` —
`import { CURRENCY_LABELS, type CurrencyCode } from "@/lib/pricing/constants";`

Source of the map: `src/lib/pricing/constants.ts:7-12`:
```ts
export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  toman: "تومان",
  usd: "دلار سلیمانیه",
  aed: "درهم امارات",
  usd_us: "دلار تهران",
};
```
Idiom matched from an existing call site rather than invented: `src/routes/_app.pricing.shipping-rules.tsx:162`
— `(CURRENCY_LABELS[r.cost_currency as CurrencyCode] ?? r.cost_currency)` — cast + fallback to the
raw string for a value outside the known enum. `fmtMoney`'s `currency` param is untyped
(`string | null`, from the payables SQL view), so the same cast+fallback shape was used rather than
tightening the function signature (out of scope).

### 2. Dashboard KPI subtitle digits

**File**: `src/routes/_app.dashboard.tsx`.

`KpiCard`'s `value` prop is always Persian-digit-formatted:
`src/components/dashboard/KpiCard.tsx:42` —
`else if (typeof value === "number") display = formatter ? formatter(value) : toPersianDigits(value);`
— but `subtitle` is a pre-formatted string the caller builds itself, so it bypassed that path.

Line 178 (was line 178 pre-edit too — unchanged position):
```diff
-          subtitle={sales.data ? `${sales.data.issuedCount} فاکتور صادرشده` : undefined}
+          subtitle={
+            sales.data ? `${toPersianDigits(sales.data.issuedCount)} فاکتور صادرشده` : undefined
+          }
```

Lines 195-199 (purchases subtitle, was line 197 for the template literal):
```diff
           subtitle={
             purchases.data
-              ? `${purchases.data.approved} تأیید · ${purchases.data.pending} در انتظار`
+              ? `${toPersianDigits(purchases.data.approved)} تأیید · ${toPersianDigits(purchases.data.pending)} در انتظار`
               : undefined
           }
```
Import added: `src/routes/_app.dashboard.tsx:39` —
`import { formatTomanFa, toPersianDigits } from "@/lib/dashboard/utils";`
(`toPersianDigits` already existed at `src/lib/dashboard/utils.ts:5-8`; only the import was added.)

**Scope note**: the identical pattern also appears in `SalesKpis` at
`src/routes/_app.dashboard.tsx:286-290` (`purchases.data.approved` / `.pending` again, same
template). The brief named only lines 178 and 197, so this third occurrence was **left unfixed**
and is logged under "توصیه‌های خارج از دامنه" below rather than changed — same defect, same file,
but not one of the two locations named in the mission.

---

## F-9 — sitemap origin and dead pricing-hub branch

### 1. `sitemap.xml.ts` hardcoded origin

**File**: `src/routes/sitemap[.]xml.ts:1-5`.

Before:
```ts
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://get-git-going.lovable.app";
```
After:
```ts
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { BRANDING } from "@/config/branding";

const BASE_URL = BRANDING.publicOrigin;
```
Verified the export exists and its value: `src/config/branding.ts:19` —
`publicOrigin: "https://myafrakala.ir",` — and the file's own header (lines 1-7) states it is the
canonical source and that hardcoding the domain elsewhere is disallowed except in this file, tests
asserting the literal, and the static manifest (which cannot import TS). `sitemap.xml.ts` was none
of those three, so it was a real instance of the documented anti-pattern.

### 2. Dead `به‌زودی` branch in the pricing hub

**File**: `src/routes/_app.pricing.index.tsx`.

Verified every tile is `enabled: true` — grepped all 18 tile literals at lines 102-229
(`nrخ ارز` through `owner-attention`); every one carries `enabled: true,` and none carries `false`.
So `t.enabled ? A : B` in the render (old lines 277-283 for the badge, old lines 290-298 for the
`Link`-vs-`div` wrapper) always took branch `A`; branch `B` (`به‌زودی` badge, `opacity-60` card,
`cursor-not-allowed` non-link wrapper) was unreachable dead code.

Before (old lines 264-300):
```tsx
{tiles.map((t) => {
  const inner = (
    <Card
      className={`h-full transition-colors ${t.enabled ? "hover:border-primary/40 hover:bg-muted/30" : "opacity-60"}`}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <t.icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{t.label}</span>
            {t.enabled ? (
              <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                به‌زودی
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
        </div>
      </CardContent>
    </Card>
  );
  return t.enabled ? (
    <Link key={t.to} to={t.to} className="group">
      {inner}
    </Link>
  ) : (
    <div key={t.to} className="cursor-not-allowed">
      {inner}
    </div>
  );
})}
```
After:
```tsx
{tiles.map((t) => (
  <Link key={t.to} to={t.to} className="group">
    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <t.icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{t.label}</span>
            <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
        </div>
      </CardContent>
    </Card>
  </Link>
))}
```
Nothing was "enabled" — the tile data (`enabled: true` on every tile object, lines 102-229) was
left untouched; only the always-false branch of the render logic was removed, per the brief's
explicit instruction not to enable anything.

---

## F-10 — investigation: does `e2e/persons/` have 9 stable failures from a plain-text customer name?

### Method

`e2e/persons/` has 33 spec files. Grepped every file for any `/persons/` path reference
(`grep -rl "persons/" e2e/persons`) to find which specs could possibly be asserting a person link
anywhere; 18 files matched. Grepped those 18 for actual link assertions
(`getByRole("link"...)`, `locator('a[href...')`, `toHaveAttribute("href"...)`) and read each hit in
context. The other 15 files (`aliases-crud`, `credit-unchanged`, `credit-uses-person`,
`customer-form-person`, `every-person-is-a-customer`, `external-party-person`,
`filters-visible-persons`, `inline-supplier-create`, `one-person-one-customer`,
`purchase-price-person`, `search-visible-persons`, `supplier-form-person`, `wizard-name-lookup`,
`_session-probe`) contain **zero** `/persons/` references and **zero** link/href assertions
(confirmed by a second grep restricted to those 14 filenames for
`getByRole\(.link.*name|toHaveAttribute\(.href|locator\(.a\[href` — no matches) — they cannot be
testing the plain-text-name defect under any locator idiom.

For each of the four specs the brief named, and every other spec asserting a `/persons/*` href, I
read the spec's `page.goto` target and the rendering component for that target, on the current
worktree source (`ad0138df` + my F-5/F-9 edits, which touch none of these files).

### Confirmed: the real plain-text defect exists, but on pages `e2e/persons/` never visits

- `src/routes/_app.sales.quotes.index.tsx:143` — the quotes **list** query selects
  `"id, quote_number, customer_name, customer_phone, ..."` — no `customer_person_id`, no link. Grep
  for `customer_person_id|person_id` in that file: no matches.
- `src/routes/_app.accounting.receivables.tsx` — grep for `customer_person_id|person_id|persons/`:
  no matches in the file at all (only an unrelated `salesperson_id` field).
- `/sales/customers` — no route file named `_app.sales.customers*` exists; the actual list route is
  `src/routes/_app.sales_.customers.tsx`, not inspected further (out of scope — no `e2e/persons/`
  spec touches it either).

This matches what R-3 reported. The question is only whether any `e2e/persons/` spec exercises
these three pages. None does — see the table below; no `page.goto` in any of the 18 relevant files
targets `/sales/customers`, `/sales/quotes` (the **list** route, as opposed to
`/sales/quotes/{id}`), or `/accounting/receivables`.

### Table

| Spec file | Assertion | Page under test | Component that renders it | Verdict |
|---|---|---|---|---|
| `quote-list-link.spec.ts` (test 1) | `a[href^="/sales/quotes/"]` opens quote detail | `/sales/quotes` list, link is the **quote number**, not the customer name | `src/routes/_app.sales.quotes.index.tsx` (renders `<Link to="/sales/quotes/$quoteId">`) | Unrelated to the person-link claim — no person assertion in this test. PASS by source read (link exists as of the comment at file lines 3-7 documenting Phase 6.6 added it). CANNOT-DETERMINE-WITHOUT-RUNNING for data presence (needs ≥1 quote row). |
| `quote-list-link.spec.ts` (test 2) | `page.getByRole("main").locator('a[href*="/persons/"]')` on the **quote detail** page reached via that click | `/sales/quotes/{id}` (detail) | `src/routes/_app.sales.quotes.$quoteId.tsx:261-269` — `quote.customer_person_id ? <Link to="/persons/$personId/edit" ...>` | Source correct — link is wired for any quote whose `customer_person_id` is set. PASS by source read; CANNOT-DETERMINE-WITHOUT-RUNNING whether the DB has such a quote at test time. |
| `quote-customer-link.spec.ts` (test 1) | `a[href="/persons/${personId}/edit"]` contains `customerName`, navigates to `/persons/{id}/edit` | `/sales/quotes/${quoteId}` (detail, navigated directly via `dbScalar`-picked quote) | Same `_app.sales.quotes.$quoteId.tsx:261-269` | PASS by source read — the component renders exactly this link/text when `customer_person_id` is set, which the spec's own DB query guarantees before navigating. |
| `quote-customer-link.spec.ts` (test 2) | `page.getByRole("main").locator('a[href*="/persons/"]')` has count 0 on a quote **with no** `customer_person_id` | Same detail route, different quote | Same component — the `quote.customer_person_id ? <Link>... : <span>{quote.customer_name}</span>` (implied by the ternary at line 262) | PASS by source read — falsy `customer_person_id` takes the non-link branch. |
| `receipt-person-link.spec.ts` | `a[href="/persons/${personId}/edit"]` | `/accounting/receipts/${receiptId}` (detail) | `src/routes/_app.accounting.receipts.$receiptId.tsx:662-669` — `receipt.customer_person_id ? <Link to="/persons/$personId/edit" ...>{receipt.customer?.name ?? "—"}</Link>` | PASS by source read, contingent on a receipt with `customer_person_id` existing (spec's own `dbScalar` query guarantees this before navigating). |
| `product-supplier-person.spec.ts` | `a[href="/persons/${personId}/edit"]` | `/products/${productId}` | `src/shared/components/ProductSupplierManager.tsx:165-175` (desktop table row, inside `<td>`); the mobile-card block at lines 210-262 does **not** render this link | PASS at default (desktop) Playwright viewport — the desktop row with the person icon-link is what's visible; no viewport override in the spec. Would FAIL only under a mobile viewport, which this spec does not set. |
| `search-ui.spec.ts` | `getByRole("link", {name: "مشاهده"})` → `/persons/{id}` | `/persons` (the module's own list) | `src/routes/_app.persons.tsx:556-559` — `<Link to="/persons/$personId" params={{personId: r.id}}><Eye/> مشاهده</Link>` | PASS by source read. Not the defect page at all. |
| `filters-ui.spec.ts` | same `مشاهده` link, filtered list | `/persons?...` | Same `_app.persons.tsx:556-559` | PASS by source read. |
| `person-profile.spec.ts` | `مشاهده`/`ویرایش` links, and the profile page's own edit link | `/persons`, `/persons/{id}` | `_app.persons.tsx:556-566` (list) and `_app.persons_.$personId.tsx` (profile page's own "ویرایش" link) | PASS by source read for the list; profile page's own link not separately audited (out of scope — not the claimed defect page) but no plain-text-name defect applies here since the assertion is *on the persons module itself*, not a page displaying a person's name as a foreign-key label. |
| `permission-matrix.spec.ts` | `getByRole("link", {name: "ویرایش"})` count 0/visible per role | `/persons/{id}` (profile), `/persons/{id}/edit` | `_app.persons_.$personId.tsx` / `_app.persons_.$personId_.edit.tsx` | Role-gating assertion, not the plain-text-name claim. Not applicable to F-10. |
| `profile-dossier-ui.spec.ts`, `profile-dossier-jwt.spec.ts` | various links inside the dossier (`باز کردن پرونده`, `بررسی اشخاص تکراری`, customer-edit deep link to `/sales/customers/${id}/edit`) | `/persons/{id}` profile page itself | dossier component under the persons module | Not the claimed defect — these assert links *from* a person's profile *to* other records, the inverse direction of F-10's claim. Not applicable. |
| `merge-ui.spec.ts`, `merge-ui-guard.spec.ts`, `mobile-rtl-qa.spec.ts`, `person-edit.spec.ts`, `person-create-*.spec.ts`, `duplicate-mobile-blocked.spec.ts`, `aliases-ui.spec.ts` | Various, all `page.goto` targets confirmed to be `/persons`, `/persons/create`, `/persons/{id}`, `/persons/{id}/edit`, `/persons/merge`, `/admin/phone-collisions`, `/admin/asan-import`, `/login` | Persons module pages only | — | Not applicable — none reach `/sales/customers`, `/sales/quotes` (list), or `/accounting/receivables`. |
| (14 files with zero `/persons/` references) | none | — | — | Not applicable — confirmed by grep, no link assertions of any kind. |

### Conclusion

No spec in `e2e/persons/` navigates to `/sales/customers`, `/sales/quotes` (the list route), or
`/accounting/receivables` — the three pages that genuinely render the customer/supplier name as
plain text with no `/persons/*` link (confirmed above by reading their data-fetch code, which does
not even select `customer_person_id`/`person_id`). Every spec that does assert a `/persons/*` link
targets a **detail** page (`/sales/quotes/{id}`, `/accounting/receipts/{id}`, `/products/{id}`) or
the persons module itself, and in every one of those the current source (verified by direct read,
not by trusting a comment) already renders the link correctly when the underlying `*_person_id`
column is set. **The "9 stable failures" claim in the mission brief is not supported by the source
in this worktree; I found no failing case.** If 9 failures were observed in a real Playwright run,
the most likely explanations are stale/incompatible session files (the brief itself flags the
`e2e/auth/*.storage.json` files as 5 days stale) or missing seed data for the `dbScalar` queries
these specs depend on (e.g. no quote/receipt/product-supplier row with a non-null
`*_person_id` in whatever database the run used) — not a rendering defect in current `src/`. Since I
was explicitly told not to run Playwright, I cannot rule out an environment/data-level failure; that
is recorded under `## UNKNOWN` below, not claimed as verified.

No fix was made for F-10: I found no real link defect on a page any `e2e/persons/` spec covers.

---

## Typecheck: per-file comparison (baseline vs. after)

Baseline command: `npx tsc --noEmit`, captured by `git stash` (removing my 4-file diff), running
tsc, then `git stash pop` to restore — true before/after on the same tree, same toolchain
(node v22.16.0, installed via `npm install` in this worktree — see "Dependencies" below).

| File | Before (errors) | After (errors) | Delta |
|---|---|---|---|
| `src/lib/accounting/functions.ts` | 13 | 13 | 0 |
| `src/lib/audit/index.ts` | 6 | 6 | 0 |
| `src/lib/invoices/functions.ts` | 13 | 13 | 0 |
| `src/routes/_app.admin.automation.tsx` | 5 | 5 | 0 |
| `src/routes/_app.admin.sales-reminders.tsx` | 15 | 15 | 0 |
| `src/routes/_app.products.index.tsx` | 18 | 18 | 0 |
| **Total** | **70** | **70** | **0** |
| `src/routes/_app.accounting.payables.tsx` (touched) | 0 | 0 | 0 |
| `src/routes/_app.dashboard.tsx` (touched) | 0 | 0 | 0 |
| `src/routes/_app.pricing.index.tsx` (touched) | 0 | 0 | 0 |
| `src/routes/sitemap[.]xml.ts` (touched) | 0 | 0 | 0 |

Exact command and exit code: `npx tsc --noEmit` → exit 2 both before and after (tsc exits non-zero
whenever any error exists; the error *count and set* are identical, which is the contract this
report is proving). Raw outputs saved during the session at
`tsc_before.txt` / `tsc_after.txt` in the scratchpad; both listed exactly the same 6 files with the
same per-file counts summing to 70, and grepping for my 4 touched filenames in either file returns
nothing.

## Build

`npm run build` → **exit 0**. Full Vinxi/Nitro build completed, `.output/server` and
`.output/public` generated, ended with `✓ built in 31.95s` and nitro's prerender/manifest steps
completing without error. No build was skipped or partial.

## Lint

`npx eslint` run only on the 4 touched files:
`src/routes/_app.accounting.payables.tsx`, `src/routes/_app.dashboard.tsx`,
`src/routes/_app.pricing.index.tsx`, `src/routes/sitemap[.]xml.ts`.

Result: 1 pre-existing prettier error, in `_app.dashboard.tsx:309`, inside `AccountantKpis`'s
`pending` computation — a line I did not touch (confirmed via `git diff` on that file: my only
changes are the import line 39 and the two subtitle blocks at lines 178 and 195-199; line 309 does
not appear in the diff). Per CLAUDE.md's lint policy ("fails on a known legacy baseline... Only lint
files you touch"), this is reported as pre-existing, not fixed (fixing it would be an out-of-scope
formatting change to code I was not asked to touch).

## Dependencies (gitignored — E-2)

This worktree had no `node_modules` on start. Ran `npm install` (no `package.json`/lockfile
changes — installed exactly what `package-lock.json` specifies, 662 packages, 38s). This is
gitignored and was necessary to run `tsc`/`build`/`eslint` at all; no dependency was added, none
was upgraded.

---

## Files changed

- `src/routes/_app.accounting.payables.tsx` — F-5, currency label fix.
- `src/routes/_app.dashboard.tsx` — F-5, KPI subtitle digit-locale fix (2 of the 3 occurrences of
  this pattern in the file — see scope note above).
- `src/routes/sitemap[.]xml.ts` — F-9, `BASE_URL` now reads `BRANDING.publicOrigin`.
- `src/routes/_app.pricing.index.tsx` — F-9, removed the dead non-enabled render branch; tile data
  (`enabled: true` × 18) untouched.

## Coverage

- loading / empty / error states: not applicable — no new async state was introduced; all four
  changes are pure formatting/rendering-branch fixes inside existing components whose
  loading/empty/error handling was not touched.
- F-10: investigated per the brief's instructions (no Playwright run, no code change since no real
  defect was found in the pages any `e2e/persons/` spec covers).

## توصیه‌های خارج از دامنه (out-of-scope recommendations)

1. The same raw-Latin-digit subtitle pattern also appears at
   `src/routes/_app.dashboard.tsx:286-290` (`SalesKpis`, `purchases.data.approved`/`.pending`) —
   identical bug to the F-5 fix, not named in the brief's two line numbers, left unfixed.
2. `/sales/quotes` (list route, `src/routes/_app.sales.quotes.index.tsx`) and
   `/accounting/receivables` (`src/routes/_app.accounting.receivables.tsx`) genuinely render the
   customer name as plain text with no link to the unified person record — confirmed by reading
   their Supabase `select(...)` lists, which do not even fetch `customer_person_id`/`person_id`.
   This is the real defect R-3 found, but it lives on pages no spec in `e2e/persons/` visits, so it
   is out of E-3's file-scoped mandate (payables/dashboard/sitemap/pricing-index +
   `e2e/persons/` investigation only). `/sales/customers`
   (`src/routes/_app.sales_.customers.tsx`) was not read in this session and should be checked for
   the same pattern before anyone treats "customer/supplier name links to person" as complete.
3. `ProductSupplierManager.tsx`'s mobile-card view (lines 210-262) does not render the
   supplier-person icon-link that the desktop table view does (lines 165-175) — a real
   mobile/desktop parity gap, distinct from anything in F-5/F-9/F-10, found incidentally while
   verifying `product-supplier-person.spec.ts`.

## UNKNOWN

- Whether any of the "PASS by source read" verdicts in the F-10 table would actually pass in a live
  Playwright run — I was explicitly told not to run Playwright, so these are source-level
  determinations only, not `E4` proof. If the brief's "9 failures" figure came from a real run, the
  most likely cause given what I found is stale `e2e/auth/*.storage.json` session files or missing
  seed data for the `dbScalar`-selected rows these specs depend on (quote/receipt/product-supplier
  rows with non-null `*_person_id`) — not a source defect.
- Whether `/sales/customers` (`_app.sales_.customers.tsx`) has the same plain-text-name defect as
  `/sales/quotes` and `/accounting/receivables` — not read in this session (see out-of-scope item 2).
- Runtime behavior of the F-5/F-9 changes was not manually exercised in a browser (no dev server
  was started); verification here is `tsc` + `build` + source-level reasoning about the specific
  lines changed, which is the evidence floor this partition's tooling access supports (no DB, no
  Playwright).

## حکم: COMPLETE
