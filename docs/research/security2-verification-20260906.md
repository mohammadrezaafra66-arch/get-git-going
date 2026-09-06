# Security wave 2 — independent verification (Agent V), 2026-09-06

Re-derived from scratch against the live `afrakala` database, the deployed app at
`192.168.170.8:3100`, and the merged source at `origin/staging` @ `128b2bae`.
No builder report, no `CONTRACTS.md`, no agent findings file was read.
Nothing was changed: every behavioural probe ran inside `BEGIN … ROLLBACK`, every
catalogue query under `PGOPTIONS="-c default_transaction_read_only=on"`, and no
function was called in order to test it.

**Deployed-SHA precondition — PASSED.**

```
$ git rev-parse --short HEAD               # worktree, branch verify/security2
128b2bae
$ git rev-parse --short origin/staging
128b2bae
$ docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
APP_GIT_SHA=128b2bae
APP_BUILD_TIME=2026-09-06T07:52:32.6153294+05:00
```

Every browser measurement below is therefore against the code being verified.

---

## Verdict

**The four halt/group rows the wave set out to close are genuinely closed, and I could
reproduce every one of them independently.** Sales can no longer read the credit-scoring
tables and the accountant still can (150/16/16 rows); the four `bot_*` writers are shut to
`anon` and to `PUBLIC` and now validate the key's `is_active`/`expires_at` before touching
the access table; the three market-rate ingest RPCs carry a *positive* service-role test that
I proved refuses a caller with no JWT at all (the exact NULL trap the naive form falls into);
`ai_usage_routes` and `ai_providers` write a full before/after audit row on INSERT, UPDATE and
DELETE with the credential fields stripped. All three baselines reproduce exactly: 70
typecheck errors in the six named files, 259 passed / 1 failed in `e2e/security/` with
`rule12` naming only the pre-existing offender, and 646 migrations on disk = 646 ledger rows.
The cold-session matrix is clean on every gated route I tested — 25 of 25 cells correct across
viewer/sales/accountant/manager/admin, including the five-role `pricing` check, where a cold
`sales` and a cold `accountant` both reach `/pricing/attention`, `/pricing/purchase-prices`
and `/pricing/recompute-prices` while a cold `viewer` is refused at all three.

**What is not closed is the other 86 routes.** The wave gated 63 of the 149 guarded route
files. The SSR fail-open that made the gates necessary is still live everywhere a gate is
absent, and I measured it: a **cold `viewer` fully renders `/admin/automation`** (guard:
`requireAnyRole(["admin","manager"])`), **`/data-tables`** (`data-tables.view`, which the live
table denies `viewer`) and **`/pricing/currency-sources`** (`pricing.view`, also denied to
`viewer`). That is the same class of defect the wave was called to fix, on routes the wave
declared tier 2 and deferred. It is a scoping decision, not a regression — but "wave 2 closed
the cold-session hole" is not a true sentence, and the row-by-row claims should not be read as
one. Separately, and outside anything the wave looked at, `public.ai_get_provider_key(uuid)`
is `SECURITY DEFINER`, holds an explicit `anon=X` grant, consults **no caller identity at
all**, and returns `vault.decrypted_secrets.decrypted_secret` — the AI provider's API key —
for any active provider whose uuid the caller knows. That is a credential-disclosure path that
no row in this wave covers, because every derived query in `og61` filters to *writers*.

---

## The 12 rows

### H-1 — sales can no longer read the credit-scoring tables — **VERIFIED**

Policies (`pg_policies`, nothing executed):

```
$ docker exec -u postgres -e PGOPTIONS="-c default_transaction_read_only=on" afrakala-lan-db \
  psql -d afrakala -At -F'|' -c "select tablename, policyname, cmd, roles::text, coalesce(qual,'-'), coalesce(with_check,'-') from pg_policies where schemaname='public' and tablename in ('dynamic_entity_scores','dynamic_scoring_parameters','dynamic_parameter_weights') order by tablename, policyname;"

dynamic_entity_scores|dyn_scores_read_authenticated|SELECT|{authenticated}|has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])|-
dynamic_entity_scores|dyn_scores_write_admin_accountant|ALL|{authenticated}|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text))|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'accountant'::text))
dynamic_entity_scores|viewer_restricted|ALL|{authenticated}|(NOT is_viewer_only(auth.uid()))|(NOT is_viewer_only(auth.uid()))
dynamic_parameter_weights|dyn_param_weights_admin_write|ALL|{authenticated}|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))
dynamic_parameter_weights|dyn_param_weights_read_authenticated|SELECT|{authenticated}|has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])|-
dynamic_parameter_weights|viewer_restricted|ALL|{authenticated}|(NOT is_viewer_only(auth.uid()))|(NOT is_viewer_only(auth.uid()))
dynamic_scoring_parameters|dyn_scoring_params_admin_write|ALL|{authenticated}|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))|(has_role(auth.uid(), 'admin'::text) OR has_role(auth.uid(), 'manager'::text))
dynamic_scoring_parameters|dyn_scoring_params_read_authenticated|SELECT|{authenticated}|has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text])|-
dynamic_scoring_parameters|viewer_restricted|ALL|{authenticated}|(NOT is_viewer_only(auth.uid()))|(NOT is_viewer_only(auth.uid()))
```

`sales` appears in no `SELECT` policy; the write policies and `viewer_restricted` are all
present. RLS is enabled on all three (`relrowsecurity = t`).

Behavioural proof, simulated JWTs for a **sales-only**, an **accountant-only** and a
**viewer-only** user (uuids selected by subquery so none is printed), each inside
`BEGIN … ROLLBACK` under the read-only transaction option:

```
BEGIN
t
SET
sales_scores|0
sales_params|0
sales_weights|0
ROLLBACK
BEGIN
t
SET
acct_scores|150
acct_params|16
acct_weights|16
ROLLBACK
BEGIN
t
SET
viewer_scores|0
ROLLBACK
superuser_total_scores|150
superuser_total_params|16
superuser_total_weights|16
```

Sales sees 0 of 150 / 0 of 16 / 0 of 16. The accountant sees **all** of them — the fix did not
blind the legitimate reader, which was the failure mode to watch for.

### H-2 — the four `bot_*` writers are unreachable by `anon` and `PUBLIC` — **VERIFIED**, with two caveats

```
$ ... -c "select p.proname, has_function_privilege('anon',p.oid,'EXECUTE'), has_function_privilege('authenticated',p.oid,'EXECUTE'), has_function_privilege('service_role',p.oid,'EXECUTE'), coalesce(p.proacl::text,'NULL') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('bot_create_table_row','bot_update_table_row','bot_upsert_table_row','bot_query_table_rows') order by 1;"

bot_create_table_row|f|t|t|{supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin,postgres=X/supabase_admin}
bot_query_table_rows|f|t|t|{supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin,postgres=X/supabase_admin}
bot_update_table_row|f|t|t|{supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin,postgres=X/supabase_admin}
bot_upsert_table_row|f|t|t|{supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin,postgres=X/supabase_admin}
```

`anon = f` on all four, `service_role = t` on all four, and **no bare `=X/` PUBLIC entry** in
any `proacl` (a `NULL` acl or a leading `=X/` would mean PUBLIC; neither is present).

Bodies (read with `pg_get_functiondef`, never called). All four open with the same block,
*before* the `bot_api_key_table_access` lookup:

```
  DECLARE
    _bot_key_active  boolean;
    _bot_key_expires timestamptz;
  BEGIN
    SELECT k.is_active, k.expires_at INTO _bot_key_active, _bot_key_expires
    FROM public.bot_api_keys k WHERE k.id = p_key_id;
    IF _bot_key_active IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
    IF NOT _bot_key_active THEN RAISE EXCEPTION 'inactive_key'; END IF;
    IF _bot_key_expires IS NOT NULL AND _bot_key_expires < now() THEN
      RAISE EXCEPTION 'expired_key';
    END IF;
  END;
```

So yes: `is_active` and `expires_at` are both validated. `bot_upsert_table_row` delegates to
`bot_update_table_row` / `bot_create_table_row`, each of which re-validates.

**Can a body still be reached with a key id alone?** Two answers, both worth recording.

1. **For the four writers: yes, by any authenticated user.** `authenticated` still holds
   EXECUTE, and the *only* thing these functions authorize on is `p_key_id` — a uuid, not the
   raw key. A signed-in `viewer` who learns a key id can write rows into any dynamic table that
   key may update. The exposure is bounded today because the id is not readable to non-admins:
   `bot_api_keys` and `bot_api_usage_logs` restrict SELECT to `admin`/`manager`, and
   `audit_logs` (where these very functions write `'api_key_id', p_key_id`) restricts SELECT to
   `admin`. So it is latent, not exploitable from inside the app as it stands — but it is a
   uuid standing in for a credential, and revoking `authenticated` would cost nothing if the
   server route uses `service_role`.
2. **For the sibling readers: yes, by `anon`.** `bot_get_product_for_key` and
   `bot_list_products_for_key` are `SECURITY DEFINER`, carry `=X/` (PUBLIC) plus `anon=X`, and
   gate **only** on `p_key_id` against `bot_api_key_label_access` — with **no `is_active` and
   no `expires_at` check at all**. A deactivated or expired key id still reads product rows
   including `product_computed_prices` (`rounded_sale_price`, `final_sale_price`).
   `bot_check_rate_limit` is likewise `anon`+PUBLIC. The 468 hardening was applied to the four
   writers and not to these:

```
bot_check_rate_limit|t|t|t|{=X/supabase_admin,...,anon=X/supabase_admin,...}
bot_get_product_for_key|t|t|t|{=X/supabase_admin,...,anon=X/supabase_admin,...}
bot_key_stats_today|t|t|t|{=X/supabase_admin,...}          <- guarded in body (admin/manager)
bot_list_products_for_key|t|t|t|{=X/supabase_admin,...,anon=X/supabase_admin,...}
bot_suspicious_ips|t|t|t|{=X/supabase_admin,...}           <- guarded in body (admin/manager)
```

The row as stated is VERIFIED. The two caveats are findings, not refutations.

### B-1 / B-2 — route gate census — **VERIFIED with a corrected denominator**

Denominator, stated precisely: **186 `.tsx` files in `src/routes/`** (this counts route
*files*, including `__root.tsx`, `_app.tsx`, the auth pages and layout routes — it is not a
count of URL paths). Of those, a file "calls a guard" if it matches
`/require(?:AnyRole|Admin|Permission)\s*\(/`, and "carries a gate" if `staticData:` is followed
by a brace-balanced `gate:` object.

```
route .tsx files: 186
call requirePermission( : 74
call requireAnyRole(  : 60
call requireAdmin(    : 15
union guarded         : 149
carry staticData.gate : 63
gated but NOT guarded : []          (none — a gate never appears without a guard)
guarded but NOT gated : 86
```

The `s5` spec header states this census as `73 / 60 / 15`, union **148**, staticData **23**,
"→ 125 guarded but ungated". **The staticData figure is stale by a whole wave** (23 vs the 63
now present) and the `requirePermission` count is one low. The header's own numbers therefore
understate what the wave did and misdescribe the residue. Documentation defect, reported here
rather than fixed.

**Does any money / credit / roles / keys / PII route still lack a gate?** Yes — 86 guarded
files carry no gate on their matched chain, and among them are routes that plainly qualify.
I checked three suspicious clusters by hand:

- `_app.accounting.customer-capital-allocations.tsx`, `_app.accounting.daily-capital.tsx`,
  `_app.accounting.salesperson-capital-allocations.tsx` look alarming in a grep and are **not**
  a hole: each is a 14–16 line file whose whole body is
  `beforeLoad: () => { throw redirect({ to: "/accounting/dynamic-capital" }) }`, and
  `/accounting/dynamic-capital` **is** gated `["admin","accountant"]`.
- `_app.pricing.currency-sources.tsx` — `requirePermission("pricing","view")`, reads
  `currency_sources` + `audit_logs`, calls `record_currency_fetch`. **No gate.** Measured
  below: a cold `viewer` renders it, and the live table denies `viewer` `pricing.view`.
- `_app.admin.visitors.tsx` (`requireAnyRole(["admin","manager"])`, reads `visitors` +
  `audit_logs`), `_app.suppliers_.$supplierId.tsx` (`requirePermission("suppliers","view")`,
  reads `person_identifiers` — national ids and phones), `_app.admin.automation.tsx`,
  `_app.data-tables.*`, and the ~15 remaining `_app.pricing.*` price pages. All ungated.

### B-1/B-2 (pricing) — the gates mirror the LIVE table, all five roles — **VERIFIED**

Live `role_permissions`, read from `afrakala`:

```
pricing|accountant,admin,manager,purchase_specialist,sales   (view)
pricing|accountant,admin,manager,purchase_specialist,sales   (create)
pricing|accountant,admin,manager,purchase_specialist,sales   (update)
```

Every gated route whose guard names `pricing` carries exactly those five:

```
_app.pricing.attention.tsx                  | pricing.view   | { kind: "anyRole", allowed: ["admin","manager","accountant","sales","purchase_specialist"] }
_app.pricing.currency-rates.tsx             | pricing.view   | { ... same five ... }
_app.pricing.purchase-prices.tsx            | pricing.create | { ... same five ... }
_app.pricing.recompute-prices.tsx           | pricing.update | { ... same five ... }
_app.pricing.sale-lists_.$listId.publish.tsx| pricing.update | { ... same five ... }
```

I extended the check to **every** gated route, comparing each gate against the live table for
the module/action its guard names. All 63 agree — no gate denies a role the live table admits:

| route | guard | gate | live answer |
|---|---|---|---|
| `_app.reports.tsx` | reports.view | admin, manager, accountant, sales, purchase_specialist, viewer | identical (6) |
| `_app.products.regenerate-names.tsx` | products.update | admin, manager, accountant | identical |
| `_app.persons.tsx`, `_app.persons_.$personId.tsx` | persons.view | admin, manager, accountant, sales, viewer | identical |
| `_app.persons_.create.tsx`, `..._.edit.tsx` | persons.create / update | admin, manager | identical |
| `_app.sales.tsx`, `.quotes`, `.credit-customers`, `_app.sales_.customers` | sales.view | admin, manager, accountant, sales | identical |
| `_app.sales_.customers_.create.tsx` | sales.create | admin, manager, accountant, sales | identical |
| `_app.sales_.customers_.$customerId.edit.tsx` | sales.update | admin, manager, sales | identical |
| `_app.pricing.market-rates-workshop.tsx` | market-rates.view | admin, manager, accountant, sales | identical |
| `_app.bot-api-keys.tsx` | bot-api-keys.view | admin, manager, site | (module row present) |
| all `requireAdmin()` routes (15) | admin | `{ kind: "admin" }` | n/a |
| all `requireAnyRole([...])` routes | own array | gate == guard array | n/a |

### B-3 — `s5-…` is derived so a new ungated tier-1 route fails on its own — **PARTIALLY VERIFIED (claim is too strong)**

The spec has five assertion blocks. Three are genuinely derived and two are lists.

**Genuinely derived, catches a new route with no edit to the spec:**
1. `every requireAdmin() route carries gate: { kind: "admin" }` — enumerates
   `routeFiles().filter(f => /requireAdmin\s*\(/…)`. A new `requireAdmin` route with no gate
   fails here. **Real.**
2. `no guarded route touches tier-1 data without a gate on its matched chain` — enumerates all
   route files, filters on `TIER1_DATA_MARKERS`. **Real, but bounded twice** (below).
3. `every gated route still calls a guard` and `RouteRoleGate is still mounted` — derived.

**Adversarially: where the claim fails.** Reading the code rather than the header, a newly
added tier-1 route escapes block 2 in two ways:

- **It escapes entirely if it calls no guard at all.** Block 2 opens with
  `if (!CALLS_A_GUARD.test(src)) return false;` — a brand-new route that reads
  `dynamic_entity_scores` and forgot the `beforeLoad` guard is *skipped*, not flagged. The most
  dangerous shape is the one the tripwire cannot see.
- **It escapes if its tier-1 data is not one of the 14 hard-coded `TIER1_DATA_MARKERS`.** A
  new route over `purchase_prices` or `person_identifiers` is not caught, and the spec says so
  explicitly and on purpose ("deliberately left out"). Nor are `invoices`, `payment_receipts`,
  `customer_capital_allocations` (the non-`_dynamic` table), `ai_providers` as a table,
  `bot_api_key_table_access`, `visitors`.

And the 30-entry `TIER1` registry plus the 5-entry `WAVE4_MEASURED` list are pure hard-coded
lists: they pin what exists, they discover nothing.

So: the spec is *derived where it says it is*, and the derivation is real and useful. The
sentence "a newly added ungated tier-1 route fails on its own" is true only for
`requireAdmin` routes and for routes that both call a guard and name one of 14 strings. I
would not rely on it as a tripwire for a new route.

### C-1 — `anon`-reachable SECURITY DEFINER writers with no caller identity — **VERIFIED: zero**

Derivation (note: my first pass used `\minsert\s+into\m`, where the trailing `\m` is a
*word-start* assertion and silently fails after `into`; that produced false negatives, so the
final pass drops the writer regex entirely and enumerates by hand):

```
$ ... "SELECT p.proname, CASE WHEN p.prosrc ~* '(auth\.uid\(\)|auth\.role\(\)|auth\.jwt\(\)|request\.jwt)'
        THEN 'DIRECT-IDENTITY' ELSE 'NO-DIRECT-IDENTITY' END, left(...)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef AND p.provolatile='v'
     AND pg_get_function_result(p.oid) <> 'trigger'
     AND has_function_privilege('anon',p.oid,'EXECUTE') ..."
```

Regex-free enumeration of the whole candidate set — `anon`-reachable, `SECURITY DEFINER`,
volatile, non-trigger, **no** `auth.uid()/auth.role()/auth.jwt()/request.jwt` anywhere in the
body — returns **8 functions**, and none of them is an unguarded writer:

```
ai_get_provider_key            -- READER of a vault secret. See "nobody checked" below.
asan_assign_document_numbers   -- HELPER-SHAPED GUARD (see below)
bot_check_rate_limit           -- read-only (SELECT count(*) over bot_api_usage_logs)
bot_get_product_for_key        -- reader, key-id gated
bot_list_products_for_key      -- reader, key-id gated
generate_sale_price_type_code  -- reader (SELECT MAX(...))
query_dynamic_table_rows_v2    -- read path; writes only via memoizing helpers
tg_person_fk_registry_gate     -- event-trigger function
```

The brief's warning about helper-shaped guards is exactly `asan_assign_document_numbers`, and
it is real. Its own body has no identity reference; the guard is one call down:

```
CREATE OR REPLACE FUNCTION public.asan_assign_document_number(_doc_type text, _source_id uuid)
  ... DECLARE _uid uuid := auth.uid(); ...
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ شماره‌گذاری سند آسان را ...
```

A naive `has_role` grep over the wrapper would have called this a hole. It is not one.

Thirteen further `anon`-reachable, no-identity writers exist but every one **returns
`trigger`** (`audit_purchase_insert`, `handle_new_auth_user`, `award_*_score`,
`recompute_employee_scores_on_*`, `trg_*` …). PostgreSQL refuses a direct call to a trigger
function, so they are not reachable through PostgREST.

### C-2 — `authenticated`-reachable DEFINER writers with no caller check and no legitimate caller — **VERIFIED**

Same enumeration with `authenticated`, excluding `anon`-reachable and trigger returns:

```
bot_authenticate_key
bot_create_table_row
bot_update_table_row
calculate_employee_score
settle_league_season
tick_inquiries
```

plus `refresh_sale_list_prices` and `bot_upsert_table_row`, which my volatile+regex pass missed
(`UPDATE public.sale_list_items li SET …` has an alias between the table and `SET`; `bot_upsert`
delegates rather than writing directly) — a further reminder that catalogue regexes on
`prosrc` under-report.

Each has a legitimate authenticated caller in `src/`, which I checked rather than assumed:

```
$ grep -rn "refresh_sale_list_prices" src/
src/lib/public/get-public-sale-list.ts:50:  await supabase.rpc("refresh_sale_list_prices", { p_list_id: listId });
src/routes/_app.pricing.sale-lists_.$listId.tsx:224 / :399

$ grep -rn "tick_inquiries" src/
src/lib/messenger/inquiry-status.ts:22:  const { error } = await supabase.rpc("tick_inquiries");
src/routes/_app.messages.inquiries.tsx:96

$ grep -rn "delete_bot_api_key_secure" src/
src/routes/_app.bot-api-keys.index.tsx:207
```

`expire_pending_documents` is the one that *did* have no legitimate authenticated caller — the
only mention in `src/` is a docblock in `src/lib/messenger/inquiry-status.ts:18` — and it is
now revoked from both:

```
expire_pending_documents|f|f|t|{postgres=X/supabase_admin,supabase_admin=X/supabase_admin,service_role=X/supabase_admin}
```

Its nested path survives (`tick_inquiries` calls it, and a nested call does not consult the
caller's EXECUTE grant), which is precisely the property the row asks about.

The residual is `bot_create_table_row` / `bot_update_table_row` / `bot_upsert_table_row`
keeping `authenticated` — covered under H-2 above.

### C-3 — the three market-rate system RPCs now test for `service_role` positively — **VERIFIED**

All three carry, verbatim:

```
  -- 469: positive test. It replaced a guard that raised whenever a subject claim was
  -- PRESENT, which is a guard that admitted anon. See the file header, section 0.
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: <name> is callable only by the service role'
      USING ERRCODE = '42501';
  END IF;
```

**Does it refuse a caller with no JWT at all?** This is the NULL trap the brief flags, and I
proved the difference rather than reasoning about it, inside `BEGIN … ROLLBACK`:

```
BEGIN
SET
no_jwt_at_all|t|t|            <- role_is_null=t ; COALESCE guard raises=t ; NAIVE guard = NULL (empty)
ROLLBACK
BEGIN
t
SET
anon_jwt|t                     <- COALESCE guard raises
ROLLBACK
BEGIN
t
service_role_jwt|f             <- COALESCE guard does NOT raise; the system path is admitted
ROLLBACK
```

Column 3 of the first row is **empty** — that is `auth.role() <> 'service_role'` evaluating to
SQL NULL with no JWT, which `IF` treats as false and would fall straight through. The shipped
`COALESCE(auth.role(),'')` form returns `t` and raises. The fix is correct in exactly the way
that matters.

Grants:

```
finish_market_rate_ingestion_run_system|f|f|t|{supabase_admin=X/...,service_role=X/...,postgres=X/...}
record_external_market_rate_tick_system|f|f|t|{supabase_admin=X/...,service_role=X/...,postgres=X/...}
start_market_rate_ingestion_run_system|f|f|t|{supabase_admin=X/...,service_role=X/...,postgres=X/...}
```

`anon=f, authenticated=f, service_role=t` on all three, and no PUBLIC entry.

### C-4 — `og61` catches an inverted guard even with grants revoked — **VERIFIED**

The relevant query is `SOLE_AUTHZ_IS_ABSENCE_OF_UID`, and the decisive property is that it has
**no grant predicate at all**:

```sql
  SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
     AND p.prosrc ~* 'auth\.uid\(\)\s+IS\s+NOT\s+NULL'
     AND p.prosrc !~* '${POSITIVE_CALLER_TEST}'
   ORDER BY 1
```

No `has_function_privilege`, no `proacl`. It fires on the *body*, so a re-introduced inverted
guard is caught while `anon`/`authenticated` hold nothing — which is exactly the failure that
let three bodies sit inverted for a wave under a green suite. The companion tests are two-sided
(`the three ingest RPCs carry the POSITIVE service_role test`, `service_role still reaches all
three`, `the SUPPLEMENT form is still allowed`), so the closed half cannot be satisfied by
deleting the functions or by a blanket ban.

**Allowlist audit — every entry's stated reason checked against the live body.** All 15
entries hold. The ones whose reason is a factual claim about a body or a caller site:

| entry | stated reason | what the live body / `src/` says |
|---|---|---|
| `asan_assign_document_numbers` | delegate carries `has_any_role(_uid, ['admin','accountant'])` | confirmed in `asan_assign_document_number` |
| `mark_all_notifications_read` | scoped by `WHERE user_id = auth.uid()` | confirmed |
| `mark_notification_read` | `WHERE id = … AND user_id = auth.uid()` | confirmed |
| `submit_quiz_attempt` | opens `IF _uid IS NULL THEN RAISE 'unauthenticated'`; score from `correct_value` | confirmed, both halves |
| `query_dynamic_table_rows_v2` | read path, writer only via `_dyn_compute_row_values` / `_obs_compute_row_values` | confirmed — body is one `RETURN QUERY` calling exactly those two |
| `bot_authenticate_key` | hashes the raw key with sha256, only write is `last_used_at` | confirmed |
| `cancel_promotion_nomination` | ownership: `nominated_by = auth.uid()` AND today | confirmed |
| `delete_bot_api_key_secure` | reads `user_roles` directly; admin or the key's `managed_by_role` | confirmed |
| `refresh_sale_list_prices` | called from `src/lib/public/get-public-sale-list.ts` and the sale-list route | confirmed at `:50`, `:224`, `:399` |
| `tick_inquiries` | called from `src/lib/messenger/inquiry-status.ts` and `_app.messages.inquiries.tsx` | confirmed at `:22`, `:96` |
| `expire_pending_documents` | **removed**, reason recorded as false, revoked by 470 | confirmed revoked (`f|f|t`), and `src/` really does only mention it in a docblock |

No rotted entry found. The `expire_pending_documents` case is the allowlist's own rule being
applied to itself, which is the strongest evidence it is being maintained rather than
accumulated.

**One judgement call worth surfacing.** `AUTHZ_SIGNALS` includes the literal string
`bot_api_key_table_access`. Because the four `bot_*` writers all reference that table, they are
**excluded from the derived `authenticated` set** and never reach the allowlist. That treats
"consults a key-id → table mapping" as a caller check. It is a defensible reading, but the
thing being authorized is a uuid, not a caller, and the exclusion is invisible — it looks like
those functions were never candidates. If the `authenticated` grant on those four is ever meant
to be defended, this is where the argument has to be written down.

### D-1 — `ai_usage_routes` / `ai_providers` audit — **VERIFIED**

Triggers:

```
ai_providers|trg_audit_ai_providers|O|CREATE TRIGGER trg_audit_ai_providers AFTER INSERT OR DELETE OR UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION audit_ai_routing_change()
ai_usage_routes|trg_audit_ai_usage_routes|O|CREATE TRIGGER trg_audit_ai_usage_routes AFTER INSERT OR DELETE OR UPDATE ON public.ai_usage_routes FOR EACH ROW EXECUTE FUNCTION audit_ai_routing_change()
```

Both `AFTER INSERT OR DELETE OR UPDATE`, both `FOR EACH ROW`, both enabled (`tgenabled = O`).

Proof, all inside `BEGIN … ROLLBACK` (demonstration 4 is the first of these):

```
BEGIN
audit_before|50607
row_before|receipt_ocr.vision|t|f
UPDATE 1
row_after_update|receipt_ocr.vision|t|t
audit_after|50608
AUDIT ROW ->|ai_usage_routes|receipt_ocr.vision|update|["fallback_enabled"]|false|true|row.updated_by|{"jwt_role": null, "set_role": "none", "session_user": "postgres"}|ollama
CREDENTIAL LEAK CHECK ->|f
ROLLBACK
audit_after_rollback|50607
row_after_rollback|receipt_ocr.vision|t|f
receipt_ocr provider still local ->|ollama|http://192.168.170.8:11434
```

**"What was it before?" is answerable:** `diff->'old'->>'fallback_enabled' = false`,
`diff->'new'->>'fallback_enabled' = true`, and `diff->'changed' = ["fallback_enabled"]` names
the moved column. `updated_at` is deliberately excluded from `changed` so a no-op UPDATE does
not look like a change.

All three operations, on both tables, in one rolled-back transaction:

```
BEGIN
SELECT 50607
DELETE 1
INSERT 0 1
UPDATE 1
ROW ->|ai_usage_routes|delete|product_ad_copy.chat|null|chat|(no new)|false/false|-/-/-|false
ROW ->|ai_usage_routes|insert|product_ad_copy.chat|null|(no old)|chat|false/false|-/-/-|false
ROW ->|ai_providers|update|d30816a9-…|["base_url"]|http://192.168.170.8:11434|http://192.168.170.8:11434/probe|false/false|false/false/false|false
ROLLBACK
audit_total_after_rollback|50607
ollama_url_intact|http://192.168.170.8:11434
routes_count|8
```

Columns 8–10 are the redaction check: `(diff->'old' ? 'secret_id')` and
`(diff->'new' ? 'key_prefix')` are **both false** on the `ai_providers` row — the trigger
strips those keys and replaces them with the boolean flags `has_key_before / has_key_after /
key_changed`. Column 10 is a regex over the whole `diff::text` for
`secret|apikey|api_key|token|password|bearer` — **false** on every row. No credential value
appears.

Actor: `actor_source = row.updated_by` for the `psql` session (there is no JWT), with
`db_identity {session_user, set_role, jwt_role}` recorded alongside. The function records
`session_user` rather than `current_user` on purpose — inside `SECURITY DEFINER` the latter is
always the function's owner.

**Receipt-OCR route after the probes:** `receipt_ocr.vision` still points at provider `ollama`,
`base_url = http://192.168.170.8:11434` — the local host. Confirmed after every rollback.

One aborted probe is worth recording: my first INSERT attempt used a synthetic
`service_key = '_verify_probe.chat'` and was rejected by
`ai_usage_routes_service_key_check` (an 8-value allowlist). The transaction aborted under
`ON_ERROR_STOP=1`; I re-checked `audit_logs` (50607) and `ai_usage_routes` (8) afterwards —
unchanged.

---

## The four demonstrations

### 1. A cold `viewer` refused at three formerly-exposed routes, one of them `requirePermission` — **DEMONSTRATED**

Driver: a standalone Playwright script in the scratchpad (nothing written into the worktree)
using `browser.newContext({ storageState: undefined, locale: "fa-IR" })`, asserting **before**
login that no `auth-token` key exists in `localStorage`/`sessionStorage`, then logging in fresh
and doing a **full document load** (`page.goto`, `waitUntil: "domcontentloaded"`, 4 s settle)
at each route.

```
### viewer  cold-session precheck: stored auth-token keys = []
  logged in -> http://192.168.170.8:3100/dashboard
  /roles                     | requireAdmin                       | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /admin/penalties           | requireAnyRole                     | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /products/regenerate-names | requirePermission(products,update) | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /sales/credit-rules        | requireAnyRole                     | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /persons/create            | requirePermission(persons,create)  | REFUSED(gate-denied) | SHOULD BE REFUSED | OK

### sales   cold-session precheck: stored auth-token keys = []
  /roles                     | requireAdmin                       | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /admin/penalties           | requireAnyRole                     | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /products/regenerate-names | requirePermission(products,update) | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /sales/credit-rules        | requireAnyRole                     | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /persons/create            | requirePermission(persons,create)  | REFUSED(gate-denied) | SHOULD BE REFUSED | OK

### admin
  /roles                     | PAGE RENDERED | SHOULD REACH | OK
  /admin/penalties           | PAGE RENDERED | SHOULD REACH | OK
  /products/regenerate-names | PAGE RENDERED | SHOULD REACH | OK
  /sales/credit-rules        | PAGE RENDERED | SHOULD REACH | OK
  /persons/create            | PAGE RENDERED | SHOULD REACH | OK

### accountant
  /roles                     | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /admin/penalties           | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /products/regenerate-names | PAGE RENDERED        | SHOULD REACH      | OK
  /sales/credit-rules        | PAGE RENDERED        | SHOULD REACH      | OK
  /persons/create            | REFUSED(gate-denied) | SHOULD BE REFUSED | OK

### manager
  /roles                     | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /admin/penalties           | PAGE RENDERED        | SHOULD REACH      | OK
  /products/regenerate-names | PAGE RENDERED        | SHOULD REACH      | OK
  /sales/credit-rules        | REFUSED(gate-denied) | SHOULD BE REFUSED | OK
  /persons/create            | PAGE RENDERED        | SHOULD REACH      | OK
```

25 of 25 cells match the live `role_permissions` answer. Two `requirePermission` routes are
included (`/products/regenerate-names`, `/persons/create`). The cold `sales` check is the one
that matters most for the credit pages, and `sales` is refused at `/sales/credit-rules`. The
cold `admin` reaches all five and the cold `accountant` reaches exactly what the live table
admits, so nothing legitimate was locked out.

The five-role `pricing` half, same method:

```
### sales      /pricing/attention        PAGE RENDERED  H1: "فرصت جبران"
               /pricing/purchase-prices  PAGE RENDERED  H1: "قیمت خرید محصولات"
               /pricing/recompute-prices PAGE RENDERED  H1: "انتشار قیمت فروش (دسته‌ای)"
### accountant  (identical — all three rendered)
### viewer      all three REFUSED(gate-denied), H1s: []
```

`purchase_specialist` could not be measured in the browser: **there is no
`test.purchase_specialist@afrakala.local` account** (the six that exist are accountant, admin,
manager, sales, sales2, viewer). Its inclusion is verified from the gate text against the live
table only.

### 2. A genuinely anon-reachable writer now refused for `anon` — **DEMONSTRATED**

`expire_pending_documents` is the cleanest case: it was reachable, has no legitimate
authenticated caller in `src/`, and is now closed to both while its nested path through
`tick_inquiries` survives.

```
$ ... -c "select p.proname, has_function_privilege('anon',p.oid,'EXECUTE'), has_function_privilege('authenticated',p.oid,'EXECUTE'), has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (...) order by 1;"

assign_user_role_txt                   |f|t|t
bot_create_table_row                   |f|t|t
bot_query_table_rows                   |f|t|t
bot_update_table_row                   |f|t|t
bot_upsert_table_row                   |f|t|t
expire_pending_documents               |f|f|t
finish_market_rate_ingestion_run_system|f|f|t
record_external_market_rate_tick_system|f|f|t
revoke_user_role_txt                   |f|t|t
start_market_rate_ingestion_run_system |f|f|t
```

and the raw ACLs, which show no PUBLIC entry survived:

```
expire_pending_documents|{postgres=X/supabase_admin,supabase_admin=X/supabase_admin,service_role=X/supabase_admin}
revoke_user_role_txt|{postgres=X/supabase_admin,supabase_admin=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
```

`revoke_user_role_txt` — the function an unauthenticated caller used to strip a real
administrator's role — is `anon = f` with no PUBLIC entry, and `authenticated = t` so the admin
UI still works. Neither function was called.

### 3. An inverted-guard function admitting the system path and refusing `anon` — **DEMONSTRATED**

`record_external_market_rate_tick_system` (the one whose INSERT feeds `market_rate_ticks` →
`_par_latest_usd_rate()` → every USD-converted price). Not called; shown from the body and the
ACL, plus the guard expression evaluated on its own.

Body:

```
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: record_external_market_rate_tick_system is callable only by the service role'
      USING ERRCODE = '42501';
  END IF;
```

Guard expression, evaluated per caller shape in rolled-back transactions:

| caller | `auth.role()` | shipped guard `COALESCE(auth.role(),'') <> 'service_role'` | naive `auth.role() <> 'service_role'` |
|---|---|---|---|
| no JWT at all | NULL | **t → raises** | NULL → **falls through** |
| `{"role":"anon"}` | `anon` | **t → raises** | t |
| `{"role":"service_role"}` | `service_role` | **f → admitted** | f |

ACL: `anon=f, authenticated=f, service_role=t`,
`proacl = {supabase_admin=X/…,service_role=X/…,postgres=X/…}`.

Both halves shown: the system path is admitted, `anon` — with or without a JWT — is refused.

### 4. An audit row written by a rolled-back change to `ai_usage_routes` — **DEMONSTRATED**

See D-1 above: `audit_logs` 50607 → 50608 inside the transaction, the row reading
`ai_usage_routes | receipt_ocr.vision | update | ["fallback_enabled"] | old=false | new=true`,
then 50607 again after `ROLLBACK` with `fallback_enabled` back to `f` and the receipt-OCR route
still on the local `ollama` provider.

---

## Baselines reproduced

| baseline | expected | measured | verdict |
|---|---|---|---|
| `npx tsc --noEmit` | 70 errors across six files | **70** — `_app.products.index.tsx` 18, `_app.admin.sales-reminders.tsx` 15, `lib/invoices/functions.ts` 13, `lib/accounting/functions.ts` 13, `lib/audit/index.ts` 6, `_app.admin.automation.tsx` 5 | reproduced exactly |
| `e2e/security/` | 259 passed / 1 failed of 260 | **259 passed, 1 failed (2.8m)** | reproduced exactly |
| the one failure | `rule12` naming only `e2e/unit/ledger-wizard-party-pick.spec.ts` | `rule12-no-gate-creates-posted-documents.spec.ts:109` — `Array ["e2e\\unit\\ledger-wizard-party-pick.spec.ts"]`, one offender | reproduced exactly |
| migrations | disk 646 = ledger 646 | `disk: 646` / `ledger: 646` | reproduced exactly |

The `node_modules` junction is present in the worktree (`node_modules/.bin/tsc` resolves, and
`require.resolve('playwright')` points into `D:\AfraKalaTest\app\node_modules`), so the 70 is a
real measurement and not the silent 0 of a worktree without dependencies.

---

## Anything the builders claimed that I could not reproduce

Only one, and it is in a spec header rather than in the behaviour:

- **The `s5` route census is stale.** The header states `requirePermission( 73`,
  `requireAnyRole( 60`, `requireAdmin( 15`, "union of the three: 148 guarded route files",
  "carrying staticData: 23 → 125 guarded but ungated". Measured on the same tree by the same
  method: **74 / 60 / 15, union 149, carrying a gate 63, guarded-but-ungated 86.** The
  staticData figure appears to predate the wave's own additions. The `requirePermission` count
  is one low.
- **The B-3 claim as worded overstates the spec.** "Derived, so a newly added ungated tier-1
  route fails on its own" is true for `requireAdmin` routes and for routes that both call a
  guard and name one of 14 hard-coded data markers; it is false for a route that forgot its
  guard entirely (block 2 skips those by construction) and for tier-1 data outside those 14
  strings. Detail under B-3.

Nothing in H-1, H-2, C-1, C-2, C-3, C-4 or D-1 failed to reproduce.

---

## Anything nobody checked that I think matters

**1. `public.ai_get_provider_key(uuid)` hands a decrypted vault secret to `anon`.** Highest
severity item I found.

```
CREATE OR REPLACE FUNCTION public.ai_get_provider_key(p_provider_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_secret_id uuid; v_key text;
BEGIN
  SELECT secret_id INTO v_secret_id FROM public.ai_providers WHERE id = p_provider_id AND is_active;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_key;
END;
$function$

proacl = {postgres=X/supabase_admin,supabase_admin=X/supabase_admin,anon=X/supabase_admin,service_role=X/supabase_admin}
```

No `auth.uid()`, no `auth.role()`, no role test, no key test — the uuid **is** the
authorization. `anon` holds an explicit EXECUTE grant (`authenticated` notably does not, so
this is not an oversight in one direction only). Mitigation as it stands: `ai_providers` has
RLS enabled with a single `SELECT` policy `has_role(auth.uid(),'admin')`, so `anon` cannot list
provider ids from the table. But a uuid is not a secret — it travels in audit diffs, admin
screens, logs and URLs — and the function is exposed through PostgREST to an unauthenticated
caller. **Every derived query in `og61` filters to writers, so a `SECURITY DEFINER` *reader* of
credentials is structurally invisible to the whole suite.** I did not call it.

**2. The SSR fail-open is still live on 86 routes, and I measured three of them.** The wave
fixed the client-navigation race (`settleRoles()`) and gated 63 files; the remaining 86 guarded
files have no `staticData.gate`, and for those the `beforeLoad` guard still runs only on the
server, where `resolveAuthWithRetry()` returns null and every guard does
`if (!resolved) return { user: null, roles: [] }`. Cold-session measurement, same method as
demonstration 1:

```
### viewer (cold)
  /pricing/currency-sources | requirePermission("pricing","view")  NO GATE | PAGE RENDERED | H1: "منابع نرخ ارز"
  /admin/automation         | requireAnyRole(["admin","manager"])  NO GATE | PAGE RENDERED | H1: "مرکز اتوماسیون و ربات‌ها"
  /data-tables              | requirePermission("data-tables","view") NO GATE | PAGE RENDERED | H1: "جداول داده پویا"

### sales (cold)
  /admin/automation         | requireAnyRole(["admin","manager"])  NO GATE | PAGE RENDERED
  /data-tables              | requirePermission("data-tables","view") NO GATE | PAGE RENDERED
```

Live `role_permissions` denies `viewer` both `pricing.view` and `data-tables.view`, and
`/admin/automation` is admin/manager only — yet a cold `viewer` renders all three. This is the
identical defect class the wave closed elsewhere. It is *in scope for the deferral decision*,
not a regression; but it means the honest summary is "63 routes closed, 86 open", not "the
cold-session hole is closed".

**3. `bot_get_product_for_key` / `bot_list_products_for_key` did not get the 468 treatment.**
Both are `anon` + PUBLIC, `SECURITY DEFINER`, and authorize on `p_key_id` alone with **no
`is_active` / `expires_at` check** — the exact validation that was added to the four writers.
A revoked or expired bot key id still reads product rows and their computed sale prices.
Deactivating a leaked key does not actually stop it on these two paths.

**4. `AUTHZ_SIGNALS` treats `bot_api_key_table_access` as a caller check.** Because of that
literal, the four `bot_*` writers never appear in either derived set in `og61` and never had to
justify their `authenticated` grant on the allowlist. A key-id lookup authorizes a *key*, not a
*caller*.

**5. Trigger functions dominate the "unguarded anon writer" population and are safe only
because PostgreSQL refuses a direct call.** Thirteen of them match every heuristic. Any future
derivation that forgets `pg_get_function_result(oid) <> 'trigger'` will produce a list that
looks like thirteen live holes and is not — worth stating so the next auditor does not chase
them.

**6. Catalogue regexes on `prosrc` under-report writers, in two ways I hit.** `\minsert\s+into\m`
is silently wrong (`\m` is a word *start*, so it never matches after `into`), and
`update\s+[a-z_.]+\s+set` misses an aliased target (`UPDATE public.sale_list_items li SET`).
Both produced false negatives in my first pass. The `og61` `DERIVED_SUBJECTS` query avoids the
first (`[U]PDATE\s+(public\.)?[a-z_]`) but shares the second. Not a defect in the wave; a trap
for the next person deriving this set.

---

## UNVERIFIED / UNKNOWN

- **`purchase_specialist` in a browser.** No `test.purchase_specialist@afrakala.local` account
  exists, so the five-role `pricing` claim is verified for four roles behaviourally
  (admin, manager, accountant, sales — plus viewer correctly refused) and for the fifth from
  the gate text against the live table only. I did not create an account.
- **`get_customer_dynamic_credit` and `_ensure_credit_balance` were never exercised**, by
  instruction. I have no behavioural statement about them.
- **The `site` role** appears in `role_permissions` (`products.view`, `products.create`,
  `bot-api-keys`) and in the `_app.bot-api-keys.tsx` gate, but there is no test account and I
  did not measure it.
- **PostgREST-level reachability was not re-tested end to end.** My `anon` claims rest on
  `has_function_privilege` and `proacl`, per the no-calling rule. `og61` does run one real
  PostgREST call as `anon` (`revoke_user_role_txt` against an invalid role literal) and it
  passes in the suite run above, which is the only live-path evidence in this report.
- **The other 83 guarded-but-ungated routes** were classified from source, not visited. I
  measured three; I did not enumerate which of the remaining 83 expose money, credit, roles,
  keys or PII in a browser.
- **`e2e/security/` was run once**, so nothing here speaks to flakiness of the 259.
- Whether any of the findings above are already recorded in the wave's own backlog is unknown
  to me by design — I did not read `CONTRACTS.md` or any agent's findings file.

---

**PARTIAL** — 11 of the 12 rows VERIFIED, 1 (B-3) PARTIALLY VERIFIED with the claim shown to be
narrower than stated; all four demonstrations produced; all four baselines reproduced exactly.
Partial rather than complete because `purchase_specialist` and the `site` role could not be
measured in a browser for want of test accounts, and because 83 of the 86 guarded-but-ungated
routes were classified from source rather than visited.
