# Phase 9 blockers — run progress

Run started 2026-08-31. Branch point: `staging = 9065cf07`.
This file is the run's memory. It is updated at every mission boundary and after any
significant finding, so the run can resume after a context reset.

Evidence levels used below are the ones defined in the brief:
CITED / QUOTED / RAN / OBSERVED / INDEPENDENT.

---

## Completed

- **Phase 0.1** — git state confirmed.
- **Phase 0.2** — database ground truth re-verified (see Confirmed facts).
- **Phase 0.3** — receivables read path discovered first-hand; parallel discovery sweep
  launched for G-1 / OG-23 / e2e fixtures / Caddy.

## In progress

- **M1** — receivables due date from `accepted_at + settlement_types.days`.

## Confirmed facts

| fact | evidence | level |
|---|---|---|
| `staging = 9065cf07`, no open PRs | `git log --oneline -1 origin/staging` → `9065cf07 Merge pull request #377…`; `gh pr list --state open` → empty | RAN |
| Next free migration is **419** | `ls supabase/migrations \| tail -2` and `git ls-tree origin/staging` both end at `20260831190000_418_…` | RAN |
| All 9 accepted quotes have `accepted_at`; 0 NULL | `SELECT count(*), count(accepted_at) … WHERE status='accepted'` → `9 \| 9 \| 0` | RAN |
| `settlement_types_read` is `role() = 'authenticated'` | `pg_policies` where tablename='settlement_types' | CITED |
| `settlement_types_write` is `has_any_role(uid(), ARRAY['admin','accountant'])` | same query — this is migration 416, already merged | CITED |
| 12 settlement types, **3 active**: `cash` days=0, `st_bn5tou` days=5, `st_27a2f6` days=1 | `SELECT code,title,days,is_active … WHERE is_active` | RAN |
| The owner has been using the 416 UI: `st_bn5tou` («تسویه5 روزه», days=5) is new since the last run | comparison with the 11-row/2-active state recorded before 416 | OBSERVED |
| `/accounting/receivables` reads **three RPCs**, not the view directly: `get_receivables_summary`, `get_receivables_list`, `get_receivable_detail` | `src/routes/_app.accounting.receivables.tsx:182,197,216` | CITED |
| **All three RPCs read `vw_customer_receivables`** — so the view is the single point of change | `pg_get_functiondef` of each; each contains exactly one reference | RAN |
| `get_receivables_list` **enumerates its return columns** in `RETURNS TABLE(...)` | `pg_get_functiondef(get_receivables_list)` | QUOTED |
| → therefore adding flag columns to the view is not enough; the RPC signature must change, which needs `DROP FUNCTION` + recreate (a `CREATE OR REPLACE` cannot change a return type) | inference from the line above | CITED |
| The view's due date comes from `q.expires_at::date`, and `days_until_due` / `is_overdue` / `aging_bucket` all derive from `expires_at` too | `pg_get_viewdef('public.vw_customer_receivables')` lines 31, 38, 41, 44-48 | QUOTED |
| The view is **not** a G-1 leak: it already ends `WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())` | same viewdef, final line | QUOTED |
| **BEFORE state of the receivables report: 8 rows, every one with `due_date = NULL`, `days_until_due = NULL`, `is_overdue = false`, `aging_bucket = 'current'`** | view queried live under an admin JWT inside BEGIN/ROLLBACK | OBSERVED (before half) |
| 9 accepted quotes exist but only 8 reach the view — SQ-2026-000003 is fully paid, so `outstanding_amount > 0` excludes it | view filter `GREATEST(final_amount - paid, 0) > 0` | CITED |
| All 9 accepted quotes have both `accepted_at` and `settlement_type_id` | `count(*) FILTER (…)` → `9 \| 9 \| 9` | RAN |

## Blockers

None so far.

## Remaining

M1 receivables · M2 G-1 anon leak · M3 OG-23 UPDATE lock · M4 sales_quotes INSERT hole ·
M5 settlement_types read policy · M6 Phase 6 status (read-only) · M7 pre-399 gate audit
(read-only) · M8 documentation + schema_migrations reconciliation · M9 Caddy HTTPS
diagnosis (read-only).

---

## M1 — receivables real due date · DONE (PR pending merge)

Migration **419**. The view `vw_customer_receivables` now derives `due_date` from
`accepted_at + settlement_types.days`; `get_receivables_list` and `get_receivable_detail`
were dropped and rebuilt to carry the two markers; `get_receivables_summary` was left alone.

| claim | evidence | level |
|---|---|---|
| Before: 8 rows, every `due_date` NULL, nothing overdue, all `current` | probe under an admin JWT, recorded verbatim in the migration header | OBSERVED (before) |
| After: 7 dated rows, **3 overdue**, buckets `d31_60`/`d1_30`/`current` | same probe, same JWT, after apply | OBSERVED (after) |
| Every due date equals `accepted_at + days` | gate G3 — arithmetic over all rows, not a spot check | RAN |
| SQ-2026-000005 (inactive + days=0) gets NO date, reason `inactive_zero_days`, excluded from overdue | gate G5, G6 | RAN |
| inactive + days>0 keeps its date and is flagged | gate G7 — **synthetic**, no live instance exists | RAN |
| missing `accepted_at` withholds the date | gate G8 — **synthetic**, structurally unreachable since 417/418 | RAN |
| active + days=0 stays an ordinary unflagged row | gate G9 | RAN |
| payables untouched | 0 hits for all 5 dependencies in the diff; the 1 hit in the migration is the header comment crediting the pattern (line 23); payables still returns 303 rows / 303 dated / 291 overdue | INDEPENDENT |
| typecheck | 70 before, 70 after | RAN |

**Forced disturbances**
- `419-disturbance-back-to-expires-at.sql` — puts the old expression back inside
  BEGIN…ROLLBACK → G1, G2, G4 red (`dated rows = 0`, `overdue rows = 0`). Real view intact after.
- spec disturbance — same change in the file → 2 of 13 assertions red, file restored to the
  applied md5 `d46f492afbf5e539047ed84ebe10d46e`.

**Assertion narrowed, code not touched:** `expires_at is gone` first failed file-wide (the recovery
block quotes the old definition, deliberately) and then again scoped to the executable half (the
migration's own apply-time check contains the string it searches for). Narrowed to the
CREATE OR REPLACE VIEW statement alone.

## ⚠️ M2 premise invalidated — G-1 appears to be already closed

Parallel discovery reports that all eight `is_viewer_only` views already end with
`WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())`, that `anon` holds **zero** privileges on
them, and that `SET LOCAL ROLE anon` returns `permission denied for view`. It attributes the fix to
migrations 370, 386, 387, 395. It also corrects a count: **12** security_invoker views exist, not 10.

Corroborated first-hand for one of the eight: `pg_get_viewdef('vw_customer_receivables')` ends with
exactly that predicate — I read it while working on M1, before seeing the discovery result.

**Not yet verified by me for the other seven.** M2 begins by re-testing this independently; if it
holds, M2 is a no-op and the brief's premise is false, which is a HALT-and-report condition.

## Blocker (open) — M1 commit cannot be pushed

`git push` rejected: **"push declined due to email privacy restrictions"**.

The repo-local `user.email` is the owner's real address
(`mohammadrezaafra66@gmail.com`), and GitHub's email-privacy setting refuses commits
carrying it. Earlier commits in this run pushed because the effective address was then
`you@example.com`; the repo-local value changed between them. The repo's own merge
commits use `234219238+mohammadrezaafra66-arch@users.noreply.github.com`.

The fix is to re-author one local, never-published commit — `git commit --amend`, which
the harness blocks as history rewriting. Needs the owner. Nothing is lost: commit
`23cc2f27` holds all of M1 and migration 419 is applied to the test database.

---

## M2 — G-1 · NO-OP. Brief premise invalidated.

All eight views already end `WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())`; `anon` holds
zero privileges on all eight; every anon read returns `permission denied for view`; admin and
accountant read all eight correctly (six directly, two through their SECURITY DEFINER RPCs).
Closed by **370** (grants) + **386** (predicate) + **387** (386's gate) + **395**.
Report: `docs/verification/g1-status-on-test.md`.

New finding nobody had enumerated: of 21 views in `public`, **12** carry `security_invoker`
(not 10 — the 10 counts only those that do not ALSO use `is_viewer_only`), and **3** are in the
third category with neither guard. Two of those three are closed by grant. The third,
`v_customer_credit_exposure`, is readable by any `authenticated` session **including one with no
JWT** and returns 0 rows only because it is structurally dead — it filters on a
`quote_exception_type` value the CHECK constraint forbids. **It is a leak armed to appear the
moment that filter is corrected.**

## M3 — OG-23 UPDATE lock · NO-OP. Brief premise invalidated.

Migration **400** (`20260827020000`, applied and in the ledger) closed the UPDATE half on
2026-08-27. Each of the three tables carries both a BEFORE DELETE guard and a BEFORE UPDATE lock;
the lock is per column, driven by `tg_lock_columns_when_posted` with a per-table `TG_ARGV` list,
and `status` is deliberately left mutable. Live: 7/7 assertions pass, forced disturbance red and
specific. Report: `docs/verification/og23-update-lock-status.md`.
