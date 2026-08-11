# `api` (person `6cd30201`) — provenance investigation

**Date:** 2026-08-07 · **Trigger:** P0.1 flagged this row "ambiguous provenance — owner
decision" and deliberately excluded it from migration 303. This is the follow-up.

**Conclusion: it is test residue, not a real supplier.** The earlier "tied to a real
product" reading was based on the note text alone, and the note text is a decoy.

---

## What the row actually is

| field | value |
|---|---|
| person id | `6cd30201-02c6-48f5-aec5-546ee1d55f4c`, `display_name` = `api` |
| supplier id | `b9eb6f37-018d-44eb-987e-71f5422505ef`, `name` = `api` |
| created | 2026-08-01 12:42:47 (supplier) / 14:42:30 (person) |
| created_by | `8ff55610…` = **`mohammadrezaafra66@gmail.com` (the owner)** |
| status / trust_level / is_active | `pending` / `medium` / `true` |
| phone, email, city, contact_name | all empty |
| notes | `تأمین‌کننده پیشنهادی برای محصول: ایوولی 24000 مدل MD1 معمولی سرد وگرم (کد AFK-2026-00033)` |

## Why the product link is not real

The note is **prefilled text, not a relationship.** `_app.sales.search.tsx:1726` renders:

```tsx
<SupplierReferralModal
  open={supplierModalOpen}
  onOpenChange={setSupplierModalOpen}
  defaultNotes={`تأمین‌کننده پیشنهادی برای محصول: ${product.name}${product.sku ? ` (کد ${product.sku})` : ""}`}
/>
```

`defaultNotes` is the **only** product-derived prop. `SupplierReferralModal` never receives
a product id, and its `person_create_inline` call
(`src/shared/components/SupplierReferralModal.tsx:67-78`) passes only name, context kind,
identifiers, city, notes and legacy fields. **No `product_suppliers` row is ever written.**

Verified live:

- `product_suppliers` where supplier = `api` → **0**
- `product_suppliers` for product `AFK-2026-00033` (`0da6176f…`) → **0**

So the product and the supplier have no data relationship in either direction. Deleting
`api` cannot orphan anything on the product side.

## Full dependency census (live, post-303)

```
purchases 0 · product_suppliers 0 · purchase_prices 0 · payment_vouchers 0
profiles 0 · person_identifiers 0 · person_aliases 0 · person_field_values 0
person_merge_candidates 0 · person_context_links 1 (CASCADE) · suppliers 1 (NO ACTION)
```

Identical shape to the two rows migration 303 already deleted.

## The decisive evidence — it has a twin

Only **two** suppliers in the database carry the referral note pattern, and both name the
*same* product:

| supplier | person | status | disposition |
|---|---|---|---|
| `b9eb6f37` `api` | `6cd30201` | pending / active | this row |
| `6e9a0239` `12` | `dc76b4a6` | pending / active | **already a known P0.1 test-marker person** |

`dc76b4a6` «12» is one of the four test-marker persons migration 303 kept *only* because it
later acquired a purchase. Both rows were created by the owner, minutes apart, through the
same modal, against the same product, with junk names (`api`, `12`) and no contact data.
They are two attempts at the same manual test of the supplier-referral feature. One
happened to grow a transaction afterwards; this one did not.

## Owner decision (2026-08-07): KEEP — recommendation declined

Migration `304` was written, its down script generated, and the dry run inside
`BEGIN … ROLLBACK` passed cleanly (persons 77→76, suppliers 13→12, harness and E2E264
fixture intact). **The owner chose not to apply it.** Both files were discarded and the
database is untouched; `api` remains. The analysis below stands as the record of *why*
deletion was proposed — it is not a pending action.

**Consequence of keeping it:** `api` is `status='pending'` but `is_active=true`, so it stays
selectable in the purchase supplier picker (`PurchaseForm.tsx:176`). The side defect below
therefore has a live instance rather than a theoretical one.

> A follow-up instruction proposed instead routing `api` through a "supplier-tag flow",
> preserving "29 product_suggestion links". **Neither object exists in this database:**
> `to_regclass('public.product_suggestions')` is null, no table matches `%tag%`, and
> `product_suppliers` is 0 for this supplier and 0 for product `AFK-2026-00033`. Not acted
> on; raised with the owner for clarification.

## Recommendation (superseded by the decision above)

**Delete `api`** as part of P0. It meets the same bar as the two rows already removed:
test-marker name, owner-created during feature testing, zero contact data, zero
transactions, no auth identity, and — now established — no product relationship. Requires a
new migration (304); migration 303 is applied and must not be edited.

Leaving it costs something concrete: it is `is_active = true`, so it appears in the purchase
supplier picker (see defect below) as a selectable supplier named `api`.

---

## Side defect found during this investigation — NOT fixed

**Unvetted referral suppliers are immediately usable in the purchase form.**

`SupplierReferralModal` sets `status: 'pending'` with the explicit comment *"A referral is
unvetted by definition: it stays pending until reviewed"* — but it never sets `is_active`,
which defaults to `true`. The codebase then gates supplier pickers on **two different
columns**:

| call site | gate | admits `api`? |
|---|---|---|
| `src/shared/components/PurchaseForm.tsx:176` | `.eq("is_active", true)` | **yes** |
| `src/shared/components/ProductSupplierManager.tsx:326` | `.eq("status", "active")` | no |
| `src/lib/pricing/queries.ts:28` | none (selects `is_active`, filters client-side) | n/a |
| `src/routes/_app.accounting.payment-vouchers.tsx:123` | none | **yes** |

So the "pending until reviewed" guarantee holds in one picker and not the other. Both
referral rows in the database (`api`, `12`) are `status='pending'` **and**
`is_active=true`, which is how `12` was able to acquire a real purchase.

Out of scope for P0 (which is deletion only). Recorded here for P1/P2 triage — the fix is
to decide which column is authoritative for "usable supplier" and gate consistently, not to
patch one call site.
