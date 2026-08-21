# Sub-agent E — Asan export: the SQL side

**Mission:** resolve everything on the DATABASE side that the Asan Excel export depends on, so
the receipt-creation rebuild knows which `payment_receipts` columns are load-bearing even though
they never reach `journal_entries`.

**Method (all read-only).** Four SQL files written with the Write tool, `docker cp`'d into
`afrakala-lan-db`, executed with `psql -U supabase_admin -d afrakala -f`, output redirected with
`\o` to a file inside the container and copied back. Nothing was piped through PowerShell.
**No `asan_*` function was executed.** Everything below is read from the live catalog
(`pg_proc` / `pg_get_functiondef`, `pg_class`, `pg_trigger`, `pg_policies`,
`information_schema.routine_privileges`) plus plain `SELECT`s on base tables.
`supabase/schema_full_export.sql` was not consulted.

---

## E1. Every database object whose name or body mentions the export

### E1a — Functions (`pg_proc`, `prokind IN ('f','p')`, schema `public`)

Search: `proname ~* 'asan|export' OR pg_get_functiondef(oid) ~* 'asan'` → **26 rows**.

| name | identity args | deflen | secdef | matched via |
|---|---|---:|---|---|
| `asan_assign_document_number` | `_doc_type text, _source_id uuid` | 1959 | t | name |
| `asan_assign_document_numbers` | `_doc_type text, _ids uuid[]` | 978 | t | name |
| `asan_burn_document_number` | `_doc_type text, _source_id uuid, _reason text` | 428 | t | name |
| `asan_classify_person_batch` | `p_batch_id uuid` | 4532 | t | name |
| `asan_classify_product_batch` | `p_batch_id uuid` | 4517 | t | name |
| `asan_commit_person_batch` | `p_batch_id uuid` | 5317 | t | name |
| `asan_commit_product_batch` | `p_batch_id uuid` | 2914 | t | name |
| `asan_fold_chars` | `p text` | 643 | f | name |
| **`asan_list_bank_deposit_export`** | **`_from date, _to date`** | **2613** | **t** | name |
| **`asan_list_journal_export`** | **`_from date, _to date, _filter text`** | **10262** | **t** | name |
| **`asan_list_purchase_export`** | **`_from date, _to date`** | **3982** | **t** | name |
| **`asan_list_sales_export`** | **`_from date, _to date`** | **5026** | **t** | name |
| `asan_normalize_code` | `p text` | 227 | f | name |
| `asan_normalize_name` | `p text` | 601 | f | name |
| `export_dynamic_table_rows` | `p_table_id uuid, p_filters jsonb, p_search text, p_show_inactive boolean, p_limit integer` | 8143 | t | name contains "export" |
| `normalize_identifier` | `_kind text, _raw text, _strict boolean` | 6828 | f | body |
| `person_merge` | `p_winner_id uuid, p_loser_id uuid, p_reason text` | 16954 | f | body |
| `products_normalize_accounting_code` | — | 259 | f | body |
| `search_visible_persons` | (7 args) | 11612 | f | body |
| `tg_asan_burn_journal_entry_number` | — | 300 | t | name |
| `tg_asan_burn_purchase_number` | — | 288 | t | name |
| `tg_asan_burn_sales_quote_number` | — | 678 | t | name |
| `tg_asan_person_row_guard` | — | 371 | f | name |
| `tg_asan_product_row_guard` | — | 414 | f | name |
| `trg_mirror_pull_asan_code` | — | 1050 | t | name |
| `trg_person_identifiers_propagate_asan_code` | — | 2209 | t | name |

`export_dynamic_table_rows` was checked explicitly (E5c): `pg_get_functiondef(oid) ~* 'payment_receipts'`
is **false** and `~* 'asan'` is **false**. It is the generic dynamic-tables exporter and is **not**
part of the Asan pipeline. (`dynamic_tables` holds 4 rows; whether any is bound to receipts is a
`src/`-side question, out of my scope — marked UNCERTAIN.)

### E1b / E1c — Views and materialised views

```
=== E1b VIEWS ===    (0 rows)
=== E1c MATVIEWS === (0 rows)
```

Search across **all** non-system schemas (E1i) for `relkind IN ('v','m')` and
`relname ~* 'asan|export'` also returned **0 rows**.

> **There is no export view and no materialised view anywhere in the database.
> Every Asan export object is a `SECURITY DEFINER` `plpgsql` function.**

### E1d — Tables named `~* 'asan|export'` (5)

`asan_control_accounts`, `asan_export_numbers`, `asan_import_batches`,
`asan_import_person_rows`, `asan_import_product_rows`.

### E1f — Triggers whose name or function mentions asan/export (8)

| trigger | on table | function |
|---|---|---|
| `trg_asan_person_row_guard` | `asan_import_person_rows` | `tg_asan_person_row_guard` |
| `trg_asan_product_row_guard` | `asan_import_product_rows` | `tg_asan_product_row_guard` |
| `trg_customers_pull_asan_code` | `customers` | `trg_mirror_pull_asan_code` |
| `trg_asan_burn_journal_entry_number` | `journal_entries` | `tg_asan_burn_journal_entry_number` |
| `trg_person_identifiers_propagate_asan_code` | `person_identifiers` | `trg_person_identifiers_propagate_asan_code` |
| `trg_asan_burn_purchase_number` | `purchases` | `tg_asan_burn_purchase_number` |
| `trg_asan_burn_sales_quote_number` | `sales_quotes` | `tg_asan_burn_sales_quote_number` |
| `trg_suppliers_pull_asan_code` | `suppliers` | `trg_mirror_pull_asan_code` |

**`payment_receipts` has NO asan/export trigger.** There is no burn trigger for receipts, because
receipts are not themselves an Asan-numbered document type — only
`sales_invoice`, `purchase_invoice`, `accounting_document` are (see `asan_assign_document_number`).

### E1g — Columns named `~* 'asan|export'`

`asan_export_numbers.asan_number` (integer), `asan_import_person_rows.asan_code` (text),
`asan_import_product_rows.asan_code` (text), `role_permissions.can_export` (boolean).

---

## E2. Full definitions

Full bodies were dumped to file and read. The four export functions are quoted where relevant in
E3/E5/E6. The four **export** functions and their exact signatures:

```
public.asan_list_bank_deposit_export(_from date, _to date)
public.asan_list_journal_export(_from date, _to date, _filter text)
public.asan_list_purchase_export(_from date, _to date)
public.asan_list_sales_export(_from date, _to date)
```

All four are `LANGUAGE plpgsql`, `STABLE SECURITY DEFINER`, `SET search_path TO 'public'`,
begin with `#variable_conflict use_column`, and open with the same two guards
(role check → `42501`, date-range check → `22023`).

Supporting numbering objects (full bodies read):

- `asan_assign_document_number(_doc_type, _source_id)` — idempotent per `(doc_type, source_id)`;
  `pg_advisory_xact_lock(hashtext('asan_export_numbers:'||_doc_type))`; `MAX(asan_number)+1`;
  role gate `admin|accountant`. Valid `_doc_type` values: `sales_invoice`, `purchase_invoice`,
  `accounting_document` — **no receipt type**.
- `asan_assign_document_numbers(_doc_type, _ids uuid[])` — ordered loop over the singular form.
- `asan_burn_document_number(_doc_type, _source_id, _reason)` — sets `burned_at` / `burned_reason`.
- `asan_fold_chars` / `asan_normalize_code` / `asan_normalize_name` — text folding (Arabic→Persian
  yeh/kaf, Arabic-Indic + Persian digits → ASCII). `IMMUTABLE PARALLEL SAFE`, no role gate.
  **These are used by the person/product IMPORT path, not by the four export functions**
  (no `asan_normalize_*` call appears in any `asan_list_*` body).

---

## E3. `asan_list_bank_deposit_export` — resolved

**Kind: FUNCTION** (not a view, not a matview). `plpgsql`, `STABLE SECURITY DEFINER`,
`SET search_path TO 'public'`, owner `supabase_admin`.

**Return type (10 columns):**

```
RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text,
              person_code text, tracking_number text, amount numeric,
              bank_code text, bank_title text, blocked_reason text)
```

**Full body:**

```sql
CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text, person_code text, tracking_number text, amount numeric, bank_code text, bank_title text, blocked_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT pr.id,
           pr.payment_date AS pdate,
           COALESCE(NULLIF(btrim(pr.payer_name), ''), '') AS pname,
           NULLIF(btrim(pr.tracking_number), '') AS tracking,
           pr.amount AS amt,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = COALESCE(
                     pr.customer_person_id,
                     (SELECT c.person_id FROM public.customers c WHERE c.id = pr.customer_id))
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode,
           (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS bcode,
           (SELECT ba.title FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS btitle
      FROM public.payment_receipts pr
     WHERE pr.status = 'approved'
       AND pr.destination_bank_account_id IS NOT NULL
       AND pr.payment_date BETWEEN _from AND _to
  )
  SELECT r.id,
         'واریز ' || to_char(r.pdate, 'YYYY-MM-DD') || ' — ' ||
           COALESCE(NULLIF(r.pname, ''), left(r.id::text, 8)),
         r.pdate,
         r.pname,
         r.pcode,
         r.tracking,
         r.amt,
         r.bcode,
         r.btitle,
         CASE
           WHEN r.pcode IS NULL OR btrim(r.pcode) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(r.pname, ''), '؟') || '» ثبت نشده است'
           WHEN r.bcode IS NULL
             THEN 'کد آسان حساب بانکی مقصد ثبت نشده است'
           WHEN r.amt IS NULL OR r.amt <= 0
             THEN 'مبلغ این واریز معتبر نیست'
           WHEN r.amt <> trunc(r.amt)
             THEN 'مبلغ این واریز عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           ELSE NULL
         END
    FROM r
   ORDER BY r.pdate, r.id;
END;
$function$
```

**Base tables read:** `payment_receipts` (driving), `person_identifiers`, `customers`,
`bank_accounts`. Nothing else.

**Every `payment_receipts` column it touches, and how it is transformed — one by one:**

| # | column | how it is transformed | lands in output column |
|---|---|---|---|
| 1 | `id` | raw uuid; also `left(id::text, 8)` as the label fallback | `doc_id`, part of `doc_label` |
| 2 | `payment_date` | raw for `doc_date`; `to_char(…, 'YYYY-MM-DD')` inside the label. **No Jalali conversion anywhere in the SQL** — Gregorian ISO string | `doc_date`, part of `doc_label` |
| 3 | `payer_name` | `COALESCE(NULLIF(btrim(payer_name), ''), '')` → empty string, never NULL | `party_name`, part of `doc_label`, quoted inside `blocked_reason` |
| 4 | `tracking_number` | `NULLIF(btrim(tracking_number), '')` → NULL when blank | `tracking_number` |
| 5 | `amount` | raw `numeric(15,2)`; tested `<= 0` and `<> trunc(amount)` for blocking. **No Toman→Rial multiplication happens in SQL** — the ×10 is a client-side concern | `amount` |
| 6 | `customer_person_id` | first arm of `COALESCE(...)` for the person lookup | → `person_code` |
| 7 | `customer_id` | second arm — `(SELECT c.person_id FROM customers c WHERE c.id = pr.customer_id)` | → `person_code` |
| 8 | `destination_bank_account_id` | correlated lookup into `bank_accounts` twice (code + title); **also a WHERE filter (`IS NOT NULL`)** | `bank_code`, `bank_title` |
| 9 | `status` | WHERE filter, `= 'approved'` | — |

**Columns it does NOT read, notably:** `payer_accounting_code`, `receiver_accounting_code`,
`beneficiary_accounting_code`, `receiver_party_id`, `receiver_name`, `payer_phone`,
`payment_time`, `receipt_time`, `bank_name`, `source_bank`, `destination_bank`, `receipt_type`,
`document_channel`, `posting_status`, `description`.

---

## E4. Exhaustive: which `payment_receipts` columns any export object reads

`payment_receipts` has **42 columns**. The table below is produced two ways: (a) a mechanical
regex probe `def ~ '\m<colname>\M'` against each of the four export function definitions, and
(b) a manual read of each body to strip false positives (the probe cannot tell `pr.status`
from `je.status`, `sq.customer_person_id`, `l.amount`, or `i.created_at`).

Legend — **BD** = `asan_list_bank_deposit_export`, **J** = `asan_list_journal_export`,
**S** = `asan_list_sales_export`, **P** = `asan_list_purchase_export`.

| # | column | type | regex hit | **real** reader(s) | role in the export |
|---:|---|---|---|---|---|
| 1 | `id` | uuid | BD J P S | **BD, J, S** | BD: `doc_id`; J: matched via `journal_entries.source_id`; S: join key `r.id = l.receipt_id` |
| 2 | `customer_id` | uuid | BD | **BD** | fallback person lookup |
| 3 | `payer_name` | text | BD J | **BD, J** | BD `party_name`; J the `واریز از «…»` sentence |
| 4 | `payer_phone` | text | — | none | |
| 5 | `payer_accounting_code` | text | — | **none** | see E5 — the export never reads it |
| 6 | `receiver_name` | text | — | none | |
| 7 | `receiver_phone` | text | — | none | |
| 8 | `receiver_accounting_code` | text | — | **none** | see E5 |
| 9 | `amount` | numeric(15,2) | BD S | **BD only** | S's `amount` hit is `payment_receipt_links.amount` (the *allocated* amount); `r.amount` appears in S only inside a comment |
| 10 | `payment_date` | date | BD | **BD** | `doc_date` + label |
| 11 | `payment_time` | time | — | none | |
| 12 | `tracking_number` | text | BD J | **BD, J** | BD column; J `پیگیری …` fragment |
| 13 | `bank_name` | text | — | none | |
| 14 | `receipt_image_url` | text | — | none | |
| 15 | `description` | text | J | **J** | tail of the `line_description` sentence |
| 16 | `status` | text | BD J P S | **BD, J(no), S** | BD `= 'approved'`; S `r.status = 'approved'`; the J hit is `je.status='posted'`, and P's is `pu.status='received'` |
| 17 | `created_by` | uuid | — | none | |
| 18 | `created_at` | timestamptz | S | **none** | S's hit is `sq.created_at` / `i.created_at` |
| 19 | `updated_at` | timestamptz | — | none | |
| 20 | `rejection_reason` | text | — | none | |
| 21 | `receipt_type` | text | — | none | |
| 22 | `source_bank` | text | — | none | |
| 23 | `destination_bank` | text | — | none | |
| 24 | `payer_name_on_receipt` | text | — | none | |
| 25 | `receiver_name_on_receipt` | text | — | none | |
| 26 | `has_perforation` | boolean | — | none | |
| 27 | `document_channel` | text | — | none | |
| 28 | `is_typed_receipt` | boolean | — | none | |
| 29 | `security_warnings` | jsonb | — | none | |
| 30 | `posting_status` | text | — | **none** | the export keys off `status='approved'`, never `posting_status` |
| 31 | `posted_at` | timestamptz | — | none | |
| 32 | `receipt_time` | text | — | none | |
| 33 | `source_bank_account_id` | uuid | — | none | |
| 34 | `destination_bank_account_id` | uuid | BD S | **BD, S** | BD: filter + bank code/title; S: `FILTER (WHERE … IS NULL/NOT NULL)` splitting cash vs bank |
| 35 | `receiver_party_id` | uuid | — | **none** | |
| 36 | `custom_data` | jsonb | — | none | |
| 37 | `beneficiary_accounting_code` | text | — | none | |
| 38 | `cheque_number` | text | — | none | |
| 39 | `cheque_due_date` | date | — | none | |
| 40 | `is_mobile_bank_screenshot` | boolean | — | none | |
| 41 | `customer_person_id` | uuid | BD S | **BD** | S's hit is `sq.customer_person_id` |
| 42 | `receiver_party_person_id` | uuid | — | none | |

### The answer — 10 columns

**The Asan export reads exactly these 10 `payment_receipts` columns:**

```
id
customer_id
customer_person_id
payer_name
tracking_number
amount
payment_date
description
status
destination_bank_account_id
```

Split by consumer:

- **`asan_list_bank_deposit_export` (9):** `id`, `payment_date`, `payer_name`, `tracking_number`,
  `amount`, `customer_person_id`, `customer_id`, `destination_bank_account_id`, `status`
- **`asan_list_journal_export` (4):** `id` (join to `journal_entries.source_id`), `payer_name`,
  `tracking_number`, `description`
- **`asan_list_sales_export` (3):** `id`, `status`, `destination_bank_account_id`
- **`asan_list_purchase_export` (0)** — it never touches `payment_receipts`

Cross-check (E-x): the *only* functions in the whole database whose body mentions both
`payment_receipts` and `asan|export` are `asan_list_bank_deposit_export`,
`asan_list_journal_export`, `asan_list_sales_export`, and `person_merge`
(`person_merge` is the FK-registry walker, not an exporter).

**32 of the 42 columns are invisible to the export.** That includes every field the prior phase
would have called "Asan-facing": `payer_accounting_code`, `receiver_accounting_code`,
`beneficiary_accounting_code`, `receiver_party_id`, `receipt_type`, `document_channel`,
`posting_status`. See E5 for why.

---

## E5. Accounting-code plumbing

### E5.1 — `asan_list_bank_deposit_export` (the receipt-facing one)

**It reads NEITHER `payer_accounting_code` NOR `receiver_accounting_code`.** Verbatim, the two
code resolutions are:

*Payer / person code — a single-step lookup, no COALESCE chain over receipt columns:*

```sql
(SELECT pi.value_normalized
   FROM public.person_identifiers pi
  WHERE pi.person_id = COALESCE(
          pr.customer_person_id,
          (SELECT c.person_id FROM public.customers c WHERE c.id = pr.customer_id))
    AND pi.kind = 'asan_person_code'
  LIMIT 1) AS pcode
```

Resolution order: `payment_receipts.customer_person_id` → `customers.person_id` (via
`customer_id`) → then `person_identifiers` where `kind='asan_person_code'`, taking
`value_normalized`, `LIMIT 1` with **no ORDER BY** (so which identifier wins is arbitrary if a
person has more than one active `asan_person_code` — UNCERTAIN whether a unique index makes this
deterministic; `uq_person_identifiers_asan_code_active` and
`uq_person_identifiers_asan_one_per_person` both exist, which suggests it is one-per-person).

*Receiver / bank code:*

```sql
(SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
  WHERE ba.id = pr.destination_bank_account_id) AS bcode
```

Single step. `external_parties` is **not** consulted; rows whose receiver is an external party
are excluded outright by `destination_bank_account_id IS NOT NULL`.

### E5.2 — `asan_list_journal_export` resolves per **journal line**, by `account_kind`

Verbatim `CASE`:

```sql
CASE jl.account_kind
  WHEN 'customer_credit' THEN
    (SELECT pi.value_normalized FROM public.person_identifiers pi
       JOIN public.customers c ON c.person_id = pi.person_id
      WHERE c.id = jl.account_ref_id AND pi.kind = 'asan_person_code' LIMIT 1)
  WHEN 'bank' THEN
    (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
      WHERE ba.id = jl.account_ref_id)
  WHEN 'external_party' THEN
    (SELECT NULLIF(btrim(ep.accounting_code), '') FROM public.external_parties ep
      WHERE ep.id = jl.account_ref_id)
  WHEN 'supplier_payable' THEN
    (SELECT COALESCE(
              NULLIF(btrim(COALESCE(s.accounting_code, '')), ''),
              (SELECT pi.value_normalized FROM public.person_identifiers pi
                WHERE pi.person_id = s.person_id
                  AND pi.kind = 'asan_person_code' LIMIT 1))
       FROM public.suppliers s WHERE s.id = jl.account_ref_id)
  ELSE
    (SELECT NULLIF(btrim(ca.accounting_code), '') FROM public.asan_control_accounts ca
      WHERE ca.account_kind = jl.account_kind)
END AS acode
```

All seven `journal_lines.account_kind` values are covered
(`CHECK (account_kind = ANY (ARRAY['customer_credit','bank','external_party','invoice_ar','clearing','other','supplier_payable']))`).
The `ELSE` arm serves `invoice_ar`, `clearing`, `other` from `asan_control_accounts`, whose live
contents are (E5a):

| account_kind | accounting_code | label_fa |
|---|---|---|
| `invoice_ar` | `989` | حساب کنترلی دریافتنی (جمع بدهکاران) |

`clearing` and `other` have **no row**, so those kinds always resolve to NULL and always block —
which the body says is deliberate.

### E5.3 — The divergence from `post_receipt_accounting`

`post_receipt_accounting(p_receipt_id uuid, p_user_id uuid)` resolves the receiver code as
(verbatim structure):

1. `v_receipt.receiver_accounting_code` if non-blank
2. else `external_parties.accounting_code` via `receiver_party_id`
3. else `bank_accounts.accounting_code` + `title` via `destination_bank_account_id`, and
   `RAISE EXCEPTION … ERRCODE='23514'` if that code is blank

and it writes `payer_accounting_code` / `receiver_accounting_code` onto the
`journal_entries` row:

```sql
INSERT INTO public.journal_entries(
  source_type, source_id, entry_date, description, status, posted_by,
  payer_accounting_code, receiver_accounting_code)
VALUES ('payment_receipt', v_receipt.id, v_receipt.payment_date,
        'سند فیش واریزی شماره ' || v_receipt.tracking_number, 'posted', p_user_id,
        NULLIF(trim(COALESCE(v_receipt.payer_accounting_code,'')), ''),
        NULLIF(trim(COALESCE(v_receiver_code,'')), ''))
```

**Yes — the orders differ, and the difference is total, not cosmetic:**

| | `post_receipt_accounting` | `asan_list_bank_deposit_export` | `asan_list_journal_export` |
|---|---|---|---|
| payer code source | `payment_receipts.payer_accounting_code` (verbatim, no fallback) | `person_identifiers.value_normalized` via `customer_person_id`/`customer_id` | `person_identifiers.value_normalized` via `customers.person_id` (line `account_ref_id`) |
| receiver code source | `receiver_accounting_code` → `external_parties` → `bank_accounts` (raise if blank) | `bank_accounts.accounting_code` **only** | per `account_kind` (see E5.2) |
| external-party receiver | supported (2nd arm) | **excluded by the WHERE clause** | supported (`external_party` arm) |
| `journal_entries.payer_accounting_code` / `receiver_accounting_code` | written | — | **never read** |

**The single most important consequence for the rebuild:** the two `*_accounting_code` text
columns on `payment_receipts` are written into `journal_entries` by `post_receipt_accounting`,
and then **no export object ever reads them again**. Both export paths re-derive the Asan code
from the *entity* (`person_identifiers` / `bank_accounts` / `external_parties` /
`suppliers` / `asan_control_accounts`), not from the receipt's typed text. So a typo in
`payer_accounting_code` does not corrupt the Asan file; conversely, a correct value typed there
does **not** rescue an export whose person has no `asan_person_code` identifier.

`payer_accounting_code` / `receiver_accounting_code` are still load-bearing, but for a different
reason: `post_receipt_accounting` blocks posting on them when the corresponding
`validation_rules` row (`scope='journal_entry'`, `enabled`, `severity='blocking'`,
`field_key IN ('payer_accounting_code','receiver_accounting_code')`, `rule_type='required'`)
exists.

---

## E6. Filters baked into each export object — verbatim

**`asan_list_bank_deposit_export`**

```sql
-- guard
IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) ... 42501
IF _from IS NULL OR _to IS NULL OR _to < _from ... 22023
-- data
WHERE pr.status = 'approved'
  AND pr.destination_bank_account_id IS NOT NULL
  AND pr.payment_date BETWEEN _from AND _to
```

No filter on `posting_status`, `receipt_type`, `document_channel`, or `receipt_type`.
A receipt whose receiver is an *external party* (`receiver_party_id` set,
`destination_bank_account_id` NULL) **never appears in this export at all** — silently, with no
`blocked_reason`.

**`asan_list_journal_export`**

```sql
IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) ... 42501
IF _from IS NULL OR _to IS NULL OR _to < _from ... 22023
IF _filter IS NULL OR _filter NOT IN ('all','receipt','payment','third_party','settlement') ... 22023
-- entries
WHERE je.status = 'posted'
  AND je.entry_date BETWEEN _from AND _to
-- lines
WHERE jl.journal_entry_id IN (SELECT id FROM e)
-- final
WHERE _filter = 'all' OR k.dkind = _filter
```

`k.dkind` classification, verbatim:

```sql
CASE
  WHEN e.source_type = 'mutual_settlement' THEN 'settlement'
  WHEN COALESCE(a.has_external, false)     THEN 'third_party'
  WHEN COALESCE(a.bank_net, 0) > 0         THEN 'receipt'
  WHEN COALESCE(a.bank_net, 0) < 0         THEN 'payment'
  ELSE 'unclassified'
END
```

Note `'unclassified'` is reachable but is not an accepted `_filter` value, so such entries appear
only under `_filter='all'`.

**`asan_list_purchase_export`**

```sql
WHERE pu.status = 'received'
  AND pu.purchase_date BETWEEN _from AND _to
-- lines: WHERE i.purchase_id IN (SELECT id FROM p)
```

**`asan_list_sales_export`**

```sql
WHERE sq.status = 'accepted'
  AND (sq.created_at AT TIME ZONE 'Asia/Tehran')::date BETWEEN _from AND _to
-- payment split (this is where payment_receipts enters):
FROM public.payment_receipt_links l
JOIN public.payment_receipts r ON r.id = l.receipt_id
WHERE l.quote_id IS NOT NULL AND r.status = 'approved'
GROUP BY l.quote_id
--   cash := SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NULL)
--   bank := SUM(l.amount) FILTER (WHERE r.destination_bank_account_id IS NOT NULL)
```

`asan_list_sales_export` uses `payment_receipt_links.amount` — the amount **allocated** to that
quote — never `payment_receipts.amount`. The body carries an explicit warning that summing the
receipt total would inflate the deposit ~100× on live data (receipt `fd8194a5`).

---

## E7. Real-data sanity check (READ-ONLY)

**No export function was executed.** `asan_list_bank_deposit_export` is a role-gated
`SECURITY DEFINER` function; from `psql`, `auth.uid()` is NULL and it would raise `42501`.
Instead its inner `SELECT` was **replicated by hand** against the base tables, with the date
range widened to `2000-01-01 … 2100-01-01` and the four Persian `blocked_reason` strings
replaced by ASCII markers so nothing Persian reached the terminal.

Base-table counts:

| table | rows |
|---|---:|
| `payment_receipts` | **7** |
| `journal_entries` | **1** |
| `journal_lines` | **2** |
| `asan_export_numbers` | **2** |

`payment_receipts` by status:

| status | posting_status | count |
|---|---|---:|
| `pending_review` | `unposted` | 6 |
| `approved` | `posted` | 1 |

**Replicated `asan_list_bank_deposit_export` output — 1 row (all dates):**

| field | value |
|---|---|
| `doc_id` | `fd8194a5-62db-4e13-9852-6a27ee00612c` |
| `doc_date` | `2026-07-25` |
| `party_name` | پرداخت‌کنندهٔ آزمایشی 7 |
| `person_code` | *(empty)* |
| `tracking_number` | `123456` |
| `amount` | `10100000000.00` |
| `bank_code` | `8` |
| `bank_title` | `12` |
| `blocked_reason` | **BLOCKED — no person code** (`کد آسان برای «…» ثبت نشده است`) |

So the bank-deposit export would emit **1 row, and that row is blocked.** Effective exportable
rows today: **0**.

`journal_entries` (the only one):

| id | source_type | source_id | entry_date | status | payer_accounting_code | receiver_accounting_code |
|---|---|---|---|---|---|---|
| `6d6b1896-…` | `payment_receipt` | `fd8194a5-…` | 2026-07-25 | `posted` | `002` | `cust-123` |

`journal_lines`:

| line_no | account_kind | account_ref_id | debit | credit |
|---:|---|---|---:|---:|
| 1 | `bank` | `32a4c282-…` | 10 100 000 000.00 | 0 |
| 2 | `customer_credit` | `d05bbd0b-…` | 0 | 10 100 000 000.00 |

`asan_export_numbers`:

| doc_type | source_id | asan_number | burned |
|---|---|---:|---|
| `accounting_document` | `6d6b1896-…` | 1 | no |
| `sales_invoice` | `bcbe3ce6-…` | 1 | no |

Code-availability on the joined entities:

| | total | with non-blank code |
|---|---:|---:|
| `bank_accounts.accounting_code` | 1 | 1 |
| `external_parties.accounting_code` | 1 | **0** |
| `person_identifiers` kind `asan_person_code` | 11 | 11 |

> **These counts are far too small to draw conclusions from.** 7 receipts, 1 journal entry,
> 1 bank account, 1 external party. The single exportable row is obvious test data
> (`bank_title = '12'`, `bank_code = '8'`, payer "پرداخت‌کنندهٔ آزمایشی ۷"). Treat E7 as proof
> that the plumbing runs, not as evidence about production shapes.

---

## E8. Everything that rewrites a column the export reads

### E8a — Triggers on `payment_receipts` (6)

| trigger | timing / columns | function | touches an exported column? |
|---|---|---|---|
| `trg_normalize_phone` | `BEFORE INSERT OR UPDATE` | `tg_normalize_phone_columns('payer_phone','receiver_phone')` | no (neither phone is exported) |
| **`trg_payment_receipts_derive_person`** | `BEFORE INSERT OR UPDATE OF customer_id, receiver_party_id` | `tg_payment_receipts_derive_person` | **YES — it OVERWRITES `customer_person_id`** |
| `trg_payment_receipts_enforce_allocation_on_approve` | `BEFORE UPDATE OF status WHEN (new.status='approved' AND old.status IS DISTINCT FROM 'approved')` | `enforce_receipt_approval_allocation_limits` | gates `status`, the export's main filter |
| `trg_payment_receipts_post_journal` | `AFTER INSERT OR UPDATE OF status` | `trg_post_receipt_on_approve` | see below |
| `trg_payment_receipts_recompute_employee_score` | `AFTER INSERT OR DELETE OR UPDATE OF status` | `recompute_employee_scores_on_receipt` | no |
| `trg_payment_receipts_updated_at` | `BEFORE UPDATE` | `set_updated_at_now` | no (`updated_at` not exported) |

**`tg_payment_receipts_derive_person` is the one the rebuild must not fight.** Verbatim:

```sql
IF NEW.customer_id IS NULL THEN
  NEW.customer_person_id := NULL;
ELSE
  SELECT c.person_id INTO NEW.customer_person_id
    FROM public.customers c WHERE c.id = NEW.customer_id;
END IF;

IF NEW.receiver_party_id IS NULL THEN
  NEW.receiver_party_person_id := NULL;
ELSE
  SELECT ep.person_id INTO NEW.receiver_party_person_id
    FROM public.external_parties ep WHERE ep.id = NEW.receiver_party_id;
END IF;
```

It is unconditional: **any value the UI writes into `customer_person_id` is discarded and
recomputed from `customer_id`.** The export's whole person-code chain hangs off this derived
column, so the *only* field the rebuild can steer it with is `customer_id`.

Note also `trg_normalize_phone_columns` rewrites `NEW` through
`to_jsonb` → `jsonb_set` → `jsonb_populate_record` — i.e. the whole row is round-tripped through
jsonb on every INSERT/UPDATE. That is a general "typed value ≠ stored value" hazard even though
the two columns it targets are not exported.

**`trg_post_receipt_on_approve` is a no-op today.** It calls `post_receipt_journal(NEW.id)`, whose
live body is:

```sql
BEGIN
  -- NEUTRALIZED (migration 149). Model B (post_receipt_accounting) is the authoritative
  -- ledger path. ... it now does nothing, so the approve UPDATE succeeds and only Path B posts.
  RETURN NULL;
END;
```

Its guard nonetheless reads three receipt columns —
`NEW.payer_accounting_code IS NOT NULL AND COALESCE(NEW.beneficiary_accounting_code,
NEW.receiver_accounting_code) IS NOT NULL` — so `beneficiary_accounting_code` is referenced there
and nowhere else in the posting path. Currently that gate only decides whether to call a function
that returns NULL.

### E8b — Triggers on the other tables the export reads

| table | triggers relevant to exported values |
|---|---|
| `bank_accounts` | `trg_bank_accounts_updated_at` only — **`accounting_code` is never rewritten by a trigger** |
| `customers` | **`trg_customers_pull_asan_code` → `trg_mirror_pull_asan_code`** (fills `customers.accounting_code` from `person_identifiers` when NULL and not already taken), `trg_normalize_phone`, `customers_audit`, `customers_updated_at`, `trg_customers_log_responsible` |
| `suppliers` | **`trg_suppliers_pull_asan_code` → `trg_mirror_pull_asan_code`** (same), plus audit/updated_at/phone |
| `person_identifiers` | **`trg_person_identifiers_propagate_asan_code`** (pushes `value_raw` onto `customers.accounting_code` / `suppliers.accounting_code`; clears them on revoke/delete), `trg_person_identifiers_normalize` (writes `value_normalized` — **the exact column both export paths read**), `trg_person_identifiers_validate`, 2 audit triggers, `set_updated_at` |
| `journal_entries` | `trg_asan_burn_journal_entry_number` (burns the Asan number on DELETE) |
| `journal_lines` | `trg_validate_journal_line_ref` |
| `external_parties` | `trg_external_parties_updated_at`, `trg_normalize_phone` |
| `persons` | 2 audit triggers + `set_updated_at` |
| `purchases` | `trg_asan_burn_purchase_number`, `trg_purchases_derive_person`, audit, scoring, `trg_guard_accountant_purchase_update` |

**Key hazard for the rebuild:** the export reads `person_identifiers.value_normalized`, not
`value_raw`. `tg_person_identifiers_normalize` produces it. So the Asan code that reaches the
Excel file is a *normalised* form of what a user typed, and the customer/supplier
`accounting_code` mirror is populated from `value_raw` instead — two different strings can be in
play for the same person.

---

## E9. Reachability and role gates

### E9a/E9d — Function privileges

All four `asan_list_*` functions: owner `supabase_admin`, `SECURITY DEFINER`,
`proconfig = {search_path=public}`, and **`EXECUTE` granted to `anon`, `authenticated`,
`postgres`, `service_role`, `supabase_admin`** (`asan_list_journal_export` additionally still
carries the default `PUBLIC EXECUTE`, i.e. `=X/supabase_admin` — the other three had it revoked).

So the grant layer is wide open, including to `anon`. **The real gate is inside the body**, first
statement, identical in all four:

```sql
IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
  RAISE EXCEPTION '…' USING ERRCODE = '42501';
END IF;
```

`admin` or `accountant` only. `manager` can read `journal_entries` / `journal_lines` (see E9c) but
**cannot run any export**.

### E9b — Relations

| relation | kind | owner | RLS | grants |
|---|---|---|---|---|
| `asan_control_accounts` | table | supabase_admin | **on** | `arwdDxt` to anon/authenticated/service_role |
| `asan_export_numbers` | table | supabase_admin | **on** | `arwdDxt` to anon/authenticated/service_role |
| `asan_import_batches` | table | supabase_admin | **on** | same |
| `asan_import_person_rows` | table | supabase_admin | **on** | same |
| `asan_import_product_rows` | table | supabase_admin | **on** | same |
| `payment_receipts` | table | postgres | **on** | `arwdDxt` to anon/authenticated/service_role |

Table grants are permissive; RLS is what constrains them.

### E9c — Policies

| table | policy | cmd | roles | qual |
|---|---|---|---|---|
| `asan_export_numbers` | `asan_export_numbers_select` | SELECT | authenticated | `has_any_role(uid(), ARRAY['admin','accountant'])` |
| `journal_entries` | `journal_entries_select_finance` | SELECT | authenticated | `has_role admin OR manager OR accountant` |
| `journal_entries` | `journal_entries_insert_admin_accountant` | INSERT | authenticated | *(with_check only)* |
| `journal_entries` | `journal_entries_update_admin_accountant` | UPDATE | authenticated | `admin OR accountant` |
| `journal_entries` | `viewer_restricted` | ALL | authenticated | `NOT is_viewer_only(uid())` |
| `journal_lines` | `journal_lines_select_finance` | SELECT | authenticated | `admin OR manager OR accountant` |
| `journal_lines` | `journal_lines_insert_admin_accountant` | INSERT | authenticated | *(with_check only)* |
| `journal_lines` | `journal_lines_update_admin_accountant` | UPDATE | authenticated | `admin OR accountant` |
| `journal_lines` | `viewer_restricted` | ALL | authenticated | `NOT is_viewer_only(uid())` |
| `payment_receipts` | `pr_select_privileged` | SELECT | authenticated | `has_any_role(uid(), ARRAY['admin','manager','accountant'])` |
| `payment_receipts` | `pr_insert_admin_accountant` | INSERT | authenticated | *(with_check only)* |
| `payment_receipts` | `pr_update_admin_accountant` | UPDATE | authenticated | `has_any_role(uid(), ARRAY['admin','accountant'])` |
| `payment_receipts` | `viewer_restricted` | ALL | authenticated | `NOT is_viewer_only(uid())` |

Because the export functions are `SECURITY DEFINER` owned by `supabase_admin`, RLS on
`payment_receipts` does **not** apply to their internal reads — the in-body `has_any_role` check
is the sole authorisation.

`asan_export_numbers` has a SELECT policy for admin/accountant but **no INSERT/UPDATE policy**;
writes go through the `SECURITY DEFINER` `asan_assign_document_number` / `asan_burn_document_number`.

---

## BLOCKED

Nothing. Every step completed read-only. No writes, no migrations, no git operations, no
container restarts, and no `asan_*` function was executed.

---

## What the rebuild must preserve — condensed

1. **`customer_id`** — sole steering wheel for the person code. `customer_person_id` is derived
   by trigger and cannot be set directly.
2. **`status` must reach `'approved'`** — it is the filter on all three receipt-reading exports;
   `posting_status` is irrelevant to the export.
3. **`destination_bank_account_id`** — a receipt with `receiver_party_id` instead vanishes from
   `asan_list_bank_deposit_export` entirely, without a `blocked_reason`.
4. **`payment_date`** — `doc_date` and the label; must stay a real date, not a Jalali string
   (no Jalali conversion exists in SQL).
5. **`amount`** — must be a positive integer-valued numeric or the row blocks
   (`amount <> trunc(amount)`).
6. **`payer_name`** — `party_name` column *and* the human-readable Persian sentence in
   `asan_list_journal_export`.
7. **`tracking_number`** — export column, journal-sentence fragment, and the text of
   `journal_entries.description` written by `post_receipt_accounting`.
8. **`description`** — the tail of the journal `line_description`. Free text, but it ships to Asan.
9. `payer_accounting_code` / `receiver_accounting_code` / `beneficiary_accounting_code` are
   **not** read by any export; they only gate `post_receipt_accounting` via `validation_rules`
   and get copied onto `journal_entries` where nothing reads them.
10. Everything else — 32 columns — has no export consumer.
