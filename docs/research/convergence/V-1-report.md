# V-1 — independent verification of the convergence release

**Verifier:** V-1 (independent; author of none of the artifacts below).
**Worktree read:** `D:\AfraKalaTest\wt-conv-int`, branch `feature/conv-integration`.
**Database used:** `prod_rehearsal_v1` only (plus rolled-back read transactions against `afrakala`).
**Harness NOT used:** no Playwright, no e2e spec, no browser. That partition belongs to another verifier.

---

## Restore identity

```
$ docker exec afrakala-lan-db sh -c 'ls -la /tmp/prod13.dump && md5sum /tmp/prod13.dump'
-rw-r--r-- 1 root root 35424962 Sep 12 14:11 /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump
```

Restore command (exactly the form in the brief):

```
$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -q -U supabase_admin -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='prod_rehearsal_v1';" \
    -c "DROP DATABASE IF EXISTS prod_rehearsal_v1;" -c "CREATE DATABASE prod_rehearsal_v1 OWNER supabase_admin;"'
NOTICE:  database "prod_rehearsal_v1" does not exist, skipping
=== CREATE exit: 0 ===

$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U supabase_admin \
    -d prod_rehearsal_v1 --no-owner --disable-triggers /tmp/prod13.dump'
=== pg_restore exit: 1 ===
```

### pg_restore error count and classes — 21 errors, all expected

```
$ grep -c "^pg_restore: error" restore.err
21
```

| class | count |
|---|---|
| `schema "cron" does not exist` | 17 |
| `can only create extension in database postgres` | 1 |
| `extension "pg_cron" does not exist` | 1 |
| vault "already exists" (`secrets_encrypt_secret_secret`, `decrypted_secrets`) | 2 |
| **anything else** | **0** |
| **data-load (COPY/`TABLE DATA`) errors** | **0** |

`pg_restore: warning: errors ignored on restore: 21` — matches. **No finding here.** The brief said "about twenty"; the exact figure is 21.

### Restored state

```
$ docker exec afrakala-lan-db psql -U postgres -d prod_rehearsal_v1 -At \
    -c "SELECT count(*) FROM supabase_migrations.schema_migrations;" \
    -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;" \
    -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
681
20260912150000
20260912143000
20260912140000
20260908120000
20260908034500
227
```

- **Ledger rows: 681. Top version: `20260912150000` (migration 525).**
- 227 tables in `public`; 859 routines in `public`; 24 views; 667 policies.
- On disk the branch carries **702** migration files, so the ledger is 21 rows short of disk even before this release. That gap is pre-existing and outside my five rows; I note it because `og81-migration-ledger-matches-disk` is asserted elsewhere. **NOT INVESTIGATED by me.**

---

## Row 1 — migration 526 is idempotent — **GREEN**

**Requirement in my words:** applying `20260913090000_526_catalogue_repair_absent_migration_effects.sql` twice must leave the database byte-identical to applying it once; on a database that already holds the state it asserts it must do nothing at all; and it must not write to `supabase_migrations.schema_migrations`.

### What the file actually targets (derived from the file, not from its header)

Nine objects, in three catalogue dimensions:

| # | object | dimension it changes |
|---|---|---|
| 386a | view `product_computed_prices_public` | `reloptions` (`security_invoker`) |
| 386b | view `v_promotion_suggestions` | `reloptions` **and** view definition |
| 386c | view `vw_account_balances` | view definition |
| 394 | `create_purchase(15-arg)` | function body |
| 396a | `get_payables_list(8-arg)` | function body |
| 396b | `upsert_staff_daily_performance_metric(8-arg)` | function body |
| 396c | policies `sdpm_insert_privileged`, `sdpm_update_privileged` | `polqual` / `polwithcheck` |
| 404 | `asan_list_bank_deposit_export(date,date)` | **DROP + CREATE** — return type, `proargnames`, **and the ACL** |
| 409 | `expire_stale_credit_holds(integer)` | **DROP** — removes a signature |

I captured all nine plus four whole-schema fingerprints (all 859 public routine definitions+ACLs, all public relation ACLs, all 667 policies, all 24 view definitions+reloptions) so a change *outside* the nine would also show up.

### No ledger write — confirmed

Grep for `schema_migrations`, `DELETE`, `TRUNCATE`, `INSERT INTO supabase_migrations` returned only two lines:

```
554:      DELETE FROM public.purchase_idempotency WHERE idempotency_key = p_idempotency_key;
1233:    CROSS JOIN unnest(ARRAY[...,'DELETE',...,'TRUNCATE']) p
```

Zero occurrences of `schema_migrations`. The only DELETE (line 554) is **inside the create_purchase function body** — it targets `public.purchase_idempotency` and executes when the RPC is called, never at apply time. Line 1233 is a string literal array inside the gate. **Zero executable write to the ledger. Requirement met.**

Also checked, because it is the 527/528 defect class: `grep -n "current_database" 526.sql` exited 1 with no match. No database-name guard in 526 either.

### Transport integrity

```
$ md5sum supabase/migrations/20260913090000_526_catalogue_repair_absent_migration_effects.sql
183ee118db0d929d7292e876cb0249a2
$ docker exec afrakala-lan-db md5sum /tmp/v1.sql
183ee118db0d929d7292e876cb0249a2   <-- identical
```

### Pass 1 on production shape — all nine fired

Command: `psql --no-psqlrc -U supabase_admin -d prod_rehearsal_v1 -v ON_ERROR_STOP=1 --single-transaction -f /tmp/v1.sql`, **exit 0**. Output:

```
NOTICE:  526: precondition OK -- all nine target objects exist
ALTER VIEW      526: [386a] set security_invoker=true on product_computed_prices_public (was unset)
CREATE VIEW     526: [386b] redefined v_promotion_suggestions -- restored security_invoker=true and the uid() IS NOT NULL guard
CREATE VIEW     526: [386c] redefined vw_account_balances -- restored the uid() IS NOT NULL guard
CREATE FUNCTION 526: [394] redefined create_purchase -- restored the tehran_today() future-date comparison
CREATE FUNCTION 526: [396a] redefined get_payables_list -- restored the tehran_today() due-date comparison
CREATE FUNCTION 526: [396b] redefined upsert_staff_daily_performance_metric -- restored the tehran_today() comparisons
ALTER POLICY x2 526: [396c] restored tehran_today() on sdpm_insert_privileged / sdpm_update_privileged
DROP+CREATE FN  526: [404] dropped and redefined asan_list_bank_deposit_export -- restored the payment-vouchers branch and the direction column
NOTICE:  526: [409 precheck] no other function in public source-references expire_stale_credit_holds(...)
DROP FUNCTION   526: [409] dropped the stale expire_stale_credit_holds(integer) overload
NOTICE:  526 OK: all five migrations asserted end states (386/394/396/404/409) are present in the catalogue.
```

So the finding 526 exists to repair **is real on production shape** — every one of the nine branches was in the wrong state before. Measured before/after deltas:

- `product_computed_prices_public.reloptions`: `(null)` to `security_invoker=true`
- `v_promotion_suggestions.reloptions`: `(null)` to `security_invoker=true`; viewdef md5 `d2850fc2...` (6417 B) to `b399a86d...` (6443 B)
- `vw_account_balances` viewdef md5 `26957a64...` (1803 B) to `52380df5...` (1829 B)
- `sdpm_insert_privileged` WITH CHECK: `CURRENT_DATE` to `tehran_today()` (same for `sdpm_update_privileged`, USING and WITH CHECK)
- `asan_list_bank_deposit_export` gained the `direction` OUT column (proargnames tail `...blocked_reason` to `...blocked_reason,direction`)
- `expire_stale_credit_holds(integer)` removed; public routine count 859 to 858

**One privilege change worth naming explicitly** (it is a removal, and it is intentional):

```
before: asan_list_bank_deposit_export acl={supabase_admin=X,postgres=X,anon=X,authenticated=X,service_role=X}
after : asan_list_bank_deposit_export acl={postgres=X,supabase_admin=X,authenticated=X,service_role=X}
```

`anon` lost EXECUTE because the DROP discarded the ACL and the schema default no longer grants `anon`. I checked this is what the original asserts, not a side effect nobody intended — `supabase/migrations/20260827060000_404_bank_export_reads_payments_with_direction.sql` lines 34-36 say so verbatim. Same for the dropped `expire_stale_credit_holds(integer)`, which also carried `anon=X`. `authenticated` and `service_role` kept EXECUTE on the survivor. The whole-schema relation-ACL fingerprint was **unchanged** (`a024c5d2204ce6a7a114173e104596c9` before and after), so no table or view grant moved.

### Pass 2 — the proof

Same command, same database, second application. **exit 0**:

```
526: [386a] product_computed_prices_public already carries security_invoker=true -- no-op
526: [386b] v_promotion_suggestions already correct -- no-op
526: [386c] vw_account_balances already correct -- no-op
526: [394] create_purchase already compares against tehran_today() -- no-op
526: [396a] get_payables_list already uses tehran_today() -- no-op
526: [396b] upsert_staff_daily_performance_metric already uses tehran_today() -- no-op
526: [396c] sdpm_insert_privileged / sdpm_update_privileged already use tehran_today() -- no-op
526: [404] asan_list_bank_deposit_export already has the payment-vouchers branch -- no-op
526: [409] expire_stale_credit_holds(integer) already absent -- no-op
NOTICE:  526 OK: ...
```

```
$ diff s526_after1.txt s526_after2.txt
diff exit = 0        <-- EMPTY. Nothing changed on the second pass.
```

**This is the evidence the brief asked for: the diff between the two after-states, not the absence of an error.** All nine object fingerprints, all four whole-schema fingerprints, and the ledger row count are byte-identical.

### Test shape — no-op on the FIRST pass

Run against `afrakala` wrapped in `BEGIN; ... ROLLBACK;` (md5 of the wrapped file verified on both sides: `23536de4347b51b117d39ad908cd5ed2`), **exit 0**:

```
BEGIN
NOTICE:  526: precondition OK -- all nine target objects exist
526: [386a] ... already carries security_invoker=true -- no-op
526: [386b] ... already correct -- no-op
526: [386c] ... already correct -- no-op
526: [394]  ... already compares against tehran_today() -- no-op
526: [396a] ... already uses tehran_today() -- no-op
526: [396b] ... already uses tehran_today() -- no-op
526: [396c] ... already use tehran_today() -- no-op
526: [404]  ... already has the payment-vouchers branch -- no-op
526: [409]  ... already absent -- no-op
NOTICE:  526 OK: ...
ROLLBACK
```

All nine branches no-op on the **first** pass there, and the unconditional final gate still passed — so the gate is satisfied by test shape existing state, not by 526 own writes.

I then re-snapshotted `afrakala` and diffed against the pre-run snapshot to prove nothing was written:

```
$ diff ak_before.txt ak_after.txt
diff exit = 0
```

**Nothing was written to `afrakala`.**

### Falsification attempts

| attempt | result |
|---|---|
| Is idempotency really all-or-nothing (does pass 2 short-circuit on a single flag)? Reverted **one** of the nine (`ALTER VIEW product_computed_prices_public RESET (security_invoker)`) and re-applied. | Only `[386a]` fired; the other eight reported no-op; resulting snapshot **byte-identical to after2** (`diff` exit 0). Each check is independently live. |
| Does the DROP+CREATE in 404 leak or re-grant a privilege on re-apply? | On pass 2 `need_404` is false, so no DROP occurs and the ACL is untouched — verified in the empty diff. |
| Does the file write its own ledger row (the 535/536 defect class its own header warns about)? | grep shows zero `schema_migrations` references; ledger row count 681 before and after both passes. |
| Does it change anything outside the nine targets? | Whole-schema relation-ACL fingerprint unchanged across all passes; function/policy/view fingerprints changed on pass 1 only, and the pass-1 deltas account for exactly the nine objects. |
| Does it carry a `current_database()` guard (the 527/528 defect)? | `grep -n current_database` exit 1, no match. |

### Verdict — **GREEN**

526 is idempotent on production shape (empty after-1 vs after-2 diff), a complete first-pass no-op on test shape, correctly partial when only part of the state is missing, and writes nothing to the ledger.

---

## Row 2 — G-4, Persian digits — **(a) GREEN / (b) RED**

**Requirement in my words:** in a Persian RTL interface, a number rendered into a Persian string must appear in Persian digits (۰-۹), not Latin ones.

### The digit-localisation helpers this project has (established by reading each body, not by name)

| helper | file:line | localises? |
|---|---|---|
| `toFaDigits` | `src/lib/i18n/formatters.ts:3` | yes — maps `[0-9]` to `FA_DIGITS` |
| `formatNumber` | `src/lib/i18n/formatters.ts:7` | yes — `toFaDigits(n.toLocaleString("en-US"))` |
| `formatCurrency` / `formatDateFa` / `formatDateTimeFa` | `src/lib/i18n/formatters.ts:12,17,31` | yes |
| `toPersianDigits` | `src/lib/dashboard/utils.ts:5` | yes |
| `formatTomanFa` | `src/lib/dashboard/utils.ts:10` | yes |
| `toPersianDigits` | `src/lib/documents/labels.ts:43`, `src/lib/penalties/labels.ts:44` | yes (two more copies) |
| `.toLocaleString("fa-IR")` | idiom in ~12 files | yes (fa-IR default numbering system is `arabext`) |
| **`fmt`** | **`src/lib/pricing/engine.ts:59`** | **NO — `n.toLocaleString("en-US")`** |

### (a) src/routes/_app.dashboard.tsx — GREEN

The file has exactly four template interpolations. I read all 343 lines; all four are localised, and the near-identical KPI subtitle string appears twice (lines 199 and 290), localised in both places:

```
70:  toast.success(`${created.toLocaleString("fa-IR")} نوتیفیکیشن تولد ایجاد شد`);
179: `${toPersianDigits(sales.data.issuedCount)} فاکتور صادرشده`
199: `${toPersianDigits(purchases.data.approved)} تأیید · ${toPersianDigits(purchases.data.pending)} در انتظار`
290: `${toPersianDigits(purchases.data.approved)} تأیید · ${toPersianDigits(purchases.data.pending)} در انتظار`
```

No Persian template string in this file interpolates a raw number. **Requirement met for this file.** Line 70 uses a different idiom from 179/199/290; both are correct, so that is style, not a defect.

### (b) Repository sweep — RED

**Method (E3):** a Node scanner over every `.ts/.tsx/.js/.jsx` under `src/`, with brace-aware template-literal extraction. It keeps only template literals whose literal part contains a Persian codepoint, pulls out each `${...}` expression, drops the ones containing a known localiser, and keeps the numeric-looking remainder. Pass 1 (short localiser list): 141 candidates. After I read the body of every helper the candidates went through, pass 2: **52 candidates**, triaged by hand below.

`src/routes/_app.dashboard.tsx` appears in **neither** pass — independent confirmation of (a).

#### The systemic one

**`src/lib/pricing/engine.ts:59`**

```ts
const fmt = (n: number) => n.toLocaleString("en-US");
```

Its name looks exactly like the helpers that do localise, and it formats every number in the pricing breakdown, which is Persian prose shown to the user:

```
269:  `قیمت خرید ورودی: ${fmt(input_purchase_price)} ${purchase.currency}`
272:  `نرخ ارز: ${fmt(currency_rate)} → قیمت خرید تومانی: ${fmt(purchase_price_toman)} تومان`
275:  `هزینه حمل (${sRule.title}) — ${fmt(Number(sRule.cost_value))} ${sRule.cost_currency} × نرخ ${fmt(shipping_currency_rate ?? 0)} = ${fmt(shipping_cost)} تومان`
276:  `هزینه حمل (${sRule.title}): ${fmt(shipping_cost)} تومان`
279:  `سود (مبلغ ثابت): ${fmt(margin_amount)} تومان`
281:  `سود (%${margin_value}): ${fmt(margin_amount)} تومان`          <-- margin_value raw as well
282:  `سود (ترکیبی %${margin_value} + ${fmt(fixed_margin_value ?? 0)}): ${fmt(margin_amount)} تومان`
283:  `قیمت نهایی: ${fmt(final_sale_price)} → گرد شده: ${fmt(rounded_sale_price)} تومان`
```

I traced it to the screen instead of assuming: `engine.ts:308` puts the array on `breakdown.steps`, and `breakdown.steps.map(...)` renders at **`src/routes/_app.pricing.calculator.tsx:461`** and **`src/routes/_app.pricing.quick-price.tsx:411`**. Fourteen interpolations, eight Persian lines, two live routes, one line to fix.

#### The full list (template literals) — file:line and what is interpolated

| file:line | unlocalised expression |
|---|---|
| `src/lib/pricing/engine.ts:269,272,275,276,279,281,282,283` | `fmt(...)` x12 plus raw `${margin_value}` x2 — root cause `engine.ts:59` |
| `src/components/pricing/EffectiveCurrenciesPanel.tsx:85` | `results.filter((r) => !r.error).length` |
| `src/components/purchase/PurchaseReceiptUploader.tsx:89` | `${percent}` in `در حال آپلود… ٪${percent}` |
| `src/lib/accounting/functions.ts:99` | `data.amount`, `invoice.total` |
| `src/lib/accounting/receipt-ocr-structured.ts:352` | `amountDigitCount`, `String(Math.trunc(amount ?? 0)).length` |
| `src/lib/accounting/receipt-ocr-structured.ts:485` | `s.amount` |
| `src/lib/sales/quotes.ts:123,134,140,146,152,158` | `idx + 1` in `آیتم ${idx + 1}: …` (6 sites) |
| `src/routes/_app.admin.ai-providers.tsx:290` | `r.models.length`, `known.length` |
| `src/routes/_app.admin.ai-providers.tsx:291` | `r.models.length` |
| `src/routes/_app.admin.phone-collisions.tsx:152` | `pending.length` |
| `src/routes/_app.knowledge_.$documentId.tsx:127` | `doc.version` in `نسخه ${doc.version} • …` |
| `src/routes/_app.notifications.tsx:33,34,35` | `Math.floor(diff / 60 | 3600 | 86400)` |
| `src/routes/_app.operations.didar.tsx:229` | `total` |
| `src/routes/_app.popup-center.tsx:10,11,12` | `Math.floor(diff / 60 | 3600 | 86400)` |
| `src/routes/_app.pricing.market-rates-workshop.tsx:506` | `Number(t.change_percent).toFixed(2)` |
| `src/routes/_app.pricing.sale-lists_.$listId.tsx:874` | `discountSelectedIds.length`, `pdfMissing`, `baseMissing` |
| `src/routes/_app.sales.quotes.$quoteId.tsx:642` | `rows` |
| `src/routes/_app.users.tsx:279` | `data.count` |
| `src/shared/components/NotificationBell.tsx:29,30,32` | `Math.floor(diff / 60 | 3600 | 86400)` |
| `src/shared/components/OwnerRemindersListener.tsx:103` | `r.usd_drift_pct?.toFixed(1)`, `USD_DRIFT_THRESHOLD_PCT` |
| `src/shared/components/QuizForm.tsx:165,175` | `oIdx + 1` in `گزینه ${oIdx + 1}` |

**About 45 unlocalised interpolations across 21 files.** The three `… پیش` relative-time blocks (`NotificationBell.tsx`, `_app.notifications.tsx`, `_app.popup-center.tsx`) are three copies of the same nine lines; one shared helper fixes all three.

#### Candidates I examined and rejected, with the reason

| site | why it is not a defect |
|---|---|
| `components/persons/PersonCollisionPanel.tsx:172`, `PersonDeepLinks.tsx:273` | `formatDateTimeFa(...)` uses `Intl.DateTimeFormat("fa-IR-u-ca-persian")` — already Persian |
| `routes/_app.accounting.dynamic-capital.tsx:816` | `fmtMoney` at line 78 is `toFaDigits(...)` |
| `routes/_app.marketing.suggestions.tsx:307` | local `fmt` at line 72 is `toLocaleString("fa-IR", …)` |
| `components/pricing/price-history/ProductPriceChart.tsx:276,321` | `fmtY` at line 154 is `toFaDigits(...)` |
| `routes/_app.operations.tasks.tsx` | local `formatNumber` at line 127 is `toLocaleString("fa-IR")` |
| `lib/pdf/sale-list-pdf.ts:439` | `baseFont + 1`, `Math.max(9, baseFont - 2)` are CSS px values inside a `<style>` block; no human reads them |
| `routes/_app.accounting.bank-accounts.tsx:343,361`, `routes/_app.pricing.my-workbench.tsx:284` | `row.title` / `row.name` are strings, not numbers — my heuristic matched the identifier name |
| `routes/_app.admin.call-extensions.tsx:284,299` | `row.extension` is a dialable telephone extension. Converting it to Persian digits would be a regression, not a fix. **Deliberately excluded, and flagged here rather than silently dropped.** |
| `lib/ai-tools/purchase-advisor.functions.ts:91,144,164`, `lib/knowledge/rag.functions.ts:195` | `${i + 1}` list numbering inside **LLM prompt text**, not rendered UI. Excluded on the same ground; if the owner counts model-facing Persian prose as in scope, these four join the list. |

#### A neighbouring class I found but did NOT exhaustively enumerate

The same visual defect also occurs in **JSX adjacency** — a Persian text node next to a `{expr}` child. It renders identically but is not a template literal, so the scanner above cannot see it. A deliberately narrow probe (only `{x.length}` / `{xCount}` / `{x.count}` immediately followed by Persian) already finds 13 sites:

```
src/components/data-tables/FiltersBar.tsx:110            {rules.length} فیلتر فعال
src/components/layout/AppSidebar.tsx:308                 {failedCount} مورد ناموفق
src/components/operations/mood/DailyMoodPage.tsx:131     {STEPS.length} —
src/components/pricing/EffectiveCurrenciesPanel.tsx:113  {items.length} ارز
src/components/pricing/EffectiveCurrenciesPanel.tsx:149  {c.affected_products_count} محصول
src/components/pricing/workbench/WorkbenchFiltersBar.tsx:283 {activeCount} فیلتر فعال
src/components/products/ProductImagesSection.tsx:170     {rows.length} از
src/components/sales/StockAlertDialog.tsx:158            {note.length}/۵۰۰
src/components/users/EmployeeProfileCard.tsx:246         {bio.length} / ۵۰۰
src/routes/_app.academy.tsx:121                          {lessonsCount} درس
src/routes/_app.bot-api-keys.usage.tsx:229               {r.failed_count} خطا
src/routes/_app.pricing.price-alerts.tsx:162             {r.triggered_count}×
src/shared/components/ProductSupplierManager.tsx:482     {notes.length}/۲۰۰
```

`StockAlertDialog.tsx:158` and `EmployeeProfileCard.tsx:246` are the sharpest illustration: the denominator is hand-written in Persian (`۵۰۰`) and the counter beside it is Latin, so the two halves of one label disagree.

**This probe is indicative, not exhaustive** — it matches only a few identifier shapes. A complete JSX-adjacency enumeration needs a real TSX parse. **NOT PERFORMED.**

### Falsification attempts

| attempt | result |
|---|---|
| Is my localised/not classification just trusting helper names? | No. I read the body of every helper I excluded (`formatNumber` x2, `toFaDigits`, `toPersianDigits` x3, `formatTomanFa`, `fmtY`, `fmtMoney`, `marketing.suggestions.fmt`). That is exactly how `engine.ts:59` was caught — its name is indistinguishable from the ones that do localise. |
| Does `toLocaleString("fa-IR")` really emit Persian digits? | `fa-IR` resolves to the `arabext` numbering system in any ICU-complete runtime. I did **not** execute this inside the shipped browser bundle. **NOT PERFORMED** — flagged because it is the assumption under ~12 files. |
| Is the `engine.ts` breakdown actually displayed, or dead debug text? | Traced `engine.ts:308 -> breakdown.steps` to two render sites (`calculator.tsx:461`, `quick-price.tsx:411`). It is displayed. |
| Did the sweep miss the very file it was meant to check? | `_app.dashboard.tsx` is absent from both passes; I also grepped it directly for `${` and read all four hits by hand. |
| Could the scanner have silently skipped files (encoding, parse bail-out)? | It walks 100 percent of `src/` and only skips files with no Persian codepoint at all; pass 1 returned 141 hits across 60+ files, so it is not failing open. |

### Verdict — **(a) GREEN, (b) RED**

The G-4 change to `src/routes/_app.dashboard.tsx` is correct and belongs in the release. The repository-wide requirement is **not** met.

**Cost of removing this row: nil — there is nothing to remove.** The dashboard fix is sound; what is outstanding is one follow-up commit covering the list above. `src/lib/pricing/engine.ts:59` is a single line that clears 14 of the sites and is the highest-value item.

---

## Row 3 — migration 537, TRUNCATE revoked from `authenticated` — **GREEN**

**Requirement in my words:** after 537, the role `authenticated` must hold `TRUNCATE` on no table in schema `public`, no future table may inherit it, and nothing else may lose a privilege.

This row ran on a **second, fresh restore** of the same dump (same md5, same 21 errors in the same classes, ledger 681 / top `20260912150000`), with **no other migration applied**, so the numbers below are attributable to 537 alone.

### Transport integrity

```
$ md5sum supabase/migrations/20260913105000_537_revoke_truncate_from_authenticated.sql
cf4e1d0907001a07de2e474d87a0a752
$ docker exec afrakala-lan-db md5sum /tmp/m537.sql
cf4e1d0907001a07de2e474d87a0a752
```

### The count: 214 to 0

Baseline, measured by me over all 227 `public` tables:

```
=== TRUNCATE count per role over public tables (227 total) ===
anon                     | 0
authenticated            | 214      <-- matches the number the brief names
authenticator            | 0
postgres                 | 227
service_role             | 227
supabase_admin           | 227
supabase_read_only_user  | 0
```

After applying 537 (`--single-transaction -v ON_ERROR_STOP=1`, **exit 0**):

```
NOTICE:  537: TRUNCATE revoked from authenticated on 214 table(s); 13 already closed.
NOTICE:  537: default TRUNCATE privilege revoked for grantor(s): supabase_admin, postgres
NOTICE:  537 OK: authenticated holds TRUNCATE on 0 of 227 tables; service_role still holds it on all 227.
```

```
authenticated | 0
```

**214 to 0 — confirmed by my own count, independently of the gate inside the migration.** The `13 already closed` also matches the 13 tables the file header names as already hardened by migrations 250/259/268.

### Default privileges — I checked EVERY entry, not one

Before, the complete set of `pg_default_acl` rows in schema `public` (all object types, all grantors):

```
postgres       | public | S | {postgres=rwU/postgres,      authenticated=rwU/postgres,      service_role=rwU/postgres}
postgres       | public | f | {postgres=X/postgres,        authenticated=X/postgres,        service_role=X/postgres}
postgres       | public | r | {postgres=arwdDxt/postgres,  authenticated=arwdDxt/postgres,  service_role=arwdDxt/postgres}
supabase_admin | public | S | {postgres=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}
supabase_admin | public | f | {postgres=X/supabase_admin,  authenticated=X/supabase_admin,  service_role=X/supabase_admin}
supabase_admin | public | r | {postgres=arwdDxt/supabase_admin,authenticated=arwdDxt/supabase_admin,service_role=arwdDxt/supabase_admin}
```

**Exactly two grantors carry a TABLES (`r`) default in `public`, and 537 names both.** After:

```
postgres       | public | r | {postgres=arwdDxt/postgres,      authenticated=arwdxt/postgres,      service_role=arwdDxt/postgres}
supabase_admin | public | r | {postgres=arwdDxt/supabase_admin,authenticated=arwdxt/supabase_admin,service_role=arwdDxt/supabase_admin}
```

`arwdDxt` becomes `arwdxt` for `authenticated` under **both** grantors — the capital `D` (TRUNCATE) is gone and the lower-case `d` (DELETE) is untouched. The `postgres` and `service_role` entries are byte-identical to before. I also dumped every `pg_default_acl` row in the entire database (schemas `public`, `storage`, `pgsodium`, `pgsodium_masks`, plus two schema-less function defaults) to be sure no third grantor exists anywhere for public tables. There is none.

### Runtime proof that a future table does not inherit it

Catalogue reading is not behaviour, so I created a table and measured it, inside `BEGIN … ROLLBACK`:

```
created-by=supabase_admin acl={postgres=arwdDxt/supabase_admin,supabase_admin=arwdDxt/supabase_admin,
                               authenticated=arwdxt/supabase_admin,service_role=arwdDxt/supabase_admin}
created-by=supabase_admin authenticated_TRUNCATE=false
created-by=supabase_admin authenticated_SELECT=true
created-by=supabase_admin service_role_TRUNCATE=true
...
ROLLBACK
probe tables left behind: 0
```

A brand-new table gets `authenticated=arwdxt` — **no TRUNCATE, SELECT intact, service_role unaffected.** Section 2 does what it claims.

The mirror probe for the `postgres` grantor could not be run. In this restored database `postgres` holds only `USAGE` on schema `public`, not `CREATE`:

```
public owner=pg_database_owner acl={pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,
  postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,...}
postgres has CREATE on public: false
ERROR:  permission denied for schema public
LINE 1: CREATE TABLE public._v1_probe_pg (id int);
```

so `CREATE TABLE` as `postgres` fails before the default ACL is ever consulted. **NOT PERFORMED, and it matters:** `public` is owned by `pg_database_owner`, which resolves to whoever owns the database. My restore is owned by `supabase_admin`; the real production database may be owned by `postgres`, in which case that second grantor entry **is** live there. 537 fixes it either way, and the catalogue diff above proves the fix landed — only the runtime half is unprovable on my shape.

### Nothing else lost a privilege

Counts over all 227 tables, before and after, for all seven table privileges:

| role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER |
|---|---|---|---|---|---|---|---|
| `authenticated` before | 226 | 220 | 222 | 221 | **214** | 217 | 217 |
| `authenticated` after | 226 | 220 | 222 | 221 | **0** | 217 | 217 |
| `service_role` before | 227 | 227 | 227 | 227 | 227 | 227 | 227 |
| `service_role` after | 227 | 227 | 227 | 227 | 227 | 227 | 227 |
| `anon` before | 13 | 0 | 0 | 0 | 0 | 0 | 0 |
| `anon` after | 13 | 0 | 0 | 0 | 0 | 0 | 0 |

**Exactly one cell moved.** The md5 of every public function ACL was unchanged (`0f3c826830822bad28014cc933950a15` before and after), so no EXECUTE grant moved either.

### Second pass changes nothing

```
NOTICE:  537: TRUNCATE revoked from authenticated on 0 table(s); 227 already closed.
NOTICE:  537: default TRUNCATE privilege revoked for grantor(s): supabase_admin, postgres
NOTICE:  537 OK: authenticated holds TRUNCATE on 0 of 227 tables; service_role still holds it on all 227.

$ diff s537_after1.txt s537_after2.txt
diff exit = 0        <-- empty
```

Section 2 re-issues both `ALTER DEFAULT PRIVILEGES` statements on every run, which is a no-op by construction rather than by guard; the empty diff confirms it.

### Falsification attempts

| attempt | result |
|---|---|
| Is 214 an artifact of counting views, matviews or sequences? | No. My count filters `relkind IN (r,p)`; the total 227 matches `pg_tables` for `public`. |
| Does the revoke quietly take `SELECT` or `DELETE` too — the failure the brief warns about? | No. All six other privilege counts are identical before and after, for `authenticated`, `service_role` and `anon`. |
| Does section 2 fix only one grantor, so the fix looks complete while being half-applied? | Both grantors fixed. I enumerated **all** `pg_default_acl` rows database-wide and found exactly two `r`-type entries for `public`; both changed. |
| Is the default-privilege fix real or only catalogue-deep? | Created an actual table after the migration: `authenticated_TRUNCATE=false`, `SELECT=true`. Behavioural, not inferred. |
| Could the gate regex `authenticated=[a-zA-Z]*D` false-pass by matching the lowercase `d` of DELETE? | No. It requires a capital `D`, and `[a-zA-Z]*` cannot cross the `/` before the grantor name. After the revoke the string is `arwdxt/...`, and the gate correctly finds no match. I verified the resulting ACL strings directly rather than trusting the regex. |
| Does the file write its own ledger row? | One `schema_migrations` match, at line 194, inside a comment that states it does not. No executable statement. Ledger stayed at 681. |
| Did my probe leak tables into the database? | `probe tables left behind: 0`, checked after ROLLBACK. |

### Verdict — **GREEN**

`214 -> 0`, both default-ACL grantors closed, a real new table proven not to inherit it, every other privilege for `authenticated`, `service_role` and `anon` bit-for-bit unchanged, and an empty second-pass diff.

---

## Row 4 — migration 538, `anon` EXECUTE closed — **GREEN**, with one false statement in the header

**Requirement in my words:** after 538, `anon` must be unable to execute any function in `public` outside a documented, deliberate set; and no other role may lose access it currently has.

### The predicate, re-implemented by me from the spec (I did not run the spec)

`e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts:299-325` — the test `no NEW function in public is born anon-executable` — is the one that defines the class. Its predicate, transcribed to SQL:

```sql
SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname='public'
 WHERE p.prokind = 'f'
   AND has_function_privilege('anon', p.oid, 'EXECUTE')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e')
   AND p.prorettype <> 'trigger'::regtype
   AND p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' NOT IN (<the 17 exclusions>);
```

The exclusion list is the `MUST_STAY_OPEN` array at `og102-...spec.ts:194-212` (17 signatures), which I transcribed verbatim. Expected result: empty.

### Order I used, and why

Third fresh restore of the same dump (21 errors, same classes; ledger 681 / top `20260912150000`). I measured the predicate **twice**:

1. **On the bare restore, nothing applied: 39.**
2. Then applied the other eleven migrations of the release in numeric order — 526, 527, 528, 530, 531, 532, 533, 534, 535, 536, 537 — each md5-verified on both sides, each `--single-transaction -v ON_ERROR_STOP=1`, **all exit 0**.
3. **After the eleven: 36.**

Both numbers match the file header exactly: it claims 36, and `(39 before migrations 526/527/535 removed three of them)`. The ordering matters and is not cosmetic — **526 alone drops two anon-executable functions** (`asan_list_bank_deposit_export(date,date)`, which it recreates without the anon grant, and `expire_stale_credit_holds(integer)`, which it drops outright), so measuring 538 on a bare restore would have given 39 and looked like a miss.

**The "before" count is 36. Requirement met.**

For completeness, how the 36 were held, measured from `pg_proc.proacl`:

```
via_PUBLIC=23   via_anon_entry=36   null_acl=0
```

All 36 carry an explicit `anon=X`; 23 of them **additionally** carry a PUBLIC `=X`. Revoking only from `anon` would have left those 23 reachable by anyone, which is exactly why the file revokes PUBLIC too.

### After applying 538

```
$ md5sum supabase/migrations/20260913110000_538_close_anon_execute_on_pre393_functions.sql
39b963b8d4c69f8571ae2303288a4614
$ docker exec afrakala-lan-db md5sum /tmp/m538.sql
39b963b8d4c69f8571ae2303288a4614

NOTICE:  538: closed 36 function(s) to anon; issued 23 preserving grant(s); 0 skipped.
NOTICE:  538 OK: anon executes 0 outside the exclusions. authenticated 802 / service_role 856 of 856 public functions.
exit = 0
```

**Predicate count: 36 -> 0.** The 36 names disappeared from my list and nothing else did. All 17 exclusions were re-measured after the run and 16 remain anon-executable; the 17th, `dyn_table_role_can_view(_user_id uuid, _access_level text, _allowed_roles jsonb)`, was **already** anon-closed before 538 ran and 538 did not touch it — which is what the header says it deliberately does not do.

### Which roles lost access — every role in the cluster, counted

This is the half that took a live API down in the 395/405 incident, so I enumerated **all 28 roles** in the cluster and counted EXECUTE reach over all 856 public functions, before and after.

| role | before | after | delta |
|---|---|---|---|
| `anon` | 537 | 501 | **-36** (the target) |
| `authenticated` | 802 | 802 | 0 |
| `service_role` | 856 | 856 | 0 |
| `postgres`, `supabase_admin` | 856 | 856 | 0 |
| **`products_api_readonly`** | **522** | **522** | **0 — preserved** |
| `authenticator` | 522 | 499 | **-23** |
| `dashboard_user` | 522 | 499 | -23 |
| `supabase_read_only_user` | 522 | 499 | -23 |
| `supabase_auth_admin`, `supabase_storage_admin`, `supabase_replication_admin` | 522 | 499 | -23 each |
| `pgbouncer` | 522 | 499 | -23 |
| `pgsodium_keyholder`, `pgsodium_keyiduser`, `pgsodium_keymaker` | 522 | 499 | -23 each |
| the 12 built-in `pg_*` roles | 522 | 499 | -23 each |

Every loss is exactly 23 — the 23 functions that carried a PUBLIC `=X`. Nothing lost more, nothing lost anything outside that set. The count of public functions carrying an explicit PUBLIC entry fell `526 -> 503`, again exactly 23.

**`products_api_readonly` is the one that mattered, and it was preserved**, by 23 new explicit grants (its explicit-ACL-entry count on public functions went `0 -> 23`). The decisive single check is the very function from the 395/405 incident:

```
get_product_price_bounds acl: {supabase_admin=X/supabase_admin,postgres=X/supabase_admin,
  authenticated=X/supabase_admin,service_role=X/supabase_admin,products_api_readonly=X/supabase_admin}

anon                    can execute get_product_price_bounds: false
authenticated           can execute get_product_price_bounds: true
service_role            can execute get_product_price_bounds: true
products_api_readonly   can execute get_product_price_bounds: true
supabase_read_only_user can execute get_product_price_bounds: false
authenticator           can execute get_product_price_bounds: false
```

The PUBLIC entry is gone; the explicit `products_api_readonly=X` is there. **The 405 regression is not repeated.**

### FINDING — the header states a reason that is false

Migration 538, lines 76-78 and 171-172, says:

> `authenticator` needs nothing: pg_auth_members shows it is a MEMBER of anon, authenticated, service_role and products_api_readonly, so it inherits theirs.

**Measured, the inheritance half of that sentence is wrong:**

```
authenticator | rolinherit=false | canlogin=true
authenticator memberships: authenticated, service_role, products_api_readonly, anon
```

`authenticator` is **NOINHERIT**. It is a member of those four roles but does not inherit their privileges — it has to `SET ROLE`. That is exactly why its own reach fell `522 -> 499`: it never held those 23 by inheritance, it held them through PUBLIC, and PUBLIC is now gone.

**Severity: documentation, not behaviour — but it is load-bearing reasoning, not a typo.** The conclusion is probably still safe, because PostgREST connects as `authenticator` and issues `SET ROLE anon / authenticated / service_role` per request, so it never executes an application function as `authenticator` itself. I could not prove no other consumer connects as `authenticator` and calls one of the 23 directly. **NOT PERFORMED** — that needs the running stack, which is not my partition. If such a caller exists, what it loses is the 23 PUBLIC-held members of the 36 — the same set `products_api_readonly` was explicitly re-granted.

The same NOINHERIT fact makes the rest of the loss list harmless by construction for the request path: `dashboard_user`, `supabase_read_only_user`, `pgbouncer`, the three `pgsodium_*` roles, the `supabase_*_admin` roles and the twelve built-in `pg_*` roles hold **zero** explicit privileges on any public function (measured: explicit-ACL-entry count 0 for each, before and after), so none of them sits on an application path. That part of the header checks out.

### `supabase_read_only_user` is granted nothing — confirmed

The brief asks about this specifically, because `og77-view-callers-can-execute-what-views-call.spec.ts:43` lists it in `INTENTIONALLY_BLOCKED_ROLES` and lines 102-118 assert that at least 11 view/function pairs must stay blocked for it.

```
supabase_read_only_user explicit ACL entries on public functions:  before = 0   after = 0
```

**538 issued it no grant.** Its reach fell 522 -> 499, i.e. it became *more* blocked, which is the direction og77 wants. Using my own approximation of the og77 pair query, the blocked-pair count went **10 -> 11**, so on production shape 538 moves that assertion from below its threshold to exactly at it.

Two caveats, stated plainly: my query is a re-implementation and not the spec (it dedups on `relname, proname`), so the absolute value may differ from what the spec computes; and I did not run the spec, by partition. What is reliable is the direction and the delta — 538 only ever removes reach from `supabase_read_only_user`, never adds it.

### Second pass changes nothing

```
NOTICE:  538: closed 0 function(s) to anon; issued 0 preserving grant(s); 0 skipped.
NOTICE:  538 OK: anon executes 0 outside the exclusions. authenticated 802 / service_role 856 of 856 public functions.
exit = 0

$ diff s538_after1.txt s538_after2.txt
diff exit = 0        <-- empty
```

The derived target set is empty on the second run, so both the preserve loop and the revoke loop do nothing. All role counts and all ACL fingerprints identical.

### Falsification attempts

| attempt | result |
|---|---|
| Is 36 an artifact of my exclusion list being wrong? | I transcribed all 17 signatures from `og102-...spec.ts:194-212` and checked each against `pg_proc`: 17 of 17 exist under that exact identity signature, so none is silently dropping out of the filter and inflating the count. |
| Is the before count sensitive to ordering? | Yes, materially. Bare restore gives **39**; after the other eleven it gives **36**. I measured and report both rather than only the one that matches. |
| Does the revoke take anything from `authenticated` or `service_role`? | No. 802 and 856 before and after, unchanged. |
| Does revoking PUBLIC silently break a role that reached a function only through PUBLIC — the 405 failure? | **Yes, for 22 roles, and I name every one above.** The one that matters operationally, `products_api_readonly`, was explicitly preserved and verified function-by-function on the exact 405 casualty. |
| Is the preserve logic genuinely derived, or effectively a hardcoded list? | Derived. The loop reads `pg_roles` and `pg_class.relacl` at run time. On this shape it selected exactly one role, `products_api_readonly`, and granted on exactly the 23 functions being revoked from PUBLIC — proven by the `0 -> 23` explicit-entry count. |
| Does 538 grant `supabase_read_only_user` anything? | No. Explicit-entry count 0 before, 0 after. |
| Is the header factually reliable? | **No — see the FINDING above.** The `authenticator` inheritance claim is contradicted by `rolinherit=false`. Everything else in the header that I could measure (36, 39, 23 via PUBLIC, the four PUBLIC-dependent roles, the single preserving grant) checked out. |
| Does the file write its own ledger row? | Only a comment at line 305 saying it does not. Ledger unchanged at 681 across both passes. |

### Verdict — **GREEN**

`36 -> 0`; the exclusions intact; `authenticated`, `service_role` and `products_api_readonly` untouched; `supabase_read_only_user` granted nothing and left more blocked; second pass empty.

The false `authenticator` inheritance claim is a real defect, but it lives in a comment, not in behaviour. The correct statement is that `authenticator` is NOINHERIT and reaches roles by `SET ROLE`, so PostgREST is unaffected. **Recommend correcting the comment rather than removing the migration.**

---

## Row 5 — the inherited rows

### 5a — migration 527 — **GREEN**

**Requirement:** applies cleanly on production shape, no-ops on a second pass, no-ops rather than **aborts** on test shape, carries no database-name guard in either direction, and performs the same DDL as 336.

**No guard, either direction.** `grep -n current_database` on 527 returns three hits, all on comment lines (3, 9, 10) that quote 336 verbatim in order to explain what was removed. There is no executable `current_database()` anywhere in the file. (For contrast, see 533 below, which *does* carry a live one.)

**DDL vs 336** — comment-stripped diff. The executable content is identical:

```
DROP TRIGGER IF EXISTS trg_payment_receipts_post_journal ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.post_receipt_journal(_receipt_id uuid);
```

plus the same two-part verify block, with `336:` renamed to `527:`. **527 does one thing 336 did not:** it adds a caller precheck that scans `pg_proc.prosrc` for `post_receipt_journal\s*\(` and raises rather than dropping if any other public function references it. That is strictly more cautious than the original, and it is the only addition.

**Production shape** (third fresh restore, applied in release order after 526), **exit 0**:

```
NOTICE:  527: [precheck] no other function in public source-references post_receipt_journal(...) -- safe to drop
NOTICE:  trigger "trg_payment_receipts_post_journal" for relation "public.payment_receipts" does not exist, skipping
NOTICE:  527 OK: post_receipt_journal and trg_payment_receipts_post_journal are both absent
```

The precheck fired, so the function really existed on production and the drop did real work; the trigger really was already absent. Both facts match the header.

**Second pass on production shape, exit 0:**

```
NOTICE:  trigger "trg_payment_receipts_post_journal" ... does not exist, skipping
NOTICE:  function public.post_receipt_journal(uuid) does not exist, skipping
NOTICE:  527 OK: ...
$ diff pv5278_after1.txt pv5278_after2.txt   ->  exit 0, empty
```

**Test shape** (`afrakala`, wrapped `BEGIN … ROLLBACK`, md5 `8d464affb35b36e52c6cf6b75ace278b` verified both sides), **exit 0**:

```
BEGIN
NOTICE:  trigger "trg_payment_receipts_post_journal" ... does not exist, skipping
NOTICE:  function public.post_receipt_journal(uuid) does not exist, skipping
NOTICE:  527 OK: post_receipt_journal and trg_payment_receipts_post_journal are both absent
ROLLBACK
```

**It no-ops. It does not abort.** Because `post_receipt_journal` is already absent there, the outer `IF EXISTS` around the precheck is false, so the precheck never runs and both `DROP … IF EXISTS` statements skip. Re-snapshotted `afrakala` afterwards: `diff` exit 0 — nothing was written.

One thing I checked because 336 own header warns about it: 336 says `trg_post_receipt_on_approve` is left behind as dead code whose body still calls `post_receipt_journal`, which would make 527 precheck abort. Measured on **both** shapes: `trg_post_receipt_on_approve` is **absent**, and no public function source-references `post_receipt_journal` at all. Some later migration already removed it. So the precheck cannot fire on either shape — but it is worth knowing that on a database where that function still existed, 527 would refuse to run.

### 5b — migration 528 — **GREEN, with a new abort condition worth naming**

**No guard, either direction.** One `current_database` hit, on comment line 3. No executable guard.

**DDL vs 343** — comment-stripped diff. The two function bodies, both `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` pairs, and the Persian message are identical. Three differences:

1. the `$guard$` block is gone (the point of the file);
2. label renames `343:` to `528:` and an added success NOTICE;
3. **a new `ELSE RAISE EXCEPTION`** in the verify block.

Number 3 is a behavioural change, not cosmetic:

```
   ELSE
     RAISE EXCEPTION '528: no posted journal_entries row exists to test against -- this assertion would be vacuous';
```

343 had no `ELSE` — on a database with zero posted `journal_entries` it silently passed. **528 aborts there.** Rationale is sound (a vacuous assertion is worse than none), but it is a new shape-dependent abort in the very file whose purpose is to remove a shape-dependent abort. It does not fire on either real shape — production has 17 posted entries / 34 lines, test has 47 / 94 — but it would fire on a freshly bootstrapped environment. **Named, not counted against the row.**

**Production shape**, applied in release order, **exit 0**; **second pass exit 0**, state diff empty.

**Test shape** (`afrakala`, `BEGIN … ROLLBACK`, md5 `43da9a7d8aec185dec1ac54f1d01ccbc` verified both sides), **exit 0**:

```
BEGIN
CREATE FUNCTION / CREATE FUNCTION / DROP TRIGGER / CREATE TRIGGER / DROP TRIGGER / CREATE TRIGGER
NOTICE:  528 OK: posted journal_entries rows refuse UPDATE (tested against a real row, ...)
ROLLBACK
```

**It does not abort.** It is not a literal no-op — it replaces the two functions and the two triggers with themselves — but the catalogue outcome is unchanged, which is the meaningful sense: `diff` of the before/after snapshot is empty, and the function definition md5s are unchanged. In fact the two immutability functions are **already byte-identical across both shapes**:

```
tg_journal_entry_immutable | 1d18c907ae82ffde99ac2ff5fac930b0    (afrakala AND prod_rehearsal_v1)
tg_journal_line_immutable  | 4aad1aa46e7719fed503a64dfecc70b5    (afrakala AND prod_rehearsal_v1)
```

and the trigger sets on `journal_entries` / `journal_lines` are identical on both shapes after the release. That is the convergence the release exists to produce, measured rather than asserted.

**One behaviour to be aware of, which I verified is safe:** 528 verify block issues a real `UPDATE public.journal_entries SET description = description WHERE status = 'posted'` against live data. It is inside a PL/pgSQL `BEGIN … EXCEPTION` block, which opens a subtransaction, so the raise rolls it back and nothing persists — confirmed on `afrakala` by the empty post-rollback diff. It is still a write **attempt** against real accounting records at migration time, on production. Worth the owner knowing; not a defect.

---

### 5c — one load-bearing claim re-measured per merged PR

#### PR #441 (`feature/conv-db-fixes`, 530/531/532) — Persian text byte-identical — **CONFIRMED**

The claim, from 530 own header: *"the Persian reason string — all carried forward byte-identical"*.

I extracted every single-quoted literal containing a Persian codepoint from migration 530, and separately from the **live pre-530 body** of `can_issue_customer_invoice` on the test database:

```
'p_customer_id الزامی است'
'این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.'
'دسترسی غیرمجاز'

$ md5sum fa_live.txt fa_530.txt
a503ff5346952b15d1981b3addf6a6a8  fa_live.txt
a503ff5346952b15d1981b3addf6a6a8  fa_530.txt     <-- identical
$ diff fa_live.txt fa_530.txt   ->  exit 0
```

**Byte-identical, confirmed by md5 on both sides.**

I went further and diffed the **whole function body**, by applying 530 inside `BEGIN … ROLLBACK` on `afrakala` and diffing `pg_get_functiondef` before and after. The entire delta is:

```
+  -- 530: a debt with no settlement term (due_date_unknown) is now counted alongside a
+  -- debt past its due date (is_overdue). Both still require a genuine open balance.
-    AND r.is_overdue = true
+    AND (r.is_overdue = true OR r.due_date_unknown = true)
```

One predicate and one comment. The role gate, `SECURITY DEFINER`, the search_path and all three Persian strings are untouched. Re-read `afrakala` afterwards to confirm the rollback held: `diff` exit 0, nothing written. (A third diff line, a bare `BEGIN`, is an artifact of my own output filter, not a change.)

#### PR #443 (`feature/conv-frontend`) — typecheck baseline — **CONFIRMED: 70 errors, exactly 6 files**

```
$ cd D:\AfraKalaTest\wt-conv-int && npx tsc --noEmit
...
EXIT=2
$ grep -cE "error TS" tsc.txt
70
```

Per-file, which is what the brief asked for:

| file | errors |
|---|---|
| `src/routes/_app.products.index.tsx` | 18 |
| `src/routes/_app.admin.sales-reminders.tsx` | 15 |
| `src/lib/invoices/functions.ts` | 13 |
| `src/lib/accounting/functions.ts` | 13 |
| `src/lib/audit/index.ts` | 6 |
| `src/routes/_app.admin.automation.tsx` | 5 |
| **total** | **70 across 6 files** |

`npm install` was **not** required. I checked for the failure mode the brief warned about: only 3 errors are `TS2307 Cannot find module`, and all three name `@/integrations/supabase/server`, which is a **tsconfig path alias into `src/`**, not a package —

```
src/lib/accounting/functions.ts(16,34): error TS2307: Cannot find module '@/integrations/supabase/server' ...
src/lib/audit/index.ts(16,34):          error TS2307: ...
src/lib/invoices/functions.ts(17,34):   error TS2307: ...
```

`ls src/integrations/supabase/` shows `client.server.ts`, `client.ts`, `types.ts`, `auth-*.ts` — there is no `server.ts`, and the path is not gitignored. So those three are a genuine pre-existing source defect inside the 70, not a missing dependency. **Out of my scope, recorded.**

#### PR #442 (`feature/conv-security`, 535/536) — the REVOKE claim — **THE CLAIM AS STATED IS FALSE; the outcome is safe**

Claim under test: every `SECURITY DEFINER` function it creates carries its own `REVOKE ... FROM PUBLIC, anon, authenticated` in the same file.

**535 creates or replaces three SECURITY DEFINER functions and contains zero REVOKE statements.** Measured:

```
$ grep -nE "CREATE (OR REPLACE )?FUNCTION|SECURITY DEFINER|REVOKE|GRANT" 535.sql
33:  CREATE OR REPLACE FUNCTION public.delete_bot_api_key_secure(_key_id uuid, _reason text)
36:   SECURITY DEFINER
111: CREATE OR REPLACE FUNCTION public.admin_upsert_ai_provider(...)
114:  SECURITY DEFINER
219: CREATE OR REPLACE FUNCTION public.admin_delete_ai_provider(p_id uuid)
222:  SECURITY DEFINER
        (no REVOKE, no GRANT anywhere in the file)
```

**Why the outcome is nonetheless safe, measured not assumed:** all three are `CREATE OR REPLACE` of functions that already exist, and `CREATE OR REPLACE FUNCTION` **preserves** the existing ACL — unlike `CREATE FUNCTION`, it does not re-grant EXECUTE to PUBLIC. The end state on production shape after the whole release:

```
admin_delete_ai_provider(uuid)         | secdef=true | acl={supabase_admin=X,postgres=X,authenticated=X,service_role=X}
admin_upsert_ai_provider(...)          | secdef=true | acl={supabase_admin=X,postgres=X,authenticated=X,service_role=X}
delete_bot_api_key_secure(uuid,text)   | secdef=true | acl={supabase_admin=X,postgres=X,authenticated=X,service_role=X}
```

**No PUBLIC entry, no `anon`, on any of the three.** So the requirement behind the rule (a SECURITY DEFINER function must not be world-executable) holds; the literal rule, as the PR states it, does not describe 535.

536, by contrast, over-complies: `set_ai_providers_updated_by()` is a plain trigger function and **not** SECURITY DEFINER, yet 536 lines 77-79 carry the full `REVOKE ALL ... FROM PUBLIC / anon / authenticated` trio anyway. Measured end state `{postgres=X,supabase_admin=X,service_role=X}` — correct.

**Recommendation: restate the claim as "no SECURITY DEFINER function in this release ends up executable by PUBLIC or anon", which is true and which I measured, instead of "every one carries its own REVOKE", which is not.**

#### PR #445 (`feature/conv-ops`, 533/534) — REVOKE posture, and what runs at apply time

**The procedures and their posture — correct.** 533 creates two, both plain `PROCEDURE`, neither `SECURITY DEFINER`, each followed immediately by the full trio plus an explicit grant:

```
245-248:  REVOKE ALL ON PROCEDURE public.run_issabel_import() FROM PUBLIC / anon / authenticated;
          GRANT EXECUTE ON PROCEDURE public.run_issabel_import() TO postgres, supabase_admin, service_role;
444-447:  REVOKE ALL ON PROCEDURE public.generate_birthday_notifications_worker() FROM PUBLIC / anon / authenticated;
          GRANT EXECUTE ... TO postgres, supabase_admin, service_role;
```

Measured end state on production shape:

```
generate_birthday_notifications_worker() | secdef=false | acl={postgres=X,supabase_admin=X,service_role=X}
run_issabel_import()                     | secdef=false | acl={postgres=X,supabase_admin=X,service_role=X}
```

Exactly as claimed. 533 also ships its own post-apply gate asserting `anon`/`authenticated` cannot reach either and that `supabase_admin` still can.

**A documentation contradiction between the two files.** 533 states repeatedly and correctly that its two routines are **NOT** SECURITY DEFINER (lines 91, 150, 301). 534 line 48 says `cron_run_log` is *"written exclusively by SECURITY DEFINER functions"* and line 61 refers to *"533 two SECURITY DEFINER functions"*. The catalogue agrees with 533 (`secdef=false` for both). **534 comment is wrong.** It matters because that comment is 534 stated justification for having no INSERT/UPDATE policy on the table — the real reason is that the writers run as superusers, which 534 also says two lines earlier. Comment defect, not a behaviour defect.

### WHAT RUNS AT APPLY TIME IN 533 — and the part my rehearsal could not test

This is the brief specific question, and the answer is substantial.

**1. `CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;` at line 129 is UNCONDITIONAL** — outside every guard. Production does **not** have this extension. I confirmed that from the dump itself rather than inferring it:

```
$ pg_restore -l /tmp/prod13.dump | grep -i "EXTENSION -"
  pg_cron, pgsodium, btree_gist, pg_graphql, pg_stat_statements, pg_trgm,
  pgcrypto, pgjwt, supabase_vault, uuid-ossp, vector          <-- no http

$ psql -d prod_rehearsal_v1 -c "SELECT extname FROM pg_extension"   (after 533)
  btree_gist http pg_graphql pg_stat_statements pg_trgm pgcrypto pgjwt
  pgsodium plpgsql supabase_vault uuid-ossp vector             <-- http now present

$ psql -d afrakala -c "SELECT extname FROM pg_extension"
  btree_gist pg_graphql pg_stat_statements pg_trgm pgcrypto pgjwt
  pgsodium plpgsql supabase_vault uuid-ossp vector             <-- http NOT present
```

So **533 installs a new C extension into the production database at apply time**, and the test database has never had it either. It succeeded on my restore, so it is not a blocker — but "a migration that installs a new extension on production" deserves an explicit owner decision rather than arriving inside an ops migration.

**2. A REVOKE/GRANT loop mutates the ACLs of five PRE-EXISTING functions** (533 lines 460-469): `roll_employee_daily_streaks(date)`, `notify_accountants_daily_accrual_summary(date)`, `capture_score_snapshots()`, `cleanup_stale_auto_suppliers()`, `recompute_employee_scores_from_calls_worker(timestamptz)`. Each gets `REVOKE ALL ... FROM PUBLIC` — **without** the preserve-then-revoke dance that 538 performs for exactly the same hazard. Final ACLs are clean (`{supabase_admin, postgres, service_role}` on all five), and these are cron-only workers no request-facing role should call, so the risk is low. But it is an unpreserved PUBLIC revoke and it belongs in the record next to 538.

Net privilege effect of all eleven migrations excluding 538, measured bare-restore vs after:

```
anon                     540 -> 537      (the three functions 526/527/535 removed)
every non-superuser role 523 -> 522
postgres/service_role/supabase_admin  855 -> 856
public function count    855 -> 856
```

Small and self-consistent. No role lost more than one function across the eleven.

**3. The part that CANNOT be rehearsed on any database not named `postgres`.** 533 lines 506 and 517 read:

```sql
IF current_database() = 'postgres' THEN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
...
IF current_database() = 'postgres' THEN
  ... SELECT cron.schedule_in_database(...)   x 8 jobs
```

On my rehearsal it printed, and skipped:

```
NOTICE:  533: current_database() = prod_rehearsal_v1, not "postgres" -- pg_cron extension and all
         eight job rows are SKIPPED on purpose.
$ SELECT extname ... -> pg_cron NOT installed;  cron schema does not exist
```

**On production, `current_database()` IS `postgres`, so this whole block WILL execute**: it will `CREATE EXTENSION pg_cron` and register **eight cron jobs**. That code path has not been exercised by this rehearsal and, by construction, cannot be — the guard keys on a database name that no rehearsal copy can carry without being renamed.

This is a different and more defensible use of `current_database()` than 336/343: it **skips** rather than **aborts**, and the thing it skips genuinely cannot work elsewhere (pg_cron refuses to schedule from a database other than `cron.database_name`, which the restore log confirms: `HINT: Add cron.database_name = 'prod_rehearsal_v1' in postgresql.conf`). So I am **not** calling it the 336/343 defect. But the orchestrator should record plainly: **the largest single behaviour in this release is untested, and the only way to test it is to restore the dump into a database literally named `postgres` on a host where pg_cron can load.** **NOT PERFORMED by me** — creating a database named `postgres` is outside the databases I was authorised to touch.

---

## Cross-cutting check — no migration writes its own ledger row

The whole release (all twelve files, in numeric order) was applied to `prod_rehearsal_v1` by `psql`. After it:

```
ledger_rows=681 top=20260912150000       <-- unchanged from the restore
versions 20260913090000 ... 20260913110000 present in ledger: (none - correct)
```

The only occurrences of `schema_migrations` anywhere in the twelve files are four identical **comment** lines, in 535, 536, 537 and 538, each stating the file does not write its own row. **Confirmed by measurement, not by reading the comment.** The G-1 defect the mission records is genuinely absent.

---

## Verdict table

| row | subject | verdict | basis |
|---|---|---|---|
| 1 | migration 526 idempotent | **GREEN** | pass-1 vs pass-2 catalogue diff empty; first-pass no-op on test shape; partial-state repair correct; zero ledger writes |
| 2a | G-4, `src/routes/_app.dashboard.tsx` | **GREEN** | all four interpolations localised; file absent from both sweep passes |
| 2b | repository-wide Persian digits | **RED** | ~45 unlocalised interpolations in 21 files, plus 13 in the JSX-adjacency class; root cause `src/lib/pricing/engine.ts:59` |
| 3 | migration 537 TRUNCATE | **GREEN** | 214 to 0; both default-ACL grantors closed; new table proven not to inherit; no other privilege moved; second pass empty |
| 4 | migration 538 anon EXECUTE | **GREEN** | 39 bare / **36** after the other eleven, to 0; `products_api_readonly` preserved and verified on the 405 casualty; `supabase_read_only_user` granted nothing; second pass empty. One false statement in the header (see below) |
| 5a | migration 527 | **GREEN** | clean apply, empty second-pass diff, no-ops without aborting on test shape, no executable db-name guard, DDL matches 336 plus a stricter precheck |
| 5b | migration 528 | **GREEN** | same four properties; DDL matches 343 apart from a **new** non-vacuity abort that does not fire on either real shape |
| 5c #441 | Persian text byte-identical | **CONFIRMED** | md5 `a503ff53...` identical both sides; whole-body diff is one predicate plus one comment |
| 5c #443 | typecheck baseline | **CONFIRMED** | 70 errors, exactly 6 files, exit 2; no missing dependency |
| 5c #442 | every SECURITY DEFINER carries its own REVOKE | **CLAIM FALSE, outcome safe** | 535 creates three SECURITY DEFINER functions with zero REVOKE; safe only because `CREATE OR REPLACE` preserves the ACL, which I measured |
| 5c #445 | 533/534 posture and apply-time behaviour | **GREEN on posture, FLAGGED on coverage** | procedures correctly revoked; but 533 installs the `http` extension on production unconditionally, and its pg_cron half cannot be rehearsed |

**Nothing is RED that would be removed from the release.** Row 2b is a repository-wide gap that needs a new commit, not a removal; the G-4 artifact itself is sound.

## Findings, by severity

**MEDIUM — `src/lib/pricing/engine.ts:59`** — `const fmt = (n) => n.toLocaleString("en-US")` renders Latin digits into eight Persian breakdown lines shown at `_app.pricing.calculator.tsx:461` and `_app.pricing.quick-price.tsx:411`. One line fixes 14 interpolations.

**MEDIUM — 533 installs the `http` extension into production at apply time**, unconditionally and outside any guard. Verified absent from the production dump and from the test database. Wants an explicit owner decision.

**MEDIUM — 533 pg_cron half is unrehearsable.** It is gated on `current_database() = 'postgres'`, which is true only on production. `CREATE EXTENSION pg_cron` plus eight `cron.schedule_in_database` calls will run there for the first time, untested.

**LOW — 538 header states a false reason.** `authenticator` is `rolinherit=false`; it does **not** inherit from anon/authenticated/service_role. Its EXECUTE reach fell 522 to 499. The conclusion (no grant needed) is probably still right via `SET ROLE`, but the stated mechanism is wrong.

**LOW — PR #442 claim does not describe 535.** Three SECURITY DEFINER functions, no REVOKE in the file. Safe by `CREATE OR REPLACE` ACL preservation, not by the claimed mechanism.

**LOW — 528 adds a new shape-dependent abort** (`no posted journal_entries row exists to test against`). Does not fire on either real shape; would fire on a fresh environment.

**LOW — 533 revokes PUBLIC on five pre-existing functions without the preserve step** that 538 performs for the identical hazard. Outcome measured clean; the pattern is inconsistent.

**LOW — 534 comment contradicts 533.** 534 calls the two writers SECURITY DEFINER; they are not (`secdef=false`, measured).

**INFORMATIONAL — ledger is 21 rows short of disk before this release** (681 rows vs 702 files). Pre-existing, outside my rows, not investigated.

**INFORMATIONAL — three of the 70 typecheck errors are a real missing module**, `@/integrations/supabase/server`, imported by `src/lib/accounting/functions.ts:16`, `src/lib/audit/index.ts:16`, `src/lib/invoices/functions.ts:17`. The directory has `client.server.ts`, not `server.ts`.

## What I could not check — NOT PERFORMED

1. **The rendered page.** No browser, by partition. Row 2 is source-level only.
2. **Any e2e spec, including og102 and og77.** By partition. I re-implemented their predicates in SQL and say so everywhere I rely on one; my og77 pair count is an approximation and its absolute value may differ from the spec.
3. **533 pg_cron block.** Needs a database literally named `postgres`; outside the databases I was authorised to touch.
4. **537 default-privilege probe for the `postgres` grantor.** `postgres` lacks `CREATE` on schema `public` in my restore because `public` is owned by `pg_database_owner` and my restore is owned by `supabase_admin`. Production ownership may differ, so that grantor entry may be live there. The catalogue fix is proven; the runtime half is not.
5. **Whether any consumer other than PostgREST connects as `authenticator`** and directly calls one of the 23 functions that lost their PUBLIC grant. Needs the running stack.
6. **Exhaustive JSX-adjacency enumeration for Row 2b.** My probe matched only a few identifier shapes; a complete answer needs a TSX parse.
7. **That `.toLocaleString("fa-IR")` emits Persian digits in the shipped browser bundle.** True in any ICU-complete runtime, not executed there by me. It is the assumption under about twelve files.
8. **Anything about the production laptop at 192.168.170.10.** Never contacted.

## Databases I touched

- `prod_rehearsal_v1` — dropped and recreated three times from `/tmp/prod13.dump`. Mine to destroy.
- `afrakala` — **read-only in effect**. Every run against it was wrapped in `BEGIN … ROLLBACK`, and after each one I re-snapshotted and diffed against the pre-run state. All three such verification diffs were empty (after 526; after 527 and 528; after 530). Nothing was written.
- `postgres` — connected to only as the entry point for `DROP DATABASE` / `CREATE DATABASE prod_rehearsal_v1`. No object in it was read or changed.
- Never touched: `prod_rehearsal_base`, `prod_rehearsal_gate`, `prod_rehearsal_20260908`, and the production laptop.

No files were created outside this report and the scratchpad. I ran no git command.
