# Stage 2 — integration log

Branch `feature/conv-integration`, worktree `D:\AfraKalaTest\wt-conv-int`.
One section per numbered step. A step is written here only after it is **proven**, with the
command that proves it. Checkpoint = local commit after each step; push at phase end.

---

## Step 1 — branch and merge · DONE

Branched from `origin/staging` = `ad0138df` (= `origin/main`; both were fast-forwarded after the
2026-09-12 production run).

Merged `--no-ff` in the briefed dependency order, **E-4 excluded**:

| order | branch | PR | head | result |
|---|---|---|---|---|
| 1 | `feature/conv-migrations` (E-1) | **#444** | `da281f72` | clean, 0 conflicts |
| 2 | `feature/conv-db-fixes` (E-2) | #441 | `b77622f6` | clean, 0 conflicts |
| 3 | `feature/conv-ops` (E-5) | #445 | `e8a1676f` | clean, 0 conflicts |
| 4 | `feature/conv-security` (E-6) | #442 | `6f3b8422` | clean, 0 conflicts |
| 5 | `feature/conv-frontend` (E-3) | #443 | `e267a054` | clean, 0 conflicts |
| 6 | `feature/conv-orchestrator-state` | none | `72235109` | clean, 0 conflicts — **added by the orchestrator, see below** |

Integration head after step 1: `09499234`.

### Two things the brief did not say, both re-measured rather than assumed

**1. E-1 does have an open PR — #444.** `STATE.md` and `RESUME.md` both record E-1 as "no PR /
pushed `da281f72`". `gh pr list` shows **#444 `feature/conv-migrations -> staging`, MERGEABLE**,
head `da281f72` — the same commit. Only the PR row was stale; nothing about the code changed.

**2. `feature/conv-orchestrator-state` was merged as a sixth branch.** It was not on the briefed
list. It is docs-only — `STATE.md`, `RESUME.md`, `MIGRATION-LEDGER.md` and the five R-1…R-5 Stage 0
reports — with **zero file overlap** against the other five (verified with `comm -12` over the two
name lists). Without it the mission's own memory never reaches `staging` and this log has no
directory to live in. Called out here because it is an addition to the instruction, not a silent
one.

### Why no conflict was possible

The five execution partitions share **zero files**. Verified per branch *before* merging:

```
git diff --name-only ad0138df origin/<branch>
```

21 files across the five, each touched by exactly one branch. The merge output confirms
`conflicts=0` at every step (`git ls-files -u | wc -l`).

### `routeTree.gen.ts` was not regenerated, and must not be

```
git diff --name-only ad0138df HEAD -- src/routeTree.gen.ts   ->   0 lines
```

E-3 modified four existing route files (`_app.accounting.payables.tsx`, `_app.dashboard.tsx`,
`_app.pricing.index.tsx`, `sitemap[.]xml.ts`) and added none, so the generated route tree is
unchanged by construction. Regenerating it would have produced a diff with no cause.

### Eleven migrations enter the gate

`526 527 528` (E-1) · `530 531 532` (E-2) · `533 534` (E-5) · `535 536` (E-6).
**529 was reserved and not used** — the gap is intentional and is recorded in `MIGRATION-LEDGER.md`.

---

## Step 2 — fresh `prod_rehearsal_gate`, restored and proven to be production · DONE

The gate database that carried the 526 idempotency proof was **dropped and rebuilt from the dump**,
so nothing in this stage inherits state from Stage 1.

```
psql -U supabase_admin -d postgres -c "DROP DATABASE IF EXISTS prod_rehearsal_gate;"
                                   -c "CREATE DATABASE prod_rehearsal_gate OWNER supabase_admin;"
PGPASSWORD=... pg_restore -U supabase_admin -d prod_rehearsal_gate \
                          --no-owner --disable-triggers /tmp/prod13.dump
```

**Dump identity re-measured, not taken from memory:**
`md5sum /tmp/prod13.dump` -> `6ccd2dbb07a9a4d9bbae4421eb3265e0`, 35,424,962 bytes, byte-identical
to `D:\AfraKalaTest\dumps\prod-20260913.dump` on the host.

**`pg_restore` exit 1 with exactly 21 errors — the expected outcome, and every one accounted for:**

| count | error |
|---|---|
| 17 | `schema "cron" does not exist` |
| 1 | `extension "pg_cron" does not exist` |
| 1 | `can only create extension in database postgres` |
| 1 | `relation "decrypted_secrets" already exists` |
| 1 | `function "secrets_encrypt_secret_secret" already exists with same argument types` |

All pg_cron / vault, all in the allowlist R-2 and R-4 established. **Data-load errors: zero.**

### The ledger proof the brief required

```
ledger_rows  681
ledger_top   20260912150000          <- migration 525, production's top after the 09-12 run
last five    20260912150000 · 20260912143000 · 20260912140000 · 20260908120000 · 20260908034500
```

```
select version from supabase_migrations.schema_migrations where version >= '20260913000000';
(0 rows)
```

**None of 526-536 is present.** The gate starts from production's real shape, not from a shape that
has already seen this mission's work.

### Baseline census — the "before" half of every before/after in this stage

| measure | value |
|---|---|
| tables (`relkind='r'`, public) | **227** |
| views + matviews (`relkind IN ('v','m')`, public) | **24** |
| functions (public) | **859** |
| RLS policies (public) | **645** |
| `persons` rows | 4,857 |
| `audit_logs` rows | 112,696 |
| **anon-reachable relations** | **20** — 13 tables + 7 views |
| functions `anon` may EXECUTE | 544 |
| functions `authenticated` may EXECUTE | 806 |
| `SECURITY DEFINER` functions (public) | 446 |
| views **without** `security_invoker` | 13 |

The anon figure of **20** independently confirms that 523/524/525 did land on production: the
pre-523 measurement was 214 and the post-525 target was 20. This is the first time that number has
been read back off a fresh restore of the post-run dump.

