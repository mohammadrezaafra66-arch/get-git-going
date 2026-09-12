# Fix-agent report — AfraKala convergence release

Producer: fix agent. **Nothing here is self-verified.** Every claim below is a command and its
output; the gating agent should re-run them.

## Restore identity

```
$ docker exec afrakala-lan-db md5sum /tmp/prod13.dump
6ccd2dbb07a9a4d9bbae4421eb3265e0  /tmp/prod13.dump

$ pg_restore -U supabase_admin -d prod_rehearsal_fix --no-owner --disable-triggers /tmp/prod13.dump
RESTORE exit=1
pg_restore error count: 21          # pg_cron / vault; expected on a non-'postgres' database

$ SELECT count(*) FROM supabase_migrations.schema_migrations;   -> 681
$ SELECT version ... ORDER BY version DESC LIMIT 1;             -> 20260912150000
```

Matches the briefed fingerprint exactly (681 rows, top `20260912150000`, ~21 restore errors).

Database used throughout: **`prod_rehearsal_fix`** only. `afrakala` was read read-only (one
`SELECT` against its ledger); `postgres` and the production laptop were never touched.

### The twelve applied, md5 verified on both sides

```
20260913090000_526_...  md5=fa1bb671a6bb1373122ab7b9590aa361  exit=0
20260913091000_527_...  md5=1183f08466fe26905e392e27450ca2f8  exit=0
20260913092000_528_...  md5=b806a1fd1f1e9e0bd1f0f2657be758cd  exit=0
20260913094000_530_...  md5=618a0873816e786b2560b450808f9e3a  exit=0
20260913095000_531_...  md5=47a8b2d183040f4b793ecedd9802973d  exit=0
20260913100000_532_...  md5=e012d60e442d613e0cd927ae47e6175d  exit=0
20260913101000_533_...  md5=610c55e02d9480d7082f50950b0e1bfd  exit=0
20260913102000_534_...  md5=6b30be2e620d80f9511ce34b424885d8  exit=0
20260913103000_535_...  md5=5a8d88357a2d6ed4141024c25d085fbf  exit=0
20260913104000_536_...  md5=3a1e4b5d18ea20eaec0827c1ff2da7e3  exit=0
20260913105000_537_...  md5=cf4e1d0907001a07de2e474d87a0a752  exit=0
20260913110000_538_...  md5=7ecf77bd032418372e9af57013aede3d  exit=0
ALL TWELVE APPLIED OK
```

### Editing the twelve is permitted — verified, not assumed

```
$ psql -d afrakala -c "SELECT count(*) FROM supabase_migrations.schema_migrations
                        WHERE version LIKE '20260913%';"
 count
-------
     0

$ git branch -a --contains f802a1d6
* feature/conv-integration
```

None of the twelve has been applied anywhere real and none exists on another branch.
`539` / `20260913111000` is unused on disk and in history.

---

# Item 1 · Migration 539 — the 507 rule for the objects that skipped it

**Status: done, but NARROWER than briefed, and one half of the instruction is REFUSED with
evidence.** Read the refusal before gating this.

## The seven, found from the catalogue

`526` and `535` contain **zero** REVOKE/GRANT statements between them (a count of leading-REVOKE
lines returns 0 in each). The seven SECURITY DEFINER objects they install, measured on
`prod_rehearsal_fix` with all twelve applied:

```
 obj                                            | secdef | anon | authd | svc
 admin_delete_ai_provider(uuid)                 | t      | f    | t     | t
 admin_upsert_ai_provider(13 args)              | t      | f    | t     | t
 asan_list_bank_deposit_export(date,date)       | t      | f    | t     | t
 create_purchase(15 args)                       | t      | f    | t     | t
 delete_bot_api_key_secure(uuid,text)           | t      | f    | t     | t
 get_payables_list(8 args)                      | t      | f    | t     | t
 upsert_staff_daily_performance_metric(8 args)  | t      | f    | t     | t
(7 rows)
```

Four from 526, three from 535. This matches the reviewers' count of seven.

## What I REFUSED, and why

The brief asked for `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` on all seven, plus a
gate failing if any target is still executable by **`authenticated`**. **I did not do the
`authenticated` half.** That gate would fail on its own release, and shipping the revoke would
have taken down seven working features.

Three independent pieces of evidence say the briefed rule is wider than the project's real one:

1. **507's own scope is cron-only.** Its header: *"Any future **cron-only** definer function must
   carry these REVOKEs in the same migration that creates it"*, justified by *"grep -rn over
   `src/` and `server/` finds **ZERO callers** of either name, so no UI, hook or server route
   regresses."*

2. **og61 is a two-sided gate whose OPEN half asserts the opposite.**
   `e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts` introduces its
   `CLOSED_TO_AUTHENTICATED` map with *"Every name here has **NO direct caller in src/ or
   server/**"*, and its second test is titled *"the 26 minus the twenty-one closed are STILL
   reachable by authenticated"*. Revoking `authenticated` on a browser RPC is what that test
   exists to catch.

3. **All seven are browser RPCs with real callers, and all seven are guarded in-body.**

```
create_purchase                        src/hooks/purchase/useCreatePurchase.ts
get_payables_list                      src/routes/_app.accounting.payables.tsx
upsert_staff_daily_performance_metric  src/routes/_app.gamification.admin.manual-metrics.tsx
asan_list_bank_deposit_export          src/lib/asan/export-bank-deposit.ts
delete_bot_api_key_secure              src/routes/_app.bot-api-keys.index.tsx
admin_upsert_ai_provider               src/lib/ai/providers.functions.ts
admin_delete_ai_provider               src/lib/ai/providers.functions.ts
```

Guards, read from `pg_proc.prosrc` on the live catalogue — six use `has_any_role(...)`; the
seventh, `delete_bot_api_key_secure`, uses a `user_roles` membership test instead:

```sql
IF NOT EXISTS (SELECT 1 FROM public.user_roles
                WHERE user_id = v_user_id
                  AND (role::text = 'admin' OR role::text = v_managed_role))
THEN RAISE EXCEPTION 'UNAUTHORIZED: ...' USING ERRCODE = 'P0001';
```

A regex searching only for `has_any_role` reports this one as unguarded. **It is guarded.** Any
reviewer re-deriving the list should not trust a `has_any_role` grep alone.

Revoking `authenticated` would be migration **395** repeated seven times — the incident the brief
itself cites — except immediate and total rather than silent: purchase creation, the payables
list, the ASAN bank-deposit export, manual staff metrics, bot-key deletion and both AI-provider
admin screens would all return 42501.

**Escalated to the owner, not decided by me:** whether a `viewer` should be refused these calls by
the *grant* rather than in-body. That is a product decision with a visible consequence (a 42501
from PostgREST instead of the function's own Persian error message).

## What 539 actually does

Makes the **anon + PUBLIC** closure explicit — the part that is genuinely load-bearing and is
currently inherited from migration 393's FUNCTIONS default — and re-asserts the positive grants,
so all seven ACLs are determined by statements rather than by whatever default is in force at
apply time. Catalogue-driven: `to_regprocedure` per target, `pg_roles` per role, FUNCTION vs
PROCEDURE read from `pg_proc.prokind`.

File: `supabase/migrations/20260913111000_539_explicit_revoke_on_526_535_definers.sql`

## Proof

### Applies, both gates green (E3)

```
host md5 = 36619e8eb84a675b7b3b3417f1512814
cont md5 = 36619e8eb84a675b7b3b3417f1512814   MD5 MATCH
NOTICE:  539: 7 of 7 target(s) present; anon/PUBLIC closed by explicit statement.
NOTICE:  539 GATE A OK: no target is reachable by anon or PUBLIC.
NOTICE:  539 GATE B OK: service_role, authenticated, postgres and supabase_admin all retain
         EXECUTE on every present target.
PASS1 exit=0
```

### The risk is REAL, and GATE A bites (E4 — both halves)

The brief's premise ("one `ALTER DEFAULT PRIVILEGES` away from silently reopening") needed
testing rather than believing, because all seven already carry a **materialised, non-NULL**
`proacl`, and changing a default privilege does *not* retroactively rewrite an existing object's
ACL. The exposure is at **create time** — which is exactly what 526 does to
`asan_list_bank_deposit_export` via `DROP` + `CREATE`.

Probe against the **real** object (definition captured with `pg_get_functiondef`, not a synthetic
stand-in), inside `BEGIN; ... ROLLBACK;`:

```
--- [1] BASELINE
 anon_can_execute | f | postgres=X | supabase_admin=X | authenticated=X | service_role=X

--- [2] ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon;  then DROP + CREATE
--- [3] AFTER
 anon_can_execute | t | postgres=X | supabase_admin=X | anon=X | authenticated=X | service_role=X

--- [4] 539 GATE A re-run standalone in that state
ERROR:  539 GATE A (re-run standalone): still reachable by anon or PUBLIC:
        asan_list_bank_deposit_export(date,date)
ROLLBACK
```

So: (a) the reopening is reproducible on the real object, and (b) the gate **fails** when it
should — it is a sensor, not a formality. Nothing was persisted.

### Second pass changes nothing (E3)

```
PASS2 exit=0   (same three NOTICEs)
$ diff acl_before.txt acl_after.txt
IDENTICAL - second pass changed nothing
```

### No-ops on an absent target rather than aborting (E3)

```
BEGIN; DROP FUNCTION public.delete_bot_api_key_secure(uuid,text); \i 539; ROLLBACK;
NOTICE:  539: 6 of 7 target(s) present; anon/PUBLIC closed by explicit statement.
NOTICE:  539: 1 target(s) absent on this database, skipped (documented no-op):
         public.delete_bot_api_key_secure(uuid,text)
NOTICE:  539 GATE A OK / GATE B OK
exit=0
```

## Honest limitation

**On today's shape, 539 changes no effective permission.** `anon` and PUBLIC already held nothing;
the before/after ACLs are byte-identical. Its value is entirely prospective: when the release is
applied to **production**, 539 runs after 526/535 and forces a known ACL regardless of what
production's default privileges happen to be — which nobody has measured, because production may
not be contacted. That is a real benefit, but it is not a hole being closed today, and it should
not be described as one.

539 also does not protect against a *future* migration recreating one of the seven; a `DROP` +
`CREATE` after 539 inherits the default again, exactly as 526's did. The durable fix for that
class is a gate in CI, not a migration.

## Not done

- No revoke of `authenticated` (refused above).
- No change to 526 or 535 themselves — 539 is additive, so those two files keep the md5s the
  release block already recorded.
- `e2e/security/og61-...spec.ts` was **not** run (no test runner invoked in this session); its
  text was read as evidence, not executed.

---

# Item 2 · Migration 533 — guard `CREATE EXTENSION http`, and close what it creates

**Status: done. One consequence was NOT anticipated by the brief and had to be fixed inside the
same migration — read "The guard broke the procedure" below.**

`533`'s md5 changed: `610c55e02d9480d7082f50950b0e1bfd` -> `578a8fe284db579be13ff326b6f599d4`.
The release block must re-record it.

## What was there

Line 129, outside every guard:

```sql
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
```

with a comment justifying it: *"NOT restricted to database `postgres`. … creating it on
prod_rehearsal_e5 (a copy of afrakala) succeeds (`extversion 1.6`) while pg_cron on the same
database refuses outright. **Safe to create unconditionally.**"*

That confused *can* with *should*. `http` succeeding everywhere is what makes the unguarded form
dangerous. Measured:

```
$ pg_restore -l /tmp/prod13.dump | grep EXTENSION
  pg_cron, pgsodium, btree_gist, pg_graphql, pg_stat_statements, pg_trgm,
  pgcrypto, pgjwt, supabase_vault        <- no http

$ psql -d afrakala -c "SELECT extname FROM pg_extension WHERE extname='http'"
(empty)

$ psql -d prod_rehearsal_fix (fresh restore, before any migration)
 http extension rows: 0
```

So `http` is in neither production nor `afrakala`. It was on the rehearsal databases for exactly
one reason: this line had already run there.

## The three conditions

1. **Guarded, same shape as the pg_cron half** — `IF current_database() = 'postgres' THEN
   EXECUTE '…' ELSE RAISE NOTICE … END IF`, dynamic SQL so an unreached branch never resolves
   against a catalogue that lacks the objects.
2. **All 19 functions revoked from PUBLIC, anon, authenticated**, derived from `pg_depend`
   against the extension, never typed. Plus a gate that fails the migration if any remains
   reachable.
3. **`OWNER DECISION` block** added to the file header, stating in plain terms what installing
   `http` grants the database — outbound GET/POST/PUT/PATCH/DELETE/HEAD to any reachable URL,
   the database as a network pivot, requests unattributable to an end user, exfiltration in a
   single statement, sessions held open by a slow remote — what bounds it, and what does **not**:
   *`http` has no host allowlist; restricting which hosts the DB may call is a network policy on
   the container, outside this migration.*

**§1b is deliberately NOT inside the guard.** It is catalogue-driven, so on a database without
`http` the loop finds nothing and no-ops; on a database that *does* have it — including every
rehearsal copy where the previous unguarded line already installed it — the REVOKEs still run.
Guarding this half too would have left exactly those databases open.

## The guard broke the procedure (E4, both halves)

The brief asked what guarding `http` means for the other objects 533 creates. It means one of
them stops being creatable, and this was found by applying the file, not by reading it.

`run_issabel_import()` declares `v_resp extensions.http_response`. With
`check_function_bodies = on` (the default) PL/pgSQL resolves **declared types at CREATE time**.
On a fresh restore, guard in place, mitigation absent:

```
psql:/tmp/f533.sql:388: ERROR:  type "extensions.http_response" does not exist
533 exit=3
```

The procedure could not simply be guarded away too, because three things name it
unconditionally: the `COMMENT`, the four `REVOKE`/`GRANT` statements right after it (a REVOKE on
an absent procedure is an ERROR that would abort the migration), and
`docs/research/convergence/E-5-proof.md:235`, which CALLs it on a rehearsal database as part of
the existing verification.

Fix, using migration 526's own `\gset` idiom — validation suspended for this one statement and
**only where the type genuinely does not exist**:

```sql
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http')
            THEN 'on' ELSE 'off' END AS m533_cfb \gset
SET check_function_bodies = :'m533_cfb';
CREATE OR REPLACE PROCEDURE public.run_issabel_import() …
RESET check_function_bodies;
```

On production's `postgres` database — the one that actually runs this job — `http` is present,
so validation stays **on** and the body is checked exactly as before.

After the fix, same fresh restore:

```
NOTICE:  533: current_database() = prod_rehearsal_fix, not "postgres" -- the http extension is
         SKIPPED on purpose, exactly like pg_cron and the eight job rows in section 5.
NOTICE:  533: the http extension is not installed on this database -- nothing to revoke
         (documented no-op).
NOTICE:  533 HTTP GATE OK: no http function is reachable by anon, authenticated or PUBLIC.
NOTICE:  533: current_database() = prod_rehearsal_fix, not "postgres" -- pg_cron extension and
         all eight job rows are SKIPPED on purpose.
533 exit=0
```

## Full release still applies on a fresh production-shape restore (E3)

Fresh restore (681 rows, top `20260912150000`, 21 pg_restore errors, http absent), then all
thirteen in filename order, md5 verified both sides on each:

```
526 exit=0   527 exit=0   528 exit=0   530 exit=0   531 exit=0   532 exit=0
533 exit=0 (md5 578a8fe284db579be13ff326b6f599d4)
534 exit=0   535 exit=0   536 exit=0   537 exit=0   538 exit=0   539 exit=0
```

End state:

```
 http_extension_rows | 0                       <- guard held
 run_issabel_import()| prokind=p | anon=f | authenticated=f | service_role=t
```

The procedure still exists and is still closed to browsers — i.e. the guard cost nothing that
533 was relying on.

## Second pass changes nothing (E3)

```
PASS2: no errors      PASS2 exit=0
http rows after pass 2: 0
```

## The REVOKE path and its gate are not dead code (E4)

Since the guard means `http` is never installed here, the §1b loop would otherwise be untested.
Probed inside `BEGIN; … ROLLBACK;` by simulating the postgres branch:

```
--- [1] CREATE EXTENSION http   ->  http_functions = 19
--- [2] GRANT EXECUTE ON extensions.http_post(...) TO authenticated  ->  authd_can_post = t
--- [3] 533 HTTP GATE re-run in that state:
ERROR:  533 HTTP GATE: outbound-HTTP function(s) reachable by anon, authenticated or PUBLIC:
        http_post(character varying,character varying,character varying)
ROLLBACK
```

The loop does find all 19, and the gate **fails** when a hole exists. Nothing persisted.

## The honest cost — this is a real reduction, not a pure win

On this host **no rehearsal database can be named `postgres`** (that name is the live cluster's
own database, which is out of bounds). So after this change:

- The `http` install is **unexercisable here**, exactly like the pg_cron half. Nobody can
  rehearse it before it runs on production.
- The §1b REVOKE of the 19 functions, and the HTTP GATE's passing path, are likewise never
  exercised on a real apply here — only the no-op branch is. The probe above simulates them in a
  rolled-back transaction, which is weaker evidence than an actual apply.
- `docs/research/convergence/E-5-proof.md`'s successful `CALL public.run_issabel_import()` on a
  rehearsal database is **no longer reproducible**, because that database will no longer have
  `http`. That proof was only obtainable because the unguarded line ran.

What was traded away is rehearsal coverage of the `http` path; what was bought is that no
database except the one that needs it silently gains outbound network capability. I think that
is the right trade, but it *is* a trade, and the owner should see it as one.

## Not done

- `service_role` was **not** revoked from the http functions. The brief specified PUBLIC, anon
  and authenticated, and `service_role` is the server-side identity; narrowing it is a separate
  decision. Flagging it anyway: `service_role` is a real credential, and a database with
  outbound HTTP plus a leaked service key is a worse combination than either alone. Worth a
  decision, not taken here.
- Nothing was run against the `postgres` database or the production laptop.

---

# Item 3 · Migration 537 — its own gate was weaker than the migration

**Status: done.** `537`'s md5 changed: `cf4e1d0907001a07de2e474d87a0a752` ->
`7f8d50ac04d4d2270f4a8f73e17464f2`. The release block must re-record it.

## The weakness, confirmed

Line 169 was:

```sql
AND array_to_string(d.defaclacl, ' ') ~ 'authenticated=[a-zA-Z]*D'
```

That asks *"does some ACL entry spell the word `authenticated` followed by a D"* — a question
about the text of one entry, not about what `authenticated` would actually receive. A default
granted to PUBLIC renders with an **empty grantee**:

```
SELECT '=arwdDxt/postgres' ~ 'authenticated=[a-zA-Z]*D';   -->  f
```

## The shipping shape is safe — verified, not believed

```
--- [A] tables in schema public carrying ANY PUBLIC grant
 tables_with_any_public_grant | 0

--- [B] every pg_default_acl entry for TABLES in public
 supabase_admin | postgres=arwdDxt/... | authenticated=arwdxt/... | service_role=arwdDxt/...
 postgres       | postgres=arwdDxt/... | authenticated=arwdxt/... | service_role=arwdDxt/...

--- [D] tables where authenticated holds TRUNCATE
 authd_truncate_tables | 0
```

Zero PUBLIC grants, and `authenticated` carries no `D` in either default entry. So the old gate
could not bite on this release. But a gate that is correct only because of a fact it does not
itself check is not a gate.

## The hardened check

`aclexplode()` expands each default ACL into `(grantor, grantee, privilege_type)` rows, so the
question becomes *"is TRUNCATE granted to anything that would deliver it to `authenticated`"*:

```sql
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
 WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
   AND a.privilege_type = 'TRUNCATE'
   AND (   a.grantee = 0                                                    -- 1. PUBLIC
        OR a.grantee = to_regrole('authenticated')::oid                     -- 2. named
        OR (a.grantee <> 0 AND pg_has_role('authenticated', a.grantee, 'MEMBER')))  -- 3. group
```

Arm 3 uses **`MEMBER`, not `USAGE`**, deliberately. Migration 405 exists because 395's gate
enumerated only `authenticated` and `service_role` and was blind to `products_api_readonly`;
385's repair recorded the rule — *"pg_has_role USAGE tests INHERIT, MEMBER tests SET ROLE"*.
`USAGE` alone would miss a NOINHERIT role `authenticated` can still SET ROLE into.

## Proof that the new gate fails where the old one passed (E4)

Adversarial case constructed inside `BEGIN; … ROLLBACK;`:

```
--- [1] ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
        GRANT TRUNCATE ON TABLES TO PUBLIC;
 supabase_admin | =D/supabase_admin | postgres=arwdDxt/... | authenticated=arwdxt/... | ...

--- [2] THE OLD CHECK (regex)
 old_check_hits | 0            <-- BLIND

--- [3] THE HARDENED CHECK
 new_check_hits | 1            <-- SEES IT

--- [4] is the hole real, or only a catalogue curiosity?
 CREATE TABLE public._probe537_victim (id int);
 authd_can_truncate | t
 relacl | =D/supabase_admin | postgres=arwdDxt/... | authenticated=arwdxt/... | ...

--- [5] the hardened gate raising as it would inside the migration
ERROR:  537: 1 default-privilege entr(y/ies) would still re-grant TRUNCATE to authenticated
ROLLBACK
```

Step [4] is the part that matters: under that default a newly created table really does give
`authenticated` TRUNCATE (`t`). So the old gate would have reported success while every table
created afterwards was truncatable by any signed-in user. Nothing persisted.

## Passes on the real shape, and is idempotent (E3)

```
PASS 1
NOTICE:  537: TRUNCATE revoked from authenticated on 0 table(s); 228 already closed.
NOTICE:  537: default TRUNCATE privilege revoked for grantor(s): supabase_admin, postgres
NOTICE:  537 OK: authenticated holds TRUNCATE on 0 of 228 tables; service_role still holds it on all 228.
exit=0

PASS 2  -- byte-identical output, exit=0
```

The `service_role` half (228 of 228) is unchanged, so the hardening did not over-reach.

## Not done

- The gate's **first** half (`has_table_privilege` over existing tables) was left alone — it
  already folds in PUBLIC and inherited roles correctly, so it has no equivalent blind spot.
- No change to what 537 revokes; only to what it verifies.

---

# Item 4 · The Latin-digit sweep

**Status: done in one commit (`22611452`), 43 files.** The reviewer's headline was right about the
cause and wrong about the shape — see "What the report got wrong".

## The helper — chosen, not invented

Five Persian-digit helpers exist in `src/`. The canonical one is
`src/lib/i18n/formatters.ts` by a wide margin:

```
lib/i18n/formatters      152 importing files      toFaDigits used 349x
lib/dashboard/utils       15                      toPersianDigits used 141x (across 4 modules)
lib/documents/labels       5
lib/purchase/labels        8
lib/settings/labels        4
```

No new helper was added (project rule 14).

## `toLocaleString("fa-IR")` was rejected as the general fix

It localises the digits **and** switches the thousands separator to U+066C, which changes how
every number *looks*, not just which glyphs it uses. The brief forbids changing grouping. The
existing helper already makes the narrower choice, so the rule applied throughout was:

| site already… | fix | why |
|---|---|---|
| grouped via `toLocaleString("en-US")` | `formatNumber` (= `toFaDigits(n.toLocaleString("en-US"))`) | same grouping, Persian glyphs |
| ungrouped (`${n}`, `.toFixed(k)`) | `toFaDigits` alone | no number silently gains separators it never had |

Proved (E4) — grouping and decimals byte-identical, only glyphs differ:

```
value      | BEFORE       | AFTER          | grouping+decimals identical?
1234567    | 1,234,567    | ۱,۲۳۴,۵۶۷      | true
4850000    | 4,850,000    | ۴,۸۵۰,۰۰۰      | true
0          | 0            | ۰              | true
12.5       | 12.5         | ۱۲.۵           | true
1234.56    | 1,234.56     | ۱,۲۳۴.۵۶       | true
98765.4321 | 98,765.432   | ۹۸,۷۶۵.۴۳۲     | true

A real breakdown line:
  BEFORE: نرخ ارز: 58,500 → قیمت خرید تومانی: 4,850,000 تومان
  AFTER : نرخ ارز: ۵۸,۵۰۰ → قیمت خرید تومانی: ۴,۸۵۰,۰۰۰ تومان
```

## What the report got wrong

It said 14 sites come from `src/lib/pricing/engine.ts:59` feeding both
`_app.pricing.calculator.tsx` and `_app.pricing.quick-price.tsx`. **`quick-price.tsx` does not
consume `engine.ts`.** It consumes `src/lib/pricing/quick-price.ts`, which carries its **own
duplicate** of the same line:

```
src/lib/pricing/engine.ts:59       const fmt = (n: number) => n.toLocaleString("en-US");
src/lib/pricing/quick-price.ts:42  const fmt = (n: number) => n.toLocaleString("en-US");
```

Fixing only the reported line would have left the quick-price screen exactly as it was, and a
re-run of the same review would have reported it again. Both now delegate to `formatNumber`:
**26 breakdown lines fixed by two one-line changes.**

Two further leaks in the same strings the report did not mention: `margin_value` is interpolated
raw in `` `سود (%${margin_value})` `` and `` `سود (ترکیبی %${margin_value} + …)` `` in *both*
modules — 4 sites, now wrapped. The modules were already internally inconsistent, hard-coding
`نرخ ارز ۱` and `هزینه حمل: ۰` in Persian two lines away.

## Scale

```
new toFaDigits(...) call sites   80
new formatNumber(...) call sites  5
files changed                    43
```

Plus the 26 render sites covered by the two `fmt` one-liners — roughly **110 rendered numbers**.
The reviewer's "roughly 45" was an undercount.

## Deliberately Latin — left alone

- `src/lib/sales/quote-pdf.ts:65-70` `formatMoney` — carries its own comment: *"Money stays in
  Latin digits with comma grouping. Persian digits mixed with commas and a currency label reorder
  visually inside an RTL run."* Its sibling `fmtNum` is the Persian variant. Overriding a
  documented, deliberate decision is not a sweep.
- **Editable numeric `<input value>`** — `_app.accounting.dynamic-capital.tsx:155,336`,
  `DynamicScoringSection.tsx:490,493`, `_app.gamification.admin.manual-metrics.tsx:319`. All
  `dir="ltr"`; Persian glyphs in a field the user types into would break typing and parsing. Their
  *display* echoes already localise.
- **Identifiers, not quantities** — SKUs (`_app.pricing.calculator.tsx:388`), quote/tracking/
  reference numbers (`quote-share.ts:55`, `_app.sales.quotes.$quoteId.tsx:230`,
  `receipt-ocr-structured.ts:492-496`), currency codes echoed raw in the engine steps.
- **Machine-readable dates** — every `Intl.DateTimeFormat("en-CA"|"en-GB"|"en-US")` (asan export
  filenames, CDR parsing, jalali conversion). `ScoreChart.tsx:12` deliberately uses
  `"fa-IR-u-nu-latn"` for axis ticks.
- **Vendored shadcn primitives** — `ui/chart.tsx:225`, `ui/calendar.tsx:35`. Editing these
  diverges from upstream; localise at the call site if wanted.
- **Never rendered** — `Number(x.toFixed(n))` rounding in `lib/pricing/*`, audit-log payloads,
  LLM prompt context, React keys, URLs, filenames, non-display JSX props.
- `SemanticSearchBar.tsx:113` — a `%` badge explicitly wrapped in `dir="ltr"`; borderline, left
  for a human call.
- **Clock-style `HH:MM`** — `AudioPlayer.tsx:9-10`, `AudioRecorder.tsx:69,72`,
  `_app.presence.tsx:66`. Latin-by-convention for timers; flagged for a decision, not changed.

## Deferred, and why (NOT done)

`StatCard`/`Stat` components that receive a **number prop** and format internally —
`HealthReportTab.tsx:134-139`, `AfraMarketIndexCard.tsx:69-71`,
`MarketRateIngestionHistory.tsx:230-232,281-289`, plus badge counts in `AppSidebar.tsx:298,552,651`,
`_app.popup-center.tsx:29`, `BoardAccessRequestsCard.tsx:57`, `BoardOnlineUsersCard.tsx:26`,
`ConversationsSidebar.tsx:81`, `_app.admin.roles.tsx:265,510`, `_app.admin.workflow-stages.tsx:246`,
`gamification.admin.leagues.tsx:793`, `gamification.admin.kpi-rules.tsx:148`,
`_app.products.attributes.tsx:353`, `_app.pricing.market-intelligence.tsx:231`,
`_app.pricing.sale-lists_.$listId.tsx:874,1015`, `src/lib/sales/quotes.ts:123-158`,
`src/lib/accounting/functions.ts:99`, `receipt-ocr-structured.ts:352`.

Fixing these properly means changing the *component* so every caller benefits, not wrapping at
one call site — a different and larger change than "wrap the digits", and one that alters shared
component signatures. Listed here rather than half-done.

## Verification

```
npx tsc --noEmit   -> 70 errors, PER-FILE IDENTICAL TO BASELINE
                      (18 products.index, 15 admin.sales-reminders, 13 invoices/functions,
                       13 accounting/functions, 6 audit/index, 5 admin.automation)
npm run build      -> ✓ built in 27.77s   BUILD exit=0
npx eslint <43 touched files> -> 0 errors, 69 warnings
                      (all pre-existing @typescript-eslint/no-explicit-any; zero prettier errors)
```

`eslint --fix` was run on the touched files because the longer wrapped lines broke prettier's
wrapping. **Honest note:** that grew the diff from `153 insertions(+), 88 deletions(-)` to
`348 insertions(+), 225 deletions(-)` — the extra churn is prettier re-wrapping, some of it on
lines I did not otherwise touch. The behaviour change is only the digits.

**Not verified:** nothing was rendered in a browser. No screenshot, no running app. The claim
"these now display Persian digits" rests on the helper's measured behaviour plus a clean build —
not on seeing the screens.

---

# Item 5 · The RPC in the public sale-list loader

**Status: done (`a8062f6a`) — and the premise is half wrong, so the call was KEPT.**

## Confirmed cheaply, as asked

```
 relname         | anon_select | authd_select | rls_enabled
 sale_list_items | f           | t            | t
 sale_lists      | f           | t            | t

 fn                             | secdef | anon | authenticated | service_role
 refresh_sale_list_prices(uuid) | t      | f    | t             | t
 refresh_all_sale_list_prices() | t      | f    | f             | t
```

So the brief is right that **for an anonymous visitor** the loader dies at its first query
(line 47, `if (listErr || !list) return null;`) and line 50 is unreachable. The client is indeed
the anon/publishable-key browser client.

## Why removing it would have been wrong

`authenticated` holds **both** the table SELECTs and EXECUTE on the function. The loader works
for signed-in users, and for them line 50 runs and does real work. It is not dead code; it is
code an anonymous visitor never reaches.

Worse, og61 itself carries a justification entry for exactly this:

> `refresh_sale_list_prices`: "… Invoked on sale-list page load
> (**src/lib/public/get-public-sale-list.ts** and the sale-list route); a role gate would blank
> the page for viewers who are allowed to see it."

Deleting the call would have falsified a gate's own recorded reason for leaving the function open
to `authenticated`, while leaving the gate green — the next person re-deriving that list could
reasonably close it and break the sale-list route, which also calls it.

## What was actually fixed

The narrow, real defect the brief identified: supabase-js does not throw, so the bare `await`
discarded every failure silently. The result is now destructured, and a failure warns and
continues (a stale price is not worth blanking a page over). `console.warn` with a bracketed
prefix is the established convention here — 52 uses in `src/lib`, no `no-console` rule.

**This is cleanup. It does not restore the public page, and the page was never broken in the way
the RPC line suggested.**

## What making the page work anonymously would actually require

Measured — the two blockers are narrow and specific:

```
 relname          | anon_select | rls | policies_for_anon
 brands           | t           | t   | 2
 categories       | t           | t   | 3
 products         | t           | t   | 2
 sale_price_types | t           | t   | 3
 sale_lists       | f           | t   | 0      <-- blocker
 sale_list_items  | f           | t   | 0      <-- blocker
```

Four of the six tables are already anon-readable with policies. To make it work anonymously:

1. `GRANT SELECT` to `anon` on `sale_lists` and `sale_list_items`, **plus** an RLS policy on each
   scoped to `status = 'published'` (the grant alone does nothing — RLS is on and there are zero
   anon policies).
2. Decide what happens to the refresh. `anon` must **not** get EXECUTE — og61 asserts that, and
   the function writes. So the refresh has to move to a server route using the service-role
   client, or be dropped for anonymous viewers (who would then see last-published prices).
3. Confirm `sale_lists.terms_text`/`description` and the joined product fields carry nothing
   commercially sensitive, since publishing the list publishes those too.

That is an owner decision about exposing pricing publicly, not a bug fix. **Nothing in that list
was done.**

---

# Final end-to-end run — all thirteen, twice, on a fresh production-shape restore

This is the single run a gate should re-execute. Fresh `pg_restore` of `prod13.dump`
(md5 `6ccd2dbb07a9a4d9bbae4421eb3265e0`), then every `20260913*.sql` in filename order, md5
verified host-vs-container on each, `--single-transaction -v ON_ERROR_STOP=1`.

```
RESTORE exit=1 errors=21
681 rows, top=20260912150000

================ PASS 1 ================                    ================ PASS 2 ================
526 md5=fa1bb671 exit=0     533 md5=578a8fe2 exit=0          every file, same md5, exit=0
527 md5=1183f084 exit=0     534 md5=6b30be2e exit=0
528 md5=b806a1fd exit=0     535 md5=5a8d8835 exit=0
530 md5=618a0873 exit=0     536 md5=3a1e4b5d exit=0
531 md5=47a8b2d1 exit=0     537 md5=7f8d50ac exit=0
532 md5=e012d60e exit=0     538 md5=7ecf77bd exit=0
                            539 md5=36619e8e exit=0

================ END STATE ================
 http_installed | seven_open_to_anon | seven_svc_ok | ledger_rows
              0 |                  0 |            7 |         681
```

- `http_installed = 0` — item 2's guard held; the extension is not created on a database that is
  not named `postgres`.
- `seven_open_to_anon = 0` — item 1's objective.
- `seven_svc_ok = 7` — item 1's anti-over-reach assertion; nothing lost a credentialed path.
- `ledger_rows = 681`, unchanged from the restore — **no migration wrote its own
  `schema_migrations` row.** The operator's step will still get `INSERT 0 1`.

## md5s the release block must re-record

| file | before | after |
|---|---|---|
| `…_533_pg_cron_http_scheduler.sql` | `610c55e02d9480d7082f50950b0e1bfd` | `578a8fe284db579be13ff326b6f599d4` |
| `…_537_revoke_truncate_from_authenticated.sql` | `cf4e1d0907001a07de2e474d87a0a752` | `7f8d50ac04d4d2270f4a8f73e17464f2` |
| `…_539_explicit_revoke_on_526_535_definers.sql` | (new) | `36619e8eb84a675b7b3b3417f1512814` |

The other ten are byte-unchanged.

# Commits

| commit | item |
|---|---|
| `523ebb5e` | report scaffold — restore identity pinned before any fix |
| `f82b6aa8` | **item 1** — migration 539 |
| `86d67c27` | **item 2** — migration 533 http guard + REVOKE + OWNER DECISION |
| `8b6d2c3f` | **item 3** — migration 537 gate hardening |
| `22611452` | **item 4** — Latin-digit sweep (43 files) — carries `Release-note-fa` |
| `a8062f6a` | **item 5** — sale-list RPC kept, error surfaced |

Only item 4 carries a `Release-note-fa` trailer; the other four are internal (migrations, gates,
a comment-and-logging change) and are correctly unpublished.

# Another agent committed into this shared tree mid-run

Recorded because the branch history will look odd otherwise. Between my scaffold commit and my
item-1 commit, HEAD moved by a commit that is not mine:

```
f82b6aa8  feat(db): 539 ...                                    <- mine
9dd237f5  tooling: widen the schema snapshot to twelve ...      <- NOT mine
523ebb5e  docs(convergence): record the rehearsal identity ...  <- mine
f802a1d6  Wave C: the adversary's report ...                    <- the base I started from
```

`9dd237f5` touches `docs/missions/BACKLOG.md`, `docs/missions/convergence/STATE.md`,
`docs/missions/convergence/snapshot-full-coverage-pass1.txt` and `scripts/schema-snapshot.sh` —
no overlap with anything I edited. I did not touch, revert or rebase it.

Every one of my six commits was staged and committed in a single shell invocation with the
pathspec repeated on the `commit`, and each contains only its own files — verified with
`git show --stat` on all six. Nothing of theirs was swept into mine. **The push at the end will
also push their commit**, because it is on this branch ahead of mine; that is a consequence of
the shared tree, not a decision of mine.

# What a gate should look at hardest

1. **Item 1's refusal.** I did not revoke `authenticated` on the seven, against an explicit
   instruction. The evidence is in the report and in 539's header. If the gate disagrees, the
   thing to check is og61's `CLOSED_TO_AUTHENTICATED` criterion and the seven call sites — not my
   summary of them.
2. **Item 2's `check_function_bodies` suspension.** It is scoped to one statement and only where
   the type is absent, but it does mean `run_issabel_import`'s body is unvalidated at apply time
   on non-`postgres` databases. The alternative was worse (see the section), but it is a real
   trade.
3. **Item 2's rehearsal loss.** The `http` install and the revoke of its 19 functions are now
   unexercisable on this host. The probe simulating them is a rolled-back transaction, which is
   weaker than a real apply.
4. **Item 4's untested rendering.** No browser was opened. Build + typecheck + helper semantics
   are all the evidence there is that those screens look right.

# Not done, anywhere in this run

- No `git push` until the end; no merge, no rebase, no branch created, no force, no reset.
- No deploy; the web container and the browser were never touched.
- `afrakala` was read once, read-only (a ledger `SELECT`). `postgres` and every other
  `prod_rehearsal_*` were untouched. The production laptop was never contacted.
- **No test runner was invoked.** `e2e/security/og61-…`, `og81-…` and the rest were read as
  evidence; none was executed. Any claim here about a spec is a claim about its text.
- No secret file was read, moved, copied or printed.
