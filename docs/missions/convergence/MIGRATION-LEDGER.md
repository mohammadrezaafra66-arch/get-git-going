# Convergence mission · reserved migration identities

**Reserved 2026-09-12 18:5x by the orchestrator, before any dispatch (§3.4).**
An agent uses **only** the identities on its own rows. Taking an unreserved number is a
partition violation and the gate rejects it.

**Verified free at reservation time:** highest migration anywhere in the repository is **525**
(`20260912150000`). `git log --all --diff-filter=A` over `supabase/migrations/*` returns
`_520_ _521_ _522_ _523_ _524_ _525_` and nothing above. 690 migration files on disk at
`d60232f5`.

**Every timestamp below sorts after `20260912150000`**, which is production's current ledger top.

| # | timestamp | owner | purpose | status |
|---|---|---|---|---|
| **526** | `20260913090000` | **E-1** | 🔴 **Catalogue repair — E-1's FIRST task (owner-directed).** ONE migration bringing the five drifted objects (386, 394, 396, 404, 409) to the state their own migrations assert. Catalogue-driven, idempotent, no-op where already correct. **Ledger rows stay — never DELETE one** | ASSIGNED |
| 527 | `20260913091000` | **E-1** | **336 replacement** — R-1 verdict `NEEDS-REPLACEMENT`: the file aborts on production via `current_database() <> 'afrakala'` (prod db is `postgres`). DDL itself proven safe | ASSIGNED |
| 528 | `20260913092000` | **E-1** | **343 replacement** — same hardcoded guard. Logic proven safe: 17/17 posted entries and 34/34 lines correctly refuse UPDATE; **not** a stop condition | ASSIGNED |
| 529 | `20260913093000` | **E-1** | spare for the six-migration slice. **411/412/413 need NO replacement** — owner APPROVED OG-A; they ship as-is in their own RELEASE block with the three-customer table in the header | RESERVED |
| 530 | `20260913094000` | **E-2** | overdue sensor of record — rewrite `can_issue_customer_invoice` to the R-2 predicate (OG-D) | RESERVED |
| 531 | `20260913095000` | **E-2** | `audit_logs_actor_id_fkey` → `ON DELETE SET NULL` (OG-F) | RESERVED |
| 532 | `20260913100000` | **E-2** | `auth.users` signup triggers — one trigger on both shapes (OG-E) | RESERVED |
| 533 | `20260913101000` | **E-5** | `pg_cron` + `http`, job definitions in UTC, SECURITY DEFINER wrappers each carrying its own REVOKE (507 rule) | RESERVED |
| 534 | `20260913102000` | **E-5** | `cron_run_log` table + RLS (admin/manager read only) | RESERVED |
| 535 | `20260913103000` | **E-6** | S-5 — `delete_bot_api_key_secure`, `admin_upsert_ai_provider`, `admin_delete_ai_provider` | RESERVED |
| 536 | `20260913104000` | **E-6** | S-5 — `ai_providers.updated_by` + trigger from `auth.uid()` | RESERVED |
| 537 | `20260913105000` | *(unassigned)* | contingency — orchestrator assigns on request via STATE | FREE |
| 538 | `20260913110000` | *(unassigned)* | contingency | FREE |
| 539 | `20260913111000` | *(unassigned)* | contingency | FREE |
| 540 | `20260913112000` | *(unassigned)* | contingency | FREE |

**No migration number is assigned to E-3 (frontend) or E-4 (release line).** If either believes
it needs one, it writes the request into `STATE.md` and stops; the orchestrator assigns from
537–540 and records it here.

## Rules attached to every row

1. The file is **catalogue-driven** (`to_regclass`, `to_regprocedure`, skip-if-absent,
   `IS DISTINCT FROM`) so that on the wrong shape it no-ops rather than aborts. 477 aborted on
   2026-09-12 because it was a static list; 523/524/525 are the corrected pattern to copy.
2. ASCII-only **unless** the file carries Persian UI strings, in which case it is delivered by
   `docker cp` + `psql -f` and never through a PowerShell pipe.
3. Every `SECURITY DEFINER` function created carries its own
   `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` in the same file (the 507 lesson).
4. Before any `CREATE OR REPLACE FUNCTION`, the live body is read with `pg_get_functiondef` and
   diffed against the newest migration that defines it — the database sometimes holds an older
   body than git.
5. Rehearsed on the agent's **own** `prod_rehearsal_e<n>`, restored from a production dump.
   **A migration that only passed on `afrakala` has not passed** (rule 2 of the mission).
