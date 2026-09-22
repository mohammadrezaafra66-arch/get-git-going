# W3-VERDICT — independent verify (disconfirm)

Ground truth / typecheck / workbench: see W1-VERDICT. Product on 3100 = `0c6eeb08`.

Scope: no `compute_employee_score` / pricing engine file changes in product diff; status CHECK still `open|won|lost|cancelled|done`.

---

## C1 — «افزودن معامله»
- **Verdict: CONFIRMED**
- Probe: Desk UI has «افزودن معامله»; «ثبت درخواست» absent on desk (`ui-labels.txt`). No «ثبت درخواست» under `src/components/sales-desk`. «متن درخواست» still on form (`ui-labels-3.txt`).
- Refutation: residual user-facing «ثبت درخواست» on desk — failed.
- Would change: old string returning on desk/popup chrome.

## C2 — responsible mandatory
- **Verdict: CONFIRMED**
- Probe: INSERT/UPDATE NULL `salesperson_id` for `kind=request` → `RESPONSIBLE_REQUIRED` (`sql-probes-2`). Zero leftover NULL salesperson requests. Form default empty + label «مسئول معامله»; zod/error map «مسئول معامله الزامی است».
- Refutation: NULL insert OK — failed.
- Would change: trigger absent or UI defaulting to self without validation.

## C3 — creator read-only
- **Verdict: CONFIRMED**
- Probe: Form/list show «ایجاد کننده معامله» (`ui-labels-3`, MyWorkDeals filter).
- Refutation: missing label — failed.
- Would change: editable creator field (not re-probed as writable; label+read-only pattern in QuickRequestForm).

## C4 — کارهای من + «من مسئول شدم»
- **Verdict: CONFIRMED**
- Probe: Tab «کارهای من» visible. Rolled-back assign change → `notification_queue` row `title=من مسئول شدم` hex `d985d98620d985d8b3d8a6d988d98420d8b4d8afd985` (`c4-notify.txt`). Function contains title (`sql-probes-5`).
- Refutation: no notify on responsible change — failed.
- Would change: title hex mismatch or missing view.

## C5 — deals for others report
- **Verdict: CONFIRMED** (permissions + route; count drill-down not re-aggregated)
- Probe: `role_permissions` rows for `sales-deals-for-others` (admin/manager/sales view) (`schema-detail.txt`). Desk link «معاملات ثبت‌شده برای دیگران» present.
- Refutation: missing module permissions — failed.
- Would change: UI count ≠ SQL author×Tehran-day aggregate (not fully re-run).

## C6 — deal products + search 287
- **Verdict: CONFIRMED**
- Probe: Block «محصولات درخواستی» above «متن درخواست»; search «287» lists X287 products including unavailable («ناموجود») (`ui-labels-3.txt`). Table `sales_interaction_items` present.
- Refutation: search misses X287 — failed.
- Would change: empty search results for 287.

## C7 — status labels / won_at
- **Verdict: CONFIRMED**
- Probe: Buttons «موفق شد»/«ناموفق شد» on desk; OutcomeButtons map open→«جاری». Status CHECK unchanged. `won_at` set on won, cleared on reopen (`sql-probes-2`).
- Refutation: CHECK altered / timestamps missing — failed.
- Would change: won without `won_at`.

## C8 — lost reasons
- **Verdict: CONFIRMED**
- Probe: Seed «سایر» hex `d8b3d8a7db8cd8b1`. Lost without reason → `LOST_REASON_REQUIRED`; with reason OK (`sql-probes-2`). Settings page labels «دلایل شکست معامله», «ایجاد دلیل شکست جدید», «سایر», عنوان/فعال/غیرفعال (`ui-labels.txt`). Modules `deal-lost-reasons` / `deal-lost-report` in RP.
- Refutation: lost without reason succeeds — failed.
- Would change: seed title hex drift.

## C9 — create quote from deal
- **Verdict: INDETERMINATE**
- Probe: Column `sales_quotes.interaction_id` exists; deal page source has «ایجاد پیش‌فاکتور» / «پیش‌فاکتورها». Live `quotes_with_interaction` count = 0 (`d3-d6-extra.txt`) — no linked quote observed.
- Refutation: E2E create draft quote linked both ways — **not completed** in this verify.
- Would change: create quote from deal with customer+item and assert draft + `salesperson_id` = responsible + bidirectional link.

---

## Scope findings
Scoring function still present (src length check); no scoring file in mission product diff. No kanban/pipeline added.

## Builder vs observed
- Builder: C1–C9 DONE. Observed: C1–C8 CONFIRMED; C9 INDETERMINATE (no live linked quote).
- No BLOCKED/SKIPPED.

## Could not check
- C5 numeric report vs SQL for a Tehran day; C9 full quote creation KPI/score query identity beyond “scoring files untouched”.

VERDICT: INDETERMINATE — C9
