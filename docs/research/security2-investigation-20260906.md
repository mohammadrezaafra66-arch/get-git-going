# Security wave 2 — Agent A investigation (rows A-1, A-2)

**Date:** 2026-09-06 · **Base:** `origin/staging` @ `eb6b6f6455fad5f47aa2c93a1f62eb03f99a1dd7`
**Worktree:** `C:/Users/AFRA/AppData/Local/Temp/claude/security2/wt-s2A` · branch `feature/security2-agentA`
**Mode:** READ-ONLY. No function was called. No row was written. No source file was edited.
Every DB statement ran through
`docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db psql -d afrakala`.

Legend: **[E]** measured by me · **[P]** prior art, cited · **[?]** unknown / UNVERIFIED.

---

## 🔴 HALT CONDITION — **FIRED** (A-2 side)

### What fires it

**A route whose own guard excludes `sales` renders customer *and* salesperson credit-scoring
data to a cold `sales` session, and the database will hand that data to `sales` on request
regardless of the route.**

Two independent facts compose into it.

**Fact 1 — the RLS on the credit-scoring tables reads `true`.** [E]

```
$ ... psql -d afrakala -At -F'|' -c "SELECT tablename,policyname,permissive,cmd,coalesce(qual,'-')
    FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('dynamic_entity_scores','dynamic_scoring_parameters','dynamic_parameter_weights');"

dynamic_entity_scores|dyn_scores_read_authenticated|PERMISSIVE|SELECT|true
dynamic_entity_scores|dyn_scores_write_admin_accountant|PERMISSIVE|ALL|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text))
dynamic_entity_scores|viewer_restricted|RESTRICTIVE|ALL|(NOT is_viewer_only(auth.uid()))
dynamic_parameter_weights|dyn_param_weights_read_authenticated|PERMISSIVE|SELECT|true
dynamic_parameter_weights|dyn_param_weights_admin_write|PERMISSIVE|ALL|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))
dynamic_parameter_weights|viewer_restricted|RESTRICTIVE|ALL|(NOT is_viewer_only(auth.uid()))
dynamic_scoring_parameters|dyn_scoring_params_read_authenticated|PERMISSIVE|SELECT|true
dynamic_scoring_parameters|dyn_scoring_params_admin_write|PERMISSIVE|ALL|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))
dynamic_scoring_parameters|viewer_restricted|RESTRICTIVE|ALL|(NOT is_viewer_only(auth.uid()))
```

The only other policy on the read path is `viewer_restricted`, and it is **RESTRICTIVE** —
verified explicitly, because the whole verdict turns on it:

```
$ ... -c "SELECT policyname, permissive, count(*) FROM pg_policies
    WHERE schemaname='public' AND policyname='viewer_restricted' GROUP BY 1,2;"
viewer_restricted|RESTRICTIVE|93
```

RESTRICTIVE is AND-ed, so it *subtracts* access from a viewer-only user and grants nothing.
`is_viewer_only` is `viewer AND no other role` (read from `pg_proc.prosrc`, not called):

```
SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'viewer')
   AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role <> 'viewer');
```

**Therefore:** a pure `viewer` is refused. Every other authenticated role — `sales`,
`accountant`, `purchase_specialist`, `site` — passes `NOT is_viewer_only()` and then matches
`qual = true`, so **`sales` can SELECT every row of all three tables.**

Volume (counts only, no values): [E]

```
$ ... -c "SELECT entity_type, count(*), count(distinct entity_id) FROM public.dynamic_entity_scores GROUP BY 1;"
customer|91|11
salesperson|59|9
```

150 credit-scoring rows covering 11 customers and 9 salespeople, each row carrying
`raw_score`, `actual_value`, `is_clipped`, `scored_by`, `period_month`. A salesperson can read
**every other salesperson's** scoring row and **every customer's**.

**Fact 2 — the page that displays it has no client-side gate.** [E]

`src/routes/_app.sales_.customers_.$customerId.credit.tsx:22-27`:

```ts
export const Route = createFileRoute("/_app/sales_/customers_/$customerId/credit")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: CustomerCreditPage,
});
```

No `staticData.gate`. `beforeLoad` returns without refusing during SSR
(`src/lib/rbac/route-guards.ts:15` — `if (typeof window === "undefined") return null;` then
`:184-185` — `if (!resolved) return { user: null, roles: [] }`), and wave 4 measured that on a
cold direct navigation `beforeLoad` never re-runs in the browser [P, `docs/research/wave4-build-20260906.md` §4].
So a cold `sales` session lands on the page, and its queries (`dynamic_entity_scores` via
`src/hooks/credit/useDynamicScoring.ts:136-140, 226-243`) return data.

`_app.sales.credit-rules.tsx` (`requireAnyRole(["admin","accountant"])`, no gate) is the second
route in the same class: it reads `dynamic_scoring_parameters` and `dynamic_parameter_weights`
— the credit rulebook — which the same `qual = true` policies hand to `sales`.

### What a curious `sales` user can do today, plainly

Open `/sales/customers/<any customer id>/credit` or `/sales/credit-rules` cold, or issue one
PostgREST `GET /rest/v1/dynamic_entity_scores?select=*` with their own session token, and read
the complete credit-scoring picture for every customer and every colleague — the per-parameter
raw scores, the actual values behind them, who scored them and when. They cannot write it
(`dyn_scores_write_admin_accountant` is admin/accountant only, and the SELECT-only policy does
not cover INSERT/UPDATE/DELETE). A pure `viewer` is refused by `viewer_restricted`.

**This is an RLS defect first and a route-gate defect second.** Gating the two routes hides the
page; it does not close the PostgREST path. Both need doing, and the RLS fix is the one that
matters. Group B alone cannot close it.

### Secondary halt-adjacent finding (A-1 side)

Four `bot_*` writers reachable by `anon` perform **no session-based authorization at all** —
their only credential is a UUID passed as an argument, and they do not check the key's
`is_active` or `expires_at`. See A-1 §4. This is a defence-in-depth hole rather than a trivially
exploitable one (the UUID is 122-bit random and one mapping row exists today), so on its own it
would not have fired the halt; it is recorded here because wave 4 marked it NOT VERIFIED and it
is now verified.

### What did **not** fire it, checked and cleared

I chased four other candidates to the catalogue and each one held:

| Suspected | Verdict |
|---|---|
| `viewer_restricted` grants `sales` blanket access to 93 tables | **Refuted** — RESTRICTIVE, not PERMISSIVE. It subtracts only. |
| `bot_api_keys` / `bot_api_key_table_access` readable by `sales` | **Refuted** — the only PERMISSIVE policy is `bot_api_keys_admin_manager_all` = `has_any_role(admin,manager)`. `anon` matches no policy at all. |
| `sales_quotes` readable across salespeople by `sales` | **Refuted** — `sales_quotes_select` scopes `sales` to `salesperson_id = auth.uid()`. |
| `ai_providers` (AI API keys), `user_roles`, `audit_logs`, `profiles` readable by non-admins | **Refuted** — all four are `has_role(auth.uid(),'admin')` PERMISSIVE-only. Non-admins get an empty page shell. |

---

## A-1 · The 71, split

### 1. The number reproduces exactly, and the denominator is complete

```
$ ... psql -d afrakala -At -F'|' -c "
SELECT
  count(*)                                                                 AS writers,
  count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))  AS anon_privilege_true,
  count(*) FILTER (WHERE array_to_string(p.proacl,',') LIKE '%anon=X%')     AS anon_explicit_in_proacl,
  count(*) FILTER (WHERE has_function_privilege('anon', p.oid,'EXECUTE')
                     AND array_to_string(p.proacl,',') NOT LIKE '%anon=X%') AS anon_via_public_only,
  count(*) FILTER (WHERE p.proacl IS NULL)                                  AS proacl_null_default
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.prosecdef
  AND p.prorettype <> 'pg_catalog.trigger'::regtype
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND p.prosrc ~* '\m(insert|update|delete)\M';"

120|71|70|1|0
```

**71 confirmed.** [E] (Wave 4 and Agent V both said 71 [P]; my writer denominator is 120 where
they said 118 — the two-function difference is regex definition of "writes", not population, and
does not touch the anon figure.)

The denominator loses nothing at the edges — there is no anon-reachable SECDEF writer that
`authenticated` cannot also call:

```
$ ... -c "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef AND p.prorettype <> 'pg_catalog.trigger'::regtype
     AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
     AND has_function_privilege('anon',p.oid,'EXECUTE')
     AND p.prosrc ~* '\m(insert|update|delete)\M';"
(0 rows)

$ ... -c "SELECT count(*) ... same without the authenticated predicate ...;"
71
```

Whole-population context, which reproduces prior art's 658/3 split exactly: [E]

```
anon_exec=661 | explicit anon=X=658 | via PUBLIC only=3 | of which return trigger=159
```

### 2. Grant kind — 70 explicit, 1 PUBLIC-only

Of the 71, **70 carry an explicit `anon=X/supabase_admin` entry in `proacl`** — a deliberate
grant, not the default. Example (`update_role_permissions`):

```
=X/supabase_admin supabase_admin=X/supabase_admin anon=X/supabase_admin
authenticated=X/supabase_admin service_role=X/supabase_admin postgres=X/supabase_admin
```

**Exactly one reaches `anon` through the PUBLIC default alone** —
`post_mutual_settlement(_person_id uuid, _offset_amount numeric, _cash_amount numeric,
_bank_account_id uuid, _note text, _entry_date date)`:

```
=X/supabase_admin postgres=X/supabase_admin supabase_admin=X/supabase_admin
authenticated=X/supabase_admin service_role=X/supabase_admin
```

No `anon=X` entry — the leading `=X/supabase_admin` is the PUBLIC grant, and `anon` inherits it.
This is the one entry where `REVOKE ... FROM anon` alone would do nothing and `REVOKE ... FROM
PUBLIC` is mandatory (CONTRACTS §4 rule, confirmed live).

### 3. REST reachability — **all 71 are genuinely reachable. None is an artifact.**

The chain was established from configuration and the catalogue, calling nothing:

| Link | Evidence | Result |
|---|---|---|
| `public` is an exposed schema | `docker inspect afrakala-lan-rest` → `PGRST_DB_SCHEMAS=public,storage,graphql_public` | ✅ |
| the anon role PostgREST assumes | `PGRST_DB_ANON_ROLE=anon` | ✅ |
| `authenticator` may `SET ROLE anon` | `pg_has_role('authenticator','anon','MEMBER')` = `t` | ✅ |
| (`…,'USAGE')` returns `f` — **not a block**) | `pg_roles`: `authenticator.rolinherit = f` (NOINHERIT, correct for PostgREST) | — |
| `anon` may enter the schema | `has_schema_privilege('anon','public','USAGE')` = `t` | ✅ |
| the API answers | `curl http://192.168.170.8:9000/rest/v1/` → `401 0.004774s` (service up, key required) | ✅ |
| none returns `trigger` | excluded by `prorettype <> 'pg_catalog.trigger'::regtype` in the query itself | ✅ |
| every argument is named (PostgREST addresses args by name) | query below returns 0 rows where `pronargs <> array_length(proargnames,1)` for the *input* args | ✅ |
| no overload ambiguity | for all 71, `count(*) FROM pg_proc WHERE proname = <name> AND nspname='public'` = 1 | ✅ |

The "unnamed args" probe returns ten rows, but every one of them is a function whose
`proargnames` is **longer** than `pronargs` (OUT columns of a `RETURNS TABLE`), never shorter —
e.g. `bot_query_table_rows` `pronargs=5, named=12`. Input arguments are fully named in all 71.

Volatility: 70 are `provolatile='v'` (POST `/rpc/<name>`); `bot_query_table_rows` is `'s'`
(GET or POST). Both are callable.

**So the split the row asked for is:**

- **genuinely anon-reachable: 71**
- **artifact / not REST-reachable: 0**

Prior art's hope that the number was a PUBLIC-grant artifact [P, wave-4 CONTRACTS §5] is
**refuted**: 70 of 71 are explicit grants, and the one PUBLIC-only case is reachable anyway.

### 4. What actually happens when `anon` calls them — the operative sub-split

Reachability is not exploitability. Reading every one of the 71 bodies (`prosrc` only) gives:

| Class | Count | Behaviour for an unauthenticated caller |
|---|---|---|
| Role check that refuses | **63** | `has_role`/`has_any_role`/`is_admin` returns **false** for a NULL uid → `RAISE EXCEPTION` |
| Explicit `IF uid IS NULL THEN RAISE` | **2** | `log_invoice_issuance_blocked_overdue` (`ERRCODE 28000`), `submit_quiz_attempt` (`'unauthenticated'`) |
| Self-scoped, so a no-op | **2** | `mark_notification_read`, `mark_all_notifications_read` — `WHERE user_id = auth.uid()`; NULL matches nothing |
| **No session-based authorization at all** | **4** | `bot_create_table_row`, `bot_update_table_row`, `bot_upsert_table_row`, `bot_query_table_rows` |

**Why the 63 genuinely refuse — the load-bearing detail.** `has_role`/`has_any_role` return
`false`, never NULL, for a NULL uid. Read, not called:

```
has_role(_user_id uuid, _role text) strict=false returns boolean
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = _role)
has_any_role(_user_id uuid, _roles text[]) strict=false returns boolean
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = ANY(_roles))
```

`EXISTS` is never NULL and `proisstrict=false` means a NULL argument does not short-circuit. This
matters because 21 of the 63 use the shape `IF NOT (has_role(u,'a') OR has_role(u,'b')) THEN
RAISE` — had `has_role` returned NULL, `IF NULL THEN` would be treated as false and **anon would
fall straight through**. It does not. Sampled bodies confirming the shape, with the guard as the
first executable statement: `update_role_permissions:6`, `create_custom_role:4`,
`approve_pending_user:3`, `quick_approve_user:5`, `create_bot_api_key:9-11`,
`pay_purchase_with_voucher:22`, `post_receipt_accounting:16`, `post_mutual_settlement:14`,
`admin_upsert_ai_provider:9`, `admin_delete_ai_provider:6`, `set_bot_api_key_table_access:6-8`,
`create_sales_quote_with_items:35-39`, `run_daily_capital_allocation:14-18`,
`review_market_product_match_{approve,reject,disable}:7-11`, `update_sales_quote_status:10`,
`set_profile_field_value:3-7`, `start_league_season:5`, `update_workflow_setting:3`,
`record_market_rate_tick:7-11`, `record_external_market_rate_tick:8-12`,
`start_market_rate_ingestion_run:4-8`, `finish_market_rate_ingestion_run:4-8`,
`set_market_rate_tick_status:4-8`, `update_market_rate_source_mapping:13-19`,
`archive_platform_release:5`, `publish_platform_release:5`, `create_delivery_receipt:10-14`,
`create_document:7-11`, `review_delivery_receipt:8-12`, `review_document:11-15`,
`create_manual_penalty:4`.

**The four `bot_*` functions.** Their entire authorization is a lookup of an argument:

```
-- bot_create_table_row, verbatim
  -- 1) Access check
  SELECT a.can_update, a.allowed_update_columns INTO _can_update, _allowed
  FROM public.bot_api_key_table_access a
  WHERE a.api_key_id = p_key_id AND a.table_id = p_table_id;
  IF _can_update IS NULL THEN RAISE EXCEPTION 'forbidden_table'; END IF;
  IF NOT _can_update THEN RAISE EXCEPTION 'forbidden_update'; END IF;
```

No `auth.uid()`. No reference to `bot_api_keys` at all — measured:
`grep -c -iE 'bot_api_keys|is_active *= *true|expires_at'` over each body returns **0, 0, 0** for
create/update/upsert and **1** for query.

The intended path is the opposite shape: `src/server/bot-api.ts:286` calls
`bot_authenticate_key(p_raw_key)` through `supabaseAdmin` (service_role), which hashes the
presented key and checks it:

```
  _hash := encode(extensions.digest(p_raw_key, 'sha256'), 'hex');
  SELECT k.id, k.name, k.is_active, k.expires_at INTO _id,_name,_active,_expires
    FROM public.bot_api_keys k WHERE k.key_hash = _hash;
  IF _id IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF NOT _active THEN RAISE EXCEPTION 'inactive_key'; END IF;
  IF _expires IS NOT NULL AND _expires < now() THEN RAISE EXCEPTION 'expired_key'; END IF;
```

`bot_authenticate_key` is `anon = f`. The four functions it feeds are `anon = t`. So the secret
check can be bypassed by calling the downstream function directly with a `p_key_id`, and a
**deactivated or expired key's id still works**, because only `bot_authenticate_key` looks at
those columns.

Blast radius today: `bot_api_key_table_access` holds **1 row**; `bot_api_keys` holds 12. The
`api_key_id` is a v4 UUID and is not readable by `anon` (`bot_api_keys`/`bot_api_key_table_access`
policies are `{authenticated}` only, and PERMISSIVE only for admin/manager). So this is a
capability-URL: unguessable in practice, catastrophic if one id ever appears in a log, a URL, a
support ticket or a screenshot. Wave 4 listed this as assumed-not-proven [P §9.4]; it is now
**proven, and the assumption was wrong** — they do not authenticate by key, they authenticate by
key *id*.

### 5. The three inverted guards — exact names, quoted bodies, current ACLs

The brief's names (`start_/finish_/record_external_market_rate_tick_system`) do not exist. The
real ones, discovered by `WHERE proname LIKE '%\_system'`:

```
$ ... -c "SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef,
     has_function_privilege('anon',p.oid,'EXECUTE'), has_function_privilege('authenticated',p.oid,'EXECUTE'),
     has_function_privilege('service_role',p.oid,'EXECUTE'), array_to_string(p.proacl,' ')
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE '%\_system' ORDER BY 1;"

finish_market_rate_ingestion_run_system|p_run_id uuid, p_status text, p_fetched integer, p_inserted integer, p_suspect integer, p_error text|t|f|f|t|supabase_admin=X/supabase_admin service_role=X/supabase_admin postgres=X/supabase_admin
record_external_market_rate_tick_system|p_indicator_id uuid, p_source_id uuid, p_value numeric, p_observed_at timestamp with time zone, p_source_reported_at timestamp with time zone, p_raw_payload jsonb, p_unit text|t|f|f|t|supabase_admin=X/supabase_admin service_role=X/supabase_admin postgres=X/supabase_admin
start_market_rate_ingestion_run_system|p_source_code text|t|f|f|t|supabase_admin=X/supabase_admin service_role=X/supabase_admin postgres=X/supabase_admin
```

**Current `proacl` for all three: `anon = f`, `authenticated = f`, `service_role = t`, and the
PUBLIC entry `=X/supabase_admin` is gone as well.** Reachability is genuinely closed.

**The inverted logic is still in every body, verbatim** — this is the part wave 4 left latent [P §3]:

`start_market_rate_ingestion_run_system`
```sql
  -- Service-role only: callable when there is no authenticated user.
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
```

`finish_market_rate_ingestion_run_system`
```sql
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
```

`record_external_market_rate_tick_system`
```sql
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'system RPC: not callable by authenticated users';
  END IF;
```

`auth.uid()` is NULL for `service_role` **and** for `anon`, so the guard admits exactly the
callers with no identity. It is inert only because the grant is gone. **Regranting EXECUTE to
`anon` — including accidentally, via a bare `CREATE OR REPLACE`, which restores default grants
(CONTRACTS §4 rule 3) — restores the hole in the same statement.** A body-level fix (test for
`current_user`/`session_user` = the service role, or `auth.role()`, rather than for the absence of
a uid) is the durable one. Not attempted here; investigation only.

Their six non-`_system` siblings — `start_market_rate_ingestion_run`,
`finish_market_rate_ingestion_run`, `record_market_rate_tick`, `record_external_market_rate_tick`,
`set_market_rate_tick_status`, `update_market_rate_source_mapping` — are all still `anon = t`
(they are in the 71) and all carry a **correct** guard: `IF v_uid IS NULL THEN RAISE` followed by
an admin/manager/accountant `has_role` test. Wave 4's note that these six "appear to carry checks
but the hardening did not extend to them" [P] is accurate about the grant and pessimistic about
the bodies: the bodies do refuse.

---

## A-2 · The definitive route census

### The authoritative denominator, and the other three explained

```
$ find src/routes -name '*.tsx' | wc -l           -> 186     (all are top-level; there are no subdirectories)
$ find src/routes -name '*.ts'  | wc -l           ->  21     (API/server routes, not page routes)
$ grep -rl 'beforeLoad' src/routes/*.tsx | wc -l  -> 161
$ grep -rlE 'requirePermission\(|requireAnyRole\(|requireAdmin\(|requireAdminOrManager\(' \
      src/routes/*.tsx | wc -l                    -> 148
$ grep -rl 'staticData' src/routes/*.tsx | wc -l  ->  23
```

**The authoritative denominator is 148 — route files that call one of the guard helpers.**
That is the population `staticData.gate` is *for*, and the one every count should be quoted
against. Precisely: it counts `.tsx` files directly under `src/routes/` containing a call to
`requirePermission(`, `requireAnyRole(`, `requireAdmin(` or `requireAdminOrManager(`. It counts
layout routes (`_app.sales.tsx`, `_app.sales.quotes.tsx`, `_app.bot-api-keys.tsx`) and pathless /
parameterised routes; it is **not** a count of addressable URLs.

Per-kind, with word-boundary calls (no overlaps — no file calls two kinds):

| Guard | files | of those, with `staticData` | **without** |
|---|---|---|---|
| `requirePermission(` | 73 | 1 | **72** |
| `requireAnyRole(` | 60 | 18 | **42** |
| `requireAdmin(` | 15 | 4 | **11** |
| `requireAdminOrManager(` | 0 | 0 | 0 |
| **total** | **148** | **23** | **125** |

All 23 `staticData` files are inside the 148 (`comm -13` of the two lists is empty).

**The other numbers in circulation, reconciled:**

| Claim | Source | Reconciliation |
|---|---|---|
| "149 route files call one of the three guards; 19 carry `staticData`" | `e2e/security/s5-guarded-admin-routes-carry-a-client-gate.spec.ts:39` | **149 is a bare-substring count, not a call count.** `grep -rl requirePermission` = 74 and `requireAnyRole` = 62, against 73/60 for `…(`. Three files *mention* a guard name without calling it — `_app.accounting.receipts.create.tsx`, `_app.api-keys.tsx`, `_app.gamification.achievements.tsx` (all in prose comments). The 19 is simply stale: 4 more `staticData` files landed after that line was written (wave 4's own three plus `/bot-api-keys` in `33418e6f`). |
| "23 of 148" | Agent V, wave 4 [P] | **Exactly reproduces.** Same definition, same answer. |
| "186 `.tsx` / 161 `beforeLoad` / 23 `staticData` / 25 with neither" | orchestrator, CONTRACTS §2 | **All four reproduce.** 186 is every `.tsx` in the directory; it is the right file count and the wrong *guard* denominator, because 38 of the 186 call no guard: 13 have a `beforeLoad` that is not a guard call, and 25 (incl. `__root.tsx`) have no `beforeLoad` at all. |

**The 13 `beforeLoad`-without-a-guard files, so nobody re-derives them:** seven are pure redirect
stubs with no component and no query (`_app.accounting.customer-capital-allocations:11-13`,
`_app.accounting.daily-capital:13-15`, `_app.accounting.salesperson-capital-allocations:11-13`,
`_app.admin.gamification:5-7`, `_app.admin.gamification.achievements:5-7`,
`_app.integrations.didar:29-31`, `_app.users.pending:5-7` — each body is a single
`throw redirect({...})`). The other six are the auth shell itself: `_app.tsx` (session + `status`
check), `index.tsx`, `login.tsx`, `register.tsx`, `pending-approval.tsx`,
`[.]lovable.oauth.consent.tsx`. **All 13 are correctly gate-exempt.**

### The mechanism, re-read and confirmed (with one correction)

`src/lib/rbac/route-guards.ts`, read in full: [E]

- **The SSR fail-open is real and deliberate.** `resolveAuthWithRetry():15` —
  `if (typeof window === "undefined") return null;` — and each of the three guards then does
  `if (!resolved) return { user: null, roles: [] };` (`:114`, `:151`, `:185`). A returning guard
  is a passing guard. Combined with wave 4's instrumented finding that `beforeLoad` runs *only*
  on the server for a cold direct navigation [P], **the exposure is permanent for that page view,
  not a loading window.** Confirmed as written in the brief.
- **Correction to the "race" half of the story:** the `if (rolesLoading || …) return` fail-open
  that prior art describes is **gone from `staging`**. `settleRoles():79-109` now awaits, and
  `:126`/`:160`/`:194` refuse with `redirect({to:"/unauthorized"})` when roles never settle. So on
  a *client-side* navigation the guards are now correct. Only the cold/SSR path remains open. Any
  brief still describing a role-loading race is describing a fixed bug.
- **`RouteRoleGate` is the only browser-side refusal**, mounted once in `src/routes/_app.tsx:215-217`
  around `<Outlet/>`. Consequence worth stating: it covers **only `_app.*` descendants**. `index`,
  `login`, `register`, `pending-approval`, `reset-password`, `unauthorized`,
  `public.sale-lists.$listId` and `[.]lovable.oauth.consent` are outside it entirely and can never
  be gated this way.
- **`RouteRoleGate` walks the whole matched chain** — `:113-120`, `const gates = matches.map(m => m.staticData?.gate).filter(Boolean)`
  and `gates.find(g => !passes(g, roles))`. **So a gate on a layout route protects its children.**
  This is load-bearing and is not recorded anywhere else: `_app.bot-api-keys.tsx:36` carries the
  gate and `:43-45` is `function BotApiKeysLayout() { return <Outlet />; }`, so its four children
  (`index`, `docs`, `playground`, `usage`) are **already gated by inheritance** even though they
  carry no `staticData` of their own. Agent R can gate a whole subtree with one line.
- **`requirePermission` routes cannot carry a `permission`-kind gate.** Confirmed exactly as the
  brief states, from `RouteRoleGate.tsx`'s own header: *"`requirePermission` does
  `await loadRolePermissions()` FIRST, while a React render cannot await, so an unpopulated dynamic
  cache makes `hasPermissionEx` fall through to the STATIC permission table (`roles.ts` — 'Fallback
  to static')"*. The type is `RouteGate = { kind: "anyRole"; allowed } | { kind: "admin" }` and
  nothing else. The wave-4 pattern — an `anyRole` gate carrying the **live** `role_permissions`
  set — is the only correct shape. **Confirmed, not corrected.**

### The live `role_permissions` table (28 modules × 7 roles = 193 rows)

This is what `requirePermission` actually resolves to once the cache loads. Roles present:
`admin, manager, accountant, sales, viewer, purchase_specialist, site`.

```
$ ... -c "SELECT module,
   string_agg(role_name,',' ORDER BY role_name) FILTER (WHERE can_view)           AS view_roles,
   string_agg(role_name,',' ORDER BY role_name) FILTER (WHERE can_create)         AS create_roles,
   string_agg(role_name,',' ORDER BY role_name) FILTER (WHERE can_update)         AS update_roles,
   string_agg(role_name,',' ORDER BY role_name) FILTER (WHERE can_view_sensitive) AS sensitive_roles
   FROM public.role_permissions GROUP BY module ORDER BY module;"
```

| module | live `can_view` | live `can_create` | live `can_update` | live `can_view_sensitive` |
|---|---|---|---|---|
| academy | accountant, admin, manager, purchase_specialist, sales, viewer | admin, manager | admin, manager | admin |
| accounting | accountant, admin, manager | accountant, admin, manager | accountant, admin, manager | accountant, admin, manager |
| asan-export | accountant, admin | — | — | admin |
| asan-import | accountant, admin | accountant, admin | accountant, admin | admin |
| audit-logs | accountant, admin | accountant, admin | accountant, admin | accountant, admin |
| bot-api-keys | admin, manager, site | admin, manager, site | admin, manager | admin |
| dashboard | accountant, admin, manager, purchase_specialist, sales, viewer | admin | admin | admin |
| data-tables | accountant, admin, manager, purchase_specialist, sales, site | admin, manager, site | admin, manager, purchase_specialist, sales, site | admin |
| feedback | accountant, admin, manager, purchase_specialist, sales, viewer | accountant, admin, manager, purchase_specialist, sales, viewer | admin, manager | admin |
| hr | admin, manager | accountant, admin, manager, sales, viewer | admin, manager | admin, manager |
| invoices | accountant, admin, manager, sales | accountant, admin, manager, sales | accountant, admin, manager, sales | accountant, admin, manager |
| knowledge | accountant, admin, manager, purchase_specialist, sales, viewer | admin, manager | admin, manager | admin |
| ledger-documents | accountant, admin, manager | accountant, admin, manager | — | — |
| market-rates | accountant, admin, manager, sales | accountant, admin, manager | accountant, admin, manager | accountant, admin, manager |
| messages | accountant, admin, manager, purchase_specialist, sales, viewer | accountant, admin, manager, purchase_specialist, sales, viewer | accountant, admin, manager, sales, viewer | admin |
| persons | accountant, admin, manager, sales, viewer | admin, manager | admin, manager | accountant, admin, manager |
| platform-releases | accountant, admin, manager, purchase_specialist, sales, site, viewer | admin | admin | admin |
| price-lists | accountant, admin, manager, purchase_specialist, sales | admin, manager, purchase_specialist, sales | admin, manager, purchase_specialist, sales | admin |
| pricing | accountant, admin, manager, purchase_specialist, sales | accountant, admin, manager, purchase_specialist, sales | accountant, admin, manager, purchase_specialist, sales | accountant, admin, manager, purchase_specialist, sales |
| product-videos | accountant, admin, manager, sales | — | admin, manager, sales | admin |
| products | accountant, admin, manager, purchase_specialist, sales, site | admin, manager, site | accountant, admin, manager | admin, manager |
| purchases | accountant, admin, manager, purchase_specialist, sales | admin, manager | admin, manager | accountant, admin, manager |
| reports | accountant, admin, manager, purchase_specialist, sales, viewer | accountant, admin | admin | accountant, admin, manager |
| roles | accountant, admin | admin | admin | admin |
| sales | accountant, admin, manager, sales | accountant, admin, manager, sales | admin, manager, sales | accountant, admin, manager |
| suppliers | accountant, admin, manager, purchase_specialist, sales | accountant, admin, purchase_specialist, sales | accountant, admin, purchase_specialist, sales | accountant, admin, manager |
| users | admin | admin | admin | admin |
| warehouse | accountant, admin, manager, purchase_specialist, sales | admin, manager | admin, manager | admin, manager |

### 🔶 Static-table divergences — reported, not repaired (CONTRACTS decision 3)

`src/lib/rbac/roles.ts:98-278` (`PERMISSIONS`) vs the table above. **Every divergence below is a
place where copying the static table into an `anyRole` gate would produce a wrong gate.**

| module | static `view` | live `can_view` | divergence |
|---|---|---|---|
| **pricing** | admin, manager, accountant | + **purchase_specialist, sales** | **live is WIDER by two roles.** Affects ~15 routes. A gate copied from static would falsely deny every salesperson. |
| **suppliers** | admin, manager, accountant | + **purchase_specialist, sales** | live wider by two |
| **roles** | admin | + **accountant** | live grants `accountant` view **and** `view_sensitive` on the roles module |
| **audit-logs** | admin | + **accountant** | live wider |
| **bot-api-keys** | admin, manager | + **site** | already handled correctly in `_app.bot-api-keys.tsx:36` |
| **data-tables** | admin, manager, accountant, viewer | + purchase_specialist, sales, site; **− viewer** | wider *and* narrower |
| **products** | ALL_ROLES + purchase_specialist | + site; **− viewer** | wider and narrower |
| **price-lists** | ALL_ROLES | + purchase_specialist; **− viewer** | wider and narrower |
| **sales** | ALL_ROLES | **− viewer** | live narrower |
| **invoices** | ALL_ROLES | **− viewer** | live narrower |
| **purchases** | …+ viewer | **− viewer** | live narrower |
| academy / feedback / knowledge / reports / platform-releases | ALL_ROLES | + purchase_specialist (+ site on platform-releases) | live wider |
| **ledger-documents** | **absent from `PERMISSIONS` entirely** | accountant, admin, manager | module has no static row at all |

**Consequence for Agent R:** for every `requirePermission("pricing", …)` route, the gate's
`allowed` must be `["admin","manager","accountant","sales","purchase_specialist"]` — five roles,
not the three the static table names. Getting this wrong denies real salespeople.

---

### (i) The routes with no `beforeLoad` — 24 files, but **22** with no guard anywhere in the chain

The orchestrator's list of 24 reproduces exactly [E]. **Two of them are not actually unguarded:**

- `_app.sales.quotes.index.tsx` and `_app.sales.quotes.$quoteId.tsx` have no `beforeLoad` of
  their own, but their parent route file **exists and guards them** —
  `src/routes/_app.sales.quotes.tsx:4-9` is `createFileRoute("/_app/sales/quotes")({ beforeLoad:
  async () => { await requirePermission("sales","view"); }, component: QuotesLayout })` with
  `QuotesLayout` returning `<Outlet/>`, and `src/routes/_app.sales.tsx:4-8` does the same one
  level up. TanStack runs every matched route's `beforeLoad`. **They belong in class (ii), not
  class (i).**

Ancestry was checked for all 24 by trimming dot-segments and testing for an existing parent file;
only these two, `_app.gamification.leaderboard` (parent `_app.gamification.tsx`, itself
unguarded) and `_app.operations.daily-mood.admin` (parent `_app.operations.daily-mood.tsx`,
itself unguarded) have any parent at all.

| # | Route file | Verdict | **PROOF LINE** (file:line, quoted) | Tier |
|---|---|---|---|---|
| 1 | `_app.admin.marketing-channels.tsx` | **In-component role check, fail-closed.** Not open to `viewer`. | `:48-49` `const { roles } = useAuth();` / `const allowed = roles.includes("admin") \|\| roles.includes("accountant");` — and `:98-104` `if (!allowed) { return (<div …>دسترسی غیرمجاز</div>); }`. `roles` is `[]` while loading ⇒ `allowed` false ⇒ denial. **Caveat:** `:94-96` `useEffect(() => { void load(); }, [debounced])` fires the `marketing_channels` query unconditionally; nothing is rendered, and `mc_select_authed` is `qual=true` so the rows do arrive in the query cache. | 3 (with caveat) |
| 2 | `_app.admin.marketing-task-templates.tsx` | Same shape. | `:104-107` `const { roles } = useAuth();` / `roles.includes("admin") \|\| roles.includes("manager") \|\| roles.includes("accountant")`; denial at `:153` «دسترسی غیرمجاز». Same unconditional-fetch caveat (`marketing_task_templates`, `mtt_select` `qual=true`). | 3 (with caveat) |
| 3 | `_app.admin.receipt-fields.tsx` | Same shape, redirects rather than in-lines. | `:76-77` `const { user, roles } = useAuth();` / `const allowed = roles.includes("admin") \|\| roles.includes("accountant");` and `:108` `if (!allowed) return <Navigate to="/unauthorized" />;`. The `useQuery` at `:93-99` (`payment_receipt_custom_fields`) is a hook and runs before the early return. | 3 (with caveat) |
| 4 | `_app.admin.workflow-stages.tsx` | Same shape. | `:47-48` `const { roles } = useAuth();` / `const allowed = roles.includes("admin") \|\| roles.includes("accountant");`; denial at `:82` «دسترسی غیرمجاز». | 3 (with caveat) |
| 5 | `_app.operations.daily-mood.admin.tsx` | Same shape, permission-based. | `:12-13` `const { roles } = useAuth();` / `const canView = hasPermissionEx(roles, "hr", "view");` and `:17` «دسترسی به این صفحه را ندارید.». Live `hr.can_view` = admin, manager only. | 3 |
| 6 | `_app.gamification.leaderboard.tsx` | **UNGATED. Renders the full employee leaderboard.** | `:11-12` `import { useLeaderboard, useMyRankNeighbors } …` / `useRankTrends`; `:40` `const leaderboard = useLeaderboard(period, 100);` — no role check anywhere in the file. `useAuth()` at `:37` is used only for `isCurrentUser` highlighting (`:99`, `:132`). | **2** |
| 7 | `_app.gamification.tsx` | **Self-only.** | `:81` `const employeeId = user?.id ?? "";` and every query keys off it — `:49` `.eq("employee_id", employeeId)` (`score_snapshots`), `:268` `.eq("employee_id", employeeId)` (`employee_scores`), both `enabled: !!employeeId`. RLS agrees: `employee_scores` / `score_snapshots` policies are `(employee_id = auth.uid()) OR admin OR manager`. | 3 |
| 8 | `_app.market-matches.tsx` | In-component role check; RLS agrees. | `:101-102` `const { roles } = useAuth();` / `const allowed = roles.includes("admin") \|\| roles.includes("manager");` and `:166` «دسترسی غیرمجاز. فقط نقش‌های admin یا manager …». RLS `mpm_admin_manager_select` = `has_role(admin) OR has_role(manager)`, so the data is closed independently. | 3 |
| 9 | `_app.marketing.my-tasks.tsx` | **Self-only.** | `:55` `const userId = user?.id ?? null;` and `:77` `.eq("assigned_to", userId)`. RLS `tasks_select` = `assigned_to = auth.uid() OR created_by = auth.uid() OR admin/manager/accountant`. | 3 |
| 10 | `_app.marketing.suggestions-history.tsx` | In-component check, redirects. | `:52-53` `const { roles } = useAuth();` / `const allowed = roles.includes("admin") \|\| roles.includes("manager");` and `:123` `if (!allowed) return <Navigate to="/unauthorized" />;`. **Caveat:** reads `audit_logs` at `:90` — RLS is admin-only, so a non-admin gets nothing. | 3 |
| 11 | `_app.marketing.suggestions.tsx` | In-component check, redirects, and holds while loading. | `:85` `roles.includes("admin") \|\| roles.includes("manager") \|\| roles.includes("accountant")`; `:145` «در حال آماده‌سازی دسترسی‌ها...» (explicit loading hold); `:151` `if (!allowed) return <Navigate to="/unauthorized" />;`. The best-shaped of the five. | 3 |
| 12 | `_app.my-penalties.tsx` | **Self-only, enforced in the database.** | Route body is 18 lines and renders one component (`:12` `<MyPenaltiesPanel />`); `src/components/penalties/MyPenaltiesPanel.tsx:18` `const { data, isLoading, error } = useMyPenalties();` → `src/hooks/penalties/usePenalties.ts:22` `supabase.rpc("get_user_penalties", {})`, whose body is `v_target := COALESCE(p_user_id, auth.uid());` then `IF v_target <> auth.uid() AND NOT (has_role(admin) OR has_role(manager)) THEN RAISE EXCEPTION 'دسترسی ندارید';`. | 3 |
| 13 | `_app.my-rejected-quotes.tsx` | **Self-only, enforced in the database.** | `:38` `("get_my_rejected_quotes", { p_limit: 50 })`, whose body is `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';` … `WHERE q.status='rejected' AND q.salesperson_id = auth.uid()`. | 3 |
| 14 | `_app.notifications.tsx` | **Self-only, enforced by RLS.** The route sends no user filter. | `:49` `if (!user) return;` is the only client-side scope; the query at `:51-57` has **no** `user_id` predicate. RLS supplies it: `notification_queue \| nq_select_own_or_admin \| SELECT \| ((user_id = auth.uid()) OR has_role(auth.uid(),'admin'))` and `nq_update_own \| UPDATE \| (user_id = auth.uid())`. | 3 |
| 15 | `_app.operations.daily-mood.tsx` | **Self-only.** | 6-line route; `src/components/operations/mood/DailyMoodPage.tsx:33-34` `const { user } = useAuth();` / `const { entry, … } = useDailyMood(user?.id);` and `src/hooks/operations/useDailyMood.ts:20` `if (!userId) return;` `:23` `fetchMyTodayEntry(userId)`. | 3 |
| 16 | `_app.operations.tasks.tsx` | **UNGATED. Renders the whole task board.** | `:210-219` `let q = tasksTable().select("id,title,description,status,priority,assigned_queue,…")` with **no** owner predicate; `:201-202` `const { roles } = useAuth(); const canTick = roles.includes("admin") \|\| roles.includes("accountant");` gates only the completion button, not the list. Data is bounded by RLS `tasks_select` (own + admin/manager/accountant), so a `sales` user sees their own tasks and a `viewer` sees theirs — but the KPI panel calls `get_task_kpi_report` (`:235`) unconditionally. | **2** |
| 17 | `_app.popup-center.tsx` | **Static / browser-local.** No fetch of any kind. | `:5` `import { POPUP_TTL_MS, usePopupCenter } from "@/lib/popups/PopupCenterProvider";` and `:16` `const { items, markSeen, clearAll } = usePopupCenter();`; the provider's only storage is `localStorage` — `PopupCenterProvider.tsx:41` `window.localStorage.getItem(STORAGE_KEY)`, `:54` `window.localStorage.setItem(…)`. Zero `.from(` / `.rpc(` in either file. | 3 |
| 18 | `_app.pricing.attention.tsx` | **UNGATED, and it reads supplier cost prices.** | `:57-65` `useQuery({ queryKey:["attention","stale-stock"], queryFn: () => fetchStaleUnavailableProducts() })` and `…fetchStalePurchasePrices()`; `src/lib/pricing/attention-queries.ts:137-139` `.from("v_latest_active_purchase_prices").select("product_id, purchase_price, currency, effective_at")`. It also renders product-owner employee names (`:41-52` `OwnersCell`). No role check in the file at all. Bounded by RLS: `purchase_prices_select_dynamic_sensitive` = `has_dynamic_permission(uid,'pricing','view_sensitive')`, and **live `pricing.can_view_sensitive` includes `sales` and `purchase_specialist`** — so `sales` does see cost prices here. A pure `viewer` is refused by `viewer_restricted`. | **1** |
| 19 | `_app.pricing.my-workbench.tsx` | **UNGATED. Defaults to self-scope but offers an "all" scope.** | `:93` `const { user, roles } = useAuth();`; `:140-142` `useQuery({ queryKey:["workbench-rows-v2", user?.id, …, showAll, …], enabled: !!user?.id })`; `:185` `const scope = !showAll ? "mine" : filters.ownerId === "none" ? "no-owner" : "all";`; `:531` `ownedOnly={showAll && isPrivileged ? null : user?.id ? { userId: user.id } : null}`. The self-scope is a **client-side default**, not a database constraint. `:330` `hasPermissionEx(roles,"pricing","view")` gates one sub-panel only. | **2** |
| 20 | `_app.sales.quotes.$quoteId.tsx` | **NOT unguarded — reclassify to (ii).** | Parent `src/routes/_app.sales.quotes.tsx:5-7` `beforeLoad: async () => { await requirePermission("sales", "view"); }`. Own body reads `sales_quotes` incl. `final_amount`, `customer_phone` (`:128-131`); RLS `sales_quotes_select` scopes `sales` to `salesperson_id = auth.uid()`. | **1** (money + PII), gate needed |
| 21 | `_app.sales.quotes.index.tsx` | **NOT unguarded — reclassify to (ii).** | Same parent. `:141-143` selects `customer_name, customer_phone, final_amount, …` for a list; `:101` `const isSalesOnly = !isPrivileged && roles.includes("sales");` narrows the client query, RLS enforces it. | **1** (money + PII), gate needed |
| 22 | `public.sale-lists.$listId.tsx` | **Public by design.** Outside `_app`, so `RouteRoleGate` can never reach it. | `:17-22` `createFileRoute("/public/sale-lists/$listId")({ loader: async ({ params }) => …` using `@/lib/public/get-public-sale-list`; `:23-62` emit SEO `head`/JSON-LD pointing at `BRANDING.publicOrigin`. A page that publishes `<meta>` and structured data for search engines is not a page anyone intended to gate. | 3 |
| 23 | `reset-password.tsx` | **Auth flow, no business data.** Outside `_app`. | `:28` `supabase.auth.getSession()`, `:34` `supabase.auth.onAuthStateChange(…)`, `:63` `supabase.auth.updateUser({ password })`, `:72` `supabase.auth.signOut()`. Zero `.from(` / `.rpc(` in the file. | 3 |
| 24 | `unauthorized.tsx` | **Static denial page.** 30 lines, zero `.from(` / `.rpc(`. Gating the "you are not allowed" page would be a loop. | `grep -nE '\.from\(\|\.rpc\('` returns nothing. | 3 |

**Answer to the specific question the brief asked.** Of the five "admin pages with no guard of any
kind", **all five carry an in-component, fail-closed role check** —
`_app.admin.marketing-channels:48-49/98`, `_app.admin.marketing-task-templates:104-107/153`,
`_app.admin.receipt-fields:76-77/108`, `_app.admin.workflow-stages:47-48/82`,
`_app.operations.daily-mood.admin:12-13/17`. **None of them renders an admin control or non-self
data to a cold `viewer`.** That specific halt trigger did **not** fire. The halt fired elsewhere
(see the top of this file).

Their real defect is different and worth one wave-2 line each: the check is hand-rolled per file
rather than declared, and in four of the five the data query fires before the check is evaluated
(React hooks run before an early return). Nothing is *rendered*, but the rows land in the
react-query cache and are visible in devtools. Converting them to `staticData.gate` + `beforeLoad`
fixes both, and is a two-line change per file.

**Genuinely unclassified: none.** Every one of the 24 has a proof line.

---

### (ii) The `requirePermission` class — 72 route files with no client gate

Exposure lines are read from the route body (component, queries, controls), never from the
filename. Live role set is `role_permissions.<module>.<action>` from the table above.

**Four are already covered by inheritance** and need nothing: `_app.bot-api-keys.index`,
`.docs`, `.playground`, `.usage` — the parent `_app.bot-api-keys.tsx:36` gate applies to the whole
subtree via `RouteRoleGate`'s `useMatches()` walk. Effective ungated count in this class: **68**.

| Route | What the page exposes (from the body) | Live role set | Static claim (where it differs) | Tier |
|---|---|---|---|---|
| `_app.pricing.purchase-prices` | Edits **supplier purchase (cost) prices** per product: `.from("purchase_prices")`, `products`, `suppliers`, `price_change_reasons`, `profiles` | `pricing.create` = accountant, admin, manager, purchase_specialist, sales | static: admin, manager, accountant — **misses sales + purchase_specialist** | **1** |
| `_app.sales.credit-customers` | Lists customers with their **open-account credit ceiling** and «معتبر» status | `sales.view` = accountant, admin, manager, sales | static: ALL_ROLES — **static wrongly admits viewer** | **1** |
| `_app.sales_.customers` | Customer directory: name, phone, `audit_logs` trail, credit-profile drawer (`.from("customers")`, `profiles`, `audit_logs`) | `sales.view` = accountant, admin, manager, sales | static: ALL_ROLES (+viewer) | **1** |
| `_app.sales_.customers_.$customerId.edit` | Edits a customer record and its `persons` link | `sales.update` = admin, manager, sales | static: admin, manager, sales — agrees | **1** |
| `_app.sales_.customers_.create` | Creates a customer record | `sales.create` = accountant, admin, manager, sales | static: admin, manager, sales — **misses accountant** | **1** |
| `_app.persons` | Searches the unified person register (`search_visible_persons`) — every natural/legal person in the business | `persons.view` = accountant, admin, manager, sales, viewer | static: ALL_ROLES — agrees | **1** (PII) |
| `_app.persons_.$personId` | One person's full file: identifiers (national id, phones), aliases, merge panel, collision panel, cross-role links | `persons.view` = as above | agrees | **1** (PII) |
| `_app.persons_.$personId_.edit` | Edits a person's identifiers and context links | `persons.update` = admin, manager | agrees | **1** (PII, write) |
| `_app.persons_.create` | Creates a person record | `persons.create` = admin, manager | agrees | **1** (PII, write) |
| `_app.reports` | Business reports: `get_receivables_summary`, `payment_receipts`, `sales_quotes` + five marketing cards | `reports.view` = accountant, admin, manager, purchase_specialist, sales, viewer | static: ALL_ROLES — **misses purchase_specialist** | **1** (money) |
| `_app.pricing.index` | Pricing hub: `pricing_rules`, `products`, `purchase_prices`, `currency_rates`, `sale_lists` | `pricing.view` = accountant, admin, manager, purchase_specialist, sales | static: admin, manager, accountant — **misses sales + purchase_specialist** | **2** |
| `_app.pricing.calculator` | Per-product price computation test bench (`products`, `purchase_prices`) | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.live-price-list` | Live sale-price list with history drawer, price alerts, stock alerts (`product_computed_prices_public`, `product_sale_price_history`, `price_calculation_snapshots`) | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.rules` | Pricing rule CRUD (`pricing_rules`) — the margin formulas | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.currency-rates` | Currency rate review: approve/reject fetched rates (`approve_currency_fetch`, `reject_currency_fetch`) — a **destructive control** that moves every computed price | `pricing.view` (5 roles) | same divergence | **1** |
| `_app.pricing.currency-sources` | Currency source CRUD + `record_currency_fetch` | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.currencies` | Currency master data | `pricing.view` (5 roles) | same divergence | **3** |
| `_app.pricing.change-reasons` | Price-change reason master data | `pricing.view` (5 roles) | same divergence | **3** |
| `_app.pricing.sale-price-types` | Sale-price-type master data + `generate_sale_price_type_code` | `pricing.view` (5 roles) | same divergence | **3** |
| `_app.pricing.shipping-rules` | Shipping cost rules per brand/category | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.owner-attention` | Report of which product owner has not attended to which product | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.amin-hozoor-board` | A price board component (`AminHozoorPriceBoard`) | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.sale-lists` | Sale-list index | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.sale-lists_.$listId` | One sale list with items, versions, computed prices, `refresh_sale_list_prices` | `pricing.view` (5 roles) | same divergence | **2** |
| `_app.pricing.sale-lists_.new` | Creates a sale list from products + price history | `pricing.create` (5 roles) | static: admin, manager, accountant | **2** |
| `_app.pricing.sale-lists_.$listId.publish` | **Publishes a price list to recipients** (`publish_recipients_view`, `audit_logs`) — outbound, irreversible | `pricing.update` (5 roles) | static: admin, manager, accountant | **1** |
| `_app.pricing.recompute-prices` | **Batch republish of sale prices** (`v_pricing_recompute_queue_summary`) — moves every price at once | `pricing.update` (5 roles) | static: admin, manager, accountant | **1** |
| `_app.pricing.market-rates-workshop` | Records and re-statuses FX/gold market ticks (`record_market_rate_tick`, `market_rate_ticks`) — feeds product pricing | `market-rates.view` = accountant, admin, manager, sales | static: admin, manager, accountant, sales — agrees | **1** |
| `_app.sales.quotes.index` *(from (i))* | List of pre-invoices: customer name, phone, `final_amount`, accounting markers | `sales.view` (4 roles) | static: ALL_ROLES (+viewer) | **1** |
| `_app.sales.quotes.$quoteId` *(from (i))* | One pre-invoice in full: amounts, discount, deposit, commitment, visitor, salesperson | `sales.view` (4 roles) | static: ALL_ROLES (+viewer) | **1** |
| `_app.sales.quotes` *(layout)* | `<Outlet/>` only — but **gating this one file gates the whole `/sales/quotes` subtree** | `sales.view` (4 roles) | static: ALL_ROLES | **1** (highest leverage in the class) |
| `_app.sales` *(layout)* | `<Outlet/>` only — gates the entire `/sales` subtree | `sales.view` (4 roles) | static: ALL_ROLES | **1** (highest leverage) |
| `_app.sales.quote-share-logs` | Who sent which pre-invoice to whom and when (`sales_quote_share_logs`, `sales_quote_send_queue`, `sales_quotes`, `profiles`) | `sales.view` (4 roles) | static: ALL_ROLES | **2** |
| `_app.sales.send-queue` | The outbound pre-invoice queue with claim/requeue/unlock controls (`claim_next_quote_send_queue_item`, `requeue_failed_quote_send_item`, `release_stale_quote_send_locks`) | `sales.view` (4 roles) | static: ALL_ROLES | **2** |
| `_app.sales.stock-alerts` | Customer stock-availability requests with requester identity (`stock_alert_requests`, `profiles`) | `sales.view` (4 roles) | static: ALL_ROLES | **2** |
| `_app.sales.search` | Fast product search for selling, with price-history drawer and price-change badges | `sales.view` (4 roles) | static: ALL_ROLES | **2** |
| `_app.sales.index` | The `/sales` landing card grid | `sales.view` (4 roles) | static: ALL_ROLES | **3** |
| `_app.sales_.customers_.credit-allocation-guide` | Static explainer component (`CustomerCreditGuide`), no query | `sales.view` (4 roles) | static: ALL_ROLES | **3** |
| `_app.sales_.customers_.credit-training` | Same static explainer | `sales.view` (4 roles) | static: ALL_ROLES | **3** |
| `_app.suppliers` | Supplier directory with an approval control | `suppliers.view` = accountant, admin, manager, purchase_specialist, sales | static: admin, manager, accountant — **misses sales + purchase_specialist** | **2** |
| `_app.suppliers_.$supplierId` | One supplier plus its `person_identifiers` and cross-role links | `suppliers.view` (5 roles) | same divergence | **2** (PII) |
| `_app.purchase` | Purchase-request space: raise a request, work assigned ones | `purchases.view` = accountant, admin, manager, purchase_specialist, sales | static: + viewer — **static wrongly admits viewer** | **2** |
| `_app.purchases` | Purchase module landing (RoleGuard-wrapped sections) | `purchases.view` (5 roles) | same | **2** |
| `_app.purchases_.create` | Registers a standalone purchase document | `purchases.create` = admin, manager | static: admin, manager — agrees | **2** |
| `_app.products.index` | Product catalogue with computed prices, images, labels, timeline | `products.view` = accountant, admin, manager, purchase_specialist, sales, site | static: ALL+ps — **static admits viewer, live does not; live adds site** | **2** |
| `_app.products.$id` | One product: attributes, owners, stats, timeline, publish-prices card, ad-copy generator, warehouse stock | `products.view` (6 roles) | same divergence | **2** |
| `_app.products.attributes` | Product attribute/group master data + `audit_logs` | `products.view` (6 roles) | same | **2** |
| `_app.products.brands` | Brand master data | `products.view` (6 roles) | same | **3** |
| `_app.products.categories` | Category master data | `products.view` (6 roles) | same | **3** |
| `_app.products.labels` | Product label master data + `audit_logs` | `products.view` (6 roles) | same | **3** |
| `_app.products.new` | Creates a product | `products.create` = admin, manager, site | static: admin, manager | **2** |
| `_app.products.regenerate-names` | **Bulk-rewrites product names** by category — a destructive batch control | `products.update` = accountant, admin, manager | static: admin, manager — **misses accountant** | **1** |
| `_app.data-tables.index` | Index of user-defined dynamic tables (arbitrary business content) | `data-tables.view` = accountant, admin, manager, purchase_specialist, sales, site | static: admin, manager, accountant, viewer — **live drops viewer, adds three** | **2** |
| `_app.data-tables.$tableId` | One dynamic table: read, edit cells, add/reorder columns, export, deactivate rows | `data-tables.view` (6 roles) | same divergence | **2** |
| `_app.data-tables.new` | Creates a dynamic table and its columns | `data-tables.create` = admin, manager, site | static: admin, manager | **2** |
| `_app.dashboard` | KPI grid, sales chart, my-score card, recent activity, news ticker; fires `generate_birthday_notifications` | `dashboard.view` = 6 roles incl. viewer | static: ALL+ps — agrees | **2** |
| `_app.gamification.achievements` | The badge wall (`AchievementCard`, `useGamification`) | `dashboard.view` (6 roles) | agrees | **3** |
| `_app.messages` | Internal messenger: conversation sidebar + chat window | `messages.view` = 6 roles incl. viewer | static: ALL+ps — agrees | **2** |
| `_app.messages.inquiries` | All price inquiries (`useAllInquiries`) plus own | `messages.view` (6 roles) | agrees | **2** |
| `_app.collaboration` | Collaboration hub counts (`useHubCounts`) | `messages.view` (6 roles) | agrees | **3** |
| `_app.knowledge` | Organisational knowledge index + AI ask box | `knowledge.view` = 6 roles incl. viewer | static: ALL_ROLES — **misses purchase_specialist** | **2** |
| `_app.knowledge_.$documentId` | One knowledge document + read confirmations + `audit_logs` | `knowledge.view` (6 roles) | same | **2** |
| `_app.feedback` | Feedback/improvement register | `feedback.view` = 6 roles incl. viewer | static: ALL_ROLES — misses ps | **3** |
| `_app.feedback_.$feedbackId` | One feedback item with its audit trail | `feedback.view` (6 roles) | same | **3** |
| `_app.feedback_.create` | Submits feedback | `feedback.create` = 6 roles incl. viewer | same | **3** |
| `_app.academy` | Course index with own progress | `academy.view` = 6 roles incl. viewer | static: ALL_ROLES — misses ps | **3** |
| `_app.academy_.$courseId` | One course, its lessons and quizzes | `academy.view` (6 roles) | same | **3** |
| `_app.academy_.$courseId_.$lessonId` | One lesson, marks own progress, writes `audit_logs` | `academy.view` (6 roles) | same | **3** |
| `_app.academy_.$courseId_.$lessonId_.quiz` | Takes a quiz (`submit_quiz_attempt`) | `academy.view` (6 roles) | same | **3** |
| `_app.updates` | Published release notes (`PlatformReleaseList`) | `platform-releases.view` = all 7 roles | static: ALL_ROLES — misses ps + site | **3** |
| `_app.bot-api-keys.index` *(inherited gate)* | **Bot API key management**: create, deactivate, table/label access grants, per-key stats | `bot-api-keys.view` = admin, manager, site | static: admin, manager — **misses site** | 1 — **already gated** |
| `_app.bot-api-keys.docs` *(inherited)* | API docs + live test against the key's tables | same | same | 1 — already gated |
| `_app.bot-api-keys.playground` *(inherited)* | API playground | same | same | 1 — already gated |
| `_app.bot-api-keys.usage` *(inherited)* | Bot usage logs and suspicious-IP report | same | same | 1 — already gated |

### (iii) The `requireAnyRole` class — 42 route files with no client gate

The allowed set is declarable straight from the call, so these are the cheap wins: the gate is
literally the same array.

| Route | What the page exposes | `requireAnyRole([...])` — copy this into the gate | Live `role_permissions` where the route also maps to a module | Tier |
|---|---|---|---|---|
| `_app.sales_.customers_.$customerId.credit` | **One customer's credit ceiling, allocation and full dynamic scoring** (`customers`, `customer_capital_allocations_dynamic`, `dynamic_entity_scores`, `calculate_dynamic_score`) | `["admin","manager","accountant"]` | `sales.view` = accountant, admin, manager, sales | **1 — HALT ROUTE** |
| `_app.sales.credit-rules` | **The credit scoring rulebook**: `dynamic_scoring_parameters`, `dynamic_parameter_weights` | `["admin","accountant"]` | `sales.view` (4 roles) | **1 — HALT ROUTE** |
| `_app.admin.asan-import` | Imports persons/products from the Asan accounting system: batches, classify, commit, revert (`asan_commit_person_batch`, `persons`) | `["admin","accountant"]` | `asan-import.view` = accountant, admin | **1** |
| `_app.admin.asan-export` | Assigns document numbers and exports accounting documents (`asan_assign_document_numbers`) | `["admin","accountant"]` | `asan-export.view` = accountant, admin | **1** |
| `_app.persons_.merge` | **Merges two person records** (`person_merge`, `person_merge_dismiss`) — irreversible, cascades across every person FK | `["admin","manager"]` | `persons.view` = 5 roles | **1** |
| `_app.pricing.market-intelligence` | Market index, demand growth, emerging products, hot brands — built from `market_rate_ticks`, `product_computed_prices_public` and **`purchase_prices`** | `["admin","manager","accountant"]` | `pricing.view` = 5 roles (incl. sales) | **1** |
| `_app.admin.delivery-receipts` | **Approves/rejects delivery receipts** (`DeliveryReceiptReviewActions`) | `["admin","manager"]` | — | **1** |
| `_app.admin.documents` | **Approves/rejects accounting documents** (`DocumentReviewActions`) | `["admin","manager"]` | `ledger-documents.view` = accountant, admin, manager | **1** |
| `_app.admin.penalties` | HR disciplinary records: creates «کارت قرمز» against named staff, reviews appeals | `["admin","manager"]` | `hr.view` = admin, manager | **1** (PII) |
| `_app.admin.visitors` | Visitor (field-agent) register + `audit_logs` | `["admin","manager"]` | — | **2** (PII) |
| `_app.admin.phone-collisions` | Phone-number collisions across persons (`detect_phone_collisions`, `phone_collisions`) | `["admin","manager"]` | `persons.view` = 5 roles | **1** (PII) |
| `_app.sales.quotes.new` | **Creates a pre-invoice**: customer credit check (`get_customer_dynamic_credit`), `expire_stale_credit_holds`, settlement types, warehouse pick | `ALLOWED_ROLES` = `["admin","manager","sales"]` (`:61`) | `sales.create` = accountant, admin, manager, sales | **1** |
| `_app.pricing.settlement-types` | Settlement-type master data (drives credit terms) | `ALLOWED` = `["admin","accountant"]` (`:21`) | `pricing.view` = 5 roles | **2** |
| `_app.pricing.quick-price` | Quick price calculation by category | `ALLOWED_ROLES` = `["admin","manager","accountant","sales"]` (`:29`) | `pricing.view` = 5 roles | **2** |
| `_app.pricing.price-alerts` | Own price-alert subscriptions | `["admin","manager","accountant","sales"]` | `pricing.view` = 5 roles | **3** |
| `_app.pricing.product-recommendations` | Product recommendation overrides | `["admin","manager"]` | `pricing.view` = 5 roles | **2** |
| `_app.admin.workflow-settings` | Workflow timers, roles and penalty switches (`WorkflowSettingsTable` → `update_workflow_setting`) | `["admin","manager"]` | — | **2** |
| `_app.admin.validation-rules` | Data-validation standards (`validation_rules`) | `["admin"]` | — | **2** |
| `_app.admin.automation` | Automation/bot job register (`automation_jobs`) | `["admin","manager"]` | — | **2** |
| `_app.admin.sales-reminders` | Sales-search reminder configuration | `["admin","manager"]` | — | **3** |
| `_app.admin.purchase` | Purchase administration: default assignee, receipt uploader, status actions | `["admin","manager"]` | `purchases.view` = 5 roles | **2** |
| `_app.warehouses` | Warehouse master data | `["admin","manager"]` | `warehouse.view` = 5 roles | **2** |
| `_app.warehouses_.transfers` | **Inter-warehouse stock transfers** (creates movement documents) | `["admin","manager"]` | `warehouse.view` = 5 roles | **2** |
| `_app.warehouses_.kardex` | Stock in/out ledger per product | `["admin","manager","accountant","purchase_specialist"]` | `warehouse.view` = 5 roles | **2** |
| `_app.sales.product-videos` | Product-video chain: advance stage, mark uploaded | `["admin","manager","sales","accountant"]` | `product-videos.view` = accountant, admin, manager, sales | **3** |
| `_app.sales.promotion-nominations` | Nominates products for promotion | `["sales","admin","manager"]` | `sales.view` = 4 roles | **3** |
| `_app.knowledge_.manage` | Creates/edits knowledge documents + `audit_logs` | `["admin","manager"]` | `knowledge.create` = admin, manager | **2** |
| `_app.academy_.manage` | Course/lesson/quiz authoring + `audit_logs` | `["admin","manager"]` | `academy.create` = admin, manager | **2** |
| `_app.delivery-receipts` | Own delivery-receipt uploads + pending panel | `ALL_ROLES` = the five fixed system roles | — | **3** |
| `_app.documents` | Own document uploads + pending panel | `ALL_ROLES` | `ledger-documents.view` = accountant, admin, manager | **3** |
| `_app.gamification.admin.index` | Gamification admin hub | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.achievements` | Badge/medal administration | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.analytics` | Gamification analytics over a date range | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.kpi-rules` | **KPI/XP rule engine** — the weights that decide every employee score | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.leagues` | League/season administration (`start_league_season`, `settle_league_season`) | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.missions` | Mission administration | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.rewards` | Reward administration | `["admin","manager"]` | — | **2** |
| `_app.gamification.admin.manual-metrics` | **Hand-enters each staff member's daily performance** (`staff_daily_performance_metrics`, `profiles`, `shop_settings`) — the sole input to every employee score | `["admin","manager","accountant"]` | `hr.view` = admin, manager | **2** |
| `_app.gamification.admin.purchase-settings` | Purchase-score settings (`shop_settings`) | `["admin","manager","accountant"]` | — | **3** |
| `_app.gamification_.admin_.manual-metrics_.guide` | Static explainer component | `["admin","manager","accountant"]` | — | **3** |
| `_app.gamification.settings` | Gamification engine settings (`profiles`) | `["admin"]` | — | **2** |
| `_app.gamification.league` | League standings | `["admin","manager","sales","accountant","viewer"]` | — | **3** |

### (iv) The `requireAdmin` class — 11 route files with no client gate

Not one of the three classes the brief named, but it is 11 of the 125 and belongs in the census.
Every one takes `gate: { kind: "admin" }` verbatim — the cheapest fix in the wave.

| Route | What the page exposes | Data reachable to a non-admin? | Tier |
|---|---|---|---|
| `_app.roles` | Assigns and revokes roles (`assign_user_role_txt`, `revoke_user_role_txt`, `user_roles`, `profiles`) | **No** — `user_roles` PERMISSIVE policies are `admins read all roles` and `users read own roles` only. Page chrome renders empty. | **1** |
| `_app.users` | User administration: approve, reject, deactivate pending users (`approve_pending_user`, `deactivate_user`, `reject_pending_user`) | **No** — `profiles` is `admins read all profiles` OR `auth.uid() = id`. | **1** |
| `_app.users.$userId` | One user's profile, roles and dynamic scoring section | **No** (same policies) — **except** the embedded `DynamicScoringSection`, which reads `dynamic_entity_scores` (`qual = true`). See halt condition. | **1** |
| `_app.audit-logs` | The full audit trail (`audit_logs`, `profiles`) | **No** — `admins read audit logs` is the only SELECT policy. | **1** |
| `_app.admin.ai-providers` | **AI provider configuration incl. key prefix and secret reference** (`admin_upsert_ai_provider`, `admin_delete_ai_provider`) | **No** — `ai_providers_admin_read` = `has_role(auth.uid(),'admin')`. Note the table stores `secret_id` + `key_prefix`, not the key. | **1** |
| `_app.admin.settings` | Shop settings CRUD + `audit_logs` | **Partly** — `shop_settings_read_authed` is `qual = true`, so any non-viewer-only role can read every setting row via PostgREST; only writes are admin-gated. | **2** |
| `_app.admin.payment-terms` | Settlement/payment term master data + `audit_logs` | **Partly** — `payment_terms_select_authed` is `qual = true`. | **2** |
| `_app.operations.didar` | Didar CRM integration: import log, activity sync, `customers`, `employee_score_events`, `shop_settings` | Mixed — `customers` is role-scoped, `shop_settings` is `qual = true` | **2** |
| `_app.admin.platform-releases` | Drafts, publishes and archives release notes (`publish_platform_release`, `archive_platform_release`) | — | **2** |
| `_app.admin.profile-fields` | Dynamic user-profile field definitions | — | **2** |
| `_app.admin.recent-purchase-settings` | Stock-status-after-purchase settings | — | **3** |

### Tier rollup

Population: the **125 ungated guarded routes** (72 + 42 + 11) **plus the 22** genuinely unguarded
ones from (i) **plus the 2** `sales.quotes` leaves that inherit a guard but carry no gate —
**149 route files**. Every row in the four tables above is counted exactly once; the two
`sales.quotes` rows appear in both (i) and (ii) for readability and are counted only in (ii).

| Tier | (i) unguarded | (ii) requirePermission | (iii) requireAnyRole | (iv) requireAdmin | **total** |
|---|---|---|---|---|---|
| **1 — sensitive** (money, credit, roles, keys, PII, destructive) | 1 | 23 (of which **4 already gated** by inheritance) | 11 | 5 | **40 (36 needing a gate)** |
| **2 — operational** | 3 | 32 | 22 | 5 | **62** |
| **3 — accepted** | 18 | 19 | 9 | 1 | **47** |
| **files** | **22** | **74** | **42** | **11** | **149** |

**36 tier-1 routes carry no client-side gate.** Two of them (`_app.sales.tsx` and
`_app.sales.quotes.tsx`) are layout routes, so gating those two files alone closes eight
tier-1/tier-2 leaves by inheritance — the highest-leverage two lines available to Agent R.

---

## Handed-forward backlog — build-brief ready

Everything above is already in the required shape (route · exposure line · live role set · tier),
so the backlog is a selection, not a second document. Recommended ordering for Agent R, and what
must be handed forward if it is not reached.

**Do this wave — tier 1, 36 routes, one line each.** Use `staticData: { gate: { kind: "anyRole",
allowed: [...] } }` mirroring the **live** set from the table in §"live `role_permissions`", or
`{ kind: "admin" }` for the (iv) class. Take the two layout routes first
(`_app.sales.tsx`, `_app.sales.quotes.tsx`) — one line each, eight leaves closed.

**The five `pricing` gates need the five-role live set** — `["admin","manager","accountant",
"sales","purchase_specialist"]`. Copying `roles.ts` here produces a three-role gate that denies
every salesperson. This is the single most likely mistake in Group B.

**Hand forward if not reached, with everything the next wave needs already written:**

| Bucket | Count | Where the rows are | What the next wave still has to do |
|---|---|---|---|
| Tier 2 routes, all four classes | 62 | tables (i)–(iv) above, each with exposure line + live role set | add one `staticData.gate` line per route |
| Tier 3 routes | 43 | same tables | decide gate-exempt vs gate; 18 of the 22 in class (i) are already argued exempt with a proof line |
| The four hand-rolled in-component checks | 4 | (i) rows 1–4 | convert `roles.includes(...)` + early-return into `staticData.gate` + `beforeLoad`, which also stops the pre-check query firing |
| **The `qual = true` RLS family** | **36 policies on 36 tables** | §"RLS observations" below | decide per table whether "any authenticated user" is the intended audience |
| The static-permission-table divergences | 13 modules | §"Static-table divergences" | **explicitly out of scope this wave** by CONTRACTS decision 3 |
| The three inverted `_system` guards | 3 functions | A-1 §5 | rewrite the guard to test for the service role positively, instead of testing for the absence of a uid |
| The four `bot_*` key-id writers | 4 functions | A-1 §4 | revoke `anon` + `PUBLIC`; add an `is_active` / `expires_at` check inside the body |

### RLS observations that belong to Group C/D rather than Group B

Thirty-six PERMISSIVE `SELECT` (or `ALL`) policies in `public` have `qual = true` for
`authenticated`. Measured:

```
$ ... -c "SELECT count(*), count(distinct tablename) FROM pg_policies
   WHERE schemaname='public' AND permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL')
     AND btrim(coalesce(qual,''))='true' AND roles::text ~ 'authenticated';"
36|36
```

Twenty-four of the 36 have **no** RESTRICTIVE policy at all, so even a pure `viewer` reads them:
`category_product_attributes, category_required_services, currencies, currency_rate_fetches,
daily_mood_hafez_poems, daily_mood_questions, daily_mood_scenarios, dashboard_ticker_events,
employee_leagues, employee_profiles, gamification_kpis, invoice_workflow_stages, league_seasons,
marketing_channels, marketing_task_templates, payment_receipt_custom_fields, payment_terms,
product_attribute_groups, product_attributes, product_service_types, sale_price_types,
score_level_thresholds, validation_rules, workflow_settings`.

Most are reference data and defensible. **Three are not, and they are the halt condition:**
`dynamic_entity_scores`, `dynamic_scoring_parameters`, `dynamic_parameter_weights`. Two more
deserve an owner decision: `daily_capital_settings` (the capital pool figure) and `shop_settings`
(includes `accountant_daily_interest_rate`).

Also noted, and **by design rather than a defect**: `role_permissions` and `custom_roles` are
`qual = true` readable, which is necessary — `loadRolePermissions()` runs for every signed-in
user to build the menu. Recording it so the next reader does not re-raise it.

---

## Contradictions with prior art

1. **"anon = 71 may be a grant artifact."** [P, wave-4 CONTRACTS §5: *"It may be an artifact of
   default `=X/supabase_admin` PUBLIC grants on internal helpers rather than genuine API
   reachability — establish which, and say so."*] · **[E] Refuted.** 70 of 71 carry an explicit
   `anon=X/supabase_admin`; the remaining one is reachable through the PUBLIC grant anyway; the
   whole PostgREST chain (exposed schema, `SET ROLE` membership, schema USAGE, named args, no
   overload ambiguity, non-trigger return type) holds for all 71. **Artifact count: 0.**

2. **"The three inverted guards are `start_/finish_/record_external_market_rate_tick_system`."**
   [Agent A's own brief, and Agent S's wave-4 report] · **[E] Two of three names do not exist.**
   The real names are `start_market_rate_ingestion_run_system`,
   `finish_market_rate_ingestion_run_system`, `record_external_market_rate_tick_system` — which is
   exactly the correction wave 4's verifier already published [P §3]. The wrong names have now
   survived into a second wave's brief; this is the third recorded citation of them.

3. **"Six non-`_system` siblings … appear to carry checks but the hardening did not extend to
   them."** [P, wave-4 §3] · **[E] Half right.** The grants were indeed not extended — all six are
   still `anon = t`. But the bodies genuinely refuse: each opens `IF v_uid IS NULL THEN RAISE`
   followed by an admin/manager/accountant `has_role` test. They are safe today for the reason
   the sentence doubts.

4. **"Whether the four `bot_*` anon-reachable writers authenticate by API key. Assumed, not
   proven."** [P, wave-4 §9.4] · **[E] Now proven, and the assumption was wrong.** They
   authenticate by API-key **id**, passed as an ordinary argument, with no hash check and no
   `is_active`/`expires_at` test. The function that does check the key, `bot_authenticate_key`, is
   `anon = f` and is bypassed entirely when the downstream function is called directly.

5. **"149 route files call one of the three guards; 19 carry `staticData`."**
   [`e2e/security/s5-guarded-admin-routes-carry-a-client-gate.spec.ts:39`] · **[E] Both numbers are
   wrong now.** 148 call a guard; 23 carry `staticData`. The 149 is a bare-substring count that
   sweeps in three files which only *mention* a guard in a comment; the 19 predates four
   `staticData` additions. **Agent R owns this file — the header needs both numbers corrected.**

6. **"`requireAnyRole`/`requirePermission`/`requireAdmin` each contain `if (auth.rolesLoading ||
   …) return`, and a guard that RETURNS is a guard that PASSED."** [P, same spec header, and
   `RouteRoleGate.tsx`'s header] · **[E] No longer true on `staging`.** That line is gone;
   `settleRoles()` awaits and all three guards refuse on an unsettled snapshot
   (`route-guards.ts:126, 160, 194`). Only the **SSR** fail-open remains
   (`:15`, `:114`, `:151`, `:185`). Both header comments now describe a fixed bug as if it were
   live, which will mislead the next reader into thinking client navigation is unsafe.

7. **"The 24 routes with no `beforeLoad` at all."** [orchestrator, CONTRACTS §2] · **[E] The file
   list is exactly right; the inference is off by two.** `_app.sales.quotes.index.tsx` and
   `_app.sales.quotes.$quoteId.tsx` inherit `requirePermission("sales","view")` from
   `_app.sales.quotes.tsx:5-7` and `_app.sales.tsx:5-7`. The true no-guard-anywhere count is
   **22**.

8. **"Five admin pages with no guard of any kind … if any renders an admin control or non-self
   data to a cold `viewer`, report it as the halt-condition finding."** [brief] · **[E] None of
   the five does.** All five carry a fail-closed in-component role check; line numbers in (i)
   rows 1–5. The halt fired on a different route entirely.

---

## Coverage · UNVERIFIED / UNKNOWN

**Reached and evidenced**
- A-1 in full: the 71 re-derived, split by grant kind, REST reachability established end-to-end
  from config and catalogue, every one of the 71 bodies read, the three `_system` guards quoted
  and their ACLs read.
- A-2 in full: authoritative denominator + all three competing numbers explained; all 24
  class-(i) routes with a proof line each; all 72 class-(ii), 42 class-(iii) and 11 class-(iv)
  routes with an exposure line, live role set and tier; the live `role_permissions` table; the
  static-table divergence list; the tier rollup.

**UNVERIFIED — could not be established read-only, and I did not guess**
1. **[?] Browser confirmation of the halt.** I did not open a cold `sales` session against
   `/sales/customers/<id>/credit`. The finding is composed from `pg_policies` + `is_viewer_only`'s
   body + the route file + wave-4's measured cold-load mechanism. Every link is quoted, but the
   end-to-end render was not observed. **Remaining manual step**, and it is the first thing Agent R
   should reproduce with the `og-bot-api-keys-cold-gate.spec.ts:35-37` pattern.
2. **[?] Whether any `bot_api_key_table_access.api_key_id` has ever leaked.** There is no access
   log that would answer it. The capability is unguessable in principle; whether it has been
   disclosed in a URL, a log line or a screenshot is not knowable from here.
3. **[?] Whether the 63 role-checked anon writers refuse *at the HTTP layer*.** Establishing it
   would mean POSTing to `/rpc/<name>` as `anon`, which is calling a function. Refused by rule 1.
   The static case is complete: explicit grant, `EXISTS`-based non-strict role helper, guard as the
   first executable statement.
4. **[?] Tier assignments for routes whose content lives entirely in an imported component.** For
   ~15 routes the exposure line was read from the imported component's name plus the route's own
   `PageHeader title=` and its `.from(`/`.rpc(` set, not from the component body. Named examples:
   `_app.gamification.admin.{missions,rewards,achievements}`, `_app.admin.automation`,
   `_app.pricing.amin-hozoor-board`, `_app.collaboration`. Each tier is a judgement on a partial
   read; none of them is tier 1, so none blocks this wave.
5. **[?] Whether the four `staticData` files added since the s5 spec was written are correct
   gates.** I confirmed they exist and quoted their `gate:` values; I did not verify each `allowed`
   array against the live table beyond `/bot-api-keys` (which is correct, `site` included).
6. **[?] The 21 `.ts` files in `src/routes/`.** Excluded from every count in this document by
   definition — they are API/server routes, not page routes, and `RouteRoleGate` cannot apply to
   them. **They have not been audited by anyone**, and four of them are the bot public API
   (`api.public.bot.*`). That is a gap somebody should own; it is not in my two rows.

**Nothing blocks Group C or Group D.** A-1 hands Group F a complete, verified target list.
**Group B is blocked in one narrow sense only:** gating the two halt routes hides the pages but
does not close the PostgREST path to `dynamic_entity_scores`. That fix is a migration, so it
belongs to Group C/F, and the two groups have to land together or the halt is only half closed.

---

Both rows were reached in full. The one thing a read-only agent could not do — observe the halt
in a browser — is named as UNVERIFIED above rather than implied, together with five other gaps.

**COMPLETE**
