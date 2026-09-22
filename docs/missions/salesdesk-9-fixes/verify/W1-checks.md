# Wave 1 checks — derived from EXECUTION-PROMPT §3, §4, §5, §6 (before reading builder reports)

## A1 — ticket creator / assignee / created time
- **Promised:** Ticket detail and every ticket list show «ایجاد کننده», «مسئول», «تاریخ ثبت» (Jalali date+time, Asia/Tehran) from `creator_id`, `assignee_id`, `created_at`.
- **Probe:** Open a known ticket on 3100 as `test.admin@afrakala.local`; assert those three labels and that the displayed time matches `created_at AT TIME ZONE 'Asia/Tehran'` via SQL.
- **Refutation:** Detail page HTML/source lacks the exact UTF-8 bytes of «ایجاد کننده» / «مسئول» / «تاریخ ثبت», OR list columns omit them, OR display uses UTC not Tehran.

## A2 — open/closed sections, closed_at, close/reopen
- **Promised:** Ticket lists have sections «در حال اجرا» and «بسته شده» with counters; «تاریخ بسته شدن» from `closed_at` maintained by trigger; actions «بستن» / «بازگشایی»; consistent across all ticket list pages.
- **Probe:** Count open vs closed via SQL (`status` / `closed_at`); compare UI section counters; close then reopen a marked ticket `[TEST-9FIX-V]` and check `closed_at` set then cleared.
- **Refutation:** Direct SQL `UPDATE work_items SET status='done'` (or equivalent close) leaves `closed_at` NULL; OR reopen leaves `closed_at` non-null; OR UI counters ≠ SQL counts; OR Persian section labels wrong byte-for-byte.

## A3 — ticket history
- **Promised:** `work_item_events` (or equivalent) + trigger logs actor, time, field, old, new for status/assignee/priority/title/body; detail page «سابقه» timeline.
- **Probe:** In `BEGIN…ROLLBACK`, update status/assignee/title on a test row; expect event rows. UI: detail shows «سابقه».
- **Refutation:** UPDATE of listed fields produces zero history rows; OR «سابقه» label missing; OR history writable without actor.

## A4 — supplier required
- **Promised:** No «نامشخص»; zod+UI require supplier; trigger: INSERT needs `supplier_id`; UPDATE cannot null a non-null; legacy NULL rows stay editable; ASCII `SUPPLIER_REQUIRED` → UI «تأمین‌کننده الزامی است».
- **Probe:** Rolled-back `INSERT INTO purchases … supplier_id NULL` must fail with `SUPPLIER_REQUIRED`. Rolled-back UPDATE nulling an existing non-null supplier must fail. Legacy NULL row UPDATE of other fields succeeds.
- **Refutation:** NULL insert succeeds after the fix; OR UI still offers «نامشخص»; OR UI error text ≠ «تأمین‌کننده الزامی است».

## A5 — quick-create supplier
- **Promised:** «+ تأمین‌کنندهٔ جدید» inside supplier picker; creates with minimum schema fields and selects it.
- **Probe:** Playwright/UI on purchase form: click label, create `[TEST-9FIX-V]` supplier, confirm selected; delete after.
- **Refutation:** Label bytes ≠ «+ تأمین‌کنندهٔ جدید»; OR create succeeds but picker does not select; OR required fields missing so create always fails.

## A6 — filter without supplier
- **Promised:** Filter «بدون تأمین‌کننده» on purchases list and `/accounting/purchase-payments`; UI count = SQL `COUNT(*) WHERE supplier_id IS NULL`.
- **Probe:** SQL count vs UI count on both pages with filter on.
- **Refutation:** Label wrong; UI count ≠ SQL; filter absent on one of the two pages.

## Scope (Wave 1)
- Diff vs base must not touch forbidden §4 areas: scoring, pricing engine/queue, Issabel hook contract, `tasks`, invoices, production, `D:\AfraKalaTest\app`.
