# Checkpoint docs — sales-desk-9-needs

| Field | Value |
|-------|-------|
| Agent | `dev-docs-writer` |
| Branch | `feature/sales-desk` |
| HEAD at write | `3bec3749a244bc8347ecf2338cf0f6bc3a2b47e7` |
| Worktree | `D:\AfraKalaTest\app` |
| Deadline | `2026-09-16T07:45:00+05:00` |
| Budget | 35min |
| Status | COMPLETE (docs only; no product code) |
| Written | 2026-09-16 |

## Deliverables

| File | Action |
|------|--------|
| `docs/research/sales-desk-9-needs/README.md` | created |
| `docs/research/sales-desk-9-needs/HANDOFF.md` | created (7 sections) |
| `PROGRESS.md` | one history row appended (pre-existing person-dedupe dirty row preserved) |
| this file | optional checkpoint |

## Verified before write (sample)

- `git branch --show-current` → `feature/sales-desk`
- `git rev-parse HEAD` → `3bec3749…`
- Migrations 545–548 files present under `supabase/migrations/`
- Nav label «میز فروش» at `registry.ts:562-564`
- Need 3 call site `import-issabel-calls.server.ts:436`
- Need 9 type/trigger in `547_….sql`
- T1: 7 passed on Vite `:8080` (`checkpoint-t1.md`)
- S1 RE-REVIEW: C6 APPROVE; MEDIUM assign-spam open (`checkpoint-s1-security.md:168`)

## Not done

- No `git push` / merge / staging
- No live re-probe of LAN ledger in this session
- No product/test code edits
