# AfraKala 49 Fixes — Group 2 Task Packets

Phase Label: GROUP-2 / STABILIZATION PACK  
Status: Draft  
Owner: Mahdi Heydari  
Source of Truth: GitHub  
Scope: Group 2 only — Blocking Bugs and Data Integrity  
Allowed backlog items: 21, 23, 24, 27, 28, 29, 30, 31

---

## 1. Purpose

This file defines Task Packets for Group 2 only.

Group 2 is limited to stabilization issues related to:

- person/customer creation flow
- invoice/preinvoice relation integrity
- product edit unsaved-state protection
- product label update behavior
- product and tag search behavior
- dynamic permissions propagation
- pricing rule fallback for non-owned products

No implementation may start until the relevant Task Packet is reviewed and accepted.

---

## 2. Shared Group 2 Rules

- GitHub is the source of truth.
- Group 1 governance is the baseline.
- Group 2 Repro Matrix is the required planning baseline.
- No direct work on `main`.
- No source code change is allowed from this document alone.
- No Lovable-generated business logic is allowed.
- Cursor may inspect and implement only after the Task Packet is approved.
- Lovable may be used only for UI-only changes if a Task Packet explicitly allows it.
- No migration without explicit approval and rollback plan.
- No API change without contract-first review.
- No RLS/RBAC change without explicit approval.
- No fix without evidence.
- No mixed-group changes.

---

## 3. Shared Stop Conditions

Stop immediately if:

- manual reproduction is missing where required
- the issue cannot be reproduced by the responsible domain user
- the suspected fix requires migration
- the suspected fix requires RLS/RBAC policy changes
- the suspected fix requires a new API or API contract change
- the suspected fix touches files outside the allowed paths
- Lovable attempts to change business logic, pricing logic, permissions, migrations, API, or data layer
- the PR includes unrelated changes
- evidence or rollback notes are missing

---

# Task Packet AFK-G2-021

task_id: AFK-G2-021  
group_id: GROUP-2  
backlog_item: 21  
title: ثبت شخص جدید در پیش‌فاکتور  
status: Draft — pending manual domain-user repro  
owner: Mahdi Heydari  
manual_repro_owner: accounting/sales  
likely_tool: Cursor after repro confirmation  
risk: High

## Problem

The flow for adding a new person/customer from inside the invoice/preinvoice creation flow may be broken or may fail to attach the new person to the document correctly.

## Manual Repro Requirement

This item must be tested by accounting or sales, not by the coordinator, because it requires domain knowledge of invoice/preinvoice creation.

Required manual evidence:

- exact route
- user role
- test person/customer data
- whether the person was created
- whether the person was attached to the invoice/preinvoice
- whether existing invoice/preinvoice form data was preserved
- exact error message or screenshot if failed

## Suspected Domain

- Person creation
- Customer quick-add
- Invoice/preinvoice form state
- Relation integrity

## Allowed Paths For Inspection

- `src/shared/components/InvoiceForm.tsx`
- `src/shared/components/QuickAddCustomerDialog.tsx`
- `src/shared/components/CustomerForm.tsx`
- `src/lib/persons/**`
- `src/lib/customers/**`
- `src/routes/_app.sales_.invoices*.tsx`
- `src/routes/_app.invoices.tsx`

## Forbidden Paths

- unrelated product/pricing/RBAC files
- migrations unless explicitly approved
- API contracts unless explicitly approved
- generated `dist/**`
- unrelated docs

## Acceptance Criteria

- New person/customer can be created once from inside the invoice/preinvoice flow.
- Created person/customer is attached to the active invoice/preinvoice.
- Existing invoice/preinvoice draft data is not lost.
- Duplicate rows are not created.
- Validation errors are visible and actionable.
- Regression evidence is attached to the PR.

## Rollback Plan

Revert the implementation PR if the flow creates duplicate people/customers, loses invoice form data, or breaks existing customer selection.

---

# Task Packet AFK-G2-023

task_id: AFK-G2-023  
group_id: GROUP-2  
backlog_item: 23  
title: ثبت مشتری جدید  
status: Draft — pending manual domain-user repro  
owner: Mahdi Heydari  
manual_repro_owner: accounting/sales  
likely_tool: Cursor after repro confirmation  
risk: High

## Problem

The standalone customer creation flow may fail, create invalid data, or fail to show the created customer in list/detail pages.

## Manual Repro Requirement

This item must be tested by accounting or sales.

Required manual evidence:

- exact route
- user role
- test customer data
- whether customer creation succeeded
- whether the customer appears in list/detail
- whether duplicate customer prevention works
- exact error message or screenshot if failed

## Suspected Domain

- Customer form
- Customer schema validation
- Customer server functions
- Duplicate prevention
- List/detail refresh behavior

## Allowed Paths For Inspection

- `src/shared/components/CustomerForm.tsx`
- `src/shared/components/CustomerImportForm.tsx`
- `src/lib/customers/functions.ts`
- `src/lib/customers/schemas.ts`
- `src/routes/_app.sales_.customers.tsx`
- `src/routes/_app.sales_.customers_.create.tsx`
- `src/routes/_app.sales_.customers_.$customerId.edit.tsx`

## Forbidden Paths

- unrelated invoice logic unless linked by repro
- unrelated product/pricing/RBAC files
- migrations unless explicitly approved
- generated `dist/**`

## Acceptance Criteria

- Customer creation succeeds with valid data.
- Created customer appears in list/detail views.
- Duplicate customer behavior is correct and user-visible.
- No unrelated customer data is modified.
- Regression evidence is attached to the PR.

## Rollback Plan

Revert the implementation PR if customer creation, listing, detail, or duplicate prevention regresses.

---

# Task Packet AFK-G2-024

task_id: AFK-G2-024  
group_id: GROUP-2  
backlog_item: 24  
title: جلوگیری از از بین رفتن تغییرات ذخیره‌نشده در ویرایش محصول  
status: Draft  
owner: Mahdi Heydari  
manual_repro_owner: product owner / product manager  
likely_tool: Cursor  
risk: Medium

## Problem

Unsaved changes in product edit flow may be lost silently when the user navigates away, refreshes, changes route, or triggers another UI action.

## Manual Repro Requirement

Required evidence:

- exact product edit route
- changed fields
- navigation or action that causes data loss
- whether warning/draft protection appears
- screenshot or recording if possible

## Suspected Domain

- Product edit form
- Dirty-state detection
- Navigation guard
- Form reset behavior

## Allowed Paths For Inspection

- `src/components/products/ProductForm.tsx`
- `src/routes/_app.products.$id.tsx`
- `src/routes/_app.products.new.tsx`
- `src/lib/products/schemas.ts`
- `src/lib/products/queries.ts`

## Forbidden Paths

- pricing engine
- customer/person modules
- migrations unless explicitly approved
- generated `dist/**`

## Acceptance Criteria

- Unsaved product edits are not silently lost.
- User gets a clear warning or guard before leaving.
- Existing product save behavior remains unchanged.
- No unrelated product fields are modified.
- Regression evidence is attached to the PR.

## Rollback Plan

Revert if product editing, saving, or navigation becomes unstable.

---

# Task Packet AFK-G2-027

task_id: AFK-G2-027  
group_id: GROUP-2  
backlog_item: 27  
title: ویرایش label نباید item جدید بسازد  
status: Draft  
owner: Mahdi Heydari  
manual_repro_owner: product owner / product manager  
likely_tool: Cursor  
risk: High

## Problem

Editing an existing label may incorrectly create a new label/item instead of updating the existing row.

## Manual Repro Requirement

Required evidence:

- exact route
- existing label before edit
- edited label value
- row count before/after
- whether a duplicate was created
- screenshot if possible

## Suspected Domain

- Product labels page
- Product labels quick dialog
- Update-vs-create submit logic
- Label links persistence

## Allowed Paths For Inspection

- `src/components/products/ProductLabelsQuickDialog.tsx`
- `src/routes/_app.products.labels.tsx`
- `src/lib/products/**`
- `supabase/migrations/20260506200000_batch_recent_purchase_labels.sql`
- `supabase/migrations/20260506210000_label_links_accountant_write.sql`

## Forbidden Paths

- new migration unless explicitly approved
- unrelated product pricing files
- customer/person modules
- generated `dist/**`

## Acceptance Criteria

- Editing an existing label updates that label in place.
- No duplicate label/item is created.
- Existing label links remain valid.
- Regression evidence includes before/after row behavior.

## Rollback Plan

Revert if label creation, editing, or existing label links regress.

---

# Task Packet AFK-G2-028

task_id: AFK-G2-028  
group_id: GROUP-2  
backlog_item: 28  
title: جست‌وجوی محصول  
status: Draft  
owner: Mahdi Heydari  
manual_repro_owner: sales/product user  
likely_tool: Cursor  
risk: Medium

## Problem

Product search may fail to return expected products consistently by name, model, brand, color, tag, or normalized Persian/English terms.

## Manual Repro Requirement

Required evidence:

- exact route
- search terms used
- expected products
- actual products returned
- whether normalization matters
- screenshot if possible

## Suspected Domain

- Product filters
- Product queries
- Search normalizer
- Sales search

## Allowed Paths For Inspection

- `src/components/products/ProductFilters.tsx`
- `src/lib/i18n/search-normalizer.ts`
- `src/lib/products/queries.ts`
- `src/routes/_app.products.index.tsx`
- `src/routes/_app.sales.search.tsx`
- `src/components/ui/searchable-select.tsx`

## Forbidden Paths

- pricing engine unless repro proves dependency
- customer/person modules
- migrations unless explicitly approved
- generated `dist/**`

## Acceptance Criteria

- Product search returns expected matches.
- Persian/English normalization behavior is consistent.
- Search behavior is not broadened dangerously.
- Existing filters still work.
- Regression evidence is attached to the PR.

## Rollback Plan

Revert if product search becomes slower, broader than expected, or breaks existing filters.

---

# Task Packet AFK-G2-029

task_id: AFK-G2-029  
group_id: GROUP-2  
backlog_item: 29  
title: جست‌وجوی تگ‌ها  
status: Draft  
owner: Mahdi Heydari  
manual_repro_owner: sales/product user  
likely_tool: Cursor  
risk: Medium

## Problem

Tag or label search may fail to find existing tags, especially in searchable selects or label selection UI.

## Manual Repro Requirement

Required evidence:

- exact route/component
- existing tag/label
- search term
- expected result
- actual result
- screenshot if possible

## Suspected Domain

- Searchable select
- Product labels quick dialog
- Tag/label search normalization
- Product labels page

## Allowed Paths For Inspection

- `src/components/products/ProductLabelsQuickDialog.tsx`
- `src/components/ui/searchable-select.tsx`
- `src/lib/i18n/search-normalizer.ts`
- `src/routes/_app.products.labels.tsx`
- `src/lib/products/**`

## Forbidden Paths

- unrelated pricing engine
- customer/person modules
- migrations unless explicitly approved
- generated `dist/**`

## Acceptance Criteria

- Existing tags/labels are searchable and selectable.
- Partial and normalized search behavior is correct.
- No duplicate tag/label is created by search.
- Regression evidence is attached to the PR.

## Rollback Plan

Revert if tag selection, label editing, or existing search behavior regresses.

---

# Task Packet AFK-G2-030

task_id: AFK-G2-030  
group_id: GROUP-2  
backlog_item: 30  
title: Role/Tagهای جدید در Dynamic Permissions نمایش داده نمی‌شوند  
status: Draft  
owner: Mahdi Heydari  
manual_repro_owner: admin / manager  
likely_tool: Cursor  
risk: High

## Problem

New roles/tags may not appear in Dynamic Permissions, likely because of stale cache, missing invalidation, or incomplete role propagation.

## Manual Repro Requirement

Required evidence:

- exact role/tag created or identified
- exact dynamic permissions route
- expected visibility
- actual visibility
- whether refresh/logout/login changes result
- screenshot if possible

## Suspected Domain

- Dynamic permissions
- Permissions cache
- Roles management
- Auth provider
- Route guards

## Allowed Paths For Inspection

- `src/lib/rbac/dynamic-permissions.ts`
- `src/lib/rbac/permissions-cache.ts`
- `src/lib/rbac/roles.ts`
- `src/lib/rbac/route-guards.ts`
- `src/components/rbac/RoleGuard.tsx`
- `src/lib/auth/AuthProvider.tsx`
- `src/routes/_app.roles.tsx`
- `src/routes/_app.admin.roles.tsx`
- `src/components/layout/AppSidebar.tsx`
- `src/components/layout/nav-items.ts`

## Forbidden Paths

- RLS policy changes unless explicitly approved
- migrations unless explicitly approved
- customer/person/product/pricing changes unless repro proves dependency
- generated `dist/**`

## Acceptance Criteria

- New roles/tags appear in Dynamic Permissions after approved creation flow.
- Cache invalidation or refresh behavior is clear and reliable.
- Existing role-based access remains unchanged.
- Regression evidence includes before/after permission visibility.

## Rollback Plan

Revert if users lose access, gain unintended access, or route guards regress.

---

# Task Packet AFK-G2-031

task_id: AFK-G2-031  
group_id: GROUP-2  
backlog_item: 31  
title: Pricing Rule برای non-owned products خطا دارد  
status: Draft  
owner: Mahdi Heydari  
manual_repro_owner: pricing/accounting/product owner  
likely_tool: Cursor  
risk: High

## Problem

Pricing rules may fail or produce wrong results for products without an assigned owner. The expected fallback behavior must be confirmed before implementation.

## Manual Repro Requirement

Required evidence:

- exact product with no owner
- exact pricing route
- rule applied
- expected fallback rule
- actual error/result
- screenshot or error output if possible

## Suspected Domain

- Pricing engine
- Pricing queries
- Owner fallback
- Computed prices
- Recompute queue

## Allowed Paths For Inspection

- `src/lib/pricing/engine.ts`
- `src/lib/pricing/queries.ts`
- `src/lib/pricing/schemas.ts`
- `src/lib/pricing/constants.ts`
- `src/lib/pricing/quick-price.ts`
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
- `src/routes/api/public/hooks/process-pricing-queue.ts`
- `src/shared/components/ProductPriceCard.tsx`

## Forbidden Paths

- migration unless explicitly approved
- RLS/RBAC changes unless explicitly approved
- customer/person modules
- generated `dist/**`

## Acceptance Criteria

- Non-owned products do not crash pricing rule calculation.
- Approved fallback behavior is applied consistently.
- Owned-product pricing behavior remains unchanged.
- Recompute queue behavior remains stable.
- Regression evidence is attached to the PR.

## Rollback Plan

Revert if pricing calculations, recompute queue, live price list, or quick price behavior regresses.

---

## 4. Group 2 Execution Order

Recommended execution order:

1. AFK-G2-021 and AFK-G2-023 after accounting/sales repro confirmation
2. AFK-G2-024
3. AFK-G2-027
4. AFK-G2-028 and AFK-G2-029
5. AFK-G2-030
6. AFK-G2-031

If domain-user repro is unavailable, keep the item pending and move to the next non-blocked documentation or planning task.

---

## 5. Current Status

This file is a draft Task Packet set.

Implementation is still blocked until:

- the relevant Task Packet is reviewed
- manual reproduction is confirmed where required
- the implementer prepares evidence and rollback plan
