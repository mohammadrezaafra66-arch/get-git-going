# C1 — string renames «ثبت درخواست» → «افزودن معامله»

Scope: sales desk + CallerInboundPopup / QuickRequestForm only.
Credit-requests / purchase / StockAlertDialog **unchanged**.

| File:line | Before | After |
|-----------|--------|-------|
| `src/components/sales-desk/QuickRequestForm.tsx:50` | `submitLabel = "ثبت درخواست"` | `submitLabel = "افزودن معامله"` |
| `src/components/sales-desk/QuickRequestForm.tsx:124` (onError) | `ثبت درخواست ناموفق بود` | `افزودن معامله ناموفق بود` |
| `src/components/sales-desk/QuickRequestForm.tsx:268` CardTitle | `ثبت سریع درخواست` | `افزودن معامله` |
| `src/components/sales-desk/CallerInboundPopup.tsx:604` | `submitLabel="ثبت معامله"` | `submitLabel="افزودن معامله"` |
| `src/components/sales-desk/CallerInboundPopup.tsx:631` | `TabsTrigger … ثبت درخواست` | `TabsTrigger … افزودن معامله` |
| `src/routes/_app.operations.sales-desk.tsx:29` description | `ثبت سریع درخواست` | `افزودن معامله` |

Already correct (no change needed):
- `CallerInboundPopup.tsx:588` heading «افزودن معامله» (B5)
- `CallNoteForm.tsx:293` button «افزودن معامله» (B5)

Intentionally **not** changed:
- `src/routes/_app.sales.credit-requests.tsx` — ثبت درخواست
- `src/routes/_app.purchase.tsx` — ثبت درخواست خرید
- `src/components/sales/StockAlertDialog.tsx` — ثبت درخواست
- `src/components/purchase/PurchaseRequestForm.tsx` — ثبت درخواست خرید
- `src/hooks/purchase/usePurchase.ts` — ثبت درخواست ناموفق بود
