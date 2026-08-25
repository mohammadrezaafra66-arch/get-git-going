# OG-60 — a fabricated table name, and the real hole found next to it

Two items. They are related only by how the second was found, and this document keeps them
apart on purpose.

- **Item 1 — close OG-60.** `document_audit_log` never existed. Documentation only.
- **Item 2 — `viewer_restricted` on `document_status_history`.** An **independent finding**,
  measured on its own evidence. **Not** a reconstruction of what OG-15 meant.

Migration: `supabase/migrations/20260826090000_392_viewer_restrict_document_status_history.sql`
Rollback:  `docs/verification/392-down.sql`

---

## Environment, proved first (v6 §STOP)

```
$ docker ps --format "{{.Names}}" | grep afrakala-lan
afrakala-lan-auth   afrakala-lan-web     afrakala-lan-caddy   afrakala-lan-db
afrakala-lan-kong   afrakala-lan-storage afrakala-lan-meta    afrakala-lan-rest

$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "select 1;"
 ?column?
----------
        1
```

Step 0 state sync:

```
$ git fetch origin && git log --oneline -3 origin/staging
20082d3b Merge pull request #350 from .../feature/m8-orphan-function-and-viewer-restricted
42a8d867 docs(m8): HANDOFF STATE for M8 — next is the security trio, OG-60 open
c380ec38 M8 — drop the orphan trigger function (OG-8), restrict the viewer on document_attachments

$ gh pr view 350 --json state,mergedAt
state: MERGED   mergedAt: 2026-08-25T19:12:07Z
```

Production `192.168.170.10` was not contacted at any point.

---

## ITEM 1 — OG-60 CLOSED. The name was fabricated.

`document_audit_log` was never a table, never dropped, never renamed, and is not schema drift.
The name originated in a **fabricated report on 2026-08-25** — the same session whose M5C
completion claim had no commit, no branch and no PR — and was then repeated, unverified, in
the owner's OG-15 answer. That is how it reached a mission brief as though it were a fact.

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "
    SELECT to_regclass('public.document_audit_log');"
 to_regclass
-------------
             (NULL)

$ ... -c "SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE c.relname ILIKE '%audit%' AND n.nspname NOT IN ('pg_catalog','information_schema');"
 auth   | audit_log_entries
 public | audit_logs
 public | bot_api_key_audit_log
 (no document_audit_log, in any schema, of any relkind)

$ grep -rn "document_audit_log" . --exclude-dir=.git --exclude-dir=node_modules
docs/execution/00-progress.md:413:  ... the line recording the owner's OG-15 answer ...
(nothing else — no migration, no src/, no other document)
```

**This is the SECOND fabricated object name to propagate this way.** The first was
`document_serial_counters` / `next_serial`, which reached a mission brief the same way, was
grepped to zero hits, and was closed as **OG-59** — also with `to_regclass` returning NULL.

Both times the correct behaviour was the same and it is what **A0.9** exists for: a fact you
were handed that cannot be located in the repository or the database is recorded as `[U]` and
asked about, never built on. Guessing a "real" `document_audit_log` here would have been the
same error a third time, with write consequences.

**CLOSED — the name was fabricated, no drift, no missing table, nothing owed on that name.**
Cross-reference **OG-59** and **A0.9**.

### What this means for OG-15

OG-15 named two tables. One was real and is done (migration 391). The other never existed.
So OG-15 is fully discharged, and the honest accounting is:

| OG-15 named | reality | disposition |
|---|---|---|
| `document_attachments` | real | `viewer_restricted` applied by migration **391** |
| `document_audit_log` | **never existed** | nothing owed — OG-60 |

`audit_logs`, the plausible-looking candidate, **already carries `viewer_restricted`** and is
owed nothing either — verified in the 91-table census below. No table is left uncovered by
OG-15's actual intent, whatever that intent was.

---

## ITEM 2 — `document_status_history`, found on its own evidence

**Stated once, plainly, and repeated in the migration header: this table was NOT chosen as a
guess at what `document_audit_log` meant.** No such reconstruction was attempted. It was
chosen because its policies, read live, showed a present-day hole.

### The mandatory capture, before any decision

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "
    SELECT policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname='public' AND tablename='document_status_history'
    ORDER BY policyname;"

 policyname                          | permissive | roles    | cmd    | qual / with_check
-------------------------------------+------------+----------+--------+------------------
 insert document history             | PERMISSIVE | {public} | INSERT | with_check: ((changed_by = auth.uid()) OR (changed_by IS NULL))
 see history of accessible documents | PERMISSIVE | {public} | SELECT | qual: EXISTS (SELECT 1 FROM documents d
                                     |            |          |        |   WHERE d.id = document_status_history.document_id
                                     |            |          |        |     AND (d.uploaded_by = auth.uid()
                                     |            |          |        |          OR has_role(auth.uid(),'admin')
                                     |            |          |        |          OR has_role(auth.uid(),'manager')))
(2 rows)
```

**No `viewer_restricted`.** So the "already there" outcome the brief asked me to check for
does not apply — but it did apply to `audit_logs`, and that is recorded above.

Structure that shaped the probe:

```
document_status_history : RLS enabled, not forced, owner supabase_admin, 0 rows
documents               : RLS enabled, not forced, owner supabase_admin, 0 rows
FK  document_id  -> documents(id) ON DELETE CASCADE
FK  changed_by   -> auth.users(id)
triggers on document_status_history: none
```

Both tables are empty, so a row-count measurement would have been vacuous — a policy closing
the table for *everyone* would look identical to one closing it for the viewer. The probe
therefore inserts a `documents` row **uploaded by the viewer-only account**, because the whole
question is whether the policy's `d.uploaded_by = auth.uid()` branch is a live path for that
role or only a theoretical one.

### BEFORE — and it is a real hole, on BOTH read and write

Probe accounts re-verified first (A7.43 — the owner edits roles in parallel):

```
 90c0479f | accountant | is_viewer_only f | in auth.users t
 05098088 | admin      | is_viewer_only f | in auth.users t
 a0a4afe5 | manager    | is_viewer_only f | in auth.users t
 00ebe9d3 | sales      | is_viewer_only f | in auth.users t
 20303d30 | viewer     | is_viewer_only t | in auth.users t
```

Then, inside `BEGIN … ROLLBACK`:

| role | `is_viewer_only` | history rows | documents rows |
|---|---|---|---|
| **viewer-only `20303d30`** (uploader) | `t` | **1** | 1 |
| admin `05098088` | `f` | 1 | 1 |
| accountant `90c0479f` | `f` | **0** | 1 |
| manager `a0a4afe5` | `f` | 1 | 1 |
| sales `00ebe9d3` | `f` | 0 | 0 |

```
--- can the viewer-only account also WRITE history today? ---
INSERT 0 1
   viewer_write_result
-------------------------
 viewer INSERT SUCCEEDED
```

**Two live paths for a role that should have neither.** A viewer-only account could **read**
the status history of any document it uploaded, and **write** rows into that history at will —
the INSERT policy is `{public}` and checks only that `changed_by` is the caller's own uid or
NULL. On an audit trail the write is arguably the worse of the two: it lets a read-only role
author the record of who changed what.

**This is the difference from migration 391.** M8's item 2 turned out to be defence in depth —
the viewer already read nothing from `document_attachments`, and saying so was the correct
report. **This one removes real, measured access**, and `FOR ALL` is what closes both halves
in one policy. That is precisely why the house pattern is `FOR ALL` and not `FOR SELECT`.

Noted and deliberately left alone: `accountant` reads the parent `documents` row but **0**
history rows — the history policy admits only uploader/admin/manager. That asymmetry predates
this work; the gate pins it as *unchanged* rather than "fixing" it.

### The pattern was copied, not invented (A1.5)

```
$ ... -c "SELECT qual, count(*) FROM pg_policies WHERE policyname ILIKE '%viewer_restricted%' GROUP BY qual;"
               qual               | n_tables
----------------------------------+----------
 (NOT is_viewer_only(auth.uid())) |       91
```

All 91 identical: `AS RESTRICTIVE`, `FOR ALL`, `TO authenticated`, `USING` **and** `WITH CHECK`
both `(NOT is_viewer_only(auth.uid()))`. Migration 281 established the executable form; 391 is
the most recent copy; 392 matches both. `is_viewer_only` is true only when `viewer` is the
user's **sole** role, so this cannot blind the owner's own multi-role account.

---

## Rollback before forward (A5.28), and the dry run

`docs/verification/392-down.sql` was written **first**, from the captured live policy set, and
carries an explicit warning about what rolling back restores (a measured live read *and* write
path). Dry run — forward, rollback, compare — inside one explicit `BEGIN … ROLLBACK`
(A5.26: **never** `--single-transaction` for a reverting probe):

```
=================== POLICIES BEFORE ===================
 insert document history             | PERMISSIVE | INSERT
 see history of accessible documents | PERMISSIVE | SELECT

=================== POLICIES AFTER FORWARD ===================
 insert document history             | PERMISSIVE  | INSERT
 see history of accessible documents | PERMISSIVE  | SELECT
 viewer_restricted                   | RESTRICTIVE | ALL

=================== POLICIES AFTER ROLLBACK (must be the original 2) ===================
 insert document history             | PERMISSIVE | {public} | INSERT | has_qual f | has_check t
 see history of accessible documents | PERMISSIVE | {public} | SELECT | has_qual t | has_check f

=================== POST-ROLLBACK: LIVE DB UNCHANGED ===================
 policy_count_live 2 | viewer_restricted_live 0 | history_rows 0 | documents_rows 0 | payment_receipts 10
```

Both original policies came back with their exact shapes, and the live database was untouched.

---

## The gate, and attacking it

**ONE gate** (A2.9) with checks `A` vacuity guards → `B` policy shape → `C` predicate against a
**live reference copy** → `D` closed half (read **and** write) → `E` open half + unchanged half.

The predicate is compared to `payment_receipts.viewer_restricted` fetched in the same session,
never to a hardcoded string: `pg_policies` renders through `search_path`, printing `uid()` under
`supabase_admin` and `auth.uid()` under `postgres`. A literal comparison would pass or fail
depending on *who ran the migration*. **Migration 391's dry run caught exactly that bug in its
own gate**; 392 is written with the correction from the start rather than discovering it again.

### Eight disturbances, all defeated, each at the intended check — plus a control

```
[PASS]     control — the gate accepts the correct change (not simply always-red)
           392 OK: ... viewer-only now reads 0 rows (was 1) and its INSERT is DENIED
           (it SUCCEEDED before); admin 1, manager 1 still read the row; accountant 0, sales 0

[DEFEATED] D1 closed-for-everyone (USING false)                          -> FAILED C
[DEFEATED] D2 reads right, does nothing (... OR true)                    -> FAILED C
[DEFEATED] D3 PERMISSIVE instead of RESTRICTIVE                          -> FAILED B
[DEFEATED] D4 USING without WITH CHECK (viewer INSERT left open)         -> FAILED C
[DEFEATED] D5 FOR SELECT instead of FOR ALL (write left open)            -> FAILED B
[DEFEATED] D6 not done at all (no policy)                                -> FAILED B
[DEFEATED] D7 perfect policy + 2nd restrictive policy emptying the table -> FAILED E  (behavioural)
[DEFEATED] D8 is_viewer_only neutered to always-false                    -> FAILED A  (vacuity guard)
```

D7 and D8 are the two that matter most and both were added deliberately:

- **D7** passes every structural check with a flawless `viewer_restricted`, while a second
  restrictive policy empties the table for every role. Only the behavioural half sees it —
  `392 FAILED E: the probe history row is invisible to admin (0) or manager (0)`. A gate whose
  disturbances are all caught on *shape* has not proved its behavioural half works.
- **D8** neuters `is_viewer_only` so the closed half would pass for the wrong reason. The
  vacuity guard caught it first: `392 FAILED A: probe account 20303d30… is no longer
  viewer-only, so the closed half of this gate cannot speak.`

---

## Apply, and the AFTER state measured from the live surface

```
$ psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f 392_forward.sql
SET / DO / DROP POLICY / CREATE POLICY / DO
NOTICE:  392 OK: document_status_history carries viewer_restricted matching the house pattern
field for field ... viewer-only now reads 0 rows (was 1) and its INSERT is DENIED (it SUCCEEDED
before); admin 1, manager 1 still read the row; accountant 0 and sales 0 unchanged.
=== exit: 0 ===

$ docker restart afrakala-lan-rest          # A5.29
afrakala-lan-rest    Up
```

`--single-transaction` is correct for the forward apply; A5.26 forbids it only for reverting
probes.

Then re-measured **from the live surface**, not from the migration's own output:

| role | history rows BEFORE | history rows AFTER | |
|---|---|---|---|
| **viewer-only `20303d30`** | **1** | **0** | closed |
| admin `05098088` | 1 | 1 | unchanged |
| accountant `90c0479f` | 0 | 0 | unchanged |
| manager `a0a4afe5` | 1 | 1 | unchanged |
| sales `00ebe9d3` | 0 | 0 | unchanged |

```
--- AFTER: can the viewer-only account still WRITE history? ---
ERROR:  new row violates row-level security policy "viewer_restricted"
        for table "document_status_history"
```

The write is denied **by policy name**. Before this migration the same statement returned
`INSERT 0 1`.

The viewer still reads its own parent `documents` row (`documents_rows` = 1) — correct and
deliberate. This migration touches `document_status_history` only; narrowing `documents` was
not in scope and was not done.

---

## Regression — full e2e, because this mission changed database privileges (A4.16)

### Health pre-check (A4.18) — and the first reading FAILED

```
(a) CPU busy %  : 27      <-- OVER the ~25 threshold. The run was NOT started on this.
(b) chrome-headless-shell : 0
(c) /login       : 200 in 0.07s
```

**The run was not started on that reading.** A single `Win32_PerfFormattedData` sample is one
instantaneous tick and the machine was mid-`docker`/`psql` work from this very mission, so it
was re-measured properly with a 20-sample averaged counter while otherwise idle:

```
mean   : 20.2%
median : 17.5%
max    : 38.8%      (transient spikes)
free RAM: 67.4 GiB of 127.7 GiB
```

Mean **20.2%** and median 17.5% are below the threshold, and cleaner than the conditions the
recorded 30-failure baseline itself was taken under (`host CPU: 22%`, `RAM free 66.2 GiB`).
Both readings are recorded here rather than only the convenient one.

**On the orphan-browser watch:** two `python.exe` processes were present, but they are
`-m http.server 8765 --bind 127.0.0.1` — **not** the `uvicorn`-on-8001 server named as the
historical source of orphan shells. They consume no measurable CPU and were left alone: they
belong to another project and killing them was neither necessary nor mine to do.
`chrome-headless-shell` was **0** before and **0** after.

### The run — locked (A4.20)

The migration was applied and PostgREST restarted **before** the run. No build, container
restart, migration or browser session touched the machine from start to finish.

```
$ npx playwright test --reporter=list      # full output to a file, never tailed (A4.21)
start: 19:28:26Z
  29 failed
  29 skipped
  536 passed (20.8m)
exit=1  end: 19:49:17Z
```

`exit=1` means failures, not `124` (timeout). **20.8 minutes** — under the 46.6-minute clean
reference and far under A4.19's 95-minute ceiling.

Cross-check independent of the summary line (A4.21): `ok` markers **536**, `x` markers **29**.
Both agree. 536 + 29 + 29 = **594**, the full discovered set.

### SET comparison, both directions (A4.22)

```
=== vs the recorded 30-BASELINE ===
  in baseline, NOT failing now (closed):   persons/duplicate-mobile-blocked:59
  NEW, not in baseline:                    (none)

=== vs M8's run (the immediately preceding run) ===
  failing in M8 but not now:               (none)
  failing now but not in M8:               (none)
  identical to M8's set:                   True
```

**Zero new failures.** The failing set is byte-identical to M8's run and a strict subset of the
recorded baseline.

The single difference from the baseline is `persons/duplicate-mobile-blocked:59`, which the
baseline document itself records as a **UI race** (`locator.click: Timeout` — the «افزودن»
button detaches mid-click then goes `disabled`), newly appeared and not attributable to the
work that recorded it. It has now passed in **two consecutive runs** (M8's and this one), which
strengthens the flake reading rather than suggesting anything was fixed — this mission touched
no spec file and no UI code.

**The baseline is deliberately NOT superseded** (A4.23): supersession is for a mission that
changes the harness on purpose. This one changed no spec. The authoritative baseline remains
the recorded 30-failure set, and a run of 29 with a strict-subset set is a pass against it.

### Data (A4.17 — e2e specs are not read-only)

```
payment_receipts        : 10 before, 10 after
document_status_history :  0 before,  0 after     (every probe row rolled back)
documents               :  0 before,  0 after
viewer_restricted on document_status_history: still present after the run
```

### Post-run (A4.24)

```
chrome-headless-shell : 0 before, 0 after   -- no orphans left behind
CPU mean              : 22.8%
```

---

## typecheck (A7.39)

```
$ npx tsc --noEmit | grep -c "error TS"
70

files: src/lib/accounting/functions.ts, src/lib/audit/index.ts, src/lib/invoices/functions.ts,
       src/routes/_app.admin.automation.tsx, src/routes/_app.admin.sales-reminders.tsx,
       src/routes/_app.products.index.tsx
```

**Exactly 70 across exactly the 6 known files** — the baseline is unmoved.

## Build

**Not required and not run.** `git status --porcelain src/` is empty — zero `src/` files
changed, so A7.40's rebuild condition is not met. The container's `APP_GIT_SHA` has no reason
to move.

---

## Delivery report

**Files inspected (live, not from git):** `pg_policies`, `pg_class`, `pg_constraint`,
`pg_attribute`, `pg_trigger`, `pg_proc`, `user_roles`, `auth.users`, and the bodies of
`is_viewer_only` and the 91-table `viewer_restricted` census; in the repository, migrations 281,
391 and `docs/verification/391-down.sql` for the executable form and gate style.

**Files changed:**

| File | Why |
|---|---|
| `supabase/migrations/20260826090000_392_….sql` | the one policy and its single two-sided gate |
| `docs/verification/392-down.sql` | rollback, written first, from live captured state |
| `docs/research/og60-status-history.md` | this file |
| `docs/execution/00-progress.md` | OG-60 CLOSED, OG-15 CLOSED |
| `docs/execution/chained-execution-PROGRESS.md` | HANDOFF STATE |

**Migration impact:** one migration, 392, applied to the `afrakala` test database;
`docker restart afrakala-lan-rest` afterwards (A5.29). Not inserted into
`supabase_migrations.schema_migrations` — 388/389/390/391 are all absent from it, so 392
follows the existing convention. Reconciling that ledger remains v6 Phase 4's item.

**RLS/RBAC impact:** one new RESTRICTIVE policy on `public.document_status_history`. No
existing policy altered, no grant changed, no role changed. Net effect: a viewer-only account
loses a measured read path **and** a measured write path; the other four roles are unchanged
row for row.

**Audit log impact:** none. No data row was inserted, updated or deleted — every probe row
lived only inside a transaction that ended in `ROLLBACK`.

**Manual test path:** sign in as a viewer-only account, upload a document, and open its status
history — before 392 the history was readable and writable by that account; after 392 the read
returns nothing and the write is refused by RLS. Cannot be exercised on current data because
both tables are empty; the gate's behavioural probe covers it instead.

**Remaining risks:**
- `persons/duplicate-mobile-blocked:59` is a live UI race that can flake either way. It has
  passed twice running and is still in the recorded baseline; nothing in this mission touches it.
- `accountant` still reads the parent `documents` row but no history. That asymmetry predates
  this work and was pinned as *unchanged* rather than altered — if it is wrong, it is a separate
  decision.
- The `insert document history` policy remains `{public}` with only a `changed_by` check. It is
  now fenced by `viewer_restricted` for viewer-only accounts, but every other authenticated
  role can still write history rows. Narrowing that is outside this mission's scope.

**Self-Host Acceptance Check:** no CDN, no online font, no external API, no non-self-hostable
service. The change is one `CREATE POLICY` in PostgreSQL.

**production لمس نشد** — `192.168.170.10` was not contacted at any point.
