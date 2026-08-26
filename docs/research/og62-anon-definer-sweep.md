# OG-62 — the anon-reachable SECURITY DEFINER leaks: a full domain sweep, and what it closed

Measured on the live `afrakala` database on 2026-08-26 for mission 6 of the chained
execution (branch `feature/og62-anon-price-definers`, migration 395). Everything below is
command output.

Owner decision on record: **yes, close it — with a complete domain-wide sweep**, not just
the two functions the gate row names.

---

## 1. The sweep, and why a row count is not a leak

Mission 4 sampled 18 functions by name. This mission called **every STABLE, anon-executable
SECURITY DEFINER function in `public`** — 91 of them — as `anon`, each inside its own
sub-transaction so one failure could not hide the rest. VOLATILE definers were never called
(A5.31); their bodies are read instead.

Arguments were passed as NULL, which discriminates well: a function that guards its caller
raises its permission error **before** it looks at the data, so it refuses whatever it is
given. Anything that does not refuse is a candidate.

```
 outcome  | count
----------+-------
 GUARDED  |    36
 OTHER    |     8
 RETURNED |    47
```

**But 47 "RETURNED" is not 47 leaks.** `has_role(NULL,NULL)` returns one row containing
`false`; `is_viewer_only(NULL)` likewise. A row count proves nothing about disclosure. So
every function that returned rows was called **again with real arguments** and its *values*
inspected. That second pass is what separates a leak from a boolean helper:

```
                   fn                   | outcome  |                          value
----------------------------------------+----------+--------------------------------------------------------
 get_product_sale_price                 | RETURNED | 79800000
 get_product_price_bounds               | RETURNED | (79800000,87300000,91665000,79800000,t)
 get_leaderboard / _all_time / _daily   | RETURNED | 5 rows each
 get_leaderboard_monthly / _weekly      | RETURNED | 5 rows each
 get_current_league                     | RETURNED | {"rank":null,"score":0,"league":"Bronze","season_id":"97f1…
 get_workflow_settings                  | RETURNED | (debfd643…,bijak_invoice_print,"بیجک و فاکتور چاپی",accountant,sales,10,t,reviewer,…
 person_fk_registry_report              | RETURNED | (asan_import_person_rows.matched_person_id,t,t,ok) | (credit_requests.customer_person_id,…
 person_merge_registry_keys             | RETURNED | (person_merge_candidates.person_id_b) | (customer_credit_profile.customer_person_id) | …
 _promo_policy_for                      | RETURNED | (03cd89f9…,,,3,1,5,15,t,"2026-07-18 11:53:37…
 get_product_stats                      | RETURNED | {"avg_price":null,"last_price":null,"purchase_count":0,…
 validate_journal_entry_balance         | RETURNED | (0,0,f)
 get_numeric_setting                    | RETURNED | -1
 list_trusted_credit_customers          | RETURNED | 0
 …plus the 0-row / NULL cases in the same domains
```

`get_product_sale_price` handing **79,800,000** to a caller with no session is the third
appearance of a pattern this programme has closed twice already: OG-49 (`products.sku`,
migration 389) and OG-55 (`calculate_adjusted_price`, migration 390, which returned
38,985,000 while the caller's table SELECT was refused with 42501). A8 says price is never
public and everything not explicitly declared public is internal, so these are standing
violations rather than judgement calls.

The **28** functions closed by migration 395 are the ones that either returned real data or
sit squarely in the same domain and returned nothing only because their data set is
currently empty (`list_trusted_credit_customers` → 0 rows,
`search_messenger_messages_semantic` → 0 rows, `product_videos_waiting` → 0 rows). Those are
latent rather than live, and they are closed for the same reason.

**The RLS helper functions were deliberately left alone.** `is_viewer_only`, `has_role`,
`has_any_role`, `dyn_table_role_can_view`, `kd_role_can_view` and the `is_*` predicates
returned only booleans to the sweep. They back 93 RLS policies; revoking them from `anon`
would break policy evaluation for anonymous requests rather than close a leak. The gate
asserts they keep their grants.

## 2. Why it was safe — measured before a single REVOKE was written

| check | result across all 28 |
|---|---|
| `authenticated` holds its OWN explicit EXECUTE grant | **true for all 28** |
| `service_role` holds its own explicit grant | **true for all 28** |
| appears in any RLS policy (`in_policy`) | **0 for all 28** |
| reachable through a view `anon` can SELECT | **0 for all 28** |
| number of signatures | **exactly 1 each** |

The first row is the one that matters most: the REVOKE-then-GRANT ordering trap (A5.32) has
bitten this project four times. Because `authenticated` and `service_role` each hold their
own grant, revoking `PUBLIC` cannot silently remove their access — checked, not assumed.

The only view usage is `get_product_price_bounds` inside `api_products_pricing`, and
`anon` and `authenticated` both cannot SELECT that view.

In the application: a whole-tree search finds **no `src/` caller at all** for
`get_product_sale_price` or `get_product_price_bounds` — only the generated
`src/integrations/supabase/types.ts`. (`InvoiceForm.tsx`, named in an older research note,
no longer exists.) The remaining consumers are authenticated routes:
`src/lib/operations/gamification.ts:162` and `src/routes/_app.sales.credit-customers.tsx:82`.

## 3. The rollback found a real bug in itself

The forward→rollback dry run compares the ACL **as a set** of
`(signature, grantee, privilege, grantor)` tuples, and it failed:

```
 side                 | t
----------------------+---------------------------------------------------------------
 IN AFTER, NOT BEFORE | product_videos_waiting()|PUBLIC|EXECUTE|supabase_admin
 IN AFTER, NOT BEFORE | polymorphic_ref_orphan_report()|PUBLIC|EXECUTE|supabase_admin
```

Nothing was lost — but two functions **gained** a PUBLIC grant they never had. Those two are
anon-executable through an explicit `anon=X` only; 26 of the 28 carry PUBLIC, they do not. A
blanket `GRANT … TO PUBLIC` in the rollback would have left them **more open than they
started**. The rollback now restores per function, and says so in place:

```
-- public.polymorphic_ref_orphan_report() had NO PUBLIC grant before 395; deliberately not re-granted.
-- public.product_videos_waiting() had NO PUBLIC grant before 395; deliberately not re-granted.
```

**And the way that bug nearly escaped is worth recording.** The first draft compared
`proacl::text` and reported a mismatch. That mismatch had *two* causes at once: this real
defect, and a harmless one — a REVOKE followed by a GRANT re-appends the entry at the end of
the aclitem array, so the text differs even when the privileges are identical:

```
before {=X,supabase_admin=X,anon=X,authenticated=X,service_role=X,postgres=X}
after  {supabase_admin=X,authenticated=X,service_role=X,postgres=X,anon=X,=X}
```

The tempting move was to call the mismatch "just ordering" and relax the check — which would
have hidden the real defect underneath it. Comparing the ACL as a set separated the two.

Final state after the fix: **166 ACL entries before, 166 after, zero difference in either
direction.**

## 4. Gate attack (A2.12) — 1 control + 12 disturbances, all caught

| # | disturbance | constructed? | result |
|---|---|---|---|
| D0 | **control**, healthy | — | **PASS** (required) |
| D1 | revoke `anon` but not `PUBLIC` — the trap that has bitten 4× | `anon_via_public=t` | CAUGHT — C1 |
| D2 | revoke `PUBLIC` but not `anon` | `anon_direct=t` | CAUGHT — C1 |
| D3 | **also close it for `authenticated`** | `auth_execute=f` | CAUGHT — O1 *(A2.10)* |
| D4 | also close it for `service_role` | `svc_execute=f` | CAUGHT — O1 |
| D5 | overload escape: add `get_product_sale_price(text,text)` granted to anon | `signatures=2`, `anon_on_overload=t` | CAUGHT — C1 (checks by NAME) |
| D6 | revoke the RLS helper `is_viewer_only` from anon as collateral | `anon_on_helper=f` | CAUGHT — O3 |
| D7 | revoke the registration keep-list entry | `anon_on_keeplist=f` | CAUGHT — O4 |
| D8 | re-open OG-55 (`calculate_adjusted_price` to anon) | `anon_execute=t` | CAUGHT — C4 |
| D9 | over-reach: revoke anon's `SELECT (name)` on products | `anon_reads_name=f` | CAUGHT — O5 |
| D10 | **inherited-role escape**: grant a group role, add anon to it | `anon_via_inherited_role=t`, **`grants_naming_anon=0`** | CAUGHT — C1 |
| D11 | vacuity: DROP one of the 28 | `signatures=0` | CAUGHT — V1 |
| D12 | partial closure: re-open just one of the 28 | `anon_on_bounds=t` | CAUGHT — C1 |

**D10 is the one that proves the gate's shape is right.** No grant names `anon` at all
(`grants_naming_anon = 0`), yet `anon` reaches the function through role membership. A gate
that scanned `proacl` for an entry naming `anon` would report the surface closed. This gate
uses `has_function_privilege` — an **effect** test — and catches it. Migration 379's history
records an earlier gate in this programme being defeated by exactly this.

**A2.12(b)'s "numeric returned as a JSON string"** has no attack surface here: this gate
makes no HTTP or JSON read; every check is a catalogue lookup or a direct call. Said rather
than skipped. Its nearest analogue — a check that passes because it is testing identity
rather than effect — is D10, and it is covered.

## 5. Live verification after the apply (A0.9a)

```
NOTICE:  get_product_sale_price   as anon -> permission denied (42501). CLOSED.
NOTICE:  get_product_price_bounds as anon -> permission denied (42501). CLOSED.

 anon_can_execute_of_28 | auth_can_execute_of_28 | total
------------------------+------------------------+-------
                      0 |                     28 |    28
```

A5.32 warns that RLS returns zero rows silently while a privilege revoke returns `42501`,
and that the two must never be confused. This is `42501` — a refusal, not an empty result.

### `/api/public/products`, before and after (v8 mission 6, requirement e)

```
BEFORE status: 200   count: 199   price key present on: 199   price !== 0 on: 0
AFTER  status: 200   count: 199   price key present on: 199   price !== 0 on: 0
keys (both): capacity,id,is_active,model,name,price,stock_status
```

Byte-identical behaviour. The feed's zero is flag-controlled (`PUBLISH_PUBLIC_PRICES`), and
this migration did not touch it.

---

## 6. OG-38 — the monitoring the owner asked for, set up here

The owner's decision (2026-08-26): **do not `NOLOGIN`** the role; instead record its
connections for a period and report.

`ALTER ROLE supabase_read_only_user SET log_connections = on` is **not possible** —
measured, not assumed:

```
ERROR:  parameter "log_connections" cannot be set after connection start
```

`log_connections` is a backend-start parameter, so a per-role setting never takes effect. It
was therefore enabled globally by reload — no restart, and reversible:

```
ALTER SYSTEM SET log_connections = on;   SELECT pg_reload_conf();  -> t
SHOW log_connections -> on
monitoring window opened: 2026-08-26 11:57 Tehran
```

Proven to capture this specific role rather than assumed:

```
127.0.0.1 … [96969] supabase_read_only_user@afrakala LOG:  connection authorized:
            user=supabase_read_only_user database=afrakala application_name=psql
```

**That captured line is this session's own verification probe** — it must not be counted as
evidence of a real consumer. Any genuine consumer will appear as a *later* entry with a
different `application_name` or source address.

**To read the window:**

```bash
docker logs --since 24h afrakala-lan-db 2>&1 | grep supabase_read_only_user
```

**To turn it off again:**

```bash
docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
  -c "ALTER SYSTEM RESET log_connections; SELECT pg_reload_conf();"
```

Note the cost: `log_connections` is global, so every connection in the cluster is logged,
including PostgREST's pooling. That is noise, not risk, and it is the price of catching
short-lived connections that `pg_stat_activity` sampling would miss. **OG-38 stays OPEN and
mission 4 stays CONDITIONAL until the window is read.**
