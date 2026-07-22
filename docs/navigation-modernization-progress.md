# Navigation Modernization Progress

Date: 2026-07-23
Branch: feature/navigation-modernization
Starting commit: a22e0984
Host: Windows LAN development host
Base URL: http://192.168.170.8:3100
Test route: /sales/search

## Runtime

Frontend container: afrakala-lan-web
Frontend image: afrakala-app:lan
Runtime mechanism:

```powershell
cd D:\AfraKalaTest\app\deploy\lan
docker compose --env-file .env.lan build web
docker compose --env-file .env.lan up -d web
```

Port 3100 is published by afrakala-lan-web as 0.0.0.0:3100->3000/tcp.

## Stage A Verification

Read-only database checks only. No database write was executed.

- public.staff_daily_performance_metrics: present
- public.dynamic_scoring_parameters counts: customer=10, salesperson=6
- public.v_dynamic_customer_capital_balances: present
- public.v_dynamic_salesperson_capital_balances: present

## Stage B Repository Baseline

Repository root: D:/AfraKalaTest/app
Current branch: feature/navigation-modernization
Remote: origin https://github.com/mohammadrezaafra66-arch/get-git-going.git

Existing untracked files recorded and left untouched:

- .claude/
- AfraKala-continuation-after-audit.md
- AfraKala-data-gamification-rag.md
- AfraKala-navigation-codex-FINAL.md
- AfraKala-weight-fix-continuation.md
- docs/AfraKala-fix-weight-validity.md
- supabase/migrations/20260722230000_142_fix_weight_validity_month_start.sql

## Baseline Commands

`npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` fail locally before running their tools because Bun-generated `.bin` shims are still corrupted.

Repair attempts:

- `bun install --force`: failed in `workerd` postinstall.
- `bun install --force --ignore-scripts`: succeeded, but npm script shims still fail.

Direct validation entrypoints:

- Typecheck: `node .\node_modules\typescript\bin\tsc --noEmit --pretty false`
  - exit code: 2
  - TypeScript error count: 70
  - classification: baseline, zero new navigation errors at start
- Lint: `node .\node_modules\eslint\bin\eslint.js .`
  - exit code: 1
  - problems: 1286 total, 869 errors, 417 warnings
  - classification: baseline formatting/lint debt before navigation edits
- Build: `node .\node_modules\vite\bin\vite.js build`
  - exit code: 0
  - result: pass
- Test script: none exists in package.json.

## Stage B Smoke Gate

- /gamification/admin/manual-metrics: 200
- /accounting/receipts/create: 200
- /sales/invoices: 200
- /sales/search: 200
- /knowledge: 200
- /this-route-does-not-exist-xyz: 404

## Known Risks

- Local npm script wrappers are broken by Bun remap issues. Use direct Node entrypoints for validation unless repaired later.
- Lint has a large pre-existing baseline and must be compared against touched files rather than claimed clean.
- Typecheck baseline is 70 errors.
- Existing untracked docs and one migration belong to other work and must not be staged or modified by navigation phases.
- No database migration may be created or applied during this navigation task.

## Resume Point

Resume at Stage C Phase 1.
