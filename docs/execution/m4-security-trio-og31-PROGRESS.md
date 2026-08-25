# MISSION 4 — SECURITY TRIO (OG-38, OG-44, OG-45) + OG-31

Chained execution v7, Phase 2 mission 4. Branch `feature/security-trio-og31`,
cut from `staging` @ `4e128726`.

Owner authority for the OG-31 half: `00-progress.md` phase-1 answer #5 —
*"YES — fold it into the three-part security mission."*

## Environment precondition (v7 STOP block) — PASSED, not assumed

```
$ docker ps --format "{{.Names}}" | grep afrakala-lan
afrakala-lan-auth / -web / -caddy / -db / -kong / -storage / -meta / -rest

$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "select 1;"
 ?column?
----------
        1
(1 row)
```

Environment is **Local**. Production `192.168.170.10` was not contacted at any point.

---

## PHASE 0 — EVERY PREMISE RE-MEASURED (A2.13)

v7 states this mission's premises as fact. Several are confirmed, **three are
wrong or too narrow**, and one is new. Each is measured below, not quoted.

### Summary table

| v7 / gate-row premise | Measured verdict |
|---|---|
| `supabase_read_only_user` holds LOGIN, bypasses RLS, not superuser | **CONFIRMED** |
| It has table-level SELECT on all eight guard views | **CONFIRMED** |
| It is "stopped today only by lacking EXECUTE on `is_viewer_only`" | **TRUE FOR 6 OF 8.** Two views fail on a *different* function first |
| `is_viewer_only` backs 8 views + **91** RLS policies + 1 function | **8 views + 93 policies + 1 function** — 91 plus the two added by migrations 391/392 |
| OG-31: **740** anon-executable functions, **345** SECURITY DEFINER | **741 anon-executable; 342 anon-executable *and* SECURITY DEFINER** (427 secdef in total) |
| The FUNCTIONS default privilege still grants `anon=X` | **CONFIRMED** |
| Blast radius of the global row: `extensions`/`pgsodium`/`graphql`/`vault` | **CONFIRMED, plus `pgbouncer`** — and it strips *every* role, not only `anon` |
| — (in no gate row) | **NEW: the role has NO PASSWORD.** It authenticates only through a `trust` line |

### OG-38 — the role, measured

```
$ docker exec afrakala-lan-db psql -U postgres -d afrakala -c "SELECT rolname, rolsuper,
    rolcanlogin, rolbypassrls, rolvaliduntil, rolconnlimit FROM pg_roles WHERE ..."

         rolname         | rolsuper | rolcanlogin | rolbypassrls | rolvaliduntil | rolconnlimit
-------------------------+----------+-------------+--------------+---------------+--------------
 anon                    | f        | f           | f            |               |           -1
 authenticated           | f        | f           | f            |               |           -1
 authenticator           | f        | t           | f            |               |           -1
 postgres                | f        | t           | t            |               |           -1
 service_role            | f        | f           | t            |               |           -1
 supabase_admin          | t        | t           | t            |               |           -1
 supabase_read_only_user | f        | t           | t            |               |           -1
```

Membership — one row, and it is the whole source of its read access:

```
         member          |    member_of
-------------------------+------------------
 supabase_read_only_user | pg_read_all_data
```

**The finding no gate row carries: it has no password.**

```
         rolname         | has_password | is_scram
-------------------------+--------------+----------
 authenticator           | t            | t
 postgres                | t            | t
 supabase_admin          | t            | t
 supabase_read_only_user | f            |
```

So `rolcanlogin = true` is not, by itself, a credential. What makes it one is
`pg_hba`:

```
 line_number | type  | user_name | address     | auth_method
          84 | host  | {all}     | 127.0.0.1   | trust
          85 | host  | {all}     | ::1         | trust
          90 | host  | {all}     | 192.168.0.0 | scram-sha-256
          91 | host  | {all}     | 0.0.0.0     | scram-sha-256
```

Line 84 admits it with **no credential at all**, from inside the database
container. Proven behaviourally rather than argued:

```
$ docker exec afrakala-lan-db psql -h 127.0.0.1 -U supabase_read_only_user -d afrakala \
    -c "SELECT current_user, session_user, current_setting('is_superuser');"
      current_user       |      session_user       | is_super
-------------------------+-------------------------+----------
 supabase_read_only_user | supabase_read_only_user | off
```

From the LAN (`192.168.0.0/16`) the matching rule is `scram-sha-256` and the role
has no password, so it cannot log in that way. **The reachable surface is
therefore "anything that can already run `docker exec` on the db container" —
which is also `supabase_admin`.** That is a materially smaller exposure than the
gate row's *"second-most powerful credential on this server"*, and it is the fact
the owner needs in order to answer OG-38. It does not make the answer obvious, so
OG-38 stays the owner's (see STOP-AND-ASK).

### OG-45 — the eight views

```
               view_name                | rouser_select | anon_select | auth_select | svc_select
----------------------------------------+---------------+-------------+-------------+------------
 product_computed_prices_public         | t             | f           | t           | t
 publish_recipients_view                | t             | f           | t           | t
 v_dynamic_customer_capital_balances    | t             | f           | t           | t
 v_dynamic_salesperson_capital_balances | t             | f           | t           | t
 v_promotion_suggestions                | t             | f           | t           | t
 vw_account_balances                    | t             | f           | t           | t
 vw_customer_receivables                | t             | f           | f           | t
 vw_supplier_payables                   | t             | f           | f           | t
```

Confirmed: it reaches all eight, including the two `authenticated` cannot.

**But there is no grant to revoke.** Not one of the eight names the role in its
`relacl`; the SELECT arrives entirely through `pg_read_all_data`:

```
 relname (all eight)  | explicit_grant_to_rouser
                      | f

 has_table_privilege('pg_read_all_data','public.vw_supplier_payables','SELECT') -> t
```

So a per-view REVOKE is not available as a remedy — the only levers are the
role's membership, its LOGIN, or the EXECUTE it lacks. The first two are OG-38.

Behaviourally, as the role itself:

```
product_computed_prices_public          ERROR:  permission denied for function is_viewer_only
publish_recipients_view                 ERROR:  permission denied for function is_viewer_only
v_dynamic_customer_capital_balances     ERROR:  permission denied for function _capital_alloc_used
v_dynamic_salesperson_capital_balances  ERROR:  permission denied for function _capital_alloc_used
v_promotion_suggestions                 ERROR:  permission denied for function is_viewer_only
vw_account_balances                     ERROR:  permission denied for function is_viewer_only
vw_customer_receivables                 ERROR:  permission denied for function is_viewer_only
vw_supplier_payables                    ERROR:  permission denied for function is_viewer_only
```

**Correction to the gate row.** *"One `GRANT` away"* is exact for six of the
eight. The two capital-balance views stop on `_capital_alloc_used(text,uuid)`
first — also SECURITY DEFINER, also not executable by the role — so those two are
**two** grants away. The row's conclusion survives; its arithmetic did not.

### OG-44 — what `is_viewer_only` is, and what stands on it

```
          fn          | security_definer | provolatile |      proconfig       |     owner
----------------------+------------------+-------------+----------------------+----------------
 is_viewer_only(uuid) | t                | s           | {search_path=public} | supabase_admin

proacl = {postgres=X, supabase_admin=X, anon=X, authenticated=X, service_role=X}
```

There is **no bare `=X/` entry** — PUBLIC holds nothing, which is precisely why
the read-only role is refused. EXECUTE grid:

```
          role           | can_execute
-------------------------+-------------
 anon                    | t
 authenticated           | t
 postgres                | t
 public                  | f
 service_role            | t
 supabase_read_only_user | f
```

Dependents, counted live:

```
 views_referencing                   | 8
 policies_referencing_is_viewer_only | 93
 functions_referencing               | 1
```

**93, not the 91 v7 states** — and the difference reconciles exactly: migrations
391 and 392 (the last mission) each added a `viewer_restricted` policy that calls
it. The premise was right when written and drifted under the chain's own work.

### OG-31 — the tap, and the census

```
     schema     |    for_role    | objtype |                     defaclacl
----------------+----------------+---------+---------------------------------------------------
 public         | supabase_admin | f       | {postgres=X, anon=X, authenticated=X, service_role=X}
 public         | supabase_admin | r       | {postgres=arwdDxt, authenticated=arwdDxt, service_role=arwdDxt}
 public         | supabase_admin | S       | {postgres=rwU, authenticated=rwU, service_role=rwU}
 pgsodium       | supabase_admin | r / S   | {pgsodium_keyholder=...}
 pgsodium_masks | supabase_admin | f/r/S   | {pgsodium_keyiduser=...}
```

The `f` row for `public` still carries `anon=X`; the `r` and `S` rows no longer
do, which is migration 373 (OG-25) exactly as recorded. **There is no global
(`defaclnamespace = 0`) row**, so `acldefault()` applies and every new function
also receives an implicit PUBLIC grant.

Census of `public`, 840 functions:

| | count |
|---|---|
| anon-executable | **741** |
| already closed to anon (381, 389, 390, …) | 99 |
| SECURITY DEFINER (all) | 427 |
| SECURITY DEFINER **and** anon-executable | **342** |
| — of those, STABLE (safe to probe per A5.31) | 91 |
| — of those, VOLATILE (never call; read the body) | 251 |

v7's *"740 anon-executable, 345 SECURITY DEFINER"* is best read as 741 and 342:
its second number is the anon-executable definer count, not the definer count,
which is 427. Recorded so the next mission does not re-derive it wrongly.

Every schema in which `supabase_admin` owns functions — this decides the blast
radius, and `pgbouncer` is **not** in v7's list:

```
   schema   | fns_owned_by_supabase_admin
------------+-----------------------------
 extensions |                          61
 graphql    |                           6
 pgbouncer  |                           1     <-- pgbouncer.get_auth, proacl NULL
 pgsodium   |                         119
 public     |                         840
 vault      |                           3
```

`pgbouncer.get_auth` is the connection pooler's own credential-lookup function
and its ACL is the bare default, i.e. it runs on the PUBLIC grant. A silent strip
there is a connection-pooling outage, not a cosmetic regression.

---

## PHASE 0b — THE OG-31 MECHANISM, MEASURED RATHER THAN TRUSTED

Six probes in one file, inside an **explicit `BEGIN … ROLLBACK`** (A5.26 — a
reverting probe must never use `--single-transaction`, which commits). Raw output
in `docs/research/og31-function-execute-audit.md`; the outcome:

| probe | what it does | `anon` | `authenticated` | verdict |
|---|---|---|---|---|
| **P1** control — new function in `public`, today | — | **t** | t | the tap is open |
| **P2** schema-scoped REVOKE from PUBLIC **and** anon | the form M3 recorded as failing | **t** | t | **fails** — `anon=X` goes, `=X` (PUBLIC) stays |
| **P3** global REVOKE from PUBLIC + schema REVOKE from anon | the working form | **f** | **t** | **closes**, and `authenticated`/`service_role` survive |
| **P4** same row, new function in `extensions` | the blast radius | f | **f** | **strips every role**, not just anon |
| **P5** P4 + `IN SCHEMA extensions GRANT … TO PUBLIC` | the mitigation | **t** | **t** | prior default restored |
| **P6** new function in `public` after P5 | containment | **f** | — | `public` stays closed |

Two things this changes about the plan:

1. **P2 independently reproduces M3's negative result.** The schema-scoped form
   removes `anon=X` and leaves `=X`, so anon keeps EXECUTE through PUBLIC. The
   global row is genuinely required.
2. **P4 makes the blast radius worse than the gate row says, and P5 makes it
   disappear.** The row frames it as anon losing access in four other schemas;
   measured, *every* role loses it, `pgbouncer` is a fifth schema, and
   `pgbouncer.get_auth` is load-bearing. But a per-schema
   `GRANT EXECUTE ON FUNCTIONS TO PUBLIC` restores the prior default exactly, and
   P6 proves it does not leak back into `public`.

**Therefore the owner decision the gate row flagged as blocking does not have to
be taken.** With the five non-`public` schemas restored in the same migration,
this change's only behavioural effect is in `public` — which is the whole of what
the owner said yes to.

---

## STOP-AND-ASK — one gate, no safe way to decide it here

| # | Gate | Question | Why an agent must not default it |
|---|---|---|---|
| 1 | **OG-38** | Should `supabase_read_only_user` keep `LOGIN` and its `pg_read_all_data` membership, or be dropped / given a `valid_until`? | It is a Supabase-managed reporting role. Removing LOGIN is a platform change with no measured consumer; keeping it leaves a passwordless `BYPASSRLS` login reachable from inside the db container. Both directions are the owner's. A2.7 forbids defaulting a business decision, so this mission applies the conservative option — **change nothing about the role** — and pins its attributes so any future change is visible. |

OG-45 is **not** on this list: it has no agent-available remedy that is not
OG-38 (there is no grant to revoke — see above), so it is closed here as far as it
can be, by assertion.
