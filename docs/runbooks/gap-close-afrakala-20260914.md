# Closing the test-box migration gap — afrakala, 2026-09-14

Owner decision: **Option A, 15 files.** Executed by Claude Code on the test computer
(`afrakala-lan-db`, database `afrakala`). Nothing on 192.168.170.10 was touched.

## Before

| | value |
|---|---|
| afrakala ledger | 686, top `20260908034500` |
| production ledger (read from `afrakala-db-20260913-post-release-696.dump`, not restored) | 696, top `20260913111000`; production later applied 542 → 697 |
| main | c8035d5f (542 merged via `merge --no-ff`, staging → main fast-forward) |
| files on main with no afrakala ledger row | 17: 522, 523, 524, 525, 526, 527, 528, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539 (no 529) — plus 542 |

## Backups taken first (md5 identical host ↔ container)

| file on host (`D:\AfraKalaTest\dumps\`) | taken | md5 |
|---|---|---|
| `afrakala-pre-gap-20260914T1040Z.dump` | 10:40Z, before rehearsal | `8f580e4ac232f38e8a6d55c74cdcd0b2` |
| `afrakala-pre-apply-20260914.dump` | 10:55Z, immediately before apply | `515897d13a025fc5a7eb88a3e178deef` |

Both copies remain in the container's `/tmp` as well (`afrakala-pre-gap.dump`, `afrakala-pre-apply.dump`).

## Applied — one at a time, `--single-transaction -v ON_ERROR_STOP=1`, ledger row after each

522, 524, 525, 526, 527, 528, 530, 531, 532, 535, 536, 537, 538, 539, 542 — all 15 OK, each
`INSERT … RETURNING` returned its version (none pre-existed). All files md5-verified in the container
before running. Then `docker restart afrakala-lan-rest` (PostgREST reads the schema only at startup).

## Deliberately NOT applied and NOT recorded — the omissions

| version | file | why |
|---|---|---|
| `20260912140000` | 523 close_anon_table_grants_for_production_shape | Production-only replacement for 477. It names six tables by their ORIGINAL names; this box ran 450/452 (renamed them to `zz_retired_*`) and ran 477 itself. Rehearsed on a clone: fails with `relation "public.capital_allocation_ledger" does not exist`. After the other 15, anon-writable public tables = **0** — nothing 523 would close is open here. A ledger row for a migration that never ran is a false claim about the schema, so none was written. |
| `20260913101000` | 533 pg_cron_http_scheduler | Owner-gated (installs `http`). Not on production's ledger; recorded decision is that production does not have it. |
| `20260913102000` | 534 cron_run_log | Depends on 533's scheduler; not on production. |

**Consequence for OG-81** (`e2e/security/og81-migration-ledger-matches-disk.spec.ts`): on afrakala the
"every file has a ledger row" test will list exactly these three versions. That is expected and is the
truthful state — do NOT "fix" it by inserting rows or by running 523. Production's own ledger has the
mirror-image set (449, 450, 452 never run there, 336/343 shape-tolerant; 533/534 absent).

## After — proofs

| check | result |
|---|---|
| ledger | **701**, top `20260914130000` |
| ledger rows for 523 / 533 / 534 | 0 / 0 / 0 |
| 542 trigger `profiles_guard_status_change` | present |
| `vw_account_balances` as an inactive account with no role (simulated JWT, rolled back) | before **2** → after **0** |
| `vw_account_balances` as an active admin (same method) | before **2** → after **2** (unchanged) |
| anon-writable public tables | 0 |
| containers | only `afrakala-lan-rest` has a new StartedAt (2026-09-14T10:56:43Z); all others unchanged; `db-role-fix` Exited (0) as expected |
| PostgREST | schema cache loaded 255 relations / 358 functions, listening |
| `http://192.168.170.8:3100/login` | 200 |
| Kong `/auth/v1/health` | 200 |

## Incident-window check (the reason Option B was considered)

2026-09-13 13:13–14:45 UTC: **0** rows created in `sales_quotes`, `payment_receipts`, `currency_rates`,
`persons` in every one of the 14 databases on this box; no updates since 09-13; one login by the
long-standing admin account. No staff work was at risk here.

## Rehearsal databases

`gapa_20260914` (clone of afrakala) and `gapb_20260914` (restore of the production dump — production
personal data and credentials) were created for the A/B measurement and **dropped** after the apply.

Still on the box, not created by this work and not touched: 12 `prod_rehearsal_*` databases and several
production dumps in the container's `/tmp` (`prod13.dump`, `prod-full.dump`, `rehearsal_e4*.dump`). They
carry the same production-data exposure as `gapb` did.
