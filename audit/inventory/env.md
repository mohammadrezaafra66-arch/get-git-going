# P0 — Environment & Repository Discovery

**Inspected:** 2026-08-17
**Repo root (product):** `D:/AfraKalaTest/app`
**Workspace wrapper:** `D:/AfraKalaTest` — NOT a meaningful product git repo (outer `.git` previously had no commits / junk dumps). Product truth is `app/`.

## Git

| Fact | Value |
|---|---|
| Branch | `staging` tracking `origin/staging` |
| HEAD | `99f6bd58` 2026-08-15 `Merge pull request #294` |
| Remote | `https://github.com/mohammadrezaafra66-arch/get-git-going.git` |
| Untracked (working tree) | `audit/`, several docs/research files |
| Nested copy | `D:/AfraKalaTest/afrakala-deploy-sidebar/` — sibling snapshot, not this HEAD |

`main` is **behind origin/main by 1687 commits** locally — do not treat local `main` as production truth.

## Shape

Single app (not a JS monorepo). Package name `tanstack_start_ts`. npm is canonical (`package-lock.json`); `bun.lock` also present.

## Runtimes (from manifests, not executed)

- Node/Vite 7 / React 19 / TypeScript 5.8
- TanStack Start + TanStack Router (file routes under `src/routes/`)
- Supabase JS client → self-hosted Postgres + PostgREST + GoTrue
- Docker compose under `deploy/lan`, `deploy/local`, `deploy/supabase`, `deploy/app`, `deploy/proxy`

## Config / env layout

- `.env.example`, `.env.e2e.example`, `.env.production.example`, `.env.staging.example`
- LAN secrets: `deploy/lan/.env.lan` (gitignored — never printed)
- CI: `.github/` last commit 2026-08-11

## Environments (from PROGRESS.md / AGENTS.md — intent docs; runtime not probed this phase)

| Role | Host | Branch | DB name |
|---|---|---|---|
| Test LAN | 192.168.170.8:3100 | staging | `afrakala` |
| Production | 192.168.170.10:3000 | main | `postgres` |

**Never touch production.** Test DB may be introspected read-only later.

## Last-commit dates (top-level of `app/`)

| Dir | Last commit | Classification signal |
|---|---|---|
| src | 2026-08-15 | Active |
| supabase | 2026-08-11 | Active |
| deploy | 2026-08-14 | Active |
| docs | 2026-08-10 | Active |
| e2e | 2026-08-08 | Active |
| scripts | 2026-08-08 | Active |
| server | 2026-08-07 | Active |
| .github | 2026-08-11 | Active |
| public | 2026-08-06 | Active |
| automation | 2026-07-12 | Suspected stale / worker leftover |
| openapi | 2026-06-13 | Stale vs product |
| .cursor | 2026-06-11 | Stale rules (Phase 6 governance leftover) |
| .lovable | 2026-07-18 | Legacy Lovable coupling |
| audit | untracked | This x-ray + prior payments-receipts notes |
| node_modules, .output, .tanstack, .wrangler | generated | Ignore |

## Recent history (50) — theme

Aug 8–15 2026: navigation merge, invoice subsystem retirement, persons merge traps, pricing/settlement display, LAN banner, branch flow `feature → staging → main`.

## Package manager / scripts (package.json)

`dev`, `build`, `preview`, `lint`, `typecheck`, `test:receipt-ocr` only. **No generic `test` script.** Playwright configs exist separately.

## Blocked this phase

Live Docker/DB inspect deferred to P3/P7 (needs env password; classified if denied).
