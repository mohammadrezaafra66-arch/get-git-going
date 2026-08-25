# M12 — the document serial, and the module string

Measurement for Phase 2 mission 2. Both halves of M12 have a recorded owner decision
(`ledger-decisions.md:534`) — *"Do not reset the serial. Do not rename the module."* — and
both are therefore no-change outcomes. What was missing was the evidence that they are
**already** so, which is what this document supplies.

## ⚠️ SCOPE OF THIS EVIDENCE — READ BEFORE CITING IT

**Everything below is REPOSITORY evidence: migration files, source files and specs.
NOT ONE LINE OF IT CAME FROM THE LIVE `afrakala` DATABASE.** No `psql` ran. No
`pg_get_functiondef`, no `SELECT DISTINCT module FROM role_permissions`, no row counts.

The session that produced this document runs in a cloud container that cannot reach the
test computer. Measured at the time of writing, not assumed:

```
$ timeout 8 bash -c 'cat </dev/null >/dev/tcp/192.168.170.8/5432'
UNREACHABLE (no route)

$ timeout 20 psql "postgresql://postgres@192.168.170.8:5432/afrakala" -c "select 1"
Terminated                        <- killed at the timeout; never connected

$ docker ps
failed to connect to the docker API at unix:///var/run/docker.sock: no such file or directory

$ curl -o /dev/null -w "%{http_code}" https://api.test.myafrakala.ir/rest/v1/
curl: (56) CONNECT tunnel failed, response 403        (proxy policy denial)
```

**A5.28 applies with full force:** the live database sometimes holds an *older* definition
than git, and `schema_full_export.sql` is unreliable. So every conclusion here is
**provisional on a live re-check**, and the two queries that would settle it are named at
the end. Anyone citing this document as live proof is misciting it.

---

## Half 1 — the serial (OG-9)

### What the serial actually is

The owner's instruction named `document_serial_counters` and `next_serial`. **Neither
exists anywhere in this repository:**

```
$ grep -rl "document_serial_counters" . --exclude-dir=.git --exclude-dir=node_modules
(no output)

$ grep -rl "next_serial" . --exclude-dir=.git --exclude-dir=node_modules
(no output)
```

Zero hits, whole repo, both names. The mechanism that does exist is the Asan document
register, and it is the one OG-9 is about:

```
$ grep -rln "asan_export_numbers" supabase/migrations/
supabase/migrations/20260805103000_290_asan_export_numbers.sql     <- table + minting
supabase/migrations/20260805113000_291_asan_export_module.sql      <- batch form + module
supabase/migrations/20260822234000_378_gate_compares_census_as_a_set.sql
supabase/migrations/20260823001000_379_census_by_effect_all_relkinds.sql
supabase/migrations/20260823010000_380_pin_privilege_set_and_column_effect.sql
```

This discrepancy is raised as **OG-59** below rather than smoothed over: if those two
objects exist on the live server but in no migration, that is schema drift and matters
more than M12 does.

### The finding: a Jalali-year reset is not merely absent, it is unrepresentable

`asan_assign_document_number` (migration 290) mints as follows, verbatim:

```sql
  SELECT COALESCE(MAX(asan_number), 0) + 1 INTO _number
    FROM public.asan_export_numbers
   WHERE doc_type = _doc_type;
```

The predicate is `doc_type` alone. And the table it counts over carries no year at all:

```sql
CREATE TABLE IF NOT EXISTS public.asan_export_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type     text NOT NULL CHECK (doc_type IN (...)),
  source_id    uuid NOT NULL,
  asan_number  integer NOT NULL CHECK (asan_number > 0),
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  uuid,
  burned_at    timestamptz,
  burned_reason text,
  CONSTRAINT asan_export_numbers_one_number_per_document UNIQUE (doc_type, source_id),
  CONSTRAINT asan_export_numbers_number_unique_per_type  UNIQUE (doc_type, asan_number)
);
```

Three independent places would each have to change for a per-year reset, and none of them
carries a year term today:

| Site | Current | A per-year reset would need |
|---|---|---|
| `MAX(...)` predicate | `WHERE doc_type = _doc_type` | `AND jalali_year = <year>` |
| unique constraint | `UNIQUE (doc_type, asan_number)` | `UNIQUE (doc_type, jalali_year, asan_number)` |
| advisory lock key | `hashtext('asan_export_numbers:' \|\| _doc_type)` | the year in the key, or two years serialise on one lock |

So **OG-9's "do not reset" is satisfied by construction, not by policy.** Honouring the
owner's decision costs zero lines. Introducing a reset would be a schema migration plus a
constraint change on a table whose whole design note is *"numbers are never reused, never
renumbered, never reordered"*. Recording that asymmetry is the useful output of this half:
the cheap direction is the one already taken.

Two design properties worth carrying forward, because they explain gaps the owner may
otherwise query: the counter deliberately uses `max+1` under `pg_advisory_xact_lock`
rather than a SEQUENCE (a sequence burns a value on rollback and would create gaps nobody
can explain), and deleted or cancelled documents mark `burned_at` rather than freeing the
number. **Every gap in this register is therefore deliberate and explainable** — which is
also why a per-year reset would be more disruptive here than in an ordinary numbering
scheme.

---

## Half 2 — the module string (OG-12)

### The census

Every module literal appearing in a `role_permissions` INSERT across all migrations:

```
$ awk '/INSERT INTO public\.role_permissions/,/;/' supabase/migrations/*.sql \
    | grep -ohE "'[a-z][a-z0-9_-]{2,30}'" | sort -u
```

28 module strings, after removing the role names and column names the range also catches:

```
academy          bank             hr               persons          purchases
accounting       bot-api-keys     invoices         price-lists      reports
asan-export      dashboard        knowledge        pricing          roles
asan-import      data-tables      ledger-documents product-videos   suppliers
audit-logs       feedback         market-rates     products         users
                 warehouse        messages         platform-releases
```

### Cross-check A — is any module used by `src/` left unseeded?

This is the direction that matters for security: **A5.32 — a module with no
`role_permissions` row is OPEN to all roles**, which migration 344's own header states as
*"An unseeded module is OPEN, not closed."*

```
$ for m in $USED; do echo "$SEEDED" | grep -qx "$m" || echo "  UNSEEDED: $m"; done
  UNSEEDED: hr
```

**That single hit is a FALSE POSITIVE of my own census method, and it is recorded because
nearly reporting it was the mistake.** `hr` *is* seeded — migration 315 does it with a
`SELECT`-form INSERT whose statement my `awk` range terminated early on:

```
$ grep -n "'hr'" supabase/migrations/20260808060000_315_seed_role_permissions_missing_modules.sql
94:SELECT r.role_name, 'hr',
104:                    WHERE rp.role_name = r.role_name AND rp.module = 'hr');
```

**Corrected result: every module referenced by `src/` has a seed row. No open door.**
This is the same class as the `PGRST202` self-typo in M5B — a control check killed the
theory before it became a finding.

### Cross-check B — the reverse direction, and this is where OG-12 lands

```
$ for m in $SEEDED; do n=$(grep -rF "\"$m\"" src/ | wc -l); [ "$n" -eq 0 ] && echo "  NO CONSUMER: $m"; done
  NO CONSUMER: ledger-documents
```

**`ledger-documents` is the only seeded module in the system that nothing in `src/`
consults.** Zero references, zero files.

OG-12 was raised inside migration 344 itself, and its exact worry was this:

> `>>> OG-12: is 'ledger-documents' the right module string? If phase 6's wizard registers
> a different one, THAT string will be unseeded and therefore open to every role. Whatever
> name phase 6 uses must be seeded before the wizard ships.`

**Measured answer: phase 6's wizard registers no module string at all.** There is no
competing name to be unseeded, so the feared open door does not exist:

```
$ grep -rn "module\|hasPermission\|has_dynamic\|usePermission" src/features/ledger-wizard/*.ts*
(no permission call of any kind — the only matches are `roleId`, a party-role field,
 and `LookupStatus = ... | "wrong_role"`)
```

So **OG-12 answers as the owner decided — keep `ledger-documents`, do not rename** — and it
answers for a stronger reason than "the name is fine": renaming it would change a string
that has no readers, i.e. pure risk for zero benefit.

The wizard is not unguarded. Its route carries both layers M6 built:

```
$ grep -n "requireAnyRole\|staticData" src/routes/_app.accounting.receipts.create.tsx
 4: import { requireAnyRole } from "@/lib/rbac/route-guards";
16:   staticData: { gate: { kind: "anyRole", allowed: ["admin","accountant","manager"] } },
```

and migration 352 later gave `manager` `can_view`/`can_create` on `ledger-documents`, so
the seed and the route agree on the three roles. What is absent is only the **module**
layer of CLAUDE.md rule 7 (UI guard + route/server guard + RLS). Raised as **OG-57**, not
fixed here — wiring a permission check into a shipped wizard is a behaviour change and
M12's mandate is explicitly "change neither".

---

## New Owner-Gates raised by this mission

| # | Question |
|---|---|
| **OG-57** | `ledger-documents` is seeded (344, amended 352) and consulted by nothing. Wire the module check into the wizard's UI layer, or record the row as deliberately reserved? Route guard and RLS are present; only the module layer of rule 7 is missing. |
| **OG-58** | The live half of this measurement is outstanding because the executing machine cannot reach the database. Which machine runs the chain from here? |
| **OG-59** | `document_serial_counters` and `next_serial` — named in the M12 instruction — exist in **no** file in this repository. If they exist on the live server, that is migration drift and outranks M12. If they are names from another system, M12's serial half is `asan_export_numbers` as documented above. |

## What is NOT done, stated per A0.3

- **No live database query ran.** Not one.
- The two queries that close this document, to be run on the test computer:
  1. `SELECT pg_get_functiondef('public.asan_assign_document_number(text,uuid)'::regprocedure);`
     — confirm the live body still has no year term (A5.28: git may not match live).
  2. `SELECT DISTINCT module FROM public.role_permissions ORDER BY 1;`
     — confirm the live module set matches the 28 seeded here, and that
     `ledger-documents` is present.
  3. `SELECT to_regclass('public.document_serial_counters');` — settles OG-59.
- No e2e run. No typecheck (`node_modules` is empty; zero `src/` files changed).
- No independent review: A3.15 requires a fresh subagent and this session is directed not
  to spawn one. Self-review would not be independent and is not claimed as such.
- **Zero `src/` changes, zero migrations, zero data rows. Production not contacted.**
