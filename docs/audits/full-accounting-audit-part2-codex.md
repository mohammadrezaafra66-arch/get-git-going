# Accounting audit — domains B/D/H/I/J (Codex)

**Date:** 2026-08-07 · **HEAD while writing:** `5de56cc0a1184301ecf02e6d729b51b796a4aa7e` · **DB:** `afrakala` on `afrakala-lan-db`
**Mode:** read-only audit. No code, migration, data, deploy, or generated route changes were made.

Scope assigned to Codex only: **B Customers**, **D Sales & proforma invoices**, **H Bank**, **I Warehouse/inventory**, **J Cheques/promissory notes/drafts**. Domain A and the focused E/F/G third-party-payee context were treated as handoff input, not reworked.

The original prompt file `docs/audits/accounting-research-mission.md` is not present in the committed tree. `docs/audits/accounting-audit-progress.md` states the mission lives inside the untracked archive `docs/audit/files (1).zip`; I did not extract or commit that archive. I used the progress file and `docs/audits/full-accounting-audit.md` as the live continuation source.

---

## Shared live evidence

### Navigation / route registry

Evidence:

- `src/lib/navigation/registry.ts:284`, `291`, `298` register `/warehouses`, `/warehouses/transfers`, `/warehouses/kardex` with module `warehouse`.
- `src/lib/navigation/registry.ts:315` registers `/sales/quotes` with module `invoices`.
- `src/lib/navigation/registry.ts:322-325` explicitly documents the split: "`invoices` / `invoice_items` are a dead parallel design... live pre-invoice workflow is `sales_quotes`".
- `src/lib/navigation/registry.ts:327` registers `/sales/invoices`; `src/lib/navigation/registry.ts:336` registers `/invoices`.
- `src/lib/navigation/registry.ts:372`, `406`, `414`, `424` register customer/credit routes under sales.
- `src/lib/navigation/registry.ts:470` registers `/accounting/bank-accounts`; `src/lib/navigation/registry.ts:478` registers `/accounting/treasury`.
- `src/components/layout/primary-modules.ts:102-110` includes the sales/customer/invoice paths in the sales primary module.
- `src/components/layout/primary-modules.ts:125` includes `/accounting/bank-accounts`; `src/lib/navigation/registry.ts:1163-1164` includes bank accounts and treasury in the accounting primary module.

### Role permission coverage

Live SQL:

```sql
select module, count(*) as rows
from public.role_permissions
where module in ('sales','invoices','accounting','warehouse','customers','bank','cheques')
group by module;
```

Result:

| module | rows |
|---|---:|
| sales | 7 |
| invoices | 7 |
| warehouse | 6 |

Missing explicit role rows:

```text
accounting: accountant, admin, manager, purchase_specialist, sales, site, viewer
bank:       accountant, admin, manager, purchase_specialist, sales, site, viewer
cheques:    accountant, admin, manager, purchase_specialist, sales, site, viewer
customers:  accountant, admin, manager, purchase_specialist, sales, site, viewer
warehouse:  site
```

Security consequence: `has_dynamic_permission` falls back when no matching row exists for a user's roles and module. Live `pg_get_functiondef(public.has_dynamic_permission)` shows:

```sql
IF _exists THEN
  RETURN _matched;
END IF;
-- Fallback: sensible defaults based on legacy static matrix
IF _action IN ('view') THEN
  RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']::text[]);
...
```

So modules with no rows are not just UX gaps; they enter legacy fallback behavior. Bank/accounting routes also use hard-coded `requireAnyRole`, which can diverge from registry permissions.

---

## B — Customers

### 1. Routes/pages

| Route | File | Guard / visibility | Nav |
|---|---|---|---|
| `/sales/customers` | `src/routes/_app.sales_.customers.tsx:48-50` | `requirePermission("sales","view")` | yes, `registry.ts:372` |
| `/sales/customers/create` | `src/routes/_app.sales_.customers_.create.tsx:6-8` | `requirePermission("sales","create")` | reachable from list button, not top-level nav |
| `/sales/customers/$customerId/edit` | `src/routes/_app.sales_.customers_.$customerId.edit.tsx:11-13` | `requirePermission("sales","update")` | row action |
| `/sales/customers/$customerId/credit` | `src/routes/_app.sales_.customers_.$customerId.credit.tsx:21-23` | `requireAnyRole(["admin","manager","accountant"])` | row action |
| `/sales/customers/import` | `src/routes/_app.sales.customers_.import.tsx:9-11` | `requireAnyRole(["admin","accountant"])` | list button |
| `/sales/customers/credit-training` | registry only as support page, `registry.ts:422-427` | sales module | yes, support button |
| `/sales/credit-customers` | `src/routes/_app.sales.credit-customers.tsx:41-43` | `requirePermission("sales","view")` | yes, `registry.ts:406` |
| `/sales/credit-rules` | `src/routes/_app.sales.credit-rules.tsx:30-32` | `requireAnyRole(["admin","accountant"])` | yes, `registry.ts:414`; explicit role override at `registry.ts:1298` |

### 2. Schema

Live row counts:

| table/view | rows |
|---|---:|
| `customers` | 22 |
| `customer_credit_profile` | 0 |
| `customer_credit_balance` | 9 |
| `customer_credit_ledger` | 1 |
| `customer_capital_allocations_dynamic` | 4 |
| `v_dynamic_customer_capital_balances` | view |
| `vw_customer_receivables` | view |

Key live columns from `information_schema.columns`:

- `customers`: `id`, `name`, `phone`, `city`, `notes`, `responsible_id`, `accounting_code`, `link_group`, `birth_date`, `person_id NOT NULL`, `didar_contact_id`.
- `customer_credit_profile`: totals, outstanding balance, late count, credit score/limit, overdue fields, `customer_person_id NOT NULL`.
- `customer_credit_balance`: `customer_id` PK, available/held credit, `customer_person_id NOT NULL`.
- `customer_credit_ledger`: type, amount, before/after balances, reference, created_by, `customer_person_id NOT NULL`.
- `customer_capital_allocations_dynamic`: capital setting, customer, salesperson, score/share/final limit, binding constraint, `customer_person_id NOT NULL`.

### 3. Business logic

Frontend writes:

- Customer list reads `customers` at `src/routes/_app.sales_.customers.tsx:89` and toggles active through `customers` plus `audit_logs` at `src/routes/_app.sales_.customers.tsx:121` and `169`.
- Customer create/edit uses `CustomerForm` from `src/shared/components/CustomerForm.tsx`.
- `CustomerForm` checks duplicate `accounting_code`/`phone` from `customers` at `src/shared/components/CustomerForm.tsx:135-166`.
- Existing customer edit updates `customers` directly at `src/shared/components/CustomerForm.tsx:180-189`.
- New customer creation uses `person_create_inline` at `src/shared/components/CustomerForm.tsx:193-228`, so create no longer writes a customer without a person.
- Customer/person link UI uses server functions at `src/components/customers/CustomerPersonLink.tsx:34-37`.

Live `pg_get_functiondef` evidence:

```sql
CREATE OR REPLACE FUNCTION public.customer_set_person(...)
...
PERFORM 1 FROM public.persons WHERE id = p_person_id;
...
SELECT person_id INTO v_old_person_id
FROM public.customers
WHERE id = p_customer_id;
```

```sql
CREATE OR REPLACE FUNCTION public.customer_clear_person(...)
...
UPDATE public.person_context_links
   SET ended_at = now(),
       note     = COALESCE(p_note, note)
 WHERE context_kind = 'customer'
...
UPDATE public.customers
   SET person_id = NULL
 WHERE id = p_customer_id;
```

This is a correctness tension: the live schema has `customers.person_id uuid NOT NULL`, so `customer_clear_person` now attempts to set a NOT NULL column to NULL. The UI still exposes unlink through `CustomerPersonLink`.

Other live functions:

- `audit_customer_change()` writes audit logs but only includes `name`, `phone`, `city`, `notes`, `is_active`; it does not include `person_id`.
- `tg_credit_derive_customer_person()` copies `customers.person_id` into credit rows.
- `get_customer_dynamic_credit()` and `calculate_customer_realtime_credit()` are the credit views used by quote/invoice flows.

### 4. Constraints

Live constraints include:

- `customers_accounting_code_format`: `accounting_code ~ '^[A-Za-z0-9_-]{1,30}$'`.
- `customers_birth_date_not_future`: birth date not future.
- `customers_person_id_fkey`: FK to `persons(id)`.
- `uq_customers_person_id`: one customer per person.
- Credit profile score/limit checks, customer/person FKs.
- Credit ledger `transaction_type` CHECK over `hold`, `release`, `charge`, `payment`, `adjustment`.
- Dynamic allocations unique `(capital_setting_id, customer_id)` and binding CHECK over `formula`, `credit_limit`, `overdue`, `floor`.

### 5. Built-but-unwired

- `src/lib/customers/functions.ts:121-139` still exports deprecated `createCustomer`; comments say it inserts directly into `customers` and will fail after `person_id NOT NULL`. Search evidence shows current create uses `person_create_inline`; the deprecated serverFn remains but is intentionally not used.
- `customer_credit_profile` has 0 rows while `customer_credit_balance` has 9 and allocations have 4. The old profile table is not the active source of all customer credit state.

### 6. Duplication

- Customer creation exists in `CustomerForm`, `QuickAddCustomerDialog`, and `PersonModal`, all calling `person_create_inline`. This is not broken, but it is repeated client-side RPC assembly.
- Credit/customer pages are split between `/sales/customers/$id/credit`, `/sales/credit-customers`, `/sales/credit-rules`, and `/accounting/dynamic-capital` links from `CustomerCreditGuide`. They are separate surfaces over overlapping credit/capital concepts.

### 7. Bugs/gaps

- 🟠 `customer_clear_person` is now incompatible with `customers.person_id NOT NULL`. Evidence: live column list says `person_id uuid NOT NULL`; live function says `UPDATE public.customers SET person_id = NULL`; UI exposes unlink at `src/components/customers/CustomerPersonLink.tsx:132-190`.
  Fix direction: remove/disable unlink for customers, or redesign it to reassign to a replacement person rather than clearing the FK.
- 🟡 Customer audit misses person-link changes. Evidence: `audit_customer_change()` diff only includes name/phone/city/notes/is_active; `person_id` link changes happen via RPC.
  Fix direction: add explicit audit rows in `customer_set_person` / `customer_clear_person`.

### 8. role_permissions

Customer routes use module `sales`, and `sales` has all 7 role rows. There is no `customers` module coverage, but current registry does not use a `customers` module for these pages. Keep it that way or add complete rows before switching module keys.

---

## D — Sales and proforma invoices

### 1. Routes/pages

| Route | File | Guard / visibility | Backend surface |
|---|---|---|---|
| `/sales` | `src/routes/_app.sales.tsx:4-8` | `requirePermission("sales","view")` | parent outlet |
| `/sales/quotes` | `src/routes/_app.sales.quotes.tsx:4-6` and index file | parent `sales:view` | `sales_quotes`, `sales_quote_items`, status serverFn |
| `/sales/quotes/new` | `src/routes/_app.sales.quotes.new.tsx:66-70` | `requireAnyRole(ALLOWED_ROLES)` | quote create RPC and pricing/credit RPCs |
| `/sales/quotes/$quoteId` | `src/routes/_app.sales.quotes.$quoteId.tsx:64` | parent guard | quote detail, status actions, Asan/export/share |
| `/sales/invoices` | `src/routes/_app.sales_.invoices.tsx:24-26` | `invoices:view` | `invoices` list |
| `/sales/invoices/create` | `src/routes/_app.sales_.invoices_.create.tsx:6-8` | `invoices:create` | `InvoiceForm` writes `invoices`/`invoice_items` |
| `/sales/invoices/$invoiceId` | `src/routes/_app.sales_.invoices_.$invoiceId.tsx:44-46` | `invoices:view` | detail, cancel/send/notes/waybill links |
| `/invoices` | `src/routes/_app.invoices.tsx:7-9` | `invoices:view` | empty placeholder |
| `/sales/invoices/$invoiceId/waybill*` | routeTree evidence `src/routeTree.gen.ts:1993` and `1997` | direct URL | waybill pages |

### 2. Schema

Live row counts:

| table | rows |
|---|---:|
| `sales_quotes` | 50 |
| `sales_quote_items` | 53 |
| `sales_quote_item_services` | 0 |
| `sales_quote_counters` | 1 |
| `sales_quote_send_queue` | 0 |
| `sales_quote_share_logs` | 4 |
| `invoices` | 0 |
| `invoice_items` | 0 |
| `invoice_workflow_stages` | 5 |
| `waybills` | 0 |
| `waybill_items` | 0 |

Key columns:

- `sales_quotes`: quote number, customer text fields, salesperson, status enum, amounts, settlement, accounting markers, `customer_id`, `warehouse_id`, deposit/commitment, exception fields, `customer_person_id`.
- `sales_quote_items`: quote FK, product/manual identity, sale price type, quantity, price, discount, line total, warehouse.
- `invoices`: customer/status/dates/amounts, invoice type, delivery/proof fields, settlement fields, accounting markers, `customer_person_id`.
- `invoice_items`: invoice/product/quantity/unit price/discount/line total.
- `waybills`: invoice FK, waybill number, sender/receiver/shipping fields, status, custom data.

### 3. Business logic

Quote creation/status:

- Quote list reads `sales_quotes` at `src/routes/_app.sales.quotes.index.tsx:141`, quote items at `:659`, and uses `updateQuoteStatus` serverFn at `:381`.
- Quote detail reads `sales_quotes` and `sales_quote_items` at `src/routes/_app.sales.quotes.$quoteId.tsx:123` and `:165`, then uses the same status serverFn at `:527`.
- Quote new page reads settlement, visitors, customers, price types and RPCs like `get_customer_dynamic_credit`, `search_product_ids`; evidence `src/routes/_app.sales.quotes.new.tsx:121`, `137`, `180`, `226`, `249`, `1017`.

Live `pg_get_functiondef` evidence:

```sql
CREATE OR REPLACE FUNCTION public.create_sales_quote_with_items(...)
...
RETURNS jsonb
...
_quote_id uuid; _quote_number text; _items_count int := 0;
```

```sql
CREATE OR REPLACE FUNCTION public.update_sales_quote_status(...)
...
ELSIF public.has_role(_uid, 'sales'::public.app_role)
  AND _row.salesperson_id = _uid
  AND p_next IN ('draft','sent','rejected','canceled')
...
RAISE EXCEPTION 'دسترسی لازم برای این عملیات را ندارید.'
```

```sql
CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()
...
IF old.status IN ('accepted','rejected','canceled') THEN
  RAISE EXCEPTION 'cannot change status of a finalized quote...'
...
IF NOT ((old.status = 'draft' AND new.status IN ('sent','canceled'))
     OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))) THEN
```

```sql
CREATE OR REPLACE FUNCTION public.tg_asan_burn_sales_quote_number()
...
IF TG_OP = 'DELETE' THEN
  PERFORM public.asan_burn_document_number('sales_invoice', OLD.id, 'پیش‌فاکتور حذف شد');
...
IF NEW.status::text IN ('canceled', 'cancelled') THEN
  PERFORM public.asan_burn_document_number('sales_invoice', NEW.id, 'پیش‌فاکتور باطل شد');
```

Invoice branch:

- `InvoiceForm` writes `invoices` then `invoice_items` at `src/shared/components/InvoiceForm.tsx:422-468`.
- It holds credit/capital through RPCs at `src/shared/components/InvoiceForm.tsx:471-512`.
- Invoice detail can cancel via `cancel_invoice` and send to accountant via `send_invoice_to_accountant`; evidence `src/routes/_app.sales_.invoices_.$invoiceId.tsx:250` and `267`.
- Accounting marker components call marker RPCs for quote/invoice; evidence `src/components/sales/quotes/QuoteAccountingMarkers.tsx:107-126`, `src/components/invoices/InvoiceAccountingMarkers.tsx:109-128`.

Live `pg_get_functiondef` evidence:

```sql
CREATE OR REPLACE FUNCTION public.cancel_invoice(...)
...
IF v_inv.status <> 'draft' THEN
  RAISE EXCEPTION 'only draft invoices can be canceled...'
...
UPDATE public.invoices SET status = 'canceled'
```

```sql
CREATE OR REPLACE FUNCTION public.send_invoice_to_accountant(...)
...
IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'only draft invoices can be sent to accountant';
UPDATE public.invoices SET status = 'pending_accountant'
```

```sql
CREATE OR REPLACE FUNCTION public.validate_invoice_item_price()
...
IF v_invoice.type IS DISTINCT FROM 'pre_invoice' THEN RETURN NEW;
...
SELECT * INTO v_bounds FROM public.get_product_price_bounds(...)
```

### 4. Constraints

Important live constraints:

- `sales_quotes_quote_number_key` unique.
- `sales_quotes_amounts_nonneg`.
- `sales_quotes_customer_person_requires_customer_chk`.
- `sales_quote_items_identity` enforces product-price rows have product_id and manual/quick rows have free_item_name.
- `sales_quote_items_qty_pos`, `price_pos`, `discount_nonneg`, `discount_le_line`.
- `invoices_number_key` unique.
- `invoices_invoice_type_check`: `pre_invoice` / `advance_payment`.
- `invoices_type_check`: `pre_invoice` / `invoice`.
- `invoices_delivery_mode_check`, `invoices_proof_requirement_check`.
- `waybills_waybill_number_key`; waybill sender/receiver/phone/status checks.

### 5. Built-but-unwired

- `src/routes/_app.invoices.tsx:7-18` is only an EmptyState saying the module will be implemented later.
- Live row counts show `sales_quotes=50`, while `invoices=0`, `invoice_items=0`, `waybills=0`, `waybill_items=0`.
- Registry explicitly says `invoices`/`invoice_items` are a dead parallel design at `src/lib/navigation/registry.ts:322-325`.

### 6. Duplication

This is the strongest duplication finding in this audit: two sales-document models coexist.

- Active model: `/sales/quotes` over `sales_quotes` / `sales_quote_items`, with 50/53 live rows.
- Parallel model: `/sales/invoices` and `/invoices` over `invoices` / `invoice_items`, with 0/0 rows.

The registry comment acknowledges the drift. The risk is not theoretical: the invoice branch has nontrivial business logic (credit hold, capital hold, workflow tasks, waybills), while current data and live workflow are quote-based.

### 7. Bugs/gaps

- 🔴 Dead parallel invoice branch. Evidence: registry comment `src/lib/navigation/registry.ts:322-325`; live counts `sales_quotes=50`, `invoices=0`; `/invoices` placeholder at `src/routes/_app.invoices.tsx:11-17`.
  Fix direction: either formally retire `/sales/invoices` and migrate useful waybill/proof logic to quote flow, or promote `invoices` as the canonical model and migrate quote data. Do not keep both as first-class flows.
- 🟠 Status spelling drift. Evidence: `cancel_invoice()` sets status `canceled`, but `src/lib/invoices/functions.ts:41` schema allows `"cancelled"` and not `"canceled"`; `set_invoice_accounting_marker()` explicitly comments that both spellings exist.
  Fix direction: normalize invoice status values and enforce a DB CHECK for the chosen enum spelling.
- 🟡 Sales Asan numbering burn is tied to quote cancellation/delete, not invoice branch. Evidence: `tg_asan_burn_sales_quote_number()` burns `sales_invoice` for `sales_quotes`; there is no analogous invoice Asan routine in the relevant function search.
  Fix direction: make the canonical sales document own Asan numbering exclusively.

### 8. role_permissions

`sales` and `invoices` both have complete 7-role rows. Route guards still mix dynamic permissions and hard-coded role checks. Example: `/sales/quotes` parent uses `sales:view`, while quote creation uses hard-coded `ALLOWED_ROLES`. Keep them aligned in one permission model.

---

## H — Bank

### 1. Routes/pages

| Route | File | Guard / visibility | Nav |
|---|---|---|---|
| `/accounting/bank-accounts` | `src/routes/_app.accounting.bank-accounts.tsx:29-31` | `requireAnyRole(["admin","manager","accountant"])` | yes, `registry.ts:470` |
| `/accounting/treasury` | `src/routes/_app.accounting.treasury.tsx:42-44` | `requireAnyRole(["admin","manager","accountant"])` | yes, `registry.ts:478` |

### 2. Schema

Live row counts:

| table/view | rows |
|---|---:|
| `bank_accounts` | 1 |
| `vw_account_balances` | 1 |
| `payment_receipts` | 6 |
| `payment_vouchers` | 0 |

Key columns:

- `bank_accounts`: `title`, `bank_name`, `iban`, `account_no`, `card_no`, `currency`, `opening_balance`, `is_active`, `accounting_code`, `account_type`.
- `vw_account_balances`: account identity plus opening/total in/total out/current balance/counts.
- Receipts/vouchers both reference bank accounts (`destination_bank_account_id`, `source_bank_account_id`).

### 3. Business logic

Bank-account CRUD:

- Route reads `bank_accounts` at `src/routes/_app.accounting.bank-accounts.tsx:78`.
- Toggle active updates `bank_accounts` at `:98` and writes `audit_logs` at `:102`.
- Save form upserts/updates `bank_accounts` at `:289` / `:302` and writes `audit_logs` at `:293` / `:307`.

Treasury:

- `src/lib/treasury/queries.ts:62-75` calls `get_account_balances`.
- `src/lib/treasury/queries.ts:88-101` calls `get_account_ledger`.
- `src/lib/treasury/queries.ts:124-161` reads `payment_vouchers`.
- `src/lib/treasury/queries.ts:189-216` inserts approved `payment_vouchers`.

Live `pg_get_functiondef` evidence:

```sql
CREATE OR REPLACE FUNCTION public.get_account_balances(...)
...
IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
  RAISE EXCEPTION 'forbidden'
...
FROM public.vw_account_balances v
```

```sql
CREATE OR REPLACE FUNCTION public.get_account_ledger(...)
...
_opening := _opening
  + COALESCE((SELECT SUM(pr.amount) FROM public.payment_receipts pr
               WHERE pr.destination_bank_account_id = p_account_id
                 AND pr.status = 'approved' ...
  - COALESCE((SELECT SUM(pv.amount) FROM public.payment_vouchers pv
               WHERE pv.source_bank_account_id = p_account_id
                 AND pv.status = 'approved' ...
```

Bank-deposit Asan export exists:

```sql
CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
RETURNS TABLE(... amount numeric, bank_code text, bank_title text, blocked_reason text)
...
IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
  RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید'
```

### 4. Constraints

Live constraints:

- `bank_accounts_account_type_chk`: `account_type IN ('bank','cash')`.
- `bank_accounts_pkey`.
- No live UNIQUE constraint on `iban`, `account_no`, `card_no`, or `accounting_code`.
- `payment_receipts_destination_bank_account_id_fkey` and `payment_receipts_source_bank_account_id_fkey`.
- `payment_vouchers_source_bank_account_id_fkey`.

### 5. Built-but-unwired

- There is no separate `bank_transactions` table. Ledger is computed from approved receipts and approved vouchers plus `opening_balance`.
- Bank-account changes are audited from the route, not by a DB trigger. The only live trigger on `bank_accounts` is `trg_bank_accounts_updated_at`.

### 6. Duplication

- Bank balance is exposed through `/accounting/bank-accounts` (account master data) and `/accounting/treasury` (movement/balance view). That split is reasonable.
- Risk of drift exists between hard-coded page guards and registry module `accounting`, because `role_permissions` has no `accounting` rows.

### 7. Bugs/gaps

- 🟠 Missing uniqueness on bank identifiers/accounting code. Evidence: live constraints show only `account_type_chk` and PK on `bank_accounts`.
  Fix direction: add business-approved unique or partial-unique constraints for `iban`, account number/card number/accounting code if these are intended identifiers.
- 🟠 Permission gap for `accounting`. Evidence: `/accounting/bank-accounts` is registry module `accounting`; live `role_permissions` has 0 rows for `accounting`; `has_dynamic_permission` fallback grants broad legacy view on missing rows.
  Fix direction: seed complete 7-role `accounting` rows or split bank/treasury into an explicit module with complete rows.
- 🟡 Audit is route-dependent. Evidence: only trigger is `trg_bank_accounts_updated_at`; route manually writes `audit_logs`.
  Fix direction: add DB-level audit trigger for bank account master-data changes.

### 8. role_permissions

No explicit rows for `accounting` or `bank`. Current route security depends on hard-coded `requireAnyRole(["admin","manager","accountant"])` and RPC checks, while navigation registry uses module `accounting`. This should be made explicit.

---

## I — Warehouse / inventory

### 1. Routes/pages

| Route | File | Guard / visibility | Nav |
|---|---|---|---|
| `/warehouses` | `src/routes/_app.warehouses.tsx:55-57` | `requireAnyRole(["admin","manager"])` | yes, `registry.ts:284` |
| `/warehouses/transfers` | `src/routes/_app.warehouses_.transfers.tsx:54-56` | `requireAnyRole(["admin","manager"])` | yes, `registry.ts:291` |
| `/warehouses/kardex` | `src/routes/_app.warehouses_.kardex.tsx:41-43` | `requireAnyRole(["admin","manager","accountant","purchase_specialist"])` | yes, `registry.ts:298` |

### 2. Schema

Live row counts:

| table | rows |
|---|---:|
| `warehouses` | 3 |
| `warehouse_stock` | 11 |
| `stock_movements` | 60 |
| `stock_transfers` | 2 |
| `stock_transfer_items` | 2 |
| `stock_alert_requests` | 0 |

Key columns:

- `warehouses`: name/code/is_active/is_default/notes/created_by.
- `warehouse_stock`: warehouse/product/quantity.
- `stock_movements`: product, warehouse, movement_type, quantity, `ref_type`, `ref_id`, related warehouse, note, delta.
- `stock_transfers`: from/to warehouses, status, created/confirmed metadata.
- `stock_transfer_items`: transfer/product/quantity.
- `stock_alert_requests`: product/customer/salesperson/status/priority/resolution.

### 3. Business logic

Warehouse master:

- `src/lib/warehouses/queries.ts:65-158` reads/inserts/updates/deletes `warehouses`.
- Delete blockers check `warehouse_stock`, `stock_movements`, and `stock_transfers` before deletion at `src/lib/warehouses/queries.ts:125-145`.
- Manual stock adjustment calls RPC `adjust_warehouse_stock` at `src/lib/warehouses/queries.ts:187-202`.
- Kardex reads `stock_movements` at `src/lib/warehouses/queries.ts:233-265`.

Transfers:

- `src/lib/warehouses/transfers.ts:32-80` reads transfers/items.
- `src/lib/warehouses/transfers.ts:93-123` creates transfer and items.
- `src/lib/warehouses/transfers.ts:145-151` confirms transfer by setting `stock_transfers.status='confirmed'`.
- DB trigger then writes movements.

Live `pg_get_functiondef` evidence:

```sql
CREATE OR REPLACE FUNCTION public.adjust_warehouse_stock(...)
...
IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
  RAISE EXCEPTION 'دسترسی لازم برای تعدیل موجودی را ندارید.'
...
PERFORM public.apply_stock_movement(... 'adjust', _delta, 'manual', NULL ...)
```

```sql
CREATE OR REPLACE FUNCTION public.apply_stock_movement(...)
...
IF _warehouse_id IS NULL THEN RAISE EXCEPTION 'انبار مشخص نشده است.';
IF _movement_type = 'adjust' THEN ... ELSEIF _movement_type IN ('in','transfer_in') ...
```

```sql
CREATE OR REPLACE FUNCTION public.trg_stock_transfer_confirm()
...
IF NOT EXISTS (SELECT 1 FROM public.stock_transfer_items WHERE transfer_id = NEW.id) THEN
  RAISE EXCEPTION 'سند انتقال بدون کالا قابل قطعی‌کردن نیست.'
...
PERFORM public.apply_stock_movement(... 'transfer_out' ...)
PERFORM public.apply_stock_movement(... 'transfer_in' ...)
```

Sales/purchase coupling:

```sql
CREATE OR REPLACE FUNCTION public.trg_sales_quote_stock_out()
...
IF EXISTS (SELECT 1 FROM public.stock_movements
 WHERE ref_type = 'sale_quote_confirm' AND ref_id = NEW.id) THEN RETURN NEW;
...
PERFORM public.apply_stock_movement(... 'out', ..., 'sale_quote_confirm', NEW.id ...)
```

```sql
CREATE OR REPLACE FUNCTION public.trg_purchase_item_stock_in()
...
PERFORM public.apply_stock_movement(
  NEW.product_id, _wh, 'in', NEW.quantity,
  'purchase', NEW.purchase_id, NULL, 'افزایش موجودی از خرید', NULL
);
```

### 4. Constraints

Live constraints:

- `warehouses_code_key` unique.
- `warehouses_name_not_blank`.
- `warehouse_stock_warehouse_id_product_id_key` unique.
- `warehouse_stock_quantity_check`: quantity >= 0.
- `stock_movements_movement_type_check`: `in`, `out`, `transfer_in`, `transfer_out`, `adjust`.
- `stock_movements_ref_type_check`: `purchase`, `sale_quote_confirm`, `transfer`, `manual`.
- `stock_movements` has FKs to product/warehouse/related warehouse, but **no FK for `ref_id`** because it is polymorphic.
- `stock_transfers_distinct_warehouses`, status CHECK `draft`/`confirmed`.
- `stock_transfer_items_transfer_id_product_id_key`.

### 5. Built-but-unwired

- `stock_alert_requests` exists with routes/components but has 0 rows.
- Inventory movement is reachable from at least four sources: manual adjustment, sales quote acceptance, purchase item stock-in, and transfer confirmation.

### 6. Duplication

Not pure duplication, but a drift-prone pattern: the same movement table is written by multiple source paths, distinguished only by `ref_type/ref_id`. Since `ref_id` cannot FK to all sources, integrity depends on every writer using the same reference conventions.

### 7. Bugs/gaps

- 🟠 Polymorphic `stock_movements.ref_id` has no referential integrity. Evidence: live constraints include `stock_movements_ref_type_check` but no FK for `ref_id`; column list has `ref_type text, ref_id uuid`.
  Fix direction: add source-specific link tables or validated trigger checks per `ref_type`; at minimum add consistency tests/reports for orphaned movement refs.
- 🟠 Route guards conflict with `warehouse` role rows. Evidence: `role_permissions.warehouse` grants view to accountant/sales/purchase_specialist, but `/warehouses` and `/warehouses/transfers` allow only admin/manager; `/warehouses/kardex` allows accountant/purchase_specialist but not sales.
  Fix direction: decide whether `role_permissions` or hard-coded guards are authoritative and remove the drift.
- 🟡 `warehouse` is missing the `site` role row. Evidence: live missing-role query.
  Fix direction: seed explicit denied row for `site`.

### 8. role_permissions

`warehouse` has 6 rows, missing `site`. The explicit grant matrix does not match all route guards, so users can see a module in navigation and still fail a page guard, or vice versa depending on sidebar filtering and direct URL.

---

## J — Cheques / promissory notes / drafts

### 1. Routes/pages

No standalone cheque/promissory/draft route exists in the route file list. Cheque fields appear through:

- `/accounting/treasury` route at `src/routes/_app.accounting.treasury.tsx:42-44`.
- `/accounting/purchase-payments` (owned mainly by C/F agent) has cheque input state at `src/routes/_app.accounting.purchase-payments.tsx:107-159` and UI clearing logic around `:518`.
- Receipt pages/forms (E domain handoff) also expose `document_channel` and receipt cheque fields.

### 2. Schema

Live table search:

```sql
select string_agg(table_name, ', ')
from information_schema.tables
where table_schema='public'
  and (table_name ilike '%cheque%' or table_name ilike '%draft%' or table_name ilike '%promissory%');
-- (none)
```

Cheque fields are embedded:

- `payment_receipts`: `document_channel`, `cheque_number`, `cheque_due_date`.
- `payment_vouchers`: `document_channel`, `cheque_number`, `cheque_due_date`.

Live usage:

| table | rows | cheque_number_not_null | cheque_due_date_not_null |
|---|---:|---:|---:|
| `payment_receipts` | 6 | 0 | 0 |
| `payment_vouchers` | 0 | 0 | 0 |

No live rows currently use cheque fields.

### 3. Business logic

Voucher UI/data:

- `src/lib/treasury/queries.ts:25-33` defines `VOUCHER_CHANNELS`, including `{ value: "cheque", label: "چک" }`.
- `src/lib/treasury/queries.ts:189-216` inserts `payment_vouchers`; it only sets `cheque_number` and `cheque_due_date` when `documentChannel === "cheque"`.
- `src/lib/treasury/queries.ts:221-242` calls `pay_purchase_with_voucher` with cheque parameters.

Live `pg_get_functiondef` evidence:

```sql
CREATE OR REPLACE FUNCTION public.trg_payment_voucher_set_number()
...
NEW.voucher_number := 'PV-' || to_char(now(), 'YYYY') || '-' ||
  lpad(nextval('public.payment_voucher_number_seq')::text, 5, '0');
```

```sql
CREATE OR REPLACE FUNCTION public.pay_purchase_with_voucher(
  _purchase_id uuid,
  _source_bank_account_id uuid,
  _payment_date date DEFAULT NULL,
  _document_channel text DEFAULT 'cash',
  _amount numeric DEFAULT NULL,
  _tracking_number text DEFAULT NULL,
  _cheque_number text DEFAULT NULL,
  _cheque_due_date date DEFAULT NULL,
  _description text DEFAULT NULL
)
```

### 4. Constraints

Live cheque constraints:

- `payment_receipts_cheque_fields_chk`: if `document_channel <> 'cheque'`, cheque fields must be NULL.
- `payment_vouchers_cheque_fields_chk`: same.
- `payment_vouchers_cheque_number_required_chk`: if voucher channel is cheque, `cheque_number` is required.
- `payment_receipts_document_channel_check` and `payment_vouchers_document_channel_check` include `cheque`.

Asymmetry: receipts allow cheque channel without requiring cheque number; vouchers require cheque number for cheque channel.

### 5. Built-but-unwired

- No standalone cheque ledger/lifecycle exists: no cheque table, no promissory note table, no draft table, no due-date status workflow, no clearing/returning/depositing states.
- Cheques are only document-channel metadata on receipt/voucher records.

### 6. Duplication

- Cheque channel metadata is implemented in both receipts and vouchers, with different constraint strictness.
- Asan export code also treats cheque as a column concern, not a cheque object: `src/lib/asan/export-invoice-rows.ts:10-14` says sales cheque amount is always empty while purchase uses the same column slot; `src/lib/asan/export-purchase.ts:12` notes purchase cash/bank/cheque columns.

### 7. Bugs/gaps

- 🟠 There is no cheque/promissory/draft module despite cheque fields in financial docs. Evidence: live table search returns `(none)`; route list has no cheque route.
  Fix direction: if the business needs cheque tracking, add a dedicated instrument model with lifecycle states. If not, label the current behavior as "payment channel only".
- 🟡 Receipt/voucher cheque constraints differ. Evidence: vouchers require cheque number for cheque channel; receipts only null fields when channel is not cheque.
  Fix direction: decide whether receipt-side cheque number is required and make both constraints consistent.
- 🟡 No live data validates cheque behavior. Evidence: 0 non-null cheque fields across 6 receipts and 0 vouchers.
  Fix direction: add non-production fixture/tests before relying on cheque export/import behavior.

### 8. role_permissions

No explicit `cheques` rows exist. Current cheque capability is inherited from receipt/payment/treasury pages, mostly via `accounting` hard-coded guards and payment voucher constraints. If cheques become a module, seed explicit 7-role rows before adding navigation.

---

## Prioritized issue list

| Severity | Issue | Evidence | Fix direction |
|---|---|---|---|
| 🔴 | Sales has two document models; one is active, one is a dead parallel branch. | `registry.ts:322-325`; live counts `sales_quotes=50`, `invoices=0`; `/invoices` EmptyState. | Pick one canonical sales document model and move useful logic there. |
| 🟠 | Accounting/bank permissions lack explicit `role_permissions`. | Missing rows for `accounting` and `bank`; fallback in `has_dynamic_permission`. | Seed complete rows or move routes to a complete module key. |
| 🟠 | Customer unlink RPC conflicts with `customers.person_id NOT NULL`. | Live column `person_id NOT NULL`; function sets `person_id = NULL`; UI exposes unlink. | Disable unlink or redesign as reassignment. |
| 🟠 | Inventory movements use polymorphic `ref_id` with no FK. | Live `stock_movements` constraints check `ref_type` only. | Add validation triggers or source-specific link tables/reports. |
| 🟠 | Warehouse role_permissions drift from route guards. | `warehouse` grants view to more roles than `/warehouses` route permits. | Consolidate on dynamic permissions or make route guards match DB rows. |
| 🟠 | Cheques are only embedded fields, not tracked instruments. | No cheque/promissory/draft tables/routes; 0 live cheque field usage. | Either create an instrument lifecycle or document "channel only". |
| 🟡 | Bank account identifiers are not unique. | `bank_accounts` constraints only PK and account_type CHECK. | Add approved unique constraints where business requires uniqueness. |
| 🟡 | Invoice status spelling drift. | `cancel_invoice` uses `canceled`; TS schema uses `cancelled`; marker RPC handles both. | Normalize status values and enforce at DB. |
| 🟡 | Customer audit misses person-link changes. | `audit_customer_change()` excludes `person_id`; link RPCs mutate context. | Add audit inside link/unlink RPCs. |

---

## Summary

Overall health for the five domains is mixed:

1. **Customers** are mostly modernized around `persons`, but the old unlink path now conflicts with `person_id NOT NULL`.
2. **Sales/proforma** has the largest structural risk: live business is on `sales_quotes`, while a separate invoice subsystem still exists with routes, forms, triggers, and zero data.
3. **Bank/treasury** has useful server-side balance/ledger RPCs, but navigation permissions are under-seeded and bank identifiers are weakly constrained.
4. **Warehouse/inventory** is functional and centralized through `apply_stock_movement`, but polymorphic movement references need integrity checks.
5. **Cheques/promissory/drafts** are not a real module today; cheque is only a payment-channel attribute on receipts/vouchers.

Top 3 fixes first:

1. Resolve the sales quote vs invoice canonical-model split.
2. Seed explicit `accounting`/`bank` permissions and align warehouse guards with role rows.
3. Fix or remove customer unlink and add integrity checks for stock movement references.
