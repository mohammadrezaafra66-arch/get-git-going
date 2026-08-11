# Diagnostic: supplier identity, Asan code field, and دوبل description column

**Read-only investigation.** No code, migration, row or configuration was changed. Every finding
below carries a live SQL result, a `file:line`, or a verbatim quote. Discovered against the live
LAN database `afrakala` as `supabase_admin` (rule 2.2), at HEAD `84e891db`.

Date: 2026-08-06.

---

## Executive summary

All three symptoms come from **one structural fact**: AfraKala has two supplier write paths, and
only one of them mints the legacy `suppliers` row that the rest of the application actually reads.
`/suppliers` creates through `person_create_inline`, which writes person + context link + a
`suppliers` mirror row in one transaction; `/persons` creates through `person_create_full`, which
writes the person **only**, and the "assign supplier group" control on the person edit page inserts
a bare `person_context_links` row with **no** mirror. There is **no trigger in either direction**,
so a person made a supplier the second way is invisible to every consumer that reads `suppliers` —
including the purchase form's dropdown.

Symptom 1 is a different shape of the same problem: `suppliers` is **the only party table in the
schema with no `accounting_code` column** (customers, external_parties, products and bank_accounts
all have one), and `person_create_inline` accepts a `p_accounting_code` argument but applies it
only on the customer and external-party branches — never the supplier branch. The Asan code for a
supplier is therefore only enterable as a `person_identifiers` row of kind `asan_person_code`, at
`/persons/$id/edit`, which is a page the supplier workflow never sends anyone to. Zero of the 15
suppliers have one.

Symptom 3 is **not** one defect but two, and they must not be conflated. The payer's name, the
tracking number and the invoice being settled all exist in `payment_receipts`, and the export
simply never joins that table — a mapping gap that is fixable in the export. But the specific دوبل
relationship the employee describes ("the money owed to B landed in C's account") is **not recorded
anywhere structurally**, which is a data-model gap that no export change can close.

---

## Part A: how many places is a "supplier" identity stored?

### A.1 — Every candidate place, enumerated from the catalogue

Discovered rather than assumed (rule 2.6):

```sql
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
from information_schema.columns
where table_schema='public'
  and (table_name ilike '%supplier%' or column_name ilike '%supplier%')
group by table_name order by table_name;
```
```
      table_name      | cols
----------------------+---------------------------------------------------------------
 payment_vouchers     | payee_supplier_id
 product_suppliers    | id, product_id, supplier_id, is_primary, notes, created_at,
                      | auto_added, supplier_person_id
 purchase_prices      | supplier_id, supplier_person_id
 purchases            | supplier_id, supplier_person_id
 suppliers            | id, name, phone, email, address, created_at, updated_at,
                      | contact_name, city, notes, trust_level, is_active, status,
                      | created_by, person_id
 vw_purchase_float    | supplier_id
 vw_supplier_payables | supplier_id, ...
```

Note `suppliers` has **no `accounting_code`** column — see Part B.

The second place is the persons model. `person_context_links.context_kind` is a CHECK-constrained
enum that includes `supplier`:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.person_context_links'::regclass and contype='c';
```
```
person_context_links_context_kind_check | CHECK ((context_kind = ANY (ARRAY['customer','supplier',
  'driver','sender','receiver','referrer','marketer','representative','complainant','returner',
  'staff_link','credit_party','accounting_party','delivery_party','purchase_owner','sales_expert',
  'warehouse_owner','other'])))
```

**So there are exactly two places that assert "this row represents a supplier":**

| # | place | mechanism |
|---|---|---|
| 1 | `public.suppliers` | a row exists (the legacy mirror table) |
| 2 | `public.person_context_links` | a row with `context_kind='supplier'` |

`person_identifiers` does **not** carry supplier-ness — it carries identifiers (including
`asan_person_code`), not roles. `customers` has no supplier flag. There is no group/tag table.

### A.2 — Counts and overlap

```sql
select 'suppliers (table)' as place, count(*)::text as rows from suppliers
union all select 'suppliers with person_id set',        count(*)::text from suppliers where person_id is not null
union all select 'suppliers with person_id NULL',       count(*)::text from suppliers where person_id is null
union all select 'person_context_links kind=supplier',  count(*)::text from person_context_links where context_kind='supplier'
union all select 'distinct persons in supplier context',count(distinct person_id)::text from person_context_links where context_kind='supplier';
```
```
                place                 | rows
--------------------------------------+------
 suppliers (table)                    | 15
 suppliers with person_id set         | 15
 suppliers with person_id NULL        | 0
 person_context_links kind=supplier   | 15
 distinct persons in supplier context | 15
```

Overlap:

```sql
with s as (select person_id from suppliers where person_id is not null),
     p as (select distinct person_id from person_context_links where context_kind='supplier')
select 'only in suppliers.person_id' as bucket, count(*)::text from (select person_id from s except select person_id from p) x
union all select 'only in person_context_links', count(*)::text from (select person_id from p except select person_id from s) y
union all select 'in BOTH', count(*)::text from (select person_id from s intersect select person_id from p) z;
```
```
            bucket            | count
------------------------------+-------
 only in suppliers.person_id  | 0
 only in person_context_links | 0
 in BOTH                      | 15
```

**There is zero drift today** — every one of the 15 suppliers exists in both places and they agree.
That is *not* evidence the model is sound; it is evidence that **every supplier so far was created
through the one path that writes both**. All 15 context links carry `ref_table='suppliers'` with a
non-null `ref_id`, which is the signature of the RPC path, not of a hand-added link:

```sql
select context_kind, ref_table, count(*), count(*) filter (where ref_id is null) as ref_id_null
  from person_context_links group by 1,2 order by 3 desc;
```
```
   context_kind   |    ref_table     | count | ref_id_null
------------------+------------------+-------+-------------
 staff_link       | profiles         |    41 |           0
 customer         | customers        |    22 |           0
 supplier         | suppliers        |    15 |           0
 accounting_party | external_parties |     1 |           0
```

### A.3 — What the purchase form's dropdown actually reads

`src/shared/components/PurchaseForm.tsx:170-183`:

```ts
const { data: suppliers = [], refetch: refetchSuppliers } = useQuery({
  queryKey: ["purchase-form-suppliers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(100);
```

**It reads the `suppliers` table directly** — not persons, not a view. A person with a supplier
context link but no `suppliers` row cannot appear, by construction.

Two further constraints worth recording: `.eq("is_active", true)` and `.limit(100)`.

### A.4 — What each create path writes

**Path A — `/suppliers` → «تأمین‌کننده جدید».** `src/shared/components/SupplierForm.tsx:112-126`:

> ```ts
> // Phase 6.1 — creation goes through person_create_inline so a supplier can
> // never exist without a person. The RPC writes person + identifiers +
> // suppliers row + context link in ONE transaction; a direct insert here
> // would recreate the person_id=NULL hole this phase exists to close.
> const { data, error } = await supabase.rpc("person_create_inline", {
>   p_display_name: payload.name,
>   p_context_kind: "supplier",
> ```

And the RPC's supplier branch, read live from `pg_get_functiondef`:

```
48:  IF p_context_kind = 'supplier' THEN
49:    _legacy_table := 'suppliers';
50:    SELECT id INTO _legacy_id FROM public.suppliers WHERE person_id = _person_id;
52:    IF _legacy_id IS NULL THEN
53:      INSERT INTO public.suppliers (
68:      RETURNING id INTO _legacy_id;
```

→ writes `persons` + `person_identifiers` + **`suppliers`** + `person_context_links`. Appears in the
dropdown.

**Path B — `/persons/create`.** `src/routes/_app.persons_.create.tsx:47` calls the server function
`createPerson`, which delegates to a **different** RPC — `src/lib/persons/functions.ts:265`:

```ts
const { data: rpcRes, error: rpcErr } = await supabase.rpc("person_create_full", {
```

`person_create_full` creates the person and its identifiers only. It takes no context kind and
writes no mirror row.

**Path B continued — "assign the supplier group"** on `/persons/$personId/edit`
(`src/routes/_app.persons_.$personId_.edit.tsx:226` renders `<PersonContextLinksForm …/>`), which
calls `addPersonContextLink` — `src/lib/persons/context-links.functions.ts:97-101`:

```ts
const { data: row, error } = await supabase
  .from("person_context_links")
  .insert(payload)
```

A plain INSERT, with `ref_table`/`ref_id` optional (`payload` defaults them to `null`).

**And there is no trigger to bridge them.** Checked all three tables:

```sql
select tgname from pg_trigger where tgrelid='public.suppliers'::regclass and not tgisinternal;
-- suppliers_audit_insert, suppliers_audit_update, suppliers_set_updated_at,
-- suppliers_updated_at, trg_normalize_phone

select tgname from pg_trigger where tgrelid='public.person_context_links'::regclass and not tgisinternal;
-- trg_pcl_audit_insert, trg_pcl_audit_update, trg_pcl_set_updated_at
```

Audit and timestamp triggers only. **Nothing creates a `suppliers` row when a supplier context link
is inserted.**

### A.5 — Symptom 2 confirmed, with the employee's own test row

The two paths write to different tables, so the symptom is fully explained. The live database also
still holds what looks like the employee's test person:

```sql
select p.id, p.display_name, p.created_at,
       (select count(*) from person_context_links l where l.person_id=p.id) as ctx_links,
       (select count(*) from suppliers s where s.person_id=p.id) as supplier_rows
  from persons p order by p.created_at desc limit 3;
```
```
                  id                  | display_name |          created_at           | ctx_links | supplier_rows
--------------------------------------+--------------+-------------------------------+-----------+---------------
 14bb7791-a338-4cf3-8d5e-d7f7c369c4a4 | روشناس       | 2026-08-06 09:32:59.833335+00 |         0 |             0
 271d7c44-c89f-44db-9b91-99474cdf0a2c | محمدزین الدین| 2026-08-05 11:22:50.815664+00 |         1 |             0
```

`روشناس`, created today, has **no context link and no suppliers row**. It is a person and nothing
else — invisible to the dropdown, exactly as reported.

⚠️ **One honest qualification.** Because `ctx_links = 0`, this person never received a supplier
context link at all. So on *this* database I can prove the `/persons` path leaves no `suppliers`
row, and I can prove from the code that adding a context link would not create one either — but I
have **not** observed a person that has a supplier link and no mirror row, because none exists yet.
The code path is unambiguous; the live example is one step short of complete.

---

## Part B: the Asan code field — built where, exposed where?

### B.6 — Where an Asan/accounting code can live

```sql
select table_name, column_name from information_schema.columns
 where table_schema='public' and column_name ilike '%accounting_code%' order by 1;
```
```
 asan_control_accounts | accounting_code
 bank_accounts         | accounting_code
 customers             | accounting_code
 external_parties      | accounting_code
 journal_entries       | receiver_accounting_code, payer_accounting_code
 payment_receipts      | beneficiary_accounting_code, payer_accounting_code, receiver_accounting_code
 products              | accounting_code
 waybills              | customer_accounting_code
```
```sql
select count(*) from information_schema.columns
 where table_schema='public' and table_name='suppliers' and column_name='accounting_code';
-- 0
```

**`suppliers` is the only party table in the schema without an `accounting_code` column.**
Customers have one, external parties have one, products have one, bank accounts have one.

The employee's premise is therefore slightly off in a way that matters: **migration 283 did not add
an Asan-code column to suppliers.** It added `products.accounting_code`, the
`person_identifiers` kind `asan_person_code`, and a uniqueness index on `bank_accounts`. For a
supplier, the only place an Asan code can live is a `person_identifiers` row:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid='public.person_identifiers'::regclass and conname='person_identifiers_kind_check';
-- CHECK (kind = ANY (ARRAY['mobile_e164','landline','national_id_ir','tax_id_ir',
--   'company_reg_id_ir','email','iban','custom','asan_person_code']))
```

**How many of the 15 suppliers have one today: zero.**

```sql
select s.name, (select pi.value_normalized from person_identifiers pi
                 where pi.person_id=s.person_id and pi.kind='asan_person_code' limit 1) as asan_code
  from suppliers s order by s.created_at;
```
All 15 rows return `asan_code` empty. (11 `asan_person_code` rows exist in total; every one belongs
to a customer, not a supplier.)

### B.7 — What each form actually displays

**`SupplierForm`** — `src/shared/components/SupplierForm.tsx:26-40` (schema) and the rendered
labels at lines 160-242:

| field | line |
|---|---|
| `name` | 160 |
| `contact_name` | 172 |
| `phone` | 176 |
| `city` | 188 |
| `notes` | 240 |
| `trust_level` | schema:36 |
| `status` | schema:37 |

**There is no Asan-code field.** Symptom 1 confirmed.

**`CustomerForm`, by contrast, has one** — `src/shared/components/CustomerForm.tsx:42-48`:

```ts
accounting_code: z
  … "کد حسابداری فقط شامل حروف انگلیسی، اعداد، _ و - و حداکثر ۳۰ کاراکتر",
```
with a duplicate check at lines 135-168.

**`PersonIdentifiersForm` does expose it** — `src/components/persons/PersonIdentifiersForm.tsx:48`:

```ts
asan_person_code: "کد حساب آسان",
```

rendered on `/persons/$personId/edit` (`src/routes/_app.persons_.$personId_.edit.tsx:206`).

**And the RPC already accepts a code but ignores it for suppliers.**
`person_create_inline(…, p_accounting_code text DEFAULT NULL, …)` applies it on exactly two
branches:

```
79:        name, phone, accounting_code, city, notes, person_id,      -- customers branch
85:        NULLIF(btrim(COALESCE(p_accounting_code, '')), ''),
115:      full_name, national_id, phone, accounting_code, notes, person_id   -- external_parties
122:        NULLIF(btrim(COALESCE(p_accounting_code, '')), ''),
```

The supplier branch (lines 48-68) never references `p_accounting_code` — and could not, because
the column does not exist.

### B.8 — Is this "built but not wired"?

**Partly, and the distinction matters.**

- For **products** it was exactly the classic §3 pattern, and O2 fixed it: the column existed from
  283 and no form exposed it.
- For **suppliers** it is *not* the same thing. The storage location (`person_identifiers` kind
  `asan_person_code`) exists and **is** exposed by a form — just not by the supplier form. So the
  capability is built and wired, but wired to a page the supplier workflow never routes to. Calling
  it "not wired" would understate it: a user following the supplier journey has no path to the
  field at all, and no indication one exists elsewhere.

---

## Part C: the شرح column in the accounting-document export

### C.9 — What the live function puts in column C

⚠️ Migration 294 is **not** the live definition — migration **297** (phase O4) replaced
`asan_list_journal_export` to resolve `invoice_ar` to `989`. Read live per rule 2.6. The `شرح`
expression, at line 117 of `pg_get_functiondef`:

```sql
COALESCE(NULLIF(btrim(l.ldesc), ''), NULLIF(btrim(e.edesc), ''), ''),
```

where `l.ldesc` is `journal_lines.description` (line 30) and `e.edesc` is
`journal_entries.description` (line 21).

**So column C is: the line's own description, falling back to the entry's description, falling back
to an empty string.** Nothing else reaches that cell.

### C.10 — What actually appears, for the one real posted entry

There is exactly one posted journal entry on this database:

```sql
select je.id, je.source_type, je.description as entry_desc,
       je.payer_accounting_code, je.receiver_accounting_code from journal_entries je;
```
```
 6d6b1896-… | payment_receipt | ?????? ?????? ???????????? ?????????? 123456 | 002 | cust-123
```

Its entry description is the **bucket-C corrupted row** M1.1 deliberately left alone — which is
precisely why the line-first ordering in the COALESCE matters.

```sql
select jl.line_no, jl.account_kind, jl.description as line_desc, jl.debit, jl.credit
  from journal_lines jl order by jl.line_no;
```
```
 1 | bank            | واریز به حساب بانکی شرکت      | 10100000000.00 |              0
 2 | customer_credit | افزایش اعتبار/کاهش بدهی مشتری |              0 | 10100000000.00
```

Those two strings are **hard-coded literals in the posting function**, not data:

```
supabase/migrations/20260505113335_…sql:203:  v_debit_desc := 'واریز به حساب بانکی شرکت';
supabase/migrations/20260505113335_…sql:225:  (v_journal_id, 2, 'customer', v_receipt.customer_id, 0,
                                               v_receipt.amount, 'افزایش اعتبار/کاهش بدهی مشتری');
```

They describe the **accounting effect**, not the transaction. Neither names who paid, nor what it
was for.

**Meanwhile, the source data has all of it.** Following `journal_entries.source_id` to the receipt:

```sql
select pr.payer_name, pr.payer_phone, pr.receiver_name, pr.tracking_number,
       pr.description as receipt_description, pr.receipt_type, pr.amount, pr.status,
       (select string_agg(coalesce(q.quote_number,'?'), ', ')
          from payment_receipt_links l left join sales_quotes q on q.id=l.quote_id
         where l.receipt_id=pr.id) as settles_quotes
  from payment_receipts pr
 where pr.id = (select source_id from journal_entries where id='6d6b1896-…');
```
```
payer_name        | ملیکا
payer_phone       | 09105282379
receiver_name     | test 1
tracking_number   | 123456
receipt_description|
receipt_type      | invoice_payment
amount            | 10100000000.00
status            | approved
settles_quotes    | SQ-2026-000003
```

**And the export never joins that table:**

```sql
select pg_get_functiondef(p.oid) ilike '%payment_receipt%' from pg_proc p …
 where p.proname='asan_list_journal_export';
-- false
```

| what the employee wants on the line | is it in the source? | does it reach `شرح`? |
|---|---|---|
| who paid | **yes** — `payer_name` = ملیکا | **no** |
| reference / tracking | **yes** — `123456` | **no** |
| what it was for | **yes** — settles `SQ-2026-000003` | **no** |
| the counterparty on this line | **yes** — resolvable from `account_ref_id` | **no** (only the account *code* reaches column A) |
| the accounting effect | yes — the hard-coded literal | **yes, and it is all that appears** |

### C.11 — Mapping gap or data-model gap?

**Both, and they must be separated.**

**(a) A mapping gap — fixable entirely inside the export.** Payer name, tracking number, the settled
invoice number, and the per-line counterparty name are all present in
`payment_receipts` / `payment_receipt_links` / the account tables. The export declines to reach for
them. Nothing about the data model prevents a richer `شرح`.

**(b) A data-model gap — not fixable in the export.** For a true دوبل — the owner's own example,
"I took money from Khan-Mohammadi and paid Shahmoradi, but it landed in Sahar Shahmoradi's account"
— the model records *that* an `external_party` is on the entry, but **not the relationship** "the
debt owed to B was settled into C's account". That is already recorded under `## MODEL GAPS` in
`docs/asan/UNVERIFIED-LAYOUTS.md`; this investigation confirms it is still true and is what would
block a fully self-describing دوبل line.

⚠️ **Important scope note.** There are **zero** real دوبل documents on this database:

```sql
select count(distinct jl.journal_entry_id) from journal_lines jl where jl.account_kind='external_party';
-- 0
select count(*) from journal_entries;
-- 1
```

So symptom 3 was observed on a **receipt/payment** document, not on an actual دوبل, or was reasoned
about in the abstract. The `شرح` weakness is real and reproducible on the receipt above; the دوبل
specifics below are necessarily analytical rather than observed.

**Reconstruction — what a دوبل line *should* say vs what it *would* say today:**

| line | should read (approximately) | would read today |
|---|---|---|
| bank / external party | «واریز ۱۰٬۱۰۰٬۰۰۰ از خان‌محمدی به حساب سحر شهمرادی — پیگیری ۱۲۳۴۵۶» | «واریز به حساب بانکی شرکت» |
| counterparty | «بابت بدهی به مختار شهمرادی — فاکتور SQ-…» | «افزایش اعتبار/کاهش بدهی مشتری» |

The first line is achievable today from existing data. The second's "بابت بدهی به مختار شهمرادی"
is the part the model cannot supply.

---

## Part D: the purchase form and the no-supplier purchases

### D.12 — How a purchase is allowed to have no supplier

```sql
select column_name, is_nullable, column_default from information_schema.columns
 where table_schema='public' and table_name='purchases' and column_name in ('supplier_id','supplier_person_id');
```
```
    column_name     | is_nullable | column_default
--------------------+-------------+----------------
 supplier_id        | YES         |
 supplier_person_id | YES         |
```

**Nullable, no default, no "unknown supplier" sentinel.** Two foreign keys exist on the supplier
columns, but a FK does not constrain NULL.

The form agrees, deliberately — `src/shared/components/PurchaseForm.tsx:61` and `:89`:

```ts
supplier_id: z.string().nullable(),
…
supplier_id: null,          // default value
```

**This is by design, not a bug.** Supplier is an optional field on the purchase form, initialised to
null.

### D.13 — Which identity path created the purchases that DO have a supplier

Current counts (higher than the final report's, because two more full e2e runs have since added
test rows — see the caveat below):

```sql
select 'purchases total' k, count(*)::text v from purchases
union all select 'supplier_id NOT NULL', count(*)::text from purchases where supplier_id is not null
union all select 'supplier_id NULL', count(*)::text from purchases where supplier_id is null
union all select 'supplier_person_id NOT NULL', count(*)::text from purchases where supplier_person_id is not null;
```
```
 purchases total             | 334
 supplier_id NOT NULL        |  11
 supplier_id NULL            | 323
 supplier_person_id NOT NULL |  11
```

Every purchase that has a supplier:

```sql
select pu.purchase_date, s.name as supplier, s.created_at::date as supplier_created,
       (select count(*) from person_context_links l
         where l.person_id=s.person_id and l.context_kind='supplier') as via_person_path
  from purchases pu join suppliers s on s.id=pu.supplier_id order by pu.created_at;
```
```
 2026-07-13 | محمدرضا افرا       | 2026-05-06 | 1
 2026-07-26 | صباح روشناس        | 2026-05-20 | 1
 2026-07-26 | صباح روشناس        | 2026-05-20 | 1
 2026-07-28 | مختارشاهمرادی      | 2026-05-06 | 1
 2026-07-28 | مختارشاهمرادی      | 2026-05-06 | 1
 2026-07-28 | صباح روشناس        | 2026-05-20 | 1
 2026-08-02 | صباح روشناس        | 2026-05-20 | 1
 2026-08-02 | احسان بختیاری      | 2026-06-02 | 1
 2026-08-05 | 12                 | 2026-05-18 | 1
 2026-08-05 | Farshid Soofizadeh | 2026-05-17 | 1
 2026-08-06 | احسان بختیاری      | 2026-06-02 | 1
```

**All 11 use suppliers that exist as `suppliers` rows** (they must — the FK and the dropdown both
demand it), every one carrying `ref_table='suppliers'` on its context link, i.e. created by the
`person_create_inline` path. **The `/suppliers` path is the de facto standard**, and the `/persons`
path has never successfully produced a purchasable supplier.

Note that `supplier_person_id` is populated on exactly the same 11 rows, so the purchase already
carries the person id alongside the legacy id — useful for any future unification.

⚠️ **Caveat on the totals.** The e2e suite creates purchases and does not clean them up. By day:

```sql
select created_at::date as day, count(*) as purchases, count(supplier_id) as with_supplier
  from purchases group by 1 order by 1;
```
```
 2026-07-13 |   1 | 1      2026-08-03 |  85 | 0
 2026-07-26 |   2 | 2      2026-08-04 |  84 | 0
 2026-07-28 |   3 | 3      2026-08-05 |   2 | 2
 2026-08-02 | 156 | 2      2026-08-06 |   1 | 1
```

The 08-02/03/04 clusters are overwhelmingly test residue. **The "281 of 289" figure from the final
report should be read as "the overwhelming majority of real purchases have no supplier", not as a
number that is still exact today.** I did not delete the residue (read-only investigation, and it
cascades into stock movements).

---

## Root cause hypothesis

**Symptom 1 (no Asan field on the supplier form).** `suppliers` is the only party table with no
`accounting_code` column, and the supplier's Asan code therefore lives only as a
`person_identifiers` row of kind `asan_person_code`. That storage is exposed by
`PersonIdentifiersForm` on the person edit page — a page the supplier workflow never links to — so
from inside the supplier journey the field simply does not exist. `person_create_inline` already
takes a `p_accounting_code` argument and applies it for customers and external parties, but the
supplier branch cannot use it because the column is missing. Root cause: **the supplier was left
out when the party tables were given accounting codes, and the persons-side substitute was never
surfaced in the supplier UI.**

**Symptom 2 (persons-path supplier missing from the dropdown).** Two write paths with different
reach: `/suppliers` → `person_create_inline` → person + context link + **suppliers mirror row**;
`/persons` → `person_create_full` → person only, with the group assignment being a bare INSERT into
`person_context_links`. No trigger bridges them in either direction, and every consumer — the
purchase dropdown at `PurchaseForm.tsx:174` above all — reads the mirror table. Root cause: **the
legacy mirror table is still the real source of truth for consumers, while the persons model is
presented to users as if it were.**

**Symptom 3 (thin `شرح`).** Column C is `line.description → entry.description → ''` and nothing
more; the line descriptions are hard-coded accounting-effect literals written by the posting
function in 2026-05, and the export never joins `payment_receipts`, where the payer, the tracking
number and the settled invoice all live. Root cause: **an export mapping that reads only the
journal tables, over a posting function that writes generic descriptions** — plus, for the دوبل
case specifically, a genuine model gap in which the "owed to B, paid into C's account" relationship
is not recorded at all.

---

## Questions for the owner before any fix can be built

1. **Which is the source of truth for a supplier — `persons` or `suppliers`?** Every downstream
   consumer currently reads `suppliers`. Do you want (a) `suppliers` to remain the mirror and be
   auto-maintained from the persons side, (b) consumers migrated to read persons, or (c) the
   `/persons` path to stop offering a "supplier" group at all so there is one door?
2. **Should assigning the `supplier` context on `/persons/$id/edit` create a `suppliers` row?** If
   yes, it also needs a rule for what to do when the link is *ended* (`ended_at` set) — deactivate
   the supplier, or leave it?
3. **Where should a supplier's Asan code live** — a new `suppliers.accounting_code` column
   (symmetric with customers and external parties), or `person_identifiers` only (symmetric with
   the identity model M3.1 established)? These pull in opposite directions and I should not pick.
4. **If it lives in `person_identifiers`, should the supplier form write it there directly?** That
   would mean the supplier form writing to the persons model, which is a coupling you may not want.
5. **Should the 15 existing suppliers get Asan codes by hand, by importer, or both?** The owner
   answers file already grants both for products; suppliers were not mentioned.
6. **How much should `شرح` say, and in what order?** For example
   «دریافت از {payer} بابت {invoice} — پیگیری {tracking}». Asan may have a length limit on that
   column that I have not verified — see UNKNOWN.
7. **Should `شرح` be built in the export, or should the posting function write richer line
   descriptions at posting time?** The first changes only Asan output; the second improves the
   AfraKala ledger too but rewrites a function that has posted live entries.
8. **For دوبل, do you want to record the "paid on behalf of" relationship structurally?** That is a
   schema change (a reference on the journal line, or on the receipt). Without it, the دوبل line
   can never state who the debt was really owed to.
9. **Should `supplier_id` become required on the purchase form?** It is nullable today by design.
   Making it required would block the workflow the 323 supplier-less purchases came from, so this
   is a business decision, not a technical one.
10. **Is the employee's `روشناس` person (`14bb7791…`) real data to keep, or a test row to remove?**
    It currently has no context link and no supplier row.

---

## Options for the fix, with tradeoffs

*Not recommendations — the choice is yours.*

### Symptom 1 — the Asan code field on suppliers

| # | approach | tradeoffs |
|---|---|---|
| 1 | Add `suppliers.accounting_code` (+ partial unique index), expose it in `SupplierForm`, and pass `p_accounting_code` through the RPC's supplier branch | Symmetric with customers/external_parties; smallest UI change. **But** creates a *third* place an Asan code can live for a person, and the export reads `person_identifiers` — so it needs a sync rule or the export must be changed too |
| 2 | Leave storage in `person_identifiers`; add an Asan-code input to `SupplierForm` that writes an identifier on the person behind the supplier | One storage location, consistent with M3.1 and with what the export already reads. **But** the supplier form starts writing to the persons model, and editing an existing supplier currently does a plain UPDATE on `suppliers` — it would need the person id |
| 3 | Add no field; instead put a clear link on the supplier page to `/persons/$id/edit#identifiers` | Cheapest, no schema change, no new source of truth. **But** it is two pages for one task, and discoverability was the original complaint |

### Symptom 2 — the two supplier paths

| # | approach | tradeoffs |
|---|---|---|
| 1 | Trigger on `person_context_links`: inserting a `supplier` link with no `ref_id` creates the `suppliers` row and back-fills `ref_table`/`ref_id` | Closes the hole wherever it is opened, including direct PostgREST calls (rule 2.5). **But** it makes a mirror row appear as a side effect of a link, and needs a decision for `ended_at` |
| 2 | Change `/persons`' group control to call `person_create_inline`-style logic (a new RPC, e.g. `person_attach_context`) that writes the mirror transactionally | Keeps the rule in one auditable place and mirrors the existing design. **But** a direct API insert into `person_context_links` still bypasses it |
| 3 | Point every consumer at persons (a view `v_suppliers` over persons + context links) and retire the mirror | Removes the duplication permanently — the only option that actually ends the parallel model. **But** it is the largest change: `purchases`, `product_suppliers`, `purchase_prices`, `payment_vouchers` and `vw_supplier_payables` all carry `supplier_id` FKs |
| 4 | Remove `supplier` from the `/persons` group UI so `/suppliers` is the only door | Smallest possible change, immediately removes the confusion. **But** it entrenches the legacy mirror and contradicts the direction Phase 2 was heading |

### Symptom 3 — the `شرح` column

| # | approach | tradeoffs |
|---|---|---|
| 1 | Enrich in the export only: join `payment_receipts`/`payment_receipt_links` in `asan_list_journal_export` and compose `شرح` from payer + purpose + tracking, falling back to the line description | No change to posted data; reversible; affects only the Asan file. **But** it duplicates description logic in the export, and only helps documents that came from a receipt (`source_type='payment_receipt'`) |
| 2 | Enrich at posting time: rewrite the posting function to write descriptive line text | Improves the AfraKala ledger and every downstream consumer, not just Asan. **But** it rewrites a function that has already posted live entries (rule 2.3 applies), and does nothing for the entry already posted unless backfilled |
| 3 | Add a per-line reference (e.g. `journal_lines.counterparty_person_id` / a "on behalf of" column) and compose `شرح` from structured fields | The only option that also closes the دوبل model gap and makes the line self-describing without string parsing. **But** it is a schema change plus a posting change plus an export change — the largest of the three |

---

## UNKNOWN

1. **Whether Asan imposes a length or character limit on `شرح`.** `docs/asan/asan-layouts.md`
   records the column as free text with no limit stated. A composed description could be long.
   *Settled by:* the owner checking the Asan import dialog, or one trial import.
2. **Whether the `/persons` supplier-group path has ever actually been completed by a user.** No
   person on this database has a supplier context link without a mirror row, so the failure mode is
   proven from code but not observed in data. *Settled by:* the employee adding a supplier context
   link to `روشناس` on `/persons/$id/edit` and re-checking the dropdown — a one-minute manual test I
   did not perform because this investigation is read-only.
3. **What the employee actually saw for symptom 3.** There are zero دوبل entries on this database,
   so the thin `شرح` was necessarily observed on a receipt/payment document. *Settled by:* the
   employee naming the document, or exporting one and sending the file.
4. **Whether `suppliers.status` / `is_active` interacts with the dropdown for persons-path
   suppliers.** The dropdown filters `is_active = true`; the RPC's supplier branch sets a status I
   did not trace in full. *Settled by:* reading lines 53-68 of `person_create_inline` against a
   newly created supplier.
5. **The true count of non-test purchases today.** The e2e residue is not reliably distinguishable
   by `notes` alone. *Settled by:* a cleanup decision from the owner, after which the count is
   exact.
