# REPORT — salesdesk-9-fixes

English final mission report per `EXECUTION-PROMPT.md` §12.  
Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes`  
Base: `feature/sales-desk` @ `c1ea61a1` · Final product on 3100: `APP_GIT_SHA=0c6eeb08` (healthy, HTTP 200) — `evidence/W4/deploy-summary.txt`.  
Author: W4-DOC (docs only) · Critic Wave 4: overall **CONFIRM** — `evidence/W4/critic.md`.

## Expected vs actual — every action row (§5)

### Wave 1 — tickets and purchases

| Row | Node | Class | Expected (summary) | Actual | Status |
|-----|------|-------|--------------------|--------|--------|
| A1 | N22 | FIX | Show «ایجاد کننده», «مسئول», «تاریخ ثبت» (Jalali/Tehran) on ticket detail + list | DONE — `evidence/W1/ACCEPTANCE.md`, `tickets-ui.md` | DONE |
| A2 | N23 | EXTEND | Sections «در حال اجرا» / «بسته شده»; «تاریخ بسته شدن» via `completed_at`; «بستن»/«بازگشایی» | DONE — W1 ACCEPTANCE + mig 562 | DONE |
| A3 | N24 | BUILD | Ticket history table + «سابقه» timeline | DONE — mig 560 `work_item_events` | DONE |
| A4 | N25,N26 | FIX | Supplier required; code `SUPPLIER_REQUIRED` → «تأمین‌کننده الزامی است» | DONE — mig 561 | DONE |
| A5 | N25 | EXTEND | «+ تأمین‌کنندهٔ جدید» quick-create | DONE — W1 ACCEPTANCE | DONE |
| A6 | N27 | EXTEND | Filter «بدون تأمین‌کننده»; UI count = SQL | DONE — W1 ACCEPTANCE | DONE |

### Wave 2 — calls

| Row | Node | Class | Expected | Actual | Status |
|-----|------|-------|----------|--------|--------|
| B1 | N1 | FIX | Multi-extension ring → one card | DONE — `evidence/W2/ACCEPTANCE.md` | DONE |
| B2 | N3 | EXTEND | «مدت زمان نمایش پنجره تماس (ثانیه)»; «فقط تماس‌های داخلی خودم»; «فقط تماس‌های مربوط به خودم» | DONE — mig 563; residual medium TOCTOU noted in HANDOFF | DONE |
| B3 | N2 | FIX | Call grouping key stability | DONE — W2 self-check / ACCEPTANCE | DONE |
| B4 | N4,N5 | FIX+BUILD | Draft per call; switcher; no discard | DONE — fix `b1cc9a88`; W2 ACCEPTANCE | DONE |
| B5 | N6 | CONNECT | «افزودن معامله» from call with customer + note linked | DONE — mig 564 `deal_id`; W2 ACCEPTANCE | DONE |

### Wave 3 — deals

| Row | Node | Class | Expected | Actual | Status |
|-----|------|-------|----------|--------|--------|
| C1 | term | EXTEND | Desk/popup «افزودن معامله» (not «ثبت درخواست») | DONE — `evidence/W3/ACCEPTANCE.md`; `c1-strings.md` | DONE |
| C2 | N7 | FIX | «مسئول معامله» required (UI+zod+trigger); empty default | DONE after zod `c4bcafe9`; mig 565; critic REJECT→CONFIRM | DONE |
| C3 | N8 | EXTEND | «ایجاد کننده معامله» read-only | DONE — `QuickRequestForm.tsx:289-290` | DONE |
| C4 | N9 | EXTEND | View «کارهای من»; notify «من مسئول شدم» | DONE — mig 570 | DONE |
| C5 | N10 | BUILD | Report «معاملات ثبت‌شده برای دیگران» (Tehran day) | DONE — mig 571; module `sales-deals-for-others` | DONE |
| C6 | N11–12 | CONNECT+BUILD | «محصولات درخواستی»; search «287»→X287 | DONE — mig 568 | DONE |
| C7 | N13 | EXTEND | «جاری»/«موفق»/«ناموفق»; «موفق شد»/«ناموفق شد»; won/lost_at | DONE — mig 566 | DONE |
| C8 | N14 | BUILD+CONNECT | Lost reasons; «دلیل شکست را انتخاب کنید»; «سایر» | DONE — mig 567; modules deal-lost-* | DONE |
| C9 | N15 | CONNECT | «ایجاد پیش‌فاکتور» draft + «پیش‌فاکتورها» | DONE — mig 569 | DONE |

### Wave 4 — activities and follow-up (ADR-4)

| Row | Node | Class | Expected | Actual | Status |
|-----|------|-------|----------|--------|--------|
| D2 | N21 | BUILD | `sales_activity_types` = «یادداشت ساده» + Didar 1–17; hex round-trip | 18/18 PASS — `orch-d2-reverify.txt`; mig 572; `355c93ec` | DONE |
| D1 | N16 | EXTEND | Activity columns; owner=`salesperson_id`; map call/note without changing `kind` | cols + note→«یادداشت ساده» — `orch-d1-reverify.txt`; mig 573; `9b557dcd` | DONE |
| D3 | N17 | BUILD | «این فعالیت انجام شده» → «نتیجه‌ی فعالیت خود را یادداشت کنید»; «این فعالیت انجام شد»; «ذخیره و ایجاد فعالیت دیگر»; owner-only; revert | UI/TS done — `1b554e94`; critic CONFIRM + FINDING (no RLS trigger) | DONE |
| D4 | N18 | BUILD | Page «فعالیت‌ها»; buckets «گذشته تا امروز»…«تاریخ دیگر»; filters «انجام نشده \| انجام شده \| همه فعالیت ها»; red badge via `tehran_today` | page + RPC — `e90e8d83`; mig 574 | DONE |
| D5 | N19 | BUILD | Yellow/red/green/grey icons; filter «معاملاتی که فعالیتی روی آن‌ها نیست» | `MyWorkDeals` + `FollowUpTrafficLightIcon` — `9ae0a932` | DONE |
| D6 | N20 | BUILD | «به تعویق انداختن» keeps original; «افزودن یادآور برای فعالیت» with time; no pg_cron | postpone+materialize PASS; reminder NOT BLOCKED — `5cda486e`; mig 575 | DONE |
| D7 | N9 | EXTEND | «فعالیت‌های امروز و عقب‌افتاده» in «کارهای من» | `MyWorkDeals.tsx:215` — `9ae0a932` | DONE |

## BLOCKED / SKIPPED rows

**None.** No action row (§5 A1–A6, B1–B5, C1–C9, D1–D7) was recorded as BLOCKED or SKIPPED in wave HANDOFF closures.  
Wave 0 `worktrees-overlap.md` *recommended* SKIPPED for B/C/D pending RTL integrate; orchestrator chose cherry-pick/`aa63de1c` keep HEAD instead — rows were implemented (HANDOFF «Decisions taken without the owner»).  
N28 (Google Sheet) and N31 (pricing-queue worker) are **deferred** per §3.12 — not mission action rows and not counted as BLOCKED/SKIPPED.

## Decisions taken without the owner

| Decision | Reason / evidence |
|----------|-------------------|
| Cherry-pick `aa63de1c` / keep HEAD (RTL overlap) | Avoid blind SKIPPED of B/C/D — `evidence/W0/worktrees-overlap.md`; HANDOFF |
| W2 B2 medium TOCTOU residual accepted | Least invasive; recorded in HANDOFF |
| W3 C2: add zod after critic REJECT | Matches §5 C2 UI+zod+trigger — `critic-c2-rereview.md` |
| W4 D1: reuse `deal_id` from 564; map kinds without changing `kind`; copy `next_follow_up_at` | CONTRACTS / HANDOFF; `d1-verify.txt` |
| W4 D3 owner-only in TS/UI only (no new RLS trigger) | Critic FINDING Medium; row still CONFIRM — `critic.md` |
| W4 D6: read-time `materialize_due_activity_reminders` + bell poll; columns in 575 | §5 D6 forbids pg_cron; `CONTRACTS.md`; reminder NOT BLOCKED |

## What was not verified

- Owner cold-browser execution of `evidence/W1`–`W4/ACCEPTANCE.md` Persian scripts.
- Live `kind=call` activity-type backfill (live count 0) — `critic.md`.
- DB trigger enforcing owner-only on `done_at`/`result_note` — absent by design residual — `critic.md`.
- Full visual-regression suite beyond wave smoke / spot checks.
- Literal equality of 3100 `APP_GIT_SHA` with worktree HEAD after later docs-only commits (product tip remains `0c6eeb08` — `deploy-summary.txt` / `critic.md` Low).
- Some critic/orch probe files may remain untracked in the worktree ([D-1]) — presence on disk cited where read.

## Node status N1–N27, N29, N30 (N28/N31 deferred)

| Node | Research baseline (FINDINGS) | Mission outcome |
|------|------------------------------|-----------------|
| N1 | EXISTS-BROKEN multi-ext / no cross-tab | Addressed Wave 2 B1 — DONE |
| N2 | EXISTS-PARTIAL linkedid index | Addressed Wave 2 B3 — DONE |
| N3 | EXISTS-PARTIAL TTL hardcoded | Addressed Wave 2 B2 — DONE |
| N4 | EXISTS-BROKEN draft discard | Addressed Wave 2 B4 — DONE |
| N5 | ABSENT per-call draft | Addressed Wave 2 B4 — DONE |
| N6 | EXISTS-PARTIAL popup deal | Addressed Wave 2 B5 + C1 label — DONE |
| N7 | EXISTS-PARTIAL optional salesperson | Addressed Wave 3 C2 — DONE |
| N8 | EXISTS-PARTIAL author not shown | Addressed Wave 3 C3 — DONE |
| N9 | EXISTS-PARTIAL no «میز کار»/my-work | Addressed Wave 3 C4 + Wave 4 D7 — DONE |
| N10 | ABSENT creator×date report | Addressed Wave 3 C5 — DONE |
| N11 | NOT-CONNECTED product search | Addressed Wave 3 C6 — DONE |
| N12 | ABSENT items table | Addressed Wave 3 C6 mig 568 — DONE |
| N13 | EXISTS-PARTIAL outcomes | Addressed Wave 3 C7 — DONE |
| N14 | EXISTS-PARTIAL lost reasons | Addressed Wave 3 C8 — DONE |
| N15 | NOT-CONNECTED quotes↔deals | Addressed Wave 3 C9 — DONE |
| N16 | EXISTS-PARTIAL tasks vs interactions | Activities on `sales_interactions` (ADR-4) Wave 4 D1 — DONE; `tasks` untouched — `critic.md` |
| N17 | ABSENT done/result flow | Addressed Wave 4 D3 — DONE |
| N18 | ABSENT activities page | Addressed Wave 4 D4 — DONE |
| N19 | ABSENT traffic lights | Addressed Wave 4 D5 — DONE |
| N20 | ABSENT postpone/reminder | Addressed Wave 4 D6 — DONE |
| N21 | ABSENT activity types | Addressed Wave 4 D2 — DONE |
| N22 | EXISTS-BROKEN ticket fields UI | Addressed Wave 1 A1 — DONE |
| N23 | EXISTS-PARTIAL open-only board | Addressed Wave 1 A2 — DONE |
| N24 | ABSENT work history | Addressed Wave 1 A3 — DONE |
| N25 | EXISTS-BROKEN «نامشخص» supplier | Addressed Wave 1 A4/A5 — DONE |
| N26 | ABSENT supplier trigger | Addressed Wave 1 A4 — DONE |
| N27 | EXISTS-WORKS null supplier count | Filter Wave 1 A6 — DONE |
| N28 | ABSENT Google Sheets | **Deferred** §3.12 — out of mission |
| N29 | EXISTS-WORKS pricing workbench | Unchanged control surface (W0 baseline) — not a fix row |
| N30 | EXISTS-WORKS sheet reachability | Unchanged — not a fix row |
| N31 | EXISTS-PARTIAL pricing-queue cron | **Deferred** §3.12 — out of mission |

## Migrations (order) + revert scripts

| Version | File | Wave/row | Revert |
|---------|------|----------|--------|
| 20260921220000 | 560_work_item_events | W1 A3 | `revert/` (W1 set; see mission revert dir) |
| 20260921220100 | 561_purchases_require_supplier | W1 A4 | W1 revert set |
| 20260921220200 | 562_work_items_completed_at_closed | W1 A2 | W1 revert set |
| 20260921230000 | 563_user_caller_id_settings_display | W2 B2 | `revert/563_user_caller_id_settings_display.sql` |
| 20260921230100 | 564_sales_interactions_deal_id | W2 B5 | `revert/564_sales_interactions_deal_id.sql` |
| 20260922040000 | 565_sales_interactions_responsible_required | C2 | `revert/565_…` |
| 20260922040100 | 566_sales_interactions_won_lost_at | C7 | `revert/566_…` |
| 20260922040200 | 567_deal_lost_reasons | C8 | `revert/567_…` |
| 20260922040300 | 568_sales_interaction_items | C6 | `revert/568_…` |
| 20260922040400 | 569_sales_quotes_interaction_id | C9 | `revert/569_…` |
| 20260922040500 | 570_sales_interaction_assigned_title | C4 | `revert/570_…` |
| 20260922040600 | 571_role_permissions_salesdesk_w3 | C5/C8 | `revert/571_…` |
| 20260922050000 | 572_sales_activity_types | D2 | `revert/572_sales_activity_types.sql` |
| 20260922050100 | 573_sales_interactions_activity_fields | D1 | `revert/573_sales_interactions_activity_fields.sql` |
| 20260922050200 | 574_role_permissions_sales_activities | D4 | `revert/574_role_permissions_sales_activities.sql` |
| 20260922050300 | 575_activity_reminder_fields | D6 | `revert/575_activity_reminder_fields.sql` |

LAN applied Wave 4 versions: `20260922050000` (572), `20260922050100` (573), `20260922050200` (574), `20260922050300` (575) — orchestrator probe + `deploy-summary.txt` / `migration-ledger.md`.

## Product commits (Wave 4) and final 3100 SHA

| Piece | SHA |
|-------|-----|
| D2 | `355c93ec` |
| D1 | `9b557dcd` |
| D3 | `1b554e94` |
| D4 | `e90e8d83` |
| D5+D7 | `9ae0a932` |
| D6 | `5cda486e` |
| FE tip / 3100 | `0c6eeb08` |

Gates: typecheck error count 74 (`tsc-after-w4-fe.txt`); compose safety PASS; playwright smoke PASS (`deploy-summary.txt`).

## Owner test artifacts

- `evidence/W1/ACCEPTANCE.md` — present
- `evidence/W2/ACCEPTANCE.md` — present
- `evidence/W3/ACCEPTANCE.md` — present
- `evidence/W4/ACCEPTANCE.md` — present (this close)
- Self-checks: `verify/W2-selfcheck.md`, `W3-selfcheck.md`, `W4-selfcheck.md`
- Ship later: `PRODUCTION-NOTES.md` (DOC does **not** merge or deploy prod)

MISSION COMPLETE
