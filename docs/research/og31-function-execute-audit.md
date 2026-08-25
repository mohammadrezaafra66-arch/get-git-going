# OG-31 — the FUNCTIONS default privilege: mechanism, containment, and a report-only audit

Measured on the live `afrakala` database on 2026-08-26 for mission 4 of the chained
execution (branch `feature/security-trio-og31`, migration 393). Every number here is
output, not recollection. Nothing in this file was applied except migration 393 itself;
the audit half is **report-only** by instruction.

---

## 1. The mechanism, re-measured

M3 recorded in migration 381's header that a schema-scoped `ALTER DEFAULT PRIVILEGES`
cannot close the anon function tap, and that a global row can. That was re-derived
independently here rather than trusted, because A5.28 warns the live state can differ from
what a file says. Six probes, one file, inside an explicit `BEGIN … ROLLBACK` (A5.26 — a
reverting probe must never use `--single-transaction`, which commits; that mistake left
`BYPASSRLS` live on `anon` during M9).

```
       probe       | anon_exec | rouser_exec |                              acl
-------------------+-----------+-------------+---------------------------------------------------------------
 P1-CONTROL public | t         | t           | {=X/supabase_admin,postgres=X/…,supabase_admin=X/…,anon=X/…,
                                               authenticated=X/…,service_role=X/…}

            probe             | anon_exec | rouser_exec |                     acl
------------------------------+-----------+-------------+----------------------------------------------
 P2-SCHEMA-SCOPED-ONLY public | t         | t           | {=X/supabase_admin,postgres=X/…,supabase_admin=X/…,
                                                          authenticated=X/…,service_role=X/…}

          probe          | anon_exec | auth_exec | svc_exec | rouser_exec |                acl
-------------------------+-----------+-----------+----------+-------------+-------------------------------
 P3-GLOBAL+SCHEMA public | f         | t         | t        | f           | {postgres=X,supabase_admin=X,
                                                                             authenticated=X,service_role=X}

        probe        | anon_exec | auth_exec |                acl
---------------------+-----------+-----------+-----------------------------------
 P4-BLAST extensions | f         | f         | {supabase_admin=X/supabase_admin}

          probe          | anon_exec | auth_exec | acl
-------------------------+-----------+-----------+-----
 P5-MITIGATED extensions | t         | t         |          <- NULL acl = acldefault() = PUBLIC executes

         probe          | anon_exec |                acl
------------------------+-----------+--------------------------------
 P6-public still closed | f         | {postgres=X,…,service_role=X}
```

**P2 is the whole point.** The schema-scoped revoke removes the `anon=X` entry and leaves
the bare `=X` — the PUBLIC grant that `acldefault()` supplies — so anon keeps EXECUTE
through PUBLIC and the catalogue *looks* fixed. Only a global (`defaclnamespace = 0`) row
replaces `acldefault()` outright.

**P4 corrects the gate row's blast radius in the dangerous direction.** OG-31's row says
the global row would strip PUBLIC EXECUTE in `extensions`/`pgsodium`/`graphql`/`vault`.
Measured, a new function there comes out `{supabase_admin=X}` — `authenticated` loses it
too, not merely `anon`. And the affected list is five schemas, not four:

```
   schema   | fns_owned_by_supabase_admin
------------+-----------------------------
 extensions |                          61
 graphql    |                           6
 pgbouncer  |                           1     <-- absent from every previous list
 pgsodium   |                         119
 public     |                         840
 vault      |                           3
```

`pgbouncer.get_auth` carries `proacl = NULL`, i.e. it runs entirely on the PUBLIC grant it
inherits from `acldefault()`. An `ALTER EXTENSION … UPDATE` recreating it under a bare
global row would strip it silently, and that is a connection-pooling outage.

**P5/P6 make the owner decision unnecessary.** A per-schema
`GRANT EXECUTE ON FUNCTIONS TO PUBLIC` restores the prior default exactly, and it does not
leak back into `public`. Migration 393 therefore ships the global revoke *plus* six
per-schema restores, so its only behavioural effect is in `public` — the scope the owner
authorised. The containment is asserted in the gate (check O2, one probe per schema), not
argued in prose.

### Post-apply live re-check (A0.9a), after `docker restart afrakala-lan-rest`

```
        surface         | anon | rouser | authenticated | service_role |          acl
------------------------+------+--------+---------------+--------------+------------------------
 new function in public | f    | f      | t             | t            | {postgres=X,supabase_admin=X,
                                                                          authenticated=X,service_role=X}
          surface           | anon | authenticated
----------------------------+------+---------------
 new function in extensions | t    | t
          surface          | anon
---------------------------+------
 new function in pgbouncer | t
```

Persisted rows:

```
     schema     |                         defaclacl
----------------+----------------------------------------------------------
 <GLOBAL>       | {supabase_admin=X/supabase_admin}
 extensions     | {=X/supabase_admin}
 graphql        | {=X/supabase_admin}
 pgbouncer      | {=X/supabase_admin}
 pgsodium       | {=X/supabase_admin}
 pgsodium_masks | {=X/supabase_admin,pgsodium_keyiduser=X/supabase_admin}
 public         | {postgres=X,authenticated=X,service_role=X}
 vault          | {=X/supabase_admin}
```

`pgsodium_masks` kept its pre-existing `pgsodium_keyiduser=X` and gained PUBLIC, which is
what its effective default already was — status quo preserved, not widened.

---

## 2. The report-only audit of what is ALREADY open

Migration 393 revokes nothing from any existing function. This section is the census the
OG-25 pattern calls for: close the future tap, audit the existing set **report-only**, and
hand back anything already broken as a new gate.

### Census — `public`, 840 functions

| | count |
|---|---|
| anon-executable | **741** |
| already closed to anon (381, 389, 390, …) | 99 |
| SECURITY DEFINER (all) | 427 |
| SECURITY DEFINER **and** anon-executable | **342** |
| — STABLE (safe to call as anon per A5.31) | 91 |
| — VOLATILE (never called; A5.31) | 251 |

v7 states "740 anon-executable functions, 345 SECURITY DEFINER". The first is 741 today;
the second appears to be the anon-executable **definer** count, which is 342. The plain
definer count is 427. Recorded so the next mission does not re-derive it wrongly.

### The behavioural sweep (A5.31)

A5.31 requires that survivors be tested **behaviourally**, calling STABLE ones as `anon`
inside `BEGIN … ROLLBACK` and never calling VOLATILE ones. All 91 STABLE anon-executable
definer functions were enumerated; the 18 whose names put them in a financial, pricing,
credit, PII or export domain were called as `anon` with no session. Each call was isolated
in its own exception block, because a first failure otherwise aborts the transaction and
hides every later result — which it did on the first attempt.

```
                 fn                 |                           outcome
------------------------------------+--------------------------------------------------------------
 get_leaderboard_monthly            | RETURNED DATA -> 5
 get_product_price_bounds           | RETURNED DATA -> (100900000,100900000,105945000,100900000,t)
 get_product_sale_price             | RETURNED DATA -> 100900000
 list_trusted_credit_customers      | RETURNED DATA -> 0
 asan_list_bank_deposit_export      | refused: اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید
 asan_list_sales_export             | refused: اجازهٔ خروجی گرفتن از پیش‌فاکتورها را ندارید
 bot_key_stats_today                | refused: forbidden
 calculate_customer_realtime_credit | refused: Forbidden: requires admin, manager, or accountant
 get_account_balances               | refused: forbidden
 get_payables_summary               | refused: forbidden
 get_receivables_list               | refused: forbidden
 get_receivables_summary            | refused: forbidden
 get_sales_search_products          | refused: unauthenticated
 list_market_rate_ticks_public      | refused: احراز هویت لازم است
 list_mutual_settlement_candidates  | refused: دسترسی لازم برای دیدن فهرست تسویهٔ متقابل را ندارید.
 mi_get_price_movers                | refused: unauthenticated
 mi_get_trending_products           | refused: unauthenticated
 person_settlement_position         | refused: دسترسی لازم برای دیدن وضعیت تسویه را ندارید.
```

**Fourteen of eighteen refuse from inside their own bodies.** That is the healthy pattern
and it is worth stating plainly: EXECUTE being granted to `anon` is not, on its own, a
leak — most of this codebase guards at the top of the function. The census number 741 is
therefore an upper bound on exposure, not a measure of it.

**Four returned data, and two of those are a live disclosure.**

| function | what an anonymous caller got | assessment |
|---|---|---|
| `get_product_sale_price(uuid,uuid)` | `100900000` — a real sale price | **LIVE. Direct violation of the A8 classification** (`product_computed_prices` → PUBLIC: NOTHING) and of OG-29, which is still open and is the reason `/api/public/products` publishes `price: 0`. |
| `get_product_price_bounds(uuid,uuid)` | `(100900000,100900000,105945000,100900000,t)` — floor, current and a 1.05× ceiling | **LIVE.** Discloses the pricing band, not merely a number. |
| `get_leaderboard_monthly(...)` | 5 rows of employee leaderboard data | **LIVE, lower severity.** Staff performance data to an unauthenticated caller. Five further `get_leaderboard*` / `get_league_leaderboard` variants share the shape and were not individually called. |
| `list_trusted_credit_customers(...)` | `0` rows | **LATENT, not a live leak today.** It did not refuse — it ran and matched nothing. If the underlying set were non-empty an anonymous caller would receive customer credit profiles. |

This is the **same class** as OG-55: `calculate_adjusted_price` was closed by migration 390
precisely because a definer function returned the real sale price (38,985,000) while the
caller's table SELECT was refused with 42501. The column grants and RLS added by 388/389/390
are intact; these two functions walk past them exactly as that one did.

**Not closed in this mission, and the reason is explicit.** The mission brief for OG-31
says *"close the future tap, audit existing report-only, raise gates for anything already
broken"* — the same scoping the owner applied to OG-25, where the broken surfaces became
OG-32 and OG-33 rather than being fixed in place. A2.9 also caps this mission at one
assertion gate, and migration 393's is spent. Closing these needs its own two-sided gate
proving `authenticated` keeps EXECUTE after the PUBLIC revoke — the REVOKE-then-GRANT
ordering trap has struck four times in this programme (A5.32). Raised as **OG-62** below.

### Two functions deliberately left alone

- **`refresh_sale_list_prices(uuid)`** — VOLATILE, SECURITY DEFINER, writes, and holds both
  an explicit `anon=X` and a PUBLIC `=X`. Measured, not called (A5.31 forbids calling
  VOLATILE definers). **A6.33 (OG-48) makes revoking it the first step of the sale-lists
  repair and A6.35 (OG-32) blocks that repair until OG-48 is resolved**, so it is recorded
  here for that mission to start from rather than touched by this one.
- **`set_profile_field_value(uuid,text,jsonb)`** — the one genuine keep-list entry on this
  surface. `register.tsx:131` → `lib/profile-fields/queries.ts:38` calls it for a
  newly-created user, potentially before a session exists. It already carries an explicit
  `anon=X` of its own, so **no GRANT was written**: the keep-list is already recorded in
  the catalogue, and migration 393 asserts the grant still stands (check O6b) rather than
  adding a redundant statement.

---

## 3. Gate attack (A2.12)

One control and twelve disturbances, run against the extracted gate with the change
applied, each inside `BEGIN … ROLLBACK`. Every disturbance shows its constructed state
before the gate runs (A2.12d) — a disturbance that silently fails to build is a false
CAUGHT, which happened twice in M5C.

| # | kind | disturbance | constructed? | result |
|---|---|---|---|---|
| D0 | — | **control**, healthy and undisturbed | — | **PASS** (required) |
| D1 | structural | omit the global row; schema-scoped revokes only | `global_rows=0`, `anon_still_executes=t` | CAUGHT — C1 |
| D2 | structural | forget the `pgbouncer` restore | `pgbouncer_rows=0`, `public_exec_survives=f` | CAUGHT — O2 |
| D3 | **empties for everyone** | also revoke from `authenticated` and `service_role` | anon=f, authenticated=f, service_role=f | CAUGHT — O1 *(A2.10 requires this to FAIL)* |
| D4 | behavioural | GRANT the read-only role EXECUTE on `is_viewer_only` + `_capital_alloc_used` | `rouser_execute=t`, view read no longer errors | CAUGHT — C5 |
| D5 | structural | GRANT `is_viewer_only` EXECUTE to PUBLIC | `rouser_execute_via_public=t` | CAUGHT — C5 |
| D6 | **correct-looking, no effect** | `AND NOT EXISTS` → `OR NOT EXISTS` in the guard body | `users_now_misjudged=1` | CAUGHT — O5 |
| D7 | structural | `ALTER FUNCTION … SECURITY INVOKER` | `security_definer=f` | CAUGHT — O4 |
| D8 | structural | `ALTER FUNCTION … RESET search_path` | `proconfig=NULL` | CAUGHT — O4 |
| D9 | behavioural | re-GRANT `calculate_adjusted_price` to anon (OG-55) | `anon_execute=t` | CAUGHT — C7 |
| D10 | structural | add overload `is_viewer_only(text)`, PUBLIC-executable | `signatures=2`, `rouser_on_overload=t` | CAUGHT — C5 |
| D11 | structural | rewrite a guard view without the guard predicate | `views_still_guarded=7`, `this_view_guarded=f` | CAUGHT — O7 |
| D12 | vacuity | delete every viewer role **and** make the body `SELECT false` | `viewer_only_users=0`, `disagreements=0` | CAUGHT — O5 vacuity guard |

**D11 was rebuilt.** Its first form used `DROP VIEW`, which errored with *"cannot drop view
v_promotion_suggestions because other objects depend on it"* — the perturbation never
built, the gate never ran, and counting that as CAUGHT would have been a false positive of
exactly the kind A2.12(d) exists to prevent. It was rewritten as a `CREATE OR REPLACE VIEW`
that keeps the column list and drops only the guard predicate, which is also the more
realistic failure, and then it was caught.

**D12 earns the vacuity guard its place.** With the viewer population deleted and the body
replaced by a constant, `disagreements` is 0 — the agreement check passes *vacuously*. Only
the population guard catches it. This is the failure mode migration 387 has to reach
indirectly and that this gate now asserts head-on.

**On A2.12(b)'s "numeric returned as a JSON string".** That disturbance class defeated M5's
gate because that gate read PostgREST JSON. This gate makes no HTTP or JSON read — every
check is a catalogue lookup or a SQL boolean — so the class has no attack surface here.
Stated rather than silently skipped. Its nearest analogue, a check that passes because its
input is empty rather than because the property holds, is D12, and it is covered.

---

## 4. OG-45's real severity, measured

OG-45 says the read-only role is one GRANT from reading all eight guard-class views. That
is arithmetically wrong (two of the eight also need `_capital_alloc_used`) and, more
importantly, the prize is empty. With **both** grants made, inside `BEGIN … ROLLBACK`:

```
                  view                  | count
----------------------------------------+-------
 product_computed_prices_public         |     0
 publish_recipients_view                |     0
 v_dynamic_customer_capital_balances    |     0
 v_dynamic_salesperson_capital_balances |     0
 v_promotion_suggestions                |     0
 vw_account_balances                    |     0
 vw_customer_receivables                |     0
 vw_supplier_payables                   |     0

           what           | uid_is_null
--------------------------+-------------
 auth.uid() for this role | t
```

The role connects over `psql` with no JWT, so `auth.uid()` is NULL and migration 386's
predicate `uid() IS NOT NULL AND NOT is_viewer_only(uid())` closes all eight — silently,
zero rows, no error. **This is OG-51's mechanism arriving at a different door: M4's OG-26
fix incidentally neutralised OG-45's data exposure.**

The control that keeps this honest, same session, same role:

```
                 what                 | count
--------------------------------------+-------
 BASE TABLE control: payment_receipts |    10
 BASE TABLE control: persons          |    84
```

So the role is not harmless — it reads every base table freely through `pg_read_all_data`
plus `BYPASSRLS`. It simply does not need the guard views to do it. **That reframes OG-38:**
the question is not whether it should hold EXECUTE on `is_viewer_only` (that grant yields
nothing today), it is whether a passwordless `BYPASSRLS` role that can read every base
table should exist and be able to log in at all.

**One coupling to record:** OG-51 contemplates fixing `service_role`'s zero-row problem by
exempting NULL-uid callers in the eight views. If that option is ever taken, **OG-45 becomes
live** — the same predicate is the only thing withholding the rows. Migration 393's C5
assertion is what keeps the second half of that door shut in the meantime.

---

## 5. New gates raised

| gate | question |
|---|---|
| **OG-61** | Should the `anon`/`PUBLIC` EXECUTE grant be revoked from the 741 existing anon-executable functions in `public`? This is the function-side twin of OG-30 (which the owner scheduled after this mission). The census above is the keep/strip list; 14 of the 18 highest-risk ones guard themselves internally, so a batched revoke is defence in depth rather than a fix. |
| **OG-62** | `get_product_sale_price` and `get_product_price_bounds` return real sale prices and price bands to an **anonymous** caller today — the OG-55 pattern, still open. `get_leaderboard_monthly` returns employee leaderboard rows; `list_trusted_credit_customers` runs for anon and returns rows only because the set is currently empty. May these be revoked from `anon` and `PUBLIC` (keeping `authenticated`)? The A8 table already says price is never public, so the conservative reading is yes — but it is a live surface and the REVOKE-then-GRANT ordering trap makes it its own gated change. **Recommended as the immediate next action.** |
