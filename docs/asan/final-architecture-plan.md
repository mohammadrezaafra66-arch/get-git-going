# Final architecture plan — one person, one identity, dual roles allowed

**Read-only planning investigation.** No code, migration, row or configuration was changed.
Discovered live against `afrakala` as `supabase_admin` (rule 2.2), schema read from the catalogue
(rule 2.6). HEAD at start: `840c2eeb`.

Date: 2026-08-06.

⚠️ **One prerequisite could not be read.** The task names five inputs; four exist and were read:
`asan-progress.md`, `ASAN_MISSION_CONTROL.md`, `supplier-and-journal-diagnostic.md`,
`deeper-diagnostic-round-2.md`. **`docs/asan/dual-role-person-analysis.md` does not exist** — not
on disk, not in git history, and no similarly-named file:

```
find . -iname "*dual*" -o -iname "*role-person*"   → (no matches)
git log --all --oneline -- "*dual-role-person-analysis*"   → (no matches)
```

The business facts it would have carried (50+ dual-role people, mutual settlement is common, phone
is identity, one Asan code per person) are taken **from the owner's statement in this task**, and
are treated as given rather than verified. Where a number below comes from the owner rather than
from the database, it says so.

---

## Executive summary

**The target architecture is roughly 80 % already built, and nobody has used it.**

`persons` is already the identity root; `customers` and `suppliers` are already thin role mirrors,
each with a `UNIQUE (person_id)` constraint, so a person may already hold zero, one or both roles.
Phone is already a globally unique identity key, enforced by a partial unique index and covered by
an e2e spec. A phone-first lookup primitive — `person_find_by_identifiers` — already exists and is
already used by the two bulk-import paths.

What is missing is small and specific:

1. the interactive creation path (`person_create_inline`) **does not call** the lookup primitive
   that already exists, so the forms mint a new person instead of finding the existing one;
2. nothing enforces **one Asan code per person** (the existing index enforces the opposite
   direction — one person per code);
3. `/persons` can assign a `supplier` context without creating the `suppliers` mirror row, so the
   role never becomes usable (round-2 finding, unchanged);
4. **mutual settlement cannot be expressed in the ledger at all** — there is no payable
   `account_kind`, and supplier payables live in a view derived from `purchases`, outside
   double-entry entirely. This is the one genuine schema gap, and the largest piece of work.

The duplicate mess is **6 name-groups / 14 person rows / 8 redundant rows** — far under the 50 the
owner guessed, and **every one is safe to merge** (no group has transactions on both sides).

**Fastest safe path:** fix the creation path to search by phone first (cheap, high value), add the
one-code-per-person constraint (cheap), add the context→mirror trigger (cheap), merge the 8
duplicates (cheap, and easier *after* the first three so the merge is not immediately re-polluted),
and treat mutual settlement as a separate, larger project of its own.

---

## Part 1: Duplicate-person inventory

### 1a — Strategy 1: same normalized phone. **Zero matches, and that is structural.**

```sql
select i.value_normalized as phone, count(distinct i.person_id) as persons_sharing
  from person_identifiers i join persons p on p.id=i.person_id
 where i.kind in ('mobile_e164','landline')
 group by 1 having count(distinct i.person_id) > 1;
-- (0 rows)
```

Not luck — the database forbids it:

```
uq_person_identifiers_contact_global
  UNIQUE (kind, value_normalized)
  WHERE status <> 'revoked' AND kind = ANY (ARRAY['mobile_e164','email'])
```

**Phone is already the identity key the owner wants**, enforced at the schema level and covered by
`e2e/persons/duplicate-mobile-blocked.spec.ts`, which asserts the rejection surfaces as a Persian
message rather than a raw constraint name (`:85-86`).

The consequence for planning: a duplicate can only arise when a person is created **without** a
phone. That is exactly what happened to «روشناس» (round-2, Q2).

### 1b — Strategy 2: same national id. **No data at all.**

```sql
select count(*) from person_identifiers where kind='national_id_ir';
-- 0
```

`persons` has no `national_id` column (columns are: `id, kind, display_name, legal_name,
visibility_scope, is_active, notes, created_by, created_at, updated_at`). National id is only
representable as an identifier kind, and none exists. **This strategy cannot run.**

### 1c — Strategy 3: similar name (pg_trgm, threshold 0.45). The real inventory

`pg_trgm` is installed. Exact-name grouping gives the definitive list:

```sql
with dup as (select btrim(display_name) nm from persons group by 1 having count(*)>1)
select nm, id, is_cust, is_supp, is_staff, asan, quotes, purch, receipts …
```
```
      name     |                  id                  | cust | supp | staff |  asan  | quotes | purch | receipts
---------------+--------------------------------------+------+------+-------+--------+--------+-------+----------
 1             | 9b2d24f6-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 1             | 576d185f-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 زینب احمدی    | 5b71f499-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 زینب احمدی    | a820b4f7-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 محمدرضا افرا  | 46f4be38-…                           |  0   |  1   |   0   |   -    |   0    |   1   |    0
 محمدرضا افرا  | ed04eeaf-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 محمدرضا افرا  | f802f989-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 محمدزین الدین | f144680e-…                           |  1   |  0   |   1   | 600018 |   6    |   0   |    1
 محمدزین الدین | 96298267-…                           |  0   |  1   |   0   |   -    |   0    |   0   |    0
 محمدزین الدین | 271d7c44-…                           |  1   |  0   |   0   |   -    |   0    |   0   |    0
 مختارشاهمرادی | 23b44c71-…                           |  0   |  1   |   0   |   -    |   0    |   2   |    0
 مختارشاهمرادی | 135ac0e1-…                           |  1   |  0   |   0   | 601702 |   0    |   0   |    0
 ولی غلامی     | 2556cfce-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
 ولی غلامی     | 036949b6-…                           |  0   |  0   |   1   |   -    |   0    |   0   |    0
(14 rows)
```

Trigram also surfaced three near-misses that are **probably distinct people or deliberate test
rows**, listed for completeness and not counted as duplicates:

```
 روشناس / صباح روشناس                    sim 0.583   ← the round-2 orphan vs a real supplier
 ملیکا / ملیکااااااااااااااااا            sim 0.556
 ملیکاااااترابییییی / ملیکاترابی          sim 0.529
```
(plus 10 `test.*@afrakala.local` pairs, which are harness accounts.)

### 1c — Total: **6 groups, 14 rows, 8 redundant**

The owner's «زیاد نیستن» is correct and then some. Broken down:

| kind | groups | rows | redundant |
|---|---:|---:|---:|
| staff/test accounts only (`1`, `زینب احمدی`, `ولی غلامی`) | 3 | 6 | 3 |
| business parties (`محمدرضا افرا`, `محمدزین الدین`, `مختارشاهمرادی`) | 3 | 8 | 5 |
| **total** | **6** | **14** | **8** |

### 1d — Merge-safety classification

| group | classification | reasoning |
|---|---|---|
| `1` ×2 | **Safe** | staff_link only, zero transactions on either side |
| `زینب احمدی` ×2 | **Safe** | staff_link only, zero transactions |
| `ولی غلامی` ×2 | **Safe** | staff_link only, zero transactions |
| `محمدرضا افرا` ×3 | **Safe** | all transactions (1 purchase) on **one** side (`46f4be38`); the other two are staff profiles |
| `محمدزین الدین` ×3 | **Safe, with a caveat** | all transactions (6 quotes, 1 receipt) on **one** side (`f144680e`), which also holds Asan code `600018`. The supplier side and the second customer side are empty |
| `مختارشاهمرادی` ×2 | **Safe, with the reverse caveat** | transactions (2 purchases) are on the **supplier** side `23b44c71`; the Asan code `601702` is on the **customer** side `135ac0e1`. Merging must keep **both** |

**Risky: 0. Blocked: 0.**

The `مختارشاهمرادی` case is the one to handle deliberately: the surviving person id must inherit
the purchases from one side and the Asan code from the other. `person_merge` already exists and
already reads its FK work-list from `pg_constraint` (migration 287), so it is the right tool — but
which id survives is a decision, not a default.

### The finding that reframes the whole plan

**No person currently holds both roles:**

```sql
select 'persons with a customer role' k, count(distinct person_id)::text v from customers where person_id is not null
union all select 'persons with a supplier role', count(distinct person_id)::text from suppliers where person_id is not null
union all select 'persons with BOTH roles', count(*)::text from (
   select c.person_id from customers c intersect select s.person_id from suppliers s) x;
```
```
 persons with a customer role | 22
 persons with a supplier role | 15
 persons with BOTH roles      |  0
```

The owner's 50+ dual-role people are **not represented in the system at all**. The two that do
exist in both capacities (`محمدزین الدین`, `مختارشاهمرادی`) exist as **separate person rows**,
because each creation path mints a fresh person. The mess is small only because the data is young;
it grows by one row every time a known counterparty is entered in their second capacity.

---

## Part 2: Dropdown query changes

### The structural finding first

**There is no shared hook to change.** No `useCustomers`, `useSuppliers` or `usePersons` file
exists:

```
find src -iname "*useCustomer*" -o -iname "*useSupplier*" -o -iname "*usePerson*"   → (no matches)
```

Every consumer inlines its own `supabase.from(...)`. There are **46 non-mutating call sites**
across `customers`, `suppliers` and `persons`. That is the real cost driver in Part 6.

### 2a — The purchase form's supplier dropdown

**Current** — `src/shared/components/PurchaseForm.tsx:170-183`:

```ts
const { data, error } = await supabase
  .from("suppliers")
  .select("id, name")
  .eq("is_active", true)
  .order("name", { ascending: true })
  .limit(100);
```

**Target** — persons holding an active supplier role:

```sql
select p.id as person_id, s.id as supplier_id, p.display_name as name
  from persons p
  join person_context_links l
    on l.person_id = p.id and l.context_kind = 'supplier' and l.ended_at is null
  left join suppliers s on s.person_id = p.id
 where p.is_active
 order by p.display_name limit 100;
```

**Field resolution check — one field does not survive:**

| field | resolves? | note |
|---|---|---|
| id | yes | but **which id?** see breakage below |
| name | yes | `persons.display_name` |
| `is_active` | **partially** | `suppliers.is_active` and `persons.is_active` are *different columns*. 15/15 suppliers are `is_active=true` today, so the two agree now |

**Breaking risk — the identifier the form submits.** `purchases.supplier_id` has a foreign key to
`suppliers.id`:

```
 purchases | supplier_id | NO ACTION   (FK → suppliers.id)
```

So the dropdown must keep returning a **`suppliers.id`**, not a `persons.id`, unless the FK is
repointed. A `left join` that yields `supplier_id = NULL` for a person with a context link but no
mirror row would produce an unselectable option — which is why the context→mirror trigger
(Part 6 step 2) must land **before** any dropdown change.

### 2b — The sales form's customer dropdown

**Current** — `src/routes/_app.sales.quotes.new.tsx:226` reads `.from("customers")`. Same shape,
same conclusion: `sales_quotes.customer_person_id` already exists **and is already a FK to
`persons.id`**, so the sales side is closer to the target than the purchase side.

### 2c — Every listing consumer, enumerated

**Party pickers (a dropdown or search that selects a counterparty) — 12 sites:**

| file:line | picker |
|---|---|
| `src/shared/components/PurchaseForm.tsx:174` | supplier |
| `src/routes/_app.sales.quotes.new.tsx:226` | customer |
| `src/routes/_app.accounting.payment-vouchers.tsx:123` | supplier payee |
| `src/routes/_app.accounting.payment-vouchers.tsx:152` | customer payee |
| `src/routes/_app.accounting.receipts.tsx:254` | customer |
| `src/shared/components/PaymentReceiptForm.tsx:103` | customer |
| `src/shared/components/PaymentReceiptForm.tsx:573` | customer |
| `src/shared/components/PaymentReceiptForm.tsx:646` | customer |
| `src/shared/components/PaymentReceiptForm.tsx:668` | customer |
| `src/shared/components/InvoiceForm.tsx:137` | customer |
| `src/shared/components/ProductSupplierManager.tsx:324` | supplier |
| `src/components/delivery-receipts/DeliveryReceiptUploadForm.tsx:127` | customer |

**List / detail / lookup pages — 20 further sites:**

`_app.suppliers.tsx:106,131` · `_app.suppliers_.$supplierId.tsx:62,76` ·
`_app.sales_.customers.tsx:89,121` · `_app.sales_.customers_.$customerId.credit.tsx:37` ·
`_app.sales_.customers_.$customerId.edit.tsx:24` · `_app.pricing.purchase-prices.tsx:201` ·
`_app.operations.didar.tsx:414,437,449,692` · `_app.admin.asan-import.tsx:227` ·
`hooks/capital/useDynamicCapital.ts:198` · `lib/customers/functions.ts:161,207` ·
`lib/invoices/functions.ts:108` · `lib/pricing/queries.ts:27` ·
`lib/ai-tools/purchase-advisor.functions.ts:67` ·
`components/delivery-receipts/DeliveryReceiptCard.tsx:70`

**Person-model consumers already on the target model — 8 sites** (no change needed):
`lib/persons/functions.ts:286,340,363,374,421` · `components/persons/PersonMergePanel.tsx:71` ·
`components/persons/PersonDeepLinks.tsx:67,80` · `components/persons/PersonCollisionPanel.tsx:81,83`

**Forms that write (out of scope for a dropdown change, in scope for creation):**
`CustomerForm.tsx:144,182` · `SupplierForm.tsx:90`

---

## Part 3: One Asan code per person — the invariant

### 3a — Where the code lives. **Confirmed: `person_identifiers`, kind `asan_person_code`.**

```sql
select kind, count(*) from person_identifiers group by 1 order by 2 desc;
--  mobile_e164      | 28
--  asan_person_code | 11
```

`suppliers` has **no** `accounting_code` column at all (round-2, Q6); `customers.accounting_code`
and `external_parties.accounting_code` exist but the export reads `person_identifiers`.

### 3b — Is one-code-per-person enforced? **No.**

The only relevant index enforces the **opposite** direction:

```
uq_person_identifiers_asan_code_active
  UNIQUE (kind, value_normalized)
  WHERE status <> 'revoked' AND kind = 'asan_person_code'
```

That is **one person per code** — it prevents two people claiming code `601702`. It does **not**
prevent one person holding both `601702` and `600018`.

The near-miss: `uq_person_identifiers_primary_active` is `UNIQUE (person_id, kind) WHERE
is_primary = true AND status <> 'revoked'` — which *would* enforce one-per-person if Asan codes
were marked primary. They are not:

```sql
select is_primary, status, count(*) from person_identifiers where kind='asan_person_code' group by 1,2;
--  f | provisional | 11
```

All 11 are `is_primary = false`, so that index never applies to them.

**Current violations: zero.**

```sql
select person_id, count(*) from person_identifiers where kind='asan_person_code' group by 1 having count(*)>1;
-- (0 rows)
```

### 3c — Who has a code today

```sql
select 'customers with asan code' k, count(*)::text v from customers c
  where exists (select 1 from person_identifiers i where i.person_id=c.person_id and i.kind='asan_person_code')
union all select 'suppliers with asan code', count(*)::text from suppliers s
  where exists (select 1 from person_identifiers i where i.person_id=s.person_id and i.kind='asan_person_code');
```
```
 customers with asan code | 11
 suppliers with asan code |  0
```

**For the two dual-role candidates, the code sits on the customer side and the supplier side has
none** — so there is no conflict to resolve, only a code to carry across:

| person | customer side | supplier side |
|---|---|---|
| `محمدزین الدین` | `f144680e` — code **600018** | `96298267` — no code |
| `مختارشاهمرادی` | `135ac0e1` — code **601702** | `23b44c71` — no code |

This is the best possible starting position: merging cannot produce a two-code person, because no
supplier has a code to bring.

### 3d — The invariant, and whether one index can express it

**Invariant:** *a person has at most one non-revoked `asan_person_code`.*

**Yes — one partial unique index expresses it exactly:**

```sql
-- NOT APPLIED. Stated for the plan only.
CREATE UNIQUE INDEX uq_person_identifiers_one_asan_code_per_person
  ON public.person_identifiers (person_id)
  WHERE kind = 'asan_person_code' AND status <> 'revoked';
```

It complements rather than replaces `uq_person_identifiers_asan_code_active`; together they make
the relationship **one-to-one**: one code per person *and* one person per code. It would apply
cleanly today (0 violations).

---

## Part 4: Mutual settlement

### 4a — Can one balanced journal entry express it today? **No.**

Worked through the owner's example — A owes me 10, I owe A 8, settle the 2 in cash:

| leg | needed account | available? |
|---|---|---|
| A owes me 10 | `customer_credit` (A) or `invoice_ar` | **yes** |
| I owe A 8 | a **payable** to A | **no such account kind** |
| net 2 in cash | `bank`, or cash | `bank` yes; a pure cash account is only `other`, which is blocked |

The complete set of account kinds:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.journal_lines'::regclass and conname='journal_lines_account_kind_chk';
-- CHECK (account_kind = ANY (ARRAY['customer_credit','bank','external_party','invoice_ar','clearing','other']))
```

`invoice_ar` is the **receivables** control (code `989`, migration 297). There is no payables
counterpart:

```sql
select account_kind, accounting_code from asan_control_accounts;
--  invoice_ar | 989
```

### 4b — Where payables actually live: **outside the ledger entirely**

`vw_supplier_payables` is a **view over `purchases`**, not over journal lines:

```sql
select pg_get_viewdef('public.vw_supplier_payables'::regclass, true);
-- SELECT src.supplier_id, s.name AS supplier_name, p.id AS purchase_id, p.purchase_date,
--        pt.days AS payment_term_days, … FROM purchases p JOIN suppliers s … payment_terms pt …
```

So what we owe a supplier is **derived from unpaid purchases and payment terms**, never posted as
a journal line. Combined with the round-2 finding that `payment_vouchers` posts no journal entry at
all, the picture is: **the payable side of the business is not in double-entry.**

A mutual settlement is by definition an entry that nets a receivable against a payable. With no
payable in the ledger, there is nothing to net against.

### 4c — What is missing, and the UI that would sit on top

**The missing piece is a payables representation in the ledger**, which needs three things before
any UI is worth drawing:

1. a new `account_kind` — e.g. `invoice_ap` (supplier payables control) — added to
   `journal_lines_account_kind_chk`;
2. its Asan `کد حساب`, supplied by the owner and stored in `asan_control_accounts` exactly as
   `invoice_ar`/`989` is (the table's CHECK currently admits only `invoice_ar`, `clearing`,
   `other`, so it would need widening too);
3. a posting path that writes payable lines — today nothing does, because purchases post no
   journal.

**Only then** does the UI make sense. Sketch, for when it does: a "تسویه متقابل" page that takes
one counterparty person, shows their receivable balance and their payable balance side by side,
lets the user choose an amount to net and a settlement channel for the remainder, previews the
resulting balanced entry line by line before posting, and posts it as a single journal entry.

**The important sequencing point:** this UI is worthless before the schema work, and the schema
work is meaningless without the owner's `invoice_ap` code. This is the one part of the plan that is
blocked on an owner answer rather than on engineering.

### 4d — Would a mutual settlement export correctly to Asan?

**Structurally yes; practically it would be blocked today.**

`asan_list_journal_export` classifies by line mix and would see an entry with `customer_credit` +
`invoice_ap` + `bank`. Provided every line resolves to a `کد حساب` and debits equal credits, it
exports as **one** accounting document with `شماره سند` from the 4.1 register — exactly the right
shape.

Two conditions must hold first:

1. **`invoice_ap` must resolve to a code.** Any kind with no row in `asan_control_accounts`
   resolves to NULL and blocks the whole document (round-2, Q5c). Until the owner supplies the
   code, every mutual settlement would be blocked and named.
2. **`doc_kind` would be `receipt`, `payment` or `unclassified` depending on the bank leg.** A
   settlement whose remainder is paid *out* nets the bank line negative — and per round-2 that is
   the `payment` bucket, which no current posting path can reach. A mutual settlement would be the
   **first** document ever to land there, so export 4 would go live untested. Worth knowing before
   it happens.

No special handling is needed beyond that; the shared row builder already covers the layout.

---

## Part 5: Phone-first person search

### 5a — Does the primitive exist? **Yes, and it is already proven in production paths.**

`public.person_find_by_identifiers(p_identifiers jsonb) RETURNS jsonb`, read live:

```sql
  FOR _e IN SELECT * FROM jsonb_array_elements(p_identifiers) LOOP
    _kind := _e->>'kind';
    _norm := public.normalize_identifier(_kind, _e->>'value_raw', false);
    SELECT pi.person_id INTO _hit FROM public.person_identifiers pi
     WHERE pi.kind = _kind AND pi.value_normalized = _norm AND pi.status <> 'revoked' LIMIT 1;
    …
  -- More than one distinct person referenced by a single input row.
  IF (SELECT count(DISTINCT h) FROM unnest(_all_hits) AS h) > 1 THEN
    RETURN jsonb_build_object('person_id', NULL, 'conflict', true, 'matched_on', _matched_on);
  END IF;
  RETURN jsonb_build_object('person_id', COALESCE(_strong_hit,_weak_hit), 'conflict', false,
                            'matched_on', _matched_on);
```

It normalizes before matching (so `+98912…` and `0912…` converge), ranks strong identifiers
(national id, tax id, IBAN) above weak ones (phone, email), and **reports a conflict rather than
guessing** when one input row points at two people. That is precisely the primitive the task asks
for in 5c — it already exists, and it is better than the minimal signature requested.

### 5b — Why isn't the creation path using it?

It is called by exactly two functions, both bulk-import paths:

```sql
select p.proname from pg_proc p … where pg_get_functiondef(p.oid) ilike '%person_find_by_identifiers%';
--  person_backfill_existing
--  person_import_batch
```

No application code calls it (`grep -rn "person_find_by_identifiers" src/ e2e/` matches only the
generated `types.ts:12050`). And `person_create_inline` — the RPC behind **SupplierForm,
CustomerForm, PersonModal, QuickAddCustomerDialog, SupplierReferralModal and external-parties** —
does not reference it at all (`grep -c` → 0).

**This is mission control §3's pattern for the fourth time in this program: the capability was
built, proven in one path, and never wired into the path users actually touch.**

**Exact integration point.** `person_create_inline` validates and then immediately creates. Read
live, the body begins:

```
  IF _uid IS NULL THEN RAISE EXCEPTION 'احراز هویت لازم است.' … END IF;
  IF p_context_kind IS NULL OR btrim(p_context_kind) = '' THEN
    RAISE EXCEPTION 'زمینهٔ ایجاد شخص الزامی است.' … END IF;

  _res := public.person_create_full( …          ← the call that mints a new person
```

The lookup belongs **between the second guard and `person_create_full`**: call
`person_find_by_identifiers(p_identifiers)`, and if it returns a `person_id`, attach the requested
role to that person instead of creating one — the function's existing "reuse" machinery already
handles this shape (`SELECT id INTO _legacy_id FROM public.suppliers WHERE person_id = _person_id;
IF _legacy_id IS NULL THEN INSERT …`, and it already returns `legacy_reused`).

### 5c — What is genuinely missing

Not the primitive — the **call**, plus a UI decision. Three things:

1. `person_create_inline` calls the finder first (server-side, so a direct PostgREST call gets the
   same behaviour — rule 2.5).
2. The forms need to handle `conflict: true` — today they would have no branch for it.
3. **A UX decision the owner must make:** when the phone matches an existing person, should the
   form (a) silently attach the new role and continue, (b) show "این شخص از قبل وجود دارد — نقش
   تأمین‌کننده به او اضافه شود؟" and require confirmation, or (c) refuse and send the user to the
   existing person? This is question 3 in the list below.

---

## Part 6: Ordered migration plan

Complexity is in the program's standard unit: **1 U = one migration + its phase test**.

| # | step | complexity | files touched | migration | breaking change | e2e impact | rollback |
|---|---|---:|---|---|---|---|---|
| **1** | Enforce one Asan code per person | **0.5 U** | none | 1 partial unique index | none — 0 current violations | add 1 assertion to an existing asan spec | drop the index |
| **2** | `person_create_inline` searches by phone first | **1.5 U** | `person_create_inline` (patch live def, rule 2.3); form error branches in `SupplierForm.tsx:112`, `CustomerForm.tsx:197`, `PersonModal.tsx:175`, `QuickAddCustomerDialog.tsx:109`, `SupplierReferralModal.tsx:67`, `_app.accounting.external-parties.tsx:257` | 1 | **yes** — creating with an existing phone now returns an existing person instead of erroring. Callers reading `legacy_reused` already exist | new spec; 3 specs mention `person_create_inline` | re-apply the previous definition from the pre-N snapshot |
| **3** | Context link `supplier` creates the `suppliers` mirror | **1 U** | none (trigger only) | 1 | **yes** — adding a supplier context now has a side effect; needs an `ended_at` rule | `e2e/persons/inline-supplier-create.spec.ts`, `supplier-form-person.spec.ts` | drop trigger |
| **4** | Merge the 8 duplicate rows | **1 U** | none | 1 data migration | **yes, irreversible in effect** — ids disappear | `merge-ui.spec.ts`, `merge-ui-guard.spec.ts` already cover `person_merge` | mirror backup first; `person_merge_log` records winner/loser |
| **5** | Expose the Asan code on the supplier form | **1 U** | `SupplierForm.tsx` (+ schema) | 0 or 1 (depends on the owner's storage answer) | none | new spec | revert the component |
| **6** | Repoint party pickers at the person model | **3–4 U** | **12 picker sites**, plus 20 list/detail sites | 0–1 (only if a FK is repointed) | **high** — `purchases.supplier_id` FK still demands a `suppliers.id` | 12 supplier specs + 22 customer specs | per-file revert; do it in slices |
| **7** | Add `invoice_ap` payables account kind | **1.5 U** | none | 1 (widen 2 CHECKs + seed the code) | none until something posts to it | new spec | narrow the CHECKs, delete the row |
| **8** | Post payables to the ledger | **2–3 U** | purchase posting path; `payment_vouchers` posting | 1–2 | **yes** — purchases begin generating journal entries | purchase specs; asan journal specs | large; snapshot required |
| **9** | Mutual-settlement UI | **2 U** | new route + component | 0 | none | new spec | delete the route |

**Total: roughly 14–16 U.** Steps 1–5 are **5 U** and deliver most of the owner's stated goal.

### 6d — Ordering constraints

**Hard dependencies (must precede):**

- **2 before 4.** Merging duplicates before the creation path stops minting them means the mess
  regrows immediately. Fix the tap before mopping.
- **3 before 6.** A picker reading persons-with-a-supplier-context will produce unselectable rows
  for any person whose mirror row is missing.
- **7 before 8 before 9.** No payables account → nothing to post → nothing to settle.
- **7 is blocked on the owner** supplying the `invoice_ap` Asan code, exactly as `invoice_ar` was.
- **4 before 6** is preferable — repointing pickers while duplicates exist means the dropdown shows
  «محمدزین الدین» three times.

**Parallelisable:**

- **1** is independent of everything and can land at any time.
- **5** depends only on the owner's storage decision (question 2), not on any other step.
- **7** can be prepared in parallel with 1–5 as soon as the code arrives; only 8 and 9 depend on it.
- The two tracks — **identity (1–6)** and **payables/settlement (7–9)** — are almost entirely
  independent and could run concurrently if the owner wants.

---

## Recommended execution order

*Order only. Which of these to authorise is the owner's decision; none is started.*

1. **Step 1** — one Asan code per person (0.5 U). Cheapest, zero risk, closes an invariant gap
   before any merging moves codes around.
2. **Step 2** — phone-first search in `person_create_inline` (1.5 U). **Highest value per unit in
   the whole plan:** the primitive already exists and is proven; this is a call site plus error
   branches. It stops the duplicate problem growing.
3. **Step 3** — the context→mirror trigger (1 U). Closes the round-2 symptom-2 defect and is a
   prerequisite for step 6.
4. **Step 4** — merge the 8 duplicates (1 U). Deliberately *after* 2 and 3 so the merged result is
   not re-polluted, and so `مختارشاهمرادی`'s code-and-transactions split is decided once.
5. **Step 5** — the Asan code field on the supplier form (1 U). Unblocks the biggest Asan coverage
   gap (0 of 15 suppliers have a code).

**Then stop and re-measure.** After these five the target architecture is functionally in place for
identity, and the export coverage numbers should be re-taken before committing to step 6, which is
the expensive one.

6. **Step 7** — `invoice_ap`, as soon as the owner supplies the code. Independent of the above.
7. **Steps 8, 9, 6** — the large ones, in whichever order the business needs first.

**Rationale:** the first five steps are 5 U for the majority of the benefit, carry no irreversible
schema change except a merge that `person_merge_log` records, and each is independently
revertible. Step 6 is 3–4 U touching 32 call sites with a live FK in the way, and step 8 changes
what posts to the ledger — neither should be started before the cheap wins are measured.

---

## UNKNOWN

1. **`docs/asan/dual-role-person-analysis.md` does not exist.** Its stated conclusions (50+
   dual-role people, mutual settlement common, phone is identity) are taken from the owner's task
   text, not verified. *Settled by:* the owner providing the file, or confirming those four facts
   are the whole of it.
2. **The 50+ dual-role people are not in the database** — only 2 exist, and as separate rows. Are
   the other ~48 not entered yet, entered under one role only, or tracked outside AfraKala?
   *Settled by:* the owner saying where they live today. This changes step 4 from "merge 8 rows"
   to "merge 8 rows and import ~48 people".
3. **Which id survives the `مختارشاهمرادی` merge** — the supplier side holds the 2 purchases, the
   customer side holds Asan code `601702`. *Settled by:* the owner choosing, or a rule ("the side
   with the Asan code always wins").
4. **The Asan `کد حساب` for supplier payables (`invoice_ap`).** Blocks steps 7–9 entirely.
   *Settled by:* the owner reading it off the Asan chart of accounts, as he did `989`.
5. **Whether `suppliers.is_active` and `persons.is_active` may ever disagree.** They agree on all
   15 rows today; if they can diverge, step 6's dropdown filter needs a rule. *Settled by:* the
   owner saying whether deactivating a supplier should deactivate the person.
6. **The UX on a phone match** (attach silently / confirm / redirect) — question 3 in Part 5c.
7. **Whether the three near-miss trigram pairs are duplicates** (`ملیکا`/`ملیکااااا…`,
   `ملیکاترابی`/`ملیکاااااترابییییی`, `روشناس`/`صباح روشناس`). They look like typos or test rows
   but two are staff profiles. *Settled by:* the owner glancing at the four names.
