# W4 self-check — fresh eyes (D2–D7)

Derived from `EXECUTION-PROMPT.md` §3 / §5 Wave 4 / §6 (and §9 acceptance script).  
Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes`  
Measured: 2026-09-22 (DOC) · product tip ancestors: `355c93ec`…`5cda486e` · live `APP_GIT_SHA=0c6eeb08` (`deploy-summary.txt`).  
Method: **before** treating builder evidence as closed, re-derive one **check** + one **refutation attempt** per row from §3/§5/§6; RESULTS from repo greps/reads + `evidence/W4/*`.

Legend: **PASS** = claim supported by cited artifact/code · **FAIL** = claim unsupported or contradicted.

---

## Matrix

| Row | Check (from §5/§6) | Refutation attempt | RESULT |
|-----|--------------------|--------------------|--------|
| D2 | `sales_activity_types` ۱۸ عنوان §6 + hex round-trip | اگر عنوان/hex mismatch | **PASS** |
| D1 | ستون‌های activity + map call/note بدون تغییر `kind` | اگر ستون غایب / kind عوض شده | **PASS** |
| D3 | لیبل‌های انجام/نتیجه/ذخیره+جدید؛ فقط owner؛ revert | اگر لیبل نباشد / بدون گارد owner | **PASS** (گارد TS؛ RLS FINDING جدا) |
| D4 | صفحه «فعالیت‌ها» + سطل‌ها/فیلترها + badge + `tehran_today` | اگر RPC بدون tehran / سطل غایب | **PASS** |
| D5 | چراغ زرد/قرمز/سبز/طوسی + فیلتر بدون‌فعالیت | اگر آیکون/فیلتر نباشد | **PASS** |
| D6 | تعویق نگه داشتن original؛ یادآور فقط با ساعت؛ بدون pg_cron | اگر original عوض شود / cron job باشد | **PASS** |
| D7 | «فعالیت‌های امروز و عقب‌افتاده» در کارهای من | اگر عنوان غایب | **PASS** |

---

## D2 — detail

**Check:** §5 D2 — seed Didar 17 + «یادداشت ساده»; round-trip hex.

**Evidence:**
- Migration file present: `supabase/migrations/20260922050000_572_sales_activity_types.sql` (DOC glob) (E1).
- Orch reverify: `orch-d2-reverify.txt` `count:18` `ok:18` `all_ok:true`; first title «یادداشت ساده»; last «فاکتورلاین» (E3).
- Commit: `355c93ec` — `git log -1` (E3).
- Critic: CONFIRM — `critic.md` (E2).

**Refutation:** expect any of 18 titles to fail hex — orch `all_ok:true` contradicts; critic hex mismatch attempt failed (`critic.md` تلاش‌های ابطال).

**RESULT: PASS** — path: `evidence/W4/orch-d2-reverify.txt`

---

## D1 — detail

**Check:** §5 D1 — columns `activity_type_id,due_at,due_has_time,original_due_at,done_at,result_note,deal_id`; map note→«یادداشت ساده» without changing `kind`.

**Evidence:**
- Orch: `orch-d1-reverify.txt` lists columns including `activity_type_id`…`result_note` (+ `deal_id`); `kind|count` note=2 request=4; title «یادداشت ساده»|2; `req_null|mapped_cn` 4|2 (E3).
- Migration: `20260922050100_573_…sql` (E1); commit `9b557dcd` (E3).
- Critic: D1 CONFIRM; call map live count=0 noted (E2).

**Refutation:** seek unexpected kinds or missing columns — orch shows only note/request; columns present. Live call=0 so call map not live-refuted (`critic.md`).

**RESULT: PASS** — path: `evidence/W4/orch-d1-reverify.txt`

---

## D3 — detail

**Check:** §5 D3 / §6 — «این فعالیت انجام شده» → «نتیجه‌ی فعالیت خود را یادداشت کنید»; buttons «این فعالیت انجام شد», «ذخیره و ایجاد فعالیت دیگر»; owner-only; revert به انجام‌نشده.

**Evidence:**
- Labels: `ActivityDoneControls.tsx:182` «این فعالیت انجام شده»; `:187` «نتیجه‌ی فعالیت…»; `:147` «بازگردانی به انجام نشده»; also «این فعالیت انجام شد» / «ذخیره و ایجاد فعالیت دیگر» in same component + `ActivityForm.tsx` (DOC rg) (E1).
- Owner guard: `src/lib/sales-desk/activities.ts:139-141` throws if `ownerId !== actorId` (E2).
- Commit: `1b554e94` (E3). Critic CONFIRM + FINDING RLS author may UPDATE (E2).

**Refutation:** claim «DB enforces owner-only» — **partially refuted** by critic policies (RLS allows author); UI/TS guard still present → row still PASS per critic verdict CONFIRM with FINDING.

**RESULT: PASS** — path: `src/lib/sales-desk/activities.ts:139-141` (+ `critic.md` FINDING)

---

## D4 — detail

**Check:** §5 D4 — page «فعالیت‌ها»; buckets «گذشته تا امروز»…«تاریخ دیگر»; filters «انجام نشده | انجام شده | همه فعالیت ها»; red count via `tehran_today`; `role_permissions`.

**Evidence:**
- Buckets/filters: `_app.operations.sales-desk_.activities.tsx:50-60,136-138` (DOC rg) (E1).
- RPC: `orch-rpc-reverify.txt` function `count_open_activities_due_today_or_overdue` body uses `public.tehran_today()` (E2).
- Badge: `AppSidebar.tsx:300` module `sales-activities`; `:308` RPC; `:438` `bg-destructive` (E1).
- Mig 574 + revert present (E1); commit `e90e8d83` (E3).

**Refutation:** RPC without tehran_today — contradicted by `orch-rpc-reverify.txt` lines 14–15.

**RESULT: PASS** — path: `evidence/W4/orch-rpc-reverify.txt` + `…activities.tsx:50-60`

---

## D5 — detail

**Check:** §5 D5 — yellow/red/green/grey on open deals in میز فروش/کارهای من; filter «معاملاتی که فعالیتی روی آن‌ها نیست».

**Evidence:**
- Colors/titles: `FollowUpTrafficLightIcon.tsx:5-16` (E1).
- Wiring + filter: `MyWorkDeals.tsx:3-4,336,355-365` (E1).
- Commit: `9ae0a932` (E3). Critic D5 CONFIRM (E2).

**Refutation:** icons only outside MyWorkDeals — critic notes wiring in MyWorkDeals (parent desk tab); filter string present (DOC rg).

**RESULT: PASS** — path: `src/components/sales-desk/MyWorkDeals.tsx:336`

---

## D6 — detail

**Check:** §5 D6 — «به تعویق انداختن» moves `due_at`, keeps `original_due_at`; «افزودن یادآور برای فعالیت» only with time; in-app poll; never pg_cron.

**Evidence:**
- Postpone: `activities.ts:174-195` — does not overwrite `original_due_at` when already set (E2); UI string in `ActivityDoneControls.tsx` (DOC rg) (E1).
- Reminder only with time: `activities.ts:208-209` (E2); label in `ActivityForm.tsx` (DOC rg).
- RPC `materialize_due_activity_reminders` — `orch-rpc-reverify.txt` / `activities.ts:494` (E1/E2).
- Critic postpone `POSTPONE_KEEP keep=t`; reminder `n=1 fired=t`; cron activity jobs=0 — `critic.md` (E3).
- Mig 575 + revert; commit `5cda486e` (E1/E3). Reminder NOT BLOCKED — `d6-after-pass.txt`.

**Refutation:** seek pg_cron activity job — critic cron probe 0; postpone keep=t.

**RESULT: PASS** — path: `evidence/W4/critic.md` (postpone/reminder) + `activities.ts:190-195`

---

## D7 — detail

**Check:** §5 D7 — «فعالیت‌های امروز و عقب‌افتاده» in «کارهای من».

**Evidence:**
- `MyWorkDeals.tsx:215` exact title (DOC rg) (E1); also sidebar mention `AppSidebar.tsx` (DOC rg).
- Same commit as D5: `9ae0a932` (E3). Critic D7 CONFIRM (E2).

**Refutation:** grep title missing — found at `:215`.

**RESULT: PASS** — path: `src/components/sales-desk/MyWorkDeals.tsx:215`

---

## Gate notes (not rows)

| Gate | RESULT | Path |
|------|--------|------|
| typecheck ≤74 | PASS | `tsc-after-w4-fe.txt` count 74 |
| compose safety | PASS | `compose-safety.txt` `COMPOSE_SAFETY=PASS` |
| playwright smoke | PASS | `deploy-summary.txt` |
| critic overall | CONFIRM | `critic.md` |
| reverts 572–575 | present | `docs/missions/salesdesk-9-fixes/revert/572_…575_…` |

## Unverified by this self-check

- Owner cold-browser §9 script.
- Live `kind=call` backfill (count 0).
- DB-level owner-only trigger (intentionally absent — FINDING).
