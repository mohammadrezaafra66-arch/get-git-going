# Security wave 2 — completion report

**2026-09-06** · test machine `192.168.170.8` · branch `staging` @ **`b3620ae0`** · database `afrakala`
**Production `192.168.170.10` was never contacted, resolved or pinged.**

Fleet: one investigator (A), four builders (H, R, F, D), one independent verifier (V), one orchestrator.
The orchestrator re-derived at least one measurement from every row before accepting it, and V
re-derived all of them **without access to any builder's report**.

---

## Verdict

The wave closed the **sensitive tier** of the route-guard class and every function-level hole it
found, and it closed two holes nobody had looked for — one of which hands the plaintext AI-provider
API key to an unauthenticated caller. **It did not close the route-guard class as a whole**, and the
honest sentence is: **63 routes gated, 86 still carrying the SSR fail-open.** A cold `viewer` today
still fully renders `/admin/automation`, `/data-tables` and `/pricing/currency-sources` — measured by
the verifier after the merge, not predicted. That was the agreed tier-1 scope, and it is recorded
here as an open finding rather than described as done.

---

## Row reconciliation — 10 planned → 12 restructured → **13 closed**

The brief's 10 rows became 12 when the halt condition fired, and 13 when independent verification
found a third class of sibling after the first four branches had already merged.

| # | Row | Owner | State | Evidence |
|---|---|---|---|---|
| A-1 | Resolve `anon = 71` | A | **closed** | 71 genuinely reachable, **0 artifact** |
| A-2 | Enumerate the route-guard class | A | **closed** | 148 guarded / 23 gated / 125 ungated |
| **H-1** | Credit-scoring RLS | H | **closed** · mig 467 | sales `150\|16\|16` → `0\|0\|0`; accountant unchanged |
| **H-2** | Four `bot_*` writers | H | **closed** · mig 468 | `anon=f`, PUBLIC gone, `service_role=t` |
| B-1 | Gate-capable tier-1 routes | R | **closed** | part of the 40 files / 63 gates |
| B-2 | `requirePermission` tier-1 routes | R | **closed** | cold-session matrix 25/25 |
| B-3 | Derived route spec | R | **partial** | derived, but narrower than claimed — see below |
| C-1 | Anon-reachable writers | F | **closed, no migration** | zero consult no caller identity |
| C-2 | Bare-`authenticated` writers | F | **closed** · mig 470 | one real miss found by the orchestrator |
| C-3 | Three inverted guards | F | **closed** · mig 469 | positive `service_role` test |
| C-4 | Extend `og61` | F | **closed** | grant-independent rule added; 23/23 |
| D-1 | AI-routing audit trigger | D | **closed** · mig 475 | 8 rolled-back proofs |
| **471** | `ai_get_provider_key` + 5 more | H | **closed** · mig 471 | all 12 `ai_*`/`bot_*` now `anon=f` |

**Migrations applied: 467, 468, 469, 470, 471, 475.** 472–474 unused and free.
Disk **647** = ledger **647**.

---

## A-1 · the split of the 71

**71 genuinely anon-reachable. 0 artifact. The prior artifact hypothesis is refuted.**

`PGRST_DB_SCHEMAS=public`; `authenticator` is a member of `anon`; `anon` holds schema USAGE; every
input arg is named; no overload ambiguity; none returns `trigger`. 70 carry an explicit `anon=X`
grant, 1 (`post_mutual_settlement`) is PUBLIC-only and reachable anyway.

Independently reproduced by the orchestrator: `explicit_anon=70 · public_only=1 · total=71 · definer_writers=152`.

**But the operative subset was small**, which is the useful half of the answer: 63 already
role-check internally, 2 raise on a null uid, 2 are self-scoped no-ops, 4 were the `bot_*` writers.
`has_role` returns `false` (not NULL) for a NULL uid — `EXISTS` plus non-strict — so the 21
`IF NOT (a OR b)` guards genuinely refuse. **So Group C was urgent in principle and small in
practice**, and the wave's real function-level risk turned out to lie outside the 71 entirely,
in a *reader* (see 471).

---

## A-2 · the definitive route census

**148 route files call a guard helper; 23 carried `staticData`; 125 did not.**
73 `requirePermission` + 60 `requireAnyRole` + 15 `requireAdmin`, no overlaps.

Three denominators were in circulation and all three are now explained rather than adjudicated:

| Source | Figure | What it actually counted |
|---|---|---|
| `s5` spec header | 149 / 19 | bare-substring count — swept in 3 files mentioning a guard only in a comment; predates 4 gate additions |
| wave-4 Agent V | 23 of 148 | correct, reproduces exactly |
| orchestrator Stage 0 | 23 of 186 | 186 is the right **file** count and the wrong **guard** denominator |

**Post-wave: 63 gated.** The verifier measured `74/60/15`, union **149**, **63** gated → **86**
ungated — the +1 being a route that gained a guard during the wave.

### Tier rollup (149 files classified)

| Tier | Meaning | Count |
|---|---|---|
| 1 | money, credit, roles, keys, PII, destructive | **40** (36 needed a gate) |
| 2 | operational, non-permitted role should not see | **62** |
| 3 | genuinely static or self-only, **with a proof line** | **47** |

---

## Routes gated, and routes accepted — with reasons

**Gated: 40 files, 36 tier-1 routes closed; `staticData.gate` 23 → 63.**

| Class | Files | Gate written |
|---|---|---|
| no guard at all | 1 | `_app.pricing.attention` — got **both** halves; it had no guard of any kind and reads supplier cost prices |
| `requirePermission` | 17 | live `role_permissions.<module>.can_<action>` |
| `requireAnyRole` | 11 | the route's own array — its whole authority |
| `requireAdmin` | 11 | `{ kind: "admin" }` |

**Highest-leverage change:** gating the two layout routes `_app.sales.tsx` and
`_app.sales.quotes.tsx` closes two leaves by inheritance — `RouteRoleGate` walks the whole
`useMatches()` chain (verified at `RouteRoleGate.tsx:117-119` before being relied on).

**Deliberate over-delivery, stated:** all 11 ungated `requireAdmin` routes were gated, not only the
5 tier-1 ones. `{ kind: "admin" }` mirrors `requireAdmin()` exactly so it cannot produce a false
denial, and gating all 15 lets the spec *derive* that whole class instead of listing it.

**Accepted as gate-exempt** — the owner required a verdict with evidence, not a default. Of the 24
routes with no `beforeLoad`, **22** are genuinely unguarded (`_app.sales.quotes.index` and
`$quoteId` inherit `requirePermission("sales","view")` from their layout), and **18 of the 22** are
argued exempt with a route-file proof line — a static page shown to render no fetched data, or a
self-only view shown to scope its query to the current user. The five "unguarded admin pages" the
orchestrator flagged all carry fail-closed **in-component** role checks, so that specific trigger
did not fire; they still deserve real gates, because the check runs *after* the query.

---

## The four required demonstrations — all produced

1. **Cold `viewer` refused at formerly-exposed routes, including `requirePermission` routes.**
   Verifier's matrix: **25 of 25 cells correct** across viewer/sales/accountant/manager/admin × 5
   routes (two of them `requirePermission`). Cold `sales` and cold `accountant` both still reach all
   three pricing routes while cold `viewer` is refused — **a wave that locks out legitimate users
   has failed differently, and this one did not.**
   Pre-fix, on deployed build `eb6b6f64`, cold `viewer` **and** cold `sales` each rendered the `<h1>`
   of `/roles` (assigns and revokes roles), `/admin/penalties` (HR records on named staff),
   `/sales/credit-rules`, `/persons/create`, `/products/regenerate-names`.
2. **An anon-reachable writer now refused for `anon`** — all four `bot_*` writers `anon=f`,
   `service_role=t`, bare `=X` PUBLIC entry gone, by `has_function_privilege`.
3. **An inverted-guard function admitting the system path and refusing `anon`** — all three
   `*_market_rate_*_system` bodies now `IF COALESCE(auth.role(),'') <> 'service_role' … 42501`,
   grants `anon=f / authenticated=f / service_role=t`. **The NULL trap was proven decisively:** with
   no JWT, `auth.role() <> 'service_role'` evaluates to NULL and **falls through**, while the shipped
   `COALESCE` form returns true and raises.
4. **An audit row written by a rolled-back change to `ai_usage_routes`** — the OCR route repointed to
   OpenAI, producing a diff carrying `provider_base_url_before: http://192.168.170.8:11434` →
   `after: https://api.openai.com/v1`, then rolled back with both tables md5-identical and
   `audit_logs` back to 50,607 / max_id 62,711.

---

## Baselines

| | Stage-0 baseline | Final |
|---|---|---|
| `npm run typecheck` | **70** (18/15/13/13/6/5) | **70**, identical per-file split |
| `e2e/security/` | 219 passed / **1 failed** of 220 | **259 passed / 1 failed of 260** |
| The one failure | `rule12` → `e2e/unit/ledger-wizard-party-pick.spec.ts` | **byte-identical offender list** |
| migrations disk = ledger | 641 = 641 | **647 = 647** |
| `APP_GIT_SHA` == `HEAD` | `eb6b6f64` | **`b3620ae0`**, `HEAD` on `staging` |

+40 tests, all passing. CI `Staging Check` is red on the documented 70-error baseline; **zero
overlap** between the failing files and any file this wave touched, verified from the run log before
each `--admin` merge. Boundary Guard SUCCESS on all five PRs.

---

## What was found that nobody was looking for

### 1. `public.ai_get_provider_key(uuid)` — plaintext credentials to `anon`

`SECURITY DEFINER`, granted to `anon`, **no caller check of any kind**, returning
`vault.decrypted_secrets.decrypted_secret` — the plaintext API key of any active AI provider, to
anyone who supplies its uuid. Invisible to the entire `og61` suite because every derived query there
filters to **writers**, and this is a **reader**.

**And it is not a regression — which inverts the lesson.** The orchestrator asserted something had
re-granted `anon` after migration 153 and asked for the culprit; the agent looked, found the
opposite, and wrote that instead, with citations. Verified independently:

- The function appears in **four lines in the whole migration history**, all in 153. No later
  migration mentions it; there is no blanket `GRANT … ON ALL FUNCTIONS … TO anon` anywhere.
- The grant was written **at CREATE time by the schema's FUNCTIONS default privilege**. Migration
  393's header records `pg_default_acl` then carrying `{postgres=X, anon=X, authenticated=X,
  service_role=X}` — *"every function created by supabase_admin in public is executable by an
  anonymous caller the moment it exists, with no GRANT written anywhere."* 153 ran 2026-07-24; **393
  closed that tap on 2026-08-26 and did not act retroactively.** Live `pg_default_acl` now reads
  `postgres=X authenticated=X service_role=X` — no anon.
- **The proacl shape is the proof.** 153 wrote `REVOKE ALL … FROM public` and `FROM authenticated`
  but never `FROM anon`, so the explicit `anon=X` survived **with no bare `=X`** — the signature of
  an incomplete revoke. A never-revoked function carries **both** entries.

> **Carry this forward:** there is no culprit grant to hunt. **Every function created before
> migration 393 received `anon` from the schema default with no `GRANT` written anywhere to find**,
> so a history search will never surface them. They must be audited individually, from `proacl`.

### 2. Two more key-id-only `bot_*` functions

`bot_get_product_for_key` and `bot_list_products_for_key` gated solely on
`bot_api_key_label_access.api_key_id`; neither body referenced `bot_api_keys`. Both *appear* to check
`is_active` — it is `sale_price_types.is_active`, the price type's flag. **The identical trap that
hid inside the four writers**, where every `is_active` was `dynamic_table_rows.is_active`.

### 3. The SSR fail-open is still live on 86 routes

Measured post-merge by the verifier: a cold `viewer` fully renders `/admin/automation` (guard
admin/manager), `/data-tables` and `/pricing/currency-sources` — both denied to `viewer` by the live
table. Same defect class the wave closed elsewhere. **In scope for the deferral decision, but
"the cold-session hole is closed" is not a true sentence.**

---

## Deviations

1. **The wave was reordered.** The halt condition fired at Stage 1 on the credit-scoring RLS, so H-1
   and H-2 ran ahead of Groups B, C and D. 10 rows → 12 → 13.
2. **A fifth agent was added** (H) for the halt rows, so Group C would not carry them.
3. **`deploy/lan/.env.lan` was never seeded into the worktrees** — an orchestrator setup defect. It
   is gitignored and lives only in the main tree. Six specs import a helper that reads it and fail
   `ENOENT` at setup, skipping the serial blocks they head — producing `158 / 15 failed / 47 not run`,
   which looks like catastrophic regression and is none. **Any suite measurement taken in a worktree
   before this was fixed is not valid evidence.** Agent D diagnosed it, attributed it correctly, and
   did not work around the permission prompt that blocked it from self-seeding.
4. **`CONTRACTS.md` §3 briefly mis-allocated migrations `467`–`474` to two agents at once.** No
   collision occurred — the dispatch briefs were correct and Agent H checked disk, ledger and remote
   before claiming its numbers — but the contract was wrong and was corrected mid-stage.
5. **The orchestrator asserted a false premise** (that `ai_get_provider_key` had been re-granted) and
   instructed an agent to write it. The agent refused and documented the opposite. Recorded because
   the correct outcome depended on an agent contradicting its instruction.
6. **`--admin` merges** on five PRs, against the documented 70-error `Staging Check` baseline, each
   preceded by a run-log check confirming no file of this wave appears in the failures.

---

## Handed forward — build-brief ready, no re-derivation needed

| Item | Size | Where the detail already is |
|---|---|---|
| **Tier-2 routes** | 57 | investigation tables (i)–(iv): exposure line + live role set + tier per route |
| **Tier-3 routes** | 46 | same; 18 of the 22 unguarded already argued exempt with proof lines |
| **The SSR fail-open on the remaining 86** | 86 | the class itself; `/admin/automation`, `/data-tables`, `/pricing/currency-sources` demonstrated |
| **Static permission table divergence** | 13 modules | `src/lib/rbac/roles.ts:98-278` vs live. **NOT repaired, by owner decision.** `pricing` is the footgun: live grants 5 roles, static claims 3, ~15 routes |
| **The 21 `.ts` files in `src/routes/`** | 21 | including the four `api.public.bot.*` endpoints — outside every census anyone has made, never audited, and `RouteRoleGate` cannot apply to them |
| **`qual = true` RLS family** | 36 policies / 36 tables | 24 have no restrictive policy at all; three were this wave's halt |
| **B-3's narrower derivation** | 1 spec | see below |
| **`AUTHZ_SIGNALS` false signal** | 1 constant | `bot_api_key_table_access` counts as a caller check — **a key-id lookup authorizes a key, not a caller** — silently excluding all four `bot_*` writers from both derived sets |
| **`delete_bot_api_key_secure`** | 1 function | reads `user_roles … LIMIT 1`, so a multi-role user gets an arbitrary role. Correctness, not reachability |
| **`admin_upsert_ai_provider` / `admin_delete_ai_provider`** | 2 functions | write **new-value-only** audit rows; cannot answer "what was it before?". Now duplicated by 475's trigger, separable by `entity_type` |
| **`ai_providers` has no `updated_by`** | 1 column | so an update with no JWT records `actor_source: "unknown"` plus the DB identity — honest, but not a person |
| **`tick_inquiries`** | 1 function | a DEFINER path to three functions revoked from `authenticated`. Idempotent on elapsed time, so nothing a caller can aim — but it is an indirect reach past a revoke |

### B-3 — derived, but narrower than claimed

`s5` **is** derived where it says it is, and it went red-before / green-after (31 failed + 8 passed →
39 passed). But "a newly added ungated tier-1 route fails on its own" is **narrower than stated**:

- block 2 opens `if (!CALLS_A_GUARD.test(src)) return false;` — **a new route that forgets its
  `beforeLoad` guard entirely is skipped**, which is the worse of the two failure modes;
- its tripwire depends on **14 hard-coded data markers**; `purchase_prices`, `person_identifiers`,
  `invoices` and `payment_receipts` are all outside it;
- the 30-entry `TIER1` registry is a hard-coded list.

Its header census is also **already stale again** — it claims 23 gated; the post-wave figure is 63.

---

## Lessons that generalise

1. **A justification can rot while the suite stays green.** og61's allowlist said *"the messenger
   inquiry flow calls `expire_pending_documents` as an authenticated user."* That sentence originates
   in migration 399's header, was copied into og61 by wave 4, and repeated since. **Four readers
   accepted it because it was written down.** One `grep` for a call site — which nobody ran for four
   waves — dissolves it: the function has no call site at all. It describes the call *chain*
   correctly and the call *site* wrongly.
2. **A derived test that only fires when grants exist proves nothing after a revoke.** og61's old
   rule passed on an **empty set** for a whole wave over three unfixed inverted bodies. C-4's
   replacement is grant-independent.
3. **A helper-shaped guard is invisible to a `has_role` grep.** Six exist here
   (`gamification_assert_manager`, `_mi_require_privileged`, `has_dynamic_permission`,
   `dyn_table_role_can_view`, `kd_role_can_view`, `can_read_person`). Any audit that greps for
   `has_role` will under-count.
4. **A column named `is_active` is not necessarily *this* thing's `is_active`.** It cost two separate
   near-misses here — `dynamic_table_rows.is_active` and `sale_price_types.is_active`, both read as
   key-validity checks that were not.
5. **`NULL <> 'x'` is NULL, not true.** A guard written as a bare inequality against `auth.role()`
   falls through for exactly the unauthenticated caller it is meant to refuse — reproducing the
   inversion being fixed.
6. **Don't quote the pattern you forbid.** An in-migration verification block failed because
   `prosrc` includes comments and the new comment quoted the old code.
7. **A worktree without `node_modules` reports 0 typecheck errors, silently.** Treat 0 as a broken
   measurement, never as a pass.

---

## NOT VERIFIED

1. **`purchase_specialist` and `site` in a browser** — no test accounts exist for either role. `site`
   is a valid `AppRole` no user holds today; every gate granting it was written from the live table,
   not from a browser observation.
2. **`get_customer_dynamic_credit`** — never exercised, by instruction: it calls
   `_ensure_credit_balance`, which **writes**.
3. **The AI settings screen still saving after 475's trigger** — the trigger cannot fail closed on
   that path (DEFINER, owner has BYPASSRLS, actor FK-guarded, JWT parse inside an exception handler)
   and all eight operations were exercised in rolled-back transactions, **but the UI itself was not
   driven.**
4. **The 86 remaining SSR fail-open routes** — three were demonstrated; the other 83 are inferred
   from the same mechanism, not individually measured.
5. **Whether any `anon` grant besides those fixed here predates migration 393.** The default-ACL
   finding implies there may be more, and they cannot be found by searching migration history. **No
   exhaustive `proacl` sweep for pre-393 functions was performed.** This is the single most
   actionable follow-up in this report.

---

`PARTIAL` — 13 rows closed with evidence, one (B-3) closed but narrower than claimed and documented
as such, and the route-guard class closed for tier 1 only with 86 routes explicitly open. A clean
`PARTIAL` outranks a padded `COMPLETE`.
