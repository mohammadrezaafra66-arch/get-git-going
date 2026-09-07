# Wave 6 — CONTRACTS

Fixed decisions. Every agent reads this file first and treats it as authoritative.
If your work needs something this file does not settle, return a blocker — do not invent it.

| | |
|---|---|
| Base | `origin/staging` @ `1c1328c6` — verified by orchestrator |
| Deployed | `APP_GIT_SHA=1c1328c6` — equals base |
| Migrations | disk max **482**, ledger **652 rows = 652 files** — in sync |
| Rows this wave | **26** (24 briefed + H-1 + H-2) |

---

## 1 · Migration numbers and timestamps — allocated centrally, do not deviate

Numbers 472–474 and 479–480 are **gaps on disk**. Do NOT reuse them; they may exist unpushed elsewhere.

| Agent | Numbers | Timestamp band (filename prefix) |
|---|---|---|
| **X** | 483 – 485 | `20260906180000` … `20260906182959` |
| **L** | 486 – 495 | `20260906190000` … `20260906195959` |
| **C** | 496 – 503 | `20260906200000` … `20260906205959` |
| **B** | 504 – 509 | `20260906210000` … `20260906215959` |

Filename: `2026MMDD<HHMMSS>_<NNN>_<name>.sql`. Use only numbers in your band. If you need more,
return a blocker naming how many — do not take from another band.

**Every applied migration is two steps** (CLAUDE.md rule 2b):

```
docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
  -v ON_ERROR_STOP=1 --single-transaction -f - < <file>.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c \
  "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('<timestamp>') ON CONFLICT DO NOTHING;"
```

Then `docker restart afrakala-lan-rest`. Then commit and push immediately (rule 5).

**Persian SQL never through a pipe and never via `psql -c`.** Write the file, deliver over stdin as
above (a Buffer, or `< file`, never `Get-Content | docker exec` — that appends a trailing CRLF),
verify with `md5sum` on both sides.

---

## 2 · Owner decisions taken this wave — [U], do not relitigate

**Q-2 · The chart of accounts (L-1).** Exactly these six, these codes:

| code | name | kind | is_control |
|---|---|---|---|
| 1000 | صندوق | asset | false |
| 1010 | بانک | asset | false |
| 1100 | طلب مشتریان | asset | **true** |
| 2100 | بدهی تأمین‌کنندگان | liability | **true** |
| 4000 | فروش | income | false |
| 5000 | خرید | expense | false |

**Q-3 · The cancel status (L-5).** A **new** `sales_quote_status` value **`cancelled_after_accept`**.
The existing `canceled` is already carried by 9 quotes cancelled *before* acceptance; the two
histories must never be conflated. Permitted **from `accepted` only**, by **`admin` / `accountant`**.

**Q-2b · What cancel undoes (L-5) — owner decision, recorded.**
Cancel does **two** things: (a) reverse the `sale_accrual` journal entry; (b) **release the credit
hold** that `hold_credit_for_quote` placed at acceptance. It does **not** touch the warehouse `tasks`
row — a human closes that. Leaving the hold in place would strand the customer's ceiling forever,
which is why (b) is in scope; the `tasks` table is outside Agent L's ownership, which is why the
third is not.

**H-2 · The implicit purchase payment amount — owner decision, recorded.**
When `pay_purchase_with_voucher` receives `_amount IS NULL`, the implicit amount pays the
**OUTSTANDING balance, never `cash_price`**.

**Q-1 · Issabel.** The read-only MySQL user **does not exist yet**. The owner is attempting to create
it during Stage 1. C-1..C-3 proceed regardless. C-4..C-8 are **`blocked`** unless the orchestrator
hands Agent C credentials in its dispatch. **Sample or fabricated CDR data is forbidden.**

---

## 3 · Cross-agent interfaces — what one agent's work makes true for another

| Interface | Owner | Consumer | Contract |
|---|---|---|---|
| X-1's **replacement guard** for `recompute_dynamic_capital_setting` | **X** | **L-3**, **B-3** | X names the guard's mechanism and its exact predicate in its report. **L-3 must not post inside a transaction the guard could re-enter.** B-3 reads X's landed version of the function before adding the floor. |
| The **manual ceiling override** column (B-3b) | **B** | — | B adds it. It is a **floor**, applied where the formula today applies `credit_limit` as a **ceiling** (`raw_allocation > credit_limit THEN credit_limit`). B must read X's landed function first. |
| C-2's **final `call_logs` columns** | **C** | C-4, C-8 | `extension text`, `is_missed boolean`, `is_internal boolean`, `disposition text`; `direction` CHECK gains `internal`. C-8's view and C-4's writer read exactly these names. |
| `reverse_document`'s accepted kinds | **L** | L-5, L-6 | Today, line 38: `IF _kind NOT IN ('receipt','payment','dual') THEN RAISE`. L must extend it — `pg_get_functiondef` **first** (rule 2), changing only that list and what the new kinds require. |
| Migration 481 | all | all | The template for a new table with `persons` FKs: registry **before** `ALTER TABLE`, RLS, **no `anon` grant**. |

---

## 4 · Measured ground truth — reproduced by the orchestrator 2026-09-06, not inherited

Every number in the brief's `[E]` block was re-measured and **matched exactly**:

```
journal_entries|47      journal_lines|94        call_logs|0
capital_allocation_ledger|0                     customer_credit_ledger|7
employee_streaks|0      credit_requests|0       person_field_definitions|0
person_field_values|0   sales_quotes_total|66   sales_quotes_accepted|9
purchases|317           notification_queue|1692 audit_login_success|0
asan_control_accounts|1 person_identifiers_mobile|36
```

```
journal_entries_doc_kind_chk: CHECK (doc_kind = ANY (ARRAY['receipt','payment','dual','purchase_payment','settlement','other']))
call_logs_direction_check:    CHECK (direction = ANY (ARRAY['inbound','outbound']))
person_field_definitions:     CHECK (field_type = ANY (ARRAY['text','number','date','bool','select','multiselect','jsonb']))
                              -- SEVEN values, and boolean is 'bool'
```

`hasPermission` **8 callers** in 6 files · `hasPermissionEx` **20 callers** · `PERMISSIONS` is
imported nowhere outside `roles.ts` (the only outside hit is the unrelated constant
`PERMISSIONS_TIMEOUT_MS` in `dynamic-permissions.ts`).

### Five hazards the orchestrator measured — read the one that is yours

**H·a — A quote can be BORN `accepted`.** `sales_quotes_validate_status` fires `BEFORE INSERT` too,
and its own comment says so verbatim:

```
-- A quote can also be born accepted: this trigger fires BEFORE INSERT as well, because a plain
-- INSERT with status='accepted' does not pass through the transition logic above ...
IF tg_op = 'INSERT' AND new.status = 'accepted' THEN
```

**An `AFTER UPDATE OF status` trigger alone would silently miss those rows.** L-3 must cover INSERT
and UPDATE. → **Agent L**

**H·b — Acceptance has three side effects, not one.** `update_sales_quote_status`, after the status
UPDATE, runs `PERFORM hold_credit_for_quote(...)` **and** inserts a warehouse `tasks` row on the
`store` queue. See §2 for exactly what cancel undoes. → **Agent L**

**H·g — there is no Postgres→MySQL path in this database. C-4 cannot use `postgres_fdw` or `dblink`.**
Measured `pg_available_extensions`:

```
dblink        | 1.2 | (not installed)
http          | 1.6 | (not installed)
pg_cron       | 1.6 | installed
postgres_fdw  | 1.1 | (not installed)
```

**`mysql_fdw` is absent entirely** — it is not in `pg_available_extensions`, so it cannot be installed
here. `dblink` and `postgres_fdw` speak Postgres, not MySQL, so neither reaches Issabel. C-4's row
says "whichever this image has (measure; if neither, a small Node route in `server/` that the cron
calls)" — **the measurement is done and the answer is neither.** Take the Node route. `package.json`
carries none of `mysql`/`mysql2`/`mariadb`, so a dependency is required; adding one is in scope for
C-4, and it must be self-hostable per CLAUDE.md principle 1. The `http` extension (1.6, available but
not installed) is one way for `pg_cron` to reach that Node route — evaluate it, do not assume it.
→ **Agent C**

### 🔴 CORRECTIONS to this file — found by Agent C, re-verified by the orchestrator. The database wins.

**C·1 — `pg_cron` is NOT installed in `afrakala`. H·g below was wrong.** Measured:

```
afrakala:  pg_available_extensions pg_cron -> NOT INSTALLED
afrakala:  schemata 'cron'  -> 0 rows          <-- no cron schema in this database at all
postgres:  schemata 'cron'  -> 1 row
```

The three jobs that operate on afrakala are scheduled **from the `postgres` database** with
`database='afrakala'` as an argument (jobids 20–22). **A migration applied to `afrakala` cannot call
`cron.schedule` or `cron.schedule_in_database`.** Any nightly job is therefore two steps: the
migration creates the **function** in `afrakala`; the schedule is a separate command run against
`postgres`. Record that command verbatim so it is reproducible.

**A cron session carries no JWT**, so `auth.uid()` is NULL inside it — a function guarded by a role
assertion raises `42501` under cron and the job silently does nothing forever. Prove any scheduled
function works through the **no-JWT** path, not just as admin. → affected **L-7**, **B-2** (both
agents were sent this correction mid-flight).

**C·2 — `normalize_identifier` returns `NULL`, not an empty string.** H·i below says "empty"; that
was an artefact of `psql -A` printing NULL as blank. Measured:
`02138001000 → NULL`, `201 → NULL`, `09154000018 → +989154000018`. **`= ''` would silently match
nothing; test `IS NULL`.**

**C·3 — `call_logs.employee_id` is `NOT NULL` and the table has ZERO foreign keys.** A CDR row for an
unmapped extension **cannot be inserted at all**. That makes C-3's extension table a **hard
prerequisite** for C-4, not a convenience, and C-4 must resolve the extension to an employee before
insert or define a policy for unmapped extensions.

**C·4 — the route gate carries ROLES, not permissions.** This file said new routes carry
`staticData.gate` "with the live `role_permissions` set". Measured:
`RouteGate = { kind:"anyRole"; allowed: AppRole[] } | { kind:"admin" }` — a `permission` kind was
deliberately never shipped. `RouteRoleGate` holds on `permissionsLoading` for the page's own
`hasPermissionEx` calls. Gate on roles; use `hasPermissionEx` inside the page.

**C·5 — `profiles` SELECT is admin-only.** Admin sees 41 profiles; **a manager sees 1** (their own).
Any screen that asks a manager to pick a colleague will show an empty dropdown. Widening `profiles`
RLS is a security change to an existing policy and is **out of scope for this wave** — say so in the
UI rather than shipping a broken picker. The same limitation already exists in
`_app.gamification.admin.manual-metrics.tsx`.

**C·6 — 🔴 Agent X's rename broke THREE spec references across TWO files**, not the one Agent C
found. `capital_allocation_ledger` → `zz_retired_capital_allocation_ledger` leaves:

```
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:118
e2e/security/og103-anon-table-grants-stay-closed.spec.ts:312
e2e/business-flows/213-dynamic-customer-credit-scoring.spec.ts:399
```

`og103` fails its meta-check (`sel=187 wr=201` against an expected `sel=188 wr=202`); every actual
anon-grant assertion still passes. **The orchestrator owns this fix at integration** — no agent
should touch it, since it spans X's and L's territories.

**C·7 — the brief never defined C-6.** Agent C correctly refused to guess rather than invent a row.
C-6 was the D-39 import schedule; it is moot while C-4 is blocked, and it is counted as `blocked`.

---

**H·h — `staff_daily_performance_metrics` has THREE call columns, not two.** Measured:
`inbound_calls_count integer`, `outbound_calls_count integer`, `talk_time_minutes integer`
(alongside `metric_date`, `staff_user_id`, `sales_amount`, `profit_amount`, `notes`). C-7 says
"`calls_made / talk_minutes` (or the real column names)" — these are the real names, and there are
three. The table holds **11 rows for 8 employees, last written 2026-08-11**. → **Agent C**

**H·i — the normaliser C-5 must reuse, named and tested by the orchestrator.**
Database: **`normalize_identifier(_kind text, _raw text, _strict boolean)`** (also
`normalize_phone_local(_raw text)`). TypeScript: `normalizeIdentifier(kind, raw)` in
`src/lib/persons/identifiers-normalize.ts`; see also `src/lib/persons/find-by-phone.ts`.
`normalizeSearchText` is **not** a phone normaliser — do not use it.

Measured, `normalize_identifier('mobile_e164', v, false)`:

```
09154000018   -> +989154000018      0915 400 0018 -> +989154000018
9154000018    -> +989154000018      ۰۹۱۵۴۰۰۰۰۱۸   -> +989154000018   (Persian digits)
+989154000018 -> +989154000018      02138001000   -> (empty)          (landline)
989154000018  -> +989154000018      201           -> (empty)          (extension)
```

All six mobile shapes a CDR can carry normalise identically, so matching against
`person_identifiers.mobile_e164` (**36 rows**) is sound. **The empty return on `201` and on a
landline is useful, not a defect** — it is a cheap discriminator for C-4's `is_internal` detection
(a value that fails mobile normalisation and is 3–4 digits is an extension). → **Agent C**

**H·c — `idx_call_logs_external` is NOT unique.** Measured:

```
CREATE INDEX idx_call_logs_external ON public.call_logs USING btree (external_id) WHERE (external_id IS NOT NULL)
```

A re-run of the importer will duplicate rows. C-4's idempotency needs a **unique** index; this one
will not give it. → **Agent C**

**H·d — `role_permissions` is 28 modules × 7 roles with three gaps.** Live counts:
`accountant 28 · admin 28 · manager 28 · sales 28 · viewer 28 · purchase_specialist 27 · site 26`.
The three missing rows belong to `purchase_specialist` and `site` — and **neither role is held by any
user** (`user_roles`: admin 14, sales 14, accountant 3, manager 3, viewer 2). X-3's blast radius is
therefore smaller than the research feared, **but X must confirm this itself** and fill the gaps
before removing the fallback. → **Agent X**

**H·f — 🔴 the Asan journal export will LEAK your accrual entries unless you stop it.** This is a
**design requirement for L-3/L-4**, not merely something L-9 tests afterwards.

`asan_list_journal_export(_from, _to, _filter)` accepts `_filter` in
`('all','receipt','payment','third_party','settlement','purchase_and_settlement')` — **`NULL` raises.**
Its final WHERE, measured:

```
WHERE _filter = 'all'
   OR (_filter = 'purchase_and_settlement' AND k.dkind IN ('purchase_payment','settlement'))
   OR k.dkind = _filter
```

**Under `_filter = 'all'` every posted `journal_entries` row in the date range is exported.** Its only
other exclusions are cheque documents and reversed pairs — nothing filters by `doc_kind` allow-list.
So a `sale_accrual` or `purchase_accrual` entry with `status = 'posted'` **will appear in the Asan
journal export the moment L-3/L-4 post one**, which directly violates D-30 ("only invoices go to
Asan, ledger rows never do").

L-3/L-4 must exclude the accrual kinds from this export **as part of building them** — do not post
first and discover it in L-9. Note also that `asan_list_journal_export` resolves account codes by
joining `asan_control_accounts` (**1 row**) on `account_kind`; accrual lines carrying new account
kinds would resolve to NULL and surface as a `blocked_reason`, so the leak would be visible *and*
malformed.

**Orchestrator baseline for L-9, taken before any accrual row existed** — all nine export surfaces,
in `docs/missions/wave6/baselines/` with `asan_manifest_before.txt`:

```
847aa3f1c14a1c9fde590663b023de2d  asan_bank_before.txt                        (21 lines)
1c594d515e0911d2d145d7f27a1693d5  asan_journal_all_before.txt                 (77 lines)
1e917cf744017520596ec77e6797eb6b  asan_journal_payment_before.txt             (23 lines)
77fa3e29270cad03081c5637eaf80bd2  asan_journal_purchase_and_settlement_before.txt (3 lines)
c676b08cf005996d3b327696f97397eb  asan_journal_receipt_before.txt             (37 lines)
77fa3e29270cad03081c5637eaf80bd2  asan_journal_settlement_before.txt          (3 lines)
02574ad42554c3daabac90c0b9bafe70  asan_journal_third_party_before.txt         (19 lines)
f828766450693f30dcc26e3321d956fa  asan_purchase_before.txt                    (320 lines)
489dfce9312a7a35e58db348ab69f051  asan_sales_before.txt                       (12 lines)
```

All were taken as admin `1a15e8c6-3a83-49c2-9531-db9046d30968` over `2026-01-01 … 2026-12-31` inside
`BEGIN … ROLLBACK`. **These exports are `SECURITY DEFINER` and role-gated to `admin`/`accountant`** —
querying them as bare `postgres` raises `42501`, so use a simulated JWT:
`SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}'`. L-9 re-runs all nine
after accrual rows exist and shows the same nine md5s. → **Agent L**

**H·j — H-2's defect, located exactly.** In `pay_purchase_with_voucher`:

```
line 50:  _outstanding := GREATEST(_debt - _already, 0);
line 53:  _amt := COALESCE(_amount, _purchase.cash_price, _purchase.total_amount);
line 65:  IF _amt > _outstanding THEN  ... RAISE ...
line 151: IF _debt <= 0 OR (_already + _amt) >= _debt THEN   -- 478: paid_at marks SETTLEMENT
```

`_outstanding` is already computed at line 50, three lines before `_amt` is chosen — so the clamp the
owner decided on is a one-line change at 53/54, applied **only when `_amount IS NULL`** so an explicit
over-payment stays an error. Per the owner decision in §2, the implicit amount pays the
**outstanding balance, never `cash_price`**. Read the whole function with `pg_get_functiondef` before
you touch it (rule 2), and do not change the signature (11 args) — a defaulted parameter would
overload, not replace (rule 5).

Purchase facts for L-4 / L-6: `purchases` carries `total_amount`, `cash_price`, `paid_at`, `paid_by`,
`supplier_id`, `supplier_person_id`, `purchase_date`, `status`. **`status` has exactly one value in
use — `received`, on all 317 rows** — so L-6's cancel path is adding a value where none has ever
existed. There is no cancel path today anywhere in the database or in `src/`.

**H·e — only 4 of the 6 test roles have a session generator.** Six accounts exist
(`test.admin / manager / sales / sales2 / accountant / viewer @afrakala.local`), but
`e2e/auth/generate-role-sessions.spec.ts` produces only `admin`, `accountant`, `salesperson-a`
(=`test.sales`) and `salesperson-b` (=`test.sales2`). **There is no `manager` and no `viewer`
storageState.** X-3's cold-`viewer` demo and B-3's `manager` approval each need one — extend the spec
(preferred; it is the shared path) or log in directly. Password `AfraTest!1404`; run with
`E2E_LAN_TEST_PASSWORD` set and `E2E_ALLOW_LAN_PASSWORD_RESET=0`, or it randomises the passwords.
→ **Agents X and B**

---

## 5 · Environment — verbatim

App `http://192.168.170.8:3100` · Kong `:9000` · DB `afrakala` on `afrakala-lan-db`.
Read-only: `docker exec -u postgres afrakala-lan-db psql -d afrakala …`.
**Production `192.168.170.10` must never be contacted, resolved or pinged.**
**Nobody logs into Issabel's web UI.**

Sessions were regenerated 2026-09-06T15:45Z with roughly a 1-hour TTL. If a spec 401s, regenerate —
do not debug the app:

```
$env:E2E_LAN_TEST_PASSWORD='AfraTest!1404'; $env:E2E_ALLOW_LAN_PASSWORD_RESET='0'
$env:E2E_AUTH_BASE_URL='http://192.168.170.8:3100'
npx playwright test --config=pw.auth.config.ts e2e/auth/generate-role-sessions.spec.ts
```

Typecheck baseline is **70 errors across 6 files**. A worktree without `node_modules` reports **0**
silently — that is not a pass. Seed the junction before you trust a typecheck. (`npx tsc --noEmit`
exits **2** when errors exist; that is the baseline behaviour, not a failure.)

**Measured by the orchestrator on `1c1328c6`, per file — hold yourself to your own file's number:**

```
18  src/routes/_app.products.index.tsx        <- Agent X touches this (X-2 caller)
15  src/routes/_app.admin.sales-reminders.tsx
13  src/lib/accounting/functions.ts           <- likely Agent L territory
13  src/lib/invoices/functions.ts             <- likely Agent L territory
 6  src/lib/audit/index.ts                    <- likely Agent X (H-1) / Agent B territory
 5  src/routes/_app.admin.automation.tsx
                                              == 70
```

**Three of the six baseline files sit inside agents' territories.** That matters for two reasons.
First, "no worse than 70" is not enough on its own — if you touch one of these files, report **that
file's** count before and after, so an addition cannot hide behind an unrelated reduction elsewhere.
Second, CLAUDE.md's `Staging Check` rule allows an `--admin` merge only after you confirm **no file
of yours is in the run log** — for these three agents a file of yours *is* in it, so that shortcut is
not available to you by default. Say so in your report rather than merging past it.

Known pre-existing, not yours: `afrakala-lan-web` reports `unhealthy` (failing streak 65). Its
healthcheck hits `http://127.0.0.1:3000/api/healthz` and receives a 4xx/5xx; `/login` returns **200**
and the app serves normally. Do not chase it — it is handed forward.

---

## 5b · Scoped e2e baseline — and the one red spec you must NOT "fix"

Taken by the orchestrator 2026-09-06 14:52–15:06Z, `e2e/security/ e2e/business-flows/ e2e/persons/`,
`--workers=1`:

```
442 passed · 18 failed · 3 skipped   (463 total, 13.9m)
```

**This baseline is CONTAMINATED and is provisional.** It overlapped Agent X's first migration, and
the live database is shared between every agent (CLAUDE.md: "The live database is shared too").
The orchestrator re-takes a clean baseline at integration, when the tree is quiet. Compare against
the re-taken number, not this one.

### 🔴 H·k — `og81-migration-ledger-matches-disk` WILL go red during this wave. Do not "fix" it.

Two of the 18 failures are directly caused by the wave itself, and their cause is now measured:

```
Error: disk 652 vs ledger 653 — the two must agree exactly
extra ledger version: "20260906180000"      <- Agent X's own migration 483
```

This is **correct behaviour by everyone involved.** Agent X applied its migration to the shared
`afrakala` database and recorded the ledger row, exactly as CLAUDE.md rule 2b requires. The migration
*file* lives on X's feature branch; the spec reads `supabase/migrations` from the main tree, which is
on `staging`. So the ledger legitimately leads disk until the branch merges.

**Expect this spec to be red for every agent from the moment you apply your first migration until
your branch reaches `staging`.** It must go green again at integration — that is the orchestrator's
check, not yours.

🔴 **Never `DELETE` the ledger row to make this spec pass.** Rule 2b's discipline runs in one
direction only: a migration applied but unrecorded gets **recorded**; a migration recorded but not
yet on `staging` gets **merged**. Deleting the row would make the ledger lie about a schema change
that has really been applied to the live database, and the next person reading the ledger to decide
what to run on production would re-run a non-idempotent migration. If og81 is your only red spec and
the extra version is one of yours, say so in your report and move on.

### The other 16 — classified

**The 9 `e2e/persons/` failures are STABLE PRE-EXISTING, not contamination.** The orchestrator re-ran
that suite alone and got the **identical 9** (`137 passed · 9 failed · 2 skipped`). One was opened to
the screenshot: `quote-list-link.spec.ts` reaches the quote page fully authenticated as
`test.admin` — the page renders, the quote and the customer «مشتری آزمایشی 1» are both displayed —
but the customer name is **plain text with no `/persons/…` anchor**, which is exactly what the spec
asserts. So this is a real UI defect that predates the wave, not an auth or session problem.
**It is out of wave-6 scope and is handed forward.** The stable list:

```
credit-unchanged · credit-uses-person · external-party-person · inline-supplier-create
merge-ui · person-create-normalize · person-create-with-identifier · quote-list-link
supplier-form-person
```

Treat these 9 as green-equivalent: they must not grow, and you are not asked to fix them.
The 5 `e2e/business-flows/` failures and `og-bot-api-keys-cold-gate` are still being classified;
`og81`'s 2 are H·k above.

### `rule12`'s offender list — measured, and this is the exact bar

`e2e/security/rule12-no-gate-creates-posted-documents.spec.ts` is red at baseline with **exactly one**
offender:

```
these specs create a financial document with no rolled-back transaction:
  e2e\unit\ledger-wizard-party-pick.spec.ts
```

**That list must contain exactly that one file at the end of the wave.** Every spec you write that
calls a document-creating RPC — `create_receipt`, `create_payment`, `pay_purchase_with_voucher`,
`reverse_document`, and the accrual posters L is about to build — runs inside `BEGIN … ROLLBACK`, or
it lands on this list and the wave fails its Definition of Done. Do not fix the existing offender;
it is not yours and changing it moves the baseline.

---

## 6 · Shared-tree discipline — six incidents in four days

One `git worktree` per agent, from `origin/staging`. The main tree at `D:\AfraKalaTest\app` is
**read-only to you** — never switch it, never commit from it.

- **No `git stash`.** Ever. It yanks another agent's in-flight work out from under them.
- **No `git add -A` and no `git add .`.** Stage and commit in ONE invocation, pathspec repeated:
  `git add -- $paths; git commit -q -m $msg -- $paths`
- **No `git show 'ref:path'`** on Windows.
- If your commit captures someone else's work: **do not fix it.** Report it and move on. Do not
  force-push, revert, or reset.
- Commit each phase the moment it is verified. Uncommitted work gets destroyed.
- After every commit: `git push origin HEAD`. If it fails non-fast-forward, **stop and report**.

Branch names: `feature/wave6-x-foundations`, `feature/wave6-l-ledger`, `feature/wave6-c-phone`,
`feature/wave6-b-builds`. CI Boundary Guard allows migrations only on `feature/*`.

---

## 7 · Integrity — forbidden, without exception

A second ledger · a second chart of accounts · a second `call_logs` · a second permission table ·
touching `compute_employee_score`'s **body** · importing CDR rows before C-1 lands · faking CDR with
sample data · any `anon` grant on a new object · a route without `staticData.gate` · logging into
Issabel's web UI · `git stash` · production · `@ts-ignore` · `.skip` · `test.fixme` ·
running `/autofix-pr`.

**Evidence required, by row kind:**

| Kind | Evidence |
|---|---|
| BUILD | Object exists · RLS from `pg_policies` · grants showing `anon=f` · one real row through the path, rolled back or cleaned, with its audit row where applicable |
| FIX | The same probe twice — wrong, then right |
| VERIFY | `EXCEPT` both directions, or byte comparison; every difference named |
| INVESTIGATE → … | The measurement first, quoted; then the action; then the measurement repeated |
| RETIRE | Object gone or renamed, zero references — and for X-1, the guard shown still firing |

**Halt and write state** on: X-1's guard unreproducible · migration 328's event trigger firing · the
transition trigger refusing L-5's extension · an Asan export changing bytes (L-9) · C-4 finding CDR
columns that do not match the map · typecheck above 70.

**Release-note trailer.** A commit a user can see ends with a Persian `Release-note-fa:` line.
Internal work — migrations, refactors, docs, tests, tooling — gets **no** trailer; that is correct,
not an omission.

---

## 8 · Progress ledger

Append one row when a numbered row closes. Do not rewrite another agent's row.

| row | agent | verdict | evidence | commit |
|---|---|---|---|---|
| H-1 | X | ✅ closed | Orchestrator-verified. Direct UPDATE 52103→52104, direct INSERT 52103→52104, RPC 52103→52104 — **exactly one each, no double-audit**. Wave 5's probe produced **0** on both direct paths. X made the trigger the single writer and removed the inline RPC audit INSERTs. | `68f8d5d0` |
| X-1 | X | ✅ closed | Orchestrator-verified. Guard reproduced live: 0 reservations → `{"skipped": false}`; one live `hold` in `customer_credit_ledger` → `{"skipped": true, "reason": "ledger_exists", "ledger_rows": 1}` with **ceilings unchanged**. Fires on the NEW live source, which the empty old table never could. Table renamed to `zz_retired_capital_allocation_ledger`. | `ea22cc53` |
| X-2 | X | ✅ closed | `hasPermission(` callers **0** (was 8); `hasPermissionEx(` **28 callers** = 20 + 8. | `87b0fe3d` |
| X-3 | X | ✅ closed | `PERMISSIONS` matrix removed (only 2 explanatory comments remain). All 7 roles now at **28** `role_permissions` rows — the 3 gaps filled. Cold-demo: see below. | `8a20ab61`, `3903ea54` |

| C-1 | C | ✅ closed | Per-row trigger batched. Same probe, 100 rows in `BEGIN…ROLLBACK`: firings **100 → 0** on insert, **1** with one batch call; INSERT 145.9ms → 2.1ms. Replaced by `recompute_employee_scores_from_calls(_since)`, which **returns** failures instead of swallowing them. `compute_employee_score` read only, never touched. | `3d8a61f5` |
| C-2 | C | ✅ closed | `extension/is_missed/is_internal/disposition` added; `direction` CHECK now accepts `internal` (previously rejected outright). **H·c closed**: the non-unique `idx_call_logs_external` replaced by `call_logs_external_id_unique_idx` (partial, mirroring the original) — duplicate `external_id` now raises **23505**, two NULLs still both accepted. | `e3d99ba4` |
| C-3 | C | ✅ closed | `call_log_extensions` (`employee_id` → **`profiles(id)`**, measured: 9/9 `employee_scores` join `profiles`, **0 join `persons`**). **Migration 328 never fired** — persons FKs 31 before / 31 after, registry 31 rows / 0 not-ok. RLS proven under real JWTs: admin insert ok, dup 23505, sales read-only (insert 42501), viewer read-only, **anon SELECT=f INSERT=f**. Screen `/admin/call-extensions` gated `anyRole [admin, manager]`, holds on `permissionsLoading`. | `e4f1516d`, `b51f2761` |
| C-4…C-8 | C | 🚫 **blocked** | No Issabel read-only MySQL user. Ready-to-run `CREATE USER`/`GRANT` restricted to `192.168.170.8` supplied for the owner, plus env key names (`ISSABEL_CDR_*`, server-side only, never `VITE_`). **No CDR data imported, fabricated, sampled or mocked; the PBX was not contacted at all.** | — |

| L-1…L-9, H-2 | L | ✅ all closed | Migrations **486–495, band fully consumed**. Chart verified by orchestrator: 6 accounts, exact codes/kinds/control flags, Persian intact, `anon` f/f. `doc_kind` CHECK now carries `sale_accrual`+`purchase_accrual`. **47 entries / 94 lines unchanged, `lines_with_account_id`=0** (D-28 honoured). `pay_purchase_with_voucher` still **1 signature** (no overload). cron **jobid 23** `database='afrakala'` active. | 8 commits |

**L-9 re-verified by the orchestrator against its own pre-wave manifest — all nine surfaces byte-identical:**

```
IDENTICAL  bank                             847aa3f1c14a1c9fde590663b023de2d
IDENTICAL  journal_all                      1c594d515e0911d2d145d7f27a1693d5
IDENTICAL  journal_receipt                  c676b08cf005996d3b327696f97397eb
IDENTICAL  journal_payment                  1e917cf744017520596ec77e6797eb6b
IDENTICAL  journal_third_party              02574ad42554c3daabac90c0b9bafe70
IDENTICAL  journal_settlement               77fa3e29270cad03081c5637eaf80bd2
IDENTICAL  journal_purchase_and_settlement  77fa3e29270cad03081c5637eaf80bd2
IDENTICAL  purchase                         f828766450693f30dcc26e3321d956fa
IDENTICAL  sales                            489dfce9312a7a35e58db348ab69f051
```

**D-30 holds.** Agent L additionally ran an A/B control (accrual triggers disabled vs enabled on the
same fixture) — all nine identical, so the exclusion is real and not an artefact of there being no
accrual rows yet.

**L-8's five verdicts:** `post_receipt_accounting` **REBUILD** (live caller
`_app.accounting.receipts.$receiptId.tsx:338`, in the deployed bundle — and it is the *sole* receipt
journal writer, so it must never be retired) · `recompute_employee_scores_on_receipt` **REBUILD**
(live trigger on `payment_receipts`) · `calculate_salesperson_collected_sales`,
`recalculate_settlement_score`, `update_customer_overdue_status` all **RETIRE** (0 callers each;
the latter two's triggers died with the dropped `invoices` table).

### 🔴 H-2 — the orchestrator's own prescribed fix was WRONG, and Agent L caught it

This file and L's brief prescribed `_amt := LEAST(_amt, _outstanding)`. That **still pays
`cash_price` whenever `cash_price < outstanding`** — precisely what the owner decision ("the implicit
default pays the OUTSTANDING balance, **never** `cash_price`") forbids, and it cannot produce the
required "outstanding 0". Migration 494 applied the brief's version; L's own proof caught it and
**495 corrects it** to:

```
82:  IF _amount IS NULL AND _debt > 0 THEN
83:    _amt := _outstanding;
```

Verified by the orchestrator in the live function. An explicit over-payment is still refused.

### Risks Agent L surfaced that the owner should see

- 🔴 **`person_settlement_position` sums `(debit − credit)` over `customer_credit` with NO reversal
  filter.** Accrual debits are the first sale-driven debits this system has ever had, so the numbers
  on `/accounting/mutual-settlement` **will move**. This is D-31 territory and was deliberately not
  touched. **The owner should approve that movement.**
- `release_credit` labels the cancel-driven ledger row `reference_type='payment_receipt'`. Reusing it
  was still correct (single audited path, caps at `held_credit`); relabelling needs a signature change
  affecting other callers.
- `run_daily_capital_allocation` and `recompute_dynamic_capital_setting` both read the
  **never-written** `has_overdue`, so their "overdue ⇒ ceiling 0" branch is **permanently
  unreachable**. Pre-existing; handed forward.
- Rebuilding `recompute_employee_scores_on_receipt` would **double-count** against its live sibling.
- Migration 492's *header comment* is outdated (its SQL is correct). Rule 6 forbids editing an applied
  migration and L's band is exhausted — **a one-line comment fix needs a future migration number.**
- **`purchases.supplier_id` is populated on only 16 of 317 rows (5%)** — the research's open `[?]`.
  The payable line carries a NULL subledger for the other 95%; `validate_journal_line_ref` returns
  early on NULL so it still balances.

**Final `call_logs` schema as landed** — C-4/C-8 depend on these exact names. `direction` CHECK is
`inbound|outbound|internal`; `UNIQUE INDEX call_logs_external_id_unique_idx (external_id) WHERE external_id IS NOT NULL`;
`idx_call_logs_extension (extension) WHERE extension IS NOT NULL`; **0 user triggers; 0 foreign keys;
`anon` holds nothing.** `is_missed` and `is_internal` are **nullable with no default on purpose** — a
`DEFAULT false` would assert "not missed" about rows nobody classified. **Consumers must write
`is_missed IS TRUE`, never `NOT is_missed`.**

**X-3 cold demo — the negative control, run by the orchestrator.** Against the pre-X deployed build
(`APP_GIT_SHA=1c1328c6`) X's own spec **fails** with:

```
/accounting/treasury: the gate must hold while role_permissions is in flight, not guess
Expected value: "checking"
Received array: ["denied"]
```

The old gate **guessed a refusal** during the stall — exactly the flash X-3 exists to eliminate. The
spec is therefore not vacuous. The positive case was then run against `APP_GIT_SHA=3903ea54`.

**Agent X terminated early on a session rate limit and never delivered its own report.** Everything
above was measured independently by the orchestrator, not taken from the agent's claim.

### 🔴 Two of X's edits land in other agents' territory — build on X, not on `staging`

- **`src/lib/auth/AuthProvider.tsx`** — X added a `permissionsLoading` value to the auth context,
  which X-3 requires (with the matrix gone, `hasPermissionEx` returns `false` while the table is in
  flight, so anything rendering on a permission must wait). It tracks *"we finished trying"*, not
  *"we have rows"*, deliberately: a failed fetch then denies rather than spinning forever.
  **→ Agent B: B-1's login write path is in this same file. Branch from X's landed version.**
- **`e2e/asan/export-shell.spec.ts`, `e2e/asan/import-persons.spec.ts`** — these asserted the static
  matrix existed and agreed with `role_permissions`; removing the matrix necessarily inverted them.
  **→ Agent L: do not revert these; they are X's, and correct.**
