# Deeper diagnostic, round 2 — five open questions

**Read-only investigation.** No code, migration, row or configuration was changed. Builds on
`docs/asan/supplier-and-journal-diagnostic.md`. Discovered live against `afrakala` as
`supabase_admin` (rule 2.2), schema read from the catalogue rather than from documentation
(rule 2.6). HEAD at start: `0d1d2d29`.

Date: 2026-08-06.

---

## Q1: What "person" capabilities does a /suppliers-created supplier have?

### Q1a — Does the /suppliers path create a `persons` row? **Yes.**

`person_create_inline` delegates to `person_create_full` before doing anything else. Every INSERT
in the two functions, read live from `pg_get_functiondef`:

```
person_create_inline:
  25:  _res := public.person_create_full( … )
  53:      INSERT INTO public.suppliers (
  78:      INSERT INTO public.customers (
 114:    INSERT INTO public.external_parties (
 136:  INSERT INTO public.person_context_links (

person_create_full:
  76:  INSERT INTO public.persons (
 110:      INSERT INTO public.person_identifiers (
 129:    INSERT INTO public.person_field_values (
 143:    INSERT INTO public.person_context_links (
```

So the `/suppliers` path writes **`persons` + `person_identifiers` + `person_context_links` +
`suppliers`** in one transaction. Confirmed in data — all 15 suppliers carry a `person_id`:

```sql
select count(*) filter (where person_id is not null) as with_person, count(*) from suppliers;
-- with_person = 15, count = 15
```

**This inverts the premise of the question.** A /suppliers-created supplier is a full first-class
person. The asymmetry runs the *other* way: a /persons-created person is not a supplier.

### Q1b — Everything that depends on `persons`

29 foreign keys point at `persons.id`:

```sql
select c.conrelid::regclass::text as child_table, a.attname as fk_column
  from pg_constraint c
  join unnest(c.conkey) with ordinality k(attnum, ord) on true
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
 where c.contype='f' and c.confrelid='public.persons'::regclass order by 1,2;
```
```
 asan_import_person_rows              | matched_person_id
 credit_requests                      | customer_person_id
 credit_score_snapshots               | customer_person_id
 customer_capital_allocations_dynamic | customer_person_id
 customer_credit_balance              | customer_person_id
 customer_credit_ledger               | customer_person_id
 customer_credit_profile              | customer_person_id
 customers                            | person_id
 delivery_receipts                    | customer_person_id
 didar_activities                     | customer_person_id
 external_parties                     | person_id
 invoices                             | customer_person_id
 payment_receipts                     | customer_person_id
 payment_receipts                     | receiver_party_person_id
 payment_vouchers                     | payee_person_id
 person_aliases                       | person_id
 person_context_links                 | person_id
 person_field_values                  | person_id
 person_identifiers                   | person_id
 person_merge_candidates              | person_id_a / person_id_b
 person_merge_log                     | loser_id / winner_id
 product_suppliers                    | supplier_person_id
 profiles                             | person_id
 purchase_prices                      | supplier_person_id
 purchases                            | supplier_person_id
 sales_quotes                         | customer_person_id
 suppliers                            | person_id
```

**The important structural observation:** these split into three families.

- **Generic person features** — keyed on plain `person_id`: `person_aliases`,
  `person_identifiers`, `person_field_values`, `person_context_links`, `person_merge_*`.
- **Customer features** — keyed on `customer_person_id`: all seven credit tables, `invoices`,
  `sales_quotes`, `didar_activities`, `delivery_receipts`.
- **Supplier features** — keyed on `supplier_person_id`: `purchases`, `purchase_prices`,
  `product_suppliers`.

A supplier is excluded from the customer family **because it is not a customer**, not because of
how it was created. That is correct behaviour, not a defect.

### Q1c — The specific features the owner named

**Scoring.** `dynamic_entity_scores` is the polymorphic scoring table, and its CHECK excludes
suppliers outright:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.dynamic_entity_scores'::regclass and contype='c';
-- dynamic_entity_scores_entity_type_check | CHECK (entity_type = ANY (ARRAY['customer','salesperson']))

select entity_type, count(*) from dynamic_entity_scores group by 1;
--  customer | 58
--  salesperson | 41
```

Suppliers have a *separate, simpler* rating that lives on the legacy row only —
`suppliers.trust_level`:

```sql
select trust_level, count(*) from suppliers group by 1 order by 2 desc;
--  medium | 13
--  high   |  2
```

**A person that is not a supplier has no `trust_level` at all** — that column exists only on
`suppliers`. So this capability runs the opposite way from the question's premise.

**Credit.** `customer_credit_balance` (8 rows), `customer_credit_ledger`, `customer_credit_profile`,
`credit_score_snapshots` (0 rows) are all keyed on `customer_person_id`. Not reachable for a
supplier — by design.

**Gamification / KPI.** `employee_scores`, `employee_progress`, `employee_leagues`,
`score_snapshots` are keyed on `employee_id` (a profile/user, via `profiles.person_id`), not on
`persons.id` directly. Neither suppliers nor customers participate.

**Generic person artefacts do work for suppliers**, and are already in use:

```sql
select 'identifiers on supplier persons' k, count(*)::text v
  from person_identifiers i where i.person_id in (select person_id from suppliers)
union all select 'aliases on supplier persons', count(*)::text
  from person_aliases a where a.person_id in (select person_id from suppliers)
union all select 'field_values on supplier persons', count(*)::text
  from person_field_values f where f.person_id in (select person_id from suppliers);
```
```
 identifiers on supplier persons  | 2
 aliases on supplier persons      | 0
 field_values on supplier persons | 0
```

(0 for aliases and field values because **nobody has created any for anyone** — `person_aliases`
holds 0 rows and `person_field_values` holds 0 rows system-wide. The capability is reachable; it is
simply unused.)

### Q1d — The concrete table

| feature / table | works for a /suppliers-created supplier? | works for a /persons-only person? | evidence |
|---|---|---|---|
| `persons` row exists | **yes** | yes | `person_create_full:76 INSERT INTO public.persons`; 15/15 suppliers have `person_id` |
| person profile page `/persons/$id` | **yes** | yes | route exists; keyed on `persons.id` |
| `person_identifiers` (incl. `asan_person_code`) | **yes** — 2 rows exist today | yes | FK `person_identifiers.person_id` |
| `person_aliases` | **yes** (0 used system-wide) | yes | FK `person_aliases.person_id` |
| `person_field_values` (custom fields) | **yes** (0 used system-wide) | yes | FK `person_field_values.person_id` |
| `person_context_links` (groups/tags) | **yes** — 15 links, all `ref_table='suppliers'` | yes | see Q2a query |
| person merge | **yes** | yes | `person_merge_candidates`, `person_merge_log` FKs |
| **purchase form dropdown** | **yes** | **NO** | `PurchaseForm.tsx:174` reads `.from("suppliers")` |
| **`purchases.supplier_id`** | **yes** — 11 rows | **NO** (FK requires a `suppliers` row) | FK `purchases.supplier_id → suppliers.id` |
| **`purchase_prices` / `product_suppliers`** | **yes** — 241 / 31 rows | **NO** | FKs to `suppliers.id` |
| **`suppliers.trust_level` rating** | **yes** | **NO** — column exists only on `suppliers` | column list of `suppliers` |
| `dynamic_entity_scores` | **no** | no | CHECK allows only `customer`, `salesperson` |
| credit balance / ledger / profile | **no** | no (unless also a customer) | all keyed `customer_person_id` |
| gamification / KPI | **no** | no | keyed on `employee_id` (profiles) |

**Conclusion for Q1:** a /suppliers-created supplier has **every** person capability plus every
supplier capability. There is no missing-capability problem in that direction. The gap is entirely
the reverse: a /persons-created person has person capabilities but **no** supplier capabilities.

---

## Q2: The سانشور case — what actually happened?

### Q2a — «سانشور» does not exist anywhere in the database

Searched every name-bearing table:

```sql
select 'persons' src, id::text, display_name as name from persons where display_name ilike '%سان%'
union all select 'suppliers', id::text, name from suppliers where name ilike '%سان%'
union all select 'customers', id::text, name from customers where name ilike '%سان%'
union all select 'external_parties', id::text, full_name from external_parties where full_name ilike '%سان%'
union all select 'person_aliases', id::text, alias from person_aliases where alias ilike '%سان%';
```
```
 persons   | 1a71b1e2-… | احسان بختیاری
 suppliers | 84d90f79-… | احسان بختیاری
```

Only «اح**سان** بختیاری» matches the substring. **No row named «سانشور» exists.** Either it was
never saved, it was removed, or the name recalled was approximate.

**The orphan that does exist is «روشناس»:**

```sql
select p.id, p.display_name, p.created_at,
       (select count(*) from person_context_links l where l.person_id=p.id) as ctx_links,
       (select count(*) from suppliers s where s.person_id=p.id) as supplier_rows
  from persons p where p.created_at > now() - interval '4 days' order by p.created_at desc limit 1;
```
```
 14bb7791-a338-4cf3-8d5e-d7f7c369c4a4 | روشناس | 2026-08-06 09:32:59.833335+00 | 0 | 0
```

⚠️ **A name collision worth noticing:** a *legitimate, working* supplier called «صباح روشناس»
already exists (`suppliers.id = b05f3194…`, `persons.id = ee20926a…`, created 2026-07-31, with a
proper `supplier/suppliers/b05f3194…` context link and 8 purchases against it). The orphan is a
*second, bare* person named just «روشناس». The employee may have been re-creating a supplier that
already existed.

**Across the whole database there is currently no person with a supplier context link but no
`suppliers` row:**

```sql
select context_kind, ref_table, count(*), count(*) filter (where ref_id is null) as ref_id_null
  from person_context_links group by 1,2 order by 3 desc;
```
```
 staff_link       | profiles         | 41 | 0
 customer         | customers        | 22 | 0
 supplier         | suppliers        | 15 | 0
 accounting_party | external_parties |  1 | 0
```

Every supplier link has `ref_table='suppliers'` and a non-null `ref_id` — the signature of the RPC
path. **«روشناس» has no context link at all**, so the person was created and the "supplier group"
step either was never completed or did not persist.

### Q2b — Simulating the dropdown query

The exact query from `PurchaseForm.tsx:170-183`:

```sql
select id, name from suppliers where is_active = true order by name asc limit 100;
```
```
 6e9a0239-… | 12                   fe99bd7c-… | حاج حسن امین زاده
 b9eb6f37-… | api                  0b72e2c7-… | خالدمیرزایی
 866fffbb-… | Farshid Soofizadeh   b05f3194-… | صباح روشناس     ← the OTHER, working one
 84d90f79-… | احسان بختیاری        4ba1a0ed-… | محمدرضا افرا
 fd5bb872-… | ایوب احمدی           7ea10501-… | محمدزین الدین
 aef4a80e-… | تست تامین کننده      bbb456fa-… | مختارشاهمرادی
 0fa0985d-… | تست دستی من          24260c17-… | مصطفوی
                                   0bffad0d-… | مظاهر عزیزی
(15 rows)
```

**Person `14bb7791` («روشناس») is absent** — it has no `suppliers` row, and the query reads only
`suppliers`. Confirmed by construction: the FK `purchases.supplier_id → suppliers.id` would refuse
the person id even if the UI offered it.

### Q2c — Is there any UI signal that the supplier "wasn't really created"?

**Partly — and only somewhere the user is unlikely to look.**

`PersonDeepLinks` (rendered on the person detail page) computes a state per context link.
`src/components/persons/PersonDeepLinks.tsx:43-48`:

```ts
(link.context_kind === "customer" ||
  link.context_kind === "supplier" ||
  link.context_kind === "staff_link") &&
…
return { ...base, state: "missing_ref", title: null, href: null };
```

and renders, at `:146-151`:

```tsx
case "missing_ref":
  return (
    <Badge variant="outline" className="border-amber-500/50 text-amber-700">
      ارتباط ناقص
    </Badge>
  );
```

with the hint at `:173`: `return "ارتباط ناقص";`

**So a supplier context link with no `ref_id` does show an amber «ارتباط ناقص» badge** on the person
page. Three reasons that is weak in practice:

1. **It does not fire for «روشناس» at all** — that person has *no* context link, so there is nothing
   to badge. The user sees a perfectly normal person page.
2. It appears only on `/persons/$personId`, not at the moment of creation, not in
   `PersonContextLinksForm` when the link is added, and nowhere near the purchase form.
3. The wording describes the *link* as incomplete. It does not say "this supplier cannot be used in
   a purchase", which is the consequence the user cares about.

**There is no error, no toast and no blocking validation at creation time.** `addPersonContextLink`
(`src/lib/persons/context-links.functions.ts:97-101`) is a plain INSERT that succeeds:

```ts
const { data: row, error } = await supabase
  .from("person_context_links")
  .insert(payload)
```

---

## Q3: Full sidebar audit

Registry: **`src/lib/navigation/registry.ts`** (1368 lines). Seeds start at `:66`
(`const NAVIGATION_SEEDS = [`). Group/subgroup keys are typed in
`src/lib/navigation/types.ts:13-33`. Visibility is computed in
`src/lib/navigation/selectors.ts:30-38`. Renderer: `src/components/layout/AppSidebar.tsx`.

**118 seed entries**, 9 groups, 180 route files under `src/routes/`.

### How "who sees it" is computed

`selectors.ts:30-38`, verbatim:

```ts
export function isNavigationEntryVisible(entry, roles) {
  if (entry.hiddenFromMenu) return false;
  if (entry.adminOnly && !roles.includes("admin") && !roles.includes("manager")) return false;
  if (entry.allowedRoles && !entry.allowedRoles.some((role) => roles.includes(role))) return false;
  return hasPermissionEx(roles, entry.permission.module, entry.permission.action);
}
```

**Three gates, ANDed:** `adminOnly` (= admin **or manager**), `ROLE_ALLOWLIST_BY_ROUTE`, and the
module's `can_view` in `role_permissions` (falling back to the static `PERMISSIONS` matrix).
`hasPermissionEx` short-circuits `true` for admin (`roles.ts:299`).

The "sees" column below is the intersection of all three.

### Q3d — The tree, as it appears in code

- **main** (1 item)
  - `/collaboration` — ارتباطات همکاری · module=`messages` · sees: accountant, admin, manager, purchase_specialist, sales, viewer
- **products-pricing** (21 items)
  - _pp-catalog_
    - `/products` — محصولات · `products` · accountant, admin, manager, purchase_specialist, sales, site
    - `/products/new` — افزودن محصول · `products` · same
    - `/products/categories` — دسته‌بندی‌ها · `products` · same
    - `/products/brands` — برندها · `products` · same
    - `/products/attributes` — ویژگی‌ها · `products` · same
    - `/products/labels` — برچسب‌ها · `products` · same
  - _pp-pricing_
    - `/pricing/purchase-prices` — قیمت‌های خرید · `pricing` · accountant, admin, manager, purchase_specialist, sales
    - `/pricing/rules` — قوانین قیمت‌گذاری · `pricing` · same
    - `/pricing/sale-price-types` — نوع‌های قیمت فروش · `pricing` · same
    - `/pricing/quick-price` — قیمت سریع · `pricing` · same
    - `/pricing/calculator` — ماشین‌حساب قیمت · `pricing` · same
    - `/pricing/my-workbench` — کارگاه قیمت من · `pricing` · same
    - `/pricing/attention` — فرصت جبران · `pricing` · same
    - `/pricing/price-alerts` — هشدارهای قیمت · `pricing` · same
    - `/pricing/market-intelligence` — هوشمند بازار · `pricing` · accountant, admin, manager
    - `/pricing/product-recommendations` — پیشنهاد محصولات · `products` · admin, manager `adminOnly`
  - _pp-publish_
    - `/pricing/amin-hozoor-board` — تابلو قیمت زنده · `pricing` · accountant, admin, manager, purchase_specialist, sales
    - `/pricing/live-price-list` — لیست قیمت زنده · `pricing` · same
    - `/pricing/sale-lists` — لیست قیمت فروش · `pricing` · same
    - `/price-lists` — لیست‌های قیمت · `price-lists` · same
    - `/pricing/recompute-prices` — انتشار دسته‌ای قیمت · `pricing` · admin, manager `adminOnly`
- **purchasing** (6 items)
  - `/suppliers` — تأمین‌کنندگان · `suppliers` · accountant, admin, manager, purchase_specialist, sales
  - `/purchase` — فضای خرید · `purchases` · same
  - `/purchases` — پنل خرید · `purchases` · same
  - `/warehouses` — انبارها · `warehouse` · same
  - `/warehouses/transfers` — انتقال بین‌انباری · `warehouse` · same
  - `/warehouses/kardex` — گزارش کاردکس · `warehouse` · same
- **sales-customers** (14 items)
  - _sc-customers_
    - `/sales/customers` — مشتریان · `sales` · accountant, admin, manager, sales
    - `/persons` — اشخاص · `persons` · accountant, admin, manager, sales, viewer
    - `/persons/import` — ایمپورت اشخاص · `persons` · admin, manager
    - `/persons/merge` — اشخاص تکراری · `persons` · admin, manager
    - `/sales/credit-customers` — اعتبار مشتریان · `sales` · accountant, admin, manager, sales
    - `/sales/credit-rules` — قوانین اعتبار · `sales` · accountant, admin
    - `/sales/customers/credit-training` — آموزش اعتبار مشتریان · `sales` · accountant, admin, manager, sales
  - _sc-sales_
    - `/sales` — جستجوی سریع فروش · `sales` · accountant, admin, manager, sales
    - `/sales/quotes` — پیش‌فاکتورها · `invoices` · accountant, admin, manager, sales
    - `/sales/invoices` — فاکتورهای فروش · `invoices` · **hidden**
    - `/invoices` — فاکتورها · `invoices` · **hidden**
    - `/my-rejected-quotes` — درخواست‌های رد شدهٔ من · `sales` · accountant, admin, manager, sales
    - `/sales/product-videos` — ویدئوی محصول · `product-videos` · accountant, admin, manager, sales
    - `/sales/stock-alerts` — هشدار موجودی · `sales` · accountant, admin, manager, sales
- **finance** (11 items) — ⚠️ every one uses module `accounting`, which has **no `role_permissions` rows** (see issue 1)
  - `/accounting/receipts` — فیش‌های واریزی · `accounting` · **all roles incl. viewer, site**
  - `/accounting/receipts/training` — آموزش فیش‌های واریزی · `accounting` · all roles
  - `/accounting/receivables` — مطالبات مشتریان · `accounting` · all roles
  - `/accounting/payables` — بدهی تأمین‌کنندگان · `accounting` · all roles
  - `/accounting/purchase-payments` — پرداخت خرید · `accounting` · all roles
  - `/accounting/bank-accounts` — حساب‌های بانکی · `accounting` · all roles
  - `/accounting/treasury` — خزانه و ماندهٔ صندوق · `accounting` · all roles
  - `/accounting/payment-vouchers` — اسناد پرداخت · `accounting` · all roles
  - `/accounting/external-parties` — طرف‌های حساب · `accounting` · all roles
  - `/accounting/dynamic-capital` — تخصیص سرمایه پویا · `accounting` · accountant, admin *(allowlisted)*
  - `/accounting/salesperson-scoring` — امتیازدهی کارشناسان فروش · `accounting` · all roles
- **operations** (7 items)
  - `/operations/tasks` — برد وظایف · `invoices` · accountant, admin, manager, sales
  - `/operations/daily-mood` — حال‌وهوای امروز · `feedback` · accountant, admin, manager, purchase_specialist, sales, viewer
  - `/operations/daily-mood/admin` — مدیریت حال‌وهوا · `hr` · admin, manager `adminOnly` ⚠️ `hr` has no `role_permissions` rows
  - `/feedback` — بازخورد · `feedback` · accountant, admin, manager, purchase_specialist, sales, viewer
  - `/gamification` — داشبورد گیمیفیکیشن · `dashboard` · same
  - `/gamification/leaderboard` — لیدربورد · `dashboard` · same
  - `/gamification/settings` — تنظیمات وزن KPIها · `dashboard` · admin, manager `adminOnly`
- **reports** (5 items)
  - `/audit-logs` — لاگ فعالیت‌ها · `audit-logs` · admin `adminOnly`
  - `/sales/quote-share-logs` — لاگ اشتراک‌گذاری پیش‌فاکتور · `invoices` · accountant, admin, manager, sales
  - `/marketing/suggestions` — پیشنهادهای تبلیغاتی · `reports` · accountant, admin, manager, purchase_specialist, sales, viewer
  - `/marketing/suggestions-history` — تاریخچه پیشنهادها · `reports` · same
  - `/marketing/my-tasks` — وظایف بازاریابی من · `reports` · same
- **knowledge-comms** (5 items)
  - `/knowledge` — دانش سازمانی · `knowledge` · accountant, admin, manager, purchase_specialist, sales, viewer
  - `/academy` — آکادمی · `academy` · same
  - `/updates` — تغییرات و به‌روزرسانی‌ها · `platform-releases` · all roles incl. site
  - `/messages` — پیام‌رسان · `messages` · accountant, admin, manager, purchase_specialist, sales, viewer
  - `/data-tables` — جداول داده پویا · `data-tables` · accountant, admin, manager, purchase_specialist, sales, site
- **admin** (48 items)
  - _adm-gamification_ (9) — `/gamification/admin/{kpi-rules, achievements, missions, leagues, rewards, analytics, purchase-settings, manual-metrics, manual-metrics/guide}` · all module=`roles` · **admin only** `adminOnly`
  - _adm-settings_ (23)
    - `/admin/settings`, `/admin/penalties`, `/admin/audit`, `/admin/workflow-settings`,
      `/admin/marketing-channels`, `/admin/marketing-task-templates`, `/admin/sales-reminders`,
      `/admin/payment-terms`, `/admin/visitors`, `/admin/waybill-fields`, `/admin/receipt-fields`,
      `/admin/recent-purchase-settings`, `/admin/workflow-stages`, `/admin/validation-rules`
      · all module=`roles` · **admin only** `adminOnly`
    - `/admin/platform-releases` — مدیریت به‌روزرسانی‌ها · `platform-releases` · admin
    - `/pricing/currencies`, `/pricing/currency-sources`, `/pricing/currency-rates`,
      `/pricing/settlement-types`, `/pricing/shipping-rules`, `/pricing/change-reasons`,
      `/pricing` · `pricing` · admin, manager `adminOnly`
    - `/pricing/market-rates-workshop` · `market-rates` · admin, manager `adminOnly` ⚠️ no `role_permissions` rows
  - _adm-tools_ (11)
    - `/admin/phone-collisions`, `/admin/purchase`, `/admin/documents`, `/admin/delivery-receipts`,
      `/admin/automation`, `/admin/ai-providers` · `roles` · **admin only** `adminOnly`
    - `/admin/asan-import` — ورود اطلاعات از آسان · `asan-import` · accountant, admin
    - `/admin/asan-export` — خروجی برای آسان · `asan-export` · accountant, admin
    - `/bot-api-keys` — کلیدهای API ربات · `bot-api-keys` · admin, manager, site
    - `/integrations/didar` · `bot-api-keys` · admin, manager `adminOnly`
    - `/market-matches` · `bot-api-keys` · admin, manager `adminOnly`
  - _adm-users_ (5)
    - `/users` — کاربران · `users` · admin
    - `/users/pending` — کاربران در انتظار تأیید · `users` · admin `adminOnly`
    - `/roles` — نقش‌ها و دسترسی‌ها · `roles` · admin
    - `/admin/roles` — مجوزهای پویا · `roles` · admin `adminOnly`
    - `/admin/profile-fields` — فیلدهای کاربر · `users` · admin `adminOnly`

### Q3c — Structural issues observed (no fixes proposed)

**1. ⚠️ Three nav modules have no `role_permissions` rows at all — the rule 2.5 open door.**

```sql
-- modules used by nav entries, checked against role_permissions
accounting     used by: /accounting/receipts, /accounting/receipts/training,
                        /accounting/receivables, /accounting/payables  (+7 more)
hr             used by: /operations/daily-mood/admin
market-rates   used by: /pricing/market-rates-workshop
```

`has_dynamic_permission` grants a module with **no row at all** to *every* role. `accounting`
covers **11 finance items** — bank accounts, treasury, payment vouchers, receivables, payables. On
the current data that means a `viewer` and the `site` role see the entire finance group in the
sidebar. `hr` and `market-rates` are shielded by `adminOnly`, so their exposure is limited to
admin+manager; `accounting` is **not** shielded except for `/accounting/dynamic-capital`, which
carries an explicit allowlist. This is the single most consequential finding in the audit.

**2. `ROLE_ALLOWLIST_BY_ROUTE` names `manager` on 17 routes where it can never take effect.**

```
/admin/penalties, /admin/audit, /admin/purchase, /admin/documents,
/admin/delivery-receipts, /admin/workflow-settings, /admin/sales-reminders,
/admin/automation, and the 9 /gamification/admin/* routes
```

All use module `roles`, and:

```sql
select role_name, can_view from role_permissions where module='roles' order by role_name;
--  accountant | t     manager | f     purchase_specialist | f
--  admin      | t     sales   | f     site | f     viewer | f
```

Because the three gates are ANDed, the effective audience is
`(admin|manager) ∧ (admin,manager) ∧ (accountant,admin)` = **admin only**. The allowlist entry is
inert, and an accountant is excluded by `adminOnly` despite `role_permissions` granting them
`roles.can_view`. Three mechanisms disagree; the strictest silently wins.

**3. Single-item group.** `main` contains exactly one entry (`/collaboration`).

**4. 19 genuine orphan routes** — a route file exists, no sidebar entry points to it, and it is not
a `$param`/create/edit child of a seeded route (42 such children were excluded):

```
/accounting/customer-capital-allocations   /operations/api-keys
/accounting/daily-capital                  /operations/didar
/accounting/salesperson-capital-allocations /operations/gamification
/admin/gamification                        /operations/purchase-advisor
/admin/gamification/achievements           /operations/receipts
/api-keys                                  /popup-center
/dashboard                                 /presence
/delivery-receipts                         /reports
/documents                                 /my-penalties
/notifications
```

**5. Apparent duplicate concepts among the orphans.** Several look like older or newer copies of a
seeded page, though I did not read each to confirm:

| orphan | seeded counterpart |
|---|---|
| `/operations/receipts` | `/accounting/receipts` |
| `/operations/api-keys`, `/api-keys` | `/bot-api-keys` |
| `/operations/gamification`, `/admin/gamification`, `/admin/gamification/achievements` | `/gamification`, `/gamification/admin/achievements` |
| `/delivery-receipts` | `/admin/delivery-receipts` |
| `/documents` | `/admin/documents` |
| `/reports` | the `reports` **group** exists but no `/reports` entry |
| `/accounting/customer-capital-allocations`, `/accounting/salesperson-capital-allocations` | `/accounting/dynamic-capital` (the previous diagnostic noted these are redirect stubs kept for bookmarks — M1.2) |

**6. No dead links and no duplicate `to` values.** Every one of the 118 seeds resolves to an
existing route file; no route is seeded twice.

**7. Two entries are registered but permanently hidden** — `/sales/invoices` and `/invoices`, both
module `invoices`, both `hiddenFromMenu`. The registry comment at `registry.ts:319-322` explains
why, verbatim:

> `invoices` / `invoice_items` are a dead parallel design: both tables hold 0
> rows and the live pre-invoice workflow is `sales_quotes` (/sales/quotes).
> Hidden from the menus only — routes, guards and breadcrumbs are unchanged.

Confirmed: `select count(*) from invoices;` → **0**.

**8. Topic/grouping observations.**
- The owner's hypothesis that تأمین‌کنندگان sits under کالا is **refuted** — `/suppliers` is in
  `purchasing` (`registry.ts:257-262`), which is topically right.
- `purchasing` mixes procurement (`/suppliers`, `/purchase`, `/purchases`) with **inventory**
  (`/warehouses`, `/warehouses/transfers`, `/warehouses/kardex`). Warehouses are arguably
  operations rather than purchasing.
- **8 pricing routes live in the `admin` group** (`adm-settings`) while 16 others live in
  `products-pricing`. The split is by *who may change it*, not by topic.
- `/products/new` is an **action** ("add product") listed as a peer of the list page.
- `/sales/quote-share-logs` (a sales log) and the three `/marketing/*` items sit in `reports`,
  while `/operations/tasks` uses module `invoices` — module and group disagree in several places.
- `adm-settings` holds **23 items** in one flat list.

---

## Q4: If we unified on persons, what would break?

**Risk analysis only — no fix proposed.**

### Q4a — Application code reading `suppliers` directly: **13 call sites in 10 files**

```
src/components/persons/PersonCollisionPanel.tsx:83      duplicate-detection panel
src/components/persons/PersonDeepLinks.tsx:80           resolve supplier title for the person page
src/lib/ai-tools/purchase-advisor.functions.ts:67       AI purchase advisor context
src/lib/pricing/queries.ts:27                           pricing queries
src/routes/_app.accounting.payment-vouchers.tsx:123     payee picker on payment vouchers
src/routes/_app.pricing.purchase-prices.tsx:201         supplier names for purchase prices
src/routes/_app.suppliers.tsx:106                       supplier list
src/routes/_app.suppliers.tsx:131                       supplier list (second query)
src/routes/_app.suppliers_.$supplierId.tsx:62           supplier detail
src/routes/_app.suppliers_.$supplierId.tsx:76           supplier detail (second query)
src/shared/components/ProductSupplierManager.tsx:324    product↔supplier manager
src/shared/components/PurchaseForm.tsx:174              the purchase dropdown
src/shared/components/SupplierForm.tsx:90               supplier edit form
```

### Q4b — Foreign keys pointing at `suppliers.id`: **4**

```sql
select c.conrelid::regclass::text as child_table, a.attname as fk_column,
       case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' end as on_delete
  from pg_constraint c join unnest(c.conkey) with ordinality k(attnum,ord) on true
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
 where c.contype='f' and c.confrelid='public.suppliers'::regclass order by 1,2;
```
```
 payment_vouchers  | payee_supplier_id | RESTRICT
 product_suppliers | supplier_id       | CASCADE
 purchase_prices   | supplier_id       | SET NULL
 purchases         | supplier_id       | NO ACTION
```

Live row counts behind those keys:

```
 purchases.supplier_id              |  11
 purchase_prices.supplier_id        | 241   ← the largest dependency
 product_suppliers.supplier_id      |  31
 payment_vouchers.payee_supplier_id |   0
```

### Q4c — What happens to `purchases.supplier_id`, and is there a safe path?

**There is already a partial bridge, and it points the opposite way from unification.** Four
triggers derive the person id *from* the legacy id:

```
tg_purchases_derive_person
tg_purchase_prices_derive_person
tg_product_suppliers_derive_person
tg_payment_vouchers_derive_person
```

`tg_purchases_derive_person`, verbatim:

```sql
BEGIN
  IF NEW.supplier_id IS NULL THEN
    NEW.supplier_person_id := NULL;
  ELSE
    SELECT s.person_id INTO NEW.supplier_person_id
      FROM public.suppliers s WHERE s.id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END
```

**So `suppliers` is unambiguously the source of truth today and `supplier_person_id` is a
trigger-maintained denormalisation.** Unification would have to **invert** every one of these four
triggers — the person id becomes the input and the legacy id the derived value, or the legacy
column is dropped.

The encouraging half: `supplier_person_id` is **already populated on every row that has a
supplier** (11 of 11 on `purchases`), so the target column exists and is filled. The dangerous
half: it is populated *by* the thing being removed, so the cut-over must happen in one migration —
freeze derivation, repoint the FK, drop or retain the legacy column — and any row where
`supplier_person_id` is NULL because `supplier_id` was NULL stays NULL either way.

### Q4d — Which side is kept, and what happens to the other?

All 15 suppliers exist on both sides with zero drift (proved in the previous diagnostic). Under
unification:

- **`persons` would be kept** — it is the richer record (identifiers, aliases, custom fields,
  merge) and is already the FK target of `supplier_person_id`.
- **`suppliers` could not simply be dropped**, because it carries **columns that exist nowhere
  else**: `trust_level`, `status`, `contact_name`, `city`, `is_active`, `email`, `address`. Those
  would need a new home — either on `persons`, on `person_field_values`, or on a slimmed
  supplier-profile table. `trust_level` in particular is live data (13 medium, 2 high).
- The `person_context_links` row would become the sole assertion of supplier-ness, and everything
  that today asks "is there a `suppliers` row?" would have to ask "is there an active
  `supplier` context link?" — including the `is_active` filter in the dropdown, which currently
  reads `suppliers.is_active`, a column the persons model does not have.

### Q4e — e2e specs touching suppliers: **12 files, 48 occurrences**

```
e2e/asan/export-purchase.spec.ts            e2e/persons/product-supplier-person.spec.ts
e2e/persons/filters-ui.spec.ts              e2e/persons/profile-dossier-jwt.spec.ts
e2e/persons/filters-visible-persons.spec.ts e2e/persons/profile-dossier-ui.spec.ts
e2e/persons/inline-supplier-create.spec.ts  e2e/persons/purchase-price-person.spec.ts
e2e/persons/one-person-one-customer.spec.ts e2e/persons/supplier-form-person.spec.ts
e2e/persons/phone-collisions-ui.spec.ts     e2e/security/viewer-restrictions.spec.ts
```

Two are dedicated to exactly the invariant unification would change:
`inline-supplier-create.spec.ts` and `supplier-form-person.spec.ts`. `export-purchase.spec.ts`
constructs a supplier Asan code fixture (`99900001`) against `suppliers.person_id`.

### Q4f — Total surface area of change

| dimension | count | detail |
|---|---:|---|
| application files reading `suppliers` | **10** | 13 call sites |
| database functions mentioning `suppliers` | **21** | incl. `person_create_inline`, `create_purchase`, `person_merge`, `asan_list_purchase_export`, `get_account_ledger`, `auto_link_supplier_on_purchase`, `cleanup_stale_auto_suppliers`, `person_fk_drift_report` |
| tables with an FK to `suppliers.id` | **4** | 283 dependent rows total |
| derive-person triggers to invert | **4** | `tg_{purchases,purchase_prices,product_suppliers,payment_vouchers}_derive_person` |
| columns with no home in `persons` | **7** | `trust_level`, `status`, `contact_name`, `city`, `is_active`, `email`, `address` |
| e2e spec files | **12** | 2 dedicated to the supplier↔person invariant |
| supplier rows to migrate | **15** | all already dual-written |

**The honest summary:** this is not a small change. The 241 `purchase_prices` rows and the 21
database functions are the heavy parts, and `person_merge` in particular reads its work list from
`pg_constraint` and halts on unknown keys (the migration-285 regression) — so any FK change here
must be registered with it.

---

## Q5: How many kinds of financial document exist?

### Q5a — Every table representing a financial event

```sql
select 'payment_receipts' t, count(*)::text n from payment_receipts
union all select 'payment_vouchers', count(*)::text from payment_vouchers
union all select 'journal_entries', count(*)::text from journal_entries
union all select 'journal_lines', count(*)::text from journal_lines
union all select 'payment_receipt_links', count(*)::text from payment_receipt_links
union all select 'invoices (dead design)', count(*)::text from invoices
union all select 'sales_quotes', count(*)::text from sales_quotes
union all select 'purchases', count(*)::text from purchases
union all select 'customer_credit_ledger', count(*)::text from customer_credit_ledger
union all select 'capital_allocation_ledger', count(*)::text from capital_allocation_ledger
union all select 'delivery_receipts', count(*)::text from delivery_receipts order by 1;
```
```
 capital_allocation_ledger |   0
 customer_credit_ledger    |   1
 delivery_receipts         |   1
 invoices (dead design)    |   0
 journal_entries           |   1
 journal_lines             |   2
 payment_receipt_links     |   3
 payment_receipts          |   6
 payment_vouchers          |   0
 purchases                 | 334   (incl. e2e residue)
 sales_quotes              |  50
```

**The two primary money-movement documents are `payment_receipts` (money IN) and
`payment_vouchers` (money OUT).** `journal_entries` is the double-entry projection, not a document
type of its own.

### Q5b — `payment_receipts`: the type columns

There are **two orthogonal classifiers**, which is the key to the whole question.

**`receipt_type` — the business *purpose*:**

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.payment_receipts'::regclass and conname='payment_receipts_receipt_type_check';
-- CHECK (receipt_type = ANY (ARRAY['invoice_payment','debt_payment','prepayment','positive_credit']))

select receipt_type, status, count(*) from payment_receipts group by 1,2 order by 1,2;
```
```
 debt_payment    | pending_review | 2
 invoice_payment | approved       | 1
 invoice_payment | pending_review | 2
 positive_credit | pending_review | 1
```

| value | business meaning |
|---|---|
| `invoice_payment` | settles a specific pre-invoice (via `payment_receipt_links`) |
| `debt_payment` | pays down an outstanding balance, not a specific invoice |
| `prepayment` | money received before any invoice exists |
| `positive_credit` | credit granted to the customer's account |

**`document_channel` — *how* the money moved:**

```sql
-- CHECK (document_channel IS NULL OR document_channel = ANY
--   (ARRAY['card_to_card','paya','pol','satna','cash','cheque','other']))
select document_channel, count(*) from payment_receipts group by 1 order by 2 desc;
```
```
 paya   | 3
 (null) | 2
 other  | 1
```

Cheque fields are guarded: `CHECK (document_channel = 'cheque' OR (cheque_number IS NULL AND
cheque_due_date IS NULL))`.

### Q5c — How `journal_entries` distinguishes kinds

Not by a type column — the only CHECK is on status:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.journal_entries'::regclass and contype='c';
-- journal_entries_status_chk | CHECK (status = ANY (ARRAY['draft','posted','void']))

select distinct source_type from journal_entries;
-- payment_receipt
```

The distinguishing signal is **the mix of `account_kind` on its lines**, which is exactly what
`asan_list_journal_export` computes (migration 294, live version from 297):

```sql
CASE
  WHEN COALESCE(a.has_external, false) THEN 'third_party'   -- any external_party line
  WHEN COALESCE(a.bank_net, 0) > 0 THEN 'receipt'           -- bank net DEBITED
  WHEN COALESCE(a.bank_net, 0) < 0 THEN 'payment'           -- bank net CREDITED
  ELSE 'unclassified'
END
```

**⛔ And here is the decisive finding.** Only one function in the entire database writes journal
entries:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f' and pg_get_functiondef(p.oid) ilike '%journal_entries%';
-- asan_list_journal_export   (reads)
-- post_receipt_accounting    (writes)
```

`payment_vouchers` **never posts a journal entry** — no function mentions both:

```sql
select p.proname from pg_proc p … where pg_get_functiondef(p.oid) ilike '%journal_entries%'
   and pg_get_functiondef(p.oid) ilike '%payment_voucher%';
-- (empty)
```

And `post_receipt_accounting` always builds the same two-line shape (`:147-171`):

```
147:      v_debit_kind := 'bank';            v_debit_desc := 'واریز به حساب بانکی شرکت';
151:      v_debit_kind := 'external_party';  v_debit_desc := 'پرداخت به طرف خارجی';
170:      (v_journal_id, 1, v_debit_kind, v_debit_ref, v_receipt.amount, 0, v_debit_desc),
171:      (v_journal_id, 2, 'customer_credit', v_receipt.customer_id, 0, v_receipt.amount, …);
```

Line 1 is **always a debit**; line 2 is **always a credit to `customer_credit`**. Therefore
`bank_net` can never be negative, and **`doc_kind` can never be `'payment'`**. Export 4
(پرداخت · برداشت) is not merely empty for lack of data — it is **structurally unreachable** from
the only posting path that exists.

Conversely, دوبل **is** reachable: when a receipt carries `receiver_party_id`, line 1 is an
`external_party` debit, `has_external` is true, and the document classifies as `third_party`. It
has simply never happened (0 such lines).

### Q5d — The seven Iranian document types

| # | type | representable? | how (table + flag) | live count |
|---|---|---|---|---:|
| 1 | **دریافت نقدی** cash receipt | **yes** | `payment_receipts` with `document_channel='cash'` and no `destination_bank_account_id` | **0** |
| 2 | **پرداخت نقدی** cash payment | **yes, as a document** | `payment_vouchers` with `document_channel='cash'` | **0** |
| 3 | **واریز به بانک** bank deposit in | **yes** | `payment_receipts` with `destination_bank_account_id` set | **2** (1 approved) |
| 4 | **برداشت از بانک** bank withdrawal out | **yes, as a document** | `payment_vouchers` with `source_bank_account_id` set | **0** |
| 5 | **دریافت چک** cheque received | **yes** | `payment_receipts` with `document_channel='cheque'` + `cheque_number`, `cheque_due_date` | **0** |
| 6 | **پرداخت چک** cheque paid | **yes** | `payment_vouchers` with `document_channel='cheque'` (CHECK *requires* `cheque_number`) | **0** |
| 7 | **سند دوبل / انتقال طرف حساب** | **yes** | `payment_receipts.receiver_party_id` → an `external_party` debit line → `doc_kind='third_party'` | **0** |

Supporting counts:

```sql
select destination_bank_account_id is not null as into_our_bank, count(*) from payment_receipts group by 1;
--  f | 4        t | 2
select cheque_number is not null as has_cheque, count(*) from payment_receipts group by 1;
--  f | 6
select count(distinct journal_entry_id) from journal_lines where account_kind='external_party';
--  0
select count(*) from payment_vouchers;
--  0
```

**All seven are representable in the data model.** Only #3 has ever been used.

⚠️ **The caveat on #2, #4 and #6.** They are representable as *documents* (`payment_vouchers` rows)
but **not as accounting entries**, because vouchers post no journal. So an outgoing payment can be
recorded in AfraKala and still be invisible to double-entry — and to Asan.

### Q5e — Creatable but not exported, and vice versa

**Creatable in AfraKala, NOT exportable to Asan:**

| what | why |
|---|---|
| **every `payment_vouchers` document** (cash payment, bank withdrawal, cheque paid) | no journal entry is posted, and there is no voucher-specific export. Export 4 reads `journal_entries` only |
| **cheque details** in either direction | `cheque_number` / `cheque_due_date` exist on both tables; no export maps them. The purchase layout even has a `پرداخت چک` column (K) — the previous diagnostic recorded it as always empty |
| `receipt_type` nuance (`prepayment`, `positive_credit`, `debt_payment`) | the exports key on bank/external-party structure, not on `receipt_type`; the distinction is lost |
| `document_channel` (paya / satna / pol / card_to_card) | not carried into any Asan column |

**Exportable in principle, but with no possible source today:**

| export | why |
|---|---|
| **Export 4 — پرداخت · برداشت** | `doc_kind='payment'` requires a net-credited bank line, which `post_receipt_accounting` cannot produce. Structurally unreachable, not merely empty |
| **Export 5 — دوبل** | reachable, but requires `payment_receipts.receiver_party_id` to be set; 0 such receipts exist |

**Exportable and working today:** export 1 (sales), export 3 (receipts), the secondary bank-deposit
path. Export 2 (purchase) is reachable but blocked on supplier Asan codes.

---

## UNKNOWN

1. **Whether «سانشور» ever existed.** No row of that name is in `persons`, `suppliers`,
   `customers`, `external_parties` or `person_aliases`, and audit rows were not searched by name.
   *Settled by:* the employee confirming the exact spelling, or the approximate time they saved it,
   so `audit_logs` can be searched by timestamp.
2. **Whether the /persons "supplier group" step ever completes for a user.** No person on this
   database has a supplier context link without a mirror row, so the failure is proven from code
   (`context-links.functions.ts:97`, plus no trigger) but never observed in data.
   *Settled by:* adding a supplier context link to «روشناس» on `/persons/$id/edit` and re-running
   the dropdown query — a one-minute manual test I did not perform because this is read-only.
3. **Whether the 19 orphan routes are dead code or deliberately unlisted.** I confirmed the files
   exist and no seed points at them; I did not read each to see whether another page links to it
   inline. *Settled by:* grepping each path for in-app `<Link to=…>` references, or the owner
   naming which are intentional.
4. **Whether `viewer` and `site` genuinely reach the finance pages at runtime.** The module
   `accounting` has no `role_permissions` rows, so `has_dynamic_permission` should open it to all —
   but each route file may carry its own `requireAnyRole` guard that I did not read for all 11.
   *Settled by:* opening one finance page with a viewer JWT and counting rows, or reading the 11
   route guards. **This is the highest-value follow-up in this report.**
5. **What `payment_vouchers` was intended to post.** The table is fully modelled with cheque and
   channel constraints but has 0 rows and no posting function. *Settled by:* the owner saying
   whether outgoing payments are recorded there today or only in Asan by hand.
6. **The true non-test purchase count.** `purchases` is at 334 with e2e residue mixed in and no
   reliable marker. *Settled by:* a cleanup decision from the owner.
