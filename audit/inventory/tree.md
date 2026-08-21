# P1 — Macro map (levels 1–2)

Inspected 2026-08-17 against `D:/AfraKalaTest/app` HEAD `99f6bd58` on `staging`.

## Workspace vs product

| Path | Purpose | Layer | Last commit | Size signal | Status |
|---|---|---|---|---|---|
| `D:/AfraKalaTest` | Wrapper: dumps, backups, nested copies | infra/junk | n/a | large untracked | Not product truth |
| `D:/AfraKalaTest/app` | AfraKala ERP product | full stack | 2026-08-15 | ~702 `src` files, 523 SQL migrations | **Active** |
| `D:/AfraKalaTest/afrakala-deploy-sidebar` | Sibling snapshot | copy | unknown | — | Do not audit as HEAD |

## Product tree (level 1–2)

| Directory | Purpose | Layer | Last commit | Approx | Status |
|---|---|---|---|---|---|
| `src/routes` | TanStack file routes (~210 `createFileRoute`) | frontend + HTTP API | 2026-08-15 | 189+ tsx/ts | Active |
| `src/components` | UI (layout, domain widgets, shadcn/ui) | frontend | 2026-08-15 | large | Active |
| `src/lib` | Domain services, serverFns, RBAC, nav, pricing, persons, sales | frontend+backend-in-app | 2026-08-15 | large | Active |
| `src/hooks` | React Query hooks (38 files) | frontend | 2026-08-15 | 38 | Active |
| `src/integrations/supabase` | Client, generated `types.ts`, auth middleware | data | 2026-08-15 | types.ts ~13k lines **stale vs live schema** | Active + drift |
| `src/server` | Bot API helpers | backend | 2026-08-07 | small | Active |
| `supabase/migrations` | Numbered SQL 1–335 | db | 2026-08-11 | 523 files | Active |
| `deploy/` | LAN/local/prod compose, nginx | infra | 2026-08-14 | | Active |
| `e2e/` | Playwright | qa | 2026-08-08 | | Active |
| `docs/` | Missions, PROGRESS, acceptance | intent-only | 2026-08-10 | | Active docs, not behavior |
| `scripts/` | route regen etc. | tooling | 2026-08-08 | | Active |
| `server/` | Node preview entry | infra | 2026-08-07 | | Active |
| `.github/` | CI | ci | 2026-08-11 | | Active |
| `automation/` | leftover worker notes | ? | 2026-07-12 | | **Suspected stale** |
| `openapi/` | spec snapshot | docs | 2026-06-13 | | **Stale** |
| `.cursor/` | old Phase 6 rules | meta | 2026-06-11 | | Legacy |
| `.lovable/` | Lovable coupling | legacy | 2026-07-18 | | Legacy |
| `audit/` | this x-ray + payments-receipts notes | meta | untracked | | This audit |

## Conceptual system

Authenticated ERP (Persian RTL) for a trading company: catalog + pricing board, sales quotes (not invoices), persons/customers/suppliers, accounting receipts/AR/AP, messenger inquiries, gamification, Asan accounting export, Didar CRM import, bot/public APIs.

**Architecture in practice:** browser React app talks to self-hosted Supabase (PostgREST + GoTrue + Postgres RPCs). A minority of writes go through TanStack `createServerFn` (user JWT). Almost no separate Nest/Django API.
