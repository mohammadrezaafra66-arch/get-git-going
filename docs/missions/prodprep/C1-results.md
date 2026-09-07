# C-1 — the coverage guard, and the half of it that was never built

Overnight 2026-09-08, worktree `D:\AfraKalaTest\wt-prodprep`, branch `feature/prodprep-20260908`.
Test host only (`afrakala-lan-db` / database `afrakala`). **No packet was sent to `192.168.170.10`.**

Every number below was measured on this database tonight. Where a claim in the brief did not
survive measurement, the measurement is recorded next to it.

---

## Worktree state

| | at start | before my commit |
|---|---|---|
| `git rev-parse HEAD` | `9c113aacb19f4593b5583f94af905c34f348e27b` | `aa9c3c061de9a4e3ff94e1f02136f9c9a0a76e05` |
| `git status --porcelain` | `?? docs/missions/prodprep/` | `M src/routes/_app.gamification.admin.manual-metrics.tsx`<br>`?? docs/missions/prodprep/C1-results.md`<br>`?? supabase/migrations/20260908030000_520_…sql`<br>`?? supabase/migrations/20260908034500_521_…sql` |

**HEAD moved under me, and that is expected here, not an alarm.** The other agent sharing this
worktree committed `aa9c3c06` mid-mission, which is why `docs/missions/prodprep/` stopped showing
as untracked: `CONTRACTS.md`, `R1-R3-results.md`, `C2-cron-verdict.md`, `MIGRATIONS-74.md`,
`ledger-evidence.sh`, `ledger-reconcile.sh`, `not-applied-rehearsal.txt` and
`r2-reproduce-lying-ledger.sql` are theirs and are now tracked. I created only `C1-results.md` in
that directory, read `CONTRACTS.md`, and modified none of the rest. Nothing outside my own three
paths was staged — `git add` and `git commit` both carried an explicit pathspec, in one shell
invocation. No `git stash` at any point. No `prod_rehearsal_*` database was touched.

---

## What changed

| File | What |
|---|---|
| `D:\AfraKalaTest\wt-prodprep\supabase\migrations\20260908030000_520_staff_call_metrics_coverage_guard.sql` | new — the coverage predicate, the rewritten derive function, and the manual-write trigger |
| `D:\AfraKalaTest\wt-prodprep\supabase\migrations\20260908034500_521_manual_guard_trigger_fn_least_privilege.sql` | new — closes a default-privilege `EXECUTE` that 520 did not, found by measuring `proacl` |
| `D:\AfraKalaTest\wt-prodprep\src\routes\_app.gamification.admin.manual-metrics.tsx` | +124 / −4 — the coverage query, the Persian notice, and the three call fields disabled once the CDR is authoritative |

Database objects, all in `public`:

- `staff_call_metrics_coverage(date) -> jsonb` — **new**
- `derive_staff_call_metrics(date) -> jsonb` — **replaced**, signature identical (asserted below)
- `staff_call_metrics_manual_guard() -> trigger` — **new**
- `trg_staff_call_metrics_manual_guard BEFORE INSERT OR UPDATE ON staff_daily_performance_metrics FOR EACH ROW` — **new**

---

## Callers I checked before changing anything

`derive_staff_call_metrics` had **no caller at all** — not in SQL, not in TypeScript, not in the
e2e suite:

```
$ grep -rln "derive_staff_call_metrics" --include=*.sql --include=*.ts --include=*.tsx .
./supabase/migrations/20260907154500_517_derive_staff_call_metrics.sql
```

That is the brief's point restated as evidence: the only thing protecting the KPI was that
nobody had wired the caller yet.

Live writers of `staff_daily_performance_metrics` — enumerated from `pg_get_functiondef` over
every non-C function in the database, not from the repo:

```
compute_employee_score(uuid,jsonb)                                    reads only
manual_daily_metrics_totals(uuid,timestamptz)                         reads only
derive_staff_call_metrics(date)                                       WRITES  <- the switchover
upsert_staff_daily_performance_metric(uuid,date,numeric,numeric,
                                      integer,integer,integer,text)   WRITES  <- the manual screen
```

`cron.job` does not exist on this database (`ERROR: relation "cron.job" does not exist`), so there
is no scheduled third writer. TypeScript touches the table in exactly one route
(`_app.gamification.admin.manual-metrics.tsx`), and only through that RPC.

---

## Baseline before the change

`npx tsc --noEmit` — **70 errors**, `18/15/13/13/6/5`:

```
     18 src/routes/_app.products.index.tsx
     15 src/routes/_app.admin.sales-reminders.tsx
     13 src/lib/invoices/functions.ts
     13 src/lib/accounting/functions.ts
      6 src/lib/audit/index.ts
      5 src/routes/_app.admin.automation.tsx
```

`npx eslint src/routes/_app.gamification.admin.manual-metrics.tsx` on the **HEAD** version of the
file (copied to a scratch path and linted there, since `git stash` is forbidden) — **1 pre-existing
prettier error**, the `ManualMetricsTotalsCard` signature. Part of the project's known legacy
baseline.

The eleven manual rows, fingerprinted by content and not by count:

```
manual_rows = 11   md5 = e2d3576ed91b42bc3e73bd785f5de993
metric_date 2026-07-23 .. 2026-08-11, 8 staff
```

---

## The defect, reproduced

```
call_log_extensions          : 9 rows, 1 mapped (ext 403), 8 unmapped
call_logs                    : 1509 rows, 0 with employee_id, 10 distinct extensions
                               (+1109 rows with a NULL extension)
shop_settings.issabel_import_since_date = 2026-09-07
tehran_today()               = 2026-09-08
```

Extensions that emitted a call on 2026-09-07, against the mapping table:

```
 ext | calls | in call_log_extensions | mapped
 201 |     1 | no                     | no
 401 |    22 | yes                    | no
 402 |     4 | yes                    | no
 403 |    77 | yes                    | YES
 404 |    33 | yes                    | no
 406 |     3 | no                     | no
 407 |    95 | yes                    | no
 413 |   149 | yes                    | no
 449 |    15 | no                     | no
 450 |     1 | yes -> no              | no
```

### Two corrections to the brief

1. **The CDR carries 10 agent extensions in this data, not 18.** The brief said "18 agent
   extensions (401-413, 445-450); 17 are unmapped". Measured: `call_logs` holds **10** distinct
   non-NULL extensions, of which **9** are unmapped. Four of those ten (**201, 406, 449, 450**)
   are not rows in `call_log_extensions` at all — they emit calls that the mapping screen has
   never even listed. Three rows that *are* in the table (**408, 409, 445**) emitted no calls at
   all on that day, which is exactly the "decommissioned desk" the traffic weighting must not let
   block the switch forever. The direction of the brief's argument is unchanged and the guard is
   unchanged; the count is.
2. **1109 of the 1509 call rows have a NULL `extension`.** They cannot be attributed to any desk
   by any mapping, so counting them would make the guard permanently unopenable. They are excluded
   (`cl.extension IS NOT NULL`) and this is recorded as a known limitation below, not hidden.

---

## Where the gate lives, and why

**In a trigger on the table, mirrored in the UI. Not in the RPC body, not in the UI alone.**

- **UI alone is not acceptable** — CLAUDE.md rule 6, "frontend-only authorization is not
  acceptable". The screen only mirrors the database's decision; it never makes it.
- **The RPC body alone is not enough, and that is measured, not assumed.** `staff_daily_performance_metrics`
  carries `sdpm_insert_privileged` / `sdpm_update_privileged`, which let any admin, manager or
  accountant write the table **directly**, and PostgREST exposes the table. A guard living only
  inside `upsert_staff_daily_performance_metric` would be bypassed by a plain
  `POST /rest/v1/staff_daily_performance_metrics`. Probe **P7** and **Q4** exercise exactly that
  path; before 520 it succeeded, after 520 it is refused.

### The asymmetry — which legitimate writers must *not* be caught

This is the failure mode the brief warned about, so it was enumerated rather than guessed. The
guard lets through:

| Writer | How it passes | Verified by |
|---|---|---|
| `derive_staff_call_metrics` — the switchover itself | sets `afrakala.deriving_call_metrics = 'on'` transaction-locally, and back to `'off'` immediately after the INSERT | P3, Q9 |
| A migration, a backend job, `service_role` — no JWT subject | the coverage function only checks roles when `auth.uid()` is non-NULL | by construction; `anon` has no `EXECUTE` at all (Q3) |
| Any write that does not touch the three call columns | `IS NOT DISTINCT FROM` on UPDATE; all-zero on INSERT | P6, Q6 |
| Any write for a date the CDR is not authoritative for | coverage returns `covered:false` for `before_go_live`, `no_call_data`, `no_go_live_date`, `unmapped_extensions` | P4, Q5, Q7, Q8 |

The flag is a deliberate, transaction-local declaration. **Anyone with direct SQL access can set
it** — this guard stops the application's write paths, not a superuser, and it is not claimed to
do more. Q9 shows the flag does not leak: a manual write in the same transaction immediately
after `derive_staff_call_metrics` returns is still refused.

### A design decision that goes slightly beyond "add a predicate", stated plainly

`derive_staff_call_metrics` aggregated on `cl.employee_id`, which the importer attaches **at
import time**. Probe **P3 before the change** is the proof that this made the guard's promise
false: with a *complete* mapping simulated, the old function still returned
`switched_over: true, rows_written: 0`, because every existing row predates the mapping. A guard
that says "the mapping is complete, the CDR is authoritative" while writing nothing is a worse lie
than the one it replaced.

So the aggregation now resolves `COALESCE(cl.employee_id, e.employee_id)` — the importer's own
attribution first, the live extension mapping as a fallback. This never drops a row that used to
be included and never re-attributes a row that already had an owner; it only rescues rows imported
before their desk was mapped. The coverage guard is what makes the fallback total: it will not
open unless every extension in the window resolves.

Alternative considered and rejected: leave the aggregation alone and let the guard open onto zero
rows. That reproduces tonight's defect with extra steps.

---

## E4 — the same probe, before and after

Probe file: `c1-probe.sql`, 6961 bytes, md5 `f5aaa2e01a9383beebd4a685b889cd12` — **identical file,
identical delivery, run before and after**. Delivered over `docker exec -i` stdin (see "Delivery"
below), md5 verified on both sides. Everything runs inside `BEGIN … ROLLBACK`.

### P2 — blocked, with today's real single mapping

```
$ psql -f /tmp/c1-probe.sql        # derive_staff_call_metrics('2026-09-07')
```

| before | after |
|---|---|
| <pre>{<br>  "go_live": "2026-09-07",<br>  "for_date": "2026-09-07",<br>  "rows_written": 0,<br>  "switched_over": true,<br>  "mapped_extensions": 1<br>}</pre> | <pre>{<br>  "reason": "unmapped_extensions",<br>  "go_live": "2026-09-07",<br>  "for_date": "2026-09-07",<br>  "blocked_by": ["201","401","402","404",<br>                 "406","407","413","449","450"],<br>  "rows_written": 0,<br>  "switched_over": false,<br>  "unmapped_calls": 323,<br>  "unmapped_extensions": 9,<br>  "extensions_in_window": 10<br>}</pre> |

One test row no longer opens the gate, and the refusal names the nine desks that are holding it
shut and the 323 calls they made.

### P3 — open, under a simulated full mapping, rolled back

Every extension with traffic on 2026-09-07 is mapped to a distinct active profile inside the
transaction, then `derive_staff_call_metrics('2026-09-07')` runs.

| before | after |
|---|---|
| `switched_over: true, mapped_extensions: 10, rows_written: 0` | `switched_over: true, reason: "covered", rows_written: 6` |
| rows in `staff_daily_performance_metrics` for that day: **0** | rows for that day: **6** |

**The guard has been observed in its open state**, and the derivation actually produces rows.
Before the change it could not, in either direction — which is why "it only wrote 0 rows by
accident" was the right reading.

### P4 / P5 / P6 / P7 — the manual screen

| probe | before | after |
|---|---|---|
| P4 · manual call KPIs while **blocked** (today's real data), through the real RPC | succeeded | **succeeded** — manual entry continues, as required |
| P5 · manual call KPIs while **covered**, through the real RPC | succeeded | **refused** |
| P6 · sales + profit only while **covered** | succeeded | **succeeded** — non-call columns unaffected |
| P7 · **direct table write**, bypassing the RPC entirely, while covered | succeeded | **refused** |

The refusal in P5 and P7, quoted exactly, raised from `staff_call_metrics_manual_guard()` line 30:

```
ERROR:  ثبت دستی آمار تماس برای 2026-09-07 مجاز نیست: نگاشت داخلی‌ها برای این روز کامل است
        و آمار تماس از CDR محاسبه می‌شود. فروش و سود همچنان دستی ثبت می‌شوند.
```

That is asserted **by message**, not by SQLSTATE — `42501` is raised by RLS, by a missing grant and
by a guard alike, and would not distinguish them.

### P8 — the hard go-live guard, untouched

Identical before and after, same SQLSTATE `22003`, same Persian text:

```
ERROR:  استخراج آمار تماس برای 2026-08-01 رد شد چون پیش از تاریخ شروع (2026-09-07) است.
        ردیف‌های دستیِ پیش از go-live بازنویسی نمی‌شوند.
CONTEXT:  PL/pgSQL function derive_staff_call_metrics(date) line 22 at RAISE
```

### P0 / P2b / P9 — the eleven manual rows

`md5 = e2d3576ed91b42bc3e73bd785f5de993`, 11 rows — **before, between every probe, and after**.
Compared on content (date, staff, all five values, notes, `updated_at`), not on the row count.

---

## The roles that actually reach the guard — probe 2

`c1-probe2.sql`, md5 `79085a4eae59942bae4d519bd201e067`, all inside `BEGIN … ROLLBACK`.

| | result |
|---|---|
| **Q1** coverage RPC as admin (`SET ROLE authenticated` + JWT claims) | returns the coverage object |
| **Q2** coverage RPC as a `sales` user | `ERROR: دسترسی غیرمجاز برای مشاهدهٔ وضعیت نگاشت داخلی‌ها` — refused **by the guard's own message** |
| **Q3** coverage RPC as `anon` | `ERROR: permission denied for function staff_call_metrics_coverage` — no grant at all |
| **Q4** direct write as the real `authenticated` role, covered | refused with the guard's message |
| **Q5** the same write while blocked | **succeeds** — the guard is conditional, not a blanket block |
| **Q6** `UPDATE … SET sales_amount` while covered | succeeds |
| **Q7** an empty window (today, `2026-09-08`, zero calls) | `covered:false, reason:"no_call_data"` → manual entry stays open |
| **Q8** a pre-go-live date | `covered:false, reason:"before_go_live"`; `UPDATE 11` — the eleven rows remain editable |
| **Q9** the bypass flag after `derive` returns | `off`; a manual write in the same transaction is still refused — no leak |
| **Q10** final fingerprint | `e2d3576ed91b42bc3e73bd785f5de993` |

Q7 is deliberate and worth stating: **an empty window is not "covered".** If it were, a day the
importer failed on would be locked out of manual entry too and would end up empty from both
sources. The same reasoning keeps `no_go_live_date` open rather than raising — a misconfiguration
must never be able to lock the manual screen.

---

## Delivery and ledger

`docker cp` failed at the mount layer, as documented (`GetFileAttributesEx D:\c: The system cannot
find the file specified`), so everything went over `docker exec -i` stdin with md5 verified on
both sides — never a pipe.

| file | bytes | md5 local | md5 in container |
|---|---|---|---|
| `…_520_staff_call_metrics_coverage_guard.sql` | 21280 | `66a009f93f764f0e0ca77444ab89909e` | `66a009f93f764f0e0ca77444ab89909e` |
| `…_521_manual_guard_trigger_fn_least_privilege.sql` | — | `0456d83c080ec6eaf5092e0bbf33f891` | `0456d83c080ec6eaf5092e0bbf33f891` |
| `c1-probe.sql` | 6961 | `f5aaa2e01a9383beebd4a685b889cd12` | `f5aaa2e01a9383beebd4a685b889cd12` |
| `c1-probe2.sql` | — | `79085a4eae59942bae4d519bd201e067` | `79085a4eae59942bae4d519bd201e067` |

Both applied with `-v ON_ERROR_STOP=1 --single-transaction`, exit code 0.

Numbers were re-checked against **disk and ledger** at the moment of writing: highest on disk was
519 (`20260907170000`), ledger held 684 rows against 684 files, and no `2026-09-08*` version
existed. Each ledger row was recorded in the same breath as the apply, **and asserted to be mine**
rather than trusting `ON CONFLICT DO NOTHING`'s exit code:

```
 pre_existing            0
 rows_i_inserted         1     which = 20260908030000
 pre_existing            0
 rows_i_inserted         1     which = 20260908034500
 ledger_rows           686     files on disk 686
```

`docker restart afrakala-lan-rest` was run after the function and grant changes.

---

## Signature and privilege assertions

`derive_staff_call_metrics` was **replaced, not overloaded** — exactly one signature survives:

```
derive_staff_call_metrics(date)       | supabase_admin | secdef | {postgres=X,supabase_admin=X,service_role=X}
staff_call_metrics_coverage(date)     | supabase_admin | secdef | {postgres=X,supabase_admin=X,authenticated=X,service_role=X}
staff_call_metrics_manual_guard()     | supabase_admin | secdef | {postgres=X,supabase_admin=X,service_role=X}
```

`derive_staff_call_metrics`'s ACL is byte-identical to what it was before the change: no `anon`,
no `authenticated`, no `PUBLIC`.

**Migration 521 exists because that assertion caught something.** 520 wrote no `GRANT` for the
trigger function, yet `proacl` came back carrying `authenticated=X/supabase_admin` — inherited from
an `ALTER DEFAULT PRIVILEGES` on this database (`pg_default_acl` holds a
`{postgres=X,authenticated=X,service_role=X}` row for functions). It is not exploitable —
PostgreSQL itself answers a direct call with `ERROR: trigger functions can only be called as
triggers` — but PostgREST publishes every `public` function `authenticated` may execute as an
`/rpc` endpoint. This is precisely why the rule says measure `proacl` instead of trusting the
`REVOKE` statement; here the trap was an absent statement rather than an ineffective one.

Triggers now on the table:

```
staff_daily_perf_updated_at          BEFORE UPDATE            ... set_updated_at()
trg_staff_call_metrics_manual_guard  BEFORE INSERT OR UPDATE  ... staff_call_metrics_manual_guard()
```

---

## The UI half

`src/routes/_app.gamification.admin.manual-metrics.tsx` now calls
`staff_call_metrics_coverage(_for_date)` for the selected day and mirrors the answer:

- **blocked** (`reason = "unmapped_extensions"`) — manual entry continues, and an RTL Persian
  notice carries the required sentence verbatim,
  *«تا وقتی داخلی‌ها به کارمندان نسبت داده نشوند، آمار تماس از CDR محاسبه نمی‌شود»*, followed by the
  count of unmapped desks, the count of calls they made, the extension numbers themselves (LTR,
  monospaced, inside an RTL paragraph), and a link to `/admin/call-extensions` — the screen that
  ends the condition.
- **covered** — the three call inputs are disabled with a per-field hint, and a second notice says
  the day's numbers now come from the CDR while sales and profit stay manual. The trigger refuses
  the same write regardless, so this is presentation, not authorisation.
- The RPC's refusal for a non-privileged account is not retried (`retry: false`), and a failed
  coverage read leaves manual entry **open** — the database is the enforcer, so the UI failing
  closed would only remove a working feature.

Everything added is Persian and inside the page's existing `dir="rtl"`; digits go through
`toFaDigits`, dates through `formatDateFa`, matching the rest of the file.

---

## API contract — what changed and what did not

**Unchanged:** the signature `derive_staff_call_metrics(date) -> jsonb`; its `EXECUTE` grants; the
`22004` no-go-live-date exception; the `22003` pre-go-live refusal and its exact Persian text; the
`switched_over` / `for_date` / `go_live` / `rows_written` keys; `upsert_staff_daily_performance_metric`'s
signature and behaviour for every date the CDR is not authoritative for.

**Changed, and it has no consumer to break** (`grep` above found none anywhere in the repo):

- `switched_over` is now `false` in three additional situations that previously reported `true`:
  unmapped extensions in the window, an empty window, and a missing go-live setting.
- New keys on the refusal: `reason`, `blocked_by`, `extensions_in_window`, `unmapped_extensions`,
  `unmapped_calls`.
- `mapped_extensions` is still present on success but **now counts mapped extensions *in the
  window*** rather than mapped rows in the whole table. When the gate is open the two are equal by
  construction, so the number is never smaller than it was — but the meaning is narrower and any
  future reader should know it.
- Derivation resolves `COALESCE(cl.employee_id, e.employee_id)` instead of `cl.employee_id`
  (justified above).

**New:** `staff_call_metrics_coverage(date) -> jsonb`, `EXECUTE` to `authenticated` and
`service_role` only.

**New behaviour with a consumer:** manual entry of the three call columns is refused once a day's
mapping is complete. Today no day is complete, so nothing a user does changes yet.

---

## Verification

| command | result |
|---|---|
| `npx tsc --noEmit` | **70**, `18/15/13/13/6/5` — identical to baseline; **0** in the file I touched |
| `npx eslint src/routes/_app.gamification.admin.manual-metrics.tsx` | 1 error — the same pre-existing `ManualMetricsTotalsCard` prettier error, which I deliberately restored after `--fix` touched it, so the diff stays inside my change |
| `npm run build` | **passes**, exit code 0, `✓ built in 1m 3s` |
| tests | **there is no `test` script in this project.** The e2e Playwright suite was not run — it needs the app served and is outside this mission's window. No new spec was added; recorded as unverified. |

No `@ts-ignore`, no `.skip`, no `test.fixme` anywhere in the diff.

---

## What was not verified

1. **No e2e/Playwright spec was written.** Everything here is proved at the database layer with
   rolled-back SQL probes and by reading the route source. The UI's rendered output — that the
   Persian notice actually appears, that the three inputs actually go disabled — was **not**
   observed in a browser. That is a genuine gap and the honest place to say so.
2. **The importer's behaviour after a mapping exists is inferred, not measured.** The claim "the
   next import will attach `employee_id`" comes from the brief and from
   `src/lib/calls/import-issabel-calls.server.ts` reading `call_log_extensions`; no import was run
   tonight. The guard does not depend on it being true — the `COALESCE` fallback makes the
   derivation correct either way.
3. **1109 call rows with a NULL `extension` are outside the predicate entirely.** No mapping can
   ever attribute them, so they can neither block nor open the gate, and their talk-time is never
   derived for anyone. Whether those legs *should* be attributable is a data question for the
   owner, not a guard question.
4. **Nothing was rehearsed against production**, by construction. The migrations have not run
   anywhere but `afrakala` on the test host.
5. `staff_call_metrics_coverage` treats a caller with `EXECUTE` and no JWT subject as trusted
   backend. `anon` holds no `EXECUTE`, so the reachable set is `authenticated` (role-checked) and
   `service_role`. Stated rather than hidden.

---

## Out-of-scope recommendations — recorded, not done

1. **Four extensions emit calls and are not rows in `call_log_extensions` at all** — 201, 406, 449,
   450. The mapping screen (`/admin/call-extensions`) lists rows in that table, so an operator
   working from the screen alone will never see them and will not understand why the gate stays
   shut. That screen would be more useful listing *extensions seen in `call_logs`* left-joined to
   the table. The `blocked_by` list I added is a workaround for this, not a fix.
2. **`talk_time_minutes` sums `duration_seconds` with no direction filter**, so internal
   desk-to-desk calls (8 of ext 403's 77 on 2026-09-07) count toward talk time while
   `inbound_calls_count` / `outbound_calls_count` exclude them. Pre-existing in 517; I did not
   change it, because it is a KPI definition question, not a guard question.
3. **`ALTER DEFAULT PRIVILEGES` grants `EXECUTE` to `authenticated` on every new function in
   `public`.** Migration 521 fixed one instance. Every future function author will hit the same
   trap. A single default-privileges change, or an e2e assertion over `proacl` of all `public`
   functions, would close the class instead of the instance.
4. **`derive_staff_call_metrics` still has no caller.** The guard is now correct, but nothing calls
   the function on a schedule; there is no `pg_cron` on this database. Wiring it is C-7's
   unfinished business, not C-1's.
5. **A migration to record which extensions are deliberately not agent desks** (a queue, an IVR,
   reception) would let the predicate exempt them explicitly instead of forcing an operator to map
   them to a person to open the gate. I did not invent such a mechanism, because inventing schema
   was not the task.

---

## Verdict

**COMPLETE** for the two things the mission named, with the browser check listed above as an
explicit remaining manual step.

- The coverage predicate is per-window, traffic-weighted, and not satisfiable by a single test
  row — proved blocked (P2) and, under a simulated full mapping, **proved open** (P3).
- The manual screen is gated, in the database first and in the UI as a mirror — proved through the
  RPC (P5) and through the direct table write that bypasses it (P7, Q4), and proved *not* to block
  legitimate writers (P4, P6, Q5, Q6, Q7, Q8, Q9).
- The eleven pre-go-live manual rows are byte-identical throughout, by content md5.
