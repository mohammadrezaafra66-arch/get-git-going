# W1 / Purchases UI — A4 · A5 · A6

Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes`  
Branch: `feature/salesdesk-9-fixes`

## Acceptance

| Row | Requirement | Status |
|-----|-------------|--------|
| A4 | Remove «نامشخص» / `SUPPLIER_UNKNOWN`; supplier required in zod + UI; map `SUPPLIER_REQUIRED` → «تأمین‌کننده الزامی است» | Done |
| A5 | «+ تأمین‌کنندهٔ جدید» quick-create selects new supplier after create | Done |
| A6 | Filter «بدون تأمین‌کننده» on purchases list + `/accounting/purchase-payments`; UI count = SQL `supplier_id IS NULL` | Done |

## Files changed

| File | Change |
|------|--------|
| `src/shared/components/PurchaseForm.tsx` | Required `supplier_id` uuid; no `SUPPLIER_UNKNOWN`/«نامشخص»; label «تأمین‌کننده»; button «+ تأمین‌کنندهٔ جدید»; field error; A5 optimistic `setQueryData` + `pendingSupplierId`; Zod v4: `.string().uuid({ message })` (no invalid `required_error`) |
| `src/hooks/purchase/useCreatePurchase.ts` | `HINT_MESSAGES.SUPPLIER_REQUIRED` + message/details scan |
| `src/hooks/purchase/useCreatePurchase.supplier-required.test.ts` | Unit tests (hint / message / details) |
| `src/routes/_app.purchases.tsx` | List + Switch «بدون تأمین‌کننده» + exact-count badge |
| `src/routes/_app.accounting.purchase-payments.tsx` | Same filter; global exact count (not tab-scoped) |
| `docs/missions/salesdesk-9-fixes/evidence/W1/purchases-ui.md` | This file |
| `docs/missions/salesdesk-9-fixes/evidence/W1/purchaseErrorMessage-test.txt` | Unit test stdout EXIT=0 |
| `docs/missions/salesdesk-9-fixes/evidence/W1/tsc-after-ui.txt` | After zod fix: **0** `PurchaseForm` errors |
| `docs/missions/salesdesk-9-fixes/evidence/W1/purchases-sql-count.txt` | SQL null=301 / total=317 |
| `docs/missions/salesdesk-9-fixes/evidence/W1/a4-before.txt` | NULL insert ACCEPTED before trigger; REFUSED `SUPPLIER_REQUIRED` after |

## Labels (exact)

- «تأمین‌کننده»
- «+ تأمین‌کنندهٔ جدید»
- «بدون تأمین‌کننده»
- «تأمین‌کننده الزامی است» ← `SUPPLIER_REQUIRED`

## Pattern followed

- Item 229 `PersonModal` + `pendingSupplierId` race fix; A5 seeds `purchase-form-suppliers` cache so required Select validates immediately.
- Error mapping: HINT_MESSAGES + raw scan (trigger puts ASCII in `SQLERRM` — see `a4-before.txt`).
- Filter: Switch like overdue/unassigned filters; count via `{ count: 'exact', head: true }.is('supplier_id', null)`.

## Data shape (source)

- `purchases.supplier_id` nullable uuid — types + `W1-tmp-purchases.txt`.
- Trigger (parallel): ASCII `SUPPLIER_REQUIRED` — `a4-before.txt`.
- Quick-create: `PersonInlineResult.legacy_id` → `suppliers.id`.

## Baseline / build (E3)

- Full `tsc --noEmit` EXIT=2 (~80 pre-existing project errors).
- After A4 zod fix: `PurchaseForm` error count **0** (`tsc-after-ui.txt`).
- `npx tsx --test src/hooks/purchase/useCreatePurchase.supplier-required.test.ts` → EXIT=0, 3 pass.

## E4 — before / after

### A4 mapping
- Before: no `SUPPLIER_REQUIRED` in HINT_MESSAGES (Wave 0).
- After: unit test asserts Persian label for hint/message/details.

### A4 form
- Before: `SUPPLIER_UNKNOWN` + «نامشخص» → NULL save.
- After: ripgrep clean of those tokens; zod blocks empty supplier.

### A6 count
- SQL: **301** rows with `supplier_id IS NULL` (`purchases-sql-count.txt`).
- UI badge uses the same exact-count query on `/purchases` and purchase-payments.

## States

| Surface | loading | empty | error | success |
|---------|---------|-------|-------|---------|
| PurchaseForm | mutation spinner | — | toast + field error | toast + reset |
| `/purchases` | Loader2 | EmptyState | destructive card | table |
| purchase-payments | Loader2 | «موردی یافت نشد» | existing | table + filter |

## Not verified here

- Live Playwright against :3100 for PersonModal (existing `e2e/persons/inline-supplier-create.spec.ts`).
- Full `vite build` (project tsc debt unrelated).

## Out of scope

- DB trigger body (parallel).
- Work/ticket UI.
- `D:\AfraKalaTest\app`.

## Verdict

**COMPLETE** — A4/A5/A6 UI+zod with E3 (unit test, tsc scoped) and E4 (mapping + form + SQL count 301).
