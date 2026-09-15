# Checkpoint D1b — migration 548 lock author_id

| Field | Value |
|---|---|
| **Status** | COMPLETE |
| **Agent** | dev-data-engineer |
| **Branch** | `feature/sales-desk` |
| **HEAD at start** | `04c0268a0154d64123b88abc0866719a6440d363` |
| **HEAD at end** | `0176dd6cfaed29fa4175dddda6b16569a0167003` |
| **Commits** | `d088ebce` (548 migration + down + E4 evidence + checkpoint) · `0176dd6c` (SHA note) |
| **Worktree** | `D:\AfraKalaTest\app` |
| **Deadline** | 2026-09-16T07:00:00+05:00 |
| **Written** | 2026-09-16 (local) |
| **Finding addressed** | Security critic C6 REJECT — `assignee_can_steal_author=t` |

## Files (locked number [B-4])

1. `supabase/migrations/20260916033000_548_sales_interactions_lock_author_id.sql`
2. `docs/research/sales-desk-9-needs/orchestration/548-down.sql`

## Fix summary

- BEFORE UPDATE trigger `trg_sales_interactions_lock_author_id` → function `tg_sales_interactions_lock_author_id()`
- Raises if `NEW.author_id IS DISTINCT FROM OLD.author_id` when `current_user = 'authenticated'` and actor lacks `has_any_role(admin, manager)`
- `REVOKE DELETE ON TABLE public.sales_interactions FROM authenticated` (no DELETE policy; excess grant from 545)
- Did **not** edit 545/546/547 files

## Apply to LAN DB (`afrakala-lan-db` / db `afrakala` / user `supabase_admin`)

Delivery: same as 545 — Node Buffer → base64 stdin → `base64 -d` → `md5sum` match → `psql -v ON_ERROR_STOP=1 --single-transaction -f` → ledger INSERT.

| Step | MD5 (local=remote) | rc | Notes |
|---|---|---:|---|
| 548 up first apply | `0264899fabd3b8c2a25f6384eab818be` | **0** | Ledger `INSERT 0 1` version `20260916033000` |
| 548-down | `5117c2b8e82a56b7c7f8e6ab13f37537` | **0** | NOTICE `548-down OK` |
| 548 up re-apply | `0264899fabd3b8c2a25f6384eab818be` | **0** | Ledger `INSERT 0 0` (already present) |

## Behaviour probe [E4]

Rolled-back txn probes (same assignee steal pattern as S1):

| Phase | Result | Evidence file |
|---|---|---|
| **Before 548** | `S1 assignee_can_steal_author=t` | `_s1_steal_before_548.out` |
| **After 548** | `S1 assignee_can_steal_author=f` + `steal_err=…immutable…(migration 548)` + `authenticated_has_delete=f` | `_probe_548_steal.out` |
| **After 548-down** | `AFTER_DOWN assignee_can_steal_author=t` | `_reverse_548.out` |
| **After 548 re-up** | `S1 assignee_can_steal_author=f` again | `_reverse_548.out` |

Probe SQL: `_probe_548_steal.sql` (nested EXCEPTION so blocked UPDATE still reports `=f`).

## Live catalog after final up [E3]

- Ledger: `20260916033000` present
- Triggers on `sales_interactions`: `trg_sales_interactions_lock_author_id`, `trg_sales_interactions_updated_at`, `trg_notify_sales_interaction_assigned`
- `authenticated` privileges: SELECT, INSERT, UPDATE, REFERENCES, TRIGGER — **no DELETE**

## What was not done

- No `git push` / merge / production DB
- No edits to 545/546/547
- REFERENCES/TRIGGER grants left as-is (only DELETE revoked per brief)
- E5 independent third-party re-review not run in this session

## Out of scope notes

- Unrelated untracked `20260916120000_548_person_create_hard_identity_gate.sql` / `549_…` exist in tree; not part of this mission (different timestamp/name; [B-4] locked this file only).
