# P2 — Stack & architecture (from manifests + code, not README)

Inspected 2026-08-17. Versions from `package.json` unless noted.

## Runtime / UI

| Piece | Actual |
|---|---|
| App name | `tanstack_start_ts` |
| Framework | TanStack Start `^1.167.14` + TanStack Router `^1.168.0` + Vite `^7.3.1` |
| UI | React `^19.2.0` |
| Data fetching | TanStack Query `^5.83.0` |
| Forms | react-hook-form `^7.73.1` + `@hookform/resolvers` + Zod `^4.3.6` |
| Styling | Tailwind `^4.2.1` + Radix/shadcn + CVA + lucide |
| i18n | Ad-hoc Persian (`moment-jalaali`, `lib/i18n/*`) — no i18next |
| Charts | recharts |
| PDF | jspdf, pdfmake, html2canvas |

## Auth / data

| Piece | Actual |
|---|---|
| Auth | `@supabase/supabase-js` `^2.104.1` GoTrue (`signInWithPassword`) |
| ORM | None. PostgREST `.from()` + `.rpc()` + some `createServerFn` |
| Generated types | `src/integrations/supabase/types.ts` PostgrestVersion `14.5` — **not regenerated after invoice drop** |
| DB | Postgres via Supabase. LAN live name from container env (not printed). Migrations through `335_converge_environment_drift` |
| Queue | `automation_jobs` / dummy worker (Phase 0). Torob enqueue exists as guarded job |
| Cache | React Query staleTimes; no Redis in this app |

## Backend-in-frontend

TanStack Start server functions (`createServerFn`) under `src/lib/**/*.functions.ts`. Public HTTP routes under `src/routes/api*.ts` and `src/routes/api/**`. Bot API uses `supabaseAdmin`.

## Test / lint / CI / deploy

| Piece | Actual |
|---|---|
| Typecheck | `tsc --noEmit` (script `typecheck`) |
| Lint | eslint 9 + prettier plugin. `lint` has no `--fix` in the npm script; `format` **does** write (blocked) |
| Unit | only `test:receipt-ocr` |
| E2E | Playwright `^1.62.0` — configs exist; full auth suite can mutate storageState (**blocked**) |
| Deploy | Docker compose `deploy/lan`, `deploy/local`, `deploy/app`; Cloudflare vite plugin present |
| Monitoring | `/api/healthz`, `/api/version`; no Sentry/Datadog in package.json |

## Layer diagram (as-is)

```
Browser (TanStack Router file routes)
  ├─ AuthProvider / session.ts ── GoTrue
  ├─ Route beforeLoad: requirePermission | requireAdmin | requireAnyRole
  ├─ React Query ── supabase-js ── Kong/PostgREST :9000 (LAN) ── Postgres
  │                    └─ RPC SECURITY DEFINER functions
  └─ useServerFn ── TanStack Start server ── user-scoped supabase OR supabaseAdmin
Docker: afrakala-lan-web:3100, afrakala-lan-db, auth, rest, storage, kong
```

There is no hexagonal/clean-architecture package split. Domain folders under `src/lib/{sales,persons,pricing,accounting,...}` mix client queries and serverFns.
