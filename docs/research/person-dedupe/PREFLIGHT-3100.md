# 3100 preflight before production cutover

Date: 2026-09-16  
Host: `192.168.170.8:3100`  
Branch: `feature/sales-desk`  
PR: https://github.com/mohammadrezaafra66-arch/get-git-going/pull/451 → staging

## Checks run (pass)

| Check | Result |
|---|---|
| `/api/version` healthy | pass — web container healthy |
| Commit == branch tip at prep | pass (rebuild after this commit if needed) |
| Bundle: حذف گروهی + لینک اشخاص تکراری | pass |
| Bundle: merge → persons-cleanup | pass |
| Bundle: ami_ring / ring-popup | pass |
| Migrations person 120000–123000 | pass (ledger) |
| Migrations ring 160000–162000 | pass (ledger) |
| Sales desk 030000–033000 | pass (ledger) |
| Pricing enqueue 170000 | pass (ledger) |
| RPCs person_* present | pass |
| `person_detect_merge_candidates(NULL)` | pass `{"pending":0,"touched":0}` |
| `call_ring_events` last 24h | pass (28 rows) |
| `call_logs` last 24h | pass (2452 rows) |
| Tasks CelRing / Import / Pricing | pass — wscript windowless |

## Still only on production laptop

1. Merge PR #451 (or deploy branch intentionally)
2. Apply missing migrations on prod DB `postgres`
3. Fill Issabel + worker tokens in **live** prod `.env.lan`
4. Rebuild web **on** prod (`--no-deps`)
5. Register windowless host tasks
6. Map call extensions; smoke popup

See `docs/research/person-dedupe/PRODUCTION-HANDOFF.md`.
