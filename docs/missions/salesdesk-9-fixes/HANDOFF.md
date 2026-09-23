# HANDOFF — salesdesk-9-fixes

Updated: 2026-09-22T≈06:00:00Z · Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes` · Branch: `feature/salesdesk-9-fixes` · Base: `feature/sales-desk` @ `c1ea61a1`  
Current: **Wave 4 DONE** · next = mission close / owner test · 3100 runs: `APP_GIT_SHA=0c6eeb08` (healthy, HTTP 200)

## چه چیزی تغییر کرد

مستندات بستن موج ۴ (D2–D7) و بستن مأموریت: به‌روزرسانی این HANDOFF، اسکریپت پذیرش مالک `evidence/W4/ACCEPTANCE.md`، خودآزمایی `verify/W4-selfcheck.md`، گزارش نهایی `REPORT.md`، `PRODUCTION-NOTES.md`، و checkpoint `evidence/W4/registry/W4-DOC/checkpoint.md`. کد محصول در این commit تغییر نکرد (فقط docs زیر `docs/missions/salesdesk-9-fixes/` و در صورت نیاز `CONTRACTS.md`).

## چرا

`EXECUTION-PROMPT.md` §8/§9/§11/§12 و بریف W4-DOC: پس از CONFIRM critic، redeploy با SHA `0c6eeb08`، و migrations 572–575 روی LAN، موج ۴ باید بسته شود و گزارش نهایی مأموریت برای تست مالک نوشته شود.

## فایل‌ها و خطوط تغییریافته

- `docs/missions/salesdesk-9-fixes/HANDOFF.md` — این فایل (وضعیت Wave 4 DONE)
- `docs/missions/salesdesk-9-fixes/evidence/W4/ACCEPTANCE.md` — جدید
- `docs/missions/salesdesk-9-fixes/verify/W4-selfcheck.md` — جدید
- `docs/missions/salesdesk-9-fixes/REPORT.md` — جدید (§12)
- `docs/missions/salesdesk-9-fixes/PRODUCTION-NOTES.md` — جدید (§12)
- `docs/missions/salesdesk-9-fixes/evidence/W4/registry/W4-DOC/checkpoint.md` — به‌روز
- `CONTRACTS.md` — یادداشت مسیر D4 (صفحهٔ «فعالیت‌ها» پیاده شد؛ قبلاً placeholder بود)

## Rows

| Row | Node | Class | Status | Evidence |
|-----|------|-------|--------|----------|
| A1–A6 | Wave 1 | — | DONE | `evidence/W1/ACCEPTANCE.md`; migrations 560–562 |
| B1–B5 | Wave 2 | — | DONE | `evidence/W2/ACCEPTANCE.md`; `verify/W2-selfcheck.md`; fix `b1cc9a88` |
| C1–C9 | Wave 3 | — | DONE | `evidence/W3/ACCEPTANCE.md`; `verify/W3-selfcheck.md`; FE `bc10ec3f` + zod `c4bcafe9` |
| D2 | N21 | BUILD | DONE | mig 572; hex 18/18 PASS — `evidence/W4/orch-d2-reverify.txt`; commit `355c93ec` |
| D1 | N16 | EXTEND | DONE | mig 573; cols + note=2→یادداشت ساده — `orch-d1-reverify.txt`; commit `9b557dcd` |
| D3 | N17 | BUILD | DONE | `ActivityDoneControls.tsx` / `activities.ts:139-141`; commit `1b554e94`; critic CONFIRM + FINDING RLS |
| D4 | N18 | BUILD | DONE | mig 574; page activities + RPC `count_open_activities_due_today_or_overdue` + `tehran_today`; commit `e90e8d83` |
| D5 | N19 | BUILD | DONE | `FollowUpTrafficLightIcon` + filter در `MyWorkDeals.tsx`; commit `9ae0a932` |
| D6 | N20 | BUILD | DONE | mig 575; postpone + `materialize_due_activity_reminders`; no cron; commit `5cda486e` |
| D7 | N9 | EXTEND | DONE | «فعالیت‌های امروز و عقب‌افتاده» در `MyWorkDeals.tsx:215`; commit `9ae0a932` |

## شواهد در دست با سطحشان

| ادعا | سطح E | دستور یا مسیر |
|------|--------|----------------|
| Branch `feature/salesdesk-9-fixes` | E3 | `git branch --show-current` → `feature/salesdesk-9-fixes` |
| Live `APP_GIT_SHA=0c6eeb08` | E3 | orchestrator probe + `evidence/W4/deploy-summary.txt` / `critic-3100-sha.txt` |
| Container healthy + HTTP 200 | E3 | `deploy-summary.txt` health=healthy HTTP 200 |
| D2 hex 18/18 PASS | E3 | `evidence/W4/orch-d2-reverify.txt` `ok:18` `all_ok:true` |
| D1 columns + kind note=2 request=4 + mapped یادداشت ساده=2 | E3 | `evidence/W4/orch-d1-reverify.txt` |
| Migrations 572–575 on LAN | E3 | versions `20260922050000`…`50300` — orchestrator + `migration-ledger.md` / `deploy-summary.txt` |
| RPCs count + materialize use `tehran_today` | E2/E3 | `orch-rpc-reverify.txt`; critic CONFIRM |
| Typecheck ≤74 | E3 | `tsc-after-w4-fe.txt` DOC count `error TS` = 74 |
| Compose safety PASS; playwright smoke PASS | E3 | `compose-safety.txt`; `deploy-summary.txt` |
| Critic overall CONFIRM | E2 | `evidence/W4/critic.md` حکم کلی CONFIRM |
| Reverts 572–575 present | E1 | `docs/missions/salesdesk-9-fixes/revert/572_…` … `575_…` |
| Product commits D2…FE tip | E3 | `git log -1` on `355c93ec`…`0c6eeb08` |
| Owner ACCEPTANCE script | E1 | `evidence/W4/ACCEPTANCE.md` quotes EXECUTION §9 Wave 4 |
| Self-check D2–D7 PASS | E1/E3 | `verify/W4-selfcheck.md` |

## Confirmed facts

- Product Wave 4 commits: D2 `355c93ec`, D1 `9b557dcd`, D3 `1b554e94`, D4 `e90e8d83`, D5+D7 `9ae0a932`, D6 `5cda486e`, FE tip `0c6eeb08` — E3 `git log -1`.
- Live 3100 runs product tip `0c6eeb08` (healthy) — E3 `deploy-summary.txt`.
- Critic: all D2–D7 CONFIRM; FINDING: owner-only done/result enforced in UI/TS not RLS trigger — `critic.md`.
- Typecheck budget held at 74 — `tsc-after-w4-fe.txt` — E3.
- Module key `sales-activities` and reminder columns recorded in `CONTRACTS.md` — E1.
- Owner scripts: `evidence/W1`–`W4/ACCEPTANCE.md` all present. Self-check: `verify/W4-selfcheck.md`.
- Final mission report: `REPORT.md`; ship notes: `PRODUCTION-NOTES.md`.

## Migrations applied (in order)

- `20260921220000_560_work_item_events.sql` — Wave 1
- `20260921220100_561_purchases_require_supplier.sql` — Wave 1
- `20260921220200_562_work_items_completed_at_closed.sql` — Wave 1
- `20260921230000_563_user_caller_id_settings_display.sql` — Wave 2 — revert: `revert/563_user_caller_id_settings_display.sql`
- `20260921230100_564_sales_interactions_deal_id.sql` — Wave 2 — revert: `revert/564_sales_interactions_deal_id.sql`
- `20260922040000_565_sales_interactions_responsible_required.sql` — C2 — revert: `revert/565_…`
- `20260922040100_566_sales_interactions_won_lost_at.sql` — C7 — revert: `revert/566_…`
- `20260922040200_567_deal_lost_reasons.sql` — C8 — revert: `revert/567_…`
- `20260922040300_568_sales_interaction_items.sql` — C6 — revert: `revert/568_…`
- `20260922040400_569_sales_quotes_interaction_id.sql` — C9 — revert: `revert/569_…`
- `20260922040500_570_sales_interaction_assigned_title.sql` — C4 — revert: `revert/570_…`
- `20260922040600_571_role_permissions_salesdesk_w3.sql` — C5/C8 — revert: `revert/571_…`
- `20260922050000_572_sales_activity_types.sql` — D2 — revert: `revert/572_sales_activity_types.sql`
- `20260922050100_573_sales_interactions_activity_fields.sql` — D1 — revert: `revert/573_sales_interactions_activity_fields.sql`
- `20260922050200_574_role_permissions_sales_activities.sql` — D4 — revert: `revert/574_role_permissions_sales_activities.sql`
- `20260922050300_575_activity_reminder_fields.sql` — D6 — revert: `revert/575_activity_reminder_fields.sql`

## Decisions taken without the owner

- (prior waves retained) Cherry-pick aa63de1c keep HEAD; history.ts `assignee_id`→مسئول; W2 B2 medium TOCTOU residual; W3 C2 zod after critic REJECT.
- Wave 4 D1: keep `deal_id` from 564 (no new FK). Map call/note → `activity_type_id` without changing `kind`; leave request NULL. Copy legacy `next_follow_up_at` → `due_at`/`original_due_at` with `due_has_time=true` when due was null — `evidence/W4/d1-verify.txt` / HANDOFF prior.
- Wave 4 D6: reminder via read-time `materialize_due_activity_reminders` + NotificationBell poll (not pg_cron); columns `reminder_enabled` / `reminder_fired_at` in mig 575 — `CONTRACTS.md`; critic reminder probe PASS.
- Wave 4 D3 owner-only: enforced in TS/UI (`activities.ts:139-141`); critic FINDING that RLS still allows author UPDATE — accepted as residual Medium, not row BLOCKED — `critic.md`.

## Blockers

- None for Wave 4 close / mission docs.
- Residual (non-blocking): D3 owner-only not in RLS trigger (`critic.md` FINDING Medium); live `kind=call` count=0 so call backfill unmeasured on live data (`critic.md`); owner cold-browser ACCEPTANCE not yet run; B2 medium TOCTOU from Wave 2; some evidence files may remain untracked ([D-1]).

## چه چیزی تأیید نشد

- اجرای دستی کامل اسکریپت §9 Wave 4 توسط مالک روی UI سرد.
- گارد DB برای فقط-صاحب روی `done_at`/`result_note` (فقط UI/TS — `critic.md`).
- Backfill زنده برای `kind=call` (ردیف زنده = 0 — `critic.md`).
- برابری لفظی `APP_GIT_SHA` با worktree HEAD پس از commits اسناد بعدی OPS/DOC (محصول روی `0c6eeb08` است — `deploy-summary.txt` / `critic.md` Low).

## ریسک‌های باقی‌مانده

- API bypass ثبت نتیجه توسط author/admin به‌خاطر RLS UPDATE — `critic.md` Medium.
- E2E کهنه ممکن است رشته‌های قدیمی انتظار داشته باشد (موج ۳ residual).
- اگر کد محصول پس از `0c6eeb08` اضافه شود بدون redeploy، 3100 آن را ندارد.

## دقیقاً چه چیزی باید بازبینی شود

1. `verify/W4-selfcheck.md` — آیا هر ردیف D2–D7 یک check + refutation با مسیر دارد؟
2. `evidence/W4/ACCEPTANCE.md` — آیا متن §9 عیناً آمده و چک‌لیست §6 کامل است؟
3. `REPORT.md` — expected vs actual W1–W4؛ nodes؛ migrations؛ last line.
4. `PRODUCTION-NOTES.md` — ترتیب merge + mig 560–575 قبل از deploy کد.
5. تطبیق زنده `APP_GIT_SHA=0c6eeb08`.

## Next action

- Mission close: مالک `evidence/W1`–`W4/ACCEPTANCE.md` را روی 3100 (`0c6eeb08`) اجرا کند؛ سپس طبق `PRODUCTION-NOTES.md` merge به `feature/sales-desk` و اعمال migrations روی prod **قبل** از deploy کد (DOC هیچ merge/deploy انجام نمی‌دهد).
