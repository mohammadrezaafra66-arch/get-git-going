# AGENTS.md — AfraKala Development Rules

This repository belongs to the AfraKala smart assistant project.

Before any change, read:
- docs/AFRAKALA_ACCEPTANCE_CRITERIA.md
- README.md
- .lovable/plan.md if present

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

## Verification

For code changes, run and report:
- npm run build
- npm run lint
- typecheck if an independent script exists
- relevant tests if available
- manual test path if UI changed

If a script does not exist, report that explicitly. Do not claim it passed.

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

## Cursor Cloud specific instructions

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
- There is no `test` or independent `typecheck` script.

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