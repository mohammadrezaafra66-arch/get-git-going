# CONTRACTS — production-migration preparation, overnight 2026-09-08

Orchestrator, Stage 0. Every number below was **measured tonight**, not copied.

## 🔴 PRODUCTION IS FORBIDDEN

`192.168.170.10` — no HTTP, no psql, no ping, no DNS. **Not one packet.** We build a runbook the
owner executes; we never migrate production. Its database is named `postgres`; that name appearing
in a command means you are on the wrong machine.

## Ground truth, measured

| Item | Value |
|---|---|
| Repo | `D:\AfraKalaTest\app`, branch `staging` @ **`9c113aac`** ✓ |
| Mission worktree | `D:\AfraKalaTest\wt-prodprep`, branch **`feature/prodprep-20260908`** |
| Branch family | `feature/*` — **verified against `.github/workflows/boundary-guard.yml` `is_feature_branch()` before the first commit** (rule 6; `closeout/*` blocked a PR today) |
| Typecheck | **70**, per file `18/15/13/13/6/5` — confirmed in the worktree, not a silent 0 |
| Test DB | `afrakala` on `afrakala-lan-db` |
| Production (read-only fact) | commit `469fe0a9`, code+schema ceiling **424**, ledger **569 rows / `20260827120000`** |

## 🔴 CORRECTION TO THE AUDIT — the gap is **74**, not 62

The audit's list is correct **as of migration 507**. Staging has moved since: migrations
**508–519** landed today (close-out mission, PRs #432 and #434). Measured:

```
audit list rows                     : 62
disk candidates (>424, plus 420/421): 74
in audit but missing from disk      : NONE
on disk but absent from the audit   : 508 509 510 511 512 513 514 515 516 517 518 519
TRUE GAP                            : 74
```

**Running only the 62 leaves production 12 migrations behind**, including the security work a cold
review produced today: **511** (credit-floor guard), **515/519** (system-health DEFINER guards),
**518** (the guard extended to INSERT). The runbook must carry **74**, in apply order, and the
report must correct the audit's number so the next reader is not misled.

Apply order is **filename timestamp order**, not number order — the numbers interleave
(e.g. `446` sorts before `443`).

## The rehearsal baseline test — both must hold

Production's live schema is at 424. The audit gives two discriminators; a rehearsal that fails
either is on the wrong baseline:

- `bank_accounts.asan_code` **EXISTS**
- `asan_import_person_rows.applied_action` **DOES NOT** (`42703`)

## The lying ledger — reproduce it, do not fix it by re-running

Production: **569 ledger rows, highest `20260827120000` (= migration 410), schema applied through
424.** Anyone reading that ledger concludes 410–424 are outstanding and re-runs them; several are
not idempotent. The reconciliation **records the gap and re-runs nothing**, and must assert the
inserted count equals the gap count — `ON CONFLICT DO NOTHING` exits 0 on a collision, which is how
migration 517 nearly went unrecorded today (`CONTRACTS.md` §24 of the close-out mission).

## Two production objects are ALREADY in the desired state

Fixed manually by the owner on 2026-09-07, **before** these migrations run:

1. `receipt_ocr.vision` → `ollama`, fallback off, `gpt.is_active=f` — this is **migration 460's target**.
2. `anon` REVOKEd on `v_promotion_suggestions` and `vw_account_balances`.

Migrations landing on these must read **"no change" as "already applied"**, not as failure. R-5 proves it.

## What the 74 do NOT cover — the runbook needs three extra steps

1. **Migration 477 only covers tables** (`relkind = 'r'`). **Views are not covered** — the view
   REVOKE is a separate step.
2. **`ALTER DEFAULT PRIVILEGES … TO anon` is still open** on production; no migration closes it.
3. **The deploy of the new build** is not a migration.

## Rules that bit this project

1. **Persian SQL by file only** — `docker cp` with `MSYS_NO_PATHCONV=1`, then `psql -f`. Never a pipe;
   a pipe destroyed Persian in 44 functions on 2026-07-11. Verify `md5sum` both sides.
2. **Apply, then record the ledger row, then assert the row is yours.**
3. **Read live** — `pg_get_functiondef`, `pg_policies`, `proacl`, `relacl`. Never from a migration file.
4. **Discover column names by querying** — it is `persons.display_name`, not `full_name`;
   `audit_logs.entity_id`, not `record_id`; `daily_capital_settings.capital_date`, not `setting_date`.
5. **Never `git stash`.** Record `git status --porcelain` at start and end.
6. A test that cannot go red proves nothing. A negative test must fail **for the reason under test** —
   assert the message, not `42501`, which RLS, a missing grant and a guard all raise.
7. `--single-transaction -v ON_ERROR_STOP=1` on every apply.
8. Migration **328**'s event trigger: adding an FK to `persons` requires `person_merge` updated
   **first**, or the DDL aborts.

## Migration numbers

**520+** belong to C-1 only. No other row writes a migration.

## Owner decisions — carry, do not relitigate

**D-59** 23 of 42 production users hold `admin`; they stay for now — record the consequence (the 15
new admin gates are open to half the company), change nothing.
**D-24** the public sale-list page stays closed to anonymous visitors.
**D-56** `product_images` public read is intentional.

## Deliverables

- `docs/runbooks/production-migration-20260908.md` — every step rehearsed, or marked `UNREHEARSED`.
- `docs/research/prodprep-20260908.md` — the completion report.

---

## Addendum — three corrections from C-2, one of them to this contract

### 1. 🔴 My brief said "6 jobs, all running successfully". That was wrong.

Measured independently after C-2 reported it:

```
jobid 9  daily-birthday-notifications              ok=0   bad=56
jobid 20 afrakala-capture-score-snapshots-nightly  ok=2   bad=0
jobid 21 afrakala-refresh-sale-list-prices-nightly ok=2   bad=0
jobid 22 afrakala-sync-price-observatory-daily     ok=2   bad=0
jobid 23 afrakala-accrual-daily-notice             ok=2   bad=0
jobid 25 afrakala-employee-streaks-nightly         ok=2   bad=0
```

**Five of six. `daily-birthday-notifications` has never once succeeded** — 56 failures, zero
successes, failing with `ERROR: authentication required` at `generate_birthday_notifications()`
line 17: the cron-has-no-`auth.uid()` trap that migration 507 documents.

I asserted this as a measured fact and it was not measured. It is also the same shape as everything
else this project keeps finding: **a job that has failed 56 consecutive times, and nothing reports
it.** Recorded, not fixed — out of scope tonight.

### 2. A fourth cron candidate existed on record and my brief omitted it

The compose **cron sidecar** (`docs/missions/closeout/CONTRACTS.md` §26). C-2 measured it rather
than dropping it: CLAUDE.md's OG-68 objection does **not** currently reproduce
(`afrakala-lan-db-role-fix` exits 0), but the deploy command `up -d --no-deps --build web` would
never start or refresh a sidecar — which is a real argument against it, and only visible because
the candidate was measured instead of discarded.

### 3. All cron candidates share a dependency nobody named — and it affects the runbook

`com.docker.service` is **Stopped/Manual**; Docker Desktop runs in **SessionId 1** from a per-user
`HKCU\…\Run` key, and `AutoAdminLogon` is empty.

**The containers come back after a reboot only when that user session does**, and by what mechanism
is **UNKNOWN**. This is upstream of every scheduling choice: a schedule inside a container that does
not start is not a schedule. It also bears on the production runbook — if the same arrangement holds
there, an unattended reboot mid-migration may not bring the database back on its own.

**Not measured on production and must not be** — flagged in the runbook as a preflight question for
the owner to answer about their own machine.

---

## 🔴 PREFLIGHT #1 — production may be missing 29 migrations BELOW its stated ceiling

**Found by the rehearsal agent. Verified independently by the orchestrator. This is the first thing
the runbook asks the owner to check, before any backup or migration.**

### What was found

The rehearsal baseline (a pristine restore of the real production dump `prod-full-20260831.dump`,
md5 `41830357199bf4fe743e824fee89f3f5`) is missing the whole ledger-documents / dual-document /
reversal module — **migrations 336–370**. Absent objects include `document_numbers`,
`document_attachments`, `dual_documents`, `journal_entries.doc_kind`,
`journal_entries.reverses_entry_id` and 16 reversal columns.

Direct symptom: **migration 422 cannot run on that baseline** —
`relation "public.document_numbers" does not exist`.

### Why "the dump is just stale" does NOT explain it

Verified by the orchestrator from local git only — **no production contact**:

```
migrations 336-370 are dated   2026-08-18 … 2026-08-22
the dump is dated              2026-08-31          <-- NINE DAYS LATER
production's commit 469fe0a9 CONTAINS all 36 of those files
migration 422 = 20260903160000_422_document_register_view.sql
```

The code has shipped 336–370 since 22 August. The dump was taken on 31 August. **If production had
applied them, the dump would contain their objects.** It does not.

### The contradiction the owner must resolve

The audit states production's schema ceiling is **424**, which requires 422 to have applied. **422
cannot apply without the 336–370 module.** So exactly one of these is true:

1. **Production's ceiling is not really 424** — 422 never applied, and the audit's two
   discriminators cannot tell, because *a database with this hole passes both of them*
   (`bank_accounts.asan_code` exists, `asan_import_person_rows.applied_action` does not).
2. **Production applied 336–370 between 2026-08-31 and the 2026-09-04 deploy**, after the dump was
   taken. Possible, and would make the hole a dump artefact only.

**This is genuinely UNKNOWN and cannot be settled without reading production**, which no agent may
do. One read-only query answers it:

```sql
-- OWNER RUNS THIS ON PRODUCTION, READ ONLY, BEFORE ANYTHING ELSE
SELECT to_regclass('public.document_numbers')  AS document_numbers,
       to_regclass('public.dual_documents')    AS dual_documents,
       to_regclass('public.document_attachments') AS document_attachments;
```

**If any is NULL, do not start the migration run.** The 74 assume that module exists; several
depend on it, and the failure mode is a partial apply on the company's real records rather than a
clean refusal.

### Why the audit could not have caught this

Its discriminators were chosen to distinguish 424 from 425+, and they do that correctly. They were
never meant to detect a hole *below* the ceiling, and they cannot. **This is not a defect in the
audit; it is a limit of ceiling-based reasoning** — a ceiling tells you the highest thing applied,
never that everything beneath it was.

---

## C-1 verified by the orchestrator — and two more corrections to my briefs

**The guard now works in both directions.** Same input, before and after, measured independently:

```
before: {"switched_over": true,  "mapped_extensions": 1, "rows_written": 0}
after : {"switched_over": false, "reason": "unmapped_extensions",
         "blocked_by": ["201","401","402","404","406","407","413","449","450"],
         "unmapped_calls": 323, "unmapped_extensions": 9, "extensions_in_window": 10}
```

`trg_staff_call_metrics_manual_guard` exists on `staff_daily_performance_metrics`, and the 11
pre-go-live manual rows are byte-identical (`md5 90f6f5e0…`, unchanged since before the work began).

A **third** safe state appeared that nobody specified: for a date with no imported calls the function
returns `reason: "no_call_data"` and stays closed, rather than treating an empty window as full
coverage. That is the right behaviour and worth keeping.

### Correction 1 — I said 18 extensions; in the derived window there are 10

My "18 agent extensions" came from **90 days of MySQL CDR**. The predicate is **per-window** and sees
what is in `call_logs`: **10** extensions, 9 unmapped. Both numbers are right for their scope, and
the difference is the property working as intended — a per-window predicate must not be blocked by a
desk that emitted nothing in the window.

Three rows in `call_log_extensions` (`408`, `409`, `445`) had **no calls at all** in the window and
correctly do not block. That is the "decommissioned desk" case the traffic-weighting was for.

### Correction 2 — extension `201` exists and neither of my measurements listed it

`201` appears in `blocked_by`. My 90-day sweep produced `401-413, 445-450` and never saw it. So the
list I gave the owner for mapping was **incomplete**, and the screen suggestion list built from it
would be too.

Recorded as out-of-scope by the C-1 agent and worth repeating: **`/admin/call-extensions` should
offer the extensions actually present in `call_logs`, not a hardcoded list** — otherwise `201`,
`406`, `449` and `450` are invisible to the operator, and four of the nine blockers can never be
cleared through the UI.

### Correction 3 — the old guard could never have opened at all

The C-1 agent measured, before changing anything, that even a **fully simulated mapping** produced
`rows_written: 0`. The aggregation keyed on `cl.employee_id`, which is NULL on all 1509 rows. So the
gate was not merely mis-thresholded: **neither of its states was reachable** — it could report
`switched_over: true` while being structurally incapable of writing a row. Fixed with a `COALESCE`
onto the extension mapping, recorded as a deliberate decision rather than a silent repair.

This is why "prove both directions" is the rule. A guard tested only in its blocking state would
have passed review here, twice.

---

## R-4 / R-5 — three findings that outrank the 74-row table

**60 applied · 14 failed · 0 already-true · 0 unrehearsable · 31.8 s.** Ledger 579 → 639, every row
asserted `ROW_COUNT = 1`. 74/74 md5-matched on delivery; Persian NOTICEs arrived intact.

### 🔴 A · Migration 460 will ABORT on production — the run stops at step 25 of 74

Verified by the orchestrator from the file itself:

```
460 hard-codes : '0fbe576a-9ef3-475b-92e7-fabd981a7d5d'  ·  'd30816a9-8ff0-4d0e-8f25-0661f8cbea61'
production has : f6a5bc04 (gpt)  ·  e07894ce (ollama)
```

Those are the **test** database's provider UUIDs. 460 also carries four `RAISE EXCEPTION` guards —
*"refusing to deactivate an unidentified provider"*. **The guards are correct behaviour**; combined
with hard-coded UUIDs they make the migration test-database-specific and unrunnable on production.
The R-4 agent simulated the owner's manual fix in its most favourable form — even granting ollama the
`vision` capability it lacks — and 460 still raised.

**R-5's premise fails for this object.** "No change" is not what happens; the run ends. Needs an
`OWNER DECISION` at that point in the sequence. **The view-REVOKE half of R-5 behaved exactly as
hoped** — both halves observed, second pass byte-identical.

### 🔴 B · PREFLIGHT #1's query is insufficient — the ledger lies in BOTH directions

Migration **408** (`hold_credit_for_quote`) is also absent from the baseline. It sits **above** the
336–370 band, so the preflight query misses it — and **the ledger records 408 as applied.**

So the ledger both **under**-reports (410–424 applied, unrecorded) and **over**-reports (408 recorded,
not applied). Add to the preflight:

```sql
SELECT to_regprocedure('public.hold_credit_for_quote(uuid,uuid)');
```

### 🔴 C · `ALTER DEFAULT PRIVILEGES … TO anon` is a PREREQUISITE, not a clean-up

Production carries **nine open `pg_default_acl` anon entries**. The test computer carries **zero** —
verified directly by the orchestrator. That asymmetry is why this defect class is invisible on test,
and why 507 passes there and fails on the rehearsal.

**26 of the 80 functions created by the successful migrations are born `anon`-EXECUTE-able** —
including `pay_purchase_with_voucher`, `review_credit_request` and `reverse_document`.

**Running the 74 without closing the default privilege first manufactures 26 anon-callable functions
on production**, three of them money- or identity-bearing. This moves from "step 2 of the three
things the migrations don't cover" to **a prerequisite in the preflight.**

### The 14 failures, classified — and why the split matters

- **(a) real defect, would fail on production — 5:** `449`, `450`, `452` (absolute row-count
  assertions carrying test-only constants — the same defect as `410`/`418`, now **five** instances),
  `460`, `507`. Plus `475` cascading behind 460.
- **(b) artefact of the 336–370 hole — 4:** `476`, `477`, `478`, `487`. Plus `497 → 514 → 516`
  cascading behind 477.
- **(b′) the newly-found 408 hole — 1:** `462`.

**(b) and (b′) may evaporate entirely** if the owner's preflight shows production has those objects.
**(a) will fail on production regardless.** Reporting them as one number would hide that.

### Correction — nothing in the 74 is unrehearsable for `pg_cron`

Zero non-comment `cron.` references across all 74 files. My brief and R-1 §6.5 both claimed
otherwise; both were wrong.
