# Wave 4 checks — derived from EXECUTION-PROMPT §3, §4, §5, §6 (before reading builder reports)

## D2 — activity types seed
- **Promised:** `sales_activity_types` seeded with «یادداشت ساده» then Didar’s 17 titles in exact §6 order/spelling; round-trip UTF-8 verified.
- **Probe:** `SELECT title, sort_order … ORDER BY sort_order`; compare titles byte-for-byte (hex) to §6 list.
- **Refutation:** Wrong order, missing type, spelling drift (e.g. «برسی» altered), or hex mismatch.

## D1 — activity columns on sales_interactions
- **Promised:** Columns `activity_type_id`, `due_at`, `due_has_time`, `original_due_at`, `done_at`, `result_note`, `deal_id`; owner=`salesperson_id`, creator=`author_id`; legacy call/note map to inbound/outbound/simple note without changing `kind`; `tasks` untouched.
- **Probe:** `\d` / information_schema columns; sample legacy rows still selectable; kind unchanged; `tasks` table/triggers unmodified in diff.
- **Refutation:** Columns missing; kind rewritten; tasks board/schema changed.

## D3 — complete activity + create another
- **Promised:** Flow «این فعالیت انجام شده» → «نتیجه‌ی فعالیت خود را یادداشت کنید»; buttons «این فعالیت انجام شد», «ذخیره و ایجاد فعالیت دیگر»; only owner records result; revert to undone allowed.
- **Probe:** UI labels exact; non-owner cannot mark done (SQL/UI); save-and-create-another produces new row same customer/deal; undo clears `done_at`.
- **Refutation:** Non-owner can complete; second activity loses customer/deal; labels wrong.

## D4 — activities page + menu count
- **Promised:** Page «فعالیت‌ها» with date buckets and filters per §6; red menu count = open due today or overdue using `public.tehran_today()`; `role_permissions` rows.
- **Probe:** SQL count open overdue/today vs UI badge; page labels; permissions present.
- **Refutation:** Badge ≠ SQL; missing buckets; no role_permissions.

## D5 — follow-up icons on deals
- **Promised:** On open deals in میز فروش / کارهای من: yellow none, red overdue, green today, grey future; filter «معاملاتی که فعالیتی روی آن‌ها نیست».
- **Probe:** Seed four marked deals with known activity states; assert icon classes/colors; filter count = SQL deals with no activities.
- **Refutation:** Wrong color mapping; filter label wrong; filter count ≠ SQL.

## D6 — postpone + reminder
- **Promised:** «به تعویق انداختن» moves `due_at`, keeps `original_due_at`; «افزودن یادآور برای فعالیت» only when time set; in-app bell via existing poll — no pg_cron. Reminder may be BLOCKED if impossible.
- **Probe:** Postpone via UI/SQL; compare original_due_at; confirm no new pg_cron job; reminder path or documented BLOCKED.
- **Refutation:** original_due_at overwritten; reminder without time; new cron job added.

## D7 — my-work activities section
- **Promised:** «فعالیت‌های امروز و عقب‌افتاده» inside «کارهای من».
- **Probe:** Open کارهای من as sales user; section label exact; list matches SQL for that user.
- **Refutation:** Section missing; label wrong; includes others’ activities.

## Scope (Wave 4)
- `tasks` untouched; no pg_cron; no scoring/pricing; no second implementation.
