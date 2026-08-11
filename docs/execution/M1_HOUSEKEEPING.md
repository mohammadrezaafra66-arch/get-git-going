# M1 — HOUSEKEEPING AND OWNER FINDINGS

Read `docs/execution/ASAN_MISSION_CONTROL.md` first and obey every rule in it, including
section 1 on execution pace: one phase at a time, commit after each, verify every write.

This mission is **build** type. Six phases. Goal: clear every outstanding owner finding so
the Asan work starts on a clean tree.

---

## Phase 1.1 — Repair every corrupted Persian label in the database

### Background
On 2026-07-11 a PowerShell pipe transcoded Persian text into `?` characters across roughly
460 configuration values and 43 function bodies. Some were repaired; many were not. One known
survivor is `gamification_kpis.deals_registered.label_fa`, currently `??????`.

I am not handing you a list. **Find them all yourself and fix them all yourself.**

### Step 1 — Discover
Write an ASCII-only SQL script that scans **every text/varchar column in every table in
schema `public`** for corrupted values. A value is corrupted when it matches any of:
- contains a `?` run of length ≥ 2
- consists only of `?`, whitespace and punctuation
- contains the Unicode replacement character `U+FFFD`

Generate the scan dynamically from `information_schema.columns` — do not hand-list tables.
Write the result to `docs/asan/corrupted-labels-scan.md` with columns:
`table | column | primary key value | current value | row context`.

"Row context" means one or two neighbouring columns that identify the row in human terms —
a `code`, `key`, `slug`, `name`, or `module`. Include it; it is what makes repair possible.

### Step 2 — Classify
Split findings into three buckets in the same document:

- **A — Inferable from the row.** The correct Persian is unambiguous from context. Example:
  `gamification_kpis` where `code='deals_registered'` → `معاملات ثبت‌شده`. Or a
  `payment_terms` row with `days=30` → `تسویه ۳۰ روزه`.
- **B — Inferable from code.** Not obvious from the row, but the same string appears in the
  TypeScript source (a label map, an enum translation, a constant). Grep for the key.
- **C — Not inferable.** Neither row nor code reveals the original meaning.

### Step 3 — Repair A and B
Fix every A and B value. Use your own judgement for wording — I am explicitly delegating this.
Follow the project's Persian style: concise, no trailing punctuation, ZWNJ where orthography
requires it (`ثبت‌شده` not `ثبت شده`).

Write UPDATE statements to a `.sql` file, `docker cp` it in, run with `psql -f`. Never pipe.
Then read every repaired value back and assert zero `?` characters (rule 2.1).

Also check function bodies: run `pg_get_functiondef` across all functions in `public`, find
Persian error messages containing `?` runs, and repair them — snapshotting the live
definition first per rule 2.3.

### Step 4 — Report C
Leave bucket C untouched. List it under a heading `## NEEDS OWNER INPUT` with, for each row,
the table, the key, your best guess, and why you are not confident. I will fill these in.

### Phase test
Re-run the discovery scan. Assert zero rows remain in buckets A and B. Print the bucket C
count. Round-trip a sample of repaired values and confirm zero `?` — this proves the write
path did not re-corrupt them.

**Commit this phase before continuing.**

---

## Phase 1.2 — Remove the legacy capital allocation path completely

### Decision
Delete it completely. The live system runs the dynamic capital path. The legacy path is a
second, divergent implementation and must not survive.

### Step 1 — Map the blast radius (read-only first)
Find every reference to the legacy capital system. Start from
`salesperson_capital_allocations` and `customer_capital_allocations` (the ones **without**
the `_dynamic` suffix) and expand outward: tables, columns, foreign keys, indexes,
constraints, functions, triggers, views, RLS policies, TypeScript imports, hooks, routes,
components, navigation registry entries, `role_permissions` module rows, e2e specs.

Write the map to `docs/asan/legacy-capital-removal-plan.md` before changing anything.

### Step 2 — Back up any live data
Count rows in each legacy table. If any has rows, dump them to
`docs/asan/legacy-capital-data-backup.sql` (`pg_dump --data-only --table=...` inside the
container, then `docker cp` out) **before** dropping. Data is never destroyed without a
backup on disk.

### Step 3 — Remove
One migration: drop dependent views, triggers and functions first, then the tables; remove
the legacy `role_permissions` rows; remove navigation entries. Then remove the frontend
routes, components and hooks, and any import that now dangles. If a component is shared with
the dynamic path, keep the component and remove only the legacy call site.

If Step 1 reveals that something in the **live financial chain** still depends on the legacy
path, do not drop it. Record the dependency under `## BLOCKED` in the plan document and move
on. Financial correctness beats completing a cleanup.

### Phase test
- Legacy tables absent from `information_schema.tables`.
- Grep `src/` for the legacy identifiers: zero hits.
- `e2e/capital/no-override.spec.ts` still green — the dynamic path still computes.

**Commit this phase before continuing.**

---

## Phase 1.3 — Restrict the `viewer` role

### Decision
Anyone with the `viewer` role must **not** see:
- phone numbers (mobile and landline)
- addresses
- invoices, pre-invoices, sales documents
- any financial information: credit, balances, receivables, payments, capital, margins,
  and any price they are not already entitled to

They may see: names, product listings, and aggregate statistics.

### Step 1 — Find every path
Three enforcement layers must agree:
1. **RLS policies** on `persons`, `person_identifiers`, `customers`, `sales_quotes`,
   `payment_receipts`, `customer_credit_balance`, `journal_entries`, and anything the scan
   turns up.
2. **`role_permissions`** rows for `viewer` across all modules.
3. **Frontend guards** — route guards and conditional rendering.

Enumerate all three into `docs/asan/viewer-restriction-plan.md`. Remember the
`has_dynamic_permission` fallback (rule 2.5): a module with no row is open to everyone.
Seed `viewer` rows for every module explicitly rather than relying on absence.

### Step 2 — Implement
Tighten at the **RLS layer** first — it is the only layer a direct PostgREST call cannot
bypass. Frontend changes are reinforcement, not the control.

For `persons`, the existing `can_read_person(uuid)` SECURITY DEFINER function (migration 264)
is already the single source of truth for three policies. **Extend that function** rather
than adding a fourth parallel policy.

### Step 3 — Identify affected users
List the accounts currently holding `viewer` (id, email, display name) in the plan document.
Do not change role assignments — only what the role can see.

### Phase test — with a real JWT, not the UI
1. Log in as `test.viewer@afrakala.local` (`AfraTest!1404`) via
   `http://localhost:9000/auth/v1/token?grant_type=password`.
2. With that JWT call PostgREST **directly** for each restricted resource: `persons`
   (selecting mobile, national id, iban), `person_identifiers`, `sales_quotes`,
   `payment_receipts`, `customer_credit_balance`.
3. Assert each returns zero rows or omits the sensitive columns. **Count rows** — never trust
   a status code (rule 2.5).
4. Assert the same JWT still returns product listings and aggregate stats — you restricted,
   not locked out.
5. Assert `test.sales@afrakala.local` is unaffected.

Write `e2e/security/viewer-restrictions.spec.ts` and register it in `playwright.config.ts`.

**Commit this phase before continuing.**

---

## Phase 1.4 — Clean the repository

### Delete
- `homemarkett-checklist.xlsx`
- `homemarkett_audit_dashboard.html`
- any unrelated image at the repo root
- any other stray artefact at the repo root

Judge "stray" as: a root-level file that is not a config file, not referenced by build
tooling, not imported by any source file, and not documentation of this project. List
everything you delete in the progress file.

### Rename and relocate
- `docs/research/New Text Document.txt` → `docs/research/exec-prompt-194-209.md`
- Move misplaced files where they belong: documentation under `docs/`, verification
  artefacts under `docs/verification/`, execution prompts under `docs/execution/`, research
  under `docs/research/`, Asan material under `docs/asan/`.

### The two Asan Excel files
`اشخاص.xlsx` and `کالا.xlsx` at the repo root are real reference data, not stray. Move them
to `docs/asan/reference/` and keep them tracked. Later missions read them from there — record
the new path in the progress file.

### .gitignore
Add `.claude/` if absent. Review for other obvious omissions (local env files, editor
directories, build output). Do not ignore anything currently tracked without saying so.

### Phase test
- `git status --porcelain` clean after commit.
- Typecheck still exactly 70 — no source file imports a path you moved or deleted.
- Both Asan reference files exist at the new path and open with openpyxl.

**Commit this phase before continuing.**

---

## Phase 1.5 — Add the commit guard to build.ps1

`deploy/lan/docker-compose.yml` builds from `context: ../..`, so uncommitted working tree
code ships live while `APP_GIT_SHA` reports the last commit. This caused requirement-219 work
to run live for months while I believed it was disabled.

Add at the top of `deploy/lan/build.ps1`, before any docker command:

```powershell
param([switch]$Force)

$dirty = git status --porcelain
if ($dirty -and -not $Force) {
    Write-Host "Working tree is not clean." -ForegroundColor Red
    git status --short
    Write-Host "Commit them first, or re-run with -Force to deploy anyway."
    exit 1
}
```

Preserve everything the script already does. Apply the same guard to `up.ps1` if it also
triggers a build.

### Phase test
- Dirty tree (create a scratch file) → script exits non-zero with the message. Delete the
  scratch file.
- `-Force` → proceeds.
- Clean tree → proceeds.
Do not actually deploy during this test; stub or dry-run the docker step.

**Commit this phase before continuing.**

---

## Phase 1.6 — Restore the emergency admin account

`afra-admin@local.test` was temporarily activated for a previous test harness. Restore it:
`status='inactive'`, `is_active=false`.

First confirm the current e2e harness does not depend on it. If it does, repoint the harness
at a proper test account, then restore.

### Phase test
Assert the account cannot log in. Full suite health is covered by the mission gate.

---

## MISSION GATE

1. `npm run typecheck` → exactly 70. Above 70 is a regression; fix it.
2. Everything committed. Tree clean.
3. Build and deploy per rule 2.8. Verify all three signals match `HEAD`.
4. `docker restart afrakala-lan-rest`.
5. Full e2e suite against baseline 155/6/4. Documented reds and the one flaky may persist.
   Any new red is yours.
6. Update `docs/execution/asan-progress.md` with results and HANDOFF STATE.
7. **Immediately proceed to `docs/execution/M2_RESEARCH.md`.** Do not wait for me.
