# R-4 — Transfer Line: Stage 0 Inventory for a Scripted Release Pipeline

**VERDICT: PARTIAL — the manual pieces (`mig_apply`, the three e2e gates, the LAN compose/build
stamping, `ledger-reconcile.sh`) are solid, parameterizable building blocks. Nothing exists yet
that scripts them end to end: there is no BLOCKS.md parser/validator, no `promote.ps1`, no image
transfer path, and no automated rehearsal harness. All of that is greenfield for the agent that
builds `release/`. Image transfer (OG-H) is architecturally plausible from the compose file alone
but every concrete channel is UNTESTED by mission constraint.**

Repo: `D:\AfraKalaTest\app`, branch `staging`, commit `d60232f5` at start of this research.
No git writes, no docker commands, no builds were run. Every docker/git command below that would
mutate state is marked `ORCHESTRATOR-TO-RUN`.

---

## TASK 1 — Inventory

### 1.1 `mig_apply` — `docs/runbooks/production-migration-20260908-BLOCKS.md:624-643`

Verbatim:

```bash
mig_apply() {
  local ver="$1" file="$2" path="supabase/migrations/$2"
  [ -f "$path" ] || { echo "MISSING FILE: $path"; return 1; }
  cat "$path" | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/mig.sql' || return 1
  local h c
  h=$(md5sum "$path" | awk '{print $1}')
  c=$(docker exec afrakala-lan-db md5sum /tmp/mig.sql | awk '{print $1}')
  if [ "$h" != "$c" ]; then
    echo "MD5 MISMATCH $file  host=$h  cont=$c  -- NOT APPLIED"; return 1
  fi
  echo "=== $file  (md5 $h) ==="
  docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin \
    -d postgres --no-psqlrc -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig.sql' \
    || { echo "*** APPLY FAILED: $file  -- transaction rolled back, ledger NOT written ***"; return 1; }
  docker exec afrakala-lan-db sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -U supabase_admin \
    -d postgres -v ON_ERROR_STOP=1 --single-transaction \
    -c \"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('$ver');\"" \
    || { echo "*** LEDGER RECORD FAILED for $ver ***"; return 1; }
  echo "OK $file"
}
```

It is preceded (lines 596-621) by a **gate** that refuses to define `mig_apply` at all unless a
log file (`C:\afrakala\run-20260912.log`) contains `BLOCK 0 OK` … `BLOCK 3.5 OK` and a
`FINAL DUMP … md5=` line — i.e. today the gate is enforced by grepping a human-maintained
transcript, not by any machine state.

Guarantees, all present in the quoted body:
- **md5 both sides** (`h`/`c`, lines 629-633) — refuses to apply on mismatch, no exception path.
- **`--single-transaction -v ON_ERROR_STOP=1`** on both the apply step and the ledger-insert step
  (lines 636, 639) — a partial failure rolls back.
- **Ledger INSERT without `ON CONFLICT`** (line 640) — a collision raises `unique_violation`
  instead of silently no-op-ing (the project rule stated in `CLAUDE.md` rule 2b and repeated in
  BLOCKS.md line 372).
- **File delivered by `cat | docker exec -i … cat >`**, never piped through `psql` directly
  (line 627) — the `docker cp` mount-layer breakage and the PowerShell-pipe Persian-corruption
  hazard from `CLAUDE.md` are both sidestepped this way.
- **`MSYS_NO_PATHCONV=1`** is set once at the top of the enclosing Git Bash block
  (BLOCKS.md:596), not inside `mig_apply` itself — it is an environment precondition of the
  whole Phase 4 session, not a per-call guarantee.

Two things `mig_apply` does **not** guarantee, load-bearing for a scripted version: (a) it is a
shell function, alive only in the Git Bash process that sourced it (BLOCKS.md:589-591 says so
explicitly) — a script would need to be a real file, not a paste-once function; (b) it hardcodes
`-U supabase_admin -d postgres` and container `afrakala-lan-db` — there is no parameter for
database name or container, unlike `e2e/helpers/db.ts` (see §1.3) and `ledger-reconcile.sh`
(§3), which both take them as inputs.

### 1.2 BLOCKS.md format and validator

**Format.** Each numbered block (`## بلوک N`) is: a prose "چه می‌کند" (what it does), a fenced
`powershell` or `bash` command, a **"باید ببینی:"** (you must see) section stating literal
expected output (sometimes a table, sometimes a NOTICE string, sometimes just an exit code), and
often a **"اگر … بایست"** (if X, stop) branch. Decision points are marked `🔴 تصمیم` with lettered
options and an explicit recommendation. Stop points are marked `🛑 نقطهٔ توقف N`. This structure
recurs uniformly across all 73 blocks (grep count: `## بلوک` appears throughout §§4.3-4.8, 5, 6, 7).

**Mechanical validator: does not exist.** Search evidence:
```
grep -rn "BLOCKS.md" (repo-wide) → 5 files, all documentation cross-references
  (production-migration-20260908.md, STAGE0-findings.md,
   production-migration-run-20260912.md, MIGRATIONS-74.md, PROGRESS.md)
grep -rn "mig_apply|parse.*BLOCKS" scripts/ → 0 matches
Glob scripts/** → generate-pwa-icons.mjs, generate-release-notes.mjs, regen-routes.mjs,
   scratch/asan-serialization-probe.ts, scratch/dump-xlsx.sh — none touch BLOCKS.md or migrations
```
No script reads BLOCKS.md, extracts its `mig_apply` calls, or checks its `Expect:`-style claims
against live output. `production-migration-run-20260912.md:100-102` claims the migration list was
"validated mechanically: 76 `mig_apply` calls, every file present on disk, every version equal to
its filename prefix, no duplicates" — but no script implementing that check exists in the repo;
this was ad-hoc shell run by the orchestrating agent on 09-12 and not preserved as a reusable
tool. **Confirmed: no validator exists.** This is the gap `emit-blocks.ps1` (Task 4) has to close.

### 1.3 Gates — og81, og102, og103

All three live in `e2e/security/` and share one connection helper, `e2e/helpers/db.ts:15-17`:

```ts
const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";
const DB_USER = process.env.E2E_DB_USER ?? "postgres";
```

`dbRows`/`dbScalar` run `docker exec <CONTAINER> psql -U <DB_USER> -d <DB_NAME> -A -t -c <sql>`
(`db.ts:37-41`) and refuse any SQL containing a write verb (`db.ts:19-33`). **To run these three
specs against an arbitrary database — e.g. a rehearsal DB — set `E2E_DB_NAME` (and
`E2E_DB_CONTAINER` if the rehearsal lives in a different container than `afrakala-lan-db`)
before invoking Playwright. No code change is needed.** There is no `test` script in
`package.json` (confirmed by grep — only the devDependency line exists); the runnable form is
`npx playwright test e2e/security/og81-migration-ledger-matches-disk.spec.ts
e2e/security/og102-pre393-anon-execute-grants-stay-closed.spec.ts
e2e/security/og103-anon-table-grants-stay-closed.spec.ts`. `playwright.config.ts:9-36` matches
`security/*.spec.ts` in the default suite too, but these three don't call `page.goto` or need
`baseURL`/`storageState` — they are pure DB assertions, so the web app does not need to be
running, only the target Postgres container.

- **og81** (`e2e/security/og81-migration-ledger-matches-disk.spec.ts:44-95`) — asserts, both
  directions: every file in `supabase/migrations/*.sql` has a ledger row
  (`supabase_migrations.schema_migrations`), every ledger row has a file, disk count == ledger
  count (both `> 500`, so an empty-vs-empty pass is impossible), and no duplicate version
  prefixes on disk.
- **og102** (`og102-pre393-anon-execute-grants-stay-closed.spec.ts:44-325`) — a **literal list**
  of 142 function signatures (`TARGETS`, lines 44-187) that must NOT be `anon`-executable, and 17
  exclusions (`MUST_STAY_OPEN`, lines 194-212) that must stay `anon`-executable; also checks
  `authenticated`/`service_role` keep EXECUTE on the 142, and that no new function is born
  anon-executable.
- **og103** (`og103-anon-table-grants-stay-closed.spec.ts:53-693`) — a literal `KEEP_OPEN` list
  of 11 tables `anon` may SELECT (lines 53-65), a `REVOKED_SELECT` list of 188 tables (83-274)
  and `REVOKED_WRITE` list of 202 tables (277-482) that must have no `anon` privilege at all;
  plus a `security_invoker` view-reachability check and a hardcoded column-grant assertion
  (`categories=6`, `products=9`, line 610) for the two tables where table-level SELECT was
  replaced by column grants.

All three are literal-list gates (not re-derived from the rule under test) by design — commented
in each file's header as deliberate, so a narrowing of the underlying rule is caught rather than
silently re-legitimized.

### 1.4 Build plumbing

`deploy/lan/docker-compose.yml`, `web` service, `build:` block (lines 29-42):

```yaml
  web:
    build:
      context: ../..
      dockerfile: Dockerfile
      args:
        VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
        VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
        VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID}
        VITE_APP_ENV: ${VITE_APP_ENV:-production}
        VITE_TRUSTED_HOSTS: ${VITE_TRUSTED_HOSTS:-}
        GIT_SHA: ${GIT_SHA:-local-unknown}
        BUILD_TIME: ${BUILD_TIME:-local-unknown}
        APP_ENV: lan
    image: afrakala-app:lan
    container_name: afrakala-lan-web
```

Image name/tag: **`afrakala-app:lan`**; container name **`afrakala-lan-web`**. `GIT_SHA` and
`BUILD_TIME` build args default to the literal string `local-unknown` unless the shell
environment supplies them — `deploy/lan/build.ps1:47-153` is the only script in the repo that
does this correctly (reads `git rev-parse --short HEAD`, exports `$env:GIT_SHA`, refuses a dirty
tree unless `-Force`).

`Dockerfile`: `APP_GIT_SHA` is set at the **runtime stage** (lines 77-84):
```dockerfile
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG APP_ENV=unknown
ENV APP_GIT_SHA=$GIT_SHA \
    APP_BUILD_TIME=$BUILD_TIME \
    APP_ENV=$APP_ENV
```
It is a separate `ARG` from the build stage's own `GIT_SHA`/`BUILD_TIME` (lines 43-44, used only
to bake the service-worker version into the client bundle via `vite.config.ts`) — a Dockerfile
`ARG` is scoped per stage, so both stages declare it (comment at Dockerfile:38-42 states this
explicitly).

`GET /api/version` (`src/routes/api.version.ts:8-21`) reads `process.env.APP_GIT_SHA` and
`process.env.APP_BUILD_TIME` straight from the running container's environment — this is what
`CLAUDE.md`'s "`APP_GIT_SHA` must equal `git rev-parse --short HEAD`" verification step
ultimately checks (via `docker inspect … | Select-String APP_GIT_SHA`, which reads the same env
var without an HTTP round-trip).

`GET /api/healthz` (`src/routes/api.healthz.ts`) does NOT expose the git SHA — it is a liveness
probe (database + optional WhatsApp bridge), 200/503 only, documented in detail at lines 1-50 of
that file (why it reads `currencies` rather than `shop_settings`, tied to og103's `KEEP_OPEN`
list). The healthz route file is `src/routes/api.healthz.ts`.

### 1.5 Existing `promote.ps1` / deploy scripts

**No `promote.ps1` exists.** `Glob "**/promote*.ps1"` → no matches. `grep -rn promote` under
`deploy/` and `scripts/` → no matches. The closest artifacts under `deploy/`:

- `deploy/lan/build.ps1` — builds the image, stamps real `GIT_SHA`/`BUILD_TIME`, refuses a dirty
  tree without `-Force`. Does **not** start anything (explicit in its own trailing output,
  `build.ps1:162-167`).
- `deploy/lan/up.ps1` — runs `docker compose … up -d`, then reads `APP_GIT_SHA`/`APP_BUILD_TIME`
  back out of the *running* container and calls `server/publish-release.mjs` to publish release
  notes (`up.ps1:86-130`). Also has its own dirty-tree guard, but only when `--build` is passed
  (`up.ps1:43-54`).
- `deploy/lan/scripts/update-lan.ps1` — the one-shot "pull current branch, build, up, healthcheck"
  script (`update-lan.ps1:41-93`); pulls whatever branch the local checkout is on (not
  hardcoded), refuses a non-fast-forward pull.

None of these three take a source machine and a target machine as parameters, none transfer an
image, and none apply migrations — they are single-machine build+run scripts. The migration
application path (`mig_apply`) and the deploy path (`build.ps1`/`up.ps1`) are today two entirely
separate, manually-bridged procedures (BLOCKS.md Phase 4 then Phase 6).

### 1.6 Restore-drill commands

Two restore-drill documents exist:

**`deploy/backups/scripts/restore-drill.md`** — the general monthly drill doc. Two procedures:
1. A light checklist (lines 10-46) invoking `restore-postgres.sh` / `restore-storage.sh` with
   `DRY_RUN`/`CONFIRM_RESTORE` env vars, against a **separate staging stack**, never production.
2. "SH-RA.6A — Formal Monthly Drill Procedure" (lines 50-251) — a **disposable container** drill,
   explicitly documentation-only ("این فایل فقط مستندسازی است" — line 56), using a throwaway
   `postgres:15` container named `afrakala-pg-drill` on port `55432`:
   ```bash
   docker run -d --rm --name afrakala-pg-drill -e POSTGRES_PASSWORD=drill_only \
     -e POSTGRES_DB=drill -p 55432:5432 -v afrakala-pg-drill-data:/var/lib/postgresql/data \
     postgres:15
   docker cp "${LATEST_PG}" afrakala-pg-drill:/tmp/drill.dump
   docker exec afrakala-pg-drill pg_restore -U postgres -d drill --no-owner --clean --if-exists /tmp/drill.dump
   ```
   Acceptance criteria (lines 168-180) and a structured drill-log template (lines 205-245) are
   defined but this exact script has never been marked as executed against production data per
   its own header note.

**`docs/runbooks/production-migration-20260908-BLOCKS.md`, Block 0-B** (lines 189-253) is the
actually-executed production-adjacent restore drill for the 09-12 run: creates a scratch database
on the **production cluster itself** (`CREATE DATABASE restore_drill_20260912;`), restores into
it, counts tables/views/functions/policies/`persons`/`audit_logs`, then drops the scratch
database (lines 218-251). This is the drill that the run record
(`docs/research/production-migration-run-20260912.md:130-136`, item `U-1`) says is only *partly*
closed: the morning dump is drilled this way, but the **actual restore target** (the Block 3.5
final dump) is checked only by `pg_restore --list`, size, and md5 (BLOCKS.md:557-577) — not a
full restore-and-count.

---

## TASK 2 — Image transfer feasibility (OG-H)

### 2.1 Would `up -d --no-deps --no-build web` honour a pre-loaded image?

From `deploy/lan/docker-compose.yml:28-44` alone: the `web` service declares **both** `build:`
(context `../..`, `Dockerfile`) and `image: afrakala-app:lan`. Docker Compose's documented
precedence (from Compose's own spec, not tested here) is: when a service has both `image` and
`build`, `docker compose build`/`up --build` builds and tags the result as `image`; `docker
compose up` **without** `--build` uses the named image directly if it already exists locally,
building only if it does not; `--no-build` explicitly forbids the build step even if the image is
missing (that case then errors rather than building). So **on paper**, `docker compose --env-file
deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --no-deps --no-build web` would use
whatever local image is already tagged `afrakala-app:lan` — which is exactly what a `docker load`
of a transferred tarball produces if the transferred image is tagged/retagged to that name before
`up` runs. **NEEDS-EMPIRICAL-CONFIRMATION**: the repo's own compose file and Dockerfile do not by
themselves prove Compose will not still attempt a build (e.g. Compose v2's `--pull` defaults, or
version-specific quirks); this must be verified by the orchestrator running the exact command
against a `docker load`-ed image before `release/apply-release.ps1` relies on it.

### 2.2 LAN copy channels, 192.168.170.8 → 192.168.170.10 — all UNTESTED

All three are `UNTESTED` per mission constraint (no docker/network commands run). Preconditions
listed below are drawn from what the repo currently proves is/isn't already set up.

**(a) SMB share.**
```powershell
# On .8 (already has the image after docker save | gzip, see 2.3):
New-SmbShare -Name "afrakala-transfer" -Path "C:\transfer" -FullAccess "Everyone"   # UNTESTED
# On .10:
Copy-Item "\\192.168.170.8\afrakala-transfer\afrakala-app-lan.tar.gz" "C:\transfer\" # UNTESTED
```
Must already be true: SMB (port 445) reachable between the two hosts — `deploy/lan/scripts/
firewall-lan-admin.ps1:32-53` only opens `APP_PORT` (3000) and `SUPABASE_API_PORT` (8000)
inbound; no rule for 445 exists in the repo. A writable share must be created ad hoc; nothing in
`deploy/` provisions one. Verify integrity: `Get-FileHash -Algorithm SHA256` on both ends,
compare manually or in a script.

**(b) `scp`.**
```bash
scp afrakala-app-lan.tar.gz user@192.168.170.10:C:/transfer/   # UNTESTED
```
Must already be true: an SSH server running and reachable on `.10` (Windows OpenSSH Server
optional feature, or similar) — no evidence in the repo that one is installed; `CLAUDE.md` and
`deploy/lan/README.md` describe only RDP/local-console access to the production laptop, never
SSH. A firewall rule for port 22 would also be needed and does not exist today. Verify integrity:
`sha256sum` both ends (or `certutil -hashfile … SHA256` on Windows, the same tool BLOCKS.md
already uses for dump files at line 178).

**(c) `python -m http.server` pulled with `curl`.**
```powershell
# On .8, in the directory holding the tarball:
python -m http.server 8899                                      # UNTESTED
# On .10:
curl.exe -o afrakala-app-lan.tar.gz http://192.168.170.8:8899/afrakala-app-lan.tar.gz  # UNTESTED
```
Must already be true: Python available on `.8` (not confirmed present — no evidence either way in
this repo, since it is a Node/Bun project); a firewall rule opening an arbitrary port (8899 here)
outbound from `.8` and inbound reachability from `.10`, which does not exist per
`firewall-lan-admin.ps1`. This channel is the simplest to stand up ad hoc (no persistent service,
no credentials) but also the least authenticated — worth noting since the tarball is a full
application image, not secret data, so that tradeoff is likely acceptable but is a judgment call
for the building agent, not decided here. Verify integrity: `certutil -hashfile … SHA256` (or
`sha256sum` if using Git Bash on both ends) compared manually.

### 2.3 Tarball size measurement — `ORCHESTRATOR-TO-RUN`

```bash
docker save afrakala-app:lan | gzip -9 > /tmp/afrakala-app-lan.tar.gz   # ORCHESTRATOR-TO-RUN
ls -lh /tmp/afrakala-app-lan.tar.gz                                     # ORCHESTRATOR-TO-RUN
docker images afrakala-app:lan --format "{{.Size}}"                     # ORCHESTRATOR-TO-RUN (uncompressed, faster sanity check)
```
The Dockerfile's runtime stage ships `node_modules` in full (`Dockerfile:94`, comment explains
this is deliberate for self-host so `h3-v2` and friends resolve) on top of `node:22-alpine`, so
the image is larger than a typical Alpine Node image but exact size cannot be stated without
running the above.

---

## TASK 3 — Rehearsal automation: step-by-step scriptability

Target pipeline: *restore newest prod dump → `prod_rehearsal_<date>` → replay every migration not
in that DB's ledger with `mig_apply` → run og81/og102/og103 + an anon census over `relkind
v,m` → emit a report.*

| # | Step | Scriptable today? | Why |
|---|---|---|---|
| 1 | Locate newest prod dump | **Yes** | File-listing/glob by mtime on the known dump path pattern (`prod-YYYYMMDD-final.dump`, per BLOCKS.md §3.5.2 naming). No existing script does this specifically, but it's a one-liner. |
| 2 | Copy dump into the DB container, verify md5 both sides | **Yes** | `mig_apply`'s own delivery pattern (`cat file \| docker exec -i … cat >`, then `md5sum` both sides) is already proven and directly reusable; BLOCKS.md §3.5.2/§0-B do exactly this. |
| 3 | `CREATE DATABASE prod_rehearsal_<date>` | **Yes**, with a caveat | `psql -c "CREATE DATABASE …"` is trivial, but it must run against a database/cluster that is **not** production `postgres` unless the rehearsal is deliberately run on the LAN test container (`afrakala-lan-db` on `.8`) rather than on `.10`. `ledger-reconcile.sh:48-50` already hardcodes a refusal (`case "$DB" in postgres) echo REFUSED …`) — the same guard pattern should protect a rehearsal-runner script from ever being pointed at the real `postgres` database. |
| 4 | `pg_restore` the dump into that database | **Yes** | `pg_restore -U supabase_admin -d prod_rehearsal_<date> --no-owner --disable-triggers <dump>` — proven pattern at BLOCKS.md:222-223 for the level-2 drill; `--disable-triggers` is required per the dump's own circular-FK warning (BLOCKS.md:550-551). Exit 1 with ~21 known-benign errors (pg_cron + vault objects) is the *expected*, scriptable-to-tolerate outcome, per BLOCKS.md:235-237 — a rehearsal script needs an explicit allowlist of tolerable `pg_restore` error substrings, which does not exist yet as code. |
| 5 | Compute the "not-applied" set for that DB | **Yes** | This is exactly what `ledger-reconcile.sh` (§ below) already does: `(files ≤ ceiling) MINUS (declared-not-applied)` vs. the ledger, producing `_gap`/`_orphan`. Reusable almost as-is; the "declared-not-applied" list (`not-applied-rehearsal.txt` pattern) is currently a hand-maintained file (`docs/missions/prodprep/ledger-reconcile.sh:14-23` says so explicitly) — a rehearsal runner would need to either derive it fresh each run (risky — that's the "no witness" problem the script's own header documents) or accept it as an input the caller supplies. |
| 6 | Replay each not-applied migration via `mig_apply` | **Partially** | The function itself is directly portable (it is just a shell function reading two args), but as noted in §1.1 it hardcodes `-d postgres` and container `afrakala-lan-db`. A rehearsal-safe version needs `$DB` and `$CONTAINER` as parameters — a small, mechanical change, not a redesign. **Needs a human decision, not because it's hard, but because of the expected-failure migrations (449/450/452 per BLOCKS.md §4.4)**: an automated replay must either (a) hardcode the same "expected to fail, do not record" list this run's BLOCKS.md hand-curated, which silently goes stale the next time new migrations are added, or (b) stop and require a human decision at any migration whose live behaviour disagrees with a pre-declared expectation. Full automation of *this specific step* trades away the safety property that caught 449/450/452's wrong assumptions in the first place — this is a genuine design tradeoff for `rehearse.ps1`, not just missing code. |
| 7 | Run og81 + og102 + og103 against `prod_rehearsal_<date>` | **Yes** | `E2E_DB_NAME=prod_rehearsal_<date> E2E_DB_CONTAINER=<container> npx playwright test e2e/security/og81-*.spec.ts e2e/security/og102-*.spec.ts e2e/security/og103-*.spec.ts` — no code change needed, per §1.3. |
| 8 | Anon census over `relkind v,m` (views + materialized views) | **Mostly yes, one gap** | og103's own test file (§1.3) only queries `relkind = 'r'` (ordinary tables) via its `PUBLIC_TABLES` CTE (`og103-…spec.ts:488-492`). A census over views/matviews is not covered by any existing gate — this would be new SQL (`select relname, relkind from pg_class c join pg_namespace n … where relkind in ('v','m') and has_table_privilege('anon', c.oid, 'SELECT')`), straightforward to write but does not exist today. |
| 9 | Emit a report | **Yes** | Mechanical: capture the exit code and output of each step above into a structured file. No existing tool does this specifically for a rehearsal run, but nothing about it requires human judgment — it's log capture and formatting. |
| 10 | Tear down (`DROP DATABASE prod_rehearsal_<date>`) | **Yes** | Mirrors BLOCKS.md:246-251 exactly; trivial to script, should be unconditional (a `finally`-style cleanup) so a failed rehearsal doesn't leave a scratch DB behind. |

**Net finding:** every individual step is scriptable except step 6's failure-expectation
handling, which is a genuine judgment boundary (not a missing script) — the rehearsal only
retains its value as a safety net if it can still surprise the operator when a migration's
real-world behaviour disagrees with what was hand-declared last time. `rehearse.ps1` should
therefore default to **stop-on-unexpected-result** and only skip a migration silently when the
caller has explicitly pre-declared it as an expected failure for *this specific run*.

---

## TASK 4 — VERDICT: the `release/` script set

### `release/rehearse.ps1`
- **Inputs:** `-Dump <path>` (defaults to newest matching `prod-*-final.dump`), `-Container`
  (default `afrakala-lan-db`), `-RehearsalDbPrefix` (default `prod_rehearsal_`), `-Date` (default
  today), `-ExpectedFailures <path>` (a JSON/text file naming migrations allowed to fail without
  aborting the run — empty by default, meaning "stop on any failure").
- **Outputs:** `release/out/rehearsal-<date>.md` (or `.json`) capturing: dump identity (path,
  size, md5), restore exit code and the 21-ish tolerated `pg_restore` error lines vs. any others,
  the not-applied migration set, per-migration apply result (OK / expected-fail / unexpected-fail
  — the last one aborts), og81/og102/og103 pass/fail per test, the view/matview anon census
  (new SQL from Task 3 step 8), and a final PASS/FAIL verdict line.
- **Exit conditions:** non-zero on: restore failure with an untolerated error, any unexpected
  migration failure, any gate test failure, or a view/matview anon leak. Always tears down the
  rehearsal database in a `finally`, even on failure — a rehearsal that leaves state behind
  defeats its own repeatability.
- **Idempotency:** must be safe to re-run against a fresh dump of the same date — refuses to
  reuse an existing `prod_rehearsal_<date>` database (mirrors `ledger-reconcile.sh`'s refusal
  pattern) rather than silently dropping/recreating one that might be mid-inspection by a human.

### `release/build.ps1`
- **Inputs:** none required beyond the existing working tree; optionally `-Tag` to override the
  default `afrakala-app:lan` image name for a transfer scenario (e.g. tagging separately for
  production so a mistaken `docker compose build` on `.10` can't silently overwrite a
  transferred image).
- **Outputs:** the built image, and a manifest file (`release/out/build-<sha>.json`) recording
  `GIT_SHA`, `BUILD_TIME`, image tag, and image size (`docker images … --format "{{.Size}}"`).
- **Exit conditions:** refuses a dirty tree exactly like today's `deploy/lan/build.ps1:64-73`
  (that guard is proven and should be reused, not reinvented) — this script should probably
  wrap/call the existing `build.ps1` rather than duplicate its logic, to avoid the two drifting
  apart.
- **Idempotency:** rebuilding the same commit produces the same `GIT_SHA` stamp; `BUILD_TIME`
  necessarily differs — that's expected and already how `/api/version` is documented to behave.

### `release/emit-blocks.ps1`
- **Inputs:** the migration list to apply (derived the same way BLOCKS.md's Phase 4 table was —
  files with timestamp in a range, minus a declared skip-list), the rehearsal report from
  `rehearse.ps1` (to carry forward which migrations are expected to fail and why), and the target
  environment's read values (ledger max, schema top, `ai_providers.base_url`, etc., i.e. what
  BLOCKS.md's Block 1 preflight reads).
- **Outputs:** `RELEASE-<date>.md` in the BLOCKS.md format (see shape below) — this is the
  mechanical-validator gap identified in Task 1.2, closed by generation rather than by writing a
  parser for hand-authored prose after the fact.
- **Exit conditions:** fails loudly if the rehearsal report says any migration had an
  *unexpected* result, or if it's missing entirely (a release doc generated without a rehearsal
  behind it is exactly the risk this whole pipeline exists to remove).
- **Idempotency:** re-running for the same date with the same inputs produces a byte-identical
  document (no timestamps beyond the date, no non-deterministic ordering).

### `release/apply-release.ps1`
- **Inputs:** the `RELEASE-<date>.md` (or a machine-readable sibling it's generated from —
  recommend generating a `.json` alongside the `.md` specifically so this script doesn't have to
  re-parse prose), `-DryRun` switch, `-Confirm` gate matching the existing `CONFIRM_RESTORE`/typed
  confirmation pattern from `deploy/backups/scripts/restore-postgres.sh:29-34` for any
  destructive step.
- **Outputs:** the applied migrations (via a parameterized `mig_apply`, per §3 step 6), the
  ledger state before/after, and — per the mission's own hard constraint — this script **must
  stop before any deploy/image-swap step** and hand control back to a human, exactly as this
  research task itself was scoped to stop short of running anything.
- **Exit conditions:** any single block's live output disagreeing with its declared `Expect:`
  aborts immediately (this is the automation of BLOCKS.md's own repeated "**هر خروجی که با «باید
  ببینی» فرق دارد، توقف کامل است**" rule).
- **Idempotency:** safe to resume from the last successfully-applied migration if interrupted —
  requires checking the ledger before each `mig_apply` call rather than assuming a linear
  in-process state, since the whole point of the ledger is that it survives a restart.

### Shape of the generated `RELEASE-<date>.md`

One block per migration, each carrying:
```
### Block N — migration <version> · <file>

    mig_apply <version> <file>

Expect: OK <file>
Expect: INSERT 0 1
```
plus, for migrations with a known assertion output (the pattern already used throughout
BLOCKS.md, e.g. the `481 OK: allocation_rows created; 31 person FKs...` NOTICE), the literal
expected NOTICE/output line(s) carried forward from the rehearsal report rather than re-typed by
hand. Additional non-migration blocks, each with the same `Expect:` structure:

- **Preflight block** — schema top, ledger count, `ai_providers.base_url`, anon default-ACL
  count (mirrors BLOCKS.md Block 1).
- **Image block** — `docker save`/transfer/`docker load` commands from Task 2, with an `Expect:`
  on the loaded image's `docker images afrakala-app:lan --format "{{.ID}}"` matching what was
  built, or (if building locally instead of transferring) the `build.ps1` stamp.
- **Deploy block** — the `up -d --no-deps --build web` (or `--no-build`, per Task 2) command
  with `GIT_SHA`/`BUILD_TIME` set on the command line, exactly as `CLAUDE.md`'s amended
  2026-08-26 rule requires.
- **Verify block** — `docker inspect … APP_GIT_SHA` == `git rev-parse --short HEAD`, container
  status table, `/login` and `/api/healthz` curl checks — mirrors BLOCKS.md Block 71.
- **Rollback block** — the pre-deploy image tag/retag commands and the exact `docker start
  afrakala-lan-web` / tag-swap recovery sequence, so it exists as a literal block rather than as
  prose a stressed human has to reconstruct at 2am.
- **Sign-off block** — a literal checklist line per gate (og81/og102/og103 + the human smoke
  steps from BLOCKS.md Phase 7) with `Expect:` restated, and a place to paste the executor's name
  and timestamp — mirrors the "دفتر" (run log) pattern BLOCKS.md already uses, but as a first-
  class part of the generated document instead of a side file the orchestrator appends to by hand.

---

## UNKNOWN

- Whether `docker compose … up -d --no-deps --no-build web` actually uses a pre-loaded local
  image without attempting any build, on the Compose version installed on these two machines —
  marked `NEEDS-EMPIRICAL-CONFIRMATION` in Task 2.1; the compose file does not settle this alone.
- Actual compressed/uncompressed size of `afrakala-app:lan` — no `docker save`/`docker images`
  command was run (forbidden by mission scope); commands are supplied as
  `ORCHESTRATOR-TO-RUN` in Task 2.3.
- Whether SMB (445), SSH (22), or an arbitrary HTTP port are open between `.8` and `.10` today —
  `deploy/lan/scripts/firewall-lan-admin.ps1` only opens 3000/8000 inbound on the local host it
  runs on; nothing in the repo proves or disproves cross-host reachability on other ports.
- Whether Python is installed on either LAN machine (relevant to the `http.server` channel) —
  no evidence either way in a Node/Bun-only repo.
- Whether `docker save | gzip` piping works acceptably from PowerShell on these hosts, or needs
  Git Bash — not testable without running docker, and `CLAUDE.md`'s repeated PowerShell-pipe
  encoding warnings (for SQL) suggest binary pipes through PowerShell deserve the same
  skepticism, though that specific failure mode (UTF-16 text corruption) is about text, not
  binary streams, so it may not apply the same way to a `.tar.gz` — genuinely unverified.
- Whether Compose v2's `--pull` default or any other flag not visible from the YAML file alone
  would interfere with using a `docker load`-ed image — same empirical gap as the first item.
