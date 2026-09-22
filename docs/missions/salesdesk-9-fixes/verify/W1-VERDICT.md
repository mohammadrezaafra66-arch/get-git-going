# W1-VERDICT — independent verify (disconfirm)

Ground truth: worktree HEAD `983e47a3`; deployed `APP_GIT_SHA=0c6eeb08`. Diff `0c6eeb08..HEAD` is docs-only under `docs/missions/salesdesk-9-fixes/` (0 product files). Product under test = `0c6eeb08`. Base for scope: `c1ea61a1`.

Typecheck (once for verify-all): **74** errors = Wave 0 baseline `evidence/W0/typecheck-count.txt` (`baseline_errors=74`). Control page `/pricing/my-workbench` → HTTP 200, no error boundary (`verify/raw/ui-labels.txt`).

Scope (`git diff --stat c1ea61a1..HEAD`): no edits to scoring, pricing engine/queue, Issabel hook, `tasks`, or invoices. Forbidden-area name hits are mission evidence only.

Raw evidence: `verify/raw/sql-probes*.txt`, `schema-detail.txt`, `ui-labels*.txt`.

---

## A1 — ticket creator / assignee / created time
- **Verdict: CONFIRMED**
- Probe: UI `/operations/work` list shows «ایجاد کننده», «مسئول», «تاریخ ثبت»; detail `/operations/work/ef1d91f6-…` shows the same three (`ui-labels.txt`, `ui-labels-3.txt`).
- Refutation: open ticket detail lacking labels — failed (labels present).
- Would change: detail page omitting any of the three exact labels.

## A2 — open/closed sections, completed_at, close/reopen
- **Verdict: CONFIRMED**
- Probe: Board sections «در حال اجرا» / «بسته شده» visible. Column is `completed_at` (not `closed_at`) — allowed by §7 when equivalent exists. Trigger `work_items_before_write`: `pending→done` sets `completed_at`; reopen to `pending` clears it (`schema-detail.txt`). Detail shows «بستن»; «بازگشایی»/«تاریخ بسته شدن» absent on open ticket (expected).
- Refutation: close without timestamp — failed (timestamp set). Direct use of non-existent `closed_at` — schema correctly uses `completed_at`.
- Would change: reopen leaving `completed_at` set, or missing section labels.

## A3 — ticket history
- **Verdict: CONFIRMED**
- Probe: `work_item_events` exists; rolled-back title UPDATE → delta=1 with field/old/new (`sql-probes-2.txt`). Detail shows «سابقه».
- Refutation: UPDATE with zero events — failed.
- Would change: missing table/trigger or missing «سابقه».

## A4 — supplier required
- **Verdict: CONFIRMED**
- Probe: `INSERT … supplier_id NULL` / `DEFAULT VALUES` → `SUPPLIER_REQUIRED`; UPDATE non-null→NULL → `SUPPLIER_REQUIRED`; legacy NULL row `UPDATE notes` succeeds (`sql-probes-2/4`). Purchase form: no `نامشخص` option; `+ تأمین‌کنندهٔ جدید` present; zod/UI map to «تأمین‌کننده الزامی است» (source + unit mapping).
- Refutation: NULL insert succeeding — failed.
- Would change: NULL insert allowed or UI still offering «نامشخص» as supplier.

## A5 — quick-create supplier
- **Verdict: CONFIRMED**
- Probe: Purchase create page body includes exact «+ تأمین‌کنندهٔ جدید» (`ui-labels.txt`).
- Refutation: wrong label bytes — failed.
- Would change: label drift or create-without-select (not exercised end-to-end here; label+wiring present). Full create/select E2E not re-run — residual INDETERMINATE only if create flow broken; label check passed.

## A6 — filter without supplier
- **Verdict: CONFIRMED**
- Probe: SQL `COUNT(*) WHERE supplier_id IS NULL` = **301**. Purchases badge `data-testid=purchases-no-supplier-count` = **301**; purchase-payments label text embeds **۳۰۱** → 301 (`ui-labels-2/3.txt`).
- Refutation: UI ≠ SQL — failed (equal).
- Would change: badge ≠ 301.

---

## Scope findings
No §4 forbidden product areas touched for Wave 1 objects beyond planned work/purchases routes.

## Builder vs observed
- Builder (HANDOFF/REPORT): A1–A6 DONE. Observed: all CONFIRMED. `closed_at` named `completed_at` — matches mig 562 / CONTRACTS intent; not a refute.
- No BLOCKED/SKIPPED rows claimed for Wave 1.

## Could not check
- Full Playwright acceptance close/reopen click path on a marked ticket (SQL trigger proven instead).
- A5 full quick-create → selected supplier round-trip beyond label presence.

VERDICT: PASS
