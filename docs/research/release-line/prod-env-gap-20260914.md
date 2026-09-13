# The production environment gap — measured, written out, NOT applied

**Host:** production laptop `192.168.170.10` · **Date:** 2026-09-14 ·
**Branch point:** `main @ 9bc8d554` · **Running image:** `8b04c479e022` (`APP_GIT_SHA=d60232f5`, the
2026-09-13 rollback) · **Ledger:** 696

This document is a **plan**. Nothing in it has been applied. No `.env.lan` was edited, no compose
file was edited, no container was restarted, no image was built or tagged. Every number below was
measured read-only on this host on 2026-09-14.

---

## 0 · The correction that reframes the whole task

The request was phrased as "`.10` must supply **three runtime values**". Measured on this host, that
is true of **one** of the three; the other two are not runtime values at all:

| name | what it actually is, in the code at `main @ 9bc8d554` | reaches a running container? |
|---|---|---|
| `APP_SUPABASE_PUBLIC_URL` | **runtime** — read by `src/routes/api.version.ts:18` via `process.env` | **yes**, via compose `environment:` |
| `VITE_APP_ENV` | **build-time** — Vite substitutes `import.meta.env.VITE_*` into the bundle at build | **no**, only via `build: args:` |
| `VITE_TRUSTED_HOSTS` | **build-time** — same | **no**, only via `build: args:` |

This distinction is not pedantry; it is the 2026-09-13 incident restated. That release deployed with
`--no-build`, so the correct `VITE_*` values already sitting in `.10`'s `.env.lan` **could never
apply** — the image carried the *test box's* values, baked in when it was built there. Putting
`VITE_APP_ENV` into a compose `environment:` block would not have prevented it and will not prevent
a recurrence. **Only a build performed on, or explicitly targeted at, `.10` fixes the `VITE_*` pair.**

So the plan below is split accordingly: an env/compose change that genuinely fixes
`APP_SUPABASE_PUBLIC_URL`, and a build-input change for the other two which is recorded here but
belongs to the release's build step, not to `.env.lan`.

---

## 1 · Shape of both `.env.lan` files

Values redacted; this is the file's shape, not its contents.

### `C:\afrakala\deploy\lan\.env.lan`

```
bytes = 3195   lines = 73   line endings = CRLF (73 of 73)   ends with newline = YES   BOM = none
non-ASCII lines = 0

[redacted line 64]
    65  VITE_APP_ENV=production
    66  VITE_TRUSTED_HOSTS=192.168.170.10,localhost
    67  # --- release 20260913b - OCR + local Ollama (ISSABEL_* deferred to the scheduler mini-release) ---
    68  OCR_ENABLED=true
    69  OLLAMA_API_URL=http://192.168.170.8:11434
[redacted line 70]
    71  OLLAMA_MODEL=qwen2.5:7b
    72  OLLAMA_EMBED_MODEL=bge-m3:latest
    73  OLLAMA_VISION_MODEL=qwen3.6:latest
```

### `C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan`

```
bytes = 2947   lines = 71   line endings = CRLF (71 of 71)   ends with newline = YES   BOM = none
non-ASCII lines = 0

    62  (blank)
[redacted line 63]
[redacted line 64]
    65  # --- release 20260913b - OCR + local Ollama (ISSABEL_* deferred to the scheduler mini-release) ---
    66  OCR_ENABLED=true
    67  OLLAMA_API_URL=http://192.168.170.8:11434
[redacted line 68]
    69  OLLAMA_MODEL=qwen2.5:7b
    70  OLLAMA_EMBED_MODEL=bge-m3:latest
    71  OLLAMA_VISION_MODEL=qwen3.6:latest
```

**Both files are CRLF, BOM-free, pure ASCII, and newline-terminated.** That matters for the append
method in section 4: an LF-only append would leave the file mixed, and a PowerShell cmdlet that adds
a BOM mid-file would corrupt the first appended line. `Add-Content` on Windows PowerShell 5.1 writes
CRLF by default and adds no BOM for ASCII content, which is why it is the method specified.

Neither file contains `APP_SUPABASE_PUBLIC_URL` — confirmed by name search, not by eye. The stale
tree additionally lacks `VITE_APP_ENV` and `VITE_TRUSTED_HOSTS`.

---

## 2 · The compose blocks, quoted

### A · `C:\afrakala\deploy\lan\docker-compose.yml` — `build: args:` (lines 29-42)

```yaml
    29      build:
    30        context: ../..
    31        dockerfile: Dockerfile
    32        args:
    33          VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
    34          VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
    35          VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID}
    36          # production روی سرور اصلی، test روی کامپیوتر تست.
    37          # VITE_TRUSTED_HOSTS آدرس واقعی همان سرور است تا بنر هشدار قرمز نمایش داده نشود.
    38          VITE_APP_ENV: ${VITE_APP_ENV:-production}
    39          VITE_TRUSTED_HOSTS: ${VITE_TRUSTED_HOSTS:-}
    40          GIT_SHA: ${GIT_SHA:-local-unknown}
    41          BUILD_TIME: ${BUILD_TIME:-local-unknown}
    42          APP_ENV: lan
```

### A · same file — `environment:` (lines 45-84)

```yaml
    45      environment:
    46        NODE_ENV: ${NODE_ENV:-production}
    47        HOST: 0.0.0.0
    48        PORT: "3000"
    49        SUPABASE_URL: ${SUPABASE_URL}
    50        SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_PUBLISHABLE_KEY}
    51        SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    52        LOVABLE_API_KEY: ${LOVABLE_API_KEY}
    53        OCR_ENABLED: ${OCR_ENABLED:-false}
    54-55    # (comment: the Ollama names api/messenger/ai-chat.ts already reads)
    56        OLLAMA_API_URL: ${OLLAMA_API_URL:-}
    57        OLLAMA_API_KEY: ${OLLAMA_API_KEY:-}
    58        OLLAMA_MODEL: ${OLLAMA_MODEL:-}
    59        OLLAMA_EMBED_MODEL: ${OLLAMA_EMBED_MODEL:-}
    60        OLLAMA_VISION_MODEL: ${OLLAMA_VISION_MODEL:-}
    61        APP_SUPABASE_PUBLIC_URL: ${APP_SUPABASE_PUBLIC_URL:-}      <-- declared, never supplied
    62        WHATSAPP_PLATFORM_BASE_URL: ${WHATSAPP_PLATFORM_BASE_URL:-http://192.168.170.8:8002}
    63-64    # (comment: WHATSAPP_TOP_PRODUCTS_LIMIT is runtime-only)
    65        WHATSAPP_TOP_PRODUCTS_LIMIT: ${WHATSAPP_TOP_PRODUCTS_LIMIT:-}
    66-69    # (comment: Phase 10 / 224 marketing-task cron token)
    70        MARKETING_TASKS_WORKER_TOKEN: ${MARKETING_TASKS_WORKER_TOKEN:-}
    71-75    # (comment: C-4 Issabel CDR, server-only)
    76        ISSABEL_CDR_HOST: ${ISSABEL_CDR_HOST:-}
    77        ISSABEL_CDR_PORT: ${ISSABEL_CDR_PORT:-3306}
    78        ISSABEL_CDR_USER: ${ISSABEL_CDR_USER:-}
    79        ISSABEL_CDR_PASSWORD: ${ISSABEL_CDR_PASSWORD:-}
    80        ISSABEL_CDR_DB: ${ISSABEL_CDR_DB:-}
    81-83    # (comment: C-6 shared token for the import hook)
    84        ISSABEL_IMPORT_WORKER_TOKEN: ${ISSABEL_IMPORT_WORKER_TOKEN:-}
```

### B · `C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml` — `build: args:` (lines 29-35)

```yaml
    29      build:
    30        context: ../..
    31        dockerfile: Dockerfile
    32        args:
    33          VITE_SUPABASE_URL: ${VITE_SUPABASE_URL}
    34          VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
    35          VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID}
```

### B · same file — `environment:` (lines 38-46) — the whole block

```yaml
    38      environment:
    39        NODE_ENV: ${NODE_ENV:-production}
    40        HOST: 0.0.0.0
    41        PORT: "3000"
    42        SUPABASE_URL: ${SUPABASE_URL}
    43        SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_PUBLISHABLE_KEY}
    44        SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
    45        LOVABLE_API_KEY: ${LOVABLE_API_KEY}
    46        OCR_ENABLED: ${OCR_ENABLED:-false}
```

### Where the three names appear

| | canonical `build: args:` | canonical `environment:` | stale `build: args:` | stale `environment:` |
|---|---|---|---|---|
| `APP_SUPABASE_PUBLIC_URL` | — | **line 61** | — | — |
| `VITE_APP_ENV` | **line 38** | — | — | — |
| `VITE_TRUSTED_HOSTS` | **line 39** | — | — | — |

The canonical tree therefore needs **one line in `.env.lan` and no compose edit** for
`APP_SUPABASE_PUBLIC_URL`. The stale tree needs **both**.

---

## 3 · Does adding a key to `.env.lan` affect the RUNNING container?

**No. Your expectation is correct — confirmed, not corrected.** Here is the mechanism and the evidence.

Interpolation happens in the **compose client, at command time**, not in the daemon and not in the
container. `docker compose` reads `.env.lan`, substitutes every `${NAME}` / `${NAME:-default}` in the
YAML, and passes the **fully resolved** environment to the daemon when it **creates** the container.
The daemon writes that resolved list into the container's `Config.Env`, where it is frozen for the
life of that container object. Nothing re-reads the file afterwards: not `docker start`, not
`docker restart`, not the container's own process. Changing the value requires **recreating** the
container — `docker compose up -d` compares the resolved config against the running container and
replaces it when they differ. This is why `docker restart` is never sufficient for an env change.

Measured here, without changing anything:

```
$ docker compose --env-file .env.lan -f docker-compose.yml config      # pure file read
      APP_SUPABASE_PUBLIC_URL: ""            <- the client resolves it NOW, from the file
      SUPABASE_URL: http://kong:8000
        VITE_APP_ENV: production
        VITE_TRUSTED_HOSTS: 192.168.170.10,localhost

$ docker exec afrakala-lan-web printenv APP_SUPABASE_PUBLIC_URL
                                          <- empty; frozen at create time
$ docker inspect afrakala-lan-web --format '{{.Created}}'
2026-09-13T14:42:54.541975421Z            <- the moment that list was frozen
$ docker ps --filter name=afrakala-lan-web
afrakala-lan-web   Up 6 hours (healthy)   <- running ever since, unaffected by any file
```

Corroborating evidence from this project's own history: `ISSABEL_*` sat in `.env.lan` for weeks while
`env | grep -c ISSABEL` inside the running container returned **0**, because compose did not declare
them. That proves the second half of the rule — a key in `.env.lan` with no matching `environment:`
entry reaches nothing, ever, no matter how many restarts happen.

**Consequence for scheduling: this change is safe to make at any time before the release.** Editing
`.env.lan` is inert until the next `docker compose up -d` recreates the container. It does not have
to happen inside the release window, and it cannot disturb the currently running image on its own.
The moment it becomes live is the release's own `up -d` — the same command that would deploy the new
image anyway.

---

## 4 · The exact change — WRITTEN, NOT APPLIED

### 4.0 · Back up first

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item "C:\afrakala\deploy\lan\.env.lan" "C:\afrakala\deploy\lan\.env.lan.bak-$stamp"
Copy-Item "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan" "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan.bak-$stamp"
Copy-Item "C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml" "C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml.bak-$stamp"
Get-ChildItem "C:\afrakala\deploy\lan\.env.lan.bak-$stamp", "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan.bak-$stamp", "C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml.bak-$stamp" | Select-Object FullName, Length
```

`.env.lan*` is already ignored by git (mandatory rule 4: never commit env files), so the `.bak-`
copies do not pollute the tree. The image rollback point is **already taken and verified present in
the store**: `afrakala-app:lan-rollback` → `sha256:8b04c479e022…`, `docker image inspect` exit 0.

### 4.1 · Lines to append to `C:\afrakala\deploy\lan\.env.lan` (after line 73)

```
# --- 2026-09-14 - runtime public URL for /api/version. Browser-reachable Kong on THIS host.
# Must never be http://kong:8000 - that name resolves only inside the compose network.
APP_SUPABASE_PUBLIC_URL=http://192.168.170.10:8000
```

Append preserving CRLF, no BOM (Windows PowerShell 5.1):

```powershell
Add-Content -Path "C:\afrakala\deploy\lan\.env.lan" -Encoding ascii -Value @(
  "# --- 2026-09-14 - runtime public URL for /api/version. Browser-reachable Kong on THIS host.",
  "# Must never be http://kong:8000 - that name resolves only inside the compose network.",
  "APP_SUPABASE_PUBLIC_URL=http://192.168.170.10:8000"
)
```

`VITE_APP_ENV` and `VITE_TRUSTED_HOSTS` are **already present and already correct** in this file
(lines 65-66). Do not add them again; a duplicate key in an env file is last-wins and invites a
silent divergence later.

### 4.2 · Lines to append to `C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan` (after line 71)

```
# --- 2026-09-14 - parity with C:\afrakala\deploy\lan\.env.lan
APP_SUPABASE_PUBLIC_URL=http://192.168.170.10:8000
VITE_APP_ENV=production
VITE_TRUSTED_HOSTS=192.168.170.10,localhost
```

```powershell
Add-Content -Path "C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan" -Encoding ascii -Value @(
  "# --- 2026-09-14 - parity with C:\afrakala\deploy\lan\.env.lan",
  "APP_SUPABASE_PUBLIC_URL=http://192.168.170.10:8000",
  "VITE_APP_ENV=production",
  "VITE_TRUSTED_HOSTS=192.168.170.10,localhost"
)
```

### 4.3 · Compose edit — canonical tree: **NONE**

`C:\afrakala\deploy\lan\docker-compose.yml` line 61 already declares
`APP_SUPABASE_PUBLIC_URL: ${APP_SUPABASE_PUBLIC_URL:-}`. Supplying the key in `.env.lan` is the whole
change. **Do not edit this file.**

### 4.4 · Compose edit — stale tree

Insert **one line** after line 46. Surrounding lines quoted so the insertion point is unambiguous:

```yaml
# ---------- before ----------
    45        LOVABLE_API_KEY: ${LOVABLE_API_KEY}
    46        OCR_ENABLED: ${OCR_ENABLED:-false}
    47      ports:
    48        - "${APP_PORT:-3000}:3000"

# ---------- after ----------
    45        LOVABLE_API_KEY: ${LOVABLE_API_KEY}
    46        OCR_ENABLED: ${OCR_ENABLED:-false}
    47        APP_SUPABASE_PUBLIC_URL: ${APP_SUPABASE_PUBLIC_URL:-}     # <-- NEW
    48      ports:
    49        - "${APP_PORT:-3000}:3000"
```

Indentation is **six spaces**, matching lines 39-46. The `:-` default is required: without it compose
warns and substitutes empty anyway, and the file stops being usable on a host that has not set the key.

Optionally, for build parity, add two lines to that file's `build: args:` block:

```yaml
# ---------- before ----------
    34          VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
    35          VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID}
    36      image: afrakala-app:lan

# ---------- after ----------
    34          VITE_SUPABASE_PUBLISHABLE_KEY: ${VITE_SUPABASE_PUBLISHABLE_KEY}
    35          VITE_SUPABASE_PROJECT_ID: ${VITE_SUPABASE_PROJECT_ID}
    36          VITE_APP_ENV: ${VITE_APP_ENV:-production}               # <-- NEW
    37          VITE_TRUSTED_HOSTS: ${VITE_TRUSTED_HOSTS:-}             # <-- NEW
    38      image: afrakala-app:lan
```

This second edit only matters if a build is ever run from that tree. **It does not fix the
2026-09-13 defect**, because that image was built on the test box and deployed with `--no-build`;
see section 0.

### 4.5 · How it goes live

Nothing above takes effect until the container is recreated. That happens as part of the release:

```powershell
cd C:\afrakala\deploy\lan
docker compose --env-file .env.lan -f docker-compose.yml up -d --no-deps web
```

`--no-deps` is mandatory (CLAUDE.md — without it `db-role-fix` joins the start-up graph, cannot start
on this host, and takes `web` down with it).

### 4.6 · Verification, and its exact expected output

Run all three. Any one of them failing means the change did not take.

```powershell
# 1 - the container now holds the value
docker exec afrakala-lan-web printenv APP_SUPABASE_PUBLIC_URL
```
expected, exactly:
```
http://192.168.170.10:8000
```

```powershell
# 2 - the endpoint that consumes it stops saying "unknown"
curl.exe -s http://192.168.170.10:3000/api/version
```
expected `supabasePublicUrl` field, exactly:
```
"supabasePublicUrl":"http://192.168.170.10:8000"
```
**Today's measured value, for comparison, is `"supabasePublicUrl":"unknown"`.** That single field
flipping from `unknown` to the LAN address is the proof.

```powershell
# 3 - nothing else moved
docker ps --filter name=afrakala-lan- --format "{{.Names}}  {{.Status}}"
```
expected: `afrakala-lan-web` `Up … (healthy)`, `afrakala-lan-db-role-fix` `Exited (0)`, every other
`afrakala-lan-*` `Up`.

A **negative** check worth running in the same breath, because it is the 2026-09-13 defect's own
signature:

```powershell
docker exec afrakala-lan-web sh -c "grep -rc '192.168.170.8:9000' /app/.output | grep -v ':0$'"
```
expected: **no output at all** (exit 1). Any line printed means a test-box Kong address is baked into
the served bundle again.

---

## 5 · What breaks if this is applied and the release then does NOT happen?

**Nothing breaks, and the current image is not harmed by these values being present.** Three separate
reasons, each independently sufficient:

1. **Until a `docker compose up -d` recreates the container, the change is literally invisible.**
   Section 3 establishes this. The running container's `Config.Env` was frozen at
   `2026-09-13T14:42:54Z` and cannot change. A `.env.lan` edit today is a file edit and nothing more.

2. **If the container *is* recreated on the current image, the only behavioural difference is one
   JSON field.** `APP_SUPABASE_PUBLIC_URL` has exactly one consumer at `main @ 9bc8d554`:
   `src/routes/api.version.ts:18`, where it is the first term of
   `APP_SUPABASE_PUBLIC_URL || VITE_SUPABASE_URL || "unknown"`. Supplying it changes
   `GET /api/version`'s `supabasePublicUrl` from `"unknown"` to `"http://192.168.170.10:8000"`. It is
   a reporting field: it configures no Supabase client, does not affect SSR, does not affect the
   browser bundle, and is read by nothing else in the tree — verified by a name search across `src/`,
   which returns that one line.

3. **The value is correct for this host regardless of which image runs.** `http://192.168.170.10:8000`
   is production's own browser-reachable Kong — the same address the rolled-back bundle points at
   today (four occurrences measured on 2026-09-13). It is right for the old image and right for the
   new one, so there is no window in which it is wrong.

The stale tree's `VITE_APP_ENV=production` / `VITE_TRUSTED_HOSTS=192.168.170.10,localhost` are
likewise inert unless a build is run from that tree. **One caveat, recorded because it bit us once:**
if those two are ever supplied to a build, they must be supplied **together**. Setting only
`VITE_APP_ENV=production` swaps the amber "test environment" banner for the **red** "production on an
untrusted address" banner, because `isLocalOrTestHost("192.168.170.10")` is true and an empty trusted
list fails the check. Half of this change is worse than none of it.

**The reverse direction is the real risk.** If the release happens *without* this change, the runtime
config mechanism now on `staging` finds `APP_SUPABASE_PUBLIC_URL` empty and falls back to
`SUPABASE_URL`, whose value on this host is `http://kong:8000` — a Docker-internal DNS name that no
staff browser can resolve or route to. That is the same class of failure as 2026-09-13, arriving from
the opposite side.

---

## 6 · Divergence between the two trees, and which one autostart would use

### The current divergence

| | `C:\afrakala` (canonical) | `C:\AfraKalaServer\get-git-going01lan` (stale) |
|---|---|---|
| `APP_SUPABASE_PUBLIC_URL` in `.env.lan` | absent | absent |
| `APP_SUPABASE_PUBLIC_URL` in compose | **declared, line 61** | **not declared at all** |
| `VITE_APP_ENV` / `VITE_TRUSTED_HOSTS` in `.env.lan` | present, correct | **absent** |
| `VITE_APP_ENV` / `VITE_TRUSTED_HOSTS` as build args | lines 38-39 | **absent** |
| `OLLAMA_*`, `WHATSAPP_*`, `ISSABEL_*`, `MARKETING_*` in compose | present | **absent** |
| `GIT_SHA` / `BUILD_TIME` build args | lines 40-41 | **absent** |
| `src/routes/api.version.ts` | present | **file does not exist** |

Both trees currently produce a falsy `APP_SUPABASE_PUBLIC_URL`, but by **different mechanisms** —
canonical delivers the name with an empty value, stale does not deliver the name at all. They agree
on the outcome by coincidence, not by construction.

### Which tree would the autostart task use?

**The stale one.** `C:\AfraKalaServer\get-git-going01lan\start-afrakala-lan.ps1` hardcodes

```powershell
cd "C:\AfraKalaServer\get-git-going01lan\deploy\lan"
docker compose --env-file .env.lan up -d
```

so a re-enabled autostart brings the stack up from the tree that declares **none** of the runtime
names. The task is currently **Disabled**, which is the only reason this has not already happened.

### The risk, named

1. **A reboot would silently downgrade production's configuration.** Both trees build the same
   `image: afrakala-app:lan` and the same `container_name: afrakala-lan-web`, so whichever compose
   runs last owns the container — with no visible difference in `docker ps`. After an autostart-driven
   reboot the app would come back *running and healthy* while `OLLAMA_*`, `WHATSAPP_*`,
   `MARKETING_TASKS_WORKER_TOKEN`, `ISSABEL_*` and `APP_SUPABASE_PUBLIC_URL` had all vanished from the
   container. Those features would fail as "not configured", and the health check — which only probes
   `/api/healthz` — would stay green throughout. **A green stack running a silently reduced
   configuration is the hardest failure mode to notice**, and it is the same shape as the backup task
   that returns 0 while copying nothing.
2. **The autostart task also omits `--no-deps`**, so `db-role-fix` enters the start-up graph. On this
   host that container cannot start (the Docker Desktop mount-layer defect), which per CLAUDE.md takes
   `web` down with it.
3. **Fixing only the canonical tree makes the divergence worse, not better** — it widens the gap
   between the tree a human deploys from and the tree a reboot deploys from. That is why section 4
   specifies the change for **both** trees even though only one is currently in use.

The durable fix is outside this document's scope: one tree, or a start script with no hardcoded path
that points at the canonical one and carries `--no-deps`. Recorded, not proposed for tonight.

---

## Provenance

Everything above was measured read-only on `192.168.170.10` on 2026-09-14 while the production stack
was up and healthy on `afrakala-app:lan` = `8b04c479e022` (`APP_GIT_SHA=d60232f5`). Host toolchain:
Windows PowerShell **5.1.26100.9444** — no `&&`, no ternary, no `??`, and a native command's stderr
produces a false exit 1. No file outside this document was created or modified; no container was
started, stopped, restarted, recreated or tagged; no image was built; the database was not touched.
