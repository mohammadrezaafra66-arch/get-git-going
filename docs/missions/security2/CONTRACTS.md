# Security wave 2 — CONTRACTS

Orchestrator-owned. Specialists READ this and append only to their own ledger row.
**Never write to root `PROGRESS.md`.**

Opened 2026-09-06 · base `origin/staging` @ `eb6b6f6455fad5f47aa2c93a1f62eb03f99a1dd7`

---

## 0 · Verified starting state (Q-0 — all three pass, no halt)

| Check | Measured | Command |
|---|---|---|
| `origin/staging` == main tree | `eb6b6f6455fad5f47aa2c93a1f62eb03f99a1dd7` both | `git rev-parse origin/staging` / `HEAD` |
| `APP_GIT_SHA` == HEAD | `APP_GIT_SHA=eb6b6f64`, `HEAD` short `eb6b6f64` | `docker inspect afrakala-lan-web --format ...` |
| Build time | `APP_BUILD_TIME=2026-09-06T00:26:08` | same |
| Migrations 460–466 recorded | all 7 present: `20260906090000,091500,093000,094500,100000,101500,103000` | `select version from supabase_migrations.schema_migrations where version >= '20260906090000'` |
| Ledger == disk | `disk=641 ledger=641`, no untracked migration files | `ls supabase/migrations/*.sql \| wc -l` |
| `/bot-api-keys` gate on `staging` | `src/routes/_app.bot-api-keys.tsx:36` carries `staticData: { gate: { kind: "anyRole", allowed: ["admin","manager","site"] } }`, merged in `33418e6f` | `grep -n staticData` |
| App reachable | `login 200 0.006972s` | `curl http://192.168.170.8:3100/login` |

---

## 1 · Owner decisions taken this wave [U]

Asked and answered at Stage 0. These override any default in the brief.

1. **Group B is risk-tiered and fully enumerated.** Agent A classifies **all** routes in the
   exposed class by *what the page exposes*. Agent R gates every route in the sensitive tiers this
   wave. Every route not gated is handed forward as a **named, sized backlog row** carrying its
   one-line exposure description and its live role set — never as silence.
2. **The 24 routes with no `beforeLoad` at all are the highest priority**, ahead of B-1 and B-2.
   If any renders an admin control or non-self data to a cold `viewer`, that is reported at the top
   as the A-2 halt-condition finding.
3. **Gates read the live `role_permissions` table**, including `site` where live grants it.
   The static-table divergence is **reported as a separate finding and NOT repaired this wave.**
   Purely static pages are gate-exempt and reported as accepted **with a per-route reason**.

### 1b · Two additions received mid-Stage-0 [U]

4. **"Harmless" is a verdict with evidence, not a default.** For each of the 24 unguarded routes
   judged harmless (static page, self-only view), Agent A gives the **route-file line number and
   quoted line that proves it**. A route with no proof line is not harmless; it is unclassified.
5. **Every route in the `requirePermission` class carries a one-line "what this page exposes",
   read from the route file body — never inferred from the filename.**
   `_app.admin.receipt-fields` is not an answer; "edits which fields appear on the receipt form" is.
   That line plus the live role set travels with every handed-forward backlog row so the next wave
   starts without re-reading.

---

## 2 · Orchestrator's own Stage-0 census — starting point, NOT authority

Agent A re-derives all of this. Reported here so a contradiction is visible rather than silent.

```
ls src/routes/*.tsx | wc -l                                    -> 186
grep -rl 'staticData'        src/routes/*.tsx | wc -l          ->  23
grep -rl 'requirePermission' src/routes/*.tsx | wc -l          ->  74
grep -rl 'requireAnyRole'    src/routes/*.tsx | wc -l          ->  62
grep -rl 'beforeLoad'        src/routes/*.tsx | wc -l          -> 161
routes with neither beforeLoad nor staticData                  ->  25 (incl. __root.tsx)

comm: requireAnyRole    WITHOUT staticData                     ->  43
comm: requirePermission WITHOUT staticData                     ->  72
comm: requirePermission WITH    staticData                     ->   2
```

**Known contradictions to resolve, do not inherit:**
- `e2e/security/s5-guarded-admin-routes-carry-a-client-gate.spec.ts:39` says
  *"149 route files call one of the three guards; 19 carry `staticData`"* (wave 4).
- Agent V (wave 4) found **23 of 148**.
- Orchestrator measures **23 of 186 files / 161 with `beforeLoad`**.
  Three different denominators. Agent A produces the definitive one **and says what each
  denominator counts** (all `.tsx` in `src/routes` vs. files calling a guard vs. addressable routes).

**The 24 unguarded app routes (excluding `__root.tsx`), verbatim:**
```
_app.admin.marketing-channels.tsx        _app.marketing.suggestions.tsx
_app.admin.marketing-task-templates.tsx  _app.my-penalties.tsx
_app.admin.receipt-fields.tsx            _app.my-rejected-quotes.tsx
_app.admin.workflow-stages.tsx           _app.notifications.tsx
_app.gamification.leaderboard.tsx        _app.operations.daily-mood.admin.tsx
_app.gamification.tsx                    _app.operations.daily-mood.tsx
_app.market-matches.tsx                  _app.operations.tasks.tsx
_app.marketing.my-tasks.tsx              _app.popup-center.tsx
_app.marketing.suggestions-history.tsx   _app.pricing.attention.tsx
_app.pricing.my-workbench.tsx            _app.sales.quotes.$quoteId.tsx
_app.sales.quotes.index.tsx              public.sale-lists.$listId.tsx
reset-password.tsx                       unauthorized.tsx
```

---

## 3 · Migration numbers and timestamps — allocated centrally, do not self-assign

Highest on disk **and** in ledger: `466 @ 20260906103000`. Disk 641 = ledger 641.

| Agent | Numbers | Timestamps (use in order, skip unused) |
|---|---|---|
| **F** (Group C) | `467`–`474` | `20260906110000`, `111500`, `113000`, `114500`, `120000`, `121500`, `123000`, `124500` |
| **D** (Group D) | `475` | `20260906130000` |
| **R** (Group B) | none — no migrations in Group B | — |

Filename form: `2026MMDD<HHMMSS>_<NNN>_<snake_name>.sql`. **ASCII-only migrations preferred.**

**Applying is two steps, never one** (CLAUDE.md rule 2b — `psql` does NOT write the ledger):
```bash
docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
  -v ON_ERROR_STOP=1 --single-transaction -f - < <migration>.sql
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -c \
  "INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('<timestamp>')
   ON CONFLICT (version) DO NOTHING;"
```
Then `docker restart afrakala-lan-rest`. Then **push the branch immediately** — never leave a
migration applied but uncommitted (rule 6).

---

## 4 · The canonical gate shape — migration 436, quoted

Source: `supabase/migrations/20260905100000_436_close_anon_role_grant_escalation.sql`

**Grants (lines 91–115).** Both `anon` AND `PUBLIC`, always — the `=X/supabase_admin` entry in
`proacl` is a PUBLIC grant and survives `REVOKE ... FROM anon` untouched:
```sql
REVOKE EXECUTE ON FUNCTION public.<fn>(<full signature>) FROM anon;
REVOKE EXECUTE ON FUNCTION public.<fn>(<full signature>) FROM PUBLIC;
-- add `FROM authenticated` only where no authenticated caller is legitimate
```

**Body guard (461, line 177), first statement, before any read:**
```sql
IF NOT public.has_any_role(_actor, ARRAY['admin','manager','accountant','sales']::text[]) THEN
  RAISE EXCEPTION 'forbidden: ...' USING ERRCODE = '42501';
END IF;
```

**Four rules that are easy to get wrong — all quoted from 436's own header (lines 62, 71–79, 82–84)
and 461 (line 154):**
1. `user_roles.role` is **TEXT**. Use the `has_any_role(uuid, text[])` overload with an explicit
   `::text[]` cast — *"The bare-literal form is ambiguous against the app_role overload."*
2. `has_any_role(NULL, ...)` returns **false** (verified) — so the same expression refuses an
   unauthenticated caller. No separate anon branch is needed.
3. **`CREATE OR REPLACE` silently restores default grants**, *"which is why the REVOKEs come AFTER
   the CREATE OR REPLACE."* Ordering is load-bearing.
4. **Do not add a body guard where an internal trigger path legitimately runs as an ordinary user.**
   436 deliberately left `apply_stock_movement` un-guarded in the body: *"Those triggers fire when
   an ordinary `sales` user confirms a quote, so a role check in the body would BREAK the sale, not
   secure it."* Nested calls from a DEFINER function do not consult the caller's EXECUTE grant, so
   revoking the direct grant closes the API surface while leaving internal paths intact.

---

## 5 · The route gate shape — `/bot-api-keys`, quoted

Source: `src/routes/_app.bot-api-keys.tsx:36`, merged in `33418e6f`.
```ts
staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "site"] } },
beforeLoad: async () => {
  await requirePermission("bot-api-keys", "view");
},
```
`allowed` mirrors **the live `role_permissions` set**, `site` included, **not** the static table
(which says only `["admin","manager"]`). `RouteRoleGate` has no `permission` kind on purpose.

**Cold-session proof pattern** — `e2e/security/og-bot-api-keys-cold-gate.spec.ts:35-37`:
```ts
/** A context with no stored session at all. Never pass storageState here — that is the bug's blind spot. */
const context = await browser.newContext({ storageState: undefined, locale: "fa-IR" });
```
Password is the literal `"AfraTest!1404"` (line 32) — **no `E2E_*_PASSWORD` env dependency, so the
session-generator hazard does not apply to this pattern. Use it. Do NOT regenerate sessions.**

---

## 6 · Existing specs — extend, never duplicate (CLAUDE.md rule 14)

| Spec | Owner | Note |
|---|---|---|
| `e2e/security/s5-guarded-admin-routes-carry-a-client-gate.spec.ts` (124 lines) | **R** | **This is B-3's home.** Its header states rollout was *"an owner decision that has not been taken"* — **decision 1 above takes it.** Update that header; do not create a sibling spec. |
| `e2e/security/og-bot-api-keys-cold-gate.spec.ts` | **R** | wave-4 proof; the cold-session pattern to copy |
| `e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts` | **F** | C-4 extends this to `authenticated` |
| `e2e/security/og81-migration-ledger-matches-disk.spec.ts` | — | fails if ledger and disk diverge, in either direction |

Playwright config: `fullyParallel: false`, `workers: 1` — already sequential. Default
`storageState: e2e/auth/admin.storage.json`. **There is no `viewer.storage.json`; do not make one.**

---

## 7 · File ownership — no overlap

| Agent | Owns | Must not touch |
|---|---|---|
| **A** | nothing — read-only investigation, writes only its findings file | any source file |
| **R** | `src/routes/**` guard declarations · `src/components/layout/RouteRoleGate.tsx` · `src/lib/rbac/route-guards.ts` · `e2e/security/s5-*.spec.ts` | **the static permission table** (Q-2) · migrations |
| **F** | gate migrations `467`–`474` · `e2e/security/og61-*.spec.ts` | `src/routes/**` · the audit trigger |
| **D** | migration `475` (audit trigger on `ai_usage_routes`, `ai_providers`) and nothing else | everything else |
| **V** | nothing — re-derives independently | all |

---

## 8 · Stage-0 baselines — measured by the orchestrator in the MAIN tree. Do not exceed.

### Typecheck — **70 errors, exactly the six documented files**
```
npm run typecheck 2>&1 | grep -E "error TS" | wc -l   -> 70
  18 src/routes/_app.products.index.tsx
  15 src/routes/_app.admin.sales-reminders.tsx
  13 src/lib/invoices/functions.ts
  13 src/lib/accounting/functions.ts
   6 src/lib/audit/index.ts
   5 src/routes/_app.admin.automation.tsx
```
⚠️ **A worktree without `node_modules` reports 0 silently.** Before trusting any count, confirm
`node_modules` exists in your worktree. The main tree has it (423 entries). If your count is 0,
your count is wrong.

⚠️ **Two of the six are route files.** `_app.products.index.tsx` (18) and
`_app.admin.sales-reminders.tsx` (15) are Agent R's territory. Adding a `staticData` line to
either must not raise its count. Agent R reports per-file counts, not just the total.

### Playwright — `e2e/security/`, **219 passed / 1 failed of 220 (1.6m)**
```
npx playwright test e2e/security/ --reporter=line
```
The **one pre-existing failure**, present before any work in this wave:
```
e2e/security/rule12-no-gate-creates-posted-documents.spec.ts:109
  › no spec calls a document-creating RPC outside a rolled-back transaction
  Error: these specs create a financial document with no rolled-back transaction:
         e2e\unit\ledger-wizard-party-pick.spec.ts
```
The offender is `e2e/unit/ledger-wizard-party-pick.spec.ts` — **outside this wave's ownership,
pre-existing, and not to be fixed here.** It is the baseline, not a regression.

🔴 **Hard constraint on every new spec R and F write:** `rule12` scans spec source for
document-creating RPC calls made outside a rolled-back transaction. A new spec that calls one
**adds itself to that offender list and makes the baseline worse.** Keep any document-creating
call inside `BEGIN … ROLLBACK`, or do not make one. Re-run `rule12` after adding a spec.

Config is already sequential: `fullyParallel: false`, `workers: 1`.

---

## 8b · Worktrees — created and seeded by the orchestrator. Use yours; touch no other.

Root: `C:/Users/AFRA/AppData/Local/Temp/claude/security2/`

| Agent | Worktree | Branch |
|---|---|---|
| A | `wt-s2A` | `feature/security2-agentA` |
| R | `wt-s2R` | `feature/security2-routes` |
| F | `wt-s2F` | `feature/security2-functions` |
| D | `wt-s2D` | `feature/security2-audit` |

All four are at `eb6b6f64` off `origin/staging`.

**Already seeded for R, F, D — do not redo:**
- `node_modules` is a **directory junction** to `D:\AfraKalaTest\app\node_modules` (517 entries).
  Verified: `npm run typecheck` in `wt-s2R` reports **70**, not the silent 0.
- `e2e/auth/*.storage.json` copied in (4 files: admin, accountant, salesperson-a, salesperson-b).
  **There is no `viewer.storage.json` and none is needed** — the cold-session pattern in §5 logs in
  fresh with `storageState: undefined`.
- `git status --porcelain` in `wt-s2R` is **empty** — both stay correctly ignored. If yours is not
  empty before you start, stop and report it.

**Other worktrees exist on this machine (wave-1 branches, a hotfix, two unregistered wave-4
directories `agentS`/`agentW`). Do not enter, read, or clean any of them.**

---

## 10 · 🔴 STAGE 1 RESULT — HALT CONDITION FIRED. The wave is reordered.

Agent A delivered `docs/research/security2-investigation-20260906.md` (930 lines, commit `c4c5fdd9`
on `feature/security2-agentA`). **Read it — it is the authority for every role set in Group B.**

The orchestrator re-derived **five** of its claims independently. All five reproduce exactly.

| Claim | Orchestrator's independent re-derivation | Verdict |
|---|---|---|
| A-1: 71 anon-reachable DEFINER writers, 70 explicit + 1 PUBLIC-only | `explicit_anon=70 · public_default_only=1 · total=71 · definer_writers=152` | ✅ exact |
| A-2: 148 guarded / 23 gated / 125 ungated | call-site count (not substring): `requirePermission 73 · requireAnyRole 60 · requireAdmin 15 = 148 union`; `staticData 23`; ungated `125` | ✅ exact |
| Halt: `qual = true` PERMISSIVE SELECT on the three scoring tables | `dyn_scores_read_authenticated \| PERMISSIVE \| SELECT \| true` (+ same on the other two); only other policy `viewer_restricted \| RESTRICTIVE` | ✅ exact |
| `is_viewer_only` refuses only sole-viewers | body: `EXISTS(role='viewer') AND NOT EXISTS(role<>'viewer')` — so `sales` passes | ✅ exact |
| Bot writers do no key authentication | `bot_authenticate_key` is the only one checking `is_active`/`expires_at`/`hash`, and it is **not** granted to `anon`; every `is_active` in the four writers is `dynamic_table_rows.is_active`, the **data row's** flag | ✅ exact |

### H-1 — credit scoring data is readable by `sales`, at the database

150 rows across 20 entities. `sales`, `accountant`, `purchase_specialist`, `site` all pass;
only a sole-`viewer` is refused. Gating routes hides the page but **not** the PostgREST path.

**The intended audience is not a guess.** All four consumers of these tables, measured:

| Route | Guard | Roles |
|---|---|---|
| `_app.sales.credit-rules` | `requireAnyRole` | admin, accountant |
| `_app.sales_.customers_.$customerId.credit` | `requireAnyRole` | admin, manager, accountant |
| `_app.accounting.salesperson-scoring` | gate + `requireAnyRole` | admin, accountant |
| `_app.users.$userId` | `requireAdmin` | admin |

**Union = `admin, manager, accountant`.** No route intends `sales` to see it; no `sales` feature
reads these tables (`grep` over `src/` returns only `useDynamicScoring.ts` and
`DynamicScoringSection.tsx`, both mounted solely by the four routes above). There is **no
`credit`/`scoring`/`capital` module in `role_permissions`** — these routes use hardcoded role
lists, so the union above is the authority.

### H-2 — four `bot_*` writers accept a UUID as the whole credential

`bot_create_table_row`, `bot_update_table_row`, `bot_upsert_table_row`, `bot_query_table_rows`
are granted to `anon` and authenticate by `p_key_id uuid` alone — **no hash check, no
`is_active`, no `expires_at`, no `auth.uid()`.** A revoked or expired key still works.

**Revoking `anon` + `PUBLIC` is safe — verified, not assumed.** The real bot path is:
```
src/routes/api.public.bot.dynamic-tables.$tableId.rows.ts:40
  const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
src/routes/api.public.bot.dynamic-tables.$tableId.rows.ts:282
  const { data, error } = await supabaseAdmin.rpc("bot_create_table_row", { ... });
```
Raw Bearer key → `authenticateBot` (which does check hash/active/expiry) → RPC via the
**service_role** client. `service_role=X` is granted separately and is untouched by revoking
`anon`. **The `anon` grant is pure bypass surface with no legitimate caller.**

### Reordering — 10 rows becomes 12. Reconcile against **12**.

| New # | Row | Owner | Priority |
|---|---|---|---|
| **H-1** | Tighten SELECT RLS on the three scoring tables to `admin, manager, accountant` | **H** | **first** |
| **H-2** | Revoke `anon`+`PUBLIC` on the four `bot_*` writers; add `is_active`/`expires_at` to each body | **H** | **first** |
| B-1/B-2/B-3 | 36 tier-1 routes; layout routes first | R | second |
| C-1…C-4 | functions | F | second |
| D-1 | audit trigger | D | second |

**A-1 resolves the brief's open question: Group C is urgent, not housekeeping** — 71 is genuine,
0 artifact. But the operative subset is small: 63 of the 71 already role-check internally, so the
real work is H-2's four plus what C-1/C-2 isolate.

### 🔶 The trap that will bite Agent R — read before writing any gate

`role_permissions` (live) grants **`pricing`** view to
`admin, manager, accountant, purchase_specialist, sales` — **five roles**.
`src/lib/rbac/roles.ts` says three. **~15 routes.** A gate copied from the static table
**denies every real salesperson.** Twelve further module divergences are tabled in Agent A's
§"Static-table divergences". **Per CONTRACTS decision 3 the static table is NOT repaired here —
gates read live, and the divergence is handed forward.**

### Corrections Agent A made to this contract — adopt them

- The orchestrator's **24** unguarded routes is really **22**: `_app.sales.quotes.index` and
  `$quoteId` inherit `requirePermission("sales","view")` from `_app.sales.quotes.tsx`.
- **`RouteRoleGate` walks the whole `useMatches()` chain, so a gate on a layout route protects its
  children.** Gating `_app.sales.tsx` and `_app.sales.quotes.tsx` — **two lines** — closes eight
  leaves. Highest-leverage change in Group B; do it first.
- The **wave-4 "roles-loading race" is already fixed** on `staging` (`settleRoles()` awaits).
  Only the SSR fail-open remains. **Both `RouteRoleGate.tsx` and the s5 spec headers still
  describe the fixed bug as live** — Agent R corrects both, along with s5's stale "149 / 19".
- The five "unguarded admin pages" all carry fail-closed **in-component** role checks — that
  specific trigger did **not** fire. They still need real gates (the check runs after the query).
- **21 `.ts` files in `src/routes/` — including the four `api.public.bot.*` routes — are outside
  every census anyone has made and have never been audited.** Not in any row this wave. Handed
  forward explicitly in the completion report.

---

## 9 · Progress ledger — append your own row only

| when | agent | row | state | evidence |
|---|---|---|---|---|
| 2026-09-06 | orchestrator | Stage 0 | done | Q-0 3/3 pass · census §2 · numbers §3 · typecheck 70 · security suite 219/1 |
| 2026-09-06 | orchestrator | Stage 1 dispatch | done | Agent A launched on `feature/security2-agentA`; A-1 and A-2 are gates |
