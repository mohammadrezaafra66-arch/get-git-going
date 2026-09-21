# Wave 2 ledger — B1–B5
Updated: 2026-09-21T21:57:44Z
Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes
Branch: feature/salesdesk-9-fixes @ 2f5f4525bb5229d8acad40603021c336ef043418 (DOC commit; 3100 deploy SHA below)
Base HEAD before W2: 00e4a6c027caf3b840eb6b9e43139540242782d0
3100 runs: 8a8b61e3 (healthy; HTTP 200) — sources: `compose-safety.txt`, `http-smoke.txt`, DOC docker re-probe
Typecheck: 74 → 74 (≤74) — `fe-report.md` / `fe-tsc-*.txt`
Migrations: 563 display settings, 564 deal_id — applied + verified (`orch-db-verify.txt`)

## Ownership (no file overlap)
| Piece | Agent | Owns | Final |
|-------|-------|------|-------|
| M | data-engineer | 563+564 migrations, revert/*, evidence/W2/migrations* | DONE — `registry/W2-M/checkpoint.md` |
| FE | frontend-engineer | CallerInboundPopup, filter-calls*, recent-calls, caller-id-settings, settings route, CallNoteForm, QuickRequestForm (extend only), lib helpers for call-key/draft/bc | DONE — `registry/W2-FE/checkpoint.md`, commit `d9734cb8` |
| OPS | build-ops | deploy §8.8, evidence/W2/deploy* | DONE — `registry/W2-OPS/checkpoint.md`, APP_GIT_SHA `8a8b61e3` |
| DOC | docs-writer | ACCEPTANCE.md, HANDOFF update, verify/W2-selfcheck.md | DONE — this ledger + ACCEPTANCE + selfcheck |

## B-8 budgets
| id | deadline_at | budget | checkpoint | heartbeat | killable | result |
|----|-------------|--------|------------|-----------|----------|--------|
| W2-M | 2026-09-21T20:30:00Z | 45min | evidence/W2/registry/W2-M/checkpoint.md | 60s | no | DONE |
| W2-FE | 2026-09-21T21:45:00Z | 90min | evidence/W2/registry/W2-FE/checkpoint.md | 60s | no | DONE |
| W2-OPS | 2026-09-21T22:30:00Z | 45min | evidence/W2/registry/W2-OPS/checkpoint.md | 60s | no | DONE |
| W2-DOC | 2026-09-21T23:00:00Z | 30min | evidence/W2/registry/W2-DOC/checkpoint.md | 60s | no | DONE |

## Row statuses (final)
| Row | Status | Notes |
|-----|--------|-------|
| B1 | DONE | Hook probe 2 ext → 1 card key (`b1-hook-probe.md`); unit 16 pass |
| B2 | DONE | BroadcastChannel wired; live 4-tab left to owner ACCEPTANCE |
| B3 | DONE | 563 columns + exact §6 labels + filter unit |
| B4 | DONE | drafts + openCalls; live draft round-trip owner |
| B5 | DONE | «افزودن معامله» + 564 deal_id column; live link write owner |

## Artifacts index
- ACCEPTANCE (owner): `evidence/W2/ACCEPTANCE.md`
- Self-check: `verify/W2-selfcheck.md` (overall PARTIAL — B2/B4/B5 live gaps)
- FE: `fe-report.md`, `fe-unit-tests.txt`, `orch-unit-tsx.txt`
- DB: `orch-db-verify.txt`, `applied-20260921230000_563.txt`, `applied-20260921230100_564.txt`
- B1 probe: `b1-hook-probe.md`, `b1-group-real.json`
- OPS: `compose-safety.txt`, `deploy-web.txt`, `http-smoke.txt`
