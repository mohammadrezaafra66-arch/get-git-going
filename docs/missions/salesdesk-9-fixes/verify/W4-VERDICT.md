# W4-VERDICT — independent verify (disconfirm)

Ground truth / typecheck / workbench: see W1-VERDICT. Product on 3100 = `0c6eeb08`.

Scope: `tasks` table still present; git product diff after deploy tip has 0 files; no new `cron.job` for activity reminders (existing jobs only — `sql-probes-4.txt`). NotificationBell calls read-time materialize (no pg_cron).

---

## D2 — activity types seed
- **Verdict: CONFIRMED**
- Probe: 18 titles sort_order 0–17; hex mismatches vs §6 list = **[]** (`sql-probes-4.txt`). Includes Didar spellings («برسی», «فاکتورلاین», etc.).
- Refutation: order/spelling drift — failed.
- Would change: any title hex ≠ §6.

## D1 — activity columns
- **Verdict: CONFIRMED**
- Probe: columns `activity_type_id`, `due_at`, `due_has_time`, `original_due_at`, `done_at`, `result_note`, `deal_id` present. Legacy kinds still `note`/`request` (call count 0 live). `tasks` untouched in product scope.
- Refutation: columns missing / kind rewritten — failed for columns; call backfill unmeasurable (0 call rows) — same residual builder noted.
- Would change: missing columns or mass kind rewrite.

## D3 — complete activity / owner-only
- **Verdict: REFUTED** (owner-only as an enforceable rule)
- Probe: UI labels present in `ActivityDoneControls` / `ActivityForm` («این فعالیت انجام شده», «نتیجه‌ی فعالیت خود را یادداشت کنید», «این فعالیت انجام شد», «به تعویق انداختن»). TS `markActivityDone` checks `actorId === ownerId`.
- Refutation: RLS policy `sales_interactions_update_staff` **allows UPDATE when `author_id = uid()` OR `salesperson_id = uid()` OR admin/manager** (`d3-rls.txt`). Therefore a non-owner **author** can set `done_at`/`result_note` via PostgREST despite the UI/TS guard. Promise §5: “only the owner records a result.”
- Builder honesty: HANDOFF/REPORT/critic FINDING Medium documents this residual and still marks DONE — difference: independent review treats the promise as **REFUTED**, not merely residual.
- Would change: RLS/trigger rejecting `done_at`/`result_note` updates unless `uid() = salesperson_id` (admins may remain exempt only if §3 explicitly allows — it does not).

## D4 — activities page + menu count
- **Verdict: CONFIRMED**
- Probe: Page `/operations/sales-desk/activities` shows all §6 buckets/filters (`ui-labels.txt`). RPC `count_open_activities_due_today_or_overdue` exists; `role_permissions` module `sales-activities` present. Live open due count = 0 (`sql-probes.txt`) — badge equality vacuous but infrastructure present.
- Refutation: missing buckets/permissions — failed.
- Would change: badge ≠ SQL when N>0 (not stressed with seeded rows here).

## D5 — follow-up icons + filter
- **Verdict: CONFIRMED** (code + filter label; live four-color seeding not done)
- Probe: Filter «معاملاتی که فعالیتی روی آن‌ها نیست» on کارهای من (`ui-labels.txt`). `FollowUpTrafficLightIcon` maps yellow/red/green/grey with Persian titles matching promised semantics.
- Refutation: wrong filter label — failed. Color mapping on live deals with seeded states — not visually asserted.
- Would change: icon color ≠ due state on seeded deals.

## D6 — postpone + reminder
- **Verdict: CONFIRMED**
- Probe: Columns `reminder_enabled`, `reminder_fired_at`. Raw SQL postpone leaving `original_due_at` unchanged when already set (`d3-d6-extra.txt`). No activity reminder cron job. Bell integrates materialize RPC. UI strings «به تعویق انداختن», «افزودن یادآور برای فعالیت» in components.
- Refutation: new pg_cron job / original overwritten by app path — cron absent; app postpone keeps original in `activities.ts`. Full bell delivery of a due reminder not timed in this session.
- Would change: cron job added or `original_due_at` cleared on postpone.

## D7 — my-work activities section
- **Verdict: CONFIRMED**
- Probe: «فعالیت‌های امروز و عقب‌افتاده» visible under کارهای من (`ui-labels.txt`).
- Refutation: missing section — failed.
- Would change: section listing others’ activities (SQL filter uses salespersonId — not cross-user UI tested).

---

## Scope findings
No pg_cron addition for reminders; `tasks` remains; scoring untouched.

## Builder vs observed
- Builder: D2–D7 all DONE; D3 owner-only “FINDING Medium” accepted. Observed: D3 **REFUTED** on enforceable owner-only; others CONFIRMED (D5 color live seeding light).
- No BLOCKED/SKIPPED rows; matches builder claim of none.
- SHA gap docs-only: builder notes Low; confirmed product_files_after_deploy=0.

## Could not check
- Seeded traffic-light four states on live cards; reminder appearing in bell at due time; D3 PostgREST JWT author bypass end-to-end (policy text alone is sufficient to refute); non-zero menu badge vs SQL.

VERDICT: FAIL — D3
