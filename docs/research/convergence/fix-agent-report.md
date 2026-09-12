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
