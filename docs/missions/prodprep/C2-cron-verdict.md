# C-2 — where cron runs in this environment

Mission C-2, overnight 2026-09-08. Every cell below is a measurement taken tonight on the test
host `192.168.170.8` and its containers. **No packet was sent to `192.168.170.10`.**
**Nothing was installed**: no `CREATE EXTENSION`, no `schtasks /Create`, no `crontab`, and the
stopped WSL distro was not started.

Worktree `D:\AfraKalaTest\wt-prodprep`, branch `feature/prodprep-20260908`.
`git rev-parse HEAD` at start = `9c113aacb19f4593b5583f94af905c34f348e27b`.

---

## 0. Two corrections to the brief, both measured

**(a) It is five jobs succeeding, not six.** The brief says "6 jobs, all running successfully".
`jobid 9` has failed every single day it ran:

```
$ docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
    -tAc "SELECT jobid, status, start_time, left(return_message,120) FROM cron.job_run_details \
          WHERE status='failed' ORDER BY start_time DESC LIMIT 3;"'
9|failed|2026-09-07 06:00:00.01249+00|ERROR:  authentication required
CONTEXT:  PL/pgSQL function generate_birthday_notifications() line 17 at RAISE
9|failed|2026-09-06 06:00:00.024444+00|ERROR:  authentication required
9|failed|2026-09-04 06:00:00.086797+00|ERROR:  authentication required
```

Lifetime totals: **32213 succeeded / 60 failed**, history from `2026-07-11 17:00:00+00` to
`2026-09-07 20:00:00+00`. So pg_cron's reliability record on this machine is excellent, and one
job (`daily-birthday-notifications`, database `postgres`) is broken for a reason that has nothing
to do with the scheduler — it hits the same `auth.uid()`-is-NULL-under-cron trap that migration
`507` documents. **Out of scope for C-2; recorded, not fixed.**

**(b) There is a fourth candidate already on record in this repo**, and my brief lists only three.
`docs/missions/closeout/CONTRACTS.md:975` recommends **a cron sidecar container in
`deploy/lan/docker-compose.yml`** ("Recommendation: A"). I did not silently drop it — it is
measured in §1 alongside the three, and it loses for a reason that is specific to how this stack
is deployed.

---

## 1. The four-axis comparison

Every cell names the command that produced it. Where a cell says UNKNOWN it is because answering
it would have required installing or starting something.

### Axis 1 — does it exist / can it be made to exist?

| | Windows Task Scheduler | WSL Ubuntu | pg_cron + HTTP extension |
|---|---|---|---|
| **Exists today** | **YES.** `Get-Service Schedule` → `Status Running, StartType Automatic`. `where.exe schtasks.exe` → `C:\Windows\System32\schtasks.exe`. `schtasks /Query /FO CSV /NH` → **301 tasks** already registered. | **Distro yes, scheduler UNKNOWN.** `wsl.exe -l -v` → `Ubuntu  Stopped  2` / `docker-desktop  Running  2`. `wsl.exe --version` → `WSL version: 2.6.3.0`. Registry `HKCU:\...\Lxss` → `Ubuntu` at `C:\Users\AFRA\AppData\Local\wsl\{45e92e62-…}`, `ext4.vhdx` **39.46 GB**, last written `9/7/2026 8:09:49 PM`. Whether `cron` is installed inside, and whether `systemd` is enabled in `/etc/wsl.conf`, **cannot be read without booting the distro** → **UNKNOWN by rule.** | **YES, and it is already the project's scheduler.** `SELECT extname, extversion FROM pg_extension` in `postgres` → `pg_cron\|1.6`. Six job rows in `cron.job`, five of them `afrakala-*`, created by `deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql`. |
| **Nothing afrakala-shaped exists yet** | `schtasks /Query /FO CSV /NH \| Select-String 'wsl\|bash\|ubuntu\|afrakala\|issabel'` → **`0`** matches. Also `0` for `afrakala\|issabel\|docker\|pricing\|cron`. | same query, `0` matches — **no task starts the distro at boot, and WSL2 has no built-in distro autostart.** | `cron.job` holds no HTTP job; `http` and `pg_net` are **not created** in either database. `afrakala` has exactly: `btree_gist pg_graphql pg_stat_statements pg_trgm pgcrypto pgjwt pgsodium plpgsql supabase_vault uuid-ossp vector`. |
| **Can be made to exist** | **YES.** `AFRA` is in `net localgroup Administrators` (members: `Administrator, AFRA, VIRA`), so an elevated prompt can register a SYSTEM task. This shell was **not** elevated (`IsInRole(Administrator)` → `False`), so nothing was created. | **YES but with strictly more steps than candidate 1**: boot distro → `apt install cron` (network + package install) → decide `systemd` in `/etc/wsl.conf` or wrap `service cron start` → **plus** a Task Scheduler task at boot to start the distro, because nothing else will. It cannot avoid candidate 1; it is candidate 1 *plus* a Linux VM. | **YES, with no download.** Both shared objects already ship inside the image: `find / -name "http.so" -o -name "pg_net.so"` → `/nix/store/4mb48vs9kb2k0i7xfidzakw0i6vamwzy-postgresql-and-plugins-15.6/lib/http.so` and `…/pg_net.so`; control + SQL at `/usr/share/postgresql/extension/http--1.6.sql`, `http.control`. Supabase's guard permits them: the unnested `supautils.privileged_extensions` contains `http`, `pg_cron`, `pg_net`. **`CREATE EXTENSION` was NOT run — §5 UNKNOWN-1.** |
| **Can it reach the endpoint** | UNMEASURED from the Windows side but near-certain: `0.0.0.0:3100->3000/tcp` is published (`docker ps`) and `curl.exe` ships at `C:\Windows\System32\curl.exe`. | **UNKNOWN** — requires booting the distro. A WSL2 distro does not share the docker bridge namespace, so it would have to go out to `192.168.170.8:3100`. | **MEASURED YES.** Both containers sit on one network (`afrakala-lan_afrakala-lan-net`; db `172.18.0.8`, web `172.18.0.7`) and `docker exec afrakala-lan-db curl …` → `web:3000/login -> 200 in 0.036709s` and `afrakala-lan-web:3000/login -> 200`. The hook itself answers: `POST /api/public/hooks/import-issabel-calls` with no token → **`401`** `{"ok":false,"error":"Unauthorized"}`. |

### Axis 2 — does it survive a reboot?

| | Windows Task Scheduler | WSL Ubuntu | pg_cron |
|---|---|---|---|
| **Verdict** | YES (service is `Automatic` + `Running`), **subject to the shared dependency below.** | **NO, not by itself.** The distro is `Stopped`, WSL2 has no autostart for distros, and `0` scheduled tasks reference wsl/ubuntu/bash. It needs a Task Scheduler `ONSTART`/`ONLOGON` task to exist at all — it inherits every weakness of candidate 1 and adds its own. | **YES — and it is the only candidate whose reboot survival was *observed* rather than argued.** |
| **The observation** | — | — | `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime` → `Saturday, September 5, 2026 12:52:02 PM` (local, UTC+05:00). `docker inspect afrakala-lan-db --format '{{.State.StartedAt}}'` → `2026-09-05T07:52:40Z` = **12:52:40 local, 38 s after boot**, with `restart=unless-stopped`. The scheduler then resumed unaided: `cron.job_run_details` shows `jobid 25` succeeded `2026-09-05 21:00`, `jobid 20` `2026-09-05 22:30`, `jobid 22` `2026-09-05 23:00` — all after that boot. **Machine rebooted; jobs kept firing; nobody intervened.** |
| **Shared dependency all three carry** | `com.docker.service` is `Stopped / Manual`; Docker Desktop runs as **SessionId 1** processes started `9/5/2026 12:52:29 PM` (`Get-Process 'Docker Desktop','com.docker.backend'`), launched from the **per-user** `HKCU:\…\Run` entry `Docker Desktop → C:\Program Files\Docker\Docker\Docker Desktop.exe`. The containers — and therefore the app any candidate must call — come back only when that user session comes back. `AutoAdminLogon` is empty yet session 1 existed 27 s after boot, so the sign-in mechanism is **UNKNOWN** (§5 UNKNOWN-3). Outcome measured once: it worked. | same | same, **except** pg_cron is *inside* the dependency rather than outside it: if the db container is down pg_cron does not fire — and if the db container is down there is nothing to import into either. A Task Scheduler task in that situation fires, fails to connect, and writes a log line nobody reads. |

### Axis 3 — timezone: what would the schedule actually mean?

The three clocks, measured within one second of each other:

```
$ powershell -c "Get-TimeZone; Get-Date -Format o; (Get-Date).ToUniversalTime().ToString('o')"
Id: West Asia Standard Time | (UTC+05:00) Ashgabat, Tashkent
BaseUtcOffset: 05:00:00 | SupportsDaylightSavingTime: False
2026-09-08T01:44:12.1626167+05:00        <- host local
2026-09-07T20:44:12.1638752Z             <- UTC

$ docker exec afrakala-lan-web sh -c 'date; echo "TZ=[$TZ]"; cat /etc/timezone'
Mon Sep  7 20:46:13 UTC 2026 | TZ=[] | no /etc/timezone

$ docker exec afrakala-lan-db sh -c 'PGPASSWORD=… psql … -d postgres -tAc "SHOW cron.timezone; SHOW TimeZone;"'
GMT
UTC
```

| | Windows Task Scheduler | WSL Ubuntu | pg_cron |
|---|---|---|---|
| **Schedule is interpreted in** | **Machine local = UTC+05:00**, with **no way to say otherwise**: `schtasks /Create /?` piped through `grep -iE "zone\|GMT\|UTC"` returns **nothing**. The full switch list is `/RU /RP /SC /MO /D /M /I /TN /TR /ST /RI /ET /DU /K /XML /V1 /SD /ED` — none of them names a timezone. | Whatever `/etc/localtime` inside the distro says — **UNKNOWN, not booted**. WSL2 seeds its clock from the Windows host, so the default is very likely UTC+05:00 too. `cron` does support `CRON_TZ=Asia/Tehran`, the one genuine advantage in this column. | **GMT.** Not merely the GUC — *observed*: `jobid 23` is scheduled `0 20 * * *` and last ran `2026-09-07 20:00:00.02382+00`; `jobid 20` is `30 22 * * *` and ran `2026-09-06 22:30:00.034115+00`. Jobs fire at the stated **UTC** wall-clock minute. |
| **Therefore the five windows become** | Tehran **+1:30**: 09:30, 10:30 · 11:30 → 14:00 every 30 m · 14:30, 15:30, 16:30, 17:30 · 18:30, 19:30, 20:30 · 21:30, 03:30 | the same as Task Scheduler unless `CRON_TZ=Asia/Tehran` is set, in which case the D-39 numbers can be written literally | Tehran **−3:30**: the full 17-row table is §4 |
| **Drift risk** | **The host clock is wrong for the business and may well be corrected.** `West Asia Standard Time` is Ashgabat/Tashkent (+05:00), not Tehran (+03:30). The day someone sets this machine to Iran Standard Time, **all 17 triggers move 1.5 h and nothing warns anyone.** | the same exposure, unless `CRON_TZ` pins it | **immune.** The container is UTC with `TZ` empty and no `/etc/timezone`; `cron.timezone = GMT` is a `postmaster`-context setting in `/etc/postgresql/postgresql.conf`. Changing the Windows timezone cannot move a pg_cron job. |
| **DST** | none anywhere: `SupportsDaylightSavingTime: False` on the host, containers UTC, Iran abolished DST in 2022. All three offsets are fixed year-round. | same | same |

### Axis 4 — what does it cost to set up?

| | Windows Task Scheduler | WSL Ubuntu | pg_cron |
|---|---|---|---|
| **New infrastructure** | A `.cmd`/`.ps1` on the Windows disk plus a task definition. **17 fire times cannot be expressed by one `schtasks /Create`** (it takes a single `/SC`), so it is either an XML import / `Register-ScheduledTask` with 17 `New-ScheduledTaskTrigger` objects, or ~5 separate tasks abusing `/RI`+`/DU`. Elevation is needed for `/RU SYSTEM`; without it the task runs only while `AFRA` is logged on. | everything in the Task Scheduler column **plus** booting a 39 GB distro, `apt install cron`, a systemd/`wsl.conf` decision, and a boot task to start the distro. A strict superset. | **one extension + one function + two job rows** — §3. |
| **New state in the owner's database** | none | none | **Yes, and it must be stated plainly:** `CREATE EXTENSION http` (or `pg_net`) makes new native code callable inside the server — **the database gains outbound HTTP.** Mitigating measurements: the code already ships in the image, it is on Supabase's own allowlist (`supautils.privileged_extensions` contains `http` and `pg_net`), and `pg_net` is *already loaded into this postmaster*: `shared_preload_libraries = 'pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron, pg_net, pgsodium, timescaledb, auto_explain, pg_tle, plan_filter'` and `pg_stat_activity` shows a live `pg_net 0.13.0 worker` (pid 80). |
| **Which database** | n/a | n/a | **`postgres`, not `afrakala`.** Migration `20260905140000_445` records the measured refusal: `ERROR: can only create extension in database postgres / DETAIL: Jobs must be scheduled from the database configured in cron.database_name`. Confirmed live: `cron.database_name = postgres`, `pg_net.database_name = postgres`. **On this host the business database is not touched at all.** |
| **Secret handling** | The token lands in a plaintext file on a Windows box whose `HKCU\…\Run` autostarts **both OneDrive and GoogleDriveFS** — a token file dropped in a synced folder leaves the building. Needs a deliberate path and an ACL. | same | The token goes in `supabase_vault` and is read inside a `SECURITY DEFINER` function, so the job command is just `SELECT public.run_issabel_import();` — **no secret in `cron.job.command`, none in `cron.job_run_details.command`, none in the server log** (note `cron.log_statement = on`, i.e. every job's command text *is* logged, 17×/day). |
| **Failure visibility** | a log file nobody reads — precisely the failure this mission exists to end (`pricing_recompute_queue`: 41,745 pending, last processed 2026-08-11) | same | **`cron.job_run_details`** — the same table that surfaced `jobid 9` above, in one query. This holds only if the HTTP call is **synchronous**; see §2 on `http` vs `pg_net`. |
| **Precedent in this repo** | **none.** `grep -rniE "schtasks\|Register-ScheduledTask\|Task Scheduler"` over `*.md *.ps1 *.sh *.yml` → **0 hits.** | none | **five live jobs**, a documentation migration (`supabase/migrations/20260905140000_445_scheduled_jobs_documentation.sql`) and two scripts whose shape can be copied (`deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql`, `cron-504-schedule-employee-streaks.sql`). |

### The fourth candidate the brief did not list

`docs/missions/closeout/CONTRACTS.md:975` recommends a **cron sidecar container**. The measured
objection is not the one CLAUDE.md predicts:

- CLAUDE.md warns that any new container bind-mounting a host path dies on the OG-68 mount layer.
  **That did not reproduce**: `docker inspect afrakala-lan-db-role-fix` → `exited exit=0
  finished=2026-09-03T23:47:13Z`. The bind mount worked at its last run, so OG-68 is not a
  standing objection tonight and the sidecar is not impossible.
- The objection that *does* stand is **the deploy command**. CLAUDE.md mandates
  `docker compose … up -d --no-deps --build web`. `--no-deps` means a sidecar service declared in
  the compose file is **never started or refreshed by a deploy**; it would need a second,
  separate, easily-forgotten command. A scheduler whose start is a manual step that the documented
  deploy procedure actively skips is how you get 42 completions in a month.

---

## 2. Verdict

**pg_cron, in database `postgres`, calling the hook through the `http` extension.**

Not by the tie-break in the brief — the three are **not** equal, and pg_cron wins on measurements:

1. **It is the only candidate observed surviving a reboot on this machine** (boot 12:52:02 → db
   container 12:52:40 → jobs firing that same evening). For the other two, reboot survival is an
   inference from a service's `StartType`.
2. **It is the only candidate whose schedule cannot drift.** The host runs
   `West Asia Standard Time` (+05:00) — a timezone that is wrong for an Iranian company and that
   somebody will eventually correct. `schtasks` has no timezone field at all (measured: no such
   flag exists), so on the day the host clock is fixed, all 17 Task Scheduler triggers move
   1.5 hours silently. pg_cron reads `cron.timezone = GMT` from the container's config.
3. **It is the only candidate that reports its own failures into a table.** The disease in this
   environment is silent non-execution. With a synchronous HTTP call a non-200 becomes
   `cron.job_run_details.status = 'failed'` with the message — provably visible, because that is
   exactly how `jobid 9`'s daily failure surfaced tonight.
4. **It has precedent; the other two have none.** Five `afrakala-*` jobs, a documentation
   migration, two ready-made scripts. `grep` finds **zero** references to Windows Task Scheduler
   or WSL anywhere in the repo.
5. **The business database is untouched.** On this host the extension and the function land in
   `postgres`, which holds no AfraKala data.

**The honest cost, not glossed:** `CREATE EXTENSION http` gives the PostgreSQL server the ability
to make outbound HTTP calls. That is new capability in the owner's database engine, and it is the
one item in this verdict that is irreversible-by-habit rather than by rule. What softens it: the
shared object already ships in the image, Supabase already lists it as installable
(`supautils.privileged_extensions`), and a sibling (`pg_net`) is **already loaded into this very
postmaster with a live background worker**. The capability is in practice already present;
`CREATE EXTENSION` only exposes it to SQL.

**Why `http` and not `pg_net`, given pg_net is already loaded.** `pg_net` is asynchronous: the
cron job enqueues a request and returns success **whether or not the request ever succeeds**, with
the response landing in `net._http_response` under `pg_net.ttl = 6 hours`. That reproduces the
exact failure mode this mission exists to end. `pg_net` also parks the `Authorization` header in
`net.http_request_queue` for six hours, where `http` holds it only in backend memory. If the owner
prefers the smaller surface, §3 note (c) gives the swap — a real option, just a worse one for
observability.

### What would change the verdict

- **If `CREATE EXTENSION http` fails** (§5 UNKNOWN-1), fall back to `pg_net`: same job rows,
  different command, plus a monitoring job. If **both** fail, the verdict flips to **Windows Task
  Scheduler**, and every time in §4 must be read from the **host-local** column, not the UTC one.
- **If the owner intends to move this stack to a real Linux server soon**, host cron with
  `CRON_TZ=Asia/Tehran` becomes best-in-class and
  `deploy/app/scripts/issabel-import-cron.example.sh` is already written for it. Nothing here
  contradicts that; pg_cron is the right answer *for this machine as it exists tonight*.
- **If a policy forbids the database making outbound network calls** — a defensible rule — Task
  Scheduler wins by elimination, and the timezone must then be pinned in writing, because nothing
  in `schtasks` can pin it.
- **If the host timezone is changed to `Iran Standard Time`**, that strengthens pg_cron further
  (immune) and instantly invalidates any Task Scheduler times written before the change.

---

## 3. Install block — copy-pasteable, timezone already resolved

Run every command from **Git Bash on the test computer**, against **database `postgres`**
(not `afrakala`). Nothing below writes to `afrakala`. Steps 1–2 are the only ones that change
state you cannot simply `cron.unschedule`.

> These commands were **composed from measurements but not executed** — the mission forbade
> installing. Step 6 is the acceptance test: if it returns without error, the whole chain is proven.

**0. Pre-flight (read-only, safe to run at any time).** All three must hold:

```bash
# a) the hook is alive and token-gated  -> expect 401
docker exec afrakala-lan-db sh -c 'curl -s -o /dev/null -w "%{http_code}\n" -X POST --max-time 20 \
  http://afrakala-lan-web:3000/api/public/hooks/import-issabel-calls'

# b) the app has its go-live date, or every run returns 409
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d afrakala \
  -tAc "SELECT key, value FROM public.shop_settings WHERE key LIKE '"'"'issabel%'"'"';"'

# c) the worker token is configured in the web container  -> expect 1
docker exec afrakala-lan-web sh -c 'env | grep -c "^ISSABEL_IMPORT_WORKER_TOKEN=."'
```

Measured tonight: `401`; `issabel_import_since_date|2026-09-07` and `issabel_outbound_dial_prefix|9`;
`1`.

**1. Create the HTTP extension in `postgres` (NOT in `afrakala`).**

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction -c "CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;"'
```

The `extensions` schema already exists in that database and is on the default `search_path`
(`"$user", public, auth, extensions`).

**2. Store the token — its value never appears on a command line.**

> `OWNER DECISION:` where the token lives.
> **(i) `supabase_vault`** — written below. Encrypted at rest via pgsodium and already proven to
> work on this server, in the *other* database: `afrakala` holds `1` vault secret and `3` pgsodium
> keys (migration `153_ai_providers_and_key_vault`). In `postgres` both counts are `0`, so this
> call also mints that database's first pgsodium key — new state, worth knowing before running it.
> **(ii) A one-row table** in `postgres` with `REVOKE ALL … FROM PUBLIC`. Simpler, no crypto
> dependency, and arguably honest: the same token already sits in plaintext in
> `deploy/lan/.env.lan` and in the web container's environment.
> Trade-off: (i) survives a `pg_dump` read by the wrong person; (ii) has fewer moving parts and
> cannot fail at 04:30 because a key file moved. Both work with step 3 — only the `SELECT` inside
> the function changes.

```bash
docker exec afrakala-lan-web printenv ISSABEL_IMPORT_WORKER_TOKEN \
| docker exec -i afrakala-lan-db sh -c '
    read -r TOK
    printf "SELECT vault.create_secret(%s, %s, %s);\n" \
      "\$tok\$$TOK\$tok\$" \
      "\$\$issabel_import_worker_token\$\$" \
      "\$\$C-2 / D-39 issabel CDR import worker token\$\$" \
    | PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

Verify without printing it:

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -tAc "SELECT name, length(decrypted_secret) > 0 AS has_value FROM vault.decrypted_secrets \
        WHERE name = '"'"'issabel_import_worker_token'"'"';"'
```

**3. The driver function, in database `postgres`.** Keeping the token inside the function body is
the whole point: `cron.log_statement` is `on`, so anything in the job command reaches the server
log 17 times a day.

Save as `deploy/lan/scripts/cron-C2-schedule-issabel-import.sql` (this mission created only this
verdict file, not that script), then apply it. The header mirrors `cron-445-…`:

```sql
-- C-2 / D-39: drive the Issabel CDR import from pg_cron.
-- APPLY AGAINST THE postgres DATABASE, NOT afrakala:
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --single-transaction -f this-file.sql
-- cron.timezone is GMT and Iran is UTC+3:30 year-round (no DST since 2022), so every schedule
-- below is written in GMT with the Tehran local time it corresponds to stated alongside it.
SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.run_issabel_import()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_token text;
  v_resp  extensions.http_response;
BEGIN
  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
   WHERE name = 'issabel_import_worker_token';

  IF v_token IS NULL OR length(v_token) = 0 THEN
    RAISE EXCEPTION 'issabel_import_worker_token is missing from the vault';
  END IF;

  -- the importer's ceiling is 5000 calls per run (DEFAULT_MAX_CALLS), so allow a long first run
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT', '300');

  SELECT * INTO v_resp FROM extensions.http((
    'POST',
    'http://afrakala-lan-web:3000/api/public/hooks/import-issabel-calls',
    ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_token)],
    'application/json',
    '{}'
  )::extensions.http_request);

  -- a non-200 must land in cron.job_run_details; the token is never part of the message
  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'issabel import returned HTTP % : %',
      v_resp.status, left(coalesce(v_resp.content, ''), 500);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.run_issabel_import() FROM PUBLIC;

COMMENT ON FUNCTION public.run_issabel_import() IS
  'C-2 / D-39. Called by pg_cron jobs "afrakala-issabel-import-h30" (30 4-16,22 * * * GMT) and '
  '"afrakala-issabel-import-h00" (0 7,8,9 * * * GMT) = the 17 Tehran fire times of D-39. '
  'POSTs to the token-protected hook on afrakala-lan-web and raises on any non-200 so the '
  'failure is visible in cron.job_run_details.';

-- idempotent, same shape as cron-445-schedule-afrakala-jobs.sql
DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['afrakala-issabel-import-h30', 'afrakala-issabel-import-h00'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN PERFORM cron.unschedule(j); END IF;
  END LOOP;
END $$;

-- 30 4-16,22 * * * GMT = Tehran 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00,
--                               17:00, 18:00, 19:00, 20:00, 02:00                  (14 runs)
SELECT cron.schedule('afrakala-issabel-import-h30', '30 4-16,22 * * *',
                     'SELECT public.run_issabel_import();');

-- 0 7,8,9 * * * GMT    = Tehran 10:30, 11:30, 12:30                                 (3 runs)
SELECT cron.schedule('afrakala-issabel-import-h00', '0 7,8,9 * * *',
                     'SELECT public.run_issabel_import();');
```

Apply it byte-safely. This file is pure ASCII, but the project rule stands: never a PowerShell
pipe, and `docker cp` is broken on this machine (CLAUDE.md), so deliver over stdin and check md5
on both sides:

```bash
cat deploy/lan/scripts/cron-C2-schedule-issabel-import.sql \
  | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/c2.sql'
docker exec afrakala-lan-db sh -c 'md5sum /tmp/c2.sql'
md5sum deploy/lan/scripts/cron-C2-schedule-issabel-import.sql     # the two must match
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction -f /tmp/c2.sql'
```

**4. This is NOT a migration and must not take a number.** `cron.job` lives in `postgres`;
`supabase/migrations/*` applies to `afrakala` and is ledgered in
`supabase_migrations.schema_migrations`. Precedent: migration `445` carries `COMMENT`s only and
explicitly delegates the `cron` DDL to `deploy/lan/scripts/`. Per the mission contract,
**520+ belongs to C-1 only** — do not create a migration for this.

**5. Confirm the jobs are registered.**

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -tAc "SELECT jobid, jobname, schedule, database, username, active FROM cron.job \
        WHERE jobname LIKE '"'"'afrakala-issabel-%'"'"' ORDER BY jobid;"'
```

Expect two rows with `database = postgres`, `username = supabase_admin`, `active = t`.

**6. Acceptance test — prove the chain end to end, once, by hand.** This performs a real import
(idempotent: `call_logs.external_id` is uniquely indexed on `linkedid`, so a repeat inserts 0):

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -c "SELECT public.run_issabel_import();"'
```

No error = HTTP 200. An exception naming a status code = the chain works and the app refused.
`function extensions.http(...) does not exist` = step 1 did not take.

**7. Watch it for one day.**

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -tAc "SELECT j.jobname, d.status, d.start_time, left(coalesce(d.return_message,\$\$\$\$),160) \
        FROM cron.job_run_details d JOIN cron.job j USING (jobid) \
        WHERE j.jobname LIKE \$\$afrakala-issabel-%\$\$ ORDER BY d.start_time DESC LIMIT 20;"'
```

Expect **17 rows per full day**, all `succeeded`. Anything else is a real failure, visible without
reading a log file — the entire reason for choosing the synchronous client.

**Rollback**, if any of this misbehaves:

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -v ON_ERROR_STOP=1 --single-transaction -c "
    SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE '"'"'afrakala-issabel-%'"'"';
    DROP FUNCTION IF EXISTS public.run_issabel_import();"'
# the extension and the vault secret may stay; removing them is optional and separate:
#   DROP EXTENSION http;   DELETE FROM vault.secrets WHERE name = 'issabel_import_worker_token';
```

**Notes**

- **(a) Hostname.** `afrakala-lan-web` and `web` both resolve from the db container
  (`getent hosts` → `172.18.0.7` for both). `afrakala-lan-web` is the container name and the more
  stable of the two if the compose project is ever renamed.
- **(b) Production.** The same block should work on `192.168.170.10`, where the app database is
  itself named `postgres` — meaning the extension and the function would land in the **business**
  database there, not a spare one. **I was forbidden to send a single packet to that host, so
  whether it even has `pg_cron`, `cron.timezone = GMT`, or the `http` shared object is UNKNOWN**
  (§5 UNKNOWN-4). Re-run the §0 pre-flight there, plus
  `SELECT extversion FROM pg_extension WHERE extname='pg_cron'` and `SHOW cron.timezone`, before
  assuming any of it.
- **(c) The `pg_net` swap**, if the owner prefers not to add a new extension. `pg_net` is already
  preloaded and its worker already services database `postgres`, so only
  `CREATE EXTENSION pg_net WITH SCHEMA extensions;` is needed and the function body becomes
  `PERFORM net.http_post(url := '…', headers := jsonb_build_object('Authorization','Bearer '||v_token,
  'Content-Type','application/json'), timeout_milliseconds := 300000);`. **Then step 7 stops
  working** — `cron.job_run_details` will report `succeeded` even when the app returns 500 — and a
  second cron job scanning `net._http_response` for non-200 within `pg_net.ttl = 6 hours` becomes
  mandatory, not optional.

---

## 4. The schedule, in the timezone pg_cron actually uses (GMT), with the arithmetic

`Tehran = UTC + 3:30` (fixed; Iran abolished DST in 2022) → **`UTC = Tehran − 3:30`**.
Host local is `UTC + 5:00` (`West Asia Standard Time`, `SupportsDaylightSavingTime: False`) →
**`host local = Tehran + 1:30`**. The last column exists only so a Task Scheduler fallback can be
checked against the same table; **pg_cron uses column 4.**

| # | Window | Tehran (D-39) | **− 3:30 → GMT/UTC (what pg_cron fires on)** | + 1:30 → host local (UTC+05:00) |
|--:|:--:|---|---|---|
| 1 | 1 | 08:00 | **04:30** | 09:30 |
| 2 | 1 | 09:00 | **05:30** | 10:30 |
| 3 | 2 | 10:00 | **06:30** | 11:30 |
| 4 | 2 | 10:30 | **07:00** | 12:00 |
| 5 | 2 | 11:00 | **07:30** | 12:30 |
| 6 | 2 | 11:30 | **08:00** | 13:00 |
| 7 | 2 | 12:00 | **08:30** | 13:30 |
| 8 | 2 | 12:30 | **09:00** | 14:00 |
| 9 | 3 | 13:00 | **09:30** | 14:30 |
| 10 | 3 | 14:00 | **10:30** | 15:30 |
| 11 | 3 | 15:00 | **11:30** | 16:30 |
| 12 | 3 | 16:00 | **12:30** | 17:30 |
| 13 | 4 | 17:00 | **13:30** | 18:30 |
| 14 | 4 | 18:00 | **14:30** | 19:30 |
| 15 | 4 | 19:00 | **15:30** | 20:30 |
| 16 | 5 | 20:00 | **16:30** | 21:30 |
| 17 | 5 | 02:00 | **22:30 (previous calendar day)** | 03:30 |

**17 rows. Window totals 2 + 6 + 4 + 3 + 2 = 17.** ✔

Worked examples in both directions:

- Row 4: Tehran `10:30` − `3:30` = **`07:00` UTC**; `10:30` + `1:30` = `12:00` host local.
- Row 17: Tehran `02:00` − `3:30` = `−01:30` → borrow 24 h → **`22:30` UTC on the *previous*
  day**; `02:00` + `1:30` = `03:30` host local, same day.
- Cross-check against a job already running: migration `445` documents
  `30 22 * * * GMT = 02:00 Asia/Tehran (next calendar day)`, and `jobid 20` was measured starting
  at `2026-09-06 22:30:00+00`. Same offset, same direction. ✔

**Collapsing 17 times into cron expressions.** Split by minute:

- minute `:30` → UTC hours `4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16` (rows
  1, 2, 3, 5, 7, 9, 10, 11, 12, 13, 14, 15, 16) **and** `22` (row 17) → contiguous `4-16` plus
  `22` → **`30 4-16,22 * * *`** = 13 + 1 = **14 fires**
- minute `:00` → UTC hours `7` (row 4), `8` (row 6), `9` (row 8) → **`0 7,8,9 * * *`** =
  **3 fires**

14 + 3 = **17 fires/day**, with no duplicates (the `:30` and `:00` sets are disjoint by
construction) and no extras (`4-16` at `:30` enumerates exactly 04:30 … 16:30, every one of which
is in the table).

Two pg_cron rows therefore replace the seven crontab lines that
`deploy/app/scripts/issabel-import-cron.example.sh:52-60` proposes for a UTC host. Worth diffing
against that file if anyone doubts the conversion: its UTC block lists
`30 4,5 · 30 6 · 0,30 7,8 · 0 9 · 30 9,10,11,12 · 30 13,14,15 · 30 16,22`, which is the same
multiset of 17 times.

---

## 5. What I could not measure — UNKNOWN, not inferred

1. **UNKNOWN-1 — whether `CREATE EXTENSION http` actually succeeds in database `postgres`.**
   Forbidden by the mission ("Install nothing. No `CREATE EXTENSION`"), including inside a
   rolled-back transaction. Measured and pointing to yes: `http.so` is present at
   `/nix/store/4mb48vs9kb2k0i7xfidzakw0i6vamwzy-postgresql-and-plugins-15.6/lib/http.so`,
   `http.control` and `http--1.6.sql` are in `/usr/share/postgresql/extension/`, and `http`
   appears in `supautils.privileged_extensions`. Not measured: that supautils' create-time hook
   lets it through, and that a backend can dlopen libcurl. **Step 1 of §3 is the test.** The same
   UNKNOWN applies to `pg_net`.
2. **UNKNOWN-2 — everything inside the WSL Ubuntu distro.** Is `cron` installed? Is `systemd`
   enabled in `/etc/wsl.conf`? What is `/etc/localtime`? Can it reach `192.168.170.8:3100`?
   Answering any of these means **booting a 39.46 GB stopped distro**, which the mission forbade.
   Measured from outside: it is `Stopped`, WSL is `2.6.3.0`, and **no scheduled task on this
   machine starts it** — so its reboot behaviour is settled regardless of what is inside.
3. **UNKNOWN-3 — why an interactive session existed 27 seconds after boot.** `AutoAdminLogon` is
   empty, yet `Docker Desktop` ran in `SessionId 1` at `12:52:29` after a `12:52:02` boot. It
   could be Windows' post-update automatic sign-in, a physically present operator, or a mechanism
   I did not find. It matters because **all three candidates depend on the containers coming
   back**, and the containers come back from a per-user `HKCU\…\Run` entry. Measured once as
   working; not proven to repeat. Determining it would mean rebooting the test host — refused.
4. **UNKNOWN-4 — production's scheduler.** Whether `192.168.170.10` has `pg_cron`, what its
   `cron.timezone` is, whether its image carries `http.so`, and what its host timezone is.
   **Forbidden: not one packet.** Everything in §3 is written for `192.168.170.8` and must be
   re-verified there before use.
5. **UNKNOWN-5 — how long a real import takes,** and therefore whether `CURLOPT_TIMEOUT 300` is
   generous or tight. The importer's ceiling is `DEFAULT_MAX_CALLS = 5000`
   (`src/lib/calls/import-issabel-calls.server.ts:58`) and `call_logs` currently holds 1509 rows,
   but I did not invoke the hook with a valid token — that would have been a real import with real
   side effects, which is not measurement.
6. **UNKNOWN-6 — whether the Node handler finishes its work if the HTTP client times out first.**
   If it does not, a timeout could truncate an import mid-way. The importer is documented as safe
   to re-run (`external_id` unique on `linkedid`), so the failure mode is a wasted run rather than
   corruption — but "does the server abort on client disconnect" was not tested.
7. **UNKNOWN-7 — whether `vault.create_secret` works in database `postgres`.** It demonstrably
   works in `afrakala` (`vault.secrets` = 1 row, `pgsodium.key` = 3 rows) and the root key file
   exists (`/etc/postgresql-custom/pgsodium_root.key`, `-rw------- postgres postgres 64`), but
   `postgres` has `0` keys and `0` secrets, so the first call there is untested. The
   `OWNER DECISION` in §3 step 2 exists precisely because of this.
8. **NOT MEASURED, out of scope, recorded for whoever owns it:** the same mechanism would also
   give the stalled `pricing_recompute_queue` (41,745 pending, last processed 2026-08-11) a home,
   and `api/public/hooks/generate-marketing-tasks` and `ingest-market-rates` are equally
   unscheduled. C-2 was asked *where* cron should run, not to schedule four workers. **Nothing
   was scheduled tonight; the Issabel importer is still not running.**
