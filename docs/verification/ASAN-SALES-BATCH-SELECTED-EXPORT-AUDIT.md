# ASAN Sales Batch Selected Export — Audit

**Date:** 2026-08-05  
**Branch:** `feature/navigation-modernization`  
**Root:** `D:\AfraKalaTest\app`  
**Scope:** `/admin/asan-export` — sales (`فاکتورهای فروش`) only  
**Verdict:** Core capability **already implemented** (M4.2 shell + M4.3 sales). This mission **closes UX/safety gaps** and strengthens tests — it does **not** duplicate the financial engine.

---

## Exact answers (mission checklist)

| # | Question | Answer |
|---|----------|--------|
| 1 | Date-range filtering? | **Yes** — UI + RPC |
| 2 | Checkbox selection? | **Yes** |
| 3 | «انتخاب همه»? | **Yes** (was «انتخاب همهٔ N ردیف»; tightened to eligible-only label) |
| 4 | Select-all scope? | **Option A** — all filtered/listed rows across pages (not current page only). Page-only controls remain separate. |
| 5 | Blocked selectable? | **No** — checkbox `disabled` |
| 6 | Preview selected IDs only? | **Yes** — `split.exportable` |
| 7 | Download selected IDs only? | **Yes** — `split.exportable` |
| 8 | When are `asan_export_numbers` minted? | **Download only** via `asan_assign_document_numbers` |
| 9 | Select/preview mutate DB? | **No** |
| 10 | Download mints only selected eligible? | **Yes** |
| 11 | Authoritative date field? | `(sales_quotes.created_at AT TIME ZONE 'Asia/Tehran')::date` inclusive `BETWEEN` |
| 12 | Document naming in live schema? | Table `sales_quotes`; export candidates = `status = 'accepted'` + accountant finalization + stock deduction; Asan register `sales_invoice` / UI «فاکتورهای فروش» (still پیش‌فاکتور in product language) |

---

## Architecture map

| Layer | Path |
|-------|------|
| Page | `src/routes/_app.admin.asan-export.tsx` |
| Selection model | `src/lib/asan/export-selection.ts` (excluded-set; default = all ticked) |
| Sales list/build | `src/lib/asan/export-sales.ts` → RPC `asan_list_sales_export` |
| Shared rows | `src/lib/asan/export-invoice-rows.ts` (Rial ×10) |
| Numbers | `src/lib/asan/export-numbers.ts` + RPC assign (migrations 290–291) |
| Canonical sales RPC | Migration **293** (replaces shape from 292) |
| Roles | admin + accountant (route, menu, `role_permissions`, RPCs) |

---

## Date / timezone semantics

- UI: Jalali picker → Gregorian ISO `YYYY-MM-DD`.
- Default range: last **90** Tehran calendar days → today.
- Inclusive start and end on Tehran calendar date of **`created_at`** (not business/invoice date column — none is used by the RPC).
- RPC rejects `_to < _from`.
- File dates: Jalali `YYYY/MM/DD` Latin digits (`isoToJalaliAsan`).

**Why `created_at`:** It is what migrations 292/293 encode; changing to `accepted_at` / `accounting_registered_at` would silently shift which documents appear and requires an explicit owner decision + migration.

---

## Selection / preview / numbering (pre-mission)

- Excluded-set model: unticks survive paging.
- Blocked rows shown with Persian `blocked_reason`; never written to workbook.
- Preview builds rows with existing `asanNumber` only — **no assign RPC**.
- Download assigns numbers for exportable selected IDs, then builds one workbook.
- Idempotent re-download keeps prior numbers.
- **Gap closed this mission:** confirmation before irreversible numbering; select-all eligible-only; clear-range; batch soft limit 1000; clearer counts/labels/filename.

---

## Gaps closed vs required UI

| Required | Before | After |
|----------|--------|-------|
| از / تا تاریخ | Present | Present |
| اعمال بازه | «نمایش اسناد بازه» | Also labeled «اعمال بازه» |
| پاک کردن بازه | Missing | Added |
| Counts | Partial | Explicit کل / قابل خروجی / مسدود / انتخاب‌شده |
| Select all eligible | All rows visually ticked (blocked disabled) | Eligible-only select-all + load defaults exclude blocked from selection count path |
| Confirmation before mint | Missing | AlertDialog Persian confirm |
| Batch limit | None | Soft UI limit **1000** selected eligible docs |
| Filename | `asan-{key}-{from}_{to}.xlsx` | `asan-{key}-{from}_to_{to}-selected-{N}.xlsx` |

---

## Migration

**None.** Existing RPCs already support range list + selected-ID assign.

---

## Tests

Existing: `e2e/asan/export-shell.spec.ts`, `export-sales.spec.ts`, numbering/access specs.  
Added/strengthened: selection eligible helpers + focused browser batch-selected coverage (see mission delivery).
