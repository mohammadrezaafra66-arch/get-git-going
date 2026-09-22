# W3 self-check — fresh eyes (C1–C9)

Derived from `EXECUTION-PROMPT.md` §3 / §5 Wave 3 / §6 (and §9 acceptance script).  
Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes`  
Measured: 2026-09-22 (DOC) · product tip ancestors: `bc10ec3f` (FE C1–C9), `c4bcafe9` (C2 zod) · live `APP_GIT_SHA=42392d3f` (`docker exec afrakala-lan-web printenv APP_GIT_SHA`, exit 0).  
Method: one **check** + one **refutation attempt** per row before treating builder claims as closed; RESULTS from repo greps/reads + `evidence/W3/*`.

Legend: **PASS** = claim supported by cited artifact/code · **FAIL** = claim unsupported or contradicted.

---

## Matrix

| Row | Check (from §5/§6) | Refutation attempt | RESULT |
|-----|--------------------|--------------------|--------|
| C1 | «ثبت درخواست»→«افزودن معامله» فقط میز فروش + پاپ‌آپ | اگر هنوز در sales-desk «ثبت درخواست» بماند | **PASS** |
| C2 | خالی پیش‌فرض + zod uuid + trigger `RESPONSIBLE_REQUIRED` + backfill | اگر zod نباشد / `__me__` برگردد / NULL قبول شود | **PASS** (پس از `c4bcafe9`) |
| C3 | «ایجاد کننده معامله» فقط‌خواندنی + ستون/فیلتر | اگر Input قابل ویرایش باشد | **PASS** |
| C4 | تب «کارهای من» + عنوان اعلان «من مسئول شدم» | اگر عنوان قدیم در تابع بماند | **PASS** |
| C5 | گزارش author≠salesperson بر روز تهران + `role_permissions` | اگر timezone محلی باشد / ماژول نباشد | **PASS** |
| C6 | «محصولات درخواستی» + جست‌وجوی `287`→X287 | اگر ILIKE نباشد / محصول X287 نباشد | **PASS** |
| C7 | برچسب جاری/موفق/ناموفق؛ `won_at`/`lost_at`؛ CHECK ثابت | اگر CHECK عوض شده یا kanban باشد | **PASS** |
| C8 | `deal_lost_reasons` + دیالوگ + `LOST_REASON_REQUIRED` | اگر lost بدون دلیل قبول شود | **PASS** |
| C9 | «ایجاد پیش‌فاکتور» draft + `interaction_id` + مسئول | اگر status غیر draft / لینک نباشد | **PASS** |

---

## C1 — detail

**Check:** §5 C1 — rename فقط sales desk + inbound popup؛ credit/purchase نگه دارند «ثبت درخواست».

**Evidence:**
- Desk/popup strings: `QuickRequestForm.tsx` (`submitLabel = "افزودن معامله"`, CardTitle)، `CallerInboundPopup.tsx:588,604,631` — DOC grep 2026-09-22 (E1).
- List before→after: `evidence/W3/c1-strings.md` (E1).
- Critic: **CONFIRM** — `evidence/W3/critic.md` (on disk; see Risks if untracked).

**Refutation:** grep `ثبت درخواست` under `src/components/sales-desk` — **none** (DOC). Credit still has it: `_app.sales.credit-requests.tsx:235` (E1).

**RESULT: PASS**

---

## C2 — detail

**Check:** §5 C2 — empty default؛ UI+**zod**+trigger؛ backfill NULL→`author_id` (W0 YES).

**Evidence:**
- Empty default: `QuickRequestForm.tsx:72-73` `useState<string>("")` — no `__me__` value (DOC grep; only comment mentions `__me__`) (E1).
- Zod: `src/lib/sales-desk/schema.ts:19-23` `.min(1).uuid`; form+lib parse — `critic-c2-rereview.md` + DOC read (E1/E2).
- Trigger+UPDATE NULL: `critic-c2-upd.txt` / `critic-c2-rereview-insert.txt` NOTICE `RESPONSIBLE_REQUIRED` (E3 artifacts on disk).
- Backfill YES: `evidence/W0/backfill-condition-0.6.md` verdict `YES_BACKFILL`; 3 ids in `evidence/W3/c2-backfill-ids.txt` (E1).
- Critic first pass **REJECT** (no zod) then re-review **CONFIRM** after `c4bcafe9` — `critic.md` + `critic-c2-rereview.md`.

**Refutation:** empty `salespersonId` via zod unit — fails with «مسئول معامله الزامی است» (`critic-c2-zod-unit.txt`, 7 pass) (E3). DB INSERT/UPDATE NULL still blocked (E3).

**RESULT: PASS**

---

## C3 — detail

**Check:** §5 C3 — «ایجاد کننده معامله» read-only on form+view؛ list column + author filter.

**Evidence:**
- Form: `QuickRequestForm.tsx:289-290` `Label` + `Input … readOnly disabled` (DOC read) (E1).
- Critic cites detail+list: `deals.$dealId.tsx`, `MyWorkDeals.tsx` — `critic.md` (E2 from critic).

**Refutation:** look for editable author write on form — only read-only Input (DOC).

**RESULT: PASS**

---

## C4 — detail

**Check:** §5 C4 — view «کارهای من»؛ notify title «من مسئول شدم».

**Evidence:**
- Tab/view: `_app.operations.sales-desk.tsx:66,88` «کارهای من»; `MyWorkDeals.tsx` (DOC grep) (E1).
- Notify title live pos 781: `critic-db-probe.txt` `notify_title_pos` / mig `570` (E3 artifact).
- Migration file: `supabase/migrations/20260922040500_570_sales_interaction_assigned_title.sql` (E1); revert `revert/570_sales_interaction_assigned_title.sql`.

**Refutation:** if old title remained, `title_pos` would be absent — probe shows 781 (E3).

**RESULT: PASS**

---

## C5 — detail

**Check:** §5 C5 — report author≠salesperson by Tehran day؛ `role_permissions` module.

**Evidence:**
- Report: `_app.operations.sales-desk_.deals-for-others.tsx:30-36` `timeZone: "Asia/Tehran"`; title «معاملات ثبت‌شده برای دیگران» (DOC read/grep) (E1).
- Module key in `CONTRACTS.md` Routes table: `sales-deals-for-others` (E1).
- Mig 571 + live rows: `critic-db-probe.txt` / `c5-c8-apply-571.txt` (E3 artifacts).
- Critic: **CONFIRM** — `critic.md`.

**Refutation:** local-day grouping — contradicted by explicit `Asia/Tehran` (E1).

**RESULT: PASS**

---

## C6 — detail

**Check:** §5 C6 — block «محصولات درخواستی»؛ probe «287» finds X287.

**Evidence:**
- UI: `RequestedProductsBlock.tsx` Label «محصولات درخواستی» (DOC grep) (E1).
- Products: `c6-product-287.txt` names containing `X287` for term-related rows (E3).
- ILIKE in search fn: `critic-c6-c9-probe2.txt` `has_ilike=t`; `critic-c6-fn-snip.txt` (E3).
- Critic: **CONFIRM**.

**Refutation:** prove 287 cannot match X287 — rejected by ILIKE `%term%` + live product rows with «مدل X287» (E3).

**RESULT: PASS**

---

## C7 — detail

**Check:** §5 C7 — labels جاری/موفق/ناموفق؛ buttons موفق شد/ناموفق شد؛ `won_at`/`lost_at`؛ CHECK unchanged؛ no kanban.

**Evidence:**
- Buttons: `OutcomeButtons.tsx:93-102` «موفق شد» / «ناموفق شد» (DOC grep) (E1).
- Columns live: `critic-db-probe.txt` lists `won_at`, `lost_at` (E3).
- CHECK unchanged: `critic-db-probe.txt` `open,won,lost,cancelled,done` (E3).
- No kanban under `src/components/sales-desk` — DOC grep zero matches (E1).
- Mig: `20260922040100_566_sales_interactions_won_lost_at.sql` (E1).

**Refutation:** CHECK altered or kanban present — neither found (E1/E3).

**RESULT: PASS**

---

## C8 — detail

**Check:** §5 C8 — seed «سایر»؛ settings؛ lost dialog؛ `LOST_REASON_REQUIRED`؛ report.

**Evidence:**
- Seed hex live: `critic-db-probe.txt` `d8b3d8a7db8cd8b1` (E3).
- Dialog: `LostReasonDialog.tsx` title «دلیل شکست را انتخاب کنید» (DOC grep) (E1).
- Settings route: `_app.settings.deal-lost-reasons.tsx` (E1).
- Error map: `errors.ts` `LOST_REASON_REQUIRED` → «دلیل شکست را انتخاب کنید» (E1).
- Critic roll-back probe NOTICE `C8_OK LOST_REASON_REQUIRED` — `critic.md` / `critic-db-probe.txt` (E3).
- Modules: `deal-lost-reasons`, `deal-lost-report` in `CONTRACTS.md` (E1).

**Refutation:** lost without reason succeeds — probe raises `LOST_REASON_REQUIRED` (E3).

**RESULT: PASS**

---

## C9 — detail

**Check:** §5 C9 — «ایجاد پیش‌فاکتور»؛ `interaction_id`؛ tab «پیش‌فاکتورها»؛ draft + salesperson=responsible.

**Evidence:**
- Button/tabs: `deals.$dealId.tsx:109,171-172` (DOC grep) (E1).
- Column+default draft: `critic-c6-c9-probe2.txt` `status` default `'draft'::sales_quote_status`; `interaction_id` present (E3).
- Mig: `20260922040400_569_sales_quotes_interaction_id.sql` (E1).
- Critic: **CONFIRM** — FE patches `salesperson_id` after create (`critic.md`).

**Refutation:** non-draft default — contradicted by column_default draft (E3).

**RESULT: PASS**

---

## Cross-gates (not a §5 row, but §5 Cross / §9)

| Gate | RESULT | Source |
|------|--------|--------|
| Typecheck ≤74 | **PASS** | `evidence/W3/tsc-ops.txt` and `evidence/W3/critic-tsc.txt`: DOC count `error TS` = **74** each |
| Migrations 565–571 on DB | **PASS** | `critic-db-probe.txt` versions `20260922040000`…`20260922040600` (7 rows) |
| 3100 SHA | **PASS** | `docker exec afrakala-lan-web printenv APP_GIT_SHA` → `42392d3f` (exit 0); `app-git-sha-a2.txt`; health `healthy` |
| Scoring/pricing untouched | **PASS** (via critic) | `critic.md` Cross CONFIRM — `git diff` name-only claim; DOC did not re-run full diff this turn |

---

## Residual notes (not FAIL for wave close)

- Critic artifacts `evidence/W3/critic.md`, `critic-c2-rereview.md`, and several probe `*.txt`/`*.sql` were **untracked** in `git status --porcelain` at DOC measure time — contents were read from disk for this self-check; commit ownership is W3-CRITIC’s, not W3-DOC ([D-1]).
- Critic noted stale e2e expectations in `e2e/business-flows/sales-desk-9.spec.ts` still expecting «ثبت درخواست» / null salesperson — out of product AC (`critic.md` یافته‌ها).
- Owner cold-browser ACCEPTANCE not run by DOC — see `evidence/W3/ACCEPTANCE.md`.
