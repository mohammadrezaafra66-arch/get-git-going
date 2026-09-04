# Open items — read-only reconnaissance

**Date:** 2026-09-04 · **Type:** read-only. Nothing in the repository was changed except this file.
**Status: COMPLETE** — all five questions carry a verdict.

---

## 0. Environment and validity

| Item | Value | How established |
|---|---|---|
| `hostname` | **VIRA-SERVICE** — the test computer. Gate passed. | `hostname` |
| Repo | `D:/AfraKalaTest/app` | `git rev-parse --show-toplevel` |
| Working tree branch | `staging` @ `c816eea4`, identical to `origin/staging` | `git status -sb` |
| Production | **Never contacted.** `192.168.170.10` was not resolved, pinged or queried. | — |
| Git writes | **None.** No checkout, switch, pull, fetch, stash, reset, merge, rebase, commit, push, or worktree add. Only `log`, `show`, `diff`, `branch -a`, `ls-tree`, `merge-base`, `rev-list`, and `gh pr list`. | — |
| Database | `afrakala` on `afrakala-lan-db`. `SET default_transaction_read_only=on` on every statement; behavioural probes wrapped in `BEGIN READ ONLY … ROLLBACK`. | — |
| Containers | `docker logs` / `docker inspect` only. No restart, no compose, no exec that writes. | — |
| Files written | **This file only.** Measurement scripts and generated workbooks live in the session scratchpad, outside the repo. | — |
| HTTP | Read-only `GET` / `HEAD` against the **test** stack (`192.168.170.8:3100`, `:9000`). No write API was called. | — |

### Other agents are live in this tree right now

`git worktree list` at the time of reading:

```
D:/AfraKalaTest/app                     c816eea4 [staging]
…/wt-asan                               edb48fb8 [hotfix/asan-bank-export-headers]
…/wt-asan2                              c816eea4 [hotfix/asan-bank-export-layout]
…/wt-phonefix                           6298b97d [hotfix/quote-link-empty-phone]
…/rv383                                 edb48fb8 (detached HEAD)   ?? tsconfig.spec.json
D:/AfraKalaTest/afrakala-deploy-sidebar  257ba917 (detached HEAD)
D:/AfraKalaTest/app-docs-build           33bc6704 [feature/documents-dual-filter-export]
```

`wt-asan2` is on a branch with **zero commits** — somebody started the Asan layout work minutes ago
and has not committed. Everything below was read around it.

### One premise in the brief is wrong, and it changes Q1

> "the headers come from `layouts.ts:65` which is the journal header set"

`layouts.ts:65` on `origin/staging` is `"کد حساب", // A` — inside `JOURNAL_HEADERS`. The **bank**
export does not read that constant. The wiring is correct and is measured in Q1 §3. The real defect
is elsewhere, and it is worse.

---

# Q1 — The Asan export repair: delivered, or abandoned?

## 1.1 What exists

| Artefact | Exists? | Evidence |
|---|---|---|
| Branch `hotfix/asan-bank-export-headers` | **YES**, 1 commit | `git log origin/staging..hotfix/asan-bank-export-headers` → `edb48fb8` |
| Branch `hotfix/asan-bank-export-layout` | **YES, but empty** | `git log origin/staging..hotfix/asan-bank-export-layout` → *(no output)*; `git diff --name-status` → *(no output)* |
| PR | **PR #383, OPEN** | `gh pr list --state all` → `383  OPEN  hotfix/asan-bank-export-headers -> staging  test(asan): pin the bank export's header contract — no fix was needed` |
| A fix to `_app.admin.asan-export.tsx` | **NO — on any ref** | `git log --all -S'sheetName' -- src/lib/asan/ src/routes/_app.admin.asan-export.tsx` → only `ff0b942d` (M4.8) and `960abd2f` (M4.2), both from the original build |
| A fix to `layouts.ts` | **NO** | same command; `git diff origin/staging hotfix/asan-bank-export-headers` touches only `e2e/` |

`edb48fb8` — author `Ali <234219238+mohammadrezaafra66-arch@users.noreply.github.com>`,
2026-09-03 17:59:19 +0500 — changes exactly one file against its merge-base (`99f6ad74`):

```
A  e2e/asan/og99-bank-export-matches-the-template.spec.ts
```

**No code was changed. The commit subject says so: "and report that no fix was needed."**

## 1.2 What the current `origin/staging` bank export produces — measured, not read

The bank path is wired like this:

- `src/lib/asan/export-bank-deposit.ts:51-69` — `BANK_DEPOSIT_EXPORT`, `layout: "bank_deposit"`, `label: "واریزیهای بانکی (مسیر جایگزین)"`
- `src/lib/asan/layouts.ts:111-116` — `LAYOUT_HEADERS.bank_deposit = BANK_DEPOSIT_HEADERS`
- `src/lib/asan/layouts.ts:88-104` — the 15 header strings, misspellings included
- `src/routes/_app.admin.asan-export.tsx:143` — `const headers = LAYOUT_HEADERS[definition.layout];`
- `src/routes/_app.admin.asan-export.tsx:253-256` — `downloadAsanWorkbook({ headers, rows, sheetName: "Asan" }, …)`
- `src/lib/asan/write-xlsx.ts:26-34` — `aoa_to_sheet` + `book_append_sheet(wb, ws, sheet.sheetName ?? "Sheet1")`

I reproduced that exact pipeline with the repo's own `xlsx@0.18.5` in the scratchpad and read the
workbook back. Verbatim output:

```
PRODUCED sheetNames  : ["Asan"]
PRODUCED !ref        : A1:O2
PRODUCED width       : 15 cols;  rows: 2
  hdr A  t=s v="Date"             | body t=s v="1405/06/13"
  hdr B  t=s v="Code_M"           | body t=s v="1001"
  hdr C  t=s v="Name_Moshtare"    | body t=s v="شرکت نمونه"
  hdr D  t=s v="Shopmare_Peygeri" | body t=s v="TRK-77"
  hdr E  t=s v="Mablagh"          | body t=n v=2500000
  hdr F  t=s v="Bank_cod"         | body t=s v="12"
  hdr G..O  t=s v=""              | body t=s v=""

TEMPLATE sheetNames  : ["Sheet1"]
TEMPLATE !ref        : A1:O1
TEMPLATE width       : 15 cols;  rows: 1

=== HEADER-ROW DIFF ===
  header row: IDENTICAL (15/15 cells match in type and value)

=== SHEET NAME DIFF ===
  produced "Asan"  vs  template "Sheet1"  ->  MISMATCH
```

The oracle, read directly out of the zip (`unzip -p docs/asan/templates/bank-deposit-template.xlsx …`):

```
xl/workbook.xml     : <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
xl/sharedStrings.xml: <sst count="7" uniqueCount="7">
                        <si><t>Date</t></si><si><t>Code_M</t></si><si><t>Name_Moshtare</t></si>
                        <si><t>Shopmare_Peygeri</t></si><si><t>Mablagh</t></si><si><t>Bank_cod</t></si>
                        <si><t /></si></sst>
xl/worksheets/sheet1.xml: <dimension ref="A1:O1"/>
                          A1..F1 t="s" -> sst[0..5];  G1..O1 t="s" -> sst[6] (the empty string)
```

### Cell-for-cell diff, bank layout

| Property | Template (oracle) | Produced today | Verdict |
|---|---|---|---|
| Sheet name | `Sheet1` | **`Asan`** | ❌ **DIFFERS** |
| Column count | 15 (`A1:O1`) | 15 (`A1:O2`) | ✅ |
| A1..F1 text | Date, Code_M, Name_Moshtare, Shopmare_Peygeri, Mablagh, Bank_cod | identical, byte for byte | ✅ |
| The two misspellings | `Name_Moshtare`, `Shopmare_Peygeri` | reproduced, not corrected | ✅ |
| G..O | real cells holding `""` | real cells holding `""` | ✅ |
| `Date` cell type | text | text, `YYYY/MM/DD` (`dates.ts:28-34`) | ✅ |
| `Mablagh` cell type | — (template has no data row) | numeric, Toman × 10, negated for a payment (`export-bank-deposit-rows.ts:57-61`) | ✅ vs spec |

## 1.3 The defect PR #383 cannot see — and it is not the sheet name

Reading the workbook back through `XLSX.read` **normalises the cell type**, so the table above hides
the real problem. The raw XML of the file the app produces:

```xml
<sheetData><row r="1">
  <c r="A1" t="str"><v>Date</v></c>
  <c r="B1" t="str"><v>Code_M</v></c>
  …
</row><row r="2">
  <c r="A2" t="str"><v>1405/06/13</v></c>
  <c r="E2"><v>2500000</v></c>          <!-- number: bare, no t attribute -->
  …
</row></sheetData>
```

and the zip contains **no `xl/sharedStrings.xml` at all**:

```
xl/_rels/workbook.xml.rels  xl/theme/theme1.xml  xl/styles.xml
xl/worksheets/sheet1.xml    xl/metadata.xml      xl/workbook.xml
_rels/.rels  docProps/app.xml  docProps/core.xml  [Content_Types].xml
```

`t="str"` is the **cached-formula-result string** type. It carries no `<f>` element, which makes it
malformed, and it is not the type Asan's own templates use (`t="s"` + `SST`). Numbers are written
bare and are therefore read fine.

**The owner's actual failing file proves it.** `docs/asan/templates/FAILED-platform-export-sample.xlsx`
has the identical structure — same ten zip entries, same `t="str"`, no sharedStrings, sheet name `Asan`:

```xml
<c r="A1" t="str"><v>کد حساب</v></c> … <c r="F1" t="str"><v>بستانکار</v></c>
<c r="A2" t="str"><v>8</v></c> <c r="E2"><v>690000000</v></c>
```

That is exactly the reported symptom: **only the number columns survive.**

Note what that file also tells us: it is a **journal** export (6 columns `کد حساب…بستانکار`), not a
bank export. Its correct oracle is `dual-document-template.xls`, whose header row is byte-identical
and whose sheet is also named `Sheet1`. So the accountant reached the bank receipt through the
`receipts` export (`layout: journal`), which is what the registry intends — `bank_deposits` is
labelled `"واریزیهای بانکی (مسیر جایگزین)"`, an *alternative* path. That is a labelling question,
not a wiring bug.

**Why PR #383 cannot fail on either defect:**

1. Its round-trip helper passes `sheetName: "Sheet1"` itself
   (`og99-bank-export-matches-the-template.spec.ts`, `roundTrip()`), so the route's hardcoded
   `"Asan"` is never exercised.
2. It asserts through `XLSX.read`, which reports `t="str"` cells as `t: "s"` — measured above. The
   serialization defect is invisible to it by construction.

Its five assertions are all true and all pass. They pin a contract that was already correct.

## 1.4 Verdict — Q1

**The header repair was never needed and was never made. The work was NOT abandoned — it was
completed as an investigation and correctly reported "no fix needed" for the headers. But the export
is still broken, for a different reason, and nothing on any branch fixes it.**

Two independent deviations remain, both unfixed on every ref:

| # | Deviation | Location | Severity |
|---|---|---|---|
| 1 | Every string cell is written `t="str"` with no shared-string table | `src/lib/asan/write-xlsx.ts:29` (`aoa_to_sheet`) + the `XLSX.write` serializer | **This is the text loss.** |
| 2 | Sheet is named `Asan`; both real templates use `Sheet1` | `src/routes/_app.admin.asan-export.tsx:254` | Unknown — Asan may or may not care |

Neither has a branch, a commit, or a PR.

> **Owner question Q1:** *"Fix the export serialization (write real shared strings) and rename the
> sheet to `Sheet1` in the same change — yes or no?"*

---

# Q2 — Whose work is `feature/quote-customer-picker-readonly`?

## 2.1 Facts

| Item | Value |
|---|---|
| Tip | `a7e14017` — *"docs(release): what rollback actually is, now that half the change has no switch"*, 2026-09-03 16:39:50 +0500 |
| Author of all 21 commits | `Ali <234219238+mohammadrezaafra66-arch@users.noreply.github.com>` — the owner's own GitHub identity, which is what every agent in this repo commits as |
| Date range | 2026-09-02 → 2026-09-03 |
| Merge-base with staging | `afdade65` (PR #379, 2026-09-01) |
| Ahead of merge-base | **21 commits** · staging is ahead by **7** |
| Merged into `origin/staging`? | **NO** (`git merge-base --is-ancestor` → not an ancestor) |
| Merged into `origin/main`? | **NO** |
| PR? | **None, ever.** `gh pr list --state all --limit 100` filtered on `quote-customer-picker` → no rows |
| Currently checked out anywhere? | **No.** It appears in no worktree. The uncommitted edits the brief mentions to `guest-quote-handover.md` and `production-preflight.ps1` are **not present now** — both files are committed on the branch and `git status` in the main tree is clean of them. |

**It is running in production-on-the-test-box right now.**

```
docker inspect afrakala-lan-web → APP_GIT_SHA=cbad7625  APP_BUILD_TIME=2026-09-03T16:12:38
git branch -a --contains cbad7625 → feature/quote-customer-picker-readonly (only)
git rev-list --count cbad7625..a7e14017 → 2
```

The LAN test server serves a build from **this branch**, two commits behind its tip, and that commit
exists on no merged ref. `.env.lan:43` carries `VITE_FEATURE_QUOTE_CUSTOMER_PICKER=true`.

## 2.2 What is on it

44 files against the merge-base: 24 new documents under `docs/release`, `docs/design`,
`docs/discovery`; 5 new e2e specs (`og93`–`og97`); `src/lib/feature-flags.ts`; two migrations
(`420`, `421`); and modifications to 11 source files.

**Two migrations from this branch are already applied to the test database:**

```sql
select version from supabase_migrations.schema_migrations
 where version in ('20260903100000','20260903140000','20260903160000');
-- 20260903100000   (420, file exists ONLY on this branch)
-- 20260903140000   (421, file exists ONLY on this branch)
-- (422's file IS on staging but is NOT recorded)
```

So `origin/staging` violates the ledger-matches-disk invariant in **both** directions today.
`e2e/security/og81-migration-ledger-matches-disk.spec.ts` should be red.

## 2.3 Overlap with work in progress

Exactly one source file is modified on **both** sides of the divergence:

```
src/routes/_app.sales.quotes.new.tsx
```

- **staging** (`6298b97d`, PR #381) patched the `linkedCustomerId` memo so an *empty stored phone*
  no longer unlinks a quote — `_app.sales.quotes.new.tsx:166-181`.
- **the branch** (`69fee9b6`) replaced the whole rule with "the link is the id", behind
  `FEATURE_QUOTE_CUSTOMER_PICKER` — `_app.sales.quotes.new.tsx:288-302` on that ref.

Critically, **the branch's flag-OFF fallback still carries the pre-#381 bug**:

```ts
// feature/quote-customer-picker-readonly:_app.sales.quotes.new.tsx:299-300
const phoneMatches =
  selectedCustomer.phone.replace(/\D/g, "") === customerPhone.replace(/\D/g, "");
```

No empty-phone exemption. A merge that keeps only the branch's version silently reintroduces the
defect PR #381 was written to fix, on the rollback path.

## 2.4 Verdict — Q2

**UNFINISHED — and it is the code production-on-test is actually running.** Not superseded (nothing
of it is on staging); not abandoned (it carries a complete rollback plan, a five-precondition
migration runbook with md5 references for both directions, and five e2e specs).

It stopped at exactly one place: **nobody opened the PR.**

What remains, concretely:

1. Open the PR to `staging`.
2. Resolve `src/routes/_app.sales.quotes.new.tsx` — keep staging's empty-phone exemption **inside**
   the branch's flag-OFF fallback, or the rollback path regresses.
3. Migrations `420`/`421` must travel with the merge, or the ledger stays inconsistent in both
   directions.
4. Rebuild the LAN web container from a merged ref, so `APP_GIT_SHA` names a commit that exists on
   `staging`.

Until (4), every manual test the owner runs on `192.168.170.8:3100` is a test of code that is on no
merged branch.

> **Owner question Q2:** *"Open PR #384 for `feature/quote-customer-picker-readonly` into staging —
> yes, or abandon the branch and rebuild the test server from staging?"*

---

# Q3 — The 370..401 security series: what is production exposed to?

## 3.1 The real shape — bigger than "four dropped"

The range holds **32** migration files. The production runbook
(`docs/migration/final-dryrun-v6-20260831.md:223-297`) lists the set that was cleared for
production: **43 migrations, of which only four come from this range — 391, 392, 398, 400.**

The history, from the project's own records:

- `docs/migration/final-dryrun-v4-20260831.md:125-135` — *"The set contains **eight** of them and is
  missing **twenty-four** — including every migration that actually closes a door."* The eight were
  378, 379, 380, 391, 392, 393, 398, 400.
- `final-dryrun-v4:168` — **Option A** was recommended and (per `final-dryrun-v5:3`) applied:
  remove 378/379/380/393. *"The set has the gates without the fixes. That ordering is backwards and
  cannot succeed."*
- `final-dryrun-v6:219-221` — *"Migration 393 is NOT in the 43. It was removed with the other three
  security gates under Option A."*
- `final-dryrun-v6:428-430` — *"**The security series 370–401**, 24 migrations, deliberately deferred
  with Option A. The anon exposure they close is open on production today."*

So the brief's "four dropped" is the *gates*. The **24 fixes were never in the set at all.**
Production has neither.

## 3.2 The table

`IN PROD SET` = present in the 43 listed at `final-dryrun-v6:230-283`.
Everything marked ✗ is **inferred from the migration text**, not measured — production cannot be queried.

| # | Kind | What it revokes / guards | Object(s) | In prod set |
|---|---|---|---|---|
| 370 | **fix** | `REVOKE ALL … FROM anon` on 6 views; `ALTER VIEW … SET (security_invoker = true)` on 2 | `product_computed_prices_public`, `publish_recipients_view`, `v_dynamic_customer_capital_balances`, `v_dynamic_salesperson_capital_balances`, `v_promotion_suggestions`, `vw_account_balances` | ✗ |
| 371 | assert | proves 370's end state by identity | — (0 DDL) | ✗ |
| 372 | assert | gate parses `reloptions` + column ACLs | — (0 DDL) | ✗ |
| 373 | **fix** | `ALTER DEFAULT PRIVILEGES … REVOKE ALL ON TABLES/SEQUENCES FROM anon` | future tables & sequences in `public` | ✗ |
| 374 | **grant** | re-grants the *intended* public surface after 373 | `products`, `brands`, `categories`, `sale_price_types`, `refresh_sale_list_prices(uuid)` | ✗ |
| 375 | assert | pins the OG-25 end state | — (0 DDL) | ✗ |
| 376 | **grant** | register-form surface | `profile_field_definitions` | ✗ |
| 377 | **grant** | two surfaces 374 missed | `shop_settings`, `get_recent_purchase_label(uuid)`, `get_recent_purchase_labels(uuid[])` | ✗ |
| 378 | assert | census compared as a set | — (0 DDL, measured) | ✗ *(dropped)* |
| 379 | assert | census by effect, all relkinds | — (0 DDL, measured) | ✗ *(dropped)* |
| 380 | assert | pins privilege set + column effect | — (0 DDL, measured) | ✗ *(dropped)* |
| 381 | **fix** | `REVOKE EXECUTE … FROM anon` **and** `FROM PUBLIC` (two statements — the file documents at :30-72 why one is not enough) | `get_recent_purchase_label(uuid)`, `get_recent_purchase_labels(uuid[])` | ✗ |
| 382 | assert | repairs 381's gate | — (0 DDL) | ✗ |
| 383 | assert | OG-33 by name | — (0 DDL) | ✗ |
| 384 | assert | `bypassrls` by role | — (0 DDL) | ✗ |
| 385 | assert | repairs 384's gate | — (0 DDL) | ✗ |
| 386 | **fix** | rewrites 8 views so a NULL `auth.uid()` returns nothing | the 6 above + `vw_customer_receivables`, `vw_supplier_payables` | ✗ |
| 387 | assert | repairs 386's gate | — (0 DDL) | ✗ |
| 388 | **fix** | `REVOKE SELECT ON products FROM anon`, then column-level `GRANT SELECT (…)` | `products` | ✗ |
| 389 | **fix** | closes the DEFINER SKU path | `find_duplicate_product(uuid,uuid,text,text,text,uuid)` — anon **and** PUBLIC | ✗ |
| 390 | **fix** | same narrowing for categories + closes a price DEFINER | `categories`; `calculate_adjusted_price(uuid)` — anon **and** PUBLIC | ✗ |
| 391 | **fix** | `DROP FUNCTION trg_post_receipt_on_approve()`; RESTRICTIVE `viewer_restricted` policy | `document_attachments` | **✓** |
| 392 | **fix** | RESTRICTIVE `viewer_restricted` policy | `document_status_history` | **✓** |
| 393 | **fix** | `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` / `… FROM anon`, then re-grants 6 system schemas | future functions everywhere | ✗ *(dropped)* |
| 394 | (unrelated) | Tehran `today()` for purchase dates | — | ✗ |
| 395 | **fix** | **56 REVOKEs** over 28 SECURITY DEFINER *read* functions, anon **and** PUBLIC | leaderboards, price bounds/sale price, observatory snippets, `list_trusted_credit_customers`, `person_fk_registry_report`, … | ✗ |
| 396 | (unrelated) | Tehran `today()` in bucketing/staff metrics | — | ✗ |
| 397 | (unrelated) | OCR routed to local vision | — | ✗ |
| 398 | (feature) | receipt document extraction can persist | 1 policy | **✓** |
| 399 | **fix** | **52 REVOKEs** over **26 SECURITY DEFINER *writer* functions**, anon **and** PUBLIC | see 3.4 | ✗ |
| 400 | (feature) | locks amount & party after posting | — | **✓** |
| 401 | (unrelated) | Ollama declares vision | — | ✗ |

## 3.3 What "applied" looks like — measured on THIS database

These are the states production is missing. All measured with `default_transaction_read_only=on`.

```
-- 399's 26 functions
0 of 26 still executable by anon
26 of 26 are SECURITY DEFINER

-- 395's 28 functions
28 overloads; anon-executable now=0; SECURITY DEFINER=28

-- 370/386's six views
product_computed_prices_public         : anon SELECT=false  security_invoker=true
publish_recipients_view                : anon SELECT=false  security_invoker=(unset)
v_dynamic_customer_capital_balances    : anon SELECT=false  security_invoker=(unset)
v_dynamic_salesperson_capital_balances : anon SELECT=false  security_invoker=(unset)
v_promotion_suggestions                : anon SELECT=false  security_invoker=true
vw_account_balances                    : anon SELECT=false  security_invoker=(unset)

-- 388/390 column narrowing
table-level anon SELECT on products=false  categories=false
anon column grants: products.{id,name,model,capacity,description,brand_id,category_id,is_active,stock_status}
                    categories.{id,name,slug,description,parent_id,is_active}

-- 373/393 default privileges (anon and PUBLIC both absent)
supabase_admin | public        | objtype=r | postgres=arwdDxt  authenticated=arwdDxt  service_role=arwdDxt
supabase_admin | public        | objtype=f | postgres=X        authenticated=X        service_role=X
supabase_admin | (all schemas) | objtype=f | supabase_admin=X/supabase_admin
```

## 3.4 The urgency split — no login, or a session?

**`anon` needs no login.** The publishable key is a build argument baked into the browser bundle
(`Dockerfile:29`, `Dockerfile:46`) — it is public by design. Measured against the test stack:

```
GET /rest/v1/products?select=id&limit=1   with apikey (no session)  -> 200  [{"id":"dffc51af-…"}]
GET /rest/v1/customers?select=id&limit=1  with apikey (no session)  -> 200  []      (RLS filters)
GET /rest/v1/products?select=id&limit=1   with NO apikey            -> 401
```

So anything reachable by `anon` on production is reachable by anyone who opens the site and reads
one JS file.

### Class A — exploitable with NO login (the serious class)

| Migration | Exposure left open on production |
|---|---|
| **399** | **26 SECURITY DEFINER *writer* functions callable by anyone.** All 26 measured `prosecdef = true`, i.e. they run as the owner and bypass RLS entirely. They include `bot_authenticate_key(text)`, `revoke_user_role_txt`, `asan_burn_document_number`, `next_sales_quote_number`, `next_product_sku`, `settle_league_season`, `expire_pending_documents`, `expire_pending_delivery_receipts`, `cleanup_stale_auto_suppliers`, `detect_phone_collisions`, `award_xp_from_score`, `recalculate_settlement_score`, `update_customer_overdue_status`, `refresh_all_sale_list_prices`, `sync_product_stock_status`. |
| **395** | 28 SECURITY DEFINER *read* functions callable by anyone — leaderboards and staff ranks (personnel data), `get_product_price_bounds` / `get_product_sale_price` / observatory snippets (pricing), `list_trusted_credit_customers` (customer credit standing). |
| **370 / 386** | 6 views readable by anyone: customer and salesperson capital balances, account balances, promotion suggestions, publish recipients. 386 additionally rewrites 8 views so a NULL `auth.uid()` yields nothing — without it the guard is decorative. |
| **381 / 389 / 390** | 3 more functions executable by anyone, including `calculate_adjusted_price(uuid)`. |
| **388 / 390** | `products` and `categories` readable **whole-table** by anyone, instead of the 9 + 6 columns the shop needs. Cost, supplier and internal columns included. |
| **373 / 393** | Every table, sequence and function created on production **since** the series was written inherits `PUBLIC`/`anon` privileges. This one gets worse with time on its own. |

**This is the same class as the three holes the owner closed today.** 399 is the sharpest of them:
writer functions, no authentication, RLS bypassed by construction.

### Class B — needs an authenticated session

| Migration | Exposure | Status |
|---|---|---|
| 391, 392 | `viewer_restricted` RESTRICTIVE policies on `document_attachments` and `document_status_history` — they bound what a **logged-in `viewer`** can reach | **Already on production** ✓ |

Everything else in the range is either an assertion (0 DDL — nothing to be exposed to) or unrelated
to security (394, 396, 397, 401).

## 3.5 Verdict — Q3

**Production is missing the entire anon-hardening series. The four gates the brief names are the
least of it — the 24 fixes underneath them were never in the production set either.**

The exposure is dominated by one migration: **399 leaves 26 SECURITY DEFINER writer functions
callable without a login.** Every other item in Class A is a read leak; 399 is a write surface.

The ordering constraint from the dry-run still holds: gates before fixes cannot succeed, and several
come in fix-then-repair-the-gate pairs (381/382, 384/385, 386/387, 388/389). The series must run in
number order, whole.

> **Owner question Q3:** *"Run the 370–401 series in full before the allocation work, or after?"*
> — if the answer is "after", 399 alone should be pulled forward, because it is the only unauthenticated
> **write** surface in the set.

---

# Q4 — The five neutered functions

## 4.1 The five, named

Four carry the literal phrase *"product decision"*. The fifth (`recalculate_settlement_score`) uses
different wording, which is why a phrase search finds only four:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosrc ilike '%product decision%';
-- calculate_salesperson_collected_sales
-- post_receipt_accounting
-- recompute_employee_scores_on_receipt
-- update_customer_overdue_status
```

The fifth is corroborated by the earlier sweep (`docs/research/domain-functions-sweep-20260904.md:189-193`,
an uncommitted note by another agent) and confirmed by reading its body below.

| # | Function | Was supposed to do | The neutering line, quoted | Why | Migration |
|---|---|---|---|---|---|
| 1 | `update_customer_overdue_status(uuid)` | Derive `has_overdue` / `overdue_since` from unpaid invoices and upsert `customer_credit_profile` | `v_overdue_since := NULL;` | *"Overdue tracking will need a real source once it is rebuilt on sales_quotes; that is a product decision and is NOT silently introduced here."* | **331** `20260808210000_331_rewrite_invoice_readers.sql` |
| 2 | `recalculate_settlement_score(uuid)` | Score settlement punctuality from invoice due-dates, write `customer_credit_profile.settlement_score` | the loop is gone; `v_score INTEGER := 0;` then `v_score := GREATEST(-100, LEAST(100, v_score));` | *"Settlement dates live only on invoices today; rebuilding this on sales_quotes would be a new feature, not a migration."* | **331** |
| 3 | `calculate_salesperson_collected_sales(uuid,int)` | Return collected amount + invoice/receipt counts per salesperson | `SELECT p_employee_id, v_window, v_start, 0::numeric AS collected_amount, 0::int AS linked_invoice_count, 0::int AS qualifying_receipt_count;` | *"Not repointed at sales_quotes: that would turn a metric that has always read zero into a live number, which is a product decision, not a cleanup."* | **331** |
| 4 | `recompute_employee_scores_on_receipt()` *(trigger)* | Award employee score points when a receipt reaches approved/verified/confirmed/posted | the resolver loop is deleted; the body ends `RETURN COALESCE(NEW, OLD);` with no work done | *"Doing so would switch this trigger from 'never fires' to 'fires for 50 live quotes' … That is a product decision, not a side effect of a cleanup migration."* | **330** `20260808200000_330_receipt_triggers_drop_invoice_branches.sql` |
| 5 | `post_receipt_accounting(uuid,uuid)` | Post the journal entry **and** allocate the receipt against invoices, marking them paid/partially_paid | the allocation loop is removed; `v_invoice_updates jsonb := '[]'::jsonb;` is returned unchanged | *"Whether settling a receipt should move a sales_quotes row is a product decision, deliberately not smuggled into a decoupling migration."* | **327** `20260808170000_327_decouple_post_receipt_accounting_from_invoices.sql` |

**Only #5 still does real work.** Its journal entry, `increase_credit` call and receipt posting are
untouched; only the invoice-allocation half was removed, and `invoice_updates` is kept in the
response as an always-empty array because the accountant UI writes it into an audit diff.

## 4.2 What depends on them staying off — measured

```sql
-- callers inside the database
select proname from pg_proc … where prosrc ilike '%update_customer_overdue_status%'
                                and proname <> 'update_customer_overdue_status';
--   (no rows)
select proname from pg_proc … where prosrc ilike '%recalculate_settlement_score%' …;
--   (no rows)

-- triggers
trg_payment_receipts_recompute_employee_score       on payment_receipts       -> recompute_employee_scores_on_receipt
trg_payment_receipt_links_recompute_employee_score  on payment_receipt_links  -> recompute_employee_scores_on_receipt_link
```

`grep -rn` over `src/` and `e2e/`: the only mentions of `update_customer_overdue_status` and
`recalculate_settlement_score` are in
`e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts:56,63` — i.e. as *names in a
revoke-list assertion*, not as calls.

**Neither #1 nor #2 has a single caller anywhere.** Restoring their bodies would change nothing until
something invokes them. #4 is bound to a live trigger and fires today — it simply does nothing.

And the table they write is empty:

```sql
select count(*) … from customer_credit_profile;
-- credit_profile rows=0  has_overdue true=0  settlement_score<>0=0
```

## 4.3 Do the other four contradict restoring overdue? — from the bodies

**Read path — yes, restoring #1 changes live behaviour.** `has_overdue` is read by five functions:

```
calculate_customer_realtime_credit   create_sales_quote_with_items
get_customer_dynamic_credit          recompute_dynamic_capital_setting
run_daily_capital_allocation
```

and `create_sales_quote_with_items` blocks on it:

```sql
IF COALESCE(_credit.has_overdue, false) OR COALESCE(_credit.binding_constraint,'') = 'overdue' THEN
  IF p_quote_exception_type IS DISTINCT FROM 'overdue_salesperson_commitment' THEN
    RAISE EXCEPTION 'مشتری مانده معوق دارد. ثبت عادی پیش‌فاکتور مجاز نیست؛ …'
```

So the moment overdue becomes real, quote creation starts refusing — via the
`overdue_salesperson_commitment` exception route, which is the branch built on
`feature/quote-customer-picker-readonly` (Q2). **Q4 and Q2 meet here.**

**Write path — one genuine interaction, and it is not a contradiction:**

`update_customer_overdue_status` (#1) and `recalculate_settlement_score` (#2) both upsert
`customer_credit_profile` on the same conflict target `(customer_id)`. Their `DO UPDATE` clauses are
disjoint:

- #1 sets `has_overdue`, `overdue_since`, `last_overdue_check_at`
- #2 sets `settlement_score`, `last_overdue_check_at`

Only `last_overdue_check_at` is shared, and each merely stamps `NOW()`. **Neither can clear the
other's field on an UPDATE.** On an INSERT, the omitted columns take their declared defaults
(`has_overdue boolean default false`, `settlement_score integer default 0`), so a first-write race
would leave the other field at its default until the sibling runs — a staleness window, not a
contradiction.

One live hazard worth flagging: `customer_credit_profile.customer_person_id` is **NOT NULL** and
neither function supplies it. Both survive only because
`trg_customer_credit_profile_derive_person` (BEFORE INSERT OR UPDATE OF `customer_id`) fills it. If
that trigger is ever removed, both functions fail on insert.

**#3 and #5 are independent of overdue.** #3 returns a metric row and writes nothing. #5 writes
`journal_entries` / `journal_lines` / `payment_receipts.posting_status` and calls `increase_credit` —
it touches no overdue field. #4 writes `employee_score_events` — also no overdue field.

**And none of the four suppresses a credit check.** The credit check lives in
`create_sales_quote_with_items` and `get_customer_dynamic_credit`, both of which are fully live; what
is missing is not the check but its *input*. That is the whole shape of the problem: the guard works,
the data feeding it is hard-coded to "no overdue".

## 4.4 Verdict — Q4

**Five confirmed, all traced to migrations 327/330/331, all neutered for the same stated reason: the
`invoices` table was retired and nobody decided what should replace it.**

They are **independent in the write path** — no field is contested, no function suppresses another.
The one real coupling is a **read**: restoring #1 makes `has_overdue` live, and
`create_sales_quote_with_items` will immediately start refusing ordinary quotes for overdue
customers. With `customer_credit_profile` at 0 rows and no caller for #1, restoring the body alone
changes nothing — the restoration needs a **source** (which `sales_quotes` rows count as overdue) and
a **caller** (what recomputes it, and when).

> **Owner question Q4:** *"For overdue: which sales_quotes state counts as overdue, and what should
> recompute it — a trigger on receipt posting, or a nightly job?"*

---

# Q5 — The two 503s

## 5.1 What calls them, and how often

| Endpoint | Caller | Frequency | Returns when it works |
|---|---|---|---|
| `POST /rest/v1/rpc/is_user_online` | `src/hooks/presence/useIsOnline.ts:9`, rendered by `src/components/presence/OnlineDot.tsx:15`, mounted in `src/components/layout/AppHeader.tsx:47` (always, for the logged-in user) and `src/routes/_app.roles.tsx:117` (once per listed user) | **every 30 s** — `refetchInterval: 30_000`, `staleTime: 25_000` | `boolean` — `last_seen_at > NOW() - INTERVAL '5 minutes'` |
| `HEAD /rest/v1/profiles?select=id&status=eq.pending` | `src/components/layout/AppSidebar.tsx:147-150`, `enabled: isAdmin` | on mount / refocus, admins only | an exact count; 4 rows today (`active 26, inactive 6, rejected 5, pending 4`) |

## 5.2 What breaks for the user

- **`is_user_online` fails →** `useIsOnline` throws, `data` is `undefined`, and `OnlineDot` renders
  `online ? … : …` with `undefined` → the **grey** dot with `aria-label="آفلاین"`
  (`OnlineDot.tsx:18-24`). Everyone shows as permanently offline. Nothing else breaks: no toast, no
  error boundary. **Silent by construction.**
- **The pending count fails →** the query destructures `{ count }` and never inspects `error`
  (`AppSidebar.tsx:147-151`), so `count` is `undefined` and `count ?? 0` yields **0**. The
  "کاربران در انتظار تأیید" badge disappears. An admin sees *no pending users* when there are 4.
  `isPendingUsersError` is destructured at line 142 — worth checking whether it is rendered; the
  count itself resolves to a wrong-but-plausible zero regardless.

## 5.3 Cause — the database is excluded, measured

Neither can error in Postgres. Both probed under `BEGIN READ ONLY … ROLLBACK`:

```
anon,          real user            -> NULL          (no error)
authenticated, unknown uuid         -> NULL          (0 rows -> sql fn returns NULL)
anon           count(status=pending)-> 0             (no error)
authenticated-unknown  count        -> 0             (no error)
```

`is_user_online(_user_id uuid)` is `LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'`,
one `SELECT` over `profiles`. Grants: `anon=true authenticated=true service_role=true`. `profiles`
has `rls=true forced=false`, `anon SELECT=true`, `authenticated SELECT=true`, and five policies —
`users read own profile`, `admins read all profiles`, plus the RESTRICTIVE `viewer_restricted`. A
count is permitted; it simply returns 0 rows for a non-admin.

**On the test stack both endpoints are healthy at scale.** Full Kong access log:

```
is_user_online         : 71885 × 200   ·  6 × 499  ·  2 × 503
profiles?status=eq.pending : 18758 × 200 ·  5 × 499  ·  0 × 503
```

(499 = client closed the connection — a browser navigating away mid-poll. Harmless.)

The two 503s are informative:

```
172.18.0.1 - - [15/Aug/2026:05:22:18 +0000] "POST /rest/v1/rpc/is_user_online HTTP/1.1" 503 130 …
172.18.0.1 - - [16/Aug/2026:08:06:23 +0000] "POST /rest/v1/rpc/is_user_online HTTP/1.1" 503 130 …
```

Two isolated events a month ago, each a 130-byte Kong error body — the signature of **Kong unable to
reach its `rest` upstream at that instant**, not of a database or policy failure. Nothing in the
current logs corroborates a standing fault:

```
afrakala-lan-rest : 0 restarts; running; started 2026-09-03T11:15:36Z
                    "Listening on port 3000" · "Schema cache loaded 251 Relations … 350 Functions"
afrakala-lan-kong : 0 restarts; running; started 2026-08-27T06:23:12Z
                    grep -iE ' 503 |no healthy|upstream|error' over the last 400 lines -> no matches
```

## 5.4 Verdict — Q5

| Endpoint | Verdict |
|---|---|
| `rpc/is_user_online` | **Degraded feature — the presence indicator.** Every avatar shows grey/offline in `AppHeader` and on `/roles`. No data loss, no functional block. |
| `profiles?status=eq.pending` | **Symptom of something larger — and the more serious of the two.** It is not cosmetic: the failure resolves to `0`, so an administrator is shown *"no users awaiting approval"* when users are in fact waiting. New staff sit unapproved with nothing on screen to say so. |

**Cause: cannot be determined read-only, and the reason is specific.** Production was not contacted,
as instructed. What the evidence *does* establish, and it narrows the field sharply:

- **Not the SQL** — neither statement errors, under either role, on this database.
- **Not the RLS policies** — the count is permitted and returns cleanly.
- **Not the application code** — the identical code path returns 200 on the test stack 90,643 times.
- **Therefore upstream of Postgres, and specific to production's runtime** — Kong reaching PostgREST,
  or PostgREST reaching its connection pool. The only 503s ever recorded on the test box are exactly
  that signature, and both landed while PostgREST was cycling.

One difference between the two machines is worth checking first: **production's database is named
`postgres`, not `afrakala`** (`CLAUDE.md`, "Working environments"). A `PGRST_DB_URI` still pointing
at `afrakala` there would leave PostgREST unable to connect and Kong answering 503 for every request
it proxies.

To settle it, on the production laptop, read-only:

```powershell
docker logs --tail 200 afrakala-lan-rest
docker logs --tail 200 afrakala-lan-kong | Select-String " 503 "
docker inspect afrakala-lan-rest --format "{{.RestartCount}} {{.State.Status}} {{.State.Health.Status}}"
```

If PostgREST is restart-looping or its log shows a connection failure, the cause is settled and the
fix is configuration, not code. If PostgREST is healthy and Kong still returns 503, the fault is in
Kong's rendered declarative config (`deploy/lan/docker-compose.yml:274-323` renders
`kong.rendered.yml` from `../supabase/volumes/api/kong.yml` at container start).

> **Owner question Q5:** *"Shall I write a read-only production diagnostic script for you to run on
> the laptop yourself — yes or no?"* (I will not connect to `192.168.170.10`.)

---

## Not verified

- **Anything on production.** Not contacted. Every production row in Q3's table is inferred from the
  migration text; every Q5 cause is a hypothesis with the database, the policies and the application
  code excluded by measurement.
- **Whether Asan actually rejects the sheet name `Asan`.** Only the owner importing a file with
  `Sheet1` can settle that. The `t="str"` finding is independent of it and is measured.
- **Whether `AppSidebar` surfaces `isPendingUsersError` in the UI.** I read the query
  (`AppSidebar.tsx:139-153`) but did not trace the badge's render path; the `count ?? 0` behaviour is
  read from the source and is certain.
- **Migration 393's eight `ALTER DEFAULT PRIVILEGES` statements** were read, not executed anywhere
  observable — this database's default ACLs match their intended end state, but 373 also contributes
  and I did not separate the two.
- **PR #383's specs were not run.** No test command was executed; the reasoning about what they can
  and cannot catch is from reading the spec plus the measured fact that `XLSX.read` normalises
  `t="str"` to `t="s"`.

---

## Report status: **COMPLETE** — Q1 ✅ Q2 ✅ Q3 ✅ Q4 ✅ Q5 ✅ (cause of Q5 explicitly bounded, see above)
