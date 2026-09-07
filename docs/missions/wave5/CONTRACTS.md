# Wave 5 — allocation workbench («پخش حساب») · CONTRACTS

Central, orchestrator-owned. **Agents read this; only the orchestrator writes it.**
Never write to root `PROGRESS.md` during this wave.

---

## 0 · Stage-0 ground truth — measured 2026-09-06, do not re-derive

| Item | Value |
|---|---|
| Base | `origin/staging` = local `staging` = **`a4338604`** |
| Deployed | `APP_GIT_SHA=a4338604` — **equals HEAD** ✅ |
| App | `http://192.168.170.8:3100/login` → 200 in 0.08s |
| Migrations | disk **649** = ledger **649**, zero drift both directions ✅ |
| Highest migration | **477** (`20260906150000_477_close_anon_table_grants.sql`) — checked on disk **and across all remote branches**; 477 is the ceiling everywhere |
| DB | `afrakala` on `afrakala-lan-db` |
| Typecheck baseline | **70** — reproduced in the main tree and in **both** worktrees (junctioned `node_modules`, so the silent-0 trap is avoided) |

### e2e sessions — regenerated and verified ✅

All four were **expired by ~14.4 hours** at dispatch (`exp` 1788644397–1788644413 vs now).
Regenerated 2026-09-06 17:0x; all four now carry a live access token + refresh token.

**Trap hit and fixed — record this, it will recur.** The generator only calls
`setPasswordViaAuthAdmin` when `usingProvidedPasswords` is **false**
(`generate-role-sessions.spec.ts:383-385`). With `E2E_*_PASSWORD` set it *skips* the reset and
merely logs in — so `test.sales2@afrakala.local`, still holding a random ephemeral password from
a wave-4 run, returned **400 invalid_grant**, and its storage file had already been **deleted**
(the generator unlinks all four up-front, line 363). Fixed by resetting that one account to the
documented password through the Auth Admin API, then re-running.

**All six accounts now return HTTP 200 on the documented password:**
`test.admin` · `test.accountant` · `test.sales` · `test.sales2` · `test.viewer` · `test.manager`

To regenerate (all four password vars are mandatory; `E2E_AUTH_BASE_URL` dodges the OG-82 TLS fault):

```bash
export E2E_ADMIN_PASSWORD='...' E2E_ACCOUNTANT_PASSWORD='...' \
       E2E_SALESPERSON_A_PASSWORD='...' E2E_SALESPERSON_B_PASSWORD='...' \
       E2E_AUTH_BASE_URL='http://192.168.170.8:9000'
npx playwright test --config=pw.auth.config.ts e2e/auth/generate-role-sessions.spec.ts
```

⚠️ `pw.auth.config.ts` **is tracked in git** (despite its own comment saying "Not committed") and its
`testMatch` is `/auth/.*\.spec\.ts/` — which also matches `save-admin-session.spec.ts`, a spec that
calls `page.pause()` and silently writes an **empty** storage state. **Always pass the explicit file
path** as shown above. Do not edit that config.

### Scoped Playwright baseline — the number to beat

`e2e/security/ e2e/business-flows/ e2e/persons/ --workers=1`, on **live** sessions:

**436 passed · 16 failed · 3 skipped (13.8m)**

The 16 pre-existing failures:

| # | Spec |
|---|---|
| 1 | `business-flows/211-216-rejected-quote-notification.spec.ts:401` |
| 2 | `business-flows/212-quote-credit-guard.spec.ts:640` |
| 3 | `business-flows/213-dynamic-customer-credit-scoring.spec.ts:501` |
| 4 | `business-flows/214-whatsapp-market-purchase-advisor.spec.ts:35` |
| 5 | `business-flows/215-quote-inventory-finalization.spec.ts:329` |
| 6 | `persons/credit-unchanged.spec.ts:125` |
| 7 | `persons/credit-uses-person.spec.ts:21` |
| 8 | `persons/external-party-person.spec.ts:130` |
| 9 | `persons/inline-supplier-create.spec.ts:106` |
| 10 | `persons/merge-ui.spec.ts:62` |
| 11 | `persons/person-create-normalize.spec.ts:54` |
| 12 | `persons/person-create-with-identifier.spec.ts:37` |
| 13 | `persons/quote-list-link.spec.ts:33` |
| 14 | `persons/supplier-form-person.spec.ts:42` |
| 15 | `security/rule12-no-gate-creates-posted-documents.spec.ts:109` |
| 16 | `security/s2r-tier1-routes-refuse-a-cold-session.spec.ts:170` |

**#16 is an order-dependent flake, not a broken account** — it fails in the full run
(GoTrue rate-limits the repeated cold logins) but **passes in isolation** (verified, 9.8s).
Cold `test.accountant` UI login therefore *works*, and U-3's cold-role evidence is available.

### 🔴 rule12 offender list — the invariant U-4 must not grow

`security/rule12-no-gate-creates-posted-documents.spec.ts:109` fails at baseline with **exactly one**
offender:

```
e2e\unit\ledger-wizard-party-pick.spec.ts
```

**U-4 must keep this list at exactly that one file.** Any document-creating RPC in a new spec goes
inside `BEGIN … ROLLBACK`.

---

## 1 · Owner decisions taken this wave — [U], do not relitigate

Answered by the owner at dispatch, in addition to D-13..D-24 in the brief:

- **Q-1 · Creditor link → person level + OPTIONAL purchase reference.** Owner's words: *"The
  accountant works with people, not purchase numbers. When 2 billion goes to a supplier with five
  open purchases, which one it settles is decided at payment time (P-2), not on the allocation row."*
- **Q-2 · Debtor link → customer level + OPTIONAL quote reference.** Symmetric.
- **Q-3 · Partial payment → REUSE `payment_vouchers.purchase_id` + `amount` if it can carry the
  semantics.** Owner's words: *"A new table when an existing column fits is the failure this
  programme exists to prevent."* **The bar, verbatim:** read **every** caller of
  `payment_vouchers.purchase_id` first; if none conflicts, **reuse**. Mirror `payment_receipt_links`
  with a new link table **only if** P *proves* the existing columns cannot carry the semantics
  (e.g. one voucher must settle several purchases, or a live caller conflicts).
  **Report which path P took and why, in one line.**

---

## 2 · Migration numbers and timestamps — allocated centrally, do not choose your own

477 is the ceiling on disk, in the ledger, and on every remote branch. Use **only** what is
assigned to you. Filename form `2026MMDD<HHMMSS>_<NNN>_<name>.sql`.

| Agent | Numbers | Timestamps |
|---|---|---|
| **P** | 478, 479, 480 | `20260906160000`, `20260906161500`, `20260906163000` |
| **A** | 481, 482, 483, 484 | `20260906170000`, `20260906171500`, `20260906173000`, `20260906174500` |
| **U** | 485 | `20260906180000` — registry / `role_permissions` seed **only** |

Use the lowest unused number in your block; leaving some unused is fine and expected.

### Applying a migration — both steps, every time

```bash
# 1 · deliver over stdin (docker cp is BROKEN on this machine — mount-layer fault)
cat <file>.sql | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/mig.sql'
#    verify byte-identical BOTH SIDES — md5-or-nothing
md5sum <file>.sql ; docker exec afrakala-lan-db md5sum /tmp/mig.sql
# 2 · apply
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
  -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig.sql
# 3 · RECORD THE LEDGER ROW IN THE SAME BREATH — psql does NOT write it
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c \
  "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('<timestamp>')
   ON CONFLICT (version) DO NOTHING;"
# 4 · reload PostgREST
docker restart afrakala-lan-rest
```

**Persian SQL never through a PowerShell pipe and never via `psql -c`.** Every migration in this
wave carries Persian UI strings → file path only, UTF-8 no BOM, `SET client_encoding='UTF8';` first.

**Never leave a migration applied but uncommitted.** Push the branch the moment it is applied.

---

## 3 · Worktrees — seeded and verified

| Agent | Path | Branch |
|---|---|---|
| **P** | `C:\Users\AFRA\AppData\Local\Temp\claude\D--AfraKalaTest-app\96354d36-b585-464e-b8e8-29fbf0a1cbcd\scratchpad\wt-P` | `feature/wave5-partial-payment` |
| **A** | `C:\Users\AFRA\AppData\Local\Temp\claude\D--AfraKalaTest-app\96354d36-b585-464e-b8e8-29fbf0a1cbcd\scratchpad\wt-A` | `feature/wave5-allocation` |

Both seeded with the gitignored files that do not come from git:
`node_modules` (directory junction to the main tree), `deploy/lan/.env.lan`, and all four fresh
`e2e/auth/*.storage.json`. **Both reproduce the 70-error typecheck baseline** — confirmed, so
neither is in the silent-0 state.

⚠️ **Do not run `npm install` / `npm ci` in a worktree** — `node_modules` is a junction and you would
be mutating the main tree's copy for every agent at once.

**Never `git stash`. Never `git add -A`.** Stage and commit in ONE invocation with the pathspec
repeated: `git add -- $paths; git commit -q -m $msg -- $paths`.

---

## 4 · Landed signatures — filled in by the orchestrator as agents report

### From Agent P — ✅ LANDED, verified by the orchestrator

Branch `feature/wave5-partial-payment`, commit **`f441155c`**, pushed.
Migration **478** only (`20260906160000_478_partial_purchase_payment.sql`); 479/480 unused.
Applied **and** ledger row recorded — orchestrator confirmed `20260906160000` present.
Two files, both new; **nothing in `src/`**. Typecheck **70**.

**Path taken: REUSED `payment_vouchers.purchase_id` + `amount`. No new table.**
Why, in one line: the column already has an FK and a partial index and no unique constraint, and
the newer of its two writers (`create_payment`) already inserted it with no duplicate guard and
without stamping `paid_at` — it had already stopped treating the link as all-or-nothing.

**Signature — UNCHANGED, all 11 args, so no overload and no `DROP FUNCTION` was needed:**
```
pay_purchase_with_voucher(_purchase_id uuid, _source_bank_account_id uuid,
  _payment_date date DEFAULT NULL, _document_channel text DEFAULT 'cash',
  _amount numeric DEFAULT NULL, _tracking_number text DEFAULT NULL,
  _cheque_number text DEFAULT NULL, _cheque_due_date date DEFAULT NULL,
  _description text DEFAULT NULL, _payee_party_id uuid DEFAULT NULL,
  _payee_accounting_code text DEFAULT NULL)
```
Orchestrator-verified: exactly **one** overload; `anon=false`, `public=false`, `authenticated=true`.

**`vw_supplier_payables` — now 21 columns** (was 20); new appended column `confirmed_paid_amount`.
```sql
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(pv.amount) FILTER (
           WHERE pv.status = 'approved' AND pv.reversed_at IS NULL), 0) AS confirmed_paid_amount, ...
) vp ON true
-- outstanding:
WHEN vp.voucher_linked THEN GREATEST(COALESCE(p.total_amount,0) - vp.confirmed_paid_amount, 0)
-- is_paid re-keyed from (paid_at IS NOT NULL) to (outstanding_amount <= 0)
```
A **reversed** voucher correctly stops counting as paid. `has_table_privilege('anon', …)` = **false**
(orchestrator-verified).

**P-3 · EXCEPT both directions = 0 / 0**, taken under a simulated admin JWT (as `postgres` the view
returns 0 rows). The 317-row dump is **md5-identical** before and after (`2b92fc28…`). **No row moved.**

**All callers shown working:** `src/lib/treasury/queries.ts:231` (the only app caller),
`get_payables_summary` (`330938021699.94 / 37091243924.94 / 317` — identical to baseline),
`get_payables_list`, `get_payable_detail`, `compute_daily_capital`, and `og102`'s signature list.
Second writer `create_payment` conflicts with nothing.

**Reverse path actually executed** (`docs/verification/478-down.sql`): view returned to 20 columns,
`pg_get_viewdef`/`pg_get_functiondef` byte-identical to pre-478, snapshot md5 back to `2b92fc28…`.
Forward migration then re-applied as the final state.

#### 🔴 Two things Agent P surfaced that change what others must do

1. **The brief and migration 457 quote a `vw_supplier_payables` definition that is NO LONGER LIVE.**
   Migration **459** later added `due_date_unknown`, `due_date_unknown_reason`,
   `payment_term_inactive_flag`, and made `due_date` **NULL** when the purchase has no payment term.
   Live was **20** columns, 457's file shows 17. **Anyone reading 457 as current is wrong by three
   columns and by the `due_date` NULL rule.** P built on the live definition, per rule 4.
2. **A real, user-visible behaviour change on exactly one purchase.** The default amount stays
   `COALESCE(_amount, cash_price, total_amount)` because 457 explicitly considered and declined to
   change it. For `ba1c75a0-d406-4389-ac4f-e1501dbbe915` (`cash_price` 10bn vs `total_amount` 12bn),
   the purchase-payments page — which sends no amount — now pays 10bn and leaves **2bn outstanding
   with `paid_at` NULL**, where before it marked the purchase fully paid.
   Orchestrator-verified: this is **1 of 317** purchases, and all 317 are test data, so live impact
   is nil — but the semantics changed and the owner should see it.
   Also: `is_paid` re-keyed to `outstanding_amount <= 0` is a no-op on today's data, but a future
   purchase with `total_amount = 0` would newly report as paid.

#### Handed forward by P — recorded, deliberately NOT done
- `vw_customer_receivables` has the **same reversal defect** P just fixed on the vouchers side: its
  `paid_quote` CTE filters on receipt status only, so a **reversed** receipt still counts as paid.
- `reverse_document` does not clear `purchases.paid_at`, and `/accounting/purchase-payments` queries
  `purchases` directly (`.is("paid_at", null)`), so a reversed purchase stays in the "paid" tab.
- `create_payment` has no over-payment cap and never stamps `paid_at` — asymmetric with the voucher RPC.
- **The UI cannot express a partial amount yet** (`_app.accounting.purchase-payments.tsx:170-184`
  sends no `amount`). The RPC already accepts one. → relevant to Agent U.
- `get_payables_list` / `get_payable_detail` do **not** return `confirmed_paid_amount`; adding it
  changes `RETURNS TABLE` and needs `DROP FUNCTION` + frontend types.

**NOT VERIFIED by P:** no Playwright suite was run at all; no browser check. The orchestrator runs
the scoped suites in Stage 3.

### From Agent A — ✅ LANDED, verified by the orchestrator

Branch `feature/wave5-allocation`, commits **`0c392875`** (migrations) + **`c25aa9da`** (down-scripts),
pushed. Migrations **481** (`20260906170000_481_allocation_rows.sql`) and **482**
(`20260906171500_482_allocation_rpcs.sql`); 483/484 unused. Both applied **and** recorded — ledger
now **652** = 649 base + 478 + 481 + 482 (orchestrator-verified). Four files, all new; **nothing in
`src/`**. Typecheck **70**. **Zero leftover rows** — `allocation_rows` = 0, `audit_logs` where
`entity_type='allocation'` = 0 (orchestrator-verified).

#### Table `public.allocation_rows` — exact column list

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `allocation_date` | date | not null | `CURRENT_DATE` |
| `payer_customer_id` | uuid | not null | — |
| `payer_person_id` | uuid | not null | — **set by trigger; never send it** |
| `payer_quote_id` | uuid | null | — |
| `beneficiary_person_id` | uuid | not null | — |
| `beneficiary_purchase_id` | uuid | null | — |
| `beneficiary_account_no` | text | null | — |
| `amount` | numeric | not null | — |
| `priority` | text | not null | `'normal'` |
| `status` | text | **null** | — **NULL = planned, not yet followed up** |
| `promised_at` | date | null | — |
| `promised_note` | text | null | — |
| `created_by` | uuid | null | — |
| `created_at` | timestamptz | not null | `now()` |
| `updated_at` | timestamptz | not null | `now()` |

Other CHECKs: `amount > 0 AND amount = trunc(amount)`; priority in `low/normal/high/urgent`;
`payer_person_id <> beneficiary_person_id`; `promise_needs_date` (the Saturday status requires
`promised_at`); `text_shape` (no empty-string account no / note).

**Judgement call A flagged rather than buried:** `status` is NULLABLE with no default. D-20 closes the
list at five, and a freshly planned row has not been followed up — inventing a sixth state would have
broken the closed list. **NULL means "not followed up yet".** U must render that state.

#### The five status strings — byte-verified by the orchestrator against the source

`allocation_rows_status_chk CHECK (status IS NULL OR status = ANY (ARRAY[…]))`
All five present byte-exact in the live constraint, **no mojibake, no `?` substitution**, and all
four ZWNJ (`e2 80 8c`) intact. (A's report said "three ZWNJs"; there are **four** — «نمی‌خواد» has one
too. Immaterial: every string matches.)

```
واریز شد · خبر می‌ده · جواب نمی‌ده · شنبه واریز می‌کنه · نمی‌خواد
```

#### RPC signatures — the contract for Agent U

```sql
-- WRITE (admin, accountant)
create_allocation_row(p_payer_customer_id uuid, p_beneficiary_person_id uuid, p_amount numeric,
  p_allocation_date date DEFAULT CURRENT_DATE, p_priority text DEFAULT 'normal',
  p_beneficiary_account_no text DEFAULT NULL, p_payer_quote_id uuid DEFAULT NULL,
  p_beneficiary_purchase_id uuid DEFAULT NULL) RETURNS uuid

update_allocation_row(p_allocation_id uuid, p_amount numeric DEFAULT NULL,
  p_allocation_date date DEFAULT NULL, p_priority text DEFAULT NULL,
  p_beneficiary_account_no text DEFAULT NULL, p_payer_quote_id uuid DEFAULT NULL,
  p_beneficiary_purchase_id uuid DEFAULT NULL, p_clear text[] DEFAULT NULL) RETURNS jsonb
  -- NULL = unchanged. Name a field in p_clear to null it. p_clear accepts ONLY
  -- beneficiary_account_no, payer_quote_id, beneficiary_purchase_id. The two PARTIES are not editable.

set_allocation_row_status(p_allocation_id uuid, p_status text,
  p_promised_at date DEFAULT NULL, p_promised_note text DEFAULT NULL) RETURNS jsonb
  -- {id, before:{status,promised_at,promised_note}, after:{…}}

-- READ (admin, manager, accountant) · STABLE
list_allocation_rows(p_allocation_date date DEFAULT CURRENT_DATE,
  p_limit integer DEFAULT 500, p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid, allocation_date date, payer_customer_id uuid, payer_person_id uuid,
  payer_name text, payer_quote_id uuid, beneficiary_person_id uuid, beneficiary_name text,
  beneficiary_purchase_id uuid, beneficiary_account_no text, amount numeric, priority text,
  status text, promised_at date, promised_note text, is_unfunded boolean,
  created_by uuid, created_at timestamptz, updated_at timestamptz, total_count bigint)
```

Names come from `persons.display_name`. Ordering: priority urgent→low, then amount DESC, then
`created_at`. `p_limit` clamped to 1…2000.

#### The unfunded rule, as implemented

```sql
COALESCE(a.status = 'نمی‌خواد', false)
OR (a.promised_at IS NOT NULL AND a.promised_at < CURRENT_DATE
    AND a.status IS DISTINCT FROM 'واریز شد')
```
Computed on read, so a promise coming due overnight needs no job. **Flag only — D-21.**

#### Registry, RLS, grants — all orchestrator-verified

`person_merge` registry keys added (`'generic'`): `allocation_rows.payer_person_id`,
`allocation_rows.beneficiary_person_id`. **Gate 328 never fired** — `CREATE OR REPLACE person_merge`
first, both FKs inline in `CREATE TABLE`. `person_fk_registry_report()` went 29→**31 rows, 31 `ok`,
zero non-ok** (orchestrator re-confirmed).

RLS **enabled**, 4 policies, all `TO authenticated`: SELECT `admin|accountant|manager`;
INSERT/UPDATE `admin|accountant`; DELETE `admin` only.
A used `has_any_role(uuid, text[])` rather than `::app_role[]` deliberately — `user_roles.role` is
TEXT and the `app_role[]` overload just casts back; `text[]` cannot raise on a non-enum role string.

```
has_table_privilege('anon','allocation_rows', …)  SELECT=f INSERT=f UPDATE=f DELETE=f
has_function_privilege('anon', …)                 all four RPCs = f   (public=f, authenticated=t)
```
A also proved it end-to-end through Kong as a real anonymous caller: `401 42501 permission denied`
on the table and on both RPCs.

#### 🟢 The types.ts handoff A flagged is NOT a blocker — resolved by the orchestrator

A warned that `src/integrations/supabase/types.ts` was not regenerated and "will bite U immediately".
**It will not.** `pay_purchase_with_voucher` is *also* absent from `types.ts` and is called
successfully today from `src/lib/treasury/queries.ts:216-245`. The established pattern:

```ts
type RpcFn = (fn: string, args: Record<string, unknown>)
  => Promise<{ data: unknown; error: { message: string } | null }>;

// Bound on purpose. A bare `supabase.rpc` is called with `this` undefined and PostgREST's rpc
// dereferences `this.rest` immediately — the page threw "Cannot read properties of undefined
// (reading 'rest')" before issuing any request at all.
const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;
```

**U follows this pattern. Do NOT regenerate `types.ts`** — it is a 13,201-line shared file and
regenerating it mid-wave would collide with every other branch. 🔴 Heed the binding trap: either
`supabase.rpc.bind(supabase)` as above, or the inline `(supabase.rpc as ...)(...)` form. A bare
captured `supabase.rpc` reference throws before it issues a request.

#### Also from A — recorded
- **A new interaction A introduced and tested rather than reasoned about:**
  `allocation_rows_parties_distinct_chk` means a `person_merge` collapsing *both sides of the same
  row* onto one person aborts with a named per-pair constraint error — **not** the system-wide merge
  halt rule 9 warns about (Guard 7 already refuses the common case). The alternative would be a
  surviving plan for a person to pay themself. Proven live, rolled back.
- Reversibility proven: `482-down.sql` then `481-down.sql` inside `BEGIN…ROLLBACK` → registry 31→29,
  table gone, 0 non-`ok`, 0 allocation functions.
- **No Playwright spec was written by A** — that surface is U-4's.
- `og81-migration-ledger-matches-disk.spec.ts` **will fail from the main tree** until these branches
  merge: the ledger holds 652 versions while `D:\AfraKalaTest\app` has 649 files. Inherent to the
  shared-DB process, not a defect. It resolves at Stage 3 merge.

### For Agent U — measured by the orchestrator 2026-09-06, do not re-derive

**Live `role_permissions` for module `accounting`** (the gate set):

| role_name | can_view |
|---|---|
| admin | **t** |
| manager | **t** |
| accountant | **t** |
| sales · viewer · purchase_specialist · site | f |

So the gate set is exactly **`["admin","manager","accountant"]`** — which also matches
`compute_daily_capital`'s own role guard. `sales` and `viewer` are excluded by the live table.

🟢 **No new `role_permissions` row is needed, and migration 485 is probably unnecessary.**
The registry keys off `module`, and the `accounting` module already carries the right rows.
Reusing it is the correct move — a new module row when an existing one fits is the same failure
class the owner called out in Q-3. **Verify before concluding**, then say so in the report.

**The exact pattern to copy — both existing columns use it verbatim**
(`src/routes/_app.accounting.receivables.tsx:46-54`, `_app.accounting.payables.tsx:50-55`):

```ts
export const Route = createFileRoute("/_app/accounting/<route>")({
  // mirrors the requireAnyRole call below. The shared guard cannot decide during SSR or
  // while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: <Page>,
});
```

🔴 `beforeLoad` alone runs only on the server and never in the browser — `staticData.gate` is what
`RouteRoleGate` enforces client-side. **Both are required.** A route with only `beforeLoad` is the
security-wave-2 defect.

**Registry entry** — `src/lib/navigation/registry.ts` (receivables is at :451-457):
```ts
{ to: "/accounting/<route>", label: "<Persian>", icon: Wallet, module: "accounting", group: "finance" },
```
⚠️ Note `group: "finance"`, **not** `"accounting"` — the brief says `accounting`, but every live
neighbour uses `finance`. Match the live code, and flag the deviation in your report.

**FinanceHub item** — `src/components/finance/FinanceHub.tsx:194-203`, group «مانده‌ها و گزارش»,
which already holds both existing columns:
```ts
{ to: "/accounting/<route>", label: "<Persian>", target: { kind: "registry", route: "/accounting/<route>" } }
```

### 🟢 The reusable surface — U-1 says REUSE, and this is what exists

**A second receivables or payables table is the single failure this programme exists to prevent.**
Everything below already works and is already role-gated. Call it; do not reimplement it.

Live RPC signatures, read from `pg_proc` 2026-09-06:

```
compute_daily_capital(p_capital_date date DEFAULT CURRENT_DATE)
  -- 23 cols incl. due_today_receivables / due_today_payables / overdue_*
  -- STABLE, writes nothing, guard = admin|manager|accountant

get_receivables_list(p_from_date date, p_to_date date, p_customer_id uuid,
                     p_due_filter text DEFAULT 'all', p_search text,
                     p_limit int DEFAULT 50, p_offset int DEFAULT 0)
get_receivables_summary(p_from_date date, p_to_date date, p_customer_id uuid)

get_payables_list(p_from_date date, p_to_date date, p_supplier_id uuid,
                  p_due_filter text DEFAULT 'all', p_search text,
                  p_limit int DEFAULT 50, p_offset int DEFAULT 0,
                  p_include_paid boolean DEFAULT false)
get_payables_summary(p_from_date date, p_to_date date, p_supplier_id uuid)

can_issue_customer_invoice(p_customer_id uuid)
  -- returns can_issue, overdue_amount, overdue_count, oldest_due_date,
  --         reason (ready-to-display Persian text) — this is U-2's overdue signal
```

⚠️ Agent P owns `get_payables_*` and `vw_supplier_payables` and may change them. **Re-read the
payables signatures from `pg_proc` before you build against them** — §4 "From Agent P" records
whatever actually landed.

**Shared components — both existing pages import these two, and so must the workbench**
(`src/components/accounting/AgingBuckets.tsx`):
```ts
import { AgingBucketBadge, AgingBucketCards } from "@/components/accounting/AgingBuckets";

AgingBucketBadge({ bucket: string | null | undefined })
AgingBucketCards({
  summary: Record<string, unknown> | null | undefined,
  isLoading?: boolean,
  fmtMoney: (n: number | null | undefined) => string,
  activeBucket?: string,
  onSelect?: (bucket: AgingBucket) => void,
})
```

**Data reality for the demonstration — not a bug, do not "fix" it:**
- `daily_capital_inputs` has only **2 rows**: `2026-07-20` and `2026-07-22`. For every other date
  the headline card is deliberately silent («پیشنهاد سامانه محاسبه نشد»,
  `_app.accounting.dynamic-capital.tsx:707-716`). **Demonstrate on `2026-07-22`, or show the honest
  empty state for today.**
- Only **3 customers** have an open balance (8 receivable rows) and **6 suppliers** have unpaid
  purchases — against the owner's ~50 and ~20. The 317 purchases are **test data** (owner-confirmed).
  Migrating real customers and suppliers is the accountant's work and is **out of scope for every wave**.

---

## 5 · Progress ledger

| date | agent | what | commit |
|---|---|---|---|
| 2026-09-06 | orchestrator | Stage 0: ground truth verified, 4 sessions regenerated (+`test.sales2` password repaired), baseline 436/16/3 taken, worktrees seeded | — |
| 2026-09-06 | Agent P | migration 478 — partial purchase payment by REUSING `payment_vouchers.purchase_id`; signature unchanged; `EXCEPT` 0/0 | `f441155c` |
| 2026-09-06 | Agent A | migrations 481/482 — `allocation_rows` + 4 RPCs; gate 328 never fired; registry 29→31 all ok | `0c392875`, `c25aa9da` |
| 2026-09-06 | orchestrator | verified P and A independently; PRs #423, #424 merged to `staging` → `208b0068` | — |
| 2026-09-06 | Agent U | the workbench page, route, hub entry, registry row, spec 217; **no migration needed** | `aad708c7`, `316fe850`, `ef6b71e8` |
| 2026-09-06 | orchestrator | verified U; PR #425 merged → `staging` `1c1328c6`; deployed, `APP_GIT_SHA` = `HEAD` | — |
| 2026-09-06 | orchestrator | final scoped suites **445 P / 15 F / 3 S** (baseline 436/16/3); demonstration run; report written | — |

| 2026-09-06 | Agent V | independent verification: **19 CONFIRMED, 2 REFUTED** (P-2c, A-3) — both reproduced by the orchestrator | — |
| 2026-09-06 | orchestrator | verdict revised **COMPLETE → PARTIAL**; halted rather than fixing, per the brief's halt condition | — |

## 6 · Final state

- `staging` @ **`1c1328c6`**, `APP_GIT_SHA` = `1c1328c6` ✅
- Migrations disk = ledger = **652** ✅ · typecheck **70** ✅ · `person_fk_registry_report()` 31/31 ok ✅
- `rule12` offender list unchanged at exactly one file ✅
- Migrations used: **478, 481, 482**. Allocated-but-unused: 479, 480, 483, 484, **485**.
- Completion report: `docs/research/wave5-build-20260906.md`
- **Residue awaiting the owner's decision:** 1 `allocation_rows` row
  (`b8e9286c-26cb-4211-a434-39630466a4e5`, account no `IR-UI-DRIVE`) + 4 `audit_logs` rows, left by
  Agent U proving the UI write path. It declined to `DELETE` rather than break safety rule 3.
