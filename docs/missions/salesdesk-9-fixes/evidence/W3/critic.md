# W3 Critic — salesdesk-9-fixes C1–C9

**Role:** `dev-code-critic` (independent; no builder reports as evidence)  
**Worktree:** `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
**Branch:** `feature/salesdesk-9-fixes`  
**Product commit reviewed:** `bc10ec3fd8da5b7cddaf46353eabb8b48f10d874` (`feat(sales-desk): موج ۳ UI — C1 تا C9 میز فروش`)  
**HEAD at critic close:** `83fa3c661d08779569ef508071dd0044137075d0` (docs-only W3-OPS commits after product tip; `bc10ec3f` still ancestor — [D-1] noted)  
**Measured:** 2026-09-22 (UTC) · deadline 2026-09-22T05:45:00Z  
**Product code modified by critic:** none

---

## معیارهایی که از خواسته استخراج کردم (قبل از خواندن توضیح نویسنده)

| ID | Acceptance (from EXECUTION-PROMPT §3/§5/§6 + owner decisions) |
|----|----------------------------------------------------------------|
| C1 | Label «ثبت درخواست»→«افزودن معامله» only on sales desk + inbound popup; credit/purchase keep «ثبت درخواست» |
| C2 | «مسئول معامله» empty default; mandatory UI **+ zod** + trigger `RESPONSIBLE_REQUIRED` for `kind=request`; backfill NULL→`author_id` |
| C3 | «ایجاد کننده معامله» read-only on form+view; list column + author filter |
| C4 | View «کارهای من»; notify title «من مسئول شدم» on assign |
| C5 | Report author≠salesperson by Tehran day; `role_permissions` module |
| C6 | «محصولات درخواستی» + `sales_interaction_items`; search term `287` finds X287 |
| C7 | Labels جاری/موفق/ناموفق; buttons موفق شد/ناموفق شد; `won_at`/`lost_at`; status CHECK unchanged; no kanban |
| C8 | `deal_lost_reasons` seed «سایر»; settings; lost dialog; `LOST_REASON_REQUIRED`; report |
| C9 | «ایجاد پیش‌فاکتور»; `sales_quotes.interaction_id`; tab «پیش‌فاکتورها»; draft + `salesperson_id`=responsible |
| Cross | Do not edit scoring/`compute_employee_score` or pricing; typecheck ≤74 |

---

## بررسی هر معیار

| معیار | حکم | مسیر:خط / شاهد |
|-------|-----|----------------|
| **C1** | **CONFIRM** | Desk tab/title/button «افزودن معامله»: `_app.operations.sales-desk.tsx:67`, `QuickRequestForm.tsx:58,317`, `CallerInboundPopup.tsx:588,604,631`. Credit/purchase still «ثبت درخواست»: `_app.sales.credit-requests.tsx:235`, `PurchaseRequestForm.tsx:301`. |
| **C2** | **REJECT** | Empty default + UI guard: `QuickRequestForm.tsx:70-71,102-104,148-150`. Trigger+backfill migration `565` + live DB: INSERT NULL → `RESPONSIBLE_REQUIRED` (E3 `critic-db-probe.txt`); UPDATE NULL → same (E3 `critic-c2-upd.txt`); `still_null_request=0`. **Missing zod:** zero `import … from "zod"` under `src/lib/sales-desk` or `src/components/sales-desk`; `CreateSalesInteractionInput.salespersonId` still optional (`interactions.ts:25,58`). EXECUTION §5 C2 requires UI+**zod**+trigger. |
| **C3** | **CONFIRM** | Form read-only: `QuickRequestForm.tsx:286-287`. Detail view: `deals.$dealId.tsx:138-139`. List column+filter: `MyWorkDeals.tsx:180-198,263-266`. |
| **C4** | **CONFIRM** | Tab/view: `sales-desk.tsx:66,88`, `MyWorkDeals.tsx:2,118`. Notify title in mig `570` + live `title_pos=781` for «من مسئول شدم» hex (E3 `critic-db-probe.txt`). |
| **C5** | **CONFIRM** | Report filters `author_id !== salesperson_id`, groups by Tehran day: `deals-for-others.tsx:30-37,84-110`. Module+route: `registry.ts:601-604`, `roles.ts` Wave3 modules. Live `role_permissions` rows for `sales-deals-for-others` (E3). |
| **C6** | **CONFIRM** | UI block + table: `RequestedProductsBlock.tsx`, `items.ts`, mig `568`, live `to_regclass` present. Search path: `product-search.ts:17-27` → `search_product_ids` with name/sku/barcode `ILIKE '%'||term||'%'` (E3 `critic-c6-fn-snip.txt`). Products with «X287» in name exist for term 287 (E3 `critic-c6-c9-probe2.txt`). |
| **C7** | **CONFIRM** | Labels/buttons: `OutcomeButtons.tsx:93-102,141-152`; filter labels `MyWorkDeals.tsx:209-211`. Columns+trigger mig `566`; live CHECK still `open,won,lost,cancelled,done` (E3). No kanban under sales-desk (grep). |
| **C8** | **CONFIRM** | Seed «سایر» hex `d8b3d8a7db8cd8b1` live (E3). Settings route `_app.settings.deal-lost-reasons.tsx`. Dialog `LostReasonDialog.tsx`. Trigger+UI map `LOST_REASON_REQUIRED` (E3 C8 roll-back probe; `errors.ts:8`). Report `_app.sales.reports.deal-lost.tsx` + `deal-lost-report` perms (E3). |
| **C9** | **CONFIRM** | Button+tabs: `deals.$dealId.tsx:109,171-172`. Column live; `quotes.new.tsx` search `interactionId` + post-create patch `interaction_id` + `salesperson_id` (`:477-488`). Quote `status` DEFAULT `'draft'::sales_quote_status` (E3). |
| Cross scoring/pricing | **CONFIRM** | `git diff 16d8957a^..bc10ec3f --name-only` has no pricing/score paths; migrations 565–571 only add salesdesk objects. Live `compute_employee_score` still present (`src_len=13435`). |
| Typecheck ≤74 | **CONFIRM** | Independent `npx tsc -p tsconfig.json --noEmit` → **ERR_TS=74**, exit 2 (`critic-tsc.txt`). |

---

## تلاش‌های ابطال (حداقل یکی per row)

| Row | Refutation attempt | Result |
|-----|--------------------|--------|
| C1 | Grep `ثبت درخواست` under `src/components/sales-desk` and sales-desk route | **None** in desk/popup; only credit/purchase/stock-alert (allowed). Note: stale e2e `sales-desk-9.spec.ts:243` still expects «ثبت درخواست» — out of product AC but will fail CI if run. |
| C2 | Grep `__me__` default in sales-desk; hunt zod schema; UPDATE salesperson→NULL | No `__me__` in form. **Zod absent → REJECT.** UPDATE NULL correctly raises `RESPONSIBLE_REQUIRED`. |
| C3 | Look for editable author field | Only `readOnly disabled` Input; no author write path in form. |
| C4 | Check notify title still old string | Live function contains «من مسئول شدم» at pos 781. |
| C5 | Check report uses local day not Tehran | Uses `Intl… timeZone: "Asia/Tehran"` (`deals-for-others.tsx:30-36`). |
| C6 | Prove `287` cannot match X287 | Function uses `ILIKE '%'||v_norm||'%'` on name; rows with «مدل X287» exist. Service-role RPC probe fails `unauthenticated` (auth.uid null) — not a product defect. |
| C7 | Find CHECK altered or kanban | CHECK unchanged (E3). No sales-desk kanban. |
| C8 | Lost without reason succeeds | Rolled-back UPDATE→lost without reason → `LOST_REASON_REQUIRED` (E3). |
| C9 | Quote created non-draft / salesperson not patched | Column default is draft; FE patches `salesperson_id` from deal responsible after create. |
| Cross | Scoring/pricing touched in W3 commits | No matching paths in diff name-only. |

---

## اجرای واقعی (E3)

### Typecheck
```
npx tsc -p tsconfig.json --noEmit
→ EXIT=2  ERR_TS=74
artifact: evidence/W3/critic-tsc.txt
```

### DB (docker `afrakala-lan-db`, `psql-run.mjs`)
```
node …/psql-run.mjs evidence/W3/critic-db-probe.sql evidence/W3/critic-db-probe.txt
→ EXIT=0
  migrations 20260922040000 … 20260922040600 present (7)
  status CHECK unchanged
  seed سایر hex + notify title_pos=781
  role_permissions W3 modules present
  still_null_request=0
  NOTICE C2_OK RESPONSIBLE_REQUIRED
  NOTICE C8_OK LOST_REASON_REQUIRED

node …/psql-run.mjs evidence/W3/critic-c2-upd.sql … → EXIT=0  NOTICE C2_UPD_NULL_OK
node …/psql-run.mjs evidence/W3/critic-c6-c9-probe2.sql … → EXIT=0  X287 products + ILIKE fn + draft default
node …/psql-run.mjs evidence/W3/critic-c6-fn-snip.sql … → EXIT=0  search_product_ids body quoted
```

---

## یافته‌ها

| شدت | مسیر | چرا | شکست |
|-----|------|-----|------|
| **High (blocks C2)** | `src/lib/sales-desk/*`, `src/components/sales-desk/*` | EXECUTION C2 requires **zod** mandatory salesperson; none exists. Only ad-hoc UI throws + optional TS field + DB trigger. | API/helpers can still pass `salespersonId: null` until DB rejects; shared client schema contract unmet. |
| Med (out of AC product strings) | `e2e/business-flows/sales-desk-9.spec.ts:240-257` | Still expects «ثبت سریع درخواست» / «ثبت درخواست» and creates with `p_salesperson_id: null`. | E2E suite fails / wrong expectations after C1/C2. |
| Low | `quotes.new.tsx:477-488` | Link+salesperson applied in **second** UPDATE after create | If patch fails, orphan draft without `interaction_id` / wrong salesperson until retry. |

---

## توصیه‌های سلیقه‌ای (مانع پذیرش نیست)

- Add a shared zod (or equivalent) schema for `createSalesInteraction` and reuse in form + any other callers.
- Update e2e strings and stop probing NULL salesperson for request creates.
- Prefer passing `interaction_id` / responsible into create RPC if/when signature allows, instead of follow-up UPDATE.

---

## چه چیزی را نتوانستم بررسی کنم

- Authenticated end-to-end browser create of deal/quote (no cold session UI run this turn).
- Live `search_product_ids('287')` under a real `auth.uid()` (service_role/admin path raises `unauthenticated`); inferred from function body + product rows.
- End-to-end notification_queue insert on assign (title string verified in function def only).

---

## حکم کلی: **REJECT**

| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 |
|----|----|----|----|----|----|----|----|-----|
| CONFIRM | **REJECT** | CONFIRM | CONFIRM | CONFIRM | CONFIRM | CONFIRM | CONFIRM | CONFIRM |

**Overall REJECT** because C2’s required **zod** layer is absent despite UI+trigger+backfill being in place. Re-review after zod (or an explicit owner waiver of the zod clause) lands.

**C2 re-review (2026-09-22):** CONFIRM after `c4bcafe9` zod — see `critic-c2-rereview.md` (UI empty + zod uuid + trigger + Persian).
