# Devil's Advocate — convergence release, Stage 2 gate

**Mandate.** Find three ways this gate could be green and still wrong, and go and check each one.
Read-only everywhere. One scratch database, `prod_rehearsal_da`, and nothing else.

**Position.** I read the producers' reports to find claims to falsify, not to inherit conclusions.
Every number below is a command and its output, taken on a database I restored myself. Where I
could not measure, I say INCONCLUSIVE rather than guess.

---

## 0 · Provenance of everything that follows

```
$ docker exec afrakala-lan-db sh -c 'ls -l /tmp/prod13.dump; md5sum /tmp/prod13.dump'
-rw-r--r-- 1 root root 35424962 Sep 12 14:11 /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump          <-- matches the brief

$ pg_restore -U supabase_admin -d prod_rehearsal_da --no-owner --disable-triggers /tmp/prod13.dump
pg_restore: warning: errors ignored on restore: 21          <-- all cron/vault, as documented

         db        | ledger_rows |   ledger_top   | tables | views | funcs
-------------------+-------------+----------------+--------+-------+-------
 prod_rehearsal_da |         681 | 20260912150000 |    227 |    24 |   855
```

Ledger **681 / `20260912150000`** — the fresh-restore signature the brief requires. Nothing with a
`20260913` version is present, so this database has not seen the release.

All twelve were then applied by stdin with md5 verified on both sides, `--single-transaction`,
`ON_ERROR_STOP=1`. The two orchestrator-authored ones, verbatim:

```
---- 20260913105000_537_revoke_truncate_from_authenticated.sql  md5=cf4e1d0907001a07de2e474d87a0a752 (both sides) ----
NOTICE:  537: TRUNCATE revoked from authenticated on 215 table(s); 13 already closed.
NOTICE:  537: default TRUNCATE privilege revoked for grantor(s): supabase_admin, postgres
NOTICE:  537 OK: authenticated holds TRUNCATE on 0 of 228 tables; service_role still holds it on all 228.
---- 20260913110000_538_close_anon_execute_on_pre393_functions.sql  md5=7ecf77bd032418372e9af57013aede3d (both sides) ----
NOTICE:  538: closed 36 function(s) to anon; issued 23 preserving grant(s); 0 skipped.
NOTICE:  538 OK: anon executes 0 outside the exclusions. authenticated 802 / service_role 856 of 856 public functions.
```

### Headline numbers, re-derived by me from my own restore

| measure | record says (STATE.md:714-723) | I measured | agree? |
|---|---|---|---|
| ledger rows / top (before) | 681 / `20260912150000` | 681 / `20260912150000` | yes |
| tables `relkind IN ('r','p')` after | 228 | **228** | yes |
| views + matviews after | 24 | **24** | yes |
| anon-readable relations after | 20 | **20** | yes |
| anon-exec outside og102's 17 exclusions, before | 39 | **39** | yes |
| ...after the other eleven | 36 | **36** | yes |
| ...after 538 | 0 | **0** | yes |
| `authenticated` holding TRUNCATE | 214 -> 0 | 214 before -> **0** after | yes |
| `SECURITY DEFINER` functions after | 444 | **444** | yes |
| `persons` / `audit_logs` rows | 4,857 / 112,696 unchanged | **4,857 / 112,696** | yes |
| anon **write** surface | (not stated) | **0 tables**, before and after | — |

**No headline number in the record is wrong.** One deserves its unit, per the project's own counting
rule: *"`authenticated` holding TRUNCATE: 214"* means **214 tables in schema `public`**, and the
operator will see **215** at apply time, because 534 creates `cron_run_log` before 537 runs and it
inherits the default. Both numbers are correct; only one is printed.

---

## ATTACK 1 — 538 derived its target set from the catalogue, never from the source. Is `get-public-sale-list.ts:50` really the only anon-identity caller among the 36?

### Hypothesis
V-2 grepped **two** function names (`refresh_sale_list_prices`, `bot_authenticate_key`) across
`src/` and `server/`. The same blind spot applies to the other 34 and to every indirect path. A
second anon call site — or a view, policy, default, or trigger that reaches one of the 36 on anon's
behalf — turns a correct security fix into a customer-visible 42501.

### The check

**(a) All 39 names, whole repository, not two names in two directories.** I derived the 39 from the
restore using 538's own predicate, then swept every `.ts/.tsx/.js/.mjs/.json/.yaml/.py` file outside
`node_modules`, classifying each call site by the client it uses.

Result: **31 of the 39 have at least one source reference. Exactly one executes as `anon`.**

| identity | call sites | verdict |
|---|---|---|
| `anon` (browser client, no session) | `src/lib/public/get-public-sale-list.ts:50` -> `refresh_sale_list_prices` | the one V-2 found |
| `service_role` (`supabaseAdmin`) | `src/server/bot-api.ts:286`, `src/routes/api.public.bot.market-matches.resolve.ts:143`, `src/routes/api.public.bot.dynamic-tables.$tableId.rows.upsert.ts:274` | unaffected; `service_role=X` survives 538 |
| `authenticated` (all `_app.*` routes and the libs they import) | the remaining ~30 | unaffected; `authenticated=X` survives 538 |

The unauthenticated browser surface is small enough to enumerate exhaustively — `src/routes/` minus
`_app*` is `index.tsx`, `login`, `register`, `reset-password`, `pending-approval`, `unauthorized`,
the oauth consent page, `sitemap[.]xml.ts`, `mcp.ts`, and `public.sale-lists.$listId.tsx`. Only the
last reaches any of the 39. I read its import list directly: `sale-list-header`, `sale-list-table`,
`get-public-sale-list` — nothing touching the PDF or observatory helpers.

**(b) The five indirect vectors, which no grep can see.** Run against the pristine restore:

```
=== B) anon-readable VIEW bodies that call one of the 39 ===          (0 rows)
=== C) RLS policies on anon-readable TABLES referencing one ===       (0 rows)
=== D) column DEFAULTs / generated columns referencing one ===        (0 rows)
=== E) CHECK constraints referencing one ===                          (0 rows)
=== F) ANY policy anywhere in public referencing one ===              (0 rows)
=== J) trigger functions on anon-writable tables referencing one ===  (0 rows)
=== G) ANY view in public whose body calls one of the 39 ===
      view_name       |          calls           | anon_select
 api_products_pricing | get_product_price_bounds | f
```

One hit, and it is the 395->405 casualty itself. `products_api_readonly` reads exactly two views
(`api_products_pricing`, `api_product_price_rows`) and held `can_exec = 24 / own_grant = 0` — the
textbook "depends on PUBLIC" shape. So I tested it behaviourally **after** the twelve:

```
SET ROLE products_api_readonly;
 current_user: products_api_readonly
SELECT * FROM public.api_products_pricing LIMIT 1;
 ... price_bounds | {"has_any": true, "cap_price": 121485000, "max_price": 115700000, "min_price": 107400000}
(1 row)

acl on get_product_price_bounds(_product_id uuid, _sale_price_type_id uuid):
  supabase_admin=X/..., postgres=X/..., authenticated=X/..., service_role=X/...,
  products_api_readonly=X/supabase_admin        <-- the preserving grant, present
```

The `price_bounds` column is produced by `get_product_price_bounds`. It returns real data while
acting as the role. **Migration 405's regression is not repeated — proven behaviourally, not from
the catalogue.**

**(c) The one anon path, probed:**

```
SET ROLE anon;
NOTICE:  PROBE anon refresh_sale_list_prices -> SQLSTATE=42501 permission denied for function refresh_sale_list_prices
```

### Verdict: **REFUTED. The gate holds.**

`src/lib/public/get-public-sale-list.ts:50` is the only anon-identity call site among all 39, not
merely among the 2 that were grepped, and no view, policy, default, constraint or trigger reaches
any of them on anon's behalf.

### But one claim in the record is wrong — and wrong in the release's favour

V-2's **F-1** states the effect of that 42501 as: *"the page still renders — showing whatever
`sale_list_items.current_price` last held... an anonymous visitor sees prices only as fresh as the
last visit by a logged-in user."*

That cannot happen. The page never rendered for an anonymous visitor in the first place:

```
=== anon grants on the public sale-list page tables ===
 sale_lists      | supabase_admin=arwdDxt/... postgres=arwdDxt/... authenticated=arwdxt/... service_role=arwdDxt/...
 sale_list_items | supabase_admin=arwdDxt/... postgres=arwdDxt/... authenticated=arwdxt/... service_role=arwdDxt/...
                                                                   ^^ no anon entry on either

SET ROLE anon;
NOTICE:  PROBE anon SELECT sale_lists      -> SQLSTATE=42501 permission denied for table sale_lists
NOTICE:  PROBE anon SELECT sale_list_items -> SQLSTATE=42501 permission denied for table sale_list_items

SELECT count(*) FROM public.sale_lists WHERE status='published';   -->  0
```

`getPublicSaleList` opens with `supabase.from("sale_lists")...maybeSingle()` and returns `null` on
error (`src/lib/public/get-public-sale-list.ts:38-46`), so the route calls `notFound()`. Neither
table is among the 20 anon-readable relations before **or** after the twelve, so this is pre-existing
and untouched by the release. And production holds **zero** published sale lists.

**Effect on the verdict: F-1 should be downgraded from a functional regression to a no-op.** The
release has one fewer user-visible consequence than the record claims. Separately, and outside this
mission's scope: the public price-list feature is dead for logged-out visitors on production today,
for reasons that predate this release.

---

## ATTACK 2 — 537 has the exact blind spot 538 spends fifty lines avoiding

### Hypothesis
Both migrations were written by the orchestrator, about the same subject: privileges. 538 reasons at
length that "revoking from anon on those 24 changes the catalogue and changes nothing ... PUBLIC has
to go too" (migration 538, lines 40-49). **537 never mentions PUBLIC once.** If any table in `public`
grants TRUNCATE to PUBLIC, then `has_table_privilege('authenticated', ..., 'TRUNCATE')` is true,
`REVOKE ... FROM authenticated` removes nothing, and 537's own gate at lines 160-162 raises —
aborting the whole release block on the owner-typed production run. Worse, 537's default-privilege
gate greps for the literal string `authenticated=`, so a default granting TRUNCATE to **PUBLIC** would
sail past it and the hole would reopen one `CREATE TABLE` at a time while the gate printed OK.

### The check

```
=== tables where PUBLIC holds ANY privilege (relacl grantee = 0) ===
 relname | acl
---------+-----
(0 rows)

=== TRUNCATE holders on public tables, from relacl ===
    grantee     | tables_with_explicit_TRUNCATE
 service_role   |  227
 supabase_admin |  227
 authenticated  |  214
 postgres       |  213

=== has_table_privilege view (i.e. including any PUBLIC/inherited route) ===
 service_role 227 | postgres 227 | supabase_admin 227 | authenticated 214
```

No PUBLIC grant exists on any table in `public`, so the two views agree exactly and 537's abort
scenario cannot fire on production's shape. Confirmed by running it: `537: TRUNCATE revoked from
authenticated on 215 table(s); 13 already closed`, gate passed.

The second half of the hypothesis, tested directly:

```
SELECT ('=arwdDxt/postgres authenticated=arwd/postgres' ~ 'authenticated=[a-zA-Z]*D');
 gate_would_catch_public_grant
-------------------------------
 f
```

And I widened the scope beyond schema `public`, which 537 never leaves:

```
=== tables authenticated can TRUNCATE, BY SCHEMA (all schemas) ===
 schema | count
 public |  214            <-- and nothing else, anywhere
=== anon TRUNCATE, by schema ===
(0 rows)
```

Finally I falsified 537's central safety claim — "nothing legitimately needs it, and that was
measured, not assumed" — from scratch, and widened it from functions-in-`public` to every routine in
every schema, plus TRUNCATE-level triggers:

```
             proname              | prokind | secdef |     owner      |    truncate_stmt
 bot_query_table_rows             |    f    |   t    | supabase_admin | TRUNCATE _bot_q_rows
 export_dynamic_table_rows        |    f    |   t    | supabase_admin | TRUNCATE _x_rows
 query_dynamic_table_rows         |    f    |   t    | supabase_admin | TRUNCATE _q_rows
 recompute_dynamic_capital_setting|    f    |   t    | supabase_admin | TRUNCATE _sp_cust
 run_daily_capital_allocation     |    f    |   t    | supabase_admin | TRUNCATE _sp_cust
(5 rows)   -- identical to the header's list; all SECURITY DEFINER, all owned by supabase_admin,
           -- every target a session-local temp table

every other schema:                                                   (0 rows)
TRUNCATE-level triggers anywhere:                                     (0 rows)
the 13 tables already closed:            exactly the 13 named in the header, verbatim
TRUNCATE grants from a grantor other than postgres/supabase_admin:    0
```

Every factual claim in 537's header is true, including the 13-table list and the five-function list.

### Verdict: **REFUTED on the shape that will ship. CONFIRMED as a latent gate defect.**

537 is safe and correct on production's actual catalogue: no PUBLIC grant exists, no other schema is
exposed, nothing needs the privilege. It will not abort and it does not over-reach.

The latent defect is real but cannot fire today: 537's default-privilege gate (lines 164-173) is
blind to a PUBLIC-granted default, measured above. Two secondary notes, cost-free to record and
expensive to rediscover:

- `pg_default_acl` carries `authenticated=arwdDxt/postgres` for schema **`storage`** as well as
  `public`. 537 fixes `public` only, and its gate only checks `public`. Nothing is exposed today —
  `authenticated` holds TRUNCATE on 0 tables outside `public`, because storage's tables are created
  by `supabase_storage_admin`, not by a grantor that default applies to. It is one storage-service
  upgrade away from mattering.
- **Ship it.** Cost to fix: one word (`FROM authenticated, PUBLIC`) and one regex. Cost to ship
  unfixed: zero today, and a silent false-pass if anyone ever writes a `GRANT ... TO PUBLIC` in this
  schema. Follow-up, not a re-gate.

---

## ATTACK 3 — the idempotency proof's snapshot omits exactly the two dimensions the two orchestrator-authored migrations change

### Hypothesis
The snapshot tool was already caught once comparing views only by `reloptions`, reporting "identical"
while 526 rewrote two view bodies (`INTEGRATION-LOG.md:233-238`). Its corrected coverage is
enumerated at `INTEGRATION-LOG.md:229-231`: relations, view definitions, columns, column defaults,
function bodies, policy qual/with_check, constraints, triggers, **table** grants, per-function
**anon/authenticated** EXECUTE, indexes.

Line that up against what 537 and 538 actually write:

| migration | what it writes | in the snapshot? |
|---|---|---|
| **537** section 2 | `pg_default_acl`, two grantors | **no** |
| **538** section 1a | per-function EXECUTE **for `products_api_readonly`** | **no** — only anon and authenticated are captured |

So "identical across 15,422 snapshot lines" was, as evidence, **silent on the only two dimensions the
two producer-is-gate artifacts actually change.** The proof method was chosen by the same person
whose work it certifies, and it happens not to look where that work lands. That is a textbook blind
spot: not a lie, a thing not thought of.

### The check

I built a snapshot of the dimensions the tool omits — `pg_default_acl` (all schemas, all objtypes),
**full** function ACLs for every role, `relrowsecurity`/`relforcerowsecurity`, policy polcmd /
polpermissive / polroles (the tool captures only qual/with_check, so a policy's command or TO-roles
could change invisibly), column-level ACLs, sequence ACLs, function prosecdef / provolatile / owner /
proconfig, relation owner and reloptions, and triggers **outside schema `public`** (the tool's known
gap, admitted for 532 at `INTEGRATION-LOG.md:267-270`).

**2,877 catalogue lines.** Snapshot S1 after pass 1; re-applied all twelve; snapshot S2.

```
$ wc -l  S1_blindspots.txt S2_blindspots.txt
  2903  2903
$ md5sum S1_blindspots.txt S2_blindspots.txt
81b495967a346a5d66721705a4344dff  S1_blindspots.txt
81b495967a346a5d66721705a4344dff  S2_blindspots.txt
$ diff S1_blindspots.txt S2_blindspots.txt
NO DIFFERENCES
```

Pass 2 behaved as a correct idempotent migration should — it did nothing, and said so:

```
PASS2 ...537... rc=0   NOTICE: 537: TRUNCATE revoked from authenticated on 0 table(s); 228 already closed.
PASS2 ...538... rc=0   NOTICE: 538: closed 0 function(s) to anon; issued 0 preserving grant(s); 0 skipped.
```

All twelve returned rc=0 on pass 2; no ERROR or FATAL in any output.

### Verdict: **the evidence gap is CONFIRMED; the defect it was hiding is REFUTED.**

The gate's idempotency claim genuinely did not cover `pg_default_acl` or non-anon/authenticated
function grants, and those are precisely what 537 and 538 write. The claim was weaker than it read. I
closed the gap by measurement rather than argument: across 2,877 additional catalogue lines in nine
dimensions the tool never looked at, a second full pass changes **nothing**.

Cheap recommendation: add `pg_default_acl` and full `proacl` (not just two roles) to the snapshot tool
before the next release uses it. Otherwise the next migration touching a default privilege gets a
green idempotency proof that means nothing.

---

## 4 · What else I went and checked — each a claim I expected to break, and did not

**4.1 — The gate finding on 531 was "a required change before the release". Was it made?**
Line 67 of migration 531 still reads a bare `DROP CONSTRAINT audit_logs_actor_id_fkey;` with no
`IF EXISTS` — which is what the gate flagged. But reading the caller as well as the line: it sits in
the ELSE arm of a three-way IF on `pg_constraint.confdeltype` (lines 49-71), reached only when the
constraint exists and has the wrong action. The absent case creates it fresh (lines 57-61); the
already-correct case no-ops (lines 62-63). **Fixed properly, and better than the one-word fix that was
asked for.** Verified live in both passes: pass 1 `NOTICE: 531: ... delete action was a — replacing
with ON DELETE SET NULL`, pass 2 `NOTICE: ... is already ON DELETE SET NULL — no change`, and the
verify block re-reads the catalogue rather than trusting the ALTER TABLE echo.

**4.2 — Do the counted test suites depend on specs that read the live `afrakala` database?**
`e2e/helpers/pgrest.ts:38-41` hard-codes `http://192.168.170.8:${SUPABASE_API_PORT}` and never reads
`E2E_DB_NAME` — confirmed by reading the file. **54 spec files import it.** The record already knows:
`INTEGRATION-LOG.md:549-558` tabulates the three helpers and states the scoped set is the 16 that use
`db.ts`/`tx.ts` only; `:627-633` names the seven pgrest specs excluded **by name** and explains that an
earlier run including them reported 39 did-not-run. **Pre-empted in the record, correctly. I could not
find a counted claim that rests on one.**

**4.3 — 538's role reasoning was validated against a role catalogue the dump does not contain.**
A `pg_dump` of one database carries no roles. Confirmed:

```
$ pg_restore -f - /tmp/prod13.dump | grep -cE "^(CREATE|ALTER) ROLE"
0
```

538's preserve loop iterates `pg_roles` **live** (migration 538, lines 186-199), and rolsuper /
rolinherit / pg_auth_members are cluster state, not dump state. The header's *"Measured on the
production dump, the roles that satisfy the second half are exactly six"* is therefore a measurement
of the **test cluster's** role list wearing production's name.

How far does that reach? I bounded it from the dump's own grant statements:

```
$ pg_restore -f - /tmp/prod13.dump | grep -oE "TO [A-Za-z_\"]+$" | sort | uniq -c | sort -rn
   1131 TO service_role     1112 TO postgres      1068 TO authenticated      574 TO anon
      5 TO pgsodium_keyholder   4 TO supabase_auth_admin   3 TO supabase_functions_admin
      3 TO supabase_admin       3 TO products_api_readonly  3 TO pgsodium_keyiduser
      2 TO dashboard_user
```

Every grantee in production's own data exists on this cluster, and `pg_restore` reported 21 errors all
in cron/vault, so no GRANT failed for a missing role. **Condition (ii) of 538 — "holds at least one
explicit privilege on a `public` relation" — is read from `relacl`, which IS in the dump, so it is
faithfully rehearsed.** I re-derived it: exactly `anon, authenticated, postgres,
products_api_readonly, service_role, supabase_admin`. Six, as the header says.

I chased the one apparent divergence to the end. `supabase_functions_admin` appears in production's
dump and does **not** exist on this cluster — which would have meant 538 meeting a role no rehearsal
had. It collapses: the only statements naming it are inside `extensions.grant_pg_net_access()`, an
event-trigger body guarded by `IF ... ext.extname = 'pg_net'`, and the dump's extension list has no
`pg_net`. The role does not exist on production either.

**Verdict: INCONCLUSIVE, residual bounded and small.** The unmeasurable case is a login role the owner
created on production that holds no explicit privilege on any `public` relation and reaches `public`
functions only through PUBLIC. Such a role loses EXECUTE on 24 functions silently — the same class 538
deliberately drops (`dashboard_user`, `supabase_read_only_user`, `pgbouncer`, the `pgsodium_*` roles).
**One line of pre-flight on the production laptop before the 538 block settles it, and costs nothing:**

```sql
SELECT rolname, rolsuper, rolinherit, rolcanlogin FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY 1;
```

If that returns exactly the 16 names this cluster has, 538's header is true as written.

---

## 5 · One thing the release changes that no gate in this repository covers

Not one of my three attacks — it survived the attack — but it is the single item I would not let
through without the owner having read it, because it is *uncovered* rather than wrong.

**Migration 533 installs a new C extension on production, and it does so OUTSIDE the
`current_database() = 'postgres'` guard.**

```
migration 533, line 129:   CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
migration 533, line 506:   IF current_database() = 'postgres' THEN   <-- the guard starts 377 lines later
```

Gate finding G-2 records 533's production branch as unexercisable here and asks Stage 3 for a pg_cron
pre-flight. That framing understates the scope: **line 129 runs on every database, including mine**,
and it is the one part of 533 that changes production's attack surface. Production does not have this
extension today — from its own dump:

```
CREATE EXTENSION IF NOT EXISTS pg_cron | pgsodium | btree_gist | pg_graphql | pg_stat_statements
                              | pg_trgm | pgcrypto | pgjwt | supabase_vault | uuid-ossp | vector
                                                            ^^ no http, no pg_net
```

`extensions.http()` is an arbitrary outbound HTTP client running inside the database. Both `anon` and
`authenticated` hold USAGE on schema `extensions` (nspacl: `anon=U/supabase_admin`,
`authenticated=U/supabase_admin`). So I measured whether the release hands an unauthenticated caller
an SSRF primitive:

```
=== EXECUTE on all 19 functions the http extension installed ===
 fn                                    | anon | authenticated | acl
 http(request http_request)            |  f   |       f       | supabase_admin=X/supabase_admin
 http_get(uri character varying)       |  f   |       f       | supabase_admin=X/supabase_admin
 http_post(uri, content, content_type) |  f   |       f       | supabase_admin=X/supabase_admin
 ... 19 of 19 identical ...

SET ROLE anon;
NOTICE:  PROBE anon extensions.http_get  -> SQLSTATE=42501 permission denied for function http_get
NOTICE:  PROBE anon extensions.http_post -> SQLSTATE=42501 permission denied for function http_post
SET ROLE authenticated;
NOTICE:  PROBE authenticated extensions.http_get -> SQLSTATE=42501 permission denied for function http_get
```

**Closed. But not by anything in 533** — 533 issues no REVOKE on these — **it is closed by migration
393's global FUNCTIONS default-privilege revoke**, the `defaclnamespace = 0, defaclobjtype = 'f'`
entries visible in `pg_default_acl` (`postgres=X/postgres`, `supabase_admin=X/supabase_admin`). Every
new function in every schema arrives owner-only instead of PUBLIC-executable. That is the entire
reason this is safe.

Two things follow, both worth a sentence in the deploy notes rather than a re-gate:

1. **The release's safety here rests on a mechanism 533 never names.** Anyone who re-grants EXECUTE
   ON FUNCTIONS TO PUBLIC by default — which is exactly what og78's sibling tests exist to permit
   per-schema — reopens it. `e2e/security/og78-default-privilege-restores-are-derived.spec.ts:77-84`
   guards precisely this ("the global FUNCTIONS revoke is gone — 393 has been undone"), so the
   mechanism is gated even though the extension is not.
2. **No gate in this repository asserts the installed extension set.** A grep over `e2e/` for
   pg_extension / CREATE EXTENSION / extname returns exactly one file,
   `og102-pre393-anon-execute-grants-stay-closed.spec.ts`, and it mentions extensions only to
   *exclude* extension-owned functions from its census. So 533 can add a C extension to the production
   database and every suite stays green. A genuine coverage hole, and cheap to close.

---

## Risks, with severity, evidence, and cost

| # | severity | what | evidence | cost now vs cost to ship |
|---|---|---|---|---|
| 1 | record, not code | V-2's **F-1** describes a user-visible staleness regression that cannot occur — anon holds no SELECT on `sale_lists` / `sale_list_items`, and production has 0 published lists | probes in Attack 1; relacl of both tables | edit one paragraph · shipping it costs a future reader chasing a phantom |
| 2 | latent | 537's default-privilege gate cannot see a PUBLIC-granted default (its regex returns false on `=arwdDxt/postgres`); 537's scope stops at schema `public` while a `storage` default exists | migration 537 lines 164-173; regex evaluated live | one word plus one regex · cannot fire on today's shape |
| 3 | method | the idempotency snapshot omits `pg_default_acl` and non-anon/authenticated function grants — the two things 537/538 write | `INTEGRATION-LOG.md:229-231` vs migration 537 lines 112-135 and migration 538 lines 185-203 | add two queries to the tool · I closed it for *this* release by measurement |
| 4 | uncovered | 533 installs the `http` extension on production, outside the database guard; production does not have it today; no e2e gate asserts the extension set | migration 533 line 129 vs line 506; dump extension list; grep over `e2e/` | name it in the deploy notes · safe today only because of 393 |
| 5 | unknowable here | 538's "exactly six roles" was measured on the test cluster's `pg_roles`; the dump contains zero CREATE ROLE / ALTER ROLE statements | the grep over `pg_restore -f -` output, section 4.3 | one SELECT on the production laptop before the 538 block |
| 6 | cosmetic | migration 538 lines 178-179 still carry the *"authenticator ... inherits theirs"* sentence that lines 78-85 of the same file explicitly retract as false | both blocks are in the shipping file | delete two lines · a wrong comment in a privilege migration is the shape CLAUDE.md's own ingest-market-rates note warns about |

---

## What I checked and found no risk in

- All twelve applied clean, in order, `--single-transaction` plus `ON_ERROR_STOP=1`, md5 verified on
  both sides of the pipe for every file, both passes.
- Every headline number in `STATE.md:714-723`, re-derived independently on my own restore: all agree.
- Every factual claim in 537's header — the 5 TRUNCATE-containing functions (all SECURITY DEFINER, all
  on temp tables), the 13 already-closed tables (verbatim), no TRUNCATE-level trigger anywhere, no
  TRUNCATE grant from an unexpected grantor, no exposure in any schema but `public`.
- 538's preservation of `products_api_readonly` on the 395/405 casualty — **behaviourally**, by
  `SET ROLE` and reading the function-produced column, not by reading an ACL.
- 538's exclusions: anon retains EXECUTE on the 17; anon write surface is 0 tables before and after;
  anon-readable relations 20 before and after.
- The five indirect vectors into the 36 (views, policies, defaults, check constraints, triggers on
  anon-writable tables): all zero.
- 531's gate finding: fixed correctly, better than the fix that was requested.
- The pgrest.ts / live-`afrakala` hazard: already identified, scoped, and excluded by name in the
  record.
- Idempotency across 2,877 catalogue lines in nine dimensions the orchestrator's tool never looked at:
  byte-identical between passes.

---

## Verdict: PROCEED — ship it

I attacked the four artifacts where the orchestrator was both producer and gate, and both openings the
brief named. Both are closed, and I closed them harder than the record had: 538's anon-caller question
extended from 2 function names to all 39 and from two directories to the whole repository, plus five
indirect vectors in SQL; 537's PUBLIC blind spot measured rather than argued; the idempotency proof's
gap closed with 2,877 lines the original tool never captured.

The largest remaining risk is **#4 — 533 adds an outbound-HTTP extension to the production database
and nothing in this repository gates that.** It is safe today, and it is safe for a reason 533 does not
know it depends on.

**Does anything I found change a verdict in the release? No — one finding (V-2's F-1) should be
downgraded from a functional regression to a no-op, and four items belong in the deploy notes, but no
artifact goes RED and nothing here should stop the merge.**
