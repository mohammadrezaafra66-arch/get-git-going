# AfraKala 49 Fixes — Group 2 Repro Matrix

Phase Label: GROUP-2 / STABILIZATION PACK  
Status: Draft  
Owner: Mahdi Heydari  
Source of Truth: GitHub  
Scope: Group 2 only — Blocking Bugs and Data Integrity  
Allowed backlog items: 21, 23, 24, 27, 28, 29, 30, 31

---

## 1. Purpose

This document defines the initial Repro Matrix for Group 2 of the AfraKala 49-fixes package.

Group 2 is limited to stabilization issues related to data flow, form state, relation integrity, search logic, permission propagation, and pricing fallback logic.

No feature work is allowed in this stage.

No code change is allowed before each bug has:

1. Repro case
2. Expected behavior
3. Current behavior
4. Suspected domain
5. Risk level
6. Regression evidence requirement

---

## 2. Non-negotiable Rules

- GitHub is the source of truth.
- Group 1 outputs are the baseline.
- This group is Cursor-led.
- Lovable must not fix business logic, pricing logic, permissions, migrations, API, or data layer.
- No Laravel.
- No parallel backend.
- No parallel database.
- No parallel API.
- No API change without contract-first review.
- No migration without explicit approval and rollback plan.
- No PR without evidence.
- No fix without Repro Matrix.
- No fix without Task Packet.

---

## 3. Source Inventory Summary

### Customer / Person / Preinvoice candidates

Likely files:

- `src/components/persons/PersonContextLinksForm.tsx`
- `src/components/persons/PersonForm.tsx`
- `src/components/persons/PersonIdentifiersForm.tsx`
- `src/lib/customers/functions.ts`
- `src/lib/customers/schemas.ts`
- `src/lib/persons/context-links.functions.ts`
- `src/lib/persons/context-links.schemas.ts`
- `src/lib/persons/functions.ts`
- `src/lib/persons/identifiers-normalize.ts`
- `src/lib/persons/identifiers.functions.ts`
- `src/lib/persons/schemas.ts`
- `src/routes/_app.persons.tsx`
- `src/routes/_app.persons_.create.tsx`
- `src/routes/_app.persons_.$personId.edit.tsx`
- `src/routes/_app.sales_.customers.tsx`
- `src/routes/_app.sales_.customers_.create.tsx`
- `src/routes/_app.sales_.customers_.$customerId.edit.tsx`
- `src/routes/_app.sales_.invoices.tsx`
- `src/routes/_app.sales_.invoices_.create.tsx`
- `src/routes/_app.sales_.invoices_.$invoiceId.tsx`
- `src/shared/components/CustomerForm.tsx`
- `src/shared/components/CustomerImportForm.tsx`
- `src/shared/components/InvoiceForm.tsx`
- `src/shared/components/QuickAddCustomerDialog.tsx`

### Product / Label / Search / Tag / Update candidates

Likely files:

- `src/components/products/ProductForm.tsx`
- `src/components/products/ProductFilters.tsx`
- `src/components/products/ProductLabelsQuickDialog.tsx`
- `src/components/products/ProductPublishPricesCard.tsx`
- `src/components/products/OwnerAssignDialog.tsx`
- `src/components/ui/searchable-select.tsx`
- `src/lib/i18n/search-normalizer.ts`
- `src/lib/products/audit.ts`
- `src/lib/products/category-attrs.ts`
- `src/lib/products/constants.ts`
- `src/lib/products/display-name.ts`
- `src/lib/products/duplicate-check.ts`
- `src/lib/products/name-template.ts`
- `src/lib/products/queries.ts`
- `src/lib/products/regenerate-names.ts`
- `src/lib/products/schemas.ts`
- `src/routes/_app.products.index.tsx`
- `src/routes/_app.products.$id.tsx`
- `src/routes/_app.products.new.tsx`
- `src/routes/_app.products.labels.tsx`
- `src/routes/_app.sales.search.tsx`
- `supabase/migrations/20260506200000_batch_recent_purchase_labels.sql`
- `supabase/migrations/20260506210000_label_links_accountant_write.sql`

### Permission / Role candidates

Likely files:

- `src/components/rbac/RoleGuard.tsx`
- `src/lib/rbac/dynamic-permissions.ts`
- `src/lib/rbac/permissions-cache.ts`
- `src/lib/rbac/roles.ts`
- `src/lib/rbac/route-guards.ts`
- `src/lib/auth/AuthProvider.tsx`
- `src/lib/auth/session.ts`
- `src/lib/auth/diagnostics.ts`
- `src/routes/_app.roles.tsx`
- `src/routes/_app.admin.roles.tsx`
- `src/routes/unauthorized.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/nav-items.ts`
- `supabase/migrations/20260530130600_fix_auth_user_profile_trigger.sql`

### Pricing / Rule / Non-owned candidates

Likely files:

- `src/lib/pricing/engine.ts`
- `src/lib/pricing/queries.ts`
- `src/lib/pricing/schemas.ts`
- `src/lib/pricing/constants.ts`
- `src/lib/pricing/quick-price.ts`
- `src/lib/pricing/publish-prices.ts`
- `src/lib/pricing/workbench.ts`
- `src/lib/pricing/workbench-queries.ts`
- `src/lib/pricing/process-queue.functions.ts`
- `src/lib/pricing/process-recompute-queue.server.ts`
- `src/hooks/pricing/useComputedPricesRealtime.ts`
- `src/hooks/pricing/useAminHozoorBoardPrices.ts`
- `src/routes/_app.pricing.rules.tsx`
- `src/routes/_app.pricing.quick-price.tsx`
- `src/routes/_app.pricing.recompute-prices.tsx`
- `src/routes/_app.pricing.live-price-list.tsx`
- `src/routes/_app.pricing.sale-lists.tsx`
- `src/routes/_app.pricing.sale-lists_.$listId.tsx`
- `src/routes/_app.sales.credit-rules.tsx`
- `src/routes/api/public/hooks/process-pricing-queue.ts`
- `src/shared/components/ProductPriceCard.tsx`

---

## 4. Repro Matrix

| Item | Problem | Suspected Domain | Repro Steps | Expected Behavior | Current Behavior | Likely Tool | Risk |
|---|---|---|---|---|---|---|---|
| 21 | ثبت شخص جدید در پیش‌فاکتور مشکل دارد | Person / Invoice / Quick Add / Relation Integrity | 1. Open invoice or preinvoice create page. 2. Try to add a new person/customer from inside the flow. 3. Submit and check whether the person is created and attached correctly. | New person should be created once and linked to the invoice/preinvoice without losing form data. | Needs manual confirmation. Reported as blocking bug. | Cursor | High |
| 23 | ثبت مشتری جدید مشکل دارد | Customer Create / Customer Form / Validation / Duplicate Prevention | 1. Open customer create page. 2. Enter required customer fields. 3. Submit. 4. Check database/list/detail behavior. | Customer should be created once, validated, visible in list/detail, and not duplicated. | Needs manual confirmation. Reported as blocking bug. | Cursor | High |
| 24 | تغییرات ذخیره‌نشده در ویرایش محصول از بین می‌رود | Product Edit Form / Dirty State / Unsaved Changes Guard | 1. Open product edit page. 2. Change one or more fields. 3. Navigate away without saving. | User should receive warning, or draft/guard should prevent silent data loss. | Unsaved changes may be lost silently. | Cursor | Medium |
| 27 | ویرایش label به جای update، item جدید می‌سازد | Product Labels / Update-vs-Create Logic / Form Submit Flow | 1. Open product labels management. 2. Edit an existing label. 3. Save. 4. Check whether existing row updates or a new row is created. | Existing label should be updated in place. | Editing may create a new label/item instead of updating. | Cursor | High |
| 28 | جست‌وجوی محصول مشکل دارد | Product Search / Search Normalizer / Query Logic / Filters | 1. Open product list or sales search page. 2. Search by product name/model/brand/tag. 3. Compare expected matching products with result list. | Search should return matching products consistently across Persian/English/normalized terms. | Needs manual confirmation. Reported as search bug. | Cursor | Medium |
| 29 | جست‌وجوی تگ‌ها مشکل دارد | Tag Search / Label Search / Searchable Select / Normalizer | 1. Open product/tag/label selection UI. 2. Search for existing tags. 3. Compare expected tags with result list. | Existing tags should be searchable and selectable. | Needs manual confirmation. Reported as tag search bug. | Cursor | Medium |
| 30 | Role/Tagهای جدید در Dynamic Permissions نمایش داده نمی‌شوند | RBAC / Dynamic Permissions / Permission Cache / Role Propagation | 1. Create or identify new role/tag. 2. Open dynamic permissions or role management page. 3. Check whether the new role/tag appears. | New roles/tags should propagate to dynamic permissions without stale cache. | New roles/tags may not appear. | Cursor | High |
| 31 | Pricing Rule برای non-owned products خطا دارد | Pricing Engine / Rule Matching / Owner Fallback / Computed Prices | 1. Identify a product without assigned owner. 2. Apply pricing rule calculation. 3. Compare result with expected fallback behavior. | Non-owned products should use approved fallback pricing rule without crash or wrong result. | Pricing rule may fail or produce wrong result for non-owned products. | Cursor | High |

---

## 5. Required Evidence Per Item

For every item before fix:

- Exact page or route
- Exact user role used in test
- Exact data entered
- Screenshot or screen recording if UI-visible
- Current behavior
- Expected behavior
- Suspected files
- Risk level

For every item after fix:

- Fix summary
- Changed files
- Test command output
- Manual acceptance evidence
- Regression evidence
- Rollback note

---

## 6. Stop Conditions

Stop immediately if:

- The bug cannot be reproduced.
- The suspected fix needs migration.
- The suspected fix needs RLS/RBAC change.
- The suspected fix needs new API without contract.
- The suspected fix touches files outside Group 2.
- Lovable attempts to change business logic, pricing logic, permission logic, migration, API, or data layer.
- A PR mixes unrelated batches.
- Evidence is missing.

---

## 7. Current Status

This matrix is a draft based on source inventory.

Next required action:

Manual reproduction for each of the 8 items must confirm or correct the repro steps before any fix starts.
