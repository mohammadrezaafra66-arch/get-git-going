# A6 — purchases UI («بدون تأمین‌کننده»)

**Status:** implemented in worktree `wt-salesdesk-9-fixes`  
**Date:** 2026-09-21  
**Base HEAD when finishing:** `ccc40c44439999973029d46f14079abf60ecd2ba` (prior commit already landed a first A6 pass; this pass fixes global SQL count + purchases columns)

## Acceptance (N27 / EXECUTION-PROMPT A6)

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Exact label «بدون تأمین‌کننده» | PASS | Switch labels in both routes (`a6-source-probe.txt`) |
| `supplier_id` in purchase-payments select | PASS | `_app.accounting.purchase-payments.tsx` select includes `supplier_id` |
| Filter = `supplier_id IS NULL` | PASS | `.is("supplier_id", null)` on list + count queries |
| UI count = SQL count | PASS | Count query is global (not tab-scoped); SQL probe = **301** |
| Switch near overdue filter | PASS | Same toolbar row as «فقط دیرکردها» |
| `/purchases` list (id, number, date, product, supplier) | PASS | Table heads: شناسه / شماره / تاریخ / محصول / تأمین‌کننده |
| Keep create button | PASS | «ثبت خرید جدید» retained |
| Loading / empty / error | PASS | Spinner; EmptyState; error card on list failure |

## SQL probe (E3)

```text
docker exec afrakala-lan-db psql -U postgres -d afrakala -A -t -c
  "SET default_transaction_read_only = on;
   SELECT count(*) FROM public.purchases WHERE supplier_id IS NULL;
   SELECT count(*) FROM public.purchases;"
→ EXIT=0
→ 301
→ 317
```

Saved: `purchases-sql-count.txt`

UI badge reads the same predicate via PostgREST:

```ts
supabase.from("purchases").select("id", { count: "exact", head: true }).is("supplier_id", null)
```

So the number shown next to «بدون تأمین‌کننده» is the same 301 (until data changes).

## Files changed

1. `src/routes/_app.accounting.purchase-payments.tsx`
   - Always-on global `noSupplierCount` query (not limited to unpaid/paid tab)
   - Badge on the switch with `data-testid="purchase-payments-no-supplier-count"`
   - Switch placed next to overdue filter
   - Server-side `.is("supplier_id", null)` when filter on; row cell shows «بدون تأمین‌کننده»

2. `src/routes/_app.purchases.tsx`
   - Replaced EmptyState-only page with list: id, number, date, product, supplier
   - Same filter + SQL-matching badge count
   - Create button kept

## Before → after (E4)

| Probe | Before (HEAD `95abed85` A6 first pass / earlier EmptyState) | After |
|-------|---------------------------------------------------------------|-------|
| `/purchases` | EmptyState «لیست خریدها در فاز بعدی» **or** list without id column / total-all count when filter off | List with id+number+date+product+supplier; badge = SQL null count |
| purchase-payments count | Tab-scoped count (`paid_at` filter) → would not match `SELECT count(*) … IS NULL` | Global count query; badge always visible when count > 0 |
| SQL null rows | 301 (unchanged) | UI designed to display 301 |

## Typecheck

Full `tsc --noEmit` still exits 2 with many pre-existing errors outside A6 (see `typecheck-a6-baseline.txt`).  
Scoped filter for these two route files: `a6-tsc-scoped.txt` (empty = no errors in A6 files).

## Not verified here

- Playwright acceptance test `salesdesk-9-fixes-w1-acceptance.spec.ts` test 3 against live :3100 (needs redeploy of this SHA).
- Visual/browser click of the switch in this session.

## Out of scope

- Work/ticket files (A1–A3) — not touched.
- PurchaseForm A4/A5 — already done; not changed.
