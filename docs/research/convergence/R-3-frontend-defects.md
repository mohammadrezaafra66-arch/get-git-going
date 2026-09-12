# R-3 — Frontend defect verification (against `staging` @ `d60232f5`)

**Verdict:** Of the 9 claimed defects (F-1, F-2, F-3, F-4, F-5, F-6, F-9, F-10 — F-7/F-8 were not in scope), **4 are `NOT-A-DEFECT`** (F-1, F-2, F-3, F-4 were already fixed by prior commits on this same branch), **2 are `CONFIRMED`** (F-5, F-9), **1 is `NOT-A-DEFECT`** as far as static source analysis can show (F-6), and **F-10 could not be confirmed as described** — the specific "customer name → person link" assertions that exist in `e2e/persons/` target pages that already implement the link, but a genuine, untested instance of the same underlying pattern (plain-text customer name, no link) does exist elsewhere. Details and exact evidence below; F-10's true failure count needs an actual test run, which I was not permitted to do.

Method note: I have no database or Playwright access, so every "proving test" status below is read from source (does the file exist, does its assertion match current code) — not from a live run. Where that matters I say so explicitly.

---

## F-1 — NOT-A-DEFECT

**Claim:** dashboard "فروش امروز" tile and 7-day chart read the dropped `invoices` table and swallow the error.

**Current code** (`src/hooks/dashboard/salesSource.ts`, `src/hooks/dashboard/useDashboardStats.ts:87-105`, `src/hooks/dashboard/useDashboardChart.ts:41-60`) reads `sales_quotes`, not `invoices`, and throws on error instead of swallowing it:

```ts
// src/hooks/dashboard/salesSource.ts:176-180
export async function fetchTodaySales(run: QuoteQueryRunner): Promise<TodaySalesStats> {
  const { data, error } = await run();
  if (error) throw quoteQueryError(error);
  return summariseAcceptedQuotes(data ?? []);
}
```

This was fixed in commit `5b4ef360` — `fix(dashboard): «فروش امروز» را از sales_quotes بخوان و خطا را پنهان نکن`.

**CRITICAL SUB-TASK answer — which status set counts as a sale:** `status = 'accepted'`, operationalised via `accepted_at IS NOT NULL` (the query filters on `accepted_at`, not on `status`, because `accepted_at` is set exactly for `status='accepted'` rows). This is stated and measured in `src/hooks/dashboard/salesSource.ts:120-123`:

```ts
// `accepted_at` دقیقاً برای همان ردیف‌هایی پر است که status='accepted' دارند
// (اندازه‌گیری ۱۴۰۵/۰۶/۱۴: ۹ در برابر ۹). این شمارش اگر روزی این دو از هم
// جدا شدند، همچنان راست می‌ماند.
issuedCount: rows.filter((r) => r.status === "accepted").length,
```

**Prior art the fix is consistent with** — `src/routes/_app.reports.tsx:84-104` (the sales report tab, F-2 below) uses the identical definition: `sales_quotes` filtered by `accepted_at` in range. Both were fixed together and share the same "accepted_at defines a sale" rule.

**Proving test:** `e2e/requirements/wave1-a1-sales-today-semantics.spec.ts` exists and asserts both halves — that a query error throws rather than folding into `{count:0}` (line 42-52), and that `accepted_at` and `status='accepted'` select the same row set from live data (line 136-154). I could not execute it (no DB/Playwright access), but its logic matches current source exactly, and `e2e/requirements/wave1-a-schema-references.spec.ts` independently re-derives every table/column this file touches from source and checks it against PostgREST.

**Remaining, not part of F-1's original claim:** `SalesChart.tsx` and `AdminKpis` never render an explicit error state for `isError` — on failure they fall back to `data ?? []` / `data ?? null`, which looks like "no sales" rather than "query failed." This is a real but separate gap from the one F-1 described (which was specifically "reads the dropped table" — that part is fixed). Reporting only, not fixing (out of scope for R-3).

---

## F-2 — NOT-A-DEFECT

**Claim:** sales report tab throws, at `src/routes/_app.reports.tsx:89-95`.

**Current code** (`src/routes/_app.reports.tsx:81-149`) reads `sales_quotes` (not `invoices`), and the `useQuery` wraps the throw so React Query converts it to `isError` — the component never crashes:

```tsx
// src/routes/_app.reports.tsx:95-105
const invoicesQ = useQuery({
  queryKey: ["report-sales-accepted-quotes", range],
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("sales_quotes")
      .select("id, final_amount, status, accepted_at, customer_name, accounting_registered_at")
      .gte("accepted_at", since)
      .order("accepted_at", { ascending: false })
      .limit(200);
    if (error) throw error;
```

All render sites use `invoicesQ.data?.x ?? default` (lines 168, 178, 187, 208, 214, 230, 234), so there is no unguarded access that could throw during render. Fixed in commit `dcd7be05` — `fix(reports): تب «فروش» را از sales_quotes بخوان تا دیگر خطا ندهد`.

**Proving test:** `e2e/requirements/wave1-a-schema-references.spec.ts` includes `src/routes/_app.reports.tsx` in its `FILES` list (line 40) and asserts every `.from()`/`.select()`/filter column it contains resolves against live PostgREST, plus a standing guard that none of the five owned files ever queries `invoices` again (lines 135-146). Not executed by me (no DB access); matches current source.

---

## F-3 — NOT-A-DEFECT

**Claim:** three non-existent columns referenced: `inquiries.customer_name`/`inquiries.product_name`, `product_computed_prices_public.sale_price`, `purchase_prices.effective_from`.

All three call sites (there was exactly one of each in the codebase — confirmed by grepping `customer_name`, `product_name`, `sale_price`, `effective_from` across `src/`) were fixed in commit `989bea01` — `fix(purchase,pricing): سه ارجاع به ستون‌هایی که وجود ندارند اصلاح شد`:

1. `src/components/purchase/PurchaseRequestForm.tsx:99-113` now selects `id, created_at, products!inner(name)` instead of `id, product_name, customer_name, created_at`; the customer name display was removed entirely (no source exists for it — `inquiries`' only FKs are `products`, `messenger_groups`, `users`).
2. `src/routes/_app.pricing.market-intelligence.tsx:254-264` (`HighMarginOpportunitiesCard`) now selects/orders on `rounded_sale_price` instead of `sale_price`.
3. `src/routes/_app.pricing.market-intelligence.tsx:314-331` (`HighRiskProductsCard`) now selects/filters/orders on `effective_at` instead of `effective_from`, with an inline comment: `// ستون effective_from وجود ندارد؛ نامش effective_at است.`

Grep confirms zero remaining code references to any of the three wrong names anywhere in `src/` (only unrelated fields that happen to share the substring "sale_price" — e.g. `product_sale_price_history.new_sale_price`/`old_sale_price`, a real, different table — and unrelated `effective_from` columns on `price_lists` and a credit-rules RPC result, both real columns on different tables).

**Proving test:** `e2e/requirements/wave1-a-schema-references.spec.ts` covers `src/components/purchase/PurchaseRequestForm.tsx` and `src/routes/_app.pricing.market-intelligence.tsx` in its `FILES` list and its own header documents the exact pre-fix PostgREST errors it was written against (`42703` for all three). Not executed by me; matches current source.

---

## F-4 — NOT-A-DEFECT

**Claim:** `profiles.last_seen_at` ~50 days stale because a presence update is `void supabase.from("profiles").update(...)`, never awaited; bug is one line above a previously-applied fix.

**File (discovered):** `src/lib/auth/AuthProvider.tsx:145-186` (the heartbeat effect). It is already fixed — the update is awaited inside an async IIFE, not `void`-discarded:

```ts
// src/lib/auth/AuthProvider.tsx:161-182
const ping = () => {
  void (async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", uid)
        .select("id");
      if (error) {
        console.warn("[presence] last_seen_at heartbeat failed:", error.message);
      } else if (!data || data.length === 0) {
        console.warn(
          "[presence] last_seen_at heartbeat matched 0 rows for user", uid, "...",
        );
      }
    } catch (err) {
      console.warn("[presence] last_seen_at heartbeat threw:", err);
    }
  })();
};
```

"One line above a previously-applied fix" is literal: the comment block directly above (`AuthProvider.tsx:130-139`) says this is "دقیقاً همان نقصی است که B-1 برای log_event در همین فایل رفع کرده بود" (the identical defect B-1 already fixed for `log_event` in this same file) — confirming the `void <lazy PostgrestBuilder>` defect class was already known and fixed once in this file before this second instance was found and fixed too.

Fixed across two commits: `04114101` (`fix(auth): ثبت واقعی last_seen_at با await کردن درخواست heartbeat`) and a follow-up `e4336bf8` (`fix(presence): heartbeat ای که هیچ ردیفی را ننوشته دیگر «موفق» گزارش نمی‌شود (H-11)`) which additionally fixed a second, adjacent bug: a zero-row UPDATE (blocked by a RESTRICTIVE RLS policy for viewer-only accounts) returns `error === null`, so the heartbeat was reporting "success" while writing nothing — now caught by `.select("id")` and a zero-row warning (lines 148-160, 171-177).

**Proving test:** none exists as an automated spec. Both fix commits carry manual E4 evidence in their commit messages (measured on the live LAN DB with a real authenticated session: `void` → 0 PATCH requests / column unchanged at 49-days-stale `2026-07-19`; `await` → 1 PATCH request / column becomes `2026-09-07 08:41:44.989`, matching the request timestamp to 0.77s). To make this a repeatable proof: a network-level Playwright test asserting `page.waitForRequest(/\/rest\/v1\/profiles.*PATCH/)` fires within 65s of a login, or a DB probe comparing `profiles.last_seen_at` before/after a session heartbeat interval, would close this gap. Neither exists today.

---

## F-5 — CONFIRMED

**Claim:** payables amount cells render Latin "toman"; dashboard tiles mix a Persian value with a Latin sub-line.

### 5a. Payables — real, unfixed

`src/routes/_app.accounting.payables.tsx:122-126`:

```ts
const NA = "نامشخص";

function fmtMoney(n: number | null | undefined, currency?: string | null) {
  if (n == null) return NA;
  const cur = currency || "تومان";
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} ${cur}`;
}
```

`currency` here is `purchases.currency` (or the `get_payables_list`/`get_payable_detail`/`vw_supplier_payables` pass-through of it — confirmed in `supabase/migrations/20260906160000_478_partial_purchase_payment.sql:196-241`, where `p.currency` flows straight through with no translation), which is the internal enum code `'toman' | 'usd' | 'aed' | 'usd_us'` (confirmed by `src/shared/components/PurchaseForm.tsx:66,92`, the form that writes it: `currency: z.enum(["toman", "usd", "aed", "usd_us"])`, default `"toman"`). `fmtMoney`'s fallback `currency || "تومان"` only substitutes Persian when `currency` is falsy — a real, present `"toman"` string passes straight through and prints literally. Call sites: `payables.tsx:510-513, 578, 583, 695-707, 736-741`. Line 703 is worse — it renders the raw code with no formatting at all: `{head.currency || NA}`.

**Causal chain:** `purchases.currency` stores the Latin enum code → `get_payables_list`/`get_payable_detail` pass it through unchanged → `fmtMoney`'s only translation is a falsy-fallback to "تومان", which never fires for a real `"toman"` value → the cell renders `"۱۲۳٬۴۵۶٬۷۸۹ toman"`, Persian digits next to a Latin unit.

**Why it bypasses the existing formatter:** the codebase already has a canonical currency-code → Persian-label map, `CURRENCY_LABELS` in `src/lib/pricing/constants.ts:7-12` (`{ toman: "تومان", usd: "دلار سلیمانیه", aed: "درهم امارات", usd_us: "دلار تهران" }`), used consistently across ~15 pricing/purchase routes (`purchase-prices.tsx`, `currency-rates.tsx`, `calculator.tsx`, `quick-price.tsx`, `my-workbench.tsx`, `PurchaseForm.tsx`, etc.). `payables.tsx` never imports it — it hand-rolls its own `fmtMoney` instead. (There is also a second, thinner helper, `formatCurrency` in `src/lib/i18n/formatters.ts:12-15`, which `payables.tsx` already imports `toFaDigits`/`formatDateFa` from — but that helper has the identical bug: it interpolates whatever `currency` string it's given, with no code→label translation either.)

**Exact fix:** in `payables.tsx`, import `CURRENCY_LABELS` from `@/lib/pricing/constants` and change `fmtMoney` to `const cur = currency ? (CURRENCY_LABELS[currency as CurrencyCode] ?? currency) : "تومان";`, and fix line 703's bare `{head.currency || NA}` the same way.

### 5b. Dashboard tiles — real, unfixed

`src/routes/_app.dashboard.tsx:172-201` (`AdminKpis`):

```tsx
<KpiCard
  title="فروش امروز"
  ...
  value={sales.data?.count ?? null}
  subtitle={sales.data ? `${sales.data.issuedCount} فاکتور صادرشده` : undefined}
  ...
/>
...
<KpiCard
  title="درخواست خرید"
  ...
  value={purchases.data?.total ?? null}
  subtitle={
    purchases.data
      ? `${purchases.data.approved} تأیید · ${purchases.data.pending} در انتظار`
      : undefined
  }
  ...
/>
```

`src/components/dashboard/KpiCard.tsx:38-43`:

```tsx
let display: string;
if (loading) display = "…";
else if (value === null || value === undefined) display = "—";
else if (typeof value === "number") display = formatter ? formatter(value) : toPersianDigits(value);
else display = value;
```

**Causal chain:** `KpiCard`'s main `value` prop is always run through `toPersianDigits` (or a custom `formatter`) before rendering — Persian digits guaranteed. `subtitle`, by contrast, is a plain pre-built string handed in by the caller; `_app.dashboard.tsx:178` and `:197` build it with a raw template literal (`` `${sales.data.issuedCount} فاکتور صادرشده` ``), so `issuedCount`/`approved`/`pending` render in Latin digits. `KpiCard.tsx:58` renders `subtitle` verbatim with no digit conversion. Result: the exact symptom quoted in the mission — value line in Persian digits, subtitle line in Latin digits, on the same card.

**Exact fix:** either (a) wrap each numeric interpolation in `subtitle` with `toPersianDigits(...)` at the two call sites (`_app.dashboard.tsx:178`, `:197`), or (b) change `KpiCard`'s `subtitle` prop to accept `(string | number)[]` segments and run numbers through `toPersianDigits` internally, which would prevent every future caller from reintroducing the same bug. (b) is the more root-cause fix since the bypass is systemic to the prop's contract, not just these two call sites.

**Proving test:** none exists (checked `e2e/` broadly for "toman", "payables", "fmtMoney", "subtitle" — no spec targets either symptom). Would need a new Playwright test: navigate to `/accounting/payables` with a `toman`-currency purchase, assert the amount cell's text does **not** match `/[a-zA-Z]/` (or does contain `تومان`); and navigate to `/dashboard` as admin, read the «فروش امروز» KPI card's subtitle text, and assert it contains no ASCII digits (`/[0-9]/`).

---

## F-6 — NOT-A-DEFECT (as far as source analysis can show)

**Claim:** `/api/healthz` `whatsapp` check returns `down / TypeError` since `d60232f5`; previously returned `not_configured`.

**File:** `src/routes/api.healthz.ts`. Its only change at `d60232f5`'s history (commit `dfcd581e`) touched the **database** probe (`shop_settings` → `currencies`, to dodge migration 477's anon-grant revocation) — confirmed via `git show dfcd581e -- src/routes/api.healthz.ts`. The `whatsapp` probe function was not touched by that commit or any commit after `cb9eb2b1` (which introduced the real healthz in the first place).

```ts
// src/routes/api.healthz.ts:104-120
async function checkWhatsappBridge(): Promise<Probe> {
  const started = Date.now();
  const base = process.env.WHATSAPP_PLATFORM_BASE_URL;
  if (!base) return { state: "not_configured", ms: 0 };
  try {
    const res = await timedFetch(base.replace(/\/+$/, "") + "/", BRIDGE_TIMEOUT_MS);
    return { state: "up", ms: Date.now() - started, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      state: "down",
      ms: Date.now() - started,
      detail: err instanceof Error ? err.name : "fetch failed",
    };
  }
}
```

**Causal chain, as far as it can be read from source:** `not_configured` is returned only when `WHATSAPP_PLATFORM_BASE_URL` is unset. If it **is** set (in the deployed LAN container it defaults to `http://192.168.170.8:8002` per `deploy/lan/docker-compose.yml:62`) but the fetch fails — malformed URL (missing scheme), DNS failure, connection refused, or the 1500ms timeout firing — `err.name` becomes the detail string, and `TypeError` is exactly what `fetch()`/`undici` throw for a malformed URL or certain network failures. So "down / TypeError" is not a code defect — it is the intended, documented behavior for "the bridge is configured but currently unreachable," and per the file's own design comment (lines 15-18), this state is deliberately **soft**: it never flips the HTTP status away from 200 (`degraded`, not `unhealthy` — see line 130-131), so it cannot restart the container. That the *previous* observation was `not_configured` and the *current* one is `down/TypeError` most plausibly reflects an environment/config change (the env var going from unset to set-but-unreachable, or the bridge itself being down) rather than a regression in this file, which I cannot verify without reading `deploy/lan/.env.lan` (out of scope — real environment file) or making a live request (forbidden by this mission's constraints).

**What would settle it:** `curl http://192.168.170.8:3100/api/healthz | jq .checks.whatsapp` on the test server, plus checking whether `WHATSAPP_PLATFORM_BASE_URL` in the running container's env actually resolves (`docker exec afrakala-lan-web env | grep WHATSAPP`) and whether the AfraPayam bridge process at that address is actually up. None of that is available to a read-only, no-network mission.

**Proving test:** none exists in `e2e/` for the whatsapp sub-probe specifically (only `e2e/security/h3-healthz-probes-a-keep-open-table.spec.ts`, which covers the database probe's table choice, not the whatsapp branch).

---

## F-9 — CONFIRMED (both halves)

### 9a. Hardcoded wrong domain

`src/routes/sitemap[.]xml.ts:4`:

```ts
const BASE_URL = "https://get-git-going.lovable.app";
```

used at line 25: `` `    <loc>${BASE_URL}${e.path}</loc>` ``. This is a leftover Lovable preview/template domain, not AfraKala's real domain — and the codebase already has a canonical origin for exactly this purpose: `src/config/branding.ts:19`, `publicOrigin: "https://myafrakala.ir"`, part of `BRANDING`, whose own file header says "Do not hardcode myafrakala.ir elsewhere except: this file, tests asserting the exact value, static public/manifest.webmanifest." `sitemap.xml.ts` violates that by hardcoding a *different*, wrong domain instead of importing the canonical one.

**Causal chain:** the sitemap route was scaffolded (likely by the original Lovable-generated project) with a placeholder `BASE_URL` that was never wired to the real domain once branding was centralized (commit `6e0201bd`, `feat(branding): centralize platform name as myafrakala.ir`) — that commit did not touch this file.

**Exact fix:** `import { BRANDING } from "@/config/branding";` and replace the constant with `const BASE_URL = BRANDING.publicOrigin;`.

**Proving test:** none exists (`e2e/` has no spec matching "sitemap" or "get-git-going"). Would need: `GET /sitemap.xml` and assert every `<loc>` starts with `https://myafrakala.ir`.

### 9b. Dead "به‌زودی" branch

`src/routes/_app.pricing.index.tsx:277-283`:

```tsx
{t.enabled ? (
  <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
) : (
  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
    به‌زودی
  </span>
)}
```

**Causal chain:** the `tiles` array (`_app.pricing.index.tsx:102` onward, 18 entries) sets `enabled: true` on literally every tile (confirmed: `grep -c "enabled:" = 18`, `grep -c "enabled: true" = 18`, zero `enabled: false`). `t.enabled` is therefore always truthy for every tile that ever renders, so the `:` branch of the ternary — the "به‌زودی" badge and the corresponding non-`<Link>` render path a few lines below (line ~294) — is unreachable dead code, not a functional bug (nothing breaks), but genuine tech-debt/dead-code exactly as claimed.

**Exact fix:** either remove the dead branch (collapse to always rendering the `<ArrowLeft>` + always wrapping in `<Link>`, since no tile is ever disabled today), or — if some pricing sub-features are genuinely not production-ready — actually set `enabled: false` on those specific tiles so the branch becomes reachable and meaningful. Which of the two is correct is a product decision outside R-3's read-only scope; reporting only.

**Proving test:** none exists. A DOM-diff/grep-based test asserting `tiles.every(t => t.enabled)` (i.e., pinning that the branch is currently dead, the way `wave1-a-schema-references.spec.ts` pins invariants elsewhere in this codebase) would prove it; alternatively, once the fix decision is made, a test asserting the "به‌زودی" text is either never present (if removed) or present only for specific named tiles (if made real).

---

## F-10 — COULD NOT CONFIRM AS DESCRIBED

**Claim:** `e2e/persons/` has 9 stable failures, all "the spec expects the customer name to be a link to `/persons/<id>`, the UI renders plain text."

I have no Playwright access, so I cannot produce the actual list of 9 failing assertions or their pass/fail status — this section is built entirely from reading every `e2e/persons/*.spec.ts` file that references a person-link and the routes they target. That reading **contradicts** a literal version of the claim, while confirming the underlying UI pattern is real elsewhere:

**Every existing "customer name → person link" assertion in `e2e/persons/` currently targets a page that already implements the link:**

| Spec (file:line) | Target route | Component that renders the link | Status |
|---|---|---|---|
| `quote-customer-link.spec.ts:38-40` | `/sales/quotes/{id}` (detail) | `src/routes/_app.sales.quotes.$quoteId.tsx:262-272` — `quote.customer_person_id ? <Link to="/persons/$personId/edit">{customer_name}</Link> : customer_name` | Link exists — assertion should pass |
| `quote-customer-link.spec.ts:52-69` (no-person case) | same | same ternary, `: quote.customer_name` (plain) when `customer_person_id` is null | Should pass — asserts *no* link, and there is none |
| `quote-list-link.spec.ts:33-50` | `/sales/quotes` → click into detail | same detail-page ternary as above | Link exists — should pass |
| `receipt-person-link.spec.ts:11-33` | `/accounting/receipts/{id}` (detail) | `src/routes/_app.accounting.receipts.$receiptId.tsx:662-666` — same ternary pattern | Link exists — should pass |
| `product-supplier-person.spec.ts:9-36` | `/products/{id}` | `src/shared/components/ProductSupplierManager.tsx:165-175` — icon-link, `r.supplier_person_id && <Link to="/persons/$personId/edit">` | Link exists — should pass |

That is 5 assertions across 4 files that check exactly this pattern, and by reading the target components, all 5 should currently be green, not red.

**A genuine, matching instance of the claimed defect does exist — but in list pages that no `e2e/persons/` spec currently touches:**

- `src/routes/_app.sales_.customers.tsx:280` — the `/sales/customers` list: `<TableCell className="font-medium">{c.name}</TableCell>`, plain text, and the query backing this table does not even select a `person_id`/`customer_person_id` column to link with.
- `src/routes/_app.sales.quotes.index.tsx:558` and `:604` — the `/sales/quotes` **list** (as opposed to its detail page, which does link): `<div className="font-medium">{row.customer_name}</div>`, plain text; the quote *number* two lines above is a `<Link>` (line 549-555), the customer name next to it is not.
- `src/routes/_app.accounting.receivables.tsx:578, 638, 756` — `{r.customer_name || NA}` and `{head.customer_name || NA}`, plain text, no person link, same pattern as payables' `fmtMoney` in F-5.

None of these three files is imported or navigated to by any spec under `e2e/persons/` (checked: no `.goto("/sales/customers")` with a link assertion, no `.goto("/sales/quotes")` list-row assertion, no receivables spec in that directory at all — `og91-receivables-real-due-date.spec.ts` lives under `e2e/security/`, not `e2e/persons/`, and doesn't test this).

**Conclusion:** either (a) the "9 stable failures" are a different, not-yet-located set of assertions I could not find by reading every file in the directory (all 32 files in `e2e/persons/` were enumerated and the 11 that reference `/persons/` links or person-linking were read in full), or (b) the claim's directory/count is imprecise and the real defect is the customers-list / quotes-list / receivables plain-text pattern above, which is real but untested. I could not resolve which without running the suite.

**What would settle it:** `npx playwright test e2e/persons --reporter=line` (forbidden to me — "NO Playwright" is an explicit hard constraint of this mission) would produce the actual 9 failure names and let them be matched against source directly.

---

## UNKNOWN

1. **F-6's actual live behavior.** Whether `/api/healthz`'s `whatsapp` check currently returns `down`/`TypeError` on the test server is unverifiable from source alone — it depends on `WHATSAPP_PLATFORM_BASE_URL` in the running container's environment and whether the AfraPayam bridge process is actually reachable at that address. Settle with `docker exec afrakala-lan-web env | grep WHATSAPP_PLATFORM_BASE_URL` and `curl -s http://192.168.170.8:3100/api/healthz | jq .checks.whatsapp` on the test server (both forbidden to this read-only mission).

2. **F-10's real 9 failures.** See above — needs `npx playwright test e2e/persons --reporter=line` on the test server to get actual failure output; I could not run it.

3. **Whether `SalesChart.tsx`/`AdminKpis` should surface `isError`** (noted under F-1 as a related-but-separate gap from the original claim) — this is a judgment call about UX for a query failure state, not verified against any spec; flagging for the mission owner rather than claiming it as one of the 9 numbered defects.

4. **F-9b's product decision** (remove the dead branch vs. make it real by actually disabling some pricing tiles) is a product call outside a research mission's authority — reported, not resolved.
