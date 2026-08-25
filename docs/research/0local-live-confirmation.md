# 0-LOCAL — confirming M12's provisional findings against the live database

M12 (PR #348) answered OG-9 and OG-12 from repository evidence only, executed from a
cloud container that could not reach the database (OG-58). Every one of its conclusions
was stamped **PROVISIONAL**. This mission is the live half: read-only, no migration, no
data change, no `src/`.

Environment precondition (v4 §STOP) proved before anything else:

```
$ docker ps --format "{{.Names}}" | grep afrakala-lan
afrakala-lan-auth
afrakala-lan-web
afrakala-lan-caddy
afrakala-lan-db
afrakala-lan-kong
afrakala-lan-storage
afrakala-lan-meta
afrakala-lan-rest

$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "select 1;"
 ?column?
----------
        1
(1 row)
```

Database is `afrakala`, not `postgres` (A5.29). Production `192.168.170.10` was not
contacted in any way.

---

## (a) OG-9 — the serial does not reset per Jalali year. CONFIRMED LIVE.

### a1 — `asan_assign_document_number`, the mechanism OG-9's row names

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala \
    -c "SELECT pg_get_functiondef('public.asan_assign_document_number'::regproc);"
```

The minting statement, verbatim from the live body:

```sql
SELECT COALESCE(MAX(asan_number), 0) + 1 INTO _number
  FROM public.asan_export_numbers
 WHERE doc_type = _doc_type;
```

The predicate is `doc_type` alone. **No year appears anywhere in the body.** The advisory
lock key is `hashtext('asan_export_numbers:' || _doc_type)`, exactly as migration 290
records. The live body matches what OG-9's row claims of migration 290.

A5.28 warns the live body can differ from git, and that warning is the entire reason this
step exists. Here it does not differ.

→ **PROVISIONAL struck from OG-9 for this mechanism.**

### a2 — a SECOND serial mechanism exists, and it is the one that raised OG-9

M12's record names only `asan_export_numbers`. Measurement found a second, and it matters,
because **migration 338's own header comment is where OG-9 was flagged**:

```
$ grep -n "OG-9" supabase/migrations/20260818152000_338_document_numbers.sql
19:--   per-year reset (RCP-1406-000001). The checklist says "mirror asan_assign_document_number
20:--   exactly", so the global series is implemented. Flagged as OG-9 because it is an
21:--   accountant-visible convention, not a technical choice.
```

Migration 338 only *mentions* `asan_assign_document_number` in prose; what it creates is
`public.document_numbers` + `public.assign_document_number`. Both are live:

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "SELECT
    to_regclass('public.document_numbers'), to_regproc('public.assign_document_number');"
 to_regclass      | to_regproc
------------------+---------------------------
 document_numbers | assign_document_number
```

Its live minting statement:

```sql
SELECT COALESCE(MAX(serial), 0) + 1 INTO _serial
  FROM public.document_numbers
 WHERE doc_type = _doc_type;

_jyear  := public.jalali_year(public.tehran_today());
_number := _prefix || '-' || _jyear::text || '-' || lpad(_serial::text, 6, '0');
```

**The Jalali year is in the display string only.** The series itself is
`MAX(serial)+1 WHERE doc_type = _doc_type` — global per doc_type, no year in the
predicate. So numbering runs `RCP-1405-000042 → RCP-1406-000043` across a year boundary,
which is precisely the convention the owner confirmed on 2026-08-23.

The reset is unrepresentable here too, for the same structural reason OG-9's row gives for
the asan table:

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "SELECT conname,
    pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid='public.document_numbers'::regclass ORDER BY conname;"

 document_numbers_serial_unique_per_type | UNIQUE (doc_type, serial)
 document_numbers_one_per_document       | UNIQUE (doc_type, source_id)
 document_numbers_number_unique          | UNIQUE (document_number)
 document_numbers_doc_type_check         | CHECK (doc_type = ANY (ARRAY['receipt','payment','dual']))
 document_numbers_serial_check           | CHECK (serial > 0)
```

`UNIQUE (doc_type, serial)` carries **no year column**. A per-year reset would restart
`serial` at 1 and collide with the existing row on the second year. Introducing a reset is
a schema migration, not a code change — the same finding OG-9 already records for
`asan_export_numbers`, now shown to hold for both mechanisms.

This **extends** OG-9's evidence; it does not contradict it. The owner's answer holds for
the whole serial surface, not half of it.

### a3 — live-vs-git provenance of the one live/file difference

The live body of `assign_document_number` carries a comment and a role array that
migration 338 does not:

```sql
-- 346/M3: manager admitted, matching audit-trigger-spec section 3's canonical gate ...
IF NOT public.has_any_role(_uid,
      ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
```

That is not drift — it is a later migration, present in the tree:

```
$ grep -n "manager" supabase/migrations/20260818161000_346_gate_a_major_fixes.sql | grep app_role
151:        ARRAY['admin'::app_role, 'accountant'::app_role, 'manager'::app_role]) THEN
```

Live matches git once 346 is accounted for. No drift on this function.

---

## (b) OG-12 — `ledger-documents` is correct and uncontested. CONFIRMED LIVE.

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala \
    -c "SELECT DISTINCT module FROM role_permissions ORDER BY 1;"
```

28 modules: `academy, accounting, asan-export, asan-import, audit-logs, bot-api-keys,
dashboard, data-tables, feedback, hr, invoices, knowledge, ledger-documents, market-rates,
messages, persons, platform-releases, price-lists, pricing, products, product-videos,
purchases, reports, roles, sales, suppliers, users, warehouse`.

`ledger-documents` is present. Seeded by migrations 344 and 352, both in the tree.

### No competing ledger-wizard module string

```
$ grep -rnE "has_dynamic_permission|hasPermission|module:" src/features/ledger-wizard/
[no output]
```

The wizard registers no module string of any kind. The only `ledger*` literals in `src/`
are three **React Query cache keys**, not permission modules:

```
src/features/ledger-wizard/DocumentWizard.tsx:97:  queryKey: ["ledger-wizard-accounts"]
src/features/ledger-wizard/DocumentWizard.tsx:102: queryKey: ["ledger-wizard-held-cheques"]
src/features/ledger-wizard/DocumentWizard.tsx:114: queryKey: ["ledger-wizard-proformas"]
```

Confirmed by reading their surrounding `useQuery({ ... })` calls, not by the name alone.

### Two-way census, live set against real `src/` references

27 module strings are referenced in `src/`. Compared against the live 28 under a single
collation (`LC_ALL=C`; psql's `ORDER BY` and shell `sort` disagree on the hyphen, which
produced a spurious diff on the first attempt and was corrected):

```
in src/ but NOT seeded live  ->  (empty)
seeded live but NO consumer  ->  ledger-documents
```

**Forward:** no module referenced in `src/` is missing a seed row, so no module falls
through to the fallback. **Reverse:** `ledger-documents` is still the only seeded module
with zero consumers — OG-57 confirmed live, unchanged.

→ **PROVISIONAL struck from OG-12.**

---

## Correction to A5.32's shorthand for `has_dynamic_permission`

A5.32 states: *"a module with no `role_permissions` row is **open to all roles**."*
The live body shows that is true only for `view`. The fallback is a graded legacy matrix:

```sql
IF _exists THEN RETURN _matched; END IF;
-- Fallback: sensible defaults based on legacy static matrix
IF _action IN ('view') THEN
  RETURN has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']);
ELSIF _action IN ('create','update') THEN
  RETURN has_any_role(_user_id, ARRAY['admin','manager']);
ELSIF _action = 'delete' THEN
  RETURN has_role(_user_id, 'admin');
ELSIF _action IN ('approve','export') THEN
  RETURN has_any_role(_user_id, ARRAY['admin','manager','accountant']);
ELSIF _action = 'view_sensitive' THEN
  RETURN has_any_role(_user_id, ARRAY['admin','manager','accountant']);
END IF;
RETURN false;
```

So for an unseeded module: `view` is open to all five roles (shorthand holds), but
`create`/`update` are admin+manager, `delete` is admin only, and `approve`/`export`/
`view_sensitive` are admin+manager+accountant. A NULL `_user_id` returns `false` at the
top, so anon gets nothing.

This changes no decision in this mission — the forward census found no unseeded module —
but it is recorded because A5.32's phrasing would lead a future mission to treat an
unseeded module as a wide-open **write** door. It is not; it is admin/manager.

---

## OG-59 — CLOSED. Not schema drift.

OG-59's own row names the one query that settles it, and says it was not run (OG-58). It
was run here:

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "SELECT
    to_regclass('public.document_serial_counters'), to_regproc('public.next_serial');"

 tbl_document_serial_counters | fn_next_serial
------------------------------+----------------
                              |
(1 row)
```

Both **NULL**. The objects do not exist in the live database, and a whole-tree grep
already returned zero hits for both names. That is OG-59's branch **(b)**: the names came
from somewhere other than this system. Branch (a) — *exists live but in no migration*,
which would have been schema drift outranking M8 — is refuted by this output.

The names `document_serial_counters` and `next_serial` originated in a **fabricated
report** on 2026-08-25 and were then quoted back as fact in a later instruction. A
whole-tree grep returned zero hits for both, and the agent that received them correctly
refused to build on them. The real serial mechanism is `asan_export_numbers` +
`asan_assign_document_number` (migrations 290/291) — and, as a2 above establishes,
`document_numbers` + `assign_document_number` (migration 338) — which is what OG-9 is
about.

**CLOSED — no drift, no action.** Cross-reference A0.9: fabricated details propagate, and
only a zero-hit grep plus this zero-row query stopped these two from becoming a
schema-drift investigation.

---

## Scope statement

No migration was written or applied. No row was inserted, updated or deleted. No file
under `src/` changed. Every query above is `SELECT`-only. `docker restart
afrakala-lan-rest` was therefore **not** required and not run (A5.29 conditions it on
having applied a migration).

**production لمس نشد** — `192.168.170.10` was not contacted.
