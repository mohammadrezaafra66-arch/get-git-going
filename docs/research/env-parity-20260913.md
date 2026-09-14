# `.env.lan` parity · two production trees · 2026-09-13

> Read-only. Gathered on `192.168.170.10` with staff working. No writes, no restarts, no deploy, no
> git state changed — only `git rev-parse` / `status` / `log` reads.
>
> **No value from either file is printed anywhere in this document.** Presence is reported as
> `set (len=N)`; differing values as length plus an 8-character md5 prefix.

- **A** = `C:\afrakala\deploy\lan\.env.lan` — the tree tonight's deploy ran from
- **B** = `C:\AfraKalaServer\get-git-going01lan\deploy\lan\.env.lan` — **the tree the running
  containers were actually created from** (every container carries
  `com.docker.compose.project.config_files = C:\AfraKalaServer\get-git-going01lan\deploy\lan\docker-compose.yml`)

```
A keys : 40
B keys : 38
union  : 40
```

## Key-by-key

| key | in A | in B | same? |
|---|---|---|---|
| ADDITIONAL_REDIRECT_URLS | set (len=48) | set (len=48) | same |
| ANON_KEY | set (len=169) | set (len=169) | same |
| API_EXTERNAL_URL | set (len=26) | set (len=26) | same |
| APP_PORT | set (len=4) | set (len=4) | same |
| DASHBOARD_PASSWORD | set (len=8) | set (len=8) | same |
| DASHBOARD_USERNAME | set (len=5) | set (len=5) | same |
| DISABLE_SIGNUP | set (len=5) | set (len=5) | same |
| ENABLE_EMAIL_AUTOCONFIRM | set (len=5) | set (len=5) | same |
| ENABLE_EMAIL_SIGNUP | set (len=4) | set (len=4) | same |
| HOST | set (len=7) | set (len=7) | same |
| JWT_EXPIRY | set (len=4) | set (len=4) | same |
| JWT_SECRET | set (len=64) | set (len=64) | same |
| LAN_HOST_IP | set (len=14) | set (len=14) | same |
| LOVABLE_API_KEY | set (len=0) | set (len=0) | same |
| NODE_ENV | set (len=10) | set (len=10) | same |
| **OCR_ENABLED** | set (len=4) | set (len=5) | **DIFFERENT** |
| PORT | set (len=4) | set (len=4) | same |
| POSTGRES_DB | set (len=8) | set (len=8) | same |
| POSTGRES_PASSWORD | set (len=32) | set (len=32) | same |
| POSTGRES_PORT | set (len=4) | set (len=4) | same |
| POSTGRES_USER | set (len=8) | set (len=8) | same |
| SERVICE_ROLE_KEY | set (len=180) | set (len=180) | same |
| SITE_URL | set (len=26) | set (len=26) | same |
| SMTP_ADMIN_EMAIL | set (len=0) | set (len=0) | same |
| SMTP_HOST | set (len=0) | set (len=0) | same |
| SMTP_PASS | set (len=0) | set (len=0) | same |
| SMTP_PORT | set (len=3) | set (len=3) | same |
| **SMTP_SENDER_NAME** | set (len=206) | set (len=42) | **DIFFERENT** |
| SMTP_USER | set (len=0) | set (len=0) | same |
| SUPABASE_ANON_KEY | set (len=0) | set (len=0) | same |
| SUPABASE_API_PORT | set (len=4) | set (len=4) | same |
| SUPABASE_PUBLISHABLE_KEY | set (len=169) | set (len=169) | same |
| SUPABASE_SERVICE_KEY | set (len=180) | set (len=180) | same |
| SUPABASE_SERVICE_ROLE_KEY | set (len=180) | set (len=180) | same |
| SUPABASE_URL | set (len=16) | set (len=16) | same |
| **VITE_APP_ENV** | set (len=10) | **absent** | – |
| VITE_SUPABASE_PROJECT_ID | set (len=12) | set (len=12) | same |
| VITE_SUPABASE_PUBLISHABLE_KEY | set (len=169) | set (len=169) | same |
| VITE_SUPABASE_URL | set (len=26) | set (len=26) | same |
| **VITE_TRUSTED_HOSTS** | set (len=24) | **absent** | – |

## The three lists

### Keys only in A (`C:\afrakala`)

```
VITE_APP_ENV        (len=10)
VITE_TRUSTED_HOSTS  (len=24)
```

### Keys only in B (`C:\AfraKalaServer\...`)

```
(none)
```

### Keys in both with different values

```
OCR_ENABLED       A(len=4 md5=b326b506)   B(len=5 md5=68934a3e)
SMTP_SENDER_NAME  A(len=206 md5=31444f85) B(len=42 md5=d8d68c39)
```

## Reading the two differences

**`OCR_ENABLED` — a length of 4 against 5 is self-disclosing for a boolean.** Those two md5
prefixes are the well-known hashes of the two boolean literals, so masking cannot hide the
direction and it would be misleading to pretend otherwise: **A enables OCR, B disables it.** Since
the running containers were created from **B**, receipt OCR is switched off in the stack that is
serving right now.

That is the **third independent** reason receipt OCR does not work on production, and the other two
were already recorded:

1. the pinned `ollama` provider declares `capabilities = {chat,embeddings}` — no `vision`
   (migration 522 reports this rather than changing it);
2. the running container has **no `OLLAMA_*` variables at all** (`env | grep -c OLLAMA` = 0),
   because B's `docker-compose.yml` never passes them;
3. and now: `OCR_ENABLED` is off in B.

Fixing any one of these alone would not turn OCR on.

**`SMTP_SENDER_NAME` — 206 bytes against 42.** A sender name of 206 bytes is unusual. It is
plausibly a Persian string (UTF-8 inflates the byte count) but it is also the shape of a value that
has swallowed something it should not have — a stray newline, or the next line of the file. **Worth
opening by eye once**, which is not something this report should do for you. Both SMTP transport
keys (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`) are empty in **both** trees, so
nothing is being sent either way and this is cosmetic until mail is configured.

**Everything that matters for connectivity is identical**, which is why the running stack works at
all: `JWT_SECRET` (64), `ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`
(169), `SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (180),
`POSTGRES_PASSWORD` (32), and every URL and port. The two trees disagree on two settings and two
`VITE_` keys, not on credentials.

> **The `.env.lan` drift is the small half of the problem.** The `docker-compose.yml` drift is the
> large half: B's compose file never passes `ISSABEL_CDR_*`, `ISSABEL_IMPORT_WORKER_TOKEN`,
> `OLLAMA_*`, `WHATSAPP_*`, `MARKETING_TASKS_WORKER_TOKEN`, the Kong header buffers, or the
> `GIT_SHA`/`BUILD_TIME`/`APP_ENV`/`VITE_*` build args, and it does not define the `caddy` HTTPS
> service. Measured inside the live container: `ISSABEL*` 0, `OLLAMA*` 0, `WHATSAPP*` 0,
> `MARKETING*` 0; no `afrakala-lan-caddy` container; nothing listening on 443.

## Git state of the two trees

| | `C:\afrakala` (A) | `C:\AfraKalaServer\get-git-going01lan` (B) |
|---|---|---|
| branch | **`main`** | **`fix/auth-user-profile-trigger`** |
| HEAD | `d60232f5` | `69d78c68` |
| HEAD date | 2026-09-12 | **2026-05-30** |
| last commit | `525: close anon on the five DEFINER views that bypass RLS (#438)` | `fix: create auth user profile trigger` |
| `git status --porcelain \| wc -l` | **1** | **38** |
| remote | `github.com/mohammadrezaafra66-arch/get-git-going` | same |

A's single dirty path is `docs/research/owner-prep-20260913.md`, written earlier today; this file
makes it two. Nothing else in A is modified.

### 🔴 B is not a stale copy of a release branch — it is a working copy

**The production container stack is configured from a feature-branch checkout, three and a half
months old, with 38 uncommitted paths.** Its `HEAD` is dated **2026-05-30**, and none of tonight's
migrations exist in it:

```
ABSENT : 20260908120000_522_pin_receipt_ocr_by_name_supersedes_460.sql
ABSENT : 20260912140000_523_close_anon_table_grants_for_production_shape.sql
ABSENT : 20260912150000_525_close_anon_on_definer_views.sql
```

(The `commits behind origin/main` count inside B reads 0, but B's own `origin/main` ref is stale —
it has not fetched. The reliable figure is the commit date.)

Its branch name is worth noting: `fix/auth-user-profile-trigger` is the very subject of a defect
found independently during Block 72a — `on_auth_user_created` and `on_auth_user_created_afrakala`
are two triggers bound to the same function, so every signup writes two `user_registered` audit
rows. Someone was working on exactly that, in this tree, and stopped.

### What the 38 uncommitted paths contain

Six modified source files — `src/integrations/supabase/types.ts`, `src/lib/pricing/constants.ts`,
`src/lib/pricing/schemas.ts`, `src/routes/_app.pricing.purchase-prices.tsx`,
`src/routes/_app.pricing.sale-lists_.new.tsx`, `src/shared/components/PurchaseForm.tsx` — plus 32
untracked files. **Three groups of those deserve attention, and none of them was opened:**

1. **Five extra copies of the production secrets.**
   `deploy/lan/.env.lan.bak-20260814`, `.env.lan.before-ip-fix-20260527-011553`,
   `.env.lan.before-secret-sync`, `.env.lan.before-sync`, `.env.lan.working-after-login-fix` —
   each a full copy of the same JWT secret, service-role key and database password, untracked, on
   disk, in the directory the autostart task runs from.
2. **Auth API payloads, which normally carry passwords.** `create-admin-user.json`,
   `create-main-user.json`, `create-torabi-user.json`, `update-main-user.json`,
   `admin-update-user.json`, `auth-test.json`, `auth-test-main.json`, `auth-test-new-admin.json`,
   and `repair-auth.sql`. These are the shape of GoTrue admin-API bodies — the same call Block 72a
   used, which required a plaintext password in the body. **Not read; flagged by filename only.**
3. **Database dumps and backup machinery living in the tree.**
   `before-restore-current.dump`, `afrakala-working-after-login-fix.dump`, `backups/`,
   `_runtime-backup-5khordad/`, and — importantly — **the scripts the five scheduled tasks run**:
   `start-afrakala-lan.ps1`, `backup-afrakala-lan.ps1`, `backup-afrakala-heavy-weekly.ps1`,
   `AfraKala-AutoBackup.ps1`, plus `Start_ManualBackup.bat` and `Start_Bot_FullBackup.bat`.

That last point closes a loop from the earlier prep pack: **every scheduled task on this machine
runs a script that exists only as an untracked file in this one working copy.** That is why none of
them appears in `C:\afrakala`, why the two failing backup tasks (`AfraKala LAN Nightly Backup`
result=1 today, `AfraKala LAN Weekly Heavy Backup` result=1 on 09-11) cannot be reviewed from the
repository, and why a fresh clone of `main` would not reproduce this host's behaviour at all.

## What follows from this

Nothing here was changed, and none of it is urgent tonight — the app is serving, the credentials
match, and `APP_GIT_SHA` still equals `main`'s HEAD because the SHA is baked into the image rather
than injected by compose.

The decisions this hands over, in the order they cost least:

1. **Point the autostart task at `C:\afrakala`** (with `--no-deps`), or delete it — the
   `unless-stopped` restart policies already restore the stack without it. Until this happens, every
   reboot re-applies B's configuration and silently strips `ISSABEL_*`, `OLLAMA_*`, `WHATSAPP_*` and
   `MARKETING_*` from the container, exactly as it did at 16:43 today.
2. **Decide what `C:\AfraKalaServer\get-git-going01lan` is for.** If it is retired, the five secret
   copies and the auth payload files should go with it. If it is the real operational home of the
   scheduled-task scripts, those scripts belong in the repository under `deploy/lan/`, and this
   host should stop having two checkouts that both drive the same compose project.
3. **`OCR_ENABLED` is off in the running stack.** Whatever the decision on OCR, it should be made
   once, in one file, not differ between two trees.
