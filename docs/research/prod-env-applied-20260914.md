# APP_SUPABASE_PUBLIC_URL added to production's `.env.lan` — run record

**Host:** production laptop `192.168.170.10` · **Date:** 2026-09-14 (14:21 local, +03:30) ·
**Checkout:** `C:\afrakala` on `main @ 9bc8d554` (35 commits behind `origin/main @ c8035d5f`) ·
**Running container:** `afrakala-lan-web`, created `2026-09-13T14:42:54Z`, image `8b04c479e022`,
`/api/version` commit `d60232f5`

This is the applied follow-up to `docs/research/release-line/prod-env-gap-20260914.md`
(branch `feature/prod-env-gap`, commit `5f03e15c`). That plan was written **before** PR #449 merged
into main at `0b7e175e` and concluded only one of the three keys is read at runtime. **That
conclusion is superseded** — see section 1.

**What changed:** two ASCII lines appended to one git-ignored file. **What did not change:** no
container was started, stopped, restarted or recreated; no image was built, loaded or tagged; no
tracked file other than this record was edited; no scheduled task was touched; the database was not
touched; `C:\AfraKalaServer\get-git-going01lan` was not touched.

---

## ⚠️ Hard prerequisites for the release

Both must be true before the release's `docker compose up -d`:

1. **`APP_SUPABASE_PUBLIC_URL` must be in `.env.lan`.** Done by this run (section 3).
2. **The release MUST git pull main BEFORE docker compose up -d. Until it does, this tree's compose
   passes VITE_APP_ENV and VITE_TRUSTED_HOSTS only as build args, so a container created from the
   current compose would render the test banner and the wrong trusted-host list even with a correct
   image.**

The compose file was deliberately **not** hand-edited here: it is tracked, and a local edit would
make the release's `git pull` refuse ("local changes would be overwritten") and block the deploy.
main's compose already carries the correct lines (55-56), so the pull is the fix.

---

## 1 · What main reads at runtime (verified at `origin/main`, not taken on trust)

`src/lib/runtime-config.ts @ origin/main` — `readServerRuntimeConfig()` reads `process.env`:

```
 88      env?.APP_SUPABASE_PUBLIC_URL ||
 89      env?.VITE_SUPABASE_URL ||
 90      env?.SUPABASE_URL ||
100    appEnv: env?.APP_PUBLIC_ENV || env?.VITE_APP_ENV || undefined,
101    trustedHosts: env?.APP_TRUSTED_HOSTS || env?.VITE_TRUSTED_HOSTS || undefined,
```

main's `web` environment block declares no `VITE_SUPABASE_URL`, so with `APP_SUPABASE_PUBLIC_URL`
empty the browser is handed `SUPABASE_URL` = `http://kong:8000`, a compose-internal name.

`deploy/lan/docker-compose.yml`, service `web`:

| key | `origin/main` (`c8035d5f`) | this tree (`9bc8d554`) |
|---|---|---|
| `APP_SUPABASE_PUBLIC_URL` | `environment:` line 67 | `environment:` line 61 |
| `VITE_APP_ENV` | `environment:` line 55 — removed from `build: args:` (comment at line 37) | **`build: args:` line 38 only** |
| `VITE_TRUSTED_HOSTS` | `environment:` line 56 — removed from `build: args:` | **`build: args:` line 39 only** |

This gap is prerequisite 2 above.

## 2 · Before the change (measured)

```
docker exec afrakala-lan-web  APP_SUPABASE_PUBLIC_URL   present, value=[]
                              VITE_APP_ENV              NOT present
                              VITE_TRUSTED_HOSTS        NOT present
docker exec afrakala-lan-web printenv SUPABASE_URL   -> http://kong:8000
GET /api/version -> "commit":"d60232f5", "supabasePublicUrl":"unknown"

.env.lan  line 65  VITE_APP_ENV=production
          line 66  VITE_TRUSTED_HOSTS=192.168.170.10,localhost
          APP_SUPABASE_PUBLIC_URL   0 occurrences
```

`.env.lan` shape before: 3195 bytes, 73 lines, 73 CR / 73 LF (all CRLF), no BOM (first bytes
`23 20 41`), ends with CRLF, md5 `d60ed45471503426bcf0e2ceffef5fed`. Three lines contain non-ASCII
bytes (the earlier plan recorded 0; irrelevant to an ASCII append, recorded for accuracy). Contents
other than the three URL/env keys were not printed.

### The address — what was and was not verified

`http://192.168.170.10:8000` is **inferred**. Verified on this laptop, read-only:

- `afrakala-lan-kong` `Up 46 hours (healthy)`, published `0.0.0.0:8000->8000/tcp`; `netstat` shows
  `0.0.0.0:8000 LISTENING`.
- Interface `Ethernet` = `192.168.170.10/24` (also present: Wi-Fi `192.168.1.43`, WSL `172.28.112.1`).
- From this laptop: `GET http://192.168.170.10:8000/auth/v1/health` -> HTTP 200.
- The running image already has `192.168.170.10:8000` baked into 4 files of `/app/.output` and
  `kong:8000` in none of `/app/.output/public` — so browsers use this address with today's image.

**NOT verified:** that staff browsers reach Kong at `http://192.168.170.10:8000` directly, rather than
through a proxy, another name, or the Wi-Fi network. Only this laptop was tested. **This is the
owner's to confirm.**

## 3 · The change

Backup, taken first and verified:

```
C:\afrakala\deploy\lan\.env.lan.bak-20260914-142130   Length 3195
src md5 D60ED45471503426BCF0E2CEFFEF5FED
bak md5 D60ED45471503426BCF0E2CEFFEF5FED
```

(`deploy/lan/.env.lan.*` is git-ignored, `.gitignore:92`.)

Append (Windows PowerShell 5.1, CRLF, no BOM):

```powershell
Add-Content -Path "C:\afrakala\deploy\lan\.env.lan" -Encoding ascii -Value @(
  "# --- 2026-09-14 - browser-reachable Supabase (Kong) URL, read at runtime. Never http://kong:8000.",
  "APP_SUPABASE_PUBLIC_URL=http://192.168.170.10:8000"
)
```

`VITE_APP_ENV` and `VITE_TRUSTED_HOSTS` were already present and correct, so they were not re-added
(a duplicate key is last-wins).

Proof the change is additions only:

```
bytes 3195 -> 3347 · CR 75 / LF 75 · first bytes 23 20 41 (no BOM) · last bytes \r \n
cmp -n 3195 backup .env.lan -> identical (the original bytes are untouched)

diff .env.lan.bak-20260914-142130 .env.lan
73a74,75
> # --- 2026-09-14 - browser-reachable Supabase (Kong) URL, read at runtime. Never http://kong:8000.  [CRLF]
> APP_SUPABASE_PUBLIC_URL=http://192.168.170.10:8000  [CRLF]

occurrences: APP_SUPABASE_PUBLIC_URL 1 · VITE_APP_ENV 1 · VITE_TRUSTED_HOSTS 1
```

## 4 · After the change — what did and did not change

`docker compose ... config` (output filtered to these keys; the unfiltered output contains secrets):

```
A. this tree's compose (9bc8d554)
  web:
      args:
        VITE_APP_ENV: production
        VITE_TRUSTED_HOSTS: 192.168.170.10,localhost
    environment:
      APP_SUPABASE_PUBLIC_URL: http://192.168.170.10:8000
      SUPABASE_URL: http://kong:8000

B. origin/main's compose (c8035d5f) via stdin, same .env.lan, --project-directory deploy/lan
  web:
    environment:
      APP_SUPABASE_PUBLIC_URL: http://192.168.170.10:8000
      SUPABASE_URL: http://kong:8000
      VITE_APP_ENV: production
      VITE_TRUSTED_HOSTS: 192.168.170.10,localhost
```

B is what the release gets **after** `git pull`: all three resolve under `environment:`. A is why
prerequisite 2 exists.

The running container, re-measured after the append:

```
APP_SUPABASE_PUBLIC_URL: present, value=[]       <- still empty
VITE_APP_ENV: NOT present
VITE_TRUSTED_HOSTS: NOT present
Created=2026-09-13T14:42:54.541975421Z  Image=sha256:8b04c479e022...
afrakala-lan-web | Up 20 hours (healthy)
GET /api/version -> "commit":"d60232f5", "supabasePublicUrl":"unknown"
```

**The running app is unaffected.** Compose resolves `.env.lan` in the client and freezes the result
into the container's `Config.Env` at create time; nothing re-reads the file until the container is
recreated. That is why this was safe to do before the release rather than during it. The value goes
live at the release's `up -d --no-deps --build web`, after the `git pull`.

Expected after the release: `printenv APP_SUPABASE_PUBLIC_URL` -> `http://192.168.170.10:8000`,
`/api/version` -> `"supabasePublicUrl":"http://192.168.170.10:8000"`, and `VITE_APP_ENV` /
`VITE_TRUSTED_HOSTS` present in the container.

## 5 · The two trees are now further apart

`C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan` was **not** touched. Its compose does not
declare these keys and its autostart task is Disabled (both per the earlier plan; not re-measured in
this run). Changing it is a separate decision. The canonical tree now supplies
`APP_SUPABASE_PUBLIC_URL`; the stale tree still lacks it along with `VITE_APP_ENV`,
`VITE_TRUSTED_HOSTS` and the compose declarations. Anything that brings the stack up from the stale
tree would lose all of them.

## 6 · Notes only — no action taken

- `.env.lan` does not contain `WHATSAPP_PLATFORM_BASE_URL`, `WHATSAPP_TOP_PRODUCTS_LIMIT`,
  `MARKETING_TASKS_WORKER_TOKEN`, or `ISSABEL_CDR_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_DB` /
  `ISSABEL_IMPORT_WORKER_TOKEN`, all of which main's `web` environment block reads at runtime. **Only
  names were checked.** Whether their compose defaults (empty, or
  `WHATSAPP_PLATFORM_BASE_URL=http://192.168.170.8:8002`, `ISSABEL_CDR_PORT=3306`) are acceptable on
  production was **NOT verified** in this run.
- `LOVABLE_API_KEY` and `OLLAMA_API_KEY` are present but empty (names checked, values not printed).
- `PROGRESS.md` was deliberately not edited on this branch: it is based on `main @ 9bc8d554`, 35
  commits behind `origin/main`, and a top-of-table row would conflict when merged. Add the row at
  merge time.

## Rollback

```powershell
Copy-Item "C:\afrakala\deploy\lan\.env.lan.bak-20260914-142130" "C:\afrakala\deploy\lan\.env.lan" -Force
```

Before the release recreates the container, this has no runtime effect either way.
