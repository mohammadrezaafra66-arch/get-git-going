# RESUME-E4 — checkpoint log

Replacement E-4. Predecessor stopped mid-run at commit `74907829` on
`feature/conv-release-line`, message "WIP: agent stopped mid-run, unverified, do not merge".
This file is updated after every proven step. Do not trust anything below a checkpoint whose
evidence command you have not re-run yourself.

## Checkpoint 0 — inheritance assessment (2026-09-13, replacement E-4 start)

Commands run to produce this assessment:
```
git -C D:\AfraKalaTest\wt-conv-release rev-parse HEAD
git -C D:\AfraKalaTest\wt-conv-release status --porcelain
git -C D:\AfraKalaTest\wt-conv-release show 74907829 --stat
md5sum /d/AfraKalaTest/dumps/prod-20260913.dump
docker exec afrakala-lan-db psql -U supabase_admin -d postgres --no-psqlrc -A -t \
  -c "SELECT datname FROM pg_database WHERE datname LIKE 'prod_rehearsal%';"
```

### (a) Finished (E3: PowerShell parser exit clean / bash -n exit clean, both re-run by E-4)
- `release/rehearse.ps1`, `build.ps1`, `emit-blocks.ps1`, `apply-release.ps1`, `validate-blocks.ps1`
  all exist and parse with zero errors under
  `[System.Management.Automation.Language.Parser]::ParseFile(...)`.
- `release/lib/rehearse-engine.sh`, `mig-apply.sh`, `apply-release-engine.sh` all pass `bash -n`.
- `release/rehearse.ps1` header (lines 11-17) and `release/lib/rehearse-engine.sh` header
  (lines 14-40) both carry the CATALOGUE-not-ledger rationale in the script's own header comment,
  as the brief requires.
- `release/config/known-ledger-lies.txt` has exactly 36 uncommented 14-digit version lines
  (`grep -v '^#' ... | grep -c '^[0-9]'` = 36), and those 36 versions are IDENTICAL to the 36
  versions printed under "FATAL — undeclared ledger/catalogue disagreement" in
  `release/out/rehearsal-e4.md` (visual diff, both lists start `20260424144837 20260424162922
  20260427133517 ...` and end `20260906160000 20260906201000`). This is real, consistent evidence
  a dry run happened and its findings were used to build the file — not a fabricated list.
- `release/out/rehearsal-e4.md` records one real dry run, dated `2026-09-12T15:03:48Z`, against
  `/d/AfraKalaTest/dumps/prod-20260913.dump`, md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0` — **this md5 was
  independently re-verified by E-4** (see command above) and matches. Ledger before replay:
  `681|20260424144837|20260912150000`, matching the mission brief's settled fact exactly.
- `apply-release.ps1` is 97 lines (`<= 120` requirement met), no Node, no Python.

### (b) NOT finished — genuine gaps, not claims
- **The rehearsal never reached PASS.** `rehearsal-e4.md`'s own last line is `## VERDICT: FAIL`
  (undeclared ledger-lies, before `known-ledger-lies.txt` existed to fix that). No PASS report
  exists anywhere in `release/out/`.
- **No `RELEASE-<date>.md` was ever generated.** `emit-blocks.ps1` was never run (it requires a
  PASS report as input and none exists). `release/out/` contains only `rehearsal-e4.md`.
- **`validate-blocks.ps1` was never run against anything real** (nothing to validate yet).
- **`apply-release.ps1` was never run**, against a rehearsal database or otherwise.
- **The scratch database was dropped.** `SELECT datname ... LIKE 'prod_rehearsal%'` returns only
  `prod_rehearsal_20260908` and `prod_rehearsal_gate` (both FORBIDDEN, untouched) — no
  `prod_rehearsal_e4`. The engine's own `trap cleanup EXIT` fires on FAIL too, so this is expected,
  not suspicious — but it means `rehearsal-e4.md` is currently **not reproducible** without a fresh
  run, exactly as the launch brief warned.
- **The "tolerate a missing object" mechanism (NEW SCOPE) does not exist anywhere in the inherited
  code.** `mig_apply` in `release/lib/mig-apply.sh` has no branch for it; `rehearse-engine.sh`'s
  replay loop treats every non-zero `mig_apply` exit as fatal (`STOPPING at first failure`). This
  is a real gap E-4 must build, not a misunderstanding — grep confirms no match for
  "tolerat|shape.mismatch|531" anywhere under `release/`.
- **The four autostart-tree blocks (a)-(d) are completely absent from `emit-blocks.ps1`.** It
  generates Preflight, migrations, image, deploy, rollback, sign-off — nothing about
  `C:\AfraKalaServer\get-git-going01lan`, the scheduled task, the five operational scripts, or
  ISSABEL_*/OLLAMA_* keys. Confirmed by reading the full file (289 lines) — no such section.
- `docs/runbooks/release-line/README.md` does not exist.
- `docs/research/convergence/E-4-proof.md` does not exist, **even though
  `release/config/known-ledger-lies.txt`'s own header (lines 19-20) cites it as already written**
  ("see docs/research/convergence/E-4-proof.md"). This is exactly the [A-1] trap: a citation is not
  evidence the cited file exists. It does not. E-4 must write it for real.
- `docs/missions/convergence/RESUME-E4.md` did not exist before this checkpoint (this file).

### (c) Cannot confirm without re-running
- Whether the 690 candidates, 9 APPLY, 36 pre-declared LEDGER_ONLY-lies, and 403 UNVERIFIABLE
  counts would reproduce identically on a fresh restore — plausible (same dump, same migrations
  dir at this commit) but unproven until re-run.
- Whether `og81`/`og102`/`og103` + the anon view/matview census pass against a replayed rehearsal
  database — never run in this lineage; `rehearsal-e4.md` FAILed before reaching the replay step's
  gates (it aborted at the LEDGER-LIES gate, before any `mig_apply` call).
- Whether `release/build.ps1`'s guard logic and delegation to `deploy/lan/build.ps1` work — never
  invoked in this lineage.

## WHAT IS UNFINISHED (as of Checkpoint 0)
1. Build the shape-tolerance mechanism (NEW SCOPE).
2. Build the four autostart-tree blocks in `emit-blocks.ps1`.
3. Re-run `rehearse.ps1 -KnownLedgerLies release\config\known-ledger-lies.txt` to reach a real PASS.
4. Run `emit-blocks.ps1` -> `validate-blocks.ps1` -> `apply-release.ps1` against `prod_rehearsal_e4`.
5. Write `docs/runbooks/release-line/README.md` (Persian) and `docs/research/convergence/E-4-proof.md`.
6. Commit, push once, open PR to `staging` (do not merge).

## EXACT NEXT COMMAND
Implement the shape-tolerance mechanism: add `release/config/known-shape-tolerant-migrations.txt`
and a sourceable function in a new `release/lib/shape-tolerance.sh`, then wire it into
`release/lib/rehearse-engine.sh`'s replay loop.

## WHAT WOULD PROVE THAT STEP DONE
A standalone bash invocation that sources `release/lib/shape-tolerance.sh` and shows the function
returns 0 (tolerate) for a declared version+substring pair and 1 (do not tolerate) for an
undeclared one — pasted output, both cases.
