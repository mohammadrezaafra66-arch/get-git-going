# M3 — BUILD FOUNDATION (codes, phone normalization, Asan → AfraKala import)

Read `docs/execution/ASAN_MISSION_CONTROL.md` first and obey every rule in it, including
section 1 on execution pace: one phase at a time, one migration per phase, commit after each,
query live state before every change.

Read `docs/asan/research-asan-bridge.md`. **This mission is built on those findings, not on
assumptions.** Where research says UNKNOWN, take the conservative path described below.

Five phases.

---

## Phase 3.0 — Formalize the Asan layout specification

Create `docs/asan/asan-layouts.md` as the single authoritative specification of every Asan
Excel layout. Source it from the appendix of `M2_RESEARCH.md` plus anything R1–R8 clarified.

For each layout record: screen name, tab or radio option, every column letter with its exact
header text, whether the column is mandatory, data type, format, and a **verification status**
of `VERIFIED` or `UNVERIFIED`.

Four layouts are `VERIFIED` because I captured each screen:
1. Sales tab (18 columns)
2. Purchase tab (18 columns)
3. Accounting document (6 columns) — **serves receipts, payments, and third-party documents**
4. Bank deposits `واریزیهای بانکی` (6 columns, Latin headers) — secondary path

Also create `docs/asan/UNVERIFIED-LAYOUTS.md` containing only:
- column K on the sales tab (blank in my screenshot; purchase has `پرداخت چک` there)
- the radio options I did not capture, marked known-but-deliberately-unbuilt
- any mapping decision M4 has to make without evidence

Each entry states exactly what screenshot or answer I must provide. Keep this file current
through M4 — it is one of the things I read at the end.

### Phase test
Both documents exist. Every layout has a verification status. The unverified list is a strict
subset and contains no layout marked VERIFIED.

**Commit before continuing.**

---

## Phase 3.1 — Asan code fields

Per R1, R2 and R5, add persistent Asan code fields for four entity types: **person, product,
bank account, and external party**.

External party is included because R5 asks whether external parties can carry an Asan code —
the accounting-document export needs `کد حساب` for `account_kind='external_party'` lines, and
the third-party (دوبل) case is exactly that. If R5 found the field already exists, extend it.

### Design constraints
- Follow the research recommendation for **where** the person code lives under the unified
  identity model. The Asan code is a property of the human being, not of their role — so if
  research says it belongs on `persons`, put it there and treat `customers.accounting_code`
  as a legacy mirror to backfill from, not a second source of truth.
- If R1 found `products.easy_code` already holds the Asan product code, **extend it**. Do not
  add a duplicate column. If it holds something else, add a clearly-named new column and
  document the difference.
- All new columns are **nullable**. An entity without an Asan code is a normal state, not an
  error. Only export enforces the requirement.
- Add a **partial unique index** on each code, scoped to non-null values, so two entities
  cannot claim the same code. Partial, because many rows will legitimately be null.

### Backfill
Backfill from `docs/asan/reference/` using the matching strategy R1/R2 measured as most
reliable. Only backfill matches you can defend: exact barcode for products, exact
`accounting_code` for persons. Ambiguous matches (one-to-many, or name-only) go to a review
queue, never into the column.

Report matched / ambiguous / unmatched counts per entity type.

### Phase test
- Each column exists, is nullable, has its partial unique index.
- Inserting a duplicate non-null code is rejected.
- Inserting two rows with NULL codes both succeed — proving the index is partial.
- Fill rate per column matches the backfill report.
- `docker restart afrakala-lan-rest`; the new columns are visible over PostgREST.

**Commit before continuing.**

---

## Phase 3.2 — Phone normalization

### The rule
Canonical stored format is **`09XXXXXXXXX`** — leading zero, Latin digits, no separators,
11 characters for mobile.

Normalization handles, per R2's findings: missing leading zero (`9123740712`), international
prefixes (`+98`, `0098`, `98`), spaces, dashes, parentheses, and Persian/Arabic-Indic digits.

Landlines have a different shape. Normalize to Latin digits with no separators, preserve the
area code, but do **not** force the 11-character mobile pattern onto them. R2 identified
which columns are which — respect that.

### Collision handling — firm decision
When two different person records normalize to the same number, the system **flags it and
stops**. It never merges automatically and never picks a winner.

Build a review queue:
- a table recording each collision: normalized number, conflicting entity ids, detection
  time, status (`pending` / `resolved` / `ignored`), resolver
- an admin page listing pending collisions with enough context to judge — names, roles, last
  activity, credit balance if any — and actions to resolve or ignore
- resolution records the decision but performs **no merge**. The existing `/persons/merge` UI
  remains the only merge path.

### Where normalization runs
Both places, and both are required:
1. **A trigger** on write, so any path — including a direct PostgREST `PATCH` — stores the
   canonical form. Rule 2.5: rules in triggers, not RPCs.
2. **A one-time backfill migration** for existing rows.

Global mobile uniqueness already exists from the identity model work. Normalization may cause
rows that previously differed to now collide. **Design the backfill so it can never fail on a
collision**: detect first, queue the colliding rows, then normalize only the non-colliding
ones. A migration that aborts halfway through a phone rewrite is a bad day.

### Phase test
- Unit level: feed every format from R2's frequency table through the normalizer, assert the
  canonical output. Include Persian digits.
- Trigger level: `INSERT` and `PATCH` a person via **direct PostgREST** with a messy number;
  assert the stored value is canonical. This proves the trigger, not the UI.
- Collision: create two colliding persons; assert both rows survive, a collision row appears
  with status `pending`, and no merge occurred (count persons before and after).
- Backfill: zero rows remain non-canonical; collision row count matches R2's prediction.
- Remove every test row created in this phase (rule 2.10).

**Commit before continuing.**

---

## Phase 3.3 — Import persons from Asan

### Input
An `.xlsx` shaped like `docs/asan/reference/اشخاص.xlsx`. Parse **by header text**, never by
column index — the files are RTL and column order is not guaranteed stable.

Mapping (confirm against R2 before hardcoding):
`کد حساب` → Asan person code · `نام حساب` → display name · mobile → normalized ·
landline → normalized · national id · address.

### Behaviour
- **Staging first.** Parse into a staging table, show a preview, commit only on explicit
  confirmation. If R3 found an existing staging-then-approve pattern, reuse it.
- Classify every row before commit: `new` (no match), `update` (matches by Asan code),
  `conflict` (matches by phone or name but the Asan code disagrees, or matches several
  persons).
- **Conflicts are never auto-resolved.** They go to the review queue from 3.2, or a parallel
  one — reuse rather than duplicate.
- Updates never silently overwrite. Show a field-level diff and let the user choose per field
  or per row. Default to **not overwriting a non-empty AfraKala value with an Asan value** —
  my data is often more current than Asan's.
- Import is **idempotent**: importing the same file twice produces zero changes the second
  time. Test this explicitly.
- Preserve scrambled text verbatim. Do not attempt repair.

### Where it lives
An admin route following the existing navigation registry pattern. **Seed `role_permissions`
for every role explicitly** — the `has_dynamic_permission` fallback opens unseeded modules to
everyone (rule 2.5).

Access: `admin` and `accountant` only.

### Phase test
- Import the real `اشخاص.xlsx` (488 accounts) into staging; assert the parsed row count.
- Classification counts match R2's predicted match rates.
- Commit, re-import the same file, assert **zero** changes.
- Phone numbers landed canonical.
- A `viewer` JWT gets 403 on the route and on the staging table over PostgREST.
- Remove all rows this test created.

**Commit before continuing.**

---

## Phase 3.4 — Import products from Asan

Same architecture as 3.3, for `docs/asan/reference/کالا.xlsx` (7256 products).

Mapping (confirm against R1): `کد کالا` → Asan product code · `شرح کالا` → name ·
barcode · serial · unit.

### Additional constraints
- 7256 rows is large enough that a naive row-by-row insert will be slow and may time out.
  Batch it and report the timing.
- Barcode is the strongest match key per R1. Where barcode matches, link. Where only the name
  matches, that is a `conflict`, not an `update`.
- **Do not create AfraKala products for unmatched Asan rows.** I have 374 products; Asan has
  7256. The overwhelming majority are not things I stock. Unmatched rows are recorded in
  staging as `unmatched` and not imported. Report the count.

  This deliberately differs from the person importer, where a new person is normal. Do not
  "improve" it by auto-creating products.

### Phase test
- Parse the real file; assert 7256 rows.
- Barcode match count equals R1's measurement.
- Commit, re-import, assert zero changes.
- **Assert the AfraKala product count did not grow.**
- Record the timing.
- Clean up.

---

## MISSION GATE

1. `npm run typecheck` → exactly 70.
2. Every new module has explicit `role_permissions` rows for every role — prove it with a
   query, do not assert from memory.
3. Everything committed. Tree clean.
4. Build, deploy, verify all three signals. `docker restart afrakala-lan-rest`.
5. Full e2e against baseline. New reds are yours.
6. New specs registered in `playwright.config.ts`:
   - `e2e/asan/phone-normalization.spec.ts`
   - `e2e/asan/import-persons.spec.ts`
   - `e2e/asan/import-products.spec.ts`
7. Update `docs/execution/asan-progress.md`.
8. **Immediately proceed to `docs/execution/M4_BUILD_EXPORT.md`.** Do not wait for me.
