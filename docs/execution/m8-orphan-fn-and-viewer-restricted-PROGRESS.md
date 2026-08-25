# M8 — drop the orphan trigger function, and restrict the viewer on document attachments

Mission 3 of the chained execution (v6). Scope was defined by the owner on 2026-08-25 after
two sessions failed to find M8's text in the repository; per A2.6 the definition was asked
for rather than guessed. **Exactly two items, and this file does not widen them.**

- **Item 1 — OG-8:** drop the orphan trigger function `trg_post_receipt_on_approve()`.
- **Item 2 — OG-15:** apply `viewer_restricted` to `document_attachments` and
  `document_audit_log`.

Migration: `supabase/migrations/20260825180000_391_drop_orphan_receipt_fn_and_viewer_restrict_attachments.sql`
Rollback:  `docs/verification/391-down.sql`

---

## Environment, proved before anything else (v6 §STOP)

```
$ docker ps --format "{{.Names}}" | grep afrakala-lan
afrakala-lan-auth   afrakala-lan-web    afrakala-lan-caddy   afrakala-lan-db
afrakala-lan-kong   afrakala-lan-storage afrakala-lan-meta   afrakala-lan-rest

$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "select 1;"
 ?column?
----------
        1
```

Database `afrakala`, never `postgres` (A5.29). DDL executed as `supabase_admin`; reads as
`postgres`. Production `192.168.170.10` was not contacted in any way.

---

## Phase 0 — measurement, and the premise that had to be corrected

### The chain document was wrong about what this object IS, and the owner corrected it

Three revisions of the chain document called `trg_post_receipt_on_approve` a **trigger** and
instructed the agent to prove it dead with `pg_get_triggerdef`. It is a trigger **function**:

```
$ ... -c "SELECT p.oid, p.proname, p.prorettype::regtype AS returns, p.prosecdef, p.provolatile
          FROM pg_proc p ... WHERE p.proname = 'trg_post_receipt_on_approve';"
  oid  |           proname           | returns | security_definer | provolatile
-------+-----------------------------+---------+------------------+-------------
 49318 | trg_post_receipt_on_approve | trigger | t                | v
(1 row)

$ ... -c "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname = 'trg_post_receipt_on_approve';"
(0 rows)
```

So `pg_get_triggerdef` had nothing to prove and `pg_get_functiondef` was the right
instrument. Its trigger was `trg_payment_receipts_post_journal`, dropped by migration 336.

### Item 1 — zero callers, in four independent directions

Every one returned zero rows:

```
triggers whose tgfoid is this function .............. 0 rows
other pg_proc bodies naming it (prosrc ILIKE) ....... 0 rows
pg_depend entries referencing it .................... 0 rows
references in src/ .................................. 0   (whole-tree grep)
```

The whole-tree grep's only migration hits are the migration that **created** it
(`20260505120710_…`) and **336**, which orphaned it. Everything else is prose in `docs/`,
two binary backups, the unreliable `schema_full_export.sql` (A5.28), and
`docs/verification/336-down.sql` — see the ordering warning below.

### It is not merely orphaned. It is broken.

```
$ ... -c "SELECT p.oid::regprocedure FROM pg_proc p ... WHERE p.proname='post_receipt_journal';"
(0 rows)

$ ... -c "BEGIN; SELECT public.trg_post_receipt_on_approve(); ROLLBACK;"
ERROR:  trigger functions can only be called as triggers
```

Its body calls `public.post_receipt_journal(NEW.id)`, which migration 336 **also** dropped.
The function could not work even if re-attached — it would fail at runtime.
`phase-1-GATE-A.md` called it *a loaded gun*; this is what it meant. Dropping it also
removes one more anon-executable SECURITY DEFINER function (its acl carried
`anon=X`), which is the door class OG-31 is about.

### An interaction worth recording before it bites someone

`docs/verification/336-down.sql` recreates
`trg_payment_receipts_post_journal … EXECUTE FUNCTION trg_post_receipt_on_approve()`. After
391 that function is gone, so 336-down would fail with `42883`. **If both are ever rolled
back, `391-down.sql` must run first.** That warning is written into the rollback file itself,
not only here.

### Item 2 — the pattern was read from the database, not invented (A1.5)

```
$ ... -c "SELECT qual, count(*) FROM pg_policies WHERE policyname ILIKE '%viewer_restricted%' GROUP BY qual;"
               qual               | n_tables
----------------------------------+----------
 (NOT is_viewer_only(auth.uid())) |       91
```

All 91 are identical: `AS RESTRICTIVE`, `FOR ALL`, `TO authenticated`, `USING` **and**
`WITH CHECK` both `(NOT is_viewer_only(auth.uid()))`. Migration 281 established it.
`document_attachments` was not among them. `is_viewer_only` is true only when `viewer` is the
user's **sole** role — roles are additive everywhere else in this system.

### What Item 2 actually changes — measured, and it is less than the mission text implies

`document_attachments` holds **zero rows**. On an empty table a policy that closed it for
*everyone* is indistinguishable from one that closed it for the viewer alone, so the
before-state was measured on a probe row inserted and then rolled back:

| role | `is_viewer_only` | rows visible BEFORE |
|---|---|---|
| viewer-only `20303d30` | `t` | **0** |
| sales `00ebe9d3` | `f` | **0** |
| admin `05098088` | `f` | 1 |
| accountant `90c0479f` | `f` | 1 |
| manager `a0a4afe5` | `f` | 1 |

**The viewer already read nothing**, because the existing permissive
`document_attachments_select` admits only admin/accountant/manager. This migration therefore
does **not** take away access the viewer has today, and neither the migration header nor this
file claims it does. What it adds is the two things the permissive policy cannot give:

1. **`FOR ALL`** — INSERT/UPDATE/DELETE are covered, where the only existing guards were a
   permissive INSERT check and an admin-only DELETE.
2. **Restrictive semantics** — a permissive policy added later cannot widen it back open.
   Today one permissive SELECT policy is the only thing between a viewer-only account and
   financial attachments (receipt images carrying amounts and account numbers).

The probe insert is validated by a trigger, not an FK: `validate_document_attachment_ref()`
requires `document_id` to exist in `payment_receipts` for `document_type='receipt'`. The first
probe attempt failed on exactly that and was corrected with a real receipt id — recorded
because it is the kind of detail that gets silently worked around.

### The second table does not exist → OG-60

`document_audit_log` is not a relation of any kind in any schema, and appears nowhere in the
repository except the line in `00-progress.md` recording the owner's OG-15 answer. Per **A0.9**
no substitution was made. Raised as **OG-60** with candidates listed as candidates only.
Item 2 is therefore **CONDITIONAL** on OG-60 (A2.7): the unambiguous half applied, the
ambiguous half not invented.

---

## Rollback before forward (A5.28), and the dry run

`docs/verification/391-down.sql` was written **before** the forward migration, from the live
captured body (via `docker cp`, never a pipe) and the live captured acl. Dry run applied
forward, then rollback, then compared field by field — all inside one explicit
`BEGIN … ROLLBACK` (A5.26: **never** `--single-transaction` for a reverting probe):

```
=================== STATE AFTER FORWARD ===================
 fn_exists | policy_count
-----------+--------------
 f         |            1

=================== STATE AFTER ROLLBACK ===================
 fn_exists | policy_count
-----------+--------------
 t         |            0

--- body restored byte-for-byte? (must be t) ---   t
--- acl restored? (compared as a SET) ---          t
--- document_attachments policies ---              the original 3, all PERMISSIVE

=================== POST-ROLLBACK: LIVE DB UNCHANGED ===================
 fn_exists_live | policy_count_live | attachment_rows_live | payment_receipts_live
 t              |                 0 |                    0 |                    10
```

---

## The gate, and what attacking it found

**ONE gate covering both items** (A2.9), two-sided in both halves. Checks: `A0` vacuity
guards (table exists, RLS actually enabled, `is_viewer_only` exists, the probe users still
hold the roles the gate assumes, `payment_receipts` non-empty); `A` the function is gone;
`B` the **live** `post_receipt_accounting(uuid,uuid)` survived; `C` the policy matches the
house pattern field by field; `D` behavioural, on a probe row, both directions.

### The dry run caught a real bug in the gate before it shipped

The first version compared `pg_policies.qual` against the literal string
`'(NOT is_viewer_only(auth.uid()))'`. That failed:

```
391 FAILED C: viewer_restricted predicate is USING (NOT is_viewer_only(uid())) ...
```

`pg_policies` renders the expression through the **current `search_path`**: as
`supabase_admin` it prints `uid()`, as `postgres` it prints `auth.uid()` — the same policy,
two spellings. A literal comparison would therefore have passed or failed depending on *who
ran the migration*, which is no assertion at all. Fixed by comparing against a **live
reference copy** of the same policy (`payment_receipts.viewer_restricted`) rendered in the
same session, which cancels the effect entirely, plus a vacuity guard that the reference
exists.

### Nine disturbances, all defeated; and a control proving the gate is not simply always-red

```
[PASS]     control -- the gate accepts the correct change
[DEFEATED] D1 closed-for-everyone (USING false)
[DEFEATED] D2 predicate that reads right but does nothing (... OR true)     <- A2.12's named case
[DEFEATED] D3 PERMISSIVE instead of RESTRICTIVE
[DEFEATED] D4 USING without WITH CHECK (writes left unguarded)
[DEFEATED] D5 FOR SELECT instead of FOR ALL
[DEFEATED] D6 item 1 not done (function still present)
[DEFEATED] D7 collateral damage: post_receipt_accounting dropped too
[DEFEATED] D8 item 2 not done (no policy at all)
[DEFEATED] D9 second restrictive policy empties the table for EVERYONE      <- caught by the
           391 FAILED D: the probe row is invisible to admin (0), accountant (0) or manager (0)   BEHAVIOURAL half
```

D1 is v6's explicitly mandated disturbance and it failed the gate — but at check `C`, on
shape. **D9 was added deliberately** because a disturbance caught by a structural check does
not prove the *behavioural* two-sidedness works: it passes `C` with a perfect
`viewer_restricted` while a second restrictive policy empties the table for every role. It was
caught by `D`'s open half, which is the half A2.10 exists for.

---

## Apply

```
$ psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f 391_forward.sql
SET / DO / DROP FUNCTION / DROP POLICY / CREATE POLICY / DO
NOTICE:  391 OK: trg_post_receipt_on_approve is dropped (0 callers in 4 directions; its own
callee post_receipt_journal was already gone) while the live post_receipt_accounting(uuid,uuid)
survives; and document_attachments carries viewer_restricted matching the 91-table house
pattern field for field (RESTRICTIVE/ALL/authenticated/USING+WITH CHECK). Measured on a probe
row that was rolled back: viewer-only sees 0, admin 1, accountant 1, manager 1, sales 0
(unchanged).
=== exit: 0 ===

$ docker restart afrakala-lan-rest        # A5.29
afrakala-lan-rest    Up
```

`--single-transaction` is correct **here** — A5.26 forbids it only for reverting probes,
which this is not.

Independent verification after the apply:

```
 orphan_fn |          live_posting_fn
-----------+------------------------------------
           | post_receipt_accounting(uuid,uuid)

 document_attachments | viewer_restricted | ALL | RESTRICTIVE | {authenticated}
                      | (NOT is_viewer_only(auth.uid())) | (NOT is_viewer_only(auth.uid()))

 attachments | payment_receipts
           0 |               10
```

---

## Migration ledger note (not acted on)

`supabase_migrations.schema_migrations` tops out at `20260822210000`. Migrations **388, 389
and 390 are absent from it** — recent migrations are applied directly rather than through the
CLI, so 391 follows the same existing convention and is likewise not inserted. This is the
reconciliation item v6's Phase 4 already lists; it is recorded here rather than fixed,
because changing the ledger convention is not in M8's two-item scope.

---

## e2e — IN scope, because this mission changed database privileges (A4.16)

### Health pre-check (A4.18) — mandatory, all three measured before starting

```
(a) CPU busy %                    : 5      (need idle, below ~25)
(b) chrome-headless-shell count   : 0      (need 0)
(c) /login over HTTP              : 200 in 0.08s   (need under ~3s)
```

The migration was applied and PostgREST restarted **before** the run, never during (A4.20).
No build, container restart, migration or browser session touched the machine while it ran.

### Result

```
$ npx playwright test --reporter=list      # full output to file, never tailed (A4.21)
start: 17:34:13Z
  29 failed
  29 skipped
  536 passed (21.0m)
exit=1  end: 17:55:20Z
```

`exit=1` means "there were failures", not `124` (timeout). **21.0 minutes** — under the 46.6
minute clean reference and far under A4.19's 95-minute ceiling.

Cross-check per A4.21, counted independently of the summary line: `ok` markers **536**,
`x` markers **29**. Both agree with the summary. 536 + 29 + 29 = **594**, the full discovered
set.

### Two-way SET comparison against the 30-failure baseline (A4.22) — sets, never counts

```
baseline: 30    this run: 29

=== in BASELINE but NOT failing now (CLOSED) ===
    persons/duplicate-mobile-blocked:59

=== NEW failures not in baseline (MUST BE EMPTY) ===
   (none)
```

**Zero new failures.** This run's failing set is a strict subset of the baseline's.

The one that did not recur is the one the baseline document itself flagged as newly-appeared
and as a **UI race**, not a defect: `locator.click: Timeout`, where the «افزودن» button
detaches from the DOM mid-click and then goes `disabled`. It ran and passed here:

```
  ok 226 [chromium-admin] › e2e\persons\duplicate-mobile-blocked.spec.ts:59:1
         › a second person cannot take a mobile that already belongs to someone (3.9s)
```

So it passed rather than being skipped. That file's last commit is `68993ac1` (phase 8.8) and
this mission did not touch it, so the movement is not attributable to M8 in either direction —
it is the same race flaking green. **The baseline is deliberately NOT superseded here**
(A4.23): superseding is for a mission that changes the harness on purpose, and this one changed
no spec file. The authoritative baseline remains the recorded 30-failure set.

### Data (A4.17 — e2e specs are not read-only)

```
payment_receipts      : 10 before, 10 after
document_attachments  : 0 before,  0 after   (every probe row was rolled back)
```

### Post-run (A4.24)

```
chrome-headless-shell : 0 before, 0 after    -- no orphans left behind (OG-54 stayed shut)
CPU busy %            : 4
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

**Exactly 70, across exactly the 6 known files.** The baseline is unmoved, as expected —
this mission changed no TypeScript.

## Build

**Not required and not run.** Zero files under `src/` changed (A7.40 conditions a rebuild on a
`src/` change). The container keeps whatever `APP_GIT_SHA` it had; this mission gives it no
reason to move.

---

## Delivery report

**Files inspected (live, not from git):** `pg_proc`, `pg_trigger`, `pg_depend`, `pg_policies`,
`pg_constraint`, `pg_class`, `user_roles`, `role_permissions`, the bodies of
`trg_post_receipt_on_approve`, `is_viewer_only`, `validate_document_attachment_ref`,
`has_dynamic_permission`; and in the repository migrations 281, 336, 338, 390, plus
`docs/verification/336-down.sql`.

**Files changed:**

| File | Why |
|---|---|
| `supabase/migrations/20260825180000_391_….sql` | the two-item change and its single two-sided gate |
| `docs/verification/391-down.sql` | rollback, written first, from live captured state |
| `docs/execution/m8-…-PROGRESS.md` | this file |
| `docs/execution/00-progress.md` | OG-8 closed, OG-15 half-closed, OG-60 raised |
| `docs/execution/chained-execution-PROGRESS.md` | HANDOFF STATE |

**Migration impact:** one migration, 391, applied to the `afrakala` test database.
`docker restart afrakala-lan-rest` performed afterwards (A5.29). Not inserted into
`supabase_migrations.schema_migrations` — 388/389/390 are absent from it too and 391 follows
the same existing convention; the reconciliation is v6 Phase 4's item, not M8's.

**RLS/RBAC impact:** one new RESTRICTIVE policy on `public.document_attachments`. No existing
policy altered, no grant changed, no role changed. One anon-executable SECURITY DEFINER
function removed from the schema.

**Audit log impact:** none. No data row was inserted, updated or deleted; the two probe rows
existed only inside transactions that ended in `ROLLBACK`.

**Manual test path:** sign in as a viewer-only account and open a document attachment surface —
it was already empty for that role before this change and remains so. The change is verified
by the gate's behavioural check rather than by the UI, since the table holds no rows.

**Remaining risks and manual steps:**
- **OG-60 is open and Item 2 is CONDITIONAL on it.** `document_audit_log` does not exist; the
  owner must name the intended table. This is the only part of M8's stated scope not delivered,
  and it is not deliverable as written.
- If migrations 391 and 336 are ever both rolled back, **391-down must run first**, or
  336-down fails with `42883`.
- `persons/duplicate-mobile-blocked:59` remains a live UI race that can flake in either
  direction; it went green this run and is still in the recorded baseline.

**Self-Host Acceptance Check:** no CDN, no online font, no external API, no non-self-hostable
service introduced. The change is one `DROP FUNCTION` and one `CREATE POLICY` in PostgreSQL.

**production لمس نشد** — `192.168.170.10` was not contacted at any point.
