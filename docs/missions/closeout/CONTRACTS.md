# CONTRACTS — close-out mission (waves 2–6)

Written by the orchestrator at Stage 0, 2026-09-07. Every number here was
**measured**, not copied from the brief. Where the brief and the measurement
disagreed, the measurement is recorded with both sides ([A-7], [A-1]).

---

## 1. Ground truth, measured

| Item | Measured value | Command |
|---|---|---|
| `HEAD` | `4fc737c6` | `git rev-parse HEAD` |
| `origin/staging` | `4fc737c6` — identical, 0 ahead / 0 behind | `git rev-list --left-right --count HEAD...origin/staging` |
| `APP_GIT_SHA` (deployed) | `4fc737c6` — **equals HEAD** | `docker inspect afrakala-lan-web` |
| Migrations on disk | **672** | `ls supabase/migrations/*.sql \| wc -l` |
| Ledger rows | **672 — matches disk** | `SELECT count(*) FROM supabase_migrations.schema_migrations` |
| Highest migration number | **507** (`499`–`503` do not exist; the series skips) | `ls supabase/migrations` |
| **Next migration number** | **508** | confirmed against disk *and* ledger |
| Typecheck | **70**, per-file identical to brief | `npx tsc --noEmit` |
| Container health | **`unhealthy`** | `docker inspect --format '{{.State.Health.Status}}'` |

### Typecheck baseline — per file (this is the gate, not the total)

| File | Errors |
|---|---|
| `src/routes/_app.products.index.tsx` | 18 |
| `src/routes/_app.admin.sales-reminders.tsx` | 15 |
| `src/lib/accounting/functions.ts` | 13 |
| `src/lib/invoices/functions.ts` | 13 |
| `src/lib/audit/index.ts` | 6 |
| `src/routes/_app.admin.automation.tsx` | 5 |
| **total** | **70** |

**No file may rise.** A total of 70 that moved an error from one file to another is a regression.

---

## 2. Two places the brief was stale — measurement wins

### 2.1 Session generators: the brief says four, there are **six**

> Brief: *"Only 4 of 6 roles have generators (no `manager`, no `viewer`); cold-login those two."*

**Measured false.** `e2e/auth/generate-role-sessions.spec.ts` declares six targets —
`manager` at line 97 and `viewer` at line 108 — added by wave 6 under hazard H·e, with a
comment saying exactly why. Only four `*.storage.json` files existed on disk because the
last run predated that change.

All six were regenerated and revalidated this session. **This does not relax [A-10]:** a
stored `viewer` session is a *warm* session. Every "role X is refused" claim in Group V is
still proved with a cold browser context — no `storageState`, no cookies, login from zero.

### 2.2 `CONSTITUTION.md` / `WORKFLOWS.md` are not in `.claude/agents/`

They live in `C:\Users\AFRA\.claude\dev-team\`. The `agents/` directory holds only the
38 `dev-*.md` bodies.

---

## 3. Q-1 — Issabel credentials: **ABSENT**. Group C is blocked.

Measured, not asked:

```
deploy/lan/.env.lan — 44 lines, 39 keys
keys matching ISSABEL : none
keys matching CDR|MYSQL|PHONE|CALL|PBX|ASTERISK : none
```

The file is readable and non-empty, so this is a real absence and not a failed read.

**The four keys the owner must create** (names from
`docs/research/issabel-groundwork-20260906.md`):

```
ISSABEL_CDR_HOST
ISSABEL_CDR_USER
ISSABEL_CDR_PASSWORD
ISSABEL_CDR_DB
```

**C-4 … C-8 return `blocked: owner must create the MySQL user — statements in
docs/research/issabel-groundwork-20260906.md`. No CDR row is invented, no importer is
written against a guessed schema.** `DESCRIBE cdr` is the first thing C-4 does when it
does run, and the `[doc]` column map stays unverified until then.

---

## 4. Migration numbers — allocated once, atomically ([B-4])

| Range | Owner | Status |
|---|---|---|
| **508 – 511** | Group H (`dev-bug-hunter`) | live |
| 512 – 516 | Group C | **not issued** — C is blocked |

No range overlaps. Take the number at the moment you write the file and re-check disk
**and** ledger before applying — other worktrees hold untracked migration files that
`git ls-tree` does not see.

---

## 5. Worktrees — seeded and proven ([B-3])

| Agent | Worktree | Branch |
|---|---|---|
| `dev-bug-hunter` (H) | `D:\AfraKalaTest\wt-h` | `closeout/group-h` |
| `dev-frontend-engineer` (V) | `D:\AfraKalaTest\wt-v` | `closeout/group-v` |

Each was seeded with, and verified for:

1. **`node_modules`** — a Windows junction to the main tree. Verified by running
   `npx tsc --noEmit` in the worktree: it returned **70 with the identical per-file
   split**, not the silent `0` that a missing `node_modules` produces.
2. **`deploy/lan/.env.lan`** — gitignored, and the code reads it.
3. **`e2e/auth/*.storage.json`** — all six, freshly minted this session.
4. `git status --porcelain` — **empty** at hand-off.

**Gitignored files written this session ([E-2]):** the six
`e2e/auth/{admin,accountant,manager,viewer,salesperson-a,salesperson-b}.storage.json`
in the main tree, copied into both worktrees.

---

## 6. Before-state probes — captured so the "after" is provable ([G-1])

These are the *before* halves of the E4 pairs. An agent that cannot reproduce the
before-state should stop, not adapt.

| Row | Before, measured |
|---|---|
| **H-1** | `SELECT count(*) FROM allocation_rows` → **1**. `audit_logs` for entity `b8e9286c-26cb-4211-a434-39630466a4e5` → **4 rows** (ids 64654–64657: `allocation_created`, two `allocation_status_changed`, `allocation_updated`). After: rows **0**, audit **5**. |
| **H-2** | `profiles.last_seen_at` ~50 days stale. |
| **H-3** | `curl /api/healthz` → **HTTP 503**, body `{"ok":false,"status":"unhealthy","checks":{"database":{"state":"down","ms":4,"detail":"HTTP 401"}...}`. The `401` is migration 477's `anon` revoke. Docker health log: five consecutive exit code `8`. |

`audit_logs` columns are `id, actor_id, entity_type, entity_id, action, diff, created_at`
— the entity key is **`entity_id`**, not `record_id`.

---

## 7. Database access — the working invocation

`docker cp` is broken on this machine (OG-68 mount layer). Read-only queries:

```bash
docker exec afrakala-lan-db sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala -tAc "<sql>"'
```

The password is already in the container's environment — never pass it on a command line
and never print it. For **applying a migration**, deliver over **stdin** (never `docker cp`),
verify `md5sum` on both sides, use `--single-transaction -v ON_ERROR_STOP=1`, and
**record the ledger row in the same breath** (rule 2b) — `psql` does not write it.

Database is **`afrakala`** on the test box. Production (`192.168.170.10`, database
`postgres`) is never contacted.

---

## 8. Verdicts

Every row closes with the evidence its kind demands, and no other:

| Kind | Closes with |
|---|---|
| **FIX** | The same probe twice — wrong, then right ([G-1]: the probe must read the condition, not seed it). |
| **CONNECT** | A screenshot of the real screen with the real role, **and** the non-permitted role refused from a **cold** context ([A-10]). |
| **BUILD** | Object exists · grants (`anon = f`; `authenticated` only where a real caller needs it — cron-only functions revoke `authenticated` in the same migration) · one real row through the real path. |
| **INVESTIGATE → …** | The measurement first, then the action or the stop. |

`PARTIAL` and `BLOCKED` are honourable. A `COMPLETE` that cannot show its evidence is not.

---

## 9. Scoped baseline — measured this session, before any change

`npx playwright test e2e/security/ e2e/business-flows/ e2e/persons/` — sequential, one worker, 14.4 min.

```
15 failed · 4 skipped · 451 passed
```

**Compare the SET, never the count** (OG-47: treating the number as exact manufactures false
regressions). The 15, in full:

| Suite | Count | Specs |
|---|---|---|
| `persons` | **9** | `credit-unchanged:125` · `credit-uses-person:21` · `external-party-person:130` · `inline-supplier-create:106` · `merge-ui:62` · `person-create-normalize:54` · `person-create-with-identifier:37` · `quote-list-link:33` · `supplier-form-person:42` |
| `business-flows` | **5** | `211-216-rejected-quote-notification:401` · `212-quote-credit-guard:640` · `213-dynamic-customer-credit-scoring:501` · `214-whatsapp-market-purchase-advisor:35` · `215-quote-inventory-finalization:329` |
| `security` | **1** | `rule12-no-gate-creates-posted-documents:109` |

This is exactly the 9 + 5 + 1 the brief predicted.

**`rule12`'s offender list — one entry, quoted from the failure:**

```
Error: these specs create a financial document with no rolled-back transaction:
  e2e\unit\ledger-wizard-party-pick.spec.ts
```

Unchanged. **One offender is the expected state; it is not a pass.** If this list grows, the new
entry is a regression owned by whoever added it.

**Green and confirmed green:** `og81` (ledger = disk), `og103` (anon table grants), `og61` (anon
cannot reach definer writers) — none appears in the failure set.

**Both timing-sensitive specs passed on this run:** `217-allocation-workbench` and
`og-bot-api-keys-cold-gate`. If either goes red later, **re-run it once** before calling it a
regression.

---

## 10. Group C — the exact unblock, for the owner

Group C needs one thing: a **read-only** MySQL user on the Issabel box, and the four env keys
pointing at it. The statements are already written out, with their security rationale, at
`docs/research/issabel-groundwork-20260906.md:715-737`:

```sql
CREATE USER 'afrakala_cdr_ro'@'192.168.170.8' IDENTIFIED BY '<a strong password you choose>';
GRANT SELECT ON asteriskcdrdb.cdr TO 'afrakala_cdr_ro'@'192.168.170.8';
FLUSH PRIVILEGES;
```

Three properties of those two lines matter, and all three are deliberate:
`@'192.168.170.8'` restricts the user to the **test computer only** — not `'%'`; `GRANT SELECT` is
**read-only**, so the company's call records cannot be altered even if the password leaks; and
naming `asteriskcdrdb.cdr` keeps every other database on the phone server — including its own
settings and passwords — invisible.

Then add to `deploy/lan/.env.lan` (which is gitignored and must stay that way):

```
ISSABEL_CDR_HOST=192.168.170.252
ISSABEL_CDR_USER=afrakala_cdr_ro
ISSABEL_CDR_PASSWORD=<the password>
ISSABEL_CDR_DB=asteriskcdrdb
```

**The password is never committed, never pasted into chat, and never logged** (project rule 4).
The web UI at `192.168.170.252` is never logged into.

When those four keys exist, C-4 runs `DESCRIBE cdr` **first** and reconciles it against the
`[doc]`-marked column map before a single row is written — that map is documentation, not a
measurement, and every column that differs is reported before the import.

---

## 11. Group C UNBLOCKED — 2026-09-07, owner created the MySQL user

The four keys are present in `deploy/lan/.env.lan`, all non-empty (the file went 44 → 49 lines,
39 → 43 keys). TCP 3306 on `192.168.170.252` is open from this host. The owner reports
`SELECT COUNT(*) FROM cdr` = **1,864,933** — recorded as **the owner's claim**, to be confirmed by
C-4's own count ([A-1]: a number you did not measure is a hypothesis).

**Section 3 above is superseded.** All 14 rows are now live; nothing is blocked.

### Migration numbers — reallocated, still atomic and non-overlapping ([B-4])

| Range | Owner | Status |
|---|---|---|
| **508 – 511** | Group H (`dev-bug-hunter`) | live |
| **512 – 514** | Group C backend (C-4, C-5) | live |
| **515 – 517** | Group C data (C-6, C-7, C-8) | reserved, not yet dispatched |

### What I measured for Group C, so no agent re-derives it

**`call_logs` already carries the C-2 columns** (live catalog, not the migration file):
`id, employee_id, direction, duration_seconds, started_at, ended_at, customer_id, external_id,
source, metadata, extension, is_missed, is_internal, disposition, created_at`.
`external_id` is where `uniqueid` belongs; `metadata` is where `unknown_number` belongs.
`call_log_extensions` exists: `extension, employee_id, label, created_at, updated_at, updated_by`.

**`mysql_fdw` is not merely uninstalled — it is not available.** `pg_available_extensions` offers
`http` 1.6, `pg_cron` 1.6, `pg_net` 0.13.0, and **no `mysql_fdw`**. So there is no Postgres→MySQL
path at all, which is precisely why C-4 is a Node route. Confirmed, not assumed.

### A constraint C-6 will hit — measured, and deliberately left unsolved here

`pg_cron` is installed **only in the `postgres` database**, not in `afrakala`. That matches wave 6's
correction: you schedule into afrakala with `cron.schedule_in_database('afrakala', …)`.

All six existing jobs look like this — every one calls a plain SQL function, and **not one makes an
HTTP call**:

```
 9  0 6 * * *   postgres   SELECT public.generate_birthday_notifications();
20  30 22 * * * afrakala   SELECT public.capture_score_snapshots();
21  45 22 * * * afrakala   SELECT public.refresh_all_sale_list_prices();
22  0 23 * * *  afrakala   SELECT public.sync_product_price_observatory_rows();
23  0 20 * * *  afrakala   SELECT public.notify_accountants_daily_accrual_summary();
25  0 21 * * *  afrakala   SELECT public.roll_employee_daily_streaks();
```

**Neither `http` nor `pg_net` is installed in either database.** The brief assumes C-6 can reach the
Node route "through the `http` extension or a `curl` in a cron shell" — but pg_cron executes **SQL**,
not shell, so the curl half of that sentence has no mechanism behind it, and the `http` half needs an
extension that is available but **not currently installed**.

So C-6 has a real decision to make, and it is a decision, not a detail: install `http` (or `pg_net`)
in `afrakala` via a migration, or schedule outside the database. **Left open for the C-data agent to
resolve and justify** ([B-1]: the agent gets the measurement and the question, not my answer).
Installing an extension is a schema change and goes in a numbered migration like anything else.

---

## 12. Owner decisions taken 2026-09-07 — the four that unblocked Group C

Agent C-backend halted **before writing a single row** because three CDR columns meant something
different from the only existing documentation, and the schema required a mapping that was empty.
The halt was correct. I reproduced its load-bearing measurements independently before escalating
([B-7]): my own probe returned 47,728 rows / 26,749 distinct `uniqueid` / 6,210 distinct `linkedid`
over 7 days, a worst-case fanout of **435 rows on one `uniqueid`**, and `CONGESTION` at **191,511**
— the second-commonest disposition, which the `[doc]` map omits entirely.

| # | Decision | Consequence |
|---|---|---|
| **D-56a** | **One call = one `linkedid`.** `external_id = linkedid`. | A queue call nobody answered is **1 missed call, not 15**. ~887 calls/day, not 6,818. The traced 61-row call becomes one row answered by ext 445. |
| **D-56b** | **`call_logs.employee_id` becomes NULLABLE.** | Unanswered and internal calls import with `employee_id NULL`, so volume and missed counts are truthful. Dissolves the empty-mapping blocker. |
| **D-56c** | **Missed = `disposition IN ('NO ANSWER','BUSY')` only.** | CONGESTION/FAILED are trunk faults: stored in `disposition`, never counted against a score. The rejected alternative charged ~211k technical failures per 120 days to employees. |
| **D-40** | **Go-live = `2026-09-07`**, stored as a **settings row, not a code constant**. The importer **refuses to run** when it is NULL or missing — never defaults to all history. | Owner's words: *"That is the guard against the 1.86M-row sweep, and it survives cron."* The guard lives server-side because cron calls the route unattended. |

**Two things the agent measured that override the documentation** — its own data governs:
- **Direction is not derivable from `dcontext`.** `from-internal` carries 65,261 inbound legs
  against 5,413 outbound in 30 days. Direction comes from extension position, not the documented rule.
- **Outbound `dst` carries a trunk dial prefix.** `909XXXXXXXXX` (12 digits) fails every branch of
  `normalize_identifier`, so **outbound calls matched no customer at all**. The groundwork doc's six
  tested shapes did not include this one. The strip is implemented behind a named setting and the
  prefix is recorded as **inferred from shape frequency, not read from `extensions.conf`**.

---

## 13. Findings that are NOT this mission's rows — for the owner

### 13.1 🔴 Pressing the daily-allocation button today would zero every customer's ceiling

Measured by me, independently, on the live test database:

```
dynamic_entity_scores:  2026-08-01 -> 95 rows · 2026-07-01 -> 55 rows · 2026-09 -> NONE
daily_capital_settings: latest capital_date = 2026-08-31 · rows for tehran_today() = 0
tehran_today() = 2026-09-07
```

With no September scores, `run_daily_capital_allocation` computes against zeros — the rolled-back
probe returned `{"customers_count": 0, "total_allocated_to_customers": 0}`. **The button on
`/accounting/dynamic-capital` is live and a human can press it.** Nothing was committed; no snapshot
for today exists. Recorded, not fixed — writing a snapshot is exactly what must not happen by accident.

### 13.2 The credit override does not survive the formula run the UI offers

Migration 506 taught **only** `recompute_dynamic_capital_setting` about `manual_credit_floor`.
Confirmed from the live catalog, counting references in `pg_get_functiondef`:

```
run_daily_capital_allocation        -> 0 references to manual_credit_floor
recompute_dynamic_capital_setting   -> 1 reference
```

Same customer, same 2,000,000,000 ﷼ approved floor: `recompute_dynamic_capital_setting` yields
`final_limit = 2,000,000,000` (`binding_constraint = manual_override`), while
`run_daily_capital_allocation` yields **1,247,149,593** (`binding_constraint = formula`).

The UI's only formula button calls **`run_daily_capital_allocation`**
(`src/hooks/capital/useDynamicCapital.ts:101`). `recompute_dynamic_capital_setting` has **no
application caller at all** — only the trigger `trg_refresh_dyn_capital_after_score_change`, which is
inert today on both of its conditions (no current-month score rows, no settings row for today).

So the credit-requests page's footer — «فرمول تخصیص سرمایه از آن پس این سقف را به‌عنوان کف در نظر
می‌گیرد» — **is not true** of the run a user can trigger. Either the function learns the floor or the
promise is corrected. **Not fixed here**: this moves real credit ceilings, and CLAUDE.md rule 10
requires the owner to approve ceiling movement, not merely the numbers.

### 13.3 H-6 Calendar — measured, correctly stopped, needs one owner choice

Passing a `locale` is the **wrong** fix: `react-day-picker@9.14.0` types it as
`Partial<DayPickerLocale>` and it only renames a Gregorian grid. The library *can* do Jalali — it
ships a `react-day-picker/persian` entry point with `date-fns-jalali` already bundled.

Real size: **6 JSX render sites in 4 files**, zero new dependencies —
`_app.accounting.allocation-workbench.tsx:239` · `payables.tsx:329,356` ·
`receivables.tsx:419,446` · `purchase-payments.tsx:548`.

The blocker is not size, it is that **the repo already has four competing Jalali mechanisms**,
including `JalaliDateInput` (react-multi-date-picker + `calendar={persian}`) at ~20 sites — one of
them in `purchase-payments.tsx:628`, the same file that renders an English calendar at line 548.
Choosing between two existing mechanisms is the "until a proper Jalali picker is chosen" gate.

### 13.4 Smaller, recorded, not acted on

- `src/routes/_app.persons.tsx:85` calls the custom-field filter "substring matched";
  `findPersonIdsByFieldValue` (`src/lib/persons/field-definitions.ts:178`) uses `.eq()` — exact
  equality. The Persian placeholder («مقدار دقیق») is right; the code comment is wrong.
- A denied page still prints its title in the breadcrumb to a refused viewer. Cosmetic — the content
  itself never renders.
- `pay_purchase_with_voucher` and `settle_league_season` still use `CURRENT_DATE`. The first is
  genuinely reachable from the UI (`src/lib/treasury/queries.ts:237` sends `_payment_date ?? null`
  into a `COALESCE(_payment_date, CURRENT_DATE)`), making it the highest-value remaining OG-64 item —
  deliberately left, because rewriting a payment-critical `SECURITY DEFINER` function inside a hotfix
  on a shared live database is not hotfix scope.
- `src/shared/components/PurchaseForm.tsx:26` imports `Calendar` and never renders it.
