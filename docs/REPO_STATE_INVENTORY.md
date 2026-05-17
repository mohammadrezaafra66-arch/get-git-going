# AfraKala — Repository State Inventory

Status: official anti-duplication reference. Derived from task **AFRA-20260517-INFRA-U01-S20-C01** (accepted) and published under task **AFRA-20260517-INFRA-U01-S21-DOC**.

Owners must read this file (and `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`) before opening any prompt that adds modules, changes schema, introduces a migration, or touches identity/auth/RBAC. It is the source of truth for "what already exists" and "what must NOT be rebuilt".

The README's historical "Phase 1 — Skeleton" label is stale. The repo holds 220 migrations, 130+ routes, and most phases are partially or fully implemented.

---

## 1. Existing implementation summary

- **Routes**: 130+ TanStack file-based routes under `src/routes/` (app, admin, public, bot API).
- **Migrations**: 220 timestamped SQL files under `supabase/migrations/`.
- **Libs**: persons, customers, products, pricing (large), sales, accounting, rbac, operations/gamification, market-intelligence, market-rates-ingestion, public sale-list, profile-fields, validation, data-tables, knowledge, feedback, academy.
- **Components**: shared forms (Customer, Invoice, Purchase, Supplier, Waybill, PaymentReceipt, Quiz, Lesson, Course, Feedback, Knowledge), accounting OCR pipeline, persons forms, pricing dashboards/boards, sales quotes, products catalog, gamification mood.
- **Deploy**: full self-host stack under `deploy/` (app prod+dev compose, full Supabase self-host stack, Caddy proxy, backups + restore drill, LAN/local/migration tooling). CI: `.github/workflows/build-image.yml` → GHCR.
- **Docs**: governance set in `docs/self-host-governance/`, plus PRICING_RECOMPUTE_WORKER, PERSONS_SCHEMA_DESIGN, BOT_*, MIGRATION_SAFETY_POLICY, OPERATIONS_QUICK_REFERENCE, INTERNET_RESILIENCE, SELF_HOST_ROADMAP_FA, SELF_HOST_UPDATE_RUNBOOK.

---

## 2. Phase map

| Phase | Area | Status |
|---|---|---|
| 1 | Auth / RBAC / shell | complete |
| 2 | Persons + Customers link | partial (S17–S19A done; QuickAdd/Import not migrated; no `searchPersons`) |
| 3 | Products | complete |
| 4 | Pricing engine + queue + workbench + boards + market intel | complete (sensitive) |
| 5 | Purchases | partial |
| 6 | Suppliers | partial (pre-persons) |
| 7 | Sales (search, quotes, send queue, share, stock alerts) | partial |
| 8 | Invoices + Waybills | partial, risky |
| 9 | Accounting (receipts, payables, receivables, bank, external-parties) | partial, broad |
| 10 | Credit | partial |
| 11 | Knowledge / Feedback / Academy / Notifications / Data-tables / Admin schema | partial |
| 12 | Self-host / Deploy / Security | complete (ongoing hardening) |
| + | Bot public API (`/api/public/bot/*`) | partial, intentionally parallel to serverFns |

---

## 3. Module map

Legend — Status: **complete** · **partial** · **scaffold** · **risky** · **needs focused inventory**.
Every artifact listed below is "must NOT be rebuilt" by default.

### 3.1 persons — partial
- **Routes**: `_app.persons.tsx`, `_app.persons_.create.tsx`, `_app.persons_.$personId.edit.tsx`.
- **Components**: `src/components/persons/{PersonForm,PersonIdentifiersForm,PersonContextLinksForm}.tsx`.
- **ServerFns / libs**: `src/lib/persons/{functions,schemas,identifiers.functions,identifiers-normalize,context-links.functions,context-links.schemas}.ts`.
- **Tables**: `persons`, `person_identifiers`, `person_field_definitions`, `person_field_values`, `person_context_links` (per `docs/PERSONS_SCHEMA_DESIGN.md`).
- **RLS**: `persons_select_by_visibility_scope` (internal_general / restricted_finance / restricted_executive); `persons_insert_admin_manager`, `persons_update_admin_manager`; `person_identifiers_select_via_person` + admin/manager write.
- **Audit**: writes flow through serverFns on user-scoped client → existing audit triggers fire.
- **Gaps**: no `searchPersons` serverFn; identifier-based search undecided (existence-leak risk).

### 3.2 customers — partial
- **Routes**: `_app.sales_.customers.tsx`, `_app.sales_.customers_.create.tsx`, `_app.sales_.customers_.$customerId.edit.tsx`, `_app.sales_.customers_.$customerId.credit.tsx`, `_app.sales.customers_.import.tsx`, `_app.sales.credit-customers.tsx`.
- **Components**: `CustomerForm` (migrated to serverFn), `QuickAddCustomerDialog` (direct-write), `CustomerImportForm` (direct-write).
- **ServerFns**: `src/lib/customers/{functions,schemas}.ts` — `createCustomer`, `updateCustomer`, `customer_set_person` / `customer_clear_person` RPC wrappers.
- **Tables**: `customers` with nullable `person_id` FK (S17). RPCs `customer_set_person` / `customer_clear_person` (SECURITY INVOKER, S18A).
- **Gaps**: QuickAddCustomerDialog, CustomerImportForm, PaymentReceiptForm, InvoiceForm still write `customers` directly.

### 3.3 suppliers — partial (pre-persons)
- **Routes**: `_app.suppliers.tsx`, `_app.suppliers_.$supplierId.tsx`.
- **Components**: `SupplierForm`, `SupplierReferralModal` (direct insert), `ProductSupplierManager` (direct CRUD on `product_suppliers`).
- **Status**: no `supplier.person_id` link yet. **Needs focused inventory** before any persons linkage.

### 3.4 products — complete
- **Routes**: `_app.products.{index,new,$id,brands,categories,attributes,labels,regenerate-names}.tsx`.
- **Components**: ProductForm, ProductFilters, ProductPublishPricesCard, RecentPurchaseBadge/Group, ProductLabelsQuickDialog, OwnerAssignDialog, ProductRecommendationsCard.
- **Libs**: `src/lib/products/{queries,name-template,duplicate-check,recommendations,category-attrs,audit,constants,display-name,regenerate-names,schemas}.ts`.
- **RPCs**: `find_or_create_model`, `find_duplicate_product`, `get_recent_purchase_label`, `get_product_recommendations`.

### 3.5 pricing — complete (large, sensitive)
- **Routes** (20+): pricing dashboards, calculator, quick-price, rules, currencies + sources + rates, change-reasons, settlement-types, sale-price-types, shipping-rules, purchase-prices, price-alerts, product-recommendations, sale-lists (+publish + public), live-price-list, my-workbench, market-rates-workshop, market-intelligence, amin-hozoor-board.
- **Libs**: `src/lib/pricing/{engine,queries,workbench,workbench-queries,workbench-filters,workbench-csv,process-queue.functions,process-recompute-queue.server,publish-prices,price-alerts,price-history,quick-price,board-access,board-presence,board-settings,effective-currencies,constants,schemas}.ts`; market-rates ingestion + providers; `src/lib/management/market-intelligence.ts`.
- **Hooks**: `useAminHozoorBoardPrices`, `useComputedPricesRealtime`, `usePricingBoardAccess`, `usePricingBoardPresence`, `useProductPriceHistory(+Realtime)`.
- **Docs**: `PRICING_RECOMPUTE_WORKER*.md`, `BOT_HANDOFF_PRODUCT_PRICE_OBSERVATORY.md`, `DT.7A_FIX_OBSERVATORY_COLUMN_CONTRACT.md`.
- **Constraint**: queue worker (`process-recompute-queue.server.ts`) and client-callable serverFn (`process-queue.functions.ts`) are intentionally distinct — do NOT merge.

### 3.6 purchases — partial
- **Routes**: `_app.purchases.tsx`, `_app.purchases_.create.tsx`.
- **Components**: `PurchaseForm` (direct insert on `purchase_items`), `ProductSupplierManager`.

### 3.7 sales / search — partial
- **Routes**: `_app.sales{,index,search,stock-alerts,send-queue,quote-share-logs,credit-rules}.tsx`.
- **Components**: StockAlert{Button,Dialog,StatusBadge}, ObservatoryBadges, SalesProductRecommendations.
- **Libs**: `src/lib/sales/{stock-alerts,observatory-snippets,quote-send-queue}.ts`.

### 3.8 quotes — partial
- **Routes**: `_app.sales.quotes.{index,new,$quoteId}.tsx`.
- **Components**: QuoteStatusBadge, ShareQuoteDialog (direct insert `sales_quote_share_logs`).
- **Libs**: `src/lib/sales/{quotes,quote-pdf,quote-share}.ts`.

### 3.9 invoices — partial, **risky**
- **Routes**: `_app.invoices.tsx`, `_app.sales_.invoices*.tsx`, waybill subroutes.
- **Components**: `InvoiceForm`, `AdvancePaymentSection`.
- **Direct writes**: `InvoiceForm` inserts `invoice_items`, deletes `invoices` + `invoice_items` on rollback, writes `audit_logs`, calls 2 RPCs.
- **Risk**: large client-side transactional-looking path — migrate plan-first, never piecemeal.

### 3.10 delivery / waybills — partial
- **Routes**: `_app.sales_.invoices_.$invoiceId.waybill{,.create}.tsx`, `_app.admin.waybill-fields.tsx`.
- **Components**: WaybillForm, WaybillCustomFieldsInput, WaybillStatusBadge.

### 3.11 accounting — partial, broad
- **Routes**: `_app.accounting.{bank-accounts,daily-capital,external-parties,payables,receivables,purchase-payments,customer-capital-allocations,salesperson-capital-allocations,receipts,receipts.create,receipts.$receiptId}.tsx`.
- **Components**: `PaymentReceiptForm` (direct delete + audit + 1 RPC + writes customers), `AdvancePaymentSection`, `accounting/PaymentReceiptDocuments` (7× audit inserts, OCR pipeline).
- **Libs**: `src/lib/accounting/{receipt-extraction,receipt-security}.ts`.
- **Risk**: `external-parties` may overlap with `persons`. **Needs focused inventory.**

### 3.12 credit — partial
- **Routes**: `_app.sales.credit-customers.tsx`, `_app.sales.credit-rules.tsx`, `_app.sales_.customers_.$customerId.credit.tsx`.

### 3.13 reports / analytics — scaffold-to-partial
- **Routes**: `_app.reports.tsx`, `_app.market-matches.tsx`, `_app.marketing.suggestions{,-history}.tsx`.
- **Libs**: `src/lib/analytics/product-interactions.ts`, `src/lib/management/market-intelligence.ts` (10 RPC reads). **Needs focused inventory** before any reports prompt.

### 3.14 knowledge / messages / feedback / academy — partial
- **Routes**: `_app.knowledge*.tsx`, `_app.messages.tsx`, `_app.notifications.tsx`, `_app.feedback*.tsx`, `_app.academy*.tsx`.
- **Components**: KnowledgeDocumentForm, FeedbackForm, FeedbackAttachmentUploader, CourseForm, LessonForm, QuizForm, QuizTaker, NotificationBell.

### 3.15 dynamic data-tables / profile-fields / workflows — partial, sensitive (schema-shaping)
- **Routes**: `_app.data-tables.{index,new,$tableId}.tsx`, `_app.admin.{profile-fields,validation-rules,workflow-stages,marketing-channels,recent-purchase-settings,receipt-fields,waybill-fields,roles,settings}.tsx`.
- **Libs**: `src/lib/data-tables/{constants,csv-export}.ts`, `src/lib/profile-fields/{queries,types}.ts`, `src/lib/validation/rules.ts`.

### 3.16 bot / public API — partial (parallel by design)
- **Server routes**: `src/routes/api.healthz.ts`, `api.public.bot.dynamic-tables.*`, `api.public.bot.market-matches.{candidates.upsert,resolve}.ts`, `api.public.bot.products{,.$productId}.ts`.
- **Admin UI**: `_app.bot-api-keys.{index,docs,playground,usage,tsx}`.
- **Server lib**: `src/server/bot-api.ts`.
- **Constraint**: do NOT "consolidate" with serverFns.

### 3.17 self-host / deploy / security — complete (ongoing)
- **Stacks**: `deploy/{app(prod+dev compose),supabase(full self-host),proxy(Caddy),backups(scripts+restore drill),local,lan,migration}`.
- **Docs**: `SELF_HOSTING.md`, `SELF_HOST_ROADMAP_FA.md`, `SELF_HOST_UPDATE_RUNBOOK.md`, `MIGRATION_SAFETY_POLICY.md`, `INTERNET_RESILIENCE.md`, `OPERATIONS_QUICK_REFERENCE.md`, full `docs/self-host-governance/` set.
- **Gaps**: no CI migration-policy linter; restore drill documented but not scheduled.

---

## 4. Duplication-prevention findings (parallel paths)

1. **Customer writes — TWO paths today**: `createCustomer`/`updateCustomer` serverFn vs direct `from("customers")` in `CustomerImportForm`, `QuickAddCustomerDialog`, `InvoiceForm`, `PaymentReceiptForm`, credit pages. **Highest duplication risk.**
2. **Identity stores**: `customers`, `suppliers`, `accounting.external_parties`, plus future quotes/waybills receivers — all converge on `persons` per Phase 2. **Do NOT add a new "parties" table or wrapper.**
3. **`responsible_id` (profiles) vs `person_id` (persons)** on customers — distinct roles. Must not be conflated.
4. **Persons admin list** uses browser client intentionally; a future person-picker must use a serverFn (`searchPersons`) — do NOT reuse the list-page hook.
5. **Audit log inserts** scattered across 30+ files with no central helper — risk of drift in `action`/`entity_type` strings.
6. **Pricing queue**: `process-queue.functions.ts` (client-callable) vs `process-recompute-queue.server.ts` (worker) — intentionally distinct.
7. **Bot public API** vs internal serverFns — intentionally parallel.
8. **Receipt OCR**: `receipt-ocr.functions.ts` and `receipt-ocr-bytes.functions.ts` — verify intent before adding a third.
9. **Notifications**: RPC writers + direct `notification_events` inserts (`pricing/board-access.ts`). Verify a single canonical writer before adding more.
10. **Navigation** (`src/components/layout/nav-items.ts`): one source of truth — no parallel registry.

---

## 5. Direct write map (snapshot, do NOT fix here)

### Acceptable lib-layer writes (controlled, audited)
- `src/lib/pricing/{workbench,price-alerts,board-access,board-settings,effective-currencies}.ts`
- `src/lib/products/{audit,recommendations}.ts`
- `src/lib/operations/gamification*.ts`
- `src/lib/analytics/product-interactions.ts`

### Should migrate to serverFn later (sensitive identity / financial)
- `src/shared/components/QuickAddCustomerDialog.tsx` — `customers` insert → **S19C candidate**
- `src/shared/components/CustomerImportForm.tsx` — `customers` insert + audit → **S19D candidate**
- `src/shared/components/InvoiceForm.tsx` — invoice_items insert, invoices/invoice_items delete, audit, 2 RPCs → **risky, plan only**
- `src/shared/components/PaymentReceiptForm.tsx` — receipt delete, audit, 1 RPC + customers writes → **risky**
- `src/components/accounting/PaymentReceiptDocuments.tsx` — 7× audit inserts in OCR pipeline → **review**
- `src/shared/components/SupplierReferralModal.tsx` — `suppliers` insert → **defer to suppliers-on-persons**
- `src/shared/components/PurchaseForm.tsx` — `purchase_items` insert → **defer**
- `src/components/sales/quotes/ShareQuoteDialog.tsx` — share-logs insert → **low risk, defer**
- `src/routes/_app.accounting.external-parties.tsx` — **needs focused inventory** (persons overlap)
- `src/routes/_app.sales.credit-rules.tsx` — credit_scoring_rules insert → **review**
- `src/routes/_app.accounting.receipts.$receiptId.tsx` — audit×2 → **lib helper later**

### Admin schema/config writes (sensitive, schema-shaping)
- `src/routes/_app.admin.{workflow-stages,waybill-fields,settings,receipt-fields,payment-terms,marketing-channels,profile-fields}.tsx`
- `src/routes/_app.data-tables.new.tsx`
- `src/routes/_app.academy_.manage.tsx`
- `src/routes/_app.knowledge_.{$documentId,manage}.tsx`
- `src/routes/_app.feedback_.{create,$feedbackId}.tsx`

### Already migrated
- `src/shared/components/CustomerForm.tsx` — via `createCustomer`/`updateCustomer` serverFn (S19A + auth-header fix C01).

### RPCs (informational, by area)
- Persons-linked: `customer_set_person`, `customer_clear_person`.
- Products: `find_or_create_model`, `find_duplicate_product`, `get_recent_purchase_label`, `get_product_recommendations`.
- Pricing/sales: `refresh_sale_list_prices`, observatory snippets ×2, market-intelligence ×10.
- Gamification: 9× analytics + 6× score/league RPCs.
- Profile-fields: `set_profile_field_value`.
- Notifications: `mark_notification_read`, `mark_all_notifications_read`, `generate_birthday_notifications`.
- Auth: `log_event`.
- Market rates ingestion: `start_market_rate_ingestion_run`, `finish_market_rate_ingestion_run`, `record_market_rate_observation`.

---

## 6. Persons / customer integration checklist

| Item | Status |
|---|---|
| persons core (tables + RLS + serverFns + UI) | ✅ complete |
| `person_identifiers` duplicate protection (normalizer + unique constraints) | ✅ present |
| `person_context_links` table + serverFn | ✅ present |
| `customers.person_id` nullable FK (S17) | ✅ |
| `customer_set_person` / `customer_clear_person` RPCs (S18A, SECURITY INVOKER) | ✅ |
| `createCustomer` / `updateCustomer` serverFns (S18B) | ✅ |
| `CustomerForm` migrated to serverFn (S19A + auth-header fix C01) | ✅ |
| `QuickAddCustomerDialog` direct-write | 🔴 still direct |
| `CustomerImportForm` direct-write | 🔴 still direct |
| `PaymentReceiptForm` writes customers | 🔴 still direct |
| `InvoiceForm` writes customers/items | 🔴 still direct |
| `searchPersons` serverFn | ❌ not implemented (plan approved) |
| CustomerForm person-picker UI | ❌ deferred |
| Suppliers / waybills / quotes ↔ persons | ❌ deferred |

---

## 7. Build / typecheck / lint baseline

- Last known good (S19A-C01): `bunx tsc --noEmit` → 0 errors.
- Lint: ~20 pre-existing prettier-only formatting warnings on untouched lines in `CustomerForm.tsx` and persons modules. No errors from recent additions.
- No project test suite confirmed running; treat as **not verified**.
- A dedicated **Review** step is recommended before any Agent step to re-establish a fresh baseline.

---

## 8. Recommended next 5 safe steps (anti-duplication priority)

1. **AFRA-…-S21-DOC — Correction** *(this task)* — publish README correction + this inventory.
2. **AFRA-…-S22-REVIEW — Review (read-only)** — re-run `npm run build`, `bunx tsc --noEmit`, `npm run lint`; report ground truth + the 20 prettier-only warnings untouched.
3. **AFRA-…-S19B — Agent** — implement read-only `searchPersons` serverFn per the previously-approved plan (name-only, RLS-scoped, narrow DTO; extend `src/lib/persons/{schemas,functions}.ts` only).
4. **AFRA-…-S23-INV — Plan** — focused inventory for `QuickAddCustomerDialog` + `CustomerImportForm` migration to `createCustomer` (S19C/S19D scoping).
5. **AFRA-…-S24-INV — Plan** — focused inventory for `accounting.external-parties` vs `persons` (deprecate / migrate / explicitly segregate).

> Suppliers/waybills/quotes ↔ persons remain explicitly deferred until customer paths (QuickAdd, Import, Payment, Invoice) are migrated.

---

## 9. Stop conditions (must refuse Agent mode, require U01 decision)

- A prompt asks to "rebuild" persons, customers, products, pricing, accounting, or invoices.
- A prompt asks for a broad cross-module refactor.
- A prompt proposes a new identity table (parties, contacts, entities, parties_v2…) instead of extending `persons`.
- A prompt asks to remove `attachSupabaseAuth` from `src/start.ts` or to remove the explicit `Authorization` header pattern on `CustomerForm` serverFn calls.
- A prompt asks to merge `process-queue.functions.ts` with `process-recompute-queue.server.ts`, or to remove the bot public API in favor of serverFns.
- A prompt asks to bulk-migrate every direct-write path in one step.
- A prompt asks for a destructive migration (DROP, TRUNCATE, ALTER TYPE) without explicit backup + staging plan per `docs/MIGRATION_SAFETY_POLICY.md`.
- A prompt asks to add a CDN / external-font / external-API dependency on a critical path.
- The build/typecheck baseline is unknown (S22-REVIEW not yet run) AND the requested step would touch multiple modules.

---

## 10. Final conclusion

1. **Is S19B safe to plan next?** Yes — already planned and approved. Run **S22-REVIEW** first to lock the baseline.
2. **Highest-risk direct-write path**: `CustomerImportForm.tsx` (bulk customer insert + audit). Runner-up: `InvoiceForm.tsx` (multi-table delete on rollback from client).
3. **Module most likely to cause duplicate work if touched without focused inventory**: `accounting / external-parties` (overlaps `persons`). Runner-up: `suppliers`.
4. **Recommended approval order**: S21-DOC → S22-REVIEW → S19B (Agent) → S23-INV (QuickAdd/Import) → S24-INV (external-parties).

---

## Maintenance

- Update this file whenever a module's status changes (e.g. a write-path is migrated, a new serverFn lands, a new identity-adjacent table is added).
- Do NOT delete sections; mark items resolved with date + Task ID instead.
- Keep the README pointer (`## وضعیت فعلی پروژه`) in sync with the structure of this file.