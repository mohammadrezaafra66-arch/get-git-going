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
