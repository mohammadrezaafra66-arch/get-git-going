# F3-C9 product fix — deal→quote prefill

**STATUS:** FIXED (attempt 1)  
**HEAD_before:** `55d6e0b0e1d847e16aba20c44b3e5628603972d8`  
**Branch:** `feature/salesdesk-9-fixes`

## Root cause (E2)

Deal prefill in `src/routes/_app.sales.quotes.new.tsx` built `DraftQuoteItem` with:

- `source: "manual"`
- `sale_price_type_id: null`
- `unit_price: 0`

`validateQuote` (`src/lib/sales/quotes.ts`) rejects `manual` / `quick_price` with the same Persian message as RPC `create_sales_quote_with_items` (mig 415): «این کالا در سیستم تعریف نشده است…».

Normal ProductTab confirm path already used `source: "product_price"` + real `sale_price_type_id` + resolved unit price via `get_sales_search_products`.

## What changed

1. **`src/lib/sales/quotes.ts`**
   - `resolveSettlementPriceFromEntries` — same match / baseline_fallback / no_price logic ProductTab used inline.
   - `draftCatalogQuoteItem` — builds catalog lines with `source: "product_price"` (never manual).

2. **`src/routes/_app.sales.quotes.new.tsx`**
   - Load active `sale_price_types` before C9 prefill (`priceTypesFetched`).
   - Prefill: for each `sales_interaction_items` row with `product_id`, call `get_sales_search_products`, pick first active price type with a sellable baseline price, push `draftCatalogQuoteItem(...)`.
   - Keep customer + `dealPrefill` (interaction_id / salesperson_id) behavior.
   - If no sellable price: Persian `toast.error`, do not insert invalid manual lines.
   - ProductTab now calls the shared resolver + `draftCatalogQuoteItem` (discount still applied on confirm).

3. **`src/lib/sales/quotes-deal-prefill.test.ts`**
   - Pure unit coverage for resolver + catalog draft + `validateQuote` acceptance / manual rejection.

## Evidence

| Claim | Level | Proof |
| --- | --- | --- |
| Unit mapping + validateQuote | E3 | `npx tsx --test src/lib/sales/quotes-deal-prefill.test.ts` → exit 0, 6 pass (`evidence/FIX/f3-c9-unit.txt`) |
| Typecheck ceiling | E3 | `npx tsc --noEmit` → `ERROR_COUNT=74` (`evidence/FIX/f3-c9-tsc.txt`); no errors in changed quote files |
| Live C9 Playwright | — | **Not run here** — orchestrator redeploys then re-runs |

## Unverified

- Live deal→quote save after deploy (orch Playwright C9).
- Whether every catalog product on deals always appears in `get_sales_search_products` (p_limit 50 / search term) — graceful toast if not.
