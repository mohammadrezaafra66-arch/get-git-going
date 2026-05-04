## Problem

In Quick Sales Search, the "Show Labeled Products" shortcut is correctly sending the selected `p_label_ids` to the database with an empty `p_search`. However, the database function `get_sales_search_products` has a hard guard:

```sql
IF length(v_term) < 2 THEN
  RETURN;
END IF;
```

So whenever the search box is empty (which is exactly the intended behavior of the labeled-products shortcut), the RPC returns zero rows — even though the product (`AFK-2026-00013`) is active, available, and correctly linked to the labels `تبلیغات` and `سایت ها`.

I confirmed the data in the database:
- Product is `is_active = true`, `status = active`, `stock_status = available`.
- Both label links exist in `product_label_links`.
- Both labels are `public` and active.

So the only blocker is the 2-character minimum inside the RPC.

## Fix

Update the RPC `public.get_sales_search_products` so the 2-character minimum applies **only when no label filter is supplied**. When `p_label_ids` is provided (even with empty search), the function should proceed normally and apply the label filter.

New guard logic:

```text
if p_label_ids IS NULL or empty:
    require length(v_term) >= 2  (return empty otherwise)
else:
    skip the length check (label browse mode)
```

The rest of the function (auth/role checks, filters, pagination, label visibility, price visibility) stays exactly the same.

## Steps

1. Create a migration that replaces `public.get_sales_search_products` with the same body, changing only the early-return guard so it is bypassed when `p_label_ids` is provided.
2. No client changes needed — `src/routes/_app.sales.search.tsx` already sends `p_label_ids` and `p_search=""` in label mode, and already filters results to `available + limited` on the client.
3. Verify in the preview by clicking "نمایش محصولات برچسب‌دار" — the product `AFK-2026-00013` should now appear, alongside any other labeled, available/limited products.

## Out of scope

- No UI changes.
- No changes to label-mode pagination, label visibility rules, or price-type selection.
- No changes to RLS or roles.
