# PRODUCTION STATE — 2026-08-31

Read-only reconnaissance of the AfraKala production host. No writes, no migrations,
no docker lifecycle commands, no git mutations. This file is the only artifact created.

- **Host:** `DESKTOP-MT8J1VR` — `192.168.170.10` (Ethernet, DHCP)
- **Report generated:** 2026-08-31 18:28 +0330 / 2026-08-31T14:58:55Z
- **Production source dir:** `C:\afrakala`
- **Compose file:** `C:\afrakala\deploy\lan\docker-compose.yml`
- **Env file:** `C:\afrakala\deploy\lan\.env.lan` (passed via `--env-file`; the compose file has no `env_file:` directive)

---

## 1. VERDICT

1. **Production SHA:** `bfcc723a` (`bfcc723a3d610b2a1f9f59baa31e5d4406121756`) on branch `main`, built 2026-08-15, running unchanged for 16 days.
2. **Staging SHA:** cannot be determined. The only local ref, `origin/staging` = `47de4d8a`, was last fetched 2026-08-10 and points to a commit dated 2026-06-17 — it is *older* than production. Fetching is forbidden by this task.
3. **Commits behind:** `3` versus the last-known `origin/main` (`99f6bd58`, fetched 2026-08-16). Those 3 commits touch **`PROGRESS.md` only** — 1 file, +10/-3, zero source, zero migrations. Distance from *today's* real remote is UNKNOWN.
4. **Migrations behind:** `0`. 523 files in tree, 523 rows in ledger, sets identical in both directions. But see RISK-2 — the ledger is a backfill, not evidence.
5. **APP_GIT_SHA match:** **PASS** — container `APP_GIT_SHA=bfcc723a` equals short `HEAD` `bfcc723a`. Working tree has zero modified tracked files.

---

## 2. RISK FINDINGS

### RISK-1 — Privilege-escalation grants are OPEN on the three RBAC tables (SEVERE)

`anon` and `authenticated` both hold the full privilege set `arwdDxt` on `public.user_roles`,
`public.role_permissions`, and `public.profiles` — that includes `INSERT`, `UPDATE`, `DELETE`,
**`TRUNCATE`**, and **`TRIGGER`**.

The migration that was supposed to REVOKE these — referred to as migration 399 — **does not exist
in the production tree at all**. The highest-numbered migration here is **335**
(`20260811180000_335_converge_environment_drift.sql`). Files numbered 399 and 416 are absent.

**Verdict: the hole is OPEN.**

Partial mitigation, stated precisely so the risk is not over- or under-stated:

- RLS is enabled on **all 221** public tables (0 disabled), and `user_roles` carries policies that
  gate every DML path behind `has_role(uid(),'admin')`. A non-admin `authenticated` user therefore
  **cannot** insert themselves an admin row through PostgREST.
- **However, `TRUNCATE` is not subject to RLS in PostgreSQL.** The `TRUNCATE` and `TRIGGER` grants
  to `anon`/`authenticated` sit entirely outside the policy layer. Any SQL path that reaches
  `TRUNCATE public.user_roles` under those roles succeeds regardless of policy.

So the accurate statement is: *the grants are wide open; RLS closes the row-level DML paths but not
the table-level ones.*

### RISK-2 — The migration ledger is a one-shot backfill, not a record of application

All **523** rows in `supabase_migrations.schema_migrations` share the identical timestamp
`2026-08-11 16:25:44.289379+00`; `count(distinct date_trunc('day', inserted_at)) = 1`.

The ledger was written in a single transaction on 2026-08-11. It records a *declaration* that 523
migrations are applied — it is not per-migration evidence and cannot distinguish "actually ran"
from "assumed to have run". This is the frozen-ledger failure mode. Spot-checks against real DDL
artifacts are the only way to confirm any individual migration; one such spot-check (migration 335's
FK `salesperson_alloc_dyn_profile_fkey`) does exist in `pg_constraint`.

### RISK-3 — `v_pricing_recompute_queue_summary` returns HTTP 500 to real users, ongoing

PostgREST logs show this view failing with `57014 canceling statement due to statement timeout` on
**2026-08-22 09:07**, **2026-08-25 12:18**, and **2026-08-31 11:21** — the most recent is today.
Requests come from `http://192.168.170.10:3000/` with an `authenticated` role, i.e. a real user
loading a real page.

Root cause is visible in the queue itself:

| status | count | oldest enqueued | newest enqueued |
|---|---|---|---|
| pending | **103,587** | 2026-05-24 | 2026-08-31 |
| done | 74 | 2026-05-24 | 2026-05-24 |
| failed | 1 | 2026-05-24 | 2026-05-24 |

The worker has run **exactly once in the table's history**: 2026-08-16 20:48:35Z → 20:49:57Z, about
82 seconds, processing 75 rows (74 done, 1 failed on a business rule — missing valid purchase price).
Before and after that single window, nothing. `PRICING_WORKER_TOKEN` is **NOT SET** in the web
container. The backlog grows 800–2,100 rows/day (2026-08-31: 2,098; 08-29: 1,458; 08-27: 775;
08-26: 1,663; 08-25: 2,087).

Note that computed prices *are* current despite this — `product_computed_prices` is written by a
different path. What is dead is the asynchronous queue, and the summary view over it now times out.

### RISK-4 — Over half of all role assignments are `admin`

| role | holders |
|---|---|
| admin | **23** |
| sales | 15 |
| manager | 2 |
| accountant | 1 |
| viewer | 1 |

23 of 42 assignments are `admin`. Combined with RISK-1 this widens the blast radius considerably.

### RISK-5 — No HTTPS anywhere on this host

`C:\Caddy\Caddyfile` sets `auto_https off`, binds `:80`, reverse-proxies **only** `/api/*` to
`localhost:3000`, and answers everything else with `403 "Access Denied"`. Nothing is listening on
443 at all. The UI is served as plain HTTP directly from the container on `:3000`, and the entire
`/api/*` surface is additionally reachable on port 80 with no TLS.

### RISK-6 — The compose project is split across two source folders

Six containers carry `com.docker.compose.project.working_dir = C:\afrakala\deploy\lan`, but
**`afrakala-lan-storage` and `afrakala-lan-rest` still carry
`C:\AfraKalaServer\get-git-going01lan\deploy\lan`** — the retired folder. All eight share the
project name `afrakala-lan`, so a `compose` command issued from either folder acts on the same
project with a different definition.

Compounding this: the Windows scheduled task **`AfraKala LAN Auto Start`** runs
`C:\AfraKalaServer\get-git-going01lan\start-afrakala-lan.ps1` on every logon — from the retired
folder, not from `C:\afrakala`.

### RISK-7 — Unexplained whole-stack restart on 2026-08-22, and a 6-restart auth container

Every service reports `StartedAt = 2026-08-22T08:57:2x` — the stack went down and came back nine
days ago. `afrakala-lan-auth` shows `RestartCount = 6`, `afrakala-lan-storage` shows `1`
(its log records a `57P03 the database system is starting up` startupError at 2026-08-22T08:57:29,
then recovery). `afrakala-lan-rest` logged a `503` on `shop_settings` at 2026-08-26 06:19 followed
by a reconnect. The most likely trigger is a host reboot firing the logon task in RISK-6, but that
is inference, not evidence.

### RISK-8 — Realtime websocket 404s on every client

Kong logs `GET /realtime/v1/websocket?... → 404`. The frontend requests a realtime endpoint that has
no backing service in this deployment. (The raw log line carries an `apikey` query parameter and is
deliberately not reproduced here.)

### RISK-9 — Bot API 500s in the web container

`docker logs afrakala-lan-web` ends on an unhandled `ECONNRESET` → `status: 500` followed by
`[bot-api] unmapped error message: An invalid response was received from the upstream server`.
Kong shows heavy sustained bot traffic (`bot_authenticate_key`, `bot_check_rate_limit`,
`bot_list_products_for_key`) plus a `python-requests/2.31.0` client pulling
`product_computed_prices` in large `IN (...)` batches.

### RISK-10 — Orphaned `afrakala-staging-db` container holding 434 MB

`afrakala-staging-db` — `Exited (255)`, no compose labels, **434 MB in its writable layer with no
volume attached**. It is not part of the `afrakala-lan` project. Removing it would destroy that
data irrecoverably; leaving it consumes the space. Reported only.

---

## 3. PHASE-BY-PHASE EVIDENCE

### PHASE 0 — Machine identity and paths

```
$ hostname
DESKTOP-MT8J1VR

$ Get-NetIPAddress -AddressFamily IPv4
172.28.112.1     vEthernet (WSL (Hyper-V firewall))   Manual
192.168.170.10   Ethernet                             Dhcp      <-- PRODUCTION
169.254.149.214  Wi-Fi 4                              WellKnown
169.254.235.132  Wi-Fi 3                              WellKnown
169.254.194.179  Wi-Fi                                WellKnown
```

Confirmed PRODUCTION (`192.168.170.10`), not the test host (`192.168.170.8`).

Source directory discovered from container compose labels rather than assumed:

```
afrakala-lan-web     project=afrakala-lan service=web     working_dir=C:\afrakala\deploy\lan
afrakala-lan-auth    project=afrakala-lan service=auth    working_dir=C:\afrakala\deploy\lan
afrakala-lan-kong    project=afrakala-lan service=kong    working_dir=C:\afrakala\deploy\lan
afrakala-lan-db      project=afrakala-lan service=db      working_dir=C:\afrakala\deploy\lan
afrakala-lan-meta    project=afrakala-lan service=meta    working_dir=C:\afrakala\deploy\lan
afrakala-lan-db-role-fix project=afrakala-lan service=db-role-fix working_dir=C:\afrakala\deploy\lan
afrakala-lan-storage project=afrakala-lan service=storage working_dir=C:\AfraKalaServer\get-git-going01lan\deploy\lan
afrakala-lan-rest    project=afrakala-lan service=rest    working_dir=C:\AfraKalaServer\get-git-going01lan\deploy\lan
afrakala-staging-db  project=(none)
```

Five clones exist on this machine, all with `package.json` name `tanstack_start_ts`:
`C:\afrakala`, `C:\AfraKalaServer\get-git-going01lan`, `C:\afrakala-feature-tree`,
`C:\Users\AfRa KaLa\afrakala-platform`, `C:\Users\AfRa KaLa\get-git-going`.
Only `C:\afrakala` and `C:\AfraKalaServer\get-git-going01lan` contain a `deploy/lan/.env.lan`.

### PHASE 1 — What build is actually running

Container name prefix, discovered not assumed: **`afrakala-lan-*`**.

```
$ docker ps -a
NAME                      IMAGE                          STATUS                    PORTS                     CREATED
afrakala-lan-web          afrakala-app:lan               Up 9 days (healthy)       0.0.0.0:3000->3000/tcp    2026-08-15 19:21:53 +0330
afrakala-lan-auth         supabase/gotrue:v2.158.1       Up 9 days                 -                         2026-08-14 18:53:43 +0330
afrakala-lan-kong         kong:2.8.1                     Up 9 days (healthy)       0.0.0.0:8000->8000/tcp    2026-08-14 16:19:58 +0330
afrakala-lan-db-role-fix  supabase/postgres:15.6.1.139   Exited (0) 2 weeks ago    -                         2026-08-14 16:19:57 +0330
afrakala-lan-db           supabase/postgres:15.6.1.139   Up 9 days (healthy)       5432/tcp                  2026-08-14 16:19:56 +0330
afrakala-lan-storage      supabase/storage-api:v1.11.13  Up 9 days                 5000/tcp                  2026-08-13 11:57:50 +0330
afrakala-lan-rest         postgrest/postgrest:v12.2.0    Up 9 days                 3000/tcp                  2026-08-13 11:57:50 +0330
afrakala-lan-meta         supabase/postgres-meta:v0.84.2 Up 9 days (healthy)       8080/tcp                  2026-08-11 16:02:42 +0330
afrakala-staging-db       supabase/postgres:15.6.1.139   Exited (255) 9 days ago   0.0.0.0:5433->5432/tcp    2026-08-11 13:08:40 +0330
```

```
$ docker exec afrakala-lan-web printenv | findstr APP_
APP_GIT_SHA=bfcc723a
APP_BUILD_TIME=2026-08-15T15:47:47Z
APP_ENV=lan
NODE_ENV=production
PORT=3000
OCR_ENABLED=true
PRICING_WORKER_TOKEN  -> NOT SET
```

```
$ docker inspect afrakala-lan-web
image_ref         = afrakala-app:lan
image_id          = sha256:8834154f842a3a1ea5f0c92e547c1a24faed87cb055eaf7db8bb38a0e8cf3f81
image_created     = 2026-08-15T15:50:50.630230406Z
container_created = 2026-08-15T15:51:53.213592914Z
restart_count     = 0
state             = running
ports             = {"3000/tcp":[{"HostIp":"0.0.0.0","HostPort":"3000"},{"HostIp":"::","HostPort":"3000"}]}
```

Health and restart state (1.5):

```
afrakala-lan-web          health=healthy          running exit=0 restarts=0 started=2026-08-22T08:57:22Z
afrakala-lan-auth         health=(none)           running exit=0 restarts=6 started=2026-08-22T08:57:32Z
afrakala-lan-kong         health=healthy          running exit=0 restarts=0 started=2026-08-22T08:57:22Z
afrakala-lan-db-role-fix  health=unhealthy        exited  exit=0 restarts=0 started=2026-08-15T15:51:55Z
afrakala-lan-db           health=healthy          running exit=0 restarts=0 started=2026-08-22T08:57:22Z
afrakala-lan-storage      health=(none)           running exit=0 restarts=1 started=2026-08-22T08:57:29Z
afrakala-lan-rest         health=(none)           running exit=0 restarts=0 started=2026-08-22T08:57:22Z
afrakala-lan-meta         health=healthy          running exit=0 restarts=0 started=2026-08-22T08:57:22Z
afrakala-staging-db       health=starting         exited  exit=255 restarts=0
```

`db-role-fix` reporting `unhealthy` is cosmetic — it is a one-shot that exits 0 by design, so its
healthcheck never passes. Its log confirms correct operation:
`[afrakala/db-role-fix] role password fix complete`, plus `NOTICE: role "authenticator" is already
a member of role "anon"/"authenticated"/"service_role"`.

Log highlights (full tails were read for all containers):

- **web** — trailing unhandled error: `Error: aborted ... code: 'ECONNRESET' ... status: 500 ... unhandled: true`,
  then `[bot-api] unmapped error message: An invalid response was received from the upstream server`.
- **kong** — sustained `POST /rest/v1/rpc/bot_authenticate_key|bot_check_rate_limit|bot_list_products_for_key → 200`
  from UA `node`; `GET /rest/v1/product_computed_prices?...` from `python-requests/2.31.0`;
  `GET /realtime/v1/websocket → 404`.
- **db** — pg_cron healthy, `cron job 10/11 starting`/`completed: 1 row` every 5 minutes; regular checkpoints.
- **auth** — normal logins/token refreshes for real users through 2026-08-31T14:51Z.
- **rest** — `{"code":"57014","message":"canceling statement due to statement timeout"}` at 2026-08-22 09:07,
  2026-08-25 12:18, 2026-08-31 11:21, each paired with
  `GET /v_pricing_recompute_queue_summary... HTTP/1.1" 500`. One `503` on `shop_settings` 2026-08-26 06:19.
  `Schema cache loaded 246 Relations, 255 Relationships, 341 Functions`.
- **storage** — `startupError` `57P03 the database system is starting up` at 2026-08-22T08:57:29, then
  `[Server] Started Successfully`. Fastify deprecation warnings otherwise.
- **meta** — clean, listening on 8080/8081.

Reverse proxy and scheme (1.6):

```
$ Get-CimInstance Win32_Service -Filter "Name='Caddy'"
State=Running  StartMode=Auto
PathName="C:\Caddy\caddy.exe" run --config "C:\Caddy\Caddyfile"

$ type C:\Caddy\Caddyfile
{
    auto_https off
}
:80 {
    handle /api/* {
        reverse_proxy localhost:3000
    }
    handle {
        respond "Access Denied" 403
    }
}

listening: :80 (caddy.exe pid 4764), :3000 and :8000 (docker/wslrelay). Nothing on :443.

$ curl http://localhost/api/healthz            -> 200
$ curl http://192.168.170.10/api/version        -> 200 {"ok":true,"app":"myafrakala.ir","environment":"lan",
                                                        "commit":"bfcc723a","commitShort":"bfcc723",
                                                        "buildTime":"2026-08-15T15:47:47Z",
                                                        "supabasePublicUrl":"unknown"}
$ https://localhost:3000/api/healthz            -> connection closed (no TLS)
```

`W3SVC` (IIS) is also `Running` but does not hold 80/443.

### PHASE 2 — Git state of the production working tree

```
$ git rev-parse HEAD
bfcc723a3d610b2a1f9f59baa31e5d4406121756
$ git rev-parse --short HEAD
bfcc723a
$ git branch --show-current
main
$ git branch -vv
  feature/navigation-modernization cde5095e [origin/feature/navigation-modernization] fix(ui): stop the red safety banner...
* main                             bfcc723a [origin/main: behind 3] Merge pull request #292 from .../staging

$ git status --porcelain
?? deploy/lan/.env.lan.bak-20260814
?? deploy/lan/.env.lan.bak-banner
?? docs/execution/production-gap-analysis-REPORT.md
?? docs/execution/production-gap-analysis-mission.md
   count = 4 ; tracked-modified = 0
```

**2.3 is clean where it matters.** All four entries are untracked (`??`); zero tracked files are
modified. Nothing uncommitted can be silently live in the image. Note that two of those untracked
files (`.env.lan.bak-*`) contain plaintext secrets and are *not* covered by `.gitignore` — a
`git add -A` would commit them. (`deploy/lan/.env.lan` itself **is** ignored, at `.gitignore:88`.)

```
$ git log -15 --date=short --pretty=format:"%h %ad %an %s"
bfcc723a 2026-08-15 mohammadrezaafra66-arch Merge pull request #292 from .../staging
41b4ab1d 2026-08-15 mohammadrezaafra66-arch Merge pull request #291 from .../feature/revert-prepay-price-display
35fc8c8b 2026-08-15 Ali                     revert(pricing): drop the pre-payment price selection, keep only the two display fixes
48223d48 2026-08-15 mohammadrezaafra66-arch Merge pull request #290 from .../staging
55e0d3b4 2026-08-15 mohammadrezaafra66-arch Merge pull request #289 from .../feature/settlement-aware-price-display
f1328eef 2026-08-15 Ali                     fix(sales-search): name both dimensions on each settlement price card
ff6162b7 2026-08-15 Ali                     fix(pricing): show the pre-payment settlement price, not the baseline
0ed31ed4 2026-08-15 mohammadrezaafra66-arch Merge pull request #288 from .../staging
7379f30d 2026-08-15 mohammadrezaafra66-arch Merge pull request #287 from .../feature/quote-item-settlement-price-autofill
2c39847a 2026-08-15 Ali                     fix(quotes): fill unit price from the selected settlement type
2b54e871 2026-08-14 mohammadrezaafra66-arch Merge pull request #286 from .../staging
8b0efcf4 2026-08-14 mohammadrezaafra66-arch Merge pull request #281 from .../hotfix/WPC-boundary-guard-feature-branches
5d7f06b7 2026-08-14 mohammadrezaafra66-arch Merge pull request #285 from .../feature/WPC-progress-note
35cdbadc 2026-08-14 mohammadrezaafra66-arch Merge pull request #284 from .../docs/WPC-refresh-agent-rules
082194c6 2026-08-14 Ali                     docs(rules): refresh the agent rules to match today's branch and server reality
```

**2.5 — APP_GIT_SHA vs HEAD: PASS.** `bfcc723a` == `bfcc723a`.

```
$ git remote -v
origin  https://github.com/mohammadrezaafra66-arch/get-git-going.git (fetch)
origin  https://github.com/mohammadrezaafra66-arch/get-git-going.git (push)
```
Remote confirmed as `mohammadrezaafra66-arch/get-git-going`.

### PHASE 3 — Code delta: production vs staging

**3.1 — a staging ref exists locally but is unusable for this comparison.**

```
staging                     NOT PRESENT LOCALLY
origin/staging              EXISTS  47de4d8a
$ git reflog show origin/staging
47de4d8a refs/remotes/origin/staging@{2026-08-10 16:00:55 +0330}: fetch origin: storing head
$ git log -1 origin/staging
47de4d8a  committed 2026-06-17 15:27:07 +0330  alitalebizadeh  Merge pull request #276 ...
```

The ref was last fetched **2026-08-10** and its commit dates from **2026-06-17** — months older than
production. `origin/main` is also stale: `99f6bd58`, last fetched **2026-08-16 17:16:30 +0330**
(`.git/FETCH_HEAD` mtime 2026-08-15 19:14:58).

**3.2 / 3.3 — counts:**

```
prod MISSING vs stale origin/staging : 0
prod AHEAD  of stale origin/staging  : 1832
prod MISSING vs stale origin/main    : 3
prod AHEAD  of stale origin/main     : 0
```

Production is 1,832 commits *ahead* of the local staging ref and 0 behind it. This does **not** mean
production has diverged from real staging — it means the local staging ref predates production by
months. The intended prod-vs-staging comparison **cannot be answered** without a fetch, which this
task forbids. See UNKNOWNS.

**The 3 commits production lacks versus the last-known `origin/main`:**

```
99f6bd58 2026-08-15 mohammadrezaafra66-arch Merge pull request #294 from .../staging
f2d9b5ab 2026-08-15 mohammadrezaafra66-arch Merge pull request #293 from .../docs/WPC-progress-2026-08-15
cf26b420 2026-08-15 Ali                     docs(progress): record the 2026-08-15 work and refresh the stale status block
```

**3.4 — diff totals:**

```
$ git diff --shortstat HEAD origin/main
 1 file changed, 10 insertions(+), 3 deletions(-)

$ git diff --shortstat HEAD origin/staging        # against the stale ref
 1414 files changed, 11377 insertions(+), 289356 deletions(-)
```

**3.5 — migrations:**

```
$ git diff --name-only HEAD origin/main -- supabase/migrations/
(empty — zero migration files differ)

$ git diff --name-only HEAD origin/staging -- supabase/migrations/ | count
290    # against the stale June ref; not meaningful as a "behind" number
```

**3.6 — changed files by area, HEAD vs origin/main:**

```
PROGRESS.md    1
```

That is the entire gap to the last-known `origin/main`: one documentation file.

### PHASE 4 — Database delta

**4.1 — connection facts, discovered from the compose file and env file:**

```
db service image      : supabase/postgres:15.6.1.139
container_name        : afrakala-lan-db
volume                : lan-db-data:/var/lib/postgresql/data
host port             : NOT published (the ports: block is commented out)

.env.lan:
  POSTGRES_DB       = postgres          <-- NOT "afrakala"
  POSTGRES_USER     = postgres
  POSTGRES_PORT     = 5432
  POSTGRES_PASSWORD = <redacted, length 32>

PGRST_DB_URI            role=authenticator        host=db:5432  database=postgres
GOTRUE_DB_DATABASE_URL  role=supabase_auth_admin  host=db:5432  database=postgres
```

Admin queries in this report were run as `supabase_admin`.

**4.2 — databases:**

```
          datname           |  size  |  owner
----------------------------+--------+----------
 postgres                   | 398 MB | postgres      <-- the one the application uses
 afrakala_g3_migration_test |  18 MB | postgres
```

The application is configured for `postgres` per both `PGRST_DB_URI` and `GOTRUE_DB_DATABASE_URL`.

**4.3 — server version:**

```
PostgreSQL 15.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 13.2.0, 64-bit
```

**4.4 — migration ledger.** Three ledger-ish tables exist (`auth.schema_migrations`,
`storage.migrations`, `supabase_migrations.schema_migrations`); the project's is the last.

```
columns: version (text), inserted_at (timestamptz)   -- there is no "name" column

 total_entries | lowest_version | highest_version
---------------+----------------+-----------------
           523 | 20260424144837 |  20260811180000

10 most recent:
 20260811180000 | 2026-08-11 16:25:44.289379+00
 20260810120000 | 2026-08-11 16:25:44.289379+00
 20260808230000 | 2026-08-11 16:25:44.289379+00
 20260808220000 | 2026-08-11 16:25:44.289379+00
 20260808210000 | 2026-08-11 16:25:44.289379+00
 20260808200000 | 2026-08-11 16:25:44.289379+00
 20260808190000 | 2026-08-11 16:25:44.289379+00
 20260808180000 | 2026-08-11 16:25:44.289379+00
 20260808170000 | 2026-08-11 16:25:44.289379+00
 20260808130000 | 2026-08-11 16:25:44.289379+00

 last_insert                   | first_insert                  | distinct_days
 2026-08-11 16:25:44.289379+00 | 2026-08-11 16:25:44.289379+00 |             1
```

**The ledger is stale/backfilled — see RISK-2.** Every row shares one timestamp.

**4.5 — applied versus files:**

```
ledger entries = 523   files = 523
FILES PRESENT BUT NOT APPLIED : (none)
APPLIED BUT FILE MISSING      : (none)
```

Highest-numbered migration in the tree:

```
335  20260811180000_335_converge_environment_drift.sql
334  20260810120000_334_internal_products_pricing_api.sql
333  20260808230000_333_drop_waybill_custom_fields.sql
332  20260808220000_332_drop_invoices_table.sql
331  20260808210000_331_rewrite_invoice_readers.sql

migration 399 -> NOT PRESENT in production tree
migration 416 -> NOT PRESENT in production tree
```

**4.6 — row counts:**

| table | rows |
|---|---|
| sales_quotes | 170 |
| persons | 832 |
| products | 358 |
| **receipts** | **TABLE MISSING** |
| settlement_types | 27 |
| user_roles | 42 |
| role_permissions | 186 |
| audit_logs | 91,136 |

`receipts` does not exist under that name. Nine receipt-family tables do:
`delivery_receipt_status_history`, `delivery_receipts`, `messenger_read_receipts`,
`payment_receipt_custom_fields`, `payment_receipt_documents`, `payment_receipt_links`,
`payment_receipts`, `payment_receipts_backup_20260722`, `purchase_receipts`. The capability exists;
only the table name in the request does not.

**4.7 — `settlement_types`: 27 rows, 9 columns.**

```
1 id           uuid
2 code         text
3 title        text
4 description  text
5 is_active    boolean
6 created_at   timestamptz
7 updated_at   timestamptz
8 sort_order   integer
9 days         integer      <-- PRESENT
```

**A `days` column does exist**, even though migration 416 is absent from this tree. The column
therefore arrived via some migration at or below 335, not via 416. Presence of the column is
consequently *not* evidence that 416 was applied.

**4.8 — migration 399 privilege check. VERDICT: OPEN.**

```
$ SELECT table_name, grantee, string_agg(privilege_type, ',') ...
    table_name    |    grantee    | privs
------------------+---------------+---------------------------------------------------------
 profiles         | anon          | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 profiles         | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 profiles         | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 role_permissions | anon          | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 role_permissions | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 role_permissions | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 user_roles       | anon          | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 user_roles       | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 user_roles       | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE

$ SELECT relname, relacl FROM pg_class ...
 user_roles       | {postgres=arwdDxt/supabase_admin, supabase_admin=arwdDxt/supabase_admin,
                     anon=arwdDxt/supabase_admin, authenticated=arwdDxt/supabase_admin,
                     service_role=arwdDxt/supabase_admin}
 (profiles and role_permissions identical)
```

No REVOKE is in place. The mitigating RLS policies actually present:

```
user_roles:
  admins manage roles     ALL     using: has_role(uid(),'admin')   check: has_role(uid(),'admin')
  admins read all roles   SELECT  using: has_role(uid(),'admin')
  users read own roles    SELECT  using: (uid() = user_id)
  viewer_restricted       ALL     using: (NOT is_viewer_only(uid())) check: (NOT is_viewer_only(uid()))

role_permissions:
  role_permissions_read_authed  SELECT  using: true
  role_permissions_write_admin  ALL     using: has_role(uid(),'admin')  check: has_role(uid(),'admin')
  viewer_restricted             ALL     using: (NOT is_viewer_only(uid())) check: (NOT is_viewer_only(uid()))
```

Row-level DML is gated. `TRUNCATE` and `TRIGGER` are not, because RLS does not apply to them.
**Reporting only — nothing was changed.**

### PHASE 5 — Capability inventory

**5.1 — route registry.** Extracted from `src/lib/navigation/registry.ts` (39,425 bytes, 1,330 lines),
surfaced through `src/components/layout/nav-items.ts` and rendered by
`src/components/layout/AppSidebar.tsx`. Method: counted `group:` and `module:` literals in the
registry file. There are **189** route files under `src/routes/` and a generated
`src/routeTree.gen.ts` (202,928 bytes).

Nine top-level navigation groups, 119 menu entries, **42 marked `adminOnly`**, 0 hidden:

| group key | Persian label | entries |
|---|---|---|
| admin | مدیریت سیستم | 47 |
| products-pricing | محصولات و قیمت‌گذاری | 21 |
| sales-customers | فروش و مشتریان | 13 |
| finance | مالی و حسابداری | 12 |
| operations | عملیات داخلی | 8 |
| knowledge-comms | دانش، آکادمی و ارتباطات | 6 |
| purchasing | خرید و تأمین‌کنندگان | 6 |
| reports | گزارش‌ها | 5 |
| main | داشبورد | 1 |

Access is not expressed as a hard-coded role per route. Each entry carries a `module` key checked
against `role_permissions` at runtime (`src/lib/rbac/dynamic-permissions.ts`,
`src/lib/rbac/permissions-cache.ts`), plus an optional `adminOnly` boolean that restricts an entry
to admin/manager regardless of module check. Module keys in use:

```
academy 1, accounting 12, asan-export 1, asan-import 1, audit-logs 1, bot-api-keys 3,
dashboard 4, data-tables 1, feedback 2, hr 1, invoices 3, knowledge 1, market-rates 1,
messages 3, persons 3, platform-releases 2, price-lists 1, pricing 20, products 7,
product-videos 1, purchases 2, reports 3, roles 30, sales 8, suppliers 1, users 3, warehouse 3
```

**5.2 — functions in `public`:**

```
 SECURITY DEFINER | 418
 SECURITY INVOKER | 405
 TOTAL            | 823
```

PostgREST separately reports `341 Functions` exposed as RPC in its schema cache — that is the
externally callable subset, not the total. The full 823 names were not enumerated line-by-line here;
the security-relevant split is given above.

**5.3 — RLS:**

```
 rls_enabled | count
-------------+-------
 t           |   221

tables with RLS DISABLED: (0 rows)
```

**All 221 public tables have RLS enabled. No table is a finding on this axis.**

**5.4 — roles held:**

```
    role    | holders | distinct_users
------------+---------+----------------
 admin      |      23 |             23
 sales      |      15 |             15
 manager    |       2 |              2
 accountant |       1 |              1
 viewer     |       1 |              1
```

**5.5 — capability presence:**

| capability | status | evidence |
|---|---|---|
| مرکز مالی (financial hub) | **EXISTS** | navigation group `finance` with 12 entries, label «مالی و حسابداری»; 17 `_app.accounting.*` route files |
| ثبت فیش دریافت/پرداخت (receipt wizard) | **EXISTS** | `_app.accounting.receipts.create.tsx`, `_app.accounting.receipts.tsx`, `_app.accounting.receipts.$receiptId.tsx`, plus `_app.accounting.receipts_.training.tsx`; tables `payment_receipts`, `payment_receipt_documents`, `payment_receipt_links`, `payment_receipt_custom_fields` |
| OCR فیش | **EXISTS** | `OCR_ENABLED=true` in the running web container; `src/lib/receipt-ocr.functions.ts`, `src/lib/receipt-ocr-bytes.functions.ts`, `src/lib/accounting/receipt-ocr-structured.ts`, `receipt-ocr-prompt.ts` (+ a `.test.ts`). No dedicated route — it is a function/component inside the receipt flow |
| گزارش مطالبات مشتریان (receivables) | **EXISTS** | `_app.accounting.receivables.tsx`; 4 registry hits |
| گزارش پرداختنی (payables) | **EXISTS** | `_app.accounting.payables.tsx`; 1 registry hit |
| سند دوبل (double-entry) | **EXISTS (data layer)** | tables `journal_entries`, `journal_lines`, `payment_vouchers`, `capital_allocation_ledger`, `customer_credit_ledger`; route `_app.accounting.payment-vouchers.tsx`. No route file named `journal` and 0 registry hits for «سند دوبل» — the ledger exists, a dedicated journal *screen* does not |
| خروجی آسان (Asan export) | **EXISTS** | `_app.admin.asan-export.tsx` and `_app.admin.asan-import.tsx`; modules `asan-export`, `asan-import`; 9 registry hits |
| امتیازدهی مشتری و کارشناس (scoring) | **EXISTS** | `_app.accounting.salesperson-scoring.tsx`; tables `employee_scores`, `employee_score_events`, `score_snapshots`, `score_level_thresholds`, `credit_score_snapshots`, `credit_scoring_rules`, `dynamic_entity_scores`, `dynamic_scoring_parameters`; **live** pg_cron jobs 10 and 11 running every 5 minutes |
| انواع تسویه با فیلد «تعداد روز» | **EXISTS** | `settlement_types.days integer` present (column 9 of 9), 27 rows |

Scheduled database jobs actually active:

```
 jobid |  schedule   | command                                          | active
     9 | 0 6 * * *   | SELECT public.generate_birthday_notifications(); | t
    10 | */5 * * * * | SELECT public.recompute_all_employee_scores();   | t
    11 | */5 * * * * | SELECT public.capture_score_snapshots();         | t
    12 | 0 2 * * *   | SELECT public.cleanup_stale_auto_suppliers();    | t
```

Note the absence: **pg_cron is installed and working, but no job processes the pricing recompute
queue.** That is the mechanism gap behind RISK-3.

Windows scheduled tasks (all point at the retired folder `C:\AfraKalaServer\get-git-going01lan`):

```
AfraKala Auto Backup              -> AfraKala-AutoBackup.ps1              (daily + weekly)
AfraKala Auto Backup Nightly      -> AfraKala-AutoBackup.ps1              (daily + weekly)
AfraKala LAN Auto Start           -> start-afrakala-lan.ps1               (on logon)
AfraKala LAN Nightly Backup       -> backup-afrakala-lan.ps1              (daily)
AfraKala LAN Weekly Heavy Backup  -> backup-afrakala-heavy-weekly.ps1     (weekly)
```

---

## 4. UNKNOWNS

1. **The real staging SHA, and therefore the true prod-vs-staging delta.** The only local ref,
   `origin/staging` = `47de4d8a`, was fetched 2026-08-10 and points at a 2026-06-17 commit — older
   than production. Answering Phase 3 as intended requires `git fetch`, which this task forbids.
   Every Phase-3 number against staging in this report is against that stale ref and should not be
   read as "production is N behind staging".
2. **The real `origin/main` today.** The local ref `99f6bd58` was fetched 2026-08-16, 15 days ago.
   "3 commits behind" is accurate only relative to that snapshot.
3. **Whether any individual migration was truly applied.** The ledger is a single-timestamp backfill
   (RISK-2). Only per-object DDL spot-checks can confirm, and only one was performed here
   (migration 335's FK).
4. **What migration 399 actually contains.** The file does not exist in this tree, so its intended
   REVOKE statements could not be read. The 4.8 verdict is based on the observed grants on the
   three tables a privilege-escalation fix would plausibly target, not on diffing against 399's text.
5. **Why the stack restarted on 2026-08-22T08:57Z**, and why `afrakala-lan-auth` has 6 restarts.
   A host reboot firing `AfraKala LAN Auto Start` is the plausible cause but was not proven;
   `start-afrakala-lan.ps1` was not opened.
6. **Who or what ran the pricing worker once on 2026-08-16 20:48Z**, given
   `PRICING_WORKER_TOKEN` is not set in the container. Likely a manual invocation; not determinable
   from the data read.
7. **Full enumeration of the 823 public functions by name.** Only the DEFINER/INVOKER split and the
   PostgREST-exposed count (341) were captured, to keep this report readable.
8. **Whether the `python-requests/2.31.0` client hitting `product_computed_prices` is sanctioned.**
   It is an external consumer on the LAN; its identity was not investigated.

---

## 5. COMMANDS NOT RUN (BLOCKED BY CONSTRAINT)

- `git fetch` / `git pull` — needed for a true staging comparison (Phase 3). Blocked.
- Any `REVOKE` to close RISK-1. Blocked; reporting only, as instructed.
- Any `docker compose`/`restart` to clear the split-project labels in RISK-6. Blocked.
- Any write to the pricing queue or invocation of
  `/api/public/hooks/process-pricing-queue`. Blocked.

*No fixes were applied. No migrations were run. No data was modified. This file is the only write.*
