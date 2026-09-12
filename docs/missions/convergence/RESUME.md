# RESUME — Convergence + Transfer Line (rule [B-9])

**If this session dies, the next orchestrator starts here. Read `STATE.md` first.**

## Exact next command

```
Wait for the three dispatched Stage-0 research agents (R-3, R-4, R-5) to report, then write
their findings into docs/research/convergence/ and update STATE.md §Brief status.
```

**Row it belongs to:** R-3 / R-4 / R-5 in `STATE.md`.
**What proves it finished:** three files exist —
`docs/research/convergence/R-3-frontend-defects.md`, `R-4-transfer-line.md`,
`R-5-security-inventory.md` — each with a verdict line first and an `UNKNOWN` section last.

## Before anything else, re-check these two blockers

1. **Production dump.** Stage 1 must not start on a restore older than production ledger **681**.
   Check `ls D:\AfraKalaTest\dumps\`. If empty, the owner has not yet run, on `.10`:
   ```powershell
   $pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
   docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U supabase_admin -d postgres -Fc -f /tmp/prod-20260913.dump
   docker exec afrakala-lan-db md5sum /tmp/prod-20260913.dump
   # then copy out of the container and across to D:\AfraKalaTest\dumps\prod-20260913.dump
   ```
   The newest production artifact on test is otherwise `afrakala-lan-db:/tmp/prod-full.dump`
   (29,725,089 B, **2026-08-31**, ledger ≈ 569) — every figure derived from it is
   `PRE-MIGRATION-SHAPE`.

2. **Live fleet agent.** `Get-CimInstance Win32_Process -Filter "Name='claude.exe'"`. If a
   `--agent dev-security-critic … m1-eval-wt …` process is alive, **do not** restore a database,
   touch a container, run Playwright, or `docker save`. Code-only research is safe.

## Invariants that must hold before Stage 1 dispatch

- `D:\AfraKalaTest\app` on `staging` at `origin/staging` (was fast-forwarded to `d60232f5`).
- Migration identities taken only from `MIGRATION-LEDGER.md` rows 526–540.
- Each E-agent: own branch `feature/conv-*`, own worktree `wt-conv-*`, own
  `prod_rehearsal_e<n>` restored from a dump **≥ ledger 681**.
- Never shared: `afrakala`, the web container, `e2e/auth/*.storage.json`, `test-results/`,
  `.artifacts/`, `PROGRESS.md` (orchestrator appends one row at the very end).

## What has already been done — do not repeat

Phase 0 §3.1–§3.5 is complete: fleet map, concurrency check, migration reservation, `STATE.md`,
this file, and the repo fast-forward. Findings that cost real time to establish are in
`STATE.md` §0.2–§0.7 — in particular the dump situation (§0.3), the cluster capacity
constraint and the six abandoned clone databases (§0.6), and the `pg_cron`-on-test correction
to the brief's §1 (§0.7).
