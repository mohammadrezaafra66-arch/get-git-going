# RESUME — Convergence + Transfer Line · orchestrator recovery

**If context was lost or compacted: read this file and `STATE.md` BEFORE acting. Never restate a
fact from a compacted summary as established — re-measure it.**

Last updated 2026-09-12, at the start of the five-wave close-out chain.

---

## THE ONE THING: where the chain is

Stage 2 integration is **built and gated**: `feature/conv-integration`, worktree
`D:\AfraKalaTest\wt-conv-int`, twelve migrations, full evidence in
`docs/missions/convergence/INTEGRATION-LOG.md`.

**Wave A is the next action: launch `dev-code-critic` (V-1) and `dev-security-critic` (V-2) in
PARALLEL.** They share nothing:

| resource | owner |
|---|---|
| `prod_rehearsal_v1` | V-1 only — psql + source reading, **never a spec run** |
| `prod_rehearsal_v2` | V-2 only — **owns the Playwright/e2e harness** |
| browser, web container, `afrakala`, `e2e/auth/*.storage.json` | orchestrator only, Wave B |
| `prod_rehearsal_e4b…` | E-4 only, Wave D |

Then Wave B (browser, orchestrator) → Wave C (devil's advocate, verdict, merge) →
Wave D (E-4 release line) → Wave E (hand to owner).

**V-1's brief leads with the four artifacts where the orchestrator was producer AND gate** —
526's idempotency proof, G-4's fix, migration 537, migration 538 — **requirement only, no
orchestrator proof, no orchestrator header text.** Two carry a kill switch: 537 is RED unless V-1
independently counts `214 → 0`; 538 is RED unless it independently counts **36**.

**A RED row leaves the release. Including the orchestrator's.**

---

## Ground truth — verified, do not rediscover

| fact | value |
|---|---|
| branch point | `ad0138df` = `origin/staging` = `origin/main` |
| dump | `D:\AfraKalaTest\dumps\prod-20260913.dump`, md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0`, in container at `/tmp/prod13.dump`, ledger **681 / `20260912150000`** |
| restore proof | every agent must print dump name + md5 + ledger top BEFORE work, or the report is rejected |
| LAN channel | SMB `\\192.168.170.8\dumps`, user `vira-service\afra`, proven both directions. **Test no alternatives** |
| image | `docker save afrakala-app:lan \| gzip` = 240 MB in 9 s |
| e2e gates | parameterised via `E2E_DB_NAME`/`E2E_DB_CONTAINER`/`E2E_DB_USER` (defaults `afrakala`/`afrakala-lan-db`/**`postgres`**); `db.ts` has `assertReadOnlySql`; `tx.ts` exists for writes |
| typecheck baseline | **70 errors across exactly 6 files** — compare per file |
| test app | `:3100` fixed by `docker restart afrakala-lan-web` (stale NAT rule sent 3100 to PostgREST). **Docker Desktop restart never worked and was never needed** |

## Stage 1 — 5 of 6 complete

| agent | PR | state |
|---|---|---|
| E-1 | none (pushed `da281f72`) | 526 **gate-passed**, 527/528 unverified |
| E-2 | **#441** | done + 531 hardened (`b77622f6`) |
| E-3 | **#443** | done, typecheck re-verified by orchestrator |
| E-5 | **#445** | done (replacement) |
| E-6 | **#442** | done |
| **E-4** | none | **2 checkpoints pushed (`dba17712`), ~2/3 done** |

Also pushed: `feature/conv-orchestrator-state` (`a39ba7ff`) — R-1…R-5 + STATE/RESUME/LEDGER.

## Rules that cost something to learn

1. **Checkpoint = LOCAL commit after every proven step. Push at phase end only.** The
   push-every-checkpoint instruction was the orchestrator's and was **wrong** — it contradicts
   `CLAUDE.md`. E-5 refused it and was right.
2. **Mid-run instruction injection is BANNED.** A brief is trusted only at launch. To change a
   rule: stop and relaunch, or the rule waits.
3. **Stopped agents cannot be resumed** (harness refuses). Completed agents **can** (E-2 was).
4. **A citation is not evidence the cited file exists** — caught twice.
5. Migrations must **no-op on the wrong shape, not abort** (477's lesson; 531's fix is the pattern).
6. No `BEGIN;`/`COMMIT;` inside a migration — conflicts with `--single-transaction`.
7. Never DELETE a ledger row.

## Open, not lost

- **526 repairs 9 objects, not 7** (adds `vw_account_balances`, two `sdpm_*` policies).
- **og61: 8 failures** — proven *not caused* by 533/534; prior state **unmeasured** (V-2).
- **Production deploys from `C:\AfraKalaServer\get-git-going01lan`, not `C:\afrakala`** — two
  compose trees, autostart runs `up -d` **without `--no-deps`**, neither tree defines
  `ISSABEL_*`/`OLLAMA_*` (why OCR is dark, why `call_logs` is 0 rows), five operational scripts
  exist in **no repo**.
- **Auto-resume: built, `S6 20/20`, blocked by `promote.py`** on a dev-set regression in two agents
  the change never touched (`dev-security-critic`, `dev-archaeologist`). A decision, not a build.
- **89 guest identities / 24.4 bn Rial** invisible to both credit sensors — HANDOFF.
- Secrets + plaintext-password payloads in the autostart tree — **owner only, no agent touches**.
