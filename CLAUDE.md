# AGENTS.md — AfraKala Development Rules

This repository belongs to the AfraKala smart assistant project.

Two agents work in this repo: **Codex** and **Claude Code**. Both read this
file. `CLAUDE.md` is an exact copy so Claude Code picks it up automatically —
**if you edit one, edit the other.**

Before any change, read:
- `PROGRESS.md` — the shared notebook: what the other agent did last (see
  "Coordination" below). Read it *first*.
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
- `README.md`
- `.lovable/plan.md` if present

## Mandatory principles

1. Keep the project self-hostable on Linux + Docker + Supabase Self-host.
2. Do not add critical dependency on CDN, online fonts, external APIs, or non-self-hostable cloud services.
3. External integrations must be optional, feature-flagged, server-side secret safe, and have manual fallback.
4. Never commit real secrets, .env files, service role keys, JWT secrets, passwords, certificates, backups, dumps, or storage exports.
5. No server secret may use VITE_ prefix.
6. Frontend-only authorization is not acceptable.
7. Sensitive features require UI guard, route/server guard, and database RLS/RBAC/backend permission.
8. Database changes require timestamped migrations.
9. Sensitive tables require RLS.
10. Sensitive actions require audit logs.
11. Large queries require limit, pagination, indexes, and debounced search/filter.
12. UI must remain Persian, RTL, mobile-first, and responsive.
13. Fonts and critical assets must be local.
14. Do not create parallel modules, routes, tables, services, hooks, or components if an existing implementation exists.
15. Do not redesign architecture, rename tables/fields, delete code, or refactor broadly unless explicitly approved.
16. Keep every change small, incremental, low-risk, and testable.

## Phase rule

Phase 1 architecture is already implemented/stabilizing.
Future work must extend existing architecture.

Any customer, supplier, account party, receiver, driver, referrer, marketer, representative, complainant, return-related person, staff member, or credit-related person belongs to Phase 2: unified persons core. Do not create separate person systems.

---

## Working environment (LAN test server)

This is the environment day-to-day work happens in. It is **not** the same as
the Cursor Cloud / `deploy/local/` setup documented at the end of this file.

| Fact | Value |
|---|---|
| Working branch | `feature/navigation-modernization` |
| Test server | `192.168.170.8` — all work happens here |
| **Production** | `192.168.170.10` — **never touch it**, for any reason |
| Database | `afrakala`, in container `afrakala-lan-db` |
| Web container | `afrakala-lan-web` (published on port 3100) |
| Deploy scripts | `deploy/lan/build.ps1` then `deploy/lan/up.ps1` |
| Ollama | runs on the Windows host, not in Docker: `http://192.168.170.8:11434` |

After a deploy, confirm the running code is the code you think it is:

```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
```

`APP_GIT_SHA` must equal `git rev-parse --short HEAD`. Expect
`afrakala-lan-db-role-fix` to show `Exited (0)`; every other `afrakala-lan-*`
service must be `Up`.

> Note on PowerShell: `build.ps1` / `up.ps1` and `psql` often return exit code 1
> purely because Windows PowerShell 5.1 treats a native command's stderr as an
> error (progress output, `NOTICE:` lines). Do not read that as failure —
> verify the real outcome independently (image timestamp, `APP_GIT_SHA`, a
> `SELECT`).

## Safety rules for database work

These are not style preferences. Each one exists because breaking it has
already cost this project real damage.

1. **Persian SQL must never go through a PowerShell pipe.** On 2026-07-11 a
   piped migration replaced every non-ASCII byte with `?` and destroyed the
   Persian text inside 44 database functions. Always:
   ```powershell
   docker cp "<path>\<migration>.sql" afrakala-lan-db:/tmp/mig.sql
   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala `
     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig.sql
   ```
   Every migration file starts with `SET client_encoding='UTF8';` and is saved
   as UTF-8 without BOM.
2. **`--single-transaction` + `-v ON_ERROR_STOP=1` always**, so a partial
   failure rolls back instead of leaving the schema half-applied.
3. **No `DROP TABLE`, `TRUNCATE`, or `DELETE` on a table holding data.**
   Permitted: `CREATE OR REPLACE`, `ALTER TABLE ... ADD COLUMN`,
   `CREATE POLICY`, `INSERT`. (`DROP FUNCTION` is fine — see rule 5.)
4. **Before `CREATE OR REPLACE FUNCTION`, read the live definition first**
   (`pg_get_functiondef`) and change only what must change. The database
   sometimes holds an *older* definition than git; re-applying the git version
   wholesale can silently change a signature or behaviour.
5. **Adding a defaulted parameter does not replace a function — it overloads
   it.** The old signature stays, existing calls become ambiguous, and the
   feature breaks at runtime. `DROP FUNCTION` the previous signature in the
   same migration.
6. **Never edit an existing migration file.** Add a new one. Naming:
   `2026MMDD<HHMMSS>_<NNN>_<name>.sql`, continuing the existing number series
   (`ls supabase/migrations | tail`).
7. Test behavioural changes inside `BEGIN … ROLLBACK` with a simulated JWT
   (`SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}'`)
   so nothing is written permanently.
8. Never print a key, password, or token. Report host/port/name only.

## Coordination — Codex ↔ Claude Code

`PROGRESS.md` in the repo root is the shared notebook. It exists so neither
agent undoes the other's work.

- **Before starting:** read `PROGRESS.md` and `git log --oneline -10`.
- **After finishing:** add a row to the top of its history table —
  `date | tool | what changed | commit`.
- Keep `PROGRESS.md` factual and short. Long write-ups belong in `docs/`.
- Commit checkpoints per phase so any single phase can be reverted alone.

---

## Verification

For code changes, run and report:

| Command | Status |
|---|---|
| `bun run build` (or `npm run build`) | must pass |
| `npx tsc --noEmit` | **baseline is 70 pre-existing errors** — your change must not raise it |
| `npm run lint` | fails on a known legacy baseline (~13 prettier errors); CI tolerates it. Only lint files you touched. |
| tests | **there is no test script in this project** — say so rather than implying tests ran |

Take the typecheck baseline *before* you start so you can prove you did not
add to it. If a script does not exist, report that explicitly. Do not claim it
passed.

## Required delivery report

Every delivery must include:
- Files inspected
- Files changed
- Why each file changed
- Migration impact
- RLS/RBAC impact
- Audit log impact
- Build/lint/typecheck/test results
- Manual test path
- Self-Host Acceptance Check
- Remaining risks

Anything only a human can do (browser-only checks, business data entry) must be
listed explicitly as a remaining manual step, not quietly omitted.

---

## Cursor Cloud specific instructions

> **Scope:** this section describes the Cursor Cloud VM and the
> `deploy/local/` stack. It is a *different* environment from the LAN test
> server above — do not mix the two. `deploy/local/` uses Kong on port 8000 and
> containers named `afrakala-local-*`; the LAN server uses port 9000 and
> `afrakala-lan-*`.

Dependencies install automatically on VM startup (`npm install`). Node 22 + npm
is the toolchain (CI uses `npm install`; `bun.lock` also exists but npm is the
canonical path here). Commands live in `package.json`:

- `npm run dev` — Vite dev server (frontend + SSR). It serves on **port 8080**
  (the `@lovable.dev/vite-tanstack-config` plugin forces this), not Vite's
  default 5173.
- `npm run build` — production build (passes).
- `npm run lint` — eslint. It currently **fails on a known legacy baseline**
  (~13 prettier errors); CI explicitly tolerates this (`npm run lint || echo
  "::warning::..."`). Do not "fix" the whole baseline; only lint files you
  touch.
- `npm run typecheck` — `tsc --noEmit`. See the baseline note under
  "Verification". There is still no `test` script.

### Backend: the app requires Supabase

The app is fully auth-gated and reads/writes through Supabase. By default
`vite.config.ts` falls back to a live **cloud** project — do not sign up / write
test data there. For real local development use the self-hosted stack under
`deploy/local/` (Postgres + GoTrue auth + PostgREST + Storage + Kong). See
`deploy/local/README.md` for the canonical commands. Requires Docker (install
once; not part of the update script). Start the daemon with the
fuse-overlayfs + iptables-legacy workaround required in this VM, then bring up
only the backend services: `docker compose --env-file .env.local -f
deploy/local/docker-compose.yml up -d db auth rest storage meta kong` (skip the
heavy `web` image build — run `npm run dev` instead for development).

Non-obvious gotchas (these will silently break the stack if missed):

- **`.env.local` keys must be real JWTs.** `deploy/local/.env.local` needs
  `ANON_KEY`/`SERVICE_ROLE_KEY` that are HS256 JWTs signed with `JWT_SECRET`
  (claims `{"role":"anon"|"service_role","iss":"supabase"}`), and
  `deploy/local/kong.yml` must contain those same key strings (the repo only
  ships `kong.yml.example` with `$SUPABASE_*` placeholders that are NOT
  auto-substituted). `.env.local` and `kong.yml` hold secrets — never commit
  them.
- **DB init scripts fail on a fresh volume.** The `supabase/postgres` image runs
  its own `migrate.sh` (which demotes `postgres` from superuser and loads
  supautils) *before* the repo's `zz-10/zz-20/zz-30` init scripts. As a result
  `zz-10` dies with `"authenticator" is a reserved role, only superusers can
  modify it`, so the service LOGIN roles never get `POSTGRES_PASSWORD` and
  `auth`/`rest`/`storage` crash-loop with `password authentication failed`. Fix
  after first `up`: connect as the superuser `supabase_admin` (password =
  `POSTGRES_PASSWORD`) and re-apply the role-password + jwt + schema bootstrap
  (`ALTER ROLE authenticator/supabase_auth_admin/supabase_storage_admin ...
  PASSWORD <pgpass>`, `ALTER DATABASE postgres SET app.settings.jwt_secret`, and
  `zz-20-afrakala-schemas.sql`), then `docker compose restart auth rest
  storage`. `postgres` cannot do this — it must be `supabase_admin`.
- **Migrations.** Apply all `supabase/migrations/*.sql` in filename order. The
  repo's `deploy/local/scripts/local-apply-migrations.sh` needs host `psql` and
  prompts interactively (`read`); easiest in-VM path is looping the files
  through `docker exec -i afrakala-local-db psql -U postgres -d postgres`.
- **Dev server env.** When running `npm run dev` on the host against the local
  stack, point both `VITE_SUPABASE_URL` and server-side `SUPABASE_URL` at
  `http://localhost:8000` (the published Kong port). The compose-internal
  `http://kong:8000` only resolves inside the Docker network, not from the host
  dev process. Also set `SUPABASE_PUBLISHABLE_KEY`=ANON_KEY and
  `SUPABASE_SERVICE_ROLE_KEY`=SERVICE_ROLE_KEY for SSR/server routes.
- **First admin bootstrap.** New registrations land with `profiles.status =
  'pending'` and do not reliably get a `user_roles` row. To get a working admin,
  set `profiles.status='active'` and `insert into user_roles(user_id, role)
  values (<id>, 'admin')` via SQL. `app_role` enum = admin/manager/sales/
  accountant/viewer.
