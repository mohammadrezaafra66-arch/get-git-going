# Wave 3 checks — derived from EXECUTION-PROMPT §3, §4, §5, §6 (before reading builder reports)

## C1 — term «افزودن معامله»
- **Promised:** «ثبت درخواست» → «افزودن معامله» in sales desk and call popup; `kind='request'` and «متن درخواست» unchanged.
- **Probe:** Grep UI strings; confirm «افزودن معامله» present and «متن درخواست» retained; `kind` still request.
- **Refutation:** Residual user-facing «ثبت درخواست» in sales desk/popup; OR «متن درخواست» renamed; OR kind changed.

## C2 — responsible mandatory
- **Promised:** «مسئول معامله» empty default, mandatory; UI+zod+trigger on INSERT and UPDATE-to-NULL for `kind='request'` with ASCII `RESPONSIBLE_REQUIRED` → «مسئول معامله الزامی است»; backfill NULL→author_id per §3.14 with revert script.
- **Probe:** Rolled-back INSERT request with `salesperson_id NULL` fails; UPDATE nulling fails; UI empty default; error text exact.
- **Refutation:** NULL insert succeeds; UI defaults to `__me__`/self; error text wrong; no backfill/revert when promised.

## C3 — creator read-only
- **Promised:** «ایجاد کننده معامله» = `author_id`, automatic, read-only on form and deal view; list column + filter.
- **Probe:** Form shows label read-only; list has column/filter; SQL author_id matches display.
- **Refutation:** Field editable; label wrong; missing list column/filter.

## C4 — my work + assignment notification
- **Promised:** View «کارهای من» = deals where responsible is me; `sales_interaction_assigned` fires on insert and responsible change; bell shows «من مسئول شدم».
- **Probe:** SQL deals where salesperson_id = sales user vs UI list; rolled-back assign change inserts notification_queue with expected type/text path; UI label «کارهای من» / «من مسئول شدم».
- **Refutation:** View missing; notification only on insert not on change; Persian string wrong.

## C5 — report deals registered for others
- **Promised:** Report «معاملات ثبت‌شده برای دیگران»: author ≠ salesperson, by author × Tehran day, count, drill-down; managers/admins all, others own; `role_permissions` present.
- **Probe:** SQL aggregate vs UI count for a Tehran day; role_permissions rows; non-manager cannot see others.
- **Refutation:** Counts differ; no permissions rows (open to all); label wrong.

## C6 — deal products
- **Promised:** Block «محصولات درخواستی» above «متن درخواست»; reuse existing product search; qty default 1 + note; search «287» finds X287; unavailable shown with badge.
- **Probe:** UI labels; search 287; insert item via UI; SQL `sales_interaction_items`.
- **Refutation:** Block below text; search misses X287; no table/items.

## C7 — status labels won/lost
- **Promised:** Labels «جاری / موفق / ناموفق»; buttons «موفق شد» / «ناموفق شد»; `won_at`/`lost_at` by trigger; reopen to جاری; status CHECK values unchanged (open/won/lost/…).
- **Probe:** Rolled-back status transitions set/clear timestamps; UI labels exact; CHECK constraint definition unchanged.
- **Refutation:** CHECK altered; timestamps not maintained; labels wrong.

## C8 — lost reasons
- **Promised:** `deal_lost_reasons` (deactivate never delete); settings «دلایل شکست معامله»; seed «سایر»; dialog labels per §6; «سایر» requires text; trigger `LOST_REASON_REQUIRED`; report «دلایل شکست».
- **Probe:** Seed hex for «سایر»; rolled-back lost without reason fails; «سایر» without note fails; settings page labels.
- **Refutation:** Lost without reason succeeds; seed wrong; DELETE used instead of deactivate; labels wrong.

## C9 — create quote from deal
- **Promised:** «ایجاد پیش‌فاکتور» when customer + ≥1 item; prefill customer/items/`salesperson_id`=responsible; several quotes; tab «پیش‌فاکتورها»; draft; link both ways; KPI/score queries untouched.
- **Probe:** Create quote from marked deal; SQL link; quote draft + salesperson_id; grep score/KPI functions unchanged in diff.
- **Refutation:** Quote not linked; salesperson_id ≠ responsible; scoring files in diff; button without items succeeds incorrectly.

## Scope (Wave 3)
- Must not edit `compute_employee_score` / pricing; no kanban/pipeline; no second sales_interactions implementation.
