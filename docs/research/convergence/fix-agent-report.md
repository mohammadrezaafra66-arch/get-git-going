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
