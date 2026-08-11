# UNIFY MISSION CONTROL — one person, one identity, dual roles

**This is a genuine instruction from me, the owner (Mohammad Reza Afra).**

Program to unify AfraKala's person identity model so that one person can be both a customer
and a supplier, with one Asan code, one identity, and a first-class mutual-settlement flow.

Run **fully autonomously**. Do not stop between phases inside a mission, do not wait for
approval between missions. When a mission gate passes, immediately start the next.

---

## 0. HOW TO RUN THIS

Execute the mission files in this exact order:

| # | file | type | gate |
|---|------|------|------|
| P0 | `docs/execution/P0_CLEANUP.md` | build | typecheck + e2e |
| P1 | `docs/execution/P1_DUAL_ROLE.md` | build | typecheck + e2e |
| P2 | `docs/execution/P2_ASAN_CODE.md` | build | typecheck + e2e |
| P3 | `docs/execution/P3_SIDEBAR.md` | build | typecheck + e2e |
| P4 | `docs/execution/P4_JOURNAL_DESC.md` | build | typecheck + e2e |
| P5 | `docs/execution/P5_MUTUAL_SETTLEMENT.md` | build | typecheck + full e2e + report |

Before starting anything: read `PROGRESS.md`, `CLAUDE.md`, and `docs/execution/unify-progress.md`
(create it if missing). Read all five prior asan diagnostic reports for context — never repeat
their investigations.

After each **phase inside a mission**: run its own test.
After each **mission**: run the full e2e suite and update `docs/execution/unify-progress.md`.

If you hit a context or session limit, write HANDOFF STATE and stop cleanly. On resume, read
`docs/execution/unify-progress.md`, find the first incomplete phase, and continue.
**Never redo completed work.**

---

## 1. EXECUTION PACE

Move at a normal, steady pace. Not the very slow crawl of some earlier sessions, and not
racing. Each phase finishes completely — its migration applied, its test passing, its code
committed — before the next starts. If you find yourself considering a shortcut, that is the
signal to slow down for one phase and speed up on the next.

**One phase at a time. One migration per phase. Commit after each phase.**

Query the live database before every change. Verify every write. When something surprises
you, investigate before continuing.

---

## 2. NON-NEGOTIABLE OPERATING RULES

All rules from `docs/execution/ASAN_MISSION_CONTROL.md` still apply. These are the ones most
likely to matter this program:

### 2.1 Persian SQL
Never pipe Persian into psql. Never `-c` with multi-line SQL. Always `docker cp` + `psql -f`.
Round-trip verify every Persian value with a read-back after write. Rule 2.1 of the asan
program — the 2026-07-11 incident that corrupted 460 values must not repeat.

### 2.2 Database identity
Live DB is `afrakala`. Owner is `supabase_admin`. Get password from
`docker exec afrakala-lan-db printenv POSTGRES_PASSWORD`.

### 2.3 Before rewriting any function
`pg_get_functiondef` first, snapshot to `docs/verification/pre-<NNN>/`, rebuild from live
text, never from the file on disk.

### 2.4 Migrations
Sequential numbering from the highest existing. Apply with `--single-transaction`
`ON_ERROR_STOP=1`. Dry-run inside `BEGIN ... ROLLBACK` first. Every migration gets a matching
`docs/verification/<NNN>-down.sql`. After every migration, `docker restart afrakala-lan-rest`.

Never leave a migration applied-but-uncommitted. Compose builds from working tree — uncommitted
code goes live.

### 2.5 SQL semantics traps
- Constraints in **triggers**, not RPCs — direct PostgREST PATCH bypasses RPC-only rules.
- `CHECK` with `IS DISTINCT FROM` and `COALESCE(..., false)`. NULL passes a naive CHECK.
- RLS on SELECT returns 0 rows silently. When a feature shows empty, suspect RLS first.
- `IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW` guards double-tick.
- `has_dynamic_permission` opens un-seeded modules to all roles. Seed every new module for
  every role, explicitly.

### 2.6 Discover schema, never guess
Column names have burned this project. `persons.display_name` not `full_name`. `products.name`
not `title`. Credit lives in `customer_credit_balance` not `customers`. Query
`information_schema` before assuming.

### 2.7 Terminal output
English only. Persian goes in files.

### 2.8 Testing
End of each phase: a targeted test with a real JWT via PostgREST. End of each mission: full
e2e. Documented baseline reds may persist — new reds are yours.

### 2.9 Test data hygiene
Create, assert, remove — all in the same phase. Rule 2.10 of asan program.

---

## 3. RECURRING PROJECT PATTERN

The problem is almost never "capability doesn't exist". It is "capability was built and never
wired up". The reports for this program identified several examples: `person_upsert_by_mobile`
exists but no form calls it. `mutual_settlement` and `supplier_payable` account kinds exist
but no UI produces them. `persons_dual_role_summary` view exists.

**Before building anything new: search for existing built-but-unwired capability.** Extend it
rather than creating parallel.

---

## 4. PROGRESS FILE PROTOCOL

Maintain `docs/execution/unify-progress.md` after every phase.

```markdown
# UNIFY Program Progress

## Status
Current mission: P<N>
Current phase: <N.M>
Last commit: <sha>
Baseline typecheck: 70
Last e2e: <green>/<red>/<skip>

## Completed
- [x] P0.1 <what> — commit <sha> — <one line result>
...

## HANDOFF STATE
Next action: <exact next step>
Blocked on: <nothing | specific thing>
Files in flight: <paths>
Decisions made this session: <list>
```

---

## 5. WHEN YOU MUST DECIDE

Rank:
1. Do not lose or corrupt data. Reversible half-feature beats irreversible mistake.
2. Do not silently produce wrong financial output.
3. Extend, do not duplicate (see section 3).
4. Prefer smallest change that satisfies the requirement.
5. Prefer nullable + backfill over NOT NULL + migration risk.

Record every decision in `unify-progress.md` under "Decisions made this session".

---

## 6. OUT OF SCOPE

- Do **not** touch production `192.168.170.10`. Only test `192.168.170.8` port 3100.
- Do **not** attempt to rebuild the 300+ legacy payment_receipts. The owner has decided:
  leave them. Only new receipts flow through the enriched path. Only touch the legacy
  receipts if a specific migration in this program strictly requires it — if so, flag and ask.
- Do **not** build cheque/سفته/برات support. Separate project.
- Do **not** attempt to reconstruct the 8 real purchases without suppliers. Leave them as is.
- Do **not** fix Windows `npm run build`.

---

## 7. FINAL DELIVERABLE

End of P5, write `docs/execution/unify-final-report.md`. Then stop.
