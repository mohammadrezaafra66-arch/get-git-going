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

---

## 14. Session-limit interruption, 2026-09-07 — state recovered, nothing lost

Both builders were killed mid-flight by an API rate limit, not by any fault of their own. Neither
was restarted; both were **resumed** from their transcripts. What I measured in their worktrees
before resuming, so neither had to rediscover it:

| Worktree | HEAD | In flight when killed |
|---|---|---|
| `wt-h` | `8f37414c`, 5 commits | `requests.ts` + `system-health.tsx` modified (the H-7 `.bind` edits, both correct); 3 untracked `h7-*.mjs` probes |
| `wt-cc` | `43f24d27`, 1 commit | **migration 512 applied + ledger-recorded but its FILE untracked**; `src/lib/calls/{issabel-cdr,import-issabel-calls}.server.ts` untracked |

### 🔴 The one real hazard: 512 applied but uncommitted

```
ledger version 20260907100000        -> recorded
call_logs.employee_id                -> is_nullable = YES  (it really ran)
supabase/migrations/…_512_….sql      -> ?? untracked
```

This is exactly the state the rules forbid: lose the file and the ledger claims a migration nothing
can reproduce, `og81` goes red, and a deploy cannot rebuild the schema. The C agent was instructed to
commit it **before anything else**. Recorded here so it is not lost a second time if the session dies
again — the file's content was read and verified sound.

**Ledger vs disk during the split** — expected, not a defect: ledger **675** = 672 base + 508 + 509
(committed in `wt-h`) + 512 (untracked in `wt-cc`). Each agent sees a different disk count because
each holds only its own files. It reconciles when both commit. Neither agent may "fix" the other's
ledger rows.

### Migration numbers after reallocation

| Range | Owner | Used |
|---|---|---|
| 508 – 511 | Group H | 508, 509 used · **510, 511 free for H-8** |
| 512 – 514 | Group C | 512 used · **513, 514 free** |

---

## 15. D-52 — owner decision, 2026-09-07: the floor asymmetry is a defect, fix it

> **YES — `run_daily_capital_allocation` must honour `manual_credit_floor` exactly as
> `recompute_dynamic_capital_setting` does. D-52 was the owner's decision and is half-implemented.**
> *"This moves real ceilings on the TEST database only — approved."*

Becomes **row H-8**. Closes with the same customer through both functions showing the **same**
ceiling — before, they disagree (2,000,000,000 vs 1,247,149,593); after, they agree, with
`binding_constraint = manual_override` when the floor binds.

Mirror the guard shape `recompute_dynamic_capital_setting` already uses, read from its **live** body,
rather than inventing a second floor mechanism.

**The approval covers the ceiling movement, and nothing beyond it.** It does **not** authorise
pressing the daily-allocation button or committing an allocation snapshot: there are no
`dynamic_entity_scores` rows for 2026-09 and no `daily_capital_settings` row for today, so a real run
computes against zeros and would zero every ceiling. Proof stays in `BEGIN … ROLLBACK`.
**Owner: "Nobody presses that button."**

## 16. H-6 — the owner's instruction is REPORT, DO NOT FIX

Deliverable is a list, not a change: the four Jalali mechanisms — **file, one line each, which pages
use each** — plus **one** recommendation. The owner chooses after reading.

## 17. Row count is now 16

`H-1 … H-8` (8) · `V-1 … V-3` (3) · `C-4 … C-8` (5). Group C is unblocked; nothing is blocked on a
credential any more.

---

## 18. FINDING — concurrent orchestrator sessions on one shared tree

**Named at the owner's instruction. Recorded, not acted on. No remediation is attempted here.**

Reported by the owner: **two live orchestrator sessions on this one shared tree corrupted a sibling
mission's evaluation directory earlier today.**

The ledger drift this mission observed is **the same family of fault**, and it is worth writing down
precisely because in our case it stayed benign:

```
ledger 675  ·  wt-h disk 674  ·  wt-cc disk 673
```

Three different numbers, no two agreeing, none of them wrong. Each worktree holds only its own
migration files while the ledger is a **single shared row set in one shared database**. The
divergence is structural: worktrees isolate the filesystem, and nothing isolates the database.

Why it stayed benign here was procedure, not luck — and the procedure is the transferable part:

- Migration numbers were allocated **once, atomically, before any dispatch**, in non-overlapping
  ranges (508–511 / 512–514), so two agents could never claim one number.
- Each agent was told **explicitly** that ledger rows outside its range belong to another worktree and
  must not be touched, re-run, or "fixed". The tempting repair — re-running a migration to make the
  count match — is the destructive one: several migrations in this repo are not idempotent.
- Applied-but-uncommitted was treated as an **incident**, not untidiness (§14), because that is the
  state where the shared database and the isolated filesystem actively disagree.

**What this does not cover.** Migration numbers were the only shared resource this mission
partitioned. Everything else two orchestrators can collide on was left unpartitioned and simply did
not collide:

- the **live database** — business data moves under another session's tests while yours run
- **`test-results/`, `.artifacts/`, `.output/`** and every other gitignored working directory
- **`e2e/auth/*.storage.json`** — regenerating sessions rotates refresh tokens another session is
  about to read
- the **deployed container** at `:3100`, which is one machine serving every session at once

The sibling mission's evaluation directory falls in the second category. Nothing in this mission's
design would have prevented it.

**Stated as a hypothesis, not a finding**: worktrees are widely treated as sufficient isolation for
parallel agents, and for tracked source files they are. For a shared Postgres instance, a shared
deployed container, and shared gitignored scratch directories they provide **none at all** — and the
first two are precisely where this project keeps its irreversible state. Whether that warrants
per-session scratch directories, a database naming convention, or simply a rule that one tree hosts
one orchestrator at a time is **the owner's call and explicitly out of scope here.**

---

## 19. LESSON — a `.bind` fix restores a feature *and everything that feature could reach*

**Corrects a claim I made.** I first reported F-3 (three unguarded `SECURITY DEFINER` readers) as
"pre-existing, not caused by this branch." The owner corrected the framing, and the correction is
right:

> *"That is right about the missing guard and wrong about the reachability.
> `system-health.tsx:61` is one of the two sites H-7 fixed — before it, the page threw before
> issuing any request, so those three RPCs had no live client path. H-7 gave them one.
> Same distinction as F-1: the hole is inherited, the reach is ours."*

The precise state before H-7: `const rpc = supabase.rpc` detached the method, so `this.rest` threw
**before any socket opened**. Every call from that page failed at the first statement. The page was
inert, and so was everything behind it.

**One nuance, which sharpens the point rather than blunting it.** The *attacker* path never went
through the page: any holder of an `authenticated` JWT could always `POST /rest/v1/rpc/validate_journal_entry_balance`
directly, and still can. So the direct exposure predates H-7 and is untouched by it. What H-7 changed
is the **product** surface — three RPCs went from dead code nothing called to a live feature. That is
exactly why the page guard was never the control: `requireAdmin()` is client-side only
(`route-guards.ts:16` returns `null` server-side and `requireAdmin` treats `null` as a pass), so the
only real control was always the one that did not exist in the function bodies.

Both readings converge on the same conclusion — the guard has to be in the database — and the owner's
framing is the one that generalises:

> **A `.bind` fix does not only restore a feature. It restores whatever that feature could reach.**

The same shape produced **both** HIGH findings on this branch:

| Row | What it restored | What that reached |
|---|---|---|
| **H-7** (`.bind`) | the credit-review buttons **and** the system-health page | three unguarded `SECURITY DEFINER` readers (F-3) |
| **H-8** (D-52) | `manual_credit_floor` becomes authoritative | a column any `sales` user can write directly (F-1) |

Neither was a defect in the fix. Both were dormant holes that the fix woke up.

**The transferable rule**: when a change makes a dead path live — restoring a broken call, enabling a
feature flag, fixing a silent failure — the review scope is **not** the diff. It is the diff plus
everything newly reachable through it. Ask "what could this code always have called, that it never
actually called until now?" and audit *that*. A diff-shaped review would have found neither F-1 nor
F-3, because neither is in the diff.

This is a candidate for `CONSTITUTION.md` §11 — recorded here, not filed there, since amending the
constitution is out of this mission's scope.

---

## 20. Owner decisions on the security findings and on C-7

### 20.1 F-1 and F-3 are fixed now, before H merges — rows H-9 and H-10

| Row | Finding | Fix, as decided |
|---|---|---|
| **H-9** | `authenticated` holds `UPDATE` on `customers.manual_credit_floor`; the `manage customers by role` policy admits `sales` for `responsible_id = uid() OR responsible_id IS NULL`; the `CHECK` has no upper bound. H-8 made that column override the `credit_limit` cap. | A **`BEFORE UPDATE` trigger** on `customers` refusing a change to that column unless the actor holds `admin`/`manager`/`accountant` — the form no write path routes around ([A-3]). Plus F-2: extend `audit_customer_change`'s diff to carry the column, which today omits it entirely. Migration **511**. |
| **H-10** | `person_fk_drift_report`, `polymorphic_ref_orphan_report`, `validate_journal_entry_balance` are `SECURITY DEFINER`, `authenticated`-executable, and `guarded=false` — no `has_role`, no `auth.uid()`, no `42501`. `requireAdmin()` is client-side only. | A real server-side guard on all three. `anon_exec` stays false. Migration **515**. |

**F-4 (self-approval via `profiles.status`, no `WITH CHECK`) is handed to security wave 3**, not fixed
here — its reachability depends on whether an unapproved registrant is issued a JWT at all, which
nobody has measured.

### 20.2 C-7 — two decisions, both refusing a silent zeroing

| # | Decision |
|---|---|
| **D-57a** | **Keep the 11 pre-go-live manual rows; derive only from 2026-09-07 forward.** No double-counting is possible: `min(started_at)::date` in `call_logs` is exactly `2026-09-07`. **A real gap remains — 2026-08-12 → 2026-09-06 has no data from either source.** Recorded, not backfilled. |
| **D-57b** | **Manual entry stops only once `call_log_extensions` holds real mappings**, enforced rather than documented: the switchover predicate is `count(*) WHERE employee_id IS NOT NULL > 0`. Counting rows instead of *mapped* rows would pass on today's single `ext 101` row — which appears **0 times in the CDR** — and switch over into all-zero KPIs, the exact outcome the owner rejected. |

`gamification_kpis.source` is corrected to match reality **as it is today** (calls come from
`staff_daily_performance_metrics`), not as it will be after the mapping is filled.
`compute_employee_score`'s body stays untouched.

### 20.3 Verified independently before acceptance ([B-7])

| Claim | My measurement |
|---|---|
| Importer closing condition | `call_logs`: **1429 rows / 1429 distinct `external_id`** — zero duplicates · 23 matched · **0 with an employee** |
| D-40 cutoff held | `min(started_at)::date = 2026-09-07` — no history sweep |
| D-56c missed rule | NO ANSWER 644/**644** · BUSY 199/**199** · ANSWERED 580/**0** · CONGESTION 6/**0** |
| Manual metrics C-7 would displace | **11 rows, 8 staff**, 2026-07-23 → 2026-08-11, 3,435 inbound / 4,475 outbound / 3,405 minutes |
| F-1 write path | `authenticated \| UPDATE` on the column; policy admits `sales` on own-or-unassigned |
| F-3 guards | all three `secdef=true`, `authed_exec=true`, **`guarded=false`**, `anon_exec=false` |

### 20.4 C-6 resolved its constraint without adding an extension

The C agent measured the same thing §11 recorded and chose **host cron + a shared token** over
installing `http`/`pg_net`: driving it from the database needed **two** new extensions plus outbound
network access *from* the database, to reach an endpoint host cron already reaches with nothing
installed — and host cron is the existing repo pattern (`marketing-tasks`, `pricing-worker`), so
anything else would have breached rule 14. **No new extension was installed in `afrakala`.**
A simulated day hit exactly D-39's 17 fire times, nothing missing or extra.

### 20.5 Two silent-success defects the C agent caught before they shipped

Both would have looked like a working importer:
1. **Outbound matched nothing** — `dst` carries the trunk prefix, and live `normalize_identifier`
   returns empty on `909XXXXXXXXX`. Strip is conditional on the remainder being a valid mobile, the
   prefix lives in `shop_settings`, and `metadata.raw_number` preserves the original.
2. **`ISSABEL_CDR_*` never reached the container** — measured
   `docker exec afrakala-lan-web env | grep -c ISSABEL` → **0**. It worked on the agent's host and
   would have surfaced only in production, as `config_missing`. Fixed in
   `deploy/lan/docker-compose.yml`.

### 20.6 Remaining operator steps — not code, and not done

- **`ISSABEL_IMPORT_WORKER_TOKEN` is absent from `.env.lan`**; without it the cron hook returns 500.
- **The crontab is not installed.** The schedule is wired but not running.
- **`call_log_extensions` is empty of real mappings.** The owner enters `401-413` / `445-450`; until
  then every `call_logs` row carries `employee_id NULL` and D-57b keeps manual entry alive.

---

## 21. Owner refinements, 2026-09-07 — four, all folded into existing rows

### 21.1 H-9 · the refusal speaks Persian and names the rule, not the mechanism

```
تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است
```

An accountant who hits this must learn **what rule stopped them**, not which database object did.
No trigger name, no column name, no `42501` in user-visible text.

**F-2 closes in the same migration (511)**, not a second one: `audit_customer_change`'s diff gains
`manual_credit_floor`. Proof is the old and new values appearing in a real (rolled-back) update's
diff — not that the code mentions the column.

### 21.2 F-3 · the hole is inherited, the reach is ours — see §19

Recorded in full at §19, including the nuance that the **direct PostgREST path predates H-7 and is
untouched by it**, while the **product** surface — three RPCs going from dead code to a live feature —
is this branch's. Both readings converge on the same fix.

### 21.3 C-7 · the go-live boundary is a hard guard, and D-34 now means something narrower

The derivation writes only dates `>=` the go-live settings row — **the same row the importer refuses
to run without** — and **REFUSES** anything earlier. Not "filters to": a filter can be handed an
earlier date by a later caller, a backfill, or a cron misconfiguration, and would silently overwrite
8 people's recorded work, of which there is no second copy.

**Proof**: run the derivation, then show the 11 manual rows **byte-identical** afterwards — not
"still 11 rows".

> **D-34 restated.** "The call columns become derived" now means **"derived from go-live forward"**,
> not "derived always". The column legitimately carries **two sources with a 26-day gap** — manual
> through 2026-08-11, CDR from 2026-09-07, nothing between. Written down here because without this
> sentence, someone reading the code in six months finds a column with two provenances and a hole,
> and files it as a bug.

### 21.4 C-7 · the refusal is visible, and the mapping is offered rather than remembered

While `call_log_extensions` has no mapped employee, the screen says:

```
تا وقتی داخلی‌ها به کارمندان نسبت داده نشوند، آمار تماس از CDR محاسبه نمی‌شود
```

and manual entry continues. **A guard that declines silently is indistinguishable from a feature that
is broken** — whoever maintains the manual screen needs to know why they still are, and what ends it.

`/admin/call-extensions` offers the extensions the **CDR actually contains** (`401-413`, `445-450`) as
suggestions. The existing `ext 101` row — **zero occurrences in the CDR, ever** — is **flagged as
unseen, not deleted**: it is another mission's demonstration row and the admin decides its fate.
That screen's gate was verified in a browser this session (admin names an extension and it persists;
a cold `viewer` is refused) and must not be weakened.

---

## 22. HANDED FORWARD, as a ROW — `call_log_extensions` has no audit trail at all

**Owner's instruction: this does not go into the handed-forward list as a footnote.** It is named
here with its lineage so the next mission's brief opens with it as a row rather than rediscovering
it. **Nothing was built. Nothing should be built now.**

### The measurement

```
triggers on public.call_log_extensions  ->  trg_call_log_extensions_updated_at   (timestamp only)
audit_logs rows for that table          ->  0, and 0 for entity_id='101', and 0 in any diff
```

There is **no audit trigger**. Not a partial one — none. Every change to this table since it was
created is unrecorded, which is why the disappearance of `ext 101` is answerable only as **UNKNOWN**.

### Why it is a row and not a footnote — the lineage

This is the **third instance of one failure**, each a strictly worse version of the last:

| # | Where | Shape | What the record actually covered |
|---|---|---|---|
| 1 | **Wave 5, `[A-3]`** | "every change is logged" was true **only through the RPC**. `authenticated` held direct INSERT/UPDATE and only DELETE carried a trigger. A PostgREST `PATCH` left **no trace**. | some verbs |
| 2 | **Today, F-2** | `audit_customer_change` fires on the right verb but builds its diff from a **fixed field list** that omitted `manual_credit_floor`. A ceiling moved and every logged field read unchanged. | the verb, not the field |
| 3 | **`call_log_extensions`** | No trigger of any kind. | nothing |

Instance 1 cost wave 5 a finding. Instance 2 was caught today only because a cold reviewer went
looking. Instance 3 is already live, and the table is **about to become score-bearing**: once
`employee_id` is populated, D-57b opens the switchover and this table decides which employee is
credited with which calls — feeding `compute_employee_score`.

H-1 today is the counter-example that proves the shape is fixable: the residue delete produced its
fifth audit row precisely because `trg_allocation_rows_audit_delete` existed. The mechanism works
where it is present.

### What the next brief should start from

- The rule this project states — *sensitive actions require audit logs* — is enforced per-table by
  hand, so it is true exactly where someone remembered it and false everywhere else. **Nobody has
  ever enumerated which sensitive tables have audit coverage and which do not.** That census is the
  row, not this one table.
- The three instances above suggest the census needs **three** columns, not one: does a trigger
  exist · does it cover every verb · does its diff carry the fields that matter. Instance 2 passes
  the first two tests and still lost the data.
- `call_log_extensions` is the concrete starting case and should be fixed first, because its
  score-bearing date is known and near.

**Not built, by owner decision. Adding a trigger is a schema change nobody has approved and it sits
outside C-7.**

---

## 23. F-1 closed on all three verbs — the third measured by the orchestrator

Migration **518** extended the guard to `BEFORE INSERT OR UPDATE OF manual_credit_floor`. The builder
proved INSERT and UPDATE and **explicitly flagged one case it had reasoned rather than measured**:
`DELETE` followed by a re-`INSERT` carrying the ceiling. I measured it ([B-7]).

```
trg_customers_guard_manual_credit_floor
  BEFORE INSERT OR UPDATE OF manual_credit_floor ON public.customers FOR EACH ROW
```

Probe delivered over stdin, **md5 identical both sides** (`146b322b…`), entirely inside
`BEGIN … ROLLBACK`:

| Step | Result |
|---|---|
| `sales` DELETEs a customer it owns | succeeds — `rows_after_delete = 0` |
| `sales` re-INSERTs **with** a ceiling | **REFUSED 42501** — «تغییر سقف دستی فقط با نقش مدیر یا حسابدار ممکن است» |
| **control**: `sales` re-INSERTs **without** a ceiling | **ALLOWED** — normal customer creation unbroken |
| residue after rollback | 0 probe customers · 0 probe floors · 1 live floor (the legitimate H-7 one) |

The Persian message survived the transport intact — no `?` substitution — confirming the stdin route
holds for non-ASCII SQL.

### The probe's first version passed for the WRONG reason — recorded because it nearly counted

My first attempt read a `TEMP TABLE` after `SET LOCAL ROLE authenticated` and came back:

```
REINSERT RESULT: REFUSED sqlstate=42501 msg=permission denied for table _p
```

**`42501` is the same sqlstate the guard raises.** A probe checking only "was it refused" or only the
error code would have scored that as a pass, while the ceiling guard was never reached at all — the
statement died on the scaffolding. Only the *message* distinguished them.

Generalises the wave-5 lesson one notch: it is not enough for a negative test to fail. **It must fail
for the reason under test**, and on a shared error code the code alone cannot tell you that. The
corrected probe resolves the person id into a `psql` variable *before* dropping privileges, so
nothing under `authenticated` touches scaffolding it cannot read, and it asserts the exact message.

Also noted from the builder, and worth keeping: the two branches need **different conditions** —
UPDATE fires on `IS DISTINCT FROM`, INSERT on `IS NOT NULL`, because there is nothing to differ from.
And `OLD` is unassigned during INSERT, so merely *referencing* `OLD.manual_credit_floor` raises; the
function branches on `TG_OP` before touching it.

---

## 24. Second instance of the shared-tree fault — and a trap in our own documented recipe

§18 predicted this family. Here is a concrete second instance, found by the Group C agent, and it
carries a facet the migration-number allocation in §4 does **not** cover.

### What happened

C's migration 517 was written with timestamp `20260907150000`. Recording the ledger row returned:

```
INSERT 0 0
```

`inserted_at` settled ownership:

```
20260907150000 | inserted_at 14:24:01   <- Group H's migration 518, in wt-h
   C's 517 was applied at 14:40:54, sixteen minutes later
20260907154500 | inserted_at 14:42:26   <- C's 517 after renaming
```

Verified independently by me: `20260907150000_518_manual_credit_floor_guard_covers_insert.sql`
lives in `wt-h`; `20260907154500_517_derive_staff_call_metrics.sql` lives in `wt-cc`. The agent
renamed its **still-uncommitted** file (content unchanged, md5 identical) and recorded the new
version. Nothing was lost, nothing was double-applied, and it did not touch H's row.

### The facet §4 missed: the number and the timestamp are different fields

Migration numbers were allocated atomically and never overlapped — H held 508–511/515/518/519,
C held 512–514/516/517. **That partition worked and was never violated.** But the ledger keys on the
**timestamp**, not the number, and the timestamp was left to each agent to choose. Two agents in two
worktrees picked `20260907150000` for migrations numbered 518 and 517 respectively.

> **Allocating distinct migration numbers does not prevent ledger collisions.** The number is for
> humans and the timestamp is the key. Partition the timestamp too, or derive it from the number.

### The trap: `ON CONFLICT DO NOTHING` makes a collision look like success

The recording command this project documents — and which every brief in this mission repeated — is:

```sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('...') ON CONFLICT (version) DO NOTHING;
```

On a collision that returns `INSERT 0 0` and **exits 0**. It does not error, and `ON CONFLICT DO
NOTHING` is exactly what the rule 2b recipe prescribes — for the good reason that re-recording an
already-recorded migration must be harmless. But the same clause that makes re-recording safe makes
a *collision* invisible: the agent's migration was applied and unrecorded, which is precisely the
state §14 flagged as a deploy hazard.

**It was caught only because the agent read the row count rather than the exit code.** Nothing in
the documented recipe says to.

### What to change (recorded, not applied — out of scope here)

- Derive the timestamp from the allocated number, or hand each agent an explicit timestamp range
  alongside its number range, so §4's partition covers the field the ledger actually keys on.
- After recording, assert the row is **yours**: check `INSERT 0 1`, or re-select the row and compare
  `inserted_at` against when you applied it. `ON CONFLICT DO NOTHING` returning zero rows means
  either "already recorded" or "someone else owns this version", and only a second query separates them.

---

## 25. Two rows are BUILT AND PROVEN but NOT LIVE — they read as OPEN in the final table

**Owner's instruction, and it governs how the completion report presents these.** Both depend on an
owner action that has not happened. Neither may be listed as done.

> *"The crontab is not installed until I run it, so the completion report must not list C-6 as done.
> … Same for the extension mapping: `employee_id` is still null on all rows, so the C-7 switchover
> guard is closed by design, not by accident. Both are mine, and both should read as open in the
> final table."*

The distinction the report must hold: **the engineering row closed; the operational state did not.**
Code landed and was proven; the thing the code exists to do is not yet happening. Reporting the first
as if it were the second is the reporting equivalent of the silent-success failures this mission
caught four times.

| Row | Engineering | Operational | **Final table** |
|---|---|---|---|
| **C-6** schedule | built, D-39's 17 fire times simulated and matched exactly | **crontab not installed** | **OPEN — owner installs** |
| **C-7** derivation | built, guard proven in **both** states | **`employee_id` NULL on all 9 rows → switchover closed** | **OPEN — owner maps employees** |

C-7's closed state is **by design, not by accident**, and the report says so in those words: the
guard's predicate is `count(*) WHERE employee_id IS NOT NULL > 0`, it evaluates to 0, manual entry
continues, and the screen states why. Verified in both directions — closed live, open under a
simulated mapping in a rolled-back transaction.

### The crontab block the report carries, with the decision rule beside it

Measured, so the report states it rather than leaving a choice:

| | Measured 2026-09-07 |
|---|---|
| Windows test host | **`West Asia Standard Time` = UTC+05:00** — neither Tehran (+03:30) nor UTC; **no `crontab`**, no scheduled task |
| `afrakala-lan-web` / `-db` | **UTC** (`TZ` empty, no `/etc/timezone`) |
| Established repo pattern | host cron on a **Linux self-host server** (`pricing-worker`, `marketing-tasks` are the same shape) |

So the crontab target is the Linux self-host server, whose timezone this session cannot reach.
**Owner runs `timedatectl` before installing.**

```bash
# 1. confirm the clock, and that cron honours CRON_TZ (cronie/vixie — NOT busybox)
timedatectl
crond -V 2>&1 || cron -V 2>&1

# 2. install the driver
sudo install -m 0755 deploy/app/scripts/issabel-import-cron.example.sh \
    /usr/local/bin/afrakala-issabel-import.sh

# 3. crontab — the CRON_TZ line is what makes the five below unambiguous
sudo crontab -e
```
```cron
CRON_TZ=Asia/Tehran
0    8,9          * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 1
0,30 10,11,12     * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 2
0    13,14,15,16  * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 3
0    17,18,19     * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 4
0    20,2         * * *  /usr/local/bin/afrakala-issabel-import.sh   # window 5
```

**Decision rule — `CRON_TZ` removes the choice rather than making it blind.** Iran abolished DST in
2022, so `Asia/Tehran` is a fixed +03:30 and these lines never shift.

Only if `CRON_TZ` is unsupported does the server's own zone matter:

| `timedatectl` says | Use |
|---|---|
| `Asia/Tehran` | the five lines above, **without** the `CRON_TZ` header |
| `UTC` | the **seven**-line variant in the script's header — the half-hour offset splits window 2 into three expressions |
| **anything else** (incl. this machine's UTC+05:00) | **neither documented variant is correct** — recompute all five windows from that zone |

Getting this wrong shifts every window by hours and would go unnoticed for a day, which is why the
report states the measurement and the rule instead of a bare command.

---

## 26. WHERE does the CDR import cron run? — **UNKNOWN by design decision; NOWHERE today**

§25's install block targeted a Linux self-host server. The owner challenged whether that machine
exists in this environment. **It does not**, and I should have measured before writing "established
repo pattern" from the mere existence of two example scripts — that is [A-1], and I repeated the
claim twice before checking it.

### The measurement that settles it

The repo ships `pricing-worker-cron.example.sh` and `marketing-tasks-cron.example.sh` in exactly the
shape C-6 copied. **Neither has ever run in this environment:**

```
pricing_recompute_queue
  pending  41745   newest enqueued 2026-08-19   newest processed NULL
  done        42   newest enqueued 2026-05-24   newest processed 2026-08-11
  failed       8                                newest processed 2026-07-18
```

41,745 items queued and unprocessed; the last successful processing was **2026-08-11, four weeks
ago**, and 42 "done" out of ~41,795 is consistent with manual invocation, not a cron running twice a
minute as its own header prescribes.

So **the host-cron pattern in this repo is aspirational — inherited from documentation written for a
deployment we do not have.** Its scripts point at `https://app.afrakala.ir/...`, which is not on this LAN.

### What exists here

| | Measured |
|---|---|
| `192.168.170.8` | **Windows**, `West Asia Standard Time` = **UTC+05:00**, **no `crontab`**, no scheduled task |
| WSL | **Ubuntu present but STOPPED**; `docker-desktop` running |
| Containers | **UTC** — `afrakala-lan-web` has `/usr/sbin/crond`, but a rebuild wipes anything installed inside it |
| Linux self-host server | **does not exist on this LAN** |

**Answer: the CDR import cron runs NOWHERE today, and there is no machine in this environment
currently able to run the block §25 gave.** That block is correct for a Linux self-host server and
wrong for this environment.

### Four options, none silently chosen

| # | Where | Timezone behaviour | Survives a deploy |
|---|---|---|---|
| **A** | **Cron sidecar container in `deploy/lan/docker-compose.yml`** | **UTC**, same as the database | **yes** — declared in code |
| B | Windows Task Scheduler on `192.168.170.8` | **machine local = UTC+05:00**; `schtasks` has **no `CRON_TZ` equivalent** | yes |
| C | WSL Ubuntu | must be started and kept running; clock follows Windows | no |
| D | A real Linux self-host server | `CRON_TZ=Asia/Tehran` as in §25 | yes |

**Recommendation: A.** It is the only option whose timezone is already correct and deterministic —
the containers run UTC, `tehran_today()` exists precisely because the codebase assumes a UTC server,
and a sidecar deploys with the stack instead of depending on a machine's clock. It is also the only
one that behaves identically here and on a future Linux host. **It is new scope** — C-6 built a
host-cron driver, not a sidecar — so it is recorded as a recommendation, not done.

**If B is chosen, every window must be restated in UTC+05:00**, because Task Scheduler runs in
machine-local time and Tehran is 1.5 h *behind* it (`local = Tehran + 1:30`):

| Window | Tehran (D-39) | Machine-local UTC+05:00 |
|---|---|---|
| 1 | 08:00, 09:00 | **09:30, 10:30** |
| 2 | 10:00 … 12:30 /30m | **11:30 … 14:00 /30m** |
| 3 | 13:00, 14:00, 15:00, 16:00 | **14:30, 15:30, 16:30, 17:30** |
| 4 | 17:00, 18:00, 19:00 | **18:30, 19:30, 20:30** |
| 5 | 20:00, 02:00 | **21:30, 03:30** |

17 runs/day either way. **The five-line Tehran crontab and the seven-line UTC crontab are BOTH wrong
on this machine**, by 1.5 h and 5 h respectively — which is the failure the owner named: nobody would
notice for a day.

**The report carries this as UNKNOWN-pending-owner-decision with all four options, not a picked one.**
The `CRON_TZ` reasoning from §25 stands and is unaffected: it is right for options A and D, and has
no equivalent under B.

---

## 27. REGRESSION caught before merge — H-10's guard broke 13 persons spec files

**Row 519.** The most important thing this mission caught, and it was nearly merged.

### How it surfaced

H-10 added an `admin` guard to three unguarded `SECURITY DEFINER` readers. Its report claimed
*"zero other functions and zero views reference these three, and no e2e spec calls them."* The first
half was true. The second was false.

It surfaced only because the builder **re-measured the stated baseline instead of trusting it**. Had
it reported against the pinned 15/451, this would have shipped.

### The diagnosis, closed rather than hypothesised

`e2e/persons/` run in the **main tree on unmodified `origin/staging` code** against the shared
database — so the cause is the database, not any branch's TypeScript:

```
21 failed · 124 passed · 2 skipped · 1 did not run   (of 148)
= 8 of the pinned 9, plus 13 NEW
```

```
ERROR:  دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.
CONTEXT:  PL/pgSQL function person_fk_drift_report() line 4 at RAISE
```

I tested the causal claim rather than asserting it — the set difference is the evidence:

```
new-failure files that do NOT call the guarded reporters:  (none)
```

**One-to-one, zero unexplained.** All thirteen callers:
`aliases-crud · aliases-ui · credit-unchanged · credit-uses-person · external-party-person ·
filters-ui · filters-visible-persons · merge-ui · permission-matrix · profile-dossier-jwt ·
profile-dossier-ui · search-ui · search-visible-persons` — `merge-ui` was already in the pinned 9,
so twelve of them show as new files and thirteen call sites.

Most call it from `test.afterAll`, so the failure lands on the **last test in the file**
(`aliases-crud:256`, `aliases-ui:120`, `filters-ui:138`) rather than on anything topically related.
`external-party-person` shifted from `:130` to `:57`/`:115` for the same reason — which is exactly
why the rule is **compare the set, never the count**.

### Why three separate checks missed it

| Check | What it verified | Why it missed |
|---|---|---|
| Builder's catalog scan | "zero functions/views reference these" — **true** | `pg_depend` cannot see a caller that lives in a **test spec** over a direct psql connection |
| Builder's `grep src/` | no application caller — **true** | the callers are in `e2e/`, not `src/` |
| My [B-7] pass | `proacl` correct, `guarded` f→t | I verified **the claim**, never ran the suite |

**Verifying the claim is not the same as verifying the change.** The builder proved the property it
set out to create; nobody asked what else touched that property.

### The mechanism, and its link to a decision made deliberately

`dbScalar(...)` connects as `supabase_admin` with **no JWT**, so `auth.uid()` is NULL and
`has_role(NULL,'admin')` is false.

On **H-9** the builder allowed actor-less writes, reasoning the only JWT-less writers are
`service_role`, migrations and cron — all trusted. On **H-10** it chose the opposite, and recorded
the asymmetry: *"Note I chose the opposite for H-10, and both migrations say why."* That asymmetry is
precisely where this broke. The decision was documented, defensible in isolation, and wrong against a
caller nobody had enumerated.

### The fix (519)

Gate on **how the call arrived**, not on a NULL uid: a PostgREST request runs as `authenticated`/`anon`
and is refused without `admin`; a direct connection is already trusted at the connection level.
Closes on four halves — plain `authenticated` still refused, `admin` still succeeds, **direct
connection succeeds** (the half nobody tested), `anon` still holds no EXECUTE from `proacl` — and the
persons failure **set** back to the pinned 9.

### The transferable rule

> **Before declaring a database function has no callers, grep the whole repository for its name —
> not just the catalog and not just `src/`.** Tests, scripts, migrations and docs all call functions,
> and none of them appears in `pg_depend`.

Companion to §19: that rule was about what a revived path can *reach*; this one is about what already
reaches *it*. Both are invisible to a diff-shaped review.
